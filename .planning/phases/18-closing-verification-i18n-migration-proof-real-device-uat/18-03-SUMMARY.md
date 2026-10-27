---
phase: 18-closing-verification-i18n-migration-proof-real-device-uat
plan: 03
subsystem: migration-proof
tags: [migration, sqlite, node-test]

requires:
  - phase: 14-schema-session-ground-truth
    provides: the doc-field strip (normalizeDoc/docFromClient, D-30) and the migration-proof pattern in test/migration.test.mjs
  - phase: 17-login-second-factor-flow
    provides: the post-17 auth surface (login_challenges table, D-66 challenge TTL) whose parity the proof asserts
provides:
  - Final migration-purity proof ending at the post-Phase-17 surface — success criterion 3 of the phase, AUTH-03's D-78/D-79 half
  - 2 new tests inside test/migration.test.mjs (18 tests total in the file; D-78 — same file, no separate proof file)
affects: [18-04 real-device UAT]

actuals:
  tokens: 14000
  tasks: 2
  commits: 2
plan_head_before: dabf7d24ded31487d70e96f2096cfcd2c3ab4bb3
plan_head_after: bd23efb

key-files:
  created: []
  modified:
    - test/migration.test.mjs

key-decisions:
  - "A2 verified: NO sessions.pending_tfa column exists in server.js SCHEMA — the post-17 pending-2FA state lives in the login_challenges table (challenge_token_hash, user_id, expires_at, attempts + expiry index); assertions were written against the real surface, per the plan's execution-time verification instruction"
  - "D-79 enumerated auth-key set = [sessions, tfa], mirrored from the strip list in server.js normalizeDoc/docFromClient (D-30); no other auth-bearing doc keys exist in the strip list or 14-01-SUMMARY"

requirements-completed: [AUTH-03]

# Metrics
duration: 8min
completed: 2026-10-27
status: complete
---

# Phase 18 Plan 03: Final Migration Purity Proof Summary

**Post-17 schema parity for login_challenges (the real pending-2FA surface — no sessions.pending_tfa column exists), a no-filter walk of every workspace document proving zero auth-bearing keys, and a second-boot snapshot extended to sessions rows + login_challenges count/pragma/DDL — D-78/D-79 discharged inside test/migration.test.mjs.**

## Performance

- **Duration:** ~8 min
- **Completed:** 2026-10-27
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Task 1 (tracer): `login_challenges` definition-parity test — each column (challenge_token_hash TEXT pk / user_id / expires_at / attempts INTEGER not null default '0') matched against the server.js SCHEMA declaration via the existing `col()` pragma pattern, plus a lifecycle-cleanliness assertion: the table is empty at first boot and still empty after the fixture's real password logins
- Task 2: D-79 doc walk — `select id, doc from workspaces` with NO row filter, every document JSON.parsed, asserting `sessions` and `tfa` absent at both `data` and top level, failure messages naming the offending workspace id and key
- Task 2: `snapshot()` extended (Pitfall C) — the byte-identical second-boot deepEqual now covers the full sessions table rows (token_hash, user_id, timestamps, label/ip/last_seen_at/user_agent), the login_challenges row count, its pragma columns and its table + expiry-index DDL
- Zero package installs (T-18-SC retained); no new files (D-78); no API/client surface re-test (D-79 scope honored)

## Task Commits

1. **Task 1: Post-17 schema parity + login_challenges lifecycle cleanliness (tracer)** - `e5f3b0f`
2. **Task 2: Workspace JSON auth-key walk (D-79) + snapshot coverage of the new auth state** - `bd23efb`

## Gate results

- `node --test test/migration.test.mjs`: 18 pass / 0 fail (was 16)
- `npm test`: 526 pass / 0 fail
- `npm run lint`: clean
- `npm run format:check`: clean (one prettier pass applied to the test file)

## Deviations from Plan

None - plan executed exactly as written. The A2 correction (no `sessions.pending_tfa` column; the real surface is the `login_challenges` table) was pre-instructed by the plan itself and is recorded as a key decision, not a deviation.

## Issues Encountered

None.

## Verification notes

All verification via text output only (node:test exit codes and summaries, prettier output) — no screenshots or image content, per the executor constraint.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Criterion 3 proven: additive migration, zero auth keys in every workspace JSON, byte-identical second boot including the newest schema
- 18-04 (pitfalls audit + real-device UAT) is unblocked; AUTH-03's final D-78/D-79 half is discharged

---
*Phase: 18-closing-verification-i18n-migration-proof-real-device-uat*
*Completed: 2026-10-27*

## Self-Check: PASSED

- test/migration.test.mjs exists; 18-03-SUMMARY.md exists on disk
- Task commits verified in history: e5f3b0f (Task 1), bd23efb (Task 2), 76346ab (SUMMARY), 667defc (state/roadmap)
