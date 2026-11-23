---
phase: 88-s3-destination
plan: 01
subsystem: backup-s3
tags: [s3, sigv4, backup, minio, e2e]
requires: []
provides:
  - export/s3.js — SigV4 signer, request executor, keyed error classes, probeS3, downloadToStaged
  - keyed error contract (clockSkew/badCreds/forbidden/noBucket/generic) for plans 02/03
  - probe keyed-result contract (success/deleteFailed/badCreds/s3ClockSkew/unreachable/httpWarning)
  - Phase 89 restore consumption seam (downloadToStaged)
affects: [88-02, 88-03, phase-89-restore]
tech-stack:
  added: []
  patterns: [golden-vector pinning, env-gated e2e (pg-matrix idiom), in-process HTTP sink]
key-files:
  created:
    - export/s3.js
    - test/backup-s3-sigv4.test.mjs
    - test/backup-s3-upload.test.mjs
    - test/backup-s3-e2e.test.mjs
  modified: []
decisions:
  - MinIO e2e pinned to pgsty/minio:latest (RELEASE.2026-08-04T00-00-00Z) per user ratification at blocking-human checkpoint
  - golden vectors taken from AWS-docs examples pinned via aws-beam/aws_signature reference tests; multipart PUT-part pinned by hand-written canonical request
  - HEAD error codes read from x-amz-error-code header (HEAD bodies are empty)
metrics:
  duration: ~35 min
  completed: 2026-11-22
status: complete
commits: 3
plan_head_before: e9de8ff9
plan_head_after: 0f5b4e45
actuals:
  tokens: 64000
  tasks: 3
  commits: 3
---

# Phase 88 Plan 01: S3 Destination Core Summary

**One-liner:** Zero-dep SigV4 S3 client (`export/s3.js`) pinned by AWS-documented golden vectors, proven end-to-end with a signed PUT→GET roundtrip against the user-ratified `pgsty/minio:latest` image, plus keyed error mapping (s3ClockSkew, SC-3), D-88-15 probe, and the Phase 89 download seam.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Tracer — MinIO pull + smoke + golden-vector SigV4 + PUT/GET roundtrip | c3e7e10c | export/s3.js, test/backup-s3-sigv4.test.mjs, test/backup-s3-e2e.test.mjs |
| 2 | S3 URI-encoding + keyed error mapping (s3ClockSkew) | d8afeb2b | export/s3.js, test/backup-s3-sigv4.test.mjs |
| 3 | Probe operations (D-88-15) + download seam (SC-5) | 0f5b4e45 | export/s3.js, test/backup-s3-upload.test.mjs, test/backup-s3-e2e.test.mjs |

## Deviations from Plan

### User-ratified pin change (blocking-human checkpoint resolution)

**1. MinIO e2e image pinned to `pgsty/minio:latest`**
- **Found during:** Task 1 (research flag A1 smoke)
- **Issue:** The plan's pinned tag `quay.io/minio/minio:RELEASE.2025-10-15T17-29-55Z` is no longer publicly pullable (401 on all quay tags; the Docker Hub repo was deleted). The executor halted at a `checkpoint:human-verify` with `gate="blocking-human"` per the plan's STOP instruction.
- **Resolution:** User ratified **Option A: `pgsty/minio:latest`** on 2026-11-22. Pulled and smoke-verified: runs MinIO `RELEASE.2026-08-04T00-00-00Z`, health 200, SigV4 roundtrip passes.
- **Files modified:** test/backup-s3-e2e.test.mjs (header documents the ratified pin + exact docker run command)
- **Commit:** c3e7e10c (first commit)

### Auto-fixed Issues

**2. [Rule 1 - Bug] HEAD error responses lost their keyed error code**
- **Found during:** Task 3
- **Issue:** HEAD responses carry no body, so the `<Code>` XML parse produced `null` → probe badCreds/clockSkew cases fell through to `unreachable`.
- **Fix:** `s3ErrorFrom(status, body, fallbackCode)` now accepts `x-amz-error-code` from response headers (AWS S3 behavior for HEAD errors).
- **Files modified:** export/s3.js, test/backup-s3-upload.test.mjs
- **Commit:** 0f5b4e45

## Test Results

- `node --test test/backup-s3-sigv4.test.mjs` — **10/10 pass** (offline, ungated): 4 golden vectors (AWS GET-object, AWS PUT-object with real payload hash, AWS list-bucket query ordering, hand-written multipart PUT-part canonical pin) + 2 encoding vectors + 4 error-mapping vectors
- `node --test test/backup-s3-upload.test.mjs` — **7/7 pass**: probe keyed results incl. deleteFailed-warning + download seam happy/corrupt paths vs in-process HTTP sink
- `MINIO_TEST_URL=http://127.0.0.1:9000 node --test test/backup-s3-e2e.test.mjs` — **2/2 pass** (PUT→GET byte-identity + probe/download roundtrip); without env: 0 pass / 2 skipped (correct pg-matrix gate state)

## E2E Environment

The ratified MinIO e2e container is **left running** for plans 02/03 e2e reuse:
```
docker run -d --name gr8r-minio-e2e -p 9000:9000 \
  -e MINIO_ROOT_USER=gr8rtest -e MINIO_ROOT_PASSWORD=gr8rtest-password \
  pgsty/minio:latest server /data
MINIO_TEST_URL=http://127.0.0.1:9000 node --test test/backup-s3-e2e.test.mjs
```
(The Task-1 smoke container `gr8r-minio-smoke` serves the same purpose; plans 02/03 can use either, or start a fresh one per the command above.)

## Notes for Plans 02/03

- The keyed error classes (`err.s3Class`: clockSkew/badCreds/forbidden/noBucket/generic) and probe keyed results (`key`: success/deleteFailed/badCreds/s3ClockSkew/unreachable + httpWarning) are the contracts to map into refusals, toasts, and run-row errors.
- `downloadToStaged(config, key, expectedSha256, stagingDir)` returns `{ tmpPath, sha256 }` — sidecar comparison is at callers (plan 03).
- Quick-gate consolidation (plan verification note): if 02/03 consolidate s3 tests under `test/backup-s3.test.mjs`, update the phase quick command.

## Deferred Issues (out of scope)

- Pre-existing untracked directory `"[object Promise]/"` at repo root (not created by this plan; likely a prior-session artifact). Left untouched.

## Self-Check: PASSED

- export/s3.js — FOUND
- test/backup-s3-sigv4.test.mjs — FOUND
- test/backup-s3-upload.test.mjs — FOUND
- test/backup-s3-e2e.test.mjs — FOUND
- Commits c3e7e10c, d8afeb2b, 0f5b4e45 — FOUND (`git log`)
- No stubs: every exported function is fully implemented and tested; no TODO/FIXME/placeholder patterns in created files.
