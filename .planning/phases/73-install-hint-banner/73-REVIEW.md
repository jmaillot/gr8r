---
phase: 73-install-hint-banner
reviewed: 2026-11-18T22:05:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - src/features/install-banner.js
  - src/main.js
  - src/locales/en.json
  - src/locales/fr.json
  - src/styles/overlays.css
  - test/pwa-banner.test.mjs
  - test/fixtures/banner-entry-baseline.json
  - e2e/install-banner.spec.mjs
findings:
  critical: 1
  warning: 3
  info: 3
  total: 7
status: issues_found
---

# Phase 73: Code Review Report

**Reviewed:** 2026-11-18T22:05:00Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

The install-banner slice is well-structured: lazy chunk with a clean seam (`guardSource`), one-shot `prompt()` discipline, fail-absent localStorage handling, token-only CSS, and a genuinely adversarial test suite (build contract, static pins, degradation matrix). No security findings — the stored cooldown value is never rendered, all interpolated text goes through `esc()`, and the `prompt()` call site is gesture-bound as designed.

However, the plan-02 boot-hydration race fix was applied **only to `checkIos()`**. `onBip()` — the primary Chromium path — still makes its render decision one animation frame after the event, which in real Chrome fires before `api.init()` has resolved `/api/boot`. The unit/e2e suites mask this with artificially delayed event dispatch; the production path is likely dead. Secondary findings concern duplicated CTA copy and module-state races around the exit-animation window.

## Critical Issues

### CR-01: onBip() judges `canShow()` before hydration — the real Chromium banner never renders

**File:** `src/features/install-banner.js:158-163` (with `src/core/api.js:12,172`, `src/main.js:79-81`)
**Issue:** `onBip()` defers its decision by exactly **one** `requestAnimationFrame`:

```js
export function onBip(e) {
  deferred = e || null;
  requestAnimationFrame(() => {
    if (deferred && canShow()) renderStrip('cta');
  });
}
```

`canShow()` requires `g.enabled` (line 83), and `api.enabled` starts `false` (`src/core/api.js:12`) and only flips after the `/api/boot` network fetch resolves (`api.js:172`). In a real Chrome session, `beforeinstallprompt` fires early during page load — before that fetch resolves — so the single-frame re-check evaluates `enabled === false`, `canShow()` returns false, and the strip never mounts. The event is captured in `deferred` but nothing ever re-examines it.

Commit 486b402 explicitly proved this exact race for `checkIos()` ("bannerMod().then(m => m.checkIos()) resolves before api.init() sets enabled, so canShow() bailed forever") and fixed it with the bounded rAF retry budget. `onBip()` was left with the pre-fix shape. The e2e suite cannot catch it because `BIP_STUB` dispatches the event 150 ms *after* load (`e2e/install-banner.spec.mjs:40`) on a fast localhost boot — the fetch happens to have won by then. Real-device Chromium loses that race deterministically.

**Fix:** give `onBip()` the same bounded retry `checkIos()` received — re-evaluate until the guard signals are live, then decide finally:

```js
export function onBip(e) {
  deferred = e || null;
  let frames = 0;
  const attempt = () => {
    if (!deferred) return; /* consumed or installed */
    const g = guardSource();
    if (g.auth) { deferred = null; return; } /* auth screen: final (D-03) */
    if (!g.enabled) {
      if (++frames < 300) requestAnimationFrame(attempt); /* hydration pending */
      return;
    }
    if (canShow()) renderStrip('cta');
    else deferred = null;
  };
  requestAnimationFrame(attempt);
}
```

(The first frame is kept so the happy path still never renders on a login screen judged mid-frame.)

## Warnings

### WR-01: CTA strip renders the same string twice — text span and button are identical copy

**File:** `src/features/install-banner.js:112-117`
**Issue:** for the `cta` flavour, the grow-span and the button both render `t('pwa.install.cta')`:

```js
const text = flavour === 'ios' ? t('pwa.install.iosHint') : t('pwa.install.cta');
el.innerHTML = `<span class="grow">${esc(text)}</span>`;
...
btn.textContent = t('pwa.install.cta');
```

The user sees "Install app  Install app  ✕" — the descriptive line duplicates the button label, which is both a UX defect and a wasted ~20 bytes of the tight entry/lazy-chunk budget. The e2e suite enshrines the duplication (`e2e/install-banner.spec.mjs:87-88` asserts both elements equal `EN_CTA`), so it is locked in rather than caught.
**Fix:** add a dedicated hint key (e.g. `pwa.install.hint`: "Install this app for one-tap access") to EN+FR in the same commit (D-08 discipline, catalogue pin 1946→1948), and render it in the grow-span; or drop the span and keep only the button if the strip is meant to be minimal.

### WR-02: `renderStrip()` early-return ignores flavour and can stack strips during the exit window

**File:** `src/features/install-banner.js:89-93,107-108`
**Issue:** two related module-state problems:
1. `renderStrip(flavour)` starts with `if (strip) return strip;` — if the iOS strip is mounted and a `beforeinstallprompt` later arrives (desktop Safari/iPad edge), `renderStrip('cta')` returns the *iOS* strip with no Install button; the CTA affordance silently never appears.
2. `hide()` sets `strip = null` immediately but the element stays in the DOM for 160 ms (`.out` transition, line 91). A second render during that window mounts a *second* strip while the first is still animating out — two overlapping fixed-bottom strips for 160 ms.
**Fix:** track flavour (`let stripEl = null, stripFlavour = ''`), re-render only when the flavour differs; in `hide()`, keep the reference until `el.remove()` fires:

```js
function hide(el) {
  strip = null;               /* free the slot but… */
  setTimeout(() => { el.remove(); }, 160);
}
```
…combined with a `mounting` guard, or clear `strip` only inside the timeout and have `renderStrip` reuse an exiting element by removing it synchronously before mounting.

### WR-03: e2e stub's 150 ms dispatch couples the suite to localhost boot latency, masking CR-01

**File:** `e2e/install-banner.spec.mjs:33-41,80-83`
**Issue:** the `beforeinstallprompt` stub is dispatched on a `setTimeout(…, 150)` after load, and the suite passes only because `/api/boot` resolves faster than that on localhost. This timing coincidence is precisely why CR-01 is invisible to CI: the stub *inverts* the real-world ordering (event before boot-fetch). Any CI slowdown (cold server, slower runner) makes test 1 flaky in the other direction too.
**Fix:** after fixing CR-01, dispatch the stub event immediately (`setTimeout(…, 0)`) in at least one scenario — that is the ordering that reproduces real Chromium and proves the retry logic. Optionally add a second, delayed-dispatch case to cover the late-event path.

## Info

### IN-01: Double `hide(el)` on the unexpected-outcome path

**File:** `src/features/install-banner.js:129-136`
**Issue:** when `await ev.userChoice` rejects, `hide(el)` runs in the catch and then falls through to the unconditional `hide(el)` — two `classList.add('out')` and two 160 ms timeouts per click. Harmless today (idempotent-ish) but a latent trap if `hide` ever accumulates state.
**Fix:** `catch { /* fall through */ }` and let the single trailing `hide(el)` cover every path, or `return hide(el)` in the catch.

### IN-02: 160 ms exit constant duplicated between CSS and JS

**File:** `src/features/install-banner.js:91` and `src/styles/overlays.css:789-791`
**Issue:** the removal timeout (160 ms) hard-codes the same duration as the `.install-banner.out` CSS transition. Changing either side alone breaks the animation (premature removal or a lingering invisible strip).
**Fix:** accept the coupling with a comment on both sides, or expose the duration as a CSS custom property read via `getComputedStyle` before scheduling removal.

### IN-03: Silent chunk-load failures swallow the whole feature

**File:** `src/main.js:80-88`
**Issue:** all three `bannerMod()…catch(() => {})` sites drop chunk-load errors with no signal — if the lazy chunk ever fails to fetch (flaky CDN, aggressive proxy), the user silently gets neither banner nor diagnostics, while `preventDefault` has already suppressed Chrome's own mini-infobar. This matches the established `pushMod`/keyboard.js pattern, so it is noted as an observation, not a defect to fix in-phase.
**Fix (optional, follow-up):** route the catch through the existing toast/error channel in a later phase, or skip `preventDefault` until the module has loaded.

## Structural Findings (fallow)

None provided in the review request.

---

_Reviewed: 2026-11-18T22:05:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
