import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';

export default function Layout() {
  return (
    <div className="app">
      <Navbar />
      <main className="container">
        <Outlet />
      </main>
      <footer className="footer">
        <div className="container footer-inner">
          <span>AniQuest</span>
          <span className="muted">Data via Jikan · MyAnimeList</span>
        </div>
      </footer>
    </div>
  );
}