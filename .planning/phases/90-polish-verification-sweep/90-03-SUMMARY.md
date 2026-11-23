---
phase: 90
plan: 90-03
subsystem: backup
tags: [backup, gfs-rotation, retention-visibility, dry-run, i18n, data-quality]
requires: [90-01, 90-02]
provides: [GET /api/backup/rotation-preview, gfsKeptPositions, backup_runs.missing_blob_count, backupPollTick stage-transition invalidation]
affects: [src/pages/backup.js, src/actions/actions.js, export/backup.js, db-adapter.mjs]
tech-stack:
  added: []
  patterns: [payload-flag chrome (D-89-21), D-89-22 throttle idiom (rotationproj key), additive-column trio, dry-run keep-N walk copy, stage-transition compare + in-render kick refetch]
key-files:
  created:
    - test/gfs-kept-until.test.mjs
    - test/backup-rotation-preview.test.mjs
  modified:
    - server.js
    - export/backup.js
    - db-adapter.mjs
    - src/pages/backup.js
    - src/actions/actions.js
    - src/core/api.js
    - src/locales/en.json
    - src/locales/fr.json
    - src/locales/de.json
    - src/locales/es.json
    - src/locales/nl.json
    - test/backup-export.test.mjs
    - test/backup-history-client.test.mjs
    - test/i18n-core-features.test.mjs
    - test/i18n-shell.test.mjs
    - test/i18n-toast.test.mjs
decisions:
  - D-90-16 refined delivered as bucket position (kept: {position}/{keep} {scale}), never a date — position/keep recomputed per request from the CURRENT policy, never stored
  - Rotation projection is a strict dry-run — the keep-N walk copied from runBackupRotationPass but stops after candidates (no unlink, no status write, no audit)
  - Preview button renders edit-mode only and lives in the task-form actions row, never inside the retention fieldset (it projects the WHOLE policy)
metrics:
  duration: 49m
  completed: 2026-11-23
status: complete
actuals:
  tokens: 31400
  tasks: 3
  commits: 3
commits: 3
plan_head_before: 8fc14da287b563526dbeee51abbb2a06e6b5a251
plan_head_after: 569271e7
---

# Phase 90 Plan 03: Retention Visibility + Rotation Preview + Polissages Summary

**One-liner:** Kept-until retention visibility as an always-true bucket-position badge (`kept: 3/7 daily`), an on-demand mutation-free rotation-deletion preview endpoint behind the D-89-22 throttle, and the D-90-23 missing-blob warning stamp + D-90-22 restore-list invalidation — 13 new i18n keys ×5 locales in the same commits as the emitting markup.

## What Was Built

### Task 1 — Kept-until bucket position (tracer, D-90-16 refined)

- **Server:** `gfsKeptPositions(task, runsAsc)` beside `assignGfsBuckets` — one bucket source, one reverse keep-N counting walk, so the badge and the rotation pass can never drift. History GET attaches `keptPosition { position, keep, scale }` to succeeded task runs only; manual `task_id IS NULL` runs (D-11) and non-succeeded runs carry none. Computed per request from the CURRENT policy — never stored, so a policy change re-renders truthfully.
- **Client:** runRow badge renders the payload verbatim (`kept: {position}/{keep} {scale}` with `{scale}` resolved through the four new gfs keys). Zero GFS math under `src/` (D-90-12/16) — pinned by source assertions (no retention arithmetic, no retention counts in the run renderer).
- **Deviation fixed (Rule 1, found during task):** the `succeededAsc` query initially selected only `id` — `assignGfsBuckets` needs `created_at`; Invalid Date → NaN bucket keys collapsed every run into daily. Caught by the arrival-simulation test, fixed same-task.

### Task 2 — Rotation projection endpoint + Preview deletions (auto, D-90-12..15)

- **Route:** `GET /api/backup/rotation-preview?taskId=` — funnel verbatim: sameOrigin → requireUser → `tooMany('rotationproj|'+user.id, 10, 15min)` (refused attempt consumes a try, D-90-15) → `CAP.BACKUP_MANAGE` 403 `backupManageRequired` → taskId regex + lookup 404 → dry-run. The keep-N walk is copied from `runBackupRotationPass` with the explicit `id <> newestVerified.id` SQL exclusion (T-87-07 shape) and STOPS after candidates: no unlink, no status write, no audit insert.
- **Payload:** fixed daily→weekly→monthly→yearly groups with honest zeros + total; never-run → `{ noRuns: true }` (keyed empty state, D-90-14).
- **Client:** "Preview deletions" (`btn-secondary btn-sm`, `data-a="backupPreviewDeletions"`) beside the save action in the task-form actions row — edit-mode only, NOT inside the retention fieldset. Result stages ephemerally in `S.ui.backupDeletions`, cleared on save/cancel/edit. Grouped render: every group shows its count (0 included), count>0 groups expose a real `aria-expanded`/`aria-controls` toggle over `.mono.trunc`+title filename rows. Refusals toast through the `restoreToast` closed map.
- **Mutation-freedom pinned:** withDb row snapshot byte-identical before/after + zero new audit rows.

### Task 3 — Polissages (auto, D-90-23 + D-90-22)

- **Schema trio:** `backup_runs.missing_blob_count integer not null default 0` — SCHEMA def + `adapterEnsureColumn` beside the checksum columns + db-adapter.mjs pg twin, byte-identical engine-neutral defs (comment lines never end in `;` — the 90-02 runSchema lesson). Verified live on Postgres: pg-matrix 10/10 under `POSTGRES_TEST_URL`.
- **Writer stamp:** `export/backup.js` counts the manifest's `missingBlob` entries and stamps the run row BEFORE the terminal write, beside the uploaded-flag site, never in a catch path (D-89-15 posture).
- **Badge:** runRow renders `.badge red` + `ic('triangle-alert', 12)` + `missingBlobWarn {n}` verbatim, count > 0 only; both history select lists carry the column.
- **D-90-22:** `backupPollTick` captures the previous stage before the payload write and nulls `S.ui.restoreList` on the active→terminal transition — the page's in-render kick refetches exactly once. The tick never calls the refresh action directly (Pitfall 8), pinned region-scoped.

## Verification

- `node --test test/gfs-kept-until.test.mjs test/backup-rotation-preview.test.mjs` — 10/10 green
- `node --test test/backup-export.test.mjs test/backup-history-client.test.mjs` — 30/30 green (writer stamp + chrome pins)
- `npm test` — 2341 pass / 2 fail, both documented pre-existing (below)
- `POSTGRES_TEST_URL=… node --test test/pg-matrix.test.mjs` — 10/10 green (schema trio boots clean on live pg)
- `npm run i18n:scan` — 0 violations; catalogue/locale/derived-parity gates green
- Tracer feedback gate (task 1): automated-only verify re-run end-to-end — green, expanded

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `succeededAsc` missing `created_at` broke bucket assignment**
- **Found during:** Task 1 (arrival-simulation test failure)
- **Issue:** the per-request map query selected only `id`, but `assignGfsBuckets` derives buckets from `created_at` — Invalid Date produced NaN year/month/week keys, collapsing every run into the daily bucket
- **Fix:** `select id, created_at from backup_runs …`
- **Files modified:** server.js
- **Commit:** 57bc5fe6

**2. [Rule 3 - Blocking] Pinned-count repairs surfaced by the suites**
- **Found during:** Tasks 2–3 (i18n-shell 615 pin, i18n-core verbs 76 pin)
- **Issue:** the two new data-a buttons and the new api call site moved pinned counts; the task-2 commit bumped only the i18n-toast copy of the data-a pin, the i18n-shell twin and the verbs ledger lagged
- **Fix:** 615→617 (i18n-shell, with ledger note), 76→77 (verbs ledger + backupRotationPreview entry)
- **Files modified:** test/i18n-shell.test.mjs, test/i18n-core-features.test.mjs
- **Commit:** 807ceebf (toast copy), 569271e7 (shell + verbs)

**3. [Rule 3 - Blocking] en.json missing `deletionsLoading`**
- **Found during:** Task 2 (catalogue seed-parity gate)
- **Issue:** the key was added to the four non-English catalogues but initially missed in en.json — en-carries-all parity refused
- **Fix:** added `"page.backup.deletionsLoading": "Projecting…"` to en.json
- **Commit:** 807ceebf

## Pre-existing Failures (NOT fixed, in deferred-items.md)

- `test/french-typography.test.mjs` — 6 fr.json D-05 breaches, all Phase-88 S3 keys (byte-identical at phase start)
- `test/webhook-routes.test.mjs` — health 'active' vs 'failing' (env-dependent family carried in STATE.md)

## Known Stubs

None — every surface is wired end-to-end (endpoint ↔ api client ↔ action ↔ render ↔ locales ↔ tests).

## Commits

| Task | Commit | Subject |
|------|--------|---------|
| 1 | 57bc5fe6 | feat(90-03): kept-until bucket-position badge (D-90-16 refined) |
| 2 | 807ceebf | feat(90-03): rotation projection endpoint + task-form Preview deletions (D-90-12..15) |
| 3 | 569271e7 | feat(90-03): missingBlob warning stamp (D-90-23) + restore-list stage-transition invalidation (D-90-22) |

## Self-Check: PASSED

- test/gfs-kept-until.test.mjs, test/backup-rotation-preview.test.mjs — FOUND
- Commits 57bc5fe6, 807ceebf, 569271e7 — FOUND (git log, 3 commits over the plan ledger base)
