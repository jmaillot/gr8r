---
phase: 86
plan: 02
subsystem: backup-run-surface
tags: [backup, api, export, i18n, client-surface]
status: complete
requires: [86-01 pipeline (export/backup.js runExport/getRunState/sweepStaleBackupStaging), 85-02 BACKUP_MANAGE capability + grant route, Phase 85 backup stubs]
provides:
  - POST /api/backup/runs (frozen trigger surface — D-18 UUID 200)
  - GET /api/backup/runs/current (frozen D-19 status payload)
  - src/core/api.js backupRun/backupRunCurrent
  - Backup page Run now card + live stage progress (render-only)
  - err.backupRunInProgress + err.scopeNotFound + 13 page.backup.run* keys (5 locales)
  - D-13 hygiene: boot sweep + SIGTERM run-failure wiring
affects: [Phase 87 backup tasks, Phase 88 restore, Phase 90 download tier]
tech-stack:
  added: []
  patterns: [guard-chain verbatim from Phase 85 stub family, keyed+audited refusals (D-20), render-only client doctrine (payload is the only source), seq+AbortController poll loop]
key-files:
  created: [test/backup-routes.test.mjs]
  modified: [server.js, src/core/api.js, src/pages/backup.js, src/actions/actions.js, src/locales/en.json, src/locales/fr.json, src/locales/nl.json, src/locales/de.json, src/locales/es.json, test/client-surfaces.test.mjs, test/i18n-shell.test.mjs, test/i18n-toast.test.mjs, test/i18n-core-features.test.mjs, test/error-codes.test.mjs]
decisions:
  - "Refusal check via getRunState() immediately before fire-and-forget runExport whose synchronous claim (before first await) closes the check→claim window on the single-process model — pinned by the Promise.all claim-race test"
  - "Project scope existence read from the workspace doc's data.projects (the same source the 86-01 collector scans), fail-closed on parse errors"
  - "Route does not pre-claim; runExport's own synchronous claim is the atomicity point"
  - "backupPickProject allowlisted as client-only err code (client-side pre-validation toast, not a server code)"
metrics:
  duration: ~50m
  completed: 2026-11-21
requirements-completed: [BKBCK-01]
actuals:
  tokens: 12500   # chars/4 over the realized diff (779+/21− across 16 files)
  tasks: 3
  commits: 3
plan_head_before: 05c66289139ff93acdc0744067db50e42cedf4e3
plan_head_after: 2cc496d6
---

# Phase 86 Plan 02: /api/backup/runs surface + Backup page Run now Summary

**One-liner:** Frozen trigger/poll API over the 86-01 export pipeline — POST /api/backup/runs returns the D-18 UUID behind the full guard chain (throttle → gate → scope → concurrency, every refusal keyed AND audited), GET current serves the D-19 payload, and the Backup page grew a scope-picking Run now card with live stage progress rendered verbatim from the poll.

## Coverage (plan → execution)

| Plan task | Type | Status | Commit |
|---|---|---|---|
| 1. tracer — POST + GET routes, api/actions wiring, 5-locale refusals, route test | tracer | done | d5886022 |
| 1-tracer-gate. re-run verify end-to-end | gate | passed (node --test test/backup-routes.test.mjs: 8/8 → expanded) | — |
| 2. refusal breadth: claim-race pin, audit-row assertions, throttle 429, stub regression pin | auto | done (refusal matrix landed in commit 1 per plan step 1; Task 2 added the simultaneous claim-race pin) | 7bda81dc |
| 3. Backup page Run now card + poll + client-surfaces pins + frozen baseline advances | auto | done | 2cc496d6 |

## Verification

- `node --test test/backup-routes.test.mjs` — 9/9 (happy path + sidecar sha256 parity, workspace scope, 401 gates, non-holder 403s, scope matrix, claim race, concurrency, throttle, boot sweep, tasks-stub prohibition)
- `node --test test/client-surfaces.test.mjs` — 13/13 (incl. 5 new run-surface pins)
- Frozen-baseline suites green: error-codes reverse parity, french-typography D-05, i18n-shell/toast/core-features/actions-modules (data-a 592, call sites 64), build-locales icon baseline (hard-drive already in baseline — no new icon)
- `npm test` — 2099/2100 pass; the single failure is the **pre-existing** locale-registry-fixture xx.json race, reproduced identically on the plan's base commit (05c66289) in a throwaway worktree — documented in `deferred-items.md`, out of scope

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] i18n frozen baselines advanced**
- **Found during:** Task 3 (full-suite run)
- **Issue:** The new Run now card's `data-a="backupRunNow"` and the two api.js call sites moved the frozen counters (data-a 591, verbs 62); fr catalogue straight apostrophes tripped the D-05 typography gate; `err.backupPickProject` needed the client-only allowlist entry
- **Fix:** 591→592 and 62→64 with annotated comments; curly apostrophes in the two new fr values; allowlist entry with provenance comment
- **Files modified:** test/i18n-shell.test.mjs, test/i18n-toast.test.mjs, test/i18n-core-features.test.mjs, test/error-codes.test.mjs, src/locales/fr.json
- **Commit:** 2cc496d6

**2. [Rule 1 - Bug] Throttle/window collision in the scope-matrix test**
- **Found during:** Task 1 verification
- **Issue:** The 6-case scope matrix exceeded the D-21 5-try window for one operator — the D-21 semantics (a refused attempt consumes a try) made the test self-throttled
- **Fix:** Split the matrix across two operators; the throttle test separately proves the other operator's budget is untouched
- **Files modified:** test/backup-routes.test.mjs
- **Commit:** d5886022

None otherwise — plan executed as written.

## Known Stubs

None. The Phase 85 POST /api/backup/tasks stub remains a stub **by design** (Phase 87 owns tasks) and is regression-pinned by test/backup-routes.test.mjs ("still refuses backupNotConfigured"). No download action on the page (Phase 90 deferral, D-23).

## Threat Model check

All `<threat_model>` mitigations landed: keyed refusals without which-part-was-wrong oracles (T-86-06/07 — gate before any body probing, verified by test), scope-id regex + DB existence fail-closed, operator-keyed throttle consuming tries on refusal (D-21), audit rows on every refusal and on start (D-20, asserted per test), non-holder GET 403 backupRoleRequired (D-22, no status oracle). No new surface outside the plan's threat model.

## Self-Check: PASSED

- test/backup-routes.test.mjs exists; commits d5886022 / 7bda81dc / 2cc496d6 found in `git log`; rev-list count from ledger = 3.
