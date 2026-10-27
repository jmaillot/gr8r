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
    assert.equal(globalThis.document.documentElement.lang, 'fr');
    await setLocale('en');
    assert.deepEqual(events, ['gr8r:locale']);
    assert.equal(globalThis.document.documentElement.lang, 'en');
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

/* ---- boot order and lifecycle (source assertions: init() and the actions need the DOM) ---- */

const at = (src, needle, from = 0) => {
  const i = src.indexOf(needle, from);
  assert.notEqual(i, -1, `${needle} not found`);
  return i;
};

test('init() primes the negotiated locale before the first server await (D-07)', () => {
  const init = MAIN.slice(at(MAIN, '(async function init()'));
  const prime = at(init, 'await primeLocale(negotiated)');
  assert.ok(init.includes('const negotiated = negotiate()'));
  assert.ok(prime < at(init, 'await api.init()'), 'negotiated prime precedes api.init()');
  assert.ok(prime < at(init, 'render()'), 'and every render');
});

test('demo mode primes its stored locale, else the negotiated one (D-15)', () => {
  assert.ok(MAIN.includes('if (!withServer) await primeLocale(readStoredLocale() || negotiated)'));
});

test('the account locale is applied after api.me() and before the first render (D-11)', () => {
  const init = MAIN.slice(at(MAIN, '(async function init()'));
  const me = at(init, 'const user = await api.me()');
  const adopt = at(init, 'await primeLocale(user.locale)', me);
  assert.ok(adopt > me && adopt < at(init, 'render()', me));
  assert.ok(init.slice(me, adopt).includes('user?.locale'), 'only a non-NULL account locale replaces the negotiated one');
});

test('the migration seed is guarded, account-only, and applies in the same boot (D-04/D-05/D-06)', () => {
  const seed = bodyOf(MAIN, 'async function seedLegacyLocale');
  assert.ok(seed.includes('consumeLegacyLang()'));
  assert.ok(seed.includes('api.user?.locale != null'), 'NULL-only guard');
  assert.ok(seed.includes('legacy !== french'), 'exact legacy French label only');
  assert.ok(seed.includes("api.patchMe({ locale: 'fr' })"));
  assert.ok(!seed.includes('putWorkspace') && !seed.includes('patchWorkspace'), 'never touches the workspace row');
  assert.ok(seed.includes("await primeLocale('fr')"), 'silent, same-boot application');
  assert.ok(!seed.includes('setLocale'), 'never the dispatching switch');
  const init = MAIN.slice(at(MAIN, '(async function init()'));
  const hydrate = at(init, 'await hydrateFromServer(slug)');
  const call = at(init, 'await seedLegacyLocale()');
  assert.ok(call > hydrate && call < at(init, 'render();\n  if (withServer'), 'seed runs after hydration, before the first render');
});

test('the legacy label is captured from the raw doc before applyDoc strips it', () => {
  const h = bodyOf(STORE, 'export async function hydrateFromServer');
  assert.ok(h.indexOf('prefs?.lang') < h.indexOf('applyDoc('), 'capture precedes the strip');
  assert.ok(STORE.includes('export function consumeLegacyLang'));
  const c = bodyOf(STORE, 'export function consumeLegacyLang');
  assert.ok(c.includes('legacyLangLabel = null'), 'consume-style: one read per boot');
});

test('no pre-render locale application in the boot path dispatches the re-render event (Pitfall 2)', () => {
  const init = MAIN.slice(at(MAIN, 'async function seedLegacyLocale'));
  assert.ok(!/\bsetLocale\b/.test(init), 'the boot path uses primeLocale only');
  assert.ok(!MAIN.includes('import { t as tk, setLocale'), 'main.js does not even import setLocale');
});

test('sign-out falls back to the negotiated locale before its render (D-10)', () => {
  const out = bodyOf(ACTIONS, 'A.signOut = async () =>');
  assert.ok(out.includes('primeLocale('));
  assert.ok(out.includes('negotiate()'));
  assert.ok(out.indexOf('primeLocale(') < out.lastIndexOf('render()'));
  assert.ok(out.indexOf('clearLocalCache()') < out.indexOf('primeLocale('));
  assert.ok(!out.includes('setLocale'));
});

test('login, signup and invite-accept adopt the account locale before their renders (D-11)', () => {
  const adopt = bodyOf(ACTIONS, 'async function adoptAccountLocale');
  assert.ok(adopt.includes('api.user?.locale || negotiate()'));
  /* 17-02: doLogin delegates its post-success tail to finishLogin, whose first
     statement is the adoption — same invariant, one indirection further. */
  const finish = bodyOf(ACTIONS, 'async function finishLogin');
  assert.ok(
    finish.indexOf('await adoptAccountLocale()') < finish.indexOf('hydrateFromServer('),
    'finishLogin: adoption before hydration and the render that follows',
  );
  for (const [header, call] of [
    ['A.doLogin = () =>', 'api.login('],
    ['A.doJoin = () =>', 'api.acceptInvite(j.token'],
    ['A.doSignup = () =>', 'api.signup('],
  ]) {
    const fn = bodyOf(ACTIONS, header);
    const ok = fn.indexOf('await adoptAccountLocale()');
    if (header === 'A.doLogin = () =>') {
      const delegated = fn.indexOf('await finishLogin(');
      assert.ok(delegated > fn.indexOf(call), `${header}: the finishLogin delegation is after the auth call`);
      continue;
    }
    assert.ok(ok > fn.indexOf(call), `${header}: adoption after the auth call`);
    assert.ok(ok < fn.indexOf('hydrateFromServer('), `${header}: adoption before hydration and the render that follows`);
  }
});
