/* =====================================================================
   The tFor contract (phase 36, plan 01, task 1): the locale-parameterized
   translation core. tFor renders per an EXPLICIT locale while the module
   singleton stays untouched, t() delegates to it, an unknown/malformed
   locale clamps to the base locale without throwing, an unknown key
   returns the key itself, and an Intl plural failure degrades to the
   one/other fallback instead of propagating.

   Families:
     1. the per-locale render — FR plural values through tFor with the
        singleton pinned at 'en';
     2. the delegation identity — t(key, vars) ≡ tFor(getLocale(), …);
     3. the clamp — 'xx-YY', null and 'fr-FR' all resolve to EN output;
     4. the fallback — unknown keys return the key, a broken
        Intl.PluralRules.select degrades instead of throwing.
   ===================================================================== */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { t, tFor, getLocale, registerCatalogue } from '../src/core/i18n.js';

registerCatalogue('fr', {
  'test.simple': 'Bonjour',
  'test.plural': { one: '{n} tâche', other: '{n} tâches' },
});

test('tFor renders the FR plural value while the singleton locale stays en', () => {
  assert.equal(getLocale(), 'en');
  assert.equal(tFor('fr', 'test.plural', { n: 2 }), '2 tâches');
  assert.equal(tFor('fr', 'test.plural', { n: 1 }), '1 tâche');
  assert.equal(getLocale(), 'en'); // singleton untouched
});

test('tFor renders the EN catalogue for the base locale', () => {
  assert.equal(tFor('en', 'test.plural', { n: 2 }), 'test.plural'); // EN catalogue has no fixture key → falls back to the key
});

test('t(key, vars) === tFor(getLocale(), key, vars) — the delegation identity', () => {
  assert.equal(t('test.simple'), tFor(getLocale(), 'test.simple'));
  assert.equal(t('test.plural', { n: 3 }), tFor(getLocale(), 'test.plural', { n: 3 }));
  assert.equal(t('no.such.key', { a: 1 }), tFor(getLocale(), 'no.such.key', { a: 1 }));
});

test('an unknown, malformed or null locale clamps to EN output and never throws', () => {
  const en = tFor('en', 'test.simple');
  assert.equal(tFor('xx-YY', 'test.simple'), en);
  assert.equal(tFor(null, 'test.simple'), en);
  assert.equal(tFor(undefined, 'test.simple'), en);
  assert.equal(tFor('fr-FR', 'test.simple'), en);
  assert.equal(tFor('fr-FR', 'test.plural', { n: 2 }), 'test.plural');
});

test('an unknown key returns the key string itself', () => {
  assert.equal(tFor('fr', 'test.missing'), 'test.missing');
  assert.equal(tFor('fr', ''), '');
  assert.equal(tFor('fr', undefined), undefined);
});

test('an Intl.PluralRules failure degrades to the one/other fallback instead of throwing', () => {
  const RealSelect = Intl.PluralRules.prototype.select;
  Intl.PluralRules.prototype.select = function () {
    throw new Error('synthetic Intl failure');
  };
  try {
    assert.equal(tFor('fr', 'test.plural', { n: 2 }), '2 tâches'); // degraded to 'other'
    assert.equal(tFor('fr', 'test.plural', { n: 1 }), '1 tâche'); // degraded to 'one'
  } finally {
    Intl.PluralRules.prototype.select = RealSelect;
  }
});
