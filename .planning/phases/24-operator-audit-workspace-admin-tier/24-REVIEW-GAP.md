---
phase: 24-operator-audit-workspace-admin-tier
plan: 24-04 (gap closure, G-24-5)
reviewed: 2026-11-01T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - src/actions/actions.js
  - src/pages/settings.js
  - test/audit-log.test.mjs
findings:
  critical: 0
  warning: 0
  info: 3
  total: 3
status: clean
---

# Plan 24-04: Code Review Report (gap closure — client-gate relaxation)

**Reviewed:** 2026-11-01 (diff range 8e08911..9d79038, commits e098cab + 9d79038)
**Depth:** standard
**Files Reviewed:** 3
**Status:** clean (no Critical or Warning findings; 3 Info-level observations)

## Summary

The diff does exactly what plan 24-04 prescribes, and nothing it prohibits. Verified against source:

- **403→null honest-absence path holds for plain members.** `fetchAuditPage` (actions.js:1991-1998) turns any non-401 failure — including the member's 403 `adminOnly` — into `S.ui.auditTrail = null` with **no toast**: the shared `call()` in `src/core/api.js:52-80` returns errors as data and never toasts, and neither `refreshAuditLog` nor `fetchAuditPage` invokes `toast()`. `auditTrailCard()` null-guard (settings.js:137-139) renders `''`. No error-toast leak, no information disclosure: the 403 body (`adminOnly`) is discarded, never rendered.
- **No regression in the operator lane.** `refreshOperatorUsers()` (actions.js:1945) keeps its `!api.user?.isInstanceAdmin` gate untouched (plan prohibition honored); `operatorCard()` is still self-guarding on `S.ui.operatorUsers`, which is never populated for non-admins, so the now-unconditional `operatorCard() + auditTrailCard()` concatenation renders honest absence for members. For instance admins the rendered output is byte-identical to pre-diff.
- **No server.js change** in the diff range; server.js:2373-2432 tier scoping (operator all / admin own-memberships / member 403) re-read and confirmed correct — matches the comment rewrite's claims.
- **Call-site comment** (actions.js:293) updated as Task 1 required; stale "admins get 403" rationale replaced with the accurate tier description (actions.js:1982-1990).
- **Test quality:** the new cross-membership test (test/audit-log.test.mjs:337-376) uses real routes for membership setup (workspace create → invite → accept), seeds both a workspace-B row and a NULL-workspace operator row via the established `withDb` shape, and asserts the strong invariant `every(r => r.workspace_id === ws.id)` — which subsumes both negative assertions. Ran `node --test test/audit-log.test.mjs`: **18/18 pass**, including the new test.

Prohibitions checked: no server.js diff, no `refreshOperatorUsers`/`operatorCard` gating change, no new i18n keys, no new dependencies.

## Info

### IN-01: Redundant negative assertions in the new test

**File:** `test/audit-log.test.mjs:373-375`
**Issue:** `assert.ok(body.rows.some(r => r.id === 'xmem-b-row') === false)` and the `xmem-op-row` assertion are logically implied by the preceding `every(r => r.workspace_id === ws.id)` check (a NULL `workspace_id` fails `===` comparison). Harmless — explicit negatives document intent — but they add surface without adding coverage.
**Fix:** Optional: drop the two redundant assertions or keep them as self-documenting pins; either is defensible.

### IN-02: Member 403 traffic on every sessions-tab mount

**File:** `src/actions/actions.js:2002-2005`
**Issue:** Every plain member now issues one guaranteed-403 `GET /api/audit-log` per sessions-tab mount. The plan explicitly accepts this (threat T-24-08, severity low, disposition accept — matches the D-121 read precedent), so this is recorded for the record, not flagged as a defect.
**Fix:** None required. If ever revisited: a session-scoped "known-403" memo would remove the repeat request without reintroducing a client-side membership gate.

### IN-03: Brief absence flash for admins on tab remount

**File:** `src/actions/actions.js:2003-2004` + `src/pages/settings.js:554`
**Issue:** `refreshAuditLog()` resets `S.ui.auditTrail = null` before the fetch resolves, so an admin returning to the sessions tab sees the trail card vanish for one fetch round-trip, then reappear. Cosmetic (no empty chrome, no toast), pre-existing render pattern shared with `refreshOperatorUsers`. The plan's "no flash of empty chrome" claim refers to members, who correctly see permanent honest absence.
**Fix:** None required; if polish is ever wanted, keep the previous rows visible until the refetch resolves instead of nulling first.

---

_Reviewed: 2026-11-01_
_Reviewer: gsd-code-reviewer (subagent)_
_Depth: standard_
