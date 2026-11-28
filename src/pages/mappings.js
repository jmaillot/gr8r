/* =====================================================================
   102-01 ENTRA ID MAPPINGS (MAPUI-01 client half) — the operator's
   group → workspace mapping surface over the Phase 101 routes. Render
   ONLY from the GET /api/governance/group-mappings payload (T-60-05
   doctrine) — never from the client document. One fill loop with a
   monotonic sequence + in-flight abort lives in actions.js
   (refreshMappings, the governance pattern); NO auto-poll — a
   low-frequency surface. A non-operator deep-linking the route gets the
   server 403 surfaced as a fullstate — never a blank page, never a
   client-side guess (D-11: the server is the control, the nav gate is
   cosmetic). All payload strings render through esc() — text nodes
   only, no raw interpolation (T-79-10 stored-XSS watch-item).
   ===================================================================== */
import { esc, ago } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { S } from '../core/store.js';
import { api } from '../core/api.js';
import { t } from '../core/i18n.js';
import { empty } from '../ui/helpers.js';
import { ROUTE_TEARDOWN } from '../shell/render.js';
import { refreshMappings } from '../actions/actions.js';

/* The fullstates are verbatim governance.js shapes: 403 → lock glyph +
   err.code403 + route name + keyed body + home way out; other fetch
   errors → cloud-alert + retry (explicit, never auto re-kicked while
   the error state is set — CR-01). */
const full403 = () =>
  `<div class="fullstate"><div class="box"><div class="empty-state" style="padding:0"><div class="glyph">${ic('lock', 20)}</div></div><span class="code">${t('err.code403')}</span><h1>${t('nav.route.mappings')}</h1><p>${t('err.operatorOnly')}</p><div class="row"><button class="btn btn-primary" data-a="go" data-r="home">${t('nav.goHome')}</button></div></div></div>`;
const fullErr = () =>
  `<div class="fullstate"><div class="box"><div class="empty-state err" style="padding:0"><div class="glyph">${ic('cloud-alert', 20)}</div></div><h1>${t('page.somethingWrong')}</h1><p>${t('page.loadFailedBody')}</p><div class="row"><button class="btn btn-primary" data-a="mapRetry">${ic('refresh-cw', 14)}${t('page.tryAgain')}</button></div></div></div>`;

/* =====================================================================
   107-01 (SPA-01) THE MAPPINGS TABLE — one <tr> per mapping, the perm-t
   idiom verbatim from governance.js:104 (table class="perm-t"
   min-width:880px, first th padding-left:14px, last th empty gutter,
   wrapper <div class="panel" style="overflow-x:auto">). SPA-01 columns:
   Label / Group ID (mono) / Workspace (— when null — the server never
   fakes names) / Team (teamMissing-keyed badge — NEVER a falsy teamName
   check, the 106-02 handoff: a set teamId with a null name is a REAL
   "team left the doc" state) / Role badge / Users added (m.liveMembers,
   current-members semantics — the former {n} count chip retired) /
   When (ago(m.createdAt) — planner decision A6: "When" reads as "since
   this mapping exists", so the created_at, not the updatedAt). The
   gutter keeps the staged Delete (D-90 mapStage trio untouched) and
   leaves room for the Task-2 Edit button. Every interpolated cell and
   attribute rides esc() (T-107-01). All payload strings render through
   esc() at EVERY render — including the staged-delete repaint, which is
   a re-render through this same template (T-102-04, T-79-10). */
const mapTr = m => {
  /* D-02: the amber dead badge per deadReason — 'workspace-deleted' and
     'workspace-archived' carry their own keys; anything else falls back
     to the archived copy. */
  const deadBadge = m.dead
    ? `<span class="badge amber">${t(m.deadReason === 'workspace-deleted' ? 'page.mappings.deadBadgeDeleted' : 'page.mappings.deadBadgeArchived')}</span>`
    : '';
  /* SPA-01 team cell — keyed off teamMissing (106-02 handoff, Pitfall 2). */
  const teamCell = m.teamMissing
    ? `<span class="badge amber">${t('page.mappings.teamMissingBadge')}</span>`
    : esc(m.teamName || '—');
  /* D-90 staged inline-confirm (the govRoleRevoke pattern): the staged row
     swaps its controls for the verbatim lazy-revocation copy + confirm/
     cancel pair. The id is the OPAQUE Phase 101 row id — never a
     GUID+workspace composite (Phase 101 D-08). */
  const ctl = S.ui.mapStage === m.id
    ? `<span class="row" style="gap:8px;max-width:340px"><span class="hint">${t('page.mappings.deleteCopy')}</span>${S.ui.mapRows.filter(r => r.groupGuid === m.groupGuid && r.workspaceId === m.workspaceId).length === 1 ? `<span class="hint">${t('page.mappings.deleteCopyRole')}</span>` : ''}<button class="btn btn-danger btn-sm" data-a="mapDeleteConfirm" data-id="${esc(m.id)}">${t('page.mappings.deleteConfirm')}</button><button class="btn btn-secondary btn-sm" data-a="mapDeleteCancel">${t('common.cancel')}</button></span>`
    : `<span class="row" style="gap:8px"><button class="btn btn-secondary btn-sm" data-a="mapEditAsk" data-id="${esc(m.id)}">${t('page.mappings.edit')}</button><button class="btn btn-secondary btn-sm" data-a="mapDeleteAsk" data-id="${esc(m.id)}">${t('page.mappings.delete')}</button></span>`;
  return `<tr><td style="padding-left:14px"><span class="trunc" style="display:inline-block;max-width:220px;vertical-align:bottom;font-weight:600">${esc(m.label || '')}</span>${deadBadge}</td><td><span class="faint mono trunc" style="display:inline-block;max-width:260px;vertical-align:bottom">${esc(m.groupGuid || '')}</span></td><td style="text-align:left"><span class="faint trunc" style="display:inline-block;max-width:180px;vertical-align:bottom">${esc(m.workspaceName || '—')}</span></td><td style="text-align:left">${teamCell}</td><td style="text-align:left"><span class="badge">${t('common.role.' + (m.role || 'member'))}</span></td><td style="text-align:left">${esc(String(m.liveMembers ?? 0))}</td><td style="text-align:left"><span class="faint">${esc(ago(m.createdAt))}</span></td><td style="text-align:left">${ctl}</td></tr>`;
};

export function pageMappings() {
  /* The server decision, surfaced verbatim (governance DASH-04/D-52-4 shape):
     the gate is the server's 403; the page only reports it — keyed message,
     home way out. */
  if (S.ui.mapErr?.status === 403) return full403();
  if (S.ui.mapErr?.status) return fullErr();

  const loading = !S.ui.mapRows;
  if (!S.ui.mapRows && !S.ui.mapErr) refreshMappings(); // in-render kick covers a boot-time deep link (governance.js:76 precedent)

  const rows = loading ? [] : S.ui.mapRows;
  /* The per-section three-tier (governance.js:99–105 shape): loading panel,
     table when rows exist, keyed quiet empty state otherwise. */
  const body = loading
    ? `<div class="panel-b faint" aria-busy="true">${t('page.mappings.loading')}</div>`
    : rows.length
      ? `<table class="perm-t" style="min-width:880px"><thead><tr><th style="padding-left:14px">${t('page.mappings.colLabel')}</th><th>${t('page.mappings.colGuid')}</th><th style="text-align:left">${t('page.mappings.colWorkspace')}</th><th style="text-align:left">${t('page.mappings.colTeam')}</th><th style="text-align:left">${t('page.mappings.colRole')}</th><th style="text-align:left">${t('page.mappings.colUsers')}</th><th style="text-align:left">${t('page.mappings.colWhen')}</th><th></th></tr></thead><tbody>${rows.map(mapTr).join('')}</tbody></table>`
      : empty('link', t('page.mappings.emptyTitle'), t('page.mappings.emptyBody'), '', 'sm', 3);

  return `<div class="page wide" style="max-width:1200px">
    <div class="ph"><div><h1>${t('nav.route.mappings')}</h1><p>${t('page.mappings.subtitle')}</p></div></div>
    ${mapCreateForm()}
    <div class="sblock">
      <h2>${t('page.mappings.sectionTitle')}</h2>
      <p class="hint">${t('page.mappings.sectionLead')}</p>
      <div class="panel" style="overflow-x:auto">${body}</div>
    </div>
    ${api.user?.isInstanceAdmin ? govDeadCard() : ''}
    ${api.user?.isInstanceAdmin ? usageSection() : ''}
  </div>`;
}

/* =====================================================================
   102-02 CREATE FORM PANEL (MAPUI-02, D-01/D-03/D-08): ALWAYS visible —
   a compact panel ABOVE the list, no reveal-on-add button (searching =
   adding, the governance D-90-3 precedent). GUID paste input, label
   input maxlength="200" (the server slices at 200), workspace select
   fed by S.ui.mapWs (the plan-01 loader's advisory pool — until it
   lands the picker shows a disabled 'select workspace' option), role
   select owner/admin/member riding the existing common.role.* keys
   (the govOrphanBody precedent). Every draft value renders through
   esc() — value attributes are the stored-XSS watch-item (T-102-04).
   Draft state lives in S.ui.mapForm via the IN.map* handlers, never
   the DOM.
   ===================================================================== */
const mapCreateForm = () => {
  const f = S.ui.mapForm || {};
  const wsPool = S.ui.mapWs || [];
  const wsOptions = wsPool.length
    ? wsPool.map(w => `<option value="${esc(w.id || '')}" ${f.wsId === w.id ? 'selected' : ''}>${esc(w.name || '')}</option>`).join('')
    : '';
  const wsSelect = `<select class="input" id="map-ws" data-in="mapWs" aria-label="${t('page.mappings.wsLabel')}">${
    wsPool.length
      ? `<option value="" ${!f.wsId ? 'selected' : ''} disabled>${t('page.mappings.wsPlaceholder')}</option>${wsOptions}`
      : `<option value="" selected disabled>${t('page.mappings.wsPlaceholder')}</option>`
  }</select>`;
  /* 107-01 (SPA-05): the team picker renders ONLY when a workspace is
     chosen — hidden until then, and fed by THAT workspace's doc.teams
     (the operatorWorkspaces payload extension; no new state slot, the
     pool IS the feed). The empty-value option is the server's nullable
     teamId default (workspace-only mapping). Changing the workspace
     resets the draft's teamId (IN.mapWs — a stale team under a new ws
     would produce confusing groupMappingTeamUnknown refusals, Pitfall 8). */
  const wsTeams = wsPool.find(w => w.id === f.wsId)?.teams || [];
  const teamSelect = f.wsId
    ? `<div><label class="label" for="map-team">${t('page.mappings.teamLabel')}</label><select class="input" id="map-team" data-in="mapTeam" aria-label="${t('page.mappings.teamLabel')}"><option value="" ${(f.teamId || '') === '' ? 'selected' : ''}>${t('page.mappings.teamNone')}</option>${wsTeams
        .map(tm => `<option value="${esc(tm.id || '')}" ${f.teamId === tm.id ? 'selected' : ''}>${esc(tm.name || '')}</option>`)
        .join('')}</select></div>`
    : '';
  const roleSelect = `<select class="input" id="map-role" data-in="mapRole" aria-label="${t('page.mappings.roleLabel')}">${['owner', 'admin', 'member']
    .map(r => `<option value="${r}" ${(f.role || 'member') === r ? 'selected' : ''}>${t('common.role.' + r)}</option>`)
    .join('')}</select>`;
  return `<div class="sblock">
    <h2 style="margin-bottom:4px">${t('page.mappings.formTitle')}</h2>
    <p class="hint" style="margin-bottom:10px">${t('page.mappings.formLead')}</p>
    <div class="panel" style="padding:12px">
      <div class="row" style="gap:8px;flex-wrap:wrap;align-items:flex-end">
        <div><label class="label" for="map-guid">${t('page.mappings.guidLabel')}</label>
          <input class="input" id="map-guid" data-in="mapGuid" placeholder="${t('page.mappings.guidPlaceholder')}" value="${esc(f.guid || '')}" aria-label="${t('page.mappings.guidLabel')}"></div>
        <div><label class="label" for="map-label">${t('page.mappings.labelLabel')}</label>
          <input class="input" id="map-label" data-in="mapLabel" value="${esc(f.label || '')}" maxlength="200" aria-label="${t('page.mappings.labelLabel')}"></div>
        <div><label class="label" for="map-ws">${t('page.mappings.wsLabel')}</label>${wsSelect}</div>
        ${teamSelect}
        <div><label class="label" for="map-role">${t('page.mappings.roleLabel')}</label>${roleSelect}</div>
        <button class="btn btn-primary" data-a="mapCreate">${t('page.mappings.create')}</button>
      </div>
    </div>
  </div>`;
};

/* =====================================================================
   107-01 DEAD-MAPPINGS TABLE + USAGE LOG (SPA-03/SPA-04, D-06/D-07/D-08/
   D-10/D-11, T-83-07) — the 83-02 card replaced by TWO perm-t tables
   (the Task-1 idiom verbatim). DEAD SECTION: fed by orphans ONLY
   (Group ID mono / Workspace / Team / Last seen) — quiet-absence when
   the payload is empty (D-10: the markup is absent entirely). USAGE
   SECTION: admin-only sblock below the dead section, fed by the
   extended dead-trail GET's usage slice ({shown}=100 cap, cap-note
   ONLY at cap); the encoded action strings split on the FIRST colon
   client-side (D-08 — the server never transforms them, :9409
   doctrine); the 106-01 team verbs (group_team_*) carry keyed labels;
   the Group Name column is honest — the mapping's label when one
   matches, the raw esc'd GUID otherwise (owner-accepted fallback).
   No data-a anywhere in either section (D-11: display-only).
   Every value rides esc() at FIRST render (T-107-01).
   ===================================================================== */
const splitFirst = s => {
  const [head, tail] = String(s ?? '').split(/:(.*)/s);
  return [head || '', tail || ''];
};

const govDeadCard = () => {
  const dead = S.ui.govDead;
  if (!dead) return '';
  const orphans = dead.orphans || [];
  if (!orphans.length) return '';
  const orphanTr = o =>
    `<tr><td style="padding-left:14px"><span class="faint mono trunc" style="display:inline-block;max-width:260px;vertical-align:bottom">${esc(o.group_guid || '')}</span></td><td style="text-align:left"><span class="faint mono trunc" style="display:inline-block;max-width:220px;vertical-align:bottom">${esc(o.workspace_id || '')}</span></td><td style="text-align:left">${esc(o.team_id || '—')}</td><td style="text-align:left"><span class="faint">${esc(ago(o.created_at))}</span></td></tr>`;
  return `<div class="sblock" style="margin-top:16px"><h2 style="margin-bottom:4px">${t('page.mappings.deadTitle')}</h2><p class="hint" style="margin-bottom:10px">${t('page.mappings.deadLead')}</p><div class="panel" style="overflow-x:auto"><table class="perm-t" style="min-width:880px"><thead><tr><th style="padding-left:14px">${t('page.mappings.deadColGuid')}</th><th style="text-align:left">${t('page.mappings.deadColWorkspace')}</th><th style="text-align:left">${t('page.mappings.deadColTeam')}</th><th style="text-align:left">${t('page.mappings.deadColLastSeen')}</th></tr></thead><tbody>${orphans.map(orphanTr).join('')}</tbody></table></div></div>`;
};

/* The Usage Log's encoded-action → keyed-label map (D-08: the FIRST-colon
   head only). The 106-01 team verbs MUST be labeled or they render raw
   (Pitfall 4). Unmapped heads fall back to the raw esc'd head. */
const USAGE_ACTION_KEYS = {
  group_granted: 'page.mappings.usage.action.granted',
  group_role_upgraded: 'page.mappings.usage.action.upgraded',
  group_role_downgraded: 'page.mappings.usage.action.downgraded',
  group_membership_removed: 'page.mappings.usage.action.removed',
  group_team_granted: 'page.mappings.usage.action.teamGranted',
  group_team_removed: 'page.mappings.usage.action.teamRemoved',
  group_membership_skipped: 'page.mappings.usage.action.skipped',
  group_team_skipped: 'page.mappings.usage.action.skipped',
};
/* Reason tails → keyed faint labels; unknown tails render raw esc'd. */
const USAGE_REASON_KEYS = {
  'guard-refused': 'page.mappings.usage.reason.guardRefused',
  'lost-claim': 'page.mappings.usage.reason.lostClaim',
  'dead-team': 'page.mappings.usage.reason.deadTeam',
  'mapped-lower': 'page.mappings.usage.reason.mappedLower',
};

const usageSection = () => {
  const dead = S.ui.govDead;
  if (!dead) return '';
  const usage = dead.usage || [];
  const orphans = dead.orphans || [];
  /* A1 (planner): orphans exist but usage empty → the keyed empty state
     (the operator navigated deliberately); NO dead/usage payload at all
     → the whole sblock is '' (D-10). */
  if (!usage.length && !orphans.length) return '';
  const usageTr = u => {
    const [delta, rest] = splitFirst(u.action);
    const [ns, tail2] = splitFirst(rest);
    const [guid, reason] = splitFirst(tail2);
    const label = USAGE_ACTION_KEYS[delta] ? t(USAGE_ACTION_KEYS[delta]) : esc(delta);
    const reasonLabel = reason && USAGE_REASON_KEYS[reason] ? `<span class="faint">${t(USAGE_REASON_KEYS[reason])}</span>` : reason ? `<span class="faint">${esc(reason)}</span>` : '';
    const groupName = (S.ui.mapRows || []).find(r => r.groupGuid === guid)?.label;
    return `<tr><td style="padding-left:14px"><span class="row" style="gap:8px"><span class="badge">${label}</span>${reasonLabel}</span></td><td><span class="faint mono trunc" style="display:inline-block;max-width:260px;vertical-align:bottom">${esc(guid)}</span></td><td style="text-align:left"><span class="trunc" style="display:inline-block;max-width:200px;vertical-align:bottom">${esc(groupName || guid)}</span></td><td style="text-align:left"><span class="faint trunc" style="display:inline-block;max-width:200px;vertical-align:bottom">${esc(u.targetName || '')}</span></td><td style="text-align:left"><span class="faint">${esc(ago(u.createdAt))}</span></td></tr>`;
  };
  const body = usage.length
    ? `<table class="perm-t" style="min-width:880px"><thead><tr><th style="padding-left:14px">${t('page.mappings.usageColAction')}</th><th>${t('page.mappings.usageColGuid')}</th><th style="text-align:left">${t('page.mappings.usageColGroup')}</th><th style="text-align:left">${t('page.mappings.usageColWho')}</th><th style="text-align:left">${t('page.mappings.usageColWhen')}</th></tr></thead><tbody>${usage.map(usageTr).join('')}</tbody></table>${usage.length === 100 ? `<p class="hint" style="margin:8px 0 0">${t('page.mappings.usageCapNote', { shown: String(usage.length), total: '100' })}</p>` : ''}`
    : empty('history', t('page.mappings.usageEmptyTitle'), t('page.mappings.usageEmptyBody'), '', 'sm', 3);
  return `<div class="sblock" style="margin-top:16px"><h2 style="margin-bottom:4px">${t('page.mappings.usageTitle')}</h2><p class="hint" style="margin-bottom:10px">${t('page.mappings.usageLead')}</p><div class="panel" style="overflow-x:auto">${body}</div></div>`;
};

/* =====================================================================
   107-01 Task 2 (SPA-02) THE EDIT MODAL BODY — the govEditBody export
   pattern verbatim (governance.js:386): rendered through the generic
   custom modal host (openModal {type:'custom', cls:'sm'} from
   A.mapEditAsk), state lives in S.ui.mapEdit ({id, wsId, teamId, role,
   label}) staged in actions.js, never the DOM. The GUID renders
   READ-ONLY esc'd mono with the visible editGuidHint — R-8 client-side
   mirror of the server's groupMappingImmutable refusal (no
   data-in="mapEditGuid" input exists anywhere). Workspace select fed by
   S.ui.mapWs; team select fed by the EFFECTIVE ws — options re-derive
   from the select's CURRENT wsId value (the server validates the team
   against targetWsRow || curWsRow — a stale option list after a ws
   change would produce confusing groupMappingTeamUnknown toasts,
   Pitfall 8; IN.mapEditWs resets the draft teamId on ws change). Role
   select rides common.role.*; label input maxlength="200" (T-102-04)
   with esc()d value. Every payload string rides esc() (T-107-01).
   ===================================================================== */
export function mapEditBody() {
  const d = S.ui.mapEdit;
  if (!d)
    return `<div class="modal-b faint" aria-busy="true" style="padding-top:18px">${t('page.mappings.loading')}</div><div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="mapEditCancel">${t('common.cancel')}</button></div>`;
  const wsPool = S.ui.mapWs || [];
  const wsOptions = wsPool.length
    ? wsPool.map(w => `<option value="${esc(w.id || '')}" ${d.wsId === w.id ? 'selected' : ''}>${esc(w.name || '')}</option>`).join('')
    : '';
  const wsSelect = `<select class="input" id="map-edit-ws" data-in="mapEditWs" aria-label="${t('page.mappings.wsLabel')}">${
    wsPool.length
      ? `<option value="" ${!d.wsId ? 'selected' : ''} disabled>${t('page.mappings.wsPlaceholder')}</option>${wsOptions}`
      : `<option value="" selected disabled>${t('page.mappings.wsPlaceholder')}</option>`
  }</select>`;
  /* The team options follow the select's CURRENT wsId (the effective ws),
     never the row's original one. */
  const wsTeams = wsPool.find(w => w.id === d.wsId)?.teams || [];
  const teamSelect = `<select class="input" id="map-edit-team" data-in="mapEditTeam" aria-label="${t('page.mappings.teamLabel')}"><option value="" ${(d.teamId || '') === '' ? 'selected' : ''}>${t('page.mappings.teamNone')}</option>${wsTeams
    .map(tm => `<option value="${esc(tm.id || '')}" ${d.teamId === tm.id ? 'selected' : ''}>${esc(tm.name || '')}</option>`)
    .join('')}</select>`;
  const roleSelect = `<select class="input" id="map-edit-role" data-in="mapEditRole" aria-label="${t('page.mappings.roleLabel')}">${['owner', 'admin', 'member']
    .map(r => `<option value="${r}" ${(d.role || 'member') === r ? 'selected' : ''}>${t('common.role.' + r)}</option>`)
    .join('')}</select>`;
  return `<div class="modal-b" style="padding-top:18px;gap:10px">
    <h2 style="margin:0;font-size:16px">${t('page.mappings.editTitle')}</h2>
    <div><span class="label">${t('page.mappings.colGuid')}</span><div class="row" style="gap:8px;align-items:center"><span class="mono trunc" style="display:inline-block;max-width:260px;vertical-align:bottom">${esc(d.guid || '')}</span><span class="hint">${t('page.mappings.editGuidHint')}</span></div></div>
    <label class="label" style="margin:0" for="map-edit-label">${t('page.mappings.labelLabel')}</label>
    <input class="input" id="map-edit-label" data-in="mapEditLabel" value="${esc(d.label || '')}" maxlength="200" aria-label="${t('page.mappings.labelLabel')}">
    <label class="label" style="margin:0" for="map-edit-ws">${t('page.mappings.wsLabel')}</label>
    ${wsSelect}
    <label class="label" style="margin:0" for="map-edit-team">${t('page.mappings.teamLabel')}</label>
    ${teamSelect}
    <label class="label" style="margin:0" for="map-edit-role">${t('page.mappings.roleLabel')}</label>
    ${roleSelect}
  </div>
  <div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="mapEditCancel">${t('common.cancel')}</button><button class="btn btn-primary" data-a="mapEditSave">${t('common.save')}</button></div>`;
}

/* Phase 60 (D-05): teardown registry pattern — no staged inline-confirm
   state survives route exit (the govOrphanTeardown discipline): the
   delete stage is cleared so a stale confirm never re-appears on
   re-entry, and the create-form draft sheds with the page. */
const mapTeardown = () => {
  if (S.ui.mapStage) S.ui.mapStage = null;
  S.ui.mapForm = null;
  S.ui.mapEdit = null; // 107-01 (SPA-02): the edit-modal draft sheds with the page — a stale draft never re-opens
};
ROUTE_TEARDOWN.mappings = mapTeardown;
