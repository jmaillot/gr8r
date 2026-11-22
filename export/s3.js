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
    const mod = httpModuleFor(endpoint);
    const method = String(opts.method).toUpperCase();
    const query = opts.query || {};
    const qs = queryString(query);
    const reqPath = requestPath(config, opts.key) + (qs ? '?' + qs : '');
    const url = new URL(endpoint + reqPath);
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
      host: url.host,
      path: requestPath(config, opts.key),
      query,
      extraHeaders: opts.headers,
      payloadHash,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: config.region || 'us-east-1',
      amzDate,
    });
    const wireHeaders = { ...signed };
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
          consumeAndThrowS3Error(res, reject);
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
   mapping: RequestTimeTooSkewed → s3ClockSkew, D-88-17). */
function consumeAndThrowS3Error(res, reject) {
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
