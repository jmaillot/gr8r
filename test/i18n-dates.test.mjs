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

test("the English greeting line reads 'Thursday, July 24' for a Thursday in July — byte-identical to the WDL/MONL line", () => {
  assert.equal(`${weekdayName(JULY_24, 'long')}, ${monthName(JULY_24, 'long')} ${JULY_24.getDate()}`, 'Thursday, July 24');
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
  assert.match(pop, /import \{ monthName, weekdayName \} from '\.\.\/core\/i18n\.js'/);
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
