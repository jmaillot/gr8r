/* =====================================================================
   Phase 40 plan 01 — hostile-name subject hardening (SUBJ-03, D-08/D-09).

   The SMTP capture harness + decode()/waitFor helpers are copied verbatim
   from test/digest.test.mjs so byte-identity of the decoding rules is
   provable. Unit tests exercise the exported encodeWord directly; the
   tracer test drives the FULL buildDigestMessage path through a real
   sendDigest call against the throwaway loopback SMTP server.
   ===================================================================== */
import assert from 'node:assert/strict';
import net from 'node:net';
import { test } from 'node:test';
import { createMailer, encodeWord } from '../mailer.js';

/* ------------------------ throwaway SMTP capture ------------------------ */

function fakeSmtp() {
  const payloads = [];
  const smtpServer = net.createServer(socket => {
    let current = null;
    let inData = false;
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
    listen: () => new Promise(resolve => smtpServer.listen(0, '127.0.0.1', resolve)),
    port: () => smtpServer.address().port,
    close: () => new Promise(resolve => smtpServer.close(resolve)),
  };
}

/* Byte-identical copy of test/digest.test.mjs decode() (lines 160-168). */
function decode(raw) {
  const parts = [...raw.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/g)].map(m =>
    Buffer.from(m[1].replace(/\r\n/g, ''), 'base64').toString('utf8'),
  );
  const encodedWords = [...raw.matchAll(/=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/g)].map(m => Buffer.from(m[1], 'base64').toString('utf8'));
  const rawSubject = (raw.match(/^Subject: (.*)$/m) || [])[1] || '';
  const subject = encodedWords.length ? encodedWords.join('') : rawSubject;
  return { to: (raw.match(/^To: <([^>]+)>/m) || [])[1] || '', subject, text: parts[0] || '', html: parts[1] || '' };
}

const waitFor = async (smtp, n, label) => {
  const start = smtp.payloads.length;
  const deadline = Date.now() + 10_000;
  while (smtp.payloads.length < start + n && Date.now() < deadline) await new Promise(r => setTimeout(r, 100));
  assert.ok(smtp.payloads.length >= start + n, `${label}: expected ≥${n} new emails, got ${smtp.payloads.length - start}`);
  return smtp.payloads.slice(start).map(decode);
};

const mailerFor = smtp =>
  createMailer({
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: String(smtp.port()),
    SMTP_REQUIRE_TLS: 'false',
    MAIL_FROM: 'studio@test.local',
    MAIL_FROM_NAME: 'Projects Studio',
  });

/* ------------------- Task 1: end-to-end hostile tracer ------------------- */

test('SUBJ-03 tracer: CRLF workspace name through the full digest builder yields exactly ONE clean Subject line, no injected Bcc', async () => {
  const smtp = fakeSmtp();
  await smtp.listen();
  try {
    const mailer = mailerFor(smtp);
    assert.ok(mailer.enabled, 'mailer enabled against the fake SMTP server');

    try {
      await mailer.sendDigest({
        to: 'member@test.local',
        locale: 'en',
        workspace: 'name\r\nBcc: victim@x',
        wsSlug: 'ws-hostile',
        appUrl: 'http://app.test',
        dueToday: [{ key: 'K-1', title: 'Due today task' }],
        overdue: [],
      });
    } catch (err) {
      console.error('SEND ERROR:', err && err.message);
      throw err;
    }
    /* sendDigest is awaited, so the payload is already captured by the fake
       SMTP server — no waitFor polling needed (unlike digest.test.mjs where
       sends are fire-and-forget). */
    assert.equal(smtp.payloads.length, 1, 'exactly one digest email sent');
    const digest = decode(smtp.payloads[0]);
    const raw = smtp.payloads[0];
    const subjectMatches = raw.match(/^Subject: /gm) || [];
    assert.equal(subjectMatches.length, 1, 'exactly one Subject header in the raw SMTP payload');
    assert.ok(!/^Bcc:/m.test(raw), 'no Bcc: header line in the raw payload');
    assert.ok(!digest.text.includes('Bcc:'), 'no Bcc: leaks into the decoded body');
    assert.match(digest.subject, /Daily digest: 1 task/, 'subject still renders the localized frame');
  } finally {
    await smtp.close();
  }
});

/* ---------------- Task 2: D-09 hostile-name unit matrix ---------------- */

test('D-09: encodeWord strips CRLF injection — no second header line possible', () => {
  const out = encodeWord('name\r\nBcc: victim@x');
  assert.ok(!out.includes('\r\nBcc'), 'no CRLF injection survives');
  assert.ok(!/[\x00-\x1F]/.test(out), 'no C0 control char in output');
});

test('D-09: FR accents encode as RFC 2047 =?UTF-8?B? encoded-words (no mojibake)', () => {
  const out = encodeWord('Résumé');
  assert.ok(out.startsWith('=?UTF-8?B?'), 'FR accents take the base64 encoded-word path');
  const decoded = [...out.matchAll(/=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/g)]
    .map(m => Buffer.from(m[1], 'base64').toString('utf8'))
    .join('');
  assert.equal(decoded, 'Résumé', 'round-trip preserves the accents');
});

test('D-09: 200+ char emoji-heavy name — no C0 survives, round-trip preserves full input', () => {
  const name = 'A'.repeat(200) + '😀'.repeat(200);
  const out = encodeWord(name);
  assert.ok(!/[\x00-\x1F]/.test(out), 'no C0 control char in output');
  const decoded = [...out.matchAll(/=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/g)]
    .map(m => Buffer.from(m[1], 'base64').toString('utf8'))
    .join('');
  assert.equal(decoded, name, 'full 400-char name preserved through the encoded-word round-trip');
});

test('D-09: tab and DEL are stripped BEFORE the encode decision — pure printable ASCII stays unencoded', () => {
  const out = encodeWord('na\tme\x7F');
  assert.equal(out, 'name', 'tab + DEL stripped, result stays on the raw ASCII fast path');
  assert.ok(!/[^\x20-\x7E]/.test(out), 'pure printable ASCII, no encoded-word needed');
});

test('D-09: empty input returns empty string without throwing', () => {
  assert.equal(encodeWord(''), '');
  assert.equal(encodeWord(null), '');
  assert.equal(encodeWord(undefined), '');
});
