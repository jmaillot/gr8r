/* =====================================================================
   PHASE 23 LOGGED-OUT DEEP-LINK CARRY (plan 23-02, LINK-02/D-04): the
   ?next= carry through sign-in is pinned at BOTH carry sites and the
   path-only validator rule is locked against open-redirect drift.

   - Carry site 1 (server): the file-route 302 builds next from its OWN
     url.pathname (T-12-13, unchanged).
   - Carry site 2 (client): the logged-out boot branch in src/main.js
     rewrites the URL to /login?next=<location.pathname> before render.
   - Validator: finishLogin in src/actions/actions.js keeps the exact
     four-clause path-only rule (single leading /, no //, no backslash,
     no ://). server.js and actions.js cannot be imported by a test
     (server boots on load; actions.js pulls the live app store), so the
     static half reads the source as text — the house extraction pattern
     from test/error-codes.test.mjs — and the rule table mirrors the
     predicate verbatim, asserted against the source to stay honest.
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const mainSource = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
const actionsSource = fs.readFileSync(path.join(ROOT, 'src/actions/actions.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

/* Test 1 (static): the logged-out boot branch carries the deep-link path
   from location.pathname only — never a client-supplied next value. */
test('logged-out boot writes /login?next= from location.pathname before render', () => {
  // The carry site exists and builds the URL from location.pathname.
  const carry = mainSource.match(
    /history\.replaceState\(null, '', `\/login\?next=\$\{encodeURIComponent\(location\.pathname\)\}`\)/,
  );
  assert.ok(carry, 'src/main.js must rewrite to /login?next=<encodeURIComponent(location.pathname)>');
  // It is gated on restFromPath — a bare auth route entry must not gain a next.
  assert.match(
    mainSource,
    /if \(restFromPath\) \{\s*\n\s*history\.replaceState\(null, '', `\/login\?next=/,
    'the carry must run only when restFromPath is non-empty (deep link, not a plain auth route)',
  );
  // And the carry site precedes the logged-out render() call.
  const at = mainSource.indexOf(carry[0]);
  const loggedOut = mainSource.indexOf("S.ui.wantedSlug = slugFromPath || null;");
  assert.ok(loggedOut !== -1 && at > loggedOut, 'carry site must live in the logged-out boot branch');
  assert.ok(
    mainSource.indexOf('render();', at) > at && mainSource.indexOf('render();', at) - at < 300,
    'the carry must happen BEFORE the render() call so no paint loses the query param',
  );
  // No other place in main.js may read an incoming next from the query string.
  assert.ok(!mainSource.includes("get('next')"), 'the client must never echo a client-supplied next value');
});

/* Test 2 (static): finishLogin keeps the full four-clause path-only rule. */
test('finishLogin retains the exact path-only validator rule', () => {
  const rule = "next.startsWith('/') && !next.startsWith('//') && !next.includes('\\\\') && !next.includes('://')";
  assert.ok(
    actionsSource.includes(rule),
    'finishLogin must keep the exact four-clause path-only rule: ' + rule,
  );
  // And it still assigns via location.assign on a valid next.
  const idx = actionsSource.indexOf(rule);
  assert.ok(
    actionsSource.includes('location.assign(next)', idx),
    'a valid next must be followed with a full location.assign navigation',
  );
});

/* Test 3 (rule table): the validator predicate mirrored verbatim from the
   source above — deep links pass, every open-redirect shape fails. */
const PATH_ONLY = (next) =>
  next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') && !next.includes('://');

test('deep-link paths pass the path-only validator', () => {
  for (const good of ['/w/acme/task/K-12', '/w/acme/file/abc_123', '/w/acme']) {
    assert.ok(PATH_ONLY(good), `expected ${good} to pass`);
  }
});

test('open-redirect shapes are rejected by the path-only validator', () => {
  const malicious = [
    '//evil.example',
    'https://evil.example',
    'http://evil.example',
    '/a\\b',
    '\\\\evil.example',
    'javascript:alert(1)',
    'https://evil.example/w/acme',
  ];
  for (const bad of malicious) {
    assert.ok(!PATH_ONLY(bad), `expected ${bad} to be rejected`);
  }
});

/* Test 4 (static): the server file-route carry still echoes its own pathname only. */
test('the server file-route 302 still builds next from url.pathname only', () => {
  assert.match(
    serverSource,
    /const next = `\/login\?next=\$\{encodeURIComponent\(url\.pathname\)\}`;/,
    'the server carry must build next ONLY from its own url.pathname',
  );
  assert.match(
    serverSource,
    /next\.startsWith\('\/'\) && !next\.startsWith\('\/\/'\) && !next\.includes\('\\\\'\) && !next\.includes\(':\/\/'\)/,
    'the server carry keeps its defense-in-depth leading-slash assertion',
  );
});
