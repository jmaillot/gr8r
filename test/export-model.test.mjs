/* Phase 54 (54-01): the export model — unit tests over the plain fixture
   data. No server, no DOM (except the taskProg parity probe, which stubs
   the globals src/core/store.js touches at import time). */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildExportModel, DEFAULT_OPTIONS, STATUS_IDS, PRIORITY_IDS, taskProgress, plainText } from '../src/export/model.js';
import { makeDoc, makeEmptyProjectDoc, makeZeroChartDoc, makeEmptyLaneDoc, makeChartDoc, makeMilestoneDoc } from './fixtures/export-fixtures.mjs';

/* Deterministic injected deps: a translator that just echoes the key so
   assertions can pin exact catalogue keys, and a fixed export date whose
   LOCAL date is 2026-02-01 (overdue math depends on it, never on the wall
   clock — the overdue test also proves the injected now is used). */
const NOW = new Date(2026, 1, 1, 12, 0, 0); // local 2026-02-01
const deps = (over = {}) => ({
  translate: over.translate || (k => k),
  labelName: over.labelName || (id => 'L:' + id),
  now: over.now || NOW,
});

const build = (doc, pid, opts, over) => buildExportModel(doc || makeDoc(), pid, opts || {}, deps(over));
const topRows = m => m.rows.filter(r => !r.parent);
const keys = m => topRows(m).map(r => r.key);

test('an unknown project returns null (the route maps it to 404)', () => {
  assert.equal(build(makeDoc(), 'p_nope'), null);
  assert.equal(buildExportModel(makeEmptyProjectDoc(), 'p_missing', {}, deps()), null);
});

test('the returned options object mirrors the five coerced inputs and is frozen', () => {
  const m = build(makeDoc(), 'p_alpha', { options: { descriptions: 'yes', comments: true, subtasks: 1, completed: false, archived: 'x', bogus: true } });
  assert.deepEqual({ ...m.options }, { descriptions: false, comments: true, subtasks: false, completed: false, archived: false });
  assert.ok(Object.isFrozen(m.options));
  assert.equal('bogus' in m.options, false, 'unknown option keys are ignored');
  const d = build(makeDoc(), 'p_alpha', {});
  assert.deepEqual({ ...d.options }, { ...DEFAULT_OPTIONS });
});

test('project scoping: only p_alpha tasks are exported, a foreign id never passes', () => {
  const m = build(makeDoc(), 'p_alpha', { scope: 'all' });
  const set = new Set(topRows(m).map(r => r.id));
  assert.equal(set.has('t_b1'), false, 'a foreign project task is never exported');
  assert.equal(keys(m).includes('BETA-1'), false);
  const b = build(makeDoc(), 'p_beta', { scope: 'all' });
  assert.deepEqual(keys(b), ['BETA-1']);
});

test('archived and completed filters follow the toggles', () => {
  const def = build(makeDoc(), 'p_alpha', { scope: 'all' });
  assert.equal(keys(def).includes('ALPHA-7'), false, 'archived is out by default');
  assert.ok(keys(def).includes('ALPHA-3'), 'done tasks are in by default');
  const arch = build(makeDoc(), 'p_alpha', { scope: 'all', options: { archived: true } });
  assert.ok(keys(arch).includes('ALPHA-7'), 'archived toggle adds the archived row');
  const noDone = build(makeDoc(), 'p_alpha', { scope: 'all', options: { completed: false } });
  assert.equal(topRows(noDone).some(r => r.statusId === 'done'), false, 'completed:false drops every done row');
});

test('view scope keeps exactly the given ids in that order; foreign ids are ignored', () => {
  const m = build(makeDoc(), 'p_alpha', { scope: 'view', ids: ['ALPHA-6-id-ignored', 't_a3', 't_a1', 't_b1', 't_a5'] });
  assert.deepEqual(keys(m), ['ALPHA-2', 'ALPHA-4', 'ALPHA-3']);
});

test('scope all orders by manual order (order values differ from array order)', () => {
  const m = build(makeDoc(), 'p_alpha', { scope: 'all' });
  const orders = topRows(m).map(r => r.key);
  /* Array order puts ALPHA-4 first; manual order must reverse them. */
  assert.equal(orders.indexOf('ALPHA-1'), 0, 'order 10 first');
  assert.ok(orders.indexOf('ALPHA-1') < orders.indexOf('ALPHA-4'), 'ALPHA-1 (order 10) precedes ALPHA-4 (order 30) — array order does not win');
});

test('default columns and rows omit description, comments and thread; toggles add exactly their content', () => {
  const def = build(makeDoc(), 'p_alpha', { scope: 'all' });
  const colKeys = def.columns.map(c => c.key);
  assert.deepEqual(colKeys, ['key', 'title', 'status', 'priority', 'assignee', 'start', 'due', 'progress', 'labels', 'estimate']);
  const row = def.rows.find(r => r.id === 't_a5');
  assert.equal(row.description, undefined);
  assert.equal(row.comments, undefined);
  assert.equal(row.thread, undefined);

  const desc = build(makeDoc(), 'p_alpha', { scope: 'all', options: { descriptions: true } });
  assert.deepEqual(desc.columns.map(c => c.key), [...colKeys, 'description']);
  const descRow = desc.rows.find(r => r.id === 't_a12');
  assert.equal(descRow.description, 'Bonjour & naïve café 日本語');

  const com = build(makeDoc(), 'p_alpha', { scope: 'all', options: { comments: true } });
  assert.deepEqual(com.columns.map(c => c.key), [...colKeys, 'comments', 'latestComment', 'thread']);
  const comRow = com.rows.find(r => r.id === 't_a5');
  assert.equal(comRow.comments, 2);
  assert.equal(comRow.latestComment, 'Second, latest note');
  assert.match(comRow.thread, /^Léa Lead/);
  assert.ok(comRow.thread.includes('Pat Plain'));
  assert.ok(comRow.thread.includes('\n'), 'the thread holds one line per comment');

  const sub = build(makeDoc(), 'p_alpha', { scope: 'all', options: { subtasks: true } });
  const children = sub.rows.filter(r => r.parent === 't_a9');
  assert.deepEqual(children.map(c => c.key), ['ALPHA-9.1', 'ALPHA-9.2']);
  assert.deepEqual(children.map(c => c.progress), [100, 0]);
  assert.deepEqual(children.map(c => c.statusId), ['done', 'todo']);
  assert.equal(topRows(sub).length, topRows(def).length, 'children are not extra top rows');
});

test('child rows are excluded from kpis (D-54-10)', () => {
  const sub = build(makeDoc(), 'p_alpha', { scope: 'all', options: { subtasks: true } });
  assert.equal(sub.kpis.total, topRows(sub).length);
});

test('overdue uses the injected now, never the wall clock (D-54-16)', () => {
  const m = build(makeDoc(), 'p_alpha', { scope: 'all' });
  assert.equal(m.kpis.overdue, 1, 't_a8 is due 2026-01-01, before the injected 2026-02-01, and not done');
  const later = build(makeDoc(), 'p_alpha', { scope: 'all' }, { now: new Date(2025, 0, 1) });
  assert.equal(later.kpis.overdue, 0, 'a 2025 export date finds nothing overdue');
  assert.equal(later.exportDateISO, '2025-01-01');
});

test('kpis count top-level exported rows: total, open, done', () => {
  const m = build(makeDoc(), 'p_alpha', { scope: 'all' });
  const n = topRows(m).length;
  const done = topRows(m).filter(r => r.statusId === 'done').length;
  assert.deepEqual(m.kpis, { total: n, open: n - done, done, overdue: 1 });
});

test('exportDateISO is the local date, built from the injected Date', () => {
  const m = build(makeDoc(), 'p_alpha', {});
  assert.equal(m.exportDateISO, '2026-02-01');
  assert.equal(m.exportDate, NOW);
});

test('project summary carries meta, lead name and rounded progress over exported top rows', () => {
  const m = build(makeDoc(), 'p_alpha', { scope: 'all' });
  assert.deepEqual(
    { ...m.project, statusLabel: m.project.statusLabel },
    { id: 'p_alpha', key: 'alpha', name: 'Alpha Project', statusLabel: 'project.status.active', leadName: 'Léa Lead', start: '2026-01-05', due: '2026-03-31', progress: Math.round((2 / 11) * 100) },
  );
  const empty = buildExportModel(makeEmptyProjectDoc(), 'p_empty', {}, deps());
  assert.equal(empty.project.progress, 0, 'progress is 0, never NaN, for zero rows');
  assert.deepEqual(empty.kpis, { total: 0, open: 0, done: 0, overdue: 0 });
});

test('empty-scope and zero-chart fixtures export zero rows but a valid model', () => {
  const e = buildExportModel(makeEmptyProjectDoc(), 'p_empty', {}, deps());
  assert.equal(e.rows.length, 0);
  const z = buildExportModel(makeZeroChartDoc(), 'p_zero', {}, deps());
  assert.equal(z.rows.length, 0, 'every task is archived, so the default set exports zero rows');
  const zArch = buildExportModel(makeZeroChartDoc(), 'p_zero', { options: { archived: true } }, deps());
  assert.equal(zArch.rows.length, 2, 'the archived toggle reveals the document-held tasks');
});

test('machine fields ride every row so writers never re-read the document', () => {
  const m = build(makeDoc(), 'p_alpha', { scope: 'all', options: { comments: true, descriptions: true, subtasks: true } });
  const r = m.rows.find(r => r.id === 't_a3');
  assert.deepEqual(r.deps, ['t_a2']);
  assert.equal(r.statusId, 'progress');
  assert.equal(r.priorityId, 'high');
  const child = m.rows.find(r => r.parent === 't_a9');
  assert.deepEqual(child.deps, []);
});

test('the assignee column is the member name, never the raw id', () => {
  const m = build(makeDoc(), 'p_alpha', { scope: 'all' });
  const r = m.rows.find(r => r.id === 't_a1');
  assert.equal(r.assignee, 'Pat Plain');
  assert.equal(r.assigneeId, 'm_plain');
  const un = m.rows.find(r => r.id === 't_a10');
  assert.equal(un.assignee, 'export.unassigned');
});

test('localized labels come from the injected translator and label resolver', () => {
  const m = build(makeDoc(), 'p_alpha', { scope: 'all' }, {
    translate: k => ({ 'task.status.progress': 'En cours', 'task.priority.high': 'Haute', 'export.col.title': 'Titre' }[k] || k),
    labelName: id => ({ backend: 'Backend' }[id] || id),
  });
  const r = m.rows.find(r => r.id === 't_a3');
  assert.equal(r.status, 'En cours');
  assert.equal(r.priority, 'Haute');
  assert.equal(r.labels, 'Backend');
  assert.equal(m.columns.find(c => c.key === 'title').label, 'Titre');
});

test('plainText strips script and markup, collapses whitespace', () => {
  assert.equal(plainText('a<script>alert(1)</script>b'), 'ab');
  assert.equal(plainText('<b>bold</b>  and\n <i>more</i>'), 'bold and more');
  assert.equal(plainText(null), '');
});

test('progress parity: taskProgress matches the store implementation', async () => {
  /* src/core/store.js touches window/document/localStorage at import time —
     stub them before the dynamic import, then compare. */
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  globalThis.document = { addEventListener: () => {}, visibilityState: 'visible', querySelectorAll: () => [] };
  globalThis.window = { addEventListener: () => {}, dispatchEvent: () => {}, location: { href: 'x' } };
  const { taskProg } = await import('../src/core/store.js');
  const cases = [
    { status: 'done', subtasks: [] },
    { status: 'todo', subtasks: [] },
    { status: 'progress', subtasks: [] },
    { status: 'review', subtasks: [] },
    { status: 'backlog', subtasks: [] },
    { status: 'weird', subtasks: [] },
    { status: 'todo', subtasks: [{ done: true }, { done: true }, { done: false }, { done: false }] },
    { status: 'todo', subtasks: [{ done: false }] },
  ];
  for (const t of cases) assert.equal(taskProgress(t), taskProg(t), `progress drift for ${t.status}`);
});

test('drift gate: STATUS_IDS and PRIORITY_IDS match src/core/constants.js', async () => {
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  globalThis.document = { addEventListener: () => {}, visibilityState: 'visible', querySelectorAll: () => [] };
  globalThis.window = { addEventListener: () => {}, dispatchEvent: () => {}, location: { href: 'x' } };
  const { STATUSES, PRIOS } = await import('../src/core/constants.js');
  assert.deepEqual(STATUS_IDS, STATUSES.map(s => s.id));
  assert.deepEqual(PRIORITY_IDS, PRIOS.map(p => p.id));
});

/* ---- 54-01 Task 3: the five-toggle matrix (each toggle adds exactly its content) ---- */
test('five-toggle matrix: each toggle on adds exactly its content and nothing else', () => {
  const def = build(makeDoc(), 'p_alpha', { scope: 'all' });
  const defKeys = def.columns.map(c => c.key);
  const defRowCount = topRows(def).length;

  const desc = build(makeDoc(), 'p_alpha', { scope: 'all', options: { descriptions: true } });
  assert.deepEqual(desc.columns.map(c => c.key), [...defKeys, 'description']);
  assert.equal(topRows(desc).length, defRowCount, 'descriptions adds no rows');

  const com = build(makeDoc(), 'p_alpha', { scope: 'all', options: { comments: true } });
  assert.deepEqual(com.columns.map(c => c.key), [...defKeys, 'comments', 'latestComment', 'thread']);
  assert.equal(topRows(com).length, defRowCount, 'comments adds no rows');

  const sub = build(makeDoc(), 'p_alpha', { scope: 'all', options: { subtasks: true } });
  assert.equal(topRows(sub).length, defRowCount, 'subtasks adds no TOP rows — children ride under parents');
  assert.ok(sub.rows.some(r => r.parent === 't_a9'), 'the subtask children exist');
  assert.deepEqual(def.rows.map(r => r.id).sort(), topRows(sub).map(r => r.id).sort(), 'top rows identical to default');

  const done = build(makeDoc(), 'p_alpha', { scope: 'all', options: { completed: false } });
  assert.ok(topRows(done).every(r => r.statusId !== 'done'), 'completed false removes every done row');
  assert.equal(topRows(done).length, defRowCount - 2, 'exactly the two done rows leave');

  const arch = build(makeDoc(), 'p_alpha', { scope: 'all', options: { archived: true } });
  assert.ok(topRows(arch).some(r => r.id === 't_a7'), 'archived true adds the archived row');
  assert.equal(topRows(arch).length, defRowCount + 1, 'exactly one row joins');
});

test('all toggles off reproduces the default column set and row count', () => {
  const allOff = build(makeDoc(), 'p_alpha', {
    scope: 'all',
    options: { descriptions: false, comments: false, subtasks: false, completed: false, archived: false },
  });
  const baseline = build(makeDoc(), 'p_alpha', { scope: 'all', options: { completed: false } });
  assert.deepEqual(allOff.columns.map(c => c.key), baseline.columns.map(c => c.key));
  assert.deepEqual(allOff.rows.map(r => r.id), baseline.rows.map(r => r.id), 'explicit false === omitted');
});

test('completed false plus subtasks true never emits a child of a filtered-out parent (D-54-9)', () => {
  const m = build(makeDoc(), 'p_alpha', { scope: 'all', options: { completed: false, subtasks: true } });
  const topIds = new Set(topRows(m).map(r => r.id));
  for (const r of m.rows) {
    if (r.parent) {
      const parentKey = r.parent;
      assert.ok([...topIds].some(id => id === parentKey), 'no child outlives a filtered-out parent');
    }
  }
  /* t_a5 is done; if it has children none may survive — it has none, so the
     general invariant above plus the done-exclusion covers the composition. */
  assert.ok(!m.rows.some(r => r.parent && !topIds.has(r.parent)));
});

/* =====================================================================
   54-03 Task 1: summary, charts, board, members, milestones, headers.
   ===================================================================== */

/* A translator that prefixes its key — any exporter label that did NOT
   come from the injected translator fails the prefix assertion. */
const prefixedDeps = over => deps({ translate: k => 'T:' + k, ...over });

test('summary meta: name, lead, status, start, due, progress in order with kinds (54-03)', () => {
  const m = build(makeDoc(), 'p_alpha', { scope: 'all' }, prefixedDeps());
  const meta = m.summary.meta;
  assert.deepEqual(meta.map(e => e.key), ['name', 'lead', 'status', 'start', 'due', 'progress']);
  assert.deepEqual(meta.map(e => e.kind), ['text', 'text', 'text', 'date', 'date', 'percent']);
  assert.deepEqual(meta.map(e => e.label), ['T:export.meta.name', 'T:export.meta.lead', 'T:export.meta.status', 'T:export.meta.start', 'T:export.meta.due', 'T:export.meta.progress']);
  assert.equal(meta[0].value, 'Alpha Project');
  assert.equal(meta[1].value, 'Léa Lead');
  assert.equal(meta[2].value, 'T:project.status.active', 'statusLabel is already a translator output');
  assert.equal(meta[3].value, '2026-01-05');
  assert.equal(meta[4].value, '2026-03-31');
  assert.equal(meta[5].value, Math.round((2 / 11) * 100), 'progress is the raw 0-100 number, never divided by 100');
});

test('summary kpis: four labelled entries equal to the row counts', () => {
  const m = build(makeDoc(), 'p_alpha', { scope: 'all' }, prefixedDeps());
  const n = topRows(m).length;
  const done = topRows(m).filter(r => r.statusId === 'done').length;
  assert.deepEqual(m.summary.kpis.map(k => k.key), ['total', 'open', 'done', 'overdue']);
  assert.deepEqual(m.summary.kpis.map(k => k.label), ['T:export.kpi.total', 'T:export.kpi.open', 'T:export.kpi.done', 'T:export.kpi.overdue']);
  assert.deepEqual(m.summary.kpis.map(k => k.value), [n, n - done, done, 1]);
});

test('status and priority charts tally exported top rows and ignore child rows (D-54-10)', () => {
  const sub = build(makeDoc(), 'p_alpha', { scope: 'all', options: { subtasks: true } }, prefixedDeps());
  const tally = (labels, counts, prefix) => Object.fromEntries(labels.map((l, i) => [l.slice(prefix.length), counts[i]]));
  const st = tally(sub.charts.status.labels, sub.charts.status.counts, 'T:task.status.');
  const manual = {};
  for (const r of topRows(sub)) manual[r.statusId] = (manual[r.statusId] || 0) + 1;
  for (const id of STATUS_IDS) assert.equal(st[id], manual[id] || 0, `status tally for ${id}`);
  const pr = tally(sub.charts.priority.labels, sub.charts.priority.counts, 'T:task.priority.');
  const manualP = {};
  for (const r of topRows(sub)) manualP[r.priorityId] = (manualP[r.priorityId] || 0) + 1;
  for (const id of PRIORITY_IDS) assert.equal(pr[id], manualP[id] || 0, `priority tally for ${id}`);
  assert.equal(STATUS_IDS.reduce((s, id) => s + st[id], 0), topRows(sub).length, 'child rows never inflate the chart');
});

test('chart fixture: counts match the manual tally for every status, priority and assignee', () => {
  const m = buildExportModel(makeChartDoc(), 'p_chart', { scope: 'all' }, prefixedDeps());
  const st = Object.fromEntries(STATUS_IDS.map((id, i) => [id, m.charts.status.counts[i]]));
  assert.deepEqual(st, { backlog: 2, todo: 3, progress: 2, review: 1, done: 2 });
  const pr = Object.fromEntries(PRIORITY_IDS.map((id, i) => [id, m.charts.priority.counts[i]]));
  assert.deepEqual(pr, { urgent: 2, high: 2, medium: 3, low: 2, none: 1 });
  assert.deepEqual(m.charts.assignees.counts, [4, 2, 2, 0], 'open counts desc: Pat Plain 4, then Gus Guest and Léa Lead 2, unassigned 0');
  assert.deepEqual(m.charts.assignees.labels, ['Pat Plain', 'Gus Guest', 'Léa Lead', 'T:export.unassigned']);
});

test('assignee chart sorts by open desc then name asc and includes Unassigned', () => {
  const m = buildExportModel(makeChartDoc(), 'p_chart', { scope: 'all' }, prefixedDeps());
  const opens = m.charts.assignees.counts;
  for (let i = 1; i < opens.length; i++) assert.ok(opens[i - 1] >= opens[i], 'open counts are non-increasing');
  const names = m.charts.assignees.labels;
  assert.ok(names.includes('T:export.unassigned'), 'Unassigned is in the chart labels');
  /* tied open counts are name-ascending: Gus Guest and Léa Lead both 2 */
  assert.ok(names.indexOf('Gus Guest') < names.indexOf('Léa Lead'), 'plain string comparison, never localeCompare');
});

test('every chart block carries its translated title; the title disappears with the block', () => {
  const m = build(makeDoc(), 'p_alpha', { scope: 'all' }, prefixedDeps());
  assert.equal(m.charts.status.title, 'T:export.chart.status');
  assert.equal(m.charts.priority.title, 'T:export.chart.priority');
  assert.equal(m.charts.assignees.title, 'T:export.chart.assignees');
  const z = buildExportModel(makeZeroChartDoc(), 'p_zero', {}, prefixedDeps());
  for (const key of ['status', 'priority', 'assignees']) {
    assert.equal(z.charts[key], null, `an all-zero chart block is null (${key})`);
  }
});

test('the zero-chart fixture is null because the model has no exported row, not because the doc is empty', () => {
  const z = buildExportModel(makeZeroChartDoc(), 'p_zero', {}, deps());
  assert.equal(z.rows.length, 0, 'zero exported rows under the default options');
  assert.notEqual(makeZeroChartDoc().tasks.length, 0, 'the document itself holds tasks');
});

test('board lanes are exactly the five ids in order, counts match, cards sort by order', () => {
  const m = buildExportModel(makeChartDoc(), 'p_chart', { scope: 'all' }, prefixedDeps());
  assert.deepEqual(m.board.lanes.map(l => l.id), ['backlog', 'todo', 'progress', 'review', 'done']);
  assert.deepEqual(m.board.lanes.map(l => l.count), [2, 3, 2, 1, 2]);
  const todo = m.board.lanes[1].cards;
  assert.deepEqual(todo.map(c => c.key), ['CH-3', 'CH-4', 'CH-5'], 'card order follows the task order field');
  for (const lane of m.board.lanes) {
    assert.equal(lane.count, lane.cards.length);
    assert.equal(lane.label, 'T:task.status.' + lane.id);
  }
});

test('an empty lane still renders: count 0 and an empty cards array (R7 empty)', () => {
  const m = buildExportModel(makeEmptyLaneDoc(), 'p_lane', { scope: 'all' }, prefixedDeps());
  assert.deepEqual(m.board.lanes.map(l => l.id), ['backlog', 'todo', 'progress', 'review', 'done']);
  assert.deepEqual(m.board.lanes.map(l => l.count), [2, 0, 0, 0, 2]);
  for (const lane of m.board.lanes.filter(l => l.count === 0)) {
    assert.deepEqual(lane.cards, [], `the empty ${lane.id} lane still exists with no cards`);
  }
  const backlog = m.board.lanes[0].cards;
  assert.deepEqual(backlog.map(c => c.key), ['LANE-1', 'LANE-2'], 'cards sort by order (10 before 20)');
  assert.deepEqual(backlog.map(c => c.assigneeName), ['Léa Lead', 'Pat Plain']);
  assert.equal(backlog[0].priorityLabel, 'T:task.priority.medium');
  assert.equal(backlog[0].progress, 0);
});

test('members: one row per assignee plus Unassigned, totals equal open plus done (D-54-10)', () => {
  const sub = build(makeDoc(), 'p_alpha', { scope: 'all', options: { subtasks: true } }, prefixedDeps());
  const total = sub.members.reduce((s, e) => s + e.total, 0);
  assert.equal(total, topRows(sub).length, 'member totals never include child rows');
  for (const e of sub.members) assert.equal(e.total, e.open + e.done);
  const unassigned = sub.members.filter(e => e.id === null);
  assert.equal(unassigned.length, 1, 'unassigned appears exactly once');
  assert.equal(unassigned[0].name, 'T:export.unassigned');
  const m = buildExportModel(makeChartDoc(), 'p_chart', { scope: 'all' }, prefixedDeps());
  assert.deepEqual(m.members.map(e => e.name), ['Pat Plain', 'Gus Guest', 'Léa Lead', 'T:export.unassigned']);
  assert.deepEqual(m.members.map(e => [e.open, e.done, e.total]), [[4, 0, 4], [2, 0, 2], [2, 1, 3], [0, 1, 1]]);
  assert.ok(m.members.every(e => e.name !== 'm_plain' && e.name !== 'm_lead' && e.name !== 'm_guest'), 'member ids never leak as names');
});

test('milestones sort by date then name and derive state from the injected export date (D-54-13)', () => {
  const m = buildExportModel(makeMilestoneDoc(), 'p_ms', { scope: 'all' }, prefixedDeps());
  assert.deepEqual(m.milestones.map(x => x.date), ['2026-01-05', '2026-02-01', '2026-03-01'], 'sorted by date, undated entry dropped');
  assert.deepEqual(m.milestones.map(x => x.name), ['Before milestone', 'On-export-date milestone', 'After milestone']);
  assert.equal(m.milestones[0].state, 'T:export.milestone.done', 'before the export date reads done');
  assert.equal(m.milestones[1].state, 'T:export.milestone.upcoming', 'dated exactly ON the export date reads upcoming');
  assert.equal(m.milestones[2].state, 'T:export.milestone.upcoming');
  /* the export date is injected, not the wall clock */
  const later = buildExportModel(makeMilestoneDoc(), 'p_ms', { scope: 'all' }, prefixedDeps({ now: new Date(2025, 0, 1) }));
  assert.equal(later.milestones[0].state, 'T:export.milestone.upcoming', 'an older export date flips the same milestone to upcoming');
});

test('headers carry the localized labels for board, members and milestones', () => {
  const m = build(makeDoc(), 'p_alpha', { scope: 'all' }, prefixedDeps());
  assert.deepEqual(m.headers.board, ['T:export.col.lane', 'T:export.col.count', 'T:export.col.key', 'T:export.col.title', 'T:export.col.assignee', 'T:export.col.priority', 'T:export.col.due', 'T:export.col.progress']);
  assert.deepEqual(m.headers.members, ['T:export.col.member', 'T:export.col.open', 'T:export.col.done', 'T:export.col.total']);
  assert.deepEqual(m.headers.milestones, ['T:export.col.name', 'T:export.col.date', 'T:export.col.state']);
});

test('every exporter-authored string comes from the injected translator (D-54-12, D-54-14)', () => {
  const m = build(makeChartDoc(), 'p_chart', { scope: 'all', options: { subtasks: true } }, prefixedDeps());
  const walk = value => {
    if (typeof value === 'string') assert.match(value, /^(T:|CH-|Lan|$)/, `unexpected literal: ${value}`);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        /* machine keys and user-authored meta values (project name, lead,
           status label) are not exporter-authored display strings */
        if (k === 'key' || k === 'kind' || k === 'id' || k === 'value' || k === 'assigneeName') continue;
        if ((k === 'date') && /^\d{4}-\d{2}-\d{2}$/.test(v ?? '')) continue;
        walk(v);
      }
    }
  };
  walk(m.summary.meta.map(e => ({ label: e.label, kind: e.kind })));
  walk(m.summary.kpis);
  /* assignee chart labels are user member names — walk only its title */
  assert.match(m.charts.assignees.title, /^T:/);
  walk({ status: m.charts.status, priority: m.charts.priority });
  walk(m.board);
  /* member ids are machine fields — walk only the display fields */
  for (const e of m.members) {
    assert.match(e.name, /^(T:|[A-ZÉ])/);
    for (const k of ['open', 'done', 'total']) assert.equal(typeof e[k], 'number');
  }
  walk(m.milestones);
  walk(m.headers);
});

test('no literal export string leaks into a user-authored title, member name or milestone name', () => {
  const m = buildExportModel(makeChartDoc(), 'p_chart', { scope: 'all' }, prefixedDeps());
  for (const r of topRows(m)) assert.ok(!r.title.startsWith('T:'), 'task titles stay untranslated');
  const lane = buildExportModel(makeMilestoneDoc(), 'p_ms', { scope: 'all' }, prefixedDeps());
  for (const ms of lane.milestones) assert.ok(!ms.name.startsWith('T:'), 'milestone names stay untranslated');
  for (const e of lane.members) assert.ok(e.name.startsWith('T:') || e.name === 'Léa Lead', 'member names come from the doc, labels from the translator');
});
