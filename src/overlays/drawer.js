/* =====================================================================
   OVERLAYS: drawer, modals, popovers, context menus, command palette
   ===================================================================== */
import { MOD, TODAY, ago, diffD, esc, fmtDate, parse, relDate } from '../core/utils.js';
/* drawerHtml's task parameter is named t, so the catalogue lookup is imported under an alias. */
import { t as tMsg, fmtEstimate } from '../core/i18n.js';
import { ic } from '../core/icons.js';
import { D, S, commentsOf, isOver, mem, pColor, proj, task } from '../core/store.js';
import { FT, av, filePrev, fileType, fileTypeName, fmtComment, lbl, progBar } from '../ui/helpers.js';
import { fxc } from '../shell/render.js';
import { actExtraHtml, cellAssignee, cellDue, cellPrio, cellProject, cellStatus, verbLabel } from '../components/task-list.js';
import { modalHtml } from './modals.js';
import { popHtml, RECUR } from './popovers.js';
/* The stored recur value's catalogue key. */
const RECUR_KEY = Object.fromEntries(RECUR.map(x => [x.stored, x.key]));
import { paletteHtml } from './palette.js';
import { subtaskHtml } from '../features/subtasks.js';

export function renderLayer() {
  const u = S.ui;
  let h = '';
  if (u.drawer && task(u.drawer))
    h += (u.drawerFull ? `<div class="drawer-scrim full${u.fx.drawer ? ' enter' : ''}" data-a="closeDrawer"></div>` : '') + drawerHtml(task(u.drawer));
  u.modals.forEach((m, i) => {
    const en = u.fx.modal === i + 1;
    h += `<div class="scrim${en ? ' enter' : ''}" data-a="closeModal" style="z-index:${60 + i * 2}"></div><div class="modal-wrap" data-a="closeModalBg" style="z-index:${61 + i * 2}">${en ? modalHtml(m).replace('class="modal ', 'class="modal enter ') : modalHtml(m)}</div>`;
  });
  if (u.palette) h += `<div class="scrim" data-a="closePalette" style="z-index:89"></div>${paletteHtml()}`;
  if (u.pop) h += popHtml(u.pop);
  return h;
}

/* ---------------- TASK DRAWER ---------------- */
export function drawerHtml(t) {
  const p = proj(t.project);
  const u = S.ui;
  const cs = commentsOf(t.id);
  const sd = t.subtasks.filter(s => s.done).length;
  const acts = D().activity.filter(a => a.task === t.id);
  const tab = u.drawerTab;
  const prop = (icon, label, val) => `<dt>${ic(icon, 14)}${label}</dt><dd>${val}</dd>`;
  const ups = (u.uploads || []).filter(x => x.task === t.id);
  const ment =
    u.mention && u.mention.tid === t.id
      ? D()
          .members.filter(
            m => m.name.toLowerCase().startsWith(u.mention.q.toLowerCase()) || m.name.split(' ')[1]?.toLowerCase().startsWith(u.mention.q.toLowerCase()),
          )
          .slice(0, 5)
      : [];
  const sub = u.subOpen && u.subOpen.tid === t.id ? t.subtasks.find(s => s.id === u.subOpen.sid) : null;
  return `<aside class="drawer ${u.drawerFull ? 'full' : ''} ${u.fx.drawer ? 'enter' : ''} ${u.fx.tabs ? 'fx-tabs' : ''}" role="dialog" aria-modal="${u.drawerFull}" aria-labelledby="d-h" tabindex="-1">
    <h2 class="sr" id="d-h">${sub ? tMsg('page.drawer.subtaskHeading', { title: esc(sub.title) }) : tMsg('page.drawer.taskHeading', { title: esc(t.title) })}</h2>
    <div class="drawer-h">
      <button class="pillbtn" data-a="go" data-r="project" data-id="${p.id}" data-tab="board" style="font-size:12.5px"><span class="pdot" style="--c:${pColor(p)}"></span>${esc(p.name)}</button><span class="faint">/</span><span class="mono faint" style="font-size:11.5px;padding:0 6px">${t.key}</span>
      <span class="sp"></span>
      <button class="btn btn-sm ${t.status === 'done' ? 'btn-secondary' : 'btn-ghost'}" data-a="toggleDone" data-id="${t.id}" style="${t.status === 'done' ? 'color:var(--green)' : ''}">${ic(t.status === 'done' ? 'circle-check' : 'circle', 14)}<span class="hide-m">${t.status === 'done' ? tMsg('task.status.done') : tMsg('act.markComplete')}</span></button>
      <button class="ibtn ibtn-sm" data-a="toggleFavTask" data-id="${t.id}" data-tip="${t.fav ? tMsg('a11y.unfavorite') : tMsg('a11y.favorite')}" aria-pressed="${t.fav}" aria-label="${tMsg('a11y.favorite')}" style="${t.fav ? 'color:var(--amber)' : ''}">${ic('star', 15)}</button>
      <button class="ibtn ibtn-sm" data-a="copyLink" data-id="${t.id}" data-tip="${tMsg('act.copyLink')}" aria-label="${tMsg('act.copyLink')}">${ic('link', 15)}</button>
      <button class="ibtn ibtn-sm hide-m" data-a="toggleDrawerFull" data-tip="${u.drawerFull ? tMsg('a11y.sidePanel') : tMsg('a11y.fullPage')}" aria-label="${tMsg('a11y.toggleFullPage')}">${ic(u.drawerFull ? 'minimize-2' : 'maximize-2', 15)}</button>
      <button class="ibtn ibtn-sm" data-a="ctxBtn" data-ctx="task" data-id="${t.id}" aria-label="${tMsg('nav.more')}">${ic('ellipsis', 15)}</button>
      <button class="ibtn ibtn-sm" data-a="closeDrawer" data-tip="${tMsg('a11y.closeTip')}" aria-label="${tMsg('a11y.close')}">${ic('x', 16)}</button>
    </div>
    <div class="drawer-b" data-keep="drawer:${t.id}${sub ? ':' + sub.id : ''}">${
      sub
        ? subtaskHtml(t, sub)
        : `
      ${t.status === 'done' ? `<div class="alert ok" style="margin-bottom:12px">${ic('circle-check', 15)}<span>${tMsg('act.completedAgo', { when: t.completedAt ? ago(t.completedAt) : '' })} <button class="link" data-a="toggleDone" data-id="${t.id}">${tMsg('act.reopenTask')}</button></span></div>` : isOver(t) ? `<div class="alert danger" style="margin-bottom:12px">${ic('clock-alert', 15)}<span>${tMsg('act.overdueBy', { n: -diffD(parse(t.due), TODAY) })} <button class="link" data-a="pop" data-pop="date" data-field="due" data-id="${t.id}">${tMsg('act.reschedule')}</button></span></div>` : ''}
      <textarea class="ttl-edit" id="d-title" rows="1" data-autosize data-blur="commitDrawerTitle" data-key-enter="blur" data-id="${t.id}" aria-label="${tMsg('a11y.taskTitle')}">${esc(t.title)}</textarea>
      <dl class="kv" style="margin-top:12px;${u.drawerFull ? 'grid-template-columns:112px minmax(0,1fr) 112px minmax(0,1fr)' : ''}">
        ${prop('circle-dot', tMsg('page.field.status'), cellStatus(t))}
        ${prop('signal-high', tMsg('page.field.priority'), cellPrio(t))}
        ${prop('user', tMsg('page.field.assignee'), cellAssignee(t))}
        ${prop('calendar', tMsg('page.field.due'), cellDue(t))}
        ${prop('calendar-arrow-up', tMsg('page.sort.start'), `<button class="pillbtn ${t.start ? '' : 'empty'}" data-a="pop" data-pop="date" data-field="start" data-id="${t.id}">${ic('calendar', 13)}${t.start ? fmtDate(t.start) : tMsg('common.setDate')}</button>`)}
        ${prop('folder', tMsg('page.field.project'), cellProject(t))}
        ${prop('tag', tMsg('page.field.labels'), `<button class="pillbtn ${t.labels.length ? '' : 'empty'}" data-a="pop" data-pop="labels" data-id="${t.id}" style="flex-wrap:wrap;height:auto;min-height:26px;padding:3px 7px">${t.labels.length ? t.labels.map(lbl).join('') : ic('tag', 13) + tMsg('act.addLabels')}</button>`)}
        ${prop('repeat', tMsg('page.field.repeat'), `<button class="pillbtn ${t.recur ? '' : 'empty'}" data-a="pop" data-pop="recur" data-id="${t.id}">${ic('repeat', 13)}${t.recur ? tMsg(RECUR_KEY[t.recur] || 'popover.recurNone') : tMsg('popover.recurNone')}</button>`)}
        ${prop('timer', tMsg('page.sort.estimate'), `<button class="pillbtn ${t.estimate ? '' : 'empty'}" data-a="pop" data-pop="estimate" data-id="${t.id}">${ic('timer', 13)}${t.estimate ? esc(fmtEstimate(t.estimate)) : tMsg('act.addEstimate')}</button>`)}
        ${prop('git-branch', tMsg('page.field.blockedBy'), `<button class="pillbtn ${t.deps.length ? '' : 'empty'}" data-a="pop" data-pop="deps" data-id="${t.id}" style="height:auto;min-height:26px;flex-wrap:wrap">${t.deps.length ? t.deps.map(d => (task(d) ? `<span class="depchip mono" style="font-size:11px;padding:1px 5px;border-radius:4px;background:var(--surface-3)">${task(d).key}</span><span class="trunc" style="max-width:160px">${esc(task(d).title)}</span>` : '')).join('') : ic('git-branch', 13) + tMsg('common.none')}</button>`)}
      </dl>

      <div class="dsec"><div class="dsec-h"><h3 id="d-desc-l">${tMsg('modal.description')}</h3><div class="rte-tb" role="toolbar" aria-label="${tMsg('a11y.formatting')}" aria-controls="d-desc">
          ${[
            ['bold', 'bold', tMsg('a11y.bold')],
            ['italic', 'italic', tMsg('a11y.italic')],
            ['insertUnorderedList', 'list', tMsg('a11y.bulletedList')],
            ['insertOrderedList', 'list-ordered', tMsg('a11y.numberedList')],
            ['formatBlock:h4', 'heading', tMsg('a11y.heading')],
            ['createLink', 'link', tMsg('a11y.link')],
          ]
            .map(([c, i, n]) => `<button class="ibtn ibtn-xs" data-cmd="${c}" data-tip="${n}" aria-label="${n}">${ic(i, 13)}</button>`)
            .join('')}
        </div></div>
        <div class="rte"><div class="rte-body" id="d-desc" contenteditable="true" data-rte="${t.id}" data-ph="${tMsg('a11y.descPlaceholder')}" role="textbox" aria-multiline="true" aria-labelledby="d-desc-l">${t.desc}</div></div>
      </div>

      <div class="dsec"><div class="dsec-h"><h3>${tMsg('modal.subtasks')}</h3><span class="cnt num">${sd}/${t.subtasks.length}</span>${t.subtasks.length ? `<span style="width:90px;display:flex">${progBar(Math.round((sd / t.subtasks.length) * 100), sd === t.subtasks.length ? 'green' : '')}</span>` : ''}</div>
        ${t.subtasks.map(s => `<div class="subt ${s.done ? 'done' : ''}${fxc('added', s.id)}${fxc('done', s.id)}"><input type="checkbox" class="check" ${s.done ? 'checked' : ''} data-a="toggleSub" data-id="${t.id}" data-sid="${s.id}" aria-label="${s.done ? tMsg('a11y.subtaskReopen', { title: esc(s.title) }) : tMsg('a11y.subtaskComplete', { title: esc(s.title) })}"><button class="s" data-a="openSub" data-id="${t.id}" data-sid="${s.id}">${esc(s.title)}</button>${s.due ? `<span class="due ${!s.done && diffD(parse(s.due), TODAY) < 0 ? 'over' : ''}">${ic('calendar', 12)}${relDate(s.due)}</span>` : ''}${s.assignee ? av(s.assignee, 'sm') : ''}<button class="ibtn ibtn-xs x" data-a="openSub" data-id="${t.id}" data-sid="${s.id}" aria-label="${tMsg('a11y.openSubtaskDetails')}" tabindex="-1">${ic('chevron-right', 14)}</button></div>`).join('')}
        <div class="subt" style="color:var(--text-3)">${ic('plus', 15)}<input class="inline-in" id="d-sub" data-key-enter="addSub" data-id="${t.id}" placeholder="${tMsg('a11y.addSubtask')}" aria-label="${tMsg('a11y.addSubtask')}" style="font-size:13.5px"></div>
      </div>

      <div class="dsec"><div class="dsec-h"><h3>${tMsg('modal.attachments')}</h3><span class="cnt">${t.attachments.length}</span><div class="acts"><label class="btn btn-sm btn-ghost" style="cursor:pointer">${ic('upload', 13)}${tMsg('act.upload')}<input type="file" multiple hidden data-in="uploadFiles" data-task="${t.id}" data-project="${t.project}"></label></div></div>
        ${ups.map(x => `<div class="upl" style="margin-bottom:6px"><span class="ftype" style="--c:${FT[fileType(x.name)].c}">${ic(FT[fileType(x.name)].i, 14)}</span><div class="grow"><div class="row"><span class="trunc">${esc(x.name)}</span><span class="sp"></span><span class="faint num" id="upct-${x.id}" style="font-size:11px">${x.pct}%</span></div><div class="prog" style="margin-top:5px"><i id="upbar-${x.id}" style="width:${x.pct}%"></i></div></div></div>`).join('')}
        ${t.attachments.length ? `<div class="att">${t.attachments.map(f => `<div class="attc" data-a="filePreview" data-tid="${t.id}" data-aid="${f.id}" role="button" tabindex="0">${filePrev(f)}<div class="fi"><div class="trunc" style="font-weight:500">${esc(f.name)}</div><div class="faint">${fileTypeName(f.type)} · ${f.size}</div></div><button class="ibtn ibtn-xs x" data-a="rmAttach" data-id="${t.id}" data-aid="${f.id}" aria-label="${tMsg('a11y.removeAttachment')}">${ic('x', 12)}</button></div>`).join('')}</div>` : !ups.length ? `<label class="dropzone" style="padding:12px" data-dropzone-task="${t.id}">${ic('paperclip', 15)}<span>${tMsg('modal.dropToAttach')}</span><input type="file" multiple hidden data-in="uploadFiles" data-task="${t.id}" data-project="${t.project}"></label>` : ''}
      </div>

      <div class="dsec">
        <div class="tabs" style="margin-bottom:6px">${[
          ['comments', tMsg('palette.scope.comments'), cs.length],
          ['activity', tMsg('modal.activity'), acts.length],
        ]
          .map(
            ([k, n, c]) =>
              `<button class="tab ${tab === k ? 'on' : ''}" data-a="set" data-k="drawerTab" data-v="${k}">${n}<span class="cnt">${c}</span></button>`,
          )
          .join('')}</div>
        ${
          tab === 'comments'
            ? `
          ${cs.length ? cs.map(commentHtml).join('') : `<p class="faint" style="font-size:13px;margin:10px 0">${tMsg('page.drawer.noComments')}</p>`}
          <div class="row" style="align-items:flex-start;gap:10px;margin-top:8px">${av(D().me, 'md', false)}<div class="grow" style="position:relative">
            <div class="cbox"><textarea id="d-cmt" data-in="draft" data-id="${t.id}" data-key-mod-enter="postComment" placeholder="${tMsg('a11y.commentPlaceholder')}" aria-label="${tMsg('act.comment')}" rows="2" data-autosize>${esc(u.drafts[t.id] || '')}</textarea>
            <div class="row"><button class="ibtn ibtn-xs" data-a="insertAt" data-id="${t.id}" data-tip="${tMsg('a11y.mentionSomeone')}" aria-label="${tMsg('a11y.mention')}">${ic('at-sign', 14)}</button><label class="ibtn ibtn-xs" data-tip="${tMsg('a11y.attachFile')}" style="cursor:pointer">${ic('paperclip', 14)}<input type="file" multiple hidden data-in="uploadFiles" data-task="${t.id}" data-project="${t.project}"></label><span class="sp"></span><span class="faint hide-m" style="font-size:11px">${MOD}${tMsg('common.plusEnter')}</span><button class="btn btn-primary btn-sm" data-a="postComment" data-id="${t.id}">${tMsg('act.comment')}</button></div></div>
            ${ment.length ? `<div class="pop" style="position:absolute;top:auto;bottom:calc(100% + 4px);left:0">${ment.map(m => `<button class="mi" data-a="pickMention" data-id="${t.id}" data-name="${esc(m.name)}">${av(m.id, 'sm', false)}${esc(m.name)}<span class="r">${esc(m.title)}</span></button>`).join('')}</div>` : ''}
          </div></div>`
            : `
          <div style="padding-top:4px">${acts.map(a => `<div class="act-line"><span class="ico">${av(a.by, 'sm', false)}</span><span class="grow"><b>${esc(mem(a.by)?.id === D().me ? tMsg('common.you') : mem(a.by)?.name)}</b> ${esc(verbLabel(a.verb))}${a.extra ? ' ' + actExtraHtml(a.extra) : ''}</span><time class="faint" style="font-size:11.5px">${ago(a.at)}</time></div>`).join('')}
          <div class="act-line"><span class="ico">${ic('plus', 13)}</span><span class="grow">${tMsg('act.taskCreated')}</span><time class="faint" style="font-size:11.5px">${ago(t.created)}</time></div></div>`
        }
      </div>`
    }
    </div>
  </aside>`;
}
export function commentHtml(c) {
  const m = mem(c.by);
  const mine = c.by === D().me;
  return `<div class="cmt">${av(c.by, 'md', false)}<div class="body"><div class="who"><b>${esc(m?.name)}</b><time>${ago(c.at)}</time>${mine ? `<span class="sp"></span><button class="ibtn ibtn-xs" data-a="delComment" data-id="${c.id}" aria-label="${tMsg('a11y.deleteComment')}" data-tip="${tMsg('act.delete')}">${ic('trash-2', 12)}</button>` : ''}</div><div class="txt">${fmtComment(c.text)}</div>
    <div class="reacts">${Object.entries(c.re || {})
      .filter(([, v]) => v.length)
      .map(
        ([e, v]) =>
          `<button class="react ${v.includes(D().me) ? 'mine' : ''}" data-a="react" data-id="${c.id}" data-e="${e}" aria-label="${e} ${v.length}" title="${v.map(i => mem(i)?.name).join(', ')}">${e}<span class="num">${v.length}</span></button>`,
      )
      .join(
        '',
      )}<button class="react" data-a="pop" data-pop="emoji" data-id="${c.id}" aria-label="${tMsg('a11y.addReaction')}" style="color:var(--text-3)">${ic('smile-plus', 13)}</button></div></div></div>`;
}
