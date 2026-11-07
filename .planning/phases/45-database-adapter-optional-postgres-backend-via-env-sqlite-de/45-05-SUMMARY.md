# Phase 45 Plan 05: Dialect-owned schema, migrations, seed Summary

pg-legal SCHEMA variant (bigint epoch columns, functional nocase index), information_schema-guarded ensureColumn, idempotent additive migrations with whitelist lint pin, and portable seed — schema/migrations/seed are dialect-owned by db-adapter.mjs; server.js routes through it.

## Checkpoint: D-11 one-way workspace doc column shape — APPROVED

**Type:** decision (Task 0) · **Gate:** blocking · **Status:** RESOLVED before any schema change

The checkpoint question — "Plan 05 locks the pg storage shape for the workspace document as a plain text column (D-11, one-way). jsonb stays unused. Confirm?" — was presented to the user, who replied **"confirm"**.

- Locked: `workspaces.doc` stays a plain `text` column in the pg schema variant; no `jsonb` anywhere in the variant.
- Consequence (one-way): changing the pg doc-column shape later requires a data migration; jsonb exploitation is deferred out of scope by D-11.
- This section was written and committed BEFORE the first `db-adapter.mjs` schema edit, per the plan's Task 0 done criterion.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 0 | Checkpoint: D-11 doc column shape | (recorded above; no commit — decision task) | — |
| 1 | pg SCHEMA variant — dialect-owned schema end-to-end | (pending) | db-adapter.mjs, server.js, test/db-adapter.test.mjs |
| 2 | Idempotent pg migrations + portable seed | (pending) | server.js, test/db-adapter.test.mjs |

## Deviations from Plan

(None recorded yet — finalized at execution end.)

## Self-Check: PENDING
