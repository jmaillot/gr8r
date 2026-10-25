# Phase 8: Per-user locale & the honest selector - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-23
**Phase:** 8-per-user-locale-the-honest-selector
**Areas discussed:** Legacy preference migration, Boot timing & unauthenticated surfaces, Selector UX & save model, Demo mode & failure handling

---

## Legacy preference migration

| Option | Description | Selected |
|--------|-------------|----------|
| Seed on first boot (client) | Client checks legacy `prefs.lang` after hydrating; PATCHes `/api/auth/me` once when `users.locale` is NULL | ✓ |
| Seed server-side at boot | Server writes `users.locale` for members at boot — violates the LOC-05 no-op guarantee | |
| Clean slate (no seeding) | Everyone starts NULL → English until they re-choose | |

| Option | Description | Selected |
|--------|-------------|----------|
| Seed every member | Each member seeds their own account on their first boot — per-boot semantics | ✓ |
| Seed per boot (same thing) | Logically identical, phrased differently | |
| Seed only the last setter | Not reconstructable from the stored document | |

| Option | Description | Selected |
|--------|-------------|----------|
| Apply in the same boot | Seed PATCH then `setLocale()` in the same session — no English flash on upgrade | ✓ |
| Apply from next boot | Write only; first upgraded session renders English | |

| Option | Description | Selected |
|--------|-------------|----------|
| NULL + legacy only | Fires only when account locale is NULL and legacy label maps to a valid code | ✓ |
| Always re-seed on boot | Would overwrite explicit choices; contradicts LOC-03 | |
| NULL + any legacy label | Behaviourally identical to NULL+legacy-only (English labels are no-ops) | |

**User's choice:** Seed on first boot (client), every member, same-boot application, guard NULL + legacy only.
**Notes:** Phase 7 made French reachable through the stored label; dropping it silently would downgrade those users to English.

## Boot timing & unauthenticated surfaces

| Option | Description | Selected |
|--------|-------------|----------|
| Auth pages: English | Unauthenticated pages hardcoded to English; matches deferred LANG-02 | |
| Negotiate from browser | Client-side `navigator.language` negotiation for login/signup/join | ✓ |
| Cache in localStorage | Last-used locale cached per browser — leaks the previous user's language | |

| Option | Description | Selected |
|--------|-------------|----------|
| Top of init() | Negotiated locale applied synchronously before any network call or render; account locale replaces it before first render | ✓ |
| After api.me() | Conditional timing; login render happens right after api.me() returns | |
| Inside applyPrefs() | Every-render fallback; risks one frame of negotiated language for signed-in users | |

| Option | Description | Selected |
|--------|-------------|----------|
| Fall back to negotiated | Sign-out reverts to the browser-negotiated value | ✓ |
| Keep the account's last locale | Would require caching the locale outside the account | |
| Always English after sign-out | Inconsistent with first-visit negotiation | |

| Option | Description | Selected |
|--------|-------------|----------|
| Prefix match, clamp to en | `fr*` → fr, `en*` → en, anything else → en; mirrors setLocale's unknown-code rule | ✓ |
| Exact match only | `fr-CA` would render English — awkward for regional settings | |
| Full BCP-47 lookup | Overkill for two locales | |

| Option | Description | Selected |
|--------|-------------|----------|
| Keep negotiated | NULL account + no legacy → the browser's language applies until an explicit choice | ✓ |
| Force English when NULL | Simplest contract, but a French-browser signup would switch to English | |
| NULL until first choice | Behaviourally identical to "keep negotiated" for the pre-choice window | |

**User's choice:** Browser negotiation for unauthenticated surfaces; top-of-init application; sign-out falls back to negotiated; prefix-match clamp; NULL account keeps negotiated.
**Notes:** The user deliberately chose negotiation over the recommended English default — recorded as a scope addition in CONTEXT.md D-08. Distinct from the deferred server-side `Accept-Language` (LANG-02) email negotiation.

## Selector UX & save model

| Option | Description | Selected |
|--------|-------------|----------|
| Instant apply + PATCH | setLocale + re-render immediately; background `PATCH /api/auth/me`; never part of the document save flow | ✓ |
| Apply now, save with form | Locale persisted only on the next general save — choice could be lost | |
| Explicit save flow | Violates LOC-01 (immediate switch) | |

| Option | Description | Selected |
|--------|-------------|----------|
| Same row, two names | Stays in Settings → Appearance; labels 'English' and 'Français'; other four labels vanish | ✓ |
| Own section | Signalled account property via relocation — extra plumbing for one control | |
| Global switcher | New surface area, out of phase scope | |

| Option | Description | Selected |
|--------|-------------|----------|
| Show negotiated value | NULL account displays the negotiated language as selected; no way back to NULL | ✓ |
| 'Browser default' option | Adds a NULL round-trip to the API | |
| 'Not set' placeholder | Less honest about what the user is seeing | |

**User's choice:** Instant apply + background PATCH; same row with two labels; show negotiated when NULL, no return to NULL.

## Demo mode & failure handling

| Option | Description | Selected |
|--------|-------------|----------|
| Works, stored locally | Demo keeps a working selector persisting to localStorage; only the backend differs | ✓ |
| Disabled with tip | Honest but makes the milestone's headline feature dead in the demo | |
| Hidden entirely | Follows the existing demo-mode hiding policy, but hides the feature being shipped | |

| Option | Description | Selected |
|--------|-------------|----------|
| Keep + warn toast | Interface stays in the new language for the session; toast warns; next boot applies the old locale; 401 routes to login | ✓ |
| Revert immediately | Jarring — the switch visibly worked before failing | |
| Queue and retry | New machinery; not scoped | |

**User's choice:** Demo works with localStorage persistence; PATCH failure keeps the session language with a warn toast.

---

## the agent's Discretion

- Placement of the seed function and the negotiation helper (main.js vs store.js vs i18n.js).
- Exact test file naming/structure — one contract per file, per the established pattern.

## Deferred Ideas

- LANG-02 invitation-email negotiation (server-side `Accept-Language`) — unchanged, out of scope.
- LANG-01 the four other languages — future milestone.
- WS-01 remaining shared per-user fields — its own migration.
- FMT-02 timezone as an IANA zone.
- A "reset to browser default" selector option — rejected this phase (D-14), revisit only if requested.
