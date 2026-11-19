# Phase 76: OIDC/SSO Doors & Immunity Hardening - Context

**Gathered:** 2026-11-19
**Status:** Ready for planning

<domain>
## Phase Boundary

The SSO surface honors the same door matrix as Phase 75: OIDC JIT provisioning is
gated by `ALLOW_SIGNUP_DOMAINS` (DP-4, fresh-provision branch only, after the
`email_verified` gate), SSO invite reconciliation filters refused invites (DP-5,
verbatim DP-3 semantics), existing accounts are provably immune to list changes,
and the operator can read the resolved door matrix from the boot log.
Requirements DOM-05, DOM-06. New capabilities (wildcards, refusal audit verb,
IDNA conversion) are out of scope.

</domain>

<decisions>
## Implementation Decisions

Design context: the door matrix, inheritance rule, immunity and exact matching are
OWNER-VALIDATED in SEED-261119-f3w. DP-4/DP-5 integration points, gate order and
refusal shapes are line-verified in `.planning/research/ARCHITECTURE.md` — do not
re-derive them. Decisions below are the Phase 76 gray areas settled in this discussion.

### SSO refusal audit logging
- **D-09:** JIT-provision domain refusal is logged with a plain
  `logInfo('sso signup domain refused', { domain })` — **domain only, never the
  full email address** (PII in logs), **no new security verb** for a single call
  site, no catalogue key. Matches the grep-able boot-log style of D-06. The
  client surface stays the generic `sso=error` redirect per research DP-4.

### DP-5 refused-invite UX
- **D-10:** Refused invites are **silently filtered** out of `pendingInvites`
  before the existing branching — a user whose ONLY pending invite is refused
  gets a normal login and can still see the pending invite under `/#invitations`.
  No special-case redirect, no refusal message (the user is signed in; refusal
  is policy, not failure). Consume nothing; loosening the list revives the invite.

### Boot door-matrix log
- **D-11:** Boot logs **one combined matrix line** listing each door
  (signup / invite-create / invite-accept / sso-jit / sso-reconcile) with its
  resolved list and source (own / inherit / deny-all / off). SC4's promise —
  "read from the log exactly which doors admit which domains" — verbatim, no
  assembly by the reader. The Phase 75 D-06 per-var lines remain unchanged.

### Contract test shape
- **D-12:** **One table-driven node:test file** pinning all five decision points
  and the inherit matrix (both directions), with the **three existing-account
  immunity rows as explicit named rows**. Permanent suite, single place to read
  the whole contract. No per-door split; no e2e OIDC pass in this phase.

### the agent's Discretion
- Exact log-line field names/format for the D-11 matrix line (grep-able, structured)
- Test file naming and placement following existing node:test conventions
- Whether `logInfo` carries the structured payload object or an interpolated string
  (match whichever pattern the surrounding OIDC code uses)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Seed & design
- `.planning/seeds/SEED-261119-f3w-domain-admission-rules.md` — owner-validated door
  matrix, inheritance rule, immunity, exact-matching rulings (the design source of truth)
- `.planning/REQUIREMENTS.md` — DOM-05/DOM-06 requirement definitions

### Research (milestone-level, line-verified)
- `.planning/research/ARCHITECTURE.md` — DP-4 (OIDC JIT ~:5110–5135, generic
  `sso=error` redirect doctrine) and DP-5 (SSO-07 reconciliation ~:5155, filter-before-
  branching) sections; validation-order table; immunity-by-construction argument
- `.planning/research/PITFALLS.md` — immunity regression risk, TOCTOU tightening
- `.planning/research/SUMMARY.md` — executive synthesis

### Prior phase (the code being extended)
- `.planning/phases/75-domain-admission-core/75-CONTEXT.md` — D-01/D-02 tri-state
  resolver, D-06 boot log, D-07 accept-refusal semantics DP-5 must mirror verbatim
- `.planning/phases/75-domain-admission-core/75-01-SUMMARY.md` and
  `75-02-SUMMARY.md` — what actually landed in Wave 1/Wave 2

### Roadmap phase contract
- `.planning/ROADMAP.md` §Phase 76 — goal, 5 success criteria (behavioral contract)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 75 resolver + canonicalizing validator (boot consts `SIGNUP_DOMAINS` /
  `INVITE_DOMAINS`, exact `Set` membership) — DP-4/DP-5 consume them as-is
- OIDC callback (server.js:5033, JIT branch ~:5110–5135) — the `email_verified`
  gate and `createUser` fresh-provision branch the domain check slots into
- Already-linked-identity doctrine (comment :5085–5096) — repeat logins skip claim
  re-checks; the immunity path needs no new code, only pinned tests
- SSO-07 reconciliation block (~:5155) — pendingInvites branching that DP-5 filters
  ahead of; `errorRedirect()` generic-surface helper
- `logInfo` / structured boot-log patterns from Phase 75 (D-05/D-06)

### Established Patterns
- Keyed localized refusals, 5-locale parity in same commit (not needed for DP-4/DP-5
  — both surfaces are generic/silent per decisions above)
- Table-driven node:test contract suites (Phase 75 adversarial email matrix)
- Boot-time env parse, fail-absent gates, no request-time env re-parsing

### Integration Points
- DP-4: domain check is the LAST gate before `createUser` in the JIT branch, after
  `email_verified`; refusal → `logInfo` (D-09) → generic `errorRedirect` to
  `/login?sso=error` — no query params beyond the existing generic ones
- DP-5: filter `pendingInvites` by the invite ROW's stored email against
  `INVITE_DOMAINS` before the `pendingInvites.length` branching; consume nothing
- Existing-account immunity: no code change — membership short-circuit precedes all
  predicates; pinned by the three named test rows (re-login of linked identity,
  re-invite of out-of-list member, repeat SSO login of linked identity)

</code_context>

<specifics>
## Specific Ideas

- SC1 pin: out-of-list JIT email → refused AFTER the `email_verified` gate, fresh-
  provision branch only, generic `sso=error` redirect, no session minted, no
  domain-revealing param
- SC2 pin: tightening lists mid-life never blocks an already-linked SSO identity's
  repeat logins (admission ≠ authentication)
- SC3 pin: re-inviting an existing out-of-list member succeeds (membership
  short-circuit first); SSO reconciliation filters the refused invite before branching
- Immunity rows are named, not incidental — a reader of the test file must be able
  to point at the three rows that prove DOM-05

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 76-OIDC/SSO Doors & Immunity Hardening*
*Context gathered: 2026-11-19*
