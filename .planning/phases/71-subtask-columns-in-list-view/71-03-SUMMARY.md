---
phase: 71-subtask-columns-in-list-view
plan: 03
subsystem: [ui]
tags: [css, list-view, subtasks, alignment, gap-closure, source-contract-tests]

requires:
  - phase: 71-02
    provides: subrow grid-track geometry (grid join via --cols, .subhead indent mechanism, section-6 pins)
provides:
  - G-71-1 closed — .subrow > .c-meta cells carry the same 8px horizontal inset as parent cells (.thead > div / .trow > div)
  - grow-only section-6 pin for the padding contract + geometry guards + anchored-count decoy pin
affects: [71-VERIFICATION, future List-view CSS changes (the pinned padding contract)]

actuals:
  tokens: 743        # chars/4 over the production diff (2969 chars across src/styles/views/list.css + test/i18n-core-features.test.mjs)
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns: ["anchored full-declaration grep pin (^\\s*padding: 0 8px;$ == 3) to defeat substring decoys"]

key-files:
  created: []
  modified:
    - src/styles/views/list.css
    - test/i18n-core-features.test.mjs

key-decisions:
  - "Empty .c-meta placeholder cells share the single .subrow > .c-meta rule (padding on an empty flex cell is inert) — one uniform px-offset contract, no per-cell special cases"
  - "The webhook double-fire test failure during standing gates was proven environmental (D-27-1 window opens at 08:00 UTC; suite ran at ~06:2x UTC) via a clock-injection proof (now=10:00Z → 21/21 pass) — NOT fixed, out of scope"

patterns-established:
  - "Anchored full-declaration counting in source-contract tests: match /^[ \\t]*padding: 0 8px;[ \\t]*$/gm and pin the count, never the substring count (decoys like .grp's `padding: 0 8px 0 22px` inflate it)"

requirements-completed: [REQ-71-COLUMNS]

coverage:
  - id: D1
    description: ".subrow > .c-meta declares padding: 0 8px with display: flex / align-items: center, matching the parent cells' inset (G-71-1)"
    requirement: REQ-71-COLUMNS
    verification:
      - kind: other
        ref: "grep -nE '^[[:space:]]*padding: 0 8px;$' src/styles/views/list.css → exactly 3 lines (:28 .thead > div, :55 .trow > div, :158 .subrow > .c-meta; .grp decoy excluded)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Section-6 source-contract pin for the padding contract + geometry guards + anchored-count decoy pin"
    requirement: REQ-71-COLUMNS
    verification:
      - kind: unit
        ref: "test/i18n-core-features.test.mjs#the subrow meta cells carry the parent cells' horizontal padding (G-71-1) — node --test test/i18n-core-features.test.mjs 25/25 pass"
        status: pass
    human_judgment: false
  - id: D3
    description: "Standing gates: npm test grow-only (1736 pass baseline), lint exactly 15, i18n catalogue 1944 keys"
    requirement: REQ-71-COLUMNS
    verification:
      - kind: unit
        ref: "npm run lint → 15 problems (exact baseline); node --test i18n test → catalogue gate :218 green; npm test → 1736 pass / 1 environmental fail (see Issues)"
        status: pass
      - kind: manual_procedural
        ref: "71-UAT test 1 recheck: subtask meta content starts at the same horizontal px offset as parent cells under each column header, in a running List view"
        status: unknown
    human_judgment: true
    rationale: "The px-offset fix is cosmetic and visual — the CSS contract is pinned by tests, but the user's UAT re-approval in a running List view is a human judgment (deferred to /gsd-verify-work)."

duration: 15min
completed: 2026-11-18
status: complete
---

# Phase 71 Plan 03: Gap closure — subtask meta cell horizontal padding (G-71-1) Summary

**Subtask meta cells now sit at the same horizontal px offset as the parent task's cells under each column header: one CSS rule (`padding: 0 8px` on `.subrow > .c-meta`) plus a grow-only source-contract pin, closing the cosmetic gap G-71-1 reported in 71-UAT.**

## Performance
- **Duration:** ~15min
- **Started:** 2026-11-18T~05:55Z
- **Completed:** 2026-11-18T06:13Z
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments
- G-71-1 closed at the CSS level: `.subrow > .c-meta` gains `padding: 0 8px`, `display: flex`, `align-items: center` — mirroring the `.thead > div` / `.trow > div` parent-cell convention (D-71-1). Empty `.c-meta` placeholder cells share the same rule (padding is inert on an empty flex cell), keeping the px-offset contract uniform with no per-cell special cases.
- Section-6 test block extended grow-only with one new pin: the padding contract, geometry guards reinforcing the 71-02 verified rules (`gap: 0`, `padding-left: 64px`, `margin-left: var(--ind, 0px)`), and an anchored full-declaration count pin (`== 3`) that cannot be inflated by the `.grp` decoy (`padding: 0 8px 0 22px`).
- All automatable standing gates green: lint exactly 15 pre-existing errors; i18n catalogue gate intact at 1944 keys; `node --test test/i18n-core-features.test.mjs` 25/25 pass; full `npm test` shows 1736 pass with the single failure proven environmental (see Issues).

## Task Commits
1. **Task 1: Give .subrow > .c-meta cells the parent cells' horizontal padding in list.css (G-71-1)** - `fc1f88c` (fix)
2. **Task 2: Pin the padding contract in the section-6 test block (grow-only) and run the standing gates** - `a182b00` (test)

## Files Created/Modified
- `src/styles/views/list.css` — new `.subrow > .c-meta` rule (8px horizontal inset + flex centering) with a comment noting it mirrors the parent-cell padding contract (D-71-1 / G-71-1); placed adjacent to the Phase-71 subrow block; no 71-02 rule touched.
- `test/i18n-core-features.test.mjs` — one new test in section 6: padding pin + geometry guards + anchored-count decoy pin; all existing pins (1944-key catalogue gate, board-popover regression, 71-02 alignment pins) intact.

## Decisions Made
- Empty `.c-meta` placeholder cells share the single `.subrow > .c-meta` rule rather than a separate rule — the plan's stated rationale (inert padding on empty flex cells; one uniform contract) applied as written.
- The `.subrow > .c-meta` rule was added as a NEW rule (no prior `.subrow > .c-meta` rule existed in list.css) placed immediately before the ADR-5 `.subhead` block, matching the plan's "add one rule adjacent to the Phase-71 subrow block" instruction.

## Deviations from Plan
None - plan executed exactly as written.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** none.

## Issues Encountered
**One standing-gate anomaly, proven environmental and out of scope:** `npm test` reports 1 failure — `webhook-events.test.mjs` "exactly ONE due.reminder delivery per reminder claim (no double-fire)" (0 claim rows vs 1). Root cause: the D-27-1 reminder window opens at the 08:00 tick in the assignee's stored tz (UTC fixture default → 08:00 UTC); the suite ran at ~06:2x UTC, before the window, so the reminder pass emits nothing. The test is deterministic-pass at any UTC time ≥ 08:00. **Proof (clock injection, temp copy never committed):** re-running the identical test with the reminder-pass `now` set to `2026-11-18T10:00:00.000Z` yields 21/21 pass and exactly one `due.reminder` ledger row. The failure is unrelated to this plan's diff (list.css + test pins only; 21-02 measured the 0-fail baseline while UTC was past 08:00). Not fixed — modifying gates/tests is outside this plan's scope and the standing constraint forbids gate edits; it self-heals on any suite run after 09:00 CET.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three Phase-71 plans executed; the only remaining item is the human cosmetic recheck of 71-UAT test 1 (subtask meta content at the same px offset as parent cells in a running List view) — route through /gsd-verify-work.
- No blockers. Renderer/task-list plumbing untouched as planned (71-01/71-02 verified code not re-touched).

---
*Phase: 71-subtask-columns-in-list-view*
*Completed: 2026-11-18*
