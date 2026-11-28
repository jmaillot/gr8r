---
phase: 108-restore-probing-run-attribution-closeout
plan: 02
subsystem: restore-pipeline
tags: [backup, restore, attribution, sso, i18n, docs, d-89-14]
requires: [108-01 landed (pin finals: verbs 87, data-a 637, backup-prune runs-SELECT 13), Phase 89 restore_runs writer, Phase 106 oidc callback anchors]
provides: [restore_runs.created_by column (dual-engine ensureColumn), createdBy on the 3 restore start events, runs GET left join users (created_by_name), Trigger-cell operator render + legacy '—', page.restore.initiatorLabel ×5, fixed SSO callback logWarn, DEPLOY.md email-claim symptom row, test/restore-created-by.test.mjs]
affects: [milestone v3.7 closeout (final phase plan of Phase 108)]
tech-stack:
  added: []
  patterns: [event-payload attribution route (createdBy rides the start event), server-side name resolution via left join, static-source-assert harness (D-89-14 style), fixed non-interpolated log discipline]
key-files:
  created:
    - test/restore-created-by.test.mjs
  modified:
    - server.js
    - src/pages/backup.js
    - src/locales/en.json
    - src/locales/de.json
    - src/locales/es.json
    - src/locales/fr.json
    - src/locales/nl.json
    - test/restore-routes.test.mjs
    - test/restore-client.test.mjs
    - docs/DEPLOY.md
decisions:
  - "created_by captured at the 3 start-event emit sites (event-payload route, exactly 3 sites, all route-scoped with user in scope) — not post-insert stamping"
  - "Display name resolved SERVER-SIDE via left join users on the runs GET (A3) — no raw uid ever on the wire for display; client renders esc()d created_by_name or '—'"
  - "Additive DDL only: adapterEnsureColumn adjacent to the archive_name precedent — schema block, PG_EPOCH_COLUMNS, and copy-sqlite-to-pg all untouched (Pitfall 5)"
  - "CARRY-03 catch stays unbound: one fixed non-interpolated logWarn, no e.message (T-108-06)"
metrics:
  duration: 45 min
  completed: 2026-11-28
status: complete
estimate:
  tokens: 48000
actuals:
  tokens: 6056
  tasks: 3
  commits: 3
plan_head_before: 2c6a87d147f6550b007f010749f3ec548607047b
plan_head_after: ddaa48bda1cfdbee94fdeb089d273add192dfe59
---

# Phase 108 Plan 02: Run Attribution & Closeout (CARRY-02/03/04) Summary

**One-liner:** restore_runs.created_by captured at the three trigger-route start events, resolved server-side to the operator's display name via a left join on users and rendered esc()d in the Trigger cell (legacy rows honest '—'), plus the fixed non-interpolated SSO callback logWarn and the DEPLOY.md email-optional-claim symptom row.

## Tasks Completed

| Task | Name | Commit | Key files |
| ---- | ---- | ------ | --------- |
| 1 | created_by DDL + capture chain + runs GET join (TDD) | c9d42b74 | server.js, test/restore-created-by.test.mjs (new), test/restore-routes.test.mjs |
| 2 | Trigger-cell render + legacy '—' + initiatorLabel ×5 (TDD) | efe1f392 | src/pages/backup.js, src/locales/*.json ×5, test/restore-client.test.mjs |
| 3 | Fixed SSO logWarn + DEPLOY.md row + full-suite gate | ddaa48bd | server.js, docs/DEPLOY.md |

## Verification

- `node --test test/restore-created-by.test.mjs` → **6/6 green** (DDL site adjacency + epoch-registry cleanliness + schema-block untouched; exactly 3 emit sites each carrying `createdBy: user.id` per trigger; writer start-insert column + write-once; runs GET left join + `u.name as created_by_name`; CARRY-03 fixed-line-once + unbound catch; CARRY-04 row fragments).
- Task 1 automated verify (ensureColumn present / epoch registry clean) → ok.
- `node --test test/restore-client.test.mjs` → **32/32 green** (esc render + '—' fallback + initiatorLabel ×5 parity; all 89-06/105-01/108-01 pins literal).
- `npm run i18n:scan` → 0 literals, 0 pending, 0 stale, 0 dead.
- `node --test test/domain-admission-sso.test.mjs` → 18/18 (SSO surface intact).
- **Full suite** (`set -o pipefail; npm test`): **2836 tests, 2803 pass, 2 fail — exactly the 2 documented pre-existing failures** (french-typography baseline content, webhook-routes GET list). 2836 = 2828 baseline + 8 new tests (6 created-by + 2 client pins). french-typography violation content verified to contain zero entries from this plan's strings ("Déclenché par" has no apostrophes).

## created_by matrix (CARRY-02 end-to-end)

| Trigger route | Emit site | createdBy | Writer | Display |
| --- | --- | --- | --- | --- |
| POST /api/backup/restore (import_new) | start event :11021 | `user.id` | start-insert created_by | esc'd created_by_name via left join |
| POST /api/backup/restore/instance | :11129 | `user.id` | same | same |
| POST /api/backup/restore/overwrite | :11281 | `user.id` | same | same |
| legacy rows (pre-column) | — | NULL | — | honest '—' |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 89-02 boot RESTORE_RUN_COLUMNS pin extended +created_by**
- **Found during:** Task 1 full-file run
- **Issue:** test/restore-routes.test.mjs pins the exact restore_runs column list (deepEqual); the new column tripped it.
- **Fix:** Pin extended with a same-commit comment (extended, never weakened) — mirrors the archive_name precedent entry.
- **Files:** test/restore-routes.test.mjs — Commit c9d42b74

**2. [Rule 1 - Bug] runs-SELECT pin in restore-client.test.mjs extended to the left-join shape**
- **Found during:** Task 2 (RED run surfaced it)
- **Issue:** The test pinned the literal old select substring `snapshot_tag, archive_name, error, started_at`; the aliased left-join select no longer contains it.
- **Fix:** Pin extended to `r.archive_name, r.created_by, u.name as created_by_name` with same-commit comment.
- **Files:** test/restore-client.test.mjs — Commit efe1f392

### Checker-artifact notes (non-blocking)
- Plan anchors had drifted post-108-01 (research numbers were pre-wave-1): actual emit sites :11021/:11129/:11281, writer :3877, runs GET :11336, Trigger cell backup.js:821 — all found via grep and verified verbatim.
- Task 3's verify's inline `node -e` one-liner failed as a shell quoting issue (not a product issue); re-run via a temp .cjs file — same assertions, ok. The suite gate uses `npm test` (the repo's own `node --test --test-concurrency=2 test/*.test.mjs`) because bare `node --test test/` is not a valid invocation on this Node version.

## Threat Model Compliance
- T-108-05: display names cross esc() only; server-side join means no raw uid ships for display; pinned by restore-client regex pins ✓
- T-108-06: fixed non-interpolated logWarn; catch binds no error variable; asserted exactly-once in restore-created-by.test.mjs ✓
- T-108-07: adapterEnsureColumn additive DDL only; schema block + PG_EPOCH_COLUMNS untouched, asserted ✓
- T-108-SC: zero new dependencies ✓

## Known Stubs

None. All three carried items are fully wired end-to-end (no placeholders, no skipped tests, no unrun verifies).

## Milestone-Closeout Readiness (FINAL phase plan of Phase 108)

- Both 108 SUMMARYs on disk: 108-01-SUMMARY.md (CARRY-01 stat surface) + this file.
- Requirements CARRY-01 (108-01), CARRY-02/03/04 (this plan) implemented and verified; requirements: [CARRY-02, CARRY-03, CARRY-04] from frontmatter ready to mark complete.
- Full suite at baseline (2836 / 2 documented pre-existing failures); no Known Stubs; no open threats; zero new dependencies.
- Ready for `/gsd-verify-work` (Phase 108) and subsequent `/gsd-complete-milestone` for v3.7.

## Self-Check: PASSED

- Found: test/restore-created-by.test.mjs, docs/DEPLOY.md row, server.js wiring — all committed.
- Commits verified present in `git log`: c9d42b74, efe1f392, ddaa48bd; measured 3 commits over plan_head_before (2c6a87d1).
