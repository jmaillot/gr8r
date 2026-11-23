---
phase: 89-restore
plan: 01
subsystem: backup
tags: [tar, ustar, gzip, streaming, restore, sha256, zero-dependency, security]

# Dependency graph
requires:
  - phase: 86-backup-export
    provides: the frozen "gr8r backup v1" ustar archive format + writer (ustarHeader is this reader's layout spec), frozen TABLES allow-list, verifyStagedBackup flag posture, sweep/rmStaging conventions
  - phase: 87-backup-lifecycle
    provides: BACKUPS_DIR home + stale-sweep conventions the restore-staging home mirrors (D-89-32)
  - phase: 88-backup-s3
    provides: downloadToStaged hashTap idiom (sha256 on the pipe, one pass)
provides:
  - export/restore.js — zero-dep ustar+gzip stream reader (readArchiveEntries) with whole-archive sha256 computed on the same pipe
  - gateEntryName — the D-89-33 entry allow-list gate (manifest.json / frozen-TABLES ndjson / flat files/<id> / logos/<name>) with keyed refusal classes
  - extractArchive — bounded, manifest-driven staged extraction with per-entry sha verification, flag-variant honoring, and contained() realpath discipline
  - restoreStagingDir() + sweepStaleRestoreStaging() — D-89-32 restore-staging home under BACKUPS_DIR
  - keyed refusal-class vocabulary (stable .code strings) for plans 03/04 fail() mapping
affects: [89-02, 89-03, 89-04, 89-05, 89-06]

# Actuals (#2632)
actuals:
  tokens: 13797      # chars/4 over the realized diff (55188 chars across 3 files)
  tasks: 3
  commits: 3
commits: 3
plan_head_before: 5302280932b04da6443e39319e88e3c596b923b9
plan_head_after: eb8f7347b6ebb44294f6d8c14bc2bf21c05ba6b3

# Tech tracking
tech-stack:
  added: [] # zero npm deps (D-33-11) — Node stdlib only
  patterns: [stateful 512-byte tar block walker over gunzip pipeline, hash-on-the-pipe (hashTap), keyed refusal errors (.code + .reason), allow-list gate before extraction decisions, write-sink backpressure via withheld walker callback]

key-files:
  created:
    - export/restore.js
    - test/restore-preview.test.mjs
    - test/restore-security.test.mjs
  modified: []

key-decisions:
  - "Gate is an exported gateEntryName() applied at EXTRACTION decision time; readArchiveEntries stays a pure preview enumerator — legitimate instance-scope names (d1/…, projects.db) must enumerate; extractArchive skips gate-refused/unmanifested entries (counted in result.skipped), never writes them"
  - "Duplicate entry names refuse at walk level (restoreArchiveDuplicate) — preview-visible archive corruption"
  - "logos/<name> safe-name mirrors the files/<id> uid shape ([A-Za-z0-9_-]{1,64})"
  - "Keyed refusal vocabulary: restoreArchiveHeaderInvalid(magic|octalField|typeflag), restoreArchiveChecksum, restoreArchiveOversize, restoreArchiveTruncated, restoreArchiveDuplicate, restoreEntryRejected(traversal|absolute|unknownTable|badFileId|badLogoName|unexpectedEntry), restoreShaMismatch, restoreContainmentViolated, restoreArchiveIncomplete — all documented in the module header for plans 03/04 fail() mapping"
  - "Oversize headers refuse BEFORE any data read (T-89-02); walk-level typeflag strictness ('0' only — gr8r archives carry regular files only)"

patterns-established:
  - "TarWalker: stateful block walker with per-entry write sinks; backpressure by withholding the walker's _write callback until the sink drains — memory flat regardless of blob size (P3)"
  - "finishSink: hash verified at entry-body completion, flush awaited before extractArchive resolves — callers may read the staged tree immediately"
  - "rmStaging(destDir) in the extract catch (D-15/D-89-32): failed restores leave NOTHING behind"

requirements-completed: [BKRST-01]

coverage:
  - id: D1
    description: "Zero-dep ustar+gzip stream reader enumerating a real 86 archive (entry 0 manifest, entries match the manifest exactly, prefix/name reconstruction for >100-char names, two-zero-block end marker) with whole-archive sha256 computed on the same streaming pass matching the .sha256 sidecar"
    requirement: BKRST-01
    verification:
      - kind: unit
        ref: "test/restore-preview.test.mjs#89-01 golden round-trip"
        status: pass
      - kind: unit
        ref: "test/restore-preview.test.mjs#89-01: whole-archive sha256 recomputed on the SAME streaming pass equals the sidecar digest"
        status: pass
      - kind: unit
        ref: "test/restore-preview.test.mjs#89-01: an entry name over 100 chars round-trips through the ustar prefix field"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-89-33 entry allow-list gate + reader hardening: traversal/absolute/unknownTable/badFileId/badLogoName/unexpectedEntry refusals, oversize-before-data-read, chksum, truncation, duplicate names — every vector refuses keyed; clean archive passes untouched"
    requirement: BKRST-01
    verification:
      - kind: unit
        ref: "test/restore-security.test.mjs#89-01 gate vectors + oversize/chksum/truncated/duplicate/control"
        status: pass
    human_judgment: false
  - id: D3
    description: "Bounded manifest-driven staged extraction into restore-staging/<runId> (flat files/<id>, D-89-12) with per-entry sha verification, flag-variant honoring, symlink containment refusal, rmStaging-on-failure hygiene, and the staging sweep"
    requirement: BKRST-01
    verification:
      - kind: unit
        ref: "test/restore-preview.test.mjs#89-01 extraction: FLAT staged tree + sweep orphans"
        status: pass
      - kind: unit
        ref: "test/restore-security.test.mjs#89-01 extraction: sha mismatch/missingBlob/flag rows/symlink containment/unmanifested skips"
        status: pass
    human_judgment: false

# Metrics
duration: 31min
completed: 2026-11-22
status: complete
---

# Phase 89 Plan 01: Restore Engine Foundations Summary

**Zero-dependency ustar+gzip stream reader + D-89-33 allow-list gate + bounded staged extraction for the frozen 86 "gr8r backup v1" archive format, with keyed refusal classes ready for the 03/04 route handlers**

## Performance

- **Duration:** 31 min
- **Started:** 2026-11-22T18:21:57Z
- **Completed:** 2026-11-22T18:53:21Z
- **Tasks:** 3
- **Files modified:** 3 (all created)

## Accomplishments

- `readArchiveEntries`: one streaming pass over the 86-written archive — enumerates every entry (512-byte ustar header parse mirroring `ustarHeader` byte-for-byte, incl. prefix/name reconstruction for >100-char names) AND computes the whole-archive sha256 on the pipe; data blocks are skipped/routed, never accumulated (P3)
- `gateEntryName` + `extractArchive`: entry allow-list before any extraction decision (frozen TABLES imported from `export/backup.js` — single allow-list source of truth), per-entry sha verification on the pipe, flag variants carried exactly as `verifyStagedBackup`, `contained()` realpath discipline at every write, `rmStaging` on any failure
- `restoreStagingDir()` + `sweepStaleRestoreStaging()` — the D-89-32 restore-staging home under BACKUPS_DIR, ready for plans 03/04/05

## Task Commits

Each task was committed atomically (TDD RED→GREEN per task):

1. **Task 1: Reader foundations (tracer)** — `a84f7a14` (feat) — tracer gate re-verified end-to-end before expansion
2. **Task 2: Entry allow-list + hardening classes** — `cc51d60d` (feat)
3. **Task 3: Bounded staged extraction + staging hygiene** — `eb8f7347` (feat)

## Files Created/Modified

- `export/restore.js` — the restore engine foundations: reader, gate, extraction, staging home + sweep, keyed refusal vocabulary (doc-header decision trail)
- `test/restore-preview.test.mjs` — golden round-trip pins against REAL `runExport` archives (7 tests)
- `test/restore-security.test.mjs` — hand-crafted byte-by-byte refusal vectors + clean control (16 tests)

## Decisions Made

- **Gate placement**: exported `gateEntryName()` runs at extraction decision time; `readArchiveEntries` stays a pure preview enumerator. Rationale: instance-scope archives legitimately carry DATA_DIR-relative names outside the four restore families (`d1/…`, `projects.db`) — preview must enumerate them, restore must never write them. Skipped entries are counted in `result.skipped` (code + reason) for operator visibility.
- **Keyed refusal vocabulary** (stable `.code` strings, documented in the module header): `restoreArchiveHeaderInvalid` (reason: magic | octalField | typeflag), `restoreArchiveChecksum`, `restoreArchiveOversize`, `restoreArchiveTruncated`, `restoreArchiveDuplicate`, `restoreEntryRejected` (reason: traversal | absolute | unknownTable | badFileId | badLogoName | unexpectedEntry), `restoreShaMismatch`, `restoreContainmentViolated`, `restoreArchiveIncomplete`.
- **Manifest-driven completeness**: every manifest-declared table/blob row must materialize — a declared row the archive never carried refuses (`restoreArchiveIncomplete`) unless it declares itself flagged up front.
- **Sink flush discipline**: `extractArchive` awaits every sink's flush before resolving; a sha-mismatched stream is destroyed, never flushed.
- Oversize headers refuse BEFORE any data read (T-89-02); only typeflag '0' entries parse (gr8r archives carry regular files only).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] pipeline imported from the wrong stream module**
- **Found during:** Task 1 (GREEN)
- **Issue:** `pipeline` imported from `node:stream` (callback form) rejected every walk with a TypeError
- **Fix:** import from `node:stream/promises` (the promise form `export/backup.js` uses)
- **Files modified:** export/restore.js
- **Verification:** test/restore-preview.test.mjs green
- **Committed in:** a84f7a14

**2. [Rule 1 - Bug] block padding routed into extraction sinks**
- **Found during:** Task 3 (GREEN)
- **Issue:** the walker routed the block-ROUNDED byte count (size + zero padding) to write sinks and their hashes — extracted blobs were polluted and every sha verification failed
- **Fix:** separate `remaining` (exact payload bytes routed) from `skip` (block-rounded bytes consumed); padding is consumed but never routed
- **Files modified:** export/restore.js
- **Verification:** extraction pins green (real-archive sha checks + crafted vectors)
- **Committed in:** eb8f7347

**3. [Rule 1 - Bug] unhandled rejection from destroyed sink flush**
- **Found during:** Task 3 (GREEN)
- **Issue:** on the error path the catch `destroy()`s the last sink stream whose `end(cb)` callback then rejects its flush promise — an unhandled rejection leaked after the symlink-containment test
- **Fix:** flush promise marked handled at creation (`.catch(() => {})`); the success path still awaits the original promise
- **Files modified:** export/restore.js
- **Verification:** security suite green with zero async leakage
- **Committed in:** eb8f7347

---

**Total deviations:** 3 auto-fixed (3 × Rule 1 bugs, all caught by the TDD pins before commit)
**Impact on plan:** All three were correctness bugs in new code caught by this plan's own tests. No scope creep; no architectural changes.

## Issues Encountered

- Pre-existing untracked directory `"[object Promise]/"` sits at the repo root (dated 2026-11-21, before this session). Out of scope — left untouched; logged to `deferred-items.md` for cleanup.
- Pre-existing `.planning/STATE.md` modification predates this plan (orchestrator setup) — left for the state-update step.
- Known pre-existing failure in `webhook-events.test.mjs` (deferred since 78-01, unrelated to backups) — not touched.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plans 02–05 consume: `readArchiveEntries` (preview/enumeration + sidecar digest), `gateEntryName` (route the keyed refusal classes into `fail()` responses), `extractArchive` (staged tree at `restoreStagingDir()/<runId>/` — flat `files/<id>` + `logos/<name>`, tables + manifest at the root), and the sweep.
- The splice layer (plan 02/04) still needs: db-adapter import for row/doc splicing, and sidecar-vs-run-row digest comparison at the caller (deliberately NOT done here — same posture as `downloadToStaged`).
- Guard pins hold: `dependencies.test.mjs`, `export-prohibition.test.mjs`, `backup-export.test.mjs` all green with the new sibling module.

---
*Phase: 89-restore*
*Completed: 2026-11-22*

## Self-Check: PASSED

All created files exist on disk; all three task commits (`a84f7a14`, `cc51d60d`, `eb8f7347`) present in git history; commit count measured from the plan ledger (`3` since `5302280`); no stub patterns in shipped source.
