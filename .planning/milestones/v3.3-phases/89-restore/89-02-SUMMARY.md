---
phase: 89-restore
plan: 02
subsystem: backup
tags: [restore, sqlite, postgres, cas, concurrency, schema, mutual-exclusion, audit]

# Dependency graph
requires:
  - phase: 87-scheduler-tasks-run-history-rotation
    provides: backup_runs DDL + stale-running boot sweep idiom, persisted-run writer seam shape (setBackupRunWriter/emitRunEvent), skipped_overlap scheduler vocabulary, backup trigger guard chain
  - phase: 88-s3-destination
    provides: backup_tasks s3_enabled additive-migration precedent (CHECK-widening rebuild idiom unused here — pure additive DDL)
provides:
  - restore_runs + restore_lock tables on BOTH engines (SCHEMA + byte-identical SQLITE_SCHEMA twin, idempotent seed row, claimed_at in PG_EPOCH_COLUMNS)
  - writeRestoreRunRow writer seam (setRestoreRunWriter/emitRestoreRunEvent) emitting the full D-89-29 stage vocabulary best-effort with the 300-char error discipline
  - claimRestoreLock/releaseRestoreLock — the engine-neutral single-row CAS claim (D-89-31) + restoreLockHeld() probe
  - boot sweeps: stale running restore rows → interrupted/failed 'interrupted at boot'; held lock released at boot
  - D-89-1 export-side half: backup trigger 409 backupRestoreInProgress (audited) + scheduler skipped_overlap restore_in_progress while the lock is held
  - test/restore-routes.test.mjs harness (probe-route pattern) + pg-matrix restore inventory/pins
affects: [89-03, 89-04, 89-05, 89-06]

# Actuals (#2632)
actuals:
  tokens: 10701      # chars/4 over the realized diff (42804 chars, 5 files, 681 insertions)
  tasks: 3
  commits: 3
commits: 3
plan_head_before: 7ba770a0d34b3c248ff8efde31701d793c334a69
plan_head_after: 1be5f23ea250801869a657163da5329ffe131ed7

# Tech tracking
tech-stack:
  added: [] # zero npm deps (D-33-11) — Node stdlib only
  patterns: [single-row CAS claim (WHERE clause IS the compare-and-set, engine-neutral), coalesce-update writer events, boot sweep heals both run rows and lock claims, test-only probe route (RESTORE_TEST_TOKEN) driving server-internal helpers, runSchema ';-newline' comment discipline (comments never end a line with a semicolon)]

key-files:
  created:
    - test/restore-routes.test.mjs
  modified:
    - server.js
    - db-adapter.mjs
    - test/pg-matrix.test.mjs
    - test/backup-scheduler.test.mjs

key-decisions:
  - "Stale-restore sweep marks ALL running restore_runs rows interrupted (the 87 sweepStaleBackupRuns idiom verbatim — no time threshold; boot means nothing is in flight), stage 'failed', error 'interrupted at boot', finished_at stamped; the restore_lock release is an unconditional second UPDATE in the same sweep"
  - "Writer 'update' events use COALESCE per field — a partial event never wipes an earlier stage/snapshot/summary value; 'fail'/'finish' preserve summary/final_name the same way"
  - "skipped_overlap rows carry the skip reason in the backup_runs.error column ('restore_in_progress') — no new column, visible in existing history surfaces"
  - "restoreLockHeld() is a single row READ (never a claim-as-test, which would race); both D-89-1 refusal sites (manual trigger + scheduler pass) call the same helper (T-89-04)"
  - "The refusal code is exactly 'backupRestoreInProgress' (one code occurrence in server.js, comments excluded) — the shared vocabulary plan 04's restore-side half and plan 06's 5-locale key ride"
  - "Test-only /api/internal/restore-probe route (RESTORE_TEST_TOKEN-gated, the backup-scheduler-pass harness pattern) drives claim/release/emit for the suite — production 404s"

patterns-established:
  - "CAS-by-WHERE: the single-row claim's atomicity lives entirely in the UPDATE's WHERE clause (claimed_by is null), identical on sqlite and pg — no advisory locks (D-89-31)"
  - "Best-effort writer seam twin: every restore route emits start/update/fail/finish; writer exceptions swallowed, errors sliced to 300 chars"
  - "runSchema DDL contract: a comment line must never end with a semicolon — the ';-newline' statement split applies inside comments too"

requirements-completed: [BKRST-02, BKRST-03, BKRST-04]

coverage:
  - id: D1
    description: "restore_runs + restore_lock exist on BOTH engines after boot with the D-89-2/D-89-31 columns, CHECK-enforced stage vocabulary, idempotent seed row, restore_runs_created index, claimed_at in PG_EPOCH_COLUMNS; second boot is a no-op"
    requirement: BKRST-02
    verification:
      - kind: unit
        ref: "test/restore-routes.test.mjs#89-02 boot (tracer): restore_runs + restore_lock exist with the D-89-2/D-89-31 columns"
        status: pass
      - kind: unit
        ref: "test/restore-routes.test.mjs#89-02 boot: a second boot on the same db path is a no-op"
        status: pass
      - kind: unit
        ref: "test/db-adapter.test.mjs#SQLITE_SCHEMA mirror stays identical to server.js SCHEMA modulo comments/whitespace"
        status: pass
    human_judgment: false
  - id: D2
    description: "Boot sweeps: planted running restore rows become interrupted/failed with honest error text (done/failed untouched); a planted claimed restore_lock is released — on sqlite and, env-gated, on live pg"
    requirement: BKRST-02
    verification:
      - kind: unit
        ref: "test/restore-routes.test.mjs#89-02 boot sweep: planted running restore_runs rows become interrupted/failed"
        status: pass
      - kind: unit
        ref: "test/restore-routes.test.mjs#89-02 boot sweep: a planted claimed restore_lock is released"
        status: pass
      - kind: integration
        ref: "test/pg-matrix.test.mjs#pg matrix: restore_runs + restore_lock exist on pg; stale sweep interrupts running rows and releases the lock (89-02)"
        status: unknown
    human_judgment: true
    rationale: "The pg parity pin is POSTGRES_TEST_URL env-gated and no pg container was available this session — the suite skips cleanly (exit 0); the pin must be exercised against live Postgres before ship (docker runbook in the file header)."
  - id: D3
    description: "Engine-neutral restore_lock CAS: claim wins only on a free lock, second claim rejected with the row unchanged, non-holder release rejected, holder release clears claimed_by/claimed_at — identical semantics pinned on pg via the env-gated pin"
    requirement: BKRST-02
    verification:
      - kind: unit
        ref: "test/restore-routes.test.mjs#89-02 CAS: claim succeeds on a free lock; a second claim for another user fails"
        status: pass
      - kind: unit
        ref: "test/restore-routes.test.mjs#89-02 CAS: release is holder-checked"
        status: pass
      - kind: integration
        ref: "test/pg-matrix.test.mjs#pg matrix: restore_lock CAS claim/release behaves identically to sqlite under live pg (89-02)"
        status: unknown
    human_judgment: true
    rationale: "The pg CAS pin is POSTGRES_TEST_URL-gated and was not exercised this session (no container); sqlite semantics fully pinned, pg pin ready to run before ship."
  - id: D4
    description: "Restore run writer seam: start/update/fail/finish persist the D-89-29 stage vocabulary verbatim (coalesce-safe), errors sliced to 300 chars, planted writer exception swallowed — the caller never fails"
    requirement: BKRST-02
    verification:
      - kind: unit
        ref: "test/restore-routes.test.mjs#89-02 writer: start/update/fail persist the D-89-29 stage vocabulary verbatim"
        status: pass
      - kind: unit
        ref: "test/restore-routes.test.mjs#89-02 writer: finish lands status/stage done"
        status: pass
      - kind: unit
        ref: "test/restore-routes.test.mjs#89-02 writer: a planted writer exception (CHECK violation) never fails the caller"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-89-1 export-side half: while the lock is held the manual backup trigger returns 409 backupRestoreInProgress with an audited backup_run_refused:restoreInProgress row and no backup_runs row; a scheduler fire records skipped_overlap/restore_in_progress and starts no export; free-lock behavior byte-identical (87/88 suites green)"
    requirement: BKRST-03
    verification:
      - kind: unit
        ref: "test/restore-routes.test.mjs#89-02 mutual exclusion: a held restore lock refuses the manual backup trigger keyed + audited"
        status: pass
      - kind: unit
        ref: "test/backup-scheduler.test.mjs#a sweep fire while a restore lock is held records skipped_overlap with reason restore_in_progress"
        status: pass
      - kind: unit
        ref: "test/backup-routes.test.mjs (free-lock regression control, 29/29 green)"
        status: pass
    human_judgment: false

# Metrics
duration: 13min
completed: 2026-11-22
status: complete
---

# Phase 89 Plan 02: Restore Persistence Substrate Summary

**restore_runs + restore_lock on both engines (single-row CAS, D-89-31), the D-89-29 stage-vocabulary writer seam, boot sweeps that heal stale runs and release stale claims, and the D-89-1 export-side mutual exclusion (trigger 409 + scheduler skipped_overlap while a restore holds the lock)**

## Performance

- **Duration:** 13 min
- **Started:** 2026-11-22T19:22Z
- **Completed:** 2026-11-22T19:35Z
- **Tasks:** 3
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments

- `restore_runs` (D-89-2 lifecycle, D-89-29 stage CHECK) and `restore_lock` (single-row CAS with idempotent seed) live on BOTH engines — appended to the server.js SCHEMA block, mirrored byte-identically into db-adapter.mjs SQLITE_SCHEMA (mirror-sync test green), `claimed_at` registered in PG_EPOCH_COLUMNS
- `sweepStaleRestoreRuns()` wired in main(): stale running rows → interrupted/failed 'interrupted at boot', held lock released — before the first trigger or scheduler tick
- `writeRestoreRunRow` + `setRestoreRunWriter`/`emitRestoreRunEvent`: the best-effort writer seam (start/update/fail/finish) persisting the full stage vocabulary with COALESCE-safe updates and the slice(0,300) error discipline
- `claimRestoreLock`/`releaseRestoreLock`: atomic single-row CAS (WHERE clause is the compare-and-set, engine-neutral — no advisory locks), holder-checked release, plus the `restoreLockHeld()` probe
- D-89-1 export-side half: backup trigger refuses 409 `backupRestoreInProgress` (audited `backup_run_refused:restoreInProgress`, no run row) and the scheduler records `skipped_overlap` / `restore_in_progress` instead of firing — free-lock behavior unchanged (29/29 regression suites green)

## Task Commits

Each task was committed atomically (TDD RED→GREEN per task):

1. **Task 1: restore_runs + restore_lock schema on both engines + boot sweeps (tracer)** — `6a1d9d24` (feat) — tracer verify re-run end-to-end green before expansion
2. **Task 2: restore run writer seam + restore_lock CAS claim/release helpers** — `fd37d12f` (feat)
3. **Task 3: Mutual exclusion export-side half (D-89-1)** — `1be5f23e` (feat)

## Files Created/Modified

- `server.js` — SCHEMA additions (restore_runs/restore_lock/seed), sweepStaleRestoreRuns + main() wiring, writer seam + writeRestoreRunRow, lock helpers, restore-lock refusal in the backup trigger + scheduler pass, RESTORE_TEST_TOKEN-gated probe route
- `db-adapter.mjs` — SQLITE_SCHEMA twin (byte-identical DDL + seed), claimed_at in PG_EPOCH_COLUMNS
- `test/restore-routes.test.mjs` — NEW: the restore persistence suite (boot/tracer, second-boot no-op, sweeps, CAS, writer seam, mutual-exclusion route pin)
- `test/pg-matrix.test.mjs` — restore tables join the COUNT_TABLES inventory + two env-gated pg pins (sweep/parity, CAS)
- `test/backup-scheduler.test.mjs` — scheduler fire-under-lock pin + free-lock control

## Decisions Made

- Stale sweep marks ALL running restore rows (87 idiom verbatim — the plan's "older than the stale threshold" phrasing had no analog; the 87 sweep has no threshold and boot means nothing is in flight)
- Writer update events are COALESCE-per-field — partial events never wipe earlier values; fail/finish preserve summary/final_name
- skipped_overlap rows carry the reason ('restore_in_progress') in the existing backup_runs.error column — no schema change, visible in current history surfaces
- restoreLockHeld() is a pure row read shared by both refusal sites (claim-as-test would race; T-89-04)
- Test-only probe route (RESTORE_TEST_TOKEN) exposes the server-internal claim/release/emit helpers to the suite — the scheduler-pass harness pattern; production 404s

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SCHEMA comments ending a line with a semicolon broke the runSchema statement split**
- **Found during:** Task 1 (GREEN)
- **Issue:** comments inside the new DDL contained `;` at end-of-line; runSchema splits statements on `;\n` even inside comments, producing comment-only fragments → boot failed with "The SQL query contains no statements" (the db-adapter.mjs:414-417 convention the plan warned about)
- **Fix:** reworded both SCHEMA comments so no line ends with a semicolon
- **Files modified:** server.js, db-adapter.mjs
- **Verification:** restore-routes + db-adapter suites green; boot clean
- **Committed in:** 6a1d9d24

**2. [Rule 1 - Bug] restore_lock seed insert missing its trailing semicolon**
- **Found during:** Task 1 (GREEN)
- **Issue:** the seed statement must terminate with `;\n` to survive the ';-newline' split (and not merge with the following statement fragment in the mirror schema)
- **Fix:** added the trailing semicolon in both files
- **Files modified:** server.js, db-adapter.mjs
- **Verification:** boot clean, second-boot no-op pin green
- **Committed in:** 6a1d9d24

---

**Total deviations:** 2 auto-fixed (2 × Rule 1 bugs, both caught by the TDD pins before commit)
**Impact on plan:** Both were correctness bugs in the new DDL text caught by this plan's own tests. No scope creep; no architectural changes.

## Issues Encountered

- No Postgres container available this session — the pg-matrix pins skip cleanly (exit 0), which is the plan's documented pass state when POSTGRES_TEST_URL is absent. Run the pg matrix (docker runbook in the file header) at least once before ship.
- Pre-existing untracked `"[object Promise]/"` directory at the repo root — out of scope, untouched (already logged to deferred-items by 89-01).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plans 03–06 consume: restore_runs rows via emitRestoreRunEvent (start/update/fail/finish), the restore_lock CAS (claim in trigger, release in finally), restoreLockHeld() for the restore-side refusal half (plan 04 emits the symmetric backupRunInProgress refusal), and the boot sweeps already wired.
- Plan 04 must add: the restore trigger routes (guard chain + restore_lock claim + keyed refusals), the 5-locale keys for backupRestoreInProgress (plan 06 rides the same commit rule as 87's handoff).
- The probe route stays RESTORE_TEST_TOKEN-gated; plan 04's route tests can reuse the harness in test/restore-routes.test.mjs (makeBackupOp + probe + withDb are already there).

---
*Phase: 89-restore*
*Completed: 2026-11-22*

## Self-Check: PASSED

SUMMARY on disk; all task commits (`6a1d9d24`, `fd37d12f`, `1be5f23e`) + SUMMARY commit (`d98537bc`) present in history; commit count measured from the plan ledger (`3` since `7ba770a0`); final plan verification 32/32 green (restore-routes + backup-scheduler + backup-routes); pg-matrix skips cleanly with POSTGRES_TEST_URL absent (env-gated pins to exercise before ship).
