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
  const input = text(value);
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
  return chunks.map(chunk => `=?UTF-8?B?${Buffer.from(chunk, 'utf8').toString('base64')}?=`).join(' ');
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

function base64Body(value) {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/(.{76})/g, `$1${CRLF}`);
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
   Types map to one sentence each; the body links straight to the task. */
function buildNotifMessage(config, msg) {
  const to = bareAddress(msg.to);
  if (!addressOk(to)) throw new Error('Notification email address is invalid');

  const workspace = text(msg.workspace) || 'Projects Studio';
  const actor = text(msg.by) || 'Someone';
  const taskTitle = text(msg.task) || 'a task';
  const snippet = text(msg.snippet);
  const url = text(msg.url);

  const verbs = {
    mention: 'mentioned you in',
    assign: 'assigned you to',
    comment: 'commented on',
    update: 'updated',
  };
  const verb = verbs[msg.kind] || 'updated';

  const subject = `${actor} ${verb} ${taskTitle}`;
  const textBody = [
    'Hi,',
    '',
    `${actor} ${verb} "${taskTitle}" on ${workspace}.`,
    ...(snippet ? ['', `“${snippet}”`] : []),
    '',
    'Open the task:',
    url,
    '',
    "You receive this because of your notification settings on Projects Studio. If you weren't expecting it, you can ignore this email.",
  ].join('\r\n');

  const htmlBody = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f6f5f2;color:#26241f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e7e3da;border-radius:14px;padding:32px">
        <tr><td>
          <p style="margin:0 0 14px;font-size:16px;line-height:1.55"><strong>${escapeHtml(actor)}</strong> ${escapeHtml(verb)} <strong>${escapeHtml(taskTitle)}</strong> on ${escapeHtml(workspace)}.</p>
          ${snippet ? `<p style="margin:0 0 14px;font-size:14px;line-height:1.55;color:#6b665c;border-left:3px solid #e7e3da;padding-left:12px">“${escapeHtml(snippet)}”</p>` : ''}
          <p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#26241f;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">Open the task</a></p>
          <p style="margin:20px 0 0;font-size:13px;line-height:1.55;color:#6b665c">You receive this because of your notification settings. If you weren't expecting it, you can ignore this email.</p>
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
  };
}
