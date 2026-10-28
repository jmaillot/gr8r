---
phase: 18-closing-verification-i18n-migration-proof-real-device-uat
reviewed: 2026-10-28T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - src/actions/actions.js
  - test/tfa-state-fix.test.mjs
  - e2e/flows.spec.mjs
  - e2e/server.mjs
  - src/styles/shell.css
  - test/migration.test.mjs
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 18: Code Review Report

**Reviewed:** 2026-10-28
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Reviewed the six source files from the phase summaries (18-01 … 18-04): the WR-01/WR-02 2FA login state fix in `actions.js` with its source-structure regression pin, the new 2FA/revocation e2e flows and the e2e server wrapper, the scoped sidebar-CSS fix in `shell.css`, and the login_challenges/workspace-doc migration assertions in `migration.test.mjs`.

Overall the implementation is solid: the 18-1 fix is correctly ordered (reset → clear → burn-preserve → finishLogin), the e2e TOTP helper computes codes at submit time with no test backdoor, the e2e server wrapper is properly isolated (throwaway MASTER_KEY + DATA_DIR, DB_PATH forced), and the migration assertions are written against the real SCHEMA surface. No critical issues found. The findings below are three warnings (an i18n gap in a reviewed file that this very phase exists to close, a failure-mode-swallowing e2e helper, and a fragile test-extraction regex) plus four info items.

## Warnings

### WR-01: Raw-English error string bypasses the i18n catalogue

**File:** `src/actions/actions.js:2836`
**Issue:** `S.ui.errors = { login: `${em} already has an account. Sign in to accept the invite.` };` is a hardcoded English string in a user-facing error path. A French-locale user who tries to sign up with an existing address gets English copy — exactly the defect class phase 18 (i18n migration proof) is meant to have eliminated. Every neighboring error uses `t('err.…')`.
**Fix:**
```js
S.ui.errors = { login: t('err.accountExistsSignIn', { email: em }) };
```
with the key added to both `src/locales/en.json` and `src/locales/fr.json`.

### WR-02: submitTfaCode collapses every failure mode into `false`

**File:** `e2e/flows.spec.mjs:1068-1077` (used at `1110-1114`)
**Issue:** `submitTfaCode` catches ANY non-landing — invalid code, `challengeExpired`, `tooManyAttempts`, or even a crashed page — and returns `false`. The happy-path test then comments "challenge still alive" and blindly retries with the next step's code. If the first failure was actually a dead challenge or exhausted attempt budget, the retry submits a second code against a dead challenge and the subsequent `err.invalidTfaCode` assertion fails with a misleading diagnostic.
**Fix:** Before retrying, assert the error copy that justifies the retry:
```js
if (!ok) {
  await expect(page.getByText(fmt('err.invalidTfaCode', {}, lang))).toBeVisible(); // proves the challenge is alive
  await expect(submitTfaCode(page, acct.account.slug, tfaCode(secret, 31)), 'retry with the next step code').toBe(true);
}
```

### WR-03: bodyOf end-boundary regex omits top-level assignments — fragile extraction

**File:** `test/tfa-state-fix.test.mjs:24-30`
**Issue:** The end-boundary regex `/\n(?:export |async function |function |\/\*)/` does not match top-level assignments such as `A.tfaBackToSignIn = async () => {` or `const X = …`. Each target function's slice currently terminates correctly only because a `/*` comment happens to precede the next action (lines 2677, 2722, 2786 in actions.js). A future comment-less action appended after a pinned function would silently broaden the asserted slice, and the structure assertions would keep passing against code outside the intended function — a false-green risk in a regression pin whose entire value is precision.
**Fix:** Add assignments to the alternation:
```js
const end = rest.search(/\n(?:export |async function |function |[A-Za-z_$][\w$.]*\s*=|\/\*)/);
```
or assert the extracted body contains a known unique terminator (e.g. `await finishLogin(`) as a sanity bound.

## Info

### IN-01: WR-01 pin asserts presence and order, not path placement

**File:** `test/tfa-state-fix.test.mjs:32-36`
**Issue:** The test only checks that `S.ui.auth = 'login'` appears before `await finishLogin(` — a reset incorrectly placed in a failure branch (or at function entry, clobbering the parked '2fa' card before the API call) would still pass. The pin would be stronger if it asserted the reset comes after the `applyUser(res.data)` success marker.
**Fix:** Add `assert.ok(fn.indexOf("S.ui.auth = 'login'") > fn.indexOf('applyUser(res.data)'))`.

### IN-02: shell.css scoping fix silently un-hides other `.sub` consumers

**File:** `src/styles/shell.css:225`
**Issue:** The change from `.sub` to `.sitem .sub` fixes the hidden auth-card subtitles, but every other `.sub` element previously caught by the global `display:none` is now visible — notably `.pi .sub` in the command palette (`src/overlays/palette.js:236`, styled at `overlays.css:720`). Those elements have their own styles and were almost certainly meant to be visible (the global rule was the bug), but the phase's e2e only proves the auth card; the palette subtitle reappearance is an untested visual change.
**Fix:** Confirm the palette subtitle renders as intended in a manual smoke pass; no code change expected.

### IN-03: maskEmail test helper duplicates the server contract by reimplementation

**File:** `e2e/flows.spec.mjs:1020-1026`
**Issue:** The helper re-implements `server.js:1242` maskEmail but omits its edge guards (`at <= 0 → '***'`, empty domain char). Fixture emails always have well-formed local parts, so the outputs agree today, but the duplicated contract can drift silently; a future server-side masking change (e.g. masking more of the domain) fails the test with only a generic visibility error.
**Fix:** Either note the coupling at both sites with cross-references, or derive the expectation from the server's actual response (`res.data.maskedEmail` returned by `/api/auth/login` pending2fa) instead of recomputing it.

### IN-04: Auth-bearing doc keys enumerated by hand instead of derived from the strip list

**File:** `test/migration.test.mjs:308-322`
**Issue:** `AUTH_BEARING_DOC_KEYS = ['sessions', 'tfa']` mirrors `normalizeDoc`/`docFromClient` in server.js by duplication. If a future auth-bearing doc key is added to the server strip list but not to this array, the "zero auth-bearing keys" walk silently stops covering it.
**Fix:** Export the strip list from server.js (or a shared module) and import it here, so the test and the sanitizer cannot diverge. Also consider renaming the `ddl(name)` helper's parameter — it receives `{type, name}` while being called `name` (`migration.test.mjs:326`), which reads confusingly.

---

_Reviewed: 2026-10-28_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
