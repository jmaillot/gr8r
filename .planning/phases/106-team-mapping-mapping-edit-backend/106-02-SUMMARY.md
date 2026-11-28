---
phase: 106-team-mapping-mapping-edit-backend
plan: 02
subsystem: governance group-mapping routes
tags: [mapping-edit, patch-route, team-validation, audit, i18n-parity]
requires: [phase-80-group-mappings, phase-101-mapping-list-delete, 106-01 (team_id column, docTeamIds helper)]
provides: [PATCH /api/governance/group-mappings/:id, group_mapping_updated audit verb, POST/PATCH team_id validation, GET teamId/teamName/teamMissing payload, err.groupMappingImmutable/TeadUnknown/Dead ×5 locales]
affects: [106-02-SUMMARY handoff → Phase 107 SPA-02 (mappings UI + delete copy)]
tech-stack:
  added: []
  patterns: [DELETE-family guard ladder cloned verbatim (D-03), throttle-before-gate, partial-update per-field merge (workspace PATCH idiom), same-tx audit (AUD-01), effective-workspace doc.teams whitelist, server-side JS team-name map (no json_extract)]
key-files:
  created: []
  modified:
    - server.js
    - src/locales/en.json
    - src/locales/de.json
    - src/locales/es.json
    - src/locales/fr.json
    - src/locales/nl.json
    - test/group-mappings-api.test.mjs
decisions:
  - Locale keys distributed to their FIRST-EMITTING commits (groupMappingImmutable → Task 1, TeamUnknown+Dead → Task 2) per the GD-7 house rule, instead of all three bundled in Task 3 as the plan text read; Task 3 ships the parity pin. All three keys are ×5 in one commit each time — the parity criterion is satisfied, only the commit timing differs.
  - groupMappingUnknownWorkspace reused for archived-workspace retarget refusal (live-only posture, zero new keys) — research Open Question 1 planner-adopted.
  - The isUniqueViolation backstop is not exercised via HTTP in tests: single-threaded tests cannot race past the dup pre-check. The classifier itself stays pinned by the existing T7 unit test; the backstop code path mirrors the POST idiom verbatim.
  - POST response/PATCH response mappings now carry teamId (null when unset).
metrics:
  duration: ~45 min
  completed: 2026-11-28
status: complete
actuals:
  tokens: 38000
  tasks: 3
  commits: 3
commits: 3
plan_head_before: 00ec7c8d
plan_head_after: 124d0925
---

# Phase 106 Plan 02: Mapping Edit Route Surface — PATCH + Team Validation + GET Payload Summary

PATCH `/api/governance/group-mappings/:id` — partial edit of workspace/team/role/label under the DELETE family's exact guard ladder (throttle-before-gate, uniform 404), GUID immutable by keyed refusal, dead rows display-only with a sanctioned live-retarget repair, `group_mapping_updated` audited in the UPDATE tx; POST gains the nullable doc.teams-validated team slot; the list GET carries teamId/teamName/teamMissing for Phase 107's UI.

## Completed Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | PATCH route end-to-end — ladder + role/label + audit (tracer) | 8f6af6dc | server.js, test/group-mappings-api.test.mjs, src/locales/*.json ×5 (groupMappingImmutable) |
| 2 | Workspace + team fields, dead-row refusal, POST team validation | 2e09f2f6 | server.js, test/group-mappings-api.test.mjs, src/locales/*.json ×5 (TeamUnknown, Dead) |
| 3 | GET team payload extension + locale parity pin | 124d0925 | server.js, test/group-mappings-api.test.mjs |

## Test Results

- `node --test test/group-mappings-api.test.mjs` — 27/27 green: the full PATCH matrix (ladder 401/403/429 with 403s consuming tries, uniform 404, GUID tamper, dup pre-check, archived retarget, team valid/unknown/null-clear, effective-workspace whitelist, dead-row refusal + repair), the POST team matrix (valid/unknown/archived/absent), the GET payload test (live/dead/unset team rows), and the ×5 parity pin. All pre-existing pins green (throttle :217 shape, 404 :235, DELETE :253 byte-identical, liveMembers :187 exact-equality, WR-83-03 trail :297).
- `node --test test/catalogue.test.mjs` — 27/27 green. `npm run i18n:scan` — 0 pending/unlisted/stale.
- `node --test test/db-adapter.test.mjs` — green (pg-parity static pins unaffected: no `json_extract`, no `insert or ignore`, no new SQL shapes beyond the engine-neutral update/insert column additions).
- Full `npm test`: **2794 tests, 2761 pass, 2 fail, 31 skipped** — the ONLY failures are the 2 documented pre-existing ones (french-typography, webhook-routes GET list). Verified the french-typography failure names only pre-existing keys (apikeys/restore/s3) — none of the new `groupMapping*` fr values appear in its breach list.

## Deviations from Plan

**1. [Clarification — locale-key commit timing]** The plan's Task 3 bundles all three new err keys into one commit, but the environment's GD-7 house rule mandates ×5 keys in the SAME COMMIT as the first emitting `fail()` code. Tasks 1–2 emit the codes, so the keys rode those commits (one key ×5 in Task 1, two keys ×5 in Task 2); Task 3 delivers the explicit parity pin test instead of the key files. Net effect identical (×5 parity holds, verified by catalogue.test.mjs + the new pin).
- **Found during:** Task 1 implementation
- **Files:** src/locales/*.json (Tasks 1–2 commits)

**2. [Test interpretation — isUniqueViolation backstop]** The plan asks for the backstop to be "exercised by direct insert of the colliding row before UPDATE" — but a directly-inserted colliding row is caught by the dup PRE-check first, so the backstop is unreachable through HTTP in a single-threaded test. The pre-check refusal IS pinned by the `groupMappingDuplicate` HTTP test; the classifier stays pinned by the existing T7 unit test (`group-mappings-api.test.mjs` isUniqueViolation cases). Backstop code mirrors the POST idiom verbatim.
- **Found during:** Task 2 test design

No Rule 1–4 deviations: all plan anchors (9106 ladder, 11675 partial-update idiom, 11839 whitelist predicate, shared docTeamIds helper from Plan 01) held at execution time.

## Key Implementation Notes

- PATCH route inserted directly below the DELETE sibling, sharing `groupMappingIdMatch`; ladder order EXACTLY: sameOrigin → requireUser → tooMany(`group-mapping-edit|<operator.id>`, 5/15min) → isInstanceAdmin → uniform 404.
- Dead-row gate: current ws missing OR archived ⇒ 400 `groupMappingDead` UNLESS workspaceId is being retargeted to a LIVE ws in the same PATCH (the sanctioned repair — pinned).
- Team whitelist runs against the EFFECTIVE workspace's doc (`targetWsRow || curWsRow`, both selected with doc); a team valid only in the target doc is accepted mid-retarget, and one valid only in the current doc is refused when retargeting away — both pinned.
- Audit `group_mapping_updated` detail carries only CHANGED parts: `group <guid> → ws <id> (ws X→Y, role a→b, team t→u, label "a"→"b")` in the DELETE's target_email slot; workspace_id column carries the NEW ws on retarget.
- GET: `teamMaps` built from one doc parse per distinct live ws carrying team_ids; dead/archived ws rows get teamMissing true for any set team_id; `liveMembers` subquery untouched (memberships-only, exact equality — Pitfall 4).

## HANDOFF NOTE (checker W1 — for Phase 107 SPA-02)

TEAM-08's delete-confirm copy clause — **lazy revocation + role loss when the row is the group's only mapping** — is CLIENT-side and deliberately deferred to Phase 107. The copy must tell the operator that deleting the mapping does NOT remove access immediately (R-3: mapped members lapse at their next sign-in, when the reconcile pass reads the mappings table), and that if this row is the group's ONLY mapping for that workspace, members lose their workspace role at that same next sign-in. The server-side DELETE route's contract is unchanged and pinned (memberships/team_members byte-identical, R-3); only the SPA copy is outstanding.

Also for 107: the list payload now carries `teamId`/`teamName`/`teamMissing` per row (teamName null when the team left the doc — use teamMissing, not a falsy name check, to render the honest "team no longer exists" state), plus the existing `liveMembers` for the Users-added column.

## Threat surface scan

No new trust boundaries beyond the plan's `<threat_model>`: PATCH/POST sit behind the existing governance admin ladder (T-106-05 gate + funnel mitigations all present and pinned); team whitelist uses the shared parse-fail-closed helper (T-106-06); the edit audit row rides the same tx as the UPDATE (T-106-07); team names flow only through the already-gated GET route (T-106-08). Zero new dependencies (T-106-SC untriggered).

## Self-Check: PASSED

- All 7 modified files exist and are committed (3 commits on 00ec7c8d..124d0925).
- 15 new tests present and passing; all pre-existing pins green; full-suite baseline holds at exactly the 2 documented pre-existing failures.
