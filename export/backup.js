/* =====================================================================
   BACKUP EXPORTER — Phase 86 (86-01, BKBCK-01)
   =====================================================================
   Server-only "gr8r backup v1" export pipeline. Lives at the repository
   ROOT beside export/mspdi.js — never under src/ (the prohibition test
   fails the moment a src/ module reaches this file).

   Zero new npm dependencies (D-33-11): tar + gzip + sha256 are hand-
   rolled / streamed on Node stdlib only.

   Format (frozen cross-phase decisions, 86-CONTEXT/86-01-PLAN):
   - ustar + gzip archive; manifest.json is tar entry 0;
   - per-table NDJSON rows (`<table>.ndjson`), classification-tagged
     data|operational, ALL 22 server.js SCHEMA tables ship;
   - files at flat `files/<id>` (ratified A6 — the real layout is flat
     FILES_DIR/<id>, extension-less; manifest records carry name/ext so
     restore can rebuild usable filenames), logos at `logos/<file>`;
   - three checksum levels: per-table + per-file sha256 INSIDE the
     manifest; whole-archive sha256 computed ONCE over the final
     destination bytes AFTER atomic rename (self-reference impossible),
     surfaced in the run status payload (D-19) + `<archive>.sha256`
     sidecar next to the tar — never in manifest entry 0;
   - manifest self-verification recomputes staged hashes and FAILS THE
     RUN on any mismatch — never repair-and-pass (D-15, fail-closed).

   [ASSUMED] items — each verified during 86-01 Task 1 against live
   Node v24.21.0 behavior / the golden tar round-trip test:
   - ustar header layout (name 100 / mode 8 / uid 8 / gid 8 / size 12
     octal / mtime 12 / chksum 8 / typeflag / linkname 100 / magic
     "ustar\0" 6 / version "00" 2 / uname 32 / gname 32 / devmajor 8 /
     devminor 8 / prefix 155 / pad 12) — VERIFIED by the suite's
     `tar tzf` / `tar xzf` golden round-trip (test/backup-export.test.mjs).
   - node:sqlite readOnly open flag is `{ readOnly: true }` — VERIFIED
     live: opens existing file read-only; missing file throws.
   - `VACUUM INTO` errors on an existing target ("output file already
     exists") — VERIFIED live; the pipeline deletes the staging target
     first (it is always fresh by construction anyway).
   - pg accepts `begin isolation level repeatable read read only` as a
     single combined statement — verified at runtime by the opt-in
     pg-matrix parity pin; on rejection the fence splits begin +
     `set transaction isolation level repeatable read, read only`.

   Pipeline (two-pass staged; memory-bounded — only 512-byte blocks and
   small chunks ever sit in RAM):
     claim (synchronous, D-10 race defense) → snapshot fence (SQLite:
     wal_checkpoint(TRUNCATE) + VACUUM INTO + readOnly snapshot reads;
     pg: checked-out client on REPEATABLE READ READ ONLY — rows ONLY
     inside the fence, Pitfall 4) → collect rows (paginated keyset
     reads, NEVER whole-table all()) + files (scope policy D-01, flat
     files/<id>) → hash staged bytes → tar (manifest first) → self-
     verify (recompute, fail-closed) → sha256 final bytes → atomic
     fs.rename into DATA_DIR/backups/ (same filesystem — Pitfall 6) →
     sidecar → done. Any error: rm -rf staging, stage=failed (D-15).

   Crash hygiene (D-13): SIGTERM/crash leaves staging to the boot-time
   sweep — sweepStaleBackupStaging() removes DATA_DIR/tmp/backup-*
   orphans; server.js wiring happens in Plan 86-02.
   ===================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { DatabaseSync } from 'node:sqlite';
import { uploadArchive, s3BackupKey, sliceError as s3SliceError, downloadToStaged, getObject } from './s3.js';
import { backendKind, toPgSql, pgPoolRef, run as dbRun, get as dbGet, all as dbAll } from '../db-adapter.mjs';

/* ---- Paths (same derivation as server.js:126-132) ----
   BACKUPS_DIR (D-08 amendment, post-87): completed archives live at
   BACKUPS_DIR, default DATA_DIR/backups (every existing deployment unchanged).
   When overridden to a separate filesystem (compose bind-mount at /backups),
   backup STAGING moves with it — staging/. — because the publish step is an
   atomic fs.rename from staging into backups (Pitfall 6: same filesystem only;
   across filesystems every run would fail EXDEV). The instance-scope walk
   skips the staging directory by name (stagingSkipName). */
export function backupsRoot() {
  return path.resolve(process.env.BACKUPS_DIR || path.join(process.env.DATA_DIR || path.join(process.cwd(), 'data'), 'backups'));
}
const BACKUP_STAGING_NAME = '.backup-staging';
export const backupStagingSkipName = BACKUP_STAGING_NAME;

function dataDirs() {
  const dataDir = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
  const backupsDir = backupsRoot();
  return {
    dataDir,
    filesDir: path.join(dataDir, 'files'),
    logosDir: path.join(dataDir, 'logos'),
    tmpDir: path.join(dataDir, 'tmp'),
    backupsDir,
    /* Staging lives ON THE BACKUPS FILESYSTEM so the rename stays atomic.
       Under the default (backups inside DATA_DIR) this differs from the
       legacy DATA_DIR/tmp location — the sweep (below) cleans BOTH, so
       upgrade debris from the old path is still collected. */
    backupStagingDir: path.join(backupsDir, BACKUP_STAGING_NAME),
  };
}

/* ---- Frozen table allow-list (verbatim from server.js SCHEMA :325-669).
   The ONLY names ever interpolated into table SQL — everything else is
   refused, fail-closed (threat T-86-02 / V5 input validation). ---- */
const DATA_TABLES = ['workspaces', 'memberships', 'team_members', 'invites'];
const OPERATIONAL_TABLES = [
  'users', 'totp_factors', 'oidc_identities', 'sessions', 'login_challenges',
  'recovery_codes', 'security_log', 'audit_log', 'reminders_sent',
  'user_notif_prefs', 'push_subscriptions', 'saved_views', 'api_keys',
  'webhook_hooks', 'webhook_deliveries', 'email_outbox', 'group_mappings',
  'instance_roles',
];
export const TABLES = Object.freeze(
  [
    ...DATA_TABLES.map(name => ({ name, classification: 'data' })),
    ...OPERATIONAL_TABLES.map(name => ({ name, classification: 'operational' })),
  ],
);

/* Keyset columns per table (paginated reads — NEVER whole-table all()).
   `id` where the schema carries one; otherwise the natural/composite
   primary key. Row-value comparison `(a,b) > (?,?)` works identically
   on node:sqlite (SQLite ≥3.15) and Postgres — one SQL shape, both
   engines, identical row reads (research Pattern 2). */
const KEYSET = Object.freeze({
  users: ['id'],
  totp_factors: ['id'],
  oidc_identities: ['id'],
  sessions: ['token_hash'],
  login_challenges: ['challenge_token_hash'],
  workspaces: ['id'],
  memberships: ['workspace_id', 'user_id'],
  team_members: ['workspace_id', 'team_id', 'user_id'],
  invites: ['token_hash'],
  recovery_codes: ['id'],
  security_log: ['id'],
  audit_log: ['id'],
  reminders_sent: ['dedup_key'],
  user_notif_prefs: ['workspace_id', 'user_id'],
  push_subscriptions: ['endpoint'],
  saved_views: ['workspace_id', 'user_id', 'key', 'name'],
  api_keys: ['id'],
  webhook_hooks: ['id'],
  webhook_deliveries: ['id'],
  email_outbox: ['id'],
  group_mappings: ['id'],
  instance_roles: ['id'],
});
const PAGE_SIZE = 500;

/* ---- Run-state holder (D-10/D-11): module-scoped, in-memory only.
   claimRun() mutates SYNCHRONOUSLY before any await — the single-process
   Node model makes the check-then-set atomic (Pitfall 5). ---- */
let currentRun = null;

export function getRunState() {
  return currentRun;
}

export function claimRun(scope) {
  if (currentRun && (currentRun.stage === 'collecting' || currentRun.stage === 'archiving' || currentRun.stage === 'verifying' || currentRun.stage === 'uploading')) {
    return null; // D-10: one export at a time — caller refuses with backupRunInProgress
  }
  const runId = crypto.randomUUID(); // D-18
  currentRun = { runId, scope, stage: 'collecting', cancelled: false, startedAt: Date.now() }; // synchronous claim
  return runId;
}

/* Cancellation token (WR-03): shutdown flips the flag; runExport checks it
   at every stage transition and aborts cleanly — its own catch path then
   owns staging removal and failRun(), so state can never flip back to
   done mid-shutdown. */
export function cancelRun() {
  if (currentRun) currentRun.cancelled = true;
}

function setStage(stage) {
  currentRun.stage = stage;
}

function completeRun(filename, sha256) {
  currentRun = { ...currentRun, stage: 'done', filename, sha256, finishedAt: Date.now() };
}

function failRun(error) {
  currentRun = { ...currentRun, stage: 'failed', error: String(error?.message || error).slice(0, 300), finishedAt: Date.now() };
}

/* ---- Boot-time sweep (D-13): remove staging orphans left by a crash.
   Cleans BOTH staging homes: the current one (backupsRoot()/.backup-staging,
   on the backups filesystem — Pitfall 6) and the legacy DATA_DIR/tmp/backup-*
   entries from pre-amendment runs, so an upgrade collects old debris too. ---- */
export function sweepStaleBackupStaging() {
  const { tmpDir, backupStagingDir } = dataDirs();
  let removed = 0;
  if (fs.existsSync(backupStagingDir)) {
    for (const entry of fs.readdirSync(backupStagingDir)) {
      fs.rmSync(path.join(backupStagingDir, entry), { recursive: true, force: true });
      removed += 1;
    }
  }
  if (fs.existsSync(tmpDir)) {
    for (const entry of fs.readdirSync(tmpDir)) {
      if (!entry.startsWith('backup-')) continue;
      fs.rmSync(path.join(tmpDir, entry), { recursive: true, force: true });
      removed += 1;
    }
  }
  return removed;
}

/* ---- ustar writer (hand-rolled, D-33-11) ---- */
function octalField(value, width) {
  // width includes the terminating NUL: 11 octal digits + NUL
  return value.toString(8).padStart(width - 1, '0') + '\0';
}

function ustarHeader({ name, size, mtime }) {
  if (!Number.isSafeInteger(size) || size < 0 || size > 0o77777777777) {
    throw new Error(`backup: staged file too large for ustar (size=${size}, path=${name})`);
  }
  let prefix = '';
  let base = name;
  if (name.length > 100) {
    const cut = name.lastIndexOf('/', 100);
    if (cut < 0 || name.length - cut - 1 > 100 || cut > 155) {
      throw new Error(`backup: path not representable in ustar (len=${name.length}, path=${name})`);
    }
    prefix = name.slice(0, cut);
    base = name.slice(cut + 1);
  }
  if (base.length > 100 || prefix.length > 155) {
    throw new Error(`backup: path not representable in ustar (path=${name})`);
  }
  const buf = Buffer.alloc(512);
  buf.write(base, 0, Math.min(base.length, 100), 'ascii');
  buf.write('0000644\0', 100, 8, 'ascii'); // mode
  buf.write('0000000\0', 108, 8, 'ascii'); // uid
  buf.write('0000000\0', 116, 8, 'ascii'); // gid
  buf.write(octalField(size, 12), 124, 12, 'ascii'); // size — max 8 GiB - 1, fail-closed above
  buf.write(octalField(Math.floor(mtime / 1000), 12), 136, 12, 'ascii'); // mtime
  buf.write('        ', 148, 8, 'ascii'); // chksum placeholder: 8 spaces while summing (tar convention)
  buf.write('0', 156, 1, 'ascii'); // typeflag: regular file
  buf.write('ustar\0', 257, 6, 'ascii'); // magic
  buf.write('00', 263, 2, 'ascii'); // version
  buf.write('gr8r', 265, 8, 'ascii'); // uname
  buf.write('gr8r', 297, 8, 'ascii'); // gname
  buf.write(prefix, 345, Math.min(prefix.length, 155), 'ascii'); // prefix
  let sum = 0;
  for (const byte of buf) sum += byte;
  buf.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  return buf;
}

function writeChunk(stream, chunk) {
  return new Promise((resolve, reject) => {
    const onError = err => reject(err);
    stream.once('error', onError);
    if (stream.write(chunk)) {
      stream.removeListener('error', onError);
      resolve();
    } else {
      stream.once('drain', () => {
        stream.removeListener('error', onError);
        resolve();
      });
    }
  });
}

async function tarEntry(gzip, { name, mtime, content }) {
  // content: Buffer (the manifest — small enough to hold)
  await writeChunk(gzip, ustarHeader({ name, size: content.length, mtime }));
  await writeChunk(gzip, content);
  await writeChunk(gzip, Buffer.alloc((512 - (content.length % 512)) % 512));
}

/* Stream a staged file into the gzip stream with backpressure + padding. */
async function tarFileEntry(gzip, name, filePath, mtime) {
  const size = fs.statSync(filePath).size;
  await writeChunk(gzip, ustarHeader({ name, size, mtime }));
  const read = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
  for await (const chunk of read) {
    await writeChunk(gzip, chunk);
  }
  await writeChunk(gzip, Buffer.alloc((512 - (size % 512)) % 512));
}

/* ---- checksum helpers (streamed — never readFile a whole dump) ---- */
function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const read = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
    read.on('data', chunk => hash.update(chunk));
    read.on('error', reject);
    read.on('end', () => resolve(hash.digest('hex')));
  });
}

async function sha256AndSize(filePath) {
  let size = 0;
  const hex = await new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const read = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
    read.on('data', chunk => { size += chunk.length; hash.update(chunk); });
    read.on('error', reject);
    read.on('end', () => resolve(hash.digest('hex')));
  });
  return { sha256: hex, size };
}

/* ---- Manifest self-verification (fail-closed, D-15). Recomputes every
   staged hash in the manifest and throws on ANY mismatch — checks only
   what was collected (D-04: missing blobs carry no hash to verify). ---- */
export async function verifyStagedBackup(stagingDir, manifest) {
  const checks = [];
  for (const table of manifest.tables) checks.push(table.path);
  for (const file of manifest.files) if (!file.missingBlob && !file.pathEscaped && file.sha256) checks.push(file.path);
  for (const rel of checks) {
    const staged = path.join(stagingDir, rel);
    const { sha256 } = await sha256AndSize(staged);
    const expected = manifest.tables.find(t => t.path === rel)?.sha256
      ?? manifest.files.find(f => f.path === rel)?.sha256;
    if (sha256 !== expected) {
      throw new Error(`backup: manifest self-verification MISMATCH for ${rel} (expected ${expected}, got ${sha256})`);
    }
  }
  return { verified: checks.length };
}

/* ---- Snapshot fence: only the fence body differs per engine; every row
   read below runs through the identical `read(sql, params)` shape. ---- */
async function withSnapshotReads(stagingDir, fn) {
  if (backendKind === 'pg') {
    const pool = pgPoolRef();
    if (!pool) throw new Error('backup: pg backend not connected');
    const client = await pool.connect(); // checked-out client — NEVER pool.query('BEGIN') (Pitfall 2)
    try {
      try {
        await client.query('begin isolation level repeatable read read only'); // A5, verified by pg-matrix pin
      } catch (err) {
        if (String(err.message).match(/syntax error/i)) {
          await client.query('begin');
          await client.query('set transaction isolation level repeatable read, read only');
        } else throw err;
      }
      // rows ONLY inside the fence; files copy after release (Pitfall 4)
      const read = async (sql, params = []) => (await client.query(toPgSql(sql), params)).rows;
      const out = await fn({ read, workspacesRows: null });
      await client.query('commit');
      return out;
    } catch (err) {
      try { await client.query('rollback'); } catch { /* fence teardown best-effort */ }
      throw err;
    } finally {
      client.release();
    }
  }
  // SQLite fence: the codebase's established --backup idiom (server.js:3804 et al).
  await dbRun('pragma wal_checkpoint(truncate)');
  const snapshotPath = path.join(stagingDir, 'snapshot.db');
  fs.rmSync(snapshotPath, { force: true }); // VACUUM INTO refuses an existing target (A3, verified)
  await dbRun(`vacuum into '${snapshotPath.replace(/'/g, "''")}'`);
  const snapshot = new DatabaseSync(snapshotPath, { readOnly: true }); // A2, verified
  try {
    const read = (sql, params = []) => snapshot.prepare(sql).all(...params);
    return await fn({ read, workspacesRows: null });
  } finally {
    snapshot.close();
  }
}

/* Paginated keyset dump of ONE table to staged NDJSON — bounded memory. */
async function dumpTable(name, read, stagingDir) {
  const cols = KEYSET[name];
  if (!cols) throw new Error(`backup: table ${name} missing from frozen keyset map (refusing ungated SQL)`);
  const order = cols.join(', ');
  const out = path.join(stagingDir, `${name}.ndjson`);
  const write = fs.createWriteStream(out, { highWaterMark: 64 * 1024 });
  const hash = crypto.createHash('sha256');
  let rows = 0;
  let cursor = null;
  // WR-04: the fence can throw mid-pagination (pg client error, rollback,
  // SQLite snapshot error) — without this guard the write-stream fd leaks
  // and a later async write error becomes an unhandled 'error' event.
  try {
    for (;;) {
      const page = cursor === null
        ? await read(`select * from ${name} order by ${order} limit ?`, [PAGE_SIZE])
        : await read(
          `select * from ${name} where (${cols.join(',')}) > (${cols.map(() => '?').join(',')}) order by ${order} limit ?`,
          [...cursor, PAGE_SIZE],
        );
      for (const row of page) {
        const line = Buffer.from(JSON.stringify(row) + '\n');
        hash.update(line);
        await writeChunk(write, line);
        rows += 1;
        cursor = cols.map(c => row[c]);
      }
      if (page.length < PAGE_SIZE) break;
    }
    await new Promise((resolve, reject) => {
      write.on('error', reject);
      write.end(resolve);
    });
  } catch (err) {
    write.destroy();
    throw err;
  }
  return { path: `${name}.ndjson`, rows, sha256: hash.digest('hex') };
}

/* ---- realpath containment (D-06 / T-86-01): escape → skip + flag,
   never follow. ---- */
function contained(realPath, rootReal) {
  return realPath === rootReal || realPath.startsWith(rootReal + path.sep);
}

function collectDocFile(record, dirs, stagingDir, filesRootReal) {
  // record: workspace doc data.files entry {id, project?, task?, name?, ext?...}
  const entry = {
    id: record.id,
    name: record.name ?? null,
    ext: record.ext ?? null,
    project: record.project ?? null,
    task: record.task ?? null,
    path: `files/${record.id}`,
  };
  const blob = path.join(dirs.filesDir, record.id);
  let real;
  try {
    real = fs.realpathSync(blob);
  } catch (err) {
    return { ...entry, missingBlob: true }; // D-04: record + continue
  }
  if (!contained(real, filesRootReal)) return { ...entry, pathEscaped: true }; // D-06: skip, never follow
  const staged = path.join(stagingDir, 'files', record.id);
  fs.mkdirSync(path.dirname(staged), { recursive: true });
  fs.copyFileSync(real, staged);
  return entry;
}

function collectLogo(logoFile, dirs, stagingDir, logosRootReal) {
  const entry = { id: logoFile, name: logoFile, ext: null, project: null, task: null, path: `logos/${logoFile}`, logo: true };
  const blob = path.join(dirs.logosDir, logoFile);
  let real;
  try {
    real = fs.realpathSync(blob);
  } catch {
    return { ...entry, missingBlob: true }; // D-04
  }
  if (!contained(real, logosRootReal)) return { ...entry, pathEscaped: true };
  const staged = path.join(stagingDir, 'logos', logoFile);
  fs.mkdirSync(path.dirname(staged), { recursive: true });
  fs.copyFileSync(real, staged);
  return entry;
}

/* Instance scope (D-01): full DATA_DIR walk minus tmp/ and backups/ —
   per-path realpath containment against DATA_DIR; archive path keeps
   the DATA_DIR-relative location.

   CR-01 (frozen entry-0 contract): a DATA_DIR-root entry named
   `manifest.json` or `<table>.ndjson` would emit a SECOND tar entry
   colliding with the reserved namespace — tarFileEntry never dedupes and
   verifyStagedBackup only re-hashes staged bytes, so the corruption would
   be silent. Consistent with D-06's skip-and-flag contract, the entry is
   RECORDED in the manifest with `nameReserved: true` and never staged,
   hashed, or tarred — the run completes honestly with the anomaly visible.

   WR-01 (D-06 parity): symlink dirents fall through neither isDirectory()
   nor isFile() — without an explicit branch they were dropped with no
   manifest flag, a silent omission the doc-file/logo collectors do not
   commit. Symlinks are never followed: escapes carry `pathEscaped`,
   in-tree symlinks carry `symlinkSkipped` (their target is already
   collected by its real path — copying would duplicate bytes). */
const RESERVED_ROOT_ENTRIES = Object.freeze(
  new Set(['manifest.json', ...TABLES.map(t => `${t.name}.ndjson`)]),
);

function collectInstanceFiles(dirs, stagingDir, files) {
  const rootReal = fs.realpathSync(dirs.dataDir);
  /* tmp/, backups/ and the staging dir (.backup-staging, inside backups when
     BACKUPS_DIR is overridden) are machinery, never user data (D-01). */
  const skip = new Set(['tmp', 'backups', backupStagingSkipName]);
  const record = (rel, real, flags) => files.push({
    id: rel,
    name: path.basename(rel),
    ext: path.extname(rel).slice(1) || null,
    project: null,
    task: null,
    path: rel,
    ...flags,
  });
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      let real;
      try {
        real = fs.realpathSync(full);
      } catch {
        continue; // vanished mid-walk — treat as missing, never follow
      }
      if (entry.isSymbolicLink()) {
        // WR-01: never follow — detect, record, and flag (D-06 parity)
        const rel = path.relative(dirs.dataDir, full);
        if (!contained(real, rootReal)) record(rel, real, { pathEscaped: true });
        else record(rel, real, { symlinkSkipped: true });
        continue;
      }
      if (!contained(real, rootReal)) continue; // D-06: escape — skip (non-symlink cannot escape here, belt-and-braces)
      if (entry.isDirectory()) {
        if (dir === dirs.dataDir && skip.has(entry.name)) continue;
        walk(real);
        continue;
      }
      if (!entry.isFile()) continue;
      const rel = path.relative(dirs.dataDir, real);
      if (RESERVED_ROOT_ENTRIES.has(rel)) {
        // CR-01: refuse the reserved tar namespace — record + skip, never emit a colliding entry
        record(rel, real, { nameReserved: true });
        continue;
      }
      const staged = path.join(stagingDir, rel);
      fs.mkdirSync(path.dirname(staged), { recursive: true });
      fs.copyFileSync(real, staged);
      record(rel, real, {});
    }
  };
  walk(dirs.dataDir);
}

/* ---- Filename (D-14): backup-<scope-kind>-<scope-id>-<YYYYMMDD-HHMMSS>.tar.gz ---- */
/* 87-02 (D-11): scheduled fires pass { taskId } through meta — the archive is
   named backup-task-<taskId>-<ts>.tar.gz (greppable on disk for rotation and
   restore); manual run names stay frozen per 86-D-14.
   UAT feedback 2026-11-22: a human-readable SLUG of the scope's name rides in
   the filename when one resolves (backup-instance-… / backup-workspace-<slug>-… /
   backup-project-<slug>-…). Ids stay as a fallback (label is best-effort —
   lookup failure never fails a run). Rotation matches by prefix/regex on the
   recorded filename in backup_runs, so the extra segment is inert to it. */
const slugify = s =>
  String(s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

/* Best-effort friendly label for the archive filename: workspace name from the
   row, project name from the workspace doc (the same source the 86-01 collector
   and the server's scope-existence probe read). */
async function scopeLabel(scope) {
  try {
    if (scope?.kind === 'workspace' && scope.id) {
      const row = await dbGet('select name from workspaces where id = ?', [scope.id]);
      return row?.name || '';
    }
    if (scope?.kind === 'project' && scope.id) {
      for (const ws of await dbAll('select doc from workspaces')) {
        let doc;
        try { doc = JSON.parse(ws.doc)?.data ?? {}; } catch { continue; }
        const p = (Array.isArray(doc.projects) ? doc.projects : []).find(x => x?.id === scope.id);
        if (p) return p.name || '';
      }
    }
  } catch { /* filename nicety only */ }
  return '';
}

function archiveName(scope, now, meta = {}) {
  const d = new Date(now);
  const p = n => String(n).padStart(2, '0');
  const ts = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
  const label = slugify(meta.label);
  if (meta.taskId) return `backup-task-${label ? `${label}-` : ''}${meta.taskId}-${ts}.tar.gz`;
  return scope.kind === 'instance'
    ? `backup-instance-${ts}.tar.gz`
    : `backup-${scope.kind}-${label || scope.id}-${ts}.tar.gz`;
}

function rmStaging(stagingDir) {
  try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch { /* D-15 best-effort */ }
}

/* ---- Persisted-run writer seam (Phase 87, 87-02, BKBCK-04 / 86-D-11).
   server.js installs ONE writer via setBackupRunWriter(); every run — the
   manual POST /api/backup/runs path AND scheduled sweep fires — emits
   start/complete/fail events so BOTH triggers produce persisted backup_runs
   history rows. The writer is awaited at each emission point so event order
   is deterministic, but a writer error NEVER affects the run itself (the
   in-memory state holder stays authoritative for the API; persistence is
   the server's observability concern and is best-effort by contract). ---- */
let backupRunWriter = null;
export function setBackupRunWriter(fn) {
  backupRunWriter = typeof fn === 'function' ? fn : null;
}

/* ---- S3 destination seam (Phase 88, 88-03, D-88-4/6/9) ----
   server.js installs ONE provider via setBackupS3Destination(); runExport
   consults it AFTER the local publish. The provider receives the run meta
   and returns { config } to upload, or null to skip (S3 disabled, or the
   task's s3_enabled off). export/backup.js stays env/engine agnostic —
   the boot-frozen S3_* consts and the s3_enabled column read live in
   server.js (the 88-02 custody). */
let s3DestinationProvider = null;
export function setBackupS3Destination(fn) {
  s3DestinationProvider = typeof fn === 'function' ? fn : null;
}
async function emitRunEvent(event) {
  if (!backupRunWriter) return;
  try {
    await backupRunWriter(event);
  } catch { /* history-write trouble never fails a run (see contract above) */ }
}

/* ---- The export run. Returns the final run-state object.
   meta (87-02): { taskId: null, trigger: 'manual' | 'scheduled' } — rides
   through the writer seam and the task-scoped archive name. ---- */
export async function runExport(scope, meta = {}) {
  const runMeta = {
    taskId: typeof meta.taskId === 'string' && meta.taskId ? meta.taskId : null,
    trigger: meta.trigger === 'scheduled' ? 'scheduled' : 'manual',
    label: '', // UAT 2026-11-22: friendly slug for the filename — resolved below, best-effort
  };
  const runId = claimRun(scope);
  if (!runId) return { ok: false, code: 'backupRunInProgress' };
  /* Filename label AFTER the claim (UAT 2026-11-22): never insert an await
     between the request and claimRun — that widens the D-10 race window the
     claim-race test pins. Inside the claim it's pure filename nicety. */
  runMeta.label = await scopeLabel(scope);
  const startedAtMs = currentRun.startedAt;
  await emitRunEvent({ kind: 'start', runId, ...runMeta, scope, startedAt: startedAtMs });
  const dirs = dataDirs();
  const stagingDir = path.join(dirs.backupStagingDir, `backup-${runId}`);
  try {
    fs.mkdirSync(stagingDir, { recursive: true });
    fs.mkdirSync(dirs.backupsDir, { recursive: true });
    fs.mkdirSync(dirs.filesDir, { recursive: true });
    fs.mkdirSync(dirs.logosDir, { recursive: true });

    /* PASS 1 — fence + collect (stage: collecting).
       Rows (incl. doc JSON resolution) run INSIDE the snapshot fence;
       blob copies run AFTER the fence is released (Pitfall 4: pg snapshot
       xmin must never be held across filesystem streaming). */
    const tables = [];
    const candidates = [];
    let files = [];
    const dirsSnapshot = dirs;
    await withSnapshotReads(stagingDir, async ({ read }) => {
      for (const { name, classification } of TABLES) {
        const dump = await dumpTable(name, read, stagingDir);
        tables.push({ name, classification, ...dump });
      }
      if (scope.kind === 'project' || scope.kind === 'workspace') {
        for (const ws of await read('select * from workspaces', [])) {
          let doc;
          try { doc = JSON.parse(ws.doc)?.data ?? {}; } catch { continue; }
          if (scope.kind === 'workspace' && ws.id !== scope.id) continue;
          if (scope.kind === 'project' && !(doc.files ?? []).some(f => f?.project === scope.id)) continue;
          for (const record of doc.files ?? []) {
            if (scope.kind === 'project' && record?.project !== scope.id) continue;
            if (!record?.id) continue;
            candidates.push({ type: 'file', record });
          }
          if (scope.kind === 'workspace' && doc.logo) {
            candidates.push({ type: 'logo', file: String(doc.logo) });
          }
        }
      }
    });
    /* WR-03 cancellation checkpoint: abort cleanly before any further staging work */
    if (currentRun.cancelled) throw new Error('backup: cancelled — server shutdown');
    // post-fence: blob copies + scope walk (never inside the fence)
    if (scope.kind === 'instance') {
      collectInstanceFiles(dirsSnapshot, stagingDir, files);
    } else if (scope.kind === 'project' || scope.kind === 'workspace') {
      const filesRootReal = fs.realpathSync(dirs.filesDir);
      const logosRootReal = fs.realpathSync(dirs.logosDir);
      for (const candidate of candidates) {
        if (candidate.type === 'file') files.push(collectDocFile(candidate.record, dirs, stagingDir, filesRootReal));
        else files.push(collectLogo(candidate.file, dirs, stagingDir, logosRootReal));
      }
    } else {
      throw new Error(`backup: unknown scope kind ${scope.kind}`);
    }

    /* Hash staged files that were copied (D-04/D-06/CR-01 entries carry no hash) */
    for (const file of files) {
      if (file.missingBlob || file.pathEscaped || file.nameReserved || file.symlinkSkipped) continue;
      const { sha256, size } = await sha256AndSize(path.join(stagingDir, file.path));
      file.sha256 = sha256;
      file.size = size;
    }

    /* Manifest (entry 0) — per-table + per-file sha256 only (Pitfall 1) */
    const manifest = {
      formatVersion: 1,
      generator: 'gr8r backup v1 (Phase 86)',
      scope: { kind: scope.kind, id: scope.id ?? null },
      createdAt: Date.now(),
      tables,
      files,
    };
    const manifestPath = path.join(stagingDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    /* PASS 2 — tar (stage: archiving): manifest FIRST, then tables, then files */
    if (currentRun.cancelled) throw new Error('backup: cancelled — server shutdown');
    setStage('archiving');
    const startedAt = currentRun.startedAt;
    const tarPath = path.join(stagingDir, 'archive.tar.gz');
    const gzip = zlib.createGzip();
    const out = fs.createWriteStream(tarPath);
    try {
      const flushed = pipeline(gzip, out); // Pitfall 7: awaited pipeline — errors propagate, streams cleaned up
      await tarEntry(gzip, { name: 'manifest.json', mtime: startedAt, content: fs.readFileSync(manifestPath) });
      for (const table of tables) {
        await tarFileEntry(gzip, table.path, path.join(stagingDir, table.path), startedAt);
      }
      for (const file of files) {
        if (file.missingBlob || file.pathEscaped || file.nameReserved || file.symlinkSkipped) continue;
        await tarFileEntry(gzip, file.path, path.join(stagingDir, file.path), startedAt);
      }
      await writeChunk(gzip, Buffer.alloc(1024)); // end-of-archive: two zero blocks
      gzip.end();
      await flushed;
    } catch (err) {
      gzip.destroy();
      throw err;
    }

    /* Self-verify (stage: verifying) — recompute staged hashes, fail-closed */
    if (currentRun.cancelled) throw new Error('backup: cancelled — server shutdown');
    setStage('verifying');
    await verifyStagedBackup(stagingDir, manifest);

    /* Finalize: whole-archive sha256 over the FINAL bytes (canonical
       statement — computed once, after the tar is complete), then the
       atomic rename into DATA_DIR/backups (same filesystem — Pitfall 6).
       WR-05: the sidecar is written INTO staging and renamed together
       with the tar — if the sidecar write fails, the run fails BEFORE the
       rename, so a "failed" status can never coexist with a published
       archive in backups/. */
    if (currentRun.cancelled) throw new Error('backup: cancelled — server shutdown');
    const { sha256, size } = await sha256AndSize(tarPath);
    const filename = archiveName(scope, Date.now(), runMeta);
    const destination = path.join(dirs.backupsDir, filename);
    const sidecarStaged = path.join(stagingDir, 'archive.sha256.staged');
    fs.writeFileSync(sidecarStaged, `${sha256}  ${filename}\n`);
    fs.renameSync(tarPath, destination);
    fs.renameSync(sidecarStaged, `${destination}.sha256`);

    rmStaging(stagingDir); // D-15: only the verified archive remains (staging; the published archive is the upload source now)

    /* ---- S3 upload stage (Phase 88, 88-03 — RATIFIED SLOT: after verify/publish).
       D-88-1: the local archive is already published and immutable. Every
       failure from here on is upload_failed — NEVER the generic catch below
       (that would rmStaging/failRun a run whose local archive exists and lie
       about it). The local archive and its history row survive untouched. ---- */
    const s3Dest = s3DestinationProvider ? await s3DestinationProvider(runMeta) : null;
    if (s3Dest?.config) {
      const uploadFailed = async err => {
        const msg = s3SliceError(err); // V14/T-88-10: sliced, no headers, no secrets
        currentRun = { ...currentRun, stage: 'upload_failed', error: msg, finishedAt: Date.now() };
        await emitRunEvent({
          kind: 'upload_failed', runId, ...runMeta, filename, sha256, sizeBytes: size,
          error: msg, startedAt: startedAtMs, finishedAt: currentRun.finishedAt,
          durationMs: currentRun.finishedAt - startedAtMs,
        });
        return { ok: false, runId, code: 'uploadFailed', filename, sha256, sizeBytes: size, error: msg };
      };
      /* Cancellation at the upload boundary routes into upload_failed too —
         the local archive EXISTS, so the generic cancelled-run path would
         misrepresent the outcome. */
      if (currentRun.cancelled) {
        return await uploadFailed(new Error('backup: cancelled before S3 upload — server shutdown'));
      }
      setStage('uploading'); // mirrors setStage('archiving') — the D-19 payload picks the stage up verbatim
      const key = s3BackupKey(runMeta, filename); // D-88-6 task prefix / D-88-9 backup-manual/
      try {
        await uploadArchive(s3Dest.config, destination, key, sha256, (partsDone, partsTotal) => {
          currentRun = { ...currentRun, partsDone, partsTotal };
          emitRunEvent({ kind: 'progress', runId, stage: 'uploading', partsDone, partsTotal }); // writer errors swallowed by the seam
        }, { isCancelled: () => currentRun.cancelled }); // MIN-04: shutdown mid-upload lands at the next part boundary → abort multipart → upload_failed
        /* D-88-8 verification: stream the object BACK and compare against
           the stored whole-archive sha256 — the ETag is never trusted
           (Pitfall 4). The sidecar must exist AND carry the same hash. */
        const back = await downloadToStaged(s3Dest.config, key, sha256, dirs.tmpDir);
        fs.rmSync(back.tmpPath, { force: true });
        const sideRes = await getObject(s3Dest.config, `${key}.sha256`);
        const sideText = (await sideRes.body()).toString('utf8');
        if (sideText.split(/\s+/)[0] !== sha256) {
          throw new Error(`s3 upload: sidecar sha256 mismatch for ${key}`);
        }
        /* D-89-15 (89-03): per-run upload truth — the restore list's honest
           S3 badge source (Pitfall 6: a column, never a heuristic). Marked
           ONLY here, after the D-88-8 stream-back verify AND the sidecar
           comparison both passed; never in a catch path — upload_failed and
           disabled-S3 runs keep uploaded = 0. The writer seam inserted the
           row at start; runId IS the backup_runs row id (BKBCK-04), and
           manual + task runs both flow through this one site. A mark
           failure routes into upload_failed (below) — the run never lies
           about a state it failed to record. */
        await dbRun('update backup_runs set uploaded = 1 where id = ?', [runId]);
      } catch (err) {
        return await uploadFailed(err);
      }
    }

    completeRun(filename, sha256);
    await emitRunEvent({
      kind: 'complete', runId, ...runMeta, filename, sha256, sizeBytes: size,
      startedAt: startedAtMs, finishedAt: currentRun.finishedAt, durationMs: currentRun.finishedAt - startedAtMs,
    });
    return { ok: true, runId, filename, sha256 };
  } catch (err) {
    rmStaging(stagingDir); // D-15: failed runs leave NOTHING behind
    failRun(err);
    await emitRunEvent({
      kind: 'fail', runId, ...runMeta,
      error: String(err?.message || err).slice(0, 300),
      startedAt: startedAtMs, finishedAt: currentRun.finishedAt, durationMs: currentRun.finishedAt - startedAtMs,
    });
    return { ok: false, runId, error: String(err?.message || err) };
  }
}
