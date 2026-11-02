# Phase 31: Second TOTP Factor - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-01
**Phase:** 31-Second TOTP Factor
**Areas discussed:** Factor list & naming UI, First-factor migration, Replay guard & verification, Removal semantics

---

## Factor list & naming UI

| Option | Description | Selected |
|--------|-------------|----------|
| Extend existing card | Existing 2FA card gains factor list (name + last-used) + "Add factor" re-launching the staged wizard | ✓ |
| New sub-section/tab | Separate "Sign-in methods" sub-tab under security | |
| Modal-only management | Card stays; factors managed only in a modal | |

**User's choice:** Extend existing card

| Option | Description | Selected |
|--------|-------------|----------|
| Required label | Enroll wizard gains a required label step before QR | ✓ |
| Optional, auto-named fallback | Optional label; unnamed factors auto-numbered | |
| Auto-numbered only | No free-text labels | |

**User's choice:** Required label

| Option | Description | Selected |
|--------|-------------|----------|
| No rename | Names fixed at enrollment; no rename route or edit UI | ✓ |
| Inline rename, no step-up | Label-only rename action per factor | |
| Rename with step-up | Rename gated behind password step-up | |

**User's choice:** No rename

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse staged wizard | Password step-up, then live code from existing factor, before QR/secret of the new factor | ✓ |
| Combined single form | Password + existing code on one form before QR step | |
| Code only, no password | Skip password since session is active | |

**User's choice:** Reuse staged wizard

| Option | Description | Selected |
|--------|-------------|----------|
| Relative time | "2 hours ago" under each factor name, refreshed on tab load | ✓ |
| Absolute timestamp | Formatted date-time | |
| Hidden | Store server-side only, don't display | |

**User's choice:** Relative time

---

## First-factor migration

| Option | Description | Selected |
|--------|-------------|----------|
| Migrate into table | Boot migration copies users.two_fa_secret into a totp_factors row; users column kept in schema, unread | ✓ |
| Keep legacy, table for new | First factor stays on users; every verify site branches forever | |
| Migrate + clear column | Migrate and clear users.two_fa_secret to '' | |

**User's choice:** Migrate into table

| Option | Description | Selected |
|--------|-------------|----------|
| Catalogue label | Fixed EN+FR catalogue string, e.g. "Primary authenticator" | ✓ |
| Literal "Primary" | Literal English string stored in DB, not localized | |
| Auto "Authenticator 1" | Auto-name (conflicts with no-rename decision) | |

**User's choice:** Catalogue label

| Option | Description | Selected |
|--------|-------------|----------|
| Keep, unread | Columns stay in schema; nothing reads secret/last_step after migration; two_fa_enabled stays the switch | ✓ |
| Drop columns | Violates additive-only discipline pinned by migration test | |
| Keep as fallback | Fallback read path if table empty — second source of truth | |

**User's choice:** Keep, unread

| Option | Description | Selected |
|--------|-------------|----------|
| Carry into row | Migrated row's initial last_step = current users.two_fa_last_step | ✓ |
| Reset to 0 | Brief replay window regression | |
| Dual regime | users.last_step kept for migrated factor; two regimes forever | |

**User's choice:** Carry into row

---

## Replay guard & verification

| Option | Description | Selected |
|--------|-------------|----------|
| Shared helper | One helper loads all factors, tries each with its own replay guard; all call sites route through it | ✓ |
| Inline per call site | Each site inlines its own loop — drift risk | |

**User's choice:** Shared helper

| Option | Description | Selected |
|--------|-------------|----------|
| First match, fail once | Short-circuit on match; unmatched code = one failed attempt vs existing counter | ✓ |
| Ordered by recency | Most-recently-used factor tried first | |
| Exhaustive scan | All factors tried even after a match | |

**User's choice:** First match, fail once

| Option | Description | Selected |
|--------|-------------|----------|
| Skip, others work | Undecryptable factor fails closed for itself only; others verify | ✓ |
| Abort whole loop | Any undecryptable factor bricks all 2FA logins | |
| No special handling | Rely on boot gates only | |

**User's choice:** Skip, others work

| Option | Description | Selected |
|--------|-------------|----------|
| Extend pending map | Per-factor key in existing in-memory pending map; row inserts on enable with last_step = matched step | ✓ |
| Pending table | New durable pending table + TTL sweep | |
| Unverified row | Insert row immediately with verified=0 flag | |

**User's choice:** Extend pending map

| Option | Description | Selected |
|--------|-------------|----------|
| Untouched | Recovery codes verify outside the factor loop; TOTP never satisfies recovery | ✓ |
| Cross-accept | Factor codes accepted in recovery route — blurs D-59/D-72 boundary | |

**User's choice:** Untouched

---

## Removal semantics

| Option | Description | Selected |
|--------|-------------|----------|
| From a remaining factor | Live code from a factor that is NOT the one being removed | ✓ |
| Any factor's code | Including the removed one — weaker | |
| Password only | No TOTP code — deviates from TOTP2-02 | |

**User's choice:** From a remaining factor

| Option | Description | Selected |
|--------|-------------|----------|
| Any remaining, no picker | User types a code; server verifies against all remaining factors | ✓ |
| Explicit factor picker | User picks which factor they're proving | |

**User's choice:** Any remaining, no picker

| Option | Description | Selected |
|--------|-------------|----------|
| Rotate on last only | Recovery codes rotate on last-factor removal and new-first-factor enrollment; single removal leaves them | ✓ |
| Rotate every removal | More defensive churn | |
| Never rotate | Manual regeneration only | |

**User's choice:** Rotate on last only

| Option | Description | Selected |
|--------|-------------|----------|
| Delegate to disable tx | Last-factor removal runs the existing disable-2FA transaction verbatim | ✓ |
| Reimplemented inline | Same outcome, second code path | |
| Block, use Disable 2FA | Factors list refuses last removal; existing button used | |

**User's choice:** Delegate to disable tx

| Option | Description | Selected |
|--------|-------------|----------|
| Confirm modal | Factor name + password + live code from remaining factor; same pattern as disable confirmation | ✓ |
| Inline popover | Two-click removal with code entry in a popover | |
| Type-to-confirm | Type factor name + password + code | |

**User's choice:** Confirm modal

---

## the agent's Discretion

- Exact `totp_factors` schema shape (columns, indexes, timestamps) and API route naming
- Catalogue key wording for the migrated "Primary" label (EN+FR strings)
- Helper naming/signature, last_used_at update timing, per-factor test pins
- Migration failure semantics detail for undecryptable rows during the copy step

## Deferred Ideas

None — discussion stayed within phase scope.
