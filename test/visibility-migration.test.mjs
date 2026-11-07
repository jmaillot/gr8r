/* Phase 49 (49-02): the set-equality + byte-identity migration harness with the
   sweep pins ACTIVE (D-49-1 flip, 2026-11-07). Boots the real server against
   the 13-cell visibility fixture plus a planted fail-open scope cell and pins:
     1. the fixture's legacy shapes on disk BEFORE the boot (the sweep's input);
     2. post-boot: scope columns NULL everywhere (D-49-1), no p.teams and no
        p.access anywhere (D-49-4/5), the sealed shape preserved (D-49-8), the
        doc-only team profile never materialized;
     3. per-actor doc-GET visibility == the old oracle + the dated interim
        sweep delta (POST_SWEEP_SERVER_DELTA) — the plan's set-equality pin
        against the UNCHANGED VISIBILITY_MODEL oracle, with the unsweepable
        cells (public projects for now-null-scope actors; the pruned-empty
        injection for the owner) carried as an explicit dated delta that
        Plan 03 replaces with the collapsed-model pins;
     4. the fail-open scope-parse cell (T-49-04): corrupt scope JSON behaves
        as workspace-wide — never a lockout, never an elevation;
     5. a second boot is byte-identical with EXACTLY ONE projects-pre-visibility-
        backup (D-49-6 marker). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, test } from 'node:test';
import {
  createVisibilityFixtureDb,
  POST_SWEEP_SERVER_DELTA,
  postSweepIds,
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
  m_owner: 'owner@visfix.local',
  m_plain: 'plain@visfix.local',
  m_team: 'team@visfix.local',
  m_scoped: 'scoped@visfix.local',
  m_guest: 'guest@visfix.local',
  m_doconly: 'doconly@visfix.local',
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
  assert.equal(preProjects.p_sealed.private, true, 'the sealed project is sealed on disk pre-boot (D-49-8 input)');
  assert.equal(preBoot.revision, 1, 'the fixture ships at revision 1');
});

test('post-sweep: scope columns are NULL everywhere and the boot stayed deterministic (D-49-1)', () => {
  /* 2026-11-07 (D-49-1): flipped from the pre-sweep value pins — the sweep is
     `update memberships/invites set scope = null` inside the doc-write
     transaction, so EVERY row reads NULL after one boot. */
  assert.ok(membershipRows().length >= 7, 'all memberships present');
  assert.ok(membershipRows().every(r => r.scope === null), 'every memberships.scope is NULL');
  assert.ok(inviteRows().every(r => r.scope === null), 'every invites.scope is NULL');

  /* The sweep's raw doc write never churns the envelope (A5): revision, slug,
     name and the TEAM-01 state are untouched. */
  assert.equal(docRow().revision, 1);
  assert.equal(docRow().slug, VIS_WS.slug);
  assert.ok(membershipRows().every(r => r.team === null), 'the TEAM-01 backfill still found zero eligible rows');
});

test('post-sweep: no p.teams, no p.access, and the materialized grant set is exact (D-49-4/5/7/8)', () => {
  const projects = projectById();

  for (const p of Object.values(projects)) {
    assert.equal('teams' in p, false, `${p.id}: p.teams deleted (D-49-5)`);
    assert.equal('access' in p, false, `${p.id}: p.access deleted (D-49-4)`);
  }
  assert.equal(projects.p_legacy.private, true, 'the legacy p.access string normalized to the boolean (D-49-4)');

  /* Materialized grants — exactly the old-predicate reach, per cell: */
  assert.deepEqual(projects.p_teamshare.members.includes('m_team'), true, 'team-intersection grant materialized (m_team)');
  assert.deepEqual(projects.p_teamshare.members.includes('m_doconly'), false, 'doc-only profile (no memberships row) NOT materialized');
  assert.deepEqual(projects.p_membershare.members.includes('m_guest'), true, 'scope.projects grant materialized (m_guest, D-03)');
  assert.deepEqual(projects.p_scopeproj.members.includes('m_scoped'), true, 'scope.projects grant materialized (m_scoped, D-03)');
  assert.deepEqual(projects.p_scopeproj.members.includes('m_owner'), true, 'owner entry pinned: the grant un-empties the project and switches off normalizeProjects\' owner injection');
  assert.deepEqual(projects.p_scopeteam.members.includes('m_scoped'), true, 'scope.teams ∩ p.teams grant materialized (D-03 A1)');
  assert.deepEqual(projects.p_scopeddeny.members.includes('m_scoped'), false, 'out-of-scope access-list entry dissolved — old-hidden stays hidden');
  assert.deepEqual(projects.p_scopeddeny.private, true, 'the dissolved project stays private');
  assert.deepEqual(projects.p_hidden.members, ['m_admin'], 'no phantom grants: the hidden cell keeps its exact list');

  /* D-49-8: the sealed cell keeps its exact sealed shape — no ownerId
     injected, private not flipped (the sweep never calls normalizeProjects). */
  const sealed = projects.p_sealed;
  assert.deepEqual(sealed.members, [], 'the sealed project keeps its empty members list');
  assert.equal(sealed.private, true, 'the sealed project stays private');
});

test('sweep set-equality: every actor’s doc-GET visibility equals the oracle + the dated sweep delta', async () => {
  /* 2026-11-07: the oracle rows (VISIBILITY_MODEL) are UNTOUCHED — the old
     model, hand-derived and probe-corrected. The sweep runs during boot over
     the OLD predicate, which induces exactly two unsweepable interim cells,
     carried by POST_SWEEP_SERVER_DELTA (fixture helper, dated): scoped actors
     ride the null-scope branch and gain every PUBLIC project (A3 gain —
     inherent to clearing the scope columns, Plan 03 owns it), and the owner
     sees the pruned-empty p_scopeddeny via normalizeProjects' injection
     (pre-existing sealed-project behavior). Everything else is byte-equal to
     the old map — nothing old-visible is lost, nothing old-hidden gained. */
  for (const actor of VIS_ACTORS) {
    const { status, ids } = await visibleViaDocGet(emailOf(actor));
    if (actor === 'm_doconly') {
      assert.equal(status, 404, 'the doc-only profile has no memberships row and cannot read the workspace');
      continue;
    }
    assert.equal(status, 200, `${actor} reads the workspace doc`);
    assert.deepEqual(ids, postSweepIds(VISIBILITY_MODEL, actor, POST_SWEEP_SERVER_DELTA), `${actor} sees exactly the oracle + dated delta set`);
  }
});

test('fail-open scope-parse cell: corrupt scope JSON behaves as workspace-wide (T-49-04)', async () => {
  /* m_corrupt's scope column is unparseable ('not-json{'). Old-model semantics
     (projectScope :816-829, D-04 fail-open, D-49-retired): treated as workspace-wide — the
     null-scope branch (public ∨ access list ∨ live team intersection). The
     sweep reproduces that exactly: the engA team grant materializes onto
     p_teamshare, nothing else is granted (no elevation), and the member is
     not locked out of anything they could read before. */
  const { status, ids } = await visibleViaDocGet('corrupt@visfix.local');
  assert.equal(status, 200, 'the corrupt-scope member still reads the workspace');
  assert.deepEqual(ids, ['p_open', 'p_publicgain', 'p_teamshare'], 'workspace-wide fail-open: team grant + publics, nothing more');
  const projects = projectById();
  assert.deepEqual(projects.p_teamshare.members.includes('m_corrupt'), true, 'the team grant materialized through the corrupt scope');
  assert.deepEqual(projects.p_hidden.members.includes('m_corrupt'), false, 'fail-open is workspace-wide semantics, NOT all-access');
});

test('second boot is byte-identical and exactly ONE pre-visibility backup exists (D-49-6)', async () => {
  const firstBoot = snapshot();
  await server.stop();

  server = await startServer({ dataDir });
  const secondBoot = snapshot();
  assert.deepEqual(secondBoot, firstBoot, 'no doc/scope/rows drift across the reboot');
  /* 2026-11-07 (D-49-1): flipped 0 → 1 — the first boot minted the guarded
     pre-sweep backup; the second finds the D-49-6 marker absent (no p.teams,
     no p.access, all scopes NULL) and writes nothing. */
  assert.equal(backups().length, 1, 'exactly one projects-pre-visibility-*.db after two boots');

  /* The swept model still holds on the rebooted server — visibility is stable
     across boots, not just within one process. */
  const plain = await visibleViaDocGet(emailOf('m_plain'));
  assert.deepEqual(plain.ids, postSweepIds(VISIBILITY_MODEL, 'm_plain', POST_SWEEP_SERVER_DELTA));
  const scoped = await visibleViaDocGet(emailOf('m_scoped'));
  assert.deepEqual(scoped.ids, postSweepIds(VISIBILITY_MODEL, 'm_scoped', POST_SWEEP_SERVER_DELTA));
  const owner = await visibleViaDocGet(emailOf('m_owner'));
  assert.deepEqual(owner.ids, postSweepIds(VISIBILITY_MODEL, 'm_owner', POST_SWEEP_SERVER_DELTA));
});
