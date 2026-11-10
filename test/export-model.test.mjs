/* Phase 54 (54-01): the export model — unit tests over the plain fixture
   data. No server, no DOM (except the taskProg parity probe, which stubs
   the globals src/core/store.js touches at import time). */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildExportModel, DEFAULT_OPTIONS, STATUS_IDS, PRIORITY_IDS, taskProgress, plainText } from '../src/export/model.js';
import { makeDoc, makeEmptyProjectDoc, makeZeroChartDoc } from './fixtures/export-fixtures.mjs';

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
