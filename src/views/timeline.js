/* ---------- TIMELINE ---------- */
import { $, TODAY, addD, diffD, esc, fmtDate, parse } from '../core/utils.js';
import { monthName, t as tk } from '../core/i18n.js';
import { ic } from '../core/icons.js';
import { S, allTasks, canSee, pColor, proj, task, taskProg, visibleProjects } from '../core/store.js';
import { leafEntries, orderedSiblings } from '../core/subtree.js';
import { avStack, empty, stIcon } from '../ui/helpers.js';
import { applyView, groupTasks, viewOf, viewToolbar } from '../shell/view-engine.js';
import { startOfWeek } from './calendar.js';

export function tlControls() {
  return `<div class="seg" style="margin-left:4px">${[
    ['week', tk('page.timeline.weeks')],
    ['month', tk('page.timeline.months')],
  ]
    .map(([k, n]) => `<button class="${S.ui.tlZoom === k ? 'on' : ''}" data-a="set" data-k="tlZoom" data-v="${k}">${n}</button>`)
    .join('')}</div>
  <select class="select" style="height:26px;width:auto;font-size:12px;margin-left:4px" data-in="tlGroup" aria-label="${tk('sort.groupBy')}">${[
    ['status', `${tk('page.groupLabel')} ${tk('sort.status')}`],
    ['assignee', `${tk('page.groupLabel')} ${tk('sort.assignee')}`],
    ['project', `${tk('page.groupLabel')} ${tk('page.field.project')}`],
    ['none', tk('sort.none')],
  ]
    .map(([k, n]) => `<option value="${k}" ${S.ui.tlGroup === k ? 'selected' : ''}>${n}</option>`)
    .join('')}</select>
  <button class="btn btn-ghost" data-a="tlToday">${ic('crosshair', 14)}${tk('common.today')}</button>`;
}
export function timelineHtml(ts, key, p) {
  const dw = S.ui.tlZoom === 'week' ? 32 : 11;
  const rs = startOfWeek(addD(TODAY, S.ui.tlZoom === 'week' ? -21 : -56));
  const nDays = S.ui.tlZoom === 'week' ? 7 * 13 : 7 * 34;
  const X = ds => diffD(parse(ds), rs) * dw;
  const g = S.ui.tlGroup;
  const groups = groupTasks(
    ts.filter(t => t.due),
    g === 'project' && p ? 'status' : g,
  ).filter(G => G.tasks.length);
  const rows = [];
  /* Phase 65 (65-03 D-12): subtask bars render indented under the parent task,
     collapsible — the top level rides the S.ui.openTasks precedent (shared
     with the list view), nested levels ride the session-only S.ui.subOpenNodes
     map. Sibling order is subtree.orderedSiblings (D-03). Bars without their
     own dates inherit the parent's range (D-12). */
  const pushSubs = t => {
    const walk = (pid, depth) => {
      for (const s of orderedSiblings(t.subtasks, pid)) {
        rows.push({ type: 's', t, s, depth });
        if (S.ui.subOpenNodes[s.id]) walk(s.id, depth + 1);
      }
    };
    walk(null, 0);
  };
  const ms = p
    ? p.milestones || []
    : visibleProjects()
        .filter(canSee)
        .flatMap(q => (q.milestones || []).map(m => ({ ...m, p: q })));
  if (ms.length) rows.push({ type: 'ms' });
  groups.forEach(G => {
    if (g !== 'none') rows.push({ type: 'g', G });
    G.tasks.sort((a, b) => ((a.start || a.due) > (b.start || b.due) ? 1 : -1)).forEach(t => {
      rows.push({ type: 't', t });
      if (t.subtasks.length && S.ui.openTasks[t.id]) pushSubs(t);
    });
  });
  const RH = 36;
  const H = rows.length * RH;
  const W = nDays * dw;
  const rowY = {};
  rows.forEach((r, i) => {
    if (r.type === 't') rowY[r.t.id] = i * RH + RH / 2;
  });
  // header
  let months = [],
    cm = null;
  for (let i = 0; i < nDays; i++) {
    const d = addD(rs, i);
    const k = d.getMonth() + '-' + d.getFullYear();
    if (k !== cm) {
      months.push({ d, i, n: 0 });
      cm = k;
    }
    months[months.length - 1].n++;
  }
  const days =
    S.ui.tlZoom === 'week'
      ? Array.from({ length: nDays }, (_, i) => {
          const d = addD(rs, i);
          return `<div style="width:${dw}px" class="${diffD(d, TODAY) === 0 ? 'today' : ''}">${d.getDate()}</div>`;
        }).join('')
      : Array.from({ length: nDays / 7 }, (_, i) => {
          const d = addD(rs, i * 7);
          return `<div style="width:${dw * 7}px">${monthName(d, 'short')} ${d.getDate()}</div>`;
        }).join('');
  const weekend =
    S.ui.tlZoom === 'week'
      ? Array.from({ length: nDays }, (_, i) => {
          const d = addD(rs, i);
          return d.getDay() === 0 || d.getDay() === 6 ? `<div class="tl-we" style="left:${i * dw}px;width:${dw}px"></div>` : '';
        }).join('')
      : '';
  const glines = Array.from({ length: nDays / 7 }, (_, i) => `<div class="tl-gl" style="left:${i * 7 * dw}px"></div>`).join('');
  const bars = rows
    .map((r, i) => {
      const y = i * RH;
      if (r.type === 'g') return `<div class="tl-rowbg g" style="top:${y}px"></div>`;
      if (r.type === 'ms') return `<div class="tl-rowbg" style="top:${y}px"></div>` + msLane(ms, X, dw, y);
      if (r.type === 's') {
        const s = r.s,
          t = r.t;
        const sdue = s.due || t.due;
        const sstart = s.start || t.start;
        const s0 = sstart && sstart <= sdue ? sstart : sdue;
        const x = X(s0);
        const w = Math.max(dw, (diffD(parse(sdue), parse(s0)) + 1) * dw);
        const c = g === 'status' || g === 'none' ? pColor(proj(t.project)) : `var(--st-${t.status})`;
        const inside = w > 110;
        return `<div class="tl-rowbg" style="top:${y}px"></div><div class="bar ${s.done ? 'done' : ''}" style="--c:${c};left:${x}px;top:${y + 9}px;width:${w}px;height:18px;opacity:.85" data-bar="${s.id}" data-dw="${dw}" data-a="openSub" data-id="${t.id}" data-sid="${s.id}" data-ctx="sub" title="${esc(s.title)} · ${fmtDate(s0)} → ${fmtDate(sdue)}"><span class="pf" style="width:${s.done ? 100 : 0}%"></span>${inside ? `<span class="trunc">${esc(s.title)}</span>` : ''}</div>${inside ? '' : `<div class="bar-lbl" style="left:${x + w + 8}px;top:${y + 12}px">${esc(s.title)}</div>`}`;
      }
      const t = r.t;
      const pp = proj(t.project);
      const s = t.start && t.start <= t.due ? t.start : t.due;
      const x = X(s);
      const w = Math.max(dw, (diffD(parse(t.due), parse(s)) + 1) * dw);
      const c = g === 'status' || g === 'none' ? pColor(pp) : `var(--st-${t.status})`;
      const inside = w > 110;
      return `<div class="tl-rowbg" style="top:${y}px"></div><div class="bar ${t.status === 'done' ? 'done' : ''}" style="--c:${c};left:${x}px;top:${y + 7}px;width:${w}px" data-bar="${t.id}" data-dw="${dw}" data-a="openTask" data-id="${t.id}" data-ctx="task" title="${esc(t.title)} · ${fmtDate(s)} → ${fmtDate(t.due)}"><span class="pf" style="width:${taskProg(t)}%"></span>${inside ? `${avStack(t.assignees || [], 3, 'sm', false)}<span class="trunc">${esc(t.title)}</span>` : ''}</div>${inside ? '' : `<div class="bar-lbl" style="left:${x + w + 8}px;top:${y + 10}px">${esc(t.title)}</div>`}`;
    })
    .join('');
  // dependency paths
  const deps = ts
    .flatMap(t =>
      t.deps
        .filter(d => rowY[d] != null && rowY[t.id] != null)
        .map(d => {
          const a = task(d);
          const x1 = X(a.due) + dw;
          const y1 = rowY[d];
          const s = t.start && t.start <= t.due ? t.start : t.due;
          const x2 = X(s);
          const y2 = rowY[t.id];
          const mx = Math.max(x1 + 10, x2 - 10);
          return `<path d="M${x1} ${y1} C ${mx} ${y1}, ${Math.min(x1 + 10, x2 - 10)} ${y2}, ${x2 - 1} ${y2}" fill="none" stroke="var(--text-3)" stroke-width="1.3" stroke-dasharray="${x2 < x1 ? '3 3' : ''}"/><path d="M${x2 - 6} ${y2 - 3.5} L${x2 - 1} ${y2} L${x2 - 6} ${y2 + 3.5}" fill="none" stroke="var(--text-3)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`;
        }),
    )
    .join('');
  const left = rows
    .map(r => {
      if (r.type === 'ms')
        return `<div class="tl-row g">${ic('diamond', 12)}${tk('page.project.milestones')}<span class="faint" style="font-weight:500">${ms.length}</span></div>`;
      if (r.type === 'g')
        return `<div class="tl-row g">${r.G.html || ''}${esc(r.G.name)}<span class="faint" style="font-weight:500">${r.G.tasks.length}</span></div>`;
      if (r.type === 's')
        return `<div class="tl-row" style="padding-left:${20 + r.depth * 16}px" data-a="openSub" data-id="${r.t.id}" data-sid="${r.s.id}" data-ctx="sub"><span class="trunc grow" style="${r.s.done ? 'color:var(--text-3)' : 'font-size:12.5px'}">${esc(r.s.title)}</span>${avStack(r.s.assignees || [], 3, 'sm')}</div>`;
      const t = r.t;
      const tLeaves = leafEntries(t.subtasks);
      const tLsd = tLeaves.filter(s => s.done).length;
      return `<div class="tl-row" data-a="openTask" data-id="${t.id}">${t.subtasks.length ? `<span class="ibtn ibtn-xs" data-a="expandRow" data-id="${t.id}" aria-expanded="${!!S.ui.openTasks[t.id]}" aria-label="${S.ui.openTasks[t.id] ? tk('a11y.hideSubtasks') : tk('a11y.showSubtasks')}" style="margin-left:-6px;flex-shrink:0">${ic(S.ui.openTasks[t.id] ? 'chevron-down' : 'chevron-right', 12)}</span>` : ''}${stIcon(t.status, 13)}<span class="trunc grow" style="${t.status === 'done' ? 'color:var(--text-3)' : ''}">${esc(t.title)}</span>${t.subtasks.length ? `<span class="faint num" style="font-size:11px">${tLsd}/${tLeaves.length}</span>` : ''}${avStack(t.assignees || [], 3, 'sm')}</div>`;
    })
    .join('');
  if (!rows.length)
    return empty(
      'chart-gantt',
      tk('page.timeline.emptyTitle'),
      tk('page.timeline.emptyBody'),
      `<button class="btn btn-primary btn-sm" data-a="newTask" ${p ? `data-project="${p.id}"` : ''}>${ic('plus', 14)}${tk('act.newTask')}</button>`,
    );
  const todayX = diffD(TODAY, rs) * dw;
  return `<div class="tl" data-tl-today="${todayX}" data-tl-key="${key}">
    <div class="tl-left"><div class="tl-head">${tk('page.columns.task')}</div><div class="tl-rows" id="tl-rows">${left}<div style="height:40px"></div></div></div>
    <div class="tl-right" id="tl-right" data-keep="tl:${key}:${S.ui.tlZoom}">
      <div class="tl-head" style="width:${W}px"><div class="tl-months">${months.map(m => `<div style="width:${m.n * dw}px"><span>${monthName(m.d, 'long')} ${m.d.getFullYear()}</span></div>`).join('')}</div><div class="tl-days">${days}</div></div>
      <div class="tl-grid" style="width:${W}px;height:${H + 40}px">
        ${weekend}${glines}
        <div class="tl-today" style="left:${todayX + dw / 2}px" title="${tk('common.today')}"></div>
        ${bars}
        <svg class="tl-deps" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${deps}</svg>
      </div>
    </div>
  </div>`;
}
/* Milestone lane: one diamond per date (same-day milestones merge), and each label may only use
   the room up to the next diamond. Long names are cut with an ellipsis, cramped ones show just the
   diamond; the full name and date are always in the hover tooltip. Labels never overlap. */
export function msLane(ms, X, dw, y) {
  const byDate = {};
  ms.forEach(m => (byDate[m.date] ||= []).push(m));
  const pts = Object.entries(byDate)
    .sort(([a], [b]) => (a > b ? 1 : -1))
    .map(([date, list]) => ({ date, list, x: X(date) + dw / 2 }));
  return pts
    .map((pt, i) => {
      const room = (pts[i + 1] ? pts[i + 1].x : Infinity) - pt.x - 24;
      const first = pt.list[0];
      const name = first.name + (pt.list.length > 1 ? ` +${pt.list.length - 1}` : '');
      const tip = pt.list.map(m => m.name + (m.p ? ` (${m.p.name})` : '')).join(' · ') + ' · ' + fmtDate(pt.date);
      const label = room >= 28 ? `<span class="ms-l" style="max-width:${Number.isFinite(room) ? Math.round(room) + 'px' : 'none'}">${esc(name)}</span>` : '';
      return `<div class="ms-w" style="left:${pt.x - 6}px;top:${y + 9}px" data-tip="${esc(tip)}" tabindex="0" aria-label="${tk('a11y.milestoneLabel', { name: esc(tip) })}"><span class="ms" style="${first.p ? `background:${pColor(first.p)}` : ''}"></span>${label}</div>`;
    })
    .join('');
}
export function tlAfter() {
  const r = $('#tl-right'),
    l = $('#tl-rows');
  if (!r || !l) return;
  r.onscroll = () => {
    l.scrollTop = r.scrollTop;
  };
  l.scrollTop = r.scrollTop;
  const k = $('.tl').dataset.tlKey + S.ui.tlZoom;
  S.ui.tlInit = S.ui.tlInit || {};
  if (!S.ui.tlInit[k]) {
    S.ui.tlInit[k] = 1;
    r.scrollLeft = Math.max(0, +$('.tl').dataset.tlToday - 160);
  }
}
export function pageWsTimeline() {
  const key = 'tl';
  const v = viewOf(key);
  if (!S.ui._tlWsInit) {
    S.ui._tlWsInit = 1;
    S.ui.tlGroup = 'project';
  }
  return `<div class="page flush"><div class="ph"><div><h1>${tk('page.timeline.title')}</h1><p>${tk('page.timeline.subtitle')}</p></div></div>
  ${viewToolbar(key, { group: false, extra: tlControls(key) })}${timelineHtml(applyView(allTasks(), v), key, null)}</div>`;
}
