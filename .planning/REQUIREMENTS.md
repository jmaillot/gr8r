# Milestone v2.2 Requirements — Notifications, Search & Delivery

Owner decisions baked in (2026-11-12): `web-push@4.0.0` as runtime dep #2 (D-12 precedent); saved views/columns in server rows (`saved_views`, Phase 34 notif_prefs precedent); admin dashboard is power-admin (private projects fully visible in aggregates).

## Push Notifications
- [ ] **PUSH-01**: A member can enable browser notifications from Settings with an explicit opt-in prompt (never on page load), reusing the Phase 48 permission surface
- [ ] **PUSH-02**: A member receives a browser push notification (tab closed) when they are mentioned or assigned, honoring their per-member notification preferences (prefs-off = no push)
- [ ] **PUSH-03**: Push payloads carry a ticker (title + project/task reference, ≤4096 octets), never task bodies; clicking deep-links to the task
- [ ] **PUSH-04**: Dead push subscriptions are swept on send failure (404/410) so the table never grows stale
- [ ] **PUSH-05**: VAPID keys persist server-side across restarts (env/config in /data, DEPLOY.md runbook documented)

## Full-Text Search
- [ ] **SEARCH-01**: A member can search task titles and descriptions with plain keywords from the existing Ctrl-K palette (no query syntax required)
- [ ] **SEARCH-02**: Search results only include tasks the member can read (memberCanReadProject enforced server-side, byte-level leak tests)
- [ ] **SEARCH-03**: The search index stays in sync with every task write (funnel diff sync + boot rebuild sweep), on both SQLite (FTS5) and pg (equivalent behavior through db-adapter.mjs)
- [ ] **SEARCH-04**: French/English accented text is searchable (tokenizer decision locked at table creation, accent-insensitive matching)

## Admin Dashboard
- [ ] **DASH-01**: An admin sees overdue tasks grouped per project on a workspace dashboard
- [ ] **DASH-02**: An admin sees workload per member (task counts honoring the assignees[] array — a shared task counts once per member)
- [ ] **DASH-03**: An admin sees tasks due within the next 7 days and recent workspace activity
- [ ] **DASH-04**: The dashboard is admin/owner-only server-side (403 for members) and shows full private-project content (power-admin, owner ruling 2026-11-12)

## Transparency Self-View (TRN-02)
- [ ] **TRN-01**: A member can open their own access view: which projects they can reach and why (private+invite, team link, non-private, per-person/per-team grant) — redacted self-scope of the admin transparency view
- [ ] **TRN-02**: The member self-view never exposes other members' access rows (cross-member grants appear without names; byte-level shape tests)

## Notifications Trim (NOTIF-TRIM)
- [ ] **NOTIF-01**: The notification audit produces trim recommendations (suppression candidates, burst candidates) for the owner to rule on
- [ ] **NOTIF-02**: An owner can apply a trim ruling from the settings surface (one-click suppression of a notification class), and it lands in notif_prefs
- [ ] **NOTIF-03**: Rapid successive notifications on the same task coalesce (burst handling) so the inbox doesn't flood

## Views & Columns
- [x] **VIEW-01**: A member can show/hide table columns on the tasks table, and the choice persists across sessions and devices
- [ ] **VIEW-02**: A member can save a named view (filters + columns + sort) and re-apply or delete it from any device
- [ ] **VIEW-03**: General Access can be set beyond private/public — at minimum per-workspace default visibility rules (owner-configurable; precise granularity locked at discuss-phase)

## Delivery Infrastructure
- [x] **DELIV-01**: The e2e server refuses to serve a stale dist/ (mtime or manifest-hash check, fail-closed) so spec failures never mask source bugs
- [x] **DELIV-02**: Vite build produces no chunk over 500 kB (dynamic imports for locales and heavy pages), with the EN base catalogue kept in the entry chunk so locale chunks cannot race first paint
- [x] **I18N-01**: The locale registry/loaders/gate accept a new locale by adding one JSON file (no code change), proven by a fixture locale test — no new shipped language in this milestone

## Future Requirements (deferred)
- [ ] TRN-03: cross-member grant explanations with names for owners (admin view already covers)
- [ ] Full-text search over comments
- [ ] Saved views for search pages and dashboard drill-downs (one shared primitive — first cut scoped to the tasks table)
- [ ] Searchable token-chip pickers beyond the invite modal
- [ ] Per-person perms editing during invite

## Out of Scope
- Real billing/plan enforcement (unchanged)
- SAML/SCIM, subdomain tenancy (unchanged)
- Notification digest overhaul beyond NOTIF-03 coalescing (D-05 rulings may re-open later)
- Translation-management UI or machine translation (catalogues stay repo files)
- RTL support (no RTL locale offered)
- iOS/Safari-specific push UX polish (works via standard SW contract; platform quirks triaged on demand)

## Traceability
| REQ | Phase | Status |
|-----|-------|--------|
| DELIV-01 | Phase 56 | Complete |
| DELIV-02 | Phase 56 | Complete |
| I18N-01 | Phase 56 | Complete |
| VIEW-01 | Phase 57 | Complete (57-01) |
| VIEW-02 | Phase 57 | Pending |
| VIEW-03 | Phase 57 | Pending |
| SEARCH-01 | Phase 58 | Pending |
| SEARCH-02 | Phase 58 | Pending |
| SEARCH-03 | Phase 58 | Pending |
| SEARCH-04 | Phase 58 | Pending |
| PUSH-01 | Phase 59 | Pending |
| PUSH-02 | Phase 59 | Pending |
| PUSH-03 | Phase 59 | Pending |
| PUSH-04 | Phase 59 | Pending |
| PUSH-05 | Phase 59 | Pending |
| DASH-01 | Phase 60 | Pending |
| DASH-02 | Phase 60 | Pending |
| DASH-03 | Phase 60 | Pending |
| DASH-04 | Phase 60 | Pending |
| TRN-01 | Phase 60 | Pending |
| TRN-02 | Phase 60 | Pending |
| NOTIF-01 | Phase 61 | Pending |
| NOTIF-02 | Phase 61 | Pending |
| NOTIF-03 | Phase 61 | Pending |
