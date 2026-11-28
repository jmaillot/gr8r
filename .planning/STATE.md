---
gsd_state_version: "1.0"
milestone: v3.6
milestone_name: Entra ID Mappings & Restore Sources
status: phase_complete
stopped_at: Completed 103-01-PLAN.md
last_updated: "2026-11-28T00:46:46.410Z"
state_head: f5f6fddd52cb644c46917ed901b4aa18a6a2678a
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 5
  completed_plans: 4
  percent: 20
---

# Project State: Projects Studio — v3.6

## Project Reference

- **Core value:** Self-hosted, zero-dependency, multi-tenant project-management workspace.
- **Current milestone:** v3.6 Entra ID Mappings & Restore Sources
- **Milestone goal:** Operator UI for Entra group → workspace mappings (manual GUID + manual label, no Graph), honest OIDC linking docs, and the deferred restore-source selection.
- **Roadmap:** `.planning/ROADMAP.md` — Phases 101–105, 15/15 requirements mapped.
- **Requirements:** `.planning/REQUIREMENTS.md` (owner rulings R-1..R-5 baked in).

## Current Position

- **Phase:** 103 — Restore-Source Refactor — Extract the Shared Ladder
- **Plan:** 02 next — 103-01 executed (golden pinned, see 103-01-SUMMARY.md)
- **Status:** Executing phase 103 (wave 1 of 2 complete)
- **Progress:** ▰▰▰▰▱ 101 (done) · ▰▰▰▰▱ 102 (done) · ▰▱▱▱▱ 103 (plan 01/02) · ▱▱▱▱▱ 104 · ▱▱▱▱▱ 105

## Performance Metrics

| Phase | Plans | Tasks | Duration | Started | Completed |
|-------|-------|-------|----------|---------|-----------|
| 101 | 1 | - | - | - | - |
| 102 | - | - | - | - | - |
| 103 | 1 of 2 | 2 | 23m | 2026-11-28T00:23Z | 2026-11-28T00:46Z |
| 104 | - | - | - | - | - |
| 105 | - | - | - | - | - |
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 101 P01 | 40m | 3 tasks | 4 files |
| Phase 103 P01 | 23m | 2 tasks | 1 files |

## Accumulated Context

### Decisions (milestone-invariant)

- **R-1 No Graph** — manual GUID paste + manual label; zero API permissions/consent; Graph lookup explicitly deferred.
- **R-2 Workspace membership only** — roles owner|admin|member; viewer refuses at save; no instance-role mappings this milestone.
- **R-3 Lazy revocation** — mapping delete never touches memberships; removal sync at next SSO login; UI copy states it honestly.
- **R-4 Flags are the truth** — restore-source availability from run mirror flags; dedicated throttled POST probe, never in the list GET (D-89-14).
- **R-5 Refactor before extension** — Phase 103 (byte-identical golden-pinned ladder extraction) MUST precede Phase 104 (`source` param). Non-negotiable.
- **Standing gates:** zero new npm dependencies; keyed refusals ×5 locales same-commit; dual-engine DDL lockstep via adapterEnsureColumn — research says NO schema change needed (group_mappings carries every column); membershipsOf byte-gate green.

### Todos

- (none yet)

### Blockers

- (none)

## Session Continuity

**Last session:** 2026-11-28T00:46:46.292Z
**Stopped at:** Completed 103-01-PLAN.md
**Resume file:** None

- **Last action:** v3.6 roadmap created (Phases 101–105) with 100% requirement coverage; REQUIREMENTS.md traceability filled.
- **Next:** `/gsd-discuss-phase 101` or `/gsd-plan-phase 101`.
- **Research flags:** Phase 103 (golden-test design before touching 3 call sites) and Phase 104 (sha256 twin seam + restore lock — highest-consequence integration) warrant deeper research at planning. Phases 101, 102, 105 use standard patterns (copy-verbatim guard ladder; governance.js analog; docs-only).

## Decisions

- [Phase 101]: D-02 overrides MAP-01: GET unthrottled, DELETE throttled-before-gate (403 consumes a try)
- [Phase 101]: isUniqueViolation classifier exported from db-adapter.mjs; SC-4 mismatch = liveMembers===0; SC-1 = 403 non-operator + 404 unknown-id (no oracle)
