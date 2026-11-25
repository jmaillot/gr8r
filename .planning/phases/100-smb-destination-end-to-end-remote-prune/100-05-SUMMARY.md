---
phase: 100-smb-destination-end-to-end-remote-prune
plan: 05
subsystem: backup-restore-e2e-docs
tags: [backup, restore, smb, e2e, deploy-docs, samba]
requires: [100-01 (fetchSmbToStaged), 100-02 (smb upload arm + smb_uploaded), 100-03 (probeSmb client trio), 100-04 (SMB_PORT seam, fakeSmb helper)]
provides: [SMB restore read-back twins (import_new + DR), smbConfig plumbing both triggers, test/backup-smb-restore-gates.test.mjs, test/backup-smb-e2e.test.mjs (D-02 two-container recipe), DEPLOY §21-append SMB + §22 FTPS]
affects: [SC-1 restore half, SC-5 real-server proof, DEPLOY.md, phase-100 close-out]
tech-stack:
  added: []
  patterns: [twin-beside-twin additive restore gates (per-site containment posture preserved), env-gated two-container e2e recipe, static source-slice pins]
key-files:
  created: [test/backup-smb-restore-gates.test.mjs, test/backup-smb-e2e.test.mjs]
  modified: [export/restore.js, server.js, test/backup-ftp-restore-gates.test.mjs, test/backup-prune.test.mjs, test/destination-registry-gate.test.mjs, docs/DEPLOY.md]
decisions:
  - "Import_new SMB twin rides the ungated outer-flow posture (like ftp :2080); DR twin keeps the failWith/dropStagedTmp containment verbatim — the postures are intentionally NOT homogenized (pin asserts each)"
  - "smbConfig rides the same call sites as ftpConfig from the same SMB.config() seam — exactly two plumbing sites, both selects widened with smb_uploaded"
  - "D-02 recipe: ONE header recipe, TWO dperson/samba containers — SMB2-min happy (+ map-to-guest guest pin) and SMB3-min refusal; gated independently on SAMBATEST_URL / SAMBATEST_SMB3_URL"
  - "SMB3 gate asserts via connectSmb rejection (err.code === 'smbDialectUnsupported') + probeSmb ok:false/key 'generic' — probeSmb surfaces smbClass, connect throws the keyed code"
metrics:
  duration: ~1.5h
  completed: 2026-11-25
  tasks: 3
  files: 8
actuals:
  tokens: 32000
  tasks: 3
  commits: 4
status: complete
commits: 4
plan_head_before: 76ea90df48eaf29301ba904ab248ce4aee02e9506
plan_head_after: bb0fc5725503bd874a9bbaca7aa5b462e66eaaf1
estimate:
  tokens: 60000
  tasks: 3
---

# Phase 100 Plan 05: Restore Twins + E2E Recipe + DEPLOY Summary

**One-liner:** SMB restore read-back twins (import_new + DR) with smbConfig plumbing through both restore triggers, the D-02 two-container dperson/samba e2e recipe (SMB2-min happy + guest pin + SMB3-min `smbDialectUnsupported` refusal, skip-when-absent), and DEPLOY §21-appended SMB share-perms/ACL/prune guidance + new §22 FTPS hardening.

## What Was Built

- **Task 1 (09ba30b0 + 392cd3ea):** an SMB twin beside each ftp twin in `export/restore.js` — gate `!archivePath && backupRun.smb_uploaded === 1 && opts.smbConfig && typeof opts.smbConfig === 'object' && backupRun.filename` → `fetchSmbToStaged(opts.smbConfig, \`backup-task-${taskId}/${filename}\`, sha256, restoreStagingDir())`. The import_new twin keeps the ungated outer-flow posture; the DR twin keeps the failWith/dropStagedTmp funnel posture verbatim (lock-release containment). server.js: both restore-trigger SELECTs + backupRun objects carry `smb_uploaded`; both triggers pass `smbConfig: SMB.enabled ? SMB.config() : null` beside ftpConfig. `test/backup-smb-restore-gates.test.mjs` (NEW, 11 pins): ordering (local → s3 → ftp → smb), per-site posture, key-derivation mirror, plumbing counts, T-100-10 pre-write sha256 verification, ftp twins byte-identical. The 98 ftp SELECT pin widened tolerantly (392cd3ea).
- **Task 2 (3f7bf2c5):** `test/backup-smb-e2e.test.mjs` (NEW) — header documents the ONE compose recipe with TWO dperson/samba containers: container 1 SMB2-min (`server min protocol = SMB2`, share `backups` guest-yes/users-all, `map to guest = Bad User`), container 2 SMB3-min. Gates: happy-path suite (probe keyed success + no guest flag; archive-analog write/read-back under the task prefix; fetchSmbToStaged sha256 round-trip + mismatch-refuses-staging-nothing; rm; guest pin — wrong-password probe succeeds with the informational `guest` flag) gated on `SAMBATEST_URL`; SMB3 refusal gate (connectSmb rejects `err.code === 'smbDialectUnsupported'` + probe `ok:false`/`key 'generic'`) gated on `SAMBATEST_SMB3_URL`. Always-on skip-when-absent proof test. Throws throwaway credentials only (T-100-11).
- **Task 3 (bb0fc572):** DEPLOY.md — SMB sub-section appended to §21 (SMB_* env table incl. SMB_PORT — the 100-04 seam documented; guest-access informational semantics; share-perms/ACL pitfalls: prune = DELETE, force user/create mask, ACCESS_DENIED 0xc0000022 hard-refuse, Windows NTFS ACL ∩ share perms with `backup_prune_failed:smb` as the operator signal, key layout + fetchSmbToStaged pre-write sha256 + D-01 sole-copy floor-guard in plain language); NEW §22 "FTPS hardening" (passive-range firewall openings + FTP_PASV_HOST, FTP_INSECURE semantics, explicit-vs-implicit TLS + no port-990 seam note). Stale server.js SMB_PORT comment refreshed to match.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 98 ftp SELECT pin broke on the additive column**
- **Found during:** Task 1 — `test/backup-ftp-restore-gates.test.mjs` pinned the exact SELECT string; the widened select failed exact match.
- **Fix:** regex tolerates the optional `, smb_uploaded` suffix; message documents the additive append.
- **Commit:** 392cd3ea

**2. [Rule 3 - Blocking] Two phase-boundary pins released**
- **Found during:** Task 3 full-suite gate — `backup-prune.test.mjs` counted exactly 5 `uploaded, ftp_uploaded, smb_uploaded` SELECT lines (now 7 with the two restore-trigger selects); `destination-registry-gate.test.mjs` pinned "export/restore.js must NOT wire the smb client yet" — a dormant-custody pin whose release point IS 100-05.
- **Fix:** prune count pin updated to 7 with the two new selects folded into the never-publishes-remote_pruned group; the dormant-custody wired-file loop removed with the comment updated (smb client fully released).
- **Commit:** bb0fc572

**3. [Rule 1 - Stale comment] server.js SMB_PORT comment**
- **Found during:** Task 3 — the SMB closure comment still said "SMB_PORT has no env seam yet" (contradicted the 100-04 seam that DEPLOY now documents).
- **Fix:** comment refreshed.
- **Commit:** bb0fc572

## A1-A4 Falsification Status (99-SPIKE)

| Assumption | Status | Evidence |
|-----------|--------|----------|
| A1 — SessionFlags IS_GUEST bit readable at body offset 2 | **mock-verified; real-run pending** | wiring/prune suites drive the real client against `fakeSmb` (guest bit asserted); the e2e guest pin (`SAMBATEST_URL` + `map to guest = Bad User`) is the live falsifier — gates skip-when-absent, no docker during execution |
| A2 — dperson/samba supports min-protocol + map-to-guest flags | **recipe written; unverified live** | recipe header carries `-g "server min protocol = SMB2/SMB3"` + `-g "map to guest = Bad User"`; if the image needs different flags, adjust the header (assertions are the contract) — noted in the file header |
| A3 — nonexistent-path CREATE → 0xc0000034 generic class | **mock-verified (100-04)** | prune suite pins the not-found → idempotent success mapping; live samba rerun covered by the same e2e recipe when provisioned |
| A4 — widened delete-set SELECT pin-neutral | **verified** | rotation suite green unchanged in 100-04; full suite green this plan |

SC-5 real-server proof runs when an operator provisions the recipe: `SAMBATEST_URL=… SAMBATEST_SMB3_URL=… node --test test/backup-smb-e2e.test.mjs`. Until then the gates skip silently (by design — the recipe is the deliverable).

## Verification

- `node --test test/backup-smb-restore-gates.test.mjs` — 11/11 green.
- `node --test test/backup-smb-e2e.test.mjs` — 1 pass / 4 skip (skip-when-absent correct; exit 0).
- `node --test test/backup-ftp-restore-gates.test.mjs` — green (ftp twins untouched).
- `node --test test/destination-registry-gate.test.mjs` — 10/10 green; `node --test test/xws-gate.test.mjs` — 4/4 green.
- `grep -c SMB_HOST docs/DEPLOY.md` = 1; pasv references = 5.
- `npm test` — **2667 tests / 2634 pass / exactly the 2 documented pre-existing failures** (fr-typography, webhook-routes GET list). Zero package.json diff. Suite grew 2651 → 2667 (+16: 11 restore-gates + 5 e2e).

## Known Stubs

None — no stub patterns. The e2e gates are env-gated skips by design (D-03 idiom), not stubs.

## Threat Flags

None — no new security surface beyond the plan's threat model. T-100-10 (sha256 before staging) is implemented (100-01) and pinned pre-write here; T-100-11 (throwaway credentials) is documented in the e2e header; T-100-SC (zero dependencies) held — package.json untouched.

## Self-Check: PASSED

All 4 commits verified in git log (09ba30b0, 392cd3ea, 3f7bf2c5, bb0fc572); both created test files exist on disk; SUMMARY written at `.planning/phases/100-smb-destination-end-to-end-remote-prune/100-05-SUMMARY.md`.
