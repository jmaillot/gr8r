---
phase: 20-recovery-code-regeneration
verified: 2026-10-29T08:13:25Z
status: human_needed
score: 9/9 must-haves verified
covered_files:
  - .planning/phases/20-recovery-code-regeneration/20-01-PLAN.md
  - .planning/phases/20-recovery-code-regeneration/20-01-SUMMARY.md
  - .planning/phases/20-recovery-code-regeneration/20-02-PLAN.md
  - .planning/phases/20-recovery-code-regeneration/20-02-SUMMARY.md
  - server.js
  - src/actions/actions.js
  - src/core/api.js
  - src/locales/en.json
  - src/locales/fr.json
  - src/pages/settings.js
  - test/tfa-recovery-regen.test.mjs
covered_digest: "v2:sha256:5d151719b6b25d25d27a5808b5b4d9e06b455b2457437aee720bc5fa3a1b8664"
behavior_unverified: 0
overrides_applied: 0
prohibitions:
  - statement: "A recovery code must never satisfy the regeneration step-up (D-85)"
    status: verified
    verification: test
    evidence: "server.js:1717-1719 — 6-digit-only gate, no recovery_codes lookup in the route block; test 'D-85 headline regression' passes"
  - statement: "Plaintext recovery codes never written to any persistent store (D-97)"
    status: verified
    verification: test
    evidence: "server.js:1741-1743 — only recoveryHash(normalizeRecoveryCode(c)) inserted; test asserts 10 new hashes with plaintext absent"
  - statement: "Neither password alone nor TOTP alone may authorize regeneration (D-86)"
    status: verified
    verification: test
    evidence: "server.js:1731-1739 — both verifyPassword and verifyTotpCode must pass inside the transaction before any write; wrong-password and stale-code tests pass"
  - statement: "No new recovery-codes display machinery; codes only via D-53 modal, never persisted client-side (D-91)"
    status: verified
    verification: judgment
    evidence: "actions.js:2558-2561 — transient S.ui.recoveryCodes + openModal({type:'recovery'}); A.recoveryDismiss nulls state; no localStorage/sessionStorage writes (grep clean)"
  - statement: "Regen form never accepts a recovery code as its code field (D-85 client half)"
    status: verified
    verification: judgment
    evidence: "settings.js:420-429 — code field is inputmode=numeric / autocomplete=one-time-code, labeled '6-digit code'; server gate is structural backstop"
human_verification:
  - test: "Open Settings → 2FA card (on state), click 'Regenerate recovery codes', submit current password + a live 6-digit code"
    expected: "The one-time recovery modal opens showing 10 new codes exactly once; dismissing it clears them; old codes fail on next login; the inline form is gone (no password field lingers)"
    why_human: "Visual rendering and modal UX cannot be verified by grep; the D-53 modal reuse is wired but the end-to-end browser flow was not exercised by the server test file"
  - test: "Verify the regenerated-codes flow in French locale (fr.json)"
    expected: "All regen strings render in real French; regenToast shows after success"
    why_human: "String presence verified in both locale files; on-screen rendering and layout in FR is visual"
---

# Phase 20: Recovery-Code Regeneration Verification Report

**Phase Goal:** A user with 2FA enabled can replace their recovery codes when they suspect exposure — with the strongest step-up, and atomic burn-and-replace semantics.
**Verified:** 2026-10-29T08:13:25Z
**Status:** human_needed (automated checks all green; 2 UI-flow items need a human)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | POST password + live TOTP → `{ok:true, recoveryCodes:[10 plaintext]}` | ✓ VERIFIED | server.js:1704–1755 route; test 1 passes |
| 2 | Old hashes gone, exactly 10 new hashes with used_at null — one transaction | ✓ VERIFIED | server.js:1738–1744 (delete-all + insert-new inside `transaction()`); test 1 asserts hash-set state |
| 3 | Recovery code as step-up rejected 400 codeRejected, stored set byte-unchanged | ✓ VERIFIED | test 2 passes (D-85 regression) |
| 4 | Wrong password burns a try; 6th attempt in 15 min → 429 tooManyAttempts | ✓ VERIFIED | server.js:1710 throttle `tfa-regen\|${id}`, 5/15min; test 4 passes |
| 5 | 2FA-disabled user → 409 tfaNotEnabled before any factor check | ✓ VERIFIED | server.js:1729–1730; test 3 passes |
| 6 | MASTER_KEY unusable → 503 masterKeyMissing, nothing mutated | ✓ VERIFIED | requireTotpSecret fail-closed inside transaction before writes; test 5 passes |
| 7 | Exactly one security_log row `tfa_recovery_regenerated` on success | ✓ VERIFIED | server.js:1746–1747 inside transaction (success-only) |
| 8 | UI: regen button → inline password+6-digit form with warning; submit calls POST /api/auth/tfa/recovery; codes via D-53 modal, shown once, cleared on dismiss | ✓ VERIFIED | settings.js:410/423–429, actions.js:2542–2563, api.js:275–277; no persistence (grep clean) |
| 9 | EN + FR keys for all new strings; i18n-scan green | ✓ VERIFIED | en.json:1284–1289 / fr.json:1284–1289, err.tfaNotEnabled both files (en:298, fr:299) |

**Score:** 9/9 truths verified (0 present-but-behavior-unverified; the server half's runtime behavior is proven by the passing integration test file)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server.js` POST /api/auth/tfa/recovery | Route block after disable route | ✓ VERIFIED | server.js:1704, placed after disable block; substantive, wired by router |
| `server.js` security_log table + index | SCHEMA entries | ✓ VERIFIED | server.js:162–168 |
| `server.js` logSecurity(userId, verb) | Helper | ✓ VERIFIED | server.js:1425–1426; used at :1747 |
| `test/tfa-recovery-regen.test.mjs` | Integration tests | ✓ VERIFIED | 212 lines; **5/5 pass** when run (`node --test test/tfa-recovery-regen.test.mjs`) |
| `src/core/api.js` tfaRecover | Client method | ✓ VERIFIED | api.js:275–277, calls POST /api/auth/tfa/recovery |
| `src/actions/actions.js` tfaAskRegen/tfaRegenConfirm | Handlers | ✓ VERIFIED | actions.js:2537, 2542; wired to DOM data attributes |
| `src/pages/settings.js` regen stage | data-a/data-submit wired | ✓ VERIFIED | settings.js:410, 423, 427 |
| `src/locales/en.json` + `fr.json` | New keys | ✓ VERIFIED | All 7 settings.tfa.regen* + err.tfaNotEnabled in both |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| Route transaction | requireTotpSecret | only decrypt path | ✓ WIRED | server.js:1734 |
| Route transaction | two_fa_last_step update | same transaction | ✓ WIRED | server.js:1738 |
| Insert | recoveryHash(normalizeRecoveryCode(c)) | one normalization | ✓ WIRED | server.js:1742 |
| Route | tooMany budget | before factor checks | ✓ WIRED | server.js:1710 |
| A.tfaRegenConfirm | api.tfaRecover → D-53 modal | recoveryCodes → S.ui → openModal | ✓ WIRED | actions.js:2550–2561 |
| settings.js form | A.tfaRegenConfirm | data-submit + #id values | ✓ WIRED | settings.js:423–427 |
| Error switch | err.* keys incl. tfaNotEnabled | both locales | ✓ WIRED | actions.js:2553–2556 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Regen integration suite | `node --test test/tfa-recovery-regen.test.mjs` | 5 pass, 0 fail (happy path, D-85 regression, 409, throttle lockout, stale-code/503) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| REGEN-01 | 20-01, 20-02 | Regenerate via POST /api/auth/tfa/recovery — password + live TOTP required; recovery code never satisfies step-up | ✓ SATISFIED | Route + D-85 gate + passing regression test; UI entry point wired |
| REGEN-02 | 20-01, 20-02 | Atomic delete-all + insert-new in one transaction; plaintext displayed once, never stored | ✓ SATISFIED | Transaction block server.js:1728–1748; D-53 modal reuse; no persistence paths |

No orphaned requirements: REQUIREMENTS.md maps exactly REGEN-01 and REGEN-02 to Phase 20, both claimed by both plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | No TBD/FIXME/XXX/TODO/placeholder markers, no stub returns, no localStorage writes in touched files | — | — |

### Prohibitions

All 5 prohibition items verified (3 test-tier with passing wired tests, 2 judgment-tier with structural code evidence) — see frontmatter. No flagged or unverified prohibitions.

### Human Verification Required

1. **End-to-end regen UI flow** — submit password + live TOTP in the settings card; expect the one-time modal with 10 codes, dismissed-once semantics, old codes dead, form cleared (details in frontmatter).
2. **French locale rendering** of the regen flow.

### Gaps Summary

No gaps. All 9 must-have truths verified, all artifacts substantive and wired, all key links connected, all requirements accounted for, 5/5 integration tests pass on a fresh run. Status is `human_needed` solely because the browser-side user flow (modal rendering, locale display) is visually verifiable only by a human — a standard end-of-phase UAT, not a defect.

---

_Verified: 2026-10-29T08:13:25Z_
_Verifier: the agent (gsd-verifier)_
