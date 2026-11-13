/* [Phase 58, D-13] Drift guard: server.js cannot import src/core/utils.js
   (browser module — it pulls i18n.js and DOM), so foldForSearch is duplicated
   in search-terms.mjs. This suite pins the DUPLICATE to the ORIGINAL — the
   function body must stay byte-identical (modulo the export keyword) and the
   observable folding behavior must match on an accented fixture — the same
   duplicate-with-drift-pin discipline as test/perm-drift.test.mjs. */
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { foldForSearch, searchTerms } from '../search-terms.mjs';

const utilsSrc = readFileSync(new URL('../src/core/utils.js', import.meta.url), 'utf8');
const termsSrc = readFileSync(new URL('../search-terms.mjs', import.meta.url), 'utf8');

const extractBody = (src, name) => {
  const m = src.match(new RegExp(`function ${name}\\(s\\) \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(m, `${name} body not found — the extraction moved`);
  return m[1];
};

test('search-terms foldForSearch stays byte-identical to src/core/utils.js (D-13 drift guard)', () => {
  const original = extractBody(utilsSrc, 'foldForSearch');
  const duplicate = extractBody(termsSrc, 'foldForSearch');
  assert.equal(duplicate, original, 'foldForSearch drifted between src/core/utils.js and search-terms.mjs');
});

test('accented fixture folds identically on both sides (SEARCH-04: "elodie" finds "Élodie")', () => {
  assert.equal(foldForSearch('Élodie fiche carte').text, 'elodie fiche carte');
  const { text, map } = foldForSearch('Élodie');
  assert.equal(text, 'elodie');
  /* The original-index map still lands on the accented characters. */
  assert.deepEqual(map, [0, 1, 2, 3, 4, 5]);
  assert.equal(foldForSearch('').text, '');
  assert.equal(foldForSearch(null).text, '');
});

test('searchTerms whitelists [a-z0-9]+ tokens and drops FTS5 operator characters (D-13)', () => {
  assert.deepEqual(searchTerms('Fiche Carte'), ['fiche', 'carte']);
  assert.deepEqual(searchTerms('"quo*te: NEAR(x)"'), ['quo', 'te', 'near'], 'no operator character survives');
  assert.deepEqual(searchTerms('elo'), ['elo']);
  assert.deepEqual(searchTerms('a b 12'), ['12'], 'sub-2-char tokens dropped');
  assert.deepEqual(searchTerms('é'), [], 'D-15: query folds shorter than 2 chars → []');
  assert.deepEqual(searchTerms('a'), [], 'D-15');
  assert.deepEqual(searchTerms(''), [], 'D-15');
  assert.deepEqual(searchTerms(null), [], 'D-15');
  assert.deepEqual(searchTerms('  *  :  '), [], 'operator-only input → []');
});
