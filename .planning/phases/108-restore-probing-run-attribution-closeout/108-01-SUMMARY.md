---
phase: 108-restore-probing-run-attribution-closeout
plan: 01
subsystem: restore-pipeline
tags: [backup, restore, stat, s3, ftp, smb, i18n, d-89-14]
requires: [Phase 104 probe route (byte-identical contract), Phase 105 client probe pins, Phase 107 landed pin baselines (verbs 86, data-a 636)]
provides: [POST /api/backup/restore/stat, restoreRemoteKey shared helper, statS3/statFtp/statSmb seams, data-a="restoreStat" client surface, page.restore.sourceStat*/sourceProbeMissing keys ×5, extended D-89-14 stat pin]
affects: [108-02 (created_by/closeout — pin finals: verbs 87, data-a 637)]
tech-stack:
  added: []
  patterns: [probe-funnel verbatim clone, CREATE-minus-READ read-only SMB frame, three-state keyed result, same-commit pin comments]
key-files:
  created:
    - test/restore-stat.test.mjs
    - test/helpers/smb-mock.mjs
  modified:
    - export/restore.js
    - export/s3.js
    - export/ftp.js
    - export/smb.js
    - server.js
    - src/core/api.js
    - src/actions/actions.js
    - src/pages/backup.js
    - src/locales/{en,de,es,fr,nl}.json
    - test/restore-source-param.test.mjs
    - test/restore-client.test.mjs
    - test/i18n-core-features.test.mjs
    - test/i18n-toast.test.mjs
    - test/i18n-shell.test.mjs
    - test/backup-smb-client.test.mjs
    - test/backup-prune.test.mjs
decisions:
  - "restoreRemoteKey extracted verbatim from :1482; FTP/SMB stay UNCONDITIONAL backup-task- (no backup-manual fallback off S3); 16 goldens byte-identical"
  - "statSmb rides read()'s CREATE frame minus the READ (FILE_RIGHTS_R + FILE_OPEN_IF, createOptions 0) — frame-level delete-on-close pin added"
  - "Client wiring = additive decision A1; all 105-01 pinned probe substrings literal"
  - "fr stat strings use typographic apostrophes (’) — no new french-typography violations"
metrics:
  duration: 50 min
  completed: 2026-11-28
status: complete
estimate:
  tokens: 68000
actuals:
  tokens: 58000
  tasks: 3
  commits: 4
plan_head_before: 554b7e40e7cf96b97e82bfd52966c6be10c477cb
plan_head_after: f5ba2202f1c46365de61b79cfab8fcf79fbbf7b8
---

# Phase 108 Plan 01: Restore Stat (CARRY-01) Summary

**One-liner:** Per-run archive stat via a separate `POST /api/backup/restore/stat` route — honest three-state result (present/missing/unreachable) through NEW statS3/statFtp/statSmb seams over one shared `restoreRemoteKey` derivation, with an additive client badge third state and D-89-14 pins extended, never weakened.

## Tasks Completed

| Task | Name | Commit | Key files |
| ---- | ---- | ------ | --------- |
| 1 | Shared key helper + 3 seam stat primitives + stat route (tracer) | 265c22d6 | export/{restore,s3,ftp,smb}.js, server.js, test/restore-stat.test.mjs, test/helpers/smb-mock.mjs, test/restore-source-param.test.mjs |
| 2 | Client stat button, three-state badge, toasts, locales ×5 (TDD) | 5cfb11e1 | src/core/api.js, src/actions/actions.js, src/pages/backup.js, src/locales/*.json ×5, i18n pins |
| — | fix: fr typographic apostrophes + prune pin 12→13 | f5ba2202 | src/locales/fr.json, test/backup-prune.test.mjs |

## Verification

- `node --test test/restore-stat.test.mjs test/restore-source-param.test.mjs test/restore-source-resolution.test.mjs` → 56/56 green; goldens file `git diff --stat` = 0 lines (byte-identical, untouched).
- `node --test test/restore-client.test.mjs test/i18n-core-features.test.mjs test/i18n-toast.test.mjs test/i18n-shell.test.mjs` → 82/82 green.
- Full suite (`npm test`): **2828 tests, 2795 pass, 2 fail — exactly the 2 documented pre-existing failures** (french-typography baseline content, webhook-routes GET list). backup-prune and backup-scheduler initial failures were pin/timing artifacts, fixed/re-verified (scheduler passed in isolation and in the final full run).
- D-89-14 extended pin: probe count still exactly 12, parallel stat-seam pin (3 sites, stat route only, list GET slice clean) — green.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] SMB mock extracted to test/helpers/smb-mock.mjs**
- **Found during:** Task 1 (writing restore-stat tests)
- **Issue:** The plan's "fake smb frame layer" needed the Phase-99 scripted NBSS frame server, which lived inline in test/backup-smb-client.test.mjs — copying it would duplicate ~280 lines of harness.
- **Fix:** Extracted the mock verbatim to test/helpers/smb-mock.mjs (adds `creates` frame-detail recording: DesiredAccess/CreateDisposition/CreateOptions); backup-smb-client.test.mjs re-imports from the helper (27/27 still green). This also enabled the frame-level delete-on-close pin (Pitfall 2 enforcement).
- **Files:** test/helpers/smb-mock.mjs (new), test/backup-smb-client.test.mjs

**2. [Rule 1 - Bug] backup-prune runs-SELECT pin 12→13**
- **Found during:** Task 3 (full-suite gate)
- **Issue:** The stat route's flag-read SELECT (`select id, task_id, filename, uploaded, ftp_uploaded, smb_uploaded …`) joined the family pinned at 12 by test/backup-prune.test.mjs:170.
- **Fix:** Pin extended 12→13 with same-commit comment (f5ba2202) — same shape as the 104 probe SELECT's earlier +1. Extended, never weakened.
- **Commit:** f5ba2202

**3. [Rule 1 - Bug] fr.json typography on the two new French stat strings**
- **Found during:** Task 3 (full-suite gate)
- **Issue:** Straight apostrophes in `sourceStatCheck`/`sourceStatChecking` added 2 new entries to the documented french-typography failure.
- **Fix:** Typographic ’ (f5ba2202); the failure's content returns exactly to its pre-existing baseline (zero sourceStat entries in the violation list).
- **Commit:** f5ba2202

### Checker-artifact notes (non-blocking)
- The Task 1 verify's literal probe `'restorestat|'` can never match the spec'd template-literal key `` `restorestat|${user.id}` `` — verified in the template-literal form instead (same family as the checker's W2 dropped-regex fix; the authoritative throttle assertions live in restore-stat.test.mjs's key-separation test, which passes).
- Task 2's plan-baselines (verbs 85→86, data-a 632→633) were pre-107 numbers; bumped RELATIVELY from the verified post-107 state per the W3 note: verbs 86→87, data-a 636→637 (both i18n-toast:301 and i18n-shell:349), all with same-commit comments.

## Threat Model Compliance
- T-108-01: guard chain verbatim clone, same order (sameOrigin → requireUser → throttle → role → runId regex → row read → source enum → flag) ✓
- T-108-02: dedicated `restorestat|<uid>` 10/15min; key separation from `restoreprobe|` pinned by a live test ✓
- T-108-03: audit detail = result.key ONLY (asserted: `target_name === 'archivePresent'/'archiveMissing'`, no credentials) ✓
- T-108-04: RESTORE_USE ∥ BACKUP_MANAGE verbatim, `restore_stat_refused:restoreRoleRequired` audited ✓
- T-108-SC: zero new dependencies ✓ (smb-mock extraction is a test-file move)

## Performance
- All stat frames read-only: S3 HEAD / FTP SIZE / SMB CREATE(FILE_RIGHTS_R + FILE_OPEN_IF, NO createOptions)+CLOSE — no marker PUT/DELETE traffic from any stat path (criterion 4).
- Stat never mutates: no clearMirrorFlag, no run-row write, no lock, no staging (mirror flags byte-identical after stat, pinned).

## Handoff to 108-02

**Actual pin finals (verify against the files at edit time):**
- verbs pin (test/i18n-core-features.test.mjs:171): **87**
- data-a pins (test/i18n-toast.test.mjs:301, test/i18n-shell.test.mjs:349): **637**
- data-r 64, data-v 95 (unchanged)
- backup-prune runs-SELECT pin (test/backup-prune.test.mjs): **13**

## Self-Check: PASSED

- Found: test/restore-stat.test.mjs, test/helpers/smb-mock.mjs — both committed (265c22d6).
- Commits verified: 265c22d6, 5cfb11e1, f5ba2202 present in `git log`; measured 4 commits over plan_head_before (incl. the final docs commit).
