/* The i18n layer contract: the base lookup, the {name} interpolation, the English fallback,
   the unknown-key fallback, the raw pass-through and the leaf contract. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import en from '../src/locales/en.json' with { type: 'json' };
import fr from '../src/locales/fr.json' with { type: 'json' };
import { BASE_LOCALE, LOCALES, availableLocales, escHtml, getLocale, registerCatalogue, setLocale, t } from '../src/core/i18n.js';

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

/* ---------- the plural engine ---------- */

const ENGLISH_COUNTS = [
  { n: 0, expected: '0 tasks' },
  { n: 1, expected: '1 task' },
  { n: 2, expected: '2 tasks' },
  { n: 1000000, expected: '1000000 tasks' },
];

const FRENCH_COUNTS = [
  { n: 0, expected: '0 tâche' },
  { n: 1, expected: '1 tâche' },
  { n: 2, expected: '2 tâches' },
  { n: 1000000, expected: 'de 1000000 tâches' },
];

test('the plural engine selects the English CLDR categories', () => {
  for (const { n, expected } of ENGLISH_COUNTS) assert.equal(t('task.count', { n }), expected, `English ${n}`);
});

test('the plural engine selects the French CLDR categories', async () => {
  registerCatalogue('fr', fr);
  try {
    await setLocale('fr');
    for (const { n, expected } of FRENCH_COUNTS) assert.equal(t('task.count', { n }), expected, `French ${n}`);
  } finally {
    await setLocale('en');
  }
});

test('a plural member that is missing falls back to other', async () => {
  registerCatalogue('fr', fr);
  try {
    await setLocale('fr');
    assert.equal(t('file.count', { n: 1000000 }), '1000000 fichiers', 'the French catalogue has no many member for this key');
  } finally {
    await setLocale('en');
  }
});

test('a plural value with neither the selected member nor other makes t return the key', async () => {
  registerCatalogue('fr', { ...fr, 'task.count': { many: '{n} de tâches' } });
  try {
    await setLocale('fr');
    assert.equal(t('task.count', { n: 2 }), 'task.count');
  } finally {
    registerCatalogue('fr', fr);
    await setLocale('en');
  }
});

test('a plural value with no count is a string, never an object', () => {
  assert.equal(t('task.count'), '{n} task');
  assert.equal(typeof t('task.count'), 'string');
});

/* ---------- the locale switch ---------- */

test('the locale is the base locale before any switch', () => {
  assert.equal(getLocale(), 'en');
});

test('the locale switch announces itself with a projects:locale event', async ctx => {
  const events = [];
  globalThis.document = { dispatchEvent: e => events.push(e) };
  ctx.after(() => {
    delete globalThis.document;
  });
  registerCatalogue('fr', fr);
  try {
    await setLocale('fr');
    assert.equal(events.length, 1, 'the switch announces itself exactly once');
    assert.equal(events[0].type, 'projects:locale');
    assert.equal(events[0].detail.code, 'fr');
    assert.equal(getLocale(), 'fr', 'the singleton answers the new code immediately');
    assert.equal(t('nav.projects'), 'Projets', 'the active catalogue is consulted');
    assert.equal(t('contract.frenchOnly'), 'Français seulement', 'the key that exists only in French resolves');
    assert.equal(t('contract.englishOnly'), 'English only', 'a key absent from the active catalogue falls back to English');
  } finally {
    await setLocale('en');
  }
});

test('an unknown locale code resolves to the base locale and still announces the change', async ctx => {
  const events = [];
  globalThis.document = { dispatchEvent: e => events.push(e) };
  ctx.after(() => {
    delete globalThis.document;
  });
  await setLocale('zz');
  assert.equal(getLocale(), 'en', 'an unknown code resolves to the base locale');
  assert.equal(events.length, 1, 'the change is announced');
  assert.equal(events[0].type, 'projects:locale');
  assert.equal(events[0].detail.code, 'en');
});
