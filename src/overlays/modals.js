/* ---------------- MODALS ---------------- */
import { $$, ago, esc, fmtDate, foldForSearch, modKey } from '../core/utils.js';
import { t, tErr } from '../core/i18n.js';
import { ic } from '../core/icons.js';
import { PCOLORS, PICONS, LB } from '../core/constants.js';
import { buildExportModel } from '../export/model.js';
import { applyView, viewOf } from '../shell/view-engine.js';
import { D, S, canManageProject, mem, pColor, proj, task, tasksOf, teamsList, visibleProjects } from '../core/store.js';
import { api } from '../core/api.js';
import { FT, av, filePrev, lbl, prPill, stPill } from '../ui/helpers.js';
import { focusKey, render } from '../shell/render.js';
import { teamModal } from '../features/teams.js';
import { RECUR } from './popovers.js';
/* The stored recur value's catalogue key. */
const RECUR_KEY = Object.fromEntries(RECUR.map(x => [x.stored, x.key]));

export function openModal(m) {
  S.ui.modalOpeners = S.ui.modalOpeners || [];
  S.ui.modalOpeners[S.ui.modals.length] = S.ui.popOpener && S.ui.pop ? S.ui.popOpener : focusKey(document.activeElement);
  S.ui.modals.push(m);
  S.ui.pop = null;
  render();
  setTimeout(() => {
    const all = $$('.modal');
    const last = all[all.length - 1];
    const af = last?.querySelector('[autofocus]');
    (af || last?.querySelector('input,textarea,button'))?.focus();
  }, 30);
}
export function closeModal() {
  S.ui.modals.pop();
  S.ui.pop = null;
  render();
}
export function modalHtml(m) {
  const H = (title, sub = '') =>
    `<div class="modal-h"><div><h2 id="mt-${m.type}">${title}</h2>${sub ? `<div class="muted" style="font-size:12.5px;margin-top:2px">${sub}</div>` : ''}</div><button class="ibtn ibtn-sm" data-a="closeModal" aria-label="${t('a11y.close')}">${ic('x', 16)}</button></div>`;
  const wrap = (cls, inner) => `<div class="modal ${cls}" role="dialog" aria-modal="true" aria-labelledby="mt-${m.type}">${inner}</div>`;
  switch (m.type) {
    case 'task':
      return wrap('', taskModal(m, H));
    /* [53-03 D-04] One unified project settings modal — the only settings
       surface. Editing routes here from the gear and every Share entry
       (D-05). Creation has its own create-only modal (projectCreate). */
    case 'projectSettings':
      return wrap('', projectSettingsModal(m, H));
    case 'export':
      return wrap('', exportModal(m, H));
    case 'projectCreate':
      return wrap('', projectCreateModal(m, H));
    case 'invite':
      return wrap('', inviteModal(m, H));
    case 'confirm':
      return wrap('sm', confirmModal(m, H));
    case 'recovery':
      /* D-53/T-16-10: the one-time recovery-codes modal. The codes live ONLY
         in the transient S.ui.recoveryCodes render state — cleared by
         A.recoveryDismiss on dismiss, never written to localStorage/
         sessionStorage, never re-displayed afterwards. Copy-all is the only
         duplication path. */
      return wrap(
        'sm',
        `${H(t('settings.tfa.modalTitle'), t('settings.tfa.recoveryDesc'))}<div class="modal-b"><pre style="font-family:var(--mono,monospace);font-size:14px;line-height:1.9;margin:0;user-select:all">${(S.ui.recoveryCodes || []).map(esc).join('\n')}</pre></div><div class="modal-f"><button class="btn btn-secondary" data-a="copyText" data-text="${esc((S.ui.recoveryCodes || []).join('\n'))}">${t('settings.tfa.copyAll')}</button><span class="sp"></span><button class="btn btn-primary" data-a="recoveryDismiss">${t('settings.tfa.dismiss')}</button></div>`,
      );
    case 'prompt':
      return wrap(
        'sm',
        `${H(m.title)}<form class="modal-b" data-submit="promptSubmit"><div class="field"><label class="label" for="prompt-in">${esc(m.label)}</label><input class="input" id="prompt-in" value="${esc(m.value || '')}" autofocus></div></form><div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">${t('common.cancel')}</button><button class="btn btn-primary" data-a="promptSubmit">${esc(m.ok || t('common.save'))}</button></div>`,
      );
    case 'shortcuts':
      return wrap('lg', shortcutsModal(H));
    case 'team':
      return wrap('', teamModal(m, H));
    case 'memberTeams': {
      const st = S.ui.memberTeams || { teams: [], scope: { teams: [], projects: [] } };
      /* SCOPE-01 (Phase 29, D-09/D-10): the member edit modal gains the scope
         editor — the same multi-selects as the invite form, PUT to
         /members/:uid/scope on submit. D-04: admin/owner targets are always
         workspace-wide, so they get a fixed note instead of an editor. The
         editor starts untouched — submitting without touching the pickers
         never writes scope (a blind clear would wipe an invite-carried scope
         the acting admin cannot read back: D-05 keeps the payload silent). */
      const target = mem(st.id);
      const adminTarget = !!target && (target.role === 'Admin' || target.role === 'Owner');
      const sc = st.scope || { teams: [], projects: [] };
      const scopePicker = (list, action, icon) =>
        `<div class="tmpls" role="group" aria-label="${t('modal.scopeSection')}">${teamsList()
          .map(
            tm =>
              `<button type="button" role="checkbox" aria-checked="${list.includes(tm.id)}" class="opt ${list.includes(tm.id) ? 'on' : ''}" data-a="${action}" data-v="${tm.id}" style="padding:8px">${ic(icon, 14)}<b style="font-size:12.5px">${esc(tm.name)}</b>${list.includes(tm.id) ? ic('check', 13) : ''}</button>`,
          )
          .join('')}</div>`;
      const scopeBlock = adminTarget
        ? `<fieldset class="field" style="border:0;padding:0;margin:0"><legend class="label" style="margin-bottom:6px">${t('modal.scopeSection')}</legend><span class="hint">${t('modal.scopeFixedHint')}</span></fieldset>`
        : `<fieldset class="field" style="border:0;padding:0;margin:0"><legend class="label" style="margin-bottom:6px">${t('modal.scopeSection')}</legend><div class="field" style="margin:0"><span class="hint" style="margin:0 0 4px">${t('modal.scopeProjectsLabel')}</span>${scopePicker(sc.projects, 'mScopeProjToggle', 'folder')}</div><div class="field" style="margin:0"><span class="hint" style="margin:8px 0 4px">${t('modal.scopeTeamsLabel')}</span>${scopePicker(sc.teams, 'mScopeTeamToggle', 'users')}</div><span class="hint">${t('modal.workspaceWideHint')}</span></fieldset>`;
      return wrap(
        'sm',
        `${H(t('act.editTeams'), esc(st.name || ''))}<form class="modal-b" data-submit="submitMemberTeams"><fieldset class="field" style="border:0;padding:0;margin:0"><legend class="label" style="margin-bottom:6px">${t('nav.route.team')}</legend><div class="tmpls" role="group" aria-label="${t('nav.route.team')}">${teamsList()
          .map(
            tm =>
              `<button type="button" role="checkbox" aria-checked="${st.teams.includes(tm.id)}" class="opt ${st.teams.includes(tm.id) ? 'on' : ''}" data-a="mteamToggle" data-v="${tm.id}" style="padding:8px">${ic('users', 14)}<b style="font-size:12.5px">${esc(tm.name)}</b>${st.teams.includes(tm.id) ? ic('check', 13) : ''}</button>`,
          )
          .join(
            '',
          )}</div><span class="hint">${t('modal.memberTeamsHint')}</span></fieldset>${scopeBlock}</form><div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">${t('common.cancel')}</button><button class="btn btn-primary" data-a="submitMemberTeams">${t('act.saveChanges')}</button></div>`,
      );
    }
    case 'filePreview':
      return wrap(m.file?.type === 'pdf' ? 'xl' : 'lg', filePreviewModal(m, H));
    case 'saveView':
      return wrap(
        'sm',
        `${H(t('modal.saveView'), t('modal.saveViewHint'))}<form class="modal-b" data-submit="saveViewSubmit"><div class="field"><label class="label" for="sv-name">${t('act.viewName')}</label><input class="input" id="sv-name" placeholder="${t('a11y.viewNameExample')}" autofocus></div><div class="field"><label class="label" for="sv-type">${t('modal.layout')}</label><select class="select" id="sv-type"><option value="list">${t('nav.tab.list')}</option><option value="board">${t('nav.tab.board')}</option><option value="table">${t('nav.tab.table')}</option></select></div>${m.nf ? `<div class="hint">${t('modal.saveView.filters', { n: m.nf })}</div>` : '<div class="alert info">' + ic('info', 14) + `<span>${t('modal.saveViewNoFilters')}</span></div>`}</form><div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">${t('common.cancel')}</button><button class="btn btn-primary" data-a="saveViewSubmit">${t('modal.saveView')}</button></div>`,
      );
  }
  return '';
}
export function formChip(pop, html, label) {
  return `<button class="pillbtn bordered" data-a="pop" data-pop="${pop}" data-id="__form" ${pop === 'date' ? `data-field="${label}"` : ''} aria-label="${esc(label)}">${html}</button>`;
}
export function taskModal(m, H) {
  const f = S.ui.form;
  const p = proj(f.project);
  const err = S.ui.errors.title;
  return `${H(m.edit ? t('act.editTask') : t('act.newTask'), m.edit ? `<span class="mono">${task(m.edit)?.key}</span>` : '')}
  <form class="modal-b" data-submit="submitTask" style="gap:12px">
    <div class="field"><label class="sr" for="f-title">${t('modal.taskName')}</label><input class="input input-lg ${err ? 'is-error' : ''}" id="f-title" data-in="form" data-f="title" value="${esc(f.title)}" placeholder="${t('modal.taskName')}" autofocus aria-invalid="${!!err}" aria-describedby="f-title-err" style="font-size:15px;font-weight:500">${err ? `<span class="err" id="f-title-err">${ic('circle-alert', 12)}${err}</span>` : ''}</div>
    <div class="field"><label class="sr" for="f-desc">${t('modal.description')}</label><textarea class="textarea" id="f-desc" data-in="form" data-f="desc" placeholder="${t('a11y.descOptional')}" rows="3">${esc(f.desc)}</textarea></div>
    <div class="row" style="flex-wrap:wrap;gap:6px">
      ${formChip('project', `<span class="pdot" style="--c:${pColor(p)}"></span>${esc(p?.name || t('page.field.project'))}`, t('page.field.project'))}
      ${formChip('status', stPill(f.status), t('page.field.status'))}
      ${formChip('assignee', `${av(f.assignee, 'sm', false)}${esc(mem(f.assignee)?.name || t('page.field.assignee'))}`, t('page.field.assignee'))}
      ${formChip('priority', prPill(f.priority), t('page.field.priority'))}
      ${formChip('date', `${ic('calendar', 13)}${f.due ? t('modal.duePrefix') + fmtDate(f.due) : t('page.field.due')}`, 'due')}
      ${formChip('date', `${ic('calendar-arrow-up', 13)}${f.start ? t('modal.startsPrefix') + fmtDate(f.start) : t('page.sort.start')}`, 'start')}
      ${formChip('labels', f.labels.length ? f.labels.map(lbl).join('') : `${ic('tag', 13)}${t('page.field.labels')}`, t('page.field.labels'))}
      ${formChip('recur', `${ic('repeat', 13)}${f.recur ? t(RECUR_KEY[f.recur] || 'popover.recurNone') : t('page.field.repeat')}`, t('page.field.repeat'))}
    </div>
    <div class="field"><span class="label">${t('modal.subtasks')}</span>
      ${f.subtasks.map((s, i) => `<div class="subt" style="padding:0 4px">${ic('circle', 13)}<span class="s">${esc(s.title)}</span><button type="button" class="ibtn ibtn-xs x" style="opacity:1" data-a="formRmSub" data-i="${i}" aria-label="${t('act.remove')}">${ic('x', 12)}</button></div>`).join('')}
      <div class="inwrap">${ic('plus', 14)}<input class="input" id="f-sub" data-key-enter="formAddSub" placeholder="${t('a11y.subtaskEnter')}"></div></div>
    <div class="field"><span class="label">${t('modal.attachments')}</span>
      ${f.files.length ? `<div class="col" style="gap:4px">${f.files.map((x, i) => `<div class="upl" style="padding:6px 10px"><span class="ftype" style="--c:${FT[x.type].c};width:22px;height:22px">${ic(FT[x.type].i, 12)}</span><span class="grow trunc">${esc(x.name)}</span><span class="faint" style="font-size:11.5px">${x.size}</span><button type="button" class="ibtn ibtn-xs" data-a="formRmFile" data-i="${i}" aria-label="${t('act.remove')}">${ic('x', 12)}</button></div>`).join('')}</div>` : ''}
      <label class="dropzone" style="padding:10px">${ic('paperclip', 14)}<span>${t('modal.attachFiles')}</span><input type="file" multiple hidden data-in="formFiles"></label></div>
  </form>
  <div class="modal-f">${m.edit ? '' : `<label class="row" style="gap:8px;font-size:12.5px;color:var(--text-2);cursor:pointer"><input type="checkbox" class="toggle" id="f-more" data-in="formMore" ${f.more ? 'checked' : ''}>${t('act.createMore')}</label>`}<span class="sp"></span>
    <span class="faint hide-m" style="font-size:11.5px"><kbd>${modKey()}</kbd> <kbd>↵</kbd></span>
    <button class="btn btn-secondary" data-a="closeModal">${t('common.cancel')}</button><button class="btn btn-primary" data-a="submitTask" id="f-submit">${m.edit ? t('act.saveChanges') : t('palette.createTask')}</button></div>`;
}
/* The project templates. The id is the stable stored value; the name, the
   description and the starter task titles are catalogue data keyed on the id
   (project.template.<id>.*), rendered through t() wherever they display. A
   task created from a template stores the locale-rendered title at creation. */
export const TEMPLATES = [
  { id: 'blank', icon: 'file', tasks: 0 },
  { id: 'product', icon: 'target', tasks: 6 },
  { id: 'web', icon: 'globe', tasks: 6 },
  { id: 'mkt', icon: 'megaphone', tasks: 6 },
  { id: 'design', icon: 'palette', tasks: 5 },
  { id: 'software', icon: 'code', tasks: 6 },
  { id: 'personal', icon: 'heart', tasks: 4 },
];
/* [53-03 D-04] The General-tab field set of the unified project settings
   modal — the former project modal edit fields moved verbatim: same
   data-in/data-f names, same S.ui.pform model, same submitProject form. The
   template picker is create-only and lives in projectCreateModal below. */
export function settingsGeneralFields(m) {
  const f = S.ui.pform;
  const err = S.ui.errors.pname;
  const leadLocked = !!m.edit && !canManageProject(proj(m.edit));
  /* [2026-11-09 owner ruling] Team selection lives ONLY in the Access tab on
     edit — the General-tab chips duplicated it and their submit would clobber
     Access-tab links. The create form keeps the chips (initial teaming). */
  const teamsField = m.edit
    ? ''
    : `<div class="field" style="flex:1;min-width:150px"><span class="label">${t('nav.route.team')}</span><div class="tmpls" role="group">${teamsList()
        .map(
          tm =>
            `<button type="button" role="checkbox" aria-checked="${f.teams.includes(tm.id)}" class="opt ${f.teams.includes(tm.id) ? 'on' : ''}" data-a="pformTeamToggle" data-v="${tm.id}" style="padding:8px">${ic('users', 14)}<b style="font-size:12.5px">${esc(tm.name)}</b>${f.teams.includes(tm.id) ? ic('check', 13) : ''}</button>`,
        )
        .join('')}</div><span class="hint">${t('modal.teamsHint')}</span></div>`;
  return `<div class="row" style="gap:10px;align-items:flex-start">
      <button type="button" class="picon lg" style="--c:${PCOLORS[f.color]};cursor:default;flex-shrink:0;margin-top:22px" aria-hidden="true" tabindex="-1">${ic(f.icon, 18)}</button>
      <div class="field grow"><label class="label" for="p-name">${t('modal.projectName')}</label><input class="input ${err ? 'is-error' : ''}" id="p-name" data-in="pform" data-f="name" value="${esc(f.name)}" placeholder="${t('modal.projectNamePlaceholder')}" autofocus aria-invalid="${!!err}">${err ? `<span class="err">${ic('circle-alert', 12)}${err}</span>` : ''}</div>
    </div>
    <div class="field"><label class="label" for="p-desc">${t('modal.description')}</label><textarea class="textarea" id="p-desc" data-in="pform" data-f="desc" rows="2" placeholder="${t('a11y.projectDescExample')}">${esc(f.desc)}</textarea></div>
    <div class="row" style="gap:16px;align-items:flex-start;flex-wrap:wrap">
      <div class="field" style="flex:1;min-width:220px"><span class="label">${t('modal.icon')}</span><div class="iconpick" role="radiogroup" aria-label="${t('modal.icon')}">${PICONS.map(i => `<button type="button" role="radio" aria-checked="${f.icon === i}" class="${f.icon === i ? 'on' : ''}" data-a="pformSet" data-f="icon" data-v="${i}" aria-label="${i}">${ic(i, 15)}</button>`).join('')}</div></div>
      <div class="field"><span class="label">${t('modal.color')}</span><div class="swatches" role="radiogroup" aria-label="${t('modal.color')}" style="max-width:140px">${Object.entries(
        PCOLORS,
      )
        .map(
          ([k, v]) =>
            `<button type="button" role="radio" aria-checked="${f.color === k}" class="sw ${f.color === k ? 'on' : ''}" style="--c:${v};width:22px;height:22px" data-a="pformSet" data-f="color" data-v="${k}" aria-label="${k}">${f.color === k ? ic('check', 12) : ''}</button>`,
        )
        .join('')}</div></div>
    </div>
    <div class="row" style="gap:12px;flex-wrap:wrap">
      ${teamsField}
      <div class="field" style="flex:1;min-width:150px"><label class="label" for="p-lead">${t('modal.lead')}</label><select class="select" id="p-lead" data-in="pform" data-f="lead" ${leadLocked ? 'disabled' : ''}>${D()
        .members.filter(x => x.status === 'active')
        .map(x => `<option value="${x.id}" ${f.lead === x.id ? 'selected' : ''}>${esc(x.name)}</option>`)
        .join('')}</select>${leadLocked ? `<span class="hint">${t('modal.leadLockHint')}</span>` : ''}</div>
      <div class="field" style="flex:1;min-width:150px"><label class="label" for="p-due">${t('modal.targetDate')}</label><input type="date" class="input" id="p-due" data-in="pform" data-f="due" value="${f.due || ''}"></div>
    </div>`;
}
/* The create-new-project form: the General field set plus the create-only
   template picker. Editing a project opens the unified projectSettings
   modal (53-03) — this renderer is create-only. */
export function projectCreateModal(m, H) {
  return `${H(t('act.newProject'), t('modal.projectHint'))}
  <form class="modal-b" data-submit="submitProject">
    ${settingsGeneralFields(m)}
    <div class="field"><span class="label">${t('modal.template')}</span><div class="tmpls" role="radiogroup">${TEMPLATES.map(tp => `<button type="button" role="radio" aria-checked="${S.ui.pform.tmpl === tp.id}" class="opt ${S.ui.pform.tmpl === tp.id ? 'on' : ''}" data-a="pformSet" data-f="tmpl" data-v="${tp.id}" style="padding:10px">${ic(tp.icon, 16)}<b style="font-size:12.5px">${t(`project.template.${tp.id}.name`)}</b><span>${tp.tasks ? t('common.starterTasks', { n: tp.tasks }) : t(`project.template.${tp.id}.desc`)}</span></button>`).join('')}</div></div>
  </form>
  <div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">${t('common.cancel')}</button><button class="btn btn-primary" data-a="submitProject">${t('palette.createProject')}</button></div>`;
}
export const PERMS = ['Can view', 'Can comment', 'Can edit', 'Full access'];
/* [2026-11-09 IN-01] Single source of truth: the server's PROJECT_PERMS must
   stay byte-identical to this literal — the tier ladder (indexOf ordering)
   and the perm dropdown are the same contract on both sides. Pinned in
   test/perm-drift.test.mjs. */
/* The permission names are STORED values the document holds; the display is a
   catalogue value keyed on the id (the lowercase-bridging rule: the last word
   of the stored name, lowercased, is the key — 'Can view' -> view, 'Full
   access' -> access). Derived, so no icon-name token is quoted in source. */
const PERM_KEYS = Object.fromEntries(PERMS.map(p => [p, p.split(' ').pop().toLowerCase()]));
/* [2026-11-09 IN-02] Exported for the perm-change toasts in actions.js — a
   toast interpolating the raw machine value leaked English copy in FR. */
export const permLabel = p => t('common.perm.' + (PERM_KEYS[p] ?? PERM_KEYS[PERMS[0]]));
/* [53-03 D-04] The Access body of the unified project settings modal — the
   former share modal content moved verbatim: the invite-by-email row, the
   Teams section, People with access and the General-access toggle, all with
   their existing immediate-action handlers (IN.sharePerm, IN.shareAccess,
   shareTeamInvite/Remove). Rendered from LIVE store state on every render —
   no open-time snapshot (53-03 Pitfall 3). */
export function accessBody(m) {
  const shareNeedle = foldForSearch(S.ui.shareQ || '').text;
  const p = proj(m.id);
  const canManage = canManageProject(p);
  const members = Array.isArray(p.members) ? p.members : [];
  /* [2026-11-08 D-51-9] The project's linked teams — invite list excludes them,
     the note below lists them with a remove action. */
  const linkedTeams = Array.isArray(p.teams) ? p.teams.filter(Boolean) : [];
  const perms = p.perms && typeof p.perms === 'object' ? p.perms : {};
  const lockHint = canManage ? '' : `<div class="alert info" style="margin-bottom:12px">${ic('lock', 14)}<span>${t('modal.shareLockHint')}</span></div>`;
  return `
    ${lockHint}
    ${
      canManage
        ? `<form class="row" style="gap:6px" data-submit="shareInvite"><div class="grow"><label class="sr" for="share-in">${t('a11y.inviteByEmail')}</label><input class="input" id="share-in" placeholder="${t('a11y.invitePlaceholder')}" value="${esc(S.ui.shareQ || '')}" data-in="shareQ" autofocus></div>
      <select class="select" id="share-perm" style="width:132px" aria-label="${t('modal.permission')}">${PERMS.map(x => `<option value="${x}" ${x === 'Can edit' ? 'selected' : ''}>${permLabel(x)}</option>`).join('')}</select>
      <button class="btn btn-primary" data-a="shareInvite" type="button">${t('act.invite')}</button></form>`
        : ''
    }
    ${
      S.ui.shareQ && canManage
        ? `<div class="panel" style="padding:4px">${
            D()
              .members.filter(
                x => !members.includes(x.id) && (foldForSearch(x.name).text.includes(shareNeedle) || foldForSearch(x.email).text.includes(shareNeedle)),
              )
              .map(
                x =>
                  `<button class="mi" data-a="shareAdd" data-id="${p.id}" data-mid="${x.id}">${av(x.id, 'sm', false)}${esc(x.name)}<span class="r">${esc(x.email)}</span></button>`,
              )
              .join('') ||
            `<div class="mi faint" style="cursor:default">${S.ui.shareQ.includes('@') ? t('modal.pressInvite', { email: esc(S.ui.shareQ) }) : t('modal.noMatchingMembers')}</div>`
          }</div>`
        : ''
    }
    ${
      /* [2026-11-08 D-51-5/6/7/8/9] The Teams section: workspace teams not yet
         linked offer an 'Invite team' action (no role choice on the link —
         D-51-7; the per-team perm level is chosen on the linked row). Linked
         teams render as rows with a per-team perm dropdown keyed on the team
         id (53-03 D-02: data-tid, writing p.perms['team:'+tid]; a freshly
         linked team reads 'Can edit' — the link action stores the explicit
         value, so absence-of-key is never load-bearing) plus the unlink
         action. The hint carries the LIVE team-semantics copy (D-51-8 per
         D-50-5) — access follows team membership, never a snapshot.
         [53-03 D-01] Non-managers keep the lock hint above and see the linked
         teams' perm levels as static muted spans — read-only coarse levels of
         a project they can already see (T-53-10), never editable controls. */
      canManage
        ? `<div style="border-top:1px solid var(--divider);padding-top:12px;margin-top:12px"><div class="eyebrow" style="margin-bottom:8px">${t('modal.teamsSection')}</div>
      <div class="tmpls" role="group" aria-label="${t('modal.teamsSection')}">${teamsList()
          .filter(tm => !linkedTeams.includes(tm.id))
          .map(
            tm =>
              `<button type="button" class="opt" data-a="shareTeamInvite" data-id="${p.id}" data-tid="${tm.id}" style="padding:8px" aria-label="${esc(t('a11y.inviteTeam', { name: tm.name }))}">${ic('users', 14)}<b style="font-size:12.5px">${esc(tm.name)}</b>${ic('plus', 13)}</button>`,
          )
          .join('')}</div>
      ${
        linkedTeams.length
          ? `<div class="col" style="gap:2px;margin-top:8px">${linkedTeams
              .map(tid => {
                const tm = teamsList().find(x => x.id === tid);
                if (!tm) return '';
                const stored = perms['team:' + tid];
                const perm = PERMS.includes(stored) ? stored : 'Can edit';
                return `<div class="row" style="height:34px">${ic('users', 14)}<b style="font-size:12.5px">${esc(tm.name)}</b><span class="sp"></span><select class="select" style="width:auto;height:26px;font-size:12px;border-color:transparent;background-color:transparent" data-in="teamPerm" data-id="${p.id}" data-tid="${tm.id}" aria-label="${t('modal.teamPermFor', { name: esc(tm.name) })}">${PERMS.map(q => `<option value="${q}" ${q === perm ? 'selected' : ''}>${permLabel(q)}</option>`).join('')}</select><button type="button" class="ibtn ibtn-xs" data-a="shareTeamRemove" data-id="${p.id}" data-tid="${tm.id}" aria-label="${t('act.remove')}">${ic('x', 12)}</button></div>`;
              })
              .join('')}</div>`
          : ''
      }
      <span class="hint">${t('modal.teamsLiveHint')}</span></div>`
        : linkedTeams.length
          ? `<div style="border-top:1px solid var(--divider);padding-top:12px;margin-top:12px"><div class="eyebrow" style="margin-bottom:8px">${t('modal.teamsSection')}</div><div class="col" style="gap:2px">${linkedTeams
              .map(tid => {
                const tm = teamsList().find(x => x.id === tid);
                if (!tm) return '';
                const stored = perms['team:' + tid];
                const perm = PERMS.includes(stored) ? stored : 'Can edit';
                return `<div class="row" style="height:34px">${ic('users', 14)}<b style="font-size:12.5px">${esc(tm.name)}</b><span class="sp"></span><span class="muted" style="font-size:12.5px;padding-right:8px">${esc(permLabel(perm))}</span></div>`;
              })
              .join('')}</div></div>`
          : ''
    }
    <div><div class="eyebrow" style="margin-bottom:4px">${t('modal.peopleWithAccess')}</div>
      ${members
        .map(id => {
          const x = mem(id);
          if (!x) return '';
          const perm = id === p.lead ? 'Full access' : perms[id] || (x.role === 'Guest' ? 'Can comment' : 'Can edit');
          return `<div class="row" style="height:44px">${av(id, 'md', false)}<div class="grow"><div style="font-weight:500;font-size:13px">${esc(x.name)}${id === D().me ? ` <span class="faint" style="font-weight:400">${t('common.youSuffix').trim()}</span>` : ''}</div><div class="faint" style="font-size:11.5px">${esc(x.email)}${id === p.lead ? ' ' + t('modal.projectLead') : ''}</div></div>
          ${
            id === p.lead || !canManage
              ? `<span class="muted" style="font-size:12.5px;padding-right:8px">${esc(permLabel(perm))}</span>`
              : `<select class="select" style="width:auto;height:26px;font-size:12px;border-color:transparent;background-color:transparent" data-in="sharePerm" data-id="${p.id}" data-mid="${id}" aria-label="${t('modal.permissionFor', { name: esc(x.name) })}">${PERMS.map(q => `<option value="${q}" ${q === perm ? 'selected' : ''}>${permLabel(q)}</option>`).join('')}<option value="__remove">${t('act.removeAccess')}</option></select>`
          }</div>`;
        })
        .join('')}
    </div>
    <div style="border-top:1px solid var(--divider);padding-top:12px"><div class="eyebrow" style="margin-bottom:8px">${t('modal.generalAccess')}</div>
      <div class="row" style="gap:10px"><span class="ftype" style="--c:var(--text-2)">${ic(p.private ? 'lock' : 'building-2', 14)}</span><div class="grow"><label class="row" style="gap:10px;font-size:12.5px;font-weight:500"><input type="checkbox" class="toggle" data-in="shareAccess" data-id="${p.id}" aria-label="${t('modal.generalAccess')}" ${p.private ? 'checked' : ''} ${canManage ? '' : 'disabled'}>${p.private ? t('modal.onlyInvited') : t('modal.everyoneAt', { name: esc(D().ws.name) })}</label><div class="faint" style="font-size:11.5px;padding-left:4px">${p.private ? t('modal.privateHint') : t('modal.workspaceHint')}</div></div></div></div>`;
}
/* [53-03 D-04/D-05] The unified project settings modal: one modal, two tabs.
   General hosts the former project-modal edit fields (settingsGeneralFields,
   same pform model and submitProject form); Access hosts the former
   share-modal body (accessBody, same immediate-action handlers). The tab
   state rides S.ui.settingsTab, seeded by the open action (A.projectSettings)
   from the entry point: the gear opens General, every Share entry opens
   Access (D-05). Both tabs render from live store state — a concurrent
   admin's adopted grant is visible on the next render, and no open-time
   snapshot ever feeds a submit (Pitfall 3). */
export function projectSettingsModal(m, H) {
  const p = proj(m.id);
  if (!p) return H(t('err.projectNotFound'));
  const tab = S.ui.settingsTab === 'access' ? 'access' : 'general';
  const tabBar = `<nav class="tabs" role="tablist" aria-label="${t('modal.settingsTabs')}">${[
    ['general', 'modal.settingsTabGeneral'],
    ['access', 'modal.settingsTabAccess'],
  ]
    .map(
      ([k, key]) =>
        `<button role="tab" aria-selected="${tab === k}" class="tab ${tab === k ? 'on' : ''}" data-a="settingsTab" data-v="${k}">${t(key)}</button>`,
    )
    .join('')}</nav>`;
  if (tab === 'access') {
    return `${H(t('modal.shareTitle', { name: esc(p.name) }))}${tabBar}
  <div class="modal-b">${accessBody(m)}</div>
  <div class="modal-f"><button class="btn btn-secondary" data-a="copyLink" data-pid="${p.id}">${ic('link', 14)}${t('act.copyLink')}</button><span class="sp"></span><button class="btn btn-primary" data-a="closeModal">${t('act.done')}</button></div>`;
  }
  return `${H(t('act.projectSettings'))}${tabBar}
  <form class="modal-b" data-submit="submitProject">${settingsGeneralFields(m)}</form>
  <div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">${t('common.cancel')}</button><button class="btn btn-primary" data-a="submitProject">${t('act.saveChanges')}</button></div>`;
}
/* [54-01 D-54-2] The export modal — the ONE surface of the CSV vertical
   slice. Row count and scope state ride S.ui.expOptions / S.ui.expScope /
   S.ui.expViewKey (set by A.exportOpen); every label reads the catalogue at
   render time; every project value passes esc. The submit guard re-checks
   canManageProject so a tampered DOM cannot post for a non-manager.
   The scope counts are derived from buildExportModel itself — the SAME
   selection the server (or the static writer) will produce. */
const EXP_OPTIONS = [
  ['descriptions', 'align-left'],
  ['comments', 'message-square'],
  ['subtasks', 'git-branch'],
  ['completed', 'circle-check'],
  ['archived', 'archive'],
];
export function exportModal(m, H) {
  const p = proj(m.id);
  if (!p || !canManageProject(p)) return H(t('err.projectNotFound'));
  const opts = { ...(S.ui.expOptions || {}) };
  const hasView = !!S.ui.expViewKey;
  const scope = hasView ? S.ui.expScope || 'all' : 'all';
  const ids = scope === 'view' && hasView ? applyView(tasksOf(p.id), viewOf(S.ui.expViewKey)).map(x => x.id) : undefined;
  const model = buildExportModel(D(), p.id, { scope, ids, options: opts }, { translate: t, labelName: id => LB[id]?.name || id, now: new Date() });
  const count = (model?.rows || []).length;
  const radio = (name, value, label, icon, checked, disabled = false) =>
    `<label class="opt ${checked ? 'on' : ''}${disabled ? ' off' : ''}" ${disabled ? 'aria-disabled="true"' : ''} style="${disabled ? 'opacity:.5' : ''}"><input type="radio" name="${name}" value="${value}" data-in="${name === 'expScope' ? 'exportScope' : 'exportFormat'}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>${ic(icon, 14)}${label}</label>`;
  /* 54-05: the format list is built per mode — Excel and Microsoft Project
     XML on the server build, CSV only on the static build (R9: the static
     writer is dependency-free CSV; the xlsx and MSPDI writers are
     server-only). Every rendered id is a server EXPORT_FORMATS key, so a
     rendered option is always a servable format. */
  const FORMATS = api.enabled ? [['xlsx', 'table-2'], ['mspdi', 'file-code'], ['csv', 'table-2']] : [['csv', 'table-2']];
  const fmt = S.ui.expFormat || FORMATS[0][0];
  /* [2026-11-10 owner redesign] the format picker is icon buttons (name in
     the tooltip + aria-label), NOT big cards; the include list is compact
     selectable rows. Scope keeps its card radios. The inputs keep the same
     data-in wiring — only the presentation changed. */
  const formatIcons = FORMATS.map(
    ([id, icon]) =>
      `<label class="xfmt ${fmt === id ? 'on' : ''}" title="${t('export.format.' + id)}"><input type="radio" name="expFormat" value="${id}" data-in="exportFormat" ${fmt === id ? 'checked' : ''} aria-label="${t('export.format.' + id)}">${ic(icon, 18)}</label>`,
  ).join('');
  const includeList = EXP_OPTIONS.map(
    ([key, icon]) =>
      `<label class="xinc ${opts[key] ? 'on' : ''}"><input type="checkbox" data-in="exportOption" data-key="${key}" ${opts[key] ? 'checked' : ''}>${ic(icon, 14)}<span class="grow">${t('export.option.' + key)}</span>${ic('check', 14)}</label>`,
  ).join('');
  return `${H(t('export.title', { name: esc(p.name) }))}
  <div class="modal-b">
    <div class="field"><span class="label">${t('export.format.label')}</span><div class="xfmts" role="radiogroup" aria-label="${t('export.format.label')}">${formatIcons}</div></div>
    <div class="field"><span class="label">${t('export.scope.label')}</span><div class="tmpls" role="radiogroup" aria-label="${t('export.scope.label')}">${radio('expScope', 'all', t('export.scope.all'), 'list', scope === 'all')}${radio('expScope', 'view', hasView ? t('export.scope.view') : t('export.scope.viewUnavailable'), 'list-filter', scope === 'view', !hasView)}</div></div>
    <div class="field"><span class="label">${t('export.options.label')}</span><div class="xincs" role="group" aria-label="${t('export.options.label')}">${includeList}</div></div>
    <div class="hint">${t('export.scope.count', { n: count })}${hasView ? '' : ` · ${t('export.scope.viewUnavailable')}`}</div>
    ${api.enabled && fmt === 'mspdi' ? `<div class="alert info">${ic('info', 14)}<span>${t('export.notice.mspdi')}</span></div>` : ''}
    ${api.enabled ? '' : `<div class="alert info">${ic('info', 14)}<span>${t('export.notice.staticMode')}</span></div>`}
  </div>
  <div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">${t('common.cancel')}</button><button class="btn btn-primary" data-a="exportSubmit" data-id="${p.id}" ${count === 0 ? 'disabled' : ''}>${ic('download', 14)}${t('export.submit')}</button></div>`;
}
/* The invite form's role options (29-04) — display labels stored as picker
   state; api.js bridges them to the API roles via its own map. */
const INVITE_ROLE_OPTIONS = ['Member', 'Admin', 'Guest'];
export function inviteModal(m, H) {
  const err = S.ui.errors.invite;
  const links = S.ui.inviteLinks || [];
  /* SCOPE-05/06 (Phase 29, D-09/D-10): the role select is the scope section's
     gate — admin/owner invites are workspace-wide by definition (D-04), so the
     scope section renders only for Member/Guest. The state rides
     S.ui.inviteScope; the Guest path (D-13) is a viewer + exactly one project. */
  const role = S.ui.inviteRole || INVITE_ROLE_OPTIONS[0];
  const scope = S.ui.inviteScope || (S.ui.inviteScope = { teams: [], projects: [] });
  const guest = role === 'Guest';
  /* [2026-11-09 INVT-02] The Projects chips list PROJECTS (visibleProjects),
     not teams — the picker previously rendered teamsList() for both rows, so
     the "Projects they can see" chips toggled team ids into
     S.ui.inviteScope.projects. The Teams row keeps teamsList(). */
  const scopePicker = (kind, list, action, icon) => {
    const items = kind === 'proj' ? visibleProjects() : teamsList();
    return `<div class="tmpls" role="group" aria-label="${t('modal.scopeSection')}">${items
      .map(
        it =>
          `<button type="button" role="checkbox" aria-checked="${list.includes(it.id)}" class="opt ${list.includes(it.id) ? 'on' : ''}" data-a="${action}" data-v="${it.id}" style="padding:8px">${ic(icon, 14)}<b style="font-size:12.5px">${esc(it.name)}</b>${list.includes(it.id) ? ic('check', 13) : ''}</button>`,
      )
      .join('')}</div>`;
  };
  /* [2026-11-09 D-06] The guest invariant expressed as disable+hint, never a
     silent clamp or role downgrade: with the Guest role and ≠1 project the
     send button is disabled and the localized hint shows. Chip toggles
     re-render, so this state re-evaluates on every toggle; the email draft
     is the only silent field (INVT-01). */
  const guestNeedsProject = guest && scope.projects.length !== 1;
  return `${H(t('modal.inviteTo', { name: esc(D().ws.name) }), api.mailEnabled ? t('modal.inviteMailHint') : api.enabled ? t('modal.inviteLinkHint') : t('modal.inviteLocalHint'))}
  <form class="modal-b" data-submit="submitInvite">
    <div class="field"><label class="label" for="inv-emails">${t('modal.emailAddresses')}</label><textarea class="textarea ${err ? 'is-error' : ''}" id="inv-emails" data-in="inviteDraft" placeholder="name@company.com, another@company.com" rows="3" autofocus>${esc(S.ui.inviteDraft || '')}</textarea>${err ? `<span class="err">${ic('circle-alert', 12)}${err}</span>` : `<span class="hint">${t('modal.emailHint')}</span>`}</div>
    <div class="row" style="gap:12px"><div class="field grow"><label class="label" for="inv-role">${t('modal.role')}</label><select class="select" id="inv-role" data-in="invRole">${INVITE_ROLE_OPTIONS.map(r => `<option ${role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div></div>
    <div class="field"><span class="label">${t('nav.route.team')}</span><div class="tmpls" role="group" aria-label="${t('nav.route.team')}">${teamsList()
      .map(tm => {
        const on = (S.ui.inviteTeams || []).includes(tm.id);
        return `<button type="button" role="checkbox" aria-checked="${on}" class="opt ${on ? 'on' : ''}" data-a="invTeamToggle" data-v="${tm.id}" style="padding:8px">${ic('users', 14)}<b style="font-size:12.5px">${esc(tm.name)}</b>${on ? ic('check', 13) : ''}</button>`;
      })
      .join('')}</div><span class="hint">${t('modal.inviteTeamsHint')}</span></div>
    ${
      role === 'Admin'
        ? ''
        : `<div class="field"><span class="label">${t('modal.scopeSection')}</span>
    <div class="field" style="margin:0"><span class="hint" style="margin:0 0 4px">${t('modal.scopeProjectsLabel')}</span>${scopePicker('proj', scope.projects, 'invProjToggle', 'folder')}</div>
    <div class="field" style="margin:0"><span class="hint" style="margin:8px 0 4px">${t('modal.scopeTeamsLabel')}</span>${scopePicker('team', scope.teams, 'invScopeTeamToggle', 'users')}</div>
    <label class="row" style="gap:8px;font-size:12.5px;color:var(--text-2);cursor:pointer;margin-top:8px"><input type="checkbox" class="toggle" data-in="invGuest" ${guest ? 'checked' : ''}>${t('modal.guestToggle')}</label>
    <span class="hint">${guest ? t('modal.guestHint') : t('modal.workspaceWideHint')}</span></div>`
    }
    <div class="alert info">${ic('info', 14)}<span><b>${t('modal.guests')}</b> ${t('modal.guestsHint')}</span></div>
    ${
      links.length
        ? `<div class="field"><span class="label">${t('modal.inviteLinks')}</span>${links
            .map(l => {
              const status = l.sent ? t('modal.sent') : l.error ? t('modal.notSent') : '';
              return `<div class="row" style="gap:8px;margin-bottom:6px"><input class="input" readonly value="${esc(l.url)}" aria-label="${l.email ? t('modal.inviteLinkFor', { email: esc(l.email) }) : t('modal.inviteLink')}" style="font-size:12px"><span class="faint" style="font-size:11px;white-space:nowrap" title="${esc(tErr(l.code, l, l.error || ''))}">${status}</span><button type="button" class="btn btn-secondary btn-sm" data-a="copyText" data-text="${esc(l.url)}">${t('act.copy')}</button></div>`;
            })
            .join(
              '',
            )}<span class="hint">${links.some(l => l.email) ? (api.mailEnabled ? (links.every(l => !l.email || l.sent) ? t('modal.linksHintMail') : t('modal.linksHintPartial')) : t('modal.linksHintLink')) : t('modal.linksHintManual')}</span></div>`
        : ''
    }
  </form>
  <div class="modal-f"><button class="btn btn-ghost" data-a="copyInviteLink">${ic('link', 14)}${t('act.copyInviteLink')}</button><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">${t('common.cancel')}</button>${guestNeedsProject ? `<span class="hint" role="status">${t('modal.inviteGuestNeedsProject')}</span>` : ''}<button class="btn btn-primary" data-a="submitInvite" id="inv-submit" ${guestNeedsProject ? 'disabled' : ''}>${api.mailEnabled ? t('act.sendInvites') : api.enabled ? t('act.createLinks') : t('act.sendInvites')}</button></div>`;
}
export function confirmModal(m) {
  const needs = m.typeName;
  const ok = !needs || (S.ui.confirmText || '') === needs;
  return `<div class="modal-b" style="padding-top:18px;gap:10px">
    <div class="row" style="gap:12px;align-items:flex-start"><span class="ftype" style="--c:${m.danger ? 'var(--red)' : 'var(--amber)'};width:34px;height:34px;border-radius:9px">${ic(m.icon || (m.danger ? 'trash-2' : 'archive'), 17)}</span>
    <div class="grow"><h2 id="mt-confirm" style="font-size:15px;font-weight:600;margin:4px 0 6px">${esc(m.title)}</h2><p class="muted" style="margin:0;font-size:13px;line-height:1.55">${m.body}</p></div></div>
    ${needs ? `<div class="field" style="margin-top:6px"><label class="label" for="confirm-in" style="font-weight:400;color:var(--text-2)">${t('modal.confirmTypeLead')} <b style="color:var(--text);font-weight:600">${esc(needs)}</b> ${t('modal.confirmTypeTail')}</label><input class="input" id="confirm-in" data-in="confirmText" autocomplete="off" autofocus value="${esc(S.ui.confirmText || '')}"></div>` : ''}
  </div>
  <div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal" ${needs ? '' : 'autofocus'}>${t('common.cancel')}</button><button class="btn ${m.danger ? 'btn-danger' : 'btn-primary'}" data-a="confirmOk" ${ok ? '' : 'disabled'}>${esc(m.ok)}</button></div>`;
}
/* The shortcut names and their group headings are catalogue keys; the kbd
   arrays are machine key sequences and stay exactly as they are. The 'MOD'
   entries are the modifier sentinel: the renderer substitutes modKey() at
   render time, so the table itself stays a static module-level constant. */
export const SHORTCUTS = [
  [
    'modal.sc.general',
    [
      ['palette.commandMenu', ['MOD', 'K']],
      ['palette.scope.search', ['/']],
      ['palette.keyboardShortcuts', ['?']],
      ['palette.toggleSidebar', ['[']],
      ['act.toggleDarkMode', ['MOD', 'Shift', 'L']],
      ['modal.sc.closePanel', ['Esc']],
    ],
  ],
  [
    'modal.sc.create',
    [
      ['act.newTask', ['N']],
      ['act.newProject', ['P']],
      ['modal.sc.submitForm', ['MOD', '↵']],
      ['modal.sc.sendComment', ['MOD', '↵']],
    ],
  ],
  [
    'modal.sc.navigate',
    [
      ['nav.goHome', ['G', 'H']],
      ['nav.goMyTasks', ['G', 'T']],
      ['nav.goProjects', ['G', 'P']],
      ['nav.goInbox', ['G', 'I']],
      ['nav.goCalendar', ['G', 'C']],
      ['nav.goSettings', ['G', 'S']],
    ],
  ],
  [
    'palette.commandMenu',
    [
      ['modal.sc.moveSelection', ['↑', '↓']],
      ['modal.sc.runCommand', ['↵']],
      ['modal.sc.searchMode', ['Tab']],
    ],
  ],
];
export function shortcutsModal(H) {
  return `${H(t('palette.keyboardShortcuts'))}<div class="modal-b" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:22px">${SHORTCUTS.map(([g, list]) => `<div><div class="eyebrow" style="margin-bottom:6px">${t(g)}</div>${list.map(([n, k]) => `<div class="row" style="height:30px;font-size:13px;border-bottom:1px solid var(--divider)"><span class="grow">${t(n)}</span>${k.map((x, i) => `${i && k[0] === 'G' ? '<span class="faint" style="font-size:11px">then</span>' : ''}<kbd>${x === 'MOD' ? modKey() : x}</kbd>`).join('')}</div>`).join('')}</div>`).join('')}</div>`;
}
export function filePreviewModal(m, H) {
  const f = m.file;
  const ft = FT[f.type] || FT.other;
  return `${H(esc(f.name), `${ft.n} · ${f.size} ${t('modal.uploadedBy', { name: esc(mem(f.by)?.name || 'you') })} ${ago(f.at)}`)}
  <div class="modal-b"><div style="border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden">${
    /* D-03/D-09: images and PDFs render the real bytes from the serving route;
       every other type keeps the icon-art download tile. Lists/grids are
       untouched (D-10). User-controlled values escape with esc() (T-12-09).
       G-12-4 (a): the PDF iframe swaps the old 16/9 clip for an explicit tall
       in-iframe viewport — Firefox renders its built-in PDF toolbar
       INSIDE the iframe and it was clipped by the ~296px 16/9 pane; the
       surrounding overflow:hidden wrapper clips nothing because it grows with
       the iframe. G-12-6: PDFs render in .modal.xl (900px) so the in-iframe
       viewport is ≈866px — at or above pdf.js's 750px WIDTH breakpoint, below
       which its @media rule hides the direct download/print buttons into the
       '»' secondary menu; images and other types stay at 'lg', and the image
       branch keeps aspect-ratio:16/9. */
    f.type === 'img'
      ? `<img src="/w/${D().ws.url}/file/${f.id}" alt="${esc(f.name)}" style="display:block;width:100%;aspect-ratio:16/9;object-fit:contain;background:var(--bg)">`
      : f.type === 'pdf'
        ? `<iframe src="/w/${D().ws.url}/file/${f.id}" title="${esc(f.name)}" style="display:block;width:100%;height:min(75vh,640px);border:0"></iframe>`
        : filePrev(f).replace('class="fprev"', 'class="fprev" style="aspect-ratio:16/9"')
  }</div>
  ${m.tid ? `<div class="row faint" style="font-size:12.5px">${ic('link', 13)}${t('modal.attachedTo')} <button class="link" data-a="openTask" data-id="${m.tid}">${esc(task(m.tid)?.title)}</button></div>` : ''}</div>
  <div class="modal-f">${
    /* G-12-6 hardening: a PDF-only footer Download anchor — a viewer-independent
       save affordance, so the download never depends on the embedded viewer's
       toolbar width behaviour. Native same-origin navigation (no data-a): the
       download attribute overrides the route's inline Content-Disposition
       client-side, and the filename is esc()-escaped (T-12-18) since it is
       user-controlled and lands in a double-quoted attribute. */
    f.type === 'pdf'
      ? `<a class="btn btn-secondary" href="/w/${D().ws.url}/file/${f.id}" download="${esc(f.name)}">${ic('download', 14)}${t('act.download')}</a>`
      : ''
  }<button class="btn btn-secondary" data-a="copyLink" data-fid="${f.id}">${ic('link', 14)}${t('act.copyLink')}</button><span class="sp"></span><button class="btn btn-primary" data-a="closeModal">${t('a11y.close')}</button></div>`;
}
