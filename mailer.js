/* =====================================================================
   Minimal SMTP client for invite emails.

   The app ships with zero runtime npm dependencies, so this speaks just
   enough SMTP to deliver one message: EHLO, optional STARTTLS, AUTH
   PLAIN/LOGIN, MAIL FROM, RCPT TO, DATA. It never logs credentials or
   the message body.

   Env:
     SMTP_HOST                  enable email invitations
     SMTP_PORT                  587, or 465 for implicit TLS
     SMTP_SECURE                true = implicit TLS; empty = infer from port
     SMTP_USER / SMTP_PASS      optional SMTP AUTH credentials
     MAIL_FROM                  envelope/header sender address
     MAIL_FROM_NAME             display name (defaults to workspace name)
     MAIL_REPLY_TO              optional Reply-To address
     SMTP_HELO                  EHLO name (defaults to os.hostname())
     SMTP_REJECT_UNAUTHORIZED   false only for self-signed test servers
     SMTP_REQUIRE_TLS           require an encrypted connection (default true)
     SMTP_ALLOW_INSECURE_AUTH   allow AUTH without TLS (local testing only)
     SMTP_TIMEOUT_MS            connection/command timeout, default 15000
   ===================================================================== */
import net from 'node:net';
import tls from 'node:tls';
import os from 'node:os';
import crypto from 'node:crypto';
import { tFor, escHtml } from './src/core/i18n.js';

const CRLF = '\r\n';
const DEFAULT_TIMEOUT = 15_000;

function text(value) {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

function bareAddress(value) {
  const raw = text(value);
  const match = raw.match(/<([^<>]+)>$/);
  return (match ? match[1] : raw).trim();
}

function addressOk(value) {
  return /^[^\s@<>]+@[^\s@<>]+$/.test(value);
}

function domainOf(address) {
  return address.split('@').pop() || 'localhost';
}

function encodeWord(value) {
  /* Phase 40 (SUBJ-03, T-40-01): strip ALL C0 control chars and DEL BEFORE
     the encode decision — user-controlled workspace/project/task names must
     never break SMTP header framing. text() only collapses CR/LF runs; tabs,
     NULs and DEL would otherwise survive the pure-ASCII fast path. */
  const input = text(value).replace(/[\x00-\x1F\x7F]/g, '');
  if (!/[^\x20-\x7E]/.test(input)) return input;
  const chunks = [];
  let current = '';
  for (const char of input) {
    if (current && Buffer.byteLength(current + char) > 30) {
      chunks.push(current);
      current = '';
    }
    current += char;
  }
  if (current) chunks.push(current);
  /* Phase 40 (Pitfall 1/2): the 200+-char hostile-name test measures the
     single-line join at ~1879 octets — over the 998-octet relay limit
     (RFC 5322 §2.1.1). Fold between encoded-words (RFC 2047 §6.2: CRLF + SP
     between encoded-words is transparent to parsers) instead of emitting one
     over-long Subject line. 900 leaves margin for the 'Subject: ' prefix. */
  const words = chunks.map(chunk => `=?UTF-8?B?${Buffer.from(chunk, 'utf8').toString('base64')}?=`);
  let out = '';
  let lineLen = 0;
  for (const word of words) {
    const wordLen = Buffer.byteLength(word);
    if (out && lineLen + 1 + wordLen > 900) {
      out += '\r\n ';
      lineLen = 0;
    } else if (out) {
      out += ' ';
      lineLen += 1;
    }
    out += word;
    lineLen += wordLen;
  }
  return out;
}

function formatAddress(name, address) {
  const label = text(name);
  if (!label) return `<${address}>`;
  if (/^[\x20-\x7E]+$/.test(label)) return `"${label.replace(/(["\\])/g, '\\$1')}" <${address}>`;
  return `${encodeWord(label)} <${address}>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function truncate(name, cap) {
  const s = text(name);
  return s.length > cap ? s.slice(0, cap) + '…' : s;
}

function base64Body(value) {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/(.{76})/g, `$1${CRLF}`);
}

/* =====================================================================
   Phase 41 (UNSUB-01): RFC 8058 one-click unsubscribe token helpers —
   exported pure functions (D-11, Phase 40 named-export pattern). The
   mailer stays key-free: keys are ALWAYS passed as arguments, so the
   unit tests pin the format without any MASTER_KEY scope.

   Frozen format (D-09/D-10/D-12):
     payload = 0x01 ‖ wsId(36B) ‖ userId(36B)     — internal UUIDs
       (server.js uid() = crypto.randomUUID(), fixed 36-byte width, so
       delimiter-free framing is unambiguous)
     token   = payload ‖ HMAC-SHA256(key, payload)
     url     = appUrl + '/unsubscribe/' + base64url(token)
   base64url (RFC 4648 §5) emits no padding and no +/= — the alphabet
   cannot carry CR/LF, so the header-injection surface is empty.
   ===================================================================== */
const UNSUB_TOKEN_VERSION = 0x01;
const UNSUB_ID_BYTES = 36; // internal ids are UUIDs — pinned by the freeze tests
const UNSUB_MAC_BYTES = 32; // HMAC-SHA256
const UNSUB_PAYLOAD_BYTES = 1 + 2 * UNSUB_ID_BYTES;

function makeUnsubscribeToken(key, wsId, userId) {
  const payload = Buffer.concat([
    Buffer.from([UNSUB_TOKEN_VERSION]),
    Buffer.from(String(wsId), 'utf8'),
    Buffer.from(String(userId), 'utf8'),
  ]);
  const mac = crypto.createHmac('sha256', key).update(payload).digest();
  return Buffer.concat([payload, mac]).toString('base64url');
}

function unsubscribeUrl(key, appUrl, wsId, userId) {
  return `${String(appUrl).replace(/\/+$/, '')}/unsubscribe/${makeUnsubscribeToken(key, wsId, userId)}`;
}

/* Length-guard-then-timingSafeEqual — the server.js timingSafeHex form
   (L414). Phase 42's route consumes this exact verification path. */
function verifyUnsubscribeToken(key, tokenB64url) {
  try {
    const raw = Buffer.from(String(tokenB64url), 'base64url');
    if (raw.length !== UNSUB_PAYLOAD_BYTES + UNSUB_MAC_BYTES) return false;
    if (raw[0] !== UNSUB_TOKEN_VERSION) return false;
    const payload = raw.subarray(0, UNSUB_PAYLOAD_BYTES);
    const mac = raw.subarray(UNSUB_PAYLOAD_BYTES);
    const want = crypto.createHmac('sha256', key).update(payload).digest();
    return mac.length === want.length && crypto.timingSafeEqual(mac, want);
  } catch {
    return false;
  }
}

/* Phase 42 (UNSUB-02): decode-after-verify — verification (above) covers the
   MAC over the whole framing, so decoding the payload AFTER a successful
   verify is safe. Pure: returns { wsId, userId } or null on any framing
   anomaly (length, version byte, undecodable input). Never verifies — the
   route must call verifyUnsubscribeToken FIRST. */
function decodeUnsubscribePayload(tokenB64url) {
  try {
    const raw = Buffer.from(String(tokenB64url), 'base64url');
    if (raw.length !== UNSUB_PAYLOAD_BYTES + UNSUB_MAC_BYTES) return null;
    if (raw[0] !== UNSUB_TOKEN_VERSION) return null;
    const wsId = raw.subarray(1, 1 + UNSUB_ID_BYTES).toString('utf8');
    const userId = raw.subarray(1 + UNSUB_ID_BYTES, UNSUB_PAYLOAD_BYTES).toString('utf8');
    return { wsId, userId };
  } catch {
    return null;
  }
}

/* Phase 42 (UNSUB-02, D-01/D-04): the ONE self-contained unsubscribe landing
   page. One template, ONE parameter (the localized message string, escHtml'd
   here — tFor never escapes), inline styles, zero external assets, safe in a
   mail client's webview. The verified and neutral variants differ ONLY by the
   message text — nothing else in the byte stream may vary (D-04). */
function buildUnsubscribePage(message) {
  const body = escHtml(message);
  return [
    '<!doctype html>',
    '<html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>gr8r</title></head>',
    '<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:48px 16px;">',
    '<div style="max-width:420px;background:#ffffff;border-radius:8px;padding:32px;text-align:center;">',
    `<p class="msg" style="margin:0;font-size:15px;line-height:1.5;color:#24292f;">${body}</p>`,
    '</div>',
    '</td></tr></table>',
    '</body></html>',
  ].join('');
}

function dotStuff(message) {
  const normalized = message.replace(/\r?\n/g, CRLF);
  return normalized
    .split(CRLF)
    .map(line => (line.startsWith('.') ? `.${line}` : line))
    .join(CRLF);
}

function flag(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function tlsIdentity(host) {
  if (net.isIP(host)) {
    return { checkServerIdentity: (_hostname, cert) => tls.checkServerIdentity(host, cert) };
  }
  return { servername: host };
}

function readConfig(env) {
  const host = text(env.SMTP_HOST);
  if (!host) return null;

  const secureSetting = String(env.SMTP_SECURE ?? '')
    .trim()
    .toLowerCase();
  const secureFlag = ['true', '1', 'yes', 'on'].includes(secureSetting) ? true : ['false', '0', 'no', 'off'].includes(secureSetting) ? false : null;
  const portSetting = String(env.SMTP_PORT ?? '').trim();
  const configuredPort = portSetting ? Number(portSetting) : null;
  const port = configuredPort ?? (secureFlag === true ? 465 : 587);
  if (configuredPort !== null && (!Number.isInteger(configuredPort) || configuredPort < 1 || configuredPort > 65535)) {
    return { error: 'SMTP_PORT must be a TCP port between 1 and 65535' };
  }
  const secure = secureFlag ?? port === 465;
  const user = text(env.SMTP_USER);
  const pass = String(env.SMTP_PASS ?? '');
  const from = bareAddress(env.MAIL_FROM || env.SMTP_FROM || (user.includes('@') ? user : ''));
  if (!from) return { error: 'MAIL_FROM is required when SMTP_HOST is set' };
  if (!addressOk(from)) return { error: 'MAIL_FROM must be a valid email address' };

  const replyTo = bareAddress(env.MAIL_REPLY_TO || '');
  if (replyTo && !addressOk(replyTo)) return { error: 'MAIL_REPLY_TO must be a valid email address' };

  const timeout = Number(env.SMTP_TIMEOUT_MS || DEFAULT_TIMEOUT);
  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
    fromName: text(env.MAIL_FROM_NAME || env.SMTP_FROM_NAME),
    replyTo,
    helo: text(env.SMTP_HELO) || os.hostname() || 'localhost',
    rejectUnauthorized: flag(env.SMTP_REJECT_UNAUTHORIZED, true),
    requireTls: flag(env.SMTP_REQUIRE_TLS, true),
    allowInsecureAuth: flag(env.SMTP_ALLOW_INSECURE_AUTH, false),
    timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT,
  };
}

class SmtpSession {
  constructor(config) {
    this.config = config;
    this.socket = null;
    this.secure = config.secure;
    this.buffer = '';
    this.lines = [];
    this.responses = [];
    this.waiters = [];
    this.failed = null;
    this.capabilities = [];
  }

  openSocket() {
    const config = this.config;
    return new Promise((resolve, reject) => {
      const identity = tlsIdentity(config.host);
      const socket = config.secure
        ? tls.connect({ host: config.host, port: config.port, ...identity, rejectUnauthorized: config.rejectUnauthorized })
        : net.connect({ host: config.host, port: config.port });

      const timer = setTimeout(() => {
        cleanup();
        socket.destroy();
        reject(new Error('SMTP connection timed out'));
      }, config.timeout);

      const onReady = () => {
        cleanup();
        resolve(socket);
      };
      const onError = err => {
        cleanup();
        socket.destroy();
        reject(err);
      };
      const cleanup = () => {
        clearTimeout(timer);
        socket.removeListener(config.secure ? 'secureConnect' : 'connect', onReady);
        socket.removeListener('error', onError);
      };

      socket.once(config.secure ? 'secureConnect' : 'connect', onReady);
      socket.once('error', onError);
    });
  }

  attach(socket) {
    socket.setTimeout(this.config.timeout);
    socket.on('data', chunk => this.onData(chunk));
    socket.on('error', err => this.fail(err));
    socket.on('close', () => this.fail(new Error('SMTP connection closed')));
    socket.on('timeout', () => this.fail(new Error('SMTP command timed out')));
  }

  fail(err) {
    if (this.failed) return;
    this.failed = err;
    const waiters = this.waiters.splice(0);
    for (const waiter of waiters) waiter.reject(err);
    if (this.socket) this.socket.destroy();
  }

  onData(chunk) {
    this.buffer += chunk.toString('utf8');
    let index;
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, index).replace(/\r$/, '');
      this.buffer = this.buffer.slice(index + 1);
      this.onLine(line);
    }
  }

  onLine(line) {
    if (!line) return;
    this.lines.push(line);
    const match = /^(\d{3})([ -])(.*)$/.exec(line) || /^(\d{3})$/.exec(line);
    if (!match) return;
    const final = line.length === 3 || match[2] === ' ';
    if (!final) return;

    const response = {
      code: Number(match[1]),
      lines: this.lines,
      text: this.lines
        .map(item => item.slice(4))
        .join(' ')
        .trim(),
    };
    this.lines = [];
    const waiter = this.waiters.shift();
    if (waiter) waiter.resolve(response);
    else this.responses.push(response);
  }

  nextResponse() {
    if (this.responses.length) return Promise.resolve(this.responses.shift());
    if (this.failed) return Promise.reject(this.failed);
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  async raw(line) {
    if (this.failed) throw this.failed;
    this.socket.write(line + CRLF);
    return this.nextResponse();
  }

  async command(line, label = line.split(/\s+/)[0], ok = code => code >= 200 && code < 300) {
    const response = await this.raw(line);
    if (!ok(response.code)) throw new Error(`SMTP ${label} failed (${response.code}): ${response.text}`);
    return response;
  }

  async ehlo() {
    let response = await this.raw(`EHLO ${this.config.helo}`);
    if (response.code !== 250) response = await this.command(`HELO ${this.config.helo}`, 'HELO');
    this.capabilities = response.lines.map(line => line.replace(/^\d{3}[ -]?/, '').trim()).filter(Boolean);
  }

  hasCapability(name) {
    const wanted = name.toUpperCase();
    return this.capabilities.some(capability => capability.toUpperCase() === wanted || capability.toUpperCase().startsWith(`${wanted} `));
  }

  async startTls() {
    await this.command('STARTTLS', 'STARTTLS');
    const plain = this.socket;
    plain.removeAllListeners('data');
    plain.removeAllListeners('error');
    plain.removeAllListeners('close');
    plain.removeAllListeners('timeout');
    plain.setTimeout(0);

    const identity = tlsIdentity(this.config.host);
    const secure = tls.connect({
      socket: plain,
      ...identity,
      rejectUnauthorized: this.config.rejectUnauthorized,
    });

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        secure.destroy();
        reject(new Error('SMTP TLS handshake timed out'));
      }, this.config.timeout);
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = err => {
        cleanup();
        secure.destroy();
        reject(err);
      };
      const cleanup = () => {
        clearTimeout(timer);
        secure.removeListener('secureConnect', onReady);
        secure.removeListener('error', onError);
      };
      secure.once('secureConnect', onReady);
      secure.once('error', onError);
    });

    this.socket = secure;
    this.secure = true;
    this.buffer = '';
    this.lines = [];
    this.responses = [];
    this.attach(secure);
    await this.ehlo();
  }

  authMechanisms() {
    const mechanisms = [];
    for (const capability of this.capabilities) {
      const match = /^AUTH(?:[ =])(.+)$/i.exec(capability);
      if (!match) continue;
      for (const mechanism of match[1].split(/\s+/)) if (mechanism) mechanisms.push(mechanism.toUpperCase());
    }
    return mechanisms;
  }

  async authenticate() {
    const mechanisms = this.authMechanisms();
    if (mechanisms.includes('PLAIN') || !mechanisms.length) return this.authPlain();
    if (mechanisms.includes('LOGIN')) return this.authLogin();
    throw new Error(`SMTP server does not support a usable AUTH method (${mechanisms.join(', ')})`);
  }

  async authPlain() {
    const token = Buffer.from(`\0${this.config.user}\0${this.config.pass}`, 'utf8').toString('base64');
    let response = await this.raw(`AUTH PLAIN ${token}`);
    if (response.code === 334) response = await this.raw(token);
    if (response.code !== 235) throw new Error(`SMTP AUTH failed (${response.code}): ${response.text}`);
  }

  async authLogin() {
    await this.command('AUTH LOGIN', 'AUTH', code => code === 334);
    await this.command(Buffer.from(this.config.user, 'utf8').toString('base64'), 'AUTH', code => code === 334);
    await this.command(Buffer.from(this.config.pass, 'utf8').toString('base64'), 'AUTH', code => code === 235);
  }

  async send(message) {
    this.socket = await this.openSocket();
    this.attach(this.socket);

    const greeting = await this.nextResponse();
    if (greeting.code !== 220) throw new Error(`SMTP server refused the connection (${greeting.code}): ${greeting.text}`);
    await this.ehlo();

    if (!this.secure && this.hasCapability('STARTTLS')) await this.startTls();
    if (!this.secure && this.config.requireTls) {
      throw new Error('SMTP server does not offer TLS; set SMTP_REQUIRE_TLS=false only for a trusted relay');
    }
    if (!this.secure && this.config.user && !this.config.allowInsecureAuth) {
      throw new Error('SMTP credentials were not sent because the connection is not encrypted');
    }
    if (this.config.user) await this.authenticate();

    await this.command(`MAIL FROM:<${this.config.from}>`, 'MAIL FROM');
    await this.command(`RCPT TO:<${message.to}>`, 'RCPT TO', code => [250, 251, 252].includes(code));
    await this.command('DATA', 'DATA', code => code === 354);

    const stuffed = dotStuff(message.data);
    const payload = stuffed.endsWith(CRLF) ? stuffed : stuffed + CRLF;
    this.socket.write(payload + '.' + CRLF);
    const done = await this.nextResponse();
    if (done.code !== 250) throw new Error(`SMTP DATA failed (${done.code}): ${done.text}`);

    try {
      await this.command('QUIT', 'QUIT');
    } catch {
      /* Some servers close immediately after accepting the message. */
    }
  }

  destroy() {
    if (this.socket) this.socket.destroy();
  }
}

/* P4-f: the notification email — shorter than the invite, same layout bones.
   Types map to one sentence each; the body links straight to the task.

   I18N-01 (Phase 36): the frame renders through tFor(msg.locale, 'notif.email.*')
   — all notif.email call sites live in THIS file only. tFor is pure (no
   singleton mutation), clamps unknown locales to EN and never throws; the
   try/catch backstop additionally degrades to the previous English literals
   on any throw, so a catalogue problem can never kill the fan-out (SC-5).
   escapeHtml/encodeWord are applied AFTER interpolation — the catalogue
   renders raw (T-36-01). */
function buildNotifMessage(config, msg) {
  const to = bareAddress(msg.to);
  if (!addressOk(to)) throw new Error('Notification email address is invalid');

  const locale = msg.locale === 'fr' ? 'fr' : 'en';
  const workspace = text(msg.workspace) || 'Projects Studio';
  const actor = text(msg.by) || 'Someone';
  const taskTitle = text(msg.task) || 'a task';
  const snippet = text(msg.snippet);
  const url = text(msg.url);

  let frame;
  try {
    const verbKeys = {
      mention: 'notif.email.verb.mention',
      assign: 'notif.email.verb.assign',
      comment: 'notif.email.verb.comment',
      update: 'notif.email.verb.update',
      due_reminder: 'notif.email.verb.reminder',
      past_due: 'notif.email.verb.reminder',
    };
    const verb = tFor(locale, verbKeys[msg.kind] || 'notif.email.verb.update');
    const isReminder = msg.kind === 'due_reminder' || msg.kind === 'past_due';
    frame = {
      greeting: tFor(locale, 'notif.email.greeting'),
      subject: isReminder ? tFor(locale, 'notif.email.subject.reminder', { title: taskTitle }) : `${actor} ${verb} ${taskTitle}`,
      sentence: tFor(locale, 'notif.email.body.sentence', { actor, verb, title: taskTitle, workspace }),
      openTask: tFor(locale, 'notif.email.body.openTask'),
      button: tFor(locale, 'notif.email.body.button'),
      footer: tFor(locale, 'notif.email.body.footer'),
    };
  } catch {
    /* SC-5 boundary guard: any render failure degrades to the pre-Phase-36
       English literals — a broken catalogue blanks nothing, kills nothing. */
    const verb = ({ mention: 'mentioned you in', assign: 'assigned you to', comment: 'commented on' })[msg.kind] || 'updated';
    frame = {
      greeting: 'Hi,',
      subject: `${actor} ${verb} ${taskTitle}`,
      sentence: `${actor} ${verb} "${taskTitle}" on ${workspace}.`,
      openTask: 'Open the task:',
      button: 'Open the task',
      footer: "You receive this because of your notification settings. If you weren't expecting it, you can ignore this email.",
    };
  }
  const { greeting, subject, sentence, openTask, button, footer } = frame;

  const textBody = [
    greeting,
    '',
    sentence,
    ...(snippet ? ['', `“${snippet}”`] : []),
    '',
    openTask,
    url,
    '',
    footer,
  ].join('\r\n');

  const htmlBody = `<!doctype html>
<html lang="${locale}">
<body style="margin:0;padding:0;background:#f6f5f2;color:#26241f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e7e3da;border-radius:14px;padding:32px">
        <tr><td>
          <p style="margin:0 0 14px;font-size:16px;line-height:1.55">${escapeHtml(sentence)}</p>
          ${snippet ? `<p style="margin:0 0 14px;font-size:14px;line-height:1.55;color:#6b665c;border-left:3px solid #e7e3da;padding-left:12px">“${escapeHtml(snippet)}”</p>` : ''}
          <p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#26241f;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">${escapeHtml(button)}</a></p>
          <p style="margin:20px 0 0;font-size:13px;line-height:1.55;color:#6b665c">${escapeHtml(footer)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const boundary = `projects_${crypto.randomBytes(12).toString('hex')}`;
  const headers = [
    `From: ${formatAddress(config.fromName || workspace, config.from)}`,
    `To: <${to}>`,
    ...(config.replyTo ? [`Reply-To: <${config.replyTo}>`] : []),
    `Subject: ${encodeWord(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${domainOf(config.from)}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    'Auto-Submitted: auto-generated',
    'X-Mailer: Projects Studio',
  ];

  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Body(textBody),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Body(htmlBody),
    `--${boundary}--`,
    '',
  ].join('\r\n');

  return {
    to,
    data: [...headers, '', body].join('\r\n') + '\r\n',
  };
}

/* Phase 38 (DIGEST-01): the daily digest email — a sibling of
   buildNotifMessage with the same MIME bones (research anti-pattern: never
   shoehorn a list digest into the single-notification builder).

   I18N: the frame renders through tFor(msg.locale, 'notif.digest.*') with
   the same SC-5 English-literal try/catch fallback; escapeHtml/encodeWord
   are applied AFTER interpolation (T-36-01) and the FR subject carries
   accents, so the Subject goes through encodeWord (Pitfall 7).
   Deep links are workspace-root fallback for a missing task key, matching
   the server.js:1276 pattern. The app base arrives as msg.appUrl — the
   mailer module itself has no APP_URL (the boot guard guarantees it is set
   whenever SMTP is enabled). */
function buildDigestMessage(config, msg) {
  const to = bareAddress(msg.to);
  if (!addressOk(to)) throw new Error('Digest email address is invalid');

  const locale = msg.locale === 'fr' ? 'fr' : 'en';
  const workspace = text(msg.workspace) || 'Projects Studio';
  const slug = text(msg.wsSlug);
  const appUrl = text(msg.appUrl).replace(/\/+$/, '');
  const taskUrl = t => (t?.key ? `${appUrl}/w/${slug}/task/${encodeURIComponent(t.key)}` : `${appUrl}/w/${slug}/`);
  const dueToday = Array.isArray(msg.dueToday) ? msg.dueToday : [];
  const overdue = Array.isArray(msg.overdue) ? msg.overdue : [];
  const count = dueToday.length + overdue.length;

  /* Phase 41 (UNSUB-03, D-01/D-04): the footer link targets the Settings
     email-notifications surface (`#notif-email` anchor) — never the token
     URL, never 404s. It renders UNCONDITIONALLY (D-05 scope is headers
     only): it is appUrl-based and needs no key. */
  const settingsUrl = `${appUrl}/w/${slug}/settings#notif-email`;

  let frame;
  try {
    frame = {
      greeting: tFor(locale, 'notif.email.greeting'),
      subject: tFor(locale, 'notif.digest.subjectWs', { ws: truncate(workspace, 64), count }),
      dueToday: tFor(locale, 'notif.digest.dueToday'),
      overdue: tFor(locale, 'notif.digest.overdue'),
      footer: tFor(locale, 'notif.digest.footer'),
      unsubscribe: tFor(locale, 'notif.digest.unsubscribe'),
    };
  } catch {
    /* SC-5 boundary guard: any render failure degrades to English literals. */
    frame = {
      greeting: 'Hi,',
      subject: `[${truncate(workspace, 64)}] Daily digest: ${count} task(s)`,
      dueToday: 'Due today',
      overdue: 'Overdue',
      footer: "You receive this because of your notification settings. If you weren't expecting it, you can ignore this email.",
      unsubscribe: 'Unsubscribe from these emails',
    };
  }
  const { greeting, subject, dueToday: dueLabel, overdue: overdueLabel, footer, unsubscribe } = frame;

  /* Phase 40 (SUBJ-02): each task line names its parent project —
     `Project Name — Task Name` (em dash U+2014, D-04). Caps are applied
     independently BEFORE the join (D-12: truncate(project, 80) +
     truncate(title, 80)); a falsy project degrades silently to
     title-only with no 'Unknown project' placeholder (D-06/T-40-06 —
     server.js resolves names only after inScopeProject +
     memberCanReadProject, so names arriving here are pre-cleared for
     THIS recipient and `|| ''` is snapshot defense, not a second
     visibility path; D-05). The text part is plain text — never
     escapeHtml'd; the HTML part escapes both href and label AFTER
     interpolation (T-36-01). A project name containing an em dash
     renders `A—B — Task` — cosmetic, accepted (D-07). */
  const taskLabel = t => (t.project ? `${truncate(t.project, 80)} — ${truncate(t.title, 80)}` : truncate(t.title, 80));
  const section = (label, items) => (items.length ? [`${label}:`, ...items.map(t => `- ${taskLabel(t)}\r\n  ${taskUrl(t)}`)] : []);
  /* Phase 41 (UNSUB-03, D-03): the unsubscribe link rides INLINE after the
     footer sentence in BOTH parts — a space-separated plain URL in the text
     part, an <a> in the HTML paragraph. */
  const textBody = [greeting, '', ...section(dueLabel, dueToday), ...section(overdueLabel, overdue), '', `${footer} ${settingsUrl}`].join('\r\n');

  const htmlItems = items =>
    items
      .map(
        t =>
          `<li style="margin:0 0 8px"><a href="${escapeHtml(taskUrl(t))}" style="color:#3b5bdb;text-decoration:none">${escapeHtml(taskLabel(t))}</a></li>`,
      )
      .join('');
  const htmlSection = (label, items) =>
    items.length
      ? `<p style="margin:14px 0 6px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:#6b665c">${escapeHtml(label)}</p><ul style="margin:0;padding-left:18px;list-style:disc">${htmlItems(items)}</ul>`
      : '';
  const htmlBody = `<!doctype html>
<html lang="${locale}">
<body style="margin:0;padding:0;background:#f6f5f2;color:#26241f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e7e3da;border-radius:14px;padding:32px">
        <tr><td>
          <p style="margin:0 0 14px;font-size:16px;line-height:1.55">${escapeHtml(greeting)}</p>
          ${htmlSection(dueLabel, dueToday)}
          ${htmlSection(overdueLabel, overdue)}
          <p style="margin:20px 0 0;font-size:13px;line-height:1.55;color:#6b665c">${escapeHtml(footer)} <a href="${escapeHtml(settingsUrl)}" style="color:#3b5bdb;text-decoration:none">${escapeHtml(unsubscribe)}</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const boundary = `projects_${crypto.randomBytes(12).toString('hex')}`;
  const headers = [
    `From: ${formatAddress(config.fromName || workspace, config.from)}`,
    `To: <${to}>`,
    ...(config.replyTo ? [`Reply-To: <${config.replyTo}>`] : []),
    `Subject: ${encodeWord(subject)}`,
    /* Phase 41 (UNSUB-01, D-05/D-06): RFC 8058 one-click — both headers
       render ONLY when the server pre-built an https unsubscribeUrl into
       msg (MASTER_KEY + https APP_URL gates live server-side; this second
       layer refuses any non-https URL). No http:// downgrade — omit
       entirely. The URL is wholly server-built (APP_URL + literal path +
       base64url whose alphabet cannot contain CR/LF) — no other input is
       ever interpolated here. */
    ...(msg.unsubscribeUrl && msg.unsubscribeUrl.startsWith('https://')
      ? [`List-Unsubscribe: <${msg.unsubscribeUrl}>`, 'List-Unsubscribe-Post: List-Unsubscribe=One-Click']
      : []),
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${domainOf(config.from)}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    'Auto-Submitted: auto-generated',
    'X-Mailer: Projects Studio',
  ];

  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Body(textBody),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Body(htmlBody),
    `--${boundary}--`,
    '',
  ].join('\r\n');

  return {
    to,
    data: [...headers, '', body].join('\r\n') + '\r\n',
  };
}

/* TFA-MAIL: security alert — a 2FA factor was added or removed on the
   account. Unlike notification emails this is NOT gated by workspace prefs:
   security alerts always reach the account address. */
function buildSecurityAlertMessage(config, msg) {
  const to = bareAddress(msg.to);
  if (!addressOk(to)) throw new Error('Security alert address is invalid');

  const actions = {
    added: 'Two-factor factor added',
    removed: 'Two-factor factor removed',
    disabled: 'Two-factor authentication disabled',
  };
  const sentences = {
    added: 'A new two-factor authentication factor was added to your account.',
    removed: 'A two-factor authentication factor was removed from your account.',
    disabled: 'Two-factor authentication was disabled on your account.',
  };
  const action = actions[msg.action] ? msg.action : 'added';
  const factor = text(msg.factor);
  const ip = text(msg.ip) || 'unknown';
  const when = text(msg.when) || new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  const subject = `Security alert: ${actions[action]}`;
  const detail = factor ? `Factor: ${factor}` : null;
  const textBody = [
    'Hi,',
    '',
    sentences[action],
    ...(detail ? ['', detail] : []),
    '',
    `When: ${when}`,
    `IP address: ${ip}`,
    '',
    "If this wasn't you, change your password immediately and review your account's active sessions.",
  ].join('\r\n');

  const htmlBody = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f6f5f2;color:#26241f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e7e3da;border-radius:14px;padding:32px">
        <tr><td>
          <p style="margin:0 0 14px;font-size:16px;line-height:1.55">${escapeHtml(sentences[action])}</p>
          ${detail ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.55"><strong>${escapeHtml(detail)}</strong></p>` : ''}
          <p style="margin:0 0 4px;font-size:13px;line-height:1.55;color:#6b665c">When: ${escapeHtml(when)}</p>
          <p style="margin:0 0 14px;font-size:13px;line-height:1.55;color:#6b665c">IP address: ${escapeHtml(ip)}</p>
          <p style="margin:20px 0 0;font-size:13px;line-height:1.55;color:#6b665c">If this wasn't you, change your password immediately and review your account's active sessions.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const boundary = `projects_${crypto.randomBytes(12).toString('hex')}`;
  const headers = [
    `From: ${formatAddress(config.fromName || 'Projects Studio', config.from)}`,
    `To: <${to}>`,
    ...(config.replyTo ? [`Reply-To: <${config.replyTo}>`] : []),
    `Subject: ${encodeWord(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${domainOf(config.from)}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    'Auto-Submitted: auto-generated',
    'X-Mailer: Projects Studio',
  ];

  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Body(textBody),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Body(htmlBody),
    `--${boundary}--`,
    '',
  ].join('\r\n');

  return {
    to,
    data: [...headers, '', body].join('\r\n') + '\r\n',
  };
}

function buildInviteMessage(config, invite) {
  const to = bareAddress(invite.to);
  if (!addressOk(to)) throw new Error('Invite email address is invalid');

  const workspace = text(invite.workspace) || 'Projects Studio';
  const inviter = text(invite.inviter) || 'A workspace admin';
  const role = { admin: 'an admin', member: 'a member', viewer: 'a guest' }[invite.role] || 'a member';
  const url = text(invite.url);
  const expiresAt = Number(invite.expiresAt);
  const expires = Number.isFinite(expiresAt)
    ? new Date(expiresAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : '';

  const subject = `You're invited to ${workspace}`;
  const product = /^projects studio/i.test(workspace) ? '' : ' on Projects Studio';
  const textBody = [
    'Hi,',
    '',
    `${inviter} invited you to join ${workspace}${product} as ${role}.`,
    '',
    'Open this link to create your account:',
    url,
    '',
    `This invitation is for ${to}${expires ? ` and expires on ${expires}` : ''}. It can be used once.`,
    "If you weren't expecting it, you can ignore this email.",
  ].join('\r\n');

  const htmlBody = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f6f5f2;color:#26241f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e7e3da;border-radius:14px;padding:32px">
        <tr><td>
          <p style="margin:0 0 14px;font-size:16px;line-height:1.55">Hi,</p>
          <p style="margin:0 0 14px;font-size:16px;line-height:1.55"><strong>${escapeHtml(inviter)}</strong> invited you to join <strong>${escapeHtml(workspace)}</strong>${product} as ${role}.</p>
          <p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#26241f;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">Accept invitation</a></p>
          <p style="margin:0 0 14px;font-size:13px;line-height:1.55;color:#6b665c">Or paste this link into your browser:<br><a href="${escapeHtml(url)}" style="color:#3b5bdb;word-break:break-all">${escapeHtml(url)}</a></p>
          <p style="margin:20px 0 0;font-size:13px;line-height:1.55;color:#6b665c">This invitation is for ${escapeHtml(to)}${expires ? ` and expires on ${escapeHtml(expires)}` : ''}. It can be used once. If you weren't expecting it, you can ignore this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const boundary = `projects_${crypto.randomBytes(12).toString('hex')}`;
  const headers = [
    `From: ${formatAddress(config.fromName || workspace, config.from)}`,
    `To: <${to}>`,
    ...(config.replyTo ? [`Reply-To: <${config.replyTo}>`] : []),
    `Subject: ${encodeWord(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${domainOf(config.from)}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    'Auto-Submitted: auto-generated',
    'X-Mailer: Projects Studio',
  ];

  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Body(textBody),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Body(htmlBody),
    `--${boundary}--`,
  ].join(CRLF);

  return {
    to,
    data: headers.join(CRLF) + CRLF + CRLF + body + CRLF,
  };
}

/* SUBJ-03 (Phase 40): exported for unit tests — the send API shape above is
   unchanged; buildDigestMessage joins them so the SC-5 digest fallback is
   unit-testable without a live SMTP round-trip. */
/* Phase 41 (UNSUB-01, D-11): makeUnsubscribeToken / unsubscribeUrl /
   verifyUnsubscribeToken exported pure — the token contract Phase 42's
   endpoint consumes, frozen by test/unsubscribe-token.test.mjs. Keys are
   arguments; the mailer module itself never touches MASTER_KEY. */
export { encodeWord, truncate, buildDigestMessage, makeUnsubscribeToken, unsubscribeUrl, verifyUnsubscribeToken, decodeUnsubscribePayload, buildUnsubscribePage };

export function createMailer(env = process.env) {
  const config = readConfig(env);
  if (!config || config.error) {
    const error = config?.error || null;
    return {
      enabled: false,
      error,
      from: null,
      reason: error || 'Set SMTP_HOST to send invitation emails',
      async sendInvite() {
        throw new Error(error || 'Email delivery is not configured');
      },
      async sendSecurityAlert() {
        throw new Error(error || 'Email delivery is not configured');
      },
      async sendDigest() {
        throw new Error(error || 'Email delivery is not configured');
      },
    };
  }

  return {
    enabled: true,
    error: null,
    from: config.from,
    host: config.host,
    port: config.port,
    async sendInvite(invite) {
      const session = new SmtpSession(config);
      try {
        await session.send(buildInviteMessage(config, invite));
      } finally {
        session.destroy();
      }
    },
    /* P4-f: one notification row = one short email. Fire-and-forget from the
       caller — failures are logged, never surfaced to the client. */
    async sendNotif(msg) {
      const session = new SmtpSession(config);
      try {
        await session.send(buildNotifMessage(config, msg));
      } finally {
        session.destroy();
      }
    },
    /* Phase 38 (DIGEST-01): one opted-in member, one localized digest email.
       Fire-and-forget from the caller — same failure discipline as sendNotif. */
    async sendDigest(msg) {
      const session = new SmtpSession(config);
      try {
        await session.send(buildDigestMessage(config, msg));
      } finally {
        session.destroy();
      }
    },
    /* TFA-MAIL: account-level security alert (2FA factor added/removed).
       Fire-and-forget from the caller, same failure discipline as sendNotif. */
    async sendSecurityAlert(msg) {
      const session = new SmtpSession(config);
      try {
        await session.send(buildSecurityAlertMessage(config, msg));
      } finally {
        session.destroy();
      }
    },
  };
}
