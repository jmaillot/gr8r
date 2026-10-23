/* Cold-start boot regression for the default admin account (G-08-1):
   a boot with NO ADMIN_EMAIL / ADMIN_PASSWORD env vars must reach the HTTP
   listener (the fallback email admin@example.com passes emailOk and the
   generated-password branch runs), while an explicitly invalid ADMIN_EMAIL
   still fails fast before listening — the validation was never weakened. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from './helpers/server.mjs';

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
    assert.match(server.output(), /  generated password: /,
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
