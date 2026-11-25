/* =====================================================================
   Phase 96 (DEST-01 / TEST-01 byte-gate portion, D-01/D-04/D-05/D-06):
   Wave-0 static gate for the destination registry — pins the seam
   shape, the canonical registration order (s3, ftp, smb), the S3
   install shape, the RAW single-destination error path (no
   "upload failed:" prefix — D-06/OQ-3), and the single run-truth
   write site, so phases 97/98/100 cannot silently drift them.
   Idioms: test/xws-gate.test.mjs (source-slice regex + verbatim
   structure pins), test/backup-history-client.test.mjs (regex idiom).
   ===================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const backupSrc = () => src('export/backup.js');
const serverSrc = () => src('server.js');

test('registry seam: export/backup.js exports setBackupDestination and NOT setBackupS3Destination (D-01/OQ-1, no shim)', () => {
  const b = backupSrc();
  assert.match(b, /const destinations = new Map\(\);/, 'the insertion-ordered registry Map exists');
  assert.match(b, /export function setBackupDestination\(name, dest\) \{/, 'the D-01 registry setter is exported');
  assert.ok(!/setBackupS3Destination/.test(b), 'the legacy single-slot setter is removed outright — NO compat shim (OQ-1)');
  // descriptor shape is documented at the seam (D-01 fields)
  assert.match(b, /\{ label, enabled, upload, verify, probe, fetchToStaged,\s*manualPrefix \}|label, enabled, upload, verify, probe, fetchToStaged,|manualPrefix/);
  assert.match(b, /manualPrefix/, 'the manual-run prefix is DECLARED BY the destination (D-01)');
});

test('registry order: canonical registration s3, ftp, smb in server.js (D-04)', () => {
  const s = serverSrc();
  const i3 = s.indexOf("setBackupDestination('s3'");
  const iftp = s.indexOf("setBackupDestination('ftp'");
  const ismb = s.indexOf("setBackupDestination('smb'");
  assert.ok(i3 !== -1, 's3 is installed via setBackupDestination');
  assert.ok(iftp !== -1, 'ftp dormant slot is registered');
  assert.ok(ismb !== -1, 'smb dormant slot is registered');
  assert.ok(i3 < iftp && iftp < ismb, `registration order must be s3 < ftp < smb (got ${i3}, ${iftp}, ${ismb}) — D-04 precedence`);
  assert.match(s, /manualPrefix: 'backup-ftp\/'/, 'ftp declares its manual prefix (D-01, unused in 96)');
  assert.match(s, /manualPrefix: 'backup-smb\/'/, 'smb declares its manual prefix (D-01, unused in 96)');
});

test('S3 install shape: descriptor with verbatim upload closure + declared manualPrefix (D-01/D-06)', () => {
  const s = serverSrc();
  assert.match(s, /setBackupDestination\('s3', \{/, 'the S3 install rides the registry');
  assert.match(s, /manualPrefix: 'backup-manual\/'/, "S3 declares the D-88-9 manual prefix ('backup-manual/') byte-identically");
  assert.match(s, /enabled: S3\.enabled,/, 'S3 enabled derives from the boot-frozen capability (88-02 custody)');
  // the fail-closed task lookup survives verbatim (D-88-6)
  assert.match(s, /select s3_enabled from backup_tasks where id = \?/);
  assert.match(s, /lookup failed — upload skipped/, 'fail-closed task lookup warn parity kept');
});

test('S3 byte-identity: RAW sliced error on the single-destination path — no "upload failed:" prefix (D-06/OQ-3)', () => {
  const b = backupSrc();
  assert.match(b, /const msg = s3SliceError\(err\);/, 'the raw s3SliceError slice line is pinned (V14/T-88-10)');
  // the composed prefix exists ONLY in the ≥2-destination branch (unreachable in 96)
  const composed = b.match(/upload failed: \$\{failedUploads\.map\(f => f\.name\)\.join\(', '\)\} — first error: \$\{msg\}`/);
  assert.ok(composed, 'the OQ-3 composition hook exists verbatim ("upload failed: <names> — first error: <sliced>")');
  const guard = b.match(/failedUploads\.length >= 2\s*\?\s*`upload failed:/);
  assert.ok(guard, 'composition is gated behind >= 2 failed destinations');
  // exactly ONE occurrence of the composed literal — never applied unconditionally
  const count = (b.match(/upload failed: \$\{failedUploads/g) || []).length;
  assert.equal(count, 1, 'the "upload failed:" prefix appears exactly once — inside the ≥2 branch only');
});

test('run truth: exactly ONE "update backup_runs set uploaded = 1" write site in export/backup.js (D-89-15/D-03 posture)', () => {
  const b = backupSrc();
  const sites = (b.match(/update backup_runs set uploaded = 1/g) || []).length;
  assert.equal(sites, 1, 'the single uploaded=1 write site must stay unique — each destination writes its own flag in its own verified-success block');
});

test('upload slot: ordered registry iteration with the dormant-slot skip contract (D-05)', () => {
  const b = backupSrc();
  assert.match(b, /for \(const \[destName, dest\] of destinations\) \{/, 'the upload slot iterates the registry in insertion order');
  assert.match(b, /typeof dest\.upload !== 'function'\) continue;/, 'slots whose upload fn is unset are SKIPPED — the dormant-slot contract phases 97/100 fill');
  assert.match(b, /setStage\('uploading'\)/, 'the uploading stage transition survives');
  assert.match(b, /downloadToStaged\(provided\.config, key, sha256/, 'the D-88-8 stream-back verify survives');
});

test('dormant custody: FTP/SMB boot-frozen consts in server.js; no wiring, smb client still dormant (D-05, 97-updated)', () => {
  const s = serverSrc();
  for (const name of ['FTP_HOST', 'FTP_PORT', 'FTP_USER', 'FTP_PASSWORD', 'FTP_SECURE', 'FTP_PASV_HOST', 'FTP_INSECURE']) {
    assert.match(s, new RegExp(`const ${name} = `), `FTP ${name} boot-frozen const present`);
  }
  for (const name of ['SMB_HOST', 'SMB_SHARE', 'SMB_USER', 'SMB_PASSWORD']) {
    assert.match(s, new RegExp(`const ${name} = `), `SMB ${name} boot-frozen const present`);
  }
  // enabled derivation mirrors the S3 pattern
  assert.match(s, /enabled: !!\(FTP_HOST && FTP_USER && FTP_PASSWORD\)/, 'ftp enabled derives from env (D-05)');
  assert.match(s, /enabled: !!\(SMB_HOST && SMB_SHARE && SMB_USER && SMB_PASSWORD\)/, 'smb enabled derives from env (D-05)');
  // warn parity, NOT the S3 hard boot-refuse (SC-4)
  assert.match(s, /partially set — destination disabled/, 'partial FTP/SMB env warns at boot (SC-4)');
  // NO client modules until their own phase (D-05 hard rule) — Phase 97
  // unlocked export/ftp.js; Phase 99 unlocked export/smb.js. Phase 100
  // (100-02) wired the smb client into export/backup.js's upload arm —
  // the gate released backup.js then. 100-03 wired probeSmb into
  // server.js (probe route + probe-at-save twins) — server.js is
  // released here; export/restore.js stays pinned until 100-05
  // (fetchToStaged wiring).
  assert.ok(fs.existsSync(path.join(ROOT, 'export', 'ftp.js')), 'export/ftp.js exists since Phase 97 (zero-dep client)');
  assert.ok(fs.existsSync(path.join(ROOT, 'export', 'smb.js')), 'export/smb.js exists since Phase 99 (zero-dep client)');
  for (const wiredFile of [path.join('export', 'restore.js')]) {
    const wired = fs.readFileSync(path.join(ROOT, wiredFile), 'utf8');
    assert.ok(!/from ['"].*smb(\.js)?['"]/.test(wired) && !/require\(['"].*smb(\.js)?['"]\)/.test(wired),
      `${wiredFile} must NOT wire the smb client yet (phase 100's job)`);
  }
});

test('the old setter name is gone from the whole codebase (tests included — OQ-1 knowingly-updated twins)', () => {
  const SELF = path.basename(fileURLToPath(import.meta.url));
  const testDir = path.join(ROOT, 'test');
  for (const f of fs.readdirSync(testDir)) {
    if (!f.endsWith('.mjs') || f === SELF) continue;
    const content = fs.readFileSync(path.join(testDir, f), 'utf8');
    assert.ok(!content.includes('setBackupS3Destination'), `test/${f} still pins the removed setter name`);
  }
});

test('badge scan (96-02, D-04/OQ-2/SC-5): location derives via the ordered destLocation scan — local > s3 > ftp > smb > missing', () => {
  const s = serverSrc();
  assert.match(s, /function destLocation\(r\) \{/, 'the shared destLocation helper exists in server.js');
  // the ordered scan: local fs membership, then uploaded, ftp_uploaded, smb_uploaded, else missing
  const helper = s.slice(s.indexOf('function destLocation(r)'), s.indexOf('function destLocation(r)') + 900);
  assert.match(helper, /fs\.existsSync\(path\.join\(backupsRoot\(\), r\.filename\)\)\) return 'local'/, 'local fs membership checked first');
  assert.match(helper, /r\.uploaded === 1\) return 's3'/, 's3 checked second (uploaded keeps the D-03 S3/local-published meaning)');
  assert.match(helper, /r\.ftp_uploaded === 1\) return 'ftp'/, 'ftp checked third');
  assert.match(helper, /r\.smb_uploaded === 1\) return 'smb'/, 'smb checked fourth');
  assert.match(helper, /return 'missing'/, 'missing is the fail-closed fallback');
  // SC-5 one-line extension shape: the helper is the ONLY place the per-run
  // flag ternary chain lives — no hardcoded s3-only ternary at the call sites.
  const sites = (s.match(/location: destLocation\(r\)/g) || []).length;
  assert.ok(sites >= 3, `all three badge call sites use the ordered scan (got ${sites})`);
  const ternaries = (s.match(/r\.uploaded === 1 \? 's3' : 'missing'/g) || []).length;
  assert.equal(ternaries, 0, 'no hardcoded uploaded-only badge ternary remains at the call sites');
});

test('config payload (96-02, D-02/T-96-03): flat sibling ftpEnabled/smbEnabled booleans; s3Enabled untouched; no destinations nesting', () => {
  const s = serverSrc();
  const i = s.indexOf('s3Enabled: S3.enabled,');
  assert.ok(i !== -1, 's3Enabled stays byte-identical in /api/config');
  const block = s.slice(i, i + 600);
  assert.match(block, /ftpEnabled: !!\(FTP_HOST && FTP_USER && FTP_PASSWORD\)/, 'ftpEnabled is a flat boolean derived from the boot-frozen consts (D-05)');
  assert.match(block, /smbEnabled: !!\(SMB_HOST && SMB_SHARE && SMB_USER && SMB_PASSWORD\)/, 'smbEnabled is a flat boolean derived from the boot-frozen consts (D-05)');
  // T-96-03: no nested destinations object leaks into the config payload
  assert.ok(!/destinations: \{/.test(s.slice(s.indexOf("pathname === '/api/config'"), s.indexOf("pathname === '/api/config'") + 800)), 'no destinations:{} nesting in the config payload');
});
