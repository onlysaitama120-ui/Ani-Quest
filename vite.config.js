import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Security headers.
 * - `preview` (production build) gets a strict Content-Security-Policy.
 * - `dev` runs on localhost only, so it gets the base headers (a relaxed
 *   CSP would let the React-refresh preamble inline script keep working).
 */

const baseHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
}

const strictCsp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",       // React inline style props
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://graphql.anilist.co https://api.jikan.moe",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ')

const strictHeaders = {
  ...baseHeaders,
  'Content-Security-Policy': strictCsp,
}

export default defineConfig({
  plugins: [react()],
  server: {
    headers: baseHeaders,
    proxy: {
      // API requests go to the backend during development
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    headers: strictHeaders,
  },
  build: {
    target: 'es2020',
    sourcemap: false,
  },
})
