# Feature Research

**Domain:** Project-level permissions & invitations rewrite — Projects Studio v2.0
**Researched:** 2026-11-07
**Confidence:** MEDIUM (competitor models verified against official docs where reachable: Linear, OpenProject, Taiga, Wekan; Height and Focalboard from established product knowledge — search engines were partially degraded during research, noted per row)

---

## The v2.0 features in this milestone (M-01..M-08)

| # | Feature | Milestone decision |
|---|---------|--------------------|
| M-01 | Strict invitation hierarchy | only an owner names another owner; admins invite admin/member/guest; members invite guests only where the project allows it |
| M-02 | Post-invite editing | role, scope and status changeable at any time, effective immediately |
| M-03 | Team sharing via private project | teams = bulk invitation mechanism, replacing the v1.7 `project.teams ∩ member.teams` implicit-visibility rule |
| M-04 | One guest concept | "Invité externe" toggle (`modal.guestToggle`, src/overlays/modals.js:292) removed |
| M-05 | Per-project private/public toggle | replaces the access dropdown; non-private = workspace-visible, private = explicit invitees only (replaces Phase 29 D-03 scope columns as primary model) |
| M-06 | Per-project "members may invite guests" toggle | Settings > Permissions page removed |
| M-07 | Project creation restriction | all members create by default, workspace setting to restrict to admins |
| M-08 | Member-visibility transparency view | show exactly what a given member can see |

---

## How self-hosted PM tools model this (competitor survey)

| Tool | Private/public model | Who invites | Bulk/team invites | Guest handling | Post-invite editing | Transparency UI |
|------|---------------------|-------------|-------------------|----------------|---------------------|-----------------|
| **Linear** | Team visibility toggle in Team settings → Access and permissions → "Change team visibility"; private teams hide from sidebar and issue creation for non-members (official docs, MEDIUM) | Admins invite to workspace; roles Global admin / Admin / Member / Guest | Members added to teams; no "invite a team" bulk verb — team membership grants access | Guests see only assigned teams/projects (guest = scoped membership) | Yes — admin changes role/teams any time from Members page | Weak — you infer visibility from team/project settings; no per-member "what they see" view |
| **OpenProject** | Explicit "public" flag in project settings; public projects get the built-in, editable **Non-member** role; anonymous optional (official docs, MEDIUM) | Per-project **Manage members** permission; **Invite members by email** is a separate grantable permission that requires Manage members | Groups (teams) can be added as members with a role — real bulk mechanism, membership is the product of the grant | No guest concept; external users = non-members / global roles | Yes — member roles editable per project from the Members page | Roles & permissions matrix in admin guide; per-user visibility setting exists; no per-member "what they see" browser view |
| **Taiga** | Project privacy set at creation ("Private"/"Public"), switchable by project admin (official community docs, MEDIUM) | Project admin invites via SETTINGS > MEMBERS; roles Owner/Member/Viewer; per-role permissions editable | No team-bulk invite; contacts picker | None — roles are the boundary | Yes — change role or remove from members page | None beyond the members list |
| **Wekan** | Board visibility: Private (invite only) / Public (anyone with link can view); default board permission = private; admin sets who can create boards (IBRACORP docs + Wekan wiki, MEDIUM) | Board admin adds members per board; workspace admins manage users | No team-bulk invite | No guest role; board members only | Yes — board member role changed in place | None |
| **Focalboard/Mattermost Boards** | Boards shareable with workspace/teams/channels; private boards hidden (product knowledge, LOW) | Channel-based sharing ≈ bulk grant; board members | Channel-linking is the bulk mechanism | None distinct | Limited | None |
| **Height** | Project privacy: "Everyone", specific people, or private; guests scoped to invited projects (product knowledge, LOW) | Invite with roles per project | No | Guest = project-scoped member, one concept | Yes — membership modal | Weak |

**Cross-tool synthesis (the pattern that matters):**
1. **Binary project visibility + explicit membership is the dominant model.** Linear, Taiga, Wekan and Height all converged on a per-project (or per-team) private/public switch where private = "explicit invitees only". Nobody keeps team-intersection *implicit visibility* as the primary model — teams are always an **administrative or bulk-grant mechanism** (OpenProject groups-as-members, Linear team join, Focalboard channels). v2.0's M-03/M-05 direction matches the industry pattern exactly.
2. **Who-can-invite is a permission, not a page.** OpenProject grants `Manage members` / `Invite members by email` per role; Linear gates invites by role. The Tools Studio model (per-project "members may invite guests" toggle, admins/owner always allowed) is a *simpler, per-project* variant of the same idea — the Settings > Permissions page it replaces (workspace `permCreate`/`permGuests`/`permPublic` toggles, src/pages/settings.js:487-493) has no analogue in any surveyed tool.
3. **Guests = lowest workspace role with project-scoped reach.** Linear, Height, and the current Tools Studio (`viewer` role + exactly one project) all use ONE guest concept. OpenProject is the outlier and its complexity (Non-member/Anonymous/placeholder users) is instructive: it's the model Tools Studio should NOT drift toward.
4. **Post-invite editing is universal and immediate.** Every tool edits role/scope/status in place from a members surface with no re-invite flow. There is no pattern of "rescind and re-invite to change a role."
5. **Transparency views are rare** — which makes M-08 a genuine differentiator. Closest analogues: OpenProject's user-visibility setting and permission matrices; Linear's sidebar-as-truth. Nobody offers "show me exactly what member X sees."
6. **Creation restriction is a workspace admin setting** (Wekan, OpenProject global role "Create projects") — exactly M-07.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Binary private/public project toggle | The dominant model across Linear/Taiga/Wekan/Height; users read "private = only invited people" as the whole contract | **LOW** | `projectIsPrivate()` (server.js:751) already reads a boolean; the toggle replaces the access dropdown in project settings. UI-only + one doc field change |
| Post-invite role/scope/status editing, effective immediately | Universal in every surveyed tool; users treat a membership as a mutable record, not a frozen invite | **MEDIUM** | Extends the member edit modal (`submitMemberTeams`, /members/:uid/scope route). M-02 says "scope" — with D-03 scope columns demoted (M-05), decide whether "scope" here means project membership lists and guest project. Status = active/invited/suspended |
| Owner-only owner promotion (M-01) | Every tool reserves owner/creator-role grants for top-level admins; hierarchy sanity | **LOW** | One guard on the invite/update path: `roleRank` check — owner role only assignable by owner, both at invite creation and later edit (M-01×M-02 interaction) |
| Guests see exactly one project (single concept) | Linear/Height both use one guest concept; two toggles ("guest" role + "external guest" checkbox) confuse admins | **LOW** | Delete `invGuest` checkbox + `modal.guestToggle`/`guestHint` keys (EN+FR); guest = viewer role with project scope. Boot sweep for stored `external` invite flag if any |
| Per-project "members may invite guests" toggle | OpenProject's grantable invite-permission, simplified to one project-level switch | **LOW-MEDIUM** | New project doc field (e.g. `allowMemberGuests`, default true); enforced server-side in the invite route — the client toggle is display-only, the funnel decides |
| Workspace setting: restrict project creation to admins | Wekan/OpenProject both have it; M-07 keeps all-members default | **LOW** | Replaces workspace `permCreate` doc pref; keep the P1 decision: creators become project members (M-07 wording) |
| Team invite = bulk member add from share modal | OpenProject groups-as-members is the canonical pattern; M-03 replaces implicit visibility with explicit bulk grant | **HIGH** | Share modal gains "add team" action → resolves team_members rows into project access (per-member rows or a team-membership-with-snapshot decision — see Dependencies). This is the biggest surface: share modal (src/pages/project.js:70-72), invite routes, `memberCanReadProject` rewrite |
| Removal of Settings > Permissions page | The page it replaces (`case 'permissions'`, settings.js:487-493 + permsTable in members.js) duplicates what per-project toggles now decide | **LOW** | Delete nav entry, case block, `permCreate/permGuests/permPublic` pref reads, and boot-sweep the doc fields. Keep the role matrix (`permsTable`)? Decide — it's documentation, not control; consider moving it under Members |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Member-visibility transparency view (M-08)** | No surveyed tool offers it; admins currently *cannot* answer "what does Elodie see?" without reverse-engineering teams ∩ projects ∩ scope. Highest trust payoff of the milestone | **MEDIUM-HIGH** | Cleanest shape: per-member modal/page listing (a) visible projects with the *reason* — invited, public, via team X, admin — and (b) hidden count only (never hidden names — that would leak through the UI what `hiddenFor` protects server-side). Reuses `memberCanReadProject` directly as the oracle — one predicate, both funnels, never a second pipeline (the house rule). Must resolve member_id→user_id→teams like hiddenFor does (server.js:786-794) |
| Permission checks that *explain themselves* | Transparency as an operating principle: the same reason strings power tooltips on the share modal ("visible to X because public") | LOW-MEDIUM | If the reason table from M-08 is a shared server helper, the UI surfaces are cheap |
| MCP parity transparency | 35 MCP tools sit on the same funnel; a member-visible-projects query tool or per-tool reason output keeps agents honest | LOW | Extends the same helper; do not fork a second visibility predicate for MCP |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Keeping team-intersection implicit visibility *alongside* the new toggle ("just in case") | Migration anxiety — some members only "have access because of their team" today | Two competing visibility sources is exactly what the transparency view cannot honestly explain; the v1.7 rule silently grows the visible set over time (the bug the owner reported) | M-05 is a replacement: kill `teamIntersects` in `memberCanReadProject` (server.js:786-794) and the Phase-32 null-scope branch (server.js:875-893); ship a one-time visibility report before the switch so the owner sees what members lose |
| Role permission matrices per project (OpenProject-style custom roles) | Feels like the "complete" answer | Massive surface, no demand signal here; the surveyed SOTA (Linear, Taiga) ships fixed role ladders | Keep fixed roles; the per-project guest toggle is the only per-project permission knob |
| Public-link sharing of private projects (Wekan's "anyone with link") | Convenience | Breaks the workspace-tenancy model (`/w/:slug` + requireWorkspace) and the no-existence-oracle 404 discipline | Public = "workspace-visible", never anonymous |
| Invitation emails that re-run permission logic client-side | Snappy UX | The document is redacted server-side; the client literally cannot know what a member can see | All transparency/visibility answers come from the server funnel |
| Editing an invite's target *email* post-hoc | Admin convenience | An invite is a token hash bound to an email; editing becomes identity swap with unclear audit | Cancel + re-invite (M-02 covers role/scope/status, not identity) |

---

## Feature Dependencies

```
[M-05 private/public toggle]  ← the new primary visibility model
    └──requires──> [kill team-derived visibility (v1.7 rule) — M-03's precondition]
    └──requires──> [project membership becomes the ONLY private-access source]
                        └──requires──> [M-03 team invite = bulk member grant]
                                             └──requires──> [share modal "add team"]

[M-01 strict hierarchy] ──pairs──> [M-02 post-invite editing]   (both touch the same invite/update routes — one phase)

[M-06 per-project guest toggle] ──conflicts-with→ [Settings > Permissions page]  (page removed *because* the toggle supersedes it)

[M-08 transparency view] ──requires──> [M-03+M-05 landed]   (the oracle must read the NEW model; building it on the old funnel = throwaway work)

[M-07 creation restriction] — independent, ship anytime

[M-04 single guest] ──enhances──> [M-06]   (one guest concept is what makes "members may invite guests" a clean switch)
```

### Dependency Notes

- **M-03 requires a storage decision before planning:** bulk team invite can materialize as (a) one `project_members`/access row per team member *snapshotted at invite time* (simple, matches "invitations not visibility", but new members joining the team later DON'T gain access — needs re-share) or (b) a stored `project.teams` list still consulted *as a grant* at read time (feels like visibility again). Recommendation: (a) with an easy "re-sync team" affordance — it is the only model where the transparency view can honestly say "invited via team X on date Y". This is the key research-flag decision for the phase plan.
- **The existing funnels — what changes vs survives:**
  - **Survives unchanged:** `hiddenFor` as the single redaction funnel (redactDoc/mergeClientDoc/reminder pass/email mirror/MCP all consume it); `projectScope` for admin/owner exemption; byte-identical 404 discipline; ROLE_RANK ladder.
  - **Rewritten inside the funnel:** `memberCanReadProject` loses the `teamIntersects` term (server.js:786-794) and the Phase-32 null-scope branch (server.js:875-893); visibility becomes `!private ∨ access-list ∨ (scope grant, demoted)`. D-03 grant inversion (scope opens private projects) survives but demoted to a legacy/admin restriction per M-05.
  - **Deleted:** `invites.teams` backfill semantics as visibility carrier; Settings > Permissions case; `modal.guestToggle`.
- **M-02 interacts with M-01:** the same "change role" route must enforce owner-only-owner at edit time, not just invite time — a member demoted-promoted later must never mint an owner.
- **M-08 last, but its oracle helper first:** extract the "explain member visibility" helper early in the M-03/M-05 phase (tests), then the UI view is a thin consumer. Building the helper late means retro-fitting it into the rewritten predicate.
- **M-06 conflicts with the removed page:** the workspace `permGuests` pref has live reads (settings.js:491); removal needs a boot sweep or the stale pref silently disagrees with per-project toggles.

## MVP Definition

### Launch With (the milestone's must-haves, in dependency order)

- [ ] M-05 toggle + funnel rewrite (`memberCanReadProject` → private = invitees only) — the model everything else reads
- [ ] M-03 team invite through share modal (bulk grant, snapshot semantics) — required *before* killing team visibility, or members lose access silently
- [ ] M-01 + M-02 invite hierarchy + post-invite editing (same routes, one phase)
- [ ] M-04 single guest concept + M-06 per-project toggle + Settings > Permissions removal (one cleanup phase)
- [ ] M-08 transparency view (after the funnel lands; helper-first)

### Add After Validation (post-milestone)

- [ ] "Explain this access" tooltips on share modal — reuses the M-08 reason helper
- [ ] Re-sync team affordance for snapshot-granted teams
- [ ] MCP tool exposing member-visible-projects for agents

### Future Consideration (defer)

- [ ] Custom per-project roles / permission matrices — no demand, huge surface
- [ ] Anonymous/link sharing — breaks tenancy model

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| M-05 private/public toggle + funnel rewrite | HIGH | MEDIUM | P1 |
| M-03 team invite bulk grant (share modal) | HIGH | HIGH | P1 |
| M-01/M-02 invite hierarchy + post-invite editing | HIGH | MEDIUM | P1 |
| M-04 single guest concept | MEDIUM | LOW | P1 |
| M-06 per-project guest toggle + Permissions page removal | MEDIUM | LOW | P1 |
| M-08 transparency view | HIGH | MEDIUM | P2 (helper P1) |
| M-07 creation restriction setting | LOW | LOW | P2 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Concrete UX expectations (downstream consumer notes)

- **Per-project toggles** should live in project settings as two explicit switches: "Private project" (the visibility contract sentence, e.g. EN "Visible to the whole workspace" / "Only invited people can see this project") and "Members can invite guests" (hint: "Admins and the owner can always invite"). Wekan/Taiga put visibility at the top of project settings; Linear puts it under "Access and permissions" — either works, keep both toggles in ONE place.
- **Share modal (the M-03 surface):** gains a team picker beside the member picker; each added team renders as a removable chip-row showing member count ("Design · 6 people · added Nov 7"). Removal asks whether to also remove individually-added members who came via that team (snapshot semantics make this a real question).
- **Transparency view (M-08):** a "What X can see" panel from the member's row (Members page or the member modal), listing visible projects each with a reason chip — "public", "invited", "team: Design", "workspace admin" — plus a count of hidden projects *without names*. Admins/owners should be able to jump from a project row to the share modal. It must be read-only and derived live from `memberCanReadProject` — no cached snapshot, same D-05 live-read discipline as the reminder pass.
- **Removal of Settings > Permissions:** the role matrix (permsTable) is useful documentation — consider relocating under Settings > Members rather than deleting outright; the three functional toggles (permCreate/permGuests/permPublic) are genuinely replaced by per-project + workspace equivalents and die.

## Sources

- Linear docs — Teams, Private teams (https://linear.app/docs/teams, /docs/private-teams) — team visibility toggle, guest scoping [MEDIUM, official]
- OpenProject docs — Roles and permissions, Permissions guide (openproject.org/docs/system-admin-guide/users-permissions/) — Manage members / Invite members by email grants, Non-member role, public projects, "Create projects" global role [MEDIUM, official]
- Taiga community docs — adding members, SETTINGS > MEMBERS flow, Owner/Member/Viewer roles [MEDIUM, official]
- Wekan — IBRACORP docs (docs.ibracorp.io) + Wekan hall-of-fame notes — board visibility private/public, default board permission private, admin creation gating [MEDIUM]
- Focalboard/Mattermost Boards, Height — product knowledge, search engines partially degraded (brave rate-limited, ddg CAPTCHA) during research [LOW]
- Codebase ground truth (HIGH): server.js:193 (ROLE_RANK), :751-794 (projectIsPrivate/memberCanReadProject), :813-902 (projectScope/hiddenFor/D-03), :4898+ (invites routes); src/overlays/modals.js:292 (guest toggle); src/pages/settings.js:487-493 (permissions case); src/pages/members.js:100-123 (permsTable)

---
*Feature research for: Projects Studio v2.0 — project-level permissions & invitations*
*Researched: 2026-11-07*
