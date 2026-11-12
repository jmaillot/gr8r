/* Named saved views UI (Phase 57 plan 02, VIEW-02, D-10/D-11/D-12).
   Its own lazy chunk (DELIV-02 500 kB index gate — the 56-02/57-01 pattern):
   the views popover body, the save/update flows and the apply/delete handlers
   live here; actions.js carries only one-line delegations. viewSync stays a
   SEPARATE lazy chunk — it is imported dynamically below, never statically,
   so the build gate's split-existence assertion keeps holding. */
import { D, S } from '../core/store.js';
import { api } from '../core/api.js';
import { t } from '../core/i18n.js';
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { render } from '../shell/render.js';
import { closeModal, openModal } from '../overlays/modals.js';
import { confirmDlg } from '../actions/actions.js';
import { toast } from '../ui/toast.js';
import { cachedNamedViews, isNamedViewKey } from '../core/savedViews.js';

const vs = () => import('../core/viewSync.js');
const wsId = () => (api.enabled ? api.workspace?.id : D().ws.url);

/* The last view this session saved/updated per table key — the Update entry
   re-snapshots under it. Session scope is deliberate: a fresh page lists the
   saved views and Save current… starts a new name. */
const _lastSaved = {};

/* The views popover body: the member's named rows (apply on click, delete
   icon), then Save current… and Update. Empty state hint when none (PROBE
   VIEW-02 empty) — no row is created until the first explicit save. */
export function popHtml(key) {
  const named = cachedNamedViews(wsId(), key);
  const rows = named.length
    ? named
        .map(
          x =>
            `<div class="mi" style="display:flex;align-items:center;gap:4px;padding:0 4px 0 0"><button class="mi grow" style="min-height:30px" data-a="applyTableView" data-key="${key}" data-name="${esc(x.name)}"><span class="trunc">${esc(x.name)}</span></button><button class="ibtn ibtn-xs" data-a="deleteTableView" data-key="${key}" data-name="${esc(x.name)}" aria-label="${t('a11y.deleteTableView', { name: x.name })}">${ic('trash-2', 13)}</button></div>`,
        )
        .join('')
    : `<div style="padding:6px 8px;font-size:12px;color:var(--text-2);line-height:1.5">${t('popover.noSavedViews')}</div>`;
  const canNamed = isNamedViewKey(key);
  return (
    `<div class="mh">${t('popover.savedViews')}</div>` +
    rows +
    (canNamed
      ? `<div class="msep"></div><button class="mi" data-a="saveTableView" data-key="${key}">${ic('star', 14)}${t('popover.saveCurrentView')}</button><button class="mi" data-a="updateTableView" data-key="${key}" ${_lastSaved[key] ? '' : 'style="opacity:.5"'}>${ic('history', 14)}${t('popover.updateView')}</button>`
      : '')
  );
}

/* A.pop('views') opened the empty popover; refresh the member's named rows
   (server GET / local mirror read — the D-52 refetch-on-open discipline) and
   fill the body. A closed/moved popover is simply left alone. */
export async function refreshViewsPop() {
  await vs().then(m => m.refreshNamedViews());
  if (S.ui.pop?.type === 'views') {
    S.ui.pop.html = popHtml(S.ui.pop.key);
    render();
  }
}

/* Save the current view under a new name (generic prompt modal — a NEW flow,
   deliberately not the legacy project-page saveView modal). */
export function saveTableView(el) {
  const key = el.dataset.key;
  if (!isNamedViewKey(key)) return;
  openModal({
    type: 'prompt',
    title: t('modal.saveTableView'),
    label: t('act.viewName'),
    ok: t('common.save'),
    run: async val => {
      const name = (val || '').trim();
      if (!name) return toast(t('err.viewNameRequired'));
      await doSave(key, name);
    },
  });
}

/* Update re-snapshots under the last name this session saved/updated, with an
   explicit confirm (D-12). Without a session name it degrades to Save…. */
export function updateTableView(el) {
  const key = el.dataset.key;
  const name = _lastSaved[key];
  if (!name || !isNamedViewKey(key)) return saveTableView(el);
  confirmDlg({
    title: t('popover.updateView'),
    body: t('modal.updateTableViewConfirm', { name: name }),
    ok: t('popover.updateView'),
    icon: 'history',
    run: () => doSave(key, name),
  });
}

async function doSave(key, name) {
  const err = await vs().then(m => m.saveNamedView(wsId(), key, name));
  if (err === 'viewNameConflict') {
    /* D-12: an existing name (the server's case-insensitive compare is the
       truth) overwrites only after an explicit confirm. */
    confirmDlg({
      title: t('modal.replaceTableView'),
      body: t('modal.saveTableViewReplace', { name: name }),
      ok: t('act.replaceView'),
      icon: 'star',
      run: async () => finishSave(key, name, await vs().then(m => m.saveNamedView(wsId(), key, name))),
    });
    return;
  }
  finishSave(key, name, err);
}

function finishSave(key, name, err) {
  if (err) return toast(t('err.' + err));
  _lastSaved[key] = name;
  closeModal();
  S.ui.pop = null;
  toast(t('toast.savedTableView', { name: name }));
  render();
}

/* Apply a named view: the whole live viewOf(key) state is replaced in place
   (except the search text `q`, D-11/D-15) and the normal write-through
   persists the applied live state. */
export async function applyTableView(el) {
  const key = el.dataset.key;
  const row = cachedNamedViews(wsId(), key).find(v => v.name === el.dataset.name);
  if (!row) return;
  const m = await vs();
  m.applyNamedView(key, row.blob);
  m.persistLiveView(key);
  S.ui.pop = null;
  render();
  toast(t('toast.appliedTableView', { name: row.name }));
}

export async function deleteTableView(el) {
  const key = el.dataset.key;
  const name = el.dataset.name;
  const err = await vs().then(m => m.deleteViewRow(wsId(), key, name));
  if (name === _lastSaved[key]) delete _lastSaved[key];
  if (err) return toast(t('err.' + err));
  if (S.ui.pop?.type === 'views') S.ui.pop.html = popHtml(S.ui.pop.key);
  render();
  toast(t('toast.deletedTableView', { name: name }));
}

/* Rebuild an open views popover body from the cache (after a refresh). */
export { popHtml as rebuildViewsPop };
