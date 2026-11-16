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

   (3) 67-05 favourites: the star persists through the funnel and the
       create-modal favourites block leads and instantiates on click.
   ===================================================================== */
import { test, expect } from '@playwright/test';
import { BASE_URL, createAccount, newRunId, openSettings } from './helpers/setup.mjs';
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

/* (3) 67-05 favourites: star the project template in Settings, then the
   create-modal favourites block leads and instantiates on click. */
test('favourite template: the star persists and the create-modal favourites block instantiates', async ({ browser }) => {
  const { context, page } = await signIn(browser);
  try {
    /* Star the project template in Settings → Templates (EN tab). */
    await openSettings(page);
    await page.getByRole('button', { name: en['settings.nav.templates'] }).click();
    await page.locator('button[data-a="tplTab"][data-v="project"]').click();
    const row = page.locator('.srow').filter({ hasText: `Project template ${RUN}` });
    await expect(row).toBeVisible();
    const star = row.locator('button[data-a="tplFav"]');
    await expect(star).toHaveAttribute('aria-pressed', 'false');
    await star.click();
    await expect(star).toHaveAttribute('aria-pressed', 'true');
    /* The flag round-trips through the funnel (sanitizeTemplate whitelists fav). */
    await expect
      .poll(async () => {
        const data = await readDoc();
        return (data.templates || []).find(x => x.id === 'tpl_proj_seed')?.fav;
      })
      .toBe(true);

    /* The create-modal favourites block leads with the starred template. */
    await page.goto(`/w/${acct.slug}/projects`);
    await page.locator('button[data-a="newProject"]').first().click();
    const modal = page.locator('.modal');
    const favOpt = modal.locator('.opt').filter({ hasText: `Project template ${RUN}` });
    await expect(favOpt).toBeVisible();
    await expect(favOpt).toContainText(en['templates.previewTasks'].replace('{n}', '2'));
    /* It precedes the built-in catalogue block. */
    const builtIn = modal.locator('.opt').filter({ hasText: en['project.template.web.name'] });
    await expect(builtIn).toBeVisible();
    const favY = (await favOpt.boundingBox()).y;
    const builtY = (await builtIn.boundingBox()).y;
    expect(favY).toBeLessThan(builtY);
    /* Clicking a favourite instantiates immediately (tplPick semantics). */
    await favOpt.click();
    await expect(page).toHaveURL(new RegExp(`/w/${acct.slug}/project/`), { timeout: 10000 });
    const data = await readDoc();
    expect((data.projects || []).filter(x => x.name === `Templated project ${RUN}`)).toHaveLength(2);
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

/* (4) 67-06 MD import: the Settings toolbar's file input parses to a draft
   and opens the ORDINARY editor — nothing saves until the user reviews and
   hits Save; the funnel then sanitizes like anything typed by hand. The EN
   labels ride the lazy table (template-md-labels.json), not en.json. */
import mdLabels from '../src/features/template-md-labels.json' with { type: 'json' };

test('md import: a Markdown file opens the editor draft and saves through the funnel', async ({ browser }) => {
  const { context, page } = await signIn(browser);
  try {
    await openSettings(page);
    await page.getByRole('button', { name: en['settings.nav.templates'] }).click();
    const toolbar = page.locator('.sblock').first();
    const importBtn = toolbar.locator('label').filter({ hasText: mdLabels.importBtn });
    await expect(importBtn).toBeVisible();

    /* The example downloads work client-side (Blob, no server route): two
       buttons, one complete example per kind. */
    const [d1] = await Promise.all([
      page.waitForEvent('download'),
      toolbar.locator('button[data-a="tplImportExample"][data-v="task"]').click(),
    ]);
    expect(d1.suggestedFilename()).toBe('template-example-task.md');
    const [d2] = await Promise.all([
      page.waitForEvent('download'),
      toolbar.locator('button[data-a="tplImportExample"][data-v="project"]').click(),
    ]);
    expect(d2.suggestedFilename()).toBe('template-example-project.md');

    /* Import the example file itself: parse → editor modal, never a blind save. */
    const md = [
      '---',
      'kind: task',
      `name: Imported ${RUN}`,
      'icon: clipboard',
      '---',
      '## +2d First imported subtask',
      '  with a note',
      '## Imported plain',
    ].join('\n');
    await importBtn.locator('input[type=file]').setInputFiles({
      name: `import-${RUN}.md`,
      mimeType: 'text/markdown',
      buffer: Buffer.from(md, 'utf8'),
    });
    /* The editor opens on the draft — a fresh draft renders the
       templates.editorNew header; the parsed rows live in the editor's
       inline inputs (values, not text), so assert by input value. */
    const editor = page.locator('.modal');
    await expect(editor.locator('#tpl-title')).toHaveValue(`Imported ${RUN}`, { timeout: 10000 });
    await expect(editor.locator('input[data-in="tplTitle"]').first()).toHaveValue('First imported subtask');
    await expect(editor.locator('input[data-in="tplOffset"]').first()).toHaveValue('2');

    /* Review, then Save — the funnel writes the record. */
    await page.locator('button[data-a="tplSave"]').click();
    await expect(page.locator('.modal')).not.toBeVisible({ timeout: 10000 });

    const data = await readDoc();
    const tm = (data.templates || []).find(x => x.name === `Imported ${RUN}`);
    expect(tm, 'the imported template was saved').toBeTruthy();
    expect(tm.kind).toBe('task');
    expect(tm.icon).toBe('clipboard');
    const subs = tm.body.subtasks || [];
    expect(subs.map(s => s.title)).toEqual(['First imported subtask', 'Imported plain']);
    expect(subs[0].dueOffsetDays).toBe(2);
    expect(subs[0].note).toBe('with a note');
    expect('dueOffsetDays' in subs[1]).toBe(false);
  } finally {
    await context.close();
  }
});

/* (5) 67-07: the hideStarters toggle — a workspace pref that removes the six
   themed starters from the create-project modal; "Blank project" always stays. */
test('hideStarters toggle removes the themed starters from the create modal, blank stays', async ({ browser }) => {
  const { context, page } = await signIn(browser);
  try {
    /* The default create modal carries all 7 starter options. */
    await page.goto(`/w/${acct.slug}/projects`);
    await page.locator('button[data-a="newProject"]').first().click();
    const modal = page.locator('.modal');
    await expect(modal.locator('.tmpls [role="radio"]')).toHaveCount(7);
    await modal.locator('.modal-h button[data-a="closeModal"]').click();

    /* Flip the toggle in Settings → Templates — the write lands through the
       real funnel (prefToggle → S.prefs → doc PUT). */
    await openSettings(page);
    await page.getByRole('button', { name: en['settings.nav.templates'] }).click();
    const toggle = page.locator('input.toggle[data-k="hideStarters"]');
    await expect(toggle).toBeVisible();
    await toggle.click();
    const saved = page.waitForResponse(r => r.url().includes('/api/workspaces/') && r.request().method() === 'PUT');
    await expect(toggle).toBeChecked();
    await saved;

    /* The create modal now shows blank only. */
    await page.goto(`/w/${acct.slug}/projects`);
    await page.locator('button[data-a="newProject"]').first().click();
    await expect(page.locator('.modal .tmpls [role="radio"]')).toHaveCount(1);
    await expect(page.locator('.modal .tmpls [role="radio"]')).toContainText(en['project.template.blank.name']);

    /* Flip back through the same funnel (the doc-PUT client), then reload —
       the modal restores all seven. */
    const got2 = await client.get(`/api/workspaces/${acct.slug}`);
    const doc2 = got2.data.doc;
    delete doc2.prefs.hideStarters;
    const put2 = await client.put(`/api/workspaces/${acct.slug}`, { revision: got2.data.revision, doc: doc2 });
    expect(put2.status).toBe(200);
    await page.goto(`/w/${acct.slug}/projects`);
    await page.locator('button[data-a="newProject"]').first().click();
    await expect(page.locator('.modal .tmpls [role="radio"]')).toHaveCount(7);
  } finally {
    await context.close();
  }
});
