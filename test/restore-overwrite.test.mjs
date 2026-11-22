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

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-overwrite-'));
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

const backupsCount = () => fs.readdirSync(BACKUPS_DIR).filter(f => f.endsWith('.tar.gz')).length;

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
