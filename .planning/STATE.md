---
gsd_state_version: "1.0"
milestone: v3.3
milestone_name: Instance Operations — Backup, Restore & Roles
current_phase: 86
current_phase_name: "Export Core (\"gr8r backup v1\")"
status: planning
stopped_at: Phase 85 complete, ready to plan Phase 86
last_updated: "2026-11-21T16:37:57.008Z"
last_activity: 2026-11-21
last_activity_desc: Phase 85 complete, transitioned to Phase 86
state_head: 0fd47c85574ca1fa52339cad0a94d344b98114c0
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 2
  completed_plans: 2
  percent: 17
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-21)

**Core value:** Self-hosted, zero-dependency, multi-tenant project-management workspace — hardening
before features.
**Current focus:** Phase 85 — Roles Foundation

## Current Position

Phase: 86 — Export Core ("gr8r backup v1")
Plan: Not started
Status: Ready to plan
Last activity: 2026-11-21 — Phase 85 complete, transitioned to Phase 86

## Milestone v3.3 Phase Map

| Phase | Name | Requirements | Depends on |
|-------|------|--------------|------------|
| 85 | Roles Foundation | BKROLE-01..03 | Nothing |
| 86 | Export Core ("gr8r backup v1") | BKBCK-01 | 85 |
| 87 | Scheduler, Tasks, Run History & Rotation | BKBCK-02..04 | 86 |
| 88 | S3 Destination | BKBCK-05 | 86 |
| 89 | Restore | BKRST-01..04 | 85, 86, 88 |
| 90 | Polish & Verification Sweep | SACON-01 | 85–89 |

Owner-ratified decisions D-33-1..12 live in REQUIREMENTS.md and bind all phases — do not reopen.

Standing constraints for v3.3:

- Zero new npm dependencies (D-33-11) — S3 client, cron math, tar/gzip all hand-rolled on Node stdlib
- 5-locale keyed refusals land in the same commit as the first emitting gate (en/fr/nl/de/es)
- Restore authority is scoped by LIVE rights, never archive contents (D-33-10); download tiered above run rights
- One destination per task (D-33-12 anti-features ratified)
- Continuous phase numbering: v3.3 starts at Phase 85 (v3.2 ended at 84)

Research flags carried into planning (do not resolve at roadmap level):

- Phase 86: ustar size math; file-id→workspace/project mapping verification; tmp hygiene sweep
- Phase 87: GFS namespace semantics (per-task vs shared — recommend per-task)
- Phase 88: MinIO/B2 provider quirks re-check against pinned MinIO version
- Phase 89: overwrite-restore concurrency model; row-shaped tables restore scope; MCP mirror in/out

## Performance Metrics

**Velocity:**
- Total plans completed (v3.3): 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 85 | 2 | - | - |
| 86 | 0 | - | - |
| 87 | 0 | - | - |
| 88 | 0 | - | - |
| 89 | 0 | - | - |
| 90 | 0 | - | - |

*Updated after each plan completion*

## Accumulated Context

### Decisions

Owner-ratified 2026-11-21 (REQUIREMENTS.md D-33-1..12, binding):

- D-33-1 tar+gzip "gr8r backup v1", manifest entry 0, per-table NDJSON, sha256 3-level, one code path SQLite/Postgres
- D-33-2 import-as-new (-restored) default; overwrite optional with type-to-confirm + pre-restore snapshot
- D-33-3 local + S3-compatible destinations v1; SMB/FTP v2
- D-33-4 extensible instance_roles table; Super Admins implicit members
- D-33-5 one "Instance Roles" tab in Instance > Governance
- D-33-6 GFS per task, per-scale counts, defaults 7/4/12/5
- D-33-7 Backup Operator = full task CRUD; Restore Operator = browse/preview/restore only
- D-33-8 transition-based failure email via email_outbox (no success emails)
- D-33-9 builder + presets in UI, stored as 5-field cron subset (no free-text cron)
- D-33-10 restore authority by live rights; operational tables never selectively restored
- D-33-11 zero new npm dependencies
- D-33-12 anti-features out of scope: incremental/dedup, encryption at rest, per-item restore UI, dry-run, success emails, multi-destination tasks, SMB/FTP, live-restore browse

Cross-phase decisions that freeze in Phase 86: archive format, manifest schema + entity addressability, data-vs-operational table classification, checksum canonical statement (sha256 of final destination bytes, computed once at export).

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 86 is the one genuinely new engineering surface (archive format, snapshot fence) — plan-phase with research recommended
- Phase 89 is the highest-risk phase (restore atomicity, id remap, privilege escalation) — security contract (Phase 30 pattern, threats_open: 0) required
- v3.2 carried-forward debt: Nyquist VALIDATION.md missing for 80/81/82/84; webhook-events pre-existing test failure

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| pre-existing failure | webhook-events.test.mjs "due task with subscribed hook yields exactly ONE due.reminder delivery" fails (0≠1 claim row) — reproduced on the pre-78 tree (5b4aae51 server.js); unrelated to the creation gate | open | 78-01 | v3.1 |

## Session Continuity

Last session: 2026-11-21T14:44:02.819Z
Stopped at: Phase 85 complete, ready to plan Phase 86
Resume file: .planning/phases/85-roles-foundation/85-CONTEXT.md

## Operator Next Steps

- Review .planning/ROADMAP.md, then run /gsd-plan-phase 85
