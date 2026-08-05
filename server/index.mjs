/**
 * ANIQUEST backend — Express app.
 *
 * - /api/* : auth + watchlist API
 * - production: also serves the built SPA from dist/
 * - development: run the Vite dev server alongside (see vite.config.js proxy)
 */

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import authRouter from './auth.mjs';
import watchlistRouter from './watchlist.mjs';
import {
  securityHeaders,
  jsonBody,
  rateLimit,
  noStore,
  startSessionCleanup,
} from './middleware.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4000;
const isProd = process.env.NODE_ENV === 'production' || process.argv.includes('--prod');
const distDir = path.join(__dirname, '..', 'dist');

const app = express();
app.disable('x-powered-by');
app.use(securityHeaders);
app.use(jsonBody);

/* ---------------- API ---------------- */
app.use('/api', noStore);

app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: Math.round(process.uptime()) });
});

app.use('/api/auth', rateLimit(40, 60 * 1000), authRouter);
app.use('/api/watchlist', watchlistRouter);

// 404 for unknown API routes (no HTML fallback leaking into /api)
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

/* ---------------- Static SPA (production) ---------------- */
if (isProd) {
  if (fs.existsSync(distDir)) {
    // Hashed build assets (index-*.js/css) are content-addressed, so they can
    // be cached forever. index.html must revalidate so updates are picked up.
    app.use(
      express.static(distDir, {
        index: false,
        setHeaders(res, filePath) {
          if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          } else {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
    // SPA fallback for hash routes isn't needed (hash router), but serve index
    // for any unknown path so deep links still work with a server rewrite.
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      res.setHeader('Cache-Control', 'no-cache'); // always revalidate index.html
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    console.warn('WARNING: dist/ not found. Run `npm run build` first.');
  }
}

/* ---------------- Error handler (no stack leaks) ---------------- */
app.use((err, req, res, _next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request too large.' });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON body.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
});

startSessionCleanup();

app.listen(PORT, () => {
  console.log(`AniQuest API listening on http://localhost:${PORT} (mode: ${isProd ? 'production' : 'development'})`);
});
