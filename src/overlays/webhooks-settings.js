/* =====================================================================
   OVERLAYS · WEBHOOKS SETTINGS — Phase 67 (67-04, D-08..D-12) — the
   lazy « Webhooks » tab of the unified project settings modal.
   =====================================================================
   Split from the entry chunk by the 500 kB gate (61-02/65-03/66-02
   remedy precedent): this module joins the shared A/IN namespaces by
   assignment, exactly like actions/templates.js, and the tab body
   renders through S.ui.whMod.webhooksBody after A.settingsTab
   pre-warms the chunk (the A.exportOpen lazy-module pattern). No
   webhook string or handler ever rides the entry chunk.

   Server-first gating (T-52-02): EVERY mutation goes through the
   67-03 gated routes (/api/workspaces/:slug/projects/:pid/webhooks…)
   — the render-time canManageProject re-check (Phase 55 precedent,
   T-67-11) is UX only. D-10 show-once secret: the dialog renders in
   the create-success path ONLY; no code path here ever reads a
   secret back (no route returns one), and dismissal drops it from
   state and the DOM (T-67-12, proven by e2e).

   WHK-05 mirror-tables rule: this section talks only to the API
   routes — hook config never touches the client-visible doc.
   ===================================================================== */
import { getLocale, t } from '../core/i18n.js';
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { S, proj, canManageProject } from '../core/store.js';
import { api, call } from '../core/api.js';
import { WEBHOOK_EVENTS } from '../core/webhook-events.js';
import { A, IN } from '../actions/actions.js';
import { toast } from '../ui/toast.js';
import { render } from '../shell/render.js';
/* The section's bilingual labels: EN rides the always-shipped table below
   (src/overlays/webhooks-labels.json — English bytes are legal in every
   build), FR rides the real fr.json catalogue under the webhook.* keys, so
   the locale-subset plugin strips it from the English-only build exactly
   like every other French byte (the 500 kB entry-chunk gate has no headroom
   for the base catalogue, 67-04 Rule 3 — hence this split). The tab-bar key
   (modal.settingsTabWebhooks) is the only webhook string in the base EN
   catalogue. EN↔FR key parity is asserted by test/build-locales.test.mjs. */
import LABELS from './webhooks-labels.json' with { type: 'json' };
const interp = (v, vars) =>
  vars ? v.replace(/\{(\w+)\}/g, (m, n) => (Object.hasOwn(vars, n) ? String(vars[n]) : m)) : v;
const wt = (key, vars) => (getLocale() === 'fr' ? t('webhook.' + key, vars) : interp(LABELS[key] ?? key, vars));

/* Server-side WEBHOOK_FORMATS order (67-03) — the index maps to the
   webhook.format.N catalogue keys (D-12: teams-adaptive is index 1,
   the creation default). */
const FORMATS = ['teams-adaptive', 'teams-messagecard', 'raw-json'];

/* Section state rides S.ui — seeded by the tab click (A.settingsTab),
   re-rendered from live state, never snapshotted (53-03 Pitfall 3). */
const wh = () => {
  S.ui.whForm = S.ui.whForm || { id: null, url: '', events: [WEBHOOK_EVENTS[0]], format: FORMATS[0] };
  S.ui.whTestEvent = S.ui.whTestEvent || {};
  return S.ui;
};

const whPath = pid => `/api/workspaces/${api.workspace?.slug}/projects/${pid}/webhooks`;
const topModal = () => (Array.isArray(S.ui.modals) ? S.ui.modals[S.ui.modals.length - 1] : null);
const hostOf = url => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/* Fetch the hook list (canManageProject-gated server route). The
   response carries the webhookHookView projection — no secret field
   exists to leak (D-10/T-67-08). */
export async function loadHooks() {
  const m = topModal();
  const p = m && proj(m.id);
  if (!p || !api.enabled || !canManageProject(p)) return;
  const r = await call('GET', whPath(m.id));
  S.ui.whHooks = r.ok && Array.isArray(r.data?.hooks) ? r.data.hooks : [];
  render();
}

/* ---------- render ---------- */

const badge = health => {
  const cls = health === 'active' ? 'var(--green, #2e7d32)' : health === 'failing' ? 'var(--red)' : 'var(--text-3)';
  return `<span style="color:${cls};font-size:11.5px;font-weight:600" data-wh-badge="${health}">${wt('badge.' + health)}</span>`;
};

const eventChecks = form =>
  WEBHOOK_EVENTS.map(
    (ev, i) =>
      `<label class="xinc ${form.events.includes(ev) ? 'on' : ''}"><input type="checkbox" data-in="whEvent" data-ev="${ev}" ${form.events.includes(ev) ? 'checked' : ''}><span class="grow">${wt('event.' + (i + 1))}</span>${ic('check', 14)}</label>`,
  ).join('');

const formatRadios = form =>
  FORMATS.map(
    (f, i) =>
      `<label class="xfmt ${form.format === f ? 'on' : ''}"><input type="radio" name="whFormat" value="${f}" data-in="whFormat" ${form.format === f ? 'checked' : ''} aria-label="${wt('format.' + (i + 1))}"><b>${wt('format.' + (i + 1))}</b></label>`,
  ).join('');

const hookRow = h => {
  const w = wh();
  const evs = Array.isArray(h.events) ? h.events : [];
  const testEv = w.whTestEvent[h.id] && evs.includes(w.whTestEvent[h.id]) ? w.whTestEvent[h.id] : evs[0] || WEBHOOK_EVENTS[0];
  const testSel = evs
    .map(ev => {
      const i = WEBHOOK_EVENTS.indexOf(ev);
      return `<option value="${ev}" ${ev === testEv ? 'selected' : ''}>${wt('event.' + (i + 1))}</option>`;
    })
    .join('');
  const res =
    w.whTest && w.whTest.id === h.id
      ? w.whTest.ok
        ? `<span class="faint" style="font-size:11.5px" data-wh-test="ok">${wt('testOk', { code: w.whTest.statusCode ?? '—' })}</span>`
        : `<span class="faint" style="font-size:11.5px;color:var(--red)" data-wh-test="fail">${wt('testFail', { code: w.whTest.statusCode ?? '—' })}</span>`
      : '';
  return `<div class="mini" style="min-height:52px;gap:12px" data-hook="${h.id}">
    <div class="grow" style="min-width:0"><div class="trunc" style="font-weight:500">${ic('link', 13)} ${esc(hostOf(h.url))}</div>
    <div class="faint trunc" style="font-size:11.5px">${evs.length} · ${wt('format.' + (FORMATS.indexOf(h.format) + 1))}</div></div>
    ${badge(h.health)}
    ${res}
    <select data-in="whTestEvent" data-hook="${h.id}" aria-label="${wt('events')}">${testSel}</select>
    <button class="btn btn-secondary btn-sm" data-a="whTest" data-id="${h.id}">${ic('send', 13)}${wt('test')}</button>
    <button class="ibtn ibtn-sm" data-a="whEdit" data-id="${h.id}" aria-label="${t('act.edit')}">${ic('pencil', 15)}</button>
    <button class="btn btn-secondary btn-sm" data-a="whToggle" data-id="${h.id}">${h.status === 'active' ? wt('disable') : wt('enable')}</button>
    <button class="ibtn ibtn-sm" data-a="whDel" data-id="${h.id}" aria-label="${wt('del')}" style="color:var(--red)">${ic('trash-2', 15)}</button>
  </div>`;
};

const secretDialog = secret =>
  `<div class="field"><span class="label">${wt('secretTitle')}</span>
  <div class="row" style="gap:8px"><code id="wh-secret" style="user-select:all;word-break:break-all;font-size:12px">${esc(secret)}</code></div>
  <div class="hint" style="margin-top:6px">${wt('secretHint')}</div></div>`;

/* The tab body — tabBar and H come from projectSettingsModal so the
   tab bar stays the entry chunk's one concern. */
export function webhooksBody(p, tabBar, H) {
  if (!canManageProject(p)) return `${H(t('err.projectNotFound'))}${tabBar}<div class="modal-b"></div><div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">${t('act.done')}</button></div>`;
  if (!api.enabled)
    return `${H(t('act.projectSettings'))}${tabBar}<div class="modal-b"><div class="alert info">${ic('info', 14)}<span>${wt('serverOnly')}</span></div></div><div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">${t('act.done')}</button></div>`;
  const w = wh();
  const form = w.whForm;
  if (w.whSecret)
    return `${H(t('act.projectSettings'))}${tabBar}<div class="modal-b">${secretDialog(w.whSecret)}</div><div class="modal-f"><button class="btn btn-secondary" data-a="whCopy">${ic('copy', 14)}${wt('copy')}</button><span class="sp"></span><button class="btn btn-primary" data-a="whSecretDone">${t('act.done')}</button></div>`;
  const list = w.whHooks;
  return `${H(t('act.projectSettings'))}${tabBar}
  <div class="modal-b">
    <div class="field"><span class="label">${wt('addTitle')}</span>
      <input id="wh-url" type="url" data-in="whUrl" value="${esc(form.url)}" aria-label="${wt('url')}">
      <div class="hint">${wt('urlHint')}</div></div>
    <div class="field"><span class="label">${wt('format')}</span><div class="xfmts" role="radiogroup" aria-label="${wt('format')}">${formatRadios(form)}</div></div>
    <div class="field"><span class="label">${wt('events')}</span><div class="xincs" role="group" aria-label="${wt('events')}">${eventChecks(form)}</div></div>
    <button class="btn btn-primary" data-a="whSave">${ic('plus', 14)}${t('common.save')}</button>
    <div class="field" style="margin-top:14px"><span class="label">${wt('events')}</span>
    ${Array.isArray(list) ? (list.length ? list.map(hookRow).join('') : `<div class="hint">${wt('empty')}</div>`) : `<div class="hint" aria-busy="true">${t('page.states.loading')}</div>`}
    </div>
  </div>
  <div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">${t('act.done')}</button></div>`;
}

/* ---------- IN handlers (survive full re-renders, like every form model) ---------- */

IN.whUrl = el => {
  wh().whForm.url = el.value;
};
IN.whEvent = el => {
  const f = wh().whForm;
  const i = f.events.indexOf(el.dataset.ev);
  if (el.checked && i < 0) f.events.push(el.dataset.ev);
  if (!el.checked && i >= 0) f.events.splice(i, 1);
  render();
};
IN.whFormat = el => {
  wh().whForm.format = el.value;
  render();
};
IN.whTestEvent = el => {
  wh().whTestEvent[el.dataset.hook] = el.value;
};

/* ---------- actions (join the shared A namespace) ---------- */

const reload = async pid => {
  const r = await call('GET', whPath(pid));
  S.ui.whHooks = r.ok && Array.isArray(r.data?.hooks) ? r.data.hooks : [];
  render();
};

const whErr = () => toast(t('err.webhookError'), { kind: 'err' });

A.whSave = async () => {
  const m = topModal();
  const p = m && proj(m.id);
  if (!p || !api.enabled || !canManageProject(p)) return; // render-time re-check (T-67-11)
  const f = wh().whForm;
  const url = String(f.url || '').trim();
  if (!/^https:\/\//i.test(url)) return toast(wt('urlHint'), { kind: 'err' });
  if (!f.events.length) return whErr();
  const body = { url, format: f.format, events: f.events };
  const r = f.id
    ? await call('PATCH', `${whPath(m.id)}/${f.id}`, body)
    : await call('POST', whPath(m.id), body);
  if (!r.ok) return whErr();
  S.ui.whForm = { id: null, url: '', events: [WEBHOOK_EVENTS[0]], format: FORMATS[0] };
  /* D-10: the raw secret rides THIS create response only. */
  if (r.data?.secret) S.ui.whSecret = String(r.data.secret);
  await reload(m.id);
  if (!r.data?.secret) toast(t('toast.saved'));
};

A.whEdit = el => {
  const h = (S.ui.whHooks || []).find(x => x.id === el.dataset.id);
  if (!h) return;
  S.ui.whForm = { id: h.id, url: h.url, events: [...(h.events || [])], format: h.format };
  render();
};

A.whToggle = async el => {
  const m = topModal();
  const h = (S.ui.whHooks || []).find(x => x.id === el.dataset.id);
  if (!h || !m) return;
  const r = await call('PATCH', `${whPath(m.id)}/${h.id}`, { status: h.status === 'active' ? 'disabled' : 'active' });
  if (!r.ok) return whErr();
  await reload(m.id);
};

A.whDel = async el => {
  const m = topModal();
  const h = (S.ui.whHooks || []).find(x => x.id === el.dataset.id);
  if (!h || !m) return;
  const r = await call('DELETE', `${whPath(m.id)}/${h.id}`);
  if (!r.ok) return whErr();
  toast(t('toast.deleted', { name: hostOf(h.url) }));
  await reload(m.id);
};

/* D-11: send the chosen event's sample through the REAL 67-03 pipeline
   and show the immediate result (T-67-10: no bypass path exists). */
A.whTest = async el => {
  const m = topModal();
  const h = (S.ui.whHooks || []).find(x => x.id === el.dataset.id);
  if (!h || !m) return;
  const ev = wh().whTestEvent[h.id] || (h.events || [])[0] || WEBHOOK_EVENTS[0];
  const r = await call('POST', `${whPath(m.id)}/${h.id}/test`, { event: ev });
  if (!r.ok) return whErr();
  S.ui.whTest = { id: h.id, ok: !!r.data?.ok, statusCode: r.data?.statusCode ?? null };
  render();
};

/* The one D-10 dismissal: state drops the secret — it can never be
   re-rendered, and no fetch path re-reads it. */
A.whSecretDone = () => {
  S.ui.whSecret = null;
  render();
};

A.whCopy = async () => {
  if (!S.ui.whSecret) return;
  try {
    await navigator.clipboard.writeText(S.ui.whSecret);
    toast(wt('copied'));
  } catch {
    whErr();
  }
};
