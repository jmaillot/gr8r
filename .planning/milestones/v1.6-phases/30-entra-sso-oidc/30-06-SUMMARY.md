---
phase: 30-entra-sso-oidc
plan: 06
subsystem: auth-sso
tags: [oidc, sso, gap-closure, security]
requires: ["30-01", "30-02", "30-03", "30-04", "30-05"]
provides: ["strict verified-email SSO identity resolution (email_verified claim, fail closed)", "G-30-1 closed"]
affects: []
tech-stack:
  added: []
  patterns: ["claim-based policy replacing heuristic policy (A2 superseded), fail-closed gate before any account write"]
key-files:
  created: []
  modified:
    - server.js
    - test/oidc-sso.test.mjs
    - DEPLOY.md
decisions:
  - "A2 policy SUPERSEDED (operator decision, G-30-1): 'verified email' is the literal email_verified === true IdP claim — pinned-tenant member vouching no longer substitutes for it. This corrects STATE.md's accumulated SSO-03 decision on read-through."
  - "Gate split reconciling plan wording with must_haves truth 2: LINKING requires canLink && verifiedEmail; JIT-provisioning (guest or member, fresh email) requires verifiedEmail only — guests with a verified email still get separate bare accounts, unverified tokens get nothing"
  - "Already-linked (issuer, subject) identity rows resolve without re-checking the claim — fail closed applies to linking/provisioning, not to established identities (repeat logins unbroken)"
metrics:
  duration: ~14 min
  completed: 2026-11-02
  tasks: 2
  commits: 2
status: complete
plan_head_before: 30df45da265a370f69b962ac99bb678d0798651a
plan_head_after: d176696
actuals:
  tokens: 26000
  tasks: 2
  commits: 2
---

# Phase 30 Plan 06: Strict Verified-Email SSO Policy (G-30-1 Gap Closure) Summary

**One-liner:** Replaced the A2 tenant-vouching approximation with the literal `email_verified === true` claim — SSO linking, JIT provisioning and invite reconciliation now all fail closed to `/login?sso=error` for unverified-email tokens, pinned by 3 new negative tests and documented for operators.

## What Was Built

### Task 1 — Strict verified-email gate (TDD RED → GREEN, one commit 6a910eb)
- **RED**: mock IdP no longer defaults `email_verified` into the payload — the omission is now the explicit failure mode; every positive fixture supplies `email_verified: true`. Added the strict-policy negative matrix: pinned-tenant non-guest token with `email_verified: false` → error, claim absent → error, guest-shaped fresh-email token without the claim → NO JIT account (previously got a separate bare account). Confirmed exactly those 3 negatives fail against un-gated server.js (43/46 green — RED is policy-specific, not collateral).
- **GREEN (server.js)**: `verifiedEmail = claims.email_verified === true` folded into the resolution gate — linking an existing account requires `canLink && verifiedEmail`; JIT `createUser` requires `verifiedEmail`; the gate runs BEFORE any users/oidc_identities write. Invite reconciliation (SSO-07) flows through the same row resolution, so it inherits the gate. Already-linked identities still resolve (repeat logins/idempotency preserved). Identity-resolution comment block rewritten: A2 marked superseded by operator decision.
- Throttle-aware fixture isolation: the new negatives run on fresh matrix servers (fresh throttle map + fresh DB) so the shared server stays at its original 9 start-flow budget.

### Task 2 — Operator documentation (commit d176696)
- **DEPLOY.md**: new "Linking policy — verified email required" paragraph before the smoke-test checklist (the old tenant-vouching behavior is not described), plus an operator note: Entra sets `email_verified` for tenant-member accounts with a verified mail attribute — check tenant-side email verification before debugging app config when a real sign-in fails with the SSO error.

## Verification Performed

- `node --test test/oidc-sso.test.mjs` → **46 pass, 0 fail** (was 43 before this plan; +3 negatives)
- `npm test` → **803 tests, 799 pass, 0 new failures, 3 skipped** (pre-existing placeholder rows in test/scope.test.mjs, unchanged by this plan)
- `grep -n "email_verified" server.js` shows the claim consulted in the callback gate
- `grep -c "email_verified" DEPLOY.md` → 2
- Threat T-30-17 mitigated: unverified-email tokens can no longer link, JIT-provision, or reconcile an invitation — all fail closed with no account writes. T-30-SC: zero new runtime dependencies.

## Deviations from Plan

None within task scope. Two recorded notes:
1. **Plan-wording reconciliation (no code deviation):** the Task 1 action text says "every path requires `canLink && verifiedEmail`", but must_haves truth 2 requires guests/fresh emails with `email_verified: true` to keep getting bare accounts. Implemented the gate split above (linking = both; JIT = verifiedEmail). Both truths hold; the stricter behavior bullet ("guest fresh email + unverified → NO JIT") is enforced and tested.
2. **Pre-existing failure (out of scope, logged to deferred-items.md):** `test/dependencies.test.mjs` D-12 row fails — the Dockerfile runtime stage copies `oidc.js` (added in commit 59ce617 because server.js imports it) but the test's five-COPY allow-list was never extended. Unrelated to G-30-1; untouched per the scope boundary rule.

## Auth Gates

None.

## Known Stubs

None.

## Threat Flags

None — no new surface; the change only narrows an existing trust-boundary decision.

## Superseded Policy Note (for STATE.md read-through)

STATE.md's accumulated SSO-03 decision ("verified email = pinned-tenant member vouching", planner assumption A2) is **superseded by this plan per the operator's UAT rejection**: verified email is now the `email_verified: true` claim, fail closed.

## Commits

- 6a910eb: fix(30-6): gate SSO identity resolution on claims.email_verified === true (G-30-1, fail closed)
- d176696: docs(30-6): document the verified-email linking policy and operator diagnostic (G-30-1)

## Self-Check: PASSED

All created/modified files exist on disk; both task commits (6a910eb, d176696) are present in git history.
