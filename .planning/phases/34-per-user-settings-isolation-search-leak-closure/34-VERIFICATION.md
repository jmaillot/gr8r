---
phase: 34-per-user-settings-isolation-search-leak-closure
verified: 2026-11-04T00:00:00Z
status: passed
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
covered_digest: "v2:sha256:7ecfa81cb18e989e6e2fd684bc95b257ed48e01be3af96df9746910523ac5e56"
behavior_unverified_items:
  - truth: "In API mode, an unchecked notification pref stays unchecked after F5 reload (G-34-4 + G-34-6 fix, live browser)"
    test: "Re-run UAT Test 8 in 34-UAT.md: in API mode (rebuilt client), toggle a notification pref OFF, press F5 on /w/<slug>"
    expected: "The pref stays OFF after reload — the main.js boot routine awaits hydrateNotifPrefs after hydrateFromServer success, adopting the stored row before the first render"
    why_human: "The merge semantics and the boot-path wiring are test-pinned (notif-hydration.test.mjs, 9 tests) and grep-verified at src/main.js:338, but the live deployed page's render-before-fetch ordering and bundle caching can only be observed in a real browser session"
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 16/16
  gaps_closed: []
  gaps_remaining: []
  regressions: []
stale_re_verification:
  reason: "Phase 35 landed after the prior verification (2026-11-03T20:30:00Z): undo/mutex changes in src/core/store.js (commit 9f16914 — pushNow() bounded 5s wait loop) — the only covered file modified since. Refresh against CURRENT codebase."
  changed_since_prior: "git log since 2026-11-03T20:30Z on all covered source files → exactly one code commit, 9f16914, src/core/store.js only (+21/−5, pushNow() wait-loop bounding). Phase 35 WR-02/WR-03 fixes (4d5fab5, 8553ab6) touch actions.js undo handler, not the notifPrefs surface."
  prior_digest_note: "gsd_run not on PATH in this session; covered_digest recomputed manually (sha256 over per-file sha256 list, same file set as prior report). Prior value a4bee5df… was computed pre-9f16914 and is stale."
---

# Phase 34: Per-User Settings Isolation & Search Leak Closure — Verification Report

**Phase Goal:** Notification preferences stop living in the shared workspace document and become real per-user rows (`user_notif_prefs`, additive guarded migration, byte-identical second boot) with one accessor for every consumer; `invoices` pinned out; the substring recent-search leak closed by tokenized `referencesHidden`.
**Verified:** 2026-11-04T00:00:00Z
**Status:** passed (all code truths re-confirmed on the post-phase-35 code; no regressions from the undo/mutex changes; live-browser UAT Test 8 previously confirmed PASS by the user — 34-UAT.md complete, 8/8)
**Re-verification:** Yes — stale-verification refresh after phase 35

## Stale Re-Verification Scope

The prior report (2026-11-03T20:30:00Z, `passed`, 16/16) covered code that phase 35 has since partially modified. `git log --since` across every covered source file shows exactly **one** code commit touching them: **9f16914** — "fix(35): WR-01 bound pushNow() wait loop with 5s deadline" (`src/core/store.js`, +21/−5). The diff is confined to `pushNow()`'s in-flight-push wait loop (bounded 5s deadline, `ok:false` early return). It does **not** touch any Phase 34 surface in that file:

- `store.js:6,31–39` — D-01 blob sanitize (`delete blob.data.notifPrefs`) — unchanged
- `store.js:62` — `getLocalNotifPrefs(saved?.data?.ws?.url)` per-workspace local key — unchanged
- `store.js:118–123` — docSnapshot belt-and-braces strip — unchanged

The other phase 35 commits (616d92a, 519b25f, 4d5fab5, 8553ab6) touch the undo onAction handler / push mutex in `src/actions/actions.js`, which phase 34's truth 11 pins only for the single `IN.npToggle` branch — that branch and its "no doc write" property are untouched.

## Must-Haves Re-Confirmed on Current Code (16 truths from prior report)

| # | Truth | Status | Current Evidence (post-35 code) |
|---|-------|--------|--------------------------------|
| 1 | `notifPrefs` lives as per-user rows after a guarded backfill; second boot byte-identical; doc no longer carries the field | ✓ VERIFIED | `migrateUserNotifPrefs` server.js:1912 (invoked :1816); migration.test.mjs passes |
| 2 | Every consumer reads through one accessor `getUserNotifPrefs`; stale-client doc writes stripped; two users differ | ✓ VERIFIED | sole reader def server.js:1152, call sites :1225, :1373, :3193, :3234 |
| 3 | PUT keyed on SESSION user; GET defaults-merged; 17-key whitelist 400 + Boolean coercion; partial PUT merges (WR-01) | ✓ VERIFIED | routes server.js:3184 (GET), :3196 (PUT); notif-prefs.test.mjs 12/12 in suite |
| 4 | `invoices` never re-enters the doc write path — pinned | ✓ VERIFIED | migration.test.mjs pin passes |
| 5 | Corrupt doc blob never crashes boot; eligibility guard false forever; later joiners read defaults | ✓ VERIFIED | server.js:1923–1927 try/catch; pins pass |
| 6 | Full-token collision drops; substring-only collision survives; tokenless symbol-only hidden names drop via substring fallback (WR-03) | ✓ VERIFIED | redaction.js:31–49 (`tokenize` :17); 26-test table passes |
| 7 | NFC+toLowerCase both sides; Café ≠ cafe; NFC/NFD match identically | ✓ VERIFIED | redaction.js:15–24; table rows pass |
| 8 | Recent searches remain one workspace-wide list (D-15) | ✓ VERIFIED | D-15 source-assertion pin passes |
| 9 | Residual free-text limitation documented in CHANGELOG.md | ✓ VERIFIED | CHANGELOG.md:34–37, :133 |
| 10 | Backstops: non-string terms / hostile hidden lists never throw | ✓ VERIFIED | redaction backstop tests pass |
| 11 | Toggle persists through exactly one branch (PUT or localStorage), never a doc write | ✓ VERIFIED | actions.js single `IN.npToggle` branch — untouched by 35's undo handler changes |
| 12 | Settings page renders `S.notifPrefs`, not `d.notifPrefs`; seed carries none | ✓ VERIFIED | settings.js:167–169; seed.js 0 occurrences (grep -c = 0) |
| 13 | Legacy localStorage blob cannot resurrect doc notifPrefs | ✓ VERIFIED | store.js:39 blob strip + :118–123 docSnapshot strip — both intact post-9f16914; local-prefs pin passes |
| 14 | Local mode: per-workspace key, defaults, whitelist, survives reload | ✓ VERIFIED | notifPrefs.js (`NOTIF_PREFS_KEY_PREFIX` :7, `notifPrefsKey` :41, `getLocalNotifPrefs` :68); local-prefs tests pass |
| 15 | No-row reads defaults; two equal rows stay distinct | ✓ VERIFIED | accessor merge + composite PK; notif-prefs tests pass |
| 16 | API-mode workspace entry fetches the stored row via `api.getNotifPrefs` and adopts it into `S.notifPrefs` before the next render — including the `/w/<slug>` boot/F5 path (G-34-6); local mode issues no GET; 401 rides session-expired; other failures silent | ✓ VERIFIED (code + merge + sweep tests) / ⚠️ PRESENT_BEHAVIOR_UNVERIFIED (live F5) | import main.js:60, boot call main.js:338 (G-34-6 comment intact); `export hydrateNotifPrefs` actions.js:3209 + 5 wiring sites (:3227, :3287, :3309, :3500, :3562); notif-hydration.test.mjs 9/9 in suite — live-browser invariant carried by UAT Test 8 (user-confirmed PASS 2026-11-03) |

**Score:** 16/16 truths verified (1 with a live-browser behavior residual — carried over, see behavior_unverified_items)

## Regression Check (full suite, single run)

| Suite | Result | Status |
|-------|--------|--------|
| Full suite `npm test` | 899 tests: **896 pass / 0 fail / 3 skip** (matches baseline) | ✓ PASS |

The 3 skips are the pre-existing ones (out of scope per prior UAT disposition). Note: the previously failing `test/dependencies.test.mjs` Dockerfile-allowlist pin is now passing — the repo-root listing concern was resolved; zero failures in this run.

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full suite (incl. notif-hydration 9, redaction 26, migration 37, notif-prefs 12, local-prefs, scope) | `npm test` | 896/0/3 skip | ✓ PASS |
| No debt markers in any covered source file | `grep -nE "TBD\|FIXME\|XXX" <12 source files>` | no matches (exit 1) | ✓ PASS |

Step 7c (probes): no phase-declared or conventional probes exist for this phase — SKIPPED.

## Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| SETTINGS-01 | notifPrefs → per-user rows, additive guarded migration, byte-identical reboot, doc stripped | ✓ SATISFIED | Truths 1, 5 |
| SETTINGS-02 | One accessor for all consumers; per-user isolation; PUT/GET + client branching; state survives reload (G-34-4 + G-34-6) | ✓ SATISFIED | Truths 2, 3, 11–16 |
| SETTINGS-03 | invoices stays out, write-path pin | ✓ SATISFIED | Truth 4 |
| SEARCH-01 | Substring leak closed; tokenized matching; tokenless fallback; normalization/collision table; CHANGELOG note | ✓ SATISFIED | Truths 6–10 |

All 4 requirement IDs accounted for; no orphans.

## Anti-Patterns Found

None. No TBD/FIXME/XXX markers, no stubs, no orphaned artifacts in the covered set.

## Human Verification Required

One carried-over item — UAT Test 8 was already confirmed PASS by the user on the rebuilt deployment (34-UAT.md complete, 8/8, recorded 2026-11-03). It remains listed as the live-browser behavior residual for truth 16; no new human item arises from phase 35's changes (store.js WR-01 does not touch the notif-prefs boot path, and the full suite including all phase 34 pins passes).

## Gaps Summary

None. The single covered-file change since the prior verification (`9f16914`, store.js `pushNow()` 5s deadline) is orthogonal to every phase 34 must-have; all 16 truths re-confirmed in source on the current HEAD (8e8526d), and the full test suite passes at baseline with zero failures. Phase goal still holds.

---

_Verified: 2026-11-04T00:00:00Z_
_Verifier: the agent (gsd-verifier)_
