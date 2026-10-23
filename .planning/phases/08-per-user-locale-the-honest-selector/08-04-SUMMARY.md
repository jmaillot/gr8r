---
phase: 08-per-user-locale-the-honest-selector
plan: 04
subsystem: server boot / test harness
tags: [cold-start, admin-bootstrap, email-validation, regression]
requires: [08-01, 08-02, 08-03]
provides:
  - admin@example.com fallback email (committed)
  - undefined-env filtering in test/helpers/server.mjs
  - test/server-boot.test.mjs cold-start regression pair
affects: []
tech-stack:
  added: []
  patterns: [undefined-env-stripping in test helper, cold-start boot proof]
key-files:
  created: [test/server-boot.test.mjs]
  modified: [server.js, test/helpers/server.mjs]
decisions:
  - "Fallback email admin@example.com passes emailOk (has dot in domain); explicit invalid email still fails fast"
  - "startServer filters undefined values from spawn env to simulate a true cold start"
---

# Phase 8 Plan 04: Cold-start boot regression for the default admin email Summary

The cold-start blocker is closed: a boot with no `ADMIN_EMAIL`/`ADMIN_PASSWORD` reaches the HTTP listener with an `admin@example.com` bootstrap account, and the regression pair pins both the valid default and the invalid-explicit fast-fail.

## What was built

1. **Task 1 (fallback fix, d8763d3):** the working-tree one-liner became a committed change — `ensureAdmin()` (server.js:821) now falls back to `admin@example.com`, which satisfies the `emailOk` regex (server.js:159 requires a dot in the domain). `emailOk` and `createUser`'s validation (server.js:984) are untouched: the validation was correct, only the default was wrong.
2. **Task 2 (harness, undefined-env filtering):** `startServer` in `test/helpers/server.mjs` builds its spawn env into a `finalEnv` local and strips any key whose value is strictly `undefined` before spawning. Merge order is preserved (`{ ...process.env, ...BASE_ENV, PORT, DATA_DIR, ...env, DB_PATH }`); a test now passes `env: { ADMIN_EMAIL: undefined }` to mean "this variable must be absent" (a true cold start), while existing suites pass concrete strings and are unaffected.
3. **Task 3 (regression pair, 72df55e):** new `test/server-boot.test.mjs` —
   - **Cold start with defaults:** `startServer({ env: { ADMIN_EMAIL: undefined, ADMIN_PASSWORD: undefined } })` resolves (the listener opened, so bootstrap did not abort). The returned `dbPath` contains exactly one users row whose email is `admin@example.com` — the fallback passed `emailOk` and `createUser` accepted it. Because `ADMIN_PASSWORD` is absent, `ensureAdmin` takes the `crypto.randomBytes(12)` generated-password branch; the boot log contains the `  generated password: ` line (asserted only by presence, never by value).
   - **Negative control:** `startServer({ env: { ADMIN_EMAIL: 'admin@localhost' } })` rejects — the server exits before listening with the validation error, proving the fix changed only the default, not the validation.
   - **RED proof:** with server.js temporarily reverted to `admin@localhost`, test 1 failed (`1 pass / 1 fail`); restoring `admin@example.com` turned it green (`2 pass / 0 fail`). A future bad default cannot pass silently.

## Verification

- `node --test test/server-boot.test.mjs` — 2/2 pass (green state); RED-proof run confirmed 1/2 with the old default
- `node --test test/harness.test.mjs` — harness suite still green
- `npm test` — **391/391 pass**, 0 failures, 0 skipped (real servers, concurrency 2, the new file is auto-picked-up by the `test/*.test.mjs` glob)
- `git status` — server.js, test/helpers/server.mjs, test/server-boot.test.mjs all committed; no loose diff for the fix

## Commits

- `d8763d3` — fix(08-04): default admin fallback email must pass emailOk validation (G-08-1)
- `72df55e` — test(08-04): cold-start boot regression for the default admin email (G-08-1)

## Deviations from Plan

None material. The cold-start test asserts the users table via `select email from users` (deep-equal on emails) rather than whole rows: the harness's `BASE_ENV` still injects `ADMIN_NAME: 'Owner'`, so the bootstrap admin's name is `Owner`, not the bare-code default `'Admin'` — only the two undefined vars are stripped, and the emailOk gate under test is the email.

## Known Stubs

None. G-08-1 is closed; the UAT cold-start smoke test is now gated by a permanent regression pair.

## Threat Flags

None beyond the plan's threat model (T-08-01 accepted: the default `admin@example.com` is an RFC 2606 placeholder, and the generated-password branch still prints a one-time secret; T-08-SC not triggered — no dependencies added).
