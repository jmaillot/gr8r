---
phase: 95-settings-polish-cross-workspace-pickers-project-overwrite-re
plan: 05
subsystem: scopes-payload + restore-drawer-project-overwrite
tags: [bkrst-05, xws-01, d-02, d-03, scopes-payload, project-picker, confirm-phrase, i18n]
requires: [95-04 overwrite engine + route ({runId, targetWorkspaceId, targetProjectId, confirmName}), 95-01 refreshBackupScopes + S.ui.backupScopes, phase-92 scopes endpoint]
provides: [scopes payload additive projects:[{id,name}], drawer restoreProjectPick chip row, project-scope Overwrite CTA, confirmDlg confirm-phrase flow for project targets]
affects: []
tech-stack:
  added: []
  patterns: [additive payload keys (no key removed, strict pin moved knowingly), second-level chip picker riding the same operator-gated payload, client-dialog-as-chrome (server re-validates confirmName vs live doc)]
key-files:
  created: []
  modified: [server.js, src/pages/backup.js, src/actions/actions.js, src/locales/en.json, src/locales/fr.json, src/locales/nl.json, src/locales/de.json, src/locales/es.json, test/backup-scopes.test.mjs, test/restore-client.test.mjs, test/xws-gate.test.mjs, test/i18n-toast.test.mjs, test/i18n-shell.test.mjs]
decisions:
  - "Scopes projects are unfiltered (no visibility filtering) — the picker needs names to arm a target; the 95-04 overwrite route re-validates everything against the live doc, fail-closed"
  - "Project picker chips ride S.ui.backupScopes[].projects only (scopes-payload doctrine) — the memberships fallback carries no projects key, so the row simply never renders there (fail-closed)"
  - "Overwrite POST mirrors the actual route contract: { runId, targetId, targetProjectId, confirmName } (the plan's targetWorkspaceId key name corrected — the 95-04 route reads targetId)"
  - "Switching the workspace target resets S.ui.restoreTargetProject — chips re-render from the new workspace's projects, never the stale pick"
  - "The xws-gate scopes-query pin and the tree-wide data-a count pins (621→623) were updated KNOWINGLY in the same commits as the additive changes"
actuals:
  tokens: 52000
  tasks: 3
  commits: 4
plan_head_before: c8a09b66
plan_head_after: 26d17ac2
commits: 4
status: complete
---

# Phase 95 Plan 05: Restore Drawer — Project Picker + Overwrite CTA (BKRST-05 client half) Summary

**One-liner:** The scopes payload grows an additive per-workspace `projects:[{id,name}]`; the restore drawer gains the second-level project chip row and the Overwrite CTA for project archives (both CTAs per D-02), gated by the confirm-phrase dialog against the target project's CURRENT name, POSTing the 95-04 engine contract with server-side re-validation.

## What Was Built

- **server.js — GET /api/backup/scopes**: each workspaces[] entry now carries `projects: [{id, name}]` read from the workspace doc (name falls back to id, extra keys dropped, zero projects → `[]`). Gate (backup-role OR restore-role OR Super Admin), sameOrigin, and the direct-query pattern unchanged — no membershipsOf routing. T-95-11 mitigated: the additive field rides the existing operator gate; plain members still get the pinned 403.
- **src/pages/backup.js**: second chip row (`data-a="restoreProjectPick"`) of the chosen workspace's projects, keyed `page.restore.projectPickLabel/Hint`; picking arms `S.ui.restoreTargetProject`. The project Overwrite CTA (`page.restore.overwriteCta`) renders only when `flags?.canBackup` AND both target ids are armed; "Restore as new" stays beside it (D-02).
- **src/actions/actions.js**: `A.restoreProjectPick` (+ workspace-change reset of the armed project); `A.restoreOverwrite` project branch — cold refusal via `restoreToast('restoreTargetMissing')`, `confirmDlg({ typeName: targetProject.name, danger: true })` with the CURRENT name from the scopes payload (chrome only — server re-reads the live doc), then `api.restoreOverwrite({ runId, targetId: wsId, targetProjectId: projId, confirmName: targetProject.name })`; refusals (restoreNameCollision per D-03) ride the existing closed restoreToast map; success resets state and hands to the shared poll.
- **Locales ×5** — `page.restore.projectPickLabel`, `projectPickHint`, `overwriteCta`, `overwriteConfirmTitle` added in the same commit as the emitting code; `npm run build` (i18n-scan gate) exit 0.
- **Tests** — backup-scopes: strict pin moved knowingly to id/name/slug/projects + live-doc shape case + zero-projects case (non-operator 403 pin already green); restore-client: 5 new 95-05 slices (chip row payload-driven, both CTAs, confirmDlg typeName, payload contract, ×5 parity) + widened overwrite-action window; xws-gate: scopes-query pin updated knowingly for the additive `doc` column; i18n-toast/shell: data-a count pins 621→623 knowingly.

## Tasks

| Task | Type | Commit |
|------|------|--------|
| 1. Scopes payload — additive projects per workspace | auto/tdd | 28f62c18 |
| 2. Drawer — project picker + Overwrite CTA + confirm phrase | auto | c42c3e00 |
| 3. Client-slice pins + phase gate | auto | d801652c |
| data-a count pins 621→623 (Rule 1 stale pin) | fix | 26d17ac2 |

## Deviations from Plan

**[Rule 1 — Stale pins, knowingly updated]**
- **Found during:** Tasks 1/3 + full-suite gate
- **Issue:** (a) backup-scopes strict pin `['id','name','slug']` — the plan mandates the move in the same commit; (b) xws-gate pinned the exact scopes query string (now carries `doc` additively); (c) restore-client's 1800-char overwrite-action window no longer reached the workspace branch after the project branch was inserted; (d) tree-wide data-a counts (621 in i18n-toast + i18n-shell) grew by 2 markup occurrences.
- **Fix:** All four pins updated knowingly with same-commit provenance comments. The server comment was reworded so the handler block stays free of the `membershipsOf` token (the xws gate asserts its absence).
- **Commits:** 28f62c18 / d801652c / 26d17ac2

**[Rule 1 — Plan bug] Overwrite payload key `targetId`, not `targetWorkspaceId`**
- **Found during:** Task 2
- **Issue:** The plan specifies POST body `{ runId, targetWorkspaceId, targetProjectId, confirmName }`, but the 95-04 route reads `body.targetId` (line 9939) — a literal implementation would have failed the route.
- **Fix:** Client sends `{ runId, targetId: wsId, targetProjectId, confirmName }`, mirroring the shipped route contract; pinned by the Task-3 slice.
- **Commit:** c42c3e00

## Verification

- `node --test test/backup-scopes.test.mjs test/restore-client.test.mjs test/xws-gate.test.mjs test/i18n-scan.test.mjs` → 74 pass / 0 fail
- `node --test test/i18n-toast.test.mjs test/i18n-shell.test.mjs` → 26 pass / 0 fail
- `npm run build` → exit 0 (i18n-scan gate)
- `npm test` → **2492 tests, 2465 pass, 2 fail = exactly the 2 known pre-existing failures** (D-05 fr-typography, D-06 webhook-routes)

## Known Stubs

None — every wired path is exercised by a passing test.

## Threat Flags

None new — T-95-11 (information disclosure) mitigated: the projects field rides the unchanged operator-gated endpoint; the non-operator 403 pin stayed green. T-95-12 (tampering) mitigated: the client dialog is chrome; the server re-validates confirmName/targetProjectId against the live doc (95-04 route tests).

## Self-Check: PASSED

- server.js / src/pages/backup.js / src/actions/actions.js / 5 locales — FOUND, committed (28f62c18, c42c3e00)
- test/backup-scopes.test.mjs / test/restore-client.test.mjs / test/xws-gate.test.mjs / i18n count pins — FOUND, green
- Commits 28f62c18 / c42c3e00 / d801652c / 26d17ac2 — FOUND in `git log` (4 commits from plan_head_before c8a09b66 → 26d17ac2)
