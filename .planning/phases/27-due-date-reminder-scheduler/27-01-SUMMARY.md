---
phase: 27-due-date-reminder-scheduler
plan: 01
subsystem: server-scheduler
tags: [reminders, scheduler, sqlite, notifications, email]
requires: [phase-23-deep-link-email-path, transaction-helper, queueNotifEmails]
provides: [runReminderPass, reminders_sent table, TZ_BY_LABEL/localParts/addDaysIso, /api/internal/reminder-pass test route]
affects: [plan-02-settings-inbox]
tech-stack:
  added: []            # no new npm dependencies — node:sqlite + builtins only
  patterns: [window-open predicates + SQLite dedup ledger, transactional claim-then-emit, unref'd interval with try/catch, clock injection via test-only route]
key-files:
  created: [test/due-reminders.test.mjs]
  modified: [server.js]
decisions:
  - "A1 resolved: tz is a per-member profile field (doc.data.members[*].tz); workspace-shared tz = first membership row's member tz, unknown/empty → UTC (one-line comment in code)"
  - "Clock injection via test-only POST /api/internal/reminder-pass gated by REMINDER_TEST_TOKEN env (404 when unset) — server.js exports nothing, so tests drive the real pass over HTTP"
  - "Reminder byline 'Reminders' inlined in the by-resolution line so notif-email-link's source-extraction tests keep evaluating it standalone"
  - "Window-open semantics mean a due-date-morning pass fires both day_before and morning_of for a never-claimed task (each once) — accepted catch-up behavior per RESEARCH Pattern 2"
metrics:
  duration: ~35 min
  completed: 2026-11-01
status: complete
plan_head_before: 08981a23ec460bfaedd62a0e5d29585e3bf77330
plan_head_after: 2506782d16cb9a682745194b41386e1bd65ebdfa
commits: 3
actuals:
  tokens: 157000   # chars/4 over the 628-insertion diff + test iteration
  tasks: 3
  commits: 3
---

# Phase 27 Plan 01: Reminder Scheduler Core Summary

**One-liner:** Clock-injectable `runReminderPass()` in server.js — 09:00 workspace-local window scan with transactional exactly-once dedup in a new `reminders_sent` table, `by:null` reminder rows riding the existing `queueNotifEmails` pipeline behind the `email_reminder` gate, boot catch-up + 60s unref'd tick that never writes off-hour (13 new tests, full suite 646 green).

## What Was Built

- **Schema:** `reminders_sent (dedup_key PK, workspace_id, created_at)` + ws index, additive `IF NOT EXISTS` DDL. Keys are `${wsId}:${taskId}:${memberId}:${offset}:${dueDate}` — the due date in the key makes due-date edits re-arm automatically (REM-03).
- **Tz math:** literal `TZ_BY_LABEL` allow-list of the five settings labels → IANA zones; pure `localParts(tzLabel, date)` (en-CA formatToParts) + `addDaysIso` (Date.UTC string math). Unknown/empty label → UTC (legacy docs seed `tz: ''`).
- **Pass:** per-workspace `hour !== 9` continue precedes ANY write (idle tick = pure read, REM-01/SC-5); `remindable()` predicate mirrors canSee (done/archived/project-archived/private-hidden excluded); prefs gates `=== false` disables, missing keys ON; `transaction()` wraps INSERT OR IGNORE claim + `updateDoc` notif append (commit-or-neither); email fan-out strictly post-commit via `queueNotifEmails` with the post-write doc.
- **Email path:** `due_reminder`/`past_due` → `email_reminder` pref in `NOTIF_EMAIL_KIND`; byline resolves to system label `'Reminders'` for reminder kinds; `by: null` rows pass the self-skip.
- **Wiring:** boot pass (restart catch-up) + 60s `unref()` interval with mandatory try/catch, placed after the APP_URL boot guard.
- **Tests:** `test/due-reminders.test.mjs`, 13 tests — off-hour pure read (revision assert), dedup/restart/re-arm, day_before window + month rollover, both-offsets-in-one-pass, past-due exactly-once, gating matrix, prefs gates, DST via Pacific label, email gate + exact deep link (`APP_URL/w/:slug/task/:key`) captured through a real minimal SMTP sink, dead-SMTP failure isolation.

## Deviations from Plan

- **[Plan deviation] Tracer implemented the full window/prefs matrix, not morning_of-only.** Task 2's TDD RED was therefore instant-GREEN; the task committed the test matrix that locks the behavior (documented in both commits).
- **[Rule 3 — blocking] Test-only clock-injection route added** (`/api/internal/reminder-pass`, gated by `REMINDER_TEST_TOKEN`, 404 when unset): server.js exports nothing and the harness spawns real processes, so tests must drive the pass over HTTP. Returns the emitted rows for assertions. Idempotent by construction (window-open + claim); nonexistent in production.
- **[Rule 1 — bug, caught by existing suite] byline change broke notif-email-link tests** which regex-extract and standalone-eval the `const by = …` line; fixed by inlining the reminder check instead of referencing a module constant.

## Known Tradeoffs (not bugs)

- **At-most-once email:** a crash between commit and SMTP send loses the email but keeps the in-app row (RESEARCH A4; consistent with the P4-f fire-and-forget contract). In-app rows are exactly-once.
- **A due-date-morning pass emits day_before + morning_of together** when the day-before window was never claimed (e.g. server down) — intended window-open catch-up.

## Verification

- `node --test test/due-reminders.test.mjs` → 13/13 green after every task commit
- `npm test` → 646/646 green (was 633 + 13 new)
- `npx eslint server.js test/due-reminders.test.mjs` clean
- `package.json` unchanged (no new dependencies)

## Self-Check: PASSED

- Files exist: server.js (pass + schema + wiring), test/due-reminders.test.mjs ✓
- Commits exist: 336282d, f2e72fc, 2506782 ✓ (measured: 3 commits from plan_head_before 08981a2)
