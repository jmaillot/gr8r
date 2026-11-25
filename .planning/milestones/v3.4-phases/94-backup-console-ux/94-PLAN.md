---
phase: 94-backup-console-ux
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - export/cron.js
  - server.js
  - src/pages/backup.js
  - src/actions/actions.js
  - src/locales/en.json
  - src/locales/fr.json
  - src/locales/nl.json
  - src/locales/de.json
  - src/locales/es.json
  - test/backup-cron.test.mjs
  - test/backup-history-client.test.mjs
  - test/dst-cron-boundaries.test.mjs
  - src/core/api.js
  - e2e/backup-console-restore-op.spec.mjs
autonomous: true
requirements: [BKUI-01, BKUI-02, BKUI-03, BKUI-04]
estimate:
  tokens: 110000
  raw_tokens: 95000
  tasks: 6
  confidence: low
must_haves:
  truths:
    - Operator sees a real task table (not blocks-in-blocks) with humanized schedule, Next run from next_run_at, and a 4-state last-run badge (succeeded green / running neutral / failed red / succeeded+checksum_ok=false yellow) — D-01, BKUI-01
    - Clicking Edit pre-fills name/scope/tz/retention/enabled AND reverse-maps the stored cron via server-side schedule.preset; matching presets pre-select dropdowns without setting cronDirty; non-matching → readonly custom display + honest hint; header "Edit backup task" above the form — D-02, BKUI-02
    - Retention form shows 4 numeric inputs (day/week/month/year) labeled with gfsDaily/Weekly/Monthly/Yearly, staged in S.ui.backupTaskForm.retention, always sent on save — D-03, BKUI-03
    - One unified "Run history" sblock below the table with task/trigger/status selects, naive limit/offset pagination, run.label rendered verbatim, manual-not-retained hint, riding ?all=1 unchanged; per-task historyCard retired — D-04, BKUI-04
    - A Restore Operator account sees only fail-closed permitted rows in the unified history (e2e pin)
    - All new i18n keys exist ×5 locales and are used (i18n-scan prebuild gate green)
  artifacts:
    - export/cron.js exporting cronToPreset
    - server.js backupTaskShape carrying schedule.preset (+ dom/mon singleton fields)
    - src/pages/backup.js task table + unified history sblock
    - src/actions/actions.js pre-filled backupTaskEdit + 4-field retention staging
    - e2e/backup-console-restore-op.spec.mjs
  key_links:
    - export/cron.js cronToPreset → server.js backupTaskShape schedule.preset → actions.js backupTaskEdit form.preset/fields
    - actions.js backupTaskHistory → unified sblock filter + scroll (historyCard removed)
    - S.ui.backupTaskForm.retention.monthly/yearly → backupTaskSave body
---

<objective>
Turn the Backup page into an honest console: real task table with humanized schedule + Next/Last run (D-01/BKUI-01), pre-filled task editor with header and custom-schedule fallback (D-02/BKUI-02), 4-scale retention editing (D-03/BKUI-03), and a unified cross-task run history sblock with filters over the frozen Phase-92 `?all=1` contract (D-04/BKUI-04), pinned by a Restore-Operator e2e. Only server touch: `cronToPreset` in export/cron.js + additive `schedule.preset` (and dom/mon pre-select fields) on `backupTaskShape`.

Purpose: the owner's four complaints (unreadable blocks, raw cron shown, empty editor, scattered per-task history) each answered by a locked decision.
Output: working client rework + one additive server field + tests (unit RED→GREEN, static, ×5 locale parity, e2e pin).
</objective>

<execution_context>
@/home/jmaillot/.config/opencode/gsd-core/workflows/execute-plan.md
@/home/jmaillot/.config/opencode/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/phases/94-backup-console-ux/94-CONTEXT.md
@.planning/phases/94-backup-console-ux/94-RESEARCH.md
@.planning/phases/94-backup-console-ux/94-VALIDATION.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@export/cron.js
@src/pages/backup.js
@src/actions/actions.js
@test/backup-cron.test.mjs
@test/backup-history-client.test.mjs
</context>

<tasks>

<task type="tracer">
  <name>Task 0: Wave 0 — cronToPreset RED unit cases + Restore-Op e2e scaffold</name>
  <files>test/backup-cron.test.mjs, e2e/backup-console-restore-op.spec.mjs</files>
  <action>Write failing-first test scaffolds before any production change. (a) In test/backup-cron.test.mjs, append a cronToPreset describe block beside the existing describeCron block (:119–146) using deepEqual-style cases: `0 3 * * *` → daily; `0 3 * * 1` → weekly; `0 3 1 * *` → monthly; `0 3 1 1 *` → yearly; `*/15 * * * *` → null; `0 3 * * 0,6` (multi-dow) → null; `0 3-5 * * *` (range) → null; malformed/uncleanable input → null; dow 7 fold (`0 3 * * 7` ≡ weekly, consistent with describeCron's 0=7 handling). The contract shape: cronToPreset(expr) returns `'daily'|'weekly'|'monthly'|'yearly'|null` (planner-locked: the flat string form; field values for dropdown pre-select are emitted separately by describeCron in Task 1 — see D-02 / RESEARCH decision point). Run to confirm RED (export does not exist yet). (b) Create e2e/backup-console-restore-op.spec.mjs scaffolded on the admin-revoke-cycle.spec.mjs / operator-revoke-cycle.spec.mjs harness precedent (e2e/helpers/setup.mjs: createAccount, workspace invites, TOTP): it should skip gracefully until Task 5 fills the assertions, but already set up the two accounts and grant Restore-Op via instanceRoleGrant (src/core/api.js:551 — role value is `restore_operator` (server.js:8689; DDL check constraint server.js:729) — verify against the server instance-roles route before finalizing; keep this self-guard). Do not touch the legacy golden fixture or `?taskId=` path.</action>
  <verify>
    <automated>node --test test/backup-cron.test.mjs 2>&1 | grep -q "cronToPreset" && echo W0-RED-PRESENT; node -e "1" </automated>
  </verify>
  <done>cronToPreset unit cases exist and fail RED (function not yet exported); e2e spec file exists with account/role setup and no assertion yet enforced (or skips cleanly).</done>
</task>

<task type="auto">
  <name>Task 1: Server — cronToPreset + schedule.preset on backupTaskShape (GREEN)</name>
  <files>export/cron.js, server.js</files>
  <action>Implement per D-02 (server-side only; client never evaluates cron, T-87-11). In export/cron.js beside describeCron (:115): export cronToPreset(expr) — from parseCron output ONLY (same discipline as describeCron, no raw-string regex hacks). Returns 'daily'|'weekly'|'monthly'|'yearly' when describeCron's kind matches, else null (custom, steps like `*/15`, ranges, multi-value lists, malformed). For dropdown pre-select, extend describeCron's descriptor ADDITIVELY to emit singleton `dom`/`mon` values where the expression has them (monthly/yearly currently lack these per RESEARCH pitfall 6) — additive keys only, existing descriptor keys unchanged so Phase-92 deepEqual consumers stay valid; check test/backup-cron.test.mjs's existing describeCron deepEqual cases still pass byte-for-byte or extend them knowingly. In server.js backupTaskShape (~:8840): add `schedule.preset = cronToPreset(row.cron)` (import from export/cron.js alongside describeCron). NO route changes; `?all=1` and legacy `?taskId=` untouched (golden fixture byte-frozen). Now make Task 0's unit cases pass (GREEN): run the cronToPreset block. Extend negatives later in Task 5's static test are NOT needed here — cronToPreset must only live under export/ (never src/).</action>
  <verify>
    <automated>node --test test/backup-cron.test.mjs</automated>
  </verify>
  <done>cronToPreset exported in export/cron.js, all unit cases GREEN, existing describeCron deepEqual cases still pass, backupTaskShape carries schedule.preset; no src/ import of the new export.</done>
</task>

<task type="auto">
  <name>Task 2: Task table + last-run badge (D-01, BKUI-01) with ×5 i18n same-commit</name>
  <files>src/pages/backup.js, src/actions/actions.js, src/locales/en.json, src/locales/fr.json, src/locales/nl.json, src/locales/de.json, src/locales/es.json</files>
  <action>Replace `taskCard` panel (backup.js:217–254) with a real table (existing table/`row` idiom — governance table precedent; no new CSS): columns Task name / Scope / Schedule (humanized: `task.schedule` descriptor label — raw cron NEVER shown in the table per BKUI-01; the raw expression appears only inside the D-02 custom fallback) / Next run (`fmtDate(new Date(task.next_run_at))` — existing :226–227 pattern) / Last run (4-state badge per D-01 — MECHANISM (no server change, no payload change): `GET /api/backup/tasks` (server.js:8859–8875, `select * from backup_tasks`) carries NO run data, so at page load the page must make ONE explicit client-side fetch `api.backupRuns({ all: 1, limit: <small N, e.g. 50> })` (existing frozen route, GET /api/backup/runs ?all=1 — add no server field, do NOT invent a tasks-payload field, do not reuse the per-task history fetch), derive the latest run per `task_id` CLIENT-SIDE from that response (reduce over runs keyed by task_id keeping the newest), and render the badge from it: status===succeeded → green; running → neutral; failed → red; succeeded with `checksum_ok === 0` → yellow warning badge. After any manual "Run now" trigger, re-issue the same `?all=1&limit=N` fetch (and the unified-history refresh once Task 4 lands it) so the badge updates. The badge is client-only derivation over the frozen Phase-92 route) / Actions (existing data-a row: Run now / Edit / History / Enable / Delete, gated by flags.canBackup, unchanged ids). New i18n keys for column headers + warning badge label ADDED AND USED IN THIS COMMIT, ×5 locales (en/fr/nl/de/es) — i18n-scan prebuild gate fails dead keys (Phase 93 lesson). All interpolated strings through esc(). No retention/cron text composed client-side — use descriptor fields verbatim.</action>
  <verify>
    <automated>node --test test/backup-history-client.test.mjs && npm run build</automated>
  </verify>
  <done>Table replaces taskCard; badge derivation present; schedule rendered humanized (no raw esc(task.cron) in table cells); column-header + warning keys exist and are used in all 5 locale files; static test + i18n-scan green.</done>
</task>

<task type="auto">
  <name>Task 3: Edit pre-fill via schedule.preset + 4-scale retention (D-02, D-03; BKUI-02, BKUI-03)</name>
  <files>src/actions/actions.js, src/pages/backup.js, src/locales/en.json, src/locales/fr.json, src/locales/nl.json, src/locales/de.json, src/locales/es.json</files>
  <action>D-02: in A.backupTaskEdit (actions.js:5096–5127), stop hardcoding preset:'custom' — map `task.schedule.preset` into form.preset and pre-fill form.fields (minute/hour/weekday; dom/mon singletons from the descriptor's new fields) when preset matches daily/weekly/monthly/yearly; when preset is null → lock the builder to a readonly custom display of `esc(task.cron)` with an honest hint key (new ×5), preset select disabled. Header "Edit backup task" (existing taskEditTitle key — verify its wording matches D-02's copy; fix ×5 if not) rendered ABOVE the form block in backup.js. CRITICAL: pre-fill must NOT set cronDirty=true (preserve the :5110–5121 guard) — untouched schedule stays cronDirty=false so a name-only edit never rewrites the cron (RESEARCH pitfall 1). D-03: add `monthly`/`yearly` to BACKUP_TASK_FIELD_DEFAULTS.retention (actions.js:5016–5034), to the backupTaskEdit preload (task.retention_monthly / task.retention_yearly), and to the save body (:5162); render two new numeric inputs in backup.js labeled with existing gfsMonthly/gfsYearly keys (locked — NO new retention keys); the generic data-f staging handler (:5077–5082) already stages into S.ui.backupTaskForm.retention untouched. All four inputs always sent on save. New keys (custom hint etc.) added+used same commit ×5.</action>
  <verify>
    <automated>node --test test/backup-history-client.test.mjs test/backup-cron.test.mjs && npm run build</automated>
  </verify>
  <done>Edit pre-fills preset/fields from task.schedule.preset with cronDirty=false preserved, custom fallback readonly + hint, header above form; retention defaults/preload/save body carry monthly+yearly; 4 inputs render with gfs labels; build + tests green.</done>
</task>

<task type="auto">
  <name>Task 4: Unified run-history sblock (D-04, BKUI-04) with ×5 i18n same-commit</name>
  <files>src/pages/backup.js, src/actions/actions.js, src/core/api.js, src/locales/en.json, src/locales/fr.json, src/locales/nl.json, src/locales/de.json, src/locales/es.json</files>
  <action>Build one sblock "Run history" BELOW the task table (reuse historyTitle key). Staged filter state in S.ui (e.g. S.ui.backupHistoryFilter) — never the DOM. Three selects: (1) Task — options built from S.ui.backupTasks.tasks (task NAME as label, task ID as value) + a synthetic "manual" entry (value `manual` → server maps to task_id is null; names-not-ids: display name, request id, RESEARCH pitfall 4); (2) Trigger — manual|scheduled (triggerManual/Scheduled keys); (3) Status — enumerate ONLY the served enum `running, succeeded, failed, upload_failed, deleted` (interrupted/skipped_overlap are NOT accepted by the filter — omit them, RESEARCH pitfall 3). Naive limit/offset pagination: NO total count in the payload — implement next/prev by requesting limit+1 and graying "next" when a short page returns (or equivalent documented heuristic; do not guess). Rows: `run.label` (server-resolved 5-segment runLabel) rendered VERBATIM via esc() — never composed client-side; GFS badge from gfs_bucket-derived label (assumption A3: keptPosition is not on these rows); status via keyed label map; date via fmtDate. Hint "manual runs are not retained" (new ×5 key) visible only when task filter = manual. Fetch rides api.backupRuns({ all: 1, task, trigger, status, limit, offset }) — add/extend the client api helper additively if the `all` param isn't wired yet; the server route stays UNCHANGED. Retire historyCard: remove its render path and S.ui.backupHistoryOpen per-task storage; A.backupTaskHistory (actions.js:5247) now sets the task filter and scrolls to the sblock; fold backupHistoryFetch/refreshOpenBackupHistories (:5261–5282) into the sblock's fetch/refresh. New keys (filter labels, manual entry, hint, pagination labels) added+used SAME commit ×5.</action>
  <verify>
    <automated>node --test test/backup-history-client.test.mjs && npm run build</automated>
  </verify>
  <done>Unified sblock renders below the table with 3 selects, limit/offset probing pagination, verbatim run.label, manual hint conditional; historyCard and its per-task state removed; History action filters+scrolls; route untouched; build green.</done>
</task>

<task type="auto">
  <name>Task 5: Static-test extension + Restore-Op e2e pin (BKUI-04), full suite</name>
  <files>test/backup-history-client.test.mjs, test/backup-scopes.test.mjs, test/dst-cron-boundaries.test.mjs, e2e/backup-console-restore-op.spec.mjs</files>
  <action>(a) Extend test/backup-history-client.test.mjs (governance-tabs-client pattern: source fs-assertions + direct JSON imports of all 5 locales for parity): assert the task table exists (table-not-blocks), no raw `esc(task.cron)` in table schedule cells, 4-state badge derivation present, backupTaskEdit reads task.schedule.preset and does not set cronDirty=true during pre-fill, data-in="backupTaskCron" still absent (no free-text cron, T-87-11), retention monthly/yearly staged and sent, unified sblock renders run.label verbatim, historyCard absent; EXTEND the existing negatives: no parseCron/nextRunAt/cronToPreset under src/. (b) Check test/backup-scopes.test.mjs pins `label` on ?all=1 rows; extend only if the filter matrix (manual/trigger/status/limit+offset) lacks coverage — legacy ?taskId= golden path untouched. (c) SC-3 DST coverage: extend test/dst-cron-boundaries.test.mjs — assert that the humanized schedule labels shown in the UI stay in agreement with the scheduler across DST boundaries: for each cron fixture already crossing a DST transition in that file, the descriptor label (describeCron / cronToPreset) is derived from the SAME parseCron output the scheduler uses, so assert STRUCTURAL agreement (label source === scheduler source: describeCron/cronToPreset parse the identical expression the next-run computation consumes; a preset classified as daily/weekly/monthly/yearly has exactly one matching next_run_at per period across the DST boundary; custom/null presets never enter the preset dropdown path). No new server behavior — this pins that label and scheduler never diverge on parse input. Run the file. (d) Fill the Task-0 e2e scaffold: grant Restore-Op to a second account (instanceRoleGrant, role value verified in Task 0), log in as it, open Backup, drive the unified history, assert: instance-scope rows visible with task NAMES + run.label text asserted (never raw ids); workspace/project rows for scopes without membership are dropped (fail-closed, no error). Run `npm run e2e` scoped to this spec. (e) Full gate: npm test + npm run build. Pre-existing failures out of scope: webhook-events/webhook-routes, Phase-88 french-typography, export/backup.js:666 logo, scheduler-overlap flake.</action>
  <verify>
    <automated>node --test test/backup-history-client.test.mjs test/backup-scopes.test.mjs test/backup-cron.test.mjs test/dst-cron-boundaries.test.mjs && npm run build</automated>
  </verify>
  <done>Static assertions cover BKUI-01..04 + ×5 parity + src/-negative guards; scopes test pins label + filter matrix; DST boundary test asserts schedule-label/scheduler structural agreement (SC-3); Restore-Op e2e passes with fail-closed visibility; full npm test + build green (modulo documented pre-existing failures).</done>
</task>

</tasks>

<verification>
- `node --test test/backup-cron.test.mjs test/backup-history-client.test.mjs test/backup-tasks-api.test.mjs test/backup-scopes.test.mjs` green
- `npm run build` (i18n-scan prebuild gate) green — no dead keys, ×5 parity
- `npm test` green (documented pre-existing failures excluded)
- `npm run e2e -- backup-console-restore-op.spec.mjs` green
- grep gates: no `cronToPreset|parseCron|nextRunAt` under src/; no `data-in="backupTaskCron"`; legacy `?taskId=` golden fixture untouched
</verification>

<success_criteria>
All 5 ROADMAP SCs demonstrable: real table + humanized schedule + Next/Last run (D-01); pre-filled editor with header + custom fallback keeping the cronDirty guard (D-02); 4 retention scales with ×5 DST-locked gfs labels (D-03); unified fail-closed history sblock with Restore-Op e2e pin (D-04); names-not-ids + manual-not-retained hint. Only server delta is cronToPreset + additive schedule.preset/dom/mon on backupTaskShape.
</success_criteria>

<output>
Create `.planning/phases/94-backup-console-ux/94-SUMMARY.md` when done
</output>
