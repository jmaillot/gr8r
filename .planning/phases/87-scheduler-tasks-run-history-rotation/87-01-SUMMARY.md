---
phase: 87-scheduler-tasks-run-history-rotation
plan: 01
subsystem: backup-tasks
tags: [backup, cron, ddl, crud, i18n, audit]
requires: [phase-86-backup-export-pipeline, phase-85-instance-roles]
provides: [backup_tasks-table, backup_runs-table, export/cron.js, /api/backup/tasks CRUD, keyed task refusals ×5 locales]
affects: [87-02-scheduler, 87-03-run-history, 87-04-client-builder]
tech-stack:
  added: [] # zero new dependencies (stdlib Intl cron, D-33-11 discipline)
  patterns: [frozen-guard-chain, keyed-5-locale-refusals, audited-refusal-funnel, mirror-sync-schema, injectable-pure-evaluator]
key-files:
  created:
    - export/cron.js
    - test/backup-cron.test.mjs
    - test/backup-tasks-api.test.mjs
  modified:
    - server.js
    - db-adapter.mjs
    - test/backup-routes.test.mjs
    - test/instance-roles-api.test.mjs
    - src/locales/en.json
    - src/locales/fr.json
    - src/locales/es.json
    - src/locales/de.json
    - src/locales/nl.json
key-decisions:
  - "D-04 one-way stored raw 5-field cron string — owner-ratified at execute-phase 2026-11-21 (checkpoint task 1); next_run_at is a persisted cache, never re-parsed at tick"
  - "Task-identity model ratified: backup_runs.task_id NULL = manual Run-now archive outside rotation (D-11); scheduled filenames task-scoped, manual frozen per 86-D-14"
  - "Default task timezone ratified: resolveTz(null) → Europe/Paris (users DDL has no tz column — verified server.js:328-349); operator picks via form combobox (D-02)"
  - "Scope refusal keyed backupInvalidScope — err.invalidScope already existed (project-perms meaning); same code/two meanings would render the wrong message (keyed-refusal contract)"
  - "Name refusal reuses the pre-existing generic err.taskNameRequired; dead err.backupNotConfigured removed ×5 (stub gone)"
  - "Bounded horizon enforced as ~366 days: a skipped day costs 1440 scan-units of MAX_SCAN_MINUTES=527040, so far-from-any-match crons return documented null"
requirements-completed: [BKBCK-02, BKBCK-03]
coverage:
  - deliverable: backup_tasks/backup_runs DDL (SCHEMA + pg mirror + PG_EPOCH_COLUMNS)
    verification: { kind: test, ref: "test/db-adapter.test.mjs mirror-sync + fresh-17-tables→19 test + test/backup-tasks-api.test.mjs row assertions", status: pass, human_judgment: false }
  - deliverable: export/cron.js pure evaluator (parseCron + nextRunAt, full grammar)
    verification: { kind: test, ref: "test/backup-cron.test.mjs — 12/12 grammar/DST/OR/dow7/leap/horizon cases", status: pass, human_judgment: false }
  - deliverable: POST/GET /api/backup/tasks (create stores raw cron + computed next_run_at, list with capability flags)
    verification: { kind: test, ref: "test/backup-tasks-api.test.mjs happy path — withDb asserts stored cron == posted string, next_run_at integer ∈ nextRunAt window", status: pass, human_judgment: false }
  - deliverable: PUT/DELETE + enable/disable recompute semantics (D-07)
    verification: { kind: test, ref: "test/backup-tasks-api.test.mjs — recompute direction via nextRunAt, disable → NULL, re-enable → fresh future instant, DELETE history persists", status: pass, human_judgment: false }
  - deliverable: keyed refusal matrix, every refusal audited
    verification: { kind: test, ref: "test/backup-tasks-api.test.mjs refusal tests + test/error-codes.test.mjs reverse parity 24/24", status: pass, human_judgment: false }
  - deliverable: refusal keys in en/fr/es/de/nl (same-commit i18n parity)
    verification: { kind: test, ref: "test/backup-tasks-api.test.mjs 5-locale parity test + npm run i18n:scan — 0 dead/0 stale", status: pass, human_judgment: false }
  - deliverable: checkpoint ratifications (D-04 + identity model + default tz)
    verification: { kind: checkpoint, ref: "owner approved all three at execute-phase 2026-11-21 (checkpoint return, task 1)", status: pass, human_judgment: true, rationale: "one-way planning decision — owner ratification is the verification" }
estimate:
  tokens: 90000
actuals:
  tokens: 73000 # chars/4 over the realized diff (~293k chars across 12 files)
  tasks: 4
  commits: 3
  plan_head_before: cc2dd491e6d882bc11b1e6319e1c3fbc1fba43f9
plan_head_after: 12b11763
duration: 30m
completed: 2026-11-21
status: complete
---

# Phase 87 Plan 01: Task DDL + Cron Evaluator + CRUD API Summary

Database foundation (backup_tasks/backup_runs), a zero-dep pure cron evaluator with the full grammar + DST contract, and complete task CRUD with keyed 5-locale refusals and audit — one-way D-04 raw-cron storage ratified by the owner before any DDL landed. 30m (21:43–22:13 UTC), 4 tasks, 3 production commits, 12 files.

## What shipped

- **DDL (server.js SCHEMA + db-adapter.mjs mirror):** `backup_tasks` (raw `cron` text — D-04, `tz` default Europe/Paris, `enabled`, retention 7/4/12/5 — D-09, persisted `next_run_at` cache, `last_notified_state` — D-15) and `backup_runs` (CHECK-constrained `trigger`/`status` enums incl. `skipped_overlap`/`deleted`, `task_id` NULL = manual archive — D-11, history never cascades). `next_run_at`/`started_at`/`finished_at` registered in `PG_EPOCH_COLUMNS`; mirror-sync test pins both copies.
- **export/cron.js (repo root, zero imports):** `parseCron` full grammar (lists/ranges/range-steps/steps, 0-59/0-23/1-31/1-12/dow 0-7 with 7≡0, vixie dom/dow OR, malformed → null) and `nextRunAt` minute-by-minute fresh-Intl forward scan (spring-forward skips nonexistent wall times → next-day match; fall-back picks the earlier ambiguous instant; ~366-day bounded horizon → documented null).
- **API:** POST/GET/PUT/DELETE `/api/backup/tasks[/:id]` replacing the Phase 85 stub — frozen guard chain verbatim (sameOrigin → requireUser → throttle → capability gate → body), gate before body probing (T-87-02), every mutation + refusal audited through the 12-column funnel. POST stores the raw cron string and computes `next_run_at` in the same write; PUT recomputes on schedule/tz change from now; disable → NULL, re-enable always recomputes (D-07); DELETE cascades nothing.
- **i18n:** invalidSchedule/invalidTimezone/backupInvalidScope/invalidRetention (+ generic taskNameRequired/taskNotFound) in all five locales, same commit; dead backupNotConfigured removed.
- **Tests:** test/backup-cron.test.mjs (12, RED→GREEN) and test/backup-tasks-api.test.mjs (12 + tracer happy path); the two Phase-85/86 stub-prohibition pins superseded.

## Checkpoint ratifications (owner, 2026-11-21)

1. **D-04** raw 5-field cron string as the one-way source of truth; `next_run_at` persisted cache; strict keyed write-time validation.
2. **Identity model:** `backup_runs.task_id`, NULL = manual Run-now archive outside rotation; scheduled filenames `backup-task-<taskId>-<ts>.tar.gz`; manual filenames frozen per 86-D-14.
3. **Default tz:** `resolveTz(null)` → Europe/Paris (no `users.tz` column — verified); operator picks via combobox.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] db-adapter.mjs needed the real twin DDL, not just a comment**
- **Found during:** tracer task — the mirror-sync test (`test/db-adapter.test.mjs:245`) pins `SQLITE_SCHEMA` ≡ server.js `SCHEMA` modulo comments; adding DDL only to server.js breaks boot parity tests.
- **Fix:** mirrored the full backup_tasks/backup_runs DDL into `SQLITE_SCHEMA`; registered `next_run_at`/`started_at`/`finished_at` in `PG_EPOCH_COLUMNS` (as the plan required).
- **Files:** db-adapter.mjs. **Commit:** bbae31e2

**2. [Rule 1 - Bug] Semicolons in twin comments broke runSchema's statement splitter**
- **Found during:** post-tracer full suite — `runSchema` splits on `/;\s*\n/`; comment text ending in `;` produced a phantom "statement" → `The SQL query contains no statements` crashed 12 tests.
- **Fix:** rewrote the twin comments without line-final semicolons; added a splitter note in the comment itself.
- **Files:** db-adapter.mjs. **Commit:** 2a5d06f7

**3. [Rule 2 - Missing critical] Keyed-refusal collisions with pre-existing keys**
- **Found during:** CRUD task — `err.invalidScope` (project-perms "Scope must be read or write") and `err.taskNameRequired` (todo "Give the task a name") already existed; reusing the same code for a different meaning would render the wrong localized message, and duplicate JSON keys would have been inserted.
- **Fix:** backup scope refusal keyed `backupInvalidScope` (new key ×5); name refusal reuses the generic `taskNameRequired` (semantically exact); `taskNotFound` reused (existing generic). Also removed the now-dead `err.backupNotConfigured` ×5 (its only emitter, the Phase 85 stub, is gone — flagged by test/error-codes.test.mjs reverse parity).
- **Files:** server.js, 5 locale files, test/backup-tasks-api.test.mjs. **Commit:** 2a5d06f7

**4. [Rule 3 - Blocker] Two stub-prohibition pins superseded by the live API**
- **Found during:** full suite — `test/backup-routes.test.mjs` and `test/instance-roles-api.test.mjs` pinned the Phase 85 `backupNotConfigured` stub refusal, which this plan replaces by design.
- **Fix:** both pins inverted into supersession pins (holder POST now creates / refuses keyed invalidSchedule on an invalid body; non-holder 403 path unchanged).
- **Files:** test/backup-routes.test.mjs, test/instance-roles-api.test.mjs. **Commits:** bbae31e2, 2a5d06f7

**5. [Plan-sanctioned subset] Tracer ships the preset cron grammar slice**
- The tracer task explicitly allows a minimal grammar subset; the full-grammar task then executed as genuine TDD (3 RED failures: ranges, vixie OR, dow 7≡0 → GREEN in the same feature area). Documented in commit messages.

## Verification

- `node --test test/backup-cron.test.mjs test/backup-tasks-api.test.mjs` — 23/23 pass (0 fail)
- `npm test` — 2139 tests, 2125 pass, **0 fail** (14 skipped, pre-existing env-gated)
- `npm run i18n:scan` — 0 literals, 0 pending, 0 unlisted, 0 stale, 0 dead
- withDb: backup_tasks row shows the raw cron string + computed next_run_at; backup_runs table exists (empty; run-row insert proven in the DELETE test)

## Known Stubs

None — every POST/GET/PUT/DELETE path is wired; no placeholder data flows to UI (the client builder is 87-02/87-04 scope and does not exist yet, which is sequenced, not stubbed).

## Threat Flags

None — the shipped surface is exactly the plan's `<threat_model>`: untrusted body fields land behind the capability gate with char-class-validated cron (T-87-01, no eval/Function/exec — verified), keyed same-code refusals (T-87-02), frozen guard chain + audited mutations (T-87-03). Zero new npm dependencies (T-87-SC).

## Self-Check: PASSED

- Files exist: export/cron.js, test/backup-cron.test.mjs, test/backup-tasks-api.test.mjs ✓
- Commits exist: bbae31e2 (tracer), c623186c (cron grammar TDD), 2a5d06f7 (CRUD) ✓ — all on `main`, measured cc2dd491..HEAD = 3
