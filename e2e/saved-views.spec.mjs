/* =====================================================================
   PHASE 57 E2E (VIEW-02, ROADMAP SC-2): named saved views on the tasks
   table — save the current view under a name, change the live state,
   re-apply and see columns/sort restored, update after explicit
   confirm, delete, and prove the named row landed in the server's
   saved_views table (D-05 rows-not-doc).

   Conventions follow the rest of the suite: fixtures only through the
   real API (helpers/setup.mjs), every asserted string read from
   src/locales/en.json — never hardcoded. The OWNER account is reused
   (its seeded acme workspace has tasks); the named views are per-user
   (D-09) so the assertions below use run-unique view names to never
   collide with another run's rows.
   ===================================================================== */
import { test, expect } from '@playwright/test';
import { BASE_URL, OWNER, apiClient, clientIp, newRunId } from './helpers/setup.mjs';
import en from '../src/locales/en.json' with { type: 'json' };

const run = newRunId();
const VIEW_NAME = `Runbook ${run}`;
const fixture = { ip: clientIp(run, 'sv-owner') };

function fmt(key, vars) {
  const s = en[key];
  if (typeof s !== 'string') throw new Error(`catalogue key missing: ${key}`);
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => vars[k]) : s;
}

async function signIn(page) {
  await page.goto('/');
  await page.getByLabel('Email').fill(OWNER.email);
  await page.getByLabel('Password', { exact: true }).fill(OWNER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/w\/acme$/);
}

/* Workspace > Tasks in TABLE view (the views popover rides the table toolbar,
   same gate as the columns popover — D-10 keeps named views off other keys). */
async function openTasksTable(page) {
  await page
    .getByRole('navigation', { name: fmt('a11y.mainNav') })
    .getByRole('button', { name: fmt('nav.route.tasks'), exact: true })
    .click();
  await page.getByRole('button', { name: fmt('page.project.tab.table') }).first().click();
  await expect(page.getByRole('button', { name: fmt('popover.savedViews') })).toBeVisible();
}

/* The columns popover: force one column's checkbox to `checked`. The live
   write-through is awaited on its real completion signal — the debounced
   persistLiveView PUT (450 ms trailing, viewSync.js) whose postData has NO
   `name` field, distinguishing the live row from a named PUT (putViews vs
   putViewsNamed). The waiter is armed immediately before the single toggle
   click (nothing re-arms the debounce inside this call), then Escape closes
   the popover semantically (keyboard.js Escape → closePop) — replacing the
   old coordinate click at (5, 400), which is viewport-dependent (Phase 63
   SC-3 / D-04). The kept `.pop.floating` toHaveCount(0) assertion is the
   genuine closePop completion proof: render() runs synchronously, so a
   swallowed Escape fails fast and visibly. */
async function setColumn(page, label, checked) {
  await page.getByRole('button', { name: fmt('act.columns') }).click();
  const box = page
    .locator('.pop.floating label')
    .filter({ hasText: label })
    .getByRole('checkbox');
  if ((await box.isChecked()) !== checked) {
    /* Phase 63 SC-3: arm the live-PUT completion signal BEFORE the trigger
       (D-08 arm-before-act) — postData without `name` = the live row. */
    const livePut = page.waitForResponse(r =>
      r.url().endsWith('/api/me/views') &&
      r.request().method() === 'PUT' &&
      !JSON.parse(r.request().postData() || '{}').name);
    await box.click();
    await livePut;
  }
  await page.keyboard.press('Escape'); /* Phase 63 SC-3 / D-04: semantic dismissal */
  await expect(page.locator('.pop.floating')).toHaveCount(0);
}

test('save, apply, update and delete a named view on the tasks table (VIEW-02)', async ({ page }) => {
  await signIn(page);
  await openTasksTable(page);

  /* Shape the live view: hide Status and Priority, sort by due date. */
  await setColumn(page, fmt('page.field.status'), false);
  await setColumn(page, fmt('page.field.priority'), false);
  await page.getByRole('button', { name: new RegExp(fmt('page.sortLabel')) }).click();
  await page.locator('.pop.floating').getByRole('button', { name: fmt('page.field.due') }).click();
  await expect(page.locator('.pop.floating')).toHaveCount(0);

  /* Save current… → prompt modal → named row stored. */
  await page.getByRole('button', { name: fmt('popover.savedViews') }).click();
  await page.locator('.pop.floating').getByRole('button', { name: fmt('popover.saveCurrentView') }).click();
  const nameInput = page.locator('#prompt-in');
  await expect(nameInput).toBeVisible();
  await nameInput.fill(VIEW_NAME);
  await page.getByRole('button', { name: fmt('common.save'), exact: true }).click();
  await expect(page.locator('.toast', { hasText: fmt('toast.savedTableView', { name: VIEW_NAME }) })).toBeVisible();

  /* SC-2 proof: the named row is in the server saved_views table (read back
     through the API as the same user — rows are per-user, D-09). */
  const client = apiClient(BASE_URL, { name: 'sv-owner', ip: fixture.ip });
  const login = await client.post('/api/auth/login', { email: OWNER.email, password: OWNER.password });
  if (login.status !== 200) throw new Error(`owner login failed with HTTP ${login.status}`);
  const wsList = await client.get('/api/workspaces');
  const wsId = wsList.data.workspaces?.find(w => w.slug === 'acme')?.id;
  if (!wsId) throw new Error('acme workspace not in the owner list');
  const got = await client.get(`/api/me/views?workspace=${encodeURIComponent(wsId)}&key=tasks`);
  if (got.status !== 200) throw new Error(`views GET failed with HTTP ${got.status}`);
  const saved = got.data.views.named.find(v => v.name === VIEW_NAME);
  if (!saved) throw new Error(`named view "${VIEW_NAME}" not in saved_views rows: ${JSON.stringify(got.data.views.named)}`);
  if (!saved.blob.hidden.includes('status') || !saved.blob.hidden.includes('priority')) {
    throw new Error(`saved blob misses the hidden columns: ${JSON.stringify(saved.blob)}`);
  }
  if (saved.blob.sort?.f !== 'due') throw new Error(`saved blob misses the sort: ${JSON.stringify(saved.blob)}`);
  if ('q' in saved.blob || Object.keys(saved.blob).some(k => k.startsWith('_'))) {
    throw new Error(`saved blob carries transients: ${JSON.stringify(saved.blob)}`);
  }

  /* Change the live state back (columns visible, manual sort), then re-apply:
     the whole live view state is replaced — both columns hidden again, sort
     back on due date (D-11/D-15). */
  await setColumn(page, fmt('page.field.status'), true);
  await setColumn(page, fmt('page.field.priority'), true);
  await page.getByRole('button', { name: fmt('popover.savedViews') }).click();
  await page.locator('.pop.floating').getByRole('button', { name: VIEW_NAME, exact: true }).click();
  await expect(page.locator('.toast', { hasText: fmt('toast.appliedTableView', { name: VIEW_NAME }) })).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(`${fmt('page.sortLabel')}\\s*${fmt('page.field.due')}`) })).toBeVisible();
  await page.getByRole('button', { name: fmt('act.columns') }).click();
  const statusBox = page
    .locator('.pop.floating label')
    .filter({ hasText: fmt('page.field.status') })
    .getByRole('checkbox');
  await expect(statusBox).not.toBeChecked();
  await page.mouse.click(5, 400);
  await expect(page.locator('.pop.floating')).toHaveCount(0);

  /* Update with explicit confirm (D-12): show Status again, then Update. */
  await setColumn(page, fmt('page.field.status'), true);
  await page.getByRole('button', { name: fmt('popover.savedViews') }).click();
  await page.locator('.pop.floating').getByRole('button', { name: fmt('popover.updateView') }).click();
  await expect(page.locator('.modal', { hasText: fmt('modal.updateTableViewConfirm', { name: VIEW_NAME }) })).toBeVisible();
  await page.locator('.modal').getByRole('button', { name: fmt('popover.updateView') }).click();
  await expect(page.locator('.toast', { hasText: fmt('toast.savedTableView', { name: VIEW_NAME }) })).toBeVisible();

  /* Delete: the trash icon in the views popover row; the list empties back to
     the PROBE VIEW-02 empty state — no row until the first explicit save. */
  await page.getByRole('button', { name: fmt('popover.savedViews') }).click();
  await page.locator(`.pop.floating [aria-label="${fmt('a11y.deleteTableView', { name: VIEW_NAME })}"]`).click();
  await expect(page.locator('.toast', { hasText: fmt('toast.deletedTableView', { name: VIEW_NAME }) })).toBeVisible();
  await expect(page.locator('.pop.floating').getByText(fmt('popover.noSavedViews'))).toBeVisible();
});
