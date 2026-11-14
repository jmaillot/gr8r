---
phase: 61-notification-trim
plan: 01
subsystem: notifications
tags: [notif-prefs, d-04, dead-key-removal, whitelist, audit-doc]
requires: [Phase 34 user_notif_prefs, Phase 37 push_due precedent, Phase 38 invariants]
provides: [13-key notif pref whitelist on both tiers, PUT 400 for removed keys, legacy-row read absorption]
affects: [61-02 (no dependency), Settings toggles (untouched), digest/push fan-outs (untouched)]
tech-stack:
  added: []
  patterns: [whitelist-parity-commit (server↔client same commit), failing-first tracer, read-side absorption]
key-files:
  created: []
  modified:
    - server.js
    - src/core/notifPrefs.js
    - test/notif-prefs.test.mjs
    - test/local-prefs.test.mjs
    - test/migration.test.mjs
    - test/notif-hydration.test.mjs
    - docs/notification-audit.md
decisions:
  - "D-04 applied verbatim: 4 dead keys removed from both whitelists + the assign_self default; PUT 400 unknownPrefKey is the only migration; read filters absorb legacy rows"
  - "Owning comments rewritten WITHOUT the literal removed key names — the plan's verify grep (fails_when) forbids any match in server.js/notifPrefs.js, comments included; the doc carries the names instead"
metrics:
  duration: ~15 min
  completed: 2026-11-13T21:31:51Z
status: complete
actuals:
  tokens: 32000
  tasks: 2
  commits: 2
commits: 2
plan_head_before: d750d93
plan_head_after: 4436332a2de6f1b1f1da5749f0aa82e29b08b61c
---

# Phase 61 Plan 01: D-04 dead-key removal + standing gates Summary

D-04 applied end-to-end in one parity commit: the 4 dead pref keys are gone from both whitelists and the default layer, PUT rejects them 400 unknownPrefKey, legacy rows are absorbed at read — all pinned by failing-first tests, with fresh audit-doc citations.

## What Was Built

**Task 1 (tracer, commit d950f5a):** RED-first — new tests failed while the keys were still whitelisted (5 failing: per-key PUT-400 case, legacy-row filter case, and the 3 defaults-pinned suites). GREEN — removed `mention_ws` / `assign_self` / `assign_status` / `assign_over` from `NOTIF_PREF_KEYS` (17→13) and `assign_self: true` from `NOTIF_PREF_DEFAULTS` (12→11) in BOTH `server.js` (:1585-1599 keys, :1624-1636 defaults) and `src/core/notifPrefs.js` (:41-45 keys, :23-35 defaults). `getStoredNotifPrefs` and `sanitize` untouched (they iterate the whitelist — read-side absorption). Owning comment blocks rewritten per the push_due narrative convention. Parity preserved in the same commit.

**Task 2 (commit 4436332):** audit doc citations re-anchored to current line numbers (defaults cells, PUSH_NOTIF_KIND 1780-1785, email gate 1917, key-list ranges), the 4 dead-key rows marked **appliquée (retirée 2026-11-13)**, §Changement 3 rewritten (keys no longer whitelisted). Standing gates: `npm test` 1518/1518 green (Phase 38 invariant files unmodified in the diff), i18n-scan 0/0, chunk gate 11/11 — the proven Phase 60 chain.

## Deviations from Plan

**1. [Rule 3 - Blocking test pins] Three test files beyond the plan's `files_modified` pinned the old whitelist/defaults shape.**
- **Found during:** Task 1 GREEN run / Task 2 full suite
- **Issue:** `test/local-prefs.test.mjs` pinned 17 keys / 12 defaults; `test/migration.test.mjs` EXPECTED_DEFAULTS carried `assign_self: true`; `test/notif-hydration.test.mjs` pinned 12-key merges — all fail once the lists shrink.
- **Fix:** updated the pins (17→13, 12→11, EXPECTED_DEFAULTS minus assign_self) + a client-side removed-key rejection loop. The notif-hydration pins were caught by the full-suite gate and amended into the Task 1 commit (parity rule: all shapes change together).
- **Files modified:** test/local-prefs.test.mjs, test/migration.test.mjs, test/notif-hydration.test.mjs
- **Commit:** d950f5a (amended)

**2. [Rule 1 - Comment constraint] The rewritten owning comments initially named the removed keys; the plan's verify `fails_when` forbids ANY grep match in server.js/notifPrefs.js (comments included).**
- **Fix:** comments now reference "the 4 dead keys" + point to docs/notification-audit.md for the per-key rulings. Verified: grep clean on both files.

## Auth Gates

None.

## Known Stubs

None — no stub patterns in any touched file.

## Deferred Issues

- **[pre-existing, out of scope] 2 lint errors in Phase 60 files** (commit 290bb36, not this plan's diff): `src/pages/dashboard.js:36` `lastRequestedWindow` unused; `test/dashboard-client.test.mjs:17` `fileURLToPath` unused. Logged in `deferred-items.md`; belongs to a Phase 60 follow-up. (Recorded in WINDOWS ledger.)

## Threat Model Compliance

- T-61-01 (Tampering, PUT whitelist): mitigated — the shrinking whitelist now 400s each removed key, pinned per-key by the new test; whitelist-only coercion unchanged.
- T-61-SC (supply chain): trivially satisfied — zero packages installed.
- No new trust-boundary surface introduced.

## Self-Check: PASSED

- server.js / src/core/notifPrefs.js / test/notif-prefs.test.mjs / docs/notification-audit.md — FOUND
- Commits d950f5a, 4436332 — FOUND (git log)
- `node --test test/notif-prefs.test.mjs` — 15/15 green; `npm test` — 1518 pass / 0 fail; i18n 0/0; chunk gate 11/11
- grep of the 4 key names across server.js + src/ — 0 matches
