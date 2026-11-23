---
status: testing
phase: 89-restore
source: [89-VERIFICATION.md]
started: 2026-11-23T10:20:00Z
updated: 2026-11-23T10:20:00Z
---

## Current Test

number: 1
name: Secure-phase contract — run /gsd-secure-phase 89 to produce 89-SECURITY.md
expected: |
  89-SECURITY.md exists with threats_open: 0, following the 85-SECURITY.md register
  shape — formally closing the goal's "zero-open-threats security contract" clause
  and ROADMAP SC4 (four D-89-33 threat families: privilege-escalation-via-restore,
  manifest/SQL injection, path traversal, DR instance_roles rebuild abuse).
awaiting: user response

## Tests

### 1. Secure-phase contract — /gsd-secure-phase 89 → 89-SECURITY.md
expected: 89-SECURITY.md exists with threats_open: 0 (85-SECURITY.md register shape); closes the goal's zero-open-threats clause and ROADMAP SC4. Code-level security evidence already verified (per-route capability gates D-89-21, server-side confirm re-validation, frozen entry allow-list + zip-bomb guards, ARCHIVE_READ granted to no role).
result: pass
note: 89-SECURITY.md produced by secure-phase run (commit becde49e), threats_open: 0, ASVS L1; user accepted.

### 2. PG-parity restore pins with POSTGRES_TEST_URL set
expected: Restore tx/lock parity pins pass on Postgres (D-89-31: one tx per restore unit, engine-neutral row claim, no DDL inside the tx); stale-claim boot sweep on PG; PG_EPOCH_COLUMNS coverage. Env-gated skip this session — pre-ship PG exercise documented in 89-VALIDATION.md.
result: pass
note: Environment spun up for UAT (docker postgres:18-alpine on 127.0.0.1:5433, prod version). Gap G-89-2 found and fixed first: the restore_lock seed used sqlite-only "insert or ignore" inside SQLITE_SCHEMA, which pgSchemaVariant (DDL-only rewrite) passes through verbatim — pg boot failed 42601 (caught by pg-matrix + copy-sqlite-to-pg). Fix: engine-neutral "on conflict do nothing" seed in both mirrors (db-adapter.mjs + server.js), valid on SQLite 3.24+ and pg 9.5+. After fix: pg-matrix 10/10, db-adapter 32/32, copy-sqlite-to-pg 5/5 (per-file runs, the documented instrument — pg-matrix tests share one live DB and drop each other's tables under --test-concurrency=2); SQLite slice 55/55 (restore-routes, backup-scheduler, restore-security, restore-import).

### 3. MinIO S3 e2e — test/restore-s3-e2e.test.mjs with MINIO_TEST_URL (gr8r-minio-e2e :9001)
expected: S3-located archive: s3 badge → preview via downloadToStaged → sha256 verified → staged temp cleaned (D-89-14/16/18, SC-5 consumer). Env-gated skip this session; live behavior needs the environment per 89-VALIDATION.md pre-ship gate.
result: pass
note: Existing gr8r-minio-e2e container (port 9001, creds match test defaults) reused. restore-s3-e2e + backup-s3-e2e: 5/5, including the exact 89-03 pin (S3-located archive — list badge s3 → preview via downloadToStaged → sha256 verified → staged temp cleaned, 916ms live roundtrip).

### 4. DR re-login wall felt end-to-end (two logged-in clients)
expected: Every session INCLUDING the initiator is revoked AFTER commit; both clients land on re-login, next requests 401 (D-89-25). Route-level E2E covers revocation + 401; the two-client live flow is the 89-VALIDATION.md manual-only item.
result: [pending]

### 5. 5-locale consequence-text overflow check (de/fr)
expected: Switch locale to de or fr; open overwrite + DR confirm modals — consequence text wraps, modal scrolls, nothing overflows .modal-b (BKRST-03/04, 89-VALIDATION.md manual-only item).
result: [pending]

## Summary

total: 5
passed: 3
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
