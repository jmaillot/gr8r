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
import { t, getLocale, formatTime } from '../core/i18n.js';
import { esc, fmtDate } from '../core/utils.js';
import { empty, fsize } from '../ui/helpers.js';
import { tzCombobox } from './settings.js';
import { tzPreselect } from '../lib/timezones.js';
import { refreshBackupTasks, refreshBackupScopes, refreshRestoreHistory, refreshBackupHistory, backupPollTick, backupPollKickAllowed, restorePollKickAllowed } from '../actions/actions.js';

/* Verbatim governance.js fullstate shapes: 403 → lock glyph + err.code403 +
   route name + keyed ROLE body + home way out; other fetch errors →
   cloud-alert + retry (explicit, never auto re-kicked while the error state
   is set — CR-01). */
const full403 = () =>
  `<div class="fullstate"><div class="box"><div class="empty-state" style="padding:0"><div class="glyph">${ic('lock', 20)}</div></div><span class="code">${t('err.code403')}</span><h1>${t('nav.route.backup')}</h1><p>${t('err.backupRoleRequired')}</p><div class="row"><button class="btn btn-primary" data-a="go" data-r="home">${t('nav.goHome')}</button></div></div></div>`;
const fullErr = () =>
  `<div class="fullstate"><div class="box"><div class="empty-state err" style="padding:0"><div class="glyph">${ic('cloud-alert', 20)}</div></div><h1>${t('page.somethingWrong')}</h1><p>${t('page.loadFailedBody')}</p><div class="row"><button class="btn btn-primary" data-a="backupRetry">${ic('refresh-cw', 14)}${t('page.tryAgain')}</button></div></div></div>`;

/* D-09 Run now card: scope picker over payload-driven data only — the
   project list is the current doc's projects, the workspace options the
   phase-92 scopes payload (XWS-01/D-11: S.ui.backupScopes, loaded workspace
   fallback). Selection lives in S.ui.backupScope (staged state, never
   the DOM); the server re-validates everything and is the sole authority. */
const runNowCard = flags => {
  const scope = S.ui.backupScope || { kind: 'instance', id: null };
  const opt = (value, label) => `<option value="${value}"${scope.kind === value ? ' selected' : ''}>${t(label)}</option>`;
  const projects = Array.isArray(S.data?.projects) ? S.data.projects : [];
  const projectSel =
    scope.kind === 'project'
      ? `<div class="field"><label class="label">${t('page.backup.projectLabel')}</label><select class="input" data-in="backupScopeId"><option value="">—</option>${projects.map(p => `<option value="${esc(p.id)}"${p.id === scope.id ? ' selected' : ''}>${esc(p.name || p.id)}</option>`).join('')}</select></div>`
      : '';
  /* XWS-01 (D-11): the workspace options ride the phase-92 scopes payload
     (S.ui.backupScopes — the operator-gated /api/backup/scopes response,
     the same input the restore target picker uses) so Backup/Restore Ops
     and Super Admins see every active workspace. Fail-closed fallback:
     empty/absent payload → the loaded workspace only, NEVER memberships
     (cross-workspace visibility is pickers-only; server re-validates). */
  const runNowScopes = Array.isArray(S.ui.backupScopes) && S.ui.backupScopes.length
    ? S.ui.backupScopes
    : api.workspace?.id
      ? [{ id: api.workspace.id, name: api.workspace.name || api.workspace.id }]
      : [];
  const workspaceSel =
    scope.kind === 'workspace'
      ? (runNowScopes.length
          ? `<div class="field"><label class="label">${t('page.backup.workspaceLabel')}</label><select class="input" data-in="backupScopeId">${runNowScopes.map(w => `<option value="${esc(w.id)}"${w.id === scope.id ? ' selected' : ''}>${esc(w.name || w.id)}</option>`).join('')}</select></div>`
          : `<span class="badge">—</span>`)
      : '';
  /* UAT round-7: the title sits ABOVE the panel (the "Backup tasks" idiom —
     page-level h2, not inside the panel). */
  return `<div class="row" style="gap:8px;align-items:center;margin-top:16px"><h2 style="margin:0">${t('page.backup.runNowTitle')}</h2></div>
    <div class="panel" style="margin-top:12px"><div class="panel-b">
    <p class="faint" style="margin:0 0 10px">${t('page.backup.runNowLead')}</p>
    <div class="row" style="gap:8px;align-items:flex-end;flex-wrap:wrap">
      <div class="field"><label class="label">${t('page.backup.scopeLabel')}</label><select class="input" data-in="backupScopeKind">${opt('instance', 'page.backup.scopeInstance')}${opt('workspace', 'page.backup.scopeWorkspace')}${opt('project', 'page.backup.scopeProject')}</select></div>
      ${workspaceSel}${projectSel}
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

/* =====================================================================
   Phase 94 (D-04, BKUI-04): the UNIFIED run history — one sblock below
   the task table over the FROZEN Phase-92 ?all=1 route (fail-closed
   per-row visibility server-side; the client adds no params, invents no
   fields). Three staged selects (task — names as labels, ids as values,
   plus a synthetic `manual` entry the server maps to task_id IS NULL;
   trigger manual|scheduled; status — ONLY the served enum running/
   succeeded/failed/upload_failed/deleted: interrupted/skipped_overlap
   are NOT accepted by the filter and would narrow to empty, so they are
   omitted from the SELECT while staying first-class labels in
   RUN_STATUS_KEYS). Pagination is naive limit/offset — the payload has
   NO total count, so "next" probes limit+1 and grays out on a short
   page (documented heuristic). Rows render run.label (the 5-segment
   runLabel, resolved server-side) VERBATIM through esc(); the GFS badge
   derives from run.gfs_bucket through the four gfs keys (assumption A3:
   keptPosition is not on ?all=1 rows — the label embeds the GFS segment).
   ===================================================================== */
const HISTORY_FILTER_STATUSES = ['running', 'succeeded', 'failed', 'upload_failed', 'deleted'];
const historyTr = run => {
  const errOpen = S.ui.backupRunErrOpen?.has(run.id);
  const startedMs = Number(run.started_at) || Number(run.created_at);
  const when = Number.isFinite(startedMs) && startedMs > 0 ? fmtDate(startedMs) : '—';
  const chkBusy = !!S.ui.backupChecksumBusy?.has(run.id);
  /* The GFS badge: the payload's gfs_bucket resolves through the four gfs
     keys — no client GFS math, ever (D-90-12/16 doctrine carries over). */
  const gfsKey = GFS_SCALE_KEYS[run.gfs_bucket];
  /* UAT round-4: the unified sblock renders as a REAL TABLE — one <tr> per
     run under the Type/Run/Trigger/Schedule/Status/Date headers. */
  /* UAT round-5: the Run cell shows the SHORT label — the 12-hex instance id
     is stripped for display only (identical on every row of a single
     instance); the full server label stays in the tooltip, the stored field
     is never rewritten (D-04: the payload renders, the display abbreviates).
     Status = run-level states only: Succeeded green / Warning amber when the
     run carries missing blobs (the archive exists but blobs are gone) /
     Error red for failed + upload_failed / Running neutral. The checksum
     result is NOT durable chrome — it toasts on click only (UAT round-5). */
  const shortLabel = String(run.label || '').replace(/^[0-9a-f]{12}-/, '');
  /* UAT round-6: the Run cell shows ONE line — the short label. The filename
     and sha travel in the tooltip (hover), not as stacked divs. */
  const runTip = [run.label, run.filename].filter(Boolean).map(String).join('\n');
  const runCell = `<span class="mono faint trunc" style="display:inline-block;max-width:320px;vertical-align:bottom" title="${esc(runTip)}">${esc(shortLabel)}</span>${
    run.error
      ? `<div style="margin-top:4px"><a href="#" data-a="backupRunErr" data-id="${esc(run.id)}">${t('page.backup.errorToggle')}</a>${
          errOpen ? `<div class="mono" style="margin-top:4px;font-size:12px;white-space:pre-wrap">${esc(run.error)}</div>` : ''
        }</div>`
      : ''
  }`;
  /* UAT round-7: Status + Schedule + actions stay on ONE line (nowrap) —
     the Run column truncates instead, so rows stay single-height and the
     task name starts flush left under the Task header. */
  const scheduleCell = gfsKey ? `<span class="badge" style="white-space:nowrap"><span class="mono">${t(gfsKey)}</span></span>` : '<span class="faint">—</span>';
  const warn = run.status === 'succeeded' && Number(run.missing_blob_count) > 0;
  const statusCell = `<span style="white-space:nowrap">` + (
    run.status === 'failed' || run.status === 'upload_failed'
      ? `<span class="badge red">${t(run.status === 'failed' ? 'page.backup.statusFailed' : 'page.backup.statusUploadFailed')}</span>`
      : `<span class="badge ${run.status === 'succeeded' ? 'green' : ''}">${t(RUN_STATUS_KEYS[run.status] || 'page.backup.statusUnknown')}</span>` +
        (warn ? ` <span class="badge amber" title="${esc(t('page.backup.missingBlobWarn', { n: Number(run.missing_blob_count) }))}">${t('page.backup.statusWarning')}</span>` : '') +
        /* 2026-11-27 UAT (owner: a local-deleted ftp/smb run showed NO
           badge at all): the PRIMARY badge renders for every resolvable
           location — the mirror flags below stay the SECONDARY badges. */
        (run.location && run.location !== 'missing'
          ? ` <span class="badge${run.location === 's3' ? ' accent' : ''}">${t(RESTORE_LOCATION_KEYS[run.location])}</span>`
          : '') +
        /* UAT 2026-11-26 (owner report: a local+S3 run showed only "Local"):
           the mirror flags ride the payload — render honest SECONDARY
           badges beside the primary location badge. The 96 ordered scan
           stays the source of the PRIMARY badge only. */
        (run.uploaded === 1 && run.location !== 's3'
          ? ` <span class="badge accent">${t(RESTORE_LOCATION_KEYS.s3)}</span>`
          : '') +
        (run.ftp_uploaded === 1 && run.location !== 'ftp'
          ? ` <span class="badge">${t(RESTORE_LOCATION_KEYS.ftp)}</span>`
          : '') +
        (run.smb_uploaded === 1 && run.location !== 'smb'
          ? ` <span class="badge">${t(RESTORE_LOCATION_KEYS.smb)}</span>`
          : '') +
        /* Phase 100 (100-04, D-03): the pruned badge — remote mirrors were
           pruned after rotation. Two-condition gate: only a rotated-out
           (deleted) row with remote_pruned = 1 renders it; live runs can
           never show it by construction (deleted rows appear only under
           the Rotated filter). Never coupled to the location ternary — a
           pruned run's location resolves through destLocation to its
           surviving flag. */
        (run.remote_pruned === 1 && run.status === 'deleted'
          ? ` <span class="badge">${t('page.backup.pruned')}</span>`
          : '')
  ) + `</span>`;
  const actionsCell =
    /* 2026-11-26 UAT (owner: the Restore button vanished once the local
       archive rotated away — location 'smb'/'ftp' rows lost every CTA):
       the server funnel has fetched ftp/smb archives since 98-04/100-05,
       the action set is identical (restore is destination-agnostic from
       the button's seat) — the gate now admits every RESOLVED location;
       only 'missing' (no local, no mirror flag) stays button-less. */
    run.location !== 'missing'
      ? `<span class="row" style="gap:6px;justify-content:flex-end;flex-wrap:nowrap;white-space:nowrap">
          <button class="btn btn-secondary btn-sm" data-a="restorePreview" data-id="${esc(run.id)}">${ic('archive', 13)}${t('page.restore.restoreAction')}</button>
          <button class="btn btn-secondary btn-sm" data-a="backupDownload" data-id="${esc(run.id)}">${ic('download', 13)}${t('page.backup.downloadAction')}</button>
          <button class="btn btn-secondary btn-sm" data-a="backupVerifyChecksum" data-id="${esc(run.id)}"${chkBusy ? ' disabled aria-busy="true"' : ''}>${chkBusy ? t('page.backup.checksumChecking') : `${ic('shield-check', 13)}${t('page.backup.verifyChecksumAction')}`}</button>
        </span>`
      : '';
  return `<tr${chkBusy ? ' aria-busy="true"' : ''}>
    <td style="padding-left:14px"><span class="badge" title="${esc(t('page.backup.historyColType'))}" style="min-width:72px;text-align:center">${esc(t('nav.route.backup'))}</span></td>
    <td>${runCell}</td>
    <td class="faint">${t(RUN_TRIGGER_KEYS[run.trigger] || 'page.backup.triggerUnknown')}</td>
    <td>${scheduleCell}</td>
    <td>${statusCell}</td>
    <td class="faint">${esc(when)}</td>
    <td>${actionsCell}</td>
  </tr>`;
};

const historySblock = () => {
  const f = S.ui.backupHistoryFilter || { task: '', trigger: '', status: '', type: '', limit: 50, offset: 0 };
  const h = S.ui.backupHistoryAll;
  const tasks = Array.isArray(S.ui.backupTasks?.tasks) ? S.ui.backupTasks.tasks : [];
  const sel = (hook, cur, options) =>
    `<select class="input" data-in="${hook}">${options
      .map(([v, label]) => `<option value="${esc(String(v))}"${cur === String(v) ? ' selected' : ''}>${label}</option>`)
      .join('')}</select>`;
  const taskSel = sel(
    'backupHistoryTask',
    f.task,
    [['', t('page.backup.filterAll')], ['manual', t('page.backup.historyManualEntry')], ...tasks.map(x => [x.id, esc(x.name || x.id)])],
  );
  const triggerSel = sel('backupHistoryTrigger', f.trigger, [['', t('page.backup.filterAll')], ['manual', t('page.backup.triggerManual')], ['scheduled', t('page.backup.triggerScheduled')]]);
  const statusSel = sel('backupHistoryStatus', f.status, [['', t('page.backup.filterAll')], ...HISTORY_FILTER_STATUSES.map(s => [s, t(RUN_STATUS_KEYS[s])])]);
  /* UAT round-4: the Type filter (all / backup / restore) — labels reuse the
     existing nav.route.backup / page.restore.title wordings; no new key. */
  const typeSel = sel('backupHistoryType', f.type, [['', t('page.backup.filterAll')], ['backup', t('nav.route.backup')], ['restore', t('page.restore.title')]]);
  /* 94-02 (UAT-3): the unified sblock MERGES the restore history rows —
     client-only composition of two already-fetched payloads (S.ui.restoreHistory,
     kicked additively by the page fill loop). Restore rows render ALWAYS —
     the task/trigger/status filters apply to Backup rows only. Fail-closed
     principle intact: the restore payload is already server-scoped, fields
     render verbatim. */
  /* 94-03 (UAT-3b): "Rotated" is status 'deleted' (page.backup.statusDeleted) —
     the rotation-deleted rows are HIDDEN from the default render (fail-closed
     visibility) and surface only through the Rotated status-filter entry,
     which maps to that status so the owner can review them explicitly. */
  /* UAT round-4: the Type filter applies to BOTH sides — backup rows show on
     '' or 'backup', restore rows on '' or 'restore'; task/trigger/status
     stay backup-only. Rows render as a REAL TABLE (owner request) with
     column headers — historyTr / restoreRunTr. */
  const visibleRuns = !h || h.err ? [] : f.status === 'deleted' ? h.runs : h.runs.filter(r => r.status !== 'deleted');
  const restoreRuns = !h || h.err ? [] : Array.isArray(S.ui.restoreHistory?.runs) ? S.ui.restoreHistory.runs : [];
  const showBackup = f.type !== 'restore';
  const showRestore = f.type !== 'backup';
  const backupRows = showBackup ? visibleRuns.map(historyTr).join('') : '';
  const restoreRows = showRestore ? restoreRuns.map(restoreRunTr).join('') : '';
  const body = !h
    ? `<div class="faint" style="padding:8px 0" aria-busy="true">${t('page.backup.historyLoading')}</div>`
    : h.err
      ? `<div class="faint" style="padding:8px 0">${t('page.backup.historyUnavailable')}</div>`
      : backupRows || restoreRows
        ? `<div class="panel" style="overflow-x:auto"><table class="perm-t hist-t" style="min-width:820px"><thead><tr><th style="padding-left:14px">${t('page.backup.historyColType')}</th><th>${t('page.backup.colTask')}</th><th>${t('page.backup.filterTrigger')}</th><th>${t('page.backup.scheduleCol')}</th><th>${t('page.backup.filterStatus')}</th><th>${t('page.backup.historyDateCol')}</th><th></th></tr></thead><tbody>${backupRows}${restoreRows}</tbody></table></div>`
        : `<div class="faint" style="padding:8px 0">${t('page.backup.historyEmpty')}</div>`;
  return `<div id="backupHistorySblock" style="margin-top:16px">
    <div class="row" style="gap:8px;align-items:baseline">
      <h2 style="margin:0">${t('page.backup.historyTitle')}</h2>
      <span class="faint" style="font-size:12px">${t('page.backup.historyCap')}</span>
    </div>
    <div class="row" style="gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:8px">
      <div class="field"><label class="label">${t('page.backup.historyColType')}</label>${typeSel}</div>
      <div class="field"><label class="label">${t('page.backup.colTask')}</label>${taskSel}</div>
      <div class="field"><label class="label">${t('page.backup.filterTrigger')}</label>${triggerSel}</div>
      <div class="field"><label class="label">${t('page.backup.filterStatus')}</label>${statusSel}</div>
      <button class="btn btn-sm" data-a="backupHistoryPage" data-dir="-1"${Number(f.offset) <= 0 ? ' disabled' : ''}>${t('page.backup.historyPrev')}</button>
      <button class="btn btn-sm" data-a="backupHistoryPage" data-dir="1"${h && h.runs.length && h.hasMore ? '' : ' disabled'}>${t('page.backup.historyNext')}</button>
    </div>
    ${f.task === 'manual' ? `<div class="hint" style="margin-top:6px">${t('page.backup.historyManualHint')}</div>` : ''}
    <div style="margin-top:8px">${body}</div>
  </div>`;
};

/* =====================================================================
   Phase 94 (D-01, BKUI-01): the LAST-RUN BADGE — a client-side derivation
   over the FROZEN Phase-92 ?all=1 route (no server change, no payload
   change): at page load ONE fetch `api.backupRuns({ all: 1, limit: 50 })`
   (limit N = 50, the server's own default cap) lands, and the latest run
   per task_id is derived CLIENT-SIDE — the route sorts created_at DESC,
   id DESC (server.js, verified), so the FIRST occurrence of each task_id
   in the response is its newest run; the reduction keeps exactly that.
   The badge has 4 states (D-01): succeeded → green; running → neutral;
   failed (incl. upload_failed, a failed outcome) → red; succeeded with
   checksum_ok === 0 → amber "warning" (verified but integrity-flagged).
   After a manual "Run now" the same fetch re-issues (actions.js) so the
   badge re-derives from fresh payload. The badge is client-only chrome —
   no tasks-payload field was invented for it.
   ===================================================================== */
const lastRunBadge = task => {
  const run = S.ui.backupLastRuns?.[task.id];
  if (!run) return '<span class="faint">—</span>';
  if (run.status === 'succeeded') {
    const chk = run.checksum_ok == null ? null : Number(run.checksum_ok);
    return chk === 0
      ? `<span class="badge amber">${ic('triangle-alert', 12)}${esc(t('page.backup.checksumWarn'))}</span>`
      : `<span class="badge green">${t('page.backup.statusSucceeded')}</span>`;
  }
  if (run.status === 'running') return `<span class="badge">${t('page.backup.statusRunning')}</span>`;
  if (run.status === 'failed' || run.status === 'upload_failed') return `<span class="badge red">${t(RUN_STATUS_KEYS[run.status])}</span>`;
  return `<span class="badge">${t(RUN_STATUS_KEYS[run.status] || 'page.backup.statusUnknown')}</span>`;
};

/* Phase 94 (D-01, BKUI-01): the humanized schedule TEXT — derived ONLY from
   the server descriptor's fields (task.schedule, describeCron output) —
   the raw cron expression NEVER renders in the table (BKUI-01); the raw
   string appears only inside the D-02 custom fallback. This is text
   formatting, never cron evaluation (T-87-11). */
const scheduleText = task => {
  const s = task.schedule;
  if (!s || typeof s !== 'object') return t('page.backup.presetCustom');
  const hh = Number.isFinite(Number(s.hour)) ? String(Number(s.hour)).padStart(2, '0') : null;
  const mm = Number.isFinite(Number(s.minute)) ? String(Number(s.minute)).padStart(2, '0') : null;
  const time = hh !== null && mm !== null ? `${hh}:${mm}` : null;
  const dayName = dow => { try { return new Intl.DateTimeFormat(getLocale(), { weekday: 'long' }).format(new Date(2024, 0, 7 + Number(dow) % 7)); } catch { return dow; } };
  if (s.preset === 'daily' && time !== null) return t('page.backup.summaryDaily', { time: time });
  if (s.preset === 'weekly' && time !== null) return t('page.backup.summaryWeekly', { day: dayName(s.weekday), time: time });
  if (s.preset === 'monthly' && time !== null) return t('page.backup.summaryMonthly', { dom: s.dom, time: time });
  if (s.preset === 'yearly' && time !== null) return t('page.backup.summaryYearly', { dom: s.dom, time: time });
  return t('page.backup.presetCustom');
};

const taskTable = (tasks, manage) => {
  const actions = task =>
    `<span class="row" style="gap:8px;justify-content:flex-end;flex-wrap:wrap">
      <button class="btn btn-sm" data-a="backupTaskRunNow" data-id="${esc(task.id)}">${ic('play', 13)}${t('page.backup.taskRunNow')}</button>
      <button class="btn btn-sm" data-a="backupTaskEdit" data-id="${esc(task.id)}">${ic('pencil', 13)}${t('page.backup.taskEdit')}</button>
      <button class="btn btn-sm" data-a="backupTaskHistory" data-id="${esc(task.id)}">${ic('history', 13)}${t('page.backup.historyAction')}</button>
      <button class="btn btn-sm" data-a="backupTaskToggle" data-id="${esc(task.id)}">${task.enabled ? t('page.backup.taskDisable') : t('page.backup.taskEnable')}</button>
      <button class="btn btn-sm btn-danger" data-a="backupTaskDelete" data-id="${esc(task.id)}">${ic('trash', 13)}${t('page.backup.taskDelete')}</button>
    </span>`;
  const scopeCell = task => {
    const scope = task.scope && typeof task.scope === 'object' ? task.scope : {};
    const kind = scope.kind === 'project' ? t('page.backup.scopeProject') : scope.kind === 'workspace' ? t('page.backup.scopeWorkspace') : t('page.backup.scopeInstance');
    const name =
      scope.kind === 'project'
        ? (Array.isArray(S.data?.projects) ? S.data.projects : []).find(p => p?.id === scope.id)?.name || scope.id || ''
        : scope.kind === 'workspace'
          ? (scope.id === api.workspace?.id ? api.workspace?.name || scope.id : scope.id || '')
          : '';
    return name ? `<span class="faint">${esc(kind)} · ${esc(name)}</span>` : `<span class="faint">${esc(kind)}</span>`;
  };
  const row = task => {
    const nextRunMs = Number(task.next_run_at);
    /* 94-02 (UAT-2) + UAT round-3 fix: the Next-run cell renders date AND
       time from the raw ms TIMESTAMP — never via an ISO datetime string:
       the app's date parser (i18n parseDate) only understands YYYY-MM-DD
       strings, so a full ISO datetime silently formatted to ''. toDate()
       accepts ms numbers natively (fmtDate + formatTime). formatTime
       honours the user's 12h/24h clock preference (i18n.js). '—' fallback
       unchanged when next_run_at is null/invalid. */
    const nextRunTs = Number.isFinite(nextRunMs) && nextRunMs > 0 ? nextRunMs : null;
    const nextRun = nextRunTs ? `${fmtDate(nextRunTs)} ${formatTime(nextRunTs)}` : '—';
    return `<tr style="vertical-align:middle">
      <td style="padding-left:14px;text-align:left"><span class="row" style="gap:8px;align-items:center"><span class="trunc" style="display:inline-block;max-width:220px;vertical-align:bottom;font-weight:600">${esc(task.name)}</span><span class="badge ${task.enabled ? 'green' : ''}">${t(task.enabled ? 'page.backup.taskEnabled' : 'page.backup.taskDisabled')}</span></span></td>
      <td style="text-align:left">${scopeCell(task)}</td>
      <td style="text-align:left">${esc(scheduleText(task))}</td>
      <td class="faint" style="text-align:left">${esc(nextRun)}</td>
      <td style="text-align:left">${lastRunBadge(task)}</td>
      <td style="text-align:left">${manage ? actions(task) : ''}</td>
    </tr>`;
  };
  return `<div class="panel" style="overflow-x:auto;margin-top:12px"><table class="perm-t" style="min-width:860px"><thead><tr><th style="padding-left:14px;text-align:left">${t('page.backup.colTask')}</th><th style="text-align:left">${t('page.backup.colScope')}</th><th style="text-align:left">${t('page.backup.colSchedule')}</th><th style="text-align:left">${t('page.backup.nextRunLabel')}</th><th style="text-align:left">${t('page.backup.colLastRun')}</th><th></th></tr></thead><tbody>${tasks.map(row).join('')}</tbody></table></div>`;
};

/* Builder form (D-01): 4 presets — Daily, Weekly, Monthly — plus Custom,
   which reveals the five per-field dropdowns. The per-field selects are the
   ONLY schedule inputs; the form stages into S.ui.backupTaskForm (never the
   Custom per-field selects default to `*` so a Custom save always
   serializes a well-formed string; minute/hour offer `*` too (UAT 2026-11-22:
   the server cron grammar accepts star in every field — the dropdowns now
   expose it so every-minute/every-hour schedules are buildable; their
   DEFAULTS stay concrete 0/22 (94-02 UAT-4: the owner's 22:00 preference)
    so an accidental all-star save is a deliberate
   act, not a slip). */
const fieldSel = (form, name, labelKey, min, max, star, disabled) => {
  const cur = String(form.fields[name] ?? (star ? '*' : min));
  const opts = [];
  if (star) opts.push(`<option value="*"${cur === '*' ? ' selected' : ''}>*</option>`);
  for (let v = min; v <= max; v++) opts.push(`<option value="${v}"${cur === String(v) ? ' selected' : ''}>${String(v).padStart(2, '0')}</option>`);
  return `<select class="input" data-in="backupTaskField" data-f="${name}" aria-label="${t(labelKey)}"${disabled ? ' disabled' : ''}>${opts.join('')}</select>`;
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
      ${g.count > 0 && open ? `<div id="${detailId}" style="padding:4px 0 0 16px;max-height:220px;overflow-y:auto">${(g.runs || []).map(r => `<div class="mono trunc" style="max-width:340px" title="${esc(r.filename || '')}">${esc(r.filename || '')}</div>`).join('')}</div>` : ''}
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
      ${
        form.cronLocked
          ? `<div class="field"><label class="label">${t('page.backup.scheduleLabel')}</label><input class="input mono" value="${esc(form.customCron || '')}" readonly aria-readonly="true" style="max-width:220px"></div>`
          : `<div class="field"><label class="label">${t('page.backup.scheduleLabel')}</label><select class="input" data-in="backupTaskPreset"${form.editing && form.cronLocked ? ' disabled' : ''}>${presetOpt('daily', 'page.backup.presetDaily')}${presetOpt('weekly', 'page.backup.presetWeekly')}${presetOpt('monthly', 'page.backup.presetMonthly')}${presetOpt('custom', 'page.backup.presetCustom')}</select></div>`
      }
      <div class="field"><label class="label">${t('page.backup.fieldHour')}</label>${fieldSel(form, 'hour', 'page.backup.fieldHour', 0, 23, true, form.cronLocked)}</div>
      <div class="field"><label class="label">${t('page.backup.fieldMinute')}</label>${fieldSel(form, 'minute', 'page.backup.fieldMinute', 0, 59, true, form.cronLocked)}</div>
      ${show.dom && !form.cronLocked ? `<div class="field"><label class="label">${t('page.backup.fieldDayOfMonth')}</label>${fieldSel(form, 'dom', 'page.backup.fieldDayOfMonth', 1, 31, true)}</div>` : ''}
      ${show.mon && !form.cronLocked ? `<div class="field"><label class="label">${t('page.backup.fieldMonth')}</label>${fieldSel(form, 'mon', 'page.backup.fieldMonth', 1, 12, true)}</div>` : ''}
      ${show.dow && !form.cronLocked ? `<div class="field"><label class="label">${t('page.backup.fieldDayOfWeek')}</label>${fieldSel(form, 'dow', 'page.backup.fieldDayOfWeek', 0, 6, true)}</div>` : ''}
    </div>
    ${form.cronLocked ? `<div class="hint" style="margin-top:6px">${t('page.backup.customScheduleHint')}</div>` : ''}
    <div class="row" style="gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:8px">
      <div class="field" style="min-width:260px;max-width:340px"><label class="label">${t('page.backup.tzLabel')}</label>${tzCombobox(form.tz)}</div>
    </div>
    <div class="row" style="gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:8px">
      <div class="faint" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;align-self:flex-end;padding-bottom:7px">${t('page.backup.retentionLabel')}</div>
      <div class="field"><label class="label" style="text-align:center">${t('page.backup.gfsDaily')}</label><input class="input" type="number" min="0" max="999" style="width:90px" value="${esc(String(form.retention.daily))}" data-in="backupTaskRetention" data-f="daily"></div>
      <div class="field"><label class="label" style="text-align:center">${t('page.backup.gfsWeekly')}</label><input class="input" type="number" min="0" max="999" style="width:90px" value="${esc(String(form.retention.weekly))}" data-in="backupTaskRetention" data-f="weekly"></div>
      <div class="field"><label class="label" style="text-align:center">${t('page.backup.gfsMonthly')}</label><input class="input" type="number" min="0" max="999" style="width:90px" value="${esc(String(form.retention.monthly))}" data-in="backupTaskRetention" data-f="monthly"></div>
      <div class="field"><label class="label" style="text-align:center">${t('page.backup.gfsYearly')}</label><input class="input" type="number" min="0" max="999" style="width:90px" value="${esc(String(form.retention.yearly))}" data-in="backupTaskRetention" data-f="yearly"></div>
    </div>
    ${api.s3Enabled ? `<div class="row" style="gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px"><label style="display:flex;align-items:center;gap:8px"><input type="checkbox" data-in="backupTaskS3"${form.s3Enabled ? ' checked' : ''}><span>${esc(t('page.backup.s3Toggle'))}</span></label></div>` : ''}
    ${api.ftpEnabled ? `<div class="row" style="gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px"><label style="display:flex;align-items:center;gap:8px"><input type="checkbox" data-in="backupTaskFtp"${form.ftpEnabled ? ' checked' : ''}><span>${esc(t('page.backup.ftpToggle'))}</span></label></div>` : ''}
    ${api.smbEnabled ? `<div class="row" style="gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px"><label style="display:flex;align-items:center;gap:8px"><input type="checkbox" data-in="backupTaskSmb"${form.smbEnabled ? ' checked' : ''}><span>${esc(t('page.backup.smbToggle'))}</span></label></div>` : ''}
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
const RESTORE_LOCATION_KEYS = { local: 'page.restore.locLocal', s3: 'page.restore.locS3', ftp: 'page.restore.locFtp', smb: 'page.restore.locSmb', missing: 'page.restore.locMissing' };
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
   digest in title (historyRow idiom). The missing-location badge renders too —
   the restore attempt on it is refused keyed err.restoreArchiveMissing. */
/* UAT round-10 (owner ruling): the Restore SECTION (title + lead + history
   toggle + standalone history card) is retired — the Restore action lives
   entirely in the unified history table's rows. What remains: the live
   progress panel (a restore launched from a row must stay visible) and the
   preview drawer. */

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
  /* 95-05 (BKRST-05, D-02): BOTH CTAs for project archives — Overwrite arms
     only when a target workspace AND a target project are picked (payload-
     driven chips below). The server re-validates everything against the
     live doc; the client chrome never replaces that boundary. */
  if (kind === 'project' && flags?.canBackup && S.ui.restoreTarget && S.ui.restoreTargetProject)
    ctas.push(`<button class="btn btn-danger" data-a="restoreOverwrite" data-id="${esc(d.runId)}">${ic('pencil', 14)}${t('page.restore.overwriteCta')}</button>`);
  if (kind === 'instance' && api.user?.isInstanceAdmin)
    ctas.push(`<button class="btn btn-danger" data-a="restoreInstance" data-id="${esc(d.runId)}">${ic('hard-drive', 14)}${t('page.restore.restoreInstanceAction')}</button>`);
  /* D-89-23 workspace picker (project archives): live memberships verbatim,
     esc'd names, chosen target armed for the trigger — zero memberships
     render NO picker (the empty-dropdown shape is never rendered). */
  /* UAT round-8: the target list prefers the phase-92 scopes payload (every
     active workspace — the Super Admin without membership case), falling
     back to the memberships. Fail-closed: neither list renders a target the
     server gate would refuse — the trigger re-validates authority live. */
  const scopeTargets = Array.isArray(S.ui.backupScopes) && S.ui.backupScopes.length ? S.ui.backupScopes : memberships;
  /* UAT round-11 (owner): the picker must EXPLAIN itself — the selected
     target is the workspace that receives the restored project. The armed
     selection echoes its own line so the state is unmistakable. */
  const pickedName = scopeTargets.find(w => w.id === S.ui.restoreTarget)?.name;
  const picker =
    kind === 'project' && scopeTargets.length
      ? `<div style="margin-top:12px"><div class="label" style="margin-bottom:4px">${t('page.restore.targetPickLabel')}</div><div class="hint" style="margin:0 0 8px">${t('page.restore.targetPickHint')}</div><div class="row" style="gap:6px;flex-wrap:wrap">${scopeTargets
          .map(
            w =>
              `<button class="btn btn-sm${S.ui.restoreTarget === w.id ? ' btn-primary' : ''}" data-a="restoreTargetPick" data-id="${esc(w.id)}" title="${esc(w.name)}"><span class="trunc" style="max-width:180px">${esc(w.name)}</span></button>`,
          )
          .join('')}</div>${pickedName ? `<div class="hint" style="margin:6px 0 0">${t('page.restore.targetArmed', { name: esc(pickedName) })}</div>` : ''}</div>`
      : '';
  /* 95-05 (D-02): second picker level — projects of the CHOSEN workspace,
     read from the same scopes payload (S.ui.backupScopes[].projects). Same
     chip idiom/classes as the workspace row; picking arms
     S.ui.restoreTargetProject. A workspace without projects (or the
     memberships fallback, which carries none) renders NO row — fail-closed. */
  const pickedWsProjects = Array.isArray(scopeTargets.find(w => w.id === S.ui.restoreTarget)?.projects)
    ? scopeTargets.find(w => w.id === S.ui.restoreTarget).projects
    : [];
  const projectPicker =
    kind === 'project' && S.ui.restoreTarget && pickedWsProjects.length
      ? `<div style="margin-top:12px"><div class="label" style="margin-bottom:4px">${t('page.restore.projectPickLabel')}</div><div class="hint" style="margin:0 0 8px">${t('page.restore.projectPickHint')}</div><div class="row" style="gap:6px;flex-wrap:wrap">${pickedWsProjects
          .map(
            p =>
              `<button class="btn btn-sm${S.ui.restoreTargetProject === p.id ? ' btn-primary' : ''}" data-a="restoreProjectPick" data-id="${esc(p.id)}" title="${esc(p.name)}"><span class="trunc" style="max-width:180px">${esc(p.name)}</span></button>`,
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
    ${projectPicker}
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

/* UAT round-4/10: the unified sblock renders restore history as table rows
   under the same Type/Run/Trigger/Schedule/Status/Date headers. Run =
   final_name (verbatim, esc'd — the server owns the restore-name counter,
   D-89-13) with the skipped tables report and the expandable error kept
   inside the Run cell; Trigger is an honest '—' (restores are always
   operator-triggered). */
const restoreRunTr = run => {
  const errOpen = S.ui.restoreRunErrOpen?.has(run.id);
  const startedMs = Number(run.started_at);
  const when = Number.isFinite(startedMs) && startedMs > 0 ? fmtDate(startedMs) : '—';
  let skipped = [];
  try {
    const s = typeof run.summary === 'string' && run.summary ? JSON.parse(run.summary) : null;
    skipped = Array.isArray(s?.skipped) ? s.skipped : [];
  } catch {
    skipped = [];
  }
  const runCell = `<span class="faint trunc" style="display:inline-block;max-width:280px" title="${esc(String(run.final_name || ''))}">${esc(String(run.final_name || ''))}</span>${
    skipped.length
      ? `<div class="faint" style="margin-top:2px;font-size:12px;max-width:420px;white-space:normal;line-height:1.5">${t('page.restore.skipReportLabel')}: ${esc(skipped.map(s => String(s?.table || '')).filter(Boolean).join(', '))}</div>`
      : ''
  }${
    run.error
      ? `<div style="margin-top:4px"><a href="#" data-a="restoreRunErr" data-id="${esc(run.id)}">${t('page.restore.errorToggle')}</a>${
          errOpen ? `<div class="mono" style="margin-top:4px;font-size:12px;white-space:pre-wrap">${esc(run.error)}</div>` : ''
        }</div>`
      : ''
  }`;
  return `<tr>
    <td style="padding-left:14px"><span class="badge" title="${esc(t('page.backup.historyColType'))}" style="min-width:72px;text-align:center">${esc(t('page.restore.title'))}</span></td>
    <td>${runCell}</td>
    <td class="faint">—</td>
    <td><span class="faint">—</span></td>
    <td><span class="badge ${run.status === 'done' ? 'green' : ''}">${RESTORE_STAGE_KEYS[run.stage] ? t(RESTORE_STAGE_KEYS[run.stage]) : esc(String(run.stage || '—'))}</span></td>
    <td class="faint">${esc(when)}</td>
    <td></td>
  </tr>`;
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
  if (loading && !S.ui.backupErr) {
    refreshBackupTasks();
    refreshBackupScopes(); // XWS-01 (D-11): the Run-now workspace picker's scopes input
  }
  if (loading)
    return `<div class="page wide"><div class="ph"><div><h1>${t('nav.route.backup')}</h1><p>${t('page.backup.subtitle')}</p></div></div><div class="panel" style="margin-top:16px"><div class="panel-b faint" aria-busy="true">${t('page.governance.loading')}</div></div></div>`;

  /* D-23/D-24: the capability flags ride the payload — rendered verbatim as
     chrome, never recomputed client-side. Honest flags: a missing flag reads
     false (fail-closed), never a client-side guess. */
  const flags = S.ui.backupTasks || { tasks: [], canBackup: false, canRestore: false };
  const tasks = Array.isArray(flags.tasks) ? flags.tasks : [];
  /* 89-06: the restore list fill — one loop, payload-flag gated (D-22:
     the section and its fetches exist only for RESTORE_USE holders). */
  /* 94-02 (UAT-3): the unified sblock merges the restore rows — one additive
     fill-loop kick fetches S.ui.restoreHistory when absent (no route change,
     no recompute; the payload is server-scoped). */
  if (flags.canRestore && !S.ui.restoreHistory && !S.ui.restoreHistoryFetching) refreshRestoreHistory();
  /* Phase 94 (D-04): the unified history sblock's lazy fetch — the in-render
     kick covers first open (same governance fill-loop pattern); the fetch
     itself stages S.ui.backupHistoryAll so this kick fires exactly once. */
  if (flags.canBackup || flags.canRestore) {
    if (!S.ui.backupHistoryAll && !S.ui.backupHistoryFetching) refreshBackupHistory();
  }
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
    ? taskTable(tasks, flags.canBackup)
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
    ${body}
    ${historySblock()}
    ${flags.canRestore ? restoreProgress() : ''}
    ${flags.canRestore ? restorePreviewDrawer(flags) : ''}
  </div>`;
}
