# Phase 94 — Verification (goal-backward)

**Date:** 2026-11-24 · **Method:** goal-backward source verification + live-verified UAT rounds 1–11 + full test suite
**Result:** PASS — all 5 SCs hold; 11 UAT rounds of owner polish absorbed; 2 enhancements deferred to Phase 95 with owner sign-off.

## SC-1: Task list as an honest table — humanized schedule, Next run, Last run with status ✅

- `taskTable` renders a real `perm-t` table (panel-in-panel wrapper removed, 94-02 d3a621c5); `hist-t` variant gives the history table flush-left content-driven columns (92795114).
- Humanized schedule via the phase-92 server descriptor (`cronToPreset`, `schedule.preset` additive); "Every Monday at 00:00" wording ×5 locales (phase-92 keys, unchanged).
- Next run: date AND time from raw ms via `formatTime` (clock preference honoured; round-3 root-cause fix — parseDate YYYY-MM-DD-only silently emptied datetime strings; round-6 fixed the same class on 4 more cells). Pinned.
- Last run: 4-state badge (succeeded green / warning amber on missing blobs / error red for failed+upload_failed / running neutral) via client-side reduction over the one page-load `api.backupRuns({all:1,limit:50})` fetch; refreshed after Run now. Pinned.

## SC-2: Editor pre-fills current values incl. cron — header above the block ✅

- Pre-fill from `schedule.preset` with `cronDirty=false` preserved; null preset → readonly custom input (no client cron parsing — the descriptor is the only source). Pinned.
- "Edit backup task" header renders above the form. Live-verified rounds 1–2.

## SC-3: All four GFS scales editable; label never disagrees with scheduler ✅

- 4 inputs (day/week/month/year, defaults 7/4/12/5); labels `align-self:flex-end; padding-bottom:7px` (round-3, pixel-measured); GFS labels centered (round-3).
- DST matrix extended to labels (94-03); round-1 Rule-1 fix included (`0 3 * 2 *` was misclassified daily — `monRestricted` added to parseCron).

## SC-4: Unified run history — real columns, filters, fail-closed ✅

- Real table with Type/Task/Trigger/Schedule/Status/Date headers (round-4/5/7); Type filter gates BOTH backup and restore rows; task/trigger/status stay backup-only; Rotated (`status:'deleted'`) hidden by default, visible via the status filter (94-03).
- Fail-closed unchanged: frozen `?all=1` route untouched (phase-92 lockstep); restore payload server-scoped; every payload field through esc() (runTip, error, when); no client re-sort/cap (pinned).
- Restore-Op e2e pin: zero workspace names visible (unchanged from task 4; backupPollTick skips BACKUP_MANAGE-only `/runs/current` for `canBackup=false` — 94-02).

## SC-5: Names not ids; Run-now retention hint ✅

- Scope names render from the payload (never raw ids); "manual archives are under no retention" hint present. task_id NULL invariant untouched. Live-verified.

## Test evidence

- `npm test`: 2449 tests, 2422 pass / 2 fail — both pre-existing families (D-05 fr-typography, D-06 webhook-routes GET-list), documented, out of scope.
- `node --test backup-history-client / restore-client / restore-routes / governance-tabs-client / i18n-{shell,toast,core-features,prefs}`: all green after round-11.
- `npm run build` green every round (i18n-scan dead-key gate held: keys added+used in ONE commit, 7 dead keys removed across rounds 5/9/10).
- Live verification on Prod via browse (owner-lent tab): table alignment pixel-measured (rounds 3–7), restore drawer picker live-checked (round-8/11: 3 workspaces listed, scoped correctly).

## Scope outcomes (owner-driven, absorbed without plan deviations beyond gap plans)

- 94-02 + 94-03 gap plans executed as planned; rounds 3–11 were conversational UAT iterations committed atomically each round with their pins (11 commits d3a621c5→79e142dd).
- Deferred to Phase 95 (owner ruling): BKRST-05 project-overwrite restore (engine extension — 89-05 unit is workspace-only by design, 86-D-01). ROADMAP updated.
