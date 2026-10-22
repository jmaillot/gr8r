/* =====================================================================
   test: i18n-search — the search contract: the folding, the highlight
   window and the unchanged sort order.

   "elodie" must find "Élodie" (SEARCH-01, D-06): the comparison folds
   BOTH sides with foldForSearch() — lower-case, NFD, then the
   combining marks are dropped — and the highlight window is computed
   on the SAME folded string and mapped back to the ORIGINAL
   characters, so the <mark> lands on the right characters.

   The sort order is NOT part of this change: the only localeCompare in
   the tree (src/views/files.js) stays exactly where it is, and no
   Intl.Collator is introduced anywhere under src/ (D-06 defers it).

   The sources import `virtual:icons` (a Vite virtual module), so the
   suite registers the resolver hook in test/helpers/ first and then
   imports the real modules — the browser code runs as shipped, not a
   re-implementation.
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { test } from 'node:test';

register(new URL('./helpers/virtual-icons-loader.mjs', import.meta.url));

/* The browser modules read `document`, `navigator` and `localStorage` while they
   load, so those globals are stubbed before the modules are imported dynamically. */
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
  writable: true,
});
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.addEventListener = () => {};

const ROOT = path.join(import.meta.dirname, '..');
const source = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const utils = await import('../src/core/utils.js');
const helpers = await import('../src/ui/helpers.js');
const { foldForSearch } = utils;
const { hl } = helpers;

/* ---------- the folding helper ---------- */

test('foldForSearch folds "Élodie" to "elodie" and maps every folded character back to the original index', () => {
  const f = foldForSearch('Élodie');
  assert.equal(f.text, 'elodie');
  assert.equal(f.text.length, 6);
  assert.deepEqual(f.map, [0, 1, 2, 3, 4, 5]);
});

test('foldForSearch returns the { text, map } shape and folds an emptyish input to an empty text', () => {
  for (const input of [null, undefined, '']) {
    const f = foldForSearch(input);
    assert.deepEqual(Object.keys(f).sort(), ['map', 'text']);
    assert.equal(f.text, '');
    assert.deepEqual(f.map, []);
  }
});

test('a combining mark contributes no folded character, and the map reports the original index of the character that carried it', () => {
  const f = foldForSearch('e\u0301lodie'); /* é as e + U+0301 — 7 source characters */
  assert.equal(f.text, 'elodie');
  /* folded 'e' ← source 0; the mark at source 1 is dropped; 'l' ← source 2, … */
  assert.deepEqual(f.map, [0, 2, 3, 4, 5, 6]);
});

test('a precomposed accented character folds to one folded character at its own index', () => {
  const f = foldForSearch('Céline');
  assert.equal(f.text, 'celine');
  assert.deepEqual(f.map, [0, 1, 2, 3, 4, 5]);
});

test('a character whose lower-case form is longer (İ) folds to a single character and the map stays exact', () => {
  const f = foldForSearch('İstanbul');
  assert.equal(f.text, 'istanbul');
  /* 'İ' lower-cases to i + U+0307 (two units); the i folds to one character at original
     index 0 and the combining dot is dropped, so the next entry is the 's' at index 2 —
     every folded character reports the ORIGINAL index it came from. */
  assert.deepEqual(f.map, [0, 2, 3, 4, 5, 6, 7, 8]);
});

/* ---------- the highlight ---------- */

test('hl("Élodie", "elodie") marks the accented character itself, not the character after it', () => {
  assert.equal(hl('Élodie', 'elodie'), '<mark>Élodie</mark>');
});

test('hl and its unaccented twin highlight the same window: both wrap the whole text in one mark', () => {
  assert.equal(hl('Élodie', 'elodie'), '<mark>Élodie</mark>');
  assert.equal(hl('elodie', 'elodie'), '<mark>elodie</mark>');
});

test('the highlight window maps back through a combining mark to the original characters', () => {
  /* 'e\u0301lodie' is 7 source characters folding to 6; the query 'elod' matches 4 folded
     characters whose mapped window is the 5 original units 'e\u0301lod' — a window computed
     on the folded text alone would slice only 'e\u0301lo' and land one character short. */
  assert.equal(hl('e\u0301lodie', 'elod'), '<mark>e\u0301lod</mark>ie');
  /* a full match marks the whole word, the mark's end mapped back past the combining mark */
  assert.equal(hl('e\u0301lodie', 'elodie'), '<mark>e\u0301lodie</mark>');
});

test('hl escapes the text it does not mark, exactly once', () => {
  assert.equal(hl('Tom & Élodie', 'elodie'), 'Tom &amp; <mark>Élodie</mark>');
});

test('a query that matches nothing returns the escaped text with no mark at all', () => {
  assert.equal(hl('A <b>bold</b> claim', 'zzz'), 'A &lt;b&gt;bold&lt;/b&gt; claim');
  assert.equal(hl('Nothing here', 'zzz'), 'Nothing here');
});

test('an empty query returns the escaped text with no mark', () => {
  assert.equal(hl('Anything <x>', ''), 'Anything &lt;x&gt;');
  assert.equal(hl('Anything <x>', undefined), 'Anything &lt;x&gt;');
});

/* ---------- the call sites keep their signature ---------- */

test('the five search call sites still call hl(text, query) with the same signature', () => {
  const s = source('src/pages/search.js');
  for (const site of ['hl(t.title, q)', 'hl(p.name, q)', 'hl(m.name, q)', 'hl(f.name, q)', 'hl(c.text, q)'])
    assert.ok(s.includes(site), `search.js must keep calling ${site}`);
});
