# Phase 33: Membership-Surface Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-02
**Phase:** 33-membership-surface-hardening
**Areas discussed:** Admin link-only invite mechanism, SSO twin failure semantics, Body whitelist strictness, Proxy-header unification

---

## Guard ordering (HARD-01) — not discussed, settled

Presented as already settled by the Pitfall-22 house pattern; user did not flag it. Captured as D-08 in CONTEXT.md.

---

## Admin link-only invite mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Reject at creation + accept | 400 at creation when role is admin/owner AND email is null; accept route also refuses admin from an email-less invite. Both test-pinned. | ✓ |
| Creation only | Single enforcement point at creation; accept trusts the row. | |
| Accept only | Creation unchanged; accept drops the admin role. Weakest. | |

**User's choice:** Reject at creation + accept (defense in depth)

| Option | Description | Selected |
|--------|-------------|----------|
| Sweep at boot | Boot-time sweep marks existing admin link-only invites used_at = now. No schema change. | ✓ |
| Neutralize at accept only | Leave old rows; accept-side refusal makes them harmless. | |
| Migration | Additive migration deleting/annotating them — reserved for Phase 34's burden. | |

**User's choice:** Sweep at boot
**Notes:** Defense in depth was the deciding factor; migrations stay reserved for Phase 34.

---

## SSO twin failure semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Consume + generic error | Resolve explicitly; missing workspace ⇒ consume the invite (used_at = now) and continue login through the generic error landing. | ✓ |
| Skip, leave pending | No writes on the failure path; invite stays pending. | |
| Abort login | Abort the whole SSO login with ssoError — punishes login for a dead invite. | |

**User's choice:** Consume + generic error

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse generic ssoError | Phase-30 one-generic-surface decision holds; no new code. | ✓ |
| New error code | Distinct code (e.g. inviteWorkspaceGone) — leaks more state. | |

**User's choice:** Reuse generic ssoError
**Notes:** The current silent skip (`if (ws)` at server.js:2843) is the misleading silence the audit flagged.

---

## Body whitelist strictness

| Option | Description | Selected |
|--------|-------------|----------|
| Silent whitelist | Destructure {name, email, password}, discard the rest; spoof test pins smuggled keys have no effect. | ✓ |
| Reject unknown fields | 400 unexpectedField — strictest, but breaks future client fields and is a schema probe. | |

**User's choice:** Silent whitelist
**Notes:** Spoof-test key enumeration (role/teams/scope, name-on-session-accept) left to planner discretion.

---

## Proxy-header unification

| Option | Description | Selected |
|--------|-------------|----------|
| Shared helper | `firstForwardedValue(header)` consumed by proto(), clientIp(), sameOrigin(). | ✓ |
| Inline fix only | Add .split(',')[0].trim() at the sameOrigin call site; discipline stays copy-pasted. | |

**User's choice:** Shared helper
**Notes:** The HARD-05 mismatch is real — sameOrigin() reads x-forwarded-host raw today.

---

## the agent's Discretion

- Helper naming/signature; test file placement; boot-sweep placement and log wording; exact smuggled keys the spoof test enumerates.

## Deferred Ideas

None — discussion stayed within phase scope.
