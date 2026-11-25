# Phase 100: SMB Destination End-to-End + Remote Prune - Pattern Map

**Mapped:** 2026-11-25
**Files analyzed:** 16 (12 modified + 4 new)
**Analogs found:** 15 / 16 (prune hook is NEW logic — D-01/D-03/D-05 define it, no analog)
**Tracked-source gate:** every analog below verified `git ls-files` non-empty this session.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` smb closure (replaces :3964-3968) | config/registration | request-response | ftp closure :3946-3963 | exact |
| `server.js` `SMB.config()` (new, near :237-274) | config | — | `FTP.config()` | exact |
| `server.js` smb-probe route (new) | route | request-response | ftp-probe :9514-9531 | exact |
| `server.js` probe-at-save CREATE twin (new) | controller | request-response | :9226-9232 (+ ride :9277) | exact |
| `server.js` probe-at-save EDIT twin (new) | controller | request-response | :9414-9420 (+ ride :9466-9468) | exact |
| `server.js` rotation prune hook (new) | service | event-driven (rotation pass) | **none** — NEW logic (D-01/D-03/D-05) | no analog |
| `server.js` `remote_pruned` ensureColumn + SELECTs + payload | model/DDL | CRUD | :1097-1100 columns, :9734/:9803/:9825 SELECTs, :9767/:9795 strips | exact |
| `export/backup.js` smb upload arm (new) | service | file-I/O | ftp arm :870-906 | exact (one divergence: no SIZE) |
| `export/smb.js` probeSmb / staged fetch / guest detection (new) | client utility | request-response | ftp.js probeFtp :584-613, fetchToStaged | role-match (SMB protocol differs) |
| `export/restore.js` smb read-back twins (new ×2) | service | file-I/O | :2080-2084 (import_new), :2326-2331 (DR) | exact |
| `src/pages/backup.js` smb toggle + pruned badge | component | render | toggle :523, statusCell :209-217, Rotated scoping :261-269 | exact |
| `src/actions/actions.js` ×5 sites | actions/state | event-driven | :5105-5106, :5163-5165, :5230, :5279, :5304-5314 | exact |
| `src/core/api.js` trio | store/state | request-response | :38, :159-161, :229 | exact |
| `src/locales/{en,fr,de,es,pt?}` ×5 | config (i18n) | — | en.json:2173/2239-2245/2252-2253/2277 ftp family | exact |
| `test/backup-smb-wiring.test.mjs` (NEW) | test | static+functional | test/backup-ftp-wiring.test.mjs | exact |
| `test/backup-smb-e2e.test.mjs` (NEW) | test | file-I/O (real server) | test/backup-ftp-e2e.test.mjs | exact (divergence: 2 containers, D-02) |
| `docs/DEPLOY.md` §22 | docs | — | §21 :1803 | role-match (split per OQ-1) |

**Wave/parallel caution (98 blocker precedent):** server.js, export/backup.js, export/restore.js, export/smb.js are each touched by MULTIPLE jobs (wiring + prune + payload + restore twins). Same-wave plans must never share a file — split by file ownership, not by feature, and let the dedicated test files (`backup-smb-wiring`, `backup-smb-restore-gates`, `backup-prune`) absorb slices, exactly as 98 did with restore slices.

## Pattern Assignments

### 1. SMB install closure — `server.js` replaces dormant slot :3964-3968

**Analog:** ftp closure, `server.js:3946-3963` (verbatim):

```javascript
setBackupDestination('ftp', {
  label: 'FTP',
  enabled: FTP.enabled,
  manualPrefix: 'backup-ftp/', // probe marker prefix only (D-01) — R-2: manual runs never upload
  upload: async meta => {
    if (!FTP.enabled) return null;
    if (!meta?.taskId) return null; // R-2: manual Run-now runs stay local-only — NEVER uploaded to FTP
    try {
      const task = await db.get('select ftp_enabled from backup_tasks where id = ?', [meta.taskId]);
      if (!task || task.ftp_enabled !== 1) return null;
    } catch (err) {
      logWarn(`backup ftp: task ${meta.taskId} lookup failed — upload skipped: ${err?.message || err}`);
      return null;
    }
    return { config: FTP.config() };
  },
  verify: FTP.verify,
});
```

**The slot being replaced** (:3964-3968): `setBackupDestination('smb', { label: 'SMB', enabled: !!(SMB_HOST && ...), manualPrefix: 'backup-smb/' })` — no `upload`/`verify`. The new closure is a **line-by-line clone of the ftp one** with: `select smb_enabled`, `config: SMB.config()`. **Divergences:**
- **R-2 inversion is mandatory** (98's key lesson): the dormant slot lacks the `!meta?.taskId → null` guard; the clone must add it first, before the lookup.
- `verify: SMB.verify` does NOT exist (no SIZE in the 99 client) — omit the `verify` field or wire a sha256-sidecar-based verify per the RESEARCH R-4 deviation; decide at plan time. Do NOT clone `verify: FTP.verify` blindly.
- Keep the `manualPrefix: 'backup-smb/'` comment updated (probe-marker-only, R-2).

### 2. SMB.config() — near `server.js:237-274` (env consts region)

**Analog:** `FTP.config()` — same file, FTP block (~:215-274 region). New `SMB.config()` maps boot-frozen consts to the 99 client shape `{ host, share, port: 445, user, domain?, password }` (shape per smb.js:865-866/:882/:986). `SMB.enabled` already exists as `!!(SMB_HOST && SMB_SHARE && SMB_USER && SMB_PASSWORD)` with the all-four-required warning (:273-274); `smbEnabled` already exposed in config payload at :6418 — client trio is the only gap.

### 3. smb-probe route — clone of ftp-probe, `server.js:9514-9531` (verbatim):

```javascript
if (pathname === '/api/backup/tasks/ftp-probe' && method === 'POST') {
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const user = await requireUser(req, res);
  if (!user) return;
  if (tooMany(`backupprobe|${user.id}`, 10, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', ...);
  if (!(await hasInstanceRole(user.id, CAP.BACKUP_MANAGE))) {
    await auditBackupTask(user, 'backup_probe_refused:backupManageRequired');
    return fail(res, 403, 'backupManageRequired', ...);
  }
  if (!FTP.enabled) {
    await auditBackupTask(user, 'backup_probe_refused:ftpNotConfigured');
    return fail(res, 400, 'ftpNotConfigured', ...);
  }
  const result = await probeFtp(FTP.config());
  await auditBackupTask(user, result.ok ? 'backup_ftp_probe_ok' : 'backup_ftp_probe_failed', user.id, result.key);
  return json(res, 200, result);
}
```

**Clone:** path `/api/backup/tasks/smb-probe`, SAME guard chain order verbatim (never reorder), refusal keyed `smbNotConfigured`, audits `backup_smb_probe_ok`/`failed`, **detail = `result.key` only** (Pitfall 5: never config, never error text). **Divergence:** NO `httpWarning` in the log line (R-3: SMB has no TLS variant); if probeSmb returns `guest: true`, it rides the result verbatim (server passes through — D-23 doctrine).

### 4. Probe-at-save twins

**CREATE analog** `server.js:9226-9232` (verbatim):

```javascript
let ftpProbe = null;
if (body?.ftpEnabled === true && FTP.enabled) {
  ftpProbe = await probeFtp(FTP.config());
  if (!ftpProbe.ok) {
    await auditBackupTask(user, `backup_task_refused:ftpProbe:${ftpProbe.key}`);
    return fail(res, 400, ftpProbe.key, 'FTP destination probe failed — the task was not saved');
  }
}
```
Rides response at :9277-9278 (`...(ftpProbe ? { ftpProbe } : {})`); audit symmetry :9270-9272; `smb_enabled` goes into the task object ~:9254 and INSERT ~:9260-9261.

**EDIT analog** `server.js:9414-9420`: same block but gates on the resolved `ftpEnabled` variable (not `body?.ftpEnabled` — edit computes the resulting row state first; see the read/keep logic ~:9386-9390), audit carries `, id` and `smb_enabled` lands in the updated object ~:9450, UPDATE ~:9454-9455, response ride ~:9466-9468. **Clone both beside their twins; hard refuse on !ok, no deleteFailed exemption (Pitfall 7 posture).**

### 5. SMB upload arm — `export/backup.js`, clone of ftp arm :870-906

**Analog core** (:870-906, abridged verbatim):

```javascript
if (destName === 'ftp') {
  const ftpKey = `backup-task-${runMeta.taskId}/${filename}`;
  const ftp = connectFtp(provided.config);
  try {
    await ftp.connect();
    await ftp.stor(ftpKey, destination);
    const storedSize = await ftp.size(ftpKey);
    if (storedSize !== size) { throw new Error(`ftp upload: SIZE verify mismatch for ${ftpKey} ...`); }
    await ftp.stor(`${ftpKey}.sha256`, Buffer.from(`${sha256}  ${filename}\n`));
  } finally {
    await ftp.quit().catch(() => { /* best-effort */ });
  }
  /* one-site rule comment */
  await dbRun('update backup_runs set ftp_uploaded = 1 where id = ?', [runId]);
} else {
  /* s3 arm — byte-preserved, ends :931 update backup_runs set uploaded = 1 */
}
```

**SMB arm:** `else if (destName === 'smb')` beside the ftp arm: `const smbKey = \`backup-task-${runMeta.taskId}/${filename}\`` (SAME key shape — Pitfall 6), `connectSmb(provided.config)` → `write(smbKey, destination)` → `write(\`${smbKey}.sha256\`, Buffer.from(\`${sha256}  ${filename}\n\`))` (sidecar byte-for-byte mirrors :894) → finally `smb.close().catch(() => {})` → **ONE site**: `update backup_runs set smb_uploaded = 1 where id = ?` success-block-only (verify with `grep -c`, Pitfall 7). **Divergences:** no `ftp.size` — R-4 for SMB = marker write + sidecar + restore read-back (documented deviation, same comment posture as :883-887); keep the s3 else-arm byte-preserved (:861, :907-932 — destination-registry-gate pins it). Both arms land in the SHARED catch (:933-934 `failedUploads.push`).

### 6. Rotation prune hook — NEW logic, `server.js` after :4320

**No analog exists.** The rotation pass `runBackupRotationPass` :4227-4329 is the host. Verified anchor points (verbatim read this session):
- Delete-set SELECT :4281-4284 — carries only `id, filename`; **widen additively** to include `uploaded, ftp_uploaded, smb_uploaded` (rotation math consumes id/filename/bucket only → pin-neutral per RESEARCH A4; run test/backup-rotation.test.mjs before/after, Pitfall 8). Do NOT touch `report` shape (:4232/:4321-4322).
- Local unlink loop :4296-4307 (best-effort try/catch per file — the containment idiom to mirror).
- Status commit :4309-4312 `update backup_runs set status = 'deleted' ...` (autocommit — "after the local status commit" = literally after this await; do NOT add a transaction wrapper).
- Rotation audit :4317-4320.
- **→ Hook goes immediately after :4320, before :4321** (`report.deleted += ...`).

**Shape (D-01/D-03/D-05 + RESEARCH example):**

```javascript
for (const row of deleteSet) {
  const soleCopy = row.uploaded !== 1 && S3.enabled;          // D-01 floor-guard, fresh row
  const pruneTargets = [
    ['ftp', `backup-task-${taskId}/${row.filename}`, row.ftp_uploaded === 1, pruneFtp],
    ['smb', `backup-task-${taskId}/${row.filename}`, row.smb_uploaded === 1, pruneSmb],
  ];
  for (const [dest, key, hasCopy, dele] of pruneTargets) {
    if (!hasCopy) continue;                                    // silent no-op, no audit
    if (soleCopy) { await ...audit `backup_prune_skipped:soleCopy:${dest}`... ; continue; }
    try {                                                       // per-destination containment (D-05)
      await dele(key);                                          // not-found → already-pruned success (Pitfall 1)
      await db.run('update backup_runs set remote_pruned = 1 where id = ?', [row.id]);
      await ...audit `backup_prune_ok:${dest}` (key-only detail)...
    } catch (err) {
      await ...audit `backup_prune_failed:${dest}`, detail = err.key || err.code only...
    }
  }
}
```

**Rules baked in:** keys mirror the UPLOAD arm exactly (`backup-task-${taskId}/${filename}`, backup.js:875 — manualPrefixes NEVER used, Pitfall 6); `S3.enabled` is the boot-frozen const; per-destination try/catch is the primary containment, the per-task catch (:4324-4326) is only the outer net (Pitfall 3); audit detail = key/code only (Pitfall 5); D-03 token spellings `backup_prune_ok:<dest>` / `backup_prune_failed:<dest>` / `backup_prune_skipped:soleCopy` (dest suffix on skipped is discretion, OQ-2). Prune helper wrappers (`pruneFtp` = connect→dele with ftpPathNotFound→success mapping; `pruneSmb` = connect→rm with new `pathNotFound` 0xc0000034 class→success) live beside their clients or locally — plan decision.

### 7. `remote_pruned` column + payload

**ensureColumn analog** `server.js:1097-1100` (verbatim):

```javascript
await adapterEnsureColumn('backup_tasks', 'ftp_enabled', 'integer not null default 0');
await adapterEnsureColumn('backup_tasks', 'smb_enabled', 'integer not null default 0');
await adapterEnsureColumn('backup_runs', 'ftp_uploaded', 'integer not null default 0');
await adapterEnsureColumn('backup_runs', 'smb_uploaded', 'integer not null default 0');
```
Clone: `await adapterEnsureColumn('backup_runs', 'remote_pruned', 'integer not null default 0');` placed after :1100, + schema-comment mirror in the backup_runs CREATE block (:866-912 region, ftp_uploaded pattern :886-888).

**Payload:** add `remote_pruned` to three SELECTs — :9734 (all=1, verbatim column list), :9803 (manual), :9825 (task). **Leave both strip lists UNTOUCHED** (:9767 `const { scope: _internal, ftp_uploaded: _ftp, smb_uploaded: _smb, ...pub } = r; void ...;` and :9795) — `remote_pruned` flows through `...pub` automatically; existing keys stay byte-identical (98-02 precedent). membershipsOf region :9741-9757 untouched. `destLocation` :3979-3985 untouched (already has the smb arm; remote_pruned is NOT a location).

### 8. smb.js client additions — `export/smb.js`

**probeSmb analog:** `probeFtp`, `export/ftp.js:584-613` (verbatim core):

```javascript
function mapFtpProbeError(e, base) {
  const keyed = ['ftpAuthFailed', 'ftpTlsFailed', 'ftpPassiveFailed', 'ftpPathNotFound', 'ftpQuotaExceeded'];
  if (keyed.includes(e?.code)) return { ...base, key: e.code };
  return { ...base, key: 'unreachable', error: sliceError(e) };
}
export async function probeFtp(config, opts = {}) {
  const base = { ok: false, key: null, warning: false, httpWarning };
  const ftp = connectFtp(config, opts);
  try { await ftp.connect(); } catch (e) { return mapFtpProbeError(e, base); }
  const marker = `gr8r-probe/probe-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.probe`;
  try { await ftp.stor(marker, Buffer.from('gr8r probe')); } catch (e) { await ftp.quit().catch(() => {}); return mapFtpProbeError(e, base); }
  try { await ftp.dele(marker); } catch (e) { await ftp.quit().catch(() => {}); return { ...base, key: 'deleteFailed', warning: true }; }
  await ftp.quit().catch(() => {});
  return { ...base, ok: true, key: 'success' };
}
```

**probeSmb:** keyed-result contract `{ ok, key, warning, ... }` (no httpWarning — R-3): connect → echo → write+rm marker under `backup-smb/` prefix. Marker rm failure = HARD refuse (`deleteFailed` key, ok:false — parity with ftp :606-611 minus the `warning:true`; ftp's D-88-15 accept-with-warning analog is explicitly NOT granted, server comments :9222-9225/:9508-9511). Map errors through `smbErrorFrom`'s 9-class closed enum (smb.js:386-452) into keyed results; additive `pathNotFound` class for 0xc0000034 (Pitfall 1 — prune idempotency). Surface `smb.guestSession` as `guest: true` on success.

**Guest detection (the only genuine protocol addition):** in the SESSION_SETUP reply path read SessionFlags u16 at response-body offset 2 (MS-SMB2 §2.2.5 — ASSUMED A1, e2e falsifies), store `s.guestSession = (flags & 0x0001) !== 0`, expose via `__debug()` + probeSmb result. Client surface: `connectSmb(config)` → `{ connect, write, read, rm, echo, close, __debug }` (smb.js:1042-1103).

**Staged fetch helper:** analog = ftp.js `fetchToStaged` (single-shot + sha256 → staging file); SMB equivalent wraps `read(path)` (returns bytes, :1044-1053) — read whole file → sha256 compare vs expected → write staging file, refuse keyed on mismatch (T-98-06 discipline).

### 9. Restore read-back twins — `export/restore.js`

**import_new analog** :2080-2084 (verbatim):

```javascript
if (!archivePath && backupRun.ftp_uploaded === 1 && opts.ftpConfig && typeof opts.ftpConfig === 'object' && backupRun.filename) {
  const back = await fetchToStaged(opts.ftpConfig, `backup-task-${backupRun.taskId}/${backupRun.filename}`, backupRun.sha256, restoreStagingDir());
  archivePath = back.tmpPath;
  stagedTmp = back.tmpPath;
}
```
**DR analog** :2326-2331: same gate but wrapped in try/catch routed through `failWith` so the funnel releases the restore_lock (VERBATIM DIFFERENCE — the DR twin is GUARDED, the import_new twin rides the outer flow; keep each twin's containment posture as-is when cloning).

**SMB twin beside each:** `backupRun.smb_uploaded === 1 && opts.smbConfig` → the new staged-fetch helper, same key derivation. **Server plumbing:** `smbConfig: SMB.enabled ? SMB.config() : null` beside `ftpConfig` at :10069 (import_new) and :10153 (DR); add `smb_uploaded` to the two row SELECTs :10008 and :10121 (verbatim: `select id, task_id, scope, status, sha256, filename, uploaded, ftp_uploaded from backup_runs where id = ?`) and forward it in `backupRun` at :10061 and :10151 (`backupRun: { filename: row.filename, sha256: row.sha256, uploaded: row.uploaded, ftp_uploaded: row.ftp_uploaded, taskId: row.task_id }`).

### 10. Client — toggle, badge, actions, api trio

**Toggle analog** `src/pages/backup.js:523` (verbatim):

```javascript
${api.ftpEnabled ? `<div class="row" style="gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px"><label style="display:flex;align-items:center;gap:8px"><input type="checkbox" data-in="backupTaskFtp"${form.ftpEnabled ? ' checked' : ''}><span>${esc(t('page.backup.ftpToggle'))}</span></label></div>` : ''}
```
Clone as `backupTaskSmb` / `form.smbEnabled` / `page.backup.smbToggle` / `api.smbEnabled`, rendered beside :523 (after the S3 :522 and FTP rows).

**Pruned badge analog** `statusCell` :209-217: additive badges hang off the status badge chain (`warn ? ...` pattern at :213). Recommendation (discretion): `run.remote_pruned === 1 && run.status === 'deleted'` → `<span class="badge">${t('page.backup.pruned')}</span>` beside the status badge — deleted rows appear ONLY under the Rotated filter (94-03 scoping, :261-269 `h.runs.filter(r => r.status !== 'deleted')`), so live runs can never show it. Do NOT couple to the location ternary (:214-216 untouched); location resolves via destLocation to surviving flag.

**actions.js ×5 analogs (verbatim sites):**
1. State default :5105-5106 — `ftpEnabled: false` in `backupTaskFormDefaults` (comment posture: render-only, mirrors S3 :5103).
2. Checkbox handler :5163-5165 — `IN.backupTaskFtp = el => { if (S.ui.backupTaskForm) S.ui.backupTaskForm.ftpEnabled = el.checked; };` (no re-render).
3. Edit prefill :5230 — `ftpEnabled: task.ftp_enabled === 1,` inside `A.backupTaskEdit`'s form object.
4. Body gate :5279 — `if (api.ftpEnabled) body.ftpEnabled = form.ftpEnabled === true;` (always serialize displayed state when destination exists).
5. Probe toast chain :5304-5314 — `const fprobe = res.data?.ftpProbe; if (fprobe) { keyed branches: success → toast.ftpProbeSuccess; each error key → tErr(key, null, toast.ftpProbeUnreachable); }` + :5313 httpWarning branch.

**SMB twins:** `smbEnabled` in all five spots; toast chain keys = `toast.smbProbeSuccess`, the `err.smb*` family, fallback `toast.smbProbeUnreachable`; **DIVERGENCES:** NO httpWarning branch (R-3), ADD an info-toast branch on `probe.guest === true` → `smbGuestAccess` keyed info (SC-2 — informational, not an error/warning), plus `smbDialectUnsupported` branch (99-SPIKE §4).

**api.js trio analogs:** :38 `ftpEnabled: false` (state default, fail-closed comment), :159-161 `get ftpEnabled() { return state.ftpEnabled; }`, :229 `state.ftpEnabled = !!r.data?.ftpEnabled;` (V5 strict-boolean idiom). Clone all three as `smbEnabled` — server already sends it (:6418).

### 11. Locales ×5 — `src/locales/{en,...}.json`

**ftp family analog (en.json, same-commit ×5 rule):** :2173 `page.backup.ftpToggle`; :2239-2245 `err.ftpNotConfigured`/`err.invalidFtpEnabled`/`err.ftpAuthFailed`/`err.ftpTlsFailed`/`err.ftpPassiveFailed`/`err.ftpPathNotFound`/`err.ftpQuotaExceeded`; :2252-2253 `toast.ftpProbeSuccess`/`toast.ftpProbeUnreachable`; :2277 `page.restore.locFtp` (already exists as `locSmb` — no new location key). **New keys:** `page.backup.smbToggle`, `err.smb*` family (mirror the ftp set minus TLS/passive/quota, plus `smbDialectUnsupported`, `err.smbNotConfigured`, `err.invalidSmbEnabled`), `toast.smbProbe*` family, `smbGuestAccess` info message, `page.backup.pruned`. All ×5 locales in the SAME commit.

### 12. test/backup-smb-wiring.test.mjs (NEW)

**Analog:** `test/backup-ftp-wiring.test.mjs` — static source-slice pins (destination-registry-gate idiom): `const ROOT = ...; const src = rel => fs.readFileSync(...); const serverSrc = () => src('server.js');` then slice tests, e.g. :27-44 pin the closure R-2 inversion by slicing `s.indexOf("setBackupDestination('ftp'")` → `s.indexOf("setBackupDestination('smb'")` and asserting the guard order. Clone the same idiom for the smb closure (slice between the ftp and the NEXT registry entry), the upload arm one-site flag rule (grep-count the `smb_uploaded = 1` write), probe route guard chain order, save twins, payload byte-identity (existing keys identical + exactly one new key `remote_pruned`), strip lists untouched. Functional pipeline tests: in-process scripted mock SMB server (the 97 fakeFtp harness idiom — the 99 client tests already have a mock; extend test/backup-smb-client.test.mjs for probeSmb keyed results).

### 13. test/backup-smb-e2e.test.mjs (NEW)

**Analog:** `test/backup-ftp-e2e.test.mjs` (121 LOC, read verbatim): header documents the docker recipe + throwaway-credentials rule (T-98-07); gate idiom :37-38 `const vsftpdUrl = process.env.VSFTPD_TEST_URL; const maybeFtp = vsftpdUrl ? test : test.skip;`; CONFIG IIFE :40-52 parses the URL into a client config; tests drive the REAL clients directly (`probeFtp`, `connectFtp`, `fetchToStaged` — never boots the server); include one always-on "env absent → skip" test (:114-117 posture).

**Divergences (D-02):** TWO dperson/samba containers in ONE recipe — default `min protocol = SMB2` happy path (backup→probe→write→rm→restore read-back) gated on `SAMBATEST_URL`, + second `server min protocol = SMB3` container asserting `probeSmb` refuses keyed `smbDialectUnsupported` gated on `SAMBATEST_SMB3_URL`. Guest pin: wrong-password connect against the SMB2 container with `map to guest = bad user` (ASSUMED A2 — verify live). Import `{ connectSmb, probeSmb }` + the new staged-fetch helper from `../export/smb.js`. This file is the mock→real falsification point for SPIKE A1-A4.

### 14. docs/DEPLOY.md §22

**Analog:** §21 "FTP/FTPS destination for backup tasks (Phase 98)" at :1803 (env table, enable steps, posture sections). §22 = "SMB destination + remote prune": samba recipe (the D-02 two-container compose), SMB_* env table (+ SMB_PORT if added), share-perms/ACL pitfalls (prune = DELETE — share must grant delete; `force user`/`create mask`; read-only share fails at probe, no-delete share fails only at prune → `backup_prune_failed:smb` is the operator signal), prune + floor-guard semantics (D-01 plain-language), guest-access note (SC-2). **FTPS passive-range/cert-trust hardening:** split per OQ-1 — recommend a §21 sub-section or §23; confirm at plan time.

## Shared Patterns

### Guard chain order (probe routes)
**Source:** `server.js:9515-9526`. Apply to smb-probe route verbatim: `sameOrigin → requireUser → tooMany → hasInstanceRole(CAP.BACKUP_MANAGE) → destination.enabled → probe` — never reordered.

### Audit detail = keyed code only
**Source:** ftp-probe :9528 (`result.key`), save twins :9230/:9418 (`${ftpProbe.key}`). Apply to ALL new audits (probe ok/failed, task_refused, prune ok/failed/skipped) — never config, never raw error text (Pitfall 5).

### One-site-per-flag, success-block-only
**Source:** `export/backup.js:901-906` (comment + `update backup_runs set ftp_uploaded = 1`). Apply to `smb_uploaded = 1` (upload arm) and `remote_pruned = 1` (prune hook, per-destination success). Verify with `grep -c` per flag.

### Key derivation `backup-task-${taskId}/${filename}`
**Source:** upload :875, restore :2081/:2328. Apply to upload arm, probe markers (under `backup-smb/`), restore read-back, AND prune keys — manualPrefixes (`backup-ftp/`, `backup-smb/`) are probe-marker-only, never upload/restore/prune keys (Pitfall 6).

### Best-effort containment try/catch per unit
**Source:** rotation local-unloop :4296-4307; per-task catch :4324-4326. Apply: per-destination try/catch inside the prune hook; per-file best-effort posture for marker cleanup; shared catch keeps raw-slice failure for uploads (:933-934).

### Payload additivity (byte-identity)
**Source:** strips :9767/:9795 + 98-02 precedent. Apply: additive SELECT columns, zero projection edits, new key rides `...pub`.

### Env-gated e2e skip idiom
**Source:** `test/backup-ftp-e2e.test.mjs:37-38` + always-on skip test. Apply with `SAMBATEST_URL` / `SAMBATEST_SMB3_URL`.

## No Analog Found

| File/Job | Role | Data Flow | Reason |
|----------|------|-----------|--------|
| Rotation prune hook (server.js after :4320) | service | event-driven | First remote-delete semantics in the codebase — D-01/D-03/D-05 + RESEARCH §Rotation are the spec; the ftp upload arm only supplies dispatch shape |
| probeSmb guest detection | client protocol | — | No SessionFlags reader exists; MS-SMB2 knowledge + e2e falsification (A1) |
| Prune idempotency mapping (0xc0000034 → success) | client error class | — | New closed-enum addition; ftp's `ftpPathNotFound` (:186) is the posture reference only |

Planner: use 100-RESEARCH.md §Rotation + Code Examples for these — they are spec-complete.

## Metadata

**Analog search scope:** server.js (7 targeted ranges), export/{backup,ftp,restore}.js, src/{pages/backup.js, actions/actions.js, core/api.js}, src/locales/en.json, test/{backup-ftp-wiring,backup-ftp-e2e}.test.mjs, docs/DEPLOY.md
**Files scanned:** 12 read verbatim this session; all analogs git-tracked (verified)
**Pattern extraction date:** 2026-11-25
