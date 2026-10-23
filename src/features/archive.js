/* ---------- archive ---------- */
import { ago, esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { PSTAT } from '../core/constants.js';
import { D, S, canSee, proj } from '../core/store.js';
import { t } from '../core/i18n.js';
import { empty, pIcon, stIcon } from '../ui/helpers.js';

export function pageArchive() {
  const tab = S.ui.archTab || 'tasks';
  const ts = D()
    .tasks.filter(t => t.archived && canSee(proj(t.project)) && !proj(t.project)?.archived)
    .sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0));
  const ps = D().projects.filter(p => p.archived);
  const row = (lead, title, sub, when, restoreAct, delAct, id) =>
    `<div class="mini" style="min-height:52px;cursor:default;gap:12px">${lead}<div class="grow" style="min-width:0"><div class="trunc" style="font-weight:500">${title}</div><div class="faint trunc" style="font-size:12px">${sub}</div></div><span class="faint hide-m" style="font-size:12px;white-space:nowrap">${when}</span><button class="btn btn-secondary btn-sm" data-a="${restoreAct}" data-id="${id}">${ic('rotate-ccw', 13)}${t('act.restore')}</button><button class="ibtn ibtn-sm" data-a="${delAct}" data-id="${id}" data-tip="${t('act.deletePermanently')}" aria-label="${t('act.deletePermanently')}" style="color:var(--red)">${ic('trash-2', 15)}</button></div>`;
  const body =
    tab === 'tasks'
      ? ts.length
        ? `<div class="panel" style="overflow:hidden">${ts
            .map(tk => {
              const p = proj(tk.project);
              return row(
                stIcon(tk.status, 15),
                esc(tk.title),
                `<span class="mono">${tk.key}</span> · ${esc(p.name)}`,
                tk.archivedAt ? t('page.archivedWhen', { when: ago(tk.archivedAt) }) : t('page.archived'),
                'restoreTask',
                'purgeTask',
                tk.id,
              );
            })
            .join('')}</div>`
        : `<div class="panel">${empty('archive', t('page.noArchivedTasks'), t('page.archiveTasksHint'), '')}</div>`
      : ps.length
        ? `<div class="panel" style="overflow:hidden">${ps.map(p => row(pIcon(p, '', 14), esc(p.name), `${D().tasks.filter(t => t.project === p.id).length} tasks · ${PSTAT[p.status].name}`, p.archivedAt ? t('page.archivedWhen', { when: ago(p.archivedAt) }) : t('page.archived'), 'restoreProject', 'delProject', p.id)).join('')}</div>`
        : `<div class="panel">${empty('archive', t('page.noArchivedProjects'), t('page.archiveProjectsHint'), '')}</div>`;
  return `<div class="page" style="max-width:900px">
    <div class="ph"><div><h1>${t('nav.route.archive')}</h1><p>${t('page.archiveSubtitle')}</p></div></div>
    <div class="tabs" style="margin-bottom:14px" role="tablist" aria-label="${t('nav.route.archive')}">${[
      ['tasks', t('nav.route.tasks'), ts.length],
      ['projects', t('nav.route.projects'), ps.length],
    ]
      .map(
        ([k, n, c]) =>
          `<button role="tab" aria-selected="${tab === k}" class="tab ${tab === k ? 'on' : ''}" data-a="set" data-k="archTab" data-v="${k}">${n}<span class="cnt">${c}</span></button>`,
      )
      .join('')}</div>
    ${body}
  </div>`;
}
