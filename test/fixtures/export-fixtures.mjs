/* =====================================================================
   EXPORT FIXTURES — Phase 54 (54-01), plain data, no app imports.
   Factory module: every call returns FRESH objects (no shared mutable
   state). Doc shape mirrors the docForClient DATA object (projects /
   tasks / comments / members) — exactly what buildExportModel consumes.
   ===================================================================== */

export function makeDoc() {
  const members = [
    { id: 'm_lead', userId: 'u_lead', name: 'Léa Lead', role: 'Member', email: 'lea@ex.local' },
    { id: 'm_plain', userId: 'u_plain', name: 'Pat Plain', role: 'Member', email: 'pat@ex.local' },
    { id: 'm_guest', userId: 'u_guest', name: 'Gus Guest', role: 'Guest', email: 'gus@ex.local' },
    { id: 'm_idle', userId: 'u_idle', name: 'Ida Idle', role: 'Member', email: 'ida@ex.local' },
  ];
  const projects = [
    {
      id: 'p_alpha',
      key: 'alpha',
      name: 'Alpha Project',
      status: 'active',
      lead: 'm_lead',
      members: ['m_lead', 'm_plain', 'm_guest'],
      teams: [],
      start: '2026-01-05',
      due: '2026-03-31',
      milestones: [{ id: 'ms1', title: 'Kickoff', date: '2026-01-06' }],
      perms: {},
    },
    /* The foreign project: its task id must never leak into a p_alpha export. */
    {
      id: 'p_beta',
      key: 'beta',
      name: 'Beta Foreign',
      status: 'planning',
      lead: 'm_idle',
      members: ['m_idle'],
      teams: [],
      perms: {},
    },
  ];
  const tasks = [
    /* The six core statuses. Array order differs from `order` on purpose:
       scope all sorts by manual order, and the tests pin that. */
    { id: 't_a1', project: 'p_alpha', key: 'ALPHA-4', title: 'Backlog idea', status: 'backlog', priority: 'low', assignee: 'm_plain', labels: ['design'], estimate: '2d', subtasks: [], deps: [], order: 30 },
    { id: 't_a2', project: 'p_alpha', key: 'ALPHA-1', title: 'Todo task', status: 'todo', priority: 'urgent', assignee: 'm_lead', labels: [], estimate: '4h', subtasks: [], deps: [], order: 10 },
    { id: 't_a3', project: 'p_alpha', key: 'ALPHA-2', title: 'In progress task', status: 'progress', priority: 'high', assignee: 'm_plain', labels: ['backend'], estimate: '1d', start: '2026-01-10', due: '2026-02-01', subtasks: [], deps: ['t_a2'], order: 20 },
    { id: 't_a4', project: 'p_alpha', key: 'ALPHA-5', title: 'Review task', status: 'review', priority: 'medium', assignee: 'm_lead', labels: [], estimate: '', subtasks: [], deps: [], order: 40 },
    { id: 't_a5', project: 'p_alpha', key: 'ALPHA-3', title: 'Done task', status: 'done', priority: 'medium', assignee: 'm_plain', labels: [], estimate: '3h', subtasks: [], deps: [], order: 50 },
    { id: 't_a6', project: 'p_alpha', key: 'ALPHA-6', title: 'Second done task', status: 'done', priority: 'none', assignee: '', labels: [], estimate: '', subtasks: [], deps: [], order: 60 },
    /* Archived — out under the default option set. */
    { id: 't_a7', project: 'p_alpha', key: 'ALPHA-7', title: 'Archived task', status: 'todo', priority: 'low', assignee: 'm_idle', labels: [], estimate: '', subtasks: [], deps: [], order: 70, archived: true },
    /* Overdue — due strictly before the injected export date, not done. */
    { id: 't_a8', project: 'p_alpha', key: 'ALPHA-8', title: 'Overdue task', status: 'todo', priority: 'high', assignee: 'm_plain', labels: [], estimate: '', due: '2026-01-01', subtasks: [], deps: [], order: 80 },
    /* Two subtasks — child rows keyed ALPHA-9.1 / ALPHA-9.2 when opted in. */
    {
      id: 't_a9',
      project: 'p_alpha',
      key: 'ALPHA-9',
      title: 'Subtasked task',
      status: 'progress',
      priority: 'medium',
      assignee: 'm_lead',
      labels: [],
      estimate: '',
      subtasks: [
        { title: 'Child one', done: true },
        { title: 'Child two', done: false },
      ],
      deps: [],
      order: 90,
    },
    /* Injection and escaping probes (T-54-03, R12). */
    { id: 't_a10', project: 'p_alpha', key: 'ALPHA-10', title: '=1+1', status: 'todo', priority: 'none', assignee: '', labels: [], estimate: '', subtasks: [], deps: [], order: 100 },
    { id: 't_a11', project: 'p_alpha', key: 'ALPHA-11', title: 'A & <B>', status: 'todo', priority: 'none', assignee: '', labels: [], estimate: '', subtasks: [], deps: [], order: 110 },
    {
      id: 't_a12',
      project: 'p_alpha',
      key: 'ALPHA-12',
      title: 'Données — naïve café 日本語',
      status: 'todo',
      priority: 'none',
      assignee: '',
      labels: [],
      estimate: '',
      desc: 'Bonjour <script>alert(1)</script> & naïve café 日本語',
      subtasks: [],
      deps: [],
      order: 120,
    },
    /* The foreign task — must never be selectable into a p_alpha export. */
    { id: 't_b1', project: 'p_beta', key: 'BETA-1', title: 'Foreign task', status: 'todo', priority: 'low', assignee: 'm_idle', labels: [], estimate: '', subtasks: [], deps: [], order: 10 },
  ];
  const comments = [
    { id: 'c_a5_old', task: 't_a5', by: 'm_plain', at: 1_700_000_000_000, text: 'First note', re: {} },
    { id: 'c_a5_new', task: 't_a5', by: 'm_lead', at: 1_700_000_050_000, text: 'Second, latest note', re: {} },
    { id: 'c_a3', task: 't_a3', by: 'm_guest', at: 1_700_000_010_000, text: 'Guest question', re: {} },
    /* A comment on the foreign project's task — never exported for p_alpha. */
    { id: 'c_b1', task: 't_b1', by: 'm_idle', at: 1_700_000_000_000, text: 'Foreign comment', re: {} },
  ];
  return { projects, tasks, comments, members, projOrder: ['p_alpha', 'p_beta'] };
}

/* A project with zero tasks — the empty-scope cell (R2 boundary/empty). */
export function makeEmptyProjectDoc() {
  return {
    projects: [{ id: 'p_empty', key: 'empty', name: 'Empty Project', status: 'planning', lead: 'm_lead', members: ['m_lead'], teams: [], perms: {} }],
    tasks: [],
    comments: [],
    members: [{ id: 'm_lead', userId: 'u_lead', name: 'Léa Lead', role: 'Member', email: 'lea@ex.local' }],
    projOrder: ['p_empty'],
  };
}

/* Every task archived: the model exports zero rows under the default option
   set while the DOCUMENT holds tasks — a writer that charts the document
   instead of the model fails this fixture (plans 02–05 consume it). */
export function makeZeroChartDoc() {
  return {
    projects: [{ id: 'p_zero', key: 'zero', name: 'Zero Chart Project', status: 'active', lead: 'm_lead', members: ['m_lead'], teams: [], perms: {} }],
    tasks: [
      { id: 't_z1', project: 'p_zero', key: 'ZERO-1', title: 'Archived one', status: 'done', priority: 'low', assignee: 'm_lead', labels: [], estimate: '', subtasks: [], deps: [], order: 10, archived: true },
      { id: 't_z2', project: 'p_zero', key: 'ZERO-2', title: 'Archived two', status: 'todo', priority: 'none', assignee: '', labels: [], estimate: '', subtasks: [], deps: [], order: 20, archived: true },
    ],
    comments: [],
    members: [{ id: 'm_lead', userId: 'u_lead', name: 'Léa Lead', role: 'Member', email: 'lea@ex.local' }],
    projOrder: ['p_zero'],
  };
}

/* =====================================================================
   54-03 fixtures: empty lane, chart tallies, milestone dates.
   ===================================================================== */

/* Every task is done or backlog, so the middle lanes (todo, progress,
   review) are empty — the Board must still render each of them with
   count 0 (R7 empty edge). */
export function makeEmptyLaneDoc() {
  const members = [
    { id: 'm_lead', userId: 'u_lead', name: 'Léa Lead', role: 'Member', email: 'lea@ex.local' },
    { id: 'm_plain', userId: 'u_plain', name: 'Pat Plain', role: 'Member', email: 'pat@ex.local' },
  ];
  return {
    projects: [{ id: 'p_lane', key: 'lane', name: 'Lane Project', status: 'active', lead: 'm_lead', members: ['m_lead', 'm_plain'], teams: [], perms: {} }],
    tasks: [
      { id: 't_l1', project: 'p_lane', key: 'LANE-2', title: 'Backlog one', status: 'backlog', priority: 'low', assignee: 'm_plain', labels: [], estimate: '', subtasks: [], deps: [], order: 20 },
      { id: 't_l2', project: 'p_lane', key: 'LANE-1', title: 'Backlog two', status: 'backlog', priority: 'medium', assignee: 'm_lead', labels: [], estimate: '', subtasks: [], deps: [], order: 10 },
      { id: 't_l3', project: 'p_lane', key: 'LANE-3', title: 'Done one', status: 'done', priority: 'high', assignee: 'm_lead', labels: [], estimate: '', subtasks: [], deps: [], order: 30 },
      { id: 't_l4', project: 'p_lane', key: 'LANE-4', title: 'Done two', status: 'done', priority: 'none', assignee: '', labels: [], estimate: '', subtasks: [], deps: [], order: 40 },
    ],
    comments: [],
    members,
    projOrder: ['p_lane'],
  };
}

/* Distinct counts in every status, every priority and three assignees
   plus one unassigned task — the chart-tally and Board-card fixture.
   Statuses: backlog 2, todo 3, progress 2, review 1, done 2.
   Priorities: urgent 2, high 2, medium 3, low 2, none 1.
   Assignees (open counts over top rows): Pat Plain 4, Gus Guest 2,
   Léa Lead 2, unassigned 0 (its only task is done). */
export function makeChartDoc() {
  const members = [
    { id: 'm_lead', userId: 'u_lead', name: 'Léa Lead', role: 'Member', email: 'lea@ex.local' },
    { id: 'm_plain', userId: 'u_plain', name: 'Pat Plain', role: 'Member', email: 'pat@ex.local' },
    { id: 'm_guest', userId: 'u_guest', name: 'Gus Guest', role: 'Guest', email: 'gus@ex.local' },
  ];
  const T = (id, key, status, priority, assignee, order) => ({
    id, project: 'p_chart', key, title: key + ' title', status, priority,
    assignee, labels: [], estimate: '', subtasks: [], deps: [], order,
  });
  return {
    projects: [{ id: 'p_chart', key: 'chart', name: 'Chart Project', status: 'active', lead: 'm_lead', members: ['m_lead', 'm_plain', 'm_guest'], teams: [], perms: {} }],
    tasks: [
      T('t_c1', 'CH-1', 'backlog', 'urgent', 'm_plain', 1),
      T('t_c2', 'CH-2', 'backlog', 'high', 'm_lead', 2),
      T('t_c3', 'CH-3', 'todo', 'urgent', 'm_plain', 3),
      T('t_c4', 'CH-4', 'todo', 'medium', 'm_lead', 4),
      T('t_c5', 'CH-5', 'todo', 'medium', 'm_guest', 5),
      T('t_c6', 'CH-6', 'progress', 'high', 'm_plain', 6),
      T('t_c7', 'CH-7', 'progress', 'low', 'm_guest', 7),
      T('t_c8', 'CH-8', 'review', 'medium', 'm_plain', 8),
      T('t_c9', 'CH-9', 'done', 'low', 'm_lead', 9),
      T('t_c10', 'CH-10', 'done', 'none', '', 10),
    ],
    comments: [],
    members,
    projOrder: ['p_chart'],
  };
}

/* Milestones out of date order: one dated before the injected export
   date, one dated exactly ON it (must read upcoming) and one after. */
export function makeMilestoneDoc() {
  const members = [{ id: 'm_lead', userId: 'u_lead', name: 'Léa Lead', role: 'Member', email: 'lea@ex.local' }];
  return {
    projects: [{
      id: 'p_ms', key: 'ms', name: 'Milestone Project', status: 'active', lead: 'm_lead',
      members: ['m_lead'], teams: [], perms: {},
      milestones: [
        { id: 'ms_after', name: 'After milestone', date: '2026-03-01' },
        { id: 'ms_on', name: 'On-export-date milestone', date: '2026-02-01' },
        { id: 'ms_before', name: 'Before milestone', date: '2026-01-05' },
        { id: 'ms_nodate', name: 'Undated milestone' },
      ],
    }],
    tasks: [
      { id: 't_m1', project: 'p_ms', key: 'MS-1', title: 'Milestone task', status: 'todo', priority: 'medium', assignee: 'm_lead', labels: [], estimate: '', subtasks: [], deps: [], order: 1 },
    ],
    comments: [],
    members,
    projOrder: ['p_ms'],
  };
}

/* =====================================================================
   54-04 fixtures: Gantt geometry docs. All dates are real weekdays
   computed from the fixed Monday 2026-03-02 so the padded-span
   assertions are exact. The export date is injected per test through
   buildExportModel deps.now.
   ===================================================================== */

/* ISO date arithmetic on the fixed base — UTC only, no host timezone. */
function isoAdd(baseISO, days) {
  const [y, m, d] = baseISO.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86400000).toISOString().slice(0, 10);
}

const GANTT_MEMBERS = [{ id: 'm_lead', userId: 'u_lead', name: 'Léa Lead', role: 'Member', email: 'lea@ex.local' }];

function ganttProject(id, key, name, start, due, milestones) {
  return { id, key, name, status: 'active', lead: 'm_lead', members: ['m_lead'], teams: [], perms: {}, start, due, milestones: milestones || [] };
}

function ganttTask(id, key, title, order, dates, deps, extra) {
  return {
    id, project: 'p_g', key, title, status: 'todo', priority: 'medium',
    assignee: 'm_lead', labels: [], estimate: '', subtasks: [],
    start: dates?.start || '', due: dates?.due || '',
    deps: deps || [], order, ...extra,
  };
}

/* One-month project, daily axis: three dated tasks including a
   start-equals-due task, the R6 equal-day dependency pair (t_g1's due
   is t_g2's start — wait, reversed: t_g1 DEPENDS on t_g2 and its own
   start equals t_g2's due), one normal dependency (predecessor
   finishes strictly before the successor starts), one dependency on
   an archived task (dropped — T-54-15) and one milestone. */
export function makeDailyGanttDoc() {
  return {
    projects: [ganttProject('p_g', 'g', 'Gantt Daily', '2026-03-02', '2026-03-31', [{ id: 'ms_g', name: 'Launch', date: '2026-03-15' }])],
    tasks: [
      ganttTask('t_g0', 'G-0', 'Archived dated task', 1, { due: '2026-03-06' }, [], { archived: true }),
      ganttTask('t_g3', 'G-3', 'Early task', 2, { start: '2026-03-02', due: '2026-03-04' }, ['t_g0']),
      ganttTask('t_g2', 'G-2', 'Mid task', 3, { start: '2026-03-10', due: '2026-03-20' }, ['t_g3']),
      ganttTask('t_g1', 'G-1', 'One day task', 4, { start: '2026-03-20', due: '2026-03-20' }, ['t_g2']),
    ],
    comments: [],
    members: GANTT_MEMBERS,
    projOrder: ['p_g'],
  };
}

/* A project spanning more than 91 padded days — the weekly axis —
   including a task entirely inside one week (one-column bar) and a
   dependency between weekly bars. */
export function makeWeeklyGanttDoc() {
  return {
    projects: [ganttProject('p_g', 'g', 'Gantt Weekly', '2026-01-05', '2026-06-30', [])],
    tasks: [
      ganttTask('t_w1', 'W-1', 'Span task', 1, { start: '2026-01-05', due: '2026-03-15' }, []),
      ganttTask('t_w2', 'W-2', 'Inside one week', 2, { start: '2026-04-06', due: '2026-04-08' }, ['t_w1']),
      ganttTask('t_w3', 'W-3', 'Late task', 3, { start: '2026-05-01', due: '2026-06-20' }, []),
    ],
    comments: [],
    members: GANTT_MEMBERS,
    projOrder: ['p_g'],
  };
}

/* The padded-span boundary pair, computed from the fixed Monday
   2026-03-02. padToWeek rounds both ends out to whole weeks, so the
   padded spans are exact multiples of 7: the daily doc pads to 35
   days (12 weeks would be 84 — here one month) and the weekly doc
   pads to EXACTLY 91 days (13 weeks), the first span that crosses
   DAILY_LIMIT_DAYS. The 90/91 mode switch itself is asserted on
   makeAxis with synthetic padded spans of exactly 90 and 91 days in
   test/export-gantt.test.mjs. */
export function makeBoundaryDocs() {
  const daily = {
    projects: [ganttProject('p_g', 'g', 'Gantt Daily Boundary', '2026-03-02', '2026-03-31', [])],
    tasks: [ganttTask('t_bd1', 'BD-1', 'Boundary task one', 1, { start: '2026-03-03', due: '2026-03-10' }, [])],
    comments: [],
    members: GANTT_MEMBERS,
    projOrder: ['p_g'],
  };
  const weekly = {
    projects: [ganttProject('p_g', 'g', 'Gantt Weekly Boundary', '2026-03-02', '2026-05-29', [])],
    tasks: [ganttTask('t_bd2', 'BD-2', 'Boundary task two', 1, { start: '2026-03-03', due: '2026-05-26' }, [])],
    comments: [],
    members: GANTT_MEMBERS,
    projOrder: ['p_g'],
  };
  return { daily, weekly };
}

/* No task carries a due — zero dated rows: empty bars, milestones and
   links, truncated false, and an axis that still spans the project
   dates and the export date. */
export function makeZeroDatedDoc() {
  return {
    projects: [ganttProject('p_g', 'g', 'Gantt Zero Dated', '2026-03-02', '2026-03-31', [])],
    tasks: [
      ganttTask('t_z1', 'Z-1', 'Undated one', 1, {}, []),
      ganttTask('t_z2', 'Z-2', 'Undated two', 2, {}, []),
    ],
    comments: [],
    members: GANTT_MEMBERS,
    projOrder: ['p_g'],
  };
}

/* A shape-budget fixture: barCount dated one-day tasks walking forward
   one day each, with linkCount dependencies between consecutive tasks
   (shapes = bars + links). Default links every consecutive pair. */
export function makeCapDoc(barCount, linkCount = barCount - 1) {
  const tasks = [];
  for (let i = 0; i < barCount; i++) {
    const deps = i > 0 && i <= linkCount ? ['t_k' + (i - 1)] : [];
    tasks.push(ganttTask('t_k' + i, 'K-' + i, 'Cap task ' + i, i + 1, { start: isoAdd('2026-03-02', i), due: isoAdd('2026-03-02', i) }, deps));
  }
  return {
    projects: [ganttProject('p_g', 'g', 'Gantt Cap', '2026-03-02', isoAdd('2026-03-02', barCount), [])],
    tasks,
    comments: [],
    members: GANTT_MEMBERS,
    projOrder: ['p_g'],
  };
}

/* Every date lies after the export date — the padded range excludes
   today, so axis.today is null and the writer writes no Today fill. */
export function makeFutureDoc() {
  return {
    projects: [ganttProject('p_g', 'g', 'Gantt Future', '2026-06-01', '2026-06-30', [])],
    tasks: [
      ganttTask('t_f1', 'F-1', 'Future one', 1, { start: '2026-06-02', due: '2026-06-10' }, []),
      ganttTask('t_f2', 'F-2', 'Future two', 2, { start: '2026-06-11', due: '2026-06-20' }, []),
    ],
    comments: [],
    members: GANTT_MEMBERS,
    projOrder: ['p_g'],
  };
}

/* =====================================================================
   54-04 Task 3 fixtures: the responsiveness benchmark and the exact
   shape-cap fixture.
   ===================================================================== */

/* 500 top-level dated one-day tasks walking forward one day each with
   400 dependencies between consecutive tasks — the R13 responsiveness
   fixture (900 shapes: the Timeline degrades to the table + note). */
export function makeBenchmarkDoc() {
  const tasks = [];
  for (let i = 0; i < 500; i++) {
    tasks.push(ganttTask('t_b' + i, 'B-' + i, 'Benchmark task ' + i, i + 1,
      { start: isoAdd('2026-03-02', i), due: isoAdd('2026-03-02', i) },
      i > 0 ? ['t_b' + (i - 1)] : []));
  }
  return {
    projects: [ganttProject('p_g', 'g', 'Gantt Benchmark', '2026-03-02', isoAdd('2026-03-02', 500), [])],
    tasks,
    comments: [],
    members: GANTT_MEMBERS,
    projOrder: ['p_g'],
  };
}

/* Exactly 380 dated bars plus 20 dependencies = 400 shapes: at the
   inclusive cap, so the sheet still draws and no note row appears. */
export function makeExactCapDoc() {
  const tasks = [];
  for (let i = 0; i < 380; i++) {
    tasks.push(ganttTask('t_e' + i, 'E-' + i, 'Exact cap task ' + i, i + 1,
      { start: isoAdd('2026-03-02', i), due: isoAdd('2026-03-02', i) },
      i > 0 && i <= 20 ? ['t_e' + (i - 1)] : []));
  }
  return {
    projects: [ganttProject('p_g', 'g', 'Gantt Exact Cap', '2026-03-02', isoAdd('2026-03-02', 380), [])],
    tasks,
    comments: [],
    members: GANTT_MEMBERS,
    projOrder: ['p_g'],
  };
}
