# Phase 96: Cross-Destination Seam Generalization - Research

**Researched:** 2026-11-25
**Domain:** In-repo backup destination seam (export/backup.js + server.js) — registry refactor, dual-engine DDL, /api/config surface, restore badge, test pins
**Confidence:** HIGH (all anchors read verbatim from the working tree this session)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 · Registry = single descriptor.** `setBackupDestination(name, dest)` where `dest = { upload, verify, probe, fetchToStaged, manualPrefix, label }` — one extension point; wiring in phases 97/100 becomes one install call each. The manual-run prefix is DECLARED BY the destination (S3 keeps `backup-manual/` byte-identically). The legacy `setBackupS3Destination(fn)` signature is replaced by the registry call with a thin compat shim **if any test pins the old name** — checked during planning, updated knowingly if so.
- **D-02 · /api/config payload = flat additive keys.** `s3Enabled` stays byte-identical; `ftpEnabled` and `smbEnabled` are added as flat sibling booleans. No nested `destinations:{}` object. Existing pins (client state.s3Enabled api.js:219, render gate backup.js:522) untouched.
- **D-03 · Run truth = additive integer flags.** `ftp_uploaded` and `smb_uploaded` columns are added beside `uploaded`, which KEEPS its meaning as the S3/local-published truth exactly as today — existing runs and consumers unchanged. Both new columns via `adapterEnsureColumn` (dual-engine lockstep, second boot no-op, invites-rebuild idiom).
- **D-04 · Badge precedence = fixed s3 > ftp > smb.** `RESTORE_LOCATION_KEYS` gains `ftp`/`smb` entries and the server-side flag derivation becomes an ordered scan over the registry (one-line extension per new destination).
- **D-05 · Dormant slots.** In phase 96 the registry declares `ftp` and `smb` entries with `enabled=false` derived from env (no client exists yet — phases 97/100 install them). NO fake probe, NO UI render: the task-editor toggle gates stay keyed on the real enabled flags, so nothing is visible until wired. `/api/config` exposes the flags as false.
- **D-06 · S3 byte-identity gate.** The S3 upload/verify/sidecar/probe/restore path must be diff-verified unchanged: the S3 golden-vector suite and the MinIO env-gated e2e stay green, and a Wave-0 grep/slice gate pins `setBackupDestination('s3', …)` shape + the `upload_failed` error composition so later phases cannot silently drift it.

### Standing constraints (from context + project hard rules)
- Zero new npm dependencies · i18n ×5 locales same-commit · dual-engine DDL lockstep · audit funnel · `membershipsOf` (server.js ~:1281) byte-unchanged · `npm test` baseline 2492 tests / 2 documented pre-existing failures (D-05 fr-typography, D-06 webhook-routes) · data-a i18n count pin currently **623** (test/i18n-shell.test.mjs:348, test/i18n-toast.test.mjs:301) · commits via executor's atomic flow.
- Registry order is canonical: registration order = `s3`, `ftp`, `smb` (matches D-04 precedence); iteration for upload/prune/badge uses registry order.
- Owner rulings R-1 (prune best-effort follow-local) and R-2 (scheduled-only mirroring) are Phase 100/98 semantics — NOT implemented in 96, but the registry descriptor shape must not preclude them.

### Deferred Ideas (OUT OF SCOPE)
(none this session)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DEST-01 | S3 single-slot seam becomes a destination registry; flat boolean columns; env-only custody; single terminal `upload_failed`; alerts verbatim | Seam shape §Seam 1-2, DDL clone sites §Seam 3, custody pattern §Seam 7, audit §Seam 8 |
| TEST-01 (byte-gate portion) | Wave-0 grep/slice gates pin the registry shape + S3 error composition; existing suites stay green | Test inventory §Tests, Wave-0 gate plan §Tests |
</phase_requirements>

## Summary

The extension surface is a **single-slot closure**: `export/backup.js` holds one module-level `s3DestinationProvider` installed via `setBackupS3Destination(fn)` (export/backup.js:642-645) by exactly one call site in server.js:3817-3829, and consulted at exactly one upload slot (export/backup.js:837-885). Generalizing it to a registry (`setBackupDestination(name, dest)` with the D-01 descriptor) touches one file for the seam, one install block in server.js, and — critically — a fixed set of *read* sites that today hardcode the S3 answer: the badge derivation (server.js:9508/9533/9681), the restore fetch gate (`uploaded === 1` → `opts.s3Config`, export/restore.js:2069/2300), and the client surface (`s3Enabled` in 4 places). Every one of these is enumerated below with verbatim lines so the planner can specify an ordered-registry-scan replacement without re-discovery.

The DDL work is a pure clone of two proven idioms: `adapterEnsureColumn` (server.js:966 for `s3_enabled`, :1009 for `uploaded`) plus the `sqliteOnly` CHECK-rebuild pattern (server.js:977-1002) that is NOT needed again here — no new statuses are introduced, so 96 needs only `ensureColumn` calls, correctly ordered AFTER the existing rebuilds. The single-write-site rule for run truth (export/backup.js:881, the only `update backup_runs set uploaded = 1` in the repo) is the discipline D-03 extends: each destination gets its own flag written only in its own verified-success block, never in a catch path.

**Primary recommendation:** Introduce `destinations` as an ordered Map in export/backup.js with a `setBackupDestination(name, dest)` export; re-express the S3 install (server.js:3817-3829) as `setBackupDestination('s3', { upload: <existing closure body>, manualPrefix: 'backup-manual/', … })` with the S3 code path byte-preserved inside; add dormant `ftp`/`smb` slots + 4 ensureColumns + 2 flat config booleans; replace the three hardcoded badge/restore S3 branches with an ordered registry scan; pin everything with Wave-0 slice tests cloned from the xws-gate and restore-preview idioms.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Destination registry (D-01 descriptor) | Pipeline module (export/backup.js) | server.js (install) | backup.js stays env/engine agnostic — custody lives server-side (88-02 contract, backup.js:639-641 comment) |
| Per-task destination opt-in columns | server.js DDL (initDb) | — | boot-frozen env pair + per-task boolean column (D-88-11/12 pattern) |
| Run truth flags | export/backup.js (write) / server.js (read) | — | write only in the verified-success block (backup.js:872-881 posture); reads are badge/list routes |
| /api/config destination flags | server.js route (:6243-6257) | src/core/api.js (state) | server is the boolean ground truth; client render-only (D-23 doctrine) |
| Restore badge / location | server.js derivation (9508/9533/9681) | src/pages/backup.js:545 keys | server derives, client renders verbatim |
| Restore read-back | export/restore.js (fetch leg) | server.js routes (s3Config handoff :9797/:9886/:10019) | fetchToStaged primitive per D-01 descriptor |
| Probe | server.js routes (:9040/:9194/:9253) | export/s3.js probeS3 | guard chain is route-owned; probe fn is descriptor-owned |
| Audit | server.js auditBackupTask (:8870) | — | single funnel, keyed action tokens |

## Standard Stack

No new dependencies (hard rule). Everything is in-repo: `node:test` + `node:assert` for tests, existing `export/backup.js` / `export/s3.js` / `export/restore.js` modules, existing `adapterEnsureColumn` / `sqliteOnly` DDL helpers in server.js. No package legitimacy audit required — zero installs.

## Architecture Patterns

### Pattern 1: The seam today — single-slot provider closure
**What:** export/backup.js:642-645 [VERIFIED: export/backup.js:642-645, read this session]:
```js
let s3DestinationProvider = null;
export function setBackupS3Destination(fn) {
  s3DestinationProvider = typeof fn === 'function' ? fn : null;
}
```
Consulted exactly once, at the ratified upload slot export/backup.js:837 [VERIFIED: export/backup.js:837-838]:
```js
const s3Dest = s3DestinationProvider ? await s3DestinationProvider(runMeta) : null;
if (s3Dest?.config) {
```
The provider returns `{ config }` or `null` (skip). Comment contract (backup.js:635-641): export/backup.js stays env/engine agnostic; the boot-frozen S3_* consts and the s3_enabled column read live in server.js.

**Install site — server.js:3817-3829 [VERIFIED: server.js:3817-3829]:**
```js
setBackupS3Destination(async meta => {
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
});
```
Note the fail-closed rule (task-row lookup error → skip upload, warn — :3814-3815 comment) and D-88-4 (manual runs, taskId NULL, upload whenever configured).

### Pattern 2: The upload slot — the code the registry must wrap byte-identically
export/backup.js:837-885 [VERIFIED: export/backup.js:837-885]. Inside `runExport`, AFTER local publish + sidecar rename + `rmStaging` (staging dir :830):
- :837-838 provider consult → `if (s3Dest?.config)`
- :839-848 `uploadFailed` closure: `const msg = s3SliceError(err)` (300-char slice, s3.js:58-60 [VERIFIED]) → `currentRun.stage = 'upload_failed'` → `emitRunEvent({ kind: 'upload_failed', … })` → returns `{ ok:false, runId, code:'uploadFailed', filename, sha256, sizeBytes, error: msg }`
- :852-854 cancellation at the upload boundary routes into upload_failed (NOT the generic catch)
- :855 `setStage('uploading')`
- :856 `const key = s3BackupKey(runMeta, filename)` — key routing lives in export/s3.js:444-446 [VERIFIED]:
```js
export function s3BackupKey(meta, filename) {
  return meta?.taskId ? `backup-task-${meta.taskId}/${filename}` : `backup-manual/${filename}`;
}
```
  This is the `backup-manual/` prefix D-01 declares per-destination.
- :858-861 `uploadArchive(...)` with progress callback + `isCancelled`
- :865-871 D-88-8 verify: `downloadToStaged(s3Dest.config, key, sha256, dirs.tmpDir)` → rm → `getObject(config, `${key}.sha256`)` → sidecar sha256 compare. Sidecar writer: export/s3.js:473-481 `uploadSidecar` (`${sha256}  ${base}\n`, text/plain).
- :881 the SINGLE run-truth write [VERIFIED: export/backup.js:881]:
```js
await dbRun('update backup_runs set uploaded = 1 where id = ?', [runId]);
```
  Grep-verified: this is the only `uploaded = 1` write in export/. The D-89-15 comment block (:872-880) pins the posture: marked ONLY after stream-back verify AND sidecar compare; never in a catch path; runId IS the backup_runs row id; a mark failure routes into upload_failed.
- :882-884 `catch → return await uploadFailed(err)`
- The generic catch (:908-917) `rmStaging` + `failRun` must NEVER see upload-stage errors (comment :832-836).

### Pattern 3: DDL clone sites
- `s3_enabled` in SCHEMA: server.js:768 `s3_enabled          integer not null default 0,` [VERIFIED: server.js:768] — inside `create table if not exists backup_tasks`.
- Boot ensureColumn: server.js:966 [VERIFIED]: `await adapterEnsureColumn('backup_tasks', 's3_enabled', 'integer not null default 0');`
- `uploaded` in SCHEMA: server.js:806 `uploaded     integer not null default 0,` [VERIFIED: server.js:806]; boot ensureColumn server.js:1009 [VERIFIED]: `await adapterEnsureColumn('backup_runs', 'uploaded', 'integer not null default 0');` — with ordering comment :1003-1008: this ensureColumn must come AFTER the 88-2 sqliteOnly rebuild.
- invites-rebuild idiom (sqliteOnly CHECK-widening): server.js:937-962 [VERIFIED] — probe `select sql from sqlite_master`, conditionally create `*_rebuild`, INSERT…SELECT carry, drop, rename, re-create index. **96 does NOT need a rebuild** (no status-vocabulary change — `upload_failed` is already in the CHECK, server.js:793/:985) — but the idiom is the pattern to clone if the planner chooses to widen anything. The def-byte-identical rule (Pitfall P-B) applies to the 4 new ensureColumns.
- Restart idempotency: adapterEnsureColumn is a no-op on second boot — proven by test/restore-preview.test.mjs:422-459 ("boot ensureColumn adds backup_runs.uploaded … second boot is a no-op"), the exact test to clone for `ftp_uploaded`/`smb_uploaded`.

### Pattern 4: /api/config + client surface (D-02 flat keys)
- Server: server.js:6256 `s3Enabled: S3.enabled,` [VERIFIED] inside the GET /api/config block (:6243-6257). Add `ftpEnabled: FTP.enabled,` / `smbEnabled: SMB.enabled,` as flat siblings.
- Client getter: src/core/api.js:152-154 `get s3Enabled() { return state.s3Enabled; }` [VERIFIED].
- Client init: src/core/api.js:219 `state.s3Enabled = !!r.data?.s3Enabled;` [VERIFIED].
- Render gate: src/pages/backup.js:522 `${api.s3Enabled ? `<div class="row" …data-in="backupTaskS3"…` : ''}` [VERIFIED].
- Form state: src/actions/actions.js:5103 `s3Enabled: false,` (defaults), :5155-5157 `IN.backupTaskS3` staging, :5219 edit preload `s3Enabled: task.s3_enabled === 1,`, :5263 save serialize `if (api.s3Enabled) body.s3Enabled = form.s3Enabled === true;` [VERIFIED all four].
- In 96, per D-05, NO new client gates are added — only the two flat booleans ride the payload (false). The server-side create/edit acceptance of `ftpEnabled`/`smbEnabled` bodies is likewise NOT added (no toggle exists; phases 98/100 add the funnel branches mirroring :9025-9032).

### Pattern 5: Restore badge seam (D-04 ordered scan)
Three server-side derivation sites with identical ternary shape [VERIFIED: server.js:9508-9509, 9532-9534 (historyChrome), 9680-9682]:
```js
location: r.filename
  ? (fs.existsSync(path.join(backupsRoot(), r.filename)) ? 'local' : (r.uploaded === 1 ? 's3' : 'missing'))
  : (r.uploaded === 1 ? 's3' : 'missing'),
```
The generalization: `local` check first, then FIRST-TRUE over the ordered registry (`s3` → `ftp_uploaded === 1` → `smb_uploaded === 1`), else `missing`. D-04 fixed precedence s3 > ftp > smb; existing runs (flags all 0 except uploaded) render exactly as today.
- Client keys: src/pages/backup.js:545 [VERIFIED]: `const RESTORE_LOCATION_KEYS = { local: 'page.restore.locLocal', s3: 'page.restore.locS3', missing: 'page.restore.locMissing' };` — gains `ftp: 'page.restore.locFtp'` / `smb: 'page.restore.locSmb'` entries; i18n ×5 locales same commit (en.json:2265 `page.restore.locS3` is the sibling anchor).
- Restore fetch legs: export/restore.js:2069-2071 and :2300-2307 [VERIFIED both]:
```js
if (!archivePath && backupRun.uploaded === 1 && opts.s3Config && typeof opts.s3Config === 'object') {
  const back = await downloadToStaged(opts.s3Config, s3BackupKey({ taskId: backupRun.taskId }, backupRun.filename), backupRun.sha256, restoreStagingDir());
```
  The `uploaded === 1 → s3Config` gate generalizes to an ordered per-destination scan using each destination's `uploaded` flag + `fetchToStaged` from the descriptor. The `s3Config` handoff originates in the server routes: server.js:9797, :9886, :10019 `backupRun: { filename, sha256, uploaded, taskId }` + the route's own `S3.enabled` gate (:10290 comment "uploaded = 1 → S3.enabled else keyed 404"). In 96 the scan must short-circuit to the identical S3 behavior for existing rows (ftp/smb flags always 0).

### Pattern 6: Probe guard chain (what stays S3-specific vs descriptor-owned)
- Create path probe-at-save: server.js:9040-9046 [VERIFIED]:
```js
if (body?.s3Enabled === true && S3.enabled) {
  s3Probe = await probeS3(S3.config());
  if (!s3Probe.ok && s3Probe.key !== 'deleteFailed') {
    await auditBackupTask(user, `backup_task_refused:s3Probe:${s3Probe.key}`);
    return fail(res, 400, s3Probe.key, 'S3 destination probe failed — the task was not saved');
  }
}
```
- Edit path: server.js:9194-9200 — identical shape keyed off `s3Enabled` variable.
- Standalone route: server.js:9253-9269 — guard chain order is frozen: sameOrigin (:9254) → requireUser (:9255) → operator throttle `tooMany('backupprobe|'+user.id, 10, 15min)` (:9257) → capability `CAP.BACKUP_MANAGE` (:9258) → configured gate (:9262) → probe → audit + `json(res, 200, result)`.
- `probeS3` itself: export/s3.js:344-370 — `httpWarning = endpoint.startsWith('http://')` (:345), returns `{ ok, key, warning, httpWarning, error }` with keys `success`/`deleteFailed`/`badCreds`/`s3ClockSkew`/`unreachable`. **In 96:** the routes and probeS3 stay untouched (byte-gate); the D-01 descriptor merely declares a `probe` slot (dormant for ftp/smb — no fake probe per D-05). Phases 98/100 clone the guard chain with their own throttle keys and typed classes.
- **What the descriptor must expose:** `probe: async () => ({ ok, key, warning?, … })` — same result shape so the create/edit refusal branch (`!ok && key !== 'deleteFailed'`) is destination-agnostic when 98/100 wire it.

### Pattern 7: Env custody pattern (SC-4 mirror)
server.js:208-221 boot-frozen S3_* consts [VERIFIED]; enabled-derivation server.js:356-366 [VERIFIED]: `enabled: !!(S3_BUCKET && S3_ACCESS_KEY_ID && S3_SECRET_KEY)` + `config()` as the ONE seam resolving request config; invalid-token boot-refuse :263-268 (`S3_PATH_STYLE` sentinel → logError + process.exit(1)). FTP_*/SMB_* mirrors in 96 are consts + `enabled` derivation only (no `config()` consumer yet — phases 97/100 add it); D-05 keeps their flags false when env absent.

### Pattern 8: Audit funnel
`auditBackupTask` server.js:8870-8875 [VERIFIED] — single insert into audit_log. Existing action tokens: `backup_task_refused:invalidS3Enabled|s3NotConfigured|s3Probe:<key>` (:9026-9043), `backup_s3_probe_ok|backup_s3_probe_failed` (:9080, :9238, :9267), `backup_probe_refused:backupManageRequired|s3NotConfigured` (:9259-9263). **Registry-neutral tokens for 96:** no new destination emits anything in 96, so no new tokens are strictly required; if the planner tokenizes the registry (recommended for 98/100 readiness), the convention is `backup_<dest>_probe_ok|_failed` and `backup_probe_refused:<dest>NotConfigured` — additive, S3 tokens untouched.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Additive column migration | hand-written ALTER probes | `adapterEnsureColumn(table, col, def)` | dual-engine branch (pragma vs information_schema) already proven; byte-identical def rule (Pitfall P-B) |
| CHECK-vocabulary widening | any rebuild in 96 | NOT NEEDED — `upload_failed` already in the CHECK (server.js:793/:985) | no new statuses in 96; invites-rebuild idiom (:937-962) exists only if a future phase widens again |
| Registry iteration semantics | ad-hoc if/else chains | ordered Map (`s3, ftp, smb` registration order = D-04 precedence) | one scan serves badge + upload + (later) prune |
| Byte-gate test | diff review by hand | source-slice regex assertions (xws-gate idiom, test/xws-gate.test.mjs:24-52) | executable gate survives later refactors |

## Runtime State Inventory

Phase 96 is a refactor of live seams — runtime state matters:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `backup_runs.uploaded` rows (existing value stays authoritative per D-03); `backup_tasks.s3_enabled` rows unchanged | 4 additive ensureColumns; no data migration; `uploaded` untouched |
| Live service config | None — destinations are env-only (D-88 custody), nothing in a DB/UI outside git | none |
| OS-registered state | None verified (no pm2/launchd/task-scheduler registrations found in repo docs) | none |
| Secrets/env vars | `S3_*` env pair read at boot only (server.js:208-211); new `FTP_*`/`SMB_*` reads are boot-frozen consts in the same block | code only; no key renames |
| Build artifacts | none — plain node modules, no build step for export/ | none |

## Common Pitfalls

### Pitfall 1: The `uploaded = 1` single-write-site rule under multi-destination
**What goes wrong:** a second destination's writer reuses the generic `uploaded` column or writes its flag in a catch path.
**Why it happens:** `uploaded` is the S3/local-published truth (D-03 keeps it); the mark lives ONLY in the verified-success block (backup.js:872-881 comment contract).
**How to avoid:** each destination writes ONLY its own `<dest>_uploaded` flag inside its own success block, structurally identical to :881; failures never write flags. A mark failure routes into upload_failed.
**Warning signs:** a grep for `set <dest>_uploaded` returning >1 site per destination.

### Pitfall 2: Error-text composition drift
**What goes wrong:** today the upload-failure message is the RAW sliced provider error — `const msg = s3SliceError(err)` (backup.js:840; sliceError = `String(err?.message||err).slice(0,300)`, s3.js:58-60). There is NO "upload failed:" prefix in the current message. D-06's gate must pin what EXISTS (the S3 raw-slice branch) while the multi-destination composition ("upload failed: <dest names>") is defined for future destinations without changing S3's byte output.
**How to avoid:** the composed prefix applies only when a non-S3 destination fails (no emitter exists in 96); the Wave-0 slice test asserts the S3 branch verbatim (s3SliceError, no prefix).
**Warning signs:** a snapshot/slice test failing on the first FTP-failure commit.

### Pitfall 3: ensureColumn ordering after sqliteOnly rebuilds
**What goes wrong:** new ensureColumns placed before the 88-2 `backup_runs` rebuild block would run against a table lacking columns after a rebuild on legacy DBs.
**Why:** the rebuild recreates the table from an explicit column list (server.js:980-994) — it predates the new columns.
**How to avoid:** place all four new `adapterEnsureColumn` calls AFTER the existing rebuilds and AFTER the `uploaded` ensureColumn (:1009), following the documented ordering rule (:1003-1008 comment).
**Warning signs:** fresh-boot tests pass but legacy-DB boot tests (restore-preview:422 idiom) fail.

### Pitfall 4: Fixture drift in suites that import the setter
**What goes wrong:** renaming `setBackupS3Destination` breaks test imports and silently desyncs fixtures.
**Facts:** test/backup-export.test.mjs:375 and test/restore-preview.test.mjs:531/:541/:550/:560 import/call `setBackupS3Destination`. The SigV4 golden-vector suite (test/backup-s3-sigv4.test.mjs) does NOT import it — grep-verified — so pure-vector pins are immune.
**How to avoid:** per D-01, update these call sites knowingly to `setBackupDestination('s3', …)` (or keep a thin shim — see Open Question 1) in the same commit as the rename, atomically.

### Pitfall 5: i18n pins are load-bearing
**What goes wrong:** the data-a count pin is exactly 623 (test/i18n-shell.test.mjs:348, test/i18n-toast.test.mjs:301) with the increment ledger in a trailing comment.
**How to avoid:** 96 adds NO markup (D-05: no UI render) — if RESTORE_LOCATION_KEYS gains `ftp`/`smb` keys, the locale keys (`page.restore.locFtp`/`locSmb`) must land ×5 locales in the same commit, but they are `t()`-map values, not `data-a` sites → the 623 pin should NOT move. Verify no new `data-a=` attributes sneak in.
**Warning signs:** i18n-shell/i18n-toast count assertions failing.

### Pitfall 6: /api/config shape drift
**What goes wrong:** nesting flags under a `destinations:{}` object breaks the D-02 lock and the byte-identity of `s3Enabled`.
**How to avoid:** only two flat sibling keys appended in the GET /api/config object (server.js:6256 area); no reordering of existing keys.

### Pitfall 7: Registry ordering is semantic
**What goes wrong:** an iteration that isn't registration-ordered silently inverts D-04 badge precedence.
**How to avoid:** the registry is an insertion-ordered Map; `s3` registered first, always; the Wave-0 slice test pins the registration order.

## Code Examples

### Registry install (S3 path byte-preserved)
```js
// server.js — the :3817-3829 closure body becomes the descriptor's upload decision
setBackupDestination('s3', {
  label: 'S3',
  enabled: S3.enabled,                    // derived exactly as today (:357)
  manualPrefix: 'backup-manual/',         // declared by the destination (D-01)
  upload: async meta => { /* …existing :3818-3828 body verbatim, returns { config } | null… */ },
  verify: /* existing D-88-8 read-back + sidecar compare (backup.js:865-871) */,
  probe: () => probeS3(S3.config()),      // existing s3.js:344-370
  fetchToStaged: (cfg, path, sha, dir) => downloadToStaged(cfg, path, sha, dir),
});
```

### Ordered badge scan (replaces the :9508/:9533/:9681 ternaries)
```js
// server.js — local first, then first-true over ordered destinations (D-04)
const location = r.filename && fs.existsSync(path.join(backupsRoot(), r.filename))
  ? 'local'
  : destLocation(r); // scans registry order: uploaded===1→'s3', ftp_uploaded===1→'ftp', smb_uploaded===1→'smb', else 'missing'
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| single-slot `setBackupS3Destination(fn)` | destination registry `setBackupDestination(name, dest)` | Phase 96 | one install call per future destination |
| hardcoded `uploaded===1 ? 's3'` badge | ordered registry scan | Phase 96 | one-line extension per destination (SC-5) |
| implicit `backup-manual/` in s3BackupKey | prefix declared by destination descriptor | Phase 96 | S3 output byte-identical; FTP/SMB choose their own |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `membershipsOf` sits at server.js ~:1281 (given in the brief; the byte-pin test xws-gate.test.mjs:24-52 enforces its body regardless of exact line) | Constraints | LOW — gate is test-enforced |
| A2 | FTP_*/SMB_* const naming/enums chosen in 96 match what phases 97/100 will consume (FTP_SECURE enum etc. are REQUIREMENTS wording, not yet code) | Pattern 7 | MEDIUM — a naming mismatch costs a small follow-up rename in 97 |
| A3 | No OS-registered state exists for this repo (no service managers found in docs) | Runtime State | LOW |
| A4 | No new audit tokens are strictly required in 96 (dormant destinations emit nothing) | Pattern 8 | LOW — additive later if planner disagrees |

## Open Questions

1. **Compat shim vs knowingly-updated tests for the setter rename (D-01).**
   - What we know: two test files pin `setBackupS3Destination` by import and call (backup-export.test.mjs:375, restore-preview.test.mjs:531+). D-01 says "thin compat shim if any test pins the old name — updated knowingly if so".
   - Recommendation: **drop the shim; update the 2 files knowingly** to `setBackupDestination('s3', …)` in the same commit. A shim preserves a dead name forever; the tests ARE the pin surface D-06 wants pointed at the new shape.
2. **Does the badge ordered-scan land in 96 or does 96 only add the descriptor?**
   - What we know: SC-5 requires the badge seam generalized so a new destination is a one-line extension; D-04 says the derivation "becomes an ordered scan over the registry"; ftp/smb flags exist (D-03) and are always 0 in 96.
   - Recommendation: land the scan in 96 reading the real (dormant) flag columns — zero behavior change since flags are 0, and 98/100 then add exactly one registry entry + one RESTORE_LOCATION_KEYS line.
3. **Exact multi-destination error text format.**
   - What we know: today raw `s3SliceError(err)`; DEST-01/SC-3 want `upload_failed` error text "naming the failed destination(s)".
   - Recommendation: single-failure keeps the raw sliced provider error (S3 byte-identity); when ≥2 destinations fail, compose `upload failed: <names joined ', '> — first error: <sliced msg>`; pin only the S3 branch in the Wave-0 gate. Planner should ratify this string in planning.

## Environment Availability

Step 2.6: SKIPPED beyond the following — the phase is code/config-only, zero external dependencies (no new packages, no docker required: MinIO e2e is env-gated and must simply keep skipping when absent).

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node (npm test) | all tests | ✓ | repo-standard (existing suite runs) | — |
| Docker/MinIO | backup-s3-e2e, restore-s3-e2e | env-gated | — | skip-when-absent (existing behavior, unchanged) |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test + node:assert (repo standard, .test.mjs) |
| Config file | none — npm test script |
| Quick run command | `node --test test/backup-export.test.mjs test/backup-tasks-api.test.mjs test/restore-preview.test.mjs` |
| Full suite command | `npm test` (baseline: 2492 tests / 2 documented failures D-05 fr-typography, D-06 webhook-routes) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEST-01 | registry shape + registration order s3→ftp→smb pinned | static slice | `node --test test/<new-registry-gate>.test.mjs` (Wave 0) | ❌ Wave 0 |
| DEST-01 | S3 byte-identity gate: descriptor install shape + `s3SliceError` composition verbatim | static slice | same Wave-0 file | ❌ Wave 0 |
| DEST-01 | `ftp_enabled`/`smb_enabled`/`ftp_uploaded`/`smb_uploaded` exist; fresh boot defaults; second boot no-op | db boot | `node --test test/backup-tasks-api.test.mjs` + clone of restore-preview:422-459 idiom | ✅ clones exist (restore-preview.test.mjs:422) |
| DEST-01 | single terminal upload_failed unchanged; alerts verbatim | regression | existing backup-tasks-api:857 + backup-export:467 stay green | ✅ |
| DEST-01 | badge ordered scan renders existing runs identically | regression + slice | restore-preview:351 + backup-history-client:293-304 | ✅ |
| TEST-01 | S3 golden vectors + MinIO e2e stay green | regression | `node --test test/backup-s3-sigv4.test.mjs test/backup-s3-upload.test.mjs` (+ env-gated e2e) | ✅ |
| — | i18n pins unchanged (623 data-a; new locFtp/locSmb keys ×5) | regression | `node --test test/i18n-shell.test.mjs test/i18n-toast.test.mjs test/build-locales.test.mjs` | ✅ |
| — | membershipsOf byte-gate | regression | `node --test test/xws-gate.test.mjs` | ✅ |

### Sampling Rate
- **Per task commit:** quick command above (seam + DDL + gate files)
- **Per wave merge:** full `npm test` at baseline
- **Phase gate:** full suite green (2492 / 2 documented) + S3 e2e green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] New static gate file (registry shape + S3 byte-identity slices) — clone idioms: test/xws-gate.test.mjs:24-52 (verbatim-line pins) and test/backup-history-client.test.mjs:250-268 (source-slice regex)
- [ ] Knowingly-updated twins for the two files importing `setBackupS3Destination` (backup-export, restore-preview)
- [ ] No new framework install needed

## Security Domain

security_enforcement context: standing V14 discipline (no secrets in logs/errors) — no config key present, so a compact domain:

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V5 Input Validation | yes (98/100, not 96) | existing boolean-gate funnel :9025-9032; 96 adds none |
| V7 Error handling | yes | sliceError 300-char discipline (s3.js:58-60) — the gate pins it |
| V9 Communications | yes (custody pattern) | env-only credentials, boot-frozen, never serialized to client (server.js:204-207 comment) |
| V4 Access Control | yes | probe routes keep sameOrigin→requireUser→throttle→CAP.BACKUP_MANAGE chain verbatim (:9254-9261) |

No new threat surfaces in 96: dormant destinations emit nothing, probe nothing, render nothing.

## Sources

### Primary (HIGH confidence — all read verbatim this session)
- export/backup.js:635-645, 832-917 — seam, upload slot, run-truth write, error composition
- export/s3.js:44-60, 344-370, 420-481 — key routing, sliceError, probeS3, sidecar
- export/restore.js:2062-2075, 2294-2307 — restore fetch legs
- server.js:208-221, 356-366, 750-835, 937-1028, 3647-3674, 3808-3829, 6243-6257, 8860-8884, 9023-9282, 9490-9689, `uploaded` grep (38 sites)
- src/core/api.js:140-229 · src/pages/backup.js:505-564 · src/actions/actions.js:5095-5269
- src/locales/en.json:2229, 2265
- test/backup-export.test.mjs:375-492 · test/backup-tasks-api.test.mjs:308-637 · test/restore-preview.test.mjs:273-560 · test/backup-history-client.test.mjs:113-304 · test/xws-gate.test.mjs:24-65 · test/i18n-shell.test.mjs:348 · test/i18n-toast.test.mjs:301
- .planning/ROADMAP.md:25-68 · .planning/REQUIREMENTS.md · .planning/research/SUMMARY.md

## Metadata

**Confidence breakdown:**
- Seam shape / anchors: HIGH — every file:line quoted verbatim from the working tree
- DDL / migration pattern: HIGH — clone sites read + proven by existing tests
- Pitfalls: HIGH — each grounded in a comment contract or test pin in-repo
- Dormant-slot / env-custody naming: MEDIUM — D-05 semantics locked, exact const names are planner/executor choices (A2)

**Research date:** 2026-11-25
**Valid until:** 2026-12-25 (stable in-repo anchors; re-verify line numbers if earlier phases land)

