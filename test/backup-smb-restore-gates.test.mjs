/* =====================================================================
   Phase 100 plan 05 — SMB restore read-back gates (100-05).
   Static source-slice pins over export/restore.js + server.js proving
   the two smb read-back twins (import_new runRestore + DR
   restoreInstanceUnit): gated on smb_uploaded === 1 && opts.smbConfig,
   calling the 99 client's fetchSmbToStaged (single-shot + sha256,
   T-100-10), additive BELOW the local-first check and the ftp twins
   (98-04 ordering untouched), with the smb key derivation mirroring the
   100-02 upload arm (task-prefix + filename). server.js plumbing pins:
   both restore triggers select smb_uploaded and pass smbConfig from the
   same SMB.config() seam as ftpConfig. VERBATIM DIFFERENCE preserved:
   the import_new twin rides the outer try flow (like the ftp twin),
   the DR twin is failWith-guarded so the funnel releases the
   restore_lock — the pin asserts each posture in place. Zero badge
   code (96-02 ordered scan already reads smb_uploaded) — pinned by its
   absence here.
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
const smbClientSrc = () => src('export/smb.js');

/* ---- gate 1: import_new runRestore ---- */

test('import_new: the smb read-back twin exists, gated on smb_uploaded === 1 && opts.smbConfig', () => {
  const s = restoreSrc();
  const i = s.indexOf('backupRun.smb_uploaded === 1 && opts.smbConfig');
  assert.ok(i !== -1, 'the smb twin gate exists in runRestore');
  assert.ok(s.includes('await fetchSmbToStaged('), 'the twin calls fetchSmbToStaged');
});

test('import_new: the smb twin sits BELOW the local-first check, the s3 gate AND the ftp twin (ordering preserved)', () => {
  const s = restoreSrc();
  const runRestoreStart = s.indexOf('export async function runRestore(');
  const importEnd = s.indexOf('restoreImportAsNew', runRestoreStart);
  const slice = s.slice(runRestoreStart, importEnd);
  const localCheck = slice.indexOf('fs.existsSync(localPath)');
  const s3Gate = slice.indexOf('backupRun.uploaded === 1 && opts.s3Config');
  const ftpGate = slice.indexOf('backupRun.ftp_uploaded === 1 && opts.ftpConfig');
  const smbGate = slice.indexOf('backupRun.smb_uploaded === 1 && opts.smbConfig');
  assert.ok(localCheck !== -1 && s3Gate !== -1 && ftpGate !== -1 && smbGate !== -1, 'all four stages present');
  assert.ok(localCheck < s3Gate && s3Gate < ftpGate && ftpGate < smbGate, 'local → s3 → ftp → smb ordering, prior gates untouched');
});

test('import_new: smb key derivation mirrors the 100-02 upload arm (task-prefix + filename)', () => {
  const s = restoreSrc();
  assert.ok(s.includes('`backup-task-${backupRun.taskId}/${backupRun.filename}`'), 'restore derives backup-task-<taskId>/<filename>');
  const b = src('export/backup.js');
  assert.ok(b.includes('`backup-task-${runMeta.taskId}/${filename}`') || b.includes('smbPath'), 'upload arm uses the same prefix construction');
});

/* ---- gate 2: DR restoreInstanceUnit — VERBATIM DIFFERENCE (failWith posture) ---- */

test('DR: the smb read-back twin exists, failWith-guarded with dropStagedTmp', () => {
  const s = restoreSrc();
  const drStart = s.indexOf('export async function restoreInstanceUnit(');
  const slice = s.slice(drStart);
  const smbGate = slice.indexOf('backupRun.smb_uploaded === 1 && opts.smbConfig');
  assert.ok(smbGate !== -1, 'the DR smb twin gate exists');
  const guarded = slice.slice(smbGate, smbGate + 800);
  assert.ok(guarded.includes('dropStagedTmp()'), 'seam failure drops the staged temp');
  assert.ok(guarded.includes("failWith(keyed('restoreArchiveMissing'"), 'seam failure keys restoreArchiveMissing through failWith (lock-release funnel)');
});

test('DR: the smb twin sits BELOW the local-first check, the guarded s3 twin and the guarded ftp twin', () => {
  const s = restoreSrc();
  const drStart = s.indexOf('export async function restoreInstanceUnit(');
  const snapshot = s.indexOf('SNAPSHOT FIRST', drStart);
  const slice = s.slice(drStart, snapshot);
  const localCheck = slice.indexOf('fs.existsSync(localPath)');
  const s3Gate = slice.indexOf('backupRun.uploaded === 1 && opts.s3Config');
  const ftpGate = slice.indexOf('backupRun.ftp_uploaded === 1 && opts.ftpConfig');
  const smbGate = slice.indexOf('backupRun.smb_uploaded === 1 && opts.smbConfig');
  assert.ok(localCheck !== -1 && s3Gate !== -1 && ftpGate !== -1 && smbGate !== -1, 'all four stages present');
  assert.ok(localCheck < s3Gate && s3Gate < ftpGate && ftpGate < smbGate, 'local → s3 → ftp → smb ordering preserved');
});

/* ---- plumbing: opts.smbConfig from the same seam as opts.ftpConfig ---- */

test('server.js: both restore triggers pass smbConfig next to ftpConfig, sourced from SMB.config()', () => {
  const s = serverSrc();
  const first = s.indexOf('smbConfig: SMB.enabled ? SMB.config() : null');
  assert.ok(first !== -1, 'import_new trigger passes smbConfig');
  assert.equal(s.indexOf('smbConfig: SMB.enabled ? SMB.config() : null', first + 1) !== -1, true, 'DR trigger passes smbConfig too');
  assert.equal((s.match(/smbConfig: SMB\.enabled \? SMB\.config\(\) : null/g) || []).length, 3, 'exactly three smbConfig plumbing sites (import_new + DR + overwrite)');
  const f1 = s.indexOf('ftpConfig: FTP.enabled ? FTP.config() : null');
  assert.ok(s.indexOf('smbConfig', f1) !== -1, 'smbConfig rides the same call site as ftpConfig');
});

test('server.js: both restore-trigger selects carry smb_uploaded', () => {
  const s = serverSrc();
  /* 2026-11-26 UAT: count grew from 2 to 4 — preview/download joined the
     triggers with the smb mirror leg (owner report: an smb-located run
     answered restoreArchiveMissing). The overwrite-restore fix joined a
     4th select (overwrite of a local-deleted run). */
  assert.equal((s.match(/select id, task_id, scope, status, sha256, filename, uploaded, ftp_uploaded, smb_uploaded from backup_runs where id = \?/g) || []).length, 4, 'import_new + DR + download + overwrite selects read smb_uploaded (verify carries a lighter select — same flags minus scope/status)');
});

test('server.js: backupRun carries smb_uploaded into both units', () => {
  const s = serverSrc();
  assert.equal((s.match(/smb_uploaded: row\.smb_uploaded/g) || []).length, 3, 'all three triggers forward the flag');
});

test('server.js: the restore archive gates admit ROTATED rows (status deleted) — the surviving smb/ftp/s3 mirror is restorable after local rotation (UAT 2026-11-27)', () => {
  const s = serverSrc();
  /* The three archive-resolution gates (preview counted separately) read
     `!['succeeded','deleted'].includes(row.status)` — a rotated row with a
     surviving mirror flag flows into runRestore's staged-fetch legs; a
     rotated row with NO surviving mirror still refuses keyed. */
  assert.equal((s.match(/!\['succeeded', 'deleted'\]\.includes\(row\.status\)/g) || []).length, 3, 'import_new + overwrite + preview admit rotated rows');
  assert.ok(!s.includes("row.status !== 'succeeded' || !row.sha256"), 'no succeeded-only archive gate remains');
});

test('zero badge code: destLocation still reads smb_uploaded via the 96-02 ordered scan — nothing new added', () => {
  const s = serverSrc();
  const i = s.indexOf("if (r.smb_uploaded === 1) return 'smb'");
  assert.ok(i !== -1, 'the ordered scan arm is the badge source');
  const r = restoreSrc();
  assert.equal((r.match(/smb_uploaded/g) || []).length, 6, 'restore.js mentions smb_uploaded only at the gates (3 gate conditions + 2 doc comments + clearMirrorFlag column map — UAT 2026-11-27 mirror-truth maintenance)');
});

test('the 99 client fetchSmbToStaged enforces sha256 (T-100-10 — no unverified bytes reach restore)', () => {
  const s = smbClientSrc();
  const i = s.indexOf('export async function fetchSmbToStaged(');
  const slice = s.slice(i, i + 2000);
  assert.ok(slice.includes('sha256 !== expectedSha256'), 'mismatch refuses');
  assert.ok(slice.includes('smbSha256Mismatch'), 'keyed error code');
  assert.ok(slice.indexOf("if (sha256 !== expectedSha256)") < slice.indexOf('writeFileSync'), 'verification happens BEFORE any staging file exists');
});

test('the ftp twins are byte-identical to their 98-04 posture (no behavior change from this plan)', () => {
  const s = restoreSrc();
  assert.equal((s.match(/await fetchToStaged\(opts\.ftpConfig, `backup-task-\$\{backupRun\.taskId\}\/\$\{backupRun\.filename\}`, backupRun\.sha256, restoreStagingDir\(\)\)/g) || []).length, 3, 'all three ftp twins call fetchToStaged with the exact 98-04 shape');
  const drStart = s.indexOf('export async function restoreInstanceUnit(');
  const slice = s.slice(drStart);
  const ftpGate = slice.indexOf('backupRun.ftp_uploaded === 1 && opts.ftpConfig');
  assert.ok(slice.slice(ftpGate, ftpGate + 800).includes('failWith'), 'the DR ftp twin keeps its failWith posture');
});
