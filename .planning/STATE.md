---
gsd_state_version: "1.0"
milestone: v1.7
milestone_name: Team Visibility & Hardening
current_phase: 32
current_phase_name: Team-Derived Project Visibility
status: executing
stopped_at: Phase 32 context gathered
last_updated: "2026-11-02T20:42:21.305Z"
last_activity: 2026-11-02
last_activity_desc: Phase 32 execution started
state_head: 1e82f1198575418ba8e9e2368eb294308514fb17
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 1
  completed_plans: 0
  percent: 0
---

# STATE.md

## Project Reference

- **Project:** Projects Studio — self-hosted PM workspace, zero runtime dependencies
- **Core Value:** real auth, real multitenancy, real localization, real notifications — no decorative state
- **Current focus:** v1.7 Team Visibility & Hardening — Phase 32 ready to plan

## Current Position

Phase: 32 (Team-Derived Project Visibility) — EXECUTING
Plan: 1 of 1
Status: Executing Phase 32
Last activity: 2026-11-02 — Phase 32 execution started

## v1.7 Phase Order (research-validated build order)

1. Phase 32 — Team-derived project visibility (VIS-01..05; structural item — lands FIRST
   because send-time filters, search filter and undo semantics all derive from it; recommend
   discuss-phase or research-phase for the composition semantics VIS × scope × admin × guest)
2. Phase 33 — Membership-surface hardening (HARD-01..05; independent, pinned one-line edits;
   `firstWorkspace()` twins at :4354 and :2773 must change in ONE commit)
3. Phase 34 — Per-user settings isolation & search leak closure (SETTINGS-01..03, SEARCH-01;
   the ONLY additive-migration item — byte-identical-second-boot burden; SEARCH folds here
   because it tunes for free once VIS landed)
4. Phase 35 — Honest undo & deploy gap (UNDO-01..02, DEPLOY-01; light closer — undo tests
   written after VIS semantics are final, exercised as admin; compose rider is trivial)

Milestone-wide invariants: zero runtime dependencies, additive migrations with byte-identical
second boot, full suite green (803-test baseline), EN+FR i18n gate, D-03 grant inversion +
404 no-oracle + single `hiddenFor` funnel preserved.

## Recent Decisions

- [v1.7 roadmap] Phase structure: 4 phases — VIS first (data-flow-forced), HARD second
  (independent, settles security surface early), SETTINGS+SEARCH third (migration burden +
  post-VIS search tuning in one phase), UNDO+DEPLOY last (light closer)
- [v1.7 roadmap] Backlog 999.1 (team-derived visibility) is now Phase 32; the Backlog
  section is empty
- [v1.7 roadmap] SEARCH folded into the SETTINGS phase rather than standing alone
  (single-requirement phases avoided; post-VIS ordering preserved)
- [v1.7 roadmap] UNDO after VIS (Phase 35 > Phase 32) — undo re-PUTs flow through
  `mergeClientDoc`, so tests need final VIS semantics
- [v1.6 roadmap]: Team membership lives ONLY in authority rows (`teams` + `team_members`);
  doc `teams[].members` is a rebuilt display projection — never client-mergeable
- [v1.6 roadmap]: Scope restricts, role governs; no per-team roles inside the role ladder
- [Phase 29]: hiddenFor() composes private-hidden ∪ out-of-scope disjunctively — VIS's
  team-gated set must join this union additively (D-03 grant inversion survives)

## Milestone History

- ✅ v1.1 Multitenant — shipped, archived
- ✅ v1.2 Localization — shipped 2026-10-25, archived
- ✅ v1.3 Auth Hardening — shipped 2026-10-28, archived
- ✅ v1.4 Auth Completion — shipped 2026-10-30, archived (audit passed)
- ✅ v1.5 Reliability & Rotation — shipped 2026-11-01, archived (audit tech_debt; 16/16 REQs)
- ✅ v1.6 Team Access & Federation — shipped 2026-11-02 (4 phases, 17 plans, 24/24 REQs,
  803 tests, security audit 17/17 threats closed)

## Accumulated Context

### Decisions

- Zero-dependency scheduling: in-process `setInterval` pass + boot catch-up, no cron/redis
- Version-aware boot migration filter must land before any `v2:` envelope exists
- Keyring format frozen: `v2:<key-id>:<iv>:<tag>:<ct>` — rotation re-wrap covers factor rows
- [v1.6 roadmap]: Team membership lives ONLY in authority rows; doc `teams[].members` is a
  display projection — never client-mergeable
- [v1.6 roadmap]: SSO links on verified email only, keyed by (issuer, subject)
- [Phase 29]: 29-01: hiddenFor() composes private-hidden ∪ out-of-scope disjunctively
- [Phase 29]: 29-02: D-03 grant inversion — scopeGrants() short-circuits the private check;
  the 404-matrix artifact (MATRIX in test/scope.test.mjs) is the named sweep future
  endpoint families must extend (VIS-05 extends it with team-derivation cells)
- [Phase 29]: 29-03: send-time-only enforcement — reminder pass, email mirror and assignee
  write-guard are the authority (VIS-04 adopts the same team-intersect helper there)

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 32 composition semantics (VIS × scope × admin × guest) are genuine design decisions —
  recommend discuss-phase or research-phase before planning.
- Phase 34 migration-order placement in `bootstrap()` is load-bearing; stale-client handling
  (write-path strip vs tolerate-and-ignore) is an explicit decision, not a default.
- UNDO direction (Phase 35) is an owner decision at plan time: Option A (compensating
  client-side replay, snapshot moved above the purge) vs Option C (drop the Undo offer).
  Research recommends A; the client capture MUST move before the purge either way.
- v1.5 deferred items carry forward (2 unknown debug sessions, phase 26 WR-01/WR-02) — see
  Deferred Items.
- `DatabaseSync` deprecation alias (DEP0210) noted as deferred, not a v1.7 concern.

### Deferred Items

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| debug_sessions | admin-revoke-only-own-session | unknown | 2026-11-01 | v1.5 |
| debug_sessions | login-broken-after-rotation | unknown | 2026-11-01 | v1.5 |
| uat_gaps | 26/26-UAT.md | diagnosed (0 pending scenarios) | 2026-11-01 | v1.5 |
| deferred_items | 28-02 TEAM-05 pin born green | acknowledged (intentional no-RED per TDD rules) | 2026-11-02 | v1.6 |
| deferred_items | DatabaseSync DEP0210 alias | noted (not a v1.7 concern) | 2026-11-02 | — |

*(28-02 delTeam undo deferred item is now scheduled — Phase 35 UNDO-01/02.)*

## Session Continuity

Last session: 2026-11-02T20:16:46.266Z
Stopped at: Phase 32 context gathered
Resume file: .planning/phases/32-team-derived-project-visibility/32-CONTEXT.md

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| *(v1.7 — no plans executed yet)* | | | |

*(v1.6 metrics archived with the milestone record.)*

## Operator Next Steps

- Review `.planning/ROADMAP.md`, then start Phase 32 with `/gsd-plan-phase 32`
  (consider `/gsd-discuss-phase 32` or research first — VIS composition semantics)
