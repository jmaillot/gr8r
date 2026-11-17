---
phase: 69-exports-verification-test-11
plan: 03
subsystem: exports-verification
tags: [export, uat, mspdi, verification, a1-closure, test-11, diagnostic-matrix]
requires:
  - phase: 69-exports-verification-test-11
    provides: "plan 02 UAT sample set (project-{en,fr}.{xml,xlsx,csv}) + plan 01 green pre-screen"
provides:
  - "MSPDI owner UAT verdict: PASS (18/18 rows exact — hierarchy AND dates survive the real MS Project round-trip)"
  - "MSPDI subtask emission shape proven: child rows = Manual=0 + Type=0 (Fixed Units) + real PercentComplete, canonical element order with WBS/OutlineNumber/OutlineLevel trio"
  - "69-VERIFICATION.md with the full FAIL→fix→re-UAT history, per-format dispositions, and A1 closure"
  - "Diagnostic tooling: test/make-diagnostic-xml.mjs (8-variant shape matrix)"
affects: [export/mspdi.js]
tech-stack:
  added: []
  patterns:
    - "diagnostic-matrix debugging: one import with N controlled variants isolates the field MS Project honors, replacing trial-and-error UAT rounds"
key-files:
  created:
    - .planning/phases/69-exports-verification-test-11/69-VERIFICATION.md
    - .planning/phases/69-exports-verification-test-11/gant.png
    - test/make-diagnostic-xml.mjs
  modified:
    - export/mspdi.js
    - test/export-mspdi.test.mjs
key-decisions:
  - "Subtask rows emit Manual=0 + Type=0 (Fixed Units): the owner's 8-variant diagnostic import proved MS Project re-derives Type=1 auto rows from zero on OutlineLevel rows while Type=0 keeps the emitted duration — Type, not PercentComplete, was the decisive field"
  - "Top-level rows keep Manual=1 + Type=1 (honored by every round, incl. manual-summary rollup semantics)"
  - "Canonical Task element order (real Project 2016 export as ground truth): Manual before Type; WBS+OutlineNumber+OutlineLevel trio before Start; Manual* after Duration; Notes before PredecessorLink/ExtendedAttribute"
  - "xlsx/CSV recorded as N/A (non-verdict channels, owner confirmation) rather than expected-flat observations"
requirements-completed: [REQ-EXP-02, REQ-EXP-03]
coverage:
  - id: V1
    description: "Owner imported project-en.xml into MS Project Desktop (XML Import Wizard, as new project); final re-UAT shows 18/18 rows exact (hierarchy + dates)"
    verification:
      - kind: other
        ref: "owner re-UAT round 5 table (2026-11-17); evidence gant.png (round-1 hierarchy capture) committed"
        status: pass
    human_judgment: true
  - id: V2
    description: "MSPDI verdict PASS recorded in 69-VERIFICATION.md with the full FAIL→fix→re-UAT history and D-69-8 rationale"
    verification:
      - kind: other
        ref: "grep -ciE 'PASS|FAIL' 69-VERIFICATION.md > 0; verdict table + history sections present"
        status: pass
    human_judgment: true
  - id: V3
    description: "Phase 65 item A1 + Phase 999.1 backlog entry closed"
    verification:
      - kind: other
        ref: "69-VERIFICATION.md § Item A1 closure — both check-offs explicit"
        status: pass
    human_judgment: false
  - id: V4
    description: "Task 3 (conditional FAIL-branch fix) executed end-to-end: canonical order + Type=0 subtask shape, suites green"
    verification:
      - kind: unit
        ref: "node --test export suites 142/142; npm test 1713 pass / 0 fail; element-order + Type assertions in test/export-mspdi.test.mjs"
        status: pass
    human_judgment: false
  - id: V5
    description: "Standing gates hold at close"
    verification:
      - kind: unit
        ref: "npm run lint (15 = baseline); npm run build chunk 499.94 kB ≤ 500 kB gate; zero new dependencies"
        status: pass
    human_judgment: false
metrics:
  duration: ~3.5 h (5 UAT rounds incl. diagnostic matrix)
  completed: 2026-11-17
status: complete
actuals:
  tokens: 6000
  tasks: 3
  commits: 8
commits: 8
plan_head_before: ec217aa
plan_head_after: TBD
---

# Phase 69 Plan 03: Owner UAT verdict + A1 closure Summary

The real MS Project round-trip is now proven end-to-end: the 3-level subtask tree survives AND every row carries the exact expected dates/durations (18/18) — **MSPDI verdict PASS**, Phase 65 item A1 and the Phase 999.1 backlog entry are closed. Getting there took the D-69-9 FAIL branch through five evidence-driven rounds, culminating in an owner-run diagnostic matrix that isolated `Type` as the decisive field.

## Performance

- **Duration:** ~3.5 h (5 UAT rounds incl. the diagnostic matrix)
- **Completed:** 2026-11-17
- **Tasks:** 3
- **Code changes:** export/mspdi.js (Task emission), test/export-mspdi.test.mjs (order/Type pins), test/make-diagnostic-xml.mjs (new)

## Accomplishments
- Owner UAT executed per format; MSPDI = **PASS** after the D-69-9 fix branch (xlsx/CSV = N/A with justification)
- `export/mspdi.js` Task emission aligned on the canonical Project sequence AND the diagnostic-proven subtask shape (Type=0 Fixed Units)
- 8-variant diagnostic matrix (`test/make-diagnostic-xml.mjs`) — replaced trial-and-error with one decisive import
- `69-VERIFICATION.md`: full history, verdicts, evidence, A1 + 999.1 closures
- REQ-EXP-02 + REQ-EXP-03 complete

## Task Commits

1. **Task 1: owner UAT evidence (gant.png)** - `21bf076` (docs)
2. **Task 2: 69-VERIFICATION.md verdict + A1 closure** - `21bf076` + final update (docs)
3. **Task 3: D-69-9 conditional fix branch** - `1589095` (canonical order) → `2e28ead` (auto subtasks) → `bbe7005`/`b069491` (PC/Manual exploration) → `85115e4` (Type=0 final) + `8c18d82` (diagnostic matrix) + sample regeneration commits

## Files Created/Modified
- `export/mspdi.js` — canonical Task sequence; child rows Manual=0 + Type=0 + real PC; top-level unchanged; WBS/OutlineNumber/OutlineLevel trio with dotted paths
- `test/export-mspdi.test.mjs` — canonical-order assertions, Type=0 pin on child rows, WBS=OutlineNumber pin, no-zero-duration pin
- `test/make-diagnostic-xml.mjs` — 8-variant shape matrix generator (V1–V8)
- `.planning/.../69-VERIFICATION.md`, `gant.png` — verdicts, evidence, closures

## Decisions Made
- **Diagnostic matrix over trial rounds**: after rounds 1–4 produced contradictory partial results (manual never survives; auto survives only at PC=100), one import of 8 controlled variants isolated `Type` — V6 (Type=0, PC=0) kept PT56H while every Type=1 variant zeroed. Data-faithful fix, no fake 100% progress.
- **Child rows = Project's own default mode** (Fixed Units, auto-scheduled): this is what real Project exports write and the only shape the real round-trip honors on OutlineLevel rows.
- **Ground truth discipline**: every emission change verified against a real Project 2016 export (MPXJ) + the 2007 XSD before landing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The plan's conditional fix (canonical order) was necessary but not sufficient**
- **Found during:** Task 3 re-UAT rounds 2–4
- **Issue:** canonical-order realignment alone left subtask durations zeroed; the plan anticipated at most one fix + one re-UAT.
- **Fix:** diagnostic matrix → Type=0 subtask shape; extra commits + one extra re-UAT round.
- **Verification:** owner re-UAT round 5 = 18/18 exact.
- **Committed in:** 85115e4

**2. [Rule 2 - Scope] xlsx/CSV observations were not performed by the owner**
- **Found during:** Task 2 (verdict recording)
- **Issue:** the plan expected expected-flat observations for xlsx/CSV; the owner directed N/A treatment.
- **Fix:** recorded as N/A (non-verdict channels) with justification.
- **Committed in:** 21bf076

---

**Total deviations:** 2 (1 bug-driven extension of the conditional fix; 1 owner-directed scope adjustment). **Impact on plan:** both documented; closure criteria unchanged and now met.

## Verification

- `node --test test/export-{mspdi,model,xlsx,csv}.test.mjs` — 142 tests, 0 fail
- `npm test` — 1726 tests, 1713 pass, 0 fail (13 pre-existing skips)
- `npm run lint` — 15 errors = exact baseline (NFR-02)
- `npm run build` — chunk 499.94 kB ≤ 500 kB gate (NFR-02)
- Owner re-UAT round 5 — 18/18 rows exact (criteria 1+2, D-69-9)
- Zero new dependencies (NFR-01)

## Issues Encountered
- MS Project's OutlineLevel-row re-derivation of Type=1 auto rows is undocumented; only empirical isolation (diagnostic matrix) resolved it. Recorded in 69-VERIFICATION.md for future phases.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Test 11 fully closed: pre-screen + owner UAT green end-to-end; REQ-EXP-01/02/03 proven
- Phase 69 ready to ship; milestone v2.6 goal (close A1 via a REAL MS Project round-trip) achieved

---
*Phase: 69-exports-verification-test-11*
*Completed: 2026-11-17*

## Self-Check: PASSED

- 69-VERIFICATION.md carries the explicit final PASS verdict, the FAIL→fix history, N/A xlsx/CSV rows, evidence references, and A1/999.1 check-offs.
- Evidence gant.png committed; diagnostic tooling committed (test/make-diagnostic-xml.mjs).
- All standing gates re-run green at close (results logged above).
- Commits verified on main through 85115e4 and pushed to origin.
