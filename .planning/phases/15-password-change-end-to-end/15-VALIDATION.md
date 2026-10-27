---
phase: "15"
slug: "password-change-end-to-end"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-27"
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in, `node --test`), used across Phases 13–14 |
| **Config file** | none — `npm test` script in package.json |
| **Quick run command** | `node --test test/password-change.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5–15 seconds (real server + temp DB pattern from Phase 14) |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/password-change.test.mjs`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | PASS-01 | T-15-01 (filled by planner) | Wrong current password rejected, no change | integration | `node --test test/password-change.test.mjs` | ❌ W0 | ⬜ pending |
| 15-01-02 | 01 | 1 | PASS-01 | — | New password works at next login, old does not | integration | `node --test test/password-change.test.mjs` | ❌ W0 | ⬜ pending |
| 15-0X-XX | 0X | X | PASS-02 | — | Other sessions revoked atomically in one transaction(); changing session stays signed in | integration | `node --test test/password-change.test.mjs` | ❌ W0 | ⬜ pending |
| 15-0X-XX | 0X | X | PASS-02 | — | Revoked second browser routes through Phase 14 mid-session 401 intercept (D-44) | integration | `node --test test/auth-revoked.test.mjs` | ✅ | ⬜ pending |
| 15-0X-XX | 0X | X | PASS-03 | — | Honest success toast copy; i18n keys present in both locales | static/integration | `node scripts/i18n-scan.mjs && node --test test/error-codes.test.mjs` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*(Task IDs above are provisional; the planner's final plan/task numbering supersedes them — keep the map aligned when plans land.)*

---

## Wave 0 Requirements

- [ ] `test/password-change.test.mjs` — new file: stubs for PASS-01/PASS-02 (real server + temp DB, two cookies for the revocation test)
- [ ] Extend `test/auth-revoked.test.mjs` — revoked-second-browser routing case (D-44)

*Existing infrastructure (node:test, temp-DB harness, i18n scan, error-codes catalog test) covers the rest.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Toast visual placement/timing | PASS-03 | Cosmetic rendering, not logic | Change password in browser; confirm toast copy states password updated + other sessions disconnected |

*All security-critical behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
