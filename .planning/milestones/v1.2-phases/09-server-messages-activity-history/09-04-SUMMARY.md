---
phase: 09-server-messages-activity-history
plan: 04
subsystem: server-error-contract
tags: [errors, i18n, transport, tests]
requires: [09-01 (err.* catalogues), 09-02 (esc sinks)]
provides:
  - coded error payloads on every thrown httpError site
  - whole-payload tErr transport in api.js and modals.js
  - bidirectional err.* parity guard in test/error-codes.test.mjs
affects: [10-browser-coverage (French toasts now render translated)]
tech-stack:
  added: []
  patterns: [drain-on-overflow readJson, TOCTOU UNIQUE-violation mapping, source-scan reverse parity allowlist]
key-files:
  created: []
  modified:
    - server.js
    - src/core/api.js
    - src/overlays/modals.js
    - test/error-codes.test.mjs
key-decisions:
  - transport = whole payload as tErr vars (option 2) — payload shape unchanged, interpolate only replaces named keys
  - readJson drains an oversized body then rejects at end, so the 413 is actually written
  - createUser maps a UNIQUE violation to 409 accountExists (same message/code as the pre-check); other SQL errors rethrow (D-03)
  - reverse-parity allowlist derived by diffing en.json err.* against server.js (56 entries, one comment each)
requirements-completed: [ERR-01, ERR-02]
duration: ~20 min
completed: 2026-10-24
coverage:
  - deliverable: whole-payload error translation transport proven end-to-end (CR-02, IN-03)
    verification:
      - kind: tests
        ref: test/error-codes.test.mjs#alreadyMember ships its flat payload and renders in French without braces
        status: pass
      - kind: tests
        ref: test/error-codes.test.mjs#inviteForOtherEmail carries its email in the payload on the join flow
        status: pass
    human_judgment: false
  - deliverable: 8 thrown httpError sites emit their catalogued code (CR-01)
    verification:
      - kind: tests
        ref: test/error-codes.test.mjs#lastPrivateMember returns 409 with its code when the removal would strand a private project
        status: pass
      - kind: tests
        ref: test/error-codes.test.mjs#workspaceNotFound is returned for a document save to a nonexistent workspace slug
        status: pass
      - kind: command
        ref: "grep httpError(409, 'An account with that email already exists', 'accountExists') == 2"
        status: pass
    human_judgment: false
  - deliverable: 413 delivered with its code, socket intact (WR-05)
    verification:
      - kind: tests
        ref: test/error-codes.test.mjs#bodyTooLarge reaches the client as a full 413 response, the socket never resets
        status: pass
    human_judgment: false
  - deliverable: signup race renders 409 accountExists (WR-06)
    verification:
      - kind: tests
        ref: test/error-codes.test.mjs#accountExists stays on the duplicate signup after the pre-check
        status: pass
      - kind: tests
        ref: test/error-codes.test.mjs#accountExists maps the signup race: createUser wraps its insert in the TOCTOU guard
        status: pass
    human_judgment: false
  - deliverable: bidirectional parity, reserved-placeholder guard, pinned payload shape (IN-01)
    verification:
      - kind: tests
        ref: test/error-codes.test.mjs#reverse parity: every catalogued err.* code is emitted by server.js or allowlisted as client-side
        status: pass
      - kind: tests
        ref: test/error-codes.test.mjs#reserved placeholder guard: no err.* value interpolates a control field of the payload
        status: pass
      - kind: tests
        ref: test/error-codes.test.mjs#payload shape: the alreadyMember error payload is flat error/code/email/name with no params field
        status: pass
    human_judgment: false
  - deliverable: French toasts render without literal braces in a real browser
    human_judgment: true
    rationale: the fr interpolation is proved at the unit/integration level (rendered string asserted brace-free); the in-browser toast path is phase 10 UAT territory
---

# Phase 9 Plan 4: Coded error transport & bidirectional parity Summary

Closed the three critical error-surface gaps (CR-01, CR-02) plus WR-05/WR-06/IN-01/IN-03: every thrown httpError now carries its catalogued machine code, error interpolation params travel flat in the payload and render translated without literal braces, the 413 actually reaches the client, and the signup race maps to 409 accountExists — all pinned by 11 new tests including a reverse-parity guard that would have caught CR-01.

## Accomplishments

- **CR-02 / IN-03 (Task 1, 4058b34):** `api.js` `call()` passes the entire error payload as tErr vars (`tErr(data.code, data, data?.error)`) instead of the always-undefined `data.params`; `modals.js` invite rows consume the same flat transport (`tErr(l.code, l, l.error || '')`); `server.js` `inviteForOtherEmail` now carries `{ email }`. Proved end-to-end on a real server: the alreadyMember 409 ships `{ error, code, email, name }` flat and `tErr` renders the fr phrase with zero `{`/`}` characters.
- **CR-01 / WR-05 / WR-06 (Task 2, 13804a9):** the 8 thrown httpError sites (lastPrivateMember 715, workspaceNotFound 727, noWorkspaceReady 963, enterValidEmail 984, passwordTooShort 985, accountExists 986, bodyTooLarge 1167, invalidJson 1178) emit their catalogued codes with English messages byte-identical. `readJson` now drains an oversized body instead of destroying the socket, so the client receives the full 413 bodyTooLarge response. `createUser` wraps its insert: a UNIQUE violation maps to 409 accountExists (identical message/code to the pre-check), other SQL errors rethrow to the catch-all (D-03).
- **IN-01 (Task 3, 695e8c4):** the parity test is now bidirectional — every catalogued err.* code absent from server.js must appear in a commented client-side allowlist (56 entries derived by diffing, not copied); a guard asserts no err.* value in en.json or fr.json interpolates a payload control field ({error}, {code}, {status}, {ok}, {data}, {needsSignIn}, {suggestion}, {revision}); a dedicated payload-shape test pins the exact alreadyMember keys and rejects a `params` field (option-1 regression detector).

## Verification

- `node --test test/error-codes.test.mjs` — 20/20 pass (11 pre-existing + 9 new; the plan's floor of 17 names all pinned by marker)
- `npm test` — 419 tests, 418 pass, 1 pre-existing skip, 0 fail (real servers)
- `npm run build` — green, prebuild i18n scan untouched (no client literal added)
- Task 2 verify greps pass: accountExists httpError count exactly 2 (pre-check + TOCTOU catch); lastPrivateMember code argument present
- English messages byte-identical: diff touches only third code arguments, readJson internals and the createUser try/catch

## Deviations from Plan

**1. [Rule 3 - Blocker] alreadyMember integration setup restructured (invite → accept → re-invite)**
- **Found during:** Task 1 (RED test)
- **Issue:** the plan's sketch ("create a second account, post an invitation for the existing member's email") returns 201, not 409 — an existing account is not a member until it accepts an invite; the alreadyMember branch keys on membership.
- **Fix:** the test first invites, the second account accepts, then the re-invite hits the 409 branch. Same contract proved.
- **Files modified:** test/error-codes.test.mjs
- **Commit:** 4058b34

**2. [Rule 3 - Blocker] lastPrivateMember test uses memberId in the doc roster and userId on the DELETE path**
- **Found during:** Task 2
- **Issue:** first attempt passed the roster `id` to the DELETE endpoint, which looks up a *user* id (`select * from users where id = ?`) → 404 notAMember.
- **Fix:** project members list carries `target.memberId`; the DELETE path carries `target.userId`.
- **Files modified:** test/error-codes.test.mjs
- **Commit:** 13804a9

**3. [Rule 3 - Blocker] Reverse-parity allowlist grew by three api.js-composed codes**
- **Found during:** Task 3
- **Issue:** the initial diff missed that err.revokeInvite / err.removeMember / err.deleteWorkspace are consumed in api.js, not server.js — the test correctly failed on them.
- **Fix:** added the three entries to the allowlist with their one-line justifications (the guard worked as designed).
- **Files modified:** test/error-codes.test.mjs
- **Commit:** 695e8c4

**Total deviations:** 3 auto-fixed (all Rule 3 test-setup blockers; zero production-code deviations). **Impact:** none on the contract — the gaps were in the plan's test sketches, not in the shipped behaviour.

## Issues Encountered

None outstanding.

## Next

Ready for 09-05. Gap coverage complete: CR-01, CR-02, WR-05, WR-06, IN-01, IN-03.