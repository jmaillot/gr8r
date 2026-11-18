/* =====================================================================
   PHASE 72 MANIFEST (plan 72-01, PWA-01 / D-13 half two): the manifest
   serves over the live static pipeline with the exact wire contract —
   status 200, MIME application/manifest+json (no charset suffix;
   Chromium rejects charset-annotated manifest types), Cache-Control
   no-cache (fresh manifest on every fetch, like index.html and sw.js),
   and a parseable JSON body carrying the frozen field set (D-08/D-09).

   Header-only via the Playwright request API — no browser page needed;
   the webServer fixture boots e2e/server.mjs (built dist, throwaway
   DATA_DIR) exactly like the rest of the suite.
   ===================================================================== */
import { test, expect } from '@playwright/test';

const MANIFEST_FIELDS = {
  name: 'Projects Studio',
  short_name: 'Projects Studio',
  id: '/',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  theme_color: '#1D1338',
  background_color: '#fbfaf8',
};

test('GET /manifest.webmanifest returns 200 with content-type application/manifest+json', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('application/manifest+json');
});

test('GET /manifest.webmanifest carries Cache-Control no-cache', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.headers()['cache-control']).toContain('no-cache');
});

test('GET /manifest.webmanifest body parses with the frozen field set (D-08/D-09)', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.status()).toBe(200);
  const manifest = await res.json();
  for (const [field, value] of Object.entries(MANIFEST_FIELDS)) {
    expect(manifest[field], `manifest.${field}`).toBe(value);
  }
  const srcs = manifest.icons.map(i => i.src);
  expect(srcs).toEqual([
    '/icon-192.png',
    '/icon-512.png',
    '/icon-maskable-192.png',
    '/icon-maskable-512.png',
  ]);
});
