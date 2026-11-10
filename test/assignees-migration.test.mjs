/* Phase 55 (55-01) — read-time assignee migration + invariants, proven over
   HTTP on its own isolated server. The canonical shape decision D-55-1..4:

   - every task AND subtask read from the server yields `assignees` as an
     array and never a scalar `assignee` (D-55-3 — the invariant cell);
   - an old scalar task field reads back as the sole array member (D-55-2);
   - already-array docs pass through unchanged;
   - dedupe, null/junk strip, out-of-scope (non-member) strip and cap-5
     truncation are enforced in normalize — the one canonical place (D-55-4).

   The scalar-assignee fixture data here is written raw into the workspace doc
   the same way the pre-Phase-55 server stored it — the migration test cells. */

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { ADMIN, login, startServer, withDb } from './helpers/server.mjs';

let server;
let owner;

const M = ['mA', 'mB', 'mC', 'mD', 'mE'];
const memberProfile = id => ({ id, name: `Member ${id.slice(1)}`, email: `${id}@test.local`, role: 'Member', status: 'active', last: 0, tz: '' });

function craftedDoc() {
  return {
    data: {
      members: [memberProfile('mA'), memberProfile('mB'), memberProfile('mC'), memberProfile('mD'), memberProfile('mE')],
      projects: [{ id: 'p1', key: 'one', name: 'One', private: false, members: [], teams: [] }],
      projOrder: ['p1'],
      tasks: [
        { id: 't_scalar', project: 'p1', title: 'Legacy scalar', status: 'todo', assignee: 'mA', labels: [], subtasks: [{ id: 's1', title: 'Legacy sub scalar', status: 'todo', assignee: 'mB' }] },
        { id: 't_dupe', project: 'p1', title: 'Dedupe cell', status: 'todo', assignees: ['mA', 'mA', 'mB'], labels: [], subtasks: [] },
        { id: 't_junk', project: 'p1', title: 'Junk cell', status: 'todo', assignees: ['mA', null, 'mX', 42, '', 'mB'], labels: [], subtasks: [] },
        { id: 't_cap', project: 'p1', title: 'Cap cell', status: 'todo', assignees: ['mA', 'mB', 'mC', 'mD', 'mE', 'mA', 'mF'], labels: [], subtasks: [] },
        { id: 't_array', project: 'p1', title: 'Already array', status: 'todo', assignees: ['mB'], labels: [], subtasks: [] },
        {
          id: 't_sub',
          project: 'p1',
          title: 'Subtask shapes',
          status: 'todo',
          assignees: ['mA'],
          labels: [],
          subtasks: [
            { id: 's2', title: 'Scalar subtask', status: 'todo', assignee: 'mC' },
            { id: 's3', title: 'Array subtask', status: 'todo', assignees: ['mD', 'mD'] },
          ],
        },
      ],
      comments: [],
      activity: [],
      notifs: [],
      files: [],
      events: [],
    },
    prefs: {},
    views: {},
  };
}

const taskOf = (doc, id) => doc.data.tasks.find(t => t.id === id);
const subOf = (doc, id) => doc.data.tasks.flatMap(t => t.subtasks || []).find(s => s.id === id);

before(async () => {
  server = await startServer();
  const signedIn = await login(server.base, ADMIN.email, ADMIN.password);
  assert.equal(signedIn.status, 200, 'bootstrap owner signs in');
  owner = signedIn.client;
  const live = (await owner.get('/api/workspaces/acme')).data;
  withDb(server.dbPath, db => db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(craftedDoc()), live.id));
});

after(async () => {
  await server?.stop();
});

/* ------------------------------ migration cells ------------------------------ */

test('(a) an old scalar task field reads back as the sole array member and the scalar key is gone (D-55-2)', async () => {
  const doc = (await owner.get('/api/workspaces/acme')).data.doc;
  const t = taskOf(doc, 't_scalar');
  assert.deepEqual(t.assignees, ['mA']);
  assert.equal('assignee' in t, false, 'the scalar field is deleted on read');
  const s = subOf(doc, 's1');
  assert.deepEqual(s.assignees, ['mB'], 'the subtask scalar migrates too');
  assert.equal('assignee' in s, false, 'the subtask scalar field is deleted on read');
});

test('(b) an already-array doc passes through unchanged', async () => {
  const doc = (await owner.get('/api/workspaces/acme')).data.doc;
  assert.deepEqual(taskOf(doc, 't_array').assignees, ['mB']);
  assert.deepEqual(taskOf(doc, 't_sub').assignees, ['mA']);
});

test('(c) repeated member ids are deduped in insertion order', async () => {
  const doc = (await owner.get('/api/workspaces/acme')).data.doc;
  assert.deepEqual(taskOf(doc, 't_dupe').assignees, ['mA', 'mB']);
});

test('(d) null / junk / non-member ids are stripped; workspace members survive', async () => {
  const doc = (await owner.get('/api/workspaces/acme')).data.doc;
  // 'mX' is not in the roster (out-of-scope strip), 42 and '' are junk, null dropped.
  assert.deepEqual(taskOf(doc, 't_junk').assignees, ['mA', 'mB']);
});

test('(e) a 7-element array is truncated to the first 5 (cap, insertion order preserved)', async () => {
  const doc = (await owner.get('/api/workspaces/acme')).data.doc;
  assert.deepEqual(taskOf(doc, 't_cap').assignees, ['mA', 'mB', 'mC', 'mD', 'mE']);
});

test('(f) INVARIANT: every task and subtask read path yields assignees as an Array, never a scalar (D-55-3)', async () => {
  const doc = (await owner.get('/api/workspaces/acme')).data.doc;
  for (const t of doc.data.tasks) {
    assert.equal(Array.isArray(t.assignees), true, `task ${t.id} reads assignees as an array`);
    assert.equal('assignee' in t, false, `task ${t.id} carries no scalar assignee key`);
    for (const s of t.subtasks || []) {
      assert.equal(Array.isArray(s.assignees), true, `subtask ${s.id} reads assignees as an array`);
      assert.equal('assignee' in s, false, `subtask ${s.id} carries no scalar assignee key`);
    }
  }
});

/* ------------------------------ write-funnel cells ------------------------------ */

test('a PUT carrying a legacy scalar assignee is normalized on write — the stored doc carries only arrays', async () => {
  const live = (await owner.get('/api/workspaces/acme')).data;
  const doc = structuredClone(live.doc);
  doc.data.tasks.push({ id: 't_new_scalar', project: 'p1', title: 'Scalar via PUT', status: 'todo', assignee: 'mB', labels: [], subtasks: [{ id: 's_new', title: 'Sub scalar via PUT', status: 'todo', assignee: 'mC' }] });
  assert.equal((await owner.put('/api/workspaces/acme', { revision: live.revision, doc })).status, 200);
  const stored = JSON.parse(withDb(server.dbPath, db => db.prepare('select doc from workspaces where slug = ?').get('acme').doc));
  const t = stored.data.tasks.find(t => t.id === 't_new_scalar');
  assert.deepEqual(t.assignees, ['mB'], 'the scalar became the sole array member');
  assert.equal('assignee' in t, false, 'the scalar field does not persist');
  const s = stored.data.tasks.find(t => t.id === 't_new_scalar').subtasks.find(s => s.id === 's_new');
  assert.deepEqual(s.assignees, ['mC']);
  assert.equal('assignee' in s, false);
});
