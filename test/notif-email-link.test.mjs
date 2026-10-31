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

/* ---------- G-23-1: byline/recipient resolution from the authority rows ----------

   The stored workspace doc never persists account-backed member profiles
   (roster authority lives in memberships+users, rebuilt on read via
   syncProfiles). queueNotifEmails must therefore resolve the byline and the
   recipient email from the authority rows first, keeping the doc-profile map
   as the fallback for doc-only members and 'Un membre' as the last resort.
   Same static-extraction pattern as the URL tests above. */

test('queueNotifEmails sources names/emails from the authority rows (memberships ⋈ users)', () => {
  assert.ok(
    queueSource.includes('from memberships m join users u on u.id = m.user_id where m.workspace_id = ?'),
    'the authority query must live inside queueNotifEmails',
  );
});

function authorityMapBuilder() {
  const m = queueSource.match(/const authority =([\s\S]*?);\n/);
  assert.ok(m, 'queueNotifEmails no longer builds an authority map');
  return new Function('db', 'wsRow', `return (${m[1].trim()});`);
}

function bylineResolver() {
  const m = queueSource.match(/const by =([\s\S]*?);\n/);
  assert.ok(m, 'queueNotifEmails no longer resolves the byline');
  return new Function('authority', 'profiles', 'n', `return (${m[1].trim()});`);
}

function recipientResolver() {
  const m = queueSource.match(/const to =([\s\S]*?);\n/);
  assert.ok(m, 'queueNotifEmails no longer resolves the recipient email');
  return new Function('authority', 'profile', 'emailByUserId', 'emailByMemberEmail', 'n', `return (${m[1].trim()});`);
}

const AUTH_ROWS = [{ member_id: 'm_acc', user_id: 'u1', name: 'Alice', email: 'alice@test.local' }];
const mkAuthority = rows => new Map(rows.map(r => [r.member_id, r]));

test('the authority map is keyed by member_id and built from the workspace-scoped query', () => {
  const prepared = [];
  const db = { prepare: sql => { prepared.push(sql); return { all: () => AUTH_ROWS }; } };
  const authority = authorityMapBuilder()(db, { id: 'ws1' });
  assert.ok(prepared[0].includes('where m.workspace_id = ?'), 'the query must be workspace-scoped');
  assert.deepEqual([...authority.keys()], ['m_acc']);
  assert.equal(authority.get('m_acc').name, 'Alice');
});

test('byline: an account-backed author resolves to their account name even with an empty doc roster', () => {
  assert.equal(bylineResolver()(mkAuthority(AUTH_ROWS), new Map(), { by: 'm_acc' }), 'Alice');
});

test('byline: a doc-only member still resolves from the doc profile', () => {
  const profiles = new Map([['m_doc', { id: 'm_doc', name: 'Bob Doc' }]]);
  assert.equal(bylineResolver()(new Map(), profiles, { by: 'm_doc' }), 'Bob Doc');
});

test('byline: authority wins over the doc profile; neither → the Un membre fallback', () => {
  const profiles = new Map([['m_acc', { id: 'm_acc', name: 'Stale Doc Name' }]]);
  assert.equal(bylineResolver()(mkAuthority(AUTH_ROWS), profiles, { by: 'm_acc' }), 'Alice');
  assert.equal(bylineResolver()(new Map(), new Map(), { by: 'm_ghost' }), 'Un membre');
});

test('recipient: an account-backed recipient gets their email even when the doc profile is absent', () => {
  assert.equal(recipientResolver()(mkAuthority(AUTH_ROWS), null, new Map(), new Map(), { to: 'm_acc' }), 'alice@test.local');
});

test('recipient: a doc-only profile still resolves via userId → emailByUserId, then member email', () => {
  const emailByUserId = new Map([['u9', 'u9@test.local']]);
  const emailByMemberEmail = new Map([['m_doc2', 'direct@test.local']]);
  assert.equal(recipientResolver()(new Map(), { userId: 'u9' }, emailByUserId, new Map(), { to: 'm_doc' }), 'u9@test.local');
  assert.equal(recipientResolver()(new Map(), null, new Map(), emailByMemberEmail, { to: 'm_doc2' }), 'direct@test.local');
});

test('recipient: authority wins over the profile path; neither → undefined (skipped as today)', () => {
  const emailByUserId = new Map([['u1', 'stale@test.local']]);
  assert.equal(recipientResolver()(mkAuthority(AUTH_ROWS), { userId: 'u1' }, emailByUserId, new Map(), { to: 'm_acc' }), 'alice@test.local');
  assert.equal(recipientResolver()(new Map(), null, new Map(), new Map(), { to: 'm_ghost' }), undefined);
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
