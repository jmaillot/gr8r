---
phase: "51"
slug: "client-surfaces-permissions-page-removal-project-creation"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-08"
---

# Phase 51 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in runner) |
| **Config file** | none — tests run directly via `node --test` |
| **Quick run command** | `node --test --test-concurrency=2 test/` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --check server.js && node --check mcp.js` plus the task's targeted test file
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green; `npm run i18n:scan` must pass
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 51-01-01 | 01 | 1 | VIS-01 | T-51-01 / — | toggle write-path enforces stored prefs, not client-writable doc | unit/integration | `node --test --test-concurrency=2 test/visibility-team.test.mjs` | ❌ W0 | ⬜ pending |
| 51-XX-XX | XX | X | CRT-01/CRT-02 | T-51-XX / — | permCreate enforced server-side (refusal not bypassable) | unit/integration | `node --test --test-concurrency=2 test/` (new project-create test) | ❌ W0 | ⬜ pending |
| 51-XX-XX | XX | X | UX-01 | — | i18n catalogue completeness + dead-key leak check | unit | `npm run i18n:scan` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*(Task IDs are placeholders until plans exist — the executor updates this map at wave time.)*

---

## Wave 0 Requirements

- [ ] New/extended test files for toggle visibility, team invite, project-create enforcement (fixtures per Phase 50 patterns)
- [ ] Dead-catalogue-key detection added to i18n scan or catalogue test (allow-list for interpolated keys)

*Existing node:test infrastructure otherwise covers the phase.*

---

## Manual-Only Verifications

- Stale-client honest recovery UX (localized not-found rendering) — visual confirmation in browser
- Share modal copy phrasing (EN+FR snapshot semantics) — human read-through
- Settings > Permissions page removal — no orphaned route reachable in running app
