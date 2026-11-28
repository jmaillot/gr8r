# Phase 106: Team Mapping & Mapping Edit — Backend — Research

**Researched:** 2026-11-28
**Domain:** Phase-82 SSO reconcile extension (team rows) + group-mappings PATCH route + DDL lockstep
**Confidence:** HIGH — every anchor below was line-read in the live tree this session; extends `.planning/research/TEAM-MAPPING.md` (milestone recipe) and `MAPPINGS-UX.md` (SPA contracts), does not duplicate them.

## User Constraints (from REQUIREMENTS.md / ROADMAP.md — locked)

Owner rulings baked into requirements (verbatim):
- **R-6 Optional team, role unchanged** — a mapping with a team grants team membership AND the workspace role from the same row; no team = exactly v3.6 behavior.
- **R-8 Mapping edit exists** — edit = workspace/team/role/label; **GUID immutable**.
- TEAM-01..08, EDIT-01..02 as listed in `.planning/REQUIREMENTS.md` (lines 21–33); Phase 106 success criteria ×4 in ROADMAP.md:28–36.

**⚠ Ruling supersedes milestone research:** TEAM-05 ("non-winner mappings still grant their team") contradicts TEAM-MAPPING.md §3a ("Non-winner rows' teams are ignored"). REQUIREMENTS.md is later and locked — TEAM-05 wins. See §3 below for the mechanism this forces.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEAM-01 | nullable `team_id` on group_mappings, kind stays 'workspace', pair index unchanged | §2 DDL call sites (verified `adapterEnsureColumn` block server.js:1027–1176; twin rule db-adapter.mjs:246/410) |
| TEAM-02 | `team_members.provenance` conditional stamp | §2 + §4 (team_members DDL server.js:580–586 verbatim) |
| TEAM-03 | reconcile team grant/clean, provenance-keyed, team-only sweep, doc-orphan sweep | §3 insertion recipe (loop anatomy verified 6791–6976) |
| TEAM-04 | manual teams PUT delete-all narrowed to non-group rows | §4 verbatim fix at server.js:11843 |
| TEAM-05 | non-winner mappings still grant their team | §3 Option A — sync cell keys off raw mappings, not resolve() winners |
| TEAM-06 | distinct `group_team_granted` verb | §6 audit table |
| TEAM-07 | `team-deleted` orphan class + dead-team skip-still-grants | §5 boot loop 13669–13680 + dead-mappings route 9144–9146 |
| TEAM-08 | POST/PATCH team validation, refusal keys ×5 locales, honest delete copy | §7 refusal inventory |
| EDIT-01 | PATCH partial update, GUID immutable, throttle-before-gate, uniform 404 | §6 route spec cloned from DELETE 9106–9113 + workspace PATCH 11667–11693 |
| EDIT-02 | `group_mapping_updated` same-tx audit, dead rows refuse edit, dup-pair guard | §6 tx shape cloned from DELETE 9114–9124 |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| team_id column + provenance column | Boot DDL (server.js SCHEMA + adapterEnsureColumn) | db-adapter.mjs twin | dual-engine lockstep is a boot concern |
| team grant/sweep at sign-in | SSO callback reconcile pass (server.js:6791–6976) | — | lazy revocation doctrine R-3: all group-driven access changes ride the sign-in pass |
| mapping CRUD (POST/PATCH/DELETE/GET) | governance routes (server.js:8986–9156) | groups.js validation funnel | one family, one guard ladder (D-03) |
| team-deleted detection | boot warn loop + dead-mappings route | — | derived on read per D-09, no schema change |
| doc team names resolution | server-side JS map (GET route) | — | `json_extract` is SQLite-only; PG parity forbids it (TEAM-MAPPING §2) |

---

## 1. Reconcile-pass anatomy — VERIFIED insertion points (server.js 6791–6976)

Verbatim structure (all read this session):

| Anchor | What is there |
|---|---|
| 6791 | `const claimState = resolveGroupsClaim(claims);` |
| 6792–6796 | unmapped/overage branch — `continue`s nothing, the whole else-branch (all team logic) must live in the mapped path (SC5/D-82-4) |
| **6797** | `const mappings = await db.all('select group_guid, workspace_id, role, kind from group_mappings');` — **add `team_id` to this select** |
| 6798 | `const { grants, operatorFlag } = resolve(claimState.groups, mappings);` |
| 6803 | `const ROLE_RANK_WITH_VIEWER = { owner: 3, admin: 2, member: 1, viewer: 0 };` — untouched |
| 6817–6821 | `mappedByWs` build: only the WINNER per workspace enters the map (ROLE_RANK comparison) |
| 6831–6839 | `guardRefuse(wsId, guid, delta)` funnel — unchanged |
| **6840** | `groupRows` query: `"select workspace_id, role, member_id, provenance from memberships where user_id = ? and provenance like 'group:%'"` |
| **6841** | per-ws loop: `for (const wsId of new Set([...mappedByWs.keys(), ...groupRows.map(r => r.workspace_id)]))` |
| 6845 | `const existing = await db.get('select role, member_id, provenance from memberships where workspace_id = ? and user_id = ?', [wsId, row.id]);` |
| 6846–6879 | GS-01 delete cell — blanket team delete verbatim at **6872**: `await db.run('delete from team_members where workspace_id = ? and user_id = ?', [wsId, row.id]);` |
| 6888–6898 | dead/archived-ws skip + `group_membership_skipped:group:<guid>:<reason>` |
| 6900–6939 | downgrade cell (**6925**: `await addMembership(ws, row, mapped.role, [], 'group:' + guid);`) / upgrade fall-through |
| **6949** | grant arm: `await addMembership(ws, row, mapped.role, [], 'group:' + mapped.groupGuid);` |
| 6950–6955 | same-tx audit: `wasUpgrade ? \`group_role_upgraded:group:${mapped.groupGuid}\` : \`group_granted:group:${mapped.groupGuid}\`` |
| 6967–6975 | operator self-grant block — untouched |

### Where the team cells slot — the exact recipe

**Insertion point: immediately after line 6845 (`existing` fetch) and BEFORE `if (!mapped)` (6846).** Rationale: every branch below ends in `continue`, so trailing code never runs on some paths; the team sync must run on EVERY iteration of the 6841 loop, before any branch. It is independent of the membership outcome (it keys on mappings + doc, not membership) — except that the GS-01 delete cell's blanket 6872 delete then cleans any team rows it just wrote when the membership dies, which is exactly the GS-01 contract.

The cell (one db.tx, changes-only, zero writes when nothing differs):

```
for each mapping row m where m.workspace_id === wsId AND claimedSet.has(canonicalizeGuid(m.group_guid)) AND m.team_id:
    livePair = (teamId: m.team_id, guid: m.group_guid)        // winner or not — TEAM-05
delete group-stamped team rows not in livePair:
    select team_id, provenance from team_members
      where workspace_id = ? and user_id = ? and provenance like 'group:%'
    for each row whose (team_id, guid-from-provenance) ∉ livePair OR team_id ∉ doc.data.teams:
        delete that row; audit `group_team_removed:group:<guid>` in own db.tx
upsert each livePair row (provenance = 'group:' + guid) with a changes-only WHERE guard
```

Selection key: guid parsed from the **row's own provenance** (T-82-01/T-82-02 property, comment at 6849–6851) — never from claims.

**Doc-orphan sweep (opportunistic, recommended = REQUIREMENTS TEAM-03):** the same delete pass drops group-stamped rows whose team_id left `doc.data.teams` — self-healing, same selection key, no extra query.

**Dead/archived ws:** the cell must skip when the workspace is missing/archived (one extra `select doc, archived from workspaces where id = ?` — the `ws` at 6888 is fetched later and only on the mapped path). A doc parse failure → treat as no live teams (sweep-only), never throw past the fail-closed catch.

**Two `addMembership` call sites need NO change under Option A (below)** — 6925 and 6949 keep passing `[]` for teams.

### TEAM-05 forces the sync cell to key off raw `mappings`, not `resolve()`

`resolve()` (groups.js:126–157, verified) returns ONE grant per workspace: `winners.set(workspaceId, { role, groupGuid: guid });` — non-winner mappings never appear in `grants`. Granting their teams therefore cannot ride the grant arm.

**Option A (RECOMMENDED): the sync cell owns ALL group team writes.**
- Team grants upserted directly by the cell (with `provenance = 'group:' + guid`), winner and non-winner alike.
- `addMembership` (6001–6047) is **not touched at all** — its `insert or ignore into team_members` (6042) serves only invite/manual callers whose rows correctly stamp provenance null.
- Fewer touch points; changes-only controlled in one place; TEAM-05 falls out naturally.
- Deviation from TEAM-MAPPING.md §3b/§3c (which extends addMembership + passes teamId on the grant) — justified by the later TEAM-05 ruling and by the changes-only trap below. Flag to planner: this is a deliberate divergence, not an oversight.

**Option B (milestone recipe):** extend addMembership with a conditional provenance upsert and pass `mapped.teamId ? [mapped.teamId] : []` at 6949/6925. Still cannot satisfy TEAM-05 without a second cell, so Option B ends up needing Option A's cell anyway. Do not choose B.

---

## 2. DDL lockstep — VERIFIED call sites (copy these)

### Canonical pattern (server.js boot column block, 1024–1176)

Comment at 1024–1026: "the pragma table_info probe is SQLite-only; the adapter branches to information_schema on pg — one branch site, pinned in the adapter." Example to copy verbatim in shape:

```js
await adapterEnsureColumn('memberships', 'provenance', 'text');   // server.js:1037 — the direct precedent
```

**Phase 106 additions (both engine-neutral, no epoch, no variant):**
```js
await adapterEnsureColumn('group_mappings', 'team_id', 'text');
await adapterEnsureColumn('team_members', 'provenance', 'text');
```
Place them in the boot block after the existing group-related ensures (~1037 region). `PG_EPOCH_COLUMNS`: no registration (not timestamps). `pgSchemaVariant`: no entry (pg DDL derives verbatim — instance_roles comment precedent, server.js:823 area).

### SCHEMA twin rule (verified comments)

server.js:847–849 (backup_tasks comment): "**pg twin: db-adapter.mjs SQLITE_SCHEMA (pgSchemaVariant derives the pg DDL…)**". Fresh-install `create table` statements live in BOTH:
- **server.js**: `team_members` at **580–586** (verbatim: `create table if not exists team_members ( workspace_id … team_id text not null, member_id text, user_id text not null references users(id) on delete cascade, primary key (workspace_id, team_id, user_id) )` + index `team_members_user` at 587) and `group_mappings` at **801–812** (verbatim CHECKs: `role … check (role in ('owner','admin','member'))`, `kind … default 'workspace' check (kind in ('workspace','operator'))`, unique index `group_mappings_pair on group_mappings(group_guid, workspace_id)` at 812).
- **db-adapter.mjs**: `team_members` at **246–253**, `group_mappings` at **410–421**.

**Checklist:** add `team_id text` inline to both group_mappings DDLs, `provenance text` inline to both team_members DDLs, plus the two ensureColumn calls. **No index changes** (pair index stays; NULL-distinct trap avoided — TEAM-MAPPING §2). No CHECK widened → no sqliteOnly rebuild needed (the invites rebuild at 1057–1082 is the counter-example pattern, not needed here).

---

## 3. Teams storage — VERIFIED

- **Doc shape:** `JSON.parse(ctx.ws.doc)?.data?.teams` → array of `{ id, name, desc, icon, c }`; whitelist predicate verbatim at server.js:11839: `const known = new Set((JSON.parse(ctx.ws.doc)?.data?.teams || []).map(t => t?.id).filter(Boolean));`. Team *deletion* detection = absence from this set (client-side `A.delTeam` normally purges authority rows first — src/actions/teams.js:139–180 — but the server cannot rely on it: orphan rows are the pre-existing class, and a doc-deleted team without the dance is exactly the new `team-deleted` mapping-orphan class).
- **team CRUD:** only the PUT member-teams route (11827–11868, full-set replace) + client doc edits. No server-side team-definition CRUD.
- **team id cap:** both writers slice to 40 chars (`String(t).slice(0, 40)` at 6016 and 11840) — POST/PATCH team validation must slice identically.
- **liveMembers (GET, 9069–9071, VERIFIED verbatim):** `(select count(*) from memberships mm where mm.workspace_id = gm.workspace_id and mm.provenance = 'group:' || gm.group_guid) as live_members` — counts **memberships only**. Team rows live in team_members → **they cannot leak into this count; no change needed.** `dead ⇔ liveMembers === 0` discipline (MAPPINGS-UX pitfall 6) is unaffected because team grants ride an existing membership. Exact-equality (never LIKE) preserved.

---

## 4. TEAM-04 — the manual PUT teams latent bug (VERIFIED)

server.js:11842–11851, verbatim delete:
```js
await db.tx(async () => {
  await db.run('delete from team_members where workspace_id = ? and user_id = ?', [ctx.ws.id, target.id]);
```
Any manual teams edit purges group-stamped rows. Narrow (same immunity doctrine as GS-01/GS-03):
```js
await db.run("delete from team_members where workspace_id = ? and user_id = ? and (provenance is null or provenance not like 'group:%')", [ctx.ws.id, target.id]);
```
The reinsert loop (11844–11850, `insert or ignore`) then cannot resurrect group rows — correct: manual edits must not own group-stamped rows.

**changes-only trap (NEW finding):** the boot byte-identical gate and no-op re-login pins (groups-sso.test.mjs:387, :408, :692) assert zero writes via change counts. SQLite `on conflict … do update` counts a row as changed even when values are identical. The sync-cell upsert MUST carry a no-op guard, e.g. `on conflict(workspace_id, team_id, user_id) do update set provenance = excluded.provenance where team_members.provenance is not excluded.provenance` (or skip the write when the existing row already matches). Without it, every SSO login with team mappings becomes a non-zero-write login and three pins break. `insert or ignore` is NOT usable for the group path (db-adapter.mjs:536 comment: pgSchemaVariant is DDL-only and does not rewrite `insert or ignore`; `on conflict` is engine-proven via memberships at 6032–6037).

---

## 5. Orphan machinery — VERIFIED anchors

- **Boot warn loop 13669–13680:** loads `select group_guid, workspace_id from group_mappings`; zero rows → exactly `logInfo('group mappings: off')` and nothing else (byte-identical boot, Pitfall 6 — preserve). Extension: inside the `else`, also fetch the docs of referenced live workspaces (only when rows exist) and warn per missing team: `group mapping dead: group X → missing team Y in workspace Z`. Extract the doc-teams map into a small shared helper used by both boot and the dead-mappings route.
- **Dead-mappings route 9130–9156:** Query A (9144–9146) filters only `!wsIds.has(m.workspace_id)`; extend the predicate with the team check. Payload stays `{ orphans, trail }`; new `deadReason: 'team-deleted'`. Trail LIKE (9147–9151) already captures any `group_`-prefixed verb containing `:group:<guid>` — new verbs need no route change.
- **Reconcile on dead-team mapping:** role STILL grants (whitelist miss only skips the team) + fixed logWarn + encoded `group_team_skipped:group:<guid>:dead-team` row (TEAM-07).
- **DELETE mapping route 9105–9127 (VERIFIED):** tx = delete row + `group_mapping_deleted` audit ONLY — never touches memberships/team_members (comment 9100–9103). R-3 stands: team rows die at next sign-in via the §1 sweep. Delete-confirm copy must say so (TEAM-08, SPA phase).

---

## 6. PATCH route spec (EDIT-01/02) — cloned from VERIFIED precedents

### Guard ladder — copy the DELETE sibling verbatim (9106–9113), not the workspace PATCH

```
pathname match ^\/api\/governance\/group-mappings\/([A-Za-z0-9_-]{1,64})$ + PATCH
→ sameOrigin (403 crossOriginRejected)          // 9107
→ requireUser (401)                             // 9108
→ tooMany(`group-mapping-edit|${operator.id}`, 5, 15 * 60 * 1000) → 429 tooManyAttempts   // throttle key pattern from 9110: `group-mapping-delete|${operator.id}` — 403s consume a try (throttle-before-gate, T-85-04)
→ isInstanceAdmin (403 operatorOnly)            // 9111
→ db.get select of the row → !row ⇒ 404 notFound (uniform, D-01)   // 9112–9113
```
Note: workspace PATCH (11667–11693) supplies only the **partial-update body idiom** — `if (body?.name !== undefined) { …validate… }` per provided field, merge over current values, single UPDATE with `updated_at`. Its guard order (requireWorkspace BEFORE sameOrigin) is NOT the governance family order — D-03 says one family, one ladder; use DELETE's.

### Per-field validation (reuse POST funnel, 8999–9011)

| Field | Behavior | Refusal |
|---|---|---|
| `body.groupGuid !== undefined` | refuse — GUID immutable (R-8) | **new key `err.groupMappingImmutable`** (explicit refusal, house style — no silent ignore) |
| `body.role !== undefined` | `roleTokenRefusal(body.role, 'groupMappingBadRole', …)` verbatim (:9002) | existing key |
| `body.workspaceId !== undefined` | workspace existence (:9005 style); recommend live-only (archived ⇒ refuse — avoids creating dead rows via edit); dup pre-check `group_guid + new workspace_id` (:9007) + `isUniqueViolation` backstop (:9029–9037) | existing `groupMappingUnknownWorkspace` / `groupMappingDuplicate` |
| `body.teamId !== undefined` | empty/null ⇒ clear team (nullable); else slice(0,40) + doc.teams whitelist (11839 predicate) on the **effective** workspace (new if changed, current otherwise); archived ws ⇒ refuse team | **new key `err.groupMappingTeamUnknown`** |
| `body.label !== undefined` | `String().trim().slice(0,200) || null` (:9011 verbatim) | — |

**Dead rows refuse edit (EDIT-02):** if the mapping's current workspace is missing or archived (and workspaceId is not being changed to a live one), refuse keyed — **new key `err.groupMappingDead`** (keeps D-11 dead-row display-only discipline). Compute after the row fetch; this is a targeted refusal, not the generic 404.

### Tx + audit (clone DELETE 9114–9124 shape)

`db.tx` = single UPDATE (changed fields + `updated_at`) + same-tx audit row `group_mapping_updated`, actor=operator, `target_id = row.workspace_id`, detail in target_email slot in the DELETE's detail style (`group X → ws Y (admin→member, team A→B, label "…"→"…")`). `logSecurity(operator.id, 'group_mapping_updated')` + logInfo after commit (9040–9041 pattern). A forced audit failure rolls the edit back (AUD-01).

### GET extension (TEAM-08 data for SPA)

Add `gm.team_id` to the 9064–9074 select and `teamId` to the payload; resolve team names in JS: collect distinct live workspace_ids, parse each doc once into `Map<wsId, Map<teamId, name>>`, emit `teamName` (or null) + `teamMissing: team_id !== null && !map.has(team_id)`. No `json_extract` (PG parity). No throttle (read route, 9137 precedent).

---

## 7. Refusal key inventory (err.* ×5 locales: en/de/es/fr/nl)

Existing (reused, zero new): `groupMappingBadGuid`, `groupMappingUnknownWorkspace`, `groupMappingBadRole`, `groupMappingDuplicate`, `operatorOnly`, `crossOriginRejected`, `tooManyAttempts`, `notFound`, plus members-page `unknownTeam` (different surface — do NOT reuse for governance; the governance key carries governance copy).

**New (each must land in all 5 catalogue files in one commit — parity pinned per MAPPINGS-UX §4):**
1. `err.groupMappingImmutable` — PATCH body carries groupGuid
2. `err.groupMappingTeamUnknown` — teamId not in the workspace doc.teams (POST + PATCH)
3. `err.groupMappingDead` — dead row edit refusal (EDIT-02)

Audit/encoded vocabulary (not err keys): `group_team_granted:group:<guid>` (TEAM-06 distinct verb), `group_team_removed:group:<guid>`, `group_team_skipped:group:<guid>:dead-team`, `group_mapping_updated`. All start `group_` + contain `:group:<guid>` → auto-captured by the 9151 trail LIKE.

## 8. Don't Hand-Roll

| Problem | Use instead |
|---|---|
| GUID validation | `guidRefusal` + `canonicalizeGuid` (groups.js:54, 9001) |
| Role validation | `roleTokenRefusal` (groups.js:64) |
| Guard ladder / throttle | DELETE sibling 9106–9113 verbatim |
| Partial-update idiom | workspace PATCH 11675–11688 shape |
| Doc-teams whitelist | 11839 predicate verbatim |
| Unique-race backstop | `isUniqueViolation` (9035) |
| Dead-mapping detection | shared doc-teams helper (new, called from boot + route) |

## 9. Test plan — existing pins + new coverage

### Pins that MUST NOT break (verified test inventory)

`test/groups-sso.test.mjs`:
- :105 Pin C — memberships provenance conditional (team work must not touch that clause)
- :387 byte-identical gate (no rows → zero writes) and :408/:692 changes-only re-login pins → **the changes-only upsert guard (§4) is what protects these**
- :529 overage SC5 (no writes when unmapped — sync cell lives inside the mapped else-branch)
- :609 GS-01 lost-claim removal (blanket 6872 delete still removes team rows)
- :655 viewer upgrade / :760 "no team writes" edge probe — still holds when user has no team-bearing mappings

`test/group-mappings-api.test.mjs`: :71/:81/:95 gate ladder, :112 flat rows, :150 dead hints, :187 liveMembers exact-equality (Pitfall 3 — team rows must never enter that count), :217 throttle-before-gate 429, :235 uniform 404, :253 DELETE byte-identical memberships+team_members, :297 trail WR-83-03 SAFE pin, :316 isUniqueViolation. **PATCH inherits this whole matrix shape 1:1.**

`test/db-adapter.test.mjs`: pg-parity static case pattern (101-01 pgSchemaVariant pin) — any new SQL (sync-cell upsert, PATCH update, GET team select) needs a placeholder-complete `toPgSql` parity pin.

### New tests (placement)

- `test/groups-sso.test.mjs` (extend) or new `test/groups-teams-sso.test.mjs`: grant with team stamps `provenance group:<guid>` on team_members; non-winner team grant (TEAM-05); team-only sweep (mapping deleted → team row gone, membership survives); doc-orphan sweep; dead-team skip-still-grants + `group_team_skipped` row; changes-only re-login with a team mapping; overage leaves team rows alone; TEAM-04 PUT narrowing (manual edit preserves group rows).
- `test/group-mappings-api.test.mjs` (extend): PATCH ladder 401/403/429/404, per-field refusals incl. immutable GUID + dead-row refusal, dup-pair on workspace change, `group_mapping_updated` same-tx byte-count, team validation POST/PATCH, GET teamId/teamName/teamMissing payload.
- i18n parity: 3 new err keys ×5 catalogues (mappings-client parity pattern; catalogue/Dockerfile contract tests if shape changes).

## 10. Common Pitfalls (phase-specific, all code-verified)

1. **`continue`-terminated branches:** team cells inserted after the branch chain never run on some paths — insert at 6845.5, before `if (!mapped)`.
2. **changes-only violation:** unconditional `do update` upsert breaks three byte-identical pins (§4). WHERE-guard mandatory.
3. **`insert or ignore` on pg:** never introduce a new `insert or ignore` (db-adapter.mjs:536 comment) — use `on conflict` (engine-proven at 6032).
4. **liveMembers pollution:** count is memberships-only with exact equality (9071) — leave untouched; team-derived counts, if ever added, follow the same exact-equality rule.
5. **`json_extract` in GET:** SQLite-only — resolve team names in JS.
6. **Boot byte-identity:** zero-rows path at 13670–13672 stays exactly one logInfo line; doc parsing only inside the rows-exist else.
7. **Throttle-before-gate on PATCH:** 403s consume a try (9110 comment, T-85-04); key `group-mapping-edit|${operator.id}`.
8. **PUT-teams delete (TEAM-04):** required change, not polish — without it every manual roster edit purges group team rows.
9. **GUID funnel:** PATCH accepts no GUID; POST/PATCH never bypass canonicalization.
10. **PII posture:** logWarn lines carry no GUID/email (D-81-10) — GUIDs only in audit rows.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | SQLite counts a no-op `do update` as a change (changes-only trap); the `where team_members.provenance is not excluded.provenance` guard suppresses it | §4 | pins break → revert to explicit pre-select + conditional write (cheap) |
| A2 | Exact refusal key names (`groupMappingImmutable`/`groupMappingTeamUnknown`/`groupMappingDead`) — naming convention derived from existing family; keys themselves are new, so no compile risk, only copy review | §7 | locale copy review at UAT |
| A3 | Option A vs milestone Option B divergence — mechanism choice, behavior identical | §1 | none functional; flagged for planner sign-off |

All other claims are `[VERIFIED: server.js/groups.js/db-adapter.mjs/test/*.test.mjs line-read this session]` with anchors inline.

## Open Questions

1. **Archived-ws mapping via PATCH** — recommend refuse (live-only) to avoid creating dead rows; POST keeps its current existence-only check for plain rows. Confirm with owner during discuss if contested.
2. **Downgrade arm team handling (6925)** — under Option A the sync cell handles teams, so 6925 stays `[]`; the winner's team rides the sync cell too, making 6949's `[]` also final. Confirm the planner accepts the sync cell as the single team-writer (cleanest; removes any addMembership signature change).

## Sources

- Primary (HIGH): server.js 555–587, 801–812, 1020–1176, 5995–6047, 6780–7109, 8980–9156, 11655–11869, 13655–13684; groups.js 54–64, 113–157; db-adapter.mjs 246–253, 410–421, ~536; test/groups-sso.test.mjs, test/group-mappings-api.test.mjs (test inventory read); REQUIREMENTS.md, ROADMAP.md Phase 106; milestone research TEAM-MAPPING.md (2a185f8b), MAPPINGS-UX.md.
