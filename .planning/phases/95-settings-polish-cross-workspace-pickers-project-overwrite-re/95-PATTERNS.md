# Phase 95: Settings Polish + Cross-Workspace Pickers + Project Overwrite Restore - Pattern Map

**Mapped:** 2026-11-24
**Files analyzed:** 12 source targets + 8 test targets
**Analogs found:** 12 / 12 (all git-tracked; verified via `git ls-files`)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `export/restore.js` (restoreOverwriteUnit project branch) | service | batch/transform (doc fragment replacement) | itself — workspace tx block :1663-1717 + import_new project splice :1134-1147 | exact (self-extension) |
| `server.js` (overwrite route project acceptance) | controller | request-response | itself — overwrite route :9833-9902 | exact (self-extension) |
| `server.js` (purge route) | controller | request-response CRUD | DELETE `/api/keys/:id` revoke route :7872-7889 + audit insert :7864-7867 | exact |
| `server.js` (my-access aggregate / additive payload) | controller | request-response read | `/me/visibility` :10870-10900 | exact |
| `src/pages/backup.js` (drawer project picker + Overwrite CTA) | component | render-only | itself — targetPick picker :586-599 + ctas :572-578 | exact (self-extension) |
| `src/pages/backup.js` (Run-now workspace picker on scopes payload) | component | render-only | restore picker `S.ui.backupScopes` :586 vs runNowCard `api.workspace` :62-67 | role-match (swap one payload for the other) |
| `src/pages/settings.js` (my-access grid) | component | render-only | itself :517-535 + `pIcon` helper (helpers.js:60) | exact (self-extension) |
| `src/pages/settings.js` (purge button) | component | render-only | apiKeyRevoke 2-click idiom :832-841 | exact |
| `src/pages/settings.js` (workspace URL ellipsis) | component | render-only | itself :304 (local CSS/markup fix) | exact |
| `src/overlays/modals.js` (invite chips → mteamToggle) | component | render-only | memberTeams chips :99-104 vs invite chips :496-501 | exact (unify onto :102 contract) |
| `src/actions/actions.js` (purge + invTeamToggle alignment + overwrite action) | controller (client) | event-driven | A.mteamToggle :2477-2483, A.apiKeyRevokeAsk/Confirm :2771-2781 | exact |
| `src/core/api.js` (purge + payload additions) | utility | request-response | backupScopes/myVisibility family :556-589 | exact |
| locales ×5 | config | — | existing `page.restore.*` keys (added by 89-05/94) | exact |
| test files (restore-overwrite, restore-routes, restore-client, backup-scopes, team-pick-client, new grep-gate + client-slice) | test | — | static-slice idiom in restore-client.test.mjs:20-26, team-pick-client.test.mjs:25-30, strict-key pin in backup-scopes.test.mjs:52 | exact |

## Pattern Assignments

### `export/restore.js` — project branch inside restoreOverwriteUnit (service, doc-fragment replacement)

**Analog A — the unit's own guard chain (lines 1353-1424, 1615-1628):**
```js
export async function restoreOverwriteUnit(opts = {}) {
  const runId = (typeof opts.runId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(opts.runId) ? opts.runId : crypto.randomUUID()).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
  ...
  const failWith = async err => {
    const code = typeof err?.code === 'string' ? err.code : null;
    const persisted = code ? `${code}: ${err.message}` : err.message;
    await emitRestoreEvent({ kind: 'fail', runId, error: persisted, finishedAt: Date.now() });
    await release();
    return { ok: false, runId, code: code ?? 'restoreFailed', error: persisted };
  };
```
The scope-kind re-check to extend (:1422):
```js
  if (!scope || scope.kind !== 'workspace') {
    return failWith(keyed('restoreTargetMismatch', 'restore: overwrite requires a workspace scope archive'));
  }
```
Blob oldIds computed from the target's old doc (:1615-1628) — project scope filters these to `f.project === targetProjectId`:
```js
    const targetRow = await dbGet('select id, slug, name, color, doc, revision, created_at from workspaces where id = ?', [targetWorkspaceId]);
    ...
    const oldData = docData(targetRow);
    const oldFileIds = new Set(arr(oldData.files).filter(f => f && typeof f.id === 'string').map(f => f.id));
    const oldLogo = typeof oldData.logo === 'string' && oldData.logo ? oldData.logo : null;
    const oldIds = new Set([...oldFileIds, ...(oldLogo ? [oldLogo] : [])]);
    const removedIds = [...oldIds].filter(id => !newIds.has(id));
```

**Analog B — the tx replacement block to branch (:1663-1717).** For project scope: skip the memberships/team_members/invites delete+insert rows (:1671-1688), keep the `update workspaces set doc = ?, revision = revision + 1` shape (:1667-1669), keep FTS sync INSIDE the tx with the tx scope (:1692-1693), keep the pre-commit verification loop (:1698-1717) — re-verify fragment totality, blob presence, whole-archive sha re-hash.

**Analog C — the import_new project splice to mirror (:1134-1147), ids verbatim (no planRemap):**
```js
    const stored = storedDoc?.data ?? {};
    nextDoc = {
      data: {
        ...stored,
        projects: [...arr(stored.projects), ...plan.data.projects],
        tasks: [...arr(stored.tasks), ...plan.data.tasks],
        comments: [...arr(stored.comments), ...plan.data.comments],
        files: [...arr(stored.files), ...plan.data.files],
        teams: [...arr(stored.teams), ...plan.data.teams],
        projOrder: [...arr(stored.projOrder), ...plan.data.projOrder],
      },
    };
```
For overwrite: `kept*` = live arrays MINUS the replaced project's footprint (D-01 deletion set: project entry, its task-id closure, comments of those tasks, files `f.project === pid`, projOrder ref, activity/events/notifs refs), THEN the archive fragment appended.

And its tx branch for project scope (:1175-1178):
```js
      } else {
        await txScope.run('update workspaces set doc = ?, revision = revision + 1, updated_at = ? where id = ?', [JSON.stringify(nextDoc), t, wsId]);
        await syncTaskFts(txScope, wsId, storedDoc, nextDoc);
      }
```
Roster-skip doctrine precedent (:1204-1205): "a project splice NEVER touches the target roster, so its pre-existing rows are expected."

---

### `server.js` — overwrite route project acceptance (controller, request-response)

**Analog:** the route itself :9833-9902. The guard chain is VERBATIM discipline — never reordered: `sameOrigin → requireUser → tooMany → CAP.BACKUP_MANAGE → body regex guards → live target read → confirmName === live name → run row read → scope-kind check → lock check → claimRestoreLock → fire unit (resolve-by-design) → audit start`.

Extend these two points only:
- Scope-kind check (:9874):
```js
    if (!scope || scope.kind !== 'workspace') {
      await auditBackupTask(user, 'restore_refused:restoreTargetMismatch');
      return fail(res, 400, 'restoreTargetMismatch', 'An overwrite needs an archive whose scope matches the target workspace');
    }
```
- confirmName source (:9852-9862) — for project scope, read the target workspace's doc, find the live project, compare `body.confirmName === project.name` server-side ("the client dialog is never the boundary"):
```js
    const targetRow = await db.get('select id, name from workspaces where id = ?', [targetId]);
    ...
    if (typeof body?.confirmName !== 'string' || body.confirmName !== targetRow.name) {
      await auditBackupTask(user, 'restore_refused:confirmPhraseMismatch');
      return fail(res, 400, 'confirmPhraseMismatch', 'The typed name does not match the target workspace');
    }
```
Keep throttle key `restoreoverwrite|${user.id}`, refusal codes, and `auditBackupTask(user, 'restore_started:overwrite', null, 'workspace')` (:9899) — pass `'project'` as the scope token on the project path.

---

### `server.js` — purge route (controller, request-response CRUD)

**Analog — revoke route + audit insert idiom (:7872-7889, insert shape :7864-7867):**
```js
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    ...
      await db.run(
        'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
        [uid(), user.id, row.id, 'api_key_revoked', 0, clientIp(req), row.workspace_id, user.name, user.email, row.label, 'api-key', now()],
      );
```
Purge route shape (researcher suggestion, discretion area) — clone the guard chain, add `tooMany('keypurge|'+user.id, 5, 15*60*1000)` (throttle idiom verbatim from :9837):
```js
    const del = await db.run('delete from api_keys where user_id = ? and revoked_at is not null', [user.id]);
    await db.run('insert into audit_log (...) values (?,?,...)', [uid(), user.id, user.id, 'api_key_purged', 0, clientIp(req), null, user.name, user.email, String(del.changes), 'api-key', now()]);
    return json(res, 200, { removed: del.changes });
```
D-10: audit event carries NO key values; revoked-only (`revoked_at IS NOT NULL` — expired-but-not-revoked NOT purgeable).

---

### `server.js` — my-access aggregate / additive payload (controller, request-response read)

**Analog — `/me/visibility` (:10870-10900).** Copy the visibility funnel walk verbatim for any new aggregate endpoint; keep the existing endpoint's `{projects:[{id,name,reason,teamName?}]}` shape BYTE-UNCHANGED (members.js:95 consumes it — Pitfall 5):
```js
    const superOwner = ROLE_RANK[ctx.membership.role] >= ROLE_RANK.owner && ctx.membership.member_id === null;
    for (const p of doc?.data?.projects || []) {
      if (!p?.id) continue;
      if (!superOwner && !(await memberCanReadProject(p, ctx.ws.id, myId))) continue;
      const reason = superOwner ? 'member' : projectAccessReason(p, myId, memberTeams) ?? 'member';
      const entry = { id: p.id, name: p.name || p.id, reason };
      ...
      projects.push(entry);
    }
    return json(res, 200, { projects });
```
Additive fields only: `icon`, `color` (+ workspace grouping wrapper if the planner chooses the aggregate endpoint — Open Question 1). Gate new endpoint with `requireUser` + per-workspace membership walk (mirror `membershipsOf` at server.js:1281 for the list, but do NOT modify it).

---

### `src/pages/backup.js` — drawer project picker + Overwrite CTA (component, render-only)

**Analog A — the existing targetPick picker to extend (:586-599):**
```js
  const scopeTargets = Array.isArray(S.ui.backupScopes) && S.ui.backupScopes.length ? S.ui.backupScopes : memberships;
  const pickedName = scopeTargets.find(w => w.id === S.ui.restoreTarget)?.name;
  const picker =
    kind === 'project' && scopeTargets.length
      ? `<div style="margin-top:12px"><div class="label" ...>${t('page.restore.targetPickLabel')}</div><div class="hint" ...>${t('page.restore.targetPickHint')}</div><div class="row" style="gap:6px;flex-wrap:wrap">${scopeTargets
          .map(w => `<button class="btn btn-sm${S.ui.restoreTarget === w.id ? ' btn-primary' : ''}" data-a="restoreTargetPick" data-id="${esc(w.id)}" title="${esc(w.name)}"><span class="trunc" style="max-width:180px">${esc(w.name)}</span></button>`)
          .join('')}</div>${pickedName ? `<div class="hint" ...>${t('page.restore.targetArmed', { name: esc(pickedName) })}</div>` : ''}</div>`
      : '';
```
D-02 adds a second level: after a workspace is picked, render that workspace's projects (from the scopes payload extension or detail read) as the same chip-row idiom, then the confirm-phrase dialog rides the existing `restoreOverwrite` action flow.

**Analog B — CTA row (:572-578):** add the Overwrite CTA for project scope mirroring the workspace Overwrite line — `if (kind === 'project' && flags?.canBackup && targetProject)` → `<button class="btn btn-danger" data-a="restoreOverwrite" data-id="...">`. Authority stays payload-flag chrome; the server re-validates.

**Analog C — Run-now workspace picker (:50-79).** D-11 swaps `api.workspace` (:62-67) for `S.ui.backupScopes` (the restore picker's payload), keeping the card's payload-driven-data doctrine:
```js
  const workspaceBadge =
    scope.kind === 'workspace'
      ? (api.workspace?.id
          ? `<div class="field"><label class="label">${t('page.backup.workspaceLabel')}</label><select class="input" data-in="backupScopeId"><option value="${esc(api.workspace.id)}" selected>...`
```
→ map over `S.ui.backupScopes` instead. `membershipsOf` / `workspacesForUser` untouched (grep gate).

---

### `src/pages/settings.js` — my-access grid, purge button, URL ellipsis (component, render-only)

**Analog A — current my-access flat rows to replace (:517-535):**
```js
      else
        body = data.projects
          .map(p => `<div class="row" style="gap:8px">${pIcon(p, '', 14)}<span>${esc(p.name || p.id)}</span><span class="badge">${visReasonLabel(p)}</span></div>`)
          .join('');
```
D-07/08: group by workspace (per-group subtitle), hide empty workspaces, render card per project with `pIcon(p, '', 14)` (colored icon — pColor normalizes via `PCOLORS[p?.color] || PCOLORS.slate`, store.js:404), a discreet role badge, READ-ONLY (no click action). Loading/err/empty fail-absent branches (:526-529) stay.

**Analog B — apiKeyRevoke 2-click idiom (:832-841) — clone for purge:**
```js
            S.ui.apiKeyRevoke === k.id
              ? `<span class="row" style="gap:8px"><span class="hint">${t('settings.apikeys.confirmBody')}</span><button class="btn btn-danger btn-sm" data-a="apiKeyRevokeConfirm" data-id="${esc(k.id)}">${t('settings.apikeys.revoke')}</button><button class="btn btn-secondary btn-sm" data-a="apiKeyCancel">${t('common.cancel')}</button></span>`
              : `<button class="btn btn-danger-ghost btn-sm" data-a="apiKeyRevokeAsk" data-id="${esc(k.id)}">${t('settings.apikeys.revoke')}</button>`,
```
Purge button: rendered only when `rows.some(k => k.revokedAt)`; staged state rides a new `S.ui.apiKeyPurge` ask/confirm pair mirroring the above markup.

**Analog C — URL field (:304):** the fix is local to this line — the `row` flex input pair wraps; add ellipsis/`white-space:nowrap; overflow:hidden; text-overflow:ellipsis` + `title="${...full url}"` hover tooltip on the prefix span/input. No marquee (D-13).

---

### `src/overlays/modals.js` — invite teams chip contract (component, render-only)

**Analog A — the memberTeams contract D-12 unifies onto (:99-104):**
```html
<span class="chip">${ic('users', 12)}<b>${esc(tm?.name || id)}</b><button type="button" class="ibtn" data-a="mteamToggle" data-v="${id}" aria-label="${t('act.remove')}">${ic('x', 12)}</button></span>
...
<button type="button" class="btn btn-ghost btn-sm" data-a="teamPickOpen" data-surface="member">${ic('users', 14)}${t('act.editTeams')}</button>
```
**Analog B — the invite markup to change (:496-501):** identical chip structure but `data-a="invTeamToggle"` and `data-surface="invite"`. Delta: rename the chip action to `mteamToggle` (with a surface-aware state read) and keep/verify `teamPickOpen data-surface="invite"` wiring parity. One component, one behavior.

---

### `src/actions/actions.js` — purge action, mteamToggle alignment, overwrite action (client controller)

**Analog A — A.mteamToggle (:2477-2483), the target contract:**
```js
A.mteamToggle = el => {
  const st = S.ui.memberTeams;
  if (!st) return;
  const id = el.dataset.v;
  st.teams = st.teams.includes(id) ? st.teams.filter(x => x !== id) : [...st.teams, id];
  render();
};
```
**Analog B — A.invTeamToggle (:2400-2405), to align/retire:**
```js
A.invTeamToggle = el => {
  const cur = S.ui.inviteTeams || [];
  const id = el.dataset.v;
  S.ui.inviteTeams = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
  render();
};
```
Note the doc comment at :2399 already says the invite picker mirrors "member teams picker (mteamToggle)" — D-12 makes the markup match the comment.

**Analog C — A.apiKeyRevokeAsk/Confirm (:2771-2781), clone for purge:**
```js
A.apiKeyRevokeAsk = el => { S.ui.apiKeyRevoke = el.dataset.id; render(); };
A.apiKeyRevokeConfirm = el => {
  const id = el.dataset.id;
  S.ui.apiKeyRevoke = null;
  api.revokeApiKey(id).then(async res => {
    if (!res.ok) toast(tErr(res));
    await refreshApiKeys();
  });
};
```
Purge pair: ask sets `S.ui.apiKeyPurge = true`; confirm calls `api.purgeRevokedKeys()`, toasts "N keys removed" from `res.data.removed`, then refreshes the key list.

**Analog D — confirmDlg + typeName idiom (:1889-1918) for the drawer overwrite confirm phrase** (client chrome; server re-validates, Pitfall 2):
```js
  confirmDlg({
    title: t('act.deleteTitle', { name: p.name }),
    body: ...,
    ok: t('act.deleteProject'),
    danger: true,
    typeName: p.name,
    run: () => { ... },
  });
```
Also note the delProject body (:1903-1910) documents the client-side deletion-set shape (task closure + projects filter + projOrder filter + files filter) the server-side project-overwrite deletion mirrors — useful reference, but D-01's server deletion set is broader (activity/events/notifs too).

---

### `src/core/api.js` — purge + payload additions (utility, request-response)

**Analog — the operator family (:556-589).** Clone the method shape: one-line `call()` wrappers with a doc block naming the phase, gate posture, and "nothing is cached here":
```js
  async backupScopes({ signal } = {}) {
    return call('GET', '/api/backup/scopes', undefined, { signal });
  },
  async myVisibility() {
    const slug = state.workspace?.slug;
    if (!slug) return { ok: false, status: 0, error: t('err.noWorkspaceLoaded') };
    return call('GET', `/api/workspaces/${encodeURIComponent(slug)}/me/visibility`);
  },
```
Add: `purgeRevokedKeys()` → `POST /api/keys/purge-revoked` (or planner-chosen path); `myAccess()` if the planner picks the aggregate endpoint; keep everything else untouched.

---

### locales ×5

**Pattern (established):** new keys land in all five locale files in the SAME commit as the emitting code; i18n-scan dead-key gate enforces. Keys needed: `restoreNameCollision` (D-03, names conflicting projects — plural/interpolation per existing message-format idiom), purge copy (button, confirm body, toast "N keys removed"), `targetPick` project-level labels (D-02), my-access group subtitle + role badge (D-07/08). Mirror the existing `page.restore.*` key family shape.

---

### Test files (test, static-slice + route fixtures)

**Analog A — static client-slice idiom (test/restore-client.test.mjs:20-26):**
```js
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(REPO, rel), 'utf8');
const apiSrc = read('src/core/api.js');
const pagesSrc = read('src/pages/backup.js');
const actionsSrc = read('src/actions/actions.js');
```
Then `assert.match(src, /regex/, 'why')` assertions over the source text. Same idiom in team-pick-client.test.mjs:25-30 (`src()` helper + per-file closures). New Wave-0 grep-gate + settings client-slice files copy this shape.

**Analog B — strict payload-key pin (test/backup-scopes.test.mjs:40-52):**
```js
      const entry = res.data.workspaces[0];
      assert.deepEqual(Object.keys(entry).sort(), ['id', 'name', 'slug'], 'STRICT shape: only id/name/slug keys');
```
If projects ride the scopes payload additively, this pin MUST be updated knowingly (Open Question 2). Route fixtures use the harness `startServer({})` + `grantRole` + `withDb` idiom visible in the same file.

---

## Shared Patterns

### Guard chain order IS the security property (all new server routes)
**Source:** server.js:9833-9841 (overwrite route), :7874-7876 (revoke route)
```js
    if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
    const user = await requireUser(req, res);
    if (!user) return;
    if (tooMany(`key|${user.id}`, N, windowMs)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
```
**Apply to:** purge route, any new my-access aggregate route. Never reorder.

### Append-only audit trail
**Source:** server.js:7864-7867 (insert shape, 12 columns verbatim)
**Apply to:** purge event; any new refusal that should be audited (`auditBackupTask(user, 'restore_refused:<code>')` idiom from :9849/:9860).

### Keyed refusal → toast (×5 locales same commit)
**Source:** restoreOverwriteUnit `failWith`/`keyed` funnel (export/restore.js:1367-1373) + route `fail(res, code, ...)` pairs
**Apply to:** every new refusal (`restoreNameCollision`, `confirmPhraseMismatch` project path, purge errors). Client surfaces via `toast(tErr(res))`.

### 2-click confirm (ask → confirm staged in S.ui)
**Source:** settings.js:838-841 + actions.js:2771-2781
**Apply to:** purge button; the overwrite confirm-phrase dialog rides `confirmDlg({ typeName })` instead (actions.js:1893-1898).

### Payload-driven render-only doctrine
**Source:** backup.js:50-53 card doc block; my-access :518-522 ("the list comes ONLY from the server response")
**Apply to:** drawer project picker, my-access grid, Run-now picker. Client never recomputes authority or access.

### FTS sync inside the tx, with the tx scope
**Source:** export/restore.js:1692-1693 and :1176-1177
**Apply to:** the project-overwrite tx — `syncTaskFts(txScope, wsId, storedDoc, nextDoc)` with the pre-tx doc as `storedDoc`.

### Ids verbatim (no remap) for project fragments
**Source:** export/restore.js:1134-1147 (import_new splice preserves ids) + D-05/BKRST-05 wording
**Apply to:** overwrite splice — do NOT run `planRemap` on the project branch.

### Byte-unchanged hard gates
- `membershipsOf` (server.js:1281) + its call sites — grep-gate test (Wave 0)
- `/me/visibility` payload `{projects:[{id,name,reason,teamName?}]}` — members.js:95 consumes it (Pitfall 5); additive fields only

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| New aggregate my-access endpoint (if planner picks cross-workspace reading) | controller | request-response read | No cross-workspace aggregate read exists; closest building blocks are `membershipsOf` (server.js:1281) + the `/me/visibility` funnel — compose from those, do not search further |
| Project-level scopes payload extension | controller | request-response read | Phase-92 endpoint returns workspaces only; projects-of-workspace ride additively or via a `?ws=` detail read (Open Question 2) — both shapes are new but trivially composed from the existing endpoint |

## Metadata

**Analog search scope:** `export/`, `server.js`, `src/pages/`, `src/overlays/`, `src/actions/`, `src/core/`, `src/ui/`, `test/`
**Files scanned:** 15 tracked source/test files read (targeted ranges, no re-reads); all analogs verified git-tracked via `git ls-files` (no mirror paths)
**Pattern extraction date:** 2026-11-24
