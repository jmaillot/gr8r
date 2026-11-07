---
phase: 49-visibility-model-collapse-grant-materialization
reviewed: 2026-11-07T00:00:00Z
depth: deep
files_reviewed: 11
files_reviewed_list:
  - server.js
  - mcp.js
  - test/error-codes.test.mjs
  - test/oidc-sso.test.mjs
  - test/helpers/visibility-fixture.mjs
  - test/visibility-migration.test.mjs
  - test/mcp.test.mjs
  - test/privacy.test.mjs
  - test/scope.test.mjs
  - docs/ProjectPermissions.md
  - docs/WorkspacePermissions.md
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 49: Code Review Report

**Reviewed:** 2026-11-07 (deep)
**Files Reviewed:** 11 (diff 2eec642..HEAD)
**Status:** issues_found

## Summary

The collapse itself (private flag ∨ `p.members`, admin bypass via `hiddenProjectIds`) is implemented consistently across server.js and the mcp.js mirror, and the boot sweep's grant/dissolve logic for `teams[]` intersections and Phase-29 scope payloads matches the retired predicate branch-by-branch (including the D-03 inversion and the scoped-lead dissolve). Full suite passes (1090 tests, 1079 pass, 11 skipped).

The defects are at the migration boundary: the sweep's "pre-sweep marker" detection misses the pre-Phase-32 scalar `p.team` representation, so a class of old workspaces silently loses team-derived visibility with no backup; and the retargeted assignee write-guard changes behavior for admin/owner assignees with a factually wrong comment justifying it.

## Critical Issues

### CR-01: Sweep misses the legacy scalar `p.team` marker — team-derived grants silently lost for pre-Phase-32 documents, no backup taken

**File:** `server.js:2194-2215` (sweepNeeded), `server.js:814-817` (normalizeProjects retirement), old code `2eec642:server.js:918-920`

**Issue:** `sweepNeeded` flags a workspace only for non-empty `p.teams` arrays, any `p.access` key, or non-NULL scope rows. It never checks for the legacy scalar `p.team` key. Before this phase, `normalizeProjects` migrated `p.team → p.teams` on every served/written copy (old server.js:918-920), and the retired `teamIntersects` predicate then granted team members visibility on the **normalized served copy** (`docForClient` → `normalizeDoc`/`normalizeProjects` before `redactDoc`). A stored document that has not been rewritten since that era still carries scalar `p.team`: the sweep sees no marker, returns false, and skips the workspace entirely — no grant materialization **and no pre-migration backup**. After the collapse, `normalizeProjects` no longer migrates the key, so members who could see a private team-linked project under the old predicate lose access silently, with no diagnostic. The byte-identity pin and the fixture do not cover this representation (no scalar `team` case in `test/helpers/visibility-fixture.mjs`).

**Fix:** Add the scalar marker to `sweepNeeded` and normalize it in the sweep, mirroring the retired migration:

```js
// sweepNeeded, per project:
if (p.team !== undefined) return true; // pre-Phase-32 scalar spelling grants via the old migration

// materializeVisibilityGrants, per project, before the pTeams computation:
let pTeams = Array.isArray(p.teams) ? p.teams.filter(t => typeof t === 'string' && t) : [];
if (p.team !== undefined) {
  const legacy = Array.isArray(p.team) ? p.team.filter(x => typeof x === 'string' && x)
    : typeof p.team === 'string' && p.team ? [p.team] : [];
  pTeams = [...new Set([...pTeams, ...legacy])];
  delete p.team;
}
```

## Warnings

### WR-01: Assignee write-guard blocks admin/owner assignees on private projects — behavior change justified by a factually wrong comment

**File:** `server.js:1060-1081` (mergeClientDoc guard), `server.js:4633` (error message)

**Issue:** The old guard skipped every assignee whose `projectScope` was null — which is always the case for admin/owner (D-04) — so admins could always be assigned. The new guard calls `memberCanReadProject`, which is `canSeeProject` only: a private project with the admin **not** on `p.members` now throws `assigneeOutOfScope` and 400s the whole doc PUT. The in-code comment claims "admin/owner assignees pass via canSeeProject's public/private handling" — they do not, for private projects outside their access list. This may be an intended tightening (it is consistent with `hiddenFor`, which also gives admins no private-project bypass), but if so the comment and the phase decision record must say so; if not, it is a regression for admin self-assignment and admin-managed private projects.

**Fix:** Either restore the exemption (`const isAdmin = ROLE_RANK[membership?.role] >= ROLE_RANK.admin; ... if (isAdmin && adminBypassIntended) continue;` per assignee role lookup), or correct the comment to state the intentional tightening and pin it with a test covering an admin assignee on a private project they are not a member of.

### WR-02: `sweepNeeded` short-circuits on an unreadable doc and drops the scope-row check — corrupt-document workspaces never get their scope columns cleared

**File:** `server.js:2194-2203`

**Issue:** The `catch { return false; }` returns before `return scopeRowCount > 0;` is reached. A workspace with a corrupt `doc` AND non-NULL scope rows is never marked as a candidate, so its scope columns are never cleared and no warning is logged. (The in-transaction parse-failure path has the same effect via early `return`, but it at least logs.) The old model still read the scope columns, so this is not a visibility hole, but the "columns cleared, dormant-on-disk" post-state (D-49-1) silently never happens for that workspace — every boot re-evaluates it, and the `migrateTenancy` fallback posture the comment cites does log its skips.

**Fix:** Make the scope check independent of doc parseability:

```js
function sweepNeeded(docText, scopeRowCount) {
  let doc = null;
  try { doc = JSON.parse(docText); } catch { /* fall through: scope check still applies */ }
  const projects = doc?.data?.projects;
  if (Array.isArray(projects)) { /* ...existing markers... */ }
  return scopeRowCount > 0;
}
```

### WR-03: A task referencing a dangling `project` id now rejects the entire doc PUT for every assignee

**File:** `server.js:1075-1079`

**Issue:** `projectById.get(t.project)` is `undefined` for a task whose `project` id matches no project in stored or next data. `memberCanReadProject(undefined, ...)` → `canSeeProject(undefined)` → `false` → throw. Under the old guard, workspace-wide (null-scope) assignees passed unconditionally, so a data-consistency blemish of this kind degraded gracefully. Now one dangling task reference makes every doc PUT in the workspace fail with `assigneeOutOfScope`, and the guard offers no repair path (the project row cannot be re-added through the API because the PUT keeps failing). Likelihood is low (project deletion removes tasks), but the failure mode is a hard workspace-wide write lockout.

**Fix:** Skip tasks whose project cannot be resolved, matching the old "underivable → keep flowing" posture used in `queueNotifEmails`:

```js
const project = projectById.get(t.project);
if (!project) continue; // dangling reference: nothing to derive visibility from
if (!(await memberCanReadProject(project, wsId, t.assignee))) { ... throw ... }
```

## Info

### IN-01: Sweep summary log overstates what happened when every transaction early-returned

**File:** `server.js:2395`

**Issue:** `visibility sweep: grants materialized in N workspace(s)` is logged even when all candidate workspaces skipped via the unreadable-doc early return (zero writes). An operator correlating this line with the WR-02 scenario would conclude the migration succeeded.
**Fix:** Count actual mutations (increment per non-skipped tx) and log the skip count separately.

### IN-02: `memberCanReadProject` retains its unused `wsId` parameter

**File:** `server.js:771-774`

**Issue:** `wsId` is dead since the team term was removed. Kept deliberately for signature stability (comment says so) and every caller awaits it — acceptable, but it is now a lie of an API: it suggests workspace-scoped resolution that no longer happens. Phase 51 should either drop the parameter or fold the MCP mirror's admin bypass in so there is one predicate, not two near-identical ones.
**Fix:** Schedule the signature prune for Phase 51 with the other scope-surface cleanup already planned there.

---

_Reviewed: 2026-11-07_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
