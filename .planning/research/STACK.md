# Stack Research

**Domain:** Scheduled logical backup + selective restore for a zero-dependency self-hosted Node.js app (gr8r / Projects Studio v3.3)
**Researched:** 2026-11-21
**Confidence:** HIGH on stdlib primitives and DB snapshot mechanics (all verified locally against Node 24.21.0 and server.js); MEDIUM on S3-provider edge quirks (verified against Backblaze official docs, not live-tested against MinIO/AWS)

**Owner-ratified constraint honored throughout: ZERO new npm dependencies.** Everything below is `node:crypto`, `node:http(s)`, `node:fs`, `node:zlib`, `node:sqlite`/pg-adapter, `Intl.*` — all already present in the app's runtime.

## Verified Codebase Facts (read from server.js / db-adapter.mjs)

| Fact | Evidence | Consequence for v3.3 |
|------|----------|----------------------|
| SQLite driver is `node:sqlite` `DatabaseSync`, imported once in server.js:113, wrapped by `db-adapter.mjs` async facade | server.js:58, :113 | Backup engine must go through the adapter, not a second driver |
| **Node 24.21 `node:sqlite` has NO `backup()` method** — prototype is `open, close, prepare, exec, function, aggregate, serialize, deserialize, …` (verified live) | local Node 24.21.0 | The online sqlite3_backup path is unavailable; `VACUUM INTO` is the only clean snapshot primitive |
| The existing `--backup` CLI already does `pragma wal_checkpoint(truncate)` + `VACUUM INTO '<dest>'`, SQLite-only, pg no-ops (D-09) | server.js:9594–9606, :793 capability gate in db-adapter.mjs | **Reuse this exact recipe** as the SQLite snapshot step of every backup run |
| Read-only snapshot reads already exist: `new DatabaseSync(snapshotPath, { readOnly: true })` over pre-sweep backups | server.js:4443 | Selective restore reads the exported rows the same way — no new pattern |
| Scheduler precedent: `setInterval(...).unref()` sweeps (hourly session/challenge sweeps, reminder pass) with injectable clock (`now` param, phase 27) and `.catch()` on every callback to survive unhandled rejections | server.js:9696–9732, :2365 | Backup tick loop must copy this pattern exactly |
| Transactions on pg run on a **checked-out pool client**, never `pool.query('BEGIN')` (adapter "Pattern 2"); `db.tx()` shared mutex on SQLite | db-adapter.mjs:477, :495 | Consistent pg read = one client + one `REPEATABLE READ` tx through the adapter's client-checkout path |
| Files live as raw bytes under `DATA_DIR/files/` (and `DATA_DIR/logos/`); served via `fs.createReadStream` with ranges | server.js:128, :662 | Export of uploaded files = directory copy/archive of a scope's `file` rows + their byte files |
| SMTP email delivery exists in-app with outbox machinery (`email_outbox`) | v2.4 webhook/email claim-then-deliver work | Failure notification rides the existing sender, no new transport |

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Hand-rolled S3 client (node:https + SigV4) | ~400–600 LOC module `lib/s3client.mjs` | PutObject / GetObject / HeadObject / ListObjectsV2 / DeleteObject + multipart (Initiate/UploadPart/Complete/Abort) | Owner-ratified; the minimal S3 surface for backup destinations is tiny — 5 object ops + 4 multipart ops, all plain HTTPS with a signature header. Covers AWS, MinIO, B2 (see provider notes below) |
| Hand-rolled 5-field cron parser + next-run calculator | ~150 LOC module `lib/cron.mjs` | Schedule evaluation for backup tasks | See "Scheduling decision" below — cron subset, not full cron, computed against the workspace-shared tz using `Intl.DateTimeFormat` (same `resolveTz` funnel as phase 44) |
| **ustar tar + node:zlib gzip** ("gr8r backup v1" container) | ~250 LOC tar writer/reader | Logical export archive: manifest.json + per-table NDJSON + files/ | No zip in stdlib, no tar in stdlib; tar (512-byte headers) is by far the simplest format to hand-roll, streams natively, random-access readable for selective restore, and gzip via `node:zlib.createGzip()` is one pipe. sha256 (node:crypto) computed in the same pipe |
| `pragma wal_checkpoint(truncate)` + `VACUUM INTO` | existing recipe | Consistent SQLite snapshot while writes happen | Proven in the `--backup` CLI since v1.x; `VACUUM INTO` takes a consistent read snapshot of the whole DB into a fresh file and never modifies the source DB. `node:sqlite.backup()` does NOT exist on Node 24.21 (verified) |
| pg: single checked-out client + `REPEATABLE READ` read-only transaction | adapter Pattern 2 | Consistent logical read of all scope tables | MVCC gives a stable snapshot across every SELECT in the tx; read-only (`SET TRANSACTION READ ONLY`) lets Postgres skip vacuum churn penalties |

### Supporting Libraries

None — zero-dependency constraint. The "libraries" are the hand-rolled modules:

| Module (proposed) | Purpose | Notes |
|---------|---------|-------|
| `lib/awssig4.mjs` | SigV4 request signing | ~80 lines: canonical request → string-to-sign → HMAC-SHA256 chain (`crypto.createHmac('sha256')`), service `s3`, `x-amz-content-sha256` header mandatory |
| `lib/s3client.mjs` | Destination driver | Endpoint config: `{endpoint, region, bucket, accessKey, secretKey, pathStyle}` — path-style default (MinIO/B2 need it; AWS works with it via endpoint `s3.<region>.amazonaws.com`) |
| `lib/cron.mjs` | 5-field cron subset + `nextRun(after, tz)` | Reject 6-field/seconds and `@reboot` aliases at parse time with a keyed refusal |
| `lib/grarchive.mjs` | ustar tar writer/reader + manifest schema | Manifest = first archive entry (`manifest.json`), versioned `{formatVersion, createdAt, scope, tables:[{name, rows, sha256}], files:[{path, size, sha256}]}` |
| `lib/gfs.mjs` | GFS rotation policy | Pure function: `classify(runDate) → {daily, weekly, monthly, yearly} tier`; deletion by tier label — trivially unit-testable, no cron coupling |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Testcontainers-style local MinIO (dev-only, outside the app) | Integration-testing the S3 client | MinIO binary or docker compose in the e2e lane only; unit tests sign+verify against a stubbed HTTP layer |
| Existing clock-injection test pattern (phase 27) | Testing cron next-run across DST boundaries | Reuse `now` injection, add fixed-Date fixtures for UTC/DST transitions |

## The Five Decisions (detailed answers)

### 1. Hand-rolled S3 client — minimal viable surface

**Ops needed:** PutObject, GetObject, HeadObject (existence/size checks for restore), ListObjectsV2 (backup listing + GFS deletion), DeleteObject, plus multipart: POST `?uploads`, PUT `?partNumber&uploadId`, POST `?uploadId` (complete), DELETE `?uploadId` (abort). That's 9 endpoints, all query-string-only (no POST policies, no presigned URLs, no ACLs, no tagging).

**Signing (SigV4):**
- Canonical request: `HTTP-verb\n canonicalURI\n canonicalQuery\n canonicalHeaders\n signedHeaders\n hashedPayload`. For S3 the URI must **not** have the path double-encoded the way other AWS services do (S3 escapes each path segment once; `ListObjectsV2`'s `list-type=2&prefix=...` goes in canonicalQuery sorted).
- Headers to sign: `host`, `x-amz-content-sha256`, `x-amz-date` (never `Date` — signature lifetime issues). Scope: `<date>/<region>/s3/aws4_request`.
- Payload hash: for every backup PUT the body is a **file with known length** — compute sha256 while writing/reading the temp file (one `crypto.createHash()` pass) and sign the real digest. This avoids both `UNSIGNED-PAYLOAD` (HTTPS-only) and `STREAMING-AWS4-HMAC-SHA256-PAYLOAD` (chunked trailer signing, ~150 extra lines for zero benefit when content-length is known).
- **Streaming download**: GetObject response → pipe to `fs.createWriteStream` via `node:https` res stream; the response stream is already backpressure-correct. sha256 of the downloaded object recomputed while piping and compared to the manifest — this IS the per-backup integrity check (manifest `archive.sha256`).

**Provider quirks (verified via Backblaze official docs):**
- **B2**: SigV4 only (no v2), endpoint `s3.<region>.backblazeb2.com`, path-style AND vhost both accepted, HTTPS only, region must match the account's region. No object ACLs, no tagging. Multipart fully supported (`?uploads` etc.).
- **MinIO**: SigV4, path-style preferred (vhost works only if configured with a domain), no TLS locally — the client must accept `http://` endpoints for self-hosted MinIO (config flag, default false).
- **AWS**: region required in scope even when endpoint given; treat region as config, not discovery (no `GetBucketLocation` round-trip in v1 — ask at config save time instead).
- Error handling: 4xx/5xx return **XML** bodies (`<Error><Code>...`); parse just the `Code` element with a regex for retry classification (500/503/429 retryable with the app's existing backoff pattern from webhook delivery).

**Multipart threshold:** recommend 64 MiB parts (5 MiB is the S3 minimum for all-but-last; B2 allows up to 5 GiB parts; 64 MiB × 10,000 parts = 640 GB ceiling — far above any realistic instance). Files < 512 MiB → single PutObject; ≥ 512 MiB → multipart, uploading parts **serially** from the temp file (`fs.read` slice into a reusable 64 MiB buffer) — one part in memory at a time, retryable per part.

### 2. Cron parsing — recommendation

**Use a 5-field cron subset, not the setInterval/day+time model.** Rationale: GFS rotation inherently needs daily/weekly/monthly/yearly runs with different retention per tier, and owner ratified "cron-style". The existing reminder model (day-of-week + time-of-day) cannot express "every 6 hours" or "1st of month". But hand-roll a **subset**: `minute hour day-of-month month day-of-week`; support `*`, `,` lists, `-` ranges, `*/n` steps. Reject at parse time: 6-field (seconds), `@hourly` aliases, `?`, name tokens (`MON`) — all with keyed refusals, fail-closed like the domain-door parsing (phase 75 precedent).

**Next-run computation:** pure `nextRun(cronFields, afterDate, tz)` advancing minute-by-minute in the target timezone via `Intl.DateTimeFormat(tz, {timeZone})` decomposition (the app already owns `resolveTz`). Minute-walk is naive but fine: worst case for `0 0 30 2 *` is ~105k iterations ≈ negligible; cap at 5 years and refuse unreachable expressions. Compute and **persist `next_run_at`** on the backup task row at save time and at boot; the tick loop (existing `setInterval` sweep pattern, 60 s cadence, `.unref()`, `.catch()` — verbatim phase-27 posture) fires any task whose `next_run_at <= now` and recomputes. This gives DST correctness, "Run now" is trivial (same code path with a manual trigger flag), and missed-run handling is a one-line policy (fire once, skip ahead).

Do NOT reuse the reminder scheduler's day/time model — it would fork into two schedulers forever. Do NOT use `node-cron`-style full spec — it doubles the parser surface for zero v3.3 need.

### 3. Archive format — recommendation

**"gr8r backup v1" = gzip-compressed ustar tar with manifest.json as entry 0.** Not zip, not a custom concatenation:

- **Why not zip:** stdlib has no zip writer/reader; hand-rolling a zip means crc32 + local headers + central directory + data descriptors ≈ 3–4× the code of tar, and zip's random-access model (central directory at the END of file) is hostile to streaming writes. Trivially wrong choice under the zero-dep constraint.
- **Why not custom concatenated payload:** selective restore needs to pull ONE workspace/project out of a large archive without reading the whole thing — tar's 512-byte header walk gives this for free (seek forward per entry); gzip loses seeking (acceptable: decompress-and-walk sequentially, or write plain-tar for large instances). A custom format would also be invisible to every existing tool (`tar tzf`, `less`), which matters for a backup product — operators must be able to inspect archives WITHOUT the app running.
- **Tar specifics:** ustar format only (no pax headers needed — names fit: `tables/<name>.ndjson`, `files/<fileId>`; ustar name field is 100 chars — use deterministic short paths, ids not user names). Writer = build 512-byte header (mode 0644, uid/gid 0, mtime, checksum, typeflag) + content padded to 512. Reader = parse header, stream content, skip padding. Node:zlib `createGzip`/`createGunzip` piped around it.
- **Checksums:** **sha256**, computed three places: (a) per-table row-count+sha256 inside the manifest while streaming NDJSON rows, (b) per-file sha256 for uploaded files, (c) whole-archive sha256 computed through the pipe and stored in the `backup_runs` row — this is the per-backup integrity check, and restore verifies all three before writing anything.
- **Row payload:** per-table NDJSON (`{col: value}` rows, one per line) streamed from SELECT — streams, is line-diffable, and restore can validate row-by-row. Blob columns (doc JSON) stay as strings.
- **Manifest schema must be versioned from day one** (`formatVersion: 1`) — selective restore across app versions is the single biggest future hazard (PITFALLS).

### 4. Consistent snapshot while writes happen

**SQLite (node:sqlite — verified on Node 24.21):**
- `db.backup()` does **not exist** in this Node build (prototype enumerated live — no such method). Do not plan around it.
- Use the proven recipe exactly as `--backup` does: `pragma wal_checkpoint(truncate)` then `VACUUM INTO '<tmp>/<run-id>.db'` — inside `sqliteOnly()` gate for pg (D-09). `VACUUM INTO` reads a consistent snapshot (implicit read transaction) into a fresh file; it never blocks readers on the live DB and never modifies the source. It CAN fail `SQLITE_BUSY` if another writer holds a checkpoint lock — retry with the existing backoff helper, and record failure honestly in run history.
- Then the **logical export reads the snapshot file read-only** (`new DatabaseSync(snapPath, { readOnly: true })` — existing precedent at server.js:4443), so the live DB is never under load during export.
- Skip the in-memory `serialize()` alternative: it materializes the whole DB in a Buffer — defeats streaming and OOMs on real instances.
- **pg:** one checked-out pool client (adapter Pattern 2 — never `pool.query('BEGIN')` on the pool), `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, run every scope SELECT on that client, commit/rollback in `finally` with client release. Gotchas: (a) a long RR transaction holds back vacuum cleanup — fine at self-host scale, keep the export pass sequential per table, (b) the snapshot begins at the FIRST statement, so issue a trivial `SELECT 1` immediately after BEGIN to pin it before the heavy reads, (c) never interleave with the adapter's SQLite mutex paths, (d) toasts/large objects don't exist in this schema — plain row SELECT is sufficient.
- Both engines funnel into the SAME archive writer (rows → NDJSON): the scope-select layer is the only dialect-specific code; everything downstream (tar, manifest, destinations, restore validation) is engine-agnostic — this is the ratified "ONE logical export format" requirement.

### 5. Streaming upload without memory blowup

- **Pipeline:** engine snapshot/rows → `grarchive.mjs` tar transform → `node:zlib` gzip → **tee** → (a) `fs.createWriteStream` into `DATA_DIR/tmp/backup-<runId>.tar.gz` (temp staging file — required anyway for sha256 + S3), (b) `crypto.createHash('sha256')` digest.
- **Local destination:** copy the staged temp file to the mapped volume with `fs.createReadStream → createWriteStream` (or `fs.copyFile`, which is syscall-efficient). Never pipe the gzip output directly to the destination — the staged file is what makes retry-on-destination-failure cheap and the checksum verifiable.
- **S3 destination:** staged file with known size → single `PutObject` below the 512 MiB threshold (sign real payload hash, stream the file as request body with `content-length` set — node:https handles a file stream body fine); multipart above it, serial 64 MiB slice reads into ONE reusable Buffer. Memory ceiling ≈ 65 MiB regardless of archive size.
- **Restore (download direction):** S3 GetObject streams to a staged temp file first (sha256 verified while streaming), then tar-walk it — never `res.on('data')` accumulation into memory.
- Abort/crash hygiene: `SIGTERM`/boot-time sweep of `DATA_DIR/tmp/backup-*` older than 24 h (same sweep posture as the existing hourly `setInterval` sweeps).

## Installation

```bash
# Nothing to install. Zero new dependencies (owner-ratified).
# Dev-only, for the S3 integration test lane (not runtime deps, not in package.json deps):
#   MinIO single binary or docker compose service in the e2e environment
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| 5-field cron subset, hand-rolled | Reuse day/time-of-day reminder model | Never for this feature — cannot express monthly/GFS cadences; would fork two scheduler models |
| 5-field cron subset, hand-rolled | Full cron grammar (6-field, aliases, `?`, names) | If a future milestone needs seconds precision or @reboot — v3.3 explicitly doesn't |
| gzip'd ustar tar | Custom concatenated payload + index | If archives had to support random-access without decompression — not a backup-product need; operator inspectability favors tar |
| gzip'd ustar tar | ZIP (hand-rolled) | Never under zero-dep: crc32 + central directory ≫ tar complexity, streaming-hostile |
| `VACUUM INTO` snapshot | `serialize()` to Buffer | Only if DB ever fits comfortably in RAM (< ~100 MB); OOM risk otherwise |
| `VACUUM INTO` snapshot | Copy `.db` + `.wal` files directly | Never — copies a checkpoint-inconsistent pair unless the server is stopped |
| Serial 64 MiB multipart parts | Parallel part uploads | Only if throughput to S3 is measured as a real problem; serial keeps memory flat and code simple |
| Manifest sha256 verification | Trusting Content-MD5 / ETag | Never — ETag is not a checksum guarantee on multipart (it's an md5 of part hashes) |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `UNSIGNED-PAYLOAD` in SigV4 | Only valid over HTTPS; silently breaks plain-http MinIO and complicates the signing path | Real payload sha256 over the staged file (length always known) |
| `STREAMING-AWS4-HMAC-SHA256-PAYLOAD` (chunked signing) | ~150 lines of chunk-signature chaining for zero benefit when content-length is known | Real payload hash + content-length |
| `node-cron` / `later.js` style full grammars | Dependency + parser surface this milestone can't justify | 5-field subset with keyed refusals |
| `zip` / hand-rolled crc32 | 3–4× the code of tar, streaming-hostile central directory | ustar tar + node:zlib |
| `pool.query('BEGIN')` for the pg snapshot | Adapter Pattern 2 explicitly forbids it (client may differ per statement → no snapshot) | Checked-out client + `REPEATABLE READ READ ONLY` |
| `VACUUM INTO` against a path with quotes/specials unescaped | Existing CLI escapes `'` — keep it; injection via crafted run-id would be a bug | Same `replaceAll("'", "''")` discipline + parameterize run-id into a UUID |
| Computing archive sha256 in a second pass after upload | Doubles I/O and leaves a window where a corrupted archive looks green | Hash in the tee while writing the staged file |

## Stack Patterns by Variant

**If DB is SQLite (default):**
- wal_checkpoint(truncate) → VACUUM INTO temp → read-only snapshot export → same archive writer
- Because node:sqlite has no backup() API on Node 24.21 and the recipe is battle-tested in `--backup`

**If DB_URL is Postgres:**
- Checked-out client, pin RR snapshot with immediate `SELECT 1`, sequential table SELECTs → same archive writer
- Because MVCC gives the consistent read and Pattern 2 gives the client discipline

**If destination is S3-compatible:**
- Staged temp file → sha256 in pipe → PutObject (< 512 MiB) or serial multipart (≥) → verify with HeadObject size + manifest digest
- Because retryability and memory-flatness beat streaming-direct-to-S3

**If archive is large and inspectability matters:**
- Plain tar (no gzip) for the instance scope option
- Because tar is seekable per-entry; gzip only loses this, so it's a per-destination or per-scope config, not a format fork

## Version Compatibility

| Primitive | Compatible With | Notes |
|-----------|-----------------|-------|
| `node:sqlite` VACUUM INTO | Node 22.5+ (wherever node:sqlite ships) | No `backup()` method on 24.21.0 — verified locally |
| `node:crypto` createHmac chain | Node ≥ 12 | SigV4 needs only HMAC-SHA256 + timingSafeEqual (already used for TOTP/HMAC webhooks) |
| B2 S3 API | SigV4 only | No v2 fallback; region-pinned endpoints; HTTPS only |
| MinIO | SigV4, path-style | Accept `http://` endpoints behind a config flag |
| Postgres RR READ ONLY | pg ≥ 9.x semantics | Snapshot pinned by first statement; adapter pool-client checkout required |

## Sources

- Local verification (HIGH): Node 24.21.0 runtime — `node:sqlite` prototype enumeration (no backup()), VACUUM INTO executes; server.js:113/3778/4443/9594–9606; db-adapter.mjs:477/495/793
- Backblaze S3-Compatible API official docs (HIGH): https://www.backblaze.com/apidocs/introduction-to-the-s3-compatible-api and https://www.backblaze.com/docs/en/cloud-storage-how-to-s3-compatible-api — SigV4-only, path/vhost both valid, region-pinned endpoint, multipart ops, unsupported features (ACLs/tagging/IAM)
- AWS SigV4 specification (HIGH, stable since 2015): canonical request / string-to-sign / derived key chain, s3 path-encoding rule, x-amz-content-sha256 requirements
- Postgres docs semantics for REPEATABLE READ + MVCC snapshot-on-first-statement (HIGH)
- ustar tar format (POSIX 1003.1) header layout (HIGH — public stable format)

---
*Stack research for: gr8r v3.3 Instance Operations — Backup, Restore & Roles*
*Researched: 2026-11-21*
