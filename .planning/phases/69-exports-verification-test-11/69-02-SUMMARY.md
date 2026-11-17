---
phase: 69-exports-verification-test-11
plan: 02
subsystem: export-tests
tags: [export, fixtures, csv, mspdi, xlsx, uat-samples, 3-level-hierarchy]
requires:
  - phase: 69-exports-verification-test-11
    provides: "3-level fixture shape (t_x13, flat parentId walker contract) and writer-depth semantics proven by plan 01"
provides:
  - "3-level p_alpha fixture branch (t_a13) in the makeDoc sample chain"
  - "Standalone UAT sample generator emitting project-{en,fr}.{xml,xlsx,csv} with the 3-level tree embedded"
  - "Generator self-check that fails loudly if a future edit flattens the tree"
affects: []
tech-stack:
  added: []
  patterns:
    - "generator self-check via node:assert/strict (exit non-zero on flat samples)"
    - "grow-only fixture extension (no existing task shape modified)"
key-files:
  created: []
  modified:
    - test/fixtures/export-fixtures.mjs
    - test/make-export-samples.mjs
    - test/export-model.test.mjs
key-decisions:
  - "opts.subtasks:true added to the generator — DEFAULT_OPTIONS.subtasks is false, so without it the samples silently flatten and the self-check could never pass"
  - "Self-check inline in the generator (node:assert/strict, zero-dep) rather than a suite extension — suites stay focused on writer behavior (plan's stated preference)"
requirements-completed: [REQ-EXP-02, NFR-01]
coverage:
  - id: D1
    description: "makeDoc's p_alpha carries the 3-level flat-subtask tree (t_a13) without modifying existing task shapes"
    verification:
      - kind: unit
        ref: "test/export-model.test.mjs (full suite green: 142/142 across the four export suites)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Generator writes project-{en,fr}.{xml,xlsx,csv} into test-results/export-samples/ in one standalone run"
    verification:
      - kind: other
        ref: "command: node test/make-export-samples.mjs && ls test-results/export-samples/ (all 6 files, non-zero sizes)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Samples provably carry the 3-level tree: OutlineLevel 2 in xml, 3-segment dotted keys in csv, deepest subtask title present"
    verification:
      - kind: other
        ref: "command: grep -c <OutlineLevel>2 test-results/export-samples/project-en.xml (=1) ; grep -cE \\.d+\\.d+ project-en.csv (=2) ; ALPHA-13.1.1 row confirmed"
        status: pass
    human_judgment: false
  - id: D4
    description: "Generator fails loudly (non-zero exit) if a future edit flattens the tree (self-check)"
    verification:
      - kind: unit
        ref: "test/make-export-samples.mjs#self-check (node:assert/strict on dotted key + OutlineLevel 2, executed on every run)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Standing gates hold: npm test green, lint at baseline, zero new dependencies"
    verification:
      - kind: unit
        ref: "command: npm test (1726 tests, 1713 pass, 0 fail, 13 pre-existing skips) ; npm run lint (15 = exact baseline)"
        status: pass
    human_judgment: false
metrics:
  duration: ~7 min
  completed: 2026-11-17
status: complete
actuals:
  tokens: 1100
  tasks: 2
  commits: 2
commits: 2
plan_head_before: a7fce0d388807c5edc3667b114462fa65e3e683b
plan_head_after: 0e519b6
---

# Phase 69 Plan 02: Owner UAT sample set Summary

One standalone generator run now produces the owner's deterministic UAT import set — project-{en,fr}.xlsx/.xml/.csv with the 3-level tree embedded — with a built-in self-check that fails loudly if the tree ever flattens.

## Performance

- **Duration:** ~7 min
- **Started:** 2026-11-17T08:46:54Z
- **Completed:** 2026-11-17T08:53:04Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- makeDoc's p_alpha carries the 3-level tree (t_a13, flat `{id,parentId,position,title,done}` shape from plan 01) — grow-only, no existing task shape touched
- Generator emits CSV samples per locale via the zero-dep `toCsv` writer alongside the existing xlsx/xml outputs (research open question 2 resolved)
- Generator self-check asserts a 3-segment dotted key in the model rows and `<OutlineLevel>2</OutlineLevel>` in the MSPDI string — exit non-zero on a flat sample set (node:assert/strict, NFR-01)
- Sample files generated in test-results/export-samples/ (gitignored): 6 files, en+fr, sizes 14956/18265/1713 bytes

## Task Commits

1. **Task 1: 3-level p_alpha fixture + CSV output in the generator** - `dea680f` (test)
2. **Task 2: generator self-check for the 3-level signals** - `0e519b6` (test)

## Files Created/Modified
- `test/fixtures/export-fixtures.mjs` - t_a13 'Deep tree task' added to makeDoc's p_alpha (3-level flat subtasks, dates, desc, partial completion)
- `test/make-export-samples.mjs` - toCsv import, `subtasks: true` option, CSV write per locale, inline 3-level self-check
- `test/export-model.test.mjs` - two progress-rollup pins updated 2/11 → 2/12 (new top-level row)

## Decisions Made
- Enabled `subtasks: true` in the generator's opts: `DEFAULT_OPTIONS.subtasks` is false, so the existing opts would have silently produced flat samples — the self-check could never pass without it.
- Self-check placed inline in the generator (plan's preferred option) rather than extending a suite — keeps the export suites focused on writer behavior and makes the guard run on every generation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Two model-suite progress rollup pins broke on the new fixture row**
- **Found during:** Task 1 (verify stage)
- **Issue:** t_a13 raises p_alpha's exported top-row count 11 → 12 while done stays 2, so the pinned `Math.round((2/11)*100)` progress assertions in export-model.test.mjs (lines 197 and 351) saw 17 instead of 18.
- **Fix:** Pins updated to `Math.round((2/12)*100)` — the assertions still pin the raw 0-100 rollup semantics; only the arithmetic base follows the grow-only fixture.
- **Files modified:** test/export-model.test.mjs
- **Verification:** export-model suite green (47/47)
- **Committed in:** dea680f (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug).
**Impact on plan:** Pin update is the mechanical consequence of the planned fixture growth — no scope creep. The `subtasks: true` generator option is required by the plan's own done-criteria (samples must carry the tree) and is counted as task work, not a deviation.

## Verification

- `node --test test/export-{model,csv,xlsx,mspdi}.test.mjs` — 142 tests, 142 pass
- `node test/make-export-samples.mjs` — exit 0, 6 files in test-results/export-samples/
- `grep -c "<OutlineLevel>2</OutlineLevel>" project-en.xml` = 1; `grep -cE "\.[0-9]+\.[0-9]+" project-en.csv` = 2; `ALPHA-13.1.1;Sub A.1 (deepest)` row confirmed in the CSV
- `npm test` — 1726 tests, 1713 pass, 0 fail (13 pre-existing skips; grow-only baseline)
- `npm run lint` — 15 errors = exact baseline (NFR-02)
- Zero new dependencies (NFR-01); generator imports only fixture factories, pure writers and i18n `tFor`

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Owner has the complete deterministic UAT sample set from one generator run (D-69-5): `node test/make-export-samples.mjs` regenerates all 6 files
- Wave 3 (owner's manual MS Project UAT) can proceed; plan 69-03 remains

---
*Phase: 69-exports-verification-test-11*
*Completed: 2026-11-17*

## Self-Check: PASSED

- Files exist: test/fixtures/export-fixtures.mjs, test/make-export-samples.mjs, test/export-model.test.mjs verified via git log of the two commits.
- Commits exist: dea680f, 0e519b6 on main; measured 2 commits over ledger base a7fce0d.
- All plan-level `<verification>` commands re-run green at close (results logged above).
