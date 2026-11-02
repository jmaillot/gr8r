---
phase: "31"
slug: "second-totp-factor"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-01"
---

# Phase 31 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node --test` (built-in), concurrency 2 |
| **Config file** | none — script in package.json |
| **Quick run command** | `node --test test/tfa-multi-factor.test.mjs test/totp-encryption.test.mjs` |
| **Full suite command** | `npm test` (all `test/*.test.mjs`) + `npm run lint` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/tfa-multi-factor.test.mjs test/totp-encryption.test.mjs`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 31-01-01 | 01 | 1 | TOTP2-01 | T-31-01/— | Any-factor acceptance at login/step-ups | integration | `node --test test/tfa-multi-factor.test.mjs` | ❌ W0 | ⬜ pending |
| 31-01-02 | 01 | 1 | TOTP2-02 | T-31-02/— | Individual removal, remaining factors work | integration | `node --test test/tfa-multi-factor.test.mjs` | ❌ W0 | ⬜ pending |
| 31-01-03 | 01 | 1 | TOTP2-03 | — | Pending-2FA challenge accepts any factor | integration | `node --test test/tfa-multi-factor.test.mjs` | ❌ W0 | ⬜ pending |
| 31-01-04 | 01 | 1 | TOTP2-04 | — | Last-factor removal = disable transaction | integration | `node --test test/tfa-multi-factor.test.mjs` | ❌ W0 | ⬜ pending |
| 31-01-05 | 01 | 1 | TOTP2-05 | — | Add-factor requires existing-factor code step-up | integration | `node --test test/tfa-multi-factor.test.mjs` | ❌ W0 | ⬜ pending |
| 31-02-xx | 02 | 1 | D-06/09 | — | Boot copy: byte-identical second boot, last_step carried | migration pin | `node --test test/migration.test.mjs` | ✅ extend | ⬜ pending |
| 31-02-xx | 02 | 1 | D-77/78c | — | Decrypt boundary + pin counts after refactor | pin tests | `node --test test/totp-encryption.test.mjs` | ✅ update | ⬜ pending |
| 31-0x-xx | — | 1 | i18n | — | EN+FR parity for new keys | unit | `node --test test/i18n-scan.test.mjs test/build-locales.test.mjs` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/tfa-multi-factor.test.mjs` — covers TOTP2-01..05 (reuse helpers: `startServer`, `withDb`, `login` from `test/helpers/`)
- [ ] Pin-count updates in `test/totp-encryption.test.mjs` (3→new call-site shape) — deliberate, documented
- [ ] `test/migration.test.mjs` — extend `pragma table_info` snapshot + second-boot byte-identical assertion with `totp_factors`
- [ ] New fixtures only within existing helper patterns — no framework install needed

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Authenticator-app enrollment flow end-to-end | TOTP2-01 | Requires a real TOTP authenticator app | Enroll second factor with an app, verify code accepted at login |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
