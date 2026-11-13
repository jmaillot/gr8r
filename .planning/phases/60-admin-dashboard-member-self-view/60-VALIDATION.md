---
phase: "60"
slug: "admin-dashboard-member-self-view"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-13"
---

# Phase 60 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in test runner (`node --test`), Node ≥ 20 |
| **Config file** | `package.json` (`npm test` script) |
| **Quick run command** | `node --test test/<touched>.test.mjs` |
| **Full suite command** | `npm test && npm run lint && node scripts/i18n-scan.mjs` |
| **Estimated runtime** | ~60–120 seconds (full suite; baseline 1489 tests) |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/<touched>.test.mjs`
- **After every plan wave:** Run `npm test && npm run lint && node scripts/i18n-scan.mjs`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 60-01-01 | 01 | 1 | DASH-04 | T-60-01 | dashboard route 403 for non-admin, server-side | route/permission | `node --test test/dashboard.test.mjs` | ❌ W0 | ⬜ pending |
| 60-01-02 | 01 | 1 | DASH-01..03 | T-60-01 | aggregates expose full private-project content for admins (power-admin) | unit (aggregation) | `node --test test/dashboard.test.mjs` | ❌ W0 | ⬜ pending |
| 60-01-03 | 01 | 1 | TRN-01 | T-60-02 | self-view shape `{projects:[{id,name,reason[,teamName]}]}` — no member echo, no granter ids | byte-level shape | `node --test test/self-view.test.mjs` | ❌ W0 | ⬜ pending |
| 60-01-04 | 01 | 1 | TRN-02 | T-60-02 | no cross-member access-row leak (grants appear without names) | byte-level shape | `node --test test/self-view.test.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*(Exact task IDs/commands are seeded from research; planner/executor refine as plans land.)*

---

## Wave 0 Requirements

- [ ] `test/dashboard.test.mjs` — covers DASH-01..04 (route gate + aggregates, expectations from `VISIBILITY_MODEL` oracle)
- [ ] `test/self-view.test.mjs` — covers TRN-01/02 (entry-shape assertion, template: `test/transparency.test.mjs`)

*Framework: existing (`node --test`) — no install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dashboard page renders & polls client-side (lazy chunk, 30 s poll, abort) | DASH-01..03 | visual/DOM behavior | Open dashboard as admin; confirm overdue groups, workload counts, upcoming list, activity feed; confirm page not in entry chunk |
| e2e: dashboard + self-view flows per role | DASH-04, TRN-01 | browser flow | `npm run e2e` (baseline 111 tests) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
