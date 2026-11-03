---
phase: "33"
slug: "membership-surface-hardening"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-03"
---

# Phase 33 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| browser → accept route | Untrusted cross-origin POSTs and hostile multi-value `x-forwarded-*` headers cross into the invite-accept path | Origin/Host headers, session cookie |
| client body → route handler | Untrusted JSON body fields could smuggle role/teams/scope into the accept handler | JSON body (name/email/password) |
| admin client → invite-creation route | Untrusted role/emails combination could mint a privilege-escalating link-only invite | role, emails array |
| SSO IdP callback → reconcile twin | A dead workspace row could route a user into another tenant via the fallback | invite row, workspace_id |
| stored DB rows → boot | Legacy rows minted before hardening carry live escalation potential | invites table (email-null admin/owner rows) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-33-01 | Tampering | POST /api/invites/:token/accept | high | mitigate | sameOrigin guard inserted FIRST, before throttle/body read (`server.js:4415`, Pitfall-22 order) | closed |
| T-33-02 | Spoofing | sameOrigin() x-forwarded-host read | medium | mitigate | shared `firstForwardedValue()` helper (:2429) — multi-value headers collapse to first value; consumed by proto()/clientIp()/sameOrigin() | closed |
| T-33-03 | Tampering | accept route body handling | high | mitigate | D-06 structural silent `{name,email,password}` whitelist (:4451); role/teams/scope come only from the invite row | closed |
| T-33-04 | Elevation of Privilege | invite-creation route (insert) | high | mitigate | 400 `inviteAdminEmailRequired` for admin/owner + link-only emails BEFORE insert (:4306), HARD-02a pin | closed |
| T-33-05 | Elevation of Privilege | accept route membership grant | high | mitigate | accept-side 403 refusal of email-less admin/owner invite rows BEFORE grant (:4428), HARD-02b pin | closed |
| T-33-06 | Elevation of Privilege | stored legacy invite rows | high | mitigate | boot-time update-only sweep marking link-only admin/owner rows used (:4984), HARD-02c pin | closed |
| T-33-07 | Elevation of Privilege | accept + SSO twins firstWorkspace() fallback | critical | mitigate | explicit workspace_id resolution, no fallback: accept 410 `workspaceGone` (:4468), SSO twin fail-closed consume + generic `/login?sso=error` (:2852+) — both in one commit (D-05), HARD-03a/b pins | closed |
| T-33-SC | Tampering | npm/pip/cargo installs | high | mitigate | no package installs this phase — zero-dependency invariant untouched | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|

No accepted risks.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-03 | 8 | 8 | 0 | gsd-secure-phase (L1 grep verification, register authored at plan time) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
