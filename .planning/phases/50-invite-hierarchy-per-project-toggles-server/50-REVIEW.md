---
phase: 50-invite-hierarchy-per-project-toggles-server
reviewed: 2026-11-08T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - docs/ProjectPermissions.md
  - docs/WorkspacePermissions.md
  - mcp.js
  - server.js
  - src/locales/en.json
  - src/locales/fr.json
  - test/helpers/visibility-fixture.mjs
  - test/i18n-core-features.test.mjs
  - test/invite-hierarchy.test.mjs
  - test/mcp.test.mjs
  - test/membership.test.mjs
  - test/visibility-migration.test.mjs
  - test/visibility-team.test.mjs
findings:
  critical: 1
  warning: 4
  info: 4
  total: 9
status: issues_found
---

# Phase 50: Code Review Report

**Reviewed:** 2026-11-08
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

The D-50-5 live team-link predicate is implemented consistently across `canSeeProject` / `memberCanReadProject` (server.js:790-807), `hiddenFor` (:824-838) and the MCP mirror (`canReadProject`, mcp.js:183-198) — same join direction (member_id → memberships.user_id → team_members), no caching, verified by the parity suite. The new admin routes (toggle flip, project-members add/remove) are correctly gated (`requireWorkspace` admin tier + `sameOrigin` before body reads), and the invite accept path re-derives the toggle fail-closed before any write. Locale additions are in parity (6 keys, EN/FR) and the i18n catalogue pin was updated (1716).

The defects concentrate in the boot migrations and the accept-time grant: the reverse-sweep can silently delete genuine access grants added between the Phase 49 and Phase 50 boots (CR-01); an existing workspace member who accepts a project-scoped guest invite never receives the granted access (WR-01); the admin invite path silently discards the `project` parameter it accepts (WR-02); and the reminder pass still uses the two-term predicate, contradicting the documented "same predicate for all consumers" parity claim (WR-03).

## Critical Issues

### CR-01: restoreTeamLinks deletes genuine p.members entries added after the Phase 49 sweep

**File:** `server.js:2762-2772`

**Issue:** The removal basis is "present now, absent from the pre-sweep members list" (`!pre.members.includes(m)`). Absence from the pre-sweep snapshot proves only that the entry was not there *at snapshot time* — it cannot distinguish a sweep-materialized team grant from a **genuine individual invite an owner added between the Phase 49 sweep boot and the Phase 50 boot**. Any member an owner added via the sharing UI in that window is silently stripped from `p.members` on the first Phase 50 boot (with a pre-sweep backup present), i.e. real access revocation, not just a representation change. This also violates the migration's own T-50-04 guarantee ("no heuristic ever converts a genuine individual p.members entry"). The conflation is compounded: the removal is not even conditioned on the removed person belonging to one of the restored teams (`pre.teams`) — a member of *no* pre-sweep team cannot have been team-derived, yet is removed anyway.

**Fix:** Constrain the removal to the only entries the backup can positively identify as team-derived — the user must be a current member of one of the restored teams:

```js
// Resolve user_id → member_id for the restored teams once per workspace
const teamMemberIds = new Set(
  (await db.all(
    `select m.member_id from team_members tm
       join memberships m on m.workspace_id = tm.workspace_id and m.user_id = tm.user_id
      where tm.workspace_id = ? and tm.team_id in (${pre.teams.map(() => '?').join(',')})`,
    [wsId, ...pre.teams],
  )).map(r => r.member_id).filter(Boolean),
);
const materialized = (Array.isArray(p.members) ? p.members : []).filter(
  m => typeof m === 'string' && !pre.members.includes(m) && teamMemberIds.has(m),
);
```

and/or drop removal entirely on the first pass: restore links only, log the residual entries as an owner-review warning (the fail-open posture the code itself uses when no backup exists). Add a test cell: a genuine member added to a swept project *after* the sweep must survive the restore boot.

## Warnings

### WR-01: Accepting a project-scoped guest invite as an existing workspace member grants nothing

**File:** `server.js:5349-5373`

**Issue:** The `p.members` grant (`if (invite.project) { ... }`) is nested inside `if (!(await membershipOf(ws.id, user.id)))`. A user who already belongs to the workspace (e.g. invited by link while already a member, or accepting from an existing session) passes the `membershipOf` guard, so the project access-list entry is never written — yet the invite is consumed (`used_at` set, :5376) and a 201/200 is returned. The granted scope silently evaporates. The test suite only exercises fresh accounts (invite-hierarchy.test.mjs 'stale member guest invite').

**Fix:** Hoist the project-scoped grant out of the membership guard and apply it for both branches (role stays the existing membership's role for existing members — only the project access is granted):

```js
if (!(await membershipOf(ws.id, user.id))) {
  await addMembership(ws, user, invite.role, parsedTeams);
}
if (invite.project) {
  await updateDoc(ws.id, async doc => { /* existing p.members push */ });
}
```

Add a test: an existing member accepts a member-minted viewer invite with the toggle ON and reads the project on the next request.

### WR-02: Admin invite path silently discards the `project` parameter it accepts

**File:** `server.js:5092-5110, 5187, 5194`

**Issue:** `inviteProject` is only assigned inside the member-tier branch (`ROLE_RANK < admin`). An admin/owner posting `{ role: 'viewer', project: 'p_hidden' }` gets a 201, but the stored and echoed `project` is `null` — the parameter is dropped with no validation (unknown project ids accepted), no error, and no echo of the discard. The caller reasonably believes the invite is project-scoped; it is workspace-scoped. The test suite pins this as expected behavior (`onOff.data.invites[0].project === null`) rather than flagging the asymmetry: the same field is validated strictly (400) for members and ignored entirely for admins.

**Fix:** Either validate and store the project for admins too (skipping only the toggle check, per D-50-9), or reject `project` on the admin path with a 400 (`projectAdminUnused`) so the contract is explicit on both tiers.

### WR-03: Reminder pass uses the retired two-term predicate — team-granted assignees get no reminders

**File:** `server.js:1344-1349` (`remindable`), call sites :1389, :1508

**Issue:** `remindable()` calls the synchronous `canSeeProject(project, task.assignee)` without the third (team) term, while every other funnel consumer uses the async `memberCanReadProject` (:1123, :1293, :1400, :1514). A member whose only grant to a private project is the live team link (exactly the D-50-5 cell the phase restored) is filtered out of due-date reminders. This contradicts docs/ProjectPermissions.md §5: "Les consommateurs au fil de l'envoi (relais d'emails, passe des rappels, digest) ... passent par le même prédicat (parité testée)" — no test covers the reminder door for team-granted members, so the claimed parity is untested and currently false.

**Fix:** Make the reminder pre-filter async and route it through `memberCanReadProject(project, wsId, task.assignee)` (the call sites already have `wsId` in scope), or drop the `remindable` visibility pre-check and let the existing per-recipient `memberCanReadProject` check at :1400/:1514 govern. Add a fixture cell: m_team (team-linked only) has a due task in p_teamshare → reminder emitted.

### WR-04: DELETE project-member route mutates the document as a side effect (ensureMember in a removal path)

**File:** `server.js:4998` (DELETE), `server.js:4965` (POST), `server.js:2901-2917` (ensureMember)

**Issue:** Both routes resolve the target id via `ensureMember(doc, target, row.role, ctx.ws.id)`. In the DELETE path this can *create* a doc member profile (members.push, :2915), flip `status: 'invited' → 'active'` (:2910) and overwrite the profile role label (:2911) while processing a **removal** — a delete that writes new state and can resurrect a profile the caller is trying to clean up. In the POST path it silently rewrites the doc profile's role label to the workspace role, an undocumented mirror-repair ride-along.

**Fix:** In the removal route, resolve the id read-only — reuse `row.member_id` and only fall back to a doc-profile lookup (match on `userId`/email) without mutation:

```js
const memberId = row.member_id
  || (doc.data.members || []).find(m => m.userId === target.id
    || (m.email || '').toLowerCase() === target.email.toLowerCase())?.id;
```

Keep `ensureMember` (with its repair semantics) on the add path only, and note the role-label rewrite there or drop it.

## Info

### IN-01: restoreTeamLinks reads only the newest pre-sweep snapshot

**File:** `server.js:2663, 2680-2682`

**Issue:** Only `preSweepBackups[preSweepBackups.length - 1]` is opened. If several `projects-pre-visibility-*.db` snapshots exist (multiple Phase 49 boots across workspaces/dates), a workspace absent from the newest snapshot silently falls into the fail-open path with no per-workspace warning. Lexical `sort()` on the fixed-width stamped names is otherwise correct.

**Fix:** Iterate the snapshots newest-first per missing workspace, or log each workspace found in *no* snapshot as a distinct fail-open warning line.

### IN-02: Stale comment above the new project-scoped insert

**File:** `server.js:5130-5134`

**Issue:** The Phase 49 comment "Invite-carried scope is retired: ... invites no longer validate, store or echo a scope" now sits directly above the code that stores `inviteProject` (the new Phase 50 project scoping). Misleading for the next reader.

**Fix:** Reword to "invite-carried *scope JSON* is retired; the Phase 50 `project` column is the only per-project field an invite carries."

### IN-03: Candidate scan can re-run on every boot with no marker written

**File:** `server.js:2757-2776`

**Issue:** If the scan finds `needsRestore` but the in-transaction re-read yields no changed project (`changed === false`), the workspace is skipped *without* writing the `teamLinksRestored` marker, so the candidate scan re-runs on every subsequent boot. Harmless today (no writes) but it keeps the migration permanently "pending" for that workspace.

**Fix:** Write the marker even when the tx re-read finds nothing restorable (the decision "nothing to restore" is itself final), or log once per boot.

### IN-04: Doc `file:line` references drifted after the server.js refactor

**File:** `docs/ProjectPermissions.md:22,28`, `docs/WorkspacePermissions.md:53`

**Issue:** The docs cite `server.js:193` (ROLE_RANK — now :197), `server.js:776-779` (canManageProject — now :810), `server.js:807-836` (normalizeProjects — now :845), `mcp.js:182` (canReadProject — now :183). The prose claims remain accurate; the pin refs no longer resolve.

**Fix:** Refresh the line anchors (or switch to symbol-name anchors) so the verification promise "références fichier:ligne" holds.

---

_Positive notes (not findings):_ the member-tier invite gate (`ownerInviteForbidden` on the raw body, role ceiling, project existence on the current doc, toggle ON, team refusal) is ordered correctly and each cause is keyed; the fail-closed accept re-derivation (server.js:5296-5310) precedes all writes; the invite INSERT column/value counts are correct (10/10 with literal `null`); `mergeClientDoc` pinning of `p.teams`/`p.allowInviteGuests` for non-managers (server.js:1046-1047) is verified both directions by visibility-team.test.mjs:173-195; EN/FR locale keys are in exact parity.

_Reviewed: 2026-11-08_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
