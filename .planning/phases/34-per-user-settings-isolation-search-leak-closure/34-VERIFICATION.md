---
phase: 34-per-user-settings-isolation-search-leak-closure
verified: 2026-11-03T16:40:00Z
status: human_needed
score: 16/16 must-haves verified
behavior_unverified: 1
covered_files:
  - .planning/phases/34-per-user-settings-isolation-search-leak-closure/34-01-PLAN.md
  - .planning/phases/34-per-user-settings-isolation-search-leak-closure/34-01-SUMMARY.md
  - .planning/phases/34-per-user-settings-isolation-search-leak-closure/34-02-PLAN.md
  - .planning/phases/34-per-user-settings-isolation-search-leak-closure/34-02-SUMMARY.md
  - .planning/phases/34-per-user-settings-isolation-search-leak-closure/34-03-PLAN.md
  - .planning/phases/34-per-user-settings-isolation-search-leak-closure/34-03-SUMMARY.md
  - .planning/phases/34-per-user-settings-isolation-search-leak-closure/34-04-PLAN.md
  - .planning/phases/34-per-user-settings-isolation-search-leak-closure/34-04-SUMMARY.md
  - .planning/phases/34-per-user-settings-isolation-search-leak-closure/34-05-PLAN.md
  - .planning/phases/34-per-user-settings-isolation-search-leak-closure/34-05-SUMMARY.md
  - server.js
  - src/lib/redaction.js
  - src/core/notifPrefs.js
  - src/core/store.js
  - src/core/api.js
  - src/actions/actions.js
  - src/pages/settings.js
  - src/data/seed.js
  - test/notif-hydration.test.mjs
  - test/notif-prefs.test.mjs
  - test/migration.test.mjs
  - test/redaction.test.mjs
  - test/local-prefs.test.mjs
  - test/scope.test.mjs
  - CHANGELOG.md
covered_digest: "v2:d132519277474be12a4cf49c"
behavior_unverified_items:
  - truth: "In API mode, an unchecked notification pref stays unchecked after F5 reload (G-34-4 fix, live browser)"
    test: "Re-run UAT Test 4: in API mode (rebuilt client), toggle a notification pref OFF, press F5"
    expected: "The pref stays OFF after reload — hydrateNotifPrefs fetches the stored row at workspace open and adopts it before the next render"
    why_human: "The merge semantics are test-pinned (notif-hydration.test.mjs) and the GET wiring is grep-verified at all 5 entry paths, but the live deployed page's render-before-fetch ordering and caching behavior can only be observed in a real browser session"
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 15/15
  gaps_closed:
    - "G-34-4: API-mode notif-prefs hydration on workspace open (plan 34-05) — fix verified in code: mergeNotifPrefs helper + hydrateNotifPrefs wired at all 5 hydrateFromServer paths + test/notif-hydration.test.mjs pins (5/5 pass)"
  gaps_remaining: []
  regressions: []
---

# Phase 34: Per-User Settings Isolation & Search Leak Closure — Verification Report

**Phase Goal:** Notification preferences stop living in the shared workspace document and become real per-user rows (`user_notif_prefs`, additive guarded migration, byte-identical second boot) with one accessor for every consumer; `invoices` pinned out; the substring recent-search leak closed by tokenized `referencesHidden`.
**Verified:** 2026-11-03T16:40:00Z
**Status:** human_needed (one live-browser re-test of the G-34-4 fix remains — all code truths verified)
**Re-verification:** Yes — after gap closure (plan 34-05 closed G-34-4, the API-mode notif-prefs hydration gap from UAT Test 4)

## Re-Verification Scope

Previous report: `human_needed`, 15/15 technical truths verified, with three human-verification items. Since then the UAT session produced gaps: G-34-2 and G-34-5 resolved by agent Playwright runs (server rows independent; local mode survives F5), G-34-3 resolved by commit 4af1d9b (Dockerfile COPYs src/), and **G-34-4** (API-mode unchecked pref resets to all-ON after F5) closed by gap-closure plan 34-05. This re-verification:

1. Fully re-verified the G-34-4 fix (exists, substantive, wired, behavior-pinned).
2. Regression-checked all other phase suites (0 failures across 141 tests).
3. Confirmed commits cf72c1d / f88ec88 / 353f156 exist (`git log`).

## G-34-4 Fix Verification (Plan 34-05)

| Check | Evidence | Status |
|-------|----------|--------|
| `mergeNotifPrefs` helper exists and is pure | src/core/notifPrefs.js:64–66 — defaults → sanitize(client) → sanitize(server); reuses the 17-key whitelist + boolean-only `sanitize`; no store/DOM/api import; inputs never mutated | ✓ VERIFIED |
| Canonical-server semantics (mirrors PUT adoption) | test (d): server row wins over client; non-boolean server values rejected (T-34-11) | ✓ VERIFIED (test-pinned) |
| `hydrateNotifPrefs` guard/order/error shape | src/actions/actions.js:3209–3220 — `if (!api.enabled) return` (local mode untouched, D-08); on ok adopts `S.notifPrefs = mergeNotifPrefs(S.notifPrefs, r.data?.prefs)` (store-only, D-01); 401 dispatches the same `projects:save-error` CustomEvent as IN.npToggle; any other non-ok is silent and non-blocking (T-34-12) | ✓ VERIFIED |
| Wired at EVERY API-mode workspace entry | All 5 `hydrateFromServer` call sites (actions.js:3225, 3285, 3302, 3493, 3555) are each followed by `await hydrateNotifPrefs()` (:3227, :3287, :3309, :3500, :3562) — openWorkspace, join, primary login, signup, invite-accept. Grep: 9 matches, 1 real `api.getNotifPrefs` call in code | ✓ WIRED |
| Merge behavior pinned by node test | test/notif-hydration.test.mjs — 5 tests (a)–(e): D-27-5 defaults shape, stored-row-wins + whitelist drop, **the F5 shape (empty client, server row fills store)**, canonical-server + non-boolean rejection, immutability + D-01 no-carrier | ✓ VERIFIED — 5/5 pass (re-ran this session) |
| Workspace id resolved like npToggle | actions.js:3210 `api.enabled ? api.workspace?.id : D().ws.url` | ✓ WIRED |
| Commits | cf72c1d (RED test), f88ec88 (GREEN helper), 353f156 (wiring) — all in `git log` | ✓ VERIFIED |

**Residual:** the *live deployed page* behavior (GET fires at workspace open, store adopted before settings renders, browser cache does not serve a stale bundle) is client-runtime behavior no node test exercises — routed to human re-test of UAT Test 4 (the only remaining item).

## Goal Achievement

### Observable Truths

Truths 1–15 from the previous report remain verified; none regressed (regression run below). Truth 16 added for the G-34-4 closure.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `notifPrefs` lives as per-user rows after a guarded backfill; second boot byte-identical; doc no longer carries the field | ✓ VERIFIED | `migrateUserNotifPrefs` (server.js:1912); migration.test.mjs pins pass |
| 2 | Every consumer reads through one accessor `getUserNotifPrefs`; stale-client doc writes stripped not merged; two users differ | ✓ VERIFIED | server.js:1152 sole reader; :1373, :1225 per-recipient; :646/:1489 strip; notif-prefs tests pass |
| 3 | PUT keyed on SESSION user; GET defaults-merged; 17-key whitelist 400 + Boolean coercion | ✓ VERIFIED | server.js:3182–3219; notif-prefs.test.mjs |
| 4 | `invoices` never re-enters the doc write path — pinned | ✓ VERIFIED | migration.test.mjs:1005 pin passes |
| 5 | Corrupt doc blob never crashes boot; eligibility guard false forever; later joiners read defaults | ✓ VERIFIED | server.js:1923 try/catch; guard shape; pins pass |
| 6 | Full-token collision drops; substring-only collision ("Sara Corp" vs "Sarah") survives | ✓ VERIFIED | redaction.js token-set intersection; 22-test table + scope D-13 pin |
| 7 | NFC+toLowerCase both sides; Café ≠ cafe; NFC/NFD match identically | ✓ VERIFIED | redaction.js:20; table rows pass |
| 8 | Recent searches remain one workspace-wide list (D-15) | ✓ VERIFIED | D-15 source-assertion pin passes |
| 9 | Residual free-text limitation documented in CHANGELOG.md | ✓ VERIFIED | CHANGELOG.md:30 |
| 10 | Backstops: non-string terms / hostile hidden lists never throw | ✓ VERIFIED | redaction backstop tests pass |
| 11 | Toggle persists through exactly one branch (PUT or localStorage), never a doc write | ✓ VERIFIED | actions.js single `IN.npToggle` branch |
| 12 | Settings page renders `S.notifPrefs`, not `d.notifPrefs`; seed carries none | ✓ VERIFIED | settings.js:169; seed.js 0 occurrences |
| 13 | Legacy localStorage blob cannot resurrect doc notifPrefs | ✓ VERIFIED | store.js:39, :123; local-prefs pin |
| 14 | Local mode: per-workspace key, defaults, whitelist, survives reload | ✓ VERIFIED | notifPrefs.js:41–83; local-prefs tests 7/7 (browser-level item closed by agent Playwright run, G-34-5) |
| 15 | No-row reads defaults; two equal rows stay distinct | ✓ VERIFIED | accessor merge + composite PK; notif-prefs tests |
| 16 | **NEW (G-34-4 closure):** API-mode workspace entry fetches the stored row via `api.getNotifPrefs` and adopts it into `S.notifPrefs` before the next render; local mode issues no GET; 401 rides session-expired; other failures silent | ✓ VERIFIED (code + merge tests) / ⚠️ PRESENT_BEHAVIOR_UNVERIFIED (live F5 in deployed browser) | actions.js:3209–3220 + 5 wiring sites; notif-hydration.test.mjs 5/5 pass — the live-browser invariant routes to human re-test of UAT Test 4 |

**Score:** 16/16 truths verified at presence/wiring/test level (1 with a live-browser behavior residual — see behavior_unverified_items)

### Required Artifacts (new/changed by 34-05)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| src/core/notifPrefs.js mergeNotifPrefs | pure canonical-server merge | ✓ VERIFIED | :64–66; reuses whitelist sanitize; D-27-5/D-01 preserved |
| src/actions/actions.js hydrateNotifPrefs | GET-on-open at every entry, guard + 401 + silent-fail | ✓ VERIFIED | :3209–3220; wired ×5 |
| test/notif-hydration.test.mjs | merge/adopt pins | ✓ VERIFIED | 5/5 pass |

All other artifacts from the previous report (server routes, DDL, migration, redaction, settings, store, CHANGELOG) re-confirmed present; no regression.

### Key Link Verification (new)

| From | To | Via | Status |
|------|----|----|--------|
| every `hydrateFromServer` success path (×5) | `hydrateNotifPrefs` → `api.getNotifPrefs(wsId)` | await after res.ok | ✓ WIRED (actions.js:3227/3287/3309/3500/3562) |
| GET response | `S.notifPrefs` | mergeNotifPrefs canonical-server adoption | ✓ WIRED (actions.js:3214) |
| 401 GET | session-expired path | `projects:save-error` CustomEvent | ✓ WIRED (actions.js:3218) |
| mergeNotifPrefs | NOTIF_PREF_KEYS whitelist + boolean sanitize | sanitize() reuse | ✓ WIRED (notifPrefs.js:46–54) |

### Behavioral Spot-Checks (re-run this session)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Hydration merge pins + local + server prefs suites | `node --test test/notif-hydration.test.mjs test/local-prefs.test.mjs test/notif-prefs.test.mjs` | 22 pass / 0 fail | ✓ PASS |
| Migration, redaction, scope regression | `node --test test/migration.test.mjs test/redaction.test.mjs test/scope.test.mjs` | 141 tests, 138 pass, 0 fail, 3 pre-existing skips | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SETTINGS-01 | 34-01, 34-02 | notifPrefs → per-user rows, additive guarded migration, byte-identical reboot, doc stripped | ✓ SATISFIED | Truths 1–5 |
| SETTINGS-02 | 34-01, 34-04, 34-05 | All consumers through one accessor; per-user isolation; client branching adapter; **state survives reload (G-34-4 fix)** | ✓ SATISFIED | Truths 2, 11–14, 16 |
| SETTINGS-03 | 34-02 | invoices stays out, write-path pin | ✓ SATISFIED | Truth 4 |
| SEARCH-01 | 34-03 | Substring leak closed; tokenized matching; normalization/collision table; CHANGELOG note | ✓ SATISFIED | Truths 6–10 |

All 4 requirement IDs claimed by plans and accounted for; REQUIREMENTS.md maps exactly SETTINGS-01..03 + SEARCH-01 to Phase 34 — no orphans.

### Anti-Patterns Found

None — no TBD/FIXME/XXX/placeholder markers in any phase-modified file, including the 34-05 files.

### Human Verification Required

One item remains (all previously-flagged items are closed: UAT tests 1, 3, 6, 7 passed; tests 2 & 5 resolved by agent Playwright runs; the pre-toggle hydration display gap that was test 3's subject is superseded by the G-34-4 fix):

1. **Re-run UAT Test 4 in API mode (G-34-4 fix, live browser)** — rebuild/redeploy the client, then in API mode toggle a notification pref OFF and press F5. **Expected:** the pref stays OFF after reload. **Why human:** GET-on-workspace-open render ordering and bundle caching are observable only in a real browser; the merge semantics are node-test-pinned but the deployed-page invariant is not.

### Gaps Summary

None blocking. G-34-4 is fixed in code and test-pinned: `mergeNotifPrefs` (pure, whitelist/boolean sanitize, server-canonical) plus `hydrateNotifPrefs` wired at all five API-mode workspace-entry paths, with the local-mode path explicitly untouched. All suites pass with zero regressions (163 tests re-run across 6 files this session). The phase remains `human_needed` solely for the live-browser re-test of the fix (UAT Test 4). Known out-of-scope item carried in deferred-items.md: the pre-existing `test/dependencies.test.mjs` Dockerfile-allowlist failure (reproduced at base commit 3116272, not caused by 34-05).

---

_Verified: 2026-11-03T16:40:00Z_
_Verifier: the agent (gsd-verifier)_
