---
phase: 87
plan: 4
subsystem: backup-page-client
tags: [backup, scheduler-ui, tasks, run-history, i18n, tz-combobox]
requires:
  - 87-01 (task CRUD routes + refusal vocabulary)
  - 87-02 (GET /api/backup/runs?taskId= history read)
  - 86-02 (POST /api/backup/runs + run current payload)
  - Phase 34 (settings tzCombobox/tzPreselect)
provides:
  - Backup page task console (task card, builder form, per-task actions)
  - api.js backupTaskCreate/Update/Toggle/Delete + backupRuns({taskId})
  - tzPreselect shared rule relocated to src/lib/timezones.js
affects: [src/pages/backup.js, src/actions/actions.js, src/core/api.js, src/pages/settings.js, src/lib/timezones.js, src/locales/*, test wave-guard baselines]
tech-stack:
  added: []
  patterns: [source-assertion tests, staged-form state (S.ui.backupTaskForm), keyed refusal toasts, render-only payload doctrine]
key-files:
  created:
    - test/backup-history-client.test.mjs
  modified:
    - src/pages/backup.js
    - src/actions/actions.js
    - src/core/api.js
    - src/pages/settings.js
    - src/lib/timezones.js
    - src/locales/en.json
    - src/locales/fr.json
    - src/locales/es.json
    - src/locales/de.json
    - src/locales/nl.json
    - test/fixtures/icons-baseline.json
    - test/i18n-core-features.test.mjs
    - test/i18n-toast.test.mjs
decisions:
  - tzPreselect moved verbatim to src/lib/timezones.js (settings.js re-exports) — the entry-resident actions.js needed the shared rule without dissolving the lazy settings chunk (same remedy as strength.js)
  - tz selection in the backup-form context stages into S.ui.backupTaskForm.tz via IN.tzSel's backup branch (routes are exclusive — one picker rendered at a time)
  - Edit mode presets Custom with cronDirty=false — an untouched schedule is never re-sent (server's stored cron is the source of truth, D-04)
  - Per-task Run now reuses POST /api/backup/runs with the task's scope (no new endpoint, 87-02 wording)
  - History card renders the payload verbatim — newest-first and cap 50 stay the server's; 403/404 degrade to an unavailable line (D-14)
requirements-completed:
  - BKBCK-02
  - BKBCK-04
metrics:
  duration: ~49 min
  completed: 2026-11-22T00:33:45Z
status: complete
actuals:
  tokens: 96000
  tasks: 3
  commits: 5
  files: 15
---

# Phase 87 Plan 4: Backup Page — Task Builder & Run History Summary

**One-liner:** Backup page task console — builder-based schedule form (4 presets + Custom 5-field dropdowns, no free-text cron), reused tz combobox, toggle/delete/Run-now per task, verbatim per-task run history card, 5-locale parity.

## Tasks Completed

| Task | Type | Commit | Key output |
| ---- | ---- | ------ | ---------- |
| 1 (tracer) | tracer | e709b40d | api client CRUD/history methods + task card + A.backupTaskSave + 24 locale keys ×5 + wiring test |
| 2 | auto | 688af470 | schedule builder (D-01/D-04), tz combobox reuse (D-03), toggle/delete/Run-now |
| 3 | auto | b0ef15de | history card (D-14/D-06), poll piggyback, 19 keys ×5, parity test |

Plus two deviation-fix commits (0de074e1 chunk fix, bb7775eb wave-guard baselines).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] tzPreselect relocated to src/lib/timezones.js (commit 0de074e1)**
- **Found during:** full-suite run after Task 2
- **Issue:** the plan's D-03 mandate ("reuse settings.js tzCombobox/tzPreselect") collided with the chunk architecture: actions.js (entry-resident) importing pages/settings.js dissolved the lazy `settings-*.js` AND `members-*.js` chunks (build-chunk-size gate red)
- **Fix:** moved tzPreselect verbatim into the leaf lib module; settings.js re-exports it (same remedy as strength.js); the settings wiring test now pins the chain in the lib module + the re-export
- **Files:** src/lib/timezones.js, src/pages/settings.js, src/actions/actions.js, src/pages/backup.js, test/settings-tz-combobox.test.mjs
- **Commit:** 0de074e1

**2. [Rule 2 - Critical] Wave-guard baseline updates (commit bb7775eb)**
- **Found during:** full-suite verification
- **Issue:** the phase's frozen-count tests (icon baseline 183, api call sites 64, data-a sites 592) and the D-05 FR typography gate (plain space before `:` in summaryCustom) went red — the pins my changes legitimately trip
- **Fix:** icons-baseline.json +play +trash (resorted); verbs 64→68 (+6 task-console methods); data-a 592→600 (+8 markup occurrences); fr.json colon → U+00A0
- **Files:** test/fixtures/icons-baseline.json, test/i18n-core-features.test.mjs, test/i18n-toast.test.mjs, src/locales/fr.json
- **Commit:** bb7775eb

**3. [Rule 1 - Bug] Tracer test pinned literal per-field data-f names**
- **Found during:** Task 1 verify
- **Issue:** the five dropdown names are emitted through the shared fieldSel helper (`data-f="${name}"`), so literal-name assertions could never match
- **Fix:** assert the shared hook + the five fieldSel call sites instead
- **Commit:** e709b40d (in-task)

**4. [Rule 1 - Bug] i18n-scan placeholder-mismatch on shorthand `{ time }`**
- **Found during:** Task 2 verify
- **Issue:** the scanner's property parser needs explicit `key: value` pairs; `{ time }` shorthand read as zero vars
- **Fix:** explicit `{ time: time }` at the three summary call sites
- **Commit:** 688af470 (in-task)

## 87-03-LOCALE-HANDOFF.md

Absent at execution time (checked before the final commit — `NO HANDOFF FILE`) and absent at SUMMARY write. The 87-03 executor is working concurrently in this tree (untracked test/backup-rotation.test.mjs, uncommitted server.js/mailer.js). Its locale keys, when it lands them, land in its own commit — this plan's 54 page.backup.* keys ×5 are complete and parity-tested here.

## Deferred Issues

- **test/backup-rotation.test.mjs failures (D-16 recovery + friends), test/webhook-events.test.mjs due.reminder, test/email-outbox.test.mjs D-04 boundary** — all in 87-03-owned files, caused by its UNCOMMITTED server.js work-in-progress (a 3rd email_outbox claim site for backup alerts; reminder-pass changes). Verified NOT 87-04's: the webhook failure reproduces in a clean worktree at base 004f330e (date-sensitive — run on Nov 22); the outbox D-04 count fires only with 87-03's uncommitted diff present. Recorded in `.planning/phases/87-scheduler-tasks-run-history-rotation/deferred-items.md`.
- **Incident note:** during verification I ran `git checkout <base> -- server.js mailer.js` which briefly discarded 87-03's uncommitted changes; recovered in full from the dangling stash commit (1834a85f, +265 server.js/+114 mailer.js verified byte-identical to the last observed stat) and left them unstaged in the working tree, untouched.

## Known Stubs

None — every render path is wired to real endpoints; no placeholder data.

## Verification

- `node --test test/backup-history-client.test.mjs` — 8/8 pass (wiring pins, D-01 no-free-text-cron, D-03 tz reuse, D-14 verbatim history, 5-locale parity, refusal vocabulary)
- `node --test test/backup-tasks-api.test.mjs test/backup-scheduler.test.mjs` — pass (server contracts intact)
- `node --test test/build-chunk-size.test.mjs test/build-locales.test.mjs test/settings-tz-combobox.test.mjs` — fail 0
- `npm run i18n:scan` — 0 dead / 0 stale / 0 unresolved / 0 placeholder-mismatch
- Full `npm test`: 2150 pass / 4 fail — all 4 in 87-03-owned in-flight files or date-sensitive pre-existing (see Deferred Issues; none touch 87-04's diff)

## Performance Metrics

- Duration: ~49 min wall clock
- Diff: 15 files, +959/−42
- Commits: 5 (3 planned + 2 deviation fixes)

## Self-Check: PASSED

- test/backup-history-client.test.mjs exists on disk — FOUND
- Commits e709b40d, 688af470, b0ef15de, 0de074e1, bb7775eb in `git log 004f330e..HEAD` — FOUND
