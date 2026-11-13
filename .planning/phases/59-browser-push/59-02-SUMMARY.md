---
phase: 59
plan: 02
subsystem: server/push-fanout
tags: [push, web-push, fan-out, sweep, payload-budget, test-send]
requires: [59-01 push_subscriptions table + VAPID custody + push routes, queueNotifEmails gate order, tFor funnel, Phase 38 invariants]
provides: [sendPushFor() fan-out, PUSH_NOTIF_KIND map, 404/410 dead-subscription sweep, ≤4096-octet payload budget, POST /api/me/push-subscriptions/test per-device route, PUSH_SINK_MODULE test seam, doc-PUT + reminder-pass hooks, notif.push.* EN+FR keys]
affects: [59-03 (settings Push tab consumes the test-send route + push-config), Phase 61 (burst handling rides sendPushFor)]
tech-stack:
  added: []
  patterns: [email-parity fan-out gating (D-11), post-commit fire-and-forget (P4-f), same-pass dead-row sweep (PUSH-04), env-seam module mock (PUSH_SINK_MODULE)]
key-files:
  created: []
  modified: [server.js, test/push-server.test.mjs, src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs]
decisions:
  - "Test seam: PUSH_SINK_MODULE env names a sendNotification stub module loaded at boot — child-process spawn harness cannot mock.module, and the seam degrades to the real sender on load failure"
  - "Test-send route builds the notif SERVER-side (mention-shaped, task:null) so no arbitrary content is accepted from the body (T-59-08); isTest bypasses only the pref gate + self-skip"
  - "Reminder site: one post-write doc parse, two consumers (RESEARCH open question 3); push sits beside — never inside — the MAILER.enabled gate"
metrics:
  duration: ~50 min
  completed: 2026-11-13
status: complete
plan_head_before: a8cd9c4
plan_head_after: 7a06c2b
commits: 3
actuals:
  tokens: 28000
  tasks: 3
  commits: 3
---

# Phase 59 Plan 02: Push Fan-Out — sendPushFor, Sweep, Test-Send Summary

**One-liner:** `sendPushFor()` mirrors the email gate order (self-suppression → per-type pref → memberCanReadProject at send time, never digest-suppressed, never MAILER-gated) at both fan-out sites, with the 404/410 same-pass row sweep, the 4096-octet payload budget proven with pathological FR titles, and a per-device test-send route riding the real payload path.

## What was built

- **Task 1** (1ba6873): `PUSH_NOTIF_KIND` map + `sendPushFor(wsRow, nextDoc, newNotifs, isTest, onlyEndpoint)` beside `queueNotifEmails` — PUSH.enabled-only gate, the exact email gate order (D-11), NO digest-suppression branch (D-10), per-device loop with exactly one send per subscribed row (D-14), `last_seen_at` on success, tFor pre-localized titles (D-16: `{name} mentioned you` etc.; reminder = "Task due"), body = `KEY + 120-char-truncated title` (D-17/D-18), whole-payload budget assert. 404/410 → DELETE the row in the same pass; 429/network → logWarn only (PUSH-04). `POST /api/me/push-subscriptions/test`: server-built notif, real shaping path, `Test push · <title>` marker, caller-owned row only, non-member no-oracle 404. `PUSH_SINK_MODULE` boot seam so the spawned-server test harness records sends and simulates failures (`#fail<code>`/`#failnet` endpoint markers). doc-PUT fan-out hook + notif.push.* EN+FR keys landed here (Rule 3, see deviations).
- **Task 2** (7a6849a): reminder-pass hook — the post-commit block now parses the post-write doc once and feeds both `queueNotifEmails` (MAILER-gated) and `sendPushFor` (PUSH-gated) beside it, never inside the MAILER gate. Integration tests: digest user (`email_digest: true`) receives the reminder push with the inbox `due_reminder` row written; `push_due: false` zeroes pushes while the inbox row survives; doc-PUT mention → exactly one send per device.
- **Task 3** (7a06c2b): standing gate — catalogue-count pin 1844 → 1850 with drift note; full suite green, lint clean, i18n scan 0 dead/0 stale.

## Verification

- `node --test test/push-server.test.mjs` — 18 tests green (custody/routes + fan-out matrix, sweep, budget, test-send)
- `node --test test/push-server.test.mjs test/due-reminders.test.mjs` — 41 green (Phase 38 invariant suite unmodified)
- **Full suite: 1489 tests, 1477 pass, 0 fail, 12 skipped (pg matrix gating)** — `npm test`
- `npm run lint` — clean
- `node scripts/i18n-scan.mjs` — 0 dead, 0 stale, 0 unresolved
- `grep` pin: zero `MAILER` references in the `sendPushFor` body

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] doc-PUT fan-out hook landed in Task 1**
- **Found during:** Task 1 TDD run
- **Issue:** the Task 1 behavior tests (gate matrix, sweep, budget) trigger through the real doc-PUT `newNotifs` diff site — without the hook they cannot run green at Task 1's verify point.
- **Fix:** `if (PUSH.enabled && newNotifs.length) await sendPushFor(row, next, newNotifs);` landed beside `queueNotifEmails` in Task 1; Task 2 added the reminder site + its integration tests.
- **Files modified:** server.js

**2. [Rule 3 - Blocking] notif.push.* catalogue entries landed in Task 1**
- **Found during:** Task 1 TDD run
- **Issue:** the behavior tests assert localized titles; `tFor` would return the raw key without the EN/FR entries, making the pinned assertions meaningless at Task 1's verify point. Task 3 then owned only the standing-gate run (no pending-keys window existed).
- **Fix:** six keys (`notif.push.mentioned/assigned/commented/due/test/testBody`) added to both catalogues in Task 1; Task 3 committed the drift-pin amendment.
- **Files modified:** src/locales/en.json, src/locales/fr.json

## Known Stubs

None — the test-send route uses the real shaping path with a synthetic task-less notif (localized `notif.push.testBody`), by design (D-05/D-06).

## Threat mitigations delivered (T-59-06/07/08/09)

- T-59-06: title = display name + action, body = key + 120-char-truncated title only; 4096-octet assert; payload carries exactly `{url, title, body, test}`.
- T-59-07: `memberCanReadProject` re-checked per notif against the next doc's project map at send time.
- T-59-08: test-send route accepts only `{endpoint, workspace}` — the notif is server-built; caller-owned row only (user_id from session).
- T-59-09: sends are post-commit, awaited outside the transaction, failures caught and logged (never block the response).

## Self-Check: PASSED

- Commits verified: 1ba6873, 7a6849a, 7a06c2b (3 commits over a8cd9c4..7a06c2b).
- Key files exist and are committed; full suite green at SUMMARY time.
