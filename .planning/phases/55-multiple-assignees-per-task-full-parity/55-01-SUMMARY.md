---
phase: 55
plan: 01
subsystem: server-doc-pipeline
tags: [assignees, migration, write-guard, reminders, event-log]
requires: [Phase 49 collapsed visibility funnel, Phase 53 per-team perms, memberCanReadProject]
provides: [canonical assignees[] server shape, per-member write-guard, stripMember array sweep, diff-based assignment events, array-aware reminder/digest pass]
affects: [55-02 (reminder fan-out, client), 55-03..55-05 (client surfaces, exports)]
tech-stack:
  added: []
  patterns: [read-time normalize (D-55-1), invariants-in-one-place, per-member guard re-derivation]
key-files:
  created:
    - test/assignees-migration.test.mjs
    - test/assignees-guard.test.mjs
  modified:
    - server.js
    - test/membership.test.mjs
decisions:
  - Scope strip runs only where a resolved roster exists (docForClient post-syncProfiles, mergeClientDoc union roster) — a raw stored doc with a partial roster is never destructively stripped on migration
  - Reminder pass loops assignees per member now (minimal D-55-10 fan-out) because stored docs no longer carry a scalar; Plan 55-02 owns the full fan-out design
  - membership.test.mjs removal assertions moved to the canonical array shape (retired scalar never read, D-55-3)
metrics:
  duration: 21 min
  completed: 2026-11-10
status: complete
plan_head_before: f09cc70445c12ac197f3af3c788783c827c6beb0
plan_head_after: fbcd390
commits: 3
actuals:
  tokens: 9600
  tasks: 3
  commits: 3
---

# Phase 55 Plan 01: Server doc pipeline — canonical assignees[] Summary

**One-liner:** Read-time normalize migrates every task/subtask scalar `assignee` to an invariant-enforced `assignees[]` array (dedupe, junk/non-member strip, cap 5, scalar deleted), the write-guard re-derives `memberCanReadProject` per member over tasks AND subtasks, member removal sweeps arrays (empties stay `[]`), the reminder/digest passes read arrays per member, and assignment event logging is diff-based.

## What Shipped

- **Task 1 (5775f7b)** — `normalizeTaskAssignees`/`normalizeAssigneesData` wired into `normalizeDoc` (migration, no roster strip), `docForClient` after `syncProfiles` (roster scope strip), `mergeClientDoc` (write funnel, union stored+incoming roster, before the guard) and `runReminderPass` (array-only reads). Reminder pass restructured to loop per assignee — own tz window, prefs, `memberCanReadProject`, ledger row (`ws:task:assignee:offset:due` unchanged); digest membership switched to `assignees.includes(member_id)` (D-55-11). `test/assignees-migration.test.mjs`: 7 cells (a)–(f) incl. the never-scalar invariant.
- **Task 2 (4dd1820)** — write-guard iterates every member of every task and subtask `assignees` array, throwing the existing `assigneeOutOfScope` (400 message unchanged); `stripMember` normalizes then filters the removed id from task/subtask arrays, emptied arrays stay `[]`. `test/assignees-guard.test.mjs`: 5 cells (a)–(e).
- **Task 3 (fbcd390)** — `logDocChanges` diffs previous vs next arrays (stored copy normalized first): one line per added member (`assigned to`), one per removed (`unassigned from`), untouched members silent. No `prev.assignee` scalar comparison remains (grep clean; the only `t.assignee` matches left in server.js are the normalize migration input itself).

## Deviations from Plan

- **[Rule 3 — blocking] Reminder pass + digest made array-aware in Task 1's commit, not 55-02.** Once the write funnel stores arrays only (scalar deleted per D-55-3), the raw-doc reminder reader broke (`to: undefined`, broken windows/visibility) and 4 suite cells went red. Minimal per-member loop implemented to keep the suite green; full fan-out design (per-member prefs UI surface, ledger semantics review) remains Plan 55-02. Digest `includes` membership (D-55-11) landed in the same commit for the same reason.
- **[Plan-driven test update] test/membership.test.mjs** removal assertions (`assignee === null`) rewritten to `assignees` empty-array shape — the retired scalar is never read (D-55-3); the removal sweep behavior itself was already correct.
- **Scope-strip placement nuance (design):** the plan's "strip in normalizeDoc" is split — migration (scalar→array, dedupe, junk, cap) runs in `normalizeDoc`; the out-of-scope strip additionally needs a resolved roster, so it also runs post-`syncProfiles` in `docForClient` and in `mergeClientDoc` with the stored∪incoming roster. A partial raw roster (reminder-test fixture shape) is never destructively stripped on migration; the write-guard remains the authority (D-55-9).

## Test Results

- `node --test test/assignees-migration.test.mjs` — 7/7 pass
- `node --test test/assignees-guard.test.mjs` — 5/5 pass
- `npm test` (full suite) — 1369 tests, 1358 pass, **0 fail**
- `node --check server.js` — pass
- `grep prev.assignee server.js` — no output

## must_haves Status

- Every task/subtask read yields `assignees` array, never scalar — ✅ (invariant test (f) + suite green)
- Old scalar reads back as sole member `['m1']`-style — ✅ (cell a)
- Non-member/out-of-scope members stripped in normalize and rejected by guard 400 `assigneeOutOfScope` — ✅ (migration cell d; guard cells a/b)
- >5 array truncated to 5, never rejected — ✅ (cell e)
- Member removal strips ids from task and subtask arrays, empties preserved — ✅ (guard cell d)
- Diff-based assignment event log (server side) — ✅ (Task 3; grep-verified scalar diff gone)

## Known Stubs

None.

## Notes

- Parallel-session commit `a50d14d` (fix(54), MSPDI SNET) landed between Task 1 and Task 2 — not part of this plan; workspace was dirty at spawn with 54-fix files owned by another session.
- Client code still reads the scalar `assignee` until Plans 55-02..55-05 land — expected within the phase; the server no longer serves it (55-01 is the load-bearing plan the others hard-block on).

## Self-Check: PASSED

- server.js, test/assignees-migration.test.mjs, test/assignees-guard.test.mjs present; commits 5775f7b, 4dd1820, fbcd390 on HEAD (main, `allow_default_branch_commits: true`).
