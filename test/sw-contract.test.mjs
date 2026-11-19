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
     - (D-04 pins appended by Task 2 — the registration contract block.)

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
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

/* 74-IN-02 (D-77-16): defensive ROOT derivation — import.meta.dirname needs
   Node >= 20.11/21.2; fileURLToPath(import.meta.url) works on every Node
   this suite could ever boot on. Purely defensive (engines pins >=24). */
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
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

/* =====================================================================
   Registration call-site contract (D-04) — appended by Task 2 of
   plan 74-01. Counts the exact expression navigator.serviceWorker.register
   (never the registerSw wrapper name — src/main.js defines a local
   registerSw arrow that would inflate any name-based count, RESEARCH
   Pitfall 1). All pins are quoted substrings, not line numbers
   (RESEARCH Pitfall 2).
   ===================================================================== */

describe('registration call-site contract (D-04)', () => {
  test('exactly ONE navigator.serviceWorker.register call site repo-wide (expression count, not the registerSw name)', () => {
    const files = [...jsFiles('src'), ...jsFiles('public')];
    const combined = files.map(source).join('\n');
    const calls = combined.match(/navigator\.serviceWorker\.register/g) || [];
    assert.equal(
      calls.length,
      1,
      `expected exactly one navigator.serviceWorker.register call site across ${files.length} files, found ${calls.length}`,
    );
  });

  test('the register call is the /sw.js literal with default (root) scope — inside src/core/push.js', () => {
    const push = source('src/core/push.js');
    assert.ok(
      push.includes("navigator.serviceWorker.register('/sw.js')"),
      "src/core/push.js must contain navigator.serviceWorker.register('/sw.js') verbatim (default root scope)",
    );
  });

  test('the api.enabled gate is intact inside the registerSw registration path', () => {
    const push = source('src/core/push.js');
    const GATE_LINE = "if (!('serviceWorker' in navigator) || !api.enabled) return;";
    assert.ok(
      push.includes(GATE_LINE),
      'registerSw must gate registration on the api.enabled check — the push-gated registration contract',
    );
    /* the gate lives on the registerSw export, before the register call.
       74-IN-01 (D-77-15): the anchor is the FULL quoted gate line already
       asserted verbatim above — never a first-substring indexOf (which
       would silently match an earlier !api.enabled mention elsewhere in
       the file). The !== -1 assert is distinct from the includes assert. */
    const exportIdx = push.indexOf('export const registerSw');
    const gateIdx = push.indexOf(GATE_LINE);
    assert.ok(exportIdx !== -1, 'registerSw export must exist in src/core/push.js');
    assert.ok(gateIdx !== -1, 'the full gate line must be locatable as the anchor (74-IN-01: full-line anchor, not first-substring)');
    assert.ok(
      gateIdx > exportIdx && gateIdx < push.indexOf('navigator.serviceWorker.register'),
      'the api.enabled gate must sit inside the registerSw export, before the register call',
    );
  });

  test('74-IN-02: the ROOT derivation survives without import.meta.dirname (fileURLToPath fallback)', () => {
    const self = source('test/sw-contract.test.mjs');
    assert.ok(
      self.includes("path.dirname(fileURLToPath(import.meta.url))"),
      'the ROOT derivation uses the defensive fileURLToPath fallback (D-77-16)',
    );
    assert.ok(self.includes("import { fileURLToPath } from 'node:url';"), 'fileURLToPath is imported from node:url');
    assert.ok(!/\bpath\w*\.\w+\(import\.meta\.dirname/.test(self) && !/= import\.meta\.dirname/.test(self), 'no bare import.meta.dirname usage remains in this file (74-IN-02)');
    /* smoke recompute: the fallback yields the same ROOT the old derivation did */
    const recomputed = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
    assert.equal(path.join(recomputed, 'public', 'sw.js'), path.join(ROOT, 'public', 'sw.js'), 'the fallback ROOT equals the module ROOT');
    assert.ok(fs.existsSync(path.join(ROOT, 'server.js')), 'ROOT resolves to the repo root (server.js present)');
  });

  test('both boot paths intact: the load listener and the enterApp 59-UAT re-fire', () => {
    const main = source('src/main.js');
    assert.ok(
      main.includes("addEventListener('load', registerSw);"),
      "src/main.js must boot the SW via addEventListener('load', registerSw)",
    );
    assert.ok(
      main.includes('registerSw(); // 59-UAT fix'),
      'src/main.js enterApp must re-fire registerSw() with the 59-UAT fix marker (SPA login path)',
    );
  });
});

