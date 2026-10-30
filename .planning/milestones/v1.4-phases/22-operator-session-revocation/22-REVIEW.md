---
phase: 22-operator-session-revocation
reviewed: 2026-10-29T00:00:00Z
commits_reviewed: [9f53552, 171f046, e9303b4, a19e465, da4c654, 90e6379]
depth: deep
files_reviewed: 9
files_reviewed_list:
  - server.js
  - test/operator-revoke.test.mjs
  - src/pages/settings.js
  - src/core/api.js
  - src/actions/actions.js
  - src/locales/en.json
  - src/locales/fr.json
  - e2e/operator-revoke-cycle.spec.mjs
  - test/i18n-core-features.test.mjs
findings:
  critical: 0
  major: 1
  minor: 3
  total: 4
status: issues_found
---

# Phase 22: Code Review Report

**Reviewed:** 2026-10-29
**Depth:** deep
**Commits:** 9f53552, 171f046, e9303b4, a19e465, da4c654, 90e6379 (v1.3..90e6379)
**Files Reviewed:** 9
**Status:** issues_found

## Summary

The auth-critical surface was traced end-to-end: the `is_instance_admin` schema migration + boot stamp, the `isInstanceAdmin` DB-flag gate, the `POST .../revoke-sessions` route (sameOrigin → requireUser → throttle → gate → 404 → ownerImmune → single keep-current DELETE → live counts → success-only security verb), the unthrottled `GET /api/auth/operator/users` read route, the settings operator card (XSS-escaped, server-ground-truth gated), catalogue strings, and the EN+FR lifecycle e2e.

Guard order matches the plan exactly; the gate reads the DB column only (no ADMIN_EMAIL/workspace-role references in the route blocks); owner immunity precedes any session query; the throttle keys on the caller and increments before the gate. `currentUser()` joins `users` via `u.*`, so the flag is always fresh from the DB — no stale-payload privilege. The card escapes all interpolated user data (`esc()` on name/email/id). i18n pins (verbs 30→32, catalogue 1582→1594) are arithmetically correct. `node --test test/operator-revoke.test.mjs` re-run during this review: 11/11 pass.

One availability-class major (silent zero-operator boot stamp) and three minors. No critical findings.

## Major Issues

### WR-01: `stampInstanceAdmin()` silently no-ops when no user matches ADMIN_EMAIL, yielding an operator-less instance

**File:** `server.js:962-968` (stampInstanceAdmin)
**Issue:** The stamp fires only when `count(is_instance_admin = 1) === 0`, then runs `update users set is_instance_admin = 1 where email = ? collate nocase`. If no row matches (ADMIN_EMAIL renamed after install, or the bootstrap account was deleted), the UPDATE changes 0 rows and the function returns silently. Because no API route can grant the flag (by design, D-112), the instance is left with zero operators — the new operator surface is permanently unreachable, and nothing in the boot log hints at why. This is an availability/operability defect on exactly the pre-v1.4-upgrade path the stamp exists to serve.
**Fix:** Log a boot warning when the gate condition holds but the UPDATE matched nothing:

```js
function stampInstanceAdmin() {
  if (db.prepare('select count(*) as n from users where is_instance_admin = 1').get().n > 0) return;
  const email = (process.env.ADMIN_EMAIL || 'admin@example.com').trim();
  const res = db.prepare('update users set is_instance_admin = 1 where email = ? collate nocase').run(email);
  if (res.changes === 0) console.warn(`[bootstrap] no operator flagged: no users row matches ADMIN_EMAIL (${email}); set is_instance_admin=1 manually (D-114)`);
}
```

## Minor Issues

### IN-01: `logSecurity` records a verb even when the revoke deleted zero rows

**File:** `server.js:1978` (revoke route)
**Issue:** A 200 with `revoked: 0` (target had no sessions, or a self-target holding only the current session) still inserts a `sessions_revoked_by_operator` security_log row. The plan mandates "success-only" logging and this is technically a success, but the verb overstates what happened — the audit trail says sessions were revoked when none were. Downstream security-log consumers cannot distinguish a real revocation from a no-op.
**Fix:** Either branch the verb (`sessions_revoked_by_operator` only when `del.changes > 0`) or include `revoked` in the log payload; keep the current behavior only if the no-op row is considered intentional audit noise — document it.

### IN-02: `refreshOperatorUsers()` fires on the tfa settings tab although the card lives only on the sessions tab

**File:** `src/actions/actions.js:213` (A.go hook)
**Issue:** The mount hook calls `refreshOperatorUsers()` whenever `p.sec` is `sessions` **or** `tfa`, but `operatorCard()` is appended only in the sessions section (`settings.js:513`). Operators get one wasted `GET /api/auth/operator/users` request every time they open the Two-step sign-in tab.
**Fix:** Restrict the call to the sessions section: `if (p.sec === 'sessions') refreshOperatorUsers();`.

### IN-03: e2e `loginWith2fa` retry assumes failure mode is `err.invalidTfaCode`

**File:** `e2e/operator-revoke-cycle.spec.mjs:141-146`
**Issue:** After a failed first 2FA submit, the retry path asserts `err.invalidTfaCode` is visible before retrying. If the first failure was a *challenge expiry* (`err.challengeExpired`) rather than a code rejection, the assertion fails and masks the retry that would have succeeded. Low likelihood (the retry happens within seconds), but it makes the spec flaky-shaped for a failure mode the codebase already models.
**Fix:** Accept either rejection copy before retrying, e.g. `expect(page.getByText(new RegExp(`${fmt('err.invalidTfaCode')}|${fmt('err.challengeExpired')}`))).toBeVisible()`.

## Verified clean (no action)

- **Privilege gate (T-22-01):** `isInstanceAdmin` reads `user.is_instance_admin === 1` from the DB row only; route blocks contain no ADMIN_EMAIL / isAdminUser / membership references. Workspace-owner-without-flag fixture pinned by test.
- **Owner immunity (T-22-03):** `ownerImmune` 403 precedes any `sessions` query in source order; self-target carve-out (`target.id !== operator.id`) matches D-118 and is pinned by the surviving-cookie test.
- **CSRF (T-22-02/T-22-06):** `sameOrigin` is the first guard on both routes, before body reads and throttle.
- **Throttle (T-22-04):** caller-keyed `operator-revoke|<id>`, increments before the gate; 5/15min band and refusal-counting pinned by tests. The read route is deliberately unthrottled per D-121.
- **Data exposure:** users-list rows expose exactly the five D-121 fields; no session/token/2FA columns; exact-shape deepEqual test.
- **XSS:** all operator-card interpolations of user-controlled data pass through `esc()`; ids in `data-id` attributes escaped.
- **Migration:** `ensureColumn` def byte-identical to the SCHEMA column def; boot-stamp provisioning (fresh + pre-v1.4 + idempotence) regression-tested.
- **i18n:** 10 `settings.operator.*` keys in both locales; error codes `operatorOnly`/`ownerImmune` catalogued EN+FR; pinned counts advanced correctly (verbs 32, keys 1594); no raw literals in the spec (fmt()-only).

---

_Reviewed: 2026-10-29_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
