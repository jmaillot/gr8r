/* Session ground-truth suite (phase 14 plan 03): real server, real SQLite.
   Covers SESS-01 (list + metadata + no token hash), SESS-02 (disconnect-all
   keep-current), SESS-03 (per-row revoke), the D-22/D-24 last_seen throttle
   band, and the D-28 401 teardown for a revoked browser. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { ADMIN, login, startServer, withDb } from './helpers/server.mjs';

let server;
let tempDir;

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-sessions-'));
  server = await startServer({ dataDir: tempDir });
});

after(async () => {
  await server?.stop();
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    assert.equal(fs.existsSync(tempDir), false, 'temp data dir removed');
  }
});

/* Wipe every live session for ADMIN: kill all but a throwaway login, then
   sign the throwaway out too, so the next logins start from a clean table. */
async function resetSessions() {
  const fresh = await login(server.base, ADMIN.email, ADMIN.password);
  assert.equal(fresh.status, 200);
  assert.equal((await fresh.client.del('/api/auth/sessions/others')).status, 200);
  assert.equal((await fresh.client.post('/api/auth/logout')).status, 204);
}

test('SESS-01: GET /api/auth/sessions lists the caller sessions with metadata and no token hash', async () => {
  const a = await login(server.base, ADMIN.email, ADMIN.password);
  assert.equal(a.status, 200);

  const list = await a.client.get('/api/auth/sessions');
  assert.equal(list.status, 200);
  const sessions = list.data.sessions;
  assert.ok(Array.isArray(sessions) && sessions.length >= 1, 'sessions array present');

  const current = sessions.find(s => s.current === true);
  assert.ok(current, 'the caller session is marked current');
  assert.match(current.id, /^[0-9a-f]{12}$/, 'opaque id is 12 lowercase hex chars (D-27)');
  assert.equal(typeof current.createdAt, 'number');
  assert.equal(typeof current.ip, 'string');
  assert.ok(current.userAgent && current.userAgent.length > 0, 'user agent captured');
  assert.ok(current.lastSeenAt === null || typeof current.lastSeenAt === 'number');

  for (const s of sessions) {
    assert.ok(!('tokenHash' in s) && !('token_hash' in s), 'token hash never leaves the server');
  }

  withDb(server.dbPath, db => {
    const row = db.prepare('select ip, user_agent, last_seen_at from sessions where token_hash like ?').get(`${current.id}%`);
    assert.ok(row, 'session row found by opaque id prefix');
    assert.ok(row.ip != null && String(row.ip).length > 0, 'ip captured at login');
    assert.ok(row.user_agent != null && String(row.user_agent).length > 0, 'user_agent captured at login');
    assert.ok(row.last_seen_at != null, 'last_seen_at set at creation');
  });
});

test('SESS-02: disconnect-all-others kills the other cookie and keeps the caller (Pitfall 9)', async () => {
  await resetSessions();
  const a = await login(server.base, ADMIN.email, ADMIN.password);
  const b = await login(server.base, ADMIN.email, ADMIN.password);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);

  const res = await a.client.del('/api/auth/sessions/others');
  assert.equal(res.status, 200);
  assert.ok(res.data.revoked >= 1, 'at least the other session revoked');
  assert.equal(res.data.remaining, 1, 'live post-delete count: only the caller remains');

  const bProbe = await b.client.get('/api/workspaces/acme');
  assert.equal(bProbe.status, 401, 'the other browser is dead');

  const me = await a.client.get('/api/auth/me');
  assert.equal(me.status, 200, 'the caller is still authenticated');
  assert.ok(me.data.user && me.data.user.email === ADMIN.email);
});

test('SESS-03: per-row revoke kills exactly the targeted session', async () => {
  await resetSessions();
  const a = await login(server.base, ADMIN.email, ADMIN.password);
  const b = await login(server.base, ADMIN.email, ADMIN.password);
  const c = await login(server.base, ADMIN.email, ADMIN.password);

  const list = await a.client.get('/api/auth/sessions');
  assert.equal(list.status, 200);
  assert.equal(list.data.sessions.length, 3, 'exactly three live sessions after reset + 3 logins');
  for (const s of list.data.sessions) {
    assert.ok(!('tokenHash' in s) && !('token_hash' in s));
  }

  const victim = list.data.sessions.find(s => s.current === false);
  assert.ok(victim, 'a non-current session selected as the victim');

  const del = await a.client.del(`/api/auth/sessions/${victim.id}`);
  assert.equal(del.status, 204);

  // The victim is one of b/c: exactly one must die, the other must be untouched.
  const outcomes = await Promise.all([b.client.get('/api/workspaces/acme'), c.client.get('/api/workspaces/acme')]);
  assert.deepEqual(outcomes.map(o => o.status).sort(), [200, 401], 'exactly one of the two other sessions revoked, the other untouched');

  // Idempotent: revoking the same (already-dead) id is still 204 (OQ4).
  const again = await a.client.del(`/api/auth/sessions/${victim.id}`);
  assert.equal(again.status, 204);
});

test('D-22/D-24: last_seen_at is throttled to one write per 60s band', async () => {
  const a = await login(server.base, ADMIN.email, ADMIN.password);
  assert.equal(a.status, 200);

  // First request: last_seen_at was written at insert (= created_at); the
  // throttled touch must NOT advance it inside the band.
  const first = await a.client.get('/api/auth/sessions');
  assert.equal(first.status, 200);
  const current = first.data.sessions.find(s => s.current);
  assert.ok(current);
  assert.equal(current.lastSeenAt, current.createdAt, 'first in-band request does not advance last_seen_at');

  // Second immediate request: still inside the band, unchanged.
  const second = await a.client.get('/api/auth/sessions');
  const still = second.data.sessions.find(s => s.current);
  assert.equal(still.lastSeenAt, current.createdAt, 'second in-band request does not advance last_seen_at');

  // Restart the server on the same dataDir: the in-memory lastSeenNext map is
  // lost (T-14-07). Login fresh (login never calls currentUser), age every
  // stored last_seen_at past the band BEFORE any authenticated request, and
  // prove the next request's throttled touch fires.
  await server.stop();
  server = await startServer({ dataDir: tempDir });
  const b = await login(server.base, ADMIN.email, ADMIN.password);
  assert.equal(b.status, 200);

  const aged = Date.now() - 2 * 60 * 1000;
  withDb(server.dbPath, db => {
    db.prepare('update sessions set last_seen_at = ?').run(aged);
  });

  // This GET is the first currentUser() pass for this token since restart: map
  // empty, stored value older than the band -> the throttled write must fire.
  // currentUser() runs inside requireUser() before the endpoint's SELECT, so the
  // response already reflects the post-touch value.
  const probe = await b.client.get('/api/auth/sessions');
  assert.equal(probe.status, 200);
  const shown = probe.data.sessions.find(s => s.current).lastSeenAt;
  assert.ok(shown > aged + 60 * 1000 && Math.abs(shown - Date.now()) < 10_000, 'the response reflects the fired touch');

  withDb(server.dbPath, db => {
    const recent = db.prepare('select max(last_seen_at) as n from sessions').get().n;
    assert.ok(recent > aged + 60 * 1000, 'last_seen_at advanced past the aged value');
    assert.ok(Math.abs(recent - Date.now()) < 10_000, 'last_seen_at is recent');
  });
});

test('D-28: a revoked browser gets the 401 teardown with the sign-in-required code', async () => {
  const a = await login(server.base, ADMIN.email, ADMIN.password);
  const b = await login(server.base, ADMIN.email, ADMIN.password);
  assert.equal((await a.client.del('/api/auth/sessions/others')).status, 200);

  const probe = await b.client.get('/api/workspaces/acme');
  assert.equal(probe.status, 401);
  assert.equal(probe.data.code, 'signInRequired', 'the 401 handler code the client maps to err.signedOutElsewhere');

  const me = await a.client.get('/api/auth/me');
  assert.equal(me.status, 200, 'the revoking caller stays alive');
});
