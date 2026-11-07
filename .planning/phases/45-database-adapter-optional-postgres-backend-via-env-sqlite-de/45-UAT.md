---
status: testing
phase: 45-database-adapter-optional-postgres-backend-via-env-sqlite-default
source: [45-VERIFICATION.md]
started: 2026-11-07T00:00:00Z
updated: 2026-11-07T00:00:00Z
---

## Current Test

number: 1
name: Real external Postgres deploy
expected: |
  Packaged Docker image + `DB_URL` incl. sslmode=verify-full against a managed endpoint boots, serves traffic; with a broken/unreachable DSN it refuses with a clear error and no DSN leak in output.
awaiting: user response

## Tests

### 1. Real external Postgres deploy
expected: Packaged Docker image + `DB_URL` (sslmode=verify-full) against a managed Postgres endpoint: boots and serves traffic; with an unreachable/bad DSN it fail-closes with a clear error and no DSN in output/logs.
result: [pending]

### 2. Operator migration of a real install
expected: Run `scripts/copy-sqlite-to-pg.mjs` against a production-shaped `projects.db` (with legacy columns), boot the server on pg, confirm parity; rollback path (SQLite default, DB_URL unset) remains intact.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
