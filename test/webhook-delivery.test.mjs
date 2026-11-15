/* Webhook delivery engine suite (Phase 67, WHK-03 / D-05 / D-07).
   Real server, real SQLite. fetch + DNS lookup + clock are injected through
   the test-only /api/internal/webhook-pass route (WEBHOOK_TEST_TOKEN, the
   /api/internal/reminder-pass pattern) — ZERO network, ZERO real timers.
   The stub fetch records calls so assertions can pin the HMAC signature and
   the raw body; the stub lookup feeds ssrfOk's per-attempt guard. */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, test } from 'node:test';
import { startServer, withDb, signup, client } from './helpers/server.mjs';

const TOKEN = 'webhook-test-token';
const SECRET = 'whsec-tracer-secret';
const NOW = Date.parse('2026-11-15T12:00:00Z');
const LOOKUP = { 'hook.test': ['93.184.216.34'] };

let server;
let ws;
let owner;

before(async () => {
  server = await startServer({ env: { WEBHOOK_TEST_TOKEN: TOKEN } });
  const email = 'wh-owner@test.local';
  const password = 'correct-horse-9';
  await signup(server.base, { name: 'WH Owner', email, password });
  owner = client(server.base, email);
  const login = await owner.post('/api/auth/login', { email, password });
  assert.equal(login.status, 200, 'owner login');
  const created = await owner.post('/api/workspaces', { name: 'WH Ws', slug: 'wh-ws' });
  assert.equal(created.status, 201, 'workspace create');
  ws = withDb(server.dbPath, db => db.prepare('select * from workspaces where slug = ?').get('wh-ws'));
  /* Baseline doc: project p1 + task t1 — the tracer envelope rebuilds the
     body from the CURRENT doc at delivery time. */
  const read = await owner.get(`/api/workspaces/${ws.slug}`);
  assert.equal(read.status, 200);
  const doc = read.data.doc;
  doc.data.projects = [{ id: 'p1', name: 'P1' }];
  doc.data.tasks = [{ id: 't1', key: 'P1-1', title: 'Tracer task', status: 'todo', project: 'p1', assignees: [] }];
  const saved = await owner.put(`/api/workspaces/${ws.slug}`, { revision: read.data.revision, doc });
  assert.equal(saved.status, 200, `baseline PUT ${saved.status} ${JSON.stringify(saved.data)}`);
});

after(async () => {
  await server?.stop();
});

/* ---------------------------- harness helpers ---------------------------- */

const trigger = (payload = {}) =>
  fetch(`${server.base}/api/internal/webhook-pass`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-webhook-token': TOKEN },
    body: JSON.stringify(payload),
  }).then(async r => ({ status: r.status, data: await r.json().catch(() => null) }));

function insertHook(h = {}) {
  const hook = { id: 'wh1', url: 'https://hook.test/flows/abc', events: '["task.created"]', status: 'active', ...h };
  withDb(server.dbPath, db =>
    db
      .prepare('insert into webhook_hooks (id, workspace_id, project_id, url, secret, format, events, status, created_by, created_at) values (?,?,?,?,?,?,?,?,?,?)')
      .run(hook.id, ws.id, 'p1', hook.url, SECRET, 'teams-adaptive', hook.events, hook.status, 'u-wh', NOW),
  );
  return hook;
}

function insertDelivery(d = {}) {
  const hook = d.hook || 'wh1';
  const event = d.event || 'task.created';
  const row = { id: 'd1', hook, event, dedup: `${hook}:${event}:${d.subject || 't1'}`, status: 'pending', attempt: 0, nextAt: null, createdAt: NOW, ...d };
  withDb(server.dbPath, db =>
    db
      .prepare('insert into webhook_deliveries (id, workspace_id, hook_id, event, dedup_key, attempt, status, next_attempt_at, created_at) values (?,?,?,?,?,?,?,?,?)')
      .run(row.id, ws.id, row.hook, row.event, row.dedup, row.attempt, row.status, row.nextAt, row.createdAt),
  );
  return row;
}

const deliveryRow = id => withDb(server.dbPath, db => db.prepare('select * from webhook_deliveries where id = ?').get(id));
const bumpAttempt = (id, attempt) =>
  withDb(server.dbPath, db => db.prepare("update webhook_deliveries set attempt = ?, status = 'failed' where id = ?").run(attempt, id));
const callsOf = r => (Array.isArray(r.data?.calls) ? r.data.calls : []);

/* -------------------------------- tests --------------------------------- */

test('double enqueue with the same (hook, event, subject) claims exactly ONE row; one HTTP send', async () => {
  insertHook();
  const first = await trigger({ now: NOW, fetch: { statusCode: 200 }, lookup: LOOKUP, enqueue: [{ hookId: 'wh1', event: 'task.created', subjectId: 't1' }] });
  assert.equal(first.status, 200, `trigger ${first.status} ${JSON.stringify(first.data)}`);
  assert.equal(first.data.claimed, 1);
  const second = await trigger({ now: NOW, fetch: { statusCode: 200 }, lookup: LOOKUP, enqueue: [{ hookId: 'wh1', event: 'task.created', subjectId: 't1' }] });
  assert.equal(second.status, 200);
  assert.equal(second.data.claimed, 0, 'the second identical claim is a no-op (exactly-once)');
  const rows = withDb(server.dbPath, db => db.prepare("select * from webhook_deliveries where dedup_key = 'wh1:task.created:t1'").all());
  assert.equal(rows.length, 1, 'exactly one delivery row');
  assert.equal(rows[0].status, 'delivered');
  const totalCalls = callsOf(first).length + callsOf(second).length;
  assert.equal(totalCalls, 1, 'the endpoint was contacted exactly once');
});

test('delivery is HMAC-signed with the hook secret over the raw body', async () => {
  insertHook({ id: 'wh-sig' });
  const r = await trigger({ now: NOW, fetch: { statusCode: 200 }, lookup: LOOKUP, enqueue: [{ hookId: 'wh-sig', event: 'task.created', subjectId: 't1' }] });
  const call = callsOf(r)[0];
  assert.ok(call, 'one recorded call');
  assert.equal(call.signature, `sha256=${createHmac('sha256', SECRET).update(call.body).digest('hex')}`);
  assert.ok(call.body.includes('Tracer task'), 'the envelope carries the task title from the doc');
});

test('two concurrent passes cannot both send the same delivery (guarded attempt claim)', async () => {
  insertHook({ id: 'wh-race' });
  insertDelivery({ id: 'd-race', hook: 'wh-race' });
  const [a, b] = await Promise.all([
    trigger({ now: NOW, fetch: { statusCode: 200 }, lookup: LOOKUP }),
    trigger({ now: NOW, fetch: { statusCode: 200 }, lookup: LOOKUP }),
  ]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  const totalCalls = callsOf(a).length + callsOf(b).length;
  assert.equal(totalCalls, 1, 'only one pass won the attempt claim');
  const row = deliveryRow('d-race');
  assert.equal(row.status, 'delivered');
});

test('five strikes → dead: attempt 5, no next attempt (D-05/D-06)', async () => {
  insertHook({ id: 'wh-dead' });
  insertDelivery({ id: 'd-dead', hook: 'wh-dead' });
  bumpAttempt('d-dead', 4); // four prior failures already burned
  const r = await trigger({ now: NOW, fetch: { statusCode: 500 }, lookup: LOOKUP });
  assert.equal(r.status, 200);
  assert.equal(r.data.dead, 1);
  const row = deliveryRow('d-dead');
  assert.equal(row.status, 'dead');
  assert.equal(row.attempt, 5);
  assert.equal(row.next_attempt_at, null, 'a dead delivery is never rescheduled');
});

test('200 on attempt 2 → delivered, attempt = 2, delivered_at set', async () => {
  insertHook({ id: 'wh-ok2' });
  insertDelivery({ id: 'd-ok2', hook: 'wh-ok2' });
  bumpAttempt('d-ok2', 1); // one prior failure
  const r = await trigger({ now: NOW, fetch: { statusCode: 200 }, lookup: LOOKUP });
  assert.equal(r.status, 200);
  const row = deliveryRow('d-ok2');
  assert.equal(row.status, 'delivered');
  assert.equal(row.attempt, 2);
  assert.equal(row.delivered_at, NOW);
  assert.equal(row.last_status_code, 200);
});

test('429 with Retry-After: 7 → next_attempt_at = now + 7000 (consumes no backoff step)', async () => {
  insertHook({ id: 'wh-ra' });
  insertDelivery({ id: 'd-ra', hook: 'wh-ra' });
  const r = await trigger({ now: NOW, fetch: { statusCode: 429, retryAfter: '7' }, lookup: LOOKUP });
  assert.equal(r.status, 200);
  const row = deliveryRow('d-ra');
  assert.equal(row.status, 'failed');
  assert.equal(row.attempt, 1);
  assert.equal(row.next_attempt_at, NOW + 7_000);
  assert.equal(row.last_status_code, 429);
});

test('a fetch that throws resolves without throwing — delivery failed, pass answers 200', async () => {
  insertHook({ id: 'wh-throw' });
  insertDelivery({ id: 'd-throw', hook: 'wh-throw' });
  const r = await trigger({ now: NOW, fetch: { throw: 'injected boom' }, lookup: LOOKUP });
  assert.equal(r.status, 200, 'the pass never surfaces a delivery error as a route failure');
  const row = deliveryRow('d-throw');
  assert.equal(row.status, 'failed');
  assert.equal(row.attempt, 1);
  assert.ok(row.last_error.includes('injected boom'));
  assert.ok(row.next_attempt_at > NOW, 'a failed attempt is rescheduled per D-05');
});

test('SSRF guard refuses a private resolved IP BEFORE any HTTP call (per-attempt re-check)', async () => {
  insertHook({ id: 'wh-ssrf' });
  insertDelivery({ id: 'd-ssrf', hook: 'wh-ssrf' });
  const r = await trigger({ now: NOW, fetch: { statusCode: 200 }, lookup: { 'hook.test': ['10.1.2.3'] } });
  assert.equal(r.status, 200);
  assert.equal(callsOf(r).length, 0, 'no HTTP call leaves the server');
  const row = deliveryRow('d-ssrf');
  assert.equal(row.status, 'failed');
  assert.equal(row.attempt, 1, 'the refusal consumed the attempt (re-checked EVERY attempt)');
  assert.ok(row.next_attempt_at > NOW, 'rescheduled per D-05');
});

test('retention (D-07): a row older than 7 days is purged; a 6.9-day row survives', async () => {
  insertDelivery({ id: 'd-old', hook: 'wh-dead', dedup: 'wh-dead:task.created:t-old', createdAt: NOW - 604_800_000 - 1 });
  insertDelivery({ id: 'd-recent', hook: 'wh-dead', dedup: 'wh-dead:task.created:t-recent', createdAt: NOW - Math.floor(6.9 * 86_400_000) });
  const r = await trigger({ now: NOW, fetch: { statusCode: 200 }, lookup: LOOKUP });
  assert.equal(r.status, 200);
  assert.ok(r.data.purged >= 1, 'the purge reports a count');
  assert.equal(deliveryRow('d-old'), undefined, 'the >7-day row is gone');
  assert.ok(deliveryRow('d-recent'), 'the 6.9-day row survives the boundary');
});
