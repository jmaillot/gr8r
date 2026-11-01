---
phase: 24-operator-audit-workspace-admin-tier
reviewed: 2026-11-01T00:00:00Z
depth: deep
files_reviewed: 6
files_reviewed_list:
  - server.js
  - src/actions/actions.js
  - src/pages/settings.js
  - src/pages/members.js
  - src/core/api.js
  - test/audit-log.test.mjs
findings:
  critical: 0
  warning: 1
  info: 5
  total: 6
status: issues_found
---

# Phase 24: Code Review Report

**Reviewed:** 2026-11-01
**Depth:** deep
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Reviewed the audit-log and workspace-admin tier implementation at deep depth (cross-file call-chain tracing): the `audit_log` schema and tier-scoped read (server.js:195-210, 2364-2421), the operator revoke route (server.js:2445-2481), the workspace-admin revoke route (server.js:2763-2800), the client fetch/render layer (actions.js:1982-2052, settings.js:125-153, api.js:259-278), the members-page revoke button (members.js:55-57), and the test suite (audit-log.test.mjs).

High-level assessment: the core invariants hold. Both revoke routes wrap DELETE + security_log + audit_log INSERT in a single `transaction()` (server.js:1057-1067, `begin immediate` with rollback on throw); no UPDATE or DELETE against `audit_log` exists anywhere (verified by grep and asserted by the D-A4 test at test/audit-log.test.mjs:470-473); tier scoping is decided server-side (operator: all rows; workspace admin: `workspace_id in (admin memberships)`; plain member: 403 — server.js:2394-2403). All SQL is parameterized, all audit fields are `esc()`-escaped client-side (settings.js:144-145), and gate order follows the Pitfall-22 convention (sameOrigin → requireUser → throttle → role gate) in both routes. The one Warning is a stale-response race in the client trail fetch; the remaining items are Info-level observations, several of which document deliberate design decisions worth confirming as intended.

## Warnings

### WR-01: Stale-response race in audit trail fetch can render rows for the wrong filter

**File:** `src/actions/actions.js:2002-2024`
**Issue:** `A.auditVerbFilter` sets `S.ui.auditVerb` then awaits `refreshAuditLog()`, but `fetchAuditPage` never re-checks after the `await api.auditLog(params)` resolves whether the still-current `S.ui.auditVerb` matches the params it fetched with. Two rapid chip clicks launch two in-flight requests; if the *earlier* one resolves last, it overwrites `S.ui.auditTrail` with rows for a filter that is no longer selected — the UI then displays rows that don't match the highlighted chip. The same window exists between `refreshAuditLog()` and a concurrent `A.auditLoadMore` (2011-2024): a load-more page can be appended onto a trail that a filter reset has just replaced. The lockstep guard exists everywhere else in the phase (`D-V2` reset semantics, `D-V3` cursor guard) but not this final await.
**Fix:**
```js
async function fetchAuditPage(params) {
  const res = await api.auditLog(params);
  if (!res.ok) {
    if (res.status !== 401) S.ui.auditTrail = null;
    return null;
  }
  // Discard if a newer request changed the filter while we were in flight.
  const currentVerb = auditVerb();
  if ((params.verb || '') !== currentVerb) return null;
  S.ui.auditTrail = { rows: res.data.rows || [], nextBefore: res.data.nextBefore || null };
  render();
  return S.ui.auditTrail;
}
```
A monotonically increasing request token compared after the await is the more general fix and also covers the load-more/refresh interleaving.

## Info

### IN-01: Zero-effect revocations leave no audit trail

**File:** `server.js:2472`, `server.js:2791`
**Issue:** Both routes gate the audit INSERT (and `logSecurity`) on `del.changes > 0` (D-117). Correct that a no-op isn't a mutation, but the consequence is that repeated revoke *attempts* against a target with no live sessions (or an already-revoked target) are completely invisible to the trail — the audit log records outcomes, never attempts. If the audit intent ever includes "who tried to revoke whom", this gate is the gap. Flagged for confirmation that outcome-only auditing is the intended contract (the D-117 test at test/audit-log.test.mjs:280-298 shows it is deliberate).
**Fix:** If attempt-auditing is ever wanted, log the zero-change case with `session_count: 0` in the same transaction; otherwise document the outcome-only decision next to D-117.

### IN-02: Malformed pagination cursor silently returns page 1

**File:** `server.js:2407-2412`
**Issue:** `Number(url.searchParams.get('before'))` yields `NaN` for non-numeric input; `Number.isFinite` then silently drops the whole cursor clause, and a present-but-falsy `beforeId` does the same. The client always sends a well-formed cursor, but any future consumer (or a truncated/pinned URL) gets page 1 with a 200 instead of a 400 — masking bugs rather than surfacing them. The unknown-verb branch (2390) made the opposite, explicit choice (`where.push('0')` with a comment); the cursor branch is inconsistent with it.
**Fix:** Mirror the verb branch: if `before` or `beforeId` is present but invalid, `where.push('0')` (or return 400) so a bad cursor yields an empty/failed page rather than silently restarting the trail.

### IN-03: auditLoadMore silently drops errors; dead double-return

**File:** `src/actions/actions.js:2017-2019`
**Issue:** `if (res.status !== 401) return; return;` — both branches return, so the first line is dead, and unlike every sibling action (`memberRevokeConfirm`, `operatorRevokeConfirm`) a failed load-more produces no toast or state change: the button stays and the user can only re-click with no signal. A network failure is indistinguishable from "no more rows" (except the button would vanish in the latter case).
**Fix:** Collapse to a single `return` with a comment, and surface non-401 failures (toast, or revert `nextBefore` so the button at least doesn't appear "stuck").

### IN-04: Workspace-admin revocation is account-global while authority and audit visibility are workspace-scoped

**File:** `server.js:2789`, `server.js:2795`
**Issue:** The admin-tier DELETE removes the target's sessions instance-wide (`delete from sessions where user_id = ?`), but the acting admin only has authority in `ctx.ws.id`, and the audit row carries only that workspace — so an admin in workspace A can sever a shared member's sessions in workspace B, and workspace B's admins see no trail row for it. This mirrors the operator route's shape and sessions are account-level credentials, so it is defensible — but it is the one place where the tier's blast radius exceeds its scoping, and it's undocumented next to D-R2.
**Fix:** If intended, add a decision note (e.g., "D-R5: session revocation is account-global by design; the audit row's workspace_id marks the acting workspace, not the effect scope"). If not, restrict the DELETE to sessions whose last activity intersected the workspace — significantly harder, which argues for the documentation route.

### IN-05: Members table renders a revoke button for targets the server will always refuse

**File:** `src/pages/members.js:55-57`
**Issue:** The revoke button is gated on `isAdmin && m.userId` only. `canManage` two lines up (line 22) already encodes the rank rule (`m.role !== 'Owner' && m.role !== 'Admin'` for non-owners), but the revoke button doesn't reuse it — so a workspace admin sees "Revoke" on peer admins and the owner, clicks it, and gets a server 403 `adminOnly`. Behavior is safe (the tier rule is enforced server-side at server.js:2782-2783); it is purely a dead-affordance inconsistency within the same row.
**Fix:** Gate the button with the same rank logic as `canManage` (keeping the self-target allowance for D-118 revoke-my-others), e.g. `isAdmin && m.userId && (m.id === D().me || !isOver(m.role))` per the existing helpers.

## Test-suite observations (advisory)

- `test/audit-log.test.mjs:309-315` seeds an audit row with `Date.now() + 5000` (future timestamp) so it sorts last for the pagination test, and depends on a previous test having dropped/recreated `audit_log`. Node's test runner executes these sequentially so it works, but the file has cross-test state coupling — a `test()` reordering or a future `concurrency` option breaks it silently. Consider reseeding in a `before` of the AUD-03 block instead.
- Coverage of the phase's core guarantees is strong: same-transaction dual-write, forced-audit-failure rollback, zero-row no-op, tier scoping (operator all / admin own / member 403), user-deletion survival (D-A2), and the append-only source assertion (D-A4). No missing-assertion or flaky-pattern issues found.

## Verified-clean checklist

- **Append-only invariant:** no `update audit_log` / `delete from audit_log` anywhere (grep + D-A4 test).
- **Transaction atomicity:** both revoke routes use the shared `transaction()` helper (begin immediate / commit / rollback); DELETE + logSecurity + audit INSERT are one unit; forced audit failure rolls back the revocation (tested).
- **Tier scoping:** server-side only; operator sees all rows incl. `workspace_id` null; admins scoped to admin-rank memberships via parameterized `in (...)`; plain member 403.
- **Injection:** every dynamic SQL value parameterized; every rendered audit field `esc()`-escaped; verb filter whitelisted to the two fixed actions.
- **Gate order:** sameOrigin first in all new routes; throttle consumes refusals (D-116); owner immunity before session lookup (D-119); self-target allowed with keep-current `!= token_hash` clause (D-118/P-H).
- **No source files modified** during this review.

---

_Reviewed: 2026-11-01_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
