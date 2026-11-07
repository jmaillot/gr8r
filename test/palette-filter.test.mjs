/* =====================================================================
   test: palette-filter — the command palette's query matching contract
   (Phase 47, FIX-01).

   The palette advertises two-letter G-nav combos ("G H" → Go to Home);
   their initials must match as a QUERY too: "gh" finds "Go to Home".
   The comparison folds BOTH sides with foldForSearch(), compacts the
   whitespace out, and accepts a plain substring OR an in-order
   subsequence — on top of each other, exactly as palette.js filters.

   The helpers are the tested contract: compactQuery() and isSubseq()
   live in core/utils.js (imported by palette.js, not re-implemented
   here). The G-then-key keydown combo itself is timing-dependent inside
   the keyboard handler and is covered by UAT (commit 5fe7f67).
   ===================================================================== */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { test } from 'node:test';

register(new URL('./helpers/virtual-icons-loader.mjs', import.meta.url));

/* The browser modules read `document` and `navigator` while they load, so those
   globals are stubbed before the modules are imported dynamically (the
   i18n-search precedent). */
globalThis.document = {
  querySelectorAll: () => [],
  querySelector: () => null,
  getElementById: () => null,
  addEventListener: () => {},
  body: {},
  title: '',
};
Object.defineProperty(globalThis, 'navigator', {
  value: { platform: 'Linux', userAgent: 'node' },
  configurable: true,
});

const { foldForSearch, compactQuery, isSubseq } = await import('../src/core/utils.js');

/* The palette's exact comparison, mirrored from src/overlays/palette.js. */
const matches = (query, name) => {
  const q = query.trim();
  const qn = compactQuery(foldForSearch(q).text);
  const n = compactQuery(foldForSearch(name).text);
  return n.includes(qn) || isSubseq(qn, n);
};

test('two-letter initials across words match — the FIX-01 headline case', () => {
  assert.ok(matches('gh', 'Go to Home'), "'gh' must find 'Go to Home'");
  assert.ok(matches('gi', 'Go to Inbox'));
  assert.ok(matches('gt', 'Go to My Tasks'));
  assert.ok(matches('gs', 'Open settings'));
});

test('initials separated by a space match — the subsequence pass', () => {
  assert.ok(matches('g t', 'Go to My Tasks'));
  assert.ok(matches('g h', 'Go to Home'));
});

test('plain substring matching still works on top of the subsequence pass', () => {
  assert.ok(matches('task', 'Create task'));
  assert.ok(matches('home', 'Go to Home'));
});

test('non-subsequence queries never match — no false positives', () => {
  assert.ok(!matches('gh', 'Create task'), "'gh' is not a subsequence of 'Createtask'");
  assert.ok(!matches('zx', 'Go to Home'));
  assert.ok(!matches('hh', 'Go to Home'), "repeated 'h' needs two h's in order");
  assert.ok(!matches('taak', 'Create task'), 'order matters — "taak" skips the r');
});

test('matching is accent-insensitive through foldForSearch — both sides fold', () => {
  assert.ok(matches('elodie', 'Élodie'));
});

test('empty and whitespace queries are handled by the callers, not the helpers', () => {
  /* compactQuery only removes whitespace; the palette short-circuits on !q
     before filtering (palette.js: `if (!q) return true`). */
  assert.equal(compactQuery('  a  b '), 'ab');
  assert.ok(isSubseq('', 'anything'), 'empty needle is trivially a subsequence');
});

test('isSubseq is order-strict and single-pass', () => {
  assert.ok(isSubseq('abc', 'aXbXc'));
  assert.ok(!isSubseq('acb', 'abc'), 'in-order only');
  assert.ok(!isSubseq('abc', 'ab'), 'needle longer than hay never matches');
});
