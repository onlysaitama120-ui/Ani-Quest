import MediaCard, { MediaCardSkeleton } from './MediaCard';

/** Responsive masonry grid. */
export function MediaGrid({ items, kind = 'anime' }) {
  return (
    <div className="masonry">
      {items.map((item) => (
        <MediaCard key={`${kind}-${item.mal_id}`} item={item} kind={kind} />
      ))}
    </div>
  );
}

/** Skeleton grid shown while loading. */
export function GridSkeleton({ count = 12 }) {
  return (
    <div className="masonry" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <MediaCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="error-state fade-in">
      <p className="muted">Something went wrong while fetching data.</p>
      {message && <p className="muted small">{message}</p>}
      {onRetry && (
        <button className="btn btn-ghost" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}