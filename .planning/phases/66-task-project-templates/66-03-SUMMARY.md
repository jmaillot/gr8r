---
phase: 66-task-project-templates
plan: 03
subsystem: client-ui
tags: [templates, lazy-loading, i18n, e2e, chunk-gate]
requires:
  - 66-02: A.saveTemplate/A.instantiateTemplate/sanitizeTemplate funnel
  - 65-xx: subtree.js validators (validateMove/nextPosition/orderedSiblings/descendantsOf)
provides:
  - src/features/template-ui.js — the lazy template surfaces chunk (Settings CRUD body, create-modal picker, draft-state editor)
  - src/features/assignee-pick.js + src/features/file-preview.js — the entry-gate remedy lazy chunks
  - A.openTemplatePicker / A.saveAsTemplate(kind,id) / A.tplPick wiring
  - templates.* i18n family (23 keys EN+FR)
affects: [test/build-chunk-size.test.mjs, test/i18n-* pins, e2e/templates.spec.mjs]
tech-stack:
  added: []
  patterns: [S.ui.<mod> lazy-chunk cache + lazyStub (drawer prewarm pattern), draft-state modal editing, esc-everywhere template strings]
key-files:
  created:
    - src/features/template-ui.js
    - src/features/assignee-pick.js
    - src/features/file-preview.js
    - e2e/templates.spec.mjs
  modified:
    - src/overlays/modals.js
    - src/actions/actions.js
    - src/actions/templates.js
    - src/overlays/context-menu.js
    - src/pages/settings.js
    - src/core/templates.js
    - src/locales/en.json
    - src/locales/fr.json
    - test/build-chunk-size.test.mjs
    - test/i18n-core-features.test.mjs
    - test/i18n-shell.test.mjs
    - test/i18n-toast.test.mjs
    - test/i18n-overlays.test.mjs
    - test/templates.test.mjs
decisions:
  - Entry-gate remedy: moved the two heaviest statically-imported modal renderers (assigneePickModal, filePreviewModal) into lazy chunks cached in S.ui.apMod/S.ui.fpMod, loaded BEFORE openModal with a lazyStub fallback in modals.js
  - Template surfaces are modals (templatePick/templateEdit cases in modalHtml), not a drawer — the editor mirrors the drawer layout inside a .modal.lg
  - Editor edits a DRAFT (S.ui.tplEditor deep clone) using Phase 65 subtree validators; live doc rows are never touched until A.tplSave → A.saveTemplate
  - Tasks 1+2 committed as ONE atomic commit: the i18n scan gate (npm run prebuild) fails on BOTH unresolved and dead keys, so code+keys cannot land separately green
metrics:
  duration: ~75 min
  completed: 2026-11-15
status: complete
actuals:
  tokens: 58000 # chars/4 over the realized diff (18 files, +1039/−118)
  tasks: 3
  commits: 2
plan_head_before: 83695674cb1cd593661aff9031bff4d3472ace41
plan_head_after: ce9a11a
---

# Phase 66 Plan 03: Template UI (lazy chunk) Summary

Lazy-loaded template surfaces — Settings › Templates CRUD, "From template…" pickers in both create modals, save-as-template context-menu entries, draft-state editor with offset column — plus the entry-chunk gate remedy that put the entry bundle back under 500 kB.

## What was built

- **`src/features/template-ui.js`** (lazy chunk, ~550 lines): `renderTemplateSettings` (position-sorted list, edit/delete-confirm/reorder), `templatePickModal` (kind-filtered, icon/name/count preview), `templateEditModal` (kind toggle for new templates, icon/color palettes, task vs project body fields, tree with per-node `dueOffsetDays` offset column, promote/demote/re-parent on the draft via Phase 65 subtree validators). Populates the 66-02 `templateUi.openEditor` registry at module load.
- **Entry-gate remedy (the deferred-items blocker):** `assigneePickModal` and `filePreviewModal` moved out of modals.js into lazy `src/features/assignee-pick.js` / `src/features/file-preview.js`; `A.assigneePickOpen` / `openFilePreview` dynamic-import them before `openModal`; `modalHtml` renders `lazyStub()` while a chunk loads. Entry chunk back under 500,000 bytes.
- **Surface wiring:** "From template…" buttons in taskModal (create mode) and projectCreateModal; `saveTaskTemplate`/`saveProjectTemplate` context-menu entries beside the dup twins; Settings › Templates nav entry + lazy section body.
- **i18n:** 23 new keys EN+FR (templates.* family + modal.fromTemplate/fromTemplateHint + act.saveAsTemplate + settings.nav/settings.templates.lead). FR uses U+00A0 guillemet padding and U+202F before `?` (D-05 typography).
- **e2e/templates.spec.mjs:** project-template instantiation via the picker (parentId remap through the fresh-id map, dues = today + offset, no-offset = no due) and task-template via taskModal (drawer opens, tree + offset dues verified through the funnel).

## Verification

- `npm test`: **1615 pass, 0 fail** (includes the previously-failing 500 kB chunk gate, now green)
- `npm run i18n:scan`: 0 violations
- `npx playwright test e2e/templates.spec.mjs`: 2 passed
- Pins updated: catalogue 1915→1938, data-a 517→542, data-v 81→86, context-menu byte-identity, task-row vocabulary

## Deviations from Plan

**[Rule 2 — task merge] Tasks 1 and 2 landed as one atomic commit (23bcbce).** Task 1's verify includes `npm run prebuild` (the i18n scan), which fails on both *unresolved* and *dead* keys — code and catalogue keys cannot be committed separately and leave the suite green. Task 2's verify (i18n tests) ran before the combined commit.

**[Rule 1 — bugs found by the e2e, fixed and committed with Task 3]:**
1. `A.tplPick` anchored the landed task to the create-form's `'p1'` fallback when no visible project existed — a ghost project ref the drawer's `canSee` gate silently refused. Now only a live, visible project anchors; otherwise the task lands unfiled.
2. `buildTaskRow` omitted the createTask field vocabulary (`labels`/`deps`/`attachments`/`desc`/…) the drawer reads unguarded — a fresh instantiation crashed drawer render with `Cannot read properties of undefined (reading 'length')`. Full vocabulary added; `test/templates.test.mjs` task-row key pin updated.

## Known Stubs

None — every surface is wired to the 66-02 store funnel.

## Self-Check: PASSED

- Commits 23bcbce, ce9a11a exist in git log
- All key-files exist on disk
- Full suite green at HEAD

## State updates

Executed via gsd state handlers (advance-plan, update-progress, record-metric, add-decision, record-session, requirements mark-complete TMPL-03, roadmap update-plan-progress).
