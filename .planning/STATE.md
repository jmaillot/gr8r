---
gsd_state_version: "1.0"
milestone: v3.7
milestone_name: Mappings UX & Team Mapping
status: initialized
stopped_at: Completed 106-01-PLAN.md
last_updated: "2026-11-28T10:20:26.112Z"
state_head: 8cf3059102f7870ad36714e4bdd0506213c2a2d1
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 2
  completed_plans: 1
  percent: 0
---

# Project State: Projects Studio — v3.6

## Project Reference

- **Core value:** Self-hosted, zero-dependency, multi-tenant project-management workspace.
- **Current milestone:** v3.6 Entra ID Mappings & Restore Sources
- **Milestone goal:** Operator UI for Entra group → workspace mappings (manual GUID + manual label, no Graph), honest OIDC linking docs, and the deferred restore-source selection.
- **Roadmap:** `.planning/ROADMAP.md` — Phases 101–105, 15/15 requirements mapped.
- **Requirements:** `.planning/REQUIREMENTS.md` (owner rulings R-1..R-5 baked in).

## Current Position

- **Phase:** 105 — final phase, verified
- **Status:** v3.7 initialized — ready for /gsd-plan-phase 106
- **Progress:** ▱▱▱▱▱ 106 · ▱▱▱▱▱ 107 · ▱▱▱▱▱ 108

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
| Phase 106 P01 | 35m | 3 tasks | 4 files |

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

**Last session:** 2026-11-28T10:20:26.082Z
**Stopped at:** Completed 106-01-PLAN.md
**Resume file:** None

- **Last action:** v3.6 roadmap created (Phases 101–105) with 100% requirement coverage; REQUIREMENTS.md traceability filled.
- **Next:** `/gsd-discuss-phase 101` or `/gsd-plan-phase 101`.
- **Research flags:** Phase 103 (golden-test design before touching 3 call sites) and Phase 104 (sha256 twin seam + restore lock — highest-consequence integration) warrant deeper research at planning. Phases 101, 102, 105 use standard patterns (copy-verbatim guard ladder; governance.js analog; docs-only).

## Decisions

- [Phase 101]: D-02 overrides MAP-01: GET unthrottled, DELETE throttled-before-gate (403 consumes a try)
- [Phase 101]: isUniqueViolation classifier exported from db-adapter.mjs; SC-4 mismatch = liveMembers===0; SC-1 = 403 non-operator + 404 unknown-id (no oracle)
- [Phase 106]: Option A: sync cell owns all group team writes off raw mappings; changes-only WHERE-guard upsert protects zero-write pins
