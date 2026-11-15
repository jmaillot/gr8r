---
phase: 66-task-project-templates
reviewed: 2026-11-15T00:00:00Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - e2e/templates.spec.mjs
  - mcp.js
  - server.js
  - src/actions/actions.js
  - src/actions/templates.js
  - src/core/store.js
  - src/core/templates.js
  - src/features/assignee-pick.js
  - src/features/file-preview.js
  - src/features/template-ui.js
  - src/locales/en.json
  - src/locales/fr.json
  - src/main.js
  - src/overlays/context-menu.js
  - src/overlays/modals.js
  - src/pages/settings.js
  - test/build-chunk-size.test.mjs
  - test/error-codes.test.mjs
  - test/i18n-core-features.test.mjs
  - test/i18n-overlays.test.mjs
  - test/i18n-shell.test.mjs
  - test/i18n-toast.test.mjs
  - test/mcp.test.mjs
  - test/templates.test.mjs
findings:
  critical: 0
  warning: 6
  info: 6
  total: 12
status: issues_found
---

# Phase 66: Code Review Report

**Reviewed:** 2026-11-15
**Depth:** standard
**Files Reviewed:** 24
**Status:** issues_found

## Summary

Phase 66 lands `doc.templates[]` end-to-end: a pure sanitizer/funnel sink (`src/core/templates.js`) shared by the server merge path, the read path and the MCP `writeDoc` mirror; a single-doc-PUT instantiation action (`src/actions/templates.js`); and the lazy template UI chunk (`src/features/template-ui.js`). The core layer is solid — the whitelist-drop sanitizer is correct, the D-03 position renumber is rank-preserving and idempotent, the embedded-tree gate pre-heals with `validateSubtree` and the parentId remap in `buildSubtaskRows` correctly avoids the Phase 65 flattening trap. The node suite covers the pure layer thoroughly and the e2e specs exercise both instantiation paths through the real funnel.

The defects found are concentrated in the UI action layer: a modal-stack bug in the editor delete path, an optimistic-close pattern that can destroy a user's draft on a transient push failure, missing `.catch` on two new dynamic imports (inconsistent with the template openers written in the same phase), a select-default/stored-state mismatch, and one funnel asymmetry with the Phase 65 subtask gate. No security issues: every template-authored string that reaches markup passes `esc()`, and the sanitizer's D-14 whitelist blocks assignee/lead/member smuggling into template bodies.

## Critical Issues

_None found._

## Warnings

### WR-01: Editor delete pops the confirm modal but leaves a stale editor modal behind

**File:** `src/features/template-ui.js:398-447`
**Issue:** `A.tplEditorDelete` opens a `confirmDlg` (which pushes a `confirm` modal onto `S.ui.modals`, see `actions.js:307-310`) on top of the `templateEdit` modal. Its `run` calls `A.tplDeleteConfirm`, which executes `S.ui.tplEditor = null; closeModal();` (lines 434-437). `closeModal()` pops the LAST modal — the confirm dialog — leaving `templateEdit` on the stack rendering `templateEditModal` with `S.ui.tplEditor === null`, i.e. the empty "New template" stub branch (line 152). After confirming a delete from the editor, the user is left staring at an empty modal instead of returning to Settings.
**Fix:** Close the editor modal deliberately before/with the confirm, e.g. pop the editor explicitly (pop while `S.ui.modals[S.ui.modals.length-1].type === 'templateEdit'` after the confirm closes), or route the editor delete through a dedicated action that nulls `tplEditor` and pops both modals:

```js
A.tplDeleteConfirm = async el => {
  ...
  if (S.ui.tplEditor?.id === id) {
    S.ui.tplEditor = null;
    // pop the confirm (top), then the editor underneath
    while (S.ui.modals.length && S.ui.modals[S.ui.modals.length - 1].type !== 'templateEdit') closeModal();
    if (S.ui.modals[S.ui.modals.length - 1]?.type === 'templateEdit') closeModal();
  }
  ...
};
```

### WR-02: `A.tplSave` closes the editor before the push settles — a transient failure destroys the edited draft

**File:** `src/features/template-ui.js:388-397` (with `src/actions/templates.js:33-64`)
**Issue:** `A.tplSave` calls `A.saveTemplate(record)` without awaiting, then immediately nulls `S.ui.tplEditor` and closes the modal. `A.saveTemplate` runs its optimistic mutate synchronously, then awaits `pushNow()`; on `!res.ok` it calls `restore(snap)` and toasts "Could not save the template". At that point the modal is closed and `S.ui.tplEditor` is null — the user's entire draft (potentially a large project tree with offsets) is unrecoverable, even though the failure may be a momentary network hiccup. Contrast `A.submitProject` (`actions.js:1761+`), which keeps the modal open on refusal. The same applies to `A.tplEditorDelete`'s fire-and-forget `await` inside `confirmDlg.run` (that one is awaited, but see WR-01).
**Fix:** Either await the save before closing (`A.tplSave = async () => { ... await A.saveTemplate(record); ... }` and let `A.saveTemplate` signal success), or keep the draft alive on failure: on `!res.ok`, restore `S.ui.tplEditor` from `record` and reopen the editor instead of leaving it nulled.

### WR-03: New lazy-modal openers in `actions.js` have no `.catch` — chunk-load failure is a dead button and an unhandled rejection

**File:** `src/actions/actions.js:620-627, 1174-1188`
**Issue:** `A.assigneePickOpen` and `openFilePreview` (added by 66-03) do `import('../features/assignee-pick.js').then(...)` / `import('../features/file-preview.js').then(...)` with no rejection handler. If the chunk fails to load (offline, deploy race after a cache miss), nothing opens, the promise rejection is unhandled, and the user gets zero feedback. The sibling openers written in the same phase (`A.saveAsTemplate` / `A.openTemplatePicker`, `src/actions/templates.js:130-157`) do exactly this correctly with `.catch(() => toast(...))` — the asymmetry is a defect, not a style choice.
**Fix:**

```js
import('../features/assignee-pick.js')
  .then(m => { S.ui.apMod = m; openModal({ type: 'assigneePick' }); })
  .catch(() => toast(t('err.chunkLoadFailed'), { kind: 'err' }));
```

(Same for `openFilePreview`; add a catalogue key or reuse an existing generic failure toast.)

### WR-04: Priority select displays `medium` for a stored unset priority — UI state diverges from what is saved

**File:** `src/features/template-ui.js:190` (with `src/core/templates.js:318` and `src/core/templates.js:458`)
**Issue:** The task-kind editor renders `${(d.body.priority || 'medium') === p.id ? 'selected' : ''}` — an unset `body.priority` shows `medium` as selected. If the user never touches the select, `sanitizeTaskBody` drops the absent field and instantiation defaults the landed task to `priority: 'none'` (`buildTaskRow`, `templates.js:302,318`). The user picked (visually) "medium" and gets "none". Same divergence exists in reverse for `templateFromItem`: a live task with `priority: 'none'` yields a draft whose select shows `medium`.
**Fix:** Select an explicit default at draft-creation time instead of render time — set `body.priority = 'medium'` in `A.tplNew` (`template-ui.js:226`) and in `templateFromItem` (or default the select to `'none'`), so the rendered selection always matches the stored value.

### WR-05: Templates write gate lacks the Phase 65 "unchanged tree" skip — one poisoned stored template permanently 400s every doc PUT

**File:** `server.js:1355-1361` (compare `server.js:1335-1353`)
**Issue:** The Phase 65 subtask gate inside `mergeClientDoc` skips validation when a task's subtasks are unchanged versus the stored doc (`subSig65` compare, `continue`). The new templates sink runs `normalizeTemplatesData(next.data, uid)` with `gate: true` on EVERY PUT and re-validates every embedded tree unconditionally. All current write paths gate, so a stored cyclic template requires an out-of-band writer (direct DB edit, migration bug) to exist — but then the blast radius is a lockout: a client whose localStorage snapshot predates the read-path heal (e.g. it was captured while offline) PUTs the cyclic copy back and every subsequent save of that session fails with 400 `subtaskCycle` until a full reload re-hydrates. The tasks gate solved this exact class with the signature skip; the templates gate should mirror it rather than rely on "no writer can produce this today".
**Fix:** Mirror the `subSig65` pattern: compare each incoming template's embedded-tree signature against the stored record and skip the gate for unchanged trees (the sink still heals them via `normalizeTaskSubtasks`).

### WR-06: `KEY.tplAddSub` accepts an empty title and pushes a blank subtask row

**File:** `src/features/template-ui.js:379-385`
**Issue:** Pressing Enter on the add-subtask input with an empty (or whitespace-only) value still pushes `{ title: '' }` into the draft tree. The user gets a phantom empty node rendered by `treeHtml` with no way to know why. The analogous live-task handler in `actions.js` guards the same input pattern; this one does not.
**Fix:** Guard the push: `const title = el.value.trim(); if (!title) return;` before `list.push(...)` (and clear the input via the re-render, which already happens).

## Info

### IN-01: Duplicate dead `IN;` statements

**File:** `src/features/template-ui.js:263-265`
**Issue:** Two consecutive no-op statements `IN; /* comment */` and the real handler block after them — leftover scaffolding noise.
**Fix:** Delete the two bare `IN;` statements and keep one comment.

### IN-02: Two parallel caching mechanisms for the same lazy chunk

**File:** `src/actions/templates.js:27,130-134` and `src/features/template-ui.js:222` vs `src/pages/settings.js:504-513` / `src/overlays/modals.js:110-118`
**Issue:** The template chunk is cached both in the `templateUi.openEditor` registry (`actions/templates.js`) and in `S.ui.tplUi` (settings/modals). Two sources of truth for "is the chunk loaded"; the registry exists only because `A.saveAsTemplate` needs a sync handle. Keep one (`S.ui.tplUi`) and read it in both openers.
**Fix:** Collapse the registry into the existing `S.ui.tplUi` cache (checking `S.ui.tplUi?.openEditor` before importing).

### IN-03: MCP templates uid factory uses the subtask prefix for template-record ids

**File:** `mcp.js:222`
**Issue:** `normalizeTemplatesData(doc.data, () => uid('s'))` — the injected factory is used both for embedded subtask ids AND for template record ids (`sanitizeTemplate` id fallback), so an MCP-healed template record gets an `s…` id while every client-created template uses `tpl…`. Harmless (ids are opaque) but inconsistent and mildly misleading in audits/exports.
**Fix:** Pass a prefix-aware factory: `p => uid(p === 'tpl' ? 'tpl' : 's')` (or simply `() => uid('tpl')` for the record layer if the sink splits factory use).

### IN-04: `saveAsTemplate` captures the localized "no description" placeholder as real description text

**File:** `src/core/templates.js:448` (with `src/actions/actions.js:1741`)
**Issue:** `createProject` seeds `desc: f.desc || t('common.noDescriptionYet')`. `templateFromItem('project', ...)` copies `it.desc` verbatim into `body.description`, so a project created without a description yields a template pre-filled with the catalogue placeholder sentence as if it were real content.
**Fix:** Filter the sentinel: skip `description` when it equals the placeholder, or stop persisting the placeholder in `createProject` (store `''`).

### IN-05: Brittle source-string assertions pin the action module

**File:** `test/templates.test.mjs:748-756`
**Issue:** The D-15 discipline test counts literal occurrences of `await pushNow()` in the source. Any refactor (an extra awaited call inside a helper, or even a comment containing the string) silently breaks or falsifies the pin, and the count `2` is asserted without saying which actions it covers. It also greps `createTask` only — a `createProject` loop or per-task `D().tasks.push` outside `landInstantiation` would pass.
**Fix:** Prefer structural pins (e.g. export the actions and assert call graphs) or, minimally, assert the count per action with a comment naming the two writers, and extend the forbidden-call list to `createProject`/`logAct` loops.

### IN-06: e2e offsets recomputed with a private copy of `offsetIso`

**File:** `e2e/templates.spec.mjs:27-32`
**Issue:** The spec re-implements the day math and notes it "mirrors core/templates.js". If the production arithmetic ever changes (e.g. UTC anchoring), the test's ground truth drifts independently and can pass/fail wrongly. Acceptable for e2e isolation, but a one-line comment link to the exact source line, or importing the helper from the core module (it is pure), would keep them honest.
**Fix:** `import { offsetIso } from '../src/core/templates.js'` is not possible (not exported); either export the pure helper or add a pinned-parity unit test asserting the e2e copy matches `capturedDay`/`offsetIso` output for a fixed date.

---

_Reviewed: 2026-11-15_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
