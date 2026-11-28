# Team Mapping Research — Schema & Backend Half (v3.7)

**Domain:** Team-level Entra group→workspace mappings for Projects Studio
**Researched:** 2026-11-28
**Confidence:** HIGH (codebase-grounded: server.js, groups.js, db-adapter.mjs, src/actions/teams.js read directly; all line refs verified this session)

---

## 1. Teams schema today (verified)

### Teams are doc-resident, not table-resident

Team *definitions* live in the workspace document: `doc.data.teams` — array of `{ id, name, desc, icon, c }` (see `server.js:11846` whitelist: `(JSON.parse(ctx.ws.doc)?.data?.teams || []).map(t => t?.id)`). There is **no teams table and no FK target for a team id**. `team_members.team_id` references the doc with an explicit whitelist check at write time (TEAM-01 comment, `server.js:573-583`).

### team_members (server.js:580-587)

```sql
create table if not exists team_members (
  workspace_id text not null references workspaces(id) on delete cascade,
  team_id      text not null,
  member_id    text,
  user_id      text not null references users(id) on delete cascade,
  primary key (workspace_id, team_id, user_id)
);
create index if not exists team_members_user on team_members(workspace_id, user_id);
```

**Critical fact: team_members has NO provenance column today.** `memberships.provenance` (`server.js:562-566`, values `group:<guid> | invite | manual | null`) exists only on memberships. This is the single biggest gap the v3.7 team-mapping reconcile must close (§3).

### Helpers (verified)

| Helper | Location | Contract |
|--------|----------|----------|
| `addMembership(ws, user, role, teams = [], provenance = null)` | server.js:6001 | Upserts membership with conditional provenance stamp (D-82-7: only `group:%` excluded values overwrite provenance); inserts one `insert or ignore` team_members row per team **in the same tx**. Today it does NOT stamp provenance on team_members rows. |
| `syncProfiles(doc, workspaceId)` | server.js:4781 | Projects team_members authority → doc profiles `teams[]` on every read. |
| `memberTeamsOf` / bulk form | server.js:4704, 4710 | Read helpers: `select team_id from team_members where workspace_id = ? and user_id = ?`. |
| `stripMember(doc, memberId, userId)` | server.js:4822 | Doc-side member removal (paired with blanket `delete from team_members` in the reconcile delete cell, server.js:6872). |
| `PUT /api/workspaces/:ws/members/:uid/teams` | server.js:11827-11860 | Admin-gated full-set replace: tx = delete-all-user-rows + reinsert; whitelist against **stored** doc teams; cap 25 teams; response re-projects via syncProfiles. |

### Provenance convention (memberships, the model to extend)

`memberships.provenance` is the reconcile selection key. `addMembership` stamps it conditionally (server.js:6018-6028): `provenance = case when excluded.provenance like 'group:%' then excluded.provenance else memberships.provenance end` — group writers own the row, manual/invite writers preserve origin. Team mapping must reproduce this exact semantics on team_members.

### Team deletion orphan behavior (pre-existing)

Deleting a team is a client-side doc edit; `A.delTeam` (src/actions/teams.js:139-180, T-28-05) purges authority rows by re-PUTting every affected member **before** the team definition leaves the doc. Server-side there is no cascade — a doc team deleted without the re-PUT dance leaves orphan `team_members` rows. This orphan class is the model for the new "mapped team deleted" dead-mapping class (§4).

---

## 2. Shape of a team-mapping row — recommendation

### Current group_mappings (server.js:801-812)

```sql
create table if not exists group_mappings (
  id           text primary key,
  group_guid   text not null,
  workspace_id text not null,
  role         text not null check (role in ('owner','admin','member')),
  kind         text not null default 'workspace' check (kind in ('workspace','operator')),
  label        text,
  created_by   text references users(id) on delete set null,
  created_at   integer not null,
  updated_at   integer not null
);
create unique index if not exists group_mappings_pair on group_mappings(group_guid, workspace_id);
```

Note the **deliberately non-cascading** workspace_id FK comment (D-82-6): a deleted workspace leaves the row behind so boot + dead-mappings card can warn. The same logic will apply to a team target.

### Recommendation: nullable `team_id` column, kind stays 'workspace', unique index UNCHANGED

**Do NOT introduce a `kind: 'team'` row.** Reasons:

1. **The owner ruling makes kind 'team' wrong.** A team mapping grants *workspace role from the same row* — it IS a workspace mapping with an optional team target. A separate kind would force the resolver to merge two rows per (group, ws) and re-litigate highest-role-wins across kinds.
2. **CHECK-widening cost.** `kind` is CHECK-constrained in table DDL. SQLite cannot ALTER a CHECK — widening `'workspace','operator'` → `+ 'team'` requires the invites-style rebuild migration (server.js:717 precedent) in **both engines**. A nullable `team_id` needs only `adapterEnsureColumn('group_mappings', 'team_id', 'text')` — one line in the boot column block (server.js:1027-1090 pattern), zero rebuild.
3. **Unique-index surgery avoided.** Keep `UNIQUE(group_guid, workspace_id)` exactly as-is: one row per group per workspace, `team_id` an optional attribute of that row. Extending the index to `(group_guid, workspace_id, team_id)` would allow plain+team rows for the same pair and force reconcile keying to pick between them; NULL-distinct semantics differ subtly across engines (SQLite NULLs distinct; PG default distinct but NULLS NOT DISTINCT available since PG15) — pure trap. Keeping the pair index means **zero index migration** and reconcile keying stays trivial.

**Trade-off accepted:** a group cannot have both a plain (admin, no team) and a team (member, team X) mapping to the same workspace. If that combination is needed, the operator creates two Entra groups. Flag as open question for requirements (§9).

### Exact DDL delta

```js
// boot column block (server.js ~1030, group_mappings section):
await adapterEnsureColumn('group_mappings', 'team_id', 'text');
```

- `team_id text` — nullable, **no FK** (team ids reference the doc, same convention as team_members.team_id, server.js:573-583 comment), no CHECK (validated at write time against the target workspace's stored doc).
- **PG_EPOCH_COLUMNS: no registration needed** (not a timestamp). **pgSchemaVariant: no variant entry** — pgSchemaVariant derives pg DDL verbatim from the SQLite schema (Pattern 2/A1 precedent, instance_roles comment server.js:823). The new column rides `create table if not exists` for fresh installs + `adapterEnsureColumn` for existing ones — the standard dual-engine lockstep.
- `team_members` gains provenance (§3): `await adapterEnsureColumn('team_members', 'provenance', 'text');` — also engine-neutral, no epoch registration.

### Write-path changes

**POST /api/governance/group-mappings (server.js:8986-9045):** accept optional `teamId`. Validation ladder additions, after the existing dup check (`server.js:9007`):
- If `teamId` present: workspace must exist and be live (`archived = 0`) — the whitelist needs the stored doc; a dead/archived workspace cannot validate a team, so refuse (keyed refusal, mirroring `guidRefusal` posture from PITFALLS.md Pitfall 1).
- Whitelist: `JSON.parse(ws.doc)?.data?.teams` must contain the id — byte-same predicate as the PUT teams route (server.js:11846). Cap: one team per row; the 25-team cap of the PUT route does not apply.
- Store canonicalized GUID only (unchanged funnel).

**GET /api/governance/group-mappings (server.js:9059-9102):** add `team_id` to the select and payload (`teamId`). **Resolve the team name server-side in JS, not SQL**: `workspaces.doc` is JSON text and `json_extract` is SQLite-only — the existing route's LEFT JOIN pattern cannot be extended with a JSON op without breaking the PG engine. Recipe: collect distinct live `workspace_id`s, fetch their docs, build a `Map<wsId, Map<teamId, teamName>>`, resolve per row in JS before `json()`. Also expose `teamMissing: team_id !== null && !teamMap.has(team_id)` for the UI's dead-team hint (keep rows flat dumb data per D-06/D-07).

---

## 3. Reconcile-pass extension (anchored recipe)

The pass lives at server.js:6797-6977 inside the SSO callback, strictly after identity resolution, before the DP-5 invite reconcile, fail-closed inside the same try (D-82-10). Extension points, in order:

### 3a. groups.js resolve() — grant shape gains teamId

`resolve()` (groups.js:122-152) builds `winners` per workspace, highest `ROLE_RANK` wins (owner 3 > admin 2 > member 1). Change:

```js
winners.set(workspaceId, { role, groupGuid: guid, teamId: row.team_id || null });
```

and emit it on the grant. Highest-role-wins is **unchanged**; the winning row's team rides the grant. Non-winner rows' teams are ignored (ONE delta per workspace in place — D-82-10). Mappings load query at server.js:6797 becomes `select group_guid, workspace_id, role, kind, team_id from group_mappings`.

**Interplay ruling (owner's "role unchanged" applied):** if group G has both a plain row (admin) and a team row (member, team X) on ws W — currently impossible under the kept unique index, but the *same group* hitting a workspace via different GUIDs is possible — the winner drives BOTH role and team; the loser's team is not applied. Document this in the mappings-page help text: "the highest-ranked mapping for a workspace decides the role AND the team."

### 3b. Provenance on team_members — the prerequisite

Add the column (§2 DDL delta) and extend `addMembership` (server.js:6001):

```js
if (teamList.length) {
  for (const team of teamList) {
    await db.run(
      `insert into team_members (workspace_id, team_id, member_id, user_id, provenance) values (?,?,?,?,?)
       on conflict(workspace_id, team_id, user_id) do update set provenance = excluded.provenance`,
      [ws.id, team, memberId, user.id, provenance],
    );
  }
}
```

**Guard the semantics:** stamp only when the caller's provenance starts with `group:` — the invite path (server.js:7009) passes `teams` with provenance `'invite'`; blanket-stamping would change invite behavior and hand group-removal logic rows it must never delete. Mirrors the D-82-7 conditional exactly:

```js
const teamProv = String(provenance || '').startsWith('group:') ? provenance : null;
```

Manual writers (PUT teams route server.js:11845) keep inserting with `provenance = null` — **the PUT route's delete-all-then-reinsert tx must be left alone**; it operates on the full set and reinserts manual rows with null provenance. Wait — that delete would also purge group-stamped rows on any manual teams edit. Ruling needed: **the PUT route's delete must skip group-provenance rows**: `delete from team_members where workspace_id = ? and user_id = ? and (provenance is null or provenance not like 'group:%')`. That preserves the same immunity doctrine as GS-01/GS-03 (manual rows immune to group logic; group rows immune to manual edit). Flag as a required change in the plan — it is the one place the existing route must be touched beyond additive code.

### 3c. Grant/upgrade arm (server.js:6949-6958)

`addMembership(ws, row, mapped.role, mapped.teamId ? [mapped.teamId] : [], 'group:' + mapped.groupGuid)` — the team row lands in addMembership's existing same-tx insert, idempotent via `insert or ignore`/on-conflict (changes-only discipline preserved: no grant delta when nothing changed). Audit action: `group_granted:group:<guid>` for both role+team and role-only grants (no new verb needed on grant), or optionally `group_team_granted` if requirements want the distinction (§8).

### 3d. Removal cell (no mapping, server.js:6879-6898)

Unchanged in shape — the existing blanket `delete from team_members where workspace_id = ? and user_id = ?` (server.js:6872) already removes group-stamped team rows when the whole membership is removed. No change.

### 3e. NEW cell: team-only sweep (membership survives, team grant dies)

The gap the blanket delete misses: the user keeps their membership (via another mapping, an invite, or a manual row) but the team-granting mapping was deleted, or its `team_id` was edited away, or the team was deleted from the doc. Recipe, appended to the per-workspace loop after the existing cells:

```js
/* Team-only sweep: group-stamped team rows whose (guid, team) pair no longer
   matches a live grant die here; rows backed by a live mapping survive. */
const groupTeamRows = await db.all(
  "select team_id, provenance from team_members where workspace_id = ? and user_id = ? and provenance like 'group:%'",
  [wsId, row.id],
);
for (const gtr of groupTeamRows) {
  const guid = gtr.provenance.slice('group:'.length);
  const backing = mappings.find(m => m.group_guid === guid && m.workspace_id === wsId); // from the :6797 load
  const stillValid = backing && backing.team_id === gtr.team_id
    && grants-team-for-this-guid-still-wins-or-is-live; // see contract below
  if (!stillValid) {
    await db.run('delete from team_members where workspace_id = ? and user_id = ? and team_id = ? and provenance = ?', [wsId, row.id, gtr.team_id, gtr.provenance]);
    // audit row `group_team_removed:group:<guid>` in own db.tx, encoded format
  }
}
```

**Orphan-deletion contract (the ruling to encode):** a group-stamped team_members row survives while (a) a live group_mappings row with that (group_guid, workspace_id) still exists AND (b) that row's team_id still equals the row's team AND (c) the team id still exists in the workspace doc. It dies otherwise. Simplest, testable, and matches the "removal-sync is lazy, at next sign-in" doctrine (R-3, server.js:9110 comment). No-op when the set is empty (zero writes — D-81-5 changes-only posture).

Selection keying is safe across mapping deletion precisely because the guid is parsed from the **row's own provenance**, never from claims — the same T-82-01/T-82-02 property the membership pass already relies on (comment at server.js:6845-6848).

---

## 4. Orphan / dead-mapping contract

**New orphan class:** a live-workspace mapping whose `team_id` no longer resolves in the workspace doc (`team-deleted`), or whose team_id was set on a workspace that is now dead (existing `workspace-deleted`/`workspace-archived` reasons already cover it).

- **Boot check (server.js:13664-13679):** the loop currently warns only on missing workspace. Extend: when mappings exist, docs for the referenced live workspaces are already cheap to fetch (only when `groupMappings.length > 0` — keep the byte-identical zero-rows boot, Pitfall 6); parse `doc.data.teams` and `logWarn('group mapping dead: group X → missing team Y in workspace Z')` per miss. Same one-line-per-dead discipline.
- **Dead-mappings route (server.js:9130-9156):** Query A's orphan predicate extends with the team check (reuse the doc-team map built for the boot logic — extract it into a small shared helper, called from boot and the route). Payload shape stays `{ orphans, trail }`; each orphan gains `deadReason: 'team-deleted'` (the card's first-colon rendering is client-side per D-08 — the SPA change is additive).
- **Reconcile behavior on a dead-team mapping:** grant arm skips the team (whitelist miss) but STILL grants the workspace role — a missing team must never silently block the role the operator mapped. Emit `group_membership_skipped`-style encoded row? No — the role grant is not skipped; log a fixed logWarn and let the dead-mappings card surface it. Suggested encoded row: `group_team_skipped:group:<guid>:dead-team` (matches the trail LIKE at server.js:9152: `action like 'group\_%:group:%' escape '\\'`).
- **Mapping DELETE route (server.js:9105-9127):** unchanged — R-3 lazy revocation stands; the team rows die at next sign-in via the §3e sweep. The confirm-dialog copy pitfall from PITFALLS.md Pitfall 1 (lazy revocation expectations) applies verbatim to team rows.

---

## 5. SPA data contracts the UI half will need

| Contract | Exists today | Notes |
|----------|-------------|-------|
| Team picker data (workspace teams) | YES — `doc.data.teams` is already in every workspace client doc; settings page renders teamsGrid (src/pages/members.js:159) | The mappings page is operator-level and may not hold the target workspace's doc — use the server-resolved team names from the extended GET (§2) instead of client resolution. |
| Member team set read/write | YES — `api.setMemberTeams` (PUT members/:uid/teams, server.js:11827) | Team-mapping UX does NOT need new member endpoints; rosters stay projected by syncProfiles. |
| Mappings list | Phase 101 GET (server.js:9059) | Extend with `teamId`/`teamName`/`teamMissing` (§2). |
| Dead-mappings card | Phase 83 (src/core/api.js:451, dead-mappings shape `{orphans, trail}`) | Additive `deadReason: 'team-deleted'`; trail picks up new `group_team_*` verbs automatically via the existing LIKE. |
| Governance page wiring | src/pages/governance.js:88, 224 | Mappings tab consumes the list + dead-mappings fill (actions.js:4731/4783 pattern) — team columns ride the same fill, no new fetch. |

Role picker discipline carries over unchanged: owner|admin|member only, no viewer (PITFALLS.md locked decision; ROLE_RANK_WITH_VIEWER at server.js:6811 stays callback-local).

---

## 6. PG matrix discipline checklist (DDL lockstep)

- [ ] `adapterEnsureColumn('group_mappings', 'team_id', 'text')` in the boot column block (both engines route through it).
- [ ] `adapterEnsureColumn('team_members', 'provenance', 'text')` same block.
- [ ] Fresh-install `create table` statements updated in **server.js SQLITE_SCHEMA** (team_members gains the column inline; group_mappings gains team_id inline) AND **db-adapter.mjs SQLITE_SCHEMA** mirrored — server.js:847/966 comments document this twin rule; team_members appears in db-adapter.mjs at ~line 568-583.
- [ ] **No PG_EPOCH_COLUMNS additions** (neither column is a timestamp; created_at/updated_at already registered).
- [ ] **No pgSchemaVariant entry** (no CHECK/collation/epoch deltas — verbatim derivation holds).
- [ ] **No index changes** (group_mappings_pair and team_members_user untouched).
- [ ] No `insert or ignore` regressions: team_members upsert with provenance must use `on conflict ... do update` (db-adapter.mjs:536 comment: pgSchemaVariant is DDL-only and does NOT rewrite `insert or ignore` — keep OR-ignore out of the new statement).
- [ ] `insert or ignore into team_members` in addMembership replaced by the on-conflict upsert → verify the PG path exercises `on conflict` (already used for memberships at server.js:6020, so the pattern is engine-proven).

---

## 7. Audit trail

Ride the existing encoded vocabulary; add only what the trail LIKE cannot already express:

| Event | Action string | New? |
|-------|---------------|------|
| Grant with team | `group_granted:group:<guid>` | No (recommend) — or `group_team_granted:group:<guid>` if requirements want role+team distinct |
| Team-only sweep removal | `group_team_removed:group:<guid>` | **Yes — needed** (membership survives; `group_membership_removed` would be a lie) |
| Dead-team skip | `group_team_skipped:group:<guid>:dead-team` | **Yes** (skips/refusals carry reason segments per D-82-9) |
| Guard refusals | `group_membership_removed:...:guard-refused` etc. | No — team rows never touch roles; owner guard & last-operator guard untouched |
| Mapping save/delete | `group_mapping_saved` / `group_mapping_deleted` | No — but the saved logInfo + audit target_name should mention the team label when set |

All new verbs start `group_` and contain `:group:<guid>` → automatically captured by the dead-mappings trail LIKE (server.js:9152). Keep PII posture: no GUIDs/emails in logWarn, only in audit rows (D-81-10).

---

## 8. Existing pitfalls that bind this work (from .planning/research/PITFALLS.md + code)

1. **Overage trap:** `resolveGroupsClaim` overage/missing → `{state:'unmapped'}` → the whole else-branch (grants AND team sweeps) is skipped — SC5/D-82-4. Team logic must live INSIDE the mapped else-branch or an overage login would sweep team rows. (Zero-cost: put the sweep in the same loop.)
2. **Viewer-rank-0 rule:** ROLE_RANK_WITH_VIEWER (server.js:6811) — any mapped role upgrades a viewer. Unchanged by teams; team rows are not roles. Do not touch the map.
3. **Last-operator guard interplay:** structurally unreachable from group logic (server.js:6849-6852 comment: grants only increase operator count, removal-sync never touches is_instance_admin). Team rows never touch roles → still unreachable. Do not duplicate the guard.
4. **Last-owner guard:** count-before-write `ownerCount` (server.js:6835, 6923). Team logic must not alter role writes → guard arms unchanged.
5. **Canonicalization funnel:** every write path stores only `canonicalizeGuid(raw)` (PITFALLS.md Pitfall 1) — the teamId addition must not bypass it.
6. **LIKE-cross-count trap:** the GET's live_members count uses exact `provenance = 'group:' || gm.group_guid` (server.js:9072, Pitfall 3). Any new team-row count in the list must use the same exact-equality, never prefix LIKE.
7. **Zero-rows boot byte-identity:** `group mappings: off` path must remain exactly one line with no doc parsing (server.js:13670-13672, Pitfall 6).
8. **PUT-teams delete conflict (NEW, found this session):** the manual PUT teams route's delete-all (server.js:11843) would purge group-stamped rows on every manual teams edit. Must be narrowed to non-group rows (§3b) — this is a required change, not optional polish.

---

## 9. Open questions for requirements

1. **One row per (group, ws) — is the plain+team combination loss acceptable?** Keeping the unique pair index forbids mapping group G to ws W twice (e.g., admin-no-team AND member-with-team). Recommended yes; two Entra groups is the workaround.
2. **Does a losing (non-winner) mapping still grant its team?** Recommended contract (§3e): yes, its team rows survive while the mapping lives — only mapping deletion / team-id edit / doc-team deletion kills them. Alternative strict reading: only the winner's team applies. Must be pinned before the reconcile phase.
3. **Audit verb for grant-with-team:** shared `group_granted` or distinct `group_team_granted`? Distinct costs nothing and makes the trail self-describing — lean distinct.
4. **Should the team-only sweep also purge group-stamped rows whose team_id vanished from the doc** (opportunistic orphan cleanup), or leave that to the dead-mappings card + operator? Recommended: sweep them (self-healing, same selection key).
5. **Mapping page copy:** confirm-dialog for deleting a team mapping must state lazy revocation AND that the workspace role also disappears if this row was the group's only mapping (the row IS the role source per the owner ruling).
