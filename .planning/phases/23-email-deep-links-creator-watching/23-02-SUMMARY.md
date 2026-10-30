---
phase: 23-email-deep-links-creator-watching
plan: 02
subsystem: auth-shell
tags: [deep-links, auth, next-carry, open-redirect, e2e]
requires:
  - "23-01: urlForView seam + deep-link drawer landing (applyDeepLink in src/main.js)"
  - "finishLogin ?next= validator in src/actions/actions.js (from phase 12)"
  - "server.js file-route 302 /login?next= (T-12-13)"
provides:
  - "Logged-out boot branch rewrites deep links to /login?next=<pathname> before render"
  - "test/next-carry.test.mjs — both carry sites + validator rule pinned against drift"
  - "Logged-out → sign-in → exact-task-return e2e scenario (EN+FR)"
affects: ["23-04 (pushState/popstate)"]
tech-stack:
  added: []
  patterns:
    - "history.replaceState before render — query param survives later paints"
    - "static source-extraction test pattern (house style from test/error-codes.test.mjs)"
key-files:
  created:
    - test/next-carry.test.mjs
  modified:
    - src/main.js
    - e2e/deep-link.spec.mjs
decisions:
  - "Carry built ONLY from location.pathname in the client boot branch — mirrors the server file-route shape; finishLogin's validator untouched (single source of truth)"
  - "Bare /login entry gains no ?next= — gate is `if (restFromPath)` so plain auth routes keep the existing post-login landing"
  - "Validator pinned by static source assertions + a verbatim-mirrored predicate table (server.js/actions.js cannot be imported by tests)"
metrics:
  duration: ~25 min
  completed: 2026-10-30
status: complete
commits: 2
plan_head_before: 883e3f1
plan_head_after: 6f72aa2
actuals:
  tokens: 31000
  tasks: 2
  commits: 2
estimate:
  tokens: 64000
---

# Phase 23 Plan 02: Logged-out deep-link carry via ?next= Summary

**One-liner:** A signed-out visitor hitting /w/:slug/task/:key gets the sign-in view with the path carried via ?next= and lands on the exact task after sign-in; the open-redirect guard is pinned by tests at both carry sites.

## What Was Done

### Task 1: Logged-out boot writes ?next= before render (LINK-02/D-04) — commit 38f7123
- src/main.js logged-out boot branch: when `restFromPath` is non-empty (deep link, not a bare auth route), `history.replaceState(null, '', '/login?next=' + encodeURIComponent(location.pathname))` runs BEFORE `render()`, mirroring the server file-route 302 shape so both carries converge in finishLogin.
- finishLogin in src/actions/actions.js untouched — its four-clause path-only validator (`startsWith('/')`, no `//`, no `\\`, no `://`) remains the single source of truth.
- Bare /login entry unchanged (no ?next= written).

### Task 2: next-carry unit test + e2e sign-in-return scenario — commit 6f72aa2
- test/next-carry.test.mjs (5 tests): static assertions that (a) the client carry builds next from location.pathname only and runs pre-render, (b) the server file-route still echoes only its own url.pathname with its defense-in-depth assertion, (c) finishLogin retains the verbatim validator rule + `location.assign`; plus a pure-rule table — `/w/acme/task/K-12` passes, while `//evil.example`, absolute URLs, backslash paths, and `javascript:alert(1)` are all rejected.
- e2e/deep-link.spec.mjs: new scenario per locale (EN+FR) — logged-out navigation to /w/acme/task/dl-roadmap-201 shows the sign-in view with `?next=%2Fw%2Facme%2Ftask%2Fdl-roadmap-201`, sign-in returns to the exact task path with the drawer open showing the task title; plus a bare-/login regression test (no ?next=, workspace-root landing).

## Verification

- `node --test test/next-carry.test.mjs` — 5/5 pass
- `npx playwright test --config e2e/playwright.config.mjs e2e/deep-link.spec.mjs` — 8/8 pass (4 pre-existing + 4 new)
- `npm test` — 585/585 pass

## Deviations from Plan

**[Rule 3 - Blocking issue] Stale dist/ bundle masked the change during e2e**
- **Found during:** Task 1 verification
- **Issue:** The e2e server wrapper serves the built `dist/` (`e2e/server.mjs`); the first Playwright run used a stale bundle, so the new carry never executed in the browser.
- **Fix:** Ran `npm run build` before the e2e verification run; all 8 tests then passed. No code change required.
- **Files modified:** none (dist/ is build output, not committed)

None otherwise — plan executed exactly as written.

## Threat Model Compliance

- **T-23-03 (tampering: ?next= → open redirect): mitigated.** The carry site builds next from location.pathname only (never a client echo — asserted by test 1's `!mainSource.includes("get('next')")` on main.js); finishLogin's validator is unchanged and pinned verbatim; the malicious-value table rejects scheme-relative, absolute-URL, backslash and `://` shapes. `location.assign` only fires on a validated next.
- **T-23-SC (package installs): N/A** — zero runtime dependencies added.

## Known Stubs

None.

## Self-Check: PASSED

- test/next-carry.test.mjs exists on disk — FOUND
- Commits 38f7123, 6f72aa2 present in git log — FOUND
