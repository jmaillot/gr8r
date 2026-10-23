/* ---------- MEMBERS / PROFILE / TEAMS ---------- */
import { ago, esc, foldForSearch, minsAgo } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { ROLES } from '../core/constants.js';
import { D, S, TM, allTasks, canSee, isMemberAdmin, isOver, me, mem, progressOf, roleLabel, team, teamsList, visibleProjects } from '../core/store.js';
import { t } from '../core/i18n.js';
import { api } from '../core/api.js';
import { av, avStack, empty, pIcon, pStatus, progBar } from '../ui/helpers.js';
import { sortTasks } from '../shell/view-engine.js';
import { actHtml, miniRow } from '../components/task-list.js';
import { page404 } from './errors.js';

export function pageMembers() {
  const u = S.ui;
  const q = foldForSearch(u.memQ || '').text;
  const role = u.memRole || 'all';
  const ms = D().members.filter(
    m => (role === 'all' || m.role === role) && (!q || foldForSearch(m.name).text.includes(q) || foldForSearch(m.email).text.includes(q)),
  );
  const isAdmin = isMemberAdmin();
  const isOwner = me().role === 'Owner';
  const canManage = m => isAdmin && m.id !== D().me && (isOwner || (m.role !== 'Owner' && m.role !== 'Admin'));
  const pending = api.enabled ? u.pendingInvites || [] : [];
  const pendingCount = api.enabled ? pending.length : D().members.filter(m => m.status === 'invited').length;
  const tab = u.membersTab;
  return `<div class="page wide" style="max-width:1200px">
    <div class="ph"><div><h1>${t('nav.route.members')}</h1><p>${t('page.members.subtitle', { n: D().members.length, ws: esc(D().ws.name), pending: pendingCount })}</p></div><div class="acts">${isAdmin ? `<button class="btn btn-primary" data-a="invite">${ic('user-plus', 14)}${t('palette.inviteMember')}</button>` : ''}</div></div>
    <div class="tabs" style="margin-bottom:14px">${[
      ['members', t('nav.route.members')],
      ['teams', t('page.teams.title')],
      ['roles', t('page.members.tab.roles')],
    ]
      .map(([k, n]) => `<button class="tab ${tab === k ? 'on' : ''}" data-a="set" data-k="membersTab" data-v="${k}">${n}</button>`)
      .join('')}</div>
    ${
      tab === 'teams'
        ? `<div class="row" style="margin-bottom:12px"><span class="muted" style="font-size:13px">${t('page.teams.count', { n: teamsList().length })}</span><span class="sp"></span><button class="btn btn-secondary btn-sm" data-a="newTeam">${ic('plus', 13)}${t('act.newTeam')}</button></div>${teamsGrid()}`
        : tab === 'roles'
          ? permsTable()
          : `
    <div class="row" style="margin-bottom:12px;gap:8px;flex-wrap:wrap"><div class="inwrap">${ic('search', 13)}<input class="input search-sm" id="mem-q" data-in="memQ" placeholder="${t('a11y.searchNameOrEmail')}" value="${esc(u.memQ || '')}" aria-label="${t('a11y.searchMembers')}"></div>
      <div class="seg">${['all', ...ROLES].map(r => `<button class="${role === r ? 'on' : ''}" data-a="set" data-k="memRole" data-v="${r}">${r === 'all' ? t('page.activity.filterAll') : roleLabel(r)}</button>`).join('')}</div></div>
    <div class="panel" style="overflow-x:auto">${
      ms.length
        ? `<table class="perm-t" style="min-width:880px"><thead><tr><th style="padding-left:14px">${t('page.members.col.member')}</th><th style="text-align:left">${t('page.members.col.role')}</th><th style="text-align:left">${t('nav.route.team')}</th><th>${t('page.home.stat.activeProjects')}</th><th>${t('nav.route.tasks')}</th><th style="text-align:left">${t('page.members.col.lastActive')}</th><th style="text-align:left">${t('page.field.status')}</th><th></th></tr></thead><tbody>
    ${ms
      .map(m => {
        const ap = visibleProjects().filter(p => p.members.includes(m.id) && p.status !== 'complete').length;
        const ot = allTasks().filter(t => t.assignee === m.id && t.status !== 'done').length;
        return `<tr data-ctx="member" data-id="${m.id}"><td style="padding-left:14px"><button class="row" data-a="go" data-r="member" data-id="${m.id}" style="gap:10px;text-align:left">${av(m.id, 'md', false)}<span class="col"><b style="font-weight:500">${esc(m.name)}${m.id === D().me ? ` <span class="faint" style="font-weight:400">(${t('page.members.you')})</span>` : ''}</b><span class="faint" style="font-size:12px">${esc(m.email)}</span></span></button></td>
      <td style="text-align:left">${canManage(m) ? `<button class="pillbtn bordered" data-a="pop" data-pop="role" data-id="${m.id}">${roleLabel(m.role)}${ic('chevron-down', 12)}</button>` : `<span class="pillbtn">${m.role === 'Owner' ? ic('crown', 13) : ''}${roleLabel(m.role)}</span>`}</td>
      <td style="text-align:left"><span class="row">${ic(TM[m.team].icon, 13)}${TM[m.team].name}</span></td><td class="num">${ap}</td><td class="num">${ot}</td>
      <td style="text-align:left" class="muted">${m.last == null ? '—' : m.last < 5 ? `<span style="color:var(--green)">${t('page.members.online')}</span>` : ago(minsAgo(m.last))}</td>
      <td style="text-align:left">${m.status === 'invited' ? `<span class="badge amber"><span class="dot"></span>${t('page.members.invited')}</span>` : m.status === 'deactivated' ? `<span class="badge gray">${t('page.members.deactivated')}</span>` : `<span class="badge green"><span class="dot"></span>${t('page.members.active')}</span>`}</td>
      <td><button class="ibtn ibtn-sm" data-a="ctxBtn" data-ctx="member" data-id="${m.id}" aria-label="${t('a11y.memberOptions')}">${ic('ellipsis', 14)}</button></td></tr>`;
      })
      .join('')}
    </tbody></table>`
        : empty('search-x', t('palette.noResults'), t('page.members.noResults'), '', 'sm')
    }</div>
    ${
      pending.length && isAdmin
        ? `<div class="panel" style="margin-top:14px"><div class="panel-h"><h2>${t('page.members.pendingInvites')}</h2><span class="faint">${pending.length}</span></div>${pending
            .map(
              p =>
                `<div class="mini" style="min-height:48px"><span class="picon" style="--c:#6B7280">${ic('mail', 14)}</span><div class="grow"><div style="font-weight:500">${esc(p.email || t('page.members.anyoneWithLink'))}</div><div class="faint" style="font-size:12px">${t('page.members.invitedAs', { role: esc(p.roleLabel), n: Math.max(0, Math.round((p.expiresAt - Date.now()) / 86400000)) })}</div></div>${p.email ? `<button class="btn btn-secondary btn-sm" data-a="resendPendingInvite" data-id="${esc(p.id)}">${t('act.resend')}</button>` : ''}<button class="btn btn-secondary btn-sm" data-a="revokeInvite" data-id="${esc(p.id)}">${t('act.revoke')}</button></div>`,
            )
            .join('')}</div>`
        : ''
    }`
    }
  </div>`;
}
export function permsTable() {
  const rows = [
    [t('perm.viewProjects'), 1, 1, 1, 1],
    [t('perm.commentTasks'), 1, 1, 1, 1],
    [t('perm.createEditTasks'), 1, 1, 1, 0],
    [t('perm.createProjects'), 1, 1, 1, 0],
    [t('perm.inviteMembers'), 1, 1, 0, 0],
    [t('perm.manageRoles'), 1, 1, 0, 0],
    [t('perm.workspaceSettings'), 1, 1, 0, 0],
    [t('perm.deleteWorkspace'), 1, 0, 0, 0],
  ];
  return `<div class="panel" style="overflow-x:auto"><table class="perm-t" style="min-width:560px"><thead><tr><th style="padding-left:14px">${t('page.members.col.permission')}</th>${ROLES.map(r => `<th>${roleLabel(r)}</th>`).join('')}</tr></thead><tbody>${rows
    .map(
      r =>
        `<tr><td style="padding-left:14px">${r[0]}</td>${r
          .slice(1)
          .map(
            v =>
              `<td>${v ? `<span style="color:var(--green);display:inline-flex" aria-label="${t('page.members.allowed')}">${ic('check', 15)}</span>` : `<span class="faint" style="display:inline-flex" aria-label="${t('page.members.notAllowed')}">${ic('minus', 15)}</span>`}</td>`,
          )
          .join('')}</tr>`,
    )
    .join('')}</tbody></table></div>`;
}
export function teamsGrid() {
  return `<div class="pgrid">${teamsList()
    .map(t => {
      const ms = D().members.filter(m => m.team === t.id);
      const ps = visibleProjects().filter(p => p.team === t.id);
      return `<div class="pcard" data-a="go" data-r="team" data-id="${t.id}" role="link" tabindex="0"><div class="row"><span class="picon" style="--c:${t.c}">${ic(t.icon, 15)}</span><b style="font-weight:600;font-size:14px">${t.name}</b></div><div class="desc">${t.desc}</div><div class="foot"><span class="row" style="gap:4px">${ic('users', 12)}${t('page.teams.nMembers', { n: ms.length })}</span><span class="row" style="gap:4px">${ic('folder', 12)}${t('page.teams.nProjects', { n: ps.length })}</span><span class="sp"></span>${avStack(
        ms.map(m => m.id),
        4,
      )}</div></div>`;
    })
    .join('')}</div>`;
}
export function pageTeams() {
  return `<div class="page"><div class="ph"><div><h1>${t('page.teams.title')}</h1><p>${t('page.teams.subtitle')}</p></div><div class="acts"><button class="btn btn-primary" data-a="newTeam">${ic('plus', 14)}${t('act.newTeam')}</button></div></div>${teamsList().length ? teamsGrid() : `<div class="panel">${empty('users', t('page.teams.emptyTitle'), t('page.teams.emptyBody'), `<button class="btn btn-primary btn-sm" data-a="newTeam">${ic('plus', 14)}${t('act.newTeam')}</button>`)}</div>`}</div>`;
}
export function pageTeam() {
  const tm = team(S.ui.params.id);
  if (!tm) return page404();
  const ms = D().members.filter(m => m.team === tm.id);
  const ps = visibleProjects().filter(p => p.team === tm.id);
  const ts = allTasks().filter(x => ms.some(m => m.id === x.assignee) && x.status !== 'done');
  return `<div class="page">
    <div class="ph"><div class="row" style="gap:12px"><span class="picon lg" style="--c:${tm.c}">${ic(tm.icon, 18)}</span><div><h1>${tm.name}</h1><p style="margin:2px 0 0">${tm.desc}</p></div></div><div class="acts"><button class="btn btn-secondary" data-a="editTeam" data-id="${tm.id}">${ic('pencil', 14)}${t('act.editTeam')}</button>${isMemberAdmin() ? `<button class="btn btn-secondary" data-a="invite">${ic('user-plus', 14)}${t('act.inviteToWorkspace')}</button>` : ''}</div></div>
    <div class="grid2"><div class="stack">
      <section class="panel"><div class="panel-h"><h2>${t('nav.route.projects')}</h2><span class="faint">${ps.length}</span></div>${ps.map(p => `<div class="mini" data-a="go" data-r="project" data-id="${p.id}">${pIcon(p, '', 14)}<span class="tt">${esc(p.name)}</span>${pStatus(p.status)}<span class="row" style="width:120px">${progBar(progressOf(p.id))}</span></div>`).join('') || `<div class="panel-b faint">${t('page.team.noProjects')}</div>`}</section>
      <section class="panel"><div class="panel-h"><h2>${t('page.home.stat.openTasks')}</h2><span class="faint">${ts.length}</span></div>${sortTasks(ts, {
        f: 'due',
        dir: 1,
      })
        .slice(0, 8)
        .map(x => miniRow(x))
        .join('')}</section>
    </div>
    <section class="panel" style="align-self:start"><div class="panel-h"><h2>${t('nav.route.members')}</h2><span class="faint">${ms.length}</span></div>${ms.map(m => `<div class="mini" style="min-height:48px" data-a="go" data-r="member" data-id="${m.id}">${av(m.id, 'md', false)}<div class="grow"><div style="font-weight:500">${esc(m.name)}</div><div class="faint" style="font-size:12px">${esc(m.title)}</div></div><span class="badge">${roleLabel(m.role)}</span></div>`).join('')}</section></div>
  </div>`;
}
export function pageMember() {
  const m = mem(S.ui.params.id);
  if (!m) return page404();
  const ts = allTasks().filter(x => x.assignee === m.id);
  const open = ts.filter(x => x.status !== 'done');
  const done = ts.filter(x => x.status === 'done');
  const ps = visibleProjects().filter(p => p.members.includes(m.id) && p.status !== 'complete' && canSee(p));
  const acts = D()
    .activity.filter(a => a.by === m.id)
    .slice(0, 8);
  const tab = S.ui.memTab || 'assigned';
  return `<div class="page">
    <div class="row" style="gap:18px;margin-bottom:22px;flex-wrap:wrap;align-items:flex-start">
      ${av(m.id, 'xl ' + (m.last != null && m.last < 5 ? 'presence' : ''), false)}
      <div class="grow" style="min-width:220px"><div class="row" style="gap:10px;flex-wrap:wrap"><h1 style="font-size:var(--fs-2xl);margin:0;font-weight:600;letter-spacing:-.02em">${esc(m.name)}</h1><span class="badge">${m.role === 'Owner' ? ic('crown', 11) : ''}${roleLabel(m.role)}</span>${m.status === 'invited' ? `<span class="badge amber">${t('page.members.invitePending')}</span>` : ''}</div>
        <div class="muted" style="margin-top:3px">${esc(m.title)} · ${TM[m.team].name}</div>
        <div class="row faint" style="margin-top:8px;gap:14px;font-size:12.5px;flex-wrap:wrap"><span class="row" style="gap:5px">${ic('mail', 13)}<span style="user-select:all">${esc(m.email)}</span></span><span class="row" style="gap:5px">${ic('map-pin', 13)}${esc(m.tz)}</span><span class="row" style="gap:5px">${ic('clock', 13)}${m.last == null ? t('page.members.neverSignedIn') : m.last < 5 ? t('page.members.onlineNow') : t('page.members.activeAgo', { ago: ago(minsAgo(m.last)) })}</span></div></div>
      <div class="row"><button class="btn btn-secondary" data-a="copyText" data-text="${esc(m.email)}">${ic('copy', 14)}${t('act.copyEmail')}</button><button class="btn btn-primary" data-a="newTask" data-assignee="${m.id}">${ic('plus', 14)}${t('act.assignTask')}</button><button class="ibtn" data-a="ctxBtn" data-ctx="member" data-id="${m.id}" aria-label="${t('a11y.more')}">${ic('ellipsis', 16)}</button></div>
    </div>
    <div class="stats" style="margin-bottom:18px">
      <div class="stat"><span class="k">${t('page.home.stat.activeProjects')}</span><span class="v">${ps.length}</span></div>
      <div class="stat"><span class="k">${t('page.member.stat.assignedTasks')}</span><span class="v">${open.length}</span></div>
      <div class="stat"><span class="k">${t('page.member.stat.completedTasks')}</span><span class="v">${done.length}</span></div>
      <div class="stat"><span class="k">${t('page.filter.overdue')}</span><span class="v" style="${open.filter(isOver).length ? 'color:var(--red)' : ''}">${open.filter(isOver).length}</span></div>
    </div>
    <div class="grid2"><section class="panel"><div class="tabs" style="padding:0 8px">${[
      ['assigned', t('page.member.tab.assigned', { n: open.length })],
      ['completed', t('page.member.tab.completed', { n: done.length })],
    ]
      .map(([k, n]) => `<button class="tab ${tab === k ? 'on' : ''}" data-a="set" data-k="memTab" data-v="${k}">${n}</button>`)
      .join('')}</div>
      ${(tab === 'assigned' ? sortTasks(open, { f: 'due', dir: 1 }) : done).map(x => miniRow(x, { av: false })).join('') || empty('list-checks', t('page.tasks.emptyTitle'), t('page.members.nothingToShow'), '', 'sm')}</section>
      <div class="stack"><section class="panel"><div class="panel-h"><h2>${t('page.home.stat.activeProjects')}</h2></div>${ps.map(p => `<div class="mini" data-a="go" data-r="project" data-id="${p.id}">${pIcon(p, '', 14)}<span class="tt">${esc(p.name)}</span><span class="faint" style="font-size:12px">${p.lead === m.id ? t('page.member.lead') : t('common.role.member')}</span></div>`).join('') || `<div class="panel-b faint">${t('page.members.noActiveProjects')}</div>`}</section>
      <section class="panel"><div class="panel-h"><h2>${t('page.home.recentActivity')}</h2></div><div class="panel-b feed">${acts.map(a => actHtml(a)).join('') || `<span class="faint">${t('page.members.noRecentActivity')}</span>`}</div></section></div></div>
  </div>`;
}
