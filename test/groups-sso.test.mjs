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

function seedMapping(db, { guid, workspaceId, role = 'member', kind = 'workspace', teamId = null }) {
  const t = Date.now();
  db.prepare('insert into group_mappings (id, group_guid, workspace_id, role, kind, team_id, created_at, updated_at) values (?,?,?,?,?,?,?,?)').run(
    `gm_${guid.slice(0, 8)}_${workspaceId}`,
    guid,
    workspaceId,
    role,
    kind,
    teamId,
    t,
    t,
  );
}

/* Phase 106 fixture: a workspace whose doc defines teams[] (the doc is the
   team whitelist — D-02). */
function seedWorkspaceWithTeams(db, { id, slug, name, teams }) {
  const t = Date.now();
  db.prepare('insert into workspaces (id, slug, name, doc, created_at, updated_at) values (?,?,?,?,?,?)').run(id, slug, name, JSON.stringify({ data: { teams } }), t, t);
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
      assert.equal(db.prepare("select count(*) as n from audit_log where actor_id = ? and action like 'group_%'").get(uid).n, 0, 'zero delta audit rows (D-82-11 migration of the sso_group% verb pin)');
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
      /* D-82-11 migration (was: one sso_group_grant verb — skips log nothing
         to security_log): the grant is now an encoded audit row and each skip
         carries its own skip row (archived-workspace / dead-workspace). */
      const audits = db.prepare('select * from audit_log where actor_id = ? order by action').all(uid);
      assert.deepEqual(audits.map(a => a.action), [
        'group_granted:group:b1111111-2222-3333-4444-555555555555',
        'group_membership_skipped:group:a1111111-2222-3333-4444-555555555555:archived-workspace',
        'group_membership_skipped:group:c1111111-2222-3333-4444-555555555555:dead-workspace',
      ]);
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
      assert.equal(db.prepare("select count(*) as n from audit_log where actor_id = ? and action like 'group_%'").get(uid).n, 0, 'zero group delta rows (D-82-11 migration of the sso_group% verb pin)');
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

/* Phase 82 Plan 02 Task 3 (D-82-10 byte-identical regression gate): a user
   with NO group-derived rows and NO pending grants completes a mapped-shape
   login (groups claim present, matching nothing they hold rows in) → ZERO
   membership writes, ZERO group_% delta rows, ZERO security_log rows beyond
   sso_login — the reconcile is byte-identical for the unmapped shape. */
test('byte-identical gate: no group rows + no pending grants → zero writes, zero delta rows beyond sso_login (D-82-10)', async () => {
  const server = await startServer({ env: oidcEnv() });
  try {
    const { callback } = await runFlow(server, { sub: 'sub-byte-id', email: 'byteid@example.com', email_verified: true, groups: ['33111111-2222-3333-4444-555555555555'] }, 'code-byteid');
    assert.equal(callback.location, '/', 'the mapped-shape login lands on /');
    assert.ok(sessionCookieOf(callback.cookies), 'a session is minted as usual');
    withDb(server.dbPath, db => {
      const uid = db.prepare('select id from users where email = ?').get('byteid@example.com').id;
      assert.equal(db.prepare('select count(*) as n from memberships where user_id = ?').get(uid).n, 0, 'ZERO membership writes');
      assert.equal(db.prepare("select count(*) as n from audit_log where actor_id = ? and action like 'group_%'").get(uid).n, 0, 'ZERO group_% delta rows');
      assert.equal(db.prepare("select count(*) as n from security_log where user_id = ? and verb != 'sso_login'").get(uid).n, 0, 'ZERO security_log rows beyond sso_login');
      assert.equal(db.prepare("select count(*) as n from security_log where user_id = ? and verb = 'sso_login'").get(uid).n, 1, 'sso_login fires exactly once');
    });
  } finally {
    await server.stop();
  }
});

/* Phase 82 Plan 02 Task 3 step 2 (D-81-5 extended to the reconcile): a user
   whose group row exactly matches the mapped role re-logs → zero writes,
   zero delta audit rows. */
test('no-op re-login pin: group row exactly matching the mapped role writes nothing on re-login (D-81-5 extended)', async () => {
  const server = await startServer({ env: oidcEnv() });
  try {
    withDb(server.dbPath, db => {
      seedWorkspace(db, { id: 'ws-noop', slug: 'noopws', name: 'Noop WS' });
      seedMapping(db, { guid: '34111111-2222-3333-4444-555555555555', workspaceId: 'ws-noop', role: 'admin' });
    });
    const claims = { sub: 'sub-noop', email: 'noop@example.com', email_verified: true, groups: ['34111111-2222-3333-4444-555555555555'] };
    const first = await runFlow(server, claims, 'code-noop-1');
    assert.equal(first.callback.location, '/');
    const second = await runFlow(server, claims, 'code-noop-2');
    assert.equal(second.callback.location, '/');
    withDb(server.dbPath, db => {
      const uid = db.prepare('select id from users where email = ?').get('noop@example.com').id;
      const rows = db.prepare('select * from memberships where user_id = ?').all(uid);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].role, 'admin');
      assert.equal(rows[0].provenance, 'group:34111111-2222-3333-4444-555555555555');
      const audits = db.prepare("select action from audit_log where actor_id = ? and action like 'group_%'").all(uid).map(r => r.action);
      assert.deepEqual(audits, ['group_granted:group:34111111-2222-3333-4444-555555555555'], 'exactly login 1’s grant row — the re-login added ZERO delta rows');
    });
  } finally {
    await server.stop();
  }
});

/* Phase 106 Plan 01 Task 1 (TEAM-02/03/05, Option A): the team sync cell —
   a team-bearing mapping grants BOTH the workspace role AND a team_members
   row stamped provenance `group:<guid>` at sign-in. */
test('team-bearing mapping grants the team row with group:<guid> provenance alongside the role (TEAM-02/03)', async () => {
  const server = await startServer({ env: oidcEnv() });
  try {
    withDb(server.dbPath, db => {
      seedWorkspaceWithTeams(db, { id: 'ws-team1', slug: 'team1ws', name: 'Team1 WS', teams: [{ id: 'team-a', name: 'A' }] });
      seedMapping(db, { guid: '91111111-2222-3333-4444-555555555555', workspaceId: 'ws-team1', role: 'member', teamId: 'team-a' });
    });
    const { callback } = await runFlow(server, { sub: 'sub-team1', email: 'team1@example.com', email_verified: true, groups: ['91111111-2222-3333-4444-555555555555'] }, 'code-team1');
    assert.equal(callback.location, '/');
    withDb(server.dbPath, db => {
      const uid = db.prepare('select id from users where email = ?').get('team1@example.com').id;
      const mem = db.prepare('select * from memberships where workspace_id = ?').get('ws-team1');
      assert.equal(mem.role, 'member', 'the workspace role still grants');
      assert.equal(mem.provenance, 'group:91111111-2222-3333-4444-555555555555');
      const team = db.prepare('select * from team_members where workspace_id = ? and user_id = ?').get('ws-team1', uid);
      assert.ok(team, 'a team_members row landed');
      assert.equal(team.team_id, 'team-a');
      assert.equal(team.provenance, 'group:91111111-2222-3333-4444-555555555555', 'provenance stamped group:<guid>');
      assert.ok(team.member_id, 'member_id carried');
      const audits = db.prepare("select action from audit_log where actor_id = ? and action like 'group_%'").all(uid).map(r => r.action);
      assert.ok(audits.includes('group_team_granted:group:91111111-2222-3333-4444-555555555555'), 'the distinct group_team_granted delta row landed (TEAM-06)');
    });
  } finally {
    await server.stop();
  }
});

/* Phase 106 Plan 01 Task 1 (changes-only, research §4): an immediate re-login
   with UNCHANGED mappings performs ZERO additional writes — the changes-only
   WHERE guard on the sync-cell upsert is what keeps this green. */
test('team-bearing re-login with unchanged mappings writes nothing (changes-only)', async () => {
  const server = await startServer({ env: oidcEnv() });
  try {
    withDb(server.dbPath, db => {
      seedWorkspaceWithTeams(db, { id: 'ws-team2', slug: 'team2ws', name: 'Team2 WS', teams: [{ id: 'team-a', name: 'A' }] });
      seedMapping(db, { guid: '92111111-2222-3333-4444-555555555555', workspaceId: 'ws-team2', role: 'member', teamId: 'team-a' });
    });
    const claims = { sub: 'sub-team2', email: 'team2@example.com', email_verified: true, groups: ['92111111-2222-3333-4444-555555555555'] };
    const first = await runFlow(server, claims, 'code-team2-1');
    assert.equal(first.callback.location, '/');
    const second = await runFlow(server, claims, 'code-team2-2');
    assert.equal(second.callback.location, '/');
    withDb(server.dbPath, db => {
      const uid = db.prepare('select id from users where email = ?').get('team2@example.com').id;
      const audits = db.prepare("select action from audit_log where actor_id = ? and action like 'group_%'").all(uid).map(r => r.action).sort();
      assert.deepEqual(audits, ['group_granted:group:92111111-2222-3333-4444-555555555555', 'group_team_granted:group:92111111-2222-3333-4444-555555555555'], 'exactly login 1’s role + team rows — the re-login added ZERO delta rows');
      assert.equal(db.prepare('select count(*) as n from team_members where workspace_id = ? and user_id = ?').get('ws-team2', uid).n, 1, 'exactly one team row — no duplicate from the re-login');
    });
  } finally {
    await server.stop();
  }
});

/* Phase 106 Plan 01 Task 1 (TEAM-05 ruling, supersedes milestone §3a): a
   NON-winner mapping's team is still granted — the sync cell keys off RAW
   mappings, not the resolve() winners. */
test('non-winner mapping still grants its team (TEAM-05)', async () => {
  const server = await startServer({ env: oidcEnv() });
  try {
    withDb(server.dbPath, db => {
      seedWorkspaceWithTeams(db, {
        id: 'ws-team3',
        slug: 'team3ws',
        name: 'Team3 WS',
        teams: [{ id: 'team-a', name: 'A' }, { id: 'team-b', name: 'B' }],
      });
      seedMapping(db, { guid: '93111111-2222-3333-4444-555555555555', workspaceId: 'ws-team3', role: 'admin', teamId: 'team-a' });
      seedMapping(db, { guid: '94111111-2222-3333-4444-555555555555', workspaceId: 'ws-team3', role: 'member', teamId: 'team-b' });
    });
    const { callback } = await runFlow(server, {
      sub: 'sub-team3',
      email: 'team3@example.com',
      email_verified: true,
      groups: ['93111111-2222-3333-4444-555555555555', '94111111-2222-3333-4444-555555555555'],
    }, 'code-team3');
    assert.equal(callback.location, '/');
    withDb(server.dbPath, db => {
      const uid = db.prepare('select id from users where email = ?').get('team3@example.com').id;
      const mem = db.prepare('select * from memberships where workspace_id = ?').get('ws-team3');
      assert.equal(mem.role, 'admin', 'the winner’s role applies');
      const teams = db.prepare('select team_id, provenance from team_members where workspace_id = ? and user_id = ? order by team_id').all('ws-team3', uid);
      assert.deepEqual(teams.map(t => t.team_id), ['team-a', 'team-b'], 'the NON-winner mapping’s team was granted too (TEAM-05)');
      assert.equal(teams[1].provenance, 'group:94111111-2222-3333-4444-555555555555', 'each team row carries its own driving group');
    });
  } finally {
    await server.stop();
  }
});

/* Phase 82 Plan 02 Task 1 (GS-03, T-82-05): mapped-lower downgrades apply ONLY
   to group-derived rows; manual rows with the identical shape are immune.
   Part (a): group admin row + mapping lowered admin→member → downgraded with
   provenance re-stamped to the driving group and ONE mapped-lower audit row.
   Part (b): identical admin row with provenance 'manual' + same remap →
   row UNCHANGED, zero delta rows. */
test('mapped-lower downgrades a group-derived row with mapped-lower audit; identical manual row immune (GS-03)', async () => {
  const server = await startServer({ env: oidcEnv() });
  try {
    withDb(server.dbPath, db => {
      seedWorkspace(db, { id: 'ws-gs03', slug: 'gs03ws', name: 'GS03 WS' });
      seedWorkspace(db, { id: 'ws-gs03m', slug: 'gs03mws', name: 'GS03 Manual WS' });
      seedMapping(db, { guid: '72111111-2222-3333-4444-555555555555', workspaceId: 'ws-gs03', role: 'admin' });
    });
    // JIT-create the user with an unmapped login, then seed the two rows.
    const first = await runFlow(server, { sub: 'sub-gs03', email: 'gs03@example.com', email_verified: true }, 'code-gs03-1');
    assert.equal(first.callback.location, '/');
    withDb(server.dbPath, db => {
      const uid = db.prepare('select id from users where email = ?').get('gs03@example.com').id;
      db.prepare("insert into memberships (workspace_id, user_id, role, member_id, team, scope, provenance) values ('ws-gs03', ?, 'admin', ?, null, null, 'group:72111111-2222-3333-4444-555555555555')").run(uid, `m_${uid}`);
      db.prepare("insert into memberships (workspace_id, user_id, role, member_id, team, scope, provenance) values ('ws-gs03m', ?, 'admin', ?, null, null, 'manual')").run(uid, `m2_${uid}`);
    });
    // Login 1 — mapping matches: first login on ws-gs03 is mapped==existing
    // no-op (D-81-5); ws-gs03m has no mapping and a manual row → immune.
    const second = await runFlow(server, { sub: 'sub-gs03', email: 'gs03@example.com', email_verified: true, groups: ['72111111-2222-3333-4444-555555555555'] }, 'code-gs03-2');
    assert.equal(second.callback.location, '/');
    withDb(server.dbPath, db => {
      const uid = db.prepare('select id from users where email = ?').get('gs03@example.com').id;
      assert.equal(db.prepare("select count(*) as n from audit_log where actor_id = ? and action like 'group_%'").get(uid).n, 0, 'mapped==existing login wrote zero delta rows (D-81-5 no-op pin)');
    });
    // Remap admin→member, then login → the group row downgrades; manual immune.
    withDb(server.dbPath, db => db.prepare('update group_mappings set role = ? where group_guid = ?').run('member', '72111111-2222-3333-4444-555555555555'));
    const third = await runFlow(server, { sub: 'sub-gs03', email: 'gs03@example.com', email_verified: true, groups: ['72111111-2222-3333-4444-555555555555'] }, 'code-gs03-3');
    assert.equal(third.callback.location, '/');
    withDb(server.dbPath, db => {
      const uid = db.prepare('select id from users where email = ?').get('gs03@example.com').id;
      const g = db.prepare('select * from memberships where workspace_id = ?').get('ws-gs03');
      assert.equal(g.role, 'member', 'the group-derived row was downgraded');
      assert.equal(g.provenance, 'group:72111111-2222-3333-4444-555555555555', 'provenance follows the driving group (D-82-7 role-source)');
      const m = db.prepare('select * from memberships where workspace_id = ?').get('ws-gs03m');
      assert.equal(m.role, 'admin', 'the identical manual row was NOT downgraded (GS-03 immunity)');
      assert.equal(m.provenance, 'manual');
      const audits = db.prepare("select * from audit_log where actor_id = ? and action like 'group_%'").all(uid);
      assert.equal(audits.length, 1, 'exactly one delta audit row');
      assert.equal(audits[0].action, 'group_role_downgraded:group:72111111-2222-3333-4444-555555555555:mapped-lower');
      assert.equal(audits[0].workspace_id, 'ws-gs03');
      assert.equal(audits[0].target_id, uid);
    });
  } finally {
    await server.stop();
  }
});

/* Phase 82 Plan 02 Task 1 step 4 (GS-02 owner-downgrade arm, research A5):
   downgrading the SOLE owner removes the only owner — the guard arm routes
   through the SAME guardRefuse funnel as deletion: row intact, login proceeds,
   loud PII-free warn, guard-refused audit row. */
test('sole-owner downgrade refused: row intact, login proceeds, guard-refused audit row (GS-02 funnel arm)', async () => {
  const server = await startServer({ env: oidcEnv() });
  try {
    withDb(server.dbPath, db => {
      seedWorkspace(db, { id: 'ws-gs03o', slug: 'gs03ows', name: 'GS03 Owner WS' });
      seedMapping(db, { guid: '82111111-2222-3333-4444-555555555555', workspaceId: 'ws-gs03o', role: 'owner' });
    });
    // Login 1 — mapped claim grants the JIT user as OWNER (group provenance).
    const first = await runFlow(server, { sub: 'sub-gs03o', email: 'gs03o@example.com', email_verified: true, groups: ['82111111-2222-3333-4444-555555555555'] }, 'code-gs03o-1');
    assert.equal(first.callback.location, '/');
    // Remap owner→member; the user is now the SOLE owner with a lower mapping.
    withDb(server.dbPath, db => db.prepare('update group_mappings set role = ? where group_guid = ?').run('member', '82111111-2222-3333-4444-555555555555'));
    const second = await runFlow(server, { sub: 'sub-gs03o', email: 'gs03o@example.com', email_verified: true, groups: ['82111111-2222-3333-4444-555555555555'] }, 'code-gs03o-2');
    assert.equal(second.callback.location, '/', 'the refused downgrade login still lands on /');
    assert.ok(sessionCookieOf(second.callback.cookies), 'the refused login still mints a session');
    const out = server.output();
    assert.ok(out.includes('sso group removal refused — last workspace owner'), 'the same loud refusal line fires through the shared funnel');
    assert.ok(!/82111111|gs03o@example/.test(out.slice(out.indexOf('removal refused'))), 'no GUID or email in the refusal line (T-82-03)');
    withDb(server.dbPath, db => {
      const uid = db.prepare('select id from users where email = ?').get('gs03o@example.com').id;
      const row = db.prepare('select * from memberships where workspace_id = ?').get('ws-gs03o');
      assert.ok(row, 'the membership row is INTACT');
      assert.equal(row.role, 'owner', 'role untouched by the refused downgrade');
      assert.equal(row.provenance, 'group:82111111-2222-3333-4444-555555555555', 'provenance untouched');
      const audits = db.prepare("select * from audit_log where actor_id = ? and action like 'group_%:guard-refused'").all(uid);
      assert.equal(audits.length, 1, 'exactly one guard-refused audit row');
      assert.equal(audits[0].action, 'group_role_downgraded:group:82111111-2222-3333-4444-555555555555:guard-refused');
      assert.equal(audits[0].workspace_id, 'ws-gs03o');
    });
  } finally {
    await server.stop();
  }
});

/* Phase 82 Task 3 (SC5 / D-82-4): an overage login removes NOTHING and grants
   NOTHING — the whole reconcile lives inside the mapped else-branch, so a
   pre-seeded (claim-granted) group-derived row SURVIVES the overage login
   byte-identically, with the fixed overage warn and zero delta audit rows. */
test('overage login removes nothing and grants nothing — group row survives (SC5/D-82-4)', async () => {
  const server = await startServer({ env: oidcEnv() });
  try {
    withDb(server.dbPath, db => {
      seedWorkspace(db, { id: 'ws-sc5', slug: 'sc5ws', name: 'SC5 WS' });
      seedMapping(db, { guid: '52111111-2222-3333-4444-555555555555', workspaceId: 'ws-sc5', role: 'member' });
    });
    // Login 1 — mapped claim grants the group-derived row.
    const first = await runFlow(server, { sub: 'sub-sc5', email: 'sc5@example.com', email_verified: true, groups: ['52111111-2222-3333-4444-555555555555'] }, 'code-sc5-1');
    assert.equal(first.callback.location, '/');
    // Login 2 — _claim_names overage: treated as unmapped, whole pass skipped.
    const second = await runFlow(server, { sub: 'sub-sc5', email: 'sc5@example.com', email_verified: true, _claim_names: { groups: 'src1' } }, 'code-sc5-2');
    assert.equal(second.callback.location, '/', 'overage login proceeds as unmapped');
    const out = server.output();
    assert.ok(out.includes('sso groups claim overage — treating as unmapped'), 'the fixed overage warn is present');
    withDb(server.dbPath, db => {
      const uid = db.prepare('select id from users where email = ?').get('sc5@example.com').id;
      const row = db.prepare('select * from memberships where workspace_id = ?').get('ws-sc5');
      assert.ok(row, 'the group-derived row SURVIVES the overage login');
      assert.equal(row.role, 'member', 'role untouched by the overage login');
      assert.equal(row.provenance, 'group:52111111-2222-3333-4444-555555555555', 'provenance untouched');
      /* D-82-11 migration (was: 'no new group verbs after login 1'): login 1
         wrote its one group_granted delta row; the overage login adds NONE.
         Zero sso_group% verbs remain — the delta trail is audit_log only. */
      assert.equal(db.prepare("select count(*) as n from audit_log where actor_id = ? and action like 'group_%'").get(uid).n, 1, 'exactly login 1’s grant delta row — the overage login added zero');
      assert.equal(db.prepare("select count(*) as n from security_log where user_id = ? and verb like 'sso_group%'").get(uid).n, 0, 'zero sso_group% verbs remain (D-82-11)');
    });
  } finally {
    await server.stop();
  }
});

/* Phase 82 Task 2 (GS-02, D-82-8): sole-owner removal is refused
   count-before-write — the row survives INTACT, the login still succeeds and
   mints a session (skip-and-audit), ONE loud fixed logWarn with no GUID/email
   leakage (D-81-10 PII posture), and exactly one guard-refused audit row. */
test('sole-owner removal refused: row intact, login proceeds, loud PII-free warn, guard-refused audit row (GS-02)', async () => {
  const server = await startServer({ env: oidcEnv() });
  try {
    withDb(server.dbPath, db => {
      seedWorkspace(db, { id: 'ws-guard', slug: 'guardws', name: 'Guard WS' });
      seedMapping(db, { guid: '42111111-2222-3333-4444-555555555555', workspaceId: 'ws-guard', role: 'owner' });
    });
    // Login 1 — the mapping grants the JIT user as OWNER with group provenance.
    const first = await runFlow(server, { sub: 'sub-guard', email: 'guard@example.com', email_verified: true, groups: ['42111111-2222-3333-4444-555555555555'] }, 'code-guard-1');
    assert.equal(first.callback.location, '/');
    withDb(server.dbPath, db => {
      const row = db.prepare('select * from memberships where workspace_id = ?').get('ws-guard');
      assert.equal(row.role, 'owner');
      assert.equal(row.provenance, 'group:42111111-2222-3333-4444-555555555555');
    });
    // Login 2 — genuinely-empty groups list (still a reconcile-bearing claim
    // shape), the user is now the SOLE owner with no live mapping.
    const second = await runFlow(server, { sub: 'sub-guard', email: 'guard@example.com', email_verified: true, groups: [] }, 'code-guard-2');
    assert.equal(second.callback.location, '/', 'the refused login still lands on /');
    assert.ok(sessionCookieOf(second.callback.cookies), 'the refused login still mints a session (GS-02 skip-and-audit)');
    const out = server.output();
    assert.ok(out.includes('sso group removal refused — last workspace owner'), 'the fixed loud refusal line is present');
    assert.ok(!/42111111|guard@example/.test(out.slice(out.indexOf('removal refused'))), 'no GUID or email in the refusal line (T-82-03)');
    withDb(server.dbPath, db => {
      const uid = db.prepare('select id from users where email = ?').get('guard@example.com').id;
      const row = db.prepare('select * from memberships where workspace_id = ?').get('ws-guard');
      assert.ok(row, 'the membership row is INTACT');
      assert.equal(row.role, 'owner', 'role untouched');
      assert.equal(row.provenance, 'group:42111111-2222-3333-4444-555555555555', 'provenance untouched');
      const audits = db.prepare("select * from audit_log where actor_id = ? and action like 'group_%:guard-refused'").all(uid);
      assert.equal(audits.length, 1, 'exactly one guard-refused audit row');
      assert.equal(audits[0].action, 'group_membership_removed:group:42111111-2222-3333-4444-555555555555:guard-refused');
      assert.equal(audits[0].workspace_id, 'ws-guard');
    });
  } finally {
    await server.stop();
  }
});

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

/* Phase 81 Task 1 (D-81-2/D-81-3/D-81-5), updated by Phase 82 D-82-7: upgrade-
   only re-assert. A viewer row (provenance invite, seeded directly) is upgraded
   to the mapped member role on the second login — a GROUP writer owns the role
   it sets, so provenance FLIPS to group:<guid> (D-82-7 amends D-81-7), and the
   verb is sso_group_role_change, not sso_group_grant. */
test('viewer row is upgraded to the mapped role — group writer flips provenance to group:<guid> (D-81-2/D-81-3, D-82-7)', async () => {
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
      assert.equal(row.provenance, 'group:21111111-2222-3333-4444-555555555555', 'the GROUP writer owns the role it set — provenance flips to group:<guid> (D-82-7)');
      /* D-82-11 migration (was: sso_group_role_change verb pin): the upgrade
         is now an encoded audit_log row. */
      const audits = db.prepare("select * from audit_log where actor_id = ? and action like 'group_%'").all(uid);
      assert.equal(audits.length, 1, 'exactly one delta row (login 2 — login 1 was unmapped)');
      assert.equal(audits[0].action, 'group_role_upgraded:group:21111111-2222-3333-4444-555555555555');
      assert.equal(audits[0].target_id, uid, 'actor = target = the user (self-driven delta)');
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
      const grantedBefore = db.prepare("select count(*) as n from audit_log where actor_id = ? and action like 'group_%'").get(uid).n;
      assert.equal(grantedBefore, 1, 'login 1 wrote exactly one group_granted delta row');
      // Login 2 — same role: skip, zero writes anywhere.
      return { before, grantedBefore, uid };
    });
    const second = await runFlow(server, claims, 'code-same-2');
    assert.equal(second.callback.location, '/');
    withDb(server.dbPath, db => {
      const uid = db.prepare('select id from users where email = ?').get('same-role@example.com').id;
      const rows = db.prepare('select * from memberships where user_id = ?').all(uid);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].role, 'member');
      assert.equal(rows[0].provenance, 'group:31111111-2222-3333-4444-555555555555');
      assert.equal(db.prepare("select count(*) as n from audit_log where actor_id = ? and action like 'group_%'").get(uid).n, 1, 're-login added ZERO delta rows (D-82-11 migration of the group-verb pin)');
      assert.equal(db.prepare("select count(*) as n from security_log where user_id = ? and verb = 'sso_login'").get(uid).n, 2, 'sso_login still fires (D-81-5)');
      assert.equal(db.prepare("select count(*) as n from security_log where user_id = ? and verb like 'sso_group%'").get(uid).n, 0, 'zero sso_group% verbs remain — the delta trail is audit_log only');
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
      assert.equal(db.prepare("select count(*) as n from audit_log where actor_id = ? and action like 'group_%'").get(uid).n, 0, 'no delta rows on a skipped grant (D-82-11 migration of the group-verb pin)');
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
        /* D-82-11 migration (was: two sso_group_grant verbs): the reconcile
           applies ONE delta per workspace (D-82-10) — ws-hi gets one grant
           row carrying the HIGHEST mapped role's guid (owner, D-82-1),
           ws-other one row; the losing member mapping writes nothing. */
        const audits = db.prepare("select action from audit_log where actor_id = ? and action like 'group_granted:%'").all(uid).map(r => r.action).sort();
        assert.deepEqual(audits, [
          'group_granted:group:61111111-2222-3333-4444-555555555555',
          'group_granted:group:71111111-2222-3333-4444-555555555555',
        ], 'one grant delta row per workspace — highest-rank guid wins');
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
