# Phase 53: Member & Project Experience - Pattern Map

**Mapped:** 2026-11-09
**Files analyzed:** 12 (all modifications to existing files; zero new source files — new tests only)
**Analogs found:** 12 / 12

All analog paths verified git-tracked (`git ls-files` non-empty). Every "new" UI element has a verbatim in-repo analog — this is a reassembly phase.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` (`projectPermFor` helper near :805) | service | request-response (access gate) | `canSeeProject` server.js:800-805 + `projectAccessReason` :828-835 | exact |
| `server.js` (`normalizeProjects` extension :899) | model | transform | `normalizeProjects` server.js:872-901 (self) | exact |
| `server.js` (guest validator, invite create :5187-5229 + edit/accept) | middleware | request-response | `wsInviteMatch` POST handler server.js:5187-5229 | exact |
| `mcp.js` (mirror lockstep, :183 region) | service | request-response | `canReadProject` mcp.js:183-197 (self) | exact |
| `src/overlays/modals.js` (unified settings modal — replaces `projectModal`+`shareModal`) | component | request-response + event-driven | `projectModal` :156-194 + `shareModal` :202-289 | exact |
| `src/overlays/modals.js` (invite modal polish :293-344) | component | event-driven | `inviteModal` :293-344 (self) | exact |
| `src/actions/actions.js` (`IN.inviteDraft`, `IN.teamPerm` handlers) | controller | event-driven | `IN.sharePerm` :1833-1853, `IN.shareAccess` :1854-1878, `IN.invRole` :2040-2043 | exact |
| `src/features/teams.js` (searchable members box; hint swap) | component | request-response (search) | `shareModal` search block modals.js:203-236 | role-match |
| `src/pages/projects.js` (Members column + gear column) | component | CRUD (render) | table renderer projects.js:56-64 (self) | exact |
| `src/pages/project.js` (Share dedup :74-76) | component | event-driven | header buttons project.js:73-79 (self) | exact |
| `src/pages/members.js` (remove team invite button :174) | component | render | `pageTeam` acts block :174 (self) | exact |
| `test/helpers/visibility-fixture.mjs` + `test/mcp.test.mjs` (oracle extension) | test | batch | `VISIBILITY_MODEL`/`MIRROR_MODEL` harness (fixture:1-40; mcp.test.mjs:739-761) | exact |

## Pattern Assignments

### `server.js` — `projectPermFor` (service, request-response)

**Analog:** `canSeeProject` at server.js:800-805 and `canManageProject` at :837-840 — same signature style `(p, memberId, memberTeams = [])`, synchronous, pure predicate over the doc.

**Core funnel pattern** (server.js:800-805):
```js
function canSeeProject(p, memberId, memberTeams = []) {
  if (!projectIsPrivate(p)) return true;
  if (!memberId) return false;
  if (Array.isArray(p.members) && p.members.includes(memberId)) return true;
  return Array.isArray(p.teams) && p.teams.length > 0 && memberTeams.some(t => p.teams.includes(t));
}
```

**Manager gate (UNCHANGED per D-01)** (server.js:837-840):
```js
function canManageProject(p, memberId, role) {
  if (role === 'owner' || role === 'admin') return true;
  return !!memberId && p?.lead === memberId;
}
```

**Guidance for `projectPermFor`:** copy the `(p, memberId, memberTeams = [])` shape; return one of `PERMS` (['Can view', 'Can comment', 'Can edit', 'Full access'], modals.js:195). Lead/manager ⇒ 'Full access'; read `p.perms['team:'+t]` for intersecting teams (best-of vs direct perm per A3). Do NOT touch the funnel above — D-03 keeps visibility boolean.

**Label mirror pattern** (server.js:828-835) — the lockstep shape any mirror must copy:
```js
function projectAccessReason(p, memberId, memberTeams = []) {
  if (!projectIsPrivate(p)) return 'everyone';
  if (!memberId) return null;
  if (p.lead === memberId) return 'lead';
  if (Array.isArray(p.members) && p.members.includes(memberId)) return 'member';
  if (Array.isArray(p.teams) && p.teams.length > 0 && memberTeams.some(t => p.teams.includes(t))) return 'team';
  return null;
}
```

### `server.js` — `normalizeProjects` extension (model, transform)

**Analog:** itself, server.js:872-901. The extension site is the perms line:

```js
// server.js:899 — today only an object check; extend in place:
if (p.perms && typeof p.perms !== 'object') delete p.perms;
// ADD: 'team:'-prefixed keys must reference known team ids and values ∈ PERMS;
// dangling team keys swept (p.teams precedent at D-49-6 comment, :879-882).
```

Pattern to follow: in-place mutation, comment-tagged with decision id (`/* [D-…] */`), fail-safe (delete invalid, never throw).

### `server.js` — guest validator (middleware, request-response)

**Analog:** the invite create gate, server.js:5187-5229 — keyed refusals, one cause per check:

```js
// server.js:5213-5226 — the member-tier gate (the shape to extract into a shared helper)
let inviteProject = null;
if (ROLE_RANK[ctx.membership.role] < ROLE_RANK.admin) {
  if (role !== 'viewer') {
    return fail(res, 403, 'inviteMemberRoleCeiling', 'Members can only invite guests (viewers) to a project');
  }
  inviteProject = String(body?.project || '');
  if (!inviteProject) return fail(res, 400, 'inviteMemberProjectRequired', 'Choose a project for this guest invite');
  const currentDoc = JSON.parse(ctx.ws.doc);
  const project = (Array.isArray(currentDoc?.data?.projects) ? currentDoc.data.projects : []).find(p => p?.id === inviteProject);
  if (!project) return fail(res, 400, 'inviteMemberProjectRequired', 'Unknown project');
  if (project.allowInviteGuests !== true) {
    return fail(res, 403, 'inviteGuestToggleOff', 'Guest invites are off for this project');
  }
}
```

**Error handling pattern:** `fail(res, <status>, '<keyedCode>', '<message>')` — every distinct cause gets its own key. RESEARCH.md anti-pattern: ONE shared helper (`validateGuestInviteShape(role, projects)`) used by create + edit + accept + MCP, never per-path inline copies. Note the admin/owner path today has NO guest-project check (A1/A2) — the shared helper fills that gap.

### `mcp.js` — lockstep mirror (service, request-response)

**Analog:** itself, `canReadProject` mcp.js:177-197. Hand-maintained mirror with a mandatory comment header:

```js
/* [2026-11-07 D-49-2/D-49-4, 2026-11-08 D-50-5] Mirror of memberCanReadProject
   (server.js) without the server import: ... Computed per call — never
   cached across requests. */
async function canReadProject(ctx, p) {
  if (!p || typeof p !== 'object') return false;
  if ((ROLE_RANK[ctx.membership.role] || 0) >= ROLE_RANK.admin) return true;
  if (p.private !== true) return true;
  const mid = ctx.membership.member_id;
  if (!mid) return false;
  if (Array.isArray(p.members) && p.members.includes(mid)) return true;
  const rows = await db.all('select team_id from team_members where workspace_id = ? and user_id = ?', [ctx.ws.id, ctx.membership.user_id]);
  const mine = new Set(rows.map(r => r.team_id));
  return pTeams.some(t => mine.has(t));
}
```

**Rule:** any funnel/perm change touching server.js ships in ONE lockstep commit with the mcp.js mirror + client `canSee` + oracle cells (Pitfall 1, 09a9c41 class).

### `src/overlays/modals.js` — unified settings modal (component, hybrid)

**Analog A (General tab — form + submit model):** `projectModal` modals.js:156-194.

Imports/state pattern (lines 157-159):
```js
export function projectModal(m, H) {
  const f = S.ui.pform;
  const err = S.ui.errors.pname;
  const leadLocked = !!m.edit && !canManageProject(proj(m.id));
```

Field-binding pattern — every input carries `data-in` (+ `data-f` for form fields), every button carries `data-a`:
```js
// :164 text input with error state
<input class="input ${err ? 'is-error' : ''}" id="p-name" data-in="pform" data-f="name" value="${esc(f.name)}" ...>
// :185 select, gated disabled for non-manager
<select class="select" id="p-lead" data-in="pform" data-f="lead" ${leadLocked ? 'disabled' : ''}>...
// :166 textarea
<textarea class="textarea" id="p-desc" data-in="pform" data-f="desc" rows="2" ...>${esc(f.desc)}</textarea>
```
Form + footer (lines 161, 193): `<form class="modal-b" data-submit="submitProject">` … `<div class="modal-f">…<button class="btn btn-primary" data-a="submitProject">`.

**Analog B (Access tab — immediate-action model):** `shareModal` modals.js:202-289.

Per-person perm dropdown — the exact pattern the per-team perm rows copy (lines 270-283), including the non-manager read-only branch and the default-perm precedence (line 275):
```js
const perm = id === p.lead ? 'Full access' : perms[id] || (x.role === 'Guest' ? 'Can comment' : 'Can edit');
return `...${id === p.lead || !canManage
  ? `<span class="muted" ...>${esc(permLabel(perm))}</span>`
  : `<select class="select" ... data-in="sharePerm" data-id="${p.id}" data-mid="${id}" ...>
       ${PERMS.map(q => `<option value="${q}" ${q === perm ? 'selected' : ''}>${permLabel(q)}</option>`).join('')}
       <option value="__remove">${t('act.removeAccess')}</option></select>`}...`;
```

Non-manager lock hint (lines 212, 215): `${lockHint}` = `<div class="alert info">…${t('modal.shareLockHint')}</div>` — reuse for the Access tab read-only banner.

Teams section (lines 247-268): `shareTeamInvite` / `shareTeamRemove` buttons — the linked-teams list rows are where per-team perm dropdowns replace the remove-only rows (D-02: default option 'Can edit' preselected, same as :219 shareInvite select).

General access toggle (line 286): `<input type="checkbox" class="toggle" data-in="shareAccess" data-id="${p.id}" ... ${canManage ? '' : 'disabled'}>`.

**Tab bar:** no in-repo tabbed modal exists, but the page tab bar pattern (project.js:81-88, `role="tablist"` + `aria-current`) and the modal header `H(title, sub)` helper (modals.js:34-35) are the two patterns to compose. The unified modal replaces both `case 'project'` and `case 'share'` in the dispatcher (modals.js:40-43) — keep dispatch names per Pitfall 7; D-05 = open with a `tab` field in the modal state object (`openModal({ type: 'projectSettings', id, tab: 'access' | 'general' })`).

**PERMS constants to reuse verbatim** (modals.js:195-201):
```js
export const PERMS = ['Can view', 'Can comment', 'Can edit', 'Full access'];
const PERM_KEYS = Object.fromEntries(PERMS.map(p => [p, p.split(' ').pop().toLowerCase()]));
const permLabel = p => t('common.perm.' + (PERM_KEYS[p] ?? PERM_KEYS[PERMS[0]]));
```

### `src/overlays/modals.js` — invite modal (component, event-driven)

**Analog:** itself, :293-344. Two exact changes:

1. **INVT-01 — the textarea at :312 has NO `data-in`** (verified this session). Fix:
```html
<!-- :312 — ADD data-in (currently absent) -->
<textarea class="textarea ${err ? 'is-error' : ''}" id="inv-emails" data-in="inviteDraft"
  placeholder="name@company.com, another@company.com" rows="3" autofocus>${esc(S.ui.inviteDraft || '')}</textarea>
```

2. **INVT-02 — Projects chips already render** via `scopePicker` (:303-309, called at :324 with `'invProjToggle'`): reuse the chip markup verbatim. D-06 disable+hint goes on the `inv-submit` footer button (:343) — add `disabled` + a localized hint span when `guest && scope.projects.length !== 1`.

### `src/actions/actions.js` — handlers (controller, event-driven)

**Analog 1 — silent draft binding (INVT-01).** `IN.shareQ` at :1714-1717 re-renders for search, but the draft must NOT (Pitfall 4 — full-DOM render wipes unbound/focus):
```js
// :1714 — search pattern; the draft handler omits render()
IN.shareQ = el => { S.ui.shareQ = el.value; render(); };
// NEW next to IN.invRole (:2040):
IN.inviteDraft = el => { S.ui.inviteDraft = el.value; };  // silent-state, NO render
```
Dispatch wiring is already live (events.js:55-65): textarea rides the `input` listener via `IN[el.dataset.in]?.(el, e)`; selects/checkboxes ride `change` (`isChangeEl` at events.js:55).

**Analog 2 — per-team perm handler (PSET-02 UI).** `IN.sharePerm` at :1833-1853 is the exact model: manager guard → mutate `p.perms[key]` → optional toast:
```js
IN.sharePerm = el => {
  const p = proj(el.dataset.id);
  if (!p) return;
  if (!canManageProject(p)) return toast(t('err.cannotChangeAccess'), { kind: 'err' });
  ...
  mutate(() => { p.perms = p.perms || {}; p.perms[mid] = el.value; });
};
// NEW: IN.teamPerm reads el.dataset.tid → key 'team:'+tid; keyed by team id, never DOM position.
```

**Analog 3 — optimistic push with revert.** `IN.shareAccess` :1854-1878:
```js
const snap = snapshot();
mutate(() => { p.private = priv; ... });
render();
const res = await pushNow();
if (!res.ok) { restore(snap); render(); toast(t('err.cannotChangeAccess'), { kind: 'err' }); }
```

**Analog 4 — invite scope toggles.** `A.invProjToggle` :2025-2031 (guest single-select constraint at :2029) and `A.invite` reset block :1879-1890 (`S.ui.inviteDraft = ''` on open). D-06 client disable logic reads `S.ui.inviteRole` + `S.ui.inviteScope.projects`.

**Analog 5 — modal open with state.** `A.share` :1708-1713:
```js
A.share = el => { const id = el.dataset.id || curProjectId(); S.ui.shareQ = ''; S.ui.pop = null; openModal({ type: 'share', id }); };
// Retarget: type 'projectSettings' with tab: 'access' (Share btn) or 'general' (gear), D-05.
```

### `src/features/teams.js` — searchable members box (component, search)

**Analog:** the share-modal autocomplete, modals.js:203-236. Copy the search-input + filtered-checklist composition onto the existing checkbox fieldset at teams.js:33-45:

Existing list to retrofit (teams.js:34-44):
```js
<div class="panel" style="max-height:220px;overflow-y:auto;padding:4px">${people
  .map(x => `<label class="mi" ...><input type="checkbox" class="check" data-a="tformMember" data-id="${x.id}" ${f.members.includes(x.id) ? 'checked' : ''}>...`)
  .join('')}</div>
```
Search pattern to copy (modals.js:203, 224-236): needle via `foldForSearch(S.ui.x || '').text`; input with `data-in` + filtered `.map(...)` or a no-match row; **checked state must survive re-renders** — it does because it reads `f.members`, so the search state rides `S.ui` (e.g. `S.ui.teamSearch`) with a silent or rendering handler. Hint swap at :45: replace `t('page.team.membersHint')` with the owner's TEAM-02 sentence key.

### `src/pages/projects.js` — table columns (component, render)

**Analog:** itself, the table row renderer at :56-64. Existing cells to mirror verbatim for the new Members column: `${avStack(p.members, 3)}` (already in the list view :52) and for status/date `${pStatus(p.status)}` / `${fmtDate(p.due)}` (:61 — already present in table). New gear column copies the existing last-column pattern:
```js
// :61 last cell — the ⋯ menu; the gear cell is a sibling ibtn alongside it
<td><button class="ibtn ibtn-sm" data-a="ctxBtn" data-ctx="project" data-id="${p.id}" aria-label="${t('a11y.settings.options')}">${ic('ellipsis', 14)}</button></td>
// NEW: <td><button class="ibtn ibtn-sm" data-a="projectSettings" data-id="${p.id}" data-tab="general" aria-label="${t('a11y.projectSettings')}">${ic('settings', 14)}</button></td>
```
Add `<th>` header for Members + gear next to the trailing `<th></th>` (:56). Tooltip doctrine: coarse codes only (Pitfall 8 / T-52-03).

### `src/pages/project.js` — Share dedup (component, event-driven)

**Analog:** itself, the acts row :73-79. All three Share buttons dispatch `data-a="share"`:
```js
<button class="row" data-a="share" data-id="${p.id}" ...>${avStack(p.members, 5, 'md')}</button>   // :74 DELETE
<button class="ibtn ibtn-sm" data-a="share" data-id="${p.id}" data-tip="${t('a11y.addMember')}" ...>${ic('user-plus', 15)}</button>  // :75 DELETE
<button class="btn btn-secondary btn-sm hide-m" data-a="share" data-id="${p.id}">${ic('share-2', 13)}${t('act.share')}</button>       // :76 KEEP → deep-link Access tab
```
M-13: delete :74-75, keep :76. The gear at :77 (`data-a="editProject"`) retargets to the unified modal General tab. Dead `a11y.addMember` key + avatar-stack usage removed in the same commit (UX-01 gate).

### `src/pages/members.js` — team invite button removal

**Analog:** itself, `pageTeam` acts block :174:
```js
${isMemberAdmin() ? `<button class="btn btn-secondary" data-a="invite">${ic('user-plus', 14)}${t('act.inviteToWorkspace')}</button>` : ''}
```
TEAM-03: delete this conditional (TEAM-03: invites only via Workspace > Members). Delete orphaned keys in the same commit.

### `test/helpers/visibility-fixture.mjs` + `test/mcp.test.mjs` — oracle extension (test, batch)

**Analog:** the fixture header contract (fixture :1-26) and the parity harness (mcp.test.mjs:739-761):
```js
// fixture:5-8 — the anti-tautology contract to preserve:
//   VISIBILITY_MODEL and MIRROR_MODEL below are hand-derived from the
//   predicate — NEVER read from production code.
// mcp.test.mjs:750-760 — the mirror-parity shape:
for (const mid of ['m_plain', 'm_team', 'm_scoped', 'm_guest']) {
  const server = await parVisibleDocIds(mid);
  const mirror = await parMirrorIds(mid);
  assert.deepEqual(mirror, server.ids, `${mid}: mirror set === server set`);
  assert.deepEqual(mirror, [...VISIBILITY_MODEL[mid]].sort(), `${mid}: both engines match the D-50-5 model`);
}
```
Extend with team-perm oracle cells (view-only team member, revoked team, dangling team id) as hand-derived rows, plus a pin-block regression test: non-manager PUT with stale/missing `p.perms` team keys → stored values byte-identical (pin list at server.js:1090-1102 covers `p.perms` wholesale).

## Shared Patterns

### Full-DOM render + `data-in` binding (THE phase-wide rule)
**Source:** events.js:55-65, `IN.sharePerm` actions.js:1833, `IN.invRole` :2040
**Apply to:** every modal field in 53-02 and 53-03. Non-change elements fire `IN[name]` on `input`; selects/checkboxes/dates fire on `change`. Handlers mutate `S.ui` (+ optional `render()`); keystroke fields that must survive background polls stay silent (no `render()`). Dynamic rows (per-team perm selects) key state by id (`data-tid`), never DOM position.

### Server-authoritative access + optimistic revert
**Source:** `IN.shareAccess` actions.js:1854-1878; pin block server.js:1090-1102
**Apply to:** all Access-tab writes and team-perm dropdowns:
```js
// server.js:1090-1102 — manager-owned fields are pinned on non-manager PUTs;
// p.perms (with team: keys) is covered whole. Enforcement reads the STORED doc.
if (prev && !canManageProject(prev, memberId, role)) {
  p.private = prev.private; p.members = prev.members; p.perms = prev.perms;
  p.lead = prev.lead; p.teams = prev.teams; p.allowInviteGuests = prev.allowInviteGuests;
}
```
Client: `snapshot()` → `mutate()` → `pushNow()` → `restore(snap)` on refusal. Manager guard client-side mirrors server (`canManageProject` imported at modals.js:159/:206) — never a silent no-op save.

### Funnel lockstep (mirror parity)
**Source:** canSeeProject server.js:800, projectAccessReason :828, canReadProject mcp.js:183, canSee store.js:345-352, oracle fixture
**Apply to:** 53-01 and any 53-03 access change — ONE commit across server.js + mcp.js + client `canSee` + VISIBILITY_MODEL cells. Client mirror shape (store.js:345-352):
```js
export const canSee = p => {
  if (!p) return false;
  if (!p.private) return true;
  if (Array.isArray(p.members) && p.members.includes(D().me)) return true;
  const pt = projTeams(p);
  if (!pt.length) return false;
  return memberTeams(me()).some(t => pt.includes(t));
};
```

### Keyed refusals
**Source:** server.js:5206-5228 (`fail(res, status, 'code', 'msg')`)
**Apply to:** guest validator + any new refusal; one distinct code per cause, message strings English, keys localized client-side via `tErr`.

### i18n gate discipline
**Source:** package.json `prebuild` hook; UX-01
**Apply to:** every plan — new keys EN+FR same commit; dead keys deleted in the commit that removes the UI (projectModal/shareModal families, `a11y.addMember`, team invite button, old `page.team.membersHint`); catalogue-size + data-a pins bumped same commit; `npm run i18n:scan` per commit. Never broaden `DEAD_KEY_ALLOWLIST`.

### `data-a` name stability
**Source:** dispatcher modals.js:37-45; grep `data-a="` before declaring done (Pitfall 7). Prefer reusing existing names (`submitProject` handles create+edit); renames update dispatcher + attributes + e2e selectors in one commit.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| Unified-modal tab bar | component | render | No tabbed modal exists in-repo; compose from page tabs (project.js:81-88) + modal header `H()` (modals.js:34-35). Planner should treat this as the only genuinely new markup. |
| Wave-0 test files (`projectPermFor` write-route tests, guest-validator tests, new e2e specs) | test | batch | No existing file gates write routes; extend mcp.test.mjs harness patterns and node --test conventions instead. |

## Metadata

**Analog search scope:** `server.js`, `mcp.js`, `src/overlays/`, `src/actions/`, `src/features/`, `src/pages/`, `src/core/`, `test/`
**Files scanned:** 15 read (all tracked)
**Pattern extraction date:** 2026-11-09
