# Milestone v3.0 Requirements: Access Control & Hardening

**Started:** 2026-11-19
**Status:** Planning
**Research:** `.planning/research/SUMMARY.md` (HIGH confidence, committed df064787)
**Seed:** SEED-261119-f3w (owner-validated door matrix — design decisions not re-litigated here)

## Requirements

### Domain Admission (DOM)

Instance-level email-domain admission rules via two env vars, per the owner-validated
SEED-261119-f3w door matrix. Zero new dependencies; one shared canonicalizing validator in
server.js (funnel-shaped, mirroring `validateGuestInviteShape`).

- [ ] **DOM-01**: Owner can restrict account creation to specific email domains via
  `ALLOW_SIGNUP_DOMAINS` (comma-separated env var; unset = all domains allowed — fail-open)
- [ ] **DOM-02**: Owner can restrict invite creation via `ALLOW_INVITE_DOMAINS`; unset
  inherits `ALLOW_SIGNUP_DOMAINS`, explicitly set it stands alone (may be wider)
- [ ] **DOM-03**: An invited user from a domain in the invite list only can accept the
  invite, create their account and log in — even if that domain is not in the signup list
  (one door, one rule; invite-accept never consults the signup list)
- [ ] **DOM-04**: Pending invites are re-validated fail-closed at accept time against
  `ALLOW_INVITE_DOMAINS`; tightening a list refuses pending outside invites with a keyed,
  localized refusal (all 5 catalogues)
- [ ] **DOM-05**: Existing accounts are immune: list changes never block logins, re-invites
  of existing out-of-list members, or repeat SSO logins of already-linked identities
- [ ] **DOM-06**: OIDC JIT account creation honors `ALLOW_SIGNUP_DOMAINS` (fresh-provision
  branch only, after the `email_verified` gate) so SSO cannot bypass the rule
- [ ] **DOM-07**: Domain matching is exact and canonicalized — case-insensitive, trailing
  dot stripped, NFKC-normalized email parsing, exact `Set` membership (never `endsWith` —
  verified bypass vector); no implicit subdomain wildcards; boot logs the resolved door matrix

### Maintenance (MAINT)

- [ ] **MAINT-01**: `npx eslint .` exits clean — 15 unused-var/useless-assignment sites
  fixed in code, 2 `no-undef` files (webhook-formats.js, webhook-ssrf.js) added to the
  eslint.config.js Node-globals block, zero `eslint-disable` comments
- [ ] **MAINT-02**: nl/de/es catalogues verified in the real app — the refusal-path
  rendering checked per locale (placeholder parity, incl. new DOM refusal keys), not just
  navigation labels
- [ ] **MAINT-03**: WR-01/WR-02/IN-01..05 advisory carryovers from the 73/74 reviews
  dispositioned — fixed or explicitly waived with recorded reasons

## Future Requirements

- `*.domain` wildcard support in the allowlists (explicitly deferred — exact matching
  only; revisit if ever needed)
- Refusal audit verb (admin-visible log of refused invites/signups) — exceeds competitor
  practice; optional P3
- IDNA/punycode conversion pipeline — document punycode canonical form in DEPLOY.md
  instead of building conversion

## Out of Scope

- Offline caching, manifest shortcuts, share_target (carried in ROADMAP backlog)
- Any new runtime dependency (standing constraint)
- Email-change flow gating (no email-change flow exists in gr8r; absence pinned by
  contract test instead)

## Traceability

Filled by roadmap creation (2026-11-19):

| Requirement | Phase | Status |
|-------------|-------|--------|
| DOM-01 | Phase 75 | Pending |
| DOM-02 | Phase 75 | Pending |
| DOM-03 | Phase 75 | Pending |
| DOM-04 | Phase 75 | Pending |
| DOM-05 | Phase 76 | Pending |
| DOM-06 | Phase 76 | Pending |
| DOM-07 | Phase 75 | Pending |
| MAINT-01 | Phase 77 | Pending |
| MAINT-02 | Phase 77 | Pending |
| MAINT-03 | Phase 77 | Pending |

Coverage: 10/10 v1 requirements mapped — no orphans, no duplicates.
