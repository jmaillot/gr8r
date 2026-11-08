/* Phase 52 (52-01, TRN-01): the admin transparency endpoint
   GET /api/workspaces/:slug/members/:memberId/visibility.

   ONE funnel rule: the endpoint's list is computed by memberCanReadProject
   (server.js) for the TARGET member; this suite proves it agrees with
   1. the hand-derived VISIBILITY_MODEL oracle (anti-tautology contract —
      expectations are NEVER derived from memberCanReadProject or
      canSeeProject), and
   2. the complement of the redacted doc-GET hidden set, per actor, over the
      extended D-52-9 matrix (D-52-8 agreement check).
   Gates (D-52-4): non-admin requesters → 403 server-side; unknown AND absent
   target ids share ONE keyed neutral 404 body (T-52-01 — no existence oracle).
   Reasons (D-52-5/D-52-6): first-match coarse codes in funnel order, with the
   lead label tested before plain member inside the membership tier.
   The admin × team-only divergence cell (p_adminteam) pins the endpoint as
   the funnel authority, mirroring the documented doc-GET drift (same posture
   as the Phase 49/50 mirror-divergence residue tests in test/mcp.test.mjs). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { login, startServer } from './helpers/server.mjs';
import {
  createVisibilityFixtureDb,
  VIS_ACTORS,
  VIS_PASSWORD,
  VIS_USER_IDS,
  VIS_WS,
  VISIBILITY_MODEL,
} from './helpers/visibility-fixture.mjs';

const EMAILS = Object.freeze({
  m_admin: 'admin@visfix.local',
  m_owner: 'owner@visfix.local',
  m_plain: 'plain@visfix.local',
  m_team: 'team@visfix.local',
  m_scoped: 'scoped@visfix.local',
  m_guest: 'guest@visfix.local',
  m_doconly: 'doconly@visfix.local',
  m_admin2: 'admin2@visfix.local',
});
const PAR_ACTORS = VIS_ACTORS.filter(id => id !== 'm_doconly');

let server;
let dir;
const S = {}; // mid → cookie client

const vis = (client, memberId, slug = VIS_WS.slug) =>
  client.get(`/api/workspaces/${slug}/members/${memberId}/visibility`);
const docIds = async mid => {
  const res = await S[mid].get(`/api/workspaces/${VIS_WS.slug}`);
  assert.equal(res.status, 200, `${mid} reads the redacted doc`);
  return (res.data?.doc?.data?.projects || []).map(p => p.id);
};
const endpointIds = async mid => {
  const res = await vis(S.m_admin, VIS_USER_IDS[mid]);
  assert.equal(res.status, 200, `${mid} expansion resolves`);
  assert.equal(res.data.member, VIS_USER_IDS[mid], 'response echoes the target member id');
  for (const p of res.data.projects) {
    assert.deepEqual(Object.keys(p).sort(), ['id', 'name', 'reason'], 'project entries carry exactly {id, name, reason} — no rosters, no access lists');
    assert.equal(typeof p.reason, 'string', `reason is a coarse machine code (${p.id})`);
  }
  return res.data.projects.map(p => p.id);
};

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-transparency-'));
  createVisibilityFixtureDb(dir);
  server = await startServer({ dataDir: dir });
  for (const [mid, email] of Object.entries(EMAILS)) {
    const session = await login(server.base, email, VIS_PASSWORD);
    assert.equal(session.status, 200, `${mid} signs in`);
    S[mid] = session.client;
  }
});

after(async () => {
  await server?.stop();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

/* ---- 1. Gate rows (D-52-4, T-52-02, T-52-01) ---- */

test('gate: every non-admin requester is refused server-side with 403 (D-52-4)', async () => {
  for (const mid of ['m_plain', 'm_team', 'm_scoped', 'm_guest']) {
    const res = await vis(S[mid], VIS_USER_IDS.m_admin);
    assert.equal(res.status, 403, `${mid} requester → 403 (the server gate is the control)`);
  }
});

test('gate: unknown AND absent target ids share ONE keyed neutral 404 body (T-52-01)', async () => {
  const unknown = await vis(S.m_admin, 'u_nobody_here');
  /* u_doconly exists as a user row but carries NO memberships row — the
     known-but-absent cell. Identical body ⇒ no existence oracle. */
  const absent = await vis(S.m_admin, VIS_USER_IDS.m_doconly);
  assert.equal(unknown.status, 404);
  assert.equal(absent.status, 404);
  assert.equal(unknown.data.code, 'notAMember', 'the existing keyed fail code (no error-codes catalogue edit)');
  assert.deepEqual(unknown.data, absent.data, 'identical neutral body for both shapes');
});

test('gate: a nonexistent workspace slug answers 404', async () => {
  const res = await vis(S.m_admin, VIS_USER_IDS.m_admin, 'no-such-workspace');
  assert.equal(res.status, 404);
});

test('gate: an admin MAY expand their own member row (D-52-4 interpretation note)', async () => {
  const res = await vis(S.m_admin, VIS_USER_IDS.m_admin);
  assert.equal(res.status, 200, 'pure role gating — admins are entitled to the computed view for anyone, including themselves');
});

/* ---- 2. Parity rows (D-52-8, extended D-52-9 matrix) ---- */

test('parity: endpoint id sets equal the hand-derived VISIBILITY_MODEL for every actor (D-52-9)', async () => {
  for (const mid of PAR_ACTORS) {
    const ids = await endpointIds(mid);
    assert.deepEqual(ids.sort(), [...VISIBILITY_MODEL[mid]].sort(), `${mid}: endpoint set matches the hand-derived oracle`);
  }
});

test('parity: endpoint ids equal the complement of the redacted doc-GET hidden set (D-52-8)', async () => {
  for (const mid of PAR_ACTORS) {
    const served = await docIds(mid);
    const ids = (await endpointIds(mid)).sort();
    assert.deepEqual(ids, served.sort(), `${mid}: endpoint list === doc-GET complement (agreement with the member's own experience)`);
  }
});

test('funnel agreement pin: the endpoint lists exactly what the one funnel reads — nothing more, nothing less', async () => {
  /* Both directions of the set equality, explicitly: every listed id is in
     the oracle (no invention) and every oracle id is listed (no omission),
     for every actor in the extended matrix. */
  for (const mid of PAR_ACTORS) {
    const ids = new Set(await endpointIds(mid));
    const oracle = new Set(VISIBILITY_MODEL[mid]);
    for (const id of ids) assert.ok(oracle.has(id), `${mid}: ${id} listed but not in the oracle (invention)`);
    for (const id of oracle) assert.ok(ids.has(id), `${mid}: ${id} in the oracle but not listed (omission)`);
  }
});

/* ---- 3. The admin × team-only divergence cell (RESEARCH Open Question 1,
        option (a): the funnel is the authority) ---- */

test('documented divergence: admin × team-only grant — the funnel lists it, the admin doc-GET hides it', async () => {
  const res = await vis(S.m_admin, VIS_USER_IDS.m_admin2);
  const entry = res.data.projects.find(p => p.id === 'p_adminteam');
  assert.ok(entry, 'endpoint (the funnel) lists the team-linked private project for the admin target');
  assert.equal(entry.reason, 'team', 'the live team link is the first matching reason');
  const served = await docIds('m_admin2');
  assert.equal(served.includes('p_adminteam'), false, 'admin doc-GET stays access-list-gated — a pinned divergence, not parity (mirror-drift precedent)');
});

/* ---- 4. Reason rows (D-52-5/D-52-6): first-match coarse codes ---- */

const reasonsOf = async mid => {
  const res = await vis(S.m_admin, VIS_USER_IDS[mid]);
  return Object.fromEntries(res.data.projects.map(p => [p.id, p.reason]));
};

test('reasons: first-match coarse codes in funnel order (D-52-5/D-52-6)', async () => {
  const admin = await reasonsOf('m_admin');
  assert.equal(admin.p_open, 'everyone', 'non-private → everyone');
  assert.equal(admin.p_leadonly, 'lead', 'lead is tested BEFORE plain member inside the membership tier (label refinement, not a predicate change)');

  const team = await reasonsOf('m_team');
  assert.equal(team.p_teamboth, 'member', 'the membership tier beats the live team link (first-match order)');
  assert.equal(team.p_teamshare, 'team', 'private + live team link → team (coarse code — never a roster)');

  const plain = await reasonsOf('m_plain');
  assert.equal(plain.p_membershare, 'lead', 'm_plain leads p_membershare — the lead label wins over plain member');
  assert.equal(plain.p_open, 'everyone');
});

test('reasons: not-accessible projects NEVER appear in the list (D-52-2)', async () => {
  const plain = await reasonsOf('m_plain');
  for (const hidden of ['p_hidden', 'p_teamshare', 'p_scopeproj', 'p_sealed', 'p_lostvis']) {
    assert.equal(hidden in plain, false, `${hidden} never leaks into m_plain's view`);
  }
  const guest = await reasonsOf('m_guest');
  assert.equal('p_membershare' in guest, false, 'the dormant scope grant materializes nowhere');
});

/* ---- 5. D-51-4 lost-visibility honesty (mutation test — runs LAST: it
        persists a doc change) ---- */

test('D-51-4 lost visibility: removing the access-list entry shrinks the server list on the next request', async () => {
  const before = (await endpointIds('m_team')).sort();
  assert.ok(before.includes('p_lostvis'), 'precondition: m_team can read p_lostvis through the access list');
  const del = await S.m_admin.del(`/api/workspaces/${VIS_WS.slug}/projects/p_lostvis/members/${VIS_USER_IDS.m_team}`);
  assert.equal(del.status, 200, `removal accepted: ${JSON.stringify(del.data)}`);
  const after = (await endpointIds('m_team')).sort();
  assert.equal(after.includes('p_lostvis'), false, 'the transparency list shrank — no stale grants, no memoization (D-50-3)');
  /* Honesty leg: the member's own experience shrank in agreement. */
  const served = await docIds('m_team');
  assert.equal(served.includes('p_lostvis'), false, 'the redacted doc agrees — lost visibility is honest on both doors');
});
