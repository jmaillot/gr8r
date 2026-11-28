/* =====================================================================
   Phase 100 plan 05 — SMB restore read-back gates (100-05).
   RE-TARGETED by Plan 103-02 (R-5): the inline smb read-back twins in
   export/restore.js collapsed into the ONE resolveRestoreSource helper
   (single-source pattern — the ladder had drifted once, 2026-11-27
   UAT). The twin gates now live INSIDE the helper and are pinned there
   ONCE (flag === 1 && config gate shape, local-first + s3 > ftp > smb
   ordering, task-prefix key derivation); the unit-level pins re-target
   to the units DELEGATING to the helper while keeping their own keyed
   envelopes (the failWith funnel for DR/overwrite, the throw-keyed
   resolve-by-design posture for import_new). server.js plumbing pins
   unchanged: both restore triggers select smb_uploaded and pass
   smbConfig from the same SMB.config() seam as ftpConfig. VERBATIM
   DIFFERENCE preserved: the DR/overwrite failure routes through
   failWith (lock release, 89-05) and import_new throws keyed — each
   posture pinned in place. Zero badge code (96-02 ordered scan already
   reads smb_uploaded) — pinned by its absence here. Same assertion
   strength, relocated (checker W3).
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

/* ---- the single-source helper: gate shape + ordering, pinned ONCE ---- */

const helperSlice = s => {
  const h = s.indexOf('export async function resolveRestoreSource(');
  assert.ok(h !== -1, 'resolveRestoreSource exists in export/restore.js');
  return s.slice(h, s.indexOf('async function dbRunAudit(', h));
};

test('import_new+units: the smb read-back leg exists ONCE in resolveRestoreSource, gated on flag === 1 && config (single-source pattern)', () => {
  const s = restoreSrc();
  const slice = helperSlice(s);
  assert.ok(slice.includes("{ dest: 'smb', flag: smb_uploaded === 1, config: configs.smb }"), 'the smb leg gate lives in the helper (flag IS the truth + D-05 config seam)');
  assert.equal((s.match(/flag: smb_uploaded === 1, config: configs\.smb/g) || []).length, 1, 'the smb gate exists exactly ONCE in the file — zero duplicated ladder logic');
  assert.ok(s.includes('await (leg.dest === \'s3\' ? downloadToStaged : leg.dest === \'ftp\' ? fetchToStaged : fetchSmbToStaged)('), 'the leg calls fetchSmbToStaged via the helper dispatch');
  assert.equal((s.match(/await fetchSmbToStaged\(/g) || []).length, 0, 'no inline fetchSmbToStaged call sites remain in the units');
});

test('import_new+units: the smb leg sits BELOW the local-first check, the s3 leg AND the ftp leg (ordering pinned once in the helper)', () => {
  const s = restoreSrc();
  const slice = helperSlice(s);
  const localCheck = slice.indexOf('fs.existsSync(localPath)');
  const s3Gate = slice.indexOf("flag: uploaded === 1, config: configs.s3");
  const ftpGate = slice.indexOf("flag: ftp_uploaded === 1, config: configs.ftp");
  const smbGate = slice.indexOf("flag: smb_uploaded === 1, config: configs.smb");
  assert.ok(localCheck !== -1 && s3Gate !== -1 && ftpGate !== -1 && smbGate !== -1, 'all four stages present');
  assert.ok(localCheck < s3Gate && s3Gate < ftpGate && ftpGate < smbGate, 'local → s3 → ftp → smb ordering, prior gates untouched, pinned once');
  /* the units delegate — every caller shares the pinned ordering */
  for (const unit of ['export async function restoreOverwriteUnit(', 'export async function runRestore(', 'export async function restoreInstanceUnit(']) {
    const u = s.indexOf(unit);
    assert.ok(s.slice(u, s.indexOf('SNAPSHOT FIRST', u)).includes('resolveRestoreSource('), `${unit} delegates to the helper`);
  }
});

test('import_new+units: smb key derivation mirrors the 100-02 upload arm (task-prefix + filename, pinned once in the helper)', () => {
  const s = restoreSrc();
  assert.ok(s.includes('`backup-task-${taskId}/${filename}`'), 'the helper derives backup-task-<taskId>/<filename>');
  const b = src('export/backup.js');
  assert.ok(b.includes('`backup-task-${runMeta.taskId}/${filename}`') || b.includes('smbPath'), 'upload arm uses the same prefix construction');
});

/* ---- gate 2: DR restoreInstanceUnit — VERBATIM DIFFERENCE (failWith posture) ---- */

test('DR: the smb read-back failure routes through failWith with dropStagedTmp (single-source fetch, unit-owned envelope)', () => {
  const s = restoreSrc();
  const drStart = s.indexOf('export async function restoreInstanceUnit(');
  const slice = s.slice(drStart, s.indexOf('SNAPSHOT FIRST', drStart));
  const delegate = slice.indexOf('resolveRestoreSource(');
  assert.ok(delegate !== -1, 'the DR smb twin delegates to the helper');
  const guarded = slice.slice(delegate, delegate + 800);
  assert.ok(guarded.includes('dropStagedTmp()'), 'seam failure drops the staged temp');
  assert.ok(guarded.includes("failWith(keyed('restoreArchiveMissing'"), 'seam failure keys restoreArchiveMissing through failWith (lock-release funnel)');
});

test('DR: the smb leg rides the shared local-first + s3/ftp ordering via delegation (100-05 ordering preserved through the helper)', () => {
  const s = restoreSrc();
  const drStart = s.indexOf('export async function restoreInstanceUnit(');
  const slice = s.slice(drStart, s.indexOf('SNAPSHOT FIRST', drStart));
  const delegate = slice.indexOf('resolveRestoreSource(');
  const terminal = slice.indexOf('restore: archive not found at the resolved path');
  assert.ok(delegate !== -1 && terminal !== -1 && delegate < terminal, 'DR resolves through the helper before its own keyed terminal');
  assert.ok(helperSlice(s).includes("flag: smb_uploaded === 1, config: configs.smb"), 'the shared smb gate the DR twin rides is pinned once in the helper');
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
  assert.equal((r.match(/smb_uploaded/g) || []).length, 4, 'restore.js mentions smb_uploaded only in the helper (row normalization + leg gate) + clearMirrorFlag column map (Plan 103-02: the three inline gates collapsed into ONE helper leg — count 6 → 4)');
});

test('the 99 client fetchSmbToStaged enforces sha256 (T-100-10 — no unverified bytes reach restore)', () => {
  const s = smbClientSrc();
  const i = s.indexOf('export async function fetchSmbToStaged(');
  const slice = s.slice(i, i + 2000);
  assert.ok(slice.includes('sha256 !== expectedSha256'), 'mismatch refuses');
  assert.ok(slice.includes('smbSha256Mismatch'), 'keyed error code');
  assert.ok(slice.indexOf("if (sha256 !== expectedSha256)") < slice.indexOf('writeFileSync'), 'verification happens BEFORE any staging file exists');
});

test('the ftp legs are byte-identical to their 98-04 posture (no behavior change from this plan — the helper keeps the shared dispatch)', () => {
  const s = restoreSrc();
  assert.equal((s.match(/const back = await \(leg\.dest === 's3' \? downloadToStaged : leg\.dest === 'ftp' \? fetchToStaged : fetchSmbToStaged\)\(leg\.config, key, sha256, restoreStagingDir\(\)\);/g) || []).length, 1, 'the shared seam dispatch exists exactly once — the single-source call shape (98-04/100-05 byte-identical semantics, key computed per leg)');
  const drStart = s.indexOf('export async function restoreInstanceUnit(');
  const slice = s.slice(drStart, s.indexOf('SNAPSHOT FIRST', drStart));
  const delegate = slice.indexOf('resolveRestoreSource(');
  assert.ok(slice.slice(delegate, delegate + 800).includes('failWith'), 'the DR smb twin keeps its failWith posture');
});
