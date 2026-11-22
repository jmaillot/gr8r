---
phase: 88-s3-destination
plan: 02
subsystem: backup-s3
tags: [s3, migration, config-surface, probe, i18n]
requires:
  - export/s3.js probeS3 + keyed result contract (88-01)
  - 87-01 backup task CRUD funnel + keyed refusal/audit shape
provides:
  - backup_tasks.s3_enabled column + widened backup_runs status CHECK (both engines, lockstep)
  - boot-frozen S3_* env consts + S3 capability object (server.js)
  - /api/config s3Enabled boolean (T-88-05 custody)
  - s3Enabled task CRUD gate with audited keyed refusals (s3NotConfigured / invalidS3Enabled)
  - POST /api/backup/s3/probe — keyed probe route riding the full funnel (SC-1)
  - 11 S3 locale keys ×5 (err.s3*, probe toasts, statusUploadFailed, stageUploading, partsProgress)
affects: [88-03, phase-89-restore, docs/DEPLOY.md §19]
tech-stack:
  added: []
  patterns: [invites-rebuild CHECK widening idiom, strict-token boot-refuse, keyed refusal + audit funnel, in-process HTTP sink for probe mapping, mirror-sync schema lockstep]
key-files:
  created: []
  modified:
    - server.js
    - db-adapter.mjs
    - src/locales/en.json
    - src/locales/fr.json
    - src/locales/nl.json
    - src/locales/de.json
    - src/locales/es.json
    - test/backup-tasks-api.test.mjs
decisions:
  - "RATIFIED (Task 1 checkpoint, 2026-11-22): upload-stage slot = AFTER verify/publish (option a) — BINDING on plan 03 (see below)"
  - 'uploading deliberately NOT added to the backup_runs status CHECK — it is a stage inside running riding the D-19 payload (D-88-2/5); only upload_failed joined the terminal set'
  - no extra run-row upload column added — the existing backup_runs.error column carries the upload error text plan 03 needs (PATTERNS error-slicing discipline)
  - S3_ENDPOINT absent resolves the AWS native host https://s3.<region>.amazonaws.com at config time (documented default, not scheme guessing — D-88-13)
  - probe audit actions follow the backup_* funnel convention (backup_probe_refused:<key>, backup_s3_probe_ok/backup_s3_probe_failed)
metrics:
  duration: ~40 min
  completed: 2026-11-22
status: complete
commits: 2
plan_head_before: 2a875310
plan_head_after: 42e70821
actuals:
  tokens: 137000
  tasks: 3
  commits: 2
---

# Phase 88 Plan 02: S3 Configuration Surface Summary

**One-liner:** Boot-frozen `S3_*` env custody with an additive `s3_enabled` column and a CHECK-widened `backup_runs` status enum (invites-rebuild idiom, dual-engine lockstep), plus the `s3Enabled` task gate with audited keyed refusals and a probe-at-save route returning keyed results (success / deleteFailed / badCreds / s3ClockSkew / unreachable + httpWarning) — all keys in 5 locales, same commit.

## Ratified Decision (Task 1 — checkpoint resolution, BINDING on plan 03)

The user ratified **option (a): the S3 upload stage slots into `runExport` AFTER verify/publish** (planner-recommended), over option (b) after-finalize.

Rationale ratified:
- The local archive + sidecar are immutable after the atomic rename either way, so the local-first doctrine (D-88-1) is never at risk.
- The upload stays inside `runExport`'s existing error/cancellation scaffolding — no new lifecycle plumbing.
- A single D-88-2 run-row lifecycle (no post-finalize row surgery / second row-touch).
- `upload_failed` flows through the writer seam exactly like other terminal states (`handleBackupTaskOutcome` needs no change, per the 88-PATTERNS seam analysis).

**Plan 03 implements this slot position verbatim.**

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Decision checkpoint — upload-stage slot ratified (a) after verify/publish | (recorded here — no code) | 88-02-SUMMARY.md |
| 2 | Additive migration — s3_enabled column + backup_runs status CHECK widening | 2963cf53 | server.js, db-adapter.mjs, test/backup-tasks-api.test.mjs |
| 3 | Boot-frozen S3_* consts, /api/config, s3Enabled gate, probe route, 5-locale keys | 42e70821 | server.js, src/locales/*.json ×5, test/backup-tasks-api.test.mjs |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test audit-scan filter missed probe audit actions**
- **Found during:** Task 3 (probe tests)
- **Issue:** The shared `taskAuditRows` helper filtered `action like 'backup_task%'`, so the probe route's `backup_probe_refused:*` / `backup_s3_probe_*` audit rows never matched — the tests failed on a query artifact, not on missing audits.
- **Fix:** Widened the scan to `'backup_%'` (both the task refusals and the probe events are in the same audit funnel).
- **Files modified:** test/backup-tasks-api.test.mjs
- **Commit:** 42e70821

**2. [Rule 1 - Bug] Sink-backed HEAD probe cases needed the HEAD keyed-header contract**
- **Found during:** Task 3 (probe mapping test)
- **Issue:** The HTTP sink returned the error code only in the XML body, but HEAD responses carry no body — the probe fell through to `unreachable`. The 88-01 keyed-HEAD contract (x-amz-error-code header) is the wire behavior to emulate.
- **Fix:** Sink HEAD errors carry `x-amz-error-code: RequestTimeTooSkewed` / `InvalidAccessKeyId` headers; the sink-backed s3ClockSkew case then maps correctly (SC-3/D-88-17 pinned end-to-end through the real route).
- **Files modified:** test/backup-tasks-api.test.mjs
- **Commit:** 42e70821

## Test Results

- `node --test test/backup-tasks-api.test.mjs` — **18/18 pass**: 87-01 regression + fresh-boot migration pins (s3_enabled default 0, upload_failed accepted, typos/uploading rejected by CHECK) + legacy-DB reboot rebuild carrying rows verbatim (T-88-08) + adapter-mirror lockstep + env-unset custody matrix (boolean exposure, keyed refusals, no-oracle probe refusal, audits) + env-set surface (T-88-05 no-identifier pin, gate acceptance/persistence, PUT flip) + probe keyed mapping (success+httpWarning, s3ClockSkew, badCreds, non-operator 403 with zero bucket ops) + 5-locale parity over the 11 new keys
- `node --test test/error-codes.test.mjs test/catalogue.test.mjs` — **51/51 pass** (new err.* codes registered in both catalogues; catalogue rules clean)
- `node --test test/backup-scheduler.test.mjs test/backup-rotation.test.mjs test/backup-s3-sigv4.test.mjs test/backup-s3-upload.test.mjs` — **38/38 pass** (migration non-regression + golden-file s3 tests unaffected)
- `node --test test/db-adapter.test.mjs` — 31 pass / 0 fail (schema mirror-sync green)

## Notes for Plan 03

- **Upload slot: AFTER verify/publish in `runExport` (ratified above — implement verbatim).** The writer seam / `handleBackupTaskOutcome` needs NO change: `upload_failed` arrives as `outcome='failed'` (D-88-3 email gate rides it).
- The run row's `error` column carries the upload failure text (V14 slice discipline); no extra column was added.
- `S3.config()` in server.js is the ONE seam returning the request config export/s3.js consumes (endpoint/bucket/accessKeyId/secretAccessKey/region/pathStyle); use it for upload + any probe reuse.
- The probe route (`POST /api/backup/s3/probe`) is operator-gated and audited — the task-save UI can call it with the same session.
- Locale keys already shipped for plan 03's UI surface: `page.backup.stageUploading`, `page.backup.partsProgress` ("Parts {done}/{total}"), `page.backup.statusUploadFailed` — plan 03's commit should carry no locale drift.

## Deferred Issues (out of scope)

- Pre-existing untracked directory `"[object Promise]/"` at repo root (prior-session artifact, noted in 88-01 too). Left untouched.
- pg-matrix live-PG S3 schema run was not executed (no live Postgres in this environment); engine lockstep is pinned by the always-on mirror-sync test plus the SCHEMA-derived pgSchemaVariant (tables created fresh from the widened definition each boot).

## Self-Check: PASSED

- server.js / db-adapter.mjs / 5 locale files / test/backup-tasks-api.test.mjs — FOUND (git show 42e70821 --stat)
- Commits 2963cf53, 42e70821 — FOUND (`git log`)
- Ratified slot decision recorded above — FOUND
- No stubs: every route/gate/migration is fully implemented and tested; no TODO/FIXME/placeholder patterns introduced.
