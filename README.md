# AniQuest 🎌

A clean, Pinterest-style web app for tracking **ongoing anime & manga**, browsing
**seasonal calendars**, and **searching the classics** — with a personal watchlist
that works **without an account** and syncs **across devices** when you sign in.

Built with **React + Vite + Express + SQLite**. No API keys, no third-party auth.

## Features

- **Airing now** — currently airing anime, and currently publishing manga, on the home page
- **Search** — full-text search with filters (type, status, year, sort order) for anime and manga
- **Detail pages** — synopsis, genres, studios, score, characters, and related titles
- **Seasonal calendar** — browse every season (Winter/Spring/Summer/Fall) back to 2018
- **Watchlist** — save favorites **without logging in** (stored in your browser), or
  **sign up** to sync them to any device. Your device-local list migrates to your
  account automatically on first login.

## Quick start

```bash
npm install

# Development (two terminals):
npm run server    # backend API on http://localhost:4000
npm run dev       # Vite frontend on http://localhost:5173 (proxies /api)

# Production (one process serves the app + API):
npm run build
npm run server:prod   # http://localhost:4000
```

The backend stores data in `data/aniquest.db` (SQLite). Its signing secret is
auto-generated to `.secret` on first run — both are gitignored.

## Data sources

- **Primary:** [AniList GraphQL API](https://anilist.gitbook.io/anilist-apiv2-docs/) — free, keyless, CORS-enabled
- **Fallback:** [Jikan](https://jikan.moe/) (MyAnimeList) — used automatically if AniList is unreachable

Both are normalized into one shape, so pages never care which backend served the data.

## Deploy for free (with persistent accounts)

The app is **database-pluggable** via `@libsql/client`:

- **No env vars set** → uses a local SQLite file (`data/aniquest.db`) — great for dev, but data resets on a free host's redeploy.
- **`TURSO_URL` + `TURSO_AUTH_TOKEN` set** → uses **Turso**, a free hosted SQLite, so accounts & watchlists **persist forever** even on free hosting.

### 1. Create a free Turso database (persistent data)
1. Sign up at [turso.tech](https://turso.tech) (free).
2. Create a database (e.g. `aniquest`).
3. Copy its **URL** (looks like `libsql://aniquest-xxxx.turso.io`) and create an **auth token**.
4. Keep those two values — you'll paste them into Render.

### 2. Deploy to Render (free)
1. Sign up at [render.com](https://render.com) (free).
2. **New → Blueprint** and point it at this repo. Render reads `render.yaml`.
3. In the service's **Environment** tab, set:
   - `TURSO_URL` = your Turso URL
   - `TURSO_AUTH_TOKEN` = your Turso token
   - `RESEND_API_KEY` = your Resend key (for email verification)
   - `EMAIL_FROM` = e.g. `AniQuest <hi@yourdomain>` (needs a verified domain in Resend)
   - `APP_URL` = your site's public URL, e.g. `https://aniquest.onrender.com`
4. Deploy. Your app is live with all features and persistent data.

### 3. Email verification (free, via Brevo — reaches anyone)
Signups require confirming your email:
1. Create a free account at [brevo.com](https://www.brevo.com).
2. Get an **API key** (Settings → SMTP & API) → paste into Render as `BREVO_API_KEY`.
3. **Verify a sender email** in Brevo (they email you a confirmation link) — this can be
   your own address, e.g. `you@gmail.com`. No domain needed.
4. Set `EMAIL_FROM` to that verified address (e.g. `you@gmail.com`) and optionally
   `EMAIL_FROM_NAME` (defaults to "AniQuest").

> Brevo's free tier allows sending to **any** recipient from a verified sender email —
> unlike Resend's unverified sender, which only delivers to your own address.

> `render.yaml` is already set up with the build/start commands, a health check,
> and a generated `SESSION_SECRET`. No other config needed.

### Run it locally
```bash
npm install
npm run server    # backend API on http://localhost:4000
npm run dev       # Vite frontend on http://localhost:5173 (proxies /api)
```

## Accounts & security

Accounts use email + password only. The backend:

- Hashes passwords with **scrypt** (memory-hard, salted)
- Issues **opaque session tokens**, stored **hashed** in the DB, delivered in an
  **HttpOnly + SameSite=Strict** cookie (not readable by JS, not leaked to other sites)
- Rate-limits login/signup per IP (10 attempts / 15 min)
- Validates every field (email format, password policy) and every watchlist item server-side
- Stores no personal data beyond your email; watchlists are capped and whitelisted

## Security

No secrets live in the client (both APIs are keyless). The production server
(`vite preview`) sends these headers:

- **Content-Security-Policy** — restricts scripts/styles/images/connections to allowed origins
- **X-Frame-Options: DENY** — blocks clickjacking
- **X-Content-Type-Options: nosniff**
- **Referrer-Policy: no-referrer** — never leaks the URL to third parties
- **Permissions-Policy** — disables camera/mic/geolocation/payment

Defense in depth in the app code:

- All API query parameters are **whitelist-validated** (no arbitrary input reaches the API)
- All API responses are **rate-limited and cached** in-memory
- All rendered data is **auto-escaped by React** (no `dangerouslySetInnerHTML`)
- HTML in synopses is stripped before display
- Adult content is filtered out of all listings
- Watchlist is capped in size and shape-validated on read

> Note: the strict CSP is applied by `vite preview` (production). The dev server
> (`vite run dev`) uses a relaxed policy so React's hot-reload works — it runs on
> localhost only. For a deployed host (Netlify/Vercel/etc.), mirror the CSP from
> `vite.config.js` in your host's header config.

## Project structure

```
src/
  api.js                 unified media-data layer (AniList primary, Jikan fallback)
  anilist.js             AniList GraphQL client + normalizer
  client.js              backend API client (auth + watchlist sync)
  App.jsx                routes
  components/            Navbar, Layout, MediaCard, Grid, Icons
  context/               AuthContext, WatchlistContext
  pages/                 Home, Search, Detail, Seasonal, Watchlist, Auth, NotFound
  index.css              design system (masonry grid, cards, palette)
  app.css                layout & page styles

server/
  index.mjs              Express app (API + production static hosting)
  auth.mjs               signup / login / logout / me
  watchlist.mjs          server-side watchlist CRUD + sync
  middleware.mjs         headers, rate limiting, session auth
  security.mjs           scrypt hashing, session tokens, validation
  db.mjs                 SQLite schema
```