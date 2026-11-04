---
phase: 35-honest-undo-deploy-gap
verified: 2026-11-04T00:00:00Z
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
covered_digest: "v2:sha256:3889b6fc2cb3d58eb618ea105af7d9bee97f82f60c7c0f1e6abfadae09d5e55d"
re_verification:
  previous_status: passed
  previous_score: 16/16
  note: >-
    Stale-refresh re-verification after code-review fix commits 9f16914 (WR-01),
    4d5fab5 (WR-02), 8553ab6 (WR-03) — all touching this phase's covered files
    (src/core/store.js, src/actions/teams.js, test/undo-membership.test.mjs)
    after the prior passed verification of 2026-11-03. Must-haves reused from
    the prior report; no check weakened.
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 35 Verification — Honest Undo & Deploy Gap (Post-Fix Re-verification)

**Phase Goal:** Honest Undo & Deploy Gap — delTeam's undo toast honest in API mode (before-map captured in confirm), Phase-30 compose gap closed (MASTER_KEY_PREVIOUS forwarded through docker-compose.yml), plus the two verification gaps (WR-01 failed-doc-push gate, WR-02 pushNow/push mutex) closed by gap plan 35-03.

**Status:** passed — stale-refresh after code-review fixes 9f16914 / 4d5fab5 / 8553ab6 (all three verified in git log, touching exactly this phase's covered files).

## Post-Fix Verification (the three commits)

### Fix 1 / 9f16914 — WR-01: pushNow() wait loop bounded with 5s deadline — VERIFIED

`src/core/store.js` `pushNow()`: the previously unbounded `while (pushing) await sleep(25)` loop is now `const deadline = Date.now() + 5000; while (pushing) { if (Date.now() > deadline) return { ok: false, status: 0 }; ... }`. The timeout return uses the **same `{ ok: false, status: 0 }` shape** as the enabled/conflict guard — so the caller's truthy `!pushed.ok` gate fires the honest `err.changeTeam` toast for a hung in-flight PUT exactly as it does for network loss / 401 / 403 / 409. The WR-01 contract (doc PUT failure → ZERO setMemberTeams PUTs + err.changeTeam toast) therefore holds **including** the new timeout shape.

### Fix 2 / 4d5fab5 — WR-02: truthy `!pushed.ok` gates in undo onAction — VERIFIED

`src/actions/teams.js` undo `onAction`: both gates (`pushed.ok === false` → `!pushed.ok`) now fail closed on any falsy `ok` — a result shape missing `ok` can no longer slip past the gate. Verified the gate sits lexically between `const pushed = await pushNow();` and the `Promise.all(affected.map(...))` setMemberTeams block, is unconditional (fires on empty roster), and toasts `err.changeTeam`. The post-loop combined check is now `!pushed.ok || results.some(r => !r?.ok)` — equivalent logic, same honest-failure behavior (D-02 preserved).

### Fix 3 / 8553ab6 — WR-03: source-scan slices bounded — VERIFIED

`test/undo-membership.test.mjs`: the naive `src.slice(actionStart)` (slice-to-end-of-file) is replaced by a balanced-brace `onActionSlice()` helper bounding both the D-06 and WR-01 pins to the undo closure itself — the "exactly one setMemberTeams call site" assertion now cannot be over- or under-scoped by code after the closure. The WR-01 pin was updated to accept either gate form (`!pushed\.ok|pushed\.ok === false`) — correct: it pins the ordering contract, not the operator spelling.

### Critical Check 2 — WR-02 mutex not displaced by the deadline

Direct inspection of `pushNow()` post-fix: the deadline check lives **inside the wait loop, before mutex take**. Timeout returns `{ ok: false, status: 0 }` **without ever setting `pushing = true`** — no mutex leak on the timeout path. On the normal path the sequence is unchanged: wait loop → both `clearTimeout`s → localStorage snapshot → `pushing = true` → `await api.putWorkspace(...)` → `finally { pushing = false }`. Same shared module-scoped `pushing` flag `push()` uses; a save()-scheduled debounced push during the undo's in-flight PUT still defers into `pushQueued` (no false-positive 409 → `S.ui.conflict` lock mid-undo).

### Critical Check 3 — Happy path unchanged

Verified in source: `onAction` opens with unguarded `restore(snap)`, then `if (!api.enabled) return;` (D-06), then the awaited `pushNow()`, then the additive union `Set([...before, current, tm.id])` (D-03/D-04) full-set-replace PUTs, then the D-02 honest-failure toast. 409/401/403 conflict handling and revision logic (UNDO-02) untouched in store.js.

## Must-Haves (reused from prior 16/16 report — all regression-confirmed post-fix)

| # | Must-have | Status | Evidence |
|---|-----------|--------|----------|
| 1 | WR-01: failed pushNow() → zero authority PUTs + err.changeTeam toast (incl. new timeout shape `{ok:false,status:0}`) | ✓ VERIFIED | teams.js truthy gate precedes Promise.all; store.js timeout returns same shape; pin passes |
| 2 | WR-02: pushing mutex serializes pushNow's PUT vs save()→push(); take/release not moved by deadline fix | ✓ VERIFIED | store.js `pushing = true` + `finally` release unchanged; timeout exits pre-take; pin passes |
| 3 | Happy-path sequence unchanged (restore → awaited pushNow → union PUTs; D-02/D-03/D-06 untouched) | ✓ VERIFIED | source inspection + pins |
| 4 | UNDO-01 adjacency: deduped union PUT, idempotent same-set PUT | ✓ VERIFIED | union shape unchanged; pin passes |
| 5 | UNDO-01 empty: zero PUTs on empty roster even when push fails; gate unconditional | ✓ VERIFIED | gate returns before the map regardless of `affected` |
| 6 | UNDO-01 ordering: insertion-order Set + server team_id ordering pinned | ✓ VERIFIED | ordering pin passes |
| 7 | UNDO-02 boundary: exactly 409/401/403 set S.ui.conflict; 400/500 do not | ✓ VERIFIED | conflict handling unchanged; pins pass |
| 8 | UNDO-02 precision: revision small JSON-safe int, no arithmetic | ✓ VERIFIED | store.js `changeSeq !== seq` only |
| 9 | UNDO-01 — restore + union replay + awaited pushNow sequencing | ✓ VERIFIED | teams.js onAction, store.js pushNow |
| 10 | UNDO-02 — no-clobber regression | ✓ VERIFIED | undo-membership.test.mjs passes |
| 11 | D-06 — local-mode restore-unconditional pin | ✓ VERIFIED | bounded-slice pin passes |
| 12 | DEPLOY-01 — compose `:-` form for MASTER_KEY_PREVIOUS | ✓ VERIFIED | docker-compose.yml; compose-config.test.mjs 3/3 pass (unchanged by fixes) |
| 13 | DEPLOY-01 — DEPLOY.md §14 key-custody walkthrough | ✓ VERIFIED | untouched by fix commits |
| 14 | Regression gate — full suite | ✓ VERIFIED | `npm test` 896 pass / 0 fail / 3 skips = baseline |
| 15 | WR-01 source-scan pin bounded to closure (WR-03) | ✓ VERIFIED | `onActionSlice()` balanced-brace helper; pin passes |
| 16 | WR-02 source-scan pin (take-before-PUT, release-in-finally, wait loop, shared flag) | ✓ VERIFIED | pin passes post-deadline-fix |

**Score:** 16/16 truths verified (0 present, behavior-unverified)

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Undo membership pins (incl. bounded WR-01/WR-02/D-06 source scans) | `node --test test/undo-membership.test.mjs` | 7 pass / 0 fail | ✓ PASS |
| Compose config both cases | `node --test test/compose-config.test.mjs` | 3 pass / 0 fail | ✓ PASS |
| Full suite (single run) | `npm test` | 896 pass / 0 fail / 3 skips (baseline match) | ✓ PASS |

## Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
| ----------- | ----------- | ------ | -------- |
| UNDO-01 | 35-01, 35-03 | ✓ SATISFIED | honest undo on success and failure paths, now fail-closed on any falsy `ok` |
| UNDO-02 | 35-01 | ✓ SATISFIED | no-clobber + boundary pins pass |
| DEPLOY-01 | 35-02 | ✓ SATISFIED | compose forwarding + config test + DEPLOY.md §14 unchanged by fixes |

## Anti-Patterns Found

None. `grep -rnE "TBD|FIXME|XXX"` across `src/core/store.js`, `src/actions/teams.js`, `test/undo-membership.test.mjs` returns zero matches. No stub patterns.

## Human Verification Required

None. The fix commits narrow to already-pinned invariants; the timeout path reuses the established `{ok:false,status:0}` shape and the truthy gate is exercised by the WR-01 source-scan pin. Full suite green.

## Gaps Summary

None. All three fix commits verified in git log and in source; contract invariants preserved or strengthened; 16/16 must-haves verified post-fix.

---

_Verified: 2026-11-04T00:00:00Z_
_Verifier: the agent (gsd-verifier)_
