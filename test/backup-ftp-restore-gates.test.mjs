/* =====================================================================
   Phase 98 plan 04 — FTP restore read-back gates (98-04).
   RE-TARGETED by Plan 103-02 (R-5): the inline ftp read-back twins in
   export/restore.js collapsed into the ONE resolveRestoreSource helper
   (single-source pattern — the ladder had drifted once, 2026-11-27
   UAT). The twin gates now live INSIDE the helper and are pinned there
   ONCE (flag === 1 && config gate shape, local-first + s3 > ftp
   ordering, task-prefix key derivation); the unit-level pins re-target
   to the units DELEGATING to the helper while keeping their own keyed
   envelopes (failWith funnel, dropStagedTmp). server.js plumbing pins
   unchanged: both restore triggers select ftp_uploaded and pass
   ftpConfig from the same FTP.config() seam as s3Config. Zero badge
   code (96-02 ordered scan already reads ftp_uploaded) — pinned by its
   absence here. Same assertion strength, relocated (checker W3).
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

/* ---- the single-source helper: gate shape + ordering, pinned ONCE ---- */

const helperSlice = s => {
  const h = s.indexOf('export async function resolveRestoreSource(');
  assert.ok(h !== -1, 'resolveRestoreSource exists in export/restore.js');
  return s.slice(h, s.indexOf('async function dbRunAudit(', h));
};

test('import_new+units: the ftp read-back leg exists ONCE in resolveRestoreSource, gated on flag === 1 && config (single-source pattern)', () => {
  const s = restoreSrc();
  const slice = helperSlice(s);
  assert.ok(slice.includes("{ dest: 'ftp', flag: ftp_uploaded === 1, config: configs.ftp }"), 'the ftp leg gate lives in the helper (flag IS the truth + D-05 config seam)');
  assert.equal((s.match(/flag: ftp_uploaded === 1, config: configs\.ftp/g) || []).length, 1, 'the ftp gate exists exactly ONCE in the file — zero duplicated ladder logic');
  assert.ok(s.includes('await (leg.dest === \'s3\' ? downloadToStaged : leg.dest === \'ftp\' ? fetchToStaged : fetchSmbToStaged)('), 'the leg calls fetchToStaged via the helper dispatch');
  assert.equal((s.match(/await fetchToStaged\(/g) || []).length, 0, 'no inline fetchToStaged call sites remain in the units');
});

test('import_new+units: the ftp leg sits ABOVE nothing but BELOW the local-first check and the s3 leg (D-88-16 ordering preserved, pinned once in the helper)', () => {
  const s = restoreSrc();
  const slice = helperSlice(s);
  const localCheck = slice.indexOf('fs.existsSync(localPath)');
  const s3Gate = slice.indexOf("flag: uploaded === 1, config: configs.s3");
  const ftpGate = slice.indexOf("flag: ftp_uploaded === 1, config: configs.ftp");
  assert.ok(localCheck !== -1 && s3Gate !== -1 && ftpGate !== -1, 'all three stages present');
  assert.ok(localCheck < s3Gate && s3Gate < ftpGate, 'local → s3 → ftp ordering, pinned once in the helper');
  /* the units delegate — every caller shares the pinned ordering */
  for (const unit of ['export async function restoreOverwriteUnit(', 'export async function runRestore(', 'export async function restoreInstanceUnit(']) {
    const u = s.indexOf(unit);
    assert.ok(s.slice(u, s.indexOf('SNAPSHOT FIRST', u)).includes('resolveRestoreSource('), `${unit} delegates to the helper`);
  }
});

test('import_new+units: ftp key derivation mirrors the 98-01 upload arm (task-prefix + filename, pinned once in the helper)', () => {
  const s = restoreSrc();
  assert.ok(s.includes('`backup-task-${taskId}/${filename}`'), 'the helper derives backup-task-<taskId>/<filename>');
  const b = src('export/backup.js');
  assert.ok(b.includes('`backup-task-${runMeta.taskId}/${filename}`'), 'upload arm uses the same prefix construction');
});

/* ---- gate 2: DR restoreInstanceUnit — failWith posture preserved ---- */

test('DR: the ftp read-back failure routes through failWith with dropStagedTmp (single-source fetch, unit-owned envelope)', () => {
  const s = restoreSrc();
  const drStart = s.indexOf('export async function restoreInstanceUnit(');
  const slice = s.slice(drStart, s.indexOf('SNAPSHOT FIRST', drStart));
  const delegate = slice.indexOf('resolveRestoreSource(');
  assert.ok(delegate !== -1, 'the DR ftp twin delegates to the helper');
  const guarded = slice.slice(delegate, delegate + 800);
  assert.ok(guarded.includes('dropStagedTmp()'), 'seam failure drops the staged temp');
  assert.ok(guarded.includes("failWith(keyed('restoreArchiveMissing'"), 'seam failure keys restoreArchiveMissing through failWith (lock-release funnel)');
});

test('DR: the ftp leg rides the shared local-first + s3 ordering via delegation (98-04 ordering preserved through the helper)', () => {
  const s = restoreSrc();
  const drStart = s.indexOf('export async function restoreInstanceUnit(');
  const slice = s.slice(drStart, s.indexOf('SNAPSHOT FIRST', drStart));
  const delegate = slice.indexOf('resolveRestoreSource(');
  const terminal = slice.indexOf('restore: archive not found at the resolved path');
  assert.ok(delegate !== -1 && terminal !== -1 && delegate < terminal, 'DR resolves through the helper before its own keyed terminal');
  assert.ok(helperSlice(s).includes("flag: ftp_uploaded === 1, config: configs.ftp"), 'the shared ftp gate the DR twin rides is pinned once in the helper');
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
  assert.equal((r.match(/ftp_uploaded/g) || []).length, 4, 'restore.js mentions ftp_uploaded only in the helper (row normalization + leg gate) + clearMirrorFlag column map (Plan 103-02: the three inline gates collapsed into ONE helper leg — count 6 → 4)');
});

test('the 97 client fetchToStaged enforces sha256 (T-98-06 — no unverified bytes reach restore)', () => {
  const s = ftpClientSrc();
  const i = s.indexOf('export async function fetchToStaged(');
  const slice = s.slice(i, i + 2000);
  assert.ok(slice.includes("sha256 !== expectedSha256"), 'mismatch refuses');
  assert.ok(slice.includes('ftpSha256Mismatch'), 'keyed error code');
});
