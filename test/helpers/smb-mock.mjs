/* =====================================================================
   Shared in-process SMB2 mock frame server (extracted from
   test/backup-smb-client.test.mjs, Phase 108-01 CARRY-01: the restore
   stat seam needs the same harness — one copy, two consumers).

   NOT reflexive — reply CONTENT is scripted per scenario, the only
   client-derived data the mock consumes is the NTLM type-3 security
   buffer, which a real server MUST parse to derive the same
   session/signing keys; reply bytes, statuses and error injection are
   all pre-baked knobs.
   ===================================================================== */
import crypto from 'node:crypto';
import net from 'node:net';
import {
  SMB2_COM,
  createFrameParser,
  decodeSmb2Header,
  encodeSmb2Header,
  encodeNbssHeader,
  ntlmHash,
  utf16le,
} from '../../export/smb.js';

/* ---------------- mock-side signing helpers (mirror the client) ---------------- */

function signFrameWith(key, frame) {
  const scratch = Buffer.from(frame);
  scratch.fill(0, 48, 64);
  const sig = crypto.createHmac('sha256', key).update(scratch).digest();
  sig.copy(frame, 48, 0, 16);
}

function verifyFrameWith(key, frame) {
  const scratch = Buffer.from(frame);
  scratch.fill(0, 48, 64);
  const expected = crypto.createHmac('sha256', key).update(scratch).digest().subarray(0, 16);
  return expected.equals(frame.subarray(48, 64));
}

/* Pre-baked NTLM type-2 (CHALLENGE_MESSAGE): fixed challenge + fixed
   small TargetInfo (AV NetBIOS-domain pair). Constant per module. */
const MOCK_CHALLENGE = Buffer.from([0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef]);
const MOCK_TARGET_INFO = Buffer.concat([Buffer.from([0x02, 0x0c]), utf16le('PROJECTS_STUDIODOM'), Buffer.from([0x00, 0x00])]);
const MOCK_TYPE2 = (() => {
  const buf = Buffer.alloc(48 + MOCK_TARGET_INFO.length);
  buf.write('NTLMSSP\0', 0, 'latin1');
  buf.writeUInt32LE(2, 8);
  buf.writeUInt16LE(0, 12); buf.writeUInt16LE(0, 14); buf.writeUInt32LE(48, 16); // empty target name
  buf.writeUInt32LE(
    0x00000001 | 0x00000200 | 0x00008000 | 0x00080000 | 0x00800000 | 0x20000000,
    20,
  );
  MOCK_CHALLENGE.copy(buf, 24);
  buf.writeUInt16LE(MOCK_TARGET_INFO.length, 40);
  buf.writeUInt16LE(MOCK_TARGET_INFO.length, 42);
  buf.writeUInt32LE(48, 44);
  MOCK_TARGET_INFO.copy(buf, 48);
  return buf;
})();

/* Session-setup reply body: StructureSize 9 + security buffer at frame
   offset 72 (body offset 8). */
function sessionSetupBody(secBuf, sessionFlags = 0) {
  const b = Buffer.alloc(8 + secBuf.length);
  b.writeUInt16LE(9, 0);
  b.writeUInt16LE(sessionFlags, 2); // SessionFlags u16 @ body offset 2 (MS-SMB2 §2.2.5)
  b.writeUInt16LE(64 + 8, 4);  // SecurityBufferOffset
  b.writeUInt16LE(secBuf.length, 6);
  secBuf.copy(b, 8);
  return b;
}

/* NEGOTIATE reply body: StructureSize 0x41, SecurityMode @2,
   DialectRevision @4. */
function negotiateBody(dialect, securityMode) {
  const b = Buffer.alloc(66);
  b.writeUInt16LE(0x41, 0);
  b.writeUInt16LE(securityMode, 2);
  b.writeUInt16LE(dialect, 4);
  return b;
}

/* CREATE reply body: FileId at body offset 64 per MS-SMB2 §2.2.14.2 —
   full 88-byte fixed structure (raw-mode client frames by the spec shape). */
function createBody(fileId) {
  /* MS-SMB2 §2.2.14.2 reply body = exactly 88 bytes; FileId at body
     offset 64 (no fake-header copy — the raw client frames at b+88). */
  const b = Buffer.alloc(88);
  b.writeUInt16LE(34, 0);
  fileId.copy(b, 64);
  return b;
}

function writeReplyBody(count) {
  const b = Buffer.alloc(16);
  b.writeUInt16LE(17, 0);
  b.writeUInt32LE(count, 4);
  return b;
}

function readReplyBody(dataOffset, dataLength) {
  const b = Buffer.alloc(16);
  b.writeUInt16LE(17, 0);
  b.writeUInt16LE(dataOffset, 2);
  b.writeUInt32LE(dataLength, 4);
  return b;
}

function closeBody(fileId) {
  /* MS-SMB2 §2.2.15.2 reply body = 60-byte fixed struct; FileId echoed
     at body offset 8 (raw client frames at b+60). */
  const b = Buffer.alloc(60);
  b.writeUInt16LE(60, 0);
  fileId.copy(b, 8);
  return b;
}

/* Derive the mock's view of the signing key from a client type-3
   security buffer (the one legitimately client-derived datum — same
   math MS-NLMP mandates the server run). */
function signingKeyFromType3(type3Buf, creds) {
  /* MS-NLMP 2.2.1.3 AUTHENTICATE layout: NT len @20, NT offset @24. */
  const ntLen = type3Buf.readUInt16LE(20);
  const ntOff = type3Buf.readUInt32LE(24);
  const ntResponse = type3Buf.subarray(ntOff, ntOff + ntLen);
  const ntProof = ntResponse.subarray(0, 16);
  const v2hash = crypto.createHmac('md5', ntlmHash(creds.password))
    .update(utf16le(String(creds.user).toUpperCase() + String(creds.domain)))
    .digest();
  /* SMB 2.x signing key = sessionBaseKey RAW (no SMB3 AES KDF). */
  return crypto.createHmac('md5', v2hash).update(ntProof).digest();
}

/* ------------------------------- fakeSmb -------------------------------
   Scripted NBSS frame server. Reply CONTENT (statuses, dialects,
   structures) comes from the scenario knobs below — never computed by
   parsing request payloads (the type-3 parse is crypto-mandatory, not
   behavioral). Recording: `commands` (decoded request headers + a
   signature-validity flag), `replies` (decoded reply headers), `writes`
   (WRITE offset/length/dataLength tuples), `creates` (CREATE
   name/DesiredAccess/CreateDisposition/CreateOptions tuples — the
   delete-on-close pin surface, Phase 108-01). */

function fakeSmb(scenario = {}) {
  const commands = [];
  const replies = [];
  const writes = [];
  const creates = [];
  const creds = {
    user: scenario.user ?? 'projects-studio',
    domain: scenario.domain ?? 'DOMAIN',
    password: scenario.password ?? 'projects-studio-secret',
  };
  const sockets = new Set();
  let fileIdCounter = 0;
  const files = new Map(); // name → Buffer (storage for read-back equality)
  const fidMap = new Map(); // fileId hex → name

  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    /* NBSS session accept — the 0x82 is sent ONLY on the port-139 path
       (client's first byte is the 0x81 request); on direct 445 the first
       byte is the SMB2 NEGOTIATE and a stray 0x82 would corrupt the
       frame parser (2026-11-26 parity fix). */
    if (scenario.nbssRefuse) {
      socket.write(Buffer.from([0x83, 0x00, 0x00, 0x01]));
      return;
    }

    let nbssModeParser = null; // decided on the client's first byte — the parser must match (raw client = naked frames)
    const getParser = () => {
      if (nbssModeParser === null) nbssModeParser = createFrameParser({ raw: !nbssMode, requestSide: true });
      return nbssModeParser;
    };
    const parser = { feed: (c) => getParser().feed(c) };
    const sessionId = 0x1234n;
    const treeId = 0x5678;
    let signingKey = null;      // server's current view of the signing key
    let expireCounts = { ...(scenario.expireCounts ?? {}) };
    let expireAttemptCounts = { ...(scenario.expireAttemptCounts ?? {}) };
    const expiryOccurrences = {};
    let treeConnected = false;

    const send = (reqFrame, { status = 0, credits = 1, treeId: tid, sessionId: sid, sign = true, body = Buffer.alloc(0), signingKeyOverride = null }) => {
      const hdr = decodeSmb2Header(reqFrame);
      const useSign = sign && signingKey !== null;
      const h = encodeSmb2Header({
        command: hdr.command,
        status,
        credits,
        flags: (SMB2_HDR_REPLY) | (useSign ? 0x8 : 0),
        messageId: hdr.messageId,
        treeId: tid ?? hdr.treeId,
        sessionId: sid ?? (hdr.sessionId !== 0n ? hdr.sessionId : sessionId),
      });
      /* Non-zero status MUST carry the 8-byte error body (MS-SMB2 §2.2.2) —
         the raw client frames error replies at 64+8+ByteCount (2026-11-26). */
      const finalBody = status !== 0 && body.length === 0
        ? Buffer.concat([Buffer.from([0x09, 0x00, 0x00, 0x00]), Buffer.alloc(4)])
        : body;
      const frame = Buffer.concat([h, finalBody]);
      if (useSign) signFrameWith(signingKeyOverride ?? signingKey, frame);
      replies.push(decodeSmb2Header(frame));
      if (nbssMode) socket.write(encodeNbssHeader(0x00, frame.length));
      socket.write(frame);
    };

    const handle = (frame) => {
      const hdr = decodeSmb2Header(frame);
      const body = frame.subarray(64);
      /* Verify the CLIENT's signature when present (recording only —
         scenario decides the reply behavior, not the verdict). A
         round-2 type-3 may arrive signed with a FRESH key not yet in
         the mock's session state — the candidate derived from the
         frame itself is tried first. */
      let sigValid = null;
      let candidateKey = null;
      if ((hdr.flags & 0x8) !== 0) {
        if (hdr.command === SMB2_COM.SESSION_SETUP) {
          const off = body.readUInt16LE(12);
          const len = body.readUInt16LE(14);
          const sec = frame.subarray(off, off + len);
          if (len > 0 && sec.readUInt32LE(8) === 3) candidateKey = signingKeyFromType3(sec, creds);
        }
        const key = candidateKey ?? signingKey;
        if (key) sigValid = verifyFrameWith(key, frame);
      }
      commands.push({
        command: hdr.command,
        messageId: hdr.messageId,
        sessionId: hdr.sessionId,
        treeId: hdr.treeId,
        credits: hdr.credits,
        sigValid,
      });

      /* Expiry injection knobs:
         - expireCounts[cmd] = n → the first n OCCURRENCES of the
           command get 0xC000005A (replays included → per-command cap).
         - expireAttemptCounts[cmd] = n → n expiry replies on ODD
           occurrences only (attempts; serial replays are the even
           occurrences → session-cap storm scenarios).
         Never injected on the handshake commands themselves. */
      const ekey = String(hdr.command);
      if (hdr.command !== SMB2_COM.NEGOTIATE && hdr.command !== SMB2_COM.SESSION_SETUP) {
        const occ = (expiryOccurrences[ekey] = (expiryOccurrences[ekey] ?? 0) + 1);
        if ((expireCounts[ekey] ?? 0) > 0) {
          expireCounts[ekey]--;
          send(frame, { status: 0xc000005a });
          return;
        }
        if ((expireAttemptCounts[ekey] ?? 0) > 0 && occ % 2 === 1) {
          expireAttemptCounts[ekey]--;
          send(frame, { status: 0xc000005a });
          return;
        }
      }

      switch (hdr.command) {
        case SMB2_COM.NEGOTIATE: {
          send(frame, { sign: false, body: negotiateBody(scenario.dialectReply ?? 0x0210, scenario.securityMode ?? 0x0003) });
          return;
        }
        case SMB2_COM.SESSION_SETUP: {
          const off = body.readUInt16LE(12);
          const len = body.readUInt16LE(14);
          const sec = frame.subarray(off, off + len);
          if (len === 0 || sec.readUInt32LE(8) === 1) {
            /* Round 1 (type-1): pre-baked MORE_PROCESSING_REQUIRED +
               the constant challenge. Signed only on re-auth. */
            send(frame, { status: 0xc0000016, sign: signingKey !== null, body: sessionSetupBody(MOCK_TYPE2) });
            return;
          }
          /* Round 2 (type-3): derive the session's signing key; knobs
             can poison the reply signature or fail the logon (a failed
             logon leaves the session UNESTABLISHED → unsigned reply). */
          signingKey = signingKeyFromType3(sec, creds);
          if (scenario.wrongSigningKey) signingKey = Buffer.alloc(16, 0xee);
          send(frame, { status: scenario.sessionSetupStatus ?? 0, sign: !scenario.sessionSetupStatus, body: sessionSetupBody(Buffer.alloc(0), scenario.sessionFlags ?? 0) });
          return;
        }
        case SMB2_COM.TREE_CONNECT: {
          if (scenario.treeConnectStatus) { send(frame, { status: scenario.treeConnectStatus }); return; }
          treeConnected = true;
          /* MS-SMB2 §2.2.10 reply body: StructureSize 16 + ShareFlags +
             ShareType + SharedShadows — the raw-mode client frames the
             reply by the spec shape (b+16), so the body must be whole. */
          const tc = Buffer.alloc(16);
          tc.writeUInt16LE(16, 0);
          tc.writeUInt32LE(0, 4); // ShareFlags
          tc.writeUInt8(1, 8);    // ShareType = DISK
          send(frame, { treeId, body: tc });
          return;
        }
        case SMB2_COM.CREATE: {
          if (scenario.createStatus) { send(frame, { status: scenario.createStatus }); return; }
          const nameLen = body.readUInt16LE(46);
          const nameOff = body.readUInt16LE(44);
          /* The client translates `/` → `\` on the wire (SMB2
             separator); normalize back so file keys stay slash-keyed. */
          const name = frame.subarray(nameOff, nameOff + nameLen).toString('utf16le').replace(/\\/g, '/');
          /* Frame-detail recording (buildCreateRequest layout): 
             DesiredAccess @24, CreateDisposition @36, CreateOptions @40. */
          creates.push({
            name,
            access: body.readUInt32LE(24),
            disposition: body.readUInt32LE(36),
            createOptions: body.readUInt32LE(40),
          });
          const fileId = Buffer.alloc(16);
          fileId.writeUInt32LE(++fileIdCounter, 0);
          if (!files.has(name)) files.set(name, Buffer.alloc(0));
          fidMap.set(fileId.toString('hex'), name);
          send(frame, { body: createBody(fileId) });
          return;
        }
        case SMB2_COM.WRITE: {
          if (scenario.writeStatus) { send(frame, { status: scenario.writeStatus }); return; }
          const dataOff = body.readUInt16LE(2);
          const len = body.readUInt32LE(4);
          const offset = Number(body.readBigUInt64LE(8));
          const fidHex = body.subarray(16, 32).toString('hex');
          const data = frame.subarray(dataOff, dataOff + len);
          /* Count echo: partial-write knob halves the ack (re-issue
             from the un-acked offset); never acks 0. */
          let count = len;
          if (scenario.partialWrite && len > 1) count = Math.max(1, Math.ceil(len / 2));
          writes.push({ offset, length: len, count });
          /* Storage: keep the acked bytes for read-back equality. */
          const stored = files.get(fidName(fidHex)) ?? Buffer.alloc(0);
          const end = Math.max(stored.length, offset + count);
          const next = Buffer.alloc(Math.max(end, stored.length));
          stored.copy(next, 0);
          if (data.length > 0) data.subarray(0, count).copy(next, offset);
          files.set(fidName(fidHex), next);
          send(frame, { body: writeReplyBody(count) });
          return;
        }
        case SMB2_COM.READ: {
          if (scenario.readStatus) { send(frame, { status: scenario.readStatus }); return; }
          const offset = Number(body.readBigUInt64LE(8));
          const requested = body.readUInt32LE(4);
          const fidHex = body.subarray(16, 32).toString('hex');
          const payload = files.get(fidName(fidHex)) ?? Buffer.alloc(0);
          const slice = payload.subarray(offset, offset + requested);
          const out = Buffer.concat([readReplyBody(64 + 16, slice.length), slice]);
          send(frame, { body: out });
          return;
        }
        case SMB2_COM.CLOSE: {
          /* closeStatus arms after the first CLOSE (mkdirParents
             infrastructure CLOSEs succeed; the marker-rm DELETE-on-close
             CLOSE fails) — keeps the rm-failure arm exercisable with the
             mkdir chain now preceding every write. */
          if (scenario.closeStatus && (scenario._closeCount = (scenario._closeCount ?? 0) + 1) > (scenario._closeOk ?? 0)) {
            send(frame, { status: scenario.closeStatus });
            return;
          }
          send(frame, { body: closeBody(body.subarray(8, 24)) });
          return;
        }
        case SMB2_COM.ECHO: {
          send(frame, { body: Buffer.from([0x04, 0x00, 0x00, 0x00]) }); // StructureSize 4 (spec-sized for raw framing)
          return;
        }
        case SMB2_COM.TREE_DISCONNECT: {
          send(frame, { body: Buffer.from([0x04, 0x00, 0x00, 0x00]) }); // spec-sized
          return;
        }
        case SMB2_COM.LOGOFF: {
          send(frame, { body: Buffer.from([0x04, 0x00, 0x00, 0x00]) }); // spec-sized
          return;
        }
        default:
          send(frame, { status: 0xc0000003 }); // INVALID_INFO_CLASS → generic
      }
    };
    const fidName = (hex) => fidMap.get(hex);
    let nbssConsumed = 0; // the 0x81 session request (66 bytes) precedes SMB2 frames
    let nbssDetected = false; // 2026-11-26 round 3: framing is NBSS everywhere now — the first byte discriminates only the 0x81 handshake
    let nbssMode = false; // replies carry the 4-byte NBSS prefix (always true since the NBSS-everywhere fix)
    socket.on('data', (chunk) => {
      let c = chunk;
      if (!nbssDetected && c.length > 0) {
        nbssDetected = true;
        nbssMode = c[0] !== 0xfe; // NBSS length prefix (0x00…) or 0x81 session request — anything but a naked SMB2 magic
        if (c[0] === 0x81) {
          socket.write(Buffer.from([0x82, 0x00, 0x00, 0x00])); // NBSS accept, 139 path only
          nbssConsumed = 66;
        }
      }
      if (nbssConsumed > 0 && nbssConsumed < 66) { // 0x81 handshake path only — NBSS frames carry their own prefix through the parser
        const need = 66 - nbssConsumed;
        const take = Math.min(need, c.length);
        nbssConsumed += take;
        c = c.subarray(take);
        if (c.length === 0) return;
      }
      const { frames } = parser.feed(c);
      for (const f of frames) handle(f.payload);
    });
  });

  return {
    commands,
    replies,
    writes,
    creates,
    listen: async () => {
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
    },
    port: () => server.address().port,
    close: async () => {
      for (const sk of sockets) { try { sk.destroy(); } catch { /* gone */ } }
      server.closeAllConnections?.();
      await new Promise((r) => server.close(r));
    },
  };
}

/* SMB2 header reply flag — local constant (mirrors the client's module-private one). */
const SMB2_HDR_REPLY = 0x1;

export {
  fakeSmb,
  signFrameWith,
  verifyFrameWith,
  sessionSetupBody,
  negotiateBody,
  createBody,
  writeReplyBody,
  readReplyBody,
  closeBody,
  signingKeyFromType3,
  MOCK_TYPE2,
  SMB2_HDR_REPLY,
};
