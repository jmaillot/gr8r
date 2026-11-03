---
phase: 34-per-user-settings-isolation-search-leak-closure
verified: 2026-11-03T20:30:00Z
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
  - .planning/phases/34-per-user-settings-isolation-search-leak-closure/34-06-PLAN.md
  - .planning/phases/34-per-user-settings-isolation-search-leak-closure/34-06-SUMMARY.md
  - server.js
  - src/main.js
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
covered_digest: "v2:sha256:a4bee5df7e323e4fd0a72d66877baa7fb8be9a44603318ae847a3aebd002a56d"
behavior_unverified_items:
  - truth: "In API mode, an unchecked notification pref stays unchecked after F5 reload (G-34-4 + G-34-6 fix, live browser)"
    test: "Re-run UAT Test 8 in 34-UAT.md: in API mode (rebuilt client), toggle a notification pref OFF, press F5 on /w/<slug>"
    expected: "The pref stays OFF after reload — the main.js boot routine awaits hydrateNotifPrefs after hydrateFromServer success, adopting the stored row before the first render"
    why_human: "The merge semantics and the new boot-path wiring are test-pinned (notif-hydration.test.mjs, 9 tests) and grep-verified in src/main.js:338, but the live deployed page's render-before-fetch ordering and bundle caching can only be observed in a real browser session"
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 16/16
  gaps_closed:
    - "G-34-6: main.js /w/<slug> boot path now awaits hydrateNotifPrefs after hydrateFromServer success (plan 34-06, commits ac01ed2, fe2de1c, df91cff)"
  gaps_remaining: []
  regressions: []
stale_re_verification:
  reason: "#4682 chain — gap-closure plan 34-06 landed after the prior verification (human_needed, 16/16): hydrateNotifPrefs export + main.js boot wiring (ac01ed2, fe2de1c) and summary (df91cff)"
  fix_area_results: "34-06 must-haves verified in source (src/main.js:60,338; src/actions/actions.js:3209; test/notif-hydration.test.mjs pins f–i); full suite re-run 886 pass / 0 fail / 3 skip"
  live_uat_carried_over: "Test 8 in 34-UAT.md (API-mode F5 notif-pref persistence) carries over unchanged — now covering both the G-34-4 merge fix and the G-34-6 boot-path fix"
---

# Phase 34: Per-User Settings Isolation & Search Leak Closure — Verification Report

**Phase Goal:** Notification preferences stop living in the shared workspace document and become real per-user rows (`user_notif_prefs`, additive guarded migration, byte-identical second boot) with one accessor for every consumer; `invoices` pinned out; the substring recent-search leak closed by tokenized `referencesHidden`.
**Verified:** 2026-11-03T20:30:00Z
**Status:** human_needed (one live-browser UAT item remains — all code truths verified, no regressions)
**Re-verification:** Yes — stale re-verification after gap-closure plan 34-06

## Stale Re-Verification Scope

The prior report (2026-11-03T18:05:00Z, `human_needed`, 16/16) was invalidated because gap-closure plan **34-06** landed after it ran: commits **ac01ed2** (RED static wiring pin), **fe2de1c** (export hydrateNotifPrefs + wire main.js boot path), **df91cff** (summary), closing **G-34-6** — the 6th `hydrateFromServer` call site missed by 34-05, on the `/w/<slug>` F5-reload boot path. This re-verification:

1. Verified the 34-06 must-haves against actual source (not the SUMMARY's claims).
2. Re-ran the full test suite — 886 pass / 0 fail / 3 pre-existing skips.
3. Confirmed the 16 must-haves from the prior report still hold on the post-34-06 code.

## G-34-6 Fix Verification (plan 34-06)

| Must-have | Source Evidence | Status |
|-----|----------------|--------|
| Boot path (`/w/<slug>`) awaits `hydrateNotifPrefs` after `hydrateFromServer` success, adopting stored row before first render | `src/main.js:338`: success branch is `else { await seedLegacyLocale(); await hydrateNotifPrefs(); } // G-34-6`; the 401 branch returns early (no doomed call), `!ws.ok` toasts without hydrating; `hydrateNotifPrefs` imported at `src/main.js:60`; `S.notifPrefs = mergeNotifPrefs(...)` adoption confirmed in `src/actions/actions.js:3209–3214` | ✓ VERIFIED — pin (h) static sweep passes (every `hydrateFromServer` success site in actions.js AND main.js has a `hydrateNotifPrefs` within 12 lines); TDD RED was observed at ac01ed2 naming exactly `src/main.js:328` |
| `pollNotifs` does NOT GET notif-prefs — hydration stays boot/entry-time | `src/main.js` has exactly 2 comment-filtered `hydrateNotifPrefs` occurrences (import + line 338 call); pin (i) asserts the pollNotifs region is clean | ✓ VERIFIED — pin (i) passes |
| Local mode issues no GET (D-08 preserved) | `src/actions/actions.js:3210–3211`: `if (!api.enabled) return;` guard unchanged from 34-05; export added in place, function body untouched | ✓ VERIFIED — local-prefs suite passes |

All three commits confirmed in `git log` (ac01ed2, fe2de1c, df91cff; `git rev-list --count 1b643cb..HEAD` = 2 code commits + summary).

## Regression Check (full suite)

| Suite | Result | Status |
|-------|--------|--------|
| Full suite `npm test` | 889 tests: 886 pass / 0 fail / 3 skip | ✓ PASS |
| test/notif-hydration.test.mjs (incl. new pins f–i) | 9 tests, 0 fail | ✓ PASS |
| test/redaction.test.mjs | 26 tests, 0 fail | ✓ PASS |
| test/notif-prefs.test.mjs | 12 tests, 0 fail | ✓ PASS |
| test/migration.test.mjs | 37 tests, 0 fail | ✓ PASS |
| test/local-prefs.test.mjs + test/scope.test.mjs | 89 tests, 86 pass, 3 pre-existing skips, 0 fail | ✓ PASS |

No regression from 34-06. Debt markers (TBD/FIXME/XXX): none in any fix-touched file. The pre-existing Dockerfile-allowlist failure noted earlier was resolved in bd72533 (confirmed by the zero-fail full run).

## Goal Achievement

### Observable Truths

Truths 1–16 from the previous report re-confirmed on the post-34-06 code; truth 16's code-side residual (missed main.js boot site) is now closed by 34-06:

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `notifPrefs` lives as per-user rows after a guarded backfill; second boot byte-identical; doc no longer carries the field | ✓ VERIFIED | `migrateUserNotifPrefs` (server.js:1912–1967, post-WR-02); migration tests pass |
| 2 | Every consumer reads through one accessor `getUserNotifPrefs`; stale-client doc writes stripped not merged; two users differ | ✓ VERIFIED | server.js sole-reader + strip sites (:646, :1489); notif-prefs tests pass |
| 3 | PUT keyed on SESSION user; GET defaults-merged; 17-key whitelist 400 + Boolean coercion; partial PUT merges, never erases stored keys (WR-01) | ✓ VERIFIED | server.js:3196–3235; notif-prefs.test.mjs 12/12 |
| 4 | `invoices` never re-enters the doc write path — pinned | ✓ VERIFIED | migration.test.mjs pin passes |
| 5 | Corrupt doc blob never crashes boot; eligibility guard false forever; later joiners read defaults | ✓ VERIFIED | server.js:1923–1927 try/catch; post-WR-02 guard shape; pins pass |
| 6 | Full-token collision drops; substring-only collision survives; tokenless symbol-only hidden names drop via substring fallback (WR-03) | ✓ VERIFIED | redaction.js:31–49; 26-test table + scope D-13 pin |
| 7 | NFC+toLowerCase both sides; Café ≠ cafe; NFC/NFD match identically | ✓ VERIFIED | redaction.js:17–24; table rows pass |
| 8 | Recent searches remain one workspace-wide list (D-15) | ✓ VERIFIED | D-15 source-assertion pin passes |
| 9 | Residual free-text limitation documented in CHANGELOG.md | ✓ VERIFIED | CHANGELOG.md |
| 10 | Backstops: non-string terms / hostile hidden lists never throw | ✓ VERIFIED | redaction backstop tests pass |
| 11 | Toggle persists through exactly one branch (PUT or localStorage), never a doc write | ✓ VERIFIED | actions.js single `IN.npToggle` branch |
| 12 | Settings page renders `S.notifPrefs`, not `d.notifPrefs`; seed carries none | ✓ VERIFIED | settings.js; seed.js 0 occurrences |
| 13 | Legacy localStorage blob cannot resurrect doc notifPrefs | ✓ VERIFIED | store.js; local-prefs pin |
| 14 | Local mode: per-workspace key, defaults, whitelist, survives reload | ✓ VERIFIED | notifPrefs.js; local-prefs tests pass |
| 15 | No-row reads defaults; two equal rows stay distinct | ✓ VERIFIED | accessor merge + composite PK; notif-prefs tests pass |
| 16 | API-mode workspace entry fetches the stored row via `api.getNotifPrefs` and adopts it into `S.notifPrefs` before the next render — now including the `/w/<slug>` boot/F5 path (G-34-6); local mode issues no GET; 401 rides session-expired; other failures silent | ✓ VERIFIED (code + merge + sweep tests) / ⚠️ PRESENT_BEHAVIOR_UNVERIFIED (live F5 in deployed browser) | actions.js `export hydrateNotifPrefs` + 6 wiring sites incl. main.js:338; notif-hydration.test.mjs 9/9 — live-browser invariant routes to UAT Test 8 |

**Score:** 16/16 truths verified at presence/wiring/test level (1 with a live-browser behavior residual — see behavior_unverified_items)

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| SETTINGS-01 | notifPrefs → per-user rows, additive guarded migration, byte-identical reboot, doc stripped | ✓ SATISFIED | Truths 1, 5 (post-WR-02) |
| SETTINGS-02 | One accessor for all consumers; per-user isolation; PUT/GET + client branching; state survives reload (G-34-4 + G-34-6 fixes) | ✓ SATISFIED | Truths 2, 3 (post-WR-01), 11–16 (post-34-06) |
| SETTINGS-03 | invoices stays out, write-path pin | ✓ SATISFIED | Truth 4 |
| SEARCH-01 | Substring leak closed; tokenized matching; tokenless fallback; normalization/collision table; CHANGELOG note | ✓ SATISFIED | Truths 6–10 (post-WR-03) |

All 4 requirement IDs accounted for; no orphans.

### Human Verification Required

One item remains (carried over unchanged, now covering both the G-34-4 merge fix and the G-34-6 boot-path fix — Test 8 in `34-UAT.md`):

1. **UAT Test 8 — API-mode F5 notif-pref persistence (G-34-4 + G-34-6, live browser)** — rebuild/redeploy the client, then in API mode on `/w/<slug>` toggle a notification pref OFF and press F5. **Expected:** the pref stays OFF after reload. **Why human:** boot-path render ordering and bundle caching are observable only in a real browser; the merge semantics and the static wiring sweep are node-test-pinned but the deployed-page invariant is not.

### Gaps Summary

None blocking. Gap G-34-6 is closed in source (main.js boot path hydrates prefs after hydrateFromServer success) and pinned by a static sweep that catches any future missed call site. All prior WR fixes re-confirmed unchanged. The phase remains `human_needed` solely for the live-browser UAT Test 8, carried over unchanged.

---

_Verified: 2026-11-03T20:30:00Z_
_Verifier: the agent (gsd-verifier)_
