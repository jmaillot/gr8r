---
phase: "19"
slug: "totp-encryption-closure"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: false
created: "2026-10-28"
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (`node --test`), .mjs test files |
| **Config file** | none — tests discovered from `test/` directory |
| **Quick run command** | `node --test test/migration.test.mjs` |
| **Full suite command** | `node --test test/` |
| **Estimated runtime** | ~10–30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/migration.test.mjs` (or the touched test file)
- **After every plan wave:** Run `node --test test/`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| {N}-01-01 | 01 | 1 | ENC-01 | T-19-01 / — | Legacy plaintext `two_fa_secret` encrypted into `v1:` envelope on boot, inside transaction, pre-migration backup guarantee; second boot byte-identical no-op | integration | `node --test test/migration.test.mjs` | ✅ (extend existing) | ✅ green |
| {N}-01-02 | 01 | 1 | ENC-02 | T-19-02 / — | Malformed / non-`v1:` secret at any decrypt call site → fail-closed 503 on TOTP-verify/disable only; all other routes untouched | integration | `node --test test/` | ✅ (extend existing) | ✅ green |
| {N}-01-03 | 01 | 1 | ENC-02 | T-19-03 / — | No `decrypt(x) ?? x` plaintext-fallback pattern anywhere; all call sites route through single boundary helper | static (grep) | `node --test test/error-codes.test.mjs` (server-source-reading convention) | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Extend `test/migration.test.mjs` — legacy-fixture + second-boot byte-identical cases for ENC-01
- [ ] Extend TOTP verify/disable error-path tests — malformed/non-`v1:` secret → 503, non-TOTP routes unaffected (ENC-02)
- [ ] Grep-level source test proving no `decrypt(x) ?? x` fallback exists (follow `test/error-codes.test.mjs:13` convention)

*Framework already installed — no Wave 0 install step needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| (none) | — | — | — |

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-28

## Validation Audit 2026-10-28
| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
