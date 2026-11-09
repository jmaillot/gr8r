/* Phase 49 (49-02) → Phase 50 (50-01): the migration harness flipped to pin
   the SWEEP RETIREMENT (D-50-5). Boots the real server against the visibility
   fixture (plus the planted fail-open scope cell) and pins:
     1. the fixture's legacy shapes on disk BEFORE the boot (unchanged input);
     2. boot 1 writes NOTHING: scope columns stay populated (dormant), and the
        stored doc is byte-identical to the fixture — p.teams, p.access and
        the scalar team key all survive (no grant materialization);
     3. per-actor doc-GET visibility == the hand-derived D-50-5 model
        (public ∨ p.members ∨ LIVE team ∈ p.teams, admins access-list-gated);
     4. the planted corrupt-scope cell rides the plain member branch — the
        dormant scope column is never read, never a lockout, never a grant;
     5. a second boot is byte-identical with ZERO pre-visibility backups
        (no sweep exists to mint one or to delete p.teams on any boot). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, test } from 'node:test';
import {
  createVisibilityFixtureDb,
  VIS_ACTORS,
  VIS_CREATED_AT,
  VIS_GUEST_SCOPE,
  VIS_PASSWORD,
  VIS_SCOPED_SCOPE,
  VIS_WS,
  VISIBILITY_MODEL,
} from './helpers/visibility-fixture.mjs';
import { legacyScryptHash } from './helpers/legacy-fixture.mjs';
import { login, startServer, withDb } from './helpers/server.mjs';

const VIS_BACKUP_PREFIX = 'projects-pre-visibility-';

let dataDir;
let server;
/* The fixture's legacy state captured BEFORE the first boot — the sweep runs
   during boot, so post-boot reads can no longer observe it. */
let preBoot;

const backups = () => fs.readdirSync(dataDir).filter(name => name.startsWith(VIS_BACKUP_PREFIX) && name.endsWith('.db'));

const docRow = () =>
  withDb(server.dbPath, db => db.prepare('select id, slug, name, color, doc, revision, updated_at from workspaces where id = ?').get(VIS_WS.id));
const storedDoc = () => JSON.parse(docRow().doc);
const projectById = () => Object.fromEntries(storedDoc().data.projects.map(p => [p.id, p]));
const membershipRows = () =>
  withDb(server.dbPath, db =>
    db
      .prepare('select user_id, member_id, role, team, scope from memberships where workspace_id = ? order by user_id')
      .all(VIS_WS.id),
  );
const inviteRows = () =>
  withDb(server.dbPath, db =>
    db
      .prepare('select email, role, team, teams, workspace_id, scope from invites order by email')
      .all(),
  );

/* Everything the visibility state owns, compared byte-for-byte across reboot. */
function snapshot() {
  return {
    workspace: docRow(),
    memberships: membershipRows(),
    invites: inviteRows(),
  };
}

/* The visible project ids of one actor through the doc-GET door — the same
   read door privacy.test.mjs exercises. */
async function visibleViaDocGet(actorEmail) {
  const session = await login(server.base, actorEmail, VIS_PASSWORD);
  assert.equal(session.status, 200, `${actorEmail} signs in`);
  const res = await session.client.get(`/api/workspaces/${VIS_WS.slug}`);
  return { status: res.status, ids: (res.data?.doc?.data?.projects || []).map(p => p.id).sort() };
}

const emailOf = mid => ({
  m_admin: 'admin@visfix.local',
  m_admin2: 'admin2@visfix.local', // Phase 52 (D-52-9): the admin × team-only divergence actor
  m_owner: 'owner@visfix.local',
  m_plain: 'plain@visfix.local',
  m_team: 'team@visfix.local',
  m_scoped: 'scoped@visfix.local',
  m_guest: 'guest@visfix.local',
  m_doconly: 'doconly@visfix.local',
  /* Phase 53 (53-01) team-perm actor cells. */
  m_teamviewonly: 'teamviewonly@visfix.local',
  m_teamrevoked: 'teamrevoked@visfix.local',
  m_danglingteam: 'danglingteam@visfix.local',
}[mid]);

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-visibility-'));
  createVisibilityFixtureDb(dataDir);
  /* T-49-04 fail-open cell, planted BEFORE the boot: a membership whose scope
     column is unparseable JSON. The sweep itself must reproduce the old
     fail-open semantics (workspace-wide — never a lockout, never an
     elevation); the test below pins the post-sweep outcome. */
  const planted = new DatabaseSync(path.join(dataDir, 'projects.db'));
  try {
    planted
      .prepare('insert into users (id, email, name, password_hash, member_id, created_at) values (?,?,?,?,?,?)')
      .run('u_corrupt', 'corrupt@visfix.local', 'Cora Corrupt', legacyScryptHash(VIS_PASSWORD), 'm_corrupt', VIS_CREATED_AT);
    planted
      .prepare('insert into memberships (workspace_id, user_id, role, member_id, scope) values (?,?,?,?,?)')
      .run(VIS_WS.id, 'u_corrupt', 'member', 'm_corrupt', 'not-json{');
    planted
      .prepare('insert into team_members (workspace_id, team_id, member_id, user_id) values (?,?,?,?)')
      .run(VIS_WS.id, 'engA', 'm_corrupt', 'u_corrupt');
  } finally {
    planted.close();
  }
  /* Capture the pre-boot legacy shapes (raw sqlite — the boot has not run). */
  const raw = new DatabaseSync(path.join(dataDir, 'projects.db'));
  try {
    preBoot = {
      doc: JSON.parse(raw.prepare('select doc from workspaces where id = ?').get(VIS_WS.id).doc),
      membershipScopes: Object.fromEntries(
        raw.prepare('select member_id, scope from memberships where workspace_id = ?').all(VIS_WS.id).map(r => [r.member_id, r.scope]),
      ),
      inviteScopes: raw.prepare('select scope from invites where workspace_id = ?').all(VIS_WS.id).map(r => r.scope),
      revision: raw.prepare('select revision from workspaces where id = ?').get(VIS_WS.id).revision,
    };
  } finally {
    raw.close();
  }
  server = await startServer({ dataDir });
});

after(async () => {
  await server?.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('fixture DB (pre-boot): the legacy shapes the sweep consumes are on disk', () => {
  const preProjects = Object.fromEntries(preBoot.doc.data.projects.map(p => [p.id, p]));

  /* The sweep's input markers (Task 1 guard): ≥1 memberships scope, ≥1 invites
     scope, ≥1 p.teams key, ≥1 legacy p.access string. */
  assert.deepEqual(JSON.parse(preBoot.membershipScopes.m_scoped), VIS_SCOPED_SCOPE, 'm_scoped carries {projects, teams} scope');
  assert.deepEqual(JSON.parse(preBoot.membershipScopes.m_guest), VIS_GUEST_SCOPE, 'm_guest carries the invite-derived scope');
  assert.equal(preBoot.membershipScopes.m_corrupt, 'not-json{', 'the planted fail-open cell carries unparseable scope JSON');
  assert.ok(preBoot.inviteScopes.some(s => s !== null && s !== undefined), 'an invites row carries a scope value');
  assert.ok(Object.values(preProjects).some(p => Array.isArray(p.teams)), 'a stored project carries p.teams');
  assert.equal(preProjects.p_legacy.access, 'private', 'a stored project carries the legacy p.access string');
  /* CR-01 (49-05): the scalar cell's pre-boot shape — the exact marker
     sweepNeeded must detect and the tx must convert. */
  assert.equal(preProjects.p_legacyteam.team, 'engA', 'the scalar cell carries team:\'engA\' on disk pre-boot');
  assert.equal('teams' in preProjects.p_legacyteam, false, 'the scalar cell carries NO teams key (the pre-Phase-32 shape)');
  assert.equal(preProjects.p_sealed.private, true, 'the sealed project is sealed on disk pre-boot (D-49-8 input)');
  assert.equal(preBoot.revision, 1, 'the fixture ships at revision 1');
});

test('boot 1 writes NOTHING: scope columns stay populated and the doc is byte-identical (sweep retired, D-50-5)', () => {
  /* 2026-11-08 (D-50-5): flipped from the Phase 49 NULL pins — the sweep is
     retired, so the dormant scope columns are never cleared and never read. */
  assert.ok(membershipRows().length >= 7, 'all memberships present');
  assert.equal(membershipRows().find(r => r.member_id === 'm_scoped').scope, JSON.stringify(VIS_SCOPED_SCOPE), 'm_scoped scope column untouched (dormant)');
  assert.equal(membershipRows().find(r => r.member_id === 'm_guest').scope, JSON.stringify(VIS_GUEST_SCOPE), 'm_guest scope column untouched (dormant)');
  assert.ok(inviteRows().some(r => r.scope !== null && r.scope !== undefined), 'the invites row keeps its scope value (dormant)');

  /* No boot pass touches the stored doc: revision, slug and the TEAM-01 state
     are untouched, and the doc bytes equal the fixture's. */
  assert.equal(docRow().revision, 1);
  assert.equal(docRow().slug, VIS_WS.slug);
  assert.ok(membershipRows().every(r => r.team === null), 'the TEAM-01 backfill still found zero eligible rows');
  /* NOTE: boot 1 does append the planted m_corrupt doc profile (the pre-existing
     backfillMemberships ensureMember pass — untouched by this plan); byte-identity
     of the visibility state across boots is pinned by the second-boot test below. */
});

test('sweep retired: p.teams, p.access and the scalar team key all survive boot 1 — nothing materialized', () => {
  const projects = projectById();

  /* D-50-5: p.teams is the LIVE third term — no boot path may delete it. */
  assert.deepEqual(projects.p_teamshare.teams, ['engA'], 'p_teamshare keeps its live team link');
  assert.deepEqual(projects.p_teamboth.teams, ['engA'], 'p_teamboth keeps its live team link');
  assert.deepEqual(projects.p_publicgain.teams, ['engA'], 'p_publicgain keeps its team link (inert on a public project)');
  /* D-49-4 posture kept without the sweep: the legacy string survives on disk
     un-honored (projectIsPrivate reads the boolean only). */
  assert.equal(projects.p_legacy.access, 'private', 'the legacy p.access string survives un-honored');
  assert.equal(projects.p_legacyteam.team, 'engA', 'the scalar team key survives — nothing converts it');
  assert.equal('teams' in projects.p_legacyteam, false, 'the scalar cell keeps the pre-Phase-32 shape');

  /* No grant materialization: access lists are exactly the fixture's. */
  assert.deepEqual(projects.p_teamshare.members, ['m_admin'], 'no team grant materialized — access is LIVE via the predicate');
  assert.deepEqual(projects.p_scopeproj.members, [], 'no scope grant materialized (dormant)');
  assert.deepEqual(projects.p_scopeddeny.members, ['m_scoped'], 'no dissolve — the out-of-scope access-list entry stands');
  assert.deepEqual(projects.p_hidden.members, ['m_admin'], 'no phantom grants');
  assert.deepEqual(projects.p_sealed.members, [], 'the sealed project keeps its empty members list (D-49-8 shape preserved on disk)');
  assert.equal(projects.p_sealed.private, true, 'the sealed project stays sealed on disk');
});

test('D-50-5 set-equality: every actor’s doc-GET visibility equals the hand-derived model', async () => {
  /* 2026-11-08: the oracle rows (VISIBILITY_MODEL) are the hand-derived
     D-50-5 model — public ∨ p.members ∨ LIVE team ∈ p.teams, admins
     access-list-gated, dormant scope columns read by nothing. The live team
     term restores m_team's reach WITHOUT any materialization step. */
  for (const actor of VIS_ACTORS) {
    const { status, ids } = await visibleViaDocGet(emailOf(actor));
    if (actor === 'm_doconly') {
      assert.equal(status, 404, 'the doc-only profile has no memberships row and cannot read the workspace');
      continue;
    }
    assert.equal(status, 200, `${actor} reads the workspace doc`);
    assert.deepEqual(ids, [...VISIBILITY_MODEL[actor]].sort(), `${actor} sees exactly the D-50-5 hand-derived set`);
  }
});

test('dormant scope cell: corrupt scope JSON is never read — plain member semantics (T-49-04 posture, D-50-5)', async () => {
  /* m_corrupt's scope column is unparseable ('not-json{') and stays on disk —
     the D-50-5 predicate reads no scope column at all, so the cell rides the
     plain member branch: live engA team term on p_teamshare + publics. The
     fail-open posture is moot (nothing fails open — nothing is read), but the
     historical invariant still holds: never a lockout, never an elevation. */
  const { status, ids } = await visibleViaDocGet('corrupt@visfix.local');
  assert.equal(status, 200, 'the corrupt-scope member still reads the workspace');
  assert.deepEqual(ids, ['p_adminteam', 'p_legacy', 'p_open', 'p_publicgain', 'p_teamboth', 'p_teamshare'], 'plain member semantics: live team grants + publics, nothing more');
  const projects = projectById();
  assert.deepEqual(projects.p_teamshare.members, ['m_admin'], 'nothing materialized — the grant is LIVE via team_members');
  assert.deepEqual(projects.p_hidden.members, ['m_admin'], 'no elevation: the access list still governs');
});
test('second boot is byte-identical and ZERO pre-visibility backups exist (sweep retired)', async () => {
  const firstBoot = snapshot();
  await server.stop();

  server = await startServer({ dataDir });
  const secondBoot = snapshot();
  assert.deepEqual(secondBoot, firstBoot, 'no doc/scope/rows drift across the reboot');
  /* 2026-11-08 (D-50-5): flipped 1 → 0 — no sweep exists to mint a backup, and
     no boot path can delete the restored p.teams on any boot (Pitfall 1). */
  assert.equal(backups().length, 0, 'zero projects-pre-visibility-*.db after two boots');
  /* 50-02: the NEW migrations are no-ops here too — this fixture carries no
     pre-visibility snapshot (fail-open posture) and no legacy guest rows, so
     neither migration may write or back up. */
  const newBackups = prefix =>
    fs.readdirSync(dataDir).filter(name => name.startsWith(prefix) && name.endsWith('.db'));
  assert.equal(newBackups('projects-pre-team-link-').length, 0, 'zero projects-pre-team-link- backups (fail-open posture writes nothing)');
  assert.equal(newBackups('projects-pre-guest-normalize-').length, 0, 'zero projects-pre-guest-normalize- backups (no guest rows)');

  /* The live team links survive the reboot byte-for-byte. */
  const teamsharePost = storedDoc().data.projects.find(p => p.id === 'p_teamshare');
  assert.deepEqual(teamsharePost.teams, ['engA'], 'p_teamshare keeps its live team link after the second boot');
  const legacyteamPost = storedDoc().data.projects.find(p => p.id === 'p_legacyteam');
  assert.equal(legacyteamPost.team, 'engA', 'scalar cell: the team scalar survives untouched');
  assert.equal('teams' in legacyteamPost, false, 'scalar cell: normalizeProjects did NOT re-add a teams key (D-49-6 no-churn)');

  /* The D-50-5 model still holds on the rebooted server — visibility is stable
     across boots, not just within one process. */
  const plain = await visibleViaDocGet(emailOf('m_plain'));
  assert.deepEqual(plain.ids, [...VISIBILITY_MODEL.m_plain].sort());
  const team = await visibleViaDocGet(emailOf('m_team'));
  assert.deepEqual(team.ids, [...VISIBILITY_MODEL.m_team].sort());
  const owner = await visibleViaDocGet(emailOf('m_owner'));
  assert.deepEqual(owner.ids, [...VISIBILITY_MODEL.m_owner].sort());
});

/* ==========================================================================
   50-02 Task 2 (D-50-6): restoreTeamLinks — the provenance-(a) path.
   A SEPARATE fixture/dataDir boots a workspace whose stored doc is the exact
   post-Phase-49-sweep shape (p.teams deleted, team-derived members
   materialized), while a planted projects-pre-visibility-*.db snapshot holds
   the PRE-sweep doc (teams linked, genuine access list only). Both fixture
   labels are HAND-WRITTEN here — never derived from production code
   (anti-tautology contract).
     - p_teamshare  sweep materialized m_team  → restore link, REMOVE m_team
     - p_teamboth   m_team was ALREADY on the pre-sweep list (genuine) →
                    restore link, REMOVE NOTHING
     - p_membershare the genuine individual invite (m_plain): untouched by the
                    sweep, so untouched by the reverse sweep — no teams key,
                    membership preserved (D-50-6 preservation clause)
   The fallback posture (no backup → fail open, zero writes) is exercised by
   the main harness above: its dataDir carries no pre-visibility snapshot.
   ========================================================================== */
describe('restoreTeamLinks (D-50-6): pre-sweep backup provenance', { concurrency: false }, () => {
  const TEAM_LINK_PREFIX = 'projects-pre-team-link-';
  const PRE_SWEEP_PREFIX = 'projects-pre-visibility-';
  let dir;
  let srv;
  let postRestore;

  const wsRow = () =>
    withDb(srv.dbPath, db => db.prepare('select doc, revision from workspaces where id = ?').get(VIS_WS.id));
  const doc = () => JSON.parse(wsRow().doc);
  const project = id => doc().data.projects.find(p => p.id === id);
  const backupsOf = prefix => fs.readdirSync(dir).filter(n => n.startsWith(prefix) && n.endsWith('.db'));

  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-teamlink-'));
    createVisibilityFixtureDb(dir);
    /* 50-05 CR-01: plant the between-boots cell BEFORE the snapshot is taken —
       a team-linked private project that, on the LIVE doc (post-rewrite below),
       holds a sweep-materialized team member (m_team — u_team ∈ engA) AND a
       genuine individual invitee added between the Phase 49 boot and the Phase
       50 boot (m_plain — u_plain is in NO restored team) AND an entry whose
       member_id resolves to no memberships row at all (m_doconly). Only the
       first may be removed by the reverse sweep. */
    const planted = new DatabaseSync(path.join(dir, 'projects.db'));
    try {
      planted.exec(`
        begin;
        update workspaces set doc = json_insert(
          doc,
          '$.data.projects[#]',
          json('{"id":"p_betweenboots","key":"betweenboots","name":"Between Boots","private":true,"members":["m_admin"],"lead":"m_admin","teams":["engA"],"status":"active","perms":{}}'),
          '$.data.projOrder[#]',
          json('"p_betweenboots"')
        ) where id = '${VIS_WS.id}';
        commit;
      `);
    } finally {
      planted.close();
    }
    /* Snapshot the fixture db AS the pre-sweep backup (the real Phase 49
       backup was a full-database vacuum-into of exactly this shape), THEN
       rewrite the live doc to the post-sweep shape: links deleted,
       team-derived members materialized. */
    fs.copyFileSync(path.join(dir, 'projects.db'), path.join(dir, `${PRE_SWEEP_PREFIX}2026-11-07T00-00-00-000Z.db`));
    const raw = new DatabaseSync(path.join(dir, 'projects.db'));
    try {
      raw.exec(`
        begin;
        update workspaces set doc = json_set(
          json_remove(
            doc,
            '$.data.projects[2].members',
            '$.data.projects[2].teams',
            '$.data.projects[3].teams',
            /* [15] = p_betweenboots: appended by the json_insert above, AFTER
               the three Phase 52 fixture cells (p_adminteam/p_leadonly/
               p_lostvis at indices 12-14). Index-targeted surgery — keep in
               sync with VIS_PROJECTS order. */
            '$.data.projects[15].teams'
          ),
          '$.data.projects[2].members', json_array('m_admin', 'm_team'),
          '$.data.projects[15].members', json_array('m_admin', 'm_team', 'm_plain', 'm_doconly')
        ) where id = '${VIS_WS.id}';
        commit;
      `);
    } finally {
      raw.close();
    }
    srv = await startServer({ dataDir: dir });
    postRestore = JSON.stringify({ doc: wsRow().doc, revision: wsRow().revision });
  });

  after(async () => {
    await srv?.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('boot 1 restores the swept links and removes ONLY the sweep-materialized entries', () => {
    /* p_teamshare: pre-sweep members were ['m_admin'] only — the planted
       'm_team' entry is sweep-materialized → moved back to the (restored)
       team link. */
    const share = project('p_teamshare');
    assert.deepEqual(share.teams, ['engA'], 'p_teamshare: the engA link is restored from the snapshot');
    assert.deepEqual(share.members, ['m_admin'], 'p_teamshare: the materialized m_team entry is removed');

    /* p_teamboth: m_team was ALREADY on the pre-sweep access list — the link
       is restored but the genuine individual entry stands (preservation). */
    const both = project('p_teamboth');
    assert.deepEqual(both.teams, ['engA'], 'p_teamboth: the engA link is restored');
    assert.deepEqual(both.members, ['m_admin', 'm_team'], 'p_teamboth: the genuine individual entry is preserved');

    /* The genuine individual invite the sweep never touched: no teams key,
       membership intact (fail-open preservation clause, D-50-6). */
    const genuine = project('p_membershare');
    assert.deepEqual(genuine.teams, [], 'p_membershare: no team link added — the snapshot had none to restore');
    assert.deepEqual(genuine.members, ['m_plain'], 'p_membershare: the genuine individual invite is untouched');

    assert.equal(doc().data.teamLinksRestored, 1, 'the second-boot no-op marker is written once');
  });

  test('restored links grant access through the LIVE funnel (Plan-01 predicate)', async () => {
    const session = await login(srv.base, emailOf('m_team'), VIS_PASSWORD);
    assert.equal(session.status, 200);
    const res = await session.client.get(`/api/workspaces/${VIS_WS.slug}`);
    assert.equal(res.status, 200);
    const ids = (res.data?.doc?.data?.projects || []).map(p => p.id).sort();
    /* Hand-derived: p_teamshare + p_teamboth + p_adminteam via the live engA
       term (p_adminteam is a Phase 52 engA-linked cell), p_lostvis via the
       genuine access-list entry, plus the publics, plus p_betweenboots
       (restored engA link AND restored access-list entry). NOT p_membershare
       (m_plain's genuine invite), NOT p_hidden, NOT p_leadonly. */
    assert.deepEqual(ids, ['p_adminteam', 'p_betweenboots', 'p_legacy', 'p_lostvis', 'p_open', 'p_publicgain', 'p_teamboth', 'p_teamshare']);
  });

  test('between-boots genuine invite survives the sweep; only positively team-derived entries are removed (CR-01, 50-05)', () => {
    const cell = project('p_betweenboots');
    assert.deepEqual(cell.teams, ['engA'], 'the engA link is restored for the between-boots project');
    assert.ok(!cell.members.includes('m_team'), 'the sweep-materialized team member (u_team ∈ engA) is removed');
    assert.ok(cell.members.includes('m_plain'), 'the genuine between-boots invitee (u_plain in NO restored team) survives the sweep');
    assert.ok(cell.members.includes('m_doconly'), 'an entry whose member_id resolves to no memberships row survives (fail-open, D-50-6)');
  });

  test('exactly ONE projects-pre-team-link- backup, and the planted snapshot is untouched', () => {
    assert.equal(backupsOf(TEAM_LINK_PREFIX).length, 1, 'one pre-team-link backup (first migrating boot only)');
    assert.equal(backupsOf(PRE_SWEEP_PREFIX).length, 1, 'the provenance snapshot itself is never rewritten');
  });

  test('second boot is byte-identical: no marker churn, no new backups', async () => {
    await srv.stop();
    srv = await startServer({ dataDir: dir });
    assert.equal(JSON.stringify({ doc: wsRow().doc, revision: wsRow().revision }), postRestore, 'doc bytes identical across the reboot');
    assert.equal(backupsOf(TEAM_LINK_PREFIX).length, 1, 'no second backup on the no-op boot');
  });
});

/* ==========================================================================
   50-02 Task 3 (D-50-10): normalizeGuestRoles — the legacy path. The current
   schema's CHECK constraints admit no 'guest' role, so the fixture rebuilds
   the memberships/invites tables WITHOUT the constraints (the legacy
   pre-constraint shape) and plants raw 'guest' rows. Post-boot both must read
   'viewer', the funnel must treat the member as a viewer, and a second boot
   must be a no-op with zero additional backups.
   ========================================================================== */
describe('normalizeGuestRoles (D-50-10): legacy guest rows normalize to viewer', { concurrency: false }, () => {
  const GUEST_PREFIX = 'projects-pre-guest-normalize-';
  let dir;
  let srv;
  let postNormalize;

  const membershipRole = () =>
    withDb(srv.dbPath, db =>
      db.prepare('select role from memberships where workspace_id = ? and user_id = ?').get(VIS_WS.id, 'u_guest')?.role,
    );
  const inviteRoles = () =>
    withDb(srv.dbPath, db => db.prepare('select email, role from invites where workspace_id = ? order by email').all(VIS_WS.id));
  const backupsOf = prefix => fs.readdirSync(dir).filter(n => n.startsWith(prefix) && n.endsWith('.db'));

  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-guestnorm-'));
    createVisibilityFixtureDb(dir);
    /* Rebuild the two role-bearing tables in the LEGACY pre-CHECK shape and
       plant raw 'guest' rows — production current-schema DBs can never hold
       these; that is exactly why the migration is defensive. */
    const db = new DatabaseSync(path.join(dir, 'projects.db'));
    try {
      db.exec(`
        begin;
        create table memberships_legacy (
          workspace_id text not null,
          user_id      text not null,
          role         text not null,
          member_id    text,
          team         text,
          scope        text,
          primary key (workspace_id, user_id)
        );
        insert into memberships_legacy select workspace_id, user_id, role, member_id, team, scope from memberships;
        drop table memberships;
        alter table memberships_legacy rename to memberships;
        create table invites_legacy (
          token_hash   text primary key,
          email        text,
          role         text not null,
          team         text,
          teams        text,
          workspace_id text,
          created_by   text not null,
          created_at   integer not null,
          expires_at   integer not null,
          used_at      integer,
          used_by      text,
          scope        text
        );
        insert into invites_legacy select token_hash, email, role, team, teams, workspace_id, created_by, created_at, expires_at, used_at, used_by, scope from invites;
        drop table invites;
        alter table invites_legacy rename to invites;
        update memberships set role = 'guest' where user_id = 'u_guest';
        update invites set role = 'guest';
        commit;
      `);
    } finally {
      db.close();
    }
    srv = await startServer({ dataDir: dir });
    postNormalize = JSON.stringify({ memberships: membershipRole(), invites: inviteRoles() });
  });

  after(async () => {
    await srv?.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('boot 1 rewrites every legacy guest row to viewer (memberships AND invites)', () => {
    assert.equal(membershipRole(), 'viewer', 'the planted memberships role guest → viewer');
    const roles = inviteRoles().map(r => r.role);
    assert.ok(roles.length >= 1, 'the planted invite row is present');
    assert.ok(roles.every(r => r === 'viewer'), 'every planted invites role guest → viewer');
  });

  test('the funnel treats the normalized member as a viewer (D-50-11: behavior, not data model)', async () => {
    const session = await login(srv.base, emailOf('m_guest'), VIS_PASSWORD);
    assert.equal(session.status, 200);
    const res = await session.client.get(`/api/workspaces/${VIS_WS.slug}`);
    assert.equal(res.status, 200);
    const ids = (res.data?.doc?.data?.projects || []).map(p => p.id).sort();
    assert.deepEqual(ids, [...VISIBILITY_MODEL.m_guest].sort(), 'viewer semantics after normalization');
  });

  test('exactly ONE projects-pre-guest-normalize- backup (no backup = no mutation held)', () => {
    assert.equal(backupsOf(GUEST_PREFIX).length, 1, 'one pre-guest-normalize backup, first migrating boot only');
  });

  test('second boot is a no-op: no drift, no additional backups', async () => {
    await srv.stop();
    srv = await startServer({ dataDir: dir });
    assert.equal(JSON.stringify({ memberships: membershipRole(), invites: inviteRoles() }), postNormalize, 'no drift across the reboot');
    assert.equal(backupsOf(GUEST_PREFIX).length, 1, 'no second backup on the no-op boot');
  });
});
