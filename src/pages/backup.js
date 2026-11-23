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
import { refreshBackupTasks, refreshRestoreBackups, backupPollTick, backupPollKickAllowed, restorePollKickAllowed } from '../actions/actions.js';

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
  } else if (run.stage === 'uploading') {
    /* 88-03 (T-88-09): render verbatim from the run payload — partsDone/
       partsTotal arrive from the server; no client-side stage or count
       derivation. Absent counts render nothing (honest empty detail). */
    detail = `<p class="faint" style="margin:0">${t('page.backup.stageUploading')}</p>${Number.isFinite(Number(run.partsDone)) && Number.isFinite(Number(run.partsTotal)) ? `<p class="faint" style="margin:8px 0 0">${t('page.backup.partsProgress', { done: run.partsDone, total: run.partsTotal })}</p>` : ''}`; // partsTotal may be null until the upload starts — render nothing rather than "0/null"
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
  upload_failed: 'page.backup.statusUploadFailed', // 88-03: distinct terminal state — local archive kept, upload failed (D-88-2)
  interrupted: 'page.backup.statusInterrupted',
  skipped_overlap: 'page.backup.statusSkippedOverlap',
  deleted: 'page.backup.statusDeleted',
};
const RUN_TRIGGER_KEYS = { manual: 'page.backup.triggerManual', scheduled: 'page.backup.triggerScheduled' };
/* 90-03 (D-90-16 refined): the four GFS scale labels the kept-position badge
   resolves {scale} through — the ONLY retention vocabulary the client holds.
   The position/keep figures themselves ride the server payload verbatim
   (gfsKeptPositions, computed per request from the CURRENT policy) — zero
   client GFS math, ever (D-90-12/16: no date arithmetic, no bucket
   assignment, no counting under src/). */
const GFS_SCALE_KEYS = { daily: 'page.backup.gfsDaily', weekly: 'page.backup.gfsWeekly', monthly: 'page.backup.gfsMonthly', yearly: 'page.backup.gfsYearly' };
const durText = ms => (Number.isFinite(ms) && ms >= 0 ? `${(ms / 1000).toFixed(1)} s` : '—');

const runRow = run => {
  const errOpen = S.ui.backupRunErrOpen?.has(run.id);
  const startedMs = Number(run.started_at);
  const when = Number.isFinite(startedMs) && startedMs > 0 ? fmtDate(new Date(startedMs).toISOString()) : '—';
  /* 90-02 (D-90-9): the location badge reuses the restore location keys
     (payload verbatim, neutral badge, accent for s3) and the download CTA is
     payload-flag chrome — it renders ONLY when the server-derived location
     says the bytes exist (local | s3); a missing run renders ZERO download
     CTAs, never a disabled/dead button. The client never derives location
     itself (D-23 doctrine).
     90-02 (D-90-11): the verify CTA shares that condition and the result is
     the DURABLE keyed badge + server timestamp — the only client state is
     the in-flight flag (S.ui.backupChecksumBusy), never a fabricated result
     during an S3 stream-back: the badge re-renders payload-derived after the
     refresh (checksum_ok / checksum_checked_at ride the history payload),
     and NO toast sits on the result path. */
  const chkBusy = !!S.ui.backupChecksumBusy?.has(run.id);
  const chk = run.checksum_ok == null ? null : Number(run.checksum_ok);
  /* 90-03 (D-90-16 refined): the kept-position badge is payload-flag chrome —
     it renders ONLY when the payload carries keptPosition (succeeded runs of
     a rotation task; manual task_id-null runs and non-succeeded runs carry
     none, D-11). The three fields render verbatim; {scale} resolves through
     the four gfs keys — the client computes nothing. */
  const kept = run.keptPosition && GFS_SCALE_KEYS[run.keptPosition.scale] ? run.keptPosition : null;
  return `<div style="padding:8px 0;border-top:1px solid var(--border)"${chkBusy ? ' aria-busy="true"' : ''}>
    <div class="row" style="gap:8px;flex-wrap:wrap;font-size:13px;align-items:center">
      <span class="badge ${run.status === 'succeeded' ? 'green' : ''}">${t(RUN_STATUS_KEYS[run.status] || 'page.backup.statusUnknown')}</span>
      <span class="badge${run.location === 's3' ? ' accent' : ''}">${t(RESTORE_LOCATION_KEYS[run.location] || 'page.restore.locMissing')}</span>
      ${kept ? `<span class="badge"><span class="mono">${t('page.backup.keptPosition', { position: kept.position, keep: kept.keep, scale: t(GFS_SCALE_KEYS[kept.scale]) })}</span></span>` : ''}
      <span class="faint">${t(RUN_TRIGGER_KEYS[run.trigger] || 'page.backup.triggerUnknown')}</span>
      <span class="faint">${esc(when)}</span>
      <span class="faint">${t('page.backup.durLabel')}: ${esc(durText(Number(run.duration_ms)))}</span>
      <span class="faint">${t('page.backup.sizeLabel')}: ${esc(fsize(Number(run.size_bytes) || 0))}</span>
      ${run.sha256 ? `<span class="mono faint" title="${esc(run.sha256)}">${esc(String(run.sha256).slice(0, 12))}</span>` : ''}
      ${run.filename ? `<span class="mono faint">${esc(run.filename)}</span>` : ''}
      ${run.location === 'local' || run.location === 's3' ? `<button class="btn btn-secondary btn-sm" data-a="backupDownload" data-id="${esc(run.id)}">${ic('download', 13)}${t('page.backup.downloadAction')}</button>` : ''}
      ${run.location === 'local' || run.location === 's3' ? `<button class="btn btn-secondary btn-sm" data-a="backupVerifyChecksum" data-id="${esc(run.id)}"${chkBusy ? ' disabled aria-busy="true"' : ''}>${chkBusy ? t('page.backup.checksumChecking') : `${ic('shield-check', 13)}${t('page.backup.verifyChecksumAction')}`}</button>` : ''}
      ${chk === 1 ? `<span class="badge green">${t('page.backup.checksumOk')}</span>` : chk === 0 ? `<span class="badge red">${t('page.backup.checksumFail')}</span>` : ''}
      ${run.checksum_checked_at ? `<span class="faint">${t('page.backup.checksumLastCheck', { time: esc(fmtDate(run.checksum_checked_at)) })}</span>` : ''}
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
        <button class="btn btn-sm" data-a="backupTaskRunNow" data-id="${esc(task.id)}">${ic('play', 13)}${t('page.backup.taskRunNow')}</button>
        <button class="btn btn-sm" data-a="backupTaskEdit" data-id="${esc(task.id)}">${ic('pencil', 13)}${t('page.backup.taskEdit')}</button>
        <button class="btn btn-sm" data-a="backupTaskHistory" data-id="${esc(task.id)}">${ic('history', 13)}${t('page.backup.historyAction')}</button>
        <button class="btn btn-sm" data-a="backupTaskToggle" data-id="${esc(task.id)}">${task.enabled ? t('page.backup.taskDisable') : t('page.backup.taskEnable')}</button>
        <button class="btn btn-sm btn-danger" data-a="backupTaskDelete" data-id="${esc(task.id)}">${ic('trash', 13)}${t('page.backup.taskDelete')}</button>
      </div>`
    : '';
  /* UAT 2026-11-22: the five meta fields were one wrapped row — on narrow
     screens they mashed together. A definition grid gives each field its own
     label line, matching the rest of the app's panel typography. */
  const detail = (label, value) =>
    `<div><div class="faint" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em">${label}</div><div class="mono" style="font-size:13px;margin-top:2px">${value}</div></div>`;
  const wsName = scope.kind === 'workspace' ? (scope.id === api.workspace?.id ? api.workspace?.name || scope.id : scope.id) : '';
  return `<div class="panel" style="margin-top:12px"><div class="panel-h"><h2>${esc(task.name)}</h2><span class="badge ${task.enabled ? 'green' : ''}">${t(task.enabled ? 'page.backup.taskEnabled' : 'page.backup.taskDisabled')}</span></div><div class="panel-b">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px 16px">
      ${detail(scopeLabel, esc(scopeName))}
      ${detail(t('page.backup.scheduleLabel'), esc(task.cron))}
      ${detail(t('page.backup.tzLabel'), esc(task.tz))}
      ${detail(t('page.backup.retentionLabel'), esc(String(task.retention_daily)) + '/' + esc(String(task.retention_weekly)) + '/' + esc(String(task.retention_monthly)) + '/' + esc(String(task.retention_yearly)))}
      ${detail(t('page.backup.nextRunLabel'), esc(nextRun))}
    </div>
    ${actions}
    ${manage && S.ui.backupHistoryOpen?.has(task.id) ? historyCard(task) : ''}
  </div></div>`;
};

/* Builder form (D-01): 4 presets — Daily, Weekly, Monthly — plus Custom,
   which reveals the five per-field dropdowns. The per-field selects are the
   ONLY schedule inputs; the form stages into S.ui.backupTaskForm (never the
   Custom per-field selects default to `*` so a Custom save always
   serializes a well-formed string; minute/hour offer `*` too (UAT 2026-11-22:
   the server cron grammar accepts star in every field — the dropdowns now
   expose it so every-minute/every-hour schedules are buildable; their
   DEFAULTS stay concrete 0/3 so an accidental all-star save is a deliberate
   act, not a slip). */
const fieldSel = (form, name, labelKey, min, max, star) => {
  const cur = String(form.fields[name] ?? (star ? '*' : min));
  const opts = [];
  if (star) opts.push(`<option value="*"${cur === '*' ? ' selected' : ''}>*</option>`);
  for (let v = min; v <= max; v++) opts.push(`<option value="${v}"${cur === String(v) ? ' selected' : ''}>${String(v).padStart(2, '0')}</option>`);
  return `<select class="input" data-in="backupTaskField" data-f="${name}" aria-label="${t(labelKey)}">${opts.join('')}</select>`;
};

/* UAT r3 2026-11-22: retention is now form-staged — two numeric inputs
   (daily/weekly, the buckets that matter for a fast-cadence test task),
   staged in S.ui.backupTaskForm.retention and ALWAYS sent with the save
   (the displayed value IS the intent); monthly/yearly keep the server's
   frozen defaults. Edit mode preloads the stored values. */
/* =====================================================================
   90-03 task 2 (D-90-12/13/14): the rotation-deletion preview — the
   on-demand, server-computed projection of what the NEXT rotation pass
   would delete under the CURRENT policy. The client renders the payload
   verbatim (grouped counts + filenames) with ZERO GFS math (D-90-12/16):
   the four groups render in the server's fixed order with honest zeros
   (every group shows its count, 0 included — no expander on 0, D-90-14);
   count>0 groups expose a real toggle button (aria-expanded/aria-controls,
   NOT a details/summary restyle, 90-UI-SPEC Surface 3). The result is
   EPHEMERAL — staged in S.ui.backupDeletions and cleared on task save,
   cancel and edit (a stale projection must never outlive the form that
   produced it; the badge/panel re-derive on the next preview click).
   ===================================================================== */
const GFS_GROUP_ORDER = ['daily', 'weekly', 'monthly', 'yearly'];
const deletionsPanel = () => {
  const d = S.ui.backupDeletions;
  if (!d) return '';
  if (d.loading) return `<div class="faint" style="margin-top:8px" aria-busy="true">${t('page.backup.deletionsLoading')}</div>`;
  if (d.noRuns) return `<div style="margin-top:8px">${empty('archive', t('page.backup.deletionsEmpty'), '', '', 'sm', 3)}</div>`;
  if (!d.groups) return '';
  const groupRow = scale => {
    const g = d.groups[scale];
    if (!g) return '';
    const open = !!d.open?.[scale];
    const detailId = `backupDel-${scale}`;
    return `<div style="padding:6px 0;border-top:1px solid var(--border)">
      <div class="row" style="gap:8px;align-items:center">
        <span class="mono" style="min-width:28px">${esc(String(g.count))}</span>
        <span>${t(GFS_SCALE_KEYS[scale])}</span>
        ${g.count > 0 ? `<button class="btn btn-sm" data-a="backupDeletionsToggle" data-scale="${scale}" aria-expanded="${open}" aria-controls="${detailId}">${t(open ? 'page.backup.deletionsHide' : 'page.backup.deletionsShow')}</button>` : ''}
      </div>
      ${g.count > 0 && open ? `<div id="${detailId}" style="padding:4px 0 0 16px">${(g.runs || []).map(r => `<div class="mono trunc" style="max-width:340px" title="${esc(r.filename || '')}">${esc(r.filename || '')}</div>`).join('')}</div>` : ''}
    </div>`;
  };
  return `<div style="margin-top:10px">
    <h2 style="margin:0">${t('page.backup.deletionsTitle')}</h2>
    <div class="faint" style="font-size:12px;margin:2px 0 4px">${t('page.backup.deletionsCount', { n: Number(d.total) || 0 })}</div>
    ${GFS_GROUP_ORDER.map(groupRow).join('')}
  </div>`;
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
      <div class="field"><label class="label">${t('page.backup.fieldMinute')}</label>${fieldSel(form, 'minute', 'page.backup.fieldMinute', 0, 59, true)}</div>
      <div class="field"><label class="label">${t('page.backup.fieldHour')}</label>${fieldSel(form, 'hour', 'page.backup.fieldHour', 0, 23, true)}</div>
      ${show.dom ? `<div class="field"><label class="label">${t('page.backup.fieldDayOfMonth')}</label>${fieldSel(form, 'dom', 'page.backup.fieldDayOfMonth', 1, 31, true)}</div>` : ''}
      ${show.mon ? `<div class="field"><label class="label">${t('page.backup.fieldMonth')}</label>${fieldSel(form, 'mon', 'page.backup.fieldMonth', 1, 12, true)}</div>` : ''}
      ${show.dow ? `<div class="field"><label class="label">${t('page.backup.fieldDayOfWeek')}</label>${fieldSel(form, 'dow', 'page.backup.fieldDayOfWeek', 0, 6, true)}</div>` : ''}
    </div>
    <div class="row" style="gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:8px">
      <div class="field" style="min-width:260px;max-width:340px"><label class="label">${t('page.backup.tzLabel')}</label>${tzCombobox(form.tz)}</div>
    </div>
    <div class="row" style="gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:8px">
      <div class="field"><label class="label">${t('page.backup.retentionDaily')}</label><input class="input" type="number" min="0" max="999" style="width:110px" value="${esc(String(form.retention.daily))}" data-in="backupTaskRetention" data-f="daily"></div>
      <div class="field"><label class="label">${t('page.backup.retentionWeekly')}</label><input class="input" type="number" min="0" max="999" style="width:110px" value="${esc(String(form.retention.weekly))}" data-in="backupTaskRetention" data-f="weekly"></div>
    </div>
    ${api.s3Enabled ? `<div class="row" style="gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px"><label style="display:flex;align-items:center;gap:8px"><input type="checkbox" data-in="backupTaskS3"${form.s3Enabled ? ' checked' : ''}><span>${esc(t('page.backup.s3Toggle'))}</span></label></div>` : ''}
    ${deletionsPanel()}
    <div class="hint" style="margin-top:8px">${t('page.backup.scheduleSummaryPrefix')}: ${esc(summary)}</div>
    <div class="row" style="gap:8px;margin-top:10px">
      <button class="btn btn-primary" data-a="backupTaskSave">${ic('check', 14)}${t('page.backup.taskSaveAction')}</button>
      ${form.editing ? `<button class="btn btn-secondary btn-sm" data-a="backupPreviewDeletions" data-task-id="${esc(form.editing)}">${t('page.backup.previewDeletionsAction')}</button>` : ''}
      <button class="btn" data-a="backupTaskCancel">${t('page.backup.taskCancelAction')}</button>
    </div>
  </div></div>`;
};

/* =====================================================================
   89-06 RESTORE (BKRST-01..04, D-89-14..23) — the restore section on the
   shared Backup page, gated on the payload's canRestore flag (D-22/D-23
   — verbatim chrome, never recomputed). Render-only over the restore
   payloads: the list rows, the manifest-derived preview drawer, the
   poll stage panel and the history card render server fields verbatim
   through esc() — the client never parses archive bytes, never derives
   the final restore name (D-89-13: the server owns the restore-name
   counter), never recomputes authority. The preview drawer reuses the
   drawer idiom (same .drawer classes + scrim) rendered from the page
   layer, because the overlay drawer is task-keyed (drawer.js renderLayer).
   ===================================================================== */
const RESTORE_LOCATION_KEYS = { local: 'page.restore.locLocal', s3: 'page.restore.locS3', missing: 'page.restore.locMissing' };
const RESTORE_STAGE_KEYS = {
  fetching: 'page.restore.stageFetching',
  validating: 'page.restore.stageValidating',
  restoring: 'page.restore.stageRestoring',
  verifying: 'page.restore.stageVerifying',
  done: 'page.restore.stageDone',
  failed: 'page.restore.stageFailed',
};

/* List row: payload fields verbatim — location badge (local/S3/missing,
   D-89-14/15), esc'd filename, size, date, 12-char sha slice with the full
   digest in title (runRow idiom). The missing-location badge renders too —
   the restore attempt on it is refused keyed err.restoreArchiveMissing. */
const restoreRow = r => {
  const startedMs = Number(r.startedAt);
  const when = Number.isFinite(startedMs) && startedMs > 0 ? fmtDate(new Date(startedMs).toISOString()) : '—';
  return `<div style="padding:8px 0;border-top:1px solid var(--border)">
    <div class="row" style="gap:8px;flex-wrap:wrap;font-size:13px;align-items:center">
      <span class="badge${r.location === 's3' ? ' accent' : ''}">${t(RESTORE_LOCATION_KEYS[r.location] || 'page.restore.locMissing')}</span>
      <span class="faint mono trunc" style="display:inline-block;max-width:280px" title="${esc(r.filename || '')}">${esc(r.filename || '')}</span>
      <span class="faint">${esc(fsize(Number(r.sizeBytes) || 0))}</span>
      <span class="faint">${esc(when)}</span>
      ${r.sha256 ? `<span class="mono faint" title="${esc(r.sha256)}">${esc(String(r.sha256).slice(0, 12))}</span>` : ''}
      <button class="btn btn-sm" data-a="restorePreview" data-id="${esc(r.runId)}">${ic('archive', 13)}${t('page.restore.previewAction')}</button>
    </div>
  </div>`;
};

/* Preview drawer body: manifest-derived counts ONLY (the payload carries no
   archive bytes, D-89-17) — scope/tables/files/checksum render verbatim,
   missing-blob-flagged file rows flagged with the count shown (D-89-12),
   the skipped-tables note under the tables (D-89-7: report honesty). */
const previewDetail = (label, value) =>
  `<div><div class="faint" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em">${label}</div><div class="mono" style="font-size:13px;margin-top:2px">${value}</div></div>`;

const restorePreviewBody = (d, flags) => {
  const tables = Array.isArray(d.tables) ? d.tables : [];
  const files = Array.isArray(d.files) ? d.files : [];
  const flagged = files.filter(f => f.flagged);
  const kind = d.scope?.kind;
  /* D-89-21: authority is payload-flag chrome — overwrite renders only when
     the tasks payload's canBackup flag is true AND the archive's source
     workspace is a live membership (its EXACT current name is resolvable
     from the same payload); DR renders only for the auth payload's
     Super-Admin flag. Never recomputed authority. */
  const target = kind === 'workspace' ? (api.workspaces || []).find(w => w.id === d.scope?.id) : null;
  const memberships = Array.isArray(api.workspaces) ? api.workspaces : [];
  const ctas = [];
  if (kind === 'workspace' || kind === 'project')
    ctas.push(`<button class="btn btn-primary" data-a="restoreNew" data-id="${esc(d.runId)}">${ic('rotate-ccw', 14)}${t('page.restore.restoreNewAction')}</button>`);
  if (kind === 'workspace' && flags?.canBackup && target)
    ctas.push(`<button class="btn btn-danger" data-a="restoreOverwrite" data-id="${esc(d.runId)}">${ic('pencil', 14)}${t('page.restore.restoreOverwriteAction')}</button>`);
  if (kind === 'instance' && api.user?.isInstanceAdmin)
    ctas.push(`<button class="btn btn-danger" data-a="restoreInstance" data-id="${esc(d.runId)}">${ic('hard-drive', 14)}${t('page.restore.restoreInstanceAction')}</button>`);
  /* D-89-23 workspace picker (project archives): live memberships verbatim,
     esc'd names, chosen target armed for the trigger — zero memberships
     render NO picker (the empty-dropdown shape is never rendered). */
  const picker =
    kind === 'project' && memberships.length
      ? `<div style="margin-top:12px"><div class="faint" style="font-size:12px;margin-bottom:6px">${t('page.restore.scopeLabel')}</div><div class="row" style="gap:6px;flex-wrap:wrap">${memberships
          .map(
            w =>
              `<button class="btn btn-sm${S.ui.restoreTarget === w.id ? ' btn-primary' : ''}" data-a="restoreTargetPick" data-id="${esc(w.id)}" title="${esc(w.name)}"><span class="trunc" style="max-width:180px">${esc(w.name)}</span></button>`,
          )
          .join('')}</div></div>`
      : '';
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px 16px">
      ${previewDetail(t('page.restore.scopeLabel'), esc(String(kind ?? '')))}
      ${previewDetail(t('page.restore.tablesLabel'), esc(String(tables.length)))}
      ${previewDetail(t('page.restore.filesLabel'), esc(String(d.fileCount ?? files.length)))}
      ${previewDetail(t('page.restore.checksumLabel'), `<span title="${esc(d.checksum || '')}">${esc(String(d.checksum || '').slice(0, 12))}</span>`)}
    </div>
    ${tables.length ? `<div class="faint" style="margin-top:10px;font-size:12px">${tables.map(tb => esc(tb.name)).join(' · ')}</div>` : ''}
    <div class="hint" style="margin-top:8px">${t('page.restore.skippedTablesNote')}</div>
    ${
      flagged.length
        ? `<div class="row" style="gap:6px;flex-wrap:wrap;margin-top:8px"><span class="faint" style="font-size:12px">${ic('circle-alert', 12)}${esc(String(d.missingBlobCount ?? flagged.length))}</span>${flagged.map(f => `<span class="badge">${esc(f.name)}</span>`).join('')}</div>`
        : ''
    }
    ${picker}
    <div class="row" style="gap:8px;margin-top:12px">${ctas.join('')}</div>`;
};

const restorePreviewDrawer = flags => {
  const p = S.ui.restorePreview;
  if (!p) return '';
  const d = S.ui.restorePreviewData;
  const body = !d
    ? `<div class="faint" style="padding:8px 0" aria-busy="true">${t('page.restore.listLoading')}</div>`
    : restorePreviewBody(d.data, flags);
  return `<div class="drawer-scrim" data-a="restorePreviewClose"></div><div class="drawer"><div class="drawer-h"><strong>${t('page.restore.previewTitle')}</strong><button class="ibtn" data-a="restorePreviewClose" aria-label="${t('a11y.close')}">${ic('x', 15)}</button></div><div class="drawer-b">${body}</div></div>`;
};

/* D-89-29 stage progress: rendered verbatim from the restore current
   payload — pending flag until the first poll lands (no fabricated stage),
   stage badge + keyed label while active, done/failed terminal bodies. The
   final name is the payload's own field (D-89-13 render-verbatim). */
const restoreProgress = () => {
  const run = S.ui.restoreRun;
  if (S.ui.restorePending && !run?.runId)
    return `<div class="panel" style="margin-top:12px"><div class="panel-h"><h2>${t('page.restore.stageLabel')}</h2></div><div class="panel-b faint" aria-busy="true">${t('page.restore.pending')}</div></div>`;
  if (!run?.runId) return '';
  let detail = '';
  if (run.stage === 'done') {
    detail = run.finalName ? `<p class="faint" style="margin:0">${t('page.restore.runDone', { name: esc(String(run.finalName)) })}</p>` : '';
  } else if (run.stage === 'failed') {
    detail = `<p class="faint" style="margin:0">${t('page.restore.runFailed')}</p>`;
  } else if (RESTORE_STAGE_KEYS[run.stage]) {
    detail = `<p class="faint" style="margin:0">${t(RESTORE_STAGE_KEYS[run.stage])}</p>${
      /* D-89-13 render-verbatim: the server-derived final name (incl. the
         counter) renders from the poll payload the moment the writer lands
         it — no client-side name math. */
      run.finalName ? `<p class="faint" style="margin:4px 0 0">${t('page.restore.newNameLead', { name: esc(String(run.finalName)) })}</p>` : ''
    }`;
  }
  return `<div class="panel" style="margin-top:12px"><div class="panel-h"><h2>${t('page.restore.stageLabel')}</h2><span class="badge">${esc(String(run.stage || ''))}</span></div><div class="panel-b">${detail}</div></div>`;
};

/* History row: the restore_runs payload verbatim (server order, server cap —
   no client re-sort, no client pagination). The summary is the server's JSON
   report string: its skipped tables render under skipReportLabel (D-89-7 —
   report-only, never hidden); the expandable error toggle mirrors runRow. */
const restoreRunRow = run => {
  const errOpen = S.ui.restoreRunErrOpen?.has(run.id);
  const startedMs = Number(run.started_at);
  const when = Number.isFinite(startedMs) && startedMs > 0 ? fmtDate(new Date(startedMs).toISOString()) : '—';
  let skipped = [];
  try {
    const s = typeof run.summary === 'string' && run.summary ? JSON.parse(run.summary) : null;
    skipped = Array.isArray(s?.skipped) ? s.skipped : [];
  } catch {
    skipped = [];
  }
  return `<div style="padding:8px 0;border-top:1px solid var(--border)">
    <div class="row" style="gap:8px;flex-wrap:wrap;font-size:13px;align-items:center">
      <span class="badge ${run.status === 'done' ? 'green' : ''}">${RESTORE_STAGE_KEYS[run.stage] ? t(RESTORE_STAGE_KEYS[run.stage]) : esc(String(run.stage || '—'))}</span>
      <span class="faint trunc" style="display:inline-block;max-width:280px" title="${esc(String(run.final_name || ''))}">${esc(String(run.final_name || ''))}</span>
      <span class="faint">${esc(when)}</span>
    </div>
    ${
      skipped.length
        ? `<div class="faint" style="margin-top:4px;font-size:12px">${t('page.restore.skipReportLabel')}: ${esc(skipped.map(s => String(s?.table || '')).filter(Boolean).join(', '))}</div>`
        : ''
    }
    ${
      run.error
        ? `<div style="margin-top:4px"><a href="#" data-a="restoreRunErr" data-id="${esc(run.id)}">${t('page.restore.errorToggle')}</a>${
            errOpen ? `<div class="mono" style="margin-top:4px;font-size:12px;white-space:pre-wrap">${esc(run.error)}</div>` : ''
          }</div>`
        : ''
    }
  </div>`;
};

const restoreHistoryCard = () => {
  const h = S.ui.restoreHistory;
  const body = !h
    ? `<div class="faint" style="padding:8px 0" aria-busy="true">${t('page.restore.historyLoading')}</div>`
    : h.err
      ? `<div class="faint" style="padding:8px 0">${t('page.restore.historyUnavailable')}</div>`
      : !h.runs.length
        ? `<div class="faint" style="padding:8px 0">${t('page.restore.historyEmpty')}</div>`
        : h.runs.map(restoreRunRow).join('');
  return `<div style="margin-top:10px">
    <div class="row" style="gap:8px;align-items:center">
      <strong style="font-size:13px">${t('page.restore.historyTitle')}</strong>
      <span class="faint" style="font-size:12px">${t('page.restore.historyCap')}</span>
    </div>
    ${body}
  </div>`;
};

const restoreSection = () => {
  const list = S.ui.restoreList;
  const listBody = !list
    ? `<div class="faint" style="padding:8px 0" aria-busy="true">${t('page.restore.listLoading')}</div>`
    : list.err
      ? `<div class="faint" style="padding:8px 0">${t('page.restore.listUnavailable')}</div>`
      : !list.runs.length
        ? empty('archive', t('page.restore.listEmptyTitle'), t('page.restore.listEmptyBody'), '', 'sm', 3)
        : list.runs.map(restoreRow).join('');
  return `<div class="row" style="gap:8px;align-items:center;margin-top:16px">
      <h2 style="margin:0">${t('page.restore.title')}</h2>
      <button class="btn btn-sm" data-a="restoreHistory">${ic('history', 13)}${t('page.restore.historyTitle')}</button>
    </div>
    <p class="faint" style="margin:4px 0 0">${t('page.restore.lead')}</p>
    ${restoreProgress()}
    <div class="panel" style="margin-top:12px">${listBody}</div>
    ${S.ui.restoreHistoryOpen ? restoreHistoryCard() : ''}`;
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
  /* 89-06: the restore list fill — one loop, payload-flag gated (D-22:
     the section and its fetches exist only for RESTORE_USE holders). */
  if (flags.canRestore && !S.ui.restoreList) refreshRestoreBackups();
  /* D-07: pick up a run that is already active (page re-entry mid-run) — one
     payload-driven tick; the interval itself lives in actions.js and runs only
     while the payload reports an active stage. WR-02: the kick honors the
     post-failure cooldown, so a persistent server error cannot loop
     render→fetch→render. */
  if (
    (flags.canBackup && !S.ui.backupRun && !S.ui.backupPending && backupPollKickAllowed()) ||
    (flags.canRestore && !S.ui.restoreRun && !S.ui.restorePending && restorePollKickAllowed())
  )
    backupPollTick();
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
    ${flags.canRestore ? restoreSection() : ''}
    ${flags.canRestore ? restorePreviewDrawer(flags) : ''}
  </div>`;
}
