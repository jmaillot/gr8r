/* =====================================================================
   PHASE 65 SUBTASK TREE (SUB-01/SUB-02; D-05/D-07/D-09/D-11) — the
   Wave-0 gap: the tree UX path proven end-to-end.

   (1) render: list view shows indented subrows with carets after
       expandRow, the drawer shows the nested checklist ordered by
       position; (2) restructure via the per-subtask context menu
       (one-level demote, D-09); (3) an illegal move (depth overflow,
       D-04/D-05) shows the localized err.subtaskDepth toast and leaves
       the tree unmoved; (4) the board card's open-leaf badge expands
       the checklist popover (D-11).

   Conventions follow mobile-tasks-table.spec.mjs: fixtures through the
   real API (helpers/setup.mjs doc PUT through the funnel), labels read
   from the EN catalogue (never transcribed), web-first auto-retrying
   assertions, no sleeps, no image capture.
   ===================================================================== */
import { test, expect } from '@playwright/test';
import { BASE_URL, createAccount, newRunId } from './helpers/setup.mjs';
import en from '../src/locales/en.json' with { type: 'json' };

const RUN = newRunId();
const WS = `subtree-${RUN}`;
const PROJ = 'p_subtree';
const T1 = 't_subtree_main';
const T2 = 't_subtree_deep';

/* Two-level tree on T1: r1, r2 roots; c1, c2 children of r1 (position
   ordering, D-03). Depth-5 chain on T2: d1→d2→d3→d4→(d5a, d5b) — d5b's
   demote under d5a would push it to level 6, past the D-04 cap. */
const SUBTASKS = [
  { id: 'st_r1', parentId: null, position: 0, title: `Root one ${RUN}`, done: false },
  { id: 'st_r2', parentId: null, position: 1, title: `Root two ${RUN}`, done: false },
  { id: 'st_c1', parentId: 'st_r1', position: 0, title: `Child alpha ${RUN}`, done: false },
  { id: 'st_c2', parentId: 'st_r1', position: 1, title: `Child beta ${RUN}`, done: false },
  { id: 'st_d1', parentId: null, position: 0, title: `Depth 1 ${RUN}`, done: false },
  { id: 'st_d2', parentId: 'st_d1', position: 0, title: `Depth 2 ${RUN}`, done: false },
  { id: 'st_d3', parentId: 'st_d2', position: 0, title: `Depth 3 ${RUN}`, done: false },
  { id: 'st_d4', parentId: 'st_d3', position: 0, title: `Depth 4 ${RUN}`, done: false },
  { id: 'st_d5a', parentId: 'st_d4', position: 0, title: `Depth 5a ${RUN}`, done: false },
  { id: 'st_d5b', parentId: 'st_d4', position: 1, title: `Depth 5b ${RUN}`, done: false },
];

let acct;
let client;

const mkTask = (id, key, order) => ({
  id,
  project: PROJ,
  title: `Task ${key} ${RUN}`,
  key: `SUB-${key}`,
  status: 'todo',
  assignees: [],
  priority: 'none',
  due: null,
  start: null,
  labels: [],
  subtasks: SUBTASKS.filter(s => (id === T1 ? ['st_r1', 'st_r2', 'st_c1', 'st_c2'] : ['st_d1', 'st_d2', 'st_d3', 'st_d4', 'st_d5a', 'st_d5b']).includes(s.id)),
  attachments: [],
  deps: [],
  desc: '',
  estimate: null,
  created: Date.now(),
  updated: Date.now(),
  creator: null,
  order,
  fav: false,
});

test.beforeAll(async () => {
  ({ account: acct, client } = await createAccount(BASE_URL, RUN, 'subtree', 'Subtree Owner', { locale: 'en', workspace: WS }));
  const got = await client.get(`/api/workspaces/${acct.slug}`);
  if (got.status !== 200) throw new Error(`workspace GET failed with HTTP ${got.status}`);
  const doc = got.data.doc;
  doc.data.projects = [
    ...(doc.data.projects || []),
    {
      id: PROJ,
      key: 'subtree-a',
      name: `Subtree Probe ${RUN}`,
      icon: 'map',
      color: 'indigo',
      status: 'active',
      teams: [],
      lead: null,
      due: null,
      start: null,
      fav: false,
      members: [],
      desc: '',
      milestones: [],
      last: 0,
      private: false,
      perms: {},
    },
  ];
  doc.data.projOrder = [...(doc.data.projOrder || []), PROJ];
  doc.data.tasks = [...(doc.data.tasks || []), mkTask(T1, 1, 1), mkTask(T2, 2, 2)];
  const put = await client.put(`/api/workspaces/${acct.slug}`, { revision: got.data.revision, doc });
  if (put.status !== 200) throw new Error(`doc PUT failed with HTTP ${put.status}`);
});

async function signIn(browser) {
  const context = await browser.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { 'x-forwarded-for': acct.ip } });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByLabel('Email').fill(acct.email);
  await page.getByLabel('Password', { exact: true }).fill(acct.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${acct.slug}$`));
  return { context, page };
}

async function openTasks(page, mode) {
  await page.goto(`/w/${acct.slug}/tasks`);
  await page.locator(`button[data-a="setViewMode"][data-v="${mode}"]`).click();
  /* board renders .kcard, list/table render [data-task-row] — wait on the page shell. */
  await expect(page.locator('.board, .tlist, .tbl-wrap').first()).toBeVisible();
}

/* (1) render: the list view's indented subrows + carets. */
test('list view renders the tree: carets expand position-ordered subrows, nested rows indent', async ({ browser }) => {
  const { context, page } = await signIn(browser);
  try {
    await openTasks(page, 'list');
    const row = page.locator(`[data-task-row="${T1}"]`);
    const caret = row.locator('[data-a="expandRow"]');
    await expect(caret).toHaveAttribute('aria-expanded', 'false');
    await caret.click();
    const subrows = page.locator(`.subrows [data-ctx="sub"][data-id="${T1}"]`);
    await expect(subrows).toHaveCount(2);
    /* D-03: position ordering — the roots render r1 then r2. */
    await expect(subrows.nth(0)).toContainText(`Root one ${RUN}`);
    await expect(subrows.nth(1)).toContainText(`Root two ${RUN}`);
    /* Expand r1: its children follow in position order, indented (D-12). */
    await subrows.nth(0).locator('[data-a="toggleSubNode"]').click();
    const kids = page.locator(`.subrows [data-ctx="sub"][data-sid="st_c1"], .subrows [data-ctx="sub"][data-sid="st_c2"]`);
    await expect(kids).toHaveCount(2);
    await expect(kids.nth(0)).toContainText(`Child alpha ${RUN}`);
    await expect(kids.nth(1)).toContainText(`Child beta ${RUN}`);
    await expect(kids.nth(0)).toHaveAttribute('style', /padding-left:16px/);
  } finally {
    await context.close();
  }
});

/* (1b) the drawer shows the same tree, position-ordered (SUB-01). */
test('drawer shows the nested checklist ordered by position', async ({ browser }) => {
  const { context, page } = await signIn(browser);
  try {
    await openTasks(page, 'list');
    await page.locator(`[data-task-row="${T1}"] .ttl[data-a="openTask"]`).click();
    const checklist = page.locator('.drawer [data-ctx="sub"]');
    await expect(checklist.filter({ hasText: `Root one ${RUN}` })).toBeVisible();
    await expect(checklist.filter({ hasText: `Root two ${RUN}` })).toBeVisible();
    /* Expand r1 in the drawer: children ordered c1 then c2 (D-03). */
    await checklist.filter({ hasText: `Root one ${RUN}` }).locator('[data-a="toggleSubNode"]').click();
    const c1 = checklist.filter({ hasText: `Child alpha ${RUN}` });
    const c2 = checklist.filter({ hasText: `Child beta ${RUN}` });
    await expect(c1).toBeVisible();
    await expect(c2).toBeVisible();
    const box1 = await c1.boundingBox();
    const box2 = await c2.boundingBox();
    expect(box1.y).toBeLessThan(box2.y);
  } finally {
    await context.close();
  }
});

/* (2) restructure: demote root two under root one via the context menu
   (one level, D-09) — the indentation moves after save. */
test('context menu demote moves a root subtask under its previous sibling', async ({ browser }) => {
  const { context, page } = await signIn(browser);
  try {
    await openTasks(page, 'list');
    await page.locator(`[data-task-row="${T1}"] [data-a="expandRow"]`).click();
    const r2 = page.locator(`.subrows [data-ctx="sub"][data-sid="st_r2"]`);
    await expect(r2).toBeVisible();
    await r2.click({ button: 'right' });
    await page.getByRole('button', { name: en['act.moveSubDown'] }).click();
    /* The moved node is now a child of r1 — expand r1 and find it indented. */
    const r1 = page.locator(`.subrows [data-ctx="sub"][data-sid="st_r1"]`);
    await r1.locator('[data-a="toggleSubNode"]').click();
    const moved = page.locator(`.subrows [data-ctx="sub"][data-sid="st_r2"]`);
    await expect(moved).toBeVisible();
    await expect(moved).toHaveAttribute('style', /padding-left:16px/);
    /* The server re-validates and persists (D-05): the round-tripped doc
       carries the one-node diff — r2's parentId/position, nothing else.
       The save is debounced client-side, so poll until the push lands. */
    await expect
      .poll(async () => {
        const got = await client.get(`/api/workspaces/${acct.slug}`);
        const sub = got.data.doc.data.tasks.find(t => t.id === T1).subtasks.find(s => s.id === 'st_r2');
        return `${sub.parentId}:${sub.position}`;
      })
      .toBe('st_r1:2');
  } finally {
    await context.close();
  }
});

/* (3) illegal move: demoting a level-5 node would push it to level 6 —
   the localized err.subtaskDepth toast appears and the tree is unmoved. */
test('illegal demote past level 5 shows the localized error toast and leaves the tree unmoved', async ({ browser }) => {
  const { context, page } = await signIn(browser);
  try {
    await openTasks(page, 'list');
    await page.locator(`[data-task-row="${T2}"] [data-a="expandRow"]`).click();
    /* Expand the chain down to d4's children. */
    for (const sid of ['st_d1', 'st_d2', 'st_d3', 'st_d4']) {
      await page.locator(`.subrows [data-ctx="sub"][data-sid="${sid}"] [data-a="toggleSubNode"]`).click();
    }
    const d5b = page.locator(`.subrows [data-ctx="sub"][data-sid="st_d5b"]`);
    await expect(d5b).toBeVisible();
    await d5b.click({ button: 'right' });
    await page.getByRole('button', { name: en['act.moveSubDown'] }).click();
    await expect(page.locator('.toast')).toContainText(en['err.subtaskDepth']);
    /* No half-moved UI: d5b is still a child of d4, still a sibling of d5a. */
    const got = await client.get(`/api/workspaces/${acct.slug}`);
    const sub = got.data.doc.data.tasks.find(t => t.id === T2).subtasks.find(s => s.id === 'st_d5b');
    expect(sub.parentId).toBe('st_d4');
    expect(sub.position).toBe(1);  } finally {
    await context.close();
  }
});

/* (4) board badge: the card shows the open-leaf count and tapping it
   expands the checklist popover (D-11). */
test('board card shows the open-subtask badge and expands the checklist popover', async ({ browser }) => {
  const { context, page } = await signIn(browser);
  try {
    await openTasks(page, 'board');
    const badge = page.locator(`.board .kcard[data-id="${T1}"] [data-pop="subs"]`);
    await expect(badge).toBeVisible();
    /* D-11: open LEAVES — c1, c2, r2 (three leaves after the demote test;
       each test signs in fresh, but the demote PERSISTED server-side, so
       the leaf count here is 3: c1, c2, r2). */
    await expect(badge.locator('.num')).toHaveText('3');
    await badge.click();
    const pop = page.locator('.pop.floating');
    await expect(pop).toBeVisible();
    await expect(pop).toContainText(en['popover.subtasksOf'].replace('{title}', `Task 1 ${RUN}`));
    const r1 = pop.locator('[data-ctx="sub"]').filter({ hasText: `Root one ${RUN}` });
    await expect(r1).toBeVisible();
    /* Expand r1 inside the popover: its nested children render (D-11). */
    await r1.locator('[data-a="toggleSubNode"]').click();
    await expect(pop.locator('[data-ctx="sub"]').filter({ hasText: `Child alpha ${RUN}` })).toBeVisible();
  } finally {
    await context.close();
  }
});
