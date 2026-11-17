---
phase: 71
reviewed: 2026-11-17
source: 71-REVIEW.md
findings:
  critical: 1
  warning: 2
  info: 1
  fixed: 3
  mitigated: 1
  total: 4
open: 0
fixed: 3
skipped: 0
mitigated: 1
severity: critical
---

# Phase 71 — Code Review Disposition

One row per finding from `71-REVIEW.md` (standard depth, 4 files).
Default disposition is `open` — triage by editing the Disposition column
(`open` / `fixed` / `skipped` / `deferred`) and stating the reason in Source.

| Finding | Title | Severity | Disposition | Source |
|---------|-------|----------|-------------|--------|
| CR-01 | `.subrow` keeps legacy flex `gap: 8px` on a grid — meta cells land ~56–64px off the parent columns (defeats ADR-2 alignment) | critical | open | — |
| WR-01 | Columns-mode toggle checkbox visually hidden with no `:focus-visible` on `.stchip` — keyboard focus indicator lost | warning | open | — |
| WR-02 | `--ind` tree indent applied as `padding-left` on the grid container shifts the whole track sequence — nested rows misalign | warning | open | — |
| IN-01 | CSS `--cols` fallback hand-duplicates `LCOLS` widths — silent drift risk | info | open | — |

## Post-verification reconciliation (2026-11-17)

`71-VERIFICATION.md` confirmed CR-01 as the phase's one blocking gap (status `gaps_found`, 6/7 must-haves — D-71-1 alignment failed). WR-02 confirmed as a compounding cause of the same gap.

| Finding | Title | Severity | Disposition | Source |
|---------|-------|----------|-------------|--------|
| CR-01 | `.subrow` keeps legacy flex `gap: 8px` on a grid — meta cells land ~56–64px off the parent columns (defeats ADR-2 alignment) | critical | fixed | 71-02 Task 1: `.subrow` `gap: 0` (commit 38810b1), pinned by 71-02 Task 2 |
| WR-01 | Columns-mode toggle checkbox visually hidden with no `:focus-visible` on `.stchip` — keyboard focus indicator lost | warning | fixed | 71-02 Task 1: `.stchip:focus-within` outline with `var(--accent)` (commit 38810b1), pinned by 71-02 Task 2 |
| WR-02 | `--ind` tree indent applied as `padding-left` on the grid container shifts the whole track sequence — nested rows misalign | warning | fixed | 71-02 Task 1: fixed 64px base on the container, `--ind` rides `.subhead` as `margin-left` (commit 38810b1), pinned by 71-02 Task 2 |
| IN-01 | CSS `--cols` fallback hand-duplicates `LCOLS` widths — silent drift risk | info | mitigated | 71-02 Task 1: fallback kept (unstyled-row guard) with a keep-in-sync comment naming LCOLS / task-list.js as the single source of truth — mitigated-by-documentation (commit 38810b1), pinned by 71-02 Task 2 |
