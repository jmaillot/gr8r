/* Phase 89 (89-01, BKRST-01) — restore engine foundations pins.
   Golden round-trip: a REAL 86-written archive streams through the new
   ustar+gzip reader (entry 0 = manifest.json; the enumerated entries
   match the manifest's declared table/file paths exactly, in order;
   the whole-archive sha256 recomputed on the SAME streaming pass equals
   the .sha256 sidecar digest), ustar prefix-field long names reconstruct,
   two zero blocks terminate the walk with trailing padding tolerated,
   and the restore-staging home mirrors D-89-32 (BACKUPS_DIR/restore-staging,
   same-fs with the archives so publish/staging renames stay atomic).

   The Phase 86 ustar WRITER (export/backup.js ustarHeader) is the
   reader's authoritative layout spec — no tar reader exists in-tree
   (89 RESEARCH Discovery 3), so every reader pin runs against a real
   runExport-produced archive.

   Fixture: temp DATA_DIR + in-process db-adapter on SQLite — mirrors
   test/backup-export.test.mjs's connectDb/runSchema precedent (DATA_DIR
   set BEFORE the module graph imports). */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { after, before, test } from 'node:test';
import { ADMIN, login, signup, startServer, withDb } from './helpers/server.mjs';

/* DATA_DIR must be set BEFORE export/backup.js / export/restore.js are
   imported (they derive their paths from the env at call time, but keep
   it deterministic for the whole module graph anyway). */
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-restore-'));
process.env.DATA_DIR = DATA_DIR;
const FILES_DIR = path.join(DATA_DIR, 'files');
const LOGOS_DIR = path.join(DATA_DIR, 'logos');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

const db = await import('../db-adapter.mjs');
const backup = await import('../export/backup.js');
const restore = await import('../export/restore.js');

const NOW = 1700000000000;

async function freshDb() {
  await db.close();
  await db.connectDb({ dbPath: path.join(DATA_DIR, 'projects.db') });
  await db.runSchema(db.SQLITE_SCHEMA);
}

/* One workspace: 1 project, 1 task, 1 comment, 1 file record + logo —
   the doc-splice content shape restore consumes (89 RESEARCH Discovery 1:
   ALL content lives inside workspaces.doc; DATA_TABLES is 4 row tables). */
function wsDoc() {
  return JSON.stringify({
    data: {
      members: [{ id: 'm1', name: 'Owner', email: 'owner@example.com' }],
      projects: [{ id: 'p1', name: 'Project One', color: '#33aa55' }],
      tasks: [{ id: 't1', project: 'p1', title: 'Task one', status: 'open' }],
      comments: [{ id: 'c1', task: 't1', body: 'hello restore' }],
      files: [{ id: 'f1', project: 'p1', task: 't1', name: 'a.txt', ext: 'txt' }],
      activity: [],
      notifs: [],
      events: [],
      projOrder: ['p1'],
      savedViews: [],
      recentSearches: [],
      logo: 'lg1',
    },
  });
}

let RUN = null; // the golden workspace export, produced once in before()
const tarPath = () => path.join(BACKUPS_DIR, RUN.filename);

before(async () => {
  await freshDb();
  fs.mkdirSync(FILES_DIR, { recursive: true });
  fs.mkdirSync(LOGOS_DIR, { recursive: true });
  fs.writeFileSync(path.join(FILES_DIR, 'f1'), 'project one blob\n');
  fs.writeFileSync(path.join(LOGOS_DIR, 'lg1'), 'logo-one-bytes');
  await db.run(
    'insert into workspaces (id, slug, name, color, doc, revision, created_at, updated_at, archived) values (?,?,?,?,?,?,?,?,?)',
    ['ws1', 'ws1', 'WS ws1', '#123456', wsDoc(), 1, NOW, NOW, 0],
  );
  const run = await backup.runExport({ kind: 'workspace', id: 'ws1' });
  assert.equal(run.ok, true, `runExport failed: ${run.error}`);
  RUN = run;
  assert.ok(fs.existsSync(tarPath()), 'archive landed under BACKUPS_DIR');
  assert.ok(fs.existsSync(`${tarPath()}.sha256`), '.sha256 sidecar beside the archive');
});

after(async () => {
  await db.close();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

/* Ground-truth manifest read via the HOST tar tool — deliberately
   independent of the reader under test (the 86 golden-round-trip
   precedent: "inspectable with tar tzf"). */
function manifestViaHostTar() {
  const into = fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-restore-host-'));
  execFileSync('tar', ['xzf', tarPath(), '-C', into, 'manifest.json']);
  const manifest = JSON.parse(fs.readFileSync(path.join(into, 'manifest.json'), 'utf8'));
  fs.rmSync(into, { recursive: true, force: true });
  return manifest;
}

/* The 86 writer tars: manifest entry 0, then every declared table in
   order, then every NON-flagged file row (flagged rows are never tarred
   — export/backup.js:721-724). The reader's enumeration must match
   exactly, in order. */
function expectedEntryNames(manifest) {
  const tarred = f => !f.missingBlob && !f.pathEscaped && !f.nameReserved && !f.symlinkSkipped;
  return [
    'manifest.json',
    ...manifest.tables.map(t => t.path),
    ...manifest.files.filter(tarred).map(f => f.path),
  ];
}

/* ---- Task 1: golden round-trip ---- */
test('89-01 golden round-trip: a real 86 archive streams through the reader — entry 0 manifest, entries match the manifest exactly', async () => {
  const manifest = manifestViaHostTar();
  assert.equal(manifest.formatVersion, 1, 'fixture sanity: frozen manifest contract');
  const { entries } = await restore.readArchiveEntries(tarPath());
  assert.deepEqual(
    entries.map(e => e.name),
    expectedEntryNames(manifest),
    'enumerated entries match the manifest-declared table/file paths exactly, in order',
  );
  assert.equal(entries[0].name, 'manifest.json', 'manifest.json is tar entry 0');
  assert.equal(
    entries[0].size,
    Buffer.byteLength(JSON.stringify(manifest, null, 2)),
    'entry-0 size field equals the manifest JSON byte length',
  );
  assert.ok(entries.every(e => Number.isSafeInteger(e.size) && e.size >= 0), 'size fields parse clean');
  for (const file of manifest.files.filter(f => !f.missingBlob)) {
    const hit = entries.find(e => e.name === file.path);
    assert.ok(hit, `file entry ${file.path} enumerated`);
    assert.equal(hit.size, file.size, `entry size for ${file.path} matches the manifest record`);
  }
});

test('89-01: whole-archive sha256 recomputed on the SAME streaming pass equals the sidecar digest (hash on the pipe, never a second read)', async () => {
  const sidecar = fs.readFileSync(`${tarPath()}.sha256`, 'utf8').split(/\s+/)[0];
  const { sha256 } = await restore.readArchiveEntries(tarPath());
  assert.equal(sha256, sidecar, 'pipe-computed digest equals the .sha256 sidecar');
  assert.equal(sha256, RUN.sha256, 'pipe-computed digest equals the run-row digest');
  let tapped = null;
  const again = await restore.readArchiveEntries(tarPath(), { onHash: h => { tapped = h; } });
  assert.equal(tapped, sidecar, 'onHash observer receives the same digest');
  assert.equal(again.sha256, sidecar);
});

test('89-01: an entry name over 100 chars round-trips through the ustar prefix field (reader reconstructs prefix/name)', async () => {
  const seg = 'a'.repeat(52);
  const nested = path.join(DATA_DIR, 'd1', seg, `${seg}.txt`);
  fs.mkdirSync(path.dirname(nested), { recursive: true });
  fs.writeFileSync(nested, 'prefix-field payload\n');
  try {
    // instance scope walks DATA_DIR — the only producer of entry names
    // long enough to exercise the writer's prefix/base split
    const run = await backup.runExport({ kind: 'instance' });
    assert.equal(run.ok, true, `runExport failed: ${run.error}`);
    const name = `d1/${seg}/${seg}.txt`;
    assert.ok(name.length > 100, 'fixture really exceeds the 100-char ustar name field');
    const { entries } = await restore.readArchiveEntries(path.join(BACKUPS_DIR, run.filename));
    const hit = entries.find(e => e.name === name);
    assert.ok(
      hit,
      `reader reconstructs prefix+'/'+base — saw: ${entries.map(e => e.name).filter(n => n.includes('d1/')).join(', ') || '(none)'}`,
    );
    assert.equal(hit.size, Buffer.byteLength('prefix-field payload\n'));
  } finally {
    fs.rmSync(path.join(DATA_DIR, 'd1'), { recursive: true, force: true });
  }
});

test('89-01: two consecutive zero blocks terminate the walk; trailing record padding is tolerated', async () => {
  const base = await restore.readArchiveEntries(tarPath());
  // append extra zero records AFTER the writer's own two-block end marker
  const raw = zlib.gunzipSync(fs.readFileSync(tarPath()));
  const paddedPath = path.join(BACKUPS_DIR, 'padded-trailing.tar.gz');
  fs.writeFileSync(paddedPath, zlib.gzipSync(Buffer.concat([raw, Buffer.alloc(512 * 3)])));
  const res = await restore.readArchiveEntries(paddedPath);
  assert.equal(res.entries[0].name, 'manifest.json');
  assert.deepEqual(
    res.entries.map(e => e.name),
    base.entries.map(e => e.name),
    'trailing zero records are tolerated — enumeration identical to the clean archive',
  );
});

test('89-01: restoreStagingDir() rides BACKUPS_DIR (D-89-32 same-fs posture) and the sweep tolerates an absent dir', () => {
  assert.equal(restore.restoreStagingDir(), path.join(backup.backupsRoot(), 'restore-staging'));
  const removed = restore.sweepStaleRestoreStaging();
  assert.ok(Number.isInteger(removed) && removed >= 0, 'sweep returns a count without throwing on an absent dir');
});

/* ---- Task 3: bounded staged extraction + staging hygiene ---- */

test('89-01 extraction: a real archive materializes the FLAT staged tree under restore-staging/<runId>', async () => {
  const manifest = manifestViaHostTar();
  const destDir = path.join(restore.restoreStagingDir(), 'extract-ws1');
  const result = await restore.extractArchive(tarPath(), destDir, manifest);
  assert.equal(result.ok, true, `extraction failed: ${result?.error ?? 'unknown'}`);
  // FLAT files/<id> (D-89-12, 86 A6): the files dir holds ONLY blob ids —
  // no owner-dir nesting, the source-level path assertion the plan pins
  assert.deepEqual(fs.readdirSync(path.join(destDir, 'files')).sort(), ['f1']);
  assert.deepEqual(fs.readdirSync(path.join(destDir, 'logos')).sort(), ['lg1']);
  assert.equal(fs.readFileSync(path.join(destDir, 'files', 'f1'), 'utf8'), 'project one blob\n');
  assert.equal(fs.readFileSync(path.join(destDir, 'logos', 'lg1'), 'utf8'), 'logo-one-bytes');
  assert.ok(fs.existsSync(path.join(destDir, 'manifest.json')), 'manifest.json extracted at the staging root');
  for (const t of manifest.tables) {
    assert.ok(fs.existsSync(path.join(destDir, t.path)), `${t.path} extracted`);
  }
  assert.deepEqual(result.flagged, [], 'a clean archive carries zero flagged rows');
  assert.ok(
    result.extracted.length >= manifest.tables.length + 2,
    'manifest + every declared table + both blobs extracted',
  );
});

test('89-01 sweep: planted orphans under restore-staging are removed with an exact count', () => {
  const home = restore.restoreStagingDir();
  fs.mkdirSync(path.join(home, 'orphan-run', 'nested'), { recursive: true });
  fs.writeFileSync(path.join(home, 'orphan-run', 'nested', 'blob.bin'), 'x');
  fs.writeFileSync(path.join(home, 'orphan-file.bin'), 'y');
  const before = fs.readdirSync(home).length;
  assert.ok(before >= 3, 'orphan-run + orphan-file.bin + the extraction dir all present');
  const removed = restore.sweepStaleRestoreStaging();
  assert.equal(removed, before, 'sweep removes every entry and returns the exact count');
  const left = fs.existsSync(home) ? fs.readdirSync(home).length : 0;
  assert.equal(left, 0, 'staging home is empty after the sweep');
});

/* =====================================================================
   89-03 (BKRST-01) — the restore READ SURFACE route pins.
   Server-harness half (startServer-per-case, test/backup-routes.test.mjs
   pattern): the list route's honest dual-location badges (D-89-14/15 —
   run-row truth only, never live S3 state), newest-first ordering, the
   empty edge, the RESTORE_USE gate with keyed + audited refusals
   (D-89-21), and terminal-row filtering. The in-process half above owns
   the reader pins; this half owns the HTTP surface.
   ===================================================================== */

const restoreAuditRows = srv =>
  withDb(srv.dbPath, db => db.prepare("select * from audit_log where action like 'restore_%' order by created_at, id").all());
const userIdByEmail = (srv, email) =>
  withDb(srv.dbPath, db => db.prepare('select id from users where email = ?').get(email).id);

/* A Restore Operator granted through the Phase 85 route (the sanctioned
   authority path — never a row planted by hand). */
async function makeRestoreOp(server, email) {
  const joined = await signup(server.base, { name: 'Restore Op', email });
  assert.equal(joined.status, 201, `signup ${email}: ${JSON.stringify(joined.data)}`);
  const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
  const grant = await operator.post('/api/auth/operator/instance-roles', {
    userId: userIdByEmail(server, email),
    role: 'restore_operator',
  });
  assert.equal(grant.status, 200, `grant: ${JSON.stringify(grant.data)}`);
  return (await login(server.base, email, 'password-1234')).client;
}

/* Plant a backup_runs history row directly — history rows are data; the
   ROUTE is the subject under test (the 86-02 suite idiom). */
function insertRun(server, row) {
  withDb(server.dbPath, db =>
    db.prepare(
      `insert into backup_runs (id, task_id, scope, trigger, status, started_at, finished_at, duration_ms, size_bytes, sha256, filename, error, created_at, uploaded)
       values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      row.id,
      row.taskId ?? null,
      JSON.stringify(row.scope ?? { kind: 'instance', id: null }),
      row.trigger ?? 'manual',
      row.status,
      row.startedAt ?? 1000,
      row.finishedAt ?? 2000,
      row.durationMs ?? 1000,
      row.sizeBytes ?? 1234,
      row.sha256 ?? 'a'.repeat(64),
      row.filename ?? null,
      row.error ?? null,
      row.createdAt,
      row.uploaded ?? 0,
    ),
  );
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* A real completed backup run via the frozen 86 surface — gives the list
   one GENUINE local archive (location 'local' must be earned, not planted). */
async function makeBackupOpAndRun(server, email) {
  const joined = await signup(server.base, { name: 'Backup Op', email });
  assert.equal(joined.status, 201);
  const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
  const grant = await operator.post('/api/auth/operator/instance-roles', {
    userId: userIdByEmail(server, email),
    role: 'backup_operator',
  });
  assert.equal(grant.status, 200, `grant: ${JSON.stringify(grant.data)}`);
  const backupOp = (await login(server.base, email, 'password-1234')).client;
  const post = await backupOp.post('/api/backup/runs', { scope: { kind: 'instance' } });
  assert.equal(post.status, 200, `trigger: ${JSON.stringify(post.data)}`);
  const deadline = Date.now() + 30000;
  for (;;) {
    const poll = await backupOp.get('/api/backup/runs/current');
    assert.equal(poll.status, 200, `poll failed: ${JSON.stringify(poll.data)}`);
    if (poll.data.stage === 'done') return poll.data;
    if (poll.data.stage === 'failed') throw new Error(`run failed: ${JSON.stringify(poll.data)}`);
    if (Date.now() > deadline) throw new Error(`run poll timeout: ${JSON.stringify(poll.data)}`);
    await sleep(50);
  }
}

test('89-03 list: zero backup runs → an honestly empty list payload (BKRST-01 empty edge, route half)', async () => {
  const server = await startServer({});
  try {
    const restoreOp = await makeRestoreOp(server, 'rop-empty@test.local');
    const res = await restoreOp.get('/api/backup/restore/backups');
    assert.equal(res.status, 200, `list: ${JSON.stringify(res.data)}`);
    assert.deepEqual(res.data, { runs: [] }, 'empty history is { runs: [] } — never a fabricated row');
  } finally {
    await server.stop();
  }
});

test('89-03 list: plain member → 403 backupRoleRequired, audited restore_refused:restoreRoleRequired (D-89-21)', async () => {
  const server = await startServer({});
  try {
    const joined = await signup(server.base, { name: 'Plain', email: 'plain-restore@test.local' });
    assert.equal(joined.status, 201);
    const plain = (await login(server.base, 'plain-restore@test.local', 'password-1234')).client;
    const res = await plain.get('/api/backup/restore/backups');
    assert.equal(res.status, 403);
    assert.equal(res.data.code, 'backupRoleRequired');
    const audits = restoreAuditRows(server);
    assert.equal(audits.length, 1, 'exactly the refusal audit row');
    assert.equal(audits[0].action, 'restore_refused:restoreRoleRequired');
    assert.equal(audits[0].actor_id, userIdByEmail(server, 'plain-restore@test.local'));
  } finally {
    await server.stop();
  }
});

test('89-03 list: honest dual-location rows newest-first — real local run, deleted+uploaded=1 S3-survival, non-terminal rows absent, stable across polls (D-89-14/15)', async () => {
  const server = await startServer({});
  try {
    /* ALL direct-db access happens BEFORE the export fires — the run's
       wal_checkpoint(truncate) + a later writer's close race the raw
       withDb handles (harness WAL quirk, see withDb's busy_timeout note),
       so users/grants/planted rows are set up first and everything after
       the run rides HTTP only. */
    const restoreOp = await makeRestoreOp(server, 'rop-list@test.local');
    const done = await makeBackupOpAndRun(server, 'bop-list@test.local');
    assert.ok(done.filename && done.sha256, 'fixture sanity: a completed run with filename + sha256');

    insertRun(server, { id: 'run-deleted-s3', status: 'deleted', uploaded: 1, filename: 'backup-gone-local.tar.gz', createdAt: 3000 });
    insertRun(server, { id: 'run-upload-failed', status: 'upload_failed', uploaded: 0, filename: null, createdAt: 2500 });
    insertRun(server, { id: 'run-running', status: 'running', uploaded: 0, filename: null, createdAt: 4000 });
    insertRun(server, { id: 'run-failed', status: 'failed', uploaded: 0, filename: null, createdAt: 5000 });

    const first = await restoreOp.get('/api/backup/restore/backups');
    assert.equal(first.status, 200, `list: ${JSON.stringify(first.data)}`);
    const rows = first.data.runs;

    /* newest-first by created_at, id desc as tiebreak (the 9044/9051 idiom) */
    const order = rows.map(r => r.createdAt);
    assert.deepEqual(order, [...order].sort((a, b) => b - a), 'rows are newest-first by created_at');
    const stable = await restoreOp.get('/api/backup/restore/backups');
    assert.deepEqual(stable.data.runs.map(r => r.runId), rows.map(r => r.runId), 'two consecutive polls return identical row order');

    /* non-terminal rows are ABSENT — history poison never enters the restore surface */
    assert.ok(!rows.some(r => r.status === 'running'), 'running row absent');
    assert.ok(!rows.some(r => r.status === 'failed'), 'failed row absent');
    assert.ok(!rows.some(r => r.runId === 'run-running' || r.runId === 'run-failed'), 'non-terminal ids absent');

    /* the real run: local archive exists → 'local', full row shape */
    const local = rows.find(r => r.status === 'succeeded');
    assert.ok(local, 'the succeeded run is present');
    assert.equal(local.location, 'local', 'a real on-disk archive badges local');
    assert.equal(local.filename, done.filename);
    assert.equal(local.sha256, done.sha256);
    assert.equal(local.trigger, 'manual');
    assert.deepEqual(
      Object.keys(local).sort(),
      ['createdAt', 'filename', 'finishedAt', 'location', 'runId', 'sha256', 'sizeBytes', 'startedAt', 'status', 'taskId', 'trigger'].sort(),
      'render-only payload shape — server-derived, client renders verbatim',
    );

    /* D-89-15 S3-survival: deleted row WITH uploaded=1 stays listable, badged s3 */
    const s3 = rows.find(r => r.runId === 'run-deleted-s3');
    assert.ok(s3, 'a deleted-status row with uploaded=1 IS present (S3-only survival after rotation)');
    assert.equal(s3.location, 's3', 'no local file + uploaded=1 → the s3 badge');
    assert.equal(s3.status, 'deleted');

    /* upload_failed is terminal — present; no file, no upload → missing */
    const failedUp = rows.find(r => r.runId === 'run-upload-failed');
    assert.ok(failedUp, 'upload_failed is a terminal status and present');
    assert.equal(failedUp.location, 'missing', 'neither destination → the honest missing badge');
  } finally {
    await server.stop();
  }
});

/* =====================================================================
   89-03 Task 2 — the honest per-run S3 truth pins.
   (a) boot ensureColumn: a pre-existing post-88 db (widened CHECK, no
       uploaded column) gains it at boot default 0; a second boot is a
       no-op with no data loss.
   (b) the upload-success mark: runExport against an in-process S3 sink —
       uploaded = 1 ONLY after the D-88-8 stream-back verify AND the
       sidecar comparison both pass; disabled-S3 and failed-upload runs
       keep 0 (Pitfall 6 closed: a column, never a heuristic).
   ===================================================================== */

test('89-03 uploaded: boot ensureColumn adds backup_runs.uploaded to a pre-existing db (default 0); second boot is a no-op', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-uploaded-boot-'));
  const dbPath = path.join(dataDir, 'projects.db');
  /* Hand-build the post-88 shape: upload_failed CHECK widened, NO uploaded
     column, one legacy row — exactly what a pre-89 deployment has on disk. */
  withDb(dbPath, db => {
    db.exec(`create table backup_runs (
      id           text primary key,
      task_id      text,
      scope        text not null default '{}',
      trigger      text not null check (trigger in ('manual','scheduled')),
      status       text not null check (status in ('running','succeeded','failed','upload_failed','interrupted','skipped_overlap','deleted')),
      started_at   integer not null,
      finished_at  integer,
      duration_ms  integer,
      size_bytes   integer,
      sha256       text,
      filename     text,
      error        text,
      created_at   integer not null
    )`);
    db.prepare("insert into backup_runs (id, trigger, status, started_at, created_at) values ('legacy-run','manual','succeeded',1,1)").run();
  });
  const server = await startServer({ dataDir });
  try {
    const cols = withDb(dbPath, db => db.prepare('pragma table_info(backup_runs)').all().map(c => c.name));
    assert.ok(cols.includes('uploaded'), 'ensureColumn added uploaded at boot');
    const legacy = withDb(dbPath, db => db.prepare('select uploaded from backup_runs where id = ?').get('legacy-run'));
    assert.equal(legacy.uploaded, 0, 'the pre-existing row defaults to 0 (no data loss, fail-closed badge)');
  } finally {
    await server.stop();
  }
  /* Second boot against the SAME database — the additive probe is a no-op. */
  const server2 = await startServer({ dataDir });
  try {
    const again = withDb(dbPath, db => db.prepare('select id, uploaded from backup_runs where id = ?').get('legacy-run'));
    assert.equal(again.id, 'legacy-run', 'second boot keeps the legacy row intact');
    assert.equal(again.uploaded, 0, 'second boot does not touch uploaded (no-op)');
  } finally {
    await server2.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('89-03 uploaded: a fully verified S3 upload marks uploaded=1; disabled S3 and failed uploads keep 0 (Pitfall 6 closed)', async () => {
  /* Minimal S3-shaped sink (the 88-01 startS3Sink idiom): PUT stores the
     object, GET serves it. discard mode stores empty bodies so the D-88-8
     stream-back verify fails deterministically. */
  let discard = false;
  const objects = new Map(); // key -> Buffer
  const sink = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://sink');
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const keyPath = decodeURIComponent(url.pathname.replace(/^\/gr8r\/?/, ''));
      if (req.method === 'PUT') {
        objects.set(keyPath, discard ? Buffer.alloc(0) : body);
        res.writeHead(200).end();
        return;
      }
      if (req.method === 'GET') {
        const obj = objects.get(keyPath);
        if (!obj) {
          res.writeHead(404).end('<?xml version="1.0"?><Error><Code>NoSuchKey</Code><Message>msg</Message></Error>');
          return;
        }
        res.writeHead(200).end(obj);
        return;
      }
      res.writeHead(400).end();
    });
  });
  await new Promise(resolve => sink.listen(0, '127.0.0.1', resolve));
  const port = sink.address().port;

  /* Mirror server.js writeBackupRunRow (BKBCK-04): the seam makes runId the
     backup_runs row id, exactly as production installs it at boot. */
  backup.setBackupRunWriter(async ev => {
    if (ev.kind === 'start') {
      await db.run(
        'insert into backup_runs (id, task_id, scope, trigger, status, started_at, created_at) values (?,?,?,?,?,?,?)',
        [ev.runId, ev.taskId ?? null, JSON.stringify({ kind: ev.scope?.kind, id: ev.scope?.id ?? null }), ev.trigger, 'running', ev.startedAt, Date.now()],
      );
    } else if (ev.kind === 'complete') {
      await db.run(
        'update backup_runs set status = ?, finished_at = ?, duration_ms = ?, size_bytes = ?, sha256 = ?, filename = ? where id = ?',
        ['succeeded', ev.finishedAt, ev.durationMs, ev.sizeBytes, ev.sha256, ev.filename, ev.runId],
      );
    } else if (ev.kind === 'upload_failed') {
      await db.run(
        'update backup_runs set status = ?, error = ?, filename = ?, sha256 = ? where id = ?',
        ['upload_failed', ev.error, ev.filename ?? null, ev.sha256 ?? null, ev.runId],
      );
    }
  });
  const sinkConfig = () => ({
    endpoint: `http://127.0.0.1:${port}`,
    bucket: 'gr8r',
    accessKeyId: 'test',
    secretAccessKey: 'test-secret',
    region: 'us-east-1',
    pathStyle: true,
  });
  const rowFor = runId => db.get('select status, uploaded, filename, sha256 from backup_runs where id = ?', [runId]);

  try {
    /* 1 — full verify chain passes → uploaded = 1 */
    backup.setBackupS3Destination(async () => ({ config: sinkConfig() }));
    const good = await backup.runExport({ kind: 'workspace', id: 'ws1' }, { trigger: 'manual' });
    assert.equal(good.ok, true, `run 1: ${good.error ?? 'ok'}`);
    const goodRow = await rowFor(good.runId);
    assert.equal(goodRow.status, 'succeeded');
    assert.equal(goodRow.uploaded, 1, 'stream-back + sidecar both verified → the row carries uploaded = 1');
    assert.ok(objects.get(`backup-manual/${good.filename}`), 'the archive object really landed in the sink');
    assert.ok(objects.get(`backup-manual/${good.filename}.sha256`), 'the sidecar really landed in the sink');

    /* 2 — S3 disabled (provider null) → uploaded stays 0 */
    backup.setBackupS3Destination(null);
    const plain = await backup.runExport({ kind: 'workspace', id: 'ws1' }, { trigger: 'manual' });
    assert.equal(plain.ok, true, `run 2: ${plain.error ?? 'ok'}`);
    const plainRow = await rowFor(plain.runId);
    assert.equal(plainRow.status, 'succeeded');
    assert.equal(plainRow.uploaded, 0, 'a no-S3 run keeps uploaded = 0 — the badge stays honest');

    /* 3 — stream-back verify fails (discarded bodies) → upload_failed, uploaded stays 0 */
    discard = true;
    backup.setBackupS3Destination(async () => ({ config: sinkConfig() }));
    const bad = await backup.runExport({ kind: 'workspace', id: 'ws1' }, { trigger: 'manual' });
    assert.equal(bad.ok, false, 'run 3 fails upload verification');
    assert.equal(bad.code, 'uploadFailed', `run 3 refusal: ${JSON.stringify(bad)}`);
    const badRow = await rowFor(bad.runId);
    assert.equal(badRow.status, 'upload_failed');
    assert.equal(badRow.uploaded, 0, 'a failed upload NEVER carries uploaded = 1 (the mark lives in the success block only)');
    assert.ok(fs.existsSync(path.join(BACKUPS_DIR, bad.filename)), 'the local archive survives the upload failure (89 D-88-1 posture)');
  } finally {
    sink.close();
    backup.setBackupS3Destination(null);
    backup.setBackupRunWriter(null);
  }
});

