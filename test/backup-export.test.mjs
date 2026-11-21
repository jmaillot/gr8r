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
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-backup-'));
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
    const into = path.join(DATA_DIR, '..', 'gr8r-backup-extract');
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
    assert.equal(fs.readdirSync(TMP_DIR).filter(d => d.startsWith('backup-')).length, 0);
  })();
});

/* ---- Task 2: scope containment (D-01) ---- */
test('workspace scope collects member-project files + logo, not other workspaces', () => {
  return (async () => {
    const run = await backup.runExport({ kind: 'workspace', id: 'ws1' });
    assert.equal(run.ok, true, `runExport failed: ${run.error}`);
    const into = path.join(DATA_DIR, '..', 'gr8r-backup-extract-ws');
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
  })();
});

/* ---- Task 2: symlink escape skipped + flagged, never followed (D-06/T-86-01) ---- */
test('symlink escape is flagged in the manifest and excluded from the archive', () => {
  return (async () => {
    const secret = path.join(os.tmpdir(), 'gr8r-backup-secret.txt');
    fs.writeFileSync(secret, 'TOP SECRET\n');
    fs.symlinkSync(secret, path.join(FILES_DIR, 'escape'));
    await seedWorkspace('ws-esc', [{ id: 'escape', project: 'p-esc', name: 'e.txt', ext: 'txt' }]);
    const run = await backup.runExport({ kind: 'project', id: 'p-esc' });
    assert.equal(run.ok, true, 'escape does not fail the run — skip + flag');
    const into = path.join(DATA_DIR, '..', 'gr8r-backup-extract-esc');
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
    const into = path.join(DATA_DIR, '..', 'gr8r-backup-extract-miss');
    extractArchive(archivePath(run), into);
    const manifest = JSON.parse(fs.readFileSync(path.join(into, 'manifest.json'), 'utf8'));
    const rec = manifest.files.find(f => f.id === 'gone');
    assert.ok(rec?.missingBlob === true);
    assert.ok(!listArchive(archivePath(run)).includes('files/gone'));
    fs.rmSync(into, { recursive: true, force: true });
  })();
});

/* ---- Task 2: self-verification fail-closed (D-15/T-86-03) ---- */
test('manifest self-verification mismatch fails closed on a corrupted staged byte', () => {
  return (async () => {
    const stagingDir = path.join(TMP_DIR, 'backup-verify-pin');
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

/* ---- Task 2: boot sweep clears staging orphans (D-13) ---- */
test('sweepStaleBackupStaging removes DATA_DIR/tmp/backup-* orphans', () => {
  const orphan = path.join(TMP_DIR, 'backup-orphan-crash');
  fs.mkdirSync(orphan, { recursive: true });
  fs.writeFileSync(path.join(orphan, 'snapshot.db'), 'junk');
  const untouched = path.join(TMP_DIR, 'not-backup-prefix');
  fs.mkdirSync(untouched, { recursive: true });
  const removed = backup.sweepStaleBackupStaging();
  assert.ok(removed >= 1);
  assert.ok(!fs.existsSync(orphan), 'orphan staging removed');
  assert.ok(fs.existsSync(untouched), 'non-backup tmp entries untouched');
  fs.rmSync(untouched, { recursive: true, force: true });
});
