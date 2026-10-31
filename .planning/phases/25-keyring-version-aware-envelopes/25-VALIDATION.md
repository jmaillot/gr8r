---
phase: "25"
slug: "keyring-version-aware-envelopes"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-31"
---

# Phase 25 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (`node --test`), real SQLite via `startServer({dataDir, env})` |
| **Config file** | existing test/ harness (per RESEARCH.md Validation Architecture) |
| **Quick run command** | `node --test test/audit-log.test.mjs test/error-codes.test.mjs` (nearest-phase proven set; swap in the phase's own test files as they are created) |
| **Full suite command** | `node --test test/*.test.mjs` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick run command (the phase's own envelope/keyring test files as they land)
- **After every plan wave:** Run `node --test test/*.test.mjs`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 25-01-01 | 01 | 1 | KEY-01 | — | `v2:`/`v3:` rows survive boot byte-identical, no re-wrap/corruption, D-K7 warning only | unit (boot on seeded DB) | `node --test test/envelope-version.test.mjs` | ❌ W0 | ⬜ pending |
| 25-01-02 | 01 | 1 | KEY-01 | — | version-unaware SQL filter + in-transaction re-check share one `/^v\d+:/` predicate | unit (source assertion + boot test) | `node --test test/envelope-version.test.mjs` | ❌ W0 | ⬜ pending |
| 25-02-01 | 02 | 2 | KEY-02 | — | `v2:<key-id>:…` secret decrypts via keyring (current + MASTER_KEY_PREVIOUS) | unit (crypto round-trip) | `node --test test/totp-keyring.test.mjs` | ❌ W0 | ⬜ pending |
| 25-02-02 | 02 | 2 | KEY-02 | — | undecryptable secret → fail-closed 503 `masterKeyMissing`, no plaintext fallback | unit (failure injection) | `node --test test/totp-keyring.test.mjs test/error-codes.test.mjs` | ❌ W0 | ⬜ pending |
| 25-02-03 | 02 | 2 | KEY-02 | — | v1 login/enroll/disable flows unchanged; `requireTotpSecret` signature untouched | unit (regression) | `node --test test/totp.test.mjs` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/envelope-version.test.mjs` — stubs for KEY-01 (boot-on-seeded-DB negative-proof tests, per RESEARCH.md task ordering: MUST precede the v2-writer flip)
- [ ] `test/totp-keyring.test.mjs` — stubs for KEY-02
- Existing `startServer({dataDir, env})` harness and real SQLite cover the rest.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 2FA login succeeds end-to-end with a real authenticator app against a `v2:` secret | KEY-02 | Requires a live TOTP device | Enroll with keyring active, re-login verifying the TOTP prompt accepts the live code |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
