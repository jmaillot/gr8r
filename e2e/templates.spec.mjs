/* =====================================================================
   PHASE 66 TEMPLATE UI (TMPL-03; D-09/D-11/D-12) — the create-path UX
   proven end-to-end.

   (1) project template via the projectCreateModal "From template…"
       picker: the embedded task tree lands with parentId references
       remapped to fresh ids and every due = instantiation day + offset
       (D-05/D-06, Pitfall 4); (2) task template via the taskModal
       "From template…" picker: the task lands with its subtask tree and
       the drawer opens on it.

   Conventions follow subtask-tree.spec.mjs: fixtures through the real
   API (helpers/setup.mjs doc PUT through the funnel), labels read from
   the EN catalogue (never transcribed), web-first auto-retrying
   assertions, no sleeps, no image capture.
   ===================================================================== */
import { test, expect } from '@playwright/test';
import { BASE_URL, createAccount, newRunId } from './helpers/setup.mjs';
import en from '../src/locales/en.json' with { type: 'json' };

const RUN = newRunId();
const WS = `tpl-${RUN}`;
const PROJ = 'p_tpl_home';

/* The offset math mirrors core/templates.js offsetIso: component-wise
   local-day arithmetic so timezone offsets can never shift the day. */
const pad2 = n => String(n).padStart(2, '0');
function offsetIso(off) {
  const x = new Date();
  x.setDate(x.getDate() + off);
  return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
}

/* Two seeded templates (TMPL-01 shape): a task template with a two-level
   subtask tree (absolute offsets, D-07) and a project template whose body
   carries an embedded task tree with due/start offsets. */
const TASK_TEMPLATE = {
  id: 'tpl_task_seed',
  kind: 'task',
  name: `Task template ${RUN}`,
  icon: 'zap',
  color: '',
  body: {
    title: `Seeded task ${RUN}`,
    notes: 'from the task template',
    priority: 'high',
    subtasks: [
      { id: 'tst_r', parentId: null, position: 0, title: `Sub root ${RUN}`, done: false, dueOffsetDays: 2 },
      { id: 'tst_c', parentId: 'tst_r', position: 0, title: `Sub child ${RUN}`, done: false, dueOffsetDays: 3 },
    ],
  },
  position: 0,
  createdBy: null,
  createdAt: null,
  updatedAt: null,
};

const PROJECT_TEMPLATE = {
  id: 'tpl_proj_seed',
  kind: 'project',
  name: `Project template ${RUN}`,
  icon: 'map',
  color: '',
  body: {
    name: `Templated project ${RUN}`,
    description: 'from the project template',
    status: 'planning',
    teams: [],
    tasks: [
      {
        title: `P task one ${RUN}`,
        notes: '',
        priority: 'none',
        dueOffsetDays: 1,
        startOffsetDays: 0,
        subtasks: [{ id: 'pst_1', parentId: null, position: 0, title: `P sub ${RUN}`, done: false }],
      },
      { title: `P task two ${RUN}`, notes: '', priority: 'none' },
    ],
  },
  position: 1,
  createdBy: null,
  createdAt: null,
  updatedAt: null,
};

let acct;
let client;

test.beforeAll(async () => {
  ({ account: acct, client } = await createAccount(BASE_URL, RUN, 'tpl', 'Template Owner', { locale: 'en', workspace: WS }));
  const got = await client.get(`/api/workspaces/${acct.slug}`);
  if (got.status !== 200) throw new Error(`workspace GET failed with HTTP ${got.status}`);
  const doc = got.data.doc;
  doc.data.projects = [
    ...(doc.data.projects || []),
    {
      id: PROJ,
      key: 'tpl-a',
      name: `Template Home ${RUN}`,
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
  doc.data.tasks = doc.data.tasks || [];
  doc.data.templates = [TASK_TEMPLATE, PROJECT_TEMPLATE];
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

/* The fresh doc, re-read through the funnel — the ground truth for the
   instantiated rows (ids are regenerated, D-16). */
async function readDoc() {
  const got = await client.get(`/api/workspaces/${acct.slug}`);
  if (got.status !== 200) throw new Error(`workspace GET failed with HTTP ${got.status}`);
  return got.data.doc.data;
}

/* (1) project template via the create-modal picker. */
test('project template instantiation lands the embedded tree with remapped parents and offset dues', async ({ browser }) => {
  const { context, page } = await signIn(browser);
  try {
    await page.goto(`/w/${acct.slug}/projects`);
    await page.locator('button[data-a="newProject"]').first().click();
    const modal = page.locator('.modal');
    /* The "From template…" entry opens the picker (data-kind="project"). */
    await modal.locator('button[data-a="openTemplatePicker"][data-kind="project"]').click();
    const picker = page.locator('.modal .mi').filter({ hasText: `Project template ${RUN}` });
    await expect(picker).toContainText(en['templates.previewTasks'].replace('{n}', '2'));
    await picker.click();
    /* The pick closes the picker and lands the instantiation — the
       created project opens. */
    await expect(page).toHaveURL(new RegExp(`/w/${acct.slug}/project/`), { timeout: 10000 });

    /* Ground truth through the funnel: tree intact (parentId remapped,
       Pitfall 4), dues = today + offset (D-05/D-07). */
    const data = await readDoc();
    const p = (data.projects || []).find(x => x.name === `Templated project ${RUN}`);
    expect(p, 'the instantiated project exists').toBeTruthy();
    expect(p.status).toBe('planning');
    const t1 = (data.tasks || []).find(x => x.project === p.id && x.title === `P task one ${RUN}`);
    const t2 = (data.tasks || []).find(x => x.project === p.id && x.title === `P task two ${RUN}`);
    expect(t1).toBeTruthy();
    expect(t2).toBeTruthy();
    expect(t1.due).toBe(offsetIso(1));
    expect(t1.start).toBe(offsetIso(0));
    /* P task two carries no offset — no due (D-08). */
    expect(t2.due ?? null).toBe(null);
    /* The embedded subtask landed with a fresh id, re-rooted under the
       fresh task (dangling template ids land null — the funnel heal). */
    const subs = (t1.subtasks || []).filter(s => s.title === `P sub ${RUN}`);
    expect(subs).toHaveLength(1);
    expect(subs[0].parentId).toBe(null);
    expect(subs[0].id).not.toBe('pst_1');
  } finally {
    await context.close();
  }
});

/* (2) task template via the taskModal picker. */
test('task template instantiation lands the task with its subtask tree and opens the drawer', async ({ browser }) => {
  const { context, page } = await signIn(browser);
  try {
    await page.goto(`/w/${acct.slug}/tasks`);
    await page.locator('button[data-a="newTask"]').first().click();
    const modal = page.locator('.modal');
    await modal.locator('button[data-a="openTemplatePicker"][data-kind="task"]').click();
    const picker = page.locator('.modal .mi').filter({ hasText: `Task template ${RUN}` });
    await expect(picker).toContainText(en['templates.previewSubtasks'].replace('{n}', '2'));
    await picker.click();
    /* The pick closes the modal and opens the drawer on the landed task. */
    const drawer = page.locator('.drawer, [role="dialog"]').filter({ hasText: `Seeded task ${RUN}` });
    await expect(drawer.first()).toBeVisible({ timeout: 10000 });
    await expect(drawer.first()).toContainText(`Sub root ${RUN}`);

    /* Ground truth: the tree landed with fresh ids and offset dues. */
    const data = await readDoc();
    const tk = (data.tasks || []).find(x => x.title === `Seeded task ${RUN}`);
    expect(tk, 'the instantiated task exists').toBeTruthy();
    expect(tk.priority).toBe('high');
    const root = (tk.subtasks || []).find(s => s.title === `Sub root ${RUN}`);
    const child = (tk.subtasks || []).find(s => s.title === `Sub child ${RUN}`);
    expect(root).toBeTruthy();
    expect(child).toBeTruthy();
    expect(child.parentId).toBe(root.id);
    expect(root.id).not.toBe('tst_r');
    expect(root.due).toBe(offsetIso(2));
    expect(child.due).toBe(offsetIso(3));
  } finally {
    await context.close();
  }
});
