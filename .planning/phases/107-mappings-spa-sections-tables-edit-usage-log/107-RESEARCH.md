# Phase 107: Mappings SPA — Sections, Tables, Edit UI, Usage Log — Research

**Researched:** 2026-11-28 (post-106 tree, all anchors line-verified TODAY)
**Domain:** Client SPA restructure over the Phase 106 verified backend (PATCH + team fields + team validation)
**Confidence:** HIGH — every file/line below was opened this session; no ecosystem research needed (zero-dependency house SPA)

<user_constraints>
## User Constraints (from CONTEXT.md / REQUIREMENTS / ROADMAP)

### Locked (from REQUIREMENTS.md:37–41, ROADMAP.md:52–68)
- **SPA-01** Mappings table (`perm-t` idiom): Label / Group ID / Workspace / Team (— when unset) / Role / Users added (`liveMembers` = **current-members** semantics, documented) / When.
- **SPA-02** Edit UI — inline or drawer, workspace/team/role/label editable, **GUID read-only display**, staged confirm consistent with the delete flow; ×5 copy.
- **SPA-03** "Dead group mappings" **table** replacing the v3.6 card.
- **SPA-04** "Usage Log" table: five lifecycle actions (R-7), Who = `target_name`, **cap 100 newest + visible cap-note, no pagination in v1**; consumes the extended dead-trail GET (`{orphans, trail, usage}`).
- **SPA-05** Create-form team picker fed by the **chosen workspace's doc.teams**, hidden/disabled until a workspace is chosen.
- **TEAM-08** (from 106-02-SUMMARY HANDOFF, verbatim): the delete-confirm copy must tell the operator that deleting does NOT remove access immediately (mapped members lapse at next sign-in when the reconcile pass reads the mappings table), **and that if this row is the group's ONLY mapping for that workspace, members lose their workspace role at that same next sign-in**. Server DELETE contract unchanged; this is client-side copy only.

### Success criteria (ROADMAP.md:62–66)
1. Three sections render as tables from the extended list GET; esc() on every cell.
2. Edit round-trips through PATCH; GUID immutability visible client-side too.
3. Usage log shows granted/upgraded/downgraded/removed/guard-refused with honest Group Name (raw GUID when mapping deleted); cap-note visible at cap.
4. Team picker only offers teams of the selected workspace; ×5 locale parity; i18n-scan + client test pins green.

### Post-106 backend reality (VERIFIED this session — 106 is DONE, do not re-plan it)
- PATCH `/api/governance/group-mappings/:id` exists: ladder sameOrigin → requireUser → tooMany(`group-mapping-edit|<operator.id>`, 5/15min) → isInstanceAdmin → uniform 404. Body: `workspaceId` / `teamId` (null clears) / `role` / `label` — all optional, per-field merge. `groupGuid` in body → 400 `groupMappingImmutable`. Dead rows → 400 `groupMappingDead` UNLESS retargeting to a LIVE workspace in the same PATCH (sanctioned repair). Team validated against the EFFECTIVE workspace doc (targetWsRow || curWsRow). [VERIFIED: server.js:9345–9394; test/group-mappings-api.test.mjs:443–645]
- List GET rows now carry `teamId` (null when unset), `teamName` (null when the team left the doc), `teamMissing` (**use `teamMissing`, not a falsy name check, for the honest "team no longer exists" state** — 106-02 handoff). [VERIFIED: server.js:9246–9248]
- POST accepts optional `teamId`, validated against the workspace doc.teams whitelist. [VERIFIED: server.js:9151–9169]
- New err keys already exist ×5: `err.groupMappingImmutable` (:1824), `err.groupMappingTeamUnknown` (:1825), `err.groupMappingDead` (:1826) — **zero new err keys needed in 107**. [VERIFIED: src/locales/en.json:1824–1826]
- New audit verbs from 106-01 ride the SAME trail LIKE: `group_team_granted:group:<guid>` (server.js:6977), `group_team_removed:group:<guid>` (:6951), `group_team_skipped:group:<guid>:dead-team` (:6925) — the Usage Log WILL show team rows; label them. [VERIFIED: server.js:6925/6951/6977; LIKE at server.js:9427]
- `team_members.provenance` + `group_mappings.team_id` columns exist; deadReason gains `'team-deleted'`. [VERIFIED: 106-01-SUMMARY; server.js:9419–9422]
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SPA-01 | Mappings table, 7 columns | §2 recipe 1: replace `mapRow` srow with `mapTr` `<tr>` builder; payload already carries every column (team fields since 106) |
| SPA-02 | Edit UI + GUID read-only | §4: modal via the `openModal`/`govEditBody` idiom (actions.js:6326, governance.js:386) + `api.groupMappingUpdate` PATCH method |
| SPA-03 | Dead mappings table | §2 recipe 2: replace `govDeadCard` srow rows with `perm-t` tables, same `S.ui.govDead` payload |
| SPA-04 | Usage Log table + cap-note | §3: server extends dead-trail GET with `usage` slice (+target_name in trail); client action-label map §3.2 |
| SPA-05 | Team picker fed by doc.teams | §5: **operatorWorkspaces payload does NOT carry teams today** — extend it server-side (small task), then picker options from `S.ui.mapWs[].teams` |
| TEAM-08 | Delete-copy role-loss clause | §6: conditional append keyed on client-side only-mapping count |
</phase_requirements>

## Summary

The backend for every SPA requirement is already live (106 shipped PATCH, team fields, team validation, 3 new err keys ×5). Phase 107 is overwhelmingly client work in 4 files: `src/pages/mappings.js` (restructure into 3 table sections), `src/actions/actions.js` (edit + team-picker handlers, delete-copy clause), `src/core/api.js` (one new method), and the 5 locale files. **Two small server edits are in scope**: (1) the dead-trail GET still returns `{orphans, trail}` — SPA-04's `usage` slice must be added there (server.js:9428), and the trail SELECT must gain `target_name, target_email`; (2) the team picker has no feed — `GET /api/auth/operator/workspaces` (server.js:8835–8863) returns no doc/teams, so its payload needs a `teams: [{id,name}]` array parsed from each workspace doc (the `docTeamNames` helper from 106-02 is reusable verbatim).

**Primary recommendation:** three `perm-t` sections in `pageMappings()` fed by the extended `refreshMappings` (no new fill loops); edit via the `govEditBody`/`openModal` modal idiom staged in `S.ui.mapEdit`; delete-copy clause appended client-side when `mapRows` has exactly one row for the row's `(groupGuid, workspaceId)`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Table rendering (3 sections) | Client (SPA page) | — | Server stays dumb data (D-06); FIRST-colon splits are client-side (D-08) |
| Edit validation | API (PATCH route, done) | Client (light pre-checks only) | Server is funnel of record; client does D-08-style light checks |
| Usage log columns (action → label, Who) | Client | API (raw audit rows) | Server never transforms encoded actions (:9409–9411 doctrine) |
| Cap enforcement (100) | API | Client (visible cap-note) | Server `limit 100` is the bound; client renders `{shown}/{total}` |
| Team picker whitelist | API (doc.teams validation, done) | Client (picker options from operatorWorkspaces teams feed) | Client picker is cosmetic; server refuses unknown team (D-11 posture) |
| Only-mapping derivation for TEAM-08 copy | Client | — | Pure display logic over `S.ui.mapRows` |

## 1. Where the three sections slot in mappings.js (post-102/106 tree, 182 lines)

Current structure [VERIFIED: src/pages/mappings.js, read today]:

| Piece | Anchor | 107 fate |
|---|---|---|
| `full403` / `fullErr` | :28–31 | unchanged |
| `mapRow` (srow) | :40–62 | **replaced** by `mapTr(m)` `<tr>` builder (SPA-01) + Edit button |
| `pageMappings()` render funnel | :64–89 | restructured: header → create form → **sblock 1 "Mappings" table** → **sblock 2 "Dead group mappings" table** → **sblock 3 "Usage Log" table** |
| `mapCreateForm` | :104–133 | extended with team picker (SPA-05) |
| `govDeadCard` | :150–172 | **replaced** by dead-table section; keep `splitFirst` (D-08) and the zero-`data-a`-in-dead-region test discipline — note test (mappings-client.test.mjs:341–347) pins "all data-a BEFORE the dead-card region marker"; the marker string `83-02 DEAD-MAPPING WARNING CARD` must be renamed coherently |
| `mapTeardown` | :178–181 | extend: also clear `S.ui.mapEdit` |
| `ROUTE_TEARDOWN.mappings` | :182 | unchanged registration |

Render funnel target (keeping every existing discipline: :68–69 fullstates, :71–72 loading + in-render kick, :87 operator gate for the admin-only sections):

```js
return `<div class="page wide" style="max-width:1200px">
  <div class="ph">…</div>
  ${mapCreateForm()}
  <div class="sblock"> <h2>…mappings…</h2><p class="hint">…</p>
    <div class="panel" style="overflow-x:auto">${mappingsBody}</div> </div>
  ${api.user?.isInstanceAdmin ? deadSection() : ''}
  ${api.user?.isInstanceAdmin ? usageSection() : ''}
</div>`;
```

### Table idiom — copy verbatim from governance.js:104 [VERIFIED this session]

```js
`<table class="perm-t" style="min-width:880px"><thead><tr><th style="padding-left:14px">${t('…colLabel')}</th><th style="text-align:left">${t('…')}</th>…<th></th></tr></thead><tbody>${rows.map(mapTr).join('')}</tbody></table>`
```

- Wrapper `<div class="panel" style="overflow-x:auto">` carries the scroll (governance.js:113).
- First `<th>` gets `style="padding-left:14px"`; last `<th>` is empty (actions gutter).
- Multi-table-per-page precedent: backup.js:320 + :429 (two tables, one page).
- Empty/loading three-tier per section: `loading ? panel-b faint : rows.length ? table : empty('icon', title, body, '', 'sm', 3)` (governance.js:99–105 shape). Dead + usage sections: render the whole sblock as `''` when payload empty (the current govDeadCard :155 quiet-absence discipline, D-10) — **except** the usage section should show its `usageEmptyTitle/Body` empty state when orphans exist but usage is empty (operator explicitly navigated to it; owner-visible).

### Column → payload field map (SPA-01)

| Column | Field | Notes |
|---|---|---|
| Label | `m.label` | esc() |
| Group ID | `m.groupGuid` | mono cell, esc() |
| Workspace | `m.workspaceName` | dead row → null → render `—` (server never fakes names, server.js:9243) |
| Team | `m.teamName` / `m.teamMissing` | unset → `—`; missing → keyed "team no longer exists" copy; else esc(teamName) |
| Role | `m.role` | `common.role.*` badge (existing keys) |
| Users added | `m.liveMembers` | current-members semantics; the :49 `{n}` chip copy retires into a plain count or the viaGroup key per owner |
| When | `ago(m.updatedAt)` or createdAt | pick one — owner spec says "When" |
| gutter | Edit + Delete buttons | data-a="mapEditAsk" data-id, staged delete as today |

**Edit affordance on dead rows:** the delete flow is untouched; Edit on a dead row is ALLOWED and is the sanctioned repair — PATCH accepts the dead row only when retargeting to a live workspace (server.js:9351/106-02 pinned). Render Edit always; the server refuses non-repair edits with `groupMappingDead` and the toast shows the keyed message. No client-side gating (D-11: server is the control).

## 2. State slots & fill loop (actions.js)

Existing [VERIFIED: actions.js:4760–4795]: `S.ui.mapRows` (:4770), `S.ui.mapWs` (:4782), `S.ui.govDead` (:4787), `S.ui.mapErr` (:4775), `S.ui.mapForm`, `S.ui.mapStage`; `refreshMappings` (:4762) sequences THREE fetches under one monotonic seq + AbortController, 401 silent bail, NO auto-poll.

107 changes — extend the loop, never add fill loops (Pitfall 5):
1. First fetch (`api.groupMappings`) unchanged — rows now carry team fields for free.
2. `api.operatorDeadMappings()` response: stage `S.ui.govDead = { orphans, trail, usage }` (today `{orphans, trail}` at :4787 — add usage).
3. `S.ui.mapWs = ws.data.workspaces` (:4782) — payload gains `teams` per workspace (see §5); picker consumes it directly. No new state slot.

New slots: `S.ui.mapEdit` (`{id, wsId, teamId, role, label}` draft — the `mapForm` idiom verbatim), and reuse the staged pattern: `A.mapEditAsk` sets `S.ui.mapEdit`, `A.mapEditCancel` clears, `A.mapEditSave` PATCHes. Modal-draft handlers ride `IN.mapEditWs/mapEditTeam/mapEditRole/mapEditLabel` (the IN.map* idiom at :4803–4822, draft in S.ui, never the DOM).

## 3. Usage Log (SPA-04)

### 3.1 Server gap — the `usage` slice does NOT exist yet

[VERIFIED: server.js:9398–9428] The dead-mappings GET returns `{ orphans, trail }` (line :9428). Trail SELECT carries only `action, workspace_id, created_at` (:9427) — **no target_name**. SPA-04 requires the extended GET. Recipe (clone the instance-roles recent idiom, server.js:9461–9470):

- Add `usage` to the SELECT: `select action, workspace_id, target_name, target_email, created_at from audit_log where action like 'group\\_%:group:%' escape '\\' order by created_at desc limit 100` — **keep the WR-83-03 escaped LIKE byte-exact** (Pitfall 1); the same LIKE now also selects the 106-01 team verbs (that is correct: they are group lifecycle rows).
- Return `usage: rows.map(a => ({ action, workspaceId, targetName: a.target_name || a.target_email, targetEmail, createdAt }))` — camelCase like the mappings rows (`targetName: a.target_name || a.target_id` is the :9468 precedent).
- Keep `trail` unchanged (the dead section keeps its refused-guard display) OR fold trail into usage — owner decision; cheapest is to leave `trail` as-is and add `usage` alongside (the dead table consumes `orphans` only + maybe a last-seen column).
- Client stage: `S.ui.govDead = { orphans, trail, usage }` in actions.js:4787.

### 3.2 Client action → label map (FIRST-colon split, D-08 — never server-side)

[VERIFIED: mappings.js:159–170 splitFirst; server.js audit verbs]

| Encoded action head | Key (`page.mappings.usage.action.*` — new ×5) |
|---|---|
| `group_granted` | granted |
| `group_role_upgraded` | upgraded |
| `group_role_downgraded` | downgraded |
| `group_membership_removed` | removed (reason tail distinguishes lost-claim / guard-refused) |
| `group_team_granted` | teamGranted (106-01 verb — MUST be labeled or it renders raw) |
| `group_team_removed` | teamRemoved |
| `group_membership_skipped` / `group_team_skipped` | skipped (owner ruling needed: include or filter — include is default, filter is a client-side `.filter`) |
| tail `:guard-refused` | reason label `usage.reason.guardRefused` |

Columns: Action (label + reason tail as faint text) / Group ID (`guid` from split, mono, esc()) / Group Name (lookup `S.ui.mapRows.find(r => r.groupGuid === guid)?.label` — raw GUID fallback when no mapping matches, owner-accepted) / Who (`targetName`, esc()) / When (`ago(createdAt)`). Drop the "Type" column (all rows are group-family; REQUIREMENTS pre-authorizes dropping).

Cap-note: `{shown}/{total}` interpolation exists verbatim — `page.governance.superCapNote` = `"Showing {shown} of {total} matches"` [VERIFIED: en.json:2390, governance.js:214]. New key `page.mappings.usageCapNote` with the same two placeholders, rendered only when `usage.length === 100`.

## 4. Edit UI (SPA-02) — api methods + modal recipe

### 4.1 api.js — ONE new method

Add next to `groupMappingDelete` (api.js:472) [VERIFIED surroundings]:

```js
async groupMappingUpdate(id, body) {
  return call('PATCH', `/api/governance/group-mappings/${encodeURIComponent(id)}`, body);
},
```

Body (camelCase, all optional per server merge): `{ workspaceId?, teamId? (null clears), role?, label? }`. **Never send groupGuid** (server refuses with `groupMappingImmutable`). `patchWorkspace` (api.js:301–304) is the PATCH call precedent.

### 4.2 Client pre-checks (D-08 light — server is the funnel)

- label: trim + non-empty → keyed toast (the `badLabelToast` pattern, actions.js:4831).
- wsId/teamId/role: no client validation — server refusals surface via `tErr(code, …)` (D-09 funnel, actions.js:4838). Codes to expect: `groupMappingBadRole`, `groupMappingUnknownWorkspace`, `groupMappingTeamUnknown`, `groupMappingDuplicate`, `groupMappingDead`, `groupMappingImmutable`, `notFound`, `tooManyAttempts` — **all keys exist ×5 already**.
- 401 silent bail (D-28), success toast `page.mappings.savedToast` (new key), then `await refreshMappings()`.

### 4.3 Modal recipe — the governance rename precedent verbatim

Closest existing precedent: `A.govEditAsk` → `openModal({ type: 'custom', cls: 'sm', render: () => m.govEditBody(S.ui.govEditWs) })` [VERIFIED: actions.js:6326–6358], modal body exported from the page module (`govEditBody`, governance.js:386–400, footer `<div class="modal-f">…govEditCancel / govEditSave…`). 107 mirrors it:

- `A.mapEditAsk` (data-a on the row button, `data-id="${esc(m.id)}"`) stages `S.ui.mapEdit = { id, wsId: m.workspaceId, teamId: m.teamId, role: m.role, label: m.label || '' }` and opens the modal rendering `mapEditBody()` (exported from mappings.js like govEditBody).
- `mapEditBody`: GUID displayed **read-only** as mono text (esc'd) with a visible "cannot be changed" hint; workspace select fed by `S.ui.mapWs`; team select fed by the **effective** ws's teams (see §5 — options must re-derive when the ws select changes; a team picked under the old ws must reset when wsId changes); role select (`common.role.*`); label input maxlength="200", `value="${esc(...)}"` (T-102-04).
- Save sends only changed fields (or all four — server merges; sending all is simpler and idempotent).
- `mapTeardown` (:178) also clears `S.ui.mapEdit` — the test at mappings-client.test.mjs:296–302 pattern extends.

Alternative rejected: inline row editing (no house precedent; the modal idiom is verified end-to-end incl. esc/data-a pins).

## 5. Team picker feed (SPA-05) — the ONE missing server piece

**[VERIFIED: server.js:8835–8863] `GET /api/auth/operator/workspaces` returns id/slug/name/archived/createdAt/memberCount/creator — NO doc, NO teams.** The picker cannot be fed from today's payload. Recipe:

- Server: in the operatorWorkspaces handler, add one doc parse per workspace (small N, operator-only — same posture as the mappings GET teamMaps at server.js:9228–9236, which uses `docTeamNames(doc)` from 106-02): `teams: docTeamNames(r.doc)` per row (array of `{id, name}`). Check the exact `docTeamNames` return shape before writing ([VERIFIED to exist: server.js:4722 comment]; mirror the list GET's Map usage).
- Client: `S.ui.mapWs` rows gain `.teams`. `mapCreateForm` renders the team select ONLY when `f.wsId` is set (SPA-05: hidden/disabled until a workspace is chosen), options from `wsPool.find(w => w.id === f.wsId)?.teams || []`, plus a `— no team —` option (empty value = workspace-only mapping, the server's nullable teamId default). esc() option values + names.
- Same options source feeds the edit modal's team select, keyed on the edit draft's wsId (current row ws OR the newly picked target ws — the server validates against the EFFECTIVE ws, so the picker must follow the select's current value).

## 6. TEAM-08 delete-copy integration point

- Copy lives at **`page.mappings.deleteCopy`** (en.json:2113, currently two sentences) rendered in the staged row (mappings.js:55) via the `mapDeleteAsk` stage (actions.js:4853).
- Integration: derive only-mapping client-side — `const only = S.ui.mapRows.filter(r => r.groupGuid === m.groupGuid && r.workspaceId === m.workspaceId).length === 1`. NOTE: the server refuses duplicate group+workspace pairs (`groupMappingDuplicate`), so this is trivially true for workspace-kind rows **unless the group also holds team-kind mappings in the same workspace** (post-106 reality) — the conditional earns its keep exactly there.
- Copy structure (recommended): keep `deleteCopy` for the lazy-revocation half; add **`page.mappings.deleteCopyRole`** ("Because this is the group's only mapping for this workspace, members will also lose their workspace role at that same next sign-in.") ×5, appended when `only`. Update the pinned verbatim-EN test (mappings-client.test.mjs:287–292) accordingly — it pins `en['page.mappings.deleteCopy']` content; the new key gets its own parity pin. **Wording must be owner-approved** (TEAM-08 is an SC-copy handoff — flag for discuss/plan checkpoint).
- The staged-delete trio (actions.js:4853–4872) is otherwise untouched; ESC discipline on the staged repaint persists (test :324–333).

## 7. i18n inventory (×5, en/de/es/fr/nl — GD-7 same-commit rule)

Existing `page.mappings.*` keys: en.json:2092–2114 (20) + :2165–2168 (dead, 4) = 24. Existing err keys :1820–1826 (7, incl. the three 106 keys — no new err keys).

**New keys (all ×5, one commit per emitting task):**

| Group | Keys |
|---|---|
| Mappings table headers | `colLabel, colGuid, colWorkspace, colTeam, colRole, colUsers, colWhen` (7) |
| Team cell states | `teamMissingBadge` ("Team no longer exists"), reuse `—` literal for unset |
| Dead section | `deadColGuid, deadColWorkspace, deadColTeam, deadColLastSeen` + reuse `deadTitle/deadLead`; retire `deadOrphans`/`deadTrail` sub-labels if the card splits dissolve (or repurpose) (≈4 new + retirements — i18n:scan will flag stale keys) |
| Usage section | `usageTitle, usageLead, usageColAction, usageColGuid, usageColGroup, usageColWho, usageColWhen, usageEmptyTitle, usageEmptyBody, usageCapNote` (10) |
| Action labels | `usage.action.granted, upgraded, downgraded, removed, teamGranted, teamRemoved, skipped` + `usage.reason.lostClaim, guardRefused, deadTeam, mappedLower` (≈11) |
| Edit | `edit` (row button), `editTitle`, `editGuidHint` (read-only GUID copy), `teamLabel`, `teamPlaceholder`, `teamNone`, `editSave` (reuse `common.save` if it exists — check first), `savedToast` (≈6–7) |
| TEAM-08 | `deleteCopyRole` (1) |

**Pin impacts (all same-commit, D-12):** [VERIFIED: test pins read this session]
- **verbs 85 → 86**: `test/i18n-core-features.test.mjs:171` — `assert.equal(verbs.length, 85, 'a call site moved')`; +1 = `groupMappingUpdate` PATCH (append the annotated comment following the file's convention).
- **data-a 632 → ~+3–5**: `test/i18n-shell.test.mjs:345` tree-wide pin. Expected adds: `mapEditAsk` (row markup +1), `mapEditSave` + `mapEditCancel` (modal +2), optional picker toggle if the select needs one (team select is a plain `<select>` with `data-in` — no data-a, so likely just +3).
- **data-v 95**: unchanged unless the team picker chips ride data-v — with a plain `<select data-in="mapTeam">` there is no data-v bump.
- **data-r 64**: unchanged (no nav changes).
- **icons 185**: unchanged — `pencil` is already in the baseline (backup.js:393 uses it) [VERIFIED: test/i18n-core-features.test.mjs:284 pin + backup.js:393].
- **ROUTE_IDS**: unchanged at 24 entries (mappings already registered; PATCH adds no client route) [VERIFIED: render.js:21–43].

## 8. Test plan (extend test/mappings-client.test.mjs + one server test file)

mappings-client.test.mjs is static source assertions (no DOM harness) [VERIFIED: :1–347]. Extend per its lettered convention:

1. **(f)-style esc() regexes per new interpolated field**: `esc(m.teamName …)`, `esc(usageRow.targetName …)`, `esc(usageRow guid)`, group-name lookup output, edit-modal value attributes, dead-table cells. The existing pin at :341–347 ("all data-a before the dead-card marker") must be re-scoped coherently when the card marker is renamed — usage section HAS a data-a-free display body but the sections live below the create form; re-derive the marker discipline (e.g. pin data-a-free regions per section).
2. **×5 parity tests** per key group (the :52–63 / :190–207 pattern) — one test per task's key batch.
3. **Fill loop**: extend the :66–73 regex block — assert `S.ui.govDead` staging includes `usage`, and `S.ui.mapWs` consumption unchanged.
4. **Edit trio**: the :306–319 delete-trio pattern cloned for `mapEditAsk/Save/Cancel` — `api.groupMappingUpdate(id, …)`, 401 bail, `tErr` funnel, `await refreshMappings()`, teardown clears `S.ui.mapEdit` (extend the :296–302 pin).
5. **GUID read-only**: assert the edit body has NO input bound to guid (no `data-in="mapEditGuid"`) and renders the mono GUID through esc().
6. **TEAM-08**: assert the only-mapping derivation exists in mapRow/the staged template and `deleteCopyRole` key ×5; update the verbatim-EN pin (:287–292).
7. **verbs/data-a pins**: the two counter pins themselves (i18n-core :171, i18n-shell :345) get same-commit bumps with annotations.
8. **Server test** (extend test/group-mappings-api.test.mjs, the :680 GET-payload test pattern): dead-mappings GET now returns `{orphans, trail, usage}` with `targetName` populated; operatorWorkspaces payload carries `teams` for a ws with doc.teams. pg-parity: no new SQL shapes beyond a column addition to an existing SELECT (target_name/target_email) and the doc-parse (JS) — db-adapter pins unaffected, but run `node --test test/db-adapter.test.mjs` to confirm.
9. **`npm run i18n:scan`** must show 0 pending/stale after retirements (mappings-client + catalogue.test.mjs pattern).

## 9. Pitfalls (verified)

1. **The usage slice does not exist** — do not plan the client against `{orphans, trail, usage}` without the server task landing first (server.js:9428 returns two keys TODAY).
2. **teamMissing ≠ falsy teamName** — 106-02 handoff: use `teamMissing` for the missing-team state; a set teamId with null name is a REAL state (team left the doc), not an unset team.
3. **Escaped LIKE is the selection contract** — `group\_%:group:%` escape `'\\'` byte-exact (server.js:9427, WR-83-03). Unescaped `group_%` would pull `group_mapping_saved/deleted` configuration rows into the Usage Log.
4. **Team verbs ride the trail** — the Usage Log will show `group_team_*` rows post-106; unlabeled they render as raw encoded strings. Label map must cover them (§3.2).
5. **First-colon split stays client-side** (D-08, server.js:9409–9411 doctrine).
6. **No new fill loops / no auto-poll** — extend refreshMappings (:4762), one seq.
7. **The dead-card marker test** (:341–347) keys on the literal `83-02 DEAD-MAPPING WARNING CARD` comment — renaming the section must update the test in the same commit or it fails on missing marker.
8. **Edit modal team options must follow the ws select** — server validates team against the EFFECTIVE ws (targetWsRow || curWsRow); a stale team option list after a ws change produces confusing `groupMappingTeamUnknown` toasts.
9. **deleteCopyRole conditional is trivially-true for ws-only rows** (dup-refusal) — the branch matters only with team-kind siblings in the same ws; test that case or the condition is dead code.
10. **i18n retirements**: dropping `deadOrphans`/`deadTrail` sub-labels and the `viaGroup` chip (if the column replaces it) must happen in the same commit as the render change — `i18n:scan` fails on stale keys.

## Don't Hand-Roll

| Problem | Use instead |
|---|---|
| Table markup | the `perm-t` idiom verbatim (governance.js:104) — no new CSS |
| Modal edit | `openModal({type:'custom'})` + page-exported body (actions.js:6333) |
| Cap note | the `{shown}/{total}` interpolation style (en.json:2390) |
| Staged confirm | the D-90 mapStage trio (actions.js:4853) |
| Teams parse | `docTeamNames`/`docTeamIds` helpers (server.js:4711/4722) |
| Action split | `splitFirst` (mappings.js:159) |

## Assumptions Log

| # | Claim | Risk if wrong |
|---|---|---|
| A1 | Usage section shows the empty state when `usage` is empty even if orphans exist (vs quiet-absence like the dead card) — owner taste, either is defensible | Minor UX; planner can pick quiet-absence |
| A2 | `docTeamNames(doc)` returns `[{id, name}]` (shape inferred from the Map<teamId,name> usage; the helper comment read, not the body) | Picker code shape — verify the helper body at implementation time (server.js:~4722) |
| A3 | `common.save` exists for the edit modal footer | Falls back to a new `editSave` key — check en.json when writing keys |
| A4 | Include skipped rows in the Usage Log by default | Owner ruling from milestone research Open Question 2 still open; filter is one `.filter()` if refused |
| A5 | TEAM-08 wording (deleteCopyRole EN text above) is a draft — needs owner sign-off per the W1 handoff | Copy must be owner-approved before ×5 lock |
| A6 | "When" column = `ago(updatedAt)` (or createdAt — owner picks one) | Trivial swap |

## Environment Availability

Not applicable beyond the existing zero-dependency stack (node --test, no new packages). No Package Legitimacy Audit needed — zero installs. [VERIFIED: house SPA doctrine, phase 102]

## Sources

### Primary (HIGH confidence — all read this session, post-106 tree)
- src/pages/mappings.js (1–182) — current structure, splitFirst, staged template
- src/actions/actions.js (4760–4872, 6326–6358, 5319) — fill loop, create/delete handlers, modal idiom
- src/core/api.js (415–474, 301–304) — mapping methods + PATCH precedent
- server.js (8835–8863, 9148–9250, 9345–9428, 9450–9470, 6925/6951/6977, 4711) — GET/PATCH/dead-mappings/instance-roles/team verbs/docTeamIds
- src/locales/en.json (1820–1826, 2092–2168, 2390) — key inventory
- test/mappings-client.test.mjs (1–347) — the full pin inventory
- test/i18n-core-features.test.mjs (:171 verbs=85, :284 icons=185); test/i18n-shell.test.mjs (:332–346 data-a 632/data-v 95/data-r 64)
- .planning/research/MAPPINGS-UX.md; 106-01/106-02 SUMMARYs; REQUIREMENTS.md:37–41; ROADMAP.md:52–68

**Research date:** 2026-11-28 — **Valid until:** phase execution (codebase anchors; re-verify line numbers if 108 lands first)
