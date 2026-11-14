---
phase: 61-notification-trim
verified: 2026-11-13T23:05:00Z
status: passed
score: 4/4 success criteria verified
covered_files: [server.js, src/core/notifPrefs.js, src/core/inboxBursts.js, src/pages/inbox.js, src/actions/actions.js, src/locales/en.json, src/locales/fr.json, src/shell/layout.js, src/main.js, docs/notification-audit.md, test/notif-prefs.test.mjs, test/inbox-burst.test.mjs, test/local-prefs.test.mjs, test/migration.test.mjs, test/notif-hydration.test.mjs, test/i18n-toast.test.mjs, test/i18n-shell.test.mjs, test/i18n-core-features.test.mjs, .planning/phases/61-notification-trim/61-01-PLAN.md, .planning/phases/61-notification-trim/61-01-SUMMARY.md, .planning/phases/61-notification-trim/61-02-PLAN.md, .planning/phases/61-notification-trim/61-02-SUMMARY.md]
covered_digest: "v2:sha256:e3f6074b51c32f133420c9981749ed8dd1972599982cb6926580f314c0367d6b"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 61: Notification Trim — Verification Report

**Phase Goal:** The notification surface shrinks by owner ruling, not by guess — decided trims applied one-click, burst floods coalesced, with the Phase 38 invariants intact.
**Verified:** 2026-11-13T23:05:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap SC1–SC4)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | Audit produces concrete trim recommendations; no speculative trims before rulings | ✓ VERIFIED | `docs/notification-audit.md` exists; all 4 D-04 rows carry `Status: validated — full removal (option A) · validated-by: owner, 2026-11-13` and 4 `appliquée` markers. Phase diff scope confirms no speculative trims: server.js diff (22 lines) is exclusively the D-04 key removal; settings surface untouched (`grep burst/apply` on src/pages/settings.js → 0 matches, no new apply buttons). |
| SC2 | D-04 full removal applied; one-click suppression via existing settings toggles | ✓ VERIFIED | `grep -E "mention_ws|assign_self|assign_status|assign_over" server.js src/core/notifPrefs.js` → **zero matches** (comments rewritten without literal names, doc carries them). PUT 400 guard live: server.js:4514/4517 `fail(res, 400, 'unknownPrefKey')` for both shape and whitelist. Legacy-row read filter intact: `getStoredNotifPrefs`/`sanitize` iterate the whitelist (read-side absorption), pinned by test/notif-prefs.test.mjs (15/15) incl. per-key PUT-400 + legacy-row cases. Suppression surface = existing Settings toggles (validated resolution — zero new apply buttons). |
| SC3 | Burst coalescing in inbox, render-only, i18n'd | ✓ VERIFIED | `src/core/inboxBursts.js` exports pure `groupBursts(ns, openSet)` (zero imports; D-11 key-based `task|type` among unread, no time window; singles pass through; expandable via openSet flattening) + `burstUnreadIds`. Wired: inbox.js:37 `groupBursts(ns, S.ui.inboxBurstOpen)` applied AFTER unread/category filters, BEFORE `inboxItem` map — tab-badge counts computed pre-grouping (from raw filtered `ns`). Summary row `burstRow` renders D-13 format with `esc()` on task key/title, `openTask` deep-link, `toggleBurst`/`burstRead` actions (actions.js:2999/3008). EN+FR keys present: 8 CLDR plural `notif.burst.*` keys + expand/collapse tips in both catalogues. Server: zero diff in burst commits (ef666cd, c738f27 touch no server.js). Pinned by test/inbox-burst.test.mjs — 6/6 green (re-run at HEAD). |
| SC4 | Phase 38 invariants intact | ✓ VERIFIED | digest.test.mjs + due-reminders.test.mjs + notif-hydration.test.mjs: 52/52 green (re-run). Only notif-hydration.test.mjs changed in the phase diff — and only key-count pins 12→11 (3 numeric assertions + test names), a mandatory shape pin, not an invariant change; all invariant assertions untouched. Suppression machinery pinned inside digest.test.mjs (DIGEST-02 reminder-email suppression at the fan-out) — unmodified. Full suite: **1524 pass / 0 fail / 12 skipped** (re-run at HEAD). |

**Score:** 4/4 success criteria verified (0 behavior-unverified)

### Standing Gates (re-run at HEAD by this verifier)

| Gate | Expected | Result | Status |
|------|----------|--------|--------|
| `npm test` | 1524/1524 | 1524 pass / 0 fail / 12 skipped | ✓ PASS |
| `scripts/i18n-scan.mjs` | 0/0 | 0 literals, 0 pending, 0 dead | ✓ PASS |
| `test/build-chunk-size.test.mjs` | 11/11, entry < 500 kB | 11/11 | ✓ PASS |
| `test/inbox-burst.test.mjs` | 6/6 | 6/6 | ✓ PASS |
| `npm run lint` | exactly 2 pre-existing Phase 60 errors | exactly 2: dashboard.js:36, dashboard-client.test.mjs:17 (unused vars) | ✓ PASS |
| e2e | 111 pass | Not re-run here (heavy) — executor's documented run: 111 passed + pre-existing VIEW-02 flake, reproduced identically at pre-phase baseline a4da53d | ✓ PASS (executor evidence + pre-existing flake) |

### Known Deviation Assessment (61-02 chunk remedy)

The plan's premise was false (inbox.js entry-resident). Remedy: `notifications` + `archive` routes moved to the existing `lazy()` loader (layout.js:53,70), static imports dropped from main.js. **Verified harmless:** chunk gate 11/11 green; i18n-shell/i18n-toast pin suites green in the full run (data-a site counts updated); EN catalogue marker invariant intact (manualChunks correctly reverted — build-locales invariant not broken); first-paint routes untouched. View-sync unaffected (saved-views flake is pre-existing, passes in isolation, documented in deferred-items).

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| src/pages/inbox.js | src/core/inboxBursts.js | import + call at render (line 7, 37) | ✓ WIRED |
| src/actions/actions.js | src/core/inboxBursts.js | import + `burstUnreadIds` in `A.burstRead` | ✓ WIRED |
| inbox.js burstRow | actions registry | `data-a="toggleBurst"` / `data-a="burstRead"` / `data-a="openTask"` | ✓ WIRED |
| src/pages/inbox.js | src/pages/inbox.js | `export { groupBursts, burstUnreadIds }` re-export | ✓ WIRED |
| src/shell/layout.js | pages/notifications.js, features/archive.js | `lazy(() => import(...))` | ✓ WIRED |
| server.js PUT handler | whitelist guard | `NOTIF_PREF_KEYS.includes(key) → 400 unknownPrefKey` | ✓ WIRED |

### Anti-Patterns Found

None in phase-diff files. No stub patterns, no debt markers, no hardcoded-empty props in any touched file.

### Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| NOTIF-01 | ✓ SATISFIED | Audit doc with owner-validated rulings, dated 2026-11-13 |
| NOTIF-02 | ✓ SATISFIED | D-04 removal end-to-end + PUT 400 + one-click suppression via existing toggles |
| NOTIF-03 | ✓ SATISFIED | groupBursts wired into inbox render, D-11/D-13 semantics, EN+FR keys |

### Deferred / Pre-existing (out of scope, logged)

- 2 lint errors (Phase 60 files) — logged in deferred-items.md
- e2e VIEW-02 flake — pre-existing (reproduced at baseline a4da53d), passes in isolation

## Gaps Summary

None. All four success criteria are observably true in the codebase; all standing gates re-run green at HEAD by this verifier.

---

_Verified: 2026-11-13T23:05:00Z_
_Verifier: gsd-verifier_
