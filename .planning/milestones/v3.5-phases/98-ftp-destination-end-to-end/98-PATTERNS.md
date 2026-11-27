# Phase 98: FTP Destination End-to-End - Pattern Map

**Mapped:** 2026-11-25
**Files analyzed:** 12 (2 new tests, 10 modified/mirrored sites)
**Analogs found:** 12 / 12 (every target is a self-extension or mirror of an in-repo analog)
**Tracked-source gate:** all analog paths verified `git ls-files` (tracked-ok)

## File Classification

| Target | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `export/backup.js` upload loop (:852-900) | service | batch/transform (per-destination upload) | ITSELF — generalized in place; s3 arm byte-preserved | exact (self) |
| `server.js` ftp install closure (fills dormant slot :3897-3901) | provider (registry descriptor) | event/CRUD | `server.js:3871-3888` S3 closure | exact, with R-2 inversion |
| `server.js` `POST /api/backup/tasks/ftp-probe` | route | request-response | `server.js:9353-9370` `/api/backup/s3/probe` | exact |
| `server.js` probe-at-save CREATE twin | route (validation) | request-response | `server.js:9133-9146` + INSERT `:9166`/`:9172` | exact |
| `server.js` probe-at-save EDIT twin | route (validation) | request-response | `server.js:9289-9300` + UPDATE `:9328`/`:9332` | exact |
| `server.js` `backupTaskShape` (`:9015`) — **no edit needed** | utility | transform | ITSELF — `{ ...row }` spread carries `ftp_enabled` automatically | exact (self) |
| `src/pages/backup.js` ftp toggle row | component | request-response | `:522` S3 toggle row | exact |
| `src/actions/actions.js` form defaults / checkbox / hydration / payload | store (form state) | CRUD | `:5103` / `:5155-5157` / `:5219` / `:5263` + probe toast `:5272-5284` | exact |
| `src/core/api.js` state+getter+apply | config/state | request-response | `:34` / `:152-154` / `:219` | exact |
| `export/restore.js` ftp read-back gates ×2 | service | file-I/O | `:2069-2073` (import_new) and `:2300-2308` (DR, failWith-guarded) | exact |
| `src/locales/*.json` ×5 ftp key family | config (i18n) | — | s3 family: `en.json:2172` (`page.backup.s3Toggle`), `:2232` (`err.s3NotConfigured`), toast keys used at `actions.js:5277-5283` | exact |
| `test/backup-ftp-wiring.test.mjs` (NEW) | test (static gate) | — | `test/destination-registry-gate.test.mjs` source-slice idiom (`:17-20` helpers) | exact |
| `test/backup-ftp-e2e.test.mjs` (NEW) | test (opt-in e2e) | file-I/O | `test/backup-s3-e2e.test.mjs` (:1-30 env-gate header + CONFIG) | exact |
| `docs/DEPLOY.md` §21 | docs | — | §20 at `:1723` ("Off-site S3 destination...") | exact |

## Pattern Assignments

### 1. `export/backup.js` upload loop — descriptor dispatch, s3 arm byte-preserved

**Analog:** ITSELF, `export/backup.js:848-907` (read this session).

Current loop is descriptor-iterated but S3-hardcoded inside. The 98 edit wraps
the body in a per-destination dispatch. The s3 arm MUST remain textually
recognizable (destination-registry-gate.test.mjs pins these lines):

```js
// :848-851 — loop + dormant-slot contract (UNCHANGED)
for (const [destName, dest] of destinations) {
  if (!dest?.enabled || typeof dest.upload !== 'function') continue; // dormant-slot contract (D-05)
  const provided = await dest.upload(runMeta); // returns { config } to upload, or null to skip
  if (!provided?.config) continue;
// :860 s3 key derivation (STAYS byte-identical in the s3 arm)
const key = s3BackupKey(runMeta, filename);
// :862-865 s3 upload + progress emit (UNCHANGED)
await uploadArchive(provided.config, destination, key, sha256, (...)=>{...}, { isCancelled: ... });
// :869-874 s3 read-back verify + sidecar (UNCHANGED in s3 arm; ftp arm uses SIZE+sidecar per R-4)
const back = await downloadToStaged(provided.config, key, sha256, dirs.tmpDir);
...
if (sideText.split(/\s+/)[0] !== sha256) { throw new Error(`s3 upload: sidecar sha256 mismatch for ${key}`); }
// :885 single-flag-write posture — ftp arm MIRRORS this in its own success block
await dbRun('update backup_runs set uploaded = 1 where id = ?', [runId]);
// :886-889 catch (UNCHANGED — no rmStaging; local archive is published)
} catch (err) { failedUploads.push({ name: destName, err }); break; }
// :893-899 error slice + composition hook (NO EDIT — ftp single failure is single-dest raw slice)
const msg = s3SliceError(err); // V14/T-88-10
const errorText = failedUploads.length >= 2 ? `upload failed: ${...}` : msg;
```

**Divergence for the ftp arm (R-4):** verify = client SIZE check + sidecar
sha256 STOR (`${key}.sha256`) — do NOT reuse `downloadToStaged` (Pitfall 2).
Flag write: `update backup_runs set ftp_uploaded = 1 where id = ?` at exactly
ONE site, inside the ftp success block, never in a catch path. Key for task
runs: per-task prefix (D-88-6 mirror, e.g. `backup-task-${meta.taskId}/` +
filename) — `manualPrefix: 'backup-ftp/'` is consumed ONLY by the probe marker.

### 2. `server.js` ftp install closure — R-2 inversion

**Analog:** `server.js:3871-3888` (verbatim above in context). The ftp closure
inverts the manual leg:

```js
// S3 :3875-3887 — task runs gated on s3_enabled; MANUAL runs upload when enabled
upload: async meta => {
  if (!S3.enabled) return null;
  if (meta?.taskId) {
    try {
      const task = await db.get('select s3_enabled from backup_tasks where id = ?', [meta.taskId]);
      if (!task || task.s3_enabled !== 1) return null;
    } catch (err) {
      logWarn(`backup s3: task ${meta.taskId} lookup failed — upload skipped: ${err?.message || err}`);
      return null;
    }
  }
  return { config: S3.config() };
},
```

FTP twin (replaces the dormant slot at `:3897-3901`, keeping
`manualPrefix: 'backup-ftp/'` and position between s3/smb): `if (!meta?.taskId)
return null;` (**R-2 inversion — manual runs NEVER upload**), task leg gates
`select ftp_enabled from backup_tasks` (column exists, DDL `server.js:1059-1062`),
fail-closed warn message mirrors `:3882` wording. Descriptor also gains the
`verify` field wiring the 97 client's SIZE verify (96-01 declared it dormant).

### 3. `server.js` probe route — guard-chain clone

**Analog:** `server.js:9353-9370` — clone with ftp substitutions; guard-chain
ORDER stays verbatim (sameOrigin → requireUser → throttle → CAP → enabled):

```js
if (pathname === '/api/backup/s3/probe' && method === 'POST') {
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', ...);
  const user = await requireUser(req, res); if (!user) return;
  if (tooMany(`backupprobe|${user.id}`, 10, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', ...);
  if (!(await hasInstanceRole(user.id, CAP.BACKUP_MANAGE))) {
    await auditBackupTask(user, 'backup_probe_refused:backupManageRequired'); // shared key
    return fail(res, 403, 'backupManageRequired', ...);
  }
  if (!S3.enabled) { await auditBackupTask(user, 'backup_probe_refused:s3NotConfigured'); return fail(res, 400, 's3NotConfigured', ...); }
  const result = await probeS3(S3.config());
  await auditBackupTask(user, result.ok ? 'backup_s3_probe_ok' : 'backup_s3_probe_failed', user.id, result.key);
  return json(res, 200, result);
}
```

Route path per D-02: **`POST /api/backup/tasks/ftp-probe`** (CONTEXT D-02)
with the 96 descriptor's `manualPrefix: 'backup-ftp/'` as the marker prefix —
STOR + DELE marker via `probeFtp(FTP.config())` (ftp.js:590-594; keyed shape
`{ ok, key, warning?, httpWarning }` with `httpWarning = secure==='none' ||
insecure`, ftp.js:591 — R-3 parity, zero client work). Keyed refusal
`ftpNotConfigured` 400, audited `backup_probe_refused:ftpNotConfigured`.
**Divergence (Pitfall 7):** NO `deleteFailed` accept-with-warning analog —
DELE failure = `ok:false` hard refuse; document in a route comment + DEPLOY §21.

### 4. Probe-at-save twins (create + edit — BOTH required, Pitfall 6)

**Analog CREATE:** `server.js:9139-9146` (block) + `:9166` (`s3_enabled: body?.s3Enabled === true ? 1 : 0` in INSERT object) + `:9172-9173` (SQL columns) + `:9179-9181` (probe audit) + `:9185` (response rides probe):

```js
let s3Probe = null;
if (body?.s3Enabled === true && S3.enabled) {
  s3Probe = await probeS3(S3.config());
  if (!s3Probe.ok && s3Probe.key !== 'deleteFailed') {
    await auditBackupTask(user, `backup_task_refused:s3Probe:${s3Probe.key}`);
    return fail(res, 400, s3Probe.key, 'S3 destination probe failed — the task was not saved');
  }
}
```

FTP twin: `body?.ftpEnabled === true && FTP.enabled` → `probeFtp` → refusal
`backup_task_refused:ftpProbe:${key}` → keyed 400 "task was not saved" (NO
deleteFailed exemption). Add `ftp_enabled` to the INSERT task object/SQL beside
each `s3_enabled` occurrence; response payload adds `ftpProbe` beside `s3Probe`.

**Analog EDIT:** `server.js:9289-9300` (same block, keyed audit with `, id`),
`:9328` (`s3_enabled: s3Enabled ? 1 : 0` in `updated`), `:9331-9334` (UPDATE
SQL — add `ftp_enabled = ?` + binding), `:9337-9341` (audit + response).
Preceding type-gate twin at `:9125-9132` (`invalidS3Enabled` / `s3NotConfigured`
refusals) — add `invalidFtpEnabled` / `ftpNotConfigured` twins.

**`backupTaskShape` (`:9015`):** spreads `{ ...row }` — `ftp_enabled` rides
automatically; NO edit, only a comment noting the new column rides the spread.

### 5. `src/pages/backup.js:522` — toggle row mirror

```js
${api.s3Enabled ? `<div class="row" ...><label ...><input type="checkbox" data-in="backupTaskS3"${form.s3Enabled ? ' checked' : ''}><span>${esc(t('page.backup.s3Toggle'))}</span></label></div>` : ''}
```

FTP twin rendered immediately AFTER the S3 row (D-01 same-section position):
`api.ftpEnabled` render gate, `data-in="backupTaskFtp"`, key
`page.backup.ftpToggle`. No destinations-section refactor (D-01; SMB clones in 100).

### 6. `src/actions/actions.js` — four mirror sites + toast mapping

| Site | s3 analog (verbatim in context) | ftp twin |
|---|---|---|
| form default | `:5103` `s3Enabled: false,` | `ftpEnabled: false,` |
| checkbox IN handler | `:5155-5157` `IN.backupTaskS3 = el => { if (S.ui.backupTaskForm) S.ui.backupTaskForm.s3Enabled = el.checked; };` | `IN.backupTaskFtp` (no re-render — staged, same posture) |
| edit hydration | `:5219` `s3Enabled: task.s3_enabled === 1,` | `ftpEnabled: task.ftp_enabled === 1,` |
| payload builder | `:5263` `if (api.s3Enabled) body.s3Enabled = form.s3Enabled === true;` | `if (api.ftpEnabled) body.ftpEnabled = form.ftpEnabled === true;` |

**Probe toast mapping** (analog `:5272-5284`): the response key carries
`s3Probe`; add an `ftpProbe` twin block beside it — `success` toast +
per-key error toasts for the 97 refusal keys (`ftpAuthFailed`, `ftpTlsFailed`,
`ftpPassiveFailed`, `ftpPathNotFound`, `ftpQuotaExceeded`) + `httpWarning`
toast (`toast.s3ProbeHttpWarning` precedent, `:5283`). No deleteFailed branch.

### 7. `src/core/api.js` — three mirror sites

- `:34` `s3Enabled: false,` (state default, fail-closed) → `ftpEnabled: false,` (96-02 already exposes the server field; the client default may already exist from 96 — verify before adding)
- `:152-154` `get s3Enabled() { return state.s3Enabled; },` → `get ftpEnabled()`
- `:219` `state.s3Enabled = !!r.data?.s3Enabled;` → `state.ftpEnabled = !!r.data?.ftpEnabled;` (strict boolean gate, V5 idiom)

### 8. `export/restore.js` — two read-back gate twins (D-05: use client `fetchToStaged` as-is)

**Analog A (import_new, unguarded seam):** `:2069-2073`:
```js
if (!archivePath && backupRun.uploaded === 1 && opts.s3Config && typeof opts.s3Config === 'object') {
  const back = await downloadToStaged(opts.s3Config, s3BackupKey({ taskId: backupRun.taskId }, backupRun.filename), backupRun.sha256, restoreStagingDir());
  archivePath = back.tmpPath; stagedTmp = back.tmpPath;
}
```
**Analog B (DR path, failWith-guarded + dropStagedTmp):** `:2300-2308` — try/catch
with `dropStagedTmp()` then `return failWith(keyed('restoreArchiveMissing', ...))`.

FTP twins beside each: gate on `backupRun.ftp_uploaded === 1 && opts.ftpConfig`,
call the 97 client's `fetchToStaged(opts.ftpConfig, <ftpKey>, backupRun.sha256,
restoreStagingDir())` (single-shot + sha256 — SIZE/verify divergence already
handled at upload time). The ftp key must be DERIVED identically to the upload
arm (task-prefix + filename). Keep the D-89-16 ordering: run lookup BEFORE
read-back (local-first check at `:2067-2068`/`:2298-2299` untouched).

### 9. i18n ×5 (`src/locales/{en,fr,nl,de,es}.json`) — ftp family beside s3 family

S3 anchors: `en.json:2172` `"page.backup.s3Toggle"`, `:2232` `"err.s3NotConfigured"`,
toast keys referenced at actions.js:5277-5283 (`toast.s3ProbeSuccess/DeleteFailed/
BadCreds/Unreachable/HttpWarning`). Add the ftp twins SAME COMMIT ×5:
`page.backup.ftpToggle`, `err.ftpNotConfigured` (+ the shared `backupManageRequired`
already keyed), probe toasts for `ftpAuthFailed / ftpTlsFailed / ftpPassiveFailed /
ftpPathNotFound / ftpQuotaExceeded / ftpUnreachable?` (match the exact keys
probeFtp emits, ftp.js:585) + `insecureTlsWarning` (R-3). Dead-key gate: `npm run build`.
Existing `page.restore.locFtp` (en.json:2266) already exists — no change.

### 10. `test/backup-ftp-wiring.test.mjs` (NEW) — source-slice idiom

**Analog:** `test/destination-registry-gate.test.mjs:17-20`:
```js
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const serverSrc = () => src('server.js');
```
Slice-assert (regex/indexOf): R-2 inversion (`!meta?.taskId` → null in the ftp
closure), `select ftp_enabled from backup_tasks`, single
`set ftp_uploaded = 1` site in export/backup.js, probe-route guard-chain order,
audit tokens (`backup_ftp_probe_ok|failed`, `backup_probe_refused:ftpNotConfigured`,
`backup_task_refused:ftpProbe:`), both probe-at-save twins present (create AND
edit — Pitfall 6), client mirrors (backupTaskFtp / actions sites / api.js sites),
i18n keys present ×5. Also KEEP passing: existing registry-gate pins — the s3
arm in the loop must stay recognizable (`s3SliceError(err)` line, single
`uploaded = 1`, composed-prefix-only-in-≥2 branch).

### 11. `test/backup-ftp-e2e.test.mjs` (NEW) — MinIO recipe clone

**Analog:** `test/backup-s3-e2e.test.mjs:1-30` — header documents the docker
run recipe (:11-15), env gate + skip helper:
```js
const minioUrl = process.env.MINIO_TEST_URL;
const maybeMinio = minioUrl ? test : test.skip;
```
FTP twin: `VSFTPD_TEST_URL` gate (`host:port`), vsftpd container with
pasv_min_port/pasv_address config documented in the header, credentials mapped
to the FTP_* env set the server boot-freezes. Exercise backup→FTP→restore full
loop; skip-when-absent is the standard node --test skip (also assert the skip
path per D-03/CONTEXT "skip-when-absent gate test").

### 12. `docs/DEPLOY.md` §21 — S3 §20 template

**Analog:** `docs/DEPLOY.md:1723` `## 20. Off-site S3 destination for backup tasks (Phase 88)` — structure: intro → env table (secret-adjacent/secret annotations) → setup → probe/behavior. FTP §21 mirrors: FTP_HOST/FTP_USER/FTP_PASSWORD/(FTP_SECURE/FTP_INSECURE) table, vsftpd recipe, keyed warning posture (R-3), **documented deviations** (R-4 SIZE+sidecar instead of read-back; no deleteFailed warning — DELE marker failure is a hard refuse), same commit as the e2e recipe (D-03).

## Shared Patterns

### Audit funnel
**Source:** `server.js:9367` (route) / `:9179-9181` + `:9337-9339` (probe-at-save)
**Apply to:** all new ftp mutations. `await auditBackupTask(user, token, id?, key?)`. Tokens: `backup_ftp_probe_ok`, `backup_ftp_probe_failed`, `backup_probe_refused:ftpNotConfigured`, `backup_probe_refused:backupManageRequired` (shared key exists), `backup_task_refused:ftpProbe:<key>`. Upload success/failure ride the EXISTING run-event + notify funnel — `handleBackupTaskOutcome` untouched (SC-4). Audit detail carries only `result.key` (Pitfall 5: no config logging).

### Keyed refusal discipline
**Source:** all backup routes (e.g. `server.js:9125-9132`)
**Apply to:** every new 4xx — keyed `fail(res, status, code, msg)` + audit twin.

### Single-flag-write posture
**Source:** `export/backup.js:885` comment block (:876-885)
**Apply to:** the ftp arm — `ftp_uploaded = 1` at ONE site, success-block only, never catch.

### Guard-chain order (frozen)
**Source:** `server.js:9344-9353` comment + route body
**Apply to:** ftp probe route — never reorder (sameOrigin before body read AND throttle).

## No Analog Found

| File | Reason |
|---|---|
| (none) | Every target maps to an in-repo analog; the vsftpd docker recipe itself is new but clones the MinIO header recipe shape. |

## Metadata

**Analog search scope:** export/, server.js, src/pages/, src/actions/, src/core/, src/locales/, test/, docs/
**Files read this session:** backup.js(:845-914), server.js(:3865-3929, :9008-9032, :9125-9194, :9285-9384), restore.js(:2060-2104, :2290-2334), backup.js page(:505-549), actions.js(:5090-5179, :5200-5301), api.js(:28-42, :145-156, :212-225), destination-registry-gate.test.mjs(:1-60), backup-s3-e2e.test.mjs(:1-55), DEPLOY.md §20(:1715-1760)
**Pattern extraction date:** 2026-11-25
