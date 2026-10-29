---
phase: 12-real-file-uploads-and-previews
plan: 01
subsystem: server
tags: [uploads, streaming, error-codes, i18n, integration-tests]
requires: [requireWorkspace, sameOrigin, httpError/fail, test/helpers/server.mjs]
provides: ["POST /w/:slug/files raw-body upload", "MAX_UPLOAD_MB env knob", "uploadTooLarge stable error code", "DATA_DIR/files/<id> storage"]
affects: [12-02 (binary delete diff), 12-03 (XHR client + file route), 12-04 (previews)]
tech-stack:
  added: []   # zero-runtime-dependency guarantee held
  patterns: [WR-05 drain-then-respond stream cap, sameOrigin-before-body-read guard ordering, stable error codes + en/fr parity]
key-files:
  created: [test/upload.test.mjs]
  modified: [server.js, src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs]
decisions:
  - "Fetch-based test uploads use raw fetch with the captured projects_session cookie (harness client is JSON-only)"
  - "WriteStream gets a swallow-all 'error' handler — a write in flight when the stream is destroyed on overflow otherwise crashes the server (ERR_STREAM_DESTROYED)"
  - "Unauth/viewer gate test added under Task 2 commit to close the plan's auth-truth (401 / 403 readOnlyAccess, no files stored)"
metrics:
  duration: ~25 min
  completed: 2026-10-24
  commits: 2
plan_head_before: 8ee1f1d
plan_head_after: e78948f
actuals:
  tokens: 36000
  tasks: 2
  commits: 2
status: complete
---

# Phase 12 Plan 01: Streamed upload endpoint (tracer) Summary

**One-liner:** Raw-body `POST /w/:slug/files` streams real bytes flat to `DATA_DIR/files/<id>` behind sameOrigin + member auth, size-capped mid-stream by `MAX_UPLOAD_MB` (default 25) with a 413 `uploadTooLarge` stable code — proven by real-server integration tests.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | Tracer — streamed upload endpoint + happy-path integration proof | 8e6282d |
| 2 | Oversize 413 with stable code, streamed rejection + auth-gate proof | e78948f |

> Note: Task 2's oversize test was authored during Task 1's development cycle and shipped in commit 8e6282d; Task 2's own commit (e78948f) adds the unauthenticated/viewer gate test (closing the plan's third must-have truth) plus the catalogue-size bump.

## What Was Built

- `server.js`: `FILES_DIR` constant + `fs.mkdirSync` bootstrap in `openDb()`; `MAX_UPLOAD_MB`/`MAX_UPLOAD` constants beside `MAX_BODY`; env doc block entry; `uploadBinary(req, dest)` stream-cap helper (WR-05 drain-then-respond, partial file unlinked on overflow); `handleUpload` with the strict guard order sameOrigin → requireWorkspace('member') → stream; dispatcher branch `POST /w/([a-z0-9-]{2,40})/files` intercepted before serveStatic.
- `src/locales/en.json` + `fr.json`: `err.uploadTooLarge` ("File too large" / "Fichier trop volumineux").
- `test/upload.test.mjs` (new): oversize case (2 MB vs MAX_UPLOAD_MB=1 → 413 `uploadTooLarge`, `files/` empty, health ok) and auth-gate case (401 unauth, 403 viewer, nothing stored).

## Verification

- `node --test test/upload.test.mjs test/error-codes.test.mjs -x` → 25 pass, 0 fail
- `node --test test/upload.test.mjs -x` → 2 pass, 0 fail
- `npm test` full suite → 437 pass, 0 fail (error-code parity + catalogue gates included)
- `grep -c MAX_UPLOAD_MB server.js` = 3 (≥ 2 required)
- No new dependency in package.json

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Server crash (ERR_STREAM_DESTROYED) on oversize upload**
- **Found during:** Task 2
- **Issue:** A WriteStream write still in flight when `out.destroy()` fires on overflow emitted an unhandled `'error'` event → process crash → ECONNRESET to the client, violating the WR-05 "client actually receives the 413" contract.
- **Fix:** Added `out.on('error', () => {})` on the upload write stream (the httpError rejection is the real outcome).
- **Files modified:** server.js
- **Commit:** e78948f (fix itself authored pre-commit during Task 1 development, included in 8e6282d)

**2. [Rule 3 - Blocking] Catalogue-size static gate moved**
- **Found during:** Task 2 (`npm test`)
- **Issue:** test/i18n-core-features.test.mjs pins the exact catalogue key count (1529); `err.uploadTooLarge` made it 1530.
- **Fix:** Updated the pinned count and the test title's addendum list.
- **Files modified:** test/i18n-core-features.test.mjs
- **Commit:** e78948f

## Known Stubs

None — no placeholder data paths introduced.

## Tracer Gate

Tracer verified end-to-end: real server boot, real bytes round trip, oversize rejection, server survives. ⚡ Tracer verified — expanding (subsequent plans may proceed).

## Self-Check: PASSED

- test/upload.test.mjs exists; commits 8e6282d and e78948f present on HEAD (main, allow_default_branch_commits: true).
