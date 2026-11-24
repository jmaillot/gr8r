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
import { BASE_URL, PASSWORD, apiClient, clientIp, createAccount, newRunId, OWNER, assertServerUp } from './helpers/setup.mjs';
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

  /* One instance-scope task (BACKUP_MANAGE is implicit for the admin). */
  const taskName = `Console Task ${run}`;
  const task = await must('task create', await ownerClient.post('/api/backup/tasks', { name: taskName, scope: { kind: 'instance' }, cron: '0 3 * * *', tz: 'Europe/Paris', retention: { daily: 7, weekly: 4, monthly: 3, yearly: 1 } }), [201]);

  /* One manual run of the task's scope (manual trigger, instance scope). */
  await must('manual run', await ownerClient.post('/api/backup/runs', { kind: 'instance' }), [201, 200]);

  return { ownerClient, ownerIp, restoreOp, taskName, taskId: task.task?.id || task.taskId };
}

let run;

test.beforeEach(() => {
  run = newRunId();
});

test.describe('phase 94 restore-operator unified history', () => {
  test.setTimeout(180_000);
  /* Task 5 fills the browser assertions; the scaffold skips cleanly. */
  test.fixme('the restore operator sees only fail-closed permitted rows in the unified history', async ({ browser }) => {
    const fx = await setupBackupConsole(run);
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
      /* ...Task 5: drive the unified sblock, assert instance rows visible
         with task NAME + run.label verbatim, non-member workspace/project
         rows dropped (fail-closed), names-not-ids throughout. */
    } finally {
      await ctx.close();
    }
  });
});
