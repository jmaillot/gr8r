/* ---- Phase 89 (89-01, BKRST-01): restore engine foundations ----
   Zero-dependency (D-33-11) ustar+gzip stream reader for the frozen
   "gr8r backup v1" archive format produced by export/backup.js.

   The Phase 86 ustar WRITER (export/backup.js ustarHeader) is this
   reader's authoritative layout spec — header offsets are mirrored
   byte-for-byte: name@0:100, mode@100:8, uid@108:8, gid@116:8,
   size(octal)@124:12 bound 0o77777777777 (the writer's own fail-closed
   ceiling — anything over is refused before any data is read),
   mtime@136:12 (epoch SECONDS), chksum@148:8 (summed with the field
   read as 8 spaces — the tar convention the writer used),
   typeflag@156 ('0' — gr8r archives carry regular files only),
   magic 'ustar\0'@257:6, version '00'@263:2, uname@265:8, gname@297:8,
   prefix@345:155 (long names reconstruct as prefix + '/' + name).

   Streaming posture (prohibition P3): entry data blocks are counted
   past, NEVER accumulated; the whole-archive sha256 is computed on the
   read pipe — one pass, memory-bounded (the s3.js hashTap idiom) — so
   callers compare it against the `.sha256` sidecar (content
   `<hash>  <filename>\n`) without a second read. Sidecar comparison
   happens at callers, exactly like downloadToStaged.

   D-89-32: the restore staging home is BACKUPS_DIR/restore-staging —
   same filesystem as the published archives, so a later atomic move
   out of staging stays rename(2)-cheap (EXDEV-proof, 86 Pitfall 6).
   The sweep mirrors sweepStaleBackupStaging (export/backup.js:191-208).

   D-89-12 (86 A6): file blobs restore FLAT as files/<id> and
   logos/<name> — the archive never nests owner dirs and neither does
   staging; the entry allow-list (Task 89-02) pins that shape.

   Refusal classes — stable `.code` strings, keyed error objects
   (.code + .message, never bare throws across the API boundary) so
   plans 03/04 route handlers map them into fail() responses:
   - restoreArchiveHeaderInvalid (reason: magic | octalField | typeflag)
   - restoreArchiveChecksum      header chksum mismatch
   - restoreArchiveOversize      size field over the writer's own bound, refused BEFORE any data read (T-89-02)
   - restoreArchiveTruncated     EOF before the two-zero-block end marker, or an unreadable gzip stream (cause kept in the message)
   - restoreArchiveDuplicate     the same entry name twice in one archive
   - restoreEntryRejected        entry-name allow-list gate (reason: traversal | absolute | unknownTable |
                                 badFileId | badLogoName | unexpectedEntry) — D-89-33 families 2+3
   - restoreShaMismatch          an extracted entry's content hash disagrees with its manifest row
                                 (non-flagged rows only — flagged rows carry no hash to verify, 86-D-4)
   - restoreContainmentViolated  an extraction target escapes destDir through a symlink (contained()
                                 realpath discipline — backup.js:412-416 shape — before every write)
   - restoreArchiveIncomplete    the manifest declares a row the archive never carried (fail-closed)
   The gate (gateEntryName) runs BEFORE any extraction decision: the only
   valid entry names are exactly `manifest.json`, `<table>.ndjson` where
   the table ∈ the frozen TABLES set imported from export/backup.js (the
   archive supplies table names as untrusted input — single allow-list
   source of truth, never a second classification table), flat
   `files/<[A-Za-z0-9_-]{1,64}>` (D-89-12, 86 A6) and
   `logos/<[A-Za-z0-9_-]{1,64}>`.

   extractArchive(archivePath, destDir, manifest) — Task 89-01 Task 3 —
   seek-extracts ONLY manifest-declared entries into destDir (the caller
   passes restoreStagingDir()/<runId>/): blobs land FLAT as
   destDir/files/<id> and destDir/logos/<name> (D-89-12), tables and the
   manifest at the staging root. Flag rows (missingBlob/pathEscaped/
   nameReserved/symlinkSkipped) are carried in the result with no sha
   verification and never stop the run (verifyStagedBackup posture,
   backup.js:313-327); unmanifested and gate-refused entries are skipped
   — counted in result.skipped, never written. Entry bodies stream to
   disk in bounded chunks with write-stream backpressure — never
   whole-file buffering (P3). On ANY error the catch rmStaging()s destDir
   so a failed restore leaves NOTHING behind (D-15 mirrored, D-89-32). ---- */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import zlib from 'node:zlib';
import { backupsRoot, TABLES, runExport } from './backup.js';
import { downloadToStaged, s3BackupKey } from './s3.js';

const BLOCK = 512;
const MAX_USTAR_SIZE = 0o77777777777; // 8 GiB - 1 — the writer's own ceiling (ustarHeader)
const USTAR_MAGIC = Buffer.from('ustar\0', 'ascii');
const EMPTY = Buffer.alloc(0);

/* D-89-33 family 2: the table allow-list is the 86 T-86-02 posture
   mirrored — imported frozen from the writer, never re-declared. */
const ALLOWED_TABLE_NAMES = Object.freeze(new Set(TABLES.map(t => t.name)));
const FILE_ENTRY_RE = /^files\/([A-Za-z0-9_-]{1,64})$/; // flat blob layout (86 A6)
const LOGO_ENTRY_RE = /^logos\/([A-Za-z0-9_-]{1,64})$/; // logo blobs carry the same uid shape

/* Keyed refusal — every refusal crossing the API boundary carries a
   stable .code (+ optional structured extras) for fail() mapping. */
function keyed(code, message, extra = {}) {
  const err = new Error(message);
  err.code = code;
  Object.assign(err, extra);
  return err;
}

/* ---- D-89-33 entry gate (T-89-01/T-89-03): the ONLY accepted entry
   names. Runs BEFORE any extraction decision — a rejected name never
   reaches a write. Returns the entry kind (manifest | table | file |
   logo) so the extraction loop can route, throws keyed
   restoreEntryRejected on everything else. Traversal/absolute shapes
   are checked first so `files/../../escape` refuses as traversal, not
   as a shape miss. ---- */
export function gateEntryName(name) {
  const reject = (reason, message) => {
    throw keyed('restoreEntryRejected', `restore: entry "${name}" rejected — ${message}`, { reason, name });
  };
  if (typeof name !== 'string' || name.length === 0) reject('unexpectedEntry', 'empty entry name');
  if (name.startsWith('/')) reject('absolute', 'absolute paths are never valid inside an archive');
  if (name.includes('\\')) reject('traversal', 'backslash separators are refused');
  const segments = name.split('/');
  if (segments.some(seg => seg === '..')) reject('traversal', 'parent-directory segments are refused');
  if (name === 'manifest.json') return { name, kind: 'manifest' };
  if (segments[0] === 'files') {
    if (FILE_ENTRY_RE.test(name)) return { name, kind: 'file' };
    reject('badFileId', 'file entries must be exactly files/<id> with a flat 1-64 char [A-Za-z0-9_-] id (86 A6)');
  }
  if (segments[0] === 'logos') {
    if (LOGO_ENTRY_RE.test(name)) return { name, kind: 'logo' };
    reject('badLogoName', 'logo entries must be exactly logos/<name> with a flat 1-64 char [A-Za-z0-9_-] name');
  }
  if (name.endsWith('.ndjson')) {
    const table = name.slice(0, -'.ndjson'.length);
    if (ALLOWED_TABLE_NAMES.has(table)) return { name, kind: 'table' };
    reject('unknownTable', `"${table}" is not in the frozen TABLES allow-list from export/backup.js`);
  }
  reject('unexpectedEntry', 'outside every allow-listed entry family');
}

/* Octal ASCII field — NUL/space padded on either side (the writer emits
   `digits + '\0'`; GNU tar space-pads). Any non-octal byte refuses:
   garbage size fields are attacker input, never guesses. */
function parseOctal(field, what, archivePath) {
  let end = field.length;
  while (end > 0 && (field[end - 1] === 0 || field[end - 1] === 0x20)) end -= 1;
  let start = 0;
  while (start < end && field[start] === 0x20) start += 1;
  if (start >= end) {
    throw keyed('restoreArchiveHeaderInvalid', `restore: empty octal field ${what} in ${archivePath}`, { reason: 'octalField' });
  }
  let value = 0;
  for (let i = start; i < end; i += 1) {
    const byte = field[i];
    if (byte < 0x30 || byte > 0x37) {
      throw keyed('restoreArchiveHeaderInvalid', `restore: non-octal byte in field ${what} in ${archivePath}`, { reason: 'octalField' });
    }
    value = value * 8 + (byte - 0x30);
  }
  return value;
}

/* NUL-terminated ASCII string field (name/prefix). */
function readString(field) {
  const nul = field.indexOf(0);
  return (nul === -1 ? field : field.subarray(0, nul)).toString('utf8');
}

/* One 512-byte header block → {name, size, typeflag, mode, mtime}.
   Validation order: chksum (integrity first), magic/version, typeflag,
   size (+ writer bound — BEFORE any data byte of the entry is read,
   T-89-02), then the descriptive fields. */
function parseHeader(block, archivePath) {
  const base = readString(block.subarray(0, 100));
  const prefix = readString(block.subarray(345, 500)); // 345 + 155
  const name = prefix ? `${prefix}/${base}` : base;

  let sum = 0;
  for (let i = 0; i < BLOCK; i += 1) sum += i >= 148 && i < 156 ? 0x20 : block[i];
  const storedChksum = parseOctal(block.subarray(148, 156), `chksum of "${name}"`, archivePath);
  if (storedChksum !== sum) {
    throw keyed('restoreArchiveChecksum', `restore: header chksum mismatch for "${name}" in ${archivePath}`, { name });
  }

  if (!block.subarray(257, 263).equals(USTAR_MAGIC) || block.subarray(263, 265).toString('ascii') !== '00') {
    throw keyed('restoreArchiveHeaderInvalid', `restore: not a ustar header (bad magic/version) for "${name}" in ${archivePath}`, { reason: 'magic', name });
  }

  const typeflag = String.fromCharCode(block[156]);
  if (typeflag !== '0') {
    throw keyed(
      'restoreArchiveHeaderInvalid',
      `restore: unsupported entry type ${JSON.stringify(typeflag)} for "${name}" in ${archivePath} — gr8r archives carry regular files only`,
      { reason: 'typeflag', name },
    );
  }

  const size = parseOctal(block.subarray(124, 136), `size of "${name}"`, archivePath);
  if (size > MAX_USTAR_SIZE) {
    throw keyed(
      'restoreArchiveOversize',
      `restore: size field ${size} for "${name}" exceeds the ustar writer bound ${MAX_USTAR_SIZE} in ${archivePath}`,
      { name, size },
    );
  }

  const mode = parseOctal(block.subarray(100, 108), `mode of "${name}"`, archivePath);
  const mtime = parseOctal(block.subarray(136, 148), `mtime of "${name}"`, archivePath);
  return { name, size, typeflag, mode, mtime };
}

function isZeroBlock(block) {
  return block.every(byte => byte === 0);
}

/* The walk consumes the gunzipped stream statefully: header blocks are
   parsed, entry data blocks are counted past and DROPPED immediately
   (never accumulated — P3), and the archive ends at two consecutive
   zero blocks (the writer's exact end marker). Anything after the end
   marker (extra zero padding) is tolerated and discarded. */
class TarWalker extends Writable {
  constructor(archivePath, { onEntry } = {}) {
    super();
    this.archivePath = archivePath;
    this.onEntry = onEntry ?? null;
    this.buf = EMPTY;
    this.entries = [];
    this.seen = new Set(); // duplicate entry names are archive corruption — refuse (walk-level)
    this.zeroBlocks = 0;
    this.done = false;
    this.state = 'header'; // 'header' | 'data'
    this.skip = 0; // block-rounded data bytes still to consume for the current entry
    this.remaining = 0; // exact payload bytes still to ROUTE (padding is consumed but never routed)
    this.sink = null; // per-entry write sink from onEntry, or null (drop the body)
    this.pendingCb = null; // withheld while a sink applies backpressure
  }

  _write(chunk, _enc, cb) {
    if (this.done) {
      cb(); // trailing bytes after the end marker are padding — discard
      return;
    }
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    this.pendingCb = cb;
    try {
      this.consume();
    } catch (err) {
      this.pendingCb = null;
      cb(err);
      return;
    }
    if (this.pendingCb) {
      const done = this.pendingCb;
      this.pendingCb = null;
      done();
    }
  }

  _final(cb) {
    if (!this.done) {
      if (this.sink) this.sink.stream.destroy();
      cb(keyed('restoreArchiveTruncated', `restore: archive stream ended before the end-of-archive marker: ${this.archivePath}`));
      return;
    }
    cb();
  }

  /* Entry body complete: end the write stream, verify the piped hash
     against the manifest row (fail-closed), record the extraction. The
     flush is awaited by extractArchive via s.finished before it returns
     — callers may read the staged tree immediately. */
  finishSink() {
    const s = this.sink;
    this.sink = null;
    const digest = s.hash.digest('hex');
    if (s.expected !== null && s.expected !== undefined && digest !== s.expected) {
      s.stream.destroy();
      throw keyed('restoreShaMismatch', `restore: entry "${s.name}" content sha256 mismatch (expected ${s.expected}, got ${digest})`, { name: s.name });
    }
    s.finished = new Promise((resolve, reject) => {
      s.stream.end(err => (err ? reject(err) : resolve()));
    });
    s.finished.catch(() => {}); // handled up front — the error path destroys sinks and never awaits them
    s.onDone();
  }

  consume() {
    for (;;) {
      if (this.done) {
        this.buf = EMPTY;
        return;
      }
      if (this.state === 'data') {
        const take = Math.min(this.buf.length, this.skip);
        if (take > 0) {
          const route = Math.min(take, this.remaining); // payload only — block padding is consumed, never routed
          if (route > 0) {
            const slice = this.buf.subarray(0, route);
            if (this.sink) {
              this.sink.hash.update(slice);
              if (!this.sink.stream.write(slice)) {
                /* backpressure — withhold the walk's cb until the write
                   stream drains, then resume with the remaining bytes */
                const paused = this.pendingCb;
                this.pendingCb = null;
                this.sink.stream.once('drain', paused);
                this.skip -= take;
                this.remaining -= route;
                this.buf = this.buf.subarray(take);
                if (this.buf.length === 0) this.buf = EMPTY;
                return;
              }
            }
          }
          this.skip -= take; // routed to a sink or dropped — never accumulated (P3)
          this.remaining -= route;
          this.buf = this.buf.subarray(take);
          if (this.buf.length === 0) this.buf = EMPTY;
        }
        if (this.skip > 0) return; // need more bytes for this entry's body
        if (this.sink) this.finishSink();
        this.state = 'header';
        continue;
      }
      if (this.buf.length < BLOCK) return; // header straddles chunks — wait for more
      const block = this.buf.subarray(0, BLOCK);
      this.buf = this.buf.subarray(BLOCK);
      if (this.buf.length === 0) this.buf = EMPTY;
      if (isZeroBlock(block)) {
        this.zeroBlocks += 1;
        if (this.zeroBlocks >= 2) {
          this.done = true;
          this.buf = EMPTY;
        }
        continue;
      }
      this.zeroBlocks = 0;
      const entry = parseHeader(block, this.archivePath); // keyed refusals propagate
      if (this.seen.has(entry.name)) {
        throw keyed('restoreArchiveDuplicate', `restore: duplicate entry name "${entry.name}" in ${this.archivePath}`, { name: entry.name });
      }
      this.seen.add(entry.name);
      this.entries.push(entry);
      this.skip = Math.ceil(entry.size / BLOCK) * BLOCK; // data rounded to the block boundary (consumption)
      this.remaining = entry.size; // exact payload bytes (routing — padding never reaches a sink)
      this.sink = this.onEntry ? this.onEntry(entry) : null; // open a write sink, or skip the body
      this.state = 'data';
    }
  }
}

/* Stream the archive once: enumerate every entry (name/size/typeflag/
   mode/mtime) AND compute the whole-archive sha256 on the same pipe.
   Memory stays bounded no matter how large the blobs are. onEntry, when
   provided, is called at each header parse and may return a write sink
   ({ stream, hash, expected, name, onDone }) to receive that entry's
   body — a non-null `expected` makes its finish-time hash check refuse
   keyed on mismatch. */
export async function readArchiveEntries(archivePath, { onHash, onEntry, onWalker } = {}) {
  const hash = crypto.createHash('sha256');
  const hashTap = new Transform({
    transform(chunk, _enc, cb) {
      hash.update(chunk);
      cb(null, chunk);
    },
  });
  const walker = new TarWalker(archivePath, { onEntry });
  if (onWalker) onWalker(walker); // lets callers route write-stream errors into walker.destroy(err)
  try {
    await pipeline(fs.createReadStream(archivePath), hashTap, zlib.createGunzip(), walker);
  } catch (err) {
    if (typeof err?.code === 'string' && err.code.startsWith('restore')) throw err; // already keyed
    throw keyed('restoreArchiveTruncated', `restore: archive stream unreadable or truncated (${archivePath}): ${err?.message ?? err}`);
  }
  const sha256 = hash.digest('hex');
  if (onHash) onHash(sha256);
  return { entries: walker.entries, sha256 };
}

/* ---- 89-03 (BKRST-01, D-89-17/18): stream-verify an archive for preview.
   ONE pass through the 89-01 reader: entry bytes are counted past (never
   retained — P3) EXCEPT entry 0's manifest.json, whose body is the only
   retained payload and only long enough to parse (bounded by
   MANIFEST_MAX_BYTES — a corruption bound, not a feature). The
   whole-archive sha256 is recomputed on the SAME hash tap and compared
   against expectedSha256; a mismatch refuses keyed restoreShaMismatch —
   the archive is not restore-eligible (D-89-18). The manifest must parse
   AND match the frozen 86 entry-0 contract (formatVersion 1, tables with
   name/classification/rows, files, scope.kind, numeric createdAt —
   export/backup.js:697-704); anything else refuses keyed
   restoreManifestCorrupt (D-89-17). Every other reader refusal class
   (restoreArchiveHeaderInvalid/Checksum/Oversize/Truncated/Duplicate,
   restoreEntryRejected with .reason) propagates keyed for the route to
   map — never a bare 500 (D-89-33 families 2/3). Returns
   { manifest, sha256 }. ---- */
const MANIFEST_MAX_BYTES = 1024 * 1024; // writer manifests are ~KBs; 1 MiB is a generous corruption bound

export async function streamVerifyArchive(archivePath, expectedSha256) {
  let manifestBody = null;
  let overflow = false;
  const skippedEntries = [];
  const onEntry = entry => {
    /* The 89-01 entry gate runs HERE too (D-89-33), with extraction's own
       posture (extractArchive:515-526): the PATH-ESCAPE threats — absolute,
       traversal, backslash — refuse FATALLY during the walk, before any
       payload is built; shape-misses (unknownTable/badFileId/badLogoName/
       unexpectedEntry) skip-and-record exactly like extraction does, so an
       archive that previews is an archive that restores (instance archives
       legitimately carry DATA_DIR-relative entries — projects.db et al. —
       which extraction skips and records, never extracts). */
    try {
      gateEntryName(entry.name);
    } catch (err) {
      if (err.reason === 'absolute' || err.reason === 'traversal') throw err;
      skippedEntries.push({ name: entry.name, reason: err.reason ?? 'unexpectedEntry' });
      return null;
    }
    if (entry.name !== 'manifest.json') return null; // bodies counted past, never retained (P3)
    let chunks = [];
    let total = 0;
    const stream = new Writable({
      write(chunk, _enc, cb) {
        total += chunk.length;
        if (total > MANIFEST_MAX_BYTES) {
          overflow = true; // note and keep draining — throwing mid-sink would leave the walk half-torn
          cb();
          return;
        }
        chunks.push(chunk);
        cb();
      },
    });
    return {
      stream,
      hash: crypto.createHash('sha256'), // drained by finishSink; the whole-archive tap already covers these bytes
      expected: null, // the entry-level check belongs to extraction (plan 04) — preview trusts only the whole-archive digest
      name: entry.name,
      onDone: () => {
        manifestBody = Buffer.concat(chunks);
      },
    };
  };
  const { sha256 } = await readArchiveEntries(archivePath, { onEntry });
  if (overflow || !manifestBody) {
    throw keyed('restoreManifestCorrupt', `restore: manifest.json is ${overflow ? `over the ${MANIFEST_MAX_BYTES}-byte sanity bound` : 'missing (entry 0 is not a manifest)'} in ${archivePath}`);
  }
  let manifest;
  try {
    manifest = JSON.parse(manifestBody.toString('utf8'));
  } catch {
    throw keyed('restoreManifestCorrupt', `restore: manifest.json is not valid JSON in ${archivePath}`);
  }
  /* Structural validation — the frozen 86 entry-0 contract. */
  const bad = why => keyed('restoreManifestCorrupt', `restore: manifest.json ${why} in ${archivePath}`);
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw bad('is not an object');
  if (manifest.formatVersion !== 1) throw bad(`carries formatVersion ${JSON.stringify(manifest.formatVersion)} — only 1 is known`);
  if (
    !Array.isArray(manifest.tables)
    || manifest.tables.some(t => !t || typeof t !== 'object' || typeof t.name !== 'string' || typeof t.classification !== 'string' || !Number.isSafeInteger(t.rows))
  ) {
    throw bad('carries a malformed tables array (entries need name/classification/rows)');
  }
  if (!Array.isArray(manifest.files) || manifest.files.some(f => !f || typeof f !== 'object' || typeof f.name !== 'string')) {
    throw bad('carries a malformed files array');
  }
  if (!manifest.scope || typeof manifest.scope !== 'object' || typeof manifest.scope.kind !== 'string') throw bad('carries no scope.kind');
  if (!Number.isSafeInteger(manifest.createdAt)) throw bad('carries no numeric createdAt');
  /* D-89-18: the digest comparison is LAST — a structurally sound archive
     still refuses when the streamed bytes disagree with the run row. */
  if (sha256 !== expectedSha256) {
    throw keyed('restoreShaMismatch', `restore: whole-archive sha256 mismatch for ${archivePath} (expected ${expectedSha256}, streamed ${sha256})`);
  }
  return { manifest, sha256, skippedEntries };
}

/* ---- D-89-32: restore staging lives under BACKUPS_DIR (same fs as the
   archives) so plans 03/04 can move verified trees atomically. ---- */
export function restoreStagingDir() {
  return path.join(backupsRoot(), 'restore-staging');
}

/* Mirror of sweepStaleBackupStaging (export/backup.js:191-208): remove
   every entry under the staging home, return the count, tolerate an
   absent dir. Runs collect stale debris from crashed restores. */
export function sweepStaleRestoreStaging() {
  const dir = restoreStagingDir();
  let removed = 0;
  if (fs.existsSync(dir)) {
    for (const entry of fs.readdirSync(dir)) {
      fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
      removed += 1;
    }
  }
  return removed;
}

/* ---- Bounded staged extraction (Task 3) ----
   contained() realpath discipline mirrors export/backup.js:412-416;
   rmStaging mirrors backup.js:582-584 (D-15 best-effort). ---- */
function contained(realPath, rootReal) {
  return realPath === rootReal || realPath.startsWith(rootReal + path.sep);
}

function rmStaging(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* D-15 best-effort — the sweep collects leftovers on the next run */
  }
}

const FLAG_KEYS = Object.freeze(['missingBlob', 'pathEscaped', 'nameReserved', 'symlinkSkipped']);
const isFlaggedRow = row => FLAG_KEYS.some(k => row[k]);

/* ---- Import-as-new restore engine (Phase 89, plan 89-04, BKRST-02) ----
   The phase's second genuinely new machinery (Discovery 1: the doc IS the
   content — DATA_TABLES is 4 row-shaped tables; all workspace content
   lives in workspaces.doc). Two units, siblings of the 86 core:

   planRemap(manifest, archiveRows, liveContext) — PURE. Builds the
   archive-id → fresh uid() map over the workspace id and every doc-graph
   reference (projects[].id, tasks[].id/parentId/project, comments[]
   id/taskId, files[].id/project/task, teams[].id, projOrder[], logo) and
   validates totality BEFORE any insert: an unresolved reference fails
   keyed restoreRemapIncomplete pre-write (prohibition P5, D-89-10 — ids
   are never nulled, dropped, or skipped silently). user_id columns are
   NEVER remapped (prohibition P4 — live users are the identity universe,
   D-33-10): user-bearing rows are validated against liveContext.isLiveUser
   and skip-and-reported, never re-pointed onto other live users.
   Fresh ids are app-generated crypto.randomUUID() text; the map entry is
   written as rows insert — there is NO engine readback API to hunt
   (D-89-11, research Pattern 2 resolution).

   restoreImportAsNew(...) — the executor. Stage extraction via the 89-01
   extractArchive into restore-staging; blob copies to
   FILES_DIR/<freshId> / LOGOS_DIR/<freshId> FLAT pre-tx with a
   compensating unlink list (a failed unit removes the blobs it wrote —
   D-89-32; copyFileSync, never rename — staging and FILES_DIR may sit on
   different filesystems, research Pitfall 1 EXDEV); then ONE db.tx:
   insert the workspaces row with the doc spliced in post-normalizeDoc
   whitelisted shapes ONLY (no members/notifPrefs/views/sessions/tfa;
   archived member_id/assignee values not resolving to the restorer's
   roster are dropped, never ferried — Pitfall 4, prohibition P6), insert
   the operator-only memberships row (D-89-9, role owner), and
   syncTaskFts(scope, wsId, stored, next) with the TX SCOPE (module-level
   db calls inside a pg tx body land OUTSIDE the transaction — Pitfall 2).
   Every user_id-bearing archive row is validated against the live users
   table and skip-and-reported (Pitfall 3); operational-classified tables
   present in the archive are never inserted — counted into the skip
   report (D-89-7). The D-89-30 verification runs PRE-COMMIT inside the
   tx: remap totality re-check, per-table ndjson counts vs the manifest,
   staged blob presence for every planned blob, whole-archive sha256
   re-confirmed — any gap throws inside the tx (rollback) and the
   compensating unlink runs after. A project-scope archive splices its
   fragment into the live target workspace instead (doc-PUT discipline:
   revision bump + in-tx FTS diff sync), never touching the target roster.
   Stage events ride the setRestoreRunEmitter seam (server.js installs the
   writer that forwards to its 89-02 emitRestoreRunEvent — same
   setBackupRunWriter pattern as the 86/87 cores; emitter trouble never
   fails a restore). The 'start'/fetching event belongs to the caller
   (the Task-2 trigger route writes the start row before the pipeline
   runs); this unit emits validating → restoring → verifying → done|failed.
   ===================================================================== */
import { get as dbGet, all as dbAll, run as dbRun, tx as dbTx, syncTaskFts } from '../db-adapter.mjs';

const arr = v => (Array.isArray(v) ? v : []);
const memberBase = userId => `m_${String(userId).slice(0, 8)}`;
/* restore.js keeps zero logging deps — a one-line stderr warn for the two
   belt-and-braces paths (lock-release failure, emitter trouble). */
const logRestoreWarn = msg => console.warn(`[restore] ${msg}`);

/* Staged ndjson read-back (P3 posture parity): the writer paginates at
   PAGE_SIZE and the reader half of this module is memory-bounded — the
   restore read-back must not buffer whole tables either. Rows are
   RETAINED only for the tables the restore units actually consume;
   every other table (the unbounded-by-design operational append logs:
   audit_log, security_log, webhook_deliveries, email_outbox, …) is
   streamed line-by-line and COUNTED only — the import unit's per-table
   count-vs-manifest verification still sees the true read-back count,
   but those bytes never accumulate in RAM (an OOM crash here would land
   AFTER the pre-restore snapshot on the destructive paths). */
const RESTORE_CONSUMED_TABLES = new Set(['workspaces', 'memberships', 'team_members', 'invites', 'instance_roles']);
/* Streams staged ndjson line-by-line over an fs read stream (node:readline is
   NOT on the export builtin allow-list pinned by test/export-prohibition.test.mjs;
   fs is). Buffer-holds-one-line: memory stays O(longest row), never O(file). */
async function* ndjsonLines(filePath) {
  const input = fs.createReadStream(filePath, { encoding: 'utf8' });
  let buf = '';
  try {
    for await (const chunk of input) {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf('\n')) !== -1) {
        yield buf.slice(0, idx);
        buf = buf.slice(idx + 1);
      }
    }
    if (buf) yield buf; // final line without a trailing newline
  } finally {
    input.destroy(); // release the file handle
  }
}

async function readStagedTables(manifest, stagingDir) {
  const archiveRows = {};
  const archiveCounts = {};
  for (const t of arr(manifest.tables)) {
    const file = path.join(stagingDir, t.path ?? `${t.name}.ndjson`);
    const rows = RESTORE_CONSUMED_TABLES.has(t.name) ? [] : null;
    let count = 0;
    if (fs.existsSync(file)) {
      try {
        for await (const line of ndjsonLines(file)) {
          if (!line.trim()) continue;
          try {
            const row = JSON.parse(line);
            count += 1;
            if (rows) rows.push(row);
          } catch { /* sha-verified bytes always parse; skip defensively anyway */ }
        }
      } catch (err) {
        if (err?.code === 'ENOENT') { /* vanished between existsSync and open — treat as empty */ }
        else throw err;
      }
    }
    if (rows) archiveRows[t.name] = rows;
    archiveCounts[t.name] = count;
  }
  return { archiveRows, archiveCounts };
}

/* Writer seam — the restore.js twin of backup.js setBackupRunWriter.
   server.js installs ONE emitter at boot; every engine-level stage event
   lands in restore_runs through it. Best-effort: a broken emitter never
   fails a restore. */
let restoreRunEmitter = null;
export function setRestoreRunEmitter(fn) {
  restoreRunEmitter = typeof fn === 'function' ? fn : null;
}
async function emitRestoreEvent(event) {
  if (!restoreRunEmitter) return;
  try {
    await restoreRunEmitter(event);
  } catch {
    /* history-write trouble never fails a restore (best-effort discipline) */
  }
}

/* Blob destinations — same derivation as export/backup.js dataDirs()
   (module-private there; this twin keeps export/restore.js self-contained
   without touching the frozen writer). */
function blobsDirs() {
  const dataDir = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
  return { filesDir: path.join(dataDir, 'files'), logosDir: path.join(dataDir, 'logos') };
}

/* Streamed whole-file sha256 — no whole-file buffering (P3 posture). */
function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/* Doc-arrays of a stored doc, shape-tolerant (archive rows are attacker
   input — a non-object doc degrades to empty arrays, never a crash). */
function docData(wsRow) {
  try {
    return JSON.parse(wsRow?.doc)?.data ?? {};
  } catch {
    return {};
  }
}

/* Engine fallback for slug resolution (server.js passes its uniqueSlug
   funnel — research A5: slug handling is the funnel's concern; this
   mirror exists only so the engine unit works standalone). Mirrors the
   uniqueSlug loop shape: sanitized root + -2, -3… until free. */
async function engineUniqueSlug(base) {
  let root = String(base)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '');
  if (!root) root = 'workspace';
  let slug = root;
  let n = 2;
  while (await dbGet('select 1 from workspaces where slug = ? collate nocase', [slug])) slug = `${root}-${n++}`;
  return slug;
}

/* ---- planRemap (PURE): map + totality + user-row validation plans ----
   Throws keyed restoreRemapIncomplete on ANY unresolved doc-graph
   reference (pre-write refusal, prohibition P5). Never touches the db. */
export function planRemap(manifest, archiveRows, liveContext = {}) {
  const scope = manifest?.scope ?? {};
  const operatorId = typeof liveContext.operatorId === 'string' && liveContext.operatorId ? liveContext.operatorId : null;
  if (!operatorId) {
    throw keyed('restoreRemapIncomplete', 'restore: no restoring operator identity', { reason: 'noOperator' });
  }
  const operatorMemberId = typeof liveContext.operatorMemberId === 'string' && liveContext.operatorMemberId ? liveContext.operatorMemberId : memberBase(operatorId);
  const isLiveUser = typeof liveContext.isLiveUser === 'function' ? liveContext.isLiveUser : () => false;
  const fresh = () => crypto.randomUUID();
  const wsRows = arr(archiveRows?.workspaces);

  /* The pre-write totality walker: every doc-graph reference must resolve
     in the archive-id map — unresolved refs are collected and refused as
     ONE keyed class (ids are never nulled/dropped to let a restore
     proceed, D-89-10). */
  const collectUnresolved = (refs, map) => {
    const unresolved = [];
    const need = (ref, what) => {
      if (ref !== null && ref !== undefined && ref !== '' && !map.has(ref)) unresolved.push({ what, ref: String(ref) });
    };
    for (const ref of refs) need(ref.ref, ref.what);
    return unresolved;
  };

  if (scope.kind === 'workspace') {
    const srcRow = wsRows.find(r => r?.id === scope.id);
    if (!srcRow) {
      throw keyed('restoreRemapIncomplete', `restore: workspace ${scope.id} is missing from the archive tables`, { reason: 'workspaceMissing' });
    }
    const data = docData(srcRow);

    const projects = arr(data.projects).filter(p => p && typeof p.id === 'string' && p.id);
    const tasks = arr(data.tasks).filter(t => t && typeof t.id === 'string' && t.id);
    const comments = arr(data.comments).filter(c => c && typeof c.id === 'string' && c.id);
    const files = arr(data.files).filter(f => f && typeof f.id === 'string' && f.id);
    const teams = arr(data.teams).filter(t => t && typeof t.id === 'string' && t.id);

    const map = new Map();
    for (const p of projects) map.set(p.id, fresh());
    for (const t of tasks) map.set(t.id, fresh());
    for (const c of comments) map.set(c.id, fresh());
    for (const f of files) map.set(f.id, fresh());
    for (const t of teams) map.set(t.id, fresh());
    if (typeof data.logo === 'string' && data.logo && !map.has(data.logo)) map.set(data.logo, fresh());

    const refs = [];
    for (const t of tasks) {
      refs.push({ ref: t.parentId, what: 'task.parentId' });
      refs.push({ ref: t.project, what: 'task.project' });
    }
    for (const c of comments) refs.push({ ref: c.taskId, what: 'comment.taskId' });
    for (const f of files) {
      refs.push({ ref: f.project, what: 'file.project' });
      refs.push({ ref: f.task, what: 'file.task' });
    }
    for (const ref of arr(data.projOrder)) refs.push({ ref, what: 'projOrder[]' });
    for (const r of arr(archiveRows?.team_members).filter(r => r?.workspace_id === scope.id && isLiveUser(r.user_id))) {
      refs.push({ ref: r.team_id, what: 'team_members.team_id' });
    }
    const unresolved = collectUnresolved(refs, map);
    if (unresolved.length) {
      throw keyed(
        'restoreRemapIncomplete',
        `restore: ${unresolved.length} unresolved reference(s) — ids are never dropped silently (D-89-10): ${unresolved
          .slice(0, 3)
          .map(u => `${u.what}=${JSON.stringify(u.ref)}`)
          .join(', ')}`,
        { reason: 'unresolvedRefs', refs: unresolved.slice(0, 10) },
      );
    }

    /* Remapped doc — post-normalizeDoc whitelisted shapes ONLY. The
       roster/prefs/session families are dropped by CONSTRUCTION (the
       whitelist below is the whole document); archived member_id values
       survive only when they resolve to the restorer's own roster slot
       (Pitfall 4 / prohibition P6). */
    const remapped = {
      projects: projects.map(p => ({ ...p, id: map.get(p.id) })),
      tasks: tasks.map(t => {
        const n = {
          ...t,
          id: map.get(t.id),
          parentId: t.parentId ? map.get(t.parentId) : null,
          project: t.project ? map.get(t.project) : null,
        };
        n.assignees = (Array.isArray(t.assignees) ? t.assignees : []).filter(a => a === operatorMemberId);
        delete n.assignee;
        return n;
      }),
      comments: comments.map(c => {
        const n = { ...c, id: map.get(c.id), taskId: c.taskId ? map.get(c.taskId) : null };
        if ('memberId' in n) n.memberId = n.memberId === operatorMemberId ? n.memberId : null;
        return n;
      }),
      files: files.map(f => ({
        ...f,
        id: map.get(f.id),
        project: f.project ? map.get(f.project) : null,
        task: f.task ? map.get(f.task) : null,
      })),
      teams: teams.map(t => {
        const n = { ...t, id: map.get(t.id) };
        delete n.members; // stale team member arrays stripped on every read (normalizeDoc discipline)
        return n;
      }),
      projOrder: arr(data.projOrder).map(ref => map.get(ref)),
      logo: typeof data.logo === 'string' && data.logo ? map.get(data.logo) : null,
      activity: arr(data.activity).filter(a => a && typeof a === 'object'),
      events: arr(data.events).filter(e => e && typeof e === 'object'),
      notifs: arr(data.notifs).filter(n => n && typeof n.to === 'string' && n.to), // P4-a read-shape
      savedViews: arr(data.savedViews),
      recentSearches: arr(data.recentSearches),
    };

    /* User-bearing DATA rows: validate against live users, skip + report
       the rest (Pitfall 3). Archive memberships are NEVER authoritative
       (D-89-9) — every one of them skips; the operator-only row is built
       by the executor. Invites never restore (D-89-9) — counted only. */
    const teamMemberRows = [];
    let teamMembersSkipped = 0;
    for (const r of arr(archiveRows?.team_members)) {
      if (r?.workspace_id !== scope.id) continue;
      if (!r.user_id || !isLiveUser(r.user_id)) {
        teamMembersSkipped += 1;
        continue;
      }
      teamMemberRows.push({ teamId: map.get(r.team_id), memberId: r.member_id ?? null, userId: r.user_id });
    }
    const membershipsSkipped = arr(archiveRows?.memberships).filter(r => r?.workspace_id === scope.id).length;
    const invitesSkipped = arr(archiveRows?.invites).filter(r => r?.workspace_id === scope.id).length;

    return {
      kind: 'workspace',
      wsId: fresh(),
      map,
      sourceWs: { id: srcRow.id, name: srcRow.name ?? 'restored', color: srcRow.color ?? '#1D1C1A' },
      data: remapped,
      membershipRows: [{ userId: operatorId, role: 'owner' }],
      membershipsSkipped,
      teamMemberRows,
      teamMembersSkipped,
      invitesSkipped,
      skippedOperational: arr(manifest?.tables)
        .filter(t => t.classification === 'operational' && t.rows > 0)
        .map(t => ({ table: t.name, rows: t.rows })),
    };
  }

  if (scope.kind === 'project') {
    /* The archive table dumps are instance-wide (86 dumpTable) — find the
       workspace whose doc carries this project, then splice ONLY its
       fragment (project + its tasks + their comments + its files). */
    let srcRow = null;
    for (const r of wsRows) {
      if (arr(docData(r).projects).some(p => p?.id === scope.id)) {
        srcRow = r;
        break;
      }
    }
    if (!srcRow) {
      throw keyed('restoreRemapIncomplete', `restore: project ${scope.id} was not found in the archive`, { reason: 'projectMissing' });
    }
    const data = docData(srcRow);
    const project = arr(data.projects).find(p => p?.id === scope.id);
    const tasks = arr(data.tasks).filter(t => t && typeof t.id === 'string' && t.project === scope.id);
    const taskIds = new Set(tasks.map(t => t.id));
    const comments = arr(data.comments).filter(c => c && typeof c.id === 'string' && taskIds.has(c.taskId));
    const files = arr(data.files).filter(f => f && typeof f.id === 'string' && f.project === scope.id);
    const teams = arr(data.teams).filter(t => t && typeof t.id === 'string');

    const map = new Map();
    map.set(scope.id, fresh());
    for (const t of tasks) map.set(t.id, fresh());
    for (const c of comments) map.set(c.id, fresh());
    for (const f of files) map.set(f.id, fresh());
    for (const t of teams) if (!map.has(t.id)) map.set(t.id, fresh());

    const refs = [];
    for (const t of tasks) {
      refs.push({ ref: t.parentId, what: 'task.parentId' });
      refs.push({ ref: t.project, what: 'task.project' });
    }
    for (const c of comments) refs.push({ ref: c.taskId, what: 'comment.taskId' });
    for (const f of files) {
      refs.push({ ref: f.project, what: 'file.project' });
      refs.push({ ref: f.task, what: 'file.task' });
    }
    const unresolved = collectUnresolved(refs, map);
    if (unresolved.length) {
      throw keyed(
        'restoreRemapIncomplete',
        `restore: ${unresolved.length} unresolved reference(s) in the project fragment — ids are never dropped silently (D-89-10): ${unresolved
          .slice(0, 3)
          .map(u => `${u.what}=${JSON.stringify(u.ref)}`)
          .join(', ')}`,
        { reason: 'unresolvedRefs', refs: unresolved.slice(0, 10) },
      );
    }

    const remapped = {
      projects: [{ ...project, id: map.get(scope.id) }],
      tasks: tasks.map(t => {
        const n = { ...t, id: map.get(t.id), parentId: t.parentId && map.has(t.parentId) ? map.get(t.parentId) : t.parentId ?? null, project: map.get(t.project) };
        if (t.project && !map.has(t.project)) n.project = map.get(scope.id); // parentless ref safety — totality already refused unknown refs
        n.assignees = (Array.isArray(t.assignees) ? t.assignees : []).filter(a => a === operatorMemberId);
        delete n.assignee;
        return n;
      }),
      comments: comments.map(c => {
        const n = { ...c, id: map.get(c.id), taskId: map.get(c.taskId) };
        if ('memberId' in n) n.memberId = n.memberId === operatorMemberId ? n.memberId : null;
        return n;
      }),
      files: files.map(f => ({
        ...f,
        id: map.get(f.id),
        project: map.get(f.project),
        task: f.task && map.has(f.task) ? map.get(f.task) : null,
      })),
      teams: [],
      projOrder: [map.get(scope.id)],
      logo: null,
    };

    return {
      kind: 'project',
      wsId: null, // resolved by the executor (the live target)
      map,
      sourceWs: { id: srcRow.id, name: srcRow.name ?? 'restored', color: srcRow.color ?? '#1D1C1A' },
      data: remapped,
      membershipRows: [],
      membershipsSkipped: arr(archiveRows?.memberships).filter(r => r?.workspace_id === srcRow.id).length,
      teamMemberRows: [],
      teamMembersSkipped: 0,
      invitesSkipped: arr(archiveRows?.invites).filter(r => r?.workspace_id === srcRow.id).length,
      /* Same D-89-7 enumeration as workspace scope: operational-classified
         manifest tables are never inserted for ANY scope — the fragment
         splice touches only the doc collections. Report-only. */
      skippedOperational: arr(manifest?.tables)
        .filter(t => t.classification === 'operational' && t.rows > 0)
        .map(t => ({ table: t.name, rows: t.rows })),
    };
  }

  throw keyed('restoreRemapIncomplete', `restore: unsupported restore scope kind "${scope.kind}"`, { reason: 'scopeKind' });
}

/* Post-remap totality re-check (D-89-30, runs pre-commit INSIDE the tx):
   every reference in the remapped fragment must resolve to a FRESH id the
   map produced — the mirror of the pre-write walk over the archive ids. */
function assertFragmentTotality(data, map) {
  const freshIds = new Set(map.values());
  const unresolved = [];
  const need = (ref, what) => {
    if (ref !== null && ref !== undefined && ref !== '' && !freshIds.has(ref)) unresolved.push({ what, ref: String(ref) });
  };
  for (const t of arr(data.tasks)) {
    need(t.parentId, 'task.parentId');
    need(t.project, 'task.project');
  }
  for (const c of arr(data.comments)) need(c.taskId, 'comment.taskId');
  for (const f of arr(data.files)) {
    need(f.project, 'file.project');
    need(f.task, 'file.task');
  }
  for (const ref of arr(data.projOrder)) need(ref, 'projOrder[]');
  if (unresolved.length) {
    throw keyed(
      'restoreVerificationFailed',
      `restore: post-remap totality check failed on ${unresolved.length} reference(s): ${unresolved
        .slice(0, 3)
        .map(u => `${u.what}=${JSON.stringify(u.ref)}`)
        .join(', ')}`,
    );
  }
}

/* ---- The import-as-new executor. Resolves by design (the runExport
   posture): { ok: true, workspaceId, finalName, slug, summary } or
   { ok: false, code, error } — keyed reader/refusal classes pass through
   verbatim so runRestore (Task 2) persists them into restore_runs.error. ---- */
export async function restoreImportAsNew(opts = {}) {
  const runId = (typeof opts.runId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(opts.runId) ? opts.runId : crypto.randomUUID()).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
  const startedAt = Number.isFinite(opts.startedAt) ? opts.startedAt : Date.now();
  const scope = opts.scope ?? null;
  const operatorId = typeof opts.operatorId === 'string' && opts.operatorId ? opts.operatorId : null;

  const failWith = async err => {
    /* keyed classes persist VERBATIM into restore_runs.error (D-89-33
       consumer contract) — the run row carries "<code>: <message>". */
    const code = typeof err?.code === 'string' ? err.code : null;
    const persisted = code ? `${code}: ${err.message}` : err.message;
    await emitRestoreEvent({ kind: 'fail', runId, error: persisted, finishedAt: Date.now() });
    return { ok: false, runId, code: code ?? 'restoreFailed', error: err.message };
  };

  if (!scope || (scope.kind !== 'workspace' && scope.kind !== 'project')) {
    return failWith(keyed('restoreScopeUnsupported', 'restore: scope must be a workspace or project archive'));
  }
  if (!operatorId) {
    return failWith(keyed('restoreRemapIncomplete', 'restore: no restoring operator identity', { reason: 'noOperator' }));
  }
  const archivePath = opts.archivePath;
  if (!archivePath || !fs.existsSync(archivePath)) {
    return failWith(keyed('restoreArchiveMissing', 'restore: archive not found at the resolved path'));
  }

  /* Stage validating: the 89-01 reader — every keyed refusal class it
     throws (restoreEntryRejected / structural corruption /
     restoreShaMismatch) passes through VERBATIM (D-89-33 producer/
     consumer contract). */
  await emitRestoreEvent({ kind: 'update', runId, stage: 'validating' });
  let manifest;
  try {
    const verified = await streamVerifyArchive(archivePath, opts.expectedSha256);
    manifest = verified.manifest;
  } catch (err) {
    return failWith(err);
  }

  const stagingDir = path.join(restoreStagingDir(), `restore-${runId}`);
  try {
    await extractArchive(archivePath, stagingDir, manifest);
  } catch (err) {
    // extractArchive already rmStaging()s its own tree on error (D-89-32)
    return failWith(err);
  }

  /* Read the staged table ndjson back (streaming — WR fix: rows retained
     only for consumed tables; the rest is counted, never buffered). */
  const { archiveRows, archiveCounts } = await readStagedTables(manifest, stagingDir);

  /* Live users are the identity universe (D-33-10): one read, then pure
     validation inside planRemap. */
  let liveUserIds;
  try {
    liveUserIds = new Set((await dbAll('select id from users', [])).map(r => r.id));
  } catch (err) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    return failWith(keyed('restoreFailed', `restore: live-user lookup failed: ${err.message}`));
  }

  const operatorMemberId = memberBase(operatorId);
  let plan;
  try {
    plan = planRemap(manifest, archiveRows, { operatorId, operatorMemberId, isLiveUser: id => liveUserIds.has(id) });
  } catch (err) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    return failWith(err);
  }

  /* Stage restoring: blob copies PRE-TX with a compensating unlink list
     (D-89-32). copyFileSync — never rename (research Pitfall 1: staging
     and FILES_DIR may live on different filesystems). */
  await emitRestoreEvent({ kind: 'update', runId, stage: 'restoring' });
  const dirs = blobsDirs();
  const writtenBlobs = [];
  const blobPlan = [];
  let missingBlobRestored = 0;
  for (const row of arr(manifest.files)) {
    if (isFlaggedRow(row)) {
      if (plan.map.has(row.id)) missingBlobRestored += 1; // restored flagged, no blob (86-D-4)
      continue;
    }
    const freshId = plan.map.get(row.id);
    if (!freshId) continue; // blob not referenced by the restored fragment
    blobPlan.push({ src: path.join(stagingDir, row.path), dest: path.join(row.logo ? dirs.logosDir : dirs.filesDir, freshId) });
  }
  fs.mkdirSync(dirs.filesDir, { recursive: true });
  fs.mkdirSync(dirs.logosDir, { recursive: true });
  try {
    for (const b of blobPlan) {
      fs.copyFileSync(b.src, b.dest);
      writtenBlobs.push(b.dest);
    }
  } catch (err) {
    for (const dest of writtenBlobs) {
      try {
        fs.unlinkSync(dest);
      } catch {
        /* compensating unlink is best-effort (ENOENT-tolerant) */
      }
    }
    fs.rmSync(stagingDir, { recursive: true, force: true });
    return failWith(keyed('restoreBlobFailed', `restore: blob copy failed: ${err.message}`));
  }

  /* Identity resolution — the D-89-13 name auto-counter mirrors the
     uniqueSlug loop shape; the slug runs the caller's uniqueSlug funnel
     when provided (research A5), falling back to the engine mirror. */
  const finalNameBase = plan.kind === 'workspace' ? String(plan.sourceWs.name ?? 'restored') : null;
  let target = null;
  let storedDoc = null;
  let finalName;
  try {
    if (plan.kind === 'workspace') {
      finalName = `${finalNameBase}-restored`;
      let n = 2;
      while (await dbGet('select 1 from workspaces where name = ? collate nocase', [finalName])) finalName = `${finalNameBase}-restored-${n++}`;
    } else {
      target = await dbGet('select id, slug, name, doc from workspaces where id = ?', [opts.targetWorkspaceId]);
      if (!target) throw keyed('restoreTargetMissing', 'restore: target workspace no longer exists');
      storedDoc = JSON.parse(target.doc);
      finalName = target.name;
    }
  } catch (err) {
    for (const dest of writtenBlobs) {
      try {
        fs.unlinkSync(dest);
      } catch {
        /* best-effort */
      }
    }
    fs.rmSync(stagingDir, { recursive: true, force: true });
    return failWith(err);
  }
  let slug;
  try {
    if (plan.kind === 'workspace') {
      slug = typeof opts.uniqueSlug === 'function' ? await opts.uniqueSlug(finalName) : await engineUniqueSlug(finalName);
    } else {
      slug = target.slug;
    }
  } catch (err) {
    for (const dest of writtenBlobs) {
      try {
        fs.unlinkSync(dest);
      } catch {
        /* best-effort */
      }
    }
    fs.rmSync(stagingDir, { recursive: true, force: true });
    return failWith(keyed('restoreFailed', `restore: slug resolution failed: ${err.message}`));
  }

  /* The next document — workspace scope builds the whole doc (whitelisted
     shapes only); project scope SPLICES the fragment into the stored doc
     (Pattern 4) leaving every other collection untouched. */
  let nextDoc;
  if (plan.kind === 'workspace') {
    nextDoc = {
      data: {
        ...plan.data,
        ws: { name: finalName, url: slug, c: plan.sourceWs.color ?? '#1D1C1A', brand: true },
        me: null,
      },
    };
  } else {
    const stored = storedDoc?.data ?? {};
    nextDoc = {
      data: {
        ...stored,
        projects: [...arr(stored.projects), ...plan.data.projects],
        tasks: [...arr(stored.tasks), ...plan.data.tasks],
        comments: [...arr(stored.comments), ...plan.data.comments],
        files: [...arr(stored.files), ...plan.data.files],
        teams: [...arr(stored.teams), ...plan.data.teams],
        projOrder: [...arr(stored.projOrder), ...plan.data.projOrder],
      },
    };
  }

  /* ONE transaction per restore unit (Pattern 2): every write through the
     tx scope — module-level db calls inside a pg tx body land OUTSIDE the
     transaction (Pitfall 2). The D-89-30 verification runs PRE-COMMIT
     inside this tx; any gap throws → full rollback → compensating unlink. */
  const wsId = plan.kind === 'workspace' ? plan.wsId : target.id;
  try {
    await dbTx(async txScope => {
      const t = Date.now();
      if (plan.kind === 'workspace') {
        /* member_id mirrors memberIdFor: base m_<8slice>, taken → m_<full> */
        let memberId = operatorMemberId;
        if (await txScope.get('select 1 from memberships where workspace_id = ? and member_id = ?', [wsId, memberId])) memberId = `m_${operatorId}`;
        await txScope.run(
          'insert into workspaces (id, slug, name, color, doc, revision, created_at, updated_at, archived) values (?,?,?,?,?,?,?,?,?)',
          [wsId, slug, finalName, plan.sourceWs.color ?? '#1D1C1A', JSON.stringify(nextDoc), 1, t, t, 0],
        );
        await txScope.run(
          'insert into memberships (workspace_id, user_id, role, member_id, provenance) values (?,?,?,?,?)',
          [wsId, operatorId, 'owner', memberId, 'restore'],
        );
        for (const r of plan.teamMemberRows) {
          await txScope.run('insert into team_members (workspace_id, team_id, member_id, user_id) values (?,?,?,?)', [wsId, r.teamId, r.memberId, r.userId]);
        }
        /* FTS diff sync INSIDE the tx with the TX SCOPE (Pattern 4):
           stored = null → every restored task indexes at commit time. */
        await syncTaskFts(txScope, wsId, null, nextDoc);
      } else {
        await txScope.run('update workspaces set doc = ?, revision = revision + 1, updated_at = ? where id = ?', [JSON.stringify(nextDoc), t, wsId]);
        await syncTaskFts(txScope, wsId, storedDoc, nextDoc);
      }

      await emitRestoreEvent({ kind: 'update', runId, stage: 'verifying' });

      /* ---- D-89-30 verification, pre-commit ----
         1. remap totality re-check over the final fragment;
         2. per-table ndjson counts vs the manifest (extraction
            completeness — every declared row was read back);
         3. DB state matches the plan exactly;
         4. blob presence for every planned blob;
         5. whole-archive sha256 re-confirmed. */
      assertFragmentTotality(plan.data, plan.map);
      for (const t of arr(manifest.tables)) {
        const read = archiveCounts[t.name] ?? 0;
        if (read !== t.rows) {
          throw keyed('restoreVerificationFailed', `restore: table ${t.name} staged rows (${read}) disagree with the manifest (${t.rows})`);
        }
      }
      const counts = {
        workspaces: await txScope.get('select count(*) as n from workspaces where id = ?', [wsId]),
        memberships: await txScope.get('select count(*) as n from memberships where workspace_id = ?', [wsId]),
        team_members: await txScope.get('select count(*) as n from team_members where workspace_id = ?', [wsId]),
      };
      if (plan.kind === 'workspace' && counts.workspaces.n !== 1) {
        throw keyed('restoreVerificationFailed', 'restore: workspace insert count mismatch');
      }
      /* Roster counts are workspace-scope only — a project splice NEVER
         touches the target roster, so its pre-existing rows are expected. */
      if (plan.kind === 'workspace') {
        if (counts.memberships.n !== plan.membershipRows.length) {
          throw keyed('restoreVerificationFailed', 'restore: membership insert count mismatch');
        }
        if (counts.team_members.n !== plan.teamMemberRows.length) {
          throw keyed('restoreVerificationFailed', 'restore: team_members insert count mismatch');
        }
      }
      for (const b of blobPlan) {
        if (!fs.existsSync(b.dest)) {
          throw keyed('restoreVerificationFailed', `restore: staged blob missing at ${path.basename(b.dest)}`);
        }
      }
      if ((await sha256File(archivePath)) !== opts.expectedSha256) {
        throw keyed('restoreVerificationFailed', 'restore: whole-archive digest changed under the run');
      }
    });
  } catch (err) {
    /* rollback happened inside dbTx — remove every blob this unit wrote
       (compensating unlink, D-89-32) and sweep the staging tree */
    for (const dest of writtenBlobs) {
      try {
        fs.unlinkSync(dest);
      } catch {
        /* best-effort */
      }
    }
    fs.rmSync(stagingDir, { recursive: true, force: true });
    return failWith(err);
  }

  /* Skip report (D-89-7): operational-classified tables + invites are
     NEVER inserted — counted honestly; the user_id validation skips fold
     into the same shape. */
  const summary = {
    skipped: [
      ...plan.skippedOperational,
      ...(plan.invitesSkipped > 0 ? [{ table: 'invites', rows: plan.invitesSkipped }] : []),
    ],
    memberships: { skipped: plan.membershipsSkipped, inserted: plan.membershipRows.length },
    teamMembers: { skipped: plan.teamMembersSkipped, inserted: plan.teamMemberRows.length },
    files: { restored: blobPlan.length, missingBlob: missingBlobRestored },
  };
  await emitRestoreEvent({ kind: 'finish', runId, summary: JSON.stringify(summary), finalName, finishedAt: Date.now() });
  fs.rmSync(stagingDir, { recursive: true, force: true }); // success sweep — staging is spent
  return { ok: true, runId, workspaceId: wsId, finalName, slug, summary };
}

/* ---- Guarded overwrite restore unit (Phase 89, plan 89-05, BKRST-03) ----
   The destructive sibling of restoreImportAsNew: instead of creating a new
   workspace, it replaces a LIVE target's data exactly with the archive's
   (86-D-01 containment — a replacement, never a merge) while the workspaces
   ROW keeps its identity (id/slug/created_at untouched — D-89-6).

   Ordering discipline (prohibition P7 / D-89-5): the automatic pre_restore
   snapshot via the 86 runExport core — self-verified, atomically published,
   trigger 'manual' (D-87-11: outside every task's rotation, never auto-
   deleted; planner flag 1: backup_runs.trigger is NOT widened) — runs FIRST,
   BEFORE any mutation. The restore_runs row carries snapshot_run_id +
   snapshot_tag='pre_restore' (the writer coalesces it in) and the audit
   trail records restore_snapshot_started:pre_restore (best-effort write —
   an audit hiccup never fails the safety net). Every keyed refusal after
   the snapshot still leaves the net in place: the snapshot is unconditional.

   Blob layer (D-89-4 / Pitfall 1): staged extraction via the 89-01
   extractArchive into restore-staging, then replacement blobs copy under a
   DATA_DIR-level temp dir (BACKUPS_DIR may be a separate mount from
   FILES_DIR — copyFileSync, never rename across the boundary), and the
   swap into FILES_DIR/LOGOS_DIR happens only after staging completes. An
   extractArchive `skipped` row (reader-gate refusal or unmanifested entry)
   fails the unit keyed restoreEntryRejected BEFORE any DB write or blob
   mutation — the destructive path tolerates NO entry the manifest does not
   declare (D-89-33 families 2+3).

   Data layer: ONE db.tx (staging/IO complete BEFORE the tx opens — the
   anti-pattern discipline): the workspaces row takes the archive's
   name/color/doc with revision+1 (id/slug/created_at preserved), data-table
   rows within the workspace are deleted and replaced with validated archive
   rows (memberships/team_members/invites — live-user validation skip+report,
   Pitfall 3; flag 3 planner call: the triggering operator ALWAYS retains a
   membership post-overwrite, re-granted provenance 'restore' when the
   validated replacement left them out); syncTaskFts with the TX SCOPE
   (Pitfall 2); D-89-30 verification pre-commit (totality, counts, blob
   presence, whole-archive sha256) — any gap throws → rollback.

   Repair net (D-89-3): a failure AFTER any file mutation repairs the file
   layer FROM THE SNAPSHOT ARCHIVE — snapshot blobs are copied back over
   their dests, swapped-in blobs the snapshot never carried are unlinked;
   the DB needs no repair (the tx already rolled back). The snapshot is the
   file-layer net ONLY, never a DB rollback mechanism.

   _hooks (test-only): afterSnapshot/midTx injection points — the only
   mutation-order control surface the failure tests drive; production code
   never passes them.

   Stage vocabulary (D-89-29): snapshot (pre_restore event) → validating →
   restoring → verifying → done|failed, through the writer seam. */
/* Best-effort engine-side audit write: the same audit_log shape server.js's
   auditBackupTask writes, mirrored here so the pre_restore snapshot trail
   (planner flag 1) exists even when the unit runs engine-only. Call sites
   wrap it — an audit hiccup never fails the safety net. */
async function dbRunAudit(action, operator, runId, targetName, workspaceId) {
  await dbRun(
    'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
    [
      crypto.randomUUID(),
      operator?.id ?? null,
      runId,
      action,
      0,
      null,
      workspaceId ?? null,
      operator?.name ?? 'unknown',
      operator?.email ?? '',
      targetName ?? '',
      '',
      Date.now(),
    ],
  );
}

async function repairFromSnapshot(snapshotPath, snapshotSha256, swappedDests, dirs) {
  /* The snapshot is OUR OWN verified archive (runExport self-verifies
     before publish), but posture stays fail-closed: a snapshot that cannot
     be verified or extracted throws — the caller surfaces the repair
     failure honestly rather than pretending the net held. */
  const verified = await streamVerifyArchive(snapshotPath, snapshotSha256);
  const repairDir = path.join(restoreStagingDir(), `repair-${crypto.randomUUID()}`);
  try {
    await extractArchive(snapshotPath, repairDir, verified.manifest);
    const snapIds = new Set(
      (verified.manifest.files ?? []).filter(f => !isFlaggedRow(f)).map(f => String(f.id)),
    );
    for (const dest of swappedDests) {
      const id = path.basename(dest);
      const snapEntry = (verified.manifest.files ?? []).find(f => String(f.id) === id && !isFlaggedRow(f));
      if (snapEntry) {
        fs.copyFileSync(path.join(repairDir, snapEntry.path), dest); // restore pre-restore content
      } else if (!snapIds.has(id)) {
        try { fs.unlinkSync(dest); } catch { /* ENOENT-tolerant (doc-PUT idiom) */ }
      }
    }
  } finally {
    rmStaging(repairDir);
  }
}

export async function restoreOverwriteUnit(opts = {}) {
  const runId = (typeof opts.runId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(opts.runId) ? opts.runId : crypto.randomUUID()).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
  const backupRun = opts.backupRun && typeof opts.backupRun === 'object' ? opts.backupRun : {};
  const scope = opts.scope ?? null;
  const operator = opts.operator && typeof opts.operator === 'object' ? opts.operator : null;
  const operatorId = operator?.id ?? (typeof opts.operatorId === 'string' ? opts.operatorId : null);
  const targetWorkspaceId = typeof opts.targetWorkspaceId === 'string' ? opts.targetWorkspaceId : null;
  const hooks = opts._hooks && typeof opts._hooks === 'object' ? opts._hooks : {};
  /* D-89-32: the route ALWAYS claims the restore_lock before firing this
     unit — the unit owns releasing it on EVERY exit (the finally
     discipline via the failWith funnel + the success path). */
  const releaseLock = typeof opts.releaseLock === 'function' ? opts.releaseLock : null;
  const release = async () => { if (releaseLock) { try { await releaseLock(); } catch { /* best-effort */ } } };

  const failWith = async err => {
    const code = typeof err?.code === 'string' ? err.code : null;
    const persisted = code ? `${code}: ${err.message}` : err.message;
    await emitRestoreEvent({ kind: 'fail', runId, error: persisted, finishedAt: Date.now() });
    await release();
    return { ok: false, runId, code: code ?? 'restoreFailed', error: persisted };
  };

  if (!operatorId || !targetWorkspaceId) {
    return failWith(keyed('restoreTargetMissing', 'restore: overwrite requires a target workspace and an operator identity'));
  }

  /* fetching: local archive resolution (the route's start row already sits
     at stage 'fetching'; the unit refuses keyed when the archive is gone). */
  const archivePath = opts.archivePath ?? (backupRun.filename ? path.join(backupsRoot(), backupRun.filename) : null);
  if (!archivePath || !fs.existsSync(archivePath)) {
    return failWith(keyed('restoreArchiveMissing', 'restore: archive not found at the resolved path'));
  }

  /* ---- SNAPSHOT FIRST (P7/D-89-5) — before ANY mutation ---- */
  let snapshot = null;
  let stagingDir = null;
  let swapDir = null;
  let swappedDests = []; // outer scope: the unexpected-throw catch repairs from it
  try {
    snapshot = await runExport({ kind: 'workspace', id: targetWorkspaceId }, { trigger: 'manual' });
    if (!snapshot?.ok) {
      return failWith(keyed('restoreSnapshotFailed', `restore: pre_restore snapshot failed: ${snapshot?.error ?? 'unknown export failure'}`));
    }
    /* Flag 1 resolution: the tag lives on the restore_runs row + audit —
       the snapshot's own backup_runs row stays trigger='manual'. */
    await emitRestoreEvent({ kind: 'update', runId, snapshotRunId: snapshot.runId, snapshotTag: 'pre_restore' });
    try {
      await dbRunAudit('restore_snapshot_started:pre_restore', operator, runId, snapshot.filename, targetWorkspaceId);
    } catch (err) {
      logRestoreWarn(`overwrite ${runId}: snapshot audit write failed (best-effort): ${err?.message ?? err}`);
    }
    if (typeof hooks.afterSnapshot === 'function') await hooks.afterSnapshot();
  } catch (err) {
    /* afterSnapshot injections land here with the snapshot ALREADY published
       — the safety net is unconditional and stays (zero mutations happened). */
    if (stagingDir) rmStaging(stagingDir);
    if (swapDir) rmStaging(swapDir);
    return failWith(err);
  }

  const dirs = blobsDirs();
  const cleanup = () => {
    if (stagingDir) rmStaging(stagingDir);
    if (swapDir) rmStaging(swapDir);
  };

  /* Engine-side scope-kind re-check — AFTER the snapshot (the net is
     unconditional; the route re-checks too, the engine never trusts its
     caller). */
  if (!scope || scope.kind !== 'workspace') {
    return failWith(keyed('restoreTargetMismatch', 'restore: overwrite requires a workspace scope archive'));
  }

  try {
    /* ---- validating: sha verify → extraction → reader-gate totality ---- */
    await emitRestoreEvent({ kind: 'update', runId, stage: 'validating' });
    let manifest;
    try {
      const verified = await streamVerifyArchive(archivePath, backupRun.sha256);
      manifest = verified.manifest;
    } catch (err) {
      return failWith(err);
    }

    /* Engine-side scope-kind re-check (the route re-checks too — the
       engine never trusts its caller; runs after the snapshot: the net is
       unconditional). */
    if (manifest?.scope?.kind !== 'workspace' || manifest?.scope?.id !== scope.id) {
      return failWith(keyed('restoreTargetMismatch', `restore: archive scope (${manifest?.scope?.kind ?? 'unknown'}) does not match the overwrite scope (${scope.kind})`));
    }

    stagingDir = path.join(restoreStagingDir(), `restore-${runId}`);
    let extracted;
    try {
      extracted = await extractArchive(archivePath, stagingDir, manifest);
    } catch (err) {
      stagingDir = null; // extractArchive already rmStaging()ed its own tree (D-89-32)
      return failWith(err);
    }
    /* Destructive-path entry totality: a skipped row (reader-gate refusal
       or unmanifested entry) refuses the unit keyed BEFORE any DB write or
       blob mutation (D-89-33 families 2+3). Import-as-new tolerates
       skips; an overwrite of live data never does. */
    if (extracted.skipped.length > 0) {
      const first = extracted.skipped[0];
      return failWith(keyed('restoreEntryRejected', `restore: overwrite refused — the archive carried ${extracted.skipped.length} entry/entries outside its manifest contract (first: "${first.name}", ${first.code})`, { name: first.name }));
    }

    /* Streaming read-back (WR fix) — rows retained only for consumed
       tables; the rest is counted, never buffered. */
    const { archiveRows, archiveCounts } = await readStagedTables(manifest, stagingDir);

    const srcRow = (archiveRows.workspaces ?? []).find(r => r?.id === scope.id);
    if (!srcRow) {
      return failWith(keyed('restoreRemapIncomplete', `restore: workspace ${scope.id} is missing from the archive tables`, { reason: 'workspaceMissing' }));
    }
    const data = docData(srcRow);

    const projects = arr(data.projects).filter(p => p && typeof p.id === 'string' && p.id);
    const tasks = arr(data.tasks).filter(t => t && typeof t.id === 'string' && t.id);
    const comments = arr(data.comments).filter(c => c && typeof c.id === 'string' && c.id);
    const files = arr(data.files).filter(f => f && typeof f.id === 'string' && f.id);
    const teams = arr(data.teams).filter(t => t && typeof t.id === 'string' && t.id);
    const projIds = new Set(projects.map(p => p.id));
    const taskIds = new Set(tasks.map(t => t.id));
    const teamIds = new Set(teams.map(t => t.id));
    if (typeof data.logo === 'string' && data.logo) projIds.add(data.logo); // logo shares the map identity space

    /* Live users are the identity universe (D-33-10) — one read. */
    const liveUserIds = new Set((await dbAll('select id from users', [])).map(r => r.id));

    /* Totality pre-check (P5/D-89-10): every doc-graph reference must
       resolve within the archive doc — overwrite ids are verbatim, so the
       map IS the doc's own id set. */
    const unresolved = [];
    for (const t of tasks) {
      if (t.parentId && !taskIds.has(t.parentId)) unresolved.push({ what: 'task.parentId', ref: String(t.parentId) });
      if (t.project && !projIds.has(t.project)) unresolved.push({ what: 'task.project', ref: String(t.project) });
    }
    for (const c of comments) if (c.taskId && !taskIds.has(c.taskId)) unresolved.push({ what: 'comment.taskId', ref: String(c.taskId) });
    for (const f of files) {
      if (f.project && !projIds.has(f.project)) unresolved.push({ what: 'file.project', ref: String(f.project) });
      if (f.task && !taskIds.has(f.task)) unresolved.push({ what: 'file.task', ref: String(f.task) });
    }
    for (const ref of arr(data.projOrder)) if (!projIds.has(ref)) unresolved.push({ what: 'projOrder[]', ref: String(ref) });
    if (unresolved.length) {
      return failWith(keyed('restoreRemapIncomplete', `restore: ${unresolved.length} unresolved reference(s) — ids are never dropped silently (D-89-10): ${unresolved.slice(0, 3).map(u => `${u.what}=${JSON.stringify(u.ref)}`).join(', ')}`, { reason: 'unresolvedRefs', refs: unresolved.slice(0, 10) }));
    }

    /* Roster replace-with-validation (Pitfall 3 + flag 3): archive rows
       with live users (and CHECK-valid roles) replace the target roster;
       everything else skips + reports. member_id dedupe mirrors the
       import-as-new base-then-full fallback (doc-profile continuity). */
    const ROLE_OK = new Set(['owner', 'admin', 'member', 'viewer']);
    const keptMemberships = [];
    let membershipsSkipped = 0;
    const usedMemberIds = new Set();
    for (const r of arr(archiveRows.memberships)) {
      if (r?.workspace_id !== scope.id) continue;
      if (!r.user_id || !liveUserIds.has(r.user_id) || !ROLE_OK.has(r.role)) {
        membershipsSkipped += 1;
        continue;
      }
      let memberId = typeof r.member_id === 'string' && r.member_id ? r.member_id : memberBase(r.user_id);
      if (usedMemberIds.has(memberId)) memberId = `m_${r.user_id}`;
      if (usedMemberIds.has(memberId)) {
        membershipsSkipped += 1;
        continue;
      }
      usedMemberIds.add(memberId);
      keptMemberships.push({ userId: r.user_id, role: r.role, memberId, provenance: r.provenance ?? 'manual' });
    }
    /* Flag 3 (planner call): the triggering operator ALWAYS retains a
       membership post-overwrite — re-granted when the validated
       replacement left them out. */
    let operatorRetained = keptMemberships.some(m => m.userId === operatorId);
    if (!operatorRetained) {
      let memberId = memberBase(operatorId);
      if (usedMemberIds.has(memberId)) memberId = `m_${operatorId}`;
      keptMemberships.push({ userId: operatorId, role: 'member', memberId, provenance: 'restore' });
      usedMemberIds.add(memberId);
      operatorRetained = true;
    }
    /* The valid member_id universe for doc assignee/comment filtering
       (Pitfall 4): the restored roster's member_id values + the operator's. */
    const validMemberIds = new Set(keptMemberships.map(m => m.memberId));
    validMemberIds.add(memberBase(operatorId));
    validMemberIds.add(`m_${operatorId}`);

    const keptTeamMembers = [];
    let teamMembersSkipped = 0;
    for (const r of arr(archiveRows.team_members)) {
      if (r?.workspace_id !== scope.id) continue;
      if (!r.user_id || !liveUserIds.has(r.user_id) || !r.team_id || !teamIds.has(r.team_id)) {
        teamMembersSkipped += 1;
        continue;
      }
      keptTeamMembers.push({ teamId: r.team_id, memberId: r.member_id ?? null, userId: r.user_id });
    }

    const keptInvites = [];
    let invitesSkipped = 0;
    for (const r of arr(archiveRows.invites)) {
      if (r?.workspace_id !== scope.id) continue;
      if (!r.created_by || !liveUserIds.has(r.created_by) || !r.token_hash || !ROLE_OK.has(r.role)) {
        invitesSkipped += 1;
        continue;
      }
      keptInvites.push({ tokenHash: r.token_hash, email: r.email ?? null, role: r.role, teams: r.teams ?? null, createdBy: r.created_by, createdAt: r.created_at ?? Date.now(), expiresAt: r.expires_at ?? Date.now() + 7 * 86400000 });
    }

    /* The next document — verbatim ids, whitelisted shapes ONLY
       (roster/prefs/session families dropped by construction; stale
       member_id/assignee values not resolving to the restored roster are
       dropped, never ferried — Pitfall 4). */
    const nextData = {
      projects: projects.map(p => ({ ...p })),
      tasks: tasks.map(t => {
        const n = { ...t };
        n.assignees = (Array.isArray(t.assignees) ? t.assignees : []).filter(a => a === null || validMemberIds.has(a));
        delete n.assignee;
        return n;
      }),
      comments: comments.map(c => {
        const n = { ...c };
        if ('memberId' in n) n.memberId = validMemberIds.has(n.memberId) ? n.memberId : null;
        return n;
      }),
      files: files.map(f => ({ ...f })),
      teams: teams.map(t => {
        const n = { ...t };
        delete n.members; // stale team member arrays stripped on every read (normalizeDoc discipline)
        return n;
      }),
      projOrder: arr(data.projOrder).filter(ref => projIds.has(ref)),
      logo: typeof data.logo === 'string' && data.logo ? data.logo : null,
      activity: arr(data.activity).filter(a => a && typeof a === 'object'),
      events: arr(data.events).filter(e => e && typeof e === 'object'),
      notifs: arr(data.notifs).filter(n => n && typeof n.to === 'string' && n.to),
      savedViews: arr(data.savedViews),
      recentSearches: arr(data.recentSearches),
    };

    /* ---- restoring: staged blob swap (D-89-4, EXDEV-safe) ---- */
    await emitRestoreEvent({ kind: 'update', runId, stage: 'restoring' });
    const dataDir = path.dirname(dirs.filesDir);
    swapDir = path.join(dataDir, `restore-swap-${runId}`);
    fs.mkdirSync(path.join(swapDir, 'files'), { recursive: true });
    fs.mkdirSync(path.join(swapDir, 'logos'), { recursive: true });

    const stagedFiles = (manifest.files ?? []).filter(f => !isFlaggedRow(f));
    const newIds = new Set(stagedFiles.map(f => String(f.id)));
    const blobPlan = stagedFiles.map(row => ({
      src: path.join(stagingDir, row.path),
      stage: path.join(swapDir, 'files', String(row.id)),
      dest: path.join(row.logo ? dirs.logosDir : dirs.filesDir, String(row.id)),
    }));
    for (const b of blobPlan) fs.copyFileSync(b.src, b.stage); // staging (BACKUPS_DIR fs) → DATA_DIR temp: copy, never rename (Pitfall 1)

    /* The target's pre-swap blob universe — removals are computed against
       THIS workspace's old doc only (other workspaces' blobs share the
       dirs and are never touched). */
    const targetRow = await dbGet('select id, slug, name, color, doc, revision, created_at from workspaces where id = ?', [targetWorkspaceId]);
    if (!targetRow) {
      cleanup();
      return failWith(keyed('restoreTargetMissing', 'restore: target workspace no longer exists'));
    }
    const oldData = docData(targetRow);
    const oldFileIds = new Set(arr(oldData.files).filter(f => f && typeof f.id === 'string').map(f => f.id));
    const oldLogo = typeof oldData.logo === 'string' && oldData.logo ? oldData.logo : null;
    const oldIds = new Set([...oldFileIds, ...(oldLogo ? [oldLogo] : [])]);
    /* Removals: precise dest resolution — the logo id lands in logosDir,
       every other id in filesDir (an id shared between a file and the
       logo resolves to filesDir first, the doc-PUT read order). */
    const removedIds = [...oldIds].filter(id => !newIds.has(id));
    const removedDest = id => (oldLogo === id && !oldFileIds.has(id) ? dirs.logosDir : dirs.filesDir);

    /* SWAP — the first file mutation of the run; the snapshot has been
       published since the top of the unit (P7 ordering held). */
    fs.mkdirSync(dirs.filesDir, { recursive: true });
    fs.mkdirSync(dirs.logosDir, { recursive: true });
    swappedDests = [];
    try {
      for (const b of blobPlan) {
        fs.copyFileSync(b.stage, b.dest); // overwrite-on-collision is the replacement semantic
        swappedDests.push(b.dest);
      }
    } catch (err) {
      /* swap failure: repair from the snapshot (some dests may already be
         swapped), sweep, fail keyed */
      try {
        await repairFromSnapshot(path.join(backupsRoot(), snapshot.filename), snapshot.sha256, swappedDests, dirs);
      } catch (repairErr) {
        logRestoreWarn(`overwrite ${runId}: snapshot repair after swap failure ALSO failed: ${repairErr?.message ?? repairErr}`);
      }
      cleanup();
      return failWith(keyed('restoreBlobFailed', `restore: blob swap failed: ${err.message}`));
    }

    /* ---- ONE transaction per restore unit (Pattern 2) ---- */
    const storedDoc = docData(targetRow); // pre-tx doc for the FTS diff
    const nextDoc = {
      data: {
        ...nextData,
        ws: { name: srcRow.name ?? targetRow.name, url: targetRow.slug, c: srcRow.color ?? targetRow.color ?? '#1D1C1A', brand: true },
        me: null,
      },
    };
    let verification;
    try {
      await dbTx(async txScope => {
        const t = Date.now();
        /* Identity preserved (D-89-6): id/slug/created_at untouched — the
           row takes the archive's name/color/doc + revision+1. */
        await txScope.run(
          'update workspaces set doc = ?, name = ?, color = ?, revision = revision + 1, updated_at = ? where id = ?',
          [JSON.stringify(nextDoc), srcRow.name ?? targetRow.name, srcRow.color ?? targetRow.color ?? '#1D1C1A', t, targetWorkspaceId],
        );
        await txScope.run('delete from memberships where workspace_id = ?', [targetWorkspaceId]);
        for (const m of keptMemberships) {
          await txScope.run('insert into memberships (workspace_id, user_id, role, member_id, provenance) values (?,?,?,?,?)', [targetWorkspaceId, m.userId, m.role, m.memberId, m.provenance]);
        }
        await txScope.run('delete from team_members where workspace_id = ?', [targetWorkspaceId]);
        for (const r of keptTeamMembers) {
          await txScope.run('insert into team_members (workspace_id, team_id, member_id, user_id) values (?,?,?,?)', [targetWorkspaceId, r.teamId, r.memberId, r.userId]);
        }
        await txScope.run('delete from invites where workspace_id = ?', [targetWorkspaceId]);
        for (const iv of keptInvites) {
          /* token_hash is globally UNIQUE: an archive invite whose token
             already exists (the same logical invite, still parked under the
             archive's origin workspace) TAKES THE TOKEN OVER — delete the
             old row, insert under the target. The never-drops-rows rule
             applies to roster/data rows, not to a unique-key collision. */
          await txScope.run('delete from invites where token_hash = ?', [iv.tokenHash]);
          await txScope.run('insert into invites (token_hash, email, role, teams, workspace_id, created_by, created_at, expires_at) values (?,?,?,?,?,?,?,?)', [iv.tokenHash, iv.email, iv.role, iv.teams, targetWorkspaceId, iv.createdBy, iv.createdAt, iv.expiresAt]);
        }

        if (typeof hooks.midTx === 'function') await hooks.midTx(); // test-only injection point

        /* FTS diff sync INSIDE the tx with the TX SCOPE (Pattern 4). */
        await syncTaskFts(txScope, targetWorkspaceId, storedDoc, nextDoc);

        await emitRestoreEvent({ kind: 'update', runId, stage: 'verifying' });

        /* ---- D-89-30 verification, pre-commit ---- */
        const reParsed = JSON.parse(JSON.stringify(nextData));
        for (const tt of reParsed.tasks) {
          if (tt.parentId && !taskIds.has(tt.parentId)) throw keyed('restoreVerificationFailed', `restore: verification lost task.parentId ${tt.parentId}`);
          if (tt.project && !projIds.has(tt.project)) throw keyed('restoreVerificationFailed', `restore: verification lost task.project ${tt.project}`);
        }
        const counts = {
          memberships: await txScope.get('select count(*) as n from memberships where workspace_id = ?', [targetWorkspaceId]),
          team_members: await txScope.get('select count(*) as n from team_members where workspace_id = ?', [targetWorkspaceId]),
          invites: await txScope.get('select count(*) as n from invites where workspace_id = ?', [targetWorkspaceId]),
        };
        if (counts.memberships.n !== keptMemberships.length) throw keyed('restoreVerificationFailed', 'restore: membership replace count mismatch');
        if (counts.team_members.n !== keptTeamMembers.length) throw keyed('restoreVerificationFailed', 'restore: team_members replace count mismatch');
        if (counts.invites.n !== keptInvites.length) throw keyed('restoreVerificationFailed', 'restore: invites replace count mismatch');
        for (const b of blobPlan) {
          if (!fs.existsSync(b.dest)) throw keyed('restoreVerificationFailed', `restore: swapped blob missing at ${path.basename(b.dest)}`);
        }
        if ((await sha256File(archivePath)) !== backupRun.sha256) {
          throw keyed('restoreVerificationFailed', 'restore: whole-archive digest changed under the run');
        }
      });
    } catch (err) {
      /* rollback happened inside dbTx — repair the file layer FROM THE
         SNAPSHOT (D-89-3: the snapshot is the file-layer net ONLY) and
         sweep every staging tree. */
      try {
        await repairFromSnapshot(path.join(backupsRoot(), snapshot.filename), snapshot.sha256, swappedDests, dirs);
      } catch (repairErr) {
        logRestoreWarn(`overwrite ${runId}: snapshot repair after tx failure ALSO failed: ${repairErr?.message ?? repairErr}`);
      }
      cleanup();
      return failWith(err);
    }

    /* POST-commit: compensating unlink of removed blobs (doc-PUT idiom,
       ENOENT-tolerant) — the DB no longer references them. */
    for (const id of removedIds) {
      try { fs.unlinkSync(path.join(removedDest(id), id)); } catch { /* ENOENT-tolerant */ }
    }

    /* Skip report (D-89-7/OQ4): operational-classified tables ride the
       manifest classifications verbatim. */
    const summary = {
      skipped: arr(manifest.tables)
        .filter(t => t.classification === 'operational' && t.rows > 0)
        .map(t => ({ table: t.name, rows: t.rows })),
      memberships: { skipped: membershipsSkipped, replaced: keptMemberships.length, operatorRetained },
      teamMembers: { skipped: teamMembersSkipped, replaced: keptTeamMembers.length },
      invites: { skipped: invitesSkipped, replaced: keptInvites.length },
      files: { swapped: blobPlan.length, removed: removedIds.length },
    };
    const finalName = srcRow.name ?? targetRow.name;
    await emitRestoreEvent({ kind: 'finish', runId, summary: JSON.stringify(summary), finalName, finishedAt: Date.now() });
    cleanup(); // success sweep — staging and the swap dir are spent
    await release(); // D-89-32: the route's lock claim ends with the unit
    return {
      ok: true,
      runId,
      workspaceId: targetWorkspaceId,
      finalName,
      slug: targetRow.slug,
      summary,
      snapshotRunId: snapshot.runId,
      snapshotFilename: snapshot.filename,
    };
  } catch (err) {
    /* unexpected throw outside the tx (post-commit unlink trouble is
       ENOENT-tolerant and never throws; this is belt-and-braces) — the
       outer scope tracks swapped dests in a let declared beside stagingDir
       so the repair net still fires. */
    try {
      if (swappedDests.length > 0) await repairFromSnapshot(path.join(backupsRoot(), snapshot.filename), snapshot.sha256, swappedDests, dirs);
    } catch (repairErr) {
      logRestoreWarn(`overwrite ${runId}: snapshot repair after unexpected failure ALSO failed: ${repairErr?.message ?? repairErr}`);
    }
    cleanup();
    return failWith(err);
  }
}

/* ---- Task 89-04 Task 2: the runRestore pipeline (D-89-29 stages) ----
   The trigger route's fire-and-forget body: fetching (local archive
   in place → use it; else uploaded=1 → the 88-01 downloadToStaged seam
   into restore-staging, D-89-16) → delegating to restoreImportAsNew,
   which walks validating → restoring → verifying → done|failed through
   the writer seam with every keyed refusal class persisted verbatim
   (D-89-33). The pipeline's finally ALWAYS releases the restore lock
   (D-89-3) and unlinks a downloaded staged archive (best-effort) — a
   failed unit leaves zero debris. resolve-by-design like its units:
   returns { ok, ... } and never throws (unexpected throws are folded
   into the failed run row through the emitter before returning). ---- */
export async function runRestore(opts = {}) {
  const runId = typeof opts.runId === 'string' ? opts.runId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64) : crypto.randomUUID();
  const backupRun = opts.backupRun && typeof opts.backupRun === 'object' ? opts.backupRun : {};
  const releaseLock = typeof opts.releaseLock === 'function' ? opts.releaseLock : null;
  let stagedTmp = null;
  try {
    await emitRestoreEvent({ kind: 'update', runId, stage: 'fetching' });

    /* fetching: local archive in place → use it; else the uploaded copy
       comes home through the 88-01 seam into restore-staging (same-fs
       with the archives — D-89-16), digest-verified by downloadToStaged. */
    let archivePath = opts.archivePath ?? null;
    const localPath = backupRun.filename ? path.join(backupsRoot(), backupRun.filename) : null;
    if (!archivePath && localPath && fs.existsSync(localPath)) archivePath = localPath;
    if (!archivePath && backupRun.uploaded === 1 && opts.s3Config && typeof opts.s3Config === 'object') {
      const back = await downloadToStaged(opts.s3Config, s3BackupKey({ taskId: backupRun.taskId }, backupRun.filename), backupRun.sha256, restoreStagingDir());
      archivePath = back.tmpPath;
      stagedTmp = back.tmpPath;
    }
    if (!archivePath || !fs.existsSync(archivePath)) {
      throw keyed('restoreArchiveMissing', 'restore: archive not found at either destination');
    }

    const result = await restoreImportAsNew({
      runId,
      archivePath,
      expectedSha256: backupRun.sha256,
      scope: opts.scope ?? null,
      operatorId: opts.operatorId ?? null,
      trigger: opts.trigger ?? 'import_new',
      startedAt: opts.startedAt,
      targetWorkspaceId: opts.targetWorkspaceId ?? null,
      uniqueSlug: typeof opts.uniqueSlug === 'function' ? opts.uniqueSlug : null,
    });
    return result;
  } catch (err) {
    /* the pipeline itself threw (fetching trouble): fold into the run row
       through the emitter — the failed state is the contract, never a
       dangling running row (D-89-3). */
    await emitRestoreEvent({
      kind: 'fail',
      runId,
      error: (typeof err?.code === 'string' ? `${err.code}: ` : '') + (err?.message ?? String(err)),
      finishedAt: Date.now(),
    });
    return { ok: false, runId, code: typeof err?.code === 'string' ? err.code : 'restoreFailed', error: err?.message ?? String(err) };
  } finally {
    if (stagedTmp) {
      try {
        fs.unlinkSync(stagedTmp);
      } catch {
        /* best-effort — the sweep collects leftovers */
      }
    }
    if (releaseLock) {
      try {
        await releaseLock();
      } catch (err) {
        logRestoreWarn(`restore run ${runId}: lock release failed: ${err?.message ?? err}`);
      }
    }
  }
}

/* Seek-extract ONLY manifest-declared entries into destDir (the caller
   passes restoreStagingDir()/<runId>/). Blobs land FLAT as
   destDir/files/<id> and destDir/logos/<name> (D-89-12, 86 A6); the
   manifest and table ndjson land at the staging root. Returns
   { ok, extracted, flagged, skipped, sha256 } — flagged rows carried
   with no sha verification (86-D-4 / verifyStagedBackup posture), every
   non-flagged row's content hash verified on the pipe. On ANY error the
   catch rmStaging()s destDir: failed restores leave NOTHING behind. */
export async function extractArchive(archivePath, destDir, manifest, opts = {}) {
  const tolerateSkips = opts.tolerateSkips === true; // 89-05 DR: instance archives legitimately carry DATA_DIR entries extraction skips
  fs.mkdirSync(destDir, { recursive: true });
  const destReal = fs.realpathSync(destDir); // canonical — containment runs against the real root
  fs.mkdirSync(path.join(destReal, 'files'), { recursive: true });
  fs.mkdirSync(path.join(destReal, 'logos'), { recursive: true });

  const tableRows = new Map((manifest.tables ?? []).map(t => [t.path, t]));
  const fileRows = new Map((manifest.files ?? []).filter(f => !isFlaggedRow(f)).map(f => [f.path, f]));
  const flagged = (manifest.files ?? []).filter(isFlaggedRow);
  const extracted = [];
  const skipped = [];
  const sinks = []; // every opened write sink — their flushes are awaited before returning
  let activeStream = null;
  const walkerRef = { walker: null };

  const onEntry = entry => {
    let gated;
    try {
      gated = gateEntryName(entry.name);
    } catch (err) {
      skipped.push({ name: entry.name, code: err.code, reason: err.reason }); // never extracted, never fatal
      return null;
    }
    if ((gated.kind === 'file' || gated.kind === 'logo') && !fileRows.has(entry.name)) {
      skipped.push({ name: entry.name, code: 'restoreEntryRejected', reason: 'unmanifested' }); // no manifest contract → never written
      return null;
    }
    const target = path.join(destReal, entry.name);
    /* contained() BEFORE every write (T-89-01): a symlinked subdirectory
       under destDir resolves outside the canonical root → refuse, never
       follow. */
    const parentReal = fs.realpathSync(path.dirname(target));
    if (!contained(parentReal, destReal)) {
      throw keyed(
        'restoreContainmentViolated',
        `restore: extraction target for "${entry.name}" escapes ${destReal} through a symlink`,
        { name: entry.name },
      );
    }
    const expected =
      gated.kind === 'manifest'
        ? null // the manifest entry itself carries no row contract
        : tableRows.get(entry.name)?.sha256 ?? fileRows.get(entry.name)?.sha256 ?? null;
    const stream = fs.createWriteStream(target, { flags: 'w', mode: 0o644 });
    stream.on('error', err => walkerRef.walker?.destroy(err));
    activeStream = stream;
    const sink = {
      name: entry.name,
      kind: gated.kind,
      expected,
      stream,
      hash: crypto.createHash('sha256'),
      finished: null, // set by the walker's finishSink — awaited before extractArchive returns
      onDone: () => extracted.push({ name: entry.name, kind: gated.kind, size: entry.size }),
    };
    sinks.push(sink);
    return sink;
  };

  try {
    const walked = await readArchiveEntries(archivePath, {
      onEntry,
      onWalker: w => {
        walkerRef.walker = w;
      },
    });
    /* Every sink's flush is awaited — callers may read the staged tree
       the moment extractArchive resolves. */
    await Promise.all(sinks.map(s => s.finished ?? Promise.resolve()));
    /* Fail-closed completeness: every manifest-declared row must have
       been extracted — a declared row the archive never carried is
       corruption, not a flag (flags declare themselves up front).
       tolerateSkips (89-05 DR) exempts rows the gate recorded as
       legitimate shape-miss skips (projects.db et al.) — a row that is
       BOTH declared and absent with no skip record still throws. */
    for (const rel of [...tableRows.keys(), ...fileRows.keys()]) {
      if (extracted.some(e => e.name === rel)) continue;
      if (tolerateSkips && skipped.some(s => s.name === rel)) continue;
      throw keyed('restoreArchiveIncomplete', `restore: manifest declares "${rel}" but the archive never carried it`, { name: rel });
    }
    return { ok: true, extracted, flagged, skipped, sha256: walked.sha256 };
  } catch (err) {
    if (activeStream) {
      try {
        activeStream.destroy();
      } catch {
        /* best-effort */
      }
    }
    rmStaging(destDir); // D-15 mirrored (D-89-32): failed restores leave NOTHING behind
    throw err;
  } finally {
    walkerRef.walker = null;
  }
}

/* ---- Instance disaster-recovery restore unit (Phase 89, plan 89-05, BKRST-04) ----
   The DR sibling of restoreOverwriteUnit: replaces the instance's DATA
   tables (workspaces doc-and-all + the roster) with the archive's in ONE
   transaction, rebuilds instance_roles EXCEPTED from the operational skip
   (D-89-8), and revokes EVERY session strictly post-commit (D-89-25).
   The instance stays live throughout (D-89-26 — no maintenance mode; the
   global restore_lock is the only concurrency control); DR skips the
   email gate (D-89-28 — the re-login wall is the notification).

   Snapshot-first (P7/D-89-5, planner flag 1): a pre-DR INSTANCE snapshot
   via the 86 runExport core lands BEFORE any mutation; the restore_runs
   row carries snapshot_run_id + snapshot_tag='pre_restore' and the audit
   trail records restore_snapshot_started:pre_restore; backup_runs.trigger
   stays 'manual'. The net is unconditional — every keyed refusal after it
   leaves it in place.

   Data layer (Pitfall 7): staging/IO complete BEFORE the tx opens — the
   tx body is deletes + validated inserts only, NO DDL (D-89-31). Every
   roster row validates against LIVE users (D-89-8 + prohibition P9 — a
   dead user_id skips + reports, never dangling, never resurrecting an
   account). D-89-30 verification runs pre-commit; any gap throws →
   rollback + snapshot repair of the file layer.

   Blob layer (D-89-4): staged extraction → DATA_DIR-level temp copy →
   swap into FILES_DIR/LOGOS_DIR; removals unlink post-commit (doc-PUT
   idiom). Shape-miss skipped entries (instance archives legitimately
   carry DATA_DIR-relative entries — projects.db et al. — which the
   reader gate skips and records) are counted into the summary, never
   fatal; the path-escape families still refuse FATALLY (D-89-33).

   _hooks (test-only): afterSnapshot/midTx injection points. */
export async function restoreInstanceUnit(opts = {}) {
  const runId = (typeof opts.runId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(opts.runId) ? opts.runId : crypto.randomUUID()).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
  const backupRun = opts.backupRun && typeof opts.backupRun === 'object' ? opts.backupRun : {};
  const operator = opts.operator && typeof opts.operator === 'object' ? opts.operator : null;
  const operatorId = operator?.id ?? (typeof opts.operatorId === 'string' ? opts.operatorId : null);
  const hooks = opts._hooks && typeof opts._hooks === 'object' ? opts._hooks : {};
  const releaseLock = typeof opts.releaseLock === 'function' ? opts.releaseLock : null;
  /* The lock-release funnel is declared FIRST (mirrors the overwrite unit):
     the route claims restore_lock before firing this unit, so EVERY exit —
     including the pre-snapshot keyed refusals and the snapshot-block catch
     below — must release it, or every later restore trigger 409s and every
     backup run (manual + scheduled, D-89-1) refuses skipped_overlap until
     reboot. The inner paths' explicit cleanup()+release() calls stay
     harmless (release is idempotent — CAS on claimed_by = the caller). */
  const release = async () => { if (releaseLock) { try { await releaseLock(); } catch { /* best-effort */ } } };

  const failWith = async err => {
    const code = typeof err?.code === 'string' ? err.code : null;
    const persisted = code ? `${code}: ${err.message}` : err.message;
    await emitRestoreEvent({ kind: 'fail', runId, error: persisted, finishedAt: Date.now() });
    await release();
    return { ok: false, runId, code: code ?? 'restoreFailed', error: persisted };
  };

  if (!operatorId) {
    return failWith(keyed('restoreOperatorMissing', 'restore: DR requires an operator identity'));
  }

  /* ---- fetching (mirrors the runRestore fetching stage above): local
     archive in place → use it; else the uploaded copy comes home through
     the 88-01 downloadToStaged seam into restore-staging (same-fs with
     the archives — D-89-16), digest-verified on the pipe. Rotation-away
     is the NORM for an S3-posture instance (the local archive is the
     transient copy) — DR refusing an uploaded-only run made the
     survival-in-S3 contract unreachable end-to-end (90-04 e2e find,
     Rule 1). GUARDED: the seam throw routes through failWith so the
     funnel releases the restore_lock (89-05 CR contract — a stranded
     lock wedges every later restore AND backup run). */
  let stagedTmp = null;
  const dropStagedTmp = () => {
    if (stagedTmp) { try { fs.unlinkSync(stagedTmp); } catch { /* best-effort — the sweep collects leftovers */ } stagedTmp = null; }
  };
  let archivePath = opts.archivePath ?? null;
  const localPath = backupRun.filename ? path.join(backupsRoot(), backupRun.filename) : null;
  if (!archivePath && localPath && fs.existsSync(localPath)) archivePath = localPath;
  if (!archivePath && backupRun.uploaded === 1 && opts.s3Config && typeof opts.s3Config === 'object' && backupRun.filename) {
    try {
      const back = await downloadToStaged(opts.s3Config, s3BackupKey({ taskId: backupRun.taskId }, backupRun.filename), backupRun.sha256, restoreStagingDir());
      archivePath = back.tmpPath;
      stagedTmp = back.tmpPath;
    } catch (err) {
      dropStagedTmp();
      return failWith(keyed('restoreArchiveMissing', `restore: archive not retrievable — local missing and the S3 seam failed (${err?.code || err?.message || 'unknown'})`));
    }
  }
  if (!archivePath || !fs.existsSync(archivePath)) {
    return failWith(keyed('restoreArchiveMissing', 'restore: archive not found at the resolved path'));
  }

  /* ---- SNAPSHOT FIRST (P7/D-89-5) — before ANY mutation ---- */
  let snapshot = null;
  let stagingDir = null;
  let swapDir = null;
  let swappedDests = [];
  try {
    snapshot = await runExport({ kind: 'instance' }, { trigger: 'manual' });
    if (!snapshot?.ok) {
      /* 90-review WR-01: this exit predates cleanup()'s declaration below,
         so the staged S3 temp needs its own rm-finally here — a repeated
         snapshot failure would otherwise accumulate full instance
         credential archives in restore-staging until the boot-only sweep. */
      dropStagedTmp();
      return failWith(keyed('restoreSnapshotFailed', `restore: pre-DR snapshot failed: ${snapshot?.error ?? 'unknown export failure'}`));
    }
    /* Flag 1: the tag lives on the restore_runs row + audit. */
    await emitRestoreEvent({ kind: 'update', runId, snapshotRunId: snapshot.runId, snapshotTag: 'pre_restore' });
    try {
      await dbRunAudit('restore_snapshot_started:pre_restore', operator, runId, snapshot.filename, null);
    } catch (err) {
      logRestoreWarn(`DR ${runId}: snapshot audit write failed (best-effort): ${err?.message ?? err}`);
    }
    if (typeof hooks.afterSnapshot === 'function') await hooks.afterSnapshot();
  } catch (err) {
    /* 90-review WR-01: the snapshot-block catch sits before cleanup()'s
       declaration too — drop the staged temp explicitly (D-89-16
       rm-finally: the staged temp never outlives the response). */
    dropStagedTmp();
    if (stagingDir) rmStaging(stagingDir);
    if (swapDir) rmStaging(swapDir);
    return failWith(err);
  }

  const dirs = blobsDirs();
  /* 90-review WR-01: cleanup() is the funnel every post-snapshot failure
     exit already walks — folding the staged-temp drop in here covers the
     streamVerifyArchive-fail, restoreTargetMismatch, remap/blob/swap and
     tx-catch exits in one place. Safety against D-89-30: cleanup() NEVER
     runs on the success path before the in-tx re-hash (sha256File(
     archivePath) inside the tx) — its only success-path call is the
     post-commit sweep, where dropStagedTmp() already ran (stagedTmp is
     null, the drop is a no-op). Refusal classes are untouched — cleanup
     only ever precedes a return. */
  const cleanup = () => {
    dropStagedTmp();
    if (stagingDir) rmStaging(stagingDir);
    if (swapDir) rmStaging(swapDir);
  };
  /* release is declared above failWith — the funnel owns it. */

  /* Engine-side scope-kind re-check — AFTER the snapshot (the net is
     unconditional; DR restores instance-scope archives only). */
  try {
    let manifest = null;
    await emitRestoreEvent({ kind: 'update', runId, stage: 'validating' });
    try {
      const verified = await streamVerifyArchive(archivePath, backupRun.sha256);
      manifest = verified.manifest;
    } catch (err) {
      cleanup();
      await release();
      return failWith(err);
    }
    if (manifest?.scope?.kind !== 'instance') {
      cleanup();
      await release();
      return failWith(keyed('restoreTargetMismatch', `restore: DR requires an instance-scope archive (got ${manifest?.scope?.kind ?? 'unknown'})`));
    }

    stagingDir = path.join(restoreStagingDir(), `restore-${runId}`);
    let extracted;
    try {
      /* tolerateSkips: instance archives legitimately carry DATA_DIR
         entries (projects.db et al.) extraction skips-and-records — the
         count lands in the run summary; path-escape families stay fatal. */
      extracted = await extractArchive(archivePath, stagingDir, manifest, { tolerateSkips: true });
    } catch (err) {
      stagingDir = null; // extractArchive already rmStaging()ed its own tree (D-89-32)
      dropStagedTmp();
      cleanup();
      await release();
      return failWith(err);
    }
    /* Shape-miss skips are LEGITIMATE here (projects.db et al.); the
       path-escape families already refused fatally upstream. Count them. */
    const skippedEntries = extracted.skipped.length;
    /* The staged S3 temp stays alive through the D-89-30 pre-commit re-hash
       (sha256File(archivePath) inside the tx) — dropping it here would fail
       that re-hash with ENOENT on any S3-located archive (90-04 e2e find).
       The post-commit drop below owns the rm-finally half. */

    /* Streaming read-back (WR fix) — rows retained only for consumed
       tables; the rest is counted, never buffered. */
    const { archiveRows, archiveCounts } = await readStagedTables(manifest, stagingDir);

    const archiveWsRows = (archiveRows.workspaces ?? []).filter(r => r && typeof r.id === 'string' && r.id);
    if (archiveWsRows.length === 0) {
      cleanup();
      await release();
      return failWith(keyed('restoreRemapIncomplete', 'restore: the archive carries no workspaces — nothing to recover', { reason: 'workspacesMissing' }));
    }
    const archiveWsIds = new Set(archiveWsRows.map(r => r.id));

    /* Doc-graph totality within EACH archive workspace (P5/D-89-10) —
       verbatim ids, so the map IS each doc's own id set. */
    const parsedDocs = new Map();
    for (const r of archiveWsRows) {
      const d = docData(r);
      parsedDocs.set(r.id, d);
      const projIds = new Set(arr(d.projects).filter(p => p && typeof p.id === 'string').map(p => p.id));
      const taskIds = new Set(arr(d.tasks).filter(t => t && typeof t.id === 'string').map(t => t.id));
      if (typeof d.logo === 'string' && d.logo) projIds.add(d.logo);
      const unresolved = [];
      for (const t of arr(d.tasks)) {
        if (t.parentId && !taskIds.has(t.parentId)) unresolved.push(`task.parentId=${JSON.stringify(t.parentId)}`);
        if (t.project && !projIds.has(t.project)) unresolved.push(`task.project=${JSON.stringify(t.project)}`);
      }
      for (const c of arr(d.comments)) if (c.taskId && !taskIds.has(c.taskId)) unresolved.push(`comment.taskId=${JSON.stringify(c.taskId)}`);
      for (const f of arr(d.files)) {
        if (f.project && !projIds.has(f.project)) unresolved.push(`file.project=${JSON.stringify(f.project)}`);
        if (f.task && !taskIds.has(f.task)) unresolved.push(`file.task=${JSON.stringify(f.task)}`);
      }
      for (const ref of arr(d.projOrder)) if (!projIds.has(ref)) unresolved.push(`projOrder[]=${JSON.stringify(ref)}`);
      if (unresolved.length) {
        cleanup();
        await release();
        return failWith(keyed('restoreRemapIncomplete', `restore: workspace ${r.id} carries ${unresolved.length} unresolved reference(s) (D-89-10): ${unresolved.slice(0, 3).join(', ')}`, { reason: 'unresolvedRefs', workspaceId: r.id }));
      }
    }

    /* Live users are the identity universe (D-33-10) — one read. */
    const liveUserIds = new Set((await dbAll('select id from users', [])).map(r => r.id));

    /* Roster replace-with-validation (D-89-8/P9). */
    const ROLE_OK = new Set(['owner', 'admin', 'member', 'viewer']);
    const keptMemberships = [];
    let membershipsSkipped = 0;
    /* member_id is PER-WORKSPACE state (no uniqueness constraint; every
       server-side resolution reads it filtered by workspace_id), so the
       dedupe is scoped per archive workspace — a global set would force
       the fallback shape (or skip the row entirely on a second collision)
       for two workspaces legitimately reusing the same member_id string. */
    const usedMemberIdsByWs = new Map();
    for (const r of arr(archiveRows.memberships)) {
      if (!r || !archiveWsIds.has(r.workspace_id)) continue;
      if (!r.user_id || !liveUserIds.has(r.user_id) || !ROLE_OK.has(r.role)) {
        membershipsSkipped += 1;
        continue;
      }
      let used = usedMemberIdsByWs.get(r.workspace_id);
      if (!used) {
        used = new Set();
        usedMemberIdsByWs.set(r.workspace_id, used);
      }
      let memberId = typeof r.member_id === 'string' && r.member_id ? r.member_id : memberBase(r.user_id);
      if (used.has(memberId)) memberId = `m_${r.user_id}`;
      if (used.has(memberId)) {
        membershipsSkipped += 1;
        continue;
      }
      used.add(memberId);
      keptMemberships.push({ wsId: r.workspace_id, userId: r.user_id, role: r.role, memberId, provenance: r.provenance ?? 'manual' });
    }

    /* team_members gate mirrors the overwrite unit (WR fix): team_id is
       `text not null` (db-adapter) and every row must reference a team
       that exists in the ARCHIVE DOCS' id space — a malformed or dangling
       row skips + reports (D-89-7) instead of crashing the whole DR tx on
       the raw NOT NULL constraint or inserting a dangling team ref. */
    const teamIds = new Set();
    for (const d of parsedDocs.values()) {
      for (const t of arr(d.teams)) if (t && typeof t.id === 'string') teamIds.add(t.id);
    }
    const keptTeamMembers = [];
    let teamMembersSkipped = 0;
    for (const r of arr(archiveRows.team_members)) {
      if (!r || !archiveWsIds.has(r.workspace_id)) continue;
      if (!r.user_id || !liveUserIds.has(r.user_id) || !r.team_id || !teamIds.has(r.team_id)) {
        teamMembersSkipped += 1;
        continue;
      }
      keptTeamMembers.push({ wsId: r.workspace_id, teamId: r.team_id, memberId: r.member_id ?? null, userId: r.user_id });
    }

    const keptInvites = [];
    let invitesSkipped = 0;
    for (const r of arr(archiveRows.invites)) {
      if (!r || !archiveWsIds.has(r.workspace_id)) continue;
      if (!r.created_by || !liveUserIds.has(r.created_by) || !r.token_hash || !ROLE_OK.has(r.role)) {
        invitesSkipped += 1;
        continue;
      }
      keptInvites.push({ tokenHash: r.token_hash, email: r.email ?? null, role: r.role, teams: r.teams ?? null, wsId: r.workspace_id, createdBy: r.created_by, createdAt: r.created_at ?? Date.now(), expiresAt: r.expires_at ?? Date.now() + 7 * 86400000 });
    }

    /* instance_roles rebuild — EXCEPTED from the operational skip (D-89-8).
       Per-row validation: user_id AND granted_by must resolve to LIVE
       users (P9), role within the CHECK family; (user_id, role) pairs
       dedupe against the UNIQUE index. */
    const OPERATIONAL_ROLE_OK = new Set(['backup_operator', 'restore_operator']);
    const keptInstanceRoles = [];
    let instanceRolesSkipped = 0;
    const seenPairs = new Set();
    for (const r of arr(archiveRows.instance_roles)) {
      if (!r || typeof r.id !== 'string' || !r.id) continue;
      if (!r.user_id || !liveUserIds.has(r.user_id) || !OPERATIONAL_ROLE_OK.has(r.role) || !r.granted_by || !liveUserIds.has(r.granted_by)) {
        instanceRolesSkipped += 1;
        continue;
      }
      const pair = `${r.user_id}|${r.role}`;
      if (seenPairs.has(pair)) {
        instanceRolesSkipped += 1;
        continue;
      }
      seenPairs.add(pair);
      keptInstanceRoles.push({ id: r.id, userId: r.user_id, role: r.role, grantedBy: r.granted_by, grantedAt: r.granted_at ?? Date.now() });
    }

    /* ---- restoring: staged blob swap (D-89-4, EXDEV-safe) ---- */
    await emitRestoreEvent({ kind: 'update', runId, stage: 'restoring' });
    const dataDir = path.dirname(dirs.filesDir);
    swapDir = path.join(dataDir, `restore-swap-${runId}`);
    fs.mkdirSync(path.join(swapDir, 'files'), { recursive: true });
    fs.mkdirSync(path.join(swapDir, 'logos'), { recursive: true });

    /* Doc blobs derive from the ARCHIVE DOCS' id sets — instance
       manifest.files carries EVERY DATA_DIR entry (ids are rel paths like
       "files/f-old", "projects.db"); only doc-referenced blobs swap. */
    const archiveFileIds = new Set();
    const archiveLogoIds = new Set();
    for (const d of parsedDocs.values()) {
      for (const f of arr(d.files)) if (f && typeof f.id === 'string') archiveFileIds.add(f.id);
      if (typeof d.logo === 'string' && d.logo) archiveLogoIds.add(d.logo);
    }
    const manifestFileByPath = new Map((manifest.files ?? []).filter(f => !isFlaggedRow(f)).map(f => [f.path, f]));
    const blobFor = (id, logo) => {
      const row = manifestFileByPath.get(`${logo ? 'logos' : 'files'}/${id}`);
      if (!row) return null; // doc references a blob the archive didn't carry — totality guard below refuses
      return { src: path.join(stagingDir, row.path), stage: path.join(swapDir, 'files', String(id)), dest: path.join(logo ? dirs.logosDir : dirs.filesDir, String(id)) };
    };
    const blobPlan = [];
    let missingBlobs = 0;
    for (const id of archiveFileIds) {
      const b = blobFor(id, false);
      if (!b) { missingBlobs += 1; continue; }
      blobPlan.push(b);
    }
    for (const id of archiveLogoIds) {
      const b = blobFor(id, true);
      if (!b) { missingBlobs += 1; continue; }
      blobPlan.push(b);
    }
    if (missingBlobs > 0) {
      cleanup();
      await release();
      return failWith(keyed('restoreBlobFailed', `restore: ${missingBlobs} doc-referenced blob(s) missing from the archive`));
    }
    const newIds = new Set([...archiveFileIds, ...archiveLogoIds]);
    for (const b of blobPlan) fs.copyFileSync(b.src, b.stage);

    /* The instance's pre-swap blob universe: the union over ALL live
       workspaces' docs (files + logos). Removals never touch blobs the
       archive still carries. */
    const liveWsRows = await dbAll('select id, doc from workspaces', []);
    const oldFileIds = new Set();
    const oldLogoIds = new Set();
    for (const row of liveWsRows) {
      const d = docData(row);
      for (const f of arr(d.files)) if (f && typeof f.id === 'string') oldFileIds.add(f.id);
      if (typeof d.logo === 'string' && d.logo) oldLogoIds.add(d.logo);
    }
    const removedIds = [...new Set([...oldFileIds, ...oldLogoIds])].filter(id => !newIds.has(id));
    const removedDest = id => (oldLogoIds.has(id) && !oldFileIds.has(id) ? dirs.logosDir : dirs.filesDir);

    /* SWAP — the first file mutation of the run. */
    fs.mkdirSync(dirs.filesDir, { recursive: true });
    fs.mkdirSync(dirs.logosDir, { recursive: true });
    swappedDests = [];
    try {
      for (const b of blobPlan) {
        fs.copyFileSync(b.stage, b.dest);
        swappedDests.push(b.dest);
      }
    } catch (err) {
      try {
        await repairFromSnapshot(path.join(backupsRoot(), snapshot.filename), snapshot.sha256, swappedDests, dirs);
      } catch (repairErr) {
        logRestoreWarn(`DR ${runId}: snapshot repair after swap failure ALSO failed: ${repairErr?.message ?? repairErr}`);
      }
      cleanup();
      await release();
      return failWith(keyed('restoreBlobFailed', `restore: blob swap failed: ${err.message}`));
    }

    /* ---- ONE transaction (Pattern 2): deletes + validated inserts only ---- */
    let apiKeysRevoked = 0;
    try {
      await dbTx(async txScope => {
        /* FK children first, then the parents — the roster tables are
           workspace-keyed, so DR replaces them wholesale with the
           validated archive rows. */
        /* Credential disclosure (D-89-7): api_keys.workspace_id is
           `references workspaces(id) on delete cascade` — the workspaces
           delete below would silently destroy every user's API key with
           ZERO trace in the run report. Delete them EXPLICITLY instead so
           the revocation count is disclosed (sessions are revoked
           post-commit per D-89-25; the keys ride the same disclosure
           discipline). The overwrite unit never deletes workspaces rows
           and never cascades. */
        apiKeysRevoked = (await txScope.get('select count(*) as n from api_keys', [])).n;
        await txScope.run('delete from api_keys', []);
        await txScope.run('delete from invites', []);
        await txScope.run('delete from team_members', []);
        await txScope.run('delete from memberships', []);
        await txScope.run('delete from workspaces', []);
        for (const r of archiveWsRows) {
          await txScope.run(
            'insert into workspaces (id, slug, name, color, doc, revision, created_at, updated_at, archived) values (?,?,?,?,?,?,?,?,?)',
            [r.id, r.slug ?? r.id, r.name ?? r.id, r.color ?? '#1D1C1A', r.doc ?? '{}', Number.isSafeInteger(r.revision) ? r.revision : 1, r.created_at ?? Date.now(), r.updated_at ?? Date.now(), r.archived ? 1 : 0],
          );
        }
        for (const m of keptMemberships) {
          await txScope.run('insert into memberships (workspace_id, user_id, role, member_id, provenance) values (?,?,?,?,?)', [m.wsId, m.userId, m.role, m.memberId, m.provenance]);
        }
        for (const r of keptTeamMembers) {
          await txScope.run('insert into team_members (workspace_id, team_id, member_id, user_id) values (?,?,?,?)', [r.wsId, r.teamId, r.memberId, r.userId]);
        }
        for (const iv of keptInvites) {
          /* token_hash is globally UNIQUE — the archive invite takes the
             token over (delete the stale row, insert under the archive's
             workspace). */
          await txScope.run('delete from invites where token_hash = ?', [iv.tokenHash]);
          await txScope.run('insert into invites (token_hash, email, role, teams, workspace_id, created_by, created_at, expires_at) values (?,?,?,?,?,?,?,?)', [iv.tokenHash, iv.email, iv.role, iv.teams, iv.wsId, iv.createdBy, iv.createdAt, iv.expiresAt]);
        }
        await txScope.run('delete from instance_roles', []);
        for (const r of keptInstanceRoles) {
          await txScope.run('insert into instance_roles (id, user_id, role, granted_by, granted_at) values (?,?,?,?,?)', [r.id, r.userId, r.role, r.grantedBy, r.grantedAt]);
        }

        if (typeof hooks.midTx === 'function') await hooks.midTx(); // test-only injection point

        /* FTS diff sync per workspace INSIDE the tx with the TX SCOPE. */
        for (const r of archiveWsRows) {
          const storedRow = liveWsRows.find(w => w.id === r.id) ?? null;
          await syncTaskFts(txScope, r.id, storedRow ? docData(storedRow) : null, { data: parsedDocs.get(r.id) });
        }

        await emitRestoreEvent({ kind: 'update', runId, stage: 'verifying' });

        /* ---- D-89-30 verification, pre-commit ---- */
        const wsCount = await txScope.get('select count(*) as n from workspaces', []);
        if (wsCount.n !== archiveWsRows.length) throw keyed('restoreVerificationFailed', 'restore: workspace replace count mismatch');
        const mCount = await txScope.get('select count(*) as n from memberships', []);
        if (mCount.n !== keptMemberships.length) throw keyed('restoreVerificationFailed', 'restore: membership replace count mismatch');
        const irCount = await txScope.get('select count(*) as n from instance_roles', []);
        if (irCount.n !== keptInstanceRoles.length) throw keyed('restoreVerificationFailed', 'restore: instance_roles rebuild count mismatch');
        for (const b of blobPlan) {
          if (!fs.existsSync(b.dest)) throw keyed('restoreVerificationFailed', `restore: swapped blob missing at ${path.basename(b.dest)}`);
        }
        if ((await sha256File(archivePath)) !== backupRun.sha256) {
          throw keyed('restoreVerificationFailed', 'restore: whole-archive digest changed under the run');
        }
      });
    } catch (err) {
      /* rollback happened inside dbTx — repair the file layer FROM THE
         SNAPSHOT (D-89-3) and sweep. */
      dropStagedTmp(); // the staged S3 temp is never consumed past a failed tx
      try {
        await repairFromSnapshot(path.join(backupsRoot(), snapshot.filename), snapshot.sha256, swappedDests, dirs);
      } catch (repairErr) {
        logRestoreWarn(`DR ${runId}: snapshot repair after tx failure ALSO failed: ${repairErr?.message ?? repairErr}`);
      }
      cleanup();
      await release();
      return failWith(err);
    }

    dropStagedTmp(); // POST-commit: extract + the D-89-30 re-hash both consumed the staged S3 temp (D-89-16 rm-finally)

    /* POST-commit, in the 9115-9133 order — the run task completed FIRST,
       then the side effect: removed blobs unlink (ENOENT-tolerant), and
       the D-89-25 GLOBAL session revocation (every session, including the
       initiator's — the re-login wall IS the notification, D-89-28). */
    for (const id of removedIds) {
      try { fs.unlinkSync(path.join(removedDest(id), id)); } catch { /* ENOENT-tolerant */ }
    }
    await dbRun('delete from sessions', []);

    /* Skip report (D-89-7/OQ4): operational tables ride the manifest
       classifications verbatim — saved_views, user_notif_prefs,
       webhook_hooks and friends are NOT restored and are listed here. */
    const summary = {
      skipped: arr(manifest.tables)
        .filter(t => t.classification === 'operational' && t.rows > 0 && t.name !== 'instance_roles')
        .map(t => ({ table: t.name, rows: t.rows })),
      instanceRoles: { rebuilt: keptInstanceRoles.length, skipped: instanceRolesSkipped },
      memberships: { skipped: membershipsSkipped, replaced: keptMemberships.length },
      teamMembers: { skipped: teamMembersSkipped, replaced: keptTeamMembers.length },
      invites: { skipped: invitesSkipped, replaced: keptInvites.length },
      files: { swapped: blobPlan.length, removed: removedIds.length },
      apiKeys: { revoked: apiKeysRevoked }, // explicit disclosure: DR destroys every API key via the workspaces cascade
      skippedEntries,
    };
    await emitRestoreEvent({ kind: 'finish', runId, summary: JSON.stringify(summary), finalName: 'instance', finishedAt: Date.now() });
    cleanup(); // success sweep
    await release();
    return {
      ok: true,
      runId,
      summary,
      snapshotRunId: snapshot.runId,
      snapshotFilename: snapshot.filename,
    };
  } catch (err) {
    /* unexpected throw outside the tx — belt-and-braces repair + sweep */
    try {
      if (swappedDests.length > 0) await repairFromSnapshot(path.join(backupsRoot(), snapshot.filename), snapshot.sha256, swappedDests, dirs);
    } catch (repairErr) {
      logRestoreWarn(`DR ${runId}: snapshot repair after unexpected failure ALSO failed: ${repairErr?.message ?? repairErr}`);
    }
    dropStagedTmp();
    cleanup();
    await release();
    return failWith(err);
  }
}
