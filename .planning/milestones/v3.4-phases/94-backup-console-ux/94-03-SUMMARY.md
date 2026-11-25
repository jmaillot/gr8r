---
phase: "94"
plan: "94-03"
subsystem: backup-console-ux
tags: [uat-fixes, i18n, backup-history, layout]
requires: []
provides:
  - timeFmt preference wired into formatTime (setTimeFmt module default)
  - Rotated (deleted) rows excluded from default history render
affects: [settings page clock previews unchanged, backup history sblock]
tech-stack:
  added: []
  patterns: [module-level preference default mirroring dateFmt house pattern]
key-files:
  created: []
  modified:
    - src/core/i18n.js
    - src/core/theme.js
    - src/pages/backup.js
    - test/i18n-prefs.test.mjs
    - test/backup-history-client.test.mjs
decisions:
  - setTimeFmt lives in i18n.js (plan-specified), mirroring dateFmt sentinel semantics at READ time
  - Rotated exclusion is client-side via visibleRuns; the 'deleted' filter entry pre-existed and is reused (no new key, no locale change)
metrics:
  duration: ~35 min
  completed: 2026-11-24
status: complete
commits: 3
plan_head_before: 25e43e3b
plan_head_after: ecb7d0e9
---

# Phase 94 Plan 3: UAT Round-2 Fixes Summary

**One-liner:** Wired the dormant 12h/24h clock preference into every formatTime call, hid Rotated rows from the default history render behind an explicit filter entry, and pinned the builder alignment.

## Tasks

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | UAT-2b: wire timeFmt → formatTime | ✅ | c2640562 |
| 2 | UAT-3b: Rotated hidden by default + filter entry | ✅ | 2be35513 |
| 3 | UAT-4b: builder alignment pin | ✅ | ecb7d0e9 |

## Test Results

- `node --test test/i18n-prefs.test.mjs` → 21/21 pass (3 new pins: stored '24' honoured without explicit cycle, 'auto'/unset unchanged incl. French locale, applyPrefs seeds setTimeFmt + no timeFmt in DEFAULT_PREFS)
- `node --test test/backup-history-client.test.mjs` → 25/25 pass (new UAT-3b + UAT-4b tests; D-04 verbatim-render pin updated to visibleRuns)
- `npm run build` → ✅ (includes i18n-scan gate; no locale changes were needed)
- `npm test` → 2449 tests, 2422 pass, **2 fail — both documented pre-existing families**: fr-typography (D-05 straight-apostrophe/space values) and webhook-routes (D-06 health computation)

## Deviations from Plan

**1. [Plan-drafting note] Task 2: the Rotated filter entry already existed**
- "Rotated" (status `deleted`) was already in `HISTORY_FILTER_STATUSES` and labelled through `RUN_STATUS_KEYS → page.backup.statusDeleted` since 94-02. The actual gap was only the default-render exclusion, implemented via `visibleRuns` in `historySblock`. No new key, no locale change (matches the constraint "likely NO new key").

**2. [Plan-drafting note] Task 3: the alignment fix pre-existed**
- The retention label already carried `align-self:center` (94-1, commit 3ea78f70) and the GFS labels already ride the shared `.field` label-over-input structure. Deliverable reduced to the static pin guarding against regression; owner visual confirm still pending (as the plan itself specifies).

**3. [Rule 1 - Bug] Pre-existing pin updated**
- The D-04 verbatim-render pin matched `${h.runs.map(historyRow)`; updated to `visibleRuns` — a direct consequence of Task 2's change, not a silent weakening (the new UAT-3b test asserts the exclusion logic explicitly and that no unfiltered render remains).

## Files Touched

- `src/core/i18n.js` — `setTimeFmt(cycle)` module default ('auto' sentinel), `formatTime` uses `options.cycle || timeFmtDefault`
- `src/core/theme.js` — `applyPrefs` calls `setTimeFmt(p.timeFmt)` beside `setDateFormat(p.dateFmt)`
- `src/pages/backup.js` — `visibleRuns` default-excludes status `deleted` unless the Rotated filter is active
- `test/i18n-prefs.test.mjs`, `test/backup-history-client.test.mjs` — new pins + updated verbatim-render pin

## Owner Actions After Deploy

1. Settings → Date & time → « 24 » → every clock in the app (incl. Next run) renders 24h.
2. Visual confirm of the builder retention row alignment.

## Known Stubs

None.

## Self-Check: PASSED

- Commits c2640562, 2be35513, ecb7d0e9 present (`git log` verified)
- All 5 files exist; gates run and recorded above
