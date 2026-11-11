---
phase: 55
plan: 02
subsystem: server-reminders
tags: [reminders, fan-out, per-member, digest, test-coverage]
requires: [55-01 canonical assignees[] shape, reminders_sent ledger, memberCanReadProject]
provides: [multi-assignee reminder test coverage (fixtures a–e), per-member exactly-once proof, verified array-only server reads]
affects: [55-03..55-05 (client surfaces, exports)]
tech-stack:
  added: []
  patterns: [per-member fan-out loop, per-member tx claim, exactly-once ledger per (ws, task, assignee, offset, due)]
key-files:
  created: []
  modified:
    - test/due-reminders.test.mjs
decisions:
  - server.js fan-out and digest.includes conversions were already landed by 55-01 (Rule 3 there); Plan 55-02 executed verification-first and committed test coverage only
  - fixtures moved to the canonical assignees[] shape in the same commit (research pitfall 4/9)
metrics:
  duration: ~20 min
  completed: 2026-11-10
status: complete
plan_head_before: fbcd390
plan_head_after: 8fbef71
commits: 1
actuals:
  tokens: 8000
  tasks: 2
  commits: 1
---

# Phase 55 Plan 02: Reminder fan-out per assignee + digest membership Summary

**One-liner:** Per-assignee reminder fan-out proven by test — five multi-assignee fixtures (mixed-TZ windows, prefs-off isolation, replay exactly-once, private-project read-check isolation, subtask-exclusion) over the fan-out loop 55-01 landed; server-side scalar `assignee` reads verified gone (only normalize migration input remains).

## What Shipped

- **Task 1 (8fbef71)** — Verification-first: `runReminderPass` already loops `t.assignees` per member inside the existing pass (own TZ window via `resolveTz`, own prefs via `getUserNotifPrefs`, own `memberCanReadProject` check, own ledger row, one claim+append tx per member — 55-01 Task 1, minimal D-55-10 fan-out). This commit converted all `test/due-reminders.test.mjs` fixtures to the canonical `assignees[]` shape and added a `makeMultiWorkspace` harness (real owner member + doc-only extra members with per-member tz, owner-scoped prefs rows) plus fixtures (a)–(e):
  - (a)+(c) 2 assignees, London vs Pacific: exactly one reminder each, at each member's own 08:00-local window (08:00Z and 16:00Z passes); same-day replay emits nothing and the ledger holds exactly one row per (task, assignee)
  - (b) 2-assignee task, owner prefs `due_reminder/past_due: false`: the off-member gets zero rows while the other assignee gets morning_of and past_due
  - (d) private project (access list `['mC-vis']`), 2 assignees: only the member who can read the project is reminded — one failing check never suppresses the other (T-55-04)
  - (e) subtask carrying `assignees: ['mE-sub']`: no reminder and no ledger row for the subtask assignee (D-55-5)
- **Task 2 (verification-only, no commit)** — grep sweep `\.assignee[^s]` over server.js: only lines 797/808 remain (normalize migration input + scalar delete — the plan's explicitly allowed occurrences). Digest membership already `!t.assignees?.includes(r.member_id)` (server.js:1829, D-55-11); unassign sweep and diff-based event log already array-based (55-01 Tasks 2/3). `node --check server.js` passes.

## Test Results

- `node --test --test-concurrency=2 test/due-reminders.test.mjs` — **23/23 pass** (19 pre-existing + 4 new multi-assignee cells; (a)+(c) merged into one cell, so fixtures a–e = 4 test blocks)
- `node --check server.js` — pass
- `npm test` (full suite) — 1373 tests, 1345 pass, **17 fail** — **all 17 in suites owned by a parallel in-flight session** (uncommitted edits to `src/export/model.js`, `src/core/store.js`, `export/xlsx.js`, `export/mspdi.js`, actions/overlays, plus their matching test files: export-model/csv/mspdi/xlsx, scope, watcher, logo suites). None of these suites import `test/due-reminders.test.mjs`; the failures pre-date this plan's single-file diff and are out of scope per the scope-boundary rule. 55-01 measured the full suite green (0 fail) before that session's edits landed in the tree.

## Deviations from Plan

- **[Plan-superseded] `remindable(task, project, assigneeId)` rename not applied.** The plan predates 55-01, which moved the private-project visibility term out of `remindable` and into the per-assignee loop (`memberCanReadProject` re-derived per member, server.js:1720) — the missed-parameter hazard the rename guarded against no longer exists, and the digest loop shares the task-state-only predicate. Left as `remindable(task, project)`; per-member visibility isolation is covered by fixture (d).
- **[Plan-superseded] server.js Task-2 edits not needed** — 55-01's Rule-3 commit had already converted the digest membership, the unassign sweep and the event log to array semantics. Task 2 executed as a verification sweep (grep + suite) per the plan's own verification-first note; no diff, no commit.
- **[Environment] `npm test` full-suite green blocked** by the parallel session's uncommitted work (see Test Results). This plan's own verify command (`node --test --test-concurrency=2 test/due-reminders.test.mjs`) is green.

## must_haves Status

- N assignees → N independent deliveries, each with own TZ window / prefs / read-check / ledger row (D-55-10) — ✅ fixtures (a), (b), (d)
- Exactly-once per (workspace, task, assignee, offset, due), ledger key unchanged — ✅ fixture (a)+(c) replay; key shape asserted `ws:tTz:<member>:morning_of:due`
- Prefs-off member silent while others still reminded — ✅ fixture (b)
- Subtask assignees get no fan-out (D-55-5) — ✅ fixture (e)
- Artifacts: server.js reminder pass per-assignee loop — ✅ (landed in 55-01, verified in place); test/due-reminders.test.mjs multi-assignee fixtures — ✅ (this plan)

## Known Stubs

None.

## Notes

- A parallel session's uncommitted client/export changes were present in the working tree throughout; this plan touched none of them.
- The full fan-out acceptance criteria "one claim/append tx per member — tx boundary inside the assignee loop" holds structurally: `db.tx` sits inside the offset loop inside the assignee loop (server.js:1753).
