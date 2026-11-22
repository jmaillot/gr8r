---
phase: 88-s3-destination
reviewed: 2026-11-22T00:00:00Z
depth: deep
files_reviewed: 8
files_reviewed_list:
  - export/s3.js
  - export/backup.js
  - server.js
  - src/pages/backup.js
  - src/actions/actions.js
  - src/core/api.js
  - src/locales/en.json (+de/es/fr/nl spot-check)
  - docs/DEPLOY.md §20
  - test/backup-s3-sigv4.test.mjs / backup-s3-upload.test.mjs / backup-s3-e2e.test.mjs (skimmed for coverage)
findings:
  critical: 0
  major: 2
  minor: 7
  total: 9
status: issues_found
---

# Phase 88: Code Review Report

**Reviewed:** 2026-11-22
**Depth:** deep
**Files Reviewed:** 8
**Status:** issues_found

## Summary

The core S3 machinery is solid: the SigV4 signer is golden-vector pinned, error text is sliced and never carries secrets, ETag is never trusted for integrity (real stream-back sha256 + sidecar), multipart aborts on part-budget exhaustion and retries re-hash from the immutable published file, the memory-bounded doctrine holds on every byte path, and the local-first doctrine is correctly enforced (upload failures route into `upload_failed` and never touch the published archive or the generic fail path). Boot-frozen env consts, the keyed refusal funnel, the audit trail, and the render-only client contract are all honored.

Two defects survive contact with the runtime: the client poll loop stops the moment the stage becomes `uploading` (so the D-88-5 uploading badge freezes at 0/null and the run's terminal outcome never renders during S3 uploads), and opting out of path-style via `S3_PATH_STYLE=false` produces requests that never address the bucket at all. Neither loses data; both are user-visible breaks of this phase's own ratified behavior.

## Major Issues

### MAJ-01: Client poll loop stops at the `uploading` stage — progress badge freezes and the run's terminal outcome never renders

**File:** `src/actions/actions.js:4776` (and `:4795`)
**Issue:** `BACKUP_ACTIVE_STAGES = ['collecting', 'archiving', 'verifying']` omits `'uploading'`, so the first poll payload with `stage: 'uploading'` calls `backupStopPolling()`. Consequences during any S3-enabled run (the exact feature this phase ships):

1. The uploading badge renders once with `partsDone: 0` / `partsTotal: null` and never updates as multipart parts complete (server emits `progress` events, but nothing polls — D-88-5's "first-class visible stage with multipart progress" is broken client-side).
2. When the run finishes (`done` or `upload_failed`), no further poll ever lands — the card shows a stale `uploading` badge indefinitely until a page reload/re-entry.
3. The 87-04 piggyback history refresh (`refreshOpenBackupHistories`, actions.js:4813) also stops, so the run row landing in history is delayed too.

The comment at 4794 says the interval stops on "done|failed|idle", but `uploading` is neither. Server-side everything is correct: `claimRun` (export/backup.js:159), the D-10 overlap check (server.js:8758) and the D-19 payload (server.js:8804) all include `uploading`.
**Fix:**
```js
const BACKUP_ACTIVE_STAGES = ['collecting', 'archiving', 'verifying', 'uploading'];
```
(and keep the `backupRunErr`/terminal handling as-is; `upload_failed`/`done` still stop the loop since they are not in the set).

### MAJ-02: `S3_PATH_STYLE=false` builds requests whose host never addresses the bucket — every request mis-targets

**File:** `export/s3.js:139-144` (`requestPath`) and `:173` (`const url = new URL(endpoint + reqPath)`)
**Issue:** When `pathStyle === false`, `requestPath` correctly strips the bucket from the path (virtual-host canonical style), but `s3Request` still builds the URL from the raw endpoint: `new URL(endpoint + reqPath)`. The bucket is never prepended to the host, so a request targets `s3.us-east-1.amazonaws.com/<key>` instead of `<bucket>.s3.us-east-1.amazonaws.com/<key>` — i.e. the wrong (nonexistent) bucket. Every operation fails with `NoSuchBucket`/`SignatureDoesNotMatch` despite a correct signature. This makes the documented `S3_PATH_STYLE` knob (DEPLOY.md §20) a silent trap: the default path-style works, but the advertised opt-out is 100% broken. Verified: `S3.config()` (server.js:353-362) passes `pathStyle: S3_PATH_STYLE !== false`, so the broken branch is reachable exactly when an operator sets `S3_PATH_STYLE=false`.

**Fix:** resolve the host per-style in `s3Request`:
```js
const endpointHost = new URL(endpoint).host;
const host = config.pathStyle === false ? `${config.bucket}.${endpointHost}` : endpointHost;
// and build the URL from https://${host}${reqPath} (or keep endpoint for path-style)
```
Alternatively, refuse `S3_PATH_STYLE=false` at boot until virtual-host support exists — a working default beats a broken option, but a boot refusal is the honest minimal fix.

## Minor Issues

### MIN-01: `NoSuchBucket` probe failures surface as generic `unreachable` instead of a bucket-specific class

**File:** `export/s3.js:342-346` (`mapProbeError`)
**Issue:** `s3ErrorFrom` classifies `NoSuchBucket` as `noBucket`, but `mapProbeError` only special-cases `clockSkew`, `badCreds` and `forbidden` — a wrong bucket name in the probe returns `unreachable` plus a raw error string. DEPLOY.md §20 explicitly promises the probe reports `s3NoBucket`. Bucket name typos get the least helpful keyed message.
**Fix:** add `if (e?.s3Class === 'noBucket') return { ...base, key: 's3NoBucket' };` plus a matching toast/locale key and doc alignment.

### MIN-02: Probe/save refusal codes `badCreds` and `unreachable` have no `err.*` locale entries

**File:** `src/locales/en.json:2204-2211` (same gap in de/es/fr/nl)
**Issue:** `s3ClockSkew` has an `err.*` entry, but the other probe refusal keys the server emits (`badCreds`, `unreachable`) do not. When a save is refused with these codes, `tErr(res.data?.code, null, res.error)` falls back to the raw English server message ("S3 destination probe failed — the task was not saved") in all five locales — inconsistent with D-88-17's keyed-localization intent.
**Fix:** add `err.badCreds` / `err.unreachable` (or namespaced `err.s3BadCreds` etc.) ×5 locales.

### MIN-03: DEPLOY.md §20 documents machinery that does not exist and the wrong permission set

**File:** `docs/DEPLOY.md:1659` and `:1675`
**Issue:** Three factual errors verified against code:
1. "the boot probe reports `s3NoBucket`" — there is **no boot probe** for S3 anywhere in server.js (grep-verified); probing exists only via the UI probe route and probe-at-save.
2. The failure-class names in docs (`s3BadCreds`, `s3NoBucket`) don't match the actual probe keys (`badCreds`, `unreachable`) — see MIN-01.
3. The permission list (PutObject/GetObject/AbortMultipartUpload/ListMultipartUploadParts) omits **s3:DeleteObject** (the probe marker delete — without it every probe ends in the `deleteFailed` warning) and **s3:ListBucket** (HeadBucket). An operator following the doc verbatim provisions a broken-looking destination.
**Fix:** rewrite the bullet to describe the UI probe (no boot probe), align class names with the code, and add s3:DeleteObject (scoped to `gr8r-probe/*` if possible) + s3:ListBucket to the policy list.

### MIN-04: Shutdown handler excludes `uploading` from cancellation — the cancel-at-upload-boundary path is nearly unreachable and a shutdown mid-upload hard-kills the upload

**File:** `server.js:11125` vs `export/backup.js:773-778`
**Issue:** The SIGTERM handler calls `cancelRun()` only for stages `collecting|archiving|verifying`. `uploading` is excluded, and `uploadArchive` never polls the `cancelled` flag internally, so the advertised "cancelled before S3 upload → upload_failed" path (backup.js:776) can only trigger if cancellation landed between publish and `setStage('uploading')` — a microsecond window. A shutdown during a real upload leaves the run row `running` (mis-labeled `interrupted` at next boot even though the local archive published fine) and hard-exits after the 5 s timer mid-PUT.
**Fix:** either include `'uploading'` in the shutdown check (the boundary branch then fires at the next cancellation-check point — add one between parts in `uploadMultipart` via an `onProgress`-style callback), or document that in-flight uploads are abandoned on shutdown and the local archive is the survivor.

### MIN-05: An early error response does not destroy a piped request stream

**File:** `export/s3.js:206-208` (`consumeAndThrowS3Error`) with stream bodies
**Issue:** When the server answers ≥300 while a `fs.createReadStream` body is still piping, the response is consumed and the promise rejected, but the source stream and request are left running until the socket errors out — on retries this can briefly stack orphaned read streams against the same file. Not a correctness bug (attempts are serialized), but avoidable resource hygiene.
**Fix:** in `consumeAndThrowS3Error`, after attaching the reject handlers, also `res.req?.destroy()` / destroy the passed-in body stream when `opts.body` is a stream.

### MIN-06: Abort after a successfully-completed multipart Complete

**File:** `export/s3.js:539-548` (`uploadMultipart` catch)
**Issue:** If `CompleteMultipartUpload` succeeds at the provider but the response body later trips the `/<Error>/` check or a parse failure, the `catch` aborts an already-committed multipart transaction — the abort gets `NoSuchUpload` back and is swallowed. Harmless, but the object may exist while the caller reports failure; the subsequent sidecar upload then also fails and the run lands `upload_failed` with a possibly-complete object in the bucket (no leak of integrity — the D-88-8 verify-never-ETag rule protects correctness — but the error text won't hint the object may exist).
**Fix:** only abort when the failure occurs before/at Complete; note the "object may exist" possibility in the error message, or accept the current belt-and-braces and document it.

### MIN-07: Probe success at task create/edit is not audited

**File:** `server.js:8465-8470` and `:8612-8618`
**Issue:** Probe refusals at save are audited (`backup_task_refused:s3Probe:<key>`) and the dedicated probe route audits both outcomes, but a *successful* probe-at-save rides the response without a `backup_s3_probe_ok` audit entry. The backup_* audit funnel is asymmetric for the same operation.
**Fix:** emit `auditBackupTask(user, s3Probe.ok ? 'backup_s3_probe_ok' : ..., id, s3Probe.key)` on the create/edit paths too.

## Verified-clean contracts (spot-checked, no findings)

- Secrets: `Authorization`/secret never enter errors or logs; error text sliced ≤300 chars (s3.js:58-60, backup.js:764, backup.js:812); `/api/config` exposes the `s3Enabled` boolean only (server.js:5805); task rows carry `s3_enabled` only.
- ETag never trusted: collected solely for the Complete payload (s3.js:496-519); verification is stream-back sha256 + `<key>.sha256` sidecar compare (backup.js:786-795).
- Real-payload-hash SigV4 enforced — stream bodies refuse `UNSIGNED-PAYLOAD`/missing `bodyLength` (s3.js:176-182); golden vectors pin the signer.
- Local-first: upload failure paths return before the generic catch; the published archive and sidecar are never touched on `upload_failed` (backup.js:756-799, 807-816).
- Multipart: abort-on-budget-exhaustion (T-88-12), ≤3 attempts/part, per-attempt re-hash from the immutable file; 200-with-error Complete body fails closed (s3.js:541-543).
- Memory-bounded: every byte path is a stream slice; the executor test pins it.
- Boot-frozen env consts with strict-token `S3_PATH_STYLE` boot-refusal (server.js:205-218, 260-265); no per-request env reads.
- Keyed refusal funnel: invalid `s3Enabled`, `s3NotConfigured`, probe refusals — all audited; probe route rides the sameOrigin → requireUser → throttle → capability gate chain.
- Email gate: `upload_failed` rides `handleBackupTaskOutcome(taskId, runId, 'failed', …)` — failure-on-entry + recovery semantics preserved (server.js:3445-3457, 3562-3570).
- Locales: all 12 phase keys present ×5 locales.
- Tests: golden-vector SigV4 (offline), executor retry/abort/memory tests, env-gated MinIO e2e — coverage matches D-88-18.

---

_Reviewed: 2026-11-22T00:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
