---
phase: "45"
plan: "04"
subsystem: database
tags: [sqlite, async-conversion, db-adapter, facade, static-audit, pg-ready]
requires: [D-05, D-06, D-10, "45-01 facade", "45-03 conversion waves"]
provides:
  - "server.js fully on the async facade — zero db.prepare/db.exec sites (D-05)"
  - "facade surface exactly { get, all, run, tx }; TRANSITIONAL shim deleted (D-06)"
  - "hand-rolled BEGIN/COMMIT tx regions migrated to db.tx with refusal sentinels"
  - "permanent static audit pins (test/static-db-audit.test.mjs) for D-05/D-10"
affects: ["45-05 (pg schema finalization)", "45-06/45-07 (pg parity waves)"]
tech-stack:
  added: []
  patterns:
    - "refusal sentinel: early-return routes inside db.tx set a sentinel and throw, the 409/404 ships after the rolled-back tx"
    - "SCHEMA boot split into per-statement db.run calls (node:sqlite prepare is single-statement)"
    - "async ripple: 18 sync db-reading helpers converted; all callers awaited"
key-files:
  created:
    - test/static-db-audit.test.mjs
  modified:
    - server.js
    - db-adapter.mjs
    - test/db-adapter.test.mjs
    - test/notif-email-link.test.mjs
decisions:
  - "Tasks 1+2 folded into one commit (f5b662e): the conversion was executed as a single editing pass across all regions, then verified — the tracer slice was not separable post-hoc; full suite verified before commit"
  - "collate nocase pinned as a FROZEN count of 7 sanctioned query sites, not zero — D-10 keeps the SQLite path byte-identical; the adapter rewrite owns the dialect"
  - "rowid audited by proximity to its single sanctioned consumer (the gated invites backfill), not by line number"
metrics:
  duration: "~3h"
  completed: 2026-11-07
status: complete
plan_head_before: 5bef49a
plan_head_after: b053059
commits: 2
actuals:
  tokens: 95000
  tasks: 3
  commits: 2
---

# Phase 45 Plan 04: Database adapter — finish callsite conversion, delete shim, pin static gates — Summary

**One-liner:** Every remaining db.prepare/db.exec callsite (85 sites + 18 async-rippled helpers) now runs through the awaited `db.get/all/run/tx` facade, the transitional prepare/exec shim is deleted, and the phase's D-05/D-10 gates are pinned by a permanent static-audit test suite.

## Commits

| Task | Description | Commit |
| ---- | ----------- | ------ |
| 1+2 (folded) | All remaining callsite regions converted (workspace/member/team/scope/invite CRUD, doc PUT + invites tx → db.tx, operator/admin revocation, audit trail, sessions, signup, unsubscribe, logo/file surfaces, CLI paths); TRANSITIONAL shim removed from db-adapter.mjs | `f5b662e` |
| 3 | test/static-db-audit.test.mjs: 4 permanent pins (0 prepare/exec; awaited facade calls; nocase frozen at 7; rowid gated) | `b053059` |

## Verification

- `grep -cE "(^|[^.a-zA-Z_.])db\.(prepare|exec)\(" server.js` → **0** (D-05 complete)
- `grep -c TRANSITIONAL` in db-adapter.mjs / server.js → **0** (shim gone)
- Adapter exports: `all,backendKind,close,connectDb,ensureColumn,get,pgSchemaVariant,run,sqliteOnly,toPgSql,tx` — facade methods exactly get/all/run/tx + capability exports (D-06)
- Full suite: **1064 tests, 1056 pass, 5 fail** — exactly the pre-existing baseline (D-74 backup, i18n catalogue ×3, SPA deep-link); 4 new static-audit pins pass
- Await-hygiene self-check: reverting a single await fails the audit pin (verified once manually)
- Boot smoke: `node server.js` on a temp DB boots, serves login/doc-PUT (verified manually during debugging)

## Deviations from Plan

### Auto-fixed / structural notes

1. **[Scope fold] Tasks 1+2 executed as one editing pass, one commit** (`f5b662e`) — the tracer's "convert one region, verify, expand" loop collapsed because the region boundaries share 18 sync helpers (uniqueSlug → wsBySlug → membershipOf → syncProfiles → hiddenFor → docForClient) that had to convert together or not at all. Full suite verified before the single commit; the plan's gate (verify after vertical slice) is satisfied by the same full-suite run.
2. **[Rule 1 - bug, caught by tests] db.tx throw propagation** — the first cut of the doc-PUT and invites conversions let in-tx refusals (revision conflict, alreadyMember, assigneeOutOfScope) escape as 500s. Fixed with refusal sentinels + rethrow-only-when-genuine catch, matching the original rollback-and-respond semantics. Pinned by the existing alreadyMember/SCOPE-04 suites.
3. **[Rule 3] SCHEMA boot exec** — `db.exec(SCHEMA)` cannot become one `db.run` (node:sqlite prepare is single-statement); split into per-statement runs, D-06's "one facade call per statement".
4. **[Rule 3] pragma/vacuum backup execs** — verified empirically that `prepare().run()` handles `pragma wal_checkpoint` and `vacuum into`; they now ride `db.run` inside their existing sqliteOnly gates (made async).
5. **[Test adaptations]** db-adapter facade test now pins shim ABSENCE (prepare/exec undefined); notif-email-link's source-extraction test evaluates the awaited authority-map builder in an async wrapper.

## Known Stubs

None.

## Threat Flags

None — no new endpoints or trust boundaries; the shim removal makes stragglers fail loud (T-45-06 mitigated), and the static audit pins keep it that way.

## Self-Check: PASSED

Commits f5b662e and b053059 present on feat/sql; SUMMARY.md on disk; grep gates verified 0/0.
