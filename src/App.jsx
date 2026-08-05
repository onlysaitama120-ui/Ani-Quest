import { HashRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import { AuthProvider } from './context/AuthContext';
import { WatchlistProvider } from './context/WatchlistContext';
import Home from './pages/Home';
import Search from './pages/Search';
import Detail from './pages/Detail';
import Seasonal from './pages/Seasonal';
import Watchlist from './pages/Watchlist';
import Auth from './pages/Auth';
import Verify from './pages/Verify';
import NotFound from './pages/NotFound';

/**
 * HashRouter keeps the app fully client-side and works when opened
 * from a file:// URL or any static host without server rewrites.
 */
export default function App() {
  return (
    <AuthProvider>
      <WatchlistProvider>
        <HashRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="/search" element={<Search />} />
              <Route path="/seasonal" element={<Seasonal />} />
              <Route path="/watchlist" element={<Watchlist />} />
              <Route path="/login" element={<Auth mode="login" />} />
              <Route path="/signup" element={<Auth mode="signup" />} />
              <Route path="/verify" element={<Verify />} />
              <Route path="/:kind/:id" element={<Detail />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </HashRouter>
      </WatchlistProvider>
    </AuthProvider>
  );
}