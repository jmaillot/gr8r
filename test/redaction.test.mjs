// SEARCH-01 (Phase 34): the table-driven leak-test suite for src/lib/redaction.js.
//
// D-13 — a recent-search term is dropped only when it shares a FULL token with a
// hidden project name (after normalization); substring-only collisions survive.
// D-14 — normalization is NFC + toLowerCase on both sides; no diacritic
// stripping ("Café" must not match "cafe"); full Unicode casefold is out of scope.
// D-15 — recent searches remain ONE workspace-wide list (out-of-scope choice,
// pinned so it reads as deliberate).
//
// server.js exports nothing, so this file unit-imports src/lib/redaction.js —
// the only importable server behavior.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { referencesHidden, tokenize } from '../src/lib/redaction.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/* ---- tokenize sanity (the D-14 normalization contract) ---- */

test('tokenize normalizes NFC + lowercase and splits on non-word boundaries', () => {
  assert.deepEqual(tokenize('Sarah Smith'), ['sarah', 'smith']);
  assert.deepEqual(tokenize('  (Sara-Corp)  '), ['sara', 'corp']);
  // NFC vs NFD of é collapse to the same tokens (é = e + U+0301 in NFD).
  assert.deepEqual(tokenize('Cafe\u0301'), tokenize('Caf\u00e9'));
  assert.deepEqual(tokenize(42), [], 'non-string tokenizes to nothing');
  assert.deepEqual(tokenize(''), []);
});

/* ---- D-16 table: {term, hiddenTerms, expected} ----

   (a) hidden "Sarah" vs "sarah smith" (drop) and "Sara Corp" (keep);
   (b) inverse collision: hidden "Sara" vs "Sarah Inc" (keep) and "sara's team" (drop);
   (c) NFC vs NFD encodings of the same accented name match identically both sides;
   (d) hidden "Café" does NOT match "cafe" (no diacritic stripping);
   (e) surrounding punctuation: "(Sarah)" drops; "Sarah's" tokenizes to
       [sarah, s] and shares the full token "sarah" — drop (pinned actual);
   (f) case variants; (g) empty hiddenTerms keeps everything;
   (h) non-string terms are kept and never throw. */

const TABLE = [
  // (a) the canonical Sarah/Sara directions (D-13)
  { term: 'sarah smith', hiddenTerms: ['Sarah'], expected: true, note: 'full token "sarah" shared' },
  { term: 'Sara Corp', hiddenTerms: ['Sarah'], expected: false, note: 'substring-only collision inside longer tokens' },

  // (b) the inverse collision
  { term: 'Sarah Inc', hiddenTerms: ['Sara'], expected: false, note: 'tokens differ: sarah/inc vs sara' },
  { term: "sara's team", hiddenTerms: ['Sara'], expected: true, note: 'apostrophe splits a full "sara" token' },

  // (c) NFC vs NFD both sides
  { term: 'caf\u00e9 plan', hiddenTerms: ['Cafe\u0301'], expected: true, note: 'NFC term vs NFD hidden name' },
  { term: 'cafe\u0301 plan', hiddenTerms: ['Caf\u00e9'], expected: true, note: 'NFD term vs NFC hidden name' },

  // (d) no diacritic stripping
  { term: 'cafe', hiddenTerms: ['Caf\u00e9'], expected: false, note: 'Café must not match cafe' },
  { term: 'Caf\u00e9', hiddenTerms: ['cafe'], expected: false, note: 'the reverse direction stays separate too' },

  // (e) surrounding punctuation
  { term: '(Sarah)', hiddenTerms: ['Sarah'], expected: true, note: 'punctuation stripped by tokenization' },
  { term: "Sarah's", hiddenTerms: ['Sarah'], expected: true, note: 'tokenizes to [sarah, s] — full token shared (pinned actual)' },
  { term: 'sarah.inc', hiddenTerms: ['Sarah'], expected: true, note: 'dot is a token boundary' },

  // (f) case variants
  { term: 'SARAH inc', hiddenTerms: ['sarah'], expected: true },
  { term: 'sarah inc', hiddenTerms: ['SARAH'], expected: true },
  { term: 'Sarah Inc', hiddenTerms: ['SaRaH'], expected: true },

  // (g) empty hiddenTerms keeps everything
  { term: 'sarah', hiddenTerms: [], expected: false },
  { term: 'anything', hiddenTerms: [], expected: false },

  // key/name both contribute hidden terms (hiddenProjectTerms pushes both)
  { term: 'out sprint', hiddenTerms: ['Out of Scope', 'out'], expected: true },
  { term: 'in scope planning', hiddenTerms: ['Out of Scope', 'out'], expected: true, note: 'shares the full token "scope" — the accepted T-34-08 residual' },
];

for (const row of TABLE) {
  test(`table [D-16] "${row.term}" vs [${row.hiddenTerms.join(', ')}] → ${row.expected ? 'DROP' : 'keep'}${row.note ? ` (${row.note})` : ''}`, () => {
    assert.equal(referencesHidden(row.term, row.hiddenTerms), row.expected);
  });
}

/* ---- (h) backstop probes: non-string terms and hostile hidden lists never throw ---- */

test('backstop: non-string terms are kept and never throw', () => {
  for (const term of [null, undefined, 42, {}, [], true]) {
    assert.equal(referencesHidden(term, ['Sarah']), false, `${String(term)} is kept`);
  }
  // A non-string riding a hostile hidden list must not throw either.
  assert.equal(referencesHidden(null, [null, 42, {}]), false);
});

test('backstop: empty hiddenTerms never drops a term', () => {
  assert.equal(referencesHidden('sarah smith', []), false);
  assert.equal(referencesHidden('sarah smith', undefined), false);
  assert.equal(referencesHidden('sarah smith', 'Sarah'), false, 'a non-array hidden list is treated as empty, not string-indexed');
});

/* ---- D-15 pin: recent searches remain ONE workspace-wide list ---- */

test('D-15: recent searches stay a single workspace-wide list — the storage model is unchanged', () => {
  const source = readFileSync(`${ROOT}server.js`, 'utf8');
  // The workspace document carries the one list; redactDoc still scrubs it in place.
  assert.ok(
    /data\.recentSearches = data\.recentSearches\.filter\(term => !referencesHidden\(term, hiddenTerms\)\)/.test(source),
    'redactDoc scrubs the single workspace-wide data.recentSearches list',
  );
  // mergeRecentSearches still merges stored + incoming into one list — no per-user split.
  assert.ok(/function mergeRecentSearches\(/.test(source), 'one merge over the shared list');
  // No per-user recent-search storage exists anywhere.
  assert.ok(!/user_recent_searches/.test(source), 'no per-user recent-searches table');
  assert.ok(!/recent_searches/.test(source), 'no recent-searches side table at all');
});
