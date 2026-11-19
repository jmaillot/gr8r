/* =====================================================================
   test: sw-contract — the Service Worker verification pins (Phase 74,
   plan 74-01, D-01/D-04). Proves — with ZERO production code changes —
   that the existing push service worker satisfies PWA-03's
   installability pins:

     - public/sw.js byte identity: sha256 pin against the Phase 48/59
       contract (any drift fails here — STOP-and-justify per milestone
       decision; never update the hash to make the test pass).
     - handler key lines: the notificationclick and push listener
       registrations, as quoted substrings (byte pins, not line pins).
     - manifest↔SW scope agreement: the manifest served at
       /manifest.webmanifest declares scope '/', start_url '/', id '/'
       and standalone display — matching the SW served at /sw.js with
       default (root) scope.
     - server.js no-cache cross-check (light touch, presence only):
       the sw.js basename branch inside cacheControl() — the full
       no-cache contract stays owned by test/manifest-contract.test.mjs.
     - registration integrity (D-04): exactly ONE
       navigator.serviceWorker.register call site repo-wide (counting
       the exact expression, never the registerSw wrapper name —
       src/main.js defines a local registerSw arrow that would inflate
       any name-based count), the '/sw.js' literal, the api.enabled
       gate in push.js, and both main.js boot paths (the load listener
       and the enterApp 59-UAT re-fire).
     → (appended by Task 2 of plan 74-01 — the blocks below this note.)

   Pattern: test/manifest-contract.test.mjs source-as-text +
   assert-substring (and test/browser-push.test.mjs's forbidden-token
   discipline — but this file owns byte identity + registration +
   scope; it does NOT re-implement the forbidden-token regex, that
   contract stays in browser-push.test.mjs untouched).

   Zero new dependencies: node:crypto + node:fs only.
   ===================================================================== */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..');
const source = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/* Phase 48/59 contract: byte-identical proof. Recomputed on every run. */
const SW_HASH_PIN = '7a700dd8cc70ccb20c444707ac0d86871f9abe24999a40497fc22e5a55cc5b8d';

/* Walk a directory for .js files (relative to ROOT), deterministically. */
const jsFiles = dir => {
  const out = [];
  const walk = abs => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absChild = path.join(abs, entry.name);
      if (entry.isDirectory()) walk(absChild);
      else if (entry.name.endsWith('.js')) out.push(path.relative(ROOT, absChild));
    }
  };
  walk(path.join(ROOT, dir));
  return out;
};

describe('public/sw.js byte-identity contract (D-01)', () => {
  const sw = source('public/sw.js');

  test('sha256 of sw.js equals the Phase 48/59 contract pin — zero byte drift', () => {
    const actual = createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'public/sw.js'))).digest('hex');
    assert.equal(
      actual,
      SW_HASH_PIN,
      'public/sw.js drifted from the Phase 48/59 contract — STOP and justify; do NOT update the pin to make this pass',
    );
  });

  test('the notificationclick handler registration line is present verbatim', () => {
    assert.ok(
      sw.includes("self.addEventListener('notificationclick', (e) => {"),
      "sw.js must contain self.addEventListener('notificationclick', (e) => { verbatim",
    );
  });

  test('the push handler registration line is present verbatim', () => {
    assert.ok(
      sw.includes("self.addEventListener('push', (e) => {"),
      "sw.js must contain self.addEventListener('push', (e) => { verbatim",
    );
  });
});

describe('manifest ↔ SW scope agreement (D-01)', () => {
  const manifest = JSON.parse(source('public/manifest.webmanifest'));

  test('manifest scope/start_url/id are all "/" and display is standalone — matching the /sw.js root scope', () => {
    assert.equal(manifest.scope, '/', 'manifest scope must be "/" to agree with the SW at /sw.js root scope');
    assert.equal(manifest.start_url, '/');
    assert.equal(manifest.id, '/');
    assert.equal(manifest.display, 'standalone');
  });
});

describe('server.js sw.js no-cache branch cross-check (D-01, light touch)', () => {
  test('cacheControl() names the sw.js basename in its no-cache branch (full contract owned by manifest-contract.test.mjs)', () => {
    const server = source('server.js');
    assert.ok(
      server.includes("path.basename(file) === 'sw.js'"),
      "server.js cacheControl() must contain the sw.js basename branch: path.basename(file) === 'sw.js'",
    );
  });
});

/* D-04 registration call-site pins land in the same file (Task 2 of
   plan 74-01) — appended below the D-01 blocks. */

