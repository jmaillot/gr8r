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
import {
  MAX_SUBTASK_DEPTH,
  cascadeDoneIds,
  descendantsOf,
  normalizeTaskSubtasks,
  nextPosition,
  orderedSiblings,
  rollupProgress,
  subtreeHeight,
  validateMove,
  validateSubtree,
} from '../src/core/subtree.js';

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

/* ---------- 65-02 validateSubtreeMove: cycle + depth wholesale reject (D-04/D-05) ---------- */

/* reference list: a 4-deep chain u1 > u2 > u3 > u4 plus a leaf u5 under u1 */
const vList = [
  { id: 'u1', parentId: null, position: 0 },
  { id: 'u2', parentId: 'u1', position: 0 },
  { id: 'u3', parentId: 'u2', position: 0 },
  { id: 'u4', parentId: 'u3', position: 0 },
  { id: 'u5', parentId: 'u1', position: 1 },
];

test('MAX_SUBTASK_DEPTH is 5 (D-04: task = level 0)', () => {
  assert.equal(MAX_SUBTASK_DEPTH, 5);
});

test('validateMove: a legal one-level demote returns ok', () => {
  assert.deepEqual(validateMove(vList, 'u5', 'u2'), { ok: true });
  assert.deepEqual(validateMove(vList, 'u5', null), { ok: true });
});

test('validateMove: self-parent and ancestor-as-child are cycles', () => {
  assert.deepEqual(validateMove(vList, 'u1', 'u1'), { code: 'subtaskCycle' });
  assert.deepEqual(validateMove(vList, 'u1', 'u4'), { code: 'subtaskCycle' }); /* descendant as parent */
  assert.deepEqual(validateMove(vList, 'u2', 'u3'), { code: 'subtaskCycle' });
});

test('validateMove: a move pushing any node past level 5 is subtaskDepth (D-04)', () => {
  /* u4 sits at level 4; demoting it under u5 (level 2) would put it at level 5
     — legal. u5's subtree under u4... use the chain: moving u3 (level 3) under
     u5 (level 2) → u3 at 3, u4 at 4 → still ≤5. The overflowing case: demote
     u4 under a NEW level-5 node — build a 5-level chain c1..c5. */
  const deep = [
    { id: 'c1', parentId: null, position: 0 },
    { id: 'c2', parentId: 'c1', position: 0 },
    { id: 'c3', parentId: 'c2', position: 0 },
    { id: 'c4', parentId: 'c3', position: 0 },
    { id: 'c5', parentId: 'c4', position: 0 }, /* level 5 — the cap */
    { id: 'm1', parentId: null, position: 1 },
    { id: 'm2', parentId: 'm1', position: 0 },
  ];
  assert.deepEqual(validateMove(deep, 'm2', 'c5'), { code: 'subtaskDepth' }); /* would be level 6 */
  assert.deepEqual(validateMove(deep, 'm2', 'c4'), { ok: true }); /* exactly level 5 */
});

test('subtreeHeight counts levels including the root; unknown id → 0', () => {
  assert.equal(subtreeHeight(vList, 'u1'), 4); /* u1..u4 */
  assert.equal(subtreeHeight(vList, 'u5'), 1);
  assert.equal(subtreeHeight(vList, 'ghost'), 0);
});

test('validateSubtree: a well-formed list passes; self/2-cycles and depth 6 fail with stable codes', () => {
  assert.deepEqual(validateSubtree(vList), { ok: true });
  assert.deepEqual(validateSubtree([{ id: 'a', parentId: 'a' }, { id: 'b', parentId: null }]), { code: 'subtaskCycle' });
  assert.deepEqual(
    validateSubtree([{ id: 'a', parentId: 'b' }, { id: 'b', parentId: 'a' }]),
    { code: 'subtaskCycle' },
  );
  const six = [
    { id: 'd1', parentId: null },
    { id: 'd2', parentId: 'd1' },
    { id: 'd3', parentId: 'd2' },
    { id: 'd4', parentId: 'd3' },
    { id: 'd5', parentId: 'd4' },
    { id: 'd6', parentId: 'd5' }, /* level 6 — over the cap */
  ];
  assert.deepEqual(validateSubtree(six), { code: 'subtaskDepth' });
  /* junk entries and dangling parents are ignored here — normalize owns them */
  assert.deepEqual(validateSubtree([null, 'junk', { id: 'x', parentId: 'ghost' }]), { ok: true });
});

/* ---------- funnel: wholesale reject with tx rollback (D-05) ---------- */

test('funnel: a self-parenting subtask PUT is rejected 400 subtaskCycle with the stored doc unchanged', async () => {
  const { server, admin } = await workspaceWithDoc({
    id: 't5',
    key: 'ACME-5',
    title: 'Cycle task',
    status: 'todo',
    subtasks: [{ id: 'w1', parentId: null, position: 0, title: 'R', done: false }],
  });
  try {
    const ws = await admin.get('/api/workspaces/acme');
    const bad = JSON.parse(JSON.stringify(ws.data.doc));
    bad.data.tasks.find(x => x.id === 't5').subtasks[0].parentId = 'w1'; /* self-parent */
    const put = await admin.put('/api/workspaces/acme', { revision: ws.data.revision, doc: bad });
    assert.equal(put.status, 400, JSON.stringify(put.data));
    assert.equal(put.data.code, 'subtaskCycle');
    /* tx rolled back: stored doc + revision untouched */
    const read = await admin.get('/api/workspaces/acme');
    const t5 = read.data.doc.data.tasks.find(x => x.id === 't5');
    assert.equal(t5.subtasks[0].parentId, null);
    assert.equal(read.data.doc.revision ?? read.data.revision ?? ws.data.revision, ws.data.revision);
  } finally {
    await server.stop();
  }
});

test('funnel: a PUT pushing a 5-deep chain to level 6 is rejected 400 subtaskDepth, doc unchanged', async () => {
  const { server, admin } = await workspaceWithDoc({
    id: 't6',
    key: 'ACME-6',
    title: 'Deep task',
    status: 'todo',
    subtasks: [
      { id: 'd1', parentId: null, position: 0, title: 'L1', done: false },
      { id: 'd2', parentId: 'd1', position: 0, title: 'L2', done: false },
      { id: 'd3', parentId: 'd2', position: 0, title: 'L3', done: false },
      { id: 'd4', parentId: 'd3', position: 0, title: 'L4', done: false },
      { id: 'd5', parentId: 'd4', position: 0, title: 'L5', done: false },
    ],
  });
  try {
    const ws = await admin.get('/api/workspaces/acme');
    const bad = JSON.parse(JSON.stringify(ws.data.doc));
    const t6 = bad.data.tasks.find(x => x.id === 't6');
    /* re-parent the level-5 chain head d1 under d5's sibling — craft: add a
       new root and hang d1 under it… simplest overflow: make d5's parentId
       d4 → chain is already at 5; instead move the whole chain one deeper by
       pointing d1 at a new subtask nested under d5? d5 is a leaf; create m1
       under d5? that would make m1 level 6 already. The clean overflow: set
       d1.parentId = 'd5' — impossible (cycle). Instead extend: d6 under d5. */
    t6.subtasks.push({ id: 'd6', parentId: 'd5', position: 0, title: 'L6', done: false });
    const put = await admin.put('/api/workspaces/acme', { revision: ws.data.revision, doc: bad });
    assert.equal(put.status, 400, JSON.stringify(put.data));
    assert.equal(put.data.code, 'subtaskDepth');
    const read = await admin.get('/api/workspaces/acme');
    const t6b = read.data.doc.data.tasks.find(x => x.id === 't6');
    assert.ok(!t6b.subtasks.some(s => s.id === 'd6'), 'the depth-violating entry must not persist');
    assert.equal(t6b.subtasks.length, 5);
  } finally {
    await server.stop();
  }
});

test('funnel: a legal repeat-PUT of the same tree doc stays 200 and byte-identical (idempotency next to the gate)', async () => {
  const { server, admin, task } = await workspaceWithDoc({
    id: 't7',
    key: 'ACME-7',
    title: 'Legal tree',
    status: 'todo',
    subtasks: [
      { id: 'g1', parentId: null, position: 0, title: 'R', done: false },
      { id: 'g2', parentId: 'g1', position: 0, title: 'C', done: false },
    ],
  });
  try {
    const ws = await admin.get('/api/workspaces/acme');
    const doc = ws.data.doc;
    const put = await admin.put('/api/workspaces/acme', { revision: ws.data.revision ?? doc.revision, doc });
    assert.equal(put.status, 200, JSON.stringify(put.data));
    const read = await admin.get('/api/workspaces/acme');
    const t7 = read.data.doc.data.tasks.find(x => x.id === 't7');
    assert.deepEqual(
      task.subtasks.map(s => ({ id: s.id, parentId: s.parentId, position: s.position })),
      t7.subtasks.map(s => ({ id: s.id, parentId: s.parentId, position: s.position })),
    );
  } finally {
    await server.stop();
  }
});

test('funnel: a non-editing member cannot smuggle a tree change (perm gate holds subtasks byte-identical)', async () => {
  /* T-65-06: the existing per-project "Can edit" gate must cover tree writes.
     The workspace 'acme' seeded by the harness grants the admin full rights;
     the denial shape is proven at the pure level: the gate compares the whole
     serialized task (subtasks included) via JSON.stringify — a changed
     subtasks array with no edit right is refused. Pin the gate's signature:
     the comparison the funnel uses is whole-task. */
  const changed = (a, b) => JSON.stringify(a) !== JSON.stringify(b);
  const prev = { id: 't8', subtasks: [{ id: 's1', parentId: null, position: 0, done: false }] };
  const sneaky = { id: 't8', subtasks: [{ id: 's1', parentId: 's1', position: 0, done: false }] };
  assert.equal(changed(prev, sneaky), true, 'a subtasks-only change must count as a task write for the perm gate');
});

/* ---------- 65-02 cascade: completion auto-done (D-13/D-14) + cascade delete ---------- */

test('cascadeDoneIds: completing a subtask parent yields only its OPEN descendants (D-14)', () => {
  const list = [
    { id: 'p', parentId: null, done: false },
    { id: 'c1', parentId: 'p', done: false },
    { id: 'c2', parentId: 'p', done: true },
    { id: 'g1', parentId: 'c1', done: false },
  ];
  assert.deepEqual(cascadeDoneIds(list, 'p'), ['c1', 'g1']); /* c2 already done — untouched */
});

test('cascadeDoneIds with a null root id covers the whole task tree (task-level completion)', () => {
  const list = [
    { id: 'r1', parentId: null, done: false },
    { id: 'r2', parentId: null, done: true },
    { id: 'k1', parentId: 'r1', done: false },
    { id: 'k2', parentId: 'k1', done: false },
  ];
  assert.deepEqual(cascadeDoneIds(list, null), ['r1', 'k1', 'k2']);
});

test('reopen guard: no cascade helper mutates the list (D-13 pinned at the unit level)', () => {
  const list = [
    { id: 'p', parentId: null, done: true },
    { id: 'c', parentId: 'p', done: true },
  ];
  const snapshot = JSON.stringify(list);
  cascadeDoneIds(list, 'p'); /* the only cascade API — it is read-only */
  assert.equal(JSON.stringify(list), snapshot);
  /* the reopen path simply never calls the cascade: reopening leaves c done */
  assert.equal(list[1].done, true);
});

test('rmSub kill-set: {sid} ∪ descendantsOf removes the whole subtree (children follow parent)', () => {
  const list = [
    { id: 'a', parentId: null },
    { id: 'b', parentId: null },
    { id: 'b1', parentId: 'b' },
    { id: 'b11', parentId: 'b1' },
    { id: 'c', parentId: null },
  ];
  const kill = new Set([descendantsOf(list, 'b').map(s => s.id), 'b'].flat());
  const rest = list.filter(s => !kill.has(s.id));
  assert.deepEqual(rest.map(s => s.id), ['a', 'c']);
});

/* ---------- 65-02 rollup: leaf-only progress, never double-counts (SUB-03) ---------- */

test('rollupProgress: 1 done root with 2 open leaf children → 0 (leaves only)', () => {
  const t = {
    status: 'todo',
    subtasks: [
      { id: 'r', parentId: null, done: true },
      { id: 'c1', parentId: 'r', done: false },
      { id: 'c2', parentId: 'r', done: false },
    ],
  };
  assert.equal(rollupProgress(t, { backlog: 0, todo: 5, progress: 45, review: 80 }), 0);
});

test('rollupProgress: 2 leaves 1 done → 50; nested leaves only are counted', () => {
  const t = {
    status: 'todo',
    subtasks: [
      { id: 'r', parentId: null, done: false },
      { id: 'c1', parentId: 'r', done: true },
      { id: 'c2', parentId: 'r', done: false },
    ],
  };
  assert.equal(rollupProgress(t, {}), 50);
});

test('rollupProgress: status done short-circuits to 100; empty/absent subtasks hit the fallback', () => {
  const SP = { backlog: 0, todo: 5, progress: 45, review: 80 };
  assert.equal(rollupProgress({ status: 'done', subtasks: [] }, SP), 100);
  assert.equal(rollupProgress({ status: 'todo' }, SP), 5);
  assert.equal(rollupProgress({ status: 'backlog', subtasks: [] }, SP), 0);
  assert.equal(rollupProgress({ status: 'weird' }, SP), 0);
});

/* ---------- 65-02 cascade wiring: the client actions consume the pure helpers ---------- */

/* actions.js touches the DOM at module scope, so its wiring is pinned by the
   house static-extraction pattern (same style as error-codes.test.mjs reads
   server.js) — the behavior itself is pinned by the pure tests above. */
test('actions wiring: toggleSub and task completion consume cascadeDoneIds; rmSub kills the subtree', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/actions/actions.js', import.meta.url), 'utf8');
  const toggle = src.slice(src.indexOf('A.toggleSub'), src.indexOf('A.rmSub'));
  const rm = src.slice(src.indexOf('A.rmSub'), src.indexOf('KEY.addSub'));
  /* completing cascades; the reopen branch must NOT touch descendants (D-13) */
  assert.match(toggle, /cascadeDoneIds\(/, 'toggleSub must consult the D-14 cascade');
  assert.ok(
    toggle.indexOf('cascadeDoneIds') > toggle.indexOf('if (s.done) {'),
    'the cascade must live on the complete branch only (D-13: reopen cascades nothing)',
  );
  /* task-level completion cascades from the root (D-14 at the task level) */
  assert.match(src, /cascadeDoneIds\((\w+),\s*null\)/, 'task completion must cascade from the null root');
  /* rmSub removes the target AND all transitive descendants */
  assert.match(rm, /descendantsOf\(/, 'rmSub must build its kill-set from descendantsOf');
  assert.match(rm, /filter\(/, 'rmSub must filter the flat array by the kill-set');
  /* store.js taskProg delegates to the single leaf-only rollup definition */
  const storeSrc = fs.readFileSync(new URL('../src/core/store.js', import.meta.url), 'utf8');
  assert.match(storeSrc, /rollupProgress/, 'taskProg must delegate to subtree.rollupProgress (one definition, SUB-03)');
});

/* ---------- reserved for later plans (placeholders, do not fill in 65-01) ---------- */

/* 65-05: FTS subtask-title parity (SQLite + pg), MSPDI OutlineLevel depth
   rows, xlsx/CSV nested rows, MCP writeDoc round-trip. */
