# Phase 57: Views, Columns & General Access - Context

**Gathered:** 2026-11-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Three deliverables, all per-member or owner-facing on existing tables: (1) VIEW-01 — members show/hide tasks-table columns, persisted per member across sessions and devices; (2) VIEW-02 — members save named views (filters + columns + sort), re-apply and delete them from any device, stored in a server `saved_views` table with lenient schema-versioned loading; (3) VIEW-03 — owners set a workspace default project visibility (private vs workspace-visible) applied to new projects, beyond nothing else: the private/public binary per project stays. Full-text search, push, dashboard are later phases. Saved views for search pages/dashboard stay deferred (REQUIREMENTS.md Future Requirements).

</domain>

<decisions>
## Implementation Decisions

### VIEW-03 — General Access granularity
- **D-01:** Granularity is a **workspace default visibility + the existing per-project private/public binary**. No third "workspace-read" state, no per-project-type defaults. The roadmap's minimum bar is exactly what ships. — **Reversibility:** one-way — adding a third access state later requires migrating the `p.private` boolean that `server.js`'s whole visibility funnel (D-49 sweep) branches on, plus redaction-funnel changes.
- **D-02:** The default is a **single owner-only workspace setting**; existing projects are untouched (no retro-apply, no bulk action) and member permission semantics are unchanged (no owner-locked toggle).
- **D-03:** Storage: a **doc prefs field** (e.g. `prefs.defaultPrivate`) normalized in `mergeClientDoc` like existing workspace prefs. Not a new server row — it is workspace-level, not per-user, so the Phase 34 rows precedent does not apply.
- **D-04:** UI: the setting lives in the existing workspace settings (owner section); the per-project Access tab gains an **informational hint line** showing the workspace default. No "use default" action; new-project creation reads the pref to set the initial `p.private`.

### VIEW-01/VIEW-02 — Storage ruling (conflict resolved)
- **D-05:** **Server rows for BOTH saved views and column show/hide**: a `saved_views` table keyed `(workspace_id, user_id, key, name)` with blob + `schema_version`. This follows the roadmap's owner decision and the Phase 34 precedent (per-user, structurally indexed state = rows, never doc blobs). `.planning/research/ARCHITECTURE.md` §5's "doc state, no server rows" verdict is **superseded and must be corrected** — researcher/planner must not follow it. — **Reversibility:** one-way — doc.views is stripped from the doc and blobs move to per-user rows; going back means re-materializing doc state and a migration.
- **D-06:** Migration: **boot one-pass sweep** (the `migrateTotpReWrap` pattern) copies each workspace's existing `doc.views` snapshots into `saved_views` rows **attributed to the workspace owner** (doc.views carries no author), then `doc.views` is **stripped from the doc forever** — notifPrefs-style load-time strip + `docSnapshot` guard so it can never ride a save back.
- **D-07:** Sync: **dedicated REST routes** (`GET/PUT/DELETE` under `/api/workspaces/:slug/views` or equivalent per-route shape), blobs normalized server-side, mirroring the `user_notif_prefs` route style. View saves are **not** coupled to doc revisions — a view save cannot trigger a 409 against a concurrent doc save. Rows hydrate at boot alongside the doc.
- **D-08:** Demo/offline mode: per-user views/columns live in the **per-workspace localStorage key, exactly the notifPrefs pattern** (Phase 34 D-01). Local mode never calls the routes.

### Saved views shape & sharing
- **D-09:** Views are **personal only** — they belong to their creator; no sharing, no team views. Sharing would be a new capability (deferred).
- **D-10:** Named views apply to the **tasks table (project view) and my-tasks table** — the two `viewOf()` consumers. Projects/members tables get column show/hide state only, no named views.
- **D-11:** A saved view captures a **full `viewOf()` snapshot**: filters + columns (hidden set + widths `colW`) + sort + group + showDone — everything except the transient free-text `q`. Applying a view replaces the whole live view state.
- **D-12:** Guardrails: names **unique per member per table key** (case-insensitive); **≤20 views per member per table**, blob **≤2 kB**; overwriting a same-named view requires explicit confirm; every blob carries `schema_version` for the lenient-load criterion (unknown fields intersected away, no hard failure).

### Default columns & first run
- **D-13:** First-run/empty state = the **current hardcoded `viewOf()` defaults** (hidden: start/created/deps, group status, sort manual, showDone true). No owner-set default columns — VIEW-03 scopes owner configuration to visibility only.
- **D-14:** "Reset columns" = **delete the member's row** so defaults return; deleting a saved view removes its row. No bulk "delete all my views" action.
- **D-15:** UI: a **saved-views dropdown/popover near the existing toolbar** (beside the cols popover): list of the member's views, Save current…, Update, delete icons. Applying replaces live state instantly; live edits stay live — **saving is always explicit**, no autosave of live state.

### the agent's Discretion
- Exact route paths/payload shapes for the views API (constraint: dedicated routes, server-side normalization, Phase 34 route style)
- `saved_views` table DDL details and adapter seam shape (both SQLite/Postgres backends must pass the same suite, per the DBA-01..04 contract style)
- Saved-views popover placement/visual design (reuse existing popover patterns)
- Lenient-load intersection mechanics (which fields are whitelisted per schema_version)
- Where the boot sweep lives in server.js's migration sequence
- i18n keys for all new UI strings (en + fr catalogues; gate must stay green)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition & requirements
- `.planning/ROADMAP.md` §Phase 57 — goal, requirements VIEW-01/02/03, success criteria (incl. the owner decision: views land in server `saved_views` table)
- `.planning/REQUIREMENTS.md` §Views & Columns + Future Requirements (saved views for search/dashboard explicitly deferred)

### Research (v2.2 milestone research — read with D-05 caveat)
- `.planning/research/ARCHITECTURE.md` — §5 saved-views verdict is **SUPERSEDED by D-05** (server rows won); its §"Recommended Architecture" precedents table (Phase 34 rows rule, doc-PUT funnel) and the boot-sweep pattern (`migrateTotpReWrap`-style) still govern
- `.planning/research/PITFALLS.md` — notifPrefs doc-strip pitfall (the exact failure mode D-06's strip + docSnapshot guard prevents)
- `.planning/research/FEATURES.md` §6 + Linear/GitHub Projects comparisons — UX reference for saved views and per-user column persistence

### Existing implementation touchpoints
- `src/shell/view-engine.js` — `viewOf()` (hardcoded defaults D-13 preserves), `FIELDS` filter definitions (the snapshot shape D-11 captures)
- `src/views/table.js` — `TCOLS` definitions, `v.hidden` column filtering, per-table keys
- `src/overlays/popovers.js` — `cols` popover (visible-columns checkboxes, `toggleCol2`/`resetCols` actions) — the UI D-15 extends
- `src/actions/actions.js` — `toggleCol2` (~line 1378) view-state mutation site
- `src/core/store.js` — `docSnapshot()` (~line 160) must never carry the new per-user state; `S.views = doc.views` hydration (~line 308) is the field D-06 strips; notifPrefs per-workspace localStorage pattern (D-08)
- `src/core/prefs.js` — pref-value helpers; `prefs.defaultPrivate` (D-03) joins this family
- `server.js` — `p.private` visibility funnel (D-49 sweep, ~line 858), `user_notif_prefs` table + routes (~lines 384, 4097) as the rows precedent, `docFromClient`/`mergeClientDoc` normalization (D-03/D-06 strips), boot migration sequence (D-06 sweep)
- `src/overlays/modals.js` ~line 317 — the existing General Access section in the project modal (D-04 hint line location)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `user_notif_prefs` table + routes + boot hydration (server.js) — the complete Phase 34 template for per-user rows: create-table, dedicated routes, canonical merge, localStorage mirror for demo mode
- `viewOf()` / `S.views` — the entire view-state shape already exists client-side; this phase changes where it persists, not its contents
- `cols` popover in `popovers.js` — visible-columns UI exists; per-user persistence is a data-source swap
- Workspace settings UI (owner section) — home for the D-03 default-visibility toggle

### Established Patterns
- Phase 34 precedent: per-user, structurally indexed state in rows; doc strips legacy fields at load + `docSnapshot` guard at save (Pitfall 3)
- Boot one-pass migration sweep (`migrateTotpReWrap` style) — idempotent convergence at startup
- Fail-closed normalization in `mergeClientDoc` — new prefs field joins with validation
- All UI strings via `t()`; i18n gate (scripts/i18n-scan.mjs) must stay green for en+fr

### Integration Points
- `doc.views` hydration path in `store.js` (S.views ← doc.views) — replaced by per-user row hydration
- `toggleCol2` / `resetCols` / `sortBy` actions — write sites now target per-user state
- New-project creation — reads `prefs.defaultPrivate` for initial `p.private`
- Project modal Access tab — hint line showing workspace default
- Boot sequence in server.js — saved_views migration sweep + row hydration endpoint

</code_context>

<specifics>
## Specific Ideas

- The storage conflict was surfaced and ruled explicitly: the roadmap's owner decision (server `saved_views` table) governs; research ARCHITECTURE.md §5 ("doc state") is wrong for this phase and must not be followed by the researcher/planner.
- Column show/hide is deliberately included in the rows ruling (D-05) — one mechanism for both VIEW-01 and VIEW-02, no split-brain.
- "Applying a view replaces the whole live state; live edits never autosave into a named view" — explicit-save semantics, chosen to match how Linear/GitHub Projects behave and to keep writes testable.
- Migration attribution caveat acknowledged: doc.views has no author, so owner attribution is a best-effort starting point, accepted by the owner.

</specifics>

<deferred>
## Deferred Ideas

- Sharing saved views with the workspace / team views — new capability beyond personal views; revisit if demand appears
- Third General Access state ("workspace members can read") — explicitly rejected for this phase; would be its own phase with visibility-funnel migration
- Owner-locked visibility toggle (members cannot flip visibility on projects they manage) — permission-model change, out of scope
- Saved views for search pages and dashboard drill-downs — already deferred in REQUIREMENTS.md (one shared primitive, later)
- Owner-set default hidden columns per workspace — beyond VIEW-03's visibility scope
- Bulk "delete all my views" destructive action — not needed for the 20-view cap to be livable

</deferred>

---

*Phase: 57-views-columns-general-access*
*Context gathered: 2026-11-12*
