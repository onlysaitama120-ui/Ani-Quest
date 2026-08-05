/**
 * ANIQUEST backend — database layer.
 *
 * Pluggable via @libsql/client, which supports BOTH:
 *   - a local SQLite file (development / no account needed)
 *   - Turso, a free hosted SQLite (production / persistent across deploys)
 *
 * Choose with env vars:
 *   TURSO_URL + TURSO_AUTH_TOKEN  -> use hosted Turso (persistent, free tier)
 *   (otherwise)                   -> local file at DB_PATH (default ./data/aniquest.db)
 *
 * All methods are async. `rows` are returned as objects keyed by column name.
 */

import { createClient } from '@libsql/client';

const tursoUrl = process.env.TURSO_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;
const localPath = process.env.DB_PATH || 'file:./data/aniquest.db';

const client = createClient({
  url: tursoUrl || localPath,
  authToken: tursoToken || undefined,
});

/* ---------------- Schema ---------------- */
await client.executeMultiple(`
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT    UNIQUE NOT NULL,
  pass_hash  TEXT    NOT NULL,
  pass_salt  TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS watchlist (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mal_id   INTEGER NOT NULL,
  kind     TEXT    NOT NULL CHECK (kind IN ('anime','manga')),
  title    TEXT    NOT NULL,
  image    TEXT    NOT NULL DEFAULT '',
  score    REAL,
  type     TEXT,
  year     TEXT,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, mal_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id);
`);

/* ---------------- Async query helpers ---------------- */
function toNum(v) {
  if (typeof v === 'bigint') return Number(v);
  return v;
}

export const db = {
  /** First row as an object, or undefined. */
  async get(sql, args = []) {
    const r = await client.execute({ sql, args });
    return r.rows[0] ?? undefined;
  },

  /** All rows as an array of objects. */
  async all(sql, args = []) {
    const r = await client.execute({ sql, args });
    return r.rows;
  },

  /** Run a statement; returns { lastInsertRowid, changes }. */
  async run(sql, args = []) {
    const r = await client.execute({ sql, args });
    return { lastInsertRowid: toNum(r.lastInsertRowid), changes: r.rowsAffected };
  },

  /** Run one or more statements (schema). */
  async exec(sql) {
    await client.executeMultiple(sql);
  },

  /** Wrap several operations in a transaction. */
  async transaction(fn) {
    await client.execute('BEGIN');
    try {
      const result = await fn();
      await client.execute('COMMIT');
      return result;
    } catch (e) {
      await client.execute('ROLLBACK');
      throw e;
    }
  },
};