---
phase: 34-per-user-settings-isolation-search-leak-closure
plan: 01
subsystem: notifications
tags: [sqlite, per-user-prefs, notifications, idor, whitelist, reminder-scheduler]

requires:
  - phase: 33-membership-surface-hardening
    provides: membership authority rows + fail-convention routes the prefs routes build on
provides:
  - user_notif_prefs table (composite PK workspace_id+user_id) in the boot DDL
  - getUserNotifPrefs(userId, workspaceId) — the single prefs reader (D-04)
  - GET/PUT /api/me/notif-prefs routes (session user_id, 17-key whitelist, Boolean coercion, no-oracle 404)
  - notifPrefs stripped from documents in both directions (normalizeDoc read strip, mergeClientDoc write strip)
  - reminder gate + queueNotifEmails resolve prefs per recipient through the accessor
affects: [34-02 migration backfill, 34-04 client prefs module, settings page]

actuals:
  tokens: 8303
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - per-user authority rows with merge-on-read accessor ({ ...DEFAULTS, ...stored })
    - strip-both-directions doc-field retirement (D-30 precedent applied to notifPrefs)
    - per-recipient resolution (member_id → user_id via memberships) in event-driven consumers

key-files:
  created:
    - test/notif-prefs.test.mjs
  modified:
    - server.js
    - test/due-reminders.test.mjs

key-decisions:
  - "Consumers key on member_id, so both the reminder gate and queueNotifEmails map member_id → user_id through the memberships authority map before calling getUserNotifPrefs; doc-only recipients carry no row and read defaults"
  - "emptyDoc's notifPrefs synthesis removed — it was immediately stripped by normalizeDoc, dead weight"
  - "due-reminders pins migrated from doc-carried prefs fixtures to per-user rows (makeWorkspace writes user_notif_prefs); the two doc-representation pins now assert the strip + accessor defaults"

patterns-established:
  - "Prefs accessor pattern: one prepared SELECT, JSON.parse try/catch → {}, spread over NOTIF_PREF_DEFAULTS"
  - "Prefs route pattern: requireUser + sameOrigin + readJson + key whitelist 400 (unknownPrefKey) + Boolean coercion + membership no-oracle 404"

requirements-completed: [SETTINGS-01, SETTINGS-02]

coverage:
  - id: D1
    description: "PUT /api/me/notif-prefs stores a (workspace_id, user_id) row from the session user, GET returns defaults merged under the stored row"
    requirement: SETTINGS-01
    verification:
      - kind: integration
        ref: "test/notif-prefs.test.mjs#PUT whitelisted prefs then GET returns them merged over defaults"
        status: pass
    human_judgment: false
  - id: D2
    description: "PUT with a key outside the 17-key whitelist → 400 unknownPrefKey; every accepted value coerced to boolean"
    requirement: SETTINGS-02
    verification:
      - kind: integration
        ref: "test/notif-prefs.test.mjs#PUT with an unknown key is rejected with 400"
        status: pass
      - kind: integration
        ref: "test/notif-prefs.test.mjs#every accepted value is coerced to boolean"
        status: pass
    human_judgment: false
  - id: D3
    description: "Double strip — doc GET never carries notifPrefs; doc PUT carrying notifPrefs is dropped, never merged"
    requirement: SETTINGS-02
    verification:
      - kind: integration
        ref: "test/notif-prefs.test.mjs#a document GET never carries notifPrefs — a planted legacy field is stripped"
        status: pass
      - kind: integration
        ref: "test/notif-prefs.test.mjs#a document PUT carrying notifPrefs has the field dropped, not merged"
        status: pass
    human_judgment: false
  - id: D4
    description: "Auth boundaries: unauthenticated 401; non-member reads/writes rejected no-oracle 404 (IDOR T-34-01)"
    requirement: SETTINGS-01
    verification:
      - kind: integration
        ref: "test/notif-prefs.test.mjs#unauthenticated GET and PUT are rejected with 401"
        status: pass
      - kind: integration
        ref: "test/notif-prefs.test.mjs#a non-member is rejected with 404 (no-oracle) for GET and PUT"
        status: pass
    human_judgment: false
  - id: D5
    description: "Backstop probes: no row reads all-ON defaults / empty stored object reads as defaults; equal prefs stay two distinct rows with per-key order-insensitive accessor equality"
    requirement: SETTINGS-02
    verification:
      - kind: integration
        ref: "test/notif-prefs.test.mjs#a user with no row reads the all-ON defaults — empty stored prefs read as defaults"
        status: pass
      - kind: integration
        ref: "test/notif-prefs.test.mjs#two users with exactly equal prefs remain two distinct rows, accessor output equal per key"
        status: pass
    human_judgment: false
  - id: D6
    description: "Per-recipient consumers: reminder gate + email dispatch resolve prefs per recipient; two users with different rows get different outcomes (Pitfall-1 proof)"
    requirement: SETTINGS-01
    verification:
      - kind: integration
        ref: "test/notif-prefs.test.mjs#two users with different rows get different outcomes — the reminder gate and email dispatch resolve per recipient"
        status: pass
    human_judgment: false
  - id: D7
    description: "Zero behavior change at switch-over — all pre-existing due-reminders/membership/scope/migration pins stay green"
    verification:
      - kind: integration
        ref: "node --test test/due-reminders.test.mjs (16/16)"
        status: pass
      - kind: integration
        ref: "node --test test/membership.test.mjs (24/24)"
        status: pass
      - kind: integration
        ref: "node --test test/scope.test.mjs (78 pass, 3 pre-existing skips)"
        status: pass
      - kind: integration
        ref: "node --test test/migration.test.mjs (32/32)"
        status: pass
    human_judgment: false

duration: 11min
completed: 2026-11-03
status: complete
---

# Phase 34 Plan 01: Per-User Notif Prefs Authority Layer Summary

**Per-user notification preferences as SQLite rows keyed (workspace_id, user_id): single getUserNotifPrefs accessor, GET/PUT /api/me/notif-prefs with a 17-key whitelist, notifPrefs stripped from documents both directions, and reminder/email consumers resolving prefs per recipient.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-11-03T09:56:57Z
- **Completed:** 2026-11-03T10:08:10Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `user_notif_prefs` table (composite PK) added to the boot DDL block with Phase-34 comment discipline
- `getUserNotifPrefs(userId, workspaceId)` is now the ONLY prefs reader — merge-on-read over the 13-key default layer with a malformed-JSON backstop
- GET/PUT `/api/me/notif-prefs`: session-derived user_id (never the body), sameOrigin, membership no-oracle 404, unknown key → 400, Boolean coercion, prepared upsert
- `normalizeDoc` D-27-5 default-merge block deleted and replaced by the read strip; `mergeClientDoc` gained the write strip — a stale client cannot resurrect the field
- Reminder gate and `queueNotifEmails` rerouted per recipient (Pitfall 1): prefs resolve inside the per-task/per-notification loops, mapping member_id → user_id via memberships
- 10-test suite incl. both backstop probes (empty input; adjacency + key-order insensitivity) and the differing-users reminder/email proof via a fake SMTP sink

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end per-user prefs — table, accessor, routes, double strip, one test file** - `eb90122` (feat)
2. **Task 2: Per-recipient consumer reroute — reminder gate + email dispatch through the accessor** - `5f280a8` (feat)

## Files Created/Modified
- `server.js` - DDL, constants, accessor, routes, both strips, per-recipient consumers
- `test/notif-prefs.test.mjs` - 10-test suite for the prefs authority layer (created)
- `test/due-reminders.test.mjs` - pins migrated from doc-carried prefs to per-user rows

## Decisions Made
- Consumers key on member_id, so both consumers map member_id → user_id through the memberships authority map before calling the accessor; doc-only recipients carry no row and read defaults
- Removed `emptyDoc`'s notifPrefs synthesis (immediately stripped by normalizeDoc — dead weight that failed the zero-doc-reads grep)
- Migrated the due-reminders D-27-5 pins to per-user rows: `makeWorkspace` writes `user_notif_prefs` instead of the doc fixture; the doc-representation pins now assert the strip + accessor defaults (behavior preserved)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Consumer reroute needed a member_id → user_id mapping the plan omitted**
- **Found during:** Task 2
- **Issue:** The plan's literal `getUserNotifPrefs(t.assignee, ws.id)` / `getUserNotifPrefs(n.to, workspaceId)` would look up rows by member_id while rows are keyed by user_id — every lookup would miss and read defaults, breaking the differing-users requirement
- **Fix:** Reminder gate selects `user_id` in the existing assigneeMembership lookup; queueNotifEmails uses the memberships-derived `authority` map; both fall back to the raw id (doc-only recipients → defaults)
- **Files modified:** server.js
- **Verification:** differing-users reminder/email test passes; all pre-existing pins green
- **Committed in:** 5f280a8 (Task 2 commit)

**2. [Rule 1 - Bug] Test-side: reminder rows for an opted-out user still emit (due_reminder/past_due stay ON) — assertion scope corrected**
- **Found during:** Task 2
- **Issue:** First draft asserted "A gets no reminder rows"; `email_reminder: false` only gates the EMAIL, not in-app rows
- **Fix:** Test asserts the email outcome via the decoded text/plain deep-link filter (invite emails excluded); in-app row assertions scoped accordingly
- **Files modified:** test/notif-prefs.test.mjs
- **Verification:** 10/10 pass
- **Committed in:** 5f280a8

---

**Total deviations:** 2 auto-fixed (2 × Rule 1 bug)
**Impact on plan:** Both fixes necessary for the plan's own must_haves ("two users with different rows get different outcomes") to hold. No scope creep.

## Issues Encountered
- 5 pre-existing due-reminders tests pinned the retired doc-carried prefs representation and failed after the strip. Migrated them to the per-user authority (planned demotion, not a regression); all 16 now pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Rows are the authority, the accessor is the only reader, strips hold in both directions — Plan 02's `migrateUserNotifPrefs` guarded backfill can copy `doc.data.notifPrefs` into per-user rows against a clean server half
- Note for Plan 02: a legacy doc's prefs are stripped on read, so the backfill must run against the STORED doc blob before/without normalizeDoc (already the planned design)
- Zero-change switch-over verified: membership (24), scope (78/3 pre-skips), migration (32), due-reminders (16) all green

---
*Phase: 34-per-user-settings-isolation-search-leak-closure*
*Completed: 2026-11-03*
