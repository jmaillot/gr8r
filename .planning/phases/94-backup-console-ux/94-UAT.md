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

## UAT Rounds 3–11 (2026-11-24, continued iterations)

| Round | Request | Fix | Commit |
|-------|---------|-----|--------|
| 3 | Next-run shows empty; retention label off-middle; GFS labels not centered | Next-run renders from RAW ms (root cause: i18n `parseDate` is YYYY-MM-DD-only — `toISOString()` datetimes silently formatted to ''); retention label `align-self:flex-end; padding-bottom:7px`; GFS labels centered | 3c1c4cda |
| 4 | Run history as a REAL table with headers + Type filter (all/backup/restore) | Table `Type/Task/Trigger/Status/Date/actions`; `historyTr`/`restoreRunTr` row renderers; Type filter gates BOTH row families; `historyDateCol` key ×5 | f05dfb81 |
| 5 | 7-point polish: baseline title, short run labels (12-hex instance prefix stripped, full label in tooltip), run-level Warning state (missing blobs on succeeded = amber, NOT checksum), Schedule column (GFS badge own column), checksum = toast at click (durable badges + "Last check" removed), Failed→Error wording | `statusWarning`/`scheduleCol`/`toast.checksumOk`/`toast.checksumFail` ×5; 3 dead keys removed | 1bf79ea6 |
| 6 | Dates still empty in history + restore cards; run names stacked too tall | Same parseDate bug — all 4 date cells render from raw ms; Run cell one-line (filename+sha to tooltip) | da0a83fd |
| 7 | Task name not flush-left under Task header; cells wrapping to 2 lines; "Run a backup now" title above panel like "Backup tasks" | Status/Schedule/actions `white-space:nowrap` (Run column truncates); runNow h2 above panel | 1b9c53b5 |
| 7b | Task/Trigger STILL centered | Root cause: `.perm-t td { text-align:center }` — new `hist-t` variant: all cells flush-left, nowrap, content-driven widths | 92795114 |
| 8 | Project restore as Super Admin: "not a member of any workspace" | Server trigger accepts Super Admin (isInstanceAdmin + SUPER_ACCESS) instead of membership; client picker lists ALL active workspaces via phase-92 scopes endpoint; overwrite-project → backlog (became BKRST-05) | d356667a |
| 9 | Restore action on the run rows; retire the standalone archive list | Per-run Restore button (location local/s3) opens the same preview drawer; restoreRow/refreshRestoreBackups/restoreList state retired; Restore rides the history table | d356667a |
| 10 | Remove the Restore section (title+lead); skipped-tables report wraps on 2–3 lines; cold no-target refusal misleading | Section + history card retired (progress panel + drawer remain); skip report `white-space:normal` max-width; cold refusal → `restoreTargetMissing` pick-a-target copy ×5 | fe85c7b5, 7d80a63f |
| 11 | Verify-checksum toast never fires; Instance Roles search blocks typing; restore picker doesn't explain itself | Server payload is `{ ok }` not `checksum_ok` (read fixed); roles draft carries tab role (data-role) so per-tab isolation no longer wipes the input; picker filters out role-holders; restore target picker gains label + required hint + armed echo ×5 | a6c4d1a4, 0fb081aa, e0e88332, 79e142dd |

**Post-UAT scope moves:** project-overwrite restore → Phase 95 BKRST-05 (owner ruling; engine extension, not an UAT fix).
