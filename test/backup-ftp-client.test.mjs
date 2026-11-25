/* =====================================================================
   Phase 97 plan 01 — FTP client mock-server tests (97-01).

   Offline, ungated, always-on: an in-process scripted node:net mock
   FTP server (NOT reflexive — pre-baked reply sequences, per-command
   delays, a second ephemeral data listener, recorded command lines)
   following the fakeSmtp harness idiom (test/subject-encode.test.mjs
   :17-58). Docker vsftpd e2e is Phase 98's deliverable, NOT this
   phase (env-gated recipes are out of scope in 97).
   ===================================================================== */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { Readable } from 'node:stream';
import { connectFtp, fetchToStaged } from '../export/ftp.js';

/* ------------------------ scripted mock FTP server ------------------------ */

function fakeFtp(scenario = {}) {
  const commands = [];     // recorded command lines (ordering assertions)
  const dataReceived = []; // buffers captured from data connections
  const delays = scenario.delays ?? {};

  let storPending = null;
  let retrActive = false;
  let retrPending = null;
  let currentDataSock = null;
  const servedDataSocks = new Set();
  const serveRetrPayload = (sock) => {
    if (servedDataSocks.has(sock) || !retrActive || !scenario.retrPayload) return;
    servedDataSocks.add(sock);
    sock.write(scenario.retrPayload);
    sock.end();
    retrPending?.();
  };
  const dataServer = net.createServer((sock) => {
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

  const ctrl = net.createServer((socket) => {
    let ended = false;
    const reply = (line, delay = 0) => {
      setTimeout(() => { if (!ended && socket.writable) socket.write(line + '\r\n'); }, delay);
    };
    socket.write('220 mock FTP ready\r\n');
    let buf = '';
    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let idx;
      while ((idx = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        commands.push(line);
        const cmd = line.toUpperCase();
        if (cmd.startsWith('USER')) {
          reply(scenario.userReply ?? '331 password required', delays.USER ?? 0);
        } else if (cmd.startsWith('PASS')) {
          reply(scenario.passReply ?? '230 logged in', delays.PASS ?? 0);
        } else if (cmd.startsWith('TYPE')) {
          reply('200 binary mode set', delays.TYPE ?? 0);
        } else if (cmd.startsWith('EPSV')) {
          reply(`229 Entering Extended Passive Mode (|||${dataPort}|)`, delays.EPSV ?? 0);
        } else if (cmd.startsWith('PASV')) {
          reply(`227 Entering Passive Mode (127,0,0,1,${dataPort >> 8},${dataPort & 255})`, delays.PASV ?? 0);
        } else if (cmd.startsWith('STOR')) {
          /* Real servers emit 150 BEFORE the data transfer completes —
             write it synchronously and arm the 226 completion; if the
             data connection already finished (fast small transfers),
             flush the 226 immediately. */
          if (scenario.storReply) reply(scenario.storReply, delays.STOR ?? 0);
          else {
            storCount++;
            storPending = () => socket.write('226 Transfer complete\r\n');
            socket.write('150 opening data connection\r\n');
            if (dataDone) storPending();
          }
        } else if (cmd.startsWith('REST')) {
          reply(scenario.restReply ?? '350 Restarting at 0. Send STORE or RETRIEVE.');
        } else if (cmd.startsWith('RETR')) {
          if (scenario.retrErrorReply) {
            reply(scenario.retrErrorReply);
          } else {
            retrActive = true;
            retrPending = () => socket.write('226 Transfer complete\r\n');
            socket.write('150 opening data connection\r\n');
            serveRetrPayload(currentDataSock);
          }
        } else if (cmd.startsWith('DELE')) {
          reply(scenario.deleReply ?? '250 deleted', delays.DELE ?? 0);
        } else if (cmd.startsWith('QUIT')) {
          socket.write('221 bye\r\n');
          ended = true;
          socket.end();
        } else {
          reply('200 ok');
        }
      }
    });
  });
  /* When the data connection finishes (client half-closed), complete the
     pending transfer with 226 — the scripted 150 → 226 sequence. */
  let storCount = 0;
  let dataDone = false;
  dataServer.on('connection', (sock) => {
    sock.on('end', () => {
      sock.end();
      if (!scenario.storReply && !scenario.storEndWithout226) {
        dataDone = true;
        storPending?.();
      }
    });
    sock.on('close', () => {
      if (!scenario.storReply && !scenario.storEndWithout226 && !dataDone) {
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
      await Promise.all([
        new Promise((r) => ctrl.close(r)),
        new Promise((r) => dataServer.close(r)),
      ]);
      ctrl.closeAllConnections?.();
      dataServer.closeAllConnections?.();
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
      user: 'gr8r',
      password: 'gr8r-secret',
      secure: 'none',
    });
    const bytes = Buffer.from('hello gr8r ftp tracer round-trip');
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

/* ------------------- T8: fetchToStaged (D-02, OQ-1) ------------------- */

test('fetchToStaged happy path: staged file with exact bytes + matching sha256 (T8)', async () => {
  const payload = Buffer.from('gr8r restore payload \xC2\xA9 bytes');
  const sha = crypto.createHash('sha256').update(payload).digest('hex');
  const server = fakeFtp({ retrPayload: payload });
  await server.listen();
  const stagingDir = path.join(os.tmpdir(), `gr8r-ftp-test-${process.pid}-${Date.now()}`);
  try {
    const { tmpPath, sha256 } = await fetchToStaged(
      { host: '127.0.0.1', port: server.port(), user: 'gr8r', password: 'pw', secure: 'none' },
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
  const stagingDir = path.join(os.tmpdir(), `gr8r-ftp-test-${process.pid}-${Date.now()}`);
  try {
    await assert.rejects(
      fetchToStaged(
        { host: '127.0.0.1', port: server.port(), user: 'gr8r', password: 'pw', secure: 'none' },
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
