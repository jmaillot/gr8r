/* =====================================================================
   LINK-01 (plan 23-01): every notification email links to the task —
   APP_URL + /w/:slug/task/:key, key resolved at email-build time from
   the workspace doc, workspace-root fallback when the task is gone
   (deleted between doc write and email build), boot-guard enforcement,
   and the URL embedded verbatim in both message bodies.

   server.js cannot be imported by a test (it boots on load), so the
   URL-builder half is extracted from the source text (the house static-
   extraction pattern, cf. test/error-codes.test.mjs) and evaluated
   against fixtures; the message-embedding half drives the real
   createMailer().sendNotif() against a throwaway in-process SMTP peer —
   no network beyond loopback, no credentials.
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { test } from 'node:test';
import { createMailer } from '../mailer.js';
import { ROOT } from './helpers/server.mjs';

const serverSource = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

/* queueNotifEmails' source slice: from its declaration to the next
   top-level function. */
const fnStart = serverSource.indexOf('function queueNotifEmails');
assert.ok(fnStart !== -1, 'queueNotifEmails moved — update this extraction');
const fnEnd = serverSource.indexOf('\nfunction ', fnStart);
const queueSource = serverSource.slice(fnStart, fnEnd);

/* The per-notification url expression, extracted and compiled. The test
   asserts the SHAPE the plan locks: APP_URL (never appBase(req)/Host),
   wsRow.slug, encodeURIComponent'd task key, workspace-root fallback. */
function notifUrlBuilder() {
  const m = queueSource.match(/const url =([\s\S]*?);\n\s*MAILER\.sendNotif/);
  assert.ok(m, 'queueNotifEmails no longer builds a per-notification url');
  return new Function('task', 'wsRow', 'APP_URL', `return (${m[1].trim()});`);
}

const APP_URL = 'https://projects.example.com';

test('the notification URL is APP_URL + /w/:slug/task/:key with the encodeURIComponent’d key', () => {
  const url = notifUrlBuilder()({ id: 't1', key: 'K-12' }, { slug: 'acme' }, APP_URL);
  assert.equal(url, `${APP_URL}/w/acme/task/K-12`);
});

test('the notification URL encodes the key (a reserved character cannot break the path)', () => {
  const url = notifUrlBuilder()({ id: 't2', key: 'K 1/2' }, { slug: 'acme' }, APP_URL);
  assert.equal(url, `${APP_URL}/w/acme/task/K%201%2F2`);
});

test('an unresolvable task falls back to the workspace root — never /task/undefined', () => {
  const build = notifUrlBuilder();
  assert.equal(build(null, { slug: 'acme' }, APP_URL), `${APP_URL}/w/acme/`);
  assert.equal(build({ id: 't3' }, { slug: 'acme' }, APP_URL), `${APP_URL}/w/acme/`);
});

test('queueNotifEmails sources the notification URL from APP_URL, never appBase(req)/Host', () => {
  assert.ok(!queueSource.includes('${base}/`'), 'the app-root URL construction survived in queueNotifEmails');
  assert.ok(queueSource.includes('APP_URL'), 'the notification URL must be built from APP_URL');
  assert.ok(!/appBase\(/.test(queueSource), 'queueNotifEmails must not fall back to the request Host via appBase');
});

test('the boot guard message covers notification links as well as invitation links', () => {
  const guardStart = serverSource.indexOf('if (MAILER.enabled && !APP_URL)');
  assert.ok(guardStart !== -1, 'the APP_URL boot guard moved');
  const guard = serverSource.slice(guardStart, guardStart + 800);
  assert.match(guard, /notification/i, 'the boot-guard message must mention notification links');
  assert.match(guard, /invitation/i, 'the boot-guard message must keep mentioning invitation links');
});

/* ---------- the URL lands in both message bodies (real mailer, loopback SMTP) ---------- */

/* A throwaway SMTP peer: greets, advertises nothing fancy (no STARTTLS, no
   AUTH), accepts the message and captures the DATA payload. */
function fakeSmtp() {
  const payloads = [];
  let current = null;
  let inData = false;
  const server = net.createServer(socket => {
    socket.write('220 test ESMTP\r\n');
    let buf = '';
    socket.on('data', chunk => {
      buf += chunk.toString('utf8');
      let idx;
      while ((idx = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            payloads.push(current);
            current = null;
            socket.write('250 ok\r\n');
          } else current += line + '\r\n';
          continue;
        }
        const cmd = line.toUpperCase();
        if (cmd.startsWith('EHLO') || cmd.startsWith('HELO')) socket.write('250-test\r\n250 8BITMIME\r\n');
        else if (cmd.startsWith('DATA')) {
          inData = true;
          current = '';
          socket.write('354 go\r\n');
        } else if (cmd.startsWith('QUIT')) {
          socket.write('221 bye\r\n');
          socket.end();
        } else socket.write('250 ok\r\n');
      }
    });
  });
  return {
    payloads,
    listen: () => new Promise(resolve => server.listen(0, '127.0.0.1', resolve)),
    port: () => server.address().port,
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

test('sendNotif embeds the task URL verbatim in the text and HTML bodies', async () => {
  const smtp = fakeSmtp();
  await smtp.listen();
  try {
    const mailer = createMailer({
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(smtp.port()),
      SMTP_SECURE: 'false',
      SMTP_REQUIRE_TLS: 'false',
      MAIL_FROM: 'gr8r@test.local',
    });
    assert.ok(mailer.enabled, 'the fake-SMTP config must enable the mailer');
    const url = `${APP_URL}/w/acme/task/K-12`;
    await mailer.sendNotif({
      to: 'watcher@test.local',
      workspace: 'Acme',
      by: 'Alice',
      task: 'Deep Link Target',
      snippet: '',
      kind: 'comment',
      url,
    });
    assert.equal(smtp.payloads.length, 1, 'exactly one message must be accepted');
    const raw = smtp.payloads[0];
    const parts = [...raw.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/g)].map(m =>
      Buffer.from(m[1].replace(/\r\n/g, ''), 'base64').toString('utf8'),
    );
    assert.equal(parts.length, 2, 'the message must carry text and HTML bodies');
    const [textBody, htmlBody] = parts;
    assert.ok(textBody.includes(url), 'the text body must embed the task URL verbatim');
    assert.ok(htmlBody.includes(`href="${url}"`), 'the HTML body must embed the task URL as the link target');
  } finally {
    await smtp.close();
  }
});
