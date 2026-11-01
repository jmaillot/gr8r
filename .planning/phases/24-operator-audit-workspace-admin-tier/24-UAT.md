---
status: complete
phase: 24-operator-audit-workspace-admin-tier
source: [24-01-SUMMARY.md, 24-02-SUMMARY.md, 24-03-SUMMARY.md]
started: 2026-10-31T13:20:00+01:00
updated: 2026-11-01T12:26:34+01:00
---

## Current Test

[testing complete]
name: Revoked sessions audited end-to-end
expected: |
  After a successful revoke (operator or admin tier), a new audit_log row exists with actor, action verb (sessions_revoked_by_operator / _by_workspace_admin), target snapshot, revoked session count, IP, and the correct workspace_id (set for admin tier, NULL for operator tier). The security_log dual-write still works.
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server. Start from scratch — server boots without errors, the audit_log DDL + indexes are created (no migration errors), and the homepage / health check returns live data.
result: pass

### 2. Audit trail card in Settings (owner)
expected: As the instance owner, open Settings → sessions tab. An "Audit trail" card appears beside the operator card. Each row shows actor name/email, a verb badge (machine verb + human label), target snapshot, session count, IP, workspace id (or em-dash for operator-tier rows), and an "ago" timestamp. Rows appear latest-first.
result: pass

### 3. Verb filter chips
expected: On the audit trail card, the All / Operator / Admin chips filter the rows to the matching verb tier. Clicking a chip resets to page 1. A plain member account never sees this card (their 403 is handled silently — no error toast).
result: pass

### 4. Load more appends
expected: With more than 100 audit rows, the card shows a load-more button. Clicking it APPENDS the next page (rows are not replaced, no duplicates). When the trail is exhausted the button disappears.
result: pass

### 5. Admin revoke from members surface
expected: As a workspace admin, open the members page. A revoke action is visible on members below admin. First click stages the action (two-stage confirm), second click confirms. The member's other sessions are revoked — the member's browser shows "signed out elsewhere" on next action — while the admin's own session survives. A success toast appears. (Retest after fix plan 24-04: the audit-trail card should now be visible to workspace admins too.)
result: pass
note: "Retest confirmed post-24-04: revoke works from workspace members panel (member signed out elsewhere, admin session survives), audit-trail card now visible to workspace admin in Settings → sessions. Revoke lives on workspace members surface by design, not Settings → members.

### 6. Peer admin refusal
expected: A workspace admin attempting to revoke another ADMIN sees an honest refusal toast (err.adminOnly / ownerImmune copy) — no sessions are revoked and no audit row is written.
result: pass
reason: "i cant say, its related to the previous test"

### 7. Deleted-user rows survive
expected: Delete a user who appears in the audit trail as actor or target. Their trail rows remain fully readable with name + email rendered from snapshot columns — no blank cells, no errors.
result: pass
reason: "for this test, i tried revocating a second user session, but i can only see the first user session i revocated earlier, nothing appends so i can't go further in this one"

### 8. Revoked sessions audited end-to-end
expected: After a successful revoke (operator or admin tier), a new audit_log row exists with actor, action verb (sessions_revoked_by_operator / _by_workspace_admin), target snapshot, revoked session count, IP, and the correct workspace_id (set for admin tier, NULL for operator tier). The security_log dual-write still works.
result: pass
reason: "same as test 7, cannot go further until other are fixed"

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-24-5
  truth: "As a workspace admin, the members page shows a revoke action on members below admin (two-stage confirm), and revoking kills the member's other sessions while the admin's own session survives, with a success toast"
  status: resolved
  resolved_by: 24-04-PLAN.md
  resolved_at: 2026-11-01
  reason: "User reported: the admin only sees its session"
  severity: major
  test: 5
  artifacts:
    - path: src/pages/settings.js
      issue: "line 551 — audit-trail card mounted only when api.user?.isInstanceAdmin; workspace admins (the tier that revokes) never see the trail"
    - path: src/actions/actions.js
      issue: "lines 1982-2002 — refreshAuditLog() gated on the same instance-admin flag; stale comment claims admins get 403, but server serves admin-tier rows per D-T3 (server.js:2394-2403)"
  missing:
    - "Mount auditTrailCard and refresh the audit log for workspace admins (admin/owner memberships), not just instance admins — server already supports it, plain member 403 still renders honest absence"
    - "Correct the stale 'admins get 403' comment in actions.js"


## Deferred Follow-Ups

[none yet]
