---
phase: 53-member-project-experience
plan: 05
subsystem: ui
tags: [teams, foldForSearch, accent-insensitive-search, i18n, e2e, data-a-pins, pushNow]

requires:
  - phase: 53-member-project-experience/53-04
    provides: deduped Share surface, current i18n gate (0 dead/0 stale) and data-a pins at 481
provides:
  - Edit Team members box with foldForSearch accent-insensitive search that never loses checked state (checks live in f.members, re-derived on render)
  - page.team.accessHint with the owner's verbatim multi-team sentence (EN) + FR equivalent; old primary-team membersHint deleted
  - Team detail page with zero invite buttons; act.inviteToWorkspace key deleted with its last consumer
  - Milestone i18n gate clean: 0 dead / 0 stale, data-a pins at 480 in both pin tests, no allowlist additions, unit suite 0 fail
affects: [v2.1 milestone close-out, phase-verification]

tech-stack:
  added: []
  patterns: [search needle in S.ui via data-in binding (share-modal pattern), checked state re-derived from form state on every render, pushNow() sequencing before authority PUTs]

key-files:
  created: [e2e/teams.spec.mjs]
  modified: [src/features/teams.js, src/actions/teams.js, src/pages/members.js, src/locales/en.json, src/locales/fr.json, test/i18n-shell.test.mjs, test/i18n-toast.test.mjs, test/i18n-core-features.test.mjs, test/totp-rewrap.test.mjs]

key-decisions:
  - "The submitTeam membership PUT now waits on pushNow() — the 450ms-debounced doc push raced the team-whitelisted PUT and 400'd unknownTeam, silently keeping the modal open with reverted memberships (Rule 1 fix, pre-existing latent bug)"
  - "The plan's grep criterion 'no data-a=\"invite\" in src/pages/members.js' was narrowed to the team page only: the Members-directory button at members.js:44 IS the sanctioned Workspace > Members entry point per TEAM-03"

requirements-completed: [TEAM-01, TEAM-02, TEAM-03, UX-01]

coverage:
  - id: D1
    description: "Edit Team members box is accent-insensitivity searchable (foldForSearch) and typing/clearing the search never loses checked state"
    requirement: TEAM-01
    verification:
      - kind: e2e
        ref: "e2e/teams.spec.mjs#accent-insensitive search filters the list and never loses checked state"
        status: pass
    human_judgment: false
  - id: D2
    description: "The team hint reads the owner's verbatim EN sentence with an FR equivalent; old membersHint wording gone from locales and code"
    requirement: TEAM-02
    verification:
      - kind: e2e
        ref: "e2e/teams.spec.mjs#the team detail page has no invite button and the hint reads the owner sentence (EN, TEAM-02/03)"
        status: pass
      - kind: e2e
        ref: "e2e/teams.spec.mjs#the team hint reads the owner sentence in French too (TEAM-02)"
        status: pass
      - kind: other
        ref: "! grep membersHint src/locales/ src/features/teams.js → zero matches"
        status: pass
    human_judgment: false
  - id: D3
    description: "Team detail page has zero [data-a=invite] elements; invites only via Workspace > Members; dead act.inviteToWorkspace key deleted"
    requirement: TEAM-03
    verification:
      - kind: e2e
        ref: "e2e/teams.spec.mjs#the team detail page has no invite button and the hint reads the owner sentence (EN, TEAM-02/03)"
        status: pass
      - kind: other
        ref: "grep 'data-a=\"invite\"' pageTeam render → zero; data-a pins 481→480 green in both pin tests"
        status: pass
    human_judgment: false
  - id: D4
    description: "Milestone i18n gate: 0 dead / 0 stale, pins accurate, no allowlist additions, package.json runtime deps unchanged"
    requirement: UX-01
    verification:
      - kind: other
        ref: "npm run i18n:scan → 0 dead/0 stale; git log scripts/i18n-scan.mjs untouched in phase 53; git diff package.json empty"
        status: pass
    human_judgment: false
  - D5: &d5
      id: D5
      description: "Full e2e suite green at milestone close"
      verification: []
      human_judgment: true
      rationale: "97/108 e2e pass; 11 failures bisected PRE-EXISTING at 6e90e59 (pre-53-05 worktree check) — tenancy ×4, locale ×2, flows share-modal/creation ×4, french-overflow ×1; triage deferred to deferred-items.md, cannot honestly claim green"

metrics:
  duration: 40 min
  completed: 2026-11-09
  status: complete
actuals:
  tokens: 24000
  tasks: 3
  commits: 3
  plan_head_before: 6e90e59
  plan_head_after: fe93e11
---

# Phase 53 Plan 05: Teams Polish & Milestone i18n Close-out Summary

**Edit Team members box gains foldForSearch accent-insensitive search that never loses checked state; the owner's multi-team hint replaces the primary-team wording in EN+FR; the team page loses its invite button; the milestone i18n gate closes at 0 dead / 0 stale with the unit suite fully green.**

## Performance

- **Duration:** 40 min
- **Started:** 2026-11-09T12:47:13Z
- **Completed:** 2026-11-09T13:27Z
- **Tasks:** 3/3
- **Files modified:** 10 (1 created)

## Accomplishments
- Searchable members box: `data-in="teamSearch"` input + `IN.teamSearch` handler (needle in `S.ui.teamSearch`, share-modal pattern), `foldForSearch` filtering over the `tformMember` checkbox list, localized no-match row (`team.noMembersMatch` EN+FR); checked state re-derived from `f.members` so search/clear can never drop a check
- TEAM-02: `page.team.accessHint` carries the owner's exact EN sentence with an authored FR equivalent; `page.team.membersHint` deleted from both locales in the same commit
- TEAM-03: pageTeam invite button deleted; `act.inviteToWorkspace` deleted with its last consumer; data-a pins 481→480 in BOTH pin files (i18n-shell + i18n-toast) with provenance
- UX-01 close-out: `npm run i18n:scan` 0 dead / 0 stale; no allowlist additions during phase 53; package.json runtime deps unchanged; unit suite 1169 tests, 0 fail (after 3 stale-test repairs, below)

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end searchable team members box with preserved checked state** - `29a2dff` (feat)
2. **Task 2: TEAM-02 hint swap + TEAM-03 invite button removal with dead keys** - `7afeaab` (feat)
3. **Task 3: Milestone i18n close-out sweep + full-suite gate** - `fe93e11` (test)

## Files Created/Modified
- `src/features/teams.js` — search input + foldForSearch filtered map + no-match row; hint key swap
- `src/actions/teams.js` — `IN.teamSearch`, teamSearch reset in newTeam/editTeam, **pushNow() before the membership PUTs**
- `src/pages/members.js` — pageTeam invite button removed
- `src/locales/en.json`, `src/locales/fr.json` — +`team.noMembersMatch`, +`page.team.accessHint`, −`page.team.membersHint`, −`act.inviteToWorkspace`
- `test/i18n-shell.test.mjs`, `test/i18n-toast.test.mjs` — data-a pin 481→480 with provenance
- `test/i18n-core-features.test.mjs` — WAVE_ORACLE entry swapped to the new hint key/value
- `test/totp-rewrap.test.mjs` — runbook-parity now reads `docs/DEPLOY.md` (relocated by the 5e4d954 docs split)
- `e2e/teams.spec.mjs` — new: 3 tests (search+checked-state, no-invite+hint EN, hint FR)

## Decisions Made
- **pushNow() sequencing in submitTeam (Rule 1):** the doc push (carrying the new/edited team) is debounced 450ms by `save()`, but the membership PUT is whitelisted against the STORED doc server-side — a premature PUT 400s `unknownTeam` and left the modal open with reverted memberships. `A.submitTeam` now awaits `pushNow()` first (the same rule the delTeam undo already followed).
- **Plan grep criterion narrowed to intent:** the acceptance criterion "`grep 'data-a="invite"' src/pages/members.js` returns nothing" would have deleted the Workspace > Members invite button — the one entry point TEAM-03 mandates. Interpreted against TEAM-03's intent: no invite on the TEAM page (verified by e2e); the Members-directory button stays.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] submitTeam membership PUT raced the debounced doc push**
- **Found during:** Task 1 (tracer e2e — team created with 0 members, modal stuck open)
- **Issue:** 450ms-debounced push vs immediately-fired `setMemberTeams` → 400 `unknownTeam`, memberships reverted
- **Fix:** `await pushNow()` after `mutate`, honest error toast + stop on failure
- **Files modified:** src/actions/teams.js
- **Verification:** e2e submit now saves memberships (3/3 green)
- **Committed in:** 29a2dff

**2. [Rule 3 - Blocking] Second data-a pin lives in test/i18n-toast.test.mjs**
- **Found during:** Task 3 (full `npm test` — 480 !== 481)
- **Issue:** 53-04 bumped the pin in both files; Task 2 only bumped i18n-shell
- **Fix:** i18n-toast pin 481→480 with the same provenance
- **Committed in:** fe93e11

**3. [Rule 3 - Blocking] Stale oracle + relocated DEPLOY.md reference**
- **Found during:** Task 3 (WAVE_ORACLE pinned the deleted `page.team.membersHint`; totp-rewrap ENOENT root `DEPLOY.md` — moved to `docs/` by the 5e4d954 docs split, residual of the 53-01 deferred item)
- **Fix:** oracle entry swapped to `page.team.accessHint` with the owner sentence; test reads `../docs/DEPLOY.md` (pinned one-liner + D-K13 query verified present there)
- **Files modified:** test/i18n-core-features.test.mjs, test/totp-rewrap.test.mjs
- **Verification:** unit suite 1169/1169 pass
- **Committed in:** fe93e11

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking). **Impact on plan:** all three were required for the verify gates to hold; the pushNow fix also repairs a latent bug users would hit creating a team with members.

## Issues Encountered
- **11 pre-existing e2e failures** (tenancy ×4, locale ×2, flows share-modal/creation ×4, french-overflow ×1): bisected via a clean worktree at `6e90e59` — already failing BEFORE 53-05, likely casualties of 53-03/53-04 (the share-modal removal changed the flows.spec UAT-04 surface). Out of scope per the scope-boundary rule; logged in `deferred-items.md` for owner/verifier triage. **97/108 e2e pass; unit suite 0 fail.**
- Playwright must run via `npm run e2e -- <spec>` — `npx playwright test` without `--config` finds no root config and serves nothing.

## Known Stubs
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 53 is complete (5/5 plans): all milestone invariants held — zero new runtime dependencies, zero migrations, EN+FR parity, i18n gate clean, no allowlist erosion, unit suite fully green.
- Open item for milestone verification: the 11 pre-existing e2e failures in `deferred-items.md` (pre-date this plan; flows.spec UAT-04 needs rework against the unified settings modal from 53-03).

---
*Phase: 53-member-project-experience*
*Completed: 2026-11-09*

## Self-Check: PASSED

- 53-05-SUMMARY.md and e2e/teams.spec.mjs exist on disk; all 3 commits (29a2dff, 7afeaab, fe93e11) in `git log`.
- Acceptance criteria re-run: `grep "teamSearch\|foldForSearch" src/features/teams.js` shows needle + filtered map; `npm run e2e -- e2e/teams.spec.mjs` 3/3 green (search+checked-state, zero-invite+hint EN, hint FR); `npm run i18n:scan` exit 0 (0 dead/0 stale); `membersHint` absent from locales and src; `node --test test/i18n-shell.test.mjs test/i18n-toast.test.mjs` green at pin 480; unit suite 1169/1169.
- Plan verification: `npm test` 0 fail; `npm run e2e` 97 passed / 11 failed (all 11 bisected pre-existing at 6e90e59, documented in deferred-items.md); `git diff package.json` empty; no allowlist additions during phase 53.
