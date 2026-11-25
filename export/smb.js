/* =====================================================================
   SMB2.1 DESTINATION CORE — Phase 99 (99-01: pure crypto + codec layer)
   =====================================================================
   Server-only hand-rolled SMB2.1 client on Node stdlib. Zero npm
   deps — node:crypto/node:net ONLY. Lives at the repository ROOT
   beside export/s3.js and export/ftp.js — never under src/ (the
   prohibition test).

   Frozen phase decisions (99-CONTEXT D-01..D-04):
   - D-01: promise API mirroring ftp.js/s3.js — `await smb.write(
     path, buffer)`, `read(path)`, `rm(path)`, `echo()`,
     `connect()/close()`; NO frame-level API, NO event-emitter
     surface. Integrates into the 96-01 descriptor in phase 100
     without adaptation.
   - D-02: test strategy = pure golden vectors (RFC 1320 MD4 ×7,
     self-pinned NTLMv2 transcript, signing-key derivation) + a
     scripted in-process NBSS mock server. NO docker / samba e2e in
     99 — the real-server recipe belongs to phase 100.
   - D-03: the spike report is a formal 99-SPIKE.md (LOC, dialect
     surprises, SMB2-min-3.0 fleet exposure, go/no-go for 100).
   - D-04: NTLMv2 material scrub (V14 parity) — the type-3 message,
     NT/LMv2 response bytes and password-derived keys NEVER enter
     error text or logs; errors are plain Error objects with keyed
     `err.code` ('smb<Class>') + `err.smbClass` per the SC-3 closed
     9-enum.

   Auth model (planning_context resolution): NO-KEY_EXCH path —
   NTLMv2 SessionBaseKey is used DIRECTLY as the SMB2 session key
   input to deriveSigningKey (OQ-2, test-pinned). RC4 sealing is
   never attempted (node:crypto has no RC4; KEY_EXCH flag unset).

   Signing: unconditional HMAC-SHA256 (SC-2). SigningKey =
   HMAC-SHA256(SessionBaseKey, 'SMB2AESKey' ++ 0x00)[:16] per
   MS-SMB2 §3.1.5.2 (2.1 has no context-string KDF).

   Scrub rule (D-04 / T-99-02): errors are FIXED messages keyed on
   NTSTATUS; smbScrubMessage redacts NTLMSSP blob/hex material
   defensively; message text sliced (300 chars). No transcript
   parsing anywhere.

   Pure contract surface (golden-vector tested in
   test/backup-smb-crypto.test.mjs): md4 / ntlmHash / ntlmv2Hash /
   buildNtlmType1 / parseNtlmType2 / buildNtlmType3 / sessionBaseKey /
   deriveSigningKey / utf16le — plus the NBSS + SMB2 codecs and
   smbErrorFrom / smbScrubMessage.
   ===================================================================== */

import crypto from 'node:crypto';

/* ---- UTF-16LE helper (no BOM — MS-NLMP §3.3.2 identity encoding) ---- */
export function utf16le(s) {
  return Buffer.from(String(s), 'utf16le');
}

/* =====================================================================
   MD4 — hand-rolled (node:crypto md4 is unavailable on OpenSSL 3)
   =====================================================================
   RFC 1320 reference port. Traps honored (99-RESEARCH Pitfalls 1-3):
   - THREE per-round shift tables: R1 3/7/11/19, R2 3/5/9/13,
     R3 3/9/11/15 (never MD5's tables).
   - Round-2 word order 0,4,8,12,1,…; round-3 order 0,8,4,12,2,…
     (NOT the MD5 (4k+1)%16 trick).
   - The RFC's [ABCD k s] notation is ROLE-RELABELING: the register
     playing 'a' changes per step; values are NOT rotated.
   - Padding length field is LITTLE-ENDIAN 64-bit. */
const rotl = (x, c) => ((x << c) | (x >>> (32 - c))) >>> 0;

export function md4(bytes) {
  const input = Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes), 'utf8');
  let msg = Buffer.concat([input, Buffer.from([0x80])]);
  while (msg.length % 64 !== 56) msg = Buffer.concat([msg, Buffer.from([0])]);
  const lenBuf = Buffer.alloc(8);
  const bitLen = input.length * 8;
  lenBuf.writeUInt32LE(bitLen >>> 0, 0);
  lenBuf.writeUInt32LE(Math.floor(bitLen / 0x100000000), 4);
  const padded = Buffer.concat([msg, lenBuf]);

  const F = (x, y, z) => ((x & y) | (~x & z)) >>> 0;
  const G = (x, y, z) => ((x & y) | (x & z) | (y & z)) >>> 0;
  const H = (x, y, z) => (x ^ y ^ z) >>> 0;
  const K2 = 0x5a827999, K3 = 0x6ed9eba1;
  const R1 = [3, 7, 11, 19], R2 = [3, 5, 9, 13], R3 = [3, 9, 11, 15];
  const k2 = [0, 4, 8, 12, 1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15];
  const k3 = [0, 8, 4, 12, 2, 10, 6, 14, 1, 9, 5, 13, 3, 11, 7, 15];

  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;

  for (let i = 0; i < padded.length; i += 64) {
    const X = [];
    for (let j = 0; j < 16; j++) X.push(padded.readUInt32LE(i + j * 4));
    const AA = a, BB = b, CC = c, DD = d;
    const st = { a, b, c, d };

    /* Role cycle per RFC op list: [ABCD], [DABC], [CDAB], [BCDA].
       The updated register plays 'a'; F's operands are its three
       successors in the CURRENT register set (relabeling, not
       rotation). */
    const roles = [
      { w: 'a', args: () => [st.b, st.c, st.d] },
      { w: 'd', args: () => [st.a, st.b, st.c] },
      { w: 'c', args: () => [st.d, st.a, st.b] },
      { w: 'b', args: () => [st.c, st.d, st.a] },
    ];
    const step = (op, r, k, s, K) => {
      const v = (st[r.w] + op(...r.args()) + X[k] + K) >>> 0;
      st[r.w] = rotl(v, s);
    };

    for (let j = 0; j < 16; j++) step(F, roles[j % 4], j, R1[j % 4], 0);
    for (let j = 0; j < 16; j++) step(G, roles[j % 4], k2[j], R2[j % 4], K2);
    for (let j = 0; j < 16; j++) step(H, roles[j % 4], k3[j], R3[j % 4], K3);

    a = (st.a + AA) >>> 0;
    b = (st.b + BB) >>> 0;
    c = (st.c + CC) >>> 0;
    d = (st.d + DD) >>> 0;
  }

  const out = Buffer.alloc(16);
  [a, b, c, d].forEach((v, i) => out.writeUInt32LE(v, i * 4));
  return out;
}

/* =====================================================================
   NTLMv2 CRYPTO CHAIN (MS-NLMP §3.3.2, no-KEY_EXCH path)
   ===================================================================== */

/* NT hash = MD4(UTF-16LE(password)). */
export function ntlmHash(password) {
  return md4(utf16le(password));
}

/* NTLMv2 hash = HMAC-MD5(ntHash, UTF-16LE(UPPER(user) + domain)).
   user is UPPERCASED before concat; domain case-preserved; ALWAYS
   UTF-16LE regardless of negotiated OEM (Pitfall 9). */
export function ntlmv2Hash(user, domain, ntHashValue) {
  return crypto.createHmac('md5', ntHashValue)
    .update(utf16le(String(user).toUpperCase() + String(domain)))
    .digest();
}

/* SessionBaseKey = HMAC-MD5(ntlmv2Hash, NTProofStr). Used DIRECTLY
   as the SMB2 session key input (no-KEY_EXCH path, OQ-2). */
export function sessionBaseKey(ntlmv2HashValue, ntProofStr) {
  return crypto.createHmac('md5', ntlmv2HashValue).update(ntProofStr).digest();
}

/* Minimal Version-1 Type-1 (NEGOTIATE_MESSAGE): 16 bytes.
   Flags: Unicode | OEM | NTLM | AlwaysSign | NTLM2Key | 128.
   NO KEY_EXCH (0x40000000 — would need RC4) and NO 56-bit
   (0x80000000 — session key stays 128-bit). */
export function buildNtlmType1() {
  const msg = Buffer.alloc(16);
  msg.write('NTLMSSP\0', 0, 'latin1');
  msg.writeUInt32LE(1, 8);
  msg.writeUInt32LE(
    0x00000001 | // Negotiate Unicode
    0x00000002 | // Negotiate OEM
    0x00000200 | // Negotiate NTLM
    0x00008000 | // Negotiate Always Sign
    0x00080000 | // Negotiate NTLM2 Key
    0x20000000,  // Negotiate 128
    12,
  );
  return msg;
}

/* Parse the server's Type-2 (CHALLENGE_MESSAGE) security buffers.
   TargetInfo is returned VERBATIM (AV_PAIR sequence is echoed
   unmodified per MS-NLMP — never rebuilt). */
export function parseNtlmType2(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 48 ||
      buf.subarray(0, 8).toString('latin1') !== 'NTLMSSP\0' ||
      buf.readUInt32LE(8) !== 2) {
    const err = new Error('smb: invalid NTLM type-2 challenge message');
    err.code = 'smbGeneric';
    err.smbClass = 'generic';
    throw err;
  }
  const flags = buf.readUInt32LE(20);
  const serverChallenge = Buffer.from(buf.subarray(24, 32));
  const tiLen = buf.readUInt16LE(40);
  const tiOff = buf.readUInt32LE(44);
  const targetInfo = Buffer.from(buf.subarray(tiOff, tiOff + tiLen));
  return { flags, serverChallenge, targetInfo };
}

/* Build the Type-3 (AUTHENTICATE_MESSAGE) Version-2 layout with the
   data block at offset 64 (LM/NT/user/workstation descriptors +
   flags; no session-key buffer — the key never travels). The NT
   response field is byte-exact NTProofStr ++ blob; TargetInfo is
   echoed verbatim from the parsed type-2. */
export function buildNtlmType3(type2, user, domain, password, clientChallenge, timestamp) {
  const ntHash = ntlmHash(password);
  const v2hash = ntlmv2Hash(user, domain, ntHash);
  const challenge = type2.serverChallenge;
  const targetInfo = type2.targetInfo;

  const blob = Buffer.concat([
    Buffer.from([0x01, 0x01, 0x00, 0x00]),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
    timestamp,                       // 8 bytes, 100ns since 1601 (LE)
    clientChallenge,                 // 8 bytes
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
    targetInfo,                      // verbatim from type-2
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
  ]);
  const ntProofStr = crypto.createHmac('md5', v2hash)
    .update(Buffer.concat([challenge, blob])).digest();
  const ntResponse = Buffer.concat([ntProofStr, blob]);
  const lmv2 = Buffer.concat([
    crypto.createHmac('md5', v2hash)
      .update(Buffer.concat([challenge, clientChallenge])).digest(),
    clientChallenge,
  ]);
  const sbk = sessionBaseKey(v2hash, ntProofStr);

  const workstation = Buffer.alloc(0);
  const userName = utf16le(user);
  const lmOff = 64;
  const ntOff = lmOff + lmv2.length;
  const userOff = ntOff + ntResponse.length;
  const wsOff = userOff + userName.length;
  const dataLen = lmv2.length + ntResponse.length + userName.length + workstation.length;

  const msg = Buffer.alloc(64 + dataLen);
  msg.write('NTLMSSP\0', 0, 'latin1');
  msg.writeUInt32LE(3, 8);
  /* security buffer descriptors: len(2) alloc(2) offset(4);
     LM @12, NT @24, user @36, workstation @48, flags @60 → data @64 */
  msg.writeUInt16LE(lmv2.length, 12); msg.writeUInt16LE(lmv2.length, 14); msg.writeUInt32LE(lmOff, 16);
  msg.writeUInt16LE(ntResponse.length, 24); msg.writeUInt16LE(ntResponse.length, 26); msg.writeUInt32LE(ntOff, 28);
  msg.writeUInt16LE(userName.length, 36); msg.writeUInt16LE(userName.length, 38); msg.writeUInt32LE(userOff, 40);
  msg.writeUInt16LE(workstation.length, 48); msg.writeUInt16LE(workstation.length, 50); msg.writeUInt32LE(wsOff, 52);
  msg.writeUInt32LE(
    0x00000001 | // Negotiate Unicode (mirrors the negotiated bit)
    0x00000002 |
    0x00000200 |
    0x00008000 |
    0x00080000 |
    0x20000000,
    60,
  );
  let off = 64;
  lmv2.copy(msg, off); off += lmv2.length;
  ntResponse.copy(msg, off); off += ntResponse.length;
  userName.copy(msg, off); off += userName.length;
  workstation.copy(msg, off);

  return { message: msg, ntlmv2Hash: v2hash, blob, ntProofStr, lmv2, sessionBaseKey: sbk };
}

/* SMB2 signing key (MS-SMB2 §3.1.5.2, SMB 2.1): HMAC-SHA256 over the
   literal label 'SMB2AESKey' ++ 0x00, first 16 bytes. */
export function deriveSigningKey(sessionKey) {
  return crypto.createHmac('sha256', sessionKey)
    .update(Buffer.concat([Buffer.from('SMB2AESKey', 'latin1'), Buffer.from([0x00])]))
    .digest().subarray(0, 16);
}
