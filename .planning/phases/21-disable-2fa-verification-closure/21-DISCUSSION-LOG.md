# Phase 21: Disable-2FA Verification & Closure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-29
**Phase:** 21-Disable-2FA Verification & Closure
**Areas discussed:** Session policy on disable, Pending login-challenge teardown, Recovery-code tightening detail, e2e scope & i18n

---

## Session policy on disable

| Option | Description | Selected |
|--------|-------------|----------|
| Revoke others, keep current | Mirror password-change precedent (server.js:1587) inside the disable transaction | ✓ |
| Revoke all sessions | User signed out everywhere immediately | |
| Keep all sessions | Regen D-98 style, no session touch | |

**User's choice:** Revoke others, keep current
**Notes:** Consistent with every security-sensitive action in gr8r; current browser stays signed in to see the updated card.

## Pending login-challenge teardown

| Option | Description | Selected |
|--------|-------------|----------|
| Delete all rows for user | All login_challenges rows in the same transaction, plus regression test | ✓ |
| Delete only pending (unexpired) | Subtle distinction with no benefit | |
| No teardown (expiry only) | Fails DIS-01's explicit requirement | |

**User's choice:** Delete all rows for user
**Notes:** No pending 2FA challenge is legitimate once 2FA is off.

## Recovery-code tightening detail

| Option | Description | Selected |
|--------|-------------|----------|
| Strict 6-digit-only, branch deleted | Mirror D-85 exactly; delete the D-57 branch entirely | ✓ |
| Reject recovery shape explicitly | Keep branch but return dedicated error | |

**User's choice:** Strict 6-digit-only, branch deleted
**Notes:** Locked by DIS-02; the no-recovery-lookup property is the load-bearing invariant.

## e2e scope & i18n

| Option | Description | Selected |
|--------|-------------|----------|
| Full-cycle spec + regression & session | Full disable→re-enroll cycle in EN+FR, plus recovery-code regression and session-policy assertion | ✓ |
| Happy path e2e, rest server tests | Lighter, weaker contract coverage | |
| Exhaustive error-state e2e | Every error state rendered in browser | |

**User's choice:** Full-cycle spec + regression & session
**Notes:** Error states covered at server-test level (D-110), not in-browser.

## the agent's Discretion

- Test file placement/naming, FR/EN copy for touched strings, route comment wording, logSecurity call placement detail.

## Deferred Ideas

None — discussion stayed within phase scope.
