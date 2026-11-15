/* ---------- the shared recursive subtask-tree renderer (65-03) ---------- */
/* The ONE recursive renderer for the subtask tree: the drawer checklist, the
   list/table subrows and the board card popover (D-11) all render through it.
   Ordering is subtree.orderedSiblings alone — no per-surface ordering logic
   (D-03). Collapse state is the session-only S.ui.subOpenNodes map (D-10),
   keyed by subtask id, never persisted. The subtask DETAIL view lives in
   subtask-detail.js (65-03 chunk-gate remedy, 61-02 precedent — drawer.js
   pre-warms it with a dynamic import). */
import { TODAY, diffD, esc, parse, relDate } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { ic } from '../core/icons.js';
import { S } from '../core/store.js';
import { avStack } from '../ui/helpers.js';
import { orderedSiblings } from '../core/subtree.js';

/* opt.compact — checkbox + title row only (list subrows, board popover);
   default is the full drawer row (dates, assignees, open button).
   opt.rowClass — the row's CSS class (drawer "subt", list "subrow").
   opt.fxc — the caller's flash-effect tagger (drawer passes shell/render's
   fxc; the other surfaces omit it) — injected rather than imported so this
   module never reaches the render cycle. Every row keeps the
   data-a/data-id/data-sid event-delegation contract; rows also reserve the
   65-04 per-subtask context-menu surface (data-ctx="sub"). */
export function subTreeChecklistHtml(t, opt = {}) {
  const fx = opt.fxc || (() => '');
  const cls = opt.rowClass || 'subt';
  const openMap = S.ui.subOpenNodes || {};
  const walk = (parentId, depth) =>
    orderedSiblings(t.subtasks, parentId)
      .map(s => {
        const kids = orderedSiblings(t.subtasks, s.id);
        const open = !!openMap[s.id];
        const tid = t.id;
        const sid = s.id;
        const indent = depth ? `padding-left:${depth * 16}px;` : '';
        const caret = kids.length
          ? `<span class="ibtn ibtn-xs" data-a="toggleSubNode" data-id="${tid}" data-sid="${sid}" aria-expanded="${open}" aria-label="${t(open ? 'a11y.collapseSubtasks' : 'a11y.expandSubtasks')}">${ic(open ? 'chevron-down' : 'chevron-right', 13)}</span>`
          : '<span style="width:22px;flex-shrink:0"></span>';
        const due = s.due || t.due;
        const st = s.start || t.start;
        const et = esc(s.title);
        const head =
          `${caret}<input type="checkbox" class="check" ${s.done ? 'checked' : ''} data-a="toggleSub" data-id="${tid}" data-sid="${sid}" aria-label="${s.done ? t('a11y.subtaskReopen', { title: et }) : t('a11y.subtaskComplete', { title: et })}"><button class="s" data-a="openSub" data-id="${tid}" data-sid="${sid}">${et}</button>` +
          (opt.compact
            ? ''
            : `${due ? `<span class="due ${!s.done && diffD(parse(due), TODAY) < 0 ? 'over' : ''}"${s.due ? '' : ` data-tip="${esc(t('page.subtask.inheritedDue'))}"`}>${ic('calendar', 12)}${relDate(due)}</span>` : ''}${st ? `<span class="due"${s.start ? '' : ` data-tip="${esc(t('page.subtask.inheritedStart'))}"`}>${ic('calendar-arrow-up', 12)}${relDate(st)}</span>` : ''}${(s.assignees || []).length ? avStack(s.assignees, 3, 'sm') : ''}<button class="ibtn ibtn-xs x" data-a="openSub" data-id="${tid}" data-sid="${sid}" aria-label="${t('a11y.openSubtaskDetails')}" tabindex="-1">${ic('chevron-right', 14)}</button>`);
        return (
          `<div class="${cls} ${s.done ? 'done' : ''}${fx('added', sid)}${fx('done', sid)}" data-ctx="sub" data-id="${tid}" data-sid="${sid}" style="${indent}">${head}</div>` +
          (kids.length && open ? walk(sid, depth + 1) : '')
        );
      })
      .join('');
  return walk(null, 0);
}
