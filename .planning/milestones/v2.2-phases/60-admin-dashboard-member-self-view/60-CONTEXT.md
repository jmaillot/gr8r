# Phase 60: Admin Dashboard & Member Self-View - Context

**Gathered:** 2026-11-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Two deliverables on existing data: (1) DASH-01..04 — an admin-only workspace dashboard at its own route showing overdue tasks grouped per project, workload per member (counting `assignees[]` per member), tasks due within 7 days, and recent workspace activity — with full private-project content in the aggregates (power-admin ruling, 2026-11-12) and a server-side 403 for non-admins; (2) TRN-01/02 — every member can open their own redacted access picture (reachable projects with reason codes, cross-member grants without names), the self-scope of the Phase 52 admin transparency view. No NOTIF-TRIM (Phase 61), no new notification types, no export, no cross-member named grants for non-admins (TRN-03 stays a future requirement).

</domain>

<decisions>
## Implementation Decisions

### Dashboard placement & shape
- **D-01:** The dashboard is a **dedicated admin-only page at its own route** (e.g. `/w/:slug/dashboard` or equivalent SPA route), with a separate sidebar nav entry visible to admins only. Client nav gating is UX only; the server gate is the control (D-52-4 convention).
- **D-02:** Layout = **four panels on a single screen, no tabs**: Overdue per project, Load per member, Upcoming (7 days), Recent activity. One glance = the honest overview.
- **D-03:** Loading = **skeleton panels then fill** as the aggregate payload arrives — no full-page blank spinner, no stale-while-revalidate machinery.

### Data & freshness
- **D-04:** **One admin-gated aggregate endpoint** (e.g. `GET /api/workspaces/:slug/dashboard` shape or equivalent) returns overdue + load + upcoming + activity in a single payload, computed **server-side over full private-project data** (DASH-04: the redacted client doc cannot see private projects; the 403 gate lives in one place). — **Reversibility:** reversible — new read-only route; no data model change.
- **D-05:** Freshness = **fetch on load + interval poll while the tab is open**, aligned with the existing 30 s notification poll rhythm.
- **D-06:** Windows: **Overdue fixed by definition** (dueDate < today and not done); **Upcoming fixed** at today..+7 days; **Activity panel has an adjustable preset window — 24 h / 7 d / 30 d, default 7 d** (a preset selector, not a date-range picker; the selector parameter is sent to the server endpoint on refetch).

### Workload & drill-down
- **D-07:** **Load = open (incomplete) tasks only**, each member counted once per task they appear in `assignees[]` (SC2 semantics: shared task = +1 per member). Done tasks never inflate load.
- **D-08:** **Overdue panel shows clickable task rows grouped by project; Load panel stays pure numbers** (a small overdue badge per member is permitted if cheap). No expandable member rows this phase.
- **D-09:** **Deep-link everything**: overdue/upcoming task rows use the existing `/w/:slug/task/:key` drawer path; project group headers link to the project; activity entries link to their task/project.
- **D-10:** Sorting = **most-urgent first**: overdue groups by oldest dueDate with tasks within by dueDate; load by count descending; upcoming by dueDate ascending.

### Member self-view UX (TRN-01/02)
- **D-11:** The member self-view lives as a **section in Settings** (e.g. Settings › My access) — reachable by any member including admins; no separate member route or nav entry.
- **D-12:** Reason codes **reuse the Phase 52 vocabulary verbatim** (private+invite, team link with team name, non-private, per-person/per-team grant → 'member') with the existing i18n labels — one vocabulary across the admin transparency view and the self-view.
- **D-13:** A per-person grant **from another member** shows as the grant type ("individual grant") **without the granter's name**. Team links show the team name (the member's own roster info is not other members' access rows). TRN-02's byte-level shape tests assert no other member's identity appears in the self-view payload.
- **D-14:** Presentation = **flat list of reachable projects**, each row project name/icon + one reason label — the same visual language as the Phase 52 admin transparency output, self-scoped.

### the agent's Discretion
- Exact route paths and payload shapes (dashboard endpoint and the self-view endpoint), within the dedicated-admin-route / Phase 52 route style
- Where the self-view endpoint lives (new `/api/me/...` shape vs workspace-scoped self variant) — constraint: same funnel (`memberCanReadProject` + `projectAccessReason`), admin 403 on the dashboard route, self-view allowed for any workspace member
- Skeleton/panel markup and CSS (reuse existing panel/empty-state patterns)
- Poll mechanics (timer lifecycle, cleanup on route exit) within D-05
- i18n keys for all new UI strings (en + fr catalogues; i18n gate stays green)
- How activity entries render verbs/dates (reuse the existing activity rendering rules from Phase 9)
- Whether the load panel's overdue badge is worth the payload (D-08 permits either)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition & requirements
- `.planning/ROADMAP.md` §Phase 60 — goal, DASH-01..04, TRN-01/02, success criteria (incl. the power-admin ruling: admins see full private-project content; members 403)
- `.planning/REQUIREMENTS.md` §Admin Dashboard + §Transparency Self-View — requirement wording; §Future Requirements (TRN-03 explicitly deferred)

### Prior-phase decisions that bind here
- `.planning/phases/52-*` records via PROJECT.md — Phase 52 transparency view: D-52-4 (server gate is the control, client gating is UX only), `projectAccessReason` label helper mirroring the funnel's short-circuit order, T-52-03 (team lists never member rosters in reason output)
- `server.js` — `memberCanReadProject` (~line 949), `projectAccessReason` (~line 976), the Phase 52 admin transparency route (~line 6095) computing through the ONE funnel, never from the redacted doc; `requireWorkspace` role gates; doc `data.activity` rows (machine verbs, Phase 9 render rules)
- `.planning/phases/57-views-columns-general-access/57-CONTEXT.md` — general-access model context (private/public binary + workspace default) the reason codes explain
- `.planning/phases/56-delivery-infrastructure/56-CONTEXT.md` — DELIV-02 chunk budget: a dashboard page is a lazy-loaded route surface, keep it out of the entry chunk

### Existing implementation touchpoints
- `src/pages/members.js` — Phase 52 admin/owner transparency expander (line ~67): the visual language D-14 reuses
- `src/pages/settings.js` — the Settings surface hosting the D-11 self-view section (extend the existing tab/section pattern, cf. notif-push case)
- `src/shell/render.js` — route registration + sidebar nav entries (overview: 'layout-dashboard' icon exists) — D-01's admin-only nav entry lands here
- `src/core/api.js` — API client patterns for the new endpoints
- `src/core/store.js` / doc `data.activity` — activity rows the endpoint aggregates
- Multi-assignee `assignees[]` arrays (v2.1) — the field D-07's per-member counting reads

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `projectAccessReason(p, memberId, memberTeams)` (server.js ~976) — pure reason-code helper; the self-view endpoint composes it for the CALLING member instead of a target member
- Phase 52 transparency route (~6095) — the exact computation template: funnel-driven list of `{id, name, reason}` entries; the self-view is the same code scoped to self, minus identity exposure
- `memberCanReadProject` funnel (~949) — the single access truth; never re-derive visibility
- Transparency expander UI in `members.js` — row markup for project+reason lists (D-14)
- Existing panel/section CSS + `t()` i18n layer — panel markup and EN+FR strings
- Activity rendering rules (Phase 9/ACT-01) — machine verbs classified and localized at render

### Established Patterns
- Server gate is the control; client gating is UX only (D-52-4) — dashboard 403 and nav hiding both follow
- Keyed 404-style gates on admin routes (Phase 52 route style) — the dashboard endpoint gate follows suit
- Dedicated REST routes with server-side normalization (Phase 57 D-07 style)
- i18n gate (`scripts/i18n-scan.mjs`) must stay green — every new string catalogued EN+FR
- Chunk discipline (Phase 56): dashboard page is a dynamic-import route, not entry-chunk weight

### Integration Points
- New aggregate endpoint in `server.js` beside the Phase 52 transparency route — computes over the full doc (admin context bypasses redaction intentionally per DASH-04)
- New self-view endpoint — same funnel, caller-scoped
- `src/shell/render.js` — dashboard route + admin-only nav entry
- `src/pages/settings.js` — new self-view section
- Sidebar nav — new icon/label via existing nav-entry pattern

</code_context>

<specifics>
## Specific Ideas

- The power-admin ruling is on record (2026-11-12): for this one aggregate, admins see FULL private-project content — it deliberately overrides the redaction funnel, but ONLY server-side inside the admin-gated endpoint. Nothing private may reach a non-admin payload (DASH-04 403 + TRN-02 shape tests are the proof).
- The self-view is explicitly the "redacted self-scope" of the Phase 52 view (TRN-01 wording): same computation, same codes, zero other-member identity in the payload — byte-level shape tests per role are the acceptance bar (SC5).
- "One honest workspace overview" — the four-panel single screen with deep links is the product intent; resist dashboard feature creep.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (TRN-03 named cross-member grant explanations for owners is already a REQUIREMENTS.md future requirement; NOTIF-TRIM is Phase 61.)

</deferred>

---

*Phase: 60-Admin Dashboard & Member Self-View*
*Context gathered: 2026-11-13*
