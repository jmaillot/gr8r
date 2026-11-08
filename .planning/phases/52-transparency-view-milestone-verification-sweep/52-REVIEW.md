---
phase: 52-transparency-view-milestone-verification-sweep
reviewed: 2026-11-08T12:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - server.js
  - src/actions/actions.js
  - src/core/api.js
  - src/pages/members.js
  - src/locales/en.json
  - src/locales/fr.json
  - scripts/i18n-scan.mjs
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 52: Code Review Report

**Reviewed:** 2026-11-08T12:00:00Z
**Depth:** standard
**Files Reviewed:** 7 (scoped to `git diff 3521252..HEAD` on the phase file list)
**Status:** issues_found

## Summary

Phase 52 adds an admin-only `GET /api/workspaces/:slug/members/:memberId/visibility` endpoint (readable projects + first-match access reason via the existing `memberCanReadProject` funnel), a client expander on the members page, and an i18n allowlist entry.

The security posture is solid: the server-side `requireWorkspace(..., 'admin')` gate plus `sameOrigin` check matches the sibling member routes (server.js:4979–4983); unknown and non-member target ids share one keyed 404 body (no existence oracle); the route regexes are `$`-anchored so `/visibility` cannot be captured by the generic `PATCH/DELETE /members/:id` route; project names and reason labels are escaped through the single `esc` helper (`escHtml`), so no XSS path was found in the expander rendering; and `projectAccessReason` is a faithful label mirror of `canSeeProject`'s short-circuit order (lead ∈ members is guaranteed by `normalizeProjects`, run on a read-only copy of the doc).

The findings below are client-side robustness issues in the expander's async state handling and one dead safety-net on the server. `node scripts/i18n-scan.mjs` and the i18n test suite pass; all six new EN/FR keys are present in both locales and correctly referenced.

## Warnings

### WR-01: Error-path fetch result adopted without the stale-guard re-check

**File:** `src/actions/actions.js:2425-2429`
**Issue:** The success path correctly guards against the expansion being closed or re-targeted while the request is in flight (`if (S.ui.memberVisibility !== id) return;`, line 2432). The error path does not: `S.ui.memberVisibilityData = { err: true }; render();` runs unconditionally. If the admin toggles member A (slow failing request), then toggles member B, A's failure lands after B's panel opened and overwrites B's `null` (loading) data with `{ err: true }` — B's panel shows "—" while B's own request is still in flight, and B's success result will then overwrite the error (a flickering, wrong panel).
**Fix:**
```js
    if (res.status === 401) return;
    if (S.ui.memberVisibility !== id) return; // same stale-guard as the success path
    S.ui.memberVisibilityData = { err: true };
    render();
```

### WR-02: Early return on missing `userId` leaves the panel stuck in the loading state

**File:** `src/actions/actions.js:2420-2421`
**Issue:** After `S.ui.memberVisibility = id` and `render()`, `if (!m?.userId) return;` aborts without ever setting data. The panel renders `t('a11y.loading')` forever (the expander button is only rendered for `m.userId` at render time, but the roster can change between render and click — e.g. a mid-session membership removal makes `mem(id)` return `undefined`). Any future code path reaching this with a falsy `userId` yields an un-dismissable-only-by-retoggle loading row with no error signal.
**Fix:** Reset to closed before returning:
```js
  const m = mem(id);
  if (!m?.userId) {
    S.ui.memberVisibility = null;
    S.ui.memberVisibilityData = { err: true };
    render();
    return;
  }
```

### WR-03: Stale expansion survives navigation — panel re-shows cached data on return

**File:** `src/pages/members.js:71` / `src/actions/actions.js:2409-2434`
**Issue:** `go()` (`src/shell/render.js:69-79`) resets per-surface transient UI (`pop`, `composer`, `editCell`, …) but does not reset `S.ui.memberVisibility` / `memberVisibilityData`. Navigating away from Members and back re-opens the previously expanded member's row rendering the **previous fetch's** data verbatim. This contradicts the phase's own stated invariant (D-52-3: "EVERY open refetches… the panel is always the server's current answer") — the row-level toggle refetches, but navigation back to the surface counts as an open with zero refresh and presents stale access data.
**Fix:** Clear both keys in `go()`'s transient reset block (`src/shell/render.js`), or render the row as loading (`data = null`) when stale, triggering a refetch on render.

## Info

### IN-01: Unreachable `?? 'member'` fallback masks a funnel/label divergence

**File:** `server.js:4995`
**Issue:** `projectAccessReason(p, targetMemberId, memberTeams) ?? 'member'` — the fallback is dead code: whenever `memberCanReadProject` returns true, `projectAccessReason` provably returns a non-null code (both branches share the same private/members/teams terms, and `!memberId` makes both false for private projects). If the funnel and the mirror ever diverge, this fallback would silently label a project "Member" instead of surfacing the divergence. Either drop the `?? 'member'` or fall back to a neutral, honest code.
**Fix:** `reason: projectAccessReason(p, targetMemberId, memberTeams)` with a server-side guard/log if null, or at minimum a comment that the fallback is unreachable by construction.

### IN-02: Duplicate reason-code list on the client

**File:** `src/pages/members.js:75`
**Issue:** `const KNOWN = ['everyone', 'lead', 'member', 'team'];` is re-declared inside the render closure per member row, duplicating the server's reason vocabulary. Harmless today (unknown codes are `esc`-escaped and displayed raw — good defensive fallback), but a new server code would render its raw machine string to admins until the client list is updated.
**Fix:** Hoist to a module-level constant next to the other members-page constants, and add a comment tying it to `projectAccessReason` in server.js.

---

_Reviewed: 2026-11-08T12:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
