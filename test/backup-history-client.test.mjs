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

test('the task card renders payload fields through esc() — render-only, no client cron math', () => {
  assert.match(pagesSrc, /esc\(task\.name\)/);
  assert.match(pagesSrc, /esc\(task\.cron\)/, 'the stored cron renders as TEXT (payload verbatim)');
  assert.match(pagesSrc, /esc\(task\.tz\)/);
  assert.match(pagesSrc, /const taskCard = \(task, manage\) =>/, 'the task card exists');
  /* Pitfall 6 / no-second-parser: the page never evaluates cron client-side. */
  assert.ok(!/\bnextRunAt\b/.test(pagesSrc), 'no nextRunAt call under the page (client cron math forbidden)');
  assert.ok(!/\bparseCron\b/.test(pagesSrc), 'no parseCron call under the page');
});

test('A.backupTaskSave follows the handler discipline and refills through refreshBackupTasks', () => {
  assert.match(actionsSrc, /A\.backupTaskSave =/, 'the save handler exists');
  assert.match(actionsSrc, /A\.backupTaskNew =/, 'the new-task action exists');
  assert.match(actionsSrc, /A\.backupTaskCancel =/, 'the cancel action exists');
  const handler = actionsSrc.slice(actionsSrc.indexOf('A.backupTaskSave ='), actionsSrc.indexOf('A.backupTaskSave =') + 1600);
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
  assert.match(pagesSrc, /import \{ tzCombobox, tzPreselect \} from '\.\/settings\.js';/, 'backup.js imports the Phase 34 combobox');
  assert.match(pagesSrc, /tzCombobox\(form\.tz\)/, 'the form embeds the shared component');
  /* The selection stages into the form (backup context branch) — the member
     profile save path only runs when the backup form is NOT staged. */
  assert.match(actionsSrc, /if \(S\.ui\.backupTaskForm\) \{[\s\S]*?backupTaskForm\.tz = el\.dataset\.v/, 'IN.tzSel routes form-context selections into S.ui.backupTaskForm.tz');
  assert.match(actionsSrc, /import \{ tzPreselect \} from '\.\.\/pages\/settings\.js';/, 'actions.js resolves the tz default through the shared tzPreselect');
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

test('D-14: the history card renders the payload verbatim — newest-first and cap 50 are the server\'s', () => {
  assert.match(pagesSrc, /const historyCard = task =>/, 'the history card exists');
  assert.match(pagesSrc, /const runRow = run =>/, 'the run row renderer exists');
  assert.match(pagesSrc, /h\.runs\.map\(runRow\)\.join\(''\)/, 'runs render verbatim in server order — no client re-sort, no client cap');
  assert.ok(!/\.slice\(0, 50\)|\.sort\(/.test(pagesSrc.split('/* Per-task card')[0].split('RUN_STATUS_KEYS')[1] || ''), 'no client-side cap or sort in the history block');
  /* esc() on every interpolated payload field of the run row */
  for (const re of [/esc\(run\.sha256\)/, /esc\(String\(run\.sha256\)\.slice\(0, 12\)\)/, /esc\(run\.filename\)/, /esc\(run\.error\)/, /esc\(when\)/]) {
    assert.match(pagesSrc, re, `run row interpolates through esc(): ${re}`);
  }
  /* D-06: skipped_overlap and interrupted are first-class labeled states. */
  assert.match(pagesSrc, /skipped_overlap: 'page\.backup\.statusSkippedOverlap'/);
  assert.match(pagesSrc, /interrupted: 'page\.backup\.statusInterrupted'/);
  assert.match(actionsSrc, /A\.backupTaskHistory =/, 'the history toggle handler exists');
  assert.match(actionsSrc, /S\.ui\.backupHistory\[id\]|store\[id\] = \{ runs:/, 'the fetch result stages verbatim per task');
  assert.match(actionsSrc, /refreshOpenBackupHistories\(\);/, 'backupPollTick piggybacks the open-history refresh');
  assert.match(actionsSrc, /A\.backupRunErr =/, 'the expandable error toggle exists');
});

test('5-locale key parity for every 87-04 backup page key', () => {
  const required = [
    'page.backup.tasksTitle', 'page.backup.taskFormTitle', 'page.backup.taskEditTitle', 'page.backup.taskNameLabel',
    'page.backup.scheduleLabel', 'page.backup.tzLabel', 'page.backup.nextRunLabel', 'page.backup.retentionLabel',
    'page.backup.presetDaily', 'page.backup.presetWeekly', 'page.backup.presetMonthly', 'page.backup.presetCustom',
    'page.backup.fieldMinute', 'page.backup.fieldHour', 'page.backup.fieldDayOfMonth', 'page.backup.fieldMonth', 'page.backup.fieldDayOfWeek',
    'page.backup.taskSaveAction', 'page.backup.taskCancelAction', 'page.backup.taskSaved', 'page.backup.taskUpdated',
    'page.backup.taskEnabled', 'page.backup.taskDisabled', 'page.backup.taskEnable', 'page.backup.taskDisable',
    'page.backup.taskRunNow', 'page.backup.taskDelete', 'page.backup.taskDeleteBody', 'page.backup.taskDeleted',
    'page.backup.summaryDaily', 'page.backup.summaryWeekly', 'page.backup.summaryMonthly', 'page.backup.summaryCustom',
    'page.backup.scheduleSummaryPrefix',
    'page.backup.historyAction', 'page.backup.historyTitle', 'page.backup.historyCap', 'page.backup.historyEmpty',
    'page.backup.historyLoading', 'page.backup.historyUnavailable', 'page.backup.errorToggle',
    'page.backup.durLabel', 'page.backup.sizeLabel',
    'page.backup.statusRunning', 'page.backup.statusSucceeded', 'page.backup.statusFailed',
    'page.backup.statusInterrupted', 'page.backup.statusSkippedOverlap', 'page.backup.statusDeleted', 'page.backup.statusUnknown',
    'page.backup.triggerManual', 'page.backup.triggerScheduled', 'page.backup.triggerUnknown',
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
