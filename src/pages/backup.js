/* =====================================================================
   BACKUP (85-02, D-20/D-21/D-22/D-26/D-27 · 86-02, D-07/D-09/D-10)
   The gated top-level Backup surface: ONE shared page for Backup
   Operators, Restore Operators and Super Admins (D-22 — role
   differences surface as gated actions inside, never as two nav
   entries). 86-02 replaces the D-20 empty state with the Run now card
   (scope picker) + live stage progress driven ONLY by the
   /api/backup/runs/current payload (D-09) — no download action exists
   in v1 (Phase 90 owns the download tier).
   =====================================================================
   The page renders ONLY from the GET /api/backup/tasks response, its
   capability flags, and the GET /api/backup/runs/current payload (D-23/
   T-85-06 doctrine: payload flags are verbatim chrome decisions — the
   client never derives roles, and the run stage is rendered verbatim,
   never derived client-side). One fill loop lives in actions.js
   (refreshBackupTasks); the run poll loop (backupPollTick) runs only
   while a run is active (D-07). A non-holder deep-linking the route
   gets the server's keyed 403 surfaced as a fullstate with the role
   refusal (D-26: err.backupRoleRequired — a ROLE gate, not
   err.operatorOnly) — never a blank page, never a client-side guess.
   All payload strings render through esc() — text nodes only, no raw
   interpolation (T-79-10). */
import { ic } from '../core/icons.js';
import { api } from '../core/api.js';
import { S } from '../core/store.js';
import { t } from '../core/i18n.js';
import { esc } from '../core/utils.js';
import { empty } from '../ui/helpers.js';
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
  if (S.ui.backupPending && !S.ui.backupRun) return `<div class="panel" style="margin-top:12px"><div class="panel-b faint" aria-busy="true">${t('page.backup.pending')}</div></div>`;
  const run = S.ui.backupRun;
  if (!run || run.stage === 'idle') return '';
  let detail = '';
  if (run.stage === 'done') {
    detail = `<div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap"><span class="faint">${t('page.backup.archiveLabel')}</span><span class="mono">${esc(run.filename || '')}</span><span class="faint mono trunc" style="display:inline-block;max-width:360px" title="${esc(run.sha256 || '')}">${esc(run.sha256 || '')}</span></div>`;
  } else if (run.stage === 'failed') {
    detail = `<p class="faint" style="margin:8px 0 0">${t('page.backup.runFailed')}</p>`;
  }
  return `<div class="panel" style="margin-top:12px"><div class="panel-b">
    <div class="row" style="gap:8px;align-items:center"><span class="badge">${esc(run.stage)}</span><span class="faint">${t('page.backup.stageLabel')}</span></div>
    ${detail}
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
  /* The task list stays the Phase 87 surface — today the D-20 honest empty
     list renders beside the 86-02 Run now card (D-09). */
  const body = tasks.length
    ? `<div class="panel-b faint">${t('page.governance.loading')}</div>`
    : empty('hard-drive', t('page.backup.emptyTitle'), t('page.backup.emptyBody'), '', 'sm', 3);

  return `<div class="page wide">
    <div class="ph"><div><h1>${t('nav.route.backup')}</h1><p>${t('page.backup.subtitle')}</p></div></div>
    <div class="row" style="gap:8px;margin-top:8px">${flags.canBackup ? `<span class="badge green">${t('page.backup.flagBackup')}</span>` : ''}${flags.canRestore ? `<span class="badge">${t('page.backup.flagRestore')}</span>` : ''}${!flags.canBackup && !flags.canRestore ? '<span class="badge">—</span>' : ''}</div>
    ${flags.canBackup ? runNowCard(flags) : ''}
    ${flags.canBackup ? runProgress() : ''}
    <div class="panel" style="margin-top:12px">${body}</div>
  </div>`;
}
