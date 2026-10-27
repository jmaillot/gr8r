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
import en from '../src/locales/en.json' with { type: 'json' };
import fr from '../src/locales/fr.json' with { type: 'json' };
import { formatDate, formatTime, isAutoDateFmt, registerCatalogue, setLocale } from '../src/core/i18n.js';
import { prefValue } from '../src/core/prefs.js';

const ROOT = path.join(import.meta.dirname, '..');
const STORE_SOURCE = path.join(ROOT, 'src', 'core', 'store.js');
const UTILS_SOURCE = path.join(ROOT, 'src', 'core', 'utils.js');
const SETTINGS_SOURCE = path.join(ROOT, 'src', 'pages', 'settings.js');
const ACTIONS_SOURCE = path.join(ROOT, 'src', 'actions', 'actions.js');
const PENDING_FIXTURE = path.join(ROOT, 'test', 'fixtures', 'i18n-pending.json');
/* v1.2 archived the Phase 6 section into the milestone ROADMAP when the v1.3
   rewrite replaced the root roadmap (14-VERIFICATION.md advisory, deferred-items.md) —
   the delta record lives there now. */
const ROADMAP = path.join(ROOT, '.planning', 'milestones', 'v1.2-ROADMAP.md');
const CONTEXT = path.join(ROOT, '.planning', 'milestones', 'v1.2-phases', '06-english-extraction-locale-aware-formats', '06-CONTEXT.md');

/* The 24th of July 2026, in the local zone: the fixture every date assertion uses. */
const JULY_24 = new Date(2026, 6, 24);

/* The 1st of October 2026 at 14:30: the sample the settings previews are computed from. */
const SAMPLE_DATE = new Date(2026, 9, 1);
const SAMPLE_TIME = new Date(2026, 9, 1, 14, 30);

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

/* The option values of a sel() call, read from the source. */
function optionValues(source, key) {
  const m = new RegExp(`'${key}',\\s*\\[([\\s\\S]*?)\\n\\s*\\],`).exec(source);
  assert.ok(m, `the ${key} row is still a sel() call`);
  return [...m[1].matchAll(/\['([^']*)'/g)].map(x => x[1]);
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
     write the shared document, because it never imports the store. The esc
     re-export (plan 09-07, IN-02) adds a second specifier of the SAME leaf
     module, so the unique set is what pins the boundary. */
  const specifiers = [...new Set([...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m => m[1]))];
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

/* ---------- the date-format row ---------- */

test('the date-format selector offers auto, d/M, M/d and yyyy-MM-dd', () => {
  const source = fs.readFileSync(SETTINGS_SOURCE, 'utf8');
  assert.deepEqual(optionValues(source, 'dateFmt'), ['auto', 'd/M', 'M/d', 'yyyy-MM-dd']);
});

test('a stored MMM d marks the auto option as selected, and the page writes nothing', () => {
  const source = fs.readFileSync(SETTINGS_SOURCE, 'utf8');
  /* The selected value is COMPUTED, not stored: a document that carries 'MMM d'
     shows the 'auto' option as selected, and the document is not rewritten. */
  assert.match(source, /isAutoDateFmt\(P\.dateFmt\) \? 'auto' : P\.dateFmt/);
  /* The page reads the preference bag and never writes it. */
  assert.ok(!/S\.prefs\[/.test(source), 'the settings page writes to S.prefs');
});

test('the auto preview is computed from the locale date format, never hard-coded', async () => {
  const source = fs.readFileSync(SETTINGS_SOURCE, 'utf8');
  assert.match(source, /\['auto', formatDate\(SAMPLE_DATE, \{ pattern: 'auto', year: 'never' \}\)\]/);
  /* English: the preview is 'Oct 1', the text the hard-coded literal carried. */
  assert.equal(formatDate(SAMPLE_DATE, { pattern: 'auto', year: 'never' }), 'Oct 1');
  /* French: the locale's own shape, never the English one. */
  await inFrench(async () => {
    assert.equal(formatDate(SAMPLE_DATE, { pattern: 'auto', year: 'never' }), '01/10');
  });
});

test('the three explicit previews are catalogue values, and the literals are gone', () => {
  const source = fs.readFileSync(SETTINGS_SOURCE, 'utf8');
  assert.equal(en['settings.dateFormat.dayMonth'], '1/10');
  assert.equal(en['settings.dateFormat.monthDay'], '10/1');
  assert.equal(en['settings.dateFormat.iso'], '2026-10-01');
  for (const key of ['settings.dateFormat.dayMonth', 'settings.dateFormat.monthDay', 'settings.dateFormat.iso']) {
    assert.ok(source.includes(`t('${key}')`), `the row reads ${key} from the catalogue`);
  }
  for (const literal of ['Oct 1', '1/10', '10/1', '2026-10-01', '12-hour (2:30 PM)', '24-hour (14:30)']) {
    assert.ok(!source.includes(literal), `the literal '${literal}' is still in src/pages/settings.js`);
  }
});

/* ---------- the time-format row ---------- */

test('the time-format selector offers auto, 12 and 24, and an unset preference selects auto', () => {
  const source = fs.readFileSync(SETTINGS_SOURCE, 'utf8');
  assert.deepEqual(optionValues(source, 'timeFmt'), ['auto', '12', '24']);
  assert.match(source, /P\.timeFmt \|\| 'auto'/);
});

test('the English text of the two explicit time options is unchanged', () => {
  assert.equal(`${en['settings.timeFormat.h12']} (${formatTime(SAMPLE_TIME, { cycle: '12' })})`, '12-hour (2:30 PM)');
  assert.equal(`${en['settings.timeFormat.h24']} (${formatTime(SAMPLE_TIME, { cycle: '24' })})`, '24-hour (14:30)');
  /* The new option follows the locale: an English clock is 12-hour, a French one
     is 24-hour, and the unset preference is the sentinel's own 'auto'. */
  assert.equal(`${en['settings.timeFormat.auto']} (${formatTime(SAMPLE_TIME, { cycle: 'auto' })})`, 'Automatic (2:30 PM)');
});

test('the catalogue gained the three time labels and renamed no key', () => {
  assert.equal(en['settings.timeFormat.auto'], 'Automatic');
  assert.equal(en['settings.timeFormat.h12'], '12-hour');
  assert.equal(en['settings.timeFormat.h24'], '24-hour');
  /* The 24 keys the catalogue carried before this plan are still there, under the
     same name: a rename would silently break the phase-5 parity lint. */
  const before = [
    'app.name',
    'a11y.dismiss',
    'common.cancel',
    'common.save',
    'common.justNow',
    'common.today',
    'common.tomorrow',
    'common.yesterday',
    'bucket.today',
    'bucket.yesterday',
    'bucket.week',
    'bucket.earlier',
    'unit.byte',
    'unit.kilobyte',
    'unit.megabyte',
    'settings.dateFormat.dayMonth',
    'settings.dateFormat.monthDay',
    'settings.dateFormat.iso',
    'nav.projects',
    'greeting.hello',
    'settings.language.title',
    'task.count',
    'file.count',
    'contract.englishOnly',
  ];
  for (const key of before) assert.ok(Object.hasOwn(en, key), `the key ${key} is still in the catalogue`);
  /* Later plans keep growing the catalogue (06-06 adds the plural objects), so the
     total is a floor, not an equality: the rename proof is the hasOwn loop above. */
  assert.ok(Object.keys(en).length >= before.length + 3);
});

/* ---------- the declared English delta ---------- */

test('the declared English delta is recorded where the phase verification reads it', () => {
  const roadmap = fs.readFileSync(ROADMAP, 'utf8');
  const phase = roadmap.slice(roadmap.indexOf('## Phase 6'), roadmap.indexOf('## Phase 7'));
  assert.ok(phase.length > 0, 'the roadmap carries the phase 6 section');
  assert.match(phase, /time-format selector now shows the new `'auto'` option as selected/);
  const context = fs.readFileSync(CONTEXT, 'utf8');
  assert.match(context, /## Declared English deltas/);
  assert.match(context, /time-format selector gains an `'auto'` option/);
});

/* ---------- the allow-list ---------- */

test('the allow-list lost exactly the literal this plan removed, and stays sorted', () => {
  const pending = JSON.parse(fs.readFileSync(PENDING_FIXTURE, 'utf8'));
  assert.ok(!pending.some(e => e.file === 'src/pages/settings.js' && e.text === 'Oct 1'), 'the stale entry is gone');
  const keys = pending.map(e => `${e.file}::${e.text}`);
  assert.deepEqual(keys, [...keys].sort(), 'the allow-list stays sorted by file then text');
});

/* ---------- the write path ---------- */

test('the preference value is written verbatim: the sentinel survives a save', () => {
  /* The sentinel is the string 'auto' — never a number, never a mapped value. */
  assert.equal(prefValue('dateFmt', 'auto'), 'auto');
  assert.equal(typeof prefValue('dateFmt', 'auto'), 'string');
  assert.equal(prefValue('timeFmt', 'auto'), 'auto');
  assert.equal(typeof prefValue('timeFmt', 'auto'), 'string');
  /* The only coerced key is the numeric week start. */
  assert.equal(prefValue('weekStart', '1'), 1);
  assert.equal(typeof prefValue('weekStart', '1'), 'number');
  /* A stored value is never mapped. */
  assert.equal(prefValue('tz', '(GMT-07:00) Pacific Time'), '(GMT-07:00) Pacific Time');
  /* The stored default carries through untouched too. */
  assert.equal(prefValue('dateFmt', 'MMM d'), 'MMM d');
});

test('both preference writers go through the shared helper', () => {
  const source = fs.readFileSync(ACTIONS_SOURCE, 'utf8');
  assert.match(source, /export \{ prefValue \}/, 'the action module exports the helper');
  const setPref = /A\.setPref = el => \{([\s\S]*?)\n\};/.exec(source);
  assert.ok(setPref, 'A.setPref is still an arrow function');
  assert.match(setPref[1], /S\.prefs\[el\.dataset\.k\] = prefValue\(el\.dataset\.k, el\.dataset\.v\)/);
  const prefSel = /IN\.prefSel = el => \{([\s\S]*?)\n\};/.exec(source);
  assert.ok(prefSel, 'IN.prefSel is still an arrow function');
  assert.match(prefSel[1], /S\.prefs\[k\] = prefValue\(k, el\.value\)/);
});

test('no preference value is compared against auto, and only weekStart is coerced', () => {
  const source = fs.readFileSync(ACTIONS_SOURCE, 'utf8');
  assert.ok(!/===\s*'auto'/.test(source), 'a writer compares a preference value against auto');
  assert.ok(!/!==\s*'auto'/.test(source), 'a writer compares a preference value against auto');
  const writers = [/A\.setPref = el => \{([\s\S]*?)\n\};/.exec(source), /IN\.prefSel = el => \{([\s\S]*?)\n\};/.exec(source)];
  for (const writer of writers) {
    assert.ok(writer, 'the writer is still an arrow function');
    assert.ok(!/parseInt\s*\(/.test(writer[1]), 'a writer parses a preference value');
    assert.ok(!/Number\s*\(/.test(writer[1]), 'a writer converts a preference value');
    assert.ok(!/\+el\./.test(writer[1]), 'a writer coerces a preference value');
  }
});
