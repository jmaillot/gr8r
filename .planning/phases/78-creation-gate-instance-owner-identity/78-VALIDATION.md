---
phase: "78"
slug: "creation-gate-instance-owner-identity"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-19"
---

# Phase 78 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in), `--test-concurrency=2`; Playwright for e2e |
| **Config file** | none for node:test (glob via package.json `test` script); e2e/playwright.config.mjs |
| **Quick run command** | `node --test test/creation-gate.test.mjs` (new suite, Wave 0) |
| **Full suite command** | `npm test` + `npm run e2e` |
| **Estimated runtime** | ~3–5 s quick · ~2 min full · ~7 min e2e |

---

## Sampling Rate

- **After every task commit:** `node --test test/creation-gate.test.mjs` + `npm run lint`
- **After every plan wave:** `npm test` full
- **Before `/gsd-verify-work`:** Full suite + `npm run e2e` green
- **Max feedback latency:** ~10 s (quick suite)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 78-01-env-matrix | 01 | 0/1 | WSG-01 | T-78-01 | invalid token never boots to a weaker gate | integration (boot-observable) | `node --test test/creation-gate.test.mjs` | ❌ W0 | ⬜ pending |
| 78-01-boot-log | 01 | 0/1 | WSG-03 | — | resolved gate readable from boot log | integration (server.output() grep) | same | ❌ W0 | ⬜ pending |
| 78-01-open-create | 01 | 1 | WSG-02 | T-78-02 | gate=true: any user creates, creator=owner | integration | same | ❌ W0 | ⬜ pending |
| 78-01-closed-gate | 01 | 1 | WSG-02 | T-78-02 | gate=false: non-operator 403 keyed; operator 201; workspace owner/admin non-operator 403 (D-112) | integration | same | ❌ W0 | ⬜ pending |
| 78-01-decouple | 01 | 1 | WSG-02 | — | ALLOW_SIGNUP=true + gate=false: signup 201, creation 403 | integration | same | ❌ W0 | ⬜ pending |
| 78-01-config | 01 | 1 | WSG-03 | — | /api/config boolean both modes | integration | same | ❌ W0 | ⬜ pending |
| 78-01-seed-persist | 01 | 1 | WSG-05 | — | stamp seeds first operator; flag survives restart (reboot-same-DB harness) | integration | same | ❌ W0 | ⬜ pending |
| 78-01-promote | 01 | 1 | WSG-06 | T-78-03 | operator flags user; audit row written; non-operator → operatorOnly; unknown id → 404 | integration | same | ❌ W0 | ⬜ pending |
| 78-01-last-guard | 01 | 1 | WSG-06 | T-78-04 | demote last operator → 409 lastOperator (keyed); demote when ≥2 → ok | integration | same | ❌ W0 | ⬜ pending |
| 78-01-audit-tx | 01 | 1 | WSG-06 | — | forced audit failure rolls back flag update (db.tx discipline) | integration | same | ❌ W0 | ⬜ pending |
| 78-01-locale | 01 | 1 | WSG-11 | — | err.<code> en+fr auto via error-codes.test.mjs; 5-locale UI key parity | static | `npm test` | ✅ (auto) / ❌ W0 (parity ext) | ⬜ pending |
| 78-02-await-page | 02 | 2 | WSG-10 | — | closed gate + non-operator + no membership → await view, no app shell, sign-out present | e2e Playwright | `npx playwright test e2e/await-access.spec.mjs` | ❌ W0 | ⬜ pending |
| 78-02-poll | 02 | 2 | WSG-10 | — | poll enters app after membership appears; paused while document.hidden (drive via dispatched visibilitychange event — store.js:285 precedent) | e2e + unit | same | ❌ W0 | ⬜ pending |
| 78-02-button | 02 | 2 | WSG-10 | — | create button hidden for gated user in popover; visible for operator | e2e | same | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/creation-gate.test.mjs` — gate matrix, boot-refuse, operator endpoints, last-operator guard, audit tx (WSG-01/02/05/06)
- [ ] `e2e/await-access.spec.mjs` — await page + poll + button visibility (WSG-10)
- [ ] **BASE_ENV update in test/helpers/server.mjs** — add `WORKSPACE_CREATION: 'true'` or audit + patch affected suites (Pitfall 5 — the main regression risk under unset=false; planner decides)
- [ ] 5-locale UI key parity extension for new `settings.operator.*` / await-page keys (error-codes.test.mjs auto-covers err.* — zero edits)

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| *(none)* | | | |

*All phase behaviors have automated verification.* (Document-break-glass DB fallback of D-114 is docs-only, verified by review, not runtime.)

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10 s (quick suite)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
