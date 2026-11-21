---
phase: 82-removal-sync-guards-audit
plan: 02
subsystem: sso-auth
tags: [sso, groups, downgrade, provenance, owner-guard, audit, delta-trail, reconcile]
requires: [82-01 reconcile pass + guardRefuse funnel + conditional provenance clause, ownerCount(), ROLE_RANK_WITH_VIEWER, db.tx, audit_log]
provides: [full reconcile diff table (delete/downgrade/upgrade/no-op), owner-downgrade guard arm through the shared funnel (GS-02 complete), uniform encoded delta trail group_granted/group_role_upgraded/group_role_downgraded/group_membership_skipped (GS-04/D-82-11), byte-identical unmapped gate (D-82-10), migrated Phase 81 verb pins]
affects: [Phase 83 (renders encoded group_* actions split on first colon), Phase 84]
tech-stack:
  added: []
  patterns: [provenance-predicate downgrade filter (provenance like 'group:%'), guard arm reuse via delta-parameterized guardRefuse (role_downgraded delta), encoded audit rows in own db.tx (addMembership owns its internal tx — db.tx does not nest), skip+audit for dead/archived grant targets]
key-files:
  created: []
  modified: [server.js, test/groups-sso.test.mjs]
decisions:
  - 'Downgrade write goes through addMembership so the D-82-7 conditional clause re-stamps the DRIVING group''s provenance — a row from group A demoted per group B now carries B''s guid (role-source semantics, D-82-7)'
  - 'Delta audit rows are written in their OWN db.tx immediately after the write: addMembership internally opens a db.tx and db.tx does not nest (no savepoints) — AUD-01 semantics preserved via the guardRefuse precedent shape'
  - 'Skip reasons on the grant side: dead-workspace for a missing workspace, archived-workspace for archived=1 — dead-workspace removals stay structurally unreachable (FK on delete cascade) and remain in the vocabulary for Phase 83 rendering only'
  - 'Edge-probe pin updated to per-workspace dedup (D-82-10): ws-hi now gets ONE grant delta row carrying the highest-rank guid, not two verbs'
  - 'SC5 pin updated: login 1''s group_granted row persists (1 delta row total), overage login adds none; zero sso_group% verbs asserted as the new constant'
metrics:
  duration: ~40 min
  completed: 2026-11-20
status: complete
actuals:
  tokens: 76000
  tasks: 3
  commits: 3
plan_head_before: a10af94e
plan_head_after: 062c210f
---

# Phase 82 Plan 02: Downgrade Cells + Uniform Delta Trail + Byte-Identical Gate Summary

The 82-01 reconcile pass gained its downgrade cells — mapped-lower fires ONLY when the existing row's provenance is `group:%` (manual/invite/NULL provably immune side-by-side in e2e), the sole-owner downgrade routes through the SAME guardRefuse funnel as deletion with login proceeding — and the delta trail became uniform per D-82-11: grants, upgrades, downgrades and skips all land as encoded `group_<delta>:group:<guid>:<reason>` audit_log rows while every `sso_group%` security verb left the delta path, closing GS-03, GS-04, SC2 and SC4 with the byte-identical unmapped gate proving the reconcile writes nothing for users with no group rows and no pending grants.

## What Shipped

- **Task 1 (f120d47d):** Downgrade cell added to the reconcile's mapped branch — three-way rank compare via `ROLE_RANK_WITH_VIEWER` (equal = no-op per D-81-5; lower + non-group provenance = immune skip; lower + `group:%` = downgrade through `addMembership`, whose conditional conflict clause re-stamps the driving group's provenance). Owner-downgrade guard arm mirrors the PATCH route template (`row.role === 'owner' && mapped.role !== 'owner' && ownerCount(...) === 0`) and routes through the shared `guardRefuse(wsId, guid, 'role_downgraded')` funnel — loud fixed PII-free warn, `group_role_downgraded:group:<guid>:guard-refused` audit row, `continue`, login proceeds (research A5 / diff cell 10). Mapped-lower deltas audited in their own db.tx. GS-03 e2e: group admin row downgrades with mapped-lower audit while the identical `manual` row is untouched; sole-owner downgrade refusal e2e.
- **Task 2 (21c71118):** Grant/upgrade conversion per D-82-11 — fresh inserts write `group_granted:group:<guid>`, genuine upgrades write `group_role_upgraded:group:<guid>` (reason segment omitted; the fixed vocabulary applies only to skips/refusals), each in its own db.tx with actor=target=self. `logSecurity` sso_group_grant/sso_group_role_change calls REMOVED from the delta path (grep-verified zero remnants); sso_login/sso_invite_accepted heartbeats and the `operator_promoted` block untouched. Dead/archived grant skip now carries `group_membership_skipped:group:<guid>:dead-workspace|archived-workspace`. All Phase 81 verb pins migrated to audit_log assertions.
- **Task 3 (062c210f):** Byte-identical gate e2e — mapped-shape claim matching nothing the user holds: zero membership writes, zero `group_%` delta rows, zero security_log rows beyond sso_login, session minted. No-op re-login pin (D-81-5 extended): a row exactly matching the mapped role re-logs with zero writes. Full suite green.

## Deviations from Plan

1. **[Deviation — test pin recalibration under D-82-10 dedup] Edge-probe pin** changed from "two grant verbs" to "one grant delta row per workspace with the highest-rank guid": the reconcile applies ONE delta per workspace, so the second, lower-rank mapping on the same workspace no longer produces a second write/row — the pin now asserts exactly `group_granted:group:6111…` (owner) + `group_granted:group:7111…` and nothing else.
2. **[Deviation — test pin recalibration] SC5 overage pin** changed from "1 sso_group_grant verb" to "1 group_granted delta row from login 1 + zero sso_group% verbs": the uniform trail means the delta rows are audit_log rows now, and the overage login provably adds none.
3. **[Deviation — grant-side skip reasons] Dead vs archived distinguished** on the grant side (`dead-workspace` for a missing workspace row, `archived-workspace` for archived=1) — the plan text named only `archived-workspace` for the :5270 site, but the skip covers both shapes (pre-existing Phase 81 behavior) and D-82-9's fixed vocabulary already includes `dead-workspace`; the removal-side dead-workspace branch remains deliberately absent (FK cascade, per plan).

## Verify Results

- Task 1: `node --test test/groups-sso.test.mjs test/groups-core.test.mjs` — 41/41.
- Task 2: same trio — 41/41 after pin migration (2 pins recalibrated per deviations 1–2).
- Task 3: same trio — 43/43 (byte-identical gate + no-op re-login pin).
- **Final gate: `npm test` rc=0 — 2022 tests, 2009 pass, 0 fail, 13 pg-skips** (baseline 2018/2005/13; +4 net new). oidc-sso and domain-admission-sso suites untouched and green.
- Grep gate: zero `logSecurity` `sso_group%` calls remain in server.js.

## Known Stubs

None. All SC1–SC5 cells, the uniform trail, skip audit rows and the byte-identical gate shipped in this plan.

## Commits

- f120d47d: feat(82-02): GS-03 downgrade cells + owner-downgrade guard arm (T-82-05/T-82-07)
- 21c71118: feat(82-02): D-82-11 uniform delta trail — grant/upgrade audit conversion + pin migration + skip audit (GS-04/T-82-06/T-82-08)
- 062c210f: test(82-02): byte-identical regression gate + no-op re-login pin (D-82-10/D-81-5, SC1–SC5 closure)

## Self-Check: PASSED

- server.js reconcile: downgrade cell + guard arm + grant/upgrade conversion + skip audit rows present (suite proves all behaviors e2e).
- test/groups-sso.test.mjs: 22 tests in the sso suite, all pass; 43 across the trio.
- All 3 commit hashes present in git log; plan_head_before a10af94e → plan_head_after 062c210f = 3 commits (matches).
