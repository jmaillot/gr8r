---
phase: 89
plan: 03
subsystem: backup-restore
tags: [backup, restore, preview, s3, tdd, bkrst-01]
requires:
  - 89-01 (archive reader + keyed refusal classes)
  - 89-02 (restore staging + entry gate)
  - 88-01/88-03 (S3 upload executor + downloadToStaged seam)
provides:
  - GET /api/backup/restore/backups (honest dual-location list)
  - GET /api/backup/restore/preview?runId= (stream-verified, manifest-derived preview)
  - export/restore.js streamVerifyArchive()
  - backup_runs.uploaded column + upload-success mark
  - D-89-32 boot sweep for restore-staging orphans
affects: [89-04 (restore execute), 89-05 (UI surface), 90 (download tiering)]
tech-stack:
  added: []
  patterns: [streaming-verify-manifest, skip-and-record-entry-gate, run-row-truth-badges, guard-chain-verbatim]
key-files:
  created:
    - test/restore-s3-e2e.test.mjs
  modified:
    - server.js
    - export/restore.js
    - export/backup.js
    - db-adapter.mjs
    - test/restore-preview.test.mjs
decisions:
  - D-89-14/15: list + preview badges derive from run-row truth ONLY (uploaded column + fs.existsSync), never live S3 probing
  - D-89-15: backup_runs.uploaded marked ONLY in the upload success block after stream-back + sidecar verification; never in a catch path
  - D-89-17/18: streamVerifyArchive validates manifest structure then compares whole-archive sha256 — mismatch = not restore-eligible
  - Entry gate during preview walks mirrors extraction posture: absolute/traversal fatal, shape-misses skip-and-record (projects.db et al.)
  - D-89-22/OQ5: preview throttle (10/15min, operator-keyed) sits BEFORE the capability gate and consumes a try on refusal
metrics:
  duration: 26m
  completed: 2026-11-22T19:54:39Z
  tasks: 3
  files: 6
status: complete
actuals:
  tokens: 15891
  tasks: 3
  commits: 3
commits: 3
plan_head_before: 66c5427910ac4974d96a1aeff8c63fc664bc0a94
plan_head_after: 9c3e30c16a44830ae3bd0c987f2acc468e787323
---

# Phase 89 Plan 03: Restore Read Surface — List + Preview Summary

**One-liner:** Honest dual-location restore list and a stream-verified manifest-derived preview route (BKRST-01) — run-row-truth badges, one-pass sha256+manifest verification, keyed refusal mapping for every 89-01 producer class, zero archive bytes to the client.

## What Was Built

1. **GET /api/backup/restore/backups** (Task 1, commit `3245d73c`): the last 50 terminal-status runs, each with an honest `location` badge — `local` / `s3` / `missing` — derived from run-row truth only (`uploaded` column + local file existence), never a live S3 probe. No ListObjectsV2 anywhere on the path.
2. **backup_runs.uploaded mark** (Task 2, commit `6584dba8`): the column is written in exactly one place — the upload success block of export/backup.js, AFTER the D-88-8 stream-back verify AND the sidecar comparison pass. upload_failed and S3-disabled runs keep 0. Boot ensureColumn adds it to pre-existing dbs (default 0, fail-closed) with a no-op second boot.
3. **GET /api/backup/restore/preview?runId=** (Task 3, commit `9c3e30c1`): guard chain verbatim (sameOrigin → requireUser → operator-keyed throttle 10/15min → RESTORE_USE → runId regex → row read). Local archive: `streamVerifyArchive` in place; S3-located (`uploaded=1`): the 88-01 `downloadToStaged` seam into restore-staging, temp removed in `finally`; gone from both: keyed `restoreArchiveMissing`. Refusals mapped from the 89-01 keyed classes: `restoreEntryRejected` (+reason, audited), `restoreShaMismatch` (audited), structural corruption + corrupt manifest → `restoreManifestCorrupt` (audited, reader class in detail). Payload is manifest-derived counts ONLY — no archive bytes, no download endpoint (prohibition P2; Phase 90 owns that).
4. **D-89-32 boot sweep**: `sweepStaleRestoreStaging` wired in main() beside the backup-staging sweep.
5. **MinIO-gated e2e** (`test/restore-s3-e2e.test.mjs`): upload → local deleted → list badge `s3` → preview via downloadToStaged → sha verified on the streaming pass → restore-staging empty after the response. Ran GREEN against the live gr8r-minio-e2e container (port 9001); skips cleanly without `MINIO_TEST_URL`.

## Verification

- `node --test test/restore-preview.test.mjs` — 21/21 pass (three consecutive runs for the tracer gate; final suite green twice)
- `node --test test/restore-preview.test.mjs test/restore-s3-e2e.test.mjs` — 22 tests, 0 fail (1 env-gated skip in the offline run)
- `MINIO_TEST_URL=http://127.0.0.1:9001 node --test test/restore-s3-e2e.test.mjs` — 1/1 pass against real MinIO
- Regressions: backup-s3-upload + backup-s3-sigv4 + backup-export + restore-security — 83 tests, 0 fail (cumulative across the two regression batches)
- Acceptance greps: ListObjectsV2 only in the route's own comment; no archive-bytes-to-client paths added; `node --check` clean on server.js and export/restore.js

## TDD Notes

- Task 3 executed RED→GREEN: 9 failing pins written first (engine + route + boot sweep), confirmed failing, then implemented. Two fixture iterations were test-side corrections (host tar needed `--format=ustar`; `/current` poll payload lacks runId — the POST's D-18 UUID is the row id), not gate skips.
- Task 1 was the tracer task; its gate was satisfied by three consecutive green end-to-end runs before expansion.

## Deviations from Plan

**1. [Rule 3/2 — blocking/critical] Task 2's schema work pulled forward into Task 1's commit**
- **Found during:** Task 1
- **Issue:** the list route's query reads `backup_runs.uploaded`, so the column (SQLite CREATE + ensureColumn placed AFTER the 88-2 CHECK-rebuild, plus the pg twin in db-adapter.mjs) was required before the route could exist.
- **Fix:** column shipped in commit `3245d73c`; Task 2 reduced to the upload-success mark + behavior tests (commit `6584dba8`).
- **Files modified:** server.js, db-adapter.mjs, export/backup.js
- **Commit:** 3245d73c (schema), 6584dba8 (mark)

**2. [Rule 1 — bug] Null filename rows must not touch fs/path**
- **Found during:** Task 1
- **Issue:** rows with NULL filename (e.g. failed-before-publish runs) would throw on `path.join`.
- **Fix:** `location = uploaded===1 ? 's3' : 'missing'` when filename is null.
- **Commit:** 3245d73c

**3. [Test-harness] WAL-race restructure in the list tests**
- **Found during:** Task 1 verification
- **Issue:** raw DatabaseSync access after a run's `wal_checkpoint(truncate)` + `vacuum into` races the server connection (a signup after the run returned 201 but the row was invisible to a fresh handle).
- **Fix:** all direct withDb access moved BEFORE triggering the export; after the run the tests ride HTTP only (the backup-routes.test.mjs pre-run safe-zone pattern).
- **Note:** this is a harness-level quirk, NOT a product bug — logged to deferred-items.md for a future harness plan.

**4. [Rule 2 — correctness] Entry gate extended to preview's walk**
- **Found during:** Task 3 GREEN
- **Issue:** the 89-01 entry gate fires at extraction; preview must not serve metadata from an archive that carries attacker entry names unchecked.
- **Fix:** `streamVerifyArchive` gates every entry during the walk, mirroring extraction's posture: absolute/traversal refuse fatally (keyed `restoreEntryRejected`), shape-misses skip-and-record (instance archives legitimately carry DATA_DIR-relative entries like `projects.db`), and the skips ride the payload as `skippedEntries`.
- **Commit:** 9c3e30c1

## Known Stubs

None. Every route is wired to real data sources (backup_runs + fs + S3 seam); the only intentional absence — streaming archive bytes to the client — is plan-scope (Phase 90 download tiering), not a stub.

## Threat Flags

None. No new trust-boundary surface beyond the plan's threat model: the preview route reads run-row-controlled paths through the already-hardened 89-01 reader, streams through the 88-01 seam, and never returns archive bytes.

## Deferred Issues

- WAL-visibility harness race (raw DatabaseSync after an export's checkpoint) — noted in `deferred-items.md`, harness-level, out of scope here.
- Pre-existing suite failures out of scope (documented, untouched): test/webhook-events.test.mjs; test/error-codes.test.mjs + test/french-typography.test.mjs locale keys (deferred to plan 89-06).
- Untracked `[object Promise]/` debris dir in the repo root predates this plan — untouched.

## Self-Check: PASSED

All 6 created/modified files exist on disk; all 3 task commits verified in git history (`3245d73c`, `6584dba8`, `9c3e30c1`); commit count 3 measured from the plan ledger (`66c54279..9c3e30c1`).
