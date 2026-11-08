---
gsd_state_version: "1.0"
milestone: v2.0
milestone_name: Project-level Permissions & Invitations
current_phase: 50
current_phase_name: Invite hierarchy & per-project toggles (server)
status: executing
stopped_at: Completed 50-04-PLAN.md (Phase 50 complete — ready for /gsd-verify-work 50)
last_updated: "2026-11-08T09:55:00.000Z"
last_activity: 2026-11-08
last_activity_desc: Plan 50-04 executed (domain + planning docs locked to D-50-5 live team link; five success criteria evidenced; full suite green)
state_head: f4d9796
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 9
  completed_plans: 9
  percent: 100
---

# STATE.md

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-07)

- **Project:** Projects Studio — self-hosted PM workspace, zero-config default, `{ pg }` only runtime dep

**Core value:** real auth, real multitenancy, real localization, real notifications — no decorative state
**Current focus:** Phase 50 — Invite hierarchy & per-project toggles (server)

## Current Position

Phase: 50 (Invite hierarchy & per-project toggles (server)) — EXECUTING
Plan: 4 of 4 — COMPLETE (phase ready for /gsd-verify-work)
Status: Executing Phase 50
Last activity: 2026-11-08 — Plan 50-04 executed (docs + planning-doc lockstep to D-50-5; five success criteria evidenced; phase gate green)

## v2.0 Phase Order (roadmap created 2026-11-07)

1. Phase 49 — Visibility model collapse & grant materialization (MIG-01..03, VIS-02, VIS-03;
   predicate collapse + same-boot sweep + MCP mirror lockstep; deepest test investment:
   404-matrix extension, set-equality fixtures, dual backend)
2. Phase 50 — Invite hierarchy & per-project toggles, server (INV-01..04, VIS-04;
   hierarchy at create AND edit AND accept; snapshot team expansion; toggle default OFF)
3. Phase 51 — Client surfaces, Permissions-page removal & creation (VIS-01, CRT-01..02,
   UX-01; toggle UI, share-modal team invite, page deletion, i18n gate)
4. Phase 52 — Transparency view & milestone verification sweep (TRN-01; funnel-computed
   view + full no-leak/invariant pass)

Milestone-wide invariants (pinned per phase): Phase 38 suppression + no-double-send invariants
unmodified; EN+FR i18n gate (server keys included); zero new runtime dependencies; full suite
green; byte-identical 404s (no existence oracle); SQLite+pg dual backend for migration tests.

## Recent Decisions

- [50-04] Domain docs restate the three-term live predicate (public ∨ p.members ∨ p.teams) and the guest→viewer collapse; permGuests is documented as superseded by the per-project p.allowInviteGuests toggle
- [50-04] REQUIREMENTS.md TEAM-RESYNC (v3) and the "live-list team grants" out-of-scope row marked superseded by D-50-5 — no planning doc contradicts the live team link

- [50-03] Fail-closed toggle re-derivation at accept runs BEFORE account creation/membership writes — a stale-invite refusal leaves zero side effects and does not consume the invite (D-50-8)
- [50-03] The invite gate is rank-conditional inside one route: admin/owner behavior byte-preserved (team invites bypass the toggle, D-50-9); member ⇒ viewer-only + project + toggle ON on the CURRENT doc
- [50-03] Toggle flip is workspace-rank-gated (admin/owner) even for a project lead who is a plain member; default OFF everywhere, creation path never writes it true

- [50-01] D-50-5 "live" = the predicate reads current p.teams + current team_members on every evaluation, no cache — a team join grants and a leave revokes on the very next request (pinned by visibility-team tests)
- [50-01] Admin/owner doc-GET path stays access-list-gated (no team term via hiddenProjectIds); the mcp.js mirror keeps its ROLE_RANK bypass — documented drift preserved per RESEARCH Open Question 2
- [50-01] Phase 49 sweep deleted outright (0 symbols on any boot path); scope columns dormant-on-disk, read by nothing; scalar p.team key is dead (nothing converts it)
- [50-02] D-50-6 provenance owner-ruled at the blocking-human checkpoint: pre-sweep backup DBs (projects-pre-visibility-*.db) when present, documented fail-open fallback otherwise (no links restored, boot warning names workspaces needing owner relinking)
- [50-02] restoreTeamLinks removes ONLY entries the backup diff positively identifies as sweep-materialized (current − pre-sweep members); owner-relinked projects (teams key present) are skipped; doc marker data.teamLinksRestored makes boot 2 a byte-identical no-op and never resurrects a deleted link
- [50-02] D-50-10 is a pure table transform (memberships + invites guest→viewer) — doc-embedded role copies need none (p.members is a plain id array; profile role is the presentation label); ROLE_LABEL.viewer='Guest' stays until Phase 51 (flagged-edge scope ruling)

- [49-05] Scalar `p.team` conversion is sweep-side, NOT normalizeProjects — a re-add would churn served copies and break the D-49-6 second-boot byte-identity pin (CR-01 closure)
- [49-05] WR-02: sweepNeeded falls back to `scopeRowCount > 0` on unreadable docs; the tx clears scope columns on that path in the same transaction — no-churn preserved
- [v2.0 roadmap] Phase numbering continues from v1.10 (Phase 48) — v2.0 is Phases 49-52, no reset
- [v2.0 roadmap] Research's 4-phase build order adopted (ARCHITECTURE.md primary): funnel+migration
  → invites/toggles → client surfaces → transparency+verification; sweep and predicate change land
  in the SAME phase and boot (Pitfall 1), mcp.js edited in the SAME phase as the funnel (Pitfall 2)
- [v2.0 roadmap] Doc-resident membership confirmed per research synthesis — `p.members[]` fan-out
  target, NO `project_members` table; team invites expand server-side into `p.members` (snapshot)
- [v2.0 roadmap] VIS-01 mapped to Phase 51 (UI surface; the underlying model ships in Phase 49);
  VIS-04 mapped to Phase 50 (server-side gate precedes its UI)
- [v2.0 research] Storage disagreement (STACK table vs ARCHITECTURE doc-resident) resolved:
  ARCHITECTURE wins — doc ids have no FK, M-03 snapshot semantics need materialized membership,
  transparency view routes through the funnel anyway
- [Phase 38]: digest window is hour >= 9; claim key `${ws.id}:${user_id}:${localDate}` is the
  no-double-send guarantee — v2.0 must keep suppression/no-double-send invariants byte-identical
- [Phase 45]: pg is the only runtime dependency; adapter normalizes rows and run() returns
  exactly { changes } on both backends — v2.0 schema changes stay portable (text ids, integer epochs)

## Milestone History

- ✅ v1.1 Multitenant — shipped, archived
- ✅ v1.2 Localization — shipped 2026-10-25, archived
- ✅ v1.3 Auth Hardening — shipped 2026-10-28, archived
- ✅ v1.4 Auth Completion — shipped 2026-10-30, archived (audit passed)
- ✅ v1.5 Reliability & Rotation — shipped 2026-11-01, archived (audit tech_debt; 16/16 REQs)
- ✅ v1.6 Team Access & Federation — shipped 2026-11-02 (4 phases, 17 plans, 24/24 REQs)
- ✅ v1.7 Team Visibility & Hardening — shipped 2026-11-04 (4 phases, 12 plans)
- ✅ v1.8 Notification Sanity — shipped 2026-11-05 (4 phases, 12 plans, 13/13 REQs)
- ✅ v1.9 Digest Context & One-Click Unsubscribe — shipped 2026-11-07, archived (audit passed)
- ✅ v1.10 Extensions & Adapters — shipped 2026-11-07, archived (4 phases: 45-48; audit passed;
  14/14 REQs; phases 46/47 branch-delivered with retrospective artifacts verified post-hoc)

## Accumulated Context

### Decisions

- Zero-dependency scheduling: in-process `setInterval` pass + boot catch-up, no cron/redis
- Keyring format frozen: `v2:<key-id>:<iv>:<tag>:<ct>` — HMAC tokens domain-separate from MASTER_KEY
- [Phase 38]: suppression gate reads STORED email_digest via getStoredNotifPrefs (D-08)
- [Phase 34]: notif prefs are sparse SQLite rows keyed (workspace_id, user_id); consumers read
  STORED values via getStoredNotifPrefs
- [v1.6 Phase 29]: D-03 grant inversion (scope OPENS private projects) — v2.0 M-05 DEMOTES this
  model; scope columns become dormant-on-disk/ignored-by-code (MIG-02, D2.0-2)
- [v1.7 Phase 32]: team-derived visibility (`project.teams ∩ member.teams`) — v2.0 M-05 REPLACES
  this with explicit invites; `p.teams` deleted after materialization (MIG-01)
- [v1.7 Phase 33]: invite-accept hardening pattern (sameOrigin first, fail-closed twins, silent
  body whitelist) — v2.0 Phase 50 accept-time re-derivation follows the same fail-closed shape
- [Phase 49]: 49-01: VISIBILITY_MODEL oracle hand-derived from RESEARCH matrix, admin/owner rows corrected by live probe (access-list gating applies to everyone; private-empty projects serve to doc owner only)
- [Phase 49]: 49-01: MCP parity asserted as deepEqual on coinciding actor shapes (m_plain/m_team) plus documented-divergence assertions for scoped/admin actors; MIRROR_MODEL pins old mirror semantics until Plan 03 collapse
- [Phase 49]: Dissolve clears p.lead when the dissolved member was the lead (normalizeProjects :925 would resurrect the entry on read)
- [Phase 49]: sweepNeeded fires only on non-empty p.teams arrays; empty teams:[] is post-normalization status quo and inert (D-49-6 second-boot no-op)
- [Phase 49]: D-49-1..5: visibility collapsed to boolean-private + access list; scope/team terms retired; mcp mirror keeps ROLE_RANK admin bypass (documented residue)
- [Phase 49]: 49-04: mcp mirror private field collapsed to boolean-only read (legacy p.access fallback deleted); historical retired-term mentions kept as D-49-tagged comments; docs/ProjectPermissions.md + WorkspacePermissions.md rewritten to the collapsed model

### Roadmap Evolution

- v2.0 roadmap created 2026-11-07: 4 phases (49-52), research's build order adopted 1:1

### Pending Todos

None yet.

### Blockers/Concerns

- [v2.0] Phase 49: run discuss-phase first — call-site census, fixture design, and owner D-xx
  rulings (scope-column disposition, `p.private` boolean vs enum) before planning (research flag)
- [v2.0] Phase 50: run discuss-phase — M-02 "scope" meaning under demoted D-03 and
  snapshotted-team-removal UX need owner clarification (research flag); D2.0-1 (toggle default
  OFF) and D2.0-3 (one guest concept) already ruled in REQUIREMENTS.md
- [v2.0] Phase 4 decision pending: transparency view access (admin-only vs self-permitted) —
  owner decision during Phase 52 planning (D2.0-4)
- [carried] v1.5/v1.9 deferred items — see Deferred Items

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
- [carried] v1.5 deferred items (2 unknown debug sessions, phase 26 WR-01/WR-02) — see Deferred Items
- [carried] `DatabaseSync` deprecation alias (DEP0210) noted as deferred — owner ruled out of v2.0 scope

### Deferred Items

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| deferred_items | 45/deferred-items.md: full-suite i18n-catalogue + SPA deep-link flake | resolved (2 clean full-suite runs on main verified firsthand at close; 1133 tests, 0 fail) | 2026-11-07 | v1.10 |
| debug_sessions | admin-revoke-only-own-session | unknown | 2026-11-01 | v1.5 |
| debug_sessions | login-broken-after-rotation | unknown | 2026-11-01 | v1.5 |
| uat_gaps | 26/26-UAT.md | diagnosed (0 pending scenarios) | 2026-11-01 | v1.5 |
| deferred_items | 28-02 TEAM-05 pin born green | acknowledged (intentional no-RED per TDD rules) | 2026-11-02 | v1.6 |
| deferred_items | DatabaseSync DEP0210 alias | noted (not a v1.7 concern) | 2026-11-02 | — |
| deferred_items | 34/deferred-items.md: D-12 COPY-pin allowlist resolved | acknowledged | 2026-11-05 | v1.8 |
| debug_sessions | G-44-3 | diagnosed→resolved (44-04 gap closure executed; session closed at v1.9 close) | 2026-11-07 | v1.9 |
| deferred_items | 41/deferred-items.md: concurrent-session WIP contamination (feat/landing-signup-redesign) | deferred (out of scope, owning session's WIP) | 2026-11-07 | v1.9 |
| deferred_items | 43/deferred-items.md: totp-rewrap D-74 EACCES pre-existing test failure | deferred (environmental, fixture DATA_DIR strategy to rework) | 2026-11-07 | v1.9 |
| deferred_items | 43/deferred-items.md: ~12 pre-existing lint errors in untouched files | deferred (documented, 0 introduced by v1.9; owner ruled out of v2.0) | 2026-11-07 | v1.9 |

## Session Continuity

Last session: 2026-11-08T09:55:00.000Z
Stopped at: Completed 50-04-PLAN.md (Phase 50 complete)
Resume file: None

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 48 P01 | 15 min | 3 tasks | 7 files |
| Phase 48 P02 | 14 min | 3 tasks | 9 files |
| Phase 49 P01 | ~2h | 3 tasks | 4 files |
| Phase 49 P02 | 50m | 3 tasks | 4 files |
| Phase 49 P03 | 75m | 3 tasks | 7 files |
| Phase 49 P04 | 40 min | 2 tasks | 7 files |
| Phase 50 P01 | 35 min | 3 tasks | 6 files |
| Phase 50 P02 | 45 min | 3 tasks | 2 files |
| Phase 50 P04 | 55 min | 3 tasks | 5 files |

*(v1.9 and earlier metrics archived with the milestone records.)*

## Operator Next Steps

- /gsd-verify-work 50 (phase gate green: 1115 tests, 0 fail), then /gsd-plan-phase 51
