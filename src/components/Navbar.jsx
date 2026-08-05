import { NavLink, useNavigate } from 'react-router-dom';
import ICONS from './Icons';
import { useWatchlist } from '../context/WatchlistContext';
import { useAuth } from '../context/AuthContext';

const links = [
  { to: '/', label: 'Home', icon: ICONS.home },
  { to: '/search', label: 'Search', icon: ICONS.search },
  { to: '/seasonal', label: 'Seasonal', icon: ICONS.calendar },
  { to: '/watchlist', label: 'Watchlist', icon: ICONS.list },
];

export default function Navbar() {
  const { items, ready } = useWatchlist();
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <header className="nav">
      <div className="container nav-inner">
        <NavLink to="/" className="brand" aria-label="AniQuest home">
          <span className="brand-mark">A</span>
          <span className="brand-name">Ani<span className="brand-accent">Quest</span></span>
        </NavLink>

        <nav className="nav-links" aria-label="Primary">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              {l.icon}
              <span>{l.label}</span>
              {l.to === '/watchlist' && ready && items.length > 0 && (
                <span className="nav-count">{items.length}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="nav-auth">
          {loading ? null : user ? (
            <div className="nav-user">
              <span className="nav-email" title={user.email}>
                {user.email}
              </span>
              <button className="btn btn-ghost btn-sm" onClick={onLogout}>
                Log out
              </button>
            </div>
          ) : (
            <div className="nav-user">
              <NavLink to="/login" className="btn btn-ghost btn-sm">
                Log in
              </NavLink>
              <NavLink to="/signup" className="btn btn-primary btn-sm">
                Sign up
              </NavLink>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}