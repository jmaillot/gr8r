---
phase: 107-mappings-spa-sections-tables-edit-usage-log
plan: 01
subsystem: mappings-spa
tags: [spa, mappings, entra-id, i18n, governance]
requires: [phase-106-patch-route, phase-106-team-fields, phase-83-dead-mappings-get]
provides: [mappings-perm-t-table, mappings-edit-modal, dead-mappings-table, usage-log-section, team-picker-doc-teams-feed, team-08-role-loss-clause, groupMappingUpdate-api]
affects: [phase-108]
tech-stack:
  added: []
  patterns: [perm-t table idiom, govEditBody modal idiom, staged draft in S.ui (IN.* handlers), quiet-absence D-10, FIRST-colon client split D-08]
key-files:
  created: []
  modified:
    - server.js
    - src/core/api.js
    - src/pages/mappings.js
    - src/actions/actions.js
    - src/locales/en.json
    - src/locales/de.json
    - src/locales/es.json
    - src/locales/fr.json
    - src/locales/nl.json
    - test/mappings-client.test.mjs
    - test/group-mappings-api.test.mjs
    - test/governance-client.test.mjs
    - test/governance-rename.test.mjs
    - test/i18n-toast.test.mjs
    - test/i18n-core-features.test.mjs
    - test/i18n-shell.test.mjs
decisions:
  - "When column = ago(m.createdAt) (planner decision A6) — 'When' reads as 'since this mapping exists'; updatedAt not rendered (pinned)"
  - "docTeamNames returns Map<teamId,name> — operatorWorkspaces adapts to [{id,name}] pairs; doc joined into the row SELECT (no extra queries)"
  - "teamPlaceholder key NOT added — the picker hides entirely until a workspace is chosen, so a placeholder would be a dead key (i18n:scan dead-flag)"
  - "A.mapCreate now sends teamId (null default) — the picker was cosmetic without it (Rule 2: wiring completeness)"
  - "Usage Log section keyed empty state when orphans exist but usage empty (A1); whole sblock quiet-absence with no payload at all (D-10)"
  - "skipped rows INCLUDED in the Usage Log (A4 default) — honest lifecycle evidence; one .filter() if the owner later refuses"
  - "Refused-guard trail display retired from the dead section — the usage slice supersedes it; deadLead copy updated ×5; server trail key kept for API compat"
  - "data-a pin landed at 636 (not 635): mapEditCancel carries a SECOND markup occurrence in the staged-draft guard footer — annotated in both i18n-shell and i18n-toast"
  - "verbs pin landed at 86: +1 = groupMappingUpdate PATCH"
metrics:
  duration: ~39 min
  completed: 2026-11-28T12:29:00Z
  tasks: 3
  files: 16
actuals:
  tokens: 55000
  tasks: 3
  commits: 3
  plan_head_before: 0e0b74e7316af56228430206a784076241525094
  plan_head_after: 59cd3471a1fbedbf525c89a6d4fe73218550efee
status: complete
---

# Phase 107 Plan 01: Mappings SPA — Sections, Tables, Edit UI, Usage Log Summary

**One-liner:** Three perm-t sections on the Mappings page (Mappings / Dead group mappings / Usage Log) + staged edit modal round-tripping through the 106 PATCH route + workspace-scoped team picker fed by operatorWorkspaces doc.teams + TEAM-08 role-loss delete clause, all ×5 locales same-commit.

## What Was Built

### Task 1 — Mappings table end-to-end (tracer) — commit `40a73fc0`
- `mapTr(m)` `<tr>` builder replaces the srow `mapRow`: 7 SPA-01 columns (Label / GUID mono / Workspace `—`-when-null / Team keyed off **teamMissing** per the 106-02 handoff / Role badge / Users added = `liveMembers` plain count / When = `ago(m.createdAt)`), perm-t idiom verbatim from governance.js:104, staged Delete untouched in the gutter.
- `pageMappings()` restructured: header → create form → sblock "Mappings" with the three-tier loading/table/empty.
- SPA-05 server feed: `GET /api/auth/operator/workspaces` rows now carry `teams: [{id, name}]` parsed from each workspace doc via the shared `docTeamNames` helper (plain JS, no json_extract — pg parity). Adapted: the helper returns a `Map`, converted to pairs in the handler.
- SPA-05 picker: team `<select>` renders ONLY when the draft's wsId is set, options from that workspace's `teams`, `— no team —` empty-value default; `IN.mapWs` resets the stale teamId (Pitfall 8); `A.mapCreate` sends `teamId`.
- `viaGroup` chip + key retired ×5; 12 new keys ×5.

### Task 2 — Edit UI — commit `90632c95`
- `api.groupMappingUpdate(id, body)` PATCH method (all four camelCase fields, never groupGuid).
- `mapEditBody()` export (govEditBody idiom): GUID read-only esc'd mono + editGuidHint, **no** `data-in="mapEditGuid"` (pinned), ws select from `S.ui.mapWs`, team options follow the select's CURRENT wsId, label maxlength=200, footer reuses `common.save`.
- `A.mapEditAsk/Cancel/Save` + `IN.mapEditWs/Team/Role/Label`: staged draft in `S.ui.mapEdit`, light label pre-check only, 401 silent bail, tErr funnel against the existing ×5 err keys, savedToast + `refreshMappings()`; Edit on EVERY row incl. dead rows (sanctioned repair, D-11); `mapTeardown` clears `S.ui.mapEdit`.
- Pins: verbs 85→86, data-a 632→636 (with annotations).

### Task 3 — Dead table + Usage Log + TEAM-08 — commit `59cd3471`
- Server: dead-trail GET returns `{orphans, trail, usage}` — usage slice clones the instance-roles recent idiom with the **byte-exact escaped WR-83-03 LIKE** (pulls the 106-01 team verbs, excludes `group_mapping_saved/deleted`), camelCase rows `{action, workspaceId, targetName, targetEmail, createdAt}`; no server-side action transformation (D-08).
- Dead section: perm-t table fed by orphans (Group ID / Workspace / Team / Last seen), quiet-absence when empty; marker comment renamed to `107-01 DEAD-MAPPINGS TABLE + USAGE LOG`.
- Usage section: admin-only; keyed action labels (granted/upgraded/downgraded/removed/teamGranted/teamRemoved/skipped — skipped INCLUDED per A4) + reason tails (guardRefused/lostClaim/deadTeam/mappedLower); honest Group Name (mapping label, raw esc'd GUID fallback); Who = targetName; cap-note `{shown}/{total}` ONLY at `usage.length === 100`; keyed empty state (A1).
- TEAM-08: `deleteCopyRole` appended in the staged delete when `mapRows.filter(r => r.groupGuid === m.groupGuid && r.workspaceId === m.workspaceId).length === 1`; lazy-revocation `deleteCopy` kept.
- `deadOrphans`/`deadTrail` retired ×5 (scan 0 stale); 27 new keys ×5.

## Deviations from Plan

### Auto-fixed Issues
1. **[Rule 2 — Missing wiring]** `A.mapCreate` did not send the picked `teamId` (plan Task 1 built the picker but never wired the create body). Fixed: `teamId: f.teamId || null` in the POST body, test-pinned.
2. **[Rule 3 — Blocking test drift]** Six tests outside the plan's file scope pinned the old card shape / staging / data-a count and failed the full suite: `test/governance-client.test.mjs` (3 dead-card pins re-scoped to the table + usage section), `test/governance-rename.test.mjs` (empty-payload shape `{orphans, trail, usage}`), `test/i18n-toast.test.mjs` (mirrored data-a pin 632→636). Re-scoped in the same commit as the migration per execution rule 4.
3. **[Rule 3 — Honest copy]** `deadLead` copy described the retired refused-guard trail; updated ×5 to describe the dead-mappings table.
4. **[Plan gap — section header]** The plan's Task-1 key list had no heading key for the "Mappings" sblock; added `sectionTitle`/`sectionLead` ×5.

## TEAM-08 Copy (owner review flag — per the 106-02 W1 handoff)
Ships as planner-drafted (execution rule 2, owner pre-approved default). Final EN wording, verbatim:
> "Because this is the group's only mapping for this workspace, members will also lose their workspace role at that same next sign-in."

(en.json uses the typographic apostrophe: "the group’s only mapping". Flag for owner sign-off before milestone ship.)

## Verification
- `node --test test/mappings-client.test.mjs` → **45 pass / 0 fail** (esc pins, ×5 parity, fill loop, edit trio, GUID read-only, TEAM-08, re-scoped marker discipline)
- `node --test test/group-mappings-api.test.mjs` → **29 pass / 0 fail** (usage slice incl. team-verb row + group_mapping_saved exclusion; operatorWorkspaces teams feed)
- `node --test test/i18n-core-features.test.mjs` (verbs=86) / `test/i18n-shell.test.mjs` (data-a=636) → green
- `node --test test/db-adapter.test.mjs` → green (pg-parity; only a column addition to an existing SELECT + JS doc-parse)
- `npm run i18n:scan` → **0 pending / 0 stale / 0 dead** (viaGroup, deadOrphans, deadTrail retirements included)
- `npm test` → **2814 tests, 2781 pass, 2 fail = exactly the documented pre-existing failures** (french-typography, webhook-routes GET list); baseline holds

## Known Stubs
None — no stub patterns in the created/modified source files.

## Threat Flags
None — surface matches the plan's `<threat_model>` (esc() discipline pinned per field; PATCH body never carries groupGuid; usage slice stays behind the admin-gated route; zero new dependencies).

## Commits
- `40a73fc0` feat(107-01): mappings perm-t table + workspace-scoped team picker (SPA-01/SPA-05)
- `90632c95` feat(107-01): staged edit modal round-tripping through the 106 PATCH route (SPA-02)
- `59cd3471` feat(107-01): dead mappings table + Usage Log + TEAM-08 role-loss clause (SPA-03/SPA-04/TEAM-08)

## Self-Check: PASSED
- Files: all 16 modified files present in git history (verified via `git log --stat`).
- Commits: all 3 hashes found; `git rev-list --count 0e0b74e7..59cd3471` = 3 = frontmatter.
- Tests: full-suite counts quoted verbatim from the run above.
