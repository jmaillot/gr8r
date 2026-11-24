# Phase 94 — UAT Report

**Date:** 2026-11-24 · **Method:** conversational UAT with the owner (live instance)
**Result:** 2 PASS / 2 FAIL / 2 enhancements → fix plan 94-02
**Re-tested:** 2026-11-24 after 94-02 (commits d3a621c5, b470dd48, 37cdee80) — UAT-1, UAT-2, UAT-3, UAT-4 fixed

## Test Results

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1a | SC-1 real table (no blocks-in-blocks) | ✅ FIXED (94-02) | Panel-in-panel wrapper removed at the render site; uniform `text-align:left`, first-column 14px inset, `vertical-align:middle` rows. Pinned in backup-history-client.test.mjs. |
| 1b | SC-1 Next run populated | ✅ FIXED (94-02) | Cell renders date AND time via `formatTime` (clock preference honoured); '—' fallback unchanged. Pinned. |
| 2 | SC-2 editor pre-fill + header | ✅ PASS | Pre-fill works from server descriptor; header above form. |
| 3 | SC-3 4 retention scales | ✅ PASS | 4 inputs with GFS labels. |
| 4a | SC-4 unified run history + filters | ✅ PASS (structure) | Sblock renders with filters, fail-closed verified by e2e. |
| 4b | Enhancement request | ✅ FIXED (94-02) | Restore rows merged into the unified sblock under a leading Type column (labels reuse existing keys; new key `historyColType` ×5 same commit). Task/trigger/status filters stay Backup-only. |
| 5 | SC-5 names-not-ids + manual hint | ✅ PASS | Scope names rendered; hint present. |

**94-02 additional fix (UAT-4):** fresh-task default is now 22:00 (`BACKUP_TASK_FIELD_DEFAULTS` hour '22', pin: `cronFromForm` on fresh defaults === `0 22 * * *`) and the builder renders Hour before Minute.

## Diagnosed Gaps (all read from source)

- **UAT-1 (SC-1):** double panel wrapper at `src/pages/backup.js:713` — `${body}` (a self-paneling taskTable) inside `<div class="panel">`. Alignment: mixed `text-align` on th/td, inconsistent padding. — **FIXED 94-02 (d3a621c5).**
- **UAT-2 (SC-1):** `fmtDate()` renders date only (`utils.js:139` → formatDate with date pattern). Time exists app-wide via `formatTime` (`i18n.js:543`, honours the 12h/24h preference). — **FIXED 94-02 (d3a621c5).**
- **UAT-3 (enhancement):** merge restore history rows into the unified history table with a Type column (Backup/Restore). Client-only composition of two existing payloads; task/trigger/status filters apply to Backup rows only. — **FIXED 94-02 (b470dd48).**
- **UAT-4 (preference):** new-task defaults are `minute:0, hour:3` = 03:00 (displayed Minute/Hour order read as "00:03"). Owner wants **22:00** default; fix also reorders Hour before Minute in the builder. — **FIXED 94-02 (37cdee80).**

## Fix Plan

→ `94-02-PLAN.md` (gap_closure, client-only, zero route changes).
