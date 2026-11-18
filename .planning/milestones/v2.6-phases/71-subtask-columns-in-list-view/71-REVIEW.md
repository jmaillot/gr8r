---
phase: 71-subtask-columns-in-list-view
plan: 03
reviewed: 2026-11-18T00:00:00Z
depth: standard
scope: fc1f88c..a182b00 (71-03 gap closure only)
files_reviewed: 2
files_reviewed_list:
  - src/styles/views/list.css
  - test/i18n-core-features.test.mjs
findings:
  critical: 0
  high: 0
  medium: 0
  low: 1
  nit: 1
  total: 2
status: issues_found
---

# Phase 71, Plan 03: Code Review Report (gap closure G-71-1)

**Reviewed:** 2026-11-18
**Depth:** standard
**Files Reviewed:** 2 (`src/styles/views/list.css`, `test/i18n-core-features.test.mjs`)
**Diff base:** commits `fc1f88c` (CSS fix) + `a182b00` (test pins)
**Status:** issues_found (minor only — no blockers)

## Summary

The 71-03 diff is a one-rule CSS change plus grow-only test pins, and it does exactly what plan 71-03 specified. Verified against the live codebase:

- `.subrow > .c-meta` (list.css:157-161) correctly mirrors the parent-cell convention `.thead > div` (:27-33) / `.trow > div` (:54-60): `padding: 0 8px`, `display: flex`, `align-items: center`. No specificity conflict — grep confirms this is the only `.subrow > .c-meta` rule, and the later `.subrow.done .c-meta span` rule (:213) is untouched.
- The renderer (src/features/subtask-popovers.js:80-92) emits `.c-meta` cells as direct children of the `.subrow` element, so the `>` child selector matches every live call site, including the empty placeholder `<div class="c-meta"></div>` (line 87) where padding is inert as the comment claims.
- The `.grp` decoy (`padding: 0 8px 0 22px`, list.css:110) is correctly excluded by the anchored test regex (`^[ \t]*padding: 0 8px;[ \t]*$/gm`), which counts exactly the 3 intended declarations (:28, :55, :158).
- Existing 71-02 pins (`gap: 0`, `padding-left: 64px`, `--ind` on `.subhead`) are intact and re-asserted grow-only; no prior coverage deleted.
- `node --test test/i18n-core-features.test.mjs` verified live: 25 pass / 0 fail.

No security surface (no new input paths, no injection risk). No correctness defects found. The two items below are minor consistency nits.

## Findings

### LOW-01: `.subrow > .c-meta` omits the `min-width: 0` / `gap` / `white-space` siblings of the parent-cell rules it mirrors

**File:** `src/styles/views/list.css:157-161`
**Issue:** The rule deliberately mirrors `.thead > div` / `.trow > div`, but the parent rules also carry `min-width: 0` (.trow only, :56), `gap: 6px` (.trow, :59) / `gap: 4px` (.thead, :31), and `white-space: nowrap` (.thead, :32). Two consequences for subrow meta cells: (a) without `min-width: 0`, the grid item keeps its `auto` minimum — long unbreakable content (e.g. many assignee chips or a long label) can overflow the track instead of shrinking; (b) cells holding multiple inline items (e.g. `avStack(...)` assignees at subtask-popovers.js:84) render with no inter-item gap, a slightly different look from the parent row's meta cells.
**Fix (suggested):**
```css
.subrow > .c-meta {
  padding: 0 8px;
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 6px;          /* match .trow > div */
  white-space: nowrap;
}
```
Purely cosmetic hardening; not required to close G-71-1. If applied, extend the section-6 pin (a182b00) accordingly — note `white-space`/`gap` values must match what UAT shows for the parent row.

### NIT-01: Test error message hardcodes the declaration count independently of the assertion value

**File:** `test/i18n-core-features.test.mjs:352`
**Issue:** `assert.strictEqual(anchored.length, 3, \`expected exactly 3 anchored ... found ${anchored.length}\`)` — the message repeats the expected count as literal text. Harmless today, but a future legitimate grow (e.g. a 4th rule intentionally carrying `padding: 0 8px`) requires editing both the literal and the message.
**Fix:** Derive from a constant: `const EXPECTED_PADDED = 3; assert.strictEqual(anchored.length, EXPECTED_PADDED, \`expected exactly ${EXPECTED_PADDED} anchored "padding: 0 8px;" declarations, found ${anchored.length}\`);`

## Verification performed

- Read full diff of `fc1f88c` and `a182b00`.
- Read list.css:1-180 in full; grepped `c-meta` across css/js to confirm selector coverage and no conflicting rules.
- Confirmed renderer contract in src/features/subtask-popovers.js (meta cells are direct children of `.subrow`).
- Ran `node --test test/i18n-core-features.test.mjs` → 25 pass / 0 fail.

## Non-findings (checked, clean)

- Empty placeholder cells share the rule safely (padding inert on empty flex cells) — confirmed against renderer output shape.
- The anchored count regex is the correct discriminator vs the `.grp` decoy; substring counting was correctly avoided.
- Grow-only constraint respected: no existing assertions removed or weakened (diff is +17 lines, all additive).
- No secrets, debug artifacts, empty catches, or dangerous-function patterns in the diff.

---

_Reviewed: 2026-11-18_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
