/**
 * ANIQUEST backend — auth routes (signup / verify / login / resend / logout / me).
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
import { isEmailConfigured, sendVerificationEmail, buildVerifyUrl } from './email.mjs';

const router = Router();

// Strict limits on auth endpoints.
const authLimit = rateLimit(10, 15 * 60 * 1000);
const verifyLimit = rateLimit(20, 15 * 60 * 1000);
const resendLimit = rateLimit(5, 15 * 60 * 1000);

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    created_at: row.created_at,
    email_verified: !!row.email_verified,
  };
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
  if (!isEmailConfigured()) {
    return res.status(503).json({ error: 'Signups are temporarily unavailable (email service not configured).' });
  }

  const emailLower = String(email).toLowerCase();
  const existing = await db.get('SELECT id FROM users WHERE email = ?', [emailLower]);
  if (existing) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }

  const salt = newSalt();
  const hash = hashPassword(password, salt);
  const verifyToken = newSessionToken();
  const info = await db.run(
    `INSERT INTO users (email, pass_hash, pass_salt, email_verified, verify_token, verify_expires, created_at)
     VALUES (?, ?, ?, 0, ?, ?, ?)`,
    [emailLower, hash, salt, verifyToken, Date.now() + VERIFY_TTL_MS, Date.now()],
  );

  const user = await db.get('SELECT * FROM users WHERE id = ?', [info.lastInsertRowid]);

  let emailSent = false;
  try {
    await sendVerificationEmail(user.email, buildVerifyUrl(req, verifyToken));
    emailSent = true;
  } catch (e) {
    console.error('Verification email failed to send:', e.message);
  }

  res.status(201).json({
    user: publicUser(user),
    needsVerification: true,
    emailSent,
  });
});

/* GET /api/auth/verify?token=... */
router.get('/verify', verifyLimit, async (req, res) => {
  const token = String(req.query.token || '');
  if (!token) return res.status(400).json({ error: 'Missing verification token.' });

  const user = await db.get('SELECT * FROM users WHERE verify_token = ?', [token]);
  if (!user) return res.status(400).json({ error: 'Invalid or already-used verification link.' });
  if (user.verify_expires && user.verify_expires < Date.now()) {
    return res.status(400).json({ error: 'This verification link has expired. Request a new one.' });
  }

  await db.run(
    'UPDATE users SET email_verified = 1, verify_token = NULL, verify_expires = NULL WHERE id = ?',
    [user.id],
  );
  const verified = await db.get('SELECT * FROM users WHERE id = ?', [user.id]);
  await createSession(user.id, res);
  res.json({ ok: true, user: publicUser(verified) });
});

/* POST /api/auth/resend — resend verification email */
router.post('/resend', resendLimit, async (req, res) => {
  const { email } = req.body || {};
  if (typeof email !== 'string') return res.status(400).json({ error: 'Enter your email.' });
  if (!isEmailConfigured()) {
    return res.status(503).json({ error: 'Email service is not configured.' });
  }

  const user = await db.get('SELECT * FROM users WHERE email = ?', [String(email).toLowerCase().trim()]);
  // Don't reveal whether an account exists.
  if (!user || user.email_verified) return res.json({ ok: true, sent: false });

  const token = newSessionToken();
  await db.run(
    'UPDATE users SET verify_token = ?, verify_expires = ? WHERE id = ?',
    [token, Date.now() + VERIFY_TTL_MS, user.id],
  );

  try {
    await sendVerificationEmail(user.email, buildVerifyUrl(req, token));
    res.json({ ok: true, sent: true });
  } catch (e) {
    console.error('Resend failed:', e.message);
    res.status(500).json({ error: 'Could not send the verification email. Please try again shortly.' });
  }
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

  if (!user.email_verified) {
    return res.status(403).json({
      error: 'Please verify your email before logging in.',
      needsVerification: true,
      email: user.email,
    });
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