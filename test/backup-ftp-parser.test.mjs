/* =====================================================================
   Phase 97 plan 01 — FTP reply-parser golden vectors (97-01, SC-3).

   Offline, ungated, always-on (D-88-18 parity): these tests exercise
   the PURE contract surface of export/ftp.js — no sockets, no env
   gate — mirroring the SigV4 golden-vector suite idiom
   (test/backup-s3-sigv4.test.mjs). The wire bytes ARE the contract.
   ===================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseReply,
  createReplyState,
  parseEpsvPort,
  parsePasvPort,
  ftpErrorFrom,
  scrubFtpLine,
} from '../export/ftp.js';

test('golden vector: multiline 2xx with embedded same-code body line (P2 pin)', () => {
  const r = parseReply('200-Command okay\r\n200-body starts with 200- digits\r\n200 done\r\n');
  assert.equal(r.complete, true);
  assert.equal(r.code, 200);
  assert.deepEqual(r.lines, ['Command okay', 'body starts with 200- digits', 'done']);
  assert.equal(r.consumed, '200-Command okay\r\n200-body starts with 200- digits\r\n200 done\r\n'.length);
});

test('golden vector: EPSV 229 port parse', () => {
  assert.equal(parseEpsvPort('229 Entering Extended Passive Mode (|||31745|)'), 31745);
});

test('golden vector: PASV 227 port math p1*256+p2', () => {
  assert.equal(parsePasvPort('227 Entering Passive Mode (192,168,1,5,123,78)'), 31566);
  assert.equal(123 * 256 + 78, 31566);
});

/* ---- T1: terminator + feed-accumulation contract ---- */

test('bare-code terminator closes a multiline reply (RFC 959 bare NNN)', () => {
  const r = parseReply('200-Command okay\r\n200-body\r\n200\r\n');
  assert.equal(r.complete, true);
  assert.equal(r.code, 200);
  assert.deepEqual(r.lines, ['Command okay', 'body', '']);
});

test('a body line merely starting with the same digits does NOT close the multiline (P2)', () => {
  const r = parseReply('200-first\r\n200-hello 200-looks-final\r\n200 done\r\n');
  assert.equal(r.complete, true);
  assert.equal(r.code, 200);
  assert.deepEqual(r.lines, ['first', 'hello 200-looks-final', 'done']);
});

test('partial feed split mid-line accumulates via consumed', () => {
  const feed1 = '200-Command okay\r\n200-body start';
  const state = createReplyState();
  const half = parseReply(feed1, state);
  assert.equal(half.complete, false);
  assert.equal(half.consumed, '200-Command okay\r\n'.length, 'only complete lines consumed');
  const rest = parseReply(feed1.slice(half.consumed) + 's with 200- digits\r\n200 done\r\n', state);
  assert.equal(rest.complete, true);
  assert.equal(rest.code, 200);
  assert.deepEqual(rest.lines, ['Command okay', 'body starts with 200- digits', 'done']);
});

test('non-matching line in fresh state = protocol violation (T-97-03)', () => {
  const r = parseReply('garbage without a code\r\n');
  assert.equal(r.complete, true);
  assert.equal(r.code, null);
  assert.equal(r.violation, true);
});

/* ---- T3: passive-parse failure paths ---- */

test('parseEpsvPort returns null on a non-229 line / malformed pasv → null', () => {
  assert.equal(parseEpsvPort('550 No such file'), null);
  assert.equal(parsePasvPort('227 garbage (a,b,c,d,e,f)'), null);
  assert.equal(parsePasvPort('nothing here'), null);
  assert.equal(parseEpsvPort('229 no parens'), null);
});

/* ---- T4: keyed classification + transient flags ---- */

test('ftpErrorFrom pins the five RFC classes + generic (T4)', () => {
  assert.equal(ftpErrorFrom(530, 'Login incorrect').code, 'ftpAuthFailed');
  assert.equal(ftpErrorFrom(550, 'File not found').code, 'ftpPathNotFound');
  assert.equal(ftpErrorFrom(552, 'Exceeded storage allocation').code, 'ftpQuotaExceeded');
  assert.equal(ftpErrorFrom(426, 'Connection closed; transfer aborted').code, 'ftpTransferAborted');
  assert.equal(ftpErrorFrom(421, 'Service not available').code, 'ftpUnreachable');
  assert.equal(ftpErrorFrom(500, 'Unknown command').code, 'ftpGeneric');
});

test('4xx sets ftpTransient=true, 5xx sets false (T4)', () => {
  assert.equal(ftpErrorFrom(426, 'aborted').ftpTransient, true);
  assert.equal(ftpErrorFrom(421, 'unavailable').ftpTransient, true);
  assert.equal(ftpErrorFrom(530, 'login').ftpTransient, false);
  assert.equal(ftpErrorFrom(550, 'no file').ftpTransient, false);
  assert.equal(ftpErrorFrom(426, 'aborted').ftpCode, 426);
});

/* ---- T7: scrub discipline (V14 parity, mirrors sigv4 :209-217) ---- */

test('scrub: PASS line + password never appear in err.message for a 530 transcript (T7)', () => {
  const secret = 'gr8r-super-secret-pw';
  const transcript = `USER gr8r\r\n530 Login incorrect (PASS ${secret} was rejected)\r\n`;
  const err = ftpErrorFrom(530, transcript);
  assert.equal(err.message.includes(secret), false, 'raw password scrubbed from error text');
  assert.ok(err.message.length <= 300, 'message sliced to 300 chars');
  assert.equal(err.code, 'ftpAuthFailed');
});

test('scrubFtpLine replaces PASS/USER commands with CMD *** (case-insensitive)', () => {
  assert.equal(scrubFtpLine('PASS secret123'), 'PASS ***');
  assert.equal(scrubFtpLine('pass secret123'), 'PASS ***');
  assert.equal(scrubFtpLine('USER gr8r'), 'USER ***');
  assert.equal(scrubFtpLine('STOR /backup/x.bin'), 'STOR /backup/x.bin');
});

test('error message is sliced to 300 chars (V14)', () => {
  const err = ftpErrorFrom(500, 'x'.repeat(1000));
  assert.ok(err.message.length <= 320, 'message sliced');
});
