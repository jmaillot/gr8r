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
import { probeS3, downloadToStaged, s3Request } from '../export/s3.js';

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

/* =====================================================================
   UPLOAD EXECUTOR (88-03, SC-2) — thresholded single PUT / multipart
   mechanics against the same in-process sink. Stateful sink: stores
   objects + parts, records aborts and per-part attempt bytes so the
   retry-from-offset contract (D-88-16) is pinned byte-exactly.
   ===================================================================== */
import { uploadArchive, s3BackupKey, S3_MULTIPART_THRESHOLD, S3_PART_SIZE } from '../export/s3.js';

/* Stateful S3-shaped sink. opts.failPart: { partNumber, failTimes } makes
   that part's PUT return 503 the first N times it is attempted. */
function startS3Sink({ failPart = null, discard = false, completeErrorBody = false } = {}) {
  const state = {
    objects: new Map(), // key -> Buffer
    parts: new Map(), // uploadId -> Map(partNumber -> [Buffer, ...] per attempt)
    partAttempts: new Map(), // `${uploadId}:${partNumber}` -> count
    aborted: [],
    completed: [],
    initUploadIds: [],
  };
  let uploadIdCounter = 0;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://sink');
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const path = decodeURIComponent(url.pathname.replace(/^\/gr8r\/?/, ''));
      const respond = (status, payload = '', headers = {}) => {
        res.writeHead(status, headers);
        res.end(payload);
      };
      // CreateMultipartUpload: POST <key>?uploads=
      if (req.method === 'POST' && url.searchParams.has('uploads')) {
        const id = `upload-${++uploadIdCounter}`;
        state.initUploadIds.push(id);
        state.parts.set(id, new Map());
        return respond(200, `<?xml version="1.0"?><InitiateMultipartUploadResult><Bucket>gr8r</Bucket><Key>${path}</Key><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`);
      }
      // CompleteMultipartUpload: POST <key>?uploadId=
      if (req.method === 'POST' && url.searchParams.has('uploadId')) {
        const id = url.searchParams.get('uploadId');
        state.completed.push({ uploadId: id, body });
        if (completeErrorBody) {
          // MIN-06 regression input: HTTP 200 with an error in the body (S3 quirk)
          return respond(200, '<?xml version="1.0"?><Error><Code>InternalError</Code><Message>we committed it anyway</Message></Error>');
        }
        return respond(200, `<?xml version="1.0"?><CompleteMultipartUploadResult><Location>lo</Location><Bucket>gr8r</Bucket><Key>${path}</Key><ETag>"etag"</ETag></CompleteMultipartUploadResult>`);
      }
      // UploadPart: PUT <key>?partNumber=&uploadId=
      if (req.method === 'PUT' && url.searchParams.has('uploadId')) {
        const id = url.searchParams.get('uploadId');
        const n = Number(url.searchParams.get('partNumber'));
        const attemptKey = `${id}:${n}`;
        const attempt = (state.partAttempts.get(attemptKey) || 0) + 1;
        state.partAttempts.set(attemptKey, attempt);
        state.parts.get(id)?.set(n, [...(state.parts.get(id)?.get(n) || []), discard ? Buffer.alloc(0) : body]);
        if (failPart && failPart.partNumber === n && attempt <= failPart.failTimes) {
          return respond(503, XML('ServiceUnavailable'));
        }
        return respond(200, '', { etag: `"part-${n}-${attempt}"` });
      }
      // AbortMultipartUpload: DELETE <key>?uploadId=
      if (req.method === 'DELETE' && url.searchParams.has('uploadId')) {
        state.aborted.push(url.searchParams.get('uploadId'));
        return respond(204);
      }
      // Object PUT (single PUT or sidecar): PUT <key>
      if (req.method === 'PUT') {
        state.objects.set(path, { body, shaHeader: req.headers['x-amz-content-sha256'], contentType: req.headers['content-type'] });
        return respond(200);
      }
      // Object GET (stream-back verify): GET <key>
      if (req.method === 'GET') {
        const obj = state.objects.get(path);
        if (!obj) return respond(404, XML('NoSuchKey'));
        return respond(200, obj.body);
      }
      respond(400, XML('InvalidRequest'));
    });
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, state }));
  });
}

const KB = 1024;

test('executor: payload ≤ threshold goes as ONE signed PUT with explicit Content-Length + real payload hash, then the sidecar', async () => {
  const bytes = crypto.randomBytes(64 * KB);
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  const staged = path.join(os.tmpdir(), `gr8r-s3-up-${Date.now()}.bin`);
  fs.writeFileSync(staged, bytes);
  const { server, port, state } = await startS3Sink();
  try {
    const progress = [];
    const result = await uploadArchive(sinkConfig(port), staged, 'backup-task-t1/a.tar.gz', sha, (done, total) => progress.push([done, total]));
    assert.equal(result.mode, 'single');
    assert.equal(result.partsTotal, 1);
    const obj = state.objects.get('backup-task-t1/a.tar.gz');
    assert.ok(obj, 'object stored');
    assert.equal(obj.body.length, bytes.length);
    assert.equal(obj.body.toString('hex'), bytes.toString('hex'));
    assert.equal(obj.shaHeader, sha, 'x-amz-content-sha256 carries the REAL payload hash');
    assert.equal(obj.contentType, 'application/gzip'); // D-88-10
    const sidecar = state.objects.get('backup-task-t1/a.tar.gz.sha256');
    assert.ok(sidecar, 'sidecar uploaded (D-88-8)');
    assert.match(sidecar.body.toString('utf8'), new RegExp(`^${sha}  a\\.tar\\.gz`));
    assert.deepEqual(progress, [[1, 1]]);
  } finally {
    server.close();
    fs.rmSync(staged, { force: true });
  }
});

test('executor: payload above threshold goes CreateMultipartUpload → serial parts → Complete (serial 1-based)', async () => {
  const partSize = 2 * KB;
  const bytes = crypto.randomBytes(5 * partSize);
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  const staged = path.join(os.tmpdir(), `gr8r-s3-up-mp-${Date.now()}.bin`);
  fs.writeFileSync(staged, bytes);
  const { server, port, state } = await startS3Sink();
  try {
    const progress = [];
    const result = await uploadArchive(
      sinkConfig(port),
      staged,
      'backup-task-t1/big.tar.gz',
      sha,
      (done, total) => progress.push([done, total]),
      { thresholdBytes: 4 * KB, partSize, backoffMs: () => 1 },
    );
    assert.equal(result.mode, 'multipart');
    assert.equal(result.partsTotal, 5);
    assert.equal(state.initUploadIds.length, 1, 'one multipart initiated');
    assert.equal(state.aborted.length, 0);
    // Parts arrive serially (1-based) with exact byte ranges
    const received = [];
    for (let n = 1; n <= 5; n++) {
      const attempts = state.parts.get(state.initUploadIds[0]).get(n);
      assert.equal(attempts.length, 1, `part ${n}: exactly one attempt`);
      received.push(attempts[0]);
    }
    assert.equal(Buffer.concat(received).toString('hex'), bytes.toString('hex'), 'parts reassemble byte-identical');
    assert.equal(state.completed.length, 1, 'CompleteMultipartUpload issued');
    const completeXml = state.completed[0].body.toString('utf8');
    for (let n = 1; n <= 5; n++) assert.match(completeXml, new RegExp(`<PartNumber>${n}</PartNumber>`), `complete lists part ${n}`);
    assert.ok(state.objects.get('backup-task-t1/big.tar.gz.sha256'), 'sidecar uploaded after complete');
    assert.deepEqual(progress, [[1, 5], [2, 5], [3, 5], [4, 5], [5, 5]]);
  } finally {
    server.close();
    fs.rmSync(staged, { force: true });
  }
});

test('executor: a part failing twice then succeeding resumes from the SAME staged-file byte range, ≤3 attempts', async () => {
  const partSize = 2 * KB;
  const bytes = crypto.randomBytes(4 * partSize);
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  const staged = path.join(os.tmpdir(), `gr8r-s3-up-retry-${Date.now()}.bin`);
  fs.writeFileSync(staged, bytes);
  const { server, port, state } = await startS3Sink({ failPart: { partNumber: 2, failTimes: 2 } });
  try {
    const result = await uploadArchive(
      sinkConfig(port), staged, 'backup-task-t1/retry.tar.gz', sha,
      () => {},
      { thresholdBytes: 1, partSize, backoffMs: () => 1 },
    );
    assert.equal(result.mode, 'multipart');
    assert.equal(state.aborted.length, 0, 'no abort when a part recovers within the attempt budget');
    const parts = state.parts.get(state.initUploadIds[0]);
    assert.equal(parts.get(2).length, 3, 'part 2 attempted three times');
    const ok = parts.get(2)[2];
    assert.equal(ok.toString('hex'), bytes.subarray(partSize, 2 * partSize).toString('hex'), 'the retried attempt re-sends the SAME byte range (D-88-16)');
    for (const attempt of parts.get(2)) {
      assert.equal(attempt.toString('hex'), bytes.subarray(partSize, 2 * partSize).toString('hex'), 'EVERY attempt re-sends the SAME byte range (D-88-16: re-read from the immutable file)');
    }
    assert.equal(state.completed.length, 1);
  } finally {
    server.close();
    fs.rmSync(staged, { force: true });
  }
});

test('executor: a part failing 3 times triggers AbortMultipartUpload and rejects with the last error', async () => {
  const bytes = crypto.randomBytes(8 * KB);
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  const staged = path.join(os.tmpdir(), `gr8r-s3-up-abort-${Date.now()}.bin`);
  fs.writeFileSync(staged, bytes);
  const { server, port, state } = await startS3Sink({ failPart: { partNumber: 1, failTimes: 99 } });
  try {
    await assert.rejects(
      () => uploadArchive(
        sinkConfig(port), staged, 'backup-task-t1/aborted.tar.gz', sha,
        () => {},
        { thresholdBytes: 1, partSize: 4 * KB, backoffMs: () => 1 },
      ),
      (err) => {
        assert.match(err.message, /503/);
        return true;
      },
    );
    assert.equal(state.aborted.length, 1, 'AbortMultipartUpload issued (T-88-12)');
    assert.equal(state.aborted[0], state.initUploadIds[0], 'the aborted id is the initiated upload');
    assert.equal(state.completed.length, 0, 'no complete after abort');
  } finally {
    server.close();
    fs.rmSync(staged, { force: true });
  }
});

test('executor: memory stays bounded — every byte path is a createReadStream slice, never a whole-file buffer', async () => {
  /* GC-based rss probing is flaky (transient chunk garbage inflates RSS
     nondeterministically), so the bounded-memory truth is pinned the
     house way: a source assertion on the executor + the functional
     part-range reconstruction tests above (a whole-file buffer would
     make start/end slicing — and the byte-range retry pin — impossible). */
  const src = fs.readFileSync(new URL('../export/s3.js', import.meta.url), 'utf8');
  const executor = src.slice(src.indexOf('BACKUP UPLOAD EXECUTOR'));
  assert.ok(!executor.includes('readFileSync'), 'no readFileSync in the executor — never a whole-file Buffer');
  assert.ok(!executor.includes('readFile('), 'no readFile in the executor');
  assert.match(executor, /createReadStream\(stagedPath, \{ start, end, highWaterMark: 1024 \* 1024 \}\)/, 'parts stream as 1 MiB-bounded slices of the staged file');
  assert.match(executor, /sha256Range\(stagedPath, start, end\)/, 'part hashes stream from the same bounded ranges');
  /* Functional backstop: a file four times the part size uploads with
     exact serial ranges (proves slicing, not buffering, feeds the wire). */
  const partSize = 4 * KB;
  const bytes = crypto.randomBytes(3 * partSize);
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  const staged = path.join(os.tmpdir(), `gr8r-s3-up-bounded-${Date.now()}.bin`);
  fs.writeFileSync(staged, bytes);
  const { server, port, state } = await startS3Sink();
  try {
    const result = await uploadArchive(
      sinkConfig(port), staged, 'backup-task-t1/bounded.tar.gz', sha,
      () => {},
      { thresholdBytes: 1, partSize, backoffMs: () => 1 },
    );
    assert.equal(result.partsTotal, 3);
    const received = [];
    for (let n = 1; n <= 3; n++) received.push(state.parts.get(state.initUploadIds[0]).get(n)[0]);
    assert.equal(Buffer.concat(received).toString('hex'), bytes.toString('hex'), 'serial sliced ranges reassemble byte-identical');
  } finally {
    server.close();
    fs.rmSync(staged, { force: true });
  }
});

test('executor: threshold constants frozen at SC-2 values; s3BackupKey prefixes per D-88-6/9', () => {
  assert.equal(S3_MULTIPART_THRESHOLD, 512 * 1024 * 1024);
  assert.equal(S3_PART_SIZE, 64 * 1024 * 1024);
  assert.equal(s3BackupKey({ taskId: 't9' }, 'backup-task-slug-t9-1.tar.gz'), 'backup-task-t9/backup-task-slug-t9-1.tar.gz');
  assert.equal(s3BackupKey({}, 'backup-instance-1.tar.gz'), 'backup-manual/backup-instance-1.tar.gz');
  assert.equal(s3BackupKey(null, 'backup-instance-1.tar.gz'), 'backup-manual/backup-instance-1.tar.gz');
});

/* =====================================================================
   HOST CONSTRUCTION (MAJ-02) — path-style vs virtual-host addressing
   against a recording sink. The sink ignores signatures and answers
   200, but records the wire Host header and the request path so the
   addressing contract is pinned exactly: path-style keeps the bucket
   in the path; virtual-host (S3_PATH_STYLE=false) moves the bucket
   INTO the host and the signature signs the SAME host the wire uses.
   ===================================================================== */

test('host construction: path-style (default) keeps the bucket in the path, endpoint host unchanged', async () => {
  const seen = [];
  const { server, port } = await startSink((req, res) => {
    seen.push({ host: req.headers.host, url: req.url });
    res.writeHead(200).end();
  });
  try {
    await s3Request(sinkConfig(port), { method: 'PUT', key: 'backup-task-t1/a.tar.gz', body: Buffer.from('x') });
    assert.deepEqual(seen, [{ host: `127.0.0.1:${port}`, url: '/gr8r/backup-task-t1/a.tar.gz' }]);
  } finally {
    server.close();
  }
});

test('host construction: virtual-host mode (pathStyle false) addresses <bucket>.<host> and signs that host', async () => {
  const seen = [];
  const { server, port } = await startSink((req, res) => {
    seen.push({ host: req.headers.host, url: req.url, auth: req.headers.authorization });
    res.writeHead(200).end();
  });
  try {
    const config = { ...sinkConfig(port), pathStyle: false };
    await s3Request(config, { method: 'PUT', key: 'backup-task-t1/a.tar.gz', body: Buffer.from('x') });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].host, `gr8r.127.0.0.1:${port}`, 'the bucket is prepended to the endpoint host');
    assert.equal(seen[0].url, '/backup-task-t1/a.tar.gz', 'the path carries the key only');
    /* The signature's SignedHeaders set must carry `host` — the signer signs
       the same virtual host the wire uses, so a real provider accepts it. */
    assert.match(seen[0].auth, /SignedHeaders=[^;]*host/, 'the virtual host is inside the signed header set');
  } finally {
    server.close();
  }
});

test('host construction: an endpoint path prefix is preserved in both addressing styles', async () => {
  const seen = [];
  const { server, port } = await startSink((req, res) => {
    seen.push({ host: req.headers.host, url: req.url });
    res.writeHead(200).end();
  });
  try {
    await s3Request({ ...sinkConfig(port), endpoint: `http://127.0.0.1:${port}/alias` }, { method: 'PUT', key: 'k.bin', body: Buffer.from('x') });
    await s3Request({ ...sinkConfig(port), endpoint: `http://127.0.0.1:${port}/alias`, pathStyle: false }, { method: 'PUT', key: 'k.bin', body: Buffer.from('x') });
    assert.deepEqual(seen, [
      { host: `127.0.0.1:${port}`, url: '/alias/gr8r/k.bin' },
      { host: `gr8r.127.0.0.1:${port}`, url: '/alias/k.bin' },
    ]);
  } finally {
    server.close();
  }
});

test('host construction: virtual-host mode with no key (HeadBucket) targets the bucket host root', async () => {
  const seen = [];
  const { server, port } = await startSink((req, res) => {
    seen.push({ host: req.headers.host, url: req.url, method: req.method });
    res.writeHead(200).end();
  });
  try {
    await s3Request({ ...sinkConfig(port), pathStyle: false }, { method: 'HEAD' });
    assert.deepEqual(seen, [{ host: `gr8r.127.0.0.1:${port}`, url: '/', method: 'HEAD' }]);
  } finally {
    server.close();
  }
});

/* =====================================================================
   REVIEW-FIX REGRESSIONS (MIN-04/05/06)
   ===================================================================== */

test('min-05: an early error response destroys the piped request stream (no orphaned read stream)', async () => {
  const { server, port } = await startSink((req, res) => {
    res.writeHead(503, { 'content-type': 'application/xml' }).end(XML('ServiceUnavailable'));
  });
  try {
    const staged = path.join(os.tmpdir(), `gr8r-s3-destroy-${Date.now()}.bin`);
    fs.writeFileSync(staged, crypto.randomBytes(64 * KB));
    const stream = fs.createReadStream(staged, { highWaterMark: 1024 * 1024 });
    try {
      await assert.rejects(
        () => s3Request(sinkConfig(port), {
          method: 'PUT',
          key: 'k.bin',
          body: stream,
          bodyLength: 64 * KB,
          payloadHash: crypto.createHash('sha256').update(fs.readFileSync(staged)).digest('hex'),
        }),
        (err) => {
          assert.match(err.message, /503/);
          return true;
        },
      );
      assert.equal(stream.destroyed, true, 'the source stream is destroyed once the error response arrives');
    } finally {
      fs.rmSync(staged, { force: true });
    }
  } finally {
    server.close();
  }
});

test('min-06: a Complete answered 200-with-<Error> does NOT abort the committed transaction and hints the object may exist', async () => {
  const partSize = 2 * KB;
  const bytes = crypto.randomBytes(2 * partSize);
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  const staged = path.join(os.tmpdir(), `gr8r-s3-complete-err-${Date.now()}.bin`);
  fs.writeFileSync(staged, bytes);
  const { server, port, state } = await startS3Sink({ completeErrorBody: true });
  try {
    await assert.rejects(
      () => uploadArchive(
        sinkConfig(port), staged, 'backup-task-t1/comp-err.tar.gz', sha,
        () => {},
        { thresholdBytes: 1, partSize, backoffMs: () => 1 },
      ),
      (err) => {
        assert.match(err.message, /object may exist/);
        return true;
      },
    );
    assert.equal(state.aborted.length, 0, 'no abort after the provider accepted the Complete (MIN-06)');
    assert.equal(state.completed.length, 1);
  } finally {
    server.close();
    fs.rmSync(staged, { force: true });
  }
});

test('min-04: cancellation between multipart parts aborts the transaction and rejects with the cancelled error', async () => {
  const partSize = 2 * KB;
  const bytes = crypto.randomBytes(4 * partSize);
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  const staged = path.join(os.tmpdir(), `gr8r-s3-cancel-${Date.now()}.bin`);
  fs.writeFileSync(staged, bytes);
  const { server, port, state } = await startS3Sink();
  try {
    // Simulate a shutdown flip after the first part lands (MIN-04: cancel at the upload boundary)
    let cancelled = false;
    await assert.rejects(
      () => uploadArchive(
        sinkConfig(port), staged, 'backup-task-t1/cancel.tar.gz', sha,
        () => { cancelled = true; },
        { thresholdBytes: 1, partSize, backoffMs: () => 1, isCancelled: () => cancelled },
      ),
      (err) => {
        assert.match(err.message, /cancelled/);
        return true;
      },
    );
    assert.equal(state.aborted.length, 1, 'AbortMultipartUpload issued for the cancelled upload');
    assert.equal(state.aborted[0], state.initUploadIds[0]);
    assert.equal(state.completed.length, 0, 'no Complete after cancellation');
    const uploaded = state.parts.get(state.initUploadIds[0]);
    assert.equal(uploaded.get(1).length, 1, 'part 1 completed before the cancellation landed');
    assert.ok(!uploaded.has(3), 'upload stopped at the part boundary');
  } finally {
    server.close();
    fs.rmSync(staged, { force: true });
  }
});

test('min-01: NoSuchBucket probe failures surface their own s3NoBucket class, not generic unreachable', async () => {
  const { server, port } = await startSink((req, res) => {
    // HEAD responses carry no body — the code arrives via header (AWS S3 behavior)
    res.writeHead(404, { 'x-amz-error-code': 'NoSuchBucket', 'content-type': 'application/xml' }).end(XML('NoSuchBucket'));
  });
  try {
    const result = await probeS3(sinkConfig(port));
    assert.equal(result.ok, false);
    assert.equal(result.key, 's3NoBucket');
  } finally {
    server.close();
  }
});

