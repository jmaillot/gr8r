---
phase: 76-oidc-sso-doors-immunity-hardening
plan: 02
subsystem: auth
tags: [oidc, sso, domain-admission, immunity, door-matrix, node-test]

requires:
  - phase: 76-oidc-sso-doors-immunity-hardening (plan 01)
    provides: DP-4/DP-5 doors, D-11 matrix boot line, the D-12 contract suite (test/domain-admission-sso.test.mjs) and the shared fake-IdP harness
provides:
  - Three NAMED immunity rows (D-12) pinning existing-account immunity: re-login after mid-life tightening, pre-seeded linked identity under an excluding list, re-invite/accept semantics for an existing out-of-list member
  - AMENDED truth (Option B): accept-time re-validation applies to ALL admits including existing accounts — auth/logins are immune (SC2), invite acceptance never is
  - DEPLOY.md operator docs for the SSO doors (DP-4/DP-5) and the door-matrix boot line
affects: [phase 77, /gsd-verify-work, operators deploying the doors]

actuals:
  tokens: 10400
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Immunity is proven by tests ONLY — zero production changes; rows assert NEGATIVE signals (refusal-log absence, unchanged user/identity rows, used_at IS NULL)"

key-files:
  created: []
  modified:
    - test/domain-admission-sso.test.mjs
    - docs/DEPLOY.md

key-decisions:
  - "Option B (owner decision at checkpoint): immunity row 3 pinned to the OBSERVED behavior — existing member re-invited under a tightened list gets 403 inviteDomainNoLonger, invite NOT consumed, loosening revives it. The plan's pinned truth #1 ('re-invite + accept for an existing out-of-list member succeeds') is AMENDED; existing-account immunity covers authentication/logins only (SC2 scope), never invite acceptance."
  - "Row 3 fixture seeds the workspace-B invite while the door is off, then reboots tightened — DP-2 create-time refusal semantics untouched, per the plan's row-3 action."

patterns-established:
  - "Immunity rows: name must literally contain 'immunity' so a reader can point at them (D-12)"

requirements-completed: [DOM-05]

coverage:
  - id: D1
    description: "Immunity row 1 — linked identity re-login after mid-life signup-list tightening succeeds, no DP-4 refusal, rows unchanged"
    requirement: DOM-05
    verification:
      - kind: integration
        ref: "test/domain-admission-sso.test.mjs#immunity 1 — a linked identity re-logs in after mid-life tightening"
        status: pass
    human_judgment: false
  - id: D2
    description: "Immunity row 2 — pre-seeded linked identity logs in under an excluding list; lists never consulted for an established identity"
    requirement: DOM-05
    verification:
      - kind: integration
        ref: "test/domain-admission-sso.test.mjs#immunity 2 — a pre-seeded linked identity logs in under a list that excludes it"
        status: pass
    human_judgment: false
  - id: D3
    description: "Immunity row 3 (AMENDED, Option B) — accept-time re-validation refuses an existing out-of-list member's re-invite (403 inviteDomainNoLonger), invite not consumed, loosening revives it"
    requirement: DOM-05
    verification:
      - kind: integration
        ref: "test/domain-admission-sso.test.mjs#immunity 3 — an existing member re-invited to another workspace under a tightened list is refused at accept"
        status: pass
    human_judgment: false
  - id: D4
    description: "DEPLOY.md documents SSO door behavior (fresh-provision-only JIT gate, never re-checked linked identities, non-consuming reconcile) and the door-matrix boot line"
    requirement: DOM-05
    verification:
      - kind: other
        ref: "grep -c 'door matrix|sso-jit|ALLOW_SIGNUP_DOMAINS|ALLOW_INVITE_DOMAINS' docs/DEPLOY.md (count ≥ prior, task 2 verify)"
        status: pass
    human_judgment: false

duration: 32min
completed: 2026-11-19
status: complete
---

# Phase 76 Plan 02: Immunity Rows + Operator Docs Summary

**Three named immunity rows (D-12) pin existing-account immunity as test-only proof — with truth #1 amended to Option B (accept-time re-validation applies to ALL admits) — plus DEPLOY.md operator docs for the SSO doors and the door-matrix boot line.**

## Performance

- **Duration:** 32 min (including the decision checkpoint pause)
- **Completed:** 2026-11-19
- **Tasks:** 2 (task 1 completed across checkpoint continuation)
- **Files modified:** 2

## Accomplishments

- Immunity rows 1-2 committed (`e42e9c72`): linked-identity re-login after mid-life tightening, and a pre-seeded linked identity logging in under an excluding list — both assert NO 'sso signup domain refused' log and unchanged user/identity rows (SC2, admission ≠ authentication).
- Immunity row 3 written per the owner's **Option B** decision (`80ab89f4`): an existing member re-invited to another workspace while the invite list is tightened gets `403 {"code":"inviteDomainNoLonger"}`, the invite row is NOT consumed (`used_at IS NULL`), and loosening the list revives the invite. The row documents that accept-time re-validation applies to ALL admits, including existing accounts — existing-account immunity covers authentication/logins only (SC2 scope), never invite acceptance.
- DEPLOY.md SSO-door + door-matrix operator docs (`b14d4fe7`): JIT gated on fresh provision only, already-linked identities never re-checked, refused invites not consumed / revived by loosening, and the combined 'domains: door matrix' boot line.
- Zero production code changes — the plan's prohibition (immunity by construction via server.js:5112-5115 and :7952-7960, proven by tests only) remains fully enforced.

## Task Commits

1. **Task 1 (partial): immunity rows 1-2** — `e42e9c72` (test)
2. **Task 2: DEPLOY.md SSO doors + door-matrix docs** — `b14d4fe7` (docs)
3. **Task 1 (completion): immunity row 3 (Option B)** — `80ab89f4` (test)

## Files Created/Modified

- `test/domain-admission-sso.test.mjs` — "immunity (DOM-05, D-12)" section with three named rows; suite is 18 tests, all green
- `docs/DEPLOY.md` — extended domain-admission section with SSO door behavior and the door-matrix boot line

## Decisions Made

- **Option B (owner decision):** Row 3 pinned to the OBSERVED behavior rather than the plan's original truth. The plan's pinned truth #1 ("re-invite + accept for an existing out-of-list member succeeds") is **AMENDED**: an existing member re-invited under a tightened list is refused at accept with `403 inviteDomainNoLonger`, the invite is not consumed, and loosening revives it. Immunity covers authentication/logins only (SC2 scope), never invite acceptance.
- Row 3 seeds the workspace-B invite while the door is off (created before tightening), then reboots tightened — honoring the plan's row-3 action of not touching DP-2 create-time semantics.

## Deviations from Plan

### Truth Amendment (owner-approved at decision checkpoint)

**1. [Amendment - Pinned truth #1] Re-invite/accept for an existing out-of-list member does NOT succeed**
- **Found during:** Task 1 (immunity row 3)
- **Issue:** The plan's truth asserted the accept succeeds via the membership short-circuit at server.js:7952-7960; observation shows the DP-3 accept gate refuses it (`403 inviteDomainNoLonger`).
- **Fix:** Row 3 amended per Option B to pin the observed behavior (refusal + non-consumption + revival). No server.js change — the prohibition is enforced; the amendment is recorded in the test comment and this SUMMARY.
- **Files modified:** test/domain-admission-sso.test.mjs
- **Verification:** `node --test test/domain-admission-sso.test.mjs` — 18 pass, 0 fail
- **Committed in:** `80ab89f4`

---

**Total deviations:** 1 (owner-approved amendment; zero auto-fixes, zero production diffs)
**Impact on plan:** DOM-05 is still fully pinned — the contract now reflects reality: authentication is immune, acceptance is re-validated for everyone.

## Issues Encountered

None — row 3 passed on first run; all suites green (domain-admission-sso 18/18, oidc-sso + domain-admission 79/79).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- D-12 suite is complete: all five decision points (DP-1..DP-5), the D-11 inherit matrix, and the three named immunity rows live in `test/domain-admission-sso.test.mjs` — the single permanent contract file (SC5).
- Phase 76 ready for verification (`/gsd-verify-work`); DEPLOY.md is operator-ready.

---
*Phase: 76-oidc-sso-doors-immunity-hardening*
*Completed: 2026-11-19*
