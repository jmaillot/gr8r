/* Webhook hook CRUD + send-test routes suite (Phase 67, WHK-01/D-06/D-10/D-11).
   Real server, real SQLite — the /test endpoint's fetch + DNS lookup are
   injected through the WEBHOOK_TEST_TOKEN guard (the /api/internal/webhook-pass
   pattern) so SSRF refusal is asserted with ZERO network. */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startServer, withDb, signup, client, inviteToken } from './helpers/server.mjs';

const TOKEN = 'webhook-test-token';
const SECRET = 'whsec-route-secret';
const NOW = Date.parse('2026-11-15T12:00:00Z');

let server;
let ws;
let owner;
let member;

const hooksUrl = `/api/workspaces/${'wh-routes'}/projects/p1/webhooks`;
const dbRow = id => withDb(server.dbPath, db => db.prepare('select * from webhook_hooks where id = ?').get(id));
const insertHook = (h = {}) => {
  const hook = { id: h.id || `wh-${Math.random().toString(36).slice(2, 8)}`, url: h.url || 'https://hook.test/flows/abc', format: h.format || 'teams-adaptive', events: h.events || '["task.created"]', status: h.status || 'active' };
  withDb(server.dbPath, db =>
    db.prepare('insert into webhook_hooks (id, workspace_id, project_id, url, secret, format, events, status, created_by, created_at) values (?,?,?,?,?,?,?,?,?,?)')
      .run(hook.id, ws.id, 'p1', hook.url, SECRET, hook.format, hook.events, hook.status, 'u-owner', NOW));
  return hook;
};

before(async () => {
  server = await startServer({ env: { WEBHOOK_TEST_TOKEN: TOKEN } });
  const email = 'wh-routes-owner@test.local';
  await signup(server.base, { name: 'WH Routes Owner', email, password: 'correct-horse-9' });
  owner = client(server.base, email);
  const login = await owner.post('/api/auth/login', { email, password: 'correct-horse-9' });
  assert.equal(login.status, 200, 'owner login');
  const created = await owner.post('/api/workspaces', { name: 'WH Routes Ws', slug: 'wh-routes' });
  assert.equal(created.status, 201, 'workspace create');
  ws = withDb(server.dbPath, db => db.prepare('select * from workspaces where slug = ?').get('wh-routes'));
  /* Baseline doc: project p1 — the route resolves the project from the doc
     exactly like the export route does. */
  const read = await owner.get(`/api/workspaces/${ws.slug}`);
  assert.equal(read.status, 200);
  const doc = read.data.doc;
  doc.data.projects = [{ id: 'p1', name: 'P1' }];
  doc.data.tasks = [{ id: 't1', key: 'P1-1', title: 'Routes task', status: 'todo', project: 'p1', assignees: [] }];
  const saved = await owner.put(`/api/workspaces/${ws.slug}`, { revision: read.data.revision, doc });
  assert.equal(saved.status, 200, `baseline PUT ${saved.status}`);
  /* A plain member — the non-manager 403 case (T-67-07). */
  const [inv] = (await owner.post(`/api/workspaces/${ws.slug}/invites`, { emails: ['wh-routes-member@test.local'], role: 'member' })).data.invites;
  const joined = await client(server.base, 'm').post(`/api/invites/${inviteToken(inv.url)}/accept`, {
    name: 'WH Routes Member',
    email: 'wh-routes-member@test.local',
    password: 'password-1234',
  });
  assert.equal(joined.status, 201, `member joined ${joined.status}`);
  member = client(server.base, 'm');
  const m2 = await member.post('/api/auth/login', { email: 'wh-routes-member@test.local', password: 'password-1234' });
  assert.equal(m2.status, 200, 'member client login');
});

after(async () => {
  await server?.stop();
});

/* --------------------------- Task 1: CRUD gate --------------------------- */

test('POST as owner → 201 with hook + show-once secret (D-10); the hook carries NO secret', async () => {
  const r = await owner.post(hooksUrl, { url: 'https://out.logic.azure.com/w', events: ['task.created', 'comment.added'] });
  assert.equal(r.status, 201, `POST ${r.status} ${JSON.stringify(r.data)}`);
  assert.match(r.data.secret, /^[0-9a-f]{64}$/, 'the secret is 32 random bytes hex');
  assert.equal(r.data.hook.format, 'teams-adaptive', 'D-12 default format');
  assert.deepEqual(r.data.hook.events, ['task.created', 'comment.added']);
  assert.equal(r.data.hook.status, 'active');
  assert.equal(r.data.hook.health, 'active');
  assert.equal(r.data.hook.url, 'https://out.logic.azure.com/w');
  assert.equal(r.data.hook.secret, undefined, 'the secret field never rides the hook object');
  const row = dbRow(r.data.hook.id);
  assert.equal(row.secret, r.data.secret, 'the server stores the secret (needed to sign)');
});

test('POST as plain member → 403; GET list as member → 403 (server gate is the control)', async () => {
  const created = await member.post(hooksUrl, { url: 'https://out.logic.azure.com/w', events: ['task.created'] });
  assert.equal(created.status, 403, `member POST ${created.status}`);
  const listed = await member.get(hooksUrl);
  assert.equal(listed.status, 403, `member GET ${listed.status}`);
});

test('POST validation: http URL, unknown format, bogus event, empty/missing URL → 400', async () => {
  const cases = [
    { url: 'http://x.logic.azure.com/w', events: ['task.created'] },
    { url: '', events: ['task.created'] },
    { events: ['task.created'] },
    { url: 'https://out.logic.azure.com/w', format: 'carrier-pigeon', events: ['task.created'] },
    { url: 'https://out.logic.azure.com/w', events: ['task.created', 'bogus.event'] },
  ];
  for (const body of cases) {
    const r = await owner.post(hooksUrl, body);
    assert.equal(r.status, 400, `${JSON.stringify(body)} → ${r.status}`);
    assert.equal(r.data.code, 'webhookError');
    assert.ok(r.data.error, 'a specific English message rides beside the code');
  }
});

test('WHK-01 idempotency edge: POST twice with identical bodies → two DISTINCT hooks', async () => {
  const body = { url: 'https://dup.logic.azure.com/w', events: ['task.created'] };
  const a = await owner.post(hooksUrl, body);
  const b = await owner.post(hooksUrl, body);
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  assert.notEqual(a.data.hook.id, b.data.hook.id, 'each call creates a new hook — no merge');
  assert.notEqual(a.data.secret, b.data.secret, 'each hook gets its own secret');
  const listed = await owner.get(hooksUrl);
  const ids = listed.data.hooks.map(h => h.id);
  assert.ok(ids.includes(a.data.hook.id) && ids.includes(b.data.hook.id));
});

test('GET list: no secret field anywhere; health computed from deliveries (D-06)', async () => {
  insertHook({ id: 'wh-health' });
  /* a dead delivery inside the 7-day window → 'failing' */
  withDb(server.dbPath, db =>
    db.prepare('insert into webhook_deliveries (id, workspace_id, hook_id, event, dedup_key, attempt, status, next_attempt_at, created_at) values (?,?,?,?,?,?,?,?,?)')
      .run('d-health', ws.id, 'wh-health', 'task.created', 'wh-health:task.created:t-dead', 5, 'dead', null, NOW));
  const r = await owner.get(hooksUrl);
  assert.equal(r.status, 200);
  for (const h of r.data.hooks) {
    assert.equal(h.secret, undefined, 'T-67-08: no secret in any list entry');
    assert.equal(typeof h.url, 'string');
    assert.ok(['active', 'failing', 'disabled'].includes(h.health), `health ${h.health}`);
  }
  const health = r.data.hooks.find(h => h.id === 'wh-health').health;
  assert.equal(health, 'failing', 'a dead delivery in the window → failing (D-06)');
});

test('PATCH updates filter/format/status (last-write-wins); DELETE removes the hook but keeps delivery rows', async () => {
  const hook = insertHook({ id: 'wh-edit' });
  const base = `/api/workspaces/${ws.slug}/projects/p1/webhooks/${hook.id}`;
  const p1 = await owner.patch(base, { format: 'teams-messagecard', events: ['task.completed'] });
  assert.equal(p1.status, 200, `patch1 ${p1.status} ${JSON.stringify(p1.data)}`);
  assert.deepEqual(p1.data.hook.events, ['task.completed']);
  assert.equal(p1.data.hook.format, 'teams-messagecard');
  const p2 = await owner.patch(base, { status: 'disabled' });
  assert.equal(p2.status, 200);
  assert.equal(p2.data.hook.status, 'disabled');
  assert.equal(p2.data.hook.health, 'disabled', 'a disabled hook reports disabled health');
  assert.deepEqual(p2.data.hook.events, ['task.completed'], 'the last PATCH keeps earlier writes (last-write-wins)');
  /* T-67-09 mass-assignment guard: identity columns never move. */
  const evil = await owner.patch(base, { workspace_id: 'ws-evil', project_id: 'p-evil', created_by: 'u-evil' });
  assert.equal(evil.status, 200);
  const row = dbRow(hook.id);
  assert.equal(row.workspace_id, ws.id);
  assert.equal(row.project_id, 'p1');
  /* a delivery row predates the delete — the audit trail must survive */
  withDb(server.dbPath, db =>
    db.prepare('insert into webhook_deliveries (id, workspace_id, hook_id, event, dedup_key, attempt, status, next_attempt_at, created_at) values (?,?,?,?,?,?,?,?,?)')
      .run('d-edit', ws.id, 'wh-edit', 'task.created', 'wh-edit:task.created:t1', 1, 'delivered', null, NOW));
  const del = await owner.del(base);
  assert.equal(del.status, 200, `delete ${del.status}`);
  assert.equal(dbRow(hook.id), undefined, 'the hook row is gone');
  const drow = withDb(server.dbPath, db => db.prepare('select * from webhook_deliveries where id = ?').get('d-edit'));
  assert.ok(drow, 'the historical delivery row survives the delete (audit trail)');
  const listed = await owner.get(hooksUrl);
  assert.ok(!listed.data.hooks.some(h => h.id === hook.id));
});

test('PATCH validation: bad format/event/status → 400; 404 on an unknown hook id', async () => {
  const hook = insertHook({ id: 'wh-patch-valid' });
  const base = `/api/workspaces/${ws.slug}/projects/p1/webhooks/${hook.id}`;
  for (const body of [
    { format: 'carrier-pigeon' },
    { events: ['nope.event'] },
    { status: 'paused' },
  ]) {
    const r = await owner.patch(base, body);
    assert.equal(r.status, 400, `${JSON.stringify(body)} → ${r.status}`);
  }
  const missing = await owner.patch(`/api/workspaces/${ws.slug}/projects/p1/webhooks/wh-nope`, { status: 'disabled' });
  assert.equal(missing.status, 404);
});

test('T-67-08: the secret and full hook URL never appear in any log line', async () => {
  const out = server.output();
  assert.ok(!out.includes(SECRET), 'the signing secret never reaches the logs');
  assert.ok(!out.includes('hook.test/flows/abc'), 'the full hook URL never reaches the logs (host-only discipline)');
});

/* ------------------------ Task 2: send-test (D-11) ------------------------ */

const trigger = (payload = {}) =>
  fetch(`${server.base}/api/internal/webhook-pass`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-webhook-token': TOKEN },
    body: JSON.stringify(payload),
  }).then(async r => ({ status: r.status, data: await r.json().catch(() => null) }));

/* /test calls with the test-token header so the fetch/lookup injectables
   are honored — ZERO network in the suite. */
const postTest = (cl, path, body) =>
  fetch(server.base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cl.cookie(), 'x-webhook-token': TOKEN },
    body: JSON.stringify(body),
  }).then(async r => ({ status: r.status, data: await r.json().catch(() => null) }));

test('POST /test rides the real pipeline: 200 result, HMAC-signed fetch with the hook secret', async () => {
  const hook = insertHook({ id: 'wh-test', url: 'https://sendtest.logic.azure.com/w' });
  const r = await postTest(owner, `/api/workspaces/${ws.slug}/projects/p1/webhooks/${hook.id}/test`, {
    event: 'task.created',
    fetch: { statusCode: 200 },
    lookup: { 'sendtest.logic.azure.com': ['93.184.216.34'] },
    now: NOW,
  });
  assert.equal(r.status, 200, `test ${r.status} ${JSON.stringify(r.data)}`);
  assert.equal(r.data.ok, true, 'the immediate result is visible');
  assert.equal(r.data.statusCode, 200, 'the result reflects the real endpoint status');
});

test('POST /test: a denied resolved IP is refused BEFORE any HTTP call (ssrfOk invoked)', async () => {
  const hook = insertHook({ id: 'wh-test-ssrf', url: 'https://sendtest-ssrf.logic.azure.com/w' });
  const r = await postTest(owner, `/api/workspaces/${ws.slug}/projects/p1/webhooks/${hook.id}/test`, {
    event: 'task.created',
    fetch: { statusCode: 200 },
    lookup: { 'sendtest-ssrf.logic.azure.com': ['10.1.2.3'] },
    now: NOW,
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, false, 'the SSRF refusal surfaces as ok:false');
  assert.equal(r.data.statusCode, null, 'no HTTP status — the call never left');
  const row = withDb(server.dbPath, db => db.prepare("select * from webhook_deliveries where hook_id = 'wh-test-ssrf'").get());
  assert.ok(row.last_error.includes('ssrf'), 'the refusal is recorded on the delivery row');
});

test('two rapid test calls → TWO delivery rows (nonce dedup exemption); a REAL event double-claim stays single-row', async () => {
  const hook = insertHook({ id: 'wh-test-nonce', url: 'https://sendtest2.logic.azure.com/w' });
  const body = { event: 'task.created', fetch: { statusCode: 200 }, lookup: { 'sendtest2.logic.azure.com': ['93.184.216.34'] }, now: NOW };
  const a = await postTest(owner, `/api/workspaces/${ws.slug}/projects/p1/webhooks/${hook.id}/test`, body);
  const b = await postTest(owner, `/api/workspaces/${ws.slug}/projects/p1/webhooks/${hook.id}/test`, body);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  const rows = withDb(server.dbPath, db => db.prepare("select * from webhook_deliveries where hook_id = 'wh-test-nonce'").all());
  assert.equal(rows.length, 2, 'each button press sends — no dedup merge on test deliveries');
  /* the real-event control: the same subject claimed twice is ONE row */
  const t1 = await trigger({ now: NOW, fetch: { statusCode: 200 }, lookup: { 'sendtest2.logic.azure.com': ['93.184.216.34'] }, enqueue: [{ hookId: 'wh-test-nonce', event: 'task.created', subjectId: 't1', workspaceId: ws.id }] });
  const t2 = await trigger({ now: NOW, fetch: { statusCode: 200 }, lookup: { 'sendtest2.logic.azure.com': ['93.184.216.34'] }, enqueue: [{ hookId: 'wh-test-nonce', event: 'task.created', subjectId: 't1', workspaceId: ws.id }] });
  assert.equal(t1.data.claimed, 1);
  assert.equal(t2.data.claimed, 0, 'the real exactly-once dedup still holds');
  const real = withDb(server.dbPath, db => db.prepare("select count(*) as n from webhook_deliveries where hook_id = 'wh-test-nonce' and dedup_key = 'wh-test-nonce:task.created:t1'").get());
  assert.equal(real.n, 1);
});

test('POST /test with an unknown event → 400; as member → 403', async () => {
  const hook = insertHook({ id: 'wh-test-gates', url: 'https://sendtest3.logic.azure.com/w' });
  const base = `/api/workspaces/${ws.slug}/projects/p1/webhooks/${hook.id}/test`;
  const bad = await owner.post(base, { event: 'carrier.pigeon' });
  assert.equal(bad.status, 400);
  assert.equal(bad.data.code, 'webhookError');
  const denied = await member.post(base, { event: 'task.created' });
  assert.equal(denied.status, 403);
});
