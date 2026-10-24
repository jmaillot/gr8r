/* =====================================================================
   PAGES
   ===================================================================== */
import { ago, esc, relDate } from '../core/utils.js';
/* The row and cell functions take a task parameter named t, so the catalogue lookup is imported under an alias. */
import { t as tMsg, formatDate, fmtEstimate } from '../core/i18n.js';
import { ic } from '../core/icons.js';
import { PR, ST } from '../core/constants.js';
import { D, S, commentsOf, isOver, mem, pColor, proj, task } from '../core/store.js';
import { av, dueHtml, empty, lbl, prIcon, prPill, stIcon, stPill } from '../ui/helpers.js';
import { fxc } from '../shell/render.js';

/* ---------- shared list renderer ---------- */
/* The column headers read the catalogue through lazy getters — a module-level
   string would freeze the English at import time (the wave-8 FIELDS pattern). */
export const LCOLS = {
  status: [() => tMsg('page.field.status'), '126px'],
  assignee: [() => tMsg('page.field.assignee'), '150px'],
  priority: [() => tMsg('page.field.priority'), '108px'],
  due: [() => tMsg('page.field.due'), '104px'],
  labels: [() => tMsg('page.field.labels'), '168px'],
  project: [() => tMsg('page.field.project'), '160px'],
};
export function cellStatus(t) {
  return `<button class="pillbtn" data-a="pop" data-pop="status" data-id="${t.id}" aria-label="${tMsg('a11y.taskStatus', { status: ST[t.status].name })}">${stPill(t.status)}</button>`;
}
export function cellAssignee(t) {
  const m = mem(t.assignee);
  return `<button class="pillbtn ${m ? '' : 'empty'}" data-a="pop" data-pop="assignee" data-id="${t.id}" aria-label="${tMsg('page.field.assignee')}">${av(t.assignee, 'sm', false)}<span class="trunc">${m ? esc(m.name) : tMsg('common.unassigned')}</span></button>`;
}
export function cellPrio(t) {
  return `<button class="pillbtn ${t.priority === 'none' ? 'empty' : ''}" data-a="pop" data-pop="priority" data-id="${t.id}" aria-label="${tMsg('page.field.priority')}">${prPill(t.priority)}</button>`;
}
export function cellDue(t) {
  return `<button class="pillbtn ${t.due ? (isOver(t) ? 'over' : '') : 'empty'}" data-a="pop" data-pop="date" data-field="due" data-id="${t.id}" aria-label="${tMsg('page.field.due')}">${t.due ? `${ic('calendar', 13)}<span class="num">${relDate(t.due)}</span>` : `${ic('calendar', 13)}<span>${tMsg('common.setDate')}</span>`}</button>`;
}
export function cellLabels(t) {
  return `<button class="pillbtn ${t.labels.length ? '' : 'empty'}" data-a="pop" data-pop="labels" data-id="${t.id}" aria-label="${tMsg('page.field.labels')}" style="gap:4px;overflow:hidden">${t.labels.length ? t.labels.slice(0, 2).map(lbl).join('') + (t.labels.length > 2 ? `<span class="faint" style="font-size:11px">+${t.labels.length - 2}</span>` : '') : `${ic('tag', 13)}<span>${tMsg('act.add')}</span>`}</button>`;
}
export function cellProject(t) {
  const p = proj(t.project);
  return `<button class="pillbtn" data-a="pop" data-pop="project" data-id="${t.id}" aria-label="${tMsg('page.field.project')}"><span class="pdot" style="--c:${pColor(p)}"></span><span class="trunc">${esc(p?.name)}</span></button>`;
}
export const CELL = { status: cellStatus, assignee: cellAssignee, priority: cellPrio, due: cellDue, labels: cellLabels, project: cellProject };

export function taskRow(t, cols, tpl, opt = {}) {
  const sel = S.ui.sel.has(t.id);
  const open = S.ui.openTasks[t.id];
  const editing = S.ui.editCell && S.ui.editCell.id === t.id && S.ui.editCell.f === 'title';
  const cc = commentsOf(t.id).length;
  const sd = t.subtasks.filter(s => s.done).length;
  return `<div class="trow ${t.status === 'done' ? 'done' : ''} ${sel ? 'sel' : ''}${fxc('done', t.id)}${fxc('added', t.id)}" style="--cols:${tpl}" data-task-row="${t.id}" data-group="${opt.group || ''}" data-lkey="${opt.key || ''}" data-ctx="task" data-id="${t.id}">
    <div class="handle" draggable="${opt.drag !== false}" data-drag-row="${t.id}" aria-hidden="true">${opt.drag !== false ? ic('grip-vertical', 14) : ''}</div>
    <div class="c-check">${
      opt.complete
        ? `<input type="checkbox" class="check round" ${t.status === 'done' ? 'checked' : ''} data-a="toggleDone" data-id="${t.id}" aria-label="${tMsg('a11y.markComplete', { title: esc(t.title) })}">`
        : `<input type="checkbox" class="check" ${sel ? 'checked' : ''} data-a="selRow" data-id="${t.id}" aria-label="${tMsg('a11y.selectTask', { title: esc(t.title) })}">`
    }</div>
    <div class="ttl" ${editing ? '' : `data-a="openTask" data-id="${t.id}"`} data-dbl="editTitle">
      ${t.subtasks.length ? `<span class="ibtn ibtn-xs" data-a="expandRow" data-id="${t.id}" aria-label="${open ? tMsg('a11y.hideSubtasks') : tMsg('a11y.showSubtasks')}" aria-expanded="${!!open}" style="margin-left:-4px">${ic(open ? 'chevron-down' : 'chevron-right', 13)}</span>` : '<span style="width:18px;flex-shrink:0"></span>'}
      <span class="key">${t.key}</span>
      ${editing ? `<input class="inline-in" id="edit-title" data-in="noop" data-blur="commitTitle" data-key-enter="commitTitle" data-id="${t.id}" value="${esc(t.title)}" aria-label="${tMsg('a11y.taskTitle')}">` : `<span class="tt">${esc(t.title)}</span>`}
      ${t.recur ? `<span class="meta-mini" data-tip="${tMsg('a11y.repeats', { freq: esc(t.recur.toLowerCase()) })}">${ic('repeat', 11)}</span>` : ''}
      ${t.subtasks.length ? `<span class="meta-mini">${ic('list-checks', 11)}${sd}/${t.subtasks.length}</span>` : ''}
      ${cc ? `<span class="meta-mini">${ic('message-square', 11)}${cc}</span>` : ''}
    </div>
    ${cols.map(c => `<div class="c-meta c-${c === 'labels' ? 'lbl' : c}">${CELL[c](t)}</div>`).join('')}
    <div class="c-more"><button class="ibtn ibtn-sm" data-a="ctxBtn" data-ctx="task" data-id="${t.id}" aria-label="${tMsg('a11y.moreActions')}">${ic('ellipsis', 15)}</button></div>
  </div>
  ${open ? `<div class="subrows">${t.subtasks.map(s => `<div class="subrow ${s.done ? 'done' : ''}"><input type="checkbox" class="check" ${s.done ? 'checked' : ''} data-a="toggleSub" data-id="${t.id}" data-sid="${s.id}" aria-label="${tMsg('a11y.completeSubtask')}"><span>${esc(s.title)}</span></div>`).join('')}</div>` : ''}`;
}
export function listHtml(groups, key, opt = {}) {
  const cols = opt.cols || ['status', 'assignee', 'priority', 'due', 'labels'];
  const tpl = `18px 30px minmax(220px,1fr) ${cols.map(c => LCOLS[c][1]).join(' ')} 40px`;
  const all = groups.flatMap(g => g.tasks.map(t => t.id));
  const nSel = all.filter(id => S.ui.sel.has(id)).length;
  const total = all.length;
  if (!total && !opt.keepEmpty)
    return (
      opt.emptyHtml ||
      empty(
        'list-checks',
        tMsg('page.tasks.emptyTitle'),
        tMsg('page.tasks.emptyBody'),
        `<button class="btn btn-primary btn-sm" data-a="newTask" ${opt.project ? `data-project="${opt.project}"` : ''}>${ic('plus', 14)}${tMsg('act.newTask')}</button>`,
      )
    );
  const v = S.views[key];
  return `<div class="tlist" role="table" aria-label="${tMsg('nav.route.tasks')}">
    <div class="thead" style="--cols:${tpl}" role="row">
      <div></div>
      <div>${opt.complete ? '' : `<input type="checkbox" class="check" data-a="selAll" data-key="${key}" ${nSel && nSel === total ? 'checked' : ''} ${nSel && nSel < total ? 'data-indet="1"' : ''} aria-label="${tMsg('a11y.selectAll')}">`}</div>
      <div data-a="sortBy" data-key="${key}" data-f="title" style="cursor:pointer">${tMsg('page.columns.task')} ${v?.sort.f === 'title' ? ic(v.sort.dir > 0 ? 'arrow-up' : 'arrow-down', 11) : ''}</div>
      ${cols.map(c => `<div data-a="sortBy" data-key="${key}" data-f="${c === 'labels' ? 'manual' : c}" style="cursor:pointer">${LCOLS[c][0]()} ${v?.sort.f === c ? ic(v.sort.dir > 0 ? 'arrow-up' : 'arrow-down', 11) : ''}</div>`).join('')}
      <div></div>
    </div>
    ${groups
      .map(g => {
        const gk = key + ':' + g.key;
        const coll = S.ui.collapsedGroups[gk] ?? (g.collapsed || false);
        const comp = S.ui.composer && S.ui.composer.ctx === key && S.ui.composer.group === g.key;
        return `${
          groups.length > 1 || g.key !== 'all'
            ? `<div class="grp" data-grp-drop="${g.key}" data-key="${key}">
          <button class="ibtn ibtn-xs" data-a="toggleGroup" data-gk="${gk}" aria-expanded="${!coll}" aria-label="${tMsg('a11y.toggleGroup')}">${ic(coll ? 'chevron-right' : 'chevron-down', 13)}</button>
          ${g.html || ''}<span>${esc(g.name)}</span><span class="cnt">${g.tasks.length}</span>
          ${opt.noAdd ? '' : `<button class="ibtn ibtn-xs" data-a="startComposer" data-ctx="${key}" data-group="${g.key}" data-gb="${esc(JSON.stringify(g.set || {}))}" aria-label="${tMsg('a11y.addTaskTo', { name: esc(g.name) })}">${ic('plus', 13)}</button>`}
        </div>`
            : ''
        }
        ${coll ? '' : g.tasks.map(t => taskRow(t, cols, tpl, { group: g.key, drag: opt.drag, complete: opt.complete, key })).join('')}
        ${coll || opt.noAdd ? '' : comp ? `<div class="addrow" style="background:var(--surface-2)">${ic('plus', 14)}<input class="inline-in" id="composer-in" data-key-enter="commitComposer" placeholder="${tMsg('a11y.composerPlaceholder')}" aria-label="${tMsg('a11y.newTaskName')}"></div>` : `<button class="addrow" data-a="startComposer" data-ctx="${key}" data-group="${g.key}" data-gb="${esc(JSON.stringify(g.set || {}))}">${ic('plus', 14)}${tMsg('act.addTask')}</button>`}`;
      })
      .join('')}
  </div>${bulkBar(all)}`;
}
export function bulkBar(ids) {
  const n = ids.filter(id => S.ui.sel.has(id)).length;
  if (!n) return '';
  return `<div class="bulkbar${S.ui.fx.bulk ? ' enter' : ''}" role="toolbar" aria-label="${tMsg('a11y.bulkActions')}"><b style="font-weight:600">${tMsg('act.selectedCount', { n: n })}</b><span class="sep"></span>
    <button class="btn btn-sm" data-a="pop" data-pop="bulk-status">${ic('circle-dot', 14)}${tMsg('page.field.status')}</button>
    <button class="btn btn-sm" data-a="pop" data-pop="bulk-assignee">${ic('user', 14)}${tMsg('page.field.assignee')}</button>
    <button class="btn btn-sm" data-a="pop" data-pop="bulk-priority">${ic('signal-high', 14)}${tMsg('page.field.priority')}</button>
    <button class="btn btn-sm" data-a="bulkDelete">${ic('trash-2', 14)}${tMsg('act.delete')}</button><span class="sep"></span>
    <button class="btn btn-sm" data-a="clearSel" aria-label="${tMsg('a11y.clearSelection')}">${ic('x', 14)}</button></div>`;
}

/* ---------- activity rendering ---------- */

/* The stored verb is document data in two vocabularies: the legacy English
   fragment (every document written before this plan) and the machine verb —
   the camelCase suffix of its act.verb.* key — what the writers store from
   now on. The display is a catalogue lookup keyed on the stored string,
   through this explicit map in both vocabularies: never a dynamic key echo.
   An unknown verb renders verbatim — the same rule the notifications follow. */
export const VERB_KEYS = {
  created: 'act.verb.created',
  'created project': 'act.verb.createdProject',
  createdProject: 'act.verb.createdProject',
  completed: 'act.verb.completed',
  moved: 'act.verb.moved',
  assigned: 'act.verb.assigned',
  'changed priority of': 'act.verb.changedPriorityOf',
  changedPriorityOf: 'act.verb.changedPriorityOf',
  'changed due date of': 'act.verb.changedDueDateOf',
  changedDueDateOf: 'act.verb.changedDueDateOf',
  'changed start date of': 'act.verb.changedStartDateOf',
  changedStartDateOf: 'act.verb.changedStartDateOf',
  'updated labels on': 'act.verb.updatedLabelsOn',
  updatedLabelsOn: 'act.verb.updatedLabelsOn',
  renamed: 'act.verb.renamed',
  'set repeat on': 'act.verb.setRepeatOn',
  setRepeatOn: 'act.verb.setRepeatOn',
  estimated: 'act.verb.estimated',
  'updated dependencies of': 'act.verb.updatedDependenciesOf',
  updatedDependenciesOf: 'act.verb.updatedDependenciesOf',
  archived: 'act.verb.archived',
  restored: 'act.verb.restored',
  'commented on': 'act.verb.commentedOn',
  commentedOn: 'act.verb.commentedOn',
  'added a file to': 'act.verb.addedAFileTo',
  addedAFileTo: 'act.verb.addedAFileTo',
  'removed a file from': 'act.verb.removedAFileFrom',
  removedAFileFrom: 'act.verb.removedAFileFrom',
  'added subtask to': 'act.verb.addedSubtaskTo',
  addedSubtaskTo: 'act.verb.addedSubtaskTo',
  'converted a subtask of': 'act.verb.convertedASubtaskOf',
  convertedASubtaskOf: 'act.verb.convertedASubtaskOf',
  'assigned a subtask on': 'act.verb.assignedASubtaskOn',
  assignedASubtaskOn: 'act.verb.assignedASubtaskOn',
  'set a subtask due date on': 'act.verb.setASubtaskDueDateOn',
  setASubtaskDueDateOn: 'act.verb.setASubtaskDueDateOn',
  'completed subtask on': 'act.verb.completedSubtaskOn',
  completedSubtaskOn: 'act.verb.completedSubtaskOn',
  'reopened subtask on': 'act.verb.reopenedSubtaskOn',
  reopenedSubtaskOn: 'act.verb.reopenedSubtaskOn',
  'changed status of project': 'act.verb.projectStatusChanged',
  projectStatusChanged: 'act.verb.projectStatusChanged',
};
export const verbLabel = v => (VERB_KEYS[v] ? tMsg(VERB_KEYS[v]) : v);

/* The three activity filters classify the STORED verb, never English parsing:
   the table carries BOTH vocabularies, so a legacy document and a machine-verb
   one filter identically. D-06 freezes today's exact selection — including the
   quirk that a project move logs `moved` and the STATUS filter selects it. */
/* The three filters classify the STORED verb through one table — both
   vocabularies (the machine verbs the writers store now and the legacy English
   fragments old documents carry), so a legacy row and its machine twin land in
   the same filter. The sets freeze today's exact selection (D-06), quirks
   included: a project move (`moved`) is a STATUS entry, and the old
   /moved|completed|reopened/ regex caught "removed a file from" as well —
   the equivalence test pins all of it. */
/* The three activity filters classify the STORED verb, never English parsing:
   the table carries BOTH vocabularies, so a legacy document and a machine-verb
   one filter identically. D-06 freezes today's exact selection — quirks
   included: a project move (`moved`) is a STATUS entry, and the old
   /moved|completed|reopened/ regex caught "removed a file from" too. The
   PROJECTS filter deliberately RESTORES the old selection for both
   vocabularies: the old includes('project') was case-sensitive, so it caught
   the legacy fragment but not the machine verb 'createdProject' — losing the
   new documents' rows was a regression, not preservation. */
export const ACT_CATEGORIES = {
  comments: new Set(['commentedOn', 'commented on']),
  status: new Set([
    'moved',
    'completed',
    'completedSubtaskOn',
    'reopenedSubtaskOn',
    'completed subtask on',
    'reopened subtask on',
    'removed a file from',
    'removedAFileFrom',
  ]),
  projects: new Set(['projectStatusChanged', 'createdProject', 'created project', 'changed status of project']),
};
export const actCategory = verb => Object.keys(ACT_CATEGORIES).find(k => ACT_CATEGORIES[k].has(verb)) || null;

/* The stored repeat ids and their catalogue keys — the same shapes the new-task
   modal's RECUR_KEY maps, kept local because modals.js already imports this file. */
const RECUR_EXTRA = {
  'does not repeat': 'popover.recurNone',
  daily: 'popover.recurDaily',
  weekly: 'popover.recurWeekly',
  'every 2 weeks': 'popover.recurBiweekly',
  monthly: 'popover.recurMonthly',
};

/* A new row's extra is structured ({ kind, ...vars }) and composes through the
   act.extra.* catalogue keys via this table: the kind selects the key (or a key
   resolver) and a resolver turns the stored ids (machine values, never frozen
   prose) into display values in the reader's locale. A kind missing from the
   table renders nothing — a foreign kind is never echoed or interpolated
   (T-09-04's gate). */
const EXTRA_VARS = {
  statusMoved: { key: 'act.extra.statusMoved', vars: e => ({ from: tMsg('task.status.' + e.from), to: tMsg('task.status.' + e.to) }) },
  assignedTo: { key: 'act.extra.to', vars: e => ({ value: e.value ?? '' }) },
  unassigned: { key: 'act.extra.unassigned', vars: () => ({}) },
  prioritySet: { key: 'act.extra.to', vars: e => ({ value: tMsg('task.priority.' + e.value) }) },
  dateSet: { key: 'act.extra.to', vars: e => ({ value: formatDate(e.value) }) },
  dateCleared: { key: 'act.extra.cleared', vars: () => ({}) },
  renamedTo: { key: 'act.extra.renamedTo', vars: e => ({ value: e.value }) },
  repeatSet: { key: e => RECUR_EXTRA[e.id] || 'act.extra.off', vars: () => ({}) },
  estimateSet: { key: e => (e.value ? 'act.extra.to' : 'act.extra.none'), vars: e => ({ value: fmtEstimate(e.value) }) },
  fileAdded: { key: 'act.extra.value', vars: e => ({ value: e.value }) },
  fileRemoved: { key: 'act.extra.value', vars: e => ({ value: e.value }) },
  subtaskAdded: { key: 'act.extra.quoted', vars: e => ({ value: e.value }) },
  subtaskConverted: { key: 'act.extra.into', vars: e => ({ value: e.value }) },
  quoted: { key: 'act.extra.quoted', vars: e => ({ value: e.value }) },
  movedToProject: { key: 'act.extra.to', vars: e => ({ value: proj(e.value)?.name || e.value }) },
  projStatusSet: { key: 'act.extra.to', vars: e => ({ value: tMsg('project.status.' + e.value) }) },
};

/* A new row's extra is structured ({ kind, ...vars }) and composes through the
   act.extra.* catalogue keys; a legacy row's extra is a stored English string
   and is DROPPED at render — never divulged (the roadmap's "dropped rather
   than leaked" policy, no document migration). */
export function actExtraHtml(e) {
  if (e && typeof e === 'object') {
    if (e.kind === 'recur') {
      const k = RECUR_EXTRA[e.id];
      return `<span class="muted">${esc(k ? tMsg(k) : e.id)}</span>`;
    }
    const spec = EXTRA_VARS[e.kind];
    if (!spec) return '';
    const key = typeof spec.key === 'function' ? spec.key(e) : spec.key;
    return `<span class="muted">${esc(tMsg(key, spec.vars(e)))}</span>`;
  }
  return '';
}

export function actHtml(a, opt = {}) {
  const m = mem(a.by);
  const t = a.task ? task(a.task) : null;
  const p = a.project ? proj(a.project) : null;
  const obj = t
    ? `<span class="obj" data-a="openTask" data-id="${t.id}">${esc(t.title)}</span>`
    : p
      ? `<span class="obj" data-a="go" data-r="project" data-id="${p.id}">${esc(p.name)}</span>`
      : '';
  return `<div class="fitem">${av(a.by, 'sm')}<div class="grow"><b>${esc(m?.id === D().me ? tMsg('common.you') : m?.name || tMsg('common.someone'))}</b> <span class="muted">${esc(verbLabel(a.verb))}</span> ${obj} ${a.extra ? actExtraHtml(a.extra) : ''}${opt.proj && p && t ? ` <span class="faint">${tMsg('act.extra.inProject')} ${esc(p.name)}</span>` : ''}</div><time>${ago(a.at)}</time></div>`;
}
export function miniRow(t, opt = {}) {
  const p = proj(t.project);
  return `<div class="mini ${t.status === 'done' ? 'done' : ''}${fxc('done', t.id)}${fxc('added', t.id)}" data-a="openTask" data-id="${t.id}" data-ctx="task" role="button" tabindex="0">
    <input type="checkbox" class="check round" ${t.status === 'done' ? 'checked' : ''} data-a="toggleDone" data-id="${t.id}" aria-label="${tMsg('a11y.completeTask', { title: esc(t.title) })}">
    <span data-tip="${ST[t.status].name}">${stIcon(t.status)}</span>
    <span class="tt">${esc(t.title)}</span>
    ${opt.noProj ? '' : `<span class="pj hide-m"><span class="pdot" style="--c:${pColor(p)}"></span><span class="trunc">${esc(p.name)}</span></span>`}
    <span data-tip="${tMsg('a11y.priorityTip', { priority: PR[t.priority].name })}">${prIcon(t.priority)}</span>
    <span style="width:74px;text-align:right" class="hide-m">${dueHtml(t, false)}</span>
    ${opt.av === false ? '' : av(t.assignee, 'sm')}
  </div>`;
}
