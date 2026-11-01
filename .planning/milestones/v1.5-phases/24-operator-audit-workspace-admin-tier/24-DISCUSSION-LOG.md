# Phase 24 Discussion Log

**Date:** 2026-10-31
**Mode:** default (interactive)
**Areas selected:** Audit storage model, Admin revocation route, Owner trail view, Verb taxonomy & scope (all four)

## Audit storage model

Q1: Extend security_log vs new table?
- Options: New audit table (Recommended) / Extend security_log
- **Selected: New audit table** — security_log keeps its on-delete-cascade user_id, which conflicts with AUD-03.

Q2: How to reference actor/target so rows survive deletion?
- Options: No FKs (Recommended) / FKs with soft-delete rules / FKs + name snapshot columns
- **Selected: No FKs**

Q3: What does the trail show for a deleted user?
- Options: Snapshot at insert (Recommended) / Join + deleted fallback
- **Selected: Snapshot at insert**

Q4: Who gets a name snapshot?
- Options: Both actor & target (Recommended) / Target only
- **Selected: Both actor & target**

Q5: Enforcement of "no route can edit or delete an audit row"?
- Options: In-app + test (Recommended) / In-app + DB triggers
- **Selected: In-app + test**

→ Next area

## Admin revocation route

Q1: Route shape?
- Options: /api/w/:slug/members/:id/revoke-sessions (Recommended) / Flat route + body params
- **Selected: /api/w/:slug route**

Q2: Which targets can a workspace admin revoke?
- Options: Strictly below admin (Recommended) / Admins included
- **Selected: Strictly below admin**

Q3: Same-transaction mechanism?
- Options: BEGIN/COMMIT both routes (Recommended) / New route only
- **Selected: BEGIN/COMMIT both routes**

Q4: IP capture & hardening?
- Options: Mirror operator route (Recommended) / Mirror + stricter throttle
- **Selected: Mirror operator route**

→ Next area

## Owner trail view

Q1: Where does the trail live?
- Options: Settings page section (Recommended) / Dedicated settings tab
- **Selected: Settings page section**

Q2: Filter surface?
- Options: Verb filter only (Recommended) / Verb filter + name search
- **Selected: Verb filter only**

Q3: Volume handling?
- Options: Paged, latest-first (Recommended) / Fixed cap
- **Selected: Paged, latest-first**

Q4: Entry display?
- Options: Full row per entry (Recommended) / Condensed + expandable
- **Selected: Full row per entry**

→ Next area

## Verb taxonomy & scope

Q1: Verb taxonomy?
- Options: Two verbs (Recommended) / One verb + tier column
- **Selected: Two verbs**

Q2: Legacy security_log migration?
- Options: Revocations only, no backfill (Recommended) / Include legacy migration
- **Selected: Revocations only, no backfill**

Q3: Who can read the trail?
- Options: Owners only (Recommended) / Admins see own workspace
- **Selected: Admins see own workspace** — user chose broader read visibility than recommended.

Q4 (follow-up from Q3): What do workspace admins see of operator-level rows?
- Options: Tiered visibility (Recommended) / Admins see operator rows too
- **Selected: Tiered visibility** — admins see only their own workspace's admin-tier rows; operator rows are operator-only.

## Deferred ideas
None.

## Agent discretion items
- Throttle limits (lean: mirror operator), i18n strings (EN+FR gates), error copy,
  zero-row-delete semantics (D-117 already fixed), pagination cursor details,
  rendering of deleted-workspace rows.
