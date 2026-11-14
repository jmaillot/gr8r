---
phase: 57-views-columns-general-access
plan: 02
subsystem: named saved views (VIEW-02)
tags: [saved-views, rest-routes, caps, lenient-load, popover, lazy-chunk, i18n-guards]
requires: [57-01 saved_views substrate, /api/me/views routes, viewSync lazy chunk, viewOf() view state, prompt/confirm modals]
provides:
  - server-side named-row guardrails — ≤20 rows/member/key, blob ≤2 kB, case-insensitive name uniqueness (keyed 413/409/400)
  - DELETE /api/me/views (named rows + the name='' D-14 live-row reset), canonical {live, named} body on all three routes
  - lenient read path: old-schema/corrupt blobs whitelist-intersected on GET, normalized back to storage (ROADMAP SC-3)
  - lazy savedViewsUi chunk: views popover (apply/delete rows + Save current… + Update), prompt-modal save, confirm-gated overwrite (D-12)
  - viewSync named-view API: snapshotView/saveNamedView/applyNamedView (in-place replace except q + mode)/deleteViewRow/refreshNamedViews
  - e2e/saved-views.spec.mjs — save → server-row proof → re-apply restore → update → delete
affects: [57-03 (default visibility — unrelated tables), future per-project named views (D-10 currently restricts to tasks/mytasks)]
tech-stack:
  added: []
  patterns: [lazy-chunk split under the DELIV-02 500 kB index gate (56-02/57-01 pattern), catalogue-guard test updates (size/parity/typography/data-a counts)]
key-files:
  created: [src/views/savedViewsUi.js, test/saved-views.test.mjs, e2e/saved-views.spec.mjs]
  modified: [server.js, src/core/savedViews.js, src/core/viewSync.js, src/core/api.js, src/actions/actions.js, src/overlays/popovers.js, src/shell/view-engine.js, src/pages/tasks.js, src/locales/en.json, src/locales/fr.json, src/core/download.js, src/export/csv.js, test/i18n-core-features.test.mjs, test/i18n-ui-helpers.test.mjs, test/i18n-toast.test.mjs, test/i18n-shell.test.mjs, test/error-codes.test.mjs]
decisions:
  - "Route shape: one shared viewsBody() builder — GET/PUT/DELETE all answer the canonical {views:{live,named:[{name,blob}]}} shape; the read path is also the migration path (normalized blobs written back)"
  - "Merge-vs-replace: the live row keeps 57-01 merge semantics; named rows are replace semantics — a snapshot is the whole view (explicit overwrite only, D-12)"
  - "Lazy savedViewsUi chunk created because the index chunk had only ~900 B headroom at plan time; api.deleteView seam dropped in favor of viewSync deleteViewRow; download.js + export/csv.js became lazy (async-only call sites) to fit the 500 kB gate (499,885 B)"
  - "Popovers.js reads the named-views cache via the pure savedViews.js leaf (never the lazy chunk statically); A.pop('views') refetches on open (D-52)"
  - "Save/update reuse the generic prompt + confirm modals — no new modal id, avoiding the legacy saveView modal entirely (naming hazard honored: saveTableView/applyTableView/deleteTableView/updateTableView)"
  - "applyNamedView preserves q AND the render mode beside the whitelist — mode is session state, not snapshot data (found by the new e2e)"
metrics:
  duration: ~65 min
  completed: 2026-11-12
status: complete
plan_head_before: cc45968510c976ac3c9b5b9ad0782362057d34ac
plan_head_after: 76535a6
commits: 3
actuals:
  tokens: 84000
  tasks: 3
  commits: 3
---

# Phase 57 Plan 02: Named Saved Views — Caps, Popover, Apply/Delete Summary

**One-liner:** Server-guarded named views (≤20/member/key, 2 kB blobs, case-insensitive unique names, lenient old-schema loads) behind the `/api/me/views` routes, a lazy savedViewsUi popover that saves/applies/updates/deletes them with an explicit overwrite confirm, and the D-14 live-row reset completed server-side.

## What Was Built

- **Task 1 (TDD, commit 45fa1d4):** server.js named-row PUT — caps enforced with COUNT and `Buffer.byteLength` (keyed `viewLimitReached` 413 / `viewBlobTooLarge` 413), case-insensitive uniqueness via JS lowercase compare (pg-portable; keyed `viewNameConflict` 409), D-10 key restriction (`viewKeyNotNamed` 400), replace semantics, canonical body. New DELETE route (revision-free, membership 404, session-sourced user_id; `name=''` = the D-14 live-row reset). Shared `viewsBody()` builder parses every stored blob leniently — corrupt JSON and old-schema blobs whitelist-intersect and normalize back into storage. `test/saved-views.test.mjs` NEW: 11 route-contract tests including the 20/21 cap boundary and the exactly-2 kB blob boundary.
- **Task 2 (commit b7bf9aa):** new lazy `src/views/savedViewsUi.js` chunk — views popover body (named rows with apply + delete icons, Save current…, Update, empty-state hint), prompt-modal save with conflict→confirm overwrites, apply via `applyNamedView` (whole live state replaced in place, `q` preserved), session-scoped last-saved name for Update. `savedViews.js` gains the shared cap constants, the local-mode named-view mirror (`projects.savedViewsNamed.<ws>`) and the in-memory cache. `viewSync.js` gains snapshotView/saveNamedView/applyNamedView/deleteViewRow/refreshNamedViews. `resetCols` now completes D-14 in server mode (DELETEs the live `name=''` row). Toolbar entry on tasks/mytasks tables. 21 new catalogue keys en+fr.
- **Task 3 (commit 76535a6):** e2e/saved-views.spec.mjs NEW (save → server-row API proof incl. no `q`/`_` transients → change live state → re-apply restores columns+sort → update-with-confirm → delete to the empty state); [Rule 1] applyNamedView mode-preservation fix found by that spec.

## Verification

- `node --test test/saved-views.test.mjs` — 11 pass (caps boundaries, uniqueness, lenient load, DELETE, D-10, trust boundaries)
- Full chain: chunk gate 9/9 (index 499,885 B ≤ 500,000) · `npm test` 1429 tests 0 fail (one run showed 2 concurrency-timing flakes that did not reproduce across two clean reruns) · eslint ✓ · i18n scan 0 violations · `npm run e2e` 110 passed (incl. the new saved-views spec)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] DELIV-02 500 kB index-chunk gate tripped (again)**
- **Found during:** Task 2 build
- **Issue:** the index chunk had ~900 B headroom; the popover/modal/action additions (plus 21 en-catalogue keys inlined into the index) pushed it to 501,184 B.
- **Fix:** the established lazy-chunk pattern — all views UI moved into a NEW lazy `savedViewsUi` chunk (index keeps one-line delegations + `p.html` popover seam); to recover the remaining bytes, `download.js` and `export/csv.js` (both async-only call sites) became lazy imports, and the `api.deleteView` seam was dropped in favor of `viewSync.deleteViewRow` — mirroring 57-01's decision to keep views helpers out of api.js. Index landed at 499,885 B.
- **Files:** src/views/savedViewsUi.js (new), src/core/api.js, src/core/download.js, src/export/csv.js, src/actions/actions.js
- **Commit:** b7bf9aa

**2. [Rule 1 - Bug] applyNamedView wiped the live render mode**
- **Found during:** Task 3 (the new e2e blanked the toolbar after applying)
- **Issue:** `mode` (list/board/table) lives on the live view but not in the whitelist; the in-place replace deleted it, so applying a view kicked the page out of table view.
- **Fix:** `mode` preserved beside `q` — both are session state the snapshot can never carry.
- **Files:** src/core/viewSync.js
- **Commit:** 76535a6

**3. [Rule 1 - Test fallout] catalogue guard tests drifted**
- **Found during:** Task 2 verify
- **Issue:** catalogue-size (1817→1838), err-code parity (client-only codes unallowlisted, `err.invalidViewName` uncatalogued), French typography (straight apostrophe, plain space before `?` — now narrow no-break space U+202F), and data-a count guards all assert exact baselines.
- **Fix:** 21 new keys catalogued en+fr; allowlist + counts updated with phase-annotated comments.
- **Files:** src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs, test/i18n-ui-helpers.test.mjs, test/i18n-toast.test.mjs, test/i18n-shell.test.mjs, test/error-codes.test.mjs
- **Commit:** b7bf9aa

### Notes (by design, not stubs)
- "GET named list for `p:<id>` rejects (D-10)" is implemented as: named writes rejected with a keyed 400, and the named list for project keys is always `[]` — the GET itself cannot 400 because 57-01 hydration reads live rows for `p:` keys.
- Popover body renders empty for one tick and is filled by the lazy chunk after the named-rows refresh (the DELIV-02 gate forbids a static pull).

## Known Stubs

None — every wire is live (server guardrails, save/apply/update/delete, local-mode mirror, D-14 server reset, e2e proof).

## Threat Flags

None — no new surface beyond the plan's `<threat_model>` (T-57-04 caps boundary-tested, T-57-05 session-sourced rows + membership 404 tested, T-57-06 whitelist on write AND read tested; no packages added).

## Self-Check: PASSED

- src/views/savedViewsUi.js, test/saved-views.test.mjs, e2e/saved-views.spec.mjs — FOUND on disk
- Commits 45fa1d4, b7bf9aa, 76535a6 — FOUND in git log
- Commit count measured: `git rev-list --count cc459685..HEAD` = 3
