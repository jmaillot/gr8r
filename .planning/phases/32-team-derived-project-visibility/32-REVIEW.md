---
phase: 32-team-derived-project-visibility
reviewed: 2026-11-02T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - server.js
  - test/scope.test.mjs
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 32: Code Review Report

**Reviewed:** 2026-11-02
**Depth:** standard
**Files Reviewed:** 2 (`server.js`, `test/scope.test.mjs` — the four `32-1` commits on top of `1e82f11`)
**Status:** issues_found

## Summary

The team-derived visibility change is structurally sound on its core invariants. Verified directly against source:

- **Single funnel holds.** `memberCanReadProject` (server.js:677) is the only new predicate; both send-time surfaces and `hiddenFor`'s null-scope branch consume it. No second visibility pipeline was introduced.
- **Purely widening holds.** The team term only ever *removes* ids from hidden sets (`!memberCanReadProject → hidden`, server.js:781) and only *skips* sends (server.js:1177, 1308). No path adds to a hidden set or suppresses a previously-delivered notification that the member could read.
- **404 no-oracle holds.** The file side door (server.js:4711) routes through `hiddenFor`, which now carries the team term in the null-scope branch — team-hidden and unknown ids return the same byte-identical `fileNotFound` body (tested at D-08 cells, including the legacy scalar-`team` shape).
- **Scoped branch untouched.** The Phase-29 scoped branch (server.js:787-792) and `scopeGrants` are byte-identical to pre-phase; the D-03 grant inversion survives (tested explicitly).
- **Member_id vs user_id (Pitfall 2) handled correctly** at all three call sites: the membership row is resolved to `user_id` before `teamsOfUser` is queried.
- **Live read (D-05) confirmed** — no caching; the roster edit cell proves reach flips on the next request.
- Full `test/scope.test.mjs` suite passes: 81 tests, 78 pass, 0 fail, 3 pre-existing skips.

Two warnings remain, both in the send-time adoption: the D-06 admin/owner exemption was applied to the read funnel but **not** to the two send-time surfaces, and the reminder pass's team term can never positively fire because the pre-existing `remindable()` gate runs first. No critical issues found.

## Warnings

### WR-01: Admin/owner exemption missing from the send-time surfaces — admins silently lose reminders and emails for private projects

**File:** `server.js:1177` (email mirror) and `server.js:1308` (reminder pass)
**Issue:** `projectScope()` returns `null` for admin/owner roles (server.js:705), so both new null-scope gates route admins through `memberCanReadProject` — which has **no** admin exemption. `hiddenFor` explicitly exempts admins (server.js:773: `ROLE_RANK[...] < ROLE_RANK.admin` guards the team branch, falling back to plain `hiddenProjectIds`). The send-time surfaces do not replicate this.

Concrete regression (both pre-phase behaviors are lost):

- *Email mirror:* pre-phase, a null-scope recipient (`recipientScope` null, which includes admins) received every notification. Now an admin mentioned on a private project whose access list does not include them and whose `teams[]` they do not intersect is skipped by `memberCanReadProject` (server.js:1177) — no email.
- *Reminder pass:* an admin assignee on a private project they are not in the access list of: `inScopeProject(project, null)` passes (server.js:1305), then `memberCanReadProject` (server.js:1308) returns false → `continue`. Pre-phase they were reminded.

The same gate also affects members whose scope column is corrupt/empty — but for those, `projectScope`'s fail-open-to-null already made them "null-scope" and the new gate *tightens* what the read funnel would show them anyway (correct). Only for admins is the read contract (they see everything, D-06) now out of sync with the send contract.

**Fix:** Apply the same exemption the read funnel uses. In the reminder pass:

```js
if (!projectScope(assigneeMembership) &&
    ROLE_RANK[assigneeMembership?.role] < ROLE_RANK.admin &&
    !memberCanReadProject(project, ws.id, t.assignee)) continue;
```

In the email mirror's `else` branch (server.js:1170-1178):

```js
} else {
  const recipientRow = scopeByMember.get(n.to);
  if (ROLE_RANK[recipientRow?.role] < ROLE_RANK.admin) {
    const projectId = n.project || task?.project || null;
    if (projectId && !memberCanReadProject(projectById.get(projectId), wsRow.id, n.to)) continue;
  }
}
```

### WR-02: Reminder pass team term can never positively fire — `remindable()`'s access-list gate blocks team-only reach first

**File:** `server.js:1263` (with the new gate at `server.js:1308`)
**Issue:** The reminder loop evaluates `remindable(t, project)` **before** the scope/team gates, and `remindable` ends with `return canSeeProject(project, task.assignee)` — the pre-phase, access-list-only predicate with no team term. An on-team assignee who is *not* on a private project's access list (exactly the new Phase-32 audience) is dropped at server.js:1263 and never reaches the new team-aware gate at server.js:1308. So the new team term in the reminder pass is effectively skip-only, never widen: team reach opens the project in the doc read (`hiddenFor`), but the same member gets **no due reminder** for it. The test cell comments acknowledge this composition ("the on-team reminder can only flow for a member the OLD predicate already saw", test/scope.test.mjs:714-717) — which means VIS-04's "reminder pass rides the shared team predicate" is only half-delivered, and there is no test (nor possibility of one) proving the positive team-only reminder case. This diverges from the email mirror, where a mention to an on-team null-scope recipient *does* flow via `memberCanReadProject`.

**Fix:** Either widen `remindable` to use the shared predicate — `memberCanReadProject(project, ws.id, task.assignee)` (the workspace id must then be threaded into `remindable`, or hoist the gate next to the scope check where `ws.id` is already in scope) — or document the asymmetry as a deliberate decision in the phase artifacts. Hoisting is the cleaner fix and deletes the now-redundant skip-only gate:

```js
// replace remindable()'s final line at the call site, where ws.id is available:
if (!project || project.archived) continue;
if (!projectIsPrivate(project) ? false : !memberCanReadProject(project, ws.id, t.assignee)) continue;
```

(Then add the missing positive cell: on-team assignee, off the access list, on `p_teamX`, expecting a `due_reminder` row.)

## Info

### IN-01: `memberCanReadProject`'s "keep flowing" semantics for underivable projects ride a hidden quirk of `canSeeProject`

**File:** `server.js:677-685`
**Issue:** `canSeeProject(undefined, memberId)` returns `true` (`projectIsPrivate(null)` is false), so `memberCanReadProject(undefined, ...)` is `true`. The email branch at server.js:1177 depends on this for its "underivable → keep flowing" contract (a notif whose project was deleted between doc write and email build still flows, matching pre-phase `inScopeProject(null, scope) === true`). Correct today, but the invariant lives two functions away from the call site and one refactor of `canSeeProject`'s null handling away from silently flipping to "drop all orphaned notifs" (or, worse, if someone "fixes" it to `false`, from silently dropping them).

**Fix:** Make the contract explicit at the call site: `if (projectId && projectById.has(projectId) && !memberCanReadProject(projectById.get(projectId), wsRow.id, n.to)) continue;` — or add a one-line comment on `memberCanReadProject` stating that a null project is readable by design.

### IN-02: Test coverage gaps — no admin-recipient send-time cell, and the positive reminder team path is structurally untestable

**File:** `test/scope.test.mjs` (Phase 32 cells)
**Issue:** The new MATRIX team cells are strong on the read path (A1, D-03 inversion, D-05 live read, D-08 side door, JIT, doc-put reservation) but the send-time cells only pin (a) the on-team reminder that the *old* predicate would have delivered anyway (via `p_teamL`'s access list) and (b) the zero-team skip. There is no cell asserting an admin/owner still receives a reminder or email for a private project — which is precisely the behavior WR-01 regresses — and no cell proving team-only reach drives a send (blocked by WR-02).

**Fix:** After WR-01/WR-02 land, add: (1) an admin-recipient email cell on `p_priv3`/`p_teamX`, (2) an on-team-off-access-list reminder cell, both asserting pre-phase delivery is preserved.

---

_Reviewed: 2026-11-02_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
