---
phase: 29-team-project-scoped-permissions
plan: 03
subsystem: server+client
tags: [scope, notifications, send-time, tdd, 404-matrix]
status: complete
requires: [projectScope()/inScopeProject() predicate (29-01), hiddenFor funnel, runReminderPass/queueNotifEmails pipeline, Set-based emit targeting (actions.js)]
provides:
  - runReminderPass scope skip — out-of-scope assignees get no reminder row (in-app or email)
  - queueNotifEmails recipient scope filter — the email mirror never reaches an out-of-scope member (defense in depth, T-29-09)
  - mergeClientDoc assignee write-guard — a doc PUT assigning an out-of-scope member is rejected 400 assigneeOutOfScope (server authority, T-29-10, closes the assignableInProject seam)
  - memberScopeEligible(member, projectId) client eligibility helper + pre-filtered assign/mention/watcher fan-out (advisory, A4 default-allow)
  - MATRIX family 5 live (reminder pass + notification fan-out probes) — SCOPE-04 end-to-end
affects: [29-04 invites, /gsd-verify-work UAT]
tech-stack:
  added: []
  patterns: [single-predicate send-time enforcement, server-authority/client-advisory split (A4), throw-tagged-error→route-400 guard pattern, fakeSmtp in-suite email capture]
key-files:
  created: []
  modified: [server.js, src/core/store.js, src/actions/actions.js, test/scope.test.mjs, src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs]
key-decisions:
  - "Send-time ONLY enforcement (D-07): notifications lists are never server-side filtered — three server guards + one client emit filter, all at fan-out time"
  - "A4 resolution: memberScopeEligible derives from the actor's projection ONLY (roster role + optional forward-compat scope marker) and DEFAULTS TO ELIGIBLE when underivable — D-05 forbids projecting scope details, so the client filter is advisory and the server guards (reminder pass, email mirror, write-guard) are the authority"
  - "The assignee write-guard lives at the end of mergeClientDoc (throw tagged error → doc-PUT route catch answers 400 assigneeOutOfScope with rollback) — it applies regardless of the actor's own role, so a workspace-wide member cannot pull a scoped member into out-of-scope content"
  - "Eligibility underivable → never silently dropped (guards against over-filtering breaking mentions for admins/doc-only members); workspace-level rows (no project) keep flowing through the email filter"
requirements-completed: [SCOPE-04]
duration: ~35 min
completed: 2026-11-02T09:55:00Z
estimate:
  tokens: 90000
actuals:
  tokens: 21500
  tasks: 3
  commits: 5
plan_head_before: 4b1d51c2891864eabf701988c5d32d3e8fdf974c
plan_head_after: dd45c11
commits: 5
coverage:
  - deliverable: "Reminder pass skips out-of-scope assignees; in-scope + null-scope (admin) reminders unchanged"
    verification: [{ kind: tests, ref: "test/scope.test.mjs#SCOPE-04: the send-time server guards never reach an out-of-scope member > the reminder pass skips an out-of-scope assignee, delivers the in-scope one", status: pass }, { kind: tests, ref: "test/scope.test.mjs#404-matrix [family 5] reminder pass — inScope/outOfScope", status: pass }]
    human_judgment: false
  - deliverable: "Email mirror never queues an out-of-scope reminder email (real SMTP sink)"
    verification: [{ kind: tests, ref: "test/scope.test.mjs#the email mirror never queues an out-of-scope reminder email", status: pass }]
    human_judgment: false
  - deliverable: "Assignee write-guard: 400 assigneeOutOfScope, stored doc untouched; null-scope assignees never rejected"
    verification: [{ kind: tests, ref: "test/scope.test.mjs#a doc PUT cannot assign an out-of-scope member to an out-of-scope task", status: pass }, { kind: tests, ref: "test/scope.test.mjs#workspace-wide (null-scope) assignees are never rejected", status: pass }]
    human_judgment: false
  - deliverable: "Client emit pre-filter: out-of-scope target absent from mention/assign/watch fan-out; default-allow target never dropped"
    verification: [{ kind: tests, ref: "test/scope.test.mjs#SCOPE-04: the projection-marked out-of-scope target never lands in the mention fan-out", status: pass }, { kind: tests, ref: "test/scope.test.mjs#SCOPE-04: the assign notify and the watcher set ride the same eligibility filter", status: pass }, { kind: tests, ref: "test/scope.test.mjs#404-matrix [family 5] notification fan-out — inScope/outOfScope", status: pass }]
    human_judgment: false
  - deliverable: "No server-side filtering of the notifications list (D-07) — no changes to redactDoc notifs path or myNotifs"
    verification: [{ kind: tests, ref: "full suite: node --test --test-concurrency=2 test/*.test.mjs — 732 pass, 0 fail", status: pass }]
    human_judgment: false
---

# Phase 29 Plan 03: Send-Time Notification Enforcement Summary

**One-liner:** The scope predicate runs through every send-time resolution point — the server reminder pass, the defensive email mirror, the server-side assignee write-guard (400 `assigneeOutOfScope`), and the advisory client emit pre-filter (`memberScopeEligible`) — so a scoped member is never assigned, mentioned, reminded, or emailed about out-of-scope content.

## Accomplishments

- **Reminder pass guard:** `runReminderPass` resolves the assignee's membership and skips when `!inScopeProject(project, projectScope(membership))` — before the dedup claim, so no key is burned for a suppressed reminder. Doc-only assignees read workspace-wide (predicate's defensive default).
- **Email mirror guard (T-29-09):** `queueNotifEmails` builds a member→membership scope map once per call and skips recipients whose scope excludes the notification's project (row's `project`, else the referenced task's). Workspace-level rows (no project) keep flowing; underivable → keep flowing.
- **Assignee write-guard (T-29-10):** `mergeClientDoc` (now carrying `wsId` from `docFromClient`) rejects any incoming task whose `assignee` is a member whose scope excludes that task's project — throwing a tagged error the doc-PUT route answers with `400 assigneeOutOfScope` after rollback, stored doc untouched. Applies regardless of the actor's role; admin/owner and membership-less assignees always pass. `err.assigneeOutOfScope` added to EN+FR (catalogue pin 1643 → 1644).
- **Client emit pre-filter (A4):** `memberScopeEligible(member, projectId)` in `src/core/store.js` — derives from the actor's projection only (role admin/owner → always eligible per D-04; optional forward-compat scope marker; **default-allow when underivable**, per D-05's no-scope-projection constraint). `emitMentions`' target Set, both assign-notify sites (create + patch), and `taskWatchers` pre-filter through it. Advisory only — the server guards are the authority; no notifications-list filtering anywhere (D-07).
- **Matrix family 5 live (Task 3):** the Plan 02 placeholder replaced with two executed rows — reminder pass (in-scope → `reminded`, out-of-scope → `skipped`) and notification fan-out (mixed targets: marked out-of-scope target absent, underivable target never dropped). Family 7 (members) resolved to the checked-not-affected comment block; family 6 (invites) remains the single Plan 29-04 placeholder.
- **Tests:** suite grew 42 → 51 tests (45 pass + the guard subtests; 5 intentional skips remain, none for family 5). The email assertions run against a real in-suite fakeSmtp capture (due-reminders pattern) on a dedicated SMTP-enabled server instance.

## TDD Gate Compliance

- **Task 1 (tdd=true):** RED commit `54dcd9e` — 3 guard subtests + null-scope regression failing against pre-guard code (exit non-zero, exactly the guard cells red). GREEN commit `4289592` — all pass (42/42 in-suite). REFACTOR: none needed.
- **Task 2 (tdd=true):** RED commit `7c86fe3` — memberScopeEligible/fan-out probes failing (helper undefined). GREEN commit `82d6f0d` — 45/45. REFACTOR: none needed.
- **Task 3** is not behavior-adding (test-only matrix rows); committed `dd45c11` with the full suite re-run green (732 pass, 5 intentional skips).

## Deviations from Plan

**1. [Rule 2 - Missing critical functionality] `err.assigneeOutOfScope` catalogue keys + pin bump**
- **Found during:** Task 1 GREEN run
- **Issue:** `test/error-codes.test.mjs` enforces a non-empty `err.<code>` entry in EN+FR for every server-emitted code; the new 400 code was missing (milestone invariant).
- **Fix:** added the key to both locales; catalogue pin 1643 → 1644.
- **Files modified:** src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs (commit 4289592)

**2. [Rule 1 - Test bug] Task-1 RED harness fixes (not implementation bugs)**
- **Found during:** Task 1/2 RED runs
- **Issue:** (a) the email poll saw the invite email first and asserted on `messages[0]`; (b) the client response helper exposes `.data`, not `.json()`; (c) the fake SMTP socket needed an `error` swallow for teardown ECONNRESET; (d) `SCOPE_TOKEN` TDZ when the main server's `before()` referenced the later-in-file const.
- **Fix:** poll for the in-scope reminder text with a deadline; use `.data?.code`; `sock.on('error', () => {})`; token const moved to the file top.
- **Files modified:** test/scope.test.mjs (commits 4289592 era, pre-GREEN)

No plan-scope deviations: all three guards, the client filter, and the matrix rows landed as specified; `inScopeProject` call sites in server.js = 7 (≥ 4 required).

## Verification Results

- `node --test test/scope.test.mjs` — 51 tests: 46 pass, 5 intentional skips, 0 fail
- `node --test test/error-codes.test.mjs test/due-reminders.test.mjs test/i18n-core-features.test.mjs` — 54 pass (reminder pipeline + catalogue regressions green)
- `node --test --test-concurrency=2 test/*.test.mjs` — **732/732 pass, 0 fail, 5 intentional skips**

## Issues Encountered

None beyond the documented deviations.

## Next Phase Readiness

Ready for 29-04 (invites): SCOPE-04 is complete end-to-end; the matrix's only remaining placeholder is family 6 (invites), which Plan 29-04 must replace with live probes the same way.
