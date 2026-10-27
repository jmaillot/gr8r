---
phase: "17"
slug: "login-second-factor-flow"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-27"
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (`node --test`), Node 20+ |
| **Config file** | package.json (test script) |
| **Quick run command** | `node --test test/` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10–30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | TFA-05 | T-17-01 | Pending sign-in is inert — no session cookie usable as identity | integration | `node --test test/login-2fa.test.mjs` | ❌ W0 | ⬜ pending |
| 17-01-02 | 01 | 1 | TFA-05 | T-17-02 | TOTP verify burns challenge row; replay rejected | integration | `node --test test/login-2fa.test.mjs` | ❌ W0 | ⬜ pending |
| 17-01-03 | 01 | 1 | TFA-05 | T-17-03 | Recovery code burned exactly once at login | integration | `node --test test/login-2fa.test.mjs` | ❌ W0 | ⬜ pending |
| 17-01-04 | 01 | 1 | TFA-05 | T-17-04 | Shared password→2FA throttle budget; short-lived challenge | integration | `node --test test/login-2fa.test.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*(Planner adjusts rows to match final plan/task structure — placeholders above track TFA-05 success criteria 1–4.)*

---

## Wave 0 Requirements

- [ ] `test/login-2fa.test.mjs` — stubs for TFA-05 (login challenge flow, 401 matrix, throttle sharing, recovery burn)

*Existing infrastructure (Phase 16: `test/tfa-enrollment.test.mjs`, `test/totp.fixture.test.mjs`; Phase 14 throttle tests) covers all other phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| None expected | TFA-05 | — | All phase behaviors have automated verification. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
