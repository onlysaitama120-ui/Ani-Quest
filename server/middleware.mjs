/**
 * ANIQUEST backend — middleware: headers, body parsing, rate limiting, auth.
 */

import express from 'express';
import { db } from './db.mjs';
import { hashToken } from './security.mjs';

export const SESSION_COOKIE = 'aniquest_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1h

/* ---------------- Security headers ---------------- */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // React inline style props
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://graphql.anilist.co https://api.jikan.moe",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

export function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
}

/** Disable caching for API responses only (never for static assets). */
export function noStore(req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  next();
}

/* ---------------- Body parsing (bounded) ---------------- */
// 1 MB — enough for a full watchlist sync (up to 500 items) while
// still rejecting oversized payloads.
export const jsonBody = express.json({ limit: '1mb' });

/* ---------------- In-memory rate limiter ---------------- */
const buckets = new Map();

function pruneBuckets() {
  const now = Date.now();
  for (const [key, times] of buckets) {
    const fresh = times.filter((t) => now - t < WINDOW_MS);
    if (fresh.length) buckets.set(key, fresh);
    else buckets.delete(key);
  }
}
setInterval(pruneBuckets, 5 * 60 * 1000);

const WINDOW_MS = 15 * 60 * 1000;
const MAX_HITS = 20;

/**
 * Rate limit by IP. Strict for auth, looser elsewhere.
 */
export function rateLimit(max = MAX_HITS, windowMs = WINDOW_MS) {
  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `${ip}:${req.path}`;
    const now = Date.now();
    const times = (buckets.get(key) || []).filter((t) => now - t < windowMs);
    if (times.length >= max) {
      res.setHeader('Retry-After', String(Math.ceil((windowMs - (now - times[0])) / 1000)));
      return res.status(429).json({ error: 'Too many attempts. Please wait and try again.' });
    }
    times.push(now);
    buckets.set(key, times);
    next();
  };
}

/* ---------------- Session helpers ---------------- */
export function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

export function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production';
  res.setHeader('Set-Cookie', [
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secure ? '; Secure' : ''}`,
  ]);
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', [
    `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`,
  ]);
}

/* ---------------- Auth middleware ---------------- */
export async function requireAuth(req, res, next) {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return res.status(401).json({ error: 'Not signed in.' });

  const session = await db
    .get('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?', [hashToken(token)]);

  if (!session || session.expires_at < Date.now()) {
    return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }

  const user = await db
    .get('SELECT id, email, created_at FROM users WHERE id = ?', [session.user_id]);

  if (!user) return res.status(401).json({ error: 'Session invalid.' });

  req.user = user;
  next();
}

/** Delete expired sessions periodically. */
export function startSessionCleanup() {
  setInterval(async () => {
    try {
      await db.run('DELETE FROM sessions WHERE expires_at < ?', [Date.now()]);
    } catch { /* ignore */ }
  }, CLEANUP_INTERVAL_MS);
  db.run('DELETE FROM sessions WHERE expires_at < ?', [Date.now()]).catch(() => {});
}
