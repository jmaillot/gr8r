# Phase 32: Team-Derived Project Visibility - Pattern Map

**Mapped:** 2026-11-02
**Files analyzed:** 2 (both modifications — no new files; per RESEARCH "Recommended Change Shape")
**Analogs found:** 2 / 2 (in-place: the files are their own analogs — this phase extends existing Phase-29 machinery, so "copy patterns from" means "copy from the exact regions being modified")

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` (regions: :649-739, :1110-1116, :1236-1239, :1377-1382) | service (visibility predicates + send-time guards) | request-response + event-driven (scheduler/mail) | self: `hiddenFor` / `canSeeProject` / `teamsOfUser` (Phase-29 shipped code) | exact (self) |
| `test/scope.test.mjs` (regions: :530-575, :655-661) | test (integration, MATRIX sweep) | batch (fixture-driven probes) | self: existing MATRIX table + byte-identical cross-check | exact (self) |

Both files are git-tracked (verified `git ls-files` this session). No new files ⇒ no cross-file analog assignment needed; the planner references the concrete regions below.

## Pattern Assignments

### `server.js` — new shared helper + null-scope branch (D-03/D-04/D-05/D-06)

**Analog:** `server.js:730-739` (`hiddenFor` — the single funnel, contract comment :704-712 forbids a second pipeline)

**Funnel to extend, verbatim** (lines 730-739):
```js
function hiddenFor(doc, membership) {
  const scope = projectScope(membership);
  if (!scope) return hiddenProjectIds(doc, membership?.member_id || null);
  const seen = new Set();
  for (const p of doc?.data?.projects || []) {
    if (!p?.id) continue;
    if (!inScopeProject(p, scope) || !scopeGrants(p, scope, membership.member_id)) seen.add(p.id);
  }
  return seen;
}
```

**Rule:** the scoped branch (`if (!scope)` return + the loop) stays **byte-for-byte untouched** (D-03). The team term goes in the null-scope branch only.

**Existing predicate the helper composes with, verbatim** (lines 649-652):
```js
function canSeeProject(p, memberId) {
  if (!projectIsPrivate(p)) return true;
  return !!memberId && Array.isArray(p.members) && p.members.includes(memberId);
}
```

**Anti-pattern (from RESEARCH):** do NOT put the team term inside `canSeeProject` or `hiddenProjectIds` — those are also the admin/owner path and the assignee write-guard path. Recommended shape per RESEARCH Pattern 1:

```js
// Illustrative — naming is agent's discretion (CONTEXT D-04)
function teamIntersects(p, teamSet) {
  return Array.isArray(p?.teams) && p.teams.length > 0 && p.teams.some(t => teamSet.includes(t));
}
// Null-scope branch: hidden = projects where !(canSeeProject(p, member_id) || teamIntersects(p, liveTeams))
// Admin/owner: keep plain hiddenProjectIds path (exemption on top, D-06).
```

**Live team-set read (D-05, no caching), verbatim** (lines 1377-1382):
```js
function teamsOfUser(workspaceId, userId) {
  return db
    .prepare('select team_id from team_members where workspace_id = ? and user_id = ? order by team_id')
    .all(workspaceId, userId)
    .map(r => r.team_id);
}
```
⚠️ `teamsOfUser` queries by **`user_id`**; `hiddenFor` and access lists (`p.members`) work in **`member_id`** space. The helper must resolve `user_id` from the `memberships` row (rows carry `user_id` — join at :1095 selects it) or query `team_members` by `member_id`. Decide once; test both a doc-only member (no authority row → empty teams) and an account member (Pitfall 2).

### `server.js` — send-time guard swaps (VIS-04)

**Analog 1:** email mirror guard, verbatim (lines 1110-1116):
```js
    const recipientScope = projectScope(scopeByMember.get(n.to));
    if (recipientScope) {
      /* Tasks carry `project` (the client's createTask writes it); the retired
         `projectId` key is never read — it made this lookup always undefined. */
      const projectId = n.project || task?.project || null;
      if (!inScopeProject(projectId ? projectById.get(projectId) : null, recipientScope)) continue;
    }
```

**Analog 2:** reminder pass guard, verbatim (lines 1236-1239):
```js
        const assigneeMembership = db
          .prepare('select role, scope from memberships where workspace_id = ? and member_id = ?')
          .get(ws.id, t.assignee);
        if (!inScopeProject(project, projectScope(assigneeMembership))) continue;
```

**Pattern:** keep both existing guards byte-identical and ADD the team conjunct via the same shared helper the funnel uses — expressed as a skip. Do NOT implement an inline team check at either site (D-04 invariant; ranked regression risk #1). Note the reminder-pass membership row shape is `{role, scope}` with no `member_id` property — the helper signature must accept ids explicitly, not the row (RESEARCH Pattern 2).

**Leave untouched:** `remindable` (:1197-1202, calls `canSeeProject` — composes fine with the pass-level team check) and the assignee write-guard (:1028-1034, out of VIS-04 letter — RESEARCH Open Question 2 recommends observation only). Guest single-project gate (:4180-4196) must stay untouched (VIS-03).

### `test/scope.test.mjs` — MATRIX extension (D-07/D-08)

**Analog:** the MATRIX table, verbatim (lines 530-569, headers abridged):
```js
const MATRIX = [
  { family: 1, name: 'doc GET omission (the 404-equivalent is absence from the payload)', kind: 'doc-get', expected: { inScope: 'present', outOfScope: 'absent', unknown: 'absent' } },
  { family: 2, name: 'doc PUT rejection/rollback (out-of-scope rows never land)', kind: 'doc-put', expected: { inScope: 'lands', outOfScope: 'reserved', unknown: null } },
  { family: 4, name: 'file serve (byte-identical 404 fileNotFound)', kind: 'file', expected: { inScope: 200, outOfScope: 404, unknown: 404 } },
  { family: 5, name: 'reminder pass (server send-time skip, SCOPE-04)', kind: 'reminder', expected: { inScope: 'reminded', outOfScope: 'skipped', unknown: null } },
  { family: 5, name: 'notification fan-out (client emit pre-filter, A4)', kind: 'fanout', expected: { inScope: 'present', outOfScope: 'absent', unknown: null } },
  { family: 6, name: 'invite-carried scope (SCOPE-05: invites.scope stored; unknown id refused, T-29-12)', kind: 'invite', expected: { inScope: 'stored', outOfScope: 'stored', unknown: 'refused' } },
];
const MATRIX_SCOPE = { projects: ['p_in'], teams: [] };
```

**Pattern:** add a **second probe member** (on-team vs off-team) and team-derivation cells across every existing family (doc GET, doc PUT, file, reminder, fanout; invite only if cheap — RESEARCH Open Question 3). Fixture member shape mirrors `MATRIX_SCOPE` above (`{ projects, teams }`).

**Byte-identical no-oracle cross-check to reuse verbatim** (lines 655-661):
```js
if (row.kind === 'file') {
  assert.equal(got.status, row.expected[probe]);
  if (row.expected[probe] === 404) {
    assert.equal(got.code, 'fileNotFound');
    const cross = await matrixProbe.file(probe === 'unknown' ? 'outOfScope' : 'unknown');
    assert.deepEqual(got, cross, 'unknown ≡ out-of-scope: identical status, code AND message (no oracle)');
  }
}
```

**Required new fixture cells (from D-06 + SC 2 + D-08):**
- One member on team X (sees `p_teamX`), one member on no team / team Y (404/absent on `p_teamX`)
- A `teams: []` **private** project visible to its access list only — NOT leaked workspace-wide (D-06)
- JIT-shaped zero-team account: `teams:[X]` private project ⇒ 404; `teams:[]` project ⇒ visible per public/access-list state (SC 2)
- File-family cell proving the file side door agrees with the doc read under the new predicate (D-08 — note RESEARCH A3: `normalizeProjects` at server.js:4623-4627 already closed the gap in the tree; this reduces to a test pin)
- One public project with `teams:[X]` visible to a non-X member (pins the widening-only reading of A1 — surface for one-line user confirmation in the plan)

## Shared Patterns

### Additive-union hidden set (binding, from Phase 29 — 29-01)
**Source:** `server.js:730-739` / `.planning/RESEARCH.md` Pattern 1
**Apply to:** the null-scope branch. Team term only ever SUBTRACTS from the hidden set (widening-only). Never conjunctive composition (`visible && inScope` rewrites break D-03).

### One-funnel, one-helper (D-04)
**Source:** `server.js:704-712` contract comment; helper consumed at :730-739 (funnel), :1110-1116 (email mirror), :1236-1239 (reminder pass)
**Apply to:** every visibility surface this phase touches. No inline team checks at call sites.

### Live authority-row membership (D-05)
**Source:** `server.js:1377-1382` (`teamsOfUser`)
**Apply to:** the helper. No per-request caching; never read `doc.teams[].members` (stripped at :622-628 — display projection only).

### 404 no-oracle (byte-identical bodies)
**Source:** `test/scope.test.mjs:655-661` cross-check pattern
**Apply to:** all new MATRIX cells touching project ids.

### member_id vs user_id discipline (Pitfall 2)
**Source:** `team_members` schema (:227-234: `member_id` nullable, `user_id` NOT NULL); `teamsOfUser` queries by `user_id`; access lists and `hiddenFor` work in `member_id` space; reminder pass resolves by `member_id` (:1237)
**Apply to:** helper signature — accept explicit ids, resolve the join via the `memberships` row (`user_id` selected at :1095).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | — | — | No new files; both modified files extend existing Phase-29 regions that serve as their own exact analogs |

## Metadata

**Analog search scope:** `server.js`, `test/scope.test.mjs` (regions named in 32-RESEARCH, verified against the tree this session via grep + targeted reads)
**Files scanned:** 3 (server.js, test/scope.test.mjs, test/migration.test.mjs — migration.test.mjs tracked but likely unused this phase, no schema change)
**Pattern extraction date:** 2026-11-02
**Tracked-source gate:** `git ls-files` confirms `server.js`, `test/scope.test.mjs`, `test/migration.test.mjs` all tracked; no mirror paths named.
