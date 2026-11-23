# Phase 88: S3 Destination - Pattern Map

**Mapped:** 2026-11-22
**Files analyzed:** 10 (3 new, 7 modified)
**Analogs found:** 10 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `export/s3.js` (NEW) | service | streaming / file-I/O over HTTP | `export/backup.js` (stdlib streaming + fail-closed discipline) | role-match (no S3 client exists — RESEARCH.md SigV4 spec is the source) |
| `export/backup.js` (MOD) | service | streaming pipeline | itself — upload stage slots into `runExport()` | exact |
| `server.js` — `S3_*` boot consts (MOD) | config | boot-time env parse | `WORKSPACE_CREATION`/`SUPER_ACCESS` strict-token consts (server.js:151-181, 219-233); `MAILER = createMailer()` (server.js:312) | exact |
| `server.js` — `s3_enabled` migration (MOD) | migration | boot DDL | `backup_tasks`/`backup_runs` CREATE TABLE (server.js:699-741) | exact |
| `server.js` — task CRUD `s3Enabled` gate (MOD) | route (controller) | request-response | backup tasks POST/PUT funnel (server.js:8260-8339, 8341+) | exact |
| `server.js` — probe route (NEW route in MOD) | route (controller) | request-response | same funnel + OIDC 404-no-oracle guard (server.js:5676-5682) | role-match |
| `server.js` — `/api/config` + writer seam + email gate (MOD) | route/service | request-response + event-driven | `/api/config` (server.js:5659-5671); `writeBackupRunRow` (server.js:3326-3358); `handleBackupTaskOutcome` (server.js:3425-3441) | exact |
| `src/pages/backup.js` (MOD) | component | render-only payload display | itself — `runProgress()` (83-98), `RUN_STATUS_KEYS` (120-127) | exact |
| `src/locales/*.json` ×5 (MOD) | config (i18n) | static | existing `err.backup*` keys in en.json; `backup-tasks-api.test.mjs` locale-catalogue scan | exact |
| `test/backup-s3-*.test.mjs` ×3 (NEW) | test | unit/e2e | `test/pg-matrix.test.mjs` env-gate idiom (30-43); `test/backup-tasks-api.test.mjs` harness | role-match |

## Pattern Assignments

### `export/s3.js` (NEW — service, streaming)

**Analog:** `export/backup.js` — the sibling module convention: root-level `export/`, server-only (never under `src/` — the prohibition test), zero npm deps (D-33-11), exhaustive decision-trail header comment, exported pure helpers + testable seams.

**Module header convention** (backup.js:1-58): open with a `/* ==== NAME — Phase 88 (88-0x) ==== */` banner naming frozen decisions (D-88-1..18), zero-dep mandate, and the pipeline diagram. Follow verbatim in style.

**Import pattern** (backup.js:60-66):
```js
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
// node:http / node:https selected by endpoint scheme (no http2 — RESEARCH.md)
```
Relative imports only; `node:` prefix on stdlib.

**Streaming pattern — the memory-bounded read every S3 read/write must copy** (backup.js:287-307, `sha256File`):
```js
function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const read = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
    read.on('data', chunk => hash.update(chunk));
    read.on('error', reject);
    read.on('end', () => resolve(hash.digest('hex')));
  });
}
```
And per-part retry re-reading the immutable staged file (RESEARCH.md Code Examples, matches D-88-16):
```js
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

**Error-slicing pattern** (backup.js:183, 753) — copy for run-row error fields (V14 redaction: never include headers/secrets):
```js
error: String(error?.message || error).slice(0, 300)
```

**Fail-closed / no-guessing discipline** (backup.js:99-101, 372-373) — the frozen-allow-list refusal style applies to endpoint/key handling:
```js
if (!cols) throw new Error(`backup: table ${name} missing from frozen keyset map (refusing ungated SQL)`);
```

**SigV4 implementation:** RESEARCH.md §"SigV4 implementation pattern" (lines 118-145) is the authoritative spec — canonical request → string-to-sign → key chain, real payload hash (not UNSIGNED-PAYLOAD, never STREAMING-*), S3-specific URI-encoding (never encode `/`). Signer ≤ ~100 lines; pin with AWS golden vectors (Wave 0).

### `export/backup.js` — upload stage insertion (MOD)

**Analog:** itself, `runExport()` (607-757). The upload stage slots after `verifying` (722-723) / around the finalize block (725-739). Copy these mechanics exactly:

- **Stage transition** (174-176): `setStage('uploading')` — mirrors `setStage('archiving')` at line 697; the D-19 payload picks it up automatically.
- **Cancellation checkpoint at every stage boundary** (659-660, 696, 721): `if (currentRun.cancelled) throw new Error('backup: cancelled — server shutdown');`
- **Local-first ordering (D-88-1)**: the atomic rename + sidecar (738-739) publishes the local archive FIRST; S3 upload happens only after the immutable file exists, and a failure must NOT `rmStaging`/`failRun` the local archive — D-88-2's `upload_failed` is a distinct outcome, not the generic catch at 748-757.
- **Writer-seam emission** (593-602, 743-746): `await emitRunEvent({...})` — add upload fields (`stage: 'uploading'`, partsDone/partsTotal per D-88-5) through the same seam; the seam contract "writer error never fails a run" (598-601) holds.

### `server.js` — `S3_*` boot consts (MOD)

**Analog:** strict-token env consts (server.js:151-163) + boot-refuse (219-233):
```js
const _WORKSPACE_CREATION_RAW = process.env.WORKSPACE_CREATION;
const WORKSPACE_CREATION =
  _WORKSPACE_CREATION_RAW === undefined
    ? false
    : _WORKSPACE_CREATION_RAW === 'true'
      ? true
      : _WORKSPACE_CREATION_RAW === 'false'
        ? false
        : null; // sentinel → boot-refuse
```
```js
if (WORKSPACE_CREATION === null) {
  logError(`WORKSPACE_CREATION: invalid value ...`);
  process.exit(1);
}
```
S3 pattern (D-88-11/13): `S3_REGION` default `us-east-1`, `S3_PATH_STYLE` strict-token boolean (default true), `S3_ENDPOINT` optional (no scheme guessing, D-88-13), all read ONCE at module top. No `process.env` reads after boot (server.js top-of-file discipline). Placement: beside the other boot consts (lines 130-193), boot-refuse block beside 219-233.

**Optional-facility precedent** (server.js:312): `const MAILER = createMailer();` — a module-level capability object with an `.enabled` flag. Mirror as `const S3 = createS3Config()` (or flat consts) exposing `enabled` = bucket+keys present; `/api/config` rides this.

### `server.js` — `s3_enabled` migration (MOD)

**Analog:** `backup_tasks` CREATE TABLE (server.js:699-715) and `backup_runs` CHECK-constrained status (726-740). `s3_enabled` is an ADDITIVE column:
```sql
create table if not exists backup_tasks (
  ...
  last_notified_state text,
  ...
);
```
Pattern: additive `alter table ... add column` guarded the way boot migrations already handle existing installs (server.js initDb, 744+; the "SQLite refuses ADD COLUMN on reserved aliases" comment at 841-848 shows the additive-migration guard style). `backup_runs` status CHECK (line 731) must gain `'uploading'`-era values per D-88-2 — note CHECK constraints on existing SQLite tables can't be altered; follow the established boot-migration precedent for enum widening (planner must check how `interrupted`/`skipped_overlap` were added in 87-01).

### `server.js` — task CRUD `s3Enabled` gate + probe route (MOD)

**Analog:** backup tasks POST funnel (server.js:8260-8339) — the exact keyed-refusal shape to copy:
```js
if (!name || name.length > 120) {
  await auditBackupTask(user, 'backup_task_refused:taskNameRequired');
  return fail(res, 400, 'taskNameRequired', 'Give the backup task a name');
}
```
Rules to copy verbatim: sameOrigin → requireUser → operator-keyed throttle → capability gate → per-field keyed refusal, EACH refusal audited via `auditBackupTask(user, 'backup_task_refused:<key>')` (funnel convention, CONTEXT discretion notes). The `s3Enabled` refusal (D-88-12) becomes:
```js
if (body?.s3Enabled && !S3.enabled) {
  await auditBackupTask(user, 'backup_task_refused:s3NotConfigured');
  return fail(res, 400, 's3NotConfigured', 'S3 destination is not configured on this instance');
}
```
Probe route analogs: the OIDC disabled route is a 404-no-oracle (5676-5677); probe-at-save should instead ride the same funnel + throttle shape (`tooMany(...)` at 8266) and return keyed probe results (success/unreachable/badCreds/s3ClockSkew/httpWarning, D-88-15/17). Audit actions follow `backup_*` naming (`backup_task_created` style, 8336).

### `server.js` — `/api/config`, writer seam, email gate (MOD)

**Analog 1 — config exposure** (server.js:5659-5671):
```js
if (pathname === '/api/config' && method === 'GET') {
  return json(res, 200, {
    ...
    oidcEnabled: OIDC.enabled,
  });
}
```
Add `s3Enabled: S3.enabled` — boolean ground truth only, never endpoint/bucket names that could leak (V14).

**Analog 2 — run writer** (server.js:3326-3358, `writeBackupRunRow`): the `complete` branch sets `status='succeeded'` and calls `handleBackupTaskOutcome(taskId, runId, 'ok', '')`. D-88-2's upload lifecycle maps here: an `upload_failed` event rides the same `fail`-shaped branch (`status='upload_failed'`, error = last attempt's error) and MUST call `handleBackupTaskOutcome(taskId, runId, 'failed', err)` — the gate treats it as failed per D-88-3.

**Analog 3 — transition-email gate** (server.js:3425-3441, `handleBackupTaskOutcome`): the compare-and-update is one guarded write; `upload_failed` needs NO change here — it just arrives as `outcome='failed'`. Only the whitelist line (`const notified = outcome === 'ok' ? 'ok' : 'failed';`) already accepts it.

### `src/pages/backup.js` (MOD)

**Analog:** itself. Two touch points:

1. **`RUN_STATUS_KEYS`** (120-127) — add `upload_failed: 'page.backup.statusUploadFailed'`; the badge render at 137 keys off this map (unknown → `statusUnknown`, so a missed key renders honestly, never crashes):
```js
const RUN_STATUS_KEYS = {
  running: 'page.backup.statusRunning',
  succeeded: 'page.backup.statusSucceeded',
  failed: 'page.backup.statusFailed',
  ...
};
```
2. **`runProgress()`** (83-98) — render-only doctrine: stage badge is `esc(run.stage)` verbatim from the server payload (line 97); add the `uploading` stage's parts progress (partsDone/partsTotal from D-19 payload) as display-only detail. NEVER derive stage client-side (header comment lines 15-30 states the doctrine).

### `src/locales/*.json` ×5 (MOD)

**Analog:** existing `err.backup*` keys (`err.backupManageRequired`, `err.backupRunInProgress` in en.json) and the locale-catalogue test discipline. New keys ×5 locales: `page.backup.statusUploadFailed`, uploading stage label, parts progress label, probe toasts, `err.s3ClockSkew` (D-88-17). All 5 files must carry every key — `test/backup-tasks-api.test.mjs` (30-31) shows the LOCALES catalogue scan pattern that enforces parity.

### `docs/DEPLOY.md` §19 (MOD)

**Analog:** §16 VAPID env-var documentation pattern (CONTEXT canonical_refs) and §9 "Backups" (line 717). Add the `S3_*` env-pair subsection + D-88-7 lifecycle-rule guidance (incl. `AbortIncompleteMultipartUpload`, RESEARCH.md multipart mechanics) + D-88-14 http caveat.

### `test/backup-s3-*.test.mjs` ×3 (NEW)

**Analog 1 — env-gated e2e** (`test/pg-matrix.test.mjs:30-37`):
```js
/* D-08 gate idiom — the whole matrix is opt-in. */
const url = process.env.POSTGRES_TEST_URL;
const maybe = url ? test : test.skip;
```
→ `const minioUrl = process.env.MINIO_TEST_URL; const maybeMinio = minioUrl ? test : test.skip;` for `backup-s3-e2e.test.mjs` (skip-when-absent, D-88-18).

**Analog 2 — server-harness API test** (`test/backup-tasks-api.test.mjs:1-31`): `startServer`-per-case via `./helpers/server.mjs`, `withDb` for direct row inspection, locale-catalogue parity scan. Extend for BKBCK-05e (env unset → toggle hidden + keyed refusal) — this file EXISTS and is extended, not replaced.

**Analog 3 — golden vectors**: `backup-s3-sigv4.test.mjs` is offline always-on (plain `test`, no gate) — Wave 0 BEFORE signing code ships (RESEARCH.md Validation Architecture). `node --test test/backup-s3-sigv4.test.mjs`.

## Shared Patterns

### Keyed refusal + audit funnel
**Source:** `server.js:8260-8308` (backup task POST)
**Apply to:** `s3Enabled` gate, probe route
```js
await auditBackupTask(user, 'backup_task_refused:<key>');
return fail(res, 400, '<key>', 'message');
```
One key per field kind; every refusal audited; refusal literals live at the route (server.js:7963 precedent).

### Boot-frozen env custody (secrets never in DB)
**Source:** `server.js:151-181, 219-233, 312`
**Apply to:** all `S3_*` consts; `/api/config` exposes booleans only; run rows carry error text, never credentials (`String(error?.message).slice(0, 300)` discipline).

### Streamed, memory-bounded I/O
**Source:** `export/backup.js:287-307` (stream-hash), 279-284 (chunked read), 64 MiB slice reads for parts
**Apply to:** `export/s3.js` uploads (per-part slice + hash), verify-after-upload GET, and the Phase 89 download seam. Never `readFile` a whole archive; hash on the pipe.

### Render-only client doctrine
**Source:** `src/pages/backup.js:15-30, 79-98`
**Apply to:** `uploading` stage + parts progress — labels and progress verbatim from the D-19 payload; no client-side stage derivation.

### Skip-when-env-absent test gate
**Source:** `test/pg-matrix.test.mjs:30-32`
**Apply to:** `test/backup-s3-e2e.test.mjs` (`MINIO_TEST_URL`); golden-vector tests stay ungated.

### Writer-seam emission discipline
**Source:** `export/backup.js:593-602` + `server.js:3326-3358`
**Apply to:** upload lifecycle events — emitted through `emitRunEvent`, writer errors swallowed, upload state transitions (`uploading` → `succeeded`/`upload_failed`) recorded via the same seam that drives history rows and the D-15/D-17 email gate.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `export/s3.js` — SigV4 signer core | service | request-response (signed HTTP) | No S3/HMAC-chain client exists in the codebase. Use RESEARCH.md §"SigV4 implementation pattern" (lines 118-145, AWS-docs-cited) + golden vectors as the spec; adopt backup.js's module conventions around it. |
| `test/backup-s3-upload.test.mjs` local HTTP sink | test | mock transport | No HTTP-sink mock exists; RESEARCH.md BKBCK-05c defines it. |

## Metadata

**Analog search scope:** `export/`, `server.js`, `src/pages/backup.js`, `src/locales/`, `test/`, `docs/DEPLOY.md`
**Files scanned:** ~15 (3 full reads: backup.js, src/pages/backup.js, pg-matrix excerpt; 5 targeted server.js ranges)
**All analogs git-tracked:** verified via `git ls-files` (export/backup.js, server.js, src/pages/backup.js, test/*)
**Pattern extraction date:** 2026-11-22
