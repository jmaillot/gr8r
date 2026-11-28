---
phase: 103-restore-source-refactor-extract-the-shared-ladder
plan: 01
subsystem: backup/restore
tags: [golden-test, restore, staged-fetch-ladder, byte-identity, rsrc-01]
requires: [RSRC-01, R-5]
provides: [test/restore-source-resolution.test.mjs — plan 02's byte-identity reference]
affects: [103-02 (must keep this golden passing UNCHANGED)]
tech-stack:
  added: []
  patterns: [server-harness route matrix (startServer + planted rows), in-process engine harness (db-adapter + real runExport), fake seam injection (404-NoSuchKey HTTP / 550-RETR FTP), post-stop WAL audit reads]
key-files:
  created:
    - test/restore-source-resolution.test.mjs
  modified: []
decisions:
  - "Golden asserts call-boundary BEHAVIOR + verbatim string presence, never per-site call counts (checker W1) — mirrorMissing→clearMirrorFlag pinned as mechanism behavior (fake 404/550 seams) + file-wide strings, so plan 02 may relocate it into the helper without breaking the golden."
  - "Refusal ENVELOPES (audit tokens, lives-in-X, fetched-from-X templates, unit keyed messages, terminals) pinned per-caller-slice — forcing plan 02 to keep envelopes at callers, per the research drift verdict."
  - "SMB mirror-loss pinned at the classifier/clear mechanism boundary (mirrorMissing({smbClass:'pathNotFound'}) + clearMirrorFlag flag isolation) rather than through a live SMB seam — the live-seam shape is exercised by the 99/100 suites; the s3/ftp shapes are proven live here."
  - "Route audits are read AFTER server.stop() against a self-owned dataDir — a post-export wal_checkpoint(truncate) + writer-close race makes refusal audits invisible to external handles while the child runs (harness WAL quirk, now documented in the test)."
metrics:
  duration: 23m
  completed: 2026-11-28T00:46:06Z
status: complete
plan_head_before: d643e6ef5b59
plan_head_after: f5f6fddd
commits: 1
actuals:
  tokens: 31000
  tasks: 2
  commits: 1
---

# Phase 103 Plan 01: Restore-Source Resolution Golden Summary

**Golden-pinned the six-site staged-fetch ladder (selection order, per-site refusal envelopes, mirror-truth invariant, verify-checksum RESULT semantics) against the UNMODIFIED tree — 16 tests green, plan 02's byte-identity reference.**

## What Was Built

`test/restore-source-resolution.test.mjs` — 16 tests, all passing on the untouched tree:

- **Selection-order behavioral matrix through the real routes (sites 1–2, server harness):** planted flag-matrix rows prove local-first beats all three flags (a flag-clad clone of a REAL archive previews/downloads 200), disabled-destination refusals expose s3 > ftp > smb ("lives in X but no X destination is configured"), and no-flags → "gone from all destinations" — through BOTH the preview route (restore_refused token) and the download route (backup_download_refused token).
- **Selection order through the units (sites 4–5, in-process engine harness):** restoreOverwriteUnit resolves the real local archive even with all three flags set and all three bogus configs; disabled destinations silently skip to "restore: archive not found at the resolved path"; s3 config ahead of ftp config → the S3 seam failure answers first; runRestore's terminal is "not found at either destination" (the documented route-vs-unit divergences, kept byte-identical).
- **Mirror-truth invariant proven with REAL seam-failure inputs:** fake 404-NoSuchKey S3 and 550-RETR FTP seams drive mirrorMissing → clearMirrorFlag live — exactly one flag cleared per failure input, others untouched, exactly one mirror_flag_cleared:<dest> audit row; smb pinned at the classifier/clear mechanism boundary.
- **verify-checksum sha-mismatch RESULT semantics:** source pins route s3Class === 'sha256Mismatch' / ftpSha256Mismatch / smbSha256Mismatch to ok = false (never a refusal), cross-referenced to backup-checksum's behavioral "RESULT, never a 4xx/5xx" pin.
- **Verbatim per-caller envelope captures:** each route's and unit's refusal strings pinned at its caller slice — plan 02 must keep them there or the golden breaks by design.

## Verification

- `node --test --test-concurrency=2 test/restore-source-resolution.test.mjs` → 16/16 pass, 0 fail.
- Full suite `node --test --test-concurrency=2 test/*.test.mjs` → 2728 tests, 2694 pass, 3 fail, 31 skipped. Baseline was documented as "2712 tests / 2 pre-existing failures" — see Deviations.

## Deviations from Plan

**1. [Discovery — pre-existing, NOT golden-caused] Third suite failure at baseline: webhook-events due.reminder**
- **Found during:** Task 2 (full-suite regression).
- **Issue:** The suite shows 3 failures, not the 2 documented in 102-VERIFICATION.md:77. The third — `webhook-events.test.mjs:262` "a due task with a subscribed hook yields exactly ONE due.reminder delivery" (0 deliveries vs 1) — is date-boundary drift: the test plants a task `due: today` (machine clock) and the reminder engine's day-boundary handling changed behavior between the 2026-11-27 verification run and today (2026-11-28).
- **Evidence it is NOT the golden's fault:** it fails identically and deterministically at HEAD~1 (d643e6ef, before this file existed) in an isolated worktree, and fails alone in a single-file run that never loads the golden. The golden's file was never imported by it.
- **Disposition:** Documented, not fixed (out of scope — Rule: pre-existing failures in unrelated files are logged, not repaired mid-plan). Plan 02's regression gate should treat it as a THIRD documented pre-existing failure until separately triaged (likely `due`-date freshness in the test fixture vs the reminder grace window). Recommend the 104 phase or a quick-fix pass re-triages it.
- **No plan changes needed:** Task 2's stop-rule ("if any OTHER test fails, stop — the golden was written against a misunderstanding") does not trigger: the failure is provably independent of the golden and orthogonal to the ladder.

**2. [Rule 3 — harness fix inside the new test only] Post-export WAL visibility for route audit reads**
- **Found during:** Task 1.
- **Issue:** Refusal audit rows written by the child server AFTER the real backup run's `wal_checkpoint(truncate)` (export/backup.js:389) are invisible to external `withDb` handles while the child runs — the harness WAL quirk restore-preview.test.mjs warns about ("all direct-db access BEFORE the export fires").
- **Fix:** The route tests run against a self-owned dataDir and read audit tokens AFTER `server.stop()` (child exit durably checkpoints the WAL). Documented in a comment in the test file. No production code touched.

## Test File Case Count

16 cases: 2 route selection-order goldens, 4 unit selection-order goldens, 3 mirror-truth goldens, 7 byte-identity/cross-reference source pins.

## Known Stubs

None — every assertion is backed by behavior against real routes/units/engines or verbatim source reads; nothing mocked away that the plan required live (SMB's live-seam mirror-loss rides the existing 99/100 suites, documented in the test header).

## Threat Flags

None — test-only plan; no new network endpoints, auth paths, or trust-boundary surfaces. T-103-SC (package installs) not triggered: zero new dependencies. T-103-01 accepted per plan (golden asserts only existing refusal envelopes).

## Commits

- f5f6fddd — test(103-01): golden-pin the restore staged-fetch ladder before extraction

## Self-Check: PASSED

- [x] test/restore-source-resolution.test.mjs exists (687 lines, 16 tests green)
- [x] Commit f5f6fddd present in git log
- [x] Full suite at baseline-plus-discovery (3 pre-existing failures, all proven pre-existing; 0 golden-caused failures)
