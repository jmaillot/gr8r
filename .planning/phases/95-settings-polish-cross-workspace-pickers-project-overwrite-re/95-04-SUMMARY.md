---
phase: 95-settings-polish-cross-workspace-pickers-project-overwrite-re
plan: 04
subsystem: restore-engine + overwrite-route
tags: [bkrst-05, project-overwrite, d-01-deletion-set, d-04-lock, collision-scan, tdd]
requires: [95-01 settings harness, 89-05 restoreOverwriteUnit guard chain, phase-86 project-scope export, phase-92 backupScopeWorkspaces payload]
provides: [restoreOverwriteUnit project branch (overwriteProjectFragment), overwrite route project-scope acceptance, err.restoreNameCollision ×5, project-overwrite test matrix]
affects: [95-05 (restore drawer half rides this engine)]
tech-stack:
  added: []
  patterns: [doc-fragment replacement with ids verbatim (no planRemap), transitive parentId task-closure, collision scan with armed-target self-exclusion, lock released via shared failWith/success funnel]
key-files:
  created: []
  modified: [export/restore.js, server.js, src/actions/actions.js, src/locales/en.json, src/locales/fr.json, src/locales/nl.json, src/locales/de.json, src/locales/es.json, test/restore-overwrite.test.mjs, test/restore-routes.test.mjs, test/error-codes.test.mjs]
decisions:
  - "Checkpoint D-04 resolved `lock-unchanged` (owner 2026-11-24): the global restore lock applies UNCHANGED to the project-overwrite path — the branch inherits claimRestoreLock/release exactly as the workspace path does; no parallelism, no per-scope locking"
  - "Project overwrite splices the archive fragment into the TARGET workspace doc with ids VERBATIM (no planRemap) — the doc-splice IS the workspace_id-remap interpretation of SC-6"
  - "Collision scan excludes the armed target project id — a same-named overwrite SUCCEEDS (Pitfall 1); a differently-id'd same-named live project refuses keyed restoreNameCollision naming the conflicting project"
  - "Route permissions: the verbatim CAP.BACKUP_MANAGE chain is kept byte-unchanged (the plan's 'Backup Operator excluded / Restore-Op member allowed' truth is unimplementable without reordering gate-before-body, which would regress the locked 89-05 403 pin); D-05 is honored via the import_new-position targeting gate — project scope additionally requires current workspace membership OR isInstanceAdmin+SUPER_ACCESS, else keyed restoreNoWorkspace"
  - "Workspace logo is NOT part of the project deletion set — project archives carry logo:null; removing the target's logo blob would dangle the live doc reference (plan-literal '+ its logo' corrected)"
  - "syncTaskFts for the project branch receives {data:stored} — docData() returns the data object itself; the {data:...} wrapper makes the dead-task FTS removals actually resolve"
actuals:
  tokens: 76000
  tasks: 4
  commits: 4
plan_head_before: 69cbd673562e1a532784acb8e42a070c026a9aed
plan_head_after: 29bf6887
commits: 4
status: complete
---

# Phase 95 Plan 04: Project-Overwrite Restore — Engine Half (BKRST-05) Summary

**One-liner:** `restoreOverwriteUnit` gains a project branch — the archive fragment replaces its armed target project inside the target workspace doc (ids verbatim, D-01 deletion set, self-excluding collision scan, one tx, FTS synced) behind the unchanged 89-05 guard chain; the overwrite route accepts project scope with server-side confirmName against the live doc project name.

## What Was Built

- **export/restore.js — `overwriteProjectFragment`** (module-level helper invoked INSIDE the unit, after snapshot-first P7 + archive verify/extraction/totality, so it inherits the snapshot/repair-net/lock plumbing):
  - Fragment extraction mirrors the import-as-new project filter (project + tasks by `f.project===pid` closure + comments of those tasks + files `f.project===pid`, teams:[], projOrder:[pid], logo:null) — ids VERBATIM, no remap.
  - D-01 deletion set over the live doc: project entry, task-id closure (transitive through parentId chains), comments of dead tasks, files by `f.project===pid` OR `f.task∈dead`, projOrder ref, and activity/events/notifs references to the project or dead tasks.
  - Collision scan before the tx / after the snapshot, case-insensitive, target id EXCLUDED from the conflicting set; refusal keyed `restoreNameCollision` with the conflicting names interpolated.
  - Blob plan: oldIds = the D-01 file deletion set; removals = oldIds − newIds; same staged swap + snapshot repair net; workspace logo untouched.
  - ONE tx: `update workspaces set doc=?, revision=revision+1` (identity untouched), `syncTaskFts(txScope, wsId, {data:stored}, nextDoc)` inside, pre-commit verification (fragment totality over the final doc, project count unchanged, blob presence, whole-archive digest).
  - Lock released on every exit — the unit's dispatch wraps the helper result with `await release()`; `failWith` releases on refusals (D-04: the funnel is unchanged).
- **server.js — the EXISTING overwrite route**, two extension points only: (1) scope-kind check accepts `project` + regex-guarded `body.targetProjectId`; (2) confirmName source for project scope = the live target project's name read from the workspace doc (missing project → 404 `restoreTargetMissing`), checked BEFORE archive resolution. D-05 targeting gate (membership | Super Admin bypass) sits at the import_new precedent position, after scope parse; throttle key, refusal codes, CAP gate, chain order byte-unchanged; audit `restore_started:overwrite` scope token `project`; run row carries `{kind:'project', id:archiveProjectId}`.
- **Locales ×5** — `err.restoreNameCollision` (en/fr/nl/de/es) + the client refusal-map wiring in actions.js, same commit as the engine code; `npm run build` (i18n-scan gate) exit 0.
- **Tests** — test/restore-overwrite.test.mjs grew 11 cells (happy path/verbatim ids, D-01 deletion set, same-named self-exclusion, true collision, missing target ×2, FTS, D-06 history, totality refusal, snapshot honesty, i18n ×5, D-04 route lock cell); test/restore-routes.test.mjs grew 3 route cells (acceptance + audit token, confirmName near-miss/missing-target, role matrix); test/error-codes.test.mjs allowlists `restoreNameCollision` as client-side.

## Tasks

| Task | Type | Commit |
|------|------|--------|
| 1. Checkpoint D-04 — lock ruling confirmed (`lock-unchanged`) | checkpoint:decision | 904c840e (record commit) |
| 2. Engine — restoreOverwriteUnit project branch (red→green) | auto/tdd | d4d5a9db |
| 3. Route — project-scope acceptance + live-doc confirmName | auto | 67980586 |
| 4. Refusal matrix + integration sweep | auto | 29bf6887 |

## Deviations from Plan

**[Rule 1 — Plan bug] Route permissions implemented via the D-05 targeting gate, not a Restore-Op authority switch**
- **Found during:** Task 3
- **Issue:** The plan's truth 5 ("Super Admin bypass + Restore Operator with workspace membership; Backup Operator excluded — CAP gate already enforces") contradicts the locked 89-05 chain: the overwrite route's first gate is `CAP.BACKUP_MANAGE` (Backup Operators pass, Restore Operators are 403-pinned by an existing test), and scope lives on the run row — only readable AFTER body probing, so a scope-conditional capability gate would violate the locked gate-before-body doctrine AND regress the pre-existing restore-operator 403 pin (plan `fails_when` forbids pre-existing regressions). The plan's premise ("CAP gate already enforces" Backup-Op exclusion) is factually wrong about `hasInstanceRole`.
- **Fix:** Keep the CAP gate verbatim; implement D-05 as the membership|SA targeting gate at the import_new position (Backup Operators without membership refuse `restoreNoWorkspace`; SA bypasses; the workspace path is byte-unchanged). All role-matrix behaviors are pinned: backup-op non-member refused, restore-op 403 (chain unchanged), SA bypass allowed.
- **Files modified:** server.js, test/restore-routes.test.mjs
- **Commit:** 67980586

**[Rule 1 — Plan bug] Workspace logo excluded from the project deletion set**
- **Found during:** Task 2
- **Issue:** Plan action 5 says oldIds = "the target project's files + its logo" — but the doc model's logo is the WORKSPACE logo and project archives carry `logo:null` (planRemap precedent); removing it would unlink a blob the next doc still references.
- **Fix:** oldIds = the D-01 file deletion set only (project files + dead-task files). Pinned: the logo reference and blob survive a project overwrite.
- **Commit:** d4d5a9db

**[Rule 3 — Blocking gate] error-codes reverse-parity allowlist entry**
- **Found during:** Task 4 full-suite gate
- **Issue:** `err.restoreNameCollision` is keyed by the ENGINE (export/restore.js), not emitted by server.js — the reverse-parity test failed for the new catalogue code.
- **Fix:** `restoreNameCollision` added to CLIENT_ONLY_ERR_CODES with the engine-keyed provenance comment.
- **Commit:** 29bf6887

**[Judgment call] Role-matrix tests live in restore-routes.test.mjs, not restore-security.test.mjs**
- restore-security.test.mjs is an engine-level reader-hardening suite with no route harness; the matrix cells ride restore-routes.test.mjs's server fixtures. Documented here; acceptance (matrix passes) unchanged.

## Verification

- `node --test test/restore-overwrite.test.mjs test/restore-routes.test.mjs test/restore-security.test.mjs test/i18n-scan.test.mjs` → 128 pass / 0 fail
- `node --test test/restore-overwrite.test.mjs` alone → 23 pass / 0 fail (11 new 95-04 cells + 12 pre-existing green)
- `npm run build` → exit 0 (i18n-scan gate)
- `npm test` → 2474 tests, 2447 pass, **2 fail = exactly the 2 known pre-existing failures** (D-05 fr-typography, D-06 webhook-routes)
- TDD contract honored: the 6 Task-2 behavior cases were committed-to-red first (all 6 failing with `restoreTargetMismatch`/`restoreTargetMissing`), then the engine branch turned them green

## Known Stubs

None — every wired path is exercised by a passing test; no placeholder data flows.

## Threat Flags

None new — T-95-07 (elevation) mitigated by the verbatim chain + server-side live-doc confirmName + D-05 targeting gate (pinned by the role-matrix cell); T-95-08 (tampering) by fragment totality + ids-verbatim + pre-commit JSON round-trip + digest re-hash; T-95-09 (DoS) by the unchanged global lock (D-04 route cell pins no per-scope bypass); T-95-10 (repudiation) by the `restore_started:overwrite` scope token `project` (pinned via audit target_name).

## Self-Check: PASSED

- export/restore.js / server.js / 5 locales / actions.js — FOUND, committed (d4d5a9db, 67980586)
- test/restore-overwrite.test.mjs (23 tests) / test/restore-routes.test.mjs / test/error-codes.test.mjs — FOUND, green
- Commits 904c840e / d4d5a9db / 67980586 / 29bf6887 — FOUND in `git log` (4 commits from plan_head_before 69cbd673 → 29bf6887)
