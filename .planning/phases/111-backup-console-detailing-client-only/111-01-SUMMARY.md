---
phase: 111-backup-console-detailing-client-only
plan: 01
subsystem: backup-console
tags: [backup, ui, i18n, perm-t, client-only]
requires: [R-15, Q3-checklist, D-12-pin-doctrine]
provides: [superset-history-headers, min-width-880-both-tables, page.backup.colRun, page.backup.colInitiator]
affects: [phase-112-settings]
tech-stack:
  added: []
  patterns: [perm-t superset header set, honest-'—'-fill columns]
key-files:
  created: []
  modified:
    - src/pages/backup.js
    - src/locales/en.json
    - src/locales/de.json
    - src/locales/es.json
    - src/locales/fr.json
    - src/locales/nl.json
    - test/backup-history-client.test.mjs
decisions:
  - "R-15 superset header set: Type/Run/Trigger/Initiator/Schedule/Status/When/gutter — honest '—' fills (Trigger+Schedule on restore rows, Initiator on backup rows; the backup payload carries no operator field, never fabricated)"
  - "deletionsPanel left as-is (D-90-14 div projection, Q8 scope-grey ruling — not converted to perm-t)"
  - "restorePreviewBody chip block byte-frozen (105-01/108-01 pins) — untouched"
metrics:
  duration: ~35 min
  completed: 2026-11-28
status: complete
commits: 2
plan_head_before: 74288dd3
plan_head_after: f6664a3f
actuals:
  tokens: 21000
  tasks: 2
  commits: 2
estimate:
  tokens: 45000
  tasks: 2
---

# Phase 111 Plan 01: Backup Console Detailing (Client Only) Summary

**One-liner:** Merged run-history realigned onto the R-15 8-column superset header set (Initiator under its own header, honest '—' fills) and both wide backup tables lifted to the 880px perm-t standard — client-only, zero server/API diff.

## Tasks Completed

| # | Task | Type | Commit |
|---|------|------|--------|
| 1 | Run-history superset headers end-to-end (BK-02, R-15) | tracer | 748b1918 |
| 2 | Min-width 880 + residual 11-point checklist sweep (BK-01, BK-03) | auto | f6664a3f |

## What Was Built

**Task 1 (tracer):** the merged run-history table renders ONE 8-column header set — Type / Run / Trigger / Initiator / Schedule / Status / When / gutter (first th `padding-left:14px`, trailing empty gutter th, mappings.js recipe). Restore rows show `created_by_name` (esc()d verbatim, honest '—' fallback) under the new Initiator header; backup rows show an honest faint '—' Initiator cell (the payload has no operator field); restore rows show '—' Trigger and Schedule. The malformed two-td line in restoreRunTr was reformatted one-td-per-line. New keys `page.backup.colRun` ("Run") + `page.backup.colInitiator` ("Initiator") landed in all 5 locales in the same commit; the backup key catalogue in backup-history-client.test.mjs extended same-commit. History table min-width 820→880 in the same edit.

**Task 2:** taskTable min-width 860→880 — no 860/820 min-width remains in backup.js (grep-verified: exactly 2 × `min-width:880px`). The 11-point checklist sweep over all four data surfaces (task console, runs history, restore listing surfaces, rotation-deletion preview) found everything else compliant — zero additional edits. deletionsPanel stays the D-90-14 honest-zeros div projection (Q8 scope-grey decision recorded); the restore chip block is byte-frozen and untouched; the task filter keeps its colTask label.

## Verification

- backup-history-client: 26/26 pass; i18n-shell + i18n-core-features: 44/44 pass (pins included)
- `npm run i18n:scan` → 0 literals / 0 pending / 0 stale / 0 dead
- New keys ×5 parity asserted programmatically (en/de/es/fr/nl)
- **Pins unchanged, no annotation needed:** data-a 635 / data-v 94 / data-r 64 / verbs 86 — grep re-counted per commit (backup.js data-a stays 32; no data-a/v/r added or removed)
- Full suite: 2836 tests, failing count 2–3 across runs (run A: 2, run B: 3) — french-typography content, webhook-routes GET list (both documented) plus, on run B, `backup-scheduler` skipped_overlap (the documented full-suite-only contention family). Never gated on zero.
- `git diff --quiet HEAD -- src/server.js src/api.js` → exit 0 (zero server/API diff)
- `npx eslint src/pages/backup.js` — the file's 4 errors are pre-existing at the plan's base commit (verified against 40d70f95's copy; same 4, line-shifted)

## Deviations from Plan

None — plan executed as written. Note: a parallel agent (113-01) committed `docs(113-01)` (74288dd3) mid-session on the shared tree; working tree was re-verified to contain only 111-01 files before each 111-01 commit.

## Known Stubs

None.

## Deferred Items (out-of-scope discoveries)

- Pre-existing lint errors not caused by this plan (SCOPE BOUNDARY — not fixed): 13 in `export/*.js` (unused vars / no-useless-assignment / no-useless-escape) + 4 in `src/pages/backup.js` itself (unused `fsize`, `tzPreselect`, `flags`; useless `skipped` assignment in restoreRunTr's catch path) — all present at base commit 40d70f95. Candidates for a future housekeeping phase.
- The plan's Task-1 inline `node -e` locale check assumed nested `page.backup` objects; the catalogues are flat dot-named keys — the equivalent flat-key check was run instead (×5 all present). Test content itself unaffected.

## Self-Check: PASSED

- Commits 748b1918, f6664a3f exist on HEAD ✓
- Both tables carry min-width:880px, no 860/820 remains ✓
- 5 locale files carry colRun + colInitiator ✓
- i18n:scan clean; pin suites green ✓
