/* =====================================================================
   Restore overwrite suite (Phase 89, plan 89-05, BKRST-03).

   Engine-level pins for restoreOverwriteUnit — the guarded overwrite:
   - snapshot-first ordering (prohibition P7 / D-89-5): the automatic
     pre_restore snapshot (a REAL 86 runExport archive) exists in
     BACKUPS_DIR and is audited BEFORE any FILES_DIR mutation;
   - replacement semantics (D-89-6/86-D-01): the target's data becomes
     EXACTLY the archive's, while the workspaces row keeps its identity
     (id/slug/created_at) — a replacement, never a merge;
   - memberships replace-with-validation: live-user rows insert,
     non-live user_id rows skip + report; the triggering operator always
     retains a membership post-overwrite (planner flag 3 call);
   - EXDEV-safe staged blob swap (D-89-4/Pitfall 1): blobs stage under a
     DATA_DIR-level temp dir, swap into FILES_DIR after staging;
   - repair net (D-89-3): a mid-tx failure rolls the DB back AND repairs
     swapped blobs from the pre_restore snapshot — the file-layer net.

   Fixture: temp DATA_DIR + in-process db-adapter on SQLite — mirrors
   test/restore-preview.test.mjs (DATA_DIR set BEFORE the module graph
   imports). Failure injection rides the unit's documented _hooks
   (afterSnapshot / midTx) — the only mutation-order control surface.
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-overwrite-'));
process.env.DATA_DIR = DATA_DIR;
process.env.BACKUPS_DIR = ''; // default: DATA_DIR/backups (delete an inherited override)
delete process.env.BACKUPS_DIR;
const FILES_DIR = path.join(DATA_DIR, 'files');
const LOGOS_DIR = path.join(DATA_DIR, 'logos');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

const db = await import('../db-adapter.mjs');
const backup = await import('../export/backup.js');
const restore = await import('../export/restore.js');

const T = 1700000000000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function freshDb() {
  await db.close();
  await db.connectDb({ dbPath: path.join(DATA_DIR, 'projects.db') });
  await db.runSchema(db.SQLITE_SCHEMA);
}

/* Two live users + one referenced-but-dead id. The dead id is the
   replace-with-validation probe (Pitfall 3). */
const OP = { id: 'user-op-000000000000', email: 'op@test.local', name: 'Operator' };
const LIVE = { id: 'user-live-0000000000', email: 'live@test.local', name: 'Live Member' };
const DEAD = 'user-dead-00000000000';

function wsRow(id, slug, name, doc, revision = 1) {
  return { id, slug, name, color: '#123456', doc: JSON.stringify(doc), revision, createdAt: T, updatedAt: T };
}

function targetDoc() {
  return {
    data: {
      projects: [{ id: 'p-old', name: 'Old Project', color: '#999999' }],
      tasks: [{ id: 't-old', project: 'p-old', title: 'Old task', desc: '' }],
      comments: [],
      files: [{ id: 'f-old', project: 'p-old', name: 'old.txt', ext: 'txt' }],
      teams: [],
      projOrder: ['p-old'],
      logo: 'lg-old',
      members: [],
      activity: [],
      notifs: [],
      events: [],
      savedViews: [],
      recentSearches: [],
    },
  };
}

function sourceDoc() {
  return {
    data: {
      projects: [{ id: 'p1', name: 'New Project', color: '#33aa55' }],
      tasks: [{ id: 't1', project: 'p1', title: 'New task', desc: '' }],
      comments: [{ id: 'c1', taskId: 't1', body: 'from the archive' }],
      files: [{ id: 'f1', project: 'p1', name: 'new.txt', ext: 'txt' }],
      teams: [{ id: 'team1', name: 'Crew' }],
      projOrder: ['p1'],
      logo: 'lg1',
      members: [],
      activity: [],
      notifs: [],
      events: [],
      savedViews: [],
      recentSearches: [],
    },
  };
}

/* Events collector on the engine emitter seam (the writer seam's
   in-process twin — run-row persistence is pinned at route level). */
let events = [];
restore.setRestoreRunEmitter(async e => events.push(e));

/* World state — reset per test for isolation. */
let sourceRun = null;

async function resetWorld() {
  events = [];
  for (const t of ['memberships', 'team_members', 'invites', 'audit_log', 'backup_runs', 'restore_runs', 'workspaces', 'users']) {
    await db.run(`delete from ${t}`);
  }
  fs.rmSync(FILES_DIR, { recursive: true, force: true });
  fs.rmSync(LOGOS_DIR, { recursive: true, force: true });
  fs.rmSync(BACKUPS_DIR, { recursive: true, force: true });
  fs.mkdirSync(FILES_DIR, { recursive: true });
  fs.mkdirSync(LOGOS_DIR, { recursive: true });

  await db.run('insert into users (id, email, name, password_hash, created_at) values (?,?,?,?,?)', [OP.id, OP.email, OP.name, 'x', T]);
  await db.run('insert into users (id, email, name, password_hash, created_at) values (?,?,?,?,?)', [LIVE.id, LIVE.email, LIVE.name, 'x', T]);

  /* The dead-id plantings: FKs would refuse these in a live instance, but
     the REAL dead-id vector is a cross-instance restore (DR on fresh
     hardware where the old users table is gone) — the archive carries the
     old user_ids verbatim. Toggle FKs off for the plant, back on after,
     which reproduces exactly the archive content the validation guards. */
  await db.run('pragma foreign_keys = off');

  /* The overwrite target — identity holder (id/slug/created_at must survive). */
  const target = wsRow('ws-target', 'target-fixture', 'Target WS', targetDoc());
  await db.run(
    'insert into workspaces (id, slug, name, color, doc, revision, created_at, updated_at, archived) values (?,?,?,?,?,?,?,?,?)',
    [target.id, target.slug, target.name, target.color, target.doc, target.revision, target.createdAt, target.updatedAt, 0],
  );
  await db.run('insert into memberships (workspace_id, user_id, role, member_id, provenance) values (?,?,?,?,?)', ['ws-target', OP.id, 'owner', `m_${OP.id.slice(0, 8)}`, 'manual']);

  /* The archive source workspace + roster rows (live / dead mix). */
  const src = wsRow('ws-src', 'src-fixture', 'Source WS', sourceDoc());
  await db.run(
    'insert into workspaces (id, slug, name, color, doc, revision, created_at, updated_at, archived) values (?,?,?,?,?,?,?,?,?)',
    [src.id, src.slug, src.name, src.color, src.doc, src.revision, src.createdAt, src.updatedAt, 0],
  );
  await db.run('insert into memberships (workspace_id, user_id, role, member_id, provenance) values (?,?,?,?,?)', ['ws-src', OP.id, 'owner', `m_${OP.id.slice(0, 8)}`, 'manual']);
  await db.run('insert into memberships (workspace_id, user_id, role, member_id, provenance) values (?,?,?,?,?)', ['ws-src', LIVE.id, 'member', 'm_live-mem', 'manual']);
  await db.run('insert into memberships (workspace_id, user_id, role, member_id, provenance) values (?,?,?,?,?)', ['ws-src', DEAD, 'member', 'm_dead-mem', 'manual']);
  await db.run('insert into team_members (workspace_id, team_id, member_id, user_id) values (?,?,?,?)', ['ws-src', 'team1', 'm_live-mem', LIVE.id]);
  await db.run('insert into team_members (workspace_id, team_id, member_id, user_id) values (?,?,?,?)', ['ws-src', 'team1', 'm_dead-mem', DEAD]);
  await db.run('insert into invites (token_hash, email, role, workspace_id, created_by, created_at, expires_at) values (?,?,?,?,?,?,?)', ['hash-live', 'newbie@test.local', 'member', 'ws-src', OP.id, T, T + 60000]);
  await db.run('insert into invites (token_hash, email, role, workspace_id, created_by, created_at, expires_at) values (?,?,?,?,?,?,?)', ['hash-dead', 'ghost@test.local', 'member', 'ws-src', DEAD, T, T + 60000]);
  await db.run('pragma foreign_keys = on');

  /* Blobs: the target's (pre-restore state) and the source's (archive content). */
  fs.writeFileSync(path.join(FILES_DIR, 'f-old'), 'target old blob\n');
  fs.writeFileSync(path.join(LOGOS_DIR, 'lg-old'), 'target old logo');
  fs.writeFileSync(path.join(FILES_DIR, 'f1'), 'source new blob\n');
  fs.writeFileSync(path.join(LOGOS_DIR, 'lg1'), 'source new logo');

  sourceRun = await backup.runExport({ kind: 'workspace', id: 'ws-src' });
  assert.equal(sourceRun.ok, true, `source export failed: ${sourceRun.error}`);
}

/* Connect once at module load — every test's resetWorld() clears rows on
   the live connection (the restore-preview before() idiom). ensureSearch
   Index() creates task_fts, which exists from boot in production
   (server.js boot call) — syncTaskFts writes into it inside the tx. */
await freshDb();
await db.ensureSearchIndex();

const backupsCount = () =>
  fs.readdirSync(BACKUPS_DIR).filter(f => f.endsWith('.tar.gz')).length +
  (fs.existsSync(path.join(BACKUPS_DIR, '.snapshots')) ? fs.readdirSync(path.join(BACKUPS_DIR, '.snapshots')).filter(f => f.endsWith('.tar.gz')).length : 0);

function overwriteUnit(overrides = {}) {
  return restore.restoreOverwriteUnit({
    runId: 'ovw-test-run-1',
    backupRun: { filename: sourceRun.filename, sha256: sourceRun.sha256, uploaded: 0 },
    scope: { kind: 'workspace', id: 'ws-src' },
    targetWorkspaceId: 'ws-target',
    operator: OP,
    ...overrides,
  });
}

const targetRow = async () => db.get('select * from workspaces where id = ?', ['ws-target']);
const membershipsOf = async () => (await db.all('select user_id, role, member_id, provenance from memberships where workspace_id = ?', ['ws-target'])).sort((a, b) => a.user_id.localeCompare(b.user_id));

test('89-05 snapshot-first ordering (P7/D-89-5): an injection right after the snapshot leaves the snapshot archive + audit row in place and ZERO mutations behind', async () => {
  await resetWorld();
  const beforeDoc = (await targetRow()).doc;
  const beforeRevision = (await targetRow()).revision;

  const result = await overwriteUnit({
    _hooks: { afterSnapshot: async () => { throw new Error('injected:afterSnapshot'); } },
  });
  assert.equal(result.ok, false, 'the injected failure fails the unit');
  assert.match(result.error, /injected:afterSnapshot/);

  /* The pre_restore snapshot archive EXISTS — published before any mutation. */
  assert.equal(backupsCount(), 2, 'source archive + the pre_restore snapshot');
  const audit = await db.get("select * from audit_log where action = 'restore_snapshot_started:pre_restore' order by created_at desc limit 1");
  assert.ok(audit, 'the snapshot attempt is audited (flag 1 resolution)');
  assert.equal(audit.actor_id, OP.id);

  /* The engine emitter carried the D-89-5 link for the run row. */
  const snapEvent = events.find(e => e.snapshotRunId && e.snapshotTag === 'pre_restore');
  assert.ok(snapEvent, 'an update event carries snapshot_run_id + snapshot_tag=pre_restore');
  assert.match(String(snapEvent.snapshotRunId), UUID_RE, 'the snapshot run id is the 86 runExport run id');

  /* Zero DB changes (nothing written yet) + zero blob mutations. */
  const after = await targetRow();
  assert.equal(after.doc, beforeDoc, 'the target doc is untouched');
  assert.equal(after.revision, beforeRevision, 'revision untouched');
  assert.equal((await membershipsOf()).length, 1, 'the target roster is untouched');
  /* The fixture legitimately holds BOTH sides' blobs (f1/lg1 are the
     source archive's blob content runExport collects from); "untouched"
     means exactly that fixture state — no swapped-in or removed blob. */
  assert.equal(fs.readdirSync(FILES_DIR).sort().join(','), 'f-old,f1', 'FILES_DIR untouched');
  assert.equal(fs.readFileSync(path.join(FILES_DIR, 'f1'), 'utf8'), 'source new blob\n', 'f1 content untouched');
  assert.equal(fs.readdirSync(LOGOS_DIR).sort().join(','), 'lg-old,lg1', 'LOGOS_DIR untouched');
});

test('89-05 overwrite replaces the data exactly with identity preserved (D-89-6/86-D-01); blobs swapped; removed blobs unlinked post-commit', async () => {
  await resetWorld();
  const before = await targetRow();

  const result = await overwriteUnit();
  assert.equal(result.ok, true, `overwrite failed: ${result.error}`);

  /* Identity preserved (acceptance: id/slug equal pre-overwrite values). */
  const after = await targetRow();
  assert.equal(after.id, before.id);
  assert.equal(after.slug, before.slug, 'slug unchanged');
  assert.equal(after.created_at, before.created_at, 'created_at unchanged');
  assert.equal(after.name, 'Source WS', 'data replacement carries the archive row name');
  assert.equal(after.revision, before.revision + 1, 'revision bumped');

  /* Data = the archive's data (replacement, never a merge). */
  const doc = JSON.parse(after.doc);
  assert.deepEqual(doc.data.projects.map(p => p.id), ['p1'], 'archive project present');
  assert.deepEqual(doc.data.tasks.map(t => t.id), ['t1'], 'archive task present, old task gone');
  assert.equal(fs.existsSync(path.join(FILES_DIR, 'f-old')), false, 'removed old blob unlinked post-commit (doc-PUT idiom)');
  assert.equal(fs.readFileSync(path.join(FILES_DIR, 'f1'), 'utf8'), 'source new blob\n', 'swapped blob content matches the archive');
  assert.equal(fs.readFileSync(path.join(LOGOS_DIR, 'lg1'), 'utf8'), 'source new logo');
  assert.equal(fs.existsSync(path.join(LOGOS_DIR, 'lg-old')), false, 'replaced old logo unlinked');

  /* Snapshot-first ordering: the snapshot archive predates the swap. */
  const snapPath = path.join(BACKUPS_DIR, result.snapshotFilename);
  assert.ok(fs.existsSync(snapPath), 'the pre_restore snapshot archive exists');
  assert.ok(fs.statSync(snapPath).mtimeMs <= fs.statSync(path.join(FILES_DIR, 'f1')).mtimeMs + 5, 'snapshot mtime precedes the first blob mutation');

  /* Stage vocabulary walked (D-89-29) through the emitter. */
  const stages = events.filter(e => e.stage).map(e => e.stage);
  assert.ok(stages.indexOf('validating') < stages.indexOf('restoring') < stages.indexOf('verifying'), `stages walked in order: ${stages.join('→')}`);

  /* Replace-with-validation report: dead user's membership/team/invite skipped. */
  assert.equal(result.summary.memberships.skipped, 1, 'the dead-user membership is skip-reported');
  assert.equal(result.summary.memberships.replaced, 2, 'live-user archive memberships inserted');
  assert.equal(result.summary.teamMembers.skipped, 1);
  assert.equal(result.summary.invites.skipped, 1, 'the dead-creator invite is skip-reported');
});

test('89-05 memberships replace-with-validation: live rows inserted, dead rows skipped, operator retains membership (flag 3)', async () => {
  await resetWorld();
  const result = await overwriteUnit();
  assert.equal(result.ok, true, `overwrite failed: ${result.error}`);

  const roster = await membershipsOf();
  const byUser = Object.fromEntries(roster.map(r => [r.user_id, r]));
  assert.deepEqual(roster.map(r => r.user_id).sort(), [LIVE.id, OP.id].sort(), 'dead user never inserted');
  assert.equal(byUser[LIVE.id].role, 'member', 'archive role carried');
  assert.equal(byUser[LIVE.id].member_id, 'm_live-mem', 'archive member_id preserved (doc-profile continuity)');
  assert.equal(byUser[LIVE.id].provenance, 'manual', 'archive provenance carried');

  /* Flag 3: the triggering operator ALWAYS retains a membership. */
  assert.ok(byUser[OP.id], 'the triggering operator retains membership post-overwrite');
});

test('89-05 flag 3 retention re-grant: an archive roster that excludes the operator still leaves them a member (provenance restore)', async () => {
  await resetWorld();
  /* Rebuild the source roster WITHOUT the operator. */
  await db.run('delete from memberships where workspace_id = ? and user_id = ?', ['ws-src', OP.id]);
  sourceRun = await backup.runExport({ kind: 'workspace', id: 'ws-src' });
  assert.equal(sourceRun.ok, true);

  const result = await overwriteUnit();
  assert.equal(result.ok, true, `overwrite failed: ${result.error}`);

  const roster = await membershipsOf();
  const opRow = roster.find(r => r.user_id === OP.id);
  assert.ok(opRow, 'the operator was re-granted membership');
  assert.equal(opRow.provenance, 'restore', 'the re-grant is marked as restore-provenance safety retention');
  assert.equal(result.summary.memberships.operatorRetained, true, 'the summary states the retention honestly');
});

test('89-05 repair net (D-89-3): a mid-tx failure rolls the DB back AND restores FILES_DIR to the pre-restore state from the snapshot', async () => {
  await resetWorld();
  const before = await targetRow();
  const oldBlob = fs.readFileSync(path.join(FILES_DIR, 'f-old'), 'utf8');

  const result = await overwriteUnit({
    _hooks: { midTx: async () => { throw new Error('injected:midTx'); } },
  });
  assert.equal(result.ok, false, 'the injected mid-tx failure fails the unit');

  /* DB: full rollback — pre-restore rows. */
  const after = await targetRow();
  assert.equal(after.doc, before.doc, 'the doc rolled back to the pre-restore content');
  assert.equal(after.revision, before.revision, 'revision rolled back');
  assert.deepEqual((await membershipsOf()).map(r => r.user_id), [OP.id], 'the target roster rolled back');

  /* File layer: repaired FROM THE SNAPSHOT — the swapped-in blob is gone,
     the pre-restore blob content is back. */
  assert.equal(fs.existsSync(path.join(FILES_DIR, 'f1')), false, 'the swapped-in blob was removed by the snapshot repair');
  assert.equal(fs.existsSync(path.join(FILES_DIR, 'f-old')), true, 'the pre-restore blob is present');
  assert.equal(fs.readFileSync(path.join(FILES_DIR, 'f-old'), 'utf8'), oldBlob, 'the pre-restore blob content survived');

  /* No staging debris (D-89-32). */
  const staging = restore.restoreStagingDir();
  if (fs.existsSync(staging)) assert.equal(fs.readdirSync(staging).length, 0, 'the failed overwrite swept its staging tree');
});

test('89-05 entry-gate refusal fails keyed BEFORE any DB write or blob mutation (D-89-33 families 2/3)', async () => {
  await resetWorld();
  /* Build a traversal-carrying archive via python tarfile (89-04 idiom —
     GNU tar strips '..'; the writer-reader pair does not). */
  const { execFileSync } = await import('node:child_process');
  const crypto = await import('node:crypto');
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const crafted = path.join(BACKUPS_DIR, 'crafted-overwrite.tar.gz');
  execFileSync(
    'python3',
    [
      '-c',
      `import tarfile, io, json, time
manifest = json.dumps({"formatVersion": 1, "scope": {"kind": "workspace", "id": "ws-src"}, "tables": [], "files": [], "createdAt": int(time.time() * 1000)}).encode()
evil = b"pwned\\n"
with tarfile.open(${JSON.stringify(crafted)}, "w:gz", format=tarfile.USTAR_FORMAT) as t:
    ti = tarfile.TarInfo("manifest.json"); ti.size = len(manifest); ti.mtime = 0
    t.addfile(ti, io.BytesIO(manifest))
    ti2 = tarfile.TarInfo("../evil.txt"); ti2.size = len(evil); ti2.mtime = 0
    t.addfile(ti2, io.BytesIO(evil))
`,
    ],
  );
  const sha = crypto.createHash('sha256').update(fs.readFileSync(crafted)).digest('hex');

  const beforeDoc = (await targetRow()).doc;
  const result = await overwriteUnit({
    backupRun: { filename: 'crafted-overwrite.tar.gz', sha256: sha, uploaded: 0 },
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /restoreEntryRejected/, `keyed refusal: ${result.error}`);
  assert.equal((await targetRow()).doc, beforeDoc, 'zero DB writes');
  assert.equal(fs.readdirSync(FILES_DIR).sort().join(','), 'f-old,f1', 'zero blob mutations');
  /* But the snapshot STILL exists first — the safety net is unconditional.
     (3 archives: the source export + the crafted fixture, which also lives
     in BACKUPS_DIR, + the snapshot — the +1 vs the pre-run state proves
     the snapshot was taken.) */
  assert.equal(backupsCount(), 3, 'the pre_restore snapshot was taken even for the refused archive');
});

test('89-05 scope-kind mismatch refuses keyed restoreTargetMismatch (engine-side re-check)', async () => {
  await resetWorld();
  const result = await overwriteUnit({ scope: { kind: 'project', id: 'p1' }, targetWorkspaceId: 'ws-target' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'restoreTargetMismatch', `keyed: ${result.code ?? result.error}`);
  assert.equal(backupsCount(), 2, 'the snapshot still came first');
});

/* =====================================================================
   Phase 95 plan 95-04 — project-scope overwrite (BKRST-05 engine half).
   A project archive replaces its target project inside the target
   workspace doc: fragment splice with ids VERBATIM (no remap), the D-01
   deletion set, the self-excluding collision scan, one tx, FTS synced.
   ===================================================================== */

function richTargetDoc() {
  return {
    data: {
      projects: [
        { id: 'p-old', name: 'Old Project', color: '#999999' },
        { id: 'p-keep', name: 'Keep Me', color: '#00aa00' },
      ],
      tasks: [
        { id: 't-old', project: 'p-old', title: 'Old task', desc: '' },
        { id: 't-old2', parentId: 't-old', project: 'p-old', title: 'Old subtask', desc: '' },
        { id: 't-keep', project: 'p-keep', title: 'Keep task', desc: '' },
      ],
      comments: [
        { id: 'c-old', taskId: 't-old', body: 'dead comment' },
        { id: 'c-keep', taskId: 't-keep', body: 'keep comment' },
      ],
      files: [
        { id: 'f-old', project: 'p-old', name: 'old.txt', ext: 'txt' },
        { id: 'f-old2', project: null, task: 't-old2', name: 'attached.txt', ext: 'txt' },
        { id: 'f-keep', project: 'p-keep', name: 'keep.txt', ext: 'txt' },
      ],
      teams: [{ id: 'team-keep', name: 'Keepers' }],
      projOrder: ['p-old', 'p-keep'],
      logo: 'lg-old',
      members: [],
      activity: [
        { id: 'a1', verb: 'created', task: 't-old', project: 'p-old', at: T },
        { id: 'a2', verb: 'created', task: 't-keep', project: 'p-keep', at: T },
      ],
      notifs: [
        { id: 'n1', to: OP.id, type: 'mention', task: 't-old2', project: 'p-old', snippet: 'x', at: T },
        { id: 'n2', to: OP.id, type: 'mention', task: 't-keep', project: 'p-keep', snippet: 'y', at: T },
      ],
      events: [
        { id: 'e1', event: 'task.deleted', taskId: 't-old', at: T },
        { id: 'e2', event: 'project.completed', projectId: 'p-old', at: T },
        { id: 'e3', event: 'task.completed', taskId: 't-keep', at: T },
      ],
      savedViews: [],
      recentSearches: [],
    },
  };
}

/* Project-overwrite world: the RICH target doc (p-old armed for
   replacement + p-keep untouched witness) and a PROJECT-scope archive
   of ws-src's p1 fragment. */
async function projectWorld() {
  await resetWorld();
  await db.run('update workspaces set doc = ? where id = ?', [JSON.stringify(richTargetDoc()), 'ws-target']);
  fs.writeFileSync(path.join(FILES_DIR, 'f-old2'), 'target old sub blob\n');
  fs.writeFileSync(path.join(FILES_DIR, 'f-keep'), 'target keep blob\n');
  sourceRun = await backup.runExport({ kind: 'project', id: 'p1' });
  assert.equal(sourceRun.ok, true, `source project export failed: ${sourceRun.error}`);
}

function projectOverwriteUnit(overrides = {}) {
  return overwriteUnit({ scope: { kind: 'project', id: 'p1' }, targetProjectId: 'p-old', ...overrides });
}

test('95-04 project overwrite happy path: the archive fragment replaces the target project verbatim inside the target doc; other projects untouched; revision+1; identity preserved', async () => {
  await projectWorld();
  const before = await targetRow();

  const result = await projectOverwriteUnit();
  assert.equal(result.ok, true, `project overwrite failed: ${result.error}`);

  const after = await targetRow();
  assert.equal(after.id, before.id);
  assert.equal(after.slug, before.slug, 'slug unchanged');
  assert.equal(after.name, before.name, 'workspace identity name unchanged (project scope never renames the workspace)');
  assert.equal(after.revision, before.revision + 1, 'revision bumped');

  const doc = JSON.parse(after.doc).data;
  /* ids VERBATIM from the archive — no remap. */
  assert.deepEqual(doc.projects.map(p => p.id), ['p-keep', 'p1'], 'kept project survives, archive project appended');
  assert.deepEqual(doc.tasks.map(t => t.id), ['t-keep', 't1'], 'kept tasks survive, archive task appended verbatim');
  assert.deepEqual(doc.comments.map(c => c.id), ['c-keep', 'c1']);
  assert.deepEqual(doc.files.map(f => f.id), ['f-keep', 'f1']);
  assert.deepEqual(doc.projOrder, ['p-keep', 'p1']);
  assert.deepEqual(doc.projects.find(p => p.id === 'p1'), { id: 'p1', name: 'New Project', color: '#33aa55' }, 'the archive project row is verbatim');
  assert.deepEqual(doc.teams.map(t => t.id), ['team-keep'], 'the target teams collection is untouched (project scope splices no teams)');
  assert.equal(doc.logo, 'lg-old', 'the workspace logo reference is untouched');
  assert.equal(fs.existsSync(path.join(LOGOS_DIR, 'lg-old')), true, 'the workspace logo blob is untouched');

  /* Blob swaps: the target project's blobs removed, the archive's swapped in, the other project's blob kept. */
  assert.equal(fs.existsSync(path.join(FILES_DIR, 'f-old')), false, 'dead project blob unlinked');
  assert.equal(fs.existsSync(path.join(FILES_DIR, 'f-old2')), false, 'dead-task blob unlinked (D-01 task closure)');
  assert.equal(fs.existsSync(path.join(FILES_DIR, 'f-keep')), true, 'other project blob kept');
  assert.equal(fs.readFileSync(path.join(FILES_DIR, 'f1'), 'utf8'), 'source new blob\n', 'archive blob swapped in');
});

test('95-04 D-01 deletion set: project entry, task-id closure (subtasks), comments of dead tasks, files by project or dead task, projOrder ref, activity/events/notifs references are gone from nextDoc', async () => {
  await projectWorld();
  const result = await projectOverwriteUnit();
  assert.equal(result.ok, true, `project overwrite failed: ${result.error}`);

  const doc = JSON.parse((await targetRow()).doc).data;
  assert.ok(!doc.projects.some(p => p.id === 'p-old'), 'project entry gone');
  assert.ok(!doc.tasks.some(t => t.id === 't-old' || t.id === 't-old2'), 'task closure gone (subtask included)');
  assert.ok(!doc.comments.some(c => c.id === 'c-old'), 'comment of a dead task gone');
  assert.ok(!doc.files.some(f => f.id === 'f-old' || f.id === 'f-old2'), 'files by project or dead task gone');
  assert.ok(!doc.projOrder.includes('p-old'), 'projOrder ref gone');
  assert.deepEqual(doc.activity.map(a => a.id), ['a2'], 'activity references to the project/dead tasks gone');
  assert.deepEqual(doc.notifs.map(n => n.id), ['n2'], 'notif references to the project/dead tasks gone');
  assert.deepEqual(doc.events.map(e => e.id), ['e3'], 'event references to the project/dead tasks gone');
});

test('95-04 same-named overwrite SUCCEEDS — the collision scan excludes the armed target project id (Pitfall 1 self-exclusion)', async () => {
  await projectWorld();
  const rich = richTargetDoc();
  rich.data.projects[0].name = 'New Project'; // the target project carries the ARCHIVE's name
  await db.run('update workspaces set doc = ? where id = ?', [JSON.stringify(rich), 'ws-target']);

  const result = await projectOverwriteUnit();
  assert.equal(result.ok, true, `same-named overwrite refused: ${result.error}`);
  const doc = JSON.parse((await targetRow()).doc).data;
  assert.deepEqual(doc.projects.map(p => p.id), ['p-keep', 'p1'], 'the overwrite landed');
});

test('95-04 true collision refuses keyed restoreNameCollision naming the conflicting project — before the tx, after the snapshot', async () => {
  await projectWorld();
  const rich = richTargetDoc();
  rich.data.projects.push({ id: 'p-conf', name: 'New Project', color: '#aa3333' }); // a DIFFERENT live project with the archive's name
  rich.data.projOrder.push('p-conf');
  await db.run('update workspaces set doc = ? where id = ?', [JSON.stringify(rich), 'ws-target']);
  const beforeDoc = (await targetRow()).doc;

  const result = await projectOverwriteUnit();
  assert.equal(result.ok, false);
  assert.equal(result.code, 'restoreNameCollision', `keyed: ${result.code ?? result.error}`);
  assert.match(result.error, /New Project/, 'the refusal names the conflicting project');
  assert.equal((await targetRow()).doc, beforeDoc, 'zero DB writes');
  assert.equal(fs.existsSync(path.join(FILES_DIR, 'f-old')), true, 'zero blob mutations');
  assert.equal(backupsCount(), 3, 'the pre_restore snapshot still came first (2 fixtures + snapshot)');
});

test('95-04 missing target: an unknown targetProjectId refuses keyed restoreTargetMissing with zero mutations', async () => {
  await projectWorld();
  const beforeDoc = (await targetRow()).doc;
  const result = await projectOverwriteUnit({ targetProjectId: 'p-nope' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'restoreTargetMissing', `keyed: ${result.code ?? result.error}`);
  assert.equal((await targetRow()).doc, beforeDoc, 'zero DB writes');

  const noId = await projectOverwriteUnit({ targetProjectId: undefined });
  assert.equal(noId.ok, false);
  assert.equal(noId.code, 'restoreTargetMissing', 'a project scope without a targetProjectId refuses keyed');
});

test('95-04 FTS sync inside the tx: dead tasks leave task_fts and the archive tasks are searchable at commit', async () => {
  await projectWorld();
  /* Plant stale FTS rows for the doomed tasks (as a prior sync would have). */
  await db.run("insert into task_fts (ws_id, task_id, project_id, title, body) values ('ws-target','t-old','p-old','old task','x')");
  await db.run("insert into task_fts (ws_id, task_id, project_id, title, body) values ('ws-target','t-old2','p-old','old subtask','y')");

  const result = await projectOverwriteUnit();
  assert.equal(result.ok, true, `project overwrite failed: ${result.error}`);

  const rows = await db.all('select task_id from task_fts where ws_id = ?', ['ws-target']);
  const ids = rows.map(r => r.task_id).sort();
  assert.ok(!ids.includes('t-old') && !ids.includes('t-old2'), `dead tasks removed from FTS: ${ids}`);
  assert.ok(ids.includes('t1'), 'the archive task is searchable');
});

/* ---------- 95-04 Task 4: refusal matrix + integration sweep ---------- */

test('95-04 D-06: the backup_runs history of the replaced project survives the overwrite and still references the old scope id', async () => {
  await projectWorld();
  /* Plant the replaced project's backup history (as runs at backup time
     would have left it — scope JSON carrying p-old). */
  await db.run(
    'insert into backup_runs (id, task_id, scope, trigger, status, started_at, finished_at, sha256, filename, created_at) values (?,?,?,?,?,?,?,?,?,?)',
    ['bk-old-1', null, JSON.stringify({ kind: 'project', id: 'p-old' }), 'manual', 'succeeded', T, T + 1000, 'a'.repeat(64), 'old-archive.tar.gz', T],
  );

  const result = await projectOverwriteUnit();
  assert.equal(result.ok, true, `project overwrite failed: ${result.error}`);

  const row = await db.get('select id, scope, status from backup_runs where id = ?', ['bk-old-1']);
  assert.ok(row, 'the replaced project backup_runs row SURVIVES the overwrite (D-06)');
  assert.deepEqual(JSON.parse(row.scope), { kind: 'project', id: 'p-old' }, 'the row still references the old scope id');
  assert.equal(row.status, 'succeeded', 'history rows are never rewritten by a restore');
});

test('95-04 totality: a fragment task referencing an unknown parentId refuses keyed restoreRemapIncomplete before any mutation', async () => {
  await projectWorld();
  /* Plant a dangling parentId into the SOURCE doc's p1 fragment, then
     re-export the project archive (the archive now carries the unknown
     reference). */
  const srcRow = await db.get('select doc from workspaces where id = ?', ['ws-src']);
  const src = JSON.parse(srcRow.doc);
  src.data.tasks[0].parentId = 't-ghost';
  await db.run('update workspaces set doc = ? where id = ?', [JSON.stringify(src), 'ws-src']);
  sourceRun = await backup.runExport({ kind: 'project', id: 'p1' });
  assert.equal(sourceRun.ok, true);

  const beforeDoc = (await targetRow()).doc;
  const result = await projectOverwriteUnit();
  assert.equal(result.ok, false);
  assert.equal(result.code, 'restoreRemapIncomplete', `keyed: ${result.code ?? result.error}`);
  assert.match(result.error, /task\.parentId/, 'the unresolved-loop discipline names the dangling reference');
  assert.equal((await targetRow()).doc, beforeDoc, 'zero DB writes');
  assert.equal(fs.existsSync(path.join(FILES_DIR, 'f-old')), true, 'zero blob mutations');
});

test('95-04 snapshot honesty (P7): the pre_restore run produced for a project overwrite is a WORKSPACE-scope archive of the TARGET workspace', async () => {
  await projectWorld();
  const result = await projectOverwriteUnit();
  assert.equal(result.ok, true, `project overwrite failed: ${result.error}`);

  const snapPath = path.join(BACKUPS_DIR, result.snapshotFilename);
  assert.ok(fs.existsSync(snapPath), 'the snapshot archive exists');
  /* Extract the snapshot to a throwaway dir and read its manifest —
     readArchiveEntries streams (entries carry metadata, not payloads). */
  const snapDir = path.join(restore.restoreStagingDir(), 'snap-probe-95-04');
  const sidecar = fs.readFileSync(`${snapPath}.sha256`, 'utf8').split(/\s+/)[0];
  const snapVerified = await restore.streamVerifyArchive(snapPath, sidecar);
  await restore.extractArchive(snapPath, snapDir, snapVerified.manifest, { tolerateSkips: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(snapDir, 'manifest.json'), 'utf8'));
  fs.rmSync(snapDir, { recursive: true, force: true });
  assert.deepEqual(manifest.scope, { kind: 'workspace', id: 'ws-target' }, 'kind workspace over the TARGET workspace — P7 unchanged');
});

test('95-04 i18n ×5: err.restoreNameCollision is present in all five locales (mirrors the i18n-scan dead-key gate)', async () => {
  const locales = ['en', 'fr', 'nl', 'de', 'es'];
  for (const loc of locales) {
    const catalogue = JSON.parse(fs.readFileSync(new URL(`../src/locales/${loc}.json`, import.meta.url), 'utf8'));
    assert.ok(
      typeof catalogue['err.restoreNameCollision'] === 'string' && catalogue['err.restoreNameCollision'].length > 0,
      `${loc}.json carries err.restoreNameCollision`,
    );
    assert.ok(
      typeof catalogue['err.restoreTargetMissing'] === 'string' && catalogue['err.restoreTargetMissing'].length > 0,
      `${loc}.json carries err.restoreTargetMissing`,
    );
  }
});

/* =====================================================================
   Route-level cells (Phase 89, plan 89-05, Task 3 — POST
   /api/backup/restore/overwrite). Per-case startServer + ONE persistent
   DatabaseSync reader per test (an open/close-cycle reader checkpoints
   + removes the server's WAL mid-flight and the server's subsequent
   writes vanish — bisected 2026-11-22, restore-instance probes 11-15).
   ===================================================================== */
import { DatabaseSync } from 'node:sqlite';

const { ADMIN, login, signup, startServer } = await import('./helpers/server.mjs');

const openReader = srv => {
  const ro = new DatabaseSync(srv.dbPath);
  ro.exec('pragma busy_timeout = 5000');
  return {
    get: (sql, ...params) => ro.prepare(sql).get(...params),
    all: (sql, ...params) => ro.prepare(sql).all(...params),
    run: (sql, ...params) => ro.prepare(sql).run(...params),
    close: () => ro.close(),
  };
};

const makeBackupOpRoute = async (srv, ro, email) => {
  const joined = await signup(srv.base, { name: 'Backup Op', email });
  assert.equal(joined.status, 201, `signup ${email}: ${JSON.stringify(joined.data)}`);
  const uid = ro.get('select id from users where email = ?', email)?.id;
  const admin = (await login(srv.base, ADMIN.email, ADMIN.password)).client;
  const grant = await admin.post('/api/auth/operator/instance-roles', { userId: uid, role: 'backup_operator' });
  assert.equal(grant.status, 200, `grant backup_operator: ${JSON.stringify(grant.data)}`);
  return (await login(srv.base, email, 'password-1234')).client;
};

const makeRestoreOpRoute = async (srv, ro, email) => {
  const joined = await signup(srv.base, { name: 'Restore Op', email });
  assert.equal(joined.status, 201, `signup ${email}: ${JSON.stringify(joined.data)}`);
  const uid = ro.get('select id from users where email = ?', email)?.id;
  const admin = (await login(srv.base, ADMIN.email, ADMIN.password)).client;
  const grant = await admin.post('/api/auth/operator/instance-roles', { userId: uid, role: 'restore_operator' });
  assert.equal(grant.status, 200, `grant restore_operator: ${JSON.stringify(grant.data)}`);
  return (await login(srv.base, email, 'password-1234')).client;
};

const pollRoute = (ro, read, { timeoutMs = 20000 } = {}) =>
  new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tick = () => {
      let v = null;
      try {
        v = read(ro);
      } catch {
        /* transient — keep polling */
      }
      if (v) return resolve(v);
      if (Date.now() > deadline) return reject(new Error('poll timeout'));
      setTimeout(tick, 40);
    };
    tick();
  });

/* Boot + a workspace with distinguishable live/archive docs + its
   workspace-scope archive. Live drift (a p-drift project + revision bump)
   lands AFTER the export so the overwrite's replacement semantics are
   observable through the route. Returns everything a cell needs. */
async function bootOverwriteWorld() {
  const srv = await startServer({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-ow-route-')) });
  const ro = openReader(srv);
  const op = await makeBackupOpRoute(srv, ro, 'ow-op@test.local');
  const ownerId = ro.get('select id from users where email = ?', ADMIN.email).id;
  const doc = JSON.stringify({ data: { projects: [{ id: 'p-live', name: 'P Live', color: '#111111' }], tasks: [{ id: 't-live', project: 'p-live', title: 'Live task', desc: '' }], comments: [], files: [], teams: [], projOrder: ['p-live'], logo: null, members: [], activity: [], notifs: [], events: [], savedViews: [], recentSearches: [] } });
  ro.run('insert into workspaces (id, slug, name, color, doc, revision, created_at, updated_at, archived) values (?,?,?,?,?,?,?,?,?)', ...['ws-ow', 'overwrite-me', 'Overwrite Me', '#123456', doc, 5, T, T, 0]);
  const backupRes = await op.post('/api/backup/runs', { scope: { kind: 'workspace', id: 'ws-ow' } });
  assert.equal(backupRes.status, 200, `backup trigger: ${JSON.stringify(backupRes.data)}`);
  for (let i = 0; i < 200; i++) {
    const cur = await op.get('/api/backup/runs/current');
    if (cur.data.stage === 'done' || cur.data.stage === 'failed') break;
    await new Promise(r => setTimeout(r, 50));
  }
  const row = ro.get('select id, status, sha256 from backup_runs where id = ?', backupRes.data.runId);
  assert.equal(row.status, 'succeeded', 'the workspace archive landed');
  /* Live drift the overwrite must revert (D-89-6: replacement, never merge). */
  const drifted = JSON.stringify({ data: { projects: [{ id: 'p-live', name: 'P Live', color: '#111111' }, { id: 'p-drift', name: 'P Drift', color: '#222222' }], tasks: [], comments: [], files: [], teams: [], projOrder: ['p-live', 'p-drift'], logo: null, members: [], activity: [], notifs: [], events: [], savedViews: [], recentSearches: [] } });
  ro.run('update workspaces set doc = ?, revision = 9 where id = ?', ...[drifted, 'ws-ow']);
  const anInstance = await op.post('/api/backup/runs', { scope: { kind: 'instance' } });
  assert.equal(anInstance.status, 200);
  for (let i = 0; i < 200; i++) {
    const cur = await op.get('/api/backup/runs/current');
    if (cur.data.stage === 'done' || cur.data.stage === 'failed') break;
    await new Promise(r => setTimeout(r, 50));
  }
  const instanceRow = ro.get("select id from backup_runs where scope like '%instance%' order by created_at desc limit 1");
  assert.ok(instanceRow, 'an instance-scope archive exists for the kind-mismatch cell');
  return { srv, ro, op, ownerId, backupRunId: row.id, instanceRunId: instanceRow.id, targetName: 'Overwrite Me' };
}

const closeWorld = async (world, ro) => {
  ro.close();
  await world.srv.stop();
  fs.rmSync(path.dirname(world.srv.dbPath), { recursive: true, force: true });
};

test('89-05 overwrite route (BKRST-03): Backup Operator + exact CURRENT target name → 200 {runId}; the run lands done with trigger overwrite and the target doc is the archive doc (replacement, never merge)', async () => {
  const w = await bootOverwriteWorld();
  try {
    const res = await w.op.post('/api/backup/restore/overwrite', { runId: w.backupRunId, targetId: 'ws-ow', confirmName: w.targetName });
    assert.equal(res.status, 200, `trigger: ${JSON.stringify(res.data)}`);
    assert.match(res.data.runId, UUID_RE, 'the run id leaves before the pipeline (D-89-2)');
    const done = await pollRoute(w.ro, db => db.get("select * from restore_runs where id = ? and status = 'done'", res.data.runId) ?? null);
    assert.equal(done.trigger, 'overwrite', 'the run row carries trigger overwrite');
    const docRow = w.ro.get('select doc, revision from workspaces where id = ?', 'ws-ow');
    const doc = JSON.parse(docRow.doc);
    assert.ok(!doc.data.projects.some(p => p.id === 'p-drift'), 'the drift project is GONE (replacement)');
    assert.ok(doc.data.projects.some(p => p.id === 'p-live'), 'the archive project set is back');
    assert.equal(w.ro.get('select claimed_by from restore_lock where id = 1').claimed_by, null, 'the lock released');
  } finally {
    await closeWorld(w, w.ro);
  }
});

test('89-05 overwrite route: near-miss confirmName (case / trailing space / substring) → keyed confirmPhraseMismatch + audited, ZERO state change (D-89-27 server-side re-validation)', async () => {
  const w = await bootOverwriteWorld();
  try {
    const liveBefore = w.ro.get('select doc from workspaces where id = ?', 'ws-ow').doc;
    for (const bad of ['overwrite me', 'Overwrite Me ', 'Overwrite']) {
      const res = await w.op.post('/api/backup/restore/overwrite', { runId: w.backupRunId, targetId: 'ws-ow', confirmName: bad });
      assert.equal(res.status, 400, `name ${JSON.stringify(bad)}: ${JSON.stringify(res.data)}`);
      assert.equal(res.data.code, 'confirmPhraseMismatch', `keyed: ${JSON.stringify(res.data)}`);
    }
    const audits = w.ro.all("select action from audit_log where action like 'restore_refused:%'");
    assert.equal(audits.filter(a => a.action === 'restore_refused:confirmPhraseMismatch').length, 3, 'every near-miss audited');
    assert.equal(w.ro.get('select doc from workspaces where id = ?', 'ws-ow').doc, liveBefore, 'zero state change');
    assert.equal(w.ro.get('select claimed_by from restore_lock where id = 1').claimed_by, null, 'the lock never claimed');
    assert.equal(w.ro.get("select count(*) as n from restore_runs where trigger = 'overwrite'").n, 0, 'no run rows');
  } finally {
    await closeWorld(w, w.ro);
  }
});

test('89-05 overwrite route: an instance-scope archive against a workspace target → keyed restoreTargetMismatch (scope/kind match enforced)', async () => {
  const w = await bootOverwriteWorld();
  try {
    const res = await w.op.post('/api/backup/restore/overwrite', { runId: w.instanceRunId, targetId: 'ws-ow', confirmName: w.targetName });
    assert.equal(res.status, 400, `kind mismatch: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.code, 'restoreTargetMismatch', 'keyed scope/kind refusal');
    assert.equal(w.ro.get('select claimed_by from restore_lock where id = 1').claimed_by, null, 'the lock never claimed');
  } finally {
    await closeWorld(w, w.ro);
  }
});

test('89-05 overwrite route role-gate: Restore Operator + plain member → 403 backupManageRequired + audited (D-89-21: overwrite authority = Backup Operator/Super Admin)', async () => {
  const w = await bootOverwriteWorld();
  try {
    const restoreOp = await makeRestoreOpRoute(w.srv, w.ro, 'ow-restore-op@test.local');
    const plain = await signup(w.srv.base, { name: 'Plain', email: 'ow-plain@test.local' });
    assert.equal(plain.status, 201);
    const plainClient = (await login(w.srv.base, 'ow-plain@test.local', 'password-1234')).client;

    for (const [who, cl] of [['restore_operator', restoreOp], ['plain member', plainClient]]) {
      const res = await cl.post('/api/backup/restore/overwrite', { runId: w.backupRunId, targetId: 'ws-ow', confirmName: w.targetName });
      assert.equal(res.status, 403, `${who}: ${JSON.stringify(res.data)}`);
      assert.equal(res.data.code, 'backupManageRequired', `${who}: keyed backupManageRequired`);
    }
    const audits = w.ro.all("select action from audit_log where action like 'restore_refused:%'");
    assert.equal(audits.filter(a => a.action === 'restore_refused:overwriteRoleRequired').length, 2, 'every role refusal audited');
    assert.equal(w.ro.get('select claimed_by from restore_lock where id = 1').claimed_by, null, 'the lock never claimed');
    assert.equal(w.ro.get("select count(*) as n from restore_runs where trigger = 'overwrite'").n, 0, 'no run rows from refused triggers');
  } finally {
    await closeWorld(w, w.ro);
  }
});

test('89-05 overwrite route throttle: restoreoverwrite|<id> 5/15min consuming a try — 5 refused attempts burn the budget, the 6th 429s (D-89-22)', async () => {
  const w = await bootOverwriteWorld();
  try {
    for (let i = 0; i < 5; i++) {
      const res = await w.op.post('/api/backup/restore/overwrite', { runId: w.backupRunId, targetId: 'ws-ow', confirmName: 'wrong' });
      assert.equal(res.status, 400, `attempt ${i + 1} refused keyed`);
    }
    const sixth = await w.op.post('/api/backup/restore/overwrite', { runId: w.backupRunId, targetId: 'ws-ow', confirmName: w.targetName });
    assert.equal(sixth.status, 429, `the 6th attempt throttled: ${JSON.stringify(sixth.data)}`);
    assert.equal(sixth.data.code, 'tooManyAttempts');
    assert.equal(w.ro.get('select claimed_by from restore_lock where id = 1').claimed_by, null, 'the lock never claimed');
  } finally {
    await closeWorld(w, w.ro);
  }
});

test('89-05 overwrite route outbox gate: a done overwrite claims one restore_alert per recipient (Super Admins + Backup Operators — D-89-28 via the 89-04 Task 3 machinery)', async () => {
  /* MAILER enabled via env (the email-outbox boot idiom — SMTP never
     contacted; the pass send is injected there, here only the CLAIM
     rows are pinned). */
  const srv = await startServer({
    dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-ow-outbox-')),
    env: { SMTP_HOST: '127.0.0.1', SMTP_PORT: '1', SMTP_REQUIRE_TLS: 'false', MAIL_FROM: 'noreply@test.local', APP_URL: 'http://127.0.0.1:1' },
  });
  const ro = openReader(srv);
  try {
    const op = await makeBackupOpRoute(srv, ro, 'ow-outbox-op@test.local');
    const doc = JSON.stringify({ data: { projects: [{ id: 'p1', name: 'P1', color: '#111111' }], tasks: [], comments: [], files: [], teams: [], projOrder: ['p1'], logo: null, members: [], activity: [], notifs: [], events: [], savedViews: [], recentSearches: [] } });
    ro.run('insert into workspaces (id, slug, name, color, doc, revision, created_at, updated_at, archived) values (?,?,?,?,?,?,?,?,?)', ...['ws-ob', 'outbox-ws', 'Outbox WS', '#123456', doc, 1, T, T, 0]);
    const backupRes = await op.post('/api/backup/runs', { scope: { kind: 'workspace', id: 'ws-ob' } });
    assert.equal(backupRes.status, 200);
    for (let i = 0; i < 200; i++) {
      const cur = await op.get('/api/backup/runs/current');
      if (cur.data.stage === 'done' || cur.data.stage === 'failed') break;
      await new Promise(r => setTimeout(r, 50));
    }
    const res = await op.post('/api/backup/restore/overwrite', { runId: backupRes.data.runId, targetId: 'ws-ob', confirmName: 'Outbox WS' });
    assert.equal(res.status, 200, `trigger: ${JSON.stringify(res.data)}`);
    await pollRoute(ro, db => db.get("select id from restore_runs where id = ? and status = 'done'", res.data.runId) ?? null);
    const claims = ro.all('select * from email_outbox where dedup_key like ? order by recipient', `restore-alert:${res.data.runId}:%`);
    assert.equal(claims.length, 2, `one claim per recipient (Backup Operator + Super Admin): ${JSON.stringify(claims.map(c => c.recipient))}`);
    assert.deepEqual(claims.map(c => c.recipient).sort(), ['ow-outbox-op@test.local', ADMIN.email].sort(), 'recipients = Backup Operators ∪ Super Admins');
    for (const c of claims) {
      assert.equal(c.kind, 'restore_alert');
      const ctx = JSON.parse(c.ctx);
      assert.equal(ctx.outcome, 'done');
      assert.equal(ctx.runId, res.data.runId);
    }
  } finally {
    ro.close();
    await srv.stop();
    fs.rmSync(path.dirname(srv.dbPath), { recursive: true, force: true });
  }
});

test('95-04 D-04 global lock unchanged on the project path: a claimed restore_lock refuses a project overwrite 409 backupRestoreInProgress + audited (no per-scope locking — owner ruling 2026-11-24)', async () => {
  const srv = await startServer({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-ow-proj-lock-')) });
  const ro = openReader(srv);
  try {
    const op = await makeBackupOpRoute(srv, ro, 'ow-proj-lock-op@test.local');
    const ownerId = ro.get('select id from users where email = ?', ADMIN.email).id;
    const doc = JSON.stringify({ data: { projects: [{ id: 'p-live', name: 'P Live', color: '#111111' }], tasks: [], comments: [], files: [], teams: [], projOrder: ['p-live'], logo: null, members: [], activity: [], notifs: [], events: [], savedViews: [], recentSearches: [] } });
    ro.run('insert into workspaces (id, slug, name, color, doc, revision, created_at, updated_at, archived) values (?,?,?,?,?,?,?,?,?)', ...['ws-lock', 'lock-ws', 'Lock WS', '#123456', doc, 1, T, T, 0]);
    ro.run('insert into memberships (workspace_id, user_id, role, member_id, provenance) values (?,?,?,?,?)', ...['ws-lock', ownerId, 'owner', `m_${ownerId.slice(0, 8)}`, 'manual']);
    const opId = ro.get('select id from users where email = ?', 'ow-proj-lock-op@test.local').id;
    ro.run('insert into memberships (workspace_id, user_id, role, member_id, provenance) values (?,?,?,?,?)', ...['ws-lock', opId, 'member', `m_${opId.slice(0, 8)}`, 'manual']);
    const backupRes = await op.post('/api/backup/runs', { scope: { kind: 'project', id: 'p-live' } });
    assert.equal(backupRes.status, 200);
    for (let i = 0; i < 200; i++) {
      const cur = await op.get('/api/backup/runs/current');
      if (cur.data.stage === 'done' || cur.data.stage === 'failed') break;
      await new Promise(r => setTimeout(r, 50));
    }

    /* The D-04 plant: a restore claimed by ANOTHER operator. */
    ro.run('update restore_lock set claimed_by = ?, claimed_at = ? where id = 1', ...['someone-else', Date.now()]);
    const refused = await op.post('/api/backup/restore/overwrite', { runId: backupRes.data.runId, targetId: 'ws-lock', targetProjectId: 'p-live', confirmName: 'P Live' });
    assert.equal(refused.status, 409, `lock-held project overwrite: ${JSON.stringify(refused.data)}`);
    assert.equal(refused.data.code, 'backupRestoreInProgress', 'the SAME keyed refusal the workspace path rides — no per-scope bypass');
    const audits = ro.get("select count(*) as n from audit_log where action = 'restore_refused:restoreInProgress'").n;
    assert.ok(audits >= 1, 'the refusal is audited');
    assert.equal(ro.get('select claimed_by from restore_lock where id = 1').claimed_by, 'someone-else', 'the foreign claim is untouched');
    assert.equal(ro.get("select count(*) as n from restore_runs where trigger = 'overwrite'").n, 0, 'no run row from a lock-refused trigger');
  } finally {
    ro.close();
    await srv.stop();
    fs.rmSync(path.dirname(srv.dbPath), { recursive: true, force: true });
  }
});
