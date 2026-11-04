---
phase: 37-reminder-cadence-rework
plan: 02
subsystem: i18n/settings
tags: [i18n, settings-copy, changelog, reminders]
requires:
  - phase: 37-01
    provides: two-offset reminder cadence (morning_of + past_due); day_before keys already deleted from catalogues
provides:
  - honest due_reminder settings copy EN+FR (Due-day reminder, morning-of-only)
  - release-notes entry documenting the cadence change and the one-time deploy catch-up burst (SC-5)
affects: [Phase 38 digest, verify-work phase 37]
tech-stack:
  added: []
  patterns: [value-only locale edits guarded by i18n pins + i18n:scan parity gate]
key-files:
  created: []
  modified:
    - src/locales/en.json
    - src/locales/fr.json
    - CHANGELOG.md
key-decisions:
  - "Plural push_due pair (settings.notif.dueReminders / settings.notif.dueDesc) left untouched despite an acceptance-criterion grep demanding zero 'day before' matches — the plan's own prohibition (Pitfall 3) and the byte-identical i18n pins take precedence; the residual match is pre-existing push_due copy, out of scope"
  - "Shared-label collateral accepted: the new singular 'Due-day reminder' value also becomes the inbox filter label (inbox.js:16, D-04 discretion)"
decisions: []
requirements-completed: [REM-02, REM-04]
coverage:
  - id: D1
    description: "due_reminder settings toggle copy updated EN+FR to morning-of-only cadence, keys unchanged"
    requirement: REM-02
    verification:
      - kind: unit
        ref: "test/i18n-pages.test.mjs#the English oracle — the settings page"
        status: pass
      - kind: other
        ref: "command: grep -c '\"Due-day reminder\"' src/locales/en.json → 1; grep -c 'Rappel le jour d.échéance' src/locales/fr.json → 1"
        status: pass
    human_judgment: false
  - id: D2
    description: "Plural push_due pair dueReminders/dueDesc byte-identical (Pitfall 3 respected)"
    verification:
      - kind: other
        ref: "command: git diff src/locales/*.json shows only the four singular-pair value lines"
        status: pass
    human_judgment: false
  - id: D3
    description: "CHANGELOG documents two-reminder cadence, day-before removal, one-time catch-up burst, inert legacy rows"
    requirement: REM-04
    verification:
      - kind: other
        ref: "command: grep -c 'catch-up' CHANGELOG.md → 2; entry mentions 'Due today', 'Past due', day-before removal"
        status: pass
    human_judgment: false
duration: ~12 min
completed: 2026-11-04
commits: 2
plan_head_before: 0d75e05
plan_head_after: 05bb671
status: complete
---

# Phase 37 Plan 02: settings copy + release notes Summary

Updated the singular `dueReminder` settings pair in EN+FR to the honest two-reminder cadence ("Due-day reminder" / "Rappel le jour d’échéance", morning-of-only descriptions) and added a CHANGELOG entry documenting the cadence change plus the one-time deploy-morning catch-up burst — full suite green (930/0/3).

## Performance

- **Duration:** ~12 min
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- **Task 1 (commit f3c3686):** value-only edit of the singular pair `settings.notif.dueReminder` / `settings.notif.dueReminderDesc` in both locales (REM-02, D-04) — EN "Due-day reminder" / "Get a reminder on the morning a task is due.", FR "Rappel le jour d’échéance" / "Recevez un rappel le matin de l’échéance d’une tâche." Keys unchanged; plural push_due pair `dueReminders`/`dueDesc` untouched (Pitfall 3); `past_due` copy and all `notif.*` email keys untouched (D-05). i18n-pages (17 pass), notif-hydration (9 pass) and `npm run i18n:scan` (0 findings) all green.
- **Task 2 (commit 05bb671):** CHANGELOG entry under Unreleased → Changed documenting: at-most-two reminders per task (due-today morning + past-due next morning), day-before removal, the one-time catch-up burst at first deploy framed as designed behavior (SC-5, D-01/D-27-2), and the inert legacy rows / EN-snippet fallback guarantee (REM-04).

## Task Commits

1. **Task 1: Update due_reminder settings copy EN+FR (value-only)** - `f3c3686` (feat)
2. **Task 2: Document the deploy-morning catch-up burst (SC-5)** - `05bb671` (docs)

## Files Created/Modified

- `src/locales/en.json` - singular dueReminder pair values (2 lines)
- `src/locales/fr.json` - singular dueReminder pair values (2 lines)
- `CHANGELOG.md` - release-notes entry (Unreleased → Changed)

## Decisions Made

- Plural `settings.notif.dueDesc` ("One day before a task is due.") left as-is despite an acceptance-criterion grep conflicting with it — see Deviations.
- Shared-label collateral accepted per plan: the inbox filter label (inbox.js:16) now shows the new singular value.

## Verification Results

- `node --test test/i18n-pages.test.mjs` → 17 pass / 0 fail — PASS
- `node --test test/notif-hydration.test.mjs` → 9 pass / 0 fail — PASS
- `npm run i18n:scan` → 0 literals, 0 pending, 0 unresolved, 0 parity — PASS
- `grep -c '"Due-day reminder"' src/locales/en.json` → 1 — PASS
- `grep -c "Rappel le jour d.échéance" src/locales/fr.json` → 1 — PASS
- `git diff` shows only the four singular-pair value lines — PASS
- `grep -c "catch-up" CHANGELOG.md` → 2 — PASS
- Full suite `npm test` → **930 pass / 0 fail / 3 skips** — PASS (phase gate)

## Deviations from Plan

### Auto-fixed Issues

None — no code defects found.

### Criterion flaw (no fix applied)

**1. Unachievable acceptance criterion: `grep -c "la veille\|day before"` expected 0 in en.json**
- **Found during:** Task 1 acceptance gate
- **Issue:** en.json still contains 1 match — `"settings.notif.dueDesc": "One day before a task is due."` (line 1255), the plural push_due pair the SAME plan explicitly prohibits touching (Pitfall 3, must_haves truth) and which pinned tests require byte-identical. The action's prohibition and this criterion contradict each other; the criterion is a planner slip (the pre-phase wording lived in the singular pair, which this plan did change).
- **Resolution:** Prohibition wins — plural pair untouched. Documented here for the verifier; residual match is pre-existing push_due copy describing a different preference.
- **Files modified:** none

**Total deviations:** 0 auto-fixed, 1 criterion flaw documented. **Impact:** none — the shipped diff matches the plan's action and prohibitions exactly.

## Issues Encountered

None beyond the criterion flaw above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 37 complete (both plans executed): cadence is morning_of + past_due end-to-end — server (37-01), copy (this plan), release notes (SC-5). Ready for phase verification, then Phase 38 digest scope.
