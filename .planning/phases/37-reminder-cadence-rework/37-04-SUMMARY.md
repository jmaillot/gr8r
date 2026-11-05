---
phase: 37-reminder-cadence-rework
plan: 04
subsystem: server
tags: [reminders, scheduling, gap-closure, exactly-once]
gap_closure: true
gap_ids: [G-37-3]
requires: [phase-37-rem-cadence, phase-38-digest-window]
provides: [post-09:00-reminder-catch-up]
affects: [server.js, test/due-reminders.test.mjs]
tech-stack:
  added: []
  patterns: [at-or-after-09:00 catch-up window, transactional dedup claim]
key-files:
  created: []
  modified: [server.js, test/due-reminders.test.mjs]
key-decisions:
  - "Reminder emission window widened to hour >= 9 (mirrors the phase-38 digest loop); exactly-once carried by the transactional reminders_sent claim"
  - "REM-01 re-scoped to pre-09:00 idle purity; new REM-06 pins the post-09:00 late catch-up (14:30 emit + 18:00 no-op)"
requirements-completed: [REM-01, REM-02, REM-03, REM-04]
duration: ~15 min
completed: 2026-11-05
status: complete
coverage:
  - deliverable: "Reminder loop gates on hour >= 9 (at-or-after-09:00 catch-up window)"
    verification: [{ kind: grep, ref: "grep -n \"if (hour >= 9) for (const t of tasks)\" server.js → 1 match; zero `hour === 9` occurrences", status: pass }]
    human_judgment: false
  - deliverable: "REM-01 pre-09:00 purity (no rows, no claims, no revision bump at 08:00)"
    verification: [{ kind: test, ref: "test/due-reminders.test.mjs#REM-01", status: pass }]
    human_judgment: false
  - deliverable: "REM-06 late catch-up: exactly one Due today at 14:30, repeat tick no-op, dedup key + revision bump"
    verification: [{ kind: test, ref: "test/due-reminders.test.mjs#REM-06", status: pass }]
    human_judgment: false
  - deliverable: "UAT test 2 (G-37-3) closed: restart after 09:00 local delivers exactly one Due today; second restart delivers nothing"
    verification: [{ kind: command, ref: "node /tmp/opencode/uat2-verify.mjs — real 3-boot server scenario on scratch data dir (see ## UAT Test 2 Evidence)", status: pass }]
    human_judgment: false
  - deliverable: "Full suite + lint green"
    verification: [{ kind: command, ref: "npm test → 943 pass / 0 fail / 3 pre-existing skips; npx eslint server.js test/due-reminders.test.mjs → clean", status: pass }]
    human_judgment: false
---

# Phase 37 Plan 04: Post-09:00 Reminder Catch-Up (G-37-3 Gap Closure) Summary

Reminder emission gate widened from strict `hour === 9` to `hour >= 9` with truthful catch-up comments, so a server restart after 09:00 local now delivers the missed "Due today" reminder exactly once — closing UAT test 2 (major).

## Accomplishments

- **G-37-3 resolved (GAP: G-37-3):** server.js reminder loop gates on `if (hour >= 9)` (mirroring the phase-38 digest loop); zero `hour === 9` occurrences remain.
- Exactly-once preserved under the widened window: the reminders_sent insert-or-ignore claim commits inside the same transaction as the notif append (untouched).
- REM-01 re-scoped: "a run before the 09:00 window opens writes nothing" (at8 — zero rows, zero claims, SC-5 revision check).
- REM-06 added: 14:30 local on the due date emits EXACTLY ONE `Due today: Ship it` (own row, `due_reminder`, dedup key `ws:taskId:memberId:morning_of:2026-01-15`, notifRows 1, revision +1); repeat tick at 18:00 emits nothing.
- All three stale comment blocks updated (scheduler header 1301-1313, window-predicate ~1419, phase-38 digest note ~1481): no comment claims the strict gate or "hour !== 9 pure reads" anymore; both loops documented as sharing the same at-or-after-09:00 catch-up window, each exactly-once via its own claim.

## UAT Test 2 Evidence

Automated 3-boot scenario on a scratch data dir (`node /tmp/opencode/uat2-verify.mjs`, real server.js processes via test/helpers/server.mjs, task due 2026-11-05, workspace tz Berlin = 09:30+ local at boot):

1. **Boot 1** — account + workspace created, doc crafted with due-today task, server stopped.
2. **Boot 2 (restart AFTER 09:00 local)** — boot catch-up emitted exactly 1 notification: `['Due today: Ship it']`, revision 2, dedup key `...:t1:m_51c8cc35:morning_of:2026-11-05`. ✅
3. **Boot 3 (second restart)** — still exactly 1 notification, revision unchanged. ✅

`UAT TEST 2 RE-VERIFICATION: PASS`

## Verification

- `grep -n "hour === 9" server.js | wc -l` → 0; gate at server.js:1396 reads `if (hour >= 9) for (const t of tasks)` ✅
- `node --test test/due-reminders.test.mjs` → 18/18 pass ✅
- `npm test` → 943 pass / 0 fail / 3 pre-existing skips ✅
- `npx eslint server.js test/due-reminders.test.mjs` → clean ✅

## Deviations from Plan

None - plan executed exactly as written. (The plan anticipated REM-01 could fail between tasks 1 and 2; with the widened gate 08:00 is still pre-09:00, so REM-01 stayed green throughout — no fix needed.)

**Total deviations:** 0. **Impact:** none.

## Self-Check: PASSED

- server.js and test/due-reminders.test.mjs modified and committed (5e092c5, 8f6de5f)
- 18/18 targeted tests, 943/943 full suite, lint clean, UAT scenario pass
