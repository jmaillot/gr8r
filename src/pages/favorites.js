/* ---------- FAVORITES ---------- */
import { allTasks, canSee, visibleProjects } from '../core/store.js';
import { t } from '../core/i18n.js';
import { empty } from '../ui/helpers.js';
import { miniRow } from '../components/task-list.js';
import { projectCard } from './projects.js';

export function pageFavorites() {
  const ps = visibleProjects().filter(p => p.fav && canSee(p));
  const ts = allTasks().filter(t => t.fav);
  return `<div class="page wide">
    <div class="ph"><div><h1>${t('page.favorites.title')}</h1><p>${t('page.favorites.subtitle')}</p></div></div>
    ${
      !ps.length && !ts.length
        ? `<div class="panel">${empty('star', t('page.favorites.emptyTitle'), t('page.favorites.emptyBody'), `<button class="btn btn-secondary btn-sm" data-a="go" data-r="projects">${t('page.favorites.browse')}</button>`)}</div>`
        : `
    <h2 class="sec" style="margin-bottom:10px">${t('page.favorites.projects')} <span class="faint" style="font-weight:500">${ps.length}</span></h2>
    ${ps.length ? `<div class="pgrid" style="margin-bottom:28px">${ps.map(projectCard).join('')}</div>` : `<p class="faint" style="margin-bottom:28px">${t('page.favorites.none')}</p>`}
    <h2 class="sec" style="margin-bottom:6px">${t('page.favorites.tasks')} <span class="faint" style="font-weight:500">${ts.length}</span></h2>
    ${ts.length ? `<div class="panel" style="overflow:hidden">${ts.map(t => miniRow(t)).join('')}</div>` : `<p class="faint">${t('page.favorites.noTasks')}</p>`}`
    }
  </div>`;
}
