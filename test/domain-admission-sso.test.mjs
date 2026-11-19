/* Domain admission SSO suite (Phase 76, D-12 contract). The two remaining
   doors of the Phase 75 door matrix wired into the SSO surface: DP-4 gates
   OIDC JIT provisioning by ALLOW_SIGNUP_DOMAINS (fresh-provision branch only,
   after the email_verified gate), DP-5 silently filters refused invites out
   of the SSO-07 reconciliation before its branching, and the boot log shows
   one combined five-door matrix line (D-11). All rows drive the REAL
   authorize → callback 302 flow through the shared fake IdP harness. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { idp, startMockIdp } from './helpers/oidc-idp.mjs';
import { inviteToken, login, signup, startServer, withDb } from './helpers/server.mjs';

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

/* One full start → authorize → callback flow against a per-test server.
   `claims` spread over the default token payload — every allow-flow row
   passes email_verified: true explicitly (G-30-1 fixture discipline). */
async function runFlow(srv, claims = {}, code = 'auth-code-1') {
  const start = await nav(srv.base, '/api/auth/oidc/start');
  assert.equal(start.status, 302);
  const q = queryOf(start.location);
  const flowCookie = flowCookieOf(start.cookies);
  idp.tokenConfig = { code, claims: { nonce: q.get('nonce'), ...claims } };
  const callback = await nav(srv.base, `/api/auth/oidc/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(q.get('state'))}`, flowCookie);
  return { start, callback, flowCookie, q };
}

const oidcEnv = () => ({ OIDC_ENABLED: 'true', OIDC_TENANT_ID: 't-1', OIDC_CLIENT_ID: 'cid', OIDC_CLIENT_SECRET: 'sec', OIDC_ISSUER_OVERRIDE: idp.issuer });

/* A direct users-row insert for the "existing account" side of the link
   policy (same shape as test/oidc-sso.test.mjs createExistingUser). */
function createExistingUser(db, email) {
  db.prepare('insert into users (id, email, name, password_hash, created_at) values (?,?,?,?,?)').run(
    `u_${email.replace(/[^a-z0-9]/gi, '_')}`,
    email,
    'Existing User',
    'not-a-real-scrypt-hash',
    Date.now(),
  );
}

/* ---------- DP-4: the SSO JIT-provisioning door (DOM-06, D-09) ---------- */

test('DP-4: an out-of-list SSO email is refused after email_verified — generic redirect, no session, no rows (SC1)', async () => {
  const server = await startServer({ env: { ...oidcEnv(), ALLOW_SIGNUP_DOMAINS: 'a.com' } });
  try {
    const { callback } = await runFlow(server, { sub: 'sub-dp4-out', email: 'outsider@b.com', email_verified: true });
    assert.equal(callback.status, 302);
    assert.equal(callback.location, '/login?sso=error', 'the refusal lands on the ONE generic error surface');
    /* Anti-oracle: no additional query param may reveal the policy. */
    assert.equal(new URL(callback.location, 'http://x').search, '?sso=error', 'no domain-revealing query param');
    assert.equal(sessionCookieOf(callback.cookies), null, 'no session minted');

    withDb(server.dbPath, db => {
      assert.equal(db.prepare('select count(*) as n from users where email = ?').get('outsider@b.com').n, 0, 'no users row');
      assert.equal(db.prepare('select count(*) as n from oidc_identities').get().n, 0, 'no oidc_identities row');
    });

    /* D-09 PII pin: the refusal log carries the domain only, never the local part. */
    const line = server.output().split('\n').find(l => l.includes('sso signup domain refused'));
    assert.ok(line, 'the DP-4 refusal log line is missing');
    assert.ok(line.includes('b.com'), `the refusal line must carry the domain, got: ${line}`);
    assert.ok(!line.includes('outsider'), `the refusal line must NEVER carry the email local part, got: ${line}`);
  } finally {
    await server.stop();
  }
});

test('DP-4: an in-list SSO email provisions normally — user + identity rows, lands on /', async () => {
  const server = await startServer({ env: { ...oidcEnv(), ALLOW_SIGNUP_DOMAINS: 'a.com' } });
  try {
    const { callback } = await runFlow(server, { sub: 'sub-dp4-in', email: 'insider@a.com', email_verified: true });
    assert.equal(callback.status, 302);
    assert.equal(callback.location, '/', 'provisioning lands on the SPA root like the existing JIT shape');
    assert.ok(sessionCookieOf(callback.cookies), 'a session was minted');

    withDb(server.dbPath, db => {
      const user = db.prepare('select * from users where email = ?').get('insider@a.com');
      assert.ok(user, 'the JIT bare account exists');
      const identity = db.prepare('select * from oidc_identities where user_id = ?').all(user.id);
      assert.equal(identity.length, 1, 'the oidc_identities row exists');
      assert.equal(identity[0].subject, 'sub-dp4-in');
    });
  } finally {
    await server.stop();
  }
});

test("DP-4: ALLOW_SIGNUP_DOMAINS='*' provisions every domain — wildcard handled inside the shared funnel (Pitfall 3)", async () => {
  const server = await startServer({ env: { ...oidcEnv(), ALLOW_SIGNUP_DOMAINS: '*' } });
  try {
    const { callback } = await runFlow(server, { sub: 'sub-dp4-wild', email: 'anyone@wild.example', email_verified: true });
    assert.equal(callback.status, 302);
    assert.equal(callback.location, '/', 'wildcard allow-all provisions like DP-1');
    withDb(server.dbPath, db => {
      assert.ok(db.prepare('select * from users where email = ?').get('anyone@wild.example'), 'the user row exists');
    });
  } finally {
    await server.stop();
  }
});

test('DP-4: unset ALLOW_SIGNUP_DOMAINS stays byte-identical fail-open (D-01 tri-state consumed as-is)', async () => {
  const server = await startServer({ env: { ...oidcEnv(), ALLOW_SIGNUP_DOMAINS: undefined, ALLOW_INVITE_DOMAINS: undefined } });
  try {
    const { callback } = await runFlow(server, { sub: 'sub-dp4-unset', email: 'anyone@unset.example', email_verified: true });
    assert.equal(callback.status, 302);
    assert.equal(callback.location, '/', 'door off → provisioning unchanged');
    withDb(server.dbPath, db => {
      assert.ok(db.prepare('select * from users where email = ?').get('anyone@unset.example'), 'the user row exists');
    });
  } finally {
    await server.stop();
  }
});

test('DP-4 placement guard: an EXISTING user with a verified email still LINKS with the list tightened — the gate is fresh-provision-only (Pitfall 1)', async () => {
  const server = await startServer({ env: { ...oidcEnv(), ALLOW_SIGNUP_DOMAINS: 'a.com' } });
  try {
    /* The account pre-dates the tightening: its domain is out-of-list. */
    withDb(server.dbPath, db => createExistingUser(db, 'legacy@b.com'));
    const { callback } = await runFlow(server, { sub: 'sub-dp4-link', email: 'legacy@b.com', email_verified: true });
    assert.equal(callback.status, 302);
    assert.equal(callback.location, '/', 'an existing verified-email account links — DP-4 never gates the link arm');
    assert.ok(sessionCookieOf(callback.cookies), 'a session was minted');

    withDb(server.dbPath, db => {
      const user = db.prepare('select * from users where email = ?').get('legacy@b.com');
      const identity = db.prepare('select * from oidc_identities where subject = ?').get('sub-dp4-link');
      assert.ok(identity, 'the identity row exists');
      assert.equal(identity.user_id, user.id, 'the identity links to the EXISTING account — no refusal, no second user');
    });
    assert.ok(!server.output().includes('sso signup domain refused'), 'no DP-4 refusal logged for the link path');
  } finally {
    await server.stop();
  }
});

/* ---------- DP-5: the SSO invite-reconciliation door (DOM-05/SC3, D-10) ---------- */

/* Owner login against the harness bootstrap account (same idiom as
   test/domain-admission.test.mjs ownerAndWs). */
const ownerAndWs = async base => {
  const owner = (await login(base, 'owner@test.local', 'owner-password-1')).client;
  const slug = (await owner.get('/api/workspaces')).data.workspaces[0].slug;
  return { owner, slug };
};

test('DP-5: a refused invite is silently filtered — normal login to /, invite NOT consumed (D-10, Pitfall 2)', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-dp5-'));
  /* Boot 1: both doors unset — the owner can invite the future SSO user. */
  let server = await startServer({ dataDir, env: { ...oidcEnv() } });
  try {
    const { owner, slug } = await ownerAndWs(server.base);
    const inv = await owner.post(`/api/workspaces/${slug}/invites`, { emails: ['x@x.com'], role: 'member' });
    assert.equal(inv.status, 201, `invite creation must succeed with the door off, got ${inv.status}: ${JSON.stringify(inv.data)}`);
  } finally {
    await server.stop();
  }
  /* Boot 2: the invite list is tightened — the pending invite no longer fits. */
  server = await startServer({ dataDir, env: { ...oidcEnv(), ALLOW_INVITE_DOMAINS: 'a.com' } });
  try {
    /* Fresh identity, zero memberships: JIT provisioning rides the signup
       door (unset here → fail-open), then SSO-07 reconciliation runs. */
    const { callback } = await runFlow(server, { sub: 'sub-dp5-refused', email: 'x@x.com', email_verified: true });
    assert.equal(callback.status, 302);
    assert.equal(callback.location, '/', 'D-10: a fully-filtered reconcile is a NORMAL login — no special redirect');
    assert.ok(sessionCookieOf(callback.cookies), 'the user IS signed in');
    withDb(server.dbPath, db => {
      const invite = db.prepare('select * from invites where email = ?').get('x@x.com');
      assert.ok(invite, 'the pending invite row exists');
      assert.equal(invite.used_at, null, 'Pitfall 2 non-consumption: the refused invite keeps used_at IS NULL');
    });
  } finally {
    await server.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('DP-5: loosening the list revives the refused invite — the next SSO login auto-accepts it', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-dp5-'));
  /* Boot 1: invite created with the door off. */
  let server = await startServer({ dataDir, env: { ...oidcEnv() } });
  try {
    const { owner, slug } = await ownerAndWs(server.base);
    const inv = await owner.post(`/api/workspaces/${slug}/invites`, { emails: ['revive@x.com'], role: 'member' });
    assert.equal(inv.status, 201);
  } finally {
    await server.stop();
  }
  /* Boot 2: tightened — refused-only reconcile, nothing consumed. */
  server = await startServer({ dataDir, env: { ...oidcEnv(), ALLOW_INVITE_DOMAINS: 'a.com' } });
  try {
    const { callback } = await runFlow(server, { sub: 'sub-dp5-revive', email: 'revive@x.com', email_verified: true });
    assert.equal(callback.location, '/', 'boot 2: the refused invite is filtered');
    withDb(server.dbPath, db => assert.equal(db.prepare('select used_at from invites where email = ?').get('revive@x.com').used_at, null));
  } finally {
    await server.stop();
  }
  /* Boot 3: loosened — the same invite revives and the single pending invite
     auto-accepts (the filter consumed NOTHING on boot 2). */
  server = await startServer({ dataDir, env: { ...oidcEnv() } });
  try {
    const { callback } = await runFlow(server, { sub: 'sub-dp5-revive', email: 'revive@x.com', email_verified: true });
    assert.equal(callback.status, 302);
    assert.equal(callback.location, '/', 'boot 3: the revived single invite auto-accepts');
    withDb(server.dbPath, db => {
      const user = db.prepare('select * from users where email = ?').get('revive@x.com');
      assert.equal(db.prepare('select count(*) as n from memberships where user_id = ?').get(user.id).n, 1, 'the membership was granted');
      assert.ok(db.prepare('select * from security_log where user_id = ? and verb = ?').get(user.id, 'sso_invite_accepted'), 'the sso_invite_accepted verb fired');
    });
  } finally {
    await server.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('DP-5: an in-list invite reconciles exactly as before — single invite auto-accepts', async () => {
  const server = await startServer({ env: { ...oidcEnv(), ALLOW_INVITE_DOMAINS: 'a.com' } });
  try {
    const { owner, slug } = await ownerAndWs(server.base);
    const inv = await owner.post(`/api/workspaces/${slug}/invites`, { emails: ['in@a.com'], role: 'member' });
    assert.equal(inv.status, 201, 'an in-list invite is created normally');
    const { callback } = await runFlow(server, { sub: 'sub-dp5-in', email: 'in@a.com', email_verified: true });
    assert.equal(callback.status, 302);
    assert.equal(callback.location, '/', 'the in-list reconcile auto-accepts and lands on /');
    withDb(server.dbPath, db => {
      const user = db.prepare('select * from users where email = ?').get('in@a.com');
      assert.equal(db.prepare('select count(*) as n from memberships where user_id = ?').get(user.id).n, 1, 'the membership was granted');
      assert.ok(db.prepare('select used_at from invites where email = ?').get('in@a.com').used_at, 'the accepted invite was consumed');
    });
  } finally {
    await server.stop();
  }
});

/* Adapted partial-filter row (deviation, see SUMMARY): the pendingInvites
   fetch is keyed by the row's email, so two pending invites for one SSO user
   ALWAYS share one email and one refusal verdict — a literal "one in-list,
   one refused" pair is unobservable. The row instead proves the >1 branching
   consumes ONLY the filtered array: two in-list invites in two workspaces
   survive the filter, drive the surface-don't-guess redirect, and stay
   unconsumed. */
test('DP-5: two in-list invites across two workspaces survive the filter and drive the /#invitations branching — none consumed', async () => {
  const server = await startServer({ env: { ...oidcEnv(), ALLOW_INVITE_DOMAINS: 'a.com' } });
  try {
    const { owner, slug } = await ownerAndWs(server.base);
    const second = await owner.post('/api/workspaces', { name: 'Second' });
    assert.equal(second.status, 201, `the second workspace must be created, got ${second.status}: ${JSON.stringify(second.data)}`);
    for (const wsSlug of [slug, second.data.workspace?.slug || second.data.slug]) {
      const inv = await owner.post(`/api/workspaces/${wsSlug}/invites`, { emails: ['multi@a.com'], role: 'member' });
      assert.equal(inv.status, 201);
    }
    const { callback } = await runFlow(server, { sub: 'sub-dp5-multi', email: 'multi@a.com', email_verified: true });
    assert.equal(callback.status, 302);
    assert.equal(callback.location, '/#invitations', 'both filtered-in invites drive the surface-don-t-guess redirect');
    withDb(server.dbPath, db => {
      const unconsumed = db.prepare('select count(*) as n from invites where email = ? and used_at is null').get('multi@a.com').n;
      assert.equal(unconsumed, 2, 'both invites stay pending — the branching consumed nothing');
    });
  } finally {
    await server.stop();
  }
});

/* ---------- immunity (DOM-05, D-12): existing accounts vs the doors ---------- */

/* The three named immunity rows live here so a reader can point at them.
   Admission ≠ authentication: the doors gate NEW admissions (JIT provision,
   invite create/accept/reconcile) — never the authentication of an
   already-linked identity or the existing membership of an existing account.
   Immunity is by construction (the already-linked resolution at server.js
   short-circuits before the DP-4 gate; the SSO-07 reconcile is skipped for
   users with memberships) — these rows PIN it, they do not implement it. */

test('immunity 1 — a linked identity re-logs in after mid-life tightening: the tightened signup list never blocks repeat SSO logins (SC2, DOM-05)', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-imm1-'));
  /* Boot 1: permissive signup door — the SSO login provisions and links. */
  let server = await startServer({ dataDir, env: { ...oidcEnv(), ALLOW_SIGNUP_DOMAINS: 'a.com' } });
  try {
    const { callback } = await runFlow(server, { sub: 'sub-imm1', email: 'linked@a.com', email_verified: true });
    assert.equal(callback.status, 302);
    assert.equal(callback.location, '/', 'boot 1: the permissive door provisions normally');
    withDb(server.dbPath, db => {
      assert.equal(db.prepare('select count(*) as n from users where email = ?').get('linked@a.com').n, 1, 'boot 1: the account exists');
    });
  } finally {
    await server.stop();
  }
  /* Boot 2: SAME dataDir, the signup list tightened to exclude the domain.
     The identity is already linked, so the already-linked resolution
     short-circuits BEFORE the DP-4 gate — admission ≠ authentication. */
  server = await startServer({ dataDir, env: { ...oidcEnv(), ALLOW_SIGNUP_DOMAINS: 'tightened.example' } });
  try {
    const { callback } = await runFlow(server, { sub: 'sub-imm1', email: 'linked@a.com', email_verified: true });
    assert.equal(callback.status, 302);
    assert.equal(callback.location, '/', 'boot 2: the repeat login succeeds identically to the permissive run');
    assert.ok(sessionCookieOf(callback.cookies), 'boot 2: a session was minted');
    assert.ok(!server.output().includes('sso signup domain refused'), 'boot 2: NO DP-4 refusal logged for the linked identity');
    withDb(server.dbPath, db => {
      assert.equal(db.prepare('select count(*) as n from users where email = ?').get('linked@a.com').n, 1, 'the user row is unchanged — no second account');
      assert.equal(db.prepare('select count(*) as n from oidc_identities where subject = ?').get('sub-imm1').n, 1, 'the identity row is unchanged — no re-link churn');
    });
  } finally {
    await server.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('immunity 2 — a pre-seeded linked identity logs in under a list that excludes it: the lists are never consulted for an established identity (SC2, DOM-05)', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-imm2-'));
  /* Boot 1: doors off — exists only so the database file exists for the
     direct withDb seed (startServer owns the schema). Nothing is provisioned
     through the doors here; the identity link is seeded, not earned. */
  let server = await startServer({ dataDir, env: { ...oidcEnv() } });
  try {
    withDb(server.dbPath, db => {
      db.prepare('insert into users (id, email, name, password_hash, created_at) values (?,?,?,?,?)').run('u_imm2', 'seeded@x.com', 'Seeded User', 'not-a-real-scrypt-hash', Date.now());
      db.prepare('insert into oidc_identities (id, user_id, issuer, subject, created_at) values (?,?,?,?,?)').run('i_imm2', 'u_imm2', idp.issuer, 'sub-imm2', Date.now());
    });
  } finally {
    await server.stop();
  }
  /* Boot 2: the signup door is TIGHTENED to exclude x.com before the very
     first SSO login attempt of this identity. */
  server = await startServer({ dataDir, env: { ...oidcEnv(), ALLOW_SIGNUP_DOMAINS: 'a.com' } });
  try {
    const { callback } = await runFlow(server, { sub: 'sub-imm2', email: 'seeded@x.com', email_verified: true });
    assert.equal(callback.status, 302);
    assert.equal(callback.location, '/', 'the very first login under the tightened list succeeds');
    assert.ok(sessionCookieOf(callback.cookies), 'a session was minted');
    assert.ok(!server.output().includes('sso signup domain refused'), 'no DP-4 refusal logged — the lists never reach the linked path');
    withDb(server.dbPath, db => {
      assert.equal(db.prepare('select count(*) as n from users where email = ?').get('seeded@x.com').n, 1, 'no new user row minted');
      assert.equal(db.prepare('select count(*) as n from oidc_identities where subject = ?').get('sub-imm2').n, 1, 'no second identity minted');
    });
  } finally {
    await server.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('immunity 3 — an existing member re-invited to another workspace under a tightened list is refused at accept, invite NOT consumed, loosening revives it (SC3/AMENDED, DOM-05)', async () => {
  /* AMENDED truth (Option B, plan 76-02 deviation log): accept-time
     re-validation applies to ALL admits, including existing accounts —
     existing-account immunity covers authentication/logins only (SC2
     scope), never invite acceptance. An existing member whose email sits
     outside the tightened invite list gets 403 inviteDomainNoLonger on the
     accept route; the invite row is NOT consumed; loosening revives it. */
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-imm3-'));
  /* Boot 1: doors off — the member account exists, joins workspace A by
     accepting an invite (earning its membership), and is then invited to a
     SECOND workspace B while the door is still off (so the invite row
     exists without touching DP-2 create-time semantics). */
  let server = await startServer({ dataDir, env: { ...oidcEnv() } });
  let tokenB;
  try {
    await signup(server.base, { name: 'Immunity Member', email: 'member@x.com' });
    const { owner, slug } = await ownerAndWs(server.base);
    const invA = await owner.post(`/api/workspaces/${slug}/invites`, { emails: ['member@x.com'], role: 'member' });
    assert.equal(invA.status, 201, `workspace A invite must mint with the door off, got ${invA.status}`);
    const { client: member } = await login(server.base, 'member@x.com', 'password-1234');
    const accA = await member.post(`/api/invites/${inviteToken(invA.data.invites[0].url)}/accept`, {});
    assert.ok([200, 201].includes(accA.status), `workspace A accept must succeed with the door off, got ${accA.status}: ${JSON.stringify(accA.data)}`);
    const second = await owner.post('/api/workspaces', { name: 'Immunity Second' });
    assert.equal(second.status, 201, `workspace B must be created, got ${second.status}`);
    const slugB = second.data.workspace?.slug || second.data.slug;
    const invB = await owner.post(`/api/workspaces/${slugB}/invites`, { emails: ['member@x.com'], role: 'member' });
    assert.equal(invB.status, 201, `workspace B invite must mint with the door off, got ${invB.status}`);
    tokenB = inviteToken(invB.data.invites[0].url);
    assert.ok(tokenB, 'the workspace B join token was minted');
  } finally {
    await server.stop();
  }
  /* Boot 2: the invite list TIGHTENED to exclude x.com — the member's
     re-invite to workspace B is refused at ACCEPT time; their existing
     membership and logins are untouched (auth immunity ≠ accept immunity). */
  server = await startServer({ dataDir, env: { ...oidcEnv(), ALLOW_INVITE_DOMAINS: 'a.com' } });
  try {
    const { client: member } = await login(server.base, 'member@x.com', 'password-1234');
    assert.ok(member, 'boot 2: the existing member still LOGS IN — immunity covers authentication (SC2)');
    const res = await member.post(`/api/invites/${tokenB}/accept`, {});
    assert.equal(res.status, 403, `the tightened list must refuse the accept even for an existing member, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.code, 'inviteDomainNoLonger', 'the refusal is the accept-door key');
    withDb(server.dbPath, db => {
      const invite = db.prepare('select used_at from invites where email = ?').get('member@x.com');
      /* Two invite rows exist (A consumed, B pending) — assert on the B row via its token-time email and used_at IS NULL count. */
      assert.equal(db.prepare('select count(*) as n from invites where email = ? and used_at is null').get('member@x.com').n, 1, 'exactly one invite (B) stays pending — the refusal consumed NOTHING');
      const user = db.prepare('select * from users where email = ?').get('member@x.com');
      assert.equal(db.prepare('select count(*) as n from memberships where user_id = ?').get(user.id).n, 1, 'the existing membership in A is untouched');
      assert.ok(invite, 'the invite rows survive the refusal');
    });
  } finally {
    await server.stop();
  }
  /* Boot 3: loosened — the SAME invite revives and the accept succeeds. */
  server = await startServer({ dataDir, env: { ...oidcEnv() } });
  try {
    const { client: member } = await login(server.base, 'member@x.com', 'password-1234');
    const res = await member.post(`/api/invites/${tokenB}/accept`, {});
    assert.ok([200, 201].includes(res.status), `loosening must revive the re-invite, got ${res.status}: ${JSON.stringify(res.data)}`);
    withDb(server.dbPath, db => {
      const user = db.prepare('select * from users where email = ?').get('member@x.com');
      assert.equal(db.prepare('select count(*) as n from memberships where user_id = ?').get(user.id).n, 2, 'the membership in B was granted on revival');
      assert.equal(db.prepare('select count(*) as n from invites where email = ? and used_at is null').get('member@x.com').n, 0, 'the revived accept consumed the pending invite');
    });
  } finally {
    await server.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

/* ---------- D-11: the combined five-door matrix boot log (SC4) ---------- */
const matrixLineOf = out => out.split('\n').find(l => l.includes('domains: door matrix'));

test('D-11: boot logs ONE combined line carrying all five door labels (SC4 — no reader assembly)', async () => {
  const server = await startServer({ env: { ...oidcEnv(), ALLOW_SIGNUP_DOMAINS: 'a.com', ALLOW_INVITE_DOMAINS: 'b.com' } });
  try {
    const lines = server.output().split('\n').filter(l => l.includes('domains: door matrix'));
    assert.equal(lines.length, 1, `exactly one combined matrix line, got ${lines.length}`);
    for (const door of ['signup:', 'invite-create:', 'invite-accept:', 'sso-jit:', 'sso-reconcile:']) {
      assert.ok(lines[0].includes(door), `the combined line must carry the ${door} label, got: ${lines[0]}`);
    }
  } finally {
    await server.stop();
  }
});

test('D-11: the own-lists matrix shows each door riding its structural list (signup/sso-jit ← SIGNUP, invite-* ← INVITE)', async () => {
  const server = await startServer({ env: { ...oidcEnv(), ALLOW_SIGNUP_DOMAINS: 'a.com', ALLOW_INVITE_DOMAINS: 'b.com' } });
  try {
    const line = matrixLineOf(server.output());
    assert.ok(line, 'the combined matrix line is missing');
    assert.ok(line.includes('signup: a.com'), `signup door: ${line}`);
    assert.ok(line.includes('sso-jit: a.com'), `sso-jit door: ${line}`);
    assert.ok(line.includes('invite-create: b.com'), `invite-create door: ${line}`);
    assert.ok(line.includes('invite-accept: b.com'), `invite-accept door: ${line}`);
    assert.ok(line.includes('sso-reconcile: b.com'), `sso-reconcile door: ${line}`);
  } finally {
    await server.stop();
  }
});

test('D-11: unset ALLOW_INVITE_DOMAINS inherits the signup list on all three invite doors (D-02 inherit direction 1)', async () => {
  const server = await startServer({ env: { ...oidcEnv(), ALLOW_SIGNUP_DOMAINS: 'a.com', ALLOW_INVITE_DOMAINS: undefined } });
  try {
    const line = matrixLineOf(server.output());
    assert.ok(line, 'the combined matrix line is missing');
    assert.ok(line.includes('invite-create: a.com') && line.includes('invite-accept: a.com') && line.includes('sso-reconcile: a.com'), `inherit direction 1: ${line}`);
  } finally {
    await server.stop();
  }
});

test('D-11: an own wider invite list stands alone on the invite doors (D-03/D-04 one door, one rule — inherit direction 2)', async () => {
  const server = await startServer({ env: { ...oidcEnv(), ALLOW_SIGNUP_DOMAINS: 'a.com', ALLOW_INVITE_DOMAINS: 'b.com,c.com' } });
  try {
    const line = matrixLineOf(server.output());
    assert.ok(line, 'the combined matrix line is missing');
    assert.ok(line.includes('signup: a.com') && line.includes('sso-jit: a.com'), `signup doors keep their own list: ${line}`);
    assert.ok(line.includes('invite-create: b.com, c.com') && line.includes('invite-accept: b.com, c.com') && line.includes('sso-reconcile: b.com, c.com'), `invite doors show the wider own list: ${line}`);
  } finally {
    await server.stop();
  }
});

test("D-11: set-but-empty shows 'deny-all' on the signup doors; a fully absent env shows 'off' for all five", async () => {
  const denyAll = await startServer({ env: { ...oidcEnv(), ALLOW_SIGNUP_DOMAINS: '', ALLOW_INVITE_DOMAINS: undefined } });
  try {
    const line = matrixLineOf(denyAll.output());
    assert.ok(line, 'the combined matrix line is missing');
    assert.ok(line.includes('signup: deny-all') && line.includes('sso-jit: deny-all'), `deny-all row: ${line}`);
    assert.ok(line.includes('invite-create: deny-all'), `deny-all inherits into the invite doors: ${line}`);
  } finally {
    await denyAll.stop();
  }
  const off = await startServer({ env: { ...oidcEnv(), ALLOW_SIGNUP_DOMAINS: undefined, ALLOW_INVITE_DOMAINS: undefined } });
  try {
    const line = matrixLineOf(off.output());
    assert.ok(line, 'the combined matrix line is missing');
    assert.ok(line.includes('signup: off') && line.includes('invite-create: off') && line.includes('invite-accept: off') && line.includes('sso-jit: off') && line.includes('sso-reconcile: off'), `off row: ${line}`);
  } finally {
    await off.stop();
  }
});

test('D-11: the two Phase 75 D-06 per-var lines remain byte-identical in shape with their source tags (SC4)', async () => {
  const server = await startServer({ env: { ...oidcEnv(), ALLOW_SIGNUP_DOMAINS: 'a.com', ALLOW_INVITE_DOMAINS: 'b.com' } });
  try {
    const out = server.output();
    const signupLine = out.split('\n').find(l => l.includes('domains: ALLOW_SIGNUP_DOMAINS:'));
    const inviteLine = out.split('\n').find(l => l.includes('domains: ALLOW_INVITE_DOMAINS:'));
    assert.ok(signupLine && signupLine.includes('a.com') && signupLine.includes('(source: own)'), `signup D-06 line: ${signupLine}`);
    assert.ok(inviteLine && inviteLine.includes('b.com') && inviteLine.includes('(source: own)'), `invite D-06 line: ${inviteLine}`);
  } finally {
    await server.stop();
  }
});
