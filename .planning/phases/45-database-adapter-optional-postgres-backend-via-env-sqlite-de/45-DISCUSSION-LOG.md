# Phase 45: Database adapter — optional Postgres backend via env, SQLite default - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-07
**Phase:** 45-database-adapter-optional-postgres-backend-via-env-sqlite-de
**Areas discussed:** Driver & D-12, Sync→Async, Dialects, Existing-data migration

---

## Driver & D-12 contract

| Option | Description | Selected |
|--------|-------------|----------|
| node-postgres (pg) | Official pure-JS driver, actively maintained, alpine-safe | ✓ |
| postgres (porsager) | Modern compact API, single-team, tagged templates | |
| Hand-rolled protocol | node:net wire protocol, honors D-12 literally, huge risk (SCRAM, SSL, types) | |

**User's choice:** node-postgres (pg)
**Notes:** Owner acknowledged any non-hand-rolled choice amends D-12.

| Option | Description | Selected |
|--------|-------------|----------|
| Conditional loading | pg used only when DB_URL is postgres://; SQLite path stays 100% built-ins; D-12 test amended | ✓ |
| Unconditional dependency | pg always required; D-12 rewritten "zero-dep by default" | |
| Off-package optional | devDependency + dynamic import — fragile for Docker support | |

**User's choice:** Conditional loading

| Option | Description | Selected |
|--------|-------------|----------|
| Image includes pg | node_modules/pg added to runtime stage; COPY pin amended | ✓ |
| Two image variants | current SQLite-only + "-postgres" | |
| Out of image | operator mounts node_modules | |

**User's choice:** Image includes pg

| Option | Description | Selected |
|--------|-------------|----------|
| Refuse at boot | fail-closed startup error, no SQLite fallback | ✓ |
| SQLite fallback | silent fallback — rejected (split-brain risk) | |
| Retry then abort | backoff retries for slow compose startup | |

**User's choice:** Refuse at boot

## Sync→Async

| Option | Description | Selected |
|--------|-------------|----------|
| Unified async API | all ~216 callsites become await db.…; one shape both backends | ✓ |
| Keep sync facade | not viable in pure Node (no sync await) | |
| Incremental conversion | auth/session subset first, dual conventions for a while | |

**User's choice:** Unified async API

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal 4-method facade | get/all/run/tx, keep existing SQL | ✓ |
| Mirror node:sqlite | async prepare/iterate awkward, pg lacks iterate | |
| Repository layer | re-architects server.js, beyond scope | |

**User's choice:** Minimal 4-method facade

| Option | Description | Selected |
|--------|-------------|----------|
| tx() + portable seed | db.tx(fn); common SQL seed; claim contracts unchanged | ✓ |
| Per-backend tx | two tx paths to test | |
| pg advisory locks | extra scope for exactly-once contracts | |

**User's choice:** tx() + portable seed

| Option | Description | Selected |
|--------|-------------|----------|
| Opt-in matrix | SQLite suite is base; critical paths vs ephemeral pg when POSTGRES_TEST_URL set | ✓ |
| pg required in CI | heavier local/CI setup | |
| Mocked adapter only | misses real SQL divergence | |

**User's choice:** Opt-in matrix

## Dialects

| Option | Description | Selected |
|--------|-------------|----------|
| Backups SQLite-only | vacuum into/pragma stay SQLite; pg backups = operator pg_dump; idempotent pg migrations | ✓ |
| Universal app-level backup | new capability, extra scope | |
| Integrated pg_dump | external binary in image, fragile | |

**User's choice:** Backups SQLite-only

| Option | Description | Selected |
|--------|-------------|----------|
| Common SQL + isolated branches | adapter owns per-dialect branch points, test-pinned | ✓ |
| Duplicated SQL per backend | two query files, double maintenance | |
| On-the-fly rewriting | magic, fragile | |

**User's choice:** Common SQL + isolated branches

| Option | Description | Selected |
|--------|-------------|----------|
| text/jsonb as-is | no data-model rework | ✓ |
| Exploit jsonb | server-side queries/indexes — extra scope | |
| Full normalization | multi-milestone rework | |

**User's choice:** text/jsonb as-is

## Existing-data migration

| Option | Description | Selected |
|--------|-------------|----------|
| Empty-seed default | pg starts empty from seed like a fresh install | |
| One-shot copy script | scripts/ SQLite→pg copy tool | ✓ |
| Boot auto-migration | risky double source of truth | |

**User's choice:** One-shot copy script — the only area where the owner diverged from the recommended default.

| Option | Description | Selected |
|--------|-------------|----------|
| All tables + guardrails | dependency order, count checks, refuses non-empty target, DEPLOY.md runbook | ✓ |
| Business core only | sessions/TOTP re-created — users reconnect + re-enroll 2FA | |
| Minimal, no guardrails | operator's problem | |

**User's choice:** All tables + guardrails

| Option | Description | Selected |
|--------|-------------|----------|
| Source untouched + doc | projects.db kept as rollback; pg server never falls back | ✓ |
| Explicit rename | projects.db → projects.db.migrated | |
| Delete after copy | no rollback — risky | |

**User's choice:** Source untouched + doc

## Agent's Discretion

- Pool sizing defaults, healthcheck wiring, slow-query logging — sensible defaults in
  line with LOG_LEVEL conventions.

## Deferred Ideas

- pg advisory locks for exactly-once claims
- jsonb exploitation (queries/partial indexes on workspace doc)
- Universal application-level JSON export backup
- SQL Server support — rejected 2026-11-07
