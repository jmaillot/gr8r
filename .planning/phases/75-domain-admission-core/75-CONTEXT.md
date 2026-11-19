# Phase 75: Domain Admission Core - Context

**Gathered:** 2026-11-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Instance operators can restrict who enters through signup and invitations by email
domain — via `ALLOW_SIGNUP_DOMAINS` and `ALLOW_INVITE_DOMAINS` env vars, one shared
canonicalizing validator, exact-domain matching, and localized keyed refusals — covering
three doors: self-serve signup, invite create, and fail-closed invite-accept.
OIDC/SSO doors, immunity contract tests and the boot door-matrix log are Phase 76.

</domain>

<decisions>
## Implementation Decisions

Design context: the door matrix, unset-inherits-signup, fail-closed accept-time
re-validation, existing-account immunity, and exact `Set` matching are OWNER-VALIDATED in
SEED-261119-f3w — not re-litigated here. Decisions below are the Phase 75 gray areas
settled in this discussion.

### Set-but-empty semantics (tri-state resolution)
- **D-01:** `ALLOW_INVITE_DOMAINS=''` (explicitly set but empty) = **deny-all** for
  invites — not inherit. Makes "shut the invite door entirely" a deliberate, reversible
  switch; inherits the research recommendation. — **Reversibility:** reversible — pure
  resolver semantics, one function, unit-test matrix covers it.
- **D-02:** Same ruling for `ALLOW_SIGNUP_DOMAINS=''` = **deny-all for signup**.
  Symmetric tri-state across both vars: null (unset) = off/inherit, empty Set =
  deny-all, populated Set = allowlist. — **Reversibility:** reversible — same resolver.

### Invite-refusal UX
- **D-03:** Multi-email invites are refused **per-email inline**: refused emails get
  their own keyed error next to the field; valid emails proceed. Mirrors the existing
  `emailOk` per-email loop at server.js:~7745.
- **D-04:** The refusal message is **generic** — "the email is outside the domains
  allowed for invites" — and never reveals the allowed-domain list (no oracle for
  probing the admission policy).

### Boot validation posture
- **D-05:** Malformed entries are **warn-and-clean**, not fail-fast: lowercase, trim,
  drop empty/whitespace entries with a boot warning, dedupe. A typo in one entry must
  not take down the instance.
- **D-06:** Boot logs **one structured summary line per var**: name, resolved domains,
  source (own / inherit / deny-all / off). Grep-able, matching the OIDC env-gate boot
  log pattern. (The full door-matrix log is Phase 76 SC4.)

### Accept-refusal UX
- **D-07:** A pending invitee hitting a tightened list sees a **generic, keyed refusal**
  ("this invite can no longer be accepted" family) — no domain details; the refusal is
  **non-consuming** (the invite row is not destroyed; loosening the list revives it).
- **D-08:** The inviter is **not notified** when a pending invite is refused at accept —
  keeps the accept route simple; no new email/mention surface (also beyond competitor
  practice per research).

### the agent's Discretion
- Exact catalogue wording for the new refusal keys (EN first, translated in same commit)
- Internal shape of the validator/resolver functions (pure, funnel-shaped, unit-testable)
- Whether `process.env` is read live or boot-frozen at the door call-sites (research:
  live-read recommended for testability — planner's call)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Seed & design
- `.planning/seeds/SEED-261119-f3w-domain-admission-rules.md` — owner-validated door
  matrix, inheritance rule, immunity, exact-matching rulings (the design source of truth)
- `.planning/REQUIREMENTS.md` — DOM-01..07 requirement definitions for this phase

### Research (milestone-level)
- `.planning/research/SUMMARY.md` — executive synthesis; phase structure rationale
- `.planning/research/ARCHITECTURE.md` — line-verified integration points (signup :6703,
  invite create :7626/:7745, accept :7852, OIDC JIT ~:5120, SSO reconciliation ~:5155),
  gate-order matrix, DP-1..DP-5 chains
- `.planning/research/PITFALLS.md` — homoglyph-@ parsing bypass (GHSA-7rqj-j65f-68wh),
  tri-state config traps, TOCTOU tightening, immunity regression risk
- `.planning/research/STACK.md` — stdlib idioms, endsWith-bypass proof, env-parse trap

### Roadmap phase contract
- `.planning/ROADMAP.md` §Phase 75 — goal, 5 success criteria (behavioral contract)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `emailOk` (server.js:671) — email shape validation; the domain validator composes
  after it, per-email in the invite-create loop
- `validateGuestInviteShape` (server.js:4708) — the funnel-shaped `{code,message}`
  validator contract the new domain validator should mirror
- `fail()` keyed-refusal flow — refusal rendering path for the new `domainNotAllowed`-
  family keys
- `ALLOW_SIGNUP` const pattern (server.js:~135) — boot-time env parse posture

### Established Patterns
- Keyed localized refusals (`inviteGuestToggleOff` precedent, Phase 50) — new keys land
  in all 5 catalogues (en/fr/nl/de/es) in the same commit as the first emitting gate
  (parity gate enforced)
- Fail-absent env gates (DB_URL, OIDC) — unset = feature absent, no behavior change
- Table-driven contract tests (node:test) — adversarial email matrix is a natural fit

### Integration Points
- Signup route (server.js:~6703): after structural checks, before `createUser`
- Invite create (server.js:~7626, emailOk loop ~:7745): per-email, before `db.tx`
- Invite accept (server.js:~7852): fail-closed re-derive after the `allowInviteGuests`
  block, before any write, validating the invite ROW's email
- No invite-edit route exists — "invite edit" from the seed maps to create-route
  replace-a-live-link semantics (DP-2); no route invented

</code_context>

<specifics>
## Specific Ideas

- Canonical scenario to pin as acceptance test: `ALLOW_INVITE_DOMAINS=gmail.com` with
  gmail NOT in signup list → an invited gmail user can accept, create account, log in;
  the same email can never self-register (DOM-03 / SC3)
- Suffix-attack pin: `evil-example.com` must NOT pass `example.com` exact membership
  (`endsWith` bypass verified by research on Node 24)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 75-Domain Admission Core*
*Context gathered: 2026-11-19*
