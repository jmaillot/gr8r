/* ---------- subtask detail view (inside the task drawer) ---------- */
import { TODAY, diffD, esc, parse, relDate } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { ic } from '../core/icons.js';
import { S, mem } from '../core/store.js';
import { av, avStack } from '../ui/helpers.js';
import { orderedSiblings } from '../core/subtree.js';

export function subtaskHtml(task, s) {
  const i = task.subtasks.indexOf(s);
  return `<div class="subview">
    <button class="pillbtn" data-a="closeSub" style="margin:-4px 0 14px -7px;font-size:12.5px;color:var(--text-2)">${ic('arrow-left', 14)}<span class="trunc" style="max-width:420px">${esc(task.title)}</span></button>
    <div class="row" style="gap:10px;align-items:flex-start">
      <input type="checkbox" class="check round" style="margin-top:9px" ${s.done ? 'checked' : ''} data-a="toggleSub" data-id="${task.id}" data-sid="${s.id}" aria-label="${s.done ? t('a11y.subtaskMarkNotDone') : t('a11y.subtaskMarkDone')}">
      <textarea class="ttl-edit" id="s-title" rows="1" data-autosize data-blur="commitSubTitle" data-key-enter="blur" data-id="${task.id}" data-sid="${s.id}" aria-label="${t('a11y.subtaskTitle')}" style="${s.done ? 'text-decoration:line-through;color:var(--text-3)' : ''}">${esc(s.title)}</textarea>
    </div>
    <div class="faint" style="font-size:12px;margin:4px 0 0 26px">${t('page.subtask.progress', { i: i + 1, n: task.subtasks.length })} · ${s.done ? t('page.subtask.done') : t('page.subtask.open')}</div>
    <dl class="kv" style="margin-top:16px">
      <dt>${ic('user', 14)}${t('page.field.assignee')}</dt><dd><button class="pillbtn ${(s.assignees || []).length ? '' : 'empty'}" data-a="pop" data-pop="subassignee" data-id="${task.id}" data-i="${i}">${(s.assignees || []).length ? avStack(s.assignees, 3, 'sm') : av(null, 'sm', false)}<span>${(s.assignees || []).length ? esc(`${mem(s.assignees[0])?.name || ''}${s.assignees.length > 1 ? ` +${s.assignees.length - 1}` : ''}`) : t('common.unassigned')}</span></button></dd>
      <dt>${ic('calendar', 14)}${t('page.field.due')}</dt><dd><button class="pillbtn ${s.due ? '' : 'empty'}" data-a="pop" data-pop="date" data-field="subdue" data-id="${task.id}" data-i="${i}" ${!s.due && task.due ? `title="${esc(t('page.subtask.inheritedDue'))}"` : ''}>${ic('calendar', 13)}<span class="num">${s.due ? relDate(s.due) : task.due ? relDate(task.due) : t('common.setDate')}</span></button></dd>
      <dt>${ic('calendar-arrow-up', 14)}${t('page.sort.start')}</dt><dd><button class="pillbtn ${s.start ? '' : 'empty'}" data-a="pop" data-pop="date" data-field="substart" data-id="${task.id}" data-i="${i}" ${!s.start && task.start ? `title="${esc(t('page.subtask.inheritedStart'))}"` : ''}>${ic('calendar', 13)}<span class="num">${s.start ? relDate(s.start) : task.start ? relDate(task.start) : t('common.setDate')}</span></button></dd>
      <dt>${ic('folder', 14)}${t('page.subtask.parent')}</dt><dd><button class="pillbtn" data-a="closeSub"><span class="mono faint" style="font-size:11px">${task.key}</span>${esc(task.title)}</button></dd>
    </dl>
    <div class="dsec"><div class="dsec-h"><h3 id="s-note-l">${t('page.subtask.notes')}</h3></div>
      <textarea class="textarea" id="s-note" data-in="subNote" data-id="${task.id}" data-sid="${s.id}" rows="4" placeholder="${t('a11y.subtaskNotesPlaceholder')}" aria-labelledby="s-note-l">${esc(s.note || '')}</textarea></div>
    <div class="dsec row" style="gap:6px;flex-wrap:wrap">
      <button class="btn btn-secondary btn-sm" data-a="promoteSub" data-id="${task.id}" data-sid="${s.id}">${ic('arrow-up-right', 13)}${t('act.convertToTask')}</button>
      <span class="sp"></span>
      <button class="btn btn-sm btn-ghost" data-a="subNav" data-id="${task.id}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="${t('a11y.subtaskPrev')}">${ic('chevron-left', 14)}${t('common.previous')}</button>
      <button class="btn btn-sm btn-ghost" data-a="subNav" data-id="${task.id}" data-d="1" ${i === task.subtasks.length - 1 ? 'disabled' : ''} aria-label="${t('a11y.subtaskNext')}">${t('common.next')}${ic('chevron-right', 14)}</button>
      <button class="btn btn-sm btn-danger-ghost" data-a="rmSub" data-id="${task.id}" data-sid="${s.id}">${ic('trash-2', 13)}${t('act.delete')}</button>
    </div>
  </div>`;
}

/* =====================================================================
   Phase 65 (65-03): the ONE recursive subtask-tree renderer — the drawer
   checklist and the board card popover (D-11) share the exact same row
   shape. Ordering is subtree.orderedSiblings alone — no per-surface
   ordering logic (D-03). Collapse state is the session-only
   S.ui.subOpenNodes map (D-10), keyed by subtask id, never persisted.
   opt.fxc — the caller's flash-effect tagger (drawer passes shell/render's
   fxc; the board popover omits it) — is injected rather than imported so
   this module never reaches the render cycle.
   ===================================================================== */
export function subTreeChecklistHtml(t, opt = {}) {
  const fx = opt.fxc || (() => '');
  const openMap = S.ui.subOpenNodes || {};
  const walk = (parentId, depth) =>
    orderedSiblings(t.subtasks, parentId)
      .map(s => {
        const kids = orderedSiblings(t.subtasks, s.id);
        const open = !!openMap[s.id];
        const indent = depth ? `margin-left:${depth * 18}px;` : '';
        const caret = kids.length
          ? `<button class="ibtn ibtn-xs" data-a="toggleSubNode" data-id="${t.id}" data-sid="${s.id}" aria-expanded="${open}" aria-label="${open ? t('a11y.collapseSubtasks') : t('a11y.expandSubtasks')}" tabindex="-1">${ic(open ? 'chevron-down' : 'chevron-right', 13)}</button>`
          : '';
        const due = s.due || t.due;
        const st = s.start || t.start;
        const head =
          `${caret}<input type="checkbox" class="check" ${s.done ? 'checked' : ''} data-a="toggleSub" data-id="${t.id}" data-sid="${s.id}" aria-label="${s.done ? t('a11y.subtaskReopen', { title: esc(s.title) }) : t('a11y.subtaskComplete', { title: esc(s.title) })}"><button class="s" data-a="openSub" data-id="${t.id}" data-sid="${s.id}">${esc(s.title)}</button>` +
          (opt.compact
            ? ''
            : `${due ? `<span class="due ${!s.done && diffD(parse(due), TODAY) < 0 ? 'over' : ''}" ${s.due ? '' : `data-tip="${esc(t('page.subtask.inheritedDue'))}"`}>${ic('calendar', 12)}${relDate(due)}</span>` : ''}${st ? `<span class="due" ${s.start ? '' : `data-tip="${esc(t('page.subtask.inheritedStart'))}"`}>${ic('calendar-arrow-up', 12)}${relDate(st)}</span>` : ''}${(s.assignees || []).length ? avStack(s.assignees, 3, 'sm') : ''}<button class="ibtn ibtn-xs x" data-a="openSub" data-id="${t.id}" data-sid="${s.id}" aria-label="${t('a11y.openSubtaskDetails')}" tabindex="-1">${ic('chevron-right', 14)}</button>`);
        return (
          `<div class="subt ${s.done ? 'done' : ''}${fx('added', s.id)}${fx('done', s.id)}" data-ctx="sub" data-id="${t.id}" data-sid="${s.id}" style="${indent}">${head}</div>` +
          (kids.length && open ? walk(s.id, depth + 1) : '')
        );
      })
      .join('');
  return walk(null, 0);
}
