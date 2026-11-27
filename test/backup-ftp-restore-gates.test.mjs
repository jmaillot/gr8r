/* =====================================================================
   Phase 98 plan 04 — FTP restore read-back gates (98-04).
   Static source-slice pins over export/restore.js + server.js proving
   the two ftp read-back twins (import_new runRestore + DR
   restoreInstanceUnit): gated on ftp_uploaded === 1 && opts.ftpConfig,
   calling the 97 client's fetchToStaged (single-shot + sha256, T-98-06),
   additive BELOW the local-first check and the s3 gates (D-88-16
   ordering untouched), with the ftp key derivation mirroring the 98-01
   upload arm (task-prefix + filename). server.js plumbing pins: both
   restore triggers select ftp_uploaded and pass ftpConfig from the same
   FTP.config() seam as s3Config. Zero badge code (96-02 ordered scan
   already reads ftp_uploaded) — pinned by its absence here.
   ===================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const restoreSrc = () => src('export/restore.js');
const serverSrc = () => src('server.js');
const ftpClientSrc = () => src('export/ftp.js');

/* ---- gate 1: import_new runRestore ---- */

test('import_new: the ftp read-back twin exists, gated on ftp_uploaded === 1 && opts.ftpConfig', () => {
  const s = restoreSrc();
  const i = s.indexOf('backupRun.ftp_uploaded === 1 && opts.ftpConfig');
  assert.ok(i !== -1, 'the ftp twin gate exists in runRestore');
  assert.ok(s.includes('await fetchToStaged('), 'the twin calls fetchToStaged');
});

test('import_new: the ftp twin sits BELOW the local-first check (D-88-16 ordering preserved)', () => {
  const s = restoreSrc();
  const runRestoreStart = s.indexOf('export async function runRestore(');
  const importEnd = s.indexOf('restoreImportAsNew', runRestoreStart);
  const slice = s.slice(runRestoreStart, importEnd);
  const localCheck = slice.indexOf('fs.existsSync(localPath)');
  const s3Gate = slice.indexOf('backupRun.uploaded === 1 && opts.s3Config');
  const ftpGate = slice.indexOf('backupRun.ftp_uploaded === 1 && opts.ftpConfig');
  assert.ok(localCheck !== -1 && s3Gate !== -1 && ftpGate !== -1, 'all three stages present');
  assert.ok(localCheck < s3Gate && s3Gate < ftpGate, 'local → s3 → ftp ordering, s3 gate untouched');
});

test('import_new: ftp key derivation mirrors the 98-01 upload arm (task-prefix + filename)', () => {
  const s = restoreSrc();
  assert.ok(s.includes('`backup-task-${backupRun.taskId}/${backupRun.filename}`'), 'restore derives backup-task-<taskId>/<filename>');
  const b = src('export/backup.js');
  assert.ok(b.includes('`backup-task-${runMeta.taskId}/${filename}`'), 'upload arm uses the same prefix construction');
});

/* ---- gate 2: DR restoreInstanceUnit ---- */

test('DR: the ftp read-back twin exists, failWith-guarded with dropStagedTmp', () => {
  const s = restoreSrc();
  const drStart = s.indexOf('export async function restoreInstanceUnit(');
  const slice = s.slice(drStart);
  const ftpGate = slice.indexOf('backupRun.ftp_uploaded === 1 && opts.ftpConfig');
  assert.ok(ftpGate !== -1, 'the DR ftp twin gate exists');
  const guarded = slice.slice(ftpGate, ftpGate + 800);
  assert.ok(guarded.includes('dropStagedTmp()'), 'seam failure drops the staged temp');
  assert.ok(guarded.includes("failWith(keyed('restoreArchiveMissing'"), 'seam failure keys restoreArchiveMissing through failWith (lock-release funnel)');
});

test('DR: the ftp twin sits BELOW the local-first check and the guarded s3 twin', () => {
  const s = restoreSrc();
  const drStart = s.indexOf('export async function restoreInstanceUnit(');
  const snapshot = s.indexOf('SNAPSHOT FIRST', drStart);
  const slice = s.slice(drStart, snapshot);
  const localCheck = slice.indexOf('fs.existsSync(localPath)');
  const s3Gate = slice.indexOf('backupRun.uploaded === 1 && opts.s3Config');
  const ftpGate = slice.indexOf('backupRun.ftp_uploaded === 1 && opts.ftpConfig');
  assert.ok(localCheck !== -1 && s3Gate !== -1 && ftpGate !== -1, 'all three stages present');
  assert.ok(localCheck < s3Gate && s3Gate < ftpGate, 'local → s3 → ftp ordering preserved');
});

/* ---- plumbing: opts.ftpConfig from the same seam as opts.s3Config ---- */

test('server.js: both restore triggers pass ftpConfig next to s3Config, sourced from FTP.config()', () => {
  const s = serverSrc();
  const first = s.indexOf('ftpConfig: FTP.enabled ? FTP.config() : null');
  assert.ok(first !== -1, 'import_new trigger passes ftpConfig');
  assert.equal(s.indexOf('ftpConfig: FTP.enabled ? FTP.config() : null', first + 1) !== -1, true, 'DR trigger passes ftpConfig too');
  assert.equal((s.match(/ftpConfig: FTP\.enabled \? FTP\.config\(\) : null/g) || []).length, 3, 'exactly three ftpConfig plumbing sites (import_new + DR + overwrite)');
  const s1 = s.indexOf('s3Config: S3.enabled ? S3.config() : null');
  assert.ok(s.indexOf('ftpConfig', s1) !== -1, 'ftpConfig rides the same call site as s3Config');
});

test('server.js: both restore-trigger selects carry ftp_uploaded', () => {
  const s = serverSrc();
  /* 2026-11-26 UAT: the count grew from 2 to 4 — the preview/download
     routes gained the same ftp mirror leg as the triggers (owner report:
     an ftp-located row had no restore path at all). The overwrite-restore
     fix joined a 4th select (owner report: overwrite of a local-deleted
     run answered restoreArchiveMissing). */
  assert.equal((s.match(/select id, task_id, scope, status, sha256, filename, uploaded, ftp_uploaded(, smb_uploaded)? from backup_runs where id = \?/g) || []).length, 4, 'import_new + DR + download + overwrite selects read ftp_uploaded (verify carries a lighter select — same flags minus scope/status)');
});

test('server.js: backupRun carries ftp_uploaded into both units', () => {
  const s = serverSrc();
  assert.equal((s.match(/ftp_uploaded: row\.ftp_uploaded/g) || []).length, 3, 'all three triggers forward the flag');
});

test('zero badge code: destLocation still reads ftp_uploaded via the 96-02 ordered scan — nothing new added', () => {
  const s = serverSrc();
  const i = s.indexOf("if (r.ftp_uploaded === 1) return 'ftp'");
  assert.ok(i !== -1, 'the ordered scan arm is the badge source');
  const r = restoreSrc();
  assert.equal((r.match(/ftp_uploaded/g) || []).length, 5, 'restore.js mentions ftp_uploaded only at the gates (3 gate conditions + 2 doc comments)');
});

test('the 97 client fetchToStaged enforces sha256 (T-98-06 — no unverified bytes reach restore)', () => {
  const s = ftpClientSrc();
  const i = s.indexOf('export async function fetchToStaged(');
  const slice = s.slice(i, i + 2000);
  assert.ok(slice.includes("sha256 !== expectedSha256"), 'mismatch refuses');
  assert.ok(slice.includes('ftpSha256Mismatch'), 'keyed error code');
});
