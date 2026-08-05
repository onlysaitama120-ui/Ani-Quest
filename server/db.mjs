/**
 * ANIQUEST backend — SQLite database.
 * Uses better-sqlite3 (synchronous, reliable, WAL mode).
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const dbPath = process.env.DB_PATH || path.join(dataDir, 'aniquest.db');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

db.exec(`
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