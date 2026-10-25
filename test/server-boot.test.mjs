/* Cold-start boot regression for the default admin account (G-08-1):
   a boot with NO ADMIN_EMAIL / ADMIN_PASSWORD env vars must reach the HTTP
   listener (the fallback email admin@example.com passes emailOk and the
   generated-password branch runs), while an explicitly invalid ADMIN_EMAIL
   still fails fast before listening — the validation was never weakened. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { ROOT, startServer } from './helpers/server.mjs';

test('cold start with no ADMIN_EMAIL/ADMIN_PASSWORD boots with the admin@example.com fallback', async () => {
  const server = await startServer({ env: { ADMIN_EMAIL: undefined, ADMIN_PASSWORD: undefined } });
  try {
    /* startServer resolving means /api/config responded — the listener is open,
       so bootstrap (ensureAdmin included) did not abort the process. */
    const users = new DatabaseSync(server.dbPath)
      .prepare('select email, name from users order by email')
      .all();
    /* BASE_ENV still carries ADMIN_NAME ('Owner'); only the two undefined vars
       are stripped, so assert the email — the emailOk gate under test. */
    assert.deepEqual(users.map(user => user.email), ['admin@example.com'],
      'the bootstrap admin row carries the emailOk-valid fallback email');

    /* ADMIN_PASSWORD was falsy, so ensureAdmin took the generated-password
       branch; assert only the line's presence, never the secret value. */
    assert.match(server.output(), / {2}generated password: /,
      'the boot log announces a generated admin password');
  } finally {
    await server.stop();
  }
});

test('negative control: an explicitly invalid ADMIN_EMAIL still fails fast at boot', async () => {
  /* The fix changed only the default, not the validation: admin@localhost has no
     dot in the domain, so emailOk rejects it and bootstrap exits before listen. */
  await assert.rejects(startServer({ env: { ADMIN_EMAIL: 'admin@localhost' } }),
    /Enter a valid email address|did not start/,
    'an invalid explicit ADMIN_EMAIL must abort the boot');
});

/* WR-04: invite links are built from APP_URL; with the mail enabled and APP_URL
   empty, appBase() would fall back to the request Host header — a hostile Host
   emails invitation links pointing at the attacker's domain. The boot gate makes
   APP_URL mandatory whenever SMTP_HOST is configured; one site, before listen. */
test('boot gate: SMTP_HOST without APP_URL refuses to start and names both variables', async () => {
  await assert.rejects(startServer({ env: { SMTP_HOST: 'smtp.example.net', MAIL_FROM: 'invites@test.local', APP_URL: undefined } }),
    /did not start|APP_URL/,
    'a mail-enabled boot without APP_URL must abort before listening');
  /* The harness only reports the summary error message; spawn the real boot once to
     capture the operator's stderr and the exit code directly. */
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'gr8r-gate-'));
  try {
    const result = spawnSync(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: '47192',
        DATA_DIR: dir,
        SMTP_HOST: 'smtp.example.net',
        MAIL_FROM: 'invites@test.local',
        APP_URL: '',
      },
      encoding: 'utf8',
      timeout: 15_000,
    });
    assert.equal(result.status, 1, 'the process exits 1 before opening the listener');
    assert.match(result.stderr, /SMTP_HOST/, 'the message names SMTP_HOST');
    assert.match(result.stderr, /APP_URL/, 'the message names APP_URL');
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});

test('boot gate positive control: mail enabled with APP_URL set boots and answers /api/config', async () => {
  const server = await startServer({
    env: { SMTP_HOST: 'smtp.example.net', MAIL_FROM: 'invites@test.local', APP_URL: 'https://gr8r.example.net' },
  });
  try {
    const res = await fetch(`${server.base}/api/config`);
    assert.ok(res.ok);
    const data = await res.json();
    assert.equal(data.mail, true, 'the mailer is enabled behind the gate');
    assert.equal(data.url, 'https://gr8r.example.net', 'appBase() serves APP_URL, never the request host');
    assert.match(server.output(), /invite email: enabled via smtp\.example\.net/);
  } finally {
    await server.stop();
  }
});
