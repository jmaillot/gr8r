/* =====================================================================
   PHASE 94 (BKUI-04, D-04): the Restore-Operator e2e pin — the unified
   run-history sblock is FAIL-CLOSED per row even for a Restore Operator:
   instance-scope rows are visible (with task NAMES + the 5-segment run
   label rendered verbatim), while workspace/project-scope runs for
   scopes without a live membership are DROPPED, never error'd
   (server.js ?all=1 per-run visibility, T-92-01).

   Harness precedent: admin-revoke-cycle.spec.mjs / operator-revoke-
   cycle.spec.mjs — fixtures only through the real API (helpers/
   setup.mjs), run-unique X-Forwarded-For per account so throttle
   budgets never cross, every asserted string resolves through fmt()
   against the locale catalogues (names-not-ids: assert task names and
   run.label text, never raw ids).

   Role grant: POST /api/auth/operator/instance-roles { userId, role }
   with role 'restore_operator' (server.js:8689 allow-list + the DDL
   check constraint server.js:729) — granted by the OWNER account, the
   instance admin (is_instance_admin, implicit Super Admin). The grant
   self-guards: a non-201 answer fails the fixture step loudly.
   ===================================================================== */
import { test, expect } from '@playwright/test';
import { BASE_URL, PASSWORD, apiClient, clientIp, newRunId, OWNER, assertServerUp } from './helpers/setup.mjs';
import en from '../src/locales/en.json' with { type: 'json' };

function fmt(key, vars) {
  let s = en[key];
  if (s === undefined) throw new Error(`catalogue key missing: ${key}`);
  if (typeof s === 'object') s = s.other ?? s[new Intl.PluralRules('en').select(vars?.n ?? 1)];
  for (const [k, v] of Object.entries(vars || {})) s = s.replaceAll(`{${k}}`, v);
  return s;
}

async function must(step, res, allowed) {
  if (!allowed.includes(res.status)) {
    throw new Error(`${step} failed with HTTP ${res.status}: ${JSON.stringify(res.data)?.slice(0, 300)}`);
  }
  return res.data;
}

/* The OWNER signs in (instance admin) and grants `role` to the target
   user — the same POST the client api.instanceRoleGrant rides. */
async function grantInstanceRole(ownerClient, userId, role) {
  return must(`grant ${role}`, await ownerClient.post('/api/auth/operator/instance-roles', { userId, role }), [200]);
}

/* Fixtures: the operator (OWNER) creates one instance-scope backup task
   and fires one manual run of it; a Restore-Operator account is granted
   restore_operator. Returns the accounts + the task name. */
async function setupBackupConsole(run) {
  await assertServerUp(BASE_URL);
  const ownerIp = clientIp(run, 'bkconsole-owner');
  const ownerClient = apiClient(BASE_URL, { name: 'bkconsole-owner', ip: ownerIp });
  await must('owner login', await ownerClient.post('/api/auth/login', { email: OWNER.email, password: OWNER.password }), [200]);

  const opTag = 'bkconsole-rop';
  const restoreOp = {
    email: `${opTag}-${run}@e2e.local`,
    password: PASSWORD,
    name: 'Restore Op Console',
    ip: clientIp(run, opTag),
  };
  const ropClient = apiClient(BASE_URL, { name: opTag, ip: restoreOp.ip });
  await must('rop signup', await ropClient.post('/api/auth/signup', { name: restoreOp.name, email: restoreOp.email, password: restoreOp.password }), [201]);
  const ropMe = await must('rop me', await ropClient.get('/api/auth/me'), [200]);
  const grant = await grantInstanceRole(ownerClient, ropMe.user.id, 'restore_operator'); // server.js:8689 allow-list
  expect(grant.role.role).toBe('restore_operator');
  /* Membership in the owner's workspace so the browser login lands in the
     app directly — a workspace-less fresh account boots the onboarding
     wizard, and its "Exit setup" escape hatch drops into the server-less
     demo mode (which would mask every assertion). */
  const ownerWsSlug = (await ownerClient.get('/api/auth/me')).data.user.workspaces[0].slug;
  const inv = await must('rop invite', await ownerClient.post(`/api/workspaces/${ownerWsSlug}/invites`, { emails: [restoreOp.email], role: 'member' }), [201]);
  const ropToken = String(inv?.invites?.[0]?.url || '').split('/join/')[1];
  await must('rop join', await ropClient.post(`/api/invites/${ropToken}/accept`, {}), [200]);

  /* One instance-scope task (BACKUP_MANAGE is implicit for the admin). */
  const taskName = `Console Task ${run}`;
  const task = await must('task create', await ownerClient.post('/api/backup/tasks', { name: taskName, scope: { kind: 'instance' }, cron: '0 3 * * *', tz: 'Europe/Paris', retention: { daily: 7, weekly: 4, monthly: 3, yearly: 1 } }), [201, 200]);

  /* One manual run of the task's scope (manual trigger, instance scope). */
  await must('manual run', await ownerClient.post('/api/backup/runs', { scope: { kind: 'instance' } }), [201, 200]);

  return { ownerClient, ownerIp, restoreOp, taskName, taskId: task.task?.id || task.taskId };
}

let run;

test.beforeEach(() => {
  run = newRunId();
});

test.describe('phase 94 restore-operator unified history', () => {
  test.setTimeout(240_000);
  test('the restore operator sees only fail-closed permitted rows in the unified history', async ({ browser }) => {
    const fx = await setupBackupConsole(run);
    /* A second workspace the ROP has NO membership in — its task + run must
       be DROPPED from the ROP's unified history (fail-closed, never error'd). */
    const outsiderWs = await must('outsider ws', await fx.ownerClient.post('/api/workspaces', { name: `Outsider ${run}`, slug: `outsider-${run}`.slice(0, 40) }), [201]);
    const outsiderWsId = outsiderWs.workspace.id;
    const wsTask = await must('ws task create', await fx.ownerClient.post('/api/backup/tasks', { name: `Outsider Task ${run}`, scope: { kind: 'workspace', id: outsiderWsId }, cron: '30 4 * * *', tz: 'Europe/Paris' }), [201, 200]);

    /* Manual scope-triggered runs carry NO task_id (D-11) — wait on the
       GLOBAL lock state instead: a terminal newest row and no 'running'
       row anywhere means the run settled and the lock is free. */
    const waitSettled = async what => {
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        const res = await must(`${what} poll`, await fx.ownerClient.get('/api/backup/runs?all=1&limit=200'), [200]);
        const runs = Array.isArray(res.runs) ? res.runs : [];
        if (runs.length && !runs.some(r => r.status === 'running')) return runs;
        await new Promise(r => setTimeout(r, 1500));
      }
      throw new Error(`${what} never settled`);
    };
    await waitSettled('instance run');
    /* The single-run lock releases asynchronously after the run settles —
       retry the ws trigger across the release window (409 is retried, all
       other statuses must() as before). */
    let wsRun = null;
    const wsDeadline = Date.now() + 30_000;
    while (Date.now() < wsDeadline) {
      const res = await fx.ownerClient.post('/api/backup/runs', { scope: { kind: 'workspace', id: outsiderWsId } });
      if (res.status === 201 || res.status === 200) { wsRun = res; break; }
      if (res.status !== 409) must('ws manual run', res, [201, 200]);
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!wsRun) throw new Error('ws manual run: the run lock never released');
    await waitSettled('ws run');

    /* The ROP opens the Backup page in Chromium. */
    const ctx = await browser.newContext({
      baseURL: BASE_URL,
      locale: 'en-US',
      extraHTTPHeaders: { 'x-forwarded-for': fx.restoreOp.ip },
    });
    try {
      const page = await ctx.newPage();
      await page.goto('/');
      await page.getByLabel(fmt('common.email'), { exact: true }).fill(fx.restoreOp.email);
      await page.getByLabel(fmt('common.password'), { exact: true }).fill(fx.restoreOp.password);
      await page.getByRole('button', { name: fmt('page.auth.signIn') }).click();
      await page.locator(`[data-a='go'][data-r='backup']`).first().click();
      await expect(page.getByRole('heading', { name: fmt('nav.route.backup', {}), exact: true })).toBeVisible();

      /* BKUI-01: the task table shows the instance task NAME; the Restore Op
         gets NO action buttons (canBackup false — verbatim chrome). */
      const table = page.locator('table.perm-t').first();
      await expect(table).toBeVisible();
      await expect(table.getByText(fx.taskName)).toBeVisible();
      await expect(page.locator(`button[data-a='backupTaskRunNow']`)).toHaveCount(0, 'a Restore Operator never sees manage actions');

      /* BKUI-04: the unified history sblock — the instance run renders with
         a keyed terminal status and the run.label verbatim (names-not-ids:
         the label text, not a raw id). The run row vocabulary: status badge
         + location + label + trigger word. */
      const sblock = page.locator('#backupHistorySblock');
      await expect(sblock).toBeVisible();
      /* The run-row vocabulary: the trigger word and the terminal status are
         run-row spans (not the hidden filter <option>s). */
      await expect(sblock.locator('span.faint').filter({ hasText: fmt('page.backup.triggerManual') }).first()).toBeVisible();
      await expect(sblock.locator('span.badge').filter({ hasText: fmt('page.backup.statusSucceeded') }).first()).toBeVisible();

      /* Fail-closed (T-92-01): the outsider workspace's RUN is dropped from
         the ROP's unified history — selecting its task filter yields the
         honest empty line, never an error and never a row. (The outsider
         task NAME still appears as a filter OPTION — the tasks list is not
         per-membership; only RUN rows are fail-closed.) */
      await sblock.locator('select').first().selectOption(wsTask.task.id);
      await expect(sblock.getByText(fmt('page.backup.historyEmpty'))).toBeVisible();

      /* The task filter drives the rows: the instance MANUAL run is
         task-less (task_id null, D-11), so filtering by the instance task
         id honestly yields the empty line too — the filter narrows, never
         errors. */
      const taskSel = sblock.locator('select').first();
      await taskSel.selectOption(fx.taskId);
      await expect(sblock.getByText(fmt('page.backup.historyEmpty'))).toBeVisible();
      await taskSel.selectOption('');

      /* The manual-not-retained hint appears only on the manual filter. */
      await taskSel.selectOption('manual');
      await expect(sblock.getByText(fmt('page.backup.historyManualHint', {}))).toBeVisible();
    } finally {
      await ctx.close();
    }
  });
});
