/* =====================================================================
   Backup page client wiring regression (Phase 87, plan 87-04, BKBCK-02/
   BKBCK-04) — the settings-tz-combobox source-assertion discipline.
   fs-reads the REAL sources and pins the 87-04 wiring structurally:

   - api client: the five task/history methods exist beside the keyed-error
     doc block (every route refusal flows call()'s central handling)
   - task card: payload fields render through esc(); render-only doctrine —
     no client-side cron evaluation (no nextRunAt/parseCron under src/)
   - actions: A.backupTaskSave (and the 43-03-style staged-state handlers)
     exist and the save path refills through refreshBackupTasks
   - D-01/T-87-11: NO free-text cron input exists in the page source —
     pinned from the tracer commit onward, before the builder grows
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(REPO, rel), 'utf8');
const apiSrc = read('src/core/api.js');
const pagesSrc = read('src/pages/backup.js');
const actionsSrc = read('src/actions/actions.js');

test('the api client exports the task CRUD + history methods with the keyed-error doc block', () => {
  for (const name of ['backupTaskCreate', 'backupTaskUpdate', 'backupTaskToggle', 'backupTaskDelete', 'backupRuns']) {
    assert.match(apiSrc, new RegExp(`async ${name}\\(`), `api.js must export ${name}`);
  }
  assert.match(apiSrc, /taskNameRequired \/\/\/|taskNameRequired \//, 'sanity: the doc block names the refusals');
  assert.match(apiSrc, /invalidSchedule[\s\S]*invalidTimezone[\s\S]*backupInvalidScope[\s\S]*invalidRetention/, 'the keyed-error doc block covers the 87-01 refusal vocabulary');
  assert.match(apiSrc, /encodeURIComponent\(taskId\)/, 'the history read carries taskId in the query string');
});

test('the task table renders payload fields through esc() — render-only, no client cron math', () => {
  assert.match(pagesSrc, /esc\(task\.name\)/);
  assert.match(pagesSrc, /const taskTable = \(tasks, manage\) =>/, 'the task table exists (table-not-blocks, Phase 94)');
  assert.match(pagesSrc, /esc\(task\.id\)/);
  /* Pitfall 6 / no-second-parser: the page never evaluates cron client-side. */
  assert.ok(!/\bnextRunAt\b/.test(pagesSrc), 'no nextRunAt call under the page (client cron math forbidden)');
  assert.ok(!/\bparseCron\b/.test(pagesSrc), 'no parseCron call under the page');
});

test('A.backupTaskSave follows the handler discipline and refills through refreshBackupTasks', () => {
  assert.match(actionsSrc, /A\.backupTaskSave =/, 'the save handler exists');
  assert.match(actionsSrc, /A\.backupTaskNew =/, 'the new-task action exists');
  assert.match(actionsSrc, /A\.backupTaskCancel =/, 'the cancel action exists');
  const handler = actionsSrc.slice(actionsSrc.indexOf('A.backupTaskSave ='), actionsSrc.indexOf('A.backupTaskSave =') + 4200);
  assert.ok(handler.includes('refreshBackupTasks'), 'the save path refills the task list (fill-loop reuse)');
  assert.ok(handler.includes('api.backupTaskCreate') && handler.includes('api.backupTaskUpdate'), 'create vs update both wired');
  assert.ok(handler.includes('tErr('), 'refusals surface as keyed toasts (tErr)');
  /* Staged-state discipline: the form lives in S.ui.backupTaskForm, never the DOM. */
  assert.match(actionsSrc, /S\.ui\.backupTaskForm/, 'the form stages in S.ui.backupTaskForm');
});

test('D-01: no free-text cron input exists in the page source (pinned from the tracer onward)', () => {
  assert.ok(!/data-in="backupTaskCron"/.test(pagesSrc), 'no free-text cron input element');
  assert.ok(!/data-in="cron"/.test(pagesSrc), 'no generic cron input element');
  assert.match(pagesSrc, /data-in="backupTaskPreset"/, 'the preset select exists');
  assert.match(pagesSrc, /data-f="\$\{name\}"/, 'the per-field selects share the data-f hook');
  for (const f of ['minute', 'hour', 'dom', 'mon', 'dow']) {
    assert.match(pagesSrc, new RegExp(`fieldSel\\(form, '${f}'`), `the ${f} per-field dropdown is wired through fieldSel`);
  }
});

test('D-03: the tz picker is the reused settings combobox — never a second picker', () => {
  assert.match(pagesSrc, /import \{ tzCombobox \} from '\.\/settings\.js';/, 'backup.js imports the Phase 34 combobox');
  assert.match(pagesSrc, /import \{ tzPreselect \} from '\.\.\/lib\/timezones\.js';/, 'backup.js resolves the default through the shared lib rule');
  assert.match(pagesSrc, /tzCombobox\(form\.tz\)/, 'the form embeds the shared component');
  /* The selection stages into the form (backup context branch) — the member
     profile save path only runs when the backup form is NOT staged. */
  assert.match(actionsSrc, /if \(S\.ui\.backupTaskForm\) \{[\s\S]*?backupTaskForm\.tz = el\.dataset\.v/, 'IN.tzSel routes form-context selections into S.ui.backupTaskForm.tz');
  assert.match(actionsSrc, /import \{ tzPreselect \} from '\.\.\/lib\/timezones\.js';/, 'actions.js resolves the tz default through the shared tzPreselect (leaf lib — no entry→settings edge)');
  /* The settings combobox takes the override parameter (backward compatible). */
  const settingsSrc = read('src/pages/settings.js');
  assert.match(settingsSrc, /export function tzCombobox\(storedOverride\)/, 'tzCombobox accepts the staged-form override');
});

test('toggle / delete / Run-now handlers exist and refill through the fill loop', () => {
  for (const name of ['backupTaskToggle', 'backupTaskDelete', 'backupTaskRunNow']) {
    assert.match(actionsSrc, new RegExp(`A\\.${name} =`), `A.${name} exists`);
  }
  assert.match(actionsSrc, /api\.backupTaskToggle\(/, 'toggle rides the partial-PUT api method');
  assert.match(actionsSrc, /api\.backupTaskDelete\(/, 'delete rides the DELETE api method');
  assert.match(actionsSrc, /api\.backupRun\(task\.scope\)/, 'per-task Run now reuses the existing Phase 86 run endpoint with the task scope');
  const toggleBody = actionsSrc.slice(actionsSrc.indexOf('A.backupTaskToggle ='));
  assert.ok(toggleBody.slice(0, 700).includes('refreshBackupTasks'), 'toggle refills via refreshBackupTasks (server owns next_run_at)');
});

test('D-04 (Phase 94): the unified history sblock renders the payload verbatim — newest-first, probe pagination, historyCard retired', () => {
  assert.match(pagesSrc, /const historyRow = run =>/, 'the unified run row renderer exists');
  assert.match(pagesSrc, /const historySblock = \(\) =>/, 'the unified sblock exists');
  assert.match(pagesSrc, /h\.runs\.map\(historyRow\)\.join\(''\)/, 'runs render verbatim in server order — no client re-sort, no client cap');
  /* D-04: run.label (the 5-segment server-resolved runLabel) renders VERBATIM
     through esc() — the client composes nothing. */
  assert.match(pagesSrc, /esc\(run\.label \|\| ''\)/, 'run.label renders verbatim through esc()');
  assert.match(pagesSrc, /GFS_SCALE_KEYS\[run\.gfs_bucket\]/, 'the GFS badge derives from gfs_bucket through the four gfs keys (A3)');
  /* esc() on every interpolated payload field of the run row */
  for (const re of [/esc\(run\.sha256\)/, /esc\(String\(run\.sha256\)\.slice\(0, 12\)\)/, /esc\(run\.filename\)/, /esc\(run\.error\)/, /esc\(when\)/]) {
    assert.match(pagesSrc, re, `run row interpolates through esc(): ${re}`);
  }
  /* D-06: skipped_overlap and interrupted stay first-class LABELS… */
  assert.match(pagesSrc, /skipped_overlap: 'page\.backup\.statusSkippedOverlap'/);
  assert.match(pagesSrc, /interrupted: 'page\.backup\.statusInterrupted'/);
  /* …but the STATUS FILTER enumerates ONLY the served enum (they are not
     accepted by the ?all=1 filter — RESEARCH pitfall 3). */
  assert.match(pagesSrc, /const HISTORY_FILTER_STATUSES = \['running', 'succeeded', 'failed', 'upload_failed', 'deleted'\]/);
  assert.match(pagesSrc, /'backupHistoryStatus'/, 'the status filter select exists');
  assert.ok(!pagesSrc.slice(pagesSrc.indexOf('const HISTORY_FILTER_STATUSES')).includes("'interrupted',"), 'interrupted is NOT a filter option');
  assert.ok(!pagesSrc.slice(pagesSrc.indexOf('const HISTORY_FILTER_STATUSES')).includes("'skipped_overlap',"), 'skipped_overlap is NOT a filter option');
  /* The per-task card is retired — no historyCard, no per-task open state. */
  assert.ok(!pagesSrc.includes('historyCard'), 'historyCard is retired');
  assert.ok(!pagesSrc.includes('backupHistoryOpen'), 'the per-task open state is retired');
  assert.ok(!actionsSrc.includes('backupHistoryOpen'), 'the per-task open state is retired (actions)');
  assert.match(actionsSrc, /A\.backupTaskHistory =/, 'the History action exists');
  assert.match(actionsSrc, /S\.ui\.backupHistoryFilter/, 'the filter stages in S.ui.backupHistoryFilter (never the DOM)');
  assert.match(actionsSrc, /S\.ui\.backupHistoryAll/, 'the fetch result stages in S.ui.backupHistoryAll');
  assert.match(actionsSrc, /refreshOpenBackupHistories\(\);/, 'backupPollTick piggybacks the open-history refresh');
  assert.match(actionsSrc, /A\.backupRunErr =/, 'the expandable error toggle exists');
  /* Pagination: limit+1 probe, never a total count. */
  assert.match(actionsSrc, /Number\(f\.limit\) \+ 1/, 'next probes limit+1');
  assert.match(actionsSrc, /hasMore: runs\.length > f\.limit/, 'a short page grays out next');
});

test('88-03: the client renders upload_failed + the uploading stage verbatim from the payload (render-only)', () => {
  /* T-88-09: upload_failed is a first-class labeled status, the uploading
     stage badge + parts progress ride the D-19 payload — the client derives
     nothing (no client stage math, no parts computation). */
  assert.match(pagesSrc, /upload_failed: 'page\.backup\.statusUploadFailed'/, 'upload_failed is a keyed first-class status');
  assert.match(pagesSrc, /run\.stage === 'uploading'/, 'the uploading stage branch exists in runProgress');
  assert.match(pagesSrc, /t\('page\.backup\.stageUploading'\)/, 'the uploading stage label is keyed');
  assert.match(pagesSrc, /t\('page\.backup\.partsProgress', \{ done: run\.partsDone, total: run\.partsTotal \}\)/, 'parts progress renders the payload fields verbatim');
  /* No client-side stage or parts derivation: the stage string and the
     counts come from the payload; nothing recomputes them. */
  assert.ok(!/partsDone\s*[+\-*]|partsDone\s*=\s*[^=]|Math\.ceil.*parts/i.test(pagesSrc), 'no client-side parts math');
  /* partsTotal may be null until the first part lands — no "0/null" render. */
  assert.match(pagesSrc, /Number\.isFinite\(Number\(run\.partsTotal\)\)/, 'null partsTotal renders nothing');
});

test('5-locale key parity for every 87-04 backup page key', () => {
  const required = [
    'page.backup.tasksTitle', 'page.backup.taskFormTitle', 'page.backup.taskEditTitle', 'page.backup.taskNameLabel',
    'page.backup.scheduleLabel', 'page.backup.tzLabel', 'page.backup.nextRunLabel',
    'page.backup.presetDaily', 'page.backup.presetWeekly', 'page.backup.presetMonthly', 'page.backup.presetCustom',
    'page.backup.fieldMinute', 'page.backup.fieldHour', 'page.backup.fieldDayOfMonth', 'page.backup.fieldMonth', 'page.backup.fieldDayOfWeek',
    'page.backup.taskSaveAction', 'page.backup.taskCancelAction', 'page.backup.taskSaved', 'page.backup.taskUpdated',
    'page.backup.taskEnabled', 'page.backup.taskDisabled', 'page.backup.taskEnable', 'page.backup.taskDisable',
    'page.backup.taskRunNow', 'page.backup.taskDelete', 'page.backup.taskDeleteBody', 'page.backup.taskDeleted',
    'page.backup.summaryDaily', 'page.backup.summaryWeekly', 'page.backup.summaryMonthly', 'page.backup.summaryCustom',
    'page.backup.scheduleSummaryPrefix',
    'page.backup.historyAction', 'page.backup.historyTitle', 'page.backup.historyCap', 'page.backup.historyEmpty',
    'page.backup.historyLoading', 'page.backup.historyUnavailable', 'page.backup.errorToggle',
    'page.backup.downloadAction',
    'page.backup.verifyChecksumAction', 'page.backup.checksumChecking', 'page.backup.checksumOk',
    'page.backup.checksumFail', 'page.backup.checksumLastCheck',
    'page.backup.statusRunning', 'page.backup.statusSucceeded', 'page.backup.statusFailed',
    'page.backup.statusInterrupted', 'page.backup.statusSkippedOverlap', 'page.backup.statusDeleted', 'page.backup.statusUnknown',
    'page.backup.triggerManual', 'page.backup.triggerScheduled', 'page.backup.triggerUnknown',
    'page.backup.summaryYearly', 'page.backup.colTask', 'page.backup.colScope', 'page.backup.colSchedule',
    'page.backup.colLastRun', 'page.backup.checksumWarn', 'page.backup.retentionLabel', 'page.backup.customScheduleHint',
    'page.backup.filterAll', 'page.backup.filterTrigger', 'page.backup.filterStatus', 'page.backup.historyManualEntry',
    'page.backup.historyManualHint', 'page.backup.historyPrev', 'page.backup.historyNext',
  ];
  for (const key of required) assert.ok(pagesSrc.includes(key) || actionsSrc.includes(key), `the combined source uses ${key}`);
  for (const loc of ['en', 'fr', 'es', 'de', 'nl']) {
    const cat = JSON.parse(read(`src/locales/${loc}.json`));
    for (const key of required) assert.ok(Object.hasOwn(cat, key), `${loc} is missing ${key}`);
  }
  /* The keyed refusal vocabulary the task routes can emit (87-01 catalogue). */
  const en = JSON.parse(read('src/locales/en.json'));
  for (const code of ['taskNameRequired', 'invalidSchedule', 'invalidTimezone', 'backupInvalidScope', 'invalidRetention', 'taskNotFound', 'backupManageRequired']) {
    assert.ok(Object.hasOwn(en, `err.${code}`), `err.${code} resolves in the refusal catalogue`);
  }
});

/* =====================================================================
   Phase 94 (Task 5a, BKUI-01..04): the full console pin block —
   table-not-blocks, humanized schedule only, 4-state badge, the D-02
   prefill keeping the cronDirty guard, the 4 retention scales, and the
   src/-negative guards (no cron logic at all under src/).
   ===================================================================== */
test('Phase 94 BKUI-01: real table, humanized schedule only, 4-state last-run badge', () => {
  const tableBody = pagesSrc.slice(pagesSrc.indexOf('const taskTable ='), pagesSrc.indexOf('/* Builder form'));
  assert.ok(tableBody.includes('<table class="perm-t"'), 'a real table renders (table-not-blocks)');
  assert.ok(!tableBody.includes('task.cron'), 'the raw cron NEVER renders in the table (BKUI-01)');
  assert.match(tableBody, /scheduleText\(task\)/, 'the schedule cell is the humanized descriptor text');
  assert.match(tableBody, /lastRunBadge\(task\)/, 'the Last-run column renders the badge');
  assert.match(pagesSrc, /const lastRunBadge = task =>/, 'the badge derivation exists');
  const badge = pagesSrc.slice(pagesSrc.indexOf('const lastRunBadge ='), pagesSrc.indexOf('/* Phase 94 (D-01, BKUI-01): the humanized'));
  assert.match(badge, /run\.status === 'succeeded'/, 'state 1: succeeded');
  assert.match(badge, /run\.status === 'running'/, 'state 2: running (neutral)');
  assert.match(badge, /run\.status === 'failed' \|\| run\.status === 'upload_failed'/, 'state 3: failed (red)');
  assert.match(badge, /Number\(run\.checksum_ok\) === 0|chk === 0/, 'state 4: succeeded + checksum_ok 0 → amber warning');
  assert.match(badge, /checksumWarn/, 'the warning badge is keyed');
  /* The badge input: ONE page-load fetch of the frozen route, latest per
     task_id derived client-side (created_at desc server sort). */
  assert.match(actionsSrc, /api\.backupRuns\(\{ all: 1, limit: 50 \}\)/, 'the badge fetch rides the frozen ?all=1 route');
  assert.match(actionsSrc, /for \(const r of runs\) if \(r\?\.task_id && !latest\[r\.task_id\]\) latest\[r\.task_id\] = r;/, 'latest-run-per-task derived client-side from the created_at-desc order');
});

test('Phase 94 BKUI-02/03: prefill reads task.schedule.preset with the cronDirty guard intact; 4 retention scales staged + sent', () => {
  const edit = actionsSrc.slice(actionsSrc.indexOf('A.backupTaskEdit ='), actionsSrc.indexOf('A.backupTaskCancel ='));
  /* D-02: the prefill maps the SERVER preset (the client never evaluates cron). */
  assert.match(edit, /sp\.preset === 'daily' \|\| sp\.preset === 'weekly' \|\| sp\.preset === 'monthly' \|\| sp\.preset === 'yearly'/, 'the prefill reverse-maps task.schedule.preset');
  assert.match(edit, /cronLocked: !matched/, 'a null preset locks the builder to the readonly custom fallback');
  /* CRITICAL: the prefill NEVER sets cronDirty — a name-only edit cannot
     rewrite the cron (RESEARCH pitfall 1). */
  assert.ok(!/cronDirty: true/.test(edit), 'prefill does not set cronDirty=true');
  assert.match(edit, /cronDirty: false/, 'the untouched-schedule guard stays false');
  /* D-02: the raw expression renders ONLY in the readonly custom fallback. */
  const cronEscs = [...pagesSrc.matchAll(/esc\((form\.customCron|task\.cron)/g)].map(m => m[1]);
  assert.ok(cronEscs.length >= 1, 'the custom fallback renders the raw expression');
  assert.ok(cronEscs.every(v => v === 'form.customCron'), 'esc(task.cron) appears NOWHERE — only the staged customCron fallback');
  assert.match(pagesSrc, /customScheduleHint/, 'the honest custom hint is rendered');
  /* Header above the form block (D-02). */
  assert.match(pagesSrc, /form\.editing \? 'page\.backup\.taskEditTitle' : 'page\.backup\.taskFormTitle'/, 'the Edit header sits above the form');
  /* D-03: four retention scales — defaults, preload, save body, inputs, gfs labels. */
  assert.match(actionsSrc, /retention: \{ daily: 7, weekly: 4, monthly: 12, yearly: 5 \}/, 'form defaults carry all four scales');
  assert.match(actionsSrc, /retention_monthly \?\? 12/, 'edit preloads monthly');
  assert.match(actionsSrc, /retention_yearly \?\? 5/, 'edit preloads yearly');
  assert.match(actionsSrc, /body\.retention = \{ daily: form\.retention\.daily, weekly: form\.retention\.weekly, monthly: form\.retention\.monthly, yearly: form\.retention\.yearly \}/, 'all four ALWAYS sent on save');
  for (const f of ['daily', 'weekly', 'monthly', 'yearly']) assert.match(pagesSrc, new RegExp(`data-f="${f}"`), `the ${f} retention input is wired`);
  for (const k of ['gfsDaily', 'gfsWeekly', 'gfsMonthly', 'gfsYearly']) assert.ok(pagesSrc.includes(`page.backup.${k}`), `the ${f2name(k)} label uses the existing gfs key`);
  function f2name(k) { return k.replace('gfs', 'gfs '); }
});

test('Phase 94 negatives: NO cron logic of any kind under src/ (T-87-11 extended)', () => {
  const code = s => s.replace(/\/\*[\s\S]*?\*\//g, ''); // doctrine comments may NAME the server functions; the CODE must not use them
  for (const src of [pagesSrc, actionsSrc, apiSrc]) {
    assert.ok(!/\bparseCron\b/.test(code(src)), 'no parseCron under src/');
    assert.ok(!/\bnextRunAt\b/.test(code(src)), 'no nextRunAt under src/');
    assert.ok(!/\bcronToPreset\b/.test(code(src)), 'no cronToPreset under src/ — the reverse-map is server-side (D-02)');
  }
  assert.ok(!/data-in="backupTaskCron"/.test(pagesSrc), 'no free-text cron input (T-87-11)');
});

/* =====================================================================
    Phase 88 post-merge gate fix: probe-at-save client wiring (SC-1,
   D-88-12/15/17). The S3 toggle is RENDER-ONLY (config flag ground
   truth), stages into S.ui.backupTaskForm, rides the save body, and a
   response carrying s3Probe toasts the keyed outcome.
   ===================================================================== */
test('Phase 88 SC-1 wiring: the S3 checkbox renders only with the config flag, stages like every field, and rides the save body', () => {
  /* Render-only doctrine: the toggle markup is behind the server's config
     boolean (api.s3Enabled), never an unconditional render. */
  assert.match(pagesSrc, /api\.s3Enabled \? `<div class="row"[\s\S]*?data-in="backupTaskS3"/, 'the checkbox renders ONLY when /api/config says s3Enabled (render-only)');
  assert.match(pagesSrc, /page\.backup\.s3Toggle/, 'the toggle label resolves from the catalogue');
  assert.ok(pagesSrc.includes('esc(t(\'page.backup.s3Toggle\'))'), 'the rendered label goes through esc()');

  /* Staged-state discipline: the checkbox is the state, like the retention
     inputs — no re-render on toggle. */
  assert.match(actionsSrc, /IN\.backupTaskS3 = el => \{[\s\S]*?backupTaskForm\.s3Enabled = el\.checked/, 'the checkbox stages into S.ui.backupTaskForm');
  assert.match(actionsSrc, /s3Enabled: task\.s3_enabled === 1/, 'edit mode presets the stored opt-in');
  assert.match(actionsSrc, /s3Enabled: false,/, 'create mode defaults to unchecked (fail-closed)');

  /* The save always serializes the DISPLAYED state (on AND off) when the
     destination exists — an absent flag would silently keep a stored value. */
  const handler = actionsSrc.slice(actionsSrc.indexOf('A.backupTaskSave ='), actionsSrc.indexOf('A.backupTaskSave =') + 4000);
  assert.ok(handler.includes('if (api.s3Enabled) body.s3Enabled = form.s3Enabled === true;'), 'the save serializes the flag whenever the server exposes the destination');

  /* The config flag rides api.js state from /api/config (server ground truth). */
  assert.match(apiSrc, /state\.s3Enabled = !!r\.data\?\.s3Enabled/, 'init() reads the strict boolean from /api/config');
  assert.match(apiSrc, /get s3Enabled\(\)/, 'the getter exposes the flag to the page');
});

test('Phase 88 SC-1 wiring: a successful save carrying s3Probe toasts the keyed outcome', () => {
  const handler = actionsSrc.slice(actionsSrc.indexOf('A.backupTaskSave ='), actionsSrc.indexOf('A.backupTaskSave =') + 4000);
  /* Mapping contract (D-88-15/17): success is neutral, deleteFailed is the
     warned-but-accepted path, badCreds/unreachable are errors, s3ClockSkew
     rides the keyed refusal catalogue with the unreachable fallback. */
  assert.ok(handler.includes("probe.key === 'success'") && handler.includes("t('toast.s3ProbeSuccess')"), 'success → toast.s3ProbeSuccess');
  assert.ok(handler.includes("probe.key === 'deleteFailed'") && handler.includes("t('toast.s3ProbeDeleteFailed')"), 'deleteFailed → toast.s3ProbeDeleteFailed (warning, not error)');
  assert.ok(handler.includes("probe.key === 'badCreds'") && handler.includes("t('toast.s3ProbeBadCreds')"), 'badCreds → toast.s3ProbeBadCreds');
  assert.ok(handler.includes("probe.key === 'unreachable'") && handler.includes("t('toast.s3ProbeUnreachable')"), 'unreachable → toast.s3ProbeUnreachable');
  assert.ok(handler.includes("probe.key === 's3ClockSkew'") && handler.includes("tErr('s3ClockSkew', null, t('toast.s3ProbeUnreachable'))"), 's3ClockSkew → keyed catalogue with the unreachable fallback (D-88-17)');
  assert.ok(handler.includes('probe.httpWarning') && handler.includes("t('toast.s3ProbeHttpWarning')"), 'a plain-http endpoint adds the http warning toast (D-88-14)');
  /* The probe toasts ride a 200 — a refusal still goes through the central
     tErr funnel, never through the probe mapping. */
  assert.ok(handler.indexOf('res.data?.s3Probe') > handler.indexOf('!res.ok'), 'the probe mapping reads only successful saves');
});

/* =====================================================================
   Phase 90 (90-02, SC-2 / D-90-9): the history rows grow the server-derived
   location badge + the payload-gated download CTA — the client renders the
   payload verbatim and never derives location or authority itself (D-89-21
   payload-flag chrome, D-23 doctrine).
   ===================================================================== */
test('90-02: the download CTA renders ONLY for payload location local|s3 — the location badge rides the payload', () => {
  /* The CTA is payload-flag chrome: a missing run renders ZERO download CTAs,
     never a disabled/dead button (D-90-9). */
  assert.match(
    pagesSrc,
    /run\.location === 'local' \|\| run\.location === 's3' \? `<button class="btn btn-secondary btn-sm" data-a="backupDownload" data-id="\$\{esc\(run\.id\)\}"/,
    'the download CTA renders only for local|s3 from the payload flag',
  );
  /* The badge reuses the restore location vocabulary (locLocal/locS3/
     locMissing) — neutral badge, accent only for s3, never green/red. */
  assert.match(pagesSrc, /RESTORE_LOCATION_KEYS\[run\.location\] \|\| 'page\.restore\.locMissing'/, 'the badge reuses the restore location keys');
  assert.match(pagesSrc, /class="badge\$\{run\.location === 's3' \? ' accent' : ''\}"/, 'the badge is neutral with the s3 accent');
  /* One download path (54-02): Blob + the server's Content-Disposition →
     saveBlob — success never calls res.text(). */
  assert.match(actionsSrc, /A\.backupDownload =/, 'the download action exists');
  assert.match(actionsSrc, /backupDownloadAdminOnly: 'err\.backupDownloadAdminOnly'/, 'the closed refusal map grew 1:1 with the new code');
  assert.match(actionsSrc, /filenameFrom\(res\.headers\.get\('Content-Disposition'\)\)/, 'the filename derives from the server header');
  assert.match(actionsSrc, /saveBlob\(await res\.blob\(\)/, 'the bytes ride saveBlob');
  assert.match(actionsSrc, /credentials: 'same-origin'/, 'the GET rides the same-origin session cookies');
});

test('90-02 task 3: the verify CTA renders only for non-missing runs — busy swap + durable keyed badge, never a toast on the result', () => {
  /* The CTA shares the download's payload-flag condition: the bytes exist
     (local | s3) — a missing run renders NO verify CTA either. */
  assert.match(pagesSrc, /data-a="backupVerifyChecksum"/, 'the verify CTA exists');
  const runRowBody = pagesSrc.slice(pagesSrc.indexOf('const historyRow ='), pagesSrc.indexOf('const historySblock ='));
  /* In-flight: the label swaps to the keyed checking copy, the button
     disables and the row flags aria-busy — never a fabricated result during
     an S3 stream-back (D-90-11). */
  assert.match(runRowBody, /chkBusy \? ' disabled aria-busy="true"'/, 'the busy CTA is disabled + aria-busy');
  assert.match(runRowBody, /chkBusy \? t\('page\.backup\.checksumChecking'\) : /, 'the busy label swaps to the keyed checking copy');
  assert.match(runRowBody, /aria-busy="true"/, 'the row carries aria-busy while checking');
  /* The result is the DURABLE keyed badge + the server timestamp line —
     rendered from the persisted payload (checksum_ok / checksum_checked_at). */
  assert.match(runRowBody, /chk === 1 \? `<span class="badge green">/, 'the match badge is keyed green');
  assert.match(runRowBody, /chk === 0 \? `<span class="badge red">/, 'the mismatch badge is keyed red');
  assert.match(runRowBody, /t\('page\.backup\.checksumLastCheck', \{ time: /, 'the server timestamp renders in the keyed last-check line');
  /* The action: POST via the api method, refusals through the closed map,
     the persisted result re-renders through the 87-04 open-history refresh
     (payload-derived — the client stores no verify result) — and NO toast
     call sits on the result path (restoreToast is refusal-only, D-90-11). */
  const actionHead = actionsSrc.slice(actionsSrc.indexOf('A.backupVerifyChecksum ='), actionsSrc.indexOf('};', actionsSrc.indexOf('A.backupVerifyChecksum =')));
  assert.ok(actionHead.includes('api.backupVerifyChecksum(id)'), 'the action rides the api verify method');
  assert.ok(actionHead.includes('toast(restoreToast('), 'refusals surface through the closed map — restoreToast wrapped in toast() (the click delegation discards handler return values)');
  assert.ok(actionHead.includes('refreshOpenBackupHistories()'), 'the result re-renders through the open-history refresh');
  /* The RESULT path (success) carries no toast — the durable keyed badge is
     the feedback; the toast call belongs to the refusal branch only. */
  const afterRefresh = actionHead.slice(actionHead.indexOf('refreshOpenBackupHistories()'));
  assert.ok(!afterRefresh.includes('toast('), 'no toast on the success path — the durable badge is the feedback');
  assert.match(apiSrc, /async backupVerifyChecksum\(runId/, 'api.js exports the verify method');
});

/* =====================================================================
   Phase 90 (90-03 task 1, SC-3 / D-90-16 refined): the kept-position
   badge — payload-flag chrome rendering the server-computed bucket
   position verbatim. The client holds ZERO GFS math: no date
   arithmetic, no bucket assignment, no counting under src/ (D-90-12/16
   — the position comes from gfsKeptPositions per request, and {scale}
   resolves only through the four gfs label keys).
   ===================================================================== */
/* =====================================================================
   Phase 90 (90-03 task 1, SC-3) — REWRITTEN for Phase 94 (D-04): the
   per-task history card is retired, and ?all=1 rows carry NO keptPosition
   (assumption A3 — the run label embeds the GFS segment instead). The
   unified row derives its GFS badge from run.gfs_bucket through the four
   gfs keys; the client still holds ZERO GFS math (no date arithmetic, no
   bucket assignment, no counting, no client-side keptPosition
   composition under src/).
   ===================================================================== */
test('90-03 → 94: the unified GFS badge derives from run.gfs_bucket through the four gfs keys — zero client GFS math', () => {
  const rowBody = pagesSrc.slice(pagesSrc.indexOf('const historyRow ='), pagesSrc.indexOf('const historySblock ='));
  assert.match(rowBody, /const gfsKey = GFS_SCALE_KEYS\[run\.gfs_bucket\]/, 'the badge resolves gfs_bucket through the four gfs keys');
  assert.match(rowBody, /gfsKey \? `<span class="badge"><span class="mono">\$\{t\(gfsKey\)\}<\/span><\/span>` : ''/, 'the badge renders only when gfs_bucket names a known scale');
  /* {scale} vocabulary is the FOUR gfs keys — no other scale vocabulary. */
  assert.match(pagesSrc, /const GFS_SCALE_KEYS = \{ daily: 'page\.backup\.gfsDaily', weekly: 'page\.backup\.gfsWeekly', monthly: 'page\.backup\.gfsMonthly', yearly: 'page\.backup\.gfsYearly' \}/, 'the four GFS scale keys are the one scale vocabulary');
  /* Zero client GFS math (T-90-06): no retention arithmetic under src/ and
     NO client-side keptPosition composition (the unified payload carries
     none — A3). */
  assert.ok(!/\.keptPosition|kept ? \?/.test(pagesSrc), 'no keptPosition handling under src/ — the unified rows carry none');
  assert.ok(!/retention_daily|retention_weekly|retention_monthly|retention_yearly/.test(rowBody), 'the run/history renderer never reads retention counts — the client computes nothing');
});

/* =====================================================================
   Phase 90 (90-03 task 3): two polish pins.
   (D-90-23) the ⚠ missing-blob warning badge — payload-count chrome:
   renders ONLY when the payload's missing_blob_count > 0, red badge +
   triangle-alert glyph + the missingBlobWarn interpolation verbatim.
   (D-90-22) the restore-list invalidation lives INSIDE the existing
   backupPollTick as a stage-transition compare — the tick NULLS the shared
   S.ui.restoreList when the polled run crosses active→terminal; the page's
   in-render kick refetches exactly once. The tick never calls the restore
   refresh action directly and never refetches unconditionally.
   ===================================================================== */
test('90-03: the ⚠ missing-blob badge is payload-count chrome (count > 0 only, triangle-alert, red)', () => {
  const runRowBody = pagesSrc.slice(pagesSrc.indexOf('const historyRow ='), pagesSrc.indexOf('const historySblock ='));
  assert.match(
    runRowBody,
    /Number\(run\.missing_blob_count\) > 0 \? `<span class="badge red">\$\{ic\('triangle-alert', 12\)\}\$\{t\('page\.backup\.missingBlobWarn', \{ n: Number\(run\.missing_blob_count\) \}\)\}<\/span>` : ''/,
    'the badge renders only on count > 0, red badge class + triangle-alert glyph + the missingBlobWarn interpolation verbatim',
  );
});

test('90-03: backupPollTick invalidates the shared restore list on the backup active→terminal stage transition (D-90-22)', () => {
  /* Region-scoped to the tick function body — assertions must not leak to
     the restore tick half or the polling helpers. */
  const tick = pagesSrc === '' ? '' : actionsSrc.slice(
    actionsSrc.indexOf('export async function backupPollTick'),
    actionsSrc.indexOf('refreshOpenBackupHistories()', actionsSrc.indexOf('export async function backupPollTick')),
  );
  assert.match(tick, /const backupPrevStage = S\.ui\.backupRun\?\.stage \|\| null/, 'the previous stage is captured BEFORE the payload write');
  assert.match(tick, /const backupPrevRunId = S\.ui\.backupRun\?\.startedAt \|\| null/, 'the run identity is captured BEFORE the payload write (UAT-90: identity change, not stage change, is the invalidation signal)');
  assert.match(tick, /BACKUP_ACTIVE_STAGES\.includes\(backupPrevStage\) \|\| backupFinishedArrived\) && !backupActive\) S\.ui\.restoreList = null/, 'the active→terminal transition nulls the shared restore-list state');
  assert.match(tick, /const backupFinishedArrived = !backupActive && !!backupNowRunId && backupNowRunId !== backupPrevRunId/, 'a DIFFERENT finished run landing (trigger-POST-terminal first poll, terminal→terminal run N+1) is the same invalidation event; a settled run repeating its identity never re-invalidates');
  assert.ok(!tick.includes('refreshRestoreBackups'), 'the tick NEVER calls the restore refresh action directly (Pitfall 8 — invalidate here, refetch at the render boundary)');
  /* The render boundary: the page's in-render kick refetches exactly once
     when the shared state is null. */
  assert.match(pagesSrc, /!S\.ui\.restoreList\) refreshRestoreBackups\(\)/, 'the in-render kick refetches the restore list exactly once when null');
});
