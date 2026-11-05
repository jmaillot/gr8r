---
phase: 37-reminder-cadence-rework
plan: 01
subsystem: scheduler/notifications
tags: [reminders, i18n, deletion, tests]
requires: [Phase 36 keyed reminder rows + server i18n gate]
provides:
  - two-offset reminder cadence (morning_of + past_due only)
  - REM-03 multi-morning exactly-once regression pin (D-06)
affects: [Phase 38 digest (lists post-REM offsets), inbox filter copy (Plan 02 owns settings copy)]
tech-stack:
  added: []
  patterns: [clock-injected integration tests, exactly-once dedup claim, catalogue-deletion + producer deletion in one atomic commit]
key-files:
  created: []
  modified:
    - server.js
    - src/locales/en.json
    - src/locales/fr.json
    - test/due-reminders.test.mjs
    - test/notif-i18n.test.mjs
    - test/i18n-core-features.test.mjs
key-decisions:
  - Legacy dayBefore-keyed inbox rows now degrade to their stored EN snippet in BOTH locales (catalogue entry gone) — pinned as the honest REM-04 inert-rows guarantee, not the pre-deletion FR sentence
  - "Both-offsets test restated as due-today + due-yesterday (catch-up window means the yesterday task gets morning_of + past_due in one pass)"
decisions: []
requirements-completed: [REM-01, REM-03, REM-04]
duration: ~25 min
completed: 2026-11-04
commits: 2
plan_head_before: 48410971379fcd9b20190ebae7ca5f602996c490
plan_head_after: 0d75e05
status: complete
---

# Phase 37 Plan 01: day_before offset removal Summary

Deleted the `day_before` reminder offset across producer, snippet and both catalogues in one atomic commit, rewrote every day_before test pin for the two-offset cadence, and added the REM-03 multi-morning replay pin — full suite green (930/0/3).

## Accomplishments

- **Task 1 (tracer, commit 394507e):** removed the `day_before` arm from `runReminderPass` offsets, the `day_before` branch from `reminderSnippet`, and simplified the key-mapping ternary to `morningOf|pastDue`; deleted `notif.reminder.dayBefore` from EN+FR catalogues in the SAME commit (i18n gate); dedup claim and key shape `${ws}:${task}:${assignee}:${offset}:${due}` byte-identical (D-02); `localDate >= due` catch-up predicate and prefs/scope gate order untouched (D-01, T-37-02).
- **Task 2 (commit 0d75e05):** rewrote all day_before-pinning tests in `test/due-reminders.test.mjs` (due-morning expects 1, window matrix proves nothing fires before the due date, prefs/email/DST expectations shrink to one offset) and `test/notif-i18n.test.mjs` (emission pin keyed on morningOf; legacy dayBefore row pin updated); added the REM-03 regression pin proving exactly one morning_of + one past_due and silence on due+2/due+5 (D-06).

## Verification Results

- `! grep -nE "day_before|dayBefore" server.js src/locales/en.json src/locales/fr.json` → exit 1 (no matches) — PASS
- `npm run i18n:scan` → exit 0, 0 unresolved / 0 parity — PASS
- `node --test test/due-reminders.test.mjs` → 17 pass / 0 fail — PASS
- `node --test test/notif-i18n.test.mjs` → 16 pass / 0 fail — PASS
- `node --test test/i18n-scan.test.mjs` → 36 pass / 0 fail — PASS
- Full suite `npm test` → **930 pass / 0 fail / 3 skips** — PASS
- `grep -c "day_before|dayBefore" test/due-reminders.test.mjs` → 0; `grep -c "notif.reminder.dayBefore" test/notif-i18n.test.mjs` → 1 (inline legacy fixture) — PASS
- mailer.js contains no day_before/dayBefore references — PASS

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Plan assumption wrong] Legacy dayBefore row pin did not survive catalogue deletion untouched**
- **Found during:** Task 2
- **Issue:** The plan asserted the I18N-03 fallback pin at notif-i18n.test.mjs:448-457 "must keep passing untouched." Verified false: `notifText` renders keyed rows via `has(n.key) ? t(n.key, vars) : snippet` (inbox.js:60), so deleting the catalogue entry makes the FR branch's `À échéance demain : …` assertion fail — the row now degrades to its stored EN snippet in every locale.
- **Fix:** Rewrote the pin to assert the post-deletion reality — snippet fallback in BOTH locales, raw key never leaks — keeping the inline dayBefore fixture key (exactly 1 reference). This still proves the REM-04 guarantee (legacy rows render, never blank, no migration) and matches the plan's own must-have truth ("still renders its stored EN snippet").
- **Files modified:** test/notif-i18n.test.mjs
- **Commit:** 0d75e05

**2. [Rule 1 - Missed pin] Catalogue-size assertion in i18n-core-features.test.mjs**
- **Found during:** Full-suite run (plan's research flagged no test pinning catalogue size — one exists)
- **Issue:** `test/i18n-core-features.test.mjs:218` pins `keys.length === 1674`; deleting `notif.reminder.dayBefore` makes it 1673.
- **Fix:** Updated the pin to 1673 with a history note (`− notif.reminder.dayBefore, phase 37 plan 1`).
- **Files modified:** test/i18n-core-features.test.mjs
- **Commit:** 0d75e05

**3. [Rule 1 - Missed pin] Reminder email fan-out count in notif-i18n.test.mjs (not in plan's rewrite list)**
- **Found during:** Task 2
- **Issue:** The `waitFor(smtp, 4, 'reminder pair')` at line 240 assumed 2 tasks × 2 offsets; with two offsets it is 2 emails.
- **Fix:** `waitFor(smtp, 2, ...)`.
- **Files modified:** test/notif-i18n.test.mjs
- **Commit:** 0d75e05

**Total deviations:** 3 auto-fixed (all Rule 1: plan-assumption gaps in test pins, not implementation bugs). **Impact:** none on shipped behavior — server.js matched the plan exactly; all fixes are test-side and keep the suite green.

## Issues Encountered

None beyond the deviations above.

## Next

Ready for 37-02 (settings copy rewrite for the singular dueReminder pair — not touched here per plan).
