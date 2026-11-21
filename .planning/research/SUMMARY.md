# Project Research Summary

**Project:** gr8r / Projects Studio v3.3 — Instance Operations (Backup, Restore & Roles)
**Domain:** Self-hosted SaaS instance operations — scheduled logical backup, selective restore, delegated backup roles
**Researched:** 2026-11-21
**Confidence:** HIGH overall (STACK and PITFALLS verified against local Node 24.21 runtime + HEAD source; FEATURES MEDIUM-HIGH — comparable-product behavior inferred, no single authoritative UX standard; ARCHITECTURE HIGH — every pattern read from source)

## Executive Summary

This milestone adds scheduled logical backup, selective restore, and delegated backup roles to a zero-dependency, single-process Node.js monolith (server.js ~9,800 lines + fenced pure modules, dual SQLite/Postgres via db-adapter.mjs). Expert practice in self-hosted products (Gitea, Portainer, Nextcloud AIO, databasement) is exactly the ratified shape: full logical exports with GFS rotation (community-default retention 7/4/12/5, counts-based), a builder-style schedule UI over cron storage, run history with checksums, transition-based failure emails, and import-as-new restore as the default with guarded overwrite. gr8r already owns every primitive needed — `VACUUM INTO` snapshot recipe (the `--backup` CLI, migrateTenancy), reminder scheduler house rules, `email_outbox` claim-then-delivery SMTP, keyed 5-locale refusal funnel, dual-schema mirror with pin tests — so this milestone needs **no new architectural ideas**, only one genuinely new engineering surface: the logical export archive and its restore counterpart, both living in a new pure `backup.js` fence.

The recommended build is fully stdlib: ustar tar + node:zlib ("gr8r backup v1" container, manifest as entry 0, `formatVersion` from day one), sha256 computed in the same streaming pipe (3-level: per-table, per-file, whole-archive), 5-field cron subset with pure `nextRunAfter` (Intl tz decomposition, minute-walk), hand-rolled SigV4 S3 client (~400–600 LOC, path-style, real payload-hash signing, 64 MiB serial multipart above 512 MiB), staged temp-file pipeline keeping memory ≈65 MiB flat, and SQLite snapshot via wal_checkpoint + `VACUUM INTO` (Node 24.21 `node:sqlite` has NO `backup()` — verified live) vs pg via one checked-out client + `REPEATABLE READ READ ONLY` tx. Everything funnels into the same archive writer, so the scope-select layer is the only dialect-specific code.

The risk centers are: (1) **snapshot consistency** — one snapshot fence (SQLite reads the snapshot file read-only; pg in one RR transaction) plus manifest self-verification or the run FAILS; (2) **rotation deleting the only good backup** — structurally enforce verify-upload → record-success → rotate, with the newest verified backup excluded from the deletable set by explicit ID; (3) **restore atomicity and id remapping** — one `begin immediate` transaction per restore unit, total remap table validated before insert, `-restored` workspaces born with zero memberships; (4) **privilege escalation via restore** — the security headline: restore authority is scoped by *live* rights, not archive contents; archive download tiered above run rights; users/roles restores = Super Admin + type-to-confirm + session revocation; (5) **scheduler integrity** — reconcile-from-DB tick, boot sweep of stale `running` rows, per-task overlap mutex, at-most-once catch-up. Every one has a proven in-codebase prevention pattern.

## Key Findings

### Recommended Stack

Zero new npm dependencies (owner-ratified constraint honored by all four researchers). Everything is node:crypto / node:https / node:fs / node:zlib / node:sqlite / Intl.* — all already in the runtime. Full detail in [STACK.md](STACK.md).

**Core technologies:**
- **ustar tar + node:zlib gzip** ("gr8r backup v1" container, manifest entry 0, `formatVersion: 1`): zip rejected (3–4× code, streaming-hostile central directory); tar gives operator inspectability (`tar tzf`) and free sequential walk for selective restore. *Note: ARCHITECTURE.md's open question (zip store-mode vs tar vs folder) is resolved by owner ratification — tar+gzip, manifest entry 0, sha256 3-level.*
- **Hand-rolled S3 client (SigV4, node:https)**: 9 endpoints (5 object ops + 4 multipart), path-style, real payload sha256 over a staged file, serial 64 MiB multipart above 512 MiB. Covers AWS, MinIO (http:// behind config flag), B2 (SigV4-only, region-pinned).
- **5-field cron subset + pure `nextRunAfter(cron, after, tz)`**: strict parse with keyed refusals; minute-walk via Intl tz decomposition (reuses `resolveTz`); persist `next_run_at` at save/after-run; never re-parse at tick time.
- **SQLite snapshot**: `pragma wal_checkpoint(truncate)` + `VACUUM INTO` (proven recipe; NO `backup()` on Node 24.21 — verified). **pg snapshot**: checked-out pool client (adapter Pattern 2, never `pool.query('BEGIN')`), `REPEATABLE READ READ ONLY`, `SELECT 1` immediately after BEGIN to pin the snapshot.
- **Streaming pipeline**: rows→NDJSON → tar → gzip → tee → staged temp file + sha256 hash in one pipe; local dest = copyFile; S3 = staged file PUT/multipart. Memory ceiling ≈65 MiB regardless of archive size.

### Expected Features

Full landscape in [FEATURES.md](FEATURES.md).

**Must have (table stakes, all v1):**
- instance_roles table + Instance Roles governance tab + permission funnel (Backup Operator = full task CRUD; Restore Operator = preview/restore, no task editing; both auto-granted to Super Admins; one server-side fail-closed funnel)
- Export engine: SQLite + Postgres, rows + DATA_DIR files, archive + manifest, sha256 3-level
- Task CRUD + builder-style schedule (presets + visible rendered cron; NO free-text cron in UI) + GFS rotation defaults 7/4/12/5
- Local destination + run history (status/duration/size/error/trigger/checksum) + Run now
- S3 destination (one SigV4 implementation, AWS/MinIO/B2)
- Failure email (transition-based, via existing `email_outbox`) to Super Admins + Backup Operators
- Restore: preview from manifest (no unpack), import-as-new default (`-restored`, memberships = only restoring operator), overwrite with type-to-confirm + pre-restore snapshot
- Audit events for all backup/restore/role actions; Super Admin console role-first listing (small backlog item, in scope)

**Should have (differentiators, cheap because the format enables them):**
- Selective scope restore (instance OR workspace OR project from one archive) — free if the manifest is entity-addressable; design for this in the export phase
- Checksum-verified archives; pre-restore automatic snapshot (strong trust signal, nobody does it)

**Defer (v2+ per owner / anti-features):**
- SMB/FTP destinations (owner deferred), encryption at rest (key custody theater), scheduled restore prod→staging, per-item extraction UI, dry-run restore (manifest preview covers 90% of trust at 10% of cost), incremental/dedup backups, multiple destinations per task (one dest per task; two tasks for two dests), success emails (noise)

### Architecture Approach

Reuse the v3.0/v3.2 house recipe verbatim — nothing new needed except the archive itself. Full detail in [ARCHITECTURE.md](ARCHITECTURE.md).

**Major components:**
1. **`backup.js` (NEW pure fence, root, sibling of groups.js)** — cron math, GFS rotation math, manifest schema + row→NDJSON serializer, restore-plan resolver, import-as-new naming, all refusal funnels. No fs/network/env/db — injected deps, zero-boot unit-testable. **`s3-dest.js`** separate fence (signing math testable without fs).
2. **server.js additions** — dual-mirror schema (instance_roles, instance_role_members, backup_tasks, backup_runs, backup_run_claims + PG_EPOCH_COLUMNS + pin test copied from groups-core), 60 s reconcile-from-DB scheduler tick (house interval rules: try/catch + .catch + .unref), claim ledger (`reminders_sent` pattern) for exactly-once, per-task overlap mutex, role-gated `/api/governance/*` route family.
3. **UI** — Instance Roles tab in governance.js; new lazy chunks for the Backup and Restore pages (future files, created in later phases — not research artifacts) under the 500 kB gate; 5-locale keys same-commit; Lucide icons.

**Restore data-flow doctrine:** reuse creation paths, never hand-rolled reinsertion — import-as-new goes through the existing workspace-creation path and `mergeClientDoc` doc-splice; overwrite = one `begin immediate` transaction after the pre-restore snapshot (which rides the SAME `buildArchive()` core, `trigger='pre_restore'`). The existing `--backup` CLI stays as a distinct dialect-bound feature, documented as such.

### Critical Pitfalls

Full list with prevention in [PITFALLS.md](PITFALLS.md).

1. **Torn/inconsistent snapshots** (P1+P2) — only `VACUUM INTO` on SQLite / one RR transaction on pg; export reads the snapshot file, not the live DB; one snapshot fence for rows AND files; manifest self-verify (counts + per-file sha256) with mismatch = run FAILED; temp-name + atomic rename.
2. **Rotation deletes the only good backup** (P7) — inviolable ordering: verified upload → run succeeded → rotate; newest verified backup excluded from deletable set by explicit ID; explicit audited delete list; refuse-to-empty-floor.
3. **SigV4 + multipart traps** (P3+P4) — golden-vector tests + MinIO e2e in a dedicated phase; ETag ≠ sha256 (store both); classic signed PUT without checksum trailing headers; per-part retry from the immutable staged file; AbortMultipartUpload on failure; distinct keyed refusal on `RequestTimeTooSkewed`.
4. **Restore atomicity / id remap / self-restore recursion** (P8+P9+P10) — one transaction per restore unit; total remap table validated before insert; `-restored` births with only the operator; **table classification at export time** (`data` vs `operational` — backup_tasks, instance_roles, sessions, users etc. never restorable in default selective restore).
5. **Privilege escalation via restore** (P11) — the security headline. Restore scoped by *live* rights; instance-scope archive download = instance admin only; users/roles restore = Super Admin + type-to-confirm + global session revocation; `instance_roles` restore additive-only, never demotes Super Admins. Needs an explicit security contract (Phase 30 pattern, `threats_open: 0`).

Plus two scheduler/notify pitfalls that are schema decisions: reconcile-from-DB + boot sweep of stale `running` rows + explicit `tz` column + at-most-once catch-up (P5+P6), and transition-based failure email with `last_notified_state` on the task row (P13 — must land with the task table or mail storms follow).

## Implications for Roadmap

The four researchers converge on one order (roles → export core → scheduler/tasks → S3 → restore → polish) with minor variations (PITFALLS.md's mapping puts roles near the end; its own text contradicts that — Pitfall 11 prevention is explicitly "Roles phase AND restore phase jointly", and FEATURES.md's dependency graph says "roles BEFORE scheduler ships, else nobody but Super Admin can be delegated"). ARCHITECTURE.md's dependency-driven build order is the most rigorous and is adopted here.

**Cross-phase decisions that must land EARLY (freeze in the export/roles phases — churn after restore exists = rework):**
1. **Archive format freeze** — ustar tar + gzip container, manifest as entry 0, `formatVersion: 1`, manifest schema including `scope: {kind,id}`, entity-addressable rows (id-tagged by workspace/project), per-table/per-file/whole-archive sha256, and `data` vs `operational` **table classification**. Restore, S3, and rotation all consume this format; it is the linchpin.
2. **Table classification in the manifest** (P10 is an export-side decision) — classify at export time so restore never retrofits it.
3. **Checksum canonical statement** (P12) — sha256 of final archive bytes as written to destination, computed once at export, stored in manifest AND run row, re-verified at restore before any write. Pin in plan + tests across all three phases that touch it.
4. **Role vocabulary + funnel** — `hasInstanceRole(user, key)` with Super-Admins-auto-members; every later route gates on it. Also encode "restore authority ≠ archive read authority" (download tiering) here, since P11 spans both roles and restore phases.
5. **Schema decisions that ride the task table** — `tz` column (P6), `last_notified_state` (P13), `next_run_at` (never re-parse cron at tick time), destination_cfg = config-not-credentials (S3 secrets are boot-frozen env). Landing these with the tasks phase avoids retrofits.

### Phase 1: Roles Foundation
**Rationale:** Cheapest, zero risk to existing features, independently shippable, and every later route checks it (FEATURES.md: roles must land before or with task CRUD or the UI ships Super-Admin-only and needs rework).
**Delivers:** `instance_roles` + `instance_role_members` (both mirrors + pin test), `hasInstanceRole` gate helper extending `isInstanceAdmin`, Governance "Instance Roles" tab (roster, multi-add picker, last-super-admin demotion refusal, type-to-confirm), keyed 5-locale refusals, audit events, Super Admin role-first console listing (backlog item).
**Addresses:** roles table stakes + governance; **Avoids:** P11's role-design half (restore-authority ≠ read-authority encoded now).

### Phase 2: Export Core ("gr8r backup v1" format)
**Rationale:** Restore consumes the format; scheduler produces runs of it; S3 uploads it. Everything stands on it — build before anything parallel.
**Delivers:** Pure `backup.js` core (manifest schema, NDJSON serializer, refusals) pinned by zero-boot unit suite; snapshot mechanics (SQLite `VACUUM INTO` + read-only snapshot reads; pg checked-out client RR tx); local destination; manual "Run now" runs (no scheduler yet — operators get value immediately); sha256 3-level in the streaming pipe; manifest self-verification (mismatch = FAILED); **table classification frozen in the manifest**; atomic temp-file discipline.
**Addresses:** export engine, local dest, Run now, checksum; **Avoids:** P1, P2, P12-definition; **Implements:** the one genuinely new integration seam.

### Phase 3: Scheduler + Tasks + Run History + Rotation
**Rationale:** Depends on Phase 2's run pipeline; reconcile-from-DB + honest run history must exist before rotation (P5/P7) and before S3 polish. GFS rotation belongs here as it needs verified-success ordering + run history.
**Delivers:** `backup_tasks`/`backup_runs`/`backup_run_claims` tables (with `tz`, `last_notified_state`, `next_run_at` — the early schema decisions), cron validation + task CRUD + builder UI + GFS policy form, 60 s reconcile tick (claim ledger, overlap mutex, at-most-once catch-up, boot sweep of stale `running` rows), rotation with inviolable ordering (verify → succeeded → rotate; newest excluded by ID; audited deletes; refuse-empty floor), run history UI + `skipped_overlap` visibility, transition-based failure email via `email_outbox`.
**Addresses:** task CRUD, schedule builder, GFS, run history, failure email; **Avoids:** P5, P6, P7, P13.

### Phase 4: S3 Destination
**Rationale:** Depends only on Phase 2's frozen destination interface; independent of the scheduler. Isolated because SigV4 deserves its own verification loop (golden vectors + MinIO e2e), not tasks inside the core phase.
**Delivers:** `s3-dest.js` (SigV4 over node:crypto, oidc.js precedent), path-style, real payload-hash PUT, 64 MiB serial multipart ≥512 MiB with abort-on-failure, ETag-stored-separately, boot-frozen `S3_*` env consts (secrets never in task rows), probe-at-save keyed refusal, clock-skew refusal, restore-direction download to staged temp with streaming-hash verify.
**Addresses:** S3 destination table stakes; **Avoids:** P3, P4.

### Phase 5: Restore
**Rationale:** Reads Phase 2 archives; highest-risk phase; benefits from the format being stable across three prior phases. Import-as-new lands first (default mode), overwrite last.
**Delivers:** Preview-from-manifest; import-as-new (existing creation paths + doc splice via `mergeClientDoc`, deterministic remap table validated for totality before insert, `-restored` suffix + collision handling, zero-memberships-except-operator, no operational tables); guarded overwrite (type-to-confirm, pre-restore snapshot run tagged `pre_restore`, one `begin immediate` transaction, post-commit side-effect kicks, post-restore count verification with `succeeded_with_warnings`); live-rights scoping + download tiering + session revocation on users/roles restore — with an explicit security contract (Phase 30 pattern, `threats_open: 0`).
**Addresses:** restore table stakes + differentiators; **Avoids:** P8, P9, P10, P11 (jointly with Phase 1).

### Phase 6: Polish + Verification Sweep
**Rationale:** Small items riding an already-working pipeline; closes the "looks done but isn't" checklist.
**Delivers:** Verify-checksum action on run detail; archive download from run detail (admin-tiered); retention "kept until" visibility; projected-deletion-list preview in the rotation form; PG parity e2e sweep (`POSTGRES_TEST_URL`, REPEATABLE READ export); DST-boundary cron tests; i18n gate sweep for all new keys ×5; docs (DEPLOY.md TZ + NTP notes; `--backup` CLI distinction).
**Addresses:** v1.x differentiators; **Avoids:** the full "Looks Done But Isn't" checklist.

### Phase Ordering Rationale

- **Roles first**: every later route gates on the funnel; P11's design half must exist before restore endpoints are written.
- **Export before restore, never parallel** (FEATURES.md dependency graph): restore consumes the format; format churn after restore exists = rework.
- **Manual-run-first (Phase 2) delivers operator value before the scheduler exists** — the archive format is proven end-to-end with unit tests before any cron complexity.
- **Scheduler before S3** is the recommended variant (PITFALLS.md: S3 failure modes feed run history — build history first); ARCHITECTURE.md notes it negotiable, but rotation + notify want honest history, so keep this order.
- **S3 isolated in its own phase** because SigV4 needs golden-vector + MinIO-e2e verification (P3), not tasks inside backup-core.
- **Restore last-but-one**: highest risk (P8–P11), reads a frozen format, needs live-rights scoping that Phase 1 designed.
- **PITFALLS.md's own pitfall-to-phase table** suggested backup foundation → destinations → scheduling → restore → roles; that trailing roles placement contradicts its Pitfall 11 text ("Roles AND Restore jointly") and FEATURES.md's hard dependency ("roles BEFORE scheduler"). Roles-first is the correct reconciliation.

### Research Flags

Phases likely needing deeper research during planning (`--research-phase`):
- **Phase 2 (Export Core):** the one genuinely new engineering surface — archive format, snapshot fence, manifest design, table classification. Phase research should confirm ustar writer/reader size math and the file-id→workspace/project mapping for the DATA_DIR collector (FEATURES.md flag: verify this mapping exists).
- **Phase 4 (S3 Destination):** SigV4 golden vectors, MinIO/B2 provider quirks verified against the pinned MinIO version at phase time (STACK.md MEDIUM on provider edge quirks); multipart edge cases.
- **Phase 5 (Restore):** overwrite-restore concurrency model — decide maintenance banner / read-only window / "applies next restart" at discuss-phase (FEATURES.md flag); whether scope=project restore ever needs row-shaped tables (saved_views, webhooks) or doc-splice suffices (ARCHITECTURE.md open question); MCP mirror for backup endpoints in or out (ARCHITECTURE.md open question); per-task namespace vs shared-prefix GFS semantics (recommend per-task namespace — phase decision).

Phases with standard patterns (skip research-phase):
- **Phase 1 (Roles):** group_mappings template is complete — dual mirror + pin test + refusal funnel + tab shape all copied from v3.2.
- **Phase 3 (Scheduler/Tasks):** reminder-pass pattern, house interval rules, claim ledger all established; cron subset is ~150 pure lines.
- **Phase 6 (Polish):** small items on existing surfaces.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Every stdlib primitive verified live against Node 24.21.0 (no `node:sqlite.backup()`, VACUUM INTO works); SigV4/S3 mechanics verified against Backblaze official docs + AWS spec; MEDIUM only on provider edge quirks (MinIO/AWS not live-tested — verify at Phase 4 against pinned MinIO version) |
| Features | MEDIUM-HIGH | Comparable-product behavior (Gitea/Portainer/Nextcloud/databasement) inferred from docs/UIs, not deep audits; SearXNG degraded during research; no single authoritative UX standard exists |
| Architecture | HIGH | Every pattern read from HEAD source with line-level evidence; house recipe proven in v3.0/v3.2 |
| Pitfalls | HIGH | Well-documented engineering knowledge cross-checked against the codebase's own proven patterns (vacuum-into backups, WR-04, v1.5 scheduler, v2.4 email_outbox) |

**Overall confidence:** HIGH — this is a well-precedented integration milestone on a mature codebase, with one new engineering surface (the archive) whose risks are all identified with structural preventions.

### Gaps to Address

- **Overwrite-restore concurrency model** (banner / read-only window / next-restart): decide at Phase 5 discuss-phase. Import-as-new has no such conflict.
- **File-id→workspace/project mapping** for the DATA_DIR export collector: verify exists at Phase 2 plan time (FEATURES.md flag).
- **Row-shaped tables in project-scope restore** (saved_views, webhooks) vs doc-splice-only: Phase 5 discuss-phase decision.
- **MCP mirror for backup endpoints**: in/out of v1 scope — small decision point at roadmap or Phase 5.
- **GFS namespace semantics** (per-task prefix vs shared): recommend per-task; confirm at Phase 3 plan.
- **Provider quirks drift** (MinIO/B2/AWS S3 API): re-verify against the pinned MinIO version during Phase 4.
- **SIGTERM/crash hygiene sweep** of `DATA_DIR/tmp/backup-*` older than 24 h: cheap, belongs in Phase 2; easy to forget.

## Sources

### Primary (HIGH confidence)
- Local verification: Node 24.21.0 runtime (`node:sqlite` prototype enumeration, VACUUM INTO execution); server.js:113/3778/4443/9594–9606/9686–9739; db-adapter.mjs:375–419/477/495/793
- Codebase precedents: groups.js/domains.js fences, groups-core.test.mjs pin test, reminders_sent claim ledger, migrateTenancy vacuum-into backups, isInstanceAdmin, v2.4 email_outbox, Phase 44 resolveTz, Phase 30 security-contract pattern, v3.2 type-to-confirm
- Backblaze S3-Compatible API official docs (SigV4-only, path/vhost, multipart, unsupported features)
- AWS SigV4 specification (stable since 2015) + S3 multipart/checksum trailer docs
- Postgres REPEATABLE READ / MVCC snapshot-on-first-statement semantics
- ustar tar format (POSIX 1003.1)
- SQLite official docs: WAL, `VACUUM INTO`, Online Backup API caveats

### Secondary (MEDIUM-HIGH / MEDIUM confidence)
- Comparable products (docs/UI-inferred): Gitea dump/restore, Nextcloud AIO backup UI, Portainer backup/restore, databasement GFS web UI, Outline
- GFS rotation defaults: Backblaze Grandfather-Father-Son, BackupAssist, severalnines (7/4/12± counts-based consensus)
- MinIO/B2 S3-compatibility notes (exact quirks may drift; re-verify at phase time)

---
*Research completed: 2026-11-21*
*Ready for roadmap: yes*
