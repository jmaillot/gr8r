/* =====================================================================
   test: i18n-prefs — the preference contract.

   The 'auto' sentinel is resolved at READ time (D-04): the stored 'MMM d'
   means "follow the locale", the three explicit patterns always win, and
   nothing is ever written back — no document is rewritten, no revision
   moves, and the sentinel survives a save because the preference writers
   carry the value through verbatim.

   The node suite has no browser: the store's save path writes to
   localStorage and to the server, and src/actions/actions.js reaches a
   Vite virtual module, so bare Node cannot import it. The assertions
   that need the DOM's absence are therefore made on the SOURCE, and the
   ones that need behaviour are made on the leaf layer, which bare Node
   CAN import.
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import fr from '../src/locales/fr.json' with { type: 'json' };
import { formatDate, isAutoDateFmt, registerCatalogue, setLocale } from '../src/core/i18n.js';

const ROOT = path.join(import.meta.dirname, '..');
const STORE_SOURCE = path.join(ROOT, 'src', 'core', 'store.js');
const UTILS_SOURCE = path.join(ROOT, 'src', 'core', 'utils.js');

/* The 24th of July 2026, in the local zone: the fixture every date assertion uses. */
const JULY_24 = new Date(2026, 6, 24);

/* The French assertions run inside the French locale and leave the module in the base one. */
async function inFrench(fn) {
  registerCatalogue('fr', fr);
  try {
    await setLocale('fr');
    await fn();
  } finally {
    await setLocale('en');
  }
}

/* The body of an exported function, read from the source. */
function functionBody(source, name) {
  const m = new RegExp(`export function ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`).exec(source);
  assert.ok(m, `${name}() is still exported`);
  return m[1];
}

/* ---------- the sentinel predicate ---------- */

test('the auto sentinel is the stored default and an explicit pattern is not', () => {
  /* 'MMM d' IS the sentinel: the document cannot distinguish a preference that was
     never touched from one the user explicitly picked as the default. */
  assert.equal(isAutoDateFmt('MMM d'), true);
  assert.equal(isAutoDateFmt('auto'), true);
  /* The three explicit choices always win. */
  assert.equal(isAutoDateFmt('d/M'), false);
  assert.equal(isAutoDateFmt('M/d'), false);
  assert.equal(isAutoDateFmt('yyyy-MM-dd'), false);
  /* An absent value is NOT the sentinel: it is the default, and the default IS
     'MMM d', so the value the bag actually carries is the sentinel. */
  assert.equal(isAutoDateFmt(undefined), false);
  assert.equal(isAutoDateFmt(null), false);
  assert.equal(isAutoDateFmt(''), false);
});

/* ---------- the resolution ---------- */

test('a stored MMM d renders the locale date form: Jul 24', () => {
  assert.equal(formatDate(JULY_24, { pattern: 'MMM d', year: 'never' }), 'Jul 24');
  assert.equal(formatDate(JULY_24, { pattern: 'auto', year: 'never' }), 'Jul 24');
  /* The automatic year rule is the hand-rolled one: the year appears when it
     differs from the current one. */
  const expected = new Date().getFullYear() === 2026 ? 'Jul 24' : 'Jul 24, 2026';
  assert.equal(formatDate(JULY_24, { pattern: 'MMM d' }), expected);
});

test('a stored d/M renders 24/7, in English and in French', async () => {
  const run = async () => {
    assert.equal(formatDate(JULY_24, { pattern: 'd/M' }), '24/7');
  };
  await run();
  await inFrench(run);
});

/* ---------- the read is free of writes ---------- */

test('resolving the preference never writes: neither setDateFormat() nor fmtDate() saves', () => {
  const source = fs.readFileSync(UTILS_SOURCE, 'utf8');
  for (const name of ['setDateFormat', 'fmtDate']) {
    const body = functionBody(source, name);
    assert.ok(!/\bsave\s*\(/.test(body), `${name}() calls save()`);
    assert.ok(!/S\.prefs/.test(body), `${name}() writes to S.prefs`);
  }
  /* fmtDate() only READS the pattern: it never rewrites it. */
  assert.ok(!/dateFormat\s*=/.test(functionBody(source, 'fmtDate')), 'fmtDate() rewrites the pattern');
  /* The date API of utils.js reaches the leaf layer and nothing else: it cannot
     write the shared document, because it never imports the store. */
  const specifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m => m[1]);
  assert.deepEqual(specifiers, ['./i18n.js']);
});

test('the sentinel is never resolved at WRITE time: the store never maps a pattern', () => {
  const source = fs.readFileSync(STORE_SOURCE, 'utf8');
  assert.ok(!source.includes('isAutoDateFmt'), 'the store never calls the sentinel predicate');
  assert.ok(!/'auto'/.test(source), 'the store never writes the sentinel');
  assert.ok(!/dateFmt:\s*'auto'/.test(source), "the store never stores 'auto' on its own");
  /* The only dateFmt the store carries is the default: the sentinel's stored form. */
  assert.equal((source.match(/dateFmt:/g) || []).length, 1);
});

/* ---------- the default is the sentinel ---------- */

test('the default date format is the sentinel, so an untouched document follows the locale', () => {
  const source = fs.readFileSync(STORE_SOURCE, 'utf8');
  const block = /export const DEFAULT_PREFS = \{([\s\S]*?)\n\};/.exec(source);
  assert.ok(block, 'DEFAULT_PREFS is still exported');
  const stored = /dateFmt:\s*'([^']*)'/.exec(block[1]);
  assert.ok(stored, 'DEFAULT_PREFS carries a dateFmt');
  assert.equal(stored[1], 'MMM d');
  assert.equal(isAutoDateFmt(stored[1]), true);
  /* timeFmt is genuinely unset today: it is absent from DEFAULT_PREFS and read
     only at the settings page, so it needs no sentinel mapping at all. */
  assert.ok(!/timeFmt:/.test(block[1]), 'DEFAULT_PREFS carries no timeFmt');
});
