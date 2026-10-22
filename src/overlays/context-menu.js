/* ---------------- CONTEXT MENUS ---------------- */
import { ic } from '../core/icons.js';
import { ST } from '../core/constants.js';
import { D, mem, me, proj, task, visibleProjects, isMemberAdmin } from '../core/store.js';
/* ctxMenu's task variable is named t, so the catalogue lookup is imported under an alias. */
import { t as tMsg } from '../core/i18n.js';

/* The menu item's action key and icon name are machine identifiers (D-08) and stay
   literal strings; the label is the display text the user reads and reads the catalogue. */
export function ctxMenu(p) {
  const I = (act, icon, label, extra = '', r = '') =>
    `<button class="mi ${extra}" data-a="${act}" data-id="${p.id}" data-key="${p.key || ''}">${ic(icon, 15)}${label}${r ? `<span class="r">${r}</span>` : ''}</button>`;
  const sep = '<div class="msep"></div>';
  if (p.ctx === 'task') {
    const t = task(p.id);
    if (!t) return '';
    return (
      I('openTask', 'panel-right-open', tMsg('toast.open')) +
      I('editTask', 'pencil', tMsg('act.edit'), '', 'E') +
      I('toggleDone', t.status === 'done' ? 'rotate-ccw' : 'circle-check', t.status === 'done' ? tMsg('act.reopen') : tMsg('act.markComplete')) +
      sep +
      I('ctxStatus', 'circle-dot', tMsg('act.statusMenu')) +
      I('ctxAssign', 'user', tMsg('act.assignTo')) +
      I('ctxPrio', 'signal-high', tMsg('act.priorityMenu')) +
      I('ctxMove', 'folder-input', tMsg('act.moveToProject')) +
      sep +
      I('toggleFavTask', 'star', t.fav ? tMsg('act.removeFromFavorites') : tMsg('act.addToFavorites')) +
      I('copyLink', 'link', tMsg('act.copyLink')) +
      I('dupTask', 'copy', tMsg('act.duplicate')) +
      I('archiveTask', 'archive', tMsg('act.archive')) +
      sep +
      I('delTask', 'trash-2', tMsg('act.delete'), 'danger', 'Del')
    );
  }
  if (p.ctx === 'project') {
    const pr = proj(p.id);
    if (!pr) return '';
    return (
      I('openProject', 'arrow-up-right', tMsg('toast.open')) +
      I('toggleFavProj', 'star', pr.fav ? tMsg('act.removeFromFavorites') : tMsg('act.addToFavorites')) +
      I('editProject', 'pencil', tMsg('act.renameEdit')) +
      I('share', 'share-2', tMsg('act.share')) +
      I('copyLink', 'link', tMsg('act.copyLink')) +
      I('dupProject', 'copy', tMsg('act.duplicate')) +
      sep +
      (visibleProjects().indexOf(pr) > 0 ? I('projUp', 'arrow-up', tMsg('act.moveUpSidebar')) : '') +
      (visibleProjects().indexOf(pr) < visibleProjects().length - 1 ? I('projDown', 'arrow-down', tMsg('act.moveDownSidebar')) : '') +
      sep +
      I('archiveProject', 'archive', pr.status === 'complete' ? tMsg('act.archive') : tMsg('act.archiveProject')) +
      I('delProject', 'trash-2', tMsg('act.deleteProject'), 'danger')
    );
  }
  if (p.ctx === 'column') {
    return (
      `<div class="mh">${ST[p.id].name}</div>` +
      I('colAdd', 'plus', tMsg('act.addTask')) +
      I('colCollapse', 'fold-horizontal', tMsg('act.collapseColumn')) +
      (p.id !== 'done' ? I('colDoneAll', 'check-check', tMsg('act.markAllDone')) : I('colArchive', 'archive', tMsg('act.archiveCompleted'))) +
      I('colSortPrio', 'arrow-down-wide-narrow', tMsg('act.sortByPriority'))
    );
  }
  if (p.ctx === 'member') {
    const m = mem(p.id);
    if (!m) return '';
    const canRm = isMemberAdmin() && m.id !== D().me && (me()?.role === 'Owner' || (m.role !== 'Owner' && m.role !== 'Admin'));
    return (
      I('viewProfile', 'user', tMsg('act.viewProfile')) +
      I('assignToMember', 'plus', tMsg('act.assignTask')) +
      I('copyEmail', 'mail', tMsg('act.copyEmail')) +
      (canRm
        ? I('ctxRole', 'shield', tMsg('act.changeRole')) +
          (m.status === 'invited' ? I('resendInvite', 'send', tMsg('act.resendInvite')) : '') +
          sep +
          I('removeMember', 'user-minus', tMsg('act.removeFromWorkspace'), 'danger')
        : '')
    );
  }
  if (p.ctx === 'file') {
    return (
      I('previewFile', 'eye', tMsg('act.preview')) +
      I('renameFile', 'pencil', tMsg('act.rename')) +
      I('copyLink', 'link', tMsg('act.copyLink')) +
      I('dupFile', 'copy', tMsg('act.duplicate')) +
      sep +
      I('delFile', 'trash-2', tMsg('act.delete'), 'danger')
    );
  }
  if (p.ctx === 'savedview') {
    return `<button class="mi" data-a="renameView" data-id="${p.vid}">${ic('pencil', 15)}${tMsg('act.renameView')}</button><button class="mi danger" data-a="delView" data-id="${p.vid}">${ic('trash-2', 15)}${tMsg('act.deleteView')}</button>`;
  }
  return '';
}
