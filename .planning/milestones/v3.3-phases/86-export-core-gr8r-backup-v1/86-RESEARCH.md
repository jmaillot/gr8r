# Phase 86: Export Core ("gr8r backup v1") - Research

**Researched:** 2026-11-21
**Domain:** Logical backup archive export (tar+gz container, manifest, dual-engine snapshot, streaming pipeline) — Node stdlib only
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
(86-CONTEXT.md `<decisions>` — copied verbatim, binding for the planner)

**File collection per scope**
- **D-01:** Strict containment policy: instance scope = everything under DATA_DIR (files + logos); workspace scope = that workspace's member projects' files + its own logo; project scope = only that project's files. No cross-scope bleed. — **Reversibility:** costly — this policy is baked into the frozen manifest layout that Phases 87/88/89 consume; changing inclusion per scope changes what restore receives.
- **D-02:** Files are addressed inside the archive by their file id (mirroring the DB path: `files/<owner-dir>/<id>.<ext>`), matching the manifest's entity-addressable row ids — restore maps id→row directly.
- **D-03:** Logos follow the same collection policy as uploaded files for their owning scope (instance logos only in instance scope).
- **D-04:** Missing blob at export time (file row exists, blob dangling): record the file row in the manifest with a missing-blob flag, ship without it, run still succeeds; self-verification checks only what was collected.
- **D-05:** No orphan cleanup/dedup in v1 — export whatever file rows exist; dangling blobs ride along; restore re-links by id mapping.
- **D-06:** Path-slip defense: any collected path resolving outside the collector root (symlink escape) is skipped and flagged in the manifest — never followed.

**Run UX & destination**
- **D-07:** Background run + poll: trigger returns a run id immediately; the Backup page polls status through stages (collecting → archiving → verifying → done|failed). A long instance export cannot hold an HTTP request open.
- **D-08:** Completed archives land in `DATA_DIR/backups/` — the single directory Phase 87's scheduler and rotation also use. Not env-configurable in v1.
- **D-09:** Backup page in this phase: D-20 empty state replaced by a Run now card (scope picker) + run progress. No download endpoint — archives sit server-side until Phase 90's download tiering.
- **D-10:** Concurrent runs refused with a keyed error (backupRunInProgress) — one export at a time; Phase 87's overlap rule starts from this.
- **D-11:** Run state is in-memory only in v1 — crash clears it, page shows no active run. Persisted run history is Phase 87's runs table.
- **D-12:** Progress reporting is coarse stages only (no per-table counts).
- **D-13:** No cancel action in v1; SIGTERM/crash leaves staging to the boot-time sweep (roadmap crash-hygiene flag resolves the sweep at plan time).
- **D-14:** Archive filename encodes scope + timestamp: `backup-<scope-kind>-<scope-id>-<YYYYMMDD-HHMMSS>.tar.gz`.
- **D-15:** Failed runs leave nothing behind — partial staging removed; only verified archives occupy DATA_DIR/backups.

**Trigger API shape**
- **D-16:** New `/api/backup/runs` route family: `POST /api/backup/runs` (trigger, returns run id) + `GET /api/backup/runs/current` (status). The Phase 85 `POST /api/backup/tasks` stub keeps refusing `backupNotConfigured` until Phase 87 gives tasks real meaning. — **Reversibility:** one-way — this is the frozen API surface Phase 87's history and Phase 88's destinations build on.
- **D-17:** Trigger body: `{ scope: { kind: 'project'|'workspace'|'instance', id? } }` (id omitted for instance). Server validates scope existence with the Phase 85 keyed refusal vocabulary.
- **D-18:** Run ids are UUIDs — unguessable, no enumeration surface.
- **D-19:** Status payload is complete: scope, stage, startedAt, and on completion the archive filename + whole-archive sha256. One endpoint, no split detail route.
- **D-20:** Refused trigger attempts (wrong role, concurrent run, bad scope) write audit_log rows — export attempts are on the trail from day one.
- **D-21:** POST /api/backup/runs is throttled like grant/revoke: operator-keyed tooMany, consuming a try even on refusal.
- **D-22:** Non-holders polling status get the same keyed `backupRoleRequired` 403 as the tasks GET.
- **D-23:** No MCP mirror of the run endpoints in v1 (already flagged as the restore-phase gap decision).

### the agent's Discretion
Manifest JSON field layout (beyond the frozen facts: formatVersion 1, scope {kind,id}, entity-addressable row ids, table classification, three checksum levels), NDJSON row serialization details, module file layout for the exporter, staging directory naming — all open, recommend conservative shapes.

### Deferred Ideas (OUT OF SCOPE)
- Download/verify-checksum UI for archives — Phase 90 (tiered download action)
- Configurable backup destination directory (env BACKUP_DIR) — revisit at Phase 88
- Persisted run history / run detail records — Phase 87 (runs table)
- Archive cancellation action — candidate for Phase 87
- MCP backup endpoints — Phase 89 restore-phase gap decision
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BKBCK-01 | Backup Operator exports a project/workspace/full instance as a logical archive (DB rows + scope's files, versioned manifest, per-table/per-file/whole-archive sha256), consistently on SQLite and Postgres, with manifest self-verification failing the run on mismatch | Dual-engine snapshot patterns (§Snapshot Parity), manifest/self-verify pipeline (§Architecture Patterns), stdlib tar/gzip streaming (§Standard Stack), file-id→scope mapping verified (§Research Flags) |
</phase_requirements>

## Project Constraints (from AGENTS.md)

No `./AGENTS.md` or `./CLAUDE.md` in this repo. Binding project constraints come from STATE.md instead:
- **D-33-11: zero new npm dependencies** — tar, gzip, hashing all hand-rolled on Node stdlib. No package installs in this phase; Package Legitimacy Audit is trivially "none".
- **5-locale keyed refusals land in the same commit as the first emitting gate** (en/fr/nl/de/es — `src/locales/*.json`, `err.<code>` keys).
- **Dual-mirror convention + pin tests** — any dual-engine behavior must be pinned for both SQLite and pg.
- **In-memory state modules with keyed A.* actions** — the run-state holder follows the same shape (85-CONTEXT reusable-assets note).
- `export/` modules must stay server-only (never under `src/` — the prohibition test enforces it; see export/mspdi.js header comment [VERIFIED: export/mspdi.js:7-9]).

## Summary

Phase 86 is a single new engineering surface: a background export run that snapshots the database consistently, walks the scope's file set, streams a hand-rolled ustar+gzip archive to a staged temp directory, verifies manifest hashes, and atomically renames into `DATA_DIR/backups/`. The codebase already contains every primitive needed: a dual-engine DB facade with a `sqliteOnly` seam and checked-out-client pg transactions (`db-adapter.mjs`), a Phase 85 route-guard chain and keyed refusal vocabulary to copy verbatim, an in-memory run-state precedent, and prior streaming-writer modules in `export/`. Zero npm dependencies is a hard constraint, so the tar writer (~150 lines of ustar header math) is the only genuinely new low-level code — and the research flags (ustar size field limits, long-path handling) are resolved below.

Two structural facts drive the architecture. **First**, the manifest is tar entry 0 but must carry per-table/per-file sha256 — hashes that are only known after rows/files are streamed — so the pipeline must be two-pass over staged artifacts: dump NDJSON rows and file copies to `DATA_DIR/tmp/backup-<runId>/` first, hash them, then tar from the staged bytes with the manifest written as entry 0. This also keeps memory bounded (~65 MiB budget) because nothing but small buffers ever sits in RAM. **Second**, the "manifest carries whole-archive sha256" wording in the success criterion is self-referential (a stream-ordered entry 0 cannot contain the hash of bytes that include it) — the canonical checksum statement (frozen cross-phase decision) must disambiguate this at plan time (§Open Questions 1).

**Primary recommendation:** One exporter module (`export/backup.js`, server-only) + a small in-memory run-state module + the `/api/backup/runs` route pair copying the Phase 85 guard chain; two-pass staged pipeline (`collect` → `tar` → `verify` → atomic rename), SQLite via `wal_checkpoint` + `VACUUM INTO` snapshot reads, Postgres via a checked-out client on `REPEATABLE READ, READ ONLY`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Run lifecycle (trigger/status/concurrency) | API / Backend | — | Run ids, keyed refusals, throttle, audit — all server state |
| DB snapshot fence | Database / Storage | API | SQLite pragmas + `VACUUM INTO`; pg checked-out client transaction |
| Row serialization (NDJSON) | API / Backend | — | Streams through the adapter facade; dialect differences already neutralized there |
| File collection (scope containment, D-01) | API / Backend | Filesystem | Reads doc JSON (`data.files`, `data.logo`) + DATA_DIR walk |
| tar+gzip container writer | API / Backend | — | Hand-rolled ustar on stdlib; server-only module |
| Manifest + self-verification | API / Backend | — | sha256 over staged bytes; fail-closed before rename |
| Run-state holder | API / Backend | — | In-memory module (D-11), keyed A.* actions per house pattern |
| Run now card + progress | Browser / Client | — | Backup page renders only from payloads; render-only flags (D-23/85 doctrine) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:sqlite` (DatabaseSync) | Node v24.21.0 [VERIFIED: shell `node --version`] | SQLite backend + `VACUUM INTO` snapshot | Existing default backend [VERIFIED: db-adapter.mjs:19, 865-870] |
| `pg` (dynamic import) | already in lockfile | Postgres backend, checked-out client transactions | Adapter owns it; Phase 45 pattern [VERIFIED: db-adapter.mjs:826-845, 505-525] |
| `node:zlib` (createGzip) | stdlib | streaming gzip | Zero-dep constraint; `zlib` already imported in server.js [VERIFIED: server.js:12] |
| `node:crypto` (createHash sha256, randomUUID) | stdlib | three-level checksums + UUID run ids | `crypto` already imported [VERIFIED: server.js:11] |
| `node:fs` / `node:path` | stdlib | staging dir, atomic rename, containment walk | — |

**Hand-rolled (D-33-11 — deliberate, not hand-roll-avoidable):**

| Component | Effort | Notes |
|-----------|--------|-------|
| ustar tar writer | ~120-180 lines | 512-byte header blocks, octal fields, prefix split; see §Research Flags 1 for the size-math resolution |
| NDJSON row dumper | ~40 lines | `JSON.stringify(row) + '\n'` per row through the adapter; paginate, never `all()` a whole table |
| Run-state module | ~60 lines | mirrors Phase 85 in-memory module shape with keyed actions |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled ustar | `tar` npm package | FORBIDDEN by D-33-11 (zero new deps); scope of tar needed (headers + regular files only) is small |
| GNU `tar` CLI spawn | stdlib writer | A `tar` binary is not guaranteed in the container runtime; stdlib writer is deterministic and testable — also matches the "hand-rolled on Node stdlib" wording of D-33-11 |
| pax format | ustar | ustar suffices: our filenames are manifest-controlled ASCII ids/paths; pax adds complexity for nothing |

## Package Legitimacy Audit

**No external packages are installed in this phase** (D-33-11: zero new npm dependencies). The registry check is trivially satisfied: none required.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
POST /api/backup/runs {scope}
        │  (sameOrigin → requireUser → tooMany(D-21) → CAP.BACKUP_MANAGE →
        │   scope validate → backupRunInProgress check → audit_log write)
        ▼
  run id (UUID) ──► in-memory run-state holder {stage: collecting}
        │                                   ▲
        │  fire-and-forget async            │ GET /api/backup/runs/current polls
        ▼                                   │
┌─────────────────── EXPORT RUN ──────────────────────────────────────┐
│ 1. SNAPSHOT FENCE                                                   │
│    sqlite: wal_checkpoint(TRUNCATE) → VACUUM INTO tmp/snapshot.db   │
│            → open snapshot read-only, all row reads come from it    │
│    pg:     pool.connect() → BEGIN ISOLATION LEVEL REPEATABLE READ   │
│            READ ONLY → all reads on this client → commit+release    │
│ 2. COLLECT (stage: collecting)                                      │
│    a. rows: per data-table, paginate the snapshot → NDJSON in       │
│       tmp/backup-<runId>/<table>.ndjson                             │
│    b. files: doc data.files[] by scope policy (D-01) → copy blob    │
│       into tmp/.../files/<id>  (missing blob → manifest flag D-04;  │
│       symlink escape → skip+flag D-06)                              │
│    c. logos per D-03 from doc data.logo                             │
│ 3. HASH (still collecting)                                          │
│    sha256 each staged ndjson/file (streamed read)                   │
│ 4. TAR (stage: archiving)                                           │
│    entry 0: manifest.json (formatVersion, scope, tables, files,     │
│             classification, per-table/per-file sha256)              │
│    then table entries + file entries → zlib.createGzip →            │
│    tmp/backup-<runId>/archive.tar.gz                                │
│ 5. VERIFY (stage: verifying)                                        │
│    manifest self-verification: recompute entry hashes vs manifest;  │
│    any mismatch → FAILED, delete staging (D-15)                     │
│ 6. finalize: sha256 of final archive bytes (once, canonical stmt)   │
│    → atomic fs.rename → DATA_DIR/backups/backup-<kind>-<id>-<ts>    │
│      .tar.gz → run {stage: done, filename, sha256}                  │
│  error anywhere → cleanup tmp/backup-<runId> → stage: failed        │
└─────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
export/backup.js        # ustar writer + export pipeline (server-only, no src/)
backup-run-state.js     # in-memory run holder (or merged into export/backup.js — planner's call)
server.js               # /api/backup/runs routes + boot sweep + shutdown hook
src/pages/backup.js     # Run now card + progress (replaces D-20 empty state)
src/actions/actions.js  # triggerBackupRun / pollBackupRun behind api.js call()
src/locales/*.json      # err.backupRunInProgress + any new refusals, 5 locales, same commit
test/backup-export.test.mjs   # pipeline + format pins
test/backup-routes.test.mjs   # gate/refusal/concurrency pins
```

### Pattern 1: Two-pass staged pipeline (why staging exists)
**What:** NDJSON dumps and file copies land as real staged files before any tar byte is written, because tar entry 0 (the manifest) needs hashes of later entries.
**When to use:** always — this is the memory-bound (success criterion 4) and manifest-first design.
**Key detail:** hashing streams (`fs.createReadStream().pipe(hash)`) — never `readFile` a whole table dump. Whole-table `all()` calls are the one realistic OOM vector in this codebase's idiom; paginate (`select … where rowid > ? order by rowid limit N` SQLite / `where id > ?` pg) or iterate.

### Pattern 2: Dual-engine snapshot fence (one code path, two fence bodies)
**What:** The row-reading code is identical on both engines; only the fence differs.
**When to use:** every snapshot read in step 1-2.
**Example (pg fence — checked-out client, never pool.query('BEGIN')):**
```js
// Source: db-adapter.mjs:503-525 (existing pgTx precedent); export uses its own client
const client = await pool.connect();
try {
  await client.query('begin isolation level repeatable read read only');
  const scope = { all: (sql, p) => client.query(pgRewrite(sql), p).then(r => r.rows) };
  /* ... row dump through scope ... */
  await client.query('commit');
} finally { client.release(); }
```
`db-adapter.mjs` already exports `backendKind`, `tx`, `get/all/run` and the `sqliteOnly(fn, label)` seam [VERIFIED: db-adapter.mjs:32, 801-810] — the exporter branches on `backendKind` for the fence, then consumes the adapter facade (or its own scoped reads) identically.

**SQLite fence:** `wal_checkpoint(TRUNCATE)` then `VACUUM INTO '<tmp>/snapshot.db'` — the exact idiom already used ten times in server.js's `--backup`/CLI paths [VERIFIED: server.js:3804, 3882, 3957, 4006, 4162, 4257, 4365, 4537] — then open the snapshot file with `new DatabaseSync(path, { readOnly: true })` (node:sqlite supports `readOnly`; [ASSUMED] open-flag name — planner verifies against Node 24 docs during plan).

### Pattern 3: Route guard chain (copy verbatim)
**What:** `sameOrigin → requireUser → throttle → capability gate → scope lookup → action`, keyed refusals via `fail(res, status, code, message)`.
**Example:**
```js
// Source: server.js:7747-7800 (Phase 85 backup stubs — copy this chain)
if (pathname === '/api/backup/runs' && method === 'POST') {
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const user = await requireUser(req, res); if (!user) return;
  if (tooMany(`backuprun|${user.id}`, ...)) return fail(res, 429, 'tooManyAttempts', '...'); // D-21
  if (!(await hasInstanceRole(user.id, CAP.BACKUP_MANAGE)))
    return fail(res, 403, 'backupManageRequired', 'Only a Backup Operator can run exports');
  /* scope validate (D-17) → backupRunInProgress (D-10) → audit_log row (D-20) → start run */
}
```
Helpers verified: `fail` server.js:4846, `json` :4832, `readJson` :5130, `tooMany(key,max,windowMs)` :5076, `clientIp` :4905, `hasInstanceRole` :5018 [VERIFIED: server.js]. `CAP` constants live in roles.js:24-29; export gate is `CAP.BACKUP_MANAGE` (`backup_operator` role + Super-Admin short-circuit via `capabilitiesFor`) [VERIFIED: roles.js:24-41, 65-74].

### Pattern 4: In-memory run state (D-11)
**What:** A module-level holder with keyed actions, matching the Phase 85 pattern (85-CONTEXT "Established Patterns"). Single-run invariant enforced by a module-level boolean/run-id, not by scanning.
**Key detail:** every stage transition mutates state synchronously; the trigger route checks-then-sets atomically (Node single-threaded async — set the "claimed" flag before the first await).

### Anti-Patterns to Avoid
- **`all()` on a whole table** — loads entire tables into memory; paginate row dumps.
- **Building the tar in one Buffer** — must stream through `zlib.createGzip` into a write stream; only 512-byte header blocks and small chunk buffers in RAM.
- **Trusting path join for containment** — collector must `fs.realpathSync` (or `path.resolve` + prefix check) each candidate against the collector root and skip on escape (D-06); this is a symlink-escape defense, security-relevant.
- **`pool.query('BEGIN …')` on pg** — documented pg pitfall; use a checked-out client (db-adapter.mjs:503-504 pins this).
- **Deleting staging in a fire-and-forget promise without `unref`-safe tracking** — see crash hygiene below.
- **Rendering run state client-side** — Backup page renders only from `/api/backup/runs/current` payload (85 doctrine D-23).

## Research Flags (roadmap items resolved here)

### Flag 1: ustar size math — RESOLVED
[ASSUMED — standard ustar (POSIX 1003.1-1988) header layout from training knowledge; planner pins a golden-header byte test to lock it]
- Header: 512-byte blocks; `name` 100, `mode` 8, `uid` 8, `gid` 8, `size` **12 bytes octal** (11 digits + NUL) → max regular-file size **8 GiB − 1**; `mtime` 12, `chksum` 8, `typeflag` 1, `linkname` 100, `magic "ustar\0"` 6, `version "00"` 2, `uname` 32, `gname` 32, `devmajor` 8, `devminor` 8, `prefix` 155, pad 12.
- **Size field is sufficient**: gr8r file blobs and NDJSON dumps are realistically ≪ 8 GiB per entry; the writer should still fail-closed (keyed error → run failed) if a single staged file exceeds 0o77777777777 rather than silently corrupting.
- **Long paths:** `name` holds ≤100 chars; paths with a `/` are split into `prefix` (155) + `name` (100). Archive paths here are manifest-controlled (`<table>.ndjson`, `files/<id>`, `logos/<file>`) so plain ustar always suffices — **do not** implement pax/GNU-`L` longname extension in v1; refuse >255-char composite paths (can't occur with id-shaped names; fail-closed anyway).

### Flag 2: file-id → workspace/project mapping — RESOLVED (exists)
- Uploaded files are flat blobs at `DATA_DIR/files/<id>` (id = `uid()`, no owner subdir) [VERIFIED: server.js:126-127, 9318-9326 `handleUpload`].
- The **metadata record lives in the workspace document**: `JSON.parse(ws.doc).data.files` is an array of `{ id, project?, task?, … }`; `serveFileBinary` finds records by `data.files.find(f => f?.id === id)` [VERIFIED: server.js:9516-9522]; a record without `project` is a workspace-level attachment [VERIFIED: server.js:9524-9528 comment]. Deleted-file doc updates unlink the blob by id [VERIFIED: server.js:7971-7972, 8052-8054].
- Workspace logos ride the doc too: `data.logo` (docLogo) [VERIFIED: server.js:9368, 1065-1068], blobs at `DATA_DIR/logos/<file>` [VERIFIED: server.js:131, 9390].
- **Consequence for D-02:** the "DB path" for files is the doc, so archive addressing `files/<id>` maps back to `data.files[].id` directly. **But note:** D-02's `files/<owner-dir>/<id>.<ext>` wording does not match the real flat layout (`FILES_DIR/<id>`, extension-less) — the planner should freeze the archive path as `files/<id>` (flat, as stored) and record `data.files` fields (name/ext if present in the record) in the manifest so restore can restore usable filenames. This is a plan-time manifest-schema decision within the agent's discretion.
- **Instance scope (D-01)** = whole `DATA_DIR` walk (`files/`, `logos/`, plus any other dirs under DATA_DIR) — no doc mapping needed; containment by realpath under DATA_DIR.

### Flag 3: SIGTERM / crash hygiene — RESOLVED (sites identified)
- `process.on('SIGTERM'/'SIGINT', shutdown)` already exists [VERIFIED: server.js:10034-10035]. The plan must add: (a) on shutdown, if a run is active, mark it failed and `rm -rf` the staging dir (best-effort; in-memory state dies anyway per D-11); (b) **boot-time sweep**: on server start, remove any `DATA_DIR/tmp/backup-*` directories (orphans from a crash — D-13/roadmap flag). D-08 fixes `DATA_DIR/backups/`; staging home `DATA_DIR/tmp/` is new — planner confirms nothing else writes there.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQL dialect rewriting | own pg rewrite layer | adapter `get/all/run/tx` + `toPgSql` | already handles `?→$n`, conflict targets, nocase, bigint epochs [VERIFIED: db-adapter.mjs:76-139, 416-446] |
| Transaction discipline | ad-hoc BEGIN/COMMIT | `db.tx(fn)` or checked-out client per pattern 2 | Pitfall 2 pinned in adapter comments |
| Refusal vocabulary | new error channel | `fail()` + 5-locale `err.<code>` | error-codes.test.mjs / i18n-scan enforce parity |
| Capability gating | role-string checks | `hasInstanceRole(userId, CAP.BACKUP_MANAGE)` | roles.js funnel, Super-Admin implicit membership |
| Checksums | custom hash loop | `crypto.createHash('sha256')` streamed | stdlib, incremental |
| Audit trail writes | separate logging | same-tx `audit_log` write (grant/revoke pattern) | D-20 |
| Throttle | custom limiter | `tooMany()` | existing keyed limiter |

**Key insight:** the only genuinely new code is the ustar writer and the pipeline choreography — everything else is existing infrastructure to be consumed through its established seams.

## Runtime State Inventory

Not a rename/refactor phase — but a filesystem-writer phase, so the relevant inventory:
- **Stored data:** none modified — export is read-only against the live DB (snapshot fence) and read-only against FILES_DIR/LOGOS_DIR.
- **Live service config:** none.
- **OS-registered state:** none.
- **Secrets/env vars:** none new (D-08 forbids env-configurable destination; DB_PATH/DB_URL/DATA_DIR already exist).
- **Build artifacts / filesystem side effects:** new dirs at runtime: `DATA_DIR/backups/`, `DATA_DIR/tmp/backup-<runId>/` — created with `mkdirSync recursive`; boot sweep owns tmp cleanup; partial staging removed on failure (D-15).

## Common Pitfalls

### Pitfall 1: Self-referential archive checksum
**What goes wrong:** success criterion 2 asks the manifest (entry 0) to carry the whole-archive sha256 — impossible: the manifest's own bytes are inside the archive whose hash it would carry.
**Avoid:** split the checksum levels by location — manifest entry 0 carries per-table + per-file sha256; the **whole-archive sha256** is computed once over the final destination bytes after atomic rename (the canonical statement, frozen decision) and surfaces in the status payload (D-19) and, if required, in a `<archive>.sha256` sidecar next to the tar. Planner + user confirm the sidecar question (Open Question 1).

### Pitfall 2: Manifest-before-hashes ordering
**What goes wrong:** writing tar sequentially means entry 0 is written first, before table/file hashes exist.
**Avoid:** the two-pass staged pipeline (Pattern 1) — hash staged artifacts, then tar with manifest first. Never "patch" the manifest bytes post-hoc inside the gzip stream (gzip + sha256 makes in-place patching impossible).

### Pitfall 3: SQLite snapshot fence subtleties
**What goes wrong:** reading the live DB without a fence yields torn reads (mid-write doc JSON); `VACUUM INTO` alone without checkpoint can miss WAL content (actually `VACUUM INTO` reads consistent data, but checkpointing first shrinks the snapshot and is the codebase's established idiom).
**Avoid:** follow the existing `--backup` idiom verbatim; open the snapshot `readOnly`; never `VACUUM INTO` onto an existing path (SQLite errors if the target file exists — delete staging first). [ASSUMED for the existing-target behavior — verify at plan.]

### Pitfall 4: pg snapshot lifetime
**What goes wrong:** holding the REPEATABLE READ client open while streaming huge files bloats pg's snapshot xmin (vacuum stall).
**Avoid:** dump **rows only** inside the pg transaction; copy files after commit (files aren't transactional anyway — D-04 missing-blob handling already tolerates drift). Keep the pg fence scoped to the NDJSON phase.

### Pitfall 5: Concurrency claim race
**What goes wrong:** `if (!activeRun) { await something; activeRun = run }` — two triggers interleave on the await and both start.
**Avoid:** claim synchronously (set run state + id before the first `await` in the POST handler); the single-process Node model makes that atomic.

### Pitfall 6: Atomic rename across devices
**What goes wrong:** `fs.rename` fails `EXDEV` if staging and destination live on different filesystems.
**Avoid:** staging under `DATA_DIR/tmp/` and destination `DATA_DIR/backups/` — same tree by construction (D-08). Never stage outside DATA_DIR.

### Pitfall 7: gzip stream swallowed errors
**What goes wrong:** an unawaited pipe error leaves a truncated `.tar.gz` that then "succeeds".
**Avoid:** pipeline via `stream.pipeline` (propagates errors, cleans up streams) and treat any error as run FAILED + staging cleanup (D-15). Verify by hashing the final file, which also catches truncation.

### Pitfall 8: Audit-log + i18n same-commit rule
**What goes wrong:** adding `err.backupRunInProgress` without the 5 locale keys fails the build/i18n-scan.
**Avoid:** every new refusal code lands with all of en/fr/nl/de/es in the same commit (standing constraint).

## Code Examples

### NDJSON table dump (paginated, both engines)
```js
// Adapter facade keeps one code path; the fence client (pg) or snapshot db (SQLite)
// supplies `read` shaped like all().
async function dumpTable(name, read, out) {
  const hash = crypto.createHash('sha256');
  const stream = fs.createWriteStream(out);
  let cursor = null, rows;
  do {
    rows = cursor === null
      ? await read(`select * from ${name} limit ?`, [PAGE])
      : await read(`select * from ${name} where rowid > ? order by rowid limit ?`, [cursor, PAGE]); // SQLite; pg: keyset on pk
    for (const r of rows) { /* stream.write(JSON.stringify(r) + '\n') with backpressure handling */ }
    // advance cursor on last pk/rowid
  } while (rows.length === PAGE);
}
```
**Note:** table-name interpolation is safe only against a **frozen allow-list** of table names (see classification below) — never interpolate user input into SQL.

### ustar header write (core of the hand-rolled writer)
```js
// [ASSUMED — golden-byte test in Wave 0 must pin this against `tar tzf` reality]
function ustarHeader({ name, size, mtime }) {
  const buf = Buffer.alloc(512);
  // name/prefix split per Flag 1; octal fields are zero-padded ASCII
  buf.write(name.slice(0, 100), 0, 100, 'ascii');
  buf.write('0000644\0', 100, 8, 'ascii');        // mode
  buf.write(size.toString(8).padStart(11, '0') + '\0', 124, 12, 'ascii');
  buf.write(Math.floor(mtime / 1000).toString(8).padStart(11, '0') + '\0', 136, 12, 'ascii');
  buf.write('0', 156, 1, 'ascii');                // typeflag: regular file
  buf.write('ustar\0', 257, 6, 'ascii');
  buf.write('00', 263, 2, 'ascii');
  // chksum: sum of header bytes with chksum field treated as spaces, 6-octal + \0 + ' '
  return buf;
}
```
Verification contract for the plan: `tar tzf` + `tar xzf` must round-trip the archive on the host (success criterion 1: "inspectable with `tar tzf`") — a Wave-0 golden test produces a tiny archive fixture and asserts round-trip.

### Trigger route skeleton
```js
// D-16/D-17/D-21/D-22: POST triggers, GET polls; guard chain from Pattern 3
const scopeRefusal = validateScope(body?.scope); // kind allow-list + id existence per D-17
if (scopeRefusal) return fail(res, 400, scopeRefusal.code, scopeRefusal.message);
```

## Table Classification (data vs operational) — proposal to freeze

The pg-matrix test names "the 14 server.js tables" [VERIFIED: test/pg-matrix.test.mjs:37 comment]; the SCHEMA block is server.js:324+. [ASSUMED from SCHEMA + D-33-10 — planner pins the exact list against server.js SCHEMA with a Read before locking:]

| Classification | Tables | Basis |
|----------------|--------|-------|
| **data** | `workspaces` (incl. `doc` — tasks/projects/files records), `memberships` | the workspace payload is the product's data; restore (D-33-2) imports these |
| **operational** | `users`, `totp_factors`, `oidc_identities`, `sessions`, `login_challenges`, `recovery_codes`, `security_log`, `audit_log`, `reminders_sent`, `user_notif_prefs`, `push_subscriptions`, `saved_views`, `api_keys`, `webhook_hooks`, `webhook_deliveries`, `email_outbox`, `group_mappings`, `instance_roles` (+ future `backup_tasks`, `fts_meta`, `task_search_projection`/`task_fts`) | D-33-10: "operational tables (users, instance_roles, sessions, backup_tasks) are never selectively restored" |

**Open nuance for the planner:** D-33-10 lists `users` as operational (not restored), yet restore-as-new needs workspace doc ids to resolve — the manifest must still **record** operational tables' classification even if restore v1 (D-33-2 import-as-new) skips or re-maps them. Recommendation: ship ALL tables' rows in the archive (cheap, complete, classification-tagged), let Phase 89 decide what restore consumes. This matches BKBCK-01's "logical archive of DB rows" without narrowing future restore options. Confirm with user at plan (Open Question 2).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| node:sqlite experimental | Stable DatabaseSync in Node 22/24 | Node 22 LTS / 24 | already the project default; no risk |
| pg per-query reads | checked-out client transactions | project Phase 45 | adapter pattern pinned |

**Deprecated/outdated:** none relevant — the stack is pinned Node stdlib.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | ustar header layout/offsets and 12-octal size field | Research Flags 1, Code Examples | tar tool refuses to read archives — caught by golden round-trip test in Wave 0 |
| A2 | `new DatabaseSync(path, { readOnly: true })` flag name in Node 24 | Pattern 2 | plan verifies against node:sqlite docs; trivial fallback: open normally, only read |
| A3 | `VACUUM INTO` errors if target file already exists | Pitfall 3 | plan verifies; harmless (staging is always fresh) |
| A4 | Table classification list (data = workspaces + memberships only) | Table Classification | wrong classification bakes into frozen manifest — must be user-confirmed at plan (Open Question 2) |
| A5 | pg accepts `begin isolation level repeatable read read only` as one statement | Pattern 2 | plan verifies against live pg in the pg-matrix opt-in test |
| A6 | Archive path `files/<id>` flat (D-02 wording mismatch) | Research Flags 2 | manifest schema decision — needs planner/user confirmation since D-02 is marked costly-reversible |

## Open Questions (RESOLVED at plan time)

1. **Whole-archive sha256 location (Pitfall 1).** RESOLVED — canonical statement frozen in 86-01-PLAN.md: sha256 of final destination bytes computed once after atomic rename, recorded in run status payload (D-19) + `.sha256` sidecar, never manifest entry 0. See 86-01 flagged_assumptions #2.
2. **Ship-all-tables vs data-tables-only in the archive.** RESOLVED — all 22 tables shipped, classification-tagged (data vs operational), frozen in 86-01-PLAN.md manifest schema (flagged_assumptions #2/#4).
3. **Exact operational table list.** RESOLVED — planner read server.js SCHEMA (server.js:325–669) and pinned the 22-table list verbatim in 86-01-PLAN.md `<context>` (research's 14-table proposal missed `team_members` and `invites`).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | everything | ✓ | v24.21.0 | — |
| `node:sqlite` | SQLite snapshot | ✓ (default backend) | Node 24 built-in | — |
| `pg` driver | Postgres runs | ✓ (in lockfile, dynamic import) | lockfile | SQLite-only fallback is NOT allowed (dual-engine is a success criterion) |
| Live Postgres for tests | pg-matrix pin test | opt-in (`POSTGRES_TEST_URL`) | pg-matrix.test.mjs runbook: docker postgres:17-alpine on :5433 | test skips (exit 0) without the env var — accepted project pattern [VERIFIED: test/pg-matrix.test.mjs:1-24] |
| system `tar` (test only) | `tar tzf` inspectability criterion | ✓ (host tool) | — | golden-byte header test if absent |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none (Postgres test availability is opt-in by project convention, not blocking).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` (Node 24 built-in), `node --test --test-concurrency=2 test/*.test.mjs` [VERIFIED: package.json:19] |
| Config file | none — convention over config |
| Quick run command | `node --test test/backup-export.test.mjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BKBCK-01 | ustar round-trip (`tar xzf` reads a produced fixture) | unit | `node --test test/backup-export.test.mjs` | ❌ Wave 0 |
| BKBCK-01 | scope containment (project vs workspace vs instance file sets; D-01) | unit | same file | ❌ Wave 0 |
| BKBCK-01 | manifest self-verification fails the run on a corrupted staged byte | unit | same file | ❌ Wave 0 |
| BKBCK-01 | SQLite snapshot fence (VACUUM INTO + readOnly reads) | unit | same file | ❌ Wave 0 |
| BKBCK-01 | pg parity (fence + identical archive on pg) | integration, opt-in | `POSTGRES_TEST_URL=… node --test test/pg-matrix.test.mjs` (extend or add backup case) | ❌ Wave 0 (extend existing matrix) |
| BKBCK-01 | routes: gate order, keyed refusals, concurrency refusal, throttle, audit rows | unit | `node --test test/backup-routes.test.mjs` | ❌ Wave 0 |
| BKBCK-01 | 5-locale refusal parity | unit (i18n-scan + existing patterns) | `npm test` | existing infra |

### Sampling Rate
- **Per task commit:** quick run of the touched test file
- **Per wave merge:** `npm test`
- **Phase gate:** full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/backup-export.test.mjs` — pipeline, format, verification pins
- [ ] `test/backup-routes.test.mjs` — route/refusal/concurrency pins
- [ ] golden ustar fixture (tiny archive asserted to round-trip through `tar`)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V4 Access Control | yes | `hasInstanceRole(userId, CAP.BACKUP_MANAGE)` on both routes; Super-Admin short-circuit via capabilitiesFor |
| V5 Input Validation | yes | scope kind allow-list + id existence check (D-17); table-name frozen allow-list before any SQL interpolation |
| V7 Error Handling | yes | keyed `fail()` refusals, no internals leaked; D-22 same 403 for non-holder polling |
| V9 Communications | n/a | localhost routes behind sameOrigin guard, already enforced |
| V6 Cryptography | yes (hashing only) | sha256 via node:crypto; no new crypto design |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Symlink escape from DATA_DIR into arbitrary filesystem (D-06) | Information Disclosure / Tampering | realpath containment check per collected path; skip + manifest flag; never follow |
| Existence oracle via scope ids | Information Disclosure | keyed uniform refusals (scopeNotFound vs role refusals distinguished per Phase 85 vocabulary); UUID run ids (D-18) |
| Sensitive operational data in archives (password hashes, TOTP secrets, sessions, api_keys) | Information Disclosure | ships only inside archives that require BACKUP_MANAGE to create and (Phase 90) ARCHIVE_READ to download; classification tags make Phase 89 restore-scoping enforceable; user awareness noted in Open Question 2 |
| Run-status endpoint as free enumeration | Information Disclosure | D-22 role gate on GET; run ids UUID |
| Concurrent-run DoS | Denial of Service | D-10 single-run refusal + D-21 throttle |

Phase 85 SECURITY.md (`.planning/phases/85-roles-foundation/85-SECURITY.md`) is the route-family threat contract this phase extends — planner must read it before writing the plan (per canonical refs).

## Sources

### Primary (HIGH confidence)
- Repo reads this session: `db-adapter.mjs` (full), `roles.js` (full), `server.js` anchors (126-132, 7747-7800, 4832-5130, 9300-9530, 10034-35, SCHEMA at :324), `export/mspdi.js` header, `src/pages/backup.js`, `test/pg-matrix.test.mjs` header, `package.json` scripts, `src/locales/*.json` refusal keys
- `.planning/REQUIREMENTS.md` §BKBCK, `.planning/STATE.md` D-33-1..12

### Secondary (MEDIUM confidence)
- Roadmap/CONTEXT plan-time flags (86-CONTEXT.md, STATE.md)

### Tertiary (LOW confidence)
- ustar header layout, node:sqlite readOnly flag, VACUUM INTO preconditions, pg combined isolation-level statement — all tagged [ASSUMED], each with a cheap plan-time verification step named above

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — everything is in-repo and read this session; zero new packages
- Architecture: HIGH — two-pass staged pipeline is forced by manifest-first + memory budget; anchors verified
- Pitfalls: HIGH for codebase pitfalls (verified), MEDIUM for external-tool behavior (tagged assumptions with verification steps)

**Research date:** 2026-11-21
**Valid until:** 2026-12-21 (stable: stdlib-only, no dependency churn)
