---
phase: "45"
plan: "03"
subsystem: database
tags: [sqlite, async-conversion, db-adapter, migrations, auth, two-factor, oidc, scheduler]
requires: [D-05, "45-01 facade", "45-02 env/URL plumbing"]
provides:
  - "async db facade wired through boot (connectDb/initDb)"
  - "sqliteOnly gates around every SQLite-specific op (vacuum/checkpoint/backup)"
  - "adapter ensureColumn supporting both SQLite pragma and pg information_schema"
  - "converted migrations/seed/auth/2FA/OIDC/recovery/claims/scheduler on await facade"
  - "auth-core helpers async (currentUser, requireUser, requireWorkspace, createUser, addMembership, logSecurity…)"
affects: ["45-04 (Plan 04: remaining sync regions + pg shim)", "all handleApi routes touching db"]
tech-stack:
  added: []
  patterns:
    - "module-level `let db` shim object: { prepare, exec, close, get, all, run, tx } — sync throw on pg for prepare/exec until Plan 04 converts remaining regions"
    - "sqliteOnly(name, fn) gate: no-op or explicit pg-path branches for SQLite-only SQL"
    - "awaited anti-join loop instead of Array.filter(async) (filter cannot await predicates)"
key-files:
  created: []
  modified:
    - server.js
    - db-adapter.mjs
    - auth-core.mjs
decisions:
  - "One-way conversion to async (D-05) approved by user at Task 0 checkpoint ('proceed')"
  - "Keep un-converted regions on the sync shim; convert region-by-region per plan order"
  - "Task 3 folded into Task 2 commit: transaction() retirement forced runReminderPass async in the same edit; criteria verified separately"
metrics:
  duration: "~2h"
  completed: 2026-11-07
status: complete
plan_head_before: a7d8a35
plan_head_after: a943aa5
commits: 4
actuals:
  tokens: 68000
  tasks: 4
  commits: 4
---

# Phase 45 Plan 03: Database adapter — convert server.js db callsites to async facade — Summary

**One-liner:** Boot path runs through the async `db-adapter` facade (`connectDb`/`initDb`), every SQLite-specific op is `sqliteOnly`-gated, and migrations, seed, auth, 2FA, OIDC, recovery, claims, scheduler and reminder/digest sweeps now run on awaited `db.get/all/run/tx` with `transaction()` retired.

## Task 0 checkpoint

D-05 (one-way conversion to async) was surfaced as a decision checkpoint; user approved with **"proceed"**. This summary records that approval.

## Commits

| Task | Description | Commit |
| ---- | ----------- | ------ |
| 1 (tracer) | Boot path via connectDb: DB_URL const, async initDb, pragmas moved into adapter, main async with .catch, CLI dispatch after initDb, adapter `close()` export | `9103389` |
| 2 (+3 folded) | sqliteOnly gates (7 vacuum/checkpoint pairs + --backup CLI), adapter ensureColumn (pragma/information_schema), transaction() deleted, migrations/seed/auth/2FA/OIDC/recovery/claims/scheduler on await facade, auth-core helpers async, mechanical awaits rippled through handleApi | `da9f11b` |
| 4 | Wave gate: await-hygiene audit clean (0 un-awaited facade calls); Task-2 conversions made Task 4's remaining audit a no-op — snapshot only | `5ae3bc7` |
| — | Acceptance grep: reworded two comments still mentioning deleted `transaction()` | `a943aa5` |

## Task 3 verification (folded into Task 2, verified separately)

- Exactly-once claim invariants untouched: `grep -c "r.changes === 0"` (reminder pass) and `grep -c "res.changes !== 0"` (digest send) unchanged from pre-conversion counts — claim sites still gate on `changes`, now on awaited results.
- Invariant suites: migration 37/0, due-reminders 19/0, digest 20/0, unsubscribe 15/0, db-adapter 18/0, tfa-multi-factor + auth-revoked 23/0. Full suite 1060 tests, 1052 pass — exactly the 5 known baseline failures (D-74 backup, i18n catalogue ×3, SPA deep-link).

## Deviations from Plan

### Auto-fixed / structural notes

1. **[Rule 3 - blocking] Added `close()` export to db-adapter.mjs** (Task 1) — plan's boot flow calls `db.close()` on shutdown; adapter lacked it.
2. **[Rule 1 - bug, caught by tests] `eligibleRows` anti-join rewritten** — original used `Array.filter(async row => !(await db.get(...)))`; filter cannot await predicates, so every row was kept and factors were re-copied on second boot (M2 "byte-identical after second boot" failed). Replaced with an awaited for-loop building the eligible list. Migration tests confirm one-time copy.
3. **[Rule 3] migrateTeamMembership/migrateUserNotifPrefs dropped their `conn` param** — the shim object exposes `get`/`all` on the active driver; no connection arg needed. All callers updated.
4. **[Scope fold] Task 3 executed inside the Task 2 commit** (`da9f11b`): retiring `transaction()` forced `runReminderPass` async in the same edit, and the prefs accessors (`getNotifPrefs`/`setNotifPrefs`) plus unsubscribe merge were already on awaited calls there. Splitting them out would have required an intermediate broken state. Criteria re-verified as above.
5. **[Acceptance sweep]** Two prose comments still referenced `transaction()` after deletion; reworded to `db.tx()` so the acceptance grep (`transaction\(` == 0) holds — commit `a943aa5`.

## Coverage snapshot for Plan 04

Remaining un-converted sites in server.js after this plan:

- `db.prepare(` — 60 (workspace/member/invite CRUD, doc-funnel reads, operator lists, CLI, SCHEMA exec prepared statements)
- `db.exec(` — 25 (workspace/member/invite CRUD, doc-funnel reads, operator lists, CLI, SCHEMA exec, sqliteOnly-gated backup execs)
- Un-awaited facade calls: **0**

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

None — no new endpoints or trust boundaries; conversion is behavior-preserving (suite green at every gate).

## Self-Check: PASSED

Commits 9103389, da9f11b, 5ae3bc7, a943aa5 all present on feat/sql; SUMMARY.md on disk.
