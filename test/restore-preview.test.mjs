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
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { after, before, test } from 'node:test';

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
