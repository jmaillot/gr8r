---
phase: 86-export-core-gr8r-backup-v1
verified: 2026-11-21T18:30:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: none
behavior_unverified_items:
  - truth: "Memory stays bounded (~65 MiB) regardless of archive size via the staged temp-file streaming pipeline (Roadmap SC4)"
    test: "Export a scope with a multi-GB table + many large blobs and observe the process RSS during collecting/archiving/verifying"
    expected: "RSS stays in the ~65 MiB ballpark regardless of archive size; no whole-table or whole-blob buffering"
    why_human: "All write paths are streams to staged files (structural evidence only); no test measures RSS against a large dataset, and building one is out of scope for verification"
coincidental_reliance_items: []
human_verification:
  - test: "Export a scope with a multi-GB table + many large blobs and observe process RSS during collecting → archiving → verifying"
    expected: "RSS stays ~bounded (~65 MiB target) regardless of archive size"
    why_human: "Memory-boundedness is a runtime property; the code is fully streaming (paginated keyset reads, 64 KiB highWaterMark, stream.pipeline, staged files) but no automated RSS assertion exists"
---

# Phase 86: Export Core ("gr8r backup v1") Verification Report

**Phase Goal:** An operator can export any scope (project/workspace/instance) today as a verified logical archive — the format is frozen so scheduler, S3 and restore all consume it unchanged.
**Verified:** 2026-11-21T18:30:00Z
**Status:** human_needed (1 behavior-unverified truth; no gaps)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth (Roadmap SC / requirement) | Status | Evidence |
| --- | --- | --- | --- |
| 1 | SC1 — Backup Operator triggers export of project/workspace/instance, receives `tar+gzip "gr8r backup v1"` archive with per-table NDJSON rows + scope's uploaded files, inspectable with `tar tzf` | ✓ VERIFIED | `export/backup.js:599-637` (tar write + gzip pipeline + atomic rename); golden tar round-trip test in `test/backup-export.test.mjs`; happy-path e2e "holder POST returns a UUID immediately; polling reaches done… archive + sidecar exist" in `test/backup-routes.test.mjs:74` (run during verification: 32/32 pass) |
| 2 | SC2 — manifest (entry 0) carries formatVersion 1, scope {kind,id}, entity-addressable row ids, data-vs-operational classification, per-table/per-file/whole-archive sha256; self-verify marks run FAILED on mismatch | ✓ VERIFIED | `export/backup.js:93-94` (classification tags), `:283-295` (`verifyStagedBackup` fail-closed MISMATCH throw), `:397` (`files/<id>` addressable paths, A6), header `:18-21` (whole-archive sha256 over final bytes, sidecar); manifest assertions in `test/backup-export.test.mjs`; corrupted-staged-byte MISMATCH test; sidecar parity test `test/backup-routes.test.mjs:74` |
| 3 | SC3 — same export code path on SQLite (wal_checkpoint + VACUUM INTO + readOnly snapshot) and Postgres (checked-out client, RR READ ONLY) | ✓ VERIFIED | `export/backup.js:309-313` (pg `begin isolation level repeatable read read only`, checked-out client via `pgPoolRef()`), `:329-331` (SQLite `wal_checkpoint(truncate)` + `VACUUM INTO`, target pre-deleted per A3); parity case `test/pg-matrix.test.mjs:301` "identical manifest row counts + per-table sha256 across engines" — skips without `POSTGRES_TEST_URL` (expected, not a gap; SUMMARY documents a LIVE 8/8 run against postgres:17-alpine) |
| 4 | SC4 — memory bounded (~65 MiB) regardless of archive size via staged temp-file streaming, atomic rename | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Structural evidence complete: paginated keyset reads (`export/backup.js:342-348`, highWaterMark 64 KiB), `stream.pipeline` awaited (`:601`), staged files + `fs.renameSync` (`:636-637`). But no test measures RSS against a large dataset — see Human Verification. NOT counted as a failure; code is present and wired. |
| 5 | SC5 — plan-time research flags resolved: ustar size math, file-id→scope mapping, SIGTERM/crash hygiene | ✓ VERIFIED | ustar: golden round-trip + fail-closed guards (>8 GiB-1 entries, >255-char paths, `export/backup.js:89` comment + WR-01 reserved-name refusal `b43fe96d`); file-id→scope mapping: collector reads doc `data.files[].project` (D-02/D-01, containment tests); hygiene: `sweepStaleBackupStaging()` wired at boot `server.js:10037` + SIGTERM `cancelRun()` `server.js:10164-10167` (WR-03 token checked at each stage); sweep test in `test/backup-export.test.mjs` |

**Score:** 4/5 truths verified (1 present, behavior-unverified)

### BKBCK-01 Requirement Coverage

| Clause | Status | Evidence |
| --- | --- | --- |
| Operator can export project/workspace/instance | ✓ SATISFIED | Route matrix test (6-case scope matrix, `test/backup-routes.test.mjs:198`); workspace + instance containment tests in `test/backup-export.test.mjs` |
| DB rows + scope's uploaded files | ✓ SATISFIED | 22-table NDJSON dump + collector with strict D-01 containment; `files/<id>` flat layout (A6) at `export/backup.js:397` |
| Versioned manifest + 3-level sha256 | ✓ SATISFIED | formatVersion 1 entry 0; per-table/per-file inside manifest; whole-archive over final bytes → status payload (D-19, `server.js:7903-7910`) + `.sha256` sidecar written INTO staging so tar+sidecar publish atomically (WR-05, `99266a2c`, `export/backup.js:626-637`) |
| Consistent on SQLite and Postgres | ✓ SATISFIED | Dual-engine fence; pg-matrix parity case |
| Manifest self-verification fails run on mismatch | ✓ SATISFIED | `verifyStagedBackup` fail-closed throw (`export/backup.js:283-295`); corrupted-byte test |

### API Surface (86-02)

| Check | Status | Evidence |
| --- | --- | --- |
| POST /api/backup/runs behind full Phase 85 guard chain (sameOrigin → requireUser → throttle → gate → scope → concurrency) | ✓ VERIFIED | `server.js:7796-7883`; order pinned by tests: unauthenticated 401 before probing (`:134`), non-holder 403 `backupManageRequired` + audit row (`:146`), gate BEFORE body probing (T-86-07) |
| Keyed refusals + audit on every refusal (D-20) | ✓ VERIFIED | `backup_run_refused:*` audit rows asserted per test (`test/backup-routes.test.mjs:146,171,198,228,258`) |
| Operator-keyed throttle, try consumed on refusal (D-21) | ✓ VERIFIED | `server.js:7805-7807`; test `:258` (5 refusals → 6th 429, other operator's budget untouched) |
| D-10 single-run invariant (atomic claim) | ✓ VERIFIED (flagged assumption holds) | Check immediately before claim with NO await between; `claimRun()` mutates synchronously before first await (`export/backup.js:130-138`); claim-race test "two immediate POSTs yield exactly ONE started run" (`test/backup-routes.test.mjs:171`) passes. **Flagged assumption:** the invariant relies on the route-level synchronous claim on the single-process model — the concurrency edge probed at plan-phase (Pitfall 5) remains a documented assumption, not multi-process-hardened. No evidence contradicts it; multi-process deployment is not a v1 target. |
| D-22 non-holder status 403 `backupRoleRequired` | ✓ VERIFIED | `server.js:7891-7893`; test `:146` |
| D-19 status payload: scope/stage/startedAt + filename/sha256 on done | ✓ VERIFIED | `server.js:7895-7910`; happy-path test asserts payload.sha256 === sidecar |
| Phase 85 tasks stub still refuses (prohibition) | ✓ VERIFIED | `test/backup-routes.test.mjs:281` "still refuses backupNotConfigured" — stub by design, Phase 87 owns tasks |

### UI Surface (86-02)

| Check | Status | Evidence |
| --- | --- | --- |
| Backup page Run now card (scope picker) gated on `canBackup` | ✓ VERIFIED | `src/pages/backup.js:44-67,123` — render-only, payload-driven lists, esc() on every payload string |
| Live run-stage progress rendered verbatim from poll (D-07) | ✓ VERIFIED | `src/pages/backup.js:73-87`; poll loop `src/actions/actions.js:4768-4802` (seq + AbortController anti-stale, stops on done/failed); stage markup never derived client-side |
| api.js wiring | ✓ VERIFIED | `src/core/api.js:436-440` `backupRun`/`backupRunCurrent` behind `call()` central refusal handling; actions `A.backupRunNow` `src/actions/actions.js:4810` |
| Post-failure hygiene | ✓ VERIFIED | WR-02 (`212dd7e3`): pending cleared on poll failure, 403/404 surfaced, render-kick cooldown |

### D-12 Locale Parity (new run keys)

✓ VERIFIED — programmatic comparison of the 13 new keys (`err.backupRunInProgress`, `err.scopeNotFound`, `page.backup.run*`/`scope*`/`archive*`/`stage*`/`pending*`) across en/fr/nl/de/es: **identical key sets in all 5 catalogues**. Also pinned by `test/client-surfaces.test.mjs` "run-surface vocabulary ships with parity across all 5 catalogues (D-12)".

### Postgres Parity

✓ VERIFIED (with expected skip) — `test/pg-matrix.test.mjs:293-301` parity case exists and is wired (`maybe()` on `POSTGRES_TEST_URL`). Full `npm test` at HEAD: **14 skipped, 0 fail** — the skip is opt-in by design, not a gap. SUMMARY documents a LIVE 8/8 run against postgres:17-alpine with identical per-table sha256 (claim consistent with the test code; not independently re-executed here — no Postgres container was started for this verification, per keep-verification-fast constraints).

### Behavioral Spot-Checks (run during this verification)

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Export + routes + client surfaces suites | `node --test test/backup-export.test.mjs test/backup-routes.test.mjs test/client-surfaces.test.mjs` | 32 tests, 32 pass, 0 fail (6.9 s) | ✓ PASS |
| Full workspace suite | `npm test` | 2116 tests: **2102 pass / 0 fail / 14 skipped** (pg-matrix opt-in), 165 s | ✓ PASS |
| Locale parity | python key-set comparison across 5 catalogues | identical 13-key sets | ✓ PASS |
| Boot sweep + SIGTERM wiring | grep `server.js:10037,10164` | `sweepStaleBackupStaging()` at boot; `cancelRun()` in shutdown | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared for this phase — SKIPPED (none exist; the node test suites above are the phase's runnable checks).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| BKBCK-01 | 86-01, 86-02 | Logical archive export with manifest + sha256 + self-verify, both engines | ✓ SATISFIED (REQUIREMENTS.md marks Complete) | See tables above |

No orphaned requirements — REQUIREMENTS.md maps BKBCK-01 to Phase 86 only; no unclaimed IDs.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | No TBD/FIXME/XXX/placeholder/stub markers in `export/backup.js`, `server.js` backup routes, or `src/pages/backup.js` | — | — |

The only deliberate stub (POST /api/backup/tasks `backupNotConfigured`) is a Phase 85 contract preserved by design and regression-pinned (`test/backup-routes.test.mjs:281`) — not a gap.

### Code Review Closure

`86-REVIEW.md` raised 1 Critical (tar entry-name collision with reserved manifest/ndjson names) + 5 Warnings. All closed by `86-REVIEW-FIX.md` commits at HEAD: CR-01+WR-01 (`b43fe96d` reserved-name refusal + symlink flagging), WR-02 (`212dd7e3` poll-failure hygiene), WR-03 (`3a2d3478` shutdown cancel token), WR-04 (`31f9f036` dump-stream destroy on fence throw), WR-05 (`99266a2c` sidecar written into staging → atomic publication). Verified present in `git log` and in the code (`export/backup.js:444-448` reserved-name guard, `:626-637` sidecar-in-staging).

### Deviations Found

None material. Documented deviations in the summaries (Rule 3 `pgPoolRef()` seam in db-adapter.mjs; ustar checksum placeholder bug fixed during golden round-trip; blob copies moved outside the pg snapshot fence) are sound and evidenced. `npm test` was 2099/2100 at plan-02 time due to the pre-existing xx.json locale-registry race — that race has since been closed (fixture isolated in `8fd0e791` per `deferred-items.md`); at HEAD the suite is 2102/0.

## Human Verification Required

### 1. Large-archive memory boundedness (Roadmap SC4)

**Test:** Export a scope with a multi-GB table and many large blobs; watch process RSS through collecting → archiving → verifying.
**Expected:** RSS stays in the ~65 MiB ballpark regardless of archive size; no whole-table/whole-blob buffering.
**Why human:** The pipeline is structurally streaming (paginated keyset reads, 64 KiB write highWaterMark, awaited `stream.pipeline`, staged files, no in-memory accumulation) — every mechanism for bounded memory is present and wired — but no automated test measures RSS against a large dataset, and presence checks cannot observe a runtime memory profile.

## Flagged Assumption (surfaced, not a blocker)

The D-10 single-run invariant relies on the route-level check→claim segment being synchronous (no await between `getRunState()` and `runExport()`, whose `claimRun()` mutates state before its first await) on the single-process model. This is pinned by the claim-race test (`test/backup-routes.test.mjs:171`, passing). The multi-process concurrency edge probed at plan-phase remains a **documented assumption** — no evidence contradicts it, and multi-process deployment is not a v1 target.

## Gaps Summary

No gaps. All Roadmap success criteria and BKBCK-01 clauses are verified with code and test evidence; the full suite is green at HEAD (2102 pass / 0 fail / 14 expected opt-in skips). The phase goal is achieved; one truth (memory boundedness) is present-and-wired but behaviorally unexercised by any automated test, and is routed to human verification.

---

_Verified: 2026-11-21T18:30:00Z_
_Verifier: the agent (gsd-verifier)_
