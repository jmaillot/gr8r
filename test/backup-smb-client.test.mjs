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
/* SMB mock extracted to test/helpers/smb-mock.mjs (Phase 108-01 CARRY-01:
   the restore stat seam's tests share the same harness — one copy, two
   consumers; the mock's behavior is byte-identical, only its home moved). */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import { test } from 'node:test';
import {
  connectSmb,
  SMB_ECHO_INTERVAL_S,
  SMB2_COM,
} from '../export/smb.js';
import {
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
} from './helpers/smb-mock.mjs';

/* ------------------------------- tracer test ------------------------------- */

test('tracer: full handshake (NEGOTIATE → SESSION_SETUP×2 → TREE_CONNECT → ECHO) signed end-to-end', async () => {
  const server = fakeSmb();
  await server.listen();
  try {
    const smb = connectSmb({
      host: '127.0.0.1',
      port: server.port(),
      user: 'projects-studio',
      domain: 'DOMAIN',
      password: 'projects-studio-secret',
      share: '\\\\127.0.0.1\\projects-studio',
    });
    await smb.connect();
    await smb.echo();
    await smb.close();

    const cmds = server.commands;
    const order = [SMB2_COM.NEGOTIATE, SMB2_COM.SESSION_SETUP, SMB2_COM.SESSION_SETUP, SMB2_COM.TREE_CONNECT, SMB2_COM.ECHO, SMB2_COM.TREE_DISCONNECT, SMB2_COM.LOGOFF];
    assert.equal(cmds.length, order.length, `exactly ${order.length} commands recorded (got ${cmds.length}: ${cmds.map((c) => c.command).join(',')})`);
    order.forEach((cmd, i) => assert.equal(cmds[i].command, cmd, `command #${i} is ${cmd} in order`));
    /* MessageId correlation: strictly increasing from 0. */
    for (let i = 0; i < cmds.length; i++) assert.equal(cmds[i].messageId, BigInt(i), `MessageId ${i} at position ${i}`);
    /* SessionId/TreeId adoption: TREE_CONNECT and ECHO carry the
       server-granted ids. */
    assert.equal(cmds[4].sessionId, 0x1234n, 'SessionId adopted from the first SESSION_SETUP reply');
    assert.equal(cmds[4].treeId, 0x5678, 'TreeId adopted from the TREE_CONNECT reply');
    /* Signing (SC-2): everything from TREE_CONNECT on is signed AND
       the server-side recomputation agrees. The type-1 is unsigned (no
       session key yet) and the type-3 is unsigned too — the server
       installs the signing key only after the session setup completes,
       so a signed round-2 is unverifiable server-side and real Samba
       closes instead of answering (owner NAS UAT round 3). */
    assert.equal(cmds[1].sigValid, null, 'SESSION_SETUP type-1 is unsigned (no session key yet)');
    assert.equal(cmds[2].sigValid, null, 'SESSION_SETUP type-3 is unsigned (server has no key until the session completes)');
    for (let i = 3; i < cmds.length; i++) {
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
      user: 'projects-studio',
      domain: 'DOMAIN',
      password: 'projects-studio-secret',
      share: '\\\\127.0.0.1\\projects-studio',
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

test('NBSS session request refused (0x83) → keyed generic (139-style path, opts.nbss)', async () => {
  const server = fakeSmb({ nbssRefuse: true });
  await server.listen();
  try {
    const smb = connectSmb({ host: '127.0.0.1', port: server.port(), user: 'u', domain: 'D', password: 'p', share: '\\\\h\\s' }, { nbss: true });
    await assert.rejects(smb.connect(), (err) => err.smbClass === 'generic');
  } finally {
    await server.close();
  }
});

/* ------------- Task 2: multi-chunk WRITE / READ / rm / close ------------- */

test('multi-chunk upload: serial ≤60416 WRITE frames with strictly increasing offsets', async () => {
  const payload = Buffer.alloc(150_000);
  for (let i = 0; i < payload.length; i++) payload[i] = i % 251;
  const server = fakeSmb();
  await server.listen();
  try {
    const smb = connectSmb({ host: '127.0.0.1', port: server.port(), user: 'projects-studio', domain: 'DOMAIN', password: 'projects-studio-secret', share: '\\\\127.0.0.1\\projects-studio' });
    await smb.connect();
    await smb.write('/backup/big.bin', payload);
    await smb.close();

    const writes = server.writes;
    assert.equal(writes.length, 3, `150000 bytes → 3 chunks (60416+60416+29168); got ${writes.length}`);
    assert.deepEqual(writes.map((w) => w.offset), [0, 60416, 120832], 'offsets advance by acked bytes — no skip, no repeat');
    for (const w of writes) assert.ok(w.length <= 60416, `no oversized WRITE frame (${w.length})`);
    assert.equal(writes[2].length, 29168, 'final chunk carries exactly the remainder');
    /* Command order includes TREE_DISCONNECT before LOGOFF. */
    const cmds = server.commands.map((c) => c.command);
    const disIdx = cmds.indexOf(SMB2_COM.TREE_DISCONNECT);
    const logIdx = cmds.indexOf(SMB2_COM.LOGOFF);
    assert.ok(disIdx > -1 && logIdx > disIdx, 'close() sends TREE_DISCONNECT then LOGOFF');
    /* All signed commands carry valid signatures. */
    for (const c of server.commands) {
      if (c.sigValid !== null) assert.equal(c.sigValid, true, `cmd=${c.command} signature valid`);
    }
  } finally {
    await server.close();
  }
});

test('partial-write knob: reply Count < chunk → re-issue from the un-acked offset (no hang, no repeat)', async () => {
  const payload = Buffer.from('partial-write round-trip payload bytes');
  const server = fakeSmb({ partialWrite: true });
  await server.listen();
  try {
    const smb = connectSmb({ host: '127.0.0.1', port: server.port(), user: 'projects-studio', domain: 'DOMAIN', password: 'projects-studio-secret', share: '\\\\127.0.0.1\\projects-studio' });
    await smb.connect();
    await smb.write('/backup/partial.bin', payload);
    const back = await smb.read('/backup/partial.bin');
    assert.ok(back.equals(payload), 'read-back equality despite halved acks');
    /* Offset continuity: every WRITE starts where the previous ACK
       left off (offset = sum of prior counts). */
    let expect = 0;
    for (const w of server.writes) {
      assert.equal(w.offset, expect, `WRITE re-issued from the un-acked offset (${w.offset} vs ${expect})`);
      expect += w.count;
    }
    assert.equal(expect, payload.length, 'sum of acked counts equals the payload length');
  } finally {
    await server.close();
  }
});

test('write-then-read round trip + rm recorded over the mock', async () => {
  const payload = Buffer.from('projects-studio smb round trip \xC2\xA9 bytes');
  const server = fakeSmb();
  await server.listen();
  try {
    const smb = connectSmb({ host: '127.0.0.1', port: server.port(), user: 'projects-studio', domain: 'DOMAIN', password: 'projects-studio-secret', share: '\\\\127.0.0.1\\projects-studio' });
    await smb.connect();
    await smb.write('/backup/rt.bin', payload);
    const back = await smb.read('/backup/rt.bin');
    assert.ok(back.equals(payload), 'read-back equality');
    await smb.rm('/backup/rt.bin');
    await smb.close();
    /* rm = CREATE (delete-on-close) → CLOSE. */
    const cmds = server.commands.map((c) => c.command);
    assert.ok(cmds.includes(SMB2_COM.CREATE), 'CREATE recorded for rm');
    const disIdx = cmds.indexOf(SMB2_COM.TREE_DISCONNECT);
    assert.ok(cmds.indexOf(SMB2_COM.LOGOFF) > disIdx, 'TREE_DISCONNECT → LOGOFF order');
  } finally {
    await server.close();
  }
});

test('single-chunk small write: exactly one ≤60416 WRITE frame, read matches', async () => {
  const payload = Buffer.from('tiny');
  const server = fakeSmb();
  await server.listen();
  try {
    const smb = connectSmb({ host: '127.0.0.1', port: server.port(), user: 'projects-studio', domain: 'DOMAIN', password: 'projects-studio-secret', share: '\\\\127.0.0.1\\projects-studio' });
    await smb.connect();
    await smb.write('/backup/tiny.bin', payload);
    assert.deepEqual(server.writes.map((w) => [w.offset, w.length]), [[0, 4]], 'one WRITE frame');
    assert.ok((await smb.read('/backup/tiny.bin')).equals(payload));
    await smb.close();
  } finally {
    await server.close();
  }
});

/* ------------- Task 3: sessionExpired envelope + class map ------------- */

test('sessionExpired mid-WRITE → re-SESSION_SETUP on same transport, replay with FRESH MessageId at the SAME offset', async () => {
  const payload = Buffer.from('expiry-resume payload');
  const server = fakeSmb({ expireCounts: { [SMB2_COM.WRITE]: 1 } });
  await server.listen();
  try {
    const smb = connectSmb({ host: '127.0.0.1', port: server.port(), user: 'projects-studio', domain: 'DOMAIN', password: 'projects-studio-secret', share: '\\\\127.0.0.1\\projects-studio' });
    await smb.connect();
    await smb.write('/backup/exp.bin', payload);
    const back = await smb.read('/backup/exp.bin');
    assert.ok(back.equals(payload), 'data intact after the expiry + replay');

    const cmds = server.commands;
    /* The expiry reply was served for the FIRST WRITE attempt. */
    const expiryReplies = server.replies.filter((h) => h.status === 0xc000005a);
    assert.equal(expiryReplies.length, 1, 'exactly one sessionExpired reply injected');
    /* Re-auth round: 4 SESSION_SETUPs total (initial pair + re-auth pair). */
    const setups = cmds.filter((c) => c.command === SMB2_COM.SESSION_SETUP);
    assert.equal(setups.length, 4, `initial + re-auth SESSION_SETUP rounds (got ${setups.length})`);
    /* Replay: fresh MessageId. `writes` records only storage-backed
       (successful) writes — the expiry reply never reached storage. */
    const writes = cmds.filter((c) => c.command === SMB2_COM.WRITE);
    assert.equal(writes.length, 2, 'the WRITE was replayed exactly once');
    assert.ok(writes[1].messageId > writes[0].messageId, `fresh MessageId on replay (${writes[1].messageId} > ${writes[0].messageId})`);
    assert.deepEqual(server.writes.map((w) => w.offset), [0], 'replay landed at the failed chunk offset 0 (no restart, no duplication)');
    /* Signatures valid across the re-auth boundary. */
    for (const c of cmds) {
      if (c.sigValid !== null) assert.equal(c.sigValid, true, `cmd=${c.command} signature valid after re-auth`);
    }
  } finally {
    await server.close();
  }
});

test('expiry storm → caps 1/command + 2/session surface smbClass sessionExpired', async () => {
  const server = fakeSmb({ expireAttemptCounts: { [SMB2_COM.ECHO]: 3 } });
  await server.listen();
  try {
    const smb = connectSmb({ host: '127.0.0.1', port: server.port(), user: 'projects-studio', domain: 'DOMAIN', password: 'projects-studio-secret', share: '\\\\127.0.0.1\\projects-studio' });
    await smb.connect();
    await smb.echo(); // expiry #1 → replay OK (count 1)
    await smb.echo(); // expiry #2 → replay OK (count 2)
    await assert.rejects(
      smb.echo(),   // expiry #3 → at cap
      (err) => {
        assert.equal(err.code, 'smbSessionExpired');
        assert.equal(err.smbClass, 'sessionExpired');
        return true;
      },
      'the third expiry surfaces sessionExpired instead of looping',
    );
    const debug = await smb.__debug();
    assert.equal(debug.sessionExpiredCount, 2, 'exactly 2 lifetime replays consumed');
    /* Expiry replies recorded ×3, successful replays ×2. */
    const echoes = server.commands.filter((c) => c.command === SMB2_COM.ECHO);
    assert.equal(echoes.length, 5, '3 expiring echoes + 2 successful replays (3rd never replayed)');
  } finally {
    await server.close();
  }
});

/* ---------------- per-class error scenarios (SC-3 map) ---------------- */

test('LOGON_FAILED on final SESSION_SETUP → authFailed', async () => {
  const server = fakeSmb({ sessionSetupStatus: 0xc000006d });
  await server.listen();
  try {
    const smb = connectSmb({ host: '127.0.0.1', port: server.port(), user: 'projects-studio', domain: 'DOMAIN', password: 'wrong-password', share: '\\\\h\\s' });
    await assert.rejects(smb.connect(), (err) => {
      assert.equal(err.code, 'smbAuthFailed');
      assert.equal(err.smbClass, 'authFailed');
      return true;
    });
  } finally {
    await server.close();
  }
});

test('BAD_NETWORK_NAME → shareNotFound; ACCESS_DENIED → treeConnectFailed', async () => {
  const server = fakeSmb({ treeConnectStatus: 0xc00000cc });
  await server.listen();
  try {
    const smb = connectSmb({ host: '127.0.0.1', port: server.port(), user: 'projects-studio', domain: 'DOMAIN', password: 'projects-studio-secret', share: '\\\\h\\missing' });
    await assert.rejects(smb.connect(), (err) => err.smbClass === 'shareNotFound' && err.code === 'smbShareNotFound');
  } finally {
    await server.close();
  }
  const server2 = fakeSmb({ treeConnectStatus: 0xc0000022 });
  await server2.listen();
  try {
    const smb = connectSmb({ host: '127.0.0.1', port: server2.port(), user: 'projects-studio', domain: 'DOMAIN', password: 'projects-studio-secret', share: '\\\\h\\denied' });
    await assert.rejects(smb.connect(), (err) => err.smbClass === 'treeConnectFailed' && err.code === 'smbTreeConnectFailed');
  } finally {
    await server2.close();
  }
});

test('DISK_FULL on WRITE → noSpace; OBJECT_NAME_COLLISION on CREATE → nameConflict', async () => {
  const server = fakeSmb({ writeStatus: 0xc000007f });
  await server.listen();
  try {
    const smb = connectSmb({ host: '127.0.0.1', port: server.port(), user: 'projects-studio', domain: 'DOMAIN', password: 'projects-studio-secret', share: '\\\\h\\projects-studio' });
    await smb.connect();
    await assert.rejects(
      smb.write('/backup/full.bin', Buffer.from('x')),
      (err) => err.smbClass === 'noSpace' && err.code === 'smbNoSpace',
    );
    await smb.close();
  } finally {
    await server.close();
  }
  const server2 = fakeSmb({ createStatus: 0xc0000035 });
  await server2.listen();
  try {
    const smb = connectSmb({ host: '127.0.0.1', port: server2.port(), user: 'projects-studio', domain: 'DOMAIN', password: 'projects-studio-secret', share: '\\\\h\\projects-studio' });
    await smb.connect();
    await assert.rejects(
      smb.write('/backup/collision.bin', Buffer.from('x')),
      (err) => err.smbClass === 'nameConflict' && err.code === 'smbNameConflict',
    );
    await smb.close();
  } finally {
    await server2.close();
  }
});

/* ---------------- dialect / signing-agreement knobs (OQ-3, T-99-05) ---------------- */

test('dialect refusal (0x0300 reply) → generic + smbDialectUnsupported (OQ-3 adopted resolution)', async () => {
  const server = fakeSmb({ dialectReply: 0x0300 });
  await server.listen();
  try {
    const smb = connectSmb({ host: '127.0.0.1', port: server.port(), user: 'projects-studio', domain: 'DOMAIN', password: 'projects-studio-secret', share: '\\\\h\\s' });
    await assert.rejects(smb.connect(), (err) => {
      assert.equal(err.code, 'smbDialectUnsupported');
      assert.equal(err.smbClass, 'generic', 'dialect-mismatch stays generic — NOT signingRequired');
      return true;
    });
  } finally {
    await server.close();
  }
});

test('signing-not-agreed SecurityMode → signingRequired abort (T-99-05, SC-2 explicit path)', async () => {
  const server = fakeSmb({ securityMode: 0x0000 });
  await server.listen();
  try {
    const smb = connectSmb({ host: '127.0.0.1', port: server.port(), user: 'projects-studio', domain: 'DOMAIN', password: 'projects-studio-secret', share: '\\\\h\\s' });
    await assert.rejects(smb.connect(), (err) => {
      assert.equal(err.code, 'smbSigningRequired');
      assert.equal(err.smbClass, 'signingRequired');
      return true;
    });
  } finally {
    await server.close();
  }
});

/* ---------------- D-04 scrub across every error path ---------------- */

test('D-04 scrub: no type-3 / NT-response / password material in ANY surfaced error message', async () => {
  const PASSWORD = 'top-secret-password-123';
  const scenarios = [
    { knob: { wrongSigningKey: true } },
    { knob: { sessionSetupStatus: 0xc000006d }, password: PASSWORD },
    { knob: { treeConnectStatus: 0xc00000cc } },
    { knob: { treeConnectStatus: 0xc0000022 } },
    { knob: { createStatus: 0xc0000035 } },
    { knob: { writeStatus: 0xc000007f } },
    { knob: { dialectReply: 0x0300 } },
    { knob: { securityMode: 0x0000 } },
    { knob: { nbssRefuse: true } },
    { knob: { expireCounts: { [SMB2_COM.ECHO]: 3 } } },
  ];
  const errors = [];
  for (const { knob, password } of scenarios) {
    const server = fakeSmb(knob);
    await server.listen();
    try {
      const smb = connectSmb({
        host: '127.0.0.1', port: server.port(),
        user: 'projects-studio', domain: 'DOMAIN', password: password ?? 'projects-studio-secret',
        share: '\\\\h\\s',
      }, /* nbssRefuse tests the 139-style path (2026-11-26 direct-445 fix) */ knob.nbssRefuse ? { nbss: true } : {});
      try {
        await smb.connect();
        await smb.echo().catch((e) => errors.push(e));
        await smb.write('/x.bin', Buffer.from('x')).catch((e) => errors.push(e));
      } catch (e) {
        errors.push(e);
      }
    } finally {
      await server.close();
    }
  }
  const refused = connectSmb({ host: '127.0.0.1', port: 1, user: 'u', domain: 'D', password: PASSWORD, share: '\\\\h\\s' });
  await refused.connect().catch((e) => errors.push(e));

  assert.ok(errors.length >= 8, `error scenarios produced errors (got ${errors.length})`);
  for (const err of errors) {
    const msg = String(err?.message ?? '');
    assert.ok(!msg.includes('NTLMSSP'), `no NTLMSSP marker in: ${msg}`);
    assert.ok(!msg.includes(PASSWORD), `no password material in: ${msg}`);
    assert.ok(!/[0-9a-f]{64}/i.test(msg), `no NT-response-scale hex in: ${msg}`);
    assert.ok(msg.length <= 300, 'message sliced ≤300');
    assert.ok(err.smbClass, 'keyed smbClass present');
    assert.ok(err.code?.startsWith('smb'), 'keyed code present');
  }
});

/* =====================================================================
   Phase 100 plan 01 — Task 1: pathNotFound class + guest detection
   ===================================================================== */

test('NTSTATUS 0xc0000034 maps to pathNotFound; the pre-existing 9 mappings stay intact (additive enum)', async () => {
  const { SMB_ERROR_CLASSES, smbErrorFrom } = await import('../export/smb.js');
  /* Regression pins: every pre-existing code → its existing class. */
  const expected = {
    0xc000006d: 'authFailed',
    0xc000006a: 'authFailed',
    0xc0000064: 'authFailed',
    0xc00000cc: 'shareNotFound',
    0xc0000022: 'treeConnectFailed',
    0xc0000035: 'nameConflict',
    0xc000007f: 'noSpace',
    0xc0000044: 'noSpace',
    0xc000005a: 'sessionExpired',
  };
  for (const [status, cls] of Object.entries(expected)) {
    assert.equal(smbErrorFrom(Number(status)).smbClass, cls, `0x${Number(status).toString(16)} still maps to ${cls}`);
  }
  /* The additive entry. */
  assert.equal(SMB_ERROR_CLASSES[0xc0000034], 'pathNotFound');
  const err = smbErrorFrom(0xc0000034);
  assert.equal(err.smbClass, 'pathNotFound');
  assert.equal(err.code, 'smbPathNotFound');
  /* UAT 2026-11-27: the OTHER not-found statuses DSM answers a
     CREATE-on-deleted-file with — PATH_NOT_FOUND and DELETE_PENDING map
     to pathNotFound too (the read-back's mirror-flag clearing keys on
     this class; a generic miss never clears the badge). */
  for (const status of [0xc000003a, 0xc0000056]) {
    const e = smbErrorFrom(status);
    assert.equal(e.smbClass, 'pathNotFound', `0x${status.toString(16)} maps to pathNotFound`);
    assert.equal(e.code, 'smbPathNotFound');
  }
});

test('OBJECT_NAME_NOT_FOUND on CREATE → pathNotFound over the wire', async () => {
  const server = fakeSmb({ createStatus: 0xc0000034 });
  await server.listen();
  try {
    const smb = connectSmb({ host: '127.0.0.1', port: server.port(), user: 'projects-studio', domain: 'DOMAIN', password: 'projects-studio-secret', share: '\\\\h\\projects-studio' });
    await smb.connect();
    await assert.rejects(
      smb.write('/backup/missing.bin', Buffer.from('x')),
      (err) => err.smbClass === 'pathNotFound' && err.code === 'smbPathNotFound',
    );
    await smb.close();
  } finally {
    await server.close();
  }
});

test('guest detection: SessionFlags bit 0x0001 at reply-body offset 2 → __debug().guestSession', async () => {
  for (const [flags, want] of [[0x0001, true], [0x0000, false], [0x0002, false]]) {
    const server = fakeSmb({ sessionFlags: flags });
    await server.listen();
    try {
      const smb = connectSmb({ host: '127.0.0.1', port: server.port(), user: 'projects-studio', domain: 'DOMAIN', password: 'projects-studio-secret', share: '\\\\h\\s' });
      await smb.connect();
      const debug = await smb.__debug();
      assert.equal(debug.guestSession, want, `SessionFlags 0x${flags.toString(16)} → guestSession ${want}`);
      await smb.close();
    } finally {
      await server.close();
    }
  }
});

test('export/smb.js imports only node: builtins (zero new dependencies)', () => {
  const src = fs.readFileSync(new URL('../export/smb.js', import.meta.url), 'utf8');
  const imports = [...src.matchAll(/^import .* from '([^']+)';?\s*$/gm)].map((m) => m[1]);
  assert.ok(imports.length >= 2, `imports found (${imports.length})`);
  for (const i of imports) assert.ok(i.startsWith('node:'), `non-builtin import: ${i}`);
});

/* =====================================================================
   Phase 100 plan 01 — Task 2: probeSmb + fetchSmbToStaged
   ===================================================================== */

const smbProbeConfig = (port) => ({ host: '127.0.0.1', port, user: 'projects-studio', domain: 'DOMAIN', password: 'projects-studio-secret', share: '\\\\127.0.0.1\\projects-studio' });

test('UAT 2026-11-26: a silent host (TCP accepts, NBSS never answers) no longer hangs forever — bounded establish timeout rejects keyed unreachable', async () => {
  const { connectSmb } = await import('../export/smb.js');
  const net = await import('node:net');
  const silent = net.createServer(() => { /* accept, never respond */ });
  await new Promise((r) => silent.listen(0, '127.0.0.1', r));
  try {
    const smb = connectSmb(smbProbeConfig(silent.address().port), { connectTimeoutMs: 150 });
    await assert.rejects(
      smb.connect(),
      (err) => err.smbClass === 'unreachable',
      'the establish timeout maps onto the keyed unreachable class',
    );
  } finally {
    silent.close();
  }
});

test('probeSmb happy path → keyed { ok: true, key: "success" }, no httpWarning key, marker written then removed', async () => {
  const { probeSmb } = await import('../export/smb.js');
  const server = fakeSmb();
  await server.listen();
  try {
    const result = await probeSmb(smbProbeConfig(server.port()));
    assert.deepEqual(result, { ok: true, key: 'success', warning: false });
    assert.ok(!('httpWarning' in result), 'R-3: no httpWarning anywhere in the SMB probe contract');
    /* Marker under the backup-smb/ prefix; the probe ends with its rm. */
    const src = fs.readFileSync(new URL('../export/smb.js', import.meta.url), 'utf8');
    assert.ok(/backup-smb\/probe-/.test(src), 'marker lives under the backup-smb/ prefix');
    const cmds = server.commands.map((c) => c.command);
    assert.ok(cmds.includes(SMB2_COM.CREATE) && cmds.includes(SMB2_COM.WRITE), 'probe wrote its marker');
  } finally {
    await server.close();
  }
});

test('probeSmb marker rm failure → HARD refuse { ok: false, key: "deleteFailed" }, warning stays false', async () => {
  const { probeSmb } = await import('../export/smb.js');
  const server = fakeSmb({ closeStatus: 0xc0000022, _closeOk: 1 }); // mkdir CLOSE ok → marker rm's CLOSE fails
  await server.listen();
  try {
    const result = await probeSmb(smbProbeConfig(server.port()));
    assert.deepEqual(result, { ok: false, key: 'deleteFailed', warning: false });
  } finally {
    await server.close();
  }
});

test('probeSmb connect/auth failures map to keyed class results — no config, credentials, or error text leaks', async () => {
  const { probeSmb } = await import('../export/smb.js');
  /* unreachable */
  const dead = await probeSmb({ host: '127.0.0.1', port: 1, user: 'secret-user', domain: 'D', password: 'secret-pass', share: '\\\\h\\s' });
  assert.equal(dead.ok, false);
  assert.equal(dead.key, 'unreachable');
  /* authFailed */
  const server = fakeSmb({ sessionSetupStatus: 0xc000006d });
  await server.listen();
  try {
    const result = await probeSmb({ ...smbProbeConfig(server.port()), password: 'wrong-password' });
    assert.equal(result.ok, false);
    assert.equal(result.key, 'authFailed');
    const flat = JSON.stringify(result);
    assert.ok(!flat.includes('secret'), 'no credential material in the result');
    assert.ok(!('error' in result), 'no raw error text rides the keyed result');
  } finally {
    await server.close();
  }
});

test('probeSmb with a guest session → result.guest === true on success', async () => {
  const { probeSmb } = await import('../export/smb.js');
  const server = fakeSmb({ sessionFlags: 0x0001 });
  await server.listen();
  try {
    const result = await probeSmb(smbProbeConfig(server.port()));
    assert.equal(result.ok, true);
    assert.equal(result.guest, true);
  } finally {
    await server.close();
  }
});

test('fetchSmbToStaged: matching sha256 → staging file with identical bytes; mismatch → keyed refusal, no file left behind', async () => {
  const { fetchSmbToStaged } = await import('../export/smb.js');
  const payload = Buffer.from('projects-studio smb staged fetch payload');
  const sha = crypto.createHash('sha256').update(payload).digest('hex');
  const server = fakeSmb();
  await server.listen();
  const staging = fs.mkdtempSync('/tmp/opencode/smb-staging-');
  try {
    const smb = connectSmb(smbProbeConfig(server.port()));
    await smb.connect();
    await smb.write('/backup/staged.bin', payload);
    await smb.close();

    const { tmpPath } = await fetchSmbToStaged(smbProbeConfig(server.port()), '/backup/staged.bin', sha, staging);
    assert.ok(tmpPath.startsWith(staging), 'tmpPath lives under stagingDir');
    assert.ok(fs.readFileSync(tmpPath).equals(payload), 'staged bytes identical');

    await assert.rejects(
      fetchSmbToStaged(smbProbeConfig(server.port()), '/backup/staged.bin', 'deadbeef'.repeat(8), staging),
      (err) => err.code === 'smbSha256Mismatch',
      'sha256 mismatch refuses keyed (T-98-06 discipline)',
    );
    const leftovers = fs.readdirSync(staging).filter((f) => f.startsWith('smb-download-'));
    assert.deepEqual(leftovers.filter((f) => {
      const buf = fs.readFileSync(`${staging}/${f}`);
      return !buf.equals(payload);
    }), [], 'no mismatched staging file left behind');
  } finally {
    await server.close();
    fs.rmSync(staging, { recursive: true, force: true });
  }
});

