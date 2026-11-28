# Requirements — v3.7 Mappings UX & Team Mapping

*Owner rulings baked in below (R-6..R-10). Research: `.planning/research/TEAM-MAPPING.md` (`2a185f8b`), `MAPPINGS-UX.md` (`13826a06`), `CARRIED-ITEMS.md` (`32ff4e79`).*

## Standing constraints

- Zero new npm dependencies. Audit funnel keyed ×5 locales same commit. Dual-engine DDL lockstep (adapterEnsureColumn) for every new column. Test baseline ~2767 / 2–3 documented pre-existing failures. esc() discipline. No brittle hard counts.

## Owner rulings

- **R-6 Optional team, role unchanged** — a mapping with a team grants team membership AND the workspace role from the same row; no team = exactly v3.6 behavior.
- **R-7 Usage Log = all group lifecycle actions** — granted / upgraded / downgraded / removed / guard-refused, one table.
- **R-8 Mapping edit exists** — today only delete; edit = workspace/team/role/label; **GUID immutable**.
- **R-9 v3.8 Governance UI refresh** — out of scope here; v3.7 tables seed the design language.
- **R-10 Carried items ride phase 108** — per-run archive probe, restore initiator, SSO logWarn, DEPLOY.md symptom row.

## Requirements

### Team mapping (Phase 106)

- [x] **TEAM-01**: `group_mappings` gains nullable `team_id` (`adapterEnsureColumn`, both engines; kind stays `'workspace'`; unique (group_guid, workspace_id) pair index unchanged — plain+team combo per (group, ws) collapses to one row, accepted). DDL lockstep checklist per research.
- [x] **TEAM-02**: `team_members` gains `provenance text` (conditional stamp `group:<guid>` only for group callers, mirroring the D-82-7 addMembership conditional); boot ensureColumn both engines.
- [x] **TEAM-03**: Reconcile pass extends to teams — group team rows granted/cleaned alongside workspace grants; selection key = guid from the row's own provenance (T-82-01 property); team-only sweep cell (membership survives, mapping died → team row removed); opportunistic sweep of doc-orphaned group team rows.
- [x] **TEAM-04**: Manual teams PUT narrowed — its delete-all must purge non-group rows only (latent-bug fix, research-flagged server.js:11843).
- [x] **TEAM-05**: Non-winner mappings still grant their team (team survives while mapping lives, regardless of highest-role-wins on the workspace row).
- [x] **TEAM-06**: Distinct audit verb `group_team_granted` (and team-removal rides the existing removal vocabulary with team provenance detail).
- [x] **TEAM-07**: Dead-mapping machinery: new `team-deleted` orphan class (boot warn loop + dead-mappings route); reconcile skips a dead team but still grants the workspace role.
- [x] **TEAM-08**: POST/PATCH routes validate team_id (exists in workspace doc.teams, belongs to the mapping's workspace, nullable); refusal keys ×5. Delete-confirm copy states lazy revocation + role loss when the row is the group's only mapping.

### Mapping edit (Phase 106)

- [x] **EDIT-01**: PATCH `/api/governance/group-mappings/:id` — partial update (workspace/team/role/label); GUID immutable (body `groupGuid` present → keyed refusal); workspace PATCH partial-update precedent; validation funnel reused (roleTokenRefusal, workspace-existence check); throttle-before-gate; uniform 404.
- [x] **EDIT-02**: Edit lands `group_mapping_updated` same-tx audit; dead rows refuse edit (keyed, keeps D-11 dead-row display-only discipline); edit of the (guid, workspace) pair that collides with an existing row → the existing duplicate pre-check keyed refusal.

### Mappings SPA restructure (Phase 107)

- [x] **SPA-01**: "Mappings" section — proper table (`perm-t` idiom): Label, Group ID, Workspace, Team (— when unset), Role, Users added, When. Users added = **current members** with `provenance = 'group:<guid>'` (the existing `liveMembers` semantics — documented as current-members, not cumulative-ever).
- [x] **SPA-02**: Edit UI — inline or drawer edit for workspace/team/role/label (GUID read-only display), staged confirm consistent with the delete flow; ×5 copy.
- [x] **SPA-03**: "Dead group mappings" section — orphaned mappings as a table (orphaned GUID, target workspace/team, last-seen), replacing the v3.6 card.
- [x] **SPA-04**: "Usage Log" section — table of the five lifecycle audit actions (R-7): Action, Type (column dropped if always `group` — plan decides), Group ID, Group Name (Label; raw GUID when mapping deleted — accepted), Who (= target_name), When; cap 100 newest with a visible cap-note (no pagination in v1); consumes the extended dead-trail GET (`{orphans, trail, usage}`).
- [x] **SPA-05**: Team column in the create form (optional team picker fed by the workspace's doc.teams; hidden/disabled until a workspace is chosen).

### Carried items (Phase 108)

- [ ] **CARRY-01**: Per-run archive probing — probe route stats the run's actual remote archive (FTP `size()` existing primitive; S3 new ~10-line `headObject` on the generic `s3Request`; SMB CREATE+CLOSE stat reuse with OBJECT_NAME_NOT_FOUND mapping); **stat-only** (no marker writes — pure read-only probing); three-state honest badge (reachable+present / reachable+missing / unreachable) + detail toasts ×5; throttle unchanged; never mutates run state; D-89-14 pins intact.
- [x] **CARRY-02**: Restore initiator — `adapterEnsureColumn('restore_runs','created_by','text')` both engines; operator uid captured at trigger routes and stamped via `writeRestoreRunRow`; rendered on the run-history card (backup.js:792 area); legacy rows → `—`.
- [x] **CARRY-03**: SSO callback catch-all — one fixed, non-interpolated `logWarn` in the server.js:7092 catch (no `e.message` — token fragments could ride exception text on an un-scrubbed log site).
- [x] **CARRY-04**: DEPLOY.md symptom table gains the row: "one user fails where another succeeds → `email` claim missing → add the `email` optional claim (App registration → Token configuration)".

## Requirement → phase map

| Req | Phase |
|---|---|
| TEAM-01..08, EDIT-01..02 | 106 |
| SPA-01..05 | 107 |
| CARRY-01..04 | 108 |[x]Requirements — v3.7 Mappings UX & Team Mapping

*Owner rulings baked in below (R-6..R-10). Research: `.planning/research/TEAM-MAPPING.md` (`2a185f8b`), `MAPPINGS-UX.md` (`13826a06`), `CARRIED-ITEMS.md` (`32ff4e79`).*

## Standing constraints

- Zero new npm dependencies. Audit funnel keyed ×5 locales same commit. Dual-engine DDL lockstep (adapterEnsureColumn) for every new column. Test baseline ~2767 / 2–3 documented pre-existing failures. esc() discipline. No brittle hard counts.

## Owner rulings

- **R-6 Optional team, role unchanged** — a mapping with a team grants team membership AND the workspace role from the same row; no team = exactly v3.6 behavior.
- **R-7 Usage Log = all group lifecycle actions** — granted / upgraded / downgraded / removed / guard-refused, one table.
- **R-8 Mapping edit exists** — today only delete; edit = workspace/team/role/label; **GUID immutable**.
- **R-9 v3.8 Governance UI refresh** — out of scope here; v3.7 tables seed the design language.
- **R-10 Carried items ride phase 108** — per-run archive probe, restore initiator, SSO logWarn, DEPLOY.md symptom row.

## Requirements

### Team mapping (Phase 106)

- [x] **TEAM-01**: `group_mappings` gains nullable `team_id` (`adapterEnsureColumn`, both engines; kind stays `'workspace'`; unique (group_guid, workspace_id) pair index unchanged — plain+team combo per (group, ws) collapses to one row, accepted). DDL lockstep checklist per research.
- [x] **TEAM-02**: `team_members` gains `provenance text` (conditional stamp `group:<guid>` only for group callers, mirroring the D-82-7 addMembership conditional); boot ensureColumn both engines.
- [x] **TEAM-03**: Reconcile pass extends to teams — group team rows granted/cleaned alongside workspace grants; selection key = guid from the row's own provenance (T-82-01 property); team-only sweep cell (membership survives, mapping died → team row removed); opportunistic sweep of doc-orphaned group team rows.
- [x] **TEAM-04**: Manual teams PUT narrowed — its delete-all must purge non-group rows only (latent-bug fix, research-flagged server.js:11843).
- [x] **TEAM-05**: Non-winner mappings still grant their team (team survives while mapping lives, regardless of highest-role-wins on the workspace row).
- [x] **TEAM-06**: Distinct audit verb `group_team_granted` (and team-removal rides the existing removal vocabulary with team provenance detail).
- [x] **TEAM-07**: Dead-mapping machinery: new `team-deleted` orphan class (boot warn loop + dead-mappings route); reconcile skips a dead team but still grants the workspace role.
- [x] **TEAM-08**: POST/PATCH routes validate team_id (exists in workspace doc.teams, belongs to the mapping's workspace, nullable); refusal keys ×5. Delete-confirm copy states lazy revocation + role loss when the row is the group's only mapping.

### Mapping edit (Phase 106)

- [x] **EDIT-01**: PATCH `/api/governance/group-mappings/:id` — partial update (workspace/team/role/label); GUID immutable (body `groupGuid` present → keyed refusal); workspace PATCH partial-update precedent; validation funnel reused (roleTokenRefusal, workspace-existence check); throttle-before-gate; uniform 404.
- [x] **EDIT-02**: Edit lands `group_mapping_updated` same-tx audit; dead rows refuse edit (keyed, keeps D-11 dead-row display-only discipline); edit of the (guid, workspace) pair that collides with an existing row → the existing duplicate pre-check keyed refusal.

### Mappings SPA restructure (Phase 107)

- [x] **SPA-01**: "Mappings" section — proper table (`perm-t` idiom): Label, Group ID, Workspace, Team (— when unset), Role, Users added, When. Users added = **current members** with `provenance = 'group:<guid>'` (the existing `liveMembers` semantics — documented as current-members, not cumulative-ever).
- [x] **SPA-02**: Edit UI — inline or drawer edit for workspace/team/role/label (GUID read-only display), staged confirm consistent with the delete flow; ×5 copy.
- [x] **SPA-03**: "Dead group mappings" section — orphaned mappings as a table (orphaned GUID, target workspace/team, last-seen), replacing the v3.6 card.
- [x] **SPA-04**: "Usage Log" section — table of the five lifecycle audit actions (R-7): Action, Type (column dropped if always `group` — plan decides), Group ID, Group Name (Label; raw GUID when mapping deleted — accepted), Who (= target_name), When; cap 100 newest with a visible cap-note (no pagination in v1); consumes the extended dead-trail GET (`{orphans, trail, usage}`).
- [x] **SPA-05**: Team column in the create form (optional team picker fed by the workspace's doc.teams; hidden/disabled until a workspace is chosen).

### Carried items (Phase 108)

- [ ] **CARRY-01**: Per-run archive probing — probe route stats the run's actual remote archive (FTP `size()` existing primitive; S3 new ~10-line `headObject` on the generic `s3Request`; SMB CREATE+CLOSE stat reuse with OBJECT_NAME_NOT_FOUND mapping); **stat-only** (no marker writes — pure read-only probing); three-state honest badge (reachable+present / reachable+missing / unreachable) + detail toasts ×5; throttle unchanged; never mutates run state; D-89-14 pins intact.
- [x] **CARRY-02**: Restore initiator — `adapterEnsureColumn('restore_runs','created_by','text')` both engines; operator uid captured at trigger routes and stamped via `writeRestoreRunRow`; rendered on the run-history card (backup.js:792 area); legacy rows → `—`.
- [x] **CARRY-03**: SSO callback catch-all — one fixed, non-interpolated `logWarn` in the server.js:7092 catch (no `e.message` — token fragments could ride exception text on an un-scrubbed log site).
- [x] **CARRY-04**: DEPLOY.md symptom table gains the row: "one user fails where another succeeds → `email` claim missing → add the `email` optional claim (App registration → Token configuration)".

## Requirement → phase map

| Req | Phase |
|---|---|
| TEAM-01..08, EDIT-01..02 | 106 |
| SPA-01..05 | 107 |
| CARRY-01..04 | 108 |
