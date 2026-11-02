---
phase: 28-multi-team-membership
reviewed: 2026-11-01T00:00:00Z
depth: deep
files_reviewed: 13
files_reviewed_list:
  - server.js
  - src/core/api.js
  - src/core/store.js
  - src/actions/teams.js
  - src/actions/actions.js
  - src/data/seed.js
  - src/overlays/popovers.js
  - src/overlays/modals.js
  - src/overlays/drawer.js
  - src/pages/members.js
  - test/membership.test.mjs
  - test/migration.test.mjs
  - test/helpers/legacy-fixture.mjs
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 28: Code Review Report

**Reviewed:** 2026-11-01
**Depth:** deep
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Reviewed the full multi-team membership implementation: the `team_members` join-table authority (schema, migration, sync/projection), the revisionless `PUT /members/:uid/teams` route, invites with a teams[] array, the client hybrid contract (optimistic doc mutation + authority PUT), and the `assignableInProject` picker predicate.

The core architecture is sound: migration guard is per-row and idempotent (byte-identical no-op on re-boot, proven by tests), the invite/teams PUT validation mirrors each other closely, purge-on-leave/remove is transactional with the membership delete, and `docFromClient`/`normalizeDoc` strip doc-carried membership on both read and write paths. All 53 tests in `membership.test.mjs` and `migration.test.mjs` pass.

No critical findings. Four warnings — the most substantive being partial-failure divergence in the client's multi-member team PUT fan-out and orphaned authority rows from stale invite team sets. Two pre-existing eslint `no-undef` errors (`myNotifs`, documented in deferred-items.md) remain in `src/actions/actions.js`.

Verification executed: `node --test test/membership.test.mjs test/migration.test.mjs` → 53 pass / 0 fail; `npx eslint <9 touched src files>` → 2 pre-existing errors in actions.js only.

## Warnings

### WR-01: Partial failure in multi-member team PUT fan-out leaves client/server membership divergent

**File:** `src/actions/teams.js:96-109` (also `src/actions/teams.js:136-149`)
**Issue:** `A.submitTeam` optimistically writes membership into doc profiles, then issues one `setMemberTeams` PUT per changed member via `Promise.all`. On any failure it rolls back **all** members to `before` client-side — but the PUTs that already succeeded are durable server-side authority rows. The client now shows the old team set while the server holds a mixed set; nothing re-syncs until the next `refreshMembers()`, and a subsequent doc PUT from this session does not carry membership (by design), so the divergence persists indefinitely. `A.delTeam` has the same shape: a failed purge leaves some members' rows deleted and others not, yet the whole operation is abandoned.
**Fix:** On any `!r.ok` result, re-fetch the authoritative set instead of a client-side rollback — e.g. `await refreshMembers()` before rendering the error toast — or retry the failed PUTs serially before declaring failure.

### WR-02: Invite acceptance writes unvalidated team ids into team_members (orphan rows)

**File:** `server.js:3402-3414` (`addMembership`, invite accept path)
**Issue:** The invite **creation** route whitelists team ids against the doc's team definitions, but **acceptance** (`POST /api/invites/:token/accept` → `addMembership(ws, user, invite.role, JSON.parse(invite.teams))`) inserts whatever the invite row carries with no whitelist re-check. If a team is deleted between invite creation and acceptance (or the workspace doc is replaced), the joiner gets `team_members` rows referencing a nonexistent team id. These orphans render as NO_TEAM, are invisible in any picker, and are only cleaned if an admin later re-PUTs that member's teams — the delete-then-insert of the teams PUT happens to drop them, but nothing triggers that.
**Fix:** In `addMembership` (or at the accept call site), filter `teamList` against the workspace doc's current team ids: `const known = new Set((JSON.parse(ws.doc)?.data?.teams || []).map(t => t?.id)); teamList = teamList.filter(t => known.has(t));`

### WR-03: `A.delTeam` dereferences an unguarded `team()` lookup

**File:** `src/actions/teams.js:120-122`
**Issue:** `const tm = team(el.dataset.id)` can return `null` (e.g. the team was deleted in another session and the local context menu is stale), yet line 121 immediately reads `tm.id` → uncaught TypeError. Compare `A.editTeam` at line 21, which correctly guards `if (!t) return;`.
**Fix:**
```js
A.delTeam = el => {
  const tm = team(el.dataset.id);
  if (!tm) return;
```

### WR-04: Toast Undo after team deletion restores the definition but not memberships

**File:** `src/actions/teams.js:150-165`
**Issue:** `A.delTeam` purges `team_members` authority rows via `setMemberTeams` **before** the doc mutation, then offers `restore(snap)` undo. The snapshot only covers the document, so Undo resurrects the team definition with zero members — membership data is irrecoverably lost while the UI implies full reversal. This is documented as accepted in `deferred-items.md` (28-02), but the UX contract (an Undo button that silently drops data) is worse than the alternative of not offering Undo for team deletion.
**Fix:** Either suppress the undo action for `delTeam`, or make undo re-PUT the captured `affected` members' previous team sets (available from `before`-style capture taken before the purge).

## Info

### IN-01: Hardcoded English error string in team name validation

**File:** `src/actions/teams.js:65`
**Issue:** `` `A team called "${f.name}" already exists` `` bypasses the i18n catalogue (`t()`), unlike every neighboring message. Also interpolated unescaped, though it lands in an error label that is escaped at render.
**Fix:** Add a catalogue key (e.g. `err.teamNameTaken`) and use `t('err.teamNameTaken', { name: f.name })`.

### IN-02: Teams PUT and invites routes validate team ids inconsistently (no trim on PUT)

**File:** `server.js:3135` vs `server.js:3234-3244`
**Issue:** The invites route does `.trim().slice(0, 40)` per item; `PUT /members/:uid/teams` does only `.slice(0, 40)`. An id submitted with surrounding whitespace is accepted by one route and rejected (or stored differently) by the other. Harmless with the current client (exact ids), but the two "mirrored" validations are not actually mirrored.
**Fix:** Add `.trim()` before `.slice(0, 40)` in the teams PUT route.

### IN-03: Pre-existing `no-undef` eslint errors in actions.js

**File:** `src/actions/actions.js:2305-2306`
**Issue:** `myNotifs is not defined` in `A.markAllRead` — two eslint errors, present before phase 28 and documented in deferred-items.md as out of scope. Not membership-related, but they sit in a file this phase touched.
**Fix:** Import `myNotifs` from `../core/store.js` (one-line fix; the deferred-items note should be closed when lint-clean CI is required).

### IN-04: `submitMemberTeams` ordering makes the no-change check unreliable

**File:** `src/actions/actions.js:1920-1925`
**Issue:** The early-return compares `JSON.stringify(previous)` vs `JSON.stringify(next)` — order-sensitive. `previous` comes from the server (ordered by `team_id`), `next` from toggle order, so a user toggling a team off and back on produces a "changed" payload and a redundant PUT. Harmless (the server route is idempotent delete+insert), just noise.
**Fix:** Compare as sorted sets: `[...previous].sort().join()` vs `[...next].sort().join()`.

### IN-05: Member pickers offer `invited` (not yet joined) members for assignment

**File:** `src/overlays/popovers.js:142,160`
**Issue:** The assignee/subassignee pickers filter only `m.status !== 'deactivated'`; members still in `invited` state are assignable. `memberInProjectTeams`/`assignableInProject` themselves are status-agnostic. Pre-existing behavior now amplified by the team-scoped predicate (a team mention path at `src/actions/actions.js:146` *does* check `status === 'active'`, so the codebase is internally inconsistent).
**Fix:** If unintended, add `m.status === 'active'` to the picker filters in popovers.js to match the mention-target predicate.

---

_Reviewed: 2026-11-01_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
