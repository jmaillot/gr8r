/* =====================================================================
   Scripted SMB2 mock server shared by the backup suites (100-04):
   extracted verbatim from test/backup-smb-wiring.test.mjs so the
   remote-prune suite can drive idempotency (0xc0000034) and success
   scenarios against the same 99-idiom fake. Scripted NBSS frame
   server with file-storage capture.
   ===================================================================== */
import net from 'node:net';
import crypto from 'node:crypto';
import {
  SMB2_COM,
  createFrameParser,
  decodeSmb2Header,
  encodeSmb2Header,
  encodeNbssHeader,
  deriveSigningKey,
  ntlmHash,
  utf16le,
} from '../../export/smb.js';
const SMB2_HDR_REPLY = 0x1;
const MOCK_CHALLENGE = Buffer.from([0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef]);
const MOCK_TARGET_INFO = Buffer.concat([Buffer.from([0x02, 0x0c]), utf16le('PROJECTS_STUDIODOM'), Buffer.from([0x00, 0x00])]);
const MOCK_TYPE2 = (() => {
  const buf = Buffer.alloc(48 + MOCK_TARGET_INFO.length);
  buf.write('NTLMSSP\0', 0, 'latin1');
  buf.writeUInt32LE(2, 8);
  buf.writeUInt16LE(0, 12); buf.writeUInt16LE(0, 14); buf.writeUInt32LE(48, 16);
  buf.writeUInt32LE(0x00000001 | 0x00000200 | 0x00008000 | 0x00080000 | 0x00800000 | 0x20000000, 20);
  MOCK_CHALLENGE.copy(buf, 24);
  buf.writeUInt16LE(MOCK_TARGET_INFO.length, 40);
  buf.writeUInt16LE(MOCK_TARGET_INFO.length, 42);
  buf.writeUInt32LE(48, 44);
  MOCK_TARGET_INFO.copy(buf, 48);
  return buf;
})();

function signFrameWith(key, frame) {
  const scratch = Buffer.from(frame);
  scratch.fill(0, 48, 64);
  const sig = crypto.createHmac('sha256', key).update(scratch).digest();
  sig.copy(frame, 48, 0, 16);
}

function sessionSetupBody(secBuf, sessionFlags = 0) {
  const b = Buffer.alloc(8 + secBuf.length);
  b.writeUInt16LE(9, 0);
  b.writeUInt16LE(sessionFlags, 2);
  b.writeUInt16LE(64 + 8, 4);
  b.writeUInt16LE(secBuf.length, 6);
  secBuf.copy(b, 8);
  return b;
}

function negotiateBody(dialect, securityMode) {
  const b = Buffer.alloc(66);
  b.writeUInt16LE(0x41, 0);
  b.writeUInt16LE(securityMode, 2);
  b.writeUInt16LE(dialect, 4);
  return b;
}

function createBody(fileId) {
  /* MS-SMB2 §2.2.14.2 reply body = 88-byte fixed struct; FileId rides at
     body offset 64 (NOT a fake-header copy — the raw client frames the
     reply at header+88, so the body must be exactly 88 bytes). */
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

function closeBody(fileId) {
  /* MS-SMB2 §2.2.15.2 reply body = 60-byte fixed struct; FileId at body
     offset 8 (the request carried it at body offset 8, the reply echoes
     it at 8 — NOT body offset 24). */
  const b = Buffer.alloc(60);
  b.writeUInt16LE(60, 0);
  fileId.copy(b, 8);
  return b;
}

function signingKeyFromType3(type3Buf, creds) {
  /* MS-NLMP 2.2.1.3 AUTHENTICATE layout: NT len @20, NT offset @24. */
  const ntLen = type3Buf.readUInt16LE(20);
  const ntOff = type3Buf.readUInt32LE(24);
  const ntResponse = type3Buf.subarray(ntOff, ntOff + ntLen);
  const ntProof = ntResponse.subarray(0, 16);
  const v2hash = crypto.createHmac('md5', ntlmHash(creds.password))
    .update(utf16le(String(creds.user).toUpperCase() + String(creds.domain)))
    .digest();
  /* SMB 2.x signing key = sessionBaseKey RAW (no SMB3 AES KDF) —
     mirrors the client's dialect-dependent derivation (2026-11-26). */
  return crypto.createHmac('md5', v2hash).update(ntProof).digest();
}

/* Scripted NBSS frame server with file-storage capture (99 idiom). */
function fakeSmb(scenario = {}, credsOverride = {}) {
  const commands = [];
  const creds = { user: 'projects-studio', domain: 'DOMAIN', password: 'projects-studio-secret', ...credsOverride };
  const sockets = new Set();
  let fileIdCounter = 0;
  const files = new Map();
  const fidMap = new Map();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    /* 2026-11-26: no unconditional NBSS accept — the client only sends
       the 0x81 session request on the 139-style path (opts.nbss / port
       139); on direct 445 the first byte is the SMB2 NEGOTIATE. */
    const getParser = () => {
      if (!getParser.p) getParser.p = createFrameParser({ raw: !nbssMode, requestSide: true });
      return getParser.p;
    };
    const parser = { feed: (c) => getParser().feed(c) };
    const sessionId = 0x1234n;
    const treeId = 0x5678;
    let signingKey = null;
    const send = (reqFrame, { status = 0, credits = 1, treeId: tid, sessionId: sid, sign = true, body = Buffer.alloc(0) }) => {
      const hdr = decodeSmb2Header(reqFrame);
      const useSign = sign && signingKey !== null;
      const h = encodeSmb2Header({
        command: hdr.command,
        status,
        credits,
        flags: SMB2_HDR_REPLY | (useSign ? 0x8 : 0),
        messageId: hdr.messageId,
        treeId: tid ?? hdr.treeId,
        sessionId: sid ?? (hdr.sessionId !== 0n ? hdr.sessionId : sessionId),
      });
      /* A non-zero status MUST carry the 8-byte error body (StructureSize
         9 + ByteCount, MS-SMB2 §2.2.2) — the raw-mode client frames error
         replies at 64+8+ByteCount and hangs if only the 64-byte header
         arrives (2026-11-26). */
      const errBody = status !== 0 && body.length === 0
        ? Buffer.concat([Buffer.from([0x09, 0x00, 0x00, 0x00]), Buffer.alloc(4)])
        : body;
      const frame = Buffer.concat([h, errBody]);
      if (useSign) signFrameWith(signingKey, frame);
      if (nbssMode) socket.write(encodeNbssHeader(0x00, frame.length));
      socket.write(frame);
    };
    const fidName = (hex) => fidMap.get(hex);
    const handle = (frame) => {
      const hdr = decodeSmb2Header(frame);
      const body = frame.subarray(64);
      if ((hdr.flags & 0x8) !== 0 && hdr.command === SMB2_COM.SESSION_SETUP) {
        const off = body.readUInt16LE(12);
        const len = body.readUInt16LE(14);
        const sec = frame.subarray(off, off + len);
        if (len > 0 && sec.readUInt32LE(8) === 3) signingKey = signingKeyFromType3(sec, creds);
      }
      commands.push({ command: hdr.command });
      switch (hdr.command) {
        case SMB2_COM.NEGOTIATE: send(frame, { sign: false, body: negotiateBody(0x0210, 0x0003) }); return;
        case SMB2_COM.SESSION_SETUP: {
          const off = body.readUInt16LE(12);
          const len = body.readUInt16LE(14);
          const sec = frame.subarray(off, off + len);
          if (len === 0 || sec.readUInt32LE(8) === 1) {
            send(frame, { status: 0xc0000016, sign: signingKey !== null, body: sessionSetupBody(MOCK_TYPE2) });
            return;
          }
          send(frame, { status: scenario.sessionSetupStatus ?? 0, sign: !scenario.sessionSetupStatus, body: sessionSetupBody(Buffer.alloc(0), 0) });
          return;
        }
        case SMB2_COM.TREE_CONNECT: {
          const tc = Buffer.alloc(16);
          tc.writeUInt16LE(16, 0);
          tc.writeUInt8(1, 8); // ShareType DISK
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
          const stored = files.get(fidName(fidHex)) ?? Buffer.alloc(0);
          const end = Math.max(stored.length, offset + len);
          const next = Buffer.alloc(Math.max(end, stored.length));
          stored.copy(next, 0);
          data.copy(next, offset);
          files.set(fidName(fidHex), next);
          send(frame, { body: writeReplyBody(len) });
          return;
        }
        case SMB2_COM.CLOSE: send(frame, { body: closeBody(body.subarray(8, 24)) }); return;
        case SMB2_COM.ECHO: send(frame, { body: Buffer.from([0x04, 0x00, 0x00, 0x00]) }); return;
        case SMB2_COM.TREE_DISCONNECT: send(frame, { body: Buffer.from([0x04, 0x00, 0x00, 0x00]) }); return;
        case SMB2_COM.LOGOFF: send(frame, { body: Buffer.from([0x04, 0x00, 0x00, 0x00]) }); return;
        default: send(frame, { status: 0xc0000003 });
      }
    };
    let nbssConsumed = 0;
    let nbssDetected = false; // 2026-11-26 round 3: framing is NBSS everywhere — the first byte discriminates only the 0x81 handshake
    let nbssMode = false; // replies carry the 4-byte NBSS prefix (always true since the NBSS-everywhere fix)
    socket.on('data', (chunk) => {
      let c = chunk;
      if (!nbssDetected && c.length > 0) {
        nbssDetected = true;
        nbssMode = c[0] !== 0xfe; // NBSS length prefix or 0x81 — anything but a naked SMB2 magic
        if (c[0] === 0x81) {
          socket.write(Buffer.from([0x82, 0x00, 0x00, 0x00]));
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
    files,
    listen: async () => { await new Promise((r) => server.listen(0, '127.0.0.1', r)); },
    port: () => server.address().port,
    close: async () => {
      for (const sk of sockets) { try { sk.destroy(); } catch { /* gone */ } }
      server.closeAllConnections?.();
      await new Promise((r) => server.close(r));
    },
  };
}
export { fakeSmb, SMB2_COM };
