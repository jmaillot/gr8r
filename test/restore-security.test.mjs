/* Phase 89 (89-01, BKRST-01) — entry allow-list + reader hardening pins.
   Every refusal vector is a hand-crafted archive built BYTE-BY-BYTE
   (clean baselines mirror the 86 ustarHeader layout; corrupt variants
   override single fields) so each keyed refusal class is pinned
   independently:
   - restoreEntryRejected (reason: traversal | absolute | unknownTable |
     badFileId | badLogoName) — the D-89-33 family 2+3 entry gate
   - restoreArchiveOversize — size field over the writer's own bound,
     refused BEFORE any data read
   - restoreArchiveChecksum — header chksum mismatch
   - restoreArchiveTruncated — stream cut mid-entry
   - restoreArchiveDuplicate — duplicate entry names in one archive
   plus the clean-archive control (zero rejections, no false positives).

   Same fixture posture as test/restore-preview.test.mjs: temp DATA_DIR
   set BEFORE the module graph imports. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { after, before, test } from 'node:test';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-restore-sec-'));
process.env.DATA_DIR = DATA_DIR;
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

const db = await import('../db-adapter.mjs');
const backup = await import('../export/backup.js');
const restore = await import('../export/restore.js');

let CLEAN_ARCHIVE = null; // real 86-written control, produced once in before()

async function freshDb() {
  await db.close();
  await db.connectDb({ dbPath: path.join(DATA_DIR, 'projects.db') });
  await db.runSchema(db.SQLITE_SCHEMA);
}

before(async () => {
  await freshDb();
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  await db.run(
    'insert into workspaces (id, slug, name, color, doc, revision, created_at, updated_at, archived) values (?,?,?,?,?,?,?,?,?)',
    [
      'ws1',
      'ws1',
      'WS ws1',
      '#123456',
      JSON.stringify({ data: { members: [], projects: [], tasks: [], comments: [], files: [], activity: [], notifs: [], events: [], projOrder: [], savedViews: [], recentSearches: [], logo: null } }),
      1,
      1700000000000,
      1700000000000,
      0,
    ],
  );
  const run = await backup.runExport({ kind: 'workspace', id: 'ws1' });
  assert.equal(run.ok, true, `runExport failed: ${run.error}`);
  CLEAN_ARCHIVE = path.join(BACKUPS_DIR, run.filename);
});

after(async () => {
  await db.close();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

/* ---- byte-by-byte ustar header builder — mirrors the 86 writer's field
   layout (export/backup.js ustarHeader) with per-field override hooks so
   each corruption vector breaks exactly one thing. ---- */
function octalField(value, width) {
  return value.toString(8).padStart(width - 1, '0') + '\0';
}

function ustarHeader({ name, size, override = {} }) {
  const buf = Buffer.alloc(512);
  const fields = {
    mode: '0000644\0',
    uid: '0000000\0',
    gid: '0000000\0',
    sizeField: octalField(size, 12),
    typeflag: '0',
    magic: 'ustar\0',
    version: '00',
    ...override,
  };
  let base = name;
  let prefix = '';
  if (!override.nameSplitDisabled && base.length > 100) {
    const cut = base.lastIndexOf('/', 100);
    prefix = base.slice(0, cut);
    base = base.slice(cut + 1);
  }
  buf.write(base, 0, Math.min(base.length, 100), 'ascii');
  if (prefix) buf.write(prefix, 345, Math.min(prefix.length, 155), 'ascii');
  buf.write(fields.mode, 100, 8, 'ascii');
  buf.write(fields.uid, 108, 8, 'ascii');
  buf.write(fields.gid, 116, 8, 'ascii');
  buf.write(fields.sizeField, 124, 12, 'ascii');
  buf.write(octalField(Math.floor(Date.now() / 1000), 12), 136, 12, 'ascii'); // mtime (seconds)
  buf.write('        ', 148, 8, 'ascii'); // chksum placeholder: 8 spaces while summing
  buf.write(fields.typeflag, 156, 1, 'ascii');
  buf.write(fields.magic, 257, 6, 'ascii');
  buf.write(fields.version, 263, 2, 'ascii');
  buf.write('gr8r', 265, 8, 'ascii');
  buf.write('gr8r', 297, 8, 'ascii');
  if (override.chksumDelta) {
    // corrupt variant: shift the stored checksum without touching the sum basis
    let sum = 0;
    for (const byte of buf) sum += byte;
    sum += override.chksumDelta;
    buf.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
    return buf;
  }
  let sum = 0;
  for (const byte of buf) sum += byte;
  buf.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  return buf;
}

/* Assemble a one-entry archive: header + padded payload + two zero blocks,
   gzipped — the exact stream shape the 86 writer produces. */
function craftArchive(filename, { name, payload = Buffer.alloc(0), override = {}, extraEntries = [], truncateAt = null }) {
  const parts = [ustarHeader({ name, size: payload.length, override }), payload];
  const pad = (512 - (payload.length % 512)) % 512;
  if (pad) parts.push(Buffer.alloc(pad));
  for (const extra of extraEntries) {
    parts.push(ustarHeader({ name: extra.name, size: extra.payload.length, override: extra.override ?? {} }));
    parts.push(extra.payload);
    const extraPad = (512 - (extra.payload.length % 512)) % 512;
    if (extraPad) parts.push(Buffer.alloc(extraPad));
  }
  parts.push(Buffer.alloc(1024)); // end marker: two zero blocks
  let tar = Buffer.concat(parts);
  if (truncateAt !== null) tar = tar.subarray(0, truncateAt); // cut mid-entry
  const archivePath = path.join(BACKUPS_DIR, filename);
  fs.writeFileSync(archivePath, zlib.gzipSync(tar));
  return archivePath;
}

function assertKeyed(err, code, reason) {
  assert.ok(err instanceof Error, `refusals are Error instances, got ${typeof err}`);
  assert.equal(err.code, code, `keyed .code mismatch: ${err.code}`);
  if (reason !== undefined) assert.equal(err.reason, reason, `keyed .reason mismatch: ${err.reason}`);
  assert.ok(err.message && err.message.length > 0, 'keyed errors carry a message');
}

/* ---- entry gate: unit vectors (the gate is the exported function the
   extraction loop consults BEFORE any write — Task 3) ---- */
test('89-01 gate: traversal shapes refuse keyed (restoreEntryRejected/traversal)', () => {
  for (const name of ['../../cron.d/evil', 'files/../../escape', '../x.ndjson', 'logos/..', 'a/../b.ndjson']) {
    try {
      restore.gateEntryName(name);
      assert.fail(`"${name}" was accepted`);
    } catch (err) {
      assertKeyed(err, 'restoreEntryRejected', 'traversal');
    }
  }
});

test('89-01 gate: absolute paths refuse keyed (restoreEntryRejected/absolute)', () => {
  for (const name of ['/etc/passwd', '/manifest.json']) {
    try {
      restore.gateEntryName(name);
      assert.fail(`"${name}" was accepted`);
    } catch (err) {
      assertKeyed(err, 'restoreEntryRejected', 'absolute');
    }
  }
});

test('89-01 gate: table names outside the frozen TABLES allow-list refuse keyed (unknownTable)', () => {
  assert.ok(
    backup.TABLES.every(t => !t.name.includes('secret')),
    'fixture sanity: secret_table is genuinely not in the frozen allow-list',
  );
  try {
    restore.gateEntryName('secret_table.ndjson');
    assert.fail('unknown table accepted');
  } catch (err) {
    assertKeyed(err, 'restoreEntryRejected', 'unknownTable');
  }
  // every REAL table name passes — the gate imports TABLES from ./backup.js
  for (const t of backup.TABLES) {
    restore.gateEntryName(`${t.name}.ndjson`); // must not throw
  }
  restore.gateEntryName('manifest.json'); // exact reserved entry — must not throw
});

test('89-01 gate: files/<id> shape violations refuse keyed (badFileId); valid flat ids pass', () => {
  for (const name of ['files/', 'files/.hidden', 'files/a/b', 'files/bad id', 'files/way-too-long-' + 'x'.repeat(64)]) {
    try {
      restore.gateEntryName(name);
      assert.fail(`"${name}" was accepted`);
    } catch (err) {
      assertKeyed(err, 'restoreEntryRejected', 'badFileId');
    }
  }
  restore.gateEntryName('files/Ab3_-'); // charset + length inside the pin — must not throw
});

test('89-01 gate: logos/<name> violations refuse keyed (badLogoName); valid names pass', () => {
  for (const name of ['logos/', 'logos/a/b', 'logos/has space', 'logos/' + 'x'.repeat(65)]) {
    try {
      restore.gateEntryName(name);
      assert.fail(`"${name}" was accepted`);
    } catch (err) {
      assertKeyed(err, 'restoreEntryRejected', 'badLogoName');
    }
  }
  restore.gateEntryName('logos/lg-1_2'); // must not throw
});

test('89-01 gate: names outside every allow-listed family refuse keyed (unexpectedEntry)', () => {
  for (const name of ['d1/long/path.txt', 'random.txt', 'projects.db']) {
    try {
      restore.gateEntryName(name);
      assert.fail(`"${name}" was accepted`);
    } catch (err) {
      assertKeyed(err, 'restoreEntryRejected', 'unexpectedEntry');
    }
  }
});

/* ---- reader hardening: crafted-archive vectors ---- */
test('89-01 oversize: size field 0o100000000000 refuses BEFORE any data read (restoreArchiveOversize)', async () => {
  // payload attached after the header is LARGER than any tar the walker could
  // consume — if the reader dared read data blocks for this entry it would hit
  // EOF (truncated class) instead of refusing at the header. The oversize class
  // firing proves header-time refusal (T-89-02).
  const hugePayload = Buffer.alloc(3 * 512, 0x41);
  const archivePath = craftArchive('oversize.tar.gz', {
    name: 'files/f1',
    payload: hugePayload,
    override: { sizeField: '100000000000' }, // 0o100000000000 = 8 GiB, over the writer bound
    truncateAt: null,
  });
  // NO end marker needed: the header must refuse before the walk ever looks for data
  try {
    await restore.readArchiveEntries(archivePath);
    assert.fail('oversize header accepted');
  } catch (err) {
    assertKeyed(err, 'restoreArchiveOversize');
  }
});

test('89-01 chksum: a one-count delta refuses keyed (restoreArchiveChecksum)', async () => {
  const archivePath = craftArchive('bad-chksum.tar.gz', {
    name: 'files/f1',
    payload: Buffer.from('clean bytes\n'),
    override: { chksumDelta: 1 },
  });
  try {
    await restore.readArchiveEntries(archivePath);
    assert.fail('bad chksum accepted');
  } catch (err) {
    assertKeyed(err, 'restoreArchiveChecksum');
  }
});

test('89-01 truncated: a stream cut mid-entry refuses keyed (restoreArchiveTruncated)', async () => {
  const archivePath = craftArchive('truncated.tar.gz', {
    name: 'files/f1',
    payload: Buffer.alloc(1024, 0x42), // two data blocks — cut inside them below
    truncateAt: 512 + 600, // header + ~1.2 data blocks: EOF mid-entry, no end marker
  });
  try {
    await restore.readArchiveEntries(archivePath);
    assert.fail('truncated stream accepted');
  } catch (err) {
    assertKeyed(err, 'restoreArchiveTruncated');
  }
});

test('89-01 duplicate: the same entry name twice in one archive refuses keyed (restoreArchiveDuplicate)', async () => {
  const archivePath = craftArchive('duplicate.tar.gz', {
    name: 'files/f1',
    payload: Buffer.from('first\n'),
    extraEntries: [{ name: 'files/f1', payload: Buffer.from('second\n') }],
  });
  try {
    await restore.readArchiveEntries(archivePath);
    assert.fail('duplicate entry accepted');
  } catch (err) {
    assertKeyed(err, 'restoreArchiveDuplicate');
  }
});

test('89-01 control: the clean 86-written archive passes the reader with zero refusals', async () => {
  const { entries, sha256 } = await restore.readArchiveEntries(CLEAN_ARCHIVE);
  assert.equal(entries[0].name, 'manifest.json');
  assert.ok(entries.length > 2, 'manifest + tables + blobs enumerated');
  assert.ok(/^[0-9a-f]{64}$/.test(sha256), 'whole-archive digest well-formed');
  const sidecar = fs.readFileSync(`${CLEAN_ARCHIVE}.sha256`, 'utf8').split(/\s+/)[0];
  assert.equal(sha256, sidecar, 'clean control digest matches the sidecar');
});
