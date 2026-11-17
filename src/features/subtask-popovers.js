/* ---------- subtask lazy chunk (65-04) ----------
   Home of the recursive subtask-tree renderer's BYTES plus the two subtask
   popovers, split out of the entry chunk by the 500 kB gate (61-02/65-03
   remedy precedent). popovers.js pre-warms this chunk at boot and renders
   its two cases through the `subPop` registry; drawer.js and task-list.js
   reach the renderer through the `treeChecklist` registry in
   features/subtasks.js — populated here before any surface can render a
   tree (the parent modules pre-warm at boot).

   The renderer (65-03): the ONE recursive renderer for the subtask tree —
   drawer checklist, list/table subrows, board card popover (D-11). Ordering
   is subtree.orderedSiblings alone — no per-surface ordering logic (D-03).
   Collapse state is the session-only S.ui.subOpenNodes map (D-10), keyed by
   subtask id, never persisted. Every row keeps the data-a/data-id/data-sid
   event-delegation contract; rows also carry the per-subtask context-menu
   surface (data-ctx="sub", 65-04).
   case 'subs' — the board card's checklist, the same recursive row shape in
   the existing popover pattern; no per-subtask kanban cards.
   case 'subParent' — the one-level re-parent picker (65-04, D-09). Targets
   are the subtask's siblings excluding itself (a deterministic one-level
   set — a sibling parent cannot cycle); depth legality is still
   validateMove's call in the action. Picker items keep data-a="reparentSubTo"
   with the target id on data-v; the moved subtask comes from the popover's
   sid. */
import { TODAY, diffD, esc, parse, relDate } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { ic } from '../core/icons.js';
import { S, task } from '../core/store.js';
import { avStack, prPill, stPill } from '../ui/helpers.js';
import { orderedSiblings } from '../core/subtree.js';
import { popList, subPop } from '../overlays/popovers.js';
import { treeChecklist } from './subtasks.js';

export function subTreeChecklistHtml(task0, opt = {}) {
  const fx = opt.fxc || (() => '');
  const cls = opt.rowClass || 'subt';
  const openMap = S.ui.subOpenNodes || {};
  const walk = (parentId, depth) =>
    orderedSiblings(task0.subtasks, parentId)
      .map(s => {
        const kids = orderedSiblings(task0.subtasks, s.id);
        const open = !!openMap[s.id];
        const tid = task0.id;
        const sid = s.id;
        const indent = `--ind:${depth * 16}px;`;
        const caret = kids.length
          ? `<span class="ibtn ibtn-xs" data-a="toggleSubNode" data-id="${tid}" data-sid="${sid}" aria-expanded="${open}" aria-label="${t(open ? 'a11y.collapseSubtasks' : 'a11y.expandSubtasks')}">${ic(open ? 'chevron-down' : 'chevron-right', 13)}</span>`
          : '<span style="width:22px;flex-shrink:0"></span>';
        const due = s.due || task0.due;
        const st = s.start || task0.start;
        const et = esc(s.title);
        const head =
          `${caret}<input type="checkbox" class="check" ${s.done ? 'checked' : ''} data-a="toggleSub" data-id="${tid}" data-sid="${sid}" aria-label="${s.done ? t('a11y.subtaskReopen', { title: et }) : t('a11y.subtaskComplete', { title: et })}"><button class="s" data-a="openSub" data-id="${tid}" data-sid="${sid}">${et}</button>` +
          (opt.compact
            ? ''
            : `${due ? `<span class="due ${!s.done && diffD(parse(due), TODAY) < 0 ? 'over' : ''}"${s.due ? '' : ` data-tip="${esc(t('page.subtask.inheritedDue'))}"`}>${ic('calendar', 12)}${relDate(due)}</span>` : ''}${st ? `<span class="due"${s.start ? '' : ` data-tip="${esc(t('page.subtask.inheritedStart'))}"`}>${ic('calendar-arrow-up', 12)}${relDate(st)}</span>` : ''}${(s.assignees || []).length ? avStack(s.assignees, 3, 'sm') : ''}<button class="ibtn ibtn-xs x" data-a="openSub" data-id="${tid}" data-sid="${sid}" aria-label="${t('a11y.openSubtaskDetails')}" tabindex="-1">${ic('chevron-right', 14)}</button>`);
        /* Phase 71 (D-71-6/ADR-1): opt-in columns mode — the List view subrows
           join the parent's grid template (tpl forwarded by task-list onto
           --cols) and each row appends 4 display cells after the head. The
           board card popover keeps { compact: true } with NO columns opt, so
           its output shape is untouched (ADR-1). Cells are non-clickable
           divs — no pop action attributes (D-71-7); assignees are the
           subtask's OWN
           (D-71-3); priority inherits the parent's (D-71-4); due reuses the
           non-compact expression verbatim — inherited tooltip + .over
           (D-71-5). */
        const meta = opt.columns
          ? `<div class="c-meta c-status"><span class="faint">—</span></div>` +
            `<div class="c-meta c-assignee">${(s.assignees || []).length ? avStack(s.assignees, 3, 'sm') : `<span class="faint">${t('common.unassigned')}</span>`}</div>` +
            `<div class="c-meta c-priority inh">${prPill(task0.priority)}</div>` +
            `<div class="c-meta c-due">${due ? `<span class="due ${!s.done && diffD(parse(due), TODAY) < 0 ? 'over' : ''}"${s.due ? '' : ` data-tip="${esc(t('page.subtask.inheritedDue'))}"`}>${ic('calendar', 12)}${relDate(due)}</span>` : ''}</div>`
          : '';
        return (
          `<div class="${cls} ${s.done ? 'done' : ''}${fx('added', sid)}${fx('done', sid)}" data-ctx="sub" data-id="${tid}" data-sid="${sid}" style="${indent}">${opt.columns ? `<div class="subhead">${head}</div>` : head}${meta}</div>` +
          (kids.length && open ? walk(sid, depth + 1) : '')
        );
      })
      .join('');
  return walk(null, 0);
}

/* The renderer registers itself for the synchronous consumers (drawer
   checklist, list/table subrows) the moment this chunk evaluates. */
treeChecklist.fn = subTreeChecklistHtml;

subPop.subs = p => {
  const st = task(p.id);
  return `<div class="mh">${t('popover.subtasksOf', { title: esc(st.title) })}</div>${subTreeChecklistHtml(st, { compact: true })}`;
};

subPop.subParent = p => {
  const st = task(p.id);
  const s = st?.subtasks.find(x => x.id === p.sid);
  const targets = st && s ? orderedSiblings(st.subtasks, s.parentId ?? null).filter(x => x.id !== s.id) : [];
  return `<div class="mh">${t('popover.subParentTitle')}</div>${popList(
    targets.map(x => ({ id: x.id, name: x.title, act: 'reparentSubTo', html: ic('corner-down-right', 14) })),
  )}`;
};
