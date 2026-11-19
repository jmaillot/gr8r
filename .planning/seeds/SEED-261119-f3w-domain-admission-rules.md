---
id: SEED-261119-f3w
status: dormant
planted: 2026-11-19
planted_during: post-v2.7 (between milestones)
trigger_when: when the next milestone includes access control, invitations, or OIDC/SSO work
scope: small — one shared validator + 2 env vars + JIT hook + localized refusal keys
---

# SEED-261119-f3w: ALLOW_SIGNUP_DOMAINS + ALLOW_INVITE_DOMAINS — instance-level domain admission rules

## Why This Matters

Owner-validated design (conversation 2026-11-19). Today the only account-creation
boundary is the Entra tenant pin + `email_verified` gate (Phase 30): any user in the
tenant can JIT a bare account, and invites can be sent to any domain. The owner wants
instance-level domain control over **who can create an account** and **who can be
invited**, without breaking the invite-crosses-domains reality (contractors, partners).

## Owner-Validated Decisions (design is settled — go straight to discuss/plan)

1. **Two env variables, one concept, three doors:**

   | Door | Rule checked |
   |---|---|
   | Invite create + invite edit | `ALLOW_INVITE_DOMAINS` |
   | Invite **accept** (re-validated, fail-closed) | `ALLOW_INVITE_DOMAINS` |
   | OIDC JIT (first SSO login, no invite) | `ALLOW_SIGNUP_DOMAINS` |
   | Self-serve signup (`ALLOW_SIGNUP=true`) | `ALLOW_SIGNUP_DOMAINS` |

   - `ALLOW_SIGNUP_DOMAINS` — comma-separated, **default empty = all domains allowed**
     (fail-open; no behavior change for existing installs).
   - `ALLOW_INVITE_DOMAINS` — comma-separated, default empty = all. **Unset inherits
     `ALLOW_SIGNUP_DOMAINS`** (one variable covers the simple "company.com only"
     deployment); set explicitly it stands alone and may be wider than the signup list.
2. **One door, one rule — never both lists.** The invite-accept validation consults
   `ALLOW_INVITE_DOMAINS` only, never the signup list. This makes the canonical owner
   scenario work: gmail.com in ALLOW_INVITE_DOMAINS only → an invited gmail user can
   click the link, create the account, and log in; the same email can NEVER JIT or
   self-register.
3. **Existing accounts are never touched.** Both lists govern *new admissions* only —
   logins, mentions, emails of already-linked/created members are unaffected by list
   changes.
4. **Refusals are keyed + localized** (same shape as `inviteGuestToggleOff`): e.g.
   `inviteDomainNotAllowed` for the inviter. Clear message, never a silent failure.
5. **Fail-closed re-validation at accept time.** If the domain list is tightened after
   an invite was sent, a pending invite outside the new list is refused at accept.
   Tightening the *signup* list never strands a pending invite (door separation).
6. **Exact-domain matching** — no implicit subdomain wildcards. `company.com` does not
   match `mail.company.com`. Explicit `*.company.com` support only if ever needed
   (deny-by-default on surprises).
7. **JIT applies the signup list regardless of `ALLOW_SIGNUP`** — JIT is a form of
   self-subscription, so the domain filter is an additional gate on JIT even in
   invites-only mode (`ALLOW_SIGNUP=false`).

## Implementation Shape

- One shared domain validator (funnel-shaped, like `projectPermFor` / the shared
  Phase 30 `firstWorkspace` twins), consumed by: invite-create route, invite-edit
  route, invite-accept route (Phase 33 hardened route + the SSO-linked invite
  reconciliation path from Phase 30), JIT linking decision point, and the signup path.
- Env parsing alongside the existing OIDC env gates (same no-oracle posture: unset =
  feature absent).
- EN+FR catalogue keys in the same commit (i18n gate), all refusal paths keyed.
- Tests: door matrix (3 doors × in/out lists × inheritance), accept-time tightening,
  existing-member immunity, subdomain non-matching, empty-default fail-open.

## When to Surface

**Trigger:** when the next milestone includes access control, invitations, or OIDC/SSO work.

This seed will surface during `/gsd-new-milestone` when the milestone scope matches.

## Scope Estimate

**Small** — one shared validator + 2 env vars + JIT hook + localized refusal keys + a
door-matrix suite. Fits comfortably as 1–2 plans inside an access-focused milestone,
alongside the related open item: JIT/signup gating interplay with `ALLOW_SIGNUP`.

## Breadcrumbs

- Phase 30 SSO: JIT bare accounts, pinned tenant, `email_verified === true` gate —
  `milestones/v1.6-REQUIREMENTS.md`, `oidc.js`
- Phase 33 invite-accept hardening: sameOrigin-first, silent body whitelist, fail-closed
  twins — the route that accept-time re-validation must ride
- Invite refusal precedent: `inviteGuestToggleOff` keyed refusal (Phase 50)
- Env-gate posture: `DB_URL` / OIDC env gates fail-absent (Phase 45/30 patterns)
- Related backlog: PROJECT.md "Next Milestone Goals" mentions the translations
  spot-check; this seed is the access-control counterpart

## Notes

Captured 2026-11-19 immediately after the owner validated the full door/inheritance
semantics in conversation. Design decisions are OWNER-VALIDATED — do not re-litigate
the two-variable split or the door separation at discuss-phase; only remaining open
questions are wording of refusal copy and whether `*.domain` wildcard support ships
at all (default: no).
