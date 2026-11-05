---
phase: 38-daily-digest-reminder-suppression
plan: 03
subsystem: notifications
tags: [digest, gap-closure, scope, recipient-filter, test-suite]

requires:
  - phase: 38-01/38-02
    provides: digest send path, ledger claim, suppression gate, stored-prefs accessor
provides:
  - recipient-scoped digest task filter (t.assignee === r.member_id gate, CR-01 closed)
  - multi-member recipient-scope CI pin (WR-01 closed) + addPeerMember fixture helper
  - WR-02 closed — zero tautological assertions in test/digest.test.mjs
affects: [38-VERIFICATION, verify-work, phase-39-audit]

actuals:
  tokens: 1200
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Recipient gate before content computation: assignee===recipient as FIRST filter, then the shared visibility pipeline (D-06) — no second filter"

key-files:
  created: []
  modified:
    - server.js
    - test/digest.test.mjs

key-decisions:
  - "CR-01 fix is a one-line recipient gate + corrected SCOPE-04 comment; remindable() + the three assignee-keyed scope checks stay untouched and now evaluate against the recipient (D-06, no second pipeline)"
  - "Task 3 deviation (Rule 1): the plan's proposed `resB.digests === 0` was falsified by correct overdue catch-up (ws's 01-15 tasks are overdue on the 01-16 pass) — pinned to === 1 with a wsB-contributes-zero rationale instead"

requirements-completed: [DIGEST-01]

coverage:
  - id: D1
    description: "Digest content is recipient-scoped: a recipient receives only their own, visibility-permitted due-today/overdue tasks; another member's tasks and out-of-scope private-project titles/deep links never appear"
    requirement: DIGEST-01
    verification:
      - kind: integration
        ref: "test/digest.test.mjs#CR-01: a digest recipient receives ONLY their own, in-scope tasks — never another member's tasks or out-of-scope titles"
        status: pass
      - kind: other
        ref: "RED proof: pin failed at 119f0b3 (M2 received K-A1) before the server.js gate, passes after 8d9da8b"
        status: pass
    human_judgment: false
  - id: D2
    description: "WR-01 closure — the multi-member pin makes the CR-01 leak CI-observable (fails before fix, passes after)"
    verification:
      - kind: other
        ref: "node --test test/digest.test.mjs — RED run failed with only the new pin (10 existing green); GREEN run 11/11"
        status: pass
    human_judgment: false
  - id: D3
    description: "WR-02 closure — the four vacuous assertion sites (246/248/279/351) assert real, falsifiable conditions; zero `|| true` / `? 0 : 1` remain"
    verification:
      - kind: unit
        ref: "grep -cE '\\|\\| true|\\? 0 : 1' test/digest.test.mjs → 0; node --test test/digest.test.mjs 11/11; npm run i18n:scan clean"
        status: pass
    human_judgment: false
  - id: D4
    description: "Reminder loop + suppression surfaces untouched (DIGEST-02/DIGEST-03 not re-opened)"
    verification:
      - kind: integration
        ref: "node --test test/due-reminders.test.mjs — 17/17 pass"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-11-04
status: complete
---

# Phase 38 Plan 03: CR-01 Gap Closure Summary

**Recipient-scoped digest filter (`t.assignee === r.member_id` gate) closing the CR-01 confidentiality leak, proven red-before/green-after by a multi-member CI pin, plus WR-02 tautology cleanup**

## Performance

- **Duration:** 4 min
- **Started:** 2026-11-04T20:00:56Z
- **Completed:** 2026-11-04T20:04:56Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments
- CR-01 closed: the digest task loop gates on `t.assignee !== r.member_id → continue` as its first statement; with the gate, the existing SCOPE-04 checks evaluate against the RECIPIENT's membership (one visibility pipeline, D-06) — no titles or deep links for tasks the recipient cannot read
- WR-01 closed: new multi-member pin (`addPeerMember` helper seeds a second user + scope-restricted membership + roster entry) asserts M2's payload lists only their own in-scope task and excludes the owner's K-A1/K-A2; it failed red at 119f0b3 (M2 received K-A1) and passes after 8d9da8b
- WR-02 closed: all four vacuous assertion sites replaced with falsifiable pins; `grep -cE '\|\| true|\? 0 : 1'` → 0

## Task Commits

1. **Task 1: RED — multi-member recipient-scope pin** - `119f0b3` (test)
2. **Task 2: GREEN — recipient gate in server.js** - `8d9da8b` (fix)
3. **Task 3: WR-02 — real assertions** - `0f9c487` (test)

## Files Created/Modified
- `server.js` — digest task loop gate + corrected SCOPE-04 comment (digest block only; reminder loop byte-identical)
- `test/digest.test.mjs` — `addPeerMember` helper, CR-01 pin, four rewritten WR-02 assertions

## Decisions Made
- Kept the fix minimal: one-line predicate + comment edit; no digest-specific visibility predicate added (a second pipeline was forbidden by the plan and D-06)
- Scope-restricted the peer membership via `scope = {"teams":[],"projects":["p1"]}` and made p-private `private: true` with the owner on its access list — reproduces both leak vectors (non-assignee + out-of-scope) through the assignee-keyed checks

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan's proposed `resB.digests === 0` assertion was false**
- **Found during:** Task 3 (WR-02 line 248 replacement)
- **Issue:** On the 2026-01-16 pass the FIRST workspace's 01-15-dated tasks are overdue, so it legitimately sends an overdue catch-up digest (correct D-01/D-02 behavior) — `resB.digests` is 1, not 0. The eliminated tautology had been masking a wrong expected value.
- **Fix:** Pinned `resB.digests === 1` with the message "only ws's overdue catch-up digest fires — wsB (no stored opt-in row) contributes zero sends"; wsB's zero-contribution is still proven by its own ledger-key and no-email assertions.
- **Files modified:** test/digest.test.mjs
- **Verification:** node --test test/digest.test.mjs → 11/11
- **Committed in:** 0f9c487

---

**Total deviations:** 1 auto-fixed (1 bug — plan-specified assertion value falsified by correct product behavior)
**Impact on plan:** None beyond the corrected expected value; the deliverable (falsifiable, real assertion at site 248) is intact.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- DIGEST-01's content violation un-blocked; all three gap items from 38-VERIFICATION.md (`missing:` 1-3) closed
- Phase 38 ready for re-verification by the orchestrator (`/gsd-verify-work 38`); DIGEST-02/DIGEST-03 surfaces untouched (suppression, prefs, mailer, locales byte-identical)

---
*Phase: 38-daily-digest-reminder-suppression*
*Completed: 2026-11-04*

## Self-Check: PASSED

- server.js, test/digest.test.mjs, 38-03-SUMMARY.md exist on disk
- 5 commits measured from plan base 3ec88af: 119f0b3, 8d9da8b, 0f9c487, 6eda97e, bba98be
- Full verification re-run green: digest suite 11/11, due-reminders 17/17, WR-02 greps 0, gate present at server.js:1500, i18n:scan clean
