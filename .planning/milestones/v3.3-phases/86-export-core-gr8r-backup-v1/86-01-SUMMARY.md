---
phase: 86-export-core-gr8r-backup-v1
plan: 01
subsystem: backup-export
tags: [backup, tar, gzip, ustar, manifest, sha256, dual-engine, streaming]
requires:
  - db-adapter.mjs (backendKind, toPgSql, run, runSchema)
  - server.js SCHEMA (22-table allow-list, verbatim)
  - server.js:126-132 DATA_DIR/FILES_DIR/LOGOS_DIR constants
provides:
  - export/backup.js runExport(scope) — gr8r backup v1 pipeline
  - manifest formatVersion 1 (entry 0) — frozen for Phases 87/88/89
  - getRunState/claimRun run-state holder (D-10/D-11)
  - sweepStaleBackupStaging() boot sweep (D-13)
  - verifyStagedBackup() fail-closed self-verification
affects: [86-02 (routes/page wiring), 87 (scheduler/history), 88 (S3), 89 (restore)]
tech-stack:
  added: []   # D-33-11: zero new npm dependencies — Node stdlib only
  patterns:
    - two-pass staged pipeline (collect+hash → tar → verify → atomic rename)
    - hand-rolled ustar 512-byte header writer via stream.pipeline + createGzip
    - dual-engine snapshot fence (SQLite VACUUM INTO readOnly snapshot / pg checked-out client RR READ ONLY)
    - paginated keyset row reads (row-value comparison, both engines)
    - realpath containment per collected path (D-06)
key-files:
  created:
    - export/backup.js
    - test/backup-export.test.mjs
  modified:
    - db-adapter.mjs
    - test/pg-matrix.test.mjs
key-decisions:
  - "chksum placeholder is 8 spaces while summing — caught by the golden tar round-trip pin"
  - "keyset columns frozen per table (id / natural pk / composite pk tuple) — row-value comparison identical on SQLite 3.15+ and pg"
  - "db-adapter.mjs pgPoolRef() export added as the sanctioned read-only pool seam for the fence (Rule 3)"
  - "blob copies moved OUTSIDE the snapshot fence (Pitfall 4 — pg snapshot xmin never held across fs streaming)"
requirements-completed: [BKBCK-01]
coverage:
  - deliverable: tar.gz archive inspectable with tar tzf, manifest.json as entry 0 (BKBCK-01 criterion 1)
    verification: [{kind: test, ref: "test/backup-export.test.mjs — project-scope export round-trips through host tar", status: pass}]
    human_judgment: false
  - deliverable: manifest formatVersion 1 with scope, 22 classification-tagged tables, per-table/per-file sha256
    verification: [{kind: test, ref: "test/backup-export.test.mjs — manifest formatVersion/scope/tables assertions", status: pass}]
    human_judgment: false
  - deliverable: scope containment (project/workspace/instance sets, D-01)
    verification: [{kind: test, ref: "test/backup-export.test.mjs — workspace/instance containment tests", status: pass}]
    human_judgment: false
  - deliverable: symlink escape skipped + flagged, never followed (D-06/T-86-01)
    verification: [{kind: test, ref: "test/backup-export.test.mjs — symlink escape flagged + excluded", status: pass}]
    human_judgment: false
  - deliverable: missing blob tolerated with missingBlob flag (D-04)
    verification: [{kind: test, ref: "test/backup-export.test.mjs — missing blob flag + run succeeds", status: pass}]
    human_judgment: false
  - deliverable: manifest self-verification fail-closed (D-15/T-86-03)
    verification: [{kind: test, ref: "test/backup-export.test.mjs — corrupted staged byte throws MISMATCH", status: pass}]
    human_judgment: false
  - deliverable: boot sweep clears DATA_DIR/tmp/backup-* orphans (D-13)
    verification: [{kind: test, ref: "test/backup-export.test.mjs — sweep removes orphans, spares others", status: pass}]
    human_judgment: false
  - deliverable: whole-archive sha256 over final bytes + .sha256 sidecar (canonical statement)
    verification: [{kind: test, ref: "test/backup-export.test.mjs — sidecar matches sha256Hex(archive)", status: pass}]
    human_judgment: false
  - deliverable: pg parity — identical row counts + per-table sha256 across engines (A5 combined fence statement)
    verification: [{kind: test, ref: "test/pg-matrix.test.mjs — backup export parity case, run LIVE against postgres:17-alpine (8/8 pass)", status: pass}]
    human_judgment: false
estimate_tokens_actual: 92000
duration: ~22 minutes (2026-11-21T17:09Z–17:31Z)
completed: 2026-11-21
status: complete
commits: 3
plan_head_before: 047d97c6
plan_head_after: 4c2add5c
actuals:
  tokens: 92000
  tasks: 3
  commits: 3
---

# Phase 86 Plan 01: Export Pipeline Core Summary

**gr8r backup v1 export pipeline: hand-rolled ustar+gzip writer, two-pass staged choreography (snapshot fence → collect+NDJSON → hash → tar → fail-closed self-verify → atomic rename), scope-containment file collection, and the frozen manifest entry-0 format Phases 87/88/89 consume — verified end-to-end on SQLite and LIVE Postgres (identical per-table sha256).** 3 tasks, 3 commits, 4 files (922 insertions), ~22 minutes (17:09–17:31 UTC).

Next: Ready for 86-02.

## What Was Built

- **export/backup.js** (server-only, repo ROOT, zero new deps per D-33-11):
  - `runExport(scope)` — the two-pass staged pipeline; `claimRun()` sets run state synchronously before any await (D-10 race defense); stages collecting → archiving → verifying → done|failed; D-14 filenames; D-15 fail-closed staging cleanup.
  - Hand-rolled ustar writer (512-byte headers, prefix+name split, fail-closed on >8 GiB-1 entries / >255-char paths) streamed through `zlib.createGzip` + `stream.pipeline` (Pitfall 7).
  - Dual-engine fence: SQLite `wal_checkpoint(TRUNCATE)` + `VACUUM INTO` + `readOnly` snapshot; pg checked-out client on `begin isolation level repeatable read read only` (never `pool.query('BEGIN')`); identical row-dump code path (paginated keyset, row-value tuples — never whole-table `all()`).
  - Scope containment per D-01: project = doc `data.files[].project === id`; workspace = doc files + `data.logo`; instance = DATA_DIR walk minus tmp/backups; `realpathSync` containment per path, escapes skipped + flagged (D-06), missing blobs flagged + tolerated (D-04); archive paths flat `files/<id>` + `logos/<file>` (ratified A6).
  - Manifest entry 0: formatVersion 1, scope, tables[{name,classification,rows,sha256,path}], files[{id,name,ext,project,task,path,sha256?,missingBlob?,pathEscaped?}]. Whole-archive sha256 computed once over final bytes after rename → status payload + `<archive>.sha256` sidecar (frozen canonical statement — never inside entry 0).
  - `verifyStagedBackup()`, `sweepStaleBackupStaging()`, `getRunState()`/`claimRun()` exported for Plans 86-02+.
- **db-adapter.mjs**: `pgPoolRef()` — read-only pool seam (Rule 3).
- **Tests**: `test/backup-export.test.mjs` (8 pins: golden tar round-trip, containment ×3, escape, missing blob, fail-closed verify, sweep, unknown-scope); `test/pg-matrix.test.mjs` + parity case.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] db-adapter.mjs `pgPoolRef()` export**
- **Found during:** Task 1
- **Issue:** the pg fence needs a checked-out client, but the pool is module-private in db-adapter.mjs (which is not in the plan's files_modified).
- **Fix:** minimal read-only accessor `pgPoolRef()` with a comment naming the sanctioned seam; fence body stays in export/backup.js.
- **Files modified:** db-adapter.mjs
- **Commit:** dd0981c8

**2. [Rule 1 - Bug] ustar checksum placeholder**
- **Found during:** Task 1 (golden round-trip failed: "This does not look like a tar archive")
- **Issue:** chksum field was summed with a `'0000000 '` placeholder instead of 8 spaces — checksum off by 112, host tar refused the archive.
- **Fix:** 8-space placeholder before summing; verified by `tar tzf`/`tar xzf` round-trip.
- **Commit:** dd0981c8

**3. [Rule 1 - Bug] Blob copies ran inside the pg snapshot fence**
- **Found during:** Task 3 restructure
- **Issue:** file copies inside `withSnapshotReads` would hold pg's snapshot xmin across filesystem streaming (Pitfall 4 — vacuum stall).
- **Fix:** rows + doc-record resolution inside the fence; blob copies after release.
- **Commit:** 4c2add5c

## Assumption Verifications (module header updated)
- ustar layout: verified via golden `tar tzf`/`tar xzf` round-trip.
- node:sqlite `{ readOnly: true }`: verified live (missing file throws; existing opens read-only).
- `VACUUM INTO` existing target throws ("output file already exists"): verified live; staging target deleted first.
- pg combined `begin isolation level repeatable read read only`: accepted — verified LIVE against postgres:17-alpine.

## Verification

- `node --test test/backup-export.test.mjs` — 8/8 pass.
- `node --test test/pg-matrix.test.mjs` without `POSTGRES_TEST_URL` — skips, exit 0.
- LIVE: `POSTGRES_TEST_URL=… node --test test/pg-matrix.test.mjs` against postgres:17-alpine — **8/8 pass**, including the backup-parity case (identical manifest row counts + per-table sha256 across engines). Container removed after the run.
- `tar tzf` on a produced fixture lists manifest.json as first entry (asserted by the suite).

## Known Stubs

None — no placeholders, no unwired data paths. `sweepStaleBackupStaging()` server.js wiring is Plan 86-02 Task 1 scope per the plan (not a stub).

## Self-Check: PASSED

- export/backup.js, test/backup-export.test.mjs exist; db-adapter.mjs, test/pg-matrix.test.mjs modified.
- Commits verified: dd0981c8, e8c5d161, 4c2add5c (3 commits, 047d97c6..4c2add5c).
