---
phase: 60-admin-dashboard-member-self-view
plan: 02
subsystem: client-ui
tags: [dashboard, lazy-page, polling, settings, self-view, e2e]
requires: [GET /api/workspaces/:slug/dashboard, GET /api/workspaces/:slug/me/visibility (60-01), fillPage skeleton-then-fill, members.js visReason vocabulary, call() signal passthrough]
provides: [/w/:slug/dashboard route (admin four-panel page, 30 s poll), ROUTE_TEARDOWN registry, api.dashboard/api.myVisibility seams, Settings › my-access section, visReasonLabel shared helper, e2e/dashboard.spec.mjs]
affects: [verify-phase (UI-SPEC backstop), future route pages with polling]
tech-stack:
  added: []
  patterns: [in-render fetch kick + monotonic fill seq (fillPage posture), per-route teardown registry in render.js, server-payload-only rendering (no client date math)]
key-files:
  created: [src/pages/dashboard.js, e2e/dashboard.spec.mjs]
  modified: [src/shell/render.js, src/shell/layout.js, src/core/api.js, src/pages/settings.js, src/pages/members.js, src/actions/actions.js, src/locales/en.json, src/locales/fr.json, test/i18n-shell.test.mjs, test/i18n-toast.test.mjs, test/i18n-core-features.test.mjs, test/fixtures/icons-baseline.json]
decisions:
  - "Task 2 (poll lifecycle) landed inside the Task 1 tracer commit — one vertical slice; Task 2 verified with no additional diff"
  - "Route-exit cleanup via a new ROUTE_TEARDOWN registry in render.js (go() calls it when leaving) — the page keeps its teardown in its own chunk, no entry-chunk import of the page"
  - "api seams derive the slug from state.workspace (memberVisibility house style), not a slug param — plan signature adjusted to match"
  - "Dashboard reuses existing catalogue keys for panel titles (page.filter.overdue / page.home.tab.upcoming / page.home.recentActivity); only genuinely new strings catalogued"
  - "e2e badge expectation corrected to 'Everyone' — a members:[id] public project resolves reason 'everyone' per the Phase 52 funnel, not 'member'"
metrics:
  duration: ~75 min
  completed: 2026-11-13
  tasks: 3
actuals:
  tokens: 118000
  tasks: 3
  commits: 2
commits: 2
plan_head_before: cda0b8217cbf1ed3b9ca42fcccc9a837992ca885
plan_head_after: 5bee14c24be9ab25ba53ce46ba4bfab60233ddee
status: complete
---

# Phase 60 Plan 02: Dashboard Client Surface + Settings My Access Summary

**One-liner:** The admin-only `/w/:slug/dashboard` lazy page (four panels rendered verbatim from the 60-01 aggregate, skeleton-then-fill, 30 s poll with abort + route-exit teardown, deep-linking rows, 24h/7d/30d activity selector) plus the Settings › My access self-view section reusing the Phase 52 reason vocabulary, proven by a Chromium e2e that walks the per-role story end-to-end.

## What Was Built

- **`src/pages/dashboard.js`** (NEW, lazy): four panels on one screen, no tabs — Overdue grouped per project (group headers deep-link to the project, task rows ride the existing `openTask` drawer via a key→id resolution), Load per member as server-sorted stat rows, Upcoming flat rows with verbatim dates, Recent activity via the shared `actHtml` renderer with a 24h/7d/30d preset selector that refetches with the whitelisted param. Renders ONLY from the endpoint response (T-60-05) — zero calls to `visibleProjects()`/`allTasks()`, zero client date math. The server's 403 surfaces as the keyed `err.adminOnly` state (D-52-4); other failures get the retryable error state (`dashRetry`).
- **Poll lifecycle (D-05):** one `setInterval(…, 30000)` (matching the notification poll), every refresh aborting the prior in-flight read through `call()`'s signal passthrough; skeletons are first-visit only. Route exit tears down via the new `ROUTE_TEARDOWN` registry in `render.js` (`go()` invokes the leaving route's cleanup — no entry-chunk import of the page).
- **Route/nav wiring:** `'dashboard'` in `ROUTE_IDS` (+`gauge` icon), `P.dashboard` lazy entry in `layout.js`, sidebar item wrapped in `isMemberAdmin()` — UX gate only; the server 403 stays the control. `urlForView`'s catch-all addresses `/w/:slug/dashboard` automatically.
- **Settings › My access:** `my-access` in the personal nav group, no role gate (TRN-01); flat `{id, name, reason[, teamName]}` rows copied from the members expander markup, labels through the new shared `visReasonLabel`/`VIS_REASON_KNOWN` export (one vocabulary, two consumers — D-12/D-14). Server-read on section render with loading/empty/error states; no new reason keys.
- **`e2e/dashboard.spec.mjs`** (NEW): admin sees the Dashboard nav entry + four panels, an overdue row opens the drawer at `/w/:slug/task/DASH-101`; a member typing the dashboard URL gets the surfaced 403 (and no sidebar entry); the member's My access renders their reachable public project with the `Everyone` reason badge.
- **i18n:** 21 new EN+FR keys (nav.route.dashboard, page.dashboard.*, settings.myAccess.*); panel titles reuse existing keys.

## Verification

- `npm run build && node --test test/build-chunk-size.test.mjs test/i18n-pages.test.mjs test/i18n-shell.test.mjs` — green (index chunk 499.84 kB under the 500 kB gate; dashboard stays out of the entry chunk)
- `npm test` — 1522 tests, **1510 pass / 0 fail**
- `npm run lint` — clean; `node scripts/i18n-scan.mjs` — 0 dead / 0 stale
- `npm run e2e` — **112 passed / 0 failed** (full suite including the new spec; one intermittent saved-views throttle flake seen in two runs passed in the final full run and in isolation)

## Deviations from Plan

**1. [Rule 3 — blocking pins] Standing i18n/icon/API pins updated to follow the new surface.**
- **Found during:** Tasks 1 & 3 (`npm test` / build)
- **Issue:** Byte-identical pins predate the plan: ROUTE_IDS list (i18n-shell), tree-wide data-a/data-r/data-v counts (i18n-shell + i18n-toast), catalogue size 1867 (i18n-core-features), call-site count 47, icon baseline 173 (icons-baseline.json + build-locales), and the FR typography rule rejected a plain space before `;`.
- **Fix:** All pins bumped with annotated deltas (route 21, data-a 498→504, data-r 58→61, data-v 80→81, catalogue 1867→1888, verbs 47→49, baseline +gauge); FR `settings.myAccess.local` reworded without the punctuation.
- **Files:** test/i18n-shell.test.mjs, test/i18n-toast.test.mjs, test/i18n-core-features.test.mjs, test/build-locales.test.mjs (via fixture), test/fixtures/icons-baseline.json, src/locales/fr.json
- **Commits:** e3e642c, 5bee14c

**2. [Scope note] `src/actions/actions.js` modified (not in `files_modified`)** — `A.dashRetry` action for the dashboard error state's retry button. Minimal seam, in keeping with the A[] handler convention.
- **Commit:** e3e642c

**3. [Task merge] Task 2 (poll lifecycle) has no diff of its own** — the interval/abort/teardown cycle was implemented inside the Task 1 tracer slice (single vertical path); Task 2's acceptance criteria were verified against that code and the chunk gate re-run green. No separate empty commit was created.

**4. [Assumption A4 confirmed]** `call()` accepts `{ signal }` (Phase 58) — used as-is, no passthrough seam needed.

## Known Stubs

None — every panel, section state and e2e assertion is wired to the live endpoints.

## Threat Flags

None — no security surface beyond the plan's threat model. T-60-04 mitigated (server 403 surfaced, e2e asserts the blocked member); T-60-05 mitigated (payload-only rendering, acceptance-grepped); T-60-SC honored (zero new packages).

## Self-Check: PASSED

- src/pages/dashboard.js, e2e/dashboard.spec.mjs: FOUND
- Commits e3e642c, 5bee14c: FOUND in git log
- .planning ledger `gsd-plan-head-before-60-02`: FOUND, rev-list count = 2
