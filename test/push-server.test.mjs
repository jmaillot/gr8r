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

/* ------------------- (e) restart: identical keys load, subscriptions survive ------------------- */

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
