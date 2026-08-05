/**
 * ANIQUEST backend — security primitives.
 *
 * - Password hashing: Node built-in scrypt (memory-hard, recommended over bcrypt).
 * - Sessions: random opaque tokens, stored HASHED in the DB (revocable),
 *   delivered in an HttpOnly + SameSite cookie.
 * - Secret: auto-generated to a local file on first run (never committed).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SECRET_FILE = process.env.SESSION_SECRET_FILE || path.join(__dirname, '..', '.secret');

function loadOrCreateSecret() {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv) return fromEnv;
  if (fs.existsSync(SECRET_FILE)) {
    return fs.readFileSync(SECRET_FILE, 'utf8').trim();
  }
  const secret = crypto.randomBytes(48).toString('base64url');
  try {
    fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
  } catch {
    /* read-only fs — session secrets just won't persist across restarts */
  }
  return secret;
}

const SECRET = loadOrCreateSecret();

const SCRYPT_KEYLEN = 64;

/** Hash a password with a given salt. */
export function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN).toString('hex');
}

export function newSalt() {
  return crypto.randomBytes(16).toString('hex');
}

/** Constant-time password verification. */
export function verifyPassword(password, salt, expectedHex) {
  const actual = Buffer.from(hashPassword(password, salt), 'hex');
  const expected = Buffer.from(String(expectedHex || ''), 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

/** Generate an opaque session token (sent to the browser). */
export function newSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

/** Hash a token for storage (so a DB leak doesn't expose live sessions). */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const WS_CHARS = String.fromCharCode(9, 10, 13, 32); // tab, newline, cr, space

/** Email validation (simple, strict enough for signup). */
export function isValidEmail(email) {
  if (typeof email !== 'string' || email.length > 254) return false;
  for (let i = 0; i < email.length; i += 1) {
    if (WS_CHARS.includes(email[i])) return false; // no whitespace
  }
  const at = email.indexOf('@');
  if (at <= 0 || at !== email.lastIndexOf('@')) return false; // exactly one @
  const domain = email.slice(at + 1);
  if (!domain || !domain.includes('.')) return false;
  return true;
}

/** Password policy. */
export function passwordError(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  if (password.length > 128) {
    return 'Password must be at most 128 characters.';
  }
  if (new Set(password).size === 1) {
    return 'Password is too weak.';
  }
  return null;
}

/** Signed cookie value (defense in depth — integrity check on the session id). */
export function sign(value) {
  return crypto.createHmac('sha256', SECRET).update(value).digest('base64url');
}

export function verifySignature(value, sig) {
  const expected = sign(value);
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
