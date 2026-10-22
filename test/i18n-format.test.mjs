/* =====================================================================
   test: i18n-format — the formatter contract.

   The English output is the REGRESSION ORACLE: the formatters must
   reproduce, character for character, what the hand-rolled fmtDate(),
   relDate(), ago(), dayBucket() and fsize() produced. The French output
   is the roadmap's success criterion: '24/07/2026', a 24-hour clock and
   'il y a 2 jours' — never 'avant-hier'.

   Every branch of the replaced functions is pinned here, including the
   ones today's code reaches by accident: a relative day of MINUS two
   days falls through to the date, and ago() rounds its minutes.
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import en from '../src/locales/en.json' with { type: 'json' };
import fr from '../src/locales/fr.json' with { type: 'json' };
import {
  bucketLabel,
  dayBucketId,
  formatDate,
  formatFileSize,
  formatNumber,
  formatRelativeDay,
  formatRelativeTime,
  formatTime,
  isAutoDateFmt,
  monthName,
  registerCatalogue,
  setLocale,
  weekdayName,
} from '../src/core/i18n.js';

const ROOT = path.join(import.meta.dirname, '..');
const I18N_SOURCE = path.join(ROOT, 'src', 'core', 'i18n.js');

/* The 24th of July 2026, in the local zone: the fixture every date assertion uses. */
const JULY_24 = new Date(2026, 6, 24);
const EVENING = new Date(2026, 6, 24, 20, 30);

/* A date shifted by whole days, in the local zone. */
const shift = (days, from = new Date()) => {
  const d = new Date(from.getTime());
  d.setDate(d.getDate() + days);
  return d;
};

const ago = ms => Date.now() - ms;

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

/* ---------- the English oracle ---------- */

test('the English date is the locale form: Jul 24, and the long form adds the year', () => {
  /* The base form is the locale's date form without a year: 'Jul 24'. The 'never' mode pins it
     literally, whatever the current year is. */
  assert.equal(formatDate(JULY_24, { year: 'never' }), 'Jul 24');
  assert.equal(formatDate(JULY_24, { year: 'always' }), 'Jul 24, 2026');
  assert.equal(formatDate(JULY_24, { long: true }), 'Jul 24, 2026');
  /* The automatic rule: the year appears when it differs from the current one, exactly as the
     hand-rolled fmtDate() did. */
  const expected = new Date().getFullYear() === 2026 ? 'Jul 24' : 'Jul 24, 2026';
  assert.equal(formatDate(JULY_24), expected);
});

test('the English date is never dateStyle short', () => {
  /* dateStyle:'short' renders '7/24/26' in English: the interface must keep 'Jul 24'. */
  assert.notEqual(formatDate(JULY_24, { year: 'never' }), '7/24/26');
  assert.equal(formatDate(JULY_24, { year: 'never' }), 'Jul 24');
});

test('an explicit date pattern always wins, in every locale', async () => {
  for (const locale of ['en', 'fr']) {
    const run = async () => {
      assert.equal(formatDate(JULY_24, { pattern: 'd/M' }), '24/7', `${locale} d/M`);
      assert.equal(formatDate(JULY_24, { pattern: 'd/M', long: true }), '24/7/2026', `${locale} d/M long`);
      assert.equal(formatDate(JULY_24, { pattern: 'M/d' }), '7/24', `${locale} M/d`);
      assert.equal(formatDate(JULY_24, { pattern: 'M/d', long: true }), '7/24/2026', `${locale} M/d long`);
      assert.equal(formatDate(JULY_24, { pattern: 'yyyy-MM-dd' }), '2026-07-24', `${locale} yyyy-MM-dd`);
    };
    if (locale === 'fr') await inFrench(run);
    else await run();
  }
});

test('the auto sentinel is the stored default and an unknown pattern falls back to it', () => {
  assert.equal(isAutoDateFmt('auto'), true);
  assert.equal(isAutoDateFmt('MMM d'), true);
  assert.equal(isAutoDateFmt('d/M'), false);
  assert.equal(isAutoDateFmt('M/d'), false);
  assert.equal(isAutoDateFmt('yyyy-MM-dd'), false);
  assert.equal(isAutoDateFmt(''), false);
  /* An unknown value never reaches an Intl constructor: it falls back to the locale form. */
  assert.equal(formatDate(JULY_24, { pattern: 'nonsense' }), formatDate(JULY_24));
});

/* ---------- the relative day ---------- */

test('the relative day is Today, Tomorrow, Yesterday', () => {
  assert.equal(formatRelativeDay(shift(0)), 'Today');
  assert.equal(formatRelativeDay(shift(1)), 'Tomorrow');
  assert.equal(formatRelativeDay(shift(-1)), 'Yesterday');
});

test('a relative day of plus two days is the weekday name', () => {
  const d = shift(2);
  const weekday = new Intl.DateTimeFormat('en', { weekday: 'short' }).format(d);
  assert.equal(formatRelativeDay(d), weekday);
  assert.notEqual(formatRelativeDay(d), formatDate(d));
});

test('a relative day of MINUS two days is the date, not a weekday', () => {
  /* The branch is asymmetric and it stays so: the hand-rolled relDate() tested n > 1 && n < 7,
     so a date two days in the PAST fell through to fmtDate(). A formatter that used
     Math.abs(n) would render a weekday where the interface renders a date. */
  const d = shift(-2);
  const weekday = new Intl.DateTimeFormat('en', { weekday: 'short' }).format(d);
  assert.equal(formatRelativeDay(d), formatDate(d));
  assert.notEqual(formatRelativeDay(d), weekday);
});

test('the relative day and the relative time honour an explicit date pattern', () => {
  /* The hand-rolled relDate() and ago() fell through to fmtDate(), which honoured the
     date-format preference: an explicit pattern wins there too. */
  const past = shift(-400);
  assert.equal(formatRelativeDay(past, { pattern: 'd/M' }), formatDate(past, { pattern: 'd/M' }));
  assert.equal(formatRelativeDay(past, { pattern: 'yyyy-MM-dd' }), formatDate(past, { pattern: 'yyyy-MM-dd' }));
  assert.notEqual(formatRelativeDay(past, { pattern: 'd/M' }), formatDate(past), 'the pattern wins over the locale form');
  const ts = ago(9 * 864e5);
  assert.equal(formatRelativeTime(ts, { pattern: 'yyyy-MM-dd' }), formatDate(new Date(ts), { pattern: 'yyyy-MM-dd' }));
});

/* ---------- the relative time ---------- */

test('the relative time is just now, 5m ago, 3h ago, 2d ago', () => {
  assert.equal(formatRelativeTime(ago(10e3)), 'just now');
  assert.equal(formatRelativeTime(ago(5 * 6e4)), '5m ago');
  assert.equal(formatRelativeTime(ago(3 * 36e5)), '3h ago');
  assert.equal(formatRelativeTime(ago(2 * 864e5)), '2d ago');
});

test('the just-now boundary is the ROUNDED minute of the hand-rolled ago()', () => {
  /* Forty seconds old is m = 1: it renders '1m ago', not 'just now'. Ten seconds old is m = 0. */
  assert.equal(formatRelativeTime(ago(40e3)), '1m ago');
  assert.equal(formatRelativeTime(ago(10e3)), 'just now');
});

test('a relative time of nine days is the date', () => {
  const ts = ago(9 * 864e5);
  assert.equal(formatRelativeTime(ts), formatDate(new Date(ts)));
});

/* ---------- the day bucket ---------- */

test('the day bucket is a stable id, never a label', () => {
  assert.equal(dayBucketId(shift(0)), 'today');
  assert.equal(dayBucketId(shift(-1)), 'yesterday');
  assert.equal(dayBucketId(shift(-2)), 'week');
  assert.equal(dayBucketId(shift(-6)), 'week');
  assert.equal(dayBucketId(shift(-8)), 'earlier');
});

test('the bucket label is a catalogue value', () => {
  assert.equal(bucketLabel('today'), 'Today');
  assert.equal(bucketLabel('yesterday'), 'Yesterday');
  assert.equal(bucketLabel('week'), 'This week');
  assert.equal(bucketLabel('earlier'), 'Earlier');
});

/* ---------- the number and the file size ---------- */

test('the number is the locale format', async () => {
  assert.equal(formatNumber(1250000), '1,250,000');
  assert.equal(formatNumber(0.45), '0.45');
  await inFrench(async () => {
    /* The French thousands separator is the narrow no-break space (U+202F). */
    assert.equal(formatNumber(1250000), '1\u202F250\u202F000');
    assert.equal(formatNumber(0.45), '0,45');
  });
});

test('the English file size is byte-identical to the hand-rolled fsize()', () => {
  assert.equal(formatFileSize(512), '512 B');
  assert.equal(formatFileSize(1024), '1 KB');
  assert.equal(formatFileSize(1536), '2 KB');
  assert.equal(formatFileSize(1048576), '1.0 MB');
  assert.equal(formatFileSize(1048576 * 1.5), '1.5 MB');
  /* The number is the locale's number format, so a four-digit kilobyte count is grouped. */
  assert.equal(formatFileSize(1048575), '1,024 KB');
});

test('the French file size groups with the narrow no-break space and uses the French unit', async () => {
  await inFrench(async () => {
    /* Just under a mebibyte: 1 024 ko, with the narrow no-break space (U+202F) as the French
       thousands separator. */
    assert.equal(formatFileSize(1048575), '1\u202F024 ko');
    assert.equal(formatFileSize(1048576), '1,0 Mo');
    assert.equal(formatFileSize(512), '512 o');
  });
});

/* ---------- the clock ---------- */

test('the clock is locale driven', async () => {
  assert.equal(formatTime(EVENING), '8:30 PM');
  assert.equal(formatTime(EVENING, { cycle: '12' }), '8:30 PM');
  assert.equal(formatTime(EVENING, { cycle: '24' }), '20:30');
  await inFrench(async () => {
    assert.equal(formatTime(EVENING), '20:30');
    assert.equal(formatTime(EVENING, { cycle: '24' }), '20:30');
  });
});

/* ---------- the month and the weekday ---------- */

test('the month and the weekday come from the locale', async () => {
  assert.equal(monthName(JULY_24), 'July');
  assert.equal(monthName(JULY_24, 'short'), 'Jul');
  assert.equal(weekdayName(JULY_24), 'Friday');
  assert.equal(weekdayName(JULY_24, 'short'), 'Fri');
  await inFrench(async () => {
    assert.equal(monthName(JULY_24), 'juillet');
    assert.equal(monthName(JULY_24, 'short'), 'juil.');
    assert.equal(weekdayName(JULY_24), 'vendredi');
    assert.equal(weekdayName(JULY_24, 'short'), 'ven.');
  });
});

/* ---------- the French side of the roadmap ---------- */

test('the French date is 24/07/2026 and the French relative time is il y a 2 jours', async () => {
  await inFrench(async () => {
    assert.equal(formatDate(JULY_24), '24/07/2026');
    assert.equal(formatRelativeTime(ago(2 * 864e5)), 'il y a 2 jours');
    assert.notEqual(formatRelativeTime(ago(2 * 864e5)), 'avant-hier');
    assert.equal(formatRelativeTime(ago(1 * 864e5)), 'il y a 1 jour');
  });
});

/* ---------- the cache ---------- */

test('a formatter instance is built once per locale and option set', () => {
  const real = Intl.DateTimeFormat;
  let built = 0;
  Intl.DateTimeFormat = new Proxy(real, {
    construct(target, args) {
      built++;
      return Reflect.construct(target, args);
    },
  });
  try {
    const before = built;
    /* The narrow month name is an option set nothing else in this file uses, so the first
       call here is the first construction of THAT formatter. */
    monthName(JULY_24, 'narrow');
    const afterFirst = built;
    assert.equal(afterFirst, before + 1, 'the first call builds the formatter');
    monthName(JULY_24, 'narrow');
    assert.equal(built, afterFirst, 'the second call reuses the instance');
  } finally {
    Intl.DateTimeFormat = real;
  }
});

/* ---------- the static contract ---------- */

test('the English byte units are catalogue values, not inline JavaScript', () => {
  const source = fs.readFileSync(I18N_SOURCE, 'utf8');
  for (const unit of ['B', 'KB', 'MB']) {
    assert.ok(!new RegExp(`(['"\`])${unit}\\1`).test(source), `the literal '${unit}' does not appear in src/core/i18n.js`);
  }
  assert.equal(en['unit.byte'], 'B');
  assert.equal(en['unit.kilobyte'], 'KB');
  assert.equal(en['unit.megabyte'], 'MB');
});

test('fsize() delegates to the locale file-size formatter and keeps its arity', () => {
  /* The helper cannot be imported by bare Node (core/store.js reaches a Vite virtual module),
     so the delegation is asserted on the source: the name, the single argument and the call
     to formatFileSize() are what the two call sites in actions.js depend on. */
  const source = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'helpers.js'), 'utf8');
  const body = /export function fsize\(b\) \{([\s\S]*?)\n\}/.exec(source);
  assert.ok(body, 'fsize() is still exported with its single argument');
  assert.match(body[1], /formatFileSize\(/, 'fsize() delegates to formatFileSize()');
  for (const unit of ['B', 'KB', 'MB']) {
    assert.ok(!body[1].includes(`' ${unit}'`), `the inline unit '${unit}' is gone from fsize()`);
  }
});

test('the module keeps its leaf contract: it imports the catalogues and nothing else', () => {
  const source = fs.readFileSync(I18N_SOURCE, 'utf8');
  const specifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m => m[1]);
  assert.ok(specifiers.length > 0, 'the module has at least one import specifier');
  for (const specifier of specifiers) {
    assert.ok(specifier.startsWith('../locales/'), `${specifier} points at the locales directory`);
    assert.ok(specifier.endsWith('.json'), `${specifier} points at a JSON catalogue`);
  }
});
