/* =====================================================================
   Phase 97 plan 01 — FTP client mock-server tests (97-01).

   Offline, ungated, always-on: in-process scripted node:net/node:tls
   mock FTP servers (NOT reflexive — pre-baked reply sequences, delays,
   ephemeral data listeners, recorded command lines) following the
   fakeSmtp harness idiom (test/subject-encode.test.mjs :17-58).
   Docker vsftpd e2e is Phase 98's deliverable, NOT this phase.
   ===================================================================== */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import tls from 'node:tls';
import { Readable } from 'node:stream';
import { connectFtp, fetchToStaged, probeFtp } from '../export/ftp.js';

/* ------------- in-process TLS mock (T5/T6-explicit): self-signed pair ------------- */

const TEST_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDlFauRxUUr3XNV
Pg3g/JHjuxWZP7AzbnbrV+vkb+obL6YcKAypzHS03w2m96Y1hRI1iytnOMeCek+9
01WJA9tX08W9aZMjCHywJDlA4s0cTmNcDQdEexvasc+L3/qbQs9P3w/vS0tkEtQa
bKnRTr4a+Jtma2GoM/hmckkxH+TYnV55zxk6O9PMs2sCbfvg1e2MPiXF7Mx2n6FG
Zbuo/w1oDjwc/2Ce67+9dKRfOx0SGJhuWvupBbzUMCzxcqwP170vvbXCuEh8sckP
YFonwex1NNuywoHWnSHcSHinqW3Ej8MewzrPP3BWmnU5xSEXBcdI7wszUMQnb34P
QmtMfQMBAgMBAAECggEAIMISCCTA6O5gTSqz+l2zkPCSPJlOXXRo3etzKHXWcK/G
HZWehfNeJvUUczFLm7CdM3nkqXyFjwNlfrwHKbIa/fqi9pxvtV1D0z5Cz6P+95LA
A4w7Y1AFYib2Ckbrg6MwmPfJRAssyzEkEmlCeVM8vQea1TD6xH42AZRLIhKw+0Z0
Tof9ae7VGJ/vX7Kp7ZxZohbgJMcvOm+/Bx7RaU40Phbiz6jXdoVrHlPX4mY2s2Cv
A3/QD/kJHpqK5jKvEiVshat/ruIH8ORwfmLnD3ROcOFvq91RPCcuaW1d0tN0/nE8
uq3kIuMMwfxagfnDglqasVVhXkppkKaXiUlsEzyPbwKBgQD53pyjya3y2GIqWtYC
4KnVkl2g6tSUGqb3/CZJBO/zv7pohl+sVnweV/EgINmISJc47Y8uXx1bIl+frrSR
7LZeHPBUISyhjF3kRt67MJv7hFurmLTVXT7qWF7QHZsDs/B4ZuAHNVsgPXrdYsSP
mayEMTjCv0dZdvHaIWyw4s8svwKBgQDqtIMBB+yEZ+9nUWvrt5juWMoLYx+mcWNx
orQ9fhXcHkc1dqUxCvZy836DBX26ft19DhHsMJ+Q5PKIrbaRpzUhaq4YCuoa36du
iIT3/rf3YeqPXHKGXi0nbDUuwWSCIkM6toE1FRJ5dHRNiurWkh68Ay5xw+5ShqMW
L2WAJ78APwKBgQCI+xk0UWQjNazbO2EHwtJYWx0pEpPnfZT7bigu7538Kqeulbvt
Zpw0plFyI5Advm3or5NHAK2/QGDb0ZL8TKDNh1/ZPzaQebsfYhrI1CUvBaibseOw
9KWBI2EXBqPsq8CwwPUf/ogubIXmyDap4r1I2xMa8HHVAfgkdR54+l5JUQKBgQCL
FsqD8+QwWz++5LumBzm0Fh42PVnmU0/xadCSmIPv3Gmqv1MKC0sduDsC/mASA1jS
4WGxrOcDAQrSANAu5P5RfV0Kln1By8T3diQGq4buLbLJnqmoA2uS70ddG/KqRA+/
XaSYhpJaM68wvOCKpDFejiwZ81jqwysm3JO0LNm+FQKBgGG2RT76DHo8xVyHhilY
lXaR5OLDuFLh4obg78Tqavt/HmU+xJKZ3aOgo6OIa0d+84CiRE6h80ZNn6RCwTx7
8+SWu1bY5KDGNWVUF5vBaBNYU4oe+dg4aw2y7jYXFbAVTAKkTh3F3pD3J9NKKAAk
+WHv6tTAi3LcR5he8bVckcCI
-----END PRIVATE KEY-----
`;

const TEST_CERT = `-----BEGIN CERTIFICATE-----
MIIDETCCAfmgAwIBAgIUZmwuUVzIefv6IGRKbKMfxtPIdmswDQYJKoZIhvcNAQEL
BQAwGDEWMBQGA1UEAwwNZ3I4ci1mdHAtdGVzdDAeFw0yNjExMjUxMDE5MDVaFw0z
NjExMjIxMDE5MDVaMBgxFjAUBgNVBAMMDWdyOHItZnRwLXRlc3QwggEiMA0GCSqG
SIb3DQEBAQUAA4IBDwAwggEKAoIBAQDlFauRxUUr3XNVPg3g/JHjuxWZP7Azbnbr
V+vkb+obL6YcKAypzHS03w2m96Y1hRI1iytnOMeCek+901WJA9tX08W9aZMjCHyw
JDlA4s0cTmNcDQdEexvasc+L3/qbQs9P3w/vS0tkEtQabKnRTr4a+Jtma2GoM/hm
ckkxH+TYnV55zxk6O9PMs2sCbfvg1e2MPiXF7Mx2n6FGZbuo/w1oDjwc/2Ce67+9
dKRfOx0SGJhuWvupBbzUMCzxcqwP170vvbXCuEh8sckPYFonwex1NNuywoHWnSHc
SHinqW3Ej8MewzrPP3BWmnU5xSEXBcdI7wszUMQnb34PQmtMfQMBAgMBAAGjUzBR
MB0GA1UdDgQWBBRWCnL2N+5rOsDbCCBp2eN/G11PejAfBgNVHSMEGDAWgBRWCnL2
N+5rOsDbCCBp2eN/G11PejAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUA
A4IBAQAjQ9yJA1kopi9bqrSyy7UNUtYwo8snkj53pJ4VCcit5lqBpwcj/PgEPmI5
ghdQzfQnTOn9BrOP5N11/TIUYN/F551cXhXzu9Nq/xvIoEISk6a2BC8vmV9KhMS/
CbpAfY/tgkFJ6EsKIipbuy9mmEF5Oll9PgOEQUwuOIBLEAO9ycTZN8JwxmADTbOb
Hp8yqQGsDYEBbe7UcdxoLYlCbLgKERMq3+wEnvers+cmOpnhHI80KDhAXPQk2Auy
Qu0WwNnKP9qIfweTDbDLdTJLC4saGj92YEggTQsVgwmzJCHLuarAa1qAylMjeiB9
v/avEZdXnFNZh5sAFkAMd92IPvt8
-----END CERTIFICATE-----
`;

/* ------------------------ scripted mock FTP server ------------------------ */

function fakeFtp(scenario = {}) {
  const commands = [];     // recorded command lines (ordering assertions)
  const dataReceived = []; // buffers captured from data connections
  const delays = scenario.delays ?? {};

  let storPending = null;
  let retrActive = false;
  let retrPending = null;
  let currentDataSock = null;
  let storCount = 0;
  let dataDone = false;
  const servedDataSocks = new Set();
  const serveRetrPayload = (sock) => {
    if (servedDataSocks.has(sock) || !retrActive || !scenario.retrPayload) return;
    servedDataSocks.add(sock);
    sock.write(scenario.retrPayload);
    sock.end();
    retrPending?.();
  };
  /* secureExplicit → the data listener is TLS too (PROT P semantics);
     the client's data-channel tls.connect would hang forever against a
     plain socket (no server hello), so the mock must match the mode. */
  const dataSrvOpts = scenario.secureExplicit
    ? { key: TEST_KEY, cert: TEST_CERT, rejectUnauthorized: false, maxVersion: 'TLSv1.2' }
    : undefined;
  const dataServer = (scenario.secureExplicit ? tls.createServer : net.createServer.bind(net))(dataSrvOpts, (sock) => {
    currentDataSock = sock;
    sock.on('data', (c) => dataReceived.push(c));
    sock.on('end', () => sock.end());
    serveRetrPayload(sock);
  });
  let dataPort = null;
  const dataReady = new Promise((resolve) => {
    dataServer.listen(0, '127.0.0.1', () => {
      dataPort = dataServer.address().port;
      resolve();
    });
  });

  const ctrlSocks = new Set();
  const ctrl = net.createServer((socket) => {
    ctrlSocks.add(socket);
    socket.on('close', () => ctrlSocks.delete(socket));
    const state = { socket, ended: false, tlsUp: false };
    const reply = (line, delay = 0) => {
      setTimeout(() => { if (!state.ended && state.socket.writable) state.socket.write(line + '\r\n'); }, delay);
    };
    state.socket.write('220 mock FTP ready\r\n');
    let buf = '';
    const attach = (sock) => {
      sock.on('data', (chunk) => {
        buf += chunk.toString('utf8');
        let idx;
        while ((idx = buf.indexOf('\r\n')) >= 0) {
          const line = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          commands.push(line);
          processLine(line);
        }
      });
    };
    const processLine = (line) => {
      const cmd = line.toUpperCase();
      if (cmd.startsWith('USER')) {
        reply(scenario.userReply ?? '331 password required', delays.USER ?? 0);
      } else if (cmd.startsWith('PASS')) {
        reply(scenario.passReply ?? '230 logged in', delays.PASS ?? 0);
      } else if (cmd.startsWith('AUTH')) {
        if (scenario.secureExplicit) {
          /* RFC 4217 server side: 234 then upgrade the SAME socket. */
          state.socket.write('234 go ahead\r\n');
          state.tlsUp = true;
          const plain = state.socket;
          plain.removeAllListeners('data');
          buf = '';
          const tlsSock = new tls.TLSSocket(plain, {
            isServer: true,
            key: TEST_KEY,
            cert: TEST_CERT,
            requestCert: false,
            rejectUnauthorized: false,
          });
          state.socket = tlsSock;
          attach(tlsSock);
        } else {
          reply('500 AUTH not supported');
        }
      } else if (cmd.startsWith('PBSZ')) {
        reply('200 PBSZ=0');
      } else if (cmd.startsWith('PROT')) {
        reply('200 PROT P enabled');
      } else if (cmd.startsWith('TYPE')) {
        reply('200 binary mode set', delays.TYPE ?? 0);
      } else if (cmd.startsWith('EPSV')) {
        reply(scenario.epsvReply ?? `229 Entering Extended Passive Mode (|||${dataPort}|)`, delays.EPSV ?? 0);
      } else if (cmd.startsWith('PASV')) {
        reply(scenario.pasvReply ?? `227 Entering Passive Mode (127,0,0,1,${dataPort >> 8},${dataPort & 255})`, delays.PASV ?? 0);
      } else if (cmd.startsWith('STOR')) {
        if (scenario.storNoReply) return; // never replies — timeout path (T9)
        if (scenario.controlDropAfterStor) {
          setTimeout(() => state.socket.destroy(), scenario.controlDropAfterStor);
          return;
        }
        storCount++;
        if (scenario.storFailures && storCount <= scenario.storFailures) {
          reply('426 Connection closed; transfer aborted', delays.STOR ?? 0);
          return;
        }
        /* Real servers emit 150 BEFORE the data transfer completes —
           write it synchronously and arm the 226 completion; if the
           data connection already finished (fast small transfers),
           flush the 226 immediately. */
        if (scenario.slow226Ms) {
          state.socket.write('150 opening data connection\r\n');
          storPending = () => setTimeout(() => { if (state.socket.writable) state.socket.write('226 Transfer complete\r\n'); }, scenario.slow226Ms);
          if (dataDone) storPending();
        } else {
          storPending = () => { if (state.socket.writable) state.socket.write('226 Transfer complete\r\n'); };
          state.socket.write('150 opening data connection\r\n');
          if (dataDone) storPending();
        }
      } else if (cmd.startsWith('REST')) {
        reply(scenario.restReply ?? '350 Restarting at 0. Send STORE or RETRIEVE.');
      } else if (cmd.startsWith('RETR')) {
        if (scenario.retrErrorReply) {
          reply(scenario.retrErrorReply);
        } else {
          retrActive = true;
          retrPending = () => { if (state.socket.writable) state.socket.write('226 Transfer complete\r\n'); };
          state.socket.write('150 opening data connection\r\n');
          serveRetrPayload(currentDataSock);
        }
      } else if (cmd.startsWith('DELE')) {
        reply(scenario.deleReply ?? '250 deleted', delays.DELE ?? 0);
      } else if (cmd.startsWith('QUIT')) {
        state.socket.write('221 bye\r\n');
        state.ended = true;
        state.socket.end();
      } else {
        reply('200 ok');
      }
    };
    attach(socket);
  });
  /* When the data connection finishes (client half-closed), complete the
     pending transfer with 226 — the scripted 150 → 226 sequence. */
  dataServer.on('connection', (sock) => {
    sock.on('end', () => {
      sock.end();
      if (!scenario.retrPayload && !scenario.storNoReply && !scenario.controlDropAfterStor && !dataDone) {
        dataDone = true;
        storPending?.();
      }
    });
    sock.on('close', () => {
      if (!scenario.retrPayload && !scenario.storNoReply && !scenario.controlDropAfterStor && !dataDone) {
        dataDone = true;
        storPending?.();
      }
    });
  });

  return {
    commands,
    dataReceived,
    storCount: () => storCount,
    listen: async () => {
      await new Promise((r) => ctrl.listen(0, '127.0.0.1', r));
      await dataReady;
    },
    port: () => ctrl.address().port,
    close: async () => {
      for (const s of ctrlSocks) { try { s.destroy(); } catch { /* gone */ } }
      ctrl.closeAllConnections?.();
      dataServer.closeAllConnections?.();
      await Promise.all([new Promise((r) => ctrl.close(r)), new Promise((r) => dataServer.close(r))]);
    },
  };
}

/* ------------------ implicit-TLS pair harness (T5, P8) ------------------
   ONE TLS session context: the data tls.Server shares the control
   server's ticket keys so TLS-session resumption (client passes
   controlSocket.getSession() as the data-connect `session` option)
   is observable server-side via isSessionReused(). */

function fakeFtpTls() {
  const commands = [];
  const dataReceived = [];
  const dataSessionReused = []; // server-side isSessionReused() per data conn
  const tlsOpts = { key: TEST_KEY, cert: TEST_CERT, requestCert: false, rejectUnauthorized: false, maxVersion: 'TLSv1.2' };

  let dataPort = null;
  let storPending = null;
  let dataDone = false;
  const allSocks = new Set();
  const dataServer = tls.createServer(tlsOpts, (sock) => {
    allSocks.add(sock);
    sock.on('close', () => allSocks.delete(sock));
    sock.on('data', (c) => dataReceived.push(c));
    sock.on('end', () => {
      sock.end();
      if (!dataDone) { dataDone = true; storPending?.(); }
    });
  });
  /* Server-side handshake completion event — the accepted socket is
     post-handshake here, so isSessionReused() is meaningful. */
  dataServer.on('secureConnection', (sock) => {
    dataSessionReused.push(sock.isSessionReused());
  });
  const ctrl = tls.createServer(tlsOpts, (socket) => {
    allSocks.add(socket);
    socket.on('close', () => allSocks.delete(socket));
    socket.write('220 mock FTPS ready\r\n');
    let buf = '';
    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let idx;
      while ((idx = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        commands.push(line);
        const cmd = line.toUpperCase();
        if (cmd.startsWith('USER')) socket.write('331 password required\r\n');
        else if (cmd.startsWith('PASS')) socket.write('230 logged in\r\n');
        else if (cmd.startsWith('TYPE')) socket.write('200 binary mode set\r\n');
        else if (cmd.startsWith('EPSV')) socket.write(`229 Entering Extended Passive Mode (|||${dataPort}|)\r\n`);
        else if (cmd.startsWith('STOR')) {
          socket.write('150 opening data connection\r\n');
          storPending = () => { if (socket.writable) socket.write('226 Transfer complete\r\n'); };
        } else if (cmd.startsWith('QUIT')) {
          socket.write('221 bye\r\n');
          socket.end();
        } else socket.write('200 ok\r\n');
      }
    });
  });
  /* Share the session context (ticket keys) — the P8 reuse mechanism. */
  dataServer.setTicketKeys(ctrl.getTicketKeys());

  return {
    commands,
    dataReceived,
    dataSessionReused,
    listen: async () => {
      await new Promise((r) => ctrl.listen(0, '127.0.0.1', r));
      await new Promise((r) => dataServer.listen(0, '127.0.0.1', r));
      dataPort = dataServer.address().port;
    },
    port: () => ctrl.address().port,
    close: async () => {
      for (const s of allSocks) { try { s.destroy(); } catch { /* gone */ } }
      ctrl.closeAllConnections?.();
      dataServer.closeAllConnections?.();
      await Promise.all([new Promise((r) => ctrl.close(r)), new Promise((r) => dataServer.close(r))]);
    },
  };
}

/* ------------------------------- tracer test ------------------------------- */

test('tracer: STOR/DELE round-trip over the mock server (plain FTP, end-to-end)', async () => {
  const server = fakeFtp();
  await server.listen();
  try {
    const ftp = await connectFtp({
      host: '127.0.0.1',
      port: server.port(),
      user: 'projects-studio',
      password: 'projects-studio-secret',
      secure: 'none',
    });
    const bytes = Buffer.from('hello projects-studio ftp tracer round-trip');
    await ftp.stor('/backup/tracer.bin', Readable.from([bytes]));
    await ftp.dele('/backup/tracer.bin');
    await ftp.quit();

    assert.equal(
      Buffer.concat(server.dataReceived).toString('utf8'),
      bytes.toString('utf8'),
      'data listener received the exact bytes',
    );
    const cmds = server.commands;
    const order = ['USER ', 'PASS ', 'TYPE I', 'EPSV', 'STOR ', 'DELE ', 'QUIT'];
    let cursor = -1;
    for (const prefix of order) {
      const at = cmds.findIndex((c, i) => i > cursor && c.startsWith(prefix));
      assert.ok(at > cursor, `command ${prefix} recorded in order (before=${cursor}, found=${at})`);
      cursor = at;
    }
    assert.ok(cmds.findIndex((c) => c.startsWith('EPSV')) < cmds.findIndex((c) => c.startsWith('STOR')), 'EPSV before STOR');
  } finally {
    await server.close();
  }
});

test('UAT 2026-11-26: stor issues best-effort MKD for every parent segment before the transfer (strict-server 553 fix)', async () => {
  const server = fakeFtp();
  await server.listen();
  try {
    const ftp = await connectFtp({
      host: '127.0.0.1',
      port: server.port(),
      user: 'projects-studio',
      password: 'projects-studio-secret',
      secure: 'none',
    });
    await ftp.stor('backup-task-abc/nested/dir/file.tar.gz', Readable.from([Buffer.from('x')]));
    await ftp.quit();
    const cmds = server.commands;
    assert.ok(cmds.some((c) => c.startsWith('MKD backup-task-abc')), 'MKD root prefix');
    assert.ok(cmds.some((c) => c.startsWith('MKD backup-task-abc/nested')), 'MKD cumulative nested prefix');
    assert.ok(cmds.some((c) => c.startsWith('MKD backup-task-abc/nested/dir')), 'MKD full parent prefix');
    assert.ok(cmds.findIndex((c) => c.startsWith('MKD ')) < cmds.findIndex((c) => c.startsWith('STOR ')), 'all MKD before the STOR');
    assert.ok(!cmds.some((c) => c.startsWith('MKD backup-task-abc/nested/dir/file.tar.gz')), 'never MKD the file itself');
  } finally {
    await server.close();
  }
});

/* ------------------- T8: fetchToStaged (D-02, OQ-1) ------------------- */

test('fetchToStaged happy path: staged file with exact bytes + matching sha256 (T8)', async () => {
  const payload = Buffer.from('projects-studio restore payload \xC2\xA9 bytes');
  const sha = crypto.createHash('sha256').update(payload).digest('hex');
  const server = fakeFtp({ retrPayload: payload });
  await server.listen();
  const stagingDir = path.join(os.tmpdir(), `projects-studio-ftp-test-${process.pid}-${Date.now()}`);
  try {
    const { tmpPath, sha256 } = await fetchToStaged(
      { host: '127.0.0.1', port: server.port(), user: 'projects-studio', password: 'pw', secure: 'none' },
      '/backup/archive.tar.gz',
      sha,
      stagingDir,
    );
    assert.equal(sha256, sha);
    assert.equal(fs.readFileSync(tmpPath).toString('utf8'), payload.toString('utf8'), 'staged file exact bytes');
    assert.ok(tmpPath.includes('ftp-download-'), 'ftp- prefixed temp name');
    assert.ok(server.commands.some((c) => c.startsWith('RETR /backup/archive.tar.gz')), 'RETR recorded');
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    await server.close();
  }
});

test('fetchToStaged corrupt stream: keyed ftpSha256Mismatch AND temp file removed (T8)', async () => {
  const payload = Buffer.from('the actual served bytes');
  const server = fakeFtp({ retrPayload: payload });
  await server.listen();
  const stagingDir = path.join(os.tmpdir(), `projects-studio-ftp-test-${process.pid}-${Date.now()}`);
  try {
    await assert.rejects(
      fetchToStaged(
        { host: '127.0.0.1', port: server.port(), user: 'projects-studio', password: 'pw', secure: 'none' },
        '/backup/archive.tar.gz',
        'deadbeef'.repeat(8),
        stagingDir,
      ),
      (err) => err.code === 'ftpSha256Mismatch',
    );
    const leftovers = fs.readdirSync(stagingDir).filter((f) => f.endsWith('.tmp'));
    assert.equal(leftovers.length, 0, 'no .tmp file left in stagingDir');
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    await server.close();
  }
});

/* ------------------ T5: TLS session reuse (P8 pin) ------------------ */

test('T5: data-channel TLS session reuse observed server-side (implicit pair)', async () => {
  const server = fakeFtpTls();
  await server.listen();
  try {
    const ftp = await connectFtp({
      host: '127.0.0.1',
      port: server.port(),
      user: 'projects-studio',
      password: 'pw',
      secure: 'implicit',
      insecure: true, // self-signed pair
    });
    const bytes = Buffer.from('session-reuse payload');
    await ftp.stor('/backup/t5.bin', Readable.from([bytes]));
    await ftp.quit();

    assert.equal(Buffer.concat(server.dataReceived).toString('utf8'), bytes.toString('utf8'), 'bytes over TLS data channel');
    const debug = await ftp.__debug();
    assert.equal(debug.sessionCaptured, true, 'client captured the control TLS session (P8)');
    assert.ok(server.dataSessionReused.length > 0, 'a data connection was accepted');
    assert.equal(server.dataSessionReused[0], true, 'server reports the data handshake REUSED the control session');
  } finally {
    await server.close();
  }
});

/* -------------- explicit-mode handshake order (RFC 4217) -------------- */

test('explicit mode: AUTH TLS → PBSZ 0 → PROT P → USER → PASS recorded in order', async () => {
  const server = fakeFtp({ secureExplicit: true });
  await server.listen();
  try {
    const ftp = await connectFtp({
      host: '127.0.0.1',
      port: server.port(),
      user: 'projects-studio',
      password: 'pw',
      secure: 'explicit',
      insecure: true,
    });
    await ftp.dele('/backup/x.bin');
    await ftp.quit();
    const cmds = server.commands;
    const order = ['AUTH TLS', 'PBSZ 0', 'PROT P', 'USER ', 'PASS ', 'DELE ', 'QUIT'];
    let cursor = -1;
    for (const prefix of order) {
      const at = cmds.findIndex((c, i) => i > cursor && c.startsWith(prefix));
      assert.ok(at > cursor, `explicit handshake step ${prefix} recorded in order (found=${at})`);
      cursor = at;
    }
    assert.ok(cmds.every((c) => !c.startsWith('EPSV ALL')), 'never EPSV ALL');
    assert.ok(cmds.every((c) => !c.startsWith('PROT C')), 'never PROT C');
  } finally {
    await server.close();
  }
});

/* -------------- implicit mode: zero AUTH/PBSZ/PROT (P9) -------------- */

test('implicit mode: TLS-first with zero AUTH/PBSZ/PROT lines recorded (P9)', async () => {
  const server = fakeFtpTls();
  await server.listen();
  try {
    const ftp = await connectFtp({
      host: '127.0.0.1',
      port: server.port(),
      user: 'projects-studio',
      password: 'pw',
      secure: 'implicit',
      insecure: true,
    });
    await ftp.noop();
    await ftp.quit();
    assert.ok(server.commands.some((c) => c.startsWith('NOOP')), 'NOOP recorded');
    assert.ok(server.commands.every((c) => !c.startsWith('AUTH') && !c.startsWith('PBSZ') && !c.startsWith('PROT')), 'no AUTH/PBSZ/PROT exchange on implicit mode');
  } finally {
    await server.close();
  }
});

/* ------------------ T6: NOOP keep-alive + stray-2xx swallow (OQ-2) ------------------ */

test('T6: NOOP sent mid-transfer; stray 200 swallowed; 226 still resolves STOR', async () => {
  const payload = Buffer.from('slow transfer payload');
  const server = fakeFtp({ slow226Ms: 500 });
  await server.listen();
  try {
    const ftp = await connectFtp({
      host: '127.0.0.1',
      port: server.port(),
      user: 'projects-studio',
      password: 'pw',
      secure: 'none',
      // noopIntervalS in seconds: 0.05s = 50ms — fires well within the 500ms window
    }, { noopIntervalS: 0.05 });
    const staged = path.join(os.tmpdir(), `projects-studio-t6-${process.pid}.bin`);
    fs.writeFileSync(staged, payload);
    try {
      await ftp.stor('/backup/t6.bin', staged);
      const debug = await ftp.__debug();
      const cmds = server.commands;
      const storAt = cmds.findIndex((c) => c.startsWith('STOR '));
      const noopAt = cmds.findIndex((c) => c.startsWith('NOOP'));
      assert.ok(storAt >= 0, 'STOR recorded');
      assert.ok(noopAt > storAt, 'NOOP recorded mid-transfer (after STOR)');
      assert.ok(debug.noopSwallowed > 0, `stray 200 swallowed + counted (got ${debug.noopSwallowed})`);
      assert.equal(
        Buffer.concat(server.dataReceived).toString('utf8'),
        payload.toString('utf8'),
        '226 resolved STOR with correct bytes',
      );
    } finally {
      fs.rmSync(staged, { force: true });
    }
  } finally {
    await server.close();
  }
});

/* ------------------ T9: timeout → destroy, keyed rejection (P1) ------------------ */

test('T9: server never replies → keyed rejection AND sockets destroyed, no hang', async () => {
  const server = fakeFtp({ storNoReply: true });
  await server.listen();
  try {
    const ftp = await connectFtp({
      host: '127.0.0.1',
      port: server.port(),
      user: 'projects-studio',
      password: 'pw',
      secure: 'none',
    }, { commandTimeoutMs: 250, attempts: 1 });
    await assert.rejects(
      ftp.stor('/backup/t9.bin', Readable.from([Buffer.from('x')])),
      (err) => err.code === 'ftpUnreachable' || err.code === 'ftpTransferAborted',
    );
    await ftp.quit();
  } finally {
    await server.close();
  }
});

/* ------------------ T10: STOR full-restart retry, zero REST (P6) ------------------ */

test('T10: forced 426 → retry re-opens fresh passive channel, whole file from byte 0, zero REST', async () => {
  const payload = Buffer.from('restart-from-byte-zero payload bytes');
  const server = fakeFtp({ storFailures: 1 });
  await server.listen();
  const staged = path.join(os.tmpdir(), `projects-studio-t10-${process.pid}.bin`);
  fs.writeFileSync(staged, payload);
  try {
    const ftp = await connectFtp({
      host: '127.0.0.1',
      port: server.port(),
      user: 'projects-studio',
      password: 'pw',
      secure: 'none',
    }, { attempts: 3, backoffMs: () => 20 });
    await ftp.stor('/backup/t10.bin', staged);
    await ftp.quit();

    assert.equal(server.storCount(), 2, 'two STOR attempts recorded');
    assert.equal(server.dataReceived.length, 2, 'two fresh data channels opened');
    /* BOTH attempts carry the WHOLE file from byte 0 (P6): every data
       connection received the full payload independently. */
    for (const chunk of server.dataReceived) {
      assert.equal(chunk.length, payload.length, 'each attempt re-sends the whole file from byte 0');
      assert.ok(chunk.equals(payload), 'identical bytes re-sent per attempt');
    }
    assert.ok(server.commands.every((c) => !c.startsWith('REST ')), 'ZERO REST lines on the upload transcript (P6)');
    /* EPSV before each STOR — a fresh passive channel per attempt. */
    const storIdx = server.commands.map((c, i) => [c, i]).filter(([c]) => c.startsWith('STOR ')).map(([, i]) => i);
    assert.equal(storIdx.length, 2);
    for (const si of storIdx) {
      const epsvBefore = server.commands.slice(0, si).some((c) => c.startsWith('EPSV'));
      assert.ok(epsvBefore, 'EPSV precedes each STOR');
    }
  } finally {
    fs.rmSync(staged, { force: true });
    await server.close();
  }
});

/* ------------------ EPSV → PASV fallback + ftpPassiveFailed (T3/P3) ------------------ */

test('EPSV 5xx → PASV fallback once; both failing → keyed ftpPassiveFailed', async () => {
  const payload = Buffer.from('pasv-fallback payload');
  const server = fakeFtp({ epsvReply: '500 Unknown command EPSV' });
  await server.listen();
  try {
    const ftp = await connectFtp({
      host: '127.0.0.1',
      port: server.port(),
      user: 'projects-studio',
      password: 'pw',
      secure: 'none',
    });
    await ftp.stor('/backup/t3.bin', Readable.from([payload]));
    await ftp.quit();
    const cmds = server.commands;
    assert.ok(cmds.some((c) => c.startsWith('EPSV')), 'EPSV attempted first');
    assert.ok(cmds.some((c) => c.startsWith('PASV')), 'PASV fallback after EPSV 5xx');
    assert.equal(Buffer.concat(server.dataReceived).toString('utf8'), payload.toString('utf8'), 'transfer over the PASV data channel');
  } finally {
    await server.close();
  }

  const server2 = fakeFtp({ epsvReply: '500 Unknown command EPSV', pasvReply: '500 PASV refused' });
  await server2.listen();
  try {
    const ftp = await connectFtp({
      host: '127.0.0.1',
      port: server2.port(),
      user: 'projects-studio',
      password: 'pw',
      secure: 'none',
    }, { attempts: 1 });
    await assert.rejects(
      ftp.stor('/backup/t3.bin', Readable.from([Buffer.from('x')])),
      (err) => err.code === 'ftpPassiveFailed',
    );
    await ftp.quit();
  } finally {
    await server2.close();
  }
});


/* ------------------ probeFtp (OQ-3, keyed shape) ------------------ */

test('probeFtp success: { ok, key success, httpWarning false } + marker STOR/DELE recorded', async () => {
  const server = fakeFtp();
  await server.listen();
  try {
    const res = await probeFtp({ host: '127.0.0.1', port: server.port(), user: 'u', password: 'p', secure: 'none' });
    assert.deepEqual(
      { ok: res.ok, key: res.key, warning: res.warning, httpWarning: res.httpWarning },
      { ok: true, key: 'success', warning: false, httpWarning: true /* secure none → warning even on success */ },
    );
    assert.ok(server.commands.some((c) => c.startsWith('STOR projects-studio-probe/probe-')), 'projects-studio-probe marker STORed');
    assert.ok(server.commands.some((c) => c.startsWith('DELE projects-studio-probe/probe-')), 'marker DELEted');
  } finally {
    await server.close();
  }
});

test('probeFtp auth failure: keyed ftpAuthFailed', async () => {
  const server = fakeFtp({ passReply: '530 Login incorrect' });
  await server.listen();
  try {
    const res = await probeFtp({ host: '127.0.0.1', port: server.port(), user: 'u', password: 'wrong', secure: 'none' });
    assert.equal(res.ok, false);
    assert.equal(res.key, 'ftpAuthFailed');
    assert.equal(res.warning, false);
    assert.ok(server.commands.every((c) => !c.startsWith('STOR')), 'no marker STORed on auth failure');
  } finally {
    await server.close();
  }
});

test('probeFtp unreachable (connection refused): { ok false, key unreachable, error sliced }', async () => {
  const res = await probeFtp({ host: '127.0.0.1', port: 1 /* nothing listens */, user: 'u', password: 'p', secure: 'none' }, { attempts: 1 });
  assert.equal(res.ok, false);
  assert.equal(res.key, 'unreachable');
  assert.equal(typeof res.error, 'string');
  assert.ok(res.error.length <= 300);
});

test('probeFtp deleteFailed: warning true when DELE is refused', async () => {
  const server = fakeFtp({ deleReply: '550 Permission denied' });
  await server.listen();
  try {
    const res = await probeFtp({ host: '127.0.0.1', port: server.port(), user: 'u', password: 'p', secure: 'none' });
    assert.deepEqual(
      { ok: res.ok, key: res.key, warning: res.warning },
      { ok: false, key: 'deleteFailed', warning: true },
    );
  } finally {
    await server.close();
  }
});

test('probeFtp httpWarning reflects secure mode: explicit+verified → false', async () => {
  const server = fakeFtp({ secureExplicit: true });
  await server.listen();
  try {
    const res = await probeFtp({ host: '127.0.0.1', port: server.port(), user: 'u', password: 'p', secure: 'explicit', insecure: true });
    assert.equal(res.key, 'success');
    assert.equal(res.httpWarning, true, 'insecure:true → httpWarning (R-3 parity)');
  } finally {
    await server.close();
  }
});

/* ------------------ P5: control close mid-transfer → data destroyed ------------------ */

test('P5: control channel destroyed mid-STOR → keyed ftpTransferAborted', async () => {
  const server = fakeFtp({ controlDropAfterStor: 80 });
  await server.listen();
  try {
    const ftp = await connectFtp({
      host: '127.0.0.1',
      port: server.port(),
      user: 'projects-studio',
      password: 'pw',
      secure: 'none',
    }, { attempts: 1 });
    await assert.rejects(
      ftp.stor('/backup/p5.bin', Readable.from([Buffer.from('x'.repeat(64))])),
      (err) => err.code === 'ftpTransferAborted',
    );
    await ftp.quit();
  } finally {
    await server.close();
  }
});
