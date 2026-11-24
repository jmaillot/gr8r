---
gsd_state_version: "1.0"
milestone: v3.4
milestone_name: UX Polish & Backup Console Refinement
status: unknown
stopped_at: Completed 94-1 (phase branch phase-94-backup-console-ux, not merged)
last_updated: "2026-11-24T08:13:00.257Z"
state_head: 81494b06f32f2ccdd143fb71549894ca5903e477
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 4
  completed_plans: 4
  percent: 20
---

# Projects Studio — State

## Project Reference

- **Core value:** Self-hosted, zero-dependency, multi-tenant project-management workspace — hardening before features.
- **Current focus:** Milestone v3.4 "UX Polish & Backup Console Refinement" — governance/backup/settings UX refinement + digest dedup fix. Started 2026-11-23, after v3.3 shipped (Phases 85–90).
- **Reference:** PROJECT.md (milestone goals), REQUIREMENTS.md (14 v3.4 requirements), ROADMAP.md (Phases 91–95)

## Current Position

- **Phase:** 93 complete ✓ (verified 2026-11-24, 4/4 SCs; commits 8fe65b52..9d65c9a4) — next: Phase 94 (Backup Console UX)
- **Plan:** phase 94 not yet planned — run `/gsd-discuss-phase 94` then `/gsd-plan-phase 94`
- **Status:** Phases 91–93 done — Phase 94 (Backup Console UX) and 95 (Settings + Pickers) remain
- **Progress:** ███░░ 3/5 phases (v3.4)

**Parallelism note:** Phase 91 (digest) and Phase 92 (server payload contracts) are independent — can be planned/executed in either order or parallel. Phases 93–95 depend on Phase 92's contracts (93 on roles aggregation; 94 on cron descriptor/names/gfs_bucket/unified runs; 95 on backupScopeWorkspaces; settings items in 95 are independent).

## Performance Metrics

- v3.4 plan: 5 phases (91–95), 14 requirements, 100% mapped
- Suite gates at start: unit ~2050 pass / 0 fail, e2e green per v3.3 close, lint exit 0, chunk gate 498 kB < 500 kB, i18n ×5 parity gate

**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 94 P1 | 3.5h | 6 tasks | 16 files |

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
- [Phase 94]: cronToPreset = describeCron.kind projection (null=custom); monRestricted fix; badge = client latest-per-task over frozen ?all=1 limit-50; prefill keeps cronDirty=false; 4-scale retention with gfs labels; unified sblock filter enum = served statuses only; poll /runs/current gated on canBackup

### Blockers

- None

## Session Continuity

**Last session:** 2026-11-24T08:12:47.267Z
**Stopped at:** Completed 94-1 (phase branch phase-94-backup-console-ux, not merged)
**Resume file:** None
- **Last action:** roadmap created (ROADMAP.md, STATE.md, REQUIREMENTS.md traceability updated)
- **Next:** `/gsd-discuss-phase 91` or `/gsd-plan-phase 91`
