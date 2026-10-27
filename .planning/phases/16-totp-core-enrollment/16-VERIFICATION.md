---
phase: 16-totp-core-enrollment
verified: 2026-10-27T00:00:00Z
status: human_needed
score: 14/17 must-haves verified
covered_files: [".planning/phases/16-totp-core-enrollment/16-01-PLAN.md", ".planning/phases/16-totp-core-enrollment/16-01-SUMMARY.md", ".planning/phases/16-totp-core-enrollment/16-02-PLAN.md", ".planning/phases/16-totp-core-enrollment/16-02-SUMMARY.md", ".planning/phases/16-totp-core-enrollment/16-03-PLAN.md", ".planning/phases/16-totp-core-enrollment/16-03-SUMMARY.md", "server.js", "src/actions/actions.js", "src/core/api.js", "src/lib/qr.js", "src/lib/vendor/qrcode.js", "src/locales/en.json", "src/locales/fr.json", "src/overlays/modals.js", "src/pages/settings.js", "test/migration.test.mjs", "test/qr.fixture.test.mjs", "test/tfa-enrollment.test.mjs", "test/totp.fixture.test.mjs", "totp.js"]
covered_digest: "v2:sha256:bd6c1bb45036da30a5315c7d1d62473cb5b1368086be96909dbd740028a149fd"
behavior_unverified: 3
overrides_applied: 0
---

# Phase 16: TOTP Core & Enrollment Verification Report

**Phase Goal:** A user can enroll a real TOTP authenticator: `node:crypto` secret, live 6-digit verification with replay protection, a genuinely scannable QR from a vendored encoder, and mandatory hashed recovery codes — no unverified-secret lockout.
**Verified:** 2026-10-27
**Status:** human_needed (3 UI truths present + wired, no render-test harness exists — Phase 18 real-device UAT is the planned human checkpoint)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | RFC 4226 (10×6-digit) + RFC 6238 SHA-1 (5×8-digit) fixture vectors pass against local TOTP impl (TFA-01) | ✓ VERIFIED | `node --test test/totp.fixture.test.mjs test/qr.fixture.test.mjs` → 26 pass / 0 fail; totp.js implements D-04 replay guard (`s <= lastStep`), ±1 window, `timingSafeEqual` behind `/^\d{6}$/` gate, `0x7f` signed-byte mask |
| 2 | Matched step ≤ stored last step rejected; step+1 accepted and recorded (D-04) | ✓ VERIFIED | Replay-guard case in totp.fixture.test.mjs passes; server.js:1472 persists `verified.matchedStep` into `two_fa_last_step` inside the enable transaction |
| 3 | verifyTotpCode accepts current step and ±1 only | ✓ VERIFIED | Window case in totp.fixture.test.mjs (step+2 → no-match) passes |
| 4 | Vendored encoder renders real QR SVG (EC M, quiet zone 4) (TFA-02) | ✓ VERIFIED | src/lib/qr.js → `qrcode(0,'M')` + `createSvgTag({cellSize:4, margin:4})`; qr.fixture.test.mjs (real matrix >50 path segments, square viewBox, deterministic) green; vendored file carries upstream Kazuhiko Arase license header |
| 5 | otpauth URI matches D-54 exact shape incl. hostile emails | ✓ VERIFIED | buildOtpauthUri encodes only the email (Gr8r: prefix literal); hostile-email vector in totp.fixture.test.mjs green |
| 6 | Enroll requires currentPassword verified with scrypt; wrong password → no secret, consumes throttle (D-49) | ✓ VERIFIED | server.js:1434–1453 — guard order sameOrigin → requireUser → tooMany → verifyPassword before generateTotpSecret; test/tfa-enrollment.test.mjs 12/12 green |
| 7 | Pending secret memory-only with TTL; nothing written to users until enable (D-46, TFA-03) | ✓ VERIFIED | pendingTfa Map at server.js:267 (10-min TTL, lazy sweep >5000); test asserts two_fa_enabled=0 and two_fa_secret empty after enroll |
| 8 | Enable only inside one transaction after live 6-digit verify; abandoned enrollment leaves pre-enrollment state (TFA-03) | ✓ VERIFIED | server.js:1452–1492 — pending Map lookup, verifyTotpCode vs stored last step, `transaction()` wrapping enable + envelope + baseline + rotation + pending clear; noPendingEnrollment and wrong-code cases green |
| 9 | Enable issues exactly 10 lowercase-hex codes, sha256 hashes at rest, plaintext returned once (TFA-04) | ✓ VERIFIED | server.js:1477–1489 (`recoveryHash(normalizeRecoveryCode(code))`); test asserts 10 rows, 64-char hex hashes, used_at null |
| 10 | Re-enrollment deletes old rows and issues fresh set (D-53) | ✓ VERIFIED | Rotation case in tfa-enrollment.test.mjs green (`delete from recovery_codes where user_id` before insert) |
| 11 | Disable requires password AND code; complete teardown in one transaction (D-57/D-59, T-16-14) | ✓ VERIFIED | server.js:1494–1538 — single `transaction()` with fresh re-select, dual-shape verify (live via decryptTotpSecret + verifyTotpCode, recovery via normalize→hash→unburned lookup→used_at burn), teardown sets enabled=0 / secret='' / last_step=0 and deletes rows; teardown + burned-code + throttle tests green |
| 12 | MASTER_KEY missing on enable → fail-closed 503 naming MASTER_KEY, admin-facing only (D-06) | ✓ VERIFIED | server.js:1475–1476 (enable) and disable `masterKey` outcome; dedicated no-key server test green |
| 13 | Settings 2FA inline card states (off/enrolling/on) render from server ground truth, no wizard (D-56, T-16-13) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | settings.js:393–435 — on-state reads `api.user.twoFa` (server.js:342 userPayload), disable form wired to `tfaDisableConfirm`; no client render harness exists in-repo to exercise rendering |
| 14 | QR + copyable-secret fallback with copy button and "can't scan?" hint (D-48/D-55, TFA-02) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | settings.js:426–431 — `renderQrSvg(S.ui.tfaOtpauth)`, monospace readonly secret + copyText action + `settings.tfa.cantScan` hint all present and wired; actual scannability and visual layout need a human/real device |
| 15 | Live-code enable shows one-time recovery modal with copy-all; plaintext never re-displayed (D-53) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | actions.js:2494 stores codes only in transient `S.ui.recoveryCodes`; modals.js:56 renders them; `A.recoveryDismiss` nulls state before closeModal (actions.js:2532); no storage writes (grep clean); modal UX itself needs human eyes |
| 16 | Disable form takes password + single dual-shape code input (D-57) | ✓ VERIFIED (code-level) | settings.js:413–418 — one password field + one code field submitting to tfaDisableConfirm → api.tfaDisable |
| 17 | Every new UI string in en.json + fr.json; i18n pins green | ✓ VERIFIED | 26 `settings.tfa.*` keys in each locale; `node scripts/i18n-scan.mjs` → 0 literals/0 pending/0 stale; catalogue/error-code tests green in full suite (511/0) |

**Score:** 14/17 truths verified (3 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `totp.js` | TOTP core exports | ✓ VERIFIED | All 9 exports present; substantive; imported by server.js and tests |
| `src/lib/qr.js` | renderQrSvg wrapper | ✓ VERIFIED | Thin wrapper; imported by src/pages/settings.js:9 |
| `src/lib/vendor/qrcode.js` | Vendored qrcode-generator@2.0.4 | ✓ VERIFIED | License header intact; only QR path; i18n-scan exclusion for third-party dist is sound |
| `test/totp.fixture.test.mjs` | RFC vector tests | ✓ VERIFIED | Green (26 incl. qr fixtures) |
| `test/qr.fixture.test.mjs` | SVG fixture test | ✓ VERIFIED | Green |
| `POST /api/auth/tfa/enroll\|enable\|disable` | Routes | ✓ VERIFIED | server.js:1434/1452/1494, full guard chains |
| `recovery_codes` table + index | Guarded create | ✓ VERIFIED | server.js:150–157; migration test byte-identical across boots (16/16) |
| `pendingTfa` Map | Memory-only TTL store | ✓ VERIFIED | server.js:267–272 |
| `api.tfaEnroll/tfaEnable/tfaDisable` | Client API methods | ✓ VERIFIED | src/core/api.js:257–263, used in actions.js:2459/2478/2517 |
| Settings 2FA card + recovery modal | UI | ✓ VERIFIED (wired) | settings.js + modals.js + actions.js; rendering needs human |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| src/lib/qr.js | src/lib/vendor/qrcode.js | import | WIRED | default factory import; used in renderQrSvg |
| server.js | totp.js | imports verifyTotpCode, generateTotpSecret, buildOtpauthUri, generateRecoveryCode, normalizeRecoveryCode, recoveryHash | WIRED | used at every enroll/enable/disable site; one normalization (Pitfall 6) |
| test/tfa-enrollment.test.mjs | totp.js helpers | derives live codes | WIRED | integration test owns its server + temp DB, no mocks |
| src/pages/settings.js | src/lib/qr.js | renderQrSvg import | WIRED | line 9; only call site of QR rendering |
| src/core/api.js | /api/auth/tfa/* routes | fetch | WIRED | tfaEnroll/tfaEnable/tfaDisable target the three routes; no workspace slug |
| settings on-state | server ground truth | api.user.twoFa via userPayload | WIRED | server.js:342 + refreshTfa() mount/post-mutation hook |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| QR in settings card | S.ui.tfaOtpauth | enroll response `otpauth` (server-built) | Yes | ✓ FLOWING |
| Secret fallback field | S.ui.tfaSecret | enroll response `secret` | Yes | ✓ FLOWING |
| Recovery modal | S.ui.recoveryCodes | enable response `recoveryCodes` | Yes | ✓ FLOWING |
| On-state flag | api.user.twoFa | userPayload.two_fa_enabled | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| RFC vectors + replay/window/format gates | `node --test test/totp.fixture.test.mjs test/qr.fixture.test.mjs` | 26 pass / 0 fail | ✓ PASS |
| Enrollment lifecycle (step-up, no-persist, enable, rotation, teardown, throttle, fail-closed 503) | `node --test test/tfa-enrollment.test.mjs` | 12 pass / 0 fail | ✓ PASS |
| Second-boot migration purity with recovery_codes | `node --test test/migration.test.mjs` | 16 pass / 0 fail | ✓ PASS |
| Full regression suite | orchestrator-reported | 511 pass / 0 fail | ✓ PASS |
| i18n catalogue | `node scripts/i18n-scan.mjs` | 0 literals / 0 pending / 0 stale | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| TFA-01 | 16-01 | node:crypto secret, ±1 window, replay guard, timingSafeEqual | ✓ SATISFIED | totp.js + RFC fixtures green |
| TFA-02 | 16-01, 16-03 | Real scannable QR (D-54 URI, vendored encoder) + copyable-secret fallback | ✓ SATISFIED (scan itself → Phase 18 UAT) | qr fixtures green; renderQrSvg wired into card |
| TFA-03 | 16-02, 16-03 | Verify-before-enable; no unverified-secret lockout | ✓ SATISFIED | pending Map + enable transaction + integration tests |
| TFA-04 | 16-02, 16-03 | 10 single-use hashed recovery codes shown once; usable at login | ✓ SATISFIED (login-side use is Phase 17/TFA-05) | burn path implemented and tested; hashes only at rest; one-time modal |

No orphaned requirements — REQUIREMENTS.md maps exactly TFA-01…04 to Phase 16, all claimed by plans (16-01: TFA-01/02; 16-02: TFA-03/04; 16-03: TFA-02/03/04).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | — | No TBD/FIXME/XXX, no stubs, no hardcoded data, no localStorage/sessionStorage writes of recovery codes | — | — |

### Human Verification Required

### 1. Real-device QR scan (Phase 18 UAT — already planned)
**Test:** Enroll on a real phone with Google Authenticator (or equivalent): scan the QR from the settings 2FA card.
**Expected:** The account appears in the authenticator and its 6-digit code verifies at enable.
**Why human:** Scannability by a real camera app cannot be proven by tests; the D-17 fixture test only proves a well-formed matrix. Recorded as manual-only in 16-VALIDATION.md.

### 2. Enrollment card visual states
**Test:** Walk the card through off → password step-up → QR + secret + code input → on → disable in the browser.
**Expected:** All states render in place (no wizard), field errors appear in the card's error slots, disable returns to the off state.
**Why human:** No client render-test harness exists in-repo; visual layout and state transitions are human-verifiable only.

### 3. One-time recovery modal behavior
**Test:** Enable 2FA, observe the modal, use copy-all, dismiss, then reload/navigate.
**Expected:** Codes shown exactly once with copy-all working; after dismissal nothing re-displays them (and nothing is persisted).
**Why human:** The dismiss-clears-state invariant is implemented but unexercised by a test; visual one-time-only behavior needs a human.

## Human Verification Note

The 3 behavior-unverified truths are UI-rendering truths. The codebase has no client render-test harness (per 16-03 SUMMARY and Phase 14 convention — server + i18n contract tests only), and Phase 18 explicitly owns real-device UAT. Server-side behavioral truths (all of 16-01/16-02) are behaviorally proven by passing integration tests run during this verification.

## Gaps Summary

No gaps. All artifacts exist, are substantive, and are wired; all server behaviors are test-proven; both locales carry identical key sets; no stub residue (the deleted Phase 14 fake-stub pattern is not resurrected — no `D().tfa`, no hand-built QR grid). The only outstanding items are visual/real-device human checks, deliberately deferred by the phase plan to Phase 18 UAT.

---

_Verified: 2026-10-27_
_Verifier: the agent (gsd-verifier)_
