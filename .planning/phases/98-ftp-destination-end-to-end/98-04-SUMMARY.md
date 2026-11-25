---
phase: 98
plan: 04
subsystem: backup-pipeline
tags: [backup, ftp, restore, e2e, vsftpd, deploy-docs]
requires: [98-01 ftp upload leg + FTP.config() seam, 97-01 export/ftp.js fetchToStaged, 88-01 restore downloadToStaged seam]
provides: [FTP restore read-back twins (import_new + DR) via fetchToStaged + sha256, opts.ftpConfig plumbing at both restore triggers, test/backup-ftp-restore-gates.test.mjs, test/backup-ftp-e2e.test.mjs (VSFTPD_TEST_URL-gated), docs/DEPLOY.md §21]
affects: [verifier (SC-3/SC-5), FTP outage recovery (restore pulls from FTP when local rotated away)]
tech-stack:
  added: []
  patterns: [additive restore gate twins keyed on ftp_uploaded === 1 && opts.ftpConfig, failWith-guarded DR seam throw, env-gated docker e2e mirroring MINIO_TEST_URL]
key-files:
  created: [test/backup-ftp-restore-gates.test.mjs, test/backup-ftp-e2e.test.mjs]
  modified: [export/restore.js, server.js, docs/DEPLOY.md]
decisions:
  - "ftp twin gates include a backupRun.filename guard (needed to derive ftpKey) even where the s3 twin omits it — server.js already refuses rows without filename before firing"
  - "The overwrite restore trigger's row select was left untouched — restoreOverwriteUnit has no read-back seam (no downloadToStaged), so no ftp twin exists there"
  - "e2e backup leg mirrors the 98-01 ftp arm at the client level (STOR → SIZE → sidecar STOR under the task prefix) rather than spawning the full app server — the runExport loop is already proven by 98-01's in-process pipeline tests; this file proves the REAL server-side artifacts + restore read-back vs real vsftpd"
metrics:
  duration: 34m
  completed: 2026-11-25T15:05Z
status: complete
commits: 2
plan_head_before: 138ba780e059268997809794be4b9a99d11e9a13
plan_head_after: 405bcf30
actuals:
  tokens: 31000
  tasks: 3
  commits: 2
---

# Phase 98 Plan 04: FTP Restore Read-Back + vsftpd E2E Summary

FTP-stored archives now restore: both restore gates (import_new runRestore + DR restoreInstanceUnit) gained an additive ftp read-back twin that pulls the archive home through the 97 client's fetchToStaged (single-shot + sha256, T-98-06) when `ftp_uploaded === 1 && opts.ftpConfig`, with the ftp key derived identically to the 98-01 upload arm — and a VSFTPD_TEST_URL-gated docker e2e proves the full backup→FTP→restore loop (probe, STOR+SIZE+sidecar under the task prefix, byte-identical fetchToStaged read-back, mismatch refusal) skipping silently without the env, with DEPLOY.md §21 in the same commit.

## What Was Built

- **export/restore.js** — `fetchToStaged` import + two ftp read-back twins: in `runRestore` (import_new), additive below the local-first check and the untouched s3 gate; in `restoreInstanceUnit` (DR), failWith-guarded like the s3 twin with `dropStagedTmp()` and keyed `restoreArchiveMissing` on seam failure (lock-release funnel preserved). s3 gates byte-untouched; local-first ordering preserved at both seams.
- **server.js** — both restore triggers (import_new + DR) select `ftp_uploaded`, forward it in `backupRun`, and pass `ftpConfig: FTP.enabled ? FTP.config() : null` from the exact seam `s3Config` rides (98-01's FTP capability object). Overwrite trigger untouched (no read-back seam in that unit). Zero badge code — the 96-02 ordered scan already reads ftp_uploaded.
- **test/backup-ftp-restore-gates.test.mjs** (NEW, 10 tests) — static slice pins: both twins gated on `ftp_uploaded === 1 && opts.ftpConfig`, fetchToStaged referenced, local→s3→ftp ordering preserved at both seams, DR twin failWith-guarded + dropStagedTmp, ftpKey derivation mirrors the upload arm, exactly two ftpConfig plumbing sites + two ftp_uploaded selects, backupRun forwards the flag, zero badge code, client sha256 enforcement (T-98-06).
- **test/backup-ftp-e2e.test.mjs** (NEW, 3 tests) — D-03 clone of the MinIO recipe: header documents the fauria/vsftpd docker run (pasv_min/max ports, PASV_ADDRESS, FTP_* env mapping), `VSFTPD_TEST_URL` host:port gate + skip-when-absent. Gated tests: probeFtp marker success (+ insecure-transport httpWarning posture), full loop — STOR archive → SIZE verify → sidecar STOR under `backup-task-<id>/` → fetchToStaged byte-identical read-back + sidecar hash assertion → sha256 mismatch rejects with `ftpSha256Mismatch`. Always-on gate proof test (skip semantics + env-free config derivation never throw).
- **docs/DEPLOY.md** — §21 mirroring §20: env table (FTP_HOST/PORT/USER/PASSWORD/SECURE/PASV_HOST/INSECURE with secret + R-3 system-CA-default + FTP_INSECURE keyed-warning annotations), the vsftpd recipe matching the e2e header, task-prefix key layout, R-4 deviation (SIZE + sidecar sha256 instead of post-upload read-back; restore IS the read-back), and the probe hard-refuse rule (deleteFailed = refusal, no accept-with-warning — matches server.js:9508). Committed in the SAME commit as the e2e file (D-03).

## Verification

- `node --test test/backup-ftp-restore-gates.test.mjs` — 10/10 green
- `node --test test/backup-ftp-e2e.test.mjs` — 1 pass / 2 skip, exit 0, no connection attempt without the env
- `node --test test/destination-registry-gate.test.mjs` — 10/10 (s3 byte-identity intact); `node --test test/backup-ftp-wiring.test.mjs` — 25/25 green after 98-03 landed
- `node --test test/restore-instance.test.mjs test/restore-routes.test.mjs` — green
- `npm test` — 2572 tests, 2541 pass / **only the 2 documented pre-existing failures** (fr-typography, webhook-routes GET list) / 27 skipped (incl. the 2 gated ftp e2e tests)

## Deviations from Plan

None — plan executed exactly as written.

### Notes (not deviations)
- The 98-03 sibling commit (138ba780) landed between my Task 1 and Task 2+3 commits (sequential shared main tree). Mid-run the wiring test transiently showed 2 failures in 98-03's then-uncommitted actions.js slices; after 138ba780 landed, `npm test` is at baseline with only the 2 documented pre-existing failures.
- The plan's files list named `test/backup-ftp-wiring.test.mjs` (extend wiring-test slices); per dispatch instructions the slices live in the NEW dedicated `test/backup-ftp-restore-gates.test.mjs` instead — backup-ftp-wiring.test.mjs untouched by this plan (it was concurrently extended by 98-02/98-03).

## Auth Gates

None.

## Known Stubs

None.

## Threat Flags

None — the restore read-back surface is the plan's T-98-06 mitigation itself (fetchToStaged sha256, keyed refusal); the e2e recipe uses throwaway docker credentials, env-gated (T-98-07 accepted); zero new dependencies (T-98-SC held).

## Self-Check: PASSED

- FOUND: export/restore.js (2 ftp twins + import), server.js (2 plumbing sites), test/backup-ftp-restore-gates.test.mjs, test/backup-ftp-e2e.test.mjs, docs/DEPLOY.md (§21)
- FOUND commits: 2c6f56a1, 405bcf30
