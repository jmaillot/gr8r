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
  assert.match(pagesSrc, /const taskCard = task =>/, 'the task card exists');
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
