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
