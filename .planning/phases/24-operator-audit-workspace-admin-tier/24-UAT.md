---
status: partial
phase: 24-operator-audit-workspace-admin-tier
source: [24-01-SUMMARY.md, 24-02-SUMMARY.md, 24-03-SUMMARY.md]
started: 2026-10-31T13:20:00+01:00
updated: 2026-11-01T10:04:14Z
---

## Current Test

[testing complete]

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
expected: As a workspace admin, open the members page. A revoke action is visible on members below admin. First click stages the action (two-stage confirm), second click confirms. The member's other sessions are revoked — the member's browser shows "signed out elsewhere" on next action — while the admin's own session survives. A success toast appears.
result: issue
reported: "the admin only sees its session"
severity: major

### 6. Peer admin refusal
expected: A workspace admin attempting to revoke another ADMIN sees an honest refusal toast (err.adminOnly / ownerImmune copy) — no sessions are revoked and no audit row is written.
result: blocked
blocked_by: prior-phase
reason: "i cant say, its related to the previous test"

### 7. Deleted-user rows survive
expected: Delete a user who appears in the audit trail as actor or target. Their trail rows remain fully readable with name + email rendered from snapshot columns — no blank cells, no errors.
result: blocked
blocked_by: prior-phase
reason: "for this test, i tried revocating a second user session, but i can only see the first user session i revocated earlier, nothing appends so i can't go further in this one"

### 8. Revoked sessions audited end-to-end
expected: After a successful revoke (operator or admin tier), a new audit_log row exists with actor, action verb (sessions_revoked_by_operator / _by_workspace_admin), target snapshot, revoked session count, IP, and the correct workspace_id (set for admin tier, NULL for operator tier). The security_log dual-write still works.
result: blocked
blocked_by: prior-phase
reason: "same as test 7, cannot go further until other are fixed"

## Summary

total: 8
passed: 4
issues: 1
pending: 0
skipped: 0
blocked: 3

## Gaps

- gap_id: G-24-5
  truth: "As a workspace admin, the members page shows a revoke action on members below admin (two-stage confirm), and revoking kills the member's other sessions while the admin's own session survives, with a success toast"
  status: failed
  reason: "User reported: the admin only sees its session"
  severity: major
  test: 5
  artifacts: []
  missing: []


## Deferred Follow-Ups

[none yet]
