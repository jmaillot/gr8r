# Phase 89: Restore - Pattern Map

**Mapped:** 2026-11-22
**Files analyzed:** 13 (2 new modules + 5 modified + 6 test suites + 1 planning artifact)
**Analogs found:** 13 / 13 (one new-machine flag: the tar *reader* has no analog — the 86 writer is its layout spec)

All analog paths verified git-tracked via `git ls-files` (gate #3645). No project `AGENTS.md`, no `.claude/skills/` — conventions come from the repo's own enforcement surfaces (doc-header discipline in `export/backup.js`, `test/dependencies.test.mjs` zero-dep pin, `test/export-prohibition.test.mjs` src/ prohibition).

**Discovery corrections carried from RESEARCH.md (planner must honor):**
1. The frozen file layout is FLAT `files/<id>` (not `files/<owner-dir>/<id>.<ext>`) — `[export/backup.js:15-17, 426]`.
2. There is NO tar reader in the codebase — the ustar writer (`export/backup.js:210-285`) is the authoritative layout spec the new reader mirrors.
3. `DATA_TABLES` is only 4 row-shaped tables (`export/backup.js:103`); all content lives in `workspaces.doc` (doc-splice model).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `export/restore.js` (NEW) | service (server-only engine module) | streaming (tar/gzip) + batch (DB tx) + file-I/O | `export/backup.js` | exact (same dir, same discipline) |
| `export/restore.js` — ustar+gzip **reader** (NEW inside module) | utility | streaming | ustar **writer** `export/backup.js:210-285` | layout-spec match (no reader exists) |
| `export/restore.js` — remap planner / doc-splice (NEW) | service (pure logic + tx executor) | transform + CRUD | `db-adapter.mjs:708-772` (in-tx write shape), `server.js:1261-1318` (normalizeDoc) | role-match |
| `server.js` — `/api/backup/restore/*` routes (MOD) | controller | request-response + event-driven (background run) | `server.js:8330-8865` backup route family | exact |
| `server.js` — SCHEMA restore_runs + restore_lock (MOD) | migration/config | DDL | `server.js:749-800` backup_tasks/backup_runs DDL | exact |
| `server.js` — restore run writer + boot sweep + email fan-out (MOD) | service | event-driven | `server.js:3425-3470` writeBackupRunRow + scheduler; `3540-3543` stale sweep; `3560-3608` email gate | exact |
| `db-adapter.mjs` — SQLITE_SCHEMA twin + PG_EPOCH_COLUMNS (MOD) | migration/config | DDL | `db-adapter.mjs:414-485` backup twins | exact |
| `src/pages/backup.js` — restore card/list/drawer/stage/history (MOD) | component | request-response (render-only) | same file: `runNowCard`, `runProgress`, `runRow`/`historyCard` | exact |
| `src/actions/actions.js` — restore actions + poll tick (MOD) | store/actions | event-driven (poll) | same file: `backupPollTick` family `4780-4824` | exact |
| `src/core/api.js` — restore client methods (MOD) | service (client API) | request-response | same file: `backupRun`/`backupRunCurrent`/`backupRuns` `440-476` | exact |
| `src/overlays/modals.js` — confirmModal (REUSE, no edit) | component (overlay) | request-response | `modals.js:519-528` — used as-is via `typeName` | exact |
| `src/locales/{en,fr,nl,de,es}.json` — `page.restore.*` + `err.restore*` (MOD) | config (i18n catalogue) | n/a | `page.backup.*` keys (`en.json:2136-2194`) | exact |
| `test/restore-*.test.mjs` ×8 + pg-matrix extension (NEW) | test | batch | `test/backup-routes.test.mjs`, `test/backup-export.test.mjs`, `test/backup-history-client.test.mjs`, `test/backup-s3-e2e.test.mjs`, `test/pg-matrix.test.mjs` | exact |
| `.planning/phases/89-restore/89-SECURITY.md` (NEW) | planning artifact | n/a | `.planning/phases/85-roles-foundation/85-SECURITY.md` | exact |

---

## Pattern Assignments

### `export/restore.js` (service, streaming + batch + file-I/O) — NEW

**Analog:** `export/backup.js` (read in full this session — 817 lines)

**Module placement + header discipline** (lines 1-9, 60-67):
```js
/* =====================================================================
   BACKUP EXPORTER — Phase 86 (86-01, BKBCK-01)
   =====================================================================
   Server-only "gr8r backup v1" export pipeline. Lives at the repository
   ROOT beside export/mspdi.js — never under src/ (the prohibition test
   fails the moment a src/ module reaches this file).
   Zero new npm dependencies (D-33-11): tar + gzip + sha256 are hand-
   rolled / streamed on Node stdlib only. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { uploadArchive, s3BackupKey, sliceError as s3SliceError, downloadToStaged, getObject } from './s3.js';
import { backendKind, toPgSql, pgPoolRef, run as dbRun, get as dbGet, all as dbAll } from '../db-adapter.mjs';
```
→ restore.js copies this shape: doc header with frozen decisions, stdlib-only imports, sibling import from `./s3.js` (the 88-01 `downloadToStaged` seam), adapter import from `../db-adapter.mjs`.

**Path derivation + staging home** (lines 77-98 — D-89-32's `restore-staging` mirrors this):
```js
export function backupsRoot() {
  return path.resolve(process.env.BACKUPS_DIR || path.join(process.env.DATA_DIR || path.join(process.cwd(), 'data'), 'backups'));
}
// dataDirs() returns { dataDir, filesDir, logosDir, tmpDir, backupsDir, backupStagingDir } —
// backupStagingDir = path.join(backupsDir, BACKUP_STAGING_NAME); "Staging lives ON THE BACKUPS
// FILESYSTEM so the rename stays atomic" (Pitfall 6 / EXDEV).
```
→ restore staging: `path.join(backupsRoot(), 'restore-staging')` (D-89-32). EXDEV caution (research Pitfall 1): blob staging for a `FILES_DIR` swap must live under DATA_DIR, not restore-staging, when BACKUPS_DIR is a separate mount.

**Boot-time sweep pattern** (lines 191-208 — mirror verbatim for restore-staging):
```js
export function sweepStaleBackupStaging() {
  const { tmpDir, backupStagingDir } = dataDirs();
  let removed = 0;
  if (fs.existsSync(backupStagingDir)) {
    for (const entry of fs.readdirSync(backupStagingDir)) {
      fs.rmSync(path.join(backupStagingDir, entry), { recursive: true, force: true });
      removed += 1;
    }
  }
  ...
  return removed;
}
```

**ustar writer = the reader's layout spec** (lines 216-251 — the field offsets the reader must parse):
```js
function ustarHeader({ name, size, mtime }) {
  if (!Number.isSafeInteger(size) || size < 0 || size > 0o77777777777) {
    throw new Error(`backup: staged file too large for ustar (size=${size}, path=${name})`);
  }
  // ... base name @0 len 100, mode @100, uid @108, gid @116,
  // size octal @124 len 12 (max 0o77777777777 = 8 GiB - 1), mtime @136,
  // chksum @148 (8 spaces while summing), typeflag @156, magic 'ustar\0' @257,
  // version '00' @263, uname 'gr8r' @265, gname @297, prefix @345 len 155.
}
```
→ Reader mirrors: validate size octal against the same bound (zip-bomb guard per D-89-33), sum-check the chksum, walk 512-byte blocks over `zlib.createGunzip()`.

**Streamed hashing** (lines 288-296 — never readFile a whole dump):
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
→ Preview's whole-archive re-verify (D-89-18) taps the hash ON THE PIPE while streaming (same idiom as `downloadToStaged`'s hashTap, `export/s3.js:384-390`).

**realpath containment** (lines 412-416 — D-06 discipline mirrored into restore extraction):
```js
function contained(realPath, rootReal) {
  return realPath === rootReal || realPath.startsWith(rootReal + path.sep);
}
```

**Manifest entry-0 contract the reader consumes** (lines 696-704):
```js
const manifest = {
  formatVersion: 1,
  generator: 'gr8r backup v1 (Phase 86)',
  scope: { kind: scope.kind, id: scope.id ?? null },
  createdAt: Date.now(),
  tables,   // [{ name, classification, path, rows, sha256 }]
  files,    // [{ id, name, ext, project, task, path, sha256?, size? } + missingBlob|pathEscaped|nameReserved|symlinkSkipped flags]
};
```
Flag variants the reader must honor (`export/backup.js:313-316, 689-694`): `missingBlob`, `pathEscaped`, `nameReserved`, `symlinkSkipped` — carried with NO sha256; verifyStagedBackup skips exactly these (fail-closed on everything else, lines 313-327).

**Run lifecycle + writer seam** (lines 149-185, 586-615 — restore_runs mirrors with `restore_runs` rows per D-89-2):
```js
let currentRun = null;
export function claimRun(scope) {
  if (currentRun && (currentRun.stage === 'collecting' || ...)) return null; // D-10 refusal
  const runId = crypto.randomUUID();
  currentRun = { runId, scope, stage: 'collecting', cancelled: false, startedAt: Date.now() }; // synchronous claim
  return runId;
}
function failRun(error) {
  currentRun = { ...currentRun, stage: 'failed', error: String(error?.message || error).slice(0, 300), finishedAt: Date.now() };
}
let backupRunWriter = null;
export function setBackupRunWriter(fn) { backupRunWriter = typeof fn === 'function' ? fn : null; }
async function emitRunEvent(event) {
  if (!backupRunWriter) return;
  try { await backupRunWriter(event); } catch { /* history-write trouble never fails a run */ }
}
```
→ Note: for restore, D-89-2 makes the run row the primary lifecycle (not in-memory-only) — the claim becomes the `restore_lock` row claim (Pattern below) + an immediate `restore_runs` insert; keep the writer-seam shape (start/update/fail events, best-effort) and the `slice(0, 300)` error discipline.

**The pipeline order restore's stages mirror** (lines 620-736): `claim → mkdir staging → fence+collect → hash staged → manifest → tar → self-verify → publish` — restore: `claim restore_lock → staging under restore-staging → fetching (S3: downloadToStaged) → validating (stream manifest + sha256 re-verify + remap totality) → restoring (ONE db.tx per unit) → verifying (D-89-30) → done|failed`, with `rmStaging` in the catch (D-15 mirrored, lines 807-816).

---

### `export/s3.js` — download seam (REUSED, no edit)

**Analog excerpt** (lines 380-408 — D-89-16's fetch path; consume, don't copy):
```js
export async function downloadToStaged(config, key, expectedSha256, stagingDir) {
  const res = await getObject(config, key);
  fs.mkdirSync(stagingDir, { recursive: true });
  const tmpPath = path.join(stagingDir, `s3-download-${process.pid}-${crypto.randomUUID().slice(0, 8)}.tmp`);
  const hash = crypto.createHash('sha256');
  const hashTap = new Transform({ transform(chunk, _enc, cb) { hash.update(chunk); cb(null, chunk); } });
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
    const err = new Error(sliceError(new Error(`s3 download: sha256 mismatch for ${key}: expected ${expectedSha256}, got ${sha256}`)));
    err.s3Class = 'sha256Mismatch';
    throw err;
  }
  return { tmpPath, sha256 };
}
```
**Key reconstruction** (lines 444-446 — deterministic, no ListObjectsV2, D-89-14):
```js
export function s3BackupKey(meta, filename) {
  return meta?.taskId ? `backup-task-${meta.taskId}/${filename}` : `backup-manual/${filename}`;
}
```

---

### `server.js` — restore route family (controller, request-response) — MOD

**Analog:** backup route family `server.js:8330-8865` (read this session)

**Guard chain order — copy verbatim, never reorder** (POST trigger, lines 8716-8733; the doc comment at 8705-8715 states the frozen order):
```js
// sameOrigin → requireUser → throttle → capability gate → scope checks →
// concurrency → claim → fire-and-forget export.
if (pathname === '/api/backup/runs' && method === 'POST') {
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const user = await requireUser(req, res);
  if (!user) return;
  // throttle BEFORE the gate — a refused attempt consumes a try (T-86-08 / D-89-22)
  if (tooMany(`backuprun|${user.id}`, 5, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
  if (!(await hasInstanceRole(user.id, CAP.BACKUP_MANAGE))) {   // gate BEFORE any body probing (no 403-vs-400 oracle)
    await db.run('insert into audit_log (...) values (...)', [uid(), user.id, user.id, 'backup_run_refused:backupManageRequired', ...]);
    return fail(res, 403, 'backupManageRequired', 'Only a Backup Operator can run backups');
  }
```
→ D-89-21 mapping: list/preview GET gate `CAP.RESTORE_USE` (both roles read history, lines 8850-8851 precedent); import-as-new POST `CAP.RESTORE_USE`; overwrite POST `CAP.BACKUP_MANAGE`; instance POST `isInstanceAdmin`/Super-Admin — every refusal `auditBackupTask(user, 'restore_refused:<key>')` + `fail(res, status, code, message)`.

**Audit helper to copy** (lines 8343-8348 — restore rides this exact insert shape):
```js
const auditBackupTask = async (user, action, targetId, targetName) => {
  await db.run(
    'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
    [uid(), user.id, targetId ?? user.id, action, 0, clientIp(req), null, user.name, user.email, targetName ?? user.name, user.email, now()],
  );
};
```

**Id regex gate before any row read** (lines 8746, 8853-8862 — runId/taskId oracle defense; D-89-17's runId param copies this):
```js
if (!/^[A-Za-z0-9_-]{1,64}$/.test(taskId)) return fail(res, 404, 'taskNotFound', 'That backup task does not exist');
if (!(await db.get('select id from backup_tasks where id = ?', [taskId]))) { ... }
```

**Concurrency refusal vocabulary** (lines 8775-8781 — D-89-1's mutual refusal keys off this exact active-stage list):
```js
const active = getRunState();
if (active && (active.stage === 'collecting' || active.stage === 'archiving' || active.stage === 'verifying' || active.stage === 'uploading')) {
  // audit 'backup_run_refused:backupRunInProgress' → fail(res, 409, 'backupRunInProgress', ...)
}
```
→ Symmetric direction: the restore trigger refuses keyed `backupRestoreInProgress` when the export stages are active OR `restore_lock` is claimed; the export trigger + scheduler pass (lines 3518-3529 — scheduler maps runExport's synchronous claim refusal to a `skipped_overlap` row) must additionally refuse when `restore_lock` is claimed.

**Fire-and-forget trigger shape** (lines 8783-8801 — D-89-2: trigger returns run id immediately):
```js
const started = runExport(scope);
const runId = getRunState()?.runId;
...
await db.run('insert into audit_log ...', [..., `backup_run_started:${kind}`, ...]);
started.catch(err => logWarn(`backup run ${runId}: ${err?.message || err}`));
return json(res, 200, { runId });
```

**History GET shape restore history mirrors** (lines 8846-8865 — capped 50, newest first):
```js
const rows = await db.all('select id, task_id, trigger, status, started_at, finished_at, duration_ms, size_bytes, sha256, filename, error, created_at from backup_runs where task_id is null order by created_at desc, id desc limit 50');
return json(res, 200, { runs: rows });
```

**Funnel helpers** (hasInstanceRole 5554-5558; throttle 5610-5622):
```js
async function hasInstanceRole(userId, capability) {
  const user = await db.get('select id, is_instance_admin from users where id = ?', [userId]);
  if (!user) return false; // unknown/deleted account holds nothing
  return (await userCapabilities(user)).includes(capability);
}
function tooMany(key, max = 10, windowMs = 15 * 60 * 1000) { /* in-memory Map, size-capped at 5000 */ }
```

**Slug auto-counter (D-89-13's `-restored-2` pattern)** (lines 1157-1167):
```js
async function uniqueSlug(base, excludeId = null) {
  let root = sanitizeSlug(base) || 'workspace';
  root = root.slice(0, 32).replace(/-+$/g, '');
  let slug = root;
  let n = 2;
  while (await db.get('select 1 from workspaces where slug = ? collate nocase and id is not ?', [slug, excludeId])) {
    slug = `${root}-${n++}`;
  }
  return slug;
}
```
→ Same loop shape for the NAME counter (`-restored`, `-restored-2`, …); slug derivation stays its own concern (research A5 — slug UNIQUE index, `db-adapter.mjs:466`).

**Session revocation precedents** (7346-7350 per-user "keep-current"; 10963 CLI all-sessions):
```js
await db.run('delete from sessions where user_id = ? and token_hash != ?', [user.id, tokenHash]);
// CLI: await db.run('delete from sessions where user_id = ?', [row.id]);
// DR (D-89-25) — NEW site, POST-COMMIT only: await db.run('delete from sessions');
```

**Doc-PUT post-commit side-effect idiom** (lines 9120-9142 — D-89-28 email + D-89-3 repair ordering):
```js
if (emailClaims) runEmailDeliveryPass().catch(err => logWarn(`email post-commit pass: ${err.message}`));  // POST-COMMIT, never awaited into the response
...
for (const fileId of storedFileIds) {
  if (keptFileIds.has(fileId) || !/^[A-Za-z0-9_-]+$/.test(fileId)) continue;
  fs.unlink(path.join(FILES_DIR, fileId), err => { if (err && err.code !== 'ENOENT') logWarn(`file unlink ${fileId}: ${err.message}`); });
}
```

**normalizeDoc — the shape whitelist doc splices must pass through** (lines 1261-1318): strips `sessions`/`tfa`/`notifPrefs`/`views`/team `members` arrays, sets `out.data.ws` from columns, `out.data.me = null` — restored doc fragments are spliced in post-normalization shapes only (research Pattern 4); `emptyDoc` (4157-4176) shows the canonical `data` key set: `members, projects, tasks, comments, activity, notifs, files, events, projOrder, savedViews, recentSearches`.

**File-route containment guard** (line 10607 — the write-root guard style for restore extraction):
```js
if (!record || path.dirname(file) !== FILES_DIR) return fail(res, 404, 'fileNotFound', 'File not found');
```

### `server.js` SCHEMA — restore_runs + restore_lock (migration) — MOD

**Analog DDL** (lines 785-800 — append the restore twins right after, same comment style):
```sql
create table if not exists backup_runs (
  id           text primary key,
  task_id      text,
  scope        text not null default '{}',
  trigger      text not null check (trigger in ('manual','scheduled')),
  status       text not null check (status in ('running','succeeded','failed','upload_failed','interrupted','skipped_overlap','deleted')),
  started_at   integer not null,
  finished_at  integer,
  ...
);
create index if not exists backup_runs_task on backup_runs(task_id, created_at);
```
→ restore_runs: same column family (status CHECK `('running','done','failed','interrupted')` per D-89-2/29, scope, error, summary TEXT for the skip report per D-89-7, snapshot_run_id + pre_restore tag per D-89-5); restore_lock: single-row CAS table (`claimed_by text, claimed_at integer`). Any status set the restore writer needs beyond the CHECK must land in the SAME commit (CHECK widening = the 88 rebuild-migration idiom, lines 899-924 — copy that `create table X_rebuild → insert select → drop → alter rename → recreate index` block if needed).

### `db-adapter.mjs` — SQLITE_SCHEMA twin (migration) — MOD

**Analog** (lines 414-463 — byte-identical twin, mirror-sync test pins the pair):
```sql
/* BACKUP RUNS (Phase 87, 87-01): pg twin — ... runSchema splits statements on ';-newline',
   so comments here never end a line with a semicolon. */
create table if not exists backup_runs ( ... same DDL ... );
```
**PG_EPOCH_COLUMNS** (lines 469-485) — every epoch-ms column of restore_runs (`started_at`, `finished_at`, `created_at`, `claimed_at`) must be listed or pg stores int4-overflowing values:
```js
const PG_EPOCH_COLUMNS = new Set(['created_at','updated_at','expires_at','last_seen_at','last_login_at','used_at','next_attempt_at','delivered_at','next_run_at','started_at','finished_at']);
```

### `src/pages/backup.js` — restore card / list / drawer / stage / history (component) — MOD

**Analog:** the same file's 86/87/88 idioms (read in full — 355 lines)

**Imports + fullstate discipline** (lines 31-48):
```js
import { ic } from '../core/icons.js';
import { api } from '../core/api.js';
import { S } from '../core/store.js';
import { t, getLocale } from '../core/i18n.js';
import { esc, fmtDate } from '../core/utils.js';
import { empty, fsize } from '../ui/helpers.js';
import { refreshBackupTasks, backupPollTick, backupPollKickAllowed } from '../actions/actions.js';
// full403: lock glyph + t('err.code403') + route name + t('err.backupRoleRequired') + home way out
```

**Run-now card → restore card** (lines 54-77): `panel > panel-b > h2 + p.faint lead + row of .field/.label/.input selects + btn-primary data-a="..."`. Staged state in `S.ui.*` never the DOM; selections are payload-driven (`S.data.projects`, `api.workspace`).

**Stage progress → restore stage panel** (lines 83-103 — D-89-29 render-only stages):
```js
const runProgress = () => {
  if (S.ui.backupPending && !S.ui.backupRun)
    return `<div class="panel" ...><div class="panel-b faint" aria-busy="true">${t('page.backup.pending')}</div></div>`;
  const run = S.ui.backupRun;
  if (!run || run.stage === 'idle') return '';
  // done → filename + sha256 as text (no download action); uploading → verbatim partsDone/partsTotal; failed → keyed label
  return `<div class="panel" style="margin-top:12px"><div class="panel-h"><h2>${t('page.backup.stageLabel')}</h2><span class="badge">${esc(run.stage)}</span></div><div class="panel-b">${detail}</div></div>`;
};
```
→ Restore stages render verbatim from the restore payload: `fetching → validating → restoring → verifying → done|failed`; no client-derived stage, pending state `aria-busy="true"`, no fabricated stage.

**Run history rows → restore history card** (lines 125-177 — status key map + esc discipline):
```js
const RUN_STATUS_KEYS = { running: 'page.backup.statusRunning', succeeded: 'page.backup.statusSucceeded', failed: 'page.backup.statusFailed', upload_failed: '...', interrupted: '...', skipped_overlap: '...', deleted: '...' };
const runRow = run => { /* badge green on succeeded, trigger key, fmtDate(started_at), duration, size, sha256 slice(0,12), filename; error row behind a data-a toggle, esc()d */ };
const historyCard = task => { /* loading / err / empty / runs.map(runRow) — server ordering + cap rendered verbatim */ };
```
→ Restore history: new `RESTORE_STATUS_KEYS` + `RESTORE_STAGE_KEYS` maps with `page.restore.*` keys; the skip report (D-89-7) renders from the run-row summary payload verbatim.

**Page render + flags verbatim** (lines 312-354):
```js
if (S.ui.backupErr?.status === 403) return full403();
if (S.ui.backupErr?.status) return fullErr();
const flags = S.ui.backupTasks || { tasks: [], canBackup: false, canRestore: false };  // honest fail-closed flags
if (flags.canBackup && !S.ui.backupRun && !S.ui.backupPending && backupPollKickAllowed()) backupPollTick();
```
→ Restore section rides the same page (D-89-20): gated on payload flags (`canRestore` verbatim), no second nav entry.

### `src/overlays/modals.js` — confirmModal (REUSE — no modification)

**Excerpt** (lines 519-528 — D-89-27's type-to-confirm; call it, don't copy it):
```js
export function confirmModal(m) {
  const needs = m.typeName;
  const ok = !needs || (S.ui.confirmText || '') === needs;   // exact match; OK stays disabled until it matches — no error chrome on near-miss
  // danger → var(--red) ftype chip + btn-danger; body renders consequence text;
  // typeName input: data-in="confirmText" staged in S.ui.confirmText
}
```
→ Overwrite: `confirmModal({ typeName: targetName, danger: true, ok: t('page.restore.confirmOverwriteOk'), title, body })`; DR: `typeName: 'RESTORE-INSTANCE'` (server re-validates the phrase — the dialog is not a security boundary, research A4).

### `src/actions/actions.js` — restore poll tick (store/actions) — MOD

**Analog** (lines 4780-4824 — the poll loop restore mirrors against restore-run payload):
```js
export function backupPollKickAllowed() {
  return !S.ui.backupPollFailedAt || Date.now() - S.ui.backupPollFailedAt > BACKUP_POLL_FAILURE_COOLDOWN_MS;
}
export async function backupPollTick() {
  if (!api.enabled) return null;
  const my = ++backupPollSeq;
  backupPollInflight?.abort();
  backupPollInflight = new AbortController();
  const res = await api.backupRunCurrent({ signal: backupPollInflight.signal });
  if (my !== backupPollSeq) return null;
  if (res.ok) { S.ui.backupRun = res.data; S.ui.backupPending = false; if (!BACKUP_ACTIVE_STAGES.includes(res.data?.stage)) backupStopPolling(); }
  else {
    if (res.status === 401) return null;               // central intercept owns teardown
    backupStopPolling(); S.ui.backupRun = null; S.ui.backupPending = false;
    if (res.status === 403 || res.status === 404) S.ui.backupErr = { status: res.status };
    S.ui.backupPollFailedAt = Date.now();              // WR-02 cooldown vs render→fetch→render loops
  }
  render();
  refreshOpenBackupHistories();
  return S.ui.backupRun;
}
function backupStartPolling() { if (backupPollTimer) return; backupPollTimer = setInterval(() => backupPollTick(), 1000); }
```

### `src/core/api.js` — restore client methods — MOD

**Analog** (lines 440-476 — keyed-error doc block + central `call()` handling):
```js
async backupRun(scope, { signal } = {}) {
  return call('POST', '/api/backup/runs', { scope }, { signal });
},
async backupRunCurrent({ signal } = {}) {
  return call('GET', '/api/backup/runs/current', undefined, { signal });
},
async backupRuns({ taskId, signal } = {}) {
  return call('GET', `/api/backup/runs?taskId=${encodeURIComponent(taskId)}`, undefined, { signal });
},
```
→ restore siblings beside these with the same doc-block convention naming the new refusal vocabulary (`restoreRoleRequired` / `backupRestoreInProgress` / `restoreArchiveMissing` / `confirmPhraseMismatch` / …) — every refusal flows `call()`'s central handling, no bespoke parsing.

### `src/locales/*.json` ×5 — page.restore.* keys — MOD

**Analog:** `page.backup.*` key family (`en.json:2136` `"page.backup.runNowTitle"`, `:2145` `"page.backup.stageLabel"`, `:2189` `"page.backup.historyTitle"`, `:2194` `"page.backup.statusRunning"`). Every `page.restore.*` + `err.restore*` key lands ×5 locales in the SAME commit as the first emitting gate (parity pinned by `test/build-locales.test.mjs` + catalogue lint; research Pitfall 10).

### Test suites (test) — NEW

| Suite | Analog | Pattern to copy |
|-------|--------|-----------------|
| `test/restore-routes.test.mjs` | `test/backup-routes.test.mjs:1-55` | startServer-per-case via `./helpers/server.mjs` (`ADMIN, client, login, signup, startServer, withDb`); role granting through the Phase 85 route (`makeBackupOp` idiom, lines 39-46); audit-row assertions via `withDb(srv.dbPath, db => db.prepare("select * from audit_log where action like '..._%'")...)`; planted file tree for deterministic concurrency observation (lines 50-55) |
| `test/restore-preview.test.mjs` (+ reader units) | `test/backup-export.test.mjs:1-40` | temp DATA_DIR set BEFORE module import; in-process db-adapter `freshDb()` (`connectDb` + `runSchema(db.SQLITE_SCHEMA)`); golden round-trip through the host `tar` tool; `await import('../export/backup.js')` sibling pattern for `../export/restore.js` |
| `test/restore-client.test.mjs` | `test/backup-history-client.test.mjs:1-34` | source-assertion discipline: `fs.readFileSync` of the REAL `src/core/api.js` / `src/pages/backup.js` / `src/actions/actions.js`, `assert.match` on exported method names, doc-block refusal vocabulary, esc()/render-only pins, esc/`encodeURIComponent` presence |
| `test/restore-s3-e2e.test.mjs` | `test/backup-s3-e2e.test.mjs:1-30` | `const maybeMinio = process.env.MINIO_TEST_URL ? test : test.skip;` env-gated idiom; MinIO container runbook comment; import `downloadToStaged` etc. from `../export/s3.js` |
| `test/pg-matrix.test.mjs` (extend) | `test/pg-matrix.test.mjs:21-37` | `const maybe = url ? test : test.skip;` POSTGRES_TEST_URL gate; docker runbook comment; secret hygiene (never print DSN); COUNT_TABLES no-op discipline — add restore_runs/restore_lock to the table inventory |
| `test/restore-security.test.mjs` | (new, per `test/backup-export.test.mjs` unit style) | traversal/injection/escalation refusal pins — crafted archives through the reader + route refusals |
| `test/restore-import/overwrite/instance.test.mjs` | (new, per `test/backup-routes.test.mjs` route style) | BKRST-02/03/04 behavior pins; `sleep` helper for background-run polling; UUID_RE idiom (line 32) |

### 89-SECURITY.md (planning artifact) — NEW

**Analog:** `.planning/phases/85-roles-foundation/85-SECURITY.md` (read this session). Copy its exact skeleton:
- Frontmatter: `phase`, `slug`, `status: verified`, `threats_open: 0` (+ comment defining the gate), `asvs_level: 1`, `created`.
- `## Trust Boundaries` table (Boundary | Description | Data Crossing) — seed rows: client → `/api/backup/restore/*`, archive bytes → reader/extraction, archive rows → DB (crafted-archive input).
- `## Threat Register` table with T-89-xx ids: `| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |` — mitigation cells cite `file:line` + pinned test; the four D-89-33 families map to the research's Security Domain table (privilege-escalation-via-restore, manifest/SQL injection, path traversal, DR instance_roles abuse) plus the three operational ones (destructive overwrite, DoS archives, lock/concurrency).
- `## Accepted Risks Log`, `## Security Audit Trail`, `## Sign-Off` checklist — verbatim shape (lines 45-68).

---

## Shared Patterns

### Guard chain + keyed refusal + audit funnel
**Source:** `server.js:8705-8733, 8343-8348, 5610-5622, 5554-5558`
**Apply to:** every `/api/backup/restore/*` route
```js
sameOrigin → requireUser → tooMany(`restore...|${user.id}`, n, 15min) → hasInstanceRole(user.id, CAP.*) → body checks → audit every refusal → fail/res
```
Gate BEFORE body probing (no 403-vs-400 oracle, T-86-07); throttle consumes a try on refusal (D-89-22); refusals audited (D-89-21's audit actions `restore_refused:<key>`); reads may skip throttle (history-GET precedent, lines 8846-8852).

### Render-only client doctrine
**Source:** `src/pages/backup.js:1-30, 83-103, 326-329` + `src/actions/actions.js:4784-4817`
**Apply to:** restore card, preview drawer, stage panel, history card
Payload flags/stages/labels render verbatim through `esc()`; staged state in `S.ui.*` never the DOM; no client-derived stage, no client authority. Errors surface as keyed toasts from the history card (CONTEXT specifics).

### Run-row lifecycle + boot sweep
**Source:** `server.js:3425-3470` (writer seam), `3540-3543` (stale sweep), `10992-11000` (boot wiring), `export/backup.js:586-615` (seam contract)
**Apply to:** restore_runs writer + `sweepStaleRestoreRuns` + restore-staging sweep, wired in `main()` after `bootstrap()`:
```js
const sweptBackupStaging = sweepStaleBackupStaging();
if (sweptBackupStaging) logInfo(`backup staging sweep: removed ${sweptBackupStaging} orphan(s)`);
const interruptedRuns = await sweepStaleBackupRuns();
```
Writer events best-effort (never fail the run); stale `running` → `interrupted` at boot BEFORE the first tick; errors `slice(0, 300)` before persistence.

### Engine-neutral restore_lock claim (D-89-31)
**Source:** pattern per RESEARCH (no advisory locks); SQL shape:
```sql
update restore_lock set claimed_by = ?, claimed_at = ? where claimed_by is null;   -- atomic CAS both engines
update restore_lock set claimed_by = null, claimed_at = null where claimed_by = ?; -- release in finally
```
**Apply to:** restore trigger + scheduler/export trigger mutual refusal (`backupRestoreInProgress` / `backupRunInProgress`, active-stage list `server.js:8776`); stale claims released at boot.

### One transaction per restore unit via db.tx scope
**Source:** `db-adapter.mjs:542-609` (read this session)
```js
await db.tx(async scope => {          // sqlite: begin immediate + promise-queue mutex; pg: checked-out client, release in finally
  await scope.run('insert into workspaces (...) values (?,?,?,?,?,?,?,?)', [...]);
  await scope.run('insert into memberships (workspace_id, user_id, role, member_id, provenance) values (?,?,?,?,?)', [...]);
});
```
**Apply to:** every restore unit. Every in-tx write through `scope.run/get/all` — module-level `db.run` inside a pg tx body lands OUTSIDE the tx (Pitfall 2); `syncTaskFts(scope, wsId, stored, next)` MUST receive the tx scope (`db-adapter.mjs:708-772`); NO DDL inside the tx. Engine-native ids are app-generated `uid()` UUIDs (research Pattern 2 — no readback API needed; the remap map entry is written at insert time inside the same tx).

### Path containment at every extraction/write root
**Source:** `export/backup.js:412-416` (`contained`), `server.js:10607` (`path.dirname(file) !== FILES_DIR`)
**Apply to:** restore extraction loop — entry-name allow-list (`manifest.json` | `<allowed-table>.ndjson` | `files/<[A-Za-z0-9_-]+>` | `logos/<safe-name>`) BEFORE extraction; realpath containment against the write root; size-octal bound mirrors the writer's `0o77777777777` throw (`export/backup.js:217-219`).

### sha256-on-the-pipe
**Source:** `export/s3.js:384-397` (hashTap Transform), `export/backup.js:288-296` (streamed hash)
**Apply to:** preview whole-archive re-verify (D-89-18) and post-restore verification (D-89-30) — never readFile whole archives.

### Locale parity same-commit
**Source:** `en.json` page.backup.* family + `test/build-locales.test.mjs` pin
**Apply to:** every `page.restore.*` / `err.restore*` key ×5 locales in the commit that first emits it.

---

## No Analog Found

| File / Component | Role | Data Flow | Reason |
|------------------|------|-----------|--------|
| ustar+gzip stream **reader** (inside `export/restore.js`) | utility | streaming | No tar read/parse path exists anywhere in the repo (research Discovery 3). The writer (`export/backup.js:216-251`) is the authoritative layout spec: header field offsets, chksum convention, size bound. Build against `zlib.createGunzip()` + incremental 512-byte header walks; pin with a golden round-trip test against 86-written archives (Wave 0). |
| Remap planner / doc-splice executor | service | transform | No ID-remap precedent exists (fresh ids over doc JSON + row tables, totality validation pre-insert). Closest partial analogs: `normalizeDoc` shape discipline (`server.js:1261-1318`), `uniqueSlug` counter loop (`server.js:1158-1167`), in-tx write shape (`db-adapter.mjs:542-609`). Pure logic — unit-test like `roles.js` (pure module precedent). |
| DR global session revocation | service | event-driven (post-commit) | Only per-user deletes exist (`server.js:7348, 10963`). The DR `delete from sessions` is a new one-liner following the same post-commit discipline as the doc-PUT email/webhook passes (`server.js:9120-9133`). |

## Metadata

**Analog search scope:** repo root (`export/`, `src/pages/`, `src/actions/`, `src/core/`, `src/overlays/`, `src/locales/`, `test/`), `server.js`, `db-adapter.mjs`, `roles.js`, `.planning/phases/85-roles-foundation/`
**Files read this session:** `export/backup.js` (full), `src/pages/backup.js` (full), `roles.js` (full), `server.js` (targeted: 745-924, 1155-1182, 1258-1319, 3400-3614, 4155-4179, 5540-5624, 7342-7361, 8330-9009, 9110-9159, 10950-11024), `export/s3.js` (370-449), `db-adapter.mjs` (412-491, 540-614, 705-774, 925-954), `src/overlays/modals.js` (503-572), `src/core/api.js` (440-484), `src/actions/actions.js` (4780-4824), `src/locales/en.json` (grep), 5 test headers, `85-SECURITY.md` (full)
**Pattern extraction date:** 2026-11-22
**Tracked-source gate:** all named analog paths verified `git ls-files` non-empty
