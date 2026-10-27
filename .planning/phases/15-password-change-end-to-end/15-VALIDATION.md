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
| 15-01-T1 | 01 | 1 | PASS-01, PASS-02 | T-15-01, T-15-03 | Wrong current password rejected, no change; new password logs in, old does not; two-cookie revocation in one transaction() | integration (tracer) | `node --test test/password-change.test.mjs` | ❌ W0 | ⬜ pending |
| 15-01-T2 | 01 | 1 | PASS-02 | T-15-01, T-15-02, T-15-04 | passwordRequired/passwordTooWeak; 429 generic lockout, no Retry-After, user_id key; cross-origin 403 | integration | `node --test test/password-change.test.mjs` | created in T1 | ⬜ pending |
| 15-01-T3 | 01 | 1 | PASS-01, PASS-02 | — | Full suite regression gate incl. error-codes emit heuristic | suite | `npm test 2>&1 \| tail -5` | ✅ | ⬜ pending |
| 15-02-T1 | 02 | 2 | PASS-03 | T-15-07, T-15-09 | Real A.savePassword → api.changePassword; honest count-free toast; D-39 field-clearing; keys EN+FR | static/i18n | `node scripts/i18n-scan.mjs && node --test test/error-codes.test.mjs` | ✅ | ⬜ pending |
| 15-02-T2 | 02 | 2 | PASS-02 | T-15-08 | Revoked second browser routes through 14-05 central 401 intercept → signOutRevoked (D-44) | client (fetch-stubbed) | `node --test test/auth-revoked.test.mjs` | ✅ extend | ⬜ pending |
| 15-02-T3 | 02 | 2 | PASS-03 | — | Phase gate: lint, format, build (i18n gate), full suite | suite | `npm run lint && npm run format:check && npm run build` + `npm test` | ✅ | ⬜ pending |

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
