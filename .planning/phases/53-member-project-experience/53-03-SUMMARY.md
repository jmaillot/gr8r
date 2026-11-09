---
phase: 53-member-project-experience
plan: 03
subsystem: ui
tags: [modals, project-settings, permissions, data-in, i18n, e2e, playwright]

requires:
  - phase: 53-member-project-experience/53-01
    provides: projectPermFor + p.perms['team:'+teamId] model, server-side enforcement
  - phase: 53-member-project-experience/53-02
    provides: invite modal patterns, shareQ/invite row conventions
provides:
  - Unified `projectSettings` modal (General + Access tabs) — the ONLY settings surface, opening identically from the project page gear (General) and every Share entry (Access, D-05)
  - Per-team perm dropdowns (data-tid keyed, D-02 'Can edit' default), non-manager read-only Access with lock hint (D-01), concurrent-edit 409 honesty (T-53-08)
  - Create-only `projectCreateModal` (template picker preserved); old projectModal/shareModal + dispatcher aliases deleted
  - Full data-in discipline across both tabs (per-field survival e2e in EN + FR)
  - Tree-wide data-a 483 / data-v 80 machine-identifier pins with provenance comments
affects: [53-04-projects-table-columns (Share button dedup needs this modal), 53-05]

tech-stack:
  added: []
  patterns: [tab-bar inside H() header modal (role=tablist, S.ui.settingsTab), create/edit modal split (projectCreate vs projectSettings), data-a/data-v count pins as i18n-shell/toast gates]

key-files:
  created: [e2e/project-settings.spec.mjs]
  modified: [src/overlays/modals.js, src/actions/actions.js, src/actions/keyboard.js, src/locales/en.json, src/locales/fr.json, test/i18n-search.test.mjs, test/i18n-toast.test.mjs, test/i18n-shell.test.mjs]

key-decisions:
  - "Create is split from settings: A.newProject opens a dedicated projectCreate modal (template picker is create-only) instead of aliasing type 'project' — removes the last dual-purpose modal, no flag-kept dead code (UX-01)"
  - "Deleted modals' i18n keys needed no pruning: every key family (shareTitle, projectHint, generalAccess…) is reused verbatim by the unified modal — i18n:scan stayed 0 dead with no allowlist edits"
  - "Tree-wide machine-identifier pins (data-a/data-v) live in test/i18n-toast + i18n-shell (not scripts/i18n-scan.mjs); bumped 480→483 / 79→80 with per-change provenance comments"

requirements-completed: [PSET-01, PSET-04]

coverage:
  - id: D1
    description: "One unified projectSettings modal opens identically from Workspace > Projects and the project page, on the right tab (gear→General, Share→Access)"
    requirement: PSET-01
    verification:
      - kind: e2e
        ref: "e2e/project-settings.spec.mjs#gear → General, Share → Access, tab switching both ways"
        status: pass
      - kind: e2e
        ref: "e2e/project-settings.spec.mjs#the same open/switch matrix in French (D-04/D-05)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Per-team perm dropdowns round-trip p.perms['team:'+tid], D-02 'Can edit' default, D-01 non-manager read-only with lock hint, concurrent-edit 409 surfaced honestly"
    requirement: PSET-04
    verification:
      - kind: e2e
        ref: "e2e/project-settings.spec.mjs#linking a team defaults its perm to Can edit; the changed perm persists after reload (D-02)"
        status: pass
      - kind: e2e
        ref: "e2e/project-settings.spec.mjs#a concurrent admin write surfaces the honest conflict error, never a silent overwrite (T-53-08)"
        status: pass
      - kind: e2e
        ref: "e2e/project-settings.spec.mjs#a non-manager sees the Access section read-only with the lock hint — no editable perm controls (D-01)"
        status: pass
      - kind: integration
        ref: "test/perm.test.mjs"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every keystroke-able field in the unified modal carries data-in; values survive forced re-renders in EN and FR"
    requirement: PSET-01
    verification:
      - kind: e2e
        ref: "e2e/project-settings.spec.mjs#per-field survival sweep: type into every field, re-render, values survive (EN)"
        status: pass
      - kind: e2e
        ref: "e2e/project-settings.spec.mjs#per-field survival sweep in French (FR)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Old projectModal/shareModal are gone — no render paths, no dispatcher aliases; create flows through projectCreateModal"
    requirement: PSET-01
    verification:
      - kind: e2e
        ref: "e2e/project-settings.spec.mjs#the old modals are gone: create opens the create-only form and no route opens a share/project modal"
        status: pass
      - kind: other
        ref: "grep -rn 'shareModal\\|projectModal' src/ → zero matches; grep \"case 'share'\\|case 'project'\" src/overlays/modals.js → zero"
        status: pass
    human_judgment: false
  - id: D5
    description: "i18n gate clean: 0 dead / 0 stale, count pins bumped in the same commits; FR typography (NBSP guillemets) holds"
    requirement: PSET-01
    verification:
      - kind: other
        ref: "npm run i18n:scan → 0 dead; node --test test/french-typography.test.mjs → 9/9"
        status: pass
    human_judgment: true
    rationale: "Adequacy of the pin-provenance comments and overall gate cleanliness for a human reader is a judgment call; the automated gates (i18n:scan, count pins, typography) all pass."

metrics:
  duration: ~110 min (3 sessions, interrupted between tasks)
  completed: 2026-11-09
  status: complete
actuals:
  tokens: 16300
  tasks: 3
  commits: 3
  plan_head_before: dba1b58
  plan_head_after: 68f8547
commits: 3
---

# Phase 53 Plan 03: Unified Project Settings Modal Summary

**One `projectSettings` modal (General + Access tabs) replaces both projectModal and shareModal — per-team perm dropdowns on `p.perms['team:']`, full data-in discipline with per-field survival e2e in EN+FR, and honest concurrent-edit conflict surfacing.**

## Performance

- **Duration:** ~110 min across 3 sessions (Task 3 resumed after interruption)
- **Completed:** 2026-11-09T12:45Z
- **Tasks:** 3/3
- **Files modified:** 9 (1 created)

## Accomplishments
- Unified projectSettings modal: General (name/desc/icon/color/teams/lead/target date, same pform model) + Access (per-team perm dropdowns, People with access, General access toggle), tab bar with `S.ui.settingsTab`; gear opens General, every Share entry opens Access (D-05)
- Per-team perm dropdowns (`data-in="teamPerm"` + `data-tid`), D-02 'Can edit' default on link, non-manager read-only with lock hint (D-01), optimistic pushNow with snapshot revert and honest 409 conflict toast (T-53-08/T-53-09)
- Old modals deleted: `projectModal`/`shareModal`, their dispatcher aliases, and the `type: 'project'` open call are gone; creation uses a dedicated create-only `projectCreateModal` (template picker preserved)
- Per-field data-in survival sweep e2e (EN + FR), old-modals-gone e2e; keyboard Enter-submit retargeted to projectSettings/projectCreate
- i18n gates: 0 dead/0 stale, data-a 483 / data-v 80 pins bumped with provenance, FR NBSP guillemet restored in modal.shareTitle

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end unified modal skeleton** - `92a5d31` (feat)
2. **Task 2: Access tab per-team perm dropdowns + stale/concurrent-edit honesty** - `9cfca98` (feat)
3. **Task 3: General tab data-in discipline + old modals deleted with dead keys** - `68f8547` (feat)

## Files Created/Modified
- `src/overlays/modals.js` — projectSettingsModal (tab bar, both tab bodies), projectCreateModal, shareModal/projectModal deleted, accessBody live-store rendering
- `src/actions/actions.js` — A.projectSettings (open with tab), IN.settingsTab, IN.teamPerm, projectCreate retarget, honest 409 handling
- `src/actions/keyboard.js` — Enter submit for projectSettings/projectCreate modals
- `src/locales/en.json`, `src/locales/fr.json` — modal.settingsTabs/settingsTabGeneral/settingsTabAccess/teamPermFor/settingsConflict (EN+FR); fr NBSP fix
- `e2e/project-settings.spec.mjs` — 9 tests: open/switch matrix ×2 locales, body coverage, D-02 round-trip, concurrency honesty, non-manager read-only, survival sweep ×2, old-modals-gone
- `test/i18n-search.test.mjs` — member-filter test migrated to the Access-tab renderer
- `test/i18n-toast.test.mjs`, `test/i18n-shell.test.mjs` — data-a 483 / data-v 80 pins

## Decisions Made
- Create/edit modal split (`projectCreate` vs `projectSettings`) rather than keeping `case 'project'` as a dual-purpose alias — cleaner than the plan's interim alias and satisfies the same Pitfall 7 no-dead-code end state.
- No i18n key deletions were needed: the removed modals' key families are all referenced by the unified modal, so `i18n:scan` stayed at 0 dead with no allowlist changes.
- The "data-a pins" named in the plan live in the tree-wide identifier tests (i18n-toast/i18n-shell), not scripts/i18n-scan.mjs — bumped there.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Enter-submit broke after the modal split**
- **Found during:** Task 3 (resumed session, uncommitted work review)
- **Issue:** keyboard.js still gated Enter-submit on `top?.type === 'project'` — a type that no longer exists after the alias removal.
- **Fix:** Gate now accepts `projectSettings` or `projectCreate`.
- **Files modified:** src/actions/keyboard.js
- **Committed in:** 68f8547

**2. [Rule 1 - Bug] FR guillemet padding regression in modal.shareTitle**
- **Found during:** Task 3 verification (npm test)
- **Issue:** Task 2's commit replaced the NBSP padding in `Partager « {name} »` with plain spaces — french-typography D-05 breach.
- **Fix:** NBSP padding restored; test green.
- **Files modified:** src/locales/fr.json
- **Committed in:** 68f8547

**3. [Rule 3 - Blocking] Tree-wide data-a/data-v count pins stale after modal rewrite**
- **Found during:** Task 3 verification
- **Issue:** i18n-toast/i18n-shell asserted 480 data-a / 79 data-v; the unified modal rewrote the counts (483/80).
- **Fix:** Pins bumped with provenance comments (settingsTab×2 + projectSettings gear, net of removed footers/template picker).
- **Files modified:** test/i18n-toast.test.mjs, test/i18n-shell.test.mjs
- **Committed in:** 68f8547

**4. [Rule 1 - Bug] i18n-search member-filter test imported deleted shareModal**
- **Found during:** Task 3 verification
- **Issue:** The folding test called the removed `shareModal` export.
- **Fix:** Migrated to `projectSettingsModal` on the Access tab with the seeded `p-elo` fixture; same fold assertions.
- **Files modified:** test/i18n-search.test.mjs
- **Committed in:** 68f8547

**5. [Rule 1 - Bug] Survival-sweep e2e clicked a non-existent 'map' icon**
- **Found during:** Task 3 (continuation session)
- **Issue:** The fixture project used `icon: 'map'` but PICONS has no 'map' radio — the picker never rendered it, timing the test out.
- **Fix:** Sweep clicks 'rocket' (a real PICONS entry) and asserts its aria-checked state survives the re-render.
- **Files modified:** e2e/project-settings.spec.mjs
- **Committed in:** 68f8547

---

**Total deviations:** 5 auto-fixed (4 bug fixes, 1 blocking pin update). **Impact on plan:** all fixes required by the modal rewrite; no scope creep.

## Issues Encountered
- `test/totp-rewrap.test.mjs` fails suite-wide: ENOENT `DEPLOY.md` — pre-existing from the parallel docs split (already logged in 53-01's deferred-items; out of scope).
- `npx playwright test <spec>` without `--config` boots no webServer (config lives at e2e/playwright.config.mjs); the project command is `npm run e2e -- <spec>`.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Ready for 53-04 (Projects table columns + Share button dedup): the unified modal and its `A.projectSettings`/`data-tab` entry contract are in place for the columns' Share button to target.
- No blockers.

---
*Phase: 53-member-project-experience*
*Completed: 2026-11-09*

## Self-Check: PASSED

- 53-03-SUMMARY.md, src/overlays/modals.js, e2e/project-settings.spec.mjs exist on disk.
- All 5 commits (92a5d31, 9cfca98, 68f8547, 2ec61f9, 55ae0cd) present in `git log`.
- Acceptance criteria re-run: zero `shareModal|projectModal` matches in src/, zero `case 'share'|'case 'project'` in the dispatcher, every modal field carries data-in, `npm run i18n:scan` exits 0 with the data-a 483 / data-v 80 pins bumped in the same commit, e2e per-field survival green in EN and FR (9/9 spec tests).
- Full `npm test`: 1147 pass / 1 fail (pre-existing totp-rewrap DEPLOY.md ENOENT, out of scope).
