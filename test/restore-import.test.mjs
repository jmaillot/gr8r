/* =====================================================================
   Restore import-as-new suite (Phase 89, plan 89-04, BKRST-02).

   Pins the restore engine before the trigger/pipeline exist (tracer):
   - full in-process import-as-new: export a planted workspace (projects,
     tasks with parentId chains, comments, files incl. one missingBlob-
     flagged, teams) → restoreImportAsNew → a NEW workspaces row with a
     remapped doc whose whole id graph is fresh and internally consistent;
   - operator-only membership (D-89-9): archive memberships/invites are
     never authoritative — every archive membership row skips + reports;
   - dangling user_id rows (memberships/team_members/invites referencing
     non-live users) are validated-and-skipped-and-reported, never inserted
     (prohibition P4 / Pitfall 3);
   - a crafted doc referencing an unknown project id fails keyed
     restoreRemapIncomplete BEFORE any insert — no partial row (prohibition
     P5 / D-89-10 totality);
   - file blobs re-address FLAT as FILES_DIR/<freshId> (86 A6), the
     missingBlob-flagged row restored flagged with no blob (D-89-12/86-D-4);
   - the restore_runs row (via the writer-seam events) lands done with
     final_name + the skip-report summary JSON (D-89-7);
   - the -restored auto-counter walks -restored → -restored-2 (D-89-13);
   - a project-scope archive splices its fragment into a live target
     workspace with a revision bump and FTS sync.

   Fixture: temp DATA_DIR + in-process db-adapter on a SQLite database —
   the test/backup-export.test.mjs precedent. Dangling user_id rows are
   planted through a raw DatabaseSync handle (no FK pragma) — the
   production reality this engine must survive: rows written before the
   referenced user was deleted.
   ===================================================================== */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { after, before, test } from 'node:test';

/* DATA_DIR must be set BEFORE export/backup.js / export/restore.js are
   imported (paths derive from the env at call time). */
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-restore-import-'));
process.env.DATA_DIR = DATA_DIR;
const FILES_DIR = path.join(DATA_DIR, 'files');
const LOGOS_DIR = path.join(DATA_DIR, 'logos');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

const db = await import('../db-adapter.mjs');
const backup = await import('../export/backup.js');
const restore = await import('../export/restore.js');

const NOW = 1700000000000;
const OP_ID = '11111111-1111-4111-8111-111111111111'; // the restoring operator (live)
const LIVE_ID = '22222222-2222-4222-8222-222222222222'; // another live user
const GHOST_ID = 'ghost-user-0001'; // NO users row — deleted after these rows were written
const WS_ID = 'ws-arch';
const OP_MEMBER = 'm_1111111';

/* The archived workspace document — rich enough to exercise every remap
   edge: project refs, a parentId chain, a comment→task ref, file→project
   refs, a team definition (with a stale members array that must NOT
   survive), projOrder, a string logo id, and roster-space values
   (member_id) that must never ferry across (Pitfall 4). */
function richDoc() {
  return {
    data: {
      members: [{ id: 'm_ghostus', name: 'Ghost', color: '#000000' }], // must be dropped
      projects: [
        { id: 'p1', name: 'Alpha', color: '#111111' },
        { id: 'p2', name: 'Beta', color: '#222222' },
      ],
      tasks: [
        { id: 't1', project: 'p1', title: 'Root', desc: 'root body' },
        { id: 't2', project: 'p1', parentId: 't1', title: 'Sub', desc: '' },
        { id: 't3', project: 'p2', title: 'Other', desc: '', assignees: ['m_ghostus'] },
      ],
      comments: [{ id: 'c1', taskId: 't1', memberId: 'm_ghostus', body: 'hello', createdAt: NOW }],
      files: [
        { id: 'f1', project: 'p1', name: 'a.txt', ext: 'txt' },
        { id: 'fgone', project: 'p2', name: 'g.txt', ext: 'txt' }, // blob absent → missingBlob at export
      ],
      teams: [{ id: 'team1', name: 'Core', color: '#ff0000', members: ['m_ghostus'] }],
      projOrder: ['p1', 'p2'],
      logo: 'lg1', // string logo id (the 86 collector shape)
      activity: [{ id: 'act1', kind: 'task_created', at: NOW }],
      notifs: [{ id: 'n1', to: 'm_ghostus', text: 'note', at: NOW }],
    },
  };
}

async function freshDb() {
  await db.close();
  await db.connectDb({ dbPath: path.join(DATA_DIR, 'projects.db') });
  await db.runSchema(db.SQLITE_SCHEMA);
  await db.ensureSearchIndex(); // task_fts exists from boot in production (server.js boot call)
}

/* Raw handle WITHOUT the FK pragma — for planting rows that reference
   users deleted after the fact (the exact archive shape Pitfall 3 covers). */
function rawDb() {
  /* FK off via pragma — the point of this handle is planting rows whose
     user was deleted after the fact (the archive shape Pitfall 3 covers).
     node:sqlite enables FK by default and the constructor option only
     landed later; the pragma works on this runtime. */
  const raw = new DatabaseSync(path.join(DATA_DIR, 'projects.db'));
  raw.exec('pragma foreign_keys = off');
  raw.exec('pragma busy_timeout = 5000');
  return raw;
}

function sha256Hex(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

/* ---- In-process writer mirror: install restore.js's emitter seam and
   persist the events into real restore_runs rows (server.js
   writeRestoreRunRow statements, verbatim SQL shapes) so the run-row
   contract is pinned at engine level. ---- */
restore.setRestoreRunEmitter(async event => {
  const t = Date.now();
  /* The engine never emits 'start' (the trigger route owns the start row,
     Task 2) — mirror that contract by upserting the base row first so the
     standalone engine is observable. */
  await db.run(
    'insert or ignore into restore_runs (id, scope, trigger, status, stage, started_at, created_at) values (?,?,?,?,?,?,?)',
    [event.runId, '{}', event.trigger ?? 'import_new', 'running', 'fetching', event.startedAt ?? t, t],
  );
  if (event.kind === 'start') {
    await db.run(
      'insert into restore_runs (id, scope, trigger, status, stage, started_at, created_at) values (?,?,?,?,?,?,?)',
      [event.runId, JSON.stringify(event.scope ?? {}), event.trigger ?? 'import_new', 'running', 'fetching', event.startedAt ?? t, t],
    );
  } else if (event.kind === 'update') {
    await db.run(
      'update restore_runs set stage = coalesce(?, stage), final_name = coalesce(?, final_name), summary = coalesce(?, summary) where id = ?',
      [event.stage ?? null, event.finalName ?? null, event.summary ?? null, event.runId],
    );
  } else if (event.kind === 'fail') {
    await db.run(
      "update restore_runs set status = 'failed', stage = 'failed', error = ?, finished_at = ? where id = ?",
      [String(event.error ?? '').slice(0, 300), event.finishedAt ?? t, event.runId],
    );
  } else if (event.kind === 'finish') {
    await db.run(
      "update restore_runs set status = 'done', stage = 'done', summary = coalesce(?, summary), final_name = coalesce(?, final_name), finished_at = ? where id = ?",
      [event.summary ?? null, event.finalName ?? null, event.finishedAt ?? t, event.runId],
    );
  }
});

const runRow = id => db.get('select * from restore_runs where id = ?', [id]);
const workspaceCount = async () => (await db.get('select count(*) as n from workspaces')).n;

before(async () => {
  await freshDb();
  fs.mkdirSync(FILES_DIR, { recursive: true });
  fs.mkdirSync(LOGOS_DIR, { recursive: true });
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });

  // live users (the identity universe, D-33-10)
  await db.run('insert into users (id, email, name, password_hash, created_at) values (?,?,?,?,?)', [OP_ID, 'op@test.local', 'Operator', 'h', NOW]);
  await db.run('insert into users (id, email, name, password_hash, created_at) values (?,?,?,?,?)', [LIVE_ID, 'live@test.local', 'Live', 'h', NOW]);
  // operational rows the import must NEVER insert — only report (D-89-7)
  await db.run('insert into instance_roles (id, user_id, role, granted_by, granted_at) values (?,?,?,?,?)', ['ir-1', OP_ID, 'restore_operator', OP_ID, NOW]);

  // the archived workspace + its roster rows
  await db.run(
    'insert into workspaces (id, slug, name, color, doc, revision, created_at, updated_at, archived) values (?,?,?,?,?,?,?,?,?)',
    [WS_ID, 'acme', 'Acme', '#123456', JSON.stringify(richDoc()), 7, NOW, NOW, 0],
  );
  await db.run('insert into memberships (workspace_id, user_id, role, member_id, provenance) values (?,?,?,?,?)', [WS_ID, OP_ID, 'member', OP_MEMBER, 'manual']);
  await db.run('insert into memberships (workspace_id, user_id, role, member_id, provenance) values (?,?,?,?,?)', [WS_ID, LIVE_ID, 'admin', 'm_2222222', 'manual']);
  await db.run('insert into team_members (workspace_id, team_id, member_id, user_id) values (?,?,?,?)', [WS_ID, 'team1', OP_MEMBER, OP_ID]);
  await db.run('insert into invites (token_hash, email, role, workspace_id, created_by, created_at, expires_at) values (?,?,?,?,?,?,?)', [
    'tok-1', 'inv@test.local', 'member', WS_ID, OP_ID, NOW, NOW + 86_400_000,
  ]);
  // dangling rows (user deleted after the rows were written) — raw handle
  const raw = rawDb();
  try {
    raw
      .prepare('insert into memberships (workspace_id, user_id, role, member_id, provenance) values (?,?,?,?,?)')
      .run(WS_ID, GHOST_ID, 'admin', 'm_ghostus', 'manual');
    raw.prepare('insert into team_members (workspace_id, team_id, member_id, user_id) values (?,?,?,?)').run(WS_ID, 'team1', 'm_ghostus', GHOST_ID);
    raw
      .prepare('insert into invites (token_hash, email, role, workspace_id, created_by, created_at, expires_at) values (?,?,?,?,?,?,?)')
      .run('tok-ghost', 'ghost@test.local', 'member', WS_ID, GHOST_ID, NOW, NOW + 86_400_000);
  } finally {
    raw.close();
  }

  fs.writeFileSync(path.join(FILES_DIR, 'f1'), 'project one blob\n');
  fs.writeFileSync(path.join(LOGOS_DIR, 'lg1'), 'logo-one-bytes');
  // fgone blob deliberately absent → missingBlob flag at export (86-D-4)
});

after(async () => {
  await db.close();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

const archiveOf = run => path.join(BACKUPS_DIR, run.filename);

const importOpts = (run, runId, extra = {}) => ({
  runId,
  archivePath: archiveOf(run),
  expectedSha256: run.sha256,
  scope: { kind: 'workspace', id: WS_ID },
  operatorId: OP_ID,
  trigger: 'import_new',
  startedAt: Date.now(),
  ...extra,
});

/* ---------- Task 1 tracer: the full in-process import-as-new ---------- */

test('89-04 tracer: a workspace archive imports as-new with totality-validated remap, operator-only membership, flat blobs, and a skip report', async () => {
  const run = await backup.runExport({ kind: 'workspace', id: WS_ID });
  assert.equal(run.ok, true, `runExport failed: ${run.error}`);

  const res = await restore.restoreImportAsNew(importOpts(run, 'run-1'));
  assert.equal(res.ok, true, `restore failed: ${res.code ?? ''} ${res.error ?? ''}`);
  assert.ok(res.workspaceId && res.workspaceId !== WS_ID, 'a NEW workspace id was assigned');
  assert.equal(res.finalName, 'Acme-restored', 'D-89-13: the -restored suffix lands on first import');

  const row = await db.get('select * from workspaces where id = ?', [res.workspaceId]);
  assert.ok(row, 'the restored workspace row exists');
  assert.equal(row.name, 'Acme-restored');
  assert.equal(row.slug, res.slug);
  assert.equal(row.revision, 1, 'import-as-new seeds revision 1');
  assert.equal(row.archived, 0);

  const doc = JSON.parse(row.doc).data;
  /* post-normalizeDoc shape: ws meta + me:null; roster/prefs/sessions NEVER ferry across */
  assert.deepEqual(doc.ws, { name: 'Acme-restored', url: res.slug, c: '#123456', brand: true });
  assert.equal(doc.me, null);
  assert.equal(doc.members, undefined, 'archived roster members array dropped (D-89-9)');
  assert.equal(doc.notifPrefs, undefined);
  assert.equal(doc.sessions, undefined);
  assert.equal(doc.tfa, undefined);

  /* whole id graph fresh + internally consistent */
  const projIds = doc.projects.map(p => p.id);
  assert.equal(projIds.length, 2);
  assert.ok(projIds.every(id => id && id !== 'p1' && id !== 'p2'), 'project ids fresh');
  assert.ok(new Set(projIds).size === 2, 'project ids unique');
  assert.deepEqual(doc.projOrder, projIds, 'projOrder remapped onto the fresh project ids, order kept');
  const t1 = doc.tasks.find(t => t.title === 'Root');
  const t2 = doc.tasks.find(t => t.title === 'Sub');
  const t3 = doc.tasks.find(t => t.title === 'Other');
  assert.notEqual(t1.id, 't1');
  assert.notEqual(t2.id, 't2');
  assert.equal(t2.parentId, t1.id, 'parentId chain resolves onto the remapped parent');
  assert.equal(t1.project, projIds[0]);
  assert.equal(t3.project, projIds[1]);
  assert.deepEqual(t3.assignees, [], 'archived member_id assignees dropped (Pitfall 4 — roster space never ferries)');
  const comment = doc.comments[0];
  assert.notEqual(comment.id, 'c1');
  assert.equal(comment.taskId, t1.id, 'comment.taskId resolves onto the remapped task');
  const file1 = doc.files.find(f => f.name === 'a.txt');
  const fgone = doc.files.find(f => f.name === 'g.txt');
  assert.notEqual(file1.id, 'f1');
  assert.equal(file1.project, projIds[0], 'file.project remapped');
  assert.ok(fgone, 'the missingBlob-flagged record still restores (86-D-4)');
  const team = doc.teams[0];
  assert.notEqual(team.id, 'team1');
  assert.equal(team.name, 'Core');
  assert.equal('members' in team, false, 'stale team member arrays stripped (normalizeDoc discipline)');
  assert.notEqual(doc.logo, 'lg1', 'logo id remapped (string shape kept)');
  assert.ok(doc.notifs[0] && doc.notifs[0].to === 'm_ghostus', 'notifications kept with their to field');
  assert.ok(Array.isArray(doc.activity) && doc.activity.length === 1, 'activity kept');

  /* operator-only membership (D-89-9); archive roster rows never authoritative */
  const members = await db.all('select * from memberships where workspace_id = ?', [res.workspaceId]);
  assert.equal(members.length, 1, 'exactly ONE membership row: the restoring operator');
  assert.equal(members[0].user_id, OP_ID);
  assert.equal(members[0].role, 'owner');
  const invites = await db.all('select * from invites where workspace_id = ?', [res.workspaceId]);
  assert.equal(invites.length, 0, 'archive invite rows are NEVER inserted');
  const teamMembers = await db.all('select * from team_members where workspace_id = ?', [res.workspaceId]);
  assert.equal(teamMembers.length, 1, 'only the live-user team_members row inserted');
  assert.equal(teamMembers[0].user_id, OP_ID);
  assert.notEqual(teamMembers[0].team_id, 'team1', 'team_id remapped onto the fresh team definition');

  /* blobs re-addressed FLAT (86 A6); the missingBlob row has no blob */
  assert.ok(fs.existsSync(path.join(FILES_DIR, file1.id)), 'file blob at FILES_DIR/<freshId>');
  assert.equal(fs.readFileSync(path.join(FILES_DIR, file1.id), 'utf8'), 'project one blob\n');
  assert.ok(fs.existsSync(path.join(LOGOS_DIR, doc.logo)), 'logo blob at LOGOS_DIR/<freshId>');
  assert.equal(fs.existsSync(path.join(FILES_DIR, fgone.id)), false, 'missingBlob-flagged row restored with NO blob');

  /* skip report (D-89-7): operational tables + every archive membership skipped, honestly counted */
  assert.deepEqual(res.summary.memberships, { skipped: 3, inserted: 1 }, 'ALL archive memberships skipped + reported, operator inserted');
  assert.deepEqual(res.summary.teamMembers, { skipped: 1, inserted: 1 }, 'ghost team_members row skipped + reported');
  const skippedTables = Object.fromEntries(res.summary.skipped.map(s => [s.table, s.rows]));
  assert.equal(skippedTables.users, 2, 'operational users rows counted, never inserted');
  assert.equal(skippedTables.instance_roles, 1, 'operational instance_roles rows counted, never inserted');
  assert.equal(skippedTables.invites, 2, 'invites skipped + reported (both live- and ghost-referencing)');
  assert.equal((await db.all('select * from users')).length, 2, 'no users row inserted');

  /* the run row: done + final_name + summary JSON (writer-seam contract) */
  const runRow1 = await runRow('run-1');
  assert.equal(runRow1.status, 'done');
  assert.equal(runRow1.stage, 'done');
  assert.equal(runRow1.final_name, 'Acme-restored');
  const persistedSummary = JSON.parse(runRow1.summary);
  assert.ok(Array.isArray(persistedSummary.skipped), 'summary JSON carries the skipped tables');
  assert.deepEqual(persistedSummary.memberships, { skipped: 3, inserted: 1 });
});

test('89-04: a second import of the same archive auto-counters to -restored-2 with a wholly fresh id space', async () => {
  const run = await backup.runExport({ kind: 'workspace', id: WS_ID });
  assert.equal(run.ok, true);
  const res = await restore.restoreImportAsNew(importOpts(run, 'run-2'));
  assert.equal(res.ok, true, `restore failed: ${res.code ?? ''} ${res.error ?? ''}`);
  assert.equal(res.finalName, 'Acme-restored-2', 'D-89-13: the counter walks -restored-2');
  const first = await db.get('select id from workspaces where name = ?', ['Acme-restored']);
  assert.notEqual(res.workspaceId, first.id, 'a different fresh workspace id');
  const members = await db.all('select * from memberships where workspace_id = ?', [res.workspaceId]);
  assert.equal(members.length, 1);
  const runRow2 = await runRow('run-2');
  assert.equal(runRow2.final_name, 'Acme-restored-2', 'run row records the final name');
});

/* ---------- planRemap unit pins (pure logic, prohibition P4/P5) ---------- */

test('89-04 planRemap (unit): an unmapped project reference fails keyed restoreRemapIncomplete BEFORE any insert', () => {
  const rows = {
    workspaces: [
      {
        id: WS_ID,
        slug: 'acme',
        name: 'Acme',
        color: '#123456',
        doc: JSON.stringify({ data: { projects: [{ id: 'p1' }], tasks: [{ id: 't1', project: 'p-unknown', title: 'Evil' }] } }),
        revision: 1,
        created_at: NOW,
        updated_at: NOW,
        archived: 0,
      },
    ],
    memberships: [],
    team_members: [],
    invites: [],
  };
  const manifest = { scope: { kind: 'workspace', id: WS_ID }, tables: [], files: [] };
  assert.throws(
    () => restore.planRemap(manifest, rows, { operatorId: OP_ID, isLiveUser: () => true }),
    err => err.code === 'restoreRemapIncomplete',
    'totality gate refuses pre-write with the keyed class (D-89-10)',
  );
});

test('89-04 planRemap (unit): user ids are NEVER remapped (prohibition P4 — live users are the identity universe)', () => {
  const rows = {
    workspaces: [
      { id: WS_ID, slug: 'acme', name: 'Acme', color: '#123456', doc: JSON.stringify({ data: { projects: [], tasks: [], files: [], comments: [], teams: [], projOrder: [] } }), revision: 1, created_at: NOW, updated_at: NOW, archived: 0 },
    ],
    memberships: [{ workspace_id: WS_ID, user_id: OP_ID, role: 'owner', member_id: 'm_1111111', provenance: 'manual' }],
    team_members: [],
    invites: [],
  };
  const manifest = { scope: { kind: 'workspace', id: WS_ID }, tables: [], files: [] };
  const plan = restore.planRemap(manifest, rows, { operatorId: LIVE_ID, isLiveUser: id => id === LIVE_ID });
  /* Only the operator row is EVER planned, carrying the operator id
     verbatim — the archive's user_id (OP_ID) is never translated onto the
     live operator (P4: user ids are never remapped, D-33-10); the archive
     row skips + reports instead. */
  assert.equal(plan.membershipRows.length, 1, 'only the operator membership is planned');
  assert.equal(plan.membershipRows[0].userId, LIVE_ID, 'the operator id rides verbatim');
  assert.equal(plan.membershipsSkipped, 1, 'the archive membership row skips + reports');
});

/* ---------- prohibition P5 end-to-end: crafted archive, no partial state ---------- */

test('89-04: a crafted doc referencing an unknown project id fails keyed restoreRemapIncomplete with zero rows inserted', async () => {
  const run = await backup.runExport({ kind: 'workspace', id: WS_ID });
  assert.equal(run.ok, true);
  const src = archiveOf(run);
  const into = path.join(DATA_DIR, 'craft-extract');
  fs.rmSync(into, { recursive: true, force: true });
  fs.mkdirSync(into, { recursive: true });
  execFileSync('tar', ['xzf', src, '-C', into]);

  // surgically add a task referencing a project id that exists nowhere
  const wsFile = path.join(into, 'workspaces.ndjson');
  const lines = fs
    .readFileSync(wsFile, 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);
  const row = lines.find(r => r.id === WS_ID);
  const doc = JSON.parse(row.doc);
  doc.data.tasks.push({ id: 't-evil', project: 'p-unknown', title: 'Evil', desc: '' });
  row.doc = JSON.stringify(doc);
  fs.writeFileSync(wsFile, lines.map(l => JSON.stringify(l)).join('\n') + '\n');

  // re-hash the mutated entry into the manifest (a self-consistent crafted archive)
  const manifestPath = path.join(into, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.tables.find(t => t.name === 'workspaces').sha256 = sha256Hex(wsFile);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));

  // re-tar: manifest.json first (entry 0 contract), then every other FILE
  // entry (directories are never entries — the writer emits files only,
  // and a dir entry is typeflag '5', refused by the 89-01 reader)
  const crafted = path.join(BACKUPS_DIR, 'crafted.tar.gz');
  const entryNames = ['manifest.json'];
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(dir, e.name));
      else entryNames.push(path.relative(into, path.join(dir, e.name)));
    }
  };
  for (const top of fs.readdirSync(into, { withFileTypes: true })) {
    if (top.name === 'manifest.json') continue;
    if (top.isDirectory()) walk(path.join(into, top.name));
    else entryNames.push(top.name);
  }
  execFileSync('tar', ['czf', crafted, '--format=ustar', '-C', into, ...entryNames]);

  const before = await workspaceCount();
  const stagingBefore = fs.existsSync(restore.restoreStagingDir()) ? fs.readdirSync(restore.restoreStagingDir()).length : 0;
  const res = await restore.restoreImportAsNew({
    runId: 'run-evil',
    archivePath: crafted,
    expectedSha256: sha256Hex(crafted),
    scope: { kind: 'workspace', id: WS_ID },
    operatorId: OP_ID,
    trigger: 'import_new',
    startedAt: Date.now(),
  });
  assert.equal(res.ok, false, 'the crafted archive is refused');
  assert.equal(res.code, 'restoreRemapIncomplete', 'the keyed totality class rides the failure');
  assert.equal(await workspaceCount(), before, 'NO partial workspace row (pre-write refusal)');

  const evilRow = await runRow('run-evil');
  assert.equal(evilRow.status, 'failed', 'the run row lands failed');
  assert.ok(/restoreRemapIncomplete/.test(evilRow.error ?? ''), 'the keyed class persists into restore_runs.error');
  const stagingAfter = fs.existsSync(restore.restoreStagingDir()) ? fs.readdirSync(restore.restoreStagingDir()).length : 0;
  assert.equal(stagingAfter, stagingBefore, 'failed restores leave NO staging debris (D-89-32)');
  fs.rmSync(into, { recursive: true, force: true });
});

/* ---------- project-scope splice into a live target ---------- */

test('89-04: a project archive splices its fragment into a live target workspace with a revision bump and FTS sync', async () => {
  await db.run(
    'insert into workspaces (id, slug, name, color, doc, revision, created_at, updated_at) values (?,?,?,?,?,?,?,?)',
    ['ws-target', 'target', 'Target', '#000000', JSON.stringify({ data: { projects: [{ id: 'tp1', name: 'Home' }], tasks: [], comments: [], files: [], teams: [], projOrder: ['tp1'] } }), 1, NOW, NOW],
  );
  await db.run('insert into memberships (workspace_id, user_id, role, member_id, provenance) values (?,?,?,?,?)', ['ws-target', OP_ID, 'owner', OP_MEMBER, 'manual']);

  const run = await backup.runExport({ kind: 'project', id: 'p1' });
  assert.equal(run.ok, true, `runExport failed: ${run.error}`);
  const res = await restore.restoreImportAsNew({
    runId: 'run-proj',
    archivePath: archiveOf(run),
    expectedSha256: run.sha256,
    scope: { kind: 'project', id: 'p1' },
    targetWorkspaceId: 'ws-target',
    operatorId: OP_ID,
    trigger: 'import_new',
    startedAt: Date.now(),
  });
  assert.equal(res.ok, true, `restore failed: ${res.code ?? ''} ${res.error ?? ''}`);

  const row = await db.get('select * from workspaces where id = ?', ['ws-target']);
  assert.equal(row.revision, 2, 'the splice bumps revision (doc-PUT discipline)');
  const doc = JSON.parse(row.doc).data;
  assert.equal(doc.projects.length, 2, 'the original project survives');
  assert.ok(doc.projects.some(p => p.id === 'tp1'), 'original target content untouched');
  const freshProj = doc.projects.find(p => p.id !== 'tp1');
  assert.ok(freshProj, 'the archived project arrives with a fresh id');
  assert.ok(doc.tasks.some(t => t.project === freshProj.id && t.title === 'Root'), 'fragment tasks spliced with remapped project refs');
  assert.ok(doc.tasks.some(t => t.title === 'Sub' && doc.tasks.some(p => p.id === t.parentId && p.title === 'Root')), 'parentId chain intact in the splice');
  assert.ok(!doc.tasks.some(t => t.title === 'Other'), 'NO cross-project bleed — only p1 fragment');
  assert.ok(doc.comments.some(c => doc.tasks.some(t => t.id === c.taskId && t.title === 'Root')), 'comment.taskId resolves in the spliced fragment');
  assert.ok(!doc.files.some(f => f.name === 'g.txt'), 'the p2 file never enters the fragment');
  assert.deepEqual(doc.projOrder, ['tp1', freshProj.id], 'projOrder gains the fresh project id');
  const splicedFile = doc.files.find(f => f.name === 'a.txt');
  assert.ok(fs.existsSync(path.join(FILES_DIR, splicedFile.id)), 'spliced file blob at FILES_DIR/<freshId>');

  const members = await db.all('select * from memberships where workspace_id = ?', ['ws-target']);
  assert.equal(members.length, 1, 'a splice NEVER touches the target roster');
  const runRowProj = await runRow('run-proj');
  assert.equal(runRowProj.status, 'done');
  assert.equal(runRowProj.final_name, 'Target', 'splice records the target name');

  /* skip report for a PROJECT scope too (D-89-7): the instance-wide table
     dumps ride every 86 archive — the operational rows are reported for
     any scope, and the splice structurally cannot insert them. */
  const projSummary = JSON.parse(runRowProj.summary);
  const projSkipped = Object.fromEntries(projSummary.skipped.map(s => [s.table, s.rows]));
  assert.equal(projSkipped.users, 2, 'project scope reports the operational users rows');
  assert.equal(projSkipped.instance_roles, 1, 'project scope reports the operational instance_roles rows');
  assert.equal(projSkipped.invites, 2, 'project scope reports the never-restored invites');
  assert.deepEqual(projSummary.memberships, { skipped: 3, inserted: 0 }, 'the source roster rows (incl. the ghost) are reported honestly; a splice inserts no membership');
  assert.equal((await db.get('select count(*) as n from users')).n, 2, 'NEGATIVE: no users row landed via the splice');
  assert.equal((await db.get('select count(*) as n from instance_roles')).n, 1, 'NEGATIVE: no instance_roles row landed via the splice');
  assert.equal((await db.get('select count(*) as n from sessions')).n, 0, 'NEGATIVE: no sessions row landed via the splice');
  assert.equal((await db.get('select count(*) as n from audit_log')).n, 0, 'NEGATIVE: no audit_log row landed via the splice');
});

/* ---------- Task 3: skip-report hardening (D-89-7 summary shape) ---------- */

test('89-04 task 3: a mixed archive yields the full summary shape { skipped: [{table,rows}], memberships: {skipped, inserted} } with operational rows counted and never inserted', async () => {
  const run = await backup.runExport({ kind: 'workspace', id: WS_ID });
  assert.equal(run.ok, true, `runExport failed: ${run.error}`);
  const res = await restore.restoreImportAsNew(importOpts(run, 'run-mixed'));
  assert.equal(res.ok, true, `restore failed: ${res.code ?? ''} ${res.error ?? ''}`);

  /* the FROZEN shape — exactly these top-level keys */
  assert.deepEqual(
    Object.keys(res.summary).sort(),
    ['files', 'memberships', 'skipped', 'teamMembers'],
    'the summary contract shape is frozen',
  );
  /* every skipped entry is { table, rows } with a positive count; the
     operational family (per the frozen TABLES classification) is complete */
  for (const s of res.summary.skipped) {
    assert.deepEqual(Object.keys(s).sort(), ['rows', 'table'], `skipped entry shape: ${JSON.stringify(s)}`);
    assert.ok(Number.isInteger(s.rows) && s.rows > 0, `positive row count: ${JSON.stringify(s)}`);
  }
  const skippedTables = Object.fromEntries(res.summary.skipped.map(s => [s.table, s.rows]));
  assert.equal(skippedTables.users, 2, 'operational users rows counted (2 live users in the archive)');
  assert.equal(skippedTables.instance_roles, 1, 'operational instance_roles rows counted');
  assert.equal(skippedTables.invites, 2, 'invites (live + ghost referencers) counted');
  assert.deepEqual(res.summary.memberships, { skipped: 3, inserted: 1 }, 'user_id validation folds into the same shape: archive memberships all skip, operator inserted');
  assert.deepEqual(res.summary.teamMembers, { skipped: 1, inserted: 1 }, 'ghost team_members row skipped + reported, live row inserted');

  /* negative insert sweep — per operational table (D-89-7) */
  assert.equal((await db.get('select count(*) as n from users')).n, 2, 'no users row inserted');
  assert.equal((await db.get('select count(*) as n from instance_roles')).n, 1, 'no instance_roles row inserted');
  assert.equal((await db.get('select count(*) as n from sessions')).n, 0, 'no sessions row inserted');
  assert.equal((await db.get('select count(*) as n from audit_log')).n, 0, 'no audit_log row inserted');
  assert.equal((await db.get('select count(*) as n from invites')).n, 2, 'no invites row inserted (the 2 planted rows only)');
});
