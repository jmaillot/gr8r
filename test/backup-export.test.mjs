/* Phase 86 (86-01, BKBCK-01) — backup export pipeline pins.
   Golden ustar round-trip through the host `tar` tool (success criterion 1:
   "inspectable with tar tzf"), scope containment (D-01/D-06), missing-blob
   tolerance (D-04), manifest self-verification fail-closed (D-15), and the
   boot-time staging sweep (D-13).

   Fixture: temp DATA_DIR + in-process db-adapter on a SQLite snapshot —
   mirrors test/db-adapter.test.mjs's connectDb/runSchema precedent. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { after, before, test } from 'node:test';

/* DATA_DIR must be set BEFORE export/backup.js is imported (it derives its
   paths from the env at call time via dataDirs(), but keep it deterministic
   for the whole module graph anyway). */
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-backup-'));
process.env.DATA_DIR = DATA_DIR;
const FILES_DIR = path.join(DATA_DIR, 'files');
const LOGOS_DIR = path.join(DATA_DIR, 'logos');
const TMP_DIR = path.join(DATA_DIR, 'tmp');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

const db = await import('../db-adapter.mjs');
const backup = await import('../export/backup.js');

const NOW = 1700000000000;

async function freshDb() {
  await db.close();
  await db.connectDb({ dbPath: path.join(DATA_DIR, 'projects.db') });
  await db.runSchema(db.SQLITE_SCHEMA);
}

function wsDoc(files, logo = null) {
  return JSON.stringify({ data: { files, ...(logo ? { logo } : {}) } });
}

async function seedWorkspace(id, files, logo = null) {
  await db.run(
    'insert into workspaces (id, slug, name, color, doc, revision, created_at, updated_at, archived) values (?,?,?,?,?,?,?,?,?)',
    [id, id, `WS ${id}`, '#123456', wsDoc(files, logo), 1, NOW, NOW, 0],
  );
}

before(async () => {
  await freshDb();
  fs.mkdirSync(FILES_DIR, { recursive: true });
  fs.mkdirSync(LOGOS_DIR, { recursive: true });
  fs.writeFileSync(path.join(FILES_DIR, 'f1'), 'project one blob\n');
  fs.writeFileSync(path.join(FILES_DIR, 'f2'), 'project two blob\n');
  fs.writeFileSync(path.join(FILES_DIR, 'f3'), 'workspace two blob\n');
  fs.writeFileSync(path.join(LOGOS_DIR, 'lg1'), 'logo-one-bytes');
  fs.writeFileSync(path.join(LOGOS_DIR, 'lg2'), 'logo-two-bytes');
  await seedWorkspace('ws1', [
    { id: 'f1', project: 'p1', name: 'a.txt', ext: 'txt' },
    { id: 'f2', project: 'p2', name: 'b.txt', ext: 'txt' },
  ], 'lg1');
  await seedWorkspace('ws2', [
    { id: 'f3', project: 'p9', name: 'c.txt', ext: 'txt' },
  ], 'lg2');
});

after(async () => {
  await db.close();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

/* ---- helpers ---- */
function listArchive(tarPath) {
  return execFileSync('tar', ['tzf', tarPath], { encoding: 'utf8' }).split('\n').filter(Boolean);
}
function extractArchive(tarPath, into) {
  fs.mkdirSync(into, { recursive: true });
  execFileSync('tar', ['xzf', tarPath, '-C', into]);
}
function sha256Hex(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}
function archivePath(run) {
  // D-14: use the run's own filename — name-sorting is not timestamp order
  return path.join(BACKUPS_DIR, run.filename);
}

/* ---- Task 1: golden ustar round-trip (manifest entry 0, tar-inspectable) ---- */
test('project-scope export round-trips through host tar with manifest.json as entry 0', () => {
  const res = { ok: false };
  // runExport is async — drive it through an IIFE so the test body stays sync-assertive
  return (async () => {
    const run = await backup.runExport({ kind: 'project', id: 'p1' });
    assert.equal(run.ok, true, `runExport failed: ${run.error}`);
    assert.equal(backup.getRunState().stage, 'done');

    const tarPath = archivePath(run);
    assert.ok(fs.existsSync(tarPath), 'archive landed in DATA_DIR/backups');

    // success criterion 1: tar tzf lists, manifest.json FIRST
    const entries = listArchive(tarPath);
    assert.equal(entries[0], 'manifest.json');
    assert.ok(entries.includes('workspaces.ndjson'), 'table entries present');

    // tar xzf extracts
    const into = path.join(DATA_DIR, '..', 'projects-studio-backup-extract');
    extractArchive(tarPath, into);
    const manifest = JSON.parse(fs.readFileSync(path.join(into, 'manifest.json'), 'utf8'));
    assert.equal(manifest.formatVersion, 1);
    assert.deepEqual(manifest.scope, { kind: 'project', id: 'p1' });
    assert.equal(manifest.tables.length, 22); // ALL SCHEMA tables ship
    assert.ok(manifest.tables.every(t => t.sha256 && t.rows >= 0 && (t.classification === 'data' || t.classification === 'operational')));
    assert.equal(manifest.tables.find(t => t.name === 'workspaces').classification, 'data');

    // scope containment: only p1's file
    const ids = manifest.files.map(f => f.id);
    assert.ok(ids.includes('f1'), 'own project file collected');
    assert.ok(!ids.includes('f2') && !ids.includes('f3'), 'no cross-scope bleed');
    fs.rmSync(into, { recursive: true, force: true });

    // whole-archive sha256 sidecar matches the final bytes (canonical statement)
    assert.equal(sha256Hex(tarPath), run.sha256);
    assert.equal(fs.readFileSync(`${tarPath}.sha256`, 'utf8').split(' ')[0], run.sha256);

    // D-15: staging cleaned
    // D-15: staging cleaned — no run dirs left under the staging root
    assert.equal(fs.readdirSync(path.join(backup.backupsRoot(), '.backup-staging')).filter(d => d.startsWith('backup-')).length, 0);
  })();
});

/* ---- Task 2: scope containment (D-01) ---- */
test('workspace scope collects member-project files + logo, not other workspaces', () => {
  return (async () => {
    const run = await backup.runExport({ kind: 'workspace', id: 'ws1' });
    assert.equal(run.ok, true, `runExport failed: ${run.error}`);
    const into = path.join(DATA_DIR, '..', 'projects-studio-backup-extract-ws');
    extractArchive(archivePath(run), into);
    const manifest = JSON.parse(fs.readFileSync(path.join(into, 'manifest.json'), 'utf8'));
    const ids = manifest.files.map(f => f.id);
    assert.deepEqual(ids.sort(), ['f1', 'f2', 'lg1']);
    const entries = listArchive(archivePath(run));
    assert.ok(entries.includes('files/f1') && entries.includes('files/f2'));
    assert.ok(!entries.includes('files/f3'));
    assert.ok(entries.includes('logos/lg1') && !entries.includes('logos/lg2'));
    assert.ok(manifest.files.find(f => f.id === 'lg1')?.logo === true);
    assert.ok(manifest.files.find(f => f.id === 'lg2') === undefined);
    fs.rmSync(into, { recursive: true, force: true });
  })();
});

test('instance scope walks DATA_DIR (files + logos)', () => {
  return (async () => {
    const run = await backup.runExport({ kind: 'instance' });
    assert.equal(run.ok, true, `runExport failed: ${run.error}`);
    const entries = listArchive(archivePath(run));
    assert.ok(entries.includes('files/f1') && entries.includes('files/f3'));
    assert.ok(entries.includes('logos/lg1') && entries.includes('logos/lg2'));
    assert.ok(entries.includes('manifest.json'));
    // D-01 exclusions: staging home and the backups destination never enter the archive
    assert.ok(!entries.some(e => e.startsWith('tmp/')), 'tmp/ excluded');
    assert.ok(!entries.some(e => e.startsWith('backups/')), 'backups/ excluded');
  })();
});

/* ---- CR-01: a DATA_DIR-root entry with a reserved tar name is recorded
   and skipped — manifest.json stays tar entry 0, never duplicated ---- */
test('instance export refuses reserved root entry names (skip + flag, no colliding tar entry)', () => {
  return (async () => {
    const reservedManifest = path.join(DATA_DIR, 'manifest.json');
    const reservedTable = path.join(DATA_DIR, 'audit_log.ndjson');
    fs.writeFileSync(reservedManifest, 'operator residue — must not collide\n');
    fs.writeFileSync(reservedTable, 'operator residue — must not collide\n');
    try {
      const run = await backup.runExport({ kind: 'instance' });
      assert.equal(run.ok, true, 'reserved-name residue does not fail the run — skip + flag');
      const entries = listArchive(archivePath(run));
      assert.equal(entries.filter(e => e === 'manifest.json').length, 1, 'exactly ONE manifest.json tar entry');
      assert.equal(entries[0], 'manifest.json', 'manifest.json stays entry 0');
      assert.equal(entries.filter(e => e === 'audit_log.ndjson').length, 1, 'no duplicate table-name entry');
      const into = path.join(DATA_DIR, '..', 'projects-studio-backup-extract-reserved');
      extractArchive(archivePath(run), into);
      const manifest = JSON.parse(fs.readFileSync(path.join(into, 'manifest.json'), 'utf8'));
      assert.equal(manifest.files.find(f => f.path === 'manifest.json')?.nameReserved, true);
      assert.equal(manifest.files.find(f => f.path === 'audit_log.ndjson')?.nameReserved, true);
      assert.ok(!manifest.files.find(f => f.path === 'manifest.json')?.sha256, 'reserved entry carries no hash');
      fs.rmSync(into, { recursive: true, force: true });
    } finally {
      fs.rmSync(reservedManifest, { force: true });
      fs.rmSync(reservedTable, { force: true });
    }
  })();
});

/* ---- WR-01: instance-scope symlinks are never followed and never silently
   dropped — escapes flagged pathEscaped, in-tree flagged symlinkSkipped ---- */
test('instance scope flags symlink entries instead of silently skipping them', () => {
  return (async () => {
    const secret = path.join(os.tmpdir(), 'projects-studio-backup-instance-secret.txt');
    fs.writeFileSync(secret, 'INSTANCE TOP SECRET\n');
    const outLink = path.join(DATA_DIR, 'escape-link');
    const inLink = path.join(DATA_DIR, 'inside-link');
    fs.writeFileSync(path.join(DATA_DIR, 'inside-target.txt'), 'in-tree\n');
    fs.symlinkSync(secret, outLink);
    fs.symlinkSync(path.join(DATA_DIR, 'inside-target.txt'), inLink);
    try {
      const run = await backup.runExport({ kind: 'instance' });
      assert.equal(run.ok, true, 'symlinks do not fail the run — record + flag');
      const into = path.join(DATA_DIR, '..', 'projects-studio-backup-extract-symlink');
      extractArchive(archivePath(run), into);
      const manifest = JSON.parse(fs.readFileSync(path.join(into, 'manifest.json'), 'utf8'));
      const escaped = manifest.files.find(f => f.path === 'escape-link');
      const inside = manifest.files.find(f => f.path === 'inside-link');
      assert.ok(escaped, 'escape symlink is recorded in the manifest');
      assert.equal(escaped.pathEscaped, true);
      assert.ok(!escaped.sha256, 'escape symlink carries no hash — never collected');
      assert.ok(inside, 'in-tree symlink is recorded too (no silent omission)');
      assert.equal(inside.symlinkSkipped, true);
      const entries = listArchive(archivePath(run));
      assert.ok(!entries.includes('escape-link'), 'escape symlink never enters the archive');
      assert.ok(!entries.includes('inside-link'), 'symlinks are never followed into the archive');
      assert.equal(fs.readFileSync(secret, 'utf8'), 'INSTANCE TOP SECRET\n', 'secret never read');
      fs.rmSync(into, { recursive: true, force: true });
    } finally {
      fs.rmSync(secret, { force: true });
      fs.rmSync(outLink, { force: true });
      fs.rmSync(inLink, { force: true });
      fs.rmSync(path.join(DATA_DIR, 'inside-target.txt'), { force: true });
    }
  })();
});

test('unknown scope kind fails the run closed', () => {
  return (async () => {
    const run = await backup.runExport({ kind: 'galaxy', id: 'x' });
    assert.equal(run.ok, false);
    assert.match(run.error, /unknown scope kind/);
    assert.equal(backup.getRunState().stage, 'failed');
    assert.equal(fs.readdirSync(path.join(backup.backupsRoot(), '.backup-staging')).filter(d => d.startsWith('backup-')).length, 0, 'D-15: staging removed');
  })();
});

/* ---- Task 2: symlink escape skipped + flagged, never followed (D-06/T-86-01) ---- */
test('symlink escape is flagged in the manifest and excluded from the archive', () => {
  return (async () => {
    const secret = path.join(os.tmpdir(), 'projects-studio-backup-secret.txt');
    fs.writeFileSync(secret, 'TOP SECRET\n');
    fs.symlinkSync(secret, path.join(FILES_DIR, 'escape'));
    await seedWorkspace('ws-esc', [{ id: 'escape', project: 'p-esc', name: 'e.txt', ext: 'txt' }]);
    const run = await backup.runExport({ kind: 'project', id: 'p-esc' });
    assert.equal(run.ok, true, 'escape does not fail the run — skip + flag');
    const into = path.join(DATA_DIR, '..', 'projects-studio-backup-extract-esc');
    extractArchive(archivePath(run), into);
    const manifest = JSON.parse(fs.readFileSync(path.join(into, 'manifest.json'), 'utf8'));
    const rec = manifest.files.find(f => f.id === 'escape');
    assert.ok(rec, 'escaped record is flagged in the manifest');
    assert.equal(rec.pathEscaped, true);
    assert.ok(!rec.sha256, 'escaped file carries no hash — never collected');
    const entries = listArchive(archivePath(run));
    assert.ok(!entries.includes('files/escape'), 'escape never enters the archive');
    fs.rmSync(into, { recursive: true, force: true });
    fs.rmSync(secret, { force: true });
    fs.rmSync(path.join(FILES_DIR, 'escape'), { force: true });
  })();
});

/* ---- Task 2: missing blob tolerated (D-04) ---- */
test('missing blob records a missingBlob flag and the run still succeeds', () => {
  return (async () => {
    await seedWorkspace('ws-miss', [{ id: 'gone', project: 'p-miss', name: 'g.txt', ext: 'txt' }]);
    const run = await backup.runExport({ kind: 'project', id: 'p-miss' });
    assert.equal(run.ok, true, 'missing blob does not fail the run');
    assert.equal(backup.getRunState().stage, 'done');
    const into = path.join(DATA_DIR, '..', 'projects-studio-backup-extract-miss');
    extractArchive(archivePath(run), into);
    const manifest = JSON.parse(fs.readFileSync(path.join(into, 'manifest.json'), 'utf8'));
    const rec = manifest.files.find(f => f.id === 'gone');
    assert.ok(rec?.missingBlob === true);
    assert.ok(!listArchive(archivePath(run)).includes('files/gone'));
    fs.rmSync(into, { recursive: true, force: true });
  })();
});

/* ---- Task 3 (90-03, D-90-23): the honest data-quality writer stamp ----
   The run-completion path counts the manifest's missingBlob entries and
   stamps backup_runs.missing_blob_count BEFORE the run is marked terminal —
   never in a catch path (D-89-15 posture). A clean export stamps 0. */
test('90-03: the writer stamps missing_blob_count — flagged count for a missing-blob run, 0 for a clean run', () => {
  return (async () => {
    /* Minimal writer seam (mirrors server.js's writeBackupRunRow start/
       complete rows) so the stamp's UPDATE has a row to land on — the test
       harness has no server to install the real one. */
    let capturedId = null;
    backup.setBackupRunWriter(async event => {
      if (event.kind === 'start') {
        capturedId = event.runId;
        await db.run(
          'insert into backup_runs (id, task_id, scope, trigger, status, started_at, created_at) values (?,?,?,?,?,?,?)',
          [event.runId, null, JSON.stringify({ kind: event.scope?.kind ?? 'project' }), 'manual', 'running', event.startedAt, NOW],
        );
      } else if (event.kind === 'complete') {
        await db.run("update backup_runs set status = 'succeeded', filename = ? where id = ?", [event.filename, event.runId]);
      }
    });
    try {
      /* Missing-blob run: ws-miss/p-miss (seeded above) references 'gone',
         absent from FILES_DIR → exactly one flagged manifest entry. */
      const missRun = await backup.runExport({ kind: 'project', id: 'p-miss' });
      assert.equal(missRun.ok, true);
      const missRow = await db.get('select missing_blob_count from backup_runs where id = ?', [capturedId]);
      assert.equal(missRow?.missing_blob_count, 1, 'the flagged count rides the run row before the terminal write');
      assert.equal(missRun.ok === true && backup.getRunState().stage, 'done', 'the run completed — the stamp is not a terminal-state substitute');

      /* Clean run: ws1/p1 — both files present, zero flagged entries. */
      const cleanRun = await backup.runExport({ kind: 'project', id: 'p1' });
      assert.equal(cleanRun.ok, true);
      const cleanRow = await db.get('select missing_blob_count from backup_runs where id = ?', [capturedId]);
      assert.equal(cleanRow?.missing_blob_count, 0, 'a clean export stamps 0 — the client renders no badge on 0');
    } finally {
      backup.setBackupRunWriter(null); // restore the seam for the other suites
      await db.run('delete from backup_runs');
    }
  })();
});

/* ---- Task 2: self-verification fail-closed (D-15/T-86-03) ---- */
test('manifest self-verification mismatch fails closed on a corrupted staged byte', () => {
  return (async () => {
    const stagingDir = path.join(backup.backupsRoot(), '.backup-staging', 'backup-verify-pin');
    fs.mkdirSync(stagingDir, { recursive: true });
    fs.writeFileSync(path.join(stagingDir, 'workspaces.ndjson'), '{"id":"ws1"}\n');
    const manifest = {
      formatVersion: 1,
      scope: { kind: 'project', id: 'p1' },
      tables: [{ name: 'workspaces', classification: 'data', path: 'workspaces.ndjson', rows: 1, sha256: sha256Hex(path.join(stagingDir, 'workspaces.ndjson')) }],
      files: [],
    };
    await backup.verifyStagedBackup(stagingDir, manifest); // honest bytes pass
    fs.appendFileSync(path.join(stagingDir, 'workspaces.ndjson'), 'tampered\n');
    await assert.rejects(
      () => backup.verifyStagedBackup(stagingDir, manifest),
      /MISMATCH/,
      'corrupted staged byte must throw — never repair-and-pass',
    );
    fs.rmSync(stagingDir, { recursive: true, force: true });
  })();
});

/* ---- Task 2: boot sweep clears staging orphans (D-13) ----
   Amended staging contract (BACKUPS_DIR): orphans live in
   BACKUPS_DIR/.backup-staging/; the sweep ALSO still collects legacy
   DATA_DIR/tmp/backup-* debris from pre-amendment runs. ---- */
test('sweepStaleBackupStaging removes staging orphans (current + legacy homes)', () => {
  const stagingRoot = path.join(backup.backupsRoot(), '.backup-staging');
  const orphan = path.join(stagingRoot, 'backup-orphan-crash');
  fs.mkdirSync(orphan, { recursive: true });
  fs.writeFileSync(path.join(orphan, 'snapshot.db'), 'junk');
  const legacy = path.join(TMP_DIR, 'backup-legacy-debris');
  fs.mkdirSync(legacy, { recursive: true });
  fs.writeFileSync(path.join(legacy, 'snapshot.db'), 'junk');
  const untouched = path.join(TMP_DIR, 'not-backup-prefix');
  fs.mkdirSync(untouched, { recursive: true });
  const removed = backup.sweepStaleBackupStaging();
  assert.ok(removed >= 2);
  assert.ok(!fs.existsSync(orphan), 'staging-root orphan removed');
  assert.ok(!fs.existsSync(legacy), 'legacy tmp/backup-* debris removed');
  assert.ok(fs.existsSync(untouched), 'non-backup tmp entries untouched');
  fs.rmSync(untouched, { recursive: true, force: true });
});

/* =====================================================================
   88-03: S3 upload stage in runExport — local-first lifecycle pins.
   In-process sink (the 88-01 idiom) + the injected S3 destination seam
   (server.js installs the real one; tests inject this one). ---- */
import http from 'node:http';
import { setBackupDestination, setBackupRunWriter } from '../export/backup.js';

const S3_XML = code => `<?xml version="1.0"?><Error><Code>${code}</Code><Message>msg</Message></Error>`;

/* Minimal object-store sink: PUT objects (+ sidecar), GET for the D-88-8
   stream-back verify, POST uploads/uploadId for multipart. failPuts makes
   every object PUT 503 (upload_failure case). */
function startS3Sink({ failPuts = false } = {}) {
  const state = { objects: new Map(), puts: [] };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://sink');
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const key = decodeURIComponent(url.pathname.replace(/^\/projects-studio\/?/, ''));
      if (req.method === 'POST' && url.searchParams.has('uploads')) {
        return res.writeHead(200).end('<InitiateMultipartUploadResult><UploadId>u1</UploadId></InitiateMultipartUploadResult>');
      }
      if (req.method === 'POST' && url.searchParams.has('uploadId')) return res.writeHead(200).end('<CompleteMultipartUploadResult></CompleteMultipartUploadResult>');
      if (req.method === 'PUT' && url.searchParams.has('uploadId')) return res.writeHead(200, { etag: '"p"' }).end();
      if (req.method === 'PUT') {
        state.puts.push(key);
        if (failPuts) return res.writeHead(503, { 'content-type': 'application/xml' }).end(S3_XML('ServiceUnavailable'));
        state.objects.set(key, Buffer.concat(chunks));
        return res.writeHead(200).end();
      }
      if (req.method === 'GET') {
        const obj = state.objects.get(key);
        if (!obj) return res.writeHead(404).end(S3_XML('NoSuchKey'));
        return res.writeHead(200).end(obj);
      }
      res.writeHead(400).end();
    });
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, state }));
  });
}

const sinkConfig = port => ({
  endpoint: `http://127.0.0.1:${port}`,
  bucket: 'projects-studio',
  accessKeyId: 't',
  secretAccessKey: 't',
  region: 'us-east-1',
  pathStyle: true,
});

/* Writer capture: records every emitted event in order. */
function captureWriter() {
  const events = [];
  setBackupRunWriter(async event => events.push(event));
  return events;
}

test('88-03: S3-enabled run — local publish FIRST, then uploading stage with parts progress, stream-back verify, succeeded', async () => {
  const { server, port, state } = await startS3Sink();
  const events = captureWriter();
  setBackupDestination('s3', { label: 'S3', enabled: true, upload: meta => (meta?.taskId === 't-s3' ? { config: sinkConfig(port) } : null) });
  try {
    const run = await backup.runExport({ kind: 'project', id: 'p1' }, { taskId: 't-s3', trigger: 'scheduled' });
    assert.equal(run.ok, true, `runExport: ${run.error}`);
    assert.equal(backup.getRunState().stage, 'done');
    // D-88-1: the local archive is published and intact
    const tarPath = path.join(BACKUPS_DIR, run.filename);
    assert.ok(fs.existsSync(tarPath), 'local archive kept');
    assert.equal(sha256Hex(tarPath), run.sha256);
    // D-88-6 key routing: task run → backup-task-<id>/
    const keys = [...state.objects.keys()];
    const objKey = keys.find(k => !k.endsWith('.sha256'));
    assert.match(objKey, /^backup-task-t-s3\//, 'task run uploads under its task prefix');
    assert.ok(objKey.endsWith(run.filename), 'the object key carries the archive filename');
    // the uploaded bytes ARE the published archive (streamed, byte-identical)
    assert.equal(state.objects.get(objKey).toString('hex'), fs.readFileSync(tarPath).toString('hex'));
    // D-88-8 sidecar present and honest
    const sidecar = state.objects.get(`${objKey}.sha256`);
    assert.ok(sidecar, 'sidecar object present');
    assert.equal(sidecar.toString('utf8').split(/\s+/)[0], run.sha256);
    // writer events: progress (uploading stage + parts) then complete — never fail
    const progress = events.filter(e => e.kind === 'progress');
    assert.ok(progress.length >= 1, 'uploading progress emitted');
    assert.equal(progress[0].stage, 'uploading');
    assert.equal(progress[0].partsDone, 1);
    assert.equal(progress[0].partsTotal, 1);
    assert.ok(events.some(e => e.kind === 'complete' && e.filename === run.filename), 'complete still emitted after upload');
  } finally {
    setBackupDestination('s3', null);
    setBackupRunWriter(null);
    server.close();
  }
});

test('88-03: S3 failure after publish — upload_failed row shape, local archive KEPT, error sliced with no secrets', async () => {
  const { server, port } = await startS3Sink({ failPuts: true });
  const events = captureWriter();
  setBackupDestination('s3', { label: 'S3', enabled: true, upload: () => ({ config: sinkConfig(port) }) });
  try {
    const run = await backup.runExport({ kind: 'project', id: 'p1' }, { trigger: 'manual' });
    assert.equal(run.ok, false);
    assert.equal(run.code, 'uploadFailed');
    assert.ok(run.error.length <= 300);
    assert.ok(!/authorization/i.test(run.error), 'no Authorization/secret substrings (T-88-10)');
    assert.equal(backup.getRunState().stage, 'upload_failed');
    // D-88-1/2: the local archive and its sidecar are INTACT — never rmStaging'd/failRun'd
    const tarPath = path.join(BACKUPS_DIR, run.filename);
    assert.ok(fs.existsSync(tarPath), 'local archive kept on upload failure');
    assert.ok(fs.existsSync(`${tarPath}.sha256`), 'local sidecar kept');
    assert.equal(sha256Hex(tarPath), run.sha256);
    // writer event: upload_failed carries filename/sha256/size (row shows the local archive)
    const upFail = events.find(e => e.kind === 'upload_failed');
    assert.ok(upFail, 'upload_failed emitted through the writer seam');
    assert.equal(upFail.filename, run.filename);
    assert.equal(upFail.sha256, run.sha256);
    assert.ok(upFail.error.length <= 300);
    assert.ok(!events.some(e => e.kind === 'complete'), 'no complete event');
    // D-88-9: manual run → backup-manual/ prefix (key attempted)
  } finally {
    setBackupDestination('s3', null);
    setBackupRunWriter(null);
    server.close();
  }
});

test('88-03: no S3 destination installed — run completes without any upload attempt (regression)', async () => {
  const run = await backup.runExport({ kind: 'project', id: 'p1' });
  assert.equal(run.ok, true);
  assert.equal(backup.getRunState().stage, 'done');
});

/* =====================================================================
   Phase 92 (BKNAME-01, D-01/D-03) — archive naming: the five-segment
   server-resolved shape `<instance-name>-<scope>-<slug>-<gfs>-<date>`,
   manual runs with NO GFS marker, the -2 collision suffix BEFORE
   .tar.gz, and the sha256 sidecar written from the FINAL uniquified
   name (archives never renamed).
   ===================================================================== */
const todayUtc = () => {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
};

test('92 naming: PROJECTS_STUDIO_INSTANCE_NAME respected; scheduled run carries the GFS marker; manual run omits it (D-01/D-03)', () => {
  return (async () => {
    process.env.PROJECTS_STUDIO_INSTANCE_NAME = 'PjStudio!';
    backup.setBackupGfsBucketProvider(async () => 'daily');
    const created = [];
    try {
      const scheduled = await backup.runExport({ kind: 'workspace', id: 'ws1' }, { taskId: 't-naming', trigger: 'scheduled' });
      assert.equal(scheduled.ok, true, scheduled.error);
      created.push(scheduled.filename);
      /* scope ws1 name "WS ws1" → slug ws-ws1; ws token; marker; UTC date */
      assert.equal(scheduled.filename, `pjstudio-ws-ws-ws1-daily-${todayUtc()}.tar.gz`, 'five-segment scheduled shape');

      const manual = await backup.runExport({ kind: 'instance' });
      assert.equal(manual.ok, true, manual.error);
      created.push(manual.filename);
      assert.equal(manual.filename, `pjstudio-instance-${todayUtc()}.tar.gz`, 'manual run: NO GFS marker');
    } finally {
      delete process.env.PROJECTS_STUDIO_INSTANCE_NAME;
      backup.setBackupGfsBucketProvider(null);
      for (const f of created) {
        fs.rmSync(path.join(BACKUPS_DIR, f), { force: true });
        fs.rmSync(path.join(BACKUPS_DIR, `${f}.sha256`), { force: true });
      }
    }
  })();
});

test('92 naming: hostname fallback slugified when PROJECTS_STUDIO_INSTANCE_NAME unset (D-03)', () => {
  return (async () => {
    delete process.env.PROJECTS_STUDIO_INSTANCE_NAME;
    try {
      assert.match(backup.instanceSlug(), /^[a-z0-9-]+$/, 'hostname slugified');
      assert.equal(backup.instanceSlug(), backup.instanceSlug().trim());
    } finally {
      /* nothing to clean */
    }
  })();
});

test('92 naming: collision suffix -2 lands BEFORE .tar.gz and the sidecar carries the FINAL name (D-01)', () => {
  return (async () => {
    process.env.PROJECTS_STUDIO_INSTANCE_NAME = 'collide';
    try {
      const date = todayUtc();
      /* Seed the exact target the run will pick: collide-instance-<today>.tar.gz */
      const preExisting = path.join(BACKUPS_DIR, `collide-instance-${date}.tar.gz`);
      fs.writeFileSync(preExisting, 'earlier archive');
      const run = await backup.runExport({ kind: 'instance' });
      assert.equal(run.ok, true, run.error);
      assert.equal(run.filename, `collide-instance-${date}-2.tar.gz`, 'suffix inserted before .tar.gz, never a rename');
      assert.ok(fs.existsSync(path.join(BACKUPS_DIR, run.filename)), 'final archive exists');
      const sidecar = fs.readFileSync(path.join(BACKUPS_DIR, `${run.filename}.sha256`), 'utf8');
      assert.ok(sidecar.includes(`${run.filename}\n`), 'the sha256 sidecar names the FINAL uniquified filename');
      assert.match(sidecar, /^[0-9a-f]{64}/, 'sidecar leads with the whole-archive hash');
      fs.rmSync(path.join(BACKUPS_DIR, run.filename), { force: true });
      fs.rmSync(path.join(BACKUPS_DIR, `${run.filename}.sha256`), { force: true });
      fs.rmSync(preExisting, { force: true });
    } finally {
      delete process.env.PROJECTS_STUDIO_INSTANCE_NAME;
    }
  })();
});

test('92 naming: runLabel mirrors the filename structure for the UI payload (Phase 94 renders without deriving)', () => {
  const label = backup.runLabel({ instance: 'pjstudio', scope: 'workspace', label: 'Marketing', gfsBucket: 'weekly', createdAt: Date.UTC(2026, 10, 23, 12) });
  assert.equal(label, 'pjstudio-ws-marketing-weekly-2026-11-23');
  const manual = backup.runLabel({ instance: 'pjstudio', scope: 'instance', label: '', gfsBucket: null, createdAt: Date.UTC(2026, 10, 23, 12) });
  assert.equal(manual, 'pjstudio-instance-2026-11-23', 'manual label carries no GFS segment');
});
