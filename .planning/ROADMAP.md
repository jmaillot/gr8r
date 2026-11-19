# Roadmap: Projects Studio (gr8r)

## Milestones

- ✅ **v2.7 Installable App (PWA)** - Phases 72-74 (shipped 2026-11-19)
- 🚧 **v3.0 Access Control & Hardening** - Phases 75-77 (in progress — planning)

## v3.0 — Access Control & Hardening

**Milestone Goal:** instance-level email-domain admission rules per the owner-validated
SEED-261119-f3w door matrix (`ALLOW_SIGNUP_DOMAINS` + `ALLOW_INVITE_DOMAINS`), plus the
accumulated maintenance debt (lint, nl/de/es locale spot-check, 73/74 review carryovers).

**Standing constraints & decisions (not re-litigated):** zero new dependencies; exact-domain
Set matching (never `endsWith`); tri-state env parse (null = unset/inherit vs empty Set =
deny-all — set-but-empty semantics ratified at Phase 75 planning); fail-closed accept-time
re-validation; existing-account immunity; every refusal key lands in all 5 locale catalogues
(en/fr/nl/de/es) in the same commit as the first emitting gate.

**Seed reconciliation:** there is NO invite-edit route in the codebase (verified by research).
The seed's "invite edit" decision point maps to the create route's replace-a-live-link
semantics (re-minting = invite create = DP-2). No route is invented; covered by Phase 75.

## Phases

**Phase Numbering:**
- Integer phases (75, 76, 77): planned milestone work (continuous numbering from v2.7's Phase 74)
- Decimal phases (75.1, …): urgent insertions (marked INSERTED)

- [x] **Phase 75: Domain Admission Core** - Shared canonicalizing validator + signup, invite-create and fail-closed invite-accept doors with 5-locale keyed refusals ✅ COMPLETE (2026-11-19 — UAT passed, verification passed) (completed 2026-11-19)
- [x] **Phase 76: OIDC/SSO Doors & Immunity Hardening** - JIT SSO gate, SSO invite reconciliation, existing-account immunity contract tests, boot door-matrix log
- [ ] **Phase 77: Maintenance Debt** - Lint cleanup, nl/de/es refusal-path locale spot-check, WR/IN carryover dispositions

## Phase Details

### Phase 75: Domain Admission Core

**Goal**: Instance operators can restrict who enters through signup and invitations by email
domain — with one shared canonicalizing validator, exact-domain matching, and localized
refusals — before any SSO surface exists.
**Depends on**: Nothing (first phase of v3.0; foundation for Phase 76)
**Requirements**: DOM-01, DOM-02, DOM-03, DOM-04, DOM-07
**Success Criteria** (what must be TRUE):
  1. With `ALLOW_SIGNUP_DOMAINS=a.com`, a visitor whose email is outside `a.com` is refused
     at signup with a keyed, localized refusal rendered in their locale; an `a.com` visitor
     creates an account and logs in normally. With the var unset, signup behaves exactly as
     before (fail-open, no behavior change).
  2. An admin inviting an out-of-list email under `ALLOW_INVITE_DOMAINS` gets an immediate
     keyed refusal at invite create (per-email), and unset `ALLOW_INVITE_DOMAINS` inherits
     `ALLOW_SIGNUP_DOMAINS` — while an explicitly set invite list stands alone (may be wider
     than the signup list).
  3. A user invited from a domain only in the invite list accepts the invite, creates their
     account and logs in — the accept path never consults the signup list (one door, one rule).
  4. After tightening `ALLOW_INVITE_DOMAINS`, a pending invite minted under the old list is
     refused at accept time (fail-closed, row-based email, refusal does not consume the
     invite), with the refusal message localized in all 5 catalogues.
  5. Domain matching is exact and canonicalized: `User@A.COM.`, NFKC/homoglyph-＠ inputs and
     trailing dots canonicalize correctly, `evil-a.com`-style suffix attacks are refused by
     exact `Set` membership (never `endsWith`), subdomains are NOT implicitly admitted, and
     adversarial parsing cases are pinned by a table-driven unit suite (tri-state env matrix:
     unset / `''` / whitespace / `'a,,b'` / `' a , B '`).
**Plans**: 2/2 plans complete

Plans:
**Wave 1**
- [x] 75-01-PLAN.md — Tri-state resolver + canonicalizing funnel + DP-1 signup door tracer, adversarial DOM-07 suite, D-05/D-06 boot logs, 5-locale signup key, DEPLOY.md docs

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 75-02-PLAN.md — DP-2 per-email invite gate, MCP invite_member fourth door, DP-3 fail-closed accept re-derive (non-consuming), gmail one-door-one-rule + tighten/loosen matrix, cross-door invariants

**Set-but-empty semantics (flagged for phase decision):** research recommends explicit-set =
deny-all (empty Set) vs unset = inherit/off. The tri-state boot resolver supports it; the
planner ratifies with the owner before wiring DP-2/DP-3.

### Phase 76: OIDC/SSO Doors & Immunity Hardening

**Goal**: The SSO surface honors the same door matrix — JIT provisioning is gated, SSO invite
reconciliation filters refused invites — and existing accounts are provably immune to list
changes, with operators able to see the resolved matrix at boot.
**Depends on**: Phase 75 (accept-route semantics DP-3 must be settled; DP-5 mirrors it verbatim)
**Requirements**: DOM-05, DOM-06
**Success Criteria** (what must be TRUE):
  1. An out-of-list email completing OIDC login is refused JIT account creation (fresh-provision
     branch only, after the `email_verified` gate) and lands on the generic `sso=error` login
     redirect — no domain-revealing query param, no session minted; in-list SSO emails provision
     normally.
  2. An already-linked SSO identity logs in repeatedly without ever consulting the domain lists
     (admission ≠ authentication) — tightening the lists never locks out an existing member.
  3. Re-inviting an existing member whose email is outside the current lists succeeds (membership
     short-circuit precedes the predicate); an SSO login reconciling a pending invite whose email
     is now out-of-list filters the invite before the existing branching, verbatim DP-3 semantics.
  4. Server boot logs the resolved door matrix (both vars, inherit resolution, deny-all states)
     so an operator can read from the log exactly which doors admit which domains.
  5. Full-matrix contract tests cover both inherit directions and all five decision points —
     including the three existing-account immunity rows — as a permanent suite.
**Plans:** 2/2 plans complete

Plans:
**Wave 1**
- [x] 76-01-PLAN.md — DP-4 JIT gate + DP-5 reconcile filter + D-11 door-matrix boot log, pinned by the core D-12 contract suite rows (Wave 1)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 76-02-PLAN.md — three named immunity rows (DOM-05) + DEPLOY.md operator docs (Wave 2) — truth #1 amended to Option B (accept-time re-validation applies to ALL admits)

### Phase 77: Maintenance Debt

**Goal**: The repo's standing gates are honestly clean — lint exits 0 with no suppressions,
nl/de/es render real refusal paths (including the new DOM keys) in the actual app, and every
carried review advisory has a recorded disposition.
**Depends on**: Phase 75 (the new DOM refusal keys give the locale spot-check a real refusal
path to verify; lint fixes are otherwise independent and may run in parallel)
**Requirements**: MAINT-01, MAINT-02, MAINT-03
**Success Criteria** (what must be TRUE):
  1. `npx eslint .` exits 0: the 15 unused-var/useless-assignment sites fixed in code (one
     commit per site — side-effectful initializers make autofix unsafe), the 2 `no-undef` files
     (webhook-formats.js, webhook-ssrf.js) added to the eslint.config.js Node-globals block,
     and zero `eslint-disable` comments introduced.
  2. Switching the real app to nl, de and es renders correctly on refusal paths — the new DOM
     refusal toasts included — with placeholder parity per locale (verified via Playwright
     `selectLanguage` + per-locale evidence, not just navigation labels).
  3. WR-01, WR-02 and IN-01..05 from the 73/74 reviews each carry a recorded disposition in the
     phase artifacts — fixed (with regression pin) or explicitly waived with a reason.
  4. Full suite green after every lint-fix commit: no lint "cleanup" silently deletes a
     side-effectful initializer (typescript-eslint #3456 hazard).
**Plans**: 3 plans

Plans:
**Wave 1**
- [x] 77-01-PLAN.md — Lint cleanup: 15 unused-var/useless-assignment sites (file-grouped commits per D-77-1), no-undef pair via eslint.config.js (D-77-3), delete-outright with side-effect restructures (D-77-2), full suite per commit-group (D-77-18)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 77-02-PLAN.md — Advisory fixes with regression pins: WR-01/WR-02, 73-IN-01..05, 74-IN-01/02 (all FIX per D-77-8..16), carryover ledger 77-REVIEW-DISPOSITION.md

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] 77-03-PLAN.md — Locale refusal e2e ×3 (nl/de/es signup DP-1, catalogue-imported full-string equality per D-77-4..7 + owner reconciliations), run-wide ALLOW_SIGNUP_DOMAINS=e2e.local with Wave-0 dry run

## Progress

**Execution Order:**
Phases execute in numeric order: 75 → 76 → 77
(Phase 77's lint track is parallelizable with 76 once 75 lands.)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 75. Domain Admission Core | 2/2 | Complete    | 2026-11-19 |
| 76. OIDC/SSO Doors & Immunity Hardening | 2/2 | Complete    | 2026-11-19 |
| 77. Maintenance Debt | 2/3 | In progress | - |
