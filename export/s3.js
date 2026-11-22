/* =====================================================================
   S3 DESTINATION CORE — Phase 88 (88-01, BKBCK-05)
   =====================================================================
   Server-only hand-rolled S3 client on Node stdlib. Zero npm deps
   (D-33-11). Lives at the repository ROOT beside export/backup.js —
   never under src/ (the prohibition test).

   Frozen cross-phase decisions (88-CONTEXT D-88-1..18):
   - D-88-1 local-first: this module NEVER touches local archives; it
     only streams bytes to/from a remote S3-compatible endpoint.
   - D-88-8: sha256 verification via stream-back + `<key>.sha256`
     sidecar — ETag is NEVER read outside logging.
   - D-88-10: minimal headers only (Content-Type + Content-Length +
     host/x-amz-content-sha256/x-amz-date). No SSE, no storage-class,
     no per-provider header special-casing (Pitfall 3).
   - D-88-13: no provider auto-detection, no scheme guessing. Path-
     style URLs by default; region defaults us-east-1 (D-88-13/14).
   - D-88-15: probe = HeadBucket + write+delete marker; keyed results;
     probe is the ONLY sanctioned delete (D-88-7 carve-out).
   - D-88-16: multipart retries re-read the immutable staged file.
   - D-88-17: RequestTimeTooSkewed maps to err.s3ClockSkew — a distinct
     keyed class, never generic bad-creds (SC-3).

   SigV4 implementation (RESEARCH.md §"SigV4 implementation pattern",
   AWS-docs-cited; pinned by golden vectors in
   test/backup-s3-sigv4.test.mjs):
   - x-amz-content-sha256 carries the REAL payload hash — never
     UNSIGNED-PAYLOAD, never STREAMING-* (third-party servers reject
     trailers; Garage #824).
   - The header object is built ONCE and drives canonical-headers +
     signed-headers + wire headers from the same source (Pitfall 3).
   - Explicit Content-Length always (Pitfall 6); no chunked uploads.
   - Keys URI-encoded per S3 rules (encode everything except unreserved
     chars and '/'; %XX uppercase — Pitfall 2).

   Error discipline (V14 / T-88-01): error text is sliced via
   String(error?.message || error).slice(0, 300); the Authorization
   header and any secret NEVER enter error objects or logs.

   Request surface consumed by plans 02/03:
   - sigv4Sign / s3UriEncode   — the signature bytes are the contract
   - s3Request                 — signed request executor (http/https by
                                 endpoint scheme; no http2)
   - headBucket / createBucket / putObject / getObject / deleteObject
   - probeS3                   — keyed probe (Task 3, D-88-15)
   - downloadToStaged          — Phase 89 restore seam (Task 3, SC-5)
   ===================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

/* ---- Error slicing (V14: no headers, no secrets in error text) ---- */
export function sliceError(error) {
  return String(error?.message || error).slice(0, 300);
}

/* ---- S3-rule URI encoding (Pitfall 2) ----
   Encode everything except unreserved chars (A-Za-z0-9 - . _ ~) and
   '/'; %XX uppercase, UTF-8 bytes. Never encode '/'. */
export function s3UriEncode(str) {
  return String(str).replace(/[^A-Za-z0-9\-._~\/]/g, (ch) =>
    [...Buffer.from(ch, 'utf8')]
      .map((b) => '%' + b.toString(16).toUpperCase())
      .join(''),
  );
}

/* ---- SigV4 signer (pinned by AWS-documented golden vectors) ----
   Returns a wire-header object (lowercase keys) that includes exactly
   the signed set + Authorization. `path` must already be S3-encoded;
   `query` values are S3-encoded here. payloadHash is the REAL hash. */
export function sigv4Sign({
  method,
  host,
  path,
  query = {},
  extraHeaders = {},
  payloadHash,
  accessKeyId,
  secretAccessKey,
  region = 'us-east-1',
  amzDate,
}) {
  const headers = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  for (const [k, v] of Object.entries(extraHeaders || {})) {
    headers[String(k).toLowerCase()] = String(v).trim();
  }
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${headers[n]}\n`).join('');
  const signedHeaders = names.join(';');
  const canonicalQuery = Object.entries(query)
    .map(([k, v]) => `${s3UriEncode(k)}=${s3UriEncode(v)}`)
    .sort()
    .join('&');
  const canonicalRequest = [
    String(method).toUpperCase(),
    path,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const scope = `${amzDate.slice(0, 8)}/${region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const key = signingKey(secretAccessKey, amzDate.slice(0, 8), region);
  const signature = crypto.createHmac('sha256', key).update(stringToSign).digest('hex');
  headers.authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope},` +
    `SignedHeaders=${signedHeaders},Signature=${signature}`;
  return headers;
}

function signingKey(secretAccessKey, shortDate, region) {
  const kDate = hmac(Buffer.from('AWS4' + secretAccessKey), shortDate);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, 's3');
  return hmac(kService, 'aws4_request');
}

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function amzDateNow() {
  return new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
}

/* ---- Request building ---- */

function requestPath(config, key) {
  const encodedKey = key ? '/' + s3UriEncode(key) : '';
  return config.pathStyle === false
    ? encodedKey || '/'
    : `/${config.bucket}${encodedKey}`;
}

function queryString(query) {
  return Object.entries(query)
    .map(([k, v]) => `${s3UriEncode(k)}=${s3UriEncode(v)}`)
    .sort()
    .join('&');
}

function httpModuleFor(endpoint) {
  return String(endpoint).startsWith('https') ? https : http;
}

/* ---- Signed request executor ----
   config: { endpoint, bucket, accessKeyId, secretAccessKey, region, pathStyle }
   opts:   { method, key, query, headers (extra wire headers), body
             (Buffer|stream), bodyLength (REQUIRED for stream), payloadHash
             (override; REQUIRED for stream bodies) }
   Resolves { status, headers, stream, body() } — body() consumes the
   stream once. Non-2xx: body is consumed and a keyed S3 error thrown
   (err.s3Code / err.s3ClockSkew per the Task-2 mapping). */
export function s3Request(config, opts) {
  return new Promise((resolve, reject) => {
    const endpoint = String(config.endpoint).replace(/\/+$/, '');
    const endpointUrl = new URL(endpoint);
    const mod = httpModuleFor(endpoint);
    const method = String(opts.method).toUpperCase();
    const query = opts.query || {};
    const qs = queryString(query);
    /* Host construction per S3 addressing style (MAJ-02 fix):
       - path-style (default): the bucket stays in the path — /bucket/key.
       - virtual-host (S3_PATH_STYLE=false): the bucket moves INTO the Host
         header (<bucket>.<endpoint host>) and the path carries the key only.
         The connection still dials the endpoint host; the wire Host header
         (and the signed host) carry the bucket, so SigV4 stays valid.
       An endpoint path prefix (e.g. http://gateway.internal/alias) is
       preserved verbatim in BOTH modes. */
    const host = config.pathStyle === false
      ? `${config.bucket}.${endpointUrl.host}`
      : endpointUrl.host;
    const basePath = endpointUrl.pathname === '/' ? '' : endpointUrl.pathname.replace(/\/+$/, '');
    const rawPath = basePath + requestPath(config, opts.key);
    const reqPath = rawPath + (qs ? '?' + qs : '');
    const url = new URL(endpointUrl.protocol + '//' + endpointUrl.host + reqPath);
    const body = opts.body;
    const isStream = body && typeof body.pipe === 'function';
    const payloadHash = opts.payloadHash ?? sha256Hex(Buffer.isBuffer(body) ? body : '');
    if (isStream && opts.payloadHash === undefined) {
      return reject(new Error('s3: stream body requires an explicit payloadHash (refusing UNSIGNED-PAYLOAD)'));
    }
    if (isStream && !opts.bodyLength) {
      return reject(new Error('s3: stream body requires explicit bodyLength (no chunked transfer — Pitfall 6)'));
    }
    const amzDate = amzDateNow();
    const signed = sigv4Sign({
      method,
      host,
      path: rawPath,
      query,
      extraHeaders: opts.headers,
      payloadHash,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: config.region || 'us-east-1',
      amzDate,
    });
    const wireHeaders = { ...signed };
    if (config.pathStyle === false && wireHeaders.host !== host) {
      wireHeaders.host = host; // virtual-host addressing: the Host header carries the bucket (matches the signature)
    }
    if (Buffer.isBuffer(body)) wireHeaders['content-length'] = body.length;
    else if (opts.bodyLength !== undefined) wireHeaders['content-length'] = opts.bodyLength;
    for (const [k, v] of Object.entries(opts.headers || {})) {
      if (String(k).toLowerCase() === 'content-length') wireHeaders['content-length'] = v;
    }
    const req = mod.request(
      url,
      { method, headers: wireHeaders },
      (res) => {
        if (res.statusCode >= 300) {
          consumeAndThrowS3Error(res, reject, body); // MIN-05: the piped body stream is destroyed inside
          return;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          stream: res,
          body() {
            return new Promise((res2, rej2) => {
              const chunks = [];
              res.on('data', (c) => chunks.push(c));
              res.on('error', rej2);
              res.on('end', () => res2(Buffer.concat(chunks)));
            });
          },
        });
      },
    );
    req.on('error', reject);
    if (Buffer.isBuffer(body)) req.end(body);
    else if (isStream) {
      body.pipe(req);
      body.on('error', (e) => req.destroy(e));
    } else req.end();
  });
}

/* ---- Keyed error mapping (D-88-17, A4; V14/T-88-01) ----
   Classes (the contract plans 02/03 map into refusals and run-row errors):
   clockSkew  — RequestTimeTooSkewed (D-88-17: err.s3ClockSkew === true)
   badCreds   — InvalidAccessKeyId / SignatureDoesNotMatch
   forbidden  — AccessDenied
   noBucket   — NoSuchBucket
   generic    — anything unmapped
   Message is sliced (300 chars) and NEVER carries request headers or
   secrets. */
export function s3ErrorFrom(status, bodyText, fallbackCode = null) {
  const text = String(bodyText ?? '');
  const codeMatch = /<Code>([^<]+)<\/Code>/.exec(text);
  const s3Code = codeMatch ? codeMatch[1] : fallbackCode;
  const CLASSES = {
    RequestTimeTooSkewed: 'clockSkew',
    InvalidAccessKeyId: 'badCreds',
    SignatureDoesNotMatch: 'badCreds',
    AccessDenied: 'forbidden',
    NoSuchBucket: 'noBucket',
  };
  const s3Class = (s3Code && CLASSES[s3Code]) || 'generic';
  const err = new Error(sliceError(new Error(`s3 ${status}: ${text.slice(0, 300)}`)));
  err.s3Status = status;
  err.s3Code = s3Code;
  err.s3Class = s3Class;
  err.s3ClockSkew = s3Class === 'clockSkew';
  return err;
}

/* Consume an error response and reject with a keyed S3 error (Task 2
   mapping: RequestTimeTooSkewed → s3ClockSkew, D-88-17). MIN-05: when the
   caller is still piping a stream body, the source stream is destroyed
   immediately after the reject handlers are attached — the early error
   response must not leave an orphaned read stream running against the
   staged file until the socket times out. The response itself stays
   readable so the keyed error code is still extracted. */
function consumeAndThrowS3Error(res, reject, body) {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('error', () => reject(new Error('s3: error response body unreadable')));
  res.on('end', () => {
    const text = Buffer.concat(chunks).toString('utf8');
    /* HEAD responses carry no body — AWS S3 puts the code in the
       x-amz-error-code header instead. */
    const fallbackCode = res.headers['x-amz-error-code'] || null;
    reject(s3ErrorFrom(res.statusCode, text, fallbackCode));
  });
  if (body && typeof body.destroy === 'function') body.destroy();
}

/* ---- Concrete operations ---- */

export async function headBucket(config) {
  const res = await s3Request(config, { method: 'HEAD' });
  return res.status === 200;
}

export async function createBucket(config) {
  await s3Request(config, { method: 'PUT' });
  return true;
}

export async function putObject(config, key, body, { contentType = 'application/gzip' } = {}) {
  await s3Request(config, {
    method: 'PUT',
    key,
    headers: { 'content-type': contentType },
    body,
  });
  return true;
}

/* Resolves { status, stream, body() } for streamed consumption. */
export async function getObject(config, key) {
  return s3Request(config, { method: 'GET', key });
}

export async function deleteObject(config, key) {
  await s3Request(config, { method: 'DELETE', key });
  return true;
}

/* ---- Probe (D-88-15, Pitfall 7) ----
   HeadBucket AND a small PUT under `gr8r-probe/` AND its DELETE.
   Keyed result — the contract plans 02/03 map into toasts/refusals:
   { ok: true,  key: 'success',    httpWarning }          — all three OK
   { ok: false, key: 'deleteFailed', warning: true, httpWarning } — put OK, delete refused:
       a WARNING, never success — probe is the ONLY sanctioned delete (D-88-7 carve-out)
   { ok: false, key: 's3ClockSkew' }                      — D-88-17 (SC-3)
   { ok: false, key: 'badCreds' }                         — InvalidAccessKeyId/SignatureDoesNotMatch/AccessDenied
   { ok: false, key: 's3NoBucket' }                       — NoSuchBucket (bucket-name typo / not yet created)
   { ok: false, key: 'unreachable', error }               — network/other; error text sliced (V14)
   httpWarning: true when the endpoint is plain http:// (D-88-14). */
export async function probeS3(config) {
  const httpWarning = String(config.endpoint).startsWith('http://');
  const base = { ok: false, key: null, warning: false, httpWarning };
  try {
    await headBucket(config);
  } catch (e) {
    return mapProbeError(e, base);
  }
  const marker = `gr8r-probe/probe-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.probe`;
  try {
    await putObject(config, marker, Buffer.from('gr8r probe'), { contentType: 'text/plain' });
  } catch (e) {
    return mapProbeError(e, base);
  }
  try {
    await deleteObject(config, marker);
  } catch (e) {
    return { ...base, key: 'deleteFailed', warning: true };
  }
  return { ...base, ok: true, key: 'success' };
}

function mapProbeError(e, base) {
  if (e?.s3Class === 'clockSkew') return { ...base, key: 's3ClockSkew' };
  if (e?.s3Class === 'badCreds' || e?.s3Class === 'forbidden') return { ...base, key: 'badCreds' };
  if (e?.s3Class === 'noBucket') return { ...base, key: 's3NoBucket' }; // MIN-01: a bucket-name typo gets its own keyed class, not generic unreachable
  return { ...base, key: 'unreachable', error: sliceError(e) };
}

/* ---- Download seam (SC-5, Phase 89 consumes) ----
   GETs the object, writes to a staged temp file in `stagingDir`
   (same-filesystem staging convention — an eventual atomic move works)
   while hashing sha256 ON THE PIPE (one pass, memory-bounded — the
   temp file is never re-read), then compares against expectedSha256
   and refuses with a keyed mismatch error, removing the temp file.
   Sidecar comparison happens at callers (plan 03). */
export async function downloadToStaged(config, key, expectedSha256, stagingDir) {
  const res = await getObject(config, key);
  fs.mkdirSync(stagingDir, { recursive: true });
  const tmpPath = path.join(stagingDir, `s3-download-${process.pid}-${crypto.randomUUID().slice(0, 8)}.tmp`);
  const hash = crypto.createHash('sha256');
  const hashTap = new Transform({
    transform(chunk, _enc, cb) {
      hash.update(chunk);
      cb(null, chunk);
    },
  });
  const out = fs.createWriteStream(tmpPath);
  try {
    await pipeline(res.stream, hashTap, out);
  } catch (e) {
    fs.rmSync(tmpPath, { force: true });
    throw e;
  }
  const sha256 = hash.digest('hex');
  if (sha256 !== expectedSha256) {
    fs.rmSync(tmpPath, { force: true });
    const err = new Error(
      sliceError(new Error(`s3 download: sha256 mismatch for ${key}: expected ${expectedSha256}, got ${sha256}`)),
    );
    err.s3Class = 'sha256Mismatch';
    throw err;
  }
  return { tmpPath, sha256 };
}

/* =====================================================================
   BACKUP UPLOAD EXECUTOR — Phase 88 (88-03, SC-2 / BKBCK-05)
   =====================================================================
   Thresholded single PUT / serial multipart upload of the PUBLISHED
   local archive (the caller passes the fs.rename-published file — it
   is immutable, so D-88-16 retries re-read the same byte ranges).

   Frozen decisions honored here:
   - SC-2: payloads ≤ S3_MULTIPART_THRESHOLD (512 MiB) go as ONE signed
     PUT; larger payloads go CreateMultipartUpload → SERIAL 64 MiB parts
     (1-based) → CompleteMultipartUpload. Parts are fs.createReadStream
     slices — the file is NEVER buffered whole (memory-bounded).
   - D-88-8: ETag is collected ONLY as the protocol datum Complete
     requires — integrity comes exclusively from the caller's stream-back
     sha256 compare + the `<key>.sha256` sidecar uploaded here.
   - D-88-10: Content-Type application/gzip + Content-Length only. No
     SSE, no storage-class headers.
   - D-88-16: each upload attempt pre-hashes its byte range straight
     from the immutable file, so a retry re-sends identical bytes.
   - T-88-12: a part exhausting its attempt budget triggers
     AbortMultipartUpload before the error propagates.
   - SigV4 real-payload-hash rule: stream bodies carry their computed
     part hash; the single PUT reuses the caller's whole-file sha256
     after verifying it against a fresh pre-hash pass (fail fast on a
     caller mismatch — never sign a lie).

   s3BackupKey(meta, filename): the D-88-6/9 key routing — task runs
   `backup-task-<taskId>/`, manual archives `backup-manual/`. The CALLER
   decides the key; this helper only owns the prefix contract.
   ===================================================================== */

export const S3_MULTIPART_THRESHOLD = 512 * 1024 * 1024;
export const S3_PART_SIZE = 64 * 1024 * 1024;

export function s3BackupKey(meta, filename) {
  return meta?.taskId ? `backup-task-${meta.taskId}/${filename}` : `backup-manual/${filename}`;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/* One streaming sha256 pass over [start, end] — memory-bounded. */
function sha256Range(filePath, start, end) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const read = fs.createReadStream(filePath, { start, end, highWaterMark: 1024 * 1024 });
    read.on('data', chunk => hash.update(chunk));
    read.on('error', reject);
    read.on('end', () => resolve(hash.digest('hex')));
  });
}

function sha256WholeFile(filePath) {
  return sha256Range(filePath, undefined, undefined);
}

async function abortMultipart(config, key, uploadId) {
  try {
    await s3Request(config, { method: 'DELETE', key, query: { uploadId } });
  } catch { /* abort is best-effort cleanup — the original error wins */ }
}

/* Upload the `<key>.sha256` sidecar (D-88-8). Same content shape as the
   local sidecar: `<sha256>  <filename>\n`. */
async function uploadSidecar(config, key, expectedSha256) {
  const base = key.slice(key.lastIndexOf('/') + 1);
  await putObject(
    config,
    `${key}.sha256`,
    Buffer.from(`${expectedSha256}  ${base}\n`),
    { contentType: 'text/plain' },
  );
}

async function uploadSinglePut(config, stagedPath, key, expectedSha256, size, attempts, backoffMs, notify, ensureNotCancelled) {
  /* Pre-hash pass: verify the caller's whole-file hash BEFORE signing —
     the SigV4 payload hash must be the REAL body hash, and a mismatch is
     a caller bug to fail on, not a wire round-trip to discover. */
  const actual = await sha256WholeFile(stagedPath);
  if (actual !== expectedSha256) {
    const err = new Error(`s3 upload: staged file sha256 does not match the stored hash for ${key} (refusing to upload)`);
    err.s3Class = 'sha256Mismatch';
    throw err;
  }
  let lastErr = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    ensureNotCancelled();
    try {
      const stream = fs.createReadStream(stagedPath, { highWaterMark: 1024 * 1024 });
      await s3Request(config, {
        method: 'PUT',
        key,
        headers: { 'content-type': 'application/gzip' },
        body: stream,
        bodyLength: size,
        payloadHash: expectedSha256,
      });
      notify(1, 1);
      return { mode: 'single', partsTotal: 1 };
    } catch (err) {
      lastErr = err;
      if (attempt < attempts) await sleep(backoffMs(attempt));
    }
  }
  throw lastErr;
}

async function uploadMultipart(config, stagedPath, key, size, partSize, attempts, backoffMs, notify, ensureNotCancelled) {
  const init = await s3Request(config, { method: 'POST', key, query: { uploads: '' } });
  const initBody = (await init.body()).toString('utf8');
  const uploadId = /<UploadId>([^<]+)<\/UploadId>/.exec(initBody)?.[1];
  if (!uploadId) throw new Error('s3 multipart: no UploadId in the initiate response');
  const partsTotal = Math.ceil(size / partSize);
  const parts = []; // protocol data for Complete ONLY — never integrity (D-88-8)
  let completeAccepted = false; // MIN-06: past an accepted Complete, aborting a committed transaction is pointless
  try {
    for (let n = 1; n <= partsTotal; n++) {
      ensureNotCancelled(); // MIN-04: cancellation lands at the next part boundary — the outer catch owns the abort
      const start = (n - 1) * partSize;
      const end = Math.min(start + partSize, size) - 1;
      const len = end - start + 1;
      let lastErr = null;
      let uploaded = false;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          /* D-88-16: the hash AND the body are re-read from the immutable
             staged file on EVERY attempt — identical bytes re-sent. */
          const payloadHash = await sha256Range(stagedPath, start, end);
          const stream = fs.createReadStream(stagedPath, { start, end, highWaterMark: 1024 * 1024 });
          const res = await s3Request(config, {
            method: 'PUT',
            key,
            query: { partNumber: String(n), uploadId },
            headers: { 'content-type': 'application/gzip' },
            body: stream,
            bodyLength: len,
            payloadHash,
          });
          parts.push({ PartNumber: n, ETag: res.headers.etag || '' });
          uploaded = true;
          break;
        } catch (err) {
          lastErr = err;
          if (attempt < attempts) await sleep(backoffMs(attempt));
        }
      }
      if (!uploaded) {
        throw lastErr; // the outer catch owns the abort (T-88-12) exactly once
      }
      notify(n, partsTotal);
    }
    const xml =
      '<CompleteMultipartUpload>' +
      parts
        .sort((a, b) => a.PartNumber - b.PartNumber)
        .map(p => `<Part><PartNumber>${p.PartNumber}</PartNumber><ETag>${p.ETag}</ETag></Part>`)
        .join('') +
      '</CompleteMultipartUpload>';
    const comp = await s3Request(config, { method: 'POST', key, query: { uploadId }, body: Buffer.from(xml) });
    /* The provider has ACCEPTED the Complete from here on (status < 300): a
       multipart transaction may now be committed even if the response body
       trips the error check or fails to parse — aborting an accepted
       transaction is pointless (MIN-06), so no abort fires past this line
       and the failure message notes the object may exist. */
    completeAccepted = true;
    const compBody = (await comp.body()).toString('utf8');
    /* A Complete response can be HTTP 200 while still reporting an error
       in its body (S3 quirk) — fail closed on either. */
    if (/<Error>/.test(compBody)) {
      throw new Error('s3 multipart: complete reported an error — the object may exist despite this failure (integrity stays protected by the D-88-8 stream-back verify)');
    }
    return { mode: 'multipart', partsTotal, uploadId };
  } catch (err) {
    if (!completeAccepted) {
      await abortMultipart(config, key, uploadId); // belt-and-braces: abort on any PRE-Complete failure path (T-88-12)
    }
    throw err;
  }
}

/* ---- The executor ----
   config:   the S3.config() request config (88-02 seam)
   stagedPath: the PUBLISHED, immutable archive file (fs.rename-published)
   key:      the S3 object key (s3BackupKey routing, caller-decided)
   expectedSha256: the stored whole-archive sha256 (run row ground truth)
   onProgress(partsDone, partsTotal): progress callback for the D-19 payload
   opts:     { thresholdBytes, partSize, attempts, backoffMs, isCancelled }
             overrides (testability; defaults are the SC-2 constants +
             3 attempts; isCancelled is polled at part/attempt boundaries
             for shutdown cancellation — MIN-04)
   After the object exists the `<key>.sha256` sidecar is uploaded.
   Returns { mode, partsTotal }. */
export async function uploadArchive(config, stagedPath, key, expectedSha256, onProgress, opts = {}) {
  const thresholdBytes = opts.thresholdBytes ?? S3_MULTIPART_THRESHOLD;
  const partSize = opts.partSize ?? S3_PART_SIZE;
  const attempts = opts.attempts ?? 3;
  const backoffMs = opts.backoffMs ?? (attempt => 500 * 2 ** (attempt - 1));
  const notify = (done, total) => {
    try { onProgress?.(done, total); } catch { /* progress must never fail an upload */ }
  };
  /* MIN-04: the shutdown handler cancels `uploading` runs too (server.js
     flips the run's `cancelled` flag) — the check lands at the next part /
     attempt boundary and the multipart abort then runs in the executor's
     own catch (T-88-12). The caller maps the thrown error into
     upload_failed exactly like any other upload failure (the local archive
     is already published — D-88-1). */
  const ensureNotCancelled = () => {
    if (!opts.isCancelled?.()) return;
    const err = new Error('backup: cancelled during S3 upload — server shutdown');
    err.s3Class = 'cancelled';
    throw err;
  };
  const size = fs.statSync(stagedPath).size;
  if (size <= thresholdBytes) {
    const result = await uploadSinglePut(config, stagedPath, key, expectedSha256, size, attempts, backoffMs, notify, ensureNotCancelled);
    await uploadSidecar(config, key, expectedSha256);
    return result;
  }
  const result = await uploadMultipart(config, stagedPath, key, size, partSize, attempts, backoffMs, notify, ensureNotCancelled);
  await uploadSidecar(config, key, expectedSha256);
  return result;
}
