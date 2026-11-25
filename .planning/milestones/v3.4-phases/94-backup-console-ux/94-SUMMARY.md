---
phase: 94
plan: 1
subsystem: backup-console-ui
tags: [backup, ui, i18n, e2e, cron]
requires: [phase-92-frozen-routes, phase-87-history, phase-85-roles]
provides: [task-table, last-run-badge, schedule-prefill, retention-4-scale, unified-history-sblock, restore-operator-e2e]
affects: [src/pages/backup.js, src/actions/actions.js, src/core/api.js, src/locales/*, export/cron.js, server.js]
tech-stack:
  added: []
  patterns: [staged-ui-state, fail-closed-render, server-descriptor-reverse-map, probe-pagination]
key-files:
  created: [e2e/backup-console-restore-op.spec.mjs]
  modified: [src/pages/backup.js, src/actions/actions.js, src/core/api.js, src/locales/en.json, src/locales/fr.json, src/locales/nl.json, src/locales/de.json, src/locales/es.json, export/cron.js, server.js, test/backup-cron.test.mjs, test/backup-history-client.test.mjs, test/dst-cron-boundaries.test.mjs, test/i18n-shell.test.mjs, test/i18n-toast.test.mjs]
decisions:
  - "cronToPreset is a flat projection of describeCron.kind (null = custom) — one parse, no second server cron vocabulary"
  - "parseCron gained monRestricted; describeCron daily/weekly exclude mon-restricted expressions (Rule 1 bug fix: '0 3 * 2 *' was misclassified daily)"
  - "Last-run badge: client-side latest-per-task_id reduction over ONE page-load fetch api.backupRuns({all:1,limit:50}) riding the frozen Phase-92 ?all=1 route (created_at-desc server sort; first occurrence = newest)"
  - "Edit pre-fill reverse-maps task.schedule.preset server-side; cronDirty stays false so a name-only edit never rewrites the cron"
  - "Null preset locks the builder readonly (raw cron + customScheduleHint) — the ONLY place the raw expression renders"
  - "Retention grows to 4 staged scales (7/4/12/5 = server DDL defaults), existing gfsMonthly/gfsYearly labels reused, no new retention keys"
  - "Unified history sblock: status filter enumerates ONLY the served enum (running/succeeded/failed/upload_failed/deleted); interrupted/skipped_overlap stay first-class labels; limit+1 probe pagination (no total in payload)"
  - "backupPollTick skips the BACKUP_MANAGE-only /runs/current half for canBackup=false (restore_operator) — Rule 2"
metrics:
  duration: ~3.5h
  completed: 2026-11-24
status: complete
plan_head_before: 101a4574
plan_head_after: 81494b06
commits: 6
actuals:
  tokens: 207000
  tasks: 6
  commits: 6
---

# Phase 94 Plan 1: Backup Console UX Summary

Real task table with a 4-state last-run badge, schedule pre-fill from a server-side preset projection, 4-scale GFS retention editing, and a unified fail-closed run-history sblock — all over the frozen Phase-92 routes, zero new endpoints, zero new dependencies.

## Tasks Delivered

| Task | Commit | What |
|------|--------|------|
| 0 (tracer) | f121d17c | RED cronToPreset unit cases + restore-operator e2e scaffold |
| 1 | b2a2a7b3 | cronToPreset in export/cron.js + additive describeCron dom/mon + backupTaskShape.schedule.preset |
| 2 | cefe80a4 | taskCard → perm-t table; humanized schedule text; 4-state last-run badge (all=1 limit-50 client reduction); refreshed after Run now |
| 3 | 3ea78f70 | Edit pre-fill via schedule.preset (cronDirty=false preserved); readonly custom fallback + hint; 4-scale retention |
| 4 | ec1c38e0 | Unified run-history sblock: 3 staged filters, probe pagination, verbatim run.label, historyCard retired |
| 5 | 81494b06 | Pin battery extended (SC-1..3), data-a pins 617→619, restore-operator e2e filled, canBackup poll gate |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] parseCron misclassified mon-restricted expressions as daily/weekly**
- **Found during:** Task 1
- **Issue:** `0 3 * 2 *` described as `daily` (kind daily), which would render a false "Every day" label and prefill wrongly.
- **Fix:** `monRestricted: mon.size !== 12` added to parseCron; describeCron daily/weekly branches require `!p.monRestricted`. cronToPreset('0 3 * 2 *') === null.
- **Files:** export/cron.js
- **Commit:** b2a2a7b3

**2. [Rule 2 - Missing authorization-aware fetch gating] backupPollTick fetched /api/backup/runs/current for restore-only operators**
- **Found during:** Task 5 e2e (the whole page flipped into the 403 fullstate for the restore_operator)
- **Issue:** /runs/current is a BACKUP_MANAGE read (server.js 9295); the tick fetched it unconditionally, stamped `backupErr = {status:403}` on the refusal, and pageBackup rendered full403() — a restore_operator could never see the console.
- **Fix:** the backup half of the tick is skipped when `S.ui.backupTasks?.canBackup === false`; the restore half + the one-timer doctrine (D-89-1) unchanged.
- **Files:** src/actions/actions.js
- **Commit:** 81494b06

**3. [Rule 3 - Blocking] api.js extended beyond Task 2's file list**
- api.backupRuns grew the additive ?all=1 params (all/task/trigger/status/limit/offset); the legacy ?taskId= form is byte-unchanged. Required to complete the badge + sblock fetches. Commits cefe80a4 / ec1c38e0.

**4. [Rule 3 - Blocking] e2e fixture corrections**
- A workspace-less fresh account boots the onboarding wizard whose "Exit setup" escape lands the server-less demo mode (masks everything) → the ROP now joins the owner's workspace via invite/accept before browser login. Manual scope-triggered runs carry task_id NULL (D-11), so task-id filters narrow to empty — asserted as fail-closed behavior. Task create/manual-run endpoints return 200/409-in-progress shapes handled explicitly. Commit 81494b06.

### Process deviation
- HEAD was on `main` (protected) at spawn → created and worked on branch `phase-94-backup-console-ux` (base 101a4574). Merge/PR is the orchestrator's step.

## Verification (commands + results)

- `node --test test/backup-cron.test.mjs test/backup-history-client.test.mjs test/backup-scopes.test.mjs test/dst-cron-boundaries.test.mjs test/i18n-shell.test.mjs test/i18n-toast.test.mjs` → 93 pass / 0 fail
- `npm run build` (incl. i18n-scan prebuild gate) → green, every new key added AND used in the same commit
- `npm test` → 2412 pass / 3 fail, ALL pre-existing (see below)
- `npm run e2e -- backup-console-restore-op.spec.mjs` → 1 passed

### Pre-existing failures (OUT OF SCOPE, documented not fixed)
- webhook-routes/webhook-events family (e.g. "GET list: no secret field… D-06" health 'active' vs 'failing')
- Phase-88 french-typography fr catalogue rules
- Timing flakes with run-to-run variance: 89-05 overwrite outbox gate, scheduler skipped_overlap, governance-rename "trail rows" (passes standalone)

## Files Touched
- src/pages/backup.js — task table, badge, schedule text, custom fallback, 4 retention inputs, unified history sblock
- src/actions/actions.js — refreshBackupLastRuns, backupTaskEdit prefill, retention 4-scale, unified history fetch/filters/pagination, poll gate
- src/core/api.js — backupRuns additive params
- export/cron.js — cronToPreset, describeCron dom/mon, monRestricted fix
- server.js — backupTaskShape.schedule.preset only (additive; no route changes)
- locales ×5 — added colTask/colScope/colSchedule/colLastRun/checksumWarn/summaryYearly/retentionLabel/customScheduleHint/filterAll/filterTrigger/filterStatus/historyManualEntry/historyManualHint/historyPrev/historyNext; removed dead retentionDaily/retentionWeekly/durLabel/sizeLabel/keptPosition; colNextRun folded into existing nextRunLabel
- tests — backup-cron, backup-history-client, dst-cron-boundaries, i18n-shell, i18n-toast pins updated same-commit (D-12)

## Known Stubs

None.

## Threat Flags

None — no new endpoints, no new trust boundaries; all surfaces ride the frozen Phase-92 routes with server-side fail-closed visibility.
