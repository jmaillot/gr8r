/* =====================================================================
   BACKUP (85-02, D-20/D-21/D-22/D-26/D-27)
   The gated top-level Backup surface: ONE shared page for Backup
   Operators, Restore Operators and Super Admins (D-22 — role
   differences surface as gated actions inside, never as two nav
   entries). Real task content arrives with Phases 86/87 — today the
   page renders the D-20 empty state ("backup isn't configured yet")
   from the GET /api/backup/tasks payload.
   =====================================================================
   The page renders ONLY from the GET /api/backup/tasks response and
   its capability flags (D-23/T-85-06 doctrine: payload flags are
   verbatim chrome decisions — the client never derives roles). One
   fill loop lives in actions.js (refreshBackupTasks, governance fill
   pattern); NO auto-poll — a low-frequency surface (D-27). A
   non-holder deep-linking the route gets the server's keyed 403
   surfaced as a fullstate with the role refusal (D-26:
   err.backupRoleRequired — a ROLE gate, not err.operatorOnly) — never
   a blank page, never a client-side guess. All payload strings render
   through esc() — text nodes only, no raw interpolation (T-79-10). */
import { ic } from '../core/icons.js';
import { S } from '../core/store.js';
import { t } from '../core/i18n.js';
import { empty } from '../ui/helpers.js';
import { refreshBackupTasks } from '../actions/actions.js';

/* Verbatim governance.js fullstate shapes: 403 → lock glyph + err.code403 +
   route name + keyed ROLE body + home way out; other fetch errors →
   cloud-alert + retry (explicit, never auto re-kicked while the error state
   is set — CR-01). */
const full403 = () =>
  `<div class="fullstate"><div class="box"><div class="empty-state" style="padding:0"><div class="glyph">${ic('lock', 20)}</div></div><span class="code">${t('err.code403')}</span><h1>${t('nav.route.backup')}</h1><p>${t('err.backupRoleRequired')}</p><div class="row"><button class="btn btn-primary" data-a="go" data-r="home">${t('nav.goHome')}</button></div></div></div>`;
const fullErr = () =>
  `<div class="fullstate"><div class="box"><div class="empty-state err" style="padding:0"><div class="glyph">${ic('cloud-alert', 20)}</div></div><h1>${t('page.somethingWrong')}</h1><p>${t('page.loadFailedBody')}</p><div class="row"><button class="btn btn-primary" data-a="backupRetry">${ic('refresh-cw', 14)}${t('page.tryAgain')}</button></div></div></div>`;

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
  /* Real task content arrives with Phases 86/87 — today the D-20 empty state
     IS the page body. canBackup/canRestore-aware action slots render inside
     the task list once tasks exist (render-only role gating, D-22). */
  const body = tasks.length
    ? `<div class="panel-b faint">${t('page.governance.loading')}</div>`
    : empty('hard-drive', t('page.backup.emptyTitle'), t('page.backup.emptyBody'), '', 'sm', 3);

  return `<div class="page wide">
    <div class="ph"><div><h1>${t('nav.route.backup')}</h1><p>${t('page.backup.subtitle')}</p></div></div>
    <div class="row" style="gap:8px;margin-top:8px">${flags.canBackup ? `<span class="badge green">${t('page.backup.flagBackup')}</span>` : ''}${flags.canRestore ? `<span class="badge">${t('page.backup.flagRestore')}</span>` : ''}${!flags.canBackup && !flags.canRestore ? '<span class="badge">—</span>' : ''}</div>
    <div class="panel" style="margin-top:12px">${body}</div>
  </div>`;
}
