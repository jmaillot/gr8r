---
phase: "61"
slug: "notification-trim"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-13"
---

# Phase 61 — Validation Strategy

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
| 61-01-01 | 01 | 1 | NOTIF-02 (D-04) | T-61-01 | dead pref keys removed from BOTH whitelists + assign_self default, parity in one commit | unit (prefs) | `node --test test/notif-prefs.test.mjs` | ❌ W0 | ⬜ pending |
| 61-01-02 | 01 | 1 | NOTIF-02 (D-04) | T-61-01 | legacy stored rows round-trip after key removal; PUT rejects removed key 400 | unit (route) | `node --test test/notif-prefs.test.mjs` | ❌ W0 | ⬜ pending |
| 61-02-01 | 02 | 1 | NOTIF-03 (D-11) | T-61-02 | groupBursts: same task+type among unread → one summary row; expand restores rows | unit (render) | `node --test test/inbox-burst.test.mjs` | ❌ W0 | ⬜ pending |
| 61-02-02 | 02 | 1 | NOTIF-03 (D-13) | T-61-02 | summary shows count by type + task key + title; deep-links to task drawer | unit (render) | `node --test test/inbox-burst.test.mjs` | ❌ W0 | ⬜ pending |
| 61-02-03 | 02 | 1 | NOTIF-03 | — | unread counts computed BEFORE grouping (badges stay exact) | unit (render) | `node --test test/inbox-burst.test.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*(Exact task IDs/commands are seeded from research; planner/executor refine as plans land.)*

---

## Wave 0 Requirements

- [ ] `test/notif-prefs.test.mjs` — covers D-04 key removal + legacy-row round-trip + PUT 400 (template: existing notif prefs tests)
- [ ] `test/inbox-burst.test.mjs` — covers D-11/D-13 grouping (pure transform over rendered list, template: existing render tests)

*Framework: existing (`node --test`) — no install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Burst summary renders & expands in the real inbox; click navigates to task drawer | NOTIF-03, D-13 | visual/DOM behavior | Open inbox; fire rapid same-task notifications; confirm summary row, expansion, drawer navigation; confirm page/chunk sizes unchanged |
| e2e: inbox burst flow + settings toggles | NOTIF-02, NOTIF-03 | browser flow | `npm run e2e` (baseline 111 tests) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
