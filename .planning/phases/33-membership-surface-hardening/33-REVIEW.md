---
phase: 33-membership-surface-hardening
reviewed: 2026-11-03T12:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - server.js
  - test/hardening.test.mjs
  - test/oidc-sso.test.mjs
  - test/i18n-core-features.test.mjs
  - src/locales/en.json
  - src/locales/fr.json
findings:
  critical: 0
  warning: 0
  info: 4
  total: 4
status: clean
---

# Phase 33: Code Review Report

**Reviewed:** 2026-11-03T12:00:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** clean

## Summary

Reviewed the phase 33 hardening diff (83ec6a8..HEAD): the sameOrigin guard ordering on the invite-accept route, the shared `firstForwardedValue()` proxy-header discipline, the silent `{name,email,password}` body whitelist, fail-closed workspace resolution on both invite twins (accept + SSO reconcile), the admin link-only invite triple closure (creation 400 / accept 403 / boot sweep), and the EN+FR i18n key.

Every claim in both SUMMARYs was verified against actual source. Specific verifications:

- **HARD-01:** the guard sits at `server.js:4415`, immediately after the route match and before `tooMany()` and `readJson()` — the Pitfall-22 order is real, and the message/body is byte-identical to the tfa/login guard sites.
- **HARD-05:** `firstForwardedValue()` (server.js:2430) has exactly three consumers (`proto`, `clientIp`, `sameOrigin`); `publicBase()` was correctly left alone. `proto()`/`clientIp()` retain identical first-value split, TRUST_PROXY gating, and fallbacks. Traced the spoof residual: with `TRUST_PROXY` on and a whitespace-only first `x-forwarded-host` value, `sameOrigin()` now falls back to `Host` where the old code 403'd — this drift is in the *safe* direction (origin must still equal `proto://realHost`; an attacker cannot pass the guard with it) and is recorded as IN-02, not a vulnerability.
- **HARD-04:** the accept route destructures exactly `{name,email,password}` from `body || {}` (server.js:4446); role/teams/scope still come only from the invite row via `addMembership` (server.js:2314), and the spoof pin asserts granted values through both `memberships` and `team_members` authority rows.
- **HARD-03:** both `|| firstWorkspace()` fallbacks are gone from the accept resolve (server.js:4467) and the SSO twin (server.js:2852); the dead-workspace SSO branch consumes exactly one invite with the `:2878`-shaped write, grants nothing, skips the address-wide clearing write, fires no `sso_invite_accepted` verb, and lands `/login?sso=error` — which is the real target of `errorRedirect()` (server.js:2739), so D-04's one-generic surface holds. Protected `firstWorkspace()` sites (definition, seed-boot, read path, slug route) are untouched in the diff.
- **HARD-02:** creation-side check (server.js:4306) runs after email normalization (so `[null]` → length 0) and before the insert loop, guarded by the house `ROLE_RANK[role] >= ROLE_RANK.admin` idiom; `role` is whitelisted by `inviteRole()` at :4243 so `ROLE_RANK[role]` cannot be undefined-poisoned. Accept-side refusal (server.js:4428) fires after expiry checks and before the grant. The boot sweep (server.js:4984) is update-only, in `main()`'s boot-cleanup region after `bootstrap()`.
- **i18n:** `err.inviteAdminEmailRequired` present in both en.json and fr.json with correct French copy; the catalogue-size pin moved 1656 → 1657 with an updated ledger comment.
- **Tests executed:** `node --test test/hardening.test.mjs` → 11/11 pass; `test/oidc-sso.test.mjs`, `test/error-codes.test.mjs`, `test/i18n-core-features.test.mjs` all green (0 fail).

No critical issues and no warnings found. Four info-level observations below, none of which block shipping.

## Info

### IN-01: HARD-02b pin's membership assertion is unreachable when the user was never created

**File:** `test/hardening.test.mjs:291-315`
**Issue:** The 403 admin-refusal fires before `readJson()` and before user creation, so in the passing case no user row exists and `user` is `undefined`, making `rows = []` and the "no admin/owner membership row" assertion vacuously true. The pin still catches the real regression (a granted admin/owner membership), but the `user ? ... : []` branch means a hypothetical route that 403'd *and* created a user would go partially unobserved.
**Fix:** Optionally assert negatively first — `assert.ok(!user, 'no account is created for a refused admin invite')` before the membership read, turning the implicit behavior into a pinned one.

### IN-02: sameOrigin() x-forwarded-host whitespace edge behavior drifts from pre-refactor

**File:** `server.js:2468`
**Issue:** With `TRUST_PROXY=true` and `x-forwarded-host: ' , evil.com'`, the old code produced a truthy raw header whose first value trimmed to `''` and failed the origin compare (403); the new helper yields `''`, which is falsy, so the guard falls back to the real `Host` header. The drift cannot be exploited (the attacker still must match `proto://realHost` in Origin) and arguably improves availability, but it is an undocumented behavior change introduced by the refactor that claimed byte-identical behavior for consumers.
**Fix:** Either document the fallback in the HARD-05 comment on `firstForwardedValue`, or add a pin asserting the whitespace-first-value case falls back to `Host`.

### IN-03: proto() parses the forwarded header twice per call

**File:** `server.js:2435-2436`
**Issue:** `if (TRUST_PROXY && firstForwardedValue(req, 'x-forwarded-proto')) return firstForwardedValue(req, 'x-forwarded-proto');` performs the header read/split/trim twice. Purely a readability/efficiency nit — behavior is identical.
**Fix:**
```js
const forwarded = firstForwardedValue(req, 'x-forwarded-proto');
if (TRUST_PROXY && forwarded) return forwarded;
return req.socket.encrypted ? 'https' : 'http';
```

### IN-04: HARD-02c boot-sweep server lacks its own try/finally around the stop

**File:** `test/hardening.test.mjs:336-341`
**Issue:** In the HARD-02c test, `first.stop()` is only reached on the happy path; if `seedLegacyAdminInvite(first, ...)` throws, the first spawned server process leaks (the outer `finally` removes the temp dir but does not stop the child). Low risk — the seed is deterministic — but the other tests in the file consistently wrap their servers in try/finally.
**Fix:** Wrap from `const first = await startServer(...)` in `try { ... } finally { await first.stop(); }` mirroring the `second` server's structure.

---

_Reviewed: 2026-11-03T12:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
