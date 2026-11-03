---
phase: 35-honest-undo-deploy-gap
reviewed: 2026-11-03T19:20:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - src/actions/teams.js
  - src/core/store.js
  - test/undo-membership.test.mjs
  - test/compose-config.test.mjs
  - docker-compose.yml
  - DEPLOY.md
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 35: Code Review Report

**Reviewed:** 2026-11-03T19:20:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Phase 35 lands the honest delTeam undo (awaited `pushNow()` doc push, then per-member union replay through the admin-gated membership route) and the compose `MASTER_KEY_PREVIOUS` forwarding with a two-layer config test and a DEPLOY.md §14 walkthrough.

The core design is sound: the before-map capture is correctly hoisted above the purge block (teams.js:136), `restore(snap)` is unconditionally first in `onAction` (local mode preserved per D-06), and the union shape is genuinely load-bearing against the server's full-set-replace PUT — pinned by tests. The compose line uses the safe `:-` optional form, and server.js:88 normalization (`String(... || '')`) makes the empty default a no-op, verified against source. No critical issues.

Two warnings: the undo path fires membership PUTs before checking whether the doc push succeeded (guaranteed-doomed `unknownTeam` 400s on push failure), and `pushNow()` does not take the module's `pushing` flag, so a user edit during the undo window can race it into a false 409 conflict lock.

Out of scope per instructions: pre-existing lint failure in `test/notif-prefs.test.mjs:306` (pre-dates this phase).

## Warnings

### WR-01: Union membership PUTs fire before `pushed.ok` is checked

**File:** `src/actions/teams.js:181-198`

**Issue:** `onAction` awaits `pushNow()` and then unconditionally launches `Promise.all(...)` of `setMemberTeams` PUTs; the `pushed.ok === false` check happens only afterwards, at line 195. If the doc push fails (409 conflict, 401/403, network error), the server doc does not contain the restored team, so every membership PUT is guaranteed to 400 `unknownTeam` — the exact premature-PUT failure the phase's own sequencing invariant exists to prevent (proven by UNDO-01's negative case). Worse, in a multi-admin workspace a 409 means the server doc is *newer*: if that newer doc happens to contain a team with `tm.id` (e.g. another admin re-created one), the PUT succeeds and writes authority rows while the client still shows the error toast — divergent state presented as failure. The fix preserves D-02 honest failure but stops firing known-doomed requests.

**Fix:**
```js
const pushed = await pushNow();
if (pushed.ok === false) {
  toast(t('err.changeTeam'), { kind: 'err' });
  return;
}
const results = await Promise.all(/* ... unchanged ... */);
if (results.some(r => !r?.ok)) {
  toast(t('err.changeTeam'), { kind: 'err' });
  return;
}
```

### WR-02: `pushNow()` does not take the `pushing` flag — concurrent PUT race can false-409 the whole app into conflict lock

**File:** `src/core/store.js:162-177`

**Issue:** `push()` serializes itself with the module-level `pushing` flag (lines 135-139). `pushNow()` only *waits out* an in-flight push (the 25 ms poll loop) and then runs its own `api.putWorkspace(docSnapshot())` **without setting `pushing = true`**. Any `save()` call that lands after `pushNow()` clears the timers but during its in-flight PUT (a user edit in the undo window; `restore()`/render side effects) schedules `_pushT = setTimeout(push, 450)`, and that `push()` runs concurrently with `pushNow()`'s PUT — the exact "two concurrent PUTs of the same document" the comment at line 164-165 says it exists to prevent. Two concurrent PUTs of the same revision → one gets 409 → `S.ui.conflict = true` (line 175) → the entire workspace is conflict-locked from a false positive, requiring a reload. Narrow window (needs RTT > ~600 ms), but the consequence is a full app lock.

**Fix:**
```js
export async function pushNow() {
  if (!api.enabled || !api.user || S.ui.conflict) return { ok: false, status: 0 };
  while (pushing) await new Promise(r => setTimeout(r, 25));
  clearTimeout(_saveT);
  clearTimeout(_pushT);
  pushing = true;                      // take the same mutex push() uses
  try {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(docSnapshot()));
    } catch { /* server copy is authoritative */ }
    return await api.putWorkspace(docSnapshot());
  } finally {
    pushing = false;
  }
} // conflict-flag handling unchanged; `dirty`/`pushQueued` bookkeeping can stay push()-owned
```
(The 25 ms poll loop is also an unbounded wait if a push hangs; with the mutex taken, a deadline or single-check would be tighter, but the mutex is the correctness fix.)

## Info

### IN-01: Inconsistent result-check idioms in the same condition

**File:** `src/actions/teams.js:195`

**Issue:** `pushed.ok === false` (strict — treats a missing `ok` as success) vs `results.some(r => !r?.ok)` (falsy — treats a missing `ok` as failure) two tokens apart. Both API results carry `ok` today, so no live bug, but the asymmetry invites regressions if one call site starts returning bare responses.

**Fix:** Pick one idiom — prefer `if (!pushed.ok || results.some(r => !r?.ok))` — which also matches WR-01's early-return shape.

### IN-02: The undo tests never execute the actual `onAction` closure — WR-01 is invisible to them

**File:** `test/undo-membership.test.mjs:52-99, 211-236`

**Issue:** UNDO-01/02 replay the HTTP sequence manually via the admin client, and the D-06 "local-mode pin" is a source-regex scan. Both are reasonable given there is no DOM/browser harness, and the summaries say so honestly — but the consequence is that the *client-side* logic of `onAction` (the `pushed.ok` gating, the union construction, the `before.get(x.id) || []` fallback) has zero executable coverage. WR-01 exists precisely in that blind spot: the test's negative case proves a premature PUT 400s, yet the production code can still emit one and no test would notice.

**Fix:** When a client-harness exists, drive `onAction` directly. Until then, a cheap partial pin is possible: a source-scan test asserting the `pushNow()` await is followed by an `if (pushed.ok === false) return;` guard *before* the first `setMemberTeams` occurrence — same file-scan style as the existing D-06 test.

### IN-03: `restore(snap)` clobbers edits made during the toast window — now server-persisted, not just local

**File:** `src/actions/teams.js:179-181`

**Issue:** `snap` was taken before the delete `mutate()`; `restore(snap)` rewinds the *entire* local doc to that moment, discarding any project/task edits the user made between the delete and the undo click (~5 s toast window). This was pre-existing behavior in local mode; what Phase 35 adds is `pushNow()` — so the rewound stale doc is now **awaited onto the server**, making the clobber durable for API-mode workspaces too. The union replay protects `team_members` authority rows only; doc-level edits in the window are lost in both modes. This is the documented D-05/D-06 design tradeoff (unconditional restore, honest failure), not a coding error — flagged so the tradeoff is a conscious record rather than an accident.

**Fix:** None required for this phase (design decision). If revisited: capture a second snapshot at undo-click time and re-apply only the team-restoration delta instead of wholesale `restore(snap)`.

---

_Reviewed: 2026-11-03T19:20:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
