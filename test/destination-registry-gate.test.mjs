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

test('registry order: s3 is installed via setBackupDestination and registered FIRST (D-04)', () => {
  const s = serverSrc();
  const i3 = s.indexOf("setBackupDestination('s3'");
  assert.ok(i3 !== -1, 's3 is installed via setBackupDestination');
  const first = s.indexOf('setBackupDestination(');
  assert.equal(first, i3, 's3 must be the FIRST registered destination — D-04 precedence (s3 > ftp > smb)');
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

test('the old setter name is gone from the whole codebase (tests included — OQ-1 knowingly-updated twins)', () => {
  const SELF = path.basename(fileURLToPath(import.meta.url));
  const testDir = path.join(ROOT, 'test');
  for (const f of fs.readdirSync(testDir)) {
    if (!f.endsWith('.mjs') || f === SELF) continue;
    const content = fs.readFileSync(path.join(testDir, f), 'utf8');
    assert.ok(!content.includes('setBackupS3Destination'), `test/${f} still pins the removed setter name`);
  }
});
