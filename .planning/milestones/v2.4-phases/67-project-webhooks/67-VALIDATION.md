---
phase: "67"
slug: "project-webhooks"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-15"
---

# Phase 67 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node --test (stdlib) |
| **Config file** | none — `node --test --test-concurrency=2 test/*.test.mjs` (package.json:19) |
| **Quick run command** | `node --test test/webhook-events.test.mjs test/webhook-delivery.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/webhook-events.test.mjs test/webhook-delivery.test.mjs`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 67-01-01 | 01 | 1 | WHK-05 | T-67-02 | N/A (schema) | parity | `node --test test/copy-sqlite-to-pg.test.mjs test/db-adapter.test.mjs` | ❌ W0 | ⬜ pending |
| 67-01-02 | 01 | 1 | WHK-05 | T-67-01 | SSRF deny-list fail-closed; https-only | unit | `node --test test/webhook-ssrf.test.mjs test/webhook-retry.test.mjs` | ❌ W0 | ⬜ pending |
| 67-01-03 | 01 | 1 | WHK-03 | T-67-02 / T-67-04 | exactly-once claim; 5-strike dead; D-07 purge; no throw escapes pass | unit | `node --test test/webhook-delivery.test.mjs` | ❌ W0 | ⬜ pending |
| 67-01-04 | 01 | 1 | WHK-02 | T-67-04 | doc-PUT never blocked by delivery; pure module stays pure | unit | `node --test test/webhook-events.test.mjs test/webhook-delivery.test.mjs && ! grep -nE "^import|^const .*require\(" src/core/webhook-events.js` | ❌ W0 | ⬜ pending |
| 67-02-01 | 02 | 2 | WHK-02 | — | N/A (event diff) | unit | `node --test test/webhook-events.test.mjs test/webhook-delivery.test.mjs` | ✅ (01) | ⬜ pending |
| 67-02-02 | 02 | 2 | WHK-04 | — | 28 KB cap truncation (D-02) | unit | `node --test test/webhook-formats.test.mjs test/webhook-events.test.mjs test/webhook-delivery.test.mjs` | ❌ W0 | ⬜ pending |
| 67-02-03 | 02 | 2 | WHK-02 | — | D-13 oid write, server-only | unit | `node --test test/db-adapter.test.mjs test/copy-sqlite-to-pg.test.mjs && npm test 2>&1 \| tail -8` | ✅ | ⬜ pending |
| 67-03-01 | 03 | 3 | WHK-01, WHK-05 | T-67-03 | secret shown once; mass-assignment guard; gate owner/admin/leader | unit | `node --test test/webhook-routes.test.mjs` | ❌ W0 | ⬜ pending |
| 67-03-02 | 03 | 3 | WHK-01 | — | N/A (test endpoint) | unit | `node --test test/webhook-routes.test.mjs test/webhook-delivery.test.mjs` | ✅ (67-03-01) | ⬜ pending |
| 67-04-01 | 04 | 4 | WHK-04 | — | N/A (UI + i18n) | build | `node --test test/build-locales.test.mjs test/i18n-keys.test.mjs test/i18n-parity.test.mjs && npm run prebuild 2>&1 \| tail -5 && node --test test/build-chunk-size.test.mjs` | ✅ | ⬜ pending |
| 67-04-02 | 04 | 4 | WHK-01 | — | member blocked in UI | e2e | `npx playwright test e2e/webhooks.spec.mjs 2>&1 \| tail -6` | ❌ W0 | ⬜ pending |
| 67-04-03 | 04 | 4 | WHK-05 | T-67-01..04 | threats_open: 0 attested | doc-gate | `grep -c "threats_open: 0" .planning/phases/67-project-webhooks/67-SECURITY.md && npm test 2>&1 \| tail -8` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/webhook-events.test.mjs`, `test/webhook-ssrf.test.mjs`, `test/webhook-retry.test.mjs`, `test/webhook-delivery.test.mjs` — 67-01 creates them (Tasks 2/3 tdd="true", Task 4)
- [ ] `test/webhook-formats.test.mjs` — 67-02 Task 2 creates it
- [ ] `test/webhook-routes.test.mjs` — 67-03 Task 1 creates it
- [ ] `e2e/webhooks.spec.mjs` — 67-04 Task 2 creates it
- No framework install needed — existing node --test infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real Teams channel receives the adaptive card | WHK-02 | Requires a live Workflows URL + tenant | Register a hook with a real Workflows URL, press "Envoyer un test" (D-11), check the channel |

All other phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies — yes (12 automated commands mapped above; ❌ W0 files created by the owning task in the same or an earlier plan)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify — holds (every task has an automated command)
- [ ] Wave 0 covers all MISSING references — holds (4 new test files + 1 e2e spec, all owned by named tasks)
- [ ] No watch-mode flags — holds
- [ ] Feedback latency < 45s — holds (quick command ~5s; full suite ~45s)
- [ ] `nyquist_compliant: true` set in frontmatter — done

**Approval:** approved 2026-11-15 (planning revision pass)
