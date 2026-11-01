# Debug: admin only sees its session on members revoke (UAT G-24-5)

Phase: 24 — operator-audit-workspace-admin-tier
Date: 2026-11-01
Severity: major

## Symptoms

- expected (test 5): As a workspace admin, the members page shows a revoke action on members below admin (two-stage confirm); revoking kills the member's other sessions while the admin's own session survives, with a success toast.
- actual (user, verbatim): "the admin only sees its session"
- Tests 6 (peer-admin refusal), 7 (deleted-user row survival), 8 (end-to-end audit rows) blocked behind this.
- Test 7's reason: "i tried revocating a second user session, but i can only see the first user session i revocated earlier, nothing appends so i can't go further" — the verification surface shows no new revoke activity.

## Evidence

### E1 — The server-side admin revoke route is correct (server.js:2763-2800)
`POST /api/w/:slug/members/:id/revoke-sessions`: sameOrigin → requireUser → throttle → `requireWorkspace(slug,'admin')` → notAMember → ownerImmune (D-119 order) → strictly-below-admin rank rule (self exempt, D-118) → `transaction()` with `delete from sessions where user_id = ? and token_hash != ?` — the WHERE clause targets the **target's** user_id and keeps the **actor's** current token (P-H). Audit INSERT + logSecurity gated on `del.changes > 0` (D-117). No scoping inversion, no wrong-user delete. Backed by 7 AUD-02 unit tests (real SQLite) and `e2e/admin-revoke-cycle.spec.mjs` (EN+FR: member dies with `err.signedOutElsewhere`, admin survives, peer-admin `adminOnly` toast). The revocation mechanics are NOT the bug.

### E2 — The only surface where the admin could SEE revoke activity is operator-gated client-side
Settings → sessions tab (src/pages/settings.js:532-551) shows:
- `S.ui.sessions` = the **current user's own** sessions only (SESS-01, GET /api/auth/sessions — by design since phase 14).
- `operatorCard() + auditTrailCard()` appended **only when `api.user?.isInstanceAdmin`** (settings.js:551).

`isInstanceAdmin` is the instance-operator DB flag (server.js:463, D-112) — a workspace admin (non-operator) never has it. So for a workspace admin, the sessions tab renders exactly one thing: its own session list. **"The admin only sees its session" is literally what the UI shows.**

### E3 — The client gate contradicts both D-T3 and the actual server behavior
- D-T3 (24-CONTEXT): "workspace admins see only rows for their own workspace (admin-tier rows)" — the audit trail IS meant to be visible to workspace admins, tier-scoped.
- The server honors D-T3 (server.js:2394-2403): `/api/audit-log` serves workspace admins their own-workspace rows and only 403s plain members.
- But `refreshAuditLog()` (src/actions/actions.js:1999) bails: `if (!api.enabled || !api.user?.isInstanceAdmin) return null;` and the card is mounted behind the same flag. The comment at actions.js:1985 asserts "Workspace admins get 403 here" — **factually wrong for the shipped server**: only plain members get 403. 24-03-PLAN flagged the deferral ("a workspace-admin variant of the section is not required by D-V1 — the endpoint already serves admins if later surfaced") but D-T3 already required the admin view.

### E4 — The UAT flow makes the gap visible exactly as reported
The admin revokes a member from the members page (button appears — members.js:55 gates on `isAdmin && m.userId`, works). Success toast fires, member's browser dies. But the admin has **no surface** that reflects the action: the members page shows no session/audit state, and the Settings sessions tab shows only the admin's own sessions with no audit trail card. The user then looked for verification, saw "only its session", and could not exercise tests 6-8 (peer-admin refusal toast copy, trail-row survival, end-to-end audit rows) because the trail was invisible to the admin tier.

## Hypotheses considered

| # | Hypothesis | Verdict |
|---|-----------|---------|
| H1 | WHERE-clause inversion — revoke killed the admin's own session instead of the member's | Rejected — E1: DELETE targets `target.id`, keep-current excludes the actor's token; e2e proves member dies / admin survives |
| H2 | Query scoping bug — sessions/audit listed by wrong user id or workspace filter | Rejected — the sessions tab is own-sessions-only by design (SESS-01); the audit endpoint scopes correctly per D-T3 (E3) |
| H3 | UI shows one session per user by design; user expected all member sessions listed | Partially — the sessions tab IS own-sessions-only by design, but the intended admin-visible surface (the D-T3 audit trail) is missing, which is why the expectation could not be met |
| H4 | Frontend gate hides the audit trail card from workspace admins, contradicting D-T3 and the server | **Accepted (root cause)** — E2/E3/E4 |

## Root Cause

Frontend/backend visibility mismatch: the audit trail card is gated client-side on `api.user?.isInstanceAdmin` (settings.js:551 mount, actions.js:1999 fetch gate) so a workspace admin — the tier that can now revoke — has NO surface showing its own revoke actions or any member session state; the Settings sessions tab lists only the current user's own sessions. The server deliberately serves workspace admins their own-workspace audit rows (server.js:2394-2403, per D-T3) and `refreshAuditLog`'s comment wrongly claims admins get 403. Result: after a successful admin revoke, "the admin only sees its session", and tests 6-8 are unverifiable through the UI. The revoke itself works — this is a defect in the admin-tier read surface, not in revocation. (Design note: the sessions tab listing only your own sessions is intended per SESS-01/D-V1-as-owner-card; the missing piece is the D-T3 admin-tier trail view, which 24-03 deferred but the phase's UAT truth requires.)

## Files involved

- `src/pages/settings.js:551` — `api.user?.isInstanceAdmin ? operatorCard() + auditTrailCard() : ''` hides the trail from workspace admins.
- `src/actions/actions.js:1998-2002` — `refreshAuditLog()` bails for non-instance-admins; comment at 1985 misstates server behavior (admins are served, not 403'd).
- `server.js:2373-2421` — `/api/audit-log` correctly serves admins their workspace rows (no defect); `server.js:2763-2800` admin revoke route (no defect).

## Suggested fix direction (non-binding)

1. Relax the two client gates to match D-T3 and the server: mount/refresh the audit trail card when the user is an instance admin **or** holds an admin-or-owner membership (the same condition the server enforces). Minimal variant: attempt `refreshAuditLog()` unconditionally on the sessions-tab mount hook — a plain member's 403 already leaves `S.ui.auditTrail = null`, which is the honest absence the card's null-guard handles (settings.js:131-132).
2. Correct the stale comment at actions.js:1985 (admins get rows, not 403) and the null-state rationale.
3. No server change needed. Tests 6-8 should then be exercisable: the admin's own revoke rows (with workspace_id) appear in the trail; peer-admin refusal and audit-row checks follow.

Gap-closure targets: relax gates (1), fix comment (2), re-run UAT tests 5-8.
