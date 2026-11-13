/* Phase 60 (60-01, TRN-01/TRN-02): the member self-view endpoint
   GET /api/workspaces/:slug/me/visibility — the Phase 52 transparency funnel
   scoped to the CALLING member.

   ANTI-TAUTOLOGY CONTRACT: the expected project set per actor is the
   hand-derived funnel expectation (VISIBILITY_MODEL cells + the documented
   D-52-9 funnel-authority divergence set for m_admin2), NEVER derived from
   production predicates — this file imports nothing from server.js.
   TRN-02 is byte-level: for every actor, the serialized payload contains
   NONE of the OTHER actors' ids, names, or emails, and no key beyond
   `projects` at the top level. */
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
  m_teamviewonly: 'teamviewonly@visfix.local',
  m_teamrevoked: 'teamrevoked@visfix.local',
  m_danglingteam: 'danglingteam@visfix.local',
});
/* m_doconly has NO memberships row — requireWorkspace 404s before any
   predicate runs; it is excluded from the self-view parity loops. */
const SELF_ACTORS = VIS_ACTORS.filter(id => id !== 'm_doconly');
/* Hand-derived funnel set for m_admin2 (the D-52-9 divergence cell): engA is
   live, so the funnel lists every engA-linked private + publics — identical
   to the transparency endpoint's authority set. */
const SELF_MODEL_ADMIN2 = Object.freeze(['p_adminteam', 'p_legacy', 'p_open', 'p_publicgain', 'p_teamboth', 'p_teamshare']);

const self = (cl, slug = VIS_WS.slug) => cl.get(`/api/workspaces/${slug}/me/visibility`);
const expectedIds = mid => (mid === 'm_admin2' ? [...SELF_MODEL_ADMIN2] : [...VISIBILITY_MODEL[mid]]);

let server;
let dir;
const S = {};

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-selfvis-'));
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

/* ---- 1. Funnel parity per actor (TRN-01, anti-tautology) ---- */

test('self-view: every actor\'s project set matches the hand-derived funnel expectations', async () => {
  for (const mid of SELF_ACTORS) {
    const res = await self(S[mid]);
    assert.equal(res.status, 200, `${mid} reads their own access picture`);
    assert.deepEqual(
      [...new Set(res.data.projects.map(p => p.id))].sort(),
      expectedIds(mid).sort(),
      `${mid}: self-view set matches the hand-derived oracle`,
    );
  }
});

test('self-view: reason codes reuse the Phase 52 vocabulary (D-12), team rows carry ONLY the own-team name (D-13/T-52-03)', async () => {
  const admin = await self(S.m_admin);
  const reasons = Object.fromEntries(admin.data.projects.map(p => [p.id, p.reason]));
  assert.equal(reasons.p_open, 'everyone', 'non-private → everyone');
  assert.equal(reasons.p_leadonly, 'lead', 'lead label before plain member');
  assert.equal(reasons.p_hidden, 'lead', 'm_admin leads p_hidden — lead label wins');

  const team = await self(S.m_team);
  const pTeamshare = team.data.projects.find(p => p.id === 'p_teamshare');
  assert.equal(pTeamshare.reason, 'team');
  assert.equal(pTeamshare.teamName, 'Eng A', 'the member\'s OWN team name only');
  assert.deepEqual(Object.keys(pTeamshare).sort(), ['id', 'name', 'reason', 'teamName']);
  const pTeamboth = team.data.projects.find(p => p.id === 'p_teamboth');
  assert.equal(pTeamboth.reason, 'member', 'membership tier beats the live team link (first-match)');
  assert.equal('teamName' in pTeamboth, false, 'teamName only on the team reason');

  /* Per-person grant from ANOTHER member: m_team reads p_lostvis through the
     access list m_admin granted — the grant type shows ('member'-class code)
     WITHOUT any granter field. */
  const lost = team.data.projects.find(p => p.id === 'p_lostvis');
  assert.equal(lost.reason, 'member', 'the grant class is visible');
  assert.equal('granter' in lost, false, 'no granter field — never the granter\'s identity');
  const wire = JSON.stringify(team.data);
  assert.equal(wire.includes('Andy Admin'), false, 'no granter name on the wire');
});

/* ---- 2. Byte-level shape (TRN-02) ---- */

test('shape: exactly ONE top-level key `projects`; entries carry exactly {id,name,reason[,teamName]}', async () => {
  for (const mid of SELF_ACTORS) {
    const res = await self(S[mid]);
    assert.deepEqual(Object.keys(res.data), ['projects'], `${mid}: no member echo, nothing else top-level`);
    for (const p of res.data.projects) {
      assert.ok(
        ['id,name,reason', 'id,name,reason,teamName'].includes(Object.keys(p).sort().join(',')),
        `${mid}/${p.id}: entry keys exactly {id,name,reason[,teamName]}`,
      );
      if ('teamName' in p) assert.equal(p.reason, 'team', 'teamName only on the team reason');
    }
  }
});

test('redaction (byte-level): no OTHER actor\'s id, name, or email anywhere in the serialized payload', async () => {
  const NAMES = Object.freeze({
    m_admin: 'Andy Admin', m_owner: 'Olive Owner', m_plain: 'Pat Plain', m_team: 'Tessa Team',
    m_scoped: 'Sam Scoped', m_guest: 'Gus Guest', m_doconly: 'Dee DocOnly', m_admin2: 'Ari Admin II',
    m_teamviewonly: 'Vera ViewOnly', m_teamrevoked: 'Rex Revoked', m_danglingteam: 'Dan Dangling',
  });
  for (const mid of SELF_ACTORS) {
    const res = await self(S[mid]);
    const wire = JSON.stringify(res.data);
    for (const other of VIS_ACTORS) {
      if (other === mid) continue;
      assert.equal(wire.includes(VIS_USER_IDS[other]), false, `${mid}: other actor id ${VIS_USER_IDS[other]} absent`);
      assert.equal(wire.includes(NAMES[other]), false, `${mid}: other actor name absent`);
      assert.equal(wire.includes(EMAILS[other]), false, `${mid}: other actor email absent`);
      /* No doc member id either — the payload keys projects, not people. */
      assert.equal(wire.includes(`"${other}"`), false, `${mid}: no doc member id ${other} on the wire`);
    }
    for (const banned of ['"member"', '"perms"', '"access"', '"members"']) {
      assert.equal(wire.includes(`${banned}:`), false, `${mid}: no ${banned} key anywhere`);
    }
  }
});

/* ---- 3. Gate rows (D-11: any workspace member, viewer included) ---- */

test('gate: the viewer role receives 200 — self-view is any-member', async () => {
  const res = await self(S.m_guest);
  assert.equal(res.status, 200);
});

test('gate: a nonexistent workspace slug answers 404', async () => {
  const res = await self(S.m_plain, 'no-such-workspace');
  assert.equal(res.status, 404);
});

test('gate: the doc-only profile (no memberships row) is 404 — unreachable actor', async () => {
  const res = await self(S.m_doconly);
  assert.equal(res.status, 404);
});

test('gate: unauthenticated request is refused by the session gate', async () => {
  const anon = (await login(server.base, 'nobody@visfix.local', VIS_PASSWORD)).client;
  const res = await self(anon);
  assert.equal(res.status, 401);
});
