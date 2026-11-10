/* Phase 55 (55-01) — the per-member assignee write-guard and the
   member-removal sweep, proven over HTTP on their own isolated server.

   - a PUT whose task assignees array contains a member who cannot read the
     task's project is rejected with 400 assigneeOutOfScope (D-55-4, D-55-9);
   - the SAME rejection fires when the out-of-scope member sits in a SUBTASK's
     assignees array (research pitfall 2 — guest leak vector through subtasks);
   - a valid multi-member array persists as-is; an empty array is accepted
     (Unassigned is valid);
   - removing a member strips their id from every task and subtask array, and
     an array that becomes empty stays an empty array (D-55-4). */

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { ADMIN, inviteToken, login, signup, startServer, withDb } from './helpers/server.mjs';

const PASSWORD = 'guard-password-1';
const ACCOUNT = (name, email) => ({ name, email, password: PASSWORD });

let server;
let owner;
let member;
let memberUserId;
let ownerMid;
let memberMid;

const storedDoc = () => JSON.parse(withDb(server.dbPath, db => db.prepare('select doc from workspaces where slug = ?').get('acme').doc));
const taskOf = (doc, id) => doc.data.tasks.find(t => t.id === id);

before(async () => {
  server = await startServer();
  const signedIn = await login(server.base, ADMIN.email, ADMIN.password);
  assert.equal(signedIn.status, 200, 'bootstrap owner signs in');
  owner = signedIn.client;

  // Shape the workspace: one public + one private project (owner-only access).
  const live = (await owner.get('/api/workspaces/acme')).data;
  ownerMid = (await owner.get('/api/workspaces/acme/members')).data.members.find(m => m.email === ADMIN.email).memberId;
  const doc = structuredClone(live.doc);
  doc.data.projects = [
    { id: 'p_in', key: 'in', name: 'Public', private: false, members: [], teams: [] },
    { id: 'p_priv', key: 'prv', name: 'Private', private: true, members: [ownerMid], lead: ownerMid, teams: [] },
  ];
  doc.data.projOrder = ['p_in', 'p_priv'];
  doc.data.tasks = [{ id: 't_base', project: 'p_in', title: 'Base task', status: 'todo', labels: [], subtasks: [] }];
  assert.equal((await owner.put('/api/workspaces/acme', { revision: live.revision, doc })).status, 200);

  // One member-role membership, joined via invite.
  const [inv] = (await owner.post('/api/workspaces/acme/invites', { emails: ['member@test.local'], role: 'member' })).data.invites;
  member = (await signup(server.base, ACCOUNT('Member', 'member@test.local'))).client;
  const joined = await member.post(`/api/invites/${inviteToken(inv.url)}/accept`);
  assert.ok([200, 201].includes(joined.status), 'the member joined');
  memberUserId = (await owner.get('/api/workspaces/acme/members')).data.members.find(m => m.email === 'member@test.local').userId;
  memberMid = (await owner.get('/api/workspaces/acme/members')).data.members.find(m => m.email === 'member@test.local').memberId;
});

after(async () => {
  await server?.stop();
});

test('(a) a task assignees array containing a member who cannot read the project → 400 assigneeOutOfScope', async () => {
  const live = (await owner.get('/api/workspaces/acme')).data;
  const doc = structuredClone(live.doc);
  doc.data.tasks.push({ id: 't_g1', project: 'p_priv', title: 'Guard probe', status: 'todo', assignees: [ownerMid, memberMid], labels: [], subtasks: [] });
  const res = await owner.put('/api/workspaces/acme', { revision: live.revision, doc });
  assert.equal(res.status, 400, 'the write is rejected');
  assert.equal(res.data?.code, 'assigneeOutOfScope');
  assert.equal(res.data?.error, 'Assignee cannot read the task project');
  assert.ok(!taskOf(storedDoc(), 't_g1'), 'the stored doc is unchanged');
});

test('(b) an out-of-scope member in a SUBTASK assignees array → the same 400 (subtask leak vector)', async () => {
  const live = (await owner.get('/api/workspaces/acme')).data;
  const doc = structuredClone(live.doc);
  doc.data.tasks.push({
    id: 't_g2',
    project: 'p_priv',
    title: 'Subtask guard probe',
    status: 'todo',
    assignees: [ownerMid],
    labels: [],
    subtasks: [{ id: 's_g2', title: 'Guarded subtask', status: 'todo', assignees: [memberMid] }],
  });
  const res = await owner.put('/api/workspaces/acme', { revision: live.revision, doc });
  assert.equal(res.status, 400, 'the subtask array is guarded too');
  assert.equal(res.data?.code, 'assigneeOutOfScope');
  assert.ok(!taskOf(storedDoc(), 't_g2'), 'the stored doc is unchanged');
});

test('(c) a valid 2-member array on a readable project → 200 and persisted as-is', async () => {
  const live = (await owner.get('/api/workspaces/acme')).data;
  const doc = structuredClone(live.doc);
  doc.data.tasks.push({ id: 't_ok', project: 'p_in', title: 'Shared task', status: 'todo', assignees: [ownerMid, memberMid], labels: [], subtasks: [] });
  assert.equal((await owner.put('/api/workspaces/acme', { revision: live.revision, doc })).status, 200);
  assert.deepEqual(taskOf(storedDoc(), 't_ok').assignees, [ownerMid, memberMid]);
});

test('(d) removing a member strips their id from task and subtask arrays; emptied arrays stay empty arrays', async () => {
  const live = (await owner.get('/api/workspaces/acme')).data;
  const doc = structuredClone(live.doc);
  doc.data.tasks.push(
    { id: 't_rm', project: 'p_in', title: 'Removal probe', status: 'todo', assignees: [ownerMid, memberMid], labels: [], subtasks: [{ id: 's_rm', title: 'Sub', status: 'todo', assignees: [memberMid, ownerMid] }] },
    { id: 't_rm_solo', project: 'p_in', title: 'Solo probe', status: 'todo', assignees: [memberMid], labels: [], subtasks: [] },
  );
  assert.equal((await owner.put('/api/workspaces/acme', { revision: live.revision, doc })).status, 200);

  const res = await owner.del(`/api/workspaces/acme/members/${memberUserId}`);
  assert.equal(res.status, 200, 'the member is removed');
  const stored = storedDoc();
  assert.deepEqual(taskOf(stored, 't_rm').assignees, [ownerMid], 'the removed id is filtered out');
  assert.deepEqual(taskOf(stored, 't_rm').subtasks.find(s => s.id === 's_rm').assignees, [ownerMid], 'the subtask array is filtered too');
  assert.deepEqual(taskOf(stored, 't_rm_solo').assignees, [], 'an emptied array stays an empty array (Unassigned)');
  assert.equal(Array.isArray(taskOf(stored, 't_rm_solo').assignees), true, 'the emptied array is not deleted');
});

test('(e) an empty assignees array is accepted — Unassigned is valid', async () => {
  const live = (await owner.get('/api/workspaces/acme')).data;
  const doc = structuredClone(live.doc);
  doc.data.tasks.push({ id: 't_empty', project: 'p_in', title: 'Unassigned probe', status: 'todo', assignees: [], labels: [], subtasks: [] });
  const res = await owner.put('/api/workspaces/acme', { revision: live.revision, doc });
  assert.equal(res.status, 200, 'the empty array passes the guard');
  assert.deepEqual(taskOf(storedDoc(), 't_empty').assignees, []);
});
