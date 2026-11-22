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
