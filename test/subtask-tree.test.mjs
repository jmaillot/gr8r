/* Subtask tree — Wave-0 harness (Phase 65, plan 65-01).
   Pins the D-01/D-01a/D-03 storage shape end-to-end: a flat t.subtasks[]
   where every entry carries { id, parentId, position }, round-tripped through
   the mergeClientDoc funnel without being stripped, legacy docs healed lazily,
   and no cross-task linkage ever persisting. Later plans extend this file:
   cascade/rollup and validation codes (65-02), FTS/export/MCP parity (65-05).
   House style: node:test + assert/strict over the isolated-server harness. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ADMIN, client, login, startServer } from './helpers/server.mjs';
import { normalizeTaskSubtasks, nextPosition, orderedSiblings } from '../src/core/subtree.js';

/* deterministic id factory for normalize tests (the server passes uid(); the
   module itself stays import-free, so tests inject their own) */
const fakeUid = (() => {
  let n = 0;
  return () => 'gen' + ++n;
})();

/* ---------- normalize: lazy heal of legacy/junk shapes (D-01a/D-03) ---------- */

test('legacy flat subtasks heal: missing parentId → null, missing position → array index', () => {
  const t = { subtasks: [{ id: 'a', title: 'A', done: false }, { id: 'b', title: 'B', done: true }] };
  normalizeTaskSubtasks(t, fakeUid);
  assert.equal(t.subtasks[0].parentId, null);
  assert.equal(t.subtasks[0].position, 0);
  assert.equal(t.subtasks[1].parentId, null);
  assert.equal(t.subtasks[1].position, 1);
  /* the heal mutates in place — unknown/legacy fields survive untouched */
  assert.equal(t.subtasks[0].title, 'A');
  assert.equal(t.subtasks[1].done, true);
});

test('junk/missing position values normalize to array index (Number.isInteger rule)', () => {
  const t = { subtasks: [{ id: 'a' }, { id: 'b', position: 'junk' }, { id: 'c', position: 1.5 }] };
  normalizeTaskSubtasks(t, fakeUid);
  assert.deepEqual(t.subtasks.map(s => s.position), [0, 1, 2]);
});

test('non-object entries (null, junk) are spliced out', () => {
  const t = { subtasks: [null, 'junk', { id: 'a', title: 'A' }, 42] };
  normalizeTaskSubtasks(t, fakeUid);
  assert.equal(t.subtasks.length, 1);
  assert.equal(t.subtasks[0].id, 'a');
});

test('dangling parentId normalizes to null (no cross-task linkage ever persists)', () => {
  const tasks = [
    { subtasks: [{ id: 'a', parentId: 'ghost', title: 'A' }] },
    /* the crafted case: parentId references ANOTHER task's subtask id — the
       normalize pass is per-task, so a valid-in-another-task id is still dangling */
    { subtasks: [{ id: 'b', title: 'B' }, { id: 'c', parentId: 'b', title: 'C' }] },
  ];
  normalizeTaskSubtasks(tasks[0], fakeUid);
  normalizeTaskSubtasks(tasks[1], fakeUid);
  assert.equal(tasks[0].subtasks[0].parentId, null);
  /* the legitimate same-task reference survives */
  assert.equal(tasks[1].subtasks[1].parentId, 'b');
});

test('missing id is generated through the injected factory; a provided id is kept', () => {
  const t = { subtasks: [{ title: 'no-id' }, { id: 'kept', title: 'kept' }] };
  normalizeTaskSubtasks(t, fakeUid);
  assert.equal(t.subtasks[0].id, 'gen1');
  assert.equal(t.subtasks[1].id, 'kept');
});

test('a task without subtasks is left untouched; a non-array subtasks key is ignored', () => {
  const t = { title: 'plain' };
  normalizeTaskSubtasks(t, fakeUid);
  assert.equal(t.subtasks, undefined);
  const junk = { subtasks: 'not-an-array' };
  normalizeTaskSubtasks(junk, fakeUid);
  assert.equal(junk.subtasks, 'not-an-array');
});

/* ---------- ordering helpers: plain (position, arrayIndex) comparators (D-03) ---------- */

test('nextPosition returns max existing position in the parent group + 1', () => {
  const list = [
    { id: 'a', parentId: null, position: 4 },
    { id: 'b', parentId: 'a', position: 0 },
    { id: 'c', parentId: 'a', position: 7 },
    { id: 'd', parentId: null, position: 2 },
  ];
  assert.equal(nextPosition(list, null), 5);
  assert.equal(nextPosition(list, 'a'), 8);
  assert.equal(nextPosition(list, 'missing'), 0);
});

test('orderedSiblings sorts by (position, arrayIndex) — never locale-sensitive', () => {
  const list = [
    { id: 'a', parentId: null, position: 2 },
    { id: 'b', parentId: null, position: 0 },
    { id: 'c', parentId: null, position: 2 }, /* tie with 'a' → array order */
    { id: 'd', parentId: 'a', position: 0 },
  ];
  const roots = orderedSiblings(list, null);
  assert.deepEqual(roots.map(s => s.id), ['b', 'a', 'c']);
  const children = orderedSiblings(list, 'a');
  assert.deepEqual(children.map(s => s.id), ['d']);
});

/* ---------- funnel round-trip: the whitelist sink through a real server ---------- */

async function workspaceWithDoc(t) {
  const server = await startServer();
  try {
    const admin = client(server.base, 'admin');
    assert.equal((await admin.post('/api/auth/login', { email: ADMIN.email, password: ADMIN.password })).status, 200);
    const ws = await admin.get('/api/workspaces/acme');
    assert.equal(ws.status, 200);
    const put = await admin.put('/api/workspaces/acme', {
      revision: ws.data.revision,
      doc: { data: { tasks: [t] } },
    });
    assert.equal(put.status, 200, JSON.stringify(put.data));
    const read = await admin.get('/api/workspaces/acme');
    assert.equal(read.status, 200);
    const doc = read.data.doc || read.data;
    const tasks = doc?.data?.tasks || [];
    return { server, task: tasks.find(x => x.id === t.id) || null, admin };
  } catch (err) {
    await server.stop();
    throw err;
  }
}

test('a two-level tree PUT round-trips id/parentId/position byte-identical', async () => {
  const { server, task } = await workspaceWithDoc({
    id: 't1',
    key: 'ACME-1',
    title: 'Tree task',
    status: 'todo',
    subtasks: [
      { id: 'u1', parentId: null, position: 0, title: 'Root', done: false },
      { id: 'u2', parentId: 'u1', position: 0, title: 'Child of u1', done: false },
    ],
  });
  try {
    assert.ok(task, 'the task is missing from the read-back doc');
    assert.deepEqual(
      task.subtasks.map(s => ({ id: s.id, parentId: s.parentId, position: s.position })),
      [
        { id: 'u1', parentId: null, position: 0 },
        { id: 'u2', parentId: 'u1', position: 0 },
      ],
    );
  } finally {
    await server.stop();
  }
});

test('legacy flat subtasks in a stored doc read back healed (parentId null, position index)', async () => {
  const { server, task } = await workspaceWithDoc({
    id: 't2',
    key: 'ACME-2',
    title: 'Legacy task',
    status: 'todo',
    subtasks: [{ id: 'L1', title: 'old flat', done: false }, { id: 'L2', title: 'second', done: true }],
  });
  try {
    assert.ok(task, 'the legacy task is missing from the read-back doc');
    assert.equal(task.subtasks[0].parentId, null);
    assert.equal(task.subtasks[0].position, 0);
    assert.equal(task.subtasks[1].parentId, null);
    assert.equal(task.subtasks[1].position, 1);
  } finally {
    await server.stop();
  }
});

test('a crafted cross-task parentId never survives the funnel (heals to root)', async () => {
  const { server, admin } = await workspaceWithDoc({
    id: 't3',
    key: 'ACME-3',
    title: 'Crafted task',
    status: 'todo',
    subtasks: [{ id: 'v1', parentId: 'u2', position: 0, title: 'cross-task ref', done: false }],
  });
  try {
    /* u2 belongs to a DIFFERENT task's array — the per-task normalize cannot
       resolve it, so it must land as a root subtask */
    const read = await admin.get('/api/workspaces/acme');
    const t3 = read.data.doc.data.tasks.find(x => x.id === 't3');
    assert.equal(t3.subtasks[0].parentId, null);
    assert.equal(t3.subtasks[0].id, 'v1');
  } finally {
    await server.stop();
  }
});

test('repeat-PUT of the same tree is idempotent (Pitfall 6)', async () => {
  const server = await startServer();
  try {
    const admin = client(server.base, 'admin');
    await admin.post('/api/auth/login', { email: ADMIN.email, password: ADMIN.password });
    const ws = await admin.get('/api/workspaces/acme');
    const doc = { data: { tasks: [{ id: 't4', key: 'ACME-4', title: 'Idem', status: 'todo', subtasks: [{ id: 'w1', parentId: null, position: 0, title: 'R', done: false }] }] } };
    const put1 = await admin.put('/api/workspaces/acme', { revision: ws.data.revision, doc });
    assert.equal(put1.status, 200);
    const ws2 = await admin.get('/api/workspaces/acme');
    const put2 = await admin.put('/api/workspaces/acme', { revision: ws2.data.revision, doc });
    assert.equal(put2.status, 200);
    const read = await admin.get('/api/workspaces/acme');
    const t4 = read.data.doc.data.tasks.find(x => x.id === 't4');
    assert.deepEqual(t4.subtasks.map(s => ({ id: s.id, parentId: s.parentId, position: s.position })), [{ id: 'w1', parentId: null, position: 0 }]);
  } finally {
    await server.stop();
  }
});

/* ---------- reserved for later plans (placeholders, do not fill in 65-01) ---------- */

/* 65-02: cascade delete (children follow parent), cascade auto-done (D-14),
   no reopen-cascade (D-13), leaf-only rollup never double-counts. */

/* 65-02: validateSubtreeMove — subtaskCycle and subtaskDepth reject codes at
   the funnel (wholesale reject, tx rollback), error-codes catalogue keys. */

/* 65-05: FTS subtask-title parity (SQLite + pg), MSPDI OutlineLevel depth
   rows, xlsx/CSV nested rows, MCP writeDoc round-trip. */
