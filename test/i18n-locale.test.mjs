/* =====================================================================
   test: i18n-locale — the selector path end to end (D-01, D-02, D-03).

   The wiring under test: setLocale() resolves the French
   catalogue and sets the document's language attribute (i18n.js), and the
   gr8r:locale event re-renders the app (main.js). The behaviour tests run
   on the leaf layer, which bare Node can import; the wiring tests read the
   SOURCE, because applyPrefs() and the render loop need the DOM.
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import fr from '../src/locales/fr.json' with { type: 'json' };
import { getLocale, registerCatalogue, setLocale, t } from '../src/core/i18n.js';

const ROOT = path.join(import.meta.dirname, '..');
const THEME_SOURCE = path.join(ROOT, 'src', 'core', 'theme.js');
const I18N_SOURCE = path.join(ROOT, 'src', 'core', 'i18n.js');
const MAIN_SOURCE = path.join(ROOT, 'src', 'main.js');

/* The French assertions run inside the French locale and leave the module in
   the base one — the same discipline as test/i18n-prefs.test.mjs. */
async function inFrench(fn) {
  registerCatalogue('fr', fr);
  try {
    await setLocale('fr');
    await fn();
  } finally {
    await setLocale('en');
  }
}

/* ---------- the French catalogue resolves (D-01) ---------- */

test('setLocale(fr) makes getLocale answer fr and resolves the French catalogue', async () => {
  await inFrench(async () => {
    assert.equal(getLocale(), 'fr', 'the singleton answers the new code');
    assert.equal(t('nav.projects'), 'Projets');
    assert.equal(t('settings.language.title'), 'Langue');
    assert.equal(t('contract.frenchOnly'), 'Français seulement');
    assert.equal(t('file.count', { n: 3 }), '3 fichiers');
  });
  assert.equal(getLocale(), 'en', 'the suite leaves the module in the base locale');
});

test('the French greeting carries a narrow no-break space before the exclamation mark (D-04)', async () => {
  await inFrench(async () => {
    const rendered = t('greeting.hello', { name: 'Léa' });
    assert.equal(rendered, 'Bonjour, Léa !');
    assert.ok(rendered.includes(' !'), 'the exclamation mark is preceded by U+202F, never a plain space');
  });
});

test('the French million takes the many plural category (D-04)', async () => {
  await inFrench(async () => {
    assert.equal(new Intl.PluralRules('fr').select(1000000), 'many', 'the CLDR data resolves 1000000 to many');
    assert.equal(t('task.count', { n: 1000000 }), 'de 1000000 tâches');
    assert.equal(t('task.count', { n: 1 }), '1 tâche');
    assert.equal(t('task.count', { n: 2 }), '2 tâches');
  });
});

test('setLocale(en) restores the English base catalogue', async () => {
  await inFrench(async () => {
    assert.equal(t('nav.projects'), 'Projets');
  });
  assert.equal(t('nav.projects'), 'Projects', 'the base catalogue answers again after the switch back');
});

/* ---------- the document language attribute (D-02) ---------- */

test('setLocale assigns the document language attribute to the resolved code', async ctx => {
  const stub = { documentElement: { lang: '' }, dispatchEvent: () => {} };
  globalThis.document = stub;
  ctx.after(() => {
    delete globalThis.document;
  });
  registerCatalogue('fr', fr);
  try {
    await setLocale('fr');
    assert.equal(stub.documentElement.lang, 'fr', 'the attribute follows the resolved code');
    await setLocale('en');
    assert.equal(stub.documentElement.lang, 'en', 'switching back restores the base code');
  } finally {
    await setLocale('en');
  }
});

/* ---------- the wiring, read from the source (D-01, D-02) ---------- */

test('applyPrefs no longer touches the locale; the label→code map is gone (D-01, LOC-04)', () => {
  const src = fs.readFileSync(THEME_SOURCE, 'utf8');
  assert.doesNotMatch(src, /LANG_TO_LOCALE/, 'the throwaway label→code map is deleted');
  assert.doesNotMatch(src, /Français/, 'the stored label format is gone');
  assert.doesNotMatch(src, /\bp\.lang\b|prefs\.lang/, 'applyPrefs does not read the legacy prefs key');
  assert.doesNotMatch(src, /setLocale|getLocale/, 'locale application moved out of applyPrefs');
});

test('setLocale sets documentElement.lang inside the document guard (D-02)', () => {
  const src = fs.readFileSync(I18N_SOURCE, 'utf8');
  assert.match(src, /document\.documentElement\.lang\s*=\s*target/, 'the attribute follows the resolved code');
  assert.match(src, /typeof document !== 'undefined'/, 'the assignment is guarded for bare Node');
});

test('the boot path carries no hardcoded lang="en" (D-02)', () => {
  const src = fs.readFileSync(MAIN_SOURCE, 'utf8');
  assert.doesNotMatch(src, /documentElement\.lang\s*=\s*['"]en['"]/, 'the boot path must not hardcode English');
});

test('main.js re-renders the app on gr8r:locale, one listener and one re-render', () => {
  const src = fs.readFileSync(MAIN_SOURCE, 'utf8');
  assert.match(src, /addEventListener\(\s*['"]gr8r:locale['"]/, 'the boot registers a gr8r:locale listener');
  assert.match(src, /gr8r:locale['"],\s*\(\)\s*=>\s*render\(\)/, 'the listener delegates to the boot render entry point');
  assert.equal((src.match(/gr8r:locale/g) || []).length, 1, 'exactly one listener, no other call site');
});
