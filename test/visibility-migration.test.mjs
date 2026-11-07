/* Phase 49 (49-01): the set-equality + byte-identity migration harness.
   Boots the real server against the 13-cell visibility fixture and pins, BEFORE
   any behavior change:
     1. per-actor doc-GET visibility == VISIBILITY_MODEL (the independent,
        hand-derived oracle — never memberCanReadProject output);
     2. the scope columns are non-NULL pre-sweep (Plan 02 flips this to NULL in
        the same commit as the visibility sweep, D-49-1);
     3. a second boot is byte-identical, with zero pre-visibility backups under
        the old model (Plan 02 pins exactly one, D-49-1).
   Success-criterion-1 pin: green today (old model) and after Plans 02/03
   (sweep + collapse reproduce the map, except the one documented gain cell —
   p_publicgain — whose flip Plan 03 owns). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createVisibilityFixtureDb, VISIBILITY_MODEL, VIS_ACTORS, VIS_GUEST_SCOPE, VIS_PASSWORD, VIS_SCOPED_SCOPE, VIS_WS } from './helpers/visibility-fixture.mjs';
import { login, startServer, withDb } from './helpers/server.mjs';

/* 2026-11-07 (D-49-1): Plan 02 flips the expected backup count 0 → 1 and the
   scope-column assertions below to NULL in the same commit as the sweep. */
const VIS_BACKUP_PREFIX = 'projects-pre-visibility-';

let dataDir;
let server;

const backups = () => fs.readdirSync(dataDir).filter(name => name.startsWith(VIS_BACKUP_PREFIX) && name.endsWith('.db'));

const docRow = () =>
  withDb(server.dbPath, db => db.prepare('select id, slug, name, color, doc, revision, updated_at from workspaces where id = ?').get(VIS_WS.id));
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
const teamMemberRows = () =>
  withDb(server.dbPath, db =>
    db
      .prepare('select team_id, member_id, user_id from team_members where workspace_id = ? order by team_id, user_id')
      .all(VIS_WS.id),
  );

/* Everything the visibility state owns, compared byte-for-byte across reboot. */
function snapshot() {
  return {
    workspace: docRow(),
    memberships: membershipRows(),
    invites: inviteRows(),
    teamMembers: teamMemberRows(),
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
  server = await startServer({ dataDir });
});

after(async () => {
  await server?.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('fixture DB: scope columns are populated and the legacy shapes survive the boot', () => {
  const doc = JSON.parse(docRow().doc);
  const projects = Object.fromEntries(doc.data.projects.map(p => [p.id, p]));

  /* Task 1 acceptance: ≥1 memberships scope, ≥1 invites scope, ≥1 p.teams, ≥1 p.access string. */
  assert.ok(membershipRows().some(r => r.scope !== null && r.scope !== undefined), 'a memberships row carries a scope value');
  assert.ok(inviteRows().some(r => r.scope !== null && r.scope !== undefined), 'an invites row carries a scope value');
  assert.ok(Object.values(projects).some(p => Array.isArray(p.teams)), 'a stored project carries p.teams');
  assert.ok(Object.values(projects).some(p => p.access === 'private'), 'a stored project carries the legacy p.access string');
  assert.equal(projects.p_sealed.private, true, 'the sealed project stays sealed in storage (D-49-8)');

  /* The boot wrote nothing: slug/name/revision untouched, memberships.team
     still NULL (no TEAM-01 backfill), member_ids linked. */
  assert.equal(docRow().slug, VIS_WS.slug);
  assert.equal(docRow().revision, 1);
  assert.ok(membershipRows().every(r => r.team === null), 'the TEAM-01 backfill found zero eligible rows');
});

test('scope-column state (pre-sweep): the stored scope values are exactly what the fixture wrote', () => {
  /* 2026-11-07 (D-49-1): Plan 02 flips these to `=== null` in the same commit
     as the visibility sweep — the sweep is `update memberships/invites set
     scope = null` inside the doc-write transaction. */
  const scopes = Object.fromEntries(membershipRows().map(r => [r.member_id, r.scope]));
  assert.deepEqual(JSON.parse(scopes.m_scoped), VIS_SCOPED_SCOPE, 'm_scoped keeps {projects, teams} scope');
  assert.deepEqual(JSON.parse(scopes.m_guest), VIS_GUEST_SCOPE, 'm_guest keeps the invite-derived scope');
  const [invite] = inviteRows();
  assert.deepEqual(JSON.parse(invite.scope), VIS_GUEST_SCOPE, 'the invites row keeps its scope');
});

test('old→new set-equality: every actor’s doc-GET visibility equals the VISIBILITY_MODEL oracle', async () => {
  for (const actor of VIS_ACTORS) {
    const { status, ids } = await visibleViaDocGet(emailOf(actor));
    if (actor === 'm_doconly') {
      assert.equal(status, 404, 'the doc-only profile has no memberships row and cannot read the workspace');
      continue;
    }
    assert.equal(status, 200, `${actor} reads the workspace doc`);
    assert.deepEqual(ids, [...VISIBILITY_MODEL[actor]].sort(), `${actor} sees exactly the oracle set`);
  }
});

test('second boot is byte-identical and writes no pre-visibility backup (old model)', async () => {
  const firstBoot = snapshot();
  await server.stop();

  server = await startServer({ dataDir });
  const secondBoot = snapshot();
  assert.deepEqual(secondBoot, firstBoot, 'no doc/scope/rows drift across the reboot');
  /* 2026-11-07 (D-49-1): zero under the old model — Plan 02 pins exactly one
     pre-visibility backup in the same commit as the sweep. */
  assert.equal(backups().length, 0, 'no projects-pre-visibility-*.db under the old model');

  /* The oracle still holds on the rebooted server — visibility is stable
     across boots, not just within one process. */
  const plain = await visibleViaDocGet(emailOf('m_plain'));
  assert.deepEqual(plain.ids, [...VISIBILITY_MODEL.m_plain].sort());
  const scoped = await visibleViaDocGet(emailOf('m_scoped'));
  assert.deepEqual(scoped.ids, [...VISIBILITY_MODEL.m_scoped].sort());
});
