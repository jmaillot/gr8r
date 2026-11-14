---
phase: 61-notification-trim
plan: 02
subsystem: notifications
tags: [inbox-burst, notif-03, d-10, d-11, d-13, render-only, i18n]
requires: [Phase 38 invariants, Phase 56 chunk gate, Phase 60 gate chain, inbox.js render pipeline]
provides: [groupBursts pure transform (src/core/inboxBursts.js, re-exported from inbox.js), D-13 burst summary row, S.ui.inboxBurstOpen transient Set, toggleBurst/burstRead actions, notif.burst.* EN+FR CLDR plural keys, lazy notifications/archive routes]
affects: [notifications page (untouched, D-12), server.js (untouched, D-10), push/email fan-outs (untouched)]
tech-stack:
  added: []
  patterns: [render-only coalescing (D-10), key-based grouping over time-sorted list, lazy-route chunk-gate remedy (57-03 precedent), pin-narration updates]
key-files:
  created:
    - src/core/inboxBursts.js
    - test/inbox-burst.test.mjs
  modified:
    - src/pages/inbox.js
    - src/actions/actions.js
    - src/locales/en.json
    - src/locales/fr.json
    - src/shell/layout.js
    - src/main.js
    - vite.config.js
    - test/i18n-toast.test.mjs
    - test/i18n-shell.test.mjs
    - test/i18n-core-features.test.mjs
decisions:
  - "Grouping is key-based over the whole unread list, not adjacency — D-11 says «no time window», so interleaved rows of other tasks/types or read siblings do not split a group; summary sits at the newest member's position"
  - "groupBursts/burstUnreadIds live in src/core/inboxBursts.js (zero imports) and are re-exported from inbox.js — importing them from actions.js would couple the page module into the entry chunk (Phase 56)"
  - "Entry-chunk gate remedy follows the 57-03 precedent (lazy export-model chunk): notifications + archive routes move to the existing lazy() loader — never bumping the 500 kB constant; manualChunks was tried and REVERTED (it hoisted the EN catalogue out of the entry, breaking the build-locales invariant)"
  - "Group mark-read (delegated discretion): burstRead fans read=true to every unread row matching the group key, inlined in actions.js to avoid pulling the core module into the entry chunk; the pure helper stays unit-pinned"
metrics:
  duration: ~67 min (≈35 min of it e2e + baseline-proof runs)
  completed: 2026-11-13T22:41:03Z
status: complete
actuals:
  tokens: 3600
  tasks: 2
  commits: 2
commits: 2
plan_head_before: a4da53d52cd24e7f3bb49685033e3cd9c6761582
plan_head_after: c738f270825808b8ef22cc2c4c64b02c0226dd1c
---

# Phase 61 Plan 02: Render-only inbox burst coalescing (NOTIF-03) Summary

Unread inbox rows sharing task + type coalesce into one esc()'d summary row — count-by-type + task key + title per D-13, EN+FR CLDR plurals — clickable to the task drawer, expandable to the unchanged per-member rows, with group mark-read; server untouched (D-10), Phase 38 invariants and the full gate chain green.

## What Was Built

**Task 1 (tracer, commit ef666cd):** RED-first — `test/inbox-burst.test.mjs` failed before the transform existed (6 cases: coalescing, read-standalone, no cross-task/type, lone-row passthrough, openSet flattening, mark-read fan-out). GREEN — `groupBursts(ns, openSet)` + `burstUnreadIds(ns, gk)` as pure exports in `src/core/inboxBursts.js`, re-exported from `src/pages/inbox.js`; wired into `pageInbox` AFTER the category/unread filters and BEFORE the `inboxItem` map — tab-badge counts stay computed from the raw filtered list (Pitfall 2). `burstRow(g)` renders the D-13 summary: `t('notif.burst.<type>', {n})` plural label + esc()'d task key + esc()'d title + `notifIcon(newest)` + `ago(newest.at)`; primary click `data-a="openTask" data-id="${task}"` (never `inboxSel`, Pitfall 3); never renders a member's `notifText()` (Pitfall 4). Chevron `data-a="toggleBurst"` + `data-a="burstRead"` buttons; `A.toggleBurst`/`A.burstRead` added to actions.js. `notif.burst.*` keys (CLDR `{one, other}` objects) + expand/collapse tips in EN+FR, same commit. The original test import failed on `virtual:icons` — resolved via the existing suite hook `test/helpers/virtual-icons-loader.mjs` (already tracked; an accidental overwrite was reverted).

**Task 2 (commit c738f27):** expansion interaction + group mark-read were built into the Task 1 slice (openSet flattening renders members via `inboxItem` unchanged, legacy prose branch :51-56 preserved; per-row toggleRead works inside expanded groups); Task 2 delivered the standing-pin updates and the full gate chain (below).

## Deviations from Plan

**1. [Rule 3 — Blocking gate conflict] The plan's chunk premise was false: `inbox.js` is NOT a separate page-scoped chunk — it is entry-resident via main.js's static import.** The burst code + EN keys (~2.6 kB minified) cannot fit the entry chunk's 218-byte headroom under the standing 500 kB DELIV-02 gate (`test/build-chunk-size.test.mjs`, `fails_when` in the plan). Remedies tried:
- `manualChunks` (object + function form): REVERTED — rollup hoisted `i18n.js` + the EN catalogue into the inbox chunk, breaking the standing build-locales invariant («the English catalogue is inlined in the entry chunk», 4 test failures).
- `json: { stringify: true }`: measured, made the entry LARGER, reverted (never committed).
- **Final remedy (commit c738f27):** the repo's own precedent — 57-03 «lazy export-model chunk (chunk-gate remedy)» — applied to the two low-frequency entry-resident routes: `notifications` + `archive` now resolve through the existing `lazy()` loader in `shell/layout.js` (skeleton + fillPage swap on first visit, sync `f.mod` re-renders thereafter); their now-side-effect-free static imports dropped from `main.js` (rollup tree-shakes them anyway). First-paint routes (home/inbox/etc.) untouched. Entry index: 498.17 kB (< 500 kB), EN marker verified in the entry chunk.

**2. [Rule 3 — Blocking test pins] Three standing pins moved, updated per the repo's narration convention:**
- `data-a` sites 504 → 507 in `test/i18n-toast.test.mjs` AND `test/i18n-shell.test.mjs` (+3: the summary's openTask deep-link, burstRead, toggleBurst).
- Catalogue size 1888 → 1898 in `test/i18n-core-features.test.mjs` (+9 notif.burst.* keys).

**3. [Rule 3 — Linter constraint] The catalogue linter rejects underscores in key names** (`notif.burst.due_reminder` → «key is not flat, dotted and namespaced»): renamed to `notif.burst.dueReminder`/`notif.burst.pastDue` with a type→key map in `burstRow`.

**4. [Rule 3 — Missing wiring] `A.toggleBurst`/`A.burstRead` handlers live in `src/actions/actions.js`** (not in the plan's `files_modified`) — `data-a` dispatch requires the A registry; actions.js was otherwise untouched in this phase.

**5. [Rule 1 — Semantics fix caught by the failing test] Case (c) initially failed:** the skeleton's adjacency-based grouping split same-task/type unread rows separated by interleaved rows. D-11 says «no time window», so grouping is key-based over the whole list (Map by `task|type` among unread), summary at the newest member's position.

## Auth Gates

None.

## Known Stubs

None — no stub patterns in any touched file.

## Deferred Issues

- **[pre-existing, verified at baseline] e2e VIEW-02 full-suite flake:** `e2e/saved-views.spec.mjs:125` intermittently hits a strict-mode violation (two identical "View saved" toasts) under full-suite load — reproduced identically in a pre-plan baseline worktree run (a4da53d: VIEW-02 + operator-revoke both failed there; 110 passed). My runs: 111 passed + VIEW-02 flake. Passes reliably in isolation. Out of scope; belongs to a Phase 60/57 follow-up like the lint baseline.

## Threat Model Compliance

- T-61-02 (Tampering, burst summary markup): mitigated — `esc()` on every interpolated task key and title in the summary line; the summary never renders `notifText()` of a member (legacy stored prose).
- T-61-SC (supply chain): trivially satisfied — zero packages installed.
- No new trust-boundary surface: render-only transform (D-10), zero `server.js` diff (verified: not in the plan's commit list), zero settings/pref changes (D-12).

## Verification Record

- `node --test test/inbox-burst.test.mjs` — 6/6 green (was RED before the transform existed)
- `npm test` — 1524 pass / 0 fail (Phase 38 invariant suites digest/due-reminders/notif-hydration pass unmodified; `git diff` shows zero Phase 38 test-file changes)
- `npm run lint` — exactly the 2 pre-existing Phase 60 baseline errors (dashboard.js:36, dashboard-client.test.mjs:17), zero new
- `node scripts/i18n-scan.mjs` — 0 literals / 0 pending
- `node --test test/build-chunk-size.test.mjs` — 11/11 (entry index 498.17 kB < 500 kB)
- `npm run e2e` — 111 passed + the VIEW-02 flake documented above; server.js/settings.js untouched by this plan

## Self-Check: PASSED

- src/core/inboxBursts.js, test/inbox-burst.test.mjs — FOUND
- Commits ef666cd, c738f27 — FOUND (git log)
- Gates re-run at HEAD: burst 6/6, chunk 11/11, i18n 0/0
