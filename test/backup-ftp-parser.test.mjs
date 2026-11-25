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
