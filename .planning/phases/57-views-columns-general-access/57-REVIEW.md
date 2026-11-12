---
phase: 57-views-columns-general-access
reviewed: 2026-11-12T00:00:00Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - server.js
  - db-adapter.mjs
  - src/core/savedViews.js
  - src/core/viewSync.js
  - src/core/api.js
  - src/core/store.js
  - src/core/push.js
  - src/core/constants.js
  - src/actions/actions.js
  - src/main.js
  - src/views/savedViewsUi.js
  - src/overlays/popovers.js
  - src/overlays/modals.js
  - src/pages/settings.js
  - src/pages/tasks.js
  - src/shell/view-engine.js
  - src/locales/en.json
  - src/locales/fr.json
  - e2e/saved-views.spec.mjs
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: issues_found
---

# Phase 57: Code Review Report

**Reviewed:** 2026-11-12
**Depth:** standard
**Files Reviewed:** 19 (source files from the three SUMMARY.md scopes, cross-checked against the full phase git diff since 770935a)
**Status:** issues_found

## Summary

Phase 57 delivered per-user saved views (server rows + routes), named views with server-side guardrails, workspace default-private seeding, and three lazy-chunk splits. Overall the implementation is disciplined: all route queries are parameterized, user_id is session-sourced everywhere, membership 404 no-oracle checks are present, whitelist intersection applies on write AND read, the pg adapter conflict targets were correctly extended, and `applyDoc`/`docSnapshot`/`normalizeDoc`/`mergeClientDoc` all strip the legacy `views` field (resurrection blocked at all four sites — verified). All ten `hydrateFromServer` call sites were checked; each is followed by `await hydrateViews()` before render, so the `S.views = {}` reset in `applyDoc` (store.js:323) is never left unhydrated.

No critical issues found. Four warnings and four info items below.

## Warnings

### WR-01: View name interpolated through `t()` without HTML escaping (attribute/HTML injection)

**File:** `src/views/savedViewsUi.js:35` (also lines 86, 100, 103, 118)
**Issue:** i18n.js explicitly documents "It never escapes HTML: the caller interpolates user data through escHtml at the call site" (i18n.js:212-213). `popHtml` escapes the name into `data-name` with `esc()` but then interpolates the raw name through `t('a11y.deleteTableView', { name: x.name })` into an HTML attribute — a name containing `"` or `><img onerror=...>` breaks out of the attribute. The same raw interpolation occurs in the `updateTableViewConfirm` / `saveTableViewReplace` confirm bodies (lines 86, 100) and toast messages. A view name is attacker-controlled text (any string ≤100 chars after trim; the server validates length only).
**Severity rationale:** saved_views rows are strictly scoped to the session user (`user_id` from session in every query, verified), and the local mirror is per-browser — the only possible attacker is the viewing user themself (self-XSS), so this is not a cross-user vector today. Still a standing XSS pattern that becomes exploitable the moment any shared view surface lands.
**Fix:** escape at the call site, matching the module's own discipline:
```js
aria-label="${esc(t('a11y.deleteTableView', { name: x.name }))}"
// and for confirm bodies / toasts:
body: esc(t('modal.updateTableViewConfirm', { name })),
```

### WR-02: `hydrateViews` can install an empty view state object, bypassing `viewOf()` defaults

**File:** `src/core/viewSync.js:55`
**Issue:** `if (r.ok && r.data?.views?.live) S.views[key] = sanitizeViewBlob(r.data.views.live)` — an empty object is truthy. The server's lenient load (`viewsBody` in server.js) normalizes a stored blob containing only unknown/non-whitelisted keys (old-schema or forward-schema blob — the exact scenario `schema_version` and the lenient-load criterion exist for) to `{}` and serves it as `live: {}`. The client then sets `S.views[key] = {}`, and `viewOf(key)` (view-engine.js:92) only creates the hardcoded defaults `if (!S.views[key])` — so the returned view has no `hidden`, `filters`, `sort`, `group` or `colW`. Downstream consumers dereference these unguarded (`v.hidden.includes(...)` in popovers.js, `groupTasks(ts, v.group)`, `applyView`), which throws in the render/popover path and silently defeats the D-13 "absent key → defaults" contract.
**Fix:** only adopt non-empty blobs, or merge into the viewOf shape:
```js
const live = r.ok ? sanitizeViewBlob(r.data?.views?.live) : null;
if (live && Object.keys(live).length) S.views[key] = { ...viewOf(key), ...live };
```

### WR-03: Live view row has no blob size cap — inconsistent server guardrail

**File:** `server.js:4372-4375` (live-row PUT branch)
**Issue:** named rows are capped at 2 kB (`NAMED_VIEW_BLOB_MAX_BYTES`, `Buffer.byteLength` check), but the live-row merge writes `JSON.stringify(clean)` with no size limit. The whitelist constrains KEYS, not VALUES — a member can PUT a blob with arbitrarily large `filters`/`colW`/`hidden` arrays and store unbounded JSON per row per key. The plan's own threat model states "the client can never be the guard" (T-57-04); the same logic applies to the live row.
**Fix:** apply the same byte cap to the merged live blob (a 413 `viewBlobTooLarge` on the live PUT), e.g. reuse `NAMED_VIEW_BLOB_MAX_BYTES` or a dedicated live-row constant.

### WR-04: On the pg backend, `migrateUserViews` can never run — legacy views silently discarded without rows

**File:** `server.js:2670-2740` (`migrateUserViews`, backup block)
**Issue:** the pre-migration backup uses `pragma wal_checkpoint` + `vacuum into` inside `sqliteOnly(...)`. On the pg backend `sqliteOnly` throws, the catch logs and `return`s — so the sweep never inserts rows AND never strips the doc field. That part is graceful, but the first subsequent read/write then strips `doc.views` (normalizeDoc/mergeClientDoc) with no rows ever created: every workspace's legacy view state is permanently discarded on pg with only a log line. The vacuum-no-op-on-pg pattern exists elsewhere (server.js:6994) for non-destructive CLIs; here it gates a destructive one-way data migration.
**Fix:** on pg, run the row-insert + doc-strip transaction without the sqlite-only backup (or document pg's accepted data-loss explicitly next to the D-06 decision), so the migration completes on both backends instead of silently degrading to "strip and lose".

## Info

### IN-01: Unhandled promise rejection on the views-popover lazy import

**File:** `src/actions/actions.js:441`
**Issue:** `import('../views/savedViewsUi.js').then(m => m.refreshViewsPop())` has no `.catch` — a failed chunk load (offline flake, deploy invalidating the chunk hash) rejects unhandled and leaves a permanently empty popover. The sibling patterns in the same file (`resetCols`, `toggleCol2`) have the same shape.
**Fix:** add `.catch(() => {})` or a retry toast, consistent with how other lazy seams in the app degrade.

### IN-02: View whitelist constants duplicated client/server with no drift pin

**File:** `server.js:1563` vs `src/core/savedViews.js:18`
**Issue:** `VIEW_BLOB_KEYS`, `NAMED_VIEW_MAX`, `NAMED_VIEW_BLOB_MAX_BYTES` and `NAMED_VIEW_KEYS` are hand-duplicated between server.js and savedViews.js. The phase pinned `DEFAULT_OPTIONS` against its copy with a drift test (test/export-client.test.mjs) — the same hazard exists here with no pin.
**Fix:** add a drift test asserting `server.js`'s constants equal the client exports (string-scan or shared module, given the NO-IMPORTS constraints).

### IN-03: GET /api/me/views mutates storage (read path is also the migration path)

**File:** `server.js:4262-4297` (`viewsBody` write-backs)
**Issue:** the GET route UPDATEs stored blobs whose serialization normalizes. This is deliberate ("the read path is also the migration path") and converges after one request, but it makes GET non-idempotent and would surprise a read-replica/caching layer.
**Fix:** none required now; worth a comment flagging the invariant if a replica topology ever appears.

### IN-04: Mis-indented `await hydrateViews()` lines

**File:** `src/actions/actions.js:3828, 4038, 4101`
**Issue:** the added `await hydrateViews();` lines sit at column 2 inside blocks whose siblings are indented deeper — cosmetic only, behavior correct (verified each is inside the `joined.ok`/success branch after `hydrateNotifPrefs()`).
**Fix:** re-indent to match the surrounding block.

---

_Reviewed: 2026-11-12_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
