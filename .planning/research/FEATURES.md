# Feature Research

**Domain:** Project-management workspace UI/UX (v2.1 Member & Project Experience)
**Researched:** 2026-11-09
**Confidence:** HIGH (established, multi-year-stable conventions in Asana, Linear, Notion, Monday, ClickUp; verified against Linear docs where engines allowed — search infra partially degraded, see Sources)

## Feature Landscape

Scope: the five v2.1 feature areas — invite-with-project-assignment, searchable member pickers, unified project settings (General vs Access), projects table columns, single Share button.

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Invite with project assignment (chips below team/role selection)** | In every modern PM tool the invite is a single atomic flow: email + role + where-they-land. Asana's invite dialog attaches team/project; Monday's invite board picker assigns the board inline; Notion's invite has "add to teams/spaces". Nobody forces a second trip after invite. | LOW | Builds directly on existing team chip picker (`modals.js:293-344`). Chips below Team selection match the vertical order users expect: identity → role → scope. Guest = exactly one project should *enforce* single-select (checking a chip clears others for guests) — that's the pattern in Monday's guest flow (guest bound to one board). |
| **Draft persists across role/team changes** | Users edit role and chips iteratively; losing typed email drafts mid-flow is a known annoyance universally fixed by uncontrolled state or model binding. All five tools keep the draft while toggling options. | LOW | This is the `data-in` state-binding fix — a bug fix dressed as a feature. Table stakes because it's invisible when present, glaring when broken. |
| **Searchable member picker** | Notion's member selector, Linear's assignee box and Asana's people field all filter-as-you-type, accent-insensitively, with keyboard nav. Below ~15 members users still expect search once they've felt it once. | LOW | gr8r already has the `foldForSearch` pattern — reuse. Accent-insensitive match is already an i18n decision (D-12-era). Debounce not needed (client-side list). |
| **Multi-team wording (no single "primary team" hint)** | Every tool that supports multi-team membership (Asana teams, ClickUp spaces, Notion teamspaces) speaks plural everywhere. A "primary team" hint contradicts the live `p.teams[]` model shipped in v2.0 and reads as a bug. | LOW | Copy change + i18n keys EN/FR. |
| **Unified project settings: General section** | Asana project details, Linear project settings and Monday board settings all open ONE modal/panel where name/description/icon/color/owner/dates are edited together. Splitting "rename" from "share" into two entry points is the anti-pattern v2.1 removes. | MEDIUM | Replaces projectModal + share modal (M-12). Same modal from Workspace > Projects and project page — matches Asana (project → ⋯ → Settings is identical from list or board). |
| **Access section: teams + individuals + general access in one place** | Notion Share panel = teams/spaces + individual people + "Everyone at workspace" general access with a permission dropdown each. Notion popularized this triple; Linear's project sharing and Asana's Make public/Workspace-visible mirror it. Users now *expect* all access knobs in one panel. | MEDIUM | gr8r already has all three concepts (p.teams, per-person PERMS, private/public general toggle) — this is UI consolidation, no new model. Per-team perms dropdown (view/comment/edit/full) mirrors Notion's per-space "Everyone can…" selector. |
| **Permission dropdown with view/comment/edit/full levels** | The 3–4 level ladder is universal: Asana Can comment/Can edit, Notion Can view/Can comment/Can edit/All access, ClickUp view/comment/edit/full. M-09 reusing the existing per-person ladder for teams is exactly the industry shape. | LOW | Server model exists; UI is a `<select>`-style dropdown per team row. |
| **Projects table: Lead column** | Every PM overview table has an owner column (Monday "Owner", Asana "Project owner", ClickUp list owner). Avatar + name, hover for card. | LOW | Data exists (`p.lead`, lead-on-create shipped in v2.0/51). Render avatar cell. |
| **Projects table: Teams column** | Multi-team tools show team chips in the projects overview (Monday board→group chips, ClickUp space chips). With live `p.teams` this is read-only rendering. | LOW | Chips, capped with "+N" overflow. |
| **Projects table: Members count** | Asana and Monday show member count or avatar stacks on portfolio/overview tables. Count-with-tooltip (expand to names) is the light version; full avatar stack is heavier. | LOW | Count + title tooltip is enough; avatar stack duplicates what the single Share button removes — keep it count-based to honor the dedup goal. |
| **Projects table: Status pill + progress** | Status pill is table stakes (PSTAT already shipped). Task-based progress bar next to the pill matches Monday's progress column and ClickUp's % complete — users expect *both* a categorical status and a computed % when tasks exist. | LOW | `progressOf` exists. Render pill + thin progress bar; hide bar when project has no tasks (never show 0% as meaningful). |
| **Projects table: Target date column** | Due/target date is expected on any projects overview (Monday dates, Asana due dates, ClickUp start/due). Past-due dates get red emphasis universally. | LOW | `p.due` exists (M-11). Localized date via existing `dateFmt`. |
| **One Share button on the project page** | Since v2.1 merges settings+share, ONE labeled Share button (opening the Access tab of the unified modal) is the Notion/Linear shape. Two competing affordances (user+ icon AND avatar stack AND Share) is the current bug. | LOW | M-13: keep the labeled one, remove duplicates. Straight removal + e2e updates. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Guest = exactly one project, enforced in the invite UI** | Most tools *permit* misconfigured guests and clean up later; making the UI structurally enforce the invariant (single-select chips for guests, with explanatory copy) is a self-documenting permissions story. Rare polish for a self-hosted tool. | LOW | Conditional chip behavior in the existing picker. Cheap because v2.0 already built the model. |
| **Per-team permission dropdowns on projects (not just per-person)** | Notion does this for teamspaces; Monday and Asana largely don't (team-level access is binary there). Giving teams the full view/comment/edit/full ladder in a self-hosted tool is genuinely above the median. | MEDIUM | M-09 model decision already made; this is the UI making it visible. The differentiator is the *ladder on teams*, which Asana/Monday lack. |
| **Live team→project links surfaced in settings** | "Join team → gains access" shown honestly in the Access tab (e.g. a "this team follows its roster live" hint) beats the snapshot model competitors use — users see *why* access changes. | LOW | One hint line reusing the transparency reason labels from v2.0 Phase 52. |
| **Settings modal identical from every surface** | Linear and Asana render the same settings panel from list and project view. Consistency here (Workspace > Projects and project page share one modal) is a quality signal that compounds as surfaces grow. | LOW | Falls out of the unified modal (M-12) if built as one component from the start. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Avatar stacks in the projects table** | Looks lively; some tools have it. | Duplicates the members concept that the new Members-count column covers, visual noise in a dense table, and it's precisely one of the duplicate affordances v2.1 removes (M-13 spirit applied to the table). | Count + tooltip of names. |
| **Separate "Share…" quick-action distinct from Settings** | Fast path muscle memory from Google Docs. | After unification there are no *different* contents to show — a second modal means two code paths that drift (the exact drift this milestone fixes). | One Share button that opens the unified modal pre-selected on the Access tab. |
| **Per-team perms differing from per-person ladder (e.g. team = binary in/out)** | Simpler to render. | Splits the mental model in two; M-09 explicitly rejects it, and users who learn "view/comment/edit/full" once expect it everywhere. | Same 4-level ladder for people and teams. |
| **Full inline member management inside the projects table (remove/add per row)** | Power-user appeal. | Table cells become modal-in-modal; every major tool keeps row actions to navigate-to-settings. | Row click → unified settings modal (Access tab). |
| **Searchable members box everywhere at once (invite, share, settings, table filters)** | Consistency temptation. | Milestone scope is Edit Team only; spray-finding every picker inflates the phase and risks regressions in flows covered by e2e. | Ship Edit Team; note other pickers as a v2.2 polish batch after the pattern proves out. |
| **Invite modal projects multi-select with inherited perms per project** | Feels useful. | During invite you don't yet know what perms make sense per project; per-project perm editing belongs in the unified settings modal. | Invite assigns membership; perms editable later in the Access tab (matches "everything editable post-invite" M-02). |

## Feature Dependencies

```
[data-in invite state fix]
    └──enables──> [Invite projects chips] (chips must survive role/team changes)

[Invite projects chips]
    └──requires──> [guest single-project enforcement] (same chip component, guest branch)

[Unified settings modal — General]
    └──requires──> projectModal data model (exists: desc/icon/color/lead/due)

[Unified settings modal — Access]
    └──requires──> per-person PERMS (exists), p.teams (exists), private/public toggle (exists)
    └──absorbs──> [Share modal Teams section + per-person perms] (modals.js:202-289)
    └──absorbs──> [projectModal] (modals.js:156-194)

[Single Share button] ──requires──> [Unified settings modal] (button opens its Access tab)
    └──conflicts──> [user+ icon / avatar-stack duplicates] (must be removed, not kept)

[Searchable members box]
    └──requires──> foldForSearch pattern (exists)

[Table: Lead] ──requires──> p.lead (exists)
[Table: Teams] ──requires──> p.teams live links (exists)
[Table: Status+progress] ──requires──> PSTAT pills (exists) + progressOf (exists)
[Table: Target date] ──requires──> p.due (exists)

[Per-team perm dropdowns in Access]
    └──requires──> M-09 perm model decision (made); server accept of team-level perm values
```

### Dependency Notes

- **Unified modal is the keystone.** The Share button, the Access section, the removal of two duplicate affordances, and identical-from-every-surface all hang off it. It should be its own phase (or the anchor of one).
- **Invite chips depend on the `data-in` fix.** Chips whose selection evaporates on a role change would be a regression; fix the binding first in the same phase.
- **Everything else reuses existing models.** Table columns and searchable members consume shipped data (`p.lead`, `p.teams`, `progressOf`, `foldForSearch`) — they are LOW-complexity render work and can batch into one "surfaces" phase.
- **Per-team perms = the only genuinely new UI+server surface.** Same ladder, but team-grant semantics need tests through the existing permission funnel (mirror of per-person paths).

## MVP Definition

### Launch With (v1 — this milestone)

- [ ] `data-in` invite state fix + projects chips + guest single-select — core everyday flow, depends on nothing
- [ ] Unified project settings modal (General + Access) — keystone; absorbs projectModal and share modal
- [ ] Single Share button (remove duplicates) — immediate payoff of the unified modal
- [ ] Searchable members box in Edit Team + multi-team wording — cheap, self-contained
- [ ] Projects table columns (Lead / Teams / Members count / Status+progress / Target date) — all read-only rendering of existing data
- [ ] Per-team perm dropdowns in Access tab — the one new surface, M-09 model already decided

### Add After Validation (v1.x)

- [ ] "Live roster" hint in the Access tab — nice transparency polish, after modal is stable
- [ ] Roll the searchable pattern into other pickers (invite cc, task assignee filters) — after Edit Team version proves out in UAT
- [ ] Past-due red emphasis on the Target date column — trivial, but needs a date-status convention decision

### Future Consideration (v2+)

- [ ] Member-count column expanding to a per-project member drawer — table stays light first
- [ ] General Access granularity beyond private/public (e.g. "can comment workspace-wide") — needs a product decision, not just UI
- [ ] Column show/hide + saved table views — table metadata, a separate milestone's scope

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Invite state fix + projects chips + guest single-select | HIGH | LOW | P1 |
| Unified settings modal (General + Access) | HIGH | MEDIUM | P1 |
| Single Share button (dedup) | MEDIUM | LOW | P1 |
| Per-team perm dropdowns | HIGH | MEDIUM | P1 |
| Searchable members box (Edit Team) | MEDIUM | LOW | P2 |
| Projects table columns (all) | MEDIUM | LOW | P2 |
| Multi-team wording fix | LOW | LOW | P2 |
| Live-roster hint in Access tab | LOW | LOW | P3 |

## Competitor Feature Analysis

| Feature | Asana | Linear | Notion | Monday | ClickUp | gr8r v2.1 plan |
|---------|-------|--------|--------|--------|---------|----------------|
| Invite assigns project inline | Yes (team/project at invite) | Partial (team at invite) | Yes (teams/spaces) | Yes (board picker) | Yes (space/list) | Chips below team selection, guest constrained to one |
| Searchable member picker | Yes | Yes | Yes | Yes | Yes | Reuse `foldForSearch` in Edit Team |
| Unified settings (General+Access) | Yes (project settings) | Yes (project settings panel) | Yes (Share + Settings; Share = Access) | Yes (board settings) | Yes (list settings) | One modal, Access tab reachable via Share button |
| Per-team permission ladder | No (team access binary) | Partial (team defaults) | Yes (teamspace perms) | No (board guests binary) | Partial (space defaults) | Yes — 4-level ladder per team (differentiator) |
| General access toggle | Yes (public/workspace) | Yes (private vs workspace) | Yes ("Everyone at workspace") | Yes (view boards) | Yes (make public) | Existing private/public toggle in Access tab |
| Overview table: lead/owner | Yes | Yes | — | Yes | Yes | Lead column |
| Overview table: teams | Yes (team chips) | Yes | — | Yes | Yes | Teams chips, +N overflow |
| Overview table: members | Avatar stack or count | Count | — | Avatar stack | Count | Count + tooltip (avoid avatar-stack noise) |
| Overview table: status+progress | Yes (status + % complete) | Yes (status) | — | Yes (status label) | Yes (% complete) | PSTAT pill + task-based `progressOf` bar |
| Overview table: due date | Yes | Yes | — | Yes | Yes | `p.due` with existing dateFmt |
| One Share entry point | Multiple historically, converged to one panel | One | One Share panel | One | One | Labeled Share button only; user+ icon and avatar stack removed |

## Sources

- Linear docs — Members and roles (https://linear.app/docs/members-roles), verified via search 2026-11-09
- Established product conventions for Asana, Notion, Monday, ClickUp from long-standing documented behavior (invite flows, share panels, project settings, portfolio columns) — HIGH confidence as these UIs have been stable for multiple years
- Note: web search engines were partially degraded (brave rate-limited, ddg captcha) during research; broader per-competitor doc fetches were not possible. Competitor rows rely on well-known stable conventions rather than fresh page captures — flagged as the only soft spot in an otherwise HIGH-confidence landscape.
- Internal ground truth: `.planning/PROJECT.md` (v2.1 target features, M-09..M-13 decisions), existing code (`modals.js` invite/share/project modals, `src/pages/projects.js`, `foldForSearch`, `progressOf`, PSTAT pills)

---
*Feature research for: gr8r v2.1 Member & Project Experience (project-management workspace UI/UX)*
*Researched: 2026-11-09*
