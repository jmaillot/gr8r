---
phase: 64-mobile-tasks-table-suite-green
review: 64-REVIEW.md
created: 2026-11-14
---

# Phase 64 — Review Dispositions

One row per finding from 64-REVIEW.md. Default status: `open`.

| ID | Severity | Dimension | Summary | Status | Rationale |
|----|----------|-----------|---------|--------|-----------|
| WR-01 | warning | css-scope | `.toolbar { flex-shrink: 0 }` app-wide at ≤900px; should be scoped to `.page.flush .toolbar` (board.css toolbar inherits it) | open | No current regression (115/115 close run green); safe to fix in a follow-up or phase-gap pass |
| IN-01 | info | css-redundancy | Duplicate `.hide-m` rule in the 640px tier | open | Cosmetic; no behavior impact |
| IN-02 | info | e2e-assertion | Spec reads `overflowWrap` but never asserts it | open | Horizontal truncation already asserted via scrollWidth |
| IN-03 | info | e2e-robustness | Title located as first `<b>` instead of stable `b.grow` | open | Works today; locator hardening candidate |
| IN-04 | info | e2e-coverage | Vertical clipping unasserted (D-08 proven horizontally only) | open | Coverage enhancement candidate |
