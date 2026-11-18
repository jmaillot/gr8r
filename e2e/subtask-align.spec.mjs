/* =====================================================================
   PHASE 71 PIXEL-ALIGNMENT SPEC (G-71-1/G-71-2) — DOM-measured, not
   vision-guessed. The Vite virtual module blocks unit-level layout
   tests (71-VALIDATION: manual-only), but a real browser DOM can be
   measured exactly: every subrow meta cell's content-box left edge
   must sit within 1px of its parent task row's corresponding cell,
   which itself must sit within 1px of its column header edge.

   Fixtures through the real API (helpers/setup.mjs doc PUT through
   the funnel); labels read from the EN catalogue; no sleeps.
   ===================================================================== */
import { test, expect } from '@playwright/test';
import { BASE_URL, createAccount, newRunId } from './helpers/setup.mjs';

const RUN = newRunId();
const WS = `align-${RUN}`;
const PROJ = 'p_align';
const T1 = 't_align_main';

const mkTask = () => ({
  id: T1,
  project: PROJ,
  title: `Align task ${RUN}`,
  key: 'ALN-1',
  status: 'todo',
  assignees: [],
  priority: 'high',
  due: null,
  start: null,
  labels: [],
  subtasks: [
    { id: 'st_a1', parentId: null, position: 0, title: `Sub one ${RUN}`, done: false, assignees: [], priority: null, due: null },
    { id: 'st_a2', parentId: null, position: 1, title: `Sub two ${RUN}`, done: false, assignees: [], priority: null, due: null },
    { id: 'st_a3', parentId: 'st_a1', position: 0, title: `Grandchild ${RUN}`, done: false, assignees: [], priority: null, due: null },
  ],
  attachments: [],
  deps: [],
  comments: [],
});

test.beforeAll(async () => {
  const { createAccountAndSeed } = await import('./helpers/align-fixture.mjs');
  await createAccountAndSeed(BASE_URL, RUN, WS, PROJ, T1, mkTask());
});

/* The x-contract: for each meta column (status/priority/due), the subrow
   cell's content-box left edge must match BOTH the parent task row's
   corresponding cell AND the header cell at the same grid column (±1px
   rounding). The header check is the one the UAT vision audit caught
   missing — the subrow grid container's padding shifted every track. */
const COLS = ['c-status', 'c-priority', 'c-due'];

async function contentLeftX(loc) {
  return loc.evaluate(el => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return r.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
  });
}

test('subrow meta cells align pixel-exactly with the parent row cells AND the header', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  await page.goto('/');
  const { loginByForm } = await import('./helpers/align-fixture.mjs');
  await loginByForm(page, BASE_URL, RUN);
  await page.goto(`/w/${WS}/tasks`);
  await page.locator('button[data-a="setViewMode"][data-v="list"]').click();
  await expect(page.locator('.tlist').first()).toBeVisible();

  const thead = page.locator('.thead');
  const row = page.locator(`[data-task-row="${T1}"]`);
  await row.locator('[data-a="expandRow"]').click();
  const subrow = page.locator(`.subrows [data-ctx="sub"][data-id="${T1}"]`).first();
  await expect(subrow).toBeVisible();

  for (const col of COLS) {
    const fname = col.replace('c-', '');
    const headX = await contentLeftX(thead.locator(`> div[data-f="${fname}"]`));
    const parentX = await contentLeftX(row.locator(`.${col}`).first());
    const subX = await contentLeftX(subrow.locator(`.${col}`).first());
    expect(Math.abs(subX - parentX), `${col}: subrow vs parent`).toBeLessThanOrEqual(1);
    expect(Math.abs(parentX - headX), `${col}: parent vs header`).toBeLessThanOrEqual(1);
    expect(Math.abs(subX - headX), `${col}: subrow vs header`).toBeLessThanOrEqual(1);
  }
});

/* Depth-2: the grandchild's meta cells must ALSO land on the shared column
   grid — only the title indent may grow with depth. */
test('depth-2 subrow meta cells stay on the shared column grid', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  await page.goto('/');
  const { loginByForm } = await import('./helpers/align-fixture.mjs');
  await loginByForm(page, BASE_URL, RUN);
  await page.goto(`/w/${WS}/tasks`);
  await page.locator('button[data-a="setViewMode"][data-v="list"]').click();
  await expect(page.locator('.tlist').first()).toBeVisible();

  const row = page.locator(`[data-task-row="${T1}"]`);
  await row.locator('[data-a="expandRow"]').click();
  await expect(row.locator('.c-status').first()).toBeVisible();

  const sub = page.locator(`.subrows div[data-sid="st_a1"]`);
  await expect(sub).toBeVisible();
  await sub.locator('[data-a="toggleSubNode"]').click();
  const grand = page.locator(`.subrows div[data-sid="st_a3"]`);
  await expect(grand).toBeVisible();

  for (const col of COLS) {
    const parentX = await contentLeftX(row.locator(`.${col}`).first());
    const grandX = await contentLeftX(grand.locator(`.${col}`).first());
    const measured = Math.abs(grandX - parentX);
    /* Diagnostic artifact: dump the measured geometry for the failure report. */
    if (measured > 1) {
      const diag = await page.evaluate(([sid, col]) => {
        const g = document.querySelector(`.subrows div[data-sid="${sid}"] .${col}`);
        const p = document.querySelector(`[data-task-row="t_align_main"] .${col}`);
        const gs = getComputedStyle(g), ps = getComputedStyle(p);
        return {
          grand: { left: g.getBoundingClientRect().left, pad: gs.paddingLeft, bl: gs.borderLeftWidth, ind: gs.getPropertyValue('--ind') || '(none)' },
          parent: { left: p.getBoundingClientRect().left, pad: ps.paddingLeft, bl: ps.borderLeftWidth },
        };
      }, ['st_a3', col]);
      console.log(`DIAG ${col}:`, JSON.stringify(diag));
    }
    expect(measured, `${col}: depth-2 vs parent`).toBeLessThanOrEqual(1);
  }
});
test('my-tasks subrow meta cells align pixel-exactly with the parent row cells AND the header', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  await page.goto('/');
  const { loginByForm } = await import('./helpers/align-fixture.mjs');
  await loginByForm(page, BASE_URL, RUN);
  await page.goto(`/w/${WS}/tasks`);
  await page.locator('nav.side [data-r="mytasks"]').click();
  await expect(page.locator('.tlist').first()).toBeVisible();
  await expect(page.locator(`[data-task-row="${T1}"]`)).toBeVisible();

  const thead = page.locator('.thead');
  const row = page.locator(`[data-task-row="${T1}"]`);
  await row.locator('[data-a="expandRow"]').click();
  const subrow = page.locator(`.subrows [data-ctx="sub"][data-id="${T1}"]`).first();
  await expect(subrow).toBeVisible();

  for (const col of COLS) {
    const fname = col.replace('c-', '');
    const headX = await contentLeftX(thead.locator(`> div[data-f="${fname}"]`));
    const parentX = await contentLeftX(row.locator(`.${col}`).first());
    const subX = await contentLeftX(subrow.locator(`.${col}`).first());
    expect(Math.abs(subX - parentX), `${col}: subrow vs parent`).toBeLessThanOrEqual(1);
    expect(Math.abs(parentX - headX), `${col}: parent vs header`).toBeLessThanOrEqual(1);
    expect(Math.abs(subX - headX), `${col}: subrow vs header`).toBeLessThanOrEqual(1);
  }
});

/* =====================================================================
   G-71-3 (71-04): the chip's INNER content left edge — the .check
   toggle is position:absolute (out of flow), so the first in-flow
   element child of .stchip is the rendered stPill; its rect.left is
   the chip content the user actually sees. The parent side is the
   .pillbtn content-box edge (rect.left + border + padding) — the
   padding contract the chip must match.
   ===================================================================== */
async function chipInnerLeftX(loc) {
  return loc.evaluate(el => {
    const child = Array.from(el.children).find(c => !c.classList.contains('check'));
    if (!child) throw new Error('stchip has no in-flow content child');
    return child.getBoundingClientRect().left;
  });
}

async function chipDiag(page, selChip, selPill) {
  const diag = await page.evaluate(([chip, pill]) => {
    const c = document.querySelector(chip);
    const p = document.querySelector(pill);
    const cs = getComputedStyle(c), ps = getComputedStyle(p);
    return {
      chip: { left: c.getBoundingClientRect().left, pad: cs.paddingLeft, height: cs.height },
      pill: { left: p.getBoundingClientRect().left, pad: ps.paddingLeft, height: ps.height },
    };
  }, [selChip, selPill]);
  console.log('DIAG chip-content vs pill-content:', JSON.stringify(diag));
}

test('subrow status chip inner content aligns with the parent status pill content (list view)', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  await page.goto('/');
  const { loginByForm } = await import('./helpers/align-fixture.mjs');
  await loginByForm(page, BASE_URL, RUN);
  await page.goto(`/w/${WS}/tasks`);
  await page.locator('button[data-a="setViewMode"][data-v="list"]').click();
  await expect(page.locator('.tlist').first()).toBeVisible();

  const row = page.locator(`[data-task-row="${T1}"]`);
  await row.locator('[data-a="expandRow"]').click();
  const subrow = page.locator(`.subrows [data-ctx="sub"][data-id="${T1}"]`).first();
  await expect(subrow).toBeVisible();

  const pillX = await contentLeftX(row.locator('.c-status .pillbtn').first());
  const chipX = await chipInnerLeftX(subrow.locator('.stchip').first());
  const measured = Math.abs(chipX - pillX);
  if (measured > 1) {
    await chipDiag(page, `.subrows [data-ctx="sub"][data-id="${T1}"] .stchip`, `[data-task-row="${T1}"] .c-status .pillbtn`);
  }
  expect(measured, 'G-71-3: chip inner content vs parent pill content').toBeLessThanOrEqual(1);
});

test('my-tasks subrow status chip inner content aligns with the parent status pill content', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  await page.goto('/');
  const { loginByForm } = await import('./helpers/align-fixture.mjs');
  await loginByForm(page, BASE_URL, RUN);
  await page.goto(`/w/${WS}/tasks`);
  await page.locator('nav.side [data-r="mytasks"]').click();
  await expect(page.locator('.tlist').first()).toBeVisible();
  await expect(page.locator(`[data-task-row="${T1}"]`)).toBeVisible();

  const row = page.locator(`[data-task-row="${T1}"]`);
  await row.locator('[data-a="expandRow"]').click();
  const subrow = page.locator(`.subrows [data-ctx="sub"][data-id="${T1}"]`).first();
  await expect(subrow).toBeVisible();

  const pillX = await contentLeftX(row.locator('.c-status .pillbtn').first());
  const chipX = await chipInnerLeftX(subrow.locator('.stchip').first());
  const measured = Math.abs(chipX - pillX);
  if (measured > 1) {
    await chipDiag(page, `.subrows [data-ctx="sub"][data-id="${T1}"] .stchip`, `[data-task-row="${T1}"] .c-status .pillbtn`);
  }
  expect(measured, 'G-71-3 (my-tasks): chip inner content vs parent pill content').toBeLessThanOrEqual(1);
});

test('depth-2 subrow status chip inner content aligns with the parent status pill content', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  await page.goto('/');
  const { loginByForm } = await import('./helpers/align-fixture.mjs');
  await loginByForm(page, BASE_URL, RUN);
  await page.goto(`/w/${WS}/tasks`);
  await page.locator('button[data-a="setViewMode"][data-v="list"]').click();
  await expect(page.locator('.tlist').first()).toBeVisible();

  const row = page.locator(`[data-task-row="${T1}"]`);
  await row.locator('[data-a="expandRow"]').click();
  await expect(row.locator('.c-status').first()).toBeVisible();

  const sub = page.locator(`.subrows div[data-sid="st_a1"]`);
  await expect(sub).toBeVisible();
  await sub.locator('[data-a="toggleSubNode"]').click();
  const grand = page.locator(`.subrows div[data-sid="st_a3"]`);
  await expect(grand).toBeVisible();

  const pillX = await contentLeftX(row.locator('.c-status .pillbtn').first());
  const chipX = await chipInnerLeftX(grand.locator('.stchip').first());
  const measured = Math.abs(chipX - pillX);
  if (measured > 1) {
    await chipDiag(page, `.subrows div[data-sid="st_a3"] .stchip`, `[data-task-row="${T1}"] .c-status .pillbtn`);
  }
  expect(measured, 'G-71-3 (depth-2): chip inner content vs parent pill content').toBeLessThanOrEqual(1);
});

/* =====================================================================
   G-71-4 (71-05): the same inner-content metric extended to the
   assignee/priority/due cells. Their content is wrapped in one
   .stpill element carrying the .pillbtn padding/height/radius
   contract (mirroring G-71-3's .stchip), so the wrapper's first
   element child (avStack / prPill / .due span / faint fallback) is
   the visible content — measured against the parent cell's
   .pillbtn content-box edge.
   ===================================================================== */
const META_COLS = ['c-assignee', 'c-priority', 'c-due'];

async function stpillInnerLeftX(loc) {
  return loc.evaluate(el => {
    const wrap = el.querySelector('.stpill');
    if (!wrap) throw new Error('cell has no .stpill wrapper');
    /* First element child (avStack / prPill / .due / faint fallback) sits at
       the wrapper's content-box edge; when the wrapper is empty (no due), the
       content-box edge itself is the measurement — same math either way. */
    const cs = getComputedStyle(wrap);
    const r = wrap.getBoundingClientRect();
    return r.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
  });
}

async function stpillDiag(page, selCell, selPill) {
  const diag = await page.evaluate(([cell, pill]) => {
    const c = document.querySelector(`${cell} .stpill`);
    const p = document.querySelector(pill);
    const cs = getComputedStyle(c), ps = getComputedStyle(p);
    return {
      stpill: { left: c.getBoundingClientRect().left, pad: cs.paddingLeft, height: cs.height },
      pill: { left: p.getBoundingClientRect().left, pad: ps.paddingLeft, height: ps.height },
    };
  }, [selCell, selPill]);
  console.log('DIAG stpill-content vs pill-content:', JSON.stringify(diag));
}

async function assertStpillAligned(page, row, subrow, label, cols = META_COLS) {
  for (const col of cols) {
    const pillX = await contentLeftX(row.locator(`.${col} .pillbtn`).first());
    const innerX = await stpillInnerLeftX(subrow.locator(`.${col}`).first());
    const measured = Math.abs(innerX - pillX);
    if (measured > 1) {
      await stpillDiag(page, `.subrows [data-ctx="sub"][data-id="${T1}"] .${col}`, `[data-task-row="${T1}"] .${col} .pillbtn`);
    }
    expect(measured, `G-71-4${label}: ${col} inner content vs parent pill content`).toBeLessThanOrEqual(1);
  }
}

test('subrow assignee/priority/due inner content aligns with the parent pill content (list view)', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  await page.goto('/');
  const { loginByForm } = await import('./helpers/align-fixture.mjs');
  await loginByForm(page, BASE_URL, RUN);
  await page.goto(`/w/${WS}/tasks`);
  await page.locator('button[data-a="setViewMode"][data-v="list"]').click();
  await expect(page.locator('.tlist').first()).toBeVisible();

  const row = page.locator(`[data-task-row="${T1}"]`);
  await row.locator('[data-a="expandRow"]').click();
  const subrow = page.locator(`.subrows [data-ctx="sub"][data-id="${T1}"]`).first();
  await expect(subrow).toBeVisible();

  await assertStpillAligned(page, row, subrow, '');
});

test('my-tasks subrow assignee/priority/due inner content aligns with the parent pill content', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  await page.goto('/');
  const { loginByForm } = await import('./helpers/align-fixture.mjs');
  await loginByForm(page, BASE_URL, RUN);
  await page.goto(`/w/${WS}/tasks`);
  await page.locator('nav.side [data-r="mytasks"]').click();
  await expect(page.locator('.tlist').first()).toBeVisible();
  await expect(page.locator(`[data-task-row="${T1}"]`)).toBeVisible();

  const row = page.locator(`[data-task-row="${T1}"]`);
  await row.locator('[data-a="expandRow"]').click();
  const subrow = page.locator(`.subrows [data-ctx="sub"][data-id="${T1}"]`).first();
  await expect(subrow).toBeVisible();

  /* My Tasks forwards project→status→priority→due (no assignee column),
     so only the priority/due pills exist on the parent row to measure. */
  await assertStpillAligned(page, row, subrow, ' (my-tasks)', ['c-priority', 'c-due']);
});

test('depth-2 subrow priority inner content aligns with the parent priority pill content', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  await page.goto('/');
  const { loginByForm } = await import('./helpers/align-fixture.mjs');
  await loginByForm(page, BASE_URL, RUN);
  await page.goto(`/w/${WS}/tasks`);
  await page.locator('button[data-a="setViewMode"][data-v="list"]').click();
  await expect(page.locator('.tlist').first()).toBeVisible();

  const row = page.locator(`[data-task-row="${T1}"]`);
  await row.locator('[data-a="expandRow"]').click();
  await expect(row.locator('.c-status').first()).toBeVisible();

  const sub = page.locator(`.subrows div[data-sid="st_a1"]`);
  await expect(sub).toBeVisible();
  await sub.locator('[data-a="toggleSubNode"]').click();
  const grand = page.locator(`.subrows div[data-sid="st_a3"]`);
  await expect(grand).toBeVisible();

  const pillX = await contentLeftX(row.locator('.c-priority .pillbtn').first());
  const innerX = await stpillInnerLeftX(grand.locator('.c-priority').first());
  const measured = Math.abs(innerX - pillX);
  if (measured > 1) {
    await stpillDiag(page, `.subrows div[data-sid="st_a3"] .c-priority`, `[data-task-row="${T1}"] .c-priority .pillbtn`);
  }
  expect(measured, 'G-71-4 (depth-2): priority inner content vs parent pill content').toBeLessThanOrEqual(1);
});
