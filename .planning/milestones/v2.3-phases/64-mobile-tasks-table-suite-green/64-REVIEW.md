---
phase: 64-mobile-tasks-table-suite-green
reviewed: 2026-11-14T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - src/styles/responsive.css
  - src/views/table.js
  - e2e/mobile-tasks-table.spec.mjs
findings:
  critical: 0
  warning: 1
  info: 4
  total: 5
status: issues_found
---

# Phase 64: Code Review Report

**Reviewed:** 2026-11-14
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Reviewed the Phase 64 changes: the 900px-tier CSS contract in `responsive.css` (Columns-button hide, `.only-m`/`.hide-m` band flip, toolbar anti-squeeze, wrap-everything, card polish classes), the polished mobile card template line in `table.js`, and the new dedicated mobile e2e spec.

The implementation is solid. Cascade order is correct (`index.css:18` imports `responsive.css` after `base.css`, so the 900px-tier `.only-m { display: block }` correctly wins the same-specificity cascade over `base.css:154`), the chunk gate is untouched (`test/build-chunk-size.test.mjs:20` still `MAX_CHUNK_BYTES = 500000`), the CSS attribute selector `[data-pop='cols']` correctly matches the single render site at `src/shell/view-engine.js:227`, and the anti-features are verifiably absent (see below). User-controlled strings in the card template (`title`, `key`, assignee name) are all passed through `esc()` — no injection path in the touched template. Desktop behavior is genuinely unchanged (all new rules live inside the `max-width: 900px` media tier).

One warning concerns the scope of the `.toolbar` anti-squeeze rule; the rest is info-grade.

**Anti-features verified absent:**
- No `waitForTimeout`, no `networkidle`, no `page.screenshot` anywhere in `e2e/mobile-tasks-table.spec.mjs`.
- No second Playwright project / webServer — the spec uses `browser.newContext({ viewport })` on the main project, per D-10.
- No chunk-gate threshold edits — `MAX_CHUNK_BYTES = 500000` intact in `test/build-chunk-size.test.mjs:20`.
- Desktop untouched — every phase-64 CSS rule is inside the `@media (max-width: 900px)` block; the `data-tip`/openTask wiring and field set in the card template are unchanged.

## Critical Issues

None.

## Warnings

### WR-01: `.toolbar { flex-shrink: 0 }` is app-wide at ≤900px, not scoped to the fixed-height page context it was diagnosed against

**File:** `src/styles/responsive.css:101-103`
**Issue:** The D-07 fix targets a real bug (`.page.flush` fixed-height flex column squeezed the tasks toolbar to 44px at 390px), but the rule is a bare `.toolbar` selector applying to **every** view at ≤900px. `board.css:211` also defines a `.toolbar`; if any other view hosts a `.toolbar` inside a constrained flex column where shrinking is the desired behavior, `flex-shrink: 0` will force the toolbar to its natural (possibly wrapped) height and push/clip sibling rows instead. The full e2e close run passed (115/115), so no current view visibly regresses — but the rule is broader than the diagnosed bug, and a future view inheriting it silently gets non-shrinkable toolbar geometry.
**Fix:**
```css
/* Scope the anti-squeeze to the fixed-height page column where the
   squeeze bug was diagnosed (D-07), instead of all toolbars ≤900px. */
.page.flush .toolbar {
  flex-shrink: 0;
}
```
(Re-run the 390px mobile spec after scoping to confirm the toolbar remains visible.)

## Info

### IN-01: Redundant duplicate `.hide-m` rule in the 640px tier

**File:** `src/styles/responsive.css:176-178`
**Issue:** `.hide-m { display: none !important; }` is now declared in both the 900px tier (line 110-112) and the 640px tier (line 176-178). The 900px tier fully subsumes the 640px one, so the 640px declaration is dead weight. Harmless at runtime, but it invites drift (someone edits one copy and not the other).
**Fix:** Delete the 640px-tier `.hide-m` block, or add a comment noting the 900px rule is the source of truth.

### IN-02: Truncation spec reads `overflowWrap` but never asserts it

**File:** `e2e/mobile-tasks-table.spec.mjs:195-200`
**Issue:** The computed-style probe collects `overflowWrap` but the assertions only check `whiteSpace` and `textOverflow`. The D-08 wrap guarantee is only proven indirectly (via the per-card `scrollWidth - clientWidth ≤ 2px` check), not pinned to the mechanism. If the wrap rule is later removed and content happens to fit the fixture width, the suite would still pass without the wrap contract in place.
**Fix:** `expect(cs.overflowWrap).toBe('anywhere');` — or drop `overflowWrap` from the probe if the indirect proof is deemed sufficient.

### IN-03: Card title located positionally as the first `<b>` — fragile template coupling

**File:** `e2e/mobile-tasks-table.spec.mjs:194`
**Issue:** `card.locator('b').first()` identifies the title by tag + ordinal position rather than the stable `class="grow"` the template gives it (`src/views/table.js:94`). If a future card polish adds another `<b>` before the title (e.g., a bolded status label), the test silently asserts computed styles on the wrong element and can pass vacuously.
**Fix:** `const title = card.locator('b.grow').first();`

### IN-04: "Never clipped" is proven horizontally only; vertical clipping is unasserted

**File:** `e2e/mobile-tasks-table.spec.mjs:186-207`
**Issue:** D-08's contract is "never clipped content", but the assertions cover horizontal overflow (per-card and document-level `scrollWidth`). Given the diagnosis that `.page.flush` is a **fixed-height** flex column, a tall wrapped card stack could in principle clip at the bottom (scroll container hiding content) without failing any assertion. Current fixtures render few cards so this is theoretical today.
**Fix:** Add a cheap guard asserting the card stack's scroll container can reach the last card, e.g. `await expect(page.locator('.only-m .panel').last()).toBeVisible()` after scrolling it into view, or assert `scrollHeight <= clientWidth`-style bounds on the scroll container.

---

_Verified during review (no findings, for the record):_ card template escapes all user-controlled content (`esc(t.title)`, `esc(t.key)`, `esc()` on the assignee name, `esc(fmtEstimate(...))`); the duplicate-class bug the 64-02 summary describes is confirmed fixed (the `.mcm` element now carries `class="row muted mcm"`, a single class attribute); `[data-pop='cols']` is the only Columns render site (`view-engine.js:227`) and the generic hide matches it; cascade order `base.css` → `responsive.css` makes the 641–900px band flip work without touching `base.css`.

_Reviewed: 2026-11-14_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
