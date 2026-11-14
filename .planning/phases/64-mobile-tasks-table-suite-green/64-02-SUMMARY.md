---
phase: 64-mobile-tasks-table-suite-green
plan: 02
subsystem: ui
tags: [css, responsive, mobile, playwright, e2e]

requires:
  - phase: 64-mobile-tasks-table-suite-green
    provides: 900px-tier CSS contract (.only-m/.hide-m/[data-pop=cols]) + dedicated mobile spec from 64-01
provides:
  - Wrap-everything card stack at ≤900px (.only-m .panel * overflow-wrap:anywhere — D-08)
  - 390px toolbar anti-squeeze (.toolbar flex-shrink:0 under .page.flush flex column — D-07)
  - D-12 deterministic long-task fixture (fixed ids, 4 assignees, 200+ char unbroken title) + per-card/document-level truncation assertions in e2e/mobile-tasks-table.spec.mjs (D-09..D-12)
  - Polished mobile card template in src/views/table.js (.mcard/.mch/.mcm classes, duplicate-class bug fixed — D-05)
affects: [64-03 (suite close), future mobile card consumers]

actuals:
  tokens: 31000
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Wrap-everything scoped to a subtree (.only-m .panel, .only-m .panel * { overflow-wrap: anywhere }) instead of nowrap/ellipsis overrides"
    - "Per-card overflow measurement via locator.evaluateAll(el => el.scrollWidth - el.clientWidth) with a 2px tolerance"
    - "Flex-column anti-squeeze: .toolbar { flex-shrink: 0 } so wrapped toolbar rows push content instead of clipping under it"

key-files:
  created: []
  modified:
    - src/styles/responsive.css
    - src/views/table.js
    - e2e/mobile-tasks-table.spec.mjs

key-decisions:
  - "No nowrap/ellipsis overrides were needed: overflow-wrap:anywhere alone passed the D-11/D-12 suite — no nowrap-fighter class reaches card children at 390px"
  - "390px setViewMode click failure was diagnosed as a real D-07 bug (.page.flush fixed-height flex column squeezed the wrapped 390px toolbar to 44px, clipping the mode tabs under .list-wrap); fixed in-scope with .toolbar { flex-shrink: 0 } in the 900px tier"
  - "D-12 fixture repeats the seeded owner memberId 4× for the assignee stack — deterministic, no invite-accept dependency (accept is rate-limited 5/hour/IP); labels included in the task payload for shape completeness"

patterns-established:
  - "Truncation proof = per-card scrollWidth − clientWidth ≤ 2px on every card + document-level scrollWidth ≤ clientWidth + computed-style not-nowrap/not-ellipsis — no screenshots"
  - "Card polish classes .mcard/.mch/.mcm live in the 900px tier; card template carries classes only (byte-negative vs inline styles)"

requirements-completed: [MOB-02]

coverage:
  - id: D5
    description: "Card template polished within 55-07 A1: duplicate class fixed, inline styles extracted; field set + openTask wiring untouched"
    requirement: MOB-02
    verification:
      - kind: e2e
        ref: "e2e/mobile-tasks-table.spec.mjs (3 passed after Task 2, unmodified)"
        status: pass
      - kind: unit
        ref: "npm test — 1536 tests, 1524 pass, fail 0"
        status: pass
    human_judgment: false
  - id: D6
    description: "Field set stays fixed: status/title/key/priority/assignees/name/due/estimate/progress — no new fields"
    requirement: MOB-02
    verification:
      - kind: diff
        ref: "git show 54ef06b — single template-line change, no helper additions/removals"
        status: pass
    human_judgment: false
  - id: D7
    description: "Toolbar (search/sort/new) visible while the card stack renders at 390×844, no clipped affordances"
    requirement: MOB-02
    verification:
      - kind: e2e
        ref: "e2e/mobile-tasks-table.spec.mjs#at 390px the long-task card wraps with zero overflow and the toolbar stays visible"
        status: pass
    human_judgment: false
  - id: D8
    description: "Long titles/keys/estimates wrap — never clipped, never ellipsis (computed styles asserted; no nowrap override needed)"
    requirement: MOB-02
    verification:
      - kind: e2e
        ref: "same test — computed whiteSpace/textOverflow on the fixture title"
        status: pass
    human_judgment: false
  - id: D11
    description: "Per-card horizontal overflow ≤ 2px on every .only-m .panel at 390×844"
    requirement: MOB-02
    verification:
      - kind: e2e
        ref: "same test — evaluateAll scrollWidth deltas; red proof showed 129px before the wrap rule"
        status: pass
    human_judgment: false
  - id: D12
    description: "Deterministic worst-case task (200+ char unbroken title, 4 assignees, estimate, due) seeded via real-API doc PUT"
    requirement: MOB-02
    verification:
      - kind: e2e
        ref: "spec beforeAll fixture t_mtask_long / MTASK-9"
        status: pass
    human_judgment: false

duration: 21min
completed: 2026-11-14
status: complete
---

# Phase 64 Plan 02: Card Stack Polish + 390px Truncation Suite Summary

**Wrap-everything mobile cards at ≤900px proven by a deterministic long-task suite at 390×844 — per-card overflow ≤2px, toolbar visible, titles never clipped (MOB-02, D-05..D-08, D-09..D-12)**

## Performance

- **Duration:** 21 min
- **Started:** 2026-11-14T17:05:00Z
- **Completed:** 2026-11-14T17:26:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- **Task 1 (tracer, TDD):** truncation test written first and proven red at the intended assertion (fixture card overflowed by 129px before any CSS). Green via two terse 900px-tier rules: `.only-m .panel, .only-m .panel * { overflow-wrap: anywhere }` (D-08 wrap-everything, scoped — no app-wide nowrap overturn) and `.toolbar { flex-shrink: 0 }` (D-07 anti-squeeze). Suite: 3 passed at retries=0.
- **Task 2:** card template polished in the 55-07 A1 pattern — duplicate `class` attribute fixed so `.muted` actually applies; repeated inline styles extracted into `.mcard/.mch/.mcm` classes in the 900px tier (byte-negative: chunk 498.11 kB, was 498.24 kB). Field set, `data-a="openTask" data-id` wiring, helper signatures and the fixed 64px progress span untouched. Triad green: build + chunk gate, 1536 unit tests (1524 pass / 0 fail), mobile spec 3 passed unmodified.

## Task Commits

1. **Task 1: Wrap-everything polish + D-12 long-task truncation suite** — `06857b5` (fix)
2. **Task 2: Card template polish in table.js** — `54ef06b` (fix)

**Plan metadata:** `docs(64-02): complete plan`

## Files Created/Modified
- `src/styles/responsive.css` — 900px tier: overflow-wrap:anywhere scoped to the card stack; `.toolbar { flex-shrink: 0 }`; `.mcard/.mch/.mcm` polish classes
- `src/views/table.js` — one template line: duplicate-class fix + class-only card markup (no signature/field/wiring changes)
- `e2e/mobile-tasks-table.spec.mjs` — D-12 fixture (fixed ids `t_mtask_long`/`MTASK-9`, 4 assignees, 200+ char unbroken title, estimate + due) and the 390×844 truncation suite (per-card ≤2px, document guard, toolbar visible, computed-style not-nowrap/not-ellipsis)

## Decisions Made
- **Toolbar anti-squeeze is the plan's in-scope bug fix (D-07), not a deviation.** The 390px suite could not even click the table-mode tab: `.page.flush` is a fixed-height flex column, the wrapped 390px toolbar was squeezed to 44px and its `.seg` tabs clipped under `.list-wrap` (verified with bounding boxes: button bottom 238px vs toolbar bottom 218px). Diagnosed via a temporary debug block inside the spec, removed before commit.
- **No nowrap/ellipsis overrides added.** Acceptance allowed overriding nowrap fighters reaching card children, but `overflow-wrap: anywhere` alone satisfied every assertion — the leanest possible diff.
- **4 assignees via repeated owner memberId** in the fixture — deterministic and free of the invite-accept rate limit (5/hour/IP) that 3 fresh member accounts would have burned.

## Deviations from Plan

None - plan executed exactly as written (the toolbar flex-shrink fix landed in Task 1's declared file responsive.css against D-07, an explicitly planned truth).

## Issues Encountered
- First red run timed out at the `setViewMode` click (list-wrap intercepting pointer events over the toolbar tabs — see the D-07 diagnosis above); the wrap-rule red was then proven at the correct truncation assertion.
- Server-side "login failed" WARN noise persists from 64-01; all runs green with retries=0.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- 64-03 can run the full close sweep; the mobile spec now carries 3 tests (boundary, desktop-unchanged, 390px truncation) and the card stack renders MOB-02-clean at 390×844.
- `npm run build` before `npm run e2e` remains a hard prerequisite (dist-stamp guard).

---
*Phase: 64-mobile-tasks-table-suite-green*
*Completed: 2026-11-14*
