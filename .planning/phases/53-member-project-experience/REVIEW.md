---
phase: 53-member-project-experience
reviewed: 2026-11-09T00:00:00Z
depth: deep
files_reviewed: 18
files_reviewed_list:
  - server.js
  - mcp.js
  - src/actions/actions.js
  - src/actions/keyboard.js
  - src/actions/teams.js
  - src/core/store.js
  - src/features/teams.js
  - src/overlays/modals.js
  - src/pages/members.js
  - src/pages/project.js
  - src/pages/projects.js
  - src/views/project-overview.js
  - src/locales/en.json
  - src/locales/fr.json
  - test/perm.test.mjs
  - e2e/invite.spec.mjs
  - e2e/project-settings.spec.mjs
  - e2e/projects-table.spec.mjs
findings:
  critical: 1
  warning: 3
  info: 3
  total: 7
status: issues_found
---

# Phase 53: Code Review Report

**Reviewed:** 2026-11-09 (deep — server perm gate, guest validator, unified settings modal, data-in bindings, i18n hygiene traced across server.js ⇄ src/)
**Depth:** deep
**Files Reviewed:** 18
**Status:** issues_found

## Summary

The phase ships a coherent model: `projectPermFor` as the single content-write gate inside `mergeClientDoc`, a shared `validateGuestInviteShape` on all three guest-scope write paths, one unified `projectSettings` modal, and clean i18n gates (0 dead/0 stale, pins bumped with provenance). Tests are genuinely adversarial (byte-identical held rows, keyed refusals, MCP ceiling pin).

However, the headline server-side gate has a real authorization bypass: the per-task/per-file gate keys on the `project` field **of the incoming (client-controlled) row**, while `mergeList` replaces stored rows wholesale. A crafted doc-PUT from a below-edit member can either omit `project` (gate skipped entirely, stored row replaced) or re-point `project` at a project they can edit (destination-only check — content of a view-only project is rewritten under cover of a "move"). The comment gate got this right ("stored parent wins"); tasks and files did not.

Secondary concerns: the General tab of the unified modal did not inherit the concurrent-edit honesty the phase built for the Access tab, and 11 e2e failures at milestone close are labelled "pre-existing" although at least the flows/creation failures were introduced by in-phase 53-03/53-04 work (the bisect baseline `6e90e59` is post-53-03/53-04, pre-53-05 only).

## Critical Issues

### CR-01: Task and file perm gate keyed on the incoming row's `project` field — authorization bypass via crafted doc-PUT

**File:** `server.js:1152-1176` (task gate), `server.js:1196-1206` (file gate), interacting with `mergeList` at `server.js:1065-1083`

**Issue:** The content-write gate added in 53-01 evaluates `effFor(t.project)` using the **incoming** row's project:

```js
for (const t of nextData.tasks || []) {
  if (!t?.id || !t.project) continue;   // ← skip on client-controlled absence
  ...
  if (PROJECT_PERMS.indexOf(effFor(t.project)) < EDIT_RANK) permDeniedTasks.add(t.id);
}
```

Two bypasses for a member holding only 'Can view' (or nothing) on project B and 'Can edit' on project A:

1. **Omit `project`:** send `{id: 't_b', title: 'attacker text', status: 'done'}` (no `project`). The gate `continue`s; `mergeList` pushes the incoming row wholesale (no field-level merge with the stored row), so the stored task is **replaced** by the attacker's row — the gate never fires, and the row is corrupted (project binding stripped) with attacker-controlled content. Since the redacted doc the client legitimately holds contains B's tasks, the attacker replays full row content plus their edits.
2. **Destination-only move check:** send the full stored row with `project` changed to A. The gate checks `effFor(A)` (≥ edit → passes) and the task moves out of the view-only project B with attacker-modified fields. There is no source-project check: editing/moving content **out of** B requires no B-edit tier, defeating the gate's purpose.

The identical shape exists in the file gate (`if (!f?.id || !f.project) continue;`) and, more weakly, in the comment gate (`if (!c?.id || !c.task) continue;` — a comment row stripped of `task` skips gating and replaces the stored row).

The delete-hold loop and the comment gate already demonstrate the correct pattern (delete-hold reads the **stored** `t.project`; comments rule "stored parent wins"). Tasks and files simply don't apply it.

**Fix:** gate on the stored row's project (fail closed when unknown), and refuse rows that drop the binding:

```js
for (const t of nextData.tasks || []) {
  if (!t?.id) continue;
  if (hiddenProjects.has(t.project) || reservedTasks.has(t.id)) continue;
  const prev = storedTasksById.get(t.id);
  if (prev && !changed(prev, t)) continue;
  // Gate on BOTH endpoints: source (stored) and destination (incoming).
  const srcProj = prev?.project || t.project;
  const dstProj = t.project || srcProj;
  const worst = Math.min(
    PROJECT_PERMS.indexOf(effFor(srcProj || '\u0000none')),
    PROJECT_PERMS.indexOf(effFor(dstProj || '\u0000none')),
  );
  if (worst < EDIT_RANK) permDeniedTasks.add(t.id);
}
```

(unknown pid already fails closed: `permProjects.get(pid)` is `undefined` → `projectPermFor` returns 'Can view'). Mirror for files; for comments, deny `!c.task` rows that differ from their stored counterpart instead of skipping them. Add a perm.test.mjs row: member-Can-view PUTs a task row with `project` deleted → `projectPermDenied`, stored row byte-identical.

## Warnings

### WR-01: Unified modal's General tab lacks the concurrent-edit honesty built for the Access tab (T-53-08 not applied to `submitProject`)

**File:** `src/actions/actions.js:1565-1610` (`A.submitProject` edit branch)

**Issue:** The Access-tab handlers (`IN.teamPerm`, `IN.shareAccess`, `A.shareTeamInvite/Remove`) all do `snapshot()` → mutate → `pushNow()` → `restore(snap)` + the dedicated `modal.settingsConflict` toast on 409 — the phase's headline T-53-08 behavior. The General-tab edit path is a bare optimistic `mutate` + `Object.assign` + immediate `toast(t('toast.projectUpdated'))` with no `pushNow`, no snapshot, no restore: the success toast is shown before the (450ms-debounced) push settles, and a revision conflict falls through to the generic conflict-banner machinery *after* the user was told the save succeeded. Two tabs of the same "unified" modal behave inconsistently on the exact scenario the phase claims to handle honestly.

**Fix:** give the edit branch the same skeleton as `IN.teamPerm` (`const snap = snapshot()` before mutate; `const res = await pushNow()`; on `!res.ok` → `restore(snap)` and `toast(res.status === 409 ? t('modal.settingsConflict') : t('err.cannotChangeAccess'), { kind: 'err' })`), and only toast success + close the modal after the push settles.

### WR-02: 11 e2e failures at milestone close are mislabeled "pre-existing" — at least 4 were introduced in-phase by 53-03/53-04

**File:** `.planning/phases/53-member-project-experience/deferred-items.md`; bisect baseline `6e90e59` (post-53-03/53-04, pre-53-05)

**Issue:** The close-out bisection only proves the failures pre-date plan 05 — they sit squarely **inside** the phase. The deferred note itself concedes "Likely casualties of 53-03/53-04 (share-modal removal changed the flows.spec UAT-04 surface)": `flows` share-modal/creation ×4 are direct regressions of the in-phase modal rewrite, and `locale ×2`, `tenancy ×4`, `french-overflow ×1` are untriaged. A milestone verification gate that reports "unit suite 0 fail" while 10% of e2e is red — with the phase's own rewrite named as the likely cause — is not an honest green.

**Fix:** before v2.1 ships, rework `flows.spec.mjs` UAT-04 against the unified `projectSettings` modal (the 53-03 replacement surface) and triage the tenancy/locale/french-overflow failures; either fix or reclassify each with evidence it predates v2.0.

### WR-03: Admin guest invites to a toggle-off project are minted successfully and are dead on arrival

**File:** `server.js:5430-5441` (create path, admin branch) vs `server.js:~5636-5655` (accept path)

**Issue:** For member-tier inviters the `allowInviteGuests` toggle is enforced at create (fail fast, 400). For admin/owner inviters the create branch (`else if (role === 'viewer')`) only checks the project exists — deliberately, per the comment — but the accept path re-derives the toggle **for every** viewer invite with no inviter-tier distinction. Result: an admin inviting a guest to a project with `allowInviteGuests !== true` gets a 201, a shareable join link, and a stored invite row that 403s (`inviteGuestToggleOff`) on every accept attempt, unconsumed. No security issue (fail-closed), but it manufactures dead invites and a confusing failure the inviter cannot see coming.

**Fix:** in the admin/owner viewer branch, resolve the current project and refuse at create when `project.allowInviteGuests !== true` (keyed 400, e.g. reusing `inviteGuestToggleOff`), or exempt admin-minted invites from the accept-time toggle re-derivation — pick one semantics and apply it on both paths.

## Info

### IN-01: `PROJECT_PERMS` (server.js:869) and `PERMS` (src/overlays/modals.js:197) are duplicated literals with no drift guard

**File:** `server.js:869`, `src/overlays/modals.js:197`

**Issue:** The duplication is acknowledged (server never imports client modules), but nothing pins the two lists equal. A future tier added on one side only silently misranks on the other (client renders options the server sweeps as non-PERMS values, or vice versa).

**Fix:** add a cheap unit assertion (read both files' literals in a test and `assert.deepEqual`) so the mirror cannot drift unnoticed.

### IN-02: `toast.permChanged` interpolates the raw stored perm value, not the localized label

**File:** `src/actions/actions.js:1924` (`IN.teamPerm`)

**Issue:** The new per-team dropdown toast shows the stored English string (`'Can edit'`) in the FR locale. This matches the pre-existing member-perm call site (`actions.js:1878`), so it is consistent — but the codebase already has `permLabel()` in modals.js; the FR toast reading "eng : Can edit" is a locale leak.

**Fix:** pass the localized label (`permLabel`-equivalent via `t('common.perm.' + PERM_KEYS[el.value])`) at both call sites when touching this area.

### IN-03: `changed()` equality is `JSON.stringify`-based — key-order sensitive

**File:** `server.js:1150` (`const changed = (a, b) => JSON.stringify(a) !== JSON.stringify(b)`)

**Issue:** A semantically identical row with reordered keys counts as "changed", pushing it through gate evaluation (and potentially a spurious refusal). The failure direction is safe (never under-gates), but reordered keys from a legitimate client could produce refusal noise that e2e asserting `refused: []` would catch as false failures.

**Fix:** acceptable as-is given client docs are JSON round-trips of the same stored shape; if refusal noise ever appears, compare normalized (sorted-key) serializations.

---

_Reviewed: 2026-11-09_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
