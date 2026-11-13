/* =====================================================================
   PHASE 60 E2E: the admin dashboard + the Settings › My access self-view.

   The per-role routing story, proven in Chromium on the real server:
   - admin signs in → the Dashboard sidebar entry is there → /w/:slug/
     dashboard renders the four panels, an overdue row opens the task
     drawer at /w/:slug/task/:key;
   - a member typing the dashboard URL gets the SERVER 403 surfaced
     (the keyed adminOnly state — the server gate is the control);
   - the member's Settings › My access renders its own reachable-projects
     list with the Phase 52 reason badge (TRN-01).

   Conventions follow the rest of the suite: fixtures only through the
   real API (doc PUT with revision retry), run-unique per-IP addresses,
   one browser context per account.
   ===================================================================== */
import { test, expect } from '@playwright/test';
import { BASE_URL, PASSWORD, apiClient, clientIp, createAccount, inviteToken, newRunId } from './helpers/setup.mjs';

const isoDay = offset => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

async function signIn(page, account) {
  await page.goto('/');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${account.slug}$`));
}

/* An isolated workspace: an admin (the workspace creator) and a plain member,
   one public project, one overdue task (member-assigned) and one upcoming one. */
async function setupDashboardWorkspace(run) {
  const slug = `dash-${run}`;
  const admin = { email: `dash-admin-${run}@e2e.local`, password: PASSWORD, name: 'Dash Admin', ip: clientIp(run, 'admin'), slug };
  const { client: adminClient } = await createAccount(BASE_URL, run, 'dash-admin', 'Dash Admin', { workspace: slug });

  const member = { email: `dash-member-${run}@e2e.local`, password: PASSWORD, name: 'Dash Member', ip: clientIp(run, 'member'), slug };
  const memberClient = apiClient(BASE_URL, { name: 'member', ip: member.ip });
  await memberClient.post('/api/auth/signup', { name: member.name, email: member.email, password: PASSWORD });
  const invite = await adminClient.post(`/api/workspaces/${slug}/invites`, { emails: [member.email], role: 'member' });
  expect(invite.status, 'invite created').toBe(201);
  const accept = await memberClient.post(`/api/invites/${inviteToken(invite.data.invites[0].url)}/accept`, {});
  expect(accept.status, 'invite accepted').toBeLessThan(300);

  const got = await adminClient.get(`/api/workspaces/${slug}`);
  expect(got.status, 'workspace GET').toBe(200);
  const memberUserId = (await memberClient.get('/api/auth/me')).data.user.id;
  const doc = JSON.parse(JSON.stringify(got.data.doc));
  const memberId = got.data.memberId;
  const projectId = 'p_dash_fixture';
  doc.data.projects.push({
    id: projectId,
    key: 'dash-fix',
    name: `Dash Fixture ${run}`,
    icon: 'map',
    color: 'indigo',
    status: 'active',
    teams: [],
    lead: memberId,
    due: null,
    start: null,
    fav: false,
    members: [memberId],
    desc: '',
    milestones: [],
    last: 0,
    private: false,
    perms: {},
  });
  doc.data.projOrder = [...(doc.data.projOrder || []), projectId];
  const task = (id, key, title, due) => ({
    id,
    key,
    project: projectId,
    title,
    status: 'todo',
    assignee: memberId,
    assignees: [memberUserId],
    priority: 'medium',
    due,
    start: null,
    labels: [],
    subtasks: [],
    attachments: [],
    deps: [],
    desc: '',
    estimate: null,
    created: 0,
    updated: 0,
    order: 1,
    fav: false,
    recur: null,
  });
  doc.data.tasks = [task('t_dash_overdue', 'DASH-101', 'Overdue dashboard row', isoDay(-3)), task('t_dash_upcoming', 'DASH-102', 'Upcoming dashboard row', isoDay(2))];
  const put = await adminClient.put(`/api/workspaces/${slug}`, { revision: got.data.revision, doc });
  if (put.status !== 200) throw new Error(`dashboard fixture PUT failed: ${put.status} ${JSON.stringify(put.data)?.slice(0, 300)}`);
  return { slug, admin, member, projectId };
}

test('admin sees the four-panel dashboard, a task row opens the drawer; member is blocked and sees My access', async ({ browser }) => {
  const run = newRunId();
  const { slug, admin, member } = await setupDashboardWorkspace(run);

  /* --- admin: nav entry + four panels + drawer deep link --- */
  const adminCtx = await browser.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { 'x-forwarded-for': admin.ip } });
  const adminPage = await adminCtx.newPage();
  await signIn(adminPage, admin);

  await expect(adminPage.locator(`.sitem[data-r='dashboard']`)).toBeVisible();
  await adminPage.locator(`.sitem[data-r='dashboard']`).click();
  await expect(adminPage).toHaveURL(new RegExp(`/w/${slug}/dashboard$`));
  for (const h of ['Overdue', 'Load per member', 'Upcoming', 'Recent activity']) {
    await expect(adminPage.locator('.panel-h h2', { hasText: h })).toBeVisible();
  }
  const overdueRow = adminPage.locator(`.mini[data-a='openTask']`, { hasText: 'Overdue dashboard row' });
  await expect(overdueRow).toBeVisible();
  await overdueRow.click();
  await expect(adminPage).toHaveURL(new RegExp(`/w/${slug}/task/DASH-101$`));
  await expect(adminPage.locator('.drawer')).toBeVisible();
  await adminCtx.close();

  /* --- member: the server 403 is the control; the URL visit surfaces it --- */
  const memberCtx = await browser.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { 'x-forwarded-for': member.ip } });
  const memberPage = await memberCtx.newPage();
  await signIn(memberPage, member);
  await expect(memberPage.locator(`.sitem[data-r='dashboard']`)).toHaveCount(0); // UX gate: hidden nav
  await memberPage.goto(`/w/${slug}/dashboard`);
  await expect(memberPage.locator('.fullstate')).toBeVisible();
  await expect(memberPage.getByText('Only workspace admins can do that')).toBeVisible();

  /* --- member: Settings › My access renders their own reachable list --- */
  await memberPage.locator(`button.sitem[data-r='settings']`).first().click();
  await memberPage.locator(`[data-a='go'][data-r='settings'][data-sec='my-access']`).click();
  await expect(memberPage.getByText('Projects you can reach, and why — computed by the server.')).toBeVisible();
  const block = memberPage.locator('.set-body .sblock');
  await expect(block.locator('.row', { hasText: `Dash Fixture ${run}` })).toBeVisible();
  await expect(block.locator(`.row:has-text("Dash Fixture ${run}") .badge`)).toHaveText('Everyone'); // public project → reason 'everyone' (the Phase 52 funnel)
  await memberCtx.close();
});
