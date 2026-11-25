---
phase: 98
plan: 01
subsystem: backup-pipeline
tags: [backup, ftp, destinations, registry, tracer]
requires: [96-01 destination registry seam, 96-02 destLocation ordered scan, 97-01 export/ftp.js zero-dep client]
provides: [FTP upload leg (upload→SIZE verify→sidecar→ftp_uploaded), server.js FTP install closure (R-2 inverted) + FTP.config()/verify, test/backup-ftp-wiring.test.mjs static+functional gate]
affects: [98-02 probe route, 98-03 UI toggle + i18n, 98-04 e2e vs vsftpd]
tech-stack:
  added: []
  patterns: [descriptor dispatch on destName (s3 arm byte-preserved), one-site flag write, client-owned retry/keep-alive]
key-files:
  created: [test/backup-ftp-wiring.test.mjs]
  modified: [server.js, export/backup.js]
decisions:
  - "FTP_SECURE boolean maps to the 97 client secure enum as true→'explicit' / false→'none' (implicit TLS has no env seam yet)"
  - "ftp arm does SIZE verify inline via the client (per plan Task 2 wording); the descriptor verify field (FTP.verify) is wired for seam consumers but not double-invoked on the upload path"
  - "Functional pipeline tests inject a descriptor carrying the server.js closure CONTRACT (same R-2 + ftp_enabled semantics) against the in-process db — real spawned-server e2e stays 98-03's vsftpd deliverable; closure bytes are pinned by static slices"
metrics:
  duration: 17m
  completed: 2026-11-25T13:18Z
status: complete
commits: 3
plan_head_before: 1fc79067e92fa122fa19f6eb726e9a6bece493f5
plan_head_after: c505e2ab
actuals:
  tokens: 8000
  tasks: 3
  commits: 3
---

# Phase 98 Plan 01: FTP Destination End-to-End Tracer Slice Summary

FTP upload leg is real: the dormant registry slot now carries an R-2-inverted install closure + FTP.config()/verify, the upload loop dispatches per destination (s3 arm byte-preserved, ftp arm = STOR → SIZE verify → sidecar sha256 STOR → single-site `ftp_uploaded = 1`), and the wiring test proves upload→verify→flag and failure→upload_failed through the REAL runExport loop against an in-process mock FTP server.

## What Was Built

- **server.js** — `FTP` capability object (mirrors S3 custody: `enabled` env derivation byte-identical to the 96 pin; `config()` maps frozen consts to the 97 client shape `{host, port, user, password, secure, pasvHost, insecure}`; `verify` = SIZE-based R-4 check) + real `setBackupDestination('ftp', …)`: R-2 early `return null` for taskId-less meta, fail-closed `select ftp_enabled from backup_tasks` gate with S3-parity warn wording, `verify: FTP.verify` wired. handleBackupTaskOutcome and destLocation untouched.
- **export/backup.js** — loop body dispatches on `destName === 'ftp'`: ftp arm derives the D-88-6 task-prefix key, STORs the published archive (client-owned fresh-channel retry), SIZE-verifies against the published byte count, STORs `${key}.sha256`, then writes `ftp_uploaded = 1` at exactly ONE site inside the success block. Catch/composed-error/s3SliceError path UNTOUCHED — single ftp failure stays a raw sliced message. s3 arm and its `const key = s3BackupKey(...)` line byte-identical.
- **test/backup-ftp-wiring.test.mjs** (13 tests) — 9 static slice pins (R-2 ordering, fail-closed gate, FTP.config mapping, T-98-01 no-credential-serialization, one-site flags, s3 recognizability, no-downloadToStaged-on-ftp-arm, raw-slice posture) + 4 functional pipeline tests driving the real loop through an in-process scripted mock FTP server (97 fakeFtp idiom + SIZE): success (archive+sidecar under task prefix, ftp_uploaded=1, uploaded=0, local intact), ftp_enabled=0 (zero connections), taskId-less (null closure, no stor), stor-failure (upload_failed naming ftp via raw slice, local survives, flag stays 0).

## Verification

- `node --test test/backup-ftp-wiring.test.mjs` — 13/13 green
- `node --test test/destination-registry-gate.test.mjs` — 10/10 green (s3 byte-identity intact)
- `npm test` — 2545 tests, 2518 pass / **2 documented pre-existing failures** (fr-typography, webhook-routes GET list) + one observed scheduler-overlap load-flake that passes standalone (documented in deferred-items since v3.3)
- `grep -c "update backup_runs set ftp_uploaded = 1" export/backup.js` → 1

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Wiring-test harness db reuse crashed on UNIQUE(workspaces.slug)**
- **Found during:** Task 3
- **Issue:** the four pipeline tests share PIPE_DATA_DIR; `pipeFreshDb` reopened the same db file where seeded rows persisted.
- **Fix:** per-test unique db path (`projects-<label>-<pid>-<rand>.db`).
- **Files modified:** test/backup-ftp-wiring.test.mjs
- **Commit:** c505e2ab

### Notes (not deviations, tracked for downstream plans)
- Plan estimate `confidence: low` anticipated drift: loop line numbers in the plan (848-907) matched actual source closely; no structural surprises.
- TDD note: Task 3 is `tdd="true"`, but the loop implementation (Task 2) necessarily precedes the functional tests — the plan itself orders it that way ("fail against the pre-Task-2 loop" only "where feasible"). The static pins were committed alongside Tasks 1-2, so the gate discipline (pins first, implementation second) held for the slice code; the four functional tests were written RED-able but landed GREEN against the committed loop.
- T-98-01 mitigation: static pin asserts the closure never serializes config/credentials; the loop catch only carries the sliced error message.
- Out-of-scope (not touched, per scope boundary): 57 pre-existing eslint errors across export/restore.js, export/s3.js, server.js etc. (verified pre-existing at plan base; my diff is purely additive and lint-clean at the touched lines).

## Auth Gates

None.

## Known Stubs

None — the ftp upload leg is fully functional. (The probe route, UI toggle, restore read-back, and real-server e2e are deliberately later plans 98-02/03/04, not stubs.)

## Threat Flags

None — the ftp arm surface (STOR of archives to the configured FTP host, credentials via boot-frozen consts) matches the plan's threat model (T-98-01/T-98-02 mitigated as specified).

## Self-Check: PASSED

- FOUND: server.js (FTP const + ftp descriptor), export/backup.js (ftp arm), test/backup-ftp-wiring.test.mjs
- FOUND commits: c1c8a7ee, b1396fe9, c505e2ab
