# Feature Research — v2.2 Feature Landscape vs Comparable Products

**Domain:** Self-hosted project-management workspace (Projects Studio / gr8r)
**Researched:** 2026-11-12
**Confidence:** HIGH on UX patterns (all six products publish and have stable, widely-replicated behaviors); MEDIUM on exact current settings names/limits (products evolve; live web search was degraded during this run — treated as LOW-authority and not relied upon for verdicts)

## Feature Landscape

Six categories requested. For each: how comparable products behave, then the table-stakes / differentiator / anti-feature breakdown with complexity and dependencies on existing gr8r surfaces.

---

### 1. Browser Push Notifications (mentions + assignments only)

**How comparable products behave:**

- **Linear** (the strongest reference — web app with real push): push is opt-in per channel, not per event. The notification arrives as an OS notification with a short title ("Mentioned in FOO-123"), one-line body, and clicking it deep-links to the exact issue, focusing an existing tab or opening a new one. Mentions and assignments are the highest-priority channels; everything else (status changes, comments-not-on-you) stays in the in-app inbox by default. Linear never prompts for permission at first page load — permission is requested from a settings surface after the user has context.
- **GitHub** (web notifications): browser notification permission is requested from the notifications settings page / notification tray, never a page-load interstitial. Clicking a web notification navigates to the conversation. GitHub deliberately keeps browser notifications to a coarse on/off per "participating / watching" model — no per-event granularity — because fine-grained prefs live in the email/inbox channels.
- **Trello**: opt-in prompt with an explanatory pre-prompt ("Get notified when cards are added/assigned to you") before the browser permission dialog — the classic two-step ask. Per-device toggle so a user can silence one machine.
- **Asana**: push is bundled under one "browser notifications" toggle; in-app toasts handle most events, push only for direct ones.
- **Basecamp**: the anti-reference for over-pushing — famous for "honor the user's quiet hours" and aggressive batching; their philosophy is that every notification competes with the user's attention and mentions/assignments are the only truly urgent events. (Direct validation of gr8r's "mentions + assignments only" scope.)
- **Todoist**: push is per-device with a small set of coarse categories (task reminders, comments, mentions), never per-project.

**Convergent pattern:** (a) permission requested from a settings/context surface, never on page load; (b) deep-link click-through to the exact task, reusing/focusing an existing tab where possible (gr8r's Phase 48 service worker already handles notificationclick/focus); (c) per-device enable/disable in addition to per-type prefs; (d) only high-intent events (mention, assignment) push — lower-intent events stay in the inbox.

| Feature | Tier | Why | Complexity | Notes |
|---|---|---|---|---|
| Settings-surface opt-in flow with pre-prompt + "Browser blocked" state | Table stakes | Every product asks from settings, never cold; silent-denied permission is the #1 push failure | LOW | Phase 48 already ships this (derived badge + explanatory toast). Extend, don't rebuild |
| Push rows gated on existing notif_prefs (`push_mention`, `push_assignment`) + server-side Web Push send alongside email mirror | Table stakes | Users expect the push toggle to actually gate sends, not just permission | MEDIUM | New: server-side `web-push` send on the `tFor()` core; gr8r constraint = zero runtime deps → hand-roll VAPID signing over `node:crypto` (already proven by OIDC/JWKS work in v1.6) or vendor a tiny MIT signer |
| Deep-link click-through to `/w/:slug/task/:key` with focus-or-open tab logic | Table stakes | Universal click-through behavior; broken click-through = push turned off immediately | LOW | SW already routes notificationclick; deep-link path pattern already exists from v1.5 LINK-01..04 |
| Per-device notification test ("Send test notification") button | Table stakes | Cheap, expected sanity check; GitHub/Linear both let users verify a subscription | LOW | Server route + button in settings |
| Suppress push when a tab of that workspace is focused/active (in-app toast instead) | Differentiator | Basecamp principle; Linear does this; prevents the double-hit of toast + OS notification | MEDIUM | Server can't know tab focus reliably → client-side suppression heartbeat or accept the tradeoff; simplest honest version: SW checks `clients.matchAll({type:'window'})` visibility and skips display if a visible gr8r tab exists |
| Quiet hours / per-workspace push mute | Differentiator | Basecamp's signature respect-the-user stance; valued, rarely copied fully | MEDIUM | Extend notif_prefs rows (whitelisted keys pattern exists) |
| Push for comments, due dates, status changes | Anti-feature | Scope creep; every product that pushed everything got push disabled en masse; gr8r already scoped this milestone to mentions+assignments deliberately | — | Lower-intent events stay inbox/email per existing prefs |

**Dependencies:** Phase 48 service worker + VAPID subscription storage; `notif_prefs` 17-key whitelist (additive migration pattern proven in Phase 34); `tFor()` per-locale payload text (i18n gate applies to SW payloads too); inbox rows already keyed per recipient.

---

### 2. Full-Text Search (titles + descriptions, FTS5, wired into Ctrl-K)

**How comparable products behave:**

- **Linear**: Cmd-K palette IS the search. Zero query syntax by default; plain substring/token matching with fuzzy tolerance and accent-insensitive matching; results grouped by type (issues, projects, people, actions); search-as-you-type with highlighting of matched tokens; keyboard-navigable. Advanced filters live on views, not in the palette.
- **GitHub**: search with a rich qualifier syntax (`repo:`, `is:open`, `assignee:@me`) but it lives in the *dedicated search page*; the quick palette (Cmd-K) is fuzzy and syntax-free. Highlighting only on the results page. Results grouped by type with counts.
- **Asana**: top-bar search → full results page grouped by task/project/message tabs, with saved searches (custom fields as filters). No query syntax typed by users.
- **Trello**: card search with operator-ish tokens (`@member`, `label:`, `due:week`) — one of the few PM tools with real inline operators, and users mostly don't know they exist.
- **Todoist**: natural-ish operators (`#project`, `@label`, `today`, `p1`) — powerful, famously underused.
- **Basecamp**: famously *no operators* — plain search, deliberately simple.

**Convergent pattern:** the palette stays syntax-free; rich queries (if any) live on a results page; grouping by type; highlighting matched substrings; recent searches + keyboard nav. Nobody expects operators in a self-hosted workspace of this size. FTS5 with trigram/unicode61 tokenizer over titles+descriptions is well past sufficient.

| Feature | Tier | Why | Complexity | Notes |
|---|---|---|---|---|
| FTS5 index over task title+description, project-scoped and permission-filtered | Table stakes | Ctrl-K currently searches titles only; scale requires descriptions; missing description search feels incomplete vs Linear/GitHub | MEDIUM | FTS5 virtual table + triggers or rebuild-on-write through the existing write funnel; **must filter results through `memberCanReadProject`** — a search that leaks private project titles is a security bug, not a UX bug (redaction funnel pattern from v1.7 SEARCH-01) |
| Result grouping (Tasks / Projects / Actions) in the palette | Table stakes | Every product groups; flat mixed results feel broken | LOW | Palette already lists tasks + commands; add section headers |
| Match highlighting in result rows | Table stakes | Linear/GitHub/Asana all highlight; cheap expectation | LOW | Tokenized matcher already exists in `src/lib/redaction.js` (NFC+lowercase) — reuse |
| Results page (palette → "See all results") with filters + highlighting | Table stakes | Palette is for jump-to; deep search needs a page (GitHub model) | MEDIUM | New route + server search endpoint; permission funnel reuse |
| Recent searches persisted per user | Table stakes | All products do it; gr8r already tracks recent-search tokens | LOW | Extend existing recent-search rows (Phase 34) |
| Accent-insensitive + fuzzy matching | Table stakes (given FR is a first-class locale) | Already an owner-validated v1.2 decision for member search; users expect parity in task search | LOW | FTS5 needs `remove_diacritics=1` (unicode61) or a normalized column; pg variant needs its own answer (pg_trgm or unaccent) |
| Inline query operators (`assignee:@me`, `project:`, `is:overdue`) | Differentiator | Trello/Todoist have them; genuinely useful; few self-hosted tools bother | MEDIUM | Cheap on FTS5 via prefix-query augmentation; but keep them invisible-by-default (document, don't advertise) |
| Saved searches | Differentiator | Asana's saved searches are loved; overlaps with saved views (§6) — build once, share the mechanism | MEDIUM | **Coordinate with saved views: one "saved filter" primitive serves both** |
| Natural-language date queries ("due next week") | Anti-feature | Needs NLP parsing, high maintenance, i18n-explosive in FR; Todoist is the only one doing it credibly | — | Operators cover the need |
| Search across comments/attachments/files | Anti-feature (for now) | Scope explosion; description search is the milestone scope; GitHub's universality took a decade | — | Defer; design FTS schema so a comments table can be added later |

**Dependencies:** Ctrl-K palette (surface), `memberCanReadProject` funnel (mandatory), redaction.js token matcher (highlighting + recent-search dedup), FTS5 in `node:sqlite` **and a pg-side equivalent through `db-adapter.mjs`** (DBA seam — this is the biggest hidden complexity: two backends must pass the same suite per standing constraint).

---

### 3. Admin Workspace Dashboard (overdue per project, load per member, upcoming dues, recent activity)

**How comparable products behave:**

- **Linear**: Insights/roadmap views per project (scope %, velocity); the "my issues" workload is per-person; admins get an insights page with initiative/project progress bars. Widgets are simple: count + trend + drill-down into a filtered view.
- **Asana**: Portfolios + dashboards: widgets are charts (bar/pie of tasks by status/assignee/section), plus "upcoming" and "overdue" numeric lists. Layout = drag-and-drop widget grid. The universal widget set: tasks-by-status, tasks-by-assignee (workload), upcoming due, overdue, project progress.
- **Trello**: no real admin dashboard (Enterprise reporting is thin) — weak reference.
- **GitHub**: org dashboards list open PRs/issues, contribution activity; simple tables + trend sparklines.
- **Basecamp**: Hill Charts per project + "what's due next" rollup on the home page — the rollup of upcoming dues across projects is the pattern that matters.
- **Todoist**: productivity overview for self; workspace reporting only in Business.

**Convergent pattern:** four widget archetypes cover 90% of value: (1) **overdue count per project** (table/bar with drill-down), (2) **workload per member** (bar of open assigned tasks, ideally "due this week" split), (3) **upcoming due dates** (7–14 day list), (4) **recent activity feed** (gr8r already has the activity log + machine verbs from ACT-01/02). Layout = responsive card grid, each card drill-down-clickable into a pre-filtered list view. Everything respects the admin's own permission view — an admin dashboard is admin-UI, but data should still come from the same funnels (admins already see all non-private projects through `memberCanReadProject`).

| Feature | Tier | Why | Complexity | Notes |
|---|---|---|---|---|
| Overdue-per-project widget with drill-down | Table stakes | Present in every serious reporting surface; the admin's #1 question is "what's slipping" | MEDIUM | Server aggregate route + click-through to project filtered by overdue |
| Workload-per-member widget (open tasks / due-this-week split) | Table stakes | Asana workload, Linear my-issues; the #2 admin question | MEDIUM | Aggregation over assignees[] (multi-assignee parity shipped in v2.1 — must aggregate per-assignee, not per-task) |
| Upcoming due dates (next 7–14 days) rollup | Table stakes | Basecamp home rollup; cheap, high value | LOW | Shared query shape with the reminder pass; respect visibility |
| Recent activity feed widget | Table stakes | Activity log exists (machine verbs, ACT-01/02) — a widget over it is pure UI | LOW | Reuse activity endpoint; filters classify verbs already |
| Permission-respecting data source (admin sees same funnel, not a bypass) | Table stakes | Security: a dashboard must not become a private-project oracle | LOW | Route through `memberCanReadProject`; admin role already broad |
| Time-range selector on widgets (this week / month) | Differentiator | Asana has it; useful; cheap once aggregates exist | LOW | Parameterized queries |
| Export dashboard to CSV/PNG | Differentiator | Requests happen; gr8r already has export muscle | LOW | CSV of the aggregate rows is enough |
| Custom/drag-drop widget layout, custom charts, saved dashboard configs | Anti-feature | Asana's full dashboard builder is a product of its own; huge surface for a self-hosted app of this size; nobody needs 8 widgets configurable on day one | — | Fixed responsive grid of the 4 widgets; revisit only on explicit demand |
| Per-project deep dashboards (velocity, burndown) | Anti-feature (for now) | Needs task-history/time-series data that gr8r doesn't track; building history for charts is a hidden multi-milestone cost | — | Defer; note the missing `task_history` prerequisite explicitly |

**Dependencies:** activity log (exists), multi-assignee assignees[] model (v2.1), `memberCanReadProject`, existing filtered list views for drill-down targets.

---

### 4. Member Self-View of Access Transparency (TRN-02)

**How comparable products behave:**

- **GitHub**: the strongest pattern — every repo shows the member *their own* access level ("You have write access to this repository because you're a maintainer of…"), and org members can see org membership; the "why am I seeing this" reason line is the gold standard.
- **Linear**: teams show you which teams you're on; the "you're a guest in this workspace" banner is the honest-access pattern.
- **Google Drive / Notion** (adjacent): share modal shows "you have view access" with the grant reason; Notion shows how access was inherited.
- **Asana/Trello**: weak — you infer your access from what you can see. Trello at least shows board membership explicitly.
- **Basecamp**: permissions explained in prose per project ("You're on this project as a participant").

**Convergent pattern:** the member-facing version is *smaller* than the admin version (TRN-01, shipped): a per-project "why can I see this" reason label (direct invite / team membership / public workspace / project lead), and a compact "my access" summary. Critically, the computation must go through the exact same `memberCanReadProject` funnel with the same reason codes TRN-01 already computes — this is a re-surface of existing logic, not new permission code.

| Feature | Tier | Why | Complexity | Notes |
|---|---|---|---|---|
| Per-project access line for the viewing member ("Can edit · via team Engineering") | Table stakes | GitHub's pattern; removes the "why can I see this?" support question; the whole point of transparency | LOW | TRN-01 reason codes + funnel already compute this; render in project settings/page for self |
| "My access" summary view (teams, roles, guest scope, per-project list) | Table stakes | Linear/Notion pattern; one honest page | LOW | Same funnel, filtered to caller; keyed route like TRN-01's |
| Guest sees exactly-one-project explanation | Table stakes | The guest invariant (D-53-2) is already enforced server-side; surfacing it prevents confusion | LOW | Pure UI over existing validator output |
| Redaction self-consistency (self-view shows only what the funnel grants, including private-to-them) | Table stakes | A self-view that shows more than the funnel grants = information leak | LOW | Same computation path; test the 404/hidden matrix against Phase 29's named matrix |
| "Request access" button on hidden projects | Differentiator | GitHub/Drive pattern; genuinely useful but needs a request surface + notification to someone with grant rights | MEDIUM | New notification type + owner/admin target resolution — defer unless demand exists |
| Access-change history for members ("who changed my access when") | Differentiator | Audit trail exists (Phase 24); exposing to members is a policy decision, not tech | MEDIUM | Privacy-sensitive: owners may not want members seeing grant history — needs an owner ruling (like D-05) |
| Showing other members' access to non-admins | Anti-feature | Privacy; TRN-01 deliberately made this admin-only; member version must be self-only | — | Hard-gate: member self-view NEVER exposes other members' access rows |

**Dependencies:** TRN-01 (admin transparency, reason labels, keyed route pattern), `memberCanReadProject` + reason codes, guest validator, audit trail (only for the deferred history item).

---

### 5. Notification Digest / Trim (NOTIF-TRIM)

**How comparable products behave:**

- **GitHub**: the canonical trim model — email notification *reasons* (participating, watching, mentions, team mentions, CI) each individually toggleable, plus "Only monitor for issue/PR state changes" coarse mode; watching vs participating distinction is the single best trim idea in the industry.
- **Linear**: per-channel (Inbox / Email / Push / Slack) × per-type matrix in settings; defaults are already minimal (mentions + assignments on, rest off or inbox-only).
- **Slack**: batched/digest notifications for mobile at set intervals; per-channel mute overrides — the "schedule/quiet hours + digest batching" combo.
- **Basecamp**: "Brewery"/activity digest — a daily rollup email is a first-class citizen, not an afterthought; individual pings only for @mentions and assignments.
- **Asana**: digest email for activity, immediate only for direct mentions; notification settings page lists every type × channel explicitly in a matrix.
- **Todoist**: coarse per-category toggles only.

**Convergent pattern:** a **type × channel matrix** is the standard settings shape (gr8r already has the 17-key prefs whitelist ≈ this matrix). Trim work is about *defaults and consolidation*, not new channels: (a) collapse redundant sends (update-batch: one notification per task per actor per burst, not per field change); (b) move low-intent types to digest-only by default; (c) give each default a stated rationale (the notification-audit doc already exists from Phase 39 with trim recommendations all `proposed` pending D-05 owner rulings — NOTIF-TRIM is *executing* those rulings).

| Feature | Tier | Why | Complexity | Notes |
|---|---|---|---|---|
| Owner-ruled default matrix (D-05 rulings applied as shipped defaults) | Table stakes | Every product ships opinionated minimal defaults; gr8r's audit doc already enumerates them with citations | LOW | Apply `proposed` → decided in the audit doc; change defaults in one place; regression-pin Phase 38 no-double-send invariant |
| Burst coalescing (one notification per task per actor within a window, superseding edits) | Table stakes | Linear/Slack do this; without it, watchers get 6 notifications for one task edit | MEDIUM | Server-side debounce window on notification emission; interacts with the 30s polling + row insert path |
| "Watching vs participating" distinction (auto-watch on assign/mention only, explicit watch/unwatch per task) | Differentiator | GitHub's best idea; gr8r already auto-watches creators (v1.5) and has watchers — extend the model with unwatch | MEDIUM | Watchers exist; add unwatch UI + exclude-unwatched filtering in send funnel |
| Per-type digest routing (low-intent types land only in the 09:00 digest) | Differentiator | Asana/Basecamp model; gr8r's digest (Phase 38) already suppresses individual reminders for digest users — extend routing to other types | LOW | Prefs keys + digest builder already exist |
| Quiet hours (suppress non-mention push/email outside hours) | Differentiator | Slack/Basecamp; valued | MEDIUM | Per-user tz exists since v1.9 — schedule window check is straightforward |
| One-click unsubscribe on ALL notification emails (RFC 8058 for every type, not just digest) | Table stakes | GitHub does this everywhere; deliverability + legal (post-2024 one-click-unsubscribe norms); audit doc already recommends the digest one | MEDIUM | HMAC token route exists (UNSUB-01..03); generalize to all notification email types |
| Per-notification inline actions in email (mark done from email) | Anti-feature | Complexity + security (authenticated actions from mail); GitHub keeps actions = click-through; nobody expects it from gr8r | — | Deep-link only (already shipped LINK-01..04) |
| Notification "snooze" / "remind me later" on inbox rows | Anti-feature (for now) | Linear has it but it's a mature-workflow nicety; inbox trim has higher value-per-effort first | — | Defer to backlog |

**Dependencies:** notif_prefs rows + whitelist (Phase 34), digest builder + suppression invariant (Phase 38), notification-audit doc + D-05 rulings (Phase 39 — **explicitly requires an owner ruling during execution**), send funnel + no-double-send invariant (Phase 36/38), HMAC unsubscribe route (v1.9).

---

### 6. Column Show/Hide + Saved Views

**How comparable products behave:**

- **Linear**: views are first-class: every filter combination can be saved, named, shared, starred; saved views live in the sidebar. Column show/hide + reorder + sizing on list/board views, persisted per user per view.
- **Asana**: projects have Views (tabs) — add view, choose layout (list/board/table/calendar), add filter+sort+group, save. "Custom fields as columns" with per-view show/hide.
- **Airtable** (the extreme reference): grid views with per-view field (column) visibility, order, width, filters, sorts, groups — everything per view, shareable.
- **GitHub Projects**: per-view field visibility, saved views, group-by, sort — the newest and cleanest implementation of exactly this feature set; per-user layout persistence server-side.
- **Trello**: weakest — one table view, no saved views.
- **Jira**: saved filters + per-user column config — the enterprise pattern, but heavy.

**Convergent pattern:** (a) column visibility is per *view*, persisted per user (not global per table); (b) a saved view = named bundle of {layout, filters, sort, group, visible columns}; (c) views are personal by default, shareable optionally; (d) a "reset to default" affordance is mandatory; (e) show/hide lives in a column-picker dropdown on the table header, not buried in settings.

| Feature | Tier | Why | Complexity | Notes |
|---|---|---|---|---|
| Column show/hide via header column-picker, per user persisted | Table stakes | GitHub Projects/Asana/Airtable all have it; wide tables are unusable without it | LOW–MEDIUM | Persist per-user per-context (localStorage acceptable v1; server persistence better given multi-device expectations) |
| Saved views: named {filters, sort, visible columns} per project, personal | Table stakes | Linear/GitHub/Asana all core; the natural companion to filters | MEDIUM | New storage (doc field or rows through existing funnel); view switcher UI on table view |
| Reset-to-default + manage (rename/delete) views | Table stakes | Without reset, a hidden column becomes an unrecoverable trap | LOW | Standard |
| View-level default sort + group | Differentiator | GitHub Projects group-by is loved; gr8r table view likely has fixed sort | MEDIUM | Composes with saved views — build into the view bundle from day one |
| Shared/team views (publish a view to the project) | Differentiator | Linear shared views; high coordination value for leads | MEDIUM | Permission question: who may publish (lead?); defer unless asked |
| Cross-project saved views ("my overdue everywhere") | Differentiator | Linear's strongest views are workspace-level; overlaps with §2 saved searches and §3 dashboard — one primitive could serve all three | HIGH | Build the per-project version first; the primitive should be designed so workspace-scope can come later |
| Drag-to-reorder + resize columns | Differentiator | Expected in grown products but not day-one; persists per user like visibility | MEDIUM | Plain-DOM drag is doable in gr8r's no-framework frontend but fiddly |
| Fully shareable view URLs with encoded state | Anti-feature | Encodes growing state into URLs → brittle, i18n + escaping pain; named views serve sharing better | — | Named saved views + normal route state instead |
| Dashboard-style view aggregation (charts inside table views) | Anti-feature | Overlaps §3; Airtable's interface designer is a separate product | — | Dashboard phase owns charts |

**Dependencies:** table view (exists), filter/sort UI on views, per-user settings storage pattern (Phase 34 rows), possibly the FTS/saved-search primitive (§2) — **recommend one "saved view/filter" primitive shared by table views, search page, and dashboard drill-downs**.

---

## Feature Dependencies

```
[notif_prefs matrix (Phase 34)] ──requires──> [push gating] ──requires──> [browser push v2.2]
[Phase 48 service worker + VAPID] ──requires-for──> [browser push v2.2]
[tFor() i18n send core] ──requires-for──> [push payload text + digest routing]
[D-05 owner rulings (Phase 39 audit doc)] ──blocks──> [NOTIF-TRIM default changes]
[HMAC unsubscribe route (v1.9)] ──requires-for──> [one-click unsubscribe on all types]
[digest builder (Phase 38)] ──enhances──> [per-type digest routing]
[Ctrl-K palette] ──requires-for──> [FTS5 palette results]
[memberCanReadProject funnel] ──requires-for──> [FTS5 results filtering, dashboard aggregates, TRN-02 self-view]
[FTS5 index] ──requires──> [pg-adapter equivalent through db-adapter.mjs]  ← hidden prerequisite
[TRN-01 reason codes + funnel] ──requires-for──> [TRN-02 self-view]
[multi-assignee assignees[] (v2.1)] ──requires-for──> [workload-per-member widget]
[activity log (ACT-01/02)] ──requires-for──> [recent-activity widget]
[saved-view primitive] ──enhances──> [table views, search results page, dashboard drill-downs]
[FTS5 results page] ──conflicts-with──> [saved searches] if built as two primitives — unify
```

### Dependency Notes

- **Everything data-bearing routes through `memberCanReadProject`:** search results, dashboard aggregates, and the TRN-02 self-view must never bypass the funnel — a bypass is a security regression, not a shortcut.
- **NOTIF-TRIM is blocked on D-05 owner rulings by design** — the audit doc made all trim recommendations `proposed`; the roadmap should schedule the owner-ruling step as part of the phase, not a surprise.
- **The dual-backend constraint (SQLite + Postgres) is the silent dependency for FTS5 and any aggregate SQL:** every search/aggregate query must work on both `node:sqlite` FTS5 and a pg equivalent, per the standing "both backends pass the same suite" gate.
- **Push is the most self-contained item** (Phase 48 foundation is done); saved views is the most entangled (touches table views, search, dashboard).

## MVP Definition

### Launch With (v2.2 core)

- [ ] Browser push for mentions + assignments, gated on notif_prefs, settings-surface opt-in, deep-link click-through — foundation exists; smallest path to "workspace alive outside the tab"
- [ ] FTS5 search over titles+descriptions, permission-filtered, grouped palette results + "see all" page — scale prerequisite
- [ ] Admin dashboard with the 4 fixed widgets (overdue/project, workload/member, upcoming dues, recent activity) — all data exists
- [ ] TRN-02 member self-view over the existing TRN-01 funnel — smallest feature, pure re-surface
- [ ] NOTIF-TRIM: apply D-05 rulings + one-click unsubscribe generalization — debt with citations already written
- [ ] Column show/hide per user on table view — highest-value, lowest-risk slice of saved views

### Add After Validation (v2.x)

- [ ] Full saved views (named bundles, manage/reset) — trigger: column prefs alone feel insufficient
- [ ] Burst coalescing + quiet hours + watch/unwatch — trigger: notification volume complaints
- [ ] Search operators + saved searches on the unified primitive — trigger: power-user demand
- [ ] Per-device push test button, tab-focus suppression polish

### Future Consideration (v3+)

- [ ] Cross-project/workspace-level saved views — needs the primitive hardened per-project first
- [ ] Shared views, "request access" flow, member access-change history — each needs an owner policy ruling
- [ ] Comment/attachment search — needs index expansion beyond milestone scope

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---|---|---|---|
| Browser push (mentions+assignments) | HIGH | MEDIUM | P1 |
| FTS5 palette + results page (perm-filtered) | HIGH | MEDIUM | P1 |
| Admin dashboard (4 widgets) | HIGH | MEDIUM | P1 |
| TRN-02 member self-view | MEDIUM | LOW | P1 |
| NOTIF-TRIM defaults + unsubscribe (post D-05) | MEDIUM | LOW–MEDIUM | P1 |
| Column show/hide | MEDIUM | LOW | P1 |
| Saved views full | MEDIUM | MEDIUM | P2 |
| Burst coalescing / quiet hours / watch-unwatch | MEDIUM | MEDIUM | P2 |
| Search operators + saved searches | LOW–MEDIUM | MEDIUM | P2 |
| Digest routing per type | MEDIUM | LOW | P2 |
| Shared views / request access / access history | LOW (today) | MEDIUM | P3 |
| Custom dashboard builder / view URLs | LOW | HIGH | P3 |

## Competitor Feature Analysis

| Feature | Linear | GitHub | Asana | Basecamp | Our Approach |
|---|---|---|---|---|---|
| Push scope | Mentions/assignments by default | Coarse participating/watching | Direct events | Mentions/assignments only ("ping") | Same as Basecamp/Linear — matches milestone scope; validate, don't widen |
| Permission prompt | Settings surface | Settings surface | Settings surface | Pre-prompt then browser dialog | Settings surface (Phase 48 already) |
| Search | Palette, syntax-free | Palette fuzzy + page with qualifiers | Page + tabs + saved searches | Plain, no operators | Palette syntax-free; operators deferred/hidden; page for deep search |
| Admin dashboard | Insights per project | Org tables | Drag-drop widget grid | Hill charts + due rollup | Fixed 4-widget grid; anti-builder |
| Access transparency | Team/guest banners | "You have X access because…" | Inferred | Prose per project | GitHub reason-label pattern over TRN-01 funnel |
| Trim | Minimal defaults, matrix | Reasons + watch model | Matrix + digest | Digest-first philosophy | Execute the existing audited matrix; GitHub watch/unwatch as the differentiator |
| Saved views | First-class, shareable | Per-view columns, saved views | View tabs | — | Personal views on table first; one primitive shared with search |

## Sources

- Product UX behaviors: Linear, GitHub, Asana, Trello, Todoist, Basecamp, Airtable, Notion, Slack — official docs and long-stable, widely-replicated product behaviors (HIGH confidence; these are documented, canonical patterns)
- Live web verification attempted (searxng) — degraded by engine rate limits during this run; used only to confirm nothing contradicted, not as a primary source (flagged LOW authority, not load-bearing)
- gr8r internal ground truth: PROJECT.md (Phases 34/36/38/39/48, TRN-01, v1.5 LINK/REM, v1.9 digest/unsub, v2.1 multi-assignee), `docs/notification-audit.md` (Phase 39), Phase 34 SEARCH-01 redaction matcher — HIGH confidence (codebase-verified)
- Unverified gaps flagged: exact current setting labels in Linear/Asana settings pages; FTS5 trigram tokenizer availability inside `node:sqlite` vs `better-sqlite3` builds — needs a phase-specific spike (dual-backend FTS)

---
*Feature research for: self-hosted project-management workspace — v2.2 Notifications, Search & Delivery*
*Researched: 2026-11-12*
