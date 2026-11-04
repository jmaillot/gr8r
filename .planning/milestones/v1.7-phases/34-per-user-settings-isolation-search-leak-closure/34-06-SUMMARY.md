---
phase: 34-per-user-settings-isolation-search-leak-closure
plan: 06
subsystem: notif-prefs
tags: [gap-closure, G-34-6, api-mode, hydration, boot-path, tdd]
requires: [hydrateNotifPrefs (src/actions/actions.js:3209, from 34-05), hydrateFromServer success path (src/main.js:328)]
provides: [hydrateNotifPrefs exported for the main.js boot path, regression pin covering every hydrateFromServer success site across actions.js and main.js]
affects: [F5 reload on /w/<slug> now issues GET /api/me/notif-prefs and adopts the stored row before the first render]
tech-stack:
  added: []
  patterns: [static call-graph pin (read source as text, sweep hydrateFromServer sites for adjacent hydrateNotifPrefs)]
key-files:
  created: []
  modified: [src/actions/actions.js, src/main.js, test/notif-hydration.test.mjs]
decisions:
  - "Export hydrateNotifPrefs in place (no move to src/core/notifPrefs.js) — actions.js already holds api/S imports and the 5 call sites"
  - "Hydrate only on the boot success path (else-branch after seedLegacyLocale); 401/!ok branches unchanged so a failed workspace load adds no second doomed API call"
  - "Regression pin is a static sweep of every hydrateFromServer site (pollNotifs stripped before the sweep and pinned separately), so a future 7th call site is caught by the test, not UAT"
metrics:
  duration: ~10min
  completed: 2026-11-03
status: complete
plan_head_before: 1b643cb
plan_head_after: fe2de1c
commits: 2
actuals:
  tokens: 800
  tasks: 2
  commits: 2
---

# Phase 34 Plan 06: Boot-path notif-prefs hydration (G-34-6) Summary

**One-liner:** Closed the F5-reload gap — the /w/<slug> boot routine in main.js now awaits hydrateNotifPrefs after hydrateFromServer succeeds, so an unchecked pref stays unchecked after reload in API mode, pinned by a static sweep test.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | RED: static wiring pin (4 tests f–i) | ac01ed2 | test/notif-hydration.test.mjs |
| 2 | GREEN: export hydrateNotifPrefs + wire main.js boot path | fe2de1c | src/actions/actions.js, src/main.js |

(Note: executed test-first per the plan's Task 2 ordering note — the pin was written and confirmed RED before the wiring landed.)

## What Was Built

- **src/actions/actions.js**: `async function hydrateNotifPrefs()` → `export async function hydrateNotifPrefs()`. Nothing else changed — the `api.enabled` guard (D-08: local mode issues no GET), the 401 → `projects:save-error` path, and the canonical merge adoption are exactly as shipped in 34-05.
- **src/main.js**: added `hydrateNotifPrefs` to the existing named import from `./actions/actions.js`; the boot routine's success branch became `else { await seedLegacyLocale(); await hydrateNotifPrefs(); }` with a one-line G-34-6 comment. The 401 branch still returns early; `!ws.ok` still toasts without hydrating. **pollNotifs (~line 80) untouched** — no 30s prefs GET; prefs changes arrive via the settings PUT adoption.
- **test/notif-hydration.test.mjs**: 4 new pins extending (not rewriting) the 5 merge pins from 34-05:
  - (f) actions.js exports `hydrateNotifPrefs`;
  - (g) main.js imports it from `./actions/actions.js`;
  - (h) static sweep — every `hydrateFromServer(` call site in actions.js AND main.js has a `hydrateNotifPrefs(` call within 12 lines, with precise failure messages naming the missed `file:line`; the pollNotifs region is stripped before the sweep since it is the one intentional exception;
  - (i) pollNotifs does NOT reference hydrateNotifPrefs.

## TDD Gate Compliance

- RED confirmed before implementation: `node --test test/notif-hydration.test.mjs` failed at commit ac01ed2 with `missed hydration site(s): src/main.js:328` (the boot path) — the exact gap G-34-6 reports. Actions.js sites and pollNotifs (excluded) behaved as expected.
- GREEN: `fix` commit fe2de1c flips pin (h) and the full file passes.

## Verification

- `node --test test/notif-hydration.test.mjs test/local-prefs.test.mjs test/notif-prefs.test.mjs` — 28 pass / 0 fail.
- Grep gate: comment-filtered `hydrateNotifPrefs` occurrences in src/main.js = 2 (import + call), matching the plan's ≥2 done criterion.
- Full suite `npm test`: **889 tests / 886 pass / 3 skip / 0 fail** — baseline 885 + the 4 new pins, zero failures (the pre-existing Dockerfile-allowlist failure noted in 34-05 was resolved in bd72533).

## Deviations from Plan

None — plan executed as written (test-first ordering absorbed as designed).

## Deferred Issues

None new.

## Known Stubs

None.

## Self-Check: PASSED

- Files exist: src/actions/actions.js, src/main.js, test/notif-hydration.test.mjs — FOUND
- Commits exist: ac01ed2, fe2de1c — FOUND (`git log`)
- `git rev-list --count 1b643cb..HEAD` = 2, matches `commits: 2`
