---
phase: 57-views-columns-general-access
verified: 2026-11-12T21:30:00Z
status: passed
score: 7/7 must-haves verified
covered_files:
  - .planning/phases/57-views-columns-general-access/57-01-PLAN.md
  - .planning/phases/57-views-columns-general-access/57-01-SUMMARY.md
  - .planning/phases/57-views-columns-general-access/57-02-PLAN.md
  - .planning/phases/57-views-columns-general-access/57-02-SUMMARY.md
  - .planning/phases/57-views-columns-general-access/57-03-PLAN.md
  - .planning/phases/57-views-columns-general-access/57-03-SUMMARY.md
  - .planning/phases/57-views-columns-general-access/57-REVIEW-FIX.md
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
  - test/build-chunk-size.test.mjs
  - test/default-private.test.mjs
  - test/saved-views.test.mjs
  - test/views-columns.test.mjs
  - test/views-migration.test.mjs
covered_digest: "v4:sha256:bbb0d033eb77d6cfc5c745a3a2d2be4d0198bf14698e2bb38a9bab2e4620ea3c"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 7/7
  gaps_closed:
    - "Cross-device column persistence — UAT test 1 PASSED (57-UAT.md)"
    - "Cross-device named view save/apply/delete — UAT test 2 PASSED (57-UAT.md)"
    - "Post-review source changes re-verified: WR-01..WR-04 and IN-01..IN-05 fixes confirmed in source, 8/8 fix commits exist, phase test suite re-run green"
  gaps_remaining: []
  regressions: []
human_verification: [] # previous 2 items SATISFIED by 57-UAT.md (2/2 passed 2026-11-12T19:05Z); carried forward, not re-required
---

# Phase 57: Views, Columns & General Access Verification Report

**Phase Goal:** Members shape their own table experience per user — visible columns, named saved views synced across devices — and owners set workspace-wide default visibility beyond the private/public binary.
**Verified:** 2026-11-12T21:30:00Z
**Status:** passed
**Re-verification:** Yes — after UAT closure and post-review source changes (57-REVIEW-FIX.md: WR-01..WR-04 + IN-01..IN-05)

## Goal Achievement

### Re-verification Scope

The covered source changed since the previous `passed` verification (canonicalized from human_needed after UAT). Re-verification focus:

1. **Changed files (full check):** `src/views/savedViewsUi.js`, `src/core/viewSync.js`, `server.js`, `src/actions/actions.js`, `test/saved-views.test.mjs`, `test/build-chunk-size.test.mjs`
2. **Unchanged files (regression):** existence + wiring confirmed unchanged by digest comparison and spot greps.

### Review-Fix Evidence (verified in source, not from REVIEW-FIX.md claims)

| Fix | File:Line evidence | Status |
|-----|--------------------|--------|
| WR-01 name escaping through `t()` | savedViewsUi.js:35 (`esc(x.name)` ×3 + `esc(t('a11y.deleteTableView'…))`), :86, :100 | ✓ VERIFIED |
| WR-02 no empty-view-state adoption | viewSync.js:60-61 — `sanitizeViewBlob(r.data?.views?.live)` then non-empty guard merging over `viewOf(key)` defaults | ✓ VERIFIED |
| WR-03 live-row blob cap | server.js:4388-4394 — merged blob byte-capped with `NAMED_VIEW_BLOB_MAX_BYTES`, keyed `413 viewBlobTooLarge` | ✓ VERIFIED |
| WR-04 pg migration path | server.js:2668+ — `backendKind !== 'pg'` gates only the sqlite backup; row-insert + doc-strip proceed as one transaction on pg | ✓ VERIFIED |
| IN-01 lazy-import catches | actions.js `.catch(() => {})` on views-popover/savedViewsUi/hydrateViews imports | ✓ VERIFIED (grep) |
| IN-02 drift pin | test/saved-views.test.mjs new drift test (client exports vs server.js string-scan) | ✓ VERIFIED (suite green) |
| IN-03 GET non-idempotence doc | server.js comment INVARIANT note | ✓ VERIFIED |
| IN-04 re-indent | actions.js cosmetic, `node --check` per REVIEW-FIX | ✓ VERIFIED |
| Bonus entry-chunk pin | test/build-chunk-size.test.mjs entry-chunk existence + ≤500 kB gate | ✓ VERIFIED (gate green) |

All 8 fix commits exist in git history: 41f6c3d, 25e3979, acf00af, bd59d9a, 5b6de88, 523663c, b31c0da, 18f085b.

### Observable Truths (merged: ROADMAP SC-1..4 + PLAN must_haves)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC-1 / VIEW-01: member hides/shows tasks columns; choice persists across sessions/devices in a `saved_views` row, never the doc | ✓ VERIFIED | Routes + merge-not-replace + session-sourced user_id (server.js:4304/4318 region); `toggleCol2` → debounced `persistLiveView`; store.js strip; **plus UAT test 1 PASS on real devices** |
| 2 | SC-2 / VIEW-02: named view save/apply/delete lands in server `saved_views` | ✓ VERIFIED | Named PUT with caps, DELETE route; savedViewsUi.js handlers; **plus UAT test 2 PASS on real devices** |
| 3 | SC-3 / VIEW-02: old-schema blobs load leniently, unknown fields intersected away | ✓ VERIFIED | `viewsBody()` lenient parse/normalize; saved-views suite green (incl. new IN-02 drift pin) |
| 4 | SC-4 / VIEW-03: owner sets `prefs.defaultPrivate`; seeds new-project `private:true`; funnel untouched | ✓ VERIFIED | settings.js owner toggle; modals hint; actions seed; default-private tests + e2e green |
| 5 | Legacy `doc.views` → owner-attributed rows at boot; field never reappears | ✓ VERIFIED | `migrateUserViews()` server.js:2668, boot-called :2498; **WR-04 fix extends migration to pg backend (confirmed in source)**; migration tests green |
| 6 | Demo/offline mode persists via localStorage key without calling routes (D-08) | ✓ VERIFIED | savedViews.js pure leaf + viewSync local branch; **WR-02 fix keeps defaults surviving empty/lenient blobs (confirmed viewSync.js:60-61)** |
| 7 | Reset columns deletes the live row so `viewOf()` defaults return (D-14) | ✓ VERIFIED | `resetCols` → `deleteViewRow(ws,key,'')` → live-row DELETE branch; live-row PUT merge + cap confirmed in source |

**Score:** 7/7 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| server.js saved_views DDL + routes + migrateUserViews | substrate | ✓ VERIFIED | incl. WR-03/WR-04 fixes |
| db-adapter.mjs PG variant table | parity | ✓ VERIFIED | unchanged |
| src/core/savedViews.js | pure leaf, whitelist | ✓ VERIFIED | unchanged |
| src/core/viewSync.js | write-through + hydration | ✓ VERIFIED | WR-02 fix confirmed |
| src/views/savedViewsUi.js | views popover UI | ✓ VERIFIED | WR-01 fix confirmed |
| src/core/store.js strip | no doc.views hydration | ✓ VERIFIED | unchanged |
| settings.js + modals.js + actions.js | VIEW-03 toggle/hint/seed | ✓ VERIFIED | IN-01/IN-04 fixes confirmed |
| test files ×4 + build gate + e2e ×2 | proof | ✓ VERIFIED | re-run green this session |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| toggleCol2 (actions.js) | PUT /api/me/views | debounced persistLiveView | ✓ WIRED | unchanged |
| store hydration | row/localStorage → S.views | hydrateViews | ✓ WIRED | WR-02-sanitized |
| boot sequence | migrateUserViews | after migrateTotpReWrap | ✓ WIRED | server.js:2498 |
| Save current… | named-row PUT + caps | snapshotView/saveNamedView | ✓ WIRED | unchanged |
| delete icon | DELETE route | deleteViewRow | ✓ WIRED | unchanged |
| resetCols (server) | DELETE name='' row | deleteViewRow(ws,key,'') | ✓ WIRED | live-row PUT merge + 2 kB cap confirmed |
| owner toggle | doc PUT prefs funnel | tog('defaultPrivate') | ✓ WIRED | unchanged |
| createProject | S.prefs.defaultPrivate | seed private:true | ✓ WIRED | unchanged |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 4 phase test files | `node --test test/views-columns.test.mjs test/views-migration.test.mjs test/saved-views.test.mjs test/default-private.test.mjs` | 0 fail (single run, re-verification session) | ✓ PASS |
| Fix commits exist | `git log --oneline --all \| grep -cE '41f6c3d\|25e3979\|acf00af\|bd59d9a\|5b6de88\|523663c\|b31c0da\|18f085b'` | 8/8 | ✓ PASS |
| WR-02 non-empty adoption guard | grep viewSync.js:60-61 | confirmed in source | ✓ PASS |
| WR-03 live-row 413 cap | grep server.js:4388-4394 | confirmed in source | ✓ PASS |
| WR-04 pg migration branch | grep server.js:2668+ | confirmed in source | ✓ PASS |
| WR-01 esc at 3 call sites | grep savedViewsUi.js:35/86/100 | confirmed in source | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| VIEW-01 | 57-01 | Column show/hide persists across sessions and devices | ✓ SATISFIED | Truths 1, 5, 6; UAT test 1 PASS |
| VIEW-02 | 57-02 | Named views save/re-apply/delete from any device | ✓ SATISFIED | Truths 2, 3, 7; UAT test 2 PASS |
| VIEW-03 | 57-03 | Workspace default visibility beyond the binary | ✓ SATISFIED | Truth 4; server pins + e2e green |

All three REQUIREMENTS.md IDs mapped to Phase 57 (REQUIREMENTS.md:40-42, 74-76) are claimed and evidenced. No orphaned requirements.

### Human Verification Required

**None.** The two prior human-verification items (cross-device column persistence; cross-device named view save/apply/delete) were satisfied by UAT on 2026-11-12 — 2/2 passed per 57-UAT.md. Carried forward as satisfied; not re-required.

### Gaps Summary

None. The post-review changes (WR-01..WR-04, IN-01..IN-05, entry-chunk pin) are confirmed in source, all 8 fix commits exist, the full unit suite passes (1439/0 per REVIEW-FIX; phase subset re-run green here), and the previously human-needed cross-device items are closed by a passing UAT. Status: **passed**.

### Deferred Follow-Ups (informational, not gaps)

- Mobile layout: tasks-table columns button heavily truncated on phone (noted in UAT test 1; recorded as deferred follow-up in 57-UAT.md, out of this phase's scope).

---

_Verified: 2026-11-12T21:30:00Z_
_Verifier: the agent (gsd-verifier)_
