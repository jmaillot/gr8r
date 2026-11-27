# Phase 96: Cross-Destination Seam Generalization - Pattern Map

**Mapped:** 2026-11-25
**Files analyzed:** 11 (7 source, 4 test/new-gate)
**Analogs found:** 11 / 11 — with one caveat: the seam itself (export/backup.js) is a **self-extension** case; its analog is itself because the registry wraps the existing closure body byte-identically (D-01/D-06).

All analog paths verified `git ls-files`-tracked this session (no mirror paths).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `export/backup.js` (registry + upload slot) | service/module | request-response (export pipeline stage) | **itself** — `:635-645` seam + `:837-885` upload slot (self-extension) | self |
| `server.js` (install site :3817-3829) | config/boot wiring | request-response | same install block (self-extension: body verbatim into descriptor) | self |
| `server.js` (env custody FTP_*/SMB_* beside :208-221) | config | boot-frozen const | `server.js:208-221` + `:356-366` (S3 env pair + enabled derivation) | exact |
| `server.js` (/api/config :6256 flat keys) | route payload | request-response | `server.js:6243-6257` (existing s3Enabled sibling) | exact |
| `server.js` (DDL ensureColumns after :977-1002) | migration (boot DDL) | batch | `server.js:966` (`s3_enabled` ensureColumn) + `:1003-1009` (`uploaded` + ordering comment) | exact |
| `server.js` (restore badge ordered-scan :9508/:9533/:9681) | route derivation | transform | the three identical ternaries themselves (self-extension → ordered scan) | self |
| `src/core/api.js` (flat flags :152/:219) | store/getter | request-response | `src/core/api.js:152-154, :219` (s3Enabled getter + init) | exact |
| `src/pages/backup.js` (RESTORE_LOCATION_KEYS :545, render gate :522) | component | render | `src/pages/backup.js:522, :545` (existing gates — additive extension) | self/exact |
| `src/actions/actions.js` (:5103/:5155/:5219/:5263) | actions | form state | the four s3Enabled sites (D-05: **no changes in 96** — pattern for 98/100) | exact |
| `test/backup-export.test.mjs` (setter pins :375-492) | test | request-response | itself — twins updated to `setBackupDestination('s3', …)` | self |
| `test/restore-preview.test.mjs` (:531-560 twins; :422-459 ensureColumn idiom) | test | batch/db | itself + `:422-459` (clone for ftp/smb_uploaded no-op test) | self/exact |
| `test/<new-registry-gate>.test.mjs` (Wave 0, NEW) | test (static slice) | transform | `test/xws-gate.test.mjs:24-52` (verbatim pins) + `test/backup-history-client.test.mjs:248-269` (source-slice regex) | exact |

## Pattern Assignments

### `export/backup.js` — registry (service, pipeline stage)

**Analog: ITSELF** — the seam body is byte-preserved (D-06). The registry wraps, never rewrites.

**Seam today** (`export/backup.js:642-645`):
```js
let s3DestinationProvider = null;
export function setBackupS3Destination(fn) {
  s3DestinationProvider = typeof fn === 'function' ? fn : null;
}
```

**Upload slot** (`:837-885`): provider consult `:837-838` → `uploadFailed` closure (`s3SliceError(err)`, 300-char slice — s3.js:58-60) → `setStage('uploading')` :855 → `s3BackupKey(runMeta, filename)` :856 → `uploadArchive` :858-861 → D-88-8 verify (stream-back + sidecar compare) :865-871 → **single run-truth write** :881 → catch → `uploadFailed(err)` :882-884.

**Run-truth write** (`:881`) — the discipline D-03 extends per destination:
```js
await dbRun('update backup_runs set uploaded = 1 where id = ?', [runId]);
```
Rules: marked ONLY in the verified-success block (:872-880 comment contract); never in a catch path; a mark failure routes into upload_failed. New destinations get their own `<dest>_uploaded` write, structurally identical, inside their own success block. **Warning signal:** a grep for `set <dest>_uploaded` returning >1 site per destination.

**Error composition (Pitfall 2):** today the message is the RAW `s3SliceError(err)` — NO `"upload failed:"` prefix exists. The Wave-0 gate must pin the S3 branch verbatim; the composed `"upload failed: <names>"` applies only when a non-S3 destination fails (no emitter exists in 96).

**Registry iteration:** insertion-ordered Map, registration order `s3` → `ftp` → `smb` = D-04 precedence. One scan serves badge + upload + (later) prune.

---

### `server.js:3817-3829` — install site (boot wiring)

**Analog: ITSELF.** The closure body `:3818-3828` moves verbatim into the descriptor's `upload` slot:
```js
setBackupDestination('s3', {
  label: 'S3',
  enabled: S3.enabled,                // derived exactly as today (:357)
  manualPrefix: 'backup-manual/',     // declared by the destination (D-01)
  upload: async meta => { /* existing :3818-3828 body verbatim */ },
  probe: () => probeS3(S3.config()),  // existing s3.js:344-370
  fetchToStaged: (cfg, path, sha, dir) => downloadToStaged(cfg, path, sha, dir),
});
```
Fail-closed rule inside the body (task-row lookup error → warn + `return null`, skip upload). Manual runs (taskId NULL) upload whenever configured (D-88-4).

**Dormant slots (D-05):** `ftp`/`smb` entries declared with `enabled=false` derived from env; NO fake probe, NO UI render. Descriptor shape must not preclude R-1/R-2 (prune follow-local, scheduled-only mirroring — phases 98/100).

---

### `server.js:208-221` + `:356-366` — env custody (SC-4 mirror)

**Analog: exact — the S3 env pair.** Clone for FTP_*/SMB_*:
- Boot-frozen consts read once at boot (:208-221 pattern), never re-read per request.
- `enabled: !!(FTP_BUCKET… )` derivation exactly like `:356-366`: `enabled: !!(S3_BUCKET && S3_ACCESS_KEY_ID && S3_SECRET_KEY)`.
- `config()` stays S3-only in 96 (no FTP/SMB consumer yet — phases 97/100 add it).
- Invalid-boot refuse (logError + process.exit(1), :263-268) exists only if the planner adds sentinels — S3's `S3_PATH_STYLE` sentinel is the shape to clone in 97/100, not required in 96.

---

### `server.js:6243-6257` — /api/config flat keys (route, request-response)

**Analog: exact.** At `:6256` `s3Enabled: S3.enabled,` — append two flat siblings, no reordering, no nesting:
```js
s3Enabled: S3.enabled,
ftpEnabled: FTP.enabled,   // D-05: false when env absent
smbEnabled: SMB.enabled,
```
Existing keys byte-identical (Pitfall 6: no `destinations:{}` object).

---

### `server.js:966` / `:1003-1009` — DDL (migration, batch)

**Analog: exact — `adapterEnsureColumn` calls.** Four additive calls (`backup_tasks.ftp_enabled/smb_enabled`, `backup_runs.ftp_uploaded/smb_uploaded`), each:
```js
await adapterEnsureColumn('backup_tasks', 'ftp_enabled', 'integer not null default 0');
await adapterEnsureColumn('backup_runs', 'ftp_uploaded', 'integer not null default 0');
```
- Def strings byte-identical to the SCHEMA block declarations (Pitfall P-B / def-byte-identical rule). Add matching `integer not null default 0,` lines into the SCHEMA tables (`:768` area for backup_tasks, `:806` area for backup_runs).
- **Ordering (Pitfall 3):** place all four AFTER the existing sqliteOnly rebuilds and AFTER the `uploaded` ensureColumn (:1009), per the :1003-1008 ordering comment.
- **NO rebuild needed:** `upload_failed` is already in the CHECK (:793/:985) — do not clone the invites-rebuild idiom (:937-962) in 96.

---

### `server.js:9508/:9533/:9681` — badge ordered scan (transform)

**Analog: the three identical ternaries themselves (self-extension):**
```js
location: r.filename
  ? (fs.existsSync(path.join(backupsRoot(), r.filename)) ? 'local' : (r.uploaded === 1 ? 's3' : 'missing'))
  : (r.uploaded === 1 ? 's3' : 'missing'),
```
Replace with (research Code Example, ratified shape):
```js
const location = r.filename && fs.existsSync(path.join(backupsRoot(), r.filename))
  ? 'local'
  : destLocation(r); // registry order: uploaded===1→'s3', ftp_uploaded===1→'ftp', smb_uploaded===1→'smb', else 'missing'
```
Existing runs (ftp/smb flags 0) render exactly as today. Restore fetch legs (export/restore.js:2069/:2300) keep the identical S3 short-circuit — `uploaded === 1 → s3Config` — since ftp/smb flags are always 0 in 96.

---

### `src/core/api.js:152/:219` + `src/pages/backup.js:522/:545` — client surface (render-only)

**Analog: exact — s3Enabled triplet.** 96 changes: RESTORE_LOCATION_KEYS gains two map entries:
```js
const RESTORE_LOCATION_KEYS = { local: 'page.restore.locLocal', s3: 'page.restore.locS3',
  ftp: 'page.restore.locFtp', smb: 'page.restore.locSmb', missing: 'page.restore.locMissing' };
```
i18n: `locFtp`/`locSmb` land ×5 locales same commit (anchor en.json:2265 `page.restore.locS3`). These are `t()`-map values, NOT `data-a=` sites → the 623 pin (i18n-shell.test.mjs:348, i18n-toast.test.mjs:301) must NOT move (Pitfall 5: verify no new `data-a=` sneaks in).

**Explicitly unchanged in 96 (D-02/D-05 pins):** `api.js:152-154` getter, `:219` `state.s3Enabled = !!r.data?.s3Enabled;`, backup.js:522 render gate, all four actions.js sites (:5103/:5155/:5219/:5263). No new client gates; no server acceptance of `ftpEnabled`/`smbEnabled` bodies.

---

### `test/backup-export.test.mjs:375-492` + `test/restore-preview.test.mjs:531-560` — setter twins

**Analog: themselves (self-extension).** Both import/call `setBackupS3Destination` (backup-export:375; restore-preview:531/:541/:550/:560). Per D-01 + research Open Question 1 recommendation: **drop the shim, update knowingly** to `setBackupDestination('s3', …)` in the same commit as the rename. The SigV4 golden-vector suite (backup-s3-sigv4.test.mjs) does NOT import the setter — immune, must stay untouched.

---

### `test/<new-registry-gate>.test.mjs` — Wave 0 static gate (NEW)

**Analog 1: `test/xws-gate.test.mjs:24-52`** — verbatim-line + regex body pins, with a message string carrying the ruling:
```js
const src = rel => readFileSync(`${ROOT}/${rel}`, 'utf8');
test('membershipsOf: the frozen function body is byte-pinned (declaration + query + super-access union)', () => {
  const s = serverSrc();
  assert.match(s, /async function membershipsOf\(userId\) \{/);
  assert.match(s, /where m\.user_id = \? and w\.archived = 0/);
  // …
});
test('membershipsOf: the call-site set is byte-pinned — declaration + the frozen consumers, verbatim lines', () => {
  const lines = serverSrc().split('\n');
  const sites = lines.filter(l => l.includes('membershipsOf('));
  assert.deepEqual(sites.map(l => l.trim()), [/* verbatim lines */],
    'membershipsOf call sites drifted — …');
});
```

**Analog 2: `test/backup-history-client.test.mjs:248-269`** — slice+regex cross-file pins with per-assertion rationale comments:
```js
assert.match(pagesSrc, /api\.s3Enabled \? `<div class="row"[\s\S]*?data-in="backupTaskS3"/, 'render-only');
const handler = actionsSrc.slice(actionsSrc.indexOf('A.backupTaskSave ='), actionsSrc.indexOf('A.backupTaskSave =') + 4000);
assert.ok(handler.includes('if (api.s3Enabled) body.s3Enabled = form.s3Enabled === true;'), '…');
```

Gate must pin: `setBackupDestination('s3', …)` install shape + descriptor keys · registration order s3→ftp→smb · the `s3SliceError` S3 branch verbatim (raw slice, no prefix) · upload slot structure (`setStage('uploading')` → key → upload → verify → mark).

---

### `test/restore-preview.test.mjs:422-459` — ensureColumn no-op test (clone for ftp/smb)

**Analog: exact.** Hand-build the pre-existing DB shape without the new column + one legacy row → `startServer({ dataDir })` → `pragma table_info` asserts column added and legacy row defaults to 0 → second boot asserts no-op:
```js
const cols = withDb(dbPath, db => db.prepare('pragma table_info(backup_runs)').all().map(c => c.name));
assert.ok(cols.includes('uploaded'), 'ensureColumn added uploaded at boot');
const legacy = withDb(dbPath, db => db.prepare('select uploaded from backup_runs where id = ?').get('legacy-run'));
assert.equal(legacy.uploaded, 0, 'the pre-existing row defaults to 0 (fail-closed badge)');
// second boot: row intact, value untouched (no-op)
```
Clone once per new column pair (`ftp_uploaded`/`smb_uploaded` on backup_runs; `ftp_enabled`/`smb_enabled` on backup_tasks if planner tests them at boot).

## Shared Patterns

### Env-only custody (D-88)
**Source:** `server.js:208-221` (consts) + `:356-366` (enabled derivation)
**Apply to:** FTP_*/SMB_* const block — boot-frozen, never serialized to client, config stays server-side (export/backup.js:635-641 comment contract: backup.js stays env/engine agnostic).

### Dual-engine DDL lockstep
**Source:** `adapterEnsureColumn` (server.js:966/:1009)
**Apply to:** all 4 new columns — after rebuilds, byte-identical defs, SCHEMA + ensureColumn in the same commit.

### Single-write-site run truth
**Source:** `export/backup.js:881`
**Apply to:** every destination's flag write — own column, own success block only.

### Static slice gating
**Source:** `test/xws-gate.test.mjs:24-52` + `test/backup-history-client.test.mjs:248-269`
**Apply to:** new Wave-0 registry gate; every assertion carries a rationale comment naming the ruling (D-xx).

### i18n ×5 same-commit
**Source:** en.json:2265 (`page.restore.locS3`), pin at 623
**Apply to:** `locFtp`/`locSmb` keys — map values only, zero `data-a` growth.

## No Analog Found

(none — every file has an in-repo analog; three are deliberate self-extensions where the byte-identity constraint makes the file its own analog)

| File | Note |
|------|------|
| `export/backup.js` registry | self-extension: S3 path byte-preserved (D-06) |
| `server.js` badge scan | self-extension: replaces 3 identical ternaries |
| setter test twins | self-extension: rename applied knowingly (D-01, OQ-1 recommendation: no shim) |

## Metadata

**Analog search scope:** `export/`, `server.js`, `src/core/`, `src/pages/`, `src/actions/`, `test/`
**Files scanned:** 11 tracked analogs (git ls-files verified)
**Pattern extraction date:** 2026-11-25
