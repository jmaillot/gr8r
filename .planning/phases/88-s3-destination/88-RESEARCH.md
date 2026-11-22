# Phase 88: S3 Destination - Research

**Researched:** 2026-11-22
**Domain:** S3-compatible object storage client (hand-rolled SigV4 on Node stdlib), streamed multipart uploads, checksum verification, boot-frozen env credentials
**Confidence:** HIGH (SigV4 spec details verified from AWS docs; provider quirks from vendor docs; MinIO e2e availability is the one genuinely moving target — see Assumptions A1–A3)

## Summary

Phase 88 adds an S3-compatible destination to the backup pipeline built in Phases 86–87. The architecture is fully decided in 88-CONTEXT (D-88-1..18): local-first doctrine (archive always lands in BACKUPS_DIR, S3 receives a streamed copy), single history row with a new `uploading` stage and `upload_failed` terminal state, per-task-prefix keys with a `<key>.sha256` sidecar object, a write+delete probe at save, and zero npm deps — the S3 client is hand-rolled on Node stdlib (D-33-11).

The core technical work is a minimal SigV4 implementation. S3 SigV4 is well-bounded: canonical request (`METHOD\nURI\ncanonical-query\ncanonical-headers\nsigned-headers\nhashed-payload`) → string-to-sign → HMAC-SHA256 signing key chain (date → region → service → "aws4_request") → `Authorization` header. For S3 specifically the `x-amz-content-sha256` header is **required on every request** and can carry the literal `UNSIGNED-PAYLOAD` — but since this project already computes the whole-archive sha256 before upload (Phase 86 pipeline), signing the real payload hash is both possible and preferable: it is provider-agnostic and lets the verify-after-upload re-read use a signed GET too. [CITED: docs.aws.amazon.com/AmazonS3/latest/developerguide/sig-v4-header-based-auth.html]

The single largest plan-time risk is **the MinIO e2e target (SC-4)**: MinIO killed its community Docker Hub images — `minio/minio` was deleted from Docker Hub (Sept–Oct 2025) and the free community edition stopped being published after `RELEASE.2025-10-15T17-29-55Z`. A pinned `minio/minio:latest` pull **will fail** today. The plan must pin an explicit RELEASE tag and pull from a surviving mirror (`quay.io/minio/minio:RELEASE.2025-10-15T17-29-55Z` is the last community security release; mirror images like `pgsty/minio` exist but are third-party). Verify pullability at plan time, before writing the test.

**Primary recommendation:** Build a small `s3.js` module (signing, request executor, multipart state machine, probe) beside `export/backup.js`; slot an `uploading` stage into the run lifecycle after `verifying`; verify with golden-vector SigV4 unit tests (offline, always-on) + env-gated Docker MinIO e2e (pin `quay.io/minio/minio:RELEASE.2025-10-15T17-29-55Z`, verify the pull at plan time).

## User Constraints (from CONTEXT.md)

<user_constraints>
### Locked Decisions
[D-88-1..18 verbatim from 88-CONTEXT.md — see that file; the planner MUST copy them verbatim. Highlights that constrain research:]
- **D-88-1:** Local-first — archive ALWAYS lands in BACKUPS_DIR, S3 gets a streamed copy; S3 failure never endangers the local archive; rotation stays local-only.
- **D-88-2/4:** Single run row, `running→uploading→succeeded`; `succeeded` only when S3 confirms the checksum; failed upload → `upload_failed` (local kept). Manual Run-now archives upload too.
- **D-88-3:** `upload_failed` rides the D-15/D-17 `last_notified_state` transition-email gate.
- **D-88-5:** `uploading` first-class in D-19 payload (collecting→archiving→verifying→uploading→done) with multipart parts progress; render-only client doctrine.
- **D-88-6/9:** Keys `backup-task-<taskId>/<filename>.tar.gz`; manual under `backup-manual/` prefix.
- **D-88-7:** The app never deletes S3 objects (probe write+delete excepted, D-88-15).
- **D-88-8:** sha256 stored separately from ETag — upload `<key>.sha256` sidecar object AND keep hash in run row; post-upload verification streams the object back and compares. **Never trust ETag.**
- **D-88-10:** Minimal headers — Content-Type `application/gzip` + Content-Length; NO SSE/storage-class headers.
- **D-88-11/12:** Single `S3_*` env pair (`S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_KEY, S3_REGION, S3_PATH_STYLE`), strict-token boot-frozen consts like MAILER/TOTP. Per-task boolean `s3_enabled` column; env unset → toggle hidden + keyed refusal on `s3Enabled`.
- **D-88-13/14:** Path-style PUT default; `S3_REGION` defaults `us-east-1`; no provider auto-detection, no scheme guessing; `http://` allowed with probe-time warning.
- **D-88-15:** Probe-at-save = write+delete marker under `.probe/` + HeadBucket; keyed results (success / unreachable / bad creds / clock skew / http warning).
- **D-88-16:** In-run retry ≈3 attempts/part, exponential backoff, per-part retry from the immutable staged file; abort multipart on failure; error field carries last attempt.
- **D-88-17:** `RequestTimeTooSkewed` → distinct keyed refusal (`err.s3ClockSkew`, ×5 locales).
- **D-88-18:** Golden-vector SigV4 tests offline always; MinIO e2e env-gated Docker (PG-matrix pattern); provider quirks re-checked at plan time.

### the agent's Discretion
Exact retry backoff constants, probe key naming (`gr8r-probe/…`), SigV4 canonical-request implementation details, part-size buffer mechanics, test file layout, audit action names for probe/save events (follow the `backup_*` funnel convention).

### Deferred Ideas (OUT OF SCOPE)
In-app S3 deletion; S3-only tasks; multi-profile S3; SMB/FTP; SSE/storage-class headers.
</user_constraints>

<phase_requirements>
| ID | Description | Research Support |
|----|-------------|------------------|
| BKBCK-05 | S3-compatible task destination via boot-frozen env creds, streamed memory-bounded uploads, checksum verifiable after upload | SigV4 spec + `x-amz-content-sha256` rules (CITED), multipart mechanics, provider quirks table, codebase seams below |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| SigV4 signing + S3 request executor | API/Backend (`export/s3.js` or section of `export/backup.js`) | — | Node server process; no client involvement |
| Upload stage in run lifecycle | API/Backend (`export/backup.js` runExport) | — | Slots after `verifying`, drives D-19 stage payload |
| Multipart state machine + retries | API/Backend | — | Needs the immutable staged file + abort semantics |
| Post-upload checksum verification | API/Backend | — | Stream-download + hash; never ETag |
| Probe-at-save endpoint | API/Backend (server.js backup route funnel) | — | Keyed refusal funnel lives in server.js routes |
| `S3_*` boot-frozen consts | API/Backend (server.js boot) | — | MAILER/TOTP precedent |
| `s3_enabled` toggle + env availability | API/Backend `/api/config` + task routes | Frontend (toggle visibility) | Client renders render-only from config ground truth |
| `uploading` stage label + parts progress | Frontend (`src/pages/backup.js`) | — | Render-only; labels verbatim from server |
| Download seam (GET → staged temp → streaming hash) | API/Backend | — | Consumed by Phase 89, not user-facing yet |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node:crypto (createHmac, createHash) | Node v24.21.0 installed | SigV4 HMAC chain, sha256 | stdlib, zero deps (D-33-11) [VERIFIED: node --version this session] |
| node:http / node:https / node:http2 | stdlib | Signed request execution | Choose by endpoint scheme; http2 not needed — plain http(s) |
| Node test runner (`node --test`) | stdlib | Golden-vector + e2e tests | Project convention (all test/*.test.mjs use it) [VERIFIED: test/ listing this session] |
| Docker MinIO (env-gated e2e) | pin `quay.io/minio/minio:RELEASE.2025-10-15T17-29-55Z` | Real S3-compatible e2e | Last community release; see Pitfall 1 [ASSUMED — pin must be pull-verified at plan time] |

**No npm packages are installed.** Package Legitimacy Audit: N/A (zero-dependency mandate, D-33-11). No `npm install` task should exist in the plan.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled SigV4 | aws4fetch / @aws-sdk/client-s3 npm | Ratified against: D-33-11 zero deps. Do not reopen. |
| AWS SDK retry policy | Hand-rolled ≈3 attempts/part | D-88-16 locks the semantics; simpler |

## Architecture Patterns

### System Architecture Diagram

```
Task save (operator)                      Run pipeline (task cron or Run-now)
      │                                          │
      ▼                                          ▼
PUT task row ── s3Enabled? ──► probe route     runExport(): collecting → archiving → verifying
      │                        │                        │
      │                 S3 env set? ──no──► keyed refusal     │ staged tar.gz + .sha256 sidecar
      │                        │ yes                          ▼ (immutable after atomic rename)
      │                 Probe (D-88-15):                ┌── S3 env set? ──no──► done (local only)
      │                 HeadBucket                      │        │ yes
      │                 PUT .probe marker ──► DELETE ──┘        ▼  stage: uploading
      │                        │                   ┌────────── size ≤ 512 MiB ──► single signed PUT
      │              keyed probe result             │           (streamed from staged file)
      │              (success/unreachable/          │
      │               bad creds/clock skew/         └─ size > 512 MiB ──► CreateMultipartUpload
      │               http warning)                          → serial 64 MiB PUT parts (streamed,
      │                                                        ≤3 attempts/part, backoff,
      │                                                        resume from staged file offset)
      │                                                            │ any part fails after retries
      │                                                            ▼  AbortMultipartUpload
      │                                                            │  → upload_failed row + email gate
      │                                             all parts ok → CompleteMultipartUpload
      │                                                            ▼
      │                                              GET uploaded object → stream-hash vs stored sha256
      │                                                            │ mismatch
      │                                              match ──► DELETE probe-none; PUT <key>.sha256 sidecar
      │                                                            ▼
      │                                                    succeeded (D-88-2)
      │
      └──► run history card: D-19 payload gains stage 'uploading' + partsDone/partsTotal
```

### SigV4 implementation pattern (the load-bearing detail)

```
canonicalRequest =
  method + '\n' +
  canonicalUri (URI-encoded path, keep '/' unescaped) + '\n' +
  canonicalQuery (sorted, URI-encoded; empty → '') + '\n' +
  canonicalHeaders (lowercase names, sorted, trim value whitespace; host + x-amz-* ) + '\n' +
  signedHeaders ('host;x-amz-content-sha256;x-amz-date') + '\n' +
  hashedPayload (real sha256 hex of body, or 'UNSIGNED-PAYLOAD')

stringToSign =
  'AWS4-HMAC-SHA256\n' + amzDate + '\n' +
  '<yyyymmdd>/<region>/s3/aws4_request\n' +
  sha256hex(canonicalRequest)

signingKey = HMAC(HMAC(HMAC(HMAC('AWS4'+secret, date), region), 's3'), 'aws4_request')
Authorization: AWS4-HMAC-SHA256 Credential=<key>/<scope>, SignedHeaders=..., Signature=<hex>
```

Key rules verified from AWS docs [CITED: docs.aws.amazon.com/AmazonS3/latest/developerguide/sig-v4-header-based-auth.html]:
- `x-amz-content-sha256` header **required on every S3 request**; may be the literal `UNSIGNED-PAYLOAD`. If it carries a hash, you are not required to include it as a signed header, but including it (as AWS SDKs do) is safest for third-party S3 implementations.
- Headers must be sent on the wire in exactly the set you signed (header names lowercase; values trimmed).
- URI-encode the object key per S3 rules: encode everything except unreserved chars and `/` (this differs from generic RFC 3986 — do not encode slashes).
- Query params must be sorted by name and URI-encoded per the same table.
- `x-amz-date: YYYYMMDD'T'HHMMSS'Z'` (UTC). The scope date derives from the same timestamp.

**Recommendation:** sign with the real payload hash, not `UNSIGNED-PAYLOAD`. Rationale: we already have the sha256 of the staged file (Phase 86 computed it before the archive exists — but note for multipart the payload hash is per-part; for single PUT it's the whole body). For multipart parts, hash each part as it is streamed (we stream-serialize it anyway, or read fixed 64 MiB slices from the immutable staged file and hash the slice — both work; slice-and-hash is simpler and enables the retry-from-offset requirement verbatim). Avoids `STREAMING-*` trailer modes entirely, which several third-party implementations (Garage et al.) do not support [VERIFIED: garage issue #824 surfaced in search, showing STREAMING-UNSIGNED-PAYLOAD-TRAILER rejected by third-party servers]. Plain `x-amz-content-sha256: <hex>` is universally supported.

### Multipart mechanics

- Thresholds (roadmap SC-2): ≤ 512 MiB → single PUT; > 512 MiB → multipart with serial 64 MiB parts.
- Serial parts, one in flight: memory bounded to one 64 MiB buffer (read from staged file with `fs.createReadStream(path, { start, end })` — never load into a Buffer; pass the stream directly as the http request body).
- Retry: ≤3 attempts per part, exponential backoff; retry re-reads the same byte range from the immutable staged file (the file is `fs.rename`-published after verify, so it cannot change mid-upload — this is why D-88-16's "resume from immutable staged file" works).
- `AbortMultipartUpload` on final part failure. Incomplete multipart uploads leak storage until lifecycle rules clean them — document the `AbortIncompleteMultipartUpload` lifecycle rule recommendation in DEPLOY.md (matches D-88-7's "bucket pruning is the operator's job" doctrine).
- Part numbers: 1-based, sequential; PartSize must be ≥ 5 MiB (S3 minimum for all parts except the last); max 10,000 parts → at 64 MiB that's a 640 GiB ceiling, far beyond archive sizes.

### Download seam (Phase 89 consumes)

GET object → write to a staged temp file in the backups staging area (same filesystem so an eventual atomic move works) while streaming through a sha256 hash update → compare final hex against the stored run-row hash and/or the `<key>.sha256` sidecar object → refuse (keyed) on mismatch. Do the hashing on the pipe, not by re-reading the temp file — one pass, memory-bounded.

### Recommended Project Structure
```
export/
├── backup.js        # runExport pipeline — add 'uploading' stage + s3 upload call
├── s3.js            # NEW: SigV4 signing, request executor, multipart, probe, download seam
server.js           # S3_* boot consts, /api/config exposure, task CRUD s3Enabled gate, probe route, migration (s3_enabled column)
src/pages/backup.js # 'uploading' stage render + parts progress
src/locales/*.json  # ×5 keys: upload stage, s3ClockSkew refusal, probe toasts
docs/DEPLOY.md      # §19 gains S3 env-pair subsection + lifecycle-rule guidance
test/
├── backup-s3-sigv4.test.mjs     # golden vectors, offline, always-on
├── backup-s3-upload.test.mjs    # multipart mechanics vs a local mock or MinIO when env present
└── backup-s3-e2e.test.mjs       # env-gated Docker MinIO (PG-matrix skip pattern)
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SigV4 signing | anything beyond the minimal canonical-request signer above | the signer itself (this is the one thing we DO hand-roll, per D-33-11) | keep it ≤ ~100 lines; test against AWS-documented golden vectors |
| Checksum | ETag-based verification | stream-back sha256 compare (D-88-8) | ETag ≠ md5 for multipart objects; ETag is opaque on B2/MinIO variants |
| Tar/gzip/hash | — | existing Phase 86 helpers in export/backup.js | already memory-bounded and tested |
| Test minio | CI service | env-gated Docker like pg-matrix.test.mjs | project convention, skip-when-absent [VERIFIED: test/pg-matrix.test.mjs:32-43 idiom quoted this session] |

## Runtime State Inventory

Not a rename/migration phase, but one additive-schema item matters (planner must not miss it):

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `backup_tasks` table (server.js:699-715) gains an additive `s3_enabled` column — existing rows default 0/false; `backup_runs` gains upload state/error fields (or reuse existing state column with new enum values) | Additive migration following the established "create table if not exists / ALTER" boot-migration pattern (server.js:767+ precedent); code edit only |
| Live service config | Operator must create the bucket + keys + lifecycle rules OUTSIDE the app | DEPLOY.md §19 documentation (D-88-7) |
| OS-registered state | None — verified: no scheduled tasks/daemons involved beyond existing scheduler |
| Secrets/env vars | NEW: `S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_KEY, S3_REGION, S3_PATH_STYLE` — boot-frozen strict-token consts; never persisted to DB rows | Env docs; boot reads once |
| Build artifacts | None — verified: no compile step affected |

## Common Pitfalls

### Pitfall 1: MinIO community images no longer pullable (SC-4 blocker)
**What goes wrong:** plan writes `docker run minio/minio ...` — the repo was deleted from Docker Hub (Sept 2025); `docker pull` fails, e2e silently skips forever (env-gated tests fail-open).
**Why:** MinIO stopped publishing the free community edition after `RELEASE.2025-10-15T17-29-55Z`; Docker Hub images removed [CITED: github.com/minio/minio/releases + chainguard.dev/unchained article, cross-checked].
**How to avoid:** pin an explicit tag from a surviving registry — `quay.io/minio/minio:RELEASE.2025-10-15T17-29-55Z` — and make plan task 0 an actual `docker pull` + `docker run` smoke of the pinned image. If pull fails, fall back to a verified mirror or descope the e2e to golden-vector + mock tests with an explicit checkpoint to the user.
**Warning signs:** e2e "passes" as skip on a machine that never had the image.

### Pitfall 2: URI-encoding the object key wrong
**What goes wrong:** `SignatureDoesNotMatch` on keys containing characters that S3 encodes differently from generic RFC 3986 (spaces, `!`, `*`, `(`, `)`).
**Why:** S3 canonical URI requires encoding everything except unreserved chars and `/`; AWS's own encode table differs subtly from `encodeURIComponent`.
**How to avoid:** implement an explicit S3 URI-encode function (encode unreserved set verbatim, everything else %XX uppercase; never encode `/`); pin it with golden vectors including spaces and unicode.
**Warning signs:** simple ASCII keys work, filenames with spaces or `#` fail.

### Pitfall 3: Header set mismatch between signed and sent
**What goes wrong:** signature valid in isolation, server rejects — you signed `x-amz-content-sha256` but didn't send it (or vice versa), or sent extra unsigned headers some strict implementations check.
**Why:** the Authorization header's SignedHeaders list must exactly match both the canonical headers block and the wire headers.
**How to avoid:** build the header object once; derive canonical-headers, signed-headers list, and the actual request headers from that single object. D-88-10's minimal-headers decision (Content-Type + Content-Length only, plus the 3 amz headers) keeps the surface tiny — respect it, don't add headers per provider.
**Warning signs:** works against MinIO, fails against AWS or B2 (or the reverse).

### Pitfall 4: Trusting ETag / multipart ETag confusion
**What goes wrong:** verification compares ETag to a sha256 and "fails" — for multipart objects ETag is `<md5>-N`, opaque on B2.
**Why:** assumption that ETag = md5.
**How to avoid:** D-88-8 already forbids it — verify by streaming the object back and hashing. Keep the whole-archive sha256 in the run row and in the sidecar object.
**Warning signs:** any code touching the ETag header outside of logging.

### Pitfall 5: RequestTimeTooSkewed hiding as generic failure
**What goes wrong:** server clock off by >15 min → S3 returns 403 `RequestTimeTooSkewed`; if not parsed distinctly, operator sees "bad creds" and rotates keys pointlessly.
**Why:** error code lives in the XML error body of the 403 response, not the status alone.
**How to avoid:** parse the error body's `<Code>` element; map `RequestTimeTooSkewed` → `err.s3ClockSkew` (D-88-17), `InvalidAccessKeyId`/`SignatureDoesNotMatch`/`AccessDenied` → bad-creds/forbidden buckets in the probe mapping.
**How to avoid #2 (skew itself):** the ~15-minute allowance is documented AWS behavior [CITED: aws.amazon.com/blogs/developer/clock-skew-correction and S3 error discussions, 2025 posts still consistent].
**Warning signs:** probe fails with 403 while keys are provably correct.

### Pitfall 6: 100-continue / content-length on streamed PUT
**What goes wrong:** Node http client streams without Content-Length → chunked transfer-encoding → some S3 implementations (and SigV4 canonicalization of Content-Length) misbehave.
**How to avoid:** always set explicit `Content-Length` (known exactly for both single PUT — archive size — and each part — slice size). Minimal headers doctrine helps here.

### Pitfall 7: Probe race / marker hygiene
**What goes wrong:** probe succeeds but the `.probe/` marker delete fails, leaving junk; or probe runs against a bucket where delete is forbidden but put allowed → "success" that later uploads can't clean.
**Why:** probe is the only sanctioned delete (D-88-7 carve-out).
**How to avoid:** probe result = HeadBucket ok AND put ok AND delete ok; treat put-succeeds/delete-fails as a distinct warning result, not success.

## Code Examples

### SigV4 signing (Node stdlib)
```js
// Pattern per AWS docs sig-v4-header-based-auth.html — adapt; pin with golden vectors.
import crypto from 'node:crypto';
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const sha256hex = (data) => crypto.createHash('sha256').update(data).digest('hex');

function signingKey(secret, date, region, service = 's3') {
  const kDate = hmac('AWS4' + secret, date);
  return hmac(hmac(hmac(kDate, region), service), 'aws4_request');
}
// stringToSign = 'AWS4-HMAC-SHA256\n<amzDate>\n<scope>\n' + sha256hex(canonicalRequest)
// signature = hmac(signingKey(...), stringToSign).toString('hex')
```

### Per-part retry from the immutable staged file
```js
// Retry re-opens the same byte range — never a cached Buffer (memory-bounded, D-88-16).
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const stream = fs.createReadStream(stagedPath, { start, end });
    await s3PutPart(url, headers, stream, partSize); // explicit Content-Length = partSize
    return;
  } catch (e) {
    if (attempt === 3) { await abortUpload(uploadId); throw e; }
    await sleep(backoffMs(attempt));
  }
}
```

### Env-gated e2e skeleton (pg-matrix idiom, verbatim pattern)
```js
/* test/pg-matrix.test.mjs:32-43 pattern [VERIFIED this session]:
   const url = process.env.POSTGRES_TEST_URL;
   const maybe = url ? test : test.skip;   */
const minioUrl = process.env.MINIO_TEST_URL; // plan sets MINIO_TEST_URL when Docker MinIO is up
const maybeMinio = minioUrl ? test : test.skip;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| minio/minio on Docker Hub | Community edition discontinued; images pulled from Docker Hub | Sept–Oct 2025 | Pin quay.io tag; verify pull at plan time (Pitfall 1) |
| SigV4 streaming trailers (crc32 trailers, SDK default since 2024) | Plain signed payload hash | ongoing | Hand-rolled client must NOT emit STREAMING-* modes; third-party servers reject them (Garage #824) — plain hex hash is the universal path |
| md5/ETag verification | sha256 sidecar + stream-back verify | our D-88-8 | already decided |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `quay.io/minio/minio:RELEASE.2025-10-15T17-29-55Z` is pullable and runs single-node MinIO with a valid SigV4 impl | Standard Stack / Pitfall 1 | e2e can't run; fallback = mirror image or golden-vectors-only + user checkpoint |
| A2 | B2 S3 endpoint accepts SigV4 with region string equal to the endpoint region token (e.g. `us-east-005`) — B2 docs show both path-style and vhost forms work | Provider quirks | B2 e2e not covered anyway (only MinIO is); B2 users report on real instances — probe's keyed errors catch drift |
| A3 | Node 24 `http.request` streaming a `fs.createReadStream` with explicit Content-Length performs a plain PUT without chunked encoding | Multipart mechanics | Fallback: read each part into a 64 MiB Buffer (still memory-bounded, slightly worse) |
| A4 | Error-body `<Code>` parsing: RequestTimeTooSkewed / SignatureDoesNotMatch / InvalidAccessKeyId / AccessDenied / NoSuchBucket are the codes worth mapping | Pitfall 5 | Probe mapping slightly incomplete; keyed-refusal funnel makes extending cheap |

## Open Questions

1. **Pinned MinIO tag pullability**
   - What we know: Docker Hub minio/minio removed; quay.io/minio/minio carries the last community release [CITED].
   - Unclear: whether the exact pinned tag pulls in this environment today.
   - Recommendation: plan task 0 = `docker pull` + `docker run` smoke of the pinned image; checkpoint to user on failure.
2. **Where the upload stage slots** (planner decision, constrained by D-88-1/2/5): after `verifying` + publish, or after finalize. CONTEXT explicitly leaves this to the planner; research has no preference — the staged file is immutable either way after the atomic rename.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | everything | ✓ | v24.21.0 | — |
| Docker | MinIO e2e | ✓ | 29.9.3 | golden-vector tests only (descope e2e, note in plan) |
| MinIO image | e2e | ✗ (must pin + pull) | — | see Pitfall 1 / Open Question 1 |
| curl (probe smoke) | operator debugging | standard | — | — |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node --test` (stdlib), consistent with all 150+ existing tests |
| Config file | none — convention-based (test/*.test.mjs) |
| Quick run command | `node --test test/backup-s3-sigv4.test.mjs` |
| Full suite command | `node --test test/` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BKBCK-05a | SigV4 signature bytes match AWS golden vectors (incl. PUT with payload hash, GET, multipart part) | unit (offline, always-on) | `node --test test/backup-s3-sigv4.test.mjs` | ❌ Wave 0 |
| BKBCK-05b | Key URI-encoding incl. spaces/unicode/slashes | unit | same file | ❌ Wave 0 |
| BKBCK-05c | Multipart threshold: ≤512 MiB single PUT, >512 MiB 64 MiB parts; abort on part failure; retry-from-offset | unit w/ local mock HTTP sink | `node --test test/backup-s3-upload.test.mjs` | ❌ Wave 0 |
| BKBCK-05d | Skew error → `err.s3ClockSkew`; probe results keyed | unit | same | ❌ Wave 0 |
| BKBCK-05e | Env unset → toggle hidden + `s3Enabled` keyed refusal; task CRUD gate | unit (existing backup-tasks-api test style) | `node --test test/backup-tasks-api.test.mjs` | exists (extend) |
| BKBCK-05f | Run lifecycle: uploading stage, upload_failed state, email transition gate | unit (backup-export/backup-scheduler style) | `node --test test/backup-export.test.mjs` | exists (extend) |
| BKBCK-05g | MinIO e2e: probe → upload large synthetic archive → verify sha256 → download seam | e2e (env-gated) | `MINIO_TEST_URL=... node --test test/backup-s3-e2e.test.mjs` | ❌ Wave 0 (skips when env absent) |

### Sampling Rate
- **Per task commit:** golden-vector file only (<5 s)
- **Per wave merge:** full `node --test test/`
- **Phase gate:** full suite green + (when Docker MinIO available) e2e pass, before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/backup-s3-sigv4.test.mjs` — golden vectors BEFORE any signing code ships
- [ ] `test/backup-s3-upload.test.mjs` + a tiny local HTTP sink for multipart mechanics
- [ ] `test/backup-s3-e2e.test.mjs` with the pg-matrix skip idiom
- [ ] Pinned MinIO image pulled (plan task 0, see Open Question 1)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | SigV4 credentials from boot-frozen env; never in DB rows (D-88-11) |
| V3 Session Management | no | no new sessions |
| V4 Access Control | yes | probe + task mutations ride the existing operator/admin route funnel + audit log |
| V5 Input Validation | yes | strict-token env consts (unset/fail-closed, MAILER/TOTP precedent); `s3Enabled` boolean-only; endpoint scheme validated (http allowed only with D-88-14 warning) |
| V6 Cryptography | yes | HMAC-SHA256 via node:crypto only; never hand-roll the primitives, only the canonicalization |
| V14 Data Protection | yes | secrets redacted from logs/error fields (project has a redaction discipline — `test/redaction.test.mjs` exists); error fields carry messages, never the secret key |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Secret leakage into run-row error field / logs | Info Disclosure | redact Authorization header & any header dump; slice error text like existing pipeline (`String(error?.message).slice(0, 300)` pattern exists in export/backup.js) |
| SSRF via operator-supplied S3_ENDPOINT | Elevation/Spoofing | endpoint is operator-only config (boot-frozen env, not per-request), so blast radius = operator-controlled anyway; still: no scheme guessing, explicit http warning (D-88-14) |
| HTTP (non-TLS) credential exposure | Spoofing | probe-time warning + DEPLOY.md caveat (D-88-14) |
| Multipart leak (abandoned uploads) | Tampering/Storage | AbortMultipartUpload on failure + DEPLOY.md lifecycle rule guidance (D-88-7) |

## Sources

### Primary (HIGH confidence)
- 88-CONTEXT.md — all D-88 decisions (read verbatim this session)
- `export/backup.js` header + pipeline comments (grep-read, verbatim quotes above) — stages, staging immutability, sha256 sidecar convention
- `server.js` boot-migration precedents + backup_tasks schema (grep-read, lines cited)
- `test/pg-matrix.test.mjs:32-43` — env-gated skip idiom (verbatim quote)
- AWS S3 Developer Guide, sig-v4-header-based-auth — x-amz-content-sha256 requirements, UNSIGNED-PAYLOAD, canonical request [CITED via fetched content]
- Backblaze docs (apidocs + cloud-storage docs) — v4-only signatures, endpoint/path-style forms [CITED]

### Secondary (MEDIUM confidence)
- WebSearch: MinIO Docker Hub removal + last community release tag (multiple corroborating sources: GitHub releases page, Chainguard, stablebuild, vonng.com)
- WebSearch: RequestTimeTooSkewed 15-minute allowance (AWS blog + multiple consistent sources)
- Garage issue #824 — third-party rejection of STREAMING-* payload modes

### Tertiary (LOW confidence)
- MinIO pin `RELEASE.2025-10-15T17-29-55Z` pullability in this environment (A1)

## Metadata

**Confidence breakdown:**
- SigV4 / canonicalization: HIGH — AWS official docs fetched this session
- Codebase seams: HIGH — read/verified this session
- Provider quirks: MEDIUM — vendor docs + corroborated community sources; B2 region-string handling (A2) needs live confirmation only if B2 is exercised
- MinIO e2e pin: LOW→ plan-time verification required (A1)

**Research date:** 2026-11-22
**Valid until:** 2026-12-22 (SigV4 is stable; MinIO pinning situation is the fast-moving item — re-verify pull at plan time regardless)
