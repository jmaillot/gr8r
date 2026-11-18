/* Shared fixture helpers for the pixel-alignment spec (keeps the spec
   file free of server plumbing; follows setup.mjs conventions — real
   API through the funnel, no direct DB writes). */
import { createAccount } from './setup.mjs';

export async function createAccountAndSeed(base, run, ws, projId, taskId, mkTask) {
  const { account, client } = await createAccount(base, run, 'align', 'Align Owner', { workspace: ws });
  const got = await client.get(`/api/workspaces/${ws}`);
  if (got.status !== 200) throw new Error(`workspace GET failed with HTTP ${got.status}`);
  const doc = got.data.doc;
  doc.data.projects = [
    ...(doc.data.projects || []),
    {
      id: projId,
      key: 'align-a',
      name: `Align ${run}`,
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
  doc.data.projOrder = [...(doc.data.projOrder || []), projId];
  const task = mkTask;
  /* My Tasks filters by assignee AND canSee — assign to the account's member
     id (got.data.memberId, the dashboard-spec convention) so both pass. */
  task.assignees = [got.data.memberId];
  doc.data.tasks = [...(doc.data.tasks || []), task];
  const put = await client.put(`/api/workspaces/${ws}`, { revision: got.data.revision, doc });
  if (put.status !== 200) throw new Error(`doc PUT failed with HTTP ${put.status}`);
  return account;
}

export async function loginByForm(page, base, run) {
  await page.getByLabel('Email').fill(`align-${run}@e2e.local`);
  await page.getByLabel('Password', { exact: true }).fill('e2e-password-1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/w\//);
}
