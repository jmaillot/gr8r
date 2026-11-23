# Projects Studio — State

## Project Reference
- **Core value:** Self-hosted, zero-dependency, multi-tenant project-management workspace — hardening before features.
- **Current focus:** Milestone v3.4 "UX Polish & Backup Console Refinement" — governance/backup/settings UX refinement + digest dedup fix. Started 2026-11-23, after v3.3 shipped (Phases 85–90).
- **Reference:** PROJECT.md (milestone goals), REQUIREMENTS.md (14 v3.4 requirements), ROADMAP.md (Phases 91–95)

## Current Position
- **Phase:** 91 (Digest Dedup — One Digest Per User Per Day)
- **Plan:** not yet planned — run `/gsd-plan-phase 91` (or `/gsd-discuss-phase 91` first; research flags digest coalescing design as a discuss-phase topic)
- **Status:** Roadmap created, awaiting phase planning
- **Progress:** ░░░░░ 0/5 phases (v3.4)

**Parallelism note:** Phase 91 (digest) and Phase 92 (server payload contracts) are independent — can be planned/executed in either order or parallel. Phases 93–95 depend on Phase 92's contracts (93 on roles aggregation; 94 on cron descriptor/names/gfs_bucket/unified runs; 95 on backupScopeWorkspaces; settings items in 95 are independent).

## Performance Metrics
- v3.4 plan: 5 phases (91–95), 14 requirements, 100% mapped
- Suite gates at start: unit ~2050 pass / 0 fail, e2e green per v3.3 close, lint exit 0, chunk gate 498 kB < 500 kB, i18n ×5 parity gate

## Accumulated Context

### Standing constraints (v3.4)
- Zero new dependencies (owner-ratified)
- i18n ×5 locales (en/fr/nl/de/es) in the SAME commit as the emitting code
- Dual-engine DDL lockstep (SQLite + Postgres mirrored in the same commit)
- Audit funnel for every mutation; shared-connection tx discipline
- `workspacesForUser` is FROZEN — cross-workspace visibility is pickers-only via a separate `backupScopeWorkspaces` helper

### LOCKED owner rulings (do not re-litigate)
- GFS marker goes BOTH in UI labels AND in the archive filename at creation; format `<instance-name>-<scope>-<slug>-<gfs>-<date>`; machine token in filename, localized label in UI; ONE pure function shared with rotation; bucket stored on run row (`gfs_bucket` additive column); archives never renamed post-creation
- Digest aggregates to 1 email/day/user across workspaces with per-workspace sections; root cause = per-workspace claim key — fix is transport-layer coalescing (per-user outbox row per user/day inside the same tx); per-workspace semantic claim untouched
- Cross-workspace operator visibility: Backup/Restore pickers ONLY

### Phase-ordering anchors (from research)
- Phase 91 FIRST task: pin the 4× reproduction as a failing test
- Phase 92 FIRST task: extract the GFS pure function (`gfsBucketFor`) before any naming/rotation edit
- Phase 94 pin: server-side per-run scope check, fail-closed DROP of non-visible rows (research default — confirm at discuss), Restore-Op e2e sees zero workspace names
- Phase 95 gate: grep gate + switcher-vs-picker differential e2e proving `workspacesForUser` byte-unchanged

### Known gaps carried from v3.3
- webhook-events/webhook-routes test family, french-typography Phase-88 fr keys, logo junk-name quirk (export/backup.js:666), scheduler overlap load-flake — documented in deferred-items, acknowledged at v3.3 close

### Decisions
- 2026-11-23: v3.4 roadmap created — 5 phases numbered 91–95 continuing v3.3 numbering; sequential phase IDs

### Blockers
- None

## Session Continuity
- **Last action:** roadmap created (ROADMAP.md, STATE.md, REQUIREMENTS.md traceability updated)
- **Next:** `/gsd-discuss-phase 91` or `/gsd-plan-phase 91`
