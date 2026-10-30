---
phase: 23-email-deep-links-creator-watching
plan: 01
subsystem: spa-routing, email
tags: [deep-links, notifications, app-url, routing, i18n]
requires: [notification backbone P4-f (sendNotif/buildNotifMessage), APP_URL boot guard, A.openTask drawer mechanism, SPA fallback route]
provides: ["/w/:slug/task/:key deep-link landing (drawer + persisted URL + not-found toast)", "urlForView() URL↔view seam in go()", "APP_URL-based notification task URLs", "file-route ordering regression test (SC-5)"]
affects: [plan 23-04 (pushState/popstate extends urlForView), plan 27 (reminder emails reuse the URL helper)]
tech-stack:
  added: []
  patterns: [urlForView seam inside go(), static source-extraction testing, loopback fake-SMTP peer for mailer tests]
key-files:
  created: [e2e/deep-link.spec.mjs, test/notif-email-link.test.mjs, test/file-route-ordering.test.mjs]
  modified: [src/main.js, src/shell/render.js, server.js, src/locales/en.json, src/locales/fr.json, test/error-codes.test.mjs, test/i18n-core-features.test.mjs]
key-decisions:
  - "urlForView() lives in render.js, reads S.ui.drawer (single source of drawer truth); go() replaceState-guards on api.enabled so the demo never rewrites '/'"
  - "queueNotifEmails drops its req param entirely — APP_URL unconditionally, no Host fallback path left for notifications (T-23-01)"
  - "Underlying page for a valid deep link is always the task's project board (canSee(proj) guard makes home-fallback unreachable)"
  - "err.taskNotFound allowlisted as client-side-only; catalogue pinned at 1598 keys"
requirements-completed: [LINK-01]
commits: 4
plan_head_before: a998d263a535cdbceabdcb155783c7d77ca7a4f9
plan_head_after: e26223b19d2b6ec501553cdecd8c77c264bc0d71
status: complete
metrics:
  duration: 17 min
  tasks: 3
  files: 10
actuals:
  tokens: 8000
  tasks: 3
  commits: 4
estimate:
  tokens: 96000
---

# Phase 23 Plan 01: Deep Links & Notification Task Emails Summary

**Tracer:** /w/:slug/task/:key now lands on the existing task drawer over the project board with the URL persisted across reload, unknown/hidden keys get the localized not-found toast, and every notification email links to APP_URL + /w/:slug/task/:key — proven by 4 e2e scenarios (EN+FR), 6 node tests, and a 575/575 full suite.

## Accomplishments

- **Deep-link landing (D-01/D-02/D-03):** `applyDeepLink`'s task branch in `src/main.js` drives the exact `A.openTask` drawer state path (drawer, drawerFull from prefs, pop/palette/modals/mention/subOpen cleared, drawerTab default, render, `.drawer` focus) over the task's project board. No `go('task')` page404, no side channel; `renderPage`'s page map untouched.
- **No existence oracle (T-23-02):** unknown key and permission-hidden task both land on the workspace view with the identical `err.taskNotFound` toast ("Task not found" / "Tâche introuvable"), added to both catalogues.
- **URL persistence (D-03):** new exported `urlForView(route, params)` in `src/shell/render.js` returns `/w/:slug/task/:key` (encodeURIComponent'd key) when a drawer is open, else the workspace root; `go()` writes it with `history.replaceState` (server mode only). pushState + popstate deliberately deferred to plan 23-04.
- **LINK-01:** `queueNotifEmails` (server.js) resolves the task id→key from `nextDoc.data.tasks` at email-build time and builds `${APP_URL}/w/${wsRow.slug}/task/${encodeURIComponent(key)}`, falling back to the workspace root for a deleted task. `appBase(req)`/Host is out of the notification path entirely (req param dropped). Boot-guard message now covers invitation AND notification links.
- **SC-5 regression test:** `test/file-route-ordering.test.mjs` pins the byte route before the SPA fallback, the logged-out 302 to `/login?next=`, and the task path riding the fallback.

## Verification

| Check | Result |
|-------|--------|
| `node --test test/notif-email-link.test.mjs` | 6/6 pass (RED→GREEN per tdd="true": RED evidence `RED_EVIDENCE_OK`) |
| `node --test test/file-route-ordering.test.mjs` | 3/3 pass |
| `node --test test/catalogue.test.mjs` | 26/26 pass (new toast key in both locales) |
| `npx playwright test e2e/deep-link.spec.mjs` | 4/4 pass (EN+FR: drawer-over-board, reload persistence, not-found toast) |
| `node --test --test-concurrency=2 test/*.test.mjs` | 575/575 pass |
| TDD gates | `test(23-01)` RED commit aa43f97 → `feat(23-01)` GREEN commit 4d4a8c9; no refactor needed |

## Coverage

```yaml
coverage:
  - deliverable: "Deep link opens the task drawer over a real underlying page (D-01)"
    verification: [{ kind: tests, ref: "e2e/deep-link.spec.mjs#valid task key opens the drawer", status: pass }]
    human_judgment: false
  - deliverable: "URL persists as /w/:slug/task/:key across reload (D-03)"
    verification: [{ kind: tests, ref: "e2e/deep-link.spec.mjs#valid task key (reload assertion)", status: pass }]
    human_judgment: false
  - deliverable: "Unknown/hidden task → identical not-found toast, no oracle (D-02/T-23-02)"
    verification: [{ kind: tests, ref: "e2e/deep-link.spec.mjs#unknown task key lands on the workspace view", status: pass }]
    human_judgment: false
    rationale_note: "e2e proves the unknown-key branch; the permission-hidden branch shares the identical code path and toast key by construction"
  - deliverable: "Notification emails carry APP_URL + /w/:slug/task/:key with root fallback (LINK-01)"
    verification: [{ kind: tests, ref: "test/notif-email-link.test.mjs", status: pass }]
    human_judgment: false
  - deliverable: "Boot guard message covers notification links"
    verification: [{ kind: tests, ref: "test/notif-email-link.test.mjs#the boot guard message covers notification links", status: pass }]
    human_judgment: false
  - deliverable: "File byte-route ordering pinned (SC-5)"
    verification: [{ kind: tests, ref: "test/file-route-ordering.test.mjs", status: pass }]
    human_judgment: false
  - deliverable: "Visual adequacy of the drawer landing after a deep link"
    human_judgment: true
    rationale: "Drawer rendering over the project board is asserted functionally (visible, correct title); aesthetic adequacy is a UAT matter for /gsd-verify-work"
```

## Deviations from Plan

**1. [Rule 3 - Blocking] e2e server serves the built app — `npm run build` required**
- **Found during:** Task 1
- **Issue:** First e2e run failed because `e2e/server.mjs` serves `dist/`, which predated the SPA changes; the deep-link code was not in the served bundle.
- **Fix:** Ran `npm run build` before the e2e verify (test-infra reality, no code deviation).
- **Files modified:** none (dist is gitignored)

**2. [Rule 1 - Bug] Test fixtures: acme fixtures require the seeded OWNER account + project**
- **Found during:** Task 1
- **Issue:** The spec first signed in as a fresh account (acme → 404) and assumed `p_acme_roadmap` existed (only `setupTenants` in other spec files creates it).
- **Fix:** Spec now uses the seeded OWNER for fixtures and creates its own run-unique project + task in the acme doc via the real API.
- **Files modified:** e2e/deep-link.spec.mjs
- **Commit:** 45f5f3d

**3. [Rule 1 - Bug] Catalogue gates tripped by the new key**
- **Found during:** Task 2
- **Issue:** Adding `err.taskNotFound` broke two pinned gates (client-side-only reverse-parity allowlist; 1597-key count).
- **Fix:** Allowlisted the code with rationale; count pinned to 1598 in the same GREEN commit.
- **Files modified:** test/error-codes.test.mjs, test/i18n-core-features.test.mjs
- **Commit:** 4d4a8c9

**Total deviations:** 3 auto-fixed (1 blocking-infra, 2 bugs). **Impact:** none on scope; all gates green.

## Authentication Gates

None.

## Known Stubs

None.

## Threat Flags

None — the two trust-boundary threats in the plan's register are mitigated and asserted (T-23-01: APP_URL static test; T-23-02: no-oracle e2e + identical toast path).

## Issues Encountered

None blocking. Note for plan 23-04: `urlForView` currently replaceStates on every `go()`; 23-04 must add pushState (skip on `opt.back`) and the popstate handler over this same seam.

**Next:** Ready for 23-02.

## Self-Check: PASSED

- Created files exist on disk: e2e/deep-link.spec.mjs, test/notif-email-link.test.mjs, test/file-route-ordering.test.mjs ✔
- All 4 plan commits present in `git log a998d26..e26223b` ✔
- Plan-level verification re-run at close: 575/575 node tests, 4/4 deep-link e2e ✔
