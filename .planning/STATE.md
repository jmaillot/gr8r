---
gsd_state_version: "1.0"
milestone: v3.5
milestone_name: Backup Destinations SMB & FTP
current_phase: 98
current_phase_name: FTP Destination End-to-End
status: executing
stopped_at: Completed 97-01-PLAN.md
last_updated: "2026-11-25T12:50:19.167Z"
last_activity: 2026-11-25
last_activity_desc: Phase 97 execution started
state_head: e52ae1b45e17bbcf8e9e2c0b7a6aa30a72f1dc0a
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 7
  completed_plans: 3
  percent: 0
---

# Projects Studio — State

## Project Reference

- **Core value:** Self-hosted, zero-dependency, multi-tenant project-management workspace — hardening before features.
- **Current focus:** Milestone v3.4 "UX Polish & Backup Console Refinement" — governance/backup/settings UX refinement + digest dedup fix. Started 2026-11-23, after v3.3 shipped (Phases 85–90).
- **Reference:** PROJECT.md (milestone goals), REQUIREMENTS.md (14 v3.4 requirements), ROADMAP.md (Phases 91–95)

## Current Position

Phase: 98 (FTP Destination End-to-End) — READY TO EXECUTE
Plan: 1 of 1
Status: Ready to execute
Last activity: 2026-11-25 — Phase 97 execution started

## Performance Metrics

- v3.4 plan: 5 phases (91–95), 14 requirements, 100% mapped
- Suite gates at start: unit ~2050 pass / 0 fail, e2e green per v3.3 close, lint exit 0, chunk gate 498 kB < 500 kB, i18n ×5 parity gate

**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 94 P1 | 3.5h | 6 tasks | 16 files |
| Phase 95 P01 | 30m | 3 tasks | 7 files |
| Phase 95 P04 | 2h | 4 tasks | 11 files |
| Phase 95 P02 | 50m | 3 tasks | 16 files |
| Phase 95 P05 | 55m | 3 tasks | 13 files |
| Phase 96 P01 | 50m | 3 tasks | 5 files |
| Phase 96 P02 | 2h | 3 tasks | 10 files |
| Phase 97 P97-01 | 2 sessions | 4 tasks | 5 files |

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
- 2026-11-24 (phase 94 UAT): Super Admin restore bypass (isInstanceAdmin + SUPER_ACCESS in lieu of membership; picker via backupScopeWorkspaces scopes payload); standalone archive list + Restore section retired — Restore rides the unified history table rows; checksum = toast at click (no durable badge); run-level Warning = missing blobs on succeeded; project-overwrite restore deferred to Phase 95 BKRST-05 (engine extension, 86-D-01 workspace-only containment stands)
- [Phase 95]: 95-01: Run-now picker rides S.ui.backupScopes with loaded-workspace fallback (never memberships); refreshBackupScopes once-per-session fill; A.invTeamToggle retired into surface-aware A.mteamToggle; membershipsOf byte gate + settings harness in place
- [Phase 95]: 95-04: project-overwrite restore (BKRST-05 engine half) — fragment splice ids-verbatim, D-01 deletion set, self-excluding collision scan, D-04 lock unchanged (owner 2026-11-24); route confirmName vs live doc project name; D-05 via membership|SA targeting gate (CAP chain verbatim — see SUMMARY deviation)
- [Phase 95]: 95-02: my-access aggregate (GET /api/settings/my-access) copies the /me/visibility funnel verbatim per workspace with additive icon/color/role; role badge reuses common.role.*; purge POST /api/keys/purge-revoked writes a count-only audit event (no key values); locale keys land in the emitting-markup commit (live dead-key gate)
- [Phase 95]: 95-05: scopes projects are unfiltered (picker needs names; server re-validates at overwrite); client confirmDlg is chrome only
- [Phase 95]: 95-05: overwrite POST key is targetId (route contract), not the plan's targetWorkspaceId
- [Phase 96]: 96-01: setBackupDestination(name,dest) registry (D-01 descriptor) replaces setBackupS3Destination outright (OQ-1, no shim; twins in rename commit); dormant ftp/smb slots env-derived, order s3>ftp>smb (D-04/D-05); Wave-0 gate pins seam shape + raw s3SliceError path + single uploaded=1 site
- [Phase 96]: 96-02: destLocation(r) ordered scan lives in server.js; flag columns selected as scan inputs but stripped from published projections to keep D-05 golden byte-identity (phases 98/100 own their payload reveal)
- [Phase 97]: EPSV parse regex matches real wire format (|||port|); P8 session reuse via getSession() on every data-channel connect; STOR retry = fresh channel + whole-file re-read, zero REST (P6/T10)

### Blockers

- None

## Session Continuity

**Last session:** 2026-11-25T11:06:08.221Z
**Stopped at:** Completed 97-01-PLAN.md
**Resume file:** None
- **Last action:** 94-VERIFICATION.md + phase close (ROADMAP checkbox, progress table, front-matter 80%)
- **Next:** `/gsd-plan-phase 95` (scope: SET-01..04, XWS-01, BKRST-05 project-overwrite restore)
