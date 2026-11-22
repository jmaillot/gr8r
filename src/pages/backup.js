/* =====================================================================
   BACKUP (85-02, D-20/D-21/D-22/D-26/D-27 · 86-02, D-07/D-09/D-10 ·
   87-04, D-01/D-03/D-04/D-14)
   The gated top-level Backup surface: ONE shared page for Backup
   Operators, Restore Operators and Super Admins (D-22 — role
   differences surface as gated actions inside, never as two nav
   entries). 86-02 adds the Run now card (scope picker) + live stage
   progress driven ONLY by the /api/backup/runs/current payload (D-09) —
   no download action exists in v1 (Phase 90 owns the download tier).
   87-04 adds the operator's task console: the builder-based schedule
   form (4 presets Daily/Weekly/Monthly + Custom per-field dropdowns —
   NEVER free-text cron input, D-01), per-task tz, enable/disable, Run
   now per task, and the per-task run history card (D-14).
   =====================================================================
   The page renders ONLY from the GET /api/backup/tasks response, its
   capability flags, the GET /api/backup/runs/current payload and the
   GET /api/backup/runs?taskId= history payload (D-23/T-85-06 doctrine:
   payload flags are verbatim chrome decisions — the client never derives
   roles, and the run stage is rendered verbatim, never derived
   client-side). One fill loop lives in actions.js
   (refreshBackupTasks); the run poll loop (backupPollTick) runs only
   while a run is active (D-07). A non-holder deep-linking the route
   gets the server's keyed 403 surfaced as a fullstate with the role
   refusal (D-26: err.backupRoleRequired — a ROLE gate, not
   err.operatorOnly) — never a blank page, never a client-side guess.
   All payload strings render through esc() — text nodes only, no raw
   interpolation (T-79-10). The builder NEVER evaluates cron client-side:
   it serializes preset+field dropdown selections into the raw 5-field
   string (D-04) and shows only a human-readable summary — no timestamp
   preview, no second cron parser (Pitfall 6). */
import { ic } from '../core/icons.js';
import { api } from '../core/api.js';
import { S } from '../core/store.js';
import { t, getLocale } from '../core/i18n.js';
import { esc, fmtDate } from '../core/utils.js';
import { empty, fsize } from '../ui/helpers.js';
import { tzCombobox } from './settings.js';
import { tzPreselect } from '../lib/timezones.js';
import { refreshBackupTasks, backupPollTick, backupPollKickAllowed } from '../actions/actions.js';

/* Verbatim governance.js fullstate shapes: 403 → lock glyph + err.code403 +
   route name + keyed ROLE body + home way out; other fetch errors →
   cloud-alert + retry (explicit, never auto re-kicked while the error state
   is set — CR-01). */
const full403 = () =>
  `<div class="fullstate"><div class="box"><div class="empty-state" style="padding:0"><div class="glyph">${ic('lock', 20)}</div></div><span class="code">${t('err.code403')}</span><h1>${t('nav.route.backup')}</h1><p>${t('err.backupRoleRequired')}</p><div class="row"><button class="btn btn-primary" data-a="go" data-r="home">${t('nav.goHome')}</button></div></div></div>`;
const fullErr = () =>
  `<div class="fullstate"><div class="box"><div class="empty-state err" style="padding:0"><div class="glyph">${ic('cloud-alert', 20)}</div></div><h1>${t('page.somethingWrong')}</h1><p>${t('page.loadFailedBody')}</p><div class="row"><button class="btn btn-primary" data-a="backupRetry">${ic('refresh-cw', 14)}${t('page.tryAgain')}</button></div></div></div>`;

/* D-09 Run now card: scope picker over payload-driven data only — the
   project list is the current doc's projects, the workspace the loaded
   api.workspace. Selection lives in S.ui.backupScope (staged state, never
   the DOM); the server re-validates everything and is the sole authority. */
const runNowCard = flags => {
  const scope = S.ui.backupScope || { kind: 'instance', id: null };
  const opt = (value, label) => `<option value="${value}"${scope.kind === value ? ' selected' : ''}>${t(label)}</option>`;
  const projects = Array.isArray(S.data?.projects) ? S.data.projects : [];
  const projectSel =
    scope.kind === 'project'
      ? `<div class="field"><label class="label">${t('page.backup.projectLabel')}</label><select class="input" data-in="backupScopeId"><option value="">—</option>${projects.map(p => `<option value="${esc(p.id)}"${p.id === scope.id ? ' selected' : ''}>${esc(p.name || p.id)}</option>`).join('')}</select></div>`
      : '';
  const workspaceBadge =
    scope.kind === 'workspace'
      ? (api.workspace?.id
          ? `<div class="field"><label class="label">${t('page.backup.workspaceLabel')}</label><select class="input" data-in="backupScopeId"><option value="${esc(api.workspace.id)}" selected>${esc(api.workspace.name || api.workspace.id)}</option></select></div>`
          : `<span class="badge">—</span>`)
      : '';
  return `<div class="panel" style="margin-top:12px"><div class="panel-b">
    <h2 style="margin:0 0 4px">${t('page.backup.runNowTitle')}</h2>
    <p class="faint" style="margin:0 0 10px">${t('page.backup.runNowLead')}</p>
    <div class="row" style="gap:8px;align-items:flex-end;flex-wrap:wrap">
      <div class="field"><label class="label">${t('page.backup.scopeLabel')}</label><select class="input" data-in="backupScopeKind">${opt('instance', 'page.backup.scopeInstance')}${opt('workspace', 'page.backup.scopeWorkspace')}${opt('project', 'page.backup.scopeProject')}</select></div>
      ${workspaceBadge}${projectSel}
      <button class="btn btn-primary" data-a="backupRunNow">${ic('hard-drive', 14)}${t('page.backup.runAction')}</button>
    </div>
  </div></div>`;
};

/* D-07 stage progress: rendered verbatim from the run payload — stage badge,
   and on done the archive filename + whole-archive sha256 as text (no download
   action — Phase 90). The pending flag means "trigger accepted, first poll has
   not landed yet": no stage is fabricated client-side (render-only doctrine). */
const runProgress = () => {
  if (S.ui.backupPending && !S.ui.backupRun)
    return `<div class="panel" style="margin-top:12px"><div class="panel-h"><h2>${t('page.backup.stageLabel')}</h2></div><div class="panel-b faint" aria-busy="true">${t('page.backup.pending')}</div></div>`;
  const run = S.ui.backupRun;
  if (!run || run.stage === 'idle') return '';
  let detail = '';
  if (run.stage === 'done') {
    detail = `<div class="row" style="gap:8px;flex-wrap:wrap"><span class="faint">${t('page.backup.archiveLabel')}</span><span class="mono">${esc(run.filename || '')}</span><span class="faint mono trunc" style="display:inline-block;max-width:360px" title="${esc(run.sha256 || '')}">${esc(run.sha256 || '')}</span></div>`;
  } else if (run.stage === 'failed') {
    detail = `<p class="faint" style="margin:0">${t('page.backup.runFailed')}</p>`;
  }
  /* UAT spacing feedback 2026-11-22: proper panel header ("Run progress" as an
     h2 in panel-h, stage badge beside it) instead of the badge+label row mashed
     at the top of the body. */
  return `<div class="panel" style="margin-top:12px"><div class="panel-h"><h2>${t('page.backup.stageLabel')}</h2><span class="badge">${esc(run.stage)}</span></div><div class="panel-b">${detail}</div></div>`;
};

/* =====================================================================
   87-04 TASK CONSOLE (D-01/D-03/D-04/D-14, BKBCK-02/BKBCK-04) — the
   operator's task list, builder form and per-task history card.
   =====================================================================
   Render-only over the GET /api/backup/tasks + GET /api/backup/runs?taskId=
   payloads: every payload field renders through esc(); capability flags are
   verbatim chrome (never recomputed). The builder serializes preset+field
   dropdown selections into the raw 5-field cron string (D-04) — there is NO
   free-text cron input anywhere in the page (D-01, T-87-11) and NO client
   cron evaluation: the schedule summary is human-readable TEXT derived
   from the selections, never a computed timestamp preview (Pitfall 6). */

/* =====================================================================
   87-04 PER-TASK RUN HISTORY CARD (D-14/D-06) — renders the GET
   /api/backup/runs?taskId= payload VERBATIM: newest-first is the server's
   ordering, the 50-run cap is the server's LIMIT — the client derives
   nothing and paginates nothing. Every payload field goes through esc();
   statuses and triggers are keyed labels (skipped_overlap and interrupted
   are first-class states — never silently hidden, D-06).
   ===================================================================== */
const RUN_STATUS_KEYS = {
  running: 'page.backup.statusRunning',
  succeeded: 'page.backup.statusSucceeded',
  failed: 'page.backup.statusFailed',
  interrupted: 'page.backup.statusInterrupted',
  skipped_overlap: 'page.backup.statusSkippedOverlap',
  deleted: 'page.backup.statusDeleted',
};
const RUN_TRIGGER_KEYS = { manual: 'page.backup.triggerManual', scheduled: 'page.backup.triggerScheduled' };
const durText = ms => (Number.isFinite(ms) && ms >= 0 ? `${(ms / 1000).toFixed(1)} s` : '—');

const runRow = run => {
  const errOpen = S.ui.backupRunErrOpen?.has(run.id);
  const startedMs = Number(run.started_at);
  const when = Number.isFinite(startedMs) && startedMs > 0 ? fmtDate(new Date(startedMs).toISOString()) : '—';
  return `<div style="padding:8px 0;border-top:1px solid var(--border)">
    <div class="row" style="gap:8px;flex-wrap:wrap;font-size:13px;align-items:center">
      <span class="badge ${run.status === 'succeeded' ? 'green' : ''}">${t(RUN_STATUS_KEYS[run.status] || 'page.backup.statusUnknown')}</span>
      <span class="faint">${t(RUN_TRIGGER_KEYS[run.trigger] || 'page.backup.triggerUnknown')}</span>
      <span class="faint">${esc(when)}</span>
      <span class="faint">${t('page.backup.durLabel')}: ${esc(durText(Number(run.duration_ms)))}</span>
      <span class="faint">${t('page.backup.sizeLabel')}: ${esc(fsize(Number(run.size_bytes) || 0))}</span>
      ${run.sha256 ? `<span class="mono faint" title="${esc(run.sha256)}">${esc(String(run.sha256).slice(0, 12))}</span>` : ''}
      ${run.filename ? `<span class="mono faint">${esc(run.filename)}</span>` : ''}
    </div>
    ${
      run.error
        ? `<div style="margin-top:4px"><a href="#" data-a="backupRunErr" data-id="${esc(run.id)}">${t('page.backup.errorToggle')}</a>${
            errOpen ? `<div class="mono" style="margin-top:4px;font-size:12px;white-space:pre-wrap">${esc(run.error)}</div>` : ''
          }</div>`
        : ''
    }
  </div>`;
};

const historyCard = task => {
  const h = S.ui.backupHistory?.[task.id];
  const body = !h
    ? `<div class="faint" style="padding:8px 0">${t('page.backup.historyLoading')}</div>`
    : h.err
      ? `<div class="faint" style="padding:8px 0">${t('page.backup.historyUnavailable')}</div>`
      : !h.runs.length
        ? `<div class="faint" style="padding:8px 0">${t('page.backup.historyEmpty')}</div>`
        : h.runs.map(runRow).join('');
  return `<div style="margin-top:10px">
    <div class="row" style="gap:8px;align-items:center">
      <strong style="font-size:13px">${t('page.backup.historyTitle')}</strong>
      <span class="faint" style="font-size:12px">${t('page.backup.historyCap')}</span>
    </div>
    ${body}
  </div>`;
};

/* Per-task card: the payload row verbatim (name, scope, enabled, schedule,
   tz, retention, next_run_at) — esc() on every interpolated payload field.
   Operator actions (toggle / delete / Run now) render only when the payload's
   canBackup flag is true — verbatim chrome, never recomputed client-side. */
const taskCard = (task, manage) => {
  const scope = task.scope && typeof task.scope === 'object' ? task.scope : {};
  const scopeLabel = scope.kind === 'project' ? t('page.backup.scopeProject') : scope.kind === 'workspace' ? t('page.backup.scopeWorkspace') : t('page.backup.scopeInstance');
  const scopeName =
    scope.kind === 'project'
      ? (Array.isArray(S.data?.projects) ? S.data.projects : []).find(p => p?.id === scope.id)?.name || scope.id || ''
      : scope.kind === 'workspace'
        ? scope.id || ''
        : '';
  const nextRunMs = Number(task.next_run_at);
  const nextRun = Number.isFinite(nextRunMs) && nextRunMs > 0 ? fmtDate(new Date(nextRunMs).toISOString()) : '—';
  const actions = manage
    ? `<div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap">
        <button class="btn btn-sm" data-a="backupTaskToggle" data-id="${esc(task.id)}">${task.enabled ? t('page.backup.taskDisable') : t('page.backup.taskEnable')}</button>
        <button class="btn btn-sm" data-a="backupTaskRunNow" data-id="${esc(task.id)}">${ic('play', 13)}${t('page.backup.taskRunNow')}</button>
        <button class="btn btn-sm" data-a="backupTaskHistory" data-id="${esc(task.id)}">${ic('history', 13)}${t('page.backup.historyAction')}</button>
        <button class="btn btn-sm btn-danger" data-a="backupTaskDelete" data-id="${esc(task.id)}">${ic('trash', 13)}${t('page.backup.taskDelete')}</button>
      </div>`
    : '';
  return `<div class="panel" style="margin-top:12px"><div class="panel-b">
    <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap">
      <strong>${esc(task.name)}</strong>
      <span class="badge ${task.enabled ? 'green' : ''}">${t(task.enabled ? 'page.backup.taskEnabled' : 'page.backup.taskDisabled')}</span>
    </div>
    <div class="row" style="gap:8px;margin-top:6px;flex-wrap:wrap;font-size:13px">
      <span class="faint">${scopeLabel}${scopeName ? ` · ${esc(scopeName)}` : ''}</span>
      <span class="faint">${t('page.backup.scheduleLabel')}: <span class="mono">${esc(task.cron)}</span></span>
      <span class="faint">${t('page.backup.tzLabel')}: <span class="mono">${esc(task.tz)}</span></span>
      <span class="faint">${t('page.backup.retentionLabel')}: <span class="mono">${esc(String(task.retention_daily))}/${esc(String(task.retention_weekly))}/${esc(String(task.retention_monthly))}/${esc(String(task.retention_yearly))}</span></span>
      <span class="faint">${t('page.backup.nextRunLabel')}: <span class="mono">${esc(nextRun)}</span></span>
    </div>
    ${actions}
    ${manage && S.ui.backupHistoryOpen?.has(task.id) ? historyCard(task) : ''}
  </div></div>`;
};

/* Builder form (D-01): 4 presets — Daily, Weekly, Monthly — plus Custom,
   which reveals the five per-field dropdowns. The per-field selects are the
   ONLY schedule inputs; the form stages into S.ui.backupTaskForm (never the
   DOM). Custom per-field selects default to `*` so a Custom save always
   serializes a well-formed string; minute/hour always carry concrete values. */
const fieldSel = (form, name, labelKey, min, max, star) => {
  const cur = String(form.fields[name] ?? (star ? '*' : min));
  const opts = [];
  if (star) opts.push(`<option value="*"${cur === '*' ? ' selected' : ''}>*</option>`);
  for (let v = min; v <= max; v++) opts.push(`<option value="${v}"${cur === String(v) ? ' selected' : ''}>${String(v).padStart(2, '0')}</option>`);
  return `<select class="input" data-in="backupTaskField" data-f="${name}" aria-label="${t(labelKey)}">${opts.join('')}</select>`;
};

const taskFormCard = () => {
  const form = S.ui.backupTaskForm;
  if (!form) return '';
  const projects = Array.isArray(S.data.projects) ? S.data.projects : [];
  const pad2 = n => String(n).padStart(2, '0');
  const time = `${pad2(form.fields.hour)}:${pad2(form.fields.minute)}`;
  /* Human-readable schedule summary — TEXT derived from the selections only
     (no computed timestamp preview, Pitfall 6; no client cron evaluation). */
  const dayName = dow => { try { return new Intl.DateTimeFormat(getLocale(), { weekday: 'long' }).format(new Date(2024, 0, 7 + Number(dow) % 7)); } catch { return dow; } };
  const summary =
    form.preset === 'daily'
      ? t('page.backup.summaryDaily', { time: time })
      : form.preset === 'weekly'
        ? t('page.backup.summaryWeekly', { day: dayName(form.fields.dow), time: time })
        : form.preset === 'monthly'
          ? t('page.backup.summaryMonthly', { dom: form.fields.dom, time: time })
          : t('page.backup.summaryCustom', { cron: `${form.fields.minute} ${form.fields.hour} ${form.fields.dom} ${form.fields.mon} ${form.fields.dow}` });
  const presetOpt = (value, label) => `<option value="${value}"${form.preset === value ? ' selected' : ''}>${t(label)}</option>`;
  /* Which per-field dropdowns the current preset reveals (D-01). */
  const show = {
    minute: true,
    hour: true,
    dom: form.preset === 'monthly' || form.preset === 'custom',
    mon: form.preset === 'custom',
    dow: form.preset === 'weekly' || form.preset === 'custom',
  };
  const scopeSel =
    `<select class="input" data-in="backupTaskScopeKind">` +
    `<option value="instance"${form.scopeKind === 'instance' ? ' selected' : ''}>${t('page.backup.scopeInstance')}</option>` +
    `<option value="workspace"${form.scopeKind === 'workspace' ? ' selected' : ''}>${t('page.backup.scopeWorkspace')}</option>` +
    `<option value="project"${form.scopeKind === 'project' ? ' selected' : ''}>${t('page.backup.scopeProject')}</option></select>`;
  const scopeIdSel =
    form.scopeKind === 'project'
      ? `<div class="field"><label class="label">${t('page.backup.projectLabel')}</label><select class="input" data-in="backupTaskScopeId"><option value="">—</option>${projects.map(p => `<option value="${esc(p.id)}"${p.id === form.scopeId ? ' selected' : ''}>${esc(p.name || p.id)}</option>`).join('')}</select></div>`
      : form.scopeKind === 'workspace'
        ? `<div class="field"><label class="label">${t('page.backup.workspaceLabel')}</label><select class="input" data-in="backupTaskScopeId"><option value="${esc(api.workspace?.id || '')}" selected>${esc(api.workspace?.name || api.workspace?.id || '')}</option></select></div>`
        : '';
  return `<div class="panel" style="margin-top:12px"><div class="panel-b">
    <h2 style="margin:0 0 4px">${t(form.editing ? 'page.backup.taskEditTitle' : 'page.backup.taskFormTitle')}</h2>
    <div class="row" style="gap:8px;align-items:flex-end;flex-wrap:wrap">
      <div class="field" style="min-width:220px"><label class="label">${t('page.backup.taskNameLabel')}</label><input class="input" data-in="backupTaskName" value="${esc(form.name)}" maxlength="120"></div>
      <div class="field"><label class="label">${t('page.backup.scopeLabel')}</label>${scopeSel}</div>
      ${scopeIdSel}
    </div>
    <div class="row" style="gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:8px">
      <div class="field"><label class="label">${t('page.backup.scheduleLabel')}</label><select class="input" data-in="backupTaskPreset">${presetOpt('daily', 'page.backup.presetDaily')}${presetOpt('weekly', 'page.backup.presetWeekly')}${presetOpt('monthly', 'page.backup.presetMonthly')}${presetOpt('custom', 'page.backup.presetCustom')}</select></div>
      <div class="field"><label class="label">${t('page.backup.fieldMinute')}</label>${fieldSel(form, 'minute', 'page.backup.fieldMinute', 0, 59, false)}</div>
      <div class="field"><label class="label">${t('page.backup.fieldHour')}</label>${fieldSel(form, 'hour', 'page.backup.fieldHour', 0, 23, false)}</div>
      ${show.dom ? `<div class="field"><label class="label">${t('page.backup.fieldDayOfMonth')}</label>${fieldSel(form, 'dom', 'page.backup.fieldDayOfMonth', 1, 31, true)}</div>` : ''}
      ${show.mon ? `<div class="field"><label class="label">${t('page.backup.fieldMonth')}</label>${fieldSel(form, 'mon', 'page.backup.fieldMonth', 1, 12, true)}</div>` : ''}
      ${show.dow ? `<div class="field"><label class="label">${t('page.backup.fieldDayOfWeek')}</label>${fieldSel(form, 'dow', 'page.backup.fieldDayOfWeek', 0, 6, true)}</div>` : ''}
    </div>
    <div class="row" style="gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:8px">
      <div class="field" style="min-width:260px;max-width:340px"><label class="label">${t('page.backup.tzLabel')}</label>${tzCombobox(form.tz)}</div>
    </div>
    <div class="hint" style="margin-top:8px">${t('page.backup.scheduleSummaryPrefix')}: ${esc(summary)}</div>
    <div class="row" style="gap:8px;margin-top:10px">
      <button class="btn btn-primary" data-a="backupTaskSave">${ic('check', 14)}${t('page.backup.taskSaveAction')}</button>
      <button class="btn" data-a="backupTaskCancel">${t('page.backup.taskCancelAction')}</button>
    </div>
  </div></div>`;
};

export function pageBackup() {
  /* The server decision, surfaced verbatim (governance.js:72-73 shape): the
     gate is the server's 403; the page only reports it — keyed role message,
     home way out (D-26). */
  if (S.ui.backupErr?.status === 403) return full403();
  if (S.ui.backupErr?.status) return fullErr();

  const loading = !S.ui.backupTasks;
  /* In-render kick covers a boot-time deep link (governance.js:76 TRN-01
     precedent). */
  if (loading && !S.ui.backupErr) refreshBackupTasks();
  if (loading)
    return `<div class="page wide"><div class="ph"><div><h1>${t('nav.route.backup')}</h1><p>${t('page.backup.subtitle')}</p></div></div><div class="panel" style="margin-top:16px"><div class="panel-b faint" aria-busy="true">${t('page.governance.loading')}</div></div></div>`;

  /* D-23/D-24: the capability flags ride the payload — rendered verbatim as
     chrome, never recomputed client-side. Honest flags: a missing flag reads
     false (fail-closed), never a client-side guess. */
  const flags = S.ui.backupTasks || { tasks: [], canBackup: false, canRestore: false };
  const tasks = Array.isArray(flags.tasks) ? flags.tasks : [];
  /* D-07: pick up a run that is already active (page re-entry mid-run) — one
     payload-driven tick; the interval itself lives in actions.js and runs only
     while the payload reports an active stage. WR-02: the kick honors the
     post-failure cooldown, so a persistent server error cannot loop
     render→fetch→render. */
  if (flags.canBackup && !S.ui.backupRun && !S.ui.backupPending && backupPollKickAllowed()) backupPollTick();
  /* 87-04: the Phase 87 task console — the task list (payload rows verbatim)
     beside the 86-02 Run now card, with the builder form when staged open. */
  const body = tasks.length
    ? tasks.map(task => taskCard(task, flags.canBackup)).join('')
    : empty('hard-drive', t('page.backup.emptyTitle'), t('page.backup.emptyBody'), '', 'sm', 3);

  return `<div class="page wide">
    <div class="ph"><div><h1>${t('nav.route.backup')}</h1><p>${t('page.backup.subtitle')}</p></div></div>
    <div class="row" style="gap:8px;margin-top:8px">${flags.canBackup ? `<span class="badge green">${t('page.backup.flagBackup')}</span>` : ''}${flags.canRestore ? `<span class="badge">${t('page.backup.flagRestore')}</span>` : ''}${!flags.canBackup && !flags.canRestore ? '<span class="badge">—</span>' : ''}</div>
    ${flags.canBackup ? runNowCard(flags) : ''}
    ${flags.canBackup ? runProgress() : ''}
    ${flags.canBackup ? taskFormCard() : ''}
    <div class="row" style="gap:8px;align-items:center;margin-top:16px">
      <h2 style="margin:0">${t('page.backup.tasksTitle')}</h2>
      ${flags.canBackup && !S.ui.backupTaskForm ? `<button class="btn btn-primary" data-a="backupTaskNew">${ic('plus', 14)}${t('page.backup.taskNewAction')}</button>` : ''}
    </div>
    <div class="panel" style="margin-top:12px">${body}</div>
  </div>`;
}
