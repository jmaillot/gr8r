---
phase: "68"
slug: "backlog-polish"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-16"
---

# Phase 68 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node --test` (unit) + `@playwright/test` ^1.64.1 (e2e) |
| **Config file** | e2e/playwright.config.mjs; unit tests are `test/*.test.mjs` (no config) |
| **Quick run command** | `node --test test/email-outbox.test.mjs` (or the task's targeted new file) |
| **Full suite command** | `npm test` then `npm run e2e` |
| **Estimated runtime** | ~2 min unit / ~10 min full e2e |

---

## Sampling Rate

- **After every task commit:** Run the task's targeted `node --test` command
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** `npm test` + full `npm run e2e` must be green
- **Max feedback latency:** ~120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 68-01-01 | 01 | 1 | POL-03 | — | N/A | unit | `node --test test/responsive-css-scope.test.mjs` | ❌ W0 | ⬜ pending |
| 68-01-02 | 01 | 1 | POL-04 | — | N/A | manual/doc | grep Formal Acceptance in 64-VALIDATION.md | ✅ (doc edit) | ⬜ pending |
| 68-02-01 | 02 | 2 | POL-02 | T-68-01 | outbox rows are server-only; no client payload exposure | unit | `node --test test/email-outbox.test.mjs` | ❌ W0 | ⬜ pending |
| 68-02-02 | 02 | 2 | POL-02 | T-68-02 | no-double-send: digest claims ledger once, one outbox row per claim | unit | `node --test test/digest.test.mjs test/due-reminders.test.mjs` | ✅ | ⬜ pending |
| 68-03-01 | 03 | 2 | POL-01 | — | N/A | e2e | `npx playwright test e2e/mobile-card-hidden.spec.mjs` | ❌ W0 | ⬜ pending |
| 68-03-02 | 03 | 2 | POL-01 | — | N/A | e2e | `npx playwright test e2e/mobile-tasks-table.spec.mjs` | ✅ (update) | ⬜ pending |
| 68-04-01 | 04 | 3 | all | — | N/A | regression | `npm test` + `npm run e2e` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/responsive-css-scope.test.mjs` — byte-level assert of `.page.flush .toolbar` scoping (pattern: existing css-assert tests)
- [ ] `test/email-outbox.test.mjs` — claim/retry/dead/purge state machine + no-double-send invariant (injectable clock, pattern of `test/webhook-delivery.test.mjs`)
- [ ] `e2e/mobile-card-hidden.spec.mjs` — POL-01 390×844 proof (reuse mobile-tasks-table.spec.mjs conventions)

*Existing infrastructure (node --test + Playwright) covers framework setup.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 64-VALIDATION.md Formal Acceptance section (statut accepted + rationale §5.5 + evidence v2.3-close) | POL-04 | Planning artifact, not code — verified by grep + human review at phase gate | `grep -A5 "Formal Acceptance" .planning/milestones/v2.3-phases/64-mobile-tasks-table-suite-green/64-VALIDATION.md` then confirm content cites 115/115 + audit 5/5 |

*POL-02/03/01 behaviors all have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
