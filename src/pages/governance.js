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
import { api } from '../core/api.js';
import { t } from '../core/i18n.js';
import { av, empty } from '../ui/helpers.js';
import { ROUTE_TEARDOWN } from '../shell/render.js';
import { srow } from './settings.js';
import { refreshGovernanceWorkspaces, refreshOperatorUsers } from '../actions/actions.js';

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
    <td>${w.archived ? `<span class="badge amber">${t('page.governance.archivedBadge')}</span>` : `<span class="badge green">${t('page.governance.activeBadge')}</span>`}</td>
    <td><span class="row" style="gap:8px;justify-content:flex-end">${api.canSuperAccess ? `<a class="btn btn-secondary btn-sm" href="/w/${esc(w.slug)}">${t('page.governance.open')}</a>` : ''}<button class="btn btn-secondary btn-sm" data-a="govEditAsk" data-id="${esc(w.id)}">${t('page.governance.edit')}</button>${w.archived ? `<button class="btn btn-secondary btn-sm" data-a="govUnarchive" data-id="${esc(w.id)}">${t('page.governance.unarchive')}</button>` : `<button class="btn btn-secondary btn-sm" data-a="govArchiveAsk" data-id="${esc(w.id)}">${t('page.governance.archive')}</button>`}<button class="btn btn-danger btn-sm" data-a="govDeleteAsk" data-id="${esc(w.id)}">${t('page.governance.delete')}</button></span></td>
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
  /* 79-03 (WSG-09/D-01): the Operators section mounts ONLY for an
     isInstanceAdmin user (server payload — D-112/D-11; the endpoint 403 is
     the control). The list's ground truth is refreshOperatorUsers()
     (GET /api/auth/operator/users, D-121) — the in-render kick covers a
     boot-time deep link, same pattern as the workspaces fill loop. */
  if (api.user?.isInstanceAdmin && !S.ui.operatorUsers) refreshOperatorUsers();
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
        : empty('search', t('page.governance.noMatchesTitle'), t('page.governance.noMatchesBody', { query: esc(q) }), '', 'sm', 3);

  return `<div class="page wide" style="max-width:1200px">
    <div class="ph"><div><h1>${t('nav.route.governance')}</h1><p>${t('page.governance.subtitle')}</p></div></div>
    ${api.user?.isInstanceAdmin ? govDeadCard() : ''}
    <div class="sblock">
      <h2>${t('page.governance.wsTitle')}</h2>
      <p class="hint">${t('page.governance.lead')}</p>
      <div class="row" style="margin-bottom:12px;gap:8px;flex-wrap:wrap"><div class="inwrap">${ic('search', 13)}<input class="input search-sm" id="gov-q" data-in="govQ" placeholder="${t('page.governance.searchWs')}" value="${esc(S.ui.govQ || '')}" aria-label="${t('page.governance.searchWs')}"></div>${seg}</div>
      <div class="panel" style="overflow-x:auto">${body}</div>
    </div>
    ${api.user?.isInstanceAdmin ? operatorCard() : ''}
  </div>`;
}

/* =====================================================================
   OPERATORS (79-03, WSG-09/D-01) — relocated from the Settings sessions
   tab (Phase 78/22 operatorCard): the governance page is the SINGLE
   operator-management surface. The markup, the D-90 inline-confirm
   stages (S.ui.operatorRevoke / S.ui.operatorDemote) and the
   settings.operator.* locale keys are reused verbatim; the underlying
   Phase 78 endpoints (GET/POST /api/auth/operator/users*) are untouched.
   Rendered ONLY for isInstanceAdmin (server ground truth — D-112); the
   list comes from refreshOperatorUsers() — never from the document.
   Owner rows are immune (D-119); the operator's own row explains the
   keep-current semantics (D-118). is_instance_admin is multi-seat
   (78-02, WSG-06/D-78-2): plain rows gain Make-operator, operator rows
   gain the demote inline-confirm; the last-operator refusal is the
   server's 409 (lastOperator) surfaced as a keyed err toast.
   ===================================================================== */
export function operatorCard() {
  const all = S.ui.operatorUsers;
  if (!all) return '';
  const meId = api.user?.id;
  /* Client-side name/email filter — same scaling affordance and pattern as
     the workspaces filter (govQ): state in S.ui.govOpQ, never server
     pagination (planner assumption: small instance). The inline confirm
     stages (revoke/demote) keep working regardless of the filter — rows
     hidden by the filter simply don't render their stage. */
  const q = (S.ui.govOpQ || '').trim().toLowerCase();
  const rows = q
    ? all.filter(u => (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))
    : all;
  const search = `<div class="row" style="margin-bottom:10px;gap:8px"><div class="inwrap">${ic('search', 13)}<input class="input search-sm" id="gov-op-q" data-in="govOpQ" placeholder="${t('page.governance.searchOp')}" value="${esc(S.ui.govOpQ || '')}" aria-label="${t('page.governance.searchOp')}"></div></div>`;
  const list = rows.length
    ? rows
        .map(u =>
          srow(
            `<span class="row" style="gap:8px">${esc(u.name || '')}<span class="faint">${esc(u.email)}</span>${u.id === meId ? `<span class="badge green">${t('settings.operator.youBadge')}</span>` : ''}${u.is_instance_admin ? `<span class="badge">${t('settings.operator.ownerBadge')}</span>` : ''}</span>`,
            u.last_login_at ? ago(u.last_login_at) : '—',
            S.ui.operatorRevoke === u.id
              ? `<span class="row" style="gap:8px"><span class="hint">${t('settings.operator.confirmBody')}</span><button class="btn btn-danger btn-sm" data-a="operatorRevokeConfirm" data-id="${esc(u.id)}">${t('settings.operator.confirm')}</button><button class="btn btn-secondary btn-sm" data-a="operatorRevokeCancel">${t('common.cancel')}</button></span>`
              : S.ui.operatorDemote === u.id
                ? `<span class="row" style="gap:8px"><span class="hint">${t('settings.operator.demoteConfirmBody')}</span><button class="btn btn-danger btn-sm" data-a="operatorDemote" data-id="${esc(u.id)}">${t('settings.operator.demoteConfirm')}</button><button class="btn btn-secondary btn-sm" data-a="operatorDemoteCancel">${t('common.cancel')}</button></span>`
                : u.is_instance_admin
                  ? `<span class="row" style="gap:8px"><span class="hint">${u.id === meId ? t('settings.operator.selfNote') : t('settings.operator.ownerImmune')}</span><button class="btn btn-secondary btn-sm" data-a="operatorDemoteAsk" data-id="${esc(u.id)}">${t('settings.operator.demoteShort')}</button></span>`
                  : `<span class="row" style="gap:8px"><button class="btn btn-secondary btn-sm" data-a="operatorPromote" data-id="${esc(u.id)}">${t('settings.operator.promote')}</button><button class="btn btn-secondary btn-sm" data-a="operatorRevokeAsk" data-id="${esc(u.id)}">${t('settings.operator.revokeShort')}</button></span>`,
          ),
        )
        .join('')
    : empty('search', t('popover.noMatches'), t('page.governance.noMatchesOpBody', { query: esc(q) }), '', 'sm', 1);
  return `<div class="sblock" style="margin-top:16px"><h2 style="margin-bottom:4px">${t('settings.operator.title')}</h2><p class="hint" style="margin-bottom:10px">${t('settings.operator.lead')}</p>${search}<div class="panel">${list}</div></div>`;
}

/* =====================================================================
   83-02 DEAD-MAPPING WARNING CARD (D-08/D-10/D-11, T-83-07)
   Operator-gated, DISPLAY-ONLY: lists orphaned group_mappings rows and
   the Phase 82 refused-guard audit trail. Rendered ONLY when the
   dead-mappings payload carries at least one item — zero dead items →
   the markup is absent entirely, no off-line shell (D-10). Every value
   is esc()d at FIRST render — group_mappings.label is an opaque carried
   value (the Phase 80 XSS watch-item) and the trail action string is
   split on the FIRST colon only (D-08). No data-a anywhere in the card
   (D-11: cleanup stays deferred with the mapping editor).
   ===================================================================== */
const govDeadCard = () => {
  const dead = S.ui.govDead;
  if (!dead) return '';
  const orphans = dead.orphans || [];
  const trail = dead.trail || [];
  if (!orphans.length && !trail.length) return '';
  /* FIRST-colon-only split (D-08/Pitfall 7): `group_<delta>:group:<guid>:<reason>`
     → delta | group | guid | reason. A second first-colon split peels guid
     from reason — a colon inside a reason never corrupts the split. */
  const splitFirst = s => {
    const [head, tail] = String(s ?? '').split(/:(.*)/s);
    return [head || '', tail || ''];
  };
  const orphanRow = o =>
    `<div class="srow"><div><div class="row" style="gap:8px"><span class="badge amber">${esc(o.kind || '')}</span><span class="t trunc">${esc(o.label || '')}</span><span class="faint mono trunc">${esc(o.group_guid || '')} → ${esc(o.workspace_id || '')}</span></div></div></div>`;
  const trailRow = r => {
    const [delta, rest] = splitFirst(r.action);
    const [ns, tail2] = splitFirst(rest);
    const [guid, reason] = splitFirst(tail2);
    return `<div class="srow"><div><div class="row" style="gap:8px"><span class="badge">${esc(delta)}</span><span class="faint">${esc(ns)}</span><span class="mono trunc">${esc(guid)}</span><span class="faint trunc">${esc(reason)}</span><span class="faint">${esc(ago(r.created_at))}</span></div></div></div>`;
  };
  return `<div class="sblock" style="margin-top:16px"><h2 style="margin-bottom:4px">${t('page.governance.deadTitle')}</h2><p class="hint" style="margin-bottom:10px">${t('page.governance.deadLead')}</p><div class="panel"><div style="margin-bottom:12px"><div class="label" style="margin-bottom:6px">${t('page.governance.deadOrphans')}</div>${orphans.map(orphanRow).join('')}</div><div><div class="label" style="margin-bottom:6px">${t('page.governance.deadTrail')}</div>${trail.map(trailRow).join('')}</div></div></div>`;
};

/* =====================================================================
   83-02 RENAME MODAL (D-01/D-02/D-07, T-83-07) — mirrors govOrphanBody:
   rendered through the generic custom host; state lives in S.ui.govEditWs
   ({id, name, slug, origSlug}) staged by A.govEditAsk. A slugTaken refusal
   keeps the modal open and offers the server's suggested slug with one
   click to adopt (D-07). Field values ride data-in handlers — the staged
   state, never the DOM, is the ground truth.
   ===================================================================== */
export function govEditBody() {
  const ws = S.ui.govEditWs;
  const suggest = S.ui.govEditSuggest;
  const fields = ws
    ? `<label class="label" style="margin:0" for="gov-edit-name">${t('page.governance.nameLabel')}</label>
    <input class="input" id="gov-edit-name" data-in="govEditName" value="${esc(ws.name || '')}" maxlength="60" aria-label="${t('page.governance.nameLabel')}">
    <label class="label" style="margin:0" for="gov-edit-slug">${t('page.governance.slugLabel')}</label>
    <input class="input" id="gov-edit-slug" data-in="govEditSlug" value="${esc(ws.slug || '')}" maxlength="40" aria-label="${t('page.governance.slugLabel')}">
    ${suggest ? `<div class="row" style="gap:8px;align-items:center;margin-top:4px;flex-wrap:wrap"><span class="hint" style="margin:0">${t('page.governance.slugTakenHint', { slug: esc(suggest) })}</span><button class="btn btn-secondary btn-sm" data-a="govEditAdopt" data-slug="${esc(suggest)}">${t('page.governance.adoptSlug')}</button></div>` : ''}`
    : '';
  return `<div class="modal-b" style="padding-top:18px;gap:10px">
    <h2 style="margin:0;font-size:16px">${t('page.governance.editTitle')}</h2>
    ${fields}
  </div>
  <div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="govEditCancel">${t('common.cancel')}</button><button class="btn btn-primary" data-a="govEditSave">${t('common.save')}</button></div>`;
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
    <h2 style="margin:0;font-size:16px">${t('page.governance.orphanTitle', { n: members.length, name: esc(o?.ws?.name || '') })}</h2>
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
  /* 83-02: the rename modal stage never survives route exit either. */
  if (S.ui.govEditWs) {
    S.ui.govEditWs = null;
    S.ui.govEditSuggest = null;
  }
};
/* Phase 60 (D-05): the teardown registry pattern — no poll to kill here, but
   a stale orphan-disposition stage must never survive route exit. */
ROUTE_TEARDOWN.governance = govOrphanTeardown;
