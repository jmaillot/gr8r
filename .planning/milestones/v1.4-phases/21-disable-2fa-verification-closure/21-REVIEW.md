---
phase: 21-disable-2fa-verification-closure
reviewed: 2026-10-29T00:00:00Z
depth: standard
files_reviewed: 25
files_reviewed_list:
  - CHANGELOG.md
  - DEPLOY.md
  - docker-compose.yml
  - e2e/french-overflow.spec.mjs
  - e2e/tfa-disable-cycle.spec.mjs
  - index.html
  - mailer.js
  - public/favicon.svg
  - README.md
  - server.js
  - src/core/icons.js
  - src/data/seed.js
  - src/locales/en.json
  - src/locales/fr.json
  - src/pages/auth.js
  - src/pages/design-system.js
  - test/catalogue.test.mjs
  - test/i18n-core-features.test.mjs
  - test/i18n-pages.test.mjs
  - test/i18n-shell.test.mjs
  - test/qr.fixture.test.mjs
  - test/tfa-disable.test.mjs
  - test/tfa-enrollment.test.mjs
  - test/totp.fixture.test.mjs
  - totp.js
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 21: Code Review Report

**Reviewed:** 2026-10-29
**Depth:** standard
**Files Reviewed:** 25
**Status:** issues_found

## Summary

The phase's core work — the `/api/auth/tfa/disable` route (server.js:1656–1707), its unit suite (test/tfa-disable.test.mjs), the enrollment suite, and the e2e cycle spec — is solid. The strict 6-digit gate (D-101) leaves no recovery-code path; the teardown (secret wipe, recovery-code delete, challenge delete, revoke-others) is one transaction with fresh re-select inside it; the decrypt boundary fails closed 503; the security verb logs success-only; the throttle is a distinct per-user budget. RFC fixture vectors in totp.js and the replay guard (D-04, `<=` not `===`) are correct. The mailer, docker-compose (MASTER_KEY now required via `:?`), and locale parity (the `contract.*` / fr `many` asymmetries are the documented catalogue exceptions, enforced by test/catalogue.test.mjs) all check out.

Two warnings: the disable route conflates "2FA not enabled" with an undecryptable secret (misleading 503), and its success-only security verb runs outside the transaction, unlike the recovery-regen route which logs inside it. No critical issues found.

## Warnings

### WR-01: Disable route conflates "2FA not enabled" with an undecryptable secret → misleading 503

**File:** `server.js:1677-1683, 1701`
**Issue:** The route never checks `fresh.two_fa_enabled` before decrypting. For a user with 2FA off, `two_fa_secret` is `''`, so `requireTotpSecret('')` fails and the caller receives `503 masterKeyMissing` ("MASTER_KEY is not configured or the stored secret is undecryptable") — an admin-facing signal that will trigger false MASTER_KEY alerts — instead of the `409 tfaNotEnabled` that the sibling recovery-regen route (server.js:1736, 1757) correctly returns in the same situation. No security impact (the step-up still can't pass), but the observable contract is inconsistent and operationally misleading.
**Fix:** Mirror the recovery route's ordering, inside the transaction:

```js
const fresh = db.prepare('select password_hash, two_fa_enabled, two_fa_secret, two_fa_last_step from users where id = ?').get(user.id);
if (!fresh || !fresh.two_fa_enabled) return 'notEnabled';
if (!verifyPassword(cur, fresh.password_hash)) return 'password';
const wrapped = requireTotpSecret(fresh.two_fa_secret);
if (!wrapped.ok) return 'masterKey';
```
…and map `notEnabled` to `fail(res, 409, 'tfaNotEnabled', 'Enable two-factor authentication first')`. Add a regression test for a 2FA-off account posting to `/api/auth/tfa/disable`.

### WR-02: `tfa_disabled` security verb is logged outside the transaction — inconsistent with the regen route and unguarded against post-commit failure

**File:** `server.js:1696-1706` (cf. `server.js:1753-1755`)
**Issue:** The recovery-regen route inserts its `tfa_recovery_regenerated` verb inside the transaction (D-99); the disable route calls `logSecurity` after the transaction commits. If that insert throws (busy_timeout exhaustion, disk error), the teardown is already committed but the client receives a 500 from the catch-all handler — so a successful disable surfaces as an error, and a retry hits the throttle budget. Success-only semantics are preserved either way, but the two routes should use one pattern, and the stronger one (in-transaction, per D-99) already exists in the same file.
**Fix:** Move `logSecurity(user.id, 'tfa_disabled');` inside the `transaction(() => { ... })` body, just before `return 'ok'`, and drop the standalone call at line 1705.

## Info

### IN-01: `enableTfa` helper ignores its third argument — misleading call sites

**File:** `test/tfa-disable.test.mjs:110, 203, 204, 223, 240, 256`
**Issue:** `enableTfa(c, name)` takes two parameters, but five call sites pass `server2` as a third argument (`enableTfa(a, 'disCrossA', server2)`). It works only because the client `a` is already scoped to `server2`; the extra argument is silently dropped. A future reader may assume the helper honors the server argument (it does not derive `srv` from it, unlike every other helper in the file).
**Fix:** Either accept and use `srv = server` in the signature (threading it into `enabledSecrets` keys if needed) or delete the extra arguments.

### IN-02: e2e `loginWith2fa` returns an approximate consumed step, off-by-one absorbed by retries

**File:** `e2e/tfa-disable-cycle.spec.mjs:141-149`
**Issue:** The helper returns `Math.floor(Date.now() / 1000)` after submission, but the accepted code was computed at `now + 1`, so the true matched step can be one higher than reported. `nextWindow()` then under-waits by up to one 30s window and the next submit can hit the D-04 replay guard — which the helper's single retry (and `disableWithTotp`'s retry) happens to absorb. This is a flake reservoir, not a correctness bug.
**Fix:** Have `submitTfaCode` expose the epoch second used for the accepted code (the value passed to `tfaCodeAt`) and return that from `loginWith2fa`, so `nextWindow` waits against the actually-consumed step.

### IN-03: Mailer falls back to AUTH PLAIN when the server advertises no AUTH mechanism

**File:** `mailer.js:333-337`
**Issue:** `authenticate()` calls `authPlain()` when `mechanisms.length === 0`, sending base64 credentials to a server that never advertised AUTH. Default `SMTP_REQUIRE_TLS=true` keeps this off the wire in plaintext, and the command will simply fail — but an explicit "no usable AUTH method" error (like the one already thrown for unknown mechanisms) would surface misconfiguration faster than a 503/535 from the server.
**Fix:** When `mechanisms.length === 0`, throw the same `SMTP server does not support a usable AUTH method` error instead of speculatively sending `AUTH PLAIN`.

---

_Reviewed: 2026-10-29_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
