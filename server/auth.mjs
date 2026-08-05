/**
 * ANIQUEST backend — auth routes (signup / login / logout / me).
 */

import { Router } from 'express';
import { db } from './db.mjs';
import {
  hashPassword,
  newSalt,
  verifyPassword,
  newSessionToken,
  hashToken,
  isValidEmail,
  passwordError,
} from './security.mjs';
import {
  requireAuth,
  rateLimit,
  readCookie,
  setSessionCookie,
  clearSessionCookie,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from './middleware.mjs';

const router = Router();

// Strict limits on auth endpoints.
const authLimit = rateLimit(10, 15 * 60 * 1000);

function publicUser(row) {
  return { id: row.id, email: row.email, created_at: row.created_at };
}

async function createSession(userId, res) {
  const token = newSessionToken();
  await db.run(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    [hashToken(token), userId, Date.now(), Date.now() + SESSION_TTL_MS],
  );
  setSessionCookie(res, token);
}

/* POST /api/auth/signup */
router.post('/signup', authLimit, async (req, res) => {
  const { email, password } = req.body || {};

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  const passwordErr = passwordError(password);
  if (passwordErr) {
    return res.status(400).json({ error: passwordErr });
  }

  const existing = await db.get('SELECT id FROM users WHERE email = ?', [String(email).toLowerCase()]);
  if (existing) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }

  const salt = newSalt();
  const hash = hashPassword(password, salt);
  const info = await db.run(
    'INSERT INTO users (email, pass_hash, pass_salt, created_at) VALUES (?, ?, ?, ?)',
    [String(email).toLowerCase(), hash, salt, Date.now()],
  );

  const user = await db.get('SELECT id, email, created_at FROM users WHERE id = ?', [info.lastInsertRowid]);
  await createSession(user.id, res);
  res.status(201).json({ user: publicUser(user) });
});

/* POST /api/auth/login */
router.post('/login', authLimit, async (req, res) => {
  const { email, password } = req.body || {};

  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Enter your email and password.' });
  }

  const user = await db.get('SELECT * FROM users WHERE email = ?', [String(email).toLowerCase().trim()]);
  if (!user || !verifyPassword(password, user.pass_salt, user.pass_hash)) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  await createSession(user.id, res);
  res.json({ user: publicUser(user) });
});

/* POST /api/auth/logout */
router.post('/logout', async (req, res) => {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) {
    await db.run('DELETE FROM sessions WHERE token_hash = ?', [hashToken(token)]);
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

/* GET /api/auth/me */
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

export default router;