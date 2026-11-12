---
phase: 57-views-columns-general-access
verified: 2026-11-12T18:38:28Z
status: human_needed
score: 7/7 must-haves verified
covered_files:
  - .planning/phases/57-views-columns-general-access/57-01-PLAN.md
  - .planning/phases/57-views-columns-general-access/57-01-SUMMARY.md
  - .planning/phases/57-views-columns-general-access/57-02-PLAN.md
  - .planning/phases/57-views-columns-general-access/57-02-SUMMARY.md
  - .planning/phases/57-views-columns-general-access/57-03-PLAN.md
  - .planning/phases/57-views-columns-general-access/57-03-SUMMARY.md
  - db-adapter.mjs
  - e2e/default-visibility.spec.mjs
  - e2e/saved-views.spec.mjs
  - server.js
  - src/actions/actions.js
  - src/core/api.js
  - src/core/savedViews.js
  - src/core/store.js
  - src/core/viewSync.js
  - src/locales/en.json
  - src/locales/fr.json
  - src/overlays/modals.js
  - src/overlays/popovers.js
  - src/pages/settings.js
  - src/shell/view-engine.js
  - src/views/savedViewsUi.js
  - test/default-private.test.mjs
  - test/saved-views.test.mjs
  - test/views-columns.test.mjs
  - test/views-migration.test.mjs
covered_digest: "v2:sha256:a9801c4cf6337e83e3c2c774ffadcdb8b7a4cce8759b4fc130f004cd2af6bb03"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Sign in on device A, hide a tasks-table column; sign in on device B (fresh session) — column still hidden"
    expected: "Column visibility choice persisted to the member's saved_views live row applies on device B"
    why_human: "True cross-device sign-in (two devices/browsers) cannot be simulated in CI; the server round-trip is test-verified but the real-device flow was explicitly deferred to Manual-Only UAT in 57-VALIDATION.md"
  - test: "Save a named view on device A; apply then delete it on device B"
    expected: "Named view is listed, applies (columns/sort/filters restored), and deletes across devices"
    why_human: "Same cross-device constraint as VIEW-01; e2e covers save/apply/delete in one browser context"
---

# Phase 57: Views, Columns & General Access Verification Report

**Phase Goal:** Members shape their own table experience per user — visible columns, named saved views synced across devices — and owners set workspace-wide default visibility beyond the private/public binary.
**Verified:** 2026-11-12T18:38:28Z
**Status:** human_needed (2 deferred Manual-Only UAT items; all automated truths verified)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (merged: ROADMAP SC-1..4 + PLAN must_haves)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC-1 / VIEW-01: member hides/shows tasks columns; choice persists across sessions/devices in a `saved_views` row, never the doc | ✓ VERIFIED | `saved_views` DDL server.js:400 + db-adapter.mjs; GET/PUT `/api/me/views` (server.js:4304/4318) merge-not-replace with session-sourced user_id; `toggleCol2` → `persistLiveView` debounced write-through (actions.js:1388); store.js:321 `delete doc.views` strip; route round-trip + "stored doc carries no views field" test pass (test/views-columns.test.mjs) |
| 2 | SC-2 / VIEW-02: named view save/apply/delete lands in server `saved_views` | ✓ VERIFIED | Named PUT with caps (server.js:4352-4373), DELETE :4381; `saveTableView/applyTableView/deleteTableView/updateTableView` in savedViewsUi.js; popover rows wired (popovers.js, data-a attrs); e2e/saved-views.spec.mjs PASSED (save → server-row proof → re-apply → update → delete) |
| 3 | SC-3 / VIEW-02: old-schema blobs load leniently, unknown fields intersected away | ✓ VERIFIED | Shared `viewsBody()` parses every stored blob leniently and normalizes back to storage (server.js:4269-4297); test/saved-views.test.mjs 11/11 pass incl. cap/uniqueness/lenient boundaries |
| 4 | SC-4 / VIEW-03: owner sets `prefs.defaultPrivate`; seeds new-project `private:true`; funnel untouched | ✓ VERIFIED | server.js:1228 stored-doc-only seeding + :1480-1486 fail-closed coercion; settings.js:320 owner toggle; modals.js:319 informational hint; actions.js:1663 createProject seed; test/default-private.test.mjs 6/6; `projectIsPrivate`/`hiddenFor` unmodified; e2e/default-visibility.spec.mjs PASSED |
| 5 | Legacy `doc.views` → owner-attributed rows at boot; field never reappears | ✓ VERIFIED | `migrateUserViews()` server.js:2666, called at :2498 in boot sequence; tests: owner attribution, idempotent second boot, stale-client resurrection blocked, served doc never carries views — all pass |
| 6 | Demo/offline mode persists via localStorage key without calling routes (D-08) | ✓ VERIFIED | savedViews.js pure leaf with per-workspace `projects.savedViews.<ws>` mirror; viewSync.js hydrateViews/persistLiveView local branch; sanitize/try-catch fallback tests pass |
| 7 | Reset columns deletes the live row so `viewOf()` defaults return (D-14) | ✓ VERIFIED | `resetCols` (actions.js:1396) + `deleteViewRow(workspaceId, key, '')` (viewSync.js:135) → DELETE route live-row branch; local-mode clearing from 57-01 |

**Score:** 7/7 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| server.js saved_views DDL + routes + migrateUserViews | substrate | ✓ VERIFIED | lines 400, 4304-4420, 2666 |
| db-adapter.mjs PG variant table | parity | ✓ VERIFIED | saved_views present, PG_CONFLICT_TARGETS entry |
| src/core/savedViews.js | pure leaf, whitelist | ✓ VERIFIED | wired by viewSync/popovers/server route |
| src/core/viewSync.js | write-through + hydration | ✓ VERIFIED | wired from actions.js toggleCol2/resetCols |
| src/views/savedViewsUi.js | views popover UI | ✓ VERIFIED | lazy chunk, wired via actions registry |
| src/core/store.js strip | no doc.views hydration | ✓ VERIFIED | delete doc.views at :321 |
| src/pages/settings.js + modals.js + actions.js | VIEW-03 toggle/hint/seed | ✓ VERIFIED | :320, :319, :1663 |
| test files ×4 + e2e ×2 | proof | ✓ VERIFIED | all green (run this session) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| toggleCol2 (actions.js) | PUT /api/me/views | debounced persistLiveView | ✓ WIRED | actions.js:1388 |
| store hydration | row/localStorage → S.views | hydrateViews | ✓ WIRED | viewSync.js |
| boot sequence | migrateUserViews | after migrateTotpReWrap | ✓ WIRED | server.js:2498 |
| Save current… | named-row PUT + caps | snapshotView/saveNamedView | ✓ WIRED | savedViewsUi.js + server.js:4352 |
| delete icon | DELETE route | deleteViewRow | ✓ WIRED | viewSync.js:135 → :4381 |
| resetCols (server) | DELETE name='' row | deleteViewRow(ws,key,'') | ✓ WIRED | D-14 |
| owner toggle | doc PUT prefs funnel | tog('defaultPrivate') | ✓ WIRED | settings.js:320 |
| createProject | S.prefs.defaultPrivate | seed private:true | ✓ WIRED | actions.js:1663 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 4 phase test files (31 tests) | `node --test test/views-columns.test.mjs test/views-migration.test.mjs test/saved-views.test.mjs test/default-private.test.mjs` | 31 pass / 0 fail | ✓ PASS |
| Named-view save/apply/update/delete e2e | `npx playwright test e2e/saved-views.spec.mjs` | 1 passed | ✓ PASS |
| Owner default-visibility e2e | `npx playwright test e2e/default-visibility.spec.mjs` | 1 passed | ✓ PASS |
| i18n gate | `node scripts/i18n-scan.mjs` | 0 violations | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| VIEW-01 | 57-01 | Column show/hide persists across sessions and devices | ✓ SATISFIED | Truths 1, 5, 6; route round-trip + migration tests |
| VIEW-02 | 57-02 | Named views save/re-apply/delete from any device | ✓ SATISFIED | Truths 2, 3, 7; e2e saved-views |
| VIEW-03 | 57-03 | Workspace default visibility beyond the binary | ✓ SATISFIED | Truth 4; 6 server pins + e2e |

No orphaned requirements — all three REQUIREMENTS.md IDs mapped to Phase 57 are claimed by plans and evidenced.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | no TBD/FIXME/stub markers in phase files | — | — |

### Human Verification Required

1. **VIEW-01 cross-device column persistence** — sign in on device A, hide a column, sign in on device B, verify hidden. (Server round-trip is test-proven; real two-device flow deferred per 57-VALIDATION.md Manual-Only table.)
2. **VIEW-02 cross-device named view** — save on A; apply and delete on B.

### Gaps Summary

None. All 4 roadmap success criteria, all PLAN must_haves truths, prohibitions (no doc.views resurrection, no revision coupling, no funnel changes, session-sourced user_id, whitelist snapshots) and all three requirement IDs are satisfied with passing automated evidence — 31 unit/route tests, both phase e2e specs, and the i18n gate all re-run green in this verification session. Status is human_needed solely because the two Manual-Only cross-device checks from 57-VALIDATION.md require real second-device sign-in.

---

_Verified: 2026-11-12T18:38:28Z_
_Verifier: the agent (gsd-verifier)_
