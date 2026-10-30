# Phase 20: Recovery-Code Regeneration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-28
**Phase:** 20-Recovery-Code Regeneration
**Areas discussed:** Step-up strictness, UI entry & flow, Route & throttle shape, Codes & side effects

---

## Step-up strictness

| Option | Description | Selected |
|--------|-------------|----------|
| Strict 6-digit only | Reject any non-6-digit input with 400 codeRejected before any recovery_codes lookup — no lookup exists in the route at all | ✓ |
| Dual-shape + reject | Normalize/hash any input, look it up, then reject if found — weaker, the lookup could be misordered by future edits | |
| You decide | Constrain only via the REGEN-01 regression test | |

**User's choice:** Strict 6-digit only (recommended)
**Notes:** Follow-ups: factor order password → TOTP (disable-route mirror); successful TOTP verify updates `two_fa_last_step` in the same transaction; single transaction covers verify + burn-and-replace with fresh re-select.

## UI entry & flow

| Option | Description | Selected |
|--------|-------------|----------|
| Inline stage on tfa card | Button next to "Turn off" reveals inline confirmation form (password + 6-digit code) via S.ui.tfaStage | ✓ |
| Confirmation modal | Dedicated modal for the confirmation step | |

**User's choice:** Inline stage on tfa card (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse recovery modal | Existing D-53 one-time modal (transient state, copy-all) — zero new display machinery | ✓ |
| New dedicated display | Distinct modal with "codes were replaced" framing | |

**User's choice:** Reuse recovery modal (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Warn old codes burn | Small warning in the confirm form, new EN+FR i18n keys | ✓ |
| No warning | Action label deemed explicit enough | |

**User's choice:** Warn old codes burn (recommended)

## Route & throttle shape

| Option | Description | Selected |
|--------|-------------|----------|
| tfa-regen\|user.id, 5/15min | Same shape as tfa-enroll / tfa-disable, identity-keyed | ✓ |
| Shared tfa budget | Share one attempt pool with the disable route | |

**User's choice:** tfa-regen\|user.id, 5/15min (recommended)
**Notes:** Follow-ups: a wrong password consumes an attempt (D-41/D-49 precedent); 2FA-disabled callers get 409 tfaNotEnabled before factor checks; guard order mirrors siblings (sameOrigin → requireUser → throttle → readJson).

## Codes & side effects

| Option | Description | Selected |
|--------|-------------|----------|
| 10 codes, same recipe | generateRecoveryCode() ×10, recoveryHash(normalizeRecoveryCode(...)), returned once | ✓ |
| Different count | A different set size — user would specify | |

**User's choice:** 10 codes, same recipe (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Sessions untouched | Only recovery_codes + two_fa_last_step change | ✓ |
| Revoke others too | Treat suspected code exposure as suspected session compromise | |

**User's choice:** Sessions untouched (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, activity verb | Record an activity entry with a new verb on success | ✓ |
| No activity record | Private settings action | |

**User's choice:** Yes, activity verb (recommended)
**Notes:** Ground-truth caveat recorded in CONTEXT.md (D-99): the only activity mechanism today is task/workspace-scoped `logAct`; no auth route records activity. Planner defines the minimal honest mechanism, shared with Phase 21's DIS-01.

| Option | Description | Selected |
|--------|-------------|----------|
| Same shape as enable | `{ ok: true, recoveryCodes: [...] }` + Cache-Control: no-store | ✓ |
| Distinct shape | Separate payload to distinguish the two events | |

**User's choice:** Same shape as enable (recommended)

## the agent's Discretion

Error-copy wording for new 409/400 codes, exact i18n key names, test file placement, and the D-99 activity-mechanism detail.

## Deferred Ideas

None — discussion stayed within phase scope.
