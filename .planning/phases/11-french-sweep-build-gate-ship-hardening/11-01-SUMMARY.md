---
phase: 11-french-sweep-build-gate-ship-hardening
plan: 01
subsystem: e2e-i18n-proof
tags: [i18n, playwright, leak-sweep, uat-10]
requires: [phase-7 french-overflow spec, phase-10 createAccount helper, src/locales/en.json]
provides: [21-route French leak sweep (UAT-10 criterion 1)]
affects: [e2e/french-overflow.spec.mjs]
tech-stack:
  added: []
  patterns: [catalogue-driven fmt() assertions, TreeWalker whole-tree DOM scan, pinned route-list data]
key-files:
  created: []
  modified:
    - e2e/french-overflow.spec.mjs
decisions:
  - member/team detail routes reached via the UI's own navigation (row/sidebar click) after the boot deep-link proved unreliable for team ids
  - stop-list entries are identical-across-locales catalogue values plus TEAMS_SEED stored seed names (PROJECT.md D-15)
metrics:
  duration: ~15 min
  completed: 2026-10-24
status: complete
actuals:
  tokens: 40600
  tasks: 2
  commits: 1
commits: 1
plan_head_before: e6485ed6dba8ec112e7e5ddeeebbd5efa935b60e
plan_head_after: f31b84f
---

# Phase 11 Plan 01: 21-route French Leak Sweep Summary

**One-liner:** The 16-route overflow spec now carries a 21-route French sweep — every route first proves a catalogue-driven French marker, then proves zero English-catalogue-value leaks across text nodes, `aria-label`, `data-tip` and `document.title`, hidden nodes included.

## What Was Built

Extended `e2e/french-overflow.spec.mjs` (D-01) with a new PHASE 11 sweep family after the untouched phase-7 tests:

- **Pinned route list (D-03/D-04):** `SWEEP_ROUTES` — the 16 overflow routes plus `member`, `team`, `project`, `join`, `auth` — asserted `toHaveLength(21)` in its own test (route 22 without updating the list fails loudly) and again in the sweep test.
- **Fixture path (D-06):** sweep account created via `createAccount(BASE_URL, run, 'sweep', 'Sweep Reader', { locale: 'fr', workspace })`; one project + one task seeded through the document API (`PUT /api/workspaces/:slug`); a real invite token created through the API invite flow for `/join`.
- **French marker precondition (D-03):** `frenchMarker()` asserts `document.documentElement.lang === 'fr'` plus a per-route marker read from the catalogue via `fmt()` — for workspace routes the catalogue-driven `document.title` (route name / project board tab / entity name), for `/join` the `page.auth.joinTitle` heading, for the auth page the `page.auth.welcomeBack` heading. The two anonymous surfaces use a `locale: 'fr-FR'` context (10-02 exception).
- **Leak scan (D-02/D-05):** one `page.evaluate` walking `document.body` with a `TreeWalker` that has no visibility filter, collecting non-whitespace text nodes, every element's `aria-label` and `data-tip`, and `document.title`. A hit is an exact equality (both sides NFC-normalized, trimmed, inner whitespace collapsed) against the English leaf-value Set built at test time from `import en from '../src/locales/en.json' with { type: 'json' }`, minus the commented stop-list.
- **Stop-list (Task 2):** small, commented, visible — every entry names its legitimacy reason.

## Deviations from Plan

**1. [Rule 1 - Bug] Sweep fixtures read the apiClient envelope, not the payload**
- **Found during:** Task 1
- **Issue:** `apiClient` returns `{ status, data }`; the first fixture draft read `docRes.doc`/`docRes.revision` directly (the flows spec reaches the payload through its `must()` wrapper) and crashed.
- **Fix:** read `docRes.data.doc`, `docRes.data.revision`, `docRes.data.memberId`, `invite.data.invites[0].url`.
- **Files modified:** e2e/french-overflow.spec.mjs
- **Commit:** f31b84f

**2. [Rule 1 - Bug] The plain-route loop also visited param-dependent routes id-less**
- **Found during:** Task 1
- **Issue:** the loop's `goto /w/slug/member` (no id) rendered the "Membre" fallback and tripped the member marker.
- **Fix:** `member`/`team`/`project` excluded from the plain loop and swept below with real ids/UI navigation.
- **Commit:** f31b84f

**3. [Implementation choice] member/team reached via UI navigation** — the boot deep-link loses the team id (`applyDeepLink` has no keyed team branch), so both detail routes are reached the way the UI reaches them: click the members-table row / sidebar team item. Documented in-code.

**Task 2 commit note:** the stop-list disposition landed inside commit f31b84f — the tracer feedback gate ran after the stop-list was complete, so Task 2 required no further changes (no real leaks found; every hit was legitimate English, stop-listed with a comment).

## Stop-list (all with adjacent comments in the spec)

`Gr8r` / `Gr8r Studio` (brand, identical everywhere), `Notifications`, `Mentions`, `Backlog`, `Table`, `Admin` (identical French/English catalogue values — verified against fr.json), `Design`/`Engineering`/`Marketing`/`Product` (TEAMS_SEED stored workspace data, English per PROJECT.md D-15), `Permissions`/`Sessions`/`Accent`/`Compact`/`Indigo`/`Violet`/`Rose`/`Graphite` (identical-across-locales settings vocabulary and colour names).

## Verification

- `npm run build && npm run e2e -- e2e/french-overflow.spec.mjs` — **10 passed** (8 pre-existing phase-7 tests untouched and green + the 21-route pin + the sweep).
- `node --test test/catalogue.test.mjs` — 0 failures (100% en↔fr parity untouched; no locale files modified).
- Zero leak hits across all 21 routes; every route proved its French marker before the scan.

## Known Stubs

None.

## Self-Check: PASSED

- e2e/french-overflow.spec.mjs exists and contains the sweep (verified by the green 10-test run).
- Commit f31b84f exists (`feat(11-01): 21-route French leak sweep…`).
