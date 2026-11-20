/* =====================================================================
   GOVERNANCE (79-02, WSG-07/WSG-08, D-02..D-06/D-08/D-11)
   The operator's single instance-wide surface: EVERY workspace on the
   instance with filter/segment states, archive/unarchive (D-02), the
   empty-only delete with the per-member orphan disposition modal
   (D-05/D-06/D-08), and honest refusals.
   =====================================================================
   The page renders ONLY from the GET /api/auth/operator/workspaces
   response (T-60-05 doctrine) — never from the client document: the
   listing includes workspaces the operator holds no membership in, so
   the client copy cannot know them. One fill loop with a monotonic
   sequence + in-flight abort lives in actions.js (dashboard.js:27-46
   pattern); NO auto-poll — a low-frequency surface. A non-operator
   deep-linking the route gets the server 403 surfaced as a fullstate —
   never a blank page, never a client-side guess (D-11: the server is
   the control, the nav gate is cosmetic). All payload strings render
   through esc() — text nodes only, no raw interpolation (T-79-10). */
import { esc, ago } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { S } from '../core/store.js';
import { t } from '../core/i18n.js';
import { av, empty } from '../ui/helpers.js';
import { ROUTE_TEARDOWN } from '../shell/render.js';
import { refreshGovernanceWorkspaces } from '../actions/actions.js';

/* The four fullstates are verbatim dashboard.js:84-87 shapes: 403 → lock
   glyph + err.code403 + route name + keyed body + home way out; other
   fetch errors → cloud-alert + retry (explicit, never auto re-kicked
   while the error state is set — CR-01); first visit → aria-busy faint
   busy body; empty → the documented empty() copy. */
const full403 = () =>
  `<div class="fullstate"><div class="box"><div class="empty-state" style="padding:0"><div class="glyph">${ic('lock', 20)}</div></div><span class="code">${t('err.code403')}</span><h1>${t('nav.route.governance')}</h1><p>${t('err.operatorOnly')}</p><div class="row"><button class="btn btn-primary" data-a="go" data-r="home">${t('nav.goHome')}</button></div></div></div>`;
const fullErr = () =>
  `<div class="fullstate"><div class="box"><div class="empty-state err" style="padding:0"><div class="glyph">${ic('cloud-alert', 20)}</div></div><h1>${t('page.somethingWrong')}</h1><p>${t('page.loadFailedBody')}</p><div class="row"><button class="btn btn-primary" data-a="govRetry">${ic('refresh-cw', 14)}${t('page.tryAgain')}</button></div></div></div>`;

/* Client-side name/slug filter — the ONLY scaling affordance this phase
   (planner assumption: unpaginated listing, small instance). Never server
   pagination here. */
const govFiltered = () => {
  const segV = S.ui.govSegV || 'all';
  const q = (S.ui.govQ || '').trim().toLowerCase();
  let rows = S.ui.govWs || [];
  if (segV === 'active') rows = rows.filter(w => !w.archived);
  else if (segV === 'archived') rows = rows.filter(w => w.archived);
  if (q) rows = rows.filter(w => (w.name || '').toLowerCase().includes(q) || (w.slug || '').toLowerCase().includes(q));
  return rows;
};

const wsRow = w => {
  /* Honest creator (Pitfall 1): null renders '—' — never a fake name. The
     Delete control renders on EVERY row — the server is the authority
     (workspaceNotEmpty surfaces as its keyed err toast; the client may not
     silently pre-filter non-empty rows, T-79-09). Long names/emails ride
     .trunc overflow behavior (UI-SPEC long-text backstop). */
  return `<tr>
    <td style="padding-left:14px"><span class="trunc" style="display:inline-block;max-width:260px;vertical-align:bottom;font-weight:600">${esc(w.name)}</span></td>
    <td><span class="mono faint trunc" style="display:inline-block;max-width:180px;vertical-align:bottom">${esc(w.slug || '—')}</span></td>
    <td>${esc(String(w.memberCount ?? 0))}</td>
    <td>${w.creator ? `<span class="trunc" style="display:inline-block;max-width:220px;vertical-align:bottom">${esc(w.creator.name)}</span>` : '<span class="faint">—</span>'}</td>
    <td class="faint">${esc(ago(w.createdAt))}</td>
    <td>${w.archived ? `<span class="badge amber">${t('page.governance.archivedBadge')}</span>` : '<span class="faint">—</span>'}</td>
    <td><span class="row" style="gap:8px;justify-content:flex-end">${w.archived ? `<button class="btn btn-secondary btn-sm" data-a="govUnarchive" data-id="${esc(w.id)}">${t('page.governance.unarchive')}</button>` : `<button class="btn btn-secondary btn-sm" data-a="govArchiveAsk" data-id="${esc(w.id)}">${t('page.governance.archive')}</button>`}<button class="btn btn-danger btn-sm" data-a="govDeleteAsk" data-id="${esc(w.id)}">${t('page.governance.delete')}</button></span></td>
  </tr>`;
};

export function pageGovernance() {
  /* The server decision, surfaced verbatim (DASH-04/D-52-4 shape): the gate
     is the server's 403; the page only reports it — keyed message, home
     way out. */
  if (S.ui.govWsErr?.status === 403) return full403();
  if (S.ui.govWsErr?.status) return fullErr();

  const loading = !S.ui.govWs;
  if (loading && !S.ui.govWsErr) refreshGovernanceWorkspaces(); // in-render kick covers a boot-time deep link (TRN-01 precedent)

  const segV = S.ui.govSegV || 'all';
  const q = (S.ui.govQ || '').trim().toLowerCase();
  const rows = loading ? [] : govFiltered();
  const seg = `<div class="seg" role="group" aria-label="${t('page.governance.wsTitle')}">${[
    ['all', 'page.governance.segAll'],
    ['active', 'page.governance.segActive'],
    ['archived', 'page.governance.segArchived'],
  ]
    .map(([v, k]) => `<button class="${segV === v ? 'on' : ''}" data-a="govSeg" data-v="${v}" aria-pressed="${segV === v}">${t(k)}</button>`)
    .join('')}</div>`;

  const body = loading
    ? `<div class="panel-b faint" aria-busy="true">${t('page.governance.loading')}</div>`
    : !(S.ui.govWs || []).length
      ? empty('archive', t('page.governance.emptyTitle'), t('page.governance.emptyBody'), '', 'sm', 3)
      : rows.length
        ? `<table class="perm-t" style="min-width:880px"><thead><tr><th style="padding-left:14px">${t('page.governance.colName')}</th><th style="text-align:left">${t('page.governance.colSlug')}</th><th>${t('page.governance.colMembers')}</th><th style="text-align:left">${t('page.governance.colCreator')}</th><th style="text-align:left">${t('page.governance.colCreated')}</th><th style="text-align:left">${t('page.governance.colStatus')}</th><th></th></tr></thead><tbody>${rows.map(wsRow).join('')}</tbody></table>`
        : empty('search', t('page.governance.noMatchesTitle'), t('page.governance.noMatchesBody', { query: q }), '', 'sm', 3);

  return `<div class="page wide" style="max-width:1200px">
    <div class="ph"><div><h1>${t('nav.route.governance')}</h1><p>${t('page.governance.subtitle')}</p></div></div>
    <div class="sblock">
      <h2>${t('page.governance.wsTitle')}</h2>
      <p class="hint">${t('page.governance.lead')}</p>
      <div class="row" style="margin-bottom:12px;gap:8px;flex-wrap:wrap"><div class="inwrap">${ic('search', 13)}<input class="input search-sm" id="gov-q" data-in="govQ" placeholder="${t('a11y.searchNameOrEmail')}" value="${esc(S.ui.govQ || '')}" aria-label="${t('a11y.searchMembers')}"></div>${seg}</div>
      <div class="panel" style="overflow-x:auto">${body}</div>
    </div>
  </div>`;
}

/* The orphan disposition modal body (D-05/D-06/D-08) — rendered through the
   generic modal host; state lives in S.ui.govDispositions keyed by userId
   ({type:'reassign',wsId,role} | {type:'release'}). The footer's Delete
   button stays disabled until EVERY member carries a disposition — the
   visible enforcement of D-06 (the server re-checks regardless). */
export function govOrphanBody(o) {
  const disp = S.ui.govDispositions || {};
  const members = o?.members;
  if (!members)
    return `<div class="modal-b faint" aria-busy="true" style="padding-top:18px">${t('page.governance.loading')}</div><div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="govOrphanCancel">${t('common.cancel')}</button></div>`;
  const unresolved = members.some(m => !disp[m.userId]);
  const row = m => {
    const d = disp[m.userId];
    const targets = o.targets || [];
    const pick = `<div class="seg" role="group" aria-label="${esc(m.name || m.email)}">${[
      ['reassign', 'page.governance.reassign'],
      ['release', 'page.governance.release'],
    ]
      .map(([v, k]) => `<button class="${d?.type === v ? 'on' : ''}" data-a="govOrphanPick" data-id="${esc(m.userId)}" data-v="${v}" data-ws="${esc(targets[0]?.id || '')}" aria-pressed="${d?.type === v}">${t(k)}</button>`).join('')}</div>`;
    /* D-08: reassign reveals destination (name + member count, delete target
       excluded) and role (owner/admin/member — viewer excluded) selects in
       the SAME step — no wizard. */
    const detail =
      d?.type !== 'reassign'
        ? d
          ? ''
          : `<div class="hint" style="margin-top:6px">${t('page.governance.unresolvedHint')}</div>`
        : `<div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap">
            <label class="label" style="margin:0">${t('page.governance.destLabel')}</label>
            <select class="input" data-in="govDest" data-id="${esc(m.userId)}">${targets.map(tg => `<option value="${esc(tg.id)}" ${d.wsId === tg.id ? 'selected' : ''}>${esc(tg.name)} (${esc(String(tg.memberCount))})</option>`).join('')}</select>
            <label class="label" style="margin:0">${t('page.governance.roleLabel')}</label>
            <select class="input" data-in="govRole" data-id="${esc(m.userId)}">${['owner', 'admin', 'member'].map(r => `<option value="${r}" ${d.role === r ? 'selected' : ''}>${t('common.role.' + r)}</option>`).join('')}</select>
          </div>`;
    return `<div class="srow" data-uid="${esc(m.userId)}"><div><div class="row" style="gap:8px">${av(m.userId, 'sm', false)}<span class="t trunc">${esc(m.name || '')}</span><span class="faint trunc">${esc(m.email || '')}</span><span class="badge">${t('common.role.' + (m.role || 'member'))}</span></div>${pick}${detail}</div></div>`;
  };
  return `<div class="modal-b" style="padding-top:18px;gap:10px">
    <p class="muted" style="margin:0;font-size:13px;line-height:1.55">${t('page.governance.orphanBody')}</p>
    ${members.map(row).join('')}
  </div>
  <div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="govOrphanCancel">${t('common.cancel')}</button><button class="btn btn-danger" data-a="govOrphanSubmit" ${unresolved ? 'disabled' : ''}>${t('page.governance.okDelete')}</button></div>`;
}

/* Modal state hygiene: leaving the route (or a listing refresh that removes
   the target) never strands a stale orphan stage. */
export const govOrphanTeardown = () => {
  if (S.ui.govOrphan) {
    S.ui.govOrphan = null;
    S.ui.govDispositions = {};
  }
};
/* Phase 60 (D-05): the teardown registry pattern — no poll to kill here, but
   a stale orphan-disposition stage must never survive route exit. */
ROUTE_TEARDOWN.governance = govOrphanTeardown;
