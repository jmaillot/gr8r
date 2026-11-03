---
phase: "33"
slug: "membership-surface-hardening"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-02"
---

# Phase 33 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (Node built-in), suites spawn real servers via test/helpers/server.mjs |
| **Config file** | none — `npm test` globs test/*.test.mjs (package.json:18) |
| **Quick run command** | `node --test test/hardening.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~33 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/hardening.test.mjs` (or the touched suite)
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 33 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 33-01-01 | 01 | 1 | HARD-01 | T-33-01 | Hostile-Origin accept POST → 403 crossOriginRejected byte-identical, guard before throttle/body | integration | `node --test test/hardening.test.mjs` | ✅ (33-01 T1) | ✅ green |
| 33-01-01 | 01 | 1 | HARD-01 | T-33-01 | Guard-before-throttle: hostile probes consume no invite\|ip budget; Origin-less client passes | integration | `node --test test/hardening.test.mjs` | ✅ | ✅ green |
| 33-01-02 | 01 | 1 | HARD-05 | T-33-02 | Multi-value x-forwarded-host = first value in sameOrigin (TRUST_PROXY=true server); proto/clientIp regression pin | integration | `node --test test/hardening.test.mjs` | ✅ | ✅ green |
| 33-01-03 | 01 | 1 | HARD-04 | T-33-03 | Smuggled role/teams/scope keys inert; unknown fields silently discarded (never 400); empty body hits validation path | integration | `node --test test/hardening.test.mjs` | ✅ | ✅ green |
| 33-02-01 | 02 | 2 | HARD-03 | T-33-07 | Accept twin: deleted workspace → 410 workspaceGone, no membership row (HARD-03a) | integration | `node --test test/hardening.test.mjs` | ✅ (33-01) | ✅ green |
| 33-02-01 | 02 | 2 | HARD-03 | T-33-07 | SSO twin: deleted workspace → invite consumed, no membership, no sso_invite_accepted log, generic landing (HARD-03b, same commit as 03a) | integration | `node --test test/oidc-sso.test.mjs && node --test test/hardening.test.mjs` | ✅ | ✅ green |
| 33-02-02 | 02 | 2 | HARD-02 | T-33-04/05/06 | Creation 400 for admin link-only (no over-block of member invites); accept refuses email-less admin row; boot sweep update-only marks legacy rows used | integration | `node --test test/hardening.test.mjs && node --test test/error-codes.test.mjs` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `test/hardening.test.mjs` — pin suite for HARD-01/02/03/04/05 (created by 33-01 Task 1, extended by 33-02)
- [x] TRUST_PROXY-enabled server config for HARD-05 pins (`startServer({ env: { TRUST_PROXY: 'true' } })`)
- [x] Direct DatabaseSync row-seeding pattern for HARD-02b/02c (withDb, per test/oidc-sso.test.mjs)

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 33s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-03

---

## Validation Audit 2026-11-03

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Cross-reference evidence: hardening 11/11, oidc-sso 47/47 (HARD-03b pin inside), error-codes 24/24 — all map rows green against live runs.
