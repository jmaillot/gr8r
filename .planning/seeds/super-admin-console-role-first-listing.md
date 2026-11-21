---
title: Super Admin console — role-first listing with promote-search
created: 2026-11-21
source: user (FR, session 2026-11-21)
area: governance
type: feature
---

# Super Admin console — role-first listing with promote-search

## Request (paraphrased from the user, FR)

> Dans Instance > Governance > Super Admin Console : je ne veux lister ici que
> les personnes disposant de ce rôle par défaut, avec la recherche servant à
> ajouter d'autres Super Admins sélectionnables.

## Current behavior (verified in code, 2026-11-21)

- `GET /api/auth/operator/users` (server.js ~7052) returns **all users**
  (`select id, name, email, is_instance_admin, last_login_at from users order by created_at`).
- `operatorCard()` (src/pages/governance.js ~130) renders the full list; the
  search input (`S.ui.govOpQ`) is a **client-side filter** over it.
- Every non-admin row shows both **Make Super Admin** and **Revoke sessions**
  actions inline.

## Desired behavior

1. **Default list:** only users with `is_instance_admin = true` (the
   Super-Admin roster), with their existing inline actions (demote
   inline-confirm, revoke sessions, immunity notes — all D-118/D-119 semantics
   unchanged).
2. **Search:** typing searches **all users**; non-admin matches render as
   selectable candidates whose action is "Make Super Admin" (promote).
   Non-matching / empty state keeps the keyed `noMatchesOpBody` copy.

## Design notes / constraints (from v3.2 standing rules)

- Server ground truth: the operator gate (D-112) and the 5-field payload
  (D-121) are unchanged — this is a presentation + query-shape change.
  Option A: keep one endpoint, add `?role=admin` (or a `filter` param);
  Option B: client splits the existing full payload into roster vs candidates
  (no API change, still small-instance scale). Prefer whichever keeps the
  read route throttle-free and the payload stable.
- The revoke-sessions action belongs to roster rows AND promoted candidates
  are promote-only — do not offer revoke on a non-admin row (sessions revoke
  stays tied to admin-visible rows as today).
- i18n: any new copy (e.g. "candidates" hint) lands in the same commit as the
  emitting markup, keyed in all 5 locales (D-12 same-commit pins; the en
  catalogue size pin in i18n-core-features bumps with it).
- Tests: governance-client source pins + operator-revoke-cycle e2e assert
  the current full-list rendering — both need updating with the change.

## Routing

Feature work — next milestone, `/gsd-new-milestone` intake or a quick task if
the owner wants it fast-tracked. NOT milestone v3.2 scope (v3.2 is closing).
