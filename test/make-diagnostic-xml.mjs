/* Test 11 diagnostic matrix — one import isolates the Task shape MS
   Project honors on OutlineLevel rows (owner round 4 evidence:
   manual children ALWAYS zero; auto children survive only at PC=100).
   Each variant sits under its own manual summary parent. The owner
   imports this file once and reports the Duration column per row. */
import { writeFileSync } from 'node:fs';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* One Task with a controlled shape. opts: manual, pc, constraint, work,
   estimated, type, dates (bool: emit Start/Finish/Duration). */
function task(uid, name, outlinePath, level, opts) {
  const o = { manual: 1, pc: 0, constraint: true, work: false, estimated: false, type: 1, dates: true, ...opts };
  const start = o.dates ? '<Start>2026-01-06T08:00:00</Start>' : '';
  const finish = o.dates ? '<Finish>2026-01-14T17:00:00</Finish>' : '';
  const duration = o.dates ? '<Duration>PT56H0M0S</Duration>' : '';
  const manualDates = o.manual
    ? '<ManualStart>2026-01-06T08:00:00</ManualStart><ManualFinish>2026-01-14T17:00:00</ManualFinish><ManualDuration>PT56H0M0S</ManualDuration>'
    : '';
  const constraint = o.dates && o.constraint ? '<ConstraintType>4</ConstraintType><ConstraintDate>2026-01-06T08:00:00</ConstraintDate>' : '';
  const work = o.work ? '<Work>PT56H0M0S</Work>' : '';
  const estimated = o.estimated ? '<Estimated>0</Estimated>' : '';
  return (
    `<Task><UID>${uid}</UID><ID>${uid}</ID><Name>${esc(name)}</Name>` +
    `<Manual>${o.manual}</Manual><Type>${o.type}</Type>` +
    `<WBS>${esc(outlinePath)}</WBS><OutlineNumber>${esc(outlinePath)}</OutlineNumber><OutlineLevel>${level}</OutlineLevel>` +
    start + finish + duration + manualDates + '<DurationFormat>7</DurationFormat>' +
    '<Milestone>0</Milestone><Summary>0</Summary>' +
    `<PercentComplete>${o.pc}</PercentComplete>` + estimated +
    constraint + work +
    '</Task>'
  );
}

function summary(uid, name, path) {
  return (
    `<Task><UID>${uid}</UID><ID>${uid}</ID><Name>${esc(name)}</Name>` +
    '<Manual>1</Manual><Type>1</Type>' +
    `<WBS>${path}</WBS><OutlineNumber>${path}</OutlineNumber>` +
    '<Start>2026-01-06T08:00:00</Start><Finish>2026-01-14T17:00:00</Finish><Duration>PT56H0M0S</Duration>' +
    '<ManualStart>2026-01-06T08:00:00</ManualStart><ManualFinish>2026-01-14T17:00:00</ManualFinish><ManualDuration>PT56H0M0S</ManualDuration>' +
    '<DurationFormat>7</DurationFormat><Milestone>0</Milestone><Summary>1</Summary>' +
    '<PercentComplete>0</PercentComplete><ConstraintType>4</ConstraintType><ConstraintDate>2026-01-06T08:00:00</ConstraintDate>' +
    '</Task>'
  );
}

/* 8 variants, each under its own summary. UID: odd = summary, even = child. */
const variants = [
  ['V1 auto PC0 SNET (R2 baseline, expected 0)', { manual: 0, pc: 0, constraint: true }],
  ['V2 auto PC100 SNET (R2 winner, expected 7d)', { manual: 0, pc: 100, constraint: true }],
  ['V3 auto PC0 SNET + Work PT56H', { manual: 0, pc: 0, constraint: true, work: true }],
  ['V4 auto PC0 NO constraint', { manual: 0, pc: 0, constraint: false }],
  ['V5 auto PC0 SNET + Estimated=0', { manual: 0, pc: 0, constraint: true, estimated: true }],
  ['V6 auto PC0 SNET Type=0 (fixed units)', { manual: 0, pc: 0, constraint: true, type: 0 }],
  ['V7 auto PC50 SNET (partial)', { manual: 0, pc: 50, constraint: true }],
  ['V8 auto PC0 SNET dates-omitted', { manual: 0, pc: 0, constraint: true, dates: false }],
];

let uid = 0;
const tasksXml = [];
for (const [label, opts] of variants) {
  uid += 1; const sUid = uid;
  uid += 1; const cUid = uid;
  const pair = variants.findIndex(v => v[0] === label) + 1;
  tasksXml.push(summary(sUid, `S${pair} summary`, `${pair}`));
  tasksXml.push(task(cUid, label, `${pair}.1`, 1, opts));
}

const xml =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<Project xmlns="http://schemas.microsoft.com/project">' +
  '<SaveVersion>14</SaveVersion>' +
  '<Name>Test11 diagnostic matrix</Name>' +
  '<CreationDate>2026-11-17T00:00:00</CreationDate>' +
  '<ScheduleFromStart>1</ScheduleFromStart>' +
  '<StartDate>2026-01-05T08:00:00</StartDate><FinishDate>2026-01-14T17:00:00</FinishDate>' +
  '<CalendarUID>1</CalendarUID>' +
  '<DefaultStartTime>08:00:00</DefaultStartTime><DefaultFinishTime>17:00:00</DefaultFinishTime>' +
  '<MinutesPerDay>480</MinutesPerDay><MinutesPerWeek>2400</MinutesPerWeek><DaysPerMonth>20</DaysPerMonth>' +
  '<DurationFormat>7</DurationFormat>' +
  '<Calendars><Calendar><UID>1</UID><Name>Standard</Name><IsBaseCalendar>1</IsBaseCalendar>' +
  '<WeekDays>' +
  [0, 1, 2, 3, 4, 5, 6].map(i => {
    const working = i >= 1 && i <= 5;
    const inner = working
      ? '<DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes>'
      : '<DayWorking>0</DayWorking>';
    return `<WeekDay><DayType>${i + 1}</DayType>${inner}</WeekDay>`;
  }).join('') +
  '</WeekDays></Calendar></Calendars>' +
  `<Tasks>${tasksXml.join('')}</Tasks>` +
  '</Project>';

writeFileSync('test-results/export-samples/diagnostic-children.xml', xml);
console.log('diagnostic-children.xml written:', xml.length, 'bytes — 8 variants under 8 summaries');
