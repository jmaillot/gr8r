---
phase: "76"
slug: "oidc-sso-doors-immunity-hardening"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-19"
---

# Phase 76 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in runner, `node --test`) |
| **Config file** | package.json (`npm test` → `node --test`) |
| **Quick run command** | `node --test test/domain-admission.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/domain-admission.test.mjs`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | DOM-05 | T-76-01 / — | Existing accounts immune to list changes (linked-identity short-circuit) | integration | `node --test test/oidc-sso.test.mjs` | ✅ | ⬜ pending |
| TBD | TBD | TBD | DOM-05 | T-76-02 / — | JIT provisioning gated by DP-4 door matrix | integration | `node --test test/oidc-sso.test.mjs` | ✅ | ⬜ pending |
| TBD | TBD | TBD | DOM-06 | T-76-03 / — | SSO invite reconciliation filters refused invites (DP-5) | integration | `node --test test/oidc-sso.test.mjs` | ✅ | ⬜ pending |
| TBD | TBD | TBD | DOM-05/06 | — | Resolved matrix visible at boot | integration | `npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs filled in by the planner; the map is seeded from the phase requirement IDs (DOM-05, DOM-06) and the research's insertion sites (server.js:5121-5130 DP-4 gate, server.js:5163 DP-5 filter).*

---

## Wave 0 Requirements

- [ ] Extend existing `test/oidc-sso.test.mjs` fake-IdP harness coverage (inline harness exists at lines 17-108; extraction vs duplication decided at planning)
- [ ] No framework install needed — `node --test` is already the runner

*Existing infrastructure covers most phase requirements; planner decides harness extraction in Wave 0 if it opts for `test/helpers/` extraction.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Boot log shows resolved matrix for a real IdP | DOM-05 | Requires live OIDC provider credentials | Run server with real IdP env vars; grep boot output for the resolved matrix line |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
