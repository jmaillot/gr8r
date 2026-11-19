---
phase: 76-oidc-sso-doors-immunity-hardening
plan: 01
subsystem: auth
tags: [oidc, sso, domain-admission, door-matrix, jit-provisioning, node-test]

requires:
  - phase: 75-domain-admission-core
    provides: boot-frozen SIGNUP_DOMAINS/INVITE_DOMAINS tri-state consts, the emailDomainRefusal funnel in domains.js, the DP-1..DP-3 doors and D-06 boot log
provides:
  - DP-4 — OIDC JIT provisioning gated by ALLOW_SIGNUP_DOMAINS (fresh-provision arm only, after the email_verified gate; generic /login?sso=error refusal surface, domain-only refusal log)
  - DP-5 — SSO-07 reconciliation silently filters refused invites before the branching (verbatim DP-3 row-email semantics, non-consuming, revivable)
  - D-11 — one combined five-door matrix boot log line; D-06 per-var lines untouched
  - test/helpers/oidc-idp.mjs — the extracted shared fake-IdP harness
  - test/domain-admission-sso.test.mjs — the D-12 contract suite (DP-4/DP-5/D-11 sections; immunity rows land in 76-02)
affects: [76-02 (immunity rows extend this suite), phase 77, DEPLOY docs]

actuals:
  tokens: 8700
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "DP-4/DP-5 compose the ONE emailDomainRefusal funnel — no inline Set.has bypass lane (T-75-16)"
    - "Filter-before-branching with a non-consuming refusal (DP-5 mirrors DP-3 verbatim)"
    - "Shared fake-IdP test helper (test/helpers/oidc-idp.mjs) reused by suites driving the real authorize→callback flow"

key-files:
  created:
    - test/helpers/oidc-idp.mjs
    - test/domain-admission-sso.test.mjs
  modified:
    - server.js
    - test/oidc-sso.test.mjs

key-decisions:
  - "DP-4 refusal log interpolates the domain into the message string (logInfo is single-argument; the plan's structured payload shape was silently dropped) — D-11 discretion granted this style"
  - "DP-5 literal 'one in-list one refused' partial-filter row is unobservable (pendingInvites is keyed by the row's email — same email ⇒ same refusal verdict); adapted to a two-in-list-invites '/#invitations' row"
  - "Open Q1 confirmed: no DP-2 change — SC3 re-validation lives at accept/reconcile time only"
  - "Open Q2 resolved: fake IdP extracted to test/helpers/oidc-idp.mjs — imports-only swap, oidc-sso suite stays 47/47"
  - "Open Q3 confirmed: GET /api/workspaces/:slug/invites is un-gated — no read-side carve-out needed for D-10"

patterns-established:
  - "oidcEnv() factory: every new suite row must pass OIDC_ISSUER_OVERRIDE: idp.issuer or the server boots against real Entra"
  - "Door-gate comment discipline: DP-N (Phase, DOM-x), branch-only placement, funnel composition, refusal-surface rationale"

requirements-completed: [DOM-06]  # DOM-05 is shared with plan 76-02 (immunity rows) — marked by 76-02's SUMMARY per the shared-ID gate

coverage:
  - id: D1
    description: "DP-4: out-of-list SSO email refused at JIT after email_verified — exact /login?sso=error redirect, no session, no users/oidc_identities rows, domain-only refusal log (SC1, DOM-06, D-09)"
    requirement: DOM-06
    verification:
      - kind: integration
        ref: "test/domain-admission-sso.test.mjs#DP-4: an out-of-list SSO email is refused after email_verified — generic redirect, no session, no rows (SC1)"
        status: pass
    human_judgment: false
  - id: D2
    description: "DP-4 admitted paths: in-list provisions normally, wildcard '*' allow-all, unset stays fail-open, and an existing verified-email account still LINKS with the list tightened (Pitfall-1 placement guard)"
    requirement: DOM-06
    verification:
      - kind: integration
        ref: "test/domain-admission-sso.test.mjs#DP-4: an in-list SSO email provisions normally — user + identity rows, lands on /"
        status: pass
      - kind: integration
        ref: "test/domain-admission-sso.test.mjs#DP-4: ALLOW_SIGNUP_DOMAINS='*' provisions every domain"
        status: pass
      - kind: integration
        ref: "test/domain-admission-sso.test.mjs#DP-4: unset ALLOW_SIGNUP_DOMAINS stays byte-identical fail-open"
        status: pass
      - kind: integration
        ref: "test/domain-admission-sso.test.mjs#DP-4 placement guard: an EXISTING user with a verified email still LINKS with the list tightened"
        status: pass
    human_judgment: false
  - id: D3
    description: "DP-5: refused invite silently filtered before the SSO-07 branching — normal login to /, used_at IS NULL, loosening revives the invite, in-list reconcile unchanged, multi-invite branching consumes only the filtered array (DOM-05/SC3, D-10)"
    requirement: DOM-05
    verification:
      - kind: integration
        ref: "test/domain-admission-sso.test.mjs#DP-5: a refused invite is silently filtered — normal login to /, invite NOT consumed (D-10, Pitfall 2)"
        status: pass
      - kind: integration
        ref: "test/domain-admission-sso.test.mjs#DP-5: loosening the list revives the refused invite — the next SSO login auto-accepts it"
        status: pass
      - kind: integration
        ref: "test/domain-admission-sso.test.mjs#DP-5: an in-list invite reconciles exactly as before — single invite auto-accepts"
        status: pass
      - kind: integration
        ref: "test/domain-admission-sso.test.mjs#DP-5: two in-list invites across two workspaces survive the filter and drive the /#invitations branching — none consumed"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-11: one combined five-door matrix boot log line with the structural door→list mapping; both D-06 per-var lines byte-identical (SC4)"
    requirement: DOM-06
    verification:
      - kind: integration
        ref: "test/domain-admission-sso.test.mjs#D-11: boot logs ONE combined line carrying all five door labels (SC4 — no reader assembly)"
        status: pass
      - kind: integration
        ref: "test/domain-admission-sso.test.mjs#D-11: the own-lists matrix shows each door riding its structural list"
        status: pass
      - kind: integration
        ref: "test/domain-admission-sso.test.mjs#D-11: the two Phase 75 D-06 per-var lines remain byte-identical in shape with their source tags (SC4)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Fake IdP extraction to test/helpers/oidc-idp.mjs with zero behavioral drift in the 929-line oidc-sso suite"
    verification:
      - kind: integration
        ref: "node --test test/oidc-sso.test.mjs — 47 pass / 0 fail post-extraction"
        status: pass
    human_judgment: false

# Metrics
duration: 12 min
completed: 2026-11-19
status: complete
---

# Phase 76 Plan 01: OIDC/SSO Doors Summary

**DP-4 signup-domain gate on OIDC JIT provisioning, DP-5 silent refused-invite filtering in SSO-07 reconciliation, and the D-11 combined five-door boot-matrix log — pinned by 15 rows of the new D-12 contract suite over the real authorize→callback flow.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-11-19T17:14:20Z
- **Completed:** 2026-11-19T17:26:39Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- DP-4 gate live end-to-end: an out-of-list SSO email is refused AFTER the email_verified gate in the fresh-provision arm only — generic `/login?sso=error` redirect (no domain-revealing param), no session, no users/oidc_identities rows, domain-only refusal log (D-09/V7 PII ban)
- DP-5: SSO-07 reconciliation filters refused invites (row email vs boot-frozen INVITE_DOMAINS, verbatim DP-3 semantics) before the branching — silent, non-consuming, revivable by loosening the list (D-10)
- D-11: one combined `domains: door matrix — signup | invite-create | invite-accept | sso-jit | sso-reconcile` boot line reusing `domainListLog`; both Phase 75 D-06 lines byte-identical (SC4)
- Fake IdP extracted to `test/helpers/oidc-idp.mjs`; `test/oidc-sso.test.mjs` swapped to the import (47/47 still green)
- Full suite green: 1856 tests, 1843 pass, 0 fail, 13 pre-existing env skips

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end DP-4 (tracer)** — `4edca91d` (feat)
2. **Task 2: DP-5 silent invite filtering** — `04c578fa` (feat)
3. **Task 3: D-11 combined door-matrix boot log** — `3fefd070` (feat)

## Files Created/Modified
- `server.js` — emailFromEmail import; DP-4 gate in the OIDC callback fresh-provision arm; DP-5 filter on the pendingInvites fetch; D-11 combined matrix line after the D-06 lines
- `test/helpers/oidc-idp.mjs` — NEW: shared fake-OIDC-IdP harness (RSA/JWKS/discovery/token endpoint with per-flow tokenConfig)
- `test/oidc-sso.test.mjs` — imports-only swap to the extracted helper
- `test/domain-admission-sso.test.mjs` — NEW: D-12 contract suite, 15 rows (5 DP-4 + 4 DP-5 + 6 D-11)

## Decisions Made
- DP-4 refusal log: `logInfo(\`sso signup domain refused — domain: ${emailFromEmail(email)}\`)` — logInfo is single-argument, so the plan's `{ domain }` payload would have been silently dropped; the interpolated form is the surrounding code's style (discretion D-11 explicitly grants)
- Open Q1: no DP-2 change (accept/reconcile-time re-validation only, per seed SEED-261119-f3w items 3/5)
- Open Q2: extraction over duplication — imports-only swap proved drift-free (oidc-sso 47/47)
- Open Q3: `GET /api/workspaces/:slug/invites` confirmed un-gated; D-10's "invite still visible" holds with no read-side carve-out

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] logInfo structured payload silently dropped**
- **Found during:** Task 1 (SC1 refusal-log assertion)
- **Issue:** `logInfo = msg => logLine('info', msg)` accepts ONE argument — the plan's `logInfo('sso signup domain refused', { domain })` logged the message without the domain
- **Fix:** interpolated the domain into the message: `logInfo(\`sso signup domain refused — domain: ${emailFromEmail(email)}\`)` — message prefix kept verbatim, D-09 PII ban preserved
- **Files modified:** server.js
- **Verification:** SC1 row asserts the line carries `b.com` and never `outsider` — pass
- **Committed in:** 4edca91d

**2. [Rule 1 - Plan defect] DP-5 "partial filter" row unobservable**
- **Found during:** Task 2 (suite design)
- **Issue:** the plan's row "two pending invites, one in-list one refused" is impossible: the pendingInvites fetch is keyed by the row's email, so every fetched invite shares one email and one refusal verdict
- **Fix:** replaced with "two in-list invites across two workspaces survive the filter and drive the `/#invitations` branching, none consumed" — proving the >1 branching consumes ONLY the filtered array; the single-refusal/non-consumption behavior is covered by the refused-only row
- **Files modified:** test/domain-admission-sso.test.mjs
- **Verification:** row passes (302 `/#invitations`, 2 unconsumed rows)
- **Committed in:** 04c578fa

**3. [Rule 3 - Blocking] Suite env missing OIDC_ISSUER_OVERRIDE**
- **Found during:** Task 1 (all five rows failing on first run)
- **Issue:** the new suite's oidcEnv lacked `OIDC_ISSUER_OVERRIDE: idp.issuer`, so servers booted against real Entra and every callback failed closed
- **Fix:** `oidcEnv()` factory including the override
- **Files modified:** test/domain-admission-sso.test.mjs
- **Verification:** all rows pass
- **Committed in:** 4edca91d

**4. [Rule 1 - Test] workspace-create response shape**
- **Found during:** Task 2 (multi-invite row)
- **Issue:** `POST /api/workspaces` answers `{ workspace: { … } }`, not a bare `{ slug }` — the invite POST hit `undefined` and 404'd
- **Fix:** read `second.data.workspace?.slug`
- **Files modified:** test/domain-admission-sso.test.mjs
- **Verification:** row passes
- **Committed in:** 04c578fa

---

**Total deviations:** 4 auto-fixed (3 test-harness, 1 production log shape)
**Impact on plan:** All fixes required for the suite to run at all or for the D-09 log contract to be observable. No scope creep; no locale edits; no new dependencies.

## Issues Encountered
None beyond the deviations above.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Plan 76-02 can extend test/domain-admission-sso.test.mjs with the three named immunity rows (suite skeleton, harness and helpers all in place)
- DOM-06 fully pinned; DOM-05's DP-5 half pinned here, its immunity rows land in 76-02 (shared requirement not yet marked complete by design)
- No blockers

---
*Phase: 76-oidc-sso-doors-immunity-hardening*
*Completed: 2026-11-19*
