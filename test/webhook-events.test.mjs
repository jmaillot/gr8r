/* Webhook event vocabulary + diff suite (Phase 67, WHK-02).
   Part 1 is a PURE module suite (no server, no imports in the module —
   the zero-import discipline is asserted explicitly). Part 2 is the
   end-to-end tracer: a doc-PUT creating a task claims exactly one pending
   delivery per subscribed hook, post-commit (real server, real SQLite). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { WEBHOOK_EVENTS, EVENT_FIELDS, buildEnvelope, diffWebhookEvents } from '../src/core/webhook-events.js';
import { startServer, withDb, signup, client } from './helpers/server.mjs';

/* --------------------- part 1: pure diff (no server) --------------------- */

const doc = data => ({ data });

test('WEBHOOK_EVENTS is the frozen 8-event vocabulary', () => {
  assert.deepEqual([...WEBHOOK_EVENTS], [
    'task.created',
    'task.completed',
    'task.assigned',
    'task.deleted',
    'comment.added',
    'due.reminder',
    'project.completed',
    'subtask.tree-changed',
  ]);
  assert.equal(Object.isFrozen(WEBHOOK_EVENTS), true);
});

test('a task id present in next but absent from stored emits exactly one task.created', () => {
  const stored = doc({ tasks: [{ id: 't1', title: 'Old', project: 'p1' }] });
  const next = doc({ tasks: [{ id: 't1', title: 'Old', project: 'p1' }, { id: 't2', title: 'New', project: 'p1' }] });
  const events = diffWebhookEvents(stored, next);
  assert.equal(events.length, 1);
  assert.equal(events[0].event, 'task.created');
  assert.equal(events[0].subjectId, 't2');
  assert.equal(events[0].taskId, 't2');
  assert.ok(!Number.isNaN(Date.parse(events[0].occurredAt)), 'occurredAt is an ISO 8601 UTC string');
});

test('a no-change save emits nothing (no spurious events after a sync)', () => {
  const d = doc({ tasks: [{ id: 't1', title: 'Same', project: 'p1' }] });
  assert.deepEqual(diffWebhookEvents(d, d), []);
});

test('a rename-only edit emits nothing', () => {
  const stored = doc({ tasks: [{ id: 't1', title: 'A', project: 'p1' }] });
  const next = doc({ tasks: [{ id: 't1', title: 'B', project: 'p1' }] });
  assert.deepEqual(diffWebhookEvents(stored, next), []);
});

test('a removed task emits exactly one task.deleted carrying the last-known title', () => {
  const stored = doc({ tasks: [{ id: 't1', title: 'Gone', project: 'p1' }] });
  const next = doc({ tasks: [] });
  const events = diffWebhookEvents(stored, next);
  assert.equal(events.length, 1);
  assert.equal(events[0].event, 'task.deleted');
  assert.equal(events[0].subjectId, 't1');
  assert.equal(events[0].data.title, 'Gone');
});

test('a task flipped to done emits exactly one task.completed carrying done + title', () => {
  const stored = doc({ tasks: [{ id: 't1', title: 'Ship', status: 'todo', project: 'p1' }] });
  const next = doc({ tasks: [{ id: 't1', title: 'Ship', status: 'done', project: 'p1' }] });
  const events = diffWebhookEvents(stored, next);
  assert.equal(events.length, 1);
  assert.equal(events[0].event, 'task.completed');
  assert.equal(events[0].data.title, 'Ship');
  assert.equal(events[0].data.done, true);
});

test('created AND assigned in one save emits two distinct events (adjacency edge)', () => {
  const stored = doc({ tasks: [] });
  const next = doc({ tasks: [{ id: 't1', title: 'Fresh', project: 'p1', assignees: ['m1'] }] });
  const events = diffWebhookEvents(stored, next);
  assert.deepEqual(events.map(e => e.event), ['task.created', 'task.assigned']);
  assert.equal(events[1].data.assignees.length, 1);
});

test('a task assigned to 3 people produces ONE task.assigned event whose payload carries the list (Pitfall 2)', () => {
  const stored = doc({ tasks: [{ id: 't1', title: 'Team', project: 'p1', assignees: [] }] });
  const next = doc({ tasks: [{ id: 't1', title: 'Team', project: 'p1', assignees: ['m1', 'm2', 'm3'] }] });
  const events = diffWebhookEvents(stored, next);
  assert.equal(events.length, 1);
  assert.equal(events[0].event, 'task.assigned');
  assert.deepEqual(events[0].data.assignees, ['m1', 'm2', 'm3']);
});

test('a newly added comment emits comment.added carrying body, taskTitle and commentId', () => {
  const stored = doc({ tasks: [{ id: 't1', title: 'Talk', project: 'p1' }], comments: [] });
  const next = doc({
    tasks: [{ id: 't1', title: 'Talk', project: 'p1' }],
    comments: [{ id: 'c1', task: 't1', body: 'first comment' }],
  });
  const events = diffWebhookEvents(stored, next);
  assert.equal(events.length, 1);
  assert.equal(events[0].event, 'comment.added');
  assert.equal(events[0].subjectId, 'c1');
  assert.equal(events[0].data.body, 'first comment');
  assert.equal(events[0].data.taskTitle, 'Talk');
});

test('a project status flip to complete emits project.completed (name + id)', () => {
  const stored = doc({ projects: [{ id: 'p1', name: 'P1', status: 'active' }] });
  const next = doc({ projects: [{ id: 'p1', name: 'P1', status: 'complete' }] });
  const events = diffWebhookEvents(stored, next);
  assert.equal(events.length, 1);
  assert.equal(events[0].event, 'project.completed');
  assert.equal(events[0].subjectId, 'p1');
  assert.equal(events[0].data.projectName, 'P1');
});

test('a subtask re-parented emits subtask.tree-changed (Phase 65 parent/child diff signals)', () => {
  const stored = doc({ tasks: [{ id: 't1', title: 'Tree', project: 'p1', subtasks: [{ id: 's1', parentId: null, title: 'a' }] }] });
  const next = doc({ tasks: [{ id: 't1', title: 'Tree', project: 'p1', subtasks: [{ id: 's1', parentId: 's0', title: 'a' }, { id: 's0', parentId: null, title: 'root' }] }] });
  const events = diffWebhookEvents(stored, next);
  assert.equal(events.length, 1);
  assert.equal(events[0].event, 'subtask.tree-changed');
  assert.equal(events[0].subjectId, 't1');
});

test('EVENT_FIELDS is a frozen whitelist for every event; buildEnvelope is the single field gate', () => {
  for (const ev of WEBHOOK_EVENTS) {
    const fields = EVENT_FIELDS[ev];
    assert.ok(Array.isArray(fields), `${ev} has a whitelist`);
    assert.equal(Object.isFrozen(fields), true, `${ev} whitelist is frozen`);
  }
  const ctx = {
    taskId: 't1',
    title: 'T',
    secretField: 'must-not-leak',
    projectName: 'P',
    projectId: 'p1',
    authorName: 'Ada',
    occurredAt: '2026-11-15T12:00:00.000Z',
  };
  const env = buildEnvelope('task.created', ctx);
  assert.deepEqual(Object.keys(env).sort(), ['authorName', 'occurredAt', 'projectId', 'projectName', 'status', 'taskId', 'title']);
  assert.equal('secretField' in env, false, 'no field outside the whitelist ever enters a payload');
  assert.ok(!Number.isNaN(Date.parse(env.occurredAt)), 'occurredAt is ISO 8601 UTC');
});

test('buildEnvelope falls back to now() when ctx carries no occurredAt', () => {
  const env = buildEnvelope('task.deleted', { taskId: 't1', title: 'Gone' });
  assert.ok(!Number.isNaN(Date.parse(env.occurredAt)));
});

test('mention resolution: assignee with oid → mentions[].oid; without → name only (D-14 intent)', () => {
  const env = buildEnvelope('task.assigned', {
    taskId: 't1',
    title: 'Team',
    assignees: ['m1', 'm2'],
    mentions: [{ memberId: 'm1', name: 'Marie', oid: 'aad-oid-123' }, { memberId: 'm2', name: 'Leo', oid: null }],
    projectName: 'P',
    projectId: 'p1',
    authorName: 'Ada',
  });
  assert.deepEqual(env.assignees, ['m1', 'm2']);
  assert.equal(env.mentions[0].oid, 'aad-oid-123');
  assert.equal(env.mentions[1].oid, null);
  assert.equal(env.mentions[1].name, 'Leo');
});

test('assignee shape variance does not crash the diff (scalar legacy stored, array canonical next)', () => {
  const stored = doc({ tasks: [{ id: 't1', assignee: 'm1' }] });
  const next = doc({ tasks: [{ id: 't1', assignees: ['m1'] }, { id: 't2', assignees: [] }] });
  const events = diffWebhookEvents(stored, next);
  assert.equal(events.length, 1);
  assert.equal(events[0].taskId, 't2');
});

test('fail-absent: malformed docs return [] — never a throw', () => {
  assert.deepEqual(diffWebhookEvents(null, null), []);
  assert.deepEqual(diffWebhookEvents('garbage', 42), []);
  assert.deepEqual(diffWebhookEvents(doc({ tasks: 'not-an-array' }), doc({ tasks: [{ id: 't9' }] })).map(e => e.taskId), ['t9']);
});

test('zero-import discipline: no import or require statements in the module', () => {
  const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'core', 'webhook-events.js'), 'utf8');
  assert.equal(/^import |^const .*require\(/m.test(src), false, 'src/core/webhook-events.js must have ZERO imports (subtree.js discipline)');
});

/* -------------- part 2: tracer — doc-PUT → claim (real server) -------------- */

const TOKEN = 'webhook-events-token';
let server;
let ws;
let owner;

before(async () => {
  server = await startServer({ env: { WEBHOOK_TEST_TOKEN: TOKEN, REMINDER_TEST_TOKEN: TOKEN } });
  const email = 'we-owner@test.local';
  const password = 'correct-horse-9';
  await signup(server.base, { name: 'WE Owner', email, password });
  owner = client(server.base, email);
  const login = await owner.post('/api/auth/login', { email, password });
  assert.equal(login.status, 200);
  const created = await owner.post('/api/workspaces', { name: 'WE Ws', slug: 'we-ws' });
  assert.equal(created.status, 201);
  ws = withDb(server.dbPath, db => db.prepare('select * from workspaces where slug = ?').get('we-ws'));
});

after(async () => {
  await server?.stop();
});

function insertHook({ id = 'wh-e', events = '["task.created"]', status = 'active', project = 'p1' } = {}) {
  withDb(server.dbPath, db =>
    db
      .prepare('insert into webhook_hooks (id, workspace_id, project_id, url, secret, format, events, status, created_by, created_at) values (?,?,?,?,?,?,?,?,?,?)')
      .run(id, ws.id, project, 'https://hook.test/flows/xyz', 'whsec-e', 'teams-adaptive', events, status, 'u-we', Date.now()),
  );
}

const hookRows = () => withDb(server.dbPath, db => db.prepare('select * from webhook_deliveries order by created_at').all());

/* PUT a doc that adds one task to project p1. */
async function putWithTask(taskId) {
  const read = await owner.get(`/api/workspaces/${ws.slug}`);
  assert.equal(read.status, 200, `doc read ${read.status}`);
  const next = read.data.doc;
  next.data.projects = [{ id: 'p1', name: 'P1' }];
  next.data.tasks = [...(Array.isArray(next.data.tasks) ? next.data.tasks : []), { id: taskId, key: 'P1-9', title: `Diff task ${taskId}`, status: 'todo', project: 'p1', assignees: [] }];
  return owner.put(`/api/workspaces/${ws.slug}`, { revision: read.data.revision, doc: next });
}

test('a doc-PUT creating a task with one subscribed hook yields exactly one pending delivery row', async () => {
  insertHook();
  const saved = await putWithTask('t-new');
  assert.equal(saved.status, 200, `PUT ${saved.status} ${JSON.stringify(saved.data)}`);
  const rows = hookRows().filter(r => r.dedup_key === 'wh-e:task.created:t-new');
  assert.equal(rows.length, 1, 'exactly one claim row');
  assert.equal(rows[0].status, 'pending');
  assert.equal(rows[0].event, 'task.created');
  assert.equal(rows[0].hook_id, 'wh-e');
});

test('the same PUT replayed claims nothing new (exactly-once, diff-based)', async () => {
  const saved = await putWithTask('t-new');
  assert.equal(saved.status, 200);
  const rows = hookRows().filter(r => r.dedup_key === 'wh-e:task.created:t-new');
  assert.equal(rows.length, 1, 'still exactly one row');
});

test('a doc-PUT with zero subscribed hooks yields zero rows and no error (empty edge)', async () => {
  withDb(server.dbPath, db => db.prepare('update webhook_hooks set status = ? where id = ?').run('disabled', 'wh-e'));
  const before = hookRows().length;
  const saved = await putWithTask('t-nohooks');
  assert.equal(saved.status, 200, 'the PUT is never failed by webhook plumbing');
  assert.equal(hookRows().length, before, 'no delivery rows');
});

/* -------------- part 3: due.reminder — the second emission site -------------- */

/* The reminder funnel fires at-or-after 08:00 LOCAL; the workspace fixture
   runs on UTC (member tz default), so 08:00Z is the open-window instant. */
test('a due task with a subscribed hook yields exactly ONE due.reminder delivery per reminder claim (no double-fire)', async () => {
  const mem = withDb(server.dbPath, db => db.prepare('select member_id from memberships where workspace_id = ? limit 1').get(ws.id));
  assert.ok(mem?.member_id, 'membership member_id');
  /* Craft the doc: a task due today, assigned to the owner member. */
  const read = await owner.get(`/api/workspaces/${ws.slug}`);
  assert.equal(read.status, 200);
  const next = read.data.doc;
  const today = new Date().toISOString().slice(0, 10);
  next.data.projects = [{ id: 'p1', name: 'P1' }];
  next.data.tasks = [
    ...(Array.isArray(next.data.tasks) ? next.data.tasks : []).filter(t => t.id !== 't-due'),
    { id: 't-due', key: 'P1-10', title: 'Due task', status: 'todo', project: 'p1', assignees: [mem.member_id], due: today },
  ];
  const saved = await owner.put(`/api/workspaces/${ws.slug}`, { revision: read.data.revision, doc: next });
  assert.equal(saved.status, 200, `doc PUT ${saved.status}`);
  /* Subscribe a hook to due.reminder only. */
  withDb(server.dbPath, db =>
    db
      .prepare('insert into webhook_hooks (id, workspace_id, project_id, url, secret, format, events, status, created_by, created_at) values (?,?,?,?,?,?,?,?,?,?)')
      .run('wh-rem', ws.id, 'p1', 'https://hook.test/flows/rem', 'whsec-rem', 'teams-adaptive', '["due.reminder"]', 'active', 'u-we', Date.now()),
  );
  const triggerPass = () =>
    fetch(`${server.base}/api/internal/reminder-pass`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-reminder-token': TOKEN },
      body: JSON.stringify({ now: new Date().toISOString() }),
    }).then(async r => {
      assert.equal(r.status, 200, `reminder pass ${r.status}`);
      return r.json();
    });
  await triggerPass();
  const rows = hookRows().filter(r => r.event === 'due.reminder');
  assert.equal(rows.length, 1, 'exactly one due.reminder claim row');
  assert.ok(rows[0].dedup_key.startsWith('wh-rem:due.reminder:'), 'dedup key carries the reminder subject');
  /* A replayed pass must claim nothing new (the reminders_sent claim is the guard). */
  await triggerPass();
  const after = hookRows().filter(r => r.event === 'due.reminder');
  assert.equal(after.length, 1, 'no double-fire between the reminder dedup and the webhook claim');
});
