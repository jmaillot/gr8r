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
   The gate (gateEntryName) runs BEFORE any extraction decision: the only
   valid entry names are exactly `manifest.json`, `<table>.ndjson` where
   the table ∈ the frozen TABLES set imported from export/backup.js (the
   archive supplies table names as untrusted input — single allow-list
   source of truth, never a second classification table), flat
   `files/<[A-Za-z0-9_-]{1,64}>` (D-89-12, 86 A6) and
   `logos/<[A-Za-z0-9_-]{1,64}>`. ---- */
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
  constructor(archivePath) {
    super();
    this.archivePath = archivePath;
    this.buf = EMPTY;
    this.entries = [];
    this.seen = new Set(); // duplicate entry names are archive corruption — refuse (walk-level)
    this.zeroBlocks = 0;
    this.done = false;
    this.state = 'header'; // 'header' | 'data'
    this.skip = 0; // data bytes still to discard for the current entry
  }

  _write(chunk, _enc, cb) {
    if (this.done) {
      cb(); // trailing bytes after the end marker are padding — discard
      return;
    }
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    try {
      this.consume();
      cb();
    } catch (err) {
      cb(err);
    }
  }

  _final(cb) {
    if (!this.done) {
      cb(keyed('restoreArchiveTruncated', `restore: archive stream ended before the end-of-archive marker: ${this.archivePath}`));
      return;
    }
    cb();
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
          this.skip -= take;
          this.buf = this.buf.subarray(take); // drop — data blocks are never accumulated
        }
        if (this.buf.length === 0) this.buf = EMPTY;
        if (this.skip > 0) return; // need more bytes for this entry's body
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
      this.skip = Math.ceil(entry.size / BLOCK) * BLOCK; // data rounded to the block boundary
      this.state = 'data';
    }
  }
}

/* Stream the archive once: enumerate every entry (name/size/typeflag/
   mode/mtime) AND compute the whole-archive sha256 on the same pipe.
   Memory stays bounded no matter how large the blobs are. */
export async function readArchiveEntries(archivePath, { onHash } = {}) {
  const hash = crypto.createHash('sha256');
  const hashTap = new Transform({
    transform(chunk, _enc, cb) {
      hash.update(chunk);
      cb(null, chunk);
    },
  });
  const walker = new TarWalker(archivePath);
  try {
    await pipeline(fs.createReadStream(archivePath), hashTap, zlib.createGunzip(), walker);
  } catch (err) {
    if (typeof err?.code === 'string' && err.code.startsWith('restoreArchive')) throw err; // already keyed
    throw keyed('restoreArchiveTruncated', `restore: archive stream unreadable or truncated (${archivePath}): ${err?.message ?? err}`);
  }
  const sha256 = hash.digest('hex');
  if (onHash) onHash(sha256);
  return { entries: walker.entries, sha256 };
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
