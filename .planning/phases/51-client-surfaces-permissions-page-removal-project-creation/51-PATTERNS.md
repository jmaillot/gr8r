# Phase 51: Client surfaces, Permissions-page removal & project creation - Pattern Map

**Mapped:** 2026-11-08
**Files analyzed:** 10
**Analogs found:** 10 / 10 (all in-file exemplars — this phase modifies existing files, so the closest analog is the file's own established pattern; all analog paths verified git-tracked via `git ls-files`)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog (same file) | Match Quality |
|-------------------|------|-----------|---------------------------|---------------|
| `src/overlays/modals.js` (modify `shareModal`) | component | request-response | `shareModal` itself: typeahead form :215-217, people list :236-250, general-access row :252 | exact (transform in place) |
| `src/overlays/modals.js` (new Teams section) | component | request-response | `pformTeamToggle` opt-buttons :179-184 (role="checkbox" team picker) | exact |
| `src/actions/actions.js` (modify `IN.shareAccess`) | controller | event-driven | `IN.sharePerm` :1766-1786 (snapshot→mutate→toast/undo) | exact |
| `src/actions/actions.js` (new team link/unlink) | controller | event-driven | `A.shareAdd` :1695-1706 + `IN.sharePerm` remove branch :1771-1778 | exact |
| `src/actions/actions.js` (modify `createProject`) | service | transform | `createProject` :1528-1561 (lead/members already set) | exact |
| `src/core/store.js` (not-found detection) | utility | request-response | `proj()` :318 + `canSee` :326; `shareModal`'s `if (!p) return H(t('err.projectNotFound'))` (modals.js:204-205) | exact |
| `src/pages/settings.js` (teardown + relocation) | page | CRUD | `case 'permissions'` :487-494 (to delete); `tog()`/`srow()` :81-85 (to reuse in General/Members) | exact |
| `src/pages/members.js` (verify permsTable) | page | CRUD | `permsTable()` :100+ already rendered on Roles tab :56 | exact (verify only) |
| `server.js` (permCreate enforcement) | middleware | request-response | `mergeClientDoc` :1014-1054 (pinning + self-grant patterns); `normalizeProjects` :845-875 (invariant normalization) | role-match (new guard inside existing funnel) |
| `src/locales/en.json` / `fr.json` | config | transform | keys `settings.perms.*` en.json:1235-1241, `settings.nav.permissions` :1156 (to delete); `modal.onlyInvited`/`everyoneAt`/`privateHint`/`workspaceHint` en.json:786-789 (to reuse) | exact |
| `scripts/i18n-scan.mjs` (dead-key check) | utility | batch | existing allow-list pattern :23 (extend, don't replace) | role-match |
| `test/project-creation.test.mjs` (new) | test | batch | `test/invite-hierarchy.test.mjs` / `test/visibility-team.test.mjs` fixtures (node --test) | role-match |
| `test/client-surfaces.test.mjs` (new) | test | batch | same as above | role-match |

## Pattern Assignments

### `src/overlays/modals.js` — shareModal general-access toggle (component, request-response)

**Analog:** the row being replaced, modals.js:251-252 — the structure (icon + control + conditional hint) is the skeleton to keep; only the `<select>` becomes a two-state toggle:

```html
<!-- modals.js:252 (verbatim, current) -->
<div class="row" style="gap:10px"><span class="ftype" style="--c:var(--text-2)">${ic(p.private ? 'lock' : 'building-2', 14)}</span><div class="grow"><select class="select" style="height:28px;width:auto;border-color:transparent;padding-left:4px;font-weight:500" data-in="shareAccess" data-id="${p.id}" aria-label="${t('modal.generalAccess')}" ${canManage ? '' : 'disabled'}><option value="private" ${p.private ? 'selected' : ''}>${t('modal.onlyInvited')}</option><option value="workspace" ${p.private ? '' : 'selected'}>${t('modal.everyoneAt', { name: esc(D().ws.name) })}</option></select><div class="faint" style="font-size:11.5px;padding-left:4px">${p.private ? t('modal.privateHint') : t('modal.workspaceHint')}</div></div></div>
```

Rules extracted:
- `canManage ? '' : 'disabled'` gating on the control (not hidden) — keep it; leads already pass via `canManageProject` (store.js:327-330).
- Keep the conditional hint div (`modal.privateHint` / `modal.workspaceHint`) — it doubles as the D-51-8 live-semantics copy slot.
- Guard clause at the top of `shareModal` (modals.js:204-205) is the honest not-found exemplar — generalize, don't reinvent:
```js
const p = proj(m.id);
if (!p) return H(t('err.projectNotFound'));
```

**Teams section analog** — copy the team-picker opt-button markup from `projectModal` (modals.js:179-184):

```js
<div class="tmpls" role="group">${teamsList()
  .map(
    tm =>
      `<button type="button" role="checkbox" aria-checked="${f.teams.includes(tm.id)}" class="opt ${f.teams.includes(tm.id) ? 'on' : ''}" data-a="pformTeamToggle" data-v="${tm.id}" style="padding:8px">${ic('users', 14)}<b style="font-size:12.5px">${esc(tm.name)}</b>${f.teams.includes(tm.id) ? ic('check', 13) : ''}</button>`,
  )
  .join('')}</div>
```

Adapt for D-51-9: invite list = `teamsList().filter(tm => !(Array.isArray(p.teams) && p.teams.includes(tm.id)))`; linked teams render inside the teams note with a remove action. Wrap the whole section in the same `canManage ? … : ''` conditional used for the invite form (modals.js:213-219) and keep the lock hint (modals.js:209) as the non-manager view.

### `src/actions/actions.js` — share actions (controller, event-driven)

**Analog:** `IN.sharePerm` (actions.js:1766-1786) — THE optimistic + snapshot/undo pattern D-51-3 reuses:

```js
IN.sharePerm = el => {
  const p = proj(el.dataset.id);
  const mid = el.dataset.mid;
  if (!p) return;
  if (!canManageProject(p)) return toast(t('err.cannotChangeAccess'), { kind: 'err' });
  if (el.value === '__remove') {
    if (p.members.length <= 1) return toast(t('err.lastMember'), { kind: 'err' });
    const snap = snapshot();
    mutate(() => {
      p.members = p.members.filter(x => x !== mid);
      if (p.lead === mid) p.lead = p.members[0] || null;
    });
    toast(t('toast.removed', { name: mem(mid).name }), { action: t('toast.undo'), onAction: () => restore(snap) });
  }
  ...
};
```

**Current handler to evolve** (actions.js:1787-1797) — add `snapshot()` before `mutate()` and revert + error toast on server-merge refusal; keep the self-grant on privatize (matches server.js:1050-1053):

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

**New team-link action** — copy `A.shareAdd`'s guard chain (actions.js:1695-1706): `proj()` lookup → `canManageProject` gate with error toast → `mutate()` → `S.ui.shareQ` reset (if needed) → `render()` → success toast. For unlink, copy the `__remove` branch's `snapshot()` + `restore(snap)` shape. All writes stay on the doc-sync path (no REST route) per RESEARCH Pattern 1 — leads pass `canManageProject` on both tiers.

**createProject lead** (actions.js:1528-1545) — already sets `lead: f.lead` and `members: [...new Set([D().me, f.lead])]`; the change is defaulting `f.lead` to `D().me` on create. The lead select already exists (modals.js:185-188) with `leadLocked` disabled + hint pattern — reuse that markup approach for the D-51-14 disabled-with-tooltip affordance.

### `src/core/store.js` — visibility lookups (utility, request-response)

**Analog:** existing predicates (store.js:318-332) — the not-found detection builds on these; no new predicate:

```js
export const proj = id => D().projects.find(p => p.id === id);
export const canSee = p => !!p && (!p.private || (Array.isArray(p.members) && p.members.includes(D().me)));
export const canManageProject = p => {
  const role = me()?.role;
  return role === 'Owner' || role === 'Admin' || (!!p && p.lead === D().me);
};
```

`canManageProject` is already lead-aware — do not duplicate lead logic. `visibleProjects()` (:321-325) and `allTasks()` (:332) already filter through `proj`/`canSee` gracefully; views opened on a vanished project should render the `err.projectNotFound` state (keys exist at en.json/fr.json:772) instead of crashing.

### `src/pages/settings.js` — teardown & relocation (page, CRUD)

**Analog to delete:** `case 'permissions'` (settings.js:487-494) and the nav entry (settings.js:52):

```js
case 'permissions':
  return (
    H(t('settings.perms.lead')) +
    srow(t('settings.perms.create'), '', tog('permCreate', P.permCreate !== false)) +
    srow(t('settings.perms.guests'), t('settings.perms.guestsDesc'), tog('permGuests', P.permGuests !== false)) +
    srow(t('settings.perms.public'), t('settings.perms.publicDesc'), tog('permPublic', !!P.permPublic)) +
    `<div class="sblock"><h2>${t('settings.perms.roleTable')}</h2><div style="margin-top:12px">${permsTable()}</div></div>`
  );
```

**Analog to copy for relocation:** the `srow`/`tog` primitives (settings.js:81-85) — the permCreate row moves verbatim into `case 'workspace'` (General) / Members page:

```js
export function srow(t, d, ctl) {
  return `<div class="srow"><div><div class="t">${t}</div>${d ? `<div class="d">${d}</div>` : ''}</div><div class="row">${ctl}</div></div>`;
}
export const tog = (k, on, src = 'pref') =>
  `<input type="checkbox" class="toggle" data-in="${src}Toggle" data-k="${k}" ${on ? 'checked' : ''} aria-label="${k}">`;
```

Its persistence handler is `IN.prefToggle` (actions.js:2765-2768) — `S.prefs[k] = checked; save();` — reuse as-is; no new action.

**Teardown rules:**
- Nav entry at settings.js:52 (`['permissions', 'settings.nav.permissions', 'shield']`) — delete; grep `src/` for `sec.*permissions` / `'permissions'` deep-links first and default unknown sections to the first tab.
- `permsTable()` already lives in members.js and is rendered on the Members page Roles tab (members.js:56) — verify no other reference, then just delete the settings-side render. D-51-13 is mostly deletion.

### `server.js` — permCreate enforcement + merge invariants (middleware, request-response)

**Analog 1 — the pinning block** `mergeClientDoc` (server.js:1036-1048, verbatim) — the guard for `p.teams` writes rides this same gate; any new team-unlink flow must respect it:

```js
if (prev && !canManageProject(prev, memberId, role)) {
  // Access fields belong to a manager even when the project is visible.
  p.private = prev.private;
  p.members = prev.members;
  p.perms = prev.perms;
  p.lead = prev.lead;
  /* [2026-11-08 T-50-01] The team link and the per-project invite toggle
     are manager-owned too: a stale client doc PUT from a non-manager can
     never delete p.teams (which would silently revoke a whole team) or
     flip p.allowInviteGuests. */
  p.teams = prev.teams;
  p.allowInviteGuests = prev.allowInviteGuests;
}
```

**Analog 2 — self-grant** (server.js:1049-1053) — client toggle must stay consistent with it:

```js
const wasPrivate = projectIsPrivate(prev);
if (prev && projectIsPrivate(p) && !wasPrivate && memberId && !p.members.includes(memberId)) {
  // Whoever restricts an existing project keeps access to it, even if they were not listed.
  p.members.push(memberId);
}
```

**Analog 3 — manage predicate** (server.js:810-813) — lead-aware already:

```js
function canManageProject(p, memberId, role) {
  if (role === 'owner' || role === 'admin') return true;
  return !!memberId && p?.lead === memberId;
}
```

**New guard placement:** inside the doc-write funnel (`mergeClientDoc`, server.js:1014), before/within the projects merge loop: if actor role is below admin AND `stored.prefs.permCreate === true` (read from the **stored** doc only — Pitfall 3) AND the incoming doc introduces a project id not present in stored → refuse that operation with a shaped, keyed error (e.g. `projectCreateForbidden`) the client maps to a localized toast + revert. Never 403 the whole PUT; never read the restriction from the incoming doc. Also grant `lead = memberId` on member-created projects here (mirrors client `createProject`).

**Invariants to honor** — `normalizeProjects` (server.js:856-871): private projects keep a manager and non-empty access list; unlinking the last team / last member from a private project must never seal it. NOTE the comment at :852-855: `p.teams` was deleted from stored docs by the Phase 49 sweep and normalization retires teams[] migration — D-50-5's live-team link reintroduces `p.teams` as a manager-written field; do NOT re-add automatic teams normalization.

### `src/locales/en.json` / `fr.json` — key surgery (config, transform)

**Keys to reuse** (en.json:786-789, verified): `modal.onlyInvited`, `modal.everyoneAt`, `modal.privateHint`, `modal.workspaceHint` — the toggle control itself needs no new key (D-51-2).
**Keys to delete** (en.json:1156, 1235-1241; mirror in fr.json): `settings.nav.permissions`, `settings.perms.lead`, `settings.perms.guests`, `settings.perms.guestsDesc`, `settings.perms.public`, `settings.perms.publicDesc`, plus `settings.perms.create`/`roleTable` if not reused in the new location (they ARE reused — keep them).
**Keys to add (EN+FR parity):** teams section title/action, teams-note live-semantics copy (D-51-8 wording), remove-team action, create-restricted tooltip (D-51-14), create-refusal toast (D-51-15), toggle-revert toast, any new not-found variants. Every key must pass `npm run i18n:scan` (placeholder match, no `<`/`>`/`"` in values).

### `scripts/i18n-scan.mjs` — dead-key check (utility, batch)

**Analog:** the existing allow-list structure (scripts/i18n-scan.mjs:23, test/fixtures/i18n-pending.json). Extend — do not replace. Neither the scanner nor `test/catalogue.test.mjs` detects catalogue keys no source references (Pitfall 4). Add: scan all `t('…')` literals under `src/`, report catalogue keys never referenced, minus an allow-list for dynamically-built keys (`project.template.*`, `common.perm.*` — see modals.js:201's `t('common.perm.' + …)` bridging and actions.js:1553's `t(`project.template.${tmplId}…`)`).

### Tests (new) — test/project-creation.test.mjs, test/client-surfaces.test.mjs

**Analog:** existing `test/invite-hierarchy.test.mjs` / `test/visibility-team.test.mjs` fixtures (node --test, no test deps). Required coverage from RESEARCH Validation Architecture: authority matrix (owner/admin/lead/member × toggle/link/unlink/create — Pitfall 2), restricted-create refusal + immediacy (D-51-15/16), lead-on-create, private-project unlink invariants, not-found render path, removed-key assertions.

## Shared Patterns

### Doc-sync write path (the lead-compatible path)
**Source:** `src/core/store.js` `mutate`/`snapshot`/`restore` + `api.saveDoc` → `server.js mergeClientDoc`
**Apply to:** ALL share-modal writes (toggle, team link/unlink). Never route lead-performable actions through `requireWorkspace(..., 'admin')` REST routes (Phase 50's `/projects/:id*` routes are admin-gated — a lead gets 403).

### Optimistic + revert toast
**Source:** `src/actions/actions.js:1773-1784` (`IN.sharePerm`)
**Apply to:** `IN.shareAccess` flip (D-51-3) and team unlink — `const snap = snapshot(); mutate(...)` → on refusal `restore(snap)` + error toast.

### Manager gating
**Source:** client `canManageProject` (store.js:327) / server `canManageProject` (server.js:810) — already lead-aware; copy the guard chain from `A.shareAdd` (actions.js:1699): `if (!canManageProject(p)) return toast(t('err.cannotChangeAccess'), { kind: 'err' });`

### Settings-row primitives
**Source:** `srow`/`tog`/`sel` (settings.js:81-92) + `IN.prefToggle` (actions.js:2765)
**Apply to:** permCreate relocation — the row moves verbatim, no new component.

### Honest not-found
**Source:** `shareModal` guard (modals.js:204-205) + `err.projectNotFound` key (en/fr.json:772)
**Apply to:** any view opened on a project absent from `D().projects` after a visibility-epoch refetch.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| server permCreate create-guard | middleware | request-response | No create-refusal precedent exists in the doc-merge funnel — first enforcement surface of its kind (use mergeClientDoc pinning as the structural analog) |
| dead-key i18n check | utility | batch | No unused-key detector exists — extend the existing allow-list pattern in i18n-scan.mjs |

## Metadata

**Analog search scope:** `src/overlays/`, `src/actions/`, `src/core/`, `src/pages/`, `server.js`, `scripts/`, `test/`
**Files scanned:** ~14 (modals.js, actions.js, store.js, settings.js, members.js, projects.js, server.js, i18n-scan.mjs, en/fr.json, catalogue contract)
**Pattern extraction date:** 2026-11-08
**Tracked-source gate:** all analog paths verified git-tracked (`git ls-files` non-empty)
