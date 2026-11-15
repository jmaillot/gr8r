# Phase 66: Task & Project Templates - Pattern Map

**Mapped:** 2026-11-15
**Files analyzed:** 12 (new + modified)
**Analogs found:** 12 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` — `normalizeTemplatesData` sink (+ 2 call sites) | model / server validator | request-response (doc-PUT funnel) | `normalizeSubtasksData` at `server.js:919` (+ hook sites `:863`, `:1343`) | exact |
| `mcp.js` — `writeDoc` second call site | middleware / server validator | event-driven (MCP tool calls) | `writeDoc` tree gate at `mcp.js:186–214` (Phase 65 T-65-11) | exact |
| `src/core/templates.js` — sanitize + instantiate builder | utility (pure) | transform | `src/core/subtree.js` (zero-imports discipline) + `src/core/utils.js:129` (`dOff`) | exact |
| `src/actions/actions.js` — `saveTemplate` / `instantiateTemplate` / `saveAsTemplate` | service (client actions) | CRUD (doc-PUT) | `createProject`/`A.submitProject` at `actions.js:1699–1804` | exact |
| `src/actions/templates.js` (if split) | service (thin actions) | CRUD | `src/actions/subtasks.js` (Phase 65 action split precedent) | role-match |
| `src/overlays/modals.js` — "From template…" entry in `taskModal`/`projectCreateModal` | component | request-response (form) | `projectCreateModal` TEMPLATES picker at `modals.js:192–199`; `expMod` lazy-load at `modals.js:366–379` | exact |
| Template picker popover (lazy chunk) | component | event-driven | `S.ui.expMod` registry pattern (`modals.js:373–378`) + `treeChecklist` registry (`src/features/subtasks.js:15`) | exact |
| `src/features/template-ui.js` — lazy chunk (editor + picker + Settings body) | component / feature | event-driven | `src/features/subtask-detail.js` lazy chunk consumed via module registry in `drawer.js:22–28` | exact |
| `src/pages/settings.js` — template management section | page/section | CRUD | notif-prefs sections (`settings.js:548–600`) + nav registry (`settings.js:60–99`) | role-match |
| `src/overlays/drawer.js` — "Save as template" header/ctx action | component | event-driven | task drawer header buttons (`drawer.js:75–83`) + `ctxMenu` task branch (`context-menu.js:15–34`) | exact |
| `src/overlays/context-menu.js` — task/project ctx entries | component | event-driven | `I('dupTask', …)` pattern (`context-menu.js:11–34`) | exact |
| `test/templates.test.mjs` | test | batch | `test/subtask-tree.test.mjs` (funnel round-trip + pure-helper pins) | exact |
| `src/locales/en.json` + `src/locales/fr.json` | config (i18n) | static | existing `templates.*`-style namespaces (`project.template.*` keys, `src/locales/{en,fr}.json`) | exact |

All analog paths verified git-tracked (`git ls-files` non-empty for `server.js`, `mcp.js`, `src/overlays/modals.js`, `src/actions/actions.js`, `src/pages/settings.js`, `src/features/subtasks.js`, `test/subtask-tree.test.mjs`).

## Pattern Assignments

### `server.js` — `normalizeTemplatesData` (model, request-response)

**Analog:** `normalizeSubtasksData` (`server.js:919–925`) and its two hook sites.

**Sink shape** (lines 909–925):
```js
function normalizeSubtasksData(data, uidFactory) {
  if (!data || !Array.isArray(data.tasks)) return;
  for (const t of data.tasks) {
    if (!t || typeof t !== 'object') continue;
    normalizeTaskSubtasks(t, uidFactory);
  }
}
```

**Read-side hook** (inside `normalizeDoc`, lines 860–864 — run BEFORE return, after the assignee and subtask passes):
```js
  normalizeAssigneesData(out.data, []);
  /* [Phase 65, 65-01] Read-side subtask-tree heal — every task leaves this
     function carrying the canonical flat { id, parentId, position } shape. */
  normalizeSubtasksData(out.data, uid);
  return out;
```

**Write-side hook** (inside `mergeClientDoc`, line 1343 — AFTER the Phase 65 wholesale gate block, BEFORE perm gates read tasks):
```js
  normalizeSubtasksData(next.data, uid);
  const memberId = membership?.member_id || null;   // ← hook the templates sink just above this
```

**Discipline for the new sink (copied from Phase 65's proven trap):**
- For the **template record + kind-specific body**: build a fresh whitelisted object (intentional drop, D-04). Fields per D-02: `id`, `kind`, `name`, `icon`, `color`, `body`, `position`, `createdBy`, timestamps.
- For the **subtask entries inside template bodies**: mutate IN PLACE — a pass that `map`s subtasks to fresh objects silently strips `{ id, parentId, position }` (the whitelist trap; `subtree.js:279` documents it in-source).
- Gate embedded trees with the same `validateSubtree` wholesale-reject pattern used at `server.js:1325–1342` (throws `{ status: 400, code }` inside the funnel tx; NOT silent-drop).

### `mcp.js` — `writeDoc` second call site (middleware, event-driven)

**Analog:** `writeDoc` Phase 65 gate (`mcp.js:186–214`) — "one validator, a second call site, not a second validator" (T-65-11 pattern):
```js
      for (const t of Array.isArray(doc?.data?.tasks) ? doc.data.tasks : []) {
        if (!t || typeof t !== 'object') continue;
        const verdict = validateSubtree(Array.isArray(t.subtasks) ? t.subtasks : []);
        if (!verdict.ok) { throw toolError(`${verdict.code} — …`); }
        normalizeTaskSubtasks(t, () => uid('s'));
      }
      await db.run('update workspaces set doc = ?, revision = revision + 1, …', [JSON.stringify(doc), now(), ws.id]);
```
Insert `normalizeTemplatesData(doc.data, () => uid('s'))` beside this loop (before the JSON.stringify write). The function is imported the same way: `mcp.js:33` already imports `{ normalizeTaskSubtasks, validateSubtree }` from `./src/core/subtree.js` — add the templates module import next to it.

### `src/core/templates.js` (utility, transform)

**Analog A — zero-imports module discipline:** `src/core/subtree.js` header (lines 1–16):
```js
/* SUBTREE — Phase 65 (65-01) — pure, DOM-free subtask-tree helpers.
   … Mirrors the src/export/model.js discipline: NO IMPORTS AT ALL, no DOM
   access, plain comparators only (never localeCompare) so ordering is
   byte-identical across hosts. */
```
Copy this discipline verbatim: `templates.js` takes `uidFactory`/date-fn as injected parameters, imports nothing.

**Analog B — position normalization:** reuse `normalizeTaskSubtasks` (`subtree.js:292–310`) for embedded subtask arrays and `orderedSiblings`/`nextPosition` (`subtree.js:21–44`) for template-level `position` (D-03 tie rule: `Number.isSafeInteger` or array index).

**Analog C — date derivation:** `src/core/utils.js:115–129`:
```js
export const iso = d => { … };
export const addD = (d, n) => { … };
export const dOff = n => iso(addD(TODAY, n));
```
Builder pattern: capture `const today = TODAY` once per instantiation run; every `due` = `typeof s.dueOffsetDays === 'number' ? iso(addD(today, s.dueOffsetDays)) : undefined` (missing offset → no `due` field; negative/zero pass through — D-08).

### `src/actions/actions.js` — template actions (service, CRUD)

**Analog A — row shape + id regeneration:** `createProject` (`actions.js:1699–1741`):
```js
export function createProject(f, tmplId) {
  const p = { id: uid('p'), key: makeKey(f.name), name: f.name, icon: f.icon, color: f.color,
    status: 'planning', teams: Array.isArray(f.teams) ? f.teams.filter(Boolean) : [], … };
  D().projects.push(p);
  D().projOrder.unshift(p.id);
  D().activity.unshift({ id: uid('a'), by: D().me, verb: 'createdProject', task: null, project: p.id, at: Date.now(), extra: {} });
  const tm = TEMPLATES.find(x => x.id === tmplId);
  for (let i = 0; i < (tm?.tasks || 0); i++) createTask({ project: p.id, …, due: dOff(5 + i * 5), start: dOff(i * 5) });
  return p;
}
```
Phase 66 generalizes: hardcoded `TEMPLATES.find` → `D().templates.find`, and the per-task `createTask` loop → one synchronous builder that pushes project row + all task rows (with a `oldId → newId` map remapping subtask `parentId` — Pitfall 4) + activity rows into `D()`.

**Analog B — single-pass settle + failure honesty:** `A.submitProject` create path (`actions.js:1797–1804`):
```js
  const snap = snapshot();
  if (!mutate(() => { p = createProject(f, f.tmpl); })) return;
  const res = await pushNow();
  if (!res.ok) { restore(snap); render(); toast(res.status === 409 ? t('modal.settingsConflict') : t('err.projectSaveFailed'), { kind: 'err' }); return; }
```
Copy the `snapshot()` → `mutate()` → `await pushNow()` → `restore()` cycle for template CRUD and instantiation (D-15: ONE `pushNow()`, never per-row pushes). `pushNow` (`store.js:214–239`) returns `{ ok, status }` and holds the shared push mutex — always sequence behind it.

### `src/overlays/modals.js` — "From template…" entries (component, request-response)

**Analog A — the existing picker ancestor:** `projectCreateModal` (`modals.js:192–199`):
```js
  <div class="field"><span class="label">${t('modal.template')}</span><div class="tmpls" role="radiogroup">${TEMPLATES.map(tp =>
    `<button type="button" role="radio" aria-checked="${S.ui.pform.tmpl === tp.id}" class="opt ${S.ui.pform.tmpl === tp.id ? 'on' : ''}"
       data-a="pformSet" data-f="tmpl" data-v="${tp.id}" style="padding:10px">${ic(tp.icon, 16)}<b>…</b><span>…</span></button>`).join('')}</div></div>
```
Keep the same `data-a`/`data-f`/`data-v` handler contract; new keys under a `templates.*` namespace (existing `project.template.*` keys stay untouched per RESEARCH "State of the Art").

**Analog B — task-modal form fields:** `taskModal` (`modals.js:108–135`) — the "From template…" entry goes in the create-mode footer/field area; picking a template replaces `S.ui.form` defaults (title/notes/priority/subtasks), exactly like `data-in="form" data-f="…"` bindings already mutate.

**Analog C — lazy module registry:** `modals.js:373–378` (exportModal reading the pre-warmed chunk):
```js
  /* The model chunk went lazy; A.exportOpen loads it into S.ui.expMod BEFORE this modal opens. */
  const buildExportModel = S.ui.expMod?.buildExportModel;
```
and `drawer.js:22–28`:
```js
let subDetailMod = null;
import('../features/subtask-detail.js').then(m => { subDetailMod = m; if (S.ui.subOpen) render(); }).catch(() => {});
```
The picker/editor module loads via `S.ui.expMod`-style registry (`templateUi = { fn: null }`, mirroring `src/features/subtasks.js:15`); modals render a stub/empty until the chunk lands. Entry chunk gains only the button + registry reference (D-13 — 498.11 kB baseline, ~2 kB headroom; gate is `test/build-chunk-size.test.mjs`).

### `src/pages/settings.js` — management section (page, CRUD)

**Analog — nav registry + section switch:** sections register in the nav array (`settings.js:60–99`):
```js
  ['workspace', 'settings.nav.workspace', 'building-2'],
  …
  ['notif-email', 'settings.nav.email', 'mail'],
```
and render in the `switch` over sections (`settings.js:548–600`, notif-email shown):
```js
  case 'notif-email':
    return srow(t('settings.notif.mentions'), t('settings.notif.mentionsDesc'), tog('email_mention', np.email_mention, 'np')) + …;
```
Add a `templates` section entry + `case 'templates':` body that delegates to the lazy chunk's renderer (stub until loaded). Unknown-section deep-link guard already exists (`settings.js:302`).

### `src/overlays/drawer.js` + `src/overlays/context-menu.js` — "Save as template" (component, event-driven)

**Analog A — drawer header button:** `drawer.js:80–83` (the existing header `ibtn` cluster):
```js
  <button class="ibtn ibtn-sm" data-a="copyLink" data-id="${t.id}" data-tip="${tMsg('act.copyLink')}" aria-label="${tMsg('act.copyLink')}">${ic('link', 15)}</button>
```
**Analog B — context-menu entry (preferred per D-10 "drawer context menu"):** `context-menu.js:11–34`, task branch:
```js
  const I = (act, icon, label, extra = '', r = '') =>
    `<button class="mi ${extra}" data-a="${act}" data-id="${p.id}" data-key="${p.key || ''}">${ic(icon, 15)}${label}${r ? `<span class="r">${r}</span>` : ''}</button>`;
  …
  I('dupTask', 'copy', tMsg('act.duplicate')) +
```
Add `I('saveTaskTemplate', 'folder-plus', tMsg('act.saveAsTemplate'))` beside `dupTask`; project branch (`context-menu.js:72`, `I('dupProject', …)`) gets the project twin. The action handler opens the lazy template editor pre-filled from the current item.

**Analog C — drawer-style template editor tree (D-12):** the live tree renders through `treeChecklist.fn(t, { fxc })` (`drawer.js:122`) populated from the pre-warmed lazy chunk (`features/subtasks.js:15` + `popovers.js` pre-warm). Template editor mirrors this: same tree renderer contract, offset column in place of `data-pop="date"` date pickers (`drawer.js:98` shows the date-picker pill pattern to replace). Phase 65 restructure actions (`src/actions/subtasks.js` promote/demote/re-parent + `context-menu.js:41–50` sub ctx menu) are reused as-is on the editor tree.

## Shared Patterns

### The funnel whitelist trap (D-53-1 / Phase 65)
**Source:** `server.js:1313–1343`, `subtree.js:279–291`, RESEARCH Pitfall 1.
**Apply to:** `normalizeTemplatesData` and every doc field it carries. Whitelist on BOTH the read path (`normalizeDoc`, server.js:860–864) and the write path (`mergeClientDoc` line 1343 AND `mcp.js` writeDoc). Missing either site = silently stripped fields.
```js
  normalizeSubtasksData(next.data, uid);      // existing (server.js:1343)
  normalizeTemplatesData(next.data, uid);     // NEW — same block, before perm gates
```

### Single doc-PUT + failure honesty (D-15)
**Source:** `actions.js:1797–1804` (`snapshot`/`mutate`/`pushNow`/`restore`), `store.js:214–239`.
**Apply to:** all template CRUD actions and instantiation. One synchronous `D()` build, one `pushNow()`, restore + error toast on `!res.ok`.

### Lazy chunk + registry (D-13)
**Source:** `src/features/subtasks.js:15` (`treeChecklist = { fn: null }`), `modals.js:373–378` (`S.ui.expMod?.…`), `drawer.js:22–28` (pre-warm import + re-render).
**Apply to:** picker popover, template editor, Settings section body. Entry-chunk modules (`modals.js`, `actions.js`, `settings.js`) get only stubs/buttons; all markup lives in the lazy chunk. Validate with `test/build-chunk-size.test.mjs` (per-chunk 500000-byte gate).

### esc() at every render sink (stored-XSS precedent, Phase 36)
**Source:** `modals.js:114–115`, `drawer.js:92`, `context-menu.js:13`.
**Apply to:** every rendered template field (name/body/picker labels). Never interpolate template strings into `data-*` unescaped.

### i18n EN+FR same commit
**Source:** `src/locales/en.json` + `src/locales/fr.json` (one JSON per locale, shared scan `scripts/locales.mjs`); catalogue keys via `t()` with `{ n }` interpolation (`modals.js:196`, `t('common.starterTasks', { n: tp.tasks })`).
**Apply to:** all new `templates.*` keys land in both files in the same commit; i18n scan tests (`test/i18n-*.test.mjs`) will enforce.

### Test harness
**Source:** `test/subtask-tree.test.mjs:1–60` — node:test + `assert/strict`, imports pure helpers directly, injects a deterministic `fakeUid` factory; server-side funnel round-trips use `./helpers/server.mjs` (`ADMIN, client, login, startServer`).
**Apply to:** `test/templates.test.mjs` — same structure: pure sanitizer/builder pins with fake uid + funnel round-trip through the harness; extend `test/mcp.test.mjs` for the writeDoc call-site pin.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `normalizeTemplatesData` per-kind body whitelist itself | validator | transform | No per-kind whitelisting pass exists yet — `normalizeSubtasksData` gives the shape but the D-04 fresh-object whitelist is new logic. Use the sink skeleton from `server.js:919` + the fresh-object rule; nearest conceptual precedent is the `teams[].members` strip (`server.js:2474–2481`). |

## Metadata

**Analog search scope:** `server.js`, `mcp.js`, `src/core/`, `src/actions/`, `src/overlays/`, `src/features/`, `src/pages/`, `src/locales/`, `test/`
**Files scanned:** ~20 (targeted reads; 8 in full or large part)
**Pattern extraction date:** 2026-11-15
