---
phase: 95-settings-polish-cross-workspace-pickers-project-overwrite-re
plan: 01
subsystem: client-pickers + static-test-gates
tags: [xws-01, set-04, d-11, d-12, grep-gate, static-slice]
requires: [phase-92 /api/backup/scopes payload, S.ui.backupScopes state, A.mteamToggle]
provides: [test/xws-gate.test.mjs (membershipsOf byte gate), test/settings-client.test.mjs (95-02 harness), runNowCard scopes picker, unified mteamToggle chip contract]
affects: [95-02]
tech-stack:
  added: []
  patterns: [readFileSync+regex static-slice pins, once-per-session state fill guard (undefined=never fetched, null=refused)]
key-files:
  created: [test/xws-gate.test.mjs, test/settings-client.test.mjs]
  modified: [src/pages/backup.js, src/actions/actions.js, src/overlays/modals.js, test/team-pick-client.test.mjs, test/client-surfaces.test.mjs]
decisions:
  - "Run-now workspace picker options ride S.ui.backupScopes with a fail-closed loaded-workspace fallback — never memberships (pickers-only doctrine)"
  - "refreshBackupScopes is a once-per-session fill (guard on undefined) kicked with the backup page's first load; restore preview reuses the same state"
  - "IN.backupScopeKind arms the workspace fallback id on switch so the rendered select and the trigger wire can never disagree"
  - "SET-04: invite chips renamed data-a=mteamToggle under data-surface=invite on the form; A.invTeamToggle retired into a surface-aware A.mteamToggle"
actuals:
  tokens: 58500
  tasks: 3
  commits: 4
plan_head_before: 376427b0f1e89a01097f8dec8857ec0772a91192
plan_head_after: ce28f913
commits: 4
status: complete
---

# Phase 95 Plan 01: Wave-0 Gates + Cross-Workspace Picker Alignments Summary

**One-liner:** membershipsOf byte-pinned behind a grep-gate test; Run-now workspace picker swapped onto the phase-92 scopes payload (D-11); Invite Edit-Teams unified onto the mteamToggle chip contract (D-12); settings client-slice harness scaffolded for 95-02.

## What Was Built

- **test/xws-gate.test.mjs** — XWS-01 byte gate: pins membershipsOf's body internals (membership query, super-access union), the exact 3-line call-site set verbatim, and the `/api/backup/scopes` guard comment + direct-query contract (handler must not route through membershipsOf or workspacesForUser).
- **src/pages/backup.js** — runNowCard's workspace select now maps over `S.ui.backupScopes` (same payload as the restore target picker); fail-closed fallback to the loaded workspace only when scopes is empty; the page kicks `refreshBackupScopes()` on first load. No `api.workspace` option markup remains in the picker.
- **src/actions/actions.js** — new `refreshBackupScopes()` (once-per-session fill, refusal stages null → fallback); `IN.backupScopeKind` arms the workspace fallback id on switch (rendered select ≡ trigger wire); `A.mteamToggle` is surface-aware (`closest('[data-surface="invite"]')` → S.ui.inviteTeams; default branch = member draft byte-identical); `A.invTeamToggle` retired.
- **src/overlays/modals.js** — invite chips carry `data-a="mteamToggle"`; the invite form carries `data-surface="invite"` (chip closest() target). No markup count change (i18n data-a pins still 618).
- **test/team-pick-client.test.mjs** — new slice tests: invite chips on mteamToggle under the surface marker; invTeamToggle gone; surface-aware handler shape.
- **test/settings-client.test.mjs** — surviving-anchor pins for 95-02: my-access payload-only doctrine (never visibleProjects()), pIcon import+usage, apiKeyRevoke ask/confirm pair, members.js visibility payload consumer, ws-url flex row + host prefix span.

## Tasks

| Task | Type | Commit |
|------|------|--------|
| 1. XWS-01 tracer — grep gate + Run-now picker on scopes payload | tracer | a714221c |
| 2. SET-04 — Invite Edit-Teams onto mteamToggle contract | auto | 5c8d4415 |
| 3. Wave-0 settings client-slice harness | auto | 513da99d |
| Pin update (86-02 esc() shape, Rule 1) | fix | ce28f913 |

## Deviations from Plan

**[Rule 2 - Missing critical functionality] Added `refreshBackupScopes()` + kick + kind-switch arming**
- **Found during:** Task 1
- **Issue:** The plan's picker swap maps over `S.ui.backupScopes`, but that state was only populated by the restore preview flow — without a fetch the Run-now picker could never show all workspaces (D-11's truth would be dead). Also, `IN.backupScopeKind` left `scope.id` null on switch to workspace, so the rendered select's visible option and `A.backupRunNow`'s `scope.id || api.workspace?.id` wire could disagree once options are multiple.
- **Fix:** `refreshBackupScopes()` (once-per-session guard) kicked with the page's first load; `IN.backupScopeKind` arms the fallback id for the workspace kind. src/actions/actions.js was already in the plan's files_modified set; server.js untouched (gate green).
- **Files modified:** src/actions/actions.js, src/pages/backup.js
- **Commit:** a714221c

**[Rule 1 - Stale pin] Updated the 86-02 runNowCard esc() assertion**
- **Found during:** Full-suite verification
- **Issue:** `test/client-surfaces.test.mjs` pinned `esc(api.workspace.name || api.workspace.id)` inside runNowCard — the exact markup this plan replaces.
- **Fix:** Pin updated to `esc(w.name || w.id)` — same intent (esc on every payload string), new payload-driven shape.
- **Files modified:** test/client-surfaces.test.mjs
- **Commit:** ce28f913

## Verification

- `node --test test/xws-gate.test.mjs test/backup-history-client.test.mjs test/team-pick-client.test.mjs test/settings-client.test.mjs` → 43 pass / 0 fail
- `npm run build` → exit 0 (i18n-scan gate; zero new locale keys — plan reuses existing keys)
- `npm test` → 2460 tests, 2433 pass, **2 fail = the 2 known pre-existing failures only** (D-05 fr-typography, D-06 webhook-routes)
- `git diff` across the plan shows **no server.js change** (membershipsOf byte-green)
- i18n data-a site count still 618 (rename, no markup added/removed)

## Known Stubs

None.

## Threat Flags

None — the picker reads only the operator-gated `/api/backup/scopes` payload client-side (T-95-01 mitigated by the grep gate + fail-closed fallback; render-only doctrine intact).

## Self-Check: PASSED

- test/xws-gate.test.mjs — FOUND (4 tests pass)
- test/settings-client.test.mjs — FOUND (5 tests pass)
- Commits a714221c / 5c8d4415 / 513da99d / ce28f913 — FOUND in `git log`
- Plan measured: 4 commits from plan_head_before 376427b0 → ce28f913
