/* =====================================================================
   SMB E2E (ENV-GATED DPERSION/SAMBA, TWO CONTAINERS) — Phase 100 (100-05, D-02)
   =====================================================================
   D-02 gate idiom (mirrors test/backup-ftp-e2e.test.mjs: the 88-18
   opt-in env gate): the whole loop suite is opt-in via SAMBATEST_URL
   (host:port form, e.g. 127.0.0.1:1445) and SAMBATEST_SMB3_URL; when
   an env is absent its gated tests SKIP — a skip on a machine without
   the container is the expected pass state, never silently counted as
   coverage.

   E2e target — ONE compose recipe with TWO dperson/samba containers
   (D-02: both SPIKE-99 pins in one recipe):

     # Container 1 — SMB2-min happy path (+ guest pin profile):
     # the default dperson/samba profile speaks SMB2 minimum; the share
     # grants guest yes + users all so the guest session can write AND
     # delete the probe marker; `map to guest = Bad User` maps a
     # wrong-password connect onto the guest session (SC-2 guest pin).
     docker run -d --name gr8r-samba-e2e \
       -p 1445:445 \
       dperson/samba \
       -s "backups;/backups;yes;yes;yes;all;none" \
       -u "gr8rtest;gr8rtest-password" \
       -g "server min protocol = SMB2" \
       -g "map to guest = Bad User"

     # Container 2 — SMB3-min refusal (the A1-A4 falsification point):
     # NEGOTIATE against an SMB3-minimum server must refuse with the
     # KEYED error err.code === 'smbDialectUnsupported' — a specific
     # error at a specific command, never ambiguity (99-SPIKE §3).
     docker run -d --name gr8r-samba-smb3-e2e \
       -p 1446:445 \
       dperson/samba \
       -s "backups;/backups;yes;yes;yes;all;none" \
       -u "gr8rtest;gr8rtest-password" \
       -g "server min protocol = SMB3"

   then:
     SAMBATEST_URL=127.0.0.1:1445 \
     SAMBATEST_SMB3_URL=127.0.0.1:1446 \
     node --test test/backup-smb-e2e.test.mjs

   The SMB_* env vars map onto the server's boot-frozen consts
   (server.js SMB_HOST/SMB_SHARE/SMB_USER/SMB_PASSWORD/SMB_PORT — see
   docs/DEPLOY.md §21); here the credentials default to the throwaway
   gr8rtest pair above and can be overridden with SMB_TEST_USER /
   SMB_TEST_PASSWORD. The recipe's credentials are throwaway
   docker-only values — never real secrets (T-98-07 / T-100-11). The
   gates drive the real 99 client surface (connectSmb / probeSmb /
   fetchSmbToStaged) DIRECTLY — the gr8r server is never booted.

   If the image needs different flags (A2 falsification), adjust the
   recipe header and note it in the phase SUMMARY — the assertions
   themselves are the contract, not the flags.
   ===================================================================== */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { connectSmb, probeSmb, fetchSmbToStaged } from '../export/smb.js';

/* D-02 gate idiom — each e2e leg is independently opt-in. */
const sambaUrl = process.env.SAMBATEST_URL;
const smb3Url = process.env.SAMBATEST_SMB3_URL;
const maybeSamba = sambaUrl ? test : test.skip;
const maybeSmb3 = smb3Url ? test : test.skip;

const CONFIG = (() => {
  const raw = sambaUrl || '127.0.0.1:445';
  const u = new URL(`smb://${raw}`);
  return {
    host: u.hostname,
    port: Number.parseInt(u.port || '445', 10),
    share: process.env.SMB_TEST_SHARE || 'backups',
    user: process.env.SMB_TEST_USER || 'gr8rtest',
    password: process.env.SMB_TEST_PASSWORD || 'gr8rtest-password',
  };
})();

const SMB3_CONFIG = (() => {
  const raw = smb3Url || '127.0.0.1:445';
  const u = new URL(`smb://${raw}`);
  return {
    host: u.hostname,
    port: Number.parseInt(u.port || '445', 10),
    share: process.env.SMB_TEST_SHARE || 'backups',
    user: process.env.SMB_TEST_USER || 'gr8rtest',
    password: process.env.SMB_TEST_PASSWORD || 'gr8rtest-password',
  };
})();

maybeSamba('e2e: probe lands the write+delete marker (keyed success, no TLS-warning field, vs real samba)', async () => {
  const probe = await probeSmb(CONFIG);
  assert.equal(probe.ok, true, `probe ok (got: ${JSON.stringify(probe)})`);
  assert.equal(probe.key, 'success');
  assert.equal(probe.warning, false);
  assert.equal('guest' in probe, false, 'an authenticated session is NOT flagged guest');
});

maybeSamba('e2e: backup analog → SMB → restore full loop (SC-5 — archive-analog under the task prefix, fetchSmbToStaged read-back)', async () => {
  const taskId = `e2e-${crypto.randomUUID().slice(0, 8)}`;

  /* ---- backup leg: mirror the 100-02 smb arm — WRITE archive-analog
     under the task-prefix key. smb_uploaded=1 is the pipeline's flag
     (proven by the wiring-test pipeline tests); this leg proves the
     server-side artifact round-trips against real samba. */
  const bytes = crypto.randomBytes(256 * 1024);
  const expectedSha = crypto.createHash('sha256').update(bytes).digest('hex');
  const filename = `gr8r smb e2e ${taskId}.tar.gz`; // spaces exercise the client's path encoding
  const smbKey = `backup-task-${taskId}/${filename}`;

  const smb = connectSmb(CONFIG);
  try {
    await smb.connect();
    await smb.write(smbKey, bytes);
    const readBack = await smb.read(smbKey);
    assert.equal(readBack.equals(bytes), true, 'client read-back is byte-identical');
  } finally {
    await smb.close().catch(() => { /* best-effort */ });
  }

  /* ---- restore leg: fetchSmbToStaged — single-shot + sha256 before
     any staging file exists (T-100-10). */
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-smb-e2e-restore-'));
  const back = await fetchSmbToStaged(CONFIG, smbKey, expectedSha, stagingDir);
  assert.equal(back.sha256, expectedSha, 'read-back digest verified');
  assert.equal(fs.readFileSync(back.tmpPath).equals(bytes), true, 'restore returns byte-identical content from the SMB copy');

  /* sha256 mismatch refuses — T-100-10: no unverified bytes reach
     restore, and the mismatch writes nothing to staging. */
  await assert.rejects(
    () => fetchSmbToStaged(CONFIG, smbKey, '0'.repeat(64), stagingDir),
    err => err.code === 'smbSha256Mismatch',
    'tampered expectation refuses the restore',
  );
  assert.equal(fs.readdirSync(stagingDir).filter(f => f.startsWith('smb-download-')).length, 1, 'mismatch staged nothing (only the verified copy exists)');

  /* rm works under the task prefix — prune = DELETE, the lifecycle the
     probe hard-refuses on when the share forbids it. */
  const smb2 = connectSmb(CONFIG);
  try {
    await smb2.connect();
    await smb2.rm(smbKey);
  } finally {
    await smb2.close().catch(() => { /* best-effort */ });
  }

  fs.rmSync(back.tmpPath, { force: true });
  fs.rmSync(stagingDir, { recursive: true, force: true });
});

maybeSamba('e2e guest pin (A1/A2 falsification): wrong-password connect maps to the guest session — probe carries the informational guest flag', async () => {
  const guestProbe = await probeSmb({ ...CONFIG, password: 'definitely-not-the-password' });
  assert.equal(guestProbe.ok, true, `wrong-password connect succeeds AS GUEST (got: ${JSON.stringify(guestProbe)})`);
  assert.equal(guestProbe.guest, true, 'the probe surfaces the guest session flag (SC-2 informational semantics)');
});

maybeSmb3('e2e SMB3-min refusal (A1-A4 falsification point): NEGOTIATE refuses KEYED with smbDialectUnsupported', async () => {
  /* The client's NEGOTIATE against an SMB3-minimum server gets
     STATUS_SMB_NO_IMPERSONATION-class / unsupported-dialect refusal —
     the 99 error mapping keys it smbDialectUnsupported (OQ-3: NOT
     signingRequired). The refusal is a KEYED ERROR at a specific
     command (connectSmb → connect), never ambiguity. */
  await assert.rejects(
    () => {
      const smb = connectSmb(SMB3_CONFIG);
      return smb.connect().finally(() => smb.close().catch(() => {}));
    },
    err => err.code === 'smbDialectUnsupported',
    `NEGOTIATE must refuse keyed smbDialectUnsupported (got code: ${SMB3_CONFIG.host})`,
  );
  /* The probe surfaces the same refusal as a keyed NON-success class. */
  const probe = await probeSmb(SMB3_CONFIG);
  assert.equal(probe.ok, false, 'probe refuses the SMB3-min server');
  assert.equal(probe.key, 'generic', 'the refusal lands in the generic smbClass (smb.js:437-438 mapping)');
});

/* Always-on gate proof (D-03): without SAMBATEST_URL / SAMBATEST_SMB3_URL
   the gated suites resolve to test.skip — the e2e never contacts SMB and
   the run exits 0 with standard node --test skip semantics. */
test('gate: SAMBATEST_URL / SAMBATEST_SMB3_URL absent → the loop suites skip silently (skip-when-absent)', () => {
  assert.equal(maybeSamba === (!process.env.SAMBATEST_URL ? test.skip : test), true, 'samba gate resolves to skip without the env, test with it');
  assert.equal(maybeSmb3 === (!process.env.SAMBATEST_SMB3_URL ? test.skip : test), true, 'smb3 gate resolves to skip without the env, test with it');
  assert.equal(typeof CONFIG.host === 'string' && CONFIG.host.length > 0, true, 'config derivation never throws without the env');
  assert.equal(typeof SMB3_CONFIG.host === 'string' && SMB3_CONFIG.host.length > 0, true, 'smb3 config derivation never throws without the env');
});
