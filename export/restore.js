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
import { backupsRoot, TABLES } from './backup.js';

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
import { get as dbGet, all as dbAll, tx as dbTx, syncTaskFts } from '../db-adapter.mjs';

const arr = v => (Array.isArray(v) ? v : []);
const memberBase = userId => `m_${String(userId).slice(0, 8)}`;

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
      membershipsSkipped: 0,
      teamMemberRows: [],
      teamMembersSkipped: 0,
      invitesSkipped: 0,
      skippedOperational: [],
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

  /* Read the staged table ndjson back into row objects (local staging
     only — the archive's bytes were hash-verified by extractArchive). */
  const archiveRows = {};
  for (const t of arr(manifest.tables)) {
    const file = path.join(stagingDir, t.path ?? `${t.name}.ndjson`);
    const rows = [];
    if (fs.existsSync(file)) {
      for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          rows.push(JSON.parse(line));
        } catch {
          /* a line that survived the sha check always parses; skip defensively anyway */
        }
      }
    }
    archiveRows[t.name] = rows;
  }

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
        const read = (archiveRows[t.name] ?? []).length;
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

/* Seek-extract ONLY manifest-declared entries into destDir (the caller
   passes restoreStagingDir()/<runId>/). Blobs land FLAT as
   destDir/files/<id> and destDir/logos/<name> (D-89-12, 86 A6); the
   manifest and table ndjson land at the staging root. Returns
   { ok, extracted, flagged, skipped, sha256 } — flagged rows carried
   with no sha verification (86-D-4 / verifyStagedBackup posture), every
   non-flagged row's content hash verified on the pipe. On ANY error the
   catch rmStaging()s destDir: failed restores leave NOTHING behind. */
export async function extractArchive(archivePath, destDir, manifest) {
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
       corruption, not a flag (flags declare themselves up front). */
    for (const rel of [...tableRows.keys(), ...fileRows.keys()]) {
      if (!extracted.some(e => e.name === rel)) {
        throw keyed('restoreArchiveIncomplete', `restore: manifest declares "${rel}" but the archive never carried it`, { name: rel });
      }
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
