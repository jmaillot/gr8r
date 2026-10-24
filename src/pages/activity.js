/* ---------- ACTIVITY ---------- */
import { dayBucket, esc } from '../core/utils.js';
import { bucketLabel, t } from '../core/i18n.js';
import { D, S, canSee, proj } from '../core/store.js';
import { empty } from '../ui/helpers.js';
import { actCategory, actHtml } from '../components/task-list.js';

export function pageActivity() {
  const f = S.ui.actFilter || 'all';
  const who = S.ui.actWho || 'all';
  let as = D().activity.filter(a => !a.project || canSee(proj(a.project)));
  /* The filter ids match the stored machine verbs through the classifier — no
     English parsing: the classifier table owns the selection (D-06). */
  if (f !== 'all') as = as.filter(a => actCategory(a.verb) === f);
  if (who !== 'all') as = as.filter(a => a.by === who);
  const b = {};
  as.forEach(a => (b[dayBucket(a.at)] ||= []).push(a));
  return `<div class="page" style="max-width:820px">
    <div class="ph"><div><h1>${t('page.activity.title')}</h1><p>${t('page.activity.subtitle')}</p></div></div>
    <div class="row" style="gap:8px;margin-bottom:6px;flex-wrap:wrap"><div class="seg">${[
      ['all', t('page.activity.filterAll')],
      ['status', t('page.activity.filterStatus')],
      ['comments', t('page.activity.filterComments')],
      ['projects', t('page.activity.filterProjects')],
    ]
      .map(([k, n]) => `<button class="${f === k ? 'on' : ''}" data-a="set" data-k="actFilter" data-v="${k}">${n}</button>`)
      .join('')}</div>
    <select class="select" style="height:26px;width:auto;font-size:12px" data-in="actWho" aria-label="${t('a11y.filterByPerson')}"><option value="all">${t('page.activity.everyone')}</option>${D()
      .members.map(m => `<option value="${m.id}" ${who === m.id ? 'selected' : ''}>${esc(m.name)}</option>`)
      .join('')}</select></div>
    ${
      as.length
        ? Object.entries(b)
            .map(([k, list]) => `<div class="day-h">${bucketLabel(k)}</div><div class="feed lined">${list.map(a => actHtml(a, { proj: true })).join('')}</div>`)
            .join('')
        : empty('activity', t('page.activity.emptyTitle'), t('page.activity.emptyBody'))
    }
  </div>`;
}
