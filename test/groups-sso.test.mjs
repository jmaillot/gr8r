/* SSO groups-claim grant suite (Phase 81, GW-01/GW-03 tracer + D-81 pins). The
   REAL authorize → callback flow runs against the shared mock-Entra IdP with a
   `groups` claim injected per test; the callback grants workspace memberships
   with provenance `group:<guid>` per D-81-6. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, test } from 'node:test';
import { idp, startMockIdp } from './helpers/oidc-idp.mjs';
import { ADMIN, login, startServer, withDb } from './helpers/server.mjs';

/* ------------------------------ helpers ------------------------------ */

/* Browser-navigation fetch: manual redirects, raw Set-Cookie access. */
async function nav(base, pathname, cookie) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  const res = await fetch(base + pathname, { redirect: 'manual', headers });
  return { status: res.status, location: res.headers.get('location'), cookies: res.headers.getSetCookie?.() || [] };
}

const flowCookieOf = cookies => cookies.find(c => c.startsWith('projects_oidc_flow='))?.split(';')[0] || null;
const sessionCookieOf = cookies => cookies.find(c => c.startsWith('projects_session=') && !c.includes('Max-Age=0')) || null;
const queryOf = location => new URL(location, 'http://x').searchParams;

let mockIdp;

before(async () => {
  mockIdp = await startMockIdp();
});

after(async () => {
  await new Promise(resolve => mockIdp.close(resolve));
});

const oidcEnv = () => ({ OIDC_ENABLED: 'true', OIDC_TENANT_ID: 't-1', OIDC_CLIENT_ID: 'cid', OIDC_CLIENT_SECRET: 'sec', OIDC_ISSUER_OVERRIDE: idp.issuer });

/* One full start → authorize → callback flow (twin of test/oidc-sso.test.mjs
   runFlow). `claims` spread over the default token payload. */
async function runFlow(srv, claims = {}, code = 'auth-code-1') {
  const start = await nav(srv.base, '/api/auth/oidc/start');
  assert.equal(start.status, 302);
  const q = queryOf(start.location);
  const flowCookie = flowCookieOf(start.cookies);
  idp.tokenConfig = { code, claims: { nonce: q.get('nonce'), ...claims } };
  const callback = await nav(srv.base, `/api/auth/oidc/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(q.get('state'))}`, flowCookie);
  return { start, callback, flowCookie, q };
}

/* Seed one active workspace row (direct insert — the fixture only needs the
   memberships FK target). */
function seedWorkspace(db, { id, slug, name }) {
  const t = Date.now();
  db.prepare('insert into workspaces (id, slug, name, doc, created_at, updated_at) values (?,?,?,?,?,?)').run(id, slug, name, '{}', t, t);
}

function seedMapping(db, { guid, workspaceId, role = 'member', kind = 'workspace' }) {
  const t = Date.now();
  db.prepare('insert into group_mappings (id, group_guid, workspace_id, role, kind, created_at, updated_at) values (?,?,?,?,?,?,?)').run(
    `gm_${guid.slice(0, 8)}_${workspaceId}`,
    guid,
    workspaceId,
    role,
    kind,
    t,
    t,
  );
}

/* Seed one pending invite through the real API — a harness-owner login creates
   the workspace, then invites the future SSO user (house idiom from the DP-5
   suite; invites need a real created_by users row). */
async function ownerInvite(base, { email, role = 'member' }) {
  const owner = (await login(base, ADMIN.email, ADMIN.password)).client;
  const slug = (await owner.get('/api/workspaces')).data.workspaces[0].slug;
  const inv = await owner.post(`/api/workspaces/${slug}/invites`, { emails: [email], role });
  assert.equal(inv.status, 201, `invite creation must succeed, got ${inv.status}: ${JSON.stringify(inv.data)}`);
  return slug;
}

/* Phase 81 (GW-03/D-81-1): the provenance-filtered DP-5 guard counts only
   non-group memberships — a group-mapped user with a pending invite still
   auto-accepts (the grant landed first, the invite reconciles on top); an
   unmapped user's rows carry no group provenance so the path is byte-identical. */
test('unmapped user with a pending invite still auto-accepts with provenance invite (Pin B)', async () => {
  const server = await startServer({ env: oidcEnv() });
  try {
    const slug = await ownerInvite(server.base, { email: 'pinb-user@example.com', role: 'member' });
    const { callback } = await runFlow(server, { sub: 'sub-pinb', email: 'pinb-user@example.com', email_verified: true }, 'code-pinb');
    assert.equal(callback.location, '/', 'unmapped invite login lands on /');
    withDb(server.dbPath, db => {
      const ws = db.prepare('select * from workspaces where slug = ?').get(slug);
      const user = db.prepare('select * from users where email = ?').get('pinb-user@example.com');
      const rows = db.prepare('select * from memberships where user_id = ?').all(user.id);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].workspace_id, ws.id);
      assert.equal(rows[0].role, 'member');
      assert.equal(rows[0].provenance, 'invite', 'the auto-accepted invite carries provenance invite');
      assert.equal(db.prepare('select count(*) as n from invites where used_at is not null').get().n, 1, 'the invite was consumed');
    });
  } finally {
    await server.stop();
  }
});

test('group-mapped user with a pending invite ALSO auto-accepts — provenance stays group:<guid> (Pin C, D-81-1/D-81-7)', async () => {
  const server = await startServer({ env: oidcEnv() });
  try {
    const slug = await ownerInvite(server.base, { email: 'pinc-user@example.com', role: 'member' });
    withDb(server.dbPath, db => {
      const ws = db.prepare('select * from workspaces where slug = ?').get(slug);
      seedMapping(db, { guid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', workspaceId: ws.id, role: 'member' });
    });
    const { callback } = await runFlow(server, {
      sub: 'sub-pinc',
      email: 'pinc-user@example.com',
      email_verified: true,
      groups: ['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'],
    }, 'code-pinc');
    assert.equal(callback.location, '/', 'the mapped + invited login lands on /');
    withDb(server.dbPath, db => {
      const user = db.prepare('select * from users where email = ?').get('pinc-user@example.com');
      const rows = db.prepare('select * from memberships where user_id = ?').all(user.id);
      assert.equal(rows.length, 1, 'grant + invite reconcile onto ONE row');
      assert.equal(rows[0].role, 'member');
      assert.equal(rows[0].provenance, 'group:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'creation origin survives the invite reconcile (D-81-7 — no clobber to invite)');
      assert.equal(db.prepare('select count(*) as n from invites where used_at is not null and email = ?').get('pinc-user@example.com').n, 1, 'the invite was reconciled');
    });
  } finally {
    await server.stop();
  }
});

test('empty/absent groups claim and zero mappings write nothing — login proceeds (edge pins)', async () => {
  for (const [name, claims] of [
    ['no groups key', { sub: 'sub-empty-1', email: 'empty1@example.com', email_verified: true }],
    ['empty groups array', { sub: 'sub-empty-2', email: 'empty2@example.com', email_verified: true, groups: [] }],
    ['groups claim, zero mappings', { sub: 'sub-empty-3', email: 'empty3@example.com', email_verified: true, groups: ['11111111-2222-3333-4444-555555555555'] }],
  ]) {
    const server = await startServer({ env: oidcEnv() });
    try {
      withDb(server.dbPath, db => seedWorkspace(db, { id: 'ws-empty', slug: 'empty', name: 'Empty WS' }));
      const { callback } = await runFlow(server, claims, `code-${name.replace(/\W+/g, '')}`);
      assert.equal(callback.location, '/', `${name}: login proceeds`);
      withDb(server.dbPath, db => {
        const user = db.prepare('select * from users where email = ?').get(claims.email);
        assert.ok(user);
        assert.equal(db.prepare('select count(*) as n from memberships where user_id = ?').get(user.id).n, 0, `${name}: zero grant writes`);
      });
    } finally {
      await server.stop();
    }
  }
});

/* Phase 81 Task 2 (GO-01/GO-02, D-81-4/D-81-5): operator self-grant — the flag
   flip and the operator_promoted audit row share ONE db.tx (actor = target =
   the granted user); already-operator re-login writes nothing; a demoted
   operator's next login re-grants with a fresh audit row (D-82-3). */
test('operator-mapped login grants is_instance_admin atomically with an audit row; re-login no-op; re-grant after demotion (GO-01/GO-02/D-82-3)', async () => {
  const server = await startServer({ env: oidcEnv() });
  try {
    withDb(server.dbPath, db => seedMapping(db, { guid: '81111111-2222-3333-4444-555555555555', workspaceId: 'ws-none', role: 'member', kind: 'operator' }));
    const claims = { sub: 'sub-op', email: 'operator@example.com', email_verified: true, groups: ['81111111-2222-3333-4444-555555555555'] };
    // Login 1 — flag flip + exactly one audit row.
    const first = await runFlow(server, claims, 'code-op-1');
    assert.equal(first.callback.location, '/');
    withDb(server.dbPath, db => {
      const user = db.prepare('select * from users where email = ?').get('operator@example.com');
      assert.equal(user.is_instance_admin, 1, 'the operator mapping flipped the flag');
      const audits = db.prepare("select * from audit_log where action = 'operator_promoted'").all();
      assert.equal(audits.length, 1, 'exactly one audit row');
      assert.equal(audits[0].actor_id, user.id, 'actor = the granted user (self-grant)');
      assert.equal(audits[0].target_id, user.id, 'target = the granted user');
      assert.ok(audits[0].ip, 'ip captured from the request');
      assert.equal(db.prepare('select count(*) as n from memberships where user_id = ?').get(user.id).n, 0, 'operator-kind mapping grants no workspace membership');
    });
    // Login 2 — already-operator: no write, no audit (D-81-5).
    const second = await runFlow(server, claims, 'code-op-2');
    assert.equal(second.callback.location, '/');
    withDb(server.dbPath, db => {
      const uid = db.prepare('select id from users where email = ?').get('operator@example.com').id;
      assert.equal(db.prepare("select count(*) as n from audit_log where action = 'operator_promoted'").get().n, 1, 're-login added ZERO audit rows');
      assert.equal(db.prepare('select is_instance_admin as f from users where id = ?').get(uid).f, 1);
    });
    // Demote, then login → re-granted with a fresh audit row (D-82-3).
    withDb(server.dbPath, db => db.prepare('update users set is_instance_admin = 0 where email = ?').run('operator@example.com'));
    const third = await runFlow(server, claims, 'code-op-3');
    assert.equal(third.callback.location, '/');
    withDb(server.dbPath, db => {
      const user = db.prepare('select * from users where email = ?').get('operator@example.com');
      assert.equal(user.is_instance_admin, 1, 're-grant after demotion');
      const audits = db.prepare("select * from audit_log where action = 'operator_promoted'").all();
      assert.equal(audits.length, 2, 'the re-grant IS a change → one new audit row');
      assert.ok(audits.every(a => a.target_id === user.id));
    });
  } finally {
    await server.stop();
  }
});

test('already-operator with operator mapping logs in with zero writes (D-81-5 binding consequence)', async () => {
  const server = await startServer({ env: oidcEnv() });
  try {
    withDb(server.dbPath, db => seedMapping(db, { guid: '81111111-2222-3333-4444-555555555555', workspaceId: 'ws-none', role: 'member', kind: 'operator' }));
    const claims = { sub: 'sub-op-pre', email: 'preop@example.com', email_verified: true, groups: ['81111111-2222-3333-4444-555555555555'] };
    const first = await runFlow(server, claims, 'code-preop-1');
    assert.equal(first.callback.location, '/');
    withDb(server.dbPath, db => {
      const uid = db.prepare('select id from users where email = ?').get('preop@example.com').id;
      assert.equal(db.prepare("select count(*) as n from audit_log where action = 'operator_promoted'").get().n, 1, 'login 1 granted + audited');
      return uid;
    });
    const second = await runFlow(server, claims, 'code-preop-2');
    assert.equal(second.callback.location, '/');
    withDb(server.dbPath, db => {
      const uid = db.prepare('select id from users where email = ?').get('preop@example.com').id;
      assert.equal(db.prepare("select count(*) as n from audit_log where actor_id = ?").get(uid).n, 1, 'already-operator login wrote nothing (changes-only)');
    });
  } finally {
    await server.stop();
  }
});

/* Phase 81 Task 3 (D-81-10): overage claim → ONE fixed logWarn naming no GUID,
   count, or claim content — zero grant writes, login proceeds. */
test('overage claim logs the fixed message and writes nothing (D-81-10)', async () => {
  const server = await startServer({ env: oidcEnv() });
  try {
    withDb(server.dbPath, db => {
      seedWorkspace(db, { id: 'ws-over', slug: 'overws', name: 'Over WS' });
      seedMapping(db, { guid: '91111111-2222-3333-4444-555555555555', workspaceId: 'ws-over', role: 'member' });
    });
    const { callback } = await runFlow(server, { sub: 'sub-overage', email: 'overage@example.com', email_verified: true, _claim_names: { groups: 'src1' } }, 'code-overage');
    assert.equal(callback.location, '/', 'overage login proceeds as unmapped');
    const out = server.output();
    assert.ok(out.includes('sso groups claim overage — treating as unmapped'), 'the fixed overage line is present');
    assert.ok(!/91111111|src1|overage@example|count/.test(out.slice(out.indexOf('overage'))), 'no GUID, claim key, email, or count in the overage line');
    withDb(server.dbPath, db => {
      const uid = db.prepare('select id from users where email = ?').get('overage@example.com').id;
      assert.equal(db.prepare('select count(*) as n from memberships where user_id = ?').get(uid).n, 0, 'zero grant writes');
      assert.equal(db.prepare("select count(*) as n from security_log where user_id = ? and verb like 'sso_group%'").get(uid).n, 0);
    });
  } finally {
    await server.stop();
  }
});

/* D-81-8: dead/archived target → skip + logWarn, never fatal; remaining
   grants still apply. */
test('archived or missing workspace skips that grant with logWarn — other grants unaffected (D-81-8)', async () => {
  const server = await startServer({ env: oidcEnv() });
  try {
    withDb(server.dbPath, db => {
      seedWorkspace(db, { id: 'ws-live', slug: 'livews', name: 'Live WS' });
      seedWorkspace(db, { id: 'ws-dead', slug: 'deadws', name: 'Dead WS' });
      seedWorkspace(db, { id: 'ws-gone', slug: 'gonews', name: 'Gone WS' });
      seedMapping(db, { guid: 'a1111111-2222-3333-4444-555555555555', workspaceId: 'ws-dead', role: 'member' });
      seedMapping(db, { guid: 'b1111111-2222-3333-4444-555555555555', workspaceId: 'ws-live', role: 'member' });
      seedMapping(db, { guid: 'c1111111-2222-3333-4444-555555555555', workspaceId: 'ws-never-existed', role: 'member' });
      db.prepare('update workspaces set archived = 1 where id = ?').run('ws-dead');
    });
    const { callback } = await runFlow(server, {
      sub: 'sub-deadws',
      email: 'deadws@example.com',
      email_verified: true,
      groups: ['a1111111-2222-3333-4444-555555555555', 'b1111111-2222-3333-4444-555555555555', 'c1111111-2222-3333-4444-555555555555'],
    }, 'code-deadws');
    assert.equal(callback.location, '/', 'dead targets never fail the login');
    const out = server.output();
    assert.ok(out.includes('sso group grant skipped — workspace missing or archived'), 'fixed self-describing skip line present');
    assert.ok(!/a1111111|c1111111|deadws@example/.test(out.slice(out.indexOf('workspace missing or archived'))), 'no GUID or email in the skip line');
    withDb(server.dbPath, db => {
      const uid = db.prepare('select id from users where email = ?').get('deadws@example.com').id;
      const rows = db.prepare('select * from memberships where user_id = ?').all(uid);
      assert.equal(rows.length, 1, 'only the live workspace was granted');
      assert.equal(rows[0].workspace_id, 'ws-live');
      assert.equal(db.prepare("select count(*) as n from security_log where user_id = ? and verb = 'sso_group_grant'").get(uid).n, 1, 'one grant verb — skips log nothing to security_log');
    });
  } finally {
    await server.stop();
  }
});

/* GW-03 (success criterion 2): DP-4 is structural — the signup door returns
   BEFORE identity resolution, so a domain-refused email can never be
   provisioned, mapped or not. Pinned e2e. */
test('DP-4 pin: mapped group + domain-refused email → generic error redirect, zero provisioning (GW-03)', async () => {
  const server = await startServer({ env: { ...oidcEnv(), ALLOW_SIGNUP_DOMAINS: 'allowed.com' } });
  try {
    withDb(server.dbPath, db => {
      seedWorkspace(db, { id: 'ws-dp4', slug: 'dp4ws', name: 'DP4 WS' });
      seedMapping(db, { guid: 'd1111111-2222-3333-4444-555555555555', workspaceId: 'ws-dp4', role: 'member' });
    });
    const { callback } = await runFlow(server, {
      sub: 'sub-dp4',
      email: 'refused@blocked.org',
      email_verified: true,
      groups: ['d1111111-2222-3333-4444-555555555555'],
    }, 'code-dp4');
    assert.equal(callback.location, '/login?sso=error', 'the ONE generic refusal surface — no new params');
    assert.ok(!sessionCookieOf(callback.cookies), 'no session minted');
    withDb(server.dbPath, db => {
      assert.equal(db.prepare('select count(*) as n from users where email = ?').get('refused@blocked.org').n, 0, 'no users row');
      assert.equal(db.prepare('select count(*) as n from oidc_identities where subject = ?').get('sub-dp4').n, 0, 'no identity row');
      assert.equal(db.prepare('select count(*) as n from memberships m join users u on u.id = m.user_id where u.email = ?').get('refused@blocked.org').n, 0, 'no membership row — the door precedes the grant block');
    });
  } finally {
    await server.stop();
  }
});

/* Success criterion 5 regression pin: groups claim present but no mapping
   match → byte-identical to pre-milestone: same redirect, sso_login verb,
   zero group verbs, zero writes. */
test('regression pin: mapped-shape claim with no matching mapping is byte-identical (criterion 5)', async () => {
  const server = await startServer({ env: oidcEnv() });
  try {
    const { callback } = await runFlow(server, { sub: 'sub-reg', email: 'regression@example.com', email_verified: true, groups: ['e1111111-2222-3333-4444-555555555555'] }, 'code-reg');
    assert.equal(callback.location, '/', 'same redirect as pre-milestone');
    assert.ok(sessionCookieOf(callback.cookies), 'session minted as usual');
    withDb(server.dbPath, db => {
      const uid = db.prepare('select id from users where email = ?').get('regression@example.com').id;
      assert.equal(db.prepare("select count(*) as n from security_log where user_id = ? and verb = 'sso_login'").get(uid).n, 1, 'sso_login fires as today');
      assert.equal(db.prepare("select count(*) as n from security_log where user_id = ? and verb like 'sso_group%'").get(uid).n, 0, 'zero group verbs');
      assert.equal(db.prepare('select count(*) as n from memberships where user_id = ?').get(uid).n, 0);
    });
  } finally {
    await server.stop();
  }
});

/* D-81-11 fail-closed pin: a grant-path throw lands on the ONE generic
   /login?sso=error redirect — no session, no partial membership row, no new
   redirect params — and a healthy retry with the same mapping succeeds.
   Fault mechanism: a SQLite trigger that aborts the group-provenance
   membership insert; the test drops it between attempts so the retry is
   clean. */
test('grant-path throw lands on /login?sso=error with no session and no partial writes; retry succeeds (D-81-11)', async () => {
  const server = await startServer({ env: oidcEnv() });
  try {
    withDb(server.dbPath, db => {
      seedWorkspace(db, { id: 'ws-fault', slug: 'faultws', name: 'Fault WS' });
      seedMapping(db, { guid: 'f1111111-2222-3333-4444-555555555555', workspaceId: 'ws-fault', role: 'member' });
      db.prepare(
        "create trigger groups_fault before insert on memberships when new.provenance like 'group:%' and new.workspace_id = 'ws-fault' begin select raise(abort, 'fault'); end",
      ).run();
    });
    const claims = { sub: 'sub-fault', email: 'fault@example.com', email_verified: true, groups: ['f1111111-2222-3333-4444-555555555555'] };
    const failed = await runFlow(server, claims, 'code-fault-1');
    assert.equal(failed.callback.location, '/login?sso=error', 'the throw funnels to the ONE generic surface');
    assert.ok(!sessionCookieOf(failed.callback.cookies), 'no session cookie minted');
    withDb(server.dbPath, db => {
      const uid = db.prepare('select id from users where email = ?').get('fault@example.com').id;
      assert.equal(db.prepare('select count(*) as n from memberships where user_id = ?').get(uid).n, 0, 'no partial membership row');
    });
    // Remove the fault, retry with the same mapping — succeeds (retryability).
    withDb(server.dbPath, db => db.prepare('drop trigger groups_fault').run());
    const retry = await runFlow(server, claims, 'code-fault-2');
    assert.equal(retry.callback.location, '/', 'healthy retry lands on /');
    assert.ok(sessionCookieOf(retry.callback.cookies), 'retry mints a session');
    withDb(server.dbPath, db => {
      const uid = db.prepare('select id from users where email = ?').get('fault@example.com').id;
      const row = db.prepare('select * from memberships where user_id = ?').get(uid);
      assert.equal(row.role, 'member');
      assert.equal(row.provenance, 'group:f1111111-2222-3333-4444-555555555555');
    });
  } finally {
    await server.stop();
  }
});

/* ------------------------------ tests ------------------------------ */

/* Phase 82 Task 1 (GS-01, D-82-10): the lost-claim delete path. First login
   grants via the live mapping; the mapping row is deleted; the second login's
   groups claim no longer contains the GUID → exactly the group:<guid> row is
   removed (route-shaped tx), while a separately seeded manual row in another
   workspace survives untouched — provenance is the selection key. */
test('lost-claim login removes ONLY the group:<guid> row — manual rows immune (GS-01)', async () => {
  const server = await startServer({ env: oidcEnv() });
  try {
    withDb(server.dbPath, db => {
      seedWorkspace(db, { id: 'ws-loss', slug: 'lossws', name: 'Loss WS' });
      seedWorkspace(db, { id: 'ws-keep', slug: 'keepws', name: 'Keep WS' });
      seedMapping(db, { guid: '32111111-2222-3333-4444-555555555555', workspaceId: 'ws-loss', role: 'member' });
    });
    const claims1 = { sub: 'sub-loss', email: 'loss@example.com', email_verified: true, groups: ['32111111-2222-3333-4444-555555555555'] };
    const first = await runFlow(server, claims1, 'code-loss-1');
    assert.equal(first.callback.location, '/');
    assert.ok(sessionCookieOf(first.callback.cookies), 'login 1 minted a session');
    // Seed the immune manual row AFTER login 1 (the user row must exist).
    withDb(server.dbPath, db => {
      const uid = db.prepare('select id from users where email = ?').get('loss@example.com').id;
      db.prepare("insert into memberships (workspace_id, user_id, role, member_id, team, scope, provenance) values ('ws-keep', ?, 'admin', ?, null, null, 'manual')").run(uid, `m_${uid}`);
    });
    // The mapping is deleted between logins; the claim no longer carries the GUID.
    withDb(server.dbPath, db => db.prepare('delete from group_mappings where group_guid = ?').run('32111111-2222-3333-4444-555555555555'));
    const second = await runFlow(server, { sub: 'sub-loss', email: 'loss@example.com', email_verified: true, groups: ['99999999-8888-7777-6666-555555555555'] }, 'code-loss-2');
    assert.equal(second.callback.location, '/', 'the lost-claim login still succeeds');
    assert.ok(sessionCookieOf(second.callback.cookies), 'login 2 minted a session');
    withDb(server.dbPath, db => {
      const uid = db.prepare('select id from users where email = ?').get('loss@example.com').id;
      const rows = db.prepare('select * from memberships where user_id = ?').all(uid);
      assert.equal(rows.length, 1, 'exactly the group-derived row was removed');
      assert.equal(rows[0].workspace_id, 'ws-keep', 'the surviving row is the manual one');
      assert.equal(rows[0].role, 'admin');
      assert.equal(rows[0].provenance, 'manual');
      assert.equal(db.prepare('select count(*) as n from team_members where workspace_id = ? and user_id = ?').get('ws-loss', uid).n, 0, 'team authority rows purged with the membership');
      const audits = db.prepare("select * from audit_log where actor_id = ? and action like 'group_membership_removed%'").all(uid);
      assert.equal(audits.length, 1, 'exactly one removal audit row');
      assert.equal(audits[0].action, 'group_membership_removed:group:32111111-2222-3333-4444-555555555555:lost-claim');
      assert.equal(audits[0].workspace_id, 'ws-loss');
      assert.equal(audits[0].target_id, uid, 'target = the removed user');
    });
  } finally {
    await server.stop();
  }
});

/* Phase 81 Task 1 (D-81-2/D-81-3/D-81-5): upgrade-only re-assert. A viewer row
   (provenance invite, seeded through the real DP-5 auto-accept on an unmapped
   first login) is upgraded to the mapped member role on the second login —
   provenance keeps its ORIGINAL invite origin (D-81-7), and the verb is
   sso_group_role_change, not sso_group_grant. */
test('viewer row is upgraded to the mapped role — provenance origin preserved, role_change verb (D-81-2/D-81-3/D-81-7)', async () => {
  const server = await startServer({ env: oidcEnv() });
  try {
    withDb(server.dbPath, db => seedWorkspace(db, { id: 'ws-viewer-up', slug: 'viewerup', name: 'Viewer Up WS' }));
    // Login 1 — unmapped JIT login (no invite pending; viewer invites are
    // guests needing a project). The viewer ROW is seeded directly with
    // invite provenance — origin preservation is a conflict-clause
    // property, independent of how the row was created.
    const first = await runFlow(server, { sub: 'sub-viewer-up', email: 'viewer-up@example.com', email_verified: true }, 'code-viewer-up-1');
    assert.equal(first.callback.location, '/');
    withDb(server.dbPath, db => {
      const uid = db.prepare('select id from users where email = ?').get('viewer-up@example.com').id;
      db.prepare("insert into memberships (workspace_id, user_id, role, member_id, team, scope, provenance) values (?, ?, 'viewer', ?, null, null, 'invite')").run('ws-viewer-up', uid, `m_${uid}`);
    });
    // Login 2 — mapped: viewer (0) < member (1) → upgrade, origin preserved.
    withDb(server.dbPath, db => seedMapping(db, { guid: '21111111-2222-3333-4444-555555555555', workspaceId: 'ws-viewer-up', role: 'member' }));
    const second = await runFlow(server, { sub: 'sub-viewer-up', email: 'viewer-up@example.com', email_verified: true, groups: ['21111111-2222-3333-4444-555555555555'] }, 'code-viewer-up-2');
    assert.equal(second.callback.location, '/');
    withDb(server.dbPath, db => {
      const uid = db.prepare('select id from users where email = ?').get('viewer-up@example.com').id;
      const row = db.prepare('select * from memberships where user_id = ?').get(uid);
      assert.equal(row.role, 'member', 'the viewer row was upgraded to the mapped role');
      assert.equal(row.provenance, 'invite', 'provenance keeps the ORIGINAL creation origin (D-81-7 — conflict-update never touches it)');
      const verbs = db.prepare("select verb from security_log where user_id = ? and verb like 'sso_group%'").all(uid).map(r => r.verb);
      assert.deepEqual(verbs.sort(), ['sso_group_role_change'], 'exactly one role_change verb (login 2 — login 1 was unmapped, no group verbs)');
    });
  } finally {
    await server.stop();
  }
});

/* D-81-2/D-81-5: a same-role mapped re-login is a NO-OP — no membership write,
   no new sso_group% security verb, no audit row. */
test('same-role mapped re-login writes nothing — changes-only holds (D-81-2/D-81-5)', async () => {
  const server = await startServer({ env: oidcEnv() });
  try {
    withDb(server.dbPath, db => {
      seedWorkspace(db, { id: 'ws-same', slug: 'samews', name: 'Same WS' });
      seedMapping(db, { guid: '31111111-2222-3333-4444-555555555555', workspaceId: 'ws-same', role: 'member' });
    });
    const claims = { sub: 'sub-same-role', email: 'same-role@example.com', email_verified: true, groups: ['31111111-2222-3333-4444-555555555555'] };
    const first = await runFlow(server, claims, 'code-same-1');
    assert.equal(first.callback.location, '/');
    withDb(server.dbPath, db => {
      const uid = db.prepare('select id from users where email = ?').get('same-role@example.com').id;
      const before = db.prepare('select * from memberships where user_id = ?').all(uid);
      const secBefore = db.prepare("select count(*) as n from security_log where user_id = ? and verb like 'sso_group%'").get(uid).n;
      const auditBefore = db.prepare('select count(*) as n from audit_log').get().n;
      assert.equal(secBefore, 1, 'login 1 logged exactly one sso_group_grant');
      // Login 2 — same role: skip, zero writes anywhere.
      return { before, secBefore, auditBefore, uid };
    });
    const second = await runFlow(server, claims, 'code-same-2');
    assert.equal(second.callback.location, '/');
    withDb(server.dbPath, db => {
      const uid = db.prepare('select id from users where email = ?').get('same-role@example.com').id;
      const rows = db.prepare('select * from memberships where user_id = ?').all(uid);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].role, 'member');
      assert.equal(rows[0].provenance, 'group:31111111-2222-3333-4444-555555555555');
      assert.equal(db.prepare("select count(*) as n from security_log where user_id = ? and verb like 'sso_group%'").get(uid).n, 1, 're-login added ZERO group verbs');
      assert.equal(db.prepare("select count(*) as n from security_log where user_id = ? and verb = 'sso_login'").get(uid).n, 2, 'sso_login still fires (D-81-5)');
      assert.equal(db.prepare("select count(*) as n from audit_log where actor_id = ?").get(uid).n, 0, 'no audit rows for a no-op login');
    });
  } finally {
    await server.stop();
  }
});

/* D-81-2: a LOWER mapped role never overwrites a higher existing row (owner
   + mapped member → untouched, no logs). */
test('lower mapped role does not overwrite a higher existing row (D-81-2)', async () => {
  const server = await startServer({ env: oidcEnv() });
  try {
    withDb(server.dbPath, db => {
      seedWorkspace(db, { id: 'ws-owner', slug: 'ownerws', name: 'Owner WS' });
      seedMapping(db, { guid: '41111111-2222-3333-4444-555555555555', workspaceId: 'ws-owner', role: 'member' });
    });
    // JIT-create the user with an unmapped login first.
    const first = await runFlow(server, { sub: 'sub-owner-hold', email: 'owner-hold@example.com', email_verified: true }, 'code-owner-1');
    assert.equal(first.callback.location, '/');
    withDb(server.dbPath, db => {
      const uid = db.prepare('select id from users where email = ?').get('owner-hold@example.com').id;
      db.prepare("insert into memberships (workspace_id, user_id, role, member_id, team, scope, provenance) values ('ws-owner', ?, 'owner', ?, null, null, 'manual')").run(uid, `m_${uid}`);
    });
    const second = await runFlow(server, { sub: 'sub-owner-hold', email: 'owner-hold@example.com', email_verified: true, groups: ['41111111-2222-3333-4444-555555555555'] }, 'code-owner-2');
    assert.equal(second.callback.location, '/');
    withDb(server.dbPath, db => {
      const uid = db.prepare('select id from users where email = ?').get('owner-hold@example.com').id;
      const row = db.prepare('select * from memberships where user_id = ?').get(uid);
      assert.equal(row.role, 'owner', 'the owner row was NOT downgraded');
      assert.equal(row.provenance, 'manual');
      assert.equal(db.prepare("select count(*) as n from security_log where user_id = ? and verb like 'sso_group%'").get(uid).n, 0, 'no group verbs on a skipped grant');
    });
  } finally {
    await server.stop();
  }
});

/* Edge probes (specless coverage): multiple mapped workspaces grant each;
   two roles on ONE workspace → resolve() highest wins regardless of claim
   GUID order (D-82-1); grant with no teams touches no team_members row. */
test('edge probes: two workspaces, highest-role-wins order-stable, no team writes', async () => {
  for (const order of [['61111111-2222-3333-4444-555555555555', '51111111-2222-3333-4444-555555555555'], ['51111111-2222-3333-4444-555555555555', '61111111-2222-3333-4444-555555555555']]) {
    const server = await startServer({ env: oidcEnv() });
    try {
      withDb(server.dbPath, db => {
        seedWorkspace(db, { id: 'ws-hi', slug: 'hiws', name: 'Hi WS' });
        seedMapping(db, { guid: '51111111-2222-3333-4444-555555555555', workspaceId: 'ws-hi', role: 'member' });
        seedMapping(db, { guid: '61111111-2222-3333-4444-555555555555', workspaceId: 'ws-hi', role: 'owner' });
        seedWorkspace(db, { id: 'ws-other', slug: 'otherws', name: 'Other WS' });
        seedMapping(db, { guid: '71111111-2222-3333-4444-555555555555', workspaceId: 'ws-other', role: 'admin' });
      });
      const email = `edge-${order[0].slice(0, 2)}@example.com`;
      const { callback } = await runFlow(server, { sub: `sub-edge-${order[0].slice(0, 2)}`, email, email_verified: true, groups: [...order, '71111111-2222-3333-4444-555555555555'] }, `code-edge-${order[0].slice(0, 2)}`);
      assert.equal(callback.location, '/');
      withDb(server.dbPath, db => {
        const uid = db.prepare('select id from users where email = ?').get(email).id;
        const rows = db.prepare('select * from memberships where user_id = ? order by workspace_id').all(uid);
        assert.equal(rows.length, 2, 'both mapped workspaces granted');
        const hi = rows.find(r => r.workspace_id === 'ws-hi');
        const other = rows.find(r => r.workspace_id === 'ws-other');
        assert.equal(hi.role, 'owner', 'highest mapped role wins (D-82-1)');
        assert.equal(other.role, 'admin');
        assert.equal(db.prepare("select count(*) as n from security_log where user_id = ? and verb = 'sso_group_grant'").get(uid).n, 2, 'one grant verb per fresh grant');
        assert.equal(db.prepare('select count(*) as n from team_members where user_id = ?').get(uid).n, 0, 'no-teams grant writes zero team_members rows');
      });
    } finally {
      await server.stop();
    }
  }
});

test('tracer: a mapped groups claim grants membership end-to-end with provenance group:<guid> (GW-01/GW-03, D-81-9)', async () => {
  const server = await startServer({ env: oidcEnv() });
  try {
    withDb(server.dbPath, db => {
      seedWorkspace(db, { id: 'ws-grant', slug: 'grantws', name: 'Grant WS' });
      seedMapping(db, { guid: '11111111-2222-3333-4444-555555555555', workspaceId: 'ws-grant', role: 'member' });
    });

    const { callback } = await runFlow(server, {
      sub: 'sub-grant-tracer',
      email: 'tracer@example.com',
      email_verified: true,
      groups: ['11111111-2222-3333-4444-555555555555'],
    });
    if (callback.location !== '/') console.log('SERVER OUT:', server.output());
    assert.equal(callback.status, 302);
    assert.equal(callback.location, '/', 'the mapped login lands on the SPA root');
    const sessionCookie = sessionCookieOf(callback.cookies);
    assert.ok(sessionCookie, 'the callback minted a session cookie');

    withDb(server.dbPath, db => {
      const user = db.prepare('select * from users where email = ?').get('tracer@example.com');
      assert.ok(user, 'the JIT account exists');
      const rows = db.prepare('select * from memberships where user_id = ?').all(user.id);
      assert.equal(rows.length, 1, 'exactly one membership row');
      assert.equal(rows[0].workspace_id, 'ws-grant');
      assert.equal(rows[0].role, 'member', 'the mapped role was applied');
      assert.equal(rows[0].provenance, 'group:11111111-2222-3333-4444-555555555555', 'provenance carries the group origin');
    });

    /* D-81-9: grants commit before the session mint — /api/auth/me reflects
       the granted membership with no client changes. */
    const me = await fetch(`${server.base}/api/auth/me`, { headers: { cookie: sessionCookie } });
    assert.equal(me.status, 200);
    const body = await me.json();
    const granted = (body.user?.workspaces || []).find(w => w.id === 'ws-grant' || w.slug === 'grantws');
    assert.ok(granted, 'the granted workspace appears in the session payload');
    assert.equal(granted.role, 'member');
  } finally {
    await server.stop();
  }
});
