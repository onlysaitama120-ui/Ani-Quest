import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { searchAnime, searchManga } from '../api';
import { MediaGrid, GridSkeleton, ErrorState } from '../components/Grid';
import { cleanInt } from '../api';

const KIND_TABS = [
  { value: 'anime', label: 'Anime' },
  { value: 'manga', label: 'Manga' },
];

const TYPE_OPTIONS = {
  anime: ['', 'tv', 'movie', 'ova', 'ona', 'special'],
  manga: ['', 'manga', 'novel', 'lightnovel', 'oneshot'],
};

const STATUS_OPTIONS = {
  anime: ['', 'airing', 'complete', 'upcoming'],
  manga: ['', 'publishing', 'complete', 'upcoming', 'hiatus', 'discontinued'],
};

const ORDER_OPTIONS = {
  anime: ['score', 'members', 'title', 'start_date', 'end_date', 'rank'],
  manga: ['score', 'members', 'title', 'chapters', 'volumes'],
};

const YEARS = [];
for (let y = 2026; y >= 1980; y--) YEARS.push(y);

function Labeled({ label, children }) {
  return (
    <label className="filter-field">
      <span className="filter-label">{label}</span>
      {children}
    </label>
  );
}

export default function Search() {
  const [params, setParams] = useSearchParams();
  const [input, setInput] = useState(params.get('q') ?? '');

  // Read filters from URL (validated via whitelist inside api.js)
  const kind = params.get('kind') === 'manga' ? 'manga' : 'anime';
  const q = params.get('q') ?? '';
  const type = params.get('type') ?? '';
  const status = params.get('status') ?? '';
  const year = params.get('year') ?? '';
  const orderBy = params.get('order_by') ?? 'score';
  const sort = params.get('sort') ?? 'desc';
  const page = cleanInt(params.get('page'), 1, 1000, 1);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const hasFilters = q || type || status || year;

  const update = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => {
      if (v === '' || v == null) next.delete(k);
      else next.set(k, v);
    });
    next.delete('page'); // reset pagination on filter change
    setParams(next, { replace: true });
  };

  const onSearch = (e) => {
    e.preventDefault();
    update({ q: input.trim() });
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setData(null);

    const filters = {
      q,
      type,
      status,
      year,
      orderBy,
      sort,
      page,
    };

    const promise = kind === 'anime' ? searchAnime(filters) : searchManga(filters);

    promise
      .then((res) => active && setData(res))
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));

    return () => { active = false; };
  }, [kind, q, type, status, year, orderBy, sort, page]);

  const pagination = useMemo(() => {
    const paginationInfo = data?.pagination;
    return paginationInfo ? { hasNext: paginationInfo.has_next_page, last: paginationInfo.last_visible_page } : { hasNext: false, last: 1 };
  }, [data]);

  const goPage = (p) => {
    const next = new URLSearchParams(params);
    next.set('page', String(cleanInt(p, 1, 1000, 1)));
    setParams(next, { replace: true });
  };

  return (
    <div className="page-search fade-in">
      <h1 className="page-title">Search</h1>
      <p className="muted page-sub">Find any anime or manga — from classics to this week's episodes.</p>

      {/* Kind tabs */}
      <div className="chips" style={{ margin: '18px 0' }}>
        {KIND_TABS.map((k) => (
          <button
            key={k.value}
            className={`chip${kind === k.value ? ' active' : ''}`}
            onClick={() => update({ kind: k.value })}
          >
            {k.label}
          </button>
        ))}
      </div>

      {/* Search box */}
      <form className="search-box" onSubmit={onSearch} role="search">
        <span className="search-box-icon">🔎</span>
        <input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={kind === 'anime' ? 'Search anime… e.g. Attack on Titan' : 'Search manga… e.g. One Piece'}
          maxLength={64}
          aria-label="Search"
        />
        <button type="submit" className="btn btn-primary">Search</button>
      </form>

      {/* Filters */}
      <div className="filters">
        <Labeled label="Type">
          <select value={type} onChange={(e) => update({ type: e.target.value })}>
            {TYPE_OPTIONS[kind].map((t) => (
              <option key={t || 'any'} value={t}>{t ? t.toUpperCase() : 'Any type'}</option>
            ))}
          </select>
        </Labeled>

        <Labeled label="Status">
          <select value={status} onChange={(e) => update({ status: e.target.value })}>
            {STATUS_OPTIONS[kind].map((s) => (
              <option key={s || 'any'} value={s}>{s ? s[0].toUpperCase() + s.slice(1) : 'Any status'}</option>
            ))}
          </select>
        </Labeled>

        <Labeled label="Year">
          <select value={year} onChange={(e) => update({ year: e.target.value })}>
            <option value="">Any year</option>
            {YEARS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </Labeled>

        <Labeled label="Sort by">
          <select value={orderBy} onChange={(e) => update({ order_by: e.target.value })}>
            {ORDER_OPTIONS[kind].map((o) => (
              <option key={o} value={o}>{o.replace('_', ' ')}</option>
            ))}
          </select>
        </Labeled>

        <Labeled label="Order">
          <select value={sort} onChange={(e) => update({ sort: e.target.value })}>
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </Labeled>
      </div>

      {/* Results */}
      <div className="results">
        {!hasFilters && !loading && !data && (
          <p className="muted center" style={{ padding: '40px 0' }}>
            Type a title above or pick a filter to get started.
          </p>
        )}

        {loading && <GridSkeleton />}

        {error && !loading && <ErrorState message={error} onRetry={() => window.location.reload()} />}

        {!loading && !error && data && (
          <>
            {data.data.length === 0 ? (
              <p className="muted center" style={{ padding: '40px 0' }}>
                No results found for “{q}”. Try fewer filters.
              </p>
            ) : (
              <MediaGrid items={data.data} kind={kind} />
            )}

            {(pagination.hasNext || page > 1) && (
              <div className="pager">
                <button className="btn btn-ghost" disabled={page <= 1} onClick={() => goPage(page - 1)}>
                  ← Prev
                </button>
                <span className="muted">Page {page} of {pagination.last}</span>
                <button className="btn btn-ghost" disabled={!pagination.hasNext} onClick={() => goPage(page + 1)}>
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}