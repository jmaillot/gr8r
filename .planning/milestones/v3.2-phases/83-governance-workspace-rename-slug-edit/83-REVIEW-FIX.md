---
phase: 83-governance-workspace-rename-slug-edit
fixed_at: 2026-11-20T00:00:00Z
review_path: .planning/phases/83-governance-workspace-rename-slug-edit/83-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 83: Code Review Fix Report

**Fixed at:** 2026-11-20
**Source review:** .planning/phases/83-governance-workspace-rename-slug-edit/83-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (fix_scope: critical_warning — 0 criticals, 3 warnings)
- Fixed: 3
- Skipped: 0

**Verification:** all three phase suites (`node --test test/governance-rename.test.mjs test/governance-client.test.mjs test/i18n-toast.test.mjs` — 47 pass, 0 fail) AND the full `npm test` gate (2034 pass, 0 fail, 13 pre-existing skips) ran in the MAIN checkout (sequential mode, no worktree isolation — per the orchestrator config for this phase).

## Fixed Issues

### WR-01: Successful rename leaves the operator's own client workspace state on the dead slug

**Files modified:** `src/core/api.js`, `src/actions/actions.js`
**Commit:** 1086497b
**Applied fix:** Added `api.renameWorkspaceLocal(id, { name, slug })` (api.js, right after `operatorWsRename`), following the `patchWorkspace` reconcile precedent: maps `state.workspaces` by id and, when `state.workspace?.id === id`, updates `state.workspace` name/slug. Called in `A.govEditSave`'s success path immediately after `closeModal()` and before `refreshGovernanceWorkspaces()`, with a comment explaining the stale-slug 404 failure mode. The rename bumps no revision server-side (no doc write — D-06), so no revision reset was needed. This is a state-reconciliation change — flagged as requiring human verification of the logic per fixer protocol.

### WR-02: Unescaped `{ query }` interpolation into HTML in the governance empty-search states

**Files modified:** `src/pages/governance.js`
**Commit:** 9f37f946
**Applied fix:** Both filtered-empty states now escape the query at first render per the phase doctrine (T-79-10/T-83-07): `t('page.governance.noMatchesBody', { query: esc(q) })` (line 101) and `t('page.governance.noMatchesOpBody', { query: esc(q) })` (line 161). `esc` was already imported in governance.js.

### WR-03: Trail LIKE pattern leaves the `_` wildcard unescaped — over-broad match

**Files modified:** `server.js`, `test/governance-rename.test.mjs`
**Commit:** ecf6c7b1
**Applied fix:** Query B now reads `where action like 'group\_%:group:%' escape '\'` — the `_` in the literal `group_` prefix is escaped so the predicate pins the encoded-trail format exactly (`group_<delta>:group:<guid>:<reason>`); a route comment documents the hardening. Test updated in the same commit: the ordering test's synthetic rows moved from `group_x/group_y` (which only matched via the unescaped wildcard) to the real encoded format `group_membership_removed:group:{aaa,bbb}:guard-refused`, and a negative probe added — `groupX:group:zzz:guard-refused` is inserted and must NOT appear in the trail. No catalogue-size or verb-count pins changed (the new `renameWorkspaceLocal` makes no `call(...)`).

## Skipped Issues

None — all three in-scope findings were fixed.

---

_Fixed: 2026-11-20_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
