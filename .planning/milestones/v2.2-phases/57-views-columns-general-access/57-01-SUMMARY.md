---
phase: 57-views-columns-general-access
plan: 01
subsystem: per-user view persistence (server rows + client substrate)
tags: [saved-views, column-persistence, migration, rest-routes, sqlite, pg-adapter]
requires: [user_notif_prefs precedent (Phase 34), viewOf() view state, boot migration sequence, db-adapter SQL rewrite layer]
provides:
  - saved_views table (SQLite + pg variants) with sentinel name='' live rows
  - GET/PUT /api/me/views revision-free routes (session-sourced user_id, membership 404, merge-not-replace, D-11 whitelist)
  - src/core/savedViews.js pure leaf (sanitize + per-workspace localStorage mirror)
  - src/core/viewSync.js lazy chunk (debounced write-through, boot hydration, D-14 local reset)
  - migrateUserViews() boot sweep + three-site views strip (docSnapshot, applyDoc, normalizeDoc+mergeClientDoc)
affects: [57-02 (named views, DELETE route, 2 kB cap), 57-03 (default visibility — unrelated tables)]
tech-stack:
  added: []
  patterns: [Phase-34 rows precedent (notifPrefs clone), lazy-chunk split for the DELIV-02 500 kB gate]
key-files:
  created: [src/core/savedViews.js, src/core/viewSync.js, test/views-columns.test.mjs, test/views-migration.test.mjs]
  modified: [server.js, db-adapter.mjs, src/core/api.js, src/core/store.js, src/core/push.js, src/actions/actions.js, src/main.js, src/overlays/popovers.js, src/locales/en.json, src/locales/fr.json, test/privacy.test.mjs, test/browser-push.test.mjs, test/build-chunk-size.test.mjs, test/i18n-core-features.test.mjs, test/i18n-overlays.test.mjs]
decisions:
  - "View sync code (persistLiveView/hydrateViews) split into a lazy viewSync chunk + push.js made lazy — the index chunk had only 80 bytes of headroom under the 500 kB DELIV-02 gate and the tracer pushed it over"
  - "api.js getViews/putViews live in viewSync over the now-exported call() rather than as api methods (index-gate headroom)"
  - "store.js local-mode views hydration moved from store init into hydrateViews() (awaited before first render) so savedViews.js stays out of the index chunk"
  - "Migration owner attribution resolves memberships role='owner' (lowercase, the DB spelling) with a deterministic user_id tiebreaker (rowid is pg-unsafe, pinned by static-db-audit)"
  - "privacy.test.mjs expectations moved to the rows-not-doc shape: the served doc carries no views field at all (strictly stronger than per-key scrubbing)"
metrics:
  duration: ~50 min
  completed: 2026-11-12
status: complete
plan_head_before: 076e8f3f44cd882fcb176a2f84dc0f6507e10d88
plan_head_after: 95854b4
commits: 2
actuals:
  tokens: 84000
  tasks: 3
  commits: 2
---

# Phase 57 Plan 01: Per-User View Persistence Substrate Summary

**One-liner:** `saved_views` rows (sentinel name='') behind revision-free `/api/me/views` routes, a pure localStorage mirror for demo mode, debounced write-through on column toggle, and the idempotent boot sweep that moves legacy `doc.views` into owner-attributed rows and strips the field at all three sites — VIEW-01 proven end-to-end by 14 new tests.

## What Was Built

- **DDL (Task 1):** `saved_views (workspace_id, user_id, key, name, blob, schema_version)` PK on all four — server.js SCHEMA with the notifPrefs comment style, identical table in db-adapter's SQLite schema, pg auto-translation via a new `PG_CONFLICT_TARGETS.saved_views` entry.
- **Routes (Task 1):** `GET /api/me/views?workspace=&key=` → `{views:{live,named:[]}}` (live null when absent); `PUT /api/me/views` → parse-corrupt-tolerant merge into the stored blob, whitelist intersection (filters/sort/group/hidden/colW/showDone — never `q`, never `_`-prefixed), `schema_version` coerced, revision-free per D-07. requireUser + sameOrigin + membership 404; user_id always from the session (T-57-01).
- **Client substrate (Task 1):** `savedViews.js` pure leaf (sanitize + per-workspace `projects.savedViews.<ws>` localStorage mirror); `viewSync.js` lazy chunk with the 450 ms-debounced `persistLiveView` (toggleCol2 write-through), per-key `hydrateViews()` (tasks, mytasks, `p:<id>` families), and the local-mode half of the D-14 reset. `resetCols` now deletes the live state and re-applies `viewOf()` defaults (label `popover.resetColumns`, en+fr).
- **Strip sites:** docSnapshot drops `views` (client save), applyDoc deletes `doc.views` (client hydration), normalizeDoc + mergeClientDoc strip server-side (read + write) — a stale client cannot resurrect the field (T-57-02).
- **Boot sweep (Task 2):** `migrateUserViews()` — field-presence guard, `vacuum into` backup (no backup = no mutation), one transaction: `insert or ignore` owner-attributed live rows per `views[key]`, doc strip in the same transaction; called after migrateTotpReWrap; second boot byte-identical.

## Verification

- `node --test test/views-columns.test.mjs` — 11 pass (sanitize, merge-not-replace, revision-free, 404 no-oracle, session-sourced user_id, 400s, doc-clean)
- `node --test test/views-migration.test.mjs` — 3 pass (owner attribution, idempotent second boot, resurrection blocked, read strip)
- Full chain: build-chunk gate 9/9 ✓ · `npm test` 1407/1408 suites, 1418 tests 0 fail ✓ · eslint ✓ · i18n scan 0 violations ✓ · `npm run e2e` 109 passed ✓
- Task 3 was verification-only (no files changed) — no per-task commit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] DELIV-02 500 kB index-chunk gate tripped**
- **Found during:** Task 1 verify
- **Issue:** the index chunk had only 80 bytes of headroom (499,920 B before); the tracer's additions pushed it to 501,940 B.
- **Fix:** the established 56-02 lazy-chunk pattern — new `src/core/viewSync.js` chunk carries persistLiveView/hydrateViews; push.js (`notifyNewEvents`/`permChanged`/`blockedToastOnce`) became lazy (all call sites already async); api.js exposes `call` and the views helpers live in viewSync. Added a split-existence assertion for the viewSync chunk to build-chunk-size.test.mjs; added `blockedToastFired` live binding to push.js so browser-push.test.mjs still observes the once-guard across the lazy seam.
- **Files:** src/core/viewSync.js, src/core/push.js, src/core/api.js, src/actions/actions.js, src/main.js, test/build-chunk-size.test.mjs, test/browser-push.test.mjs
- **Commit:** f132da1

**2. [Rule 1 - Bug] Owner attribution used the wrong role spelling**
- **Found during:** Task 2 test run
- **Issue:** memberships.role stores lowercase `'owner'`; the first draft queried `'Owner'` and matched nothing.
- **Fix:** query `role = 'owner'` with a deterministic `user_id` tiebreaker (an initial `rowid` ordering was rejected by the static-db-audit pg-portability gate — rowid is SQLite-only).
- **Commit:** 95854b4

**3. [Rule 1 - Test fallout] privacy.test.mjs asserted the retired per-key views redaction**
- **Found during:** Task 2 verify
- **Issue:** the suite read `bobView.doc.views[...]` and forged `tampered.views[...]` — the served/stored doc no longer carries views at all.
- **Fix:** expectations moved to the stronger rows-not-doc shape (field absent after read, write and forge attempts).
- **Commit:** 95854b4

### Legacy-state notes (by design, not stubs)
- Local (demo) mode: legacy `views` inside the `projects.v2` localStorage blob are NOT migrated — the doc/blob is never a view-state carrier again (D-05); first boot after this change falls back to viewOf() defaults locally. The D-06 sweep covers the server side, where the data is durable.
- Legacy `doc.savedViews` (project-page views) is untouched, per the plan's flagged assumption.
- In server mode, `resetCols` re-applies defaults locally; the live-row DELETE half of D-14 is declared for 57-02 Task 2 per the plan.

## Known Stubs

None — every wire is live (server routes, client write-through, boot hydration, migration).

## Threat Flags

None — no new surface beyond the plan's `<threat_model>` (T-57-01/02/03 all mitigated and tested; no packages added).

## Self-Check: PASSED

- src/core/savedViews.js, src/core/viewSync.js, test/views-columns.test.mjs, test/views-migration.test.mjs — FOUND on disk
- Commits f132da1, 95854b4 — FOUND in git log
- Commit count measured: `git rev-list --count 076e8f3..HEAD` = 2 (Task 3 is verification-only, no commit)
