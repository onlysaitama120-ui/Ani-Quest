import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAiringAnime, getPublishingManga } from '../api';
import { MediaGrid, GridSkeleton, ErrorState } from '../components/Grid';
import { useWatchlist } from '../context/WatchlistContext';

function Section({ title, children, linkTo }) {
  return (
    <section className="section fade-in">
      <div className="section-head">
        <h2 className="section-title">
          <span className="dot">●</span> {title}
        </h2>
        {linkTo && (
          <Link to={linkTo} className="btn btn-ghost btn-sm">
            View all
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export default function Home() {
  const [airing, setAiring] = useState([]);
  const [manga, setManga] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { items } = useWatchlist();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.allSettled([getAiringAnime(1), getPublishingManga(1)])
      .then(([a, m]) => {
        if (!active) return;
        setAiring(a.status === 'fulfilled' ? (a.value?.data ?? []) : []);
        setManga(m.status === 'fulfilled' ? (m.value?.data ?? []) : []);
        if (a.status === 'rejected' && m.status === 'rejected') {
          setError('Could not reach the anime database. Please try again shortly.');
        }
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const initials = (n) => String(n || 'A').slice(0, 1).toUpperCase();

  return (
    <div className="home">
      {/* Hero */}
      <section className="hero fade-in">
        <div className="hero-inner">
          <h1 className="hero-title">
            What's <span className="brand-accent">airing</span> now?
          </h1>
          <p className="hero-sub">
            Track this season's anime &amp; manga, discover classics, and keep
            your watchlist in one place.
          </p>
          <div className="hero-actions">
            <Link to="/search" className="btn btn-primary">
              Explore everything
            </Link>
            <Link to="/seasonal" className="btn btn-ghost">
              Seasonal calendar
            </Link>
          </div>
        </div>
      </section>

      {/* Watchlist quick strip */}
      {items.length > 0 && (
        <div className="quick-strip fade-in">
          <span className="muted">Your watchlist</span>
          <div className="quick-thumbs">
            {items.slice(0, 8).map((it) => (
              <Link
                key={`${it.kind}-${it.mal_id}`}
                to={`/${it.kind}/${it.mal_id}`}
                title={it.title}
                className="quick-thumb"
              >
                {it.image ? (
                  <img src={it.image} alt={it.title} loading="lazy" referrerPolicy="no-referrer" />
                ) : (
                  <span>{initials(it.title)}</span>
                )}
              </Link>
            ))}
          </div>
          <Link to="/watchlist" className="btn btn-ghost btn-sm">
            Open
          </Link>
        </div>
      )}

      {loading ? (
        <Section title="Airing now">
          <GridSkeleton />
        </Section>
      ) : error ? (
        <ErrorState message={error} onRetry={() => window.location.reload()} />
      ) : (
        <>
          <Section title="Airing now" linkTo="/search?status=airing">
            {airing.length ? (
              <MediaGrid items={airing} kind="anime" />
            ) : (
              <p className="muted">No currently airing titles found.</p>
            )}
          </Section>

          <Section title="Currently publishing manga" linkTo="/search?kind=manga&status=publishing">
            {manga.length ? (
              <MediaGrid items={manga} kind="manga" />
            ) : (
              <p className="muted">No publishing manga found.</p>
            )}
          </Section>
        </>
      )}
    </div>
  );
}