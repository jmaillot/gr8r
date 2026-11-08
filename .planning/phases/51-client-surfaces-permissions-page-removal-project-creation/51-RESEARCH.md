# Phase 51: Client surfaces, Permissions-page removal & project creation - Research

**Researched:** 2026-11-08
**Domain:** In-repo client surfaces (vanilla-JS SPA) on top of the Phase 49/50 server permission model — share-modal toggle, team invite section, settings-page teardown, creation restriction, i18n gate
**Confidence:** HIGH (all findings verified by reading the live source this session; no external packages involved)

## Summary

Phase 51 is almost entirely surface work over server machinery that Phases 49–50 already shipped and tested (1106 tests green at Phase 50 exit). Three findings dominate the planning space:

1. **The optimistic toggle already exists.** `IN.shareAccess` (`src/actions/actions.js:1787-1797`) already does optimistic mutate + toast for the private flip, and the general-access row markup (`src/overlays/modals.js:252`) already renders `p.private` state with the exact labels D-51-2 mandates. The work is: swap the `<select>` for a two-state toggle, add revert-on-server-refusal, and decide the *server path* for the write (see Architecture Patterns — the doc-sync path is lead-compatible; a new admin-gated route is not).
2. **The lead role (D-51-17) is already half-built.** Both `canManageProject` predicates — client (`src/core/store.js:327-330`) and server (`server.js:810-813`) — already grant manage rights to `p.lead`, and `mergeClientDoc` pins `p.private/members/perms/lead/teams/allowInviteGuests` for non-managers (`server.js:1036-1047`). What is missing is the *creation* side (creator becomes lead on a restricted/unrestricted create) and, critically, the fact that Phase 50's dedicated project routes (`/projects/:id`, `/projects/:id/members*`) are gated `requireWorkspace(..., 'admin')` — a lead cannot use them. **Prefer the doc-sync write path for everything a lead must do**, or add lead-aware authority checks to any new route.
3. **Two server capabilities do not exist yet and this phase must create them:** (a) any *enforcement* of `permCreate` (today it is read in exactly one place, the settings toggle render — `src/pages/settings.js:490` — and nowhere in `server.js`), and (b) any *write path for `p.teams`* on a project (server-side `p.teams` is only written by the Phase 50 restore migration, `server.js:2782`; there is no route that links a team to a project). Both are new enforcement/write surfaces, not re-exports.

**Primary recommendation:** Reuse the doc-sync write path (client `mutate()` → doc PUT → `mergeClientDoc`) for the toggle and team-link actions — it is the only path leads can already exercise end-to-end — and add a single server-side creation guard that reads `doc.prefs.permCreate` during the doc-write funnel. Do not mint new admin-gated REST routes for lead-performable actions.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-51-1:** Toggle lives in the share modal, in place, replacing the `shareAccess` select (`src/overlays/modals.js:252`). No project-header control.
- **D-51-2:** Two-state toggle reusing existing labels ('Only invited' / 'Everyone at {workspace}') — existing i18n keys reused, no new key for the control itself.
- **D-51-3:** Optimistic flip with revert + toast on server refusal. No wait-for-ack spinner.
- **D-51-4:** Visibility-epoch refetch: a client that loses a project refetches and shows an honest localized not-found state — no silent removal, no raw error.
- **D-51-5:** Share modal shows an inline teams note when `p.teams` is non-empty.
- **D-51-6:** Team invite is a 'Teams' section in the share modal listing workspace teams with an 'Invite team' action each — no unified email/team typeahead.
- **D-51-7:** Team invite confers Member role — no role choice. Individual invite role takes precedence over team-derived role.
- **D-51-8:** Copy reflects **live team semantics** ("current members of the team have access, and access follows team membership") — supersedes the roadmap's "snapshot semantics" wording (per D-50-5).
- **D-51-9:** Already-linked teams listed in the teams note with a remove action, excluded from the invite list.
- **D-51-10:** `permCreate` relocates to Workspace settings > General (key and behavior carry over).
- **D-51-11:** `permGuests` is deleted (superseded by per-project `p.allowInviteGuests`).
- **D-51-12:** `permPublic` is deleted (no separate public-share-link concept in the collapsed model).
- **D-51-13:** The role-permissions table (`permsTable`) relocates to Workspace settings > Members. No orphaned routes, actions or i18n keys.
- **D-51-14:** With restriction on, members see create affordance **disabled with a tooltip** ('restricted to admins') — not hidden.
- **D-51-15:** Server refusal of restricted create is 403 + localized toast.
- **D-51-16:** Restriction takes effect immediately — next request, no cached state.
- **D-51-17:** MILESTONE CHANGE (partially supersedes D-50-1): project creator becomes a per-project **lead** with project-manage rights (manage that project's members, toggles, settings). Workspace admin/owner still outrank. `canManage` gating, mergeClientDoc pinning, visibility predicate and Phase 52 must account for it. **Reversibility: costly.**

### the agent's Discretion
- Exact API shape for the toggle endpoint reuse (Phase 50 routes)
- Teams note markup
- Visibility-epoch refetch mechanics
- Removed-key detection specifics
- Where the server carries `permCreate` enforcement
- Lead-role storage representation (`p.members` entry shape vs new field)
- Activity-log entries

### Deferred Ideas (OUT OF SCOPE)
- None. (Phase 52 transparency view is the natural place for lead/membership provenance.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VIS-01 | Owner/admin switches any project private/public via per-project toggle (replaces dropdown) | Existing `shareAccess` handler + row markup to transform (modals.js:252, actions.js:1787); doc-sync write path; labels verified at `src/locales/en.json:786-789` |
| CRT-01 | All members can create projects and become lead; workspace setting can restrict creation to admins | `createProject` already sets `members: [...new Set([D().me, f.lead])]` and `lead: f.lead` (actions.js:1528-1544); `permCreate` currently unenforced anywhere in `server.js` — new enforcement required |
| CRT-02 | Settings > Permissions page removed; relevant pieces relocate; no orphaned routes/i18n keys | Page located: `src/pages/settings.js:52` (nav entry) + `:487-493` (case body); `permsTable` already rendered on the Members page (`src/pages/members.js:56`) — relocation is mostly deletion |
| UX-01 | Every new/changed string catalogued EN+FR; i18n gate passes | Gate = `npm run i18n:scan` (package.json:9-11, also `prebuild`); catalogue contract in `test/catalogue.test.mjs` |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Private/public toggle UI + optimistic flip | Client (SPA) | Server (doc-sync merge) | D-51-3 is a client concern; the server enforces manager-only access-field writes in `mergeClientDoc` |
| Visibility predicate (who sees the project) | Server | — | Phase 49/50 territory; client only renders what the funnel sends |
| Honest not-found on lost visibility | Client | Server (redaction already excludes the project from the doc) | The client must *detect* the disappearance and render localized not-found; server already redacts (`hiddenFor`, server.js:817) |
| Team invite write (link team to project) | Client | Server (doc-sync) | No dedicated route exists for `p.teams` writes; doc-sync merge pins `p.teams` for non-managers (server.js:1046) |
| `permCreate` enforcement | Server | Client (affordance gating, D-51-14) | Server must refuse (D-51-15); client must disable with tooltip from shared state |
| Settings page teardown / relocation | Client | — | Pure SPA page + nav + i18n surgery |

## Standard Stack

### Core
No new dependencies — the standing invariant is **zero new runtime deps** (PROJECT.md). Everything uses the existing in-repo stack:

| Piece | Where | Purpose |
|-------|-------|---------|
| Vanilla-JS SPA render (`render()`, `S`, `D()`) | `src/core/store.js`, `src/pages/*` | All surface work |
| `mutate()` / `snapshot()` / `restore()` | `src/core/store.js` | Optimistic edit + undo pattern already used by share actions (actions.js:1773-1784) |
| `tog()` settings-row toggle | `src/pages/settings.js` | Reuse for the permCreate relocation (D-51-10) |
| `teamsList()` | `src/core/store.js:455` | Workspace teams for the share-modal Teams section |
| Doc-sync PUT (`api.saveDoc`, revision-based) | `src/core/api.js:408` → `server.js:1634` (`mergeClientDoc`) | The write path for toggle + team link |
| `node --test` suite | `test/*.test.mjs` | Validation architecture (below) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Doc-sync write path | New dedicated PATCH route (like `allowInviteGuests`, server.js:4924) | A route gated `requireWorkspace(..., 'admin')` **excludes project leads** (D-51-17) — a lead flipping their own project's toggle would get 403. Doc-sync is already lead-aware via server `canManageProject` (server.js:810-813). If a route is preferred, it must add lead-aware authority checks. |
| Server route for create-refusal | Enforcement inside the doc-write funnel | Creation has no POST route today — projects are created client-side and arrive via doc PUT (`createProject` pushes into `D().projects`, actions.js:1528). A 403 on the *whole doc PUT* is wrong (it would reject the entire sync); the refusal must be scoped to the create operation. See Pitfall 1. |

## Package Legitimacy Audit

Not applicable — **this phase installs zero external packages** (zero-new-runtime-deps invariant). No registry checks required.

## Architecture Patterns

### System Architecture Diagram

```
 Owner/admin flips toggle (share modal)
 ┌──────────────────────────────────────────────┐
 │ modals.js shareModal() general-access row    │
 │  toggle ON/OFF  ──►  IN.shareAccess          │
 │  optimistic: mutate(p.private) + toast       │
 └──────────────┬───────────────────────────────┘
                │ doc PUT (revision)
                ▼
 ┌──────────────────────────────────────────────┐
 │ server.js mergeClientDoc()                   │
 │  hiddenFor() ─► canSeeProject (3-term live   │
 │  predicate: public ∨ p.members ∨ p.teams)    │
 │  non-manager? pin private/members/perms/     │
 │  lead/teams/allowInviteGuests                │
 │  permCreate guard (NEW): member + restricted │
 │   + new project? ──► refuse (403-shaped)     │
 └──────────────┬───────────────────────────────┘
                │ merged doc response
                ▼
 ┌──────────────────────────────────────────────┐
 │ Client hydration / 30s poll                  │
 │  project gone from D().projects?             │
 │   ├─ yes ─► localized not-found state        │
 │   └─ no  ─► lists re-render (lock icons      │
 │              already read p.private)         │
 └──────────────────────────────────────────────┘
```

### Recommended change sites (verified this session)

```
src/overlays/modals.js        shareModal(): :252 replace select with toggle; :236-250 people
                              list stays; NEW Teams section + teams note (D-51-5/6/9)
src/actions/actions.js        IN.shareAccess :1787 (add revert-on-refusal); NEW team-link
                              and team-unlink actions; createProject :1528 (lead = creator);
                              submitProject :1562 (affordance gating)
src/core/store.js             canSee :326 (not-found detection); canManageProject :327 (already lead-aware — quote below)
src/pages/settings.js         :52 nav entry delete; :487-493 case 'permissions' delete;
                              permCreate row → General case; permsTable → Members case
src/pages/projects.js         :15,43 lock icons already render p.private — verify only
server.js                     NEW permCreate enforcement in the doc-write funnel; (no new
                              routes strictly required)
src/locales/en.json|fr.json   new keys (teams section, tooltips, toasts, not-found), delete
                              dead keys (settings.perms.guests*, public*, settings.nav.permissions, settings.perms.lead)
```

### Pattern 1: The doc-sync write path (the lead-compatible path)
**What:** Client-side `mutate()` writes into the local doc; `api.saveDoc` PUTs `{revision, doc}`; the server merges via `mergeClientDoc` and returns the merged doc, which the client hydrates.
**Verified manager pinning** (`server.js:1036-1047`, verbatim):
```js
if (prev && !canManageProject(prev, memberId, role)) {
  // Access fields belong to a manager even when the project is visible.
  p.private = prev.private;
  p.members = prev.members;
  p.perms = prev.perms;
  p.lead = prev.lead;
  p.teams = prev.teams;
  p.allowInviteGuests = prev.allowInviteGuests;
}
```
**Verified server manage predicate** (`server.js:810-813`, verbatim):
```js
function canManageProject(p, memberId, role) {
  if (role === 'owner' || role === 'admin') return true;
  return !!memberId && p?.lead === memberId;
}
```
**Verified client manage predicate** (`src/core/store.js:327-330`, verbatim):
```js
export const canManageProject = p => {
  const role = me()?.role;
  return role === 'Owner' || role === 'Admin' || (!!p && p.lead === D().me);
};
```
→ Leads already pass every manage gate on both tiers. This is why D-51-17 is mostly *already true* for existing projects whose `lead` is the creator; the phase's job is guaranteeing the creator *becomes* lead at creation and that the surfaces never route a lead through an admin-only REST route.

**When to use:** toggle flip, team link/unlink, member add/remove from the share modal (the existing `shareAdd`/`shareInvite`/`sharePerm` actions at actions.js:1695-1786 all use this path).

### Pattern 2: Optimistic + revert toast
Existing exemplar (actions.js:1773-1784 `IN.sharePerm`): `const snap = snapshot(); mutate(...); toast(..., { action: t('toast.undo'), onAction: () => restore(snap) })`. D-51-3's revert is the same shape: flip → PUT → on server refusal, `restore(snap)` + error toast.

### Pattern 3: Honest not-found
Verified existing pattern (`src/overlays/modals.js:204-205`, verbatim):
```js
const p = proj(m.id);
if (!p) return H(t('err.projectNotFound'));
```
Keys already exist: `"err.projectNotFound": "Project not found"` (en.json:772) / `"Projet introuvable"` (fr.json:772). Generalize: any view opened on a project absent from `D().projects` renders this state instead of crashing or silently skipping. Note `allTasks()` (store.js:332) and `visibleProjects()` (store.js:321-325) already filter through `canSee`/`proj` gracefully.

### Anti-Patterns to Avoid
- **Gating a lead action behind `requireWorkspace(..., 'admin')`:** Phase 50's project routes (`/projects/:id` PATCH at server.js:4924-4950, `/projects/:id/members` POST/DELETE at server.js:4960-5020) all require admin tier. A lead using them gets 403. Any new route must either accept lead authority or stay off the lead's path.
- **403-ing the entire doc PUT for a restricted create:** the PUT carries the whole workspace doc; a blanket 403 would break unrelated concurrent edits. Scope the refusal to the create operation and return a shaped error the client can localize (D-51-15).
- **Hiding the create affordance when restricted:** D-51-14 explicitly requires disabled-with-tooltip, not hidden.
- **Deleting `p.teams` on unlink without checking last-manager invariants:** `normalizeProjects` (server.js:830-860) forces private projects to keep a manager and non-empty access list — an unlink that empties access on a private project must respect the same invariants server-side.
- **Writing `p.teams` for non-managers through any path:** `mergeClientDoc` already pins it; a dedicated route (if added) must re-check.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Two-state toggle control | New custom toggle component | Existing `tog()` pattern / existing two-state select styling in the general-access row | D-51-2 mandates reusing existing labels; the row already has icon + hint structure |
| Team list rendering | Custom team query | `teamsList()` (store.js:455) and the `pformTeamToggle` checkbox-button pattern (modals.js:182-184) | Same `role="checkbox"` opt-button markup is already used for project-form team pickers |
| i18n catalogue validation | Custom key checker | `npm run i18n:scan` (scripts/i18n-scan.mjs) + `test/catalogue.test.mjs` | The gate already enforces key shape, EN/FR parity, placeholder match, forbidden chars — see Pitfall 4 for the gap |
| Visibility checks | Re-derived predicates on each page | `canSee` / `visibleProjects` / `allTasks` from store.js | One predicate, already funnel-consistent |

## Common Pitfalls

### Pitfall 1: `permCreate` enforcement location — the doc PUT is a merge, not an RPC
**What goes wrong:** Creation is client-initiated (`createProject` pushes into the local doc; the doc PUT ships it). There is no POST /projects route to hang a 403 on. Refusing the whole PUT is wrong; silently stripping the project violates D-51-15 (explicit refusal).
**Why it happens:** The flat-doc sync architecture makes "create" indistinguishable from "sync" at the transport level.
**How to avoid:** Enforce inside the server's doc-write funnel (`updateDoc` / `mergeClientDoc` path, server.js:1634): when the actor is below admin tier and the incoming doc *introduces a project id not in stored*, refuse that operation with a shaped error (e.g. `projectCreateForbidden`) that the client maps to a localized toast and reverts. Read the restriction from the *stored* doc's prefs (never the incoming doc — a client could flip its own pref; D-51-16 "immediately, no cached state" also mandates reading current stored state per request).
**Warning signs:** a test where a member with restriction ON still sees the project appear after retry; or all clients' syncs failing while one member is restricted.

### Pitfall 2: Admin-gated routes vs lead authority
**What goes wrong:** D-51-17 gives leads manage rights, but every Phase 50 dedicated project route is `requireWorkspace(..., 'admin')`. Wiring the share modal to those routes breaks leads silently (403) in API-enabled mode while working in local mode.
**How to avoid:** Route lead-performable writes through doc-sync (Pattern 1), or add explicit lead-aware checks to new routes. Write a test: lead (non-admin workspace role) flips toggle and links a team via the API path.
**Warning signs:** pass in local/demo mode, 403 in server mode.

### Pitfall 3: prefs storage — `permCreate` rides `doc.prefs`, which the *client* writes
**What goes wrong:** `S.prefs` is hydrated from the doc (`S.prefs = stripLegacyLang(...doc.prefs...)`, store.js:257) and shipped back on every save (`{ data, prefs, views }`, store.js:124). If the server reads the restriction from the *incoming* doc's prefs, any member can unlock creation for themselves.
**How to avoid:** server enforcement reads only the **stored** doc's prefs (or better: validate that only admins may change `permCreate` in prefs merge). Note `notifPrefs` are already stripped from docs (server.js:364) — `permCreate` is a *workspace* pref and must stay on the workspace doc, not migrate to `user_notif_prefs`.
**Warning signs:** a member self-elevating creation rights via devtools PUT.

### Pitfall 4: The i18n gate has no dead-key detector today
**What goes wrong:** Success criterion 5 says "the removed-key leak check catches dead entries". Verified: `scripts/i18n-scan.mjs` checks *source literal → catalogue* resolution and placeholder match; `test/catalogue.test.mjs` checks catalogue shape and EN/FR parity. **Neither detects a catalogue key that no source references anymore** (the permGuests/permPublic/permissions-page keys after deletion).
**How to avoid:** either (a) rely on manual deletion + a grep assertion, or (b) add a small dead-key check (scan all `t('…')` keys under src/ and report catalogue keys never referenced, minus a documented allow-list for dynamic keys like `project.template.*` and `common.perm.*` which are built by interpolation). Plan this as an explicit task, not an assumption.
**Warning signs:** `settings.perms.guests` still in en.json/fr.json after the page is gone with nothing failing.

### Pitfall 5: Settings deep-links to the removed page
**What goes wrong:** The nav entry is `'permissions'` in `SET_NAV` (settings.js:52, verbatim `['permissions', 'settings.nav.permissions', 'shield']`), but `?sec=permissions` URLs, remembered last-section state, or `data-r="settings" data-sec="permissions"` references elsewhere would 404/blank after the case is deleted.
**How to avoid:** grep for `sec.*permissions` / `'permissions'` across src/ before deleting; default unknown sections to the first tab.
**Warning signs:** blank settings pane after removal.

### Pitfall 6: Team-link unlink must respect private-project manager invariants
**What goes wrong:** D-51-9's remove action deletes a team id from `p.teams`. Server `normalizeProjects` (server.js:830-860, verified) forces private projects to keep a manager and non-empty access list, and the Phase 49 sweep proved `p.teams` writes are sensitive (whole-team revocation on deletion — T-50-01 comment, server.js:1042-1047).
**How to avoid:** unlink goes through the manager-gated path; add a test that unlinking the only team from a private project doesn't seal it or leak it.

## Code Examples

### Toggle markup replacement (D-51-1/D-51-2)
Replace the `<select data-in="shareAccess">` inside the general-access row (modals.js:252) with a two-state control rendering the same keys. Labels verified at `src/locales/en.json:786-789` (verbatim):
```json
"modal.onlyInvited": "Only people invited",
"modal.everyoneAt": "Everyone at {name}",
"modal.privateHint": "Only people listed above can open this project.",
"modal.workspaceHint": "Anyone in the workspace can view and comment."
```
The existing handler to evolve (`src/actions/actions.js:1787-1797`, verbatim):
```js
IN.shareAccess = el => {
  const p = proj(el.dataset.id);
  if (!p) return;
  if (!canManageProject(p)) return;
  const priv = el.value === 'private';
  mutate(() => {
    p.private = priv;
    if (priv && D().me && !p.members.includes(D().me)) p.members.push(D().me);
  });
  toast(priv ? t('toast.privateProject') : t('toast.publicProject', { name: D().ws.name }));
};
```
Add: `snapshot()` before mutate, and on server-merge refusal `restore(snap)` + `tErr`-style error toast.

### Creator becomes lead (CRT-01)
`createProject` already carries the shape needed (`src/actions/actions.js:1528-1544`, verbatim excerpt):
```js
const p = {
  id: uid('p'),
  ...
  lead: f.lead,
  ...
  members: [...new Set([D().me, f.lead])],
```
Ensure `f.lead` defaults to `D().me` on create (the project form's lead select already exists, modals.js:185-188) and that the server's create-guard grants/keeps lead when the creator is a member.

### Teams section data source
`teamsList()` (`src/core/store.js:455-458`, verbatim):
```js
export function teamsList() {
  const d = D();
  if (!d.teams) d.teams = TEAMS_SEED.map(t => ({ ...t }));
  return d.teams;
}
```
Invite list = `teamsList().filter(tm => !p.teams.includes(tm.id))` (D-51-9); linked list renders inside the teams note with remove action.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `shareAccess` select (2 options) | Two-state toggle, same labels | Phase 51 (D-51-1/2) | Pure markup/handler change |
| Team-derived visibility (`project.teams ∩ member.teams`) | 3-term live predicate: public ∨ p.members ∨ p.teams | Phase 49/50 (server.js:767-794) | Client never re-derives; renders server truth |
| `permGuests` workspace toggle | Per-project `p.allowInviteGuests` (default OFF) | Phase 50 (D-50-7), deleted this phase | Keys `settings.perms.guests*` die |
| "Snapshot semantics" team invite copy | Live team semantics copy | D-50-5 supersedes (D-51-8) | Use "current members … access follows team membership" wording |
| No per-project roles (D-50-1) | Per-project **lead** role | D-51-17 milestone change | Predicates already lead-aware; creation must assign lead |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The 30s notification poll hydrates the client doc, so a visibility change propagates to other clients within one poll cycle without extra machinery | Architecture (D-51-4 mechanics) | Not-found detection could lag; planner should verify the hydration path in main.js/store and may add an explicit refetch on focus |
| A2 | `doc.prefs.permCreate` (workspace doc, shared `S.prefs` object) is the right enforcement read location | Pitfall 3 | If prefs are intended per-user, enforcement must read elsewhere; discuss-phase discretion explicitly granted ("where the server carries permCreate enforcement") |
| A3 | A scoped refusal of the create operation inside the doc-write funnel can be surfaced to the client as a distinct error (not a whole-PUT 403) | Pitfall 1 | If the transport cannot express a scoped refusal, a dedicated create route becomes necessary — replan accordingly |
| A4 | Dynamic i18n keys built by interpolation (`project.template.*`, `common.perm.*`) need an allow-list in any new dead-key check | Pitfall 4 | False positives in the i18n gate |

## Open Questions

1. **Scoped create-refusal error shape** — how does the client distinguish "your create was refused" from a general sync conflict in the PUT response? (Discretion granted; recommend a keyed error in the merge response, with a test.)
2. **Visibility-epoch refetch trigger** — poll-driven detection (A1) vs explicit refetch on window focus/epoch counter in the doc. Recommend: detect disappearance during hydration + render not-found; add focus refetch only if tests show staleness.
3. **Should the toggle flip keep the self-grant behavior?** The existing handler pushes the flipper into `p.members` when going private (actions.js:1794) — keep it (it matches server `mergeClientDoc` behavior at server.js:1055-1058, "Whoever restricts an existing project keeps access").

## Environment Availability

Step 2.6: SKIPPED — no external dependencies beyond the existing runtime (Node + `node --test`, npm scripts already in use; zero new packages by invariant). Verified present: `npm run i18n:scan` (package.json:9), full suite (`npm test` — 1106 pass / 0 fail / 11 pre-existing skips at Phase 50 exit, per 50-05-SUMMARY).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node built-in `node --test` (no test deps) |
| Config file | none — plain `node --test test/` |
| Quick run command | `node --test test/i18n-scan.test.mjs test/catalogue.test.mjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VIS-01 | Toggle flips `p.private`; non-manager PUT cannot flip; lead (non-admin) CAN flip | integration (server) | `node --test test/invite-hierarchy.test.mjs` (extend) or new `test/client-surfaces.test.mjs` | ❌ Wave 0 |
| VIS-01 | Honest not-found: project absent from doc → localized not-found render, no crash | unit (client) | extend existing i18n-* client tests or new file | ❌ Wave 0 |
| CRT-01 | Member creates project → becomes lead; restricted member's create refused; admin unaffected; pref change takes effect on next request | integration (server) | new `test/project-creation.test.mjs` | ❌ Wave 0 |
| CRT-02 | `settings.perms.guests*`/`public*`/nav key gone from BOTH catalogues; no source references; settings renders without the page | unit | `node --test test/catalogue.test.mjs` + dead-key check | ❌ Wave 0 |
| UX-01 | All new strings catalogued EN+FR, placeholders match | gate | `npm run i18n:scan` | ✅ (existing gate) |
| D-51-17 | Team-link/unlink writes: manager-gated; unlink respects private-project manager invariants | integration (server) | extend `test/visibility-team.test.mjs` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run i18n:scan` + touched test files
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/project-creation.test.mjs` — permCreate enforcement + lead-on-create (CRT-01)
- [ ] `test/client-surfaces.test.mjs` — toggle authority matrix (owner/admin/lead/member) + not-found path (VIS-01)
- [ ] Dead-key check (extend `test/catalogue.test.mjs` or `scripts/i18n-scan.mjs`) — CRT-02 criterion 5
- [ ] Shared fixture: workspace with a non-admin lead of a private project

## Security Domain

(security_enforcement not disabled in `.planning/config.json` — section included)

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | **yes — core of this phase** | Server-side authority: `canManageProject` (server.js:810), `requireWorkspace` tier gates, manager pinning in `mergeClientDoc` |
| V5 Input Validation | yes | Server-side body validation patterns already used (`fail(res, 400, …)`, teams array caps at server.js:4882-4886); validate toggle payloads identically if a route is added |
| V1 Injection | no direct change | Catalogue values are forbidden from carrying `<`, `>`, `"` (catalogue contract) — new keys must comply |
| V7 Authz logging | yes (light) | Follow the existing `logInfo` audit pattern on privileged writes (server.js:4949 exemplar) — log toggle flips and team links |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Member self-unrestricting `permCreate` via crafted doc PUT (prefs ride the doc) | Elevation of Privilege | Server reads restriction from **stored** doc only; optionally restrict pref-key writes to admins (Pitfall 3) |
| Lead authority confusion — admin-only REST route returns 403 for a legitimate lead (or worse, a route forgets the lead check) | Elevation / DoS-on-UX | One authority matrix test: owner/admin/lead/member × toggle/link/unlink/create (Pitfall 2) |
| Team unlink silently revoking whole-team access on private projects | DoS / Tampering | Manager-gated unlink + private-project manager invariant tests (Pitfall 6) |
| Existence oracle via differentiated errors | Information Disclosure | Byte-identical 404s invariant (STATE.md) — the not-found surface is client-side rendering, server errors stay unchanged |

## Sources

### Primary (HIGH confidence — read this session)
- `src/overlays/modals.js:202-255` — shareModal markup, general-access row, PERMS
- `src/actions/actions.js:1528-1544, 1684-1797` — createProject, share actions, IN.shareAccess
- `src/core/store.js:314-332, 455-461` — canSee, canManageProject, projOrder, teamsList
- `server.js:767-860, 1014-1080, 4911-5020, 5085-5140` — predicate, normalizeProjects, mergeClientDoc, project routes, invite route
- `src/pages/settings.js:52, 274, 487-493` — SET_NAV permissions entry, S.prefs, case 'permissions'
- `src/pages/members.js:56, 100` — permsTable render + definition
- `scripts/i18n-scan.mjs:1-60` — gate scope (no dead-key detection)
- `test/catalogue.test.mjs:1-50` — catalogue contract
- `src/locales/en.json:772, 786-789, 1235-1241`; `src/locales/fr.json:772` — verified keys
- `package.json:9-11` — i18n gate wiring
- `.planning/phases/50-*/50-05-SUMMARY.md` — Phase 50 exit state, suite green

### Secondary
- `.planning/phases/49-*/49-CONTEXT.md`, `.planning/phases/50-*/50-CONTEXT.md` — upstream decisions (D-50-5, D-50-7, D-49-3)
- `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/PROJECT.md`

## Metadata

**Confidence breakdown:**
- Surface/change sites: HIGH — every file:line read this session
- Server enforcement design: HIGH on constraints (what exists/what doesn't), MEDIUM on the exact refusal transport (A3 — planner decision)
- i18n gate behavior: HIGH — script and tests read directly

**Research date:** 2026-11-08
**Valid until:** 2026-12-08 (in-repo research; stable unless the milestone's server model changes)
