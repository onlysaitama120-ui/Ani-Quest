import { Link } from 'react-router-dom';
import ICONS from './Icons';

/**
 * Pinterest-style media card. Shows a poster with overlay info.
 * `item` is a Jikan anime/manga object.
 */
export default function MediaCard({ item, kind = 'anime' }) {
  const id = item?.mal_id;
  const title = item?.title || 'Untitled';
  const image = item?.images?.jpg?.large_image_url || item?.images?.jpg?.image_url || '';
  const score = item?.score;
  const type = item?.type;
  const year = item?.year || item?.aired?.prop?.from?.year || item?.published?.prop?.from?.year || '';
  const status = item?.status || '';

  return (
    <Link to={`/${kind}/${id}`} className="media-card" aria-label={title}>
      <div className="thumb">
        {image ? (
          <img src={image} alt={title} loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#8a8177' }}>
            {title.slice(0, 1)}
          </div>
        )}
        {type && <span className="badge">{type}</span>}
        {score != null && (
          <span className="score">
            {ICONS.star} {score.toFixed(1)}
          </span>
        )}
        <div className="info">
          <div className="title">{title}</div>
          <div className="meta">
            {[year, status].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>
    </Link>
  );
}

/** Skeleton placeholder for the masonry grid. */
export function MediaCardSkeleton() {
  return (
    <div className="media-card" aria-hidden="true">
      <div className="thumb skeleton" style={{ aspectRatio: '2/3' }} />
    </div>
  );
}