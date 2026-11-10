/* =====================================================================
   test helper: unzip — a minimal zip reader built on node:zlib.
   =====================================================================
   Phase 54 (54-02): @office-kit/xlsx's own reader (`fromBuffer` on
   @office-kit/xlsx/node) is BROKEN in 0.26.1 — it fails even on a
   trivial workbook it just wrote (54-RESEARCH §Anti-Patterns, Pattern
   9). Verification must therefore read the archive with node:zlib.

   Helper shape copied from test/helpers/server.mjs: named exports,
   no side effects, paths derived from import.meta.
   ===================================================================== */
import { inflateRawSync } from 'node:zlib';

/* Read a zip archive into a Map of entry name -> Buffer.
   Walks the end-of-central-directory record, then each central-directory
   entry, then the local header and the deflate/stored payload. */
export function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip archive');

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map();

  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);

    const lnlen = buf.readUInt16LE(lho + 26);
    const lelen = buf.readUInt16LE(lho + 28);
    const start = lho + 30 + lnlen + lelen;
    const raw = buf.subarray(start, start + csize);
    out.set(name, method === 0 ? raw : inflateRawSync(raw));
    p += 46 + nlen + elen + clen;
  }
  return out;
}

/* Convenience: Map of entry name -> UTF-8 string (XML parts etc.). */
export function textEntries(buf) {
  const out = new Map();
  for (const [name, data] of unzip(buf)) out.set(name, data.toString('utf8'));
  return out;
}
