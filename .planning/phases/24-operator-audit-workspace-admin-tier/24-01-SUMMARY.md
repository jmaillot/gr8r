---
phase: 24-operator-audit-workspace-admin-tier
plan: 01
subsystem: server/audit
tags: [audit-log, sqlite, transactions, append-only, operator-revoke]
requires: [security_log, transaction() helper, operator revoke route]
provides: [audit_log table, transaction-wrapped audited revoke, test/audit-log.test.mjs]
affects: [24-02 (admin route reuses the transaction shape), 24-03 (trail view reads audit_log)]
key-files:
  created: [test/audit-log.test.mjs]
  modified: [server.js]
key-decisions:
  - "audit_log is FK-free (no references/cascade/trigger) with name+email snapshots — the trail survives user deletion (D-A2)"
  - "Audit INSERT lives inside the existing transaction() helper with the DELETE and security verb; all three gated on del.changes > 0 (D-117)"
  - "operator-tier audit rows carry workspace_id NULL (D-T3)"
requirements-completed: [AUD-01]
duration: ~15 min
completed: 2026-10-31
coverage:
  - deliverable: "Audit row with actor_id/action/target_id/session_count/ip/snapshots/created_at written in the same transaction as the session DELETE (criterion 1)"
    kind: verification
    ref: "test/audit-log.test.mjs — 'AUD-01: operator revoke writes exactly one complete audit_log row…'"
    status: pass
  - deliverable: "security_log dual-write intact (D-A5)"
    kind: verification
    ref: "test/audit-log.test.mjs — 'D-A5: the security_log dual-write survives…'"
    status: pass
  - deliverable: "Forced audit-write failure rolls back the entire revocation — zero sessions deleted, zero audit rows (criterion 3)"
    kind: verification
    ref: "test/audit-log.test.mjs — 'AUD-01 criterion 3: forced audit-write failure rolls back…'"
    status: pass
  - deliverable: "No UPDATE or DELETE against audit_log in server.js (criterion 5 groundwork, D-A4)"
    kind: verification
    ref: "test/audit-log.test.mjs — 'D-A4: server.js contains no UPDATE or DELETE against audit_log'"
    status: pass
  - deliverable: "Operator revoke route early-return gates all precede the transaction() call (RESEARCH anti-pattern avoidance)"
    kind: human_judgment
    rationale: "Verified by code reading: sameOrigin → requireUser → throttle → isInstanceAdmin → 404 → ownerImmune all remain before transaction(); no fail() occurs inside the callback"
---

# Phase 24 Plan 01: Audit Backbone (append-only audit_log + audited operator revoke) Summary

Operator session revocation now writes a complete, snapshot-bearing audit_log row inside the same SQLite transaction as the session DELETE — proven by fields, rollback-atomicity and append-only tests on a real server. Duration ~15 min (start ≈15:05Z, end ≈15:20Z), 2 tasks, 2 files.

## Accomplishments

- `audit_log` DDL added inside SCHEMA: FK-free (D-A2), snapshot columns (actor/target name+email), integer epoch-ms created_at, workspace_id nullable, plus `audit_log_created` and `audit_log_workspace` indexes
- Operator revoke route rewritten: DELETE + `logSecurity` verb + audit INSERT all inside the shared `transaction()` helper, gated on `del.changes > 0` (D-117 success-only); zero-row deletes write nothing
- Every early-return gate (sameOrigin → requireUser → throttle → isInstanceAdmin → 404 → ownerImmune) kept before the transaction
- Wave-0 suite `test/audit-log.test.mjs`: complete audit-row field assertions, security_log dual-write (D-A5), drop-table rollback atomicity (no mocks), and a server.js-only static scan proving no UPDATE/DELETE against audit_log (D-A4)

## Files Created/Modified

- Created: `test/audit-log.test.mjs` (4 tests, real server + real SQLite, no mocks)
- Modified: `server.js` (audit_log DDL + indexes; target SELECT gains name/email; revoke body transaction-wrapped with audit INSERT)

## Key Decisions

- Audit INSERT rides the existing `transaction()` helper verbatim (D-R3) — no hand-rolled BEGIN/COMMIT
- All three writes inside one callback returning `{ revoked, remaining }`; response shape unchanged
- Forced-failure proof implemented by `drop table audit_log` via `withDb` (RESEARCH Pattern 3), with table recreation so later fixtures are unaffected

## Deviations from Plan

- Task 2's two test shapes were co-committed in the Task-1 RED commit (all four tests share one new file; the RED snapshot included them). Task 2 required zero server.js changes, so no separate commit exists — its work is proven green in the same suite. Committed as `test(24-01)` then `feat(24-01)`.
- One Rule 1 self-fix during Task 1: the atomicity test's final assertion originally compared the recreated empty table against the pre-drop row count; corrected to assert zero rows in the fresh table.

## Issues Encountered

None beyond the self-fix above. RED was confirmed before implementation (suite failed on "no such table: audit_log").

## Next: Ready for 24-02

The admin route (plan 02) reuses this exact transaction shape; the trail view (plan 03) reads these rows — the composite keyset cursor `(created_at, id)` groundwork is in the indexes.

## Self-Check: PASSED
