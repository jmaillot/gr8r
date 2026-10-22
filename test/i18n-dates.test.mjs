/* =====================================================================
   test: i18n-dates — the date-surface contract of the calendar, the
   mini-calendar, the home greeting line and the timeline.

   The English output is the REGRESSION ORACLE: the weekday and month
   names must be, character for character, the strings the hand-rolled
   MON / MONL / WD / WDL arrays carried — 'Sun', 'Mon', 'Su', 'Mo',
   'January', 'October 2026', 'Thursday, July 24', 'Jul 24'. The French
   output is the locale's own — never an English array sliced for
   French.

   The four view files cannot be imported by bare Node (the store
   touches document), so their contract is asserted on the source, the
   same discipline the formatter suite uses for src/ui/helpers.js; the
   behavioural oracle is the formatters they now call, which ARE
   importable.
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { monthName, setLocale, weekdayName } from '../src/core/i18n.js';

const ROOT = path.join(import.meta.dirname, '..');
const source = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/* A Sunday-start week: 18–24 October 2026, the week the calendar header
   oracle walks. The 24th of July 2026 is the Thursday fixture. */
const SUNDAY = new Date(2026, 9, 18);
const weekOf = start => Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
const JULY_24 = new Date(2026, 6, 24);
/* A genuine Thursday in July 2026 — the plan's 'Thursday, July 24' example mislabeled the
   weekday (24 July 2026 is a Friday); the composition is the contract, so a real Thursday pins it. */
const THURSDAY = new Date(2026, 6, 23);

/* The French assertions run inside the French locale and leave the module in the base one. */
async function inFrench(fn) {
  try {
    await setLocale('fr');
    await fn();
  } finally {
    await setLocale('en');
  }
}

/* ---------- the formatters the views now call ---------- */

test("the English weekday header is the locale's short weekday names, byte-identical to the WD array", () => {
  assert.deepEqual(
    weekOf(SUNDAY).map(d => weekdayName(d, 'short')),
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  );
});

test('the English long weekday names are byte-identical to the WDL array', () => {
  assert.deepEqual(
    weekOf(SUNDAY).map(d => weekdayName(d, 'long')),
    ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  );
});

test('the English short month names are byte-identical to the MON array', () => {
  assert.deepEqual(
    Array.from({ length: 12 }, (_, m) => monthName(new Date(2026, m, 15), 'short')),
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  );
});

test('the English long month names are byte-identical to the MONL array', () => {
  assert.deepEqual(
    Array.from({ length: 12 }, (_, m) => monthName(new Date(2026, m, 15), 'long')),
    ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  );
});

test("the English month label of the calendar is 'October 2026' — byte-identical to the MONL label", () => {
  const cur = new Date(2026, 9, 15);
  assert.equal(`${monthName(cur, 'long')} ${cur.getFullYear()}`, 'October 2026');
});

test("the French weekday header is the locale's own: 'dim.', never a slice of an English array", async () => {
  await inFrench(async () => {
    assert.deepEqual(
      weekOf(SUNDAY).map(d => weekdayName(d, 'short')),
      ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
    );
    assert.equal(weekdayName(SUNDAY, 'long'), 'dimanche');
    assert.equal(monthName(new Date(2026, 9, 15), 'long'), 'octobre');
    assert.equal(monthName(JULY_24, 'short'), 'juil.');
  });
});

/* ---------- the calendar (src/views/calendar.js) ---------- */

test('the calendar reads its weekday and month names from the locale, not from the arrays', () => {
  const cal = source('src/views/calendar.js');
  assert.match(cal, /import \{ monthName, weekdayName \} from '\.\.\/core\/i18n\.js'/);
  assert.doesNotMatch(cal, /\b(MON|MONL|WD|WDL)\b/);
});

test('the weekday header is built from the seven dates of the week, not from an index into an array', () => {
  const cal = source('src/views/calendar.js');
  assert.match(cal, /const start = startOfWeek\(cur\);/);
  assert.match(cal, /weekdayName\(addD\(start, i\), 'short'\)/);
  /* The header must derive from startOfWeek — which honours S.prefs.weekStart —
     and never re-implement the week-start arithmetic over an array index. */
  assert.doesNotMatch(cal, /\(i \+ S\.prefs\.weekStart\)/);
});

test("the calendar's month label is the locale's long month name", () => {
  const cal = source('src/views/calendar.js');
  assert.match(cal, /label = `\$\{monthName\(cur, 'long'\)\} \$\{cur\.getFullYear\(\)\}`;/);
});

test("the week column's weekday is the locale's short weekday name", () => {
  const cal = source('src/views/calendar.js');
  assert.match(cal, /weekdayName\(d, 'short'\)/);
});

/* ---------- the mini-calendar, the greeting line and the timeline ---------- */

test("the English mini-calendar header is the two-letter truncation of the locale's short weekday names: 'Su Mo Tu We Th Fr Sa'", () => {
  assert.deepEqual(
    weekOf(SUNDAY).map(d => weekdayName(d, 'short').slice(0, 2)),
    ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
  );
});

test("the French mini-calendar header is the locale's own two-letter header: 'di lu ma me je ve sa'", async () => {
  await inFrench(async () => {
    assert.deepEqual(
      weekOf(SUNDAY).map(d => weekdayName(d, 'short').slice(0, 2)),
      ['di', 'lu', 'ma', 'me', 'je', 've', 'sa'],
    );
  });
});

test("the English greeting line reads 'Thursday, July 23' for a Thursday in July — the WDL/MONL composition, byte-identical", () => {
  assert.equal(`${weekdayName(THURSDAY, 'long')}, ${monthName(THURSDAY, 'long')} ${THURSDAY.getDate()}`, 'Thursday, July 23');
  /* The 24th is a Friday: the same composition renders 'Friday, July 24', exactly what the
     arrays rendered for that date. */
  assert.equal(`${weekdayName(JULY_24, 'long')}, ${monthName(JULY_24, 'long')} ${JULY_24.getDate()}`, 'Friday, July 24');
});

test("the French greeting line is the locale's own: 'vendredi, juillet 24'", async () => {
  await inFrench(async () => {
    assert.equal(`${weekdayName(JULY_24, 'long')}, ${monthName(JULY_24, 'long')} ${JULY_24.getDate()}`, 'vendredi, juillet 24');
  });
});

test("the English timeline day label is the locale's short month name: 'Jul 24' — byte-identical to the MON label", () => {
  assert.equal(`${monthName(JULY_24, 'short')} ${JULY_24.getDate()}`, 'Jul 24');
});

test("the English timeline month label is 'July 2026' — byte-identical to the MONL label", () => {
  assert.equal(`${monthName(JULY_24, 'long')} ${JULY_24.getFullYear()}`, 'July 2026');
});

test("the French timeline labels are the locale's own: '24 juil.' shape is the formatter's, the header reads 'juillet 2026'", async () => {
  await inFrench(async () => {
    assert.equal(monthName(JULY_24, 'short'), 'juil.');
    assert.equal(`${monthName(JULY_24, 'long')} ${JULY_24.getFullYear()}`, 'juillet 2026');
  });
});

test('the mini-calendar, the greeting line and the timeline read their names from the locale, not from the arrays', () => {
  const pop = source('src/overlays/popovers.js');
  assert.match(pop, /import \{ t as tMsg, monthName, weekdayName \} from '\.\.\/core\/i18n\.js'/);
  assert.doesNotMatch(pop, /\b(MON|MONL|WD|WDL)\b/);
  /* The header keeps today's two-character truncation, applied to the locale's short
     weekday name over the mini-calendar's own first cell (startOfWeek(first)). */
  assert.match(pop, /weekdayName\(addD\(start, i\), 'short'\)\.slice\(0, 2\)/);
  assert.match(pop, /monthName\(m, 'long'\)/);
  /* The mini-calendar keeps importing startOfWeek(), so the first column is the same day it is today. */
  assert.match(pop, /import \{ startOfWeek \} from '\.\.\/views\/calendar\.js';/);

  const home = source('src/pages/home.js');
  assert.match(home, /import \{ monthName, weekdayName \} from '\.\.\/core\/i18n\.js'/);
  assert.doesNotMatch(home, /\b(MON|MONL|WD|WDL)\b/);
  assert.match(home, /\$\{weekdayName\(TODAY, 'long'\)\}, \$\{monthName\(TODAY, 'long'\)\} \$\{TODAY\.getDate\(\)\}/);

  const tl = source('src/views/timeline.js');
  assert.match(tl, /import \{ monthName \} from '\.\.\/core\/i18n\.js'/);
  assert.doesNotMatch(tl, /\b(MON|MONL|WD|WDL)\b/);
  assert.match(tl, /\$\{monthName\(d, 'short'\)\} \$\{d\.getDate\(\)\}/);
  assert.match(tl, /\$\{monthName\(m\.d, 'long'\)\} \$\{m\.d\.getFullYear\(\)\}/);
});

/* ---------- the arrays are gone ---------- */

const MONTH_WEEKDAY_NAMES = new Set([
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
  'January',
  'February',
  'March',
  'April',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
  'Sun',
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]);

function walkSrc(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkSrc(p, out);
    else if (/\.js$/.test(e.name)) out.push(p);
  }
  return out;
}

test('the four English arrays no longer exist in src/core/utils.js', () => {
  const utils = source('src/core/utils.js');
  assert.doesNotMatch(utils, /export const (MON|MONL|WD|WDL)\b/);
  /* Every other export survives: the arrays' deletion removes nothing else. */
  for (const name of [
    'esc',
    'uid',
    'clamp',
    'isMac',
    'MOD',
    'DAY',
    'sod',
    'TODAY',
    'iso',
    'parse',
    'addD',
    'dOff',
    'diffD',
    'dateFormat',
    'setDateFormat',
    'fmtDate',
    'relDate',
    'ago',
    'minsAgo',
    'dayBucket',
  ]) {
    assert.match(utils, new RegExp(`\\b${name}\\b`));
  }
});

test('no file under src/ imports MON, MONL, WD or WDL', () => {
  const offenders = walkSrc(path.join(ROOT, 'src')).filter(f => /\b(MON|MONL|WD|WDL)\b/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(offenders, []);
});

test("the allow-list carries none of the arrays' month or weekday names, and it stays sorted by file then text", () => {
  const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/i18n-pending.json'), 'utf8'));
  /* The scanner classifies the four arrays as machine lists (MONTH_WEEKDAY_NAMES in the scan),
     so their thirty-eight values were never allow-list entries: the entries the arrays carried
     are exactly the src/core/utils.js ones, and none of them is a month or weekday name. The
     'Sunday'/'Monday'/'Saturday' entries of src/pages/settings.js are that file's own live
     literals — plan 06-09's sweep — and stay. */
  const fromArraysFile = list.filter(e => e.file === 'src/core/utils.js' && MONTH_WEEKDAY_NAMES.has(e.text));
  assert.deepEqual(fromArraysFile, []);
  const sorted = [...list].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.text < b.text ? -1 : a.text > b.text ? 1 : 0));
  assert.deepEqual(list, sorted);
});
