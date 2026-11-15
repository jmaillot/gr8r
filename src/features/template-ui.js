/* =====================================================================
   FEATURES · TEMPLATE UI — Phase 66 (66-03) — the lazy template surfaces.
   =====================================================================
   The Settings CRUD body (D-09), the create-modal picker (D-11) and the
   drawer-style editor (D-12) all live in THIS lazy chunk (the D-13 entry
   gate): consumers reach it through dynamic imports that cache the module
   in S.ui.tplUi / the templateUi.openEditor registry (the treeChecklist
   pattern, features/subtasks.js). No entry-chunk module imports this file
   statically — the modalHtml cases delegate through the S.ui.tplUi cache
   and the openers (A.openTemplatePicker / A.saveAsTemplate in
   actions/templates.js) load the chunk before opening.

   Editor model: the draft lives in S.ui.tplEditor (a deep clone — live
   doc rows are never touched; D-12 says the tree edits the DRAFT body).
   Tree restructure reuses the Phase 65 validators/comparators on the
   draft (subtree.validateMove / nextPosition / orderedSiblings — the same
   one-level promote/demote/re-parent semantics as features/subtask-move.js,
   minus the doc writes and activity logging a draft cannot carry). The
   offset column (D-12) replaces the date-picker pill: a numeric
   dueOffsetDays input per tree node — empty means no due date (D-08).

   T-66-06: every template string rendered here passes esc() — template
   names/titles are client-authored workspace-wide doc data (the Phase 36
   stored-XSS discipline). No template string is interpolated unescaped
   into markup or data-* attributes.
   ===================================================================== */
import { esc, uid } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { ic } from '../core/icons.js';
import { PCOLORS, PICONS, PRIOS } from '../core/constants.js';
import { A, IN, KEY, confirmDlg, restore, snapshot } from '../actions/actions.js';
import { mutate, toast } from '../ui/toast.js';
import { canSee, D, proj, S, pushNow, teamsList } from '../core/store.js';
import { closeModal, openModal } from '../overlays/modals.js';
import { go, render } from '../shell/render.js';
import { descendantsOf, nextPosition, orderedSiblings, validateMove } from '../core/subtree.js';
import { templateUi } from '../actions/templates.js';

/* ---------- draft node addressing ---------- */
/* A draft node is addressed by an optional task-entry index ti (project
   kind — the body task tree entries carry no stable id, so the array
   index is the address) plus the subtask id inside that entry's array. */
function listAt(d, ti) {
  if (!d) return [];
  if (d.kind === 'project') {
    const e = d.body?.tasks?.[Number(ti)];
    if (!e) return [];
    if (!Array.isArray(e.subtasks)) e.subtasks = [];
    return e.subtasks;
  }
  if (!Array.isArray(d.body?.subtasks)) d.body.subtasks = [];
  return d.body.subtasks;
}
function nodeAt(d, ti, sid) {
  return listAt(d, ti).find(s => s.id === sid);
}

/* ---------- the Settings CRUD body (D-09) ---------- */
export function renderTemplateSettings() {
  const list = [...(D().templates || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const del = S.ui.tplDelId;
  const preview = x => {
    const n = x.kind === 'project' ? (x.body?.tasks?.length || 0) : (x.body?.subtasks?.length || 0);
    return x.kind === 'project' ? t('templates.previewTasks', { n: n }) : t('templates.previewSubtasks', { n: n });
  };
  const rows = list
    .map((x, i) => {
      const kind = `<span class="badge faint">${t(x.kind === 'project' ? 'templates.kindProject' : 'templates.kindTask')}</span>`;
      return `<div class="srow"><div class="row" style="cursor:default">${ic(x.icon || 'layers', 15)}<div><div class="t">${esc(x.name)}</div><div class="d">${kind} · ${preview(x)}</div></div></div><div class="row">${
        del === x.id
          ? `<span class="hint">${t('templates.deleteBody')}</span><button class="btn btn-danger btn-sm" data-a="tplDeleteConfirm" data-id="${esc(x.id)}">${t('act.delete')}</button><button class="btn btn-secondary btn-sm" data-a="tplDeleteCancel">${t('common.cancel')}</button>`
          : `${i > 0 ? `<button class="ibtn ibtn-sm" data-a="tplUp" data-id="${esc(x.id)}" data-tip="${t('act.moveUpSidebar')}" aria-label="${t('act.moveUpSidebar')}">${ic('arrow-up', 14)}</button>` : ''}${i < list.length - 1 ? `<button class="ibtn ibtn-sm" data-a="tplDown" data-id="${esc(x.id)}" data-tip="${t('act.moveDownSidebar')}" aria-label="${t('act.moveDownSidebar')}">${ic('arrow-down', 14)}</button>` : ''}<button class="ibtn ibtn-sm" data-a="tplEdit" data-id="${esc(x.id)}" data-tip="${t('act.edit')}" aria-label="${t('act.edit')}">${ic('pencil', 14)}</button><button class="ibtn ibtn-sm" data-a="tplDelete" data-id="${esc(x.id)}" data-tip="${t('act.delete')}" aria-label="${t('act.delete')}">${ic('trash-2', 14)}</button>`
      }</div></div>`;
    })
    .join('');
  return `<div class="sblock" style="margin-top:0"><div class="row" style="margin-bottom:12px"><button class="btn btn-primary" data-a="tplNew">${ic('plus', 14)}${t('templates.new')}</button></div>${
    list.length
      ? rows
      : `<p class="hint">${t('templates.empty')}</p>`
  }</div>`;
}

/* ---------- the picker modal (D-11) ---------- */
export function templatePickModal(m, H) {
  const kind = m?.kind === 'project' ? 'project' : 'task';
  const list = [...(D().templates || [])].filter(x => x.kind === kind).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  return `${H(t('modal.fromTemplate'))}
  <div class="modal-b" style="gap:2px">${
    list.length
      ? list
          .map(x => {
            const n = kind === 'project' ? (x.body?.tasks?.length || 0) : (x.body?.subtasks?.length || 0);
            return `<button class="mi" data-a="tplPick" data-id="${esc(x.id)}">${ic(x.icon || 'layers', 15)}${esc(x.name)}<span class="r">${kind === 'project' ? t('templates.previewTasks', { n: n }) : t('templates.previewSubtasks', { n: n })}</span></button>`;
          })
          .join('')
      : `<div class="mi faint" style="cursor:default">${t('templates.pickerEmpty')}</div>`
  }</div>
  <div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">${t('common.cancel')}</button></div>`;
}

/* ---------- the editor (D-12) ---------- */
/* One-level restructure on the DRAFT (the 65-04 semantics via the shared
   validators — a rejected move mutates nothing and shows the localized
   err.<code> toast). */
function restructureDraft(list, s, newParentId) {
  const chk = validateMove(list, s.id, newParentId);
  if (!chk.ok) {
    toast(t(`err.${chk.code}`), { kind: 'err' });
    return false;
  }
  s.parentId = newParentId;
  s.position = nextPosition(list, newParentId);
  return true;
}

function treeHtml(d, ti) {
  const list = listAt(d, ti);
  const pick = d.parentPick;
  const picking = !!pick && String(pick.ti ?? '') === String(ti ?? '');
  const tiAttr = ti != null ? `data-ti="${ti}"` : '';
  const row = (parentId, depth) =>
    orderedSiblings(list, parentId)
      .map(s => {
        const isRoot = s.parentId == null;
        const sibs = orderedSiblings(list, s.parentId ?? null);
        const hasPrev = sibs.findIndex(x => x.id === s.id) > 0;
        const descendants = new Set(descendantsOf(list, s.id).map(x => x.id));
        const eligible = picking && pick.sid !== s.id && !descendants.has(s.id);
        const btn = (act, icon, label, extra = '') =>
          `<button class="ibtn ibtn-xs" data-a="${act}" ${tiAttr} data-sid="${esc(s.id)}" data-tip="${label}" aria-label="${label}" ${extra}>${ic(icon, 13)}</button>`;
        return `<div class="row subt" style="padding-left:${depth * 16}px"><span class="row" style="gap:6px;min-width:0;flex:1">${ic(isRoot ? 'circle' : 'corner-down-right', 12)}<input class="inline-in" style="min-width:0;flex:1" data-in="tplTitle" ${tiAttr} data-sid="${esc(s.id)}" value="${esc(s.title)}" placeholder="${t('a11y.subtaskEnter')}" aria-label="${t('a11y.addSubtask')}"><input type="number" class="input" style="width:64px;flex-shrink:0" data-in="tplOffset" ${tiAttr} data-sid="${esc(s.id)}" value="${s.dueOffsetDays ?? ''}" placeholder="${t('templates.offsetPlaceholder')}" aria-label="${t('templates.offsetLabel')}"></span><span class="row" style="gap:2px">${
          eligible
            ? `<button class="ibtn ibtn-xs" data-a="tplReparentHere" ${tiAttr} data-v="${esc(s.id)}" data-tip="${t('templates.reparentHere')}" aria-label="${t('templates.reparentHere')}">${ic('check', 13)}</button>`
            : btn('tplReparent', 'corner-down-right', t('templates.reparentTitle'), `${isRoot ? '' : 'style="opacity:.55"'}`)
        }${isRoot ? '' : btn('tplPromote', 'arrow-up', t('act.moveSubUp'))}${hasPrev ? btn('tplDemote', 'arrow-down', t('act.moveSubDown')) : ''}${btn('tplAddChild', 'plus', t('a11y.addSubtask'))}${btn('tplRmSub', 'x', t('act.remove'))}</span></div>` + row(s.id, depth + 1);
      })
      .join('');
  return row(null, 0);
}

function addSubRow(d, ti) {
  return `<div class="subt" style="color:var(--text-3)">${ic('plus', 15)}<input class="inline-in" data-key-enter="tplAddSub" ${ti != null ? `data-ti="${ti}"` : ''} placeholder="${t('a11y.addSubtask')}" aria-label="${t('a11y.addSubtask')}" style="font-size:13.5px"></div>`;
}

function offsetCell(d, ti, f) {
  const e = d.body.tasks[ti];
  return `<label class="row" style="gap:4px;font-size:12px;flex-shrink:0"><span class="faint">${t(f === 'dueOffsetDays' ? 'page.field.due' : 'page.sort.start')}</span><input type="number" class="input" style="width:60px" data-in="tplTaskOffset" data-ti="${ti}" data-f="${f}" value="${e[f] ?? ''}" placeholder="${t('templates.offsetPlaceholder')}" aria-label="${t('templates.offsetLabel')}"></label>`;
}

export function templateEditModal(m, H) {
  const d = S.ui.tplEditor;
  if (!d) return `${H(t('templates.editorNew'))}${`<div class="modal-b"></div>`}<div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">${t('common.cancel')}</button></div>`;
  const isNew = !d.id;
  const kindBar = isNew
    ? `<div class="field"><span class="label">${t('templates.kindLabel')}</span><div class="seg">${['task', 'project']
        .map(k => `<button class="${d.kind === k ? 'on' : ''}" data-a="tplKind" data-v="${k}">${t(k === 'project' ? 'templates.kindProject' : 'templates.kindTask')}</button>`)
        .join('')}</div></div>`
    : '';
  const iconBar = `<div class="row" style="gap:16px;align-items:flex-start;flex-wrap:wrap">
    <div class="field"><span class="label">${t('modal.icon')}</span><div class="iconpick" role="radiogroup" aria-label="${t('modal.icon')}">${PICONS.map(i => `<button type="button" role="radio" aria-checked="${d.icon === i}" class="${d.icon === i ? 'on' : ''}" data-a="tplIcon" data-v="${i}" aria-label="${i}">${ic(i, 15)}</button>`).join('')}</div></div>
    <div class="field"><span class="label">${t('modal.color')}</span><div class="swatches" role="radiogroup" aria-label="${t('modal.color')}" style="max-width:180px">${Object.entries(PCOLORS)
      .map(([k, v]) => `<button type="button" role="radio" aria-checked="${d.color === k}" class="sw ${d.color === k ? 'on' : ''}" style="--c:${v};width:22px;height:22px" data-a="tplColor" data-v="${k}" aria-label="${k}">${d.color === k ? ic('check', 12) : ''}</button>`)
      .join('')}</div></div></div>`;
  const treeHeader =
    d.kind === 'task'
      ? ''
      : `<div class="row" style="gap:14px;margin-bottom:6px"><span class="faint" style="font-size:12px">${t('templates.offsetLabel')}</span><span class="faint" style="font-size:12px">${t('templates.offsetHint')}</span></div>`;
  const bodyFields =
    d.kind === 'project'
      ? `<div class="field"><label class="label" for="tpl-name">${t('modal.projectName')}</label><input class="input" id="tpl-name" data-in="tplF" data-f="name" value="${esc(d.name || '')}"></div>
    <div class="field"><label class="label" for="tpl-desc">${t('modal.description')}</label><textarea class="textarea" id="tpl-desc" data-in="tplF" data-f="description" rows="2">${esc(d.body.description || '')}</textarea></div>
    <div class="row" style="gap:12px;flex-wrap:wrap">
      <div class="field" style="max-width:180px"><span class="label">${t('page.field.status')}</span><select class="select" data-in="tplF" data-f="status">${['planning', 'active', 'complete']
          .map(s => `<option value="${s}" ${d.body.status === s ? 'selected' : ''}>${t('project.status.' + s)}</option>`)
          .join('')}</select></div>
      <div class="field"><span class="label">${t('modal.teamsSection')}</span><div class="row" style="gap:6px;flex-wrap:wrap">${teamsList()
          .map(tm => `<button type="button" class="opt ${d.body.teams.includes(tm.id) ? 'on' : ''}" data-a="tplTeam" data-v="${tm.id}" style="padding:6px">${ic('users', 13)}<b style="font-size:12px">${esc(tm.name)}</b></button>`)
          .join('')}</div></div>
    </div>
    ${treeHeader}
    ${(d.body.tasks || [])
      .map(
        (e, i) =>
          `<div class="sblock" style="border-top:1px solid var(--divider);padding-top:10px"><div class="row" style="gap:8px"><input class="input" style="max-width:260px" data-in="tplTaskF" data-ti="${i}" data-f="title" value="${esc(e.title || '')}" placeholder="${t('modal.taskName')}" aria-label="${t('modal.taskName')}">${offsetCell(d, i, 'dueOffsetDays')}${offsetCell(d, i, 'startOffsetDays')}<span class="sp"></span><button class="ibtn ibtn-xs" data-a="tplRmTask" data-ti="${i}" aria-label="${t('act.remove')}">${ic('x', 12)}</button></div>${treeHtml(d, i)}${addSubRow(d, i)}</div>`,
      )
      .join('')}
    <div><button class="btn btn-secondary btn-sm" data-a="tplAddTask">${ic('plus', 13)}${t('templates.addTask')}</button></div>`
      : `<div class="field"><label class="label" for="tpl-title">${t('modal.taskName')}</label><input class="input" id="tpl-title" data-in="tplF" data-f="title" value="${esc(d.body.title || '')}"></div>
    <div class="row" style="gap:12px;flex-wrap:wrap">
      <div class="field" style="max-width:180px"><span class="label">${t('page.field.priority')}</span><select class="select" data-in="tplF" data-f="priority">${PRIOS.map(p => `<option value="${p.id}" ${(d.body.priority || 'medium') === p.id ? 'selected' : ''}>${t('task.priority.' + p.id)}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label class="label" for="tpl-notes">${t('modal.description')}</label><textarea class="textarea" id="tpl-notes" data-in="tplF" data-f="notes" rows="2">${esc(d.body.notes || '')}</textarea></div>
    ${treeHeader}
    ${treeHtml(d, null)}
    ${addSubRow(d, null)}`;
  const reparentBar = d.parentPick
    ? `<div class="alert info" style="margin:10px 0">${ic('corner-down-right', 14)}<span>${t('templates.reparentTitle')}</span><button class="btn btn-secondary btn-sm" style="margin-left:8px" data-a="tplReparentOff">${t('common.cancel')}</button></div>`
    : '';
  return `${H(isNew ? t('templates.editorNew') : t('templates.editorEdit', { name: esc(d.name) }), `${t(d.kind === 'project' ? 'templates.kindProject' : 'templates.kindTask')}`)}
  <div class="modal-b" style="gap:12px">
    ${kindBar}
    ${iconBar}
    ${bodyFields}
    ${reparentBar}
  </div>
  <div class="modal-f">${d.id ? `<button class="btn btn-danger-ghost" data-a="tplEditorDelete">${ic('trash-2', 14)}${t('act.delete')}</button>` : ''}<span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">${t('common.cancel')}</button><button class="btn btn-primary" data-a="tplSave">${t('common.save')}</button></div>`;
}

/* ---------- the opener + registry wiring ---------- */
export function openTemplateEditor(draft) {
  const d = JSON.parse(JSON.stringify(draft));
  if (d.kind === 'project') {
    if (!Array.isArray(d.body.teams)) d.body.teams = [];
    if (!Array.isArray(d.body.tasks)) d.body.tasks = [];
  } else if (!Array.isArray(d.body.subtasks)) d.body.subtasks = [];
  d.parentPick = null;
  S.ui.tplEditor = d;
  openModal({ type: 'templateEdit' });
}
/* The 66-02 registry (actions/templates.js) is populated at chunk load —
   any registry caller is safe from the first import onwards. */
templateUi.openEditor = openTemplateEditor;

/* ---------- actions: settings CRUD (D-09) ---------- */
A.tplNew = () => {
  S.ui.tplEditor = { id: null, kind: 'task', name: '', icon: '', color: '', body: { title: '', subtasks: [] }, position: null };
  openModal({ type: 'templateEdit' });
};
A.tplEdit = el => {
  const tm = (D().templates || []).find(x => x.id === el.dataset.id);
  if (!tm) return;
  openTemplateEditor(tm);
};
A.tplKind = el => {
  const d = S.ui.tplEditor;
  if (!d || d.id) return;
  d.kind = el.dataset.v === 'project' ? 'project' : 'task';
  d.body = d.kind === 'project' ? { name: d.name, description: '', status: 'planning', teams: [], tasks: [] } : { title: d.name, subtasks: [] };
  d.parentPick = null;
  render();
};
A.tplIcon = el => {
  const d = S.ui.tplEditor;
  if (!d) return;
  d.icon = el.dataset.v;
  render();
};
A.tplColor = el => {
  const d = S.ui.tplEditor;
  if (!d) return;
  d.color = el.dataset.v;
  render();
};
A.tplTeam = el => {
  const d = S.ui.tplEditor;
  if (!d || d.kind !== 'project') return;
  const id = el.dataset.v;
  d.body.teams = d.body.teams.includes(id) ? d.body.teams.filter(x => x !== id) : [...d.body.teams, id];
  render();
};

/* ---------- actions: editor fields (IN handlers survive full re-renders) ---------- */
IN; /* the IN registry is imported via actions.js below */

IN; /* the IN registry rides the actions.js import above */

IN.tplF = el => {
  const d = S.ui.tplEditor;
  if (!d) return;
  const f = el.dataset.f;
  const v = el.value;
  if (f === 'name') {
    d.name = v;
    if (d.kind === 'project') d.body.name = v;
  } else if (f === 'title') {
    d.body.title = v;
    d.name = v;
  } else if (f === 'description' || f === 'notes' || f === 'status' || f === 'priority') {
    d.body[f] = v;
  }
};
IN.tplTaskF = el => {
  const e = S.ui.tplEditor?.body?.tasks?.[Number(el.dataset.ti)];
  if (e) e[el.dataset.f] = el.value;
};
IN.tplTaskOffset = el => {
  const e = S.ui.tplEditor?.body?.tasks?.[Number(el.dataset.ti)];
  if (!e) return;
  const v = String(el.value).trim();
  const n = Number(v);
  if (v !== '' && Number.isFinite(n)) e[el.dataset.f] = n;
  else delete e[el.dataset.f];
};
IN.tplTitle = el => {
  const s = nodeAt(S.ui.tplEditor, el.dataset.ti, el.dataset.sid);
  if (s) s.title = el.value;
};
IN.tplOffset = el => {
  const s = nodeAt(S.ui.tplEditor, el.dataset.ti, el.dataset.sid);
  if (!s) return;
  const v = String(el.value).trim();
  const n = Number(v);
  if (v !== '' && Number.isFinite(n)) s.dueOffsetDays = n;
  else delete s.dueOffsetDays;
};

/* ---------- actions: editor tree ops (the 65-04 semantics on the draft) ---------- */
A.tplPromote = el => {
  const d = S.ui.tplEditor;
  const list = listAt(d, el.dataset.ti);
  const s = nodeAt(d, el.dataset.ti, el.dataset.sid);
  if (!d || !s || s.parentId == null) return;
  const parent = list.find(x => x.id === s.parentId);
  if (restructureDraft(list, s, parent ? parent.parentId ?? null : null)) render();
};
A.tplDemote = el => {
  const d = S.ui.tplEditor;
  const list = listAt(d, el.dataset.ti);
  const s = nodeAt(d, el.dataset.ti, el.dataset.sid);
  if (!d || !s) return;
  const sibs = orderedSiblings(list, s.parentId ?? null);
  const i = sibs.findIndex(x => x.id === s.id);
  if (i <= 0) return;
  if (restructureDraft(list, s, sibs[i - 1].id)) render();
};
A.tplReparent = el => {
  const d = S.ui.tplEditor;
  if (!d) return;
  d.parentPick = { ti: el.dataset.ti ?? null, sid: el.dataset.sid };
  render();
};
A.tplReparentOff = () => {
  const d = S.ui.tplEditor;
  if (d) d.parentPick = null;
  render();
};
A.tplReparentHere = el => {
  const d = S.ui.tplEditor;
  const pick = d?.parentPick;
  if (!d || !pick) return;
  const list = listAt(d, pick.ti);
  const s = nodeAt(d, pick.ti, pick.sid);
  d.parentPick = null;
  if (!s) return render();
  if (restructureDraft(list, s, el.dataset.v)) render();
};
A.tplAddChild = el => {
  const d = S.ui.tplEditor;
  const list = listAt(d, el.dataset.ti);
  const parent = nodeAt(d, el.dataset.ti, el.dataset.sid);
  if (!d || !parent) return;
  list.push({ id: uid('s'), parentId: parent.id, position: nextPosition(list, parent.id), title: '', done: false });
  render();
};
A.tplRmSub = el => {
  const d = S.ui.tplEditor;
  const list = listAt(d, el.dataset.ti);
  const s = nodeAt(d, el.dataset.ti, el.dataset.sid);
  if (!d || !s) return;
  const gone = new Set([s.id, ...descendantsOf(list, s.id).map(x => x.id)]);
  list.splice(0, list.length, ...list.filter(x => !gone.has(x.id)));
  render();
};
A.tplRmTask = el => {
  const d = S.ui.tplEditor;
  const tasks = d?.body?.tasks;
  if (!Array.isArray(tasks)) return;
  tasks.splice(Number(el.dataset.ti), 1);
  d.parentPick = null;
  render();
};
A.tplAddTask = () => {
  const d = S.ui.tplEditor;
  if (d?.kind !== 'project') return;
  d.body.tasks.push({ title: '', subtasks: [] });
  render();
};
/* Enter on the add-subtask row: the keyboard handler dispatches KEY[keyEnter]. */
KEY.tplAddSub = el => {
  const d = S.ui.tplEditor;
  if (!d) return;
  const list = listAt(d, el.dataset.ti);
  list.push({ id: uid('s'), parentId: null, position: nextPosition(list, null), title: el.value.trim(), done: false });
  render();
};

/* ---------- actions: editor save / delete (the store cycle, D-15 discipline) ---------- */
A.tplSave = () => {
  const d = S.ui.tplEditor;
  if (!d) return;
  if (d.kind === 'project') d.body.name = d.name || d.body.name || '';
  const record = { ...d, position: d.position ?? null };
  delete record.parentPick;
  A.saveTemplate(record);
  S.ui.tplEditor = null;
  closeModal();
};
A.tplEditorDelete = () => {
  const d = S.ui.tplEditor;
  if (!d?.id) return;
  confirmDlg({
    title: t('templates.deleteTitle', { name: esc(d.name) }),
    body: t('templates.deleteBody'),
    ok: t('act.delete'),
    icon: 'trash-2',
    danger: true,
    run: async () => {
      await A.tplDeleteConfirm({ dataset: { id: d.id } });
    },
  });
};
A.tplDelete = el => {
  S.ui.tplDelId = el.dataset.id;
  render();
};
A.tplDeleteCancel = () => {
  S.ui.tplDelId = null;
  render();
};
A.tplDeleteConfirm = async el => {
  const id = el.dataset.id;
  const snap = snapshot();
  let gone = null;
  if (
    !mutate(() => {
      const list = D().templates || (D().templates = []);
      const i = list.findIndex(x => x.id === id);
      if (i >= 0) gone = list.splice(i, 1)[0];
    }) ||
    !gone
  )
    return;
  S.ui.tplDelId = null;
  if (S.ui.tplEditor?.id === id) {
    S.ui.tplEditor = null;
    closeModal();
  }
  const res = await pushNow();
  if (!res.ok) {
    restore(snap);
    render();
    toast(res.status === 409 ? t('modal.settingsConflict') : t('err.templateSaveFailed'), { kind: 'err' });
    return;
  }
  render();
  toast(t('toast.removed', { name: gone?.name || '' }));
};

/* ---------- actions: settings reorder (one-node position moves, D-03) ---------- */
async function tplSwap(a, b) {
  const snap = snapshot();
  let ok = false;
  if (
    !mutate(() => {
      const p = a.position;
      a.position = b.position;
      b.position = p;
      ok = true;
    }) ||
    !ok
  )
    return;
  const res = await pushNow();
  if (!res.ok) {
    restore(snap);
    render();
    toast(res.status === 409 ? t('modal.settingsConflict') : t('err.templateSaveFailed'), { kind: 'err' });
    return;
  }
  render();
}
A.tplUp = el => {
  const list = [...(D().templates || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const i = list.findIndex(x => x.id === el.dataset.id);
  if (i > 0) tplSwap(list[i], list[i - 1]);
};
A.tplDown = el => {
  const list = [...(D().templates || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const i = list.findIndex(x => x.id === el.dataset.id);
  if (i >= 0 && i < list.length - 1) tplSwap(list[i], list[i + 1]);
};

/* ---------- actions: the picker pick (D-11 → the 66-02 single doc-PUT) ---------- */
A.tplPick = async el => {
  const tm = (D().templates || []).find(x => x.id === el.dataset.id);
  if (!tm) return;
  closeModal();
  if (tm.kind === 'task') {
    /* Only a LIVE, visible project may anchor the landed task — the
       create-form's 'p1' fallback would land a ghost-project ref the
       drawer's canSee gate then silently refuses to open (66-03 e2e
       finding). A missing/hidden project lands the task unfiled. */
    const pid = S.ui.form?.project;
    const landed = await A.instantiateTemplate(tm.id, { project: pid && proj(pid) ? pid : undefined });
    if (landed && landed.project && canSee(proj(landed.project))) A.openTask({ dataset: { id: landed.id } });
  } else {
    const landed = await A.instantiateTemplate(tm.id);
    if (landed) go('project', { id: landed.id });
  }
};
