---
phase: 51-client-surfaces-permissions-page-removal-project-creation
reviewed: 2026-11-08T00:00:00Z
depth: standard
files_reviewed: 31
files_reviewed_list:
  - DEPLOY.md
  - docker-compose.yml
  - docs/ProjectPermissions.md
  - docs/WorkspacePermissions.md
  - .env.example
  - MCP.md
  - package.json
  - README.md
  - scripts/i18n-scan.mjs
  - server.js
  - src/actions/actions.js
  - src/core/store.js
  - src/locales/en.json
  - src/locales/fr.json
  - src/overlays/modals.js
  - src/pages/errors.js
  - src/pages/members.js
  - src/pages/project.js
  - src/pages/projects.js
  - src/pages/settings.js
  - test/catalogue.test.mjs
  - test/client-surfaces.test.mjs
  - test/i18n-core-features.test.mjs
  - test/i18n-modal.test.mjs
  - test/i18n-pages.test.mjs
  - test/i18n-scan.test.mjs
  - test/i18n-shell.test.mjs
  - test/i18n-toast.test.mjs
  - test/privacy.test.mjs
  - test/project-creation.test.mjs
  - test/visibility-team.test.mjs
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 51: Code Review Report

**Reviewed:** 2026-11-08
**Depth:** standard
**Files Reviewed:** 31
**Status:** issues_found

## Summary

The phase's server-side work is solid: `permCreate` enforcement reads the STORED doc per request (`server.js:1036`), the scoped `projectCreateForbidden` refusal rides the 200 body (`server.js:4747`) without failing the whole PUT, below-admin PUTs pin `next.prefs.permCreate` back to the stored value (`server.js:1160-1162`), lead-on-create is enforced server-side (`server.js:1068-1072`), and the redact/merge funnel keeps hidden rows unresurrectable. `A.submitProject`'s refusal handling is correct — `pushNow()` resolves the `api.putWorkspace` result whose 200 body is `{revision, refused}` (verified `api.js:405-411`, `api.js:59-94`), so `res.data?.refused` (actions.js:1618) sees the keyed refusal. The dead-key detector is genuinely effective (`walk()` in i18n-scan.mjs:1427-1433 takes only `.js`, so the locale catalogues cannot self-reference), is allow-listed with per-entry call-site comments, and is wired into the exit contract (i18n-scan.mjs:1643-1671) with real test coverage. Both end-to-end suites pin stored-doc state, not echoed requests.

The one serious defect is on the relocated settings surface: the permCreate toggle renders for every role with its checked state inverted relative to its own label. Three warnings follow: the share-modal handlers break in local (no-API) mode, the create-restriction gate only covers one of seven create affordances, and `A.submitProject` reports success on a failed push.

## Critical Issues

### CR-01: permCreate toggle renders for ALL roles with inverted checked-state semantics (label says the opposite of what checked means)

**File:** `src/pages/settings.js:299` (with `src/locales/en.json:1230`, `src/pages/settings.js:83-84`, `src/actions/actions.js:2846-2849`)
**Issue:** Two compounding defects on the surface this phase created:

1. **Inverted semantics.** The row renders `tog('permCreate', P.permCreate === true)` under the label `settings.perms.create` = "Members can create projects". Under the phase-wide `=== true` polarity, checked ⇔ creation is **restricted** — yet the label reads as if checked ⇔ members **can** create. (The legacy `!== false` polarity meant checked ⇔ allowed, which matched the label; the 51-03 realignment flipped the boolean's meaning without flipping the label or the control's direction.) An admin wanting to open creation to members will uncheck the box and thereby *restrict* it, and vice versa. The docs make the trap worse: WorkspacePermissions.md:61 still describes the setting as « Les membres peuvent créer des projets ».
2. **No role gate.** The toggle is rendered unconditionally — line 299 sits outside the `wsAdmin` conditional that gates the neighboring workspace controls (settings.js:286-298). Any Member/Guest sees an editable, server-meaningful workspace control. `IN.prefToggle` optimistically flips `S.prefs.permCreate` locally; the server pins the stored value for below-admin PUTs (server.js:1160-1162) — silently, with no refusal and no feedback — so the member's UI shows a state the server discarded, and the client-side gate (`projects.js:30`) reads the stale optimistic value until the next poll hydrate.

Server enforcement is not bypassed by this (verified), but the control is wrong-facing and mislabeled.

**Fix:**
```js
// settings.js — gate on rank and invert checked to match the label
${wsAdmin ? `<div class="sblock">${srow(t('settings.perms.create'), '', tog('permCreate', P.permCreate !== true))}</div>` : ''}
```
…and pick ONE of: (a) keep the label "Members can create projects" with `checked ⇔ allowed` (`P.permCreate !== true`), or (b) relabel the key (e.g. "Restrict project creation to admins") and keep `checked ⇔ P.permCreate === true`. Update the relocations in WorkspacePermissions.md §61 to match. If keeping the control admin-only, also verify `IN.prefToggle` ignores `permCreate` writes from below-admin ranks for defense in depth.

## Warnings

### WR-01: Share-modal handlers revert and error-toast in local (no-API) mode — `pushNow()` unconditionally returns `{ok:false, status:0}` there

**File:** `src/actions/actions.js:1872-1877` (also 1749-1754, 1767-1772; root cause `src/core/store.js:163`)
**Issue:** `pushNow()` returns `{ ok: false, status: 0 }` whenever `!api.enabled`. `IN.shareAccess`, `A.shareTeamInvite`, and `A.shareTeamRemove` all follow the optimistic flip with `if (!res.ok) { restore(snap); toast(err) }`. In local/demo mode (`api.enabled === false`) — a first-class mode the store explicitly supports (D-08 localStorage comments) — every private/public toggle and every team link/unlink instantly reverts and shows the localized error toast. The success toast fires first, then the error toast contradicts it. The phase moved these handlers onto pushNow; the local-mode branch was not considered.
**Fix:** In each of the three handlers, treat only a *server* failure as failure, e.g.:
```js
const res = await pushNow();
if (api.enabled && !res.ok) { restore(snap); render(); toast(t('err.cannotChangeAccess'), { kind: 'err' }); }
```
(or add `const localMode = res.status === 0 && !api.enabled;` — but note `status: 0` is also returned on network failure when enabled, so keying off `api.enabled` is the honest branch).

### WR-02: Create-restriction gate covers only 1 of 7 `A.newProject` entry points

**File:** `src/pages/projects.js:30-32` (ungated callers: `src/pages/home.js:42`, `src/pages/overview.js:25`, `src/shell/layout.js:126`, `src/overlays/palette.js:19`, `src/overlays/popovers.js:131`, `src/pages/design-system.js:172`, `src/actions/keyboard.js:270`)
**Issue:** The `createRestricted` check (role below admin + `S.prefs.permCreate === true`) disables only the Projects-page header button. The keyboard shortcut `P` (keyboard.js:270), command-palette entry (palette.js:19), the `+` icon button in the sidebar group header (layout.js:126), the Home and Overview hero buttons, the quick-create popover item, and the design-system demo card all call `A.newProject()` (actions.js:1477) with **no gate in the action itself**. A restricted member gets the full create modal everywhere except the Projects page; submitting hits the server refusal, and the D-51-14 comment's claim ("the disabled affordance above is UX only") describes an affordance that exists on one page out of seven. The server still refuses (defense in depth holds — no security issue), but the UX contract stated in the docs (ProjectPermissions.md:70 "un membre sous admin voit le bouton de création désactivé… jamais caché") is not what ships.
**Fix:** Gate inside the action so all entry points are covered at once:
```js
A.newProject = () => {
  if (S.prefs.permCreate === true && !['Owner', 'Admin'].includes(me()?.role || '')) {
    return toast(t('err.projectCreateForbidden'), { kind: 'err' });
  }
  /* …existing body… */
};
```
then the projects.js disabled button remains the tooltip-bearing affordance and the other entry points degrade honestly.

### WR-03: `A.submitProject` reports success when the push failed for any non-refusal reason

**File:** `src/actions/actions.js:1610-1627`
**Issue:** The refusal branch is correct, but every other pushNow failure shape falls through to the success path: modal popped, navigation to the optimistic project, "created" toast. pushNow returns `{ok:false, status:0}` on network failure, on `S.ui.conflict` already set, on a hung in-flight PUT exceeding the 5s deadline, and when no workspace slug is loaded (api.js:407) — in all of these nothing was persisted, yet the user is navigated into a project that vanishes on the next hydrate. The code comment says "a generic sync failure keeps its existing handling (the conflict banner machinery)" — but pushNow's early-return shapes bypass the conflict banner entirely (it is only set for 409/401/403 at store.js:188, and was often already set). There is no banner and no revert: a silent false success.
**Fix:**
```js
const res = await pushNow();
const refused = Array.isArray(res.data?.refused) ? res.data.refused.map(r => r?.code || r) : [];
if (refused.includes('projectCreateForbidden')) { /* …existing revert… */ }
if (!res.ok) return; // keep the optimistic insert, but do NOT pop the modal / navigate / success-toast
```
(or surface an explicit error toast for the `ok:false` case).

## Info

### IN-01: Stale file:line citation in ProjectPermissions.md

**File:** `docs/ProjectPermissions.md:69`
**Issue:** Cites "canal de réponse server.js:4686" for the refusal channel; the actual `{revision, refused}` response is at `server.js:4747` (4686 is inside the refusal-collection region, not the response canal). The doc's own contract is file:line-verifiable claims, so the drift undermines its purpose.
**Fix:** Update to `server.js:4747`.

### IN-02: permCreate toggle's accessible label is the raw key, not localized copy

**File:** `src/pages/settings.js:299` (via `tog()` at settings.js:83-84)
**Issue:** `tog()` emits `aria-label="${k}"` — for the relocated row this renders literally as `aria-label="permCreate"` in the a11y tree. The phase moved this control onto a user-facing page with a localized title right beside it; the screen-reader label is an internal identifier. (Pre-existing helper pattern, but this phase relocated and re-purposed the row, so it inherits the fix.)
**Fix:** Extend `tog` to accept a label (or reuse the row title): `tog('permCreate', P.permCreate !== true, 'pref', t('settings.perms.create'))` and emit that as the `aria-label`.

---

_Not reviewed as defects:_ the 11 test files in scope are reliable (stored-doc assertions, inline expectations, per-process DOM shim in client-surfaces.test.mjs:160-176); package.json version pin (1.1.1) matches docker-compose image tag; docker-compose/.env.example carry no secrets (MASTER_KEY/ADMIN_PASSWORD enforced via `:?` interpolation).

_Reviewed: 2026-11-08_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
