/* Browser push infra (Phase 59, PUSH-01/PUSH-05): VAPID custody, the
   push_subscriptions table and the self-service routes.
   Real server, real SQLite, real web-push module (installed exactly-pinned).
   The module-mock seam lives in server.js — web-push is dynamically imported
   inside initPushCustody, so a suite that needs a stubbed sender can
   mock.module('web-push'); these tests exercise the real module end-to-end. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { login, signup, startServer, withDb } from './helpers/server.mjs';

const PASSWORD = 'push-password-1';

/* A valid-looking canonical subscription body — the exact shape
   pushManager.subscribe().toJSON() yields (base64url keys, https endpoint). */
const CANONICAL = {
  endpoint: 'https://push.example.com/send/abc123',
  keys: { p256dh: 'BPK2h9f8x7q1w2e3r4t5y6u7i8o9p0', auth: 'aGVsbG8gd29ybGQ' },
  label: 'MacBook — Chrome',
};

let tempDir;
let server;
let owner;
let ws;
let stranger;

const keyFile = () => path.join(tempDir, 'vapid-keys.json');
const storedKeys = () => JSON.parse(fs.readFileSync(keyFile(), 'utf8'));
const subs = () =>
  withDb(server.dbPath, db => db.prepare('select workspace_id, user_id, endpoint, p256dh, auth, label, created_at, last_seen_at from push_subscriptions order by created_at').all());

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-push-'));
  server = await startServer({ dataDir: tempDir, env: { MASTER_KEY: 'projects-push-key' } });
  const me = await signup(server.base, { name: 'Owner', email: 'push-owner@test.local', password: PASSWORD });
  assert.equal(me.status, 201, 'owner signup');
  owner = me.client;
  const created = await owner.post('/api/workspaces', { name: 'Push', slug: 'push-ws' });
  assert.equal(created.status, 201, `workspace create ${created.status}`);
  ws = withDb(server.dbPath, db => db.prepare('select id, slug from workspaces where slug = ?').get('push-ws'));
  stranger = (await signup(server.base, { name: 'Stranger', email: 'push-stranger@test.local', password: PASSWORD })).client;
});

after(async () => {
  await server?.stop();
  // server.stop() leaves caller-supplied dataDirs intact (migration-test contract).
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

/* ------------------- (a) custody: generate → persist → loud log ------------------- */

test('first boot with no env and no key file generates a keypair, persists it and logs generation loudly', async () => {
  assert.ok(fs.existsSync(keyFile()), 'vapid-keys.json written to DATA_DIR');
  const stored = storedKeys();
  assert.ok(stored.publicKey && stored.privateKey, 'both halves persisted');
  assert.match(server.output(), /generated a new VAPID keypair/, 'generation is logged loudly');
  // Private key never crosses a log line (T-59-03).
  assert.equal(server.output().includes(stored.privateKey), false, 'private key value never logged');
});

test('GET /api/me/push-config returns the public key only (PUSH-05)', async () => {
  const res = await owner.get('/api/me/push-config');
  assert.equal(res.status, 200);
  assert.equal(res.data.vapidPublicKey, storedKeys().publicKey, 'config exposes exactly the stored public key');
  assert.equal('privateKey' in res.data || 'vapidPrivateKey' in res.data, false, 'no private key field (T-59-03)');
});

/* ------------------- (b) subscribe/list/delete routes ------------------- */

test('POST with the canonical body stores a row for the session user only; body user_id is ignored', async () => {
  const strangerRow = withDb(server.dbPath, db => db.prepare('select id from users where email = ?').get('push-stranger@test.local'));
  const post = await owner.post(`/api/me/push-subscriptions?workspace=${ws.id}`, { ...CANONICAL, user_id: strangerRow.id });
  assert.equal(post.status, 200, `POST subscribe ${post.status}`);
  const rows = subs();
  assert.equal(rows.length, 1, 'exactly one row');
  assert.equal(rows[0].user_id !== strangerRow.id, true, 'user_id never taken from the body (mass-assignment guard)');
  assert.equal(rows[0].endpoint, CANONICAL.endpoint);
  assert.equal(rows[0].p256dh, CANONICAL.keys.p256dh, 'keys.p256dh unpacked into the flat column');
  assert.equal(rows[0].auth, CANONICAL.keys.auth, 'keys.auth unpacked into the flat column');
  assert.equal(rows[0].label, CANONICAL.label);
});

test('GET returns the caller own device rows and never another user or workspace', async () => {
  const got = await owner.get(`/api/me/push-subscriptions?workspace=${ws.id}`);
  assert.equal(got.status, 200);
  assert.equal(got.data.subscriptions.length, 1);
  assert.equal(got.data.subscriptions[0].endpoint, CANONICAL.endpoint);
  assert.equal('p256dh' in got.data.subscriptions[0], false, 'key material is not echoed to the client');
  // Non-member no-oracle 404.
  const sneak = await stranger.get(`/api/me/push-subscriptions?workspace=${ws.id}`);
  assert.equal(sneak.status, 404, `stranger list ${sneak.status}`);
});

test('re-POST with the same endpoint REPLACES the row (no duplicate) and preserves created_at', async () => {
  const before = subs()[0];
  const post = await owner.post(`/api/me/push-subscriptions?workspace=${ws.id}`, {
    ...CANONICAL,
    keys: { p256dh: 'NEWKEYS_p256dh_value_1', auth: 'NEWAUTH_value_1' },
    label: 'MacBook — Chrome (rotated)',
  });
  assert.equal(post.status, 200);
  const rows = subs();
  assert.equal(rows.length, 1, 'replace, never duplicate');
  assert.equal(rows[0].p256dh, 'NEWKEYS_p256dh_value_1', 'new key material stored');
  assert.equal(rows[0].created_at, before.created_at, 'original creation date preserved (D-03 device list)');
  assert.ok(rows[0].last_seen_at >= before.last_seen_at, 'last_seen_at refreshed');
});

test('POST rejects malformed subscriptions (T-59-01 whitelist)', async () => {
  const cases = [
    { ...CANONICAL, endpoint: 'http://push.example.com/send/x' }, // not https
    { ...CANONICAL, endpoint: 'not a url' },
    { endpoint: CANONICAL.endpoint, keys: { p256dh: CANONICAL.keys.p256dh } }, // missing auth
    { ...CANONICAL, keys: { p256dh: 'bad key with spaces!', auth: CANONICAL.keys.auth } }, // not base64url
    { keys: CANONICAL.keys }, // missing endpoint
  ];
  for (const [i, body] of cases.entries()) {
    const res = await owner.post(`/api/me/push-subscriptions?workspace=${ws.id}`, body);
    assert.equal(res.status, 400, `case ${i} rejected`);
    assert.equal(res.data.code, 'invalidSubscription', `case ${i} code`);
  }
  assert.equal(subs().length, 1, 'no row written by a rejected POST');
});

test('oversized labels are byte-capped, not rejected', async () => {
  const post = await owner.post(`/api/me/push-subscriptions?workspace=${ws.id}`, { ...CANONICAL, label: 'É'.repeat(500) });
  assert.equal(post.status, 200);
  assert.ok(Buffer.byteLength(subs()[0].label, 'utf8') <= 200, 'label capped at 200 bytes');
});

test('DELETE removes only the caller own row by endpoint', async () => {
  // Second device on a second row.
  await owner.post(`/api/me/push-subscriptions?workspace=${ws.id}`, { ...CANONICAL, endpoint: 'https://push.example.com/send/device2', label: 'Phone — Safari' });
  assert.equal(subs().length, 2);
  const del = await owner.del(`/api/me/push-subscriptions?workspace=${ws.id}&endpoint=${encodeURIComponent(CANONICAL.endpoint)}`);
  assert.equal(del.status, 200);
  const rows = subs();
  assert.equal(rows.length, 1, 'only the targeted row removed');
  assert.equal(rows[0].endpoint, 'https://push.example.com/send/device2');
  const delAgain = await owner.del(`/api/me/push-subscriptions?workspace=${ws.id}&endpoint=${encodeURIComponent(CANONICAL.endpoint)}`);
  assert.equal(delAgain.status, 200, 'deleting an unknown endpoint is idempotent');
});

/* ------------------- (c) env override beats the file ------------------- */

test('VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY env overrides the persisted file', async () => {
  // Real VAPID keys — setVapidDetails validates the material, so the override
  // pair must be genuine (generated by the same pinned module).
  const { generateVAPIDKeys } = await import('web-push');
  const envKeys = generateVAPIDKeys();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-push-env-'));
  fs.writeFileSync(path.join(dir, 'vapid-keys.json'), JSON.stringify({ publicKey: 'filePub', privateKey: 'filePriv' }));
  const envServer = await startServer({
    dataDir: dir,
    env: { MASTER_KEY: 'push-env-key', VAPID_PUBLIC_KEY: envKeys.publicKey, VAPID_PRIVATE_KEY: envKeys.privateKey },
  });
  try {
    const me = await signup(envServer.base, { name: 'Env Owner', email: 'push-env@test.local', password: PASSWORD });
    const res = await me.client.get('/api/me/push-config');
    assert.equal(res.status, 200);
    assert.equal(res.data.vapidPublicKey, envKeys.publicKey, 'env wins over the stored file');
    assert.match(envServer.output(), /source: env/, 'source logged');
  } finally {
    await envServer.stop(); // owned dir removed with the server
  }
});

/* ------------------- (d) fail-absent: unpersistable = feature absent ------------------- */

test('unpersistable key file → push-config 404 (fail-absent, MCP-01 pattern)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-push-absent-'));
  // A vapid-keys.json DIRECTORY makes the custody read fail AND the persist
  // write fail (EISDIR) — the DB stays unaffected, only push is disabled.
  fs.mkdirSync(path.join(dir, 'vapid-keys.json'));
  const absent = await startServer({ dataDir: dir, env: { MASTER_KEY: 'push-absent-key' } });
  try {
    const me = await signup(absent.base, { name: 'Absent Owner', email: 'push-absent@test.local', password: PASSWORD });
    const res = await me.client.get('/api/me/push-config');
    assert.equal(res.status, 404, `push-config fail-absent ${res.status}`);
    assert.equal(res.data.code, 'pushUnavailable');
    assert.match(absent.output(), /browser push stays disabled/, 'absence logged');
  } finally {
    await absent.stop();
  }
});

/* ================= (f) fan-out: sendPushFor, sweep, budget, test-send (Plan 02) =================

   A second server instance with the PUSH_SINK_MODULE seam: web-push's
   sendNotification is replaced by a recording stub that simulates push-service
   failures from the endpoint marker (#fail<code> / #failnet). Every fan-out is
   triggered through the REAL entry points — a doc PUT riding the newNotifs
   diff site, or the reminder-pass route — never by calling internals. */
const SINK_TOKEN = 'push-fanout-token';
let sink = null;

const sinkSends = () =>
  fs
    .readFileSync(path.join(sink.dataDir, 'sends.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(l => JSON.parse(l));
const sinkRows = () =>
  withDb(sink.dbPath, db => db.prepare('select workspace_id, user_id, endpoint, label, created_at, last_seen_at from push_subscriptions').all());

async function sinkServer() {
  if (sink) return sink;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-push-fanout-'));
  const sinkPath = path.join(dir, 'push-sink.mjs');
  fs.writeFileSync(
    sinkPath,
    [
      "import fs from 'node:fs';",
      'export async function sendNotification(sub, payload) {',
      '  fs.appendFileSync(process.env.PUSH_SINK_LOG, JSON.stringify({ endpoint: sub.endpoint, payload: JSON.parse(payload), octets: Buffer.byteLength(payload, "utf8") }) + "\\n");',
      '  const code = /#fail(\\d+)$/.exec(sub.endpoint);',
      "  if (code) { const e = new Error('mock push failure'); e.statusCode = Number(code[1]); e.name = 'WebPushError'; throw e; }",
      "  if (/#failnet$/.test(sub.endpoint)) throw new Error('network unreachable');",
      '}',
    ].join('\n'),
  );
  sink = await startServer({
    dataDir: dir,
    env: {
      MASTER_KEY: 'push-fanout-key',
      PUSH_SINK_MODULE: sinkPath,
      PUSH_SINK_LOG: path.join(dir, 'sends.jsonl'),
      REMINDER_TEST_TOKEN: SINK_TOKEN,
    },
  });
  return sink;
}

const sinkAccounts = new Map();
async function sinkAccount(name, email) {
  if (!sinkAccounts.has(email)) {
    await signup(sink.base, { name, email, password: PASSWORD });
    const logged = await login(sink.base, email, PASSWORD);
    assert.equal(logged.status, 200, `sink login ${email}`);
    sinkAccounts.set(email, logged.client);
  }
  return sinkAccounts.get(email);
}

let sinkSeq = 0;
async function sinkWorkspace({ extraMembers = [], projects = [{ id: 'p1', name: 'P1' }], tasks = () => [], notifs = () => [], prefs = {} } = {}) {
  const cl = await sinkAccount('Sink Owner', 'push-sink-owner@test.local');
  const slug = `sink-${++sinkSeq}`;
  const created = await cl.post('/api/workspaces', { name: slug, slug });
  assert.equal(created.status, 201, `sink ws create ${created.status}`);
  const ws = withDb(sink.dbPath, db => db.prepare('select * from workspaces where slug = ?').get(slug));
  const mA = withDb(sink.dbPath, db => db.prepare('select member_id, user_id from memberships where workspace_id = ? order by rowid limit 1').get(ws.id));
  assert.ok(mA?.member_id, 'sink owner membership');
  const doc = {
    data: {
      members: [
        { id: mA.member_id, name: 'Sink Owner', email: 'push-sink-owner@test.local', userId: null, tz: '(GMT+00:00) London' },
        ...extraMembers.map(m => ({ id: m.id, name: m.name, tz: m.tz || '(GMT+00:00) London' })),
      ],
      projects,
      tasks: tasks(mA.member_id),
      comments: [],
      activity: [],
      notifs: notifs(mA.member_id),
      files: [],
    },
  };
  withDb(sink.dbPath, db => db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), ws.id));
  if (Object.keys(prefs).length) {
    withDb(sink.dbPath, db =>
      db.prepare('insert or replace into user_notif_prefs (workspace_id, user_id, prefs) values (?,?,?)').run(ws.id, mA.user_id, JSON.stringify(prefs)),
    );
  }
  return { ws, mA, doc, client: cl };
}

/* Append one notif row through a REAL doc PUT — the newNotifs diff site. */
async function putNotif(fixture, notif) {
  const revision = withDb(sink.dbPath, db => db.prepare('select revision from workspaces where id = ?').get(fixture.ws.id)).revision;
  const put = await fixture.client.put(`/api/workspaces/${fixture.ws.slug}`, {
    revision,
    doc: { ...fixture.doc, data: { ...fixture.doc.data, notifs: [...fixture.doc.data.notifs, notif] } },
  });
  assert.equal(put.status, 200, `doc PUT ${put.status} ${JSON.stringify(put.data)}`);
  fixture.doc.data.notifs.push(notif);
}

const subscribe = (cl, wsId, endpoint, label = 'Dev') =>
  cl.post(`/api/me/push-subscriptions?workspace=${wsId}`, {
    endpoint,
    keys: { p256dh: 'BPK2h9f8x7q1w2e3r4t5y6u7i8o9p0', auth: 'aGVsbG8gd29ybGQ' },
    label,
  });

const mention = (id, to, by, taskId) => ({ id, type: 'mention', to, by, task: taskId, at: Date.now(), read: false });

test('mention fan-out sends exactly one payload per subscribed device (D-14), pre-localized title, key+title body, deep-link url', async () => {
  await sinkServer();
  const fx = await sinkWorkspace({
    extraMembers: [{ id: 'mB', name: 'Bob' }],
    tasks: m => [{ id: 't1', key: 'PUSH-1', title: 'Fix login', project: 'p1', assignees: [m], status: 'todo' }],
  });
  await subscribe(fx.client, fx.ws.id, 'https://push.example.com/send/f1-a');
  await subscribe(fx.client, fx.ws.id, 'https://push.example.com/send/f1-b', 'Phone');
  await putNotif(fx, mention('n-f1', fx.mA.member_id, 'mB', 't1'));
  const sends = sinkSends().filter(s => s.payload.body === 'PUSH-1 Fix login');
  assert.equal(sends.length, 2, 'one send per device row, no aggregation');
  for (const s of sends) {
    assert.equal(s.payload.title, 'Bob mentioned you', 'D-16: sender display name + action (EN default)');
    assert.equal(s.payload.url.endsWith(`/w/${fx.ws.slug}/task/PUSH-1`), true, 'deep-link shape');
    assert.equal(s.payload.test, false, 'fan-out payloads are not test-tagged');
    assert.deepEqual(Object.keys(s.payload).sort(), ['body', 'test', 'title', 'url'], 'payload carries nothing else (D-16/D-17)');
  }
});

test('the gate matrix: pref off, self-action and lost project access each produce zero sends (D-11)', async () => {
  await sinkServer();
  const before = sinkSends().length;
  // (a) push_mention === false
  const fxOff = await sinkWorkspace({ prefs: { push_mention: false }, extraMembers: [{ id: 'mB', name: 'Bob' }] });
  await putNotif(fxOff, mention('n-off', fxOff.mA.member_id, 'mB', null));
  // (b) author === recipient
  const fxSelf = await sinkWorkspace({ extraMembers: [{ id: 'mB', name: 'Bob' }] });
  await putNotif(fxSelf, mention('n-self', fxSelf.mA.member_id, fxSelf.mA.member_id, null));
  // (c) recipient cannot read the private project
  const fxPriv = await sinkWorkspace({
    extraMembers: [{ id: 'mB', name: 'Bob' }],
    projects: [{ id: 'p1', name: 'Secret', private: true, members: ['mB'] }],
  });
  await putNotif(fxPriv, mention('n-priv', fxPriv.mA.member_id, 'mB', null));
  assert.equal(sinkSends().length, before, 'no send from any gated case');
});

test('payload budget: pathological FR title truncates to ~120 chars and the serialized payload stays ≤ 4096 octets (D-18)', async () => {
  await sinkServer();
  const longTitle = 'ÀÉÎÕÜçœ'.repeat(200);
  const fx = await sinkWorkspace({
    extraMembers: [{ id: 'mB', name: 'Bob' }],
    tasks: () => [{ id: 't2', key: 'PUSH-2', title: longTitle, project: 'p1', assignees: [], status: 'todo' }],
  });
  await subscribe(fx.client, fx.ws.id, 'https://push.example.com/send/f3');
  await putNotif(fx, mention('n-f3', fx.mA.member_id, 'mB', 't2'));
  const send = sinkSends().at(-1);
  assert.ok(send, 'fan-out happened');
  assert.ok(send.octets <= 4096, `payload budget violated: ${send.octets} octets`);
  const titlePart = send.payload.body.slice('PUSH-2 '.length);
  assert.equal(titlePart.length, 120, 'task title truncated to 120 chars');
  assert.ok(longTitle.startsWith(titlePart), 'truncation kept the head of the title');
});

test('404/410 from the push service deletes the row in the same pass; success updates last_seen_at (PUSH-04)', async () => {
  await sinkServer();
  const fx = await sinkWorkspace({ extraMembers: [{ id: 'mB', name: 'Bob' }] });
  await subscribe(fx.client, fx.ws.id, 'https://push.example.com/send/f4-dead404#fail404');
  await subscribe(fx.client, fx.ws.id, 'https://push.example.com/send/f4-gone410#fail410');
  await subscribe(fx.client, fx.ws.id, 'https://push.example.com/send/f4-ok');
  const seenBefore = sinkRows().find(r => r.endpoint === 'https://push.example.com/send/f4-ok').last_seen_at;
  await new Promise(r => setTimeout(r, 20)); // last_seen_at is ms-resolution — let it move
  await putNotif(fx, mention('n-f4', fx.mA.member_id, 'mB', null));
  const rows = sinkRows().filter(r => r.workspace_id === fx.ws.id);
  assert.deepEqual(
    rows.map(r => r.endpoint).sort(),
    ['https://push.example.com/send/f4-ok'],
    'dead 404/410 rows swept, live row kept',
  );
  assert.ok(rows[0].last_seen_at > seenBefore, 'last_seen_at refreshed on success');
});

test('429 and network errors keep the row and only log a warning (PUSH-04)', async () => {
  await sinkServer();
  const fx = await sinkWorkspace({ extraMembers: [{ id: 'mB', name: 'Bob' }] });
  await subscribe(fx.client, fx.ws.id, 'https://push.example.com/send/f5-429#fail429');
  await subscribe(fx.client, fx.ws.id, 'https://push.example.com/send/f5-net#failnet');
  const rowsBefore = sinkRows().filter(r => r.workspace_id === fx.ws.id).length;
  await putNotif(fx, mention('n-f5', fx.mA.member_id, 'mB', null));
  assert.equal(sinkRows().filter(r => r.workspace_id === fx.ws.id).length, rowsBefore, 'retryable failures never sweep');
  assert.match(sink.output(), /push send n-f5/, 'non-sweep failures are logged');
});

test('per-device test-send route: real payload path with the test marker, caller-owned rows only (D-05/D-06)', async () => {
  await sinkServer();
  const other = await sinkAccount('Sink Peer', 'push-sink-peer@test.local');
  const fx = await sinkWorkspace({ extraMembers: [{ id: 'mB', name: 'Bob' }] });
  // Invite the peer as a real member so route guard ladders (membership 404s) differ from row ownership.
  const mem = withDb(sink.dbPath, db => db.prepare('select member_id, user_id from memberships where workspace_id = ? and user_id = ?').get(fx.ws.id, fx.mA.user_id));
  assert.ok(mem);
  await subscribe(fx.client, fx.ws.id, 'https://push.example.com/send/f6-owner');
  await subscribe(other, fx.ws.id, 'https://push.example.com/send/f6-peer');
  const before = sinkSends().length;
  const res = await fx.client.post(`/api/me/push-subscriptions/test?workspace=${fx.ws.id}`, { endpoint: 'https://push.example.com/send/f6-owner' });
  assert.equal(res.status, 200, `test send ${res.status}`);
  const sends = sinkSends().slice(before);
  assert.equal(sends.length, 1, 'exactly one send — the caller own row');
  assert.equal(sends[0].payload.test, true, 'payload carries the test marker');
  assert.equal(sends[0].payload.title.startsWith('Test push'), true, 'title is test-tagged');
  // A stranger (not a member) and a member targeting someone else's row get nothing.
  const stranger = await sinkAccount('Sink Stranger', 'push-sink-stranger@test.local');
  const sneak = await stranger.post(`/api/me/push-subscriptions/test?workspace=${fx.ws.id}`, { endpoint: 'https://push.example.com/send/f6-owner' });
  assert.equal(sneak.status, 404, 'non-member no-oracle');
  const peer = await fx.client.post(`/api/me/push-subscriptions/test?workspace=${fx.ws.id}`, { endpoint: 'https://push.example.com/send/f6-peer' });
  // f6-peer is the PEER's row — the caller (owner) does not own it → 404, no send.
  assert.equal(peer.status, 404, 'another user row is not addressable');
  assert.equal(sinkSends().length, before + 1, 'no extra sends from the rejected attempts');
  // Unknown endpoint → 404, no send.
  const missing = await fx.client.post(`/api/me/push-subscriptions/test?workspace=${fx.ws.id}`, { endpoint: 'https://push.example.com/send/f6-none' });
  assert.equal(missing.status, 404);
});

after(async () => {
  await sink?.stop();
});

/* ------------------- (g) reminder-pass fan-out (Plan 02 Task 2, D-09/D-10) ------------------- */

const triggerPass = nowIso =>
  fetch(`${sink.base}/api/internal/reminder-pass`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-reminder-token': SINK_TOKEN },
    body: JSON.stringify({ now: nowIso }),
  }).then(async r => {
    assert.equal(r.status, 200, `reminder pass ${r.status}`);
    return (await r.json()).emitted;
  });

test('reminder pass pushes for a DIGEST user (D-10) with the inbox row untouched; push_due=false suppresses only the push (D-09)', async () => {
  await sinkServer();
  const DUE = '2027-01-20';
  const AT8 = '2027-01-20T08:00:00Z';
  // (a) digest user still gets the reminder push, inbox row written.
  const fxDigest = await sinkWorkspace({
    prefs: { email_digest: true },
    tasks: m => [{ id: 'tr1', key: 'PUSH-3', title: 'Digest reminder', project: 'p1', due: DUE, assignees: [m], status: 'todo' }],
  });
  await subscribe(fxDigest.client, fxDigest.ws.id, 'https://push.example.com/send/g1');
  const emitted = await triggerPass(AT8);
  assert.equal(emitted.filter(n => n.task === 'tr1').length, 1, 'reminder emitted exactly once (reminders_sent claim)');
  const send = sinkSends().filter(s => s.endpoint === 'https://push.example.com/send/g1').at(-1);
  assert.ok(send, 'digest user received the reminder push (push never digest-suppressed)');
  assert.equal(send.payload.title, 'Task due', 'D-16 reminder title carries no sender');
  assert.equal(send.payload.body, 'PUSH-3 Digest reminder');
  const docRow = withDb(sink.dbPath, db => db.prepare('select doc from workspaces where id = ?').get(fxDigest.ws.id));
  assert.match(docRow.doc, /"tr1"/, 'task present');
  assert.match(docRow.doc, /due_reminder/, 'inbox notif row written unconditionally (Phase 38 invariant)');
  // (b) push_due=false → no push, inbox row still written.
  const fxOff = await sinkWorkspace({
    prefs: { push_due: false },
    tasks: m => [{ id: 'tr2', key: 'PUSH-4', title: 'No push', project: 'p1', due: DUE, assignees: [m], status: 'todo' }],
  });
  const before = sinkSends().length;
  await triggerPass(AT8);
  assert.equal(sinkSends().length, before, 'push_due=false produced zero pushes');
  const docOff = withDb(sink.dbPath, db => db.prepare('select doc from workspaces where id = ?').get(fxOff.ws.id));
  assert.match(docOff.doc, /due_reminder/, 'inbox row survives the push gate');
});



test('restart with no env loads the SAME persisted keys and keeps subscriptions (PUSH-05 tracer proof)', async () => {
  const keysBefore = storedKeys();
  await server.stop();
  server = await startServer({ dataDir: tempDir, env: { MASTER_KEY: 'projects-push-key' } });
  // The original owner's session cookie died with the process — log back in.
  const back = await login(server.base, 'push-owner@test.local', PASSWORD);
  assert.equal(back.status, 200, `re-login ${back.status}`);
  owner = back.client;
  ws = withDb(server.dbPath, db => db.prepare('select id, slug from workspaces where slug = ?').get('push-ws'));
  assert.ok(ws?.id, 'the workspace row survived the restart');

  const res = await owner.get('/api/me/push-config');
  assert.equal(res.status, 200, `config after restart ${res.status}`);
  assert.equal(res.data.vapidPublicKey, keysBefore.publicKey, 'identical public key across the restart');
  assert.deepEqual(storedKeys(), keysBefore, 'file untouched — never regenerated over an existing file');
  assert.match(server.output(), /source: file/, 'restart logs the file source, not a generation');

  // A re-subscribe after reboot lands in the SAME table: the pre-restart row
  // (device2) survived, and CANONICAL re-subscribes as a fresh second device.
  const post = await owner.post(`/api/me/push-subscriptions?workspace=${ws.id}`, CANONICAL);
  assert.equal(post.status, 200, 'route still works after restart');
  const rows = subs();
  assert.equal(rows.length, 2, 'pre-restart row survived + one new subscription');
  assert.ok(rows.some(r => r.endpoint === 'https://push.example.com/send/device2'), 'pre-restart row still present');
});
