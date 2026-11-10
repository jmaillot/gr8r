/* =====================================================================
   EXPORT MODEL — Phase 54 (54-01, extended by 54-03)
   =====================================================================
   The one DOM-free, dependency-free export model shared by every writer
   (CSV here; the xlsx and MSPDI writers in plans 02–05). It implements
   R2 (scope selection), R3 (the five include toggles), R4/R5/R7 (the
   workbook surface: summary, charts, board lanes, members, milestones),
   R10 (it is fed the docForClient-shaped redacted document only),
   R11 (every exporter-authored string resolves through the injected
   translator; user text is never translated) and R12 (descriptions are
   inert plain text) plus D-54-8..D-54-16 (opt-in content shape, KPI
   contract, chart null rule, board lanes, milestone states).

   NO IMPORTS AT ALL: src/core/store.js and src/core/utils.js touch the DOM
   at module scope and src/core/constants.js holds lazy client-translator
   getters, so this module must stay importable by the browser AND Node.
   Everything contextual arrives through deps = { translate, labelName, now }.
   ===================================================================== */

/* R3 defaults: descriptions, comments and subtasks are opt-in; completed
   tasks are in and archived tasks are out (D-54-8..D-54-11). */
export const DEFAULT_OPTIONS = Object.freeze({
  descriptions: false,
  comments: false,
  subtasks: false,
  completed: true,
  archived: false,
});

/* Machine id order, pinned against src/core/constants.js by a drift test.
   Kept here (not imported) because constants.js imports the client i18n. */
export const STATUS_IDS = ['backlog', 'todo', 'progress', 'review', 'done'];
export const PRIORITY_IDS = ['urgent', 'high', 'medium', 'low', 'none'];

/* Column key literals live here so the i18n dead-key gate sees them. The
   label text itself always comes from the injected translator. */
const BASE_COLUMNS = ['key', 'title', 'status', 'priority', 'assignee', 'start', 'due', 'progress', 'labels', 'estimate'];
const COMMENT_COLUMNS = ['comments', 'latestComment', 'thread'];

/* The default progress curve for a status (mirrors taskProg in
   src/core/store.js without importing the DOM-touching module). */
const STATUS_PROGRESS = { backlog: 0, todo: 5, progress: 45, review: 80, done: 100 };

export function taskProgress(t) {
  if (t.status === 'done') return 100;
  if (Array.isArray(t.subtasks) && t.subtasks.length) {
    return Math.round((t.subtasks.filter(s => s && s.done).length / t.subtasks.length) * 100);
  }
  return STATUS_PROGRESS[t.status] || 0;
}

/* Descriptions are stored as HTML-ish text; export output is inert plain
   text (R12, D-54-11): every angle-bracket tag is removed, runs of
   whitespace collapse to one space and the result is trimmed. */
export function plainText(value) {
  return String(value ?? '')
    /* script blocks are removed WITH their content — the payload text
       must never reach the export surface (T-54-03, R12). */
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Local YYYY-MM-DD from a Date — never toISOString (it is UTC). */
function localISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/* Only the five known option keys are read; unknown keys are ignored and
   every boolean is coerced with === true. The frozen copy is what every
   writer reads for its inclusion decisions (R3, D-54-8..D-54-11). */
function normalizeOptions(options) {
  const o = {};
  /* Only the five known keys are read (plan hardening): unknown keys are
     ignored, explicit true/false win, otherwise the default stands. */
  for (const k of Object.keys(DEFAULT_OPTIONS)) {
    o[k] = options?.[k] === true ? true : options?.[k] === false ? false : DEFAULT_OPTIONS[k];
  }
  return Object.freeze(o);
}

/**
 * Build the export model for one project.
 * @param doc       the docForClient-shaped DATA object (doc.projects / tasks /
 *                  comments / members) — the server passes redacted.data,
 *                  the client passes D()
 * @param projectId the project id to export
 * @param opts      { scope: 'view' | 'all', ids?: string[], options? }
 * @param deps      { translate(key, vars), labelName(id), now: Date }
 * @returns the model, or null when the project is absent (caller maps to 404)
 */
export function buildExportModel(doc, projectId, opts = {}, deps = {}) {
  const translate = deps.translate || (k => k);
  const labelName = deps.labelName || (id => id);
  const now = deps.now instanceof Date ? deps.now : new Date();
  const options = normalizeOptions(opts.options);

  const project = (Array.isArray(doc?.projects) ? doc.projects : []).find(p => p && p.id === projectId);
  if (!project) return null;

  const members = Array.isArray(doc?.members) ? doc.members : [];
  const memberName = new Map(members.filter(m => m && m.id).map(m => [m.id, m.name || m.id]));
  const comments = Array.isArray(doc?.comments) ? doc.comments : [];

  /* ---- selection (R2, R3) — a foreign id can never pass the scope filter ---- */
  const inProject = (Array.isArray(doc?.tasks) ? doc.tasks : []).filter(t => t && t.project === projectId);
  let top = inProject.filter(t => options.archived || !t.archived);
  if (!options.completed) top = top.filter(t => t.status !== 'done');

  let ordered;
  if (opts.scope === 'view' && Array.isArray(opts.ids)) {
    const rank = new Map(opts.ids.map((id, i) => [id, i]));
    ordered = top.filter(t => rank.has(t.id)).sort((a, b) => rank.get(a.id) - rank.get(b.id));
  } else {
    ordered = [...top].sort((a, b) => ((a.order ?? 0) - (b.order ?? 0)) || String(a.key || a.id).localeCompare(String(b.key || b.id)));
  }

  /* ---- columns ---- */
  const columns = [...BASE_COLUMNS];
  if (options.descriptions) columns.push('description');
  if (options.comments) columns.push(...COMMENT_COLUMNS);
  const col = name => ({ key: name, label: translate('export.col.' + name) });

  const statusLabel = id => translate('task.status.' + (STATUS_IDS.includes(id) ? id : 'backlog'));
  const priorityLabel = id => translate('task.priority.' + (PRIORITY_IDS.includes(id) ? id : 'none'));

  /* ---- rows ---- */
  const rows = [];
  for (const t of ordered) {
    const name = t.assignee ? memberName.get(t.assignee) || t.assignee : null;
    const base = {
      key: t.key || '',
      title: t.title || '',
      status: statusLabel(t.status),
      priority: priorityLabel(t.priority),
      assignee: name || translate('export.unassigned'),
      assigneeName: name || translate('export.unassigned'),
      assigneeId: t.assignee || '',
      start: t.start || '',
      due: t.due || '',
      progress: taskProgress(t),
      labels: (Array.isArray(t.labels) ? t.labels : []).map(id => labelName(id)).join(', '),
      estimate: t.estimate || '',
      /* machine fields the Gantt and MSPDI writers need — they never
         re-read the document */
      id: t.id,
      statusId: t.status,
      priorityId: t.priority,
      deps: Array.isArray(t.deps) ? [...t.deps] : [],
      archived: !!t.archived,
      order: t.order ?? 0,
    };
    if (options.descriptions) base.description = plainText(t.desc);
    if (options.comments) {
      const list = comments.filter(c => c && c.task === t.id).sort((a, b) => (a.at || 0) - (b.at || 0));
      base.comments = list.length;
      const latest = list[list.length - 1];
      base.latestComment = latest ? plainText(latest.text) : '';
      /* thread lines run newest-first (D-54-9), matching latestComment. */
      base.thread = [...list].reverse()
        .map(c => `${c.by ? memberName.get(c.by) || c.by : ''}, ${c.at ? localISO(new Date(c.at)) : ''}, ${plainText(c.text)}`)
        .join('\n');
    }
    rows.push(base);

    /* D-54-9: child rows ride under their parent, keyed PARENT.n; D-54-10:
       they are excluded from kpis and never outlive a filtered-out parent
       (they are built from the same filtered `ordered` list). */
    if (options.subtasks && Array.isArray(t.subtasks)) {
      t.subtasks.forEach((s, i) => {
        const done = !!s?.done;
        rows.push({
          key: (t.key || '') + '.' + (i + 1),
          title: s?.title || '',
          status: translate('task.status.' + (done ? 'done' : 'todo')),
          priority: translate('task.priority.none'),
          assignee: translate('export.unassigned'),
          assigneeName: translate('export.unassigned'),
          assigneeId: '',
          start: '',
          due: '',
          progress: done ? 100 : 0,
          labels: '',
          estimate: '',
          description: options.descriptions ? plainText(s?.title) : undefined,
          comments: options.comments ? 0 : undefined,
          latestComment: options.comments ? '' : undefined,
          thread: options.comments ? '' : undefined,
          id: t.id,
          statusId: done ? 'done' : 'todo',
          priorityId: 'none',
          deps: [],
          archived: !!t.archived,
          parent: t.id,
        });
      });
    }
  }

  const topRows = rows.filter(r => !r.parent);
  const doneCount = topRows.filter(r => r.statusId === 'done').length;
  const today = localISO(now);
  const overdue = topRows.filter(r => r.due && r.statusId !== 'done' && r.due < today).length;
  const progress = topRows.length ? Math.round((doneCount / topRows.length) * 100) : 0;

  /* =====================================================================
     54-03: summary meta, KPI labels, chart data, board, members,
     milestones and localized headers. Everything below derives from
     topRows (D-54-10: child rows never inflate a count) and every
     exporter-authored string goes through translate (R11, D-54-12,
     D-54-14). Key literals are written HERE — src/export/model.js is
     scanned by the i18n dead-key gate; export/ is not.
     ===================================================================== */

  /* Deterministic name comparator — plain string comparison, never
     localeCompare (host-dependent collations). */
  const plainCmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

  const proj = {
    id: project.id,
    key: project.key || '',
    name: project.name || '',
    statusLabel: project.status ? translate('project.status.' + project.status) : '',
    leadName: project.lead ? memberName.get(project.lead) || project.lead : '',
    start: project.start || '',
    due: project.due || '',
    progress,
  };

  /* ---- SUMMARY: six meta rows (name, lead, status, start, due,
     progress) and four KPI counts (D-54-15). kind tells the writer how
     to render the value: text / date (raw YYYY-MM-DD) / percent
     (raw 0-100 number, written at that scale, never divided by 100). */
  const summary = {
    meta: [
      { key: 'name', label: translate('export.meta.name'), value: proj.name, kind: 'text' },
      { key: 'lead', label: translate('export.meta.lead'), value: proj.leadName, kind: 'text' },
      { key: 'status', label: translate('export.meta.status'), value: proj.statusLabel, kind: 'text' },
      { key: 'start', label: translate('export.meta.start'), value: proj.start, kind: 'date' },
      { key: 'due', label: translate('export.meta.due'), value: proj.due, kind: 'date' },
      { key: 'progress', label: translate('export.meta.progress'), value: proj.progress, kind: 'percent' },
    ],
    kpis: [
      { key: 'total', label: translate('export.kpi.total'), value: topRows.length },
      { key: 'open', label: translate('export.kpi.open'), value: topRows.length - doneCount },
      { key: 'done', label: translate('export.kpi.done'), value: doneCount },
      { key: 'overdue', label: translate('export.kpi.overdue'), value: overdue },
    ],
  };

  /* ---- CHARTS (R5, D-54-10): counts tally the exported top-level rows
     only. title is the ONLY source of the chart title and of the source
     block label the writer writes — export/ holds no display literal
     (D-54-12). A block whose every count is zero becomes null: the
     writer then omits the chart and its source block entirely (R5
     boundary rule — no empty axes). */
  const tallyStatus = () => {
    const counts = new Map(STATUS_IDS.map(id => [id, 0]));
    for (const r of topRows) counts.set(r.statusId, (counts.get(r.statusId) || 0) + 1);
    return counts;
  };
  const tallyPriority = () => {
    const counts = new Map(PRIORITY_IDS.map(id => [id, 0]));
    for (const r of topRows) counts.set(r.priorityId, (counts.get(r.priorityId) || 0) + 1);
    return counts;
  };
  const statusCounts = tallyStatus();
  const priorityCounts = tallyPriority();

  /* open per member over exported top-level rows: open = not done. */
  const openByMember = new Map();
  for (const r of topRows) {
    const k = r.assigneeId || null;
    openByMember.set(k, (openByMember.get(k) || 0) + (r.statusId === 'done' ? 0 : 1));
  }

  const assigneeEntries = [...openByMember.entries()].map(([id, open]) => ({
    id,
    name: id ? memberName.get(id) || id : translate('export.unassigned'),
    open,
  }));
  /* open descending, then name ascending (plain comparison). */
  assigneeEntries.sort((a, b) => (b.open - a.open) || plainCmp(a.name, b.name));

  const charts = {
    status: [...statusCounts.values()].some(c => c > 0)
      ? {
          title: translate('export.chart.status'),
          labels: STATUS_IDS.map(id => translate('task.status.' + id)),
          counts: STATUS_IDS.map(id => statusCounts.get(id) || 0),
        }
      : null,
    priority: [...priorityCounts.values()].some(c => c > 0)
      ? {
          title: translate('export.chart.priority'),
          labels: PRIORITY_IDS.map(id => translate('task.priority.' + id)),
          counts: PRIORITY_IDS.map(id => priorityCounts.get(id) || 0),
        }
      : null,
    assignees: assigneeEntries.some(e => e.open > 0)
      ? {
          title: translate('export.chart.assignees'),
          labels: assigneeEntries.map(e => e.name),
          counts: assigneeEntries.map(e => e.open),
        }
      : null,
  };

  /* ---- BOARD (R7): five lanes in the locked STATUS_IDS order. An empty
     lane still exists with count 0. Cards sort by order then key. */
  const boardLanes = STATUS_IDS.map(id => {
    const cards = topRows
      .filter(r => r.statusId === id)
      .sort((a, b) => ((a.order ?? 0) - (b.order ?? 0)) || plainCmp(String(a.key), String(b.key)))
      .map(r => ({
        key: r.key,
        title: r.title,
        assigneeName: r.assigneeName,
        priorityLabel: r.priority,
        due: r.due,
        progress: r.progress,
      }));
    return {
      id,
      label: translate('task.status.' + id),
      count: cards.length,
      cards,
    };
  });
  const board = { lanes: boardLanes };

  /* ---- MEMBERS (D-54-10): one row per assignee appearing in the
     exported set plus Unassigned; counts over top-level rows only. */
  const memberEntries = [];
  for (const r of topRows) {
    const id = r.assigneeId || null;
    let e = memberEntries.find(x => x.id === id);
    if (!e) {
      e = { id, name: id ? memberName.get(id) || id : translate('export.unassigned'), open: 0, done: 0 };
      memberEntries.push(e);
    }
    if (r.statusId === 'done') e.done += 1;
    else e.open += 1;
  }
  for (const e of memberEntries) e.total = e.open + e.done;
  memberEntries.sort((a, b) => (b.open - a.open) || plainCmp(a.name, b.name));

  /* ---- MILESTONES (R11): date-sorted; done when the date is strictly
     before the EXPORT date (the project-overview predicate
     diffD(parse(date), TODAY) < 0 on the export date, D-54-13) — a
     milestone due on the export date still reads upcoming. */
  const milestones = (Array.isArray(project.milestones) ? project.milestones : [])
    .filter(m => m && m.date)
    .sort((a, b) => plainCmp(String(a.date), String(b.date)) || plainCmp(String(a.name ?? a.title ?? ''), String(b.name ?? b.title ?? '')))
    .map(m => ({
      name: m.name || m.title || '',
      date: m.date,
      state: m.date < today ? translate('export.milestone.done') : translate('export.milestone.upcoming'),
    }));

  /* ---- localized headers for the Board, Members and Milestones sheets. */
  const hcol = name => translate('export.col.' + name);
  const headers = {
    board: ['lane', 'count', 'key', 'title', 'assignee', 'priority', 'due', 'progress'].map(hcol),
    members: ['member', 'open', 'done', 'total'].map(hcol),
    milestones: ['name', 'date', 'state'].map(hcol),
  };

  return {
    project: proj,
    rows,
    topRows,
    columns: columns.map(col),
    /* D-54-16: overdue = due strictly before the EXPORT date and not done. */
    kpis: { total: topRows.length, open: topRows.length - doneCount, done: doneCount, overdue },
    exportDate: now,
    exportDateISO: today,
    options,
    summary,
    charts,
    board,
    members: memberEntries,
    milestones,
    headers,
    statusIds: [...STATUS_IDS],
    priorityIds: [...PRIORITY_IDS],
  };
}
