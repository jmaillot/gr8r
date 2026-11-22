/* =====================================================================
   S3 PROBE + DOWNLOAD SEAM (local HTTP sink) — Phase 88 (88-01)
   =====================================================================
   Offline always-on unit tests against an in-process node:http sink
   (RESEARCH.md BKBCK-05d / BKBCK-05c idiom). The sink ignores
   signatures and answers by path/method so the keyed probe results
   (D-88-15) and the download seam (SC-5) are pinned deterministically.
   ===================================================================== */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { probeS3, downloadToStaged } from '../export/s3.js';

/* In-process S3-shaped sink. handler(req, res) keyed on method+path. */
function startSink(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

function sinkConfig(port, bucket = 'gr8r') {
  return {
    endpoint: `http://127.0.0.1:${port}`,
    bucket,
    accessKeyId: 'test',
    secretAccessKey: 'test-secret',
    region: 'us-east-1',
    pathStyle: true,
  };
}

const XML = (code) =>
  `<?xml version="1.0"?><Error><Code>${code}</Code><Message>msg</Message></Error>`;

test('probe: success (head ok, put ok, delete ok) on plain http carries httpWarning', async () => {
  const { server, port } = await startSink((req, res) => {
    if (req.method === 'HEAD') return res.writeHead(200).end();
    if (req.method === 'PUT') return res.writeHead(200).end();
    if (req.method === 'DELETE') return res.writeHead(204).end();
    res.writeHead(400).end();
  });
  try {
    const result = await probeS3(sinkConfig(port));
    assert.equal(result.ok, true);
    assert.equal(result.key, 'success');
    assert.equal(result.warning, false);
    assert.equal(result.httpWarning, true); // D-88-14: plain http warns
  } finally {
    server.close();
  }
});

test('probe: put succeeds but delete 403s → deleteFailed WARNING, never success (D-88-7/15)', async () => {
  const { server, port } = await startSink((req, res) => {
    if (req.method === 'HEAD') return res.writeHead(200).end();
    if (req.method === 'PUT') return res.writeHead(200).end();
    if (req.method === 'DELETE') return res.writeHead(403, { 'content-type': 'application/xml' }).end(XML('AccessDenied'));
    res.writeHead(400).end();
  });
  try {
    const result = await probeS3(sinkConfig(port));
    assert.equal(result.ok, false);
    assert.equal(result.key, 'deleteFailed');
    assert.equal(result.warning, true); // distinct warning class, not success
  } finally {
    server.close();
  }
});

test('probe: bad credentials → badCreds (never generic unreachable)', async () => {
  const { server, port } = await startSink((req, res) => {
    // HEAD responses carry no body — the code arrives via header (AWS S3 behavior)
    res.writeHead(403, { 'x-amz-error-code': 'InvalidAccessKeyId', 'content-type': 'application/xml' }).end(XML('InvalidAccessKeyId'));
  });
  try {
    const result = await probeS3(sinkConfig(port));
    assert.equal(result.ok, false);
    assert.equal(result.key, 'badCreds');
  } finally {
    server.close();
  }
});

test('probe: clock-skewed server → s3ClockSkew (SC-3, D-88-17)', async () => {
  const { server, port } = await startSink((req, res) => {
    res.writeHead(403, { 'x-amz-error-code': 'RequestTimeTooSkewed', 'content-type': 'application/xml' }).end(XML('RequestTimeTooSkewed'));
  });
  try {
    const result = await probeS3(sinkConfig(port));
    assert.equal(result.ok, false);
    assert.equal(result.key, 's3ClockSkew');
  } finally {
    server.close();
  }
});

test('probe: closed endpoint → unreachable', async () => {
  const result = await probeS3(sinkConfig(59999)); // port with no listener
  assert.equal(result.ok, false);
  assert.equal(result.key, 'unreachable');
  assert.equal(typeof result.error, 'string');
  assert.ok(result.error.length <= 300);
});

test('download seam: staged temp file lands, pipe-hash matches, returns path+sha256', async () => {
  const bytes = crypto.randomBytes(4096);
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  const { server, port } = await startSink((req, res) => {
    if (req.method === 'GET') return res.writeHead(200).end(bytes);
    res.writeHead(400).end();
  });
  try {
    const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-s3-dl-'));
    const result = await downloadToStaged(sinkConfig(port), 'backup-task-t1/a.tar.gz', sha, stagingDir);
    assert.equal(result.sha256, sha);
    assert.ok(fs.existsSync(result.tmpPath));
    assert.ok(result.tmpPath.startsWith(stagingDir));
    const onDisk = fs.readFileSync(result.tmpPath);
    assert.equal(crypto.createHash('sha256').update(onDisk).digest('hex'), sha);
    fs.rmSync(result.tmpPath, { force: true });
  } finally {
    server.close();
  }
});

test('download seam: corrupted body refuses with keyed sha256Mismatch and removes the temp file', async () => {
  const { server, port } = await startSink((req, res) => {
    res.writeHead(200).end('CORRUPTED');
  });
  try {
    const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-s3-dl-'));
    const goodSha = crypto.createHash('sha256').update('ORIGINAL').digest('hex');
    await assert.rejects(
      () => downloadToStaged(sinkConfig(port), 'backup-task-t1/a.tar.gz', goodSha, stagingDir),
      (err) => {
        assert.equal(err.s3Class, 'sha256Mismatch');
        assert.match(err.message, /sha256 mismatch/);
        return true;
      },
    );
    const leftovers = fs.readdirSync(stagingDir).filter((f) => f.endsWith('.tmp'));
    assert.equal(leftovers.length, 0, 'staged temp file removed on refusal');
  } finally {
    server.close();
  }
});
