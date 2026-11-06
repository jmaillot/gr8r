/* =====================================================================
   Phase 42 plan 01 — the RFC 8058 one-click unsubscribe endpoint
   (UNSUB-02). Boot a real server with MASTER_KEY + APP_URL (digest.test.mjs
   second-fixture pattern), mint tokens via makeUnsubscribeToken with the
   mirrored key derivation sha256(MASTER_KEY ‖ 'unsubscribe-tokens:v1')
   (server.js unsubscribeHmacKey), and hit the route in the MAIL-CLIENT
   posture: NO cookies, NO Sec-Fetch headers, NO request body.

   The suite pins the full security contract of handleUnsubscribe
   (D-01..D-10, SC-1..SC-4) — Task 1 carries the tracer slice (valid POST +
   forged POST); the remaining matrix lands in the same plan.

   NEVER log the token from a test helper, and never send a request body.
   ===================================================================== */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { makeUnsubscribeToken } from '../mailer.js';
import { startServer, signup, client, withDb } from './helpers/server.mjs';

const MASTER_KEY = 'projects-unsub-route-key';
const GOOD = 'password-1234';
const VERIFIED_TEXT = 'You will no longer receive these digest emails.';
const NEUTRAL_TEXT = 'Your request has been processed.';

/* Mirror of server.js unsubscribeHmacKey (L145-146): one createHash, two
   chained updates — byte-identical to the server derivation. */
function unsubKey(masterKey = MASTER_KEY) {
  return crypto.createHash('sha256').update(masterKey).update('unsubscribe-tokens:v1').digest();
}

/* Boot one unsub server fixture and return { server, wsId, userId, key }. */
async function bootUnsubServer(env = {}) {
  const server = await startServer({ env: { MASTER_KEY, APP_URL: 'https://app.test', ...env } });
  const email = `unsub-owner-${Math.random().toString(36).slice(2, 8)}@test.local`;
  await signup(server.base, { name: 'Owner', email, password: GOOD });
  const c = client(server.base, email);
  const logged = await c.post('/api/auth/login', { email, password: GOOD });
  assert.equal(logged.status, 200, 'fixture owner login');
  const created = await c.post('/api/workspaces', { name: 'Unsub', slug: `unsub-${Math.random().toString(36).slice(2, 8)}` });
  assert.equal(created.status, 201, 'fixture workspace create');
  const row = withDb(server.dbPath, db =>
    db.prepare('select m.workspace_id, m.user_id from memberships m order by m.rowid desc limit 1').get(),
  );
  assert.ok(row?.workspace_id && row?.user_id, 'fixture membership resolves (wsId, userId)');
  return { server, wsId: row.workspace_id, userId: row.user_id, key: unsubKey(env.MASTER_KEY === undefined ? MASTER_KEY : env.MASTER_KEY) };
}

/* Mail-client fetch: no cookies, no Sec-Fetch headers, no body. */
const unsubFetch = (base, token, method = 'POST') => fetch(`${base}/unsubscribe/${token}`, { method, redirect: 'manual' });

const prefsRow = (server, wsId, userId) =>
  withDb(server.dbPath, db =>
    db.prepare('select prefs from user_notif_prefs where workspace_id = ? and user_id = ?').get(wsId, userId),
  );

test('a valid POST flips the stored row to email_digest=false and answers the verified page', async () => {
  const fx = await bootUnsubServer();
  try {
    const token = makeUnsubscribeToken(fx.key, fx.wsId, fx.userId);
    const res = await unsubFetch(fx.server.base, token);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /^text\/html; charset=utf-8$/);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const body = await res.text();
    assert.ok(body.includes(VERIFIED_TEXT), 'the verified page text is rendered');
    const stored = prefsRow(fx.server, fx.wsId, fx.userId);
    assert.ok(stored, 'the sparse row was created');
    assert.equal(JSON.parse(stored.prefs).email_digest, false, 'email_digest flipped to false');
  } finally {
    await fx.server.stop();
  }
});

test('a forged token POST answers the neutral page with the identical envelope and no mutation', async () => {
  const fx = await bootUnsubServer();
  try {
    const token = makeUnsubscribeToken(fx.key, fx.wsId, fx.userId);
    /* Flip one payload byte after the MAC — a structurally valid token that
       fails verification. */
    const raw = Buffer.from(token, 'base64url');
    raw[5] ^= 0xff;
    const forged = raw.toString('base64url');

    const res = await unsubFetch(fx.server.base, forged);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /^text\/html; charset=utf-8$/);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const body = await res.text();
    assert.ok(body.includes(NEUTRAL_TEXT), 'the neutral page text is rendered');
    assert.ok(!body.includes(VERIFIED_TEXT), 'the neutral page never asserts unsubscription');
    assert.equal(prefsRow(fx.server, fx.wsId, fx.userId), undefined, 'no prefs row was created');

    /* Envelope parity (D-03): the forged outcome shares the verified
       outcome's exact status/content-type/cache envelope. */
    assert.deepEqual(
      { status: res.status, ct: res.headers.get('content-type'), cc: res.headers.get('cache-control') },
      { status: 200, ct: 'text/html; charset=utf-8', cc: 'no-store' },
    );
  } finally {
    await fx.server.stop();
  }
});
