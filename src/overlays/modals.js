/* ---------------- MODALS ---------------- */
import { $$, MOD, ago, esc, fmtDate, foldForSearch } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { ic } from '../core/icons.js';
import { PCOLORS, PICONS } from '../core/constants.js';
import { D, S, canManageProject, mem, pColor, proj, task, teamsList } from '../core/store.js';
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
    case 'project':
      return wrap('', projectModal(m, H));
    case 'share':
      return wrap('', shareModal(m, H));
    case 'invite':
      return wrap('', inviteModal(m, H));
    case 'confirm':
      return wrap('sm', confirmModal(m, H));
    case 'prompt':
      return wrap(
        'sm',
        `${H(m.title)}<form class="modal-b" data-submit="promptSubmit"><div class="field"><label class="label" for="prompt-in">${esc(m.label)}</label><input class="input" id="prompt-in" value="${esc(m.value || '')}" autofocus></div></form><div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">${t('common.cancel')}</button><button class="btn btn-primary" data-a="promptSubmit">${esc(m.ok || t('common.save'))}</button></div>`,
      );
    case 'shortcuts':
      return wrap('lg', shortcutsModal(H));
    case 'team':
      return wrap('', teamModal(m, H));
    case 'filePreview':
      return wrap('lg', filePreviewModal(m, H));
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
    <span class="faint hide-m" style="font-size:11.5px"><kbd>${MOD}</kbd> <kbd>↵</kbd></span>
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
export function projectModal(m, H) {
  const f = S.ui.pform;
  const err = S.ui.errors.pname;
  const leadLocked = !!m.edit && !canManageProject(proj(m.id));
  return `${H(m.edit ? t('act.projectSettings') : t('act.newProject'), m.edit ? '' : t('modal.projectHint'))}
  <form class="modal-b" data-submit="submitProject">
    <div class="row" style="gap:10px;align-items:flex-start">
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
      <div class="field" style="flex:1;min-width:150px"><label class="label" for="p-team">${t('nav.route.team')}</label><select class="select" id="p-team" data-in="pform" data-f="team">${teamsList()
        .map(tm => `<option value="${tm.id}" ${f.team === tm.id ? 'selected' : ''}>${esc(tm.name)}</option>`)
        .join('')}</select></div>
      <div class="field" style="flex:1;min-width:150px"><label class="label" for="p-lead">${t('modal.lead')}</label><select class="select" id="p-lead" data-in="pform" data-f="lead" ${leadLocked ? 'disabled' : ''}>${D()
        .members.filter(x => x.status === 'active')
        .map(x => `<option value="${x.id}" ${f.lead === x.id ? 'selected' : ''}>${esc(x.name)}</option>`)
        .join('')}</select>${leadLocked ? `<span class="hint">${t('modal.leadLockHint')}</span>` : ''}</div>
      <div class="field" style="flex:1;min-width:150px"><label class="label" for="p-due">${t('modal.targetDate')}</label><input type="date" class="input" id="p-due" data-in="pform" data-f="due" value="${f.due || ''}"></div>
    </div>
    ${m.edit ? '' : `<div class="field"><span class="label">${t('modal.template')}</span><div class="tmpls" role="radiogroup">${TEMPLATES.map(tp => `<button type="button" role="radio" aria-checked="${f.tmpl === tp.id}" class="opt ${f.tmpl === tp.id ? 'on' : ''}" data-a="pformSet" data-f="tmpl" data-v="${tp.id}" style="padding:10px">${ic(tp.icon, 16)}<b style="font-size:12.5px">${t(`project.template.${tp.id}.name`)}</b><span>${tp.tasks ? t('common.starterTasks', { n: tp.tasks }) : t(`project.template.${tp.id}.desc`)}</span></button>`).join('')}</div></div>`}
  </form>
  <div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">${t('common.cancel')}</button><button class="btn btn-primary" data-a="submitProject">${m.edit ? t('act.saveChanges') : t('palette.createProject')}</button></div>`;
}
export const PERMS = ['Can view', 'Can comment', 'Can edit', 'Full access'];
/* The permission names are STORED values the document holds; the display is a
   catalogue value keyed on the id (the lowercase-bridging rule: the last word
   of the stored name, lowercased, is the key — 'Can view' -> view, 'Full
   access' -> access). Derived, so no icon-name token is quoted in source. */
const PERM_KEYS = Object.fromEntries(PERMS.map(p => [p, p.split(' ').pop().toLowerCase()]));
const permLabel = p => t('common.perm.' + (PERM_KEYS[p] ?? PERM_KEYS[PERMS[0]]));
export function shareModal(m, H) {
  const shareNeedle = foldForSearch(S.ui.shareQ || '').text;
  const p = proj(m.id);
  if (!p) return H(t('err.projectNotFound'));
  const canManage = canManageProject(p);
  const members = Array.isArray(p.members) ? p.members : [];
  const perms = p.perms && typeof p.perms === 'object' ? p.perms : {};
  const lockHint = canManage ? '' : `<div class="alert info" style="margin-bottom:12px">${ic('lock', 14)}<span>${t('modal.shareLockHint')}</span></div>`;
  return `${H(t('modal.shareTitle', { name: esc(p.name) }))}
  <div class="modal-b">
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
      <div class="row" style="gap:10px"><span class="ftype" style="--c:var(--text-2)">${ic(p.private ? 'lock' : 'building-2', 14)}</span><div class="grow"><select class="select" style="height:28px;width:auto;border-color:transparent;padding-left:4px;font-weight:500" data-in="shareAccess" data-id="${p.id}" aria-label="${t('modal.generalAccess')}" ${canManage ? '' : 'disabled'}><option value="private" ${p.private ? 'selected' : ''}>${t('modal.onlyInvited')}</option><option value="workspace" ${p.private ? '' : 'selected'}>${t('modal.everyoneAt', { name: esc(D().ws.name) })}</option></select><div class="faint" style="font-size:11.5px;padding-left:4px">${p.private ? t('modal.privateHint') : t('modal.workspaceHint')}</div></div></div></div>
  </div>
  <div class="modal-f"><button class="btn btn-secondary" data-a="copyLink" data-pid="${p.id}">${ic('link', 14)}${t('act.copyLink')}</button><span class="sp"></span><button class="btn btn-primary" data-a="closeModal">${t('act.done')}</button></div>`;
}
export function inviteModal(m, H) {
  const err = S.ui.errors.invite;
  const links = S.ui.inviteLinks || [];
  return `${H(t('modal.inviteTo', { name: esc(D().ws.name) }), api.mailEnabled ? t('modal.inviteMailHint') : api.enabled ? t('modal.inviteLinkHint') : t('modal.inviteLocalHint'))}
  <form class="modal-b" data-submit="submitInvite">
    <div class="field"><label class="label" for="inv-emails">${t('modal.emailAddresses')}</label><textarea class="textarea ${err ? 'is-error' : ''}" id="inv-emails" placeholder="name@company.com, another@company.com" rows="3" autofocus>${esc(S.ui.inviteDraft || '')}</textarea>${err ? `<span class="err">${ic('circle-alert', 12)}${err}</span>` : `<span class="hint">${t('modal.emailHint')}</span>`}</div>
    <div class="row" style="gap:12px"><div class="field grow"><label class="label" for="inv-role">${t('modal.role')}</label><select class="select" id="inv-role">${['Member', 'Admin', 'Guest'].map(r => `<option>${r}</option>`).join('')}</select></div>
    <div class="field grow"><label class="label" for="inv-team">${t('nav.route.team')}</label><select class="select" id="inv-team">${teamsList()
      .map(tm => `<option value="${tm.id}">${esc(tm.name)}</option>`)
      .join('')}</select></div></div>
    <div class="alert info">${ic('info', 14)}<span><b>${t('modal.guests')}</b> ${t('modal.guestsHint')}</span></div>
    ${
      links.length
        ? `<div class="field"><span class="label">${t('modal.inviteLinks')}</span>${links
            .map(l => {
              const status = l.sent ? t('modal.sent') : l.error ? t('modal.notSent') : '';
              return `<div class="row" style="gap:8px;margin-bottom:6px"><input class="input" readonly value="${esc(l.url)}" aria-label="${l.email ? t('modal.inviteLinkFor', { email: esc(l.email) }) : t('modal.inviteLink')}" style="font-size:12px"><span class="faint" style="font-size:11px;white-space:nowrap" title="${esc(l.error || '')}">${status}</span><button type="button" class="btn btn-secondary btn-sm" data-a="copyText" data-text="${esc(l.url)}">${t('act.copy')}</button></div>`;
            })
            .join(
              '',
            )}<span class="hint">${links.some(l => l.email) ? (api.mailEnabled ? (links.every(l => !l.email || l.sent) ? t('modal.linksHintMail') : t('modal.linksHintPartial')) : t('modal.linksHintLink')) : t('modal.linksHintManual')}</span></div>`
        : ''
    }
  </form>
  <div class="modal-f"><button class="btn btn-ghost" data-a="copyInviteLink">${ic('link', 14)}${t('act.copyInviteLink')}</button><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">${t('common.cancel')}</button><button class="btn btn-primary" data-a="submitInvite" id="inv-submit">${api.mailEnabled ? t('act.sendInvites') : api.enabled ? t('act.createLinks') : t('act.sendInvites')}</button></div>`;
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
   arrays are machine key sequences and stay exactly as they are. */
export const SHORTCUTS = [
  [
    'modal.sc.general',
    [
      ['palette.commandMenu', [MOD, 'K']],
      ['palette.scope.search', ['/']],
      ['palette.keyboardShortcuts', ['?']],
      ['palette.toggleSidebar', ['[']],
      ['act.toggleDarkMode', [MOD, 'Shift', 'L']],
      ['modal.sc.closePanel', ['Esc']],
    ],
  ],
  [
    'modal.sc.create',
    [
      ['act.newTask', ['N']],
      ['act.newProject', ['P']],
      ['modal.sc.submitForm', [MOD, '↵']],
      ['modal.sc.sendComment', [MOD, '↵']],
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
  return `${H(t('palette.keyboardShortcuts'))}<div class="modal-b" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:22px">${SHORTCUTS.map(([g, list]) => `<div><div class="eyebrow" style="margin-bottom:6px">${t(g)}</div>${list.map(([n, k]) => `<div class="row" style="height:30px;font-size:13px;border-bottom:1px solid var(--divider)"><span class="grow">${t(n)}</span>${k.map((x, i) => `${i && k[0] === 'G' ? '<span class="faint" style="font-size:11px">then</span>' : ''}<kbd>${x}</kbd>`).join('')}</div>`).join('')}</div>`).join('')}</div>`;
}
export function filePreviewModal(m, H) {
  const f = m.file;
  const ft = FT[f.type] || FT.other;
  return `${H(esc(f.name), `${ft.n} · ${f.size} ${t('modal.uploadedBy', { name: esc(mem(f.by)?.name || 'you') })} ${ago(f.at)}`)}
  <div class="modal-b"><div style="border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden">${filePrev(f).replace('class="fprev"', 'class="fprev" style="aspect-ratio:16/9"')}</div>
  ${m.tid ? `<div class="row faint" style="font-size:12.5px">${ic('link', 13)}${t('modal.attachedTo')} <button class="link" data-a="openTask" data-id="${m.tid}">${esc(task(m.tid)?.title)}</button></div>` : ''}</div>
  <div class="modal-f"><button class="btn btn-secondary" data-a="copyLink" data-fid="${f.id}">${ic('link', 14)}${t('act.copyLink')}</button><span class="sp"></span><button class="btn btn-primary" data-a="closeModal">${t('a11y.close')}</button></div>`;
}
