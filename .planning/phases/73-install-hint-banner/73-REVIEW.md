---
phase: 73-install-hint-banner
reviewed: 2026-11-18T23:20:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - src/main.js
  - src/features/install-banner.js
  - src/locales/en.json
  - src/locales/fr.json
  - src/styles/overlays.css
  - test/pwa-banner.test.mjs
  - e2e/install-banner.spec.mjs
findings:
  critical: 0
  warning: 2
  info: 5
  total: 7
status: issues_found
---

# Phase 73: Code Review Report (re-review after 73-03 gap closure)

**Reviewed:** 2026-11-18T23:20:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Re-review covering the full phase scope, with focus on the two 73-03 commits (`f6661c5`, `769b1b8`) that postdate the previous review pass (73-REVIEW.md, 22:05Z). Both prior blockers were verified fixed:

- **CR-01 (closed):** `onBip()` now mirrors `checkIos()`'s bounded 300-frame rAF retry (`src/features/install-banner.js:163-179`) — sync first attempt, retry while `!enabled`, final auth decline, decide-once. The pre-hydration race that made the real Chromium banner unreachable is closed.
- **WR-03 (closed):** `e2e/install-banner.spec.mjs:75-92,215-256` adds the rAF-timed pre-hydration stub (addEventListener patch + route-level 150 ms `/api/config` hold), exercising exactly the CR-01 ordering with zero wall-clock delay in the browser.

Verification performed: full `node --test test/pwa-banner.test.mjs` run — **28/28 pass**, including the real-build chunk gate (one lazy `install-banner` chunk; entry delta within the 200-byte budget) and the new CR-01 retry tests. No security findings: the stored cooldown value is never rendered, all interpolated text goes through `esc()`, the single `prompt()` call site stays gesture-bound, and the unit pin (`promptSites.length === 1`) still enforces it.

Remaining findings: the two prior warnings (WR-01, WR-02) and three prior infos were never dispositioned (`73-REVIEW-DISPOSITION.md` shows all 7 rows still `open`) and are still present in source — re-reported below so the record stays honest. Two new info-level observations concern the 73-03 retry budget and a stale test-header comment.

## Warnings

### WR-01: CTA strip renders the same string twice — text span and button are identical copy (carryover, still open)

**File:** `src/features/install-banner.js:112-117`
**Issue:** for the `cta` flavour, the grow-span and the button both render `t('pwa.install.cta')` — the user sees "Install app  Install app  ✕". The e2e suite still enshrines the duplication (`e2e/install-banner.spec.mjs:249-250` asserts both equal `EN_CTA`).
**Fix:** add a dedicated hint key (`pwa.install.hint`) to EN+FR in the same commit (D-08 discipline) and render it in the grow-span, or drop the span and keep only the button.

### WR-02: renderStrip/hide module-state races — wrong-flavour early-return and exit-window double mount (carryover, still open; reachability reduced by 73-03)

**File:** `src/features/install-banner.js:89-93,107-108,168`
**Issue:** two related latent problems:
1. `renderStrip(flavour)` starts with `if (strip) return strip;` (line 108) — if called while an iOS strip is mounted, it returns the *iOS* strip with no Install button. After 73-03 this path is guarded in both callers (`onBip` and `checkIos` both bail on `if (strip …)` first), so it is currently unreachable — but the guard lives at the call sites, not in `renderStrip`; a future third caller reintroduces the bug silently.
2. `hide()` sets `strip = null` immediately (line 92) while the element stays in the DOM for 160 ms (`.out` transition, overlays.css:789-791). A render scheduled in that window mounts a second overlapping strip. New in 73-03: `onBip`'s retry loop also **strands a captured event** — `if (strip || !deferred) return;` (line 168) stops retrying without clearing `deferred`, so a `beforeinstallprompt` that arrives while any strip is mounted is captured but never examined again (relevant on the iOS-strip-mounted edge, where the strip has no Install button to consume it).
**Fix:** track flavour alongside the element (`stripEl`/`stripFlavour`), keep the reference until `el.remove()` fires inside the 160 ms timeout, and clear `deferred` in the same early-return path that gives up retrying.

## Info

### IN-01: Double `hide(el)` on the unexpected-outcome path (carryover, still open)

**File:** `src/features/install-banner.js:129-137`
**Issue:** when `await ev.userChoice` rejects, `hide(el)` runs in the catch and then falls through to the unconditional `hide(el)` — two `classList.add('out')` and two 160 ms timeouts per click.
**Fix:** empty catch (fall through) and let the single trailing `hide(el)` cover every path.

### IN-02: 160 ms exit constant duplicated between CSS and JS (carryover, still open)

**File:** `src/features/install-banner.js:91` and `src/styles/overlays.css:789-791`
**Issue:** the removal timeout hard-codes the same duration as the `.install-banner.out` transition. Changing either side alone breaks the animation.
**Fix:** couple them explicitly via a comment on both sides, or read the duration from `getComputedStyle` before scheduling removal.

### IN-03: Silent chunk-load failures swallow the whole feature (carryover, still open)

**File:** `src/main.js:81-88`
**Issue:** all three `bannerMod()…catch(() => {})` sites drop chunk-load errors with no signal, while `preventDefault` has already suppressed Chrome's own mini-infobar. Matches the established `pushMod` pattern; noted as a follow-up observation, not an in-phase defect.
**Fix (optional):** route the catch through the toast/error channel in a later phase, or defer `preventDefault` until the module loads.

### IN-04: 300-frame retry budget is frame-count-based, not wall-clock (new, 73-03)

**File:** `src/features/install-banner.js:173` and `src/features/install-banner.js:210`
**Issue:** the budget is ~5 s at 60 fps, but only ~2.5 s on 120 Hz displays, and rAF stalls entirely in hidden/background tabs. If hydration takes longer than the effective budget (slow network + throttled tab), the banner silently forfeits — the same final-decline shape as auth. Acceptable as a designed bound (mirrors `checkIos`), but the display-refresh sensitivity is undocumented.
**Fix:** note the refresh-rate caveat in the header comment, or budget against a coarse wall-clock sample (`performance.now()` compared across frames) if the ~2.5 s ceiling is judged too tight.

### IN-05: Unit test header comment still describes the pre-73-03 one-shot shape (new, 73-03)

**File:** `test/pwa-banner.test.mjs:5-8`
**Issue:** the header says "onBip … defers the canShow() decision one rAF past hydration" — stale after 73-03 changed the shape to sync-first + bounded retry. The individual test comments (lines 202-203, 329-333) are correct; only the file header drifted. 73-03-SUMMARY even documents a header-comment rename for a case test, but this one was missed.
**Fix:** reword the header bullet to "defers the canShow() decision past hydration with a bounded rAF retry (CR-01 closure)".

## Structural Findings (fallow)

None provided in the review request.

---

_Reviewed: 2026-11-18T23:20:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
