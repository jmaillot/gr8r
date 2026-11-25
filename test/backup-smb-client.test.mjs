/* =====================================================================
   Phase 99 plan 02 — SMB client mock-server tests (99-02).

   Offline, ungated, always-on: in-process scripted node:net NBSS frame
   server (NOT reflexive — reply CONTENT is scripted per scenario, the
   only client-derived data the mock consumes is the NTLM type-3
   security buffer, which a real server MUST parse to derive the same
   session/signing keys; reply bytes, statuses, dialects and error
   injection are all pre-baked knobs). Docker samba e2e is phase 100's
   deliverable, NOT this phase (99-CONTEXT D-02).
   ===================================================================== */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import net from 'node:net';
import { test } from 'node:test';
import {
  connectSmb,
  SMB_ECHO_INTERVAL_S,
  SMB2_COM,
  createFrameParser,
  decodeSmb2Header,
  encodeSmb2Header,
  encodeNbssHeader,
  deriveSigningKey,
  ntlmHash,
  utf16le,
} from '../export/smb.js';

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
const MOCK_TARGET_INFO = Buffer.concat([Buffer.from([0x02, 0x0c]), utf16le('GR8RDOM'), Buffer.from([0x00, 0x00])]);
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
function sessionSetupBody(secBuf) {
  const b = Buffer.alloc(8 + secBuf.length);
  b.writeUInt16LE(9, 0);
  b.writeUInt16LE(0, 2);
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

/* CREATE reply body: FileId at body offset 64 per MS-SMB2 §2.2.14.2. */
function createBody(fileId) {
  const b = Buffer.alloc(64 + 16);
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
  const b = Buffer.alloc(24 + 16);
  b.writeUInt16LE(60, 0);
  fileId.copy(b, 24);
  return b;
}

/* Derive the mock's view of the signing key from a client type-3
   security buffer (the one legitimately client-derived datum — same
   math MS-NLMP mandates the server run). */
function signingKeyFromType3(type3Buf, creds) {
  const ntLen = type3Buf.readUInt16LE(24);
  const ntOff = type3Buf.readUInt32LE(28);
  const ntResponse = type3Buf.subarray(ntOff, ntOff + ntLen);
  const ntProof = ntResponse.subarray(0, 16);
  const v2hash = crypto.createHmac('md5', ntlmHash(creds.password))
    .update(utf16le(String(creds.user).toUpperCase() + String(creds.domain)))
    .digest();
  return deriveSigningKey(crypto.createHmac('md5', v2hash).update(ntProof).digest());
}

/* ------------------------------- fakeSmb -------------------------------
   Scripted NBSS frame server. Reply CONTENT (statuses, dialects,
   structures) comes from the scenario knobs below — never computed by
   parsing request payloads (the type-3 parse is crypto-mandatory, not
   behavioral). Recording: `commands` (decoded request headers + a
   signature-validity flag), `replies` (decoded reply headers), `writes`
   (WRITE offset/length/dataLength tuples). */

function fakeSmb(scenario = {}) {
  const commands = [];
  const replies = [];
  const writes = [];
  const creds = {
    user: scenario.user ?? 'gr8r',
    domain: scenario.domain ?? 'DOMAIN',
    password: scenario.password ?? 'gr8r-secret',
  };
  const sockets = new Set();
  let fileIdCounter = 0;
  const files = new Map(); // name → Buffer (storage for read-back equality)
  const fidMap = new Map(); // fileId hex → name

  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    /* NBSS session accept — pre-baked 0x82, zero payload. */
    if (scenario.nbssRefuse) {
      socket.write(Buffer.from([0x83, 0x00, 0x00, 0x01]));
      return;
    }
    socket.write(Buffer.from([0x82, 0x00, 0x00, 0x00]));

    const parser = createFrameParser();
    const sessionId = 0x1234n;
    const treeId = 0x5678;
    let signingKey = null;      // server's current view of the signing key
    let expireCounts = { ...(scenario.expireCounts ?? {}) };
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
      const frame = Buffer.concat([h, body]);
      if (useSign) signFrameWith(signingKeyOverride ?? signingKey, frame);
      replies.push(decodeSmb2Header(frame));
      socket.write(encodeNbssHeader(0x00, frame.length));
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
             can poison the reply signature or fail the logon. */
          signingKey = signingKeyFromType3(sec, creds);
          if (scenario.wrongSigningKey) signingKey = Buffer.alloc(16, 0xee);
          send(frame, { status: scenario.sessionSetupStatus ?? 0, body: sessionSetupBody(Buffer.alloc(0)) });
          return;
        }
        case SMB2_COM.TREE_CONNECT: {
          if (scenario.treeConnectStatus) { send(frame, { status: scenario.treeConnectStatus }); return; }
          treeConnected = true;
          send(frame, { treeId });
          return;
        }
        case SMB2_COM.CREATE: {
          if (scenario.createStatus) { send(frame, { status: scenario.createStatus }); return; }
          const nameLen = body.readUInt16LE(46);
          const nameOff = body.readUInt16LE(44);
          const name = frame.subarray(nameOff, nameOff + nameLen).toString('utf16le');
          const fileId = Buffer.alloc(16);
          fileId.writeUInt32LE(++fileIdCounter, 0);
          if (!files.has(name)) files.set(name, Buffer.alloc(0));
          fidMap.set(fileId.toString('hex'), name);
          send(frame, { body: createBody(fileId) });
          return;
        }
        case SMB2_COM.WRITE: {
          /* Expiry injection knobs: expireCounts[command] = n → the
             first n occurrences of the command get 0xC000005A. */
          const key = String(hdr.command);
          if (expireCounts[key] > 0) {
            expireCounts[key]--;
            send(frame, { status: 0xc000005a });
            return;
          }
          if (scenario.writeStatus) { send(frame, { status: scenario.writeStatus }); return; }
          const dataOff = body.readUInt16LE(2);
          const len = body.readUInt32LE(4);
          const offset = Number(body.readBigUInt64LE(8));
          const fidHex = body.subarray(20, 36).toString('hex');
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
          if (scenario.closeStatus) { send(frame, { status: scenario.closeStatus }); return; }
          send(frame, { body: closeBody(body.subarray(8, 24)) });
          return;
        }
        case SMB2_COM.ECHO: {
          send(frame, { body: Buffer.from([0x04, 0x00]) });
          return;
        }
        case SMB2_COM.TREE_DISCONNECT: {
          send(frame, { body: Buffer.from([0x04, 0x00]) });
          return;
        }
        case SMB2_COM.LOGOFF: {
          send(frame, { body: Buffer.from([0x04, 0x00]) });
          return;
        }
        default:
          send(frame, { status: 0xc0000003 }); // INVALID_INFO_CLASS → generic
      }
    };
    const fidName = (hex) => fidMap.get(hex);
    let nbssConsumed = 0; // the 0x81 session request (66 bytes) precedes SMB2 frames
    socket.on('data', (chunk) => {
      let c = chunk;
      if (nbssConsumed < 66) {
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

/* SMB2 header reply flag — local mirror (test-file constant). */
const SMB2_HDR_REPLY = 0x1;

/* ------------------------------- tracer test ------------------------------- */

test('tracer: full handshake (NEGOTIATE → SESSION_SETUP×2 → TREE_CONNECT → ECHO) signed end-to-end', async () => {
  const server = fakeSmb();
  await server.listen();
  try {
    const smb = connectSmb({
      host: '127.0.0.1',
      port: server.port(),
      user: 'gr8r',
      domain: 'DOMAIN',
      password: 'gr8r-secret',
      share: '\\\\127.0.0.1\\gr8r',
    });
    await smb.connect();
    await smb.echo();
    await smb.close();

    const cmds = server.commands;
    const order = [SMB2_COM.NEGOTIATE, SMB2_COM.SESSION_SETUP, SMB2_COM.SESSION_SETUP, SMB2_COM.TREE_CONNECT, SMB2_COM.ECHO];
    assert.equal(cmds.length, order.length, `exactly ${order.length} commands recorded (got ${cmds.length}: ${cmds.map((c) => c.command).join(',')})`);
    order.forEach((cmd, i) => assert.equal(cmds[i].command, cmd, `command #${i} is ${cmd} in order`));
    /* MessageId correlation: strictly increasing from 0. */
    for (let i = 0; i < cmds.length; i++) assert.equal(cmds[i].messageId, BigInt(i), `MessageId ${i} at position ${i}`);
    /* SessionId/TreeId adoption: TREE_CONNECT and ECHO carry the
       server-granted ids. */
    assert.equal(cmds[4].sessionId, 0x1234n, 'SessionId adopted from the first SESSION_SETUP reply');
    assert.equal(cmds[4].treeId, 0x5678, 'TreeId adopted from the TREE_CONNECT reply');
    /* Signing (SC-2): everything after the type-1 SESSION_SETUP is
       signed AND the server-side recomputation agrees. The type-1
       itself is unsigned (the session key does not exist yet). */
    assert.equal(cmds[1].sigValid, null, 'SESSION_SETUP type-1 is unsigned (no session key yet)');
    for (let i = 2; i < cmds.length; i++) {
      assert.equal(cmds[i].sigValid, true, `command #${i} (cmd=${cmds[i].command}) carries a valid signature`);
    }
    assert.equal(cmds[0].sigValid, null, 'NEGOTIATE is unsigned');
  } finally {
    await server.close();
  }
});

test('SMB_ECHO_INTERVAL_S is the 60s const (OQ-1)', () => {
  assert.equal(SMB_ECHO_INTERVAL_S, 60);
});

/* ------------- T-99-03: verify-before-dispatch (wrong key) ------------- */

test('forged reply signature → connection closed, keyed generic, never dispatched', async () => {
  const server = fakeSmb({ wrongSigningKey: true });
  await server.listen();
  try {
    const smb = connectSmb({
      host: '127.0.0.1',
      port: server.port(),
      user: 'gr8r',
      domain: 'DOMAIN',
      password: 'gr8r-secret',
      share: '\\\\127.0.0.1\\gr8r',
    }, { commandTimeoutMs: 2000 });
    await assert.rejects(
      smb.connect(),
      (err) => {
        assert.equal(err.code, 'smbGeneric');
        assert.equal(err.smbClass, 'generic');
        return true;
      },
      'the tampered SESSION_SETUP final is rejected before dispatch',
    );
    /* The socket is closed — a follow-up echo cannot succeed. */
    await assert.rejects(smb.echo());
  } finally {
    await server.close();
  }
});

test('transport-refused connection → keyed unreachable', async () => {
  const smb = connectSmb({
    host: '127.0.0.1',
    port: 1, // nothing listens
    user: 'u', domain: 'D', password: 'p', share: '\\\\h\\s',
  });
  await assert.rejects(
    smb.connect(),
    (err) => err.code === 'smbUnreachable' && err.smbClass === 'unreachable',
  );
});

test('NBSS session request refused (0x83) → keyed generic', async () => {
  const server = fakeSmb({ nbssRefuse: true });
  await server.listen();
  try {
    const smb = connectSmb({ host: '127.0.0.1', port: server.port(), user: 'u', domain: 'D', password: 'p', share: '\\\\h\\s' });
    await assert.rejects(smb.connect(), (err) => err.smbClass === 'generic');
  } finally {
    await server.close();
  }
});
