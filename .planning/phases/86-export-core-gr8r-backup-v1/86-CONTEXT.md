# Phase 86: Export Core ("gr8r backup v1") - Context

**Gathered:** 2026-11-21
**Status:** Ready for planning

<domain>
## Phase Boundary

A Backup Operator can trigger a manual export of a project, a workspace, or the full instance today and receive a tar+gzip "gr8r backup v1" archive — per-table NDJSON rows plus the scope's uploaded files — with a versioned manifest (entry 0), per-table/per-file/whole-archive sha256, manifest self-verification failing the run on mismatch, dual-engine (SQLite/Postgres) snapshot parity, and bounded-memory streaming to a local destination. The archive format, manifest schema, entity addressability, table classification and checksum canonical statement FREEZE here for Phases 87 (scheduler/history/rotation), 88 (S3), and 89 (restore).

</domain>

<decisions>
## Implementation Decisions

### File collection per scope

- **D-01:** Strict containment policy: instance scope = everything under DATA_DIR (files + logos); workspace scope = that workspace's member projects' files + its own logo; project scope = only that project's files. No cross-scope bleed. — **Reversibility:** costly — this policy is baked into the frozen manifest layout that Phases 87/88/89 consume; changing inclusion per scope changes what restore receives.
- **D-02:** Files are addressed inside the archive by their file id (mirroring the DB path: `files/<owner-dir>/<id>.<ext>`), matching the manifest's entity-addressable row ids — restore maps id→row directly.
- **D-03:** Logos follow the same collection policy as uploaded files for their owning scope (instance logos only in instance scope).
- **D-04:** Missing blob at export time (file row exists, blob dangling): record the file row in the manifest with a missing-blob flag, ship without it, run still succeeds; self-verification checks only what was collected.
- **D-05:** No orphan cleanup/dedup in v1 — export whatever file rows exist; dangling blobs ride along; restore re-links by id mapping.
- **D-06:** Path-slip defense: any collected path resolving outside the collector root (symlink escape) is skipped and flagged in the manifest — never followed.

### Run UX & destination

- **D-07:** Background run + poll: trigger returns a run id immediately; the Backup page polls status through stages (collecting → archiving → verifying → done|failed). A long instance export cannot hold an HTTP request open. — **Reversibility:** reversible.
- **D-08:** Completed archives land in `DATA_DIR/backups/` — the single directory Phase 87's scheduler and rotation also use. Not env-configurable in v1.
- **D-09:** Backup page in this phase: D-20 empty state replaced by a Run now card (scope picker) + run progress. No download endpoint — archives sit server-side until Phase 90's download tiering.
- **D-10:** Concurrent runs refused with a keyed error (backupRunInProgress) — one export at a time; Phase 87's overlap rule starts from this.
- **D-11:** Run state is in-memory only in v1 — crash clears it, page shows no active run. Persisted run history is Phase 87's runs table.
- **D-12:** Progress reporting is coarse stages only (no per-table counts).
- **D-13:** No cancel action in v1; SIGTERM/crash leaves staging to the boot-time sweep (roadmap crash-hygiene flag resolves the sweep at plan time).
- **D-14:** Archive filename encodes scope + timestamp: `backup-<scope-kind>-<scope-id>-<YYYYMMDD-HHMMSS>.tar.gz`.
- **D-15:** Failed runs leave nothing behind — partial staging removed; only verified archives occupy DATA_DIR/backups.

### Trigger API shape

- **D-16:** New `/api/backup/runs` route family: `POST /api/backup/runs` (trigger, returns run id) + `GET /api/backup/runs/current` (status). The Phase 85 `POST /api/backup/tasks` stub keeps refusing `backupNotConfigured` until Phase 87 gives tasks real meaning. — **Reversibility:** one-way — this is the frozen API surface Phase 87's history and Phase 88's destinations build on.
- **D-17:** Trigger body: `{ scope: { kind: 'project'|'workspace'|'instance', id? } }` (id omitted for instance). Server validates scope existence with the Phase 85 keyed refusal vocabulary.
- **D-18:** Run ids are UUIDs — unguessable, no enumeration surface.
- **D-19:** Status payload is complete: scope, stage, startedAt, and on completion the archive filename + whole-archive sha256. One endpoint, no split detail route.
- **D-20:** Refused trigger attempts (wrong role, concurrent run, bad scope) write audit_log rows — export attempts are on the trail from day one.
- **D-21:** POST /api/backup/runs is throttled like grant/revoke: operator-keyed tooMany, consuming a try even on refusal.
- **D-22:** Non-holders polling status get the same keyed `backupRoleRequired` 403 as the tasks GET.
- **D-23:** No MCP mirror of the run endpoints in v1 (already flagged as the restore-phase gap decision).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning docs
- `.planning/ROADMAP.md` §Phase 86 — Goal, success criteria 1-5, frozen cross-phase decisions (format, manifest entry 0, classification, checksum statement), plan-time research flags (ustar size math, file-id→scope mapping, SIGTERM/crash hygiene)
- `.planning/REQUIREMENTS.md` §BKBCK-01 — the requirement this phase implements
- `.planning/phases/85-roles-foundation/85-CONTEXT.md` — D-09 capability funnel (hasInstanceRole), D-16 route family + guard order, D-20/D-26 Backup surface + 403 fullstate, D-23 render-only payload flags — the gate this phase builds under
- `.planning/phases/85-roles-foundation/85-SECURITY.md` — Phase 85 threat contract; Phase 86 extends the same route family

### Code anchors
- `server.js:7747-7800` — Phase 85 backup stub endpoints (GET refuses non-holders; POST refuses backupNotConfigured until Phase 87; GET /tasks becomes live content this phase)
- `server.js:126-132` — DATA_DIR / FILES_DIR / LOGOS_DIR / DB_PATH constants (collector roots)
- `roles.js` — CAP capabilities + capabilitiesFor funnel (export gate)
- `db-adapter.mjs` — dual-engine adapter (SQLite/Postgres snapshot parity surface)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 85 route guard chain (sameOrigin → requireUser → throttle → gate before lookup): copy verbatim for /api/backup/runs
- `export/` directory (mspdi.js, xlsx.js): existing streaming-export precedents in the codebase
- audit_log same-tx write pattern (grant/revoke): D-20 refused-attempt audit uses it
- tar already used in codebase ops (`vacuum into`, `--backup` CLI mode at server.js:50)

### Established Patterns
- Keyed refusal vocabulary (`fail(res, code, message)` + 5-locale i18n): every new refusal uses it
- Dual-mirror convention + pin tests: snapshot parity must be pinned both engines
- In-memory state modules with keyed A.* actions: run-state holder follows the same shape

### Integration Points
- Backup page (`src/pages/backup.js`): D-20 empty state becomes the Run now card + progress view; payload flags stay render-only
- api.js: new run trigger/status calls behind the existing call() central refusal handling
- Nav/gating unchanged (Phase 85 D-21): same canBackup/canRestore flags

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The user consistently chose the conservative/recommended option on every question (strict containment, id-addressed files, record-and-continue on missing blobs, background runs, refusal of concurrency, UUID ids, full audit trail).

</specifics>

<deferred>
## Deferred Ideas

- Download/verify-checksum UI for archives — Phase 90 success criterion 2 (tiered download action)
- Configurable backup destination directory (env BACKUP_DIR) — revisit when Phase 88 adds S3 destinations
- Persisted run history / run detail records — Phase 87 (runs table)
- Archive cancellation action — candidate for Phase 87 if scheduler needs it
- MCP backup endpoints — Phase 89 restore-phase gap decision

</deferred>

---

*Phase: 86-export-core-gr8r-backup-v1*
*Context gathered: 2026-11-21*
