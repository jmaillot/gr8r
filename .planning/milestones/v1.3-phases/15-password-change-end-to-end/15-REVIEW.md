---
phase: 15-password-change-end-to-end
reviewed: 2026-10-27T12:00:00Z
depth: deep
files_reviewed: 7
files_reviewed_list:
  - server.js
  - src/core/api.js
  - src/actions/actions.js
  - src/locales/en.json
  - src/locales/fr.json
  - test/password-change.test.mjs
  - test/auth-revoked.test.mjs
findings:
  critical: 0
  warning: 2
  info: 6
  total: 8
status: issues_found
---

# Phase 15: Code Review Report

**Reviewed:** 2026-10-27T12:00:00Z
**Depth:** deep (per-file analysis + cross-file call-chain tracing: route → primitives, actions.js → api.js `call()` → events.js submit wiring → settings.js render bindings)
**Files Reviewed:** 7
**Status:** issues_found

## Summary

The PATCH /api/auth/password route is well constructed: same-origin before body read, per-user throttle, fresh hash re-select inside a single `begin immediate` transaction with verify → rehash → keep-current revoke-others, and a minimal `{ ok: true }` success payload. The client mapping uses stable error codes only, with no local 401 branch and the D-44 teardown proven by test. Test coverage (real server, real SQLite, two-cookie revocation, lockout boundary, cross-origin rejection) is genuinely adversarial and correct.

**No critical findings.** Two warnings: a client re-entrancy gap where Enter-key submits bypass the `is-loading` guard (double password-change request), and a response race where errors land on stale UI state if the user navigates while the request is in flight. The rest are maintainability and hardening notes. Corroborating files read for cross-file verification (not modified): `src/pages/settings.js`, `src/actions/events.js`, `src/pages/auth.js`, `src/core/api.js` `call()`/latch.

## Warnings

### WR-01: Enter-key form submission bypasses the `is-loading` guard — double password-change request

**File:** `src/actions/actions.js:2390` (with `src/actions/events.js:66-71`, `src/styles/components.css:101-104`)
**Issue:** `A.savePassword` guards against double-submit only through the button's `.is-loading` class (`pointer-events: none`). The form uses `data-submit="savePassword"`, and the global submit handler (`events.js:66`) calls `A[n](f, e)` with no in-flight check. Pressing Enter in any `#pw-*` input while the change is in flight re-enters `A.savePassword`: `S.ui.pwDone` is reset, a second concurrent `api.changePassword` fires (second budget consumption in `pwchange|<id>`), two renders and two toasts race, and the server performs the verify→rehash→revoke transaction twice concurrently. Consequence is contained (SQLite serializes the writes; second run still succeeds against the new password's hash only if the first completed) but the client invariant "one request per submit" is not actually enforced.
**Fix:** Add a module-scope in-flight flag, or disable the form in `loadingBtn`:
```js
let pwInFlight = false;
A.savePassword = () => {
  if (pwInFlight) return;
  pwInFlight = true;
  loadingBtn('pw-save', 0, async () => {
    try { /* existing body */ } finally { pwInFlight = false; }
  });
};
```

### WR-02: Async response applies errors/success to stale UI state if the user navigates mid-request

**File:** `src/actions/actions.js:2378, 2396-2426`
**Issue:** `A.savePassword` captures `e = S.ui.errors` and closure values at submit time; the async callback later mutates `e.pwCur` / sets `S.ui.pwDone = true` and calls `render()` unconditionally. If the user navigates away from the settings page while the request is in flight, the response path re-renders whatever route is now current: on failure the field error is written to a `S.ui.errors` object that no visible page consumes (error silently dropped, user gets no feedback), and on success the `pwDone` banner state is set while the toast fires for a page the user left. No data corruption, but the honest-copy contract (D-43) breaks on this path.
**Fix:** Guard the response handler with the route that initiated it, e.g. `if (S.ui.route !== 'settings') return;` before applying errors/`pwDone`, or route feedback through a state check inside the callback.

## Info

### IN-01: Session token is not rotated after a successful password change (ASVS V3.3.3 guidance)

**File:** `server.js:1358-1368`
**Issue:** The route verifies the current password and revokes other sessions but keeps the caller's original session token (deliberate keep-current, D-37). ASVS 3.3.3 recommends re-generating the session token on any re-authentication-equivalent operation. With an HttpOnly, random-UUID token and cookie-based auth the fixation risk is negligible, so this is a documented deviation rather than a defect — worth recording in the decisions log if not already covered by D-37.
**Fix:** Optional hardening: `setSessionCookie(req, res, <new token>)` for the caller's session inside the same transaction and update its `token_hash`.

### IN-02: Password policy and strength regex duplicated server/client, with near-duplicate locale keys

**File:** `server.js:1352`, `src/actions/actions.js:2384, 2409-2410`
**Issue:** The rule `nw.length < 10 || !/[0-9\W]/.test(nw)` exists verbatim in both layers (authoritative server, preemptive client) — a drift risk if one is updated. Additionally `err.passwordWeak` (client local validation) and `err.passwordTooWeak` (server code) are two locale keys with byte-identical copy in both locales, and `actions.js:2410` hardcodes `t('err.passwordTooWeak')` while sibling branches use the uniform `t('err.' + code)` pattern.
**Fix:** Extract the policy predicate to a shared constant (or at minimum a cross-reference comment), and use `t('err.' + code)` uniformly; consider consolidating the two locale keys.

### IN-03: Lockout budget is in-memory and per-process

**File:** `server.js:1196-1206` (used at `server.js:1347`)
**Issue:** `tooMany` state lives in a process-local `Map`: a server restart resets a mid-lockout brute force, and any multi-instance deployment gives each replica its own 10-attempt budget. This exactly matches the accepted login-throttle design and the threat model (T-15-05/06 accept), so it is recorded here for completeness, not as a regression.
**Fix:** If the app ever scales horizontally or needs restart-persistence, move lockout counters to the SQLite store.

### IN-04: New password persists in `S.ui.pwNew` across unrelated forms after a failed change

**File:** `src/actions/actions.js:2370, 2404-2414` (with `src/pages/auth.js:75, 94, 112`)
**Issue:** The D-39 round-trip works via `IN.pwStrength` writing to `S.ui.pwNew`, and `#pw-new` re-renders from it. But `S.ui.pwNew` is shared with the signup/login/reset pages' password inputs (`auth.js` binds `value="${esc(S.ui.pwNew || '')}"`). A failed password change leaves the typed new password in state; navigating to a signup or login screen later prefills it there (visible via the strength meter). The success path clears it (`actions.js:2422`); only the failure path retains it, and that retention is pre-existing shared-state design rather than phase-15 code.
**Fix:** Clear `S.ui.pwNew` on route change away from settings, or namespace the settings new-password value separately from the auth forms.

### IN-05: `passwordRequired` maps under the current-password field although it can also mean an empty new password

**File:** `src/actions/actions.js:2407-2408`, `server.js:1351`
**Issue:** The server emits `passwordRequired` when either field is empty, but the client maps it exclusively to `e.pwCur`. Unreachable through the UI (client-side validation runs first), so it is a mapping inaccuracy that only manifests for direct API consumers or future validation changes.
**Fix:** Map `passwordRequired` to a form-level error or branch on which field the server saw empty (requires server-side distinction).

### IN-06: Throttle consumption precedes body validation — trivially repeatable 400s burn the budget

**File:** `server.js:1347-1351`
**Issue:** `tooMany` fires before `readJson`, so even empty-body 400s consume one of the user's 10 attempts. This is explicit and commented (D-41: "every attempt … has already consumed one try"), and the caller is already cookie-authenticated, so worst case is a 15-minute self-DoS of password-change by a client in a loop. Accepted design; noted only because the consequence (a legitimate user locked out by their own buggy client) differs from the login route, where the body parse happens before the throttle.
**Fix:** None required. If the client-side double-submit (WR-01) is fixed, this path is effectively unreachable in practice.

---

_Reviewed: 2026-10-27T12:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
