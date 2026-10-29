---
phase: 04-hardening-and-ship
plan: 04
subsystem: release
tags: [demo-mode, single-workspace, changelog, release-notes, node-24, nvmrc, docs, semver]

# Dependency graph
requires:
  - phase: 01-tenancy-foundation
    provides: real workspace switcher, `/w/:slug` routing and workspace creation used in server mode
  - phase: 02-membership-lifecycle
    provides: membership endpoints and role rules described in DEPLOY
  - phase: 03-private-project-isolation
    provides: server-side redaction contract documented as a shipped guarantee
  - phase: 04-hardening-and-ship
    provides: plan 04-01 `npm test` entry point, 04-02 migration proof, 04-03 CI and Playwright suite
provides:
  - src/core/store.js — `workspaceList()` derives the single demo workspace from `D().ws`
  - test/demo-workspace.test.mjs — regression guard for the single-workspace demo
  - CHANGELOG.md — Keep a Changelog 1.1.0 notes (added/changed/security/upgrade/limits)
  - README.md / DEPLOY.md / .env.example — shipped behaviour, test commands, two CI jobs, TRUST_PROXY and MAX_BODY_BYTES
  - package.json + package-lock.json — 1.1.0
  - .nvmrc — Node 24
affects: [milestone v1.1 release, /gsd-ship, future release notes]

actuals:
  tokens: 6350
  tasks: 3
  commits: 4
  plan_head_before: 2ef03bf7d8b05665552f811b3611e294236ce325
  plan_head_after: 623f8cd

tech-stack:
  added: [] # no dependency added or changed by this plan
  patterns:
    - "Demo mode derives its one workspace from the current ws object; it never reads a stored array"
    - "Server-mode affordances are gated on api.enabled at the render seam, not inside the action"
    - "Browser modules are imported dynamically in Node after stubbing document/navigator/localStorage"

key-files:
  created:
    - test/demo-workspace.test.mjs
    - CHANGELOG.md
  modified:
    - src/data/seed.js
    - src/core/store.js
    - src/actions/actions.js
    - src/overlays/popovers.js
    - src/overlays/palette.js
    - README.md
    - DEPLOY.md
    - .env.example
    - package.json
    - package-lock.json
    - .nvmrc
    - .gitignore

key-decisions:
  - "Demo switch is a no-op and the switcher, create entry and palette command are not rendered at all when api.enabled is false, so no dead UI implies multi-tenancy"
  - "Onboarding in demo mode renames the existing ws object (name/url) instead of replacing it, keeping its colour and brand flag"
  - "The regression test asserts absence of data.workspaces and a one-entry workspaceList, so either regrowth fails CI"
  - "TRUST_PROXY/MAX_BODY_BYTES are documented as defaults (true / 8388608) so operators know what they get without setting anything"
  - "CHANGELOG follows Keep a Changelog and states the migration backup name, rollback target and known limits explicitly"

patterns-established:
  - "Release commits: feature/docs commits first, then a `chore(release): X.Y.Z` version+lockfile commit"
  - "GSD runtime state (.gsd/, .planning/milestone.lock) is gitignored rather than left untracked"

requirements-completed: [R7, R8]

coverage:
  - id: D1
    description: "The browser demo has exactly one workspace: no seed array, no switch branch, no create entry, no palette command, no second workspace from onboarding"
    requirement: R7
    verification:
      - kind: unit
        ref: "node --test test/demo-workspace.test.mjs (2 tests)"
        status: pass
      - kind: automated
        ref: "npm run lint && npm run format:check && npm run build"
        status: pass
    human_judgment: false
  - id: D2
    description: "README, DEPLOY, .env.example and CHANGELOG describe the shipped 1.1.0: Node 24, npm test/test:privacy/e2e, both CI jobs, TRUST_PROXY and MAX_BODY_BYTES, upgrade and rollback, known limits"
    requirement: R8
    verification:
      - kind: automated
        ref: "grep gates: 'Node.js 24', TRUST_PROXY, MAX_BODY_BYTES, '^## [1.1.0]', no 'fake switcher'; npm run format:check"
        status: pass
    human_judgment: false
  - id: D3
    description: "Version and runtime agree: package.json and both lockfile root fields are 1.1.0, .nvmrc is 24, the lockfile engine is >=24, Docker stays node:24-alpine and CI reads .nvmrc"
    requirement: R8
    verification:
      - kind: automated
        ref: "node version assertions + test \"$(cat .nvmrc)\" = 24; npm ci --dry-run; npm run lint && npm run build"
        status: pass
    human_judgment: false
  - id: D4
    description: "The full Node suite still passes with the release bump and the new demo test"
    requirement: R8
    verification:
      - kind: integration
        ref: "npm test (42 tests)"
        status: pass
    human_judgment: false

duration: 35min
completed: 2026-10-21
status: complete
---

# Phase 4 Plan 4: Demo cleanup and 1.1.0 release Summary

**The browser demo now presents one honest workspace with no switcher or create path, and the repository ships 1.1.0 with Node 24 pinned everywhere, a Keep-a-Changelog release, the complete environment and upgrade surface, and 42 passing Node tests.**

## Performance

- **Duration:** ≈35 min
- **Started:** 2026-10-21T19:05Z (approx.)
- **Completed:** 2026-10-21T19:41Z
- **Tasks:** 3
- **Files modified:** 14 (2 created, 12 modified)

## Accomplishments

- `src/data/seed.js` no longer returns `data.workspaces`; `workspaceList()` in demo mode builds a
  single `{ id: 'demo', slug: currentSlug(), name, color, role: 'owner' }` entry from `D().ws`.
  Server mode still maps `api.workspaces` unchanged.
- Demo affordances are gone at the render seam: `switchWs` returns immediately without an API,
  `newWorkspace` shows an informational toast, the popover renders a static workspace header with
  settings/invite/sign-out only, and the palette omits "Switch workspace…" and returns no
  workspace-mode group. Onboarding renames `D().ws` instead of pushing a second workspace.
- `test/demo-workspace.test.mjs` (2 `node:test` cases) stubs `document`, `navigator` and
  `localStorage` before dynamically importing the seed and store, then fails if the seed regrows
  `data.workspaces` or the demo list returns more than one entry. `npm test` is now 42 tests.
- `CHANGELOG.md` opens with `## [1.1.0] - 2026-10-21` and covers real tenancy, membership
  lifecycle, server-side private projects, the single-workspace demo, the Node suite and browser
  UAT, with Security, Upgrade notes and Known limits sections.
- `README.md` declares Node 24, documents `npm test`, `npm run test:privacy`,
  `npm run build` + `npx playwright install chromium` + `npm run e2e`, describes both CI jobs, and
  replaces the "fake switcher" paragraph with the one-local-workspace truth.
- `DEPLOY.md` documents `TRUST_PROXY=true` and `MAX_BODY_BYTES=8388608` in the configure block,
  adds a 1.1.0 upgrade/rollback procedure (backup name, restore over `projects.db`, WAL cleanup,
  previous-image redeploy), a local test section and corrected operational limits
  (one JSON document per workspace, plans display-only, SMTP optional, no stored file contents).
- `package.json` and both lockfile root version fields are `1.1.0`; `.nvmrc` is `24`; the
  lockfile engine stays `>=24`; only version fields changed, so `npm ci` remains consistent.

## Task Commits

Each task was committed atomically:

1. **Task 1: Demo mode keeps exactly one workspace** — `edf2cc4` (feat)
2. **Task 2: Release documentation and changelog** — `b1e1bb5` (docs)
3. **Task 3: Version 1.1.0 and Node 24 alignment** — `a0ad75a` (chore, `chore(release): 1.1.0`)

Supporting commit:

- `623f8cd` (chore) — `.gitignore` now covers `.gsd/` and `.planning/milestone.lock` (see
  deviations).

**Plan metadata:** this SUMMARY + STATE/ROADMAP (`docs(04-04)` commit).

## Files Created/Modified

- `src/data/seed.js` — demo workspace array removed.
- `src/core/store.js` — demo `workspaceList()` derives one entry from `D().ws`.
- `src/actions/actions.js` — demo switch branch removed, `newWorkspace` info toast, demo
  `saveWorkspace` no longer looks up the removed array, `onbFinish` renames instead of appending.
- `src/overlays/popovers.js` — `case 'ws'` splits on `api.enabled`; demo shows a static header.
- `src/overlays/palette.js` — "Switch workspace…" filtered out and ws mode unreachable in demo.
- `test/demo-workspace.test.mjs` — new regression guard (2 tests).
- `CHANGELOG.md` — new 1.1.0 release notes.
- `README.md`, `DEPLOY.md`, `.env.example` — release documentation and environment surface.
- `package.json`, `package-lock.json`, `.nvmrc` — 1.1.0 and Node 24.
- `.gitignore` — GSD runtime state.

## Decisions Made

- **Gate affordances at render, not only in the action.** The demo popover and palette simply
  never render switch/create entries, so a stale data attribute cannot reach a dead branch; the
  action-level no-ops are the second layer.
- **Rename, don't replace, during demo onboarding.** Setting `D().ws.name`/`url` preserves the
  workspace colour and `brand` flag that the old array-copy path dropped.
- **Document defaults, not just variables.** `TRUST_PROXY=true` and `MAX_BODY_BYTES=8388608`
  appear in `.env.example` and DEPLOY with their default values, so an operator who sets nothing
  still knows the behaviour.
- **Keep the release commit separate.** Tasks 1–3 each landed atomically and the release commit
  carries the version bump, rather than squashing the plan into one commit, so the SUMMARY hashes
  stay verifiable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prettier reformatted the edited popover block**
- **Found during:** Task 1 verification (`npm run format:check` flagged `src/overlays/popovers.js`).
- **Issue:** the new ternary template literal did not match Prettier's line breaking, so the
  plan's own format gate failed.
- **Fix:** `npx prettier --write src/overlays/popovers.js`; no behaviour change.
- **Files modified:** `src/overlays/popovers.js`
- **Verification:** `npm run format:check` is green.
- **Committed in:** `edf2cc4`

**2. [Rule 3 - Blocking] GSD runtime state was left as untracked noise**
- **Found during:** end of Task 1, `git status` showed `.gsd/` and `.planning/milestone.lock`
  untracked on every commit.
- **Issue:** both are machine-local GSD runtime files (dispatch sentinel, session lock), not
  project artifacts; leaving them ambiguous risks an accidental `git add`.
- **Fix:** added `.gsd/` and `.planning/milestone.lock` to `.gitignore`.
- **Files modified:** `.gitignore`
- **Verification:** `git status --short` is empty after the plan's commits.
- **Committed in:** `623f8cd`

### Process note (not a code deviation)

- GSD's default pre-commit guard refuses commits on a protected branch. This repository runs
  with `workflow.use_worktrees: false` and every phase-1–4 commit — including this plan's — lands
  directly on `main`; the plan was executed sequentially on the main working tree as the
  orchestrator instructed. No history was rewritten.

---

**Total deviations:** 2 auto-fixed (2 Rule 3)
**Impact on plan:** no product behaviour changed beyond the plan. The Prettier run is formatting
only; the `.gitignore` entry removes ambiguity the plan explicitly carried forward.

## Threat Surface

- `T-04-09` (mitigated): demo state is derived from the current `ws` object, so a browser cache
  holding the removed `data.workspaces` array is ignored; `workspaceList()` never reads it.
- `T-04-10` (mitigated): DEPLOY names the exact backup (`projects-premultitenant-<stamp>.db`), the
  restore target (`projects.db`), the WAL/SHM cleanup and the previous-image redeploy, matching the
  migration test's assertions.
- `T-04-11` (mitigated): `.env.example` still carries placeholder credentials only; real `.env`
  stays git-ignored (`*.env` with `!.env.example`).
- `T-04-SC` (mitigated): no package was installed or upgraded. `npm install --package-lock-only`
  rewrote two version fields and nothing else, and `@playwright/test` was already pinned by
  plan 04-03.

No new threat flags.

## Known Stubs

None.

## Issues Encountered

- The `gsd_run` CLI is not installed in this environment, so STATE.md and ROADMAP.md were updated
  by hand with the same fields and counters the `state.*`/`roadmap.*` verbs would write.
- The machine clock reports local CEST; commits are timestamped 21:38–21:40+02:00, which is
  19:38–19:40Z.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 4 is complete: all four plans have SUMMARYs, `npm test` is 42/42, `npm run build`,
  `npm run lint` and `npm run format:check` are green, and the version/runtime are consistent.
- Milestone v1.1 is ready for `/gsd-ship`: docs describe the merged behaviour, the upgrade path is
  documented, and CI runs both the Node suite and the Chromium UAT on Node 24.
- No blockers and no stubs.

## Self-Check: PASSED

`test/demo-workspace.test.mjs`, `CHANGELOG.md` and this SUMMARY exist; `.nvmrc` is `24`;
`package.json` and `package-lock.json` are `1.1.0`; commits `edf2cc4`, `b1e1bb5`, `a0ad75a` and
`623f8cd` are in history; `npm test` is 42/42 and `git status --short` is empty.

---
*Phase: 04-hardening-and-ship*
*Completed: 2026-10-21*
