---
phase: 88
plan: 03
subsystem: backup-s3
tags: [backup, s3, upload, multipart, email-gate, client-render, e2e, docs]
requires:
  - 88-01 upload executor (export/s3.js: uploadArchive, probeS3, downloadToStaged)
  - 88-02 config surface (S3 consts, s3Enabled gate, writer seam)
provides:
  - uploading stage in runExport lifecycle (after verify/publish)
  - upload_failed terminal state with full row payload (filename/sha256/sizeBytes/sliced error)
  - D-88-3 email transition riding handleBackupTaskOutcome
  - client render of upload_failed + uploading parts progress (render-only)
  - MinIO e2e covering probe → multipart → verify → sidecar → download seam
  - DEPLOY.md §20 operator docs
affects: [phase-89-restore, backup-verify-work]
tech-stack:
  added: []
  patterns: [writer-seam event kind, provider seam setBackupS3Destination, env-gated e2e (MINIO_TEST_URL), SMTP-catcher delivery assertions, API-polled run status against spawned server]
key-files:
  created:
    - (none new — all targets existed from plans 01/02)
  modified:
    - export/backup.js
    - server.js
    - src/pages/backup.js
    - test/backup-export.test.mjs
    - test/backup-tasks-api.test.mjs
    - test/backup-history-client.test.mjs
    - test/backup-s3-e2e.test.mjs
    - test/helpers/server.mjs
    - docs/DEPLOY.md
decisions:
  - "Upload stage slots AFTER verify/publish exactly as ratified in 88-02 — archive always exists locally first (local-first doctrine)."
  - "upload_failed rides the writer seam as its own event kind; the email gate reuses handleBackupTaskOutcome('failed') verbatim (email-outbox.test.mjs 3-site pin holds)."
  - "Ride test asserts run status via the API (child-authoritative view) and email gating via SMTP DELIVERY, not outbox rows — withDb readers against a live spawned WAL server diverge (see Deviations)."
  - "E2e multipart crossing uses uploadArchive opts overrides (4 MiB threshold / 6 MiB parts) instead of a ≥512 MiB fixture; S3's 5 MiB part floor forbids smaller parts against real MinIO."
  - "DEPLOY.md section numbered §20 (§19 taken by Phase 87 archive-location docs)."
metrics:
  duration: "~1 session (incl. WAL-visibility debugging)"
  completed: 2026-11-22
status: complete
actuals:
  tasks: 3
  commits: 3
commits: 3
plan_head_before: 21215f5b
plan_head_after: 14c9e335
estimate:
  tokens: 110000
---

# Phase 88 Plan 03: Uploading stage + upload_failed + client render + e2e + operator docs Summary

S3 upload wired into the run lifecycle: uploading stage after verify/publish, upload_failed as a distinct kept-archive terminal state with D-88-3 failure/recovery email transitions, client render-only parts progress, real-MinIO e2e, and DEPLOY.md §20 operator docs.

## What was built

### Task 1 — upload executor (committed 60b0a530, prior session)
`export/s3.js` `uploadArchive`: payloads ≤ 512 MiB go as one signed PUT; larger stream as serial 64 MiB multipart with per-part retry-from-offset against the immutable staged file, abort-on-failure, `<key>.sha256` sidecar, progress callbacks for the D-19 payload. 23/23 unit tests.

### Task 2 — uploading stage + upload_failed terminal state (committed 06c3d74d)
- `export/backup.js`: s3 stage block slots into runExport after verify/publish (ratified 88-02 seam); provider via `setBackupS3Destination(fn)`; upload failures land as `upload_failed` — local archive KEPT, row carries filename/sha256/sizeBytes and a 300-char sliced error (T-88-10); stream-back verify via `downloadToStaged` + sidecar hash compare (T-88-11) before `succeeded`.
- `server.js`: writer-seam `upload_failed` branch writes the full row then calls `handleBackupTaskOutcome(taskId, runId, 'failed', err)` — failure email on entry, recovery email on later success (D-88-3), outbox 3-site pin intact.
- Tests: 3 sink-based export tests (success path, upload_failed path, no-provider regression → 13/13 in backup-export.test.mjs) + the spawned-server ride test in backup-tasks-api.test.mjs (fire1 503 → upload_failed + failure email; fire2 healed → succeeded + recovery email; sidecar hash matches run row; D-88-6 prefix).

### Task 3 — client render + e2e + docs (committed 14c9e335)
- `src/pages/backup.js`: `upload_failed: 'page.backup.statusUploadFailed'` in RUN_STATUS_KEYS; uploading-stage branch renders `page.backup.stageUploading` + `page.backup.partsProgress {done,total}` verbatim from the payload; null `partsTotal` renders nothing (no "0/null"); zero client-side stage/counts derivation (T-88-09). No locale changes (keys landed in 88-02).
- `test/backup-s3-e2e.test.mjs`: two new env-gated tests against real `pgsty/minio:latest` — threshold-crossing multipart (14 MiB fixture, 6 MiB parts → 3 parts) with stream-back sha256 verify + sidecar + download-seam roundtrip, and the single-PUT small path; 4/4 green with `MINIO_TEST_URL` set, honest skip when absent.
- `docs/DEPLOY.md` §20: S3_* env table (D-88-13 defaults, D-88-14 plain-http caveat + probe warning), bucket setup, `backup-task-<id>/` + `backup-manual/` key layout, operator lifecycle-rule guidance incl. mandatory AbortIncompleteMultipartUpload(7d) and the backup-manual/ exemption (D-88-9), upload_failed semantics.

## Verification

| Command | Result |
|---------|--------|
| `node --test test/backup-export.test.mjs test/backup-scheduler.test.mjs test/email-outbox.test.mjs` | 36/36 pass |
| `node --test test/backup-tasks-api.test.mjs` | 19/19 pass |
| `node --test test/backup-history-client.test.mjs test/backup-s3-upload.test.mjs test/backup-s3-sigv4.test.mjs` | 32/32 pass |
| `MINIO_TEST_URL=… node --test test/backup-s3-e2e.test.mjs` (MinIO on :9001, 9000 occupied by the 88-01 smoke container) | 4/4 pass |
| `npm test` (full suite) | 2207 tests: 2184 pass / 5 fail / 18 skipped — the 5 fails are **pre-existing on the pre-Task-3 baseline** (verified via git stash run): D-05 French typography, webhook-events secret-field scan, i18n scan gate ×2, dead-key scan (STATE.md deferred item) |

## Deviations from Plan

### Substitution: RSS-memory test → structural pins (pre-ratified in Task 1)

The plan's RSS-memory-bounded streaming test was replaced with structural pins (spawned-stream assertion + threshold/part-size constant exports + multipart path) — ratified during Task 1 execution since a spawned RSS read is flaky under CI jitter. Recorded in the Task 1 session; carried here for the summary's completeness.

### [Rule 3 - Blocking] withDb/live-server WAL divergence in the ride test

- **Found during:** Task 2 (test authoring)
- **Issue:** The test-side `withDb(srv.dbPath, …)` open/close cycles DELETED the spawned server's live `projects.db-wal` (SQLite's last-connection heuristic fires cross-process because the server's idle connections hold no file lock). The server's subsequent commits landed in an orphaned WAL invisible to fresh readers until the NEXT run's snapshot fence (`wal_checkpoint(truncate)` inside runExport) flushed them back — making fresh-reader assertions on the last fire nondeterministically stale. Diagnosed via strace (`unlink("/tmp/projects-test-…/projects.db-wal")` from the test pid between every scheduler fire).
- **Fix (test-only; zero production code changed):** (1) run-status polling goes through `GET /api/backup/runs` — the child's authoritative view, never divergent; (2) email gating asserted via an in-test SMTP catcher's DELIVERED messages (the delivery pass runs in the child's universe); (3) `connection: close` on all test-side fetches + `socket.on('error')` swallow on the catcher/sink sockets to kill teardown keep-alive RST noise (`test/helpers/server.mjs` client + health poll).
- **Production code is correct:** the server's own `db.get` post-read and its API view always agreed.
- **Files modified:** test/backup-tasks-api.test.mjs, test/helpers/server.mjs
- **Commit:** 06c3d74d
- **Follow-up worth noting:** any NEW suite that reads a spawned server's SQLite file with fresh connections while the server runs can hit the same divergence. The API-poll idiom in waitApiRun is the pattern to copy.

### [Rule 1 - Bug] e2e EntityTooSmall (S3 5 MiB part floor)

- **Found during:** Task 3 e2e
- **Issue:** multipart override parts of 2 MiB trip MinIO's `EntityTooSmall` (all parts but the last must be ≥ 5 MiB).
- **Fix:** 6 MiB parts over a 14 MiB fixture → 3 parts. The 64 MiB production constants remain unit-covered.
- **Files modified:** test/backup-s3-e2e.test.mjs
- **Commit:** 14c9e335

### Note: DEPLOY.md section numbering

The plan said "§19" but Phase 87 already occupies §19; the S3 operator docs landed as **§20** (append-only, same VAPID §16 env-pair pattern).

## Auth Gates

None.

## Known Stubs

None — every `<verify>` in the plan was run; the e2e skip path is the ratified env-gate idiom (MINIO_TEST_URL absent → skip, never silently counted as coverage; with env set: 4/4 pass).

## Threat Flags

None — no new security surface beyond the plan's threat model (T-88-10 sliced errors and T-88-11 stream-back verify are implemented and tested; T-88-12 abort is wired and doc'd).

## Self-Check: PASSED

All key files exist on disk; all three task commits (60b0a530, 06c3d74d, 14c9e335) verified in git history.
