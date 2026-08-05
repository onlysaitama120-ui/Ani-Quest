import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getAnime, getManga, getAnimeCharacters } from '../api';
import ICONS from '../components/Icons';
import { useWatchlist } from '../context/WatchlistContext';
import MediaCard from '../components/MediaCard';

function Stats({ label, value }) {
  return value ? (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  ) : null;
}

export default function Detail() {
  const { kind, id } = useParams();
  const isAnime = kind === 'anime';
  const [item, setItem] = useState(null);
  const [chars, setChars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { is: isSaved, toggle } = useWatchlist();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setItem(null);
    setChars([]);

    const main = isAnime ? getAnime(id) : getManga(id);

    main
      .then((m) => {
        if (!active) return;
        const data = m?.data ?? null;
        if (!data) {
          setError('Could not load this title.');
          setLoading(false);
          return;
        }
        setItem(data);
        // AniList embeds characters; Jikan does not (fetch separately).
        if (Array.isArray(data.characters) && data.characters.length) {
          setChars(data.characters);
        } else {
          getAnimeCharacters(id).then((c) => active && setChars((c?.data ?? []).slice(0, 10)));
        }
        setLoading(false);
      })
      .catch(() => active && setError('Could not load this title.'));
    return () => { active = false; };
  }, [isAnime, id]);

  if (loading) {
    return (
      <div className="page-detail fade-in">
        <div className="detail-hero skeleton" style={{ height: 300 }} />
        <div className="spinner" />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="page-detail center" style={{ padding: '60px 0' }}>
        <p className="muted">{error || 'Title not found.'}</p>
        <Link to="/" className="btn btn-ghost" style={{ marginTop: 16 }}>
          {ICONS.arrowLeft} Back home
        </Link>
      </div>
    );
  }

  const saved = isSaved(item.mal_id, kind);
  const image = item.images?.jpg?.large_image_url || item.images?.jpg?.image_url;
  const synopsis = item.synopsis || '';
  const genres = item.genres ?? [];
  const studios = item.studios ?? [];
  const title = item.title || 'Untitled';
  const score = item.score;
  const type = item.type;
  const status = item.status;
  const year =
    item.year ||
    item.aired?.prop?.from?.year ||
    item.published?.prop?.from?.year ||
    '';
  const episodes = item.episodes ?? item.chapters;
  const duration = item.duration;
  const members = item.members;
  const rank = item.rank;

  // Related titles (from the detail response when present)
  const related = [];
  const relations = item.relations ?? [];
  for (const rel of relations) {
    for (const entry of rel.entry ?? []) {
      const rkind = entry.type === 'manga' ? 'manga' : 'anime';
      related.push({
        mal_id: entry.mal_id,
        title: entry.name,
        type: entry.type,
        kind: rkind,
        images: entry.images ?? { jpg: {} },
      });
    }
    if (related.length >= 8) break;
  }

  return (
    <article className="page-detail fade-in">
      {/* Hero */}
      <div
        className="detail-hero"
        style={image ? { backgroundImage: `linear-gradient(180deg, rgba(15,12,9,0.35), var(--bg) 90%), url("${image}")` } : {}}
      >
        <div className="detail-hero-inner">
          {image && (
            <img className="detail-poster" src={image} alt={title} referrerPolicy="no-referrer" />
          )}
          <div className="detail-head">
            <div className="detail-kicker">
              {type} · {status} · {year || '—'}
            </div>
            <h1 className="detail-title">{title}</h1>
            {item.title_english && item.title_english !== title && (
              <div className="muted">{item.title_english}</div>
            )}
            <div className="detail-actions">
              {score != null && (
                <span className="detail-score">{ICONS.star} {score.toFixed(1)}</span>
              )}
              <button
                className={`btn ${saved ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => toggle(item, kind)}
                aria-pressed={saved}
              >
                {saved ? ICONS.bookmark : ICONS.bookmarkOutline}
                {saved ? 'Saved' : 'Save'}
              </button>
              {item.url && (
                <a className="btn btn-ghost" href={item.url} target="_blank" rel="noopener noreferrer">
                  MyAnimeList {ICONS.external}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="detail-body">
        {/* Left column: stats + genres */}
        <div className="detail-side">
          <div className="stats-card">
            <Stats label="Type" value={type} />
            <Stats label="Status" value={status} />
            <Stats label="Year" value={year} />
            <Stats label={isAnime ? 'Episodes' : 'Chapters'} value={episodes} />
            {duration && <Stats label="Duration" value={duration} />}
            <Stats label="Rank" value={rank ? `#${rank}` : undefined} />
            <Stats label="Members" value={members?.toLocaleString()} />
          </div>

          {genres.length > 0 && (
            <div className="genres">
              <h3>Genres</h3>
              <div className="chips">
                {genres.map((g) => (
                  <span key={g.mal_id} className="chip">{g.name}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column: synopsis + characters */}
        <div className="detail-main">
          {synopsis && (
            <section className="detail-section">
              <h2 className="section-title"><span className="dot">●</span> Synopsis</h2>
              <p className="synopsis">{synopsis}</p>
            </section>
          )}

          {studios.length > 0 && (
            <section className="detail-section">
              <h2 className="section-title"><span className="dot">●</span> Studios</h2>
              <div className="chips">
                {studios.map((s) => (
                  <span key={s.mal_id} className="chip">{s.name}</span>
                ))}
              </div>
            </section>
          )}

          {chars.length > 0 && (
            <section className="detail-section">
              <h2 className="section-title"><span className="dot">●</span> Characters</h2>
              <div className="char-list">
                {chars.map((c) => (
                  <div key={c.character.mal_id} className="char">
                    {c.character.images?.jpg?.image_url && (
                      <img src={c.character.images.jpg.image_url} alt={c.character.name} loading="lazy" referrerPolicy="no-referrer" />
                    )}
                    <div>
                      <div className="char-name">{c.character.name}</div>
                      <div className="muted small">{c.role}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {related.length > 0 && (
            <section className="detail-section">
              <h2 className="section-title"><span className="dot">●</span> Related</h2>
              <div className="masonry">
                {related.map((r) => (
                  <MediaCard key={`${r.kind}-${r.mal_id}`} item={r} kind={r.kind} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </article>
  );
}