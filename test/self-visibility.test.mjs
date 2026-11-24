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
import { login, startServer, withDb } from './helpers/server.mjs';
import {
  createVisibilityFixtureDb,
  VIS_ACTORS,
  VIS_CREATED_AT,
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
  /* ---- 95-02: the my-access aggregate's second workspace ----
     ws_alpha: m_plain + m_team are members; one public project (rides its
     icon/color through additively) and one private project readable by
     nobody here. For m_team BOTH alpha projects are funnel-rejected, so
     m_team's aggregate must hide the alpha group entirely (D-07). Seeded
     directly (same raw-SQL fixture idiom as helpers/visibility-fixture.mjs)
     — m_plain's membership carries no scope columns (null), m_team's ditto. */
  const uidFor = email => withDb(server.dbPath, db => db.prepare('select id from users where email = ?').get(email)?.id);
  const alphaDoc = {
    data: {
      plan: 'Team',
      ws: { name: 'Alpha', url: 'alpha', c: '#5A67D8', brand: true },
      me: null,
      members: [
        { id: 'm_admin', name: 'Andy Admin', role: 'admin' },
        { id: 'm_plain', name: 'Pat Plain', role: 'member' },
        { id: 'm_team', name: 'Tessa Team', role: 'member' },
      ],
      teams: [],
      projects: [
        { id: 'p_alpha_open', key: 'OPEN', name: 'Alpha Open', private: true, members: ['m_plain'], lead: 'm_plain', teams: [], status: 'active', icon: 'rocket', color: '#C54B78' },
        { id: 'p_alpha_priv', key: 'PRIV', name: 'Alpha Priv', private: true, members: ['m_admin'], lead: 'm_admin', teams: [], status: 'active' },
      ],
    },
  };
  withDb(server.dbPath, db => {
    db.prepare('insert into workspaces (id, slug, name, color, doc, revision, created_at, updated_at) values (?,?,?,?,?,?,?,?)').run(
      'ws_alpha', 'alpha', 'Alpha', '#5A67D8', JSON.stringify(alphaDoc), 1, VIS_CREATED_AT + 1000, VIS_CREATED_AT + 1000,
    );
    const ins = db.prepare('insert into memberships (workspace_id, user_id, role, member_id, scope) values (?,?,?,?,?)');
    ins.run('ws_alpha', uidFor(EMAILS.m_admin), 'admin', 'm_admin', null);
    ins.run('ws_alpha', uidFor(EMAILS.m_plain), 'member', 'm_plain', null);
    ins.run('ws_alpha', uidFor(EMAILS.m_team), 'member', 'm_team', null);
  });
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

/* ---- 3. 95-02: the cross-workspace my-access aggregate (SET-01/SET-02) ---- */

const myAccess = cl => cl.get('/api/settings/my-access');

test('my-access: a member of 2 workspaces whose second workspace holds no readable projects sees exactly ONE group (D-07: empty workspaces hidden)', async () => {
  /* m_team belongs to visfix AND ws_alpha, but every alpha project is
     funnel-rejected for them (both are private and name neither m_team nor
     a live team of theirs) — the alpha group must be absent, not empty. */
  const res = await myAccess(S.m_team);
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.data), ['workspaces'], 'the aggregate exposes workspaces and nothing else');
  assert.deepEqual(res.data.workspaces.map(w => w.id), ['ws_visfix'], 'only the workspace with readable projects is listed');
  assert.deepEqual(Object.keys(res.data.workspaces[0]).sort(), ['id', 'name', 'projects', 'slug'], 'group carries id/name/slug/projects only');
  for (const p of res.data.workspaces[0].projects) {
    assert.ok(!['p_alpha_open', 'p_alpha_priv'].includes(p.id), 'no alpha project leaks into the visfix group');
  }
});

test('my-access: groups carry the additive icon/color/role fields and the funnel still hides unreadable projects (T-95-03/T-95-06)', async () => {
  const res = await myAccess(S.m_plain);
  assert.equal(res.status, 200);
  assert.deepEqual(res.data.workspaces.map(w => w.id).sort(), ['ws_alpha', 'ws_visfix'], 'both member workspaces with readable projects appear');
  const alpha = res.data.workspaces.find(w => w.id === 'ws_alpha');
  assert.deepEqual(alpha.projects.map(p => p.id), ['p_alpha_open'], 'the private alpha project is funnel-hidden');
  const open = alpha.projects[0];
  assert.equal(open.name, 'Alpha Open');
  assert.equal(open.reason, 'lead', 'the lead grant class names itself (normalizeProjects guarantees lead ∈ members)');
  assert.equal(open.icon, 'rocket', 'the project icon rides through additively');
  assert.equal(open.color, '#C54B78', 'the project color rides through additively (raw — the client normalizes)');
  assert.equal(open.role, 'member', 'the caller\'s own membership role feeds the D-08 badge');
  /* Entry shape: base funnel keys + the additive trio, nothing else. */
  assert.deepEqual(Object.keys(open).sort(), ['color', 'icon', 'id', 'name', 'reason', 'role']);
});

test('my-access: the private alpha project keeps NO icon/color/role echo when it is hidden', async () => {
  const res = await myAccess(S.m_admin);
  const alpha = res.data.workspaces.find(w => w.id === 'ws_alpha');
  assert.ok(alpha, 'm_admin (alpha admin, doc member m_admin) reads the private alpha project');
  assert.deepEqual(alpha.projects.map(p => p.id), ['p_alpha_priv'], 'admins do NOT bypass the private-project access list (D-49 posture)');
  const priv = alpha.projects[0];
  assert.equal(priv.reason, 'lead', 'the lead grant class names itself (normalizeProjects guarantees lead ∈ members)');
  assert.deepEqual(Object.keys(priv).sort(), ['color', 'icon', 'id', 'name', 'reason', 'role'].filter(k => k !== 'icon' && k !== 'color'), 'a project without icon/color stays exactly {id,name,reason,role}');
});

test('my-access: a signed-in user with zero memberships answers 200 with an empty list', async () => {
  const res = await myAccess(S.m_doconly);
  assert.equal(res.status, 200);
  assert.deepEqual(res.data, { workspaces: [] }, 'no memberships is an empty aggregate, never an error');
});

test('my-access: unauthenticated request is refused by the session gate', async () => {
  const anon = (await login(server.base, 'nobody@visfix.local', VIS_PASSWORD)).client;
  const res = await myAccess(anon);
  assert.equal(res.status, 401);
});
