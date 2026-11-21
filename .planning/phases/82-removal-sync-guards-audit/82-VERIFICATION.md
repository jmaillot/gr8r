---
phase: 82-removal-sync-guards-audit
verified: 2026-11-21T00:00:00Z
status: passed
score: 5/5 must-haves verified
covered_files:
  - .planning/phases/82-removal-sync-guards-audit/82-01-PLAN.md
  - .planning/phases/82-removal-sync-guards-audit/82-01-SUMMARY.md
  - .planning/phases/82-removal-sync-guards-audit/82-02-PLAN.md
  - .planning/phases/82-removal-sync-guards-audit/82-02-SUMMARY.md
  - server.js
  - test/groups-sso.test.mjs
covered_digest: "v2:sha256:578c95c22db434835539a83ecea34910a8368b02e2547ef4be8ea86eb5a69f5f"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 5/5
  gaps_closed: []
  gaps_remaining: []
  regressions: []
gaps: []
---

# Phase 82: Removal Sync + Guards + Audit — Verification Report (Stale-Verification Refresh #4682)

**Phase Goal:** Lost group membership at login removes only group-derived access, safely — owners, last operators and manual grants are protected, and every group-driven delta is audit-logged
**Verified:** 2026-11-21 (re-verification against current tree)
**Status:** passed
**Re-verification:** Yes — stale-verification refresh after post-ship quick-task commits touched covered files (super-access gate, me() crash fix + Super-Admin rename, WORKSPACE_CREATION/.env docs)

## Stale-Verification Delta Analysis

Post-ship commits to `server.js` were inspected against the reconcile block:

| Commit | Touchpoint | Impact on Phase 82 |
| ------ | ---------- | ------------------ |
| 6ab89e63 — operator super-access | Synthetic workspace rows added to the LISTING path (`server.js:1013`: overlay `rows` for instance admins; `:4995` operator flag) — display-only, never writes `memberships` | None — reconcile block, `ownerCount` (`:3479`), `guardRefuse` funnel untouched |
| 6b4aa830 — SUPER_ACCESS env gate | Env validation (`:168–225`), listing gate (`:1013`), boot log (`:9773`) | None — orthogonal to login reconcile |
| 39d69094 / c6514542 — .env docs | Docs/boot-log lines only | None |
| 73c3c6ab — chore | Local DB/keys | None |

The `me()` crash fix / Super-Admin rename changes the `/me` response surface only — no interaction with the reconcile corridor. `grep sso_group` confirms zero `sso_group%` logSecurity verbs remain on the delta path.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence (current tree) |
| --- | ----- | ------ | -------- |
| 1 | Removed-from-group users lose ONLY group-derived (`group:<guid>`) rows at next login; invite/manual rows untouched (SC1, GS-01) | ✓ VERIFIED | server.js:5408 selects rows `provenance like 'group:%'`; delete cell (server.js:5416–5459) `continue`s non-group provenance (:5421), GUID parsed server-side via `provenance.slice('group:'.length)` (:5422); e2e "lost-claim login removes ONLY the group:<guid> row — manual rows immune (GS-01)" (test/groups-sso.test.mjs:609) passes |
| 2 | Sole-owner removal/refusal routes through shared count-before-write guard funnel — loud logWarn, guard-refused audit row, row intact, login succeeds (SC2, GS-02) | ✓ VERIFIED | `guardRefuse` funnel (server.js:5399–5412) called by delete cell (:5431) AND owner-downgrade arm (:5490); `ownerCount(wsId, row.id)` count-before-write (`:3479` unchanged); refusal is `continue` never throw; e2e "sole-owner removal refused" (:565) and "sole-owner downgrade refused" (:491) both pass |
| 3 | Group-driven downgrades apply ONLY when mapped < current AND current grant is group-derived; manual/invite never downgraded (SC3, GS-03) | ✓ VERIFIED | downgrade cell (server.js:5478–5508): `mappedRank < curRank` + `provenance startsWith('group:')` else immune skip; owner-downgrade guard arm mirrors PATCH template (:7945); e2e side-by-side immunity test (test:440) passes with manual-row immunity assertion (:474) |
| 4 | Every group-driven delta (grant, upgrade, downgrade, removal, skip, refusal) audit-logged as encoded `group_<delta>:group:<guid>:<reason>`; logSecurity keeps only sso_login/sso_invite_accepted heartbeats (SC4, GS-04) | ✓ VERIFIED | Encoded rows at server.js:5410 (guard-refused), :5450 (lost-claim), :5470 (dead/archived skip), :5506 (mapped-lower), :5527 (granted/upgraded); `grep sso_group` on delta path: only a comment at :5513; e2e pins migrated and passing |
| 5 | Overage login proceeds as unmapped — no grants AND no removals (SC5/D-82-4); unmapped login byte-identical (D-82-10) | ✓ VERIFIED | Whole reconcile lives inside the mapped else-branch; overage only logs the fixed warn; e2e "overage login removes nothing and grants nothing — group row survives (SC5/D-82-4)" (test:529) and "byte-identical gate: zero writes, zero delta rows beyond sso_login (D-82-10)" (test:387) pass |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `server.js` reconcile block ~5375–5535 | delete path + guard funnel + downgrade cells + encoded audit rows inside the mapped else-branch | ✓ VERIFIED | Read in full at current line offsets (shifted ~+120 lines vs prior report due to post-ship commits upstream) — substantive, no stubs, wired before DP-5 invite reconcile |
| `server.js:4741` conditional on-conflict clause | `provenance = case when excluded.provenance like 'group:%' ...` | ✓ VERIFIED | Confirmed at server.js:4741 (was :4671) |
| `test/groups-sso.test.mjs` reconcile test block | GS-01/GS-02/GS-03/SC5/D-82-10 e2e + migrated pins | ✓ VERIFIED | All GS/SC/D-82-10 tests enumerated at :387/:440/:491/:529/:565/:609 and passing |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| Delete cell | member-DELETE route tx shape | memberships + team_members + stripMember in one db.tx, audit row in SAME tx | ✓ WIRED | server.js:5444–5459 mirrors route shape (:7900–7945 region); AUD-01 holds |
| Guard funnel | ownerCount | `ownerCount(wsId, row.id)` before any write tx | ✓ WIRED | server.js:3479, called at :5430 and :5489 — function body unchanged post-ship |
| Downgrade write | addMembership conditional clause | D-82-7 re-stamps driving group provenance | ✓ WIRED | addMembership called at :5499; conditional clause at :4741 |
| Encoded actions | /api/audit-log | unfiltered pass-through | ✓ WIRED | Verb filter matches only fixed D-T1 verbs; e2e asserts rows readable |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| Reconcile audit rows | guid | Row's own `provenance.slice('group:')` (removal side) / `mapped.groupGuid` (grant side) | Yes — DB-read provenance, never claims | ✓ FLOWING |
| Guard decision | ownerCount | `select count(*) ... role='owner'` live query | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Groups suites (fresh run on current tree) | `node --test test/groups-sso.test.mjs test/groups-core.test.mjs` | 43 pass, 0 fail (2026-11-21) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| GS-01 | 82-01 | Lose only group-derived membership; invite/manual immune | ✓ SATISFIED | Truth 1 + passing e2e (test:609) |
| GS-02 | 82-01 | Shared guard funnel, count-before-write, login succeeds | ✓ SATISFIED | Truth 2 + two passing guard e2e tests (test:491, :565) |
| GS-03 | 82-02 | Downgrades only for group-derived rows | ✓ SATISFIED | Truth 3 + side-by-side immunity e2e (test:440) |
| GS-04 | 82-02 | All group-driven changes audit-logged with GUID + reason | ✓ SATISFIED | Truth 4 + migrated pins |

All four requirement IDs claimed across the two plans, all verified. No orphaned requirements (REQUIREMENTS.md maps exactly GS-01..GS-04 to Phase 82, all marked Complete).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None (no TBD/FIXME/XXX/HACK markers in server.js or test/groups-sso.test.mjs) | — | — |

### Human Verification Required

None — all truths are behavior-dependent and each is exercised by a passing e2e test in the node:test harness (full server boot, real DB, real login flows), freshly re-run on the current tree.

## Gaps Summary

None. All five ROADMAP success criteria remain observably true on the current tree. The post-ship quick-task commits (super-access gate, me() surface, .env docs) are additive and do not intersect the removal-sync reconcile block, `ownerCount`, `guardRefuse`, or the conditional provenance clause. Fresh 43/43 groups-suite pass confirms no regression.

---

_Verified: 2026-11-21 (stale-verification refresh)_
_Verifier: the agent (gsd-verifier)_
