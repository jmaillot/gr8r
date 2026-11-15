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
import { WEBHOOK_EVENTS, diffWebhookEvents } from '../src/core/webhook-events.js';
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

test('deleted and edited tasks emit nothing in this tracer (task.created only — 67-02 expands)', () => {
  const stored = doc({ tasks: [{ id: 't1' }, { id: 't2' }] });
  const next = doc({ tasks: [{ id: 't1', title: 'renamed' }] });
  assert.deepEqual(diffWebhookEvents(stored, next), []);
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
  server = await startServer({ env: { WEBHOOK_TEST_TOKEN: TOKEN } });
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
