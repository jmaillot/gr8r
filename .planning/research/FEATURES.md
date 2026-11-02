# Feature Research — v1.7 Team Visibility & Hardening

**Domain:** Self-hosted PM workspace — debt-closure milestone (no new surface area)
**Researched:** 2026-11-02
**Confidence:** HIGH on all codebase claims (read directly); MEDIUM-HIGH on competitor comparisons (official docs; Wekan/Focalboard details partly community sources)
**Comparison set:** Plane (Teamspaces), Wekan, Focalboard, Taiga — plus generic undo/CSRF UX standards

---

## Feature Landscape

### Table Stakes (for this milestone's six items)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **VIS — Team-derived project visibility** | Every tool in the comparison set derives project access from team membership (see Competitor table). gr8r already has 80% of the machinery: `project.teams[]` exists on every project (migrated in P3), `team_members` scope columns exist (Phase 28), and `scopeGrants()` (server.js:722-728) already implements the union read "a team's reach opens private team-linked projects". The v1.7 change is one predicate widened from "scoped members" to "all members": readable ⟺ `p.teams ∩ member.teams ≠ ∅` ∨ existing rules; no-team projects stay workspace-wide. | LOW-MEDIUM | **Must ride the ONE funnel.** The code comment at server.js:705-711 is explicit: redactDoc AND mergeClientDoc both consume `hiddenFor()` — never a second pipeline. Add the team-intersection term inside `scopeGrants`/`inScopeProject` so writes are protected by the same predicate. Phase-29 scope stays as an optional admin restriction layered on top (it already composes as a pre-filter). |
| **UNDO — delTeam undo honesty** | The undo-toast standard (vocab.design, Marigold: "Honest — never promise a recovery the system cannot deliver") makes a lying Undo offer worse than no offer. Current code (src/actions/teams.js:130-165) purges `team_members` rows server-side via `api.setMemberTeams` BEFORE `mutate()`/`snapshot()`, then offers `restore(snap)` which restores only the local document — the memberships stay deleted. Two standard exits: (a) make undo real, or (b) drop the offer. | LOW (b) / MEDIUM (a) | **Recommendation: (a) make undo real, client-side only.** Defer the server purge: keep the "re-PUT with team filtered out" as the *commit* path but capture `affected` teams first and restore via the same `api.setMemberTeams` calls on undo. This matches the existing undo idiom everywhere else in the app (task delete, project delete, member removal all use `snapshot()/restore()`). Simpler honest fallback: keep the confirm dialog (it already exists and is bulk-aware) and remove the Undo button for teams only. |
| **HARD — sameOrigin on invite accept** | CSRF on state-changing, cookie-authenticated routes is table stakes. gr8r already enforces `sameOrigin()` on ~20+ POST routes (server.js:2630-3780, "Pitfall 22 order: sameOrigin FIRST, before any body read or throttle"). The invite-accept route is the known gap (v1.1 audit). Fix is a one-line guard matching the established idiom. | LOW | Note the subtlety: invite-accept is often hit by a *logged-out* browser arriving from an email link (cross-site navigation then form POST). The existing `?next=` carry pattern (v1.5 LINK-01..04) means the accept flow renders a page first; the POST from that page is same-origin. Verify the accept POST's referrer/origin expectations for anonymous visitors — SameSite=Lax cookies (server.js:2415) already block the cross-site POST payload from carrying a session, so the guard is defense-in-depth, not a behavior change. |
| **HARD — no admin link-only invites / no firstWorkspace() fallback** | Invites must resolve to their workspace row; a fallback to "the first workspace ever created" is a tenant-confusion bug (`firstWorkspace()` at server.js:2773 in the SSO reconcile path, 2166, 1647). Competitors (Plane) never guess: invite → workspace_id is a hard relation; a missing workspace = dead invite. | LOW | Replace `|| firstWorkspace()` at 2773 with "workspace gone → skip reconcile (invite is dead)". The 1647 call is the seed-owner bootstrap (legitimate — the workspace was just created); leave it. |
| **HARD — no guest-profile spoof** | gr8r's guest model (viewer + exactly one project scope, server.js:4180-4196) is enforced on writes; the spoof risk is the client trusting a self-reported profile shape. Plane gates guests server-side everywhere ("Workspace guests can't browse or join projects"). gr8r's `docForClient` redaction funnel is the right place — guest-visible member payloads should carry only what redaction already allows. | LOW-MEDIUM | Scope this item tightly: derive guest member projections server-side from the existing `hiddenFor`/redaction output rather than adding a new "spoof" concept. Flag anything beyond that as over-engineering. |
| **SEARCH — close the substring recent-search leak** | Recent searches live in the *shared* workspace document (`out.data.recentSearches`, server.js:607) and are filtered by `referencesHidden(term, hiddenTerms)` (server.js:882) — an exact/substring match against hidden terms. The leak: a redacted project name is a substring of a saved term (e.g. searching "Acme Confidential Q3" matches hidden project "Acme Confidential"), so the *existence* of the hidden name leaks through a term the searcher can already see. Competitors store search history per user (Plane workspace views are per-user; Wekan filters are per-board-member). | LOW | Two-part fix per the milestone brief: (1) close the leak — cheapest correct rule is to redact any stored term that *contains* a hidden name as a substring (invert the current containment direction — verify current code and pick the direction that hides more), or move `recentSearches` into SETTINGS' per-user rows (kills two birds); (2) document the residual free-text limitation (users can still type hidden names into search; results are redacted, only the *query text* is user-visible). Documenting is explicitly sanctioned by the milestone. |
| **SETTINGS — per-user settings isolation** | v1.2 already tracked this as WS-01 ("Per-user isolation of notifPrefs, invoices"). Every competitor has per-user notification prefs (Wekan: per-user watch/track/mute per board; Plane: per-user notification preferences; Focalboard: per-user via Mattermost). gr8r has the proven migration pattern: the per-user `locale` column (v1.2 Phase 8) — nullable column, server never writes at boot, byte-identical second boot, `PATCH` route. | MEDIUM | `notifPrefs` is workspace-shared today (server.js:633-638 normalize-on-read merge defaults ON; email gates read `doc.data.notifPrefs` at 1062, 1226). Moving to per-user rows changes the *email gate* read path (per-recipient lookup, which Phase 27's per-recipient notification rows already anticipate). `invoices` is legacy display data being purged anyway (server.js:1341 deletes it on write; migration.test.mjs:196 proves the pattern) — for invoices, "delete like plan/invoices precedent" is simpler than "migrate per user". Verify owner intent: invoices likely needs purge, not migration. |
| **DEPLOY — MASTER_KEY_PREVIOUS in compose** | The v1.5 rotation runbook (DEPLOY.md §14, KEY-03/04) requires two env vars during rotation; docker-compose.yml forwards `MASTER_KEY` but not `MASTER_KEY_PREVIOUS` (verified — full env block read). Operators doing the documented rotation through compose silently lose the old key. | LOW | One line: `MASTER_KEY_PREVIOUS: ${MASTER_KEY_PREVIOUS:-}`. Pin a doc-parity test if DEPLOY.md references compose (the codebase already has doc-parsing parity tests for DEPLOY.md §14 — extend, don't invent a new mechanism). |

### Differentiators (none needed — this is a debt milestone)

Nothing here. v1.7's brief explicitly forbids new features; flag any roadmap suggestion of new surface area as out of scope. The only "differentiator-flavored" outcome is trust: honest undo + airtight redaction are the qualities self-hosted admins audit for.

### Anti-Features (over-engineering traps for this scale)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Plane-style Teamspaces as a first-class entity (dashboards, views, pages per team) | "Plane does it" | Plane's Teamspaces are a separate resource with lead/members/link relations — a whole new feature. gr8r's `team_members` + `project.teams[]` already model the access semantics. | Keep visibility as a *derived predicate* over existing rows. Zero new tables. |
| Server-side undo/soft-delete trash for teams (30-day retention, trash view) | "Undo should survive navigation" | A trash is first-class UI plus retention policy — a feature, not a fix. Team deletion is rare and already confirm-dialog'd with impact counts (teams.js:124-126 counts affected members and projects). | Client snapshot + deferred server commit, within the existing toast window. |
| CSRF tokens (synchronizer-token pattern) on all routes | "Stronger than Origin checking" | Requires per-session token plumbing and template injection across a no-framework vanilla-JS frontend. Origin/Referer validation is what same-origin frameworks (and gr8r's 20+ existing routes) already do; SameSite=Lax cookies close the cross-site POST gap. | Extend the existing `sameOrigin()` guard to the two missing routes. |
| Full ACL UI (per-project member pickers duplicating Plane's project-membership model) | "Visibility needs management UI" | Team-derived visibility is *implicit* — it needs no new UI beyond maybe surfacing "visible because of team X". Adding per-project membership editing recreates Phase 29's scope model for everyone. | Display-only: show team chips on projects (they already render) and let the intersection rule do the work. |
| Per-user `invoices` migration | "WS-01 lists it with notifPrefs" | Invoices are already purged-on-write legacy display data (server.js:1341, migration tests prove the precedent). Migrating shared rows into per-user rows is work with no user asking for it. | Delete `invoices` from the doc like `plan`; if any consumer needs it, that's a separate question. Verify with owner. |
| Moving ALL recent-search history per-user in the same change as the leak fix | "It's the thorough fix" | Recent searches are in the shared doc; moving them is a migration + new route + client change. It can ride SETTINGS' per-user infra but shouldn't gate the leak fix. | Close the leak with the containment rule now; optionally move `recentSearches` per-user as a follow-up inside SETTINGS if the infra makes it trivial. |

---

## Feature Dependencies

```
[SETTINGS per-user rows] ──provides-pattern──> [SEARCH recentSearches per-user (optional)]
                                                     │
[VIS team-derived visibility]                        └──> [SEARCH substring leak fix] (independent, ship first)
        └──requires──> [team_members rows (Phase 28) — shipped]
        └──requires──> [hiddenFor single funnel (Phase 29) — shipped]
        └──modifies──> [redactDoc + mergeClientDoc] (both consumers of the funnel)

[UNDO delTeam] ──independent──> everything else
[HARD sameOrigin] ──independent (server.js, ~2 routes)
[DEPLOY compose] ──independent (1 line + doc parity test)
```

### Dependency Notes

- **VIS is the only structural change.** Everything else is a localized fix. VIS must not ship as a second redaction pipeline — the code comment at server.js:705-711 makes the single-funnel rule explicit and testable (the 404-matrix proof pattern from Phase 29 exists and should be extended with team-intersection cells).
- **SETTINGS provides the per-user row pattern** that SEARCH can optionally reuse; they are naturally adjacent phases.
- **UNDO and VIS interact conceptually:** if a team is deleted and members' team sets change, team-derived visibility changes with it. The undo restore path must re-run through `api.setMemberTeams` so the server and doc agree — do not restore the doc alone.

---

## MVP Definition (v1.7 scope)

### Launch With (all six — they are the milestone)

- [ ] VIS — team-intersection visibility inside the single `hiddenFor` funnel, no-team projects workspace-wide, Phase-29 scope composes on top — the headline item; needs the 404-matrix test extension
- [ ] SEARCH — substring-leak containment fix + documented free-text limitation (CHANGELOG/docs) — smallest item, independent
- [ ] HARD — `sameOrigin` on invite accept; `firstWorkspace()` fallback removed from invite reconcile (2773); guest projection derived from redaction — three small server.js fixes, one phase
- [ ] UNDO — real delTeam undo via deferred purge/restore, or honest removal of the offer (decide with owner) — small, isolated
- [ ] SETTINGS — per-user `notifPrefs` rows via the `locale`-column migration pattern; `invoices` purged not migrated (confirm with owner) — the only additive-migration item, so it carries the byte-identical-second-boot test burden
- [ ] DEPLOY — `MASTER_KEY_PREVIOUS` in compose + doc-parity test — trivial, bundle anywhere

### Add After Validation (v1.x)

- [ ] Move `recentSearches` per-user — only if SETTINGS' per-user infra makes it near-free
- [ ] "Visible via team X" affordance in project headers — only if UAT shows confusion about why a project appeared

### Future Consideration (v2+)

- [ ] Per-project explicit membership management UI (Plane model) — explicitly out of scope; Phase 29 scope remains the admin restriction mechanism
- [ ] Teamspaces-style team dashboards — new feature, violates the no-new-features brief

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| VIS team-derived visibility | HIGH (closes deferred Backlog 999.1; makes teams mean something for access) | MEDIUM | P1 |
| SEARCH leak fix | MEDIUM (privacy correctness) | LOW | P1 |
| HARD membership-surface hardening | MEDIUM-HIGH (audit closure, tenant correctness) | LOW | P1 |
| SETTINGS per-user isolation | MEDIUM (correctness; one admin's prefs stop controlling everyone's emails) | MEDIUM | P2 |
| UNDO delTeam honesty | MEDIUM (trust; small blast radius) | LOW | P2 |
| DEPLOY compose var | LOW-MEDIUM (operator runbook correctness) | LOW | P3 (but trivially cheap — do it) |

---

## Competitor Feature Analysis

| Feature | Plane | Wekan | Focalboard | Taiga | gr8r v1.7 plan |
|---------|-------|-------|------------|-------|----------------|
| Team-derived project access | Teamspaces: linking a teamspace to a project grants every teamspace member Contributor; direct and derived access evaluated together, higher role wins; unlink removes only derived access | No teams at board level — boards are public/private with explicit members | No real teams (Mattermost channels play the role externally) | Teams exist but visibility is per-project member lists; no team-derived read | Intersection predicate over existing `project.teams[]`/`team_members` — no new membership rows created, access always derived (like Plane's "Plane does not add them to the member list") ✓ matches Plane semantics without its entity model |
| Guest handling | Guests can't browse/join public projects; explicit invite only | Board-level member roles | N/A (Mattermost roles) | Member roles per project | Guests keep viewer + exactly-one-project scope; guest projections derived from redaction funnel |
| Per-user notification settings | Per-user notification preferences in account settings | Per-user watch/track/mute per board/list/card | Per-user (via Mattermost) | Per-user "config change default subscription" | `notifPrefs` moves from shared doc to per-user rows; per-recipient notification rows (P4) already make the read path per-recipient — settings finally match it |
| Invite CSRF protection | Server-side session + standard framework protections; invite links are single-use tokens | Meteor accounts framework (DDP origin checks) | Mattermost session model | Django CSRF on all forms (framework default) | Extend existing `sameOrigin()` guard to invite accept — same idiom as 20+ existing routes; SameSite=Lax already blocks cross-site session use |
| Destructive-action UX | Private→public visibility change warns "cannot undo"; deletes confirm | Deletes confirm; archive recoverable | Deletes confirm | Deletes confirm | gr8r's undo-toast idiom is *ahead* of all four competitors — the fix is making the one lying offer honest, not adding dialogs |

### UX expectations for team-based auto-visibility (from the comparison)

1. **Implicit membership is the norm, display-only.** Plane's rule is the standard: derived access never rewrites stored membership rows ("Plane does not add them to the member list and does not change the role stored on a direct membership"). gr8r's derived predicate matches exactly — no `team_members` churn, no migration of memberships when visibility rules change.
2. **No opt-out in any competitor.** Nobody offers "project teams grant access, but let me disable that per project." Access follows membership unconditionally; the only control is *which teams the project belongs to*. gr8r should not invent a per-project opt-out flag — an admin who wants a project invisible to a team simply removes that team from `project.teams[]` (or keeps it private with explicit members, which the existing `private`+`members` path already handles).
3. **Removal is symmetric and immediate.** Removing a user from a team removes team-derived access on the next read (Plane: "Unlinking a project removes only the access that came through the teamspace"). No grace period, no caching layer to worry about — gr8r reads are computed per-request, so this is free.
4. **Admins keep wildcard access.** Plane: workspace admins access all projects via inheritance. gr8r's existing owner/admin role behavior should be preserved through the funnel (verify `scopeGrants` handles the no-scope admin case — the "not an admin" branches in redaction already special-case admins).

### UX expectations for undo of destructive actions (standards summary)

- **Undo (5–10s toast) for reversible; confirm dialog for irreversible** — gr8r already follows the hybrid (confirm dialog *plus* undo toast on teams), which the "asking twice is not twice as safe" guidance flags as one safety net too many. Either real undo or confirm, not both — the current delTeam code has both, and the undo half is the dishonest one.
- **Never offer undo you can't deliver.** This is the exact delTeam bug: the server write (team_members purge) committed immediately, the client "restore" only rewinds the document. The Marigold rule — "Honest. Never promise a recovery the system cannot deliver" — is the acceptance criterion.
- **Bulk actions must be restorable in one move** — the fix path (re-PUT the captured `affected` team sets) is inherently bulk-shaped, matching the existing `api.setMemberTeams` per-member loop.
- **If undo can't be made real, the confirm dialog with impact counts is the honest fallback** — teams.js:124-126 already names the counts ("N members will have no team"), which is the standard's "the body says what is lost".

---

## Sources

**Codebase (HIGH confidence — read directly):**
- `server.js:594-596` `firstWorkspace()`, `:607` recentSearches in shared doc, `:633-638` shared notifPrefs normalize, `:705-728` single-funnel comment + `scopeGrants` union read, `:730-739` `hiddenFor`, `:1341` invoices purge, `:2389+` `sameOrigin` + ~20 guarded routes, `:2773` invite-reconcile `firstWorkspace()` fallback, `:4180-4196` guest single-project gate
- `src/actions/teams.js:119-168` delTeam: server purge before snapshot, dishonest undo offer
- `src/actions/actions.js` undo-toast idiom throughout (snapshot/restore)
- `docker-compose.yml` — `MASTER_KEY` forwarded, `MASTER_KEY_PREVIOUS` absent
- `.planning/milestones/v1.2-REQUIREMENTS.md` WS-01 (per-user settings debt origin), `v1.3-REQUIREMENTS.md` (notifPrefs/invoices explicitly deferred)
- `test/migration.test.mjs:196` plan/invoices purge precedent; `test/scope.test.mjs` Phase-29 404-matrix test pattern

**Competitor docs (MEDIUM-HIGH confidence — official documentation unless noted):**
- Plane docs: core-concepts/projects/overview, roles-and-permissions/overview, core-concepts/workspaces/teamspaces, manage-project-members
- Wekan docs (GitHub): Features/Boards, Admin-Panel/Settings/Visibility
- Focalboard/Taiga positioning via Pi Stack (2026-04) and TechRepublic (2026-03) comparisons — community sources, treated as directional only

**UX standards (MEDIUM-HIGH):**
- vocab.design "Undo" pattern; Marigold UI "Destructive Actions"; DEV Community undo-window vs soft-delete sizing (2026-06); envydesign undo-toast catalog (2026-10)

---
*Feature research for: gr8r v1.7 Team Visibility & Hardening (debt closure)*
*Researched: 2026-11-02*
