/* =====================================================================
   S3 SIGV4 GOLDEN VECTORS — Phase 88 (88-01)
   =====================================================================
   Offline, ungated, always-on (D-88-18). The signature bytes ARE the
   contract — these vectors are the AWS-documented examples from
   docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html
   (pinned verbatim via the AWS SDK for Erlang reference test suite,
   aws-beam/aws_signature src/aws_signature.erl, which carries these
   exact expected signatures against the AWS docs examples).

   Vectors:
   1. GET object (with Range header) — real empty-payload hash
   2. PUT object — real payload hash of "Welcome to Amazon S3."
      (44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072),
      extra Date + x-amz-storage-class headers in the signed set
   3. List-bucket GET with query params — canonical-query ordering pin
   4. Multipart PUT-part — hand-written canonical request (independent
      of the signer's construction) fed through the documented HMAC key
      chain inline; the signer must produce the identical signature.
   ===================================================================== */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { sigv4Sign, s3UriEncode, s3ErrorFrom } from '../export/s3.js';

const AKID = 'AKIAIOSFODNN7EXAMPLE';
const SECRET = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
const DATE = '20130524T000000Z';
const EMPTY_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/* 1. AWS docs example: GET Object
   https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html#example-signature-GET-object */
test('golden vector: GET object with Range header', () => {
  const headers = sigv4Sign({
    method: 'GET',
    host: 'examplebucket.s3.amazonaws.com',
    path: '/test.txt',
    extraHeaders: { range: 'bytes=0-9' },
    payloadHash: EMPTY_HASH,
    accessKeyId: AKID,
    secretAccessKey: SECRET,
    region: 'us-east-1',
    amzDate: DATE,
  });
  assert.equal(
    headers.authorization,
    'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request,' +
      'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,' +
      'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
  );
});

/* 2. AWS docs example: PUT Object — REAL payload hash (never UNSIGNED-PAYLOAD)
   https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html#example-signature-PUT-object */
test('golden vector: PUT object with real payload hash', () => {
  const body = 'Welcome to Amazon S3.';
  const payloadHash = crypto.createHash('sha256').update(body).digest('hex');
  assert.equal(payloadHash, '44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072');
  const headers = sigv4Sign({
    method: 'PUT',
    host: 'examplebucket.s3.amazonaws.com',
    path: '/test%24file.text',
    extraHeaders: {
      date: 'Fri, 24 May 2013 00:00:00 GMT',
      'x-amz-storage-class': 'REDUCED_REDUNDANCY',
    },
    payloadHash,
    accessKeyId: AKID,
    secretAccessKey: SECRET,
    region: 'us-east-1',
    amzDate: DATE,
  });
  assert.equal(
    headers.authorization,
    'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request,' +
      'SignedHeaders=date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class,' +
      'Signature=98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd',
  );
});

/* 3. AWS docs example: List Bucket — canonical query string ordering
   https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html#example-signature-list-bucket */
test('golden vector: canonical query sorting (list bucket)', () => {
  const headers = sigv4Sign({
    method: 'GET',
    host: 'examplebucket.s3.amazonaws.com',
    path: '/',
    query: { 'max-keys': '2', prefix: 'J' },
    payloadHash: EMPTY_HASH,
    accessKeyId: AKID,
    secretAccessKey: SECRET,
    region: 'us-east-1',
    amzDate: DATE,
  });
  assert.equal(
    headers.authorization,
    'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request,' +
      'SignedHeaders=host;x-amz-content-sha256;x-amz-date,' +
      'Signature=34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7',
  );
});

/* 4. Multipart PUT-part (UploadPart) — no AWS-docs vector exists, so the
   canonical request is HAND-WRITTEN here (independent of the signer's
   construction) and fed through the documented HMAC key chain inline.
   The signer must produce the identical signature bytes for the same
   request. */
test('golden pin: multipart PUT-part matches hand-written canonical request', () => {
  const bucket = 'projects-studio';
  const key = s3UriEncode('backup-task-t1/archive.tar.gz');
  const query = { partNumber: '1', uploadId: 'abc123' };
  const partHash = crypto.createHash('sha256').update('PART-BYTES').digest('hex');
  const signed = sigv4Sign({
    method: 'PUT',
    host: '127.0.0.1:9000',
    path: `/${bucket}/${key}`,
    query,
    payloadHash: partHash,
    accessKeyId: AKID,
    secretAccessKey: SECRET,
    region: 'us-east-1',
    amzDate: DATE,
  });

  /* Hand-written canonical request — mirrors the S3 spec verbatim.
     partNumber sorts before uploadId (S3 sorts by name then value). */
  const canonicalRequest = [
    'PUT',
    `/projects-studio/backup-task-t1/archive.tar.gz`,
    'partNumber=1&uploadId=abc123',
    `host:127.0.0.1:9000\nx-amz-content-sha256:${partHash}\nx-amz-date:${DATE}\n`,
    'host;x-amz-content-sha256;x-amz-date',
    partHash,
  ].join('\n');
  const scope = '20130524/us-east-1/s3/aws4_request';
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    DATE,
    scope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');
  const hmac2 = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
  const kDate = hmac2('AWS4' + SECRET, '20130524');
  const kSigning = hmac2(hmac2(hmac2(kDate, 'us-east-1'), 's3'), 'aws4_request');
  const expectedSignature = crypto
    .createHmac('sha256', kSigning)
    .update(stringToSign)
    .digest('hex');

  assert.match(signed.authorization, /Signature=([0-9a-f]{64})$/);
  const actualSignature = /Signature=([0-9a-f]{64})$/.exec(signed.authorization)[1];
  assert.equal(actualSignature, expectedSignature);
});

/* ---- Task 2 behavior: S3 URI encoding (Pitfall 2) ---- */

test('s3UriEncode: spaces and # encode per S3 rules, unlike generic encodeURIComponent', () => {
  const key = 'backup-task-t1/my archive #1.tar.gz';
  const encoded = s3UriEncode(key);
  // S3 rule: encode everything except unreserved chars and '/'
  assert.equal(encoded, 'backup-task-t1/my%20archive%20%231.tar.gz');
  // generic encodeURIComponent differs: it encodes '/' and uses its own table
  assert.equal(encoded.includes('%2F'), false);
  assert.notEqual(encoded, encodeURIComponent(key));
  // the encoded key produces a DIFFERENT signature than encodeURIComponent output
  const a = sigv4Sign({
    method: 'PUT', host: 'h', path: `/${encoded}`, payloadHash: EMPTY_HASH,
    accessKeyId: AKID, secretAccessKey: SECRET, region: 'us-east-1', amzDate: DATE,
  });
  const b = sigv4Sign({
    method: 'PUT', host: 'h', path: `/${encodeURIComponent(key)}`, payloadHash: EMPTY_HASH,
    accessKeyId: AKID, secretAccessKey: SECRET, region: 'us-east-1', amzDate: DATE,
  });
  assert.notEqual(a.authorization, b.authorization);
});

test('s3UriEncode: unicode encodes deterministically to uppercase UTF-8 bytes and round-trips', () => {
  const key = 'résumé.tar.gz';
  const encoded = s3UriEncode(key);
  assert.equal(encoded, 'r%C3%A9sum%C3%A9.tar.gz');
  assert.equal(s3UriEncode(key), encoded); // deterministic
  assert.equal(decodeURIComponent(encoded), key); // round-trips
});

/* ---- Task 2 behavior: keyed error mapping (D-88-17, A4, V14) ---- */

test('error mapping: RequestTimeTooSkewed is a distinct s3ClockSkew class (SC-3)', () => {
  const err = s3ErrorFrom(403, '<?xml version="1.0"?><Error><Code>RequestTimeTooSkewed</Code><Message>The difference between the request time and the current time is too large.</Message></Error>');
  assert.equal(err.s3ClockSkew, true);
  assert.equal(err.s3Class, 'clockSkew');
  assert.equal(err.s3Status, 403);
  assert.equal(err.s3Code, 'RequestTimeTooSkewed');
});

test('error mapping: InvalidAccessKeyId / SignatureDoesNotMatch → badCreds', () => {
  for (const code of ['InvalidAccessKeyId', 'SignatureDoesNotMatch']) {
    const err = s3ErrorFrom(403, `<Error><Code>${code}</Code></Error>`);
    assert.equal(err.s3Class, 'badCreds', code);
    assert.equal(err.s3ClockSkew, false);
  }
});

test('error mapping: AccessDenied and NoSuchBucket get their own classes', () => {
  assert.equal(s3ErrorFrom(403, '<Error><Code>AccessDenied</Code></Error>').s3Class, 'forbidden');
  assert.equal(s3ErrorFrom(404, '<Error><Code>NoSuchBucket</Code></Error>').s3Class, 'noBucket');
});

test('error mapping: unmapped body → generic class, message sliced, no secrets (V14)', () => {
  const err = s3ErrorFrom(500, `<Error><Code>InternalError</Code>${'x'.repeat(1000)}</Error>`);
  assert.equal(err.s3Class, 'generic');
  assert.ok(err.message.length <= 320, 'message sliced to 300 chars');
  // T-88-01: secrets and request headers never enter the error text
  const secret = 'projects-studiotest-password';
  assert.equal(err.message.includes(secret), false);
  assert.equal(err.message.toLowerCase().includes('authorization:'), false);
});
