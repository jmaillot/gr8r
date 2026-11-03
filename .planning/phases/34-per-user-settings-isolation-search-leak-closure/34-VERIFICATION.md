---
phase: 34-per-user-settings-isolation-search-leak-closure
verified: 2026-11-03T18:05:00Z
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
covered_digest: "v2:sha256:48e3715648d05622898e3b2ed2457634d9cd57e5c2ba7ffdb6d41b0efc7e4add"
behavior_unverified_items:
  - truth: "In API mode, an unchecked notification pref stays unchecked after F5 reload (G-34-4 fix, live browser)"
    test: "Re-run UAT Test 8 (the former UAT Test 4 re-test) in 34-UAT.md: in API mode (rebuilt client), toggle a notification pref OFF, press F5"
    expected: "The pref stays OFF after reload — hydrateNotifPrefs fetches the stored row at workspace open and adopts it before the next render"
    why_human: "The merge semantics are test-pinned (notif-hydration.test.mjs) and the GET wiring is grep-verified at all 5 entry paths, but the live deployed page's render-before-fetch ordering and caching behavior can only be observed in a real browser session"
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 16/16
  gaps_closed: []
  gaps_remaining: []
  regressions: []
stale_re_verification:
  reason: "#4682 — prior verification (16/16, human_needed) was invalidated because covered source changed AFTER the verifier ran: code-review fixes beb9138 (WR-03), 3edf0b0 (WR-01), f0a95a7 (WR-02)"
  fix_area_results: "All three fixes verified in source; fix-area suites re-run with zero failures"
  live_uat_carried_over: "Test 8 in 34-UAT.md (API-mode F5 notif-pref persistence) carries over unchanged"
---

# Phase 34: Per-User Settings Isolation & Search Leak Closure — Verification Report

**Phase Goal:** Notification preferences stop living in the shared workspace document and become real per-user rows (`user_notif_prefs`, additive guarded migration, byte-identical second boot) with one accessor for every consumer; `invoices` pinned out; the substring recent-search leak closed by tokenized `referencesHidden`.
**Verified:** 2026-11-03T18:05:00Z
**Status:** human_needed (one live-browser UAT item remains — all code truths verified, no regressions)
**Re-verification:** Yes — stale re-verification (#4682)

## Stale Re-Verification Scope

The prior report (2026-11-03T16:40:00Z, `human_needed`, 16/16) was invalidated because three code-review fixes landed after it ran: **beb9138** (WR-03), **3edf0b0** (WR-01), **f0a95a7** (WR-02) — see `34-REVIEW-FIX.md`. This re-verification:

1. Verified each fix against actual source (not the fix report's claims).
2. Re-ran the fix-area test suites plus the remaining regression suites — zero failures.
3. Confirmed the 16 must-haves from the prior report still hold on the post-fix code.

## WR Fix Verification

| Fix | Source Evidence | Status |
|-----|----------------|--------|
| **WR-03** — substring fallback for tokenless hidden names | `src/lib/redaction.js:36–43`: `if (nameTokens.length === 0)` → NFC+lowercase+trim both sides, `includes` fallback, `continue`; tokenized matcher unchanged as the primary path for tokened names | ✓ VERIFIED — 4 new table rows in test/redaction.test.mjs (section i) pass, including the non-over-match boundary ("unrelated query" vs [###] → keep) |
| **WR-01** — partial PUT merges into existing row | `server.js:3221–3233`: reads `user_notif_prefs` row, defensive JSON.parse (corrupt → `{}`), `{ ...existing }` base, whitelist+Boolean per incoming key, insert-or-replace merged object. Session user still authoritative (no body.user_id read, :3201–3204) | ✓ VERIFIED — test (c2) partial-PUT-preserves-stored-false passes; test (i) adapted, 12/12 notif-prefs tests pass |
| **WR-02** — migration guard = doc carries notifPrefs alone | `server.js:1912–1932`: eligibility is `doc?.data?.notifPrefs` object check only; per-member missing-row scan removed; strip still in same `begin immediate` transaction (D-11, :1945–1962); insert-or-ignore keeps pre-existing rows (D-09, :1947–1954); guard false forever after first migrating boot → byte-identical second boot preserved | ✓ VERIFIED — test (i2) (legacy field stripped even when every member has a row) passes; 37 migration tests pass |

All three commits confirmed in `git log` (beb9138, 3edf0b0, f0a95a7, plus fix-report commits f2b0479/3de5e09).

## Regression Check (fix areas + adjacent suites)

| Suite | Result | Status |
|-------|--------|--------|
| test/redaction.test.mjs | 26 tests, 0 fail | ✓ PASS |
| test/notif-prefs.test.mjs | 12 tests, 0 fail | ✓ PASS |
| test/notif-hydration.test.mjs | 5 tests, 0 fail | ✓ PASS |
| test/migration.test.mjs | 37 tests, 0 fail | ✓ PASS |
| Combined run (4 files above) | 80 tests, 80 pass, 0 fail | ✓ PASS |
| test/local-prefs.test.mjs + test/scope.test.mjs | 89 tests, 86 pass, 3 pre-existing skips, 0 fail | ✓ PASS |

No regression from any fix. Debt markers (TBD/FIXME/XXX): none in any fix-touched file.

## Goal Achievement

### Observable Truths

Truths 1–16 from the previous report re-confirmed on the post-fix code; none invalidated by the WR fixes:

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `notifPrefs` lives as per-user rows after a guarded backfill; second boot byte-identical; doc no longer carries the field | ✓ VERIFIED | `migrateUserNotifPrefs` (server.js:1912–1967, post-WR-02); migration tests pass |
| 2 | Every consumer reads through one accessor `getUserNotifPrefs`; stale-client doc writes stripped not merged; two users differ | ✓ VERIFIED | server.js sole-reader + strip sites (:646, :1489); notif-prefs tests pass |
| 3 | PUT keyed on SESSION user; GET defaults-merged; 17-key whitelist 400 + Boolean coercion; **partial PUT merges, never erases stored keys (WR-01)** | ✓ VERIFIED | server.js:3196–3235; notif-prefs.test.mjs 12/12 |
| 4 | `invoices` never re-enters the doc write path — pinned | ✓ VERIFIED | migration.test.mjs pin passes |
| 5 | Corrupt doc blob never crashes boot; eligibility guard false forever; later joiners read defaults | ✓ VERIFIED | server.js:1923–1927 try/catch; post-WR-02 guard shape; pins pass |
| 6 | Full-token collision drops; substring-only collision survives; **tokenless symbol-only hidden names drop via substring fallback (WR-03)** | ✓ VERIFIED | redaction.js:31–49; 26-test table + scope D-13 pin |
| 7 | NFC+toLowerCase both sides; Café ≠ cafe; NFC/NFD match identically | ✓ VERIFIED | redaction.js:17–24; table rows pass |
| 8 | Recent searches remain one workspace-wide list (D-15) | ✓ VERIFIED | D-15 source-assertion pin passes |
| 9 | Residual free-text limitation documented in CHANGELOG.md | ✓ VERIFIED | CHANGELOG.md |
| 10 | Backstops: non-string terms / hostile hidden lists never throw | ✓ VERIFIED | redaction backstop tests pass |
| 11 | Toggle persists through exactly one branch (PUT or localStorage), never a doc write | ✓ VERIFIED | actions.js single `IN.npToggle` branch |
| 12 | Settings page renders `S.notifPrefs`, not `d.notifPrefs`; seed carries none | ✓ VERIFIED | settings.js; seed.js 0 occurrences |
| 13 | Legacy localStorage blob cannot resurrect doc notifPrefs | ✓ VERIFIED | store.js; local-prefs pin |
| 14 | Local mode: per-workspace key, defaults, whitelist, survives reload | ✓ VERIFIED | notifPrefs.js; local-prefs tests pass |
| 15 | No-row reads defaults; two equal rows stay distinct | ✓ VERIFIED | accessor merge + composite PK; notif-prefs tests pass |
| 16 | API-mode workspace entry fetches the stored row via `api.getNotifPrefs` and adopts it into `S.notifPrefs` before the next render; local mode issues no GET; 401 rides session-expired; other failures silent | ✓ VERIFIED (code + merge tests) / ⚠️ PRESENT_BEHAVIOR_UNVERIFIED (live F5 in deployed browser) | actions.js hydrateNotifPrefs + 5 wiring sites; notif-hydration.test.mjs 5/5 — live-browser invariant routes to UAT Test 8 |

**Score:** 16/16 truths verified at presence/wiring/test level (1 with a live-browser behavior residual — see behavior_unverified_items)

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| SETTINGS-01 | notifPrefs → per-user rows, additive guarded migration, byte-identical reboot, doc stripped | ✓ SATISFIED | Truths 1, 5 (post-WR-02) |
| SETTINGS-02 | One accessor for all consumers; per-user isolation; PUT/GET + client branching; state survives reload (G-34-4 fix) | ✓ SATISFIED | Truths 2, 3 (post-WR-01), 11–16 |
| SETTINGS-03 | invoices stays out, write-path pin | ✓ SATISFIED | Truth 4 |
| SEARCH-01 | Substring leak closed; tokenized matching; tokenless fallback; normalization/collision table; CHANGELOG note | ✓ SATISFIED | Truths 6–10 (post-WR-03) |

All 4 requirement IDs accounted for; no orphans.

### Human Verification Required

One item remains (carried over unchanged from the prior report — renumbered Test 8 in `34-UAT.md`):

1. **UAT Test 8 — API-mode F5 notif-pref persistence (G-34-4 fix, live browser)** — rebuild/redeploy the client, then in API mode toggle a notification pref OFF and press F5. **Expected:** the pref stays OFF after reload. **Why human:** GET-on-workspace-open render ordering and bundle caching are observable only in a real browser; the merge semantics are node-test-pinned but the deployed-page invariant is not.

### Gaps Summary

None blocking. All three code-review fixes (WR-01/02/03) are verified in source and test-pinned with zero regressions across 169 tests in 6 suites. The phase remains `human_needed` solely for the live-browser UAT Test 8, carried over unchanged. Known pre-existing out-of-scope failure: `test/dependencies.test.mjs` Dockerfile-allowlist (predates these fixes; carried in deferred-items.md).

---

_Verified: 2026-11-03T18:05:00Z_
_Verifier: the agent (gsd-verifier)_
