# Feature Research — Backup, Restore & Roles (v3.3)

**Domain:** Self-hosted SaaS instance operations — scheduled backup, selective restore, delegated backup roles
**Researched:** 2026-11-21
**Confidence:** MEDIUM-HIGH (synthesis from comparable self-hosted products — Gitea, Outline, Nextcloud AIO, docmost, Portainer, databasement, Backblaze/BackupAssist GFS references — plus gr8r's own constraints; web search partially degraded, no single authoritative UX standard exists so confidence is cap'd at MEDIUM-HIGH)

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Task config: name, scope (project/workspace/instance), destination, schedule, rotation, enabled toggle | Every backup UI (Portainer, databasement, BackupAssist) exposes exactly these six fields; anything less feels broken, anything more feels like a database tool | LOW | One form. Scope picker reuses the existing workspace/project pickers (memberCanReadProject funnel already exists). Scope=instance implies ALL workspaces+files, not "current workspace". |
| Schedule via plain UI builder, not raw cron | Portainer/Nextcloud offer presets + a builder; raw cron text is a power-user escape hatch, never the primary control | LOW | Recommend: preset select (Daily 03:00 / Weekly Sun 03:00 / Custom) + "Custom" reveals day/hour pickers that *render* the cron string visibly. Keep the stored format cron (matches the task field already decided); the builder is the only editor — no free-text cron entry in v1 (validation pain, i18n surface, foot-gun). |
| GFS rotation with per-scale retention counts and sensible defaults | Owner already decided day/week/month/year configurable per task; the ecosystem default is counts, not dates | LOW | Default 7/4/12/5 is exactly the community consensus (7 daily, 4–5 weekly, 12 monthly, 3–7 yearly — Backblaze/BackupAssist). Store as `{day:7, week:4, month:12, year:5}` per task; 0 = keep none at that scale (min 1 recommended, warn). Rotation = on successful run, promote newest into each bucket and delete overflow. Deletion at the destination (local unlink / S3 DeleteObjects). |
| Run history: status, start/end, duration, size, error, trigger (scheduled/manual), checksum | Gitea/Portainer/databasement all show a flat run list; a backup feature without history is not trusted | LOW-MEDIUM | `backup_runs` table; one row per attempt. SHA-256 computed streaming during archive build; shown with copy button and (v1.x) a "verify" re-hash action. |
| Failure notification email | Expected in every scheduled-job system; silent failures are the #1 complaint in self-hosted backup tooling | LOW | Reuse the SMTP funnel + `email_outbox` claim-then-delivery machinery (v2.4 webhook email precedent). Recipients = Super Admins + task's instance Backup Operators. Locale: send in recipient locale via existing `tFor()` core. Success emails are an anti-feature (noise) — success is visible in history only. |
| "Run now" button | Universal in every scheduler UI | LOW | Same code path as scheduled run with `trigger: 'manual'`; guard against concurrent runs of the same task (409 or queued). |
| Restore preview before committing | Restore is destructive; every serious tool shows "what's inside" first | MEDIUM | Manifest (JSON, part of the single logical export already decided) is small — read manifest only, don't unpack the archive: scope, app version that created it, DB dialect, counts per entity, file count/total bytes, created-at. Show counts + "backup made by app vX on date Y". |
| Restore "import as new" default with `-restored` suffix | Owner decided. Matches how PM tools handle import-vs-merge | LOW | Rename collisions resolved deterministically at import (slug suffix `-restored`, second collision `-restored-2`). Memberships: restore people by email match, never duplicate accounts. |
| Overwrite restore with type-to-confirm + pre-restore snapshot | Owner decided; type-to-confirm is the established gr8r danger-fork pattern (workspace rename, v3.2) | MEDIUM-HIGH | Snapshot = run the same export path tagged `pre-restore` (not user-visible as a task). Overwrite within the same scope only. This is the riskiest code in the milestone — needs transactional strategy per dialect (see dependency notes). |
| Per-destination listing with filename convention, size, date, retention visibility | Users must be able to answer "which backup would I restore, where does it live" | LOW-MEDIUM | Filename convention: `gr8r-<scope-type>-<scope-slug>-<YYYYMMDD-HHmmss>.gr8backup` (or similar); keep a stable extension. Retention shown per row as "kept until" derived from rotation math, or at minimum a per-destination "retention policy" header rather than per-row clutter. |
| Delegated role gating on the backup/restore pages | Owner decided (instance_roles table, Backup/Restore Operators, single "Instance Roles" tab) | LOW | Follow the `isInstanceAdmin` flag precedent (v3.1): boolean checks server-side via one shared funnel function (`backupPermFor` style), never client-side only. See permissions pattern below. |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Checksum-verified archives (sha256 stored per run) | Most self-hosted tools skip this; cheap to add while streaming the archive | LOW | `node:crypto` streaming hash; verify endpoint v1.x. |
| Selective scope restore (instance OR workspace OR project from one archive) | Rare in self-hosted PM tools — usually all-or-nothing dump/restore | MEDIUM | Falls out of the single logical export + manifest for free if manifest is entity-addressable (rows tagged by workspace/project id). Design the manifest for this in the export phase. |
| Pre-restore automatic snapshot | Nearly nobody does this automatically; strong trust signal | MEDIUM | Only on overwrite path; stored locally regardless of task destinations. |
| Restore dry-run ("what would change") | Differentiator but heavy; see anti-features | HIGH | Defer — the preview-from-manifest covers 90% of the trust need at 10% of the cost. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Incremental/dedup/block-level backups | "Save space" | Requires change-tracking, catalog integrity, restore-chain validation — the classic self-hosted backup death spiral (see Borg/restic complexity). gr8r is a small PM instance; full logical exports are small. | Full exports + GFS rotation. Revisit only if archive sizes become a real complaint. |
| Live/hot restore browsing into a backup | "Just want one file back" | Requires a mounted snapshot view or per-item extraction UI; large surface, low frequency | v1.x compromise: allow *download* of the archive (and manifest) from run detail; users extract locally. Per-item restore inside a project deferred entirely. |
| Per-item restore (pick task #412 from backup) | Granularity appeal | Cross-referencing integrity (assignees, teams, perms keys) becomes an integrity minefield inside a doc-model workspace | Workspace/project-granularity restore only — restore the whole project to `-restored`, cherry-pick manually. |
| Free-text cron expressions in the UI | Power users ask | Validation, timezone bugs, i18n, unreadable to normal operators; gr8r's workspace-shared tz model makes raw cron ambiguous | Builder + visible rendered schedule string; presets cover 95% of real use. |
| Success notification emails | "Confirm it ran" | Noise → alert fatigue → people ignore the failure emails | History is the success surface; failures only by email. Optional success digest v2+. |
| Multiple destinations per task | Flexibility | Fan-out failure semantics (partial success), UI complexity | One destination per task; users create two tasks if they want two destinations. SMB/FTP already deferred to v2 by owner. |
| Backup encryption at rest (v1) | Security instinct | Key custody problem = where do you put the key? If it's on the same instance, it's theater | Document that archives inherit destination security; checksum + manifest versioning first. Defer client-side encryption. |

## Permissions Pattern for Delegated Backup Roles

Comparable systems (Portainer backup perms, Nextcloud admin delegation, Gitea site-admin) converge on:

- **Backup Operator**: full CRUD on tasks, Run now, see run history + errors + checksums, edit destinations. Sees everything backup-related, including failure emails.
- **Restore Operator**: browse backups, preview manifests, perform restores (both import-as-new and overwrite). Sees run history read-only. Cannot create/edit tasks (separation of "makes backups" from "uses backups").
- **Neither** sees: instance settings beyond this surface, other governance pages, SMTP config, storage credentials (write-only secrets — S3 keys never echoed back to the client after save, matching the PSK pattern already in the codebase).
- **Notifications**: both roles get failure emails; Super Admins always do. No opt-out per-role in v1.
- Both roles are auto-granted to Super Admins implicitly (owner decided) — check via `isInstanceAdmin OR instance_roles row`, one funnel, fail-closed 404 like existing workspace scoping.

## Feature Dependencies

```
Export engine (single logical format + manifest)
    └──requires──> DB dialect adapter (SQLite node:sqlite / Postgres pg)   [exists since v1.10]
    └──requires──> DATA_DIR files collector                                [exists]
         └──enhances──> Restore (import-as-new / overwrite)
              └──requires──> Manifest reader + id-remapping logic
              └──requires──> Pre-restore snapshot (reuses export engine)

Task scheduler
    └──requires──> Existing zero-dep scheduler pattern (v1.5 reminders, setInterval sweep)
    └──requires──> instance_roles table + permission funnel   (roles BEFORE scheduler ships, else nobody but Super Admin can be delegated)

S3 destination
    └──requires──> Hand-rolled SigV4 (node:crypto) + multipart-ish PUT handling
    └──conflicts-with──> nothing, but its failure modes feed run history — build run history before S3 polish

Failure email
    └──requires──> SMTP funnel + email_outbox (exists since v2.4) + recipient-locale tFor() (v1.8)

Audit
    └──requires──> existing audit funnel — backup/restore/role-change events MUST route through it (create/edit/delete task, run, restore, promote/demote role)
```

### Dependency Notes

- **Restore requires export engine**: one logical format is the linchpin — build export first, restore second, never parallel.
- **Roles must land before or with task CRUD**: a Backup Operator UI without the permission funnel would ship Super-Admin-only and need rework.
- **Overwrite-restore conflicts with live traffic**: restore while users edit = lost writes. Mitigate with a maintenance banner / brief read-only window or a "restore applies next restart" model — decide at plan time (flag for phase research). Import-as-new has no such conflict.

## MVP Definition

### Launch With (v1)

- [ ] instance_roles table + Instance Roles tab + permission funnel — delegation is the milestone's reason to exist
- [ ] Export engine (SQLite+Postgres, rows + DATA_DIR files, archive + manifest, sha256) — everything else stands on it
- [ ] Task CRUD + builder-style schedule + GFS rotation defaults 7/4/12/5 — the table stakes form
- [ ] Local destination + run history + Run now — minimum trustworthy loop
- [ ] S3-compatible destination (AWS/MinIO/B2 via one SigV4 implementation)
- [ ] Failure email to Super Admins + Backup Operators via existing SMTP machinery
- [ ] Restore: preview from manifest, import-as-new default, overwrite with type-to-confirm + pre-restore snapshot
- [ ] Audit events for all backup/restore/role actions

### Add After Validation (v1.x)

- [ ] Verify-checksum action on run detail — trigger: users start asking about integrity
- [ ] Archive download from run detail — trigger: "I just want one file out"
- [ ] Retention "kept until" per backup row — trigger: rotation confusion reports
- [ ] Success digest (weekly) — trigger: operator requests

### Future Consideration (v2+)

- [ ] SMB/FTP destinations (owner already deferred)
- [ ] Backup encryption / client-side keys
- [ ] Scheduled-restore (prod→staging refresh pattern, seen in databasement)
- [ ] Per-item extraction UI

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| instance_roles + tab + funnel | HIGH | LOW-MEDIUM | P1 |
| Export engine + manifest + checksum | HIGH | MEDIUM-HIGH | P1 |
| Task CRUD + schedule builder + GFS rotation | HIGH | MEDIUM | P1 |
| Run history + Run now | HIGH | LOW | P1 |
| Local destination | HIGH | LOW | P1 |
| S3 destination | HIGH | MEDIUM | P1 (after local) |
| Failure email | HIGH | LOW | P1 |
| Restore import-as-new | HIGH | MEDIUM | P1 |
| Restore overwrite + snapshot + type-to-confirm | HIGH | HIGH | P1 (last) |
| Restore preview from manifest | MEDIUM | LOW | P1 (rides restore) |
| Verify checksum / archive download | MEDIUM | LOW | P2 |
| Per-item restore / live browse | LOW | HIGH | P3 (anti-feature for now) |

## Complexity & Dependencies on Existing Code

- **SMTP**: failure email = small; reuse `email_outbox`, claim-then-delivery, recipient-locale `tFor()`. Zero new deps.
- **DATA_DIR uploads**: export collector walks `DATA_DIR/files/` filtered by scope's file ids (need mapping from doc model `files[]` per scope — flag: verify file-id→workspace/project mapping exists at plan time).
- **Audit funnel**: mandatory routing for destructive actions; reuse the operator audit trail pattern (v1.5 AUD-01..03).
- **Scheduler**: extend the v1.5 reminder scheduler's interval-sweep pattern; single-writer guard per task.
- **Postgres/SQLite parity**: export/import must be dialect-agnostic; the v1.10 adapter facade and the v2.2 FTS parity-suite precedent give the test-matrix pattern (`POSTGRES_TEST_URL`).
- **Chunk gate**: backup UI is admin-surface — lazy chunk (Settings/Instance pattern) to protect the 500 kB gate.

## Sources

- GFS rotation defaults & structure: Backblaze "Grandfather-Father-Son", BackupAssist, severalnines (HIGH consensus on 7/4/12±, counts-based retention)
- Comparable product behavior: Gitea dump/restore docs, Nextcloud AIO backup UI, Portainer backup/restore, databasement (self-hosted DB backup manager w/ GFS web UI) (MEDIUM — behavior inferred from docs/UIs, not deep audits)
- gr8r internals: PROJECT.md milestones v1.5/v1.8/v2.2/v2.4/v3.1/v3.2 (scheduler, SMTP, parity testing, permission funnel, type-to-confirm precedents) (HIGH)
- Note: SearXNG was degraded during research; web coverage was partial — the schedule-builder/restore-UX claims rest primarily on domain knowledge of the named products, hence MEDIUM-HIGH overall.

---
*Feature research for: self-hosted instance backup/restore/roles — gr8r v3.3*
*Researched: 2026-11-21*
