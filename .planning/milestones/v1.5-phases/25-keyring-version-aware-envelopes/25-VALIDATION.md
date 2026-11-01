---
phase: "25"
slug: "keyring-version-aware-envelopes"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
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
| **Quick run command** | `node --test test/migration.test.mjs test/totp-encryption.test.mjs` |
| **Full suite command** | `node --test --test-concurrency=2 test/*.test.mjs` (`npm test`) |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick run command
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 25-01-01 | 01 | 1 | KEY-01, SC-1, D-K6 | — | `v2:`/`v3:` rows boot byte-identical ×2, zero backups, no re-wrap/corruption | unit (boot on seeded DB) | `node --test test/migration.test.mjs` | ✅ | ✅ green |
| 25-01-02 | 01 | 1 | KEY-01, D-K7, D-76 | — | undecryptable-version rows counted + warned, never silent, no ciphertext in log | unit (boot on seeded DB) | `node --test test/migration.test.mjs` | ✅ | ✅ green |
| 25-01-03 | 01 | 1 | KEY-01, D-75, SC-4 guard | — | migration filter + in-transaction re-check share ONE `/^v\d+:/` predicate; `requireTotpSecret` signature untouched | static (source assertion) | `node --test test/totp-encryption.test.mjs` | ✅ | ✅ green |
| 25-02-01 | 02 | 2 | KEY-02, D-K1, D-K2, D-K3, D-K4, D-K5, SC-2 | — | v2 envelope decrypts via two-key keyring; key-id derivation deterministic 8-hex sha256 mirror | unit (crypto round-trip, real SQLite + login path) | `node --test test/totp-encryption.test.mjs` | ✅ | ✅ green |
| 25-02-02 | 02 | 2 | D-K2, D-K5, SC-3, D-K3 | — | `MASTER_KEY_PREVIOUS` without `MASTER_KEY` fails boot loudly; malformed/unknown/corrupt v2 rows → 503 `masterKeyMissing`, rows unmutated | unit (failure injection) | `node --test test/totp-encryption.test.mjs` | ✅ | ✅ green |
| 25-02-03 | 02 | 2 | KEY-02, D-K3, D-K4 | — | format-freeze decision gate (one-way contract) | process gate | recorded user decision ("Confirm as-is") in 25-02-SUMMARY.md | — | ✅ green |
| 25-02-04 | 02 | 2 | KEY-02, SC-2, SC-4, D-K4 | — | enable path writes frozen `v2:<key-id>:<iv>:<tag>:<ct>`; SC-2 fresh-login round-trip; planted v1 legacy envelope still verifies | unit (real enrollment) + regression | `node --test test/totp-encryption.test.mjs test/tfa-enrollment.test.mjs test/migration.test.mjs` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Final full-suite evidence:** `npm test` — 621 pass / 0 fail (post-merge gate, exit 0).

---

## Wave 0 Requirements

Superseded at execution: tests were consolidated into the phase's existing suites rather than the seeded stub files (per plan deviations, Rule 1).

- [x] KEY-01 negative-proof tests → `test/migration.test.mjs` (SC-1 byte-identity ×2 boots, D-K7 counting/warning, predicate-sharing static guard)
- [x] KEY-02 keyring tests → `test/totp-encryption.test.mjs` (v2 round-trip, D-K2 boot gate, D-K5 fail-closed matrix, D-K3 determinism, writer-flip SC-2)
- [x] Existing `startServer({dataDir, env})` harness and real SQLite cover the rest.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 2FA login succeeds end-to-end with a real authenticator app against a `v2:` secret | KEY-02 | Requires a live TOTP device | Enroll with keyring active, re-login verifying the TOTP prompt accepts the live code |

---

## Validation Audit 2026-10-31

| Metric | Count |
|--------|-------|
| Gaps found | 0 (map corrected: 5 stale rows referenced non-existent Wave-0 files) |
| Resolved | 7/7 task rows → covered |
| Escalated | 0 (1 pre-declared manual-only item retained) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or a resolved Wave 0 dependency
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (consolidated into existing suites)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated — all 7 task rows covered by automated tests (621/621 green); 1 manual-only item (live authenticator app) deferred to UAT as declared.
