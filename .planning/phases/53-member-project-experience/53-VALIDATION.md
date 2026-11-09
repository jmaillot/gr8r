---
phase: "53"
slug: "member-project-experience"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-09"
---

# Phase 53 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node --test (Node ≥24), 1141-test suite; @playwright/test for e2e |
| **Config file** | e2e/playwright.config.mjs (e2e); no unit config needed |
| **Quick run command** | `npm run test:privacy` / targeted `node --test test/mcp.test.mjs` |
| **Full suite command** | `npm test` + `npm run e2e` |
| **Estimated runtime** | ~60 s unit / ~3 min e2e |

---

## Sampling Rate

- **After every task commit:** targeted test file + `npm run i18n:scan`
- **After every plan wave:** `npm test`
- **Before `/gsd-verify-work`:** Full suite (`npm test` + `npm run e2e`) must be green
- **Max feedback latency:** ~60 s

---

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PSET-02/03 | Team-perm storage survives stale non-manager PUT (pin regression) | unit | `node --test test/hardening.test.mjs` (or mergeClientDoc home file — planner locates) | ⚠️ extend existing |
| PSET-03 | `projectPermFor` gates write routes; view-only team member can't edit/comment | unit | targeted `node --test test/<write-routes-file>` | ❌ Wave 0 (new) |
| PSET-03 | Funnel/mirror parity incl. client `canSee` fixture + team-perm oracle cells | unit | `node --test test/mcp.test.mjs` (VISIBILITY_MODEL harness at :742-759) | ✅ extend |
| INVT-01/02/03 | Draft survives interaction; guest-one-project refused server-side on create/edit (+MCP) | e2e + unit | `npm run e2e` / `node --test test/mcp.test.mjs` | ❌ Wave 0 (new cells) |
| PSET-01/04 | Unified modal opens from both surfaces; concurrent-edit 409 honesty | e2e | `npm run e2e` | ❌ Wave 0 |
| PROJ-01/02 | Columns render; exactly one Share button | e2e | `npm run e2e` | ❌ Wave 0 |
| TEAM-01/02/03 | Searchable box keeps checked state; hint wording; no invite button | e2e | `npm run e2e` | ❌ Wave 0 |
| UX-01 | 0 dead / 0 stale keys; catalogue pin | gate | `npm run i18n:scan` | ✅ exists |

---

## Wave 0 Gaps

- [ ] New `projectPermFor` write-route test file (PSET-03)
- [ ] Oracle cells in test/helpers/visibility-fixture.mjs (team-perm-view-only, revoked, dangling team id)
- [ ] Pin-block regression test cell (team keys byte-identical)
- [ ] Guest validator unit tests (create/edit/accept/MCP)
- [ ] e2e specs: unified modal (both locales, per-field survival), projects table, team search
