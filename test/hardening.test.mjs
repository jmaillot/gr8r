/* Phase 33 Membership-Surface Hardening pins (HARD-01, HARD-04, HARD-05).

   Every test spawns its OWN server: the invite-accept throttle budget is
   `invite|ip` — 5 per hour per IP (Pitfall 2), and each spawned server owns a
   fresh database and budget.

   Accept-budget ledger per server (all link-only invites, member role):
   - "hostile origin" server ................. 0 accepts
   - "budget" server ......................... 1 accept (positive control)
   - TRUST_PROXY servers ..................... 0-1 accept each
   - "spoof" server .......................... 2 accepts (clean + spoofed) */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { ADMIN, inviteToken, login, startServer, withDb } from './helpers/server.mjs';

const PASSWORD = 'hardening-password-1';

/* Link-only member invite minted by the admin; returns the /join/<token> token. */
async function linkOnlyInvite(owner) {
  const [inv] = (await owner.post('/api/workspaces/acme/invites', { emails: [null], role: 'member' })).data.invites;
  return inviteToken(inv.url);
}

/* ---------- HARD-01 / D-08: sameOrigin guard FIRST on the accept route ---------- */

test('a hostile-Origin accept POST is rejected 403 crossOriginRejected with the byte-identical no-oracle body (HARD-01)', async () => {
  const server = await startServer();
  try {
    const owner = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const token = await linkOnlyInvite(owner);
    const res = await fetch(`${server.base}/api/invites/${token}/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify({ name: 'Evil', email: 'evil@test.local', password: PASSWORD }),
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.code, 'crossOriginRejected');
    assert.equal(data.error, 'Cross-origin request rejected', 'the message is byte-identical to the other guard sites');
    assert.deepEqual(Object.keys(data).sort(), ['code', 'error'], 'no-oracle body: exactly {code, error}');
  } finally {
    await server.stop();
  }
});

test('the guard runs BEFORE the throttle: hostile probes consume no invite|ip budget and the Origin-less harness client still accepts (HARD-01/D-08 positive control)', async () => {
  const server = await startServer();
  try {
    const owner = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const token = await linkOnlyInvite(owner);

    // Six hostile-Origin probes — one more than the 5-per-hour invite|ip budget.
    for (let i = 0; i < 6; i++) {
      const res = await fetch(`${server.base}/api/invites/${token}/accept`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
        body: JSON.stringify({ name: 'Evil', email: 'evil@test.local', password: PASSWORD }),
      });
      assert.equal(res.status, 403, `probe ${i} must be a guard 403, never a 429`);
    }

    // Positive control: the harness client sends NO Origin (Pitfall 3) and the
    // guard passes it; the accepts still succeed, proving the 403s consumed no
    // throttle budget.
    const res = await fetch(`${server.base}/api/invites/${token}/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Clean', email: 'clean@test.local', password: PASSWORD }),
    });
    assert.ok([200, 201].includes(res.status), `the legit accept must succeed, got ${res.status}`);
  } finally {
    await server.stop();
  }
});

/* ---------- HARD-05 / D-07: shared firstForwardedValue() first-value discipline ---------- */

/* TRUST_PROXY=true (Pitfall 7): without it the readers ignore x-forwarded-* entirely. */
async function trustProxyServer() {
  return startServer({ env: { TRUST_PROXY: 'true' } });
}

test('multi-value x-forwarded-host behaves by its FIRST value in sameOrigin: "a.com, evil.com" matches origin https://a.com (HARD-05)', async () => {
  const server = await trustProxyServer();
  try {
    const owner = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const token = await linkOnlyInvite(owner);
    const res = await fetch(`${server.base}/api/invites/${token}/accept`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'a.com, evil.com',
        origin: 'https://a.com',
      },
      body: JSON.stringify({ name: 'First', email: 'first@test.local', password: PASSWORD }),
    });
    assert.ok([200, 201].includes(res.status), `first forwarded value must win the guard, got ${res.status} ${JSON.stringify(await res.json())}`);
  } finally {
    await server.stop();
  }
});

test('multi-value x-forwarded-host: the SECOND value is never consulted — origin https://evil.com is rejected (HARD-05)', async () => {
  const server = await trustProxyServer();
  try {
    const owner = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const token = await linkOnlyInvite(owner);
    const res = await fetch(`${server.base}/api/invites/${token}/accept`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'a.com, evil.com',
        origin: 'https://evil.com',
      },
      body: JSON.stringify({ name: 'Evil', email: 'evil2@test.local', password: PASSWORD }),
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.code, 'crossOriginRejected');
  } finally {
    await server.stop();
  }
});

test('regression: a single-value x-forwarded-host behaves exactly as before the helper refactor (HARD-05)', async () => {
  const server = await trustProxyServer();
  try {
    const owner = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const token = await linkOnlyInvite(owner);
    const good = await fetch(`${server.base}/api/invites/${token}/accept`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'a.com',
        origin: 'https://a.com',
      },
      body: JSON.stringify({ name: 'Single', email: 'single@test.local', password: PASSWORD }),
    });
    assert.ok([200, 201].includes(good.status), `single-value match must still pass, got ${good.status}`);
  } finally {
    await server.stop();
  }
});

/* ---------- HARD-04 / D-06: silent {name,email,password} whitelist ---------- */

const SPOOF_EXTRAS = { role: 'admin', teams: ['x'], scope: { projects: ['p_in'] }, isAdmin: true };

test('smuggled role/teams/scope keys cannot influence the acceptance outcome (HARD-04 spoof pin)', async () => {
  const server = await startServer();
  try {
    const owner = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const cleanToken = await linkOnlyInvite(owner);
    const spoofToken = await linkOnlyInvite(owner);

    const clean = await fetch(`${server.base}/api/invites/${cleanToken}/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Clean', email: 'clean@test.local', password: PASSWORD }),
    });
    assert.ok([200, 201].includes(clean.status));

    const spoofed = await fetch(`${server.base}/api/invites/${spoofToken}/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...SPOOF_EXTRAS, name: 'Spoof', email: 'spoof@test.local', password: PASSWORD }),
    });
    assert.ok([200, 201].includes(spoofed.status), `the spoofed accept must succeed like a clean one, got ${spoofed.status}`);

    // Both memberships' granted values must be identical — role/scope on the
    // memberships row, teams as authority rows in team_members (TEAM-01);
    // everything comes ONLY from the invite row (SCOPE-05), never the body.
    const grant = email =>
      withDb(server.dbPath, db => ({
        ...db
          .prepare('select m.role, m.scope from memberships m join users u on u.id = m.user_id where u.email = ?')
          .get(email),
        teams: db
          .prepare('select tm.team_id from team_members tm join users u on u.id = tm.user_id where u.email = ? order by tm.team_id')
          .all(email)
          .map(r => r.team_id),
      }));
    const cleanRow = grant('clean@test.local');
    const spoofRow = grant('spoof@test.local');
    assert.equal(spoofRow.role, cleanRow.role, 'granted role identical to the clean accept');
    assert.equal(spoofRow.role, 'member', 'role comes from the invite row, not the body');
    assert.deepEqual(spoofRow.teams, cleanRow.teams, 'granted teams identical to the clean accept');
    assert.deepEqual(spoofRow.teams, [], 'smuggled teams array never lands in authority rows');
    assert.equal(spoofRow.scope, cleanRow.scope, 'granted scope identical to the clean accept');
  } finally {
    await server.stop();
  }
});

/* ---------- HARD-03 / D-05: both invite twins fail closed ---------- */

/* Seed an invite row whose workspace is GONE — direct DatabaseSync insert
   (the hardened creation route can never mint this shape again). FKs are
   disabled on this connection: the invite must dangle, not cascade away. */
function seedDeadWorkspaceInvite(server, { email = null, role = 'member' } = {}) {
  const token = crypto.randomBytes(24).toString('base64url');
  const db = new DatabaseSync(server.dbPath, { enableForeignKeyConstraints: false });
  try {
    const owner = db.prepare('select id from users where email = ?').get(ADMIN.email);
    db.prepare(
      'insert into invites (token_hash, email, role, teams, scope, workspace_id, created_by, created_at, expires_at) values (?,?,?,?,?,?,?,?,?)',
    ).run(
      crypto.createHash('sha256').update(token).digest('hex'),
      email,
      role,
      null,
      null,
      'ws-deleted-hardening-test',
      owner.id,
      Date.now(),
      Date.now() + 86400000,
    );
  } finally {
    db.close();
  }
  return token;
}

test('an accept whose invite points at a deleted workspace returns 410 workspaceGone — no fallback join, no membership row (HARD-03a)', async () => {
  const server = await startServer();
  try {
    const token = seedDeadWorkspaceInvite(server);
    const res = await fetch(`${server.base}/api/invites/${token}/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Late', email: 'late@test.local', password: PASSWORD }),
    });
    assert.equal(res.status, 410);
    const data = await res.json();
    assert.equal(data.code, 'workspaceGone');
    assert.equal(data.error, 'This workspace no longer exists', 'the message is byte-identical to the locked D-05 body');
    assert.deepEqual(Object.keys(data).sort(), ['code', 'error'], 'no-oracle body: exactly {code, error}');
    withDb(server.dbPath, db => {
      const user = db.prepare('select id from users where email = ?').get('late@test.local');
      const count = user ? db.prepare('select count(*) as n from memberships where user_id = ?').get(user.id).n : 0;
      assert.equal(count, 0, 'zero new membership rows — the fallback join is gone');
    });
  } finally {
    await server.stop();
  }
});

/* ---------- HARD-02 / D-01/D-02: admin link-only invites blocked at both ends + boot sweep ---------- */

/* Seed an email-less admin-role invite row DIRECTLY (the hardened creation
   route refuses to mint one). FKs off so the row inserts freely; always
   called AFTER boot, so the D-02 sweep has already run and cannot eat it. */
function seedLegacyAdminInvite(server, { email = null, role = 'admin' } = {}) {
  const token = crypto.randomBytes(24).toString('base64url');
  const db = new DatabaseSync(server.dbPath, { enableForeignKeyConstraints: false });
  try {
    const owner = db.prepare('select id from users where email = ?').get(ADMIN.email);
    const ws = db.prepare('select id from workspaces order by rowid limit 1').get();
    db.prepare(
      'insert into invites (token_hash, email, role, teams, scope, workspace_id, created_by, created_at, expires_at) values (?,?,?,?,?,?,?,?,?)',
    ).run(crypto.createHash('sha256').update(token).digest('hex'), email, role, null, null, ws.id, owner.id, Date.now(), Date.now() + 86400000);
  } finally {
    db.close();
  }
  return token;
}

test('HARD-02a: an admin invite with no emails is rejected 400 inviteAdminEmailRequired before any insert; a member link-only invite still succeeds', async () => {
  const server = await startServer();
  try {
    const owner = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const empty = await owner.post('/api/workspaces/acme/invites', { emails: [], role: 'admin' });
    assert.equal(empty.status, 400);
    assert.equal(empty.data.code, 'inviteAdminEmailRequired');
    const nullOnly = await owner.post('/api/workspaces/acme/invites', { emails: [null], role: 'admin' });
    assert.equal(nullOnly.status, 400, 'a null-only array normalizes to link-only');
    assert.equal(nullOnly.data.code, 'inviteAdminEmailRequired');
    // No over-blocking: a member link-only invite still works.
    const member = await owner.post('/api/workspaces/acme/invites', { emails: [null], role: 'member' });
    assert.ok([200, 201].includes(member.status), `member link-only invite must still succeed, got ${member.status}`);
    assert.equal(member.data.invites.length, 1);
    // No insert happened for the admin attempts: exactly one invite row exists.
    withDb(server.dbPath, db => {
      const n = db.prepare('select count(*) as n from invites where role = ?').get('admin').n;
      assert.equal(n, 0, 'no admin invite row was inserted');
    });
  } finally {
    await server.stop();
  }
});

test('HARD-02b: accepting a seeded email-less admin-role invite row refuses the grant — no admin membership row', async () => {
  const server = await startServer();
  try {
    const token = seedLegacyAdminInvite(server, { email: null, role: 'admin' });
    const res = await fetch(`${server.base}/api/invites/${token}/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Climber', email: 'climber@test.local', password: PASSWORD }),
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.code, 'inviteAdminEmailRequired');
    withDb(server.dbPath, db => {
      const user = db.prepare('select id from users where email = ?').get('climber@test.local');
      const rows = user
        ? db
            .prepare('select m.role from memberships m where m.user_id = ? and m.role in (?, ?)')
            .all(user.id, 'admin', 'owner')
        : [];
      assert.equal(rows.length, 0, 'no admin/owner membership row was created');
    });
  } finally {
    await server.stop();
  }
});

test('HARD-02c: the boot sweep marks a legacy link-only admin invite used_at = now — the row still EXISTS (update only, never deleted)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hardening-sweep-'));
  try {
    const first = await startServer({ dataDir: dir });
    const token = seedLegacyAdminInvite(first, { email: null, role: 'admin' });
    await first.stop();
    // Reboot against the SAME dataDir: the D-02 sweep must fire at boot.
    const second = await startServer({ dataDir: dir });
    try {
      withDb(second.dbPath, db => {
        const row = db.prepare('select * from invites where token_hash = ?').get(crypto.createHash('sha256').update(token).digest('hex'));
        assert.ok(row, 'the legacy row still EXISTS — the sweep is an update, never a delete');
        assert.ok(row.used_at, 'used_at was stamped at boot');
        assert.equal(row.role, 'admin', 'the row itself is untouched otherwise');
      });
      // And the swept link can never grant admin anymore.
      const res = await fetch(`${second.base}/api/invites/${token}/accept`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'TooLate', email: 'toolate@test.local', password: PASSWORD }),
      });
      assert.equal(res.status, 410, 'the swept invite is dead — inviteAlreadyUsed');
      assert.equal((await res.json()).code, 'inviteAlreadyUsed');
    } finally {
      await second.stop();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an empty JSON accept body {} reaches the existing field-validation error, not a crash (HARD-04 edge)', async () => {
  const server = await startServer();
  try {
    const owner = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const token = await linkOnlyInvite(owner);
    const res = await fetch(`${server.base}/api/invites/${token}/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400, 'empty body follows the normal validation path');
    const data = await res.json();
    assert.equal(data.code, 'nameRequired');
  } finally {
    await server.stop();
  }
});
