# Phase 102: Mappings SPA — Entra ID Mappings Page - Context

**Gathered:** 2026-11-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Client-side operator page for Entra group → workspace mappings, consuming the Phase 101 backend (GET list with hints, POST create, DELETE by id) plus the untouched `/api/auth/operator/dead-mappings` route. Deliverables: lazy SPA route + nav entry gated on `oidcEnabled` (cosmetic; server 403 is the real gate), always-visible create form (GUID paste canonicalizing, label ≤200 esc()d, workspace picker, role picker), flat list with badges + count chip hints, staged inline-confirm delete with honest copy, dead-mappings card strictly moved from Governance. NO new backend routes, NO schema change, NO Graph, NO instance-role mappings.

</domain>

<decisions>
## Implementation Decisions

### Page layout & hints
- **D-01:** Create form is **always visible** — compact panel at the top of the page, list below; no reveal-on-add button. Matches the governance lead style (searching = adding precedent).
- **D-02:** Row hints render as **badges + count chip**: dead rows get an amber badge (`deadReason` → "workspace archived" / "workspace deleted", ×5 locales), and every row carries a faint `liveMembers` count chip (e.g. "12 via group"). Quieter variant rejected — the owner chose the informative list.
- **D-03:** Form fields: GUID paste (canonicalized client-side before submit via the groups.js canonicalization port or identical client logic), label ≤200 chars esc()d at every render, workspace picker fed by `GET /api/auth/operator/workspaces`, role picker owner/admin/member.

### Delete interaction
- **D-04:** **Staged inline-confirm** (two-click, D-90 revoke pattern): click delete → button stages as "Confirm delete?" with the lazy-revocation copy surfaced at the row → click again to fire. NO modal.
- **D-05:** Copy = **verbatim SC sentence + mechanism**: "Members mapped through this group will lose access at their next Microsoft sign-in." plus a hint that the SSO login reconcile handles removal. The ROADMAP SC-3 sentence ("members will lose access at their next Microsoft sign-in") must appear verbatim in the localized copy (×5).

### Card migration
- **D-06:** **Strict move**: the dead-mappings warning card (govDeadCard: orphans + guard-refused trail) renders ONLY on the Mappings page (below the list); Governance loses it entirely. Same data source (`/api/auth/operator/dead-mappings`), same display-only discipline, same 8-entry trail bound, same FIRST-colon split logic.
- **D-07:** **Card content stays as-is** — orphans (workspaces missing entirely; NOT duplicated by the GET's dead-row hints, which join against existing workspaces) + guard trail; existing localized keys unchanged; zero new card keys. The card and the row hints are complementary surfaces, not duplicates.

### Toasts, validation & states
- **D-08:** **Light client pre-checks** that flag before submit: GUID shape sanity after canonicalization (8-4-4-4-12 or 32-hex) and non-empty label; messages reuse existing server refusal keys where they exist (e.g. `groupGuidInvalid` if present — planner verifies key inventory; one new key only if nothing fits). Full server mirroring rejected (drift risk).
- **D-09:** **Every server refusal** renders as a keyed localized error toast (403 operatorOnly, 400 groupMappingDuplicate / groupGuidInvalid / roleToken, 404 notFound on delete, 429 tooManyAttempts) — no raw err text.
- **D-10:** **Empty list = quiet hint** — a "no mappings yet" lead pointing at the create form above; house empty-state style. No guided-setup lecture in v1.

### the agent's Discretion
- Exact CSS/class reuse (house `sblock`/`panel`/`srow`/`badge` patterns from governance.js).
- Client-side GUID canonicalization implementation (port of canonicalizeGuid vs re-deriving; planner picks, must accept {braced}/no-hyphen/uppercase identically).
- State slot naming in S.ui and action wiring shape (A.* handlers), following governance.js conventions.
- Loading state treatment (house convention) — not discussed.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 101 backend (the API this page consumes)
- `server.js` GET `/api/governance/group-mappings` (:9035) — payload shape: flat rows, id/groupGuid/workspaceId/workspaceName/workspaceSlug/role/kind/label/createdAt/updatedAt/dead/deadReason/liveMembers
- `server.js` DELETE `/api/governance/group-mappings/:id` (:9081 region) — 200 {deleted:true}, refusal keys notFound/tooManyAttempts
- `server.js` POST sibling (:8962) — refusal keys the form must toast (groupMappingDuplicate etc.)
- `test/group-mappings-api.test.mjs` — exact refusal-code inventory + payload field names

### UI patterns to copy verbatim
- `src/pages/governance.js` — the closest analog: page skeleton (S.ui state slots, A.* handlers, esc discipline), `govDeadCard` (:381) — the card being moved (first-colon split, 8-entry bound), D-90 staged inline-confirm pattern (:158-188)
- `src/shell/layout.js` — Instance nav group (:196-201) + governance route registration (:68-74): where the `mappings` route + nav entry slot in
- `src/core/render.js` — ROUTE_IDS lazy registration (:68 area)
- `src/core/api.js` — `oidcEnabled` getter (:154) for the nav gate; operator workspaces listing (:416)

### Milestone docs
- `.planning/REQUIREMENTS.md` — MAPUI-01..04 verbatim + rulings R-2/R-3
- `.planning/phases/101-mappings-backend-routes-funnels/101-CONTEXT.md` — backend decisions D-05/D-06 (structured hints) and D-07/D-08 (coexisting routes, opaque id) that this UI consumes
- `.planning/research/FEATURES.md` + PITFALLS.md — label-XSS re-render watch-item, delete-copy semantics

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `govDeadCard` (governance.js:381) — moves wholesale to the new page (state slot `S.ui.govDead` + loader ride along or re-name; route untouched)
- D-90 staged inline-confirm (governance.js Super Admins revoke) — the delete interaction template
- House form pattern (govEditBody) — label/input/field markup with esc()d values
- `api.oidcEnabled` getter — the nav gate reads server ground truth, no new endpoint
- Toast infra with keyed localized messages (t() + err keys) — refusal rendering

### Established Patterns
- Lazy route: render.js ROUTE_IDS + layout.js nav `sItem(...)` behind a flag — governance is the template
- Operator-gated pages: nav hidden for non-operators but the server 403 fullstate is the real gate (D-11 doctrine)
- ×5 locales same-commit for every new key (nav label, form labels, dead badges, delete copy, empty state)
- esc() at every render — label is a stored-XSS watch-item; re-render paths (poll, locale switch, delete repaint) must all pass through the same template

### Integration Points
- Nav: `src/shell/layout.js` Instance group — new entry conditioned on `api.oidcEnabled` (in addition to `api.user?.isInstanceAdmin` house condition)
- Route: `mappings` lazy chunk added to the chunk-gate manifest if one exists (500 kB gate standing)
- Governance: govDeadCard + its loader removed from governance.js; keys `page.governance.dead*` — planner decides move-keys-to-new-namespace vs reuse (either is fine; ×5 in same commit)

</code_context>

<specifics>
## Specific Ideas

- Delete copy carries the verbatim SC-3 sentence — verifier will grep for "next Microsoft sign-in" in the ×5 locale files.
- Row id used by delete = the opaque row `id` from the GET payload (Phase 101 D-08) — never GUID+workspace composite.
- `liveMembers` chip text pattern: localized "N via group" — needs one new key with a number placeholder (×5).
- Dead badge text per deadReason: 'workspace-archived' → "workspace archived", 'workspace-deleted' → "workspace deleted" — two keys (×5).
- The create form must disable/flag submit on light pre-check failure (D-08) but still let the server be the funnel of record.

</specifics>

<deferred>
## Deferred Ideas

- Merging the dead card into row hints (D-07 ruled keep-as-is; revisit if the dual surface confuses).
- Guided-setup empty state (D-10 ruled quiet hint; educational content could become a docs link later).
- Full client mirror of server validation rules (D-08 ruled light).
- Edit-in-place (PATCH) — backend ruled delete+recreate in Phase 101 D-12; UI chains delete + prefill-create if ever wanted (NOT in this phase unless trivially free).
- Sort/filter controls on the list (created_at desc is the fixed Phase 101 order).

</deferred>

---

*Phase: 102-Mappings SPA — Entra ID Mappings Page*
*Context gathered: 2026-11-27*
