---
phase: "9"
slug: "server-messages-activity-history"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-24"
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in), 391 cases across 34 files, all green [VERIFIED: research session] |
| **Config file** | none — `npm test` globs `test/*.test.mjs` |
| **Quick run command** | `node --test test/error-codes.test.mjs test/activity-verbs.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~12 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/error-codes.test.mjs test/activity-verbs.test.mjs`
- **After every plan wave:** Run `npm test` + `npm run lint && npm run format:check && npm run build`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 09-xx-01 | TBD | 0 | ERR-01 | T-09-* / — | codes beside unchanged English message | static parity + server integration | `node --test test/error-codes.test.mjs` | ❌ W0 | ⬜ pending |
| 09-xx-02 | TBD | 0 | ERR-02 | — | unknown code → raw server message, never empty/key | unit (`tErr` known/unknown/missing-params) | `node --test test/error-codes.test.mjs` | ❌ W0 | ⬜ pending |
| 09-xx-03 | TBD | 0 | ACT-01 | — | verb parity en+fr; filter selection unchanged | static verb parity + unit | `node --test test/activity-verbs.test.mjs` | ❌ W0 | ⬜ pending |
| 09-xx-04 | TBD | 0 | ACT-02 | — | legacy rows render translated, prose suppressed | unit (`actExtraHtml('to Review') === ''`) | `node --test test/activity-verbs.test.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/error-codes.test.mjs` — parity + shape + fallback (ERR-01/02)
- [ ] `test/activity-verbs.test.mjs` — verb/extra/filter parity + suppression (ACT-01/02)

*(Test infra otherwise complete — harness, catalogue tests and source-scan patterns all exist.)*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| French interface shows translated error toasts end-to-end | ERR-01 | visual/linguistic confirmation | Switch to fr, trigger a known error (duplicate signup), confirm French toast |
| Legacy activity rows still listed and filterable | ACT-02 | seed-document dependent | Open activity with a pre-milestone document; filter comments/status/projects |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
