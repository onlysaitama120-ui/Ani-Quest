/**
 * ANIQUEST backend — watchlist routes (server-side favorites, cross-device).
 */

import { Router } from 'express';
import { db } from './db.mjs';
import { requireAuth } from './middleware.mjs';

const router = Router();
router.use(requireAuth);

const MAX_ITEMS = 500;
const MAX_STR = 300;

function cleanItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const mal_id = Number.parseInt(raw.mal_id, 10);
  const kind = raw.kind === 'manga' ? 'manga' : 'anime';
  if (!Number.isInteger(mal_id) || mal_id < 1 || mal_id > 100000000) return null;

  const str = (v) => (typeof v === 'string' ? v.slice(0, MAX_STR) : '');
  const num = (v) =>
    typeof v === 'number' && Number.isFinite(v)
      ? Math.min(10, Math.max(0, v))
      : null;

  return {
    mal_id,
    kind,
    title: str(raw.title) || 'Untitled',
    image: str(raw.image),
    score: num(raw.score),
    type: str(raw.type),
    year: str(raw.year),
  };
}

function rowToItem(row) {
  return {
    mal_id: row.mal_id,
    kind: row.kind,
    title: row.title,
    image: row.image,
    score: row.score,
    type: row.type,
    year: row.year,
    added_at: row.added_at,
  };
}

/* GET /api/watchlist */
router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM watchlist WHERE user_id = ? ORDER BY added_at DESC')
    .all(req.user.id);
  res.json({ items: rows.map(rowToItem) });
});

/* PUT /api/watchlist  (replace the whole list — used for sync) */
router.put('/', (req, res) => {
  const raw = Array.isArray(req.body?.items) ? req.body.items : [];
  const items = raw.map(cleanItem).filter(Boolean).slice(0, MAX_ITEMS);

  const tx = db.transaction((userId, list) => {
    db.prepare('DELETE FROM watchlist WHERE user_id = ?').run(userId);
    const insert = db.prepare(`
      INSERT INTO watchlist (user_id, mal_id, kind, title, image, score, type, year, added_at)
      VALUES (@user_id, @mal_id, @kind, @title, @image, @score, @type, @year, @added_at)
    `);
    const now = Date.now();
    list.forEach((item, i) => {
      insert.run({
        user_id: userId,
        mal_id: item.mal_id,
        kind: item.kind,
        title: item.title,
        image: item.image,
        score: item.score,
        type: item.type,
        year: item.year,
        added_at: now - i, // preserve order
      });
    });
  });
  tx(req.user.id, items);

  const rows = db.prepare('SELECT * FROM watchlist WHERE user_id = ? ORDER BY added_at DESC').all(req.user.id);
  res.json({ items: rows.map(rowToItem) });
});

/* POST /api/watchlist  (upsert one item) */
router.post('/', (req, res) => {
  const item = cleanItem(req.body);
  if (!item) return res.status(400).json({ error: 'Invalid item.' });

  const count = db.prepare('SELECT COUNT(*) AS n FROM watchlist WHERE user_id = ?').get(req.user.id).n;
  const exists = db
    .prepare('SELECT 1 FROM watchlist WHERE user_id = ? AND mal_id = ? AND kind = ?')
    .get(req.user.id, item.mal_id, item.kind);

  if (!exists && count >= MAX_ITEMS) {
    return res.status(400).json({ error: `Watchlist is full (max ${MAX_ITEMS}).` });
  }

  db.prepare(`
    INSERT INTO watchlist (user_id, mal_id, kind, title, image, score, type, year, added_at)
    VALUES (@user_id, @mal_id, @kind, @title, @image, @score, @type, @year, @added_at)
    ON CONFLICT(user_id, mal_id, kind) DO UPDATE SET
      title = excluded.title,
      image = excluded.image,
      score = excluded.score,
      type = excluded.type,
      year = excluded.year
  `).run({ user_id: req.user.id, ...item, added_at: Date.now() });

  const row = db
    .prepare('SELECT * FROM watchlist WHERE user_id = ? AND mal_id = ? AND kind = ?')
    .get(req.user.id, item.mal_id, item.kind);
  res.json({ item: rowToItem(row) });
});

/* DELETE /api/watchlist/:kind/:id */
router.delete('/:kind/:id', (req, res) => {
  const kind = req.params.kind === 'manga' ? 'manga' : 'anime';
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid id.' });

  db.prepare('DELETE FROM watchlist WHERE user_id = ? AND mal_id = ? AND kind = ?')
    .run(req.user.id, id, kind);
  res.json({ ok: true });
});

export default router;