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
import net from 'node:net';

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

/* =====================================================================
   NBSS + SMB2 FRAME CODECS (MS-SMB2 §2.1/§2.2.1.1/§2.2.1.2)
   =====================================================================
   NBSS: 4-byte BIG-ENDIAN header — type, flags, 17-bit length
   (≤ 0x1FFFF; NO Multi-Protocol-Reply negotiation — overflow is a
   keyed generic protocol violation, T-99-01).
   SMB2 header: 64-byte LITTLE-ENDIAN, spec field layout:
     0  ProtocolId FE 53 4D 42      4  StructureSize 64
     6  CreditCharge                8  Status
     12 Command (u16)               14 Credits (u16)
     16 Flags (SIGNED 0x8, ASYNC 0x2, REPLY 0x1)
     20 NextCommand (0 — no compounding)
     24 MessageId (u64)             32 AsyncId (async) / Reserved
     36 TreeId                      40 SessionId (u64)
     48 Signature (16)                                     */
const NBSS_MAX_LENGTH = 0x1ffff;

function nbssViolation(message) {
  const err = new Error(`smb: ${message}`);
  err.code = 'smbGeneric';
  err.smbClass = 'generic';
  return err;
}

export function encodeNbssHeader(type, length) {
  if (!Number.isInteger(length) || length < 0 || length > NBSS_MAX_LENGTH) {
    throw nbssViolation(`NBSS length ${length} exceeds the 17-bit maximum (${NBSS_MAX_LENGTH})`);
  }
  const h = Buffer.alloc(4);
  h[0] = type & 0xff;
  h[1] = length > 0xffff ? 0x01 : 0x00; // bit 0 = 17th length bit (RFC 1002)
  h.writeUInt16BE(length & 0xffff, 2);
  return h;
}

/* Pure feed-accumulating frame parser (ftp.js createReplyState idiom,
   translated to byte counts). buffer-in → {frames, consumed}-out;
   never crashes on partial input; one frame per length prefix. */
export function createFrameParser() {
  let buf = Buffer.alloc(0);
  let consumedTotal = 0;
  return {
    feed(chunk) {
      buf = Buffer.concat([buf, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
      const frames = [];
      let consumed = 0;
      while (buf.length - consumed >= 4) {
        const type = buf[consumed];
        const flags = buf[consumed + 1];
        const length = ((flags & 0x01) << 16) | buf.readUInt16BE(consumed + 2);
        if (length > NBSS_MAX_LENGTH) throw nbssViolation('NBSS length exceeds the 17-bit maximum');
        if (buf.length - consumed < 4 + length) break; // partial frame — keep accumulating
        frames.push({
          type,
          flags,
          payload: Buffer.from(buf.subarray(consumed + 4, consumed + 4 + length)),
        });
        consumed += 4 + length;
      }
      consumedTotal += consumed;
      buf = buf.subarray(consumed);
      return { frames, consumed: consumedTotal };
    },
  };
}

/* NBSS session request (type 0x81): 1-byte length prefix + 32-byte
   uppercase padded called/calling names (firstNetBIOS style). The
   client expects 0x82 (positive) / 0x83 (negative) — checked by the
   session engine in 99-02. */
export function encodeNbssSessionRequest(calledName = '*SMBSERVER', callingName = 'GR8R') {
  const pad32 = (s) => Buffer.from(String(s).toUpperCase().slice(0, 32).padEnd(32, ' '), 'latin1');
  return Buffer.concat([Buffer.from([32]), pad32(calledName), Buffer.from([32]), pad32(callingName)]);
}

/* SMB2 64-byte header codec. messageId/sessionId/asyncId are BigInt
   (u64); signature is a 16-byte Buffer (zeros = unsigned). */
export function encodeSmb2Header({
  command = 0, creditCharge = 0, status = 0, credits = 1, flags = 0,
  nextCommand = 0, messageId = 0n, asyncId = 0n, treeId = 0,
  sessionId = 0n, signature = null,
} = {}) {
  const h = Buffer.alloc(64);
  h[0] = 0xfe; h[1] = 0x53; h[2] = 0x4d; h[3] = 0x42; // FE 'S' 'M' 'B'
  h.writeUInt16LE(64, 4);
  h.writeUInt16LE(creditCharge, 6);
  h.writeUInt32LE(status >>> 0, 8);
  h.writeUInt16LE(command & 0xffff, 12);
  h.writeUInt16LE(credits & 0xffff, 14);
  h.writeUInt32LE(flags >>> 0, 16);
  h.writeUInt32LE(nextCommand >>> 0, 20);
  h.writeBigUInt64LE(BigInt(messageId), 24);
  h.writeBigUInt64LE(BigInt(asyncId), 32);
  h.writeUInt32LE(treeId >>> 0, 36);
  h.writeBigUInt64LE(BigInt(sessionId), 40);
  if (signature) signature.copy(h, 48);
  return h;
}

export function decodeSmb2Header(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 64 ||
      buf[0] !== 0xfe || buf[1] !== 0x53 || buf[2] !== 0x4d || buf[3] !== 0x42) {
    throw nbssViolation('not an SMB2 frame (bad ProtocolId)');
  }
  return {
    structureSize: buf.readUInt16LE(4),
    creditCharge: buf.readUInt16LE(6),
    status: buf.readUInt32LE(8),
    command: buf.readUInt16LE(12),
    credits: buf.readUInt16LE(14),
    flags: buf.readUInt32LE(16),
    nextCommand: buf.readUInt32LE(20),
    messageId: buf.readBigUInt64LE(24),
    asyncId: buf.readBigUInt64LE(32),
    treeId: buf.readUInt32LE(36),
    sessionId: buf.readBigUInt64LE(40),
    signature: Buffer.from(buf.subarray(48, 64)),
  };
}

/* =====================================================================
   KEYED ERROR FACTORY + SCRUB (D-04, SC-3 closed 9-enum, T-99-02)
   =====================================================================
   smbErrorFrom(statusOrErrno, context) → plain Error carrying
   err.code ('smb<Class>') + err.smbClass. Messages are FIXED text
   keyed on the class (no transcript parsing anywhere); context
   passes through smbScrubMessage (NTLMSSP blobs / password-derived
   hex are redacted defensively) and is sliced to 300 chars.
   String sentinels: 'SMB_SIGNING_REFUSED' → signingRequired;
   'SMB_DIALECT_UNSUPPORTED' → generic + code smbDialectUnsupported
   (OQ-3 adopted resolution: the two refusal paths stay distinct).
   Errno strings (ECONNREFUSED/ETIMEDOUT/EHOSTUNREACH) → unreachable. */
export const SMB_ERROR_CLASSES = {
  0xc000006d: 'authFailed',        // STATUS_LOGON_FAILED
  0xc000006a: 'authFailed',        // STATUS_WRONG_PASSWORD
  0xc0000064: 'authFailed',        // STATUS_NO_SUCH_USER
  0xc00000cc: 'shareNotFound',     // STATUS_BAD_NETWORK_NAME
  0xc0000022: 'treeConnectFailed', // STATUS_ACCESS_DENIED
  0xc0000035: 'nameConflict',      // STATUS_OBJECT_NAME_COLLISION
  0xc000007f: 'noSpace',           // STATUS_DISK_FULL
  0xc0000044: 'noSpace',           // STATUS_QUOTA_EXCEEDED
  0xc000005a: 'sessionExpired',    // STATUS_NETWORK_SESSION_EXPIRED
};

const SMB_CLASS_MESSAGES = {
  authFailed: 'smb authentication failed (logon rejected)',
  shareNotFound: 'smb share not found (bad network name)',
  treeConnectFailed: 'smb tree connect failed (access denied)',
  nameConflict: 'smb object name collision',
  noSpace: 'smb target out of space (disk full or quota exceeded)',
  unreachable: 'smb server unreachable (transport error)',
  sessionExpired: 'smb session expired',
  signingRequired: 'smb server refused the signing agreement',
  generic: 'smb protocol error',
};

/* V14-parity scrub (D-04 / T-99-02): redact NTLMSSP blob material and
   password-derived hex defensively, then slice. Fixed semantics — no
   transcript parsing. */
export function smbScrubMessage(text) {
  let s = String(text ?? '')
    .replace(/NTLMSSP[\s\S]*$/g, '***')
    .replace(/[0-9a-fA-F]{32,}/g, '***');
  s = s.slice(0, 300);
  return s;
}

export function smbErrorFrom(statusOrErrno, context = '') {
  let smbClass = 'generic';
  let code = 'smbGeneric';

  if (statusOrErrno === 'SMB_SIGNING_REFUSED') {
    smbClass = 'signingRequired';
    code = 'smbSigningRequired';
  } else if (statusOrErrno === 'SMB_DIALECT_UNSUPPORTED') {
    smbClass = 'generic';
    code = 'smbDialectUnsupported'; // OQ-3: NOT signingRequired
  } else if (['ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH'].includes(statusOrErrno)) {
    smbClass = 'unreachable';
    code = 'smbUnreachable';
  } else if (typeof statusOrErrno === 'number') {
    smbClass = SMB_ERROR_CLASSES[statusOrErrno >>> 0] || 'generic';
    code = `smb${smbClass.charAt(0).toUpperCase()}${smbClass.slice(1)}`;
  }

  const err = new Error(smbScrubMessage(`${SMB_CLASS_MESSAGES[smbClass]}${context ? ` — ${context}` : ''}`));
  err.code = code;
  err.smbClass = smbClass;
  if (typeof statusOrErrno === 'number') err.smbStatus = statusOrErrno >>> 0;
  return err;
}

/* =====================================================================
   SESSION ENGINE + PROMISE CLIENT (99-02) — D-01 surface
   =====================================================================
   Strictly serial, one-command-in-flight (ftp.js discipline translated
   to NBSS frames). Every post-NEGOTIATE request is SIGNED (SC-2); the
   single dispatch point verifies a reply signature (when the SIGNED
   flag is set) BEFORE MessageId correlation and promise resolution —
   mismatch = protocol violation → destroy + keyed generic (T-99-03).

   Wire-format provenance: SMB2 request/reply body struct offsets below
   follow MS-SMB2 §2.2.x layouts (NEGOTIATE §2.2.3, SESSION_SETUP
   §2.2.5, TREE_CONNECT §2.2.9, CREATE §2.2.13/14, READ §2.2.19/20,
   WRITE §2.2.21/22, CLOSE §2.2.15/16, ECHO §2.2.28, TREE_DISCONNECT
   §2.2.11, LOGOFF §2.2.7). The scripted mock (test/backup-smb-client)
   encodes/decodes the same structs — byte-consistency is what the
   mock integration pins; real-server byte truth is phase 100 e2e.

   Transport discipline per ftp.js:242-270 — socket.setTimeout arms
   per pending command; the timeout handler destroys and rejects keyed
   unreachable; error/close reject pending unreachable. A reply with
   the ASYNC flag (STATUS_PENDING interlude) keeps the command waiting
   — correlation stays on MessageId.
   ===================================================================== */

/* OQ-1 (D-03 parity with FTP_NOOP_INTERVAL_S): keep-alive ECHO every
   60s — a const, NOT env. */
export const SMB_ECHO_INTERVAL_S = 60;

/* Serial WRITE chunk cap: 60,416 bytes (0xEC00) — the classic safe
   WRITE payload size below the 64KB struct+data limit (research §6). */
export const SMB_MAX_WRITE_BYTES = 60416;

/* Dialects offered (SC-1): SMB 2.1 first, SMB 2.0.2 fallback. NEVER
   0x0300+ (SMB3 deferred per D-03/spike scope). */
export const SMB_DIALECTS_OFFERED = [0x0210, 0x0202];

/* SMB2 command codes (MS-SMB2 §2.2.1.2 Command). */
export const SMB2_COM = {
  NEGOTIATE: 0x0000,
  SESSION_SETUP: 0x0001,
  LOGOFF: 0x0002,
  TREE_CONNECT: 0x0003,
  TREE_DISCONNECT: 0x0004,
  CREATE: 0x0006,
  READ: 0x0008,
  WRITE: 0x0009,
  ECHO: 0x000b,
  CLOSE: 0x000c,
};

const STATUS_MORE_PROCESSING_REQUIRED = 0xc0000016;
const STATUS_SESSION_EXPIRED = 0xc000005a;
const SMB2_HDR_FLAGS_REPLY = 0x1;
const SMB2_HDR_FLAGS_ASYNC = 0x2;
const SMB2_HDR_FLAGS_SIGNED = 0x8;

/* Signing: HMAC-SHA256 over the full frame with the Signature field
   zeroed; first 16 digest bytes go at header offset 48 (research §5). */
function signFrame(signingKey, frame) {
  const scratch = Buffer.from(frame);
  scratch.fill(0, 48, 64);
  const sig = crypto.createHmac('sha256', signingKey).update(scratch).digest();
  sig.copy(frame, 48, 0, 16);
  return frame;
}

function verifyFrameSignature(signingKey, frame) {
  const scratch = Buffer.from(frame);
  scratch.fill(0, 48, 64);
  const expected = crypto.createHmac('sha256', signingKey).update(scratch).digest().subarray(0, 16);
  return expected.equals(frame.subarray(48, 64));
}

/* Keyed generic protocol error (scrub applied like every smbErrorFrom
   path — D-04). */
function genericError(context) {
  const err = new Error(smbScrubMessage(`smb protocol error${context ? ` — ${context}` : ''}`));
  err.code = 'smbGeneric';
  err.smbClass = 'generic';
  return err;
}

/* ---------------------------------------------------------------------
   REQUEST BODY BUILDERS (spec structs; offsets from the frame start
   for variable-length buffers — SecurityBufferOffset/NameOffset etc.
   are frame-relative per MS-SMB2; body-relative = offset − 64).
   --------------------------------------------------------------------- */

/* NEGOTIATE (§2.2.3): offer {0x0210, 0x0202}, SecurityMode 0x00000003
   (SIGNING_ENABLED | SIGNING_REQUIRED — SC-2 posture advertisement). */
function buildNegotiateRequest() {
  const body = Buffer.alloc(36 + 2 + SMB_DIALECTS_OFFERED.length * 2);
  body.writeUInt16LE(36, 0);                      // StructureSize
  body.writeUInt16LE(0x0003, 2);                  // SecurityMode
  body.writeUInt16LE(0, 4);                       // Reserved
  body.writeUInt32LE(0, 6);                       // Capabilities
  const guid = Buffer.from(crypto.randomUUID().replace(/-/g, ''), 'hex');
  guid.copy(body, 8);                             // ClientGuid @8 (16 bytes)
  body.writeBigUInt64LE(0n, 24);                  // ClientStartTime
  body.writeUInt16LE(SMB_DIALECTS_OFFERED.length, 32); // DialectCount
  SMB_DIALECTS_OFFERED.forEach((d, i) => body.writeUInt16LE(d, 34 + i * 2));
  return body;
}

/* SESSION_SETUP (§2.2.5): 24-byte fixed struct + security buffer at
   frame offset 88 (64 header + 24 struct). */
function buildSessionSetupRequest(securityBuffer) {
  const bufOff = 64 + 24;
  const body = Buffer.alloc(24 + securityBuffer.length);
  body.writeUInt16LE(25, 0);                      // StructureSize
  body.writeUInt8(0, 2);                          // VcNumber
  body.writeUInt8(0x0003 & 0xff, 3);              // SecurityMode (byte field)
  body.writeUInt32LE(0, 4);                       // Capabilities
  body.writeUInt32LE(0, 8);                       // Channel
  body.writeUInt16LE(bufOff, 12);                 // SecurityBufferOffset
  body.writeUInt16LE(securityBuffer.length, 14);  // SecurityBufferLength
  body.writeBigUInt64LE(0n, 16);                  // PreviousSessionId
  securityBuffer.copy(body, 24);
  return body;
}

/* TREE_CONNECT (§2.2.9): 8-byte struct + UTF-16LE share path. */
function buildTreeConnectRequest(sharePath) {
  const name = utf16le(sharePath);
  const body = Buffer.alloc(8 + name.length);
  body.writeUInt16LE(9, 0);                       // StructureSize
  body.writeUInt16LE(0, 2);                       // Reserved
  body.writeUInt16LE(64 + 8, 4);                  // PathOffset
  body.writeUInt16LE(name.length, 6);             // PathLength
  name.copy(body, 8);
  return body;
}

/* CREATE (§2.2.13): 56-byte fixed struct + name buffer at frame
   offset 120 (64 + 56). */
function buildCreateRequest(name, { access, disposition, createOptions = 0 }) {
  const nameBuf = utf16le(name);
  const body = Buffer.alloc(56 + nameBuf.length);
  body.writeUInt16LE(57, 0);                      // StructureSize
  body.writeUInt8(0, 2);                          // SecurityFlags
  body.writeUInt8(0, 3);                          // RequestedOplockLevel
  body.writeUInt32LE(0, 4);                       // ImpersonationLevel
  body.writeBigUInt64LE(0n, 8);                   // SmbCreateFlags
  body.writeBigUInt64LE(0n, 16);                  // Reserved
  body.writeUInt32LE(access, 24);                 // DesiredAccess
  body.writeUInt32LE(0, 28);                      // FileAttributes
  body.writeUInt32LE(0, 32);                      // ShareAccess
  body.writeUInt32LE(disposition, 36);            // CreateDisposition
  body.writeUInt32LE(createOptions, 40);          // CreateOptions
  body.writeUInt16LE(64 + 56, 44);                // NameOffset
  body.writeUInt16LE(nameBuf.length, 46);         // NameLength
  body.writeUInt32LE(0, 48);                      // CreateContextsOffset
  body.writeUInt32LE(0, 52);                      // CreateContextsLength
  nameBuf.copy(body, 56);
  return body;
}

/* WRITE (§2.2.21): 44-byte struct + data at frame offset 108
   (64 + 44). */
function buildWriteRequest(fileId, chunk, offset) {
  const body = Buffer.alloc(44 + chunk.length);
  body.writeUInt16LE(49, 0);                      // StructureSize
  body.writeUInt16LE(64 + 44, 2);                 // DataOffset
  body.writeUInt32LE(chunk.length, 4);            // Length
  body.writeBigUInt64LE(BigInt(offset), 8);       // Offset (u64)
  body.writeUInt32LE(0, 16);                      // Channel
  fileId.copy(body, 20);                          // FileId (16)
  body.writeUInt16LE(0, 36);                      // ChannelInfoOffset
  body.writeUInt16LE(0, 38);                      // ChannelInfoLength
  body.writeUInt32LE(0, 40);                      // Flags
  chunk.copy(body, 44);
  return body;
}

/* READ (§2.2.19): 48-byte struct, no inline data. */
function buildReadRequest(fileId, length, offset) {
  const body = Buffer.alloc(48);
  body.writeUInt16LE(49, 0);                      // StructureSize
  body.writeUInt8(0, 2);                          // Padding
  body.writeUInt8(0, 3);                          // Reserved
  body.writeUInt32LE(length, 4);                  // Length
  body.writeBigUInt64LE(BigInt(offset), 8);       // Offset (u64)
  fileId.copy(body, 16);                          // FileId (16)
  body.writeUInt32LE(0, 32);                      // MinimumCount
  body.writeUInt32LE(0, 36);                      // Channel
  body.writeUInt32LE(0, 40);                      // RemainingBytes
  body.writeUInt16LE(0, 44);                      // ReadChannelInfoOffset
  body.writeUInt16LE(0, 46);                      // ReadChannelInfoLength
  return body;
}

/* CLOSE (§2.2.15): 24-byte struct with the FileId inline. */
function buildCloseRequest(fileId) {
  const body = Buffer.alloc(24);
  body.writeUInt16LE(24, 0);                      // StructureSize
  body.writeUInt16LE(0, 2);                       // Flags
  body.writeUInt32LE(0, 4);                       // Reserved
  fileId.copy(body, 8);                           // FileId (16)
  return body;
}

/* ECHO / TREE_DISCONNECT / LOGOFF: bare StructureSize bodies. */
const buildEchoRequest = () => Buffer.from([0x04, 0x00]);
const buildTreeDisconnectRequest = () => Buffer.from([0x04, 0x00]);
const buildLogoffRequest = () => Buffer.from([0x04, 0x00]);

/* 100ns-ticks since 1601-01-01 (LE u64) for the NTLMv2 blob. */
function ntTimestamp() {
  return (BigInt(Date.now()) + 11644473600000n) * 10000n;
}

/* CREATE access masks / dispositions / options (MS-SMB2 §2.2.13 /
   §2.2.94). GENERIC masks are the safest against Samba ACL checks. */
const GENERIC_READ = 0x80000000;
const GENERIC_WRITE = 0x40000000;
const DELETE_ACCESS = 0x00010000;
const FILE_OPEN_IF = 0x00000001;
const FILE_DELETE_ON_CLOSE = 0x00001000;

/* Reply-body parsers (spec structs; see provenance in the engine
   header). CREATE: FileId (16 bytes) at body offset 64 (§2.2.14.2).
   WRITE: Count u32 at body offset 4 (§2.2.22). READ: DataOffset u16@2,
   DataLength u32@4 (§2.2.20) — data at frame offset DataOffset. */
function fileIdFromCreateReply(body) {
  return Buffer.from(body.subarray(64, 80));
}
function countFromWriteReply(body) {
  return body.readUInt32LE(4);
}
function dataFromReadReply(res) {
  const dataOffset = res.body.readUInt16LE(2);
  const dataLength = res.body.readUInt32LE(4);
  return res.frame.subarray(dataOffset, dataOffset + dataLength);
}

/* ---------------------------------------------------------------------
   SESSION ENGINE (one command in flight; verify-before-dispatch)
   --------------------------------------------------------------------- */

const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;

function createSession(socket, config, opts) {
  const s = {
    socket,
    parser: createFrameParser(),
    config,
    opts,
    pending: null,          // { messageId, resolve, reject }
    messageId: 0n,
    sessionId: 0n,
    treeId: 0,
    signingKey: null,
    sessionExpiredCount: 0, // lifetime cap 2 (retry envelope, Task 3)
    closed: false,
    fatal: null,
    echoTimer: null,
    echoInFlight: false,
  };
  return s;
}

function failPending(s, err) {
  const p = s.pending;
  if (s.pending === p) s.pending = null;
  if (!p) return;
  try { p.reject(err); } catch { /* already settled */ }
}

/* Single dispatch point (T-99-03): verify → correlate → resolve. */
function handleFrame(s, frame) {
  let hdr;
  try {
    hdr = decodeSmb2Header(frame);
  } catch {
    protocolViolation(s, 'not an SMB2 frame');
    return;
  }
  if ((hdr.flags & SMB2_HDR_FLAGS_SIGNED) !== 0) {
    if (!s.signingKey || !verifyFrameSignature(s.signingKey, frame)) {
      protocolViolation(s, 'reply signature verification failed (verify-before-dispatch)');
      return;
    }
  }
  /* STATUS_PENDING interlude (ASYNC flag): keep the command waiting —
     MessageId stays the correlation key; the final sync reply resolves. */
  if ((hdr.flags & SMB2_HDR_FLAGS_ASYNC) !== 0) return;
  const p = s.pending;
  if (!p) return; // stray reply — swallowed (echo-keep-alive parity)
  if (hdr.messageId !== p.messageId) {
    protocolViolation(s, `MessageId correlation failure (expected ${p.messageId}, got ${hdr.messageId})`);
    return;
  }
  s.pending = null;
  s.socket.setTimeout(0);
  try { p.resolve({ header: hdr, body: frame.subarray(64), frame }); } catch { /* settled */ }
}

function protocolViolation(s, why) {
  const err = genericError(why);
  s.fatal = s.fatal || err;
  try { s.socket.destroy(); } catch { /* gone */ }
  failPending(s, err);
}

function bindTransport(s) {
  s.socket.on('data', (chunk) => {
    let frames;
    try {
      ({ frames } = s.parser.feed(chunk));
    } catch (e) {
      protocolViolation(s, e?.message || 'NBSS framing violation');
      return;
    }
    for (const f of frames) handleFrame(s, f.payload);
  });
  s.socket.on('timeout', () => {
    /* Node does NOT destroy on 'timeout' — we own the destroy (P1 parity). */
    const p = s.pending;
    try { s.socket.destroy(); } catch { /* gone */ }
    failPending(s, p ? smbErrorFrom('ETIMEDOUT', 'timed out waiting for an SMB2 reply') : undefined);
  });
  s.socket.on('error', (err) => {
    s.fatal = s.fatal || smbErrorFrom(err?.code || 'ECONNREFUSED', `transport error: ${String(err?.code ?? '')}`);
    failPending(s, s.fatal);
    try { s.socket.destroy(); } catch { /* gone */ }
  });
  s.socket.on('close', () => {
    s.closed = true;
    if (s.echoTimer) clearInterval(s.echoTimer);
    failPending(s, s.fatal || smbErrorFrom('ECONNREFUSED', 'connection closed by the server'));
  });
}

/* Send one signed request; resolve with the correlated reply. */
function sendRequest(s, command, body, { signed = true, context = '' } = {}) {
  return new Promise((resolve, reject) => {
    if (s.pending) {
      reject(genericError('a command is already in flight (one-command-in-flight discipline)'));
      return;
    }
    if (s.fatal || s.closed) {
      reject(s.fatal || smbErrorFrom('ECONNREFUSED', 'connection is closed'));
      return;
    }
    const messageId = s.messageId++;
    const header = encodeSmb2Header({
      command,
      credits: 1,
      messageId,
      treeId: s.treeId,
      sessionId: s.sessionId,
    });
    const frame = Buffer.concat([header, body]);
    if (signed && s.signingKey) {
      frame.writeUInt32LE(frame.readUInt32LE(16) | SMB2_HDR_FLAGS_SIGNED, 16);
      signFrame(s.signingKey, frame);
    }
    s.pending = { messageId, resolve, reject };
    s.socket.setTimeout(s.opts.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS);
    s.socket.write(encodeNbssHeader(0x00, frame.length));
    s.socket.write(frame);
  });
}

/* Reject non-zero statuses keyed (except the sessionExpired envelope,
   which its callers own). */
function expectOk(res, context) {
  if (res.header.status !== 0) throw smbErrorFrom(res.header.status, context);
  return res;
}

/* ---------------------------------------------------------------------
   HANDSHAKE (dial → NBSS 0x81/0x82 → NEGOTIATE → SESSION_SETUP×2 →
   TREE_CONNECT) and the re-auth round (sessionExpired envelope).
   --------------------------------------------------------------------- */

async function negotiate(s) {
  const res = await sendRequest(s, SMB2_COM.NEGOTIATE, buildNegotiateRequest(), { signed: false, context: 'negotiate' });
  if (res.header.status !== 0) throw smbErrorFrom(res.header.status, 'negotiate');
  const dialect = res.body.readUInt16LE(4);
  if (!SMB_DIALECTS_OFFERED.includes(dialect)) {
    try { s.socket.destroy(); } catch { /* gone */ }
    throw smbErrorFrom('SMB_DIALECT_UNSUPPORTED', `server selected dialect 0x${dialect.toString(16).padStart(4, '0')} (only 2.0.2/2.1 offered)`);
  }
  const securityMode = res.body.readUInt16LE(2);
  if ((securityMode & 0x0001) === 0) {
    /* SC-2 unconditional signing: a server that refuses signing is
       outside the supported envelope — abort keyed (T-99-05). */
    try { s.socket.destroy(); } catch { /* gone */ }
    throw smbErrorFrom('SMB_SIGNING_REFUSED', 'server did not negotiate SMB2 signing');
  }
  if ((res.header.credits ?? 0) < 1) throw genericError('server granted zero credits at negotiate');
  return dialect;
}

/* One full NTLMv2 SESSION_SETUP round (type-1 → type-2 → type-3).
   Reused verbatim by the sessionExpired retry envelope (Task 3): the
   same transport, a fresh NTProofStr (fresh client challenge), and a
   fresh signing key. */
async function sessionAuthRound(s) {
  const res1 = await sendRequest(s, SMB2_COM.SESSION_SETUP, buildSessionSetupRequest(buildNtlmType1()), { signed: false, context: 'session setup (type-1)' });
  if (res1.header.status !== STATUS_MORE_PROCESSING_REQUIRED) {
    if (res1.header.status !== 0) throw smbErrorFrom(res1.header.status, 'session setup (type-1)');
    throw genericError('server accepted the type-1 without an NTLM challenge');
  }
  s.sessionId = res1.header.sessionId;
  const bufOff = res1.body.readUInt16LE(4);
  const bufLen = res1.body.readUInt16LE(6);
  const type2 = parseNtlmType2(res1.frame.subarray(bufOff, bufOff + bufLen));
  const type3 = buildNtlmType3(
    type2,
    s.config.user,
    s.config.domain ?? '',
    s.config.password,
    crypto.randomBytes(8),
    (() => { const b = Buffer.alloc(8); b.writeBigUInt64LE(ntTimestamp()); return b; })(),
  );
  /* Derive the signing key BEFORE the type-3 goes out — the round-2
     SESSION_SETUP is the first signed request on the wire. */
  s.signingKey = deriveSigningKey(type3.sessionBaseKey);
  const res2 = await sendRequest(s, SMB2_COM.SESSION_SETUP, buildSessionSetupRequest(type3.message), { signed: true, context: 'session setup (type-3)' });
  if (res2.header.status !== 0) throw smbErrorFrom(res2.header.status, 'session setup (type-3)');
  s.sessionId = res2.header.sessionId;
}

async function treeConnect(s) {
  const res = await runWithExpiry(
    s,
    () => sendRequest(s, SMB2_COM.TREE_CONNECT, buildTreeConnectRequest(s.config.share), { context: 'tree connect' }),
    'tree connect',
  );
  expectOk(res, 'tree connect');
  s.treeId = res.header.treeId;
}

/* ---------------------------------------------------------------------
   sessionExpired RETRY ENVELOPE (T-99-04)
   ---------------------------------------------------------------------
   On STATUS_NETWORK_SESSION_EXPIRED (0xC000005A): discard the reply,
   re-run SESSION_SETUP (NTLMv2) on the SAME transport, replay the
   failed command ONCE with a FRESH MessageId. WRITE chains resume
   from the failed chunk's offset — never restart from 0 (the offset
   lives in the caller's loop, not in the replay). Caps: 1 replay per
   command (structural — the envelope replays exactly once) and
   2 per session lifetime; at the cap the error surfaces keyed as
   smbClass sessionExpired (pitfall 6 replay-storm defense). */

async function runWithExpiry(s, runOnce, context) {
  const res = await runOnce();
  if (res.header.status !== STATUS_SESSION_EXPIRED) return res;
  if (s.sessionExpiredCount >= 2) throw smbErrorFrom(STATUS_SESSION_EXPIRED, context);
  s.sessionExpiredCount++;
  await sessionAuthRound(s);   // fresh NTLMv2 on the SAME transport
  const replay = await runOnce(); // fresh MessageId (new sendRequest)
  if (replay.header.status === STATUS_SESSION_EXPIRED) {
    throw smbErrorFrom(STATUS_SESSION_EXPIRED, context);
  }
  return replay;
}

/* ---------------------------------------------------------------------
   COMMAND LAYER (serial, offset-tracked) — D-01 surface bodies
   --------------------------------------------------------------------- */

async function createFile(s, name, { access, disposition, createOptions = 0 }) {
  const res = await runWithExpiry(
    s,
    () => sendRequest(s, SMB2_COM.CREATE, buildCreateRequest(name, { access, disposition, createOptions }), { context: `create ${name}` }),
    `create ${name}`,
  );
  expectOk(res, `create ${name}`);
  if ((res.header.credits ?? 0) < 1) throw genericError(`server granted zero credits on CREATE ${name}`);
  return fileIdFromCreateReply(res.body);
}

/* Serial WRITE×N: ≤60KB chunks, Offset advances by the bytes the
   server ACKNOWLEDGED (Count from the reply) — a partial final write
   re-issues from the un-acked offset; the chain never skips or repeats
   acknowledged bytes. WRITE chains never restart from 0. */
async function writeFile(s, fileId, buffer) {
  let offset = 0;
  while (offset < buffer.length) {
    const chunk = buffer.subarray(offset, offset + SMB_MAX_WRITE_BYTES);
    /* The closure pins THIS chunk's offset: an expiry replays the same
       offset after re-auth — never chunk 0. */
    const res = await runWithExpiry(
      s,
      () => sendRequest(s, SMB2_COM.WRITE, buildWriteRequest(fileId, chunk, offset), { context: `write at offset ${offset}` }),
      `write at offset ${offset}`,
    );
    expectOk(res, `write at offset ${offset}`);
    if ((res.header.credits ?? 0) < 1) throw genericError('server granted zero credits on WRITE');
    const count = countFromWriteReply(res.body);
    if (count <= 0 || count > chunk.length) {
      throw genericError(`WRITE acknowledged an impossible byte count (${count} for a ${chunk.length}-byte chunk)`);
    }
    offset += count;
  }
  return buffer.length;
}

/* READ loop to EOF: DataOffset/DataLength per reply; a short read
   (< requested) is the EOF marker. Returns the concatenated buffer. */
async function readFile(s, fileId) {
  let offset = 0;
  const parts = [];
  for (;;) {
    const res = await runWithExpiry(
      s,
      () => sendRequest(s, SMB2_COM.READ, buildReadRequest(fileId, SMB_MAX_WRITE_BYTES, offset), { context: `read at offset ${offset}` }),
      `read at offset ${offset}`,
    );
    expectOk(res, `read at offset ${offset}`);
    const data = dataFromReadReply(res);
    if (data.length === 0) break;
    parts.push(data);
    offset += data.length;
    if (data.length < SMB_MAX_WRITE_BYTES) break;
  }
  return Buffer.concat(parts);
}

async function closeFile(s, fileId, context = 'close') {
  const res = await runWithExpiry(
    s,
    () => sendRequest(s, SMB2_COM.CLOSE, buildCloseRequest(fileId), { context }),
    context,
  );
  expectOk(res, context);
}

async function establish(config, opts) {
  const port = config.port ?? 445;
  const socket = net.connect(port, config.host);
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', (err) => reject(smbErrorFrom(err?.code || 'ECONNREFUSED', `connect failed (${String(err?.code ?? 'error')})`)));
  });
  /* NBSS session request (0x81) → expect 0x82 positive response. */
  await new Promise((resolve, reject) => {
    const onData = (chunk) => {
      socket.removeListener('data', onData);
      socket.removeListener('error', onErr);
      if (chunk[0] === 0x82) resolve();
      else if (chunk[0] === 0x83) reject(genericError('NBSS session request refused (0x83)'));
      else reject(genericError('not an NBSS session accept'));
    };
    const onErr = (err) => {
      socket.removeListener('data', onData);
      reject(smbErrorFrom(err?.code || 'ECONNREFUSED', 'NBSS session request failed'));
    };
    socket.on('data', onData);
    socket.once('error', onErr);
    socket.write(encodeNbssSessionRequest());
  });
  const s = createSession(socket, config, opts);
  bindTransport(s);
  await negotiate(s);
  await sessionAuthRound(s);
  await treeConnect(s);
  /* OQ-1 keep-alive: ECHO every SMB_ECHO_INTERVAL_S while idle and
     connected; unref'd (never keeps the process alive). */
  const echoMs = (opts.echoIntervalS ?? SMB_ECHO_INTERVAL_S) * 1000;
  s.echoTimer = setInterval(() => {
    if (!s.pending && !s.closed && !s.echoInFlight && s.socket.writable) {
      s.echoInFlight = true;
      sendRequest(s, SMB2_COM.ECHO, buildEchoRequest(), { context: 'echo keep-alive' })
        .catch(() => { /* idle echo failures surface on the next command */ })
        .finally(() => { s.echoInFlight = false; });
    }
  }, echoMs);
  s.echoTimer.unref?.();
  return s;
}

/* ---------------------------------------------------------------------
   D-01 PROMISE CLIENT — connectSmb(config, opts)
   ---------------------------------------------------------------------
   write/read/rm/echo/close mirror ftp.js/s3.js promise shape exactly
   (no frame-level API, no event emitter). Task 1 wires { connect,
   echo }; the full command surface lands with Task 2. */

export function connectSmb(config, opts = {}) {
  const ctlP = establish(config, opts);
  const ensure = () => ctlP;

  const smb = {
    connect: async () => { await ctlP; },
    write: async (path, buffer) => {
      const s = await ensure();
      const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
      const fileId = await createFile(s, path, { access: GENERIC_WRITE, disposition: FILE_OPEN_IF });
      try {
        await writeFile(s, fileId, buf);
      } finally {
        await closeFile(s, fileId, `close after write ${path}`).catch(() => { /* close failure never masks the write result */ });
      }
      return true;
    },
    read: async (path) => {
      const s = await ensure();
      const fileId = await createFile(s, path, { access: GENERIC_READ, disposition: FILE_OPEN_IF });
      try {
        return await readFile(s, fileId);
      } finally {
        await closeFile(s, fileId, `close after read ${path}`).catch(() => { /* close failure never masks the data */ });
      }
    },
    rm: async (path) => {
      const s = await ensure();
      /* Delete-on-close: CREATE with FILE_DELETE_ON_CLOSE + DELETE
         access; the CLOSE executes the delete server-side. */
      const fileId = await createFile(s, path, {
        access: GENERIC_WRITE | DELETE_ACCESS,
        disposition: FILE_OPEN_IF,
        createOptions: FILE_DELETE_ON_CLOSE,
      });
      await closeFile(s, fileId, `delete ${path}`);
      return true;
    },
    echo: async () => {
      const s = await ensure();
      const res = await runWithExpiry(
        s,
        () => sendRequest(s, SMB2_COM.ECHO, buildEchoRequest(), { context: 'echo' }),
        'echo',
      );
      expectOk(res, 'echo');
      return true;
    },
    close: async () => {
      const s = await ensure().catch(() => null);
      if (!s) return;
      if (s.echoTimer) clearInterval(s.echoTimer);
      /* TREE_DISCONNECT → LOGOFF → NBSS end. Best-effort: the socket
         goes either way (ftp quit parity — destroy on failure). */
      try {
        const res1 = await sendRequest(s, SMB2_COM.TREE_DISCONNECT, buildTreeDisconnectRequest(), { context: 'tree disconnect' });
        expectOk(res1, 'tree disconnect');
        const res2 = await sendRequest(s, SMB2_COM.LOGOFF, buildLogoffRequest(), { context: 'logoff' });
        expectOk(res2, 'logoff');
      } catch { /* best-effort — destroy below regardless */ }
      try { s.socket.destroy(); } catch { /* gone */ }
    },
    /* Test/debug surface (not a user API): expiry counter + MessageId
       cursor; never carries credentials. */
    __debug: async () => {
      const s = await ensure().catch(() => null);
      return { sessionExpiredCount: s?.sessionExpiredCount ?? 0, messageId: String(s?.messageId ?? '0') };
    },
  };
  return smb;
}
