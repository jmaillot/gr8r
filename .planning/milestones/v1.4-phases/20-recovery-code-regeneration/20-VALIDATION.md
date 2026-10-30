---
phase: "20"
slug: "recovery-code-regeneration"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-29"
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (built-in), `node --test --test-concurrency=2` [VERIFIED: package.json:18] |
| **Config file** | none — convention-based `test/*.test.mjs` |
| **Quick run command** | `node --test test/tfa-recovery-regen.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/tfa-recovery-regen.test.mjs`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

Task IDs are assigned by the planner; seed rows are requirement-level and must be expanded into task-level rows when plans land.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD (Wave 0) | 01 | 1 | REGEN-01 | T-20-01 | Password + live TOTP regenerates 10 codes | integration | `node --test test/tfa-recovery-regen.test.mjs` | ❌ W0 | ⬜ pending |
| TBD | 01 | 1 | REGEN-01 | T-20-01 | Recovery code as step-up → 400 `codeRejected`, set unchanged | integration (regression) | `node --test test/tfa-recovery-regen.test.mjs` | ❌ W0 | ⬜ pending |
| TBD | 01 | 1 | REGEN-02 | T-20-04 | Old set invalid immediately; new set valid for login burn | integration | `node --test test/tfa-recovery-regen.test.mjs` | ❌ W0 | ⬜ pending |
| TBD | 01 | 1 | REGEN-02 | T-20-02 | 2FA-disabled → 409 `tfaNotEnabled`; wrong password burns a throttle try (6th → 429) | integration | `node --test test/tfa-recovery-regen.test.mjs` | ❌ W0 | ⬜ pending |
| TBD | 01 | 1 | SC-4 | T-20-03 | Response carries `Cache-Control: no-store` | integration | `node --test test/tfa-recovery-regen.test.mjs` | ❌ W0 | ⬜ pending |
| TBD | 01 | 1 | D-89 | T-20-05 | Missing MASTER_KEY → 503 `masterKeyMissing`, no mutation | integration | `node --test test/tfa-recovery-regen.test.mjs` | ❌ W0 | ⬜ pending |
| TBD | 01 | 1 | D-92 | — | New i18n keys present in EN + FR | unit (existing) | `node --test test/i18n-scan.test.mjs` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/tfa-recovery-regen.test.mjs` — covers REGEN-01/REGEN-02 + no-store + throttle-budget regression
- [ ] (if D-99 mechanism built) a table/log assertion or a documented-deferral note instead

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Regenerated set renders via existing recoveryCodes modal (D-91) | REGEN-01 | covered by existing modal tests / visual confirm | Open security settings, regenerate, confirm codes shown once and modal dismisses |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
