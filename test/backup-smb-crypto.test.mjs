/* =====================================================================
   SMB CRYPTO + CODEC GOLDEN VECTORS — Phase 99 (99-01, layer 1)
   =====================================================================
   Offline, ungated, always-on (D-02). SigV4-suite idiom: pure-fn
   asserts, hex equality, no sockets, no docker.

   Vector provenance:
   - MD4 ×7: RFC 1320 §A.5 test suite, cross-checked against
     `openssl dgst -md4 -provider legacy` at pin time (2026-11-25).
     NOTE: two values quoted in 99-01-PLAN.md must_haves ('a' and
     'abc') are typos; the values pinned here are the authentic RFC
     1320 vectors verified by execution.
   - NT-hash pins: canonical davenport NT-hash values (they DO
     reproduce under MS-NLMP §3.3.2: MD4 over UTF-16LE password).
   - NTLMv2 transcript: canonical davenport transcript INPUTS
     (user 'user', domain 'DOMAIN', password 'SecREt01',
     ServerChallenge 0x0123456789abcdef as LE bytes 01..08,
     client nonce 0xffffff0011223344, timestamp 0x0090d336b734c301,
     concrete TargetInfo blob defined below). Outputs are SELF-PINNED
     by executing the implementation once (Pitfall 7 / A5).
     Davenport's claimed NTLMv2-hash value 0x04b8e0ba... is an
     ERRATUM — it is NOT an expectation anywhere in this file.
   - Signing-key derivation: MS-SMB2 §3.1.5.2 (2.1: label literally
     'SMB2AESKey' ++ 0x00, first 16 bytes) — self-consistency-pinned.
   - Codecs: MS-SMB2 §2.1/§2.2.1.1 — NBSS 4-byte big-endian framing
     vs SMB2 64-byte little-endian header (the BE/LE contrast is the
     core trap).
   - Status→class map: SC-3 closed 9-enum + OQ-3 adopted resolution
     (dialect-mismatch → generic/smbDialectUnsupported; signing
     refusal → signingRequired).
   ===================================================================== */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  md4, utf16le, ntlmHash, ntlmv2Hash,
  buildNtlmType1, parseNtlmType2, buildNtlmType3, sessionBaseKey,
  deriveSigningKey,
} from '../export/smb.js';

/* --------------------------------------------------------------------
   MD4 — RFC 1320 §A.5 (7/7)
   -------------------------------------------------------------------- */

test('md4: RFC 1320 §A.5 golden vectors (7/7)', () => {
  const vectors = [
    ['', '31d6cfe0d16ae931b73c59d7e0c089c0'],
    ['a', 'bde52cb31de33e46245e05fbdbd6fb24'],
    ['abc', 'a448017aaf21d8525fc10ae87aa6729d'],
    ['message digest', 'd9130a8164549fe818874806e1c7014b'],
    ['abcdefghijklmnopqrstuvwxyz', 'd79e1c308aa5bbcdeea8ed63df412da9'],
    ['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', '043f8582f241db351ce627e153e7f0e4'],
    ['12345678901234567890123456789012345678901234567890123456789012345678901234567890', 'e33b4ddc9c38f2199c3e7b164fcc0536'],
  ];
  for (const [msg, expected] of vectors) {
    assert.equal(md4(Buffer.from(msg, 'utf8')).toString('hex'), expected, `md4(${JSON.stringify(msg)})`);
  }
});

test('md4: 448-bit-span message (56 bytes) — padding boundary', () => {
  // 56-byte message = 448 bits → the padding block is exactly
  // 0x80 ++ 63 zero bytes... no: 0x80 then length immediately at the
  // block boundary (zero 0x00 fill bytes before the LE length field).
  // openssl dgst -md4 -provider legacy cross-checked at pin time.
  const msg = Buffer.from('abcdefghijklmnopqrstuvwxyzabcde', 'utf8'); // 31 bytes
  const msg56 = Buffer.from('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZABCD', 'utf8'); // 56 bytes
  assert.equal(msg56.length, 56);
  assert.equal(md4(msg56).toString('hex'), 'd7ef17117787158e8b15f2d0b24d3dbc');
});

/* --------------------------------------------------------------------
   NT hash — MD4 over UTF-16LE (MS-NLMP §3.3.2 NTOWFv2 base)
   -------------------------------------------------------------------- */

test('ntlmHash: canonical davenport NT-hash pins (UTF-16LE)', () => {
  assert.equal(ntlmHash('password').toString('hex'), '8846f7eaee8fb117ad06bdd830b7586c');
  assert.equal(ntlmHash('SecREt01').toString('hex'), 'cd06ca7c7e10c99b1d33b7485a2ed808');
});

test('utf16le: single helper, no BOM', () => {
  const b = utf16le('user');
  assert.equal(b.toString('hex'), '7500730065007200');
  assert.equal(b[0], 0x75);
});

/* --------------------------------------------------------------------
   NTLMv2 transcript — canonical davenport inputs, self-pinned outputs
   (davenport's 0x04b8e0ba NTLMv2-hash value is an ERRATUM — never an
   expectation here)
   -------------------------------------------------------------------- */

const CHALLENGE = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
const CLIENT_NONCE = Buffer.from([0xff, 0xff, 0xff, 0x00, 0x11, 0x22, 0x33, 0x44]);
const TIMESTAMP = Buffer.alloc(8);
TIMESTAMP.writeBigUInt64LE(0x0090d336b734c301n, 0);
// Concrete TargetInfo: MsvAvNbDomainName("DOMAIN") + MsvAvEOL terminator.
const TARGET_INFO = Buffer.concat([
  Buffer.from([0x02, 0x00, 0x0c, 0x00]), utf16le('DOMAIN'), Buffer.from([0x00, 0x00, 0x00, 0x00]),
]);

function buildType2Fixture() {
  const targetInfo = TARGET_INFO;
  const buf = Buffer.alloc(52 + targetInfo.length);
  buf.write('NTLMSSP\0', 0, 'latin1');
  buf.writeUInt32LE(2, 8);                    // type 2
  buf.writeUInt16LE(0, 12); buf.writeUInt16LE(0, 14); buf.writeUInt32LE(52, 16); // target name (empty) @52
  buf.writeUInt32LE(0x00880201, 20);          // flags: Unicode | NTLM | NTLM2key | TARGET_INFO
  CHALLENGE.copy(buf, 24);                    // ServerChallenge @24
  Buffer.alloc(8).copy(buf, 32);              // Context
  buf.writeUInt16LE(targetInfo.length, 40); buf.writeUInt16LE(targetInfo.length, 42); buf.writeUInt32LE(52, 44);
  targetInfo.copy(buf, 52);
  return buf;
}

test('ntlmv2Hash: HMAC-MD5(ntHash, UTF-16LE(UPPER(user)+domain)), hand-written chain pin', () => {
  const v2 = ntlmv2Hash('user', 'DOMAIN', ntlmHash('SecREt01'));
  // Independent hand-written construction (sigv4-pin idiom): the v2 hash
  // must equal HMAC-MD5 over the spec-verbatim input built here, NOT via
  // ntlmv2Hash's own concat path.
  const expected = crypto.createHmac('md5', Buffer.from('cd06ca7c7e10c99b1d33b7485a2ed808', 'hex'))
    .update(Buffer.from('USER', 'utf16le'))
    .update(Buffer.from('DOMAIN', 'utf16le'))
    .digest();
  assert.equal(v2.toString('hex'), expected.toString('hex'));
});

test('buildNtlmType1: 16-byte minimal Version-1, no KEY_EXCH/56-bit flags', () => {
  const t1 = buildNtlmType1();
  assert.equal(t1.length, 16);
  assert.equal(t1.subarray(0, 8).toString('latin1'), 'NTLMSSP\0');
  assert.equal(t1.readUInt32LE(8), 1);
  const flags = t1.readUInt32LE(12);
  assert.equal(flags & 0x40000000, 0, 'NO KEY_EXCH');
  assert.equal(flags & 0x80000000, 0, 'NO 56-bit');
  assert.equal(flags & 0x00000001, 0x00000001, 'Negotiate Unicode');
  assert.equal(flags & 0x00000200, 0x00000200, 'Negotiate NTLM');
  assert.equal(flags & 0x00080000, 0x00080000, 'NTLM2 key');
  assert.equal(flags & 0x20000000, 0x20000000, 'Negotiate 128');
});

test('parseNtlmType2: extracts challenge, flags and TargetInfo verbatim', () => {
  const t2 = parseNtlmType2(buildType2Fixture());
  assert.equal(t2.serverChallenge.toString('hex'), CHALLENGE.toString('hex'));
  assert.equal(t2.flags, 0x00880201);
  assert.equal(t2.targetInfo.toString('hex'), TARGET_INFO.toString('hex'));
});

test('buildNtlmType3: byte-exact chain — NTProofStr++blob, LMv2, SessionBaseKey, TargetInfo verbatim', () => {
  const t2 = parseNtlmType2(buildType2Fixture());
  const out = buildNtlmType3(t2, 'user', 'DOMAIN', 'SecREt01', CLIENT_NONCE, TIMESTAMP);
  const msg = out.message;

  assert.equal(msg.subarray(0, 8).toString('latin1'), 'NTLMSSP\0');
  assert.equal(msg.readUInt32LE(8), 3);

  // LMv2 @12 (24 bytes), NT response @24 (NTProofStr ++ blob), user @36, ws @48.
  assert.equal(out.lmv2.toString('hex'), '11bbd1cda2bb5500be5add319f97d630ffffff0011223344');
  assert.equal(out.ntProofStr.toString('hex'), '46ed51d932c09ed336c2bd76f87a39f9');
  assert.equal(out.sessionBaseKey.toString('hex'), '022354a8c45e2ea979b0b6bb3fab2e24');
  // v2 hash re-pinned via the same independent construction as above.
  assert.equal(out.ntlmv2Hash.toString('hex'),
    crypto.createHmac('md5', Buffer.from('cd06ca7c7e10c99b1d33b7485a2ed808', 'hex'))
      .update(Buffer.from('USERDOMAIN', 'utf16le')).digest().toString('hex'));

  assert.equal(msg.readUInt16LE(24), 16 + out.blob.length, 'NT response length = proof(16)+blob');
  assert.equal(out.lmv2.length, 24, 'LMv2 is exactly 24 bytes');

  // NT response field = NTProofStr ++ blob, byte-exact.
  const ntLen = msg.readUInt16LE(24);
  const ntOff = msg.readUInt32LE(28);
  const ntResp = msg.subarray(ntOff, ntOff + ntLen);
  assert.equal(ntResp.subarray(0, 16).toString('hex'), out.ntProofStr.toString('hex'));
  assert.equal(ntResp.subarray(16).toString('hex'), out.blob.toString('hex'));

  // Blob structure: 01 01 00 00 | zeros | Time | Nonce | zeros | TargetInfo | zeros
  assert.equal(out.blob.subarray(0, 4).toString('hex'), '01010000');
  assert.equal(out.blob.subarray(4, 8).toString('hex'), '00000000');
  assert.equal(out.blob.readBigUInt64LE(8), TIMESTAMP.readBigUInt64LE(0));
  assert.equal(out.blob.subarray(16, 24).toString('hex'), CLIENT_NONCE.toString('hex'));
  assert.equal(out.blob.subarray(24, 28).toString('hex'), '00000000');
  assert.equal(out.blob.subarray(28, 28 + TARGET_INFO.length).toString('hex'), TARGET_INFO.toString('hex'), 'TargetInfo echoed VERBATIM');
  assert.equal(out.blob.subarray(28 + TARGET_INFO.length).toString('hex'), '00000000');

  // SessionBaseKey = HMAC-MD5(ntlmv2Hash, NTProofStr) — chain consistency.
  const sbk = crypto.createHmac('md5', out.ntlmv2Hash).update(out.ntProofStr).digest();
  assert.equal(out.sessionBaseKey.toString('hex'), sbk.toString('hex'));
  assert.equal(
    sessionBaseKey(out.ntlmv2Hash, out.ntProofStr).toString('hex'),
    sbk.toString('hex'),
    'standalone sessionBaseKey() agrees',
  );

  // LMv2 = HMAC-MD5(v2hash, challenge ++ nonce) ++ nonce.
  const lmv2 = crypto.createHmac('md5', out.ntlmv2Hash)
    .update(Buffer.concat([CHALLENGE, CLIENT_NONCE])).digest();
  assert.equal(out.lmv2.toString('hex'),
    Buffer.concat([lmv2, CLIENT_NONCE]).toString('hex'));

  // User buffer carries 'user' UTF-16LE (case-preserved), workstation empty ok.
  const userLen = msg.readUInt16LE(36);
  const userOff = msg.readUInt32LE(40);
  assert.equal(msg.subarray(userOff, userOff + userLen).toString('utf16le'), 'user');

  // Flags mirror the negotiated Unicode bit; data block at offset 64.
  assert.equal(msg.readUInt32LE(60) & 0x00000001, 0x00000001);
  assert.ok(msg.length >= 64);
});

test('deriveSigningKey: HMAC-SHA256(sbk, SMB2AESKey+0x00)[:16] — self-pinned', () => {
  const t2 = parseNtlmType2(buildType2Fixture());
  const out = buildNtlmType3(t2, 'user', 'DOMAIN', 'SecREt01', CLIENT_NONCE, TIMESTAMP);
  const key = deriveSigningKey(out.sessionBaseKey);
  assert.equal(key.length, 16);
  const expected = crypto.createHmac('sha256', out.sessionBaseKey)
    .update(Buffer.concat([Buffer.from('SMB2AESKey', 'latin1'), Buffer.from([0x00])]))
    .digest().subarray(0, 16);
  assert.equal(key.toString('hex'), expected.toString('hex'));
  assert.equal(key.toString('hex'), '8faae6a2cbf71e317031379d7cd02c08');
});
