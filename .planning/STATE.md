---
gsd_state_version: "1.0"
milestone: v2.3
milestone_name: Consolidation & Hardening
current_phase: 62
current_phase_name: E2E Baseline Repair
status: executing
stopped_at: Phase 62 context gathered
last_updated: "2026-11-14T08:49:31.732Z"
last_activity: 2026-11-14
last_activity_desc: v2.3 roadmap created (3 phases, 62–64, 7/7 REQs mapped)
state_head: 95e6b83ac143b9f4aeae5611ddf9686a9b76a8bf
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# STATE.md

## Project Reference

**Project:** Projects Studio (gr8r) — self-hosted PM workspace
**Core Value:** simple, predictable access + a workspace that reaches you (push, search,
dashboards) without breaking the zero-dependency discipline
**Current Focus:** v2.3 Consolidation & Hardening — repair-only milestone (owner ruling
2026-11-14): 9 failing e2e specs, VIEW-02 flake, mobile tasks-table layout. No features.

## Current Position

Phase: 62 — E2E Baseline Repair (Not started)
Plan: —
Status: Roadmap approved, ready for `/gsd-plan-phase 62`
Last activity: 2026-11-14 — v2.3 roadmap created (3 phases, 62–64, 7/7 REQs mapped)

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

- v2.2 close: 1524 unit tests / 0 fail, e2e 111 (9 drifted red + VIEW-02 flaky), lint clean, chunk gate 11/11
- Chunk-gate headroom entering v2.3: ~220 B under the 500 kB gate
- Runtime dependencies: pg + web-push@4.0.0 (dep #2, owner-approved) — zero new in v2.3
- Requirement coverage: 7/7 mapped across Phases 62–64

## Accumulated Context

### Milestone decisions (owner-validated 2026-11-14)

- M-2.3 Consolidation first: hardening milestone over new features (repair-only)
- Mobile columns-button contract = **hide-the-button** (owner ruling 2026-11-14);
  richer `hidden[]`-driven card fields explicitly deferred to a later milestone
- Anti-feature: no weakened assertions, no global `retries` increases, no timeout
  inflation, no `reuseExistingServer` default change, no chunk-gate threshold edits

### Sequencing rationale (research consensus, unanimous)

- Phase 62 FIRST: red baseline poisons "e2e proves it" for both other targets.
  Within 62: readiness (ECONNREFUSED) fix as its own small plan, then the 9-spec rewrite
- Phase 63 next: fix measured on the stable green baseline; diagnosis may start in
  parallel with 62 but landing waits
- Phase 64 LAST: only product-CSS change (only real regression risk); repaired suite
  is its acceptance instrument; ~220 B gate headroom exposure → small plans per task
  (per-task triad: build + chunk test + i18n scan)

### Known flags for planning

- Phase 63 root cause unconfirmed: debounced `persistLiveView` write-through race is
  the leading hypothesis — triage (trace, retries=0, workers=1) precedes the fix
- Phase 63: confirm a VIEW-02 serial-group retry won't double-apply view mutations
- Phase 62: fix pattern proven in-repo (`demo-locale.spec.mjs:96` combobox contract) —
  standard patterns, skip `--research-phase`
- Phase 64: mobile contract decided (hide-the-button) — no open design question left
- Environmental trap across all phases: stale dist/ports/`test-results/` — always
  `npm run e2e -- <spec>`, never bare `npx playwright test`; clean between runs

### Standing constraints (every phase)

- 1524-test unit suite green; EN+FR i18n gate (server keys included); lint clean
- 500 kB chunk gate holds at 500,000 B (~220 B headroom) — remedy is lazy-map moves,
  never threshold bumps
- Phase 38 suppression + no-double-send invariants pass unmodified
- Zero new runtime or dev dependencies
- Fail-closed e2e posture intact: `gracefulShutdown`, no `reuseExistingServer` default
  change, global `retries` untouched

## Session Continuity

**Last session:** 2026-11-14T08:49:31.689Z
**Stopped at:** Phase 62 context gathered
**Resume file:** .planning/phases/62-e2e-baseline-repair/62-CONTEXT.md

**Last action:** ROADMAP.md + STATE.md written for v2.3; REQUIREMENTS.md traceability updated (7/7)
**Next action:** `/gsd-plan-phase 62` after roadmap approval

### Blockers

- (none)

## Operator Next Steps

- Review `.planning/ROADMAP.md` → `/gsd-plan-phase 62`
