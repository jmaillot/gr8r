---
phase: 62-e2e-baseline-repair
reviewed: 2026-11-14T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - e2e/helpers/setup.mjs
  - e2e/french-overflow.spec.mjs
  - e2e/locale.spec.mjs
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 62: Code Review Report

**Reviewed:** 2026-11-14
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Reviewed the phase-62 changes: the `assertServerUp()` fail-fast guard and the `openSettings()`/`selectLanguage()` helpers in `e2e/helpers/setup.mjs`, the rewritten language-switch spec in `e2e/french-overflow.spec.mjs`, and the rewritten `:122` spec in `e2e/locale.spec.mjs`. Helper contracts were cross-checked against the app side (`src/ui/select.js` enhanced-select roles, `src/pages/settings.js` `langSel`, `src/locales/*.json` catalogue keys, `/api/health`).

No critical issues. The core designs are sound: assert-once readiness honors D-02, the PATCH wait is armed before the click so the network completion cannot be missed, and the render-loop assertion survives via bounded `expect.poll`. Two robustness warnings concern the generic helpers' behavior outside the exact paths the current specs exercise; the rest are minor quality items.

## Warnings

### WR-01: `selectLanguage` hangs until the global test timeout if no PATCH fires

**File:** `e2e/helpers/setup.mjs:113-123`
**Issue:** The helper unconditionally arms `waitForResponse` on `PATCH /api/auth/me` (line 119), then clicks the option. If the target language is already the account's active locale (e.g., a future spec calls `selectLanguage(page, 'fr')` on a page already rendering French), the enhanced select may not submit a change and the PATCH never fires — the promise returned by `waitForResponse` never resolves and the awaited `saved` stalls until the test-level timeout, producing a confusing failure instead of a clear one. The same applies if the trigger/option click throws: the dangling promise is never awaited or cancelled.
**Fix:** Bound the wait explicitly so the failure names the cause:

```js
const saved = page.waitForResponse(
  r => r.url().endsWith('/api/auth/me') && r.request().method() === 'PATCH',
  { timeout: 5000 },
);
```

Optionally short-circuit when `select.value === lang` on entry (throw "already active" or return `null`), so callers can't accidentally build a no-op assertion.

### WR-02: `assertServerUp` assert-once flag is not keyed to the base URL

**File:** `e2e/helpers/setup.mjs:34-45`
**Issue:** `_serverAsserted` is a bare module-level boolean. `assertServerUp(base)` takes a `base` parameter and `createAccount(base, …)` forwards an arbitrary base, but once any first call asserts (against, say, the default `BASE_URL`), every subsequent call — including one against a *different* base/port — silently no-ops. If the suite ever points a helper at a second server (a second webServer, a staging port via `E2E_PORT` in one spec's beforeAll but not another's), the guard gives false confidence for the second target. Today all callers use `BASE_URL`, so this is latent, not active — hence Warning, not Critical.
**Fix:** Cache the asserted base instead of a bare flag:

```js
let _assertedBase = null;
export async function assertServerUp(base = BASE_URL) {
  if (_assertedBase === base) return;
  /* … fetch + throw as today … */
  _assertedBase = base;
}
```

## Info

### IN-01: `label-from-DOM` option-read logic duplicated in both specs

**File:** `e2e/french-overflow.spec.mjs:154`, `e2e/locale.spec.mjs:139`
**Issue:** Both specs contain an identical inline `page.evaluate` that reads `select[data-in="langSel"] option` texts, duplicating logic the helpers file was created to own (D-05's single-owner spirit). The helper `selectLanguage` runs its own copy of the same query internally (setup.mjs:114-118).
**Fix:** Export a small `languageOptionLabels(page)` helper from setup.mjs and have both specs and `selectLanguage` use it.

### IN-02: french-overflow `beforeAll` creates fixtures without the readiness guard

**File:** `e2e/french-overflow.spec.mjs:27-42`
**Issue:** The first `beforeAll` signs up directly through `apiClient` without `assertServerUp`, unlike the sweep `beforeAll` which goes through `createAccount` (and unlike `createAccount`/`acceptInvite`/`setupTenants`, which all assert). Inconsistent guard coverage; `webServer.url` gates it today, but the guard exists precisely to fail loudly when that gating breaks.
**Fix:** `await assertServerUp(BASE_URL);` as the first statement of the beforeAll (import from setup.mjs).

### IN-03: `cat()` helper swallows a missing key into an English fallback

**File:** `e2e/helpers/setup.mjs:23, 95, 97`
**Issue:** `cat(lang, key) || cat('en', key)` means a typo'd or removed catalogue key degrades silently to the English label instead of failing. In `openSettings`, if the fr catalogue ever drops `nav.route.settings`, the French-boot path would look for an English-named button and fail with an opaque "button not found" instead of naming the catalogue drift.
**Fix:** Throw when both lookups miss: `if (!label) throw new Error(\`catalogue key missing: ${key}\`)` — mirroring the guard `fmt()` in french-overflow.spec.mjs:391 already has.

### IN-04: Re-`await` of an already-awaited response is noise

**File:** `e2e/french-overflow.spec.mjs:167, 175`; `e2e/locale.spec.mjs:155, 175`
**Issue:** `const saved = await selectLanguage(...)` already resolves to the Response; the later `expect((await saved).status(), …)` re-awaits a non-promise. Harmless (awaiting a value is identity) but misleading — a reader may infer `saved` is still a pending promise at that point.
**Fix:** Drop the inner `await`: `expect(saved.status(), '…').toBe(200)`.

---

_Reviewed: 2026-11-14_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
