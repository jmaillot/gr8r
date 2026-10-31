---
phase: "24"
slug: "operator-audit-workspace-admin-tier"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-31"
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (Node 24) + Playwright (e2e/) |
| **Config file** | package.json scripts; e2e/playwright.config.mjs |
| **Quick run command** | `node --test test/audit-log.test.mjs test/error-codes.test.mjs test/catalogue.test.mjs` |
| **Full suite command** | `npm test` ; `npx playwright test e2e` |
| **Estimated runtime** | ~30 seconds (quick) / ~5 minutes (full incl. e2e) |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/audit-log.test.mjs test/error-codes.test.mjs test/catalogue.test.mjs`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** `npm test` + `npx playwright test e2e` must be green
- **Max feedback latency:** 30 seconds (quick), 300 seconds (full)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 24-01-01 | 01 | 1 | AUD-01 | T-24-01 | Audit row written in same transaction as revoke; all fields (actor, action, target, session count, timestamp, IP) | unit | `node --test test/audit-log.test.mjs` | ❌ W0 | ⬜ pending |
| 24-01-02 | 01 | 1 | AUD-01 | T-24-02 | Forced audit failure → rollback: no revoked sessions, no audit row (drop-table atomicity) | unit | `node --test test/audit-log.test.mjs` | ❌ W0 | ⬜ pending |
| 24-01-03 | 01 | 1 | AUD-01/03 | T-24-03 | Append-only: static scan finds no UPDATE/DELETE on audit_log; route cycle only grows rows | unit | `node --test test/audit-log.test.mjs` | ❌ W0 | ⬜ pending |
| 24-0X-XX | 0X | X | AUD-02 | T-24-04 | Admin revokes member of own workspace; owner immunity / self-exclusion / peer-admin refusals (ownerImmune/adminOnly/notAMember) | unit | `node --test test/audit-log.test.mjs` | ❌ W0 | ⬜ pending |
| 24-0X-XX | 0X | X | AUD-02 | T-24-05 | Full admin-revoke lifecycle in real browser, EN+FR parametric | e2e | `npx playwright test e2e/admin-revoke-cycle.spec.mjs` | ❌ W0 | ⬜ pending |
| 24-0X-XX | 0X | X | AUD-03 | T-24-06 | Trail endpoint tier visibility (operator all / admin own-ws / member 403), verb filter, keyset pagination, rows readable with no users row | unit | `node --test test/audit-log.test.mjs` | ❌ W0 | ⬜ pending |
| — | — | — | — | — | err-code parity for any new fail() codes; catalogue parity for new UI keys | unit | `node --test test/error-codes.test.mjs test/catalogue.test.mjs` | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*(Task IDs are provisional until the planner finalizes plans — remap when plans land.)*

---

## Wave 0 Requirements

- [ ] `test/audit-log.test.mjs` — server-side coverage for AUD-01/02/03 (template: `test/operator-revoke.test.mjs` + `helpers/server.mjs` `withDb`)
- [ ] `e2e/admin-revoke-cycle.spec.mjs` — AUD-02 lifecycle EN+FR (template: `e2e/operator-revoke-cycle.spec.mjs`)
- [ ] New `err.<code>` entries in `src/locales/en.json` + `fr.json` if any new `fail()` code is emitted (run `npm run i18n:scan`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| (none currently identified) | — | — | — |

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s (quick path)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
