---
phase: "79"
slug: "governance-surface"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-20"
---

# Phase 79 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in), spawn-per-suite server harness |
| **Config file** | none — suites self-contained; shared harness `test/helpers/server.mjs` |
| **Quick run command** | `node --test test/governance.test.mjs` |
| **Full suite command** | `node --test test/` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/governance.test.mjs` (plus catalogue test after any locale edit)
- **After every plan wave:** Run `node --test test/`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 79-01-01 | 01 | 0 | WSG-07 | T-79-01 | non-operator listing → exact 403 operatorOnly (never 404/empty-200) | unit (server) | `node --test test/governance.test.mjs` | ❌ W0 | ⬜ pending |
| 79-01-02 | 01 | 0 | WSG-08 | T-79-02 | archived slug entry → 403 workspaceArchived; unarchive restores | unit (server) | `node --test test/governance.test.mjs` | ❌ W0 | ⬜ pending |
| 79-01-03 | 01 | 0 | WSG-08 | T-79-03 | delete refuses non-empty (workspaceNotEmpty); blocked while dispositions missing; audit rows in same tx | unit (server) | `node --test test/governance.test.mjs` | ❌ W0 | ⬜ pending |
| 79-02-01 | 02 | 1 | WSG-09 | T-79-04 | operator promote/demote relocated; settings.js no longer renders operatorCard; governance section gated on isInstanceAdmin | unit (client-surface) | `node --test test/governance-client.test.mjs` | ❌ W0 | ⬜ pending |
| 79-02-02 | 02 | 1 | WSG-11 | — | every new refusal key present in all 5 catalogues | unit | `node --test test/catalogue.test.mjs` | ✅ existing | ⬜ pending |
| 79-02-03 | 02 | 1 | — | — | migration: pre-column DB boots, `archived` default 0 | unit | `node --test test/migration.test.mjs` | ❌ W0 (extend) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/governance.test.mjs` — server suite (WSG-07/08 gate matrix + actions + audit)
- [ ] `test/governance-client.test.mjs` — client-surface suite (settings.js operatorCard removal pin + governance render gate)
- [ ] Migration assertion for `adapterEnsureColumn('workspaces','archived',...)` (extend `test/migration.test.mjs` pattern or pre-column DB fixture)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Type-to-confirm interaction feel (slug typing gates the button) | WSG-08 | DOM interaction nuance; covered indirectly by client-surface pin | Open governance page, attempt delete without typing slug — button stays disabled; typing exact slug enables it |

*Otherwise: core behaviors automated; only interaction feel is manual.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
