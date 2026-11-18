---
phase: 71
plan: 04
subsystem: list-view-subtasks
tags: [css, e2e, gap-closure, G-71-3]
requires: [71-02, 71-03]
provides: [G-71-3 chip pill-contract alignment, inner-chip-content e2e metric]
affects: []
tech-stack:
  added: []
  patterns: [content-box x-position e2e metric, out-of-flow-first-child content measurement]
key-files:
  created: []
  modified:
    - src/styles/views/list.css
    - e2e/subtask-align.spec.mjs
decisions:
  - alignment-only fix: .stchip copies .pillbtn padding/height/radius but NOT background/hover (no visual-weight change)
  - chipInnerLeftX measures the first in-flow stchip child (.check is position:absolute, out of flow) — out-of-flow content is excluded from the metric
  - e2e must run against a FRESH `npm run build` (dist/ stale-build mask produced false pad=0 failures before rebuild)
metrics:
  duration: ~12min
  completed: 2026-11-18
status: complete
commits: 2
plan_head_before: 45e8b72f47ba33e5c12df4fc63a0a3cdb5773220
plan_head_after: 3fedacb
actuals:
  tokens: 9200
  tasks: 2
  commits: 2
---

# Phase 71 Plan 04: Gap closure — subrow status chip visual offset (G-71-3, cosmetic) Summary

**One-liner:** .subrow .c-status .stchip now carries the .pillbtn padding/height/radius contract (0 7px / var(--h-sm) / var(--r-sm)) so chip content sits at the parent pill's content x-position, pinned by 3 new grow-only e2e tests measuring inner chip content vs pill content-box edge on List, My Tasks, and depth-2.

## What Was Built

- **Task 1 (02fb2dc):** Extended `.subrow .c-status .stchip` in list.css with `padding: 0 7px`, `height: var(--h-sm)`, `border-radius: var(--r-sm)`. Background/hover intentionally NOT copied — the chip sits on the parent hover surface; alignment, not restyle. `.stchip:focus-within` ring, `.subhead` 64px tree-base margin, `.subrow > .c-meta` 8px padding, `.subrow` gap:0 contracts all unchanged.
- **Task 2 (3fedacb):** Grow-only e2e additions in subtask-align.spec.mjs — `chipInnerLeftX` helper (first in-flow `.stchip` child; the `.check` toggle is position:absolute and excluded), `chipDiag` dump (chip pad/height + pill pad), and 3 new tests asserting `|chipInnerLeftX − parentPillContentX| ≤ 1` on List, My Tasks, and depth-2. Zero existing assertions modified.

## Deviations from Plan

**1. [Baseline drift] lint reports 16 pre-existing errors, not 15**
- **Found during:** Task 1 verify
- **Issue:** Plan pinned "exactly 15" lint problems; live run shows 16 (webhook-ssrf.js:84 `'process' is not defined`). list.css is not linted, so the delta is pre-existing/stale-baseline, not caused by this plan.
- **Fix:** None applied (out of scope per scope boundary). Recorded as the new lint baseline: 16 pre-existing.
- **Files modified:** none

**2. [Environment] e2e served a stale dist/ build on first Task 2 run**
- **Issue:** The first e2e run measured `chip padding: 0px` / height 18.125px — the old bundle; the fix was absent. Rebuild via `npm run build` resolved it (6/6 green). Noted for future executors: run `npm run build` before e2e after CSS changes.
- **Files modified:** none (dist/ is generated)

## Verification Results

- `npm run e2e -- subtask-align`: **6/6 passed** (3 pre-existing G-71-1/G-71-2 pins unchanged + 3 new G-71-3 tests)
- `npm test`: **1737 pass / 0 fail**, 13 pre-existing skips (grow-only vs 71-03's ≥1737 baseline — equal, no shrink)
- `npm run lint`: **16 errors** (pre-existing; see deviation 1 — plan expected 15, baseline was already stale)
- Chunk gate test: `every emitted .js chunk is <= 500000 bytes` ✔ (entry at 500.00 kB, within budget)
- `npm run i18n:scan`: 0 literals / 0 pending — no new keys; no renderer or task-list edits
- `grep -c "test(" e2e/subtask-align.spec.mjs`: 3 → 6

## Self-Check: PASSED

- FOUND: src/styles/views/list.css (stchip rule carries padding/height/radius)
- FOUND: e2e/subtask-align.spec.mjs (6 tests)
- FOUND: commit 02fb2dc; commit 3fedacb

## Threat Flags

None — CSS-only visual change + test-only additions; no new endpoints, auth paths, or data flows (T-71-05 accepted, T-71-SC n/a: no installs).
