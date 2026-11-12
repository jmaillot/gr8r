# Phase 57: Views, Columns & General Access - Research

**Researched:** 2026-11-12
**Domain:** Per-user view/column persistence (server rows) + workspace default-visibility pref
**Confidence:** HIGH (all findings verified against live source this session; zero external packages)

## User Constraints (from 57-CONTEXT.md)

### Locked Decisions (verbatim summary — full text in 57-CONTEXT.md)
- **D-01/D-02:** VIEW-03 = workspace default visibility + existing per-project private/public binary. No third state, no per-project-type defaults, no retro-apply. Owner-only single setting; member permission semantics unchanged.
- **D-03:** `prefs.defaultPrivate` doc-prefs field, normalized in `mergeClientDoc` like existing workspace prefs. NOT a new server row.
- **D-04:** Setting lives in workspace settings owner section; project-modal Access tab gains an informational hint line; new-project creation reads the pref for initial `p.private`. No "use default" action.
- **D-05:** Server rows for BOTH saved views and column show/hide: `saved_views` table keyed `(workspace_id, user_id, key, name)` with blob + `schema_version`. ARCHITECTURE.md §5 "doc state" verdict is SUPERSEDED — must not be followed.
- **D-06:** Boot one-pass sweep (`migrateTotpReWrap` pattern) copies `doc.views` snapshots into rows attributed to the workspace owner, then `doc.views` is stripped forever (load-time strip + `docSnapshot` guard).
- **D-07:** Dedicated REST routes (`GET/PUT/DELETE` under `/api/workspaces/:slug/views` or equivalent), server-side normalization, notif-prefs route style. Not coupled to doc revisions (no 409 risk). Rows hydrate at boot.
- **D-08:** Demo/offline mode: per-workspace localStorage key, exactly the notifPrefs pattern. Local mode never calls the routes.
- **D-09:** Personal views only — no sharing.
- **D-10:** Named views apply to the tasks table (`tasks`) and my-tasks table (`mytasks`) — the two `viewOf()` consumers. Projects/members tables: column show/hide only.
- **D-11:** View = full `viewOf()` snapshot: filters + columns (hidden + `colW`) + sort + group + showDone — everything except transient `q`. Applying replaces the whole live view state.
- **D-12:** Names unique per member per table key (case-insensitive); ≤20 views/member/table; blob ≤2 kB; explicit confirm to overwrite; every blob carries `schema_version`; lenient load (unknown fields intersected away).
- **D-13:** First-run default = current hardcoded `viewOf()` defaults. No owner-set columns.
- **D-14:** "Reset columns" = delete the member's row; deleting a view removes its row. No bulk delete.
- **D-15:** Saved-views dropdown/popover near existing toolbar (beside cols popover); list, Save current…, Update, delete icons; explicit save only, no autosave.

### Agent's Discretion
- Route paths/payload shapes; `saved_views` DDL + adapter seam (both SQLite/PG backends pass the same suite); popover placement; lenient-load whitelist mechanics per `schema_version`; boot-sweep position in migration sequence; i18n keys (en+fr, gate must stay green).

### Deferred (OUT OF SCOPE)
View sharing/team views; third access state; owner-locked visibility toggle; saved views for search/dashboard; owner-set default columns; bulk "delete all my views".

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VIEW-01 | Per-member column show/hide persisted across devices | `viewOf()` shape + `hidden[]`/`colW` (view-engine.js:91–103); rows persistence via Phase 34 `user_notif_prefs` recipe (server.js:384–389, 4077–4108) |
| VIEW-02 | Named saved views (filters+columns+sort), re-apply, delete, lenient schema-versioned load | D-11 snapshot of `viewOf()`; `schema_version` intersection loader mirrors `sanitize()` in notifPrefs.js:50–58 |
| VIEW-03 | Owner-set workspace default visibility applied to new projects | `p.private` funnel (`projectIsPrivate` server.js:857–863); `createProject` (actions.js:1618–1652) currently sets NO `private` field — the pref supplies it |
</phase_requirements>

## Summary

This phase swaps the persistence substrate of already-existing client state, it does not invent new state. The full view state (filters, sort, group, hidden columns, `colW`, showDone) already lives in `S.views[key]` created by `viewOf()` and currently rides the workspace doc (`doc.views`) on every save. The work is: (1) stop carrying that state in the doc, (2) move it to per-user `saved_views` rows behind dedicated routes, (3) add a saved-views popover that snapshots/applies whole `viewOf()` states, and (4) add one boolean workspace pref `prefs.defaultPrivate` read at project creation.

The complete template exists: Phase 34's `user_notif_prefs` (DDL + whitelist PUT + merge-into-existing + boot backfill + `docSnapshot` strip guard + per-workspace localStorage mirror). Copy that recipe shape-for-shape.

**Primary recommendation:** One mechanism for VIEW-01 and VIEW-02 (D-05): every `toggleCol2`/`sortBy`/filter edit writes through to the member's `saved_views` row for that table key (`key` = `tasks` / `mytasks`), while named views are rows with a `name` column. Live state is the unnamed "current" row; named views are inert snapshots.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| View/column persistence (server mode) | API/Backend (server.js routes + `saved_views` rows) | Client (write-through on mutation) | Per-user indexed state = rows, Phase 34 precedent (D-05) |
| View/column persistence (demo/offline) | Browser/Client (localStorage per-workspace key) | — | D-08, notifPrefs pattern |
| Named view save/apply/delete UI | Browser/Client (popover + actions) | API/Backend (row CRUD + validation caps) | UI owns live state; server owns caps/normalization (D-12) |
| Lenient schema-versioned load | Both | — | Client intersects on read; server normalizes blob shape on write |
| `prefs.defaultPrivate` | API/Backend (mergeClientDoc normalization) | Client (settings toggle + createProject read) | Workspace-level doc pref, D-03 — NOT a row |
| Default visibility enforcement | API/Backend (`p.private` funnel — unchanged) | — | D-01/D-02: funnel itself untouched; pref only seeds the initial flag |

## Standard Stack

**No new packages.** This phase adds zero runtime dependencies (pg and web-push land in Phases 58/59 respectively — STATE.md). Everything is `node:sqlite`/`pg` via the existing `db-adapter.mjs` facade, vanilla ES modules client-side, `node --test`, Playwright e2e.

| Component | Version/Location | Purpose |
|-----------|------------------|---------|
| db-adapter.mjs facade | repo root | DDL translation + `insert or replace` → `on conflict` for pg — new table must be added to BOTH schema variants |
| node --test | `npm test` (`node --test --test-concurrency=2 test/*.test.mjs`) | unit/contract tests |
| Playwright | `e2e/` | guarded e2e (Phase 56 build) |
| i18n gate | `scripts/i18n-scan.mjs` (prebuild hook) | en+fr catalogues, 0 dead/0 stale |

## Architecture Patterns

### Critical verified facts (planner must honor)

**1. The exact view-state shape to snapshot (D-11):**

```js
// [VERIFIED: src/shell/view-engine.js:91-103]
export function viewOf(key) {
  if (!S.views[key])
    S.views[key] = {
      filters: [],
      sort: { f: 'manual', dir: 1 },
      group: key === 'tasks' || key === 'mytasks' ? 'status' : 'status',
      q: '',
      hidden: ['start', 'created', 'deps'],
      colW: {},
      showDone: true,
    };
  return S.views[key];
}
```

- Snapshot = everything above EXCEPT `q` (D-11: transient) and except any `_`-prefixed transient. **`_projHidden` is real and mutating:** `tableHtml` mutates the live view in render — `v._projHidden = true` pushes `'project'` into `hidden` for project-scoped tables (`[VERIFIED: src/views/table.js:67-71]`). The whitelist/intersection loader must drop `_`-prefixed keys and must not let render-time mutations flow into a saved named view (snapshot before/after render discipline).
- Table keys in play: `'tasks'`, `'mytasks'`, and `'p:' + id` (actions.js:385, 401). **D-10 says named views apply to `tasks` + `mytasks` only** — decide whether the per-user column/live-state row also covers `p:<id>` keys (D-05 says "column show/hide" generally; D-13/D-15 reference the tasks toolbar). Recommend: persist live state for all three key families via the unnamed row; named views restricted to `tasks`/`mytasks` per D-10. Planner should lock this in the plan (checkpoint or explicit statement).

**2. `doc.views` currently rides every save — the strip has THREE sites, not one:**

```js
// [VERIFIED: src/core/store.js:164-167]
const docSnapshot = () => {
  delete S.data.notifPrefs;
  return { data: S.data, prefs: S.prefs, views: S.views, collapsed: S.ui.collapsed };
};
// [VERIFIED: src/core/store.js:308]
S.views = doc.views || {};
```

The strip (D-06) must remove `views` from: (a) `docSnapshot()` (client save), (b) `applyDoc` hydration `S.views = doc.views || {}` (replaced by row hydration), (c) server-side `mergeClientDoc`/normalize path so a stale client's `data.views` is never merged back — exactly the belt-and-braces trio notifPrefs uses (`delete out.data.notifPrefs` at server.js:803, `delete next.data.notifPrefs` at server.js:2098, `docSnapshot` delete at store.js:165). Note `views` sits at doc top level next to `prefs`, NOT inside `data` — strip sites must target the right level.

**3. The Phase 34 rows recipe to clone (all verified):**

- DDL (server.js:384-389): `create table if not exists user_notif_prefs (workspace_id text not null, user_id text not null, prefs text not null, primary key (workspace_id, user_id));` — `saved_views` follows with PK `(workspace_id, user_id, key)` for the live row + name-keyed named rows (discretion per D-12; e.g. PK `(workspace_id, user_id, key, name)` with a sentinel name for the live/current row, or a separate `is_current` flag — planner's call, but ONE table).
- pg variant: the same table must appear in `db-adapter.mjs`'s PG schema variant (line ~267 region) — `insert or replace` sites are auto-translated to `on conflict do update` by the adapter (db-adapter.mjs:40-44). Epoch-integer columns are auto-widened per the adapter's bigint list (lines ~295+); a `schema_version` integer is small and safe.
- PUT route (server.js:4077-4108 shape): requireUser → resolve workspace + membership (404 on miss) → whitelist keys → **merge into existing row, never blind-replace** → `insert or replace into … values (?,?,?)` → return canonical GET body. This merge-not-replace rule is load-bearing (partial body must not erase omitted keys).
- Boot backfill: `migrateUserNotifPrefs()` (server.js:~2505–2570) is the D-06 sweep template — doc→rows, per-row eligibility guard, strip + guard so the field can never ride back. Position in sequence is load-bearing (Pitfall 2 discipline: after `migrateUserNotifPrefs`/`migrateTotpReWrap`, before first read). `doc.views` carries no author → attribute to workspace owner (D-06, owner-accepted caveat).
- Client local-mode mirror: `notifPrefs.js` whole file is the pattern — `projects.notifPrefs.` prefix + workspace id (`notifPrefs.js:7,45`), `sanitize()` whitelist filter (`:50-58`), server-canonical merge `mergeNotifPrefs` (`:68-70`), `getLocalNotifPrefs`/`setLocalNotifPrefs` try/catch storage (`:72-87`). Build `savedViews`-local equivalents in a sibling leaf module (pure, no store/DOM imports — the module contract that lets bare-Node tests import it).
- API client calls: `api.getNotifPrefs/putNotifPrefs` (src/core/api.js:291-299) — `GET /api/me/notif-prefs?workspace=…`, `PUT /api/me/notif-prefs {workspace, prefs}`. Views routes (D-07) mirror this shape; hydration happens in `applyDoc`-adjacent store code where notifPrefs hydrates (store.js:104).

**4. `prefs.defaultPrivate` (VIEW-03):**
- Workspace prefs live at doc TOP-level `prefs`, read server-side from the STORED doc only: `stored?.prefs?.permCreate === true` is the exact precedent (`[VERIFIED: server.js:1219-1221]` — "read from the STORED document's prefs ONLY — the client ships its prefs copy on every save, so the incoming one is never trusted"). `defaultPrivate` must follow: client toggle writes it via the doc PUT (it already ships `prefs: S.prefs` in docSnapshot), server normalization in `mergeClientDoc` coerces/validates it, `createProject` reads `S.prefs.defaultPrivate` client-side.
- **Verified gap:** `createProject` (actions.js:1618-1652) builds the project object with NO `private` field today — the server treats absent as non-private (`projectIsPrivate`: `p.private === true` else false). So VIEW-03's client work is: set `private: true` when `S.prefs.defaultPrivate === true` in `createProject`, and add the owner toggle + hint line.
- Server-side note: a member-created project's initial `private` rides the doc PUT through `mergeClientDoc` — if the server should enforce the default for member-created projects too, that's a mergeClientDoc seeding rule; D-04 scopes enforcement to "new-project creation reads the pref", keep it client-side unless the planner wants parity (server already normalizes every other pref field; recommend a symmetric seed there for tamper-resistance, but do NOT add new permission semantics per D-02).
- Hint line site: the General Access row is at `[VERIFIED: src/overlays/modals.js:318]` — the `shareAccess` toggle row with `modal.privateHint`/`modal.workspaceHint`; add the default hint under it. Owner toggle site: workspace settings perms block, `settings.perms.create` precedent at `[VERIFIED: src/pages/settings.js:319]`.

**5. Legacy named views ALREADY EXIST — planner must reconcile (not in CONTEXT.md):**

There is an existing `doc.savedViews` system, distinct from `doc.views`: project-scoped named views `{ id: uid('v'), project: m.pid, name, type, filters }` pushed via `A.saveViewSubmit` (`[VERIFIED: src/actions/actions.js:1448-1457]`), listed on the project page (src/pages/project.js:45), routed via `sv:` tabs (actions.js:324), merged/redacted server-side (server.js:1138-1150, 1402-1416), seeded in demo (seed.js:512), with a `saveView` modal (modals.js:97-100). This is a **naming-collision and scope hazard**:
- The new action names cannot be `saveView`/`renameView` (taken). Use e.g. `saveTableView`/`applyTableView` or a `view` namespaced set.
- D-06 only mentions `doc.views`. What happens to legacy `doc.savedViews` (project page named filters) is an **open question** — the new per-user `saved_views` rows serve `tasks`/`mytasks` (D-10), the legacy ones serve project tabs. Minimal-risk reading of the locked decisions: leave `doc.savedViews` untouched this phase (it is project-scoped UI, not the tasks-table view state the phase targets) and note it for a later cleanup. Planner should surface this explicitly in the plan rather than silently absorbing it into D-06.

**6. Visibility funnel is NOT touched (D-01/D-02):** `projectIsPrivate` (`[VERIFIED: server.js:857-863]` — "Visibility is the boolean `private` flag only… honoring it here would let a crafted pre-sweep document resurrect the old model"), `hiddenFor` (server.js:991), `canSee`/`visibleProjects` client-side. VIEW-03 adds a pref + a seed value; the funnel's byte-level leak tests stay unmodified (standing constraint).

### Recommended flow

```
member edits columns/filters/sort (toggleCol2/sortBy/rmFilter/…)
  → viewOf(key) mutated (unchanged)
  → write-through: debounce-save member's live row
      server mode:  PUT /api/me/views (or D-07 route) {workspace, key, blob}
      local mode:   localStorage projects.savedViews.<wsId>
member "Save current…" → popover names it → PUT named row (caps: ≤20/table,
  ≤2 kB blob, unique name case-insensitive, overwrite→confirm)
member applies view → replace viewOf(key) state in-place → write-through persists
owner toggles defaultPrivate → doc PUT (prefs ride) → mergeClientDoc validates
new project → createProject reads S.prefs.defaultPrivate → p.private seeded
boot (server) → migrateUserViews sweep: doc.views → owner-attributed rows → strip
```

### Anti-Patterns to Avoid
- **Storing view state in the doc "one last time":** D-06 strip is one-way; any leftover `views:` in docSnapshot re-materializes doc state and un-does the migration (the notifPrefs Pitfall 3 exact failure mode).
- **Blind-replace PUT:** partial body erasing keys the caller omits (notifPrefs route comment, server.js:4089-4096).
- **Trusting the incoming `prefs` blob server-side:** read `defaultPrivate` from the STORED doc (D-51-15/16 convention).
- **Saving `_projHidden` or `q` into a named view blob:** render-time mutation leaking into snapshots.
- **Coupling view saves to doc revisions:** D-07 forbids it — routes must be revision-free to avoid 409 against concurrent doc saves.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-user row storage + routes | New storage abstraction | Clone `user_notif_prefs` recipe | Proven across both backends, leak-tested |
| pg DDL/translation | Hand-written pg SQL per site | `db-adapter.mjs` facade + PG schema variant entry | Adapter already translates `insert or replace`/`is not` (db-adapter.mjs:40-93) |
| Lenient blob loading | Version-dispatch class hierarchy | Flat whitelist `sanitize()`-style intersection per `schema_version` (notifPrefs.js:50-58 shape) | One function, testable in bare Node |
| Local-mode persistence | New localStorage scheme | Per-workspace key prefix pattern (notifPrefsKey) | D-08 mandates the same pattern; prevents cross-ws bleed |
| Caps (20/table, 2 kB, unique names) | Client-only guards | Server-side enforcement in PUT + client pre-check for UX | Client checks are advisory only |

## Common Pitfalls

1. **Strip-site miss.** Three sites (client snapshot, client hydration, server merge) — missing any one resurrects `doc.views`. Warning sign: `views` key reappears in `workspaces.doc` after a migrated workspace saves.
2. **Migration attribution.** `doc.views` has no author → owner-attributed rows (D-06, accepted). Don't attempt heuristics.
3. **`_projHidden` render mutation.** `tableHtml` pushes into `v.hidden` during render; a naive snapshot after render bakes project-table transients into saved views. Snapshot via whitelist, never via structuredClone of the whole object.
4. **Case-insensitive name uniqueness** must be enforced where writes land (server PUT) — JS `toLowerCase()` compare; SQLite `unique` alone won't do it without `collate nocase` (which the pg variant strips — see adapter note, line ~134).
5. **2 kB blob cap vs filters growth.** Filter arrays with many entries can approach 2 kB; enforce server-side with a clear 413/400 error code and a client toast; test at the boundary.
6. **i18n gate:** every new string through `t()` in both `locales/` catalogues — `prebuild` runs the scan and blocks. Server-side keys (if any error messages localize) count too (standing constraint: "EN+FR i18n gate (server keys included)").
7. **Boot sweep idempotency:** per-row eligibility guard (row exists → skip), not a global "table empty" check — the migrateTotpReWrap/migrateUserNotifPrefs discipline. Zero-work pass must be a byte-identical no-op.
8. **Demo seed:** demo workspace seeds `savedViews: [v1 …]` (seed.js:512) — local-mode view persistence must not collide with the seeded legacy project views in dev/demo.

## Validation Architecture

> config.json has no `workflow.nyquist_validation` key → treated as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node --test` (unit) + Playwright (e2e) |
| Config file | `e2e/playwright.config.mjs` |
| Quick run command | `node --test test/<file>.test.mjs` |
| Full suite command | `npm test` then `npx playwright test e2e` (guarded build per Phase 56) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VIEW-01 | Column toggle survives re-login/new device | e2e (two sessions) + unit (row merge) | `npx playwright test e2e/projects-table.spec.mjs` + `node --test test/views-store.test.mjs` | ❌ Wave 0 |
| VIEW-02 | Save/apply/delete named view; row lands in `saved_views` | unit (route contract, caps, lenient load) + e2e | `node --test test/saved-views.test.mjs` | ❌ Wave 0 |
| VIEW-02b | Old-schema blob loads leniently (intersect, no throw) | unit | `node --test test/saved-views.test.mjs` | ❌ Wave 0 |
| VIEW-03 | defaultPrivate seeds `p.private` on create; hint renders | unit (mergeClientDoc normalization, stored-doc read) + e2e (owner toggle → member creates project) | `node --test test/default-private.test.mjs` + e2e project-settings spec | ❌ Wave 0 |
| Migration | doc.views → owner rows, strip, no ride-back | unit (boot sweep on fixture db) | `node --test test/views-migration.test.mjs` | ❌ Wave 0 |

### Sampling Rate
- Per task commit: the task's new test file + `npm run lint`
- Per wave merge: full `npm test` + i18n gate (`node scripts/i18n-scan.mjs`)
- Phase gate: full unit + e2e green, both backends (`db-adapter` suite covers pg parity — `test/copy-sqlite-to-pg.test.mjs` / `test/db-adapter.test.mjs` exist and must extend to `saved_views`)

### Wave 0 Gaps
- `test/saved-views.test.mjs`, `test/views-migration.test.mjs`, `test/default-private.test.mjs`
- Local-mode leaf module tests (pure functions, bare-Node importable per prefs.js module contract)
- Extend db-adapter tests to the new table's pg translation

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V4 Access Control | yes | Routes gated `requireUser` + workspace membership check (notifPrefs route shape, server.js:4078-4085); personal views never cross member boundaries (D-09) |
| V5 Input Validation | yes | Server-side whitelist + blob normalization + caps (D-12); `schema_version` intersection; JSON.parse wrapped in try/catch (server.js:4095-4100 pattern) |
| V6 Cryptography | no | No new secrets; blobs are non-sensitive view prefs |
| V3 Session | no | Existing cookie auth, unchanged |

### Known Threat Patterns
| Pattern | STRIDE | Mitigation |
|---------|--------|------------|
| Cross-member view injection (PUT with another user_id) | Tampering/Elevation | user_id always from session, never body (notifPrefs comment server.js:4077) |
| Oversized blob DoS | DoS | 2 kB cap server-side |
| Stale `doc.views` resurrection | Tampering | Three-site strip (Pitfall 1) |
| `defaultPrivate` forged via client prefs copy | Tampering | Read pref from STORED doc only (D-51-15/16 convention); normalize in mergeClientDoc |

## Runtime State Inventory

Not a rename/migration of identities, but the D-06 sweep is a real data migration:
| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `workspaces.doc` top-level `views` blobs (live per-table view state) in every existing workspace | Boot one-pass sweep → owner-attributed `saved_views` rows, then strip (code + migration both) |
| Live service config | None — verified: no external service holds view state | none |
| OS-registered state | None | none |
| Secrets/env vars | None added | none |
| Build artifacts | None (no package changes) | none |

Legacy `doc.savedViews` (project-scoped named filters) deliberately NOT migrated this phase — see Open Question 1.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `doc.savedViews` (legacy project-page views) stays untouched this phase | Architecture §5, Open Questions | If owner expects them migrated too, plan misses a sweep |
| A2 | Live column state persists for `p:<id>` keys too, not just `tasks`/`mytasks` | Critical fact 1 | If scoped to D-10 keys only, project-table column choices stay session-only |
| A3 | Server-side symmetric seeding of `private` from stored pref at project-create merge is desirable but optional | Critical fact 4 | Client-only seeding is spoofable by a crafted PUT; parity is one mergeClientDoc clause |
| A4 | `q` exclusion from snapshots (D-11) plus `_`-prefix transient exclusion covers all render-time mutations | Pitfalls 3 | A future transient field could leak into blobs |

## Open Questions (RESOLVED)

1. **Fate of legacy `doc.savedViews`.** What we know: it exists (actions.js:1448+, server merge/redaction, seed), is project-scoped, and D-06 only names `doc.views`. (RESOLVED → coexist untouched this phase; flagged assumption in 57-01/57-02 must_haves; new action names avoid the `saveView` collision.)
2. **Live-row vs named-row table shape.** Sentinel-name row vs `is_current` flag — discretion per CONTEXT. (RESOLVED → one table, PK `(workspace_id, user_id, key, name)`, sentinel `name=''` for the live row; 57-01 tracer + 57-02 flagged assumption.)
3. **Route path shape.** `/api/me/views?workspace=&key=` (notifPrefs style) vs `/api/workspaces/:slug/views`. (RESOLVED → `/api/me/views` notifPrefs style with `requireUser` + workspace membership; 57-01 tracer / 57-02 named rows + DELETE.)

## Sources

### Primary (HIGH confidence — read this session)
- `src/shell/view-engine.js:91-103` — viewOf default shape
- `src/core/store.js:160-172, 280-320` — docSnapshot, doc.views hydration, notifPrefs hydration
- `src/core/notifPrefs.js` (whole) — localStorage pattern, sanitize, merge
- `src/core/api.js:291-299` — notif-prefs route client shape
- `server.js:384-389` (DDL), `4077-4108` (PUT route), `803/2096-2098` (strips), `857-863` (projectIsPrivate), `991+` (hiddenFor), `1193-1230` (mergeClientDoc prefs read), `2413-2570` (boot migration sequence), `2894+` (migrateTotpReWrap pattern)
- `db-adapter.mjs:40-44, 84-93, 134-296` — pg translation + schema variants
- `src/actions/actions.js:1339-1457, 1618-1652, 2067-2083` — view mutations, legacy saveView, createProject (no `private` field), shareAccess toggle
- `src/overlays/popovers.js:312-318` — cols popover; `src/views/table.js:12, 67-90` — TCOLS + render-time `_projHidden`
- `src/overlays/modals.js:97-100, 318`; `src/pages/settings.js:319` — saveView modal, General Access row, perms toggle precedent
- `src/pages/project.js:45`, `seed.js:512` — legacy savedViews consumers
- `.planning/phases/57-views-columns-general-access/57-CONTEXT.md`, `.planning/STATE.md`

## Metadata

**Confidence breakdown:**
- Storage/route/migration recipe: HIGH — every template site read and quoted this session
- View-state snapshot shape: HIGH — verbatim from source
- Legacy savedViews reconciliation: MEDIUM — existence verified, intended fate is an open decision
- VIEW-03 enforcement parity: MEDIUM — client behavior clear; server seeding depth is A3

**Research date:** 2026-11-12
**Valid until:** 2026-12-12 (in-repo facts; re-verify if Phase 56 lands layout changes)
