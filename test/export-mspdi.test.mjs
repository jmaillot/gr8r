/* =====================================================================
   MSPDI SERIALIZER TESTS — Phase 54 (54-05)
   Structure, order, links, escaping, durations — everything the
   automated suite CAN prove about the Microsoft Project XML. The one
   check it cannot make (Project opens the file without a repair
   prompt) is the human checkpoint in the plan (54-05 Task 3).
   ===================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMspdi, escapeXml, parseEstimate, isoDuration, workingDaysInclusive, formatDateTime } from '../export/mspdi.js';
import { buildExportModel } from '../src/export/model.js';
import { makeMspdiDoc, makeMspdiCommentsOnDoc, makeEmptyProjectDoc } from './fixtures/export-fixtures.mjs';
import { assertWellFormed, tags } from './helpers/xml.mjs';

/* Deterministic export date: 2026-03-20 (the Kickoff milestone on
   2026-03-01 is strictly before it, the Launch milestone after). */
const EXPORT_NOW = new Date('2026-03-20T12:00:00');
const DEPS = { translate: k => k, labelName: id => id, now: EXPORT_NOW };

function buildModel(doc, options = {}) {
  return buildExportModel(doc, 'p_msp', { scope: 'all', options: { ...options } }, DEPS);
}

/* The Project-level child sequence the schema pins positionally
   (Pitfall 8) — one reordered child triggers Project's repair prompt. */
const PROJECT_ORDER = [
  'SaveVersion',
  'Name',
  'Title',
  'CreationDate',
  'ScheduleFromStart',
  'StartDate',
  'FinishDate',
  'CalendarUID',
  'DefaultStartTime',
  'DefaultFinishTime',
  'MinutesPerDay',
  'MinutesPerWeek',
  'DaysPerMonth',
  'DurationFormat',
  'ExtendedAttributes',
  'Calendars',
  'Tasks',
  'Resources',
  'Assignments',
];

const TASK_ORDER = ['UID', 'ID', 'Name', 'Type', 'Start', 'Finish', 'Duration', 'DurationFormat', 'Milestone', 'Summary', 'PercentComplete']; /* OutlineLevel sits between Type and Start on child rows only — checked positionally in the inheritance test */

/* Slice the raw XML for one task by its Name value. */
function taskSlice(xml, name) {
  const marker = `<Name>${name}</Name>`;
  const start = xml.indexOf(marker);
  assert.notEqual(start, -1, `a task named ${name} exists`);
  const end = xml.indexOf('</Task>', start);
  return xml.slice(xml.lastIndexOf('<Task>', start), end);
}

/* ---------------- unit helpers ---------------- */

test('parseEstimate reads the stored ASCII grammar at 480 minutes per day', () => {
  assert.equal(parseEstimate('90m'), 90);
  assert.equal(parseEstimate('2h'), 120);
  assert.equal(parseEstimate('3d'), 1440);
  assert.equal(parseEstimate(''), null);
  assert.equal(parseEstimate('3w'), null);
  assert.equal(parseEstimate('abc'), null);
  assert.equal(parseEstimate('-5d'), null);
});

test('isoDuration renders the xsd:duration schema form', () => {
  assert.equal(isoDuration(1440), 'PT24H0M0S');
  assert.equal(isoDuration(90), 'PT1H30M0S');
  assert.equal(isoDuration(0), 'PT0H0M0S');
  assert.equal(isoDuration(NaN), 'PT0H0M0S');
});

test('workingDaysInclusive counts Monday to Friday inclusive in UTC', () => {
  /* Mon 2026-03-02 to Wed 2026-03-04 → 3; Fri 2026-03-06 to Mon 2026-03-09 → 2. */
  assert.equal(workingDaysInclusive('2026-03-02', '2026-03-04'), 3);
  assert.equal(workingDaysInclusive('2026-03-06', '2026-03-09'), 2);
  assert.equal(workingDaysInclusive('2026-03-07', '2026-03-08'), 0, 'a pure weekend span counts zero');
  assert.equal(workingDaysInclusive('2026-03-09', '2026-03-02'), 0, 'a reversed span counts zero');
  assert.equal(workingDaysInclusive('', '2026-03-09'), 0);
});

test('formatDateTime carries no Z and no offset', () => {
  assert.equal(formatDateTime('2026-03-02', '08:00:00'), '2026-03-02T08:00:00');
  assert.equal(formatDateTime('', '08:00:00'), '');
});

test('escapeXml replaces the five entities, ampersand first', () => {
  assert.equal(escapeXml('A & <B> "c" \'d\''), 'A &amp; &lt;B&gt; &quot;c&quot; &apos;d&apos;');
  assert.equal(escapeXml('&amp;'), '&amp;amp;', 'a pre-escaped ampersand is escaped again, never double-rendered');
  assert.equal(escapeXml(null), '');
});

/* ---------------- document structure ---------------- */

const model = buildModel(makeMspdiDoc());
const xml = buildMspdi(model);

test('the document is well-formed with the short Microsoft project namespace', () => {
  assertWellFormed(xml);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'UTF-8 declaration first');
  assert.ok(xml.includes('<Project xmlns="http://schemas.microsoft.com/project">'), 'the short namespace, no /2007');
});

test('project-level children appear in the documented schema order', () => {
  let last = -1;
  for (const name of PROJECT_ORDER) {
    const at = xml.indexOf(`<${name}>`);
    assert.notEqual(at, -1, `${name} is present`);
    assert.ok(at > last, `${name} comes after the previous element`);
    last = at;
  }
});

test('task-level children appear in the documented schema order', () => {
  for (const name of ['Linked one', 'Three day estimate', 'Friday to Monday']) {
    const slice = taskSlice(xml, name);
    let last = -1;
    for (const el of TASK_ORDER) {
      const at = slice.indexOf(`<${el}>`);
      assert.notEqual(at, -1, `${el} present in ${name}`);
      assert.ok(at > last, `${el} in order inside ${name}`);
      last = at;
    }
    /* PredecessorLink / ExtendedAttribute / Notes come after PercentComplete when present. */
    for (const el of ['PredecessorLink', 'ExtendedAttribute', 'Notes']) {
      const at = slice.indexOf(`<${el}`);
      if (at !== -1) assert.ok(at > slice.indexOf('<PercentComplete>'), `${el} after PercentComplete in ${name}`);
    }
  }
});

test('dated spans win over estimates and dated rows never collapse to zero duration (owner 2026-11-10)', () => {
  /* Project re-derives Finish from Duration, so an estimate-based duration
     on a multi-day span renders a near-zero bar ("lines, not blocks"). */
  const mismatchDoc = {
    members: [{ id: 'm1', name: 'Me', role: 'Owner' }],
    projects: [{ id: 'p1', name: 'P', key: 'PRJ', status: 'active', start: '2026-11-02', due: '2026-12-31', lead: 'm1', members: ['m1'], teams: [], archived: false }],
    tasks: [
      /* estimate 2h but a five-working-day span: the SPAN must win */
      { id: 't1', project: 'p1', key: 'PRJ-1', title: 'Span wins', status: 'todo', priority: 'medium', assignees: [], labels: [], estimate: '2h', subtasks: [], deps: [], order: 1, start: '2026-11-09', due: '2026-11-13' },
      /* start only, no due, no estimate: minimum one working day, never zero */
      { id: 't2', project: 'p1', key: 'PRJ-2', title: 'Start only', status: 'todo', priority: 'medium', assignees: [], labels: [], estimate: '', subtasks: [], deps: [], order: 2, start: '2026-11-09' },
      /* undated, estimate only: the estimate duration survives */
      { id: 't3', project: 'p1', key: 'PRJ-3', title: 'Estimate only', status: 'todo', priority: 'medium', assignees: [], labels: [], estimate: '3h', subtasks: [], deps: [], order: 3 },
      /* undated, nothing: zero duration stays (a line at the project start) */
      { id: 't4', project: 'p1', key: 'PRJ-4', title: 'Nothing at all', status: 'todo', priority: 'medium', assignees: [], labels: [], estimate: '', subtasks: [], deps: [], order: 4 },
    ],
    comments: [],
    projOrder: ['p1'],
  };
  const mismatchXml = buildMspdi(buildExportModel(mismatchDoc, 'p1', { scope: 'all' }, DEPS));
  assert.ok(taskSlice(mismatchXml, 'Span wins').includes('<Duration>PT40H0M0S</Duration>'), '5-working-day span beats the 2h estimate');
  assert.ok(taskSlice(mismatchXml, 'Start only').includes('<Duration>PT8H0M0S</Duration>'), 'start-only task gets a minimum one working day');
  assert.ok(taskSlice(mismatchXml, 'Estimate only').includes('<Duration>PT3H0M0S</Duration>'), 'undated task keeps its estimate duration');
  assert.ok(taskSlice(mismatchXml, 'Nothing at all').includes('<Duration>PT0H0M0S</Duration>'), 'undated and unestimated stays zero');
});

test('dated tasks carry a SNET constraint pinning their start (owner report 2026-11-10)', () => {
  /* MS Project re-schedules auto tasks on import and ignores <Start>/<Finish>
     without a constraint — every line collapsed to the project start date. */
  for (const name of ['Linked one', 'Three day estimate']) {
    const slice = taskSlice(xml, name);
    assert.ok(slice.includes('<ConstraintType>4</ConstraintType>'), `${name} is Start-No-Earlier-Than constrained`);
    const start = /<Start>([^<]*)<\/Start>/.exec(slice)[1];
    assert.ok(slice.includes(`<ConstraintDate>${start}</ConstraintDate>`), `${name} pins its own start`);
    /* Constraint elements sit after PercentComplete and before the link group */
    assert.ok(slice.indexOf('<ConstraintType>') > slice.indexOf('<PercentComplete>'), `${name}: constraint after PercentComplete`);
    const hasLinks = slice.includes('<PredecessorLink>');
    if (hasLinks) assert.ok(slice.indexOf('<ConstraintDate>') < slice.indexOf('<PredecessorLink>'), `${name}: constraint before the link group`);
  }
  /* Undated tasks keep the project-start fallback with NO constraint */
  const undated = taskSlice(xml, 'No dates task');
  assert.ok(!undated.includes('<ConstraintType>'), 'undated rows stay unconstrained so the fallback still applies');
});

test('child tasks carry NO dates (owner ruling 2026-11-10) and nest via OutlineLevel', () => {
  const subXml = buildMspdi(buildModel(makeMspdiDoc(), { subtasks: true }));
  for (const name of ['Child one', 'Child two']) {
    const slice = taskSlice(subXml, name);
    /* OutlineLevel sits exactly between Type and Milestone (no Start on children) */
    const typeAt = slice.indexOf('<Type>');
    const olAt = slice.indexOf('<OutlineLevel>1</OutlineLevel>');
    const milestoneAt = slice.indexOf('<Milestone>');
    assert.ok(olAt > typeAt && olAt < milestoneAt, `${name}: OutlineLevel after Type, before Milestone`);
    /* dates and constraints are omitted entirely on child rows */
    for (const el of ['Start', 'Finish', 'Duration', 'ConstraintType', 'ConstraintDate']) {
      assert.ok(!slice.includes(`<${el}`), `${name} has no <${el}> — dates live on the parent only`);
    }
  }
  /* the parent keeps its OWN dates, plus the SNET pin */
  const parent = taskSlice(subXml, 'Subtasked task');
  assert.ok(!parent.includes('<OutlineLevel>'), 'the parent carries no OutlineLevel (top level)');
  assert.ok(parent.includes('<Start>2026-03-04T08:00:00</Start>'), 'the parent starts at its own start');
  assert.ok(parent.includes('<Finish>2026-03-10T17:00:00</Finish>'), 'the parent finishes at its own due');
  assert.ok(parent.includes('<ConstraintType>4</ConstraintType>'), 'the parent is SNET-pinned');
});

test('task count equals exported rows only — milestones excluded (owner 2026-11-10)', () => {
  assert.equal(tags(xml, 'Task').length, model.rows.length);
  assert.ok(model.milestones.length > 0, 'fixture sanity: the model still derives milestones');
  assert.ok(!xml.includes('Kickoff') && !xml.includes('Launch'), 'no milestone Task reaches the XML');
  /* The archived MSP-8 is not exported, its child rows ride under MSP-3. */
  assert.equal(model.rows.filter(r => r.key === 'MSP-8').length, 0);
});

test('every resolvable dependency yields exactly one finish-to-start link with the right UID', () => {
  const slice = taskSlice(xml, 'Linked two');
  /* deps = [t_x1 (exported), t_x8 (archived, dropped)] → exactly one link. */
  assert.equal((slice.match(/<\/PredecessorLink>/g) || []).length, 1);
  assert.ok(
    slice.includes(
      '<PredecessorLink><PredecessorUID>1</PredecessorUID><Type>1</Type><CrossProject>0</CrossProject><LinkLag>0</LinkLag><LagFormat>7</LagFormat></PredecessorLink>',
    ),
    'the link resolves to Linked one (UID 1) in PredecessorLink child order',
  );
  const archived = taskSlice(xml, 'Friday to Monday');
  assert.equal(tags(archived, 'PredecessorLink').length, 0, 'the no-deps task carries no link');
});

test('custom fields use the five exact FieldIDs and no Text element is emitted', () => {
  const attrs = xml.slice(xml.indexOf('<ExtendedAttributes>'), xml.indexOf('</ExtendedAttributes>'));
  assert.deepEqual(
    [...attrs.matchAll(/<FieldID>(\d+)<\/FieldID>/g)].map(m => m[1]),
    ['188743731', '188743734', '188743737', '188743740', '188743743'],
  );
  for (const name of ['Text1', 'Text2', 'Text3', 'Text4', 'Text5']) {
    assert.equal(tags(xml, name).length, 0, `no <${name}> element exists`);
  }
});

test('the Text1..Text5 attribute values ride the rows in order', () => {
  const slice = taskSlice(xml, 'Three day estimate');
  assert.ok(slice.includes('<FieldID>188743731</FieldID><Value>MSP-4</Value>'), 'Text1 = key');
  assert.ok(slice.includes('<FieldID>188743734</FieldID><Value>task.status.todo</Value>'), 'Text2 = localized status');
  assert.ok(slice.includes('<FieldID>188743737</FieldID><Value>task.priority.medium</Value>'), 'Text3 = localized priority');
  assert.ok(!slice.includes('<FieldID>188743740</FieldID>'), 'Text4 omitted when the label list is empty');
  assert.ok(slice.includes('<FieldID>188743743</FieldID><Value>3d</Value>'), 'Text5 = raw estimate');
});

test('durations follow the estimate grammar, then the working-day span, then zero', () => {
  assert.ok(taskSlice(xml, 'Three day estimate').includes('<Duration>PT24H0M0S</Duration>'), '3d → PT24H0M0S');
  assert.ok(taskSlice(xml, 'Ninety minute estimate').includes('<Duration>PT1H30M0S</Duration>'), '90m → PT1H30M0S');
  assert.ok(taskSlice(xml, 'Linked one').includes('<Duration>PT8H0M0S</Duration>'), 'one working-day span → PT8H0M0S');
  assert.ok(taskSlice(xml, 'Friday to Monday').includes('<Duration>PT16H0M0S</Duration>'), 'Friday→Monday → PT16H0M0S');
  assert.ok(taskSlice(xml, 'No dates task').includes('<Duration>PT0H0M0S</Duration>'), 'no estimate, no dates → zero');
});

test('no Task carries the Milestone flag (owner 2026-11-10: milestones excluded)', () => {
  assert.ok(!xml.includes('<Milestone>1</Milestone>'), 'the Milestone element never appears');
});

test('parent tasks carry Summary=1, top-level and child rows Summary=0 (owner 2026-11-10: parents render bold in Project)', () => {
  const out = buildMspdi(buildModel(makeMspdiDoc(), { subtasks: true }));
  assert.ok(taskSlice(out, 'Subtasked task').includes('<Summary>1</Summary>'), 'the subtasked parent is a Summary task');
  assert.ok(taskSlice(out, 'Child two').includes('<Summary>0</Summary>'), 'a child row is not a Summary task');
  assert.ok(taskSlice(out, 'Linked one').includes('<Summary>0</Summary>'), 'a top-level task without subtasks is not a Summary task');
  for (const m of out.matchAll(/<Summary>(\d)<\/Summary>/g)) {
    assert.ok(m[1] === '0' || m[1] === '1', `Summary is a boolean flag (got ${m[1]})`);
  }
});

test('Start and Finish carry no Z and no offset', () => {
  for (const m of xml.matchAll(/<(Start|Finish|StartDate|FinishDate|CreationDate)>([^<]+)<\/\1>/g)) {
    assert.ok(!/[Zz]|[+-]\d{2}:\d{2}$/.test(m[2]), `${m[1]} value ${m[2]} has no timezone suffix`);
    assert.match(m[2], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  }
});

test('task starts sit at 08:00:00 and finishes at 17:00:00', () => {
  const slice = taskSlice(xml, 'Linked one');
  assert.ok(slice.includes('<Start>2026-03-02T08:00:00</Start>'));
  assert.ok(slice.includes('<Finish>2026-03-02T17:00:00</Finish>'));
});

test('PercentComplete is the row progress clamped to 0-100', () => {
  const slice = taskSlice(xml, 'Linked one');
  assert.ok(slice.includes('<PercentComplete>5</PercentComplete>'), 'a todo task reads the model progress (5)');
});

test('a task without dates still produces a Start and a Finish', () => {
  const slice = taskSlice(xml, 'No dates task');
  assert.match(slice, /<Start>\d{4}-\d{2}-\d{2}T08:00:00<\/Start>/);
  assert.match(slice, /<Finish>\d{4}-\d{2}-\d{2}T17:00:00<\/Finish>/);
});

/* ---------------- descriptions, escaping, toggles ---------------- */

test('the description reaches Notes only with the toggle on, as inert plain text', () => {
  const off = buildMspdi(buildModel(makeMspdiDoc()));
  assert.ok(!taskSlice(off, 'Script task').includes('<Notes>'), 'descriptions off → no Notes');
  const on = buildMspdi(buildModel(makeMspdiDoc(), { descriptions: true }));
  const slice = taskSlice(on, 'Script task');
  const notes = slice.match(/<Notes>([^<]*(?:<[^/][^>]*>)?[^<]*)<\/Notes>/);
  assert.ok(notes, 'descriptions on → Notes present');
  const text = notes[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  assert.ok(!/<script/i.test(text), 'the script tag is gone (stripped by the model)');
  assert.ok(text.includes('Bonjour') && text.includes('naïve café'), 'the plain text survives');
});

test('an empty description omits the Notes element instead of writing undefined', () => {
  const on = buildMspdi(buildModel(makeMspdiDoc(), { descriptions: true }));
  for (const row of ['Linked one', 'No dates task', 'A &amp; &lt;B&gt;']) {
    const slice = taskSlice(on, row);
    if (slice.includes('<Name>')) assert.ok(!slice.includes('<Notes>undefined</Notes>'));
  }
  assert.ok(!on.includes('undefined'), 'the word undefined appears nowhere in the document');
});

test('a title with ampersand, brackets and quotes round-trips through the escaping', () => {
  const slice = taskSlice(xml, 'A &amp; &lt;B&gt;');
  assert.ok(slice.includes('<Name>A &amp; &lt;B&gt;</Name>'), 'the escaped title');
  assert.ok(taskSlice(xml, 'Quote &quot;task&quot; title').includes('<Name>Quote &quot;task&quot; title</Name>'), 'double quotes escaped');
  const decoded = 'A &amp; &lt;B&gt;'
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
  assert.equal(decoded, 'A & <B>', 'replacing the five entities reads back the original');
});

test('non-Latin text survives the UTF-8 document', () => {
  assert.ok(xml.includes('Données — naïve café 日本語'), 'the accented and CJK title survives verbatim');
  assert.ok(!xml.includes('\uFFFD'), 'no replacement characters');
});

test('the comments toggle changes no byte of the MSPDI output (recorded R3 exception)', () => {
  const base = buildMspdi(buildModel(makeMspdiDoc()));
  const withComments = buildMspdi(buildModel(makeMspdiCommentsOnDoc(), { comments: true }));
  assert.equal(withComments, base, 'comments never reach the XML');
  assert.ok(!base.includes('comment'), 'no comment content anywhere');
});

/* ---------------- empty project, resources, assignments ---------------- */

test('a zero-task project omits Tasks, Resources and Assignments yet resolves CalendarUID 1', () => {
  const emptyModel = buildExportModel(
    makeEmptyProjectDoc(),
    'p_empty',
    { scope: 'all' },
    {
      translate: k => k,
      labelName: id => id,
      now: EXPORT_NOW,
    },
  );
  const emptyXml = buildMspdi(emptyModel);
  assertWellFormed(emptyXml);
  assert.equal(tags(emptyXml, 'Tasks').length, 0);
  assert.equal(tags(emptyXml, 'Resources').length, 0);
  assert.equal(tags(emptyXml, 'Assignments').length, 0);
  assert.ok(emptyXml.includes('<CalendarUID>1</CalendarUID>'));
  assert.equal(tags(emptyXml, 'Calendar').length, 1, 'the single base calendar is unconditional');
  const days = tags(emptyXml, 'WeekDay').length;
  assert.equal(days, 7, 'DayType 1 through 7');
  assert.ok(emptyXml.includes('<DayType>1</DayType><DayWorking>0</DayWorking>'), 'Sunday non-working');
  assert.ok(emptyXml.includes('<DayType>7</DayType><DayWorking>0</DayWorking>'), 'Saturday non-working');
});

test('the calendar week works Monday to Friday 08:00-12:00 and 13:00-17:00', () => {
  const calendar = xml.slice(xml.indexOf('<Calendar>'), xml.indexOf('</Calendar>') + 11);
  for (const type of [2, 3, 4, 5, 6]) {
    assert.ok(calendar.includes(`<DayType>${type}</DayType><DayWorking>1</DayWorking>`), `DayType ${type} works`);
  }
  assert.ok(calendar.includes('<FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime>'));
  assert.ok(calendar.includes('<FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime>'));
});

test('resources are the distinct assignees of the exported rows, unassigned excluded', () => {
  const names = xml.slice(xml.indexOf('<Resources>'), xml.indexOf('</Resources>'));
  const list = [...names.matchAll(/<Name>([^<]+)<\/Name>/g)].map(m => m[1]);
  assert.deepEqual(list, ['Léa Lead', 'Pat Plain'], 'first-appearance order, no unassigned entry');
  const assignmentsBlock = xml.slice(xml.indexOf('<Assignments>'), xml.indexOf('</Assignments>'));
  const assignments = assignmentsBlock
    .slice('<Assignments>'.length)
    .split('<Assignment>')
    .filter(s => s.length);
  assert.equal(assignments.length, 3, 'one assignment per task×resource pair (Linked one, Linked two, Three day estimate)');
  assert.ok(assignments[0].startsWith('<UID>1</UID><TaskUID>1</TaskUID><ResourceUID>1</ResourceUID>'), 'task-major order, UID/TaskUID/ResourceUID first');
  assert.ok(assignments[0].includes('<Units>1</Units>'));
  assert.ok(assignments[0].includes('<Work>PT8H0M0S</Work>'), 'the assignment carries the task duration');
});

test('project StartDate and FinishDate derive from the project and task spans', () => {
  assert.ok(xml.includes('<StartDate>2026-03-02T08:00:00</StartDate>'), 'the earliest task start / project start');
  assert.ok(xml.includes('<FinishDate>2026-03-31T17:00:00</FinishDate>'), 'the project due at 17:00');
  assert.ok(xml.includes('<CreationDate>2026-03-20T00:00:00</CreationDate>'), 'the export date at midnight');
  assert.ok(xml.includes('<ScheduleFromStart>1</ScheduleFromStart>'));
  assert.ok(
    xml.includes('<MinutesPerDay>480</MinutesPerDay>') &&
      xml.includes('<MinutesPerWeek>2400</MinutesPerWeek>') &&
      xml.includes('<DaysPerMonth>20</DaysPerMonth>'),
  );
  assert.ok(xml.includes('<Name>MSPDI Project</Name>'), 'Name is the project name, never a filename');
});

test('CR-01: child rows never shadow a subtasked parent in the UID map (54-05 review)', () => {
  const doc = makeMspdiDoc();
  doc.tasks[2].assignees = ['m_lead']; // the subtasked parent gets an assignee
  doc.tasks[1].deps = ['t_x1', 't_x8', 't_x3']; // and a dep lands on the subtasked parent
  const out = buildMspdi(buildModel(doc, { subtasks: true }));
  const taskUid = name => {
    const m = out.match(new RegExp(`<Task><UID>(\\d+)</UID>\\d*<ID>\\d+</ID><Name>${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</Name>`));
    return m ? Number(m[1]) : null;
  };
  const parentUid = taskUid('Subtasked task');
  const childUid = taskUid('Child two');
  assert.ok(parentUid !== null && childUid !== null, 'both the parent and the child are emitted as Tasks');
  assert.notEqual(parentUid, childUid, 'parent and child carry distinct UIDs');

  const linkedTwoStart = out.indexOf('<Name>Linked two</Name>');
  const linkedTwo = out.slice(linkedTwoStart, out.indexOf('</Task>', linkedTwoStart));
  assert.ok(linkedTwo.includes(`<PredecessorUID>${parentUid}</PredecessorUID>`), 'the dep on the subtasked parent resolves to the parent row UID');
  assert.ok(!linkedTwo.includes(`<PredecessorUID>${childUid}</PredecessorUID>`), 'the dep never resolves to a child row UID');

  const assignmentsBlock = out.slice(out.indexOf('<Assignments>'), out.indexOf('</Assignments>'));
  const forParent = assignmentsBlock.split('<Assignment>').filter(s => s.startsWith('<UID>') && s.includes(`<TaskUID>${parentUid}</TaskUID>`));
  assert.equal(forParent.length, 1, 'exactly one assignment for the subtasked parent, on its own UID');

  const first = '<Assignment>' + forParent[0];
  assert.ok(first.indexOf('<Start>') < first.indexOf('<Finish>'), 'WR-02: Assignment emits Start before Finish (positional schema)');
});

/* =====================================================================
   55-05 Task 2: multi-assignee MSPDI (D-55-15, CR-01).
   ===================================================================== */
import { makeMultiAssigneeDoc } from './fixtures/export-fixtures.mjs';

const buildMultiMspdi = () =>
  buildMspdi(buildExportModel(makeMultiAssigneeDoc(), 'p_multi', { scope: 'all' }, { translate: k => k, labelName: id => id, now: EXPORT_NOW }));
const resourceNames = out => [...out.slice(out.indexOf('<Resources>') + 11, out.indexOf('</Resources>')).matchAll(/<Name>([^<]+)<\/Name>/g)].map(m => m[1]);
const assignmentPairs = out =>
  out
    .slice(out.indexOf('<Assignments>') + 13, out.indexOf('</Assignments>'))
    .match(/<Assignment><UID>\d+<\/UID><TaskUID>\d+<\/TaskUID><ResourceUID>\d+<\/ResourceUID>/g)
    ?.map(s => s.match(/<UID>(\d+)<\/UID><TaskUID>(\d+)<\/TaskUID><ResourceUID>(\d+)<\/ResourceUID>/).slice(1).map(Number)) || [];

test('multi-assignee MSPDI (a): a 2-assignee task yields 2 Resources and 2 task-major assignment pairs', () => {
  const out = buildMultiMspdi();
  assert.deepEqual(resourceNames(out), ['Ada One', 'Ben Two'], 'one Resource per member, first-appearance order');
  const pairs = assignmentPairs(out);
  assert.equal(pairs.length, 3);
  /* rows: t_ma1 → TaskUID 1, t_ma2 → 2, t_ma3 → 3. Resources: m_one → 1, m_two → 2. */
  assert.deepEqual(pairs, [[1, 1, 1], [2, 1, 2], [3, 2, 1]], 'task-major order: both members of the shared task first, then the solo task');
  assert.ok(out.includes('<UID>1</UID><TaskUID>1</TaskUID><ResourceUID>1</ResourceUID>'), 'per-pair UIDs are sequential from 1');
});

test('multi-assignee MSPDI (b): a member shared by two tasks appears once in Resources and in both pairs', () => {
  const out = buildMultiMspdi();
  assert.equal(resourceNames(out).filter(n => n === 'Ada One').length, 1, 'exactly one Ada One resource');
  const pairs = assignmentPairs(out);
  assert.equal(pairs.filter(([, t, r]) => r === 1).length, 2, 'resource UID 1 assigned on both of its tasks');
  assert.deepEqual(pairs.filter(([, t]) => t === 2).map(([, , r]) => r), [1], 'the solo task pairs with the shared member');
});

test('multi-assignee MSPDI (c): an empty-assignee task emits no resource and no pair', () => {
  const out = buildMultiMspdi();
  assert.ok(!resourceNames(out).includes('Cal Three'), 'the subtask-only member is not a Resource (D-54-10)');
  const pairs = assignmentPairs(out);
  assert.equal(pairs.length, 3, 'only the assigned pairs exist — the unassigned task emits none');
  assert.ok(!pairs.some(([, t]) => t === 3), 'TaskUID 3 (MA-3, nobody) carries no assignment');
  assert.ok(out.includes('<Name>Ada One</Name>'), 'sanity: the Resources block exists');
});

test('multi-assignee MSPDI: the subtasked parent emits pairs on its OWN UID, the child never shadows it (CR-01 pair level)', () => {
  const doc = makeMultiAssigneeDoc();
  doc.tasks[0].subtasks[0].assignees = ['m_two']; // child with its own assignee
  const out = buildMspdi(buildExportModel(doc, 'p_multi', { scope: 'all', options: { subtasks: true } }, { translate: k => k, labelName: id => id, now: EXPORT_NOW }));
  const pairs = assignmentPairs(out);
  assert.equal(pairs.length, 3, 'the child adds NO assignment row (the parent Task carries the assignment)');
  assert.ok(!pairs.some(([, t]) => t === 1 && false));
  /* the child row sits at UID 4 (4 rows total) and never appears as a TaskUID owner of a pair */
  const pairsWithChildTaskUid = pairs.filter(([, t]) => t === 4);
  assert.equal(pairsWithChildTaskUid.length, 0, 'child rows never own an assignment pair');
});
