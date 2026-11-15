---
phase: 66-task-project-templates
plan: 02
subsystem: templates-instantiation
tags: [templates, builder, instantiation, single-doc-put, offset-dates, lazy-actions]
requires: [phase-66-01 (sanitizeTemplate/sanitizeTaskBody/sanitizeProjectBody/normalizeTemplatesData), phase-65-subtree (subtask id/parentId/position shape)]
provides: [src/core/templates.js instantiateTemplate/landInstantiation/templateFromItem/sanitizeProjectTaskEntry, src/actions/templates.js (A.saveTemplate/A.instantiateTemplate/A.saveAsTemplate + templateUi registry), doc.templates[] client init, i18n templates toast/err keys]
affects: [66-03 (lazy UI consumes templateUi.openEditor registry + A.* actions), phase-67 diffWebhookEvents (sees bulk tasks as ordinary task.created events)]
tech-stack:
  added: []
  patterns: [one-validator-extended (project body task-tree whitelist), pure-builder-+-landing-split (node-testable landing, thin DOM-coupled actions), lazy-action-chunk (65-03 prewarm remedy for the entry gate), registry-stub (templateUi.openEditor until 66-03)]
key-files:
  created: [src/actions/templates.js]
  modified: [src/core/templates.js, src/core/store.js, src/main.js, src/locales/en.json, src/locales/fr.json, test/templates.test.mjs, test/error-codes.test.mjs, test/i18n-core-features.test.mjs]
decisions:
  - the builder is push-free and the landing is a separate pure helper (landInstantiation in core/templates.js) — the DOM-coupled action layer cannot load in node:test, so the exact rows/orders/activity the single doc-PUT carries are pinned purely; the push discipline is pinned structurally (zero createTask literals, exactly one awaited pushNow per writing action) plus one real revision-bump through the funnel
  - templates.js gained import-free day math (capturedDay/offsetIso mirroring utils iso/addD) instead of importing utils — the utils chain drags i18n/theme into the server-funnel module
  - project task-tree entries are rebuilt fresh (whitelist-drop) while their subtask entries stay in-place-whitelisted via the shared sanitizeTemplateSubtask — the Phase 65 identity trap only applies below the wrapper
  - A.* actions join the namespace by assignment from a main.js-imported module (the Phase 65 actions/subtasks.js precedent); the plan's actions.js re-export wording resolved to the established wiring
  - template actions ride a lazy prewarm chunk (main.js dynamic import) — a static import blew the 500 kB entry gate (D-13); the registry templateUi lives in the lazy module, stub-safe until 66-03
metrics:
  duration: 34min
  completed: 2026-11-15
status: complete
actuals:
  tokens: 19700   # chars/4 over the 9 changed files (788 insertions / 4 deletions)
  tasks: 2
  commits: 3
plan_head_before: b45d711e6a7a41723d10b3fde559f0e0e0de1a67
plan_head_after: 542dda3
---

# Phase 66 Plan 02: Template Instantiation Engine + Actions Summary

Pure `instantiateTemplate` builder (fresh ids, parentId remap, D-05–D-08 offset dates from one captured day) plus `A.saveTemplate`/`A.instantiateTemplate`/`A.saveAsTemplate` actions landing the whole tree in exactly one doc-PUT — the TMPL-02/TMPL-03 single-write-path guarantee.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1a | TDD RED — builder pins | a90c1e4 | test/templates.test.mjs |
| 1b | TDD GREEN — builder + landing + draft helpers, project task-tree whitelist | f32cd9a | src/core/templates.js, test/templates.test.mjs |
| 2 | Template CRUD + instantiation actions — one pushNow per mutation | 542dda3 | src/actions/templates.js, src/core/store.js, src/main.js, locales, tests |

## What Was Built

- **src/core/templates.js** — `instantiateTemplate(tmpl, uidFactory, today, keyFn)`: pure, push-free builder returning `{ project, tasks[] }` with fresh uid('p'/'t'/'s') ids (D-16), `parentId` remapped through a per-task old→new Map (Pitfall 4 — dangling refs land null exactly like the funnel heal), every due/start computed from the ONE captured day via import-free day math (D-05/D-06), subtask offsets absolute (D-07), missing offset → no due field, neg/zero pass through (D-08), createProject/createTask field vocabulary. `sanitizeProjectBody` now whitelists the embedded task tree (66-01 handoff) via `sanitizeProjectTaskEntry` — wrapper rebuilt fresh, subtask entries whitelisted in place, offsets numeric-only. `landInstantiation` (pure): projects/tasks/projOrder/activity land synchronously with nextKey-shaped keys (`<key>-201`, seq seeds 200) and creator-as-lead defaults. `templateFromItem` (pure): the saveAsTemplate inverse — offsets derived from the item's own due day, strict D-14 whitelist (no assignees/lead/members/milestones, T-66-05).
- **src/actions/templates.js** — the Phase 65 action-split precedent: `A.saveTemplate` (client-side sanitizeTemplate first, T-66-04; create/update in one mutate), `A.instantiateTemplate` (builder + landInstantiation in ONE mutate → exactly ONE `pushNow`; 409 → settingsConflict, restore + localized err toast otherwise), `A.saveAsTemplate` (D-10 pre-fill draft → `templateUi.openEditor` registry, stub-safe until 66-03). Every write rides snapshot → mutate → pushNow → restore.
- **src/core/store.js** — `templates: []` in emptyState + applyDoc normalization (rides the existing doc-PUT, no new sync logic).
- **src/main.js** — lazy prewarm `import('./actions/templates.js')` (D-13; a static import measured the entry at 508,664 B).
- **i18n EN+FR** — `toast.templateSaved`, `toast.instantiatedFromTemplate`, `err.templateSaveFailed`, `err.templateInstantiateFailed` (FR guillemets U+00A0-padded per the D-05 typography gate); catalogue count 1911 → 1915; both err codes allowlisted client-side in test/error-codes.test.mjs.
- **test/templates.test.mjs (32 tests)** — builder pins (ids/remap/anchors/neg-zero-missing/vocabulary), landing pins, single-pass funnel pin (one revision bump, both tasks + intact remapped tree persist), structural action pin (zero createTask, one awaited pushNow per writing action), templateFromItem inverse round-trip.

## Verification

- `node --test test/templates.test.mjs` — 32/32 green; `node --test test/templates.test.mjs test/mcp.test.mjs` — 75/75 green
- Full `npm test` — 1614 tests, **2 fail: BOTH are the 500 kB entry-chunk gate, PRE-EXISTING at HEAD (see Deviations)**; every other suite green (error-codes, french-typography, i18n-core-features, mcp, catalogue)
- `scripts/i18n-scan.mjs` — 0 literals, exit 0
- `npx eslint` on all touched files — clean
- Plan verification greps: no `createTask` in src/actions/templates.js; `instantiateTemplate` in a module whose only import is the zero-import subtree.js

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] templateFromItem computed the project task tree but never attached it**
- **Found during:** Task 1 GREEN — eslint no-unused-vars
- **Issue:** the `tasks` array in the project-flavor draft was built but dropped from `body`
- **Fix:** attached to the draft body (round-trip test now proves re-instantiation reproduces the offsets)
- **Files modified:** src/core/templates.js — **Commit:** f32cd9a

**2. [Rule 3 - Blocking] Gate-test fallout from the i18n additions**
- **Found during:** Task 2 full-suite run
- **Issue:** the +4 catalogue keys tripped the reverse-parity err allowlist, the FR D-05 guillemet typography rule and the pinned catalogue-count assertion (1911)
- **Fix:** client-side err allowlist entries with 66-02 annotations; U+00A0-padded FR guillemets; count pinned to 1915 with the 66-02 delta note
- **Files modified:** test/error-codes.test.mjs, src/locales/fr.json, test/i18n-core-features.test.mjs — **Commit:** 542dda3

**3. [Rule 3 - Blocking] Static actions import blew the 500 kB entry gate (D-13)**
- **Found during:** Task 2 chunk-gate run (508,664 B entry)
- **Issue:** `import './actions/templates.js'` in main.js pulled the actions + builder into the entry chunk
- **Fix:** lazy prewarm dynamic import (the 65-03 subtask-move remedy) → entry back to +92 B over the pre-existing baseline
- **Files modified:** src/main.js — **Commit:** 542dda3

### Pre-existing failure (documented, NOT fixed — scope boundary)

- **The 500 kB entry-chunk gate was already red at HEAD before any 66-02 change:** with `src/main.js` and `src/locales/en.json` reverted to HEAD (b45d711), the build measures **500,075 B > 500,000**. 66-01 touched only client-invisible files, so the overage predates phase 66's client work. 66-02's contribution is +409 B (4 bundled catalogue keys ≈ +317 B, prewarm import ≈ +92 B); entry now 500,484 B. Shaving unrelated entry-chunk modules is out of this plan's scope — recorded in `deferred-items.md` for 66-03 (which owns the chunk budget) or a quick task.

### Decisions (within plan discretion)

- Push discipline pinned structurally (source-level pin: zero createTask literals, exactly one awaited pushNow per writing action) instead of unit-driving the DOM-coupled action module in node — paired with the pure landInstantiation pins and a real one-revision-bump funnel PUT, this covers D-15 honestly.
- The plan's "export wiring in actions.js" resolved to the established Phase 65 pattern: A-namespace assignment from a main.js-imported sibling module (actions.js itself does not import subtasks.js either).
- `templateUi` registry lives in src/actions/templates.js (`{ openEditor: null }`), populated by 66-03 — stub-safe null reference until then.

## Known Stubs

None in the delivered behavior. The single intentional stub-shaped surface is `templateUi.openEditor = null` (src/actions/templates.js:23): `A.saveAsTemplate` builds the D-14 draft but opens nothing until 66-03 populates the registry — exactly what the plan's task-2 step 1 specifies ("registry call is a stub-safe reference until 66-03 lands").

## Threat Flags

None — no new network endpoints, auth paths, or file-access surfaces. T-66-04 mitigated (client-side sanitizeTemplate before every template write; funnel sink remains the authority); T-66-05 mitigated (templateFromItem extracts only D-14 whitelist fields, pinned by test).

## Self-Check: PASSED

- Files exist: src/actions/templates.js, updated src/core/templates.js/store.js/main.js/locales ✓
- Commits verified: a90c1e4, f32cd9a, 542dda3 (git log) ✓
- Must_haves truths: builder in one pushNow path (D-15/D-16) ✓, offsets anchored to one captured day (D-05–D-08) ✓, parentId remap (Pitfall 4) ✓, saveAsTemplate pre-fill whitelist-conformant ✓
- Self-check caveat: the 2 failing full-suite tests are the documented pre-existing chunk gate, not 66-02 regressions (measured at HEAD before this plan started)
