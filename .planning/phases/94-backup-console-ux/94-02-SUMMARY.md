---
phase: "94"
plan: "94-02"
subsystem: backup-console
tags: [uat-fix, gap-closure, client-only, i18n, backup]
status: complete
requires: [94-01, phase-92-routes]
provides: [unified-merged-history-type-column, next-run-date-time, 22-00-default]
affects: [src/pages/backup.js, src/actions/actions.js]
key-files:
  created: []
  modified:
    - src/pages/backup.js
    - src/actions/actions.js
    - src/locales/{en,fr,nl,de,es}.json
    - test/backup-history-client.test.mjs
decisions:
  - Type column renders as a leading fixed-width badge per row (established badge-row idiom) rather than restructuring rows into a <table>; labels REUSE existing keys (nav.route.backup / page.restore.title) — only one new key (historyColType) to satisfy the i18n-scan dead-key gate.
  - Restore history payload fetched via additive export refreshRestoreHistory + page fill-loop kick (fetching guard prevents render→fetch→render), no route change.
  - actions.js cannot be imported in node (bundler aliases), so the UAT-4 pin extracts DEFAULTS + cronFromForm snippets and evals them — real assertion, not a static grep.
tech-stack:
  added: []
  patterns: [fill-loop in-render kick, esc() discipline, i18n ×5 same-commit]
metrics:
  duration: ~40 min
  completed: 2026-11-24
actuals:
  tokens: 42000
  tasks: 3
  commits: 3
plan_head_before: 7eda48a96e5a9d3b32a0b8c77491235f2f5bdabc
plan_head_after: 37cdee80
---

# Phase 94 Plan 02: UAT Fixes — table chrome, Next-run time, merged history, 22:00 default Summary

Client-only gap-closure: unwrapped the panel-in-panel task table with uniform alignment, Next-run renders date+time, restore rows merged into the unified history sblock under a Type column (filters stay Backup-only), and the fresh-task default is 22:00 with Hour-before-Minute builder order.

## Tasks

| # | Task | Commit | Result |
|---|------|--------|--------|
| 1 | UAT-1/UAT-2: table chrome + Next-run date+time | d3a621c5 | ✅ |
| 2 | UAT-3: merged history with Type column (extends D-04) | b470dd48 | ✅ |
| 3 | UAT-4: 22:00 default + Hour-before-Minute | 37cdee80 | ✅ |

## Test Results

- `node --test test/backup-history-client.test.mjs test/backup-cron.test.mjs` → 46 pass, 0 fail (incl. new pins: no panel wrapper at render site, formatTime in next-run cell, Type column + merged restore rows + refreshRestoreHistory kick, cronFromForm fresh defaults === `0 22 * * *`, Hour-before-Minute order).
- `node --test test/restore-client.test.mjs` → pass (restoreRunRow pins intact; the card gained the Type badge, still server-order verbatim).
- `npm run build` → green (i18n-scan ×5 dead-key gate — historyColType used in the same commit).
- Full `npm test` → **2417 pass / 2 fail**, failures are exactly the documented pre-existing families:
  - `test/french-typography` D-05 fr values (pre-existing: customScheduleHint, statusUploadFailed, err.s3*, toast.s3ProbeDeleteFailed, restore.alert.failed.body)
  - `test/webhook-routes.test.mjs` "GET list: health computed from deliveries" (pre-existing)

## Files Touched

- `src/pages/backup.js` — bare `${body}` render, td/th alignment, formatTime import + next-run cell, Type badges (historyRow + restoreRunRow), sblock merge, restore-history render kick, builder Hour-before-Minute, defaults comment.
- `src/actions/actions.js` — `refreshRestoreHistory` export + `restoreHistoryFetching` guard; `BACKUP_TASK_FIELD_DEFAULTS` hour '22' + UAT citation comment.
- `src/locales/{en,fr,nl,de,es}.json` — `page.backup.historyColType` (Type/Type/Type/Typ/Tipo), single-line insertion each.
- `test/backup-history-client.test.mjs` — 4 new pin tests + historyColType added to the ×5 parity list.

## Deviations from Plan

None — plan executed as written. Two judgment calls within the plan's discretion:

1. **[Design call] Type "column" as a leading badge:** the plan says "add a Type column first"; implemented as a fixed-width leading badge per row (the page's established badge-row idiom) rather than restructuring into a `<table>` — restructuring would have invalidated the pinned verbatim-row contract (missingBlobWarn/checksum badge regexes) and added header keys beyond the plan's single-key budget. Visual result: a consistent Type column.
2. **[Design call] restoreRunRow reused as the restore-row renderer:** the restore history card rows and the merged sblock rows share one renderer; the card's rows now also carry the Type badge (honest labeling, no duplication).

**Invariants held:** zero route changes, zero server.js changes, zero new packages; esc() discipline on every interpolated field; T-87-11 (no client cron evaluation — cronFromForm is serialization only); D-01 badge mechanism untouched (page-load ?all=1&limit=50 reduction); historyCard stays retired; presets stay server-descriptor-driven; D-04 sblock below task table unchanged.

## Known Stubs

None.

## Self-Check: PASSED

- Commits d3a621c5, b470dd48, 37cdee80 present in `git log`.
- All modified files committed; working tree clean of task-related changes.
- 94-UAT.md updated with re-tested statuses.
