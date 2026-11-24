# Phase 95: Settings Polish + Cross-Workspace Pickers + Project Overwrite Restore - Research

**Researched:** 2026-11-24
**Domain:** GR8R restore-engine extension (doc-contained projects), Settings surfaces, cross-workspace operator pickers
**Confidence:** HIGH (all claims verified by direct file reads this session)

## Summary

The single most important discovery: **projects do NOT live in a `projects` table — every project lives inside its workspace's `workspaces.doc` JSON document** (`data.projects`, `data.tasks`, `data.comments`, `data.files`, `data.teams`, `data.projOrder`, `data.activity`, `data.events`, `data.notifs`, `data.savedViews`) [VERIFIED: export/restore.js:1471-1594, export/backup.js:718-732]. A project-scope archive is produced by `runExport` by walking every workspace doc and keeping only `doc.files` records whose `record.project === scope.id` for blobs, while the TABLE dumps are the same full-table ndjson for every scope kind [VERIFIED: export/backup.js:713-732]. Project restore-as-new already works by *doc splicing*: `restoreImportAsNew` with `plan.kind === 'project'` appends the archive fragment arrays onto the target workspace's stored doc inside one tx [VERIFIED: export/restore.js:1134-1147, 1175-1178].

BKRST-05 therefore generalizes cleanly: a project overwrite is **not a row-replacement across tables — it is a FRAGMENT REPLACEMENT inside the target workspace's doc**: delete the live target project's tasks (recursively, `deleteTasks` idiom [VERIFIED: src/actions/actions.js:1899-1911]), comments, files, project entry, projOrder ref, and its activity/events entries (D-01), then splice the archive fragment in with **ids verbatim** and blobs swapped, inside ONE tx, riding the existing `restoreOverwriteUnit` guard chain (snapshot-first P7, scope-kind re-check, totality pre-check, blob swap + repair net, FTS diff sync, pre-commit verification) [VERIFIED: export/restore.js:1353-1775]. There is no `workspace_id` column to remap for doc-contained data — the "workspace_id remapped" success-criteria phrase is realized by *which doc the fragment lands in* (the target workspace's doc). The roster/`memberships`/`invites` machinery of the workspace overwrite unit is NOT involved for project scope.

All other phase surfaces are small, well-anchored deltas over verified idioms: purge = `DELETE FROM api_keys WHERE user_id = ? AND revoked_at IS NOT NULL` + one append-only `audit_log` insert; My Access gains a card grid fed by additive `icon`/`color` fields (and cross-workspace grouping needs a payload decision — see Open Questions); Run-now workspace picker swaps `api.workspace` for the phase-92 `api.backupScopes()` payload; Edit-Teams needs the chip action renamed from `invTeamToggle` to the `mteamToggle` contract; Workspace URL is a one-line CSS/ellipsis fix at src/pages/settings.js:304.

**Primary recommendation:** extend `restoreOverwriteUnit` in place (branch on `scope.kind === 'project'` inside the existing unit rather than a new unit) so snapshot/lock/staging/repair/verification discipline is inherited for free; keep every new refusal keyed and reused through the existing `restoreToast` vocabulary ×5 locales.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Overwrite = TOTAL replacement of the target project. The replaced project's favorites, comments and activity are deleted with it; the archive supplies its own data. The pre-restore workspace snapshot (89-05 idiom) is the disaster-recovery path. — Reversibility: costly.
- **D-02:** Target selection + confirmation: the SAME drawer picker as "Restore as new" gains project-level selection (projects of the chosen workspace), then a confirm-phrase the operator types matching the target project's CURRENT name (89-05 confirmName idiom, server-validated against the live row). Both CTAs offered for project archives: "Restore as new" and "Overwrite".
- **D-03:** Name/slug collision in the target workspace = TYPED REFUSAL (`restoreNameCollision` ×5) naming the conflicting projects. NO auto-suffix.
- **D-04:** The global restore lock (one restore at a time, all triggers) applies unchanged.
- **D-05:** Permissions identical to "Restore as new": Super Admin bypass (phase 94 ruling) + Restore Operator with workspace membership; Backup Operator excluded.
- **D-06:** Backup runs of the replaced project stay in the history — operational journal, not a live-data index.
- **D-07:** Grid of project CARDS with the project's own colored icon (dashboard project-card idiom), replacing the tick icon. Grouped by workspace with a per-group subtitle. Workspaces with NO projects are hidden. Cards are READ-ONLY.
- **D-08:** Roles shown as a discreet badge on each card where relevant.
- **D-09:** Purge button uses the 2-click confirm idiom (ask → confirm, same as apiKeyRevoke); button only rendered when revoked keys exist. Owner's own keys only.
- **D-10:** Server: purge DELETES the revoked-key rows; the append-only audit trail keeps the purge event (no key values anywhere). After purge the table simply stops showing them; toast confirms "N keys removed".
- **D-11:** The Run-now (Backup) workspace picker aligns on the phase-92 scopes payload. Navigation and workspace switcher stay byte-unchanged for everyone (`workspacesForUser` grep gate stands).
- **D-12:** Invite Member > Edit Teams uses the SAME contract as Teams > Edit team: mteamToggle chips + teamPickOpen selectable picker.
- **D-13:** Single line via ellipsis + full URL in a hover tooltip (no marquee).

### the agent's Discretion
- Exact card sizing/spacing for the My Access grid (existing design tokens)
- Server route shape for the purge endpoint and its rate limit
- Project-overwrite pipeline internal staging (extend restoreOverwriteUnit vs new restoreProjectOverwriteUnit)

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| XWS-01 | Operators see all workspaces in Backup & Restore scope pickers only; `workspacesForUser` byte-unchanged | Phase-92 `GET /api/backup/scopes` already returns all active workspaces to the three roles [VERIFIED: server.js:8852-8864]; Run-now card is the only picker still on `api.workspace` [VERIFIED: src/pages/backup.js:62-67]; `membershipsOf` (the "workspacesForUser" of the gate comment) sits at server.js:1281 and must not be touched |
| SET-01 | My Access project icons / better overview | Current render is one flat `row` per project with a vis-reason badge [VERIFIED: src/pages/settings.js:529-533]; payload `{projects:[{id,name,reason,teamName?}]}` lacks icon/color [VERIFIED: server.js:10893-10899] |
| SET-02 | API Keys button removing revoked keys only, audit preserved | `api_keys` schema has `revoked_at` soft-revoke [VERIFIED: server.js:602-615]; revoke route + audit_log insert idiom [VERIFIED: server.js:7873-7888] |
| SET-03 | Workspace URL single line | Render at src/pages/settings.js:304 — input inside a flex `row` with a prefix span; fix is local CSS |
| SET-04 | Invite Edit-Teams selectable picker | Invite markup already calls `teamPickOpen data-surface="invite"`; the chip remove action is `invTeamToggle`, member modal uses `mteamToggle` — delta is the chip contract + picker wiring parity [VERIFIED: src/overlays/modals.js:102-104, 501; src/actions/actions.js:2404-2410, 2477-2484] |
| BKRST-05 | Project archive restores as NEW or OVERWRITE of an existing project | Engine read: fragment-replacement in target doc via extended `restoreOverwriteUnit`; route guard chain verbatim at server.js:9798-9936; project-scope import_new already accepts `targetWorkspaceId` + membership gate [VERIFIED: server.js:9669-9685] |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Project overwrite restore engine | API/Backend (export/restore.js) | server.js route guard chain | The engine owns snapshot/tx/verification; the route owns auth/throttle/confirmName |
| Restore drawer target picker + CTAs | Client (src/pages/backup.js) | actions.js | Render-only doctrine; server re-validates everything |
| Revoked-key purge | API/Backend (server.js route) | settings.js + actions.js (2-click chrome) | Server is the boundary; client mirrors, never replaces |
| My Access grid | Client (settings.js render) | server payload (additive fields) | Server ground truth for access; client renders cards |
| Run-now scope picker | Client (backup.js runNowCard) | api.backupScopes payload | Payload-driven data only, per the card's existing doctrine |
| Edit-Teams invite picker | Client (modals.js + actions.js) | — | Pure UI contract alignment |
| Workspace URL line | Client (settings.js + CSS) | — | Presentation-only |

## Standard Stack

### Core
No new dependencies (project rule: zero new deps). Everything is in-repo:

| Asset | Location | Purpose |
|---------|---------|---------|
| `restoreOverwriteUnit` | export/restore.js:1353 | Guarded overwrite unit to extend for project scope |
| `restoreImportAsNew` + `planRemap` | export/restore.js:968 | Fragment splice idiom (project branch) to mirror |
| `runExport` | export/backup.js:667 | pre_restore snapshot core (kind 'workspace' over the TARGET workspace — unchanged) |
| `api.backupScopes()` | src/core/api.js:558 | Phase-92 cross-workspace picker payload |
| `pIcon`/`pColor` | src/ui/helpers.js:60, src/core/store.js:404 | Colored project icon (My Access cards) |
| `confirmDlg` + `typeName` | src/actions/actions.js:5611-5630 | Confirm-phrase dialog idiom (restoreOverwrite precedent) |
| `tooMany(key, n, ms)` | server.js (restoreoverwrite idiom :9845) | Route throttle idiom to clone for purge |
| `audit_log` insert shape | server.js:7865-7868 | Append-only purge event insert |

## Package Legitimacy Audit

Not applicable — **zero external packages installed** this phase (project hard rule). All work is in-repo code.

## Architecture Patterns

### System Architecture Diagram (project overwrite)

```
Operator (drawer, src/pages/backup.js)
  │ picks project target (phase-92 scopes payload) + types confirm phrase
  ▼
POST /api/backup/restore/overwrite  { runId, targetId, confirmName }   [server.js:9833]
  │ sameOrigin → requireUser → throttle 5/15min → CAP.BACKUP_MANAGE
  │ → read LIVE target row → confirmName === live name (server-side)
  │ → scope-kind match (workspace|project) → export/lock slot → claimRestoreLock
  ▼
restoreOverwriteUnit (export/restore.js:1353)  ── branch on scope.kind ──
  ├─ pre_restore snapshot: runExport({kind:'workspace', id: TARGET-WS})  [P7]
  ├─ streamVerifyArchive → extractArchive (totality: zero skips)
  ├─ readStagedTables → doc fragment (projects/tasks/comments/files/teams/projOrder)
  ├─ totality pre-check: refs resolve within fragment; ids VERBATIM
  ├─ blob swap (staged → FILES_DIR/LOGOS_DIR) + repair net armed
  └─ ONE dbTx:
       workspace scope → existing row-replacement path (unchanged)
       project scope   → read target ws doc → DELETE replaced project's
                         tasks/comments/files/activity refs → splice archive
                         fragment → revision+1 → syncTaskFts → verify → commit
  ▼
POST-COMMIT: unlink removed blobs (ENOENT-tolerant) → finish event → release lock
  (backup_runs history of the replaced project untouched — D-06)
```

### Recommended approach: EXTEND `restoreOverwriteUnit` (researcher recommendation for the discretion area)

Branch inside the existing unit, keyed on `scope.kind`:
- Shared machinery stays exactly as-is: runId/operator validation, archive resolution, snapshot-first (P7), staged blob plan/swap, repair net, `failWith` funnel, lock release, post-commit unlink, summary event.
- Branch points:
  1. **Scope-kind re-check** (restore.js:1422 and :1440): accept `kind === 'project'` alongside `'workspace'`; compare `manifest.scope.id` to `scope.id` (the ARCHIVE's project id, not the target's).
  2. **Target resolution**: for project scope the "target" is `{ targetWorkspaceId, targetProjectId }` — read the live target workspace row (already fetched at :1615) and locate `targetProjectId` inside `docData(targetRow).projects`. Missing → keyed `restoreTargetMissing`.
  3. **confirmName** stays route-side (see Pitfall 2): the route reads the target project's CURRENT name from the live doc — mirror of server.js:9857-9864 which reads the workspaces row.
  4. **Roster/invites/membership blocks** (:1502-1562, :1671-1688): skip entirely for project scope — a project splice never touches the target roster (the import_new project branch already establishes this doctrine [VERIFIED: export/restore.js:1204-1213]).
  5. **Replacement tx** (replaces the workspace tx block :1663-1717): inside `dbTx`, read the target doc, delete the replaced project's footprint (project entry, its tasks — including subtask closure via the taskIds set, comments of those tasks, `files` with `f.project === id`, `projOrder` ref, `activity` entries referencing the project — mirror the `delProject` mutation [VERIFIED: src/actions/actions.js:1899-1911] but server-side and with activity/notifs honesty per D-01), then splice the archive fragment arrays (projects/tasks/comments/files/teams/projOrder) with **ids verbatim** (no planRemap re-key — BKRST-05 says ids verbatim; import_new project splice preserves them [VERIFIED: export/restore.js:1139-1144]), revision+1, `syncTaskFts(txScope, wsId, storedDoc, nextDoc)` [VERIFIED: export/restore.js:1176-1177 precedent].
  6. **Blob plan**: same staged swap, but removals computed against the replaced project's file ids + logo (`oldIds` already computed from the old doc at :1615-1623 — for project scope, filter `oldData.files` to `f.project === targetProjectId`).
  7. **Pre-commit verification**: fragment totality re-check (mirror `assertFragmentTotality` usage :1189 and the workspace re-parse loop :1698-1702), blob presence, whole-archive sha re-hash. Row-count checks apply only to the tables actually written (none for project scope beyond the doc row — verify doc round-trips through JSON parse and project count unchanged).
- A separate `restoreProjectOverwriteUnit` would duplicate ~150 lines of snapshot/repair/lock plumbing for no isolation gain; the branch keeps the "engine never trusts its caller" guard chain single-sourced. Planner may still choose the sibling-unit shape; either satisfies the decisions.

### Name/slug collision (D-03)

Projects have `name` but no server-enforced slug column (they live in doc; workspace `uniqueSlug` at server.js:1262 is for workspace rows). Collision check = same-workspace doc scan: the archive fragment's project names (case-insensitive) against the target workspace's OTHER live projects → keyed refusal `restoreNameCollision` naming the conflicting projects (interpolation of a name list into the ×5 locale strings — plural/message-format per i18n idiom). This check must run BEFORE the snapshot? No — after snapshot is fine (the net is unconditional); but it must run before the tx. Note: the archive's own project typically collides with the TARGET project itself (overwrite of the same logical project) — the collision scan must EXCLUDE the target project id from the conflicting set, otherwise every overwrite of a same-named project refuses itself. This exclusion is the planner's sharpest edge case.

### Pattern: route guard chain (verbatim copy discipline)

The overwrite route (server.js:9833-9936) documents its chain as VERBATIM from the destructive funnel and "never reordered". The project-overwrite acceptance is a modification of THIS route, not a new one: extend the scope-kind check (`scope.kind !== 'workspace'` at :9882 → accept project), and the confirmName source becomes: for project scope, read the target workspace doc → find project → `body.confirmName !== project.name` → keyed `confirmPhraseMismatch`. Keep throttle key, audit action strings, and refusal codes identical; add audit scope token `'project'` where the workspace path passes `'workspace'` [VERIFIED: server.js:9932 auditBackupTask(…,'workspace')].

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Restore snapshot/repair/lock | Any new snapshot code | `restoreOverwriteUnit` skeleton | The repair net + P7 ordering are bug-hardened by 89-05 tests |
| Task-tree deletion | Manual recursive walk | `taskIds` set closure like the unit's own + `delProject` idiom | Subtasks reference parents; a flat filter orphans rows |
| Confirm dialog | New modal | `confirmDlg({ typeName })` | Shared OK-gate guarantees typed === name |
| Cross-workspace list | New query union | `api.backupScopes()` | Already gated to the three operator roles |
| 2-click confirm | New pattern | `S.ui.apiKeyRevoke` ask/confirm stage [VERIFIED: src/pages/settings.js:838-841, actions.js:2771-2781] | Established idiom, i18n keys exist |
| Team picker | New picker | `teamPickOpen`/`teamPickApply` surface='invite' | Feature chunk already exists (features/team-pick.js) |

## Runtime State Inventory

Not a rename/refactor phase. Targeted inventory for the destructive path only:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Replaced project's footprint lives in `workspaces.doc` JSON (projects/tasks/comments/files/projOrder/activity/events/notifs) — NOT in separate tables; `backup_runs` history rows keyed by scope JSON stay (D-06) | Doc-level replacement inside one tx; backup_runs untouched |
| Live service config | None — restore lock is in-process/DB, already claimed/released by the unit | None |
| OS-registered state | None | None |
| Secrets/env vars | None (purge deletes `api_keys` rows; `key_hash`/`prefix` die with the row — audit_log keeps event only, no values, D-10) | None |
| Build artifacts | None | None |

## Common Pitfalls

### Pitfall 1: Self-collision in `restoreNameCollision`
**What goes wrong:** The archive project usually shares its name with the target project being overwritten — a naive collision scan refuses every legitimate overwrite.
**Why:** D-03's scan compares archive names against live names in the target workspace.
**How to avoid:** Exclude the armed target project id (and itself) from the conflicting-name set; compare against the target workspace's OTHER projects.
**Warning signs:** Every overwrite test of a same-named project fails keyed.

### Pitfall 2: Client confirmName trust
**What goes wrong:** Confirm phrase validated only in the dialog.
**Why:** The existing contract states "the client confirmModal typeName is chrome, never the boundary" [VERIFIED: server.js:9819-9821].
**How to avoid:** Project path re-reads the live doc server-side; anything other than `===` on the live project name → `confirmPhraseMismatch`, checked BEFORE archive resolution.
**Warning signs:** A stale project name passing after a rename.

### Pitfall 3: Orphaned doc references after replacement
**What goes wrong:** Comments on deleted tasks, files of deleted tasks, saved-view filters, notification entries referencing dead ids.
**Why:** Doc-contained data has no FK enforcement — the JSON carries everything.
**How to avoid:** Compute the full dead-id set (project id + its task ids) and scrub comments (`c.taskId ∈ deadTasks`), files (`f.project === pid || f.task ∈ deadTasks`), projOrder ref, activity/notifs referencing the project; verify totality pre-commit exactly like the unit's `unresolved` loop [VERIFIED: export/restore.js:1487-1500].
**Warning signs:** FTS index or UI 404s on stale ids post-restore.

### Pitfall 4: FTS desync
**What goes wrong:** Search index keeps replaced project's tasks.
**How to avoid:** Always call `syncTaskFts(txScope, wsId, storedDoc, nextDoc)` INSIDE the tx with the tx scope [VERIFIED: export/restore.js:1692-1693 discipline].
**Warning signs:** Search returns deleted tasks.

### Pitfall 5: My Access payload breakage
**What goes wrong:** Renaming/reshaping `/me/visibility` breaks members.js:95 which consumes the same payload shape.
**How to avoid:** Additive fields only (`icon`, `color`, per-project workspace grouping via a NEW aggregate response or a wrapper), never mutate the existing `{projects:[{id,name,reason,teamName?}]}` contract consumers rely on [VERIFIED: src/pages/members.js:95].

### Pitfall 6: workspacesForUser drift
**What goes wrong:** Touching `membershipsOf` (server.js:1281, the function the D-11 gate comment names "workspacesForUser") while wiring pickers.
**How to avoid:** Pickers read `/api/backup/scopes` (separate direct query, comment at server.js:8847-8849 explicitly forbids routing through it). Add the static grep-gate test asserting the `membershipsOf` body + its call sites are unchanged.

## Code Examples

### Project-scope branch anchor (engine)
```js
// export/restore.js — inside restoreOverwriteUnit, replacing :1422 check
if (!scope || (scope.kind !== 'workspace' && scope.kind !== 'project')) {
  return failWith(keyed('restoreTargetMismatch', 'restore: overwrite requires a workspace or project scope archive'));
}
```
```js
// Fragment splice idiom to mirror (import_new project branch, :1134-1147):
nextDoc = { data: { ...stored,
  projects: [...keptProjects, ...plan.data.projects],
  tasks:     [...keptTasks,     ...plan.data.tasks],
  comments:  [...keptComments,  ...plan.data.comments],
  files:     [...keptFiles,     ...plan.data.files],
  projOrder: [...keptProjOrder, ...plan.data.projOrder],
} };
// 'kept*' = live arrays MINUS the replaced project's footprint (D-01 deletion set)
```

### Server purge route shape (researcher suggestion, discretion area)
```js
// POST /api/keys/purge-revoked — sameOrigin → requireUser →
// tooMany('keypurge|'+user.id, 5, 15*60*1000) →
const del = await db.run('delete from api_keys where user_id = ? and revoked_at is not null', [user.id]);
await db.run('insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
  [uid(), user.id, user.id, 'api_key_purged', 0, clientIp(req), null, user.name, user.email, String(del.changes), 'api-key', now()]);
return json(res, 200, { removed: del.changes });
```
(Insert-shape verified verbatim at server.js:7865-7868; expired-but-not-revoked keys are NOT purgeable per D-09 "revoked keys only".)

### My Access card (client)
```js
// settings.js my-access case — dashboard pIcon idiom (helpers.js:60):
`<div class="mini" style="cursor:default">${pIcon(p, '', 14)}<span class="tt">${esc(p.name)}</span>${roleBadge}<span class="badge faint">${visReasonLabel(p)}</span></div>`
// p.icon + p.color must ride the payload (additive server fields, normalized
// against helpers' PCOLORS default slate — store.js:404).
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Overwrite = workspace-only (86-D-01 containment) | Phase 95 extends containment to project fragments | this phase | Drawer gains 2nd CTA; route + engine branch on scope.kind |
| Restore picker = memberships list | Phase-92 scopes payload preferred (round-8) | Phase 94 UAT | Run-now picker should adopt the same payload (D-11) |
| Invite chips = `invTeamToggle` | Contract unification on `mteamToggle` | this phase (D-12) | One action name, one behavior |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Project overwrite can be accepted as an in-place branch of `restoreOverwriteUnit` without breaking the 89-05 test suite's workspace pins (tests assert workspace behavior; a kind branch leaves them green) | Architecture | Low — restructure into a sibling unit if the branch grows beyond ~120 lines |
| A2 | "favorites" as a distinct collection does not exist in the doc/tables (grep found no `favorites` in export/, server.js, src/core) — D-01's "favorites" maps to whatever per-user favorite state exists (likely savedViews/filter state or p.members semantics); the planner should treat the D-01 deletion set as: project + tasks + comments + files + projOrder + activity + events + notifs entries, and confirm with the owner if a literal favorites store surfaces | Pitfalls / engine | Medium — an omitted referencing collection leaves stale doc entries |
| A3 | Projects carry no unique slug constraint server-side (slug uniqueness is a workspaces-table concern, server.js:1262) — D-03's "name/slug collision" is therefore a doc-level NAME comparison (case-insensitive) | Name collision | Low — behavior matches D-03 either way |
| A4 | Purge route path `POST /api/keys/purge-revoked` and throttle 5/15min are suggestions (explicit discretion D-09/D-10 area) | Code Examples | None — planner picks |

## Open Questions

1. **My Access cross-workspace payload**
   - What we know: D-07 groups by workspace and hides empty workspaces; today's `/api/workspaces/<slug>/me/visibility` is scoped to ONE workspace [VERIFIED: server.js:10870-10900] and my-access reads only the loaded workspace's data.
   - What's unclear: does "grouped by workspace" mean ALL the user's member workspaces (a new aggregate endpoint, e.g. `GET /api/my-access` walking `membershipsOnly`-style rows + per-ws doc visibility), or the current workspace's projects rendered as cards (group trivially singleton)?
   - Recommendation: planner decides; the cross-workspace reading matches D-07's "empty workspaces hidden" phrasing. A new additive read-only endpoint (requireUser, per-workspace `memberCanReadProject` walk, super-access union mirroring :10882-10886) is the low-risk shape; keep `/me/visibility` untouched for members.js.

2. **Project-level target picker payload**
   - What we know: the drawer picker lists workspaces from `S.ui.backupScopes` [VERIFIED: src/pages/backup.js:586-599]; D-02 needs the projects OF THE CHOSEN workspace (per-workspace doc read).
   - Recommendation: extend the phase-92 scopes payload additively (`workspaces[].projects: [{id,name}]`) gated to the same operator roles — OR a separate `GET /api/backup/scopes?ws=<id>` detail read. Payload-shape is a planner call; additive keys keep backup-scopes.test.mjs's STRICT key assertion in mind — that test pins `Object.keys(entry)` == id/name/slug [VERIFIED: test/backup-scopes.test.mjs:52] and MUST be updated knowingly if projects ride the same array.

3. **"workspace_id remapped" phrasing (SC-6)**
   - Verified reality: doc-contained data has no workspace_id column; the fragment lands in the target workspace's doc. Only `webhook_hooks` / `api_keys` / `audit_log` carry workspace_id and none are in a project archive's replacement set. Planner should interpret SC-6 as "the fragment is spliced into the target workspace's doc", not a column update.

## Environment Availability

Node-based project, no external services required beyond the existing dev setup.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node/npm | tests, build | ✓ (existing repo toolchain) | — | — |
| SQLite db-adapter | test fixtures (temp DATA_DIR idiom) | ✓ | — | — |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (node assert/strict), in-repo harness `test/helpers/server.mjs` (startServer-per-case, withDb) |
| Config file | none — `npm test` runs the suite |
| Quick run command | `node --test test/restore-overwrite.test.mjs` (and the per-file commands below) |
| Full suite command | `npm test` — baseline 2449 tests, 2 pre-existing failures (D-05 fr-typography, D-06 webhook-routes) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BKRST-05 | project overwrite: replacement totality, ids verbatim, D-01 deletion set, FTS sync, blob swap, refusal matrix | engine unit (temp DATA_DIR fixture) | `node --test test/restore-overwrite.test.mjs` | ✅ extend existing suite |
| BKRST-05 | route guard chain for project scope (confirmName vs live doc name, scope-kind acceptance, lock, audit) | server route | `node --test test/restore-routes.test.mjs test/restore-security.test.mjs` | ✅ extend |
| BKRST-05 | drawer CTAs + project target picker + collision toast | static client slices | `node --test test/restore-client.test.mjs` | ✅ extend |
| XWS-01 | scopes payload unchanged shape; Run-now picker on scopes payload; membershipsOf grep-gate; switcher differential e2e | static + route + e2e | `node --test test/backup-scopes.test.mjs` (+ new grep-gate file) | ✅ extend + ❌ new file Wave 0 |
| SET-01 | My Access cards, additive payload fields, grouping | static + route | `node --test test/self-visibility.test.mjs` + new client-slice assertions | ✅ extend + ❌ new |
| SET-02 | purge route: deletes revoked only, audit event, no values, throttle | server route | `node --test test/mcp.test.mjs` (keys family) + new cases | ✅ extend |
| SET-03 | URL single-line CSS/markup | static slice | new small static test or client-surfaces | ❌ Wave 0 |
| SET-04 | invite chips use mteamToggle + teamPickOpen surface=invite | static slices | `node --test test/team-pick-client.test.mjs` | ✅ extend |
| all | i18n keys ×5, no dead keys | build gate | `node --test test/i18n-scan.test.mjs test/build-locales.test.mjs` | ✅ |

### Sampling Rate
- **Per task commit:** the touched suite file(s) from the map above
- **Per wave merge:** `npm test` full suite (2449 baseline; allow the 2 known failures)
- **Phase gate:** full suite green (minus knowns) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] Grep-gate test file pinning `membershipsOf` (server.js:1281) byte-identity + `/api/workspaces`/switcher consumers untouched (XWS-01)
- [ ] Static client-slice file for settings/backup picker changes (or extend client-surfaces.test.mjs idiom: `readFileSync` source + regex assertions — the established idiom in test/restore-client.test.mjs:26 and test/team-pick-client.test.mjs:30)
- [ ] `restoreNameCollision` ×5 locale keys land same commit as the emitting engine code (i18n-scan gate enforces)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | yes | Instance-role caps (`CAP.BACKUP_MANAGE`/`RESTORE_USE`), Super Admin bypass `isInstanceAdmin(user) && SUPER_ACCESS` [VERIFIED: server.js:9670-9671], purge scoped to own rows (`where user_id = ?`) |
| V5 Input Validation | yes | Route body regex guards (`/^[A-Za-z0-9_-]{1,64}$/`), throttle idiom, confirmName === live name |
| V9 Communications | yes | `sameOrigin(req)` first on every new route (house rule, guard chain order IS the security property) |
| V2/V3/V6/V7 | partial | No new auth/session/crypto — reuse existing requireUser/audit_log |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Destructive restore without proof of authority | Elevation/E | Server-side confirmName vs live row; cap gate before any read; throttle consumes tries on refusals |
| Audit trail tampering via purge | Repudiation | Rows deleted from `api_keys` only; `audit_log` append-only insert carries label-free event (no key values, D-10) |
| Doc JSON injection via archive fragments | Tampering | Whitelisted fragment shapes + totality pre-check + verification inside the tx (unit discipline) |
| Existence oracle in pickers | Information disclosure | Scopes endpoint gated to operator roles; refuse keyed, audit refusals |

## Sources

### Primary (HIGH confidence)
- Direct file reads this session: export/restore.js (:968-1252, :1353-1955), export/backup.js (:540-760), server.js (:596-640, :7790-7940, :8845-8870, :9660-9960, :10870-10900, :1262-1300), src/pages/backup.js (:50-99, :469-490, :530-619), src/pages/settings.js (:105-125, :460-575, :298-321, :820-900), src/overlays/modals.js (:90-110, :485-510), src/actions/actions.js (:1889-1918, :2399-2560, :2640-2790, :5560-5650, :5720-5760), src/ui/helpers.js (:48-60), src/core/store.js (:404), src/core/api.js (:580-600), test/backup-scopes.test.mjs, test/backup-routes.test.mjs, test/restore-overwrite.test.mjs header
- git show 7663f1a6 (phase-92 golden byte-identity gate fixture)

### Secondary (MEDIUM confidence)
- .planning/REQUIREMENTS.md, .planning/ROADMAP.md §Phase 95, 95-CONTEXT.md (owner rulings)

### Tertiary (LOW confidence)
- None — no web research needed (in-repo domain).

## Metadata

**Confidence breakdown:**
- Engine/restore: HIGH — full unit read line-by-line this session
- Settings/picker surfaces: HIGH — all render + action code read
- Project deletion set ("favorites" honesty): MEDIUM — A2 above; grep found no favorites collection, needs the planner to encode the concrete deletion set

**Research date:** 2026-11-24
**Valid until:** 2026-12-24 (stable in-repo domain)
