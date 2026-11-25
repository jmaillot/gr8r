---
phase: "93"
slug: "governance-ux-instance-roles"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-24"
---

# Phase 93 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test — static source assertions (no DOM harness; `creation-gate-client` precedent) + Playwright e2e for real DOM |
| **Config file** | none (node:test glob); `e2e/playwright.config.mjs` |
| **Quick run command** | `node --test test/governance-tabs-client.test.mjs test/governance-client.test.mjs test/team-pick-client.test.mjs` |
| **Full suite command** | `npm test` + `npm run lint` + `npm run build` (chunk + i18n-scan gates) |
| **Estimated runtime** | seconds (client static tests); build+i18n gate per commit where keys change |

---

## Sampling Rate

- **After every task commit:** Run the quick node:test command on touched client-test files
- **After every plan wave:** Run `npm test` + `npm run lint` + `npm run build`
- **Before `/gsd-verify-work`:** Full suite + e2e green
- **Max feedback latency:** seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 93-01-T1 | 93-01 | 0 | ROLE-01 | — | 3-value seg; `superTitle` renamed ×5; rolesCard wrapper dissolved | static source | `node --test test/governance-console.test.mjs test/governance-tabs-client.test.mjs` | ❌ W0 (T1) | ⬜ pending |
| 93-01-T3 | 93-01 | 1 | ROLE-02 | T-93-01 | one row per user per tab; User/Grants/Actions columns; stacked badges | static + payload pins | `node --test test/governance-tabs-client.test.mjs` | ❌ W0 (T1) | ⬜ pending |
| 93-01-T4 | 93-01 | 1 | ROLE-03 | T-93-02 | `IN.govRoleQ` calls render(); foldForSearch filter; aria option contract; no user creation | static (team-pick pattern) + e2e | `node --test test/team-pick-client.test.mjs test/governance-tabs-client.test.mjs` (+ Playwright spec) | ❌ W0 (T1) | ⬜ pending |
| 93-01-T2/T5 | 93-01 | 0/1 | i18n ×5 | — | renamed/new keys present in all 5 locale files; i18n-scan gate green | catalogue-pin | `npm run build` + node:test parity asserts | pattern exists | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `test/governance-tabs-client.test.mjs` — seg 3-value, rename, column/stack pins, picker contract, `IN.govRoleQ` render pin
- [ ] ×5 key-parity asserts for renamed/new keys (extend `governance-rename.test.mjs` pattern)
- [ ] Optional Playwright spec for dialog filter (harness precedent: `e2e/admin-revoke-cycle.spec.mjs`)

---

## Manual-Only Verifications

- Visual pass over the three tabs (stacked badge alignment, lean op tabs, trail under SA roster) at verify-work.
