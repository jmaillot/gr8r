---
phase: 23-email-deep-links-creator-watching
plan: 06
subsystem: client-routing
tags: [deep-links, routing, teams, e2e]
requires: [23-04 urlForView/applyDeepLink seams, teams collection on D()]
provides: ["/w/:slug/team/:id deep-link resolution", "unknown-team-id no-oracle fallback", "bare /w/:slug/team → teams list"]
affects: [back-forward popstate restoration]
tech-stack:
  added: []
  patterns: ["mirrored member-branch shape for a keyed route in applyDeepLink", "route-before-catch-all ordering in urlForView"]
key-files:
  created: []
  modified: [src/shell/render.js, src/main.js, e2e/deep-link.spec.mjs]
decisions:
  - "urlForView team branch placed BEFORE the ROUTE_IDS catch-all; no-id team writes address /w/:slug/teams explicitly (never the lossy /team)"
  - "Unknown team id falls back to workspace home silently — no toast, no 404, no existence oracle (T-23-07; UAT specifies silent, unlike the task branch's err.taskNotFound toast)"
  - "Bare seg 'team' resolves to go('teams') before the plain-route fallback — the plain fallback was the exact 404 defect path"
  - "e2e beforeAll prunes stale dl fixtures (task by key, teams by tm_dl_ prefix) so duplicate-key lookups resolve to this run's fixture on the persistent e2e server"
metrics:
  duration: ~50 min
  completed: 2026-10-31T11:59:17Z
  commits: 2
plan_head_before: a660379~1
plan_head_after: 87947d5
status: complete
actuals:
  tokens: 34000
  tasks: 2
  commits: 2
---

# Phase 23 Plan 06: Team deep-link resolution (G-23-4) Summary

**One-liner:** /w/:slug/team/:id is now a first-class deep link — urlForView() emits the keyed team URL and applyDeepLink resolves it (unknown ids land home with no oracle, bare /team shows the list) — closing the last lossy URL from 23-04.

## What Was Done

- **Task 1 (TDD):** RED e2e scenarios first (3 scenarios × EN/FR, all failing against the lossy URL), then GREEN:
  - `src/shell/render.js` — `urlForView()` team branch before the ROUTE_IDS catch-all: `team` + `params.id` → `/w/:slug/team/:id` (encodeURIComponent); `team` without id → `/w/:slug/teams`.
  - `src/main.js` — `applyDeepLink()` team branch inside the keyed block (mirrors member): id present in `data.teams` → `go('team', {id}, opt)`; unknown → `go('home', {}, opt)` silently (T-23-07 no-oracle). Bare seg `'team'` → `go('teams', {}, opt)` before the plain-route fallback.
  - No popstate changes — team entries ride the existing single handler (T-23-05 holds).
- **Task 2:** Full regression — deep-link + back-forward e2e (24/24 green, seam canary included) and node suite (593/593).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] e2e beforeAll leaked stale fixtures across runs**
- **Found during:** Task 1 (RED phase)
- **Issue:** The e2e server persists workspace data across suite invocations; the spec's append-only beforeAll accumulated duplicate tasks sharing key `dl-roadmap-201` (and dl teams). `applyDeepLink`'s `find(data.tasks, 'key')` resolved the OLDEST duplicate, so the pre-existing EN/FR task-drawer tests failed whenever a previous run's fixtures were still present — a latent flake in the shared spec, surfaced by the new scenarios' cascade.
- **Fix:** beforeAll now prunes stale fixtures before appending this run's — tasks filtered by `key !== TASK_KEY`, teams filtered by `!id.startsWith('tm_dl_')`.
- **Files modified:** e2e/deep-link.spec.mjs
- **Commit:** a660379

## Verification

- `npm run build` — clean
- `npx playwright test e2e/deep-link.spec.mjs` — 14/14 (EN+FR: direct load + F5 of team URL renders the team view, unknown id → workspace home with `.toast` count 0, bare `/team` → teams list)
- `npx playwright test e2e/deep-link.spec.mjs e2e/back-forward.spec.mjs` — 24/24 (back-forward seam canary green)
- `npm test` — 593 pass / 0 fail (baseline-or-better)

## Known Stubs

None.

## Threat Model Compliance

- T-23-07 (Information Disclosure, unknown team id): mitigated — silent workspace-home fallback, no toast, no 404 page, id never echoed; e2e asserts `.toast` count 0 and no drawer.
- T-23-SC (package installs): N/A — zero runtime dependencies, no installs performed.
