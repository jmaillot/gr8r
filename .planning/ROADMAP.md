# Roadmap: Projects Studio

🚧 **v2.2 Notifications, Search & Delivery** — started 2026-11-12

**Goal:** make the workspace alive outside the tab (browser push), findable at scale
(FTS5 search, admin dashboard) and cheap to keep building (e2e dist guard, Vite
code-splitting, i18n-ready infrastructure).

**Owner decisions locked (2026-11-12):** `web-push@4.0.0` as runtime dep #2 (D-12
precedent); saved views/columns in a server `saved_views` table (Phase 34 notif_prefs
precedent); admin dashboard is power-admin (private projects fully visible in aggregates).
These are baked into phase goals — do not re-open them.

**Standing constraints:** zero-migration discipline where feasible (additive rows follow
the Phase 34 guarded-migration recipe when needed), full suite green, EN+FR i18n gate
(server keys included), Phase 38 suppression + no-double-send invariants pass unmodified.

## Milestones

- 🚧 **v2.2 Notifications, Search & Delivery** (current)
- ✅ v2.1 Member & Project Experience (shipped 2026-11-11 — Phases 53–55)

## Phases

- [x] **Phase 56: Delivery Infrastructure** - e2e anti-stale-dist guard, Vite code-splitting, i18n-ready locale infrastructure (completed 2026-11-12)
- [x] **Phase 57: Views, Columns & General Access** - column show/hide, saved views in server rows, General-Access granularity beyond private/public (completed 2026-11-12)
- [ ] **Phase 58: Full-Text Search** - FTS5 over task titles + descriptions, permission-filtered, wired into Ctrl-K
- [ ] **Phase 59: Browser Push** - server push fan-out for mentions + assignments via web-push@4.0.0
- [ ] **Phase 60: Admin Dashboard & Member Self-View** - power-admin workspace dashboard + TRN-02 member transparency self-view
- [ ] **Phase 61: Notification Trim** - D-05-ruling-gated trim application, one-click suppression, burst coalescing

## Phase Details

### Phase 56: Delivery Infrastructure

**Goal**: Every later phase verifies on honest rails — the e2e server never serves a
stale build, the bundle stays lean, and a new locale lands by adding one JSON file.
**Depends on**: Nothing (first phase)
**Requirements**: DELIV-01, DELIV-02, I18N-01
**Success Criteria** (what must be TRUE):
  1. An operator running e2e against a stale `dist/` sees the e2e server refuse to
     start with a loud staleness error (mtime or manifest-hash check, fail-closed) —
     a spec failure can never mask a source bug (DELIV-01)
  2. A fresh `vite build` emits no chunk over 500 kB: locale catalogues and heavy
     pages load via dynamic import, while the EN base catalogue stays in the entry
     chunk so the app renders identically at first paint (DELIV-02)
  3. A developer drops a new locale JSON file in the registry and the app loads it —
     locale switcher and gate accept it with zero code change, proven by a fixture
     locale test; no new shipped language (I18N-01)
  4. The full unit suite, e2e suite and i18n gate stay green on the split build
     (standing constraint)
**Plans**: 4/4 plans complete

Plans:
**Wave 1**
- [x] 56-01-PLAN.md — DELIV-02: 500 kB build gate test (D-02), async renderPage tracer, strengthMeter decoupling, settings split (revised D-01)
- [x] 56-03-PLAN.md — DELIV-01: manifest + sha256 build stamp, fail-closed stale-dist guard in e2e/server.mjs, three-case guard test

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 56-02-PLAN.md — DELIV-02: finish the split below the gate (design-system/members, seed-lazy emptyState/ensureSeedData contract, residual edges by measurement), full unit + e2e proof
- [x] 56-04-PLAN.md — I18N-01: derived locale registry (glob keys ∪ base), shared localeCodes scan, scan name-map sync, fixture-locale proof test (D-08)

### Phase 57: Views, Columns & General Access

**Goal**: Members shape their own table experience per user — visible columns, named
saved views synced across devices — and owners set workspace-wide default visibility
beyond the private/public binary.
**Depends on**: Phase 56 (runs verification on the guarded e2e + split build)
**Requirements**: VIEW-01, VIEW-02, VIEW-03
**Success Criteria** (what must be TRUE):
  1. A member hides/shows tasks-table columns and the choice is still applied after
     sign-in on a different device (VIEW-01)
  2. A member saves a named view (filters + columns + sort), re-applies it from
     another device, and deletes it; the view lands in the server `saved_views` table
     (owner decision, Phase 34 precedent) (VIEW-02)
  3. A view saved under an older schema version still loads leniently (unknown fields
     intersected away, no hard failure) (VIEW-02)
  4. An owner sets General Access beyond private/public — at minimum per-workspace
     default visibility rules — and members see exactly the resulting visibility
     (precise granularity locked at discuss-phase) (VIEW-03)
**Plans**: 3/3 plans complete

Plans:
**Wave 1**
- [x] 57-01-PLAN.md — VIEW-01: `saved_views` substrate + per-user column persistence tracer (D-05/D-07/D-08), doc.views boot sweep + three-site strip (D-06) *(complete: 2 commits, full chain green — unit 1418, e2e 109, lint, i18n)*

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 57-02-PLAN.md — VIEW-02: named saved views (caps D-12, lenient schemaVersion load), collision-free save/apply/delete actions + popover UI *(complete: 3 commits, full chain green — unit 1429, e2e 110, lint, i18n, chunk gate 499,885 B)*
- [x] 57-03-PLAN.md — VIEW-03: `prefs.defaultPrivate` owner setting (D-03/D-04), createProject seed, Access-tab hint

**UI hint**: yes

### Phase 58: Full-Text Search

**Goal**: Members find any task they can read by plain keywords — titles and
descriptions, English or French, accents folded — from the existing Ctrl-K palette.
**Depends on**: Phase 56 (guarded e2e); sequenced BEFORE Phase 59 so the doc-PUT
funnel diff site is edited once per concern, not concurrently twice
**Requirements**: SEARCH-01, SEARCH-02, SEARCH-03, SEARCH-04
**Success Criteria** (what must be TRUE):
  1. A member types plain keywords in the existing Ctrl-K palette and sees matching
     task titles/descriptions grouped, with a results page for the full list — no
     query syntax required (SEARCH-01)
  2. A member never sees tasks from projects they cannot read: search results are
     filtered server-side through `memberCanReadProject`, proven by byte-level leak
     tests (SEARCH-02)
  3. A task created or edited through any write path (doc-PUT funnel, bulk, MCP
     mirror) is findable immediately after; a boot rebuild sweep heals drift, and the
     index behaves identically on SQLite (FTS5) and pg (SEARCH-03)
  4. "elodie" finds "Élodie" — French accented text is searchable with the tokenizer
     decision locked at table creation (SEARCH-04)
**Plans**: 3 plans

Plans:
**Wave 1**
- [ ] 58-01-PLAN.md — SEARCH-01/02/03: server FTS core — task_fts index, adapter seam (syncTaskFts/searchTasks/ftsSweep), funnel + MCP tx sync, membership-gated search route, byte-level leak tests

**Wave 2** *(blocked on Wave 1 completion)*
- [ ] 58-02-PLAN.md — SEARCH-03/04: pg parity — task_search_projection folded projection, dialect-complete seam, DBA suite "elodie→Élodie" rows
- [ ] 58-03-PLAN.md — SEARCH-01/02: client hybrid — debounced/abortable search-server helper, palette merge, /search page merge, i18n + chunk gates

### Phase 59: Browser Push

**Goal**: The workspace reaches members with the tab closed — a browser push arrives
when they are mentioned or assigned, honoring prefs, deep-linking to the task.
**Depends on**: Phase 58 (funnel diff site edits sequenced); Phase 56 (SW/chunk-hash
contract); extends the Phase 48 badge/permission foundation
**Requirements**: PUSH-01, PUSH-02, PUSH-03, PUSH-04, PUSH-05
**Success Criteria** (what must be TRUE):
  1. A member enables browser notifications from Settings via an explicit opt-in
     prompt (never on page load), reusing the Phase 48 permission surface, with a
     working per-device test push (PUSH-01)
  2. With the tab closed, a member who is mentioned or assigned receives a browser
     push; a member with prefs off for that type receives none (PUSH-02)
  3. The push shows a ticker (title + project/task reference, ≤4096 octets, never
     task bodies) and clicking it opens the exact task deep link (PUSH-03)
  4. A dead subscription (endpoint 404/410) is swept on send failure — the
     `push_subscriptions` table never grows stale rows (PUSH-04)
  5. VAPID keys persist server-side across restarts (env/config in /data, MASTER_KEY
     custody pattern) with the DEPLOY.md runbook documented; a restart does not
     orphan existing subscriptions (PUSH-05)
**Plans**: TBD

### Phase 60: Admin Dashboard & Member Self-View

**Goal**: Admins get one honest workspace overview (overdue, load, upcoming, activity
— private projects fully visible per the power-admin ruling) and every member can see
their own redacted access picture.
**Depends on**: Phase 56 (i18n infra + split build)
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, TRN-01, TRN-02
**Success Criteria** (what must be TRUE):
  1. An admin opens the workspace dashboard and sees overdue tasks grouped per
     project (DASH-01)
  2. An admin sees workload per member counting the `assignees[]` array — a shared
     task counts once per member (DASH-02)
  3. An admin sees tasks due within the next 7 days and recent workspace activity
     (DASH-03)
  4. A member hitting the dashboard route gets 403 server-side, while admins see full
     private-project content in aggregates (power-admin, owner ruling 2026-11-12)
     (DASH-04)
  5. A member opens their own access view — reachable projects with reason codes
     (private+invite, team link, non-private, per-person/per-team grant) — and the
     response never exposes other members' access rows (cross-member grants appear
     without names), proven by byte-level shape tests per role (TRN-01, TRN-02)
**Plans**: TBD
**UI hint**: yes

### Phase 61: Notification Trim

**Goal**: The notification surface shrinks by owner ruling, not by guess — decided
trims applied one-click, burst floods coalesced, with the Phase 38 invariants intact.
**Depends on**: Phase 60 (notification pipeline + settings surface stable); gated on
D-05 owner rulings arriving during execution
**Requirements**: NOTIF-01, NOTIF-02, NOTIF-03
**Success Criteria** (what must be TRUE):
  1. The notification audit produces concrete trim recommendations (suppression and
     burst candidates) for the owner to rule on — no speculative trims before rulings
     (NOTIF-01)
  2. An owner applies a trim ruling from the settings surface in one click; the
     suppressed notification class lands in `notif_prefs` and members stop receiving
     it (NOTIF-02)
  3. Rapid successive notifications on the same task coalesce so the inbox shows a
     burst summary instead of flooding (NOTIF-03)
  4. The Phase 38 suppression + no-double-send invariants pass unmodified after all
     trims (standing constraint)
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 56. Delivery Infrastructure | 4/4 | Complete    | 2026-11-12 |
| 57. Views, Columns & General Access | 3/3 | Complete    | 2026-11-12 |
| 58. Full-Text Search | 0/? | Not started | - |
| 59. Browser Push | 0/? | Not started | - |
| 60. Admin Dashboard & Member Self-View | 0/? | Not started | - |
| 61. Notification Trim | 0/? | Not started | - |

## Backlog

### Phase 999.1: Follow-up — Phase 57 deferred UAT follow-up: Test 1 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 57 verification
**Source phase:** 57
**Deferred at:** 2026-11-12 during /gsd-verify-work 57 session completion
**Follow-ups:**
- [ ] Test 1: Affichage sur téléphone fortement tronqué avec le bouton colonnes (layout mobile de la table des tâches) (deferred 2026-11-12)
