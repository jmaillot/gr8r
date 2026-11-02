---
phase: 31-second-totp-factor
verified: 2026-11-02T14:30:00Z
status: passed
score: 9/9 must-haves verified
covered_files: [".planning/phases/31-second-totp-factor/31-01-PLAN.md", ".planning/phases/31-second-totp-factor/31-01-SUMMARY.md", ".planning/phases/31-second-totp-factor/31-02-PLAN.md", ".planning/phases/31-second-totp-factor/31-02-SUMMARY.md", ".planning/phases/31-second-totp-factor/31-03-PLAN.md", ".planning/phases/31-second-totp-factor/31-03-SUMMARY.md", "server.js", "src/pages/settings.js", "src/actions/actions.js", "src/core/api.js", "src/locales/en.json", "src/locales/fr.json", "test/tfa-multi-factor.test.mjs", "test/migration.test.mjs", "test/totp-encryption.test.mjs"]
covered_digest: "v2:sha256:9449d1fcf79e87109af9b0cb8efcdec93d0979dc378dfef93e5d1bf786910f89"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 9/9
  gaps_closed:
    - "Human verification items (wizard E2E, remove confirm UX, French rendering) — resolved 3/3 pass in 31-UAT.md (updated 2026-11-02T12:45Z)"
  gaps_remaining: []
  regressions: []
---

# Phase 31: Second TOTP Factor Verification Report

**Phase Goal:** A user can register multiple named TOTP factors alongside the first — each a row in `totp_factors` riding the existing `v2:` envelope keyring — with per-factor replay guards, individual removal, and no half-states. Safest feature closes the milestone.
**Verified:** 2026-11-02 (re-verification after phase 30 SSO work and the 30-06 gap closure modified server.js)
**Status:** passed
**Re-verification:** Yes — stale-covered-digest refresh; all conclusions re-derived from current code

## Re-Verification Context

server.js was modified after the prior verification by phase 30 (SSO/OIDC spine, SSO×2FA
challenge-then-stop, SSO-only 404 gate, verified-email policy) and by TFA-MAIL (security
alert email on factor changes — the UAT deferred follow-up, since implemented). This
re-verification re-ran every behavioral test and re-checked every wiring link against the
current HEAD (6a910eb). **No TOTP multi-factor regression found** — the SSO changes are
additive to the login path and the SSO×2FA composition defers to the existing TOTP
challenge, which still verifies any factor through the shared helper.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Legacy 2FA user migrates to exactly one `totp_factors` row (D-06/D-09); byte-identical second boot | ✓ VERIFIED | `migrateTotpFactors()` server.js:1977–2028 (anti-join :1999, last_step copy :2021); M1/M2 in test/tfa-multi-factor.test.mjs + migration pins — suite green |
| 2 | Login second step accepts a code from ANY enrolled factor; pending-2FA challenge verifies the staged pending secret (null baseline) | ✓ VERIFIED | login branch server.js:3116 via helper; staged challenge server.js:3032–3067 (direct verifyTotpCode on staged secret, insert :3067); T1/T3 green post-SSO |
| 3 | Per-factor replay guard (D-09/D-10); a code used once is refused on replay | ✓ VERIFIED | `update totp_factors set last_step` per matched factorId at server.js:3121/3187/3240/3368/3455; T2 replay test green |
| 4 | All step-ups (disable, regen, enroll) verify through the shared helper with existing-factor gate + required label (TOTP2-05) | ✓ VERIFIED | `verifyTotpAgainstFactors` server.js:505 (`excludeFactorId` param) decrypting only via `requireTotpSecret` :468; enroll gate server.js:3236 (password + strict 6-digit + helper verify BEFORE stash); T4–T8 green |
| 5 | Remove enforces survivor-code guard (D-15); single removal deletes only target, recovery untouched (D-17) | ✓ VERIFIED | server.js:3364 — exclusion applied only when factorCount > 1; T9–T12 green |
| 6 | Last-factor removal runs the verbatim disable teardown — no half-state (D-18, TOTP2-04) | ✓ VERIFIED | server.js:3386 teardown (flip + wipe + revoke); T11/T13 green; disable route also wipes rows (:3129) |
| 7 | Settings 2FA card lists every factor with localized name + relative last-used | ✓ VERIFIED | settings.js:481/501 from `api.tfaFactors()` (api.js:324) via actions.js:2128 — wired |
| 8 | Add-factor staged wizard (name → password+code → QR/verify) and per-factor remove confirm (no picker) wired client-side | ✓ VERIFIED | settings.js:531+ stages; handlers actions.js:3027/3054/3096; wrappers api.js:332–338 |
| 9 | EN+FR parity for all new keys; single decrypt boundary (`requireTotpSecret` only) | ✓ VERIFIED | 43/43 `settings.tfa.*` keys in both locales (re-counted); `decryptTotpSecret(` count = 4 (def/wrapper/probe/re-wrap) — pin green in current code |

**Score:** 9/9 truths verified (0 present-but-behavior-unverified — every state-transition truth is exercised by a passing named test)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `server.js` | totp_factors schema, boot copy, helper, converted branches, 4 factor routes | ✓ VERIFIED | All present at current HEAD; SSO commits did not alter factor routes |
| `test/tfa-multi-factor.test.mjs` | M1/M2, T1–T13 integration coverage | ✓ VERIFIED | Suite green (69/69 across the three suites incl. new TFA-MAIL alert tests) |
| `src/pages/settings.js` | factor rows + add wizard + remove confirm | ✓ VERIFIED | Wired into existing 2FA card |
| `src/actions/actions.js` | A.tfaAddFactor* / A.tfaFactorRemove | ✓ VERIFIED | Wired to api wrappers; 503 suppressed (D-58) |
| `src/core/api.js` | tfaFactors/tfaFactorEnroll/tfaFactorEnable/tfaFactorRemove | ✓ VERIFIED | api.js:324–338, all called from actions.js |
| `src/locales/en.json` + `fr.json` | new keys EN+FR parity | ✓ VERIFIED | 43/43 match; i18n-scan/build-locales/catalogue suites 0 fail |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| verifyTotpAgainstFactors | requireTotpSecret | helper decrypt boundary | ✓ WIRED | server.js:468–512; exclusivity pin green |
| boot copy | users.two_fa_last_step | same-transaction copy (D-09) | ✓ WIRED | server.js:1977–2028 |
| login branch | helper result → factor last_step update | no users-column writes | ✓ WIRED | server.js:3116–3121 |
| add-factor wizard | enroll/enable routes | staged addName→addPw→addVerify | ✓ WIRED | actions.js:3027/3054 |
| remove confirm | factors/remove → refreshTfa() | server ground truth re-list | ✓ WIRED | actions.js:3096–3105 |
| last-factor branch | disable teardown | verbatim delegation (D-18) | ✓ WIRED | server.js:3386 |
| SSO login (phase 30) | TOTP pending challenge | challenge-then-stop composition | ✓ WIRED | SSO path defers to existing TOTP challenge; multi-factor tests green post-SSO |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Multi-factor integration + migration + pins | `node --test test/tfa-multi-factor.test.mjs test/migration.test.mjs test/totp-encryption.test.mjs` | 69 pass / 0 fail | ✓ PASS |
| i18n parity + catalogue | `node --test test/i18n-scan.test.mjs test/build-locales.test.mjs test/catalogue.test.mjs` | 60 pass / 0 fail | ✓ PASS |
| Decrypt exclusivity | `grep -c "decryptTotpSecret(" server.js` | 4 (pinned shape) | ✓ PASS |
| EN/FR key parity | `grep -c "settings.tfa"` both locales | 43 = 43 | ✓ PASS |
| Client wiring | grep wrappers/handlers/stages | all wired | ✓ PASS |
| Debt markers | grep TBD/FIXME/XXX in phase files | none | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| TOTP2-01 | 31-01, 31-02 | Second/further TOTP factor as totp_factors row riding v2: keyring | ✓ SATISFIED | Truths 1, 4 |
| TOTP2-02 | 31-02, 31-03 | Named factors with last-used; individual removal with survivor code | ✓ SATISFIED | Truths 5, 7, 8 |
| TOTP2-03 | 31-01, 31-02 | Login + challenge accept ANY factor; per-factor replay guard | ✓ SATISFIED | Truths 2, 3 |
| TOTP2-04 | 31-02 | Last-factor removal = existing disable transaction, no half-state | ✓ SATISFIED | Truth 6 |
| TOTP2-05 | 31-02, 31-03 | New-factor enrollment requires existing-factor proof + label | ✓ SATISFIED | Truths 4, 8 |

All five phase-31 IDs appear in REQUIREMENTS.md mapped to Phase 31 and are satisfied. No orphaned requirements.

### Anti-Patterns Found

None. No stubs, no unwired artifacts, no debt markers in phase-touched files.

### Human Verification Required

None outstanding. The prior report's three items were verified by the user via UAT —
31-UAT.md records 3/3 pass (wizard E2E, remove confirm UX, French rendering), updated
2026-11-02T12:45Z. The one deferred idea (email alert on factor add/remove) was since
implemented as TFA-MAIL (commit a204dde) with its own tests, and is outside this phase's contract.

### Gaps Summary

None. All truths re-verified against current HEAD with fresh behavioral test evidence;
the phase-30 SSO work and 30-06 closure introduced no TOTP multi-factor regression.
Phase goal achieved; status upgrades from human_needed to **passed**.

---

_Verified: 2026-11-02T14:30:00Z_
_Verifier: the agent (gsd-verifier)_
