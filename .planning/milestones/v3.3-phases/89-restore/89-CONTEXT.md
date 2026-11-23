# Phase 89: Restore - Context

**Gathered:** 2026-11-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Operators bring data back from a "gr8r backup v1" archive: list available backups across destinations (run-row sourced, honest dual-location local/S3), preview a backup's contents from the manifest (streamed, re-verified, no unpack), restore a workspace/project as NEW with a `-restored` suffix (full ID remap validated pre-insert, restorer-only membership), guarded overwrite for experts (type-to-confirm + automatic pre-restore snapshot + single DB transaction with file-layer snapshot repair), and a Super-Admin-only full-instance disaster-recovery restore with global session revocation — all under a zero-open-threats security contract (89-SECURITY.md, Phase 85 pattern) with restore authority scoped by LIVE rights, never archive contents. Requirements BKRST-01..04. Not in this phase: archive download for end users (Phase 90 download tiering), MCP mirror (Phase 90 review), S3 object deletion (D-88-7 unchanged).

</domain>

<decisions>
## Implementation Decisions

### Overwrite & restore concurrency

- **D-89-1:** One global restore lock: any restore (import-as-new or overwrite) blocks any other restore AND any backup run, and vice versa — mutual refusal with the existing keyed-refusal vocabulary (backupRunInProgress family; a second restore gets keyed `backupRestoreInProgress`). No maintenance banner, no read-only window. — **Reversibility:** reversible (finer locks later are additive).
- **D-89-2:** Restore is a background run with its own persisted restore-run row family (same lifecycle idioms as 87's run rows: created → running → done|failed). Trigger returns a run id immediately.
- **D-89-3:** Failure model: DB work = ONE transaction (SC-3 intact) — automatic rollback on any error or crash. File blobs (non-transactional) = repaired from the automatic pre-restore snapshot if the run failed after any file mutation. The snapshot is the file-layer safety net only, not a DB rollback mechanism.
- **D-89-4:** Overwrite file-blob replacement uses a staged directory swap: blobs staged to a staging dir, atomically swapped into place within the run. Logos and DATA_DIR-level collected files (instance scope) ride the same machinery.
- **D-89-5:** Pre-restore snapshots (tagged `pre_restore`, taken automatically via the same buildArchive core) follow the manual-archive doctrine (87-D-11): outside every task's rotation, NEVER auto-deleted in v1; operator deletes manually. Run row + audit trail carry the tag and the snapshot archive's run id.
- **D-89-6:** Overwrite semantics = full data replacement: the target ends up exactly as the archive's data tables (everything 86-D-01 containment captured is replaced); the workspace row itself keeps its identity. Not a merge.

### Table classification & remap

- **D-89-7:** Selective restore (project/workspace) restores ONLY data tables (86's DATA_TABLES: workspaces, memberships, team_members, invites — plus the scope's content tables); operational rows in the archive are skipped and REPORTED, never inserted (BKRST-03 rule). The restore-run summary payload lists skipped tables with row counts — visible on the restore history UI + audit trail.
- **D-89-8:** Full-instance DR restore skips operational tables EXCEPT `instance_roles` (DR must rebuild the admin roster or you're locked out). Deliberate, threat-modeled exception (crafted-archive admin-grant is mitigated by: DR is Super-Admin-only + type-to-confirm + audited).
- **D-89-9:** Import-as-new: only the restoring operator becomes a member; archive memberships/invites rows are skipped (in the skip report). Restoring a WORKSPACE brings its member projects along (full scope, remapped ids, restorer-only membership).
- **D-89-10:** ID remap: fresh archive id → new id map per restore; totality validated against the archive's full reference graph BEFORE any insert (an unmapped id fails the run pre-write). Insert order is topological from schema dependencies (workspaces → projects → tasks → …); foreign keys validated at the end in one pass (deferred-constraint posture both engines).
- **D-89-11:** Restored-row ids are engine-native (existing schema conventions via the db adapter) — the remap map holds archive id → newly generated id, read back after insert; no UUID pre-generation.
- **D-89-12:** File rows/blobs remap to fresh ids (blob re-addressed per the 86-D-2 layout `files/<owner-dir>/<id>.<ext>`); missing-blob-flagged files restore as flagged rows without blobs (86-D-4 mirrored).
- **D-89-13:** `-restored` suffix collisions auto-counter: `-restored`, `-restored-2`, … until free; the run row records the final name.

### Preview & listing

- **D-89-14:** The restore list's source of truth is backup run rows (87's persisted history) — local archives PLUS S3-uploaded runs. No live ListObjectsV2 round-trip (D-88-7's operator-owns-bucket simplicity preserved).
- **D-89-15:** Honest dual-location rendering: each list entry carries a local/S3 location badge from run-row state; an archive deleted from BOTH destinations (local rotation + S3 lifecycle) refuses restore with a keyed error.
- **D-89-16:** S3-located archives are restore-eligible via the 88-01 download seam (staged temp file + streaming-hash verify) before preview/restore — the seam's intended consumer (SC-5).
- **D-89-17:** Preview = `GET /api/backup/restore/preview?runId=` — server streams the manifest (entry 0) straight from the archive via tar stream (no full unpack), returns scope/table row counts/file counts/checksum. A corrupt manifest fails keyed.
- **D-89-18:** Preview re-verifies the whole-archive sha256 while streaming the manifest — restore decisions are made on verified data (local: export checksum; S3: the run row's post-upload stream-back verify per D-88-8).
- **D-89-19:** No MCP mirror for restore endpoints in v1 (extends 86-D-23); deferred to Phase 90 review.
- **D-89-20:** Restore surface lives INSIDE the Backup page (D-22/D-85-20 one-surface doctrine): restore card with list → preview drawer → trigger; restore runs get their own history card in the restore section (mirrors 87's per-task history). No second nav entry.
- **D-89-21:** Authority mapping = SC-5 verbatim: list/preview = Restore Operator+; import-as-new trigger = Restore Operator; overwrite trigger = Backup Operator/Super Admin; instance restore = Super Admin. Per-route hasInstanceRole gating (85-D-09 funnel); archive contents never grant authority.
- **D-89-22:** Restore triggers are operator-keyed throttled like 86-D-21 (tooMany consumes a try); every refused attempt audited (86-D-20 funnel).

### Targets & live rights

- **D-89-23:** Import-as-new project lands in a workspace the operator is CURRENTLY a member of (live-membership workspace picker); zero memberships → keyed refusal. Live rights checked at TRIGGER time; the archive never confers anything.

### Instance DR restore

- **D-89-24:** BKRST-04 is TRUE disaster recovery: live workspaces/projects replaced by the archive's data tables in one transaction (+ file-layer staged swap); the pre-DR instance snapshot (full gr8r-format archive, D-89-5) is the safety net — restore-of-restore is possible because archives are self-describing.
- **D-89-25:** Global session revocation happens AFTER the restore transaction commits: every session invalidated INCLUDING the initiating Super Admin's (cleanest post-DR state; roles just rebuilt from instance_roles per D-89-8; everyone re-logs-in).
- **D-89-26:** The instance stays LIVE during a DR restore (the global lock is the only concurrency control) — rows change under the transaction, files swap at the end; reminders/emails may fire mid-restore harmlessly. No maintenance mode (declined with D-89-1).
- **D-89-27:** Type-to-confirm = exact-name: overwrite requires typing the target workspace/project's exact name; instance restore requires typing a fixed DR phrase (`RESTORE-INSTANCE`). Non-matching text → keyed refusal, no partial state. Presented in an overlay dialog with explicit consequence text (what will be replaced + snapshot info).
- **D-89-28:** Restore outcome emails go to Super Admins + Backup Operators via the existing email_outbox transition-gate idiom (87's last_notified_state); DR notification is the session-revocation re-login wall itself. No all-member emails.

### Run mechanics & verification

- **D-89-29:** Restore stage vocabulary (render-only client doctrine): `fetching → validating → restoring → verifying → done|failed` — `fetching` covers the 88 download seam for S3-located archives; coarse stages only (86-D-12 posture), no per-table counts.
- **D-89-30:** Post-restore verification mirrors the export-time self-verification (86): remap totality re-checked, per-table row counts compared against the manifest, file blobs present on disk for every non-missing-flagged file row, whole-archive sha256 re-confirmed. Any gap → run failed (DB tx rolls back; files repaired from snapshot per D-89-3).
- **D-89-31:** PG parity: one transaction per restore unit on BOTH engines; NO DDL inside the restore transaction; the global lock is an engine-neutral row claim (dedicated restore_lock row claim + 87's stale-running sweep idiom releasing stale claims at boot) — no per-engine advisory locks.
- **D-89-32:** Restore staging hygiene: S3-downloaded archives, staged swap dirs, and restore working files live under `BACKUPS_DIR/restore-staging/` with the same boot-time sweep hygiene as backup staging (86 crash sweep); failed restores leave nothing behind (86-D-15 mirrored).
- **D-89-33:** Security contract (89-SECURITY.md, Phase 85 pattern, threats_open: 0) carries four threat families: (1) privilege-escalation-via-restore (crafted archive granting roles — SC-4 minimum), (2) manifest/SQL injection via archive-supplied fields (frozen allow-list posture, 86's T-86-02), (3) path traversal via archived filenames (86-D-06 path-slip defense mirrored into restore extraction), (4) DR instance_roles rebuild abuse (Super-Admin-only + type-to-confirm + audited).

</decisions>

<specifics>
## Specifics

- Restore card UI mirrors the Run-now card: active-run stage progress with keyed `page.restore.*` labels (×5 locales); preview drawer closes on trigger; errors surface as keyed toasts from the history card.
- Type-to-confirm is an overlay dialog (existing overlay idiom) with consequence text.
- DR phrase constant: `RESTORE-INSTANCE`.
- Pre-restore snapshot tag: `pre_restore` (visible in run history + audit trail).
- Restore staging directory: `BACKUPS_DIR/restore-staging/`.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning docs
- `.planning/ROADMAP.md` §Phase 89 — Goal, success criteria 1-5, discuss-phase gaps (all three resolved in this CONTEXT)
- `.planning/REQUIREMENTS.md` §BKRST-01..04 — the requirements this phase implements
- `.planning/phases/86-export-core-gr8r-backup-v1/86-CONTEXT.md` — FROZEN archive format, manifest schema, entity addressability, table classification (DATA_TABLES/OPERATIONAL_TABLES), D-86-01 containment, D-86-04 missing-blob, D-86-06 path-slip — restore consumes all of it
- `.planning/phases/85-roles-foundation/85-CONTEXT.md` — D-85-09 capability funnel, D-85-16 route family + guard order, D-85-20/22 one-surface doctrine, D-85-23 render-only payload flags
- `.planning/phases/85-roles-foundation/85-SECURITY.md` — the security-contract pattern (threat register shape, threats_open gate) 89-SECURITY.md must follow
- `.planning/phases/87-scheduler-tasks-run-history-rotation/87-CONTEXT.md` — persisted run rows, stale-running sweep, GFS rotation (which deletes local copies restore must handle), email transition gate, manual-archive doctrine D-87-11
- `.planning/phases/88-s3-destination/88-CONTEXT.md` — D-88-01 local-first, D-88-07 app-never-deletes-S3, D-88-08 sha256 sidecar + stream-back verify, 88-01 download seam (SC-5 consumer = this phase)

### Code anchors
- `export/backup.js:95-115` — frozen DATA_TABLES/OPERATIONAL_TABLES classification (restore's data-only rule keys off it)
- `export/backup.js` buildArchive core — the pre-restore snapshot path (D-89-05)
- `export/s3.js` download seam — 88-01's staged temp file + streaming-hash verify (D-89-16 consumer)
- `server.js` backup route family + guard chain (sameOrigin → requireUser → throttle → gate) — restore routes copy the chain
- `db-adapter.mjs` — dual-engine transaction surface (D-89-31)
- `roles.js` — CAP capabilities + capabilitiesFor (D-89-21 gating)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- 88-01 download seam (signed GET → staged temp file → streaming sha256) — the S3-located restore fetch path
- 86 buildArchive core — the pre-restore snapshot machinery (tagged pre_restore)
- 87 run-row lifecycle + stale-running boot sweep — restore-run rows + restore_lock stale-claim release reuse the idioms
- 87 email_outbox transition gate — restore outcome emails
- 85 keyed-refusal funnel + audit same-tx pattern — every restore refusal rides it
- tar streaming reads already in the codebase (86's collector) — manifest streaming for preview

### Established Patterns
- Keyed refusal vocabulary + 5-locale parity same-commit
- Render-only client doctrine (payload flags verbatim, never client-derived)
- Dual-engine mirror + pin tests for every schema/transaction behavior
- Boot-time sweep hygiene for staging dirs
- Audit funnel: every refused attempt written same-tx

</code_context>

<deferred>
## Deferred Ideas

None captured — all discussion stayed within the phase boundary.

</deferred>
