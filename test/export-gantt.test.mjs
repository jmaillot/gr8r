/* =====================================================================
   test: export gantt — the pure Timeline geometry module (54-04).
   =====================================================================
   Phase 54 (54-04), R6 + R13. Every column decision of the Timeline
   sheet comes from src/export/gantt.js, so the boundary cases — the
   90/91 axis switch, the one-day bar, the weekly single-week bar,
   the equal-day dependency pair and the inclusive 400-shape cap —
   are pinned here WITHOUT a spreadsheet.

   The module imports NOTHING (it must run in Node and the browser,
   R10): the first test reads the source and fails the suite the
   moment an import or require appears.
   ===================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DAILY_LIMIT_DAYS, SHAPE_CAP,
  toDay, fromDay, dayDiff, padToWeek, makeAxis, columnLetter, buildGantt,
} from '../src/export/gantt.js';
import { buildExportModel } from '../src/export/model.js';
import {
  makeDailyGanttDoc, makeWeeklyGanttDoc, makeBoundaryDocs,
  makeZeroDatedDoc, makeCapDoc, makeFutureDoc,
} from './fixtures/export-fixtures.mjs';

const NOW_DAILY = new Date('2026-03-15T12:00:00Z');
const NOW_WEEKLY = new Date('2026-04-01T12:00:00Z');
const NOW_FUTURE = new Date('2026-05-15T12:00:00Z');

const model = (doc, now) => buildExportModel(doc, 'p_g', { scope: 'all' }, { now });

/* ------------------------------------------------------------------
   module purity
   ------------------------------------------------------------------ */
test('gantt.js imports nothing — it must run in Node and the browser (R10)', () => {
  const src = readFileSync(new URL('../src/export/gantt.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /(^|\n)\s*import[\s(]/, 'an import statement appeared in gantt.js');
  assert.doesNotMatch(src, /require\s*\(/, 'a require call appeared in gantt.js');
});

test('exports carry the plan-locked constants', () => {
  assert.equal(DAILY_LIMIT_DAYS, 90);
  assert.equal(SHAPE_CAP, 400);
});

/* ------------------------------------------------------------------
   date helpers and padding
   ------------------------------------------------------------------ */
test('toDay/fromDay/dayDiff round-trip in UTC', () => {
  assert.equal(fromDay(toDay('2026-03-02')), '2026-03-02');
  assert.equal(dayDiff('2026-03-02', '2026-03-31'), 29);
  assert.equal(dayDiff('1970-01-01', '1970-01-02'), 1);
});

test('padToWeek pads a mid-week start back to Monday and a mid-week end forward to Sunday', () => {
  const p = padToWeek('2026-03-04', '2026-03-11'); // Wed -> Wed
  assert.equal(p.start, '2026-03-02', 'start must be the Monday on or before 2026-03-04');
  assert.equal(p.end, '2026-03-15', 'end must be the Sunday on or after 2026-03-11');
  assert.equal(mondayIndex('2026-03-02'), 0, 'sanity: 2026-03-02 is a Monday');
});

function mondayIndex(iso) {
  return (new Date(toDay(iso) * 86400000).getUTCDay() + 6) % 7;
}

/* ------------------------------------------------------------------
   adaptive axis: the 90/91 boundary (R6 edge, D-54-5)
   ------------------------------------------------------------------ */
test('axis mode is daily at an exactly-90-day padded span and weekly at 91', () => {
  const base = toDay('2026-03-02'); // the fixed Monday
  const daily = makeAxis({ paddedStart: '2026-03-02', paddedEnd: fromDay(base + 89), exportDate: '2026-03-02' });
  assert.equal(daily.spanDays, 90);
  assert.equal(daily.mode, 'daily');
  assert.equal(daily.columns, 90);

  const weekly = makeAxis({ paddedStart: '2026-03-02', paddedEnd: fromDay(base + 90), exportDate: '2026-03-02' });
  assert.equal(weekly.spanDays, 91);
  assert.equal(weekly.mode, 'weekly');
  assert.equal(weekly.columns, 13);
});

test('weekly columns are ceil(spanDays / 7)', () => {
  const base = toDay('2026-03-02');
  const axis = makeAxis({ paddedStart: '2026-03-02', paddedEnd: fromDay(base + 96), exportDate: '2026-03-02' });
  assert.equal(axis.spanDays, 97);
  assert.equal(axis.mode, 'weekly');
  assert.equal(axis.columns, Math.ceil(97 / 7));
  assert.equal(axis.columns, 14);
});

test('columnOf maps the first and last date on both axes', () => {
  const base = toDay('2026-03-02');
  const daily = makeAxis({ paddedStart: '2026-03-02', paddedEnd: fromDay(base + 89), exportDate: '2026-03-02' });
  assert.equal(daily.columnOf('2026-03-02'), 0);
  assert.equal(daily.columnOf(fromDay(base + 89)), daily.columns - 1, 'the last daily date is the last column');

  const weekly = makeAxis({ paddedStart: '2026-03-02', paddedEnd: fromDay(base + 90), exportDate: '2026-03-02' });
  assert.equal(weekly.columnOf('2026-03-02'), 0);
  assert.equal(weekly.columnOf(fromDay(base + 90)), weekly.columns - 1, 'the last weekly date is the last column');
});

test('columnOf throws on a date outside the padded range — never silently clamped', () => {
  const axis = makeAxis({ paddedStart: '2026-03-02', paddedEnd: '2026-03-08', exportDate: '2026-03-02' });
  assert.throws(() => axis.columnOf('2026-03-01'), /outside padded range/);
  assert.throws(() => axis.columnOf('2026-03-09'), /outside padded range/);
});

test('today is columnOf of the export date, and null when the export date lies outside the padded range', () => {
  const axis = makeAxis({ paddedStart: '2026-03-02', paddedEnd: '2026-04-05', exportDate: '2026-03-15' });
  assert.equal(axis.today, axis.columnOf('2026-03-15'));

  const before = makeAxis({ paddedStart: '2026-06-01', paddedEnd: '2026-07-05', exportDate: '2026-05-15' });
  assert.equal(before.today, null, 'a future project must never yield a negative Today column');
  const after = makeAxis({ paddedStart: '2026-01-05', paddedEnd: '2026-02-08', exportDate: '2026-05-15' });
  assert.equal(after.today, null);
});

test('columnLetter: D, Z and AA', () => {
  assert.equal(columnLetter(4), 'D');
  assert.equal(columnLetter(26), 'Z');
  assert.equal(columnLetter(27), 'AA');
});

/* ------------------------------------------------------------------
   bars, milestones and links on the daily fixture
   ------------------------------------------------------------------ */
function dailyGantt() {
  return buildGantt(model(makeDailyGanttDoc(), NOW_DAILY));
}

test('daily bars: first and last column for a known start and due', () => {
  const g = dailyGantt();
  const bar = g.bars.find(b => b.key === 'G-2'); // 2026-03-10 .. 2026-03-20
  assert.ok(bar, 'the G-2 bar exists');
  assert.equal(g.axis.columnOf(bar.start), dayDiff('2026-03-02', '2026-03-10'), 'first column is dayDiff from the padded Monday');
  assert.equal(g.axis.columnOf(bar.due), dayDiff('2026-03-02', '2026-03-20'), 'last column is the due day');
  assert.ok(g.axis.columnOf(bar.due) > g.axis.columnOf(bar.start));
});

test('a start-equals-due task is one column wide on both axes', () => {
  const daily = dailyGantt();
  const oneDay = daily.bars.find(b => b.key === 'G-1');
  assert.equal(oneDay.start, oneDay.due);
  assert.equal(daily.axis.columnOf(oneDay.due) - daily.axis.columnOf(oneDay.start) + 1, 1, 'one column on the daily axis');

  const weekly = buildGantt(model(makeWeeklyGanttDoc(), NOW_WEEKLY));
  const span = weekly.bars.find(b => b.key === 'W-1');
  assert.ok(span.start < span.due, 'sanity: W-1 spans days');
  assert.equal(weekly.axis.mode, 'weekly');
  const oneWeekTask = weekly.bars.find(b => b.key === 'W-2');
  assert.equal(weekly.axis.columnOf(oneWeekTask.due) - weekly.axis.columnOf(oneWeekTask.start) + 1, 1, 'one column on the weekly axis when the task sits inside one week');
});

test('bars sort by start then title, and the first bar is table index 0', () => {
  const g = dailyGantt();
  assert.deepEqual(g.bars.map(b => b.key), ['G-3', 'G-2', 'G-1'], 'sorted by start (03-02, 03-10, 03-20)');
  assert.equal(g.bars[0].row, 0);
  assert.deepEqual(g.bars.map(b => b.row), [0, 1, 2]);
});

test('milestones continue the table index after the bars and sort by date', () => {
  const g = dailyGantt();
  assert.equal(g.milestones.length, 1);
  assert.equal(g.milestones[0].name, 'Launch');
  assert.equal(g.milestones[0].date, '2026-03-15');
  assert.equal(g.milestones[0].statusId, 'done');
  assert.equal(g.milestones[0].row, g.bars.length, 'the first milestone row continues after the last bar with no gap');
});

test('one link per resolvable dependency, carrying the raw predecessor due and successor start', () => {
  const g = dailyGantt();
  assert.equal(g.links.length, 2, 'the archived predecessor is dropped, the two real dependencies survive');
  const normal = g.links[0];
  assert.equal(normal.predRow, 0, 'sorted by succRow then predRow: G-3 -> G-2 first');
  assert.equal(normal.succRow, 1);
  assert.equal(normal.predDue, '2026-03-04', 'raw predecessor due, before the successor starts');
  assert.equal(normal.succStart, '2026-03-10');
});

test('the equal-day pair yields exactly one link whose predDue equals its succStart (D-54-6)', () => {
  const g = dailyGantt();
  const equal = g.links.filter(l => l.predDue === l.succStart);
  assert.equal(equal.length, 1, 'the G-2 -> G-1 pair (both 2026-03-20) survives as exactly one link');
  assert.equal(equal[0].predRow, 1);
  assert.equal(equal[0].succRow, 2);
});

test('a dependency on an archived task produces no link (T-54-15)', () => {
  const g = dailyGantt();
  assert.ok(!g.bars.some(b => b.key === 'G-0'), 'the archived row never becomes a bar');
  assert.equal(g.links.filter(l => l.predDue === '2026-03-06').length, 0, 'no connector to the archived due date');
});

/* ------------------------------------------------------------------
   adaptive fixtures and the cap (R13)
   ------------------------------------------------------------------ */
test('the one-month fixture stays daily; the >91-day fixture is weekly', () => {
  const daily = dailyGantt();
  assert.equal(daily.axis.mode, 'daily');
  assert.equal(daily.axis.spanDays, 35, 'padded Monday 03-02 to Sunday 04-05');

  const weekly = buildGantt(model(makeWeeklyGanttDoc(), NOW_WEEKLY));
  assert.equal(weekly.axis.mode, 'weekly');
  assert.equal(weekly.axis.spanDays, 182, 'padded Monday 01-05 to Sunday 07-05 (project due 06-30)');
  assert.equal(weekly.axis.columns, Math.ceil(182 / 7));
});

test('boundary docs: padded spans land on the exact weekly multiples around the limit', () => {
  const { daily, weekly } = makeBoundaryDocs();
  const d = buildGantt(model(daily, NOW_WEEKLY));
  assert.equal(d.axis.mode, 'daily');
  assert.equal(d.axis.spanDays, 35);

  const w = buildGantt(model(weekly, NOW_WEEKLY));
  assert.equal(w.axis.mode, 'weekly');
  assert.equal(w.axis.spanDays, 91, 'padded Monday 03-02 to Sunday 05-31 — the first span above the daily limit');
  assert.equal(w.axis.columns, 13);
});

test('zero dated rows: empty arrays, not truncated, axis still spans the project dates and the export date', () => {
  const g = buildGantt(model(makeZeroDatedDoc(), NOW_DAILY));
  assert.deepEqual(g.bars, []);
  assert.deepEqual(g.milestones, []);
  assert.deepEqual(g.links, []);
  assert.equal(g.truncated, false);
  assert.equal(g.axis.columns > 0, true, 'the axis is non-empty');
  assert.equal(g.axis.today, g.axis.columnOf('2026-03-15'), 'the Today marker survives on an empty Gantt');
});

test('the shape cap is inclusive at 400 and truncates at 401 (R13)', () => {
  const exact = buildGantt(model(makeCapDoc(201, 199), NOW_DAILY)); // 201 bars + 199 links
  assert.equal(exact.bars.length + exact.links.length, 400);
  assert.equal(exact.truncated, false, 'exactly 400 shapes still draw');

  const over = buildGantt(model(makeCapDoc(201, 200), NOW_DAILY)); // 201 bars + 200 links
  assert.equal(over.bars.length + over.links.length, 401);
  assert.equal(over.truncated, true, '401 shapes degrade to the note row');
});

test('milestone diamonds sit outside the shape budget — bars + links only are counted', () => {
  /* 201 bars + 199 links = 400 shapes plus a milestone: still under the cap. */
  const doc = makeCapDoc(201, 199);
  doc.projects[0].milestones = [{ id: 'ms_cap', name: 'Cap milestone', date: '2026-03-10' }];
  const g = buildGantt(model(doc, NOW_DAILY));
  assert.equal(g.bars.length + g.links.length, 400);
  assert.equal(g.truncated, false, 'the milestone diamond does not consume the budget');
  assert.equal(g.milestones.length, 1);
});

test('a future project yields axis.today null and untouched bars', () => {
  const g = buildGantt(model(makeFutureDoc(), NOW_FUTURE));
  assert.equal(g.axis.today, null);
  assert.equal(g.bars.length, 2);
  assert.equal(g.links.length, 0);
});
