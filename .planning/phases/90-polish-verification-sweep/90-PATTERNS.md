# Phase 90: Polish & Verification Sweep - Pattern Map

**Mapped:** 2026-11-23
**Files analyzed:** 12 (5 modified product files, 3 modified config/docs files, 4+ new test files)
**Analogs found:** 12 / 12 — this is a seam-consumption phase; every new surface copies a verified in-repo idiom (research §Summary)

> **Tracked-source gate:** every analog path below was verified with `git ls-files` this session — none is a mirror path.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` (new routes: download, verify-checksum, projection; history payload extension) | controller/route | request-response (streaming binary + read-only dry-run) | `server.js` restore-preview route (9529-9629) | exact |
| `server.js` (additive `backup_runs` column(s), if planner picks column for missingBlob/checksum timestamp) | migration | batch | `server.js:949-981` sqlite rebuild + `adapterEnsureColumn` idiom | exact |
| `db-adapter.mjs` (pg twin of any new column) | model/schema | batch | `db-adapter.mjs:448-468` backup_runs pg twin (uploaded precedent) | exact |
| `src/pages/governance.js` (Super Admins seg-control tab: roster + promote-search + cap 10/show-more) | component | request-response (CRUD read + client split) | `governance.js` itself: operatorCard (136-168) + govSeg seg idiom (91-97) + govFiltered (41-49) | exact (self-modification) |
| `src/pages/backup.js` (download CTA, verify-checksum badge, kept-until badge, ⚠ missingBlob, projection button + grouped render) | component | request-response render | `backup.js` restoreRow (338-351) + restorePreviewBody (360-406) + runRow (137-159) + taskFormCard (244-310) | exact (self-modification) |
| `src/actions/actions.js` (A.backupDownload, A.backupVerifyChecksum, A.backupProjection wiring, restoreList invalidation in backupPollTick) | actions | event-driven + request-response | `actions.js` A.operatorPromote (2849-2859) + RESTORE_REFUSAL_TOASTS (4879-4897) + backupPollTick (4787-4844) + `src/core/download.js` download() (45-67) | exact |
| `export/backup.js` (writer stamps missingBlob count before terminal status, if column picked) | service | batch/file-I/O | `export/backup.js:792-821` uploaded-flag write site (the writer-seam precedent) + missingBlob collectors (:425-455) | exact |
| `export/s3.js` | service (seam consumer — likely UNMODIFIED) | streaming | `export/s3.js:380-408` downloadToStaged + `:444-446` s3BackupKey | exact (consumed as-is) |
| `src/core/i18n.js` + `src/locales/{en,fr,de,es,nl}.json` | config/catalog | batch | existing flat-key entries (`"page.restore.locS3": "S3"` at en.json:2239) + the ×5 gate suite | exact (convention) |
| `docs/DEPLOY.md` (two new sections: timezone/NTP posture, new engine vs legacy CLI) | docs | — | `docs/DEPLOY.md` §9 Backups (:717, legacy `--backup` CLI text — the section to extend/contrast) | role-match |
| `test/backup-download.test.mjs`, `test/backup-verify-checksum.test.mjs`, `test/backup-rotation-projection.test.mjs` (new) | test (route unit) | request-response | `test/backup-routes.test.mjs` (startServer-per-case + withDb audit-row helper, :1-35) | exact |
| `test/backup-cron-dst.test.mjs` (new, pure) | test (unit) | batch/transform | `test/backup-cron.test.mjs` (direct-import pure suite, :1-30 — already has a DST section to extend or sit beside) | exact |
| `test/backup-full-cycle-pg-e2e.test.mjs` (new, env-gated) | test (e2e harness) | batch | `test/restore-s3-e2e.test.mjs` (MinIO gate idiom, :1-31) + `test/pg-matrix.test.mjs` (dropPgSchema + DB_URL boot, :1-50) | exact |
| `test/governance-client.test.mjs` (update pins), `test/backup-history-client.test.mjs` (extend), `test/i18n-core-features.test.mjs` (count ledger) | test (client pins) | — | themselves — source-assertion discipline (`fs`-read + regex pins, backup-history-client.test.mjs:1-20) | exact |

---

## Pattern Assignments

### `server.js` — new `GET /api/backup/download` route (controller, request-response/streaming)

**Analog:** `server.js:9529-9629` — the restore-preview route. Research rule: **copy the guard funnel VERBATIM** (house rule); the order is `sameOrigin → requireUser → throttle → capability gate → runId validation → row lookup → location resolve → stream → cleanup`.

**Guard funnel + throttle idiom** (server.js:9530-9545) — copy exactly, swap throttle key and capability set:
```js
if (pathname === '/api/backup/restore/preview' && method === 'GET') {
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const user = await requireUser(req, res);
  if (!user) return;
  /* D-89-22/OQ5: the streaming+hashing cost is the resource being
     guarded — a refused attempt still consumed a try. */
  if (tooMany(`restorepreview|${user.id}`, 10, 15 * 60 * 1000)) {
    return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
  }
  if (!(await hasInstanceRole(user.id, CAP.RESTORE_USE))) {
    await auditBackupTask(user, 'restore_refused:restoreRoleRequired');
    return fail(res, 403, 'backupRoleRequired', 'Only a Restore Operator can preview restorable backups');
  }
  const runId = url.searchParams.get('runId') ?? '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(runId)) {
    return fail(res, 404, 'taskNotFound', 'That backup run does not exist');
  }
```
For download (D-90-7 tiering): capability gate becomes
`if (!(await hasInstanceRole(user.id, CAP.BACKUP_MANAGE)) && !(await hasInstanceRole(user.id, CAP.RESTORE_USE)))` for project/workspace scope, PLUS a `scope.kind === 'instance'` → `isInstanceAdmin(user)` check **after** the row is fetched (the gate-before-lookup rule forbids reading the row first to decide capability — parse scope JSON from the row only after the role gate passes, then refuse instance-scope to non-Super-Admins keyed + audited).

**Keyed refusal + audit on every refusal path** (server.js:9550-9558):
```js
if (!row) {
  await auditBackupTask(user, 'restore_refused:restoreArchiveMissing');
  return fail(res, 404, 'restoreArchiveMissing', 'That backup archive is gone from both destinations');
}
```

**Local/S3 location resolution + stream-back + temp cleanup** (server.js:9554-9576) — this IS the D-90-9 fail-closed double and the S3 leg of both download and verify-checksum:
```js
const localPath = row.filename ? path.join(backupsRoot(), row.filename) : null;
const hasLocal = !!localPath && fs.existsSync(localPath);
if (!hasLocal && row.uploaded !== 1) {
  await auditBackupTask(user, 'restore_refused:restoreArchiveMissing');
  return fail(res, 404, 'restoreArchiveMissing', 'That backup archive is gone from both destinations');
}
let stagedPath = null;
try {
  let archivePath = localPath;
  if (!hasLocal) {
    if (!S3.enabled) {
      await auditBackupTask(user, 'restore_refused:restoreArchiveMissing');
      return fail(res, 404, 'restoreArchiveMissing', 'That backup archive lives in S3 but no S3 destination is configured');
    }
    const back = await downloadToStaged(S3.config(), s3BackupKey({ taskId: row.task_id }, row.filename), row.sha256, restoreStagingDir());
    stagedPath = back.tmpPath;
    archivePath = back.tmpPath;
  }
  // ... serve/hash from archivePath ...
} finally {
  if (stagedPath) fs.rmSync(stagedPath, { force: true }); // D-89-16: the staged temp never outlives the response
}
```
Differences per new route:
- **download:** instead of `streamVerifyArchive`, stream the archive bytes into the response (local leg: `fs.createReadStream(localPath)`; S3 leg: the staged file), headers via `fileDisposition(row.filename, false)` (below), then `await auditBackupTask(user, 'backup_download:<runId>')` **success-only** (D-90-10).
- **verify-checksum:** local leg = `sha256AndSize(localPath)` (export/backup.js:298-308); S3 leg = `downloadToStaged` already re-hashed mid-stream — compare `back.sha256`/digest vs `row.sha256` without a second read. Refusals/throttle keyed exactly like preview; result = green/red keyed badge + timestamp (persistence = planner discretion).

**Content-Disposition helper** (server.js:11339-11346) — never hand-roll escaping (D-90-8):
```js
function fileDisposition(name, inline) {
  // eslint-disable-next-line no-control-regex
  const safe = String(name || 'file').replace(/[\r\n"\u0000-\u001f\u007f]/g, '');
  const ascii = safe.replace(/[^\x20-\x7e]/g, '_') || 'file';
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
```

**Audit funnel** (server.js:8597-8602) — the closure lives inside the backup route family; new routes in the same family call it directly:
```js
const auditBackupTask = async (user, action, targetId, targetName) => {
  await db.run(
    'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
    [uid(), user.id, targetId ?? user.id, action, 0, clientIp(req), null, user.name, user.email, targetName ?? user.name, user.email, now()],
  );
};
```

### `server.js` — history payload extension (D-90-7/9 download gating)

**Analog:** `server.js:9113-9131` — the history GET, whose select list currently lacks `uploaded`/`scope` (research Pitfall 2). Extend BOTH queries (manual + task) additively, then derive `location` server-side exactly as the restore-list route does (comment block at server.js:9134-9149 documents the rule: local file exists → 'local'; uploaded=1 → 's3'; else 'missing'; NO ListObjectsV2 ever). Also parse `scope` JSON like the restore-list route does (server.js:9520-9525: `try { scope = JSON.parse(r.scope) } catch { scope = null }`). Render-only payload — client never derives location.

### `server.js` — rotation projection dry-run endpoint (SC-3)

**Analog:** `server.js:3862-3941` — `assignGfsBuckets` + the keep-N reverse walk inside `runBackupRotationPass`. Copy the walk, **STOP after `candidates`** — no unlink, no `status='deleted'` write, no audit insert (D-90-12: a projection mutates nothing):

Core math to copy (server.js:3862-3925):
```js
function assignGfsBuckets(runsAsc) { /* yearly when first of calendar year, else monthly, else weekly, else daily — sets marked for ALL positions */ }
// inside the pass:
const runsAsc = await db.all(
  "select id, created_at, filename from backup_runs where task_id = ? and status = 'succeeded' order by created_at asc, id asc", [taskId]);
if (runsAsc.length < 2) continue; // projection: return the keyed empty state instead (D-90-14)
const newestVerified = await db.get("select id from backup_runs where task_id = ? and status = 'succeeded' order by created_at desc, id desc limit 1", [taskId]);
const buckets = assignGfsBuckets(runsAsc);
const keep = { daily: task.retention_daily, weekly: task.retention_weekly, monthly: task.retention_monthly, yearly: task.retention_yearly };
const seenPerBucket = {};
const candidates = [];
for (const r of [...runsAsc].reverse()) {
  const bucket = buckets.get(r.id);
  seenPerBucket[bucket] = (seenPerBucket[bucket] || 0) + 1;
  if (seenPerBucket[bucket] > keep[bucket]) candidates.push(r.id);
}
```
Then the projection endpoint re-selects candidates with the explicit `id <> ?` newest-verified exclusion (server.js:3930-3933 verbatim SQL shape) and returns `{ groups: { daily: [...], weekly: [...], monthly: [...], yearly: [...] }, counts: {...} }`. **"Kept until" (D-90-16) uses the same per-request computation**: each history row gets its bucket label + position (`kept: 3/7 daily`) — NEVER a date (research Pitfall 1: GFS is count-based; "run date + rétention" is semantically wrong).

### `server.js` + `db-adapter.mjs` — additive `backup_runs` column(s) (migration, if planner picks column)

**Analog pair:** `uploaded` (89-02) is the exact precedent, in three places:
1. **SQLite CREATE TABLE** (server.js:786-806): `uploaded integer not null default 0` — new column goes in the same SCHEMA block with a Phase-90 comment, def byte-identical on both engines.
2. **ensureColumn at boot** (server.js:981) — placed AFTER the 88-2 rebuild block (server.js:949-974, the `backup_runs_rebuild` sqliteOnly idiom for CHECK-widening — only needed again if the planner changes the CHECK constraint; a plain additive column needs only ensureColumn):
```js
await adapterEnsureColumn('backup_runs', 'uploaded', 'integer not null default 0');
```
3. **pg twin** (db-adapter.mjs:448-468) — same column, byte-identical def, fresh-created each boot; existing pg dbs get the ensureColumn twin. Research Pitfall 3: forgetting db-adapter.mjs fails the pg-matrix test.

### `src/pages/governance.js` — Super Admins seg-control tab (SC-1)

**Analog:** the file itself. Research Pitfall 7: there is NO literal tab component — read D-90-1's "tab" as the `.seg` control idiom switching the operator-management section between « Super Admins » and « Instance Roles » views.

**Seg-control idiom** (governance.js:91-97) — copy for the Super-Admins/Instance-Roles switch (state in `S.ui.govSuperSeg`):
```js
const seg = `<div class="seg" role="group" aria-label="...">${[
  ['all', 'page.governance.segAll'],
  ['active', 'page.governance.segActive'],
  ['archived', 'page.governance.segArchived'],
]
  .map(([v, k]) => `<button class="${segV === v ? 'on' : ''}" data-a="govSeg" data-v="${v}" aria-pressed="${segV === v}">${t(k)}</button>`)
  .join('')}</div>`;
```

**Roster-first listing + client name/email search** (operatorCard, governance.js:136-168) — the current operatorCard IS the code being replaced; its pieces are the template:
- client filter idiom (:145-148): `all.filter(u => (u.name||'').toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q))` — this is the search behavior D-90-3 pins (substring case-insensitive on name AND email); D-90-3 adds the `q.length >= 2` floor and the roster/candidate split over the same `S.ui.operatorUsers` payload (seed Option B — NO server change; the GET at server.js:7927-7945 already returns every user with `is_instance_admin`).
- row rendering via `srow(...)` (:152-163) with inline-confirm stages (`S.ui.operatorRevoke` / `S.ui.operatorDemote`) — roster rows keep demote + revoke-sessions; candidate rows render promote-ONLY (no revoke button — research anti-pattern: seed constraint).
- cap 10 + show-more (D-90-4): slice the candidate list `candidates.slice(0, shown)` with `S.ui.govSuperShown` staged state — no pagination precedent needed, this is new presentation over an unpaginated payload.
- empty states via `empty('search'|'users', ...)` (:166, :209) — keyed, D-90-6 discretion.
- mount/teardown: pageGovernance mounts via `api.user?.isInstanceAdmin ? operatorCard() : ''` (:116) — replace with the seg-staged section; **register the new seg stage in `govOrphanTeardown`** (:362-377) and keep `ROUTE_TEARDOWN.governance = govOrphanTeardown` (:380) — the seed's teardown discipline.

**Post-promotion no-reload reconcile (D-90-5):** copy `A.operatorPromote` (actions.js:2849-2859, below) — the refetch idiom already delivers "candidate leaves results, appears in roster without reload" because both views render from the same `S.ui.operatorUsers`.

### `src/pages/backup.js` — download/verify/kept-until/missingBlob/projection chrome (SC-2/SC-3)

**Analog:** the file itself; four verbatim idioms:

**Location badge + payload-chrome CTA** (restoreRow, backup.js:338-351) — the template for the download CTA and location badge on history rows:
```js
<span class="badge${r.location === 's3' ? ' accent' : ''}">${t(RESTORE_LOCATION_KEYS[r.location] || 'page.restore.locMissing')}</span>
...
<button class="btn btn-sm" data-a="restorePreview" data-id="${esc(r.runId)}">${ic('archive', 13)}${t('page.restore.previewAction')}</button>
```
D-90-7/9: the download CTA renders ONLY when the extended history payload says the run is not `missing` (payload-flag chrome, D-89-21 — research Pitfall 2 warning: never gate on `status === 'succeeded'` alone; a locally-rotated-away run would show a dead button). Location keys map at :324 (`RESTORE_LOCATION_KEYS = { local, s3, missing }`) — reuse verbatim.

**Flagged-file warning rendering** (restorePreviewBody, backup.js:399-403) — the template for the ⚠ missingBlob badge (D-90-23):
```js
${flagged.length
  ? `<div class="row" style="gap:6px;flex-wrap:wrap;margin-top:8px"><span class="faint" style="font-size:12px">${ic('circle-alert', 12)}${esc(String(d.missingBlobCount ?? flagged.length))}</span>${flagged.map(f => `<span class="badge">${esc(f.name)}</span>`).join('')}</div>`
  : ''}
```

**History row fields + error toggle** (runRow, backup.js:137-159) — the template for adding the verify-checksum badge (green/red + timestamp), the `kept: 3/7 daily` badge, and the ⚠ warning into the existing per-run row; sha slice-with-title idiom at :148. Verify-checksum action placement = planner discretion (sha-row button vs menu).

**"Prévisualiser les suppressions" button + grouped projection render** (D-90-12/13) — the button slots into `taskCard`'s actions row (backup.js:194-202, the existing five `data-a="backupTask*"` buttons pattern); the grouped-by-GFS-scale list renders like `restorePreviewBody`'s detail grid + collapsible sections (the preview drawer + `.drawer` idiom at :408-416 is the container pattern; trunc + title on filenames = :148/:344 idiom). Empty state for a never-run task = keyed `empty(...)` (:504 shape). **Never client-computed** — the client renders the projection endpoint's groups verbatim.

### `src/actions/actions.js` — new actions + poll-tick invalidation

**Analog 1 — refetch + keyed toast reconcile** (A.operatorPromote, actions.js:2849-2859) — the template for promote-search wiring AND the no-reload reconcile:
```js
A.operatorPromote = async el => {
  const id = el.dataset.id;
  const res = await api.operatorPromote(id);
  if (!res.ok) {
    if (res.status === 401) return; // D-28: the central intercept owns the teardown
    const c = res.data?.code;
    return toast(tErr(c, null, res.error || t('err.serverUnreachable')), { kind: 'err' });
  }
  await refreshOperatorUsers(); // re-fetch so the list reflects the new flag
  toast(t('settings.operator.toastPromoted'));
};
```

**Analog 2 — closed refusal-toast map** (actions.js:4874-4897) — new download/verify/projection refusal codes join THIS map 1:1 (89-06 doctrine: closed map, never freeform):
```js
const RESTORE_REFUSAL_TOASTS = {
  backupRoleRequired: 'err.backupRoleRequired',
  backupManageRequired: 'err.backupManageRequired',
  operatorOnly: 'err.operatorOnly',
  tooManyAttempts: 'err.tooManyAttempts',
  restoreInvalidRunId: 'err.restoreInvalidRunId',
  restoreArchiveMissing: 'err.restoreArchiveMissing',
  ...
};
const restoreToast = (code, raw) =>
  RESTORE_REFUSAL_TOASTS[code] ? t(RESTORE_REFUSAL_TOASTS[code]) : tErr(code, null, raw || t('err.serverUnreachable'));
```
Research Open Question 2: name the new codes (download role/scope/missing, checksum mismatch) and add ×5 locale keys + map entries **same commit** as the emitting gate (D-12).

**Analog 3 — client binary download** (src/core/download.js, whole file 1-67) — `filenameFrom` (RFC 5987 parsing, :14-27) + `saveBlob` (deferred-revoke anchor click, :32-41) are the one client download path; the GET download action composes them:
```js
// download() at :45-67 shows the fetch→blob→filename flow (POST flavor); the backup download is a GET —
// ride same-origin session cookies like every other binary GET route (research A3)
saveBlob(await res.blob(), filenameFrom(res.headers.get('Content-Disposition')));
```

**Analog 4 — poll-tick piggyback + D-90-22 invalidation** (backupPollTick, actions.js:4787-4844) — the tick already piggybacks history refreshes (:4841-4842) and stops when idle (:4833-4836). D-90-22 lands as a **stage-transition compare**: when `S.ui.backupRun.stage` crosses into a terminal stage vs the previous tick's value, set `S.ui.restoreList = null` — the in-render kick (`backup.js:537 if (flags.canRestore && !S.ui.restoreList) refreshRestoreBackups()`) refetches exactly once. Research Pitfall 8: NEVER call `refreshRestoreBackups()` unconditionally inside the 1s tick.

### `export/backup.js` — writer missingBlob stamp (if column picked) + re-hash primitives

**Analog 1 — writer-seam flag write** (export/backup.js:792-821): the `uploaded = 1` write is the exact precedent for stamping `missing_blob_count` from the manifest before `completeRun`:
```js
/* D-89-15 (89-03): per-run upload truth — ... Marked ONLY here, after the
   D-88-8 stream-back verify AND the sidecar comparison both passed; never
   in a catch path ... */
await dbRun('update backup_runs set uploaded = 1 where id = ?', [runId]);
```
The manifest's missingBlob data is already collected (missingBlob collectors at :425-455, D-04) — the stamp reads the same manifest before the run is marked terminal.

**Analog 2 — streaming re-hash** (sha256AndSize, export/backup.js:298-308) — the local verify-checksum primitive (hash-on-the-pipe, never buffer-then-hash):
```js
async function sha256AndSize(filePath) {
  let size = 0;
  const hex = await new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const read = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
    read.on('data', chunk => { size += chunk.length; hash.update(chunk); });
    read.on('error', reject);
    read.on('end', () => resolve(hash.digest('hex')));
  });
  return { sha256: hex, size };
}
```
(Non-exported today — either export it or re-derive locally; planner's call. `backupsRoot()` at :77-79 IS exported.)

### `export/s3.js` — consumed seams (no modification expected)

- `downloadToStaged(config, key, expectedSha256, stagingDir)` (:380-408): S3 stream-back with mid-pipe sha256 compare, keyed `err.s3Class = 'sha256Mismatch'` refusal, temp removal on failure — the D-90-11 S3 leg.
- `s3BackupKey(meta, filename)` (:444-446): `meta?.taskId ? 'backup-task-<taskId>/<filename>' : 'backup-manual/<filename>'` — exactly how preview/verify reconstruct the object key from the run row.

### `src/core/i18n.js` + `src/locales/{en,fr,de,es,nl}.json` — new keyed entries

**Analog:** existing flat dotted keys, e.g. en.json:2238-2241:
```json
"page.restore.locLocal": "Local",
"page.restore.locS3": "S3",
"page.restore.previewAction": "Preview backup",
```
Convention (D-90-20): every new key lands in all 5 locales **same commit** as its emitting markup (D-12). The gates that will check: `test/catalogue.test.mjs` (KEY_SHAPE, forbidden `<>"`, en→fr completeness, fr key-order mirror), `scripts/i18n-scan.mjs` (every `t('…')` resolves in en + placeholders match), `scripts/fr-parity.mjs <ns>`, and `test/i18n-core-features.test.mjs` pinned counts (append to the running ledger comment + bump the count assertion). Keep count tight — 500 kB entry-chunk gate (`test/build-chunk-size.test.mjs`; 67-03 precedent consolidated refusal codes when tight).

### `docs/DEPLOY.md` — two new sections (SC-5)

**Analog:** `docs/DEPLOY.md` §9 "Backups" (:717) — today it documents only the legacy `node server.js --backup` CLI (SQLite-only). The two new sections extend this doc in its existing numbered-section + fenced-bash style: (1) timezone/NTP posture (chrony, accepted drift, what breaks when the clock drifts — crons + GFS retention), (2) the new backup engine (tar+gz, files+DB, S3, phases 86-88) vs the legacy CLI — when to use which.

### New test files — Wave 0

| New test | Analog | Idiom to copy |
|----------|--------|---------------|
| `test/backup-download.test.mjs`, `test/backup-verify-checksum.test.mjs`, `test/backup-rotation-projection.test.mjs` | `test/backup-routes.test.mjs:1-35` | "startServer-per-case with the shared harness, withDb for direct row inspection"; helper imports `{ ADMIN, client, login, signup, startServer, withDb } from './helpers/server.mjs'`; per-file `node --test` |
| `test/backup-cron-dst.test.mjs` | `test/backup-cron.test.mjs:1-30` | direct-import pure suite, no server boot; import `{ nextRunAt } from '../export/cron.js'` (+ `resolveTz`/`localParts` from `tz.js:28/45` for wall-time assertions — never offset math). Transition matrix verified live in research Pitfall 5: EU 2026-03-29 (no fire; next 2026-03-30 02:30 local) / 2026-10-25 (first occurrence), US 2026-03-08 / 2026-11-01; control: `0 8 * * *` fires on transition day. Seed `fromMs` just before local midnight of the transition day |
| `test/backup-full-cycle-pg-e2e.test.mjs` | `test/restore-s3-e2e.test.mjs:1-31` + `test/pg-matrix.test.mjs:30-50` | env-gate idiom: `const maybe = url ? test : test.skip`; MinIO env builder `S3_ENV()` (restore-s3-e2e:29-36); PG boot: `startServer({ env: { DB_URL: POSTGRES_TEST_URL, MASTER_KEY } })` + `dropPgSchema(POSTGRES_TEST_URL)` BEFORE boot (pg-matrix idiom) — one shared live DB, run per-file, NEVER `--test-concurrency=2` |
| `test/governance-client.test.mjs` (update) | itself (:109-163) | fs-read source pins — the operatorCard pins (:128-163) must be rewritten BEFORE the console rewrite lands |
| `test/backup-history-client.test.mjs` (extend) | itself (:1-20) | source-assertion discipline for D-90-22/23 client wiring |
| `test/i18n-core-features.test.mjs` (ledger append) | itself | pinned-count pattern — append comment + bump count |

---

## Shared Patterns

### 1. Guard funnel order (house rule — copy VERBATIM)
**Source:** `server.js:9530-9545` (restore preview); order doctrine at :9108-9112
**Apply to:** ALL three new server routes (download, verify-checksum, projection)
```js
sameOrigin → requireUser → tooMany(key|userId, n, window) → capability gate → input validation → row lookup
```
Never reordered: sameOrigin FIRST (Pitfall 22), capability BEFORE target lookup (no pre-gate existence oracle, T-86-06), refusal keys + audit AFTER the gate (D-20).

### 2. Keyed refusals + audit
**Source:** `server.js:9550-9558` (refusal shape) + `actions.js:4879-4897` (closed client map)
**Apply to:** every refusal in the new routes; every code gets an `err.*` (or page.*) key ×5 locales + a RESTORE_REFUSAL_TOASTS entry, same commit as the emitting gate (D-12). Success-only audit for downloads (D-90-10); refusal audit mirrors `'restore_refused:<code>'` → `'backup_download_refused:<code>'` etc.

### 3. D-89-22 operator throttle
**Source:** `server.js:9533-9537`
**Apply to:** verify-checksum (D-90-11) AND the rotation projection (D-90-15) — distinct keys (`verifychecksum|${user.id}`, `rotationproj|${user.id}`), refused attempt still consumes a try.
```js
if (tooMany(`restorepreview|${user.id}`, 10, 15 * 60 * 1000)) {
  return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
}
```

### 4. S3-located resolution + rm-finally discipline
**Source:** `server.js:9554-9576` + `:9626-9628`
**Apply to:** download (stream the staged temp), verify-checksum (read `back.sha256`). The staged temp never outlives the response (`finally { fs.rmSync(stagedPath, { force: true }) }`).

### 5. Hash-on-the-pipe
**Source:** `export/backup.js:298-308` (sha256AndSize), `export/s3.js:380-408` (hashTap Transform inside downloadToStaged)
**Apply to:** every re-hash — NEVER buffer-then-hash (anti-pattern, research); an instance archive is arbitrary-size.

### 6. Payload-flag chrome (D-89-21)
**Source:** `backup.js:324, 338-351` (location badge from server-derived `location`), doctrine comment `backup.js:15-30`
**Apply to:** download CTA, verify-checksum CTA, missingBlob warning, kept-until badge — all render only what the payload carries; the client never derives authority/location/retention math (D-23/D-90-12/16).

### 7. Additive-column migration twin
**Source:** `server.js:804` (SCHEMA def) + `server.js:981` (adapterEnsureColumn) + `db-adapter.mjs:465` (pg twin)
**Apply to:** any persisted missingBlob count / checksum timestamp. Def byte-identical on both engines (Pitfall P-B); pg twin MUST land in the same change (pg-matrix boots the same initDb).

### 8. Refetch-reconcile, no reload (D-90-5)
**Source:** `actions.js:2849-2859`
**Apply to:** promote-search post-promotion (planner may keep the refetch or mutate `S.ui.operatorUsers` locally — the refetch is the proven path) and the D-90-22 restoreList invalidation (state-null + in-render kick at `backup.js:537`, never an unconditional tick refetch).

### 9. Seg-control + staged state + route teardown
**Source:** `governance.js:91-97` (seg markup), `:145-148` (staged filter state in S.ui), `:362-380` (teardown registry)
**Apply to:** the Super Admins tab — seg stage `S.ui.govSuperSeg` (or similar) + cap/slice state must join `govOrphanTeardown`/`ROUTE_TEARDOWN.governance`.

### 10. Esc-everything render doctrine
**Source:** `governance.js:17`, `backup.js:26-27` — every payload string through `esc()`; text nodes only, no raw interpolation (T-79-10). Applies to every new row/button/badge in both pages.

## No Analog Found

None — every new file has an in-repo analog. Two near-analog notes for the planner:

| Concern | Closest analog | Gap |
|---------|---------------|-----|
| Cap-10 + "show more" slicing | No paginated list exists client-side (all lists are server-capped) | New presentation idiom — trivial staged-slice over `S.ui`; no server pagination precedent needed (payload already carries all users) |
| "kept: 3/7 daily" bucket-position badge | No existing rendering (retention shown only as `d/w/m/y` ints at backup.js:214) | New render-only field from the extended history payload; the MATH analog is `assignGfsBuckets` + keep-N walk (server.js:3862-3925), computed server-side per request |

## Metadata

**Analog search scope:** server.js (6 targeted ranges: schema 786-835, rebuild 945-984, GFS rotation 3845-3974, operator family 7925-8054, history/preview routes 9108-9629, audit 8590-8614, fileDisposition 11338-11346), src/pages/governance.js + src/pages/backup.js (full), src/actions/actions.js (2838-2882, 4780-4904), export/backup.js (70-87, 295-339, 785-829), export/s3.js (370-469), src/core/download.js (full), db-adapter.mjs (444-493), docs/DEPLOY.md (heading map + §9), test/{backup-routes,backup-cron,backup-history-client,pg-matrix,restore-s3-e2e,governance-client}.test.mjs (headers), src/locales/en.json (key shape probe), export/cron.js + tz.js (export signatures)

**Files scanned:** ~20
**Tracked-source gate:** all named analogs verified git-tracked via `git ls-files` (2026-11-23)
**Pattern extraction date:** 2026-11-23
