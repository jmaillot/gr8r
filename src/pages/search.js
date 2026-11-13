/* ---------- SEARCH RESULTS ---------- */
import { ago, esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { D, S, mem, pColor, proj, task } from '../core/store.js';
import { searchAll } from '../core/searchall.js';
import { t } from '../core/i18n.js';
import { FT, av, avStack, empty, hl, pIcon, pStatus, stIcon } from '../ui/helpers.js';
import { A } from '../actions/actions.js';
import { serverOnlyTasks } from '../core/search-server.js';
export function pageSearch() {
  const q = S.ui.searchQ;
  const r = searchAll(q);
  /* Phase 58 (D-05/D-06): server task results merge into the existing task rows —
     dedupe by id (server-only hits append after local, same rule as the palette),
     snippet is plain text (58-01 strips HTML server-side) re-stripped defensively
     before esc() (T-58-06). No new i18n keys: server hits join the existing
     Tasks section and its counts. */
  const srv = S.ui.searchServer && S.ui.searchServer.q === q ? serverOnlyTasks(r.tasks, S.ui.searchServer.tasks || []) : [];
  if (q) A.searchPageServer(q);
  const cat = S.ui.searchCat;
  const cats = [
    ['all', t('page.activity.filterAll')],
    ['tasks', t('nav.route.tasks')],
    ['projects', t('nav.route.projects')],
    ['people', t('palette.scope.people')],
    ['files', t('page.project.tab.files')],
    ['comments', t('page.activity.filterComments')],
  ];
  const total = Object.values(r).reduce((a, b) => a + b.length, 0) + srv.length;
  const sec = (k, title, html, count) =>
    (cat === 'all' || cat === k) && (count ?? r[k].length)
      ? `<section style="margin-bottom:22px"><div class="eyebrow" style="margin-bottom:6px">${title} · ${count ?? r[k].length}</div><div class="panel" style="overflow:hidden">${html}</div></section>`
      : '';
  const taskRow = (t, snippet) =>
    `<div class="mini" data-a="openTask" data-id="${t.id}">${stIcon(t.status)}<span class="mono faint" style="font-size:11px">${t.key}</span><span class="tt">${hl(t.title, q)}</span><span class="pj"><span class="pdot" style="--c:${pColor(proj(t.project))}"></span>${esc(proj(t.project).name)}</span>${avStack(t.assignees || [], 3, 'sm')}${
      snippet
        ? `<span class="faint" style="font-size:12px;min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(snippet)}</span>`
        : ''
    }</div>`;
  /* D-05: server-only hits reuse the EXISTING task-row markup — no new view. A hit
     not in the local doc degrades: dashed-circle status icon, no project chip. */
  const srvRows = srv
    .map(st => {
      const local = task(st.id);
      const p = proj(st.projectId);
      const snip = String(st.snippet || '').replace(/<[^>]+>/g, '').slice(0, 120);
      return `<div class="mini" data-a="openTask" data-id="${esc(st.id)}">${local ? stIcon(local.status) : stIcon('backlog')}<span class="mono faint" style="font-size:11px">${esc(st.key)}</span><span class="tt">${hl(st.title, q)}</span>${
        p ? `<span class="pj"><span class="pdot" style="--c:${pColor(p)}"></span>${esc(p.name)}</span>` : ''
      }${avStack(local?.assignees || [], 3, 'sm')}${
        snip ? `<span class="faint" style="font-size:12px;min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(snip)}</span>` : ''
      }</div>`;
    })
    .join('');
  return `<div class="page" style="max-width:860px">
    <div class="inwrap" style="margin-bottom:14px">${ic('search', 16)}<input class="input input-lg" id="search-page-q" data-in="searchQ" placeholder="${t('a11y.searchAll')}" value="${esc(q)}" style="padding-left:34px;font-size:15px" aria-label="${t('nav.route.search')}"></div>
    <div class="tabs" style="margin-bottom:18px">${cats.map(([k, n]) => `<button class="tab ${cat === k ? 'on' : ''}" data-a="set" data-k="searchCat" data-v="${k}">${n}<span class="cnt">${k === 'all' ? total : k === 'tasks' ? r.tasks.length + srv.length : r[k].length}</span></button>`).join('')}</div>
    ${
      !q
        ? `<div class="row" style="gap:6px;flex-wrap:wrap"><span class="faint" style="font-size:12.5px">${t('page.search.recent')}</span>${(
            D().recentSearches || []
          )
            .map(s => `<button class="badge" data-a="setSearch" data-q="${esc(s)}">${ic('history', 11)}${esc(s)}</button>`)
            .join('')}</div>`
        : total
          ? sec(
              'tasks',
              t('nav.route.tasks'),
              r.tasks.map(t => taskRow(t)).join('') + srvRows,
              r.tasks.length + srv.length,
            ) +
            sec(
              'projects',
              t('nav.route.projects'),
              r.projects
                .map(
                  p =>
                    `<div class="mini" data-a="go" data-r="project" data-id="${p.id}">${pIcon(p, '', 13)}<span class="tt">${hl(p.name, q)} <span class="faint" style="font-size:12px">— ${esc(p.desc.slice(0, 70))}…</span></span>${pStatus(p.status)}</div>`,
                )
                .join(''),
            ) +
            sec(
              'people',
              t('palette.scope.people'),
              r.people
                .map(
                  m =>
                    `<div class="mini" data-a="go" data-r="member" data-id="${m.id}">${av(m.id, 'md', false)}<span class="tt">${hl(m.name, q)} <span class="faint" style="font-size:12px">${esc(m.title)}</span></span><span class="faint" style="font-size:12px">${esc(m.email)}</span></div>`,
                )
                .join(''),
            ) +
            sec(
              'files',
              t('page.project.tab.files'),
              r.files
                .map(
                  f =>
                    `<div class="mini" data-a="go" data-r="project" data-id="${f.project}" data-tab="files"><span class="ftype" style="--c:${FT[f.type].c}">${ic(FT[f.type].i, 14)}</span><span class="tt">${hl(f.name, q)}</span><span class="faint" style="font-size:12px">${f.size} · ${esc(proj(f.project).name)}</span></div>`,
                )
                .join(''),
            ) +
            sec(
              'comments',
              t('page.activity.filterComments'),
              r.comments
                .map(
                  c =>
                    `<div class="mini" style="align-items:flex-start;padding-top:10px;padding-bottom:10px" data-a="openTask" data-id="${c.task}">${av(c.by, 'sm')}<div class="grow" style="min-width:0"><div style="font-size:12px" class="muted"><b style="color:var(--text);font-weight:500">${esc(mem(c.by).name)}</b> ${t('page.search.on')} ${esc(task(c.task).title)} · ${ago(c.at)}</div><div style="font-size:13px">${hl(c.text, q)}</div></div></div>`,
                )
                .join(''),
            )
          : `<div class="panel">${empty('search-x', t('palette.noResults'), t('page.search.noMatch', { q: q }), `<button class="btn btn-secondary btn-sm" data-a="setSearch" data-q="">${t('page.states.clearSearch')}</button>`)}</div>`
    }
  </div>`;
}
