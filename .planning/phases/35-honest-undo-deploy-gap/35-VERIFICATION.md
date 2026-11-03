---
phase: 35-honest-undo-deploy-gap
verified: 2026-11-03T20:40:00Z
status: passed
score: 16/16 must-haves verified
behavior_unverified: 0
overrides_applied: 0
covered_files:
  - .planning/phases/35-honest-undo-deploy-gap/35-01-PLAN.md
  - .planning/phases/35-honest-undo-deploy-gap/35-01-SUMMARY.md
  - .planning/phases/35-honest-undo-deploy-gap/35-02-PLAN.md
  - .planning/phases/35-honest-undo-deploy-gap/35-02-SUMMARY.md
  - .planning/phases/35-honest-undo-deploy-gap/35-03-PLAN.md
  - .planning/phases/35-honest-undo-deploy-gap/35-03-SUMMARY.md
  - src/core/store.js
  - src/actions/teams.js
  - test/undo-membership.test.mjs
  - test/compose-config.test.mjs
  - docker-compose.yml
  - DEPLOY.md
covered_digest: "v2:sha256:04b5fbd20dbaf0c004f4c2122b425a67c3f06bc9474486eb44f024f67fbb027c"
re_verification:
  previous_status: gaps_found
  previous_score: 12/14
  gaps_closed:
    - "WR-01: undo onAction early-returns on pushed.ok === false before any setMemberTeams PUT (src/actions/teams.js, commit 616d92a)"
    - "WR-02: pushNow() holds the shared pushing mutex around its PUT, released in finally (src/core/store.js, commit 519b25f)"
  gaps_remaining: []
  regressions: []
---

# Phase 35 Verification — Honest Undo & Deploy Gap (Re-verification)

**Phase Goal:** Honest Undo & Deploy Gap — delTeam's undo toast honest in API mode (before-map captured in confirm), Phase-30 compose gap closed (MASTER_KEY_PREVIOUS forwarded through docker-compose.yml), plus the two verification gaps (WR-01 failed-doc-push gate, WR-02 pushNow/push mutex) closed by gap plan 35-03.

**Status:** passed — re-verification after 35-03 gap closure.

## Gap Closure Verification (both prior gaps)

### Gap 1 / WR-01 — VERIFIED CLOSED

Direct inspection of `src/actions/teams.js` (undo `onAction`, lines ~179–205): immediately after `const pushed = await pushNow();`, an unconditional `if (pushed.ok === false) { toast(t('err.changeTeam'), { kind: 'err' }); return; }` gate sits **lexically before** the `Promise.all(affected.map(...))` setMemberTeams block. Zero authority PUTs can fire after a failed doc push (network loss, 401, 403, 409). The gate is unconditional (fires even with an empty `affected` roster). The post-loop combined check (`pushed.ok === false || results.some(r => !r?.ok)`), the additive union shape `Set([...before, current, tm.id])` (D-03/D-04), the unguarded `restore(snap)` first-call order, and the `if (!api.enabled) return;` gate (D-06) are all preserved. Commit 616d92a verified in git log. Source-scan pin added in `test/undo-membership.test.mjs` asserting gate-before-Promise.all ordering, `err.changeTeam` in the gate, and the D-06 invariants from the same slice.

### Gap 2 / WR-02 — VERIFIED CLOSED

Direct inspection of `src/core/store.js` `pushNow()` (~lines 146–172): after the `while (pushing)` wait loop and both `clearTimeout` calls, `pushNow()` sets `pushing = true` immediately before `await api.putWorkspace(docSnapshot())` and releases it in a `finally { pushing = false; }`. The module-scoped `pushing` flag is the **same shared mutex** `push()` uses (`push()` byte-identical: takes it, defers via `pushQueued` when held) — so a `save()`-scheduled debounced `push()` during the undo's in-flight doc PUT now defers instead of firing a concurrent PUT and triggering a false-positive `409` → `S.ui.conflict` lock. The 409/401/403 conflict handling, localStorage snapshot write, and `{ ok: false, status: 0 }` guard return are unchanged. Commit 519b25f verified in git log. Source-scan pin asserts take-before-PUT, release-in-finally, wait loop, both clearTimeouts, and `push()`'s own take of the shared flag.

## 35-03 Must-Haves (all 8 truths + artifacts + key_links)

| # | Must-have | Status | Evidence |
|---|-----------|--------|----------|
| 1 | WR-01: failed pushNow() → zero authority PUTs + err.changeTeam toast | ✓ VERIFIED | teams.js gate precedes Promise.all; source-scan pin passes |
| 2 | WR-02: pushing mutex serializes pushNow's PUT vs save()→push() | ✓ VERIFIED | store.js `pushing = true` + `finally` release; shared flag with push(); pin passes |
| 3 | Happy-path sequence unchanged (restore → awaited pushNow → union PUTs; D-02/D-03/D-06 untouched) | ✓ VERIFIED | post-loop check, union shape, restore order, api.enabled gate all preserved in source |
| 4 | UNDO-01 adjacency (probe): deduped union PUT, idempotent same-set PUT | ✓ VERIFIED | union shape unchanged in source; existing pin (undo-membership.test.mjs) passes |
| 5 | UNDO-01 empty (probe): zero PUTs on empty roster even when push fails; gate unconditional | ✓ VERIFIED | gate returns before the map regardless of `affected` length |
| 6 | UNDO-01 ordering (probe): insertion-order Set + server team_id ordering pinned | ✓ VERIFIED | existing ordering pin passes |
| 7 | UNDO-02 boundary (probe): exactly 409/401/403 set S.ui.conflict; 400/500 do not | ✓ VERIFIED | unchanged conflict handling in both push() and pushNow(); compose/undo pins pass |
| 8 | UNDO-02 precision (probe): revision small JSON-safe int, no arithmetic | ✓ VERIFIED | inspection of store.js: revision compared by `changeSeq !== seq` only |

## Full Phase Must-Haves (35-01, 35-02 — regression-confirmed)

| # | Must-have | Status | Evidence |
|---|-----------|--------|----------|
| 9 | UNDO-01 — restore + union replay + awaited pushNow sequencing | ✓ VERIFIED | teams.js:179–205, store.js pushNow |
| 10 | UNDO-02 — no-clobber regression (newer team_c survives) | ✓ VERIFIED | test-pinned in undo-membership.test.mjs (7/7 pass) |
| 11 | D-06 — local-mode restore-unconditional pin | ✓ VERIFIED | source-scan pin re-asserted by the new WR-01 pin |
| 12 | DEPLOY-01 — compose `:-` form for MASTER_KEY_PREVIOUS | ✓ VERIFIED | docker-compose.yml:40; compose-config.test.mjs 3/3 pass |
| 13 | DEPLOY-01 — DEPLOY.md §14 key-custody walkthrough | ✓ VERIFIED | present, consistent with D-08 |
| 14 | Regression gate — prior-phase test files | ✓ VERIFIED | full suite green (below) |

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Undo membership pins + WR-01/WR-02 pins | `node --test test/undo-membership.test.mjs` | 7 pass / 0 fail (5 + 2 new) | ✓ PASS |
| Compose config both cases | `node --test test/compose-config.test.mjs` | 3 pass / 0 fail | ✓ PASS |
| Full suite | `npm test` | 896 pass / 0 fail / 3 skips (baseline 894 → 896) | ✓ PASS |

## Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
| ----------- | ----------- | ------ | -------- |
| UNDO-01 | 35-01, 35-03 | ✓ SATISFIED | honest undo on both success and failure paths; REQUIREMENTS.md line 43 `[x]` |
| UNDO-02 | 35-01 | ✓ SATISFIED | no-clobber test pin; REQUIREMENTS.md line 46 `[x]` |
| DEPLOY-01 | 35-02 | ✓ SATISFIED | compose `:-` forwarding + config test + DEPLOY.md §14; code and tests verified |

No orphaned requirements — all three phase IDs are claimed by plans and satisfied. Note (advisory, non-blocking): `.planning/REQUIREMENTS.md` line 85 still shows DEPLOY-01 as `[ ]` / "Pending" in the phase-coverage table (lines 107–109) — stale bookkeeping; the deliverable is code- and test-verified.

## Anti-Patterns Found

None. Zero TBD/FIXME/XXX markers in `src/core/store.js`, `src/actions/teams.js`, `test/undo-membership.test.mjs`. No stub patterns in the touched files.

## Human Verification Required

None. Both gaps were closed with deterministic source and test evidence; no behavior-dependent truth is left unexercised (the WR-01/WR-02 invariants are pinned by the two new source-scan regression tests plus full-suite green).

## Gaps Summary

None. Both prior gaps (WR-01, WR-02) are closed with verified code, dedicated regression pins, and a green full suite. 16/16 must-haves verified.

---

_Verified: 2026-11-03T20:40:00Z_
_Verifier: the agent (gsd-verifier)_
