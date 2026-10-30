---
phase: 21-disable-2fa-verification-closure
verified: 2026-10-29T00:00:00Z
status: passed
score: 9/9 must-haves verified
behavior_unverified: 0
overrides_applied: 0
covered_files:
  - server.js
  - test/tfa-disable.test.mjs
  - test/tfa-enrollment.test.mjs
  - e2e/tfa-disable-cycle.spec.mjs
  - src/locales/en.json
  - src/locales/fr.json
  - .planning/phases/21-disable-2fa-verification-closure/21-01-PLAN.md
  - .planning/phases/21-disable-2fa-verification-closure/21-02-PLAN.md
  - .planning/phases/21-disable-2fa-verification-closure/21-01-SUMMARY.md
  - .planning/phases/21-disable-2fa-verification-closure/21-02-SUMMARY.md
covered_digest: "v2:sha256:a94e10351b2c4965befe7046ccd1164e4c2d74d662958966bd7feba28e4fac40"
---

# Phase 21: Disable 2FA — Verification Closure Verification Report

**Phase Goal:** Turning 2FA off is verified end-to-end against the full contract — no ghost 2FA state, no recovery-code shortcut — and covered by automated proof.
**Verified:** 2026-10-29
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Plan 01 truths (D-101..D-108):

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Valid unused recovery code → 400 codeRejected, burns nothing, 2FA stays on (D-101/D-102) | ✓ VERIFIED | server.js:1670 strict `^\d{6}$` gate, zero recovery-code lookup in route; test/tfa-disable.test.mjs recovery-rejection test + tfa-enrollment.test.mjs rewritten D-101/D-102 test — both pass |
| 2 | Structural invariant: no recovery-code lookup/verify in disable route body | ✓ VERIFIED | Grep of server.js:1656-1707 — only reference is the D-59 teardown `delete from recovery_codes` (a wipe, documented in route comment); no recoveryHash/normalizeRecoveryCode/select-recovery_codes |
| 3 | Disable deletes all pending login_challenges in same transaction; challenge token dead after (D-103/D-104) | ✓ VERIFIED | server.js:1694 user-scoped delete inside transaction; test asserts 401 challengeExpired on /api/auth/tfa/login after disable — passes |
| 4 | Revoke-all-sessions-except-caller; caller stays signed in (D-105) | ✓ VERIFIED | server.js:1697 delete with `token_hash != tokenHash` (cookie-derived sha256, server.js:1672); test proves second session revoked while caller stays 200; cross-user survival test proves scoping |
| 5 | Exactly one `tfa_disabled` security_log row after commit; zero rows on failure paths (D-107) | ✓ VERIFIED | server.js:1705 logSecurity between committed 'ok' and 200; test counts rows on success and wrong-password failure — passes |
| 6 | Throttle 5/15min → 429 on 6th; wrong passwords consume tries; corrupted envelope 503 masterKeyMissing, zero mutation (D-108/T-21-06) | ✓ VERIFIED | server.js:1661 tooMany gate; tests for lockout, try consumption, and fail-closed 503 — all pass |
| 7 | All teardown + verification in one transaction with fresh re-select (Pitfall 4) | ✓ VERIFIED | server.js:1676-1699 single `transaction(...)` containing re-select, both factor verifications and all four teardown statements; no writes on any miss |

Plan 02 truths (D-109..D-111):

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 8 | One Chromium spec drives full cycle EN+FR: enable → 2FA login → disable → login without 2FA → re-enable (D-109) | ✓ VERIFIED | e2e/tfa-disable-cycle.spec.mjs parametric `for (const lang of ['en','fr'])`; 4 tests enumerated via `npx playwright test --list`; executor ran suite 59/59 pass |
| 9 | UI-level recovery-code rejection regression + honest 401 session teardown + fmt()-backed copy with i18n-scan green (D-102@UI, D-106, D-111) | ✓ VERIFIED | Spec asserts server codeRejected copy under the code field with nothing disabled, `err.signedOutElsewhere` teardown on second context; all assertions `fmt()`-backed; `npm run i18n:scan` re-run by verifier → 0 literals/0 pending/0 unlisted/0 stale; en.json:1281 + fr.json:1281 both define settings.tfa.disabledToast |

**Score:** 9/9 truths verified (0 present-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server.js` (disable route) | Strict gate + one-transaction teardown + session policy + verb | ✓ VERIFIED | Lines 1656-1707, all D-invariants present with comments |
| `test/tfa-disable.test.mjs` | Server-level regression suite | ✓ VERIFIED | 8 tests, verifier re-ran: 8/8 pass |
| `test/tfa-enrollment.test.mjs` | Superseded D-57 test rewritten | ✓ VERIFIED | D-101/D-102 (supersedes D-57) test present, passing in full 555/555 run |
| `e2e/tfa-disable-cycle.spec.mjs` | EN+FR Chromium cycle spec | ✓ VERIFIED | 4 tests enumerated; drives real `tfaDisableConfirm` form |
| `src/locales/en.json` / `fr.json` | Disable strings catalogued | ✓ VERIFIED | settings.tfa.disabledToast present in both (line 1281) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| server.js disable route | sessions table | tokenHash = sha256(cookie) computed before transaction, used in D-105 delete | ✓ WIRED | server.js:1672 → 1697 |
| server.js disable route | login_challenges | user_id-keyed delete inside transaction | ✓ WIRED | server.js:1694, schema server.js:117-123 |
| server.js disable route | security_log | logSecurity between commit and 200 | ✓ WIRED | server.js:1705 |
| e2e spec | disable form | data-submit='tfaDisableConfirm' + #tfa-off-* selectors | ✓ WIRED | Spec locates the shipped form; 59/59 e2e pass |
| e2e spec | locale catalogue | fmt(key, params, lang) from en/fr.json | ✓ WIRED | i18n-scan green re-verified |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Disable server suite | `node --test test/tfa-disable.test.mjs` | 8/8 pass (verifier-run) | ✓ PASS |
| E2E test enumeration | `npx playwright test e2e/tfa-disable-cycle.spec.mjs --list` | 4 tests (cycle + session policy × en/fr) | ✓ PASS |
| i18n discipline | `npm run i18n:scan` | 0 literals / 0 pending / 0 unlisted / 0 stale | ✓ PASS |
| Full node regression | `npm test` (executor) | 555/555 pass | ✓ PASS |
| Full Playwright suite | (executor) | 59/59 pass | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DIS-01 | 21-01, 21-02 | Disable route verified/fixed: pending challenges torn down, no ghost 2FA state | ✓ SATISFIED | Truths 3, 7, 8 |
| DIS-02 | 21-01, 21-02 | Recovery code can never disable 2FA — password + live TOTP required | ✓ SATISFIED | Truths 1, 2, 9 |

No orphaned requirements — REQUIREMENTS.md maps exactly DIS-01 and DIS-02 to Phase 21, both claimed.

### Code Review Findings Disposition

The open review (21-REVIEW.md, dispositioned in 21-REVIEW-DISPOSITION.md) raises two warnings. Neither maps to a phase success criterion, so neither is a gap:

- **WR-01** (no `two_fa_enabled` pre-check → a non-2FA user gets 503 masterKeyMissing instead of 409 tfaNotEnabled, unlike the sibling recovery route): cosmetic/operational-consistency only. The step-up still cannot pass for a non-enabled account (empty secret fails requireTotpSecret fail-closed), so there is no security or ghost-state impact. **Advisory — recommend fixing in a follow-up.**
- **WR-02** (`tfa_disabled` logged after commit vs the regen route's in-transaction pattern): the plan's own D-107 specified after-commit placement, so the implementation matches its contract; the inconsistency is a cross-route style concern. Success-only semantics are preserved. **Advisory.**
- IN-01/02/03 (info): cosmetic, no action required for this phase.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| server.js | 1677-1701 | Missing two_fa_enabled 409 pre-check (WR-01) | ⚠️ Warning (advisory) | Misleading 503 for non-2FA users; no security impact |
| server.js | 1705 | Verb logged outside transaction (WR-02) | ⚠️ Warning (advisory) | Cross-route inconsistency; success-only preserved |
| e2e spec | loginWith2fa | Approximate consumed step (IN-02) | ℹ️ Info | Retry logic absorbs boundary race |

No TBD/FIXME/XXX debt markers in phase-modified files; no stubs (all routes wired with real DB mutations, real data flow).

### Human Verification Required

None — every truth had behavioral evidence (verifier-ran node suite + executor-ran full suites + i18n-scan re-run). Visual/UX aspects of the disable form are covered by the e2e specs driving the real form with locale-catalogue assertions.

### Gaps Summary

None. All four success criteria are met with regression-tested, e2e-covered, i18n-clean evidence. The two open review warnings are advisory improvements outside the phase contract and are recommended as follow-up work (WR-01 is a ~3-line fix mirroring server.js:1736).

---

_Verified: 2026-10-29_
_Verifier: the agent (gsd-verifier)_
