---
phase: 71
reviewed: 2026-11-17
source: 71-REVIEW.md
findings:
  critical: 1
  warning: 1
  info: 2
  total: 4
open: 0
fixed: 2
skipped: 0
mitigated: 0
carried: 1
severity: none
status: resolved---

# Phase 71 — Code Review Disposition

One row per finding from `71-REVIEW.md` (standard depth, 2 files — incremental review after the 71-02 gap-closure plan).
Default disposition is `open` — triage by editing the Disposition column
(`open` / `fixed` / `skipped` / `deferred`) and stating the reason in Source.

| Finding | Title | Severity | Disposition | Source |
|---------|-------|----------|-------------|--------|
| CR-01 | Subtask meta cells misalign with parent columns on the My Tasks list view (my-tasks.js passes `cols: ['project','status','priority','due']` but the renderer hardcodes status→assignee→priority→due) | critical | fixed | 71-REVIEW-FIX.md: renderer now maps one meta cell per forwarded parent column in parent order; task-list.js forwards `columns: cols`; unmodeled columns emit placeholder cells (commit 85b27e7) |
| WR-01 | Stale CSS `--cols` fallback in `list.css` — widths/order match no live call site while its comment presents it as a correct default | warning | fixed | 71-REVIEW-FIX.md: stale 9-track fallback replaced with minimal loud default `var(--cols, 18px 30px minmax(220px,1fr))`, comment kept referencing LCOLS/task-list.js so the IN-01 pin holds (commit 0ce52dc) |
| IN-01 | Test named "174 names" asserts 175, with a duplicated/contradictory comment | info | open | — |
| IN-02 | Strike-through suppression in `.subrow.done` relies on declaration order + specificity; caret/spacer spans in `.subhead` fall outside the suppression scope | info | open | — |
| WR-02 | `--ind` tree indent applied as `padding-left` on the grid container shifts the whole track sequence — nested rows misalign | warning | fixed | carried — not in the current review; fixed by 71-02 Task 1 (commit 38810b1), pinned by 71-02 Task 2 |

## Post-fix reconciliation (2026-11-17)

`--fix` run resolved the Critical + Warning findings (REVIEW-FIX.md status `all_fixed`):
CR-01 (meta cell order now derived from the per-call-site `cols` array) and WR-01 (stale
fallback replaced). IN-01/IN-02 are Info — out of scope for `critical_warning` fix scope.
CR-01 note: template contract is pinned by tests; rendered-grid alignment still requires
the manual UAT item.

## Notes

- **ID reuse:** the ids CR-01, WR-01 and IN-01 in this incremental review name DIFFERENT
  findings than the ones recorded in the post-verification reconciliation below (2026-11-17,
  earlier review round). Those recorded decisions are therefore DROPPED from the rows above —
  the decision no longer has a row. The prior-round ledger is preserved verbatim below.
- WR-02 (previous round) is not reported by the current review; it was fixed by plan 71-02
  and is carried as `fixed`.

## Post-verification reconciliation (2026-11-17 — prior review round)

`71-VERIFICATION.md` confirmed CR-01 as the phase's one blocking gap (status `gaps_found`, 6/7 must-haves — D-71-1 alignment failed). WR-02 confirmed as a compounding cause of the same gap.

| Finding | Title | Severity | Disposition | Source |
|---------|-------|----------|-------------|--------|
| CR-01 | `.subrow` keeps legacy flex `gap: 8px` on a grid — meta cells land ~56–64px off the parent columns (defeats ADR-2 alignment) | critical | fixed | 71-02 Task 1: `.subrow` `gap: 0` (commit 38810b1), pinned by 71-02 Task 2 |
| WR-01 | Columns-mode toggle checkbox visually hidden with no `:focus-visible` on `.stchip` — keyboard focus indicator lost | warning | fixed | 71-02 Task 1: `.stchip:focus-within` outline with `var(--accent)` (commit 38810b1), pinned by 71-02 Task 2 |
| WR-02 | `--ind` tree indent applied as `padding-left` on the grid container shifts the whole track sequence — nested rows misalign | warning | fixed | 71-02 Task 1: fixed 64px base on the container, `--ind` rides `.subhead` as `margin-left` (commit 38810b1), pinned by 71-02 Task 2 |
| IN-01 | CSS `--cols` fallback hand-duplicates `LCOLS` widths — silent drift risk | info | mitigated | 71-02 Task 1: fallback kept (unstyled-row guard) with a keep-in-sync comment naming LCOLS / task-list.js as the single source of truth — mitigated-by-documentation (commit 38810b1), pinned by 71-02 Task 2 |
