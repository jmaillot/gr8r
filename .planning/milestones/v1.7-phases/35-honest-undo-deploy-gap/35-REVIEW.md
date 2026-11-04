---
phase: 35-honest-undo-deploy-gap
reviewed: 2026-11-03T00:00:00Z
depth: deep
files_reviewed: 6
files_reviewed_list:
  - src/core/store.js
  - src/actions/teams.js
  - test/undo-membership.test.mjs
  - docker-compose.yml
  - DEPLOY.md
  - test/compose-config.test.mjs
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 35: Code Review Report

**Reviewed:** 2026-11-03 (post 35-03 gap-closure)
**Depth:** deep (cross-file: teams.js → store.js → api.js → server contract; compose → server.js env)
**Files Reviewed:** 6
**Status:** issues_found (no blockers)

## Summary

Reviewed the Phase 35 honest-undo implementation (35-01), the MASTER_KEY_PREVIOUS compose forwarding (35-02), and the 35-03 gap-closure fixes (WR-01 early-return gate, WR-02 pushing mutex). Both gap-closure fixes are correctly implemented: the `pushed.ok === false` gate sits lexically between `pushNow()` and the `Promise.all` setMemberTeams block (teams.js:188-191), and `pushNow()` holds the shared `pushing` mutex with a `finally` release (store.js:178-185). Cross-file verification confirmed the load-bearing invariants: `api.call()` (api.js:59-95) never throws — every path returns `{ok, status}` — so the `Promise.all` blocks in both the purge and the undo cannot reject, and the gate's strict shape is honored by `putWorkspace` (api.js:356-362). The `run` closure correctly captures `before`/`affected` before the purge, `restore(snap)` re-replaces `S.data` wholesale, and the undo re-resolves live members by id (`teams.js:194`) so stale object references from the deleted doc cannot leak into the PUTs. The compose line uses the optional `:-` form immediately after `MASTER_KEY` (docker-compose.yml:40), never `:?`, and DEPLOY.md §14's "Compose users: no extra step" section documents the four-step rotation cycle with the env-only key discipline. All 7 undo-membership pins and both compose-config tests pass (verified this session: 10 pass / 0 fail).

No critical issues found. Three warnings and three info items below.

## Warnings

### WR-01: pushNow() wait loop is unbounded polling with no failure exit or user feedback

**File:** `src/core/store.js:166`
**Issue:** `while (pushing) await new Promise(r => setTimeout(r, 25));` has no upper bound and no abort. If an in-flight `push()` PUT hangs (browser fetch has no default timeout for a stalled-but-open connection), the undo's `onAction` awaits forever: no membership PUTs fire (good), but also no error toast, no timeout, and the toast's undo button may already be gone — the user sees nothing while the click handler is parked. Unlike the 409/401/403 paths, this stall path has no honest feedback.
**Fix:** Bound the wait, e.g.:
```js
const deadline = Date.now() + 5000;
while (pushing) {
  if (Date.now() > deadline) return { ok: false, status: 0 };
  await new Promise(r => setTimeout(r, 25));
}
```
(consistent with the ~5s toast window the plan already cites).

### WR-02: the undo gate uses `pushed.ok === false`, which misses an ok-less result shape

**File:** `src/actions/teams.js:188`
**Issue:** The WR-01 gap gate tests strict equality: `if (pushed.ok === false)`. Today every `api.call()` path returns a well-formed `{ok: boolean}`, so this is safe — but the gate is the last line of defense against the guaranteed-400 unknownTeam cascade, and it silently disarms if `pushNow()` ever resolves with a result lacking `ok` (a future refactor of `putWorkspace`'s no-slug guard, a wrapper, a mock). The post-loop check at line 205 has the same shape. Defense-in-depth says the guard should not depend on the presence of the field, not just its exact value.
**Fix:**
```js
if (!pushed.ok) {
  toast(t('err.changeTeam'), { kind: 'err' });
  return;
}
```
and update the WR-01 source-scan pin's `body.indexOf('pushed.ok === false')` accordingly (or match both forms).

### WR-03: source-scan pins slice to end-of-file, over-scoping their assertions

**File:** `test/undo-membership.test.mjs:217, 248`
**Issue:** Both the D-06 and WR-01 pins compute `const body = src.slice(actionStart)` with no end bound, so "exactly one `setMemberTeams` call site" (lines 232-235, 262) and the ordering assertions count matches across the entire file remainder, not the `onAction` closure. A future `setMemberTeams` call appended anywhere after the closure (a new teams action) breaks the count assertion spuriously, and conversely the pin can pass while asserting less than intended. The WR-02 pin in store.js has the same shape but correctly bounds with `src.indexOf('export ', start + 10)` — the teams.js pins should mirror that discipline.
**Fix:** Bound the slice at the closure's end, e.g. slice from `onAction: async () => {` to the next top-level `A.` assignment or a balanced-brace scan, then run the existing assertions against that slice.

## Info

### IN-01: pushQueued set during pushNow()'s PUT is not drained by pushNow()

**File:** `src/core/store.js:178-185`
**Issue:** If a debounced `push()` fires during `pushNow()`'s in-flight PUT, it sets `pushQueued = true` and returns (store.js:135-138). `pushNow()` never reads `pushQueued`, so the flag lingers until the next real `push()` drains it. This is benign — `pushNow()`'s own PUT carries the same (or newer) `docSnapshot()`, and any post-pushNow change re-arms `save()`'s timers — but the interaction is non-obvious.
**Fix:** A one-line comment on the mutex block noting that a `pushQueued` left set by a deferred `push()` is intentionally subsumed by `pushNow()`'s own wire call.

### IN-02: the union replay also re-adds pre-delete rows for other teams, overriding mid-window removals

**File:** `src/actions/teams.js:200`
**Issue:** `union = before ∪ current ∪ tm.id` means a membership an admin *deliberately removed from another team* during the delete→undo window is silently re-added (it was in `before`). This is the planned D-03 design ("union never erases"), and the locked semantics only guaranteed "restores the deleted team's rows without erasing newer additions" — but the re-add side of the union is not called out in the code comment, which only advertises the additive guarantee.
**Fix:** Extend the comment at teams.js:196-199 to state both directions of the union (additions preserved, mid-window removals of pre-delete memberships are reverted), so a future reader does not mistake it for a deleted-team-only replay.

### IN-03: before-map captured unconditionally in local mode where it is unused

**File:** `src/actions/teams.js:136`
**Issue:** The `before` Map is built on every `delTeam` even when `api.enabled` is false, where the undo never reads it (the undo's `restore(snap)` path stops at line 180). Allocation is trivial and the capture-above-the-purge placement is deliberate (D-01), so this is cosmetic only.
**Fix:** Optional — no change needed; note the local-mode non-use in the existing capture comment if touched again.

---

_Reviewed: 2026-11-03_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
