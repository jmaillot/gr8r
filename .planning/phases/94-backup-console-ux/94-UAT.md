# Phase 94 — UAT Report

**Date:** 2026-11-24 · **Method:** conversational UAT with the owner (live instance)
**Result:** 2 PASS / 2 FAIL / 2 enhancements → fix plan 94-02

## Test Results

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1a | SC-1 real table (no blocks-in-blocks) | ❌ FAIL | Table renders, but `backup.js:713` wraps `taskTable` (which is already a `.panel` with its own table) inside ANOTHER `.panel` → panel-in-panel. Plus cell alignment inconsistent ("tout n'est pas aligné"). |
| 1b | SC-1 Next run populated | ❌ FAIL | Cell renders `fmtDate()` = date-only, never shows the execution time; user expected the next-run time. (`next_run_at` null → '—' fallback is correct.) |
| 2 | SC-2 editor pre-fill + header | ✅ PASS | Pre-fill works from server descriptor; header above form. |
| 3 | SC-3 4 retention scales | ✅ PASS | 4 inputs with GFS labels. |
| 4a | SC-4 unified run history + filters | ✅ PASS (structure) | Sblock renders with filters, fail-closed verified by e2e. |
| 4b | Enhancement request | — | Owner asks Run history + Restore history in ONE table (colonne Type). Currently two separate surfaces (`historySblock` + restore history card). |
| 5 | SC-5 names-not-ids + manual hint | ✅ PASS | Scope names rendered; hint present. |

## Diagnosed Gaps (all read from source)

- **UAT-1 (SC-1):** double panel wrapper at `src/pages/backup.js:713` — `${body}` (a self-paneling taskTable) inside `<div class="panel">`. Alignment: mixed `text-align` on th/td, inconsistent padding.
- **UAT-2 (SC-1):** `fmtDate()` renders date only (`utils.js:139` → formatDate with date pattern). Time exists app-wide via `formatTime` (`i18n.js:543`, honours the 12h/24h preference).
- **UAT-3 (enhancement):** merge restore history rows into the unified history table with a Type column (Backup/Restore). Client-only composition of two existing payloads; task/trigger/status filters apply to Backup rows only.
- **UAT-4 (preference):** new-task defaults are `minute:0, hour:3` = 03:00 (displayed Minute/Hour order read as "00:03"). Owner wants **22:00** default; fix also reorders Hour before Minute in the builder.

## Fix Plan

→ `94-02-PLAN.md` (gap_closure, client-only, zero route changes).
