/* =====================================================================
   FTP E2E (ENV-GATED VSFTPD) — Phase 98 (98-04, D-03)
   =====================================================================
   D-03 gate idiom (mirrors test/backup-s3-e2e.test.mjs: the 88-18
   opt-in env gate): the whole loop suite is opt-in via VSFTPD_TEST_URL
   (host:port form, e.g. 127.0.0.1:2121); when the env is absent the
   gated tests SKIP — a skip on a machine without the container is the
   expected pass state, never silently counted as coverage.

   E2e target — vsftpd via the fauria/vsftpd image (active + passive
   ports documented; plain FTP on 21 so the default 'none' secure enum
   is exercised — TLS against this image is out of scope):
     docker run -d --name gr8r-vsftpd-e2e \
       -p 2121:21 -p 21100-21110:21100-21110 \
       -e FTP_USER=gr8rtest -e FTP_PASS=gr8rtest-password \
       -e PASV_ADDRESS=127.0.0.1 -e PASV_MIN_PORT=21100 -e PASV_MAX_PORT=21110 \
       fauria/vsftpd
   then:
     VSFTPD_TEST_URL=127.0.0.1:2121 node --test test/backup-ftp-e2e.test.mjs
   The FTP_* env vars map onto the server's boot-frozen consts
   (server.js FTP_HOST/FTP_PORT/FTP_USER/FTP_PASSWORD/FTP_SECURE/
   FTP_PASV_HOST — see docs/DEPLOY.md §21); here the credentials default
   to the throwaway gr8rtest pair above and can be overridden with
   FTP_TEST_USER / FTP_TEST_PASSWORD. The recipe's credentials are
   throwaway docker-only values — never real secrets (T-98-07).
   ===================================================================== */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { connectFtp, probeFtp, fetchToStaged } from '../export/ftp.js';

/* D-03 gate idiom — the whole e2e is opt-in. */
const vsftpdUrl = process.env.VSFTPD_TEST_URL;
const maybeFtp = vsftpdUrl ? test : test.skip;

const CONFIG = (() => {
  const raw = vsftpdUrl || '127.0.0.1:21';
  const withScheme = raw.includes('://') ? raw : `ftp://${raw}`;
  const u = new URL(withScheme);
  return {
    host: u.hostname,
    port: Number.parseInt(u.port || '21', 10),
    user: process.env.FTP_TEST_USER || 'gr8rtest',
    password: process.env.FTP_TEST_PASSWORD || 'gr8rtest-password',
    secure: 'none', // the vsftpd recipe is plain FTP — explicit-TLS e2e would need FTPS-capable certs
    insecure: false,
  };
})();

maybeFtp('e2e: probe lands the write+delete marker (keyed success, D-02 posture vs real vsftpd)', async () => {
  const probe = await probeFtp(CONFIG);
  assert.equal(probe.ok, true, `probe ok (got: ${JSON.stringify(probe)})`);
  assert.equal(probe.key, 'success');
  assert.equal(probe.warning, false);
  assert.equal(probe.httpWarning, true, 'plain-FTP posture carries the insecure-transport warning');
});

maybeFtp('e2e: backup → FTP → restore full loop (SC-3/SC-5 — archive + sidecar under the task prefix, fetchToStaged read-back)', async () => {
  const taskId = `e2e-${crypto.randomUUID().slice(0, 8)}`;

  /* ---- backup leg: mirror the 98-01 ftp arm — STOR archive → SIZE
     verify → STOR sidecar under the task-prefix key. ftp_uploaded=1 is
     the pipeline's flag (proven by the wiring-test pipeline tests); this
     leg proves the server-side artifacts are REAL against vsftpd. */
  const bytes = crypto.randomBytes(256 * 1024);
  const expectedSha = crypto.createHash('sha256').update(bytes).digest('hex');
  const filename = `gr8r ftp e2e ${taskId}.tar.gz`; // spaces exercise the client's path quoting
  const ftpKey = `backup-task-${taskId}/${filename}`;

  const staged = fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-ftp-e2e-'));
  const archivePath = path.join(staged, 'archive.tar.gz');
  fs.writeFileSync(archivePath, bytes);

  const ftp = connectFtp(CONFIG);
  try {
    await ftp.connect();
    await ftp.stor(ftpKey, archivePath);
    const storedSize = await ftp.size(ftpKey); // R-4 SIZE verify — same check the upload arm runs
    assert.equal(storedSize, bytes.length, 'SIZE matches the published byte count');
    await ftp.stor(`${ftpKey}.sha256`, Buffer.from(`${expectedSha}  ${filename}\n`));
    assert.equal(await ftp.size(`${ftpKey}.sha256`), `${expectedSha}  ${filename}\n`.length, 'sidecar present under the task prefix');
  } finally {
    await ftp.quit().catch(() => { /* best-effort */ });
  }

  /* ---- restore leg (D-05): fetchToStaged — single-shot + sha256. */
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-ftp-e2e-restore-'));
  const back = await fetchToStaged(CONFIG, ftpKey, expectedSha, stagingDir);
  assert.equal(back.sha256, expectedSha, 'read-back digest verified');
  assert.equal(fs.readFileSync(back.tmpPath).equals(bytes), true, 'restore returns byte-identical content from the FTP copy');

  /* Sidecar read-back carries the run-row hash verbatim (R-4 stamp). */
  const sidecarSha = crypto.createHash('sha256').update(Buffer.from(`${expectedSha}  ${filename}\n`)).digest('hex');
  const sidecar = await fetchToStaged(CONFIG, `${ftpKey}.sha256`, sidecarSha, stagingDir);
  assert.ok(fs.readFileSync(sidecar.tmpPath, 'utf8').startsWith(expectedSha), 'sidecar carries the run-row hash');

  /* sha256 mismatch refuses — T-98-06: no unverified bytes reach restore. */
  await assert.rejects(
    () => fetchToStaged(CONFIG, ftpKey, '0'.repeat(64), stagingDir),
    err => err.code === 'ftpSha256Mismatch',
    'tampered expectation refuses the restore',
  );

  fs.rmSync(back.tmpPath, { force: true });
  fs.rmSync(sidecar.tmpPath, { force: true });
  fs.rmSync(staged, { recursive: true, force: true });
  fs.rmSync(stagingDir, { recursive: true, force: true });
});

/* Always-on gate proof (D-03): without VSFTPD_TEST_URL the gated suite
   resolves to test.skip — the e2e never contacts FTP and the run exits 0
   with standard node --test skip semantics. */
test('gate: VSFTPD_TEST_URL absent → the loop suite skips silently (skip-when-absent)', () => {
  const expectSkip = !process.env.VSFTPD_TEST_URL;
  assert.equal(maybeFtp === (expectSkip ? test.skip : test), true, 'gate resolves to skip without the env, test with it');
  assert.equal(typeof CONFIG.host === 'string' && CONFIG.host.length > 0, true, 'config derivation never throws without the env');
});
