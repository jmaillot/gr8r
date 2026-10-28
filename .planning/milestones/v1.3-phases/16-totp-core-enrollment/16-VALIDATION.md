---
phase: "16"
slug: "totp-core-enrollment"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-27"
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (built-in), `node --test --test-concurrency=2 test/*.test.mjs` |
| **Config file** | none — conventions in existing `test/*.test.mjs` |
| **Quick run command** | `node --test test/totp.fixture.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/totp.fixture.test.mjs test/qr.fixture.test.mjs`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 0 | TFA-01 | T-16-SC | RFC 4226/6238 vectors, ±1 window, replay guard, timingSafeEqual behind strict 6-digit gate | unit (fixture vectors) | `node --test test/totp.fixture.test.mjs` | ❌ W0 | ⬜ pending |
| 16-01-02 | 01 | 0 | TFA-02 | — | QR SVG fixture (D-17), otpauth URI params with encodeURIComponent label | unit | `node --test test/qr.fixture.test.mjs` | ❌ W0 | ⬜ pending |
| 16-02-01 | 02 | 1 | TFA-03 | T-16-01 | Step-up gate, verify-before-enable, abandonment leaves pre-enrollment state | integration | `node --test test/tfa-enrollment.test.mjs` | ❌ W0 | ⬜ pending |
| 16-02-02 | 02 | 1 | TFA-04 | T-16-02 | 10 codes sha256-hashed at rest, burn-once, re-enroll invalidates old | integration | `node --test test/tfa-enrollment.test.mjs` | ❌ W0 | ⬜ pending |
| 16-02-03 | 02 | 1 | — | — | Second-boot no-op with new recovery_codes table (P-B) | integration | `node --test test/migration.test.mjs` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/totp.fixture.test.mjs` — TFA-01 RFC vectors + replay guard
- [ ] `test/qr.fixture.test.mjs` — D-17 QR SVG fixture
- [ ] `test/tfa-enrollment.test.mjs` — route pair + recovery codes
- (No framework install needed — `node:test` built-in)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Phone camera scans displayed QR and account appears in Google Authenticator | TFA-02 | Real camera + real authenticator app required | Enroll on a real device; scan QR; confirm 6-digit code appears in app and a live code verifies |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
