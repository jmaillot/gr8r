---
phase: 31-second-totp-factor
reviewed: 2026-11-01T00:00:00Z
depth: deep
files_reviewed: 8
files_reviewed_list:
  - server.js
  - test/tfa-multi-factor.test.mjs
  - test/totp-encryption.test.mjs
  - src/pages/settings.js
  - src/actions/actions.js
  - src/core/api.js
  - src/locales/en.json
  - src/locales/fr.json
findings:
  critical: 1
  warning: 3
  info: 3
  total: 7
status: issues_found
---

# Phase 31: Code Review Report

**Reviewed:** 2026-11-01
**Depth:** deep
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Phase 31 delivers the multi-TOTP-factor backend (`totp_factors` single source of truth, shared `verifyTotpAgainstFactors` helper, enroll/enable/remove routes) and the client wizard. The core crypto handling is solid: decrypt stays behind `requireTotpSecret`, replay guards advance on the matched factor row, secrets never leave the server, migrations are backup-first and idempotent, and the client escapes every factor name. However, the legacy first-enrollment routes (`/api/auth/tfa/enroll` + `/api/auth/tfa/enable`) were not fenced off now that they can mint additional factor rows — a hijacked session can bypass the phase's own TOTP2-05 existing-factor step-up guard through them. Three lower-severity races/UX defects were also found.

## Critical Issues

### CR-01: Legacy enroll/enable routes bypass the existing-factor step-up and now stack additional factors (TOTP2-05 regression)

**File:** `server.js:2514-2590` (legacy `/api/auth/tfa/enroll`, `/api/auth/tfa/enable`)
**Issue:** Phase 31's stated threat model (T-31-06 / TOTP2-05) is that adding a factor requires a password **plus a live code from an existing factor**, specifically as a "lock-out guard against QR-bombing a hijacked session". The new `/api/auth/tfa/factors/enroll` enforces this — but the legacy routes still enforce password-only enrollment and unconditionally **insert** a new `totp_factors` row in the enable transaction (server.js:2573-2580). Pre-phase, a re-enable *overwrote* the single secret; post-phase it *adds* a second verifiable factor named `settings.tfa.factor.primary` ("Primary authenticator"), with no existing-factor code and no label validation. Any authenticated user with 2FA already on can call `POST /api/auth/tfa/enroll` (no `tfaNotEnabled` guard at server.js:2514-2530) then `POST /api/auth/tfa/enable` with the new secret's code — defeating the guard the phase just built, and creating a duplicate "Primary authenticator" row in the factor list.
**Fix:**
```js
// In /api/auth/tfa/enroll, after the password step-up:
const factorCount = db.prepare('select count(*) as c from totp_factors where user_id = ?').get(user.id).c;
if (factorCount > 0) return fail(res, 409, 'tfaNotEnabled', 'Additional factors use the add-factor flow');
// (and correspondingly in /api/auth/tfa/enable: only honor a legacy-keyed
// pending entry when the user has zero factor rows)
```
Alternatively, require the existing-factor step-up in the legacy enable route whenever factor rows exist. Add a regression test: enroll→enable on a 2FA-enabled account must 409.

## Warnings

### WR-01: TOCTOU on `factorCount` — concurrent removals can strand a user at 0 factors with 2FA enabled

**File:** `server.js:2848-2871` (`/api/auth/tfa/factors/remove`)
**Issue:** `factorCount` is read outside the transaction and decides the branch. A user with exactly 2 factors issuing two concurrent removes (double-submit, two tabs) gets `factorCount = 2` on both requests → both take the single-delete path → 0 factor rows remain while `users.two_fa_enabled = 1`. Every TOTP login/step-up then returns `decrypted === 0` → 503: the account is locked out of all TOTP paths (login second step, disable, regen) until the user signs in with a recovery code and disables 2FA. The mirror race on enable (WR-03) shares the same root cause: decision reads outside the transaction.
**Fix:** Re-read the count (and target existence) inside the removal transaction and re-branch there:
```js
transaction(() => {
  const count = db.prepare('select count(*) as c from totp_factors where user_id = ?').get(user.id).c;
  if (count > 1) { /* single delete */ } else { /* disable teardown */ }
});
```

### WR-02: Factor-list GET is throttled at 5/15 min but the client fetches it on every settings-tab visit — 429 silently empties the list

**File:** `server.js:2989` (route throttle), `src/actions/actions.js:2003-2006` (`refreshTfa`)
**Issue:** `refreshTfa()` calls `api.tfaFactors()` and is invoked on every navigation to the settings sessions/tfa tab (actions.js:295) plus after every mutation. After the 6th navigation inside 15 minutes the route returns 429, and the handler maps any non-ok response to an empty list (`factors.ok ? factors.data.factors || [] : []`). The user sees their factors silently disappear — indistinguishable from removal — until the throttle window resets. A 5-per-15-min budget is attack-shaped for a GET the client itself hammers.
**Fix:** Either raise/remove the throttle on this read-only route (it leaks nothing), or have the client distinguish 429 (`tooManyAttempts` error surfaced, keep previous list) from genuine empty state.

### WR-03: `factors/enable` double-submit race inserts duplicate factor rows

**File:** `server.js:2768-2817` (`/api/auth/tfa/factors/enable`)
**Issue:** The `pendingTfa.get(resolvedKey)` check, `wasFirst` count, and `verifyTotpCode` all run before the transaction; the pending entry is deleted only inside it. Two concurrent submissions of the same stagedId+code both pass the pending check and both insert a factor row (and on the first-ever path, both rotate recovery codes and return two different code sets — one set silently invalid). Same pattern in the legacy enable route. Not attacker-reachable beyond the authenticated user, but corrupts state on an ordinary double-click.
**Fix:** Consume the pending entry atomically before verification — e.g. a `Map`-level check-and-delete helper (JS is single-threaded per event-loop turn: get+delete in the same synchronous step), or re-assert `pendingTfa.get(key) === undefined` first thing inside the transaction and bail with `noPendingEnrollment`.

## Info

### IN-01: Staged-entry key fallback silently verifies an unrelated pending secret

**File:** `server.js:2768-2777`
**Issue:** When a supplied `stagedId` matches nothing (expired/typo), the route silently falls back to the legacy `user.id` key. If a legacy pending entry happens to exist, the user enables a factor they were not looking at, labeled "Primary authenticator", with no error signaling the mismatch. Also the only path where the enroll-validated label is replaced by the hardcoded catalogue key.
**Fix:** Only fall back when `stagedId` was not supplied at all; a supplied-but-unknown stagedId should return `noPendingEnrollment`.

### IN-02: Hardcoded 30-second period in the client last-used rendering

**File:** `src/pages/settings.js:300` (`ago(f.lastStep * 30 * 1000)`)
**Issue:** The server's `verifyTotpCode(secretB32, code, lastStep, nowSec, period = 30)` owns the period; the client duplicates the constant to derive "last used". If the server period ever becomes configurable, display drifts silently.
**Fix:** Export/serve the period constant (or include an absolute timestamp in the factors response) instead of the magic number.

### IN-03: Client-side 6-digit pre-validation missing on two of the three new code fields

**File:** `src/actions/actions.js:2897-2899` (`A.tfaAddFactorVerify`), `src/actions/actions.js:2946-2950` (`A.tfaFactorRemove`)
**Issue:** `A.tfaAddFactorPw` mirrors the server's `^\d{6}$` gate client-side, but the verify and remove handlers submit whatever is typed and wait for the server's `codeRejected`. Server enforcement is correct and sufficient for security; the inconsistency just spends a throttle attempt (5/15 min) on a malformed input.
**Fix:** Add the same `else if (!/^\d{6}$/.test(code))` pre-check used in `A.tfaAddFactorPw`.

---

_Positives worth keeping: decrypt boundary exclusivity (D-77) held across all new call sites; the D-15 survivor-exclusion with the last-factor exception is correctly reasoned (a zero-row candidate set would have bricked removal); migration order (encryption → factor copy → re-wrap) is load-bearing and correct; all client-interpolated factor names go through `esc(t(...))`._

_Reviewed: 2026-11-01T00:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
