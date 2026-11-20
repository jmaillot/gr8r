---
phase: 79-governance-surface
plan: 79-03
subsystem: governance-client
tags: [governance, operator, relocation, i18n, client-surface-tests]
requires: [79-02]
provides: [single-operator-management-surface, settings-operator-removal]
affects: [governance, settings, members]
tech-stack:
  added: []
  patterns: [markup-relocation-verbatim, dead-wiring-grep-guard]
key-files:
  created: []
  modified:
    - src/pages/governance.js
    - src/pages/settings.js
    - src/actions/actions.js
    - test/governance-client.test.mjs
    - test/creation-gate-client.test.mjs
key-decisions:
  - "settings.operator.* locale keys reused verbatim — no rename (planner discretion: avoids a 5-catalogue key migration for zero user value)"
  - "operatorCard markup moved verbatim (7 data-a sites follow it — data-a baseline 572 unchanged, net zero)"
  - "refreshOperatorUsers() name and actions kept in actions.js as governance-path wiring; only the dead sessions-tab mount call removed (Pitfall 9)"
requirements-completed: [WSG-09]
coverage:
  - id: D1
    description: "operatorCard relocated into governance.js as the Operators sblock, rendered only for isInstanceAdmin"
    requirement: WSG-09
    verification:
      - kind: unit
        ref: "test/governance-client.test.mjs#governance.js mounts the Operators sblock: settings.operator.title + promote/demote/revoke rows"
        status: pass
      - kind: unit
        ref: "test/governance-client.test.mjs#the governance page renders the Operators section only for isInstanceAdmin (WSG-09, D-11/D-112)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Settings carries zero operator remnants — no card, no mount call, no stage references"
    requirement: WSG-09
    verification:
      - kind: unit
        ref: "test/governance-client.test.mjs#settings.js carries zero operatorCard/refreshOperatorUsers/operator-stage remnants (D-01)"
        status: pass
      - kind: other
        ref: "grep -qE 'operatorCard|refreshOperatorUsers' src/pages/settings.js → exit 1 (zero matches)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Promote/demote/revoke still work end-to-end through the unchanged Phase 78 endpoints; lastOperator 409 surfaces as err toast via existing key"
    requirement: WSG-09
    verification:
      - kind: unit
        ref: "test/governance-client.test.mjs#the relocated promote/demote/revoke actions invoke the unchanged Phase 78 api methods"
        status: pass
      - kind: unit
        ref: "test/governance-client.test.mjs#the lastOperator 409 code surfaces as an err toast using the existing err.lastOperator key in all 5 catalogues"
        status: pass
    human_judgment: true
    rationale: "Source-assertion suite proves the wiring and endpoint continuity statically; a live promote/demote round-trip in a browser session is a human UAT step (server-side behavior itself is covered by the Phase 78 governance.test.mjs suite, untouched here)"
metrics:
  duration: 7min
  completed: 2026-11-20
status: complete
estimate:
  tokens: 80000
  tasks: 2
actuals:
  tokens: 13000
  tasks: 2
  commits: 3
plan_head_before: 54889c1b8a89335a4823e6144a418031353a1840
plan_head_after: e2fd3b45
---

# Phase 79 Plan 03: Operator Card Relocation Summary

**operatorCard promote/demote/revoke UI relocated verbatim from Settings into the governance page as its Operators section — Settings stripped to zero remnants, Phase 78 endpoints untouched, full suite 1954 pass / 0 fail.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-11-20T07:40:08Z
- **Completed:** 2026-11-20T07:47:14Z
- **Tasks:** 2 (+ RED sub-commit)
- **Files modified:** 5

## Accomplishments

- operatorCard() lives only in src/pages/governance.js (Operators sblock beneath Workspaces), mounted only for `api.user?.isInstanceAdmin`, with the in-render refresh kick covering boot-time deep links
- settings.js carries zero pointer remnants: no card function, no mount site, no D-90 stage references; the dead sessions-tab `refreshOperatorUsers()` fetch removed from A.go (Pitfall 9)
- `settings.operator.*` locale keys reused verbatim — catalogue parity untouched, zero key migration
- Full baseline pins held: data-a 572 / data-r 62 / data-v 91 / ROUTE_IDS 21, lint clean, i18n-scan exit 0, catalogue 27/27

## Task Commits

1. **Task 1 (RED pins)** - `1eebb794` (test)
2. **Task 1 (relocation)** - `cc6b0bae` (feat)
3. **Task 2 (WSG-09 behavior pins + wave gate)** - `e2fd3b45` (test)

## Files Created/Modified

- `src/pages/governance.js` — operatorCard relocated verbatim (D-90 stages intact), section gated on the server payload, refresh kick added
- `src/pages/settings.js` — operatorCard + its doc block + the sessions-tab mount removed; auditTrailCard comment updated
- `src/actions/actions.js` — dead sessions-tab refreshOperatorUsers mount call removed; comments updated to the governance path; actions themselves unchanged (they already refetch via refreshOperatorUsers)
- `test/governance-client.test.mjs` — 6 new pins (3 relocation + 3 WSG-09 behavior)
- `test/creation-gate-client.test.mjs` — legacy Phase 78 settings-source pin follows the relocation

## Decisions Made

- Keys reused verbatim under `settings.operator.*` (no governance-namespace rename) — catalogue parity stays green with zero migration risk
- `refreshOperatorUsers()` kept as the exported actions.js wiring consumed by governance.js — the acceptance grep allows actions.js as governance-path wiring
- Markup moved verbatim including the 7 `data-a` sites — net-zero movement keeps the 572 baseline pin green without touching it

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Legacy creation-gate-client pins read settings.js for the relocated markup**
- **Found during:** Task 1 (GREEN)
- **Issue:** `test/creation-gate-client.test.mjs` (Phase 78 suite) asserts `settings.js` source contains operatorPromote/D-90 markup — the relocation breaks those pins
- **Fix:** the pin now reads `src/pages/governance.js` (documented in-test with the D-01 note)
- **Files modified:** test/creation-gate-client.test.mjs
- **Verification:** creation-gate-client 46/46 pass
- **Committed in:** cc6b0bae

---

**Total deviations:** 1 auto-fixed (1 blocking test-pin follow)
**Impact on plan:** None on behavior — the pin tracks the same assertions against the new home of the markup.

## Issues Encountered

None — the plan's "documented webhook-events failure" did not materialize; the full suite ran 0 fail / 13 skip (baseline-consistent, +6 tests over wave 2).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- WSG-09 complete: the governance page is the single operator-management surface
- No new locale keys, no api.js/server.js changes (`git diff` clean on both)
- Phase 79 all plans executed; ready for verify-work / phase verification

---
*Phase: 79-governance-surface*
*Completed: 2026-11-20*
