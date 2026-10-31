---
phase: 25-keyring-version-aware-envelopes
plan: 01
subsystem: boot-migration/crypto
tags: [totp, encryption, migration, envelope, fail-closed]
requires: [D-05 v1: envelope helpers, D-82/D-83 boot migration, D-73/D-76 boot reporting]
provides:
  - isEnvelopeVersion(value) shared predicate (/^v\d+:/, D-K6)
  - D-K7 unrecognizedVersion counter + boot warn in migrateTotpEncryption
  - D-76 summary line extended with the unrecognized-version outcome
affects: [25-02 (v2 writer + keyring decrypt), 26 (rotation re-wrap)]
tech-stack:
  added: []
  patterns: [shared-predicate-single-source-of-truth, broad-SQL-prefilter-plus-authoritative-JS-predicate, decryptability-as-version-recognition]
key-files:
  created: []
  modified: [server.js, test/migration.test.mjs, test/totp-encryption.test.mjs]
decisions:
  - "D-K6 realized as ONE isEnvelopeVersion predicate (/^v\\d+:/) backing a broad SQL prefilter (not like 'v_:%') plus the authoritative JS test per row — no known-versions list"
  - "D-K7 recognized via decryptability (decryptTotpSecret === null ⇒ unrecognized) — future versions silence themselves when decrypt support lands; no hardcoded version list anywhere"
  - "D-78c exclusivity proof extended: the D-K7 boot decryptability probe is a sanctioned third caller (result discarded, never plaintext)"
metrics:
  duration: 12 min
  completed: 2026-10-31T16:53Z
status: complete
actuals:
  tokens: 29000
  tasks: 3
  commits: 3
commits: 3
plan_head_before: 2cda44c2d54de9275a1587bfec6caec8937c9786
plan_head_after: 85bb945
---

# Phase 25 Plan 01: Version-Aware Boot Migration Filter Summary

One shared `/^v\d+:/` predicate now guards the boot migration — `v2:`/`v3:` rows boot byte-identical with zero backups (SC-1 proven by test), and undecryptable-version rows are counted and warned, never silently skipped (D-K7).

## What Was Built

- **D-K6 (Task 1, tracer):** `isEnvelopeVersion(value)` — the single generic envelope-version predicate, defined beside `migrateTotpEncryption()`. The SQL candidate filter broadened from `not like 'v1:%'` to `not like 'v_:%'` (requires a colon at position 3 — bare base32 plaintext never matches, so the D-83 zero-eligible no-op gate holds for envelope-only DBs); the in-transaction D-75 re-check now calls the same predicate instead of `startsWith('v1:')`.
- **SC-1 negative proof:** test seeds syntactically valid `v2:` and `v3:` envelope rows, boots the real server twice, and asserts byte-identity of both rows, zero `projects-preenvelope-*.db` backups, no migration summary, and no "non-base32" noise — committed **before** any v2-writing code exists.
- **D-K7 (Task 2):** `unrecognizedVersion` counter + tag set in `migrateTotpEncryption()`. Recognition is by decryptability — an envelope row this server cannot decrypt counts as unrecognized — so rows stop warning automatically when a version gains decrypt support (Plan 02). One `console.warn` in D-73 tone quotes only version tags + counts. The D-76 summary line gained `, N unrecognized version(s) left as-is.`
- **Drift guards (Task 3):** static proofs that exactly one predicate definition exists, that the D-75 re-check region calls it, that the two v1-only shapes (`not like 'v1:%'`, `startsWith('v1:')`) stay gone, and that `requireTotpSecret` keeps its D-77/D-79 signature + fail-closed body (SC-4 guard for Plan 02).

## Deviations from Plan

**1. [Rule 1 - Bug] Plan's suggested SQL exclusion shape was unusable as written**
- **Found during:** Task 1
- **Issue:** the plan suggested `not like 'v\_%' ESCAPE '\'` — with the escape, `\_` is a literal underscore, which excludes nothing (v1: envelopes and base32 plaintext both pass through). Unescaped, `v\_%` would exclude base32 plaintext starting with "V" (SQLite LIKE is ASCII case-insensitive) — a migration regression.
- **Fix:** used `not like 'v_:%'` — `v` + any-char wildcard + literal colon; excludes every envelope version, can never match colon-free base32 plaintext, and preserves the D-83 zero-row no-op gate.
- **Files modified:** server.js
- **Commit:** 3f528eb

**2. [Rule 1 - Bug] D-76 summary only prints when the migration transaction runs**
- **Found during:** Task 2
- **Issue:** first test draft expected the full summary line on a second boot with zero plaintext rows; the D-83 no-op path returns before the summary (consistent with ENC-01 silence).
- **Fix:** second-boot "never silent" assertion targets the D-K7 warn line instead (which fires independently of the migration path).
- **Files modified:** test/migration.test.mjs
- **Commit:** 1e26f18

**3. [Rule 2 - Missing critical functionality] D-78c exclusivity proof updated**
- **Found during:** Task 3
- **Issue:** the D-K7 decryptability probe adds a third `decryptTotpSecret(` call; the existing static test hard-coded 2 occurrences and failed.
- **Fix:** D-78c now documents three sanctioned regions (definition, requireTotpSecret wrapper, migration probe whose result is discarded) and fails on any call site outside them.
- **Files modified:** test/totp-encryption.test.mjs
- **Commit:** 85bb945

## Verification

- `node --test test/migration.test.mjs` — 24/24 pass (new SC-1 + D-K7 + mixed-DB tests)
- `npm test` — 614 pass, 0 fail (was 566+ suites pre-phase; +6 new tests this plan after D-78c restructure)
- `grep "not like 'v1:%'\|startsWith('v1:')" server.js` — 0 matches
- No change to `encryptTotpSecret`/`decryptTotpSecret` in this plan (Task 1 diff verified)

## Known Stubs

None.

## Notes for Plan 02

- The D-K7 warn uses decryptability as its test: once v2 keyring decrypt works, v2 rows with a known key id stop warning automatically — no warn-logic change needed.
- A v1 row with a corrupted/tampered envelope is counted as "unrecognized (v1)" — accurate ("not currently decryptable") and arguably desirable boot noise.
- SC-4 static guards for `requireTotpSecret` now live in test/totp-encryption.test.mjs and will fail Plan 02 work that changes the boundary's signature.

## Self-Check: PASSED

- Files: server.js, test/migration.test.mjs, test/totp-encryption.test.mjs — all present and committed
- Commits: 3f528eb, 1e26f18, 85bb945 — all in `git log`
- Commits measured: 3 (2cda44c..85bb945)
