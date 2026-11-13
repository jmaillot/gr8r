/* ---------- INBOX ---------- */
import { ago, esc, modKey } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { S, commentsOf, mem, myNotifs, pColor, proj, task } from '../core/store.js';
import { t, has } from '../core/i18n.js';
import { av, empty, fmtComment } from '../ui/helpers.js';
import { groupBursts } from '../core/inboxBursts.js';

export { groupBursts, burstUnreadIds } from '../core/inboxBursts.js';
import { cellAssignee, cellDue, cellPrio, cellStatus } from '../components/task-list.js';
import { commentHtml } from '../overlays/drawer.js';

export function pageInbox() {
  const cats = [
    ['all', t('page.activity.filterAll')],
    ['mention', t('settings.notif.mentions')],
    ['assign', t('settings.notif.assignments')],
    ['comment', t('settings.notif.comments')],
    ['due_reminder', t('settings.notif.dueReminder')],
    ['past_due', t('settings.notif.pastDue')],
    ['update', t('page.inbox.cat.updates')],
  ];
  const cat = S.ui.inboxCat;
  /* [55-04 D-55-13] Removed-assignee rows file under the Assignments category
     — they are the mirror half of the assignment notification. */
  const inCat = (n, k) => (k === 'assign' ? n.type === 'assign' || n.type === 'assignRemoved' : n.type === k);
  let ns = myNotifs()
    .slice()
    .sort((a, b) => b.at - a.at);
  const count = k => ns.filter(n => (k === 'all' || inCat(n, k)) && !n.read).length;
  ns = ns.filter(n => cat === 'all' || inCat(n, cat));
  if (S.ui.inboxUnread) ns = ns.filter(n => !n.read);
  const sel = myNotifs().find(n => n.id === S.ui.inboxSel) || null;
  /* [61-02 D-10/D-11] Render-only burst coalescing: unread rows sharing task +
     type collapse into one summary row. Counts above stay computed from the RAW
     filtered list — grouping only shapes what is rendered (tab badges exact). */
  const rows = groupBursts(ns, S.ui.inboxBurstOpen);
  return `<div class="page flush">
    <div style="display:grid;grid-template-columns:minmax(0,420px) minmax(0,1fr);flex:1;min-height:0" class="inbox-grid">
      <style>@media(max-width:900px){.inbox-grid{grid-template-columns:minmax(0,1fr)!important}.inbox-prev{display:${sel ? 'flex' : 'none'}!important;position:fixed;inset:0;z-index:48;background:var(--surface)}}</style>
      <div style="border-right:1px solid var(--border);display:flex;flex-direction:column;min-height:0">
        <div style="padding:18px var(--gutter) 0" class="row"><h1 style="font-size:var(--fs-xl);margin:0;font-weight:600;letter-spacing:-.015em">${t('nav.route.inbox')}</h1><span class="sp"></span>
          <label class="row" style="font-size:12px;color:var(--text-2);gap:6px;cursor:pointer"><input type="checkbox" class="toggle" data-a="toggleUnreadOnly" ${S.ui.inboxUnread ? 'checked' : ''}>${t('page.inbox.unread')}</label>
          <button class="ibtn ibtn-sm" data-a="markAllRead" data-tip="${t('page.inbox.markAllRead')}" aria-label="${t('page.inbox.markAllRead')}">${ic('check-check', 15)}</button></div>
        <div class="tabs inbox-tabs" role="tablist">${cats.map(([k, n]) => `<button role="tab" aria-selected="${cat === k}" class="tab ${cat === k ? 'on' : ''}" data-a="set" data-k="inboxCat" data-v="${k}">${n}${count(k) ? `<span class="cnt">${count(k)}</span>` : ''}</button>`).join('')}</div>
        <div class="inbox-list" data-keep="inbox-list">
          ${rows.length ? rows.map(it => (it.burst ? burstRow(it) : inboxItem(it, sel && sel.id === it.id))).join('') : empty('inbox', t('page.states.caughtUp'), S.ui.inboxUnread ? t('page.inbox.emptyUnread') : t('page.inbox.emptyBody'), '', 'sm')}
        </div>
      </div>
      <div class="inbox-prev" style="display:flex;flex-direction:column;min-height:0;overflow-y:auto">${sel ? inboxPreview(sel) : `<div class="fullstate"><div class="box"><div class="empty-state" style="padding:0"><div class="glyph">${ic('mail-open', 20)}</div><h2 class="es-h">${t('page.inbox.selectTitle')}</h2><p>${t('page.inbox.selectBody')}</p></div></div></div>`}</div>
    </div>
  </div>`;
}
/* ---------- INBOX burst coalescing (Phase 61, D-10..D-13) ----------
   groupBursts/burstUnreadIds live in src/core/inboxBursts.js (zero imports —
   shared with the actions chunk without Phase 56 chunk-coupling) and are
   re-exported above. This page owns only the summary-row markup (D-13). */
function burstRow(g) {
  const first = g.members[0];
  const tk = task(first.task);
  /* Defensive: a notif whose task vanished from the store renders as its newest
     member's plain row instead of crashing the summary (Pitfall 4 posture). */
  if (!tk) return inboxItem(first, false);
  const p = proj(tk.project);
  const tName = ({ due_reminder: 'dueReminder', past_due: 'pastDue' })[first.type] || first.type;
  const keyName = 'notif.burst.' + tName;
  const label = has(keyName) ? t(keyName, { n: g.members.length }) : t('notif.burst.generic', { n: g.members.length });
  const expTip = g.open ? t('notif.burst.collapse') : t('notif.burst.expand');
  const readTip = t('page.inbox.markRead');
  /* Summary row (D-13): count-by-type + task key + title, NEVER notifText() of a
     member (legacy rows carry stored English prose). Primary click navigates to
     the task drawer via openTask — it never touches S.ui.inboxSel (Pitfall 3);
     expand/collapse is a separate chevron (innermost data-a wins the click). */
  return `<div class="row" style="padding:12px var(--gutter);border-bottom:1px solid var(--divider);cursor:pointer;background:var(--surface-2)" data-a="openTask" data-id="${first.task}" role="button" tabindex="0">
    ${notifIcon(first)}
    <div class="grow" style="font-size:13px;line-height:1.45"><div>${label} <span class="faint mono">${esc(tk.key)}</span> <b style="font-weight:500">${esc(tk.title)}</b></div>
      <div class="row" style="gap:6px;margin-top:5px;font-size:11.5px;color:var(--text-3)">${p ? `<span class="pdot" style="--c:${pColor(p)};width:6px;height:6px"></span>${esc(p.name)}` : ''}<span>·</span><span>${ago(first.at)}</span></div></div>
    <button class="ibtn ibtn-xs" data-a="burstRead" data-gk="${g.gk}" data-tip="${readTip}" aria-label="${readTip}">${ic('check-check', 13)}</button>
    <button class="ibtn ibtn-xs" data-a="toggleBurst" data-gk="${g.gk}" aria-expanded="${g.open}" data-tip="${expTip}" aria-label="${expTip}">${ic(g.open ? 'chevron-down' : 'chevron-right', 13)}</button>
  </div>`;
}
export function notifText(n) {
  const tgt = n.task ? task(n.task) : null;
  const p = n.project ? proj(n.project) : tgt ? proj(tgt.project) : null;
  const who = n.by ? `<b style="font-weight:600">${esc(mem(n.by)?.name)}</b>` : '';
  /* Legacy rows still carry a stored English text fragment — render it verbatim (D-12, no migration). */
  if (n.text) {
    if (!n.by && p && !tgt) return `<b style="font-weight:600">${esc(n.text)}</b>`;
    if (!n.by && tgt) return `<b style="font-weight:600">${esc(tgt.title)}</b> <span class="muted">${esc(n.text)}</span>`;
    return `${who} <span class="muted">${esc(n.text)}</span> ${tgt ? `<b style="font-weight:500">${esc(tgt.title)}</b>` : ''}`;
  }
  /* Keyed rows (I18N-03, D-04/D-05): server-pass reminder rows carry a machine
     key + a send-time vars snapshot — localize through the viewer-locale t()
     singleton (the catalogue sentence embeds the title). Unknown catalogue key
     degrades to the stored English snippet prose — never blank, never the raw
     key string (D-06). Legacy prose rows above are untouched (SC-3). */
  if (n.key) {
    const sentence = has(n.key) ? t(n.key, n.vars) : n.snippet || '';
    return `<span class="muted">${esc(sentence)}</span>`;
  }
  /* Structured rows compose the sentence through the notif.* catalogue keys in the active locale. */
  /* D-27-4: reminder rows are system-actor (by:null) — guard them BEFORE the
     generic !n.by branch (which would render taskDueToday for every reminder)
     and never fabricate a member by-line for the system actor (T-27-07). The
     day-before vs morning-of context lives in the server-built snippet. */
  if ((n.type === 'due_reminder' || n.type === 'past_due') && tgt)
    return `<b style="font-weight:600">${esc(tgt.title)}</b> <span class="muted">${t(n.type === 'due_reminder' ? 'notif.dueReminder' : 'notif.pastDue')}</span>`;
  if (!n.by && p && !tgt) return `<b style="font-weight:600">${esc(p.name)}</b> <span class="muted">${t('notif.projectAtRisk')}</span>`;
  if (!n.by && tgt) return `<b style="font-weight:600">${esc(tgt.title)}</b> <span class="muted">${t('notif.taskDueToday')}</span>`;
  const fragment = n.type === 'update' && n.status ? t('notif.update', { status: t(`task.status.${n.status}`) }) : t(`notif.${n.type}`);
  return `${who} <span class="muted">${fragment}</span> ${tgt ? `<b style="font-weight:500">${esc(tgt.title)}</b>` : ''}`;
}
export function notifIcon(n) {
  if (n.by) return av(n.by, 'md', false);
  const i = n.type === 'update' && n.project ? 'triangle-alert' : 'clock';
  return `<span class="av md" style="--c:${n.project ? 'var(--red)' : 'var(--amber)'}">${ic(i, 13)}</span>`;
}
export function inboxItem(n, on) {
  const tk = n.task ? task(n.task) : null;
  const p = n.project ? proj(n.project) : tk ? proj(tk.project) : null;
  const typeIc = { mention: 'at-sign', assign: 'user-plus', comment: 'message-square', update: 'refresh-cw', due_reminder: 'clock', past_due: 'triangle-alert' }[n.type];
  return `<div class="row" style="align-items:flex-start;gap:10px;padding:12px var(--gutter);border-bottom:1px solid var(--divider);cursor:pointer;position:relative;${on ? 'background:var(--surface-2);' : ''}" data-a="selNotif" data-id="${n.id}" role="button" tabindex="0">
    ${!n.read ? `<span style="position:absolute;left:6px;top:22px;width:6px;height:6px;border-radius:50%;background:var(--accent)" aria-label="${t('page.inbox.unread')}"></span>` : ''}
    ${notifIcon(n)}
    <div class="grow" style="font-size:13px;line-height:1.45">
      <div>${notifText(n)}</div>
      <div class="trunc muted" style="font-size:12.5px;margin-top:2px">${fmtComment(n.key && has(n.key) ? t(n.key, n.vars) : n.snippet)}</div>
      <div class="row" style="gap:6px;margin-top:5px;font-size:11.5px;color:var(--text-3)">${ic(typeIc, 11)}${p ? `<span class="pdot" style="--c:${pColor(p)};width:6px;height:6px"></span>${esc(p.name)}` : ''}<span>·</span><span>${ago(n.at)}</span></div>
    </div>
    <button class="ibtn ibtn-xs" data-a="toggleRead" data-id="${n.id}" data-tip="${n.read ? t('page.inbox.markUnread') : t('page.inbox.markRead')}" aria-label="${n.read ? t('page.inbox.markUnread') : t('page.inbox.markRead')}">${ic(n.read ? 'mail' : 'mail-open', 13)}</button>
  </div>`;
}
export function inboxPreview(n) {
  const tk = n.task ? task(n.task) : null;
  const p = n.project ? proj(n.project) : tk ? proj(tk.project) : null;
  if (!tk)
    return `<div style="padding:24px 28px"><button class="btn btn-sm btn-ghost" data-a="set" data-k="inboxSel" data-v="" style="margin:-4px 0 12px -8px">${ic('arrow-left', 14)}${t('page.auth.back')}</button><div class="alert danger">${ic('triangle-alert', 16)}<div><b>${esc(n.text || t('notif.' + String(n.type || '').replace(/_(\w)/g, (_, c) => c.toUpperCase())) || n.type)}</b><div class="muted" style="margin-top:2px">${esc(n.snippet)}</div></div></div>${p ? `<div style="margin-top:14px"><button class="btn btn-secondary" data-a="go" data-r="project" data-id="${p.id}" data-tab="overview">${t('popover.openProject')}</button></div>` : ''}</div>`;
  const cs = commentsOf(tk.id).slice(-4);
  return `<div class="row" style="height:46px;padding:0 16px;border-bottom:1px solid var(--border);gap:8px;flex-shrink:0">
      <button class="ibtn ibtn-sm" data-a="set" data-k="inboxSel" data-v="" aria-label="${t('page.auth.back')}">${ic('arrow-left', 15)}</button>
      ${p ? `<span class="pdot" style="--c:${pColor(p)}"></span><span class="muted" style="font-size:12.5px">${esc(p.name)}</span>` : ''}<span class="faint mono">${tk.key}</span><span class="sp"></span>
      <button class="btn btn-sm btn-secondary" data-a="openTask" data-id="${tk.id}">${ic('panel-right-open', 14)}${t('page.inbox.openTask')}</button></div>
    <div style="padding:24px 28px;max-width:720px;width:100%">
      <h2 style="font-size:var(--fs-xl);margin:0 0 10px;font-weight:600;letter-spacing:-.015em">${esc(tk.title)}</h2>
      <div class="row" style="flex-wrap:wrap;gap:4px;margin-bottom:18px">${cellStatus(tk)}${cellAssignee(tk)}${cellPrio(tk)}${cellDue(tk)}</div>
      <div class="eyebrow" style="margin-bottom:4px">${t('page.inbox.conversation')}</div>
      ${cs.length ? cs.map(commentHtml).join('') : `<p class="muted">${esc(n.snippet)}</p>`}
      <div class="cbox" style="margin-top:10px"><textarea id="inbox-reply" data-in="draft" data-id="${tk.id}" data-key-mod-enter="postComment" placeholder="${t('page.inbox.replyPlaceholder')}" aria-label="${t('page.inbox.reply')}">${esc(S.ui.drafts[tk.id] || '')}</textarea>
      <div class="row"><span class="faint" style="font-size:11.5px">${t('page.inbox.sendHint', { mod: modKey() })}</span><span class="sp"></span><button class="btn btn-primary btn-sm" data-a="postComment" data-id="${tk.id}">${t('page.inbox.reply')}</button></div></div>
    </div>`;
}
