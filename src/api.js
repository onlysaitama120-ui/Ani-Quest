/**
 * ANIQUEST — Unified data layer.
 *
 * Primary source: AniList (reliable, keyless, CORS-enabled).
 * Fallback:       Jikan / MyAnimeList (used automatically if AniList fails).
 *
 * Both sources are normalized to the same shape, so pages never know (or
 * care) which backend served the data.
 *
 * Security:
 *  - No API keys / secrets in the client. Both sources are keyless.
 *  - Every query parameter is validated against a whitelist.
 *  - All responses are cached in-memory (respects rate limits + privacy).
 */

import * as al from './anilist.js';

/* ---------------- In-memory cache ---------------- */
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function cacheGet(key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return Promise.resolve(hit.value);
  return null;
}

function cacheSet(key, value) {
  cache.set(key, { value, at: Date.now() });
  if (cache.size > 400) {
    // Drop oldest entries to keep memory bounded
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

/* ---------------- Input validation (whitelists) ---------------- */
const TYPES = new Set(['tv', 'movie', 'ova', 'special', 'ona', 'music']);
const M_TYPES = new Set(['manga', 'novel', 'lightnovel', 'oneshot', 'doujin']);
const STATUS = new Set(['airing', 'complete', 'upcoming']);
const M_STATUS = new Set(['publishing', 'complete', 'upcoming', 'hiatus', 'discontinued']);
const ORDERS = new Set(['title', 'start_date', 'end_date', 'score', 'members', 'rank']);
const M_ORDERS = new Set(['title', 'score', 'members', 'chapters', 'volumes']);
const SORTS = new Set(['asc', 'desc']);
const SEASONS = new Set(['winter', 'spring', 'summer', 'fall']);

function cleanInt(v, min, max, fallback) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
export { cleanInt };

function cleanStr(v, set, fallback) {
  return set.has(v) ? v : fallback;
}

function cleanQuery(q) {
  return String(q || '').trim().slice(0, 64);
}

/** Validate + normalize search filters for a given media kind. */
function validateFilters(f, kind) {
  const isManga = kind === 'manga';
  const params = {
    q: cleanQuery(f.q),
    type: cleanStr(f.type, isManga ? M_TYPES : TYPES, undefined),
    status: cleanStr(f.status, isManga ? M_STATUS : STATUS, undefined),
    start_date: f.year ? `${cleanInt(f.year, 1900, 2100, 2024)}-01-01` : undefined,
    order_by: cleanStr(f.orderBy, isManga ? M_ORDERS : ORDERS, 'score'),
    sort: cleanStr(f.sort, SORTS, 'desc'),
    page: cleanInt(f.page, 1, 1000, 1),
    limit: 24,
  };
  Object.keys(params).forEach((k) => params[k] === undefined && delete params[k]);
  return params;
}

/* ---------------- Jikan (fallback) client ---------------- */
const JIKAN_BASE = 'https://api.jikan.moe/v4';
let jq = Promise.resolve();

function jikanThrottle() {
  const next = jq.then(() => new Promise((r) => setTimeout(r, 350)));
  jq = next;
  return next;
}

async function jikan(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${JIKAN_BASE}${path}${qs ? `?${qs}` : ''}`;
  await jikanThrottle();
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1200));
      const retry = await fetch(url);
      if (!retry.ok) throw new Error(`Jikan error ${retry.status}`);
      return retry.json();
    }
    throw new Error(`Jikan error ${res.status}`);
  }
  return res.json();
}

/* ---------------- Fallback helper ---------------- */
function withFallback(key, primary, jikanFn) {
  const hit = cacheGet(key);
  if (hit) return Promise.resolve(hit.value);

  return primary()
    .then((value) => {
      cacheSet(key, value);
      return value;
    })
    .catch(() =>
      jikanFn()
        .then((value) => {
          cacheSet(key, value);
          return value;
        })
        .catch((e) => {
          throw new Error(`Data sources unavailable: ${e.message}`);
        }),
    );
}

/* ================= Public API ================= */

/** Currently airing anime. */
export function getAiringAnime(page = 1) {
  const p = cleanInt(page, 1, 1000, 1);
  return withFallback(
    `airing:${p}`,
    () => al.airingAnime(p),
    () => jikan('/top/anime', { type: 'tv', filter: 'airing', page: p, limit: 24 }),
  );
}

/** Currently publishing manga. */
export function getPublishingManga(page = 1) {
  const p = cleanInt(page, 1, 1000, 1);
  return withFallback(
    `mangaPub:${p}`,
    () => al.publishingManga(p),
    () => jikan('/manga', { status: 'publishing', order_by: 'members', sort: 'desc', page: p, limit: 24 }),
  );
}

/** Search anime with validated filters. */
export function searchAnime(f) {
  const params = validateFilters(f, 'anime');
  return withFallback(
    `searchA:${JSON.stringify(params)}`,
    () => al.searchList(params, 'anime'),
    () => jikan('/anime', params),
  );
}

/** Search manga with validated filters. */
export function searchManga(f) {
  const params = validateFilters(f, 'manga');
  return withFallback(
    `searchM:${JSON.stringify(params)}`,
    () => al.searchList(params, 'manga'),
    () => jikan('/manga', params),
  );
}

/** Single anime by id. */
export function getAnime(id) {
  const i = cleanInt(id, 1, 1000000, 1);
  return withFallback(
    `anime:${i}`,
    () => al.detail(i, 'anime'),
    () => jikan(`/anime/${i}/full`),
  );
}

/** Single manga by id. */
export function getManga(id) {
  const i = cleanInt(id, 1, 1000000, 1);
  return withFallback(
    `manga:${i}`,
    () => al.detail(i, 'manga'),
    () => jikan(`/manga/${i}/full`),
  );
}

/**
 * Characters for an anime. AniList embeds characters inside the detail
 * response, so this is only used for the Jikan fallback path.
 */
export function getAnimeCharacters(id) {
  const i = cleanInt(id, 1, 1000000, 1);
  const hit = cacheGet(`chars:${i}`);
  if (hit) return Promise.resolve(hit.value);
  return jikan(`/anime/${i}/characters`)
    .then((value) => {
      cacheSet(`chars:${i}`, value);
      return value;
    })
    .catch(() => ({ data: [] }));
}

/** Seasonal anime by season + year. */
export function getSeasonal(season, year) {
  const s = cleanStr(season, SEASONS, 'summer');
  const y = cleanInt(year, 1900, 2100, 2026);
  return withFallback(
    `season:${s}:${y}`,
    () => al.seasonal(s, y),
    () => jikan(`/seasons/${y}/${s}`, { limit: 24 }),
  );
}