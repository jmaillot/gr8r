---
phase: 19-totp-encryption-closure
plan: 01
subsystem: boot-migration
tags: [totp, encryption, migration, sqlite, enc-01]
requires: [master-key-envelope (D-05), migrateTenancy boot sequence]
provides: [migrateTotpEncryption(), gr8r-preenvelope-* backup, ENC-01 test coverage]
affects: [server.js bootstrap, test/migration.test.mjs]
tech-stack:
  added: []
  patterns: [trigger-gated migration, backup-first no-mutation-without-backup, per-row re-check defense in depth]
key-files:
  created: []
  modified:
    - server.js
    - test/migration.test.mjs
decisions:
  - "D-82/D-83 shape: trigger count → MASTER_KEY check (D-73) → backup (D-74) → transaction (D-75) → console summary (D-76)"
  - "Blank '' and v1: rows are excluded by the D-83 trigger query, so the D-76 blank/already-encrypted counters read 0 by design; per-row re-check inside the transaction stays as defense in depth"
  - "Backup-failure branch is deliberately stricter than migrateTenancy: return, never proceed (D-74)"
metrics:
  duration: 22m
  completed: 2026-10-28
status: complete
estimate:
  tokens: 62000
actuals:
  tokens: 46000
  tasks: 3
  commits: 2
plan_head_before: 2b85c2229e7037813d460a3a22cbab50e37cef1c
plan_head_after: 036e8368525beb60cb1be05480f9edaa876ad379
---

# Phase 19 Plan 01: TOTP Encryption Migration (ENC-01) Summary

Boot-time migration wraps every legacy plaintext `users.two_fa_secret` row into the `v1:` AES-256-GCM envelope — trigger-gated, transactional, backup-guaranteed, byte-identical no-op on second boot.

## What Was Built

- **`migrateTotpEncryption()`** (server.js, sibling of `migrateTenancy()`, called from `bootstrap()` right after `migrateTenancy()`):
  - D-83 trigger: `two_fa_secret is not null and != '' and not like 'v1:%'` — zero rows → return before any I/O (no backup file, no writes).
  - D-73: missing MASTER_KEY with pending rows → loud `console.warn` naming the deferred count, rows untouched, boot proceeds.
  - D-74: `wal_checkpoint(truncate)` + `vacuum into gr8r-preenvelope-<stamp>.db` under DATA_DIR (quote-escaped, migrateTenancy recipe); on failure `console.error` + return — no backup = no mutation.
  - D-75: transaction loop encrypts eligible rows with the existing `encryptTotpSecret()`; per-row re-check skips blank/whitespace, non-`/^[A-Z2-7]{32}$/` (logged), and `v1:` values — defense in depth against double-encryption.
  - D-76: one console summary line (migrated / blank skipped / non-base32 skipped / already encrypted). Console only — no UI.
- **`test/migration.test.mjs`** — 4 new ENC-01 tests (22 total in file): happy path + second-boot no-op, MASTER_KEY defer, backup-failure skip (real read-only DATA_DIR, no mocks), edge rows.

## Verification

- `node --test test/migration.test.mjs` — 22/22 pass.
- `npm test` — 530/530 pass, exit 0. No existing assertion weakened (diff is additive only).

## Deviations from Plan

**1. [Rule 3 - Blocking] Planted secret did not satisfy the codebase base32 shape**
- **Found during:** Task 1
- **Issue:** the plan's literal fixture secret `JBSWY3DPEHPK3PXP` is 16 chars and fails the `/^[A-Z2-7]{32}$/` eligibility rule (D-75) — the migration would have skipped it as garbage and the tracer test could not prove encryption.
- **Fix:** doubled the fixture secret to `JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP` (32 chars, valid shape), documented inline in the test.
- **Files modified:** test/migration.test.mjs
- **Commit:** f425ae1

**2. [Test-expectation correction] D-76 counters for blank/already-encrypted rows read 0 by design**
- **Found during:** Task 2 (RED phase)
- **Issue:** the task's test draft expected `1 blank skipped, 1 already encrypted` in the summary line, but the D-83 trigger query excludes blank and `v1:` rows before the transaction — they never reach the per-row counters.
- **Fix:** kept the production behavior (it matches D-83's locked query verbatim) and corrected the test expectation to `0 blank skipped, 0 already encrypted`, asserting the rows themselves stay protected.
- **Files modified:** test/migration.test.mjs
- **Commit:** 036e836

Note on TDD sequencing: the Task 1 tracer slice already carried the complete D-73/D-74/D-75 policy branches (they were the minimal *correct* implementation of the trigger → key → backup → transaction ordering, not throwaway code), so Task 2's tests landed green-first where the branches already existed; the RED phase still caught the two expectation errors above.

## Threat Model Compliance

- T-19-01 (mitigated): every eligible plaintext row is wrapped in the v1: envelope, backup-guaranteed; proven by test.
- T-19-02 (mitigated): trigger excludes `v1:` rows + per-row re-check inside the transaction prevent double-encryption; garbage never wrapped.
- T-19-03 (accepted per plan): deferral leaves plaintext rows only while MASTER_KEY is absent; decrypt fails closed at runtime.

## Known Stubs

None.

## Self-Check: PASSED

- server.js `migrateTotpEncryption()` + bootstrap wiring — FOUND (committed f425ae1).
- test/migration.test.mjs ENC-01 tests — FOUND (f425ae1, 036e836).
- Commits f425ae1, 036e836 verified in `git log 2b85c22..036e836`.
