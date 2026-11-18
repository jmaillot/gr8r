/* =====================================================================
   test: manifest-contract — the static half of the D-13 double pinning
   (Phase 72, plan 72-01). Pins, as exact source substrings / JSON
   field values, the PWA-01 wire contract:

     - server.js three-touch diff (D-12): MIME map entry
       '.webmanifest': 'application/manifest+json' (no charset suffix —
       Chromium rejects charset-annotated manifest types), COMPRESSIBLE
       Set membership, cacheControl() no-cache branch covering
       manifest.webmanifest.
     - public/manifest.webmanifest frozen field set (D-08/D-09):
       name/short_name, standalone display, / id/start_url/scope,
       theme_color #1D1338, background_color #fbfaf8, and exactly four
       icon entries in fixed order (any-192, any-512, maskable-192,
       maskable-512) — apple-touch-icon is head-link-only (D-11).
     - index.html head contract (D-10/D-11): exactly one static
       theme-color meta (#1D1338, no media pair), the rel="manifest"
       link, the iOS metas and the apple-touch-icon link — with the
       rel="icon" swap target untouched (Pitfall 4).

   Pattern: test/browser-push.test.mjs source-as-text + assert-substring.
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..');
const source = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('server.js manifest serving contract (D-12)', () => {
  const server = source('server.js');

  test('MIME map declares .webmanifest as application/manifest+json, without a charset suffix', () => {
    assert.ok(
      server.includes("'.webmanifest': 'application/manifest+json'"),
      "server.js MIME map must contain '.webmanifest': 'application/manifest+json' verbatim (no charset suffix)",
    );
    /* Charset-annotated variants are rejected by Chromium — guard the exact string. */
    assert.ok(
      !server.includes("'application/manifest+json;"),
      'the manifest MIME type must carry no charset suffix',
    );
  });

  test('COMPRESSIBLE is a Set literal containing .webmanifest', () => {
    assert.match(
      server,
      /const COMPRESSIBLE = new Set\(\[[^\]]*'\.webmanifest'[^\]]*\]\)/,
      "COMPRESSIBLE must be a Set literal whose members include '.webmanifest'",
    );
  });

  test('cacheControl() no-cache branch includes manifest.webmanifest alongside index.html and sw.js', () => {
    const fn = server.slice(server.indexOf('function cacheControl('), server.indexOf('function serveStatic('));
    assert.ok(fn.includes("manifest.webmanifest"), 'cacheControl() must name manifest.webmanifest in its no-cache branch');
    assert.ok(fn.includes("path.basename(file) === 'index.html'"), 'no-cache branch must keep index.html');
    assert.ok(fn.includes("path.basename(file) === 'sw.js'"), 'no-cache branch must keep sw.js');
    assert.match(fn, /manifest\.webmanifest.*\)\s+return 'no-cache'/s, 'the manifest condition must return no-cache');
  });
});

describe('public/manifest.webmanifest frozen field set (D-08/D-09)', () => {
  const manifest = JSON.parse(source('public/manifest.webmanifest'));

  test('identity fields: name/short_name "Projects Studio", standalone display', () => {
    assert.equal(manifest.name, 'Projects Studio');
    assert.equal(manifest.short_name, 'Projects Studio');
    assert.equal(manifest.display, 'standalone');
  });

  test('root-domain-only paths: id, start_url and scope all "/"', () => {
    assert.equal(manifest.id, '/');
    assert.equal(manifest.start_url, '/');
    assert.equal(manifest.scope, '/');
  });

  test('colors frozen: theme_color #1D1338, background_color #fbfaf8', () => {
    assert.equal(manifest.theme_color, '#1D1338');
    assert.equal(manifest.background_color, '#fbfaf8');
  });

  test('icons: exactly four entries, fixed order, png, purposes any/any/maskable/maskable', () => {
    assert.equal(manifest.icons.length, 4, 'the manifest declares exactly four icon entries');
    const expected = [
      { src: '/icon-192.png', sizes: '192x192', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', purpose: 'any' },
      { src: '/icon-maskable-192.png', sizes: '192x192', purpose: 'maskable' },
      { src: '/icon-maskable-512.png', sizes: '512x512', purpose: 'maskable' },
    ];
    expected.forEach((icon, i) => {
      assert.equal(manifest.icons[i].src, icon.src, `icon[${i}].src must be ${icon.src}`);
      assert.equal(manifest.icons[i].sizes, icon.sizes, `icon[${i}].sizes must be ${icon.sizes}`);
      assert.equal(manifest.icons[i].type, 'image/png', `icon[${i}].type must be image/png`);
      assert.equal(manifest.icons[i].purpose, icon.purpose, `icon[${i}].purpose must be ${icon.purpose}`);
    });
    /* apple-touch-icon is head-link-only (D-11) — iOS ignores manifest icons. */
    assert.ok(
      !manifest.icons.some(i => i.src.includes('apple-touch')),
      'apple-touch-icon must NOT appear in the manifest icons',
    );
  });
});

describe('index.html head contract (D-10/D-11)', () => {
  const html = source('index.html');

  test('exactly one rel="manifest" link pointing at /manifest.webmanifest', () => {
    assert.equal((html.match(/rel="manifest"/g) || []).length, 1, 'exactly one manifest link');
    assert.ok(html.includes('<link rel="manifest" href="/manifest.webmanifest" />'));
  });

  test('exactly one theme-color meta: static #1D1338, no media attribute (D-10)', () => {
    const metas = html.match(/<meta name="theme-color"[^>]*>/g) || [];
    assert.equal(metas.length, 1, 'exactly one theme-color meta — no light/dark media pair');
    assert.ok(metas[0].includes('content="#1D1338"'), 'theme-color content must be #1D1338');
    assert.ok(!metas[0].includes('media='), 'the theme-color meta must carry no media attribute');
  });

  test('iOS metas present with locked values (D-11)', () => {
    assert.ok(html.includes('<meta name="apple-mobile-web-app-capable" content="yes" />'));
    assert.ok(html.includes('<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />'));
    assert.ok(html.includes('<meta name="apple-mobile-web-app-title" content="Projects Studio" />'));
    assert.ok(html.includes('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />'));
  });

  test('the rel="icon" favicon-swap target is untouched: exactly one, still /favicon.svg (Pitfall 4)', () => {
    assert.equal((html.match(/rel="icon"/g) || []).length, 1, 'exactly one rel="icon" link');
    assert.ok(html.includes('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />'), 'the swap target line is byte-pinned');
  });
});
