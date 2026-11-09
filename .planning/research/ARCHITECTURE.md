# Architecture Patterns

**Domain:** v2.1 UI/UX batch — invite modal persistence + project chips, searchable team members, unified project settings modal with per-team perms, projects table columns
**Researched:** 2026-11-09
**Method:** direct codebase investigation (server.js, src/overlays/modals.js, src/actions/actions.js, src/pages/, src/core/)

---

## Part 1 — Per-TEAM project perms: storage/keying decision

### How access works today (the funnel)

One read funnel governs every access decision:

- `canSeeProject(p, memberId, memberTeams)` — **server.js:800-805**. Short-circuit order: public (`!projectIsPrivate`) → `p.members.includes(memberId)` → `p.teams` ∩ `memberTeams` ≠ ∅.
- `memberCanReadProject(p, wsId, memberId)` — **server.js:813-818**. Async wrapper that resolves the caller's live teams via `teamsOfMember(wsId, memberId, …)` (**server.js:816**, also :857) then re-enters `canSeeProject`. Consumed by: `hiddenFor` (:851-865 via :860), reminder pass (:1466), email mirror (:1580), digest scope (:1360), MCP transparency view (:4996).
- Label mirror `projectAccessReason(p, memberId, memberTeams)` — **server.js:828-835** (Phase 52 transparency view). **Must be updated in lockstep** if the predicate gains a term, or reason labels will diverge from reality.

### How `p.perms` works today

- `p.perms` is a **member-id-keyed plain object** with values from `PERMS = ['Can view','Can comment','Can edit','Full access']` (client constant **src/overlays/modals.js:195**; stored strings, display translated via `permLabel` :200-201).
- It is **display/permission-tier only today — it does NOT gate visibility**. `canSeeProject` never reads `p.perms`; a member in `p.members` gets read access regardless of their perm tier. The share modal writes `p.perms[mid]` through `IN.sharePerm` (**src/actions/actions.js:1833**).
- Sanitized on member removal: **server.js:1948-1958** (`Object.fromEntries(Object.entries(p.perms).filter(([k]) => !hit(k)))`).
- Guarded on write: non-manager doc-PUTs get `p.perms = prev.perms` restored — **server.js:1094** (inside the `canManageProject` block :1090-1102, which also pins `private/members/lead/teams/allowInviteGuests`).
- Validated loosely on normalize: **server.js:899** (`if (p.perms && typeof p.perms !== 'object') delete p.perms`).

### Decision: `p.perms` gains a team-keyed sub-object — NO new field

Reuse `p.perms` with a **namespaced sub-key** `team:<teamId>` (or an inner map `p.perms.teams = { [teamId]: perm }`). Recommendation: **flat `p.perms['team:'+teamId]`**, because:

1. Every existing sink treats `p.perms` as an opaque id→perm object: the removal sweep at server.js:1950 filters by key without interpreting it (works unchanged), the write guard at :1094 copies it whole (works unchanged), normalize at :899 accepts any object (works unchanged). A flat map requires **zero changes** to mergeClientDoc, normalizeProjects, or the removal path.
2. Member keys and team keys can never collide if team ids are namespaced (`team:` prefix), so `Object.entries` consumers stay safe.
3. No migration: the field already exists in stored docs; absent team keys = "no team override".

### What server changes ARE required

The critical finding: **per-team perms must change `canSeeProject`'s contract, not just add a field.** Today team access is binary (member of a linked team ⇒ full read). To make `view/comment/edit/full` real, the predicate that answers "what can this member do" needs the team tier:

1. **New helper** `projectPermFor(p, memberId, memberTeams)` (server.js, near :805): resolve effective perm — lead/membership `p.perms[memberId]` takes precedence over team entry `p.perms['team:'+teamId]` for the best (highest-rank) linked team; default tier for members is `Can edit` (mirrors share modal's default at modals.js:275: lead='Full access', members='Can edit', guests='Can comment'), team-only members default to their team entry or 'Can edit'.
2. **`canSeeProject` stays a visibility predicate** (server.js:800-805) — per-team perms do NOT remove read access; they only tier it. This keeps `memberCanReadProject`, `hiddenFor`, and all 10 call sites untouched. The gate changes live in **write paths** (task edit/comment/board-move routes) which currently only check read; those need `projectPermFor` checks (e.g. comment/edit require ≥ 'Can edit').
3. **`projectAccessReason`** (server.js:828-835): add a team-perm reason only if the transparency view should distinguish tiers — otherwise leave as-is (M-09 says "reuse the existing per-person perms model — no new role concept", so coarse reasons can stay).
4. **Validation on doc-PUT**: extend server.js:899 normalize to whitelist team-key shape (`/^team:/` keys must reference known team ids; values ∈ PERMS). Cheap, fail-loud on garbage.
5. **mergeClientDoc needs NO change** — :1094 already restores `p.perms` wholesale for non-managers; a manager's client doc writes it through the normal doc-PUT path (**server.js:1700** → mergeClientDoc).

**Build order consequence: server perm-resolution helper + write-route gating BEFORE the settings modal UI ships the team-perm pickers** — otherwise the UI writes values nothing enforces.

---

## Part 2 — Invite modal: email persistence + projects chips

### The persistence bug and its fix

- The email textarea at **src/overlays/modals.js:312** renders `esc(S.ui.inviteDraft || '')` but carries **no `data-in` attribute** — so keystrokes never update state, and any `render()` triggered by role/team/scope interaction (e.g. `A.invProjToggle` at actions.js:2025, `IN.invRole` at :2040) re-renders the full DOM via `wrap()` at modals.js:45 and **wipes the unsaved draft**. (`S.ui.inviteDraft` is set at open — actions.js:1880 — and only captured on submit at :1927-1928.)
- Fix, matching the existing two-path binding dispatch:
  - **src/actions/events.js:56-60** handles non-change `input` events (`IN[el.dataset.in]?.(el, e)` when `!isChangeEl(el)`); :61-65 handles `change` events for selects/checkboxes. A textarea rides the `input` path.
  - Add `data-in="inviteDraft"` to the textarea (modals.js:312) and a handler **`IN.inviteDraft = el => { S.ui.inviteDraft = el.value; }`** next to the other IN handlers in **src/actions/actions.js** (IN.sharePerm :1833, IN.shareAccess :1854, IN.invRole :2040, IN.invGuest :2046). **No render() call in the handler** — that's the whole point; state updates silently and re-renders restore the value from store.
- `A.invite` (actions.js:1879-1890) already resets `S.ui.inviteDraft = ''` on open — no change needed there.

### Projects chips ride the existing scope payload — mostly wiring, little plumbing

The payload already carries project scope end-to-end:

1. Client state: `S.ui.inviteScope = { teams: [], projects: [] }` — **actions.js:1885**.
2. Picker state: `A.invProjToggle` — **actions.js:2025-2039** (renders scope project chips via `scopePicker('proj', scope.projects, 'invProjToggle', 'folder')` at **modals.js:324** — the chips UI already exists).
3. Payload build: `A.submitInvite` — **actions.js:1934-1942** — dedupes `st.projects` into `scope.projects` and sends for Member/Guest roles (null for Admin, :1934-1936).
4. API call: `api.createInvites(list, API_ROLE[role], teams, scope)` — **actions.js:1983**.
5. Server: `POST /api/workspaces/:slug/invites` — **server.js:5187**. For member-tier callers, `body.project` is validated (existence + `allowInviteGuests === true`, **server.js:5217-5226**) and stored as the invite's `project` column (**server.js:5300**, insert with `scope: null` + `project`; the VIS-04 comment at :5306 notes only the member guest path scopes an invite to a project).

**Gap to close — "guest = exactly one project" (M decision):** today the server enforces project only for **member-tier** callers (server.js:5213 gate). An **admin/owner** Guest invite with zero projects currently sails through. Changes:

- Server (**server.js:5196+**, after role resolution): when `role === 'viewer'`, require exactly one project regardless of caller tier — validate `body.project` (or `body.scope.projects` length === 1) exists, reuse the same keyed refusals (`inviteMemberProjectRequired` :5218, new `inviteGuestProjectRequired` if needed).
- Client (`A.submitInvite`, actions.js:1934-1942): when `role === ROLE_GUEST_UI`, degrade scope to exactly `{ projects: [one] }` — client-side validation toast if 0 or >1 selected (mirror of the server keys). The scope picker may need a radio-like behavior for Guest (selecting a second project replaces the first), reusing `A.invProjToggle`.
- Note the server reads a flat `body.project`, while the client sends `scope.projects[]` — check `src/core/api.js` `createInvites` for how scope flattens into the POST body before choosing where the "exactly one" clamp lives.

### Searchable members box in teamModal (`foldForSearch`)

- `teamModal` lives in **src/features/teams.js:11**; the members fieldset hint is at :45.
- The pattern to copy is the **share modal member search**: needle from `S.ui.shareQ` folded through `foldForSearch` (modals.js:203), filter over `D().members` (:226-233), bound input `data-in="shareQ"` (:218) with no render in the IN handler. `foldForSearch` is **src/core/utils.js:22** (accent/token folding; same family used in pages/members.js:35, pages/settings.js:144-145).
- New state `S.ui.teamMembersQ` + `IN.teamMembersQ` handler; filter the roster inside the teamModal fieldset. Pure client feature — no server change.

---

## Part 3 — Unified project settings modal (replaces projectModal + shareModal)

### Today's two modals

| Modal | Location | Renders | Save path |
|---|---|---|---|
| `projectModal` | **src/overlays/modals.js:156-194** | name/desc/icon/color/teams/lead/due (+template on create) via `S.ui.pform`, `data-in="pform"` fields | `data-submit="submitProject"` form (:161), footer `data-a="submitProject"` (:193) — rides the doc-PUT optimistic path |
| `shareModal` | **src/overlays/modals.js:202-289** | member search+invite (:216-238), Teams section (:247-268, live-link semantics per D-50-5), People-with-access with per-member perm selects (:270-284, `data-in="sharePerm"`), General Access toggle (:285-286, `data-in="shareAccess"`) | **no form submit — every control is an immediate-action** (`A.shareInvite`, `A.shareAdd`, `A.shareTeamInvite/Remove`, `IN.sharePerm` actions.js:1833, `IN.shareAccess` :1854 — each pushes the doc itself with snapshot-revert) |

Dispatcher: **src/overlays/modals.js:41-43** — `case 'project' → projectModal`, `case 'share' → shareModal` inside the central modal `wrap()`. `canManageProject` client-side (modals.js:159, :206) mirrors server.js:837-840.

### Render/state impact — LOW, the architecture makes it cheap

1. **One case label changes**: merge into a single `case 'settings'` (or keep `project` and fold share content in) at modals.js:41-43. Both `data-a="share"` and `data-a="newProject"/"editProject"` entry points retarget to the same modal type.
2. **Two interaction models coexist naturally**: the General section keeps the form+submit model (`pform` state, `S.ui.pform` at modals.js:157); the Access section keeps immediate-action controls (sharePerm/shareAccess handlers). The unified modal is a `<form>` body whose footer Save commits General fields, while Access controls keep acting inline (they already each `render()` and `pushNow()` independently). No conflict — the share controls don't touch `pform`.
3. **New state slots**: `S.ui.settingsTab` ('general' | 'access') if sectioned by tabs, or none if stacked sections; `S.ui.shareQ` reused as-is for the member search; team perm selects add `IN.teamPerm` (mirror of `IN.sharePerm` at actions.js:1833, writing `p.perms['team:'+tid]`).
4. **Net component count goes DOWN**: `projectModal` (156-194) and `shareModal` (202-289) are deleted; one new renderer (~300 lines) replaces them. Footer, dispatcher case, and entry-point actions (`A.share`, `A.editProject`) retarget.
5. **Server impact of the merge: zero beyond Part 1.** Both modals already write through the same doc-PUT path; per-team perms ride `p.perms` (guarded at server.js:1094 for non-managers, normalized at :899).

### Projects table + Share button (mostly exists)

- Table columns at **src/pages/projects.js:56-64**: Project / Status (`pStatus`) / **Lead** (:61, `av(p.lead)`) / **Teams** (:61, `projTeams(p)`) / Progress / Tasks / Start / **Due** (:61, `fmtDate(p.due)`) / Last activity. Missing: **Members count** column (add `p.members.length` next to Teams — the v2.1 decision says count, not avatar stack). Status labels come from `PSTAT` (projects.js:70-73) — M-10 wants the pill + task-based `progressOf` (:51, :61 already do exactly this). Mostly a column-insert + label tweak, no architecture change.
- Project page header buttons at **src/pages/project.js:74-76**: avatar-stack `data-a="share"` (:74), `user-plus` icon `data-a="share"` (:75), labeled Share `data-a="share"` (:76). M-13 = delete :74-75, keep :76; all three already point at the same action, so the unified modal swap is transparent to them. Also `src/views/project-overview.js:43` renders an `avStack` pill (leave or align per spec).

---

## Recommended build order (server-before-client dependency)

1. **Server perms model first**: `projectPermFor` helper + team-key normalization (server.js:899 area) + write-route gating + lockstep check on `projectAccessReason` (server.js:828-835). No UI depends on it yet; everything downstream writes through it.
2. **Invite modal fix** (independent, small): `data-in="inviteDraft"` (modals.js:312) + `IN.inviteDraft` (actions.js, near :2040) — ships alone, zero server change.
3. **Guest-one-project clamp**: server.js:5196+ role-based validation + client scope clamp in `A.submitInvite` (actions.js:1934-1942) — depends on reading `createInvites` in src/core/api.js to pick the payload shape.
4. **Unified settings modal UI** (depends on 1): merge projectModal+shareModal (modals.js:156-289), add `IN.teamPerm`, retarget `A.share`/`A.editProject` and dispatcher (modals.js:41-43).
5. **Team modal search + wording** (independent): `foldForSearch` box in teams.js:11 fieldset.
6. **Projects table columns + Share-button cleanup** (independent): projects.js:56-64, project.js:74-76.

Steps 2, 5, 6 are parallelizable; 1 → 4 is a hard ordering; 3 is small and independent of 1/4.

---

## Patterns to Follow

### Pattern 1: data-in silent-state binding (no render in handler)
**What:** `IN.x` handlers mutate `S.ui` only; re-renders read state back into value attributes.
**Where:** IN.sharePerm (actions.js:1833), IN.invRole (:2040); dispatch at events.js:56-65.
**Why:** full-DOM `render()` on any state change means any handler that re-renders loses focus/draft — the invite-draft bug is exactly this missing binding.

### Pattern 2: immediate-action share controls (no form submit)
**What:** Access-level edits push the doc per-control with snapshot revert (IN.shareAccess at actions.js:1854, snapshot-revert shape noted at :1736).
**When:** reuse for team-perm selects in the unified modal.

### Pattern 3: manager-guarded access fields on doc-PUT
**What:** non-managers can never alter access fields — server restores them (server.js:1090-1102).
**Consequence:** per-team perms inherit this protection for free by living inside `p.perms`.

## Anti-Patterns to Avoid

### Adding a new top-level project field for team perms
**Why bad:** a `p.teamPerms` field would need its own restore line at server.js:1090-1102, its own sanitize in the removal sweep (:1948-1958), and its own normalize branch — three changed sinks instead of zero.
**Instead:** namespaced keys inside `p.perms`.

### Gating visibility per perm tier
**Why bad:** `canSeeProject` (server.js:800-805) is the single visibility term consumed by 10+ call sites; tiered visibility would fork it.
**Instead:** keep visibility boolean; tier **capabilities** in write routes via the new helper.

## Sources

- Direct file reads: server.js (800-865, 1041-1119, 1935-1963, 5185-5314), src/overlays/modals.js (156-344), src/actions/actions.js (1868-2050, 1736-1858), src/actions/events.js (40-79), src/pages/projects.js (20-75), src/pages/project.js (74-76), src/features/teams.js, src/core/utils.js
- PROJECT.md milestone decisions M-09..M-13 (.planning/PROJECT.md:26-33)
