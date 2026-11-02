/* TFA-MAIL: security alert emails on 2FA factor changes. Real server, real
   SQLite, real SMTP message built by mailer.js — captured by a minimal SMTP
   sink (same pattern as test/due-reminders.test.mjs). Asserts the alert is
   sent fire-and-forget on: first-ever enable (legacy route), add-factor
   enable, factor removal, and full disable — with the factor name, the
   caller IP, and NEVER on failed attempts. Plaintext TOTP secrets come from
   the enroll responses (the DB only ever stores encrypted envelopes). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { signup, startServer, withDb, client } from './helpers/server.mjs';
import { totpAt } from '../totp.js';

const GOOD = 'correct-horse-9';
const EMAIL = 'tfa-alert@test.local';

let server;
let tempDir;

/* ---------------------------- harness helpers ---------------------------- */

function fakeSmtp() {
  const messages = [];
  const srv = net.createServer(sock => {
    sock.write('220 test ESMTP\r\n');
    let buffer = '';
    let inData = false;
    let current = null;
    sock.on('data', chunk => {
      buffer += chunk.toString();
      let idx;
      while ((idx = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            messages.push(current.join('\n'));
            current = null;
            sock.write('250 OK\r\n');
          } else if (current) {
            current.push(line.startsWith('..') ? line.slice(1) : line);
          }
        } else if (/^EHLO/i.test(line)) {
          sock.write('250-test\r\n250 OK\r\n');
        } else if (/^DATA/i.test(line)) {
          inData = true;
          current = [];
          sock.write('354 go\r\n');
        } else if (/^QUIT/i.test(line)) {
          sock.write('221 bye\r\n');
          sock.end();
        } else {
          sock.write('250 OK\r\n');
        }
      }
    });
  });
  return new Promise(resolve => {
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port, messages }));
  });
}

function textPart(raw) {
  const lines = raw.split('\n');
  const i = lines.indexOf('Content-Type: text/plain; charset=UTF-8');
  const body = [];
  for (let j = i + 2; j < lines.length && !lines[j].startsWith('--'); j++) body.push(lines[j]);
  return Buffer.from(body.join(''), 'base64').toString('utf8');
}

/* Alerts are fire-and-forget: poll the sink instead of sleeping a fixed time. */
async function waitFor(smtp, count, ms = 5000) {
  const deadline = Date.now() + ms;
  while (smtp.messages.length < count && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 25));
  }
  return smtp.messages.length;
}

const factors = () =>
  withDb(server.dbPath, db => db.prepare('select * from totp_factors order by created_at').all());
/* Replay-guard reset (same pattern as tfa-multi-factor.test.mjs): lets a fresh
   current-window code verify again without sleeping 30s between tests. */
const resetReplay = () =>
  withDb(server.dbPath, db => db.prepare('update totp_factors set last_step = 0').run());

/* ------------------------------- fixtures -------------------------------- */

let smtp;
let c;
let primarySecret; // plaintext from the legacy enroll response (test C)

before(async () => {
  smtp = await fakeSmtp();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-tfa-alert-'));
  server = await startServer({
    dataDir: tempDir,
    env: {
      MASTER_KEY: 'projects-tfa-alert-key',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(smtp.port),
      SMTP_REQUIRE_TLS: 'false',
      MAIL_FROM: 'noreply@test.local',
      APP_URL: 'http://app.test',
    },
  });
  await signup(server.base, { name: 'Owner', email: EMAIL, password: GOOD });
  c = client(server.base, EMAIL);
  const logged = await c.post('/api/auth/login', { email: EMAIL, password: GOOD });
  assert.equal(logged.status, 200, 'owner login');
});

after(async () => {
  if (smtp) smtp.srv.close();
  await server?.stop();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

/* -------------------------------- tests ---------------------------------- */

test('A: no alert before anything happens', () => {
  assert.equal(smtp.messages.length, 0, 'no email on a plain login/signup');
});

test('B: failed enable attempts send nothing', async () => {
  const before = smtp.messages.length;
  const bad = await c.post('/api/auth/tfa/enable', { code: '000000' });
  assert.equal(bad.status, 409, 'no pending enrollment');
  await new Promise(r => setTimeout(r, 200));
  assert.equal(smtp.messages.length, before, 'no alert on failed attempts');
});

test('C: first-ever enable sends an added alert with Primary authenticator + IP', async () => {
  const enroll = await c.post('/api/auth/tfa/enroll', { currentPassword: GOOD });
  assert.equal(enroll.status, 200, `enroll ${enroll.status}: ${JSON.stringify(enroll.data)}`);
  const { secret } = enroll.data;
  assert.ok(secret, 'secret returned');
  primarySecret = secret;
  const enable = await c.post('/api/auth/tfa/enable', { code: totpAt(secret, Date.now() / 1000) });
  assert.equal(enable.status, 200);

  assert.equal(await waitFor(smtp, 1), 1, 'one alert');
  const raw = smtp.messages[0];
  const text = textPart(raw);
  assert.match(raw, /^Subject: Security alert: Two-factor factor added/m);
  assert.ok(text.includes('Factor: Primary authenticator'), 'humanized primary factor name');
  assert.ok(text.includes('IP address: 127.0.0.1'), 'caller IP included');
  assert.ok(text.includes('UTC'), 'timestamp included');
});

test('D: add-factor enable sends an added alert with the custom label', async () => {
  resetReplay();
  const enroll = await c.post('/api/auth/tfa/factors/enroll', {
    currentPassword: GOOD,
    code: totpAt(primarySecret, Date.now() / 1000), // step-up from the existing factor
    label: 'Work phone',
  });
  assert.equal(enroll.status, 200, `enroll ${enroll.status}: ${JSON.stringify(enroll.data)}`);
  const { secret, stagedId } = enroll.data;
  const enable = await c.post('/api/auth/tfa/factors/enable', { code: totpAt(secret, Date.now() / 1000), stagedId });
  assert.equal(enable.status, 200, `enable ${enable.status}: ${JSON.stringify(enable.data)}`);

  assert.equal(await waitFor(smtp, 2), 2, 'second alert');
  const raw = smtp.messages[1];
  const text = textPart(raw);
  assert.match(raw, /^Subject: Security alert: Two-factor factor added/m);
  assert.ok(text.includes('Factor: Work phone'), 'custom label in the body');
});

test('E: removing the second factor sends a removed alert', async () => {
  resetReplay();
  const second = factors()[1];
  const remove = await c.post('/api/auth/tfa/factors/remove', {
    currentPassword: GOOD,
    code: totpAt(primarySecret, Date.now() / 1000), // survivor-factor code, fresh window
    factorId: second.id,
  });
  assert.equal(remove.status, 200);

  assert.equal(await waitFor(smtp, 3), 3, 'third alert');
  const raw = smtp.messages[2];
  const text = textPart(raw);
  assert.match(raw, /^Subject: Security alert: Two-factor factor removed/m);
  assert.ok(text.includes('Factor: Work phone'), 'removed factor named');
});

test('F: disabling 2FA entirely sends a disabled alert', async () => {
  resetReplay();
  const disable = await c.post('/api/auth/tfa/disable', {
    currentPassword: GOOD,
    code: totpAt(primarySecret, Date.now() / 1000),
  });
  assert.equal(disable.status, 200);

  assert.equal(await waitFor(smtp, 4), 4, 'fourth alert');
  const raw = smtp.messages[3];
  assert.match(raw, /^Subject: Security alert: Two-factor authentication disabled/m);
});

test('G: no alert replays after the fact', async () => {
  await new Promise(r => setTimeout(r, 200));
  assert.equal(smtp.messages.length, 4, 'exactly one alert per committed change');
});
