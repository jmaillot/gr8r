/* =====================================================================
   test: i18n-locale — the selector path end to end (D-01, D-02, D-03).

   The wiring under test: setLocale() resolves the French
   catalogue and sets the document's language attribute (i18n.js), and the
   projects:locale event re-renders the app (main.js). The behaviour tests run
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
const UTILS_SOURCE = path.join(ROOT, 'src', 'core', 'utils.js');
const CONSUMERS = [
  'src/overlays/drawer.js',
  'src/overlays/palette.js',
  'src/pages/inbox.js',
  'src/overlays/popovers.js',
  'src/overlays/modals.js',
  'src/shell/layout.js',
];

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

test('main.js re-renders the app on projects:locale, one listener and one re-render', () => {
  const src = fs.readFileSync(MAIN_SOURCE, 'utf8');
  assert.match(src, /addEventListener\(\s*['"]projects:locale['"]/, 'the boot registers a projects:locale listener');
  assert.match(src, /projects:locale['"],\s*\(\)\s*=>\s*render\(\)/, 'the listener delegates to the boot render entry point');
  assert.equal((src.match(/projects:locale/g) || []).length, 1, 'exactly one listener, no other call site');
});

/* ---------- the keyboard-hint modifier is a lazy getter (WR-08, LOC-01) ---------- */

test('utils.js exports modKey as a function and the module-load constant is gone (WR-08)', () => {
  const src = fs.readFileSync(UTILS_SOURCE, 'utf8');
  assert.doesNotMatch(src, /export const MOD\b/, 'the old module-load constant no longer exists');
  assert.match(src, /export const modKey\s*=\s*\(\)\s*=>/, 'modKey is an arrow function, evaluated at call time');
  /* Every consumer imports the getter and calls it — the stale import of the old
     symbol would fail the build on a missing export. */
  for (const file of CONSUMERS) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(src, /\bmodKey\(\)/, `${file} calls modKey() at render`);
    assert.doesNotMatch(src, /\bimport\s*\{[^}]*\bMOD\b[^}]*\}\s*from/, `${file} no longer imports the old constant`);
  }
});

test('modKey() follows the active locale — it reads the catalogue at call time (LOC-01)', async ctx => {
  /* utils.js runs document.querySelectorAll at import; a stub keeps bare Node happy. */
  globalThis.document = { querySelectorAll: () => [] };
  const { modKey } = await import('../src/core/utils.js');
  ctx.after(() => {
    delete globalThis.document;
  });
  /* In the base locale the getter answers the same value t() does, right now. */
  assert.equal(modKey(), t('common.ctrl'), 'the getter and the catalogue agree at call time');
  /* A doctored French catalogue makes the mechanism visible: the EN/FR values of
     common.ctrl coincide today, so the proof of EVALUATION-AT-CALL needs a value
     that differs. registerCatalogue replaces the module's map entry, so no source
     file is touched. */
  registerCatalogue('fr', { ...fr, 'common.ctrl': '⌃' });
  try {
    await setLocale('fr');
    assert.equal(modKey(), '⌃', 'the same getter answers the new locale after a live switch');
  } finally {
    await setLocale('en');
  }
  assert.equal(modKey(), t('common.ctrl'), 'switching back restores the base answer');
});

/* ---------- one escaping table; crypto ids (IN-02, IN-04) ---------- */

test('uid() draws from crypto.getRandomValues: prefixed, distinct over 200 calls, no Math.random', async () => {
  globalThis.document = { querySelectorAll: () => [] };
  const { uid } = await import('../src/core/utils.js');
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const id = uid('t');
    assert.ok(id.startsWith('t'), 'the prefix survives');
    seen.add(id);
  }
  assert.equal(seen.size, 200, '200 calls produce 200 distinct values — the property a collision would corrupt');
  assert.notEqual(uid('t'), uid('t'), 'two consecutive calls differ');
  const utils = fs.readFileSync(UTILS_SOURCE, 'utf8');
  assert.doesNotMatch(utils, /Math\.random/, 'Math.random is gone from the id path');
  assert.match(utils, /getRandomValues/, 'the entropy comes from the crypto global');
});

test('esc in core/utils.js is the escHtml re-export — one escaping table (IN-02)', async () => {
  globalThis.document = { querySelectorAll: () => [] };
  const { esc, escHtml } = await Promise.all([import('../src/core/utils.js'), import('../src/core/i18n.js')]).then(([u, i]) => ({
    esc: u.esc,
    escHtml: i.escHtml,
  }));
  const hostile = '<script>&"\'</script> text & more< >"';
  assert.equal(esc(hostile), escHtml(hostile), 'identical output on a hostile input');
  assert.equal(esc(undefined), '', 'nullish input inerts to an empty string');
  const utils = fs.readFileSync(UTILS_SOURCE, 'utf8');
  assert.match(utils, /export \{ escHtml as esc \} from '\.\/i18n\.js'/, 'the definition is a named re-export, not a second table');
  assert.doesNotMatch(utils, /&amp;/, 'no escaping map is defined in utils.js anymore');
  /* i18n.js is a leaf module (it imports nothing from the app), so the re-export
     cannot create a cycle. */
  const i18n = fs.readFileSync(I18N_SOURCE, 'utf8');
  assert.doesNotMatch(i18n, /from '\.\/utils\.js'|from '\.\.\/core\/utils\.js'/, 'i18n.js stays a leaf module');
});
