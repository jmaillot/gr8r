# Phase 22: Operator Session Revocation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-29
**Phase:** 22-Operator Session Revocation
**Areas discussed:** Operator identity gate, Route & throttle shape, Operator UI surface, Edge semantics & e2e scope

---

## Operator identity gate

| Option | Description | Selected |
|--------|-------------|----------|
| Flag column (Recommended) | Additive `is_instance_admin` column on users, set at bootstrap. Durable, queryable, survives email changes. | ✓ |
| ADMIN_EMAIL-derived | Operator = account matching ADMIN_EMAIL. Zero schema change, but env dependency per request and email-change breakage. | |
| First-user stamp | Operator = first account ever created, hard-stamped. Invisible in data, hard to transfer. | |

**User's choice:** Flag column
**Notes:** Follow-up: flag set via bootstrap + one-time boot stamp for pre-v1.4 databases (stamps ADMIN_EMAIL account if none flagged). No transfer mechanism this phase — manual DB update documented, same escape-hatch spirit as key-custody deferral.

## Route & throttle shape

| Option | Description | Selected |
|--------|-------------|----------|
| POST /api/auth/operator/... (Recommended) | POST /api/auth/operator/users/:userId/revoke-sessions; auth-family namespace and guard order. | ✓ |
| DELETE collection style | DELETE /api/auth/operator/users/:userId/sessions — verb choice only. | |
| Body-param action route | Generic POST /api/auth/operator/revoke with userId in body. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror D-11 band (Recommended) | operator-revoke|${user.id}, 5/15min, every attempt consumes a try. | ✓ |
| Looser operator budget | 20/15min for sequential multi-user revokes. | |
| No throttle | Trusted-identity shortcut. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Counts + logSecurity (Recommended) | 200 { revoked, remaining }, no-store, logSecurity(target.id, 'sessions_revoked_by_operator'). | ✓ |
| Silent 204 | No counts. | |
| Audit trail entry | Explicitly deferred in REQUIREMENTS.md — scope creep. | |

**User's choice:** All recommendations.

## Operator UI surface

| Option | Description | Selected |
|--------|-------------|----------|
| Settings operator card (Recommended) | Operator-only settings card with inline confirmation (D-90 pattern). | ✓ |
| Members row action | Workspace-scoped — contradicts instance-wide reach. | |
| Email-input only | Minimal but mistargetable. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Operator users list route (Recommended) | GET /api/auth/operator/users (id, name, email, is_instance_admin, last_login_at). | ✓ |
| Workspace-scoped reuse | Fragmented UX. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Hidden in UI + hard 403 (Recommended) | Owner rows show disabled action + hint; route still refuses ownerImmune. | ✓ |
| Server-error only | Knowingly failing action in UI. | |

**User's choice:** All recommendations.

## Edge semantics & e2e scope

| Option | Description | Selected |
|--------|-------------|----------|
| Revoke-others on self (Recommended) | Self-target allowed; D-105/P-H shape. | ✓ |
| Refuse self-target | 409; contradicts success criterion 2 spirit. | |

| Option | Description | Selected |
|--------|-------------|----------|
| 403 ownerImmune (Recommended) | Checked before session lookup; consumes a throttle try. | ✓ |
| 404 opaque | Enumeration resistance, less honest. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Lifecycle e2e + server matrix (Recommended) | D-109/D-110 split: server privilege matrix + Chromium lifecycle e2e EN+FR. | ✓ |
| Everything in e2e | Heavier, flakier. | |

**User's choice:** All recommendations.

## the agent's Discretion

- Privilege-matrix failure error code vs generic forbidden; i18n key names; card layout details within settings patterns; test file placement; route comment wording.

## Deferred Ideas

- Operator transfer route (reassign `is_instance_admin` via UI) — its own phase (D-114).
- Revoke-all-users, audit trail, workspace-admin tier — already in REQUIREMENTS.md deferred list.
