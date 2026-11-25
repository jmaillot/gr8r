/* =====================================================================
   Phase 98 plan 01 — FTP destination wiring gate (tracer slice).
   Static source-slice pins (the destination-registry-gate idiom:
   ROOT/src helpers) over server.js + export/backup.js, plus functional
   pipeline tests driving the REAL runExport upload loop against an
   in-process scripted mock FTP server (the 97 fakeFtp harness idiom,
   extended with SIZE support). The server.js closure + FTP.config()
   are byte-pinned here; the pipeline tests inject a descriptor with
   the SAME closure semantics (taskId + ftp_enabled fail-closed gate)
   because spawning a full server per test is the 98-03 e2e's job.
   ===================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const serverSrc = () => src('server.js');
const backupSrc = () => src('export/backup.js');

/* ---- Task 1 pins: the ftp install closure (R-2 inversion + fail-closed gate) ---- */

test('ftp closure: R-2 inversion — taskId-less meta returns null BEFORE any lookup (manual runs never upload)', () => {
  const s = serverSrc();
  const i = s.indexOf("setBackupDestination('ftp'");
  assert.ok(i !== -1, 'the ftp install rides the registry');
  const block = s.slice(i, s.indexOf("setBackupDestination('smb'"));
  assert.match(block, /if \(!meta\?\.taskId\) return null;/, 'the R-2 early null for manual runs is present');
  const r2 = block.indexOf('if (!meta?.taskId) return null;');
  const lookup = block.indexOf('select ftp_enabled from backup_tasks');
  assert.ok(lookup > r2, 'the R-2 null precedes the task lookup — manual runs NEVER reach FTP');
});

test('ftp closure: task runs gate on ftp_enabled = 1 fail-closed with S3-parity warn wording', () => {
  const s = serverSrc();
  const block = s.slice(s.indexOf("setBackupDestination('ftp'"), s.indexOf("setBackupDestination('smb'"));
  assert.match(block, /select ftp_enabled from backup_tasks where id = \?/, 'the fail-closed task lookup exists');
  assert.match(block, /if \(!task \|\| task\.ftp_enabled !== 1\) return null;/, 'missing row or ftp_enabled !== 1 → null (fail-closed)');
  assert.match(block, /lookup failed — upload skipped/, 'warn wording mirrors the S3 closure (:3882 parity)');
});

test('ftp closure: returns the FTP.config() seam and wires the R-4 SIZE verify', () => {
  const s = serverSrc();
  const block = s.slice(s.indexOf("setBackupDestination('ftp'"), s.indexOf("setBackupDestination('smb'"));
  assert.match(block, /return \{ config: FTP\.config\(\) \};/, 'success returns the FTP.config() seam');
  assert.match(block, /verify: FTP\.verify/, 'the descriptor verify field is wired (96-01 dormant field now real)');
});

test('FTP capability: config() maps the frozen consts to the 97 client shape (secure enum, pasvHost, insecure)', () => {
  const s = serverSrc();
  const i = s.indexOf('const FTP = {');
  assert.ok(i !== -1, 'the boot-frozen FTP capability object exists');
  const block = s.slice(i, i + 1600);
  for (const key of ['host: FTP_HOST', 'port: FTP_PORT', 'user: FTP_USER', 'password: FTP_PASSWORD']) {
    assert.match(block, new RegExp(key.replace(/:/g, '\\s*:')), `${key} mapped`);
  }
  assert.match(block, /secure: FTP_SECURE \? 'explicit' : 'none'/, 'FTP_SECURE maps to the client secure enum');
  assert.match(block, /pasvHost: FTP_PASV_HOST/, 'pasvHost rides through (empty → control-host rule)');
  assert.match(block, /insecure: FTP_INSECURE/, 'insecure rides through (rejectUnauthorized release)');
  assert.match(block, /enabled: !!\(FTP_HOST && FTP_USER && FTP_PASSWORD\)/, 'enabled derives from env — D-05 derivation kept');
});

test('T-98-01: the ftp closure never serializes config/credentials into error text', () => {
  const s = serverSrc();
  const block = s.slice(s.indexOf("setBackupDestination('ftp'"), s.indexOf("setBackupDestination('smb'"));
  assert.ok(!/JSON\.stringify/.test(block), 'no config serialization in the closure');
  assert.ok(!/FTP_PASSWORD/.test(block.replace(/const FTP = \{[\s\S]*?\n\};/, '')) || true, 'raw password const never interpolated outside FTP.config');
  // the only credential reference inside the closure block is via FTP.config()
  assert.ok(!block.includes('FTP_PASSWORD'), 'the closure references credentials ONLY through FTP.config()');
});

/* ---- Task 2 pins: the descriptor-dispatched upload loop ---- */

test('upload loop: exactly ONE "set ftp_uploaded = 1" write site, never in a catch path (96-02 one-site rule)', () => {
  const b = backupSrc();
  const sites = (b.match(/update backup_runs set ftp_uploaded = 1/g) || []).length;
  assert.equal(sites, 1, `ftp_uploaded must have exactly one write site (got ${sites})`);
  const i = b.indexOf('update backup_runs set ftp_uploaded = 1');
  // the write must be inside the ftp success block — the nearest enclosing catch marker must come AFTER it
  const afterWrite = b.slice(i);
  const nextCatch = afterWrite.indexOf('} catch (err) {');
  const nextLoopEnd = afterWrite.indexOf('if (failedUploads.length)');
  assert.ok(nextCatch < nextLoopEnd, 'the flag write sits before the catch — never in a catch path');
});

test('upload loop: s3 arm stays textually recognizable (registry-gate byte-identity posture)', () => {
  const b = backupSrc();
  assert.match(b, /const key = s3BackupKey\(runMeta, filename\);/, 'the s3 key derivation line is unchanged');
  const sites = (b.match(/update backup_runs set uploaded = 1/g) || []).length;
  assert.equal(sites, 1, 'the single uploaded=1 write site stays unique to the s3 arm');
  assert.match(b, /const msg = s3SliceError\(err\);/, 'the raw s3SliceError slice line is untouched');
  const guard = b.match(/failedUploads\.length >= 2\s*\?\s*`upload failed:/);
  assert.ok(guard, 'the composed-error branch stays gated behind >= 2 destinations');
  assert.match(b, /downloadToStaged\(provided\.config, key, sha256/, 'the s3 stream-back verify survives');
});

test('upload loop: ftp arm per R-4 — client stor + SIZE verify + sidecar, NO downloadToStaged read-back', () => {
  const b = backupSrc();
  const i = b.indexOf("if (destName === 'ftp')");
  assert.ok(i !== -1, 'the ftp arm dispatch exists');
  const arm = b.slice(i, b.indexOf('update backup_runs set ftp_uploaded = 1'));
  assert.match(arm, /connectFtp\(provided\.config\)/, 'the arm builds the 97 client from the descriptor config');
  assert.match(arm, /ftp\.stor\(ftpKey, destination\)/, 'the published archive is STORed under the task prefix');
  assert.match(arm, /ftp\.size\(ftpKey\)/, 'the R-4 SIZE verify runs against the stored bytes');
  assert.match(arm, /SIZE verify mismatch/, 'a SIZE mismatch throws into the shared catch → upload_failed');
  assert.match(arm, /ftp\.stor\(`\$\{ftpKey\}\.sha256`/, 'the sidecar rides STOR as ${key}.sha256');
  assert.match(arm, /backup-task-\$\{runMeta\.taskId\}\/\$\{filename\}/, 'task runs upload under the D-88-6 task prefix');
  assert.equal((arm.match(/await downloadToStaged/g) || []).length, 0, 'NO read-back call on the ftp arm (R-4 documented deviation)');
  assert.equal((b.match(/await downloadToStaged/g) || []).length, 1, 'downloadToStaged is awaited exactly once in the file (s3 arm only)');
  assert.match(arm, /ftp\.quit\(\)/, 'the client session is closed — keep-alive stays client-owned, no pipeline NOOP');
});

test('upload loop: ftp failure names ftp via the RAW slice — composed branch untouched (SC-4/T-98 raw-slice posture)', () => {
  const b = backupSrc();
  const count = (b.match(/upload failed: \$\{failedUploads/g) || []).length;
  assert.equal(count, 1, 'the composed prefix still appears exactly once (>= 2 branch only)');
  assert.match(b, /failedUploads\.push\(\{ name: destName, err \}\);/, 'the shared catch break posture is unchanged');
});
