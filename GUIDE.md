# AniQuest — How It's Built (Detailed Guide)

This guide explains **how AniQuest works under the hood** — the architecture, the
data flow, the security model, and how every piece fits together. Read this top to
bottom and you'll understand the whole app.

---

## 1. What it is

AniQuest is a **full-stack web app** for tracking anime & manga:

- Browse **currently airing** anime and **publishing** manga
- **Search** old titles with filters
- View **detail pages** (synopsis, characters, related titles)
- Browse a **seasonal calendar**
- Save a personal **watchlist** that works **without an account** and **syncs
  across devices** when you sign up

It's a single codebase with two parts: a **React frontend** (what you see) and a
**Node/Express backend** (the API + database).

---

## 2. Tech stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | **React 19 + Vite 8** | Fast, component-based UI |
| Routing | **react-router-dom** (HashRouter) | Client-side pages, works on any static host |
| Backend | **Express 5** (Node) | Simple, robust HTTP API |
| Database | **SQLite** via `@libsql/client` | File-based, no server to run |
| Hosted DB | **Turso** (optional) | Free hosted SQLite so data persists on free hosts |
| Auth | **scrypt** hashing + opaque session tokens | Secure passwords & revocable sessions |
| Data source | **AniList GraphQL** (+ Jikan fallback) | Free, keyless anime/manga data |

---

## 3. Project structure

```
anime-tracker/
├── index.html              # HTML shell (loads the React app)
├── vite.config.js          # Build config + dev proxy + security headers
├── render.yaml             # Render.com deployment config
├── .github/workflows/      # CI (auto build+lint on push)
├── server/                 # Backend
│   ├── index.mjs           # Express app entry (API + serves the built app)
│   ├── auth.mjs            # signup / login / logout / me
│   ├── watchlist.mjs       # watchlist CRUD + sync
│   ├── middleware.mjs      # headers, rate limiting, session auth
│   ├── security.mjs        # scrypt hashing, tokens, validation
│   └── db.mjs              # pluggable SQLite/Turso layer + schema
└── src/                    # Frontend
    ├── main.jsx            # React bootstrap
    ├── App.jsx             # routes
    ├── index.css           # design system (masonry grid, palette)
    ├── app.css             # layout & page styles
    ├── api.js              # unified media-data layer
    ├── anilist.js          # AniList GraphQL client + normalizer
    ├── client.js           # backend API client (auth + watchlist)
    ├── components/         # Navbar, Layout, MediaCard, Grid, Icons
    ├── context/            # AuthContext, WatchlistContext
    └── pages/              # Home, Search, Detail, Seasonal, Watchlist, Auth
```

---

## 4. How the frontend works

### 4.1 Bootstrapping
`src/main.jsx` mounts `<App />` into `#root`. `App.jsx` wraps everything in two
providers and a router:

```
<AuthProvider>          ← knows who you are (session)
  <WatchlistProvider>   ← your favorites (local + synced)
    <HashRouter>
      <Routes> ... </Routes>
    </HashRouter>
  </WatchlistProvider>
</AuthProvider>
```

`HashRouter` uses the URL fragment (`/#/search`) for routing. That means the app
works on **any** static host with **no server rewrites** — the browser handles
navigation entirely client-side.

### 4.2 Pages (routes)
| Route | File | Purpose |
|---|---|---|
| `/` | `pages/Home.jsx` | Hero + "Airing now" + "Publishing manga" |
| `/search` | `pages/Search.jsx` | Search with filters + pagination |
| `/seasonal` | `pages/Seasonal.jsx` | Browse by season/year |
| `/watchlist` | `pages/Watchlist.jsx` | Your saved titles |
| `/login` `/signup` | `pages/Auth.jsx` | Account forms |
| `/:kind/:id` | `pages/Detail.jsx` | One anime/manga detail page |

### 2.3 State management
There is **no Redux**. State lives in two React Contexts:

- **`AuthContext`** — stores the logged-in `user`. On first load it calls
  `/api/auth/me` to restore a session from the cookie.
- **`WatchlistContext`** — stores the list of saved titles. It decides the source:
  - **Not logged in** → `localStorage` (per device)
  - **Logged in** → the server (Turso), with `localStorage` kept as an offline cache
  - On first login, any device-local favorites **migrate up** to the account.

### 2.4 The Pinterest-style UI
- `index.css` defines the design system: a warm paper palette, a red accent
  (`#e60023`), rounded cards, and a **masonry grid** (`columns`) so cards flow
  like Pinterest instead of a rigid grid.
- `MediaCard.jsx` renders each title as a poster with a hover zoom + lift, a
  score badge, a type badge, and a save button.
- Skeleton loaders show while data is fetching.

---

## 3. How the backend works

### 3.1 The Express app (`server/index.mjs`)
- Applies **security headers** to every response (CSP, `X-Frame-Options: DENY`,
  `nosniff`, `no-referrer`).
- Mounts the API routers under `/api`.
- In production (`--prod`), it also **serves the built frontend** from `dist/` so
  one process hosts both the app and the API.

### 3.2 Authentication (`server/auth.mjs` + `security.mjs`)
- **Passwords** are hashed with **scrypt** (memory-hard, salted) — never stored
  in plaintext.
- **Sessions** use **opaque random tokens** stored **hashed** in the DB. The raw
  token goes to the browser in an **HttpOnly + SameSite=Strict cookie**, so:
  - JavaScript can't read it (blocks XSS token theft)
  - other sites can't send it (blocks CSRF)
- **Rate limiting** (10 attempts / 15 min per IP) protects login/signup.
- **Input validation** on every field (email format, password policy).

### 3.3 Watchlist API (`server/watchlist.mjs`)
- `GET /api/watchlist` — fetch your list
- `PUT /api/watchlist` — replace the whole list (used for sync/migration)
- `POST /api/watchlist` — add/update one item
- `DELETE /api/watchlist/:kind/:id` — remove one item
- Every item is **validated and capped** (max 500, score clamped 0–10).

---

## 4. How the database works (the clever part)

`server/db.mjs` uses `@libsql/client`, which speaks **both**:

- a **local SQLite file** (`file:./data/aniquest.db`) — no account needed
- **Turso**, a free hosted SQLite — persistent across redeploys

It picks automatically based on env vars:

```
TURSO_URL + TURSO_AUTH_TOKEN set  -> use Turso (production)
otherwise                        -> local file (development)
```

All queries go through a small async wrapper (`db.get/all/run/transaction`) so the
route code never cares which backend is in use. The schema (users, sessions,
watchlist) is created automatically on startup.

> Why this matters: free hosts like Render wipe their disk on redeploy. By putting
> the database in Turso, user accounts and watchlists **survive redeploys** for free.

---

## 5. How anime/manga data flows

The app has **no database of anime** — it fetches everything live:

```
React page -> api.js -> AniList (GraphQL)  -> normalized data -> UI
                     /-> Jikan (fallback)  -> normalized data -> UI
```

- `anilist.js` queries AniList's GraphQL API (free, keyless, CORS-enabled).
- `api.js` is the unified layer: it tries **AniList first**, and if that fails it
  falls back to **Jikan** (MyAnimeList).
- Both are **normalized into one shape** (title, image, score, status, genres…),
  so the UI never knows or cares which backend served the data.
- Every query parameter is **whitelist-validated**, and responses are **cached
  in-memory** to respect rate limits.

---

## 5. Security model (defense in depth)

| Layer | Protection |
|---|---|
| CSP header | Restricts scripts/styles/images to allowed origins |
| HttpOnly cookie | JS can't steal the session |
| SameSite=Strict | Blocks cross-site request forgery (CSRF) |
| scrypt hashing | Passwords can't be reversed even if the DB leaks |
| Hashed session tokens | A DB leak doesn't expose live sessions |
| Rate limiting | Blocks brute-force login |
| Input validation | No arbitrary input reaches the API |
| React auto-escaping | No XSS from user/API content |
| No secrets in client | Both data APIs are keyless |

---

## 6. Running it locally

```bash
npm install
npm run server    # backend on http://localhost:4000
npm run dev       # frontend on http://localhost:5173 (proxies /api)
```

Open http://localhost:5173. Without Turso env vars, it uses a local SQLite file.

## 7. Deploying for free

1. **Turso** (free) → create a DB → copy URL + read-write token.
2. **Render** (free) → **New → Blueprint** → point at this repo → set `TURSO_URL`
   and `TURSO_AUTH_TOKEN` → deploy.
3. Done — `render.yaml` handles the build, start command, health check, and
   session secret automatically.

---

## 8. Key files to read first

If you want to really understand the code, read in this order:

1. `src/api.js` — the unified data layer (see how AniList + Jikan are combined)
2. `server/db.mjs` — the pluggable database (the clever part)
3. `server/auth.mjs` — how signup/login/sessions work
4. `src/context/WatchlistContext.jsx` — how the watchlist syncs
5. `src/components/MediaCard.jsx` — the core UI component