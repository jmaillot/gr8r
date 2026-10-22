/* The i18n layer contract: the base lookup, the {name} interpolation, the English fallback,
   the unknown-key fallback, the raw pass-through and the leaf contract. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import en from '../src/locales/en.json' with { type: 'json' };
import { BASE_LOCALE, LOCALES, availableLocales, escHtml, getLocale, registerCatalogue, t } from '../src/core/i18n.js';

test('a base catalogue key returns the string carried by the English catalogue file', () => {
  assert.equal(t('nav.projects'), 'Projects');
  assert.equal(t('nav.projects'), en['nav.projects'], 'the string comes from the catalogue file, not from the module');
});

test('a {name} placeholder is interpolated with the supplied value', () => {
  assert.equal(t('greeting.hello', { name: 'Ada' }), 'Hello, Ada!');
});

test('a placeholder absent from the variables is left untouched', () => {
  assert.equal(t('greeting.hello', {}), 'Hello, {name}!');
});

test('a key that exists nowhere returns the key itself', () => {
  assert.equal(t('demo.missing'), 'demo.missing');
});

test('t returns the raw value: nothing is escaped', () => {
  assert.equal(t('greeting.hello', { name: '<b>' }), 'Hello, <b>!');
});

test('escHtml matches the escape table of esc() in core/utils.js', () => {
  assert.equal(escHtml('<a href="x">&\''), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
});

test('the layer is a leaf: it imports the catalogues and nothing else', () => {
  const source = fs.readFileSync(path.join(import.meta.dirname, '..', 'src', 'core', 'i18n.js'), 'utf8');
  const specifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m => m[1]);
  assert.ok(specifiers.length > 0, 'the module has at least one import specifier');
  for (const specifier of specifiers) {
    assert.ok(specifier.startsWith('../locales/'), `${specifier} points at the locales directory`);
    assert.ok(specifier.endsWith('.json'), `${specifier} points at a JSON catalogue`);
  }
});

test('the module exports the locale registry and the layer surface', () => {
  assert.equal(BASE_LOCALE, 'en');
  assert.deepEqual(
    LOCALES.map(l => l.code),
    ['en', 'fr'],
  );
  assert.ok(Object.isFrozen(LOCALES), 'the registry is frozen');
  assert.equal(getLocale(), 'en');
  assert.equal(typeof registerCatalogue, 'function');
  assert.equal(typeof availableLocales, 'function');
  assert.ok(
    availableLocales().some(l => l.code === 'en'),
    'the base locale is available',
  );
});
