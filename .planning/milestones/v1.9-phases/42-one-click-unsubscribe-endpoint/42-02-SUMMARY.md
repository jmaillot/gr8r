---
phase: 42-one-click-unsubscribe-endpoint
plan: 02
subsystem: ui
tags: [i18n, settings-ui, push-notifications, source-pin, badge]
requires:
  - phase: 42-one-click-unsubscribe-endpoint
    provides: catalogue pin at 1675 (42-01) and the test/unsubscribe-route.test.mjs suite this plan extends
provides:
  - settings.notif.pushComingSoon i18n key (EN "Coming soon" / FR "Bientôt disponible")
  - "Coming soon" badge on exactly the three inert push toggles (push_mention/push_assign/push_comment)
  - Badge-placement source pin in test/unsubscribe-route.test.mjs (15th test) guarding D-11/D-12
  - catalogue pin 1675 → 1676
affects: [backlog 999.2 (real push + toasts), verify-work phase 42 UAT]
tech-stack:
  added: []
  patterns: [reusable .badge faint span in the srow description slot, source-inspection scope pin]
key-files:
  created: []
  modified: [src/pages/settings.js, src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs, test/unsubscribe-route.test.mjs]
key-decisions:
  - "Badge rendered as a reusable <span class=\"badge faint\"> in the srow description slot — follows the file's existing .badge precedent (members/projects lists), no new CSS, no row-layout change for the other rows"
  - "Task 2's 'exactly 3 references' pin read as authoritative over Task 1's grep-fails-when wording — the key is used once per row (3 rows = 3 references), which is the intended D-11 scope"
requirements-completed: [UNSUB-02]
actuals:
  tokens: 6200
  tasks: 2
  commits: 2
commits: 2
plan_head_before: 173be51
plan_head_after: a1ec00a
duration: 8 min
completed: 2026-11-06
status: complete
---

# Phase 42 Plan 02: Coming Soon Badge on Push Toggles Summary

**A "Coming soon" badge (EN/FR) now decorates exactly the three inert push toggles in Settings — push_mention, push_assign, push_comment — while due_reminder and past_due keep their real descriptions, pinned by a source-inspection test so the badge can never silently spread to functional rows.**

## Performance

- **Duration:** 8 min
- **Tasks:** 2
- **Files modified:** 5 (0 created)

## Accomplishments
- `settings.notif.pushComingSoon` catalogued in both locales (EN "Coming soon" / FR "Bientôt disponible"); i18n scan reports 0 unlisted / 0 pending
- Badge rendered in the srow description slot (second argument) of exactly the three inert push rows, as `<span class="badge faint">` — reuses the file's existing badge precedent, zero new CSS; row layout of other rows untouched
- D-12 honored: toggles still rendered via `tog()` with the `np` handler wiring, clickable, nothing disabled — no state/handler/backend changes
- Catalogue-size pin bumped 1675 → 1676 with trail comment `+ settings.notif.pushComingSoon, phase 42 plan 2`
- 15th test in test/unsubscribe-route.test.mjs pins D-11/D-12: badge key referenced exactly 3 times in `case 'notif-push'`, each push row's srow carries the badge, dueReminder/pastDue rows keep `dueReminderDesc`/`pastDueDesc` and are asserted badge-free, and no `disabled` attribute appears in the case block

## Task Commits

1. **Task 1: "Coming soon" badge on the three inert push toggles (D-11/D-12)** - `17180da` (feat)
2. **Task 2: Badge placement pin + full-suite regression** - `a1ec00a` (test)

## Files Created/Modified
- `src/pages/settings.js` — badge span in the description slot of the three push srow calls
- `src/locales/en.json` / `src/locales/fr.json` — settings.notif.pushComingSoon
- `test/i18n-core-features.test.mjs` — pin 1675 → 1676
- `test/unsubscribe-route.test.mjs` — badge-placement source pin (15th test)

## Decisions Made
- Used the existing `.badge faint` span (already used for invited/status/owner badges) instead of inventing a style — consistent with srow/badge habits in the file
- Resolved the plan's internal tension between Task 1's grep expectation (count 1 in settings.js) and Task 2's pin (exactly 3 references) in favor of Task 2's D-11 intent: one reference per row

## Deviations from Plan

None - plan executed exactly as written (the settings.js grep-count discrepancy is an internal plan inconsistency resolved toward Task 2's authoritative pin, not a code deviation).

## Issues Encountered
- None.

## User Setup Required

None - no external service configuration required.

## Verification

| Check | Result |
|-------|--------|
| `node --test test/i18n-core-features.test.mjs` | ✅ pass (pin 1676) |
| `npm run i18n:scan` | ✅ 0 literals, 0 pending, 0 unlisted |
| `grep -c pushComingSoon` | en.json: 1, fr.json: 1, settings.js: 3 (per-row design, pinned by test) |
| `node --test test/unsubscribe-route.test.mjs` | ✅ 15/15 pass |
| `npm test` (full suite) | ✅ 991 tests — 988 pass / 0 fail / 3 env-gated skips |

## Next Phase Readiness
- Phase 42's two plans both complete; ready for phase verification/UAT.

## Coverage

- id: D11 — description: "Badge on exactly the three inert push toggles; due_reminder and past_due stay badge-free" — verification: [tests/test/unsubscribe-route.test.mjs#badge-placement pin, pass; command: grep -c pushComingSoon settings.js = 3, pass] — human_judgment: false
- id: D12 — description: "Toggle behavior unchanged — rendered, clickable, nothing disabled" — verification: [tests/test/unsubscribe-route.test.mjs#badge-placement pin (tog count + no disabled), pass] — human_judgment: false
- id: K1 — description: "Badge key catalogued EN+FR and i18n gate green" — verification: [tests/test/i18n-core-features.test.mjs#catalogue pin 1676, pass; command: npm run i18n:scan, pass] — human_judgment: false
- id: VIS — description: "Badge visual placement/legibility inside the real Settings panel" — human_judgment: true — rationale: "Client-render visual; covered for scope/correctness by the source pin, but on-screen look belongs to verify-work UAT"

## Self-Check: PASSED

- All 5 modified files present on disk (verified via test runs above)
- Commits 17180da, a1ec00a in git log: FOUND
- Plan-level verification re-run: all PASS (see table)

---
*Phase: 42-one-click-unsubscribe-endpoint*
*Completed: 2026-11-06*
