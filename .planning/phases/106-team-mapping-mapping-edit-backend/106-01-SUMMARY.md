---
phase: 106-team-mapping-mapping-edit-backend
plan: 01
subsystem: sso-reconcile + ddl
tags: [team-mapping, sso, provenance, ddl-lockstep, orphan-reporting]
requires: [phase-82-sso-reconcile, phase-28-team-members, phase-80-group-mappings]
provides: [group_mappings.team_id, team_members.provenance, team sync cell, group_team_granted/removed/skipped audit verbs, team-deleted orphan class, TEAM-04 PUT narrowing]
affects: [106-02 (routes + edit), mappings SPA, governance console]
tech-stack:
  added: []
  patterns: [changes-only upsert with WHERE guard, sync-cell-before-branch-chain, shared doc-teams whitelist helper, dual-engine DDL lockstep]
key-files:
  created: []
  modified:
    - server.js
    - db-adapter.mjs
    - test/groups-sso.test.mjs
    - test/group-mappings-api.test.mjs
decisions:
  - Option A confirmed: the sync cell owns ALL group team writes off raw mappings (winner + non-winner, TEAM-05); addMembership untouched; no team writes via the grant arm
  - changes-only WHERE guard (`where team_members.provenance is not excluded.provenance`) on the sync-cell upsert from day one — protects the :387/:408/:692 zero-write pins
  - `wrote.changes > 0` drives changes-only audit emission (db.run returns { changes } on both engines)
  - boot dead-team warn mirrors the existing `group mapping dead: group X → …` GUID-carrying format (sibling precedent wins over the plan's D-81-10 "no GUID" aside; no email ever)
  - boot-reboot test uses an explicit shared dataDir (the harness deletes owned temp dirs on stop)
metrics:
  duration: ~35 min
  completed: 2026-11-28
status: complete
actuals:
  tokens: 51000
  tasks: 3
  commits: 3
commits: 3
plan_head_before: 5e7026b2
plan_head_after: 8cf30591
---

# Phase 106 Plan 01: Team Mapping Backend — Schema + Reconcile Summary

Nullable `group_mappings.team_id` + `team_members.provenance` in dual-engine DDL lockstep; the SSO reconcile pass now grants/sweeps/reports group-driven team rows keyed off raw mappings and row provenance; manual teams PUT lost its group-row purge; `team-deleted` orphans surface in boot warns and the dead-mappings route.

## Completed Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | DDL lockstep + minimal sync cell (grant arm) — tracer | bf5862a6 | server.js, db-adapter.mjs, test/groups-sso.test.mjs |
| 2 | Full sync cell — removal sweep, doc-orphan sweep, dead-team skip | 942d9760 | server.js, test/groups-sso.test.mjs |
| 3 | TEAM-04 PUT narrowing + TEAM-07 boot warn + dead-mappings route | 8cf30591 | server.js, db-adapter.mjs (SCHEMA twins already landed in Task 1), test/groups-sso.test.mjs, test/group-mappings-api.test.mjs |

## Test Results

- `node --test test/groups-sso.test.mjs` — 33/33 green, including every pre-existing pin: byte-identical gate (:387), no-op re-login (:408), same-role re-login (:692), overage SC5 (:529), GS-01 lost-claim (:609), Pin C provenance, liveMembers-adjacent pins, and the "no team writes" edge probe.
- `node --test test/group-mappings-api.test.mjs` — green; existing matrix unbroken; new deadReason test passes.
- `node --test test/db-adapter.test.mjs` — green with the two SCHEMA twin columns (mirror pin auto-derives from server.js SCHEMA, so the lockstep edit needed no pin extension).
- Full `npm test`: 2779 tests, 2746 pass, 2 fail, 31 skipped — the ONLY failures are the 2–3 documented pre-existing ones (french-typography, webhook-routes GET list; the webhook-events due.reminder flake did not fire this run). 12 new team tests all pass.

## Checker-W2 Provenance (SC4)

ROADMAP SC4 ("SQLite + Postgres matrix") is satisfied by the **db-adapter pg-parity static pin** (`test/db-adapter.test.mjs` "SQLITE_SCHEMA mirror stays identical to server.js SCHEMA modulo comments/whitespace" + the Phase 101 static pg-parity cases) — this is the house interpretation since the pg-matrix phases; there is no live-PG harness in CI. The verifier must not fail SC4 for the absence of a live-PG run: the SCHEMA twin columns were verified by the static mirror pin after the lockstep edit, and the sync-cell upsert uses `on conflict … do update … where` (engine-proven shape, never `insert or ignore`), which the adapter passes through verbatim on pg.

## Deviations from Plan

**1. [Clarification — boot warn GUID posture]** The plan asked for the dead-team boot warn "with no GUID/email per D-81-10" but its literal format is `group mapping dead: group X → missing team Y in workspace Z`, which carries the GUID — exactly like the sibling workspace-dead warn at the same loop. The sibling precedent won (GUIDs in boot warns are the established Phase-80 posture; D-81-10 governs user PII — no email is emitted). Fixed logWarn text: `sso group team skipped — mapping team no longer in workspace` carries no GUID and no email, per D-81-10.
- **Found during:** Task 2 implementation
- **Files:** server.js (boot loop + cell)

**2. [Test infra — boot-reboot fixture]** The plan's boot-discipline test requires re-booting against the same DB; the default harness deletes its temp dataDir on stop. Fixed by passing an explicit shared `dataDir` (the harness's documented reboot idiom).
- **Found during:** Task 3 tests
- **Files:** test/groups-sso.test.mjs

No Rule 1–4 deviations: the plan's anchors all held at execution time.

## Key Implementation Notes

- Sync cell inserted after the `existing` fetch, BEFORE `if (!mapped)` — runs on every 6841-loop iteration (all branches below end in `continue`).
- Sweep arm parses the guid from the ROW's own provenance (`slice('group:'.length)`) — never from claims (T-106-01).
- Dead/archived workspace and doc parse failures degrade to no-op/sweep-only, never throw past the fail-closed catch (T-106-04).
- GS-01 blanket team delete untouched — cleans sync-cell-written rows when the membership dies (pinned by the new lost-claim team test).
- No epoch/variant/index changes; `group_mappings_pair` untouched.

## Threat surface scan

No new trust boundaries beyond the plan's `<threat_model>`: the sync cell and helpers only add reads/writes to existing tables keyed off existing provenance/doc data. No new endpoints, auth paths, or schema surface outside the two declared columns.

## Self-Check: PASSED

- All 4 modified files exist and are committed (3 commits on 5e7026b2..8cf30591).
- 12 new tests present and passing; all pre-existing pins green.
