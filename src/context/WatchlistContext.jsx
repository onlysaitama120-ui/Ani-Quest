import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  apiAddWatchlistItem,
  apiGetWatchlist,
  apiPutWatchlist,
  apiRemoveWatchlistItem,
} from '../client';

/**
 * Watchlist — favorites that work WITHOUT login (localStorage) and sync
 * ACROSS DEVICES when signed in (server-side, via the backend).
 *
 * - Not signed in: stored in localStorage (per device).
 * - Signed in: stored server-side; localStorage kept as an offline cache.
 * - On first login, any device-local favorites are migrated to the account.
 */

const KEY = 'aniquest.watchlist.v1';
const MAX = 500;

const WatchlistContext = createContext(null);

function loadLocal() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x.mal_id === 'number' && typeof x.kind === 'string')
      .slice(0, MAX);
  } catch {
    return [];
  }
}

function saveLocal(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* storage unavailable — ignore */
  }
}

function makeEntry(item, kind) {
  return {
    mal_id: item.mal_id,
    kind,
    title: item.title || '',
    image: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || '',
    score: item.score ?? null,
    type: item.type,
    year: item.year || item.aired?.prop?.from?.year || item.published?.prop?.from?.year || '',
    added_at: Date.now(),
  };
}

export function WatchlistProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState([]);
  const [ready, setReady] = useState(false);

  // Load the right source whenever auth state settles or changes.
  useEffect(() => {
    let active = true;
    setReady(false);

    async function load() {
      if (authLoading) return;

      if (user) {
        try {
          const server = await apiGetWatchlist();
          let list = server.items || [];
          // First login: migrate device-local favorites up to the account.
          if (list.length === 0) {
            const local = loadLocal();
            if (local.length > 0) {
              const migrated = await apiPutWatchlist(local);
              list = migrated.items || [];
            }
          }
          if (!active) return;
          setItems(list);
          saveLocal(list);
        } catch {
          // Backend unreachable — fall back to the offline cache.
          if (active) setItems(loadLocal());
        } finally {
          if (active) setReady(true);
        }
      } else {
        setItems(loadLocal());
        setReady(true);
      }
    }

    load();
    return () => { active = false; };
  }, [user, authLoading]);

  const value = useMemo(() => {
    const is = (mal_id, kind) =>
      items.some((x) => x.mal_id === mal_id && x.kind === kind);

    const toggle = async (item, kind) => {
      const saved = is(item.mal_id, kind);

      if (user) {
        try {
          if (saved) {
            await apiRemoveWatchlistItem(item.mal_id, kind);
          } else {
            const res = await apiAddWatchlistItem(makeEntry(item, kind), kind);
            const next = [
              res.item,
              ...items.filter((x) => !(x.mal_id === item.mal_id && x.kind === kind)),
            ];
            setItems(next);
            saveLocal(next);
            return;
          }
        } catch {
          return; // keep state unchanged on failure
        }
        const next = items.filter((x) => !(x.mal_id === item.mal_id && x.kind === kind));
        setItems(next);
        saveLocal(next);
        return;
      }

      // Not signed in — localStorage only.
      if (saved) {
        const next = items.filter((x) => !(x.mal_id === item.mal_id && x.kind === kind));
        setItems(next);
        saveLocal(next);
      } else {
        const next = [makeEntry(item, kind), ...items].slice(0, MAX);
        setItems(next);
        saveLocal(next);
      }
    };

    const remove = async (mal_id, kind) => {
      if (user) {
        try { await apiRemoveWatchlistItem(mal_id, kind); } catch { /* keep going */ }
      }
      const next = items.filter((x) => !(x.mal_id === mal_id && x.kind === kind));
      setItems(next);
      saveLocal(next);
    };

    return { items, is, toggle, remove, ready };
  }, [items, user, ready]);

  return (
    <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>
  );
}

export function useWatchlist() {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error('useWatchlist must be used within WatchlistProvider');
  return ctx;
}