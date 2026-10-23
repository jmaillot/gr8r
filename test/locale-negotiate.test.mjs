/* =====================================================================
   test: locale-negotiate — the boot-time locale contracts (LOC-03, LOC-06).

   The behaviour tests run on the leaf layer, which bare Node can import; the
   boot-order and lifecycle tests read the SOURCE, because init() and the actions
   need the DOM. Pitfall 2: no pre-render application may dispatch the re-render
   event — the silent prime is the only pre-render entry point.
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { getLocale, negotiate, primeLocale, setLocale } from '../src/core/i18n.js';

const ROOT = path.join(import.meta.dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const I18N = read('src', 'core', 'i18n.js');
const API = read('src', 'core', 'api.js');
const STORE = read('src', 'core', 'store.js');
const MAIN = read('src', 'main.js');
const ACTIONS = read('src', 'actions', 'actions.js');

/* The source of one top-level function, from its declaration to the next top-level one. */
function bodyOf(src, header) {
  const start = src.indexOf(header);
  assert.notEqual(start, -1, `${header} not found`);
  const rest = src.slice(start + header.length);
  const end = rest.search(/\n(?:export |async function |function |\/\*)/);
  return src.slice(start, start + header.length + (end === -1 ? rest.length : end));
}

test('negotiate maps language subtags to the registry, first supported wins (D-09)', () => {
  assert.equal(negotiate(['fr']), 'fr');
  assert.equal(negotiate(['fr-CA']), 'fr');
  assert.equal(negotiate(['fr-FR', 'en']), 'fr');
  assert.equal(negotiate(['en-GB']), 'en');
  assert.equal(negotiate(['de']), 'en');
  assert.equal(negotiate(['ja', 'fr']), 'fr');
  assert.equal(negotiate([]), 'en');
});

test('negotiate is case-insensitive and tolerates junk entries', () => {
  assert.equal(negotiate(['FR-ca']), 'fr');
  assert.equal(negotiate([null, undefined, '', 'fr']), 'fr');
  assert.equal(negotiate(['xx-fr']), 'en');
});

test('primeLocale resolves unknown codes to base and updates the singleton', async () => {
  try {
    assert.equal(await primeLocale('fr'), 'fr');
    assert.equal(getLocale(), 'fr');
    assert.equal(await primeLocale('klingon'), 'en');
    assert.equal(getLocale(), 'en');
  } finally {
    await setLocale('en');
  }
});

test('primeLocale is silent: no event dispatch, while setLocale still announces (Pitfall 2)', async () => {
  const prime = bodyOf(I18N, 'export async function primeLocale');
  const set = bodyOf(I18N, 'export async function setLocale');
  assert.ok(!prime.includes('gr8r:locale'), 'primeLocale must not mention the locale event');
  assert.ok(!prime.includes('dispatchEvent'), 'primeLocale must not dispatch');
  assert.ok(set.includes("'gr8r:locale'"), 'setLocale keeps the announcement');

  /* Behavioural proof with a stand-in document: priming never dispatches, switching does. */
  const events = [];
  const prev = globalThis.document;
  globalThis.document = {
    documentElement: {},
    dispatchEvent: e => events.push(e.type),
  };
  try {
    await primeLocale('fr');
    assert.deepEqual(events, []);
    assert.equal(document.documentElement.lang, 'fr');
    await setLocale('en');
    assert.deepEqual(events, ['gr8r:locale']);
    assert.equal(document.documentElement.lang, 'en');
  } finally {
    if (prev === undefined) delete globalThis.document;
    else globalThis.document = prev;
    await setLocale('en');
  }
});

test('the demo locale key is dedicated, not the gr8r.v2 document blob (D-15)', () => {
  const key = I18N.match(/LOCALE_STORAGE_KEY = '([^']+)'/)?.[1];
  const blob = STORE.match(/STORE_KEY = '([^']+)'/)?.[1];
  assert.equal(key, 'gr8r.locale');
  assert.ok(blob && key !== blob);
});

test('readStoredLocale / storeLocale round-trip a registry code and reject others', async () => {
  const { readStoredLocale, storeLocale } = await import('../src/core/i18n.js');
  const mem = new Map();
  const prev = globalThis.localStorage;
  globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  try {
    assert.equal(readStoredLocale(), null);
    storeLocale('fr');
    assert.equal(readStoredLocale(), 'fr');
    mem.set('gr8r.locale', 'klingon');
    assert.equal(readStoredLocale(), null);
  } finally {
    if (prev === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = prev;
  }
});

test('api.patchMe PATCHes /api/auth/me and adopts the returned user', () => {
  const m = bodyOf(API, '  async patchMe(patch)');
  assert.ok(m.includes("call('PATCH', '/api/auth/me', patch)"));
  assert.ok(m.includes('applyUser(r.data)'));
});
