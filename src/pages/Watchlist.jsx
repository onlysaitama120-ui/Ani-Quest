import { Link } from 'react-router-dom';
import { useWatchlist } from '../context/WatchlistContext';

export default function Watchlist() {
  const { items, remove } = useWatchlist();

  if (items.length === 0) {
    return (
      <div className="page-watchlist center fade-in" style={{ padding: '80px 0' }}>
        <h1 className="page-title">Your watchlist is empty</h1>
        <p className="muted" style={{ margin: '12px 0 24px' }}>
          Save anime &amp; manga you want to keep track of — they'll show up here.
        </p>
        <Link to="/search" className="btn btn-primary">Find something to watch</Link>
      </div>
    );
  }

  return (
    <div className="page-watchlist fade-in">
      <h1 className="page-title">Watchlist</h1>
      <p className="muted page-sub">{items.length} saved {items.length === 1 ? 'title' : 'titles'}</p>

      <div className="watchlist-grid">
        {items.map((it) => (
          <div key={`${it.kind}-${it.mal_id}`} className="watch-item card">
            <Link to={`/${it.kind}/${it.mal_id}`} className="watch-thumb">
              {it.image ? (
                <img src={it.image} alt={it.title} loading="lazy" referrerPolicy="no-referrer" />
              ) : (
                <span>{(it.title || '?').slice(0, 1)}</span>
              )}
            </Link>
            <div className="watch-info">
              <span className="watch-kind">{it.kind}</span>
              <Link to={`/${it.kind}/${it.mal_id}`} className="watch-title">
                {it.title}
              </Link>
              <div className="muted small">
                {[it.type, it.year, it.score != null ? `★ ${it.score}` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
            <button
              className="btn btn-ghost btn-sm watch-remove"
              onClick={() => remove(it.mal_id, it.kind)}
              aria-label={`Remove ${it.title}`}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}