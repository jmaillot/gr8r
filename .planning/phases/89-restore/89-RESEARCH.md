# Phase 89: Restore - Research

**Researched:** 2026-11-22
**Domain:** Codebase-anchored restore implementation on the frozen "gr8r backup v1" archive format (zero-npm-dependency Node 24 app; dual-engine SQLite/Postgres)
**Confidence:** HIGH (every claim below was verified by reading the cited source file this session; the archive format and all seams already exist in-tree)

## Summary

Phase 89 is a greenfield restore surface built on four already-frozen seams: the 86 archive format (`export/backup.js`), the 87 run-row lifecycle + stale sweep (`backup_runs` in server.js), the 88 S3 download seam (`downloadToStaged` in `export/s3.js`), and the 85 capability funnel (`roles.js` + `hasInstanceRole` in server.js). **No new npm packages** — `test/dependencies.test.mjs` pins the runtime-dependency contract and fails the suite on any new dependency; the Standard Stack is Node stdlib + the project's own modules. The real research is what follows: the exact shapes to reuse and the three structural discoveries that shape the plan.

**Discovery 1 — the doc IS the content (doc-splice vs row-insert is now settled by the schema).** `DATA_TABLES` is only four row-shaped tables: `workspaces, memberships, team_members, invites` `[VERIFIED: export/backup.js:103]`. ALL workspace content — projects, tasks, subtasks, comments, file records, team definitions, activity, notifications, projOrder — lives inside the `workspaces.doc` TEXT column (the "workspace document"; `emptyDoc` shape at `[VERIFIED: server.js:4157-4176]`). A project-scope restore is therefore a **doc-splice** into a live workspace's doc JSON; a workspace-scope import-as-new inserts ONE `workspaces` row (with a remapped doc) plus row-shaped memberships/team_members rows; instance DR replaces `workspaces` rows doc-and-all in one transaction. The "full reference graph" D-89-10 speaks of is **mostly inside the doc JSON** (project.id, task.project/parentId, file.id/project/task, comment/task links, teams[].id, projOrder[]), not across table FKs. Row-shaped FK references that are NOT remappable are `user_id` columns — live users are the identity universe (D-33-10), so archive `user_id` values must be validated against live users and skip-and-reported, never remapped (see Pitfall 7).

**Discovery 2 — the real frozen file layout is FLAT, and 89-CONTEXT D-89-12's wording predates it.** 86-CONTEXT D-02 said `files/<owner-dir>/<id>.<ext>`, but the ratified implementation (A6, documented in the 86-01 header) addresses files as **flat `files/<id>` inside the archive** (extension-less), mirroring the on-disk layout `FILES_DIR/<id>` (extension-less); manifest file records carry `name`/`ext` so restore can rebuild usable filenames, and logos ride `logos/<file>` `[VERIFIED: export/backup.js:15-22, 418-456]`. Restore must re-address blobs as `FILES_DIR/<freshId>` flat. Any plan step quoting the `files/<owner-dir>/<id>.<ext>` layout should be re-keyed to the actual frozen shape.

**Discovery 3 — there is NO tar reader in the codebase.** 86 shipped only the ustar **writer** (`ustarHeader` + `tarEntry`/`tarFileEntry`, `[VERIFIED: export/backup.js:210-285]`); a repo-wide grep for any tar parse/read path returns nothing. Preview (D-89-17: stream manifest from entry 0 without unpacking) and extraction both need a **new hand-rolled ustar+gzip stream reader** (512-byte header walk over a `zlib.createGunzip()` pipeline) — a real engineering task, not a seam reuse. The CONTEXT's "tar streaming reads already in the codebase" reusable-asset bullet is wrong and should not be planned around.

**Primary recommendation:** Build restore as a sibling of the export core — a new repo-root `export/restore.js` (never under `src/`; the prohibition test enforces it) containing the tar reader, manifest verifier, ID-remap planner, and per-unit restore executor; persist restore-run rows in a new `restore_runs` table via the 87 run-row + boot-sweep idioms; gate the new `/api/backup/restore/*` route family through the verbatim guard chain and keyed-refusal funnel; extend `src/pages/backup.js` per the approved 89-UI-SPEC.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
D-89-1..33, copied verbatim from `89-CONTEXT.md` §Implementation Decisions (the planner MUST honor all 33; the text above in CONTEXT.md is canonical — key enforcement points):

- **D-89-1** One global restore lock: any restore blocks any other restore AND any backup run, and vice versa — mutual keyed refusal (`backupRunInProgress` family / `backupRestoreInProgress`). No maintenance banner.
- **D-89-2** Background run with persisted restore-run row family (created → running → done|failed); trigger returns run id immediately.
- **D-89-3** DB work = ONE transaction per restore unit; file blobs repaired from the automatic pre-restore snapshot if the run failed after any file mutation.
- **D-89-4** Overwrite file-blob replacement via staged directory swap; logos + DATA_DIR-level collected files ride the same machinery.
- **D-89-5** Pre-restore snapshots tagged `pre_restore`, automatic, same buildArchive core, manual-archive doctrine (never auto-deleted); run row + audit carry the tag + snapshot run id.
- **D-89-6** Overwrite = full data replacement (86-D-01 containment); workspace row keeps its identity. Not a merge.
- **D-89-7** Selective restore touches ONLY data tables; operational rows skipped AND REPORTED (skip report in run summary, visible in history UI + audit).
- **D-89-8** Full-instance DR skips operational tables EXCEPT `instance_roles` (deliberate, threat-modeled exception).
- **D-89-9** Import-as-new: only the restoring operator becomes a member; archive memberships/invites skipped (in skip report); workspace restore brings member projects along.
- **D-89-10** ID remap: archive id → new id map; totality validated against the archive's full reference graph BEFORE any insert; topological insert order; deferred-constraint FK posture.
- **D-89-11** Engine-native ids via db adapter conventions; remap map holds archive id → new id read back after insert; no UUID pre-generation.
- **D-89-12** File rows/blobs remap to fresh ids; missing-blob-flagged files restore as flagged rows without blobs.
- **D-89-13** `-restored` suffix collisions auto-counter (`-restored-2`, …); run row records final name.
- **D-89-14** Restore list source of truth = backup run rows (local + S3-uploaded); no live ListObjectsV2.
- **D-89-15** Honest dual-location badges; archive gone from both destinations refuses keyed (`err.restoreArchiveMissing`).
- **D-89-16** S3-located archives fetched via the 88-01 download seam (staged temp + streaming-hash verify) before preview/restore.
- **D-89-17** Preview = `GET /api/backup/restore/preview?runId=`, manifest streamed from entry 0 (no full unpack); corrupt manifest fails keyed.
- **D-89-18** Preview re-verifies whole-archive sha256 while streaming.
- **D-89-19** No MCP mirror for restore endpoints in v1.
- **D-89-20** Restore surface INSIDE the Backup page; restore runs get their own history card; no second nav entry.
- **D-89-21** Authority mapping = SC-5 verbatim: list/preview = Restore Operator+; import-as-new = Restore Operator; overwrite = Backup Operator/Super Admin; instance restore = Super Admin. Per-route `hasInstanceRole` gating; archive contents never grant authority.
- **D-89-22** Restore triggers operator-keyed throttled (tooMany consumes a try); every refused attempt audited.
- **D-89-23** Import-as-new project lands in a workspace the operator is CURRENTLY a member of (live-membership picker); zero memberships → keyed refusal. Live rights checked at TRIGGER time.
- **D-89-24** DR = live workspaces/projects replaced by archive data tables in one transaction (+ file-layer staged swap); pre-DR instance snapshot is the safety net.
- **D-89-25** Global session revocation AFTER the restore transaction commits — every session invalidated INCLUDING the initiating Super Admin.
- **D-89-26** Instance stays LIVE during DR (global lock only); no maintenance mode.
- **D-89-27** Type-to-confirm exact-name: overwrite = target's exact name; DR = fixed phrase `RESTORE-INSTANCE`. Overlay dialog with consequence text.
- **D-89-28** Restore outcome emails to Super Admins + Backup Operators via the email_outbox transition-gate idiom; DR notification is the re-login wall itself; no all-member emails.
- **D-89-29** Stage vocabulary `fetching → validating → restoring → verifying → done|failed`; coarse stages only; `fetching` covers the S3 download.
- **D-89-30** Post-restore verification mirrors export self-verification (remap totality re-check, per-table row counts vs manifest, blobs present for non-flagged file rows, whole-archive sha256 re-confirm). Any gap → failed (tx rolls back; files repaired from snapshot).
- **D-89-31** PG parity: one transaction per restore unit on BOTH engines; NO DDL inside the restore tx; global lock = engine-neutral row claim (dedicated `restore_lock` row claim + 87's stale-running sweep releasing stale claims at boot); no per-engine advisory locks.
- **D-89-32** Restore staging under `BACKUPS_DIR/restore-staging/` with 86-style boot-time sweep hygiene; failed restores leave nothing behind.
- **D-89-33** Security contract `89-SECURITY.md` (85 pattern, threats_open: 0) covering four threat families: privilege-escalation-via-restore, manifest/SQL injection via archive-supplied fields, path traversal via archived filenames, DR instance_roles rebuild abuse.

### the agent's Discretion
None declared in 89-CONTEXT.md (all 33 decisions locked; planner-level minutiae like exact route shapes follow codebase patterns per 85/86/87 discretion precedents).

### Deferred Ideas (OUT OF SCOPE)
None captured — all discussion stayed within the phase boundary. (From REQUIREMENTS.md, already ratified out: per-item restore, dry-run, archive download for end users (Phase 90), MCP mirror (Phase 90), S3 object deletion (D-88-7).)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BKRST-01 | Restore Operator lists backups across destinations and previews from the manifest without downloading/unpacking | List = `backup_runs` rows (server.js:8846-8865 query shape to extend); S3-located preview = `downloadToStaged` (s3.js:380-408) then stream manifest from the staged file; local preview = direct stream; manifest streaming needs the NEW tar reader (Summary, Discovery 3); preview re-verifies whole-archive sha256 on the same streaming pass (D-89-18) |
| BKRST-02 | Restore workspace/project as NEW with `-restored` suffix, full ID remap, restorer-only member, one transaction | Doc-splice model (Discovery 1); remap planner over doc JSON + row-shaped tables; `db.tx(fn)` scope (db-adapter.mjs:606-609); name auto-counter over `workspaces.name` + slug uniqueness (`uniqueSlug`, server.js:8940); project-into-live-workspace needs the doc-PUT write machinery (revision bump, syncTaskFts through tx scope) |
| BKRST-03 | Backup Operator/Super Admin overwrite with type-to-confirm + automatic pre_restore snapshot + single transaction; operational tables never overwritten | `confirmModal` typeName idiom (modals.js:519-528); pre-snapshot = `runExport(scope, meta)` (export/backup.js:620-817) — snapshot BEFORE the restore lock's DB work; `backup_runs.trigger` CHECK cannot hold a `pre_restore` tag (see Pitfall 9 / Open Question 2) |
| BKRST-04 | Super-Admin-only instance DR with global session revocation + 89-SECURITY.md (threats_open: 0) | Sessions = `token_hash`-keyed rows; per-user revocation precedent server.js:7348; DR needs a new global `delete from sessions` post-commit (no existing global revoke — new one-liner); instance_roles rebuild exception (D-89-8) with FK-vs-live-users validation (Pitfall 7); threat register seeded from 85-SECURITY.md pattern + §Security Domain below |
</phase_requirements>

## Project Constraints (from AGENTS.md)

No project-root `AGENTS.md` exists (`ls` verified). No `.claude/skills/` or `.agents/skills/` directories exist. Governing constraints come from the repo's own enforcement surfaces:
- **Zero new npm dependencies** (D-33-11) — enforced at test time by `test/dependencies.test.mjs` `[VERIFIED: test/dependencies.test.mjs:1-20]`.
- **`src/` prohibition for server modules** — export/backup.js must live at repo root "never under src/ (the prohibition test fails the moment a src/ module reaches this file)" `[VERIFIED: export/backup.js:4-6]`; a new `export/restore.js` follows the same rule, pinned by `test/export-prohibition.test.mjs`.
- **5-locale parity same-commit** — new keys land in all of `src/locales/{en,fr,nl,de,es}.json`; parity pinned by `test/build-locales.test.mjs` and the catalogue lint; `scripts/i18n-scan.mjs` runs at prebuild `[VERIFIED: package.json scripts]`.
- **Global user instructions** (user-level AGENTS.md): verify before inventing APIs/paths; documentation update at each phase end; never re-apply applied edits.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Restore list (dual-location) | API/Backend | — | `backup_runs` rows + local fs existence + S3 eligibility derive server-side; client renders payload verbatim (render-only doctrine) |
| Preview (manifest stream + sha256 verify) | API/Backend | — | tar reader + gunzip + hashing are server-only stdlib work; client renders counts verbatim |
| Tar reading / extraction | API/Backend (server process) | — | Node stdlib in the server process; never bundled to client (src/ prohibition) |
| ID remap planning + totality validation | API/Backend | — | pure logic, unit-testable like roles.js (pure module precedent) |
| DB insert transaction per restore unit | Database/Storage via db-adapter | — | `db.tx(fn)` — the ONLY sanctioned transaction surface, both engines |
| File blob write / staged swap / repair | OS/filesystem layer (server) | Database/Storage | blobs are non-transactional; snapshot is the repair net (D-89-3) |
| Global restore lock | Database/Storage (restore_lock row) | API/Backend | engine-neutral row claim per D-89-31; never advisory locks |
| Type-to-confirm UX | Browser/Client | API/Backend | `confirmModal` chrome client-side; server re-validates the confirm phrase independent of the client (never trust the dialog) |
| Session revocation (DR) | Database/Storage | — | `delete from sessions` post-commit; `requireUser` failure is the enforcement |
| Restore emails | API/Backend | Database/Storage | email_outbox claim rows, delivered post-commit by the existing pass |
| 89-SECURITY.md | Planning artifact | — | gsd-security-auditor at secure-phase; researcher supplies the threat seed below |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (none — zero new npm deps, D-33-11) | — | — | `test/dependencies.test.mjs` fails the suite on any new runtime dependency `[VERIFIED: test/dependencies.test.mjs]` |

The "stack" is the project's own frozen modules:

| Module | Purpose for 89 | Provenance |
|--------|----------------|------------|
| `export/backup.js` — `runExport`, `TABLES`, `backupsRoot()`, `sweepStaleBackupStaging`, `backupStagingSkipName`, `verifyStagedBackup` | pre_restore snapshot runs; frozen table classification; staging hygiene pattern to mirror for `restore-staging` | `[VERIFIED: export/backup.js:77-116, 191-208, 313-327, 620-817]` |
| `export/s3.js` — `downloadToStaged(config, key, expectedSha256, stagingDir)` → `{ tmpPath, sha256 }` | D-89-16 fetch path; sha256 verified on the pipe; keyed mismatch `err.s3Class='sha256Mismatch'` | `[VERIFIED: export/s3.js:373-408]` |
| `db-adapter.mjs` — `tx(fn)` with `{get,all,run}` scope; `backendKind`; `runSchema`; `ensureColumn` | the ONLY transaction surface (D-89-31); schema push | `[VERIFIED: db-adapter.mjs:542-609, 512-515, 937-949]` |
| `roles.js` — `CAP.RESTORE_USE`, `CAP.BACKUP_MANAGE`; server `hasInstanceRole(userId, capability)` | D-89-21 per-route gating | `[VERIFIED: roles.js:24-41; server.js:5554-5558]` |
| server guard chain + `fail(res, status, code, message)` + `tooMany(key, max, windowMs)` | keyed refusals, throttle (consumes a try on refusal) | `[VERIFIED: server.js:5610-5619, 8716-8733]` |
| `auditBackupTask(user, action, targetId, targetName)` helper shape | audit funnel for every restore trigger/refusal | `[VERIFIED: server.js:8343-8348]` |
| `writeBackupRunRow` writer seam + `sweepStaleBackupRuns` + boot wiring | the run-row lifecycle restore_runs mirrors | `[VERIFIED: server.js:3425-3470, 3540-3543, 10994-11000]` |
| `confirmModal` (`src/overlays/modals.js:519-528`) | type-to-confirm (D-89-27) | `[VERIFIED: src/overlays/modals.js:519-528]` |
| `src/pages/backup.js` page idioms (`full403`/`fullErr`, `runNowCard`, `runProgress`, `runRow`, `historyCard`) | D-89-20 one-surface restore card mirrors | `[VERIFIED: src/pages/backup.js:41-220, 312-355]` |
| `handleBackupTaskOutcome` + `email_outbox` claim rows | D-89-28 email idiom | `[VERIFIED: server.js:3546-3610; SCHEMA server.js:676-689]` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:zlib` `createGunzip()` | stdlib | streaming tar decompress | tar reader (new) |
| `node:crypto` `createHash('sha256')` Transform-tap idiom | stdlib | whole-archive verify while streaming | mirror `downloadToStaged`'s hashTap `[VERIFIED: export/s3.js:384-397]` |
| `node:test` + `test/helpers/server.mjs` (`startServer/login/signup/client/withDb`) | dev | route/behavior suites | new restore test files |
| Playwright (`e2e/`) | dev | UI e2e if planned | optional; client wiring source-assertions may suffice (87-04 pattern) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled tar reader | an npm tar package | FORBIDDEN — D-33-11 zero-dep pin fails the suite; also the format is own-writer ustar, trivially readable |
| Client-side manifest fetch | server-streamed preview payload | CONTEXT D-89-17 locks server-side; client never downloads archives (Phase 90 owns download tiering) |
| Advisory locks (pg_advisory_lock / SQLite exclusive) | restore_lock row claim | D-89-31 explicitly forbids per-engine advisory locks — row claim is engine-neutral |

**Installation:** none — zero dependencies (D-33-11). No package installs in this phase.

**Version verification:** not applicable (no packages). Runtime: Node `v24.21.0` present, `engines >= 24` `[VERIFIED: package.json; node --version]`.

## Package Legitimacy Audit

**No external packages are installed in this phase** (D-33-11; `test/dependencies.test.mjs` enforcement). Registry checks: none required. Packages removed due to [SLOP] verdict: none. Packages flagged [SUS]: none.

## Architecture Patterns

### System Architecture Diagram

```
                        ┌────────────────────────────────────────────────┐
                        │  Backup page (src/pages/backup.js, D-89-20)    │
                        │  restore card → preview drawer → trigger       │
                        │  confirmModal (overwrite / RESTORE-INSTANCE)   │
                        └──────┬──────────────────────┬──────────────────┘
              GET list/preview │                      │ POST trigger (returns runId)
                               ▼                      ▼
        ┌───────────────────────────────────────────────────────────────┐
        │ /api/backup/restore/* routes (server.js, guard chain verbatim)│
        │ sameOrigin → requireUser → tooMany → hasInstanceRole(CAP)     │
        │ → body checks → audit every refusal (D-89-21/22)              │
        └──────┬──────────────────────────────────────┬─────────────────┘
               │                                      │
               ▼                                      ▼
   ┌───────────────────────┐            ┌──────────────────────────────┐
   │ LIST (BKRST-01)       │            │ TRIGGER → restore_lock row   │
   │ backup_runs rows      │            │ claim (engine-neutral CAS)   │
   │ + local fs existence  │            │ insert restore_runs(running) │
   │ + S3 eligibility      │            │ fire-and-forget runRestore() │
   └───────────┬───────────┘            └──────────┬───────────────────┘
               │                                   │
               ▼                                   ▼
   ┌───────────────────────┐   ┌─────────────────────────────────────────┐
   │ PREVIEW (D-89-17/18)  │   │ runRestore stages (D-89-29):            │
   │ local: stream archive │   │ fetching (S3: downloadToStaged,         │
   │ from BACKUPS_DIR;     │   │   export/s3.js seam) → validating       │
   │ S3: downloadToStaged  │   │ (tar reader → manifest entry 0 →        │
   │ → stream manifest     │   │  sha256 re-verify + remap totality)     │
   │ from staged temp      │   │ → restoring (ONE db.tx per unit)        │
   └───────────────────────┘   │ → verifying (D-89-30 mirrors) →         │
                               │   done|failed → restore_runs row        │
                               └───────┬───────────────────┬─────────────┘
                                       │                   │
             ┌─────────────────────────┘                   │
             ▼                                             ▼
   ┌──────────────────────────┐   ┌──────────────────────────────────────┐
   │ pre_restore snapshot     │   │ POST-COMMIT side effects             │
   │ (overwrite/DR only):     │   │ - blob unlink/staged swap repair     │
   │ runExport(scope, meta)   │   │ - global `delete from sessions` (DR) │
   │ via 86 core; archive in  │   │ - email_outbox claims (D-89-28)      │
   │ BACKUPS_DIR, tagged,     │   │ - audit rows (trail)                 │
   │ outside rotation D-87-11 │   └──────────────────────────────────────┘
   └──────────────────────────┘
```

Reading the primary flow: operator opens the restore card → list renders run rows with location badges → "Preview backup" streams the manifest server-side (no unpack on the client, no download endpoint) → trigger (import-as-new fires at once; overwrite/DR pass confirmModal first) → server claims the restore_lock row + inserts the running restore_runs row → background runRestore walks the stages → one transaction per restore unit → post-commit side effects (emails, DR session revocation, file repair) → history card polls the restore_runs payload.

### Recommended Project Structure
```
export/restore.js          # tar reader, manifest verify, remap planner, runRestore (repo ROOT — never src/)
server.js                  # restore_runs + restore_lock SCHEMA additions (server.js SCHEMA block) + byte-identical
                           #   twin in db-adapter.mjs SQLITE_SCHEMA (mirror-sync test pins the pair);
                           #   /api/backup/restore/* route family beside the existing backup routes;
                           #   boot wiring: restore staging sweep + stale restore_runs/lock release
src/pages/backup.js        # restore card + preview drawer + stage panel + history card (89-UI-SPEC)
src/actions/actions.js     # restore list/preview/trigger actions + restore poll tick (backupPollTick sibling)
src/core/api.js            # restore getters/trigger methods beside backup* methods, keyed-error doc block
src/locales/*.json ×5      # page.restore.* keys + err.restore* refusals, same commit
test/restore-*.test.mjs    # suites (see Validation Architecture)
```

### Pattern 1: Engine-neutral row claim (the restore_lock, D-89-31)
**What:** a dedicated single-row table claimed with a compare-and-set UPDATE — no advisory locks, works identically on both engines.
**When to use:** the global restore lock; release in a `finally`; boot sweep releases stale claims (87 idiom).
**Example:**
```sql
-- claim (atomic on both engines: the WHERE is the compare-and-set)
update restore_lock set claimed_by = ?, claimed_at = ? where claimed_by is null;
-- release
update restore_lock set claimed_by = null, claimed_at = null where claimed_by = ?;
```
Mutual exclusion with backup runs (D-89-1): the restore trigger ALSO checks `getRunState()` for an active export stage (the exact active-stage list at `[VERIFIED: server.js:8775-8776]`) and refuses keyed `backupRestoreInProgress`; symmetrically, `runExport`'s trigger path (server.js:8771-8782) and the scheduler pass must refuse when `restore_lock` is claimed — map `runExport`'s synchronous `claimRun` refusal exactly as 87-02 did (`[VERIFIED: server.js:3518-3529]`).

### Pattern 2: One transaction per restore unit via db.tx scope
**What:** all row writes of one restore unit inside `db.tx(async scope => {...})`; every write goes through `scope.run/get/all` — module-level `db.run` inside a pg tx body would land OUTSIDE the checked-out client (Pitfall 2 of the adapter).
**When to use:** every restore unit (workspace insert / doc-splice write / DR replacement).
**Example:**
```js
// [VERIFIED: db-adapter.mjs:542-609 — sqliteTx serializes on a promise-queue mutex (begin immediate);
//  pgTx checks out a client, begin/commit/rollback, release in finally. No savepoints exist.]
await db.tx(async scope => {
  await scope.run('insert into workspaces (id, slug, name, color, doc, revision, created_at, updated_at) values (?,?,?,?,?,?,?,?)', [...]);
  await scope.run('insert into memberships (workspace_id, user_id, role, member_id, provenance) values (?,?,?,?,?)', [...]);
  // D-89-31: NO DDL here — schema exists from boot runSchema
});
```
**Engine-native ids (D-89-11 resolved):** every PK in this schema is app-generated `uid()` = `crypto.randomUUID()` text `[VERIFIED: server.js:968]`. There is no autoincrement and no need for `last_insert_rowid`/`RETURNING` — the remap map's "new id" is the app-generated UUID assigned before insert; "read back after insert" is satisfied by construction (the map entry is written at insert time inside the same tx). Plans should NOT hunt for an adapter readback API that doesn't exist.

### Pattern 3: Staged-run pipeline with crash hygiene (mirror of 86/87)
**What:** restore runs stage like exports: staging dir under `BACKUPS_DIR/restore-staging/` (D-89-32), boot-time sweep of orphans, stale `running` restore_runs rows marked `interrupted` at boot, run-row writer emits start/update/fail events, errors never fail the run via the writer (best-effort persistence).
**Provenance:** `[VERIFIED: export/backup.js:191-208 (sweep), 586-615 (writer seam); server.js:3537-3543 (stale sweep), 10994-11000 (boot wiring)]`.

### Pattern 4: Doc-splice with the existing doc write machinery
**What:** project-scope restore splices `{projects:[p'], tasks:[...remapped], files:[...remapped], comments...}` fragments into the target workspace's stored doc, bumps `revision`, and reuses the doc-PUT funnel's post-commit hygiene (removed blob unlink with ENOENT tolerance, `[VERIFIED: server.js:9134-9142]`) and the in-tx `syncTaskFts(scope, wsId, stored, next)` call (`[VERIFIED: db-adapter.mjs:708-772]` — the FTS sync MUST be invoked with the tx scope or the pg write lands outside the transaction).
**Critical:** the archived doc fragment must pass through `normalizeDoc` semantics — `normalizeDoc` strips crafted/stale fields (members, notifPrefs, views, sessions, tfa; team member arrays) on every read `[VERIFIED: server.js:1261-1318]`, and `normalizeAssigneesData` drops assignee ids outside the live roster `[VERIFIED: server.js:1298-1306]` — the restorer-only-membership rule (D-89-9) is partially self-healing, but restore should splice only whitelisted shapes rather than rely on read-time stripping.

### Anti-Patterns to Avoid
- **Trusting archive contents as authority:** any role/capability/member decision derived from manifest or table rows. Authority comes only from live `hasInstanceRole` at trigger time (D-89-21/D-33-10).
- **Interpolating archive-supplied strings into SQL:** table names must match the frozen `TABLES` allow-list before any `select * from ${name}` style statement; everything else parameterized (86's T-86-02 posture, mirrored per D-89-33).
- **Building file paths from archived names without containment:** the file route's guard is the precedent — `path.dirname(file) !== FILES_DIR` refusal `[VERIFIED: server.js:10605-10607]`; archived entry names get the same containment + the D-06 realpath discipline.
- **Holding a pg tx open across long file IO:** D-89-3 requires one tx per unit, but blob copies should be staged to `restore-staging` BEFORE the tx opens; inside the tx only DB writes happen (mirrors the 86 fence discipline "rows ONLY inside the fence; files copy after release", `[VERIFIED: export/backup.js:644-646]`).
- **Client-derived authority/stages:** payload flags and stage labels render verbatim (render-only doctrine, D-23/T-85-06; the UI-SPEC mandates it).
- **Revoking sessions before the DR transaction commits:** D-89-25 order is commit-then-revoke; revoke must also not race the HTTP response — respond (or complete the run task) first, then delete, per the post-commit side-effect idiom (`[VERIFIED: server.js:9120-9133]` — email/webhook passes fire POST-COMMIT, never awaited into the response).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Transactions | custom begin/commit over pool.query | `db.tx(fn)` scope | pg docs Alert: BEGIN on a pool connection corrupts state; adapter owns the checked-out client + SQLite mutex `[VERIFIED: db-adapter.mjs:542-585]` |
| S3 fetch + verify | a new GET-and-hash path | `downloadToStaged` | already verifies sha256 on the pipe, cleans tmp on failure, keyed mismatch class `[VERIFIED: export/s3.js:380-408]` |
| Pre-restore snapshot | a second archiver | `runExport(scope, meta)` | the 86 core with self-verification, staging hygiene, atomic publish, writer seam |
| Run history rows | ad-hoc status tracking | 87 run-row lifecycle + boot sweep | persisted, capped-50 query shapes already exist `[VERIFIED: server.js:8856-8863]` |
| Email fan-out | direct SMTP | email_outbox claim rows + `runEmailDeliveryPass()` | exactly-once dedup keys, retry state, locale resolution all built `[VERIFIED: server.js:3574-3610]` |
| Keyed refusals / throttle / audit | new mechanisms | `fail()` + `tooMany()` + audit insert shape | the whole funnel is 3 helpers with pin tests |
| The ustar reader's header math | inventing field offsets | mirror `ustarHeader`'s documented layout | the writer IS the spec: name 100 / mode 8 / uid 8 / gid 8 / size 12 octal / mtime 12 / chksum 8 / typeflag / linkname 100 / magic / version / uname / gname / prefix 155 `[VERIFIED: export/backup.js:26-31, 216-251]` |

**Key insight:** this phase's only genuinely new machinery is (a) the tar/gzip stream reader and (b) the remap planner + doc-splice logic. Everything else is wiring frozen seams together.

## Runtime State Inventory

SKIPPED — not a rename/refactor/migration phase. (Per instruction; no string renames involved.)

## Common Pitfalls

### Pitfall 1: EXDEV rename across filesystems
**What goes wrong:** staged swap / publish rename fails with EXDEV when staging and destination live on different filesystems.
**Why:** 86 hit this already — backup staging lives ON the backups filesystem for exactly this reason.
**How to avoid:** `BACKUPS_DIR/restore-staging/` (D-89-32) is same-fs with archives; for blob swaps into `FILES_DIR`, stage inside DATA_DIR (default layout puts backups inside DATA_DIR, same fs — but BACKUPS_DIR may be overridden to a separate mount, so blob staging must stage under DATA_DIR-level temp, not under restore-staging, when the swap target is FILES_DIR) `[VERIFIED: export/backup.js:69-98 comment block]`.
**Warning signs:** CI tests passing (same fs) while compose deployments with `/backups` bind-mounts fail.

### Pitfall 2: Module-level db calls inside a tx body (pg)
**What goes wrong:** writes silently land outside the transaction on pg.
**Why:** pgTx runs on a checked-out client; module `run()` uses the pool.
**How to avoid:** every in-tx write through `scope.run`; this includes `syncTaskFts(scope, …)` and any audit rows written in the same tx.
**Warning signs:** pg-matrix pin tests failing while SQLite passes.

### Pitfall 3: Foreign keys to users that don't exist live
**What goes wrong:** restoring `memberships`/`team_members`/`invites`/`instance_roles` rows whose `user_id` has no live `users` row violates the FK (`references users(id)`, `[VERIFIED: server.js:463-499, 406-412]`) and fails the whole unit.
**Why:** users are operational (never restored selectively, D-33-10); archive user ids are a different identity universe unless restoring onto the same instance.
**How to avoid:** remap covers only workspace/project/task/file/comment (doc) ids; every `user_id`-bearing row is validated against live `users` BEFORE insert — mismatches skip-and-report (rides the D-89-7 skip report). For DR's `instance_roles` rebuild (D-89-8): same validation — rows referencing vanished users skip with report, so the roster rebuild can never wedge the transaction.
**Warning signs:** "FOREIGN KEY constraint failed" on SQLite; pg error 23503.

### Pitfall 4: Assignee/member_id space inside the doc
**What goes wrong:** restored tasks reference archived `member_id`s that don't exist in the target workspace roster; UI renders dangling assignees.
**Why:** doc profiles key on member_id; `normalizeAssigneesData` strips out-of-roster ids only at read time.
**How to avoid:** during remap, drop or null assignee values that don't resolve to the live workspace roster (restorer-only membership per D-89-9); don't ferry archived member ids across.
**Warning signs:** ghost assignee chips in a restored project.

### Pitfall 5: `backup_runs.trigger` CHECK enum can't hold 'pre_restore'
**What goes wrong:** writing a `pre_restore`-tagged snapshot run row fails the CHECK (`trigger in ('manual','scheduled')`, `[VERIFIED: server.js:785-800; db-adapter.mjs:448-463]`).
**Why:** the status enum was widened in 88 via a rebuild migration precisely because CHECKs are hard.
**How to avoid:** EITHER record the tag outside `trigger` (audit action `restore_snapshot_started:pre_restore` + the restore_runs row carrying the snapshot run id — sufficient for D-89-5's "run row + audit trail carry the tag" if interpreted as the restore-run row), OR widen the status/trigger CHECK via the 88 rebuild-migration precedent `[VERIFIED: server.js:889-924]`. Planner decision; the audit+restore_runs option avoids a migration.
**Warning signs:** CHECK constraint failed on snapshot insert.

### Pitfall 6: S3 location honesty (D-89-15) — run rows don't record upload success per run
**What goes wrong:** the list can't render a truthful S3 badge from `backup_runs` alone.
**Why:** upload outcome is folded into `status` (`succeeded` vs `upload_failed`) and `s3_enabled` lives on `backup_tasks` (mutable after the run) — a task whose S3 was disabled later still has S3 copies from when it was enabled; manual archives upload whenever S3.enabled `[VERIFIED: server.js:3481-3493; db-adapter.mjs:448-463]`.
**How to avoid:** badge rule candidates: local exists → Local; else S3.enabled && run could have uploaded (status succeeded + (task_id null ? S3.enabled now : task row exists)) → S3; else Unavailable. The S3 object key is deterministically reconstructible (`s3BackupKey`: task runs `backup-task-<taskId>/<filename>`, manual `backup-manual/<filename>`, `[VERIFIED: export/s3.js:444-446]`). A download that 404s surfaces the keyed `err.restoreArchiveMissing`. Optionally an additive `uploaded` column on backup_runs via `ensureColumn` (sanctioned additive path, `[VERIFIED: server.js:888; db-adapter.mjs:937-949]`) — planner's call.
**Warning signs:** badge lies after an operator toggles s3_enabled.

### Pitfall 7: Holding the restore transaction open too long on pg
**What goes wrong:** a big DR restore holds a pool client (max 10) for minutes; concurrent request bursts can exhaust the pool.
**Why:** pgTx checks out one client per tx; the global lock serializes restores, but reads continue.
**How to avoid:** stage/verify/hash everything BEFORE opening the tx (fetching/validating/verifying stages do the IO); the tx body is inserts only (D-89-26 keeps the instance live — reads flow on other clients).
**Warning signs:** pool connection-timeout errors during DR tests.

### Pitfall 8: Manifest/entry-name path traversal (D-89-33 family 3)
**What goes wrong:** an archived entry name like `../../cron.d/evil` or an absolute path escapes the extraction root when written.
**Why:** own-format archives are usually trusted; a crafted archive (restored from operator-supplied S3 buckets) is attacker input.
**How to avoid:** reject any entry name that isn't exactly `manifest.json`, `<allowed-table>.ndjson`, `files/<[A-Za-z0-9_-]+>`, or `logos/<safe-name>` BEFORE extraction; apply `contained()` realpath discipline when writing blobs (`[VERIFIED: export/backup.js:412-416, 428-440]`); extraction roots are `restore-staging` and later `FILES_DIR`/`LOGOS_DIR` with the file-route `path.dirname(file) !== ROOT` guard style.
**Warning signs:** security review finding on `restore.js` extraction loop.

### Pitfall 9: doc-splice revision/concurrency
**What goes wrong:** splicing into a live workspace doc without the revision discipline causes lost updates vs concurrent member edits (409 workspaceChanged machinery exists for that reason, `[VERIFIED: server.js:9115-9116]`).
**Why:** D-89-1's lock excludes backups/restores but NOT ordinary doc edits (D-89-26: instance stays live).
**How to avoid:** read stored doc + revision inside the tx, splice, write with revision+1 — the same compare discipline the doc-PUT funnel uses; accept that a member edit racing a restore tx serializes behind the SQLite mutex / row locks on pg.
**Warning signs:** restored project disappears after a concurrent edit commits.

### Pitfall 10: locale parity drift
**What goes wrong:** the suite fails (`build-locales` / catalogue lint) because a `page.restore.*` key landed in en only.
**How to avoid:** every key ×5 locales in the same commit as the first emitting gate (standing constraint).
**Warning signs:** `npm test` red on `catalogue.test.mjs` / `build-locales.test.mjs`.

## Code Examples

### The manifest entry-0 contract restore consumes
```json
// [VERIFIED: export/backup.js:696-704 — manifest shape written by runExport]
{
  "formatVersion": 1,
  "generator": "gr8r backup v1 (Phase 86)",
  "scope": { "kind": "workspace|project|instance", "id": null },
  "createdAt": 1763800000000,
  "tables": [ { "name": "workspaces", "classification": "data", "path": "workspaces.ndjson", "rows": 3, "sha256": "…" } ],
  "files":  [ { "id": "Ab12…", "name": "spec.pdf", "ext": "pdf", "project": "p1", "task": "t1",
               "path": "files/Ab12…", "sha256": "…", "size": 12345 } ]
}
```
Flag variants the reader must honor: `missingBlob`, `pathEscaped`, `nameReserved`, `symlinkSkipped` (carried with no sha256) `[VERIFIED: export/backup.js:313-327, 418-456, 480-530]`. Whole-archive sha256 lives ONLY in the run row + `.sha256` sidecar, never in the manifest `[VERIFIED: export/backup.js:17-22]`.

### The download seam (D-89-16)
```js
// [VERIFIED: export/s3.js:380-408]
const { tmpPath, sha256 } = await downloadToStaged(S3.config(), key, runRow.sha256, restoreStagingDir);
// tmpPath is a verified staged file inside stagingDir (same-fs convention); sha256 === runRow.sha256
// mismatch throws err.s3Class === 'sha256Mismatch' and removes the temp file.
```

### Guard chain + keyed refusal + audit (verbatim template)
```js
// [VERIFIED: server.js:8716-8733 — copy this order, never reorder]
if (pathname === '/api/backup/restore/preview' && method === 'GET') {
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const user = await requireUser(req, res); if (!user) return;
  // throttle (writes only per 86-02 precedent; GET preview may mirror the history GET which skips it)
  if (!(await hasInstanceRole(user.id, CAP.RESTORE_USE))) {
    await auditBackupTask(user, 'restore_refused:restoreRoleRequired');
    return fail(res, 403, 'backupRoleRequired', 'You need a backup role to see that');
  }
  // runId regex-gated like taskId ([VERIFIED: server.js:8859]) before any row read (no oracle)
}
```

### Session revocation precedents (DR maps to a new global delete)
```js
// [VERIFIED: server.js:7346-7352] per-user "everyone else":
await db.run('delete from sessions where user_id = ? and token_hash != ?', [user.id, tokenHash]);
// [VERIFIED: server.js:10961-10963] CLI password reset — ALL of a user's sessions:
await db.run('delete from sessions where user_id = ?', [row.id]);
// DR (D-89-25) — new site, post-commit:
await db.run('delete from sessions'); // every session incl. initiator; requireUser then 401s everywhere
```
`push_subscriptions` rows persist; no push invalidation exists or is needed — session loss already gates all authed surfaces.

### Schema push (how 87/88 added tables — restore_runs/restore_lock follow it)
- Append DDL to server.js `SCHEMA` (backup_tasks/backup_runs at `[VERIFIED: server.js:749-800]`) AND a byte-identical twin to `db-adapter.mjs SQLITE_SCHEMA` (`[VERIFIED: db-adapter.mjs:423-463]`) — the mirror-sync test pins the pair; runSchema splits statements on `;\n` so comments must never end a line with a semicolon (`[VERIFIED: db-adapter.mjs:414-417, 508-515]`).
- Epoch-ms columns (`created_at`, `started_at`, `finished_at`, …) must be listed in `PG_EPOCH_COLUMNS` or pg stores them as int4-overflowing values (`[VERIFIED: db-adapter.mjs:469-485]`).
- Column additions to EXISTING tables go through `ensureColumn` (`[VERIFIED: server.js:888; db-adapter.mjs:937-949]`); CHECK widening needs the rebuild migration (`[VERIFIED: server.js:889-924]`).

### Client idioms (UI-SPEC mandated)
```js
// Type-to-confirm: [VERIFIED: src/overlays/modals.js:519-528]
confirmModal({ typeName: targetName /* or 'RESTORE-INSTANCE' */, danger: true, ok: t('page.restore.confirmOverwriteOk'), title, body });
// OK stays disabled until (S.ui.confirmText || '') === typeName — exact match, no error chrome on near-miss.
// Poll loop sibling: [VERIFIED: src/actions/actions.js:4784-4821] backupPollTick — 1s interval, kick-on-entry,
//   cooldown honored; the restore poll tick mirrors it against the restore_runs payload.
// Render-only stages: [VERIFIED: src/pages/backup.js:83-103] runProgress — stage badge + verbatim labels,
//   pending state aria-busy, no fabricated stage.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| In-memory run state (86-D-11) | persisted `backup_runs` rows (87-02 writer seam) | Phase 87 | restore_runs copies THIS pattern, not the 86 in-memory holder |
| local-only destination | local-first + S3 stream-back verify | Phase 88 | restore consumes `downloadToStaged`; key reconstruction deterministic |
| `backup_runs` status enum (5) | widened with `upload_failed` via rebuild migration | Phase 88 | the sanctioned path if 89 must widen any CHECK (Pitfall 5) |
| doc carries members/prefs/views | normalized out to tables | Phases 34-59 | restored doc fragments must be spliced post-normalization shapes only |

**Deprecated/outdated for this phase:** 89-CONTEXT's `files/<owner-dir>/<id>.<ext>` layout wording (Discovery 2) and the "tar streaming reads already in the codebase" reusable-asset claim (Discovery 3).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `zlib.createGunzip()` streaming + incremental 512-byte header reads are sufficient to locate/extract entry 0 without full unpack (memory-bounded) | Don't Hand-Roll / BKRST-01 | low — stdlib-stable; a golden round-trip test against 86-written archives pins it in Wave 0 |
| A2 | Uncommitted tx crashes roll back: SQLite via WAL recovery (journal_mode=wal, `[VERIFIED: db-adapter.mjs:927]`), pg via server-side abort on connection loss | Architecture Patterns | low — both engines' documented base behavior; the restore pin test (kill mid-tx) should still verify |
| A3 | `delete from sessions` immediately invalidates all auth (cookie → token_hash lookup miss) | Code Examples (DR) | low — sessions are the only auth store (cookie carries raw token, table the hash) |
| A4 | The DR phrase `RESTORE-INSTANCE` is validated SERVER-side too (client dialog is not a security boundary) | Security Domain | none if planner includes it; flagged so it isn't missed |
| A5 | Restored `workspaces.slug` needs uniqueness handling (`uniqueSlug` funnel) alongside the `-restored` NAME auto-counter of D-89-13 | BKRST-02 | medium — slug UNIQUE index exists (`[VERIFIED: db-adapter.mjs:466]`); planner must specify slug derivation for `-restored` names |

## Open Questions

1. **Per-run S3-uploaded flag (D-89-15 badge truthiness)**
   - What we know: run rows fold upload outcome into `status`; `s3_enabled` is mutable on the task row; the S3 key is reconstructible (`s3BackupKey`).
   - What's unclear: should 89 add an additive `uploaded`/`s3_key` column to `backup_runs` (ensureColumn, honest history) or derive eligibility heuristically?
   - Recommendation: prefer the additive column — it makes D-89-15's "honest dual-location" testable; one ensureColumn line + writer-seam event field.

2. **Where the `pre_restore` tag lives (D-89-5)**
   - What we know: `backup_runs.trigger` CHECK admits only manual/scheduled; the restore_runs row and audit trail CAN carry the tag + snapshot run id without touching backup_runs.
   - What's unclear: whether "run row carries the tag" means the snapshot's own backup_runs row (needs CHECK widening) or the restore_runs row that references it.
   - Recommendation: tag on the restore_runs row + audit actions (`restore_snapshot_started:pre_restore`); avoid the migration unless the owner wants the snapshot's history row self-describing.

3. **Overwrite memberships semantics vs user_id FK reality**
   - What we know: D-89-6 says overwrite = full data-table replacement; memberships are data rows referencing live users; archive user ids may not resolve (Pitfall 3).
   - What's unclear: does overwrite replace memberships (validating user_ids, skip+report unresolvable) or preserve live memberships?
   - Recommendation: replace-with-validation + skip report (consistent with D-89-7's report-everything posture); surface in the confirm dialog consequence text.

4. **Instance-scope DR vs `saved_views`/`user_notif_prefs`/`webhook_hooks` (row-shaped, workspace-keyed, but operational-classified)**
   - What we know: `saved_views`, `user_notif_prefs`, `webhook_hooks`, `webhook_deliveries`, `push_subscriptions` are workspace-keyed rows classified OPERATIONAL in the frozen `TABLES` (`[VERIFIED: export/backup.js:104-110]`) — DR skips them (except instance_roles), so a restored instance loses per-user views/prefs/webhooks.
   - What's unclear: is that the ratified DR meaning of "replaced by the archive's data tables"? (D-89-6/7/8 say yes — data tables only.)
   - Recommendation: plan states it explicitly in the DR consequence text (D-89-27 requires consequence honesty anyway). No schema change.

5. **Preview GET + throttle**
   - What we know: 86-02 throttled the POST trigger; the history GET skips throttle (read-only).
   - What's unclear: does the preview GET (which streams + hashes a potentially multi-GB archive) need an operator-keyed throttle to bound abuse?
   - Recommendation: yes — a loose throttle (e.g. 10/15min) keyed `restorepreview|<id>`, refusal keyed tooMany; cheap DoS bound (ASVS V4/V5 posture).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | everything | ✓ | v24.21.0 (`engines >=24`) | — |
| Docker | MinIO e2e tests | ✓ | 29.9.3 | — |
| MinIO (gr8r-minio-e2e) | S3 e2e (`MINIO_TEST_URL=http://127.0.0.1:9001`) | ✓ container up (3h) | pgsty/minio:latest | env-gated skip when absent |
| MinIO (gr8r-minio-smoke) | S3 smoke (`:9000`) | ✓ container up (6h) | pgsty/minio:latest | — |
| PostgreSQL | pg-matrix parity tests | ✗ (127.0.0.1:5432 closed, no pg container) | — | start per `test/pg-matrix.test.mjs` env-gating (`POSTGRES_TEST_URL`); tests skip when absent |
| Playwright | e2e specs | ✓ devDependency ^1.65.1 | — | skip (client source-assertion tests suffice for wiring) |

**Missing dependencies with no fallback:** none blocking (pg parity is env-gated by design).
**Missing dependencies with fallback:** local Postgres — start a container when running the dual-engine pin tests; the planner should schedule a `checkpoint:human-verify` or an explicit docker-run step for the PG parity wave.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` runner (Node 24 built-in), `--test-concurrency=2` |
| Config file | none — glob-driven via package.json `"test": "node --test --test-concurrency=2 test/*.test.mjs"` |
| Quick run command | `node --test test/restore-routes.test.mjs` (per-file) |
| Full suite command | `npm test` (includes lint-adjacent catalogue/parity/deps tests) |
| Harness | `test/helpers/server.mjs` — `startServer/login/signup/client/withDb` (`[VERIFIED: test/backup-routes.test.mjs:23-24]`) |
| Env-gated suites | `POSTGRES_TEST_URL` (pg parity), `MINIO_TEST_URL` (MinIO e2e) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BKRST-01 | list renders dual-location rows; preview streams manifest + sha256 re-verify; corrupt manifest keyed refusal | unit+route | `node --test test/restore-preview.test.mjs` | ❌ Wave 0 |
| BKRST-01 | S3-located preview via download seam (fetching stage) | route+MinIO e2e | `MINIO_TEST_URL=http://127.0.0.1:9001 node --test test/restore-s3-e2e.test.mjs` | ❌ Wave 0 |
| BKRST-02 | import-as-new workspace/project: remap totality pre-insert, `-restored`/`-restored-2` counter, restorer-only membership, one tx, skip report | unit+route | `node --test test/restore-import.test.mjs` | ❌ Wave 0 |
| BKRST-03 | overwrite: type-to-confirm server-side, automatic pre_restore snapshot via runExport, single tx, operational tables untouched | route | `node --test test/restore-overwrite.test.mjs` | ❌ Wave 0 |
| BKRST-04 | DR: Super-Admin-only, RESTORE-INSTANCE phrase, instance_roles rebuild (+ user_id validation), global session revocation post-commit, audit trail | route | `node --test test/restore-instance.test.mjs` | ❌ Wave 0 |
| D-89-31 | tx/lock parity both engines; stale restore_runs + lock release at boot | parity (env-gated) | `POSTGRES_TEST_URL=… node --test test/pg-matrix.test.mjs` (extended) | ❌ Wave 0 (extend) |
| D-89-33 | tar-reader path traversal + manifest injection refusals | unit (security) | `node --test test/restore-security.test.mjs` | ❌ Wave 0 |
| UI wiring | restore card/drawer/confirm render-only + esc() discipline, poll tick sibling | source-assertion | `node --test test/restore-client.test.mjs` (pattern: `test/backup-history-client.test.mjs`) | ❌ Wave 0 |
| Lock mutual exclusion | restore blocks export and vice versa (keyed backupRestoreInProgress / backupRunInProgress) | route | covered inside `test/restore-routes.test.mjs` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the task's touched test file (`node --test test/restore-*.test.mjs` relevant file)
- **Per wave merge:** `npm test`
- **Phase gate:** full suite green (incl. catalogue/locale parity + dependencies pin) before `/gsd-verify-work`; PG-parity + MinIO e2e green with env set at least once before ship

### Wave 0 Gaps
- [ ] `test/restore-preview.test.mjs` — BKRST-01 (golden round-trip vs 86-written archives included here or in a reader unit file)
- [ ] `test/restore-import.test.mjs` — BKRST-02
- [ ] `test/restore-overwrite.test.mjs` — BKRST-03
- [ ] `test/restore-instance.test.mjs` — BKRST-04
- [ ] `test/restore-security.test.mjs` — D-89-33 refusal pins (traversal, injection, escalation)
- [ ] `test/restore-client.test.mjs` — UI wiring source assertions
- [ ] extend `test/pg-matrix.test.mjs` — restore tx/lock parity pins
- [ ] `test/restore-s3-e2e.test.mjs` — MinIO download→restore e2e (env-gated)
- [ ] No framework install needed (node:test built-in)

## Security Domain

(security_enforcement absent from `.planning/config.json` → enabled. `workflow.nyquist_validation` absent → Validation Architecture included above.)

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `requireUser` on every restore route; DR post-commit session revocation strengthens it |
| V3 Session Management | yes | sessions = hashed tokens in `sessions` table; DR `delete from sessions` post-commit (D-89-25); no parallel-session grace |
| V4 Access Control | yes | `hasInstanceRole(userId, CAP.*)` funnel per route (D-89-21); Super-Admin short-circuit inside the funnel (`[VERIFIED: roles.js:65-74]`); ARCHIVE_READ stays ungranted (restore ≠ download authority, `[VERIFIED: roles.js:27, 35-41]`) |
| V5 Input Validation | yes | archive-supplied fields are untrusted input: table-name allow-list (`TABLES`), runId/taskId regex gates, entry-name allow-list before extraction, `normalizeDoc`-shape whitelisting for doc splices; parameterized SQL only |
| V6 Cryptography | yes | sha256 verification chain (per-table/per-file/whole-archive + sidecar + stream-back); no new crypto |
| V7 Error handling/Logging | yes | audit funnel on every refusal AND trigger; error strings sliced (`sliceError` 300-char idiom) before persistence |
| V14 Config | yes | S3 creds stay boot-frozen env consts; restore code reads `S3.config()` seam only |

### Known Threat Patterns for {restore stack} (seed for 89-SECURITY.md)

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Privilege escalation via crafted archive (instance_roles rows, memberships with elevated roles, doc member arrays) | Elevation of Privilege | selective restore never touches operational tables (D-89-7); DR instance_roles rebuild = Super-Admin-only + type-to-confirm + audited (D-89-8/27); doc splices whitelist shapes (normalizeDoc discipline); authority ALWAYS from live `hasInstanceRole` |
| Manifest/SQL injection via archive-supplied fields (table names, ids, names) | Tampering | frozen `TABLES` allow-list gate before any table-name interpolation (86 T-86-02 mirrored); parameterized statements only; id-format regex gates mirroring `[VERIFIED: server.js:8746, 8859]` |
| Path traversal via archived filenames (`../`, absolute, symlink targets) | Elevation of Privilege / Tampering | entry-name allow-list (`manifest.json` / `<table>.ndjson` / `files/<id>` / `logos/<name>`), `contained()` realpath discipline, `path.dirname(file) !== ROOT` guard style at every write root |
| DR instance_roles rebuild abuse (attacker-coaxed DR restoring attacker rows as admins) | Elevation of Privilege | D-89-8 mitigations + user_id validation against live users (skip+report — a crafted row referencing a non-live user can never resurrect an account) |
| Restore as a destructive vehicle (overwrite wipes live data) | Tampering / Repudiation | type-to-confirm exact-name server-revalidated, automatic pre_restore snapshot, one tx, full audit trail, operator-keyed throttle |
| DoS via oversized/Zip-bomb-style archives | Denial of Service | ustar size field validated per entry (the writer's own guard: `size > 0o77777777777` throws — reader mirrors); manifest declared counts vs extracted counts reconciled at verify stage (D-89-30); preview throttle |
| Concurrent restore/backup corruption | Tampering | restore_lock row claim + claimRun mutual refusal (D-89-1), stale-claim boot sweep |
| Secrets leakage via run errors (S3 error text) | Information Disclosure | `sliceError` 300-char discipline already in the seam (`[VERIFIED: export/s3.js:57-60]`); error fields persisted verbatim are rendered through esc() client-side |

**Contract:** 89-SECURITY.md follows the 85 pattern exactly (`[VERIFIED: .planning/phases/85-roles-foundation/85-SECURITY.md]` — trust boundaries table, threat register with T-89-xx ids + disposition + mitigation + test pin, accepted-risks log, threats_open gate in frontmatter).

## Sources

### Primary (HIGH confidence — all read this session)
- `export/backup.js` (full, 817 lines) — frozen format, TABLES, writer, staging, sweep, ustar writer
- `export/s3.js` (full, 630 lines) — SigV4, probe, `downloadToStaged`, upload executor
- `db-adapter.mjs` (full, 962 lines) — tx surface, pg variant schema, runSchema, ensureColumn, FTS in-tx sync
- `server.js` (targeted: 120-679 SCHEMA+consts, 1255-1318 normalizeDoc, 3400-3612 scheduler/writer/sweep/email gate, 5540-5619 funnel/throttle, 8330-8989 backup routes, 9115-9159 doc-PUT commit path, 10940-11020 boot wiring)
- `roles.js` (full, 74 lines); `src/pages/backup.js` (full, 355 lines); `src/overlays/modals.js:505-569`
- `test/backup-routes.test.mjs`, `test/backup-history-client.test.mjs`, `test/dependencies.test.mjs`, `test/build-locales.test.mjs` (headers/patterns)
- Planning docs: 89-CONTEXT.md, 89-UI-SPEC.md, REQUIREMENTS.md, STATE.md, ROADMAP §Phase 89, 85/86/87/88 CONTEXTs, 85-SECURITY.md

### Secondary (MEDIUM confidence)
- None needed — no external docs consumed; the format's authoritative spec is the in-repo writer + its golden round-trip test.

### Tertiary (LOW confidence)
- Environment probes (docker ps, port check) — point-in-time state, not durable facts.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero-dep project; every reused seam read in full
- Architecture: HIGH — doc-splice model derived directly from SCHEMA + emptyDoc; format read from the writer itself
- Pitfalls: HIGH — each pitfall cites the enforcing/preceding code; A1-A5 assumptions are stdlib-grade or planner-decision flags
- Test plan: HIGH — harness and env-gating conventions read from existing suites

**Research date:** 2026-11-22
**Valid until:** 2026-12-22 (stable — frozen format; re-verify only if 86/87/88 code changes)
