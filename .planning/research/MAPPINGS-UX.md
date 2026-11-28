# Research: v3.7 Mappings UX & Team Mapping (SPA + data contracts)

**Domain:** Operator-facing Mappings SPA redesign (sections/tables) + backend contracts for usage log, edit route, team field
**Researched:** 2026-11-28
**Mode:** Ecosystem/feasibility over an existing opinionated codebase — zero new dependencies, everything rides verified house seams
**Overall confidence:** HIGH (every anchor line-read in the live tree)

---

## 1. Table recipes to copy (line-verified)

### 1a. The house data table: `<table class="perm-t">` — governance.js pattern

The SPA has exactly one real `<table>` idiom, used in governance.js, backup.js, members.js, projects.js, home.js, overview.js. It is a **static, non-sorting table** — verified: `grep sort|th data-a|sortBy` in backup.js returns only data-side sorts (`backup.js:314` `].sort((a, b) => b.at - a.at)`); there is **no column-sorting precedent, no sticky-header CSS anywhere** in src/pages. If the owner wants sortable columns it is a NEW pattern — flag as a decision, don't assume it exists.

Canonical shape — `src/pages/governance.js:104` (workspaces table):

```
<table class="perm-t" style="min-width:880px">
  <thead><tr><th style="padding-left:14px">Col 1</th><th style="text-align:left">Col 2</th>…<th></th></tr></thead>
  <tbody>${rows.map(wsRow).join('')}</tbody>
</table>
```

- Wrapped in `<div class="panel" style="overflow-x:auto">` (governance.js:113, backup.js:320, backup.js:429) — the panel carries the scroll, not the table.
- First `<th>` always gets `style="padding-left:14px"`; last `<th>` is empty (actions gutter).
- Row cells: `<td>` with `style="text-align:left"` on text columns; mixed alignment is per-column inline, no utility classes.
- Empty state swaps in for the whole `<table>` via `empty('icon', title, body, '', 'sm', 3)` (governance.js:102/105 — three-tier: loading → rows → empty).

### 1b. backup.js history table (the closest multi-section analog)

`src/pages/backup.js:320` — `<table class="perm-t hist-t" style="min-width:820px">` with 6 columns + trailing empty `<th>`; rows are pre-merged strings (`merged.map(m => m.row)`). `backup.js:429` is a second table on the same page (tasks console) with `text-align:left` per th. **This page proves the multi-table-per-page pattern works in this codebase** — Mappings will have 3 sections, each its own `<table>`/`<tr>` builder.

### 1c. `srow()` vs `<table>`

`mappings.js` today uses `srow(...)` (imported from `./settings.js:21`) — a flex-row card, NOT a table. Governance's Super Admin roster also uses `srow` (governance.js:170–181). **The redesign should migrate the mappings list from srow to the governance.js:104 `<table>` idiom** — the owner spec ("a proper TABLE") maps 1:1 onto it. Keep `srow` only if a section is genuinely 2-column.

### 1d. esc() discipline (non-negotiable, T-79-10/T-102-04)

Every payload string renders through `esc()` at EVERY render — including staged repaints (mappings.js:38 comment). Value attributes too (create form :124/:126). The dead card `label` and `group_guid` are opaque carried values (mappings.js:143). Any new column (team name, usage-log actor names, group labels in the usage log) must go through `esc()` — `mappings-client.test.mjs` (f) statically pins this per field; extend the assertion list for every new interpolated field.

---

## 2. Current mappings.js structure (where sections slot)

`src/pages/mappings.js` (182 lines, single render funnel):

| Piece | Anchor | Role |
|---|---|---|
| `full403` / `fullErr` | :28–31 | Verbatim governance fullstates; page returns early on `S.ui.mapErr.status` (:68–69) |
| `pageMappings()` | :64–89 | Render funnel: 403/err → loading → rows (mapRow) → empty → `${mapCreateForm()}` → `${govDeadCard()}` if `api.user?.isInstanceAdmin` |
| `mapRow` | :40–62 | srow row: label+role badge+dead badge, wsName+guid+liveMembers chip+ago() dates, staged-delete ctl. Dead badge by `deadReason` (:44–46), chip via `{n}` interpolation (:49), staged inline-confirm `S.ui.mapStage === m.id` (:54–56) |
| `mapCreateForm` | :104–133 | Always-visible panel; draft in `S.ui.mapForm` via `IN.mapGuid/…` (:4803–4822 in actions.js); ws pool `S.ui.mapWs`; role select rides `common.role.*` |
| `govDeadCard` | :150–172 | DISPLAY-ONLY orphans + refused-guard trail, FIRST-colon split (:159–162), zero `data-a` (D-11), hidden when both lists empty (:155) |
| `mapTeardown` | :178–181 | `ROUTE_TEARDOWN.mappings` — clears `mapStage` + `mapForm` on route exit |

State slots (actions.js): `S.ui.mapRows` (:4770), `S.ui.mapWs` (:4782), `S.ui.govDead` (:4787), `S.ui.mapErr` (:4775), `S.ui.mapForm`, `S.ui.mapStage`. Fill loop `refreshMappings` (:4762–4790) — monotonic seq + AbortController, NO auto-poll, 401 silent bail (D-28), fetch never gated on `api.oidcEnabled`.

**Where the new sections slot in `pageMappings()`:** after the mappings table sblock (:84–86), add (2) "Dead group mappings" table section (replaces/absorbs `govDeadCard`'s orphan half — keep it operator-gated :87 discipline) and (3) "Usage Log" section. Each section = `sblock` + `h2` + `hint` + `panel` with `perm-t` table, exactly the `govDeadCard` wrapper shape (:171). New state slots follow the governance `{rows, recent}` one-GET idiom — do NOT add per-section fill loops; extend `refreshMappings` (it already sequences three fetches with one seq, :4767–4787).

---

## 3. API contracts (server-side verified, server.js)

### 3a. Mappings list GET — what it returns today vs what the table needs

`GET /api/governance/group-mappings` (server.js:9059–9092): one query, LEFT JOIN workspaces, correlated count, flat camelCase rows: `id, groupGuid, workspaceId, workspaceName, workspaceSlug, role, kind, label, createdAt, updatedAt, dead, deadReason, liveMembers`.

**Column mapping to the owner's spec:**

| Owner column | Today | Verdict |
|---|---|---|
| Label | `label` | ✓ |
| Group ID | `groupGuid` | ✓ (mono cell, esc()) |
| Workspace | `workspaceName` (+ dead hint) | ✓ |
| Team | — | ✗ NEW — needs `teamId`/`teamName` fields (see §3d) |
| Role | `role` | ✓ |
| Number of users added | `liveMembers` — **already server-side** via `provenance = 'group:' || gm.group_guid` exact-equality count (:9069–9071). It is a COUNT of current group-derived members, not a cumulative "users added by mapping ever" — if the owner wants cumulative-added, that is NOT derivable today; usage-log `group_granted` count per GUID would approximate it. Flag as decision. | ✓ as-is |
| When | `createdAt`/`updatedAt` | ✓ (pick one — owner spec says "When"; ago() both or updatedAt) |

**Recommendation: extend the existing GET (add team fields), no separate usage endpoint.** The correlated-count pattern is already the seam (:9069); a team name join is trivial (`w.doc` parse or a join onto team_members isn't needed — team names live in the workspace document, see §3d). Separate endpoints would multiply the fill loop fetches for zero benefit on a low-frequency surface.

### 3b. Usage Log — audit-trail read path (clone the dead-mappings + instance-roles seams)

The audit vocabulary for the owner's five lifecycle actions is ALREADY encoded and self-selecting. Verified actions (all written at sign-in reconcile, actor === affected user, `actor_id === target_id === user.id`):

| Owner column "Action" | Encoded audit action | Anchor |
|---|---|---|
| granted | `group_granted:group:<guid>` | server.js:6953 |
| upgraded | `group_role_upgraded:group:<guid>` | server.js:6953 (`wasUpgrade` branch) |
| downgraded | `group_role_downgraded:group:<guid>:mapped-lower` | server.js:6932 |
| removed | `group_membership_removed:group:<guid>:lost-claim` | server.js:6876 |
| guard-refused | `group_membership_removed:group:<guid>:guard-refused` | server.js:6836 (`group_${delta}:group:${guid}:guard-refused`) |
| (also present: `group_membership_skipped:group:<guid>:<reason>` — :6895. Include or filter? Decision.) | | |

**The dead-mappings trail LIKE already selects exactly this family** — server.js:9151: `action like 'group\\_%:group:%' escape '\\'` (escaped `_`, WR-83-03 pin). Mapping-level rows (`group_mapping_saved` :9040, `group_mapping_deleted` :9125) carry NO `:group:` segment, so the LIKE excludes them — which matches the owner's "group lifecycle audit actions" ruling.

**Contract proposal — clone the instance-roles `{roles, recent}` idiom (server.js:9181–9194):**
- Option A (recommended): extend the existing dead-mappings GET (server.js:9130) to return `{ orphans, trail, usage }` — it already runs the trail query; add `target_name, target_email` to the SELECT (:9151) and a `usage` slice with a **larger cap (e.g. 100, same discretion bound — owner gets a visible cap note like governance.js:214 `superCapNote`)**. Zero new routes, one fill-loop fetch already sequenced.
- Option B: separate `GET /api/governance/group-usage` with `?before=<created_at>` cursor pagination. Only if the owner rejects the 100-cap.
- **No true pagination precedent exists** for any audit read in this codebase — every trail is `order by created_at desc limit N` (dead-mappings :9151, instance-roles :9188 limit 8). Copy that; don't invent cursor pagination.

**"Group Name" column:** derive client-side from `S.ui.mapRows` label lookup by `groupGuid`; raw GUID when no mapping matches (owner accepted). **Server stays dumb (D-06)** — do NOT pre-join labels server-side (the dead-mappings route doctrine explicitly forbids transforming encoded action strings, :9141–9143). Client split uses the existing `splitFirst` helper (mappings.js:159).

**"Who (the affected user)" column:** `target_name` (fallback `target_email` — the instance-roles recent idiom, :9192 `targetName: a.target_name || a.target_id`). Note the client must also render `workspace_id` (already selected) if a workspace column is wanted.

### 3c. Edit route — PATCH, not PUT

Precedent split, verified:

| Route | Method | Semantics | Anchor |
|---|---|---|---|
| `/api/workspaces/:slug` | **PATCH** | **partial**: `if (body?.name !== undefined) …` per-field, validation only on provided fields | server.js:11667–11692 |
| `/api/auth/me`, `/api/auth/password` | PATCH | partial | :7186, :7545 |
| webhook hooks | PATCH \| DELETE | partial | :8396 |
| `/api/me/notif-prefs`, `/api/me/views` | PUT | full replace of a JSON blob | :7213, :7457 |
| backup task | PUT | full replace (client sends whole task — `backupTaskUpdate` "partial-PUT" comment, i18n-core test :171) | :9611 |

**Recommendation: `PATCH /api/governance/group-mappings/:id`** — the edit is per-field (change workspace OR team OR role OR label), which is the workspace PATCH shape verbatim. Guard ladder copied from the DELETE sibling (:9106–9113): sameOrigin → requireUser → **throttle-before-gate** (`tooMany('group-mapping-edit|<op-id>', 5, 15min)`, 403s consume a try) → isInstanceAdmin → then validation → uniform `404 notFound` for unknown id (D-01, :9113 precedent).

Validation funnel reuse (from the POST, :8999–9008):
- **workspaceId provided** → workspace-existence check (:9005 style) + duplicate pair pre-check `group_guid + workspace_id` (:9007) + constraint backstop via `isUniqueViolation` (:9035 — the same pre-check race exists on a workspace change).
- **role provided** → `roleTokenRefusal(body.role, 'groupMappingBadRole', …)` (:9002) — reuse verbatim, zero new keys.
- **label provided** → `String().trim().slice(0,200) || null` (:9011).
- **GUID never accepted in body** — if `body.groupGuid !== undefined`, refuse keyed (`groupMappingImmutable` — new key ×5) or silently ignore; recommend explicit keyed refusal (no silent-semantics, the house style).
- **Edit must run inside `db.tx` with a same-tx audit row**, mirroring DELETE (:9114–9124): new action **`group_mapping_updated`** with old→new values in the target_email detail column (`group X → ws Y (admin→member, label "A"→"B")`) + `logSecurity` after commit. Write `updated_at`.
- **Re-validation on workspace change:** the new ws must be live (not archived) or refuse — today POST only checks existence (:9005); archived-ws mappings are exactly the "dead" state the UI badges. Decision: allow mapping onto an archived ws (it'll show dead) or refuse? Recommend refuse with `groupMappingUnknownWorkspace` reuse to avoid creating dead rows through edit.

### 3d. Team mapping — the data model problem (BIGGEST open design item)

Verified facts:
- `group_mappings` has `kind` column (always `'workspace'` today, :9018) — **the schema already anticipates a second kind**. Add a nullable `team_id` column (via `adapterEnsureColumn`, server.js:1041 precedent) rather than a new table.
- Teams are **not a table**: team definitions live in `workspaces.doc.data.teams[]` (id+name), authority in `team_members` (workspace_id, team_id, member_id, user_id; server.js:574–585 comment). Team-id whitelist pattern: `JSON.parse(ctx.ws.doc)?.data?.teams` set-membership (server.js:11840–11842, `unknownTeam` keyed refusal).
- The reconcile (`resolve(claimState.groups, mappings)` in groups.js, server.js:6798) takes workspace mappings only; a team-kind mapping must extend resolve() to produce team grants (team_members upsert) AND the GS-01 removal cell (:6870–6878 already deletes team_members rows alongside memberships — the removal machinery is ready).
- `liveMembers` count counts memberships, not team_members — a team-kind mapping's count must count `team_members` for its GUID provenance (or both). Decision needed.

**Proposal:** mapping row gets `kind='team'` + `team_id`; workspace_id still required (team is workspace-scoped); GET joins team name by parsing each distinct workspace doc once (small N, operator-only). Reconcile grants = team_members insert with provenance `group:<guid>`; removal deletes from team_members only. **This is phase-research-grade complexity — flag for a dedicated team-mapping phase, do not bundle into the UX phase.**

### 3e. Edit ↔ staged-delete copy interplay

`page.mappings.deleteCopy` (:2110) explains lazy revocation at next sign-in. Editing role DOWN (e.g. owner→member) has the same lazy-revocation semantics — but it's NOT immediate (reconcile at next sign-in, :6804). If edit lands, the deleteCopy stays accurate for delete only; an edit form needs its own copy. Staged-delete flow (mapDeleteAsk/Cancel/Confirm trio :4853–4872) is untouched by edit; the edit affordance slots into `mapRow`'s `ctl` (:54–56) next to Delete — **edit of a DEAD row should be disabled** (the row's ws is gone; editing ws is the only sensible edit — decision: allow it as a "repair" affordance or disable? The dead card is display-only D-11 today; enabling edit on dead rows is the first crack in that ruling — needs owner sign-off).

---

## 4. i18n inventory sketch (×5 catalogues, en/de/es/fr/nl)

Existing `page.mappings.*` keys: ~24 (en.json:2090–2165). Existing err keys: `err.groupMappingBadGuid/UnknownWorkspace/BadRole/Duplicate` (all locales :1820–1823).

**New keys needed (each ×5):**

| Group | Keys |
|---|---|
| Table headers | `page.mappings.colLabel`, `colGuid`, `colWorkspace`, `colTeam`, `colRole`, `colUsers`, `colWhen` |
| Dead section (upgrade of existing dead* keys) | `page.mappings.deadColGuid`, `deadColWorkspace`, `deadColLastSeen`; reuse `deadTitle`/`deadLead`/`deadOrphans`; retire-or-reuse `deadTrail` |
| Usage log section | `page.mappings.usageTitle`, `usageLead`, `usageColAction`, `usageColType` (droppable if owner confirms), `usageColGuid`, `usageColGroup`, `usageColWho`, `usageColWhen`, `usageEmptyTitle`, `usageEmptyBody`, `usageCapNote` (governance.js:214 interpolation `{shown}/{total}` style) |
| Action labels | `usage.action.granted`, `usage.action.upgraded`, `usage.action.downgraded`, `usage.action.removed`, `usage.action.guardRefused`, `usage.action.skipped` (+ `usage.reason.lostClaim`, `usage.reason.guardRefused`, `usage.reason.deadWorkspace`, `usage.reason.archivedWorkspace` for the tail segment) |
| Edit | `page.mappings.edit`, `editTitle`, `editLead`, `editSave`, `savedToast`, `err.groupMappingImmutable`, `err.groupMappingTeamUnknown` (if team field) |
| Team field | `page.mappings.teamLabel`, `teamPlaceholder`, `teamNone` (workspace-only mapping), `colTeam` cell dash for kind=workspace |

Parity discipline: every key lands in all 5 JSON files in the same commit (mappings-client test (d) pattern asserts ×5 presence); the Dockerfile i18n contract test (groups-config-api.test.mjs:225 style) pins catalogue shape.

---

## 5. Test patterns to copy

1. **`test/mappings-client.test.mjs`** — static source assertions, no DOM harness: (a) route id, (b) nav gate regex, (c) lazy-import regex, (d) ×5 key parity (imports all 5 JSONs, asserts each key), (e) AbortController + 401 bail in the fill loop, (f) esc() coverage regexes per interpolated field. Extend: every new table column's esc() gets a (f)-style regex; new sections get structure assertions; the cap-note interpolation gets a parity case.
2. **`test/group-mappings-api.test.mjs`** — live-server e2e via `startServer`/`login` helpers (`test/helpers/server.mjs`): 401/403×2 gate ladder, throttle-before-gate 429 (6th attempt), uniform 404, same-tx audit byte-count, byte-identical untouched-tables diff (R-3). The PATCH route inherits the whole DELETE test matrix shape 1:1.
3. **`test/db-adapter.test.mjs`** pg-parity static case (101-01: pgSchemaVariant `group_mappings_pair`) — any new SQL (team join, usage SELECT, PATCH update) needs a placeholder-complete `toPgSql` parity pin.
4. **i18n Dockerfile contract** (groups-config-api.test.mjs:225) if locale file shape changes.

---

## 6. Pitfalls (phase-relevant, from verified code)

1. **The trail LIKE is the selection contract** — `group\_%:group:%` escape `'\\'` (WR-83-03, server.js:9147–9151). Never switch to `LIKE 'group_%'` unescaped (matches `group_mapping_saved` too) — that would silently pollute the Usage Log with mapping-configuration rows the owner excluded.
2. **Exact-equality provenance counts** — never a prefix LIKE (:9054–9056 Pitfall 3). A team-members count must use the same discipline.
3. **Server stays dumb on encoded actions** — FIRST-colon split is client-side (mappings.js:159 D-08). Don't pre-split server-side for the Usage Log columns.
4. **Throttle-before-gate on every mutation** (:9110, T-85-04) — PATCH is a mutation; 403s consume a try.
5. **No auto-poll, no new fill loops** — one seq, extended refreshMappings (:4762).
6. **Dead rows**: `dead ⇔ liveMembers === 0` discipline (MILESTONES.md) breaks once team-kind mappings exist if the count only covers memberships — reconcile the definition when team mapping lands.

---

## 7. Open questions for requirements

1. **"Users added" semantics:** current `liveMembers` (count of members whose row is group-derived right now) vs cumulative-ever-added (not derivable without counting `group_granted` audit rows per GUID). Owner ruling needed.
2. **Usage log cap & skipped rows:** fixed 100 with visible cap-note (recommended) vs cursor pagination (no precedent — new pattern); include `group_membership_skipped` rows or filter them out?
3. **Edit on dead rows:** allowed (repair affordance, first crack in D-11 display-only) or disabled?
4. **PATCH vs per-field immutability:** refuse `groupGuid` in body with a new keyed refusal (recommended) vs silent ignore.
5. **Team mapping model:** kind='team' + team_id column + reconcile extension (resolve() signature change in groups.js + team grant/removal cells) — needs its own phase plan; also decide whether team mappings can be created without the workspace-scoped doc.teams whitelist check failing for cross-dialect (pg) parity.
6. **Usage-log "Type" column:** owner already suspects droppable — drop it (all rows are group-family).
7. **Sortable columns:** no house precedent — new CSS/JS pattern if wanted; recommend shipping static tables first (governance.js:104 verbatim) and deferring sorting.
