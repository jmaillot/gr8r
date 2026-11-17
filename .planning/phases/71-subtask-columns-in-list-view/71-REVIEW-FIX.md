---
phase: 71-subtask-columns-in-list-view
fixed_at: 2026-11-17T00:00:00Z
review_path: .planning/phases/71-subtask-columns-in-list-view/71-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 71: Code Review Fix Report

**Fixed at:** 2026-11-17
**Source review:** .planning/phases/71-subtask-columns-in-list-view/71-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2 (critical_warning scope — CR-01, WR-01; IN-01/IN-02 out of scope)
- Fixed: 2
- Skipped: 0

## Fixed Issues

### CR-01: Subtask meta cells misalign with parent columns on the My Tasks list view

**Files modified:** `src/features/subtask-popovers.js`, `src/components/task-list.js`, `test/i18n-core-features.test.mjs`
**Commit:** 85b27e7
**Applied fix:** Fix option (a) from the review — the renderer now maps ONE meta cell per forwarded parent column in the parent's own order instead of emitting a hardcoded status→assignee→priority→due sequence. `task-list.js` passes the call-site `cols` array through (`columns: cols`, was `columns: true`). A column the subtask renderer does not model (project, labels) emits an empty `<div class="c-meta"></div>` placeholder so the supported cells stay pinned to their parent tracks on every call site. The D-71-6/ADR-1 comment was updated to document the per-call-site ordering contract. Test pins updated grow-only: the stale `columns: true` pin now asserts the `columns: cols` forwarding, and a NEW test pins that the columns branch maps the forwarded cols and emits the alignment placeholder.

### WR-01: CSS fallback grid template is stale — matches no live call site

**Files modified:** `src/styles/views/list.css`
**Commit:** 0ce52dc
**Applied fix:** Fix option (b) from the review — the stale 9-track fallback (baked status/assignee/priority/due/labels widths in a sequence no call site uses) is dropped to a deliberately minimal default `var(--cols, 18px 30px minmax(220px, 1fr))`, so a call site that renders `.subrow` without `--cols` misaligns loudly rather than silently wrong. The comment now explains why LCOLS widths must never be baked here while keeping LCOLS/`task-list.js` as the documented sync source (the IN-01 pin at test line 319 still holds). The ADR-5 comment's "4 meta cells" wording was corrected to the per-call-site cell count.

## Skipped Issues

None — all in-scope findings were fixed.

## Verification

**Where verification ran:** main checkout at /home/jmaillot/Projects/gr8r (worktree mode disabled via `workflow.use_worktrees: false`).

- Tier 2 syntax checks: `node -c` passed on `src/features/subtask-popovers.js`, `src/components/task-list.js`, `test/i18n-core-features.test.mjs`.
- Test suite: `npm test` → 1749 tests, 0 failures, 0 cancelled (one initial `email-outbox` end-to-end failure was a timing flake under parallel load; it passes in isolation and in the full-suite re-run).
- Lint: `npm run lint` → exactly 15 pre-existing errors — baseline unchanged, no new issues.
- i18n catalogue: no keys added or removed (the 1944 count is untouched).
- `columns` logic change is a behavioral reordering fix — classified per protocol as **fixed: requires human verification** of the rendered alignment on the My Tasks view (the fix is covered by the new source-contract pins, but pins assert the template contract, not the live DOM).

---

_Fixed: 2026-11-17_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
