---
phase: 82-removal-sync-guards-audit
plan: 01
subsystem: sso-auth
tags: [sso, groups, removal-sync, provenance, owner-guard, audit, reconcile]
requires: [Phase 81 substrate (grant corridor, provenance column, DP-5 filter), ownerCount(), groups.js resolve(), db.tx, audit_log]
provides: [reconcile pass with guarded delete path (GS-01), owner guard funnel guardRefuse() (GS-02), conditional provenance on-conflict SET (D-82-7), overage-skip e2e (SC5), lost-claim/guard-refused encoded audit rows]
affects: [82-02 (downgrade cells + grant-trail conversion route through guardRefuse), Phase 83 (renders encoded group_* actions)]
tech-stack:
  added: []
  patterns: [union target set (mapped targets ∪ group-derived rows), count-before-write guard funnel callback-local const, conditional on-conflict CASE provenance SET, route-shaped delete tx (memberships+team_members+stripMember), GUID parsed from provenance server-side]
key-files:
  created: []
  modified: [server.js, test/groups-sso.test.mjs]
decisions:
  - 'Guard funneled as callback-local guardRefuse(wsId, guid, delta) const — Plan 02''s owner-downgrade arm routes through the SAME funnel (D-82-9 vocabulary parameterized by delta)'
  - 'GS-02 sole-owner test uses groups: [] (genuinely-empty = reconcile-bearing claim shape) — a missing groups key would skip the whole else-branch and never reach the guard'
  - 'Dead/archived workspaces skip the delete silently in 82-01 (no row can exist in a deleted workspace — FK cascade; archived rows stay restorable); the skip+audit vocabulary for those reasons lands in 82-02 per research Q3'
  - 'D-82-8 unreachable-guard reasoning documented at the reconcile comment (grants only increase operator count; removal-sync never touches is_instance_admin)'
metrics:
  duration: ~35 min
  completed: 2026-11-20
status: complete
actuals:
  tokens: 62000
  tasks: 3
  commits: 3
plan_head_before: c9cc398b
plan_head_after: f2f731e9
---

# Phase 82 Plan 01: Removal Sync Reconcile — Delete Path + Guard + Conditional Provenance Summary

Phase 81's grant-only block became the core removal-sync reconcile: a single per-workspace diff pass whose delete cell removes ONLY `group:<guid>` rows when no mapping remains (provenance is the selection key — manual/invite/NULL immune), wrapped in a count-before-write owner guard funnel that refuses sole-owner removal with a loud PII-free warn + `guard-refused` audit row while the login still mints a session, and the D-82-7 conditional on-conflict clause that lets group writers own the role they set — Pin C green, overage provably removes and grants nothing.

## What Shipped

- **Task 1 (0267fff2, tracer):** The grant loop (server.js:5258+) converted to the D-82-10 reconcile pass inside the existing mapped else-branch: target set = union of `mappedByWs` (grant targets, highest-rank dedup) and the user's group-derived rows (`provenance like 'group:%'`); existing-row select widened to `role, member_id, provenance`. Delete cell mirrors the member-DELETE route tx (:7638–7643 shape) in ONE db.tx — memberships + team_members + `stripMember` — plus the encoded audit row `group_membership_removed:group:<guid>:lost-claim` in the SAME tx (AUD-01); GUID parsed server-side from `row.provenance.slice('group:'.length)`, never from claims. Corridor comment rewritten to Phase 82. GS-01 e2e: two-login flow (grant → mapping deleted → claim minus GUID) removes exactly the group row; a seeded `manual` row in another workspace survives; one audit row, route-shaped.
- **Task 2 (9daa60a4):** Guard extracted into the callback-local `guardRefuse(wsId, guid, delta)` funnel (delta-parameterized so Plan 02's owner-downgrade arm shares it): refusal = fixed `logWarn('sso group removal refused — last workspace owner')` (no GUID/email/counts) + one `guard-refused` audit row in its own tx + `continue` — never a throw (Pitfall 6), login always proceeds. `ownerCount(wsId, row.id)` runs BEFORE any tx (count-before-write, route semantics). GS-02 e2e: sole owner (mapping role `owner` grants the JIT user) + empty-groups second login → row INTACT, session minted, PII-free warn regex-pinned, exactly one `group_membership_removed:group:<guid>:guard-refused` row.
- **Task 3 (f2f731e9):** addMembership on-conflict clause gains the conditional SET: `provenance = case when excluded.provenance like 'group:%' then excluded.provenance else memberships.provenance end` (D-82-7, Pattern 1 — the literal global clause is forbidden, it would break Pin C). Phase 81 viewer-upgrade pin expectation updated: the group-upgraded viewer row now carries `group:21111111-…` provenance (group writer owns the role it set); Pin C (invite-over-group preserves group provenance) verified green. SC5 e2e: `_claim_names` overage login after a claim-granted group row → row survives byte-identically, fixed overage warn, zero delta audit rows, no new group verbs.

## Deviations from Plan

1. **[Deviation — test claim shape] GS-02 uses `groups: []` instead of "without the groups claim".** A missing groups key resolves to `unmapped/missing` and skips the whole else-branch — the guard would never fire and the test would pass vacuously. `groups: []` is the only zero-mapping claim shape that reaches the reconcile (`resolveGroupsClaim` returns state `groups`). The plan's intent (the sole-owner removal attempt is refused) is preserved; noted in the test comment.
2. **[Deviation — scope ordering] The inline count-before-write guard + guard-refused audit row landed in Task 1's commit** (the plan's Task 1 says "for the tracer inline the count-before-write check"); Task 2 then extracted it into the shared funnel per its step 3. Both commits carry their planned e2e pins.
3. **[Deviation — dead/archived delete skips]** 82-01 skips removals in archived/dead workspaces silently (no writes, no audit rows) — research Q3 assigned the `dead-workspace`/`archived-workspace` audit vocabulary to 82-02; a deleted workspace cannot hold rows (FK cascade).

## Verify Results

- Task 1: `node --test test/groups-sso.test.mjs test/groups-core.test.mjs` — 37/37 (new GS-01 + all Phase 81 pins).
- Task 2: same trio — 38/38 (new GS-02).
- Task 3: same trio — 39/39 (updated D-82-7 pin + SC5; **Pin C explicitly green**).
- **Final gate: `npm test` rc=0 — 2018 tests, 2005 pass, 0 fail, 13 pg-skips** (baseline 2015/2002/13; +3 net new).

## Known Stubs

None. Downgrade cells, grant-trail conversion (D-82-11), dead/archived-workspace audit reasons and the byte-identical gate are Plan 02 scope by plan, not stubs.

## Commits

- 0267fff2: feat(82-01): reconcile pass — lost-claim delete path removes only group-derived rows (GS-01)
- 9daa60a4: feat(82-01): owner guard funnel — count-before-write refusal, skip-and-audit (GS-02)
- f2f731e9: feat(82-01): conditional provenance SET (D-82-7) + overage-skip e2e (SC5)

## Self-Check: PASSED

- server.js reconcile + guard funnel + conditional clause present (suite proves all behaviors e2e).
- test/groups-sso.test.mjs: 18 tests, all pass.
- All 3 commit hashes present in git log; plan_head_before c9cc398b → plan_head_after f2f731e9 = 3 commits (matches).
