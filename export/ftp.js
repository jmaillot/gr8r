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
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

/* ---- Error slicing (V14: no headers, no secrets in error text) ---- */
export function sliceError(error) {
  return String(error?.message || error).slice(0, 300);
}

/* ---- Scrub helper (V14 parity: PASS/USER lines never survive) ---- */
export function scrubFtpLine(line) {
  return String(line).replace(/^(PASS|USER)\s+.*/i, (_m, cmd) => `${cmd.toUpperCase()} ***`);
}

/* Scrub every line of a reply transcript before it can reach an error. */
function scrubTranscript(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map(scrubFtpLine)
    .join('\n');
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
    session: undefined, // TLS session captured once (P8, Task 3)
  };

  socket.on('data', (chunk) => {
    ctl.buf += chunk.toString('utf8');
    drainReplies(ctl);
  });
  socket.on('timeout', () => {
    /* Node does NOT destroy on 'timeout' — we own the destroy (P1). */
    const p = ctl.pending;
    socket.destroy();
    destroyDataSocks(ctl);
    failPending(ctl, p, keyedError(421, `timed out waiting for a reply${p?.line ? ` after ${scrubFtpLine(p.line)}` : ''}`));
  });
  socket.on('error', (err) => {
    ctl.fatal = ctl.fatal || keyedError(421, `control channel error: ${sliceError(err)}`);
    const p = ctl.pending;
    destroyDataSocks(ctl);
    failPending(ctl, p, ctl.fatal);
    socket.destroy();
  });
  socket.on('close', () => {
    ctl.closed = true;
    const wasTransfer = ctl.transferDepth > 0;
    destroyDataSocks(ctl);
    const err = keyedError(
      wasTransfer ? 426 : 421,
      'control channel closed by the server',
    );
    err.code = wasTransfer ? 'ftpTransferAborted' : 'ftpUnreachable'; // P5
    failPending(ctl, ctl.pending, err);
  });
  return ctl;
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
   ===================================================================== */

function dialData(host, port, { secure, insecure, session, servername }) {
  /* Task 3 adds the TLS branch (session reuse, servername honesty). */
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, host);
    sock.once('connect', () => resolve(sock));
    sock.once('error', (err) => {
      const e = keyedError(421, `data channel connect failed: ${sliceError(err)}`);
      e.code = 'ftpPassiveFailed';
      reject(e);
    });
  });
}

async function openDataChannel(ctl) {
  const res = await sendCommand(ctl, 'EPSV', { context: 'passive' });
  if (res.code !== 229) {
    /* Task 3: EPSV → PASV fallback (once, per transfer). */
    throw ftpErrorFrom(res.code, res.lines.join(' '), 'EPSV');
  }
  const port = parseEpsvPort(`229 ${res.lines.join(' ')}`);
  if (port === null) {
    throw keyedError(500, 'unparsable EPSV reply', 'passive'); // → ftpGeneric via table miss? keep keyed
  }
  /* Control-host rule: NEVER dial the server-announced address. */
  const dialHost = ctl.config.pasvHost || ctl.config.host;
  const sock = await dialData(dialHost, port, {
    secure: ctl.config.secure !== 'none',
    insecure: ctl.config.insecure,
    session: ctl.session,
    servername: dialHost,
  });
  ctl.dataSocks.add(sock);
  sock.once('close', () => ctl.dataSocks.delete(sock));
  return sock;
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
   CLIENT FACTORY (D-01 promise API)
   ===================================================================== */

function cmdExpect(ctl, line, okCodes, context = '') {
  return sendCommand(ctl, line, { context }).then((res) => {
    const codes = Array.isArray(okCodes) ? okCodes : [okCodes];
    if (!codes.includes(res.code)) throw ftpErrorFrom(res.code, res.lines.join(' '), context);
    return res;
  });
}

async function establish(config, opts) {
  const secure = config.secure ?? 'explicit';
  const port = config.port ?? (secure === 'implicit' ? 990 : 21);
  /* Task 3: implicit mode = tls.connect from byte 0 (P9). */
  const socket = net.connect(port, config.host);
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', (err) => reject(keyedError(421, `connect failed: ${sliceError(err)}`)));
  });
  const ctl = attachControl(socket, config, opts);
  const greet = await awaitReply(ctl, 'greeting');
  if (greet.code !== 220) {
    socket.destroy();
    throw ftpErrorFrom(greet.code, greet.lines.join(' '), 'greeting');
  }
  if (secure === 'explicit') {
    /* Task 3: AUTH TLS → tls.connect({ socket }) upgrade → PBSZ 0 →
       PROT P → then credentials (RFC 4217 order). Task 1: slot only. */
  }
  const u = await sendCommand(ctl, `USER ${config.user}`, { context: 'login' });
  if (u.code === 331) {
    /* 331 is a per-command reply (A5): proceed to PASS. */
    const p = await sendCommand(ctl, `PASS ${config.password}`, { context: 'login' });
    if (p.code !== 230) {
      socket.destroy();
      throw ftpErrorFrom(p.code, p.lines.join(' '), 'login');
    }
  } else if (u.code !== 230) {
    socket.destroy();
    throw ftpErrorFrom(u.code, u.lines.join(' '), 'login');
  }
  await cmdExpect(ctl, 'TYPE I', 200, 'binary mode');
  return ctl;
}

export function connectFtp(config, opts = {}) {
  /* Async factory: connects immediately, returns the D-01 client.
     `connect()` stays available and idempotent (await ftp.connect()). */
  const ctlP = establish(config, opts);
  let connected = false;
  ctlP.then(() => { connected = true; }, () => { /* error surfaces via await */ });

  const ensure = () => ctlP;

  const ftp = {
    connect: async () => { await ctlP; },
    stor: async (targetPath, source, storOpts = {}) => {
      const ctl = await ensure();
      /* Retry support lands with the Task 3 full-restart helper (P6). */
      const stream = source && typeof source !== 'string' && !(source instanceof Readable) && typeof source.read !== 'function'
        ? Readable.from(source)
        : source;
      await storOnce(ctl, targetPath, stream);
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
    noop: async () => {
      const ctl = await ensure();
      await cmdExpect(ctl, 'NOOP', 200);
      return true;
    },
    quit: async () => {
      const ctl = await ensure().catch(() => null);
      if (!ctl) return;
      try {
        await sendCommand(ctl, 'QUIT', { context: 'quit' });
      } catch { /* best-effort — the socket goes either way */ }
      try { ctl.socket.destroy(); } catch { /* gone */ }
    },
    end: async () => ftp.quit(),
  };
  return ftp;
}
