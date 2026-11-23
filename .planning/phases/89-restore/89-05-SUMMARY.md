---
phase: 89-restore
plan: 05
subsystem: backup/restore
tags: [restore, overwrite, disaster-recovery, tdd, sqlite, transactions, session-revocation]

requires:
  - phase: 89-restore plan 04 (89-04)
    provides: import engine + verifyRestored machinery, restore outcome emails via the outbox transition gate, POST /api/backup/restore trigger funnel
  - phase: 86-export-core
    provides: runExport core (the pre_restore snapshot path), archive format v1, sha256 canonical statement
  - phase: 89-restore plan 01-03
    provides: extractArchive + reader gate (D-89-33 families), restore_runs/restore_lock substrate, CAS lock + writer seam, keyed refusal vocabulary
provides:
  - restoreOverwriteUnit — guarded destructive overwrite: automatic pre_restore snapshot via the 86 runExport core BEFORE any mutation, staged EXDEV-safe blob swap, one transaction with D-89-30 verification pre-commit, snapshot-repair net for post-mutation failures
  - restoreInstanceUnit — Super-Admin-only instance DR: data-table replacement doc-and-all, instance_roles rebuild excepted from the operational skip with live-user validation, strictly post-commit global session revocation
  - POST /api/backup/restore/overwrite — full D-89-21/22/27 stack server-side (CAP.BACKUP_MANAGE, confirmName re-validated against the live row's CURRENT name, scope/kind match, D-89-1 concurrency slot)
  - POST /api/backup/restore/instance — RESTORE-INSTANCE phrase re-validation, operatorOnly refusal, fire-and-forget DR
  - D-89-28 enforcement: DR runs skip the outcome-email gate (re-login wall is the notification)
  - D-89-1 mutual exclusion proven end-to-end in the overwrite direction (export-active + held-lock refusals)
affects: [89-06 client UI (overwrite/DR dialogs + locale keys), 90-polish, 89-SECURITY contract (threats_open: 0), gsd-verify-work UAT]

tech-stack:
  added: []
  patterns:
    - "Destructive-trigger guard chain: sameOrigin → requireUser → operator-keyed throttle (consuming a try) → capability gate keyed + audited → body regex → live-row phrase re-validation BEFORE archive resolution → scope/kind match → D-89-1 concurrency slot → CAS lock claim → start row → fire-and-forget unit"
    - "Unit-owned lock release: the route always claims before firing; the unit releases via the failWith funnel + the success path (D-89-32 finally discipline)"
    - "Snapshot-first ordering: the pre_restore net is unconditional and precedes every scope re-check (the engine never trusts its caller)"

key-files:
  created:
    - test/restore-instance.test.mjs
    - .planning/phases/89-restore/tdd/red-89-05-task1.json
    - .planning/phases/89-restore/tdd/red-89-05-task2.json
    - .planning/phases/89-restore/tdd/red-89-05-task3.json
  modified:
    - export/restore.js
    - export/backup.js
    - server.js
    - test/restore-overwrite.test.mjs
    - test/restore-routes.test.mjs

key-decisions:
  - "restoreOverwriteUnit consumes releaseLock — the failWith funnel releases on every keyed exit and the success path releases after the sweep (D-89-32); found green-side by the route success cell's lock assertion"
  - "D-89-28 enforced server-side: handleRestoreRunOutcome skips trigger='instance' runs — until this plan the skip existed only as a comment and the DR no-claims test passed solely because its fixture left MAILER disabled"
  - "Overwrite route validates confirmName against the target's exact CURRENT live name (D-89-27) BEFORE archive resolution — a refused phrase is a near-zero-read trigger; capability gate keyed with the existing backupManageRequired code (no new refusal code)"
  - "Task 3 RED evidence re-captured after the prior executor stalled: its fixture crashed on node:sqlite array-params (Unknown named parameter '0') which leaked child servers and hung the runner — fixed, evidence re-captured, RED_EVIDENCE_OK"
  - "All three TDD evidence records committed (.planning/phases/89-restore/tdd/red-89-05-task{1,2,3}.json) so the RED gate is auditable in-repo"

patterns-established:
  - "Destructive-route guard chain (see provides) — both overwrite and DR ride one verbatim funnel"
  - "Server-side confirm re-validation reads the LIVE row's current value — the client confirmModal is chrome, never the boundary"
  - "Persistent-DatabaseSync reader per route-test world (open/close-cycle readers checkpoint + drop the server's WAL mid-flight — bisected 2026-11-22)"

requirements-completed: [BKRST-03, BKRST-04]

coverage:
  - id: D1
    description: "Overwrite engine unit end-to-end: pre_restore snapshot exists BEFORE any mutation (audit restore_snapshot_started:pre_restore), replacement never merge with workspace identity preserved, memberships replace-with-validation + operator retention, EXDEV-safe staged blob swap, repair net proven by the mid-tx failure test, entry-gate refusal fails keyed before any write"
    requirement: BKRST-03
    verification:
      - kind: unit
        ref: "tests/test/restore-overwrite.test.mjs#89-05 snapshot-first ordering (P7/D-89-5)"
        status: pass
      - kind: unit
        ref: "tests/test/restore-overwrite.test.mjs#89-05 overwrite replaces the data exactly with identity preserved"
        status: pass
      - kind: unit
        ref: "tests/test/restore-overwrite.test.mjs#89-05 repair net (D-89-3)"
        status: pass
      - kind: unit
        ref: "tests/test/restore-overwrite.test.mjs#89-05 memberships replace-with-validation"
        status: pass
    human_judgment: false
  - id: D2
    description: "POST /api/backup/restore/overwrite: Backup Operator + exact CURRENT name → 200 {runId} with the run landing done (trigger overwrite); near-miss phrase matrix (case/trailing space/substring) → keyed confirmPhraseMismatch + audited ×3, zero state change; instance-archive-vs-workspace-target → restoreTargetMismatch before any lock claim; restore_operator/plain member → 403 backupManageRequired + audited; throttle 5/15min consuming a try, 6th attempt 429"
    requirement: BKRST-03
    verification:
      - kind: integration
        ref: "tests/test/restore-overwrite.test.mjs#89-05 overwrite route (BKRST-03)"
        status: pass
      - kind: integration
        ref: "tests/test/restore-overwrite.test.mjs#89-05 overwrite route: near-miss confirmName"
        status: pass
      - kind: integration
        ref: "tests/test/restore-overwrite.test.mjs#89-05 overwrite route: kind mismatch"
        status: pass
      - kind: integration
        ref: "tests/test/restore-overwrite.test.mjs#89-05 overwrite route role-gate"
        status: pass
      - kind: integration
        ref: "tests/test/restore-overwrite.test.mjs#89-05 overwrite route throttle"
        status: pass
    human_judgment: false
  - id: D3
    description: "Instance DR (BKRST-04): Super Admin + RESTORE-INSTANCE phrase → data tables replaced doc-and-all in one tx; instance_roles rebuilt EXCEPTED from the operational skip with per-row live-user validation (skip+report); global session revocation strictly POST-commit including the initiator (negative test pins no pre-commit revocation); instance live mid-restore; non-Super-Admins 403 operatorOnly + audited; run summary carries the operational skip report"
    requirement: BKRST-04
    verification:
      - kind: unit
        ref: "tests/test/restore-instance.test.mjs#89-05 DR (BKRST-04)"
        status: pass
      - kind: unit
        ref: "tests/test/restore-instance.test.mjs#89-05 DR revocation is strictly POST-commit"
        status: pass
      - kind: unit
        ref: "tests/test/restore-instance.test.mjs#89-05 DR keeps the instance live mid-restore"
        status: pass
      - kind: integration
        ref: "tests/test/restore-instance.test.mjs#89-05 DR route role-gate matrix"
        status: pass
      - kind: integration
        ref: "tests/test/restore-instance.test.mjs#89-05 DR route E2E"
        status: pass
    human_judgment: false
  - id: D4
    description: "Overwrite-direction mutual exclusion: an active export refuses POST /api/backup/restore/overwrite 409 backupRestoreInProgress + audited with no run row; a held restore_lock refuses identically (completes the D-89-1 matrix started in 89-02 Task 3)"
    requirement: BKRST-03
    verification:
      - kind: integration
        ref: "tests/test/restore-routes.test.mjs#89-05 mutual exclusion, overwrite direction"
        status: pass
    human_judgment: false
  - id: D5
    description: "Full D-89-1 both-directions matrix under realistic concurrency + destructive-path edge states beyond the pinned cells (the plan's flagged assumption: edge coverage unclassified — additional states route to /gsd-verify-work UAT rather than being dropped)"
    verification: []
    human_judgment: true
    rationale: "The scheduler-side half passes solo (13/13) but is load-flaky under npm-test parallelism, and the plan explicitly routes unclassified destructive-edge states to UAT; a human should re-run the matrix on a quiet system and probe overwrite/DR edges."
  - id: D6
    description: "Shared machinery and free-path behavior unregressed: restore-import, backup-routes, backup-scheduler suites green; npm test baseline identical to the 89-04 close-out (2263+/2287 with only the ledgered pre-existing failures)"
    verification:
      - kind: unit
        ref: "command:node --test test/backup-routes.test.mjs test/backup-scheduler.test.mjs test/restore-import.test.mjs (29/29)"
        status: pass
      - kind: other
        ref: "command:npm test — failure set byte-identical to the 89-04 deferred-items ledger (webhook-events, webhook-routes date-drift, error-codes, french-typography; backup-scheduler only under parallel load)"
        status: pass
    human_judgment: false
  - id: D7
    description: "PG-parity pins (restore tx/lock + DR pipeline stage) green at least once with POSTGRES_TEST_URL set"
    verification: []
    human_judgment: true
    rationale: "Plan verification defers this to ship time ('before ship') and POSTGRES_TEST_URL was unset in this environment — the pins skip on SQLite-only runs; must run once before /gsd-ship."

duration: 41min
completed: 2026-11-23
status: complete
---

# Phase 89 Plan 05: Restore Overwrite + Instance DR (BKRST-03/04) Summary

**Guarded overwrite + Super-Admin-only instance DR: snapshot-first destructive units behind server-revalidated type-to-confirm routes, with the D-89-1 mutual exclusion proven end-to-end**

## Performance

- **Duration:** 41 min (this session — Task 3 resume; Tasks 1-2 were committed by the stalled prior executor and reconciled from the git ledger)
- **Started:** 2026-11-23T05:34Z
- **Completed:** 2026-11-23T06:15Z
- **Tasks:** 3
- **Files modified:** 9 (6 code/test + 3 TDD evidence records)

## Accomplishments

- **restoreOverwriteUnit** — the guarded overwrite: automatic pre_restore snapshot through the 86 runExport core BEFORE any mutation (flag 1 resolution: tag on restore_runs + audit, backup_runs.trigger untouched), engine-side scope re-checks, entry-gate totality refusal (D-89-33 families 2/3), one transaction with D-89-30 verification pre-commit, staged EXDEV-safe blob swap, snapshot-repair net proven by the mid-tx failure test, membership replace-with-validation + operator retention (flag 3)
- **restoreInstanceUnit + POST /api/backup/restore/instance** — Super-Admin-only DR (CAP.INSTANCE_ROLES_MANAGE short-circuit), RESTORE-INSTANCE phrase re-validated server-side, data-table replacement doc-and-all, instance_roles rebuild with live-user validation (prohibition P9), strictly post-commit global session revocation with the negative test pinning the ordering (D-89-25), live-instance semantics (D-89-26), no email claims (D-89-28)
- **POST /api/backup/restore/overwrite** — the full guard stack server-side: throttle 5/15min consuming a try, CAP.BACKUP_MANAGE gate keyed backupManageRequired, confirmName re-validated against the live row's exact CURRENT name (D-89-27/P8) before archive resolution, scope/kind match before any lock claim, D-89-1 concurrency slot, CAS claim + start row trigger 'overwrite' + fire-and-forget + audited
- **D-89-28 now enforced** — DR runs skip the outcome-email gate (until this plan the skip existed only as a comment; the DR no-claims test passed solely because its fixture left MAILER disabled)
- **D-89-1 mutual exclusion completed in the overwrite direction** — export-active and held-lock overwrite triggers refuse 409 backupRestoreInProgress + audited, keyed identically with the import/scheduler halves

## Task Commits

Each task produced RED → GREEN atomic commits (measured against plan ledger a6c8da59):

1. **Task 1: Overwrite unit tracer** — `e73dc180` (test RED) + `9c34da30` (feat GREEN) — prior executor
2. **Task 2: Instance DR unit + route** — `1db19fa9` (test RED) + `6150d909` (feat GREEN) — prior executor
3. **Task 3: Overwrite route + mutual exclusion** — `ad867909` (test RED) + `84d248ef` (feat GREEN) — this session

**Plan metadata:** (docs commit follows this SUMMARY)

## Files Created/Modified

- `export/restore.js` — restoreOverwriteUnit + restoreInstanceUnit engines; this session: releaseLock consumption (failWith funnel + success path, D-89-32)
- `export/backup.js` — writer-seam adjustment for the DR unit (task 2)
- `server.js` — POST /api/backup/restore/instance + POST /api/backup/restore/overwrite; this session: restoreOverwriteUnit import, the overwrite route, handleRestoreRunOutcome instance-skip (D-89-28)
- `test/restore-overwrite.test.mjs` — 7 engine cells + 6 route cells; this session: fixture fixes (node:sqlite spread params ×3, closeWorld temp path, MAIL_FROM env)
- `test/restore-instance.test.mjs` — 8 DR cells (engine + route)
- `test/restore-routes.test.mjs` — the overwrite-direction mutual-exclusion cell completing the D-89-1 matrix
- `.planning/phases/89-restore/tdd/red-89-05-task{1,2,3}.json` — TDD RED evidence records (RED_EVIDENCE_OK)

## Decisions Made

- restoreOverwriteUnit owns releasing the route's lock claim on every exit (failWith funnel + success path) — the D-89-32 "release in finally" discipline without restructuring the unit
- D-89-28's DR email-skip is enforced in handleRestoreRunOutcome by reading the run row's trigger — non-DR triggers (import_new/overwrite) claim as before
- confirmName validation reads the CURRENT live row before archive resolution — a refused phrase costs two reads and zero state
- Task 3's RED evidence was re-captured fresh after the prior executor stalled: never commit RED evidence whose failures do not match the actual failing cells (the prior fixture crashed instead of failing intentionally)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prior-session RED fixture crashed instead of failing intentionally**
- **Found during:** Task 3 (RED reconciliation)
- **Issue:** `bootOverwriteWorld`/outbox cell passed node:sqlite parameters as a single array (`ro.run(sql, [a,b,…])` → "Unknown named parameter '0'"), boot threw before each test's `try/finally`, leaking child servers and hanging the runner; `closeWorld` also removed the wrong temp path (basename-join instead of dirname)
- **Fix:** spread the parameter arrays (×3) and fix the cleanup path
- **Files modified:** test/restore-overwrite.test.mjs
- **Verification:** RED re-captured — 7 route cells fail 404 on the missing route, 25 pass; runner exits cleanly in ~5s
- **Committed in:** ad867909

**2. [Rule 1 - Bug] restoreOverwriteUnit never consumed releaseLock**
- **Found during:** Task 3 (GREEN — route success cell failed "the lock released": claimed_by stayed set after done)
- **Issue:** the unit ignored `opts.releaseLock` entirely (runRestore and restoreInstanceUnit both honor it) — every route-triggered overwrite leaked the restore_lock claim, deadlocking the pipeline for all later triggers
- **Fix:** destructure releaseLock, `release()` inside failWith (every keyed exit) + after the success sweep
- **Files modified:** export/restore.js
- **Verification:** success cell green — lock null after done; 40/40 suite green
- **Committed in:** 84d248ef

**3. [Rule 1 - Bug] Outbox fixture env missing MAIL_FROM**
- **Found during:** Task 3 (GREEN — outbox cell saw 0 claims)
- **Issue:** mailer readConfig refuses SMTP_HOST without MAIL_FROM → MAILER.enabled false → the cell's world silently produced zero claims
- **Fix:** added MAIL_FROM + APP_URL to the cell's env (the backup-rotation SMTP_ENV idiom)
- **Files modified:** test/restore-overwrite.test.mjs
- **Verification:** outbox cell green — exactly 2 claims (Backup Operator ∪ Super Admin), kind restore_alert, ctx.outcome done
- **Committed in:** 84d248ef

**4. [Rule 2 - Missing Critical] D-89-28 DR email-skip was documented but not enforced**
- **Found during:** Task 3 (GREEN, while wiring the overwrite outbox path)
- **Issue:** handleRestoreRunOutcome claimed outcome emails for EVERY trigger including 'instance' — the DR no-claims test (task 2) passed only because its fixture never enabled MAILER; a DR with SMTP configured would have emailed every operator mid-force-logout
- **Fix:** read the run row's trigger; `trigger === 'instance'` → return before the recipients query (comment updated from "deliberately skips" to enforced)
- **Files modified:** server.js
- **Verification:** DR E2E still asserts zero claims; overwrite outbox cell asserts 2 claims for trigger 'overwrite'
- **Committed in:** 84d248ef

**5. [Rule 3 - Blocking] Prior-session stall reconciliation**
- **Found during:** Task 3 resume
- **Issue:** the prior executor stalled mid-Task-3 leaving uncommitted test diffs whose RED state was a fixture crash, not an intentional failure (INVALID_RED would have blocked GREEN)
- **Fix:** reconciled from the git ledger (4 task commits verified), completed the stated intent afresh: fixtures fixed → evidence re-captured → `gsd_run check tdd-red-evidence` RED_EVIDENCE_OK → RED commit → route implemented → GREEN
- **Files modified:** (see 1) — no production code was written before the RED gate cleared
- **Verification:** RED_EVIDENCE_OK verdict recorded in red-89-05-task3.json
- **Committed in:** ad867909, 84d248ef

---

**Total deviations:** 5 auto-fixed (2 test-fixture bugs, 1 engine lock-leak bug, 1 missing enforcement, 1 resume reconciliation)
**Impact on plan:** all fixes were required for the plan's own acceptance criteria to hold (the lock leak directly contradicts the D-89-32 must-have; the D-89-28 enforcement is a locked decision). No scope creep.

## TDD Gate Compliance

| Task | RED | GREEN | REFACTOR | Status |
|------|-----|-------|----------|--------|
| 1 | e73dc180 | 9c34da30 | — | Pass |
| 2 | 1db19fa9 | 6150d909 | — | Pass |
| 3 | ad867909 | 84d248ef | — | Pass |

- Task 3's RED evidence validated via `gsd_run check tdd-red-evidence` → **RED_EVIDENCE_OK** (target test failed on 404-vs-200/400/403/409 — the missing route, an intentional failure)
- Tasks 1-2 evidence records committed alongside task 3's for in-repo auditability
- No REFACTOR commits — the GREEN implementations followed the house idioms directly (verified against the DR funnel for the route and restoreInstanceUnit's release discipline for the unit)

## Issues Encountered

- **Prior executor stall:** diagnosed as the fixture-parameter crash (deviation 1) — the leaked child servers kept the test runner alive indefinitely. All four committed task commits were verified sound before resuming.
- **npm test baseline:** 2263+/2287 with failures byte-identical to the 89-04 deferred-items ledger (webhook-events documented since 78-01; webhook-routes date-drift; error-codes `en missing err.backupRestoreInProgress` and french-typography — both verified pre-existing by re-running at eeb6bbed and at STATE.md's state_head 7fdbe257; backup-scheduler skipped_overlap green solo 13/13, load-flaky only under npm-test parallelism). **No new failures introduced by 89-05.**
- A stray `node server.js` process (leaked by the prior session's test runs, since 2026-11-22 ~23:29) is still running on this machine — user cleanup decision, left alone.

## Known Stubs

- `buildRestoreAlertMessage` renders EN literals for `restore.alert.*` until plan 06's locale keys land ×5 locales — carried handoff from 89-04 (documented in deferred-items.md), not a stub introduced by this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both destructive routes + engines are live and gated server-side — plan 06 (client) can wire the overwrite/DR dialogs against the committed UI-SPEC sentences and land the ×5 locale keys (including `err.*` catalogue entries the error-codes test will keep demanding)
- **Before /gsd-ship:** run the PG-parity pins once with POSTGRES_TEST_URL set (plan verification text; skipped SQLite-only here)
- The D-89-33 threat families each carry a pinned mitigation test — the 89-SECURITY contract input is ready
- Phase 89's remaining plan: 06 only. After it: `/gsd-verify-work` (the destructive-path edge states route there by design)

---
*Phase: 89-restore*
*Completed: 2026-11-23*
