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
import { backendKind, toPgSql, pgPoolRef, run as dbRun } from '../db-adapter.mjs';

/* ---- Paths (same derivation as server.js:126-132) ---- */
function dataDirs() {
  const dataDir = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
  return {
    dataDir,
    filesDir: path.join(dataDir, 'files'),
    logosDir: path.join(dataDir, 'logos'),
    tmpDir: path.join(dataDir, 'tmp'),
    backupsDir: path.join(dataDir, 'backups'),
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
  if (currentRun && (currentRun.stage === 'collecting' || currentRun.stage === 'archiving' || currentRun.stage === 'verifying')) {
    return null; // D-10: one export at a time — caller refuses with backupRunInProgress
  }
  const runId = crypto.randomUUID(); // D-18
  currentRun = { runId, scope, stage: 'collecting', startedAt: Date.now() }; // synchronous claim
  return runId;
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

/* ---- Boot-time sweep (D-13): remove DATA_DIR/tmp/backup-* orphans left
   by a crash. Exported for server.js wiring in Plan 86-02. ---- */
export function sweepStaleBackupStaging() {
  const { tmpDir } = dataDirs();
  let removed = 0;
  if (!fs.existsSync(tmpDir)) return removed;
  for (const entry of fs.readdirSync(tmpDir)) {
    if (!entry.startsWith('backup-')) continue;
    fs.rmSync(path.join(tmpDir, entry), { recursive: true, force: true });
    removed += 1;
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
   the DATA_DIR-relative location. */
function collectInstanceFiles(dirs, stagingDir, files) {
  const rootReal = fs.realpathSync(dirs.dataDir);
  const skip = new Set(['tmp', 'backups']);
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      let real;
      try {
        real = fs.realpathSync(full);
      } catch {
        continue; // vanished mid-walk — treat as missing, never follow
      }
      if (!contained(real, rootReal)) continue; // D-06: symlink escape — skip silently from collection
      if (entry.isDirectory()) {
        if (dir === dirs.dataDir && skip.has(entry.name)) continue;
        walk(real);
        continue;
      }
      if (!entry.isFile()) continue;
      const rel = path.relative(dirs.dataDir, real);
      const staged = path.join(stagingDir, rel);
      fs.mkdirSync(path.dirname(staged), { recursive: true });
      fs.copyFileSync(real, staged);
      files.push({ id: rel, name: path.basename(rel), ext: path.extname(rel).slice(1) || null, project: null, task: null, path: rel });
    }
  };
  walk(dirs.dataDir);
}

/* ---- Filename (D-14): backup-<scope-kind>-<scope-id>-<YYYYMMDD-HHMMSS>.tar.gz ---- */
function archiveName(scope, now) {
  const d = new Date(now);
  const p = n => String(n).padStart(2, '0');
  const ts = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
  return scope.kind === 'instance'
    ? `backup-instance-${ts}.tar.gz`
    : `backup-${scope.kind}-${scope.id}-${ts}.tar.gz`;
}

function rmStaging(stagingDir) {
  try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch { /* D-15 best-effort */ }
}

/* ---- The export run. Returns the final run-state object. ---- */
export async function runExport(scope) {
  const runId = claimRun(scope);
  if (!runId) return { ok: false, code: 'backupRunInProgress' };
  const dirs = dataDirs();
  const stagingDir = path.join(dirs.tmpDir, `backup-${runId}`);
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

    /* Hash staged files that were copied (D-04/D-06 entries carry no hash) */
    for (const file of files) {
      if (file.missingBlob || file.pathEscaped) continue;
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
        if (file.missingBlob || file.pathEscaped) continue;
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
    setStage('verifying');
    await verifyStagedBackup(stagingDir, manifest);

    /* Finalize: whole-archive sha256 over the FINAL bytes (canonical
       statement — computed once, after the tar is complete), then the
       atomic rename into DATA_DIR/backups (same filesystem — Pitfall 6). */
    const { sha256 } = await sha256AndSize(tarPath);
    const filename = archiveName(scope, Date.now());
    const destination = path.join(dirs.backupsDir, filename);
    fs.renameSync(tarPath, destination);
    fs.writeFileSync(`${destination}.sha256`, `${sha256}  ${filename}\n`);

    rmStaging(stagingDir); // D-15: only the verified archive remains
    completeRun(filename, sha256);
    return { ok: true, runId, filename, sha256 };
  } catch (err) {
    rmStaging(stagingDir); // D-15: failed runs leave NOTHING behind
    failRun(err);
    return { ok: false, runId, error: String(err?.message || err) };
  }
}
