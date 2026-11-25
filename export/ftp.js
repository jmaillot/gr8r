/* =====================================================================
   FTP/FTPS DESTINATION CORE — Phase 97 (97-01)
   =====================================================================
   Server-only hand-rolled FTP/FTPS client on Node stdlib. Zero npm
   deps — node:net/node:tls ONLY. Lives at the repository ROOT beside
   export/s3.js and export/backup.js — never under src/ (the
   prohibition test).

   Frozen phase decisions (97-CONTEXT D-01..D-04):
   - D-01: promise API in s3.js style — `await ftp.stor(path, stream)`,
     `dele(path)`, `size(path)`, `noop()`, `quit()/end()`; NO
     event-emitter surface. Integrates into the 96-01 descriptor
     without adaptation.
   - D-02: the restore primitive fetchToStaged(config, path,
     expectedSha256, stagingDir) lives IN this client (sha256-on-pipe
     inside) — Phase 98 wiring is one descriptor field.
   - D-03: NOOP keep-alive interval is FTP_NOOP_INTERVAL_S = 60 (a
     const, NOT env — below the 300s vsftpd idle default with margin).
   - D-04: errors are plain Error objects with keyed `err.code`
     classes (ftpAuthFailed / ftpUnreachable / ftpTlsFailed /
     ftpPassiveFailed / ftpPathNotFound / ftpQuotaExceeded /
     ftpTransferAborted / ftpChecksumFailed / ftpSha256Mismatch /
     ftpGeneric) — same shape s3.js maps; no separate error module.

   Command surface: USER/PASS, TYPE I, AUTH TLS → PBSZ 0 → PROT P
   (explicit), transport swap on :990 (implicit), EPSV with PASV
   fallback (control-host rule + `pasvHost` override; NEVER EPSV ALL,
   never PROT C), STOR, DELE, SIZE, REST (RETR-only — P6: STOR retry
   is a full restart from byte 0, ZERO REST on the upload path),
   NOOP, QUIT. No LIST/MLST.

   Scrub rule (V14 / T-97-01): PASS/USER command lines never enter
   errors or logs — every reply-text capture passes scrubFtpLine;
   message text sliced via sliceError (300 chars).

   Control-channel discipline (RESEARCH Patterns 2/6):
   - one command in flight, never pipelined; interim 1xx drained
   - 331 (USER ok) / 350 (REST ok) are per-command replies (A5) — the
     caller validates the code, the dispatcher never treats them as
     generic success
   - stray 2xx while an awaited transfer final is pending (NOOP echo)
     is swallowed and counted, never resolving the awaited command (P4)
   - socket.setTimeout arms per pending command; the 'timeout' handler
     DESTROYS sockets and rejects keyed — Node does not destroy for us
     (P1); control error/close destroys the data socket and rejects
     pending transfers ftpTransferAborted (P5)

   Data channel: EPSV → dial the CONTROL host (never the
   server-announced address — NAT-safe rule, T-97-02), `pasvHost`
   override honored. TLS session reuse (P8): controlSocket.getSession()
   captured once, passed as the `session` option of EVERY data-channel
   tls.connect (Task 3; pinned T5).

   Request surface consumed by Phase 98:
   - connectFtp(config)   — client factory { connect, stor, dele,
                            size, noop, quit, end }
   - fetchToStaged        — restore seam (D-02)
   - probeFtp             — keyed probe (Task 4)
   - parseReply / parseEpsvPort / parsePasvPort / ftpErrorFrom /
     scrubFtpLine / sliceError / FTP_NOOP_INTERVAL_S — pure contract
     surface, golden-vector tested
   ===================================================================== */

import net from 'node:net';
import tls from 'node:tls';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';

/* ---- Error slicing (V14: no headers, no secrets in error text) ---- */
export function sliceError(error) {
  return String(error?.message || error).slice(0, 300);
}

/* ---- Scrub helper (V14 parity: PASS/USER lines never survive) ---- */
export function scrubFtpLine(line) {
  return String(line).replace(/^(PASS|USER)\s+.*/i, (_m, cmd) => `${cmd.toUpperCase()} ***`);
}

/* Scrub every line of a reply transcript before it can reach an error.
   Beyond line-start PASS/USER commands (scrubFtpLine contract), a
   credential-bearing token embedded mid-line in a server reply (e.g.
   `530 Login incorrect (PASS secret was rejected)`) is ALSO scrubbed —
   the raw secret never reaches err.message (T7/V14). */
function scrubTranscript(text) {
  return scrubFtpLine(
    String(text ?? '')
      .split(/\r?\n/)
      .map(scrubFtpLine)
      .join('\n'),
  ).replace(/(PASS|USER)(\s+)\S+/gi, (_m, cmd, ws) => `${cmd.toUpperCase()}${ws}***`);
}

/* ---- D-03: NOOP keep-alive interval (const, NOT env) ---- */
export const FTP_NOOP_INTERVAL_S = 60;

/* =====================================================================
   REPLY PARSER STATE MACHINE (RESEARCH Pattern 2)
   =====================================================================
   Feed-accumulating pure function. `buffer` may be a partial feed (a
   line split across chunks); `state` persists between feeds:
   createReplyState() → { code: null, lines: [] }.

   RFC 959 §4.2: `NNN-` opens a multiline reply; it terminates ONLY on
   the SAME code followed by SPACE (or a bare `NNN` line). A body line
   that merely starts with the same digits must NOT close it (P2).
   Fresh-state non-matching line = protocol violation (T-97-03) — the
   caller maps it to keyed ftpGeneric, the parser never crashes. */

export function createReplyState() {
  return { code: null, lines: [] };
}

export function parseReply(buffer, state = createReplyState()) {
  const text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer);
  let consumed = 0;
  let idx;
  while ((idx = text.indexOf('\r\n', consumed)) >= 0) {
    const line = text.slice(consumed, idx);
    consumed = idx + 2;

    const m = /^(\d{3})([ -])([\s\S]*)$/.exec(line);
    const bare = /^\d{3}$/.test(line);

    if (state.code === null) {
      /* Fresh state — this line opens the reply. */
      if (m) {
        const code = Number(m[1]);
        if (m[2] === '-') {
          /* Multiline opens — keep accumulating. */
          state.code = code;
          state.lines = [m[3]];
          continue;
        }
        /* Single-line final reply. */
        return { complete: true, code, lines: [m[3]], consumed, violation: false };
      }
      if (bare) {
        return { complete: true, code: Number(line), lines: [''], consumed, violation: false };
      }
      /* Protocol violation — terminate so the caller can reject keyed. */
      return { complete: true, code: null, lines: [line], consumed, violation: true };
    }

    /* Multiline open — look for the SAME-code terminator (P2). */
    const term = new RegExp(`^${state.code} ([\\s\\S]*)$`).exec(line);
    if (term || line === String(state.code)) {
      const code = state.code;
      const lines = [...state.lines, term ? term[1] : ''];
      state.code = null;
      state.lines = [];
      return { complete: true, code, lines, consumed, violation: false };
    }
    /* Body lines carrying the same-code `NNN-` prefix have it stripped
       (golden-vector contract); arbitrary body text is kept verbatim. */
    const body = new RegExp(`^${state.code}-([\\s\\S]*)$`).exec(line);
    state.lines.push(body ? body[1] : line);
  }
  return { complete: false, code: state.code, lines: state.lines, consumed, violation: false };
}

/* ---- Passive-mode parse (RESEARCH Pattern 3) ----
   EPSV (RFC 2428): the port is the ONLY datum. PASV (RFC 959): six
   decimals, port = p1*256 + p2 — the embedded h1-h4 address is NEVER
   dialed (control-host rule, T-97-02). */
export function parseEpsvPort(line) {
  const m = /\(\|\|\|(\d+)\|\)/.exec(String(line ?? ''));
  return m ? Number(m[1]) : null;
}

export function parsePasvPort(line) {
  const m = /\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/.exec(String(line ?? ''));
  return m ? Number(m[5]) * 256 + Number(m[6]) : null;
}

/* =====================================================================
   KEYED ERROR FACTORY (D-04, mirror of s3ErrorFrom)
   =====================================================================
   4xx = transient (ftpTransient true, retry path) / 5xx = permanent.
   Message is scrubbed (PASS/USER never appear) and sliced (300 chars). */
export function ftpErrorFrom(code, text, context = '') {
  const CLASSES = {
    530: 'ftpAuthFailed',      // login incorrect
    550: 'ftpPathNotFound',    // file/dir unavailable
    552: 'ftpQuotaExceeded',   // exceeded storage allocation
    426: 'ftpTransferAborted', // connection closed; transfer aborted
    421: 'ftpUnreachable',     // service not available / idle timeout
  };
  const scrubbed = scrubTranscript(text);
  const raw = `ftp ${code}: ${scrubbed}${context ? ` ${context}` : ''}`.trim();
  const err = new Error(sliceError(new Error(raw)));
  err.code = CLASSES[code] || 'ftpGeneric';
  err.ftpCode = code;
  err.ftpTransient = code >= 400 && code < 500;
  return err;
}

function keyedError(code, text, context = '') {
  const err = ftpErrorFrom(code, text, context);
  err.ftpCode = code;
  return err;
}

/* =====================================================================
   CONTROL CHANNEL (one command in flight, never pipelined)
   ===================================================================== */

const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;

function attachControl(socket, config, opts) {
  const ctl = {
    socket,
    config,
    opts,
    buf: '',
    replyState: createReplyState(),
    pending: null,
    transferDepth: 0,   // data transfer in flight (NOOP gate)
    noopSwallowed: 0,   // stray 2xx counter (OQ-2 debug surface)
    dataSocks: new Set(),
    closed: false,
    fatal: null,
    session: undefined, // TLS session captured once (P8)
    noopTimer: null,    // D-03 keep-alive (armed post-connect)
  };
  bindControl(ctl, socket);
  return ctl;
}

/* (Re)bind the control handlers to `sock` — the explicit-TLS upgrade
   swaps the transport mid-session (RFC 4217) and all state carries over
   (buf empty at that point, pending null). Handlers read ctl.socket
   dynamically so the swap is a rebind, not a rewrite. */
function bindControl(ctl, sock) {
  ctl.socket = sock;
  sock.on('data', (chunk) => {
    ctl.buf += chunk.toString('utf8');
    drainReplies(ctl);
  });
  sock.on('timeout', () => {
    /* Node does NOT destroy on 'timeout' — we own the destroy (P1). */
    const p = ctl.pending;
    ctl.socket.destroy();
    destroyDataSocks(ctl);
    const err = keyedError(421, `timed out waiting for a reply${p?.line ? ` after ${scrubFtpLine(p.line)}` : ''}`);
    err.code = p?.line?.startsWith('RETR ') ? 'ftpTransferAborted' : 'ftpUnreachable';
    failPending(ctl, p, err);
  });
  sock.on('error', (err) => {
    ctl.fatal = ctl.fatal || keyedError(421, `control channel error: ${sliceError(err)}`);
    const p = ctl.pending;
    destroyDataSocks(ctl);
    failPending(ctl, p, ctl.fatal);
    ctl.socket.destroy();
  });
  sock.on('close', () => {
    ctl.closed = true;
    if (ctl.noopTimer) clearInterval(ctl.noopTimer);
    const wasTransfer = ctl.transferDepth > 0;
    destroyDataSocks(ctl);
    const err = keyedError(
      wasTransfer ? 426 : 421,
      'control channel closed by the server',
    );
    err.code = wasTransfer ? 'ftpTransferAborted' : 'ftpUnreachable'; // P5
    failPending(ctl, ctl.pending, err);
  });
}

function destroyDataSocks(ctl) {
  for (const s of ctl.dataSocks) {
    try { s.destroy(); } catch { /* already gone */ }
  }
  ctl.dataSocks.clear();
}

function failPending(ctl, p, err) {
  if (!p) return;
  if (ctl.pending === p) ctl.pending = null;
  try { reject(p, err); } catch { /* already settled */ }
}

function reject(p, err) {
  p.reject(err);
}

function drainReplies(ctl) {
  for (;;) {
    const r = parseReply(ctl.buf, ctl.replyState);
    ctl.buf = ctl.buf.slice(r.consumed);
    if (r.violation) {
      /* T-97-03: malformed server reply → keyed ftpGeneric, never a crash. */
      const err = keyedError(500, `protocol violation: ${r.lines.join(' | ')}`);
      ctl.fatal = ctl.fatal || err;
      ctl.socket.destroy();
      failPending(ctl, ctl.pending, err);
      return;
    }
    if (!r.complete) return;
    handleReply(ctl, r);
    if (!ctl.pending && ctl.closed) return;
  }
}

function handleReply(ctl, r) {
  const code = r.code;
  /* Interim 1xx: drained — keep awaiting the next final (150 → 226). */
  if (code >= 100 && code < 200) return;
  const p = ctl.pending;
  if (!p) {
    /* No command pending: a stray 2xx (NOOP echo during a transfer) is
       swallowed and counted — never resolves anything (P4/OQ-2). */
    if (code >= 200 && code < 300) ctl.noopSwallowed++;
    return;
  }
  /* Expectation-qualified dispatch: while a transfer final is awaited,
     an unexpected 2xx (the NOOP's 200) is swallowed, NOT a resolution. */
  if (p.expect && code >= 200 && code < 300 && !p.expect.includes(code)) {
    ctl.noopSwallowed++;
    return;
  }
  ctl.pending = null;
  ctl.socket.setTimeout(0);
  if (code >= 400) {
    destroyDataSocks(ctl);
    p.reject(ftpErrorFrom(code, r.lines.join(' '), p.context));
    return;
  }
  p.resolve({ code, lines: r.lines });
}

function armPending(ctl, pending) {
  ctl.pending = pending;
  ctl.socket.setTimeout(ctl.opts.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS);
}

function sendCommand(ctl, line, { expect = null, context = '' } = {}) {
  return new Promise((resolve, reject) => {
    if (ctl.pending) {
      reject(new Error('ftp: a command is already in flight (one-command-in-flight discipline)'));
      return;
    }
    if (ctl.fatal || ctl.closed) {
      reject(ctl.fatal || keyedError(421, 'control channel is closed'));
      return;
    }
    armPending(ctl, { resolve, reject, expect, context, line });
    ctl.socket.write(line + '\r\n');
  });
}

/* Await a reply WITHOUT sending a command (greeting). */
function awaitReply(ctl, context = '') {
  return new Promise((resolve, reject) => {
    if (ctl.pending) {
      reject(new Error('ftp: a command is already in flight'));
      return;
    }
    armPending(ctl, { resolve, reject, expect: null, context, line: '' });
  });
}

/* =====================================================================
   DATA CHANNEL (passive mode; control-host rule, T-97-02)
   =====================================================================
   secure !== 'none' → tls.connect with the P8 session-reuse pair:
   the control socket's session is passed as the `session` option of
   EVERY data-channel connect (pure-ftpd/FileZilla/hardened vsftpd
   abort data handshakes without it). servername stays the honest
   dial host even under a pasvHost override. minVersion TLSv1.2;
   rejectUnauthorized from `insecure`. Never PROT C. */

function dataTlsFailed(err) {
  const e = new Error(sliceError(new Error(`ftp data-channel TLS failed: ${sliceError(err)}`)));
  e.code = 'ftpTlsFailed';
  e.ftpCode = null;
  e.ftpTransient = false;
  return e;
}

function dialData(ctl, dialHost, port) {
  const cfg = ctl.config;
  if (cfg.secure === 'none') {
    return new Promise((resolve, reject) => {
      const sock = net.connect(port, dialHost);
      sock.once('connect', () => resolve(sock));
      sock.once('error', (err) => {
        const e = keyedError(421, `data channel connect failed: ${sliceError(err)}`);
        e.code = 'ftpPassiveFailed';
        reject(e);
      });
    });
  }
  return new Promise((resolve, reject) => {
    const sock = tls.connect({
      host: dialHost,
      port,
      session: ctl.session,          // P8: session reuse on EVERY data connect
      servername: dialHost,          // honest SNI even under pasvHost override
      rejectUnauthorized: !cfg.insecure,
      minVersion: 'TLSv1.2',
    });
    sock.once('secureConnect', () => resolve(sock));
    sock.once('error', (err) => reject(dataTlsFailed(err)));
  });
}

function passiveFailed(res) {
  const err = ftpErrorFrom(
    res?.code ?? 500,
    res?.lines?.join(' ') ?? '',
    'passive mode (EPSV and PASV both failed — check the server PASV port range / firewall)',
  );
  err.code = 'ftpPassiveFailed';
  return err;
}

async function connectData(ctl, port) {
  /* Control-host rule: NEVER dial the server-announced address (P3). */
  const dialHost = ctl.config.pasvHost || ctl.config.host;
  const sock = await dialData(ctl, dialHost, port);
  ctl.dataSocks.add(sock);
  sock.once('close', () => ctl.dataSocks.delete(sock));
  return sock;
}

async function openDataChannel(ctl) {
  /* EPSV first; NEVER EPSV ALL (P7). A 5xx to EPSV (pre-RFC 2428
     servers) falls back to PASV once per transfer; both failing →
     keyed ftpPassiveFailed. sendCommand rejects on 4xx/5xx finals,
     so each attempt is caught and classified here. */
  try {
    const res = await sendCommand(ctl, 'EPSV', { context: 'passive' });
    if (res.code === 229) {
      const port = parseEpsvPort(`229 ${res.lines.join(' ')}`);
      if (port !== null) return connectData(ctl, port);
    }
  } catch { /* EPSV unsupported/failed — PASV fallback below */ }
  let pasvRes = null;
  try {
    pasvRes = await sendCommand(ctl, 'PASV', { context: 'passive' });
    if (pasvRes.code === 227) {
      const port = parsePasvPort(`227 ${pasvRes.lines.join(' ')}`);
      if (port !== null) return connectData(ctl, port);
      throw passiveFailed({ code: pasvRes.code, lines: [`unparsable PASV reply: ${pasvRes.lines.join(' ')}`] });
    }
  } catch (e) {
    if (e?.code === 'ftpPassiveFailed') throw e;
    throw passiveFailed(e?.ftpCode ? { code: e.ftpCode, lines: [e.message] } : pasvRes);
  }
  throw passiveFailed(pasvRes);
}

/* =====================================================================
   TRANSFERS
   ===================================================================== */

async function storOnce(ctl, targetPath, stream) {
  const dataSock = await openDataChannel(ctl);
  ctl.transferDepth++;
  const finalP = sendCommand(ctl, `STOR ${targetPath}`, {
    expect: [226],
    context: targetPath,
  });
  /* If the control channel rejects first (426), kill the pipe. */
  finalP.catch(() => { try { dataSock.destroy(); } catch { /* gone */ } });
  let pipeErr = null;
  try {
    await pipeline(stream, dataSock);
  } catch (e) {
    pipeErr = e;
  }
  try {
    const res = await finalP;
    return res;
  } catch (e) {
    try { dataSock.destroy(); } catch { /* gone */ }
    throw e;
  } finally {
    ctl.transferDepth--;
  }
}

/* =====================================================================
   RESTORE SEAM (D-02, mirrors s3.js downloadToStaged :380-408)
   =====================================================================
   Single-shot RETR (OQ-1): RETR stream → hashTap Transform → staged
   file → sha256 vs expectedSha256 → keyed mismatch + temp removed.
   REST is implemented (rest(), expect 350) for RETR use only — the
   resume LOOP is deliberately NOT wired here in 97; a stream-level
   verify failure keys ftpChecksumFailed, a digest mismatch keys
   ftpSha256Mismatch. */

async function retrTo(ctl, sourcePath, hashTap, out) {
  const dataSock = await openDataChannel(ctl);
  ctl.transferDepth++;
  const finalP = sendCommand(ctl, `RETR ${sourcePath}`, { expect: [226], context: sourcePath });
  finalP.catch(() => { try { dataSock.destroy(); } catch { /* gone */ } });
  let pipeErr = null;
  try {
    await pipeline(dataSock, hashTap, out);
  } catch (e) {
    pipeErr = e;
  }
  let finalErr = null;
  let res = null;
  try {
    res = await finalP;
  } catch (e) {
    finalErr = e;
  }
  ctl.transferDepth--;
  if (finalErr) {
    try { dataSock.destroy(); } catch { /* gone */ }
    throw finalErr;
  }
  if (pipeErr) {
    /* Stream-level verify failure — keyed ftpChecksumFailed (OQ-1). */
    const err = new Error(
      sliceError(new Error(`ftp download: RETR stream verify failed for ${sourcePath}: ${sliceError(pipeErr)}`)),
    );
    err.code = 'ftpChecksumFailed';
    err.ftpCode = null;
    err.ftpTransient = false;
    try { dataSock.destroy(); } catch { /* gone */ }
    throw err;
  }
  return res;
}

export async function fetchToStaged(config, sourcePath, expectedSha256, stagingDir, opts = {}) {
  fs.mkdirSync(stagingDir, { recursive: true });
  const tmpPath = path.join(stagingDir, `ftp-download-${process.pid}-${crypto.randomUUID().slice(0, 8)}.tmp`);
  const hash = crypto.createHash('sha256');
  const hashTap = new Transform({
    transform(chunk, _enc, cb) {
      hash.update(chunk);
      cb(null, chunk);
    },
  });
  const out = fs.createWriteStream(tmpPath);
  const ctl = await establish(config, opts);
  try {
    await retrTo(ctl, sourcePath, hashTap, out);
  } catch (e) {
    fs.rmSync(tmpPath, { force: true });
    try { ctl.socket.destroy(); } catch { /* gone */ }
    throw e;
  }
  const sha256 = hash.digest('hex');
  if (sha256 !== expectedSha256) {
    fs.rmSync(tmpPath, { force: true });
    try { ctl.socket.destroy(); } catch { /* gone */ }
    const err = new Error(
      sliceError(new Error(`ftp download: sha256 mismatch for ${sourcePath}: expected ${expectedSha256}, got ${sha256}`)),
    );
    err.code = 'ftpSha256Mismatch';
    err.ftpCode = null;
    err.ftpTransient = false;
    throw err;
  }
  try {
    await sendCommand(ctl, 'QUIT', { context: 'quit' });
  } catch { /* best-effort */ }
  try { ctl.socket.destroy(); } catch { /* gone */ }
  return { tmpPath, sha256 };
}

/* =====================================================================
   PROBE (OQ-3, mirrors probeS3 :344-371 keyed-result shape verbatim)
   =====================================================================
   Connect + STOR of a projects-studio-probe marker + DELE. Keyed result — the
   contract Phase 98 maps into refusals/toasts (no UI strings in 97):
   { ok: true,  key: 'success',    httpWarning }
   { ok: false, key: 'deleteFailed', warning: true }        — put OK, delete refused
   { ok: false, key: 'ftpAuthFailed' | 'ftpTlsFailed' |
                  'ftpPassiveFailed' | 'ftpPathNotFound' |
                  'ftpQuotaExceeded' }
   { ok: false, key: 'unreachable', error }                 — sliced (V14)
   httpWarning: true when secure === 'none' or insecure (R-3 keyed
   tlsInsecure-style warning parity — surfaced by 98's UI). */
function mapFtpProbeError(e, base) {
  const keyed = ['ftpAuthFailed', 'ftpTlsFailed', 'ftpPassiveFailed', 'ftpPathNotFound', 'ftpQuotaExceeded'];
  if (keyed.includes(e?.code)) return { ...base, key: e.code };
  return { ...base, key: 'unreachable', error: sliceError(e) };
}

export async function probeFtp(config, opts = {}) {
  const httpWarning = config.secure === 'none' || !!config.insecure;
  const base = { ok: false, key: null, warning: false, httpWarning };
  const ftp = connectFtp(config, opts);
  try {
    await ftp.connect();
  } catch (e) {
    return mapFtpProbeError(e, base);
  }
  const marker = `projects-studio-probe/probe-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.probe`;
  try {
    await ftp.stor(marker, Buffer.from('projects-studio probe'));
  } catch (e) {
    await ftp.quit().catch(() => {});
    return mapFtpProbeError(e, base);
  }
  try {
    await ftp.dele(marker);
  } catch (e) {
    await ftp.quit().catch(() => {});
    return { ...base, key: 'deleteFailed', warning: true };
  }
  await ftp.quit().catch(() => {});
  return { ...base, ok: true, key: 'success' };
}

function cmdExpect(ctl, line, okCodes, context = '') {
  return sendCommand(ctl, line, { context }).then((res) => {
    const codes = Array.isArray(okCodes) ? okCodes : [okCodes];
    if (!codes.includes(res.code)) throw ftpErrorFrom(res.code, res.lines.join(' '), context);
    return res;
  });
}

function tlsHandshakeFailed(stage, err) {
  const e = new Error(sliceError(new Error(`ftp TLS ${stage} failed: ${sliceError(err)}`)));
  e.code = 'ftpTlsFailed';
  e.ftpCode = null;
  e.ftpTransient = false;
  return e;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function establish(config, opts) {
  const secure = config.secure ?? 'explicit';
  const port = config.port ?? (secure === 'implicit' ? 990 : 21);
  let socket;
  if (secure === 'implicit') {
    /* P9: implicit = TLS from byte 0 on port ?? 990 — NO AUTH/PBSZ/PROT
       exchange; the transport swap is the constructor choice. */
    socket = tls.connect({
      host: config.host,
      port,
      servername: config.host,
      rejectUnauthorized: !config.insecure,
      minVersion: 'TLSv1.2',
    });
    try {
      await new Promise((resolve, reject) => {
        socket.once('secureConnect', resolve);
        socket.once('error', reject);
      });
    } catch (err) {
      try { socket.destroy(); } catch { /* gone */ }
      throw tlsHandshakeFailed('implicit connect', err);
    }
  } else {
    socket = net.connect(port, config.host);
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('error', (err) => reject(keyedError(421, `connect failed: ${sliceError(err)}`)));
    });
  }
  const ctl = attachControl(socket, config, opts);
  const greet = await awaitReply(ctl, 'greeting');
  if (greet.code !== 220) {
    socket.destroy();
    throw ftpErrorFrom(greet.code, greet.lines.join(' '), 'greeting');
  }
  if (secure === 'explicit') {
    /* RFC 4217 order is FIXED: AUTH TLS before credentials, PBSZ
       strictly before PROT. Never EPSV ALL here either. */
    const auth = await sendCommand(ctl, 'AUTH TLS', { context: 'auth-tls' });
    if (auth.code !== 234) {
      ctl.socket.destroy();
      throw tlsHandshakeFailed('upgrade', ftpErrorFrom(auth.code, auth.lines.join(' '), 'AUTH TLS refused'));
    }
    let tlsSock;
    try {
      tlsSock = tls.connect({
        socket, // same-socket upgrade (A2)
        servername: config.host,
        rejectUnauthorized: !config.insecure,
        minVersion: 'TLSv1.2',
      });
      await new Promise((resolve, reject) => {
        tlsSock.once('secureConnect', resolve);
        tlsSock.once('error', reject);
      });
    } catch (err) {
      try { socket.destroy(); } catch { /* gone */ }
      throw tlsHandshakeFailed('upgrade', err);
    }
    /* Swap the transport: plaintext handlers off, TLS handlers on —
       all parser/pending state carries over (buf empty here). */
    socket.removeAllListeners();
    bindControl(ctl, tlsSock);
    /* P8: capture the session ONCE — every data-channel tls.connect
       gets it as its `session` option (incl. retry attempts). */
    ctl.session = tlsSock.getSession();
    await cmdExpect(ctl, 'PBSZ 0', 200, 'pbsz');
    await cmdExpect(ctl, 'PROT P', 200, 'prot');
  } else if (secure === 'implicit') {
    ctl.session = ctl.socket.getSession?.();
  }
  const u = await sendCommand(ctl, `USER ${config.user}`, { context: 'login' });
  if (u.code === 331) {
    /* 331 is a per-command reply (A5): proceed to PASS. */
    const p = await sendCommand(ctl, `PASS ${config.password}`, { context: 'login' });
    if (p.code !== 230) {
      ctl.socket.destroy();
      throw ftpErrorFrom(p.code, p.lines.join(' '), 'login');
    }
  } else if (u.code !== 230) {
    ctl.socket.destroy();
    throw ftpErrorFrom(u.code, u.lines.join(' '), 'login');
  }
  await cmdExpect(ctl, 'TYPE I', 200, 'binary mode');

  /* D-03: NOOP keep-alive — 60s const, fires ONLY while a data transfer
     is in flight (control idle awaiting the final reply). Never sent
     while a non-transfer control command is pending. Stray 2xx echoes
     are swallowed + counted by handleReply (P4/OQ-2). unref'd so the
     timer never keeps the process alive (P1 sanity). */
  const noopIntervalMs = (opts.noopIntervalS ?? FTP_NOOP_INTERVAL_S) * 1000;
  ctl.noopTimer = setInterval(() => {
    if (ctl.transferDepth > 0 && !ctl.closed && ctl.socket.writable) {
      ctl.socket.write('NOOP\r\n');
    }
  }, noopIntervalMs);
  ctl.noopTimer.unref?.();
  return ctl;
}

export function connectFtp(config, opts = {}) {
  /* Async factory: connects immediately, returns the D-01 client.
     `connect()` stays available and idempotent (await ftp.connect()). */
  const ctlP = establish(config, opts);
  const ensure = () => ctlP;

  /* ---- STOR retry helper (P6 ruling, s3.js uploadSinglePut idiom) ----
     Each attempt opens a FRESH passive channel and re-sends the WHOLE
     file from byte 0 of the immutable staged source. REST is NEVER
     sent on the upload path (RFC 3659 defines REST for RETR restart
     points only) — T10 pins zero `REST ` lines on the upload transcript.
     A string `source` is a staged file path → a fresh read stream per
     attempt (the D-88-16 whole-file re-read idiom); a stream source
     gets exactly one attempt (no re-read source). Only transient
     errors (4xx / ftpTransferAborted) are retried. */
  async function storWithRetry(ctl, targetPath, source, storOpts) {
    const attempts = storOpts.attempts ?? opts.attempts ?? 3;
    const backoffMs = storOpts.backoffMs ?? opts.backoffMs ?? (attempt => 500 * 2 ** (attempt - 1));
    let lastErr = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const stream = typeof source === 'string'
          ? fs.createReadStream(source, { highWaterMark: 1024 * 1024 })
          : Buffer.isBuffer(source)
            ? Readable.from([source])
            : source;
        await storOnce(ctl, targetPath, stream);
        return true;
      } catch (err) {
        lastErr = err;
        const transient = err?.ftpTransient === true || err?.code === 'ftpTransferAborted';
        if (attempt < attempts && transient) await sleep(backoffMs(attempt));
        else throw err;
      }
    }
    throw lastErr;
  }

  const ftp = {
    connect: async () => { await ctlP; },
    stor: async (targetPath, source, storOpts = {}) => {
      const ctl = await ensure();
      const stream = source && typeof source !== 'string' && !(source instanceof Readable) && typeof source.read !== 'function'
        ? Readable.from(source)
        : source;
      await storWithRetry(ctl, targetPath, stream, storOpts);
      return true;
    },
    dele: async (targetPath) => {
      const ctl = await ensure();
      await cmdExpect(ctl, `DELE ${targetPath}`, 250, targetPath);
      return true;
    },
    size: async (targetPath) => {
      const ctl = await ensure();
      const res = await cmdExpect(ctl, `SIZE ${targetPath}`, 213, targetPath);
      const n = Number((res.lines[0] || '').trim());
      if (!Number.isFinite(n)) throw keyedError(500, 'unparsable SIZE reply', targetPath);
      return n;
    },
    /* REST is RETR-only (P6): sets the restart point for a following
       RETR. NEVER valid on the STOR path — the upload retry is a full
       restart (T10 pins zero `REST ` lines on the upload transcript). */
    rest: async (offset) => {
      const ctl = await ensure();
      await cmdExpect(ctl, `REST ${Number(offset) | 0}`, 350, `restart@${offset}`);
      return true;
    },
    noop: async () => {
      const ctl = await ensure();
      await cmdExpect(ctl, 'NOOP', 200);
      return true;
    },
    quit: async () => {
      const ctl = await ensure().catch(() => null);
      if (!ctl) return;
      if (ctl.noopTimer) clearInterval(ctl.noopTimer);
      try {
        await sendCommand(ctl, 'QUIT', { context: 'quit' });
      } catch { /* best-effort — the socket goes either way */ }
      try { ctl.socket.destroy(); } catch { /* gone */ }
    },
    end: async () => ftp.quit(),
    /* Test/debug surface (not a user API): the OQ-2 swallow counter and
       the P8 session-capture flag. Phase 98 maps the keyed codes; this
       accessor never carries credentials. */
    __debug: async () => {
      const ctl = await ensure().catch(() => null);
      return { noopSwallowed: ctl?.noopSwallowed ?? 0, sessionCaptured: !!ctl?.session };
    },
  };
  return ftp;
}
