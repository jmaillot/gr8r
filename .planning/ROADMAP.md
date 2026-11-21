# Roadmap: Projects Studio (gr8r)

## Milestones

🚧 **v3.3 Instance Operations — Backup, Restore & Roles** — Phases 85-90 (in progress)

- ✅ **v3.2 Entra Group Mapping & Governance Backlog** — Phases 80-84 (shipped 2026-11-21) → [milestones/v3.2-ROADMAP.md](milestones/v3.2-ROADMAP.md)
- ✅ **v3.1 Workspace Governance** — Phases 78-79 (shipped 2026-11-20) → [milestones/v3.1-ROADMAP.md](milestones/v3.1-ROADMAP.md)
- ✅ **v3.0 Access Control & Hardening** — Phases 75-77 (shipped 2026-11-19) → [milestones/v3.0-ROADMAP.md](milestones/v3.0-ROADMAP.md)

<details>
<summary>✅ v3.2 Entra Group Mapping & Governance Backlog (Phases 80-84) — SHIPPED 2026-11-21</summary>

- [x] Phase 80: Group Mapping Core — Parser, Resolver, Overage Detection (2/2 plans) — completed 2026-11-20
- [x] Phase 81: Group Grant Path — Callback Wiring + Provenance (2/2 plans) — completed 2026-11-20
- [x] Phase 82: Removal Sync + Guards + Audit (2/2 plans) — completed 2026-11-20
- [x] Phase 83: Governance — Workspace Rename & Slug Edit (2/2 plans) — completed 2026-11-20
- [x] Phase 84: Backlog Polish & Ship (4/4 plans) — completed 2026-11-21

</details>

## Phases

- [ ] **Phase 85: Roles Foundation** — instance_roles table, hasInstanceRole funnel, Instance Roles governance tab, restore-authority ≠ archive-read-authority encoding
- [ ] **Phase 86: Export Core ("gr8r backup v1")** — pure backup.js fence, snapshot fence, archive format freeze + manifest + table classification, local destination, manual Run now
- [ ] **Phase 87: Scheduler, Tasks, Run History & Rotation** — backup_tasks/runs tables, builder schedule UI, reconcile tick, GFS rotation, run history, transition-based failure email
- [ ] **Phase 88: S3 Destination** — hand-rolled SigV4 client (AWS/MinIO/B2), streamed uploads, post-upload checksum verify
- [ ] **Phase 89: Restore** — preview-from-manifest, import-as-new (-restored) default, guarded overwrite with pre-restore snapshot, Super-Admin-only instance DR restore + security contract
- [ ] **Phase 90: Polish & Verification Sweep** — Super Admin console role-first listing, verify-checksum action, archive download tiering, PG parity e2e, DST cron tests

## Phase Details

### Phase 85: Roles Foundation
**Goal**: Instance operations can be delegated — operators grant Backup/Restore Operator roles and grantees see exactly the surfaces their role entitles them to, with Super Admins implicitly holding everything.
**Depends on**: Nothing (first phase of v3.3; cheapest, independently shippable, gates every later route)
**Requirements**: BKROLE-01, BKROLE-02, BKROLE-03
**Success Criteria** (what must be TRUE):
1. An operator grants the Backup Operator role to a user from the Instance Roles tab in Instance > Governance; that user immediately sees the Backup surface and can manage backup tasks; revoking the role removes the surfaces on their next load.
2. A Restore Operator can reach the (future) restore surfaces but every task-editing endpoint refuses with a keyed localized refusal; a Backup Operator cannot grant or revoke roles.
3. Super Admins exercise both operator capabilities without ever appearing in or being demotable from the instance_roles membership list (implicit membership).
4. Every role grant/revoke appears in the audit trail through the existing audit funnel.
5. The `hasInstanceRole` funnel exists server-side with Super-Admins-auto-members semantics, and the distinction "restore authority ≠ archive-read authority" (download tiering vocabulary) is encoded in the role design now — before any restore endpoint is written.
**Plans**: TBD
**Gaps for discuss-phase**: none — v3.2 groups.js template copied verbatim (dual mirror + pin test + refusal funnel).
**UI hint**: yes

### Phase 86: Export Core ("gr8r backup v1")
**Goal**: An operator can export any scope (project/workspace/instance) today as a verified logical archive — the format is frozen so scheduler, S3 and restore all consume it unchanged.
**Depends on**: Phase 85 (role gate on export routes)
**Requirements**: BKBCK-01
**Success Criteria** (what must be TRUE):
1. A Backup Operator triggers a manual export of a single project, a workspace, or the full instance and receives a tar+gzip "gr8r backup v1" archive containing rows (per-table NDJSON) plus the scope's uploaded files, inspectable with `tar tzf`.
2. The archive's manifest (entry 0) carries formatVersion 1, scope {kind,id}, entity-addressable row ids, the data-vs-operational table classification, and per-table/per-file/whole-archive sha256 — and manifest self-verification marks the run FAILED on any mismatch.
3. The same export code path works on SQLite (wal_checkpoint + VACUUM INTO snapshot, read-only snapshot reads) and Postgres (checked-out client, REPEATABLE READ READ ONLY) — proven by the dual-mirror pin test and, at plan time, the file-id→scope mapping verification for the DATA_DIR collector.
4. Memory stays bounded (~65 MiB) regardless of archive size via the staged temp-file streaming pipeline, with atomic rename on completion.
5. Research flags to resolve at plan time (not here): ustar size math confirmation; file-id→workspace/project mapping existence; SIGTERM/crash hygiene sweep of DATA_DIR/tmp/backup-*.
**Plans**: TBD
**Cross-phase decisions that freeze here**: archive format ("gr8r backup v1" container, manifest entry 0), manifest schema + entity addressability, table classification (data vs operational), checksum canonical statement (sha256 of final destination bytes, computed once at export).
**UI hint**: yes

### Phase 87: Scheduler, Tasks, Run History & Rotation
**Goal**: Backup tasks run themselves — operators configure multiple scheduled tasks, consult an honest run history, and GFS rotation never deletes the newest verified backup.
**Depends on**: Phase 86 (run pipeline + frozen format)
**Requirements**: BKBCK-02, BKBCK-03, BKBCK-04
**Success Criteria** (what must be TRUE):
1. A Backup Operator creates multiple tasks (name, scope, local destination, builder-based schedule with presets — never free-text cron, GFS retention defaults 7/4/12/5, enable/disable); invalid input is refused with keyed 5-locale errors.
2. A disabled-then-enabled task fires on its stored 5-field cron schedule in its configured timezone, catches up at most once after a restart, never overlaps a running instance of itself (overlap attempts visible as skipped_overlap in history), and stale `running` rows are swept at boot.
3. After a verified successful run, GFS rotation applies per scale — and the newest verified backup is never in the deletable set (excluded by explicit ID), with audited deletes and a refuse-to-empty floor.
4. Every run (manual or scheduled) is recorded with status, trigger, duration, size, error and checksum in a history the Backup Operator can consult, with a Run now action per task.
5. A failure email is sent only on failure-state transitions (last_notified_state on the task row) to Super Admins + Backup Operators via email_outbox — never per-run success emails.
**Plans**: TBD
**Gaps for discuss-phase**: GFS namespace semantics (per-task prefix vs shared — recommend per-task; confirm at plan).
**Schema decisions landing here**: `tz` column, `last_notified_state`, `next_run_at` persisted (never re-parsed at tick), destination_cfg = config-not-credentials.
**UI hint**: yes

### Phase 88: S3 Destination
**Goal**: Backups land on any S3-compatible bucket with the stored checksum verifiable after upload — SigV4 verified in an isolated loop before restore ever depends on it.
**Depends on**: Phase 86 (destination interface frozen there); independent of Phase 87
**Requirements**: BKBCK-05
**Success Criteria** (what must be TRUE):
1. A task destination can be an S3-compatible endpoint (AWS S3, MinIO, Backblaze B2) configured via boot-frozen env credentials (S3_* strict-token consts; secrets never stored in task rows), with a probe-at-save keyed refusal on unreachable/misconfigured endpoints.
2. Uploads are streamed memory-bounded (serial 64 MiB multipart above 512 MiB, abort-on-failure, per-part retry from the immutable staged file), and the stored checksum is verifiable after upload (sha256 stored separately from ETag).
3. A clock-skew failure (RequestTimeTooSkewed) surfaces as a distinct keyed refusal.
4. SigV4 correctness is proven by golden-vector tests plus a MinIO e2e against the pinned MinIO version (provider quirks re-checked at plan time — research flag).
5. A restore-direction download to a staged temp file with streaming-hash verification exists (consumed by Phase 89).
**Plans**: TBD
**UI hint**: no

### Phase 89: Restore
**Goal**: Operators can safely bring data back — preview from the manifest, import-as-new by default, guarded overwrite for experts, and privilege-escalation-via-restore closed with a zero-open-threats security contract.
**Depends on**: Phase 86 (frozen format), Phase 85 (live-rights scoping designed there), Phase 88 (S3 download path)
**Requirements**: BKRST-01, BKRST-02, BKRST-03, BKRST-04
**Success Criteria** (what must be TRUE):
1. A Restore Operator lists available backups across destinations and previews a backup's contents (scopes, tables, file counts, checksum) from the manifest without downloading or unpacking the archive.
2. A Restore Operator restores a workspace or project as a NEW workspace/project with a `-restored` suffix — full ID remap validated for totality before insert, only the restoring operator as member, one transaction per restore unit, no operational tables restored.
3. A Backup Operator or Super Admin can overwrite an existing workspace/project — gated by type-to-confirm, preceded by an automatic pre-restore snapshot (tagged pre_restore, same buildArchive core), executed in a single transaction; operational tables are never overwritten by selective restore.
4. A Super Admin can restore a full instance from an instance-scope backup — Super-Admin-only, type-to-confirm, global session revocation — and the phase ships an explicit security contract (Phase 30 pattern) with threats_open: 0 covering privilege-escalation-via-restore.
5. Restore authority is scoped by LIVE rights, never archive contents; instance-scope archive download stays instance-admin-only (the Phase 85 tiering, now enforced).
**Plans**: TBD
**Gaps for discuss-phase**: overwrite-restore concurrency model (maintenance banner / read-only window / applies-next-restart); row-shaped tables (saved_views, webhooks) vs doc-splice-only for project-scope restore; MCP mirror for backup endpoints in/out of v1.
**UI hint**: yes

### Phase 90: Polish & Verification Sweep
**Goal**: The trust checklist is closed — operators can verify and retrieve archives themselves, the Super Admin console backlog item ships, and the whole milestone survives a PG-parity + DST verification sweep.
**Depends on**: Phases 85–89 (sweep over already-working surfaces)
**Requirements**: SACON-01
**Success Criteria** (what must be TRUE):
1. The Super Admin console lists Super Admins by default; typing searches all users by name and email, non-admin matches render as promote candidates under a result cap with show-more, and a successful promotion shows a keyed success toast, removes the candidate from results, and adds them to the roster without a page reload.
2. A run detail exposes a verify-checksum action and an archive download tiered above run rights (instance-scope downloads stay instance-admin-only).
3. The rotation form previews the projected deletion list, and history shows "kept until" retention visibility.
4. The full backup/restore flow passes a PG-parity e2e sweep (POSTGRES_TEST_URL, REPEATABLE READ export) and DST-boundary cron tests; all new i18n keys are gated ×5 locales.
5. DEPLOY.md documents timezone/NTP posture and the distinction between the new backup engine and the legacy `--backup` CLI.
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 85. Roles Foundation | 0/? | Not started | - |
| 86. Export Core ("gr8r backup v1") | 0/? | Not started | - |
| 87. Scheduler, Tasks, Run History & Rotation | 0/? | Not started | - |
| 88. S3 Destination | 0/? | Not started | - |
| 89. Restore | 0/? | Not started | - |
| 90. Polish & Verification Sweep | 0/? | Not started | - |

## Phase Ordering Rationale

Roles first (every later route gates on the funnel; restore-authority ≠ read-authority encoded before restore endpoints are written) → Export Core (the linchpin: format freeze, manifest, table classification — restore, S3 and rotation all consume it) → Scheduler (produces runs of the format; needs honest history before rotation) → S3 isolated (SigV4 golden vectors + MinIO e2e verification loop) → Restore (highest risk, reads a frozen format across three stable phases) → Polish sweep. Owner-ratified decisions D-33-1..12 bind all phases (see REQUIREMENTS.md) — do not reopen.
