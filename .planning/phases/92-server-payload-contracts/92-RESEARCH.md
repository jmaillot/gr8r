# Phase 92: Server Payload Contracts - Research

**Researched:** 2026-11-24
**Domain:** Server-side backup naming/GFS bucketing, cron descriptor, frozen-route extension, operator scopes endpoint
**Confidence:** HIGH (all findings read directly from source this session)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Collision suffix `-2`, `-3`, … appended before `.tar.gz`. The sha256 sidecar is written from the FINAL uniquified filename — archives are never renamed post-creation.
- **D-02:** Deployment-time backfill: the ONE pure GFS function computes the bucket for existing succeeded runs; new runs store the bucket at creation. Dual-engine DDL lockstep (SQLite AND Postgres same commit). Plan must carry a `checkpoint:decision` gate (one-way data migration) unless waived.
- **D-03:** `<instance-name>` from an `instance_name` setting (read server-side at archive-creation time) with slugified-hostname fallback. Slugified once into the filename; setting is free-form.
- **D-04:** `describeCron` (in export/cron.js, from `parseCron` output only) returns `{ kind: 'daily'|'weekly'|'monthly'|'yearly'|'custom', weekday?, hour?, minute?, raw }`. Client localizes via `t()` keys ×5 — that client work is Phase 94, NOT here. No server-side translated strings.
- **D-05:** Frozen `GET /api/backup/runs` gains `?all=1` variant with filters (`task`, `trigger`, `status`, `limit`, `offset`). Without `?all=1` responses stay byte-identical. Per-run scope authorization server-side and fail-closed (instance-scope via hasInstanceRole; workspace/project scope via live membership).
- **D-06:** `GET /api/backup/scopes` gated Super Admin ∨ Backup Operator ∨ Restore Operator. Payload `{ workspaces: [{ id, name, slug }] }`. `workspacesForUser` (server.js:1282) stays byte-unchanged.

### the agent's Discretion
- Exact descriptor key names; where `gfs_bucket` lands on the run row shape.
- Backfill mechanics (idempotent `update … where gfs_bucket is null` sweep at startup vs one-time migration).
- Whether `instance_name` gets settings UI now or reads config-only (no UI requirement here; SET items belong to 95).

### Deferred Ideas (OUT OF SCOPE)
- Nested projects in the scopes payload; settings UI for `instance_name`; pagination beyond limit/offset.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BKNAME-01 | Filenames + run labels carry `<instance-name>-<scope>-<slug>-<gfs>-<date>`; names resolved server-side; manual runs no GFS marker | Filename builder verified: export/backup.js:543–582 (slugify, scopeLabel, archiveName); manual path = `meta.taskId` null (export/backup.js:573–582, 622–633) |
| BKNAME-02 | One pure GFS function shared naming+rotation, stored `gfs_bucket` additive column, dual-engine DDL; archives never renamed | Pure functions verified: `isoWeekKey` + `assignGfsBuckets` server.js:3950–3994; ensureColumn dual-engine db-adapter.mjs:995–1007 |
</phase_requirements>

## Summary

Phase 92 is a server-only refactor+extension of an already well-disciplined backup subsystem. Every anchor from the context was verified in source. The GFS math already exists as two pure functions (`isoWeekKey`, `assignGfsBuckets`, server.js:3946–3994); the phase extracts them into one shared module consumed by naming, rotation, and the backfill — the "one pure function" mandate (D-10 exactly-one-bucket) is already satisfied conceptually, it just needs to move and gain a single-run entry point.

The critical design fact: `assignGfsBuckets` is **history-dependent** (a run's bucket depends on which prior succeeded runs of the same task occupied the calendar slots). Storing `gfs_bucket` at creation therefore requires an *incremental* derivation: at run-complete, query the task's prior succeeded runs and apply the same first-of-year/month/week/else-daily walk. The pure module must expose both a batch form (existing `assignGfsBuckets` shape, used by rotation + backfill + `gfsKeptPositions`) and a single-run form (new-run bucket at creation). Rotation then reads the stored column instead of re-deriving (success criterion 2).

**Primary recommendation:** Create `export/gfs.js` (zero non-stdlib imports, matching cron.js Wave-0 discipline) exporting `isoWeekKey`, `assignGfsBuckets` (batch, byte-equivalent to today), `gfsBucketFor(taskId history summary)` single-run helper, and `describeCron`. Server.js re-imports from there; rotation switches to `gfs_bucket` column reads guarded by a NULL fallback to the pure function (or a strict post-backfill invariant — planner's call, D-02 discretion).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| GFS bucket computation + storage | API/Backend (server.js + new export/gfs.js) | Database (additive column) | Server owns all GFS math; client renders payload only |
| Archive naming + collision suffix | Backend (export/backup.js archiveName) | — | Filenames are created at export time, never renamed |
| Cron descriptor | Backend (export/cron.js describeCron) | — | Derived from parseCron output only (D-04) |
| Unified runs surface | API/Backend (frozen route variant) | — | Scope authorization stays server-side, fail-closed (D-05) |
| Scopes endpoint | API/Backend | — | Roles machinery lives server-side (hasInstanceRole) |

## Standard Stack

No new dependencies — zero-dependency project invariant (REQUIREMENTS.md: "zero new dependencies"). All work is stdlib Node (v24.21.0 [VERIFIED: node --version]) on existing modules.

## Package Legitimacy Audit

Not applicable — this phase installs no external packages.

## Architecture Patterns

### System Architecture Diagram

```
run completes (export/backup.js completeRun / writer 'complete' event)
        │
        ▼
server.js writeBackupRunRow (:3592 start, :3806/:3821 complete)
        │  NEW: compute gfsBucketFor(taskId, prior succeeded runs) → store gfs_bucket on run row
        ▼
backup_runs row (NEW additive column gfs_bucket, dual-engine DDL)
        │
        ├─► rotation pass (runBackupRotationPass :4024) — READS stored gfs_bucket
        ├─► GET /api/backup/runs (frozen; NEW ?all=1 variant) — returns gfs_bucket in rows
        └─► boot backfill sweep (D-02): assignGfsBuckets over NULL rows, per task, oldest-first
```

Naming flow (export/backup.js):
```
runExport → claimRun → scopeLabel (server-side name resolution :555–571)
        → archiveName (:573–582)  NEW: instance-name segment + GFS marker + collision suffix
        → fs write (if exists → suffix -2, -3 … BEFORE .tar.gz)
        → completeRun(filename, sha256) (:179) — sidecar written from FINAL name
```

### Pattern 1: Pure GFS module (existing code, relocated)

`server.js:3950–3959` `isoWeekKey(ms)` and `server.js:3968–3994` `assignGfsBuckets(runsAsc)` — [VERIFIED: server.js:3950-3994]:

```js
function isoWeekKey(ms) { /* nearest-Thursday UTC, `${isoYear}-W${String(week).padStart(2,'0')}` */ }
function assignGfsBuckets(runsAsc) {
  // exact-one-bucket walk: yearly if first of calendar year among the task's
  // succeeded runs, else monthly, else weekly, else daily.
  // Marks ALL calendar positions seen (a yearly run also consumes that month's
  // and week's slot). Returns Map(runId -> 'daily'|'weekly'|'monthly'|'yearly').
}
```

Move verbatim into `export/gfs.js`; server.js + export/backup.js both import. Consumers today: `gfsKeptPositions` (:4009–4020), `runBackupRotationPass` (:4047), rotation-preview dry-run (:9311 area) — all must switch to the shared import in the same commit.

### Pattern 2: Bucket-at-creation (incremental form)

`assignGfsBuckets` needs the WHOLE history. At run creation, the same classification is computable incrementally: a new succeeded run at `created_at` T is `yearly` iff no prior succeeded run of the task has UTC year(T); else `monthly` iff none has year-month(T); else `weekly` iff none has isoWeekKey(T); else `daily`. One SQL probe (or reuse the pure function over prior succeeded rows — simplest, one definition, ~n rows read). Recommended: call the shared `assignGfsBuckets` over `[...priorSucceededAsc, newRow]` and take the last entry — zero new math, exactly one definition.

⚠️ **Ordering caveat:** rotation orders by `created_at asc, id asc` ([VERIFIED: server.js:4036-4039, 4062-4065 area]) — the incremental derivation must use the same tiebreak, else a same-second run pair could store a bucket that disagrees with a future backfill/re-derivation.

### Pattern 3: Dual-engine additive DDL (established precedent)

`ensureColumn(table, name, def)` in db-adapter.mjs:995–1007 [VERIFIED: db-adapter.mjs:995-1007] — pragma check + `alter table add column` on SQLite; information_schema check + ALTER on Postgres. Three prior precedents on `backup_runs` itself: `uploaded` (server.js:803 area), `checksum_ok`/`checksum_checked_at`, `missing_blob_count` — pattern: add the column to SQLITE_SCHEMA verbatim (comments must never end a line with a semicolon — runSchema splits on ';-newline' [VERIFIED: server.js:795-830]), `pgSchemaVariant` derives the pg DDL, then boot-time `ensureColumn` for existing dbs. Note: `uploaded` is `integer not null default 0`; for a NULLABLE bucket, use nullable `integer`/`text` with no default (null = not yet backfilled marker, drives the idempotent sweep).

⚠️ **Column type decision (discretion):** store bucket as text (`'daily'|'weekly'|'monthly'|'yearly'`) or small int? Text is self-documenting and matches the bucket strings already used in keep maps — recommended.

### Pattern 4: Frozen-route additive variant (D-05)

Current route (server.js:9245–9301) [VERIFIED: server.js:9245-9301]: guard chain `sameOrigin → requireUser → hasInstanceRole(BACKUP_MANAGE) ∨ hasInstanceRole(RESTORE_USE)` → requires `taskId` param (400 `taskNotFound` when absent; 404 when malformed/nonexistent). Rows project: `id, task_id, uploaded, checksum_ok, checksum_checked_at, missing_blob_count, trigger, status, started_at, finished_at, duration_ms, size_bytes, sha256, filename, error, created_at` + server-derived `location` (fs membership, never live S3). Task path also attaches `keptPosition` per succeeded row.

D-05 implementation shape: keep the entire legacy branch verbatim when `url.searchParams.get('all') !== '1'` (no params added to the legacy parse → byte-identical). New branch: same guards, then filters `task` (task id or 'manual'), `trigger` (manual|scheduled), `status`, `limit`, `offset` (validated, capped), same row projection plus `task_id`/`gfs_bucket`, per-run fail-closed scope check: instance-scope rows → the route's existing role gate already authorizes; workspace/project-scope rows → live membership check (mirror the per-scope authorization the download route uses — verify exact helper at plan time; `isInstanceAdmin` + membership query pattern, server.js:5874–5940 [VERIFIED: server.js:5874-5940 grep anchor]).

### Pattern 5: Operator gate (D-06)

`hasInstanceRole(userId, capability)` (server.js:5891), capabilities from roles.js:24–40 [VERIFIED: roles.js:24-40]: `BACKUP_MANAGE: 'backup_manage'`, `RESTORE_USE: 'restore_use'`, `backup_operator: [CAP.BACKUP_MANAGE]`, `restore_operator: [CAP.RESTORE_USE]`. Super Admin = `isInstanceAdmin(user) && SUPER_ACCESS` (server.js:1282 pattern). Gate: `(await hasInstanceRole(user.id, CAP.BACKUP_MANAGE)) || (await hasInstanceRole(user.id, CAP.RESTORE_USE)) || isInstanceAdmin(user)`. Mount the route beside the other /api/backup/* routes (~server.js:8775 region). Payload mirrors workspacesForUser's workspace rows but projects ONLY `{ id, name, slug }` — do not call workspacesForUser itself (byte-unchanged mandate); write a separate `select id, name, slug from workspaces where archived = 0 order by …` query.

### Anti-Patterns to Avoid
- **Re-deriving buckets in rotation from created_at:** BKNAME-02 says rotation reads the stored column, never re-derives. Keep one fallback path documented (post-backfill NULL should be impossible for succeeded runs).
- **Renaming archives to fix collisions:** never; suffix before `.tar.gz` at creation only (D-01).
- **Translating cron strings server-side:** D-04 forbids; descriptor is structured, localization is Phase 94 client work.
- **Touching `workspacesForUser`** (server.js:1275–1291 [VERIFIED: server.js:1275-1291]): new query, not a call-site change.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ISO week math | custom date math | existing `isoWeekKey` (relocate) | DST/week-boundary edge cases already handled in UTC |
| Bucket assignment | new classification logic | existing `assignGfsBuckets` | exactly-one-bucket invariant (D-10) is subtle (seen-slot consumption) |
| Cron classification | regex on raw string | `parseCron` field sets (export/cron.js:83–102) | D-04 mandates describeCron from parseCron output ONLY |
| Additive DDL | bespoke ALTER scripts | `ensureColumn` + SQLITE_SCHEMA + pgSchemaVariant | dual-engine lockstep precedent |
| Collision handling | rename/retry loops on final name | suffix loop at archiveName time | D-01 / D-86 frozen format |

## Runtime State Inventory

Not a rename phase, but D-02 is a data migration:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `backup_runs` rows — existing succeeded runs have no bucket | Boot/idempotent backfill sweep via assignGfsBuckets per task (D-02) |
| Live service config | None — verified: no `instance_name`/hostname setting exists in server.js (grep, zero hits) | Add new setting source (D-03) |
| OS-registered state | None applicable | — |
| Secrets/env vars | None found | — |
| Build artifacts | None — plain node, no build step for server.js | — |

## Common Pitfalls

### Pitfall 1: Same-second created_at tiebreak drift
**What goes wrong:** incremental bucket-at-creation uses a different order than rotation's `created_at asc, id asc` → stored bucket disagrees with batch derivation.
**Avoid:** the incremental path sorts/compares identically; pin with a test seeding two runs at identical timestamps.

### Pitfall 2: Legacy route byte-identity
**What goes wrong:** adding params to the shared query parser changes legacy responses (frozen contract, Phase 87/88 precedent).
**Avoid:** branch on `searchParams.get('all')` FIRST, legacy branch code untouched; differential test asserts byte-equality of legacy responses before/after (grep-gate the legacy branch per D-05).

### Pitfall 3: Sidecar/final-name mismatch
**What goes wrong:** sidecar `.sha256` written with the pre-uniquification name.
**Avoid:** uniquify inside archiveName/path resolution BEFORE the tar write; `completeRun(filename, sha256)` (:179 [VERIFIED: export/backup.js:179-181]) receives the final name; the sidecar write site follows the same filename variable (verify exact sidecar write call during planning — it lives in runExport's publish step after :638).

### Pitfall 4: Filename-inert rotation
**What goes wrong:** rotation matches filenames by prefix/regex on recorded rows (export/backup.js:534–542 comment) — a NEW filename format could break greppable matching.
**Avoid:** rotation reads `filename` from DB rows for deletion paths but bucket/deletion logic is id-based; the format change (instance-scope-segment etc.) is inert to it — confirm the existing filename-shape test in test/backup-export.test.mjs still passes, update where the format is pinned.

### Pitfall 5: project scopeLabel cost
`scopeLabel` for project scope scans ALL workspace docs (export/backup.js:561–568) — fine today, but the new instance-name lookup adds another read per run; read `instance_name` setting once at run start, not per path join.

## Code Examples

### describeCron from parseCron output only (export/cron.js)
```js
// parseCron returns [VERIFIED: export/cron.js:83-102]:
// { minute: Set, hour: Set, dom: Set, mon: Set, dow: Set,
//   domRestricted: bool, dowRestricted: bool }  // null when malformed
// Derivation: kind='daily' when domRestricted==false && dowRestricted==false
//   && hour/minute sets are singletons; 'weekly' when exactly dowRestricted
//   with singleton dow + singleton hour/minute; 'monthly' when domRestricted
//   singleton; yearly needs mon singleton too (derivable!); everything else
//   'custom' with raw. hour/minute/weekday fields only for non-custom kinds.
```
`monthly`/`yearly` ARE derivable from parseCron sets (dom/mon singleton checks) — `custom` covers steps/ranges/multi-values. Raw fallback always present (`raw: expr`).

## State of the Art

N/A — internal refactor, no library movement. Relevant history: kept-position shift (Phase 90, D-90-16: "kept-until is bucket position, never a date") already forced bucket math purity once; this phase completes it by persisting the bucket.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `scopeLabel`/`archiveName` are the only filename producers; no other code path writes backup filenames | Filename builder | A second producer would miss the new format |
| A2 | A general key-value settings table does not exist (grep found no `settings` table); D-03 "setting" may need a new small store or env/config read | D-03 | Planner must choose the source; may warrant a checkpoint |
| A3 | Per-run workspace/project scope authorization for `?all=1` can reuse the download-route membership-check idiom | Unified runs | Wrong helper → authorization hole; planner must verify exact check at plan time |
| A4 | Exact sidecar write call site is in runExport after staging publish (after backup.js:638) | Pitfall 3 | Misplaced suffix breaks sha256 verification |

## Open Questions

1. **`instance_name` storage** — no settings table found; options: env var (`GR8R_INSTANCE_NAME`), a new one-row settings table (dual-engine DDL again), or hostname-only fallback v1. Discretion per CONTEXT, but pick at plan time.
2. **NULL gfs_bucket semantics post-backfill** — strict invariant (backfill guaranteed) vs defensive fallback; planner decides (D-02 discretion).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node | everything | ✓ | 24.21.0 | — |
| node:test + helpers/server.mjs harness | tests | ✓ | — | — |
| Postgres (dual-engine DDL tests) | db-adapter.test pattern | via test/copy-sqlite-to-pg.test.mjs + db-adapter.test.mjs harness | — | sqlite-only tests if pg unavailable locally |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (stdlib), `node --test --test-concurrency=2 test/*.test.mjs` [VERIFIED: package.json:19] |
| Config file | none — glob convention |
| Quick run command | `node --test test/backup-rotation.test.mjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BKNAME-01 | filename format `<instance>-<scope>-<slug>-<gfs>-<date>`, manual runs no GFS marker, collision `-2` suffix, sidecar from final name | unit + integration | `node --test test/backup-export.test.mjs` (extend) | ✅ extend existing |
| BKNAME-02 | one pure GFS fn; bucket stored at creation; backfill; rotation reads stored value; dual-engine DDL | unit + integration | `node --test test/backup-rotation.test.mjs test/db-adapter.test.mjs test/migration.test.mjs` | ✅ extend |
| BKNAME-02 (pinned dates) | pure fn vs known dates: ISO week boundaries (Thu/Wed/Sun), year rollover (W01/W52-53), DST irrelevant (pure UTC) | unit | `node --test test/gfs-kept-until.test.mjs` (extend or new gfs unit file) | ✅ extend |
| D-04 | describeCron mapping daily/weekly/monthly/yearly/custom from parseCron sets, honest raw | unit | `node --test test/backup-cron.test.mjs` (extend) | ✅ |
| D-05 | `?all=1` filters + per-run fail-closed scope; legacy byte-identical | integration | `node --test test/backup-routes.test.mjs` (extend) | ✅ |
| D-06 | scopes endpoint gate + minimal payload; workspacesForUser byte-unchanged | integration | `node --test test/backup-routes.test.mjs` or new scopes file | ❌ Wave 0 (new file ok) |

Harness patterns (verified): `startServer`/`login`/`signup`/`withDb` from `test/helpers/server.mjs`; operator grants via `POST /api/auth/operator/instance-roles` (backup-rotation.test.mjs `makeBackupOp`); test-only route `/api/internal/backup-rotation-pass` with `BACKUP_TEST_TOKEN` + `x-backup-token` header [VERIFIED: server.js:6131-6151]; seeded fake runs + backdated `created_at`, no sleeps.

### Sampling Rate
- Per task commit: `node --test test/backup-export.test.mjs test/backup-rotation.test.mjs`
- Per wave merge: `npm test`
- Phase gate: full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- New test file for `/api/backup/scopes` (or extend backup-routes)
- Legacy-response byte-identity differential test for D-05 (golden snapshot of legacy GET before touching the route)

## Project Constraints (from AGENTS.md)

No `./AGENTS.md` exists at the repo root [VERIFIED: ls]. Governing constraints come from REQUIREMENTS.md: zero new dependencies; frozen "gr8r backup v1" format (naming is metadata/filename only); no general cron DSL; no client derivation; dual-engine DDL lockstep; i18n ×5 applies to client keys (Phase 94, not here).

## Sources

### Primary (HIGH confidence)
- Direct source reads this session: server.js:3920–4079 (GFS), :700–830 (DDL), :1275–1330 (workspacesForUser), :5874–5940 (roles), :8740–8799 (task shape), :9200–9314 (frozen routes), :6131–6151 (test route); export/backup.js:150–200, 510–640; export/cron.js:60–140; db-adapter.mjs:995–1007; roles.js:24–40; package.json:19
- Test harness: test/backup-rotation.test.mjs header + helpers

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero deps, all stdlib
- Architecture: HIGH — every anchor read in source
- Pitfalls: HIGH — grounded in existing frozen-surface/D-86/D-90 discipline; A2/A4 flagged for plan-time verification

**Research date:** 2026-11-24
**Valid until:** 2026-12-24 (stable internal surfaces)
