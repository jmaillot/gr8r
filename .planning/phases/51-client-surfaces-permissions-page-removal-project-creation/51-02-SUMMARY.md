---
phase: 51-client-surfaces-permissions-page-removal-project-creation
plan: 02
subsystem: client-surfaces
tags: [share-modal, teams-section, i18n, not-found, permCreate, doc-sync]
requires: [51-01 keyed projectCreateForbidden refusal, lead-aware canManageProject, redacted doc GET]
provides: [share-modal Teams section (invite/linked-note/remove), visibility-epoch not-found state, restricted-create disabled affordance + localized refusal toast]
affects: [51-03 (permCreate relocation must align toggle polarity), Phase 52 transparency]
tech-stack:
  added: []
  patterns: [optimistic mutate + pushNow settle + snapshot revert (toggle shape reused), S.ui.lostProjects epoch marker, disabled-with-tooltip affordance gating]
key-files:
  created: []
  modified:
    - src/overlays/modals.js
    - src/actions/actions.js
    - src/core/store.js
    - src/pages/projects.js
    - src/pages/errors.js
    - src/pages/project.js
    - src/locales/en.json
    - src/locales/fr.json
    - test/client-surfaces.test.mjs
    - test/project-creation.test.mjs
    - test/i18n-shell.test.mjs
    - test/i18n-toast.test.mjs
    - test/i18n-core-features.test.mjs
key-decisions:
  - "Both Teams-section actions get the full optimistic+pushNow+revert shape (plan specified it only for unlink) — a refused PUT restores the snapshot on link too, same revert contract as the toggle"
  - "Epoch detection lives in applyDoc (S.ui.lostProjects); the poll hydration is the trigger, no window-focus refetch machinery (plan: do not add without a failing case)"
  - "The project route renders a dedicated stateNotFound() (err.projectNotFound) instead of the generic page404 — one-line generalization of the shareModal guard's honest copy"
requirements-completed: [VIS-01, CRT-01]
duration: 21 min
completed: 2026-11-08T11:58:33Z
commits: 3
plan_head_before: 81a056df43bb71b22340274fd444598ff046c8d9
plan_head_after: 5eaeeb33c81657aad232000c42b87b31ab1b217f
estimate:
  tokens: 75000
actuals:
  tokens: 10200
  tasks: 3
  commits: 3
status: complete
---

# Phase 51 Plan 02: Share-modal Teams section, not-found state & create gating Summary

**One-liner:** The share modal gains a canManage-gated Teams section (invite list excluding linked teams, linked-teams note with remove, live-semantics copy, Member-level invites on doc-sync with snapshot revert), clients that lose a project render an honest localized not-found state via an applyDoc visibility-epoch marker, and restricted members get a disabled-with-tooltip create control whose refused attempts map the server's keyed `projectCreateForbidden` to a localized toast + optimistic-insert revert — 8 new EN+FR keys, full suite 1123 pass / 0 fail.

## Accomplishments

- **Task 1:** Teams section in `shareModal()` (D-51-5/6/7/8/9), wrapped in the same `canManage` conditional as the invite form; invite list = `teamsList().filter(tm => !linkedTeams.includes(tm.id))` with an 'Invite team' opt-button per row; linked teams render in the note with a remove action; the hint carries the D-50-5 live-semantics copy; no role choice (D-51-7). `A.shareTeamInvite`/`A.shareTeamRemove` ride doc-sync only (no REST route — leads pass), gated by `canManageProject` with error toast, settling via `pushNow()` with snapshot revert on refusal. 6 new i18n keys EN+FR. New E2E cell: the non-admin lead links then unlinks a team on p_membershare via doc-sync and the stored doc reflects it.
- **Task 2:** `applyDoc` records projects present before hydration but absent after on `S.ui.lostProjects` (null on clean hydrate) — the poll hydration is the epoch trigger, no refetch machinery. `stateNotFound()` renders the localized `err.projectNotFound` state and `pageProject` uses it when the routed project vanished (generalizing the existing shareModal guard, which stays). Verified `allTasks()`/`visibleProjects()` filter vanished projects without throwing. Tests: redaction E2E (admin privatizes p_open → member's served doc no longer carries it) + an applyDoc unit cell behind a minimal DOM shim.
- **Task 3:** `pageProjects` renders the create control DISABLED with the localized `page.projects.createRestricted` tooltip when `prefs.permCreate === true` and the role is below admin — never hidden, read live at render time (D-51-16), admins/owners unaffected; header + empty-state affordances share one template. `createProject`/`submitProject` default lead to the creator (D-51-17 client mirror); `submitProject` is now async, settles the create via `pushNow()` and maps ONLY the `projectCreateForbidden` keyed refusal to the localized `err.projectCreateForbidden` toast + snapshot revert — generic sync failures keep the existing handling. 2 new i18n keys EN+FR + catalogue-contract test cell.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Catalogue/identifier baseline pins required updates**
- **Found during:** full-suite verification (after Task 1 and Task 3)
- **Issue:** the pinned catalogue-count test (i18n-core-features, 1716 → 1722 → 1724), the tree-wide data-a/data-r identifier counts (i18n-shell + i18n-toast, 476 → 479 / 57 → 58), and the D-05 French typography rule (plain space before `:` in the new `a11y.inviteTeam` FR value) — all are frozen baselines each catalogue growth must bump.
- **Fix:** reworded the FR value to use an em-dash (no colon), bumped the pins with per-change comments.
- **Files modified:** src/locales/fr.json, test/i18n-shell.test.mjs, test/i18n-toast.test.mjs, test/i18n-core-features.test.mjs
- **Commit:** 2612ae2, 5eaeeb3

**2. [Rule 1 - Plan gap] Honest not-found needs two files outside the task's declared list**
- **Found during:** Task 2
- **Issue:** the task's `<files>` list names store.js/modals.js only, but the done criterion ("re-renders an honest localized not-found state") requires the project route to render the project-specific copy — the generic `page404()` is page-copy, not `err.projectNotFound`.
- **Fix:** added `stateNotFound()` to src/pages/errors.js and wired it as the `!p` branch of `pageProject` (src/pages/project.js).
- **Files modified:** src/pages/errors.js, src/pages/project.js
- **Commit:** a362e95

**3. [Rule 1 - Bug] `await` in a non-async handler**
- **Found during:** Task 3 verification
- **Issue:** `A.submitProject` used `await pushNow()` without being async — `node --check` failed.
- **Fix:** made the handler `async` (matches the existing async `IN.shareAccess` pattern).
- **Files modified:** src/actions/actions.js
- **Commit:** 5eaeeb3

**Total deviations:** 3 auto-fixed (3× Rule 1). **Impact:** none on plan scope; all are direct consequences of the shipped behaviors. One intentional within-plan choice: the Teams-section LINK action also uses the pushNow+revert shape (plan described it only for unlink) — same revert contract, honest on refused PUTs.

## Verification

- `node --test --test-concurrency=2 test/client-surfaces.test.mjs test/visibility-team.test.mjs test/project-creation.test.mjs` — 22 pass / 0 fail
- `npm test` full suite — **1134 tests, 1123 pass, 0 fail, 11 skips** (51-01 baseline: 1119 pass; +4 new tests, 2 catalogue cells + 2 epoch cells)
- `npm run i18n:scan` — 0 literals, 0 pending, 0 unlisted, 0 stale
- Manual smoke (flip toggle, invite team, remove team, restricted create attempt in the running app) — NOT performed here (no browser harness); routes to human spot-check below.

## Coverage

- deliverable: Teams section (invite list, linked note with remove, live-semantics copy, Member-level)
  verification: [{ kind: command, ref: "node --check src/overlays/modals.js && node --check src/actions/actions.js", status: pass }, { kind: tests, ref: "test/client-surfaces.test.mjs#lead links then unlinks a team via doc-sync", status: pass }, { kind: tests, ref: "test/visibility-team.test.mjs", status: pass }]
  human_judgment: true
  rationale: the modal rendering, tooltip copy and revert-toast UX are browser-only; visual behavior needs human spot-check in the running app
- deliverable: honest localized not-found on lost visibility (visibility-epoch)
  verification: [{ kind: tests, ref: "test/client-surfaces.test.mjs#applyDoc records the visibility epoch", status: pass }, { kind: tests, ref: "test/client-surfaces.test.mjs#admin privatizes p_open → member's served doc no longer carries it", status: pass }]
  human_judgment: true
  rationale: the re-render of the not-found state in the SPA is client-side only (no browser harness); the epoch detection and redaction trigger are machine-verified
- deliverable: restricted-create gating (disabled + tooltip, refusal toast + revert, lead default)
  verification: [{ kind: tests, ref: "test/project-creation.test.mjs#restriction ON refused with projectCreateForbidden", status: pass }, { kind: tests, ref: "test/project-creation.test.mjs#restricted-create client strings catalogued EN+FR", status: pass }, { kind: command, ref: "node --check src/pages/projects.js && node --check src/actions/actions.js", status: pass }]
  human_judgment: true
  rationale: the disabled-affordance rendering and the localized toast display are browser-only; server refusal semantics and localization keys are machine-verified
- deliverable: i18n — all new strings catalogued EN+FR through the gate
  verification: [{ kind: command, ref: "npm run i18n:scan", status: pass }, { kind: tests, ref: "test/i18n-core-features.test.mjs", status: pass }, { kind: tests, ref: "test/french-typography.test.mjs", status: pass }]
  human_judgment: false

## Known Stubs

None.

## Authentication Gates

None.

**Next:** Ready for 51-03 (Permissions-page teardown + permCreate relocation to General — the relocation must align the legacy `permCreate !== false` toggle polarity with the phase-wide `=== true` restriction read this plan gates on).

## Self-Check: PASSED

All key files exist on disk; commits 2612ae2, a362e95, 5eaeeb3, 277bec1 verified in history. Plan-level verification re-run: 22/22 targeted tests, i18n scan clean, full suite 1123 pass / 0 fail.
