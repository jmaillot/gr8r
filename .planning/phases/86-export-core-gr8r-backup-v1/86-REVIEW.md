---
phase: 86-export-core-gr8r-backup-v1
reviewed: 2026-11-21T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - export/backup.js
  - server.js
  - db-adapter.mjs
  - src/pages/backup.js
  - src/actions/actions.js
  - src/core/api.js
  - src/locales/en.json
  - src/locales/fr.json
  - src/locales/nl.json
  - src/locales/de.json
  - src/locales/es.json
findings:
  critical: 1
  warning: 5
  info: 5
  total: 11
status: issues_found
---

# Phase 86: Code Review Report

**Reviewed:** 2026-11-21 (standard depth)
**Files Reviewed:** 7 production files (11 paths incl. all 5 locale catalogues)
**Status:** issues_found

## Summary

The export pipeline (export/backup.js) is structurally sound: the synchronous claim (D-10) is genuinely atomic, the guard chain on both new routes is complete and correctly ordered, scope containment via `realpathSync` + `contained()` correctly defeats `../` and absolute-path injection from doc-controlled file ids, and the client pages render all server-derived strings through `esc()`. All 5 locale catalogues carry identical key sets for the 24 new keys (D-12 verified programmatically).

One critical defect: the instance-scope collector can stage files whose staged names collide with the **frozen manifest/table tar entry names**, silently corrupting the entry-0 contract that Phases 87/88/89 consume. A cluster of warnings covers contract drift (D-06 flagging), a client fetch/render loop, an un-stoppable run at shutdown, an fd leak on a failure path, and a D-15/status inconsistency when the sidecar write fails.

What was checked and found sound (so the fixer doesn't re-litigate):
- **D-10 race:** `claimRun()` mutates before the first `await`; route check (server.js:7855) → `runExport(scope)` (7865) has no await in between. Pinned by the `Promise.all` race test. Atomic as claimed.
- **Path traversal:** `collectDocFile`/`collectLogo` resolve the blob through `realpathSync` and require containment under the collector root; `path.join(filesDir, '/etc/passwd')` and `..`-id shapes both land outside the root and are flagged `pathEscaped`, never copied.
- **Auth chain:** both routes carry sameOrigin → requireUser → throttle → capability gate → scope validation in the required order; gate precedes body read (no oracle); refusals audited (D-20); status payload exposes filename/sha256 only to BACKUP_MANAGE holders (D-19/D-22).
- **Render-only client:** no HTML built from server data without `esc()`; stage rendered verbatim, never derived.

## Critical Issues

### CR-01: Instance-scope collector can emit tar entries colliding with the frozen manifest/table entry names (silent format corruption)

**File:** `export/backup.js:416-443` (collectInstanceFiles), interacting with `:532-545` (manifest + tar write)
**Issue:** For `instance` scope, every file directly under `DATA_DIR` is staged at `path.join(stagingDir, rel)` and tarred under its DATA_DIR-relative name. If any entry of `DATA_DIR` is named `manifest.json` (or matches a `<table>.ndjson` name, e.g. a stray `users.ndjson` or `audit_log.ndjson` left by an ops script), the archive gets **two tar entries with the same name**: the frozen entry-0 `manifest.json` written at line 543 and the collected file. `tarFileEntry` does not check for name collisions, and `verifyStagedBackup` verifies staged hashes only — it never checks tar-entry uniqueness — so self-verification passes and a manifest-ambiguous archive lands in `DATA_DIR/backups/`. This silently violates the frozen cross-phase contract ("manifest.json is tar entry 0") that Phase 89 restore consumes. It is exactly the class of corruption the phase's own fail-closed doctrine (D-06, D-15) is meant to make impossible.
**Fix:** Fail the run (or flag the entry) when a staged instance-file relative path collides with the reserved root entry namespace:
```js
const RESERVED = new Set(['manifest.json', ...TABLES.map(t => `${t.name}.ndjson`)]);
// inside walk(), before staging a file:
if (RESERVED.has(rel)) {
  files.push({ id: rel, name: path.basename(rel), ext: null, project: null, task: null, path: rel, nameReserved: true });
  continue; // record + skip — never emit a colliding tar entry
}
```
(If D-01's "ship everything" must hold byte-for-byte, the alternative is namespacing instance files — but that breaks the frozen layout; the refuse/flag path is the reversible one.)

## Warnings

### WR-01: Instance-scope symlink escapes are skipped silently — D-06's "skipped and flagged in the manifest" is not honored

**File:** `export/backup.js:419-434` (collectInstanceFiles walk)
**Issue:** `readdirSync(..., { withFileTypes: true })` reports symlinks with `isDirectory() === false` and `isFile() === false`, so any symlink entry falls through `if (!entry.isFile()) continue` (line 434) **before** the `contained()` check on line 428 ever matters for it. Two consequences: (a) the `realpathSync` + `contained` defense on 423-428 is effectively dead code for the instance walk (symlinks are never followed anyway), and (b) an escape — or a legitimate in-tree directory reached via symlink — is dropped with **no manifest flag**, while the collector doc-comments (D-06) and the doc-file/logo collectors (`collectDocFile:390`, `collectLogo:406`) do set `pathEscaped`. Silent omission of scope content is a parity defect for Phase 89 restore and hides filesystem anomalies from operators.
**Fix:** Detect symlink dirents explicitly (`entry.isSymbolicLink()`), attempt `realpathSync` + `contained()`, and push a `pathEscaped: true` manifest entry when containment fails — matching the D-06 contract used by the other two collectors.

### WR-02: Backup page render-kick + poll failure path creates an unthrottled fetch loop and never clears `backupPending`

**File:** `src/pages/backup.js:111` and `src/actions/actions.js:4762-4782`
**Issue:** `pageBackup()` calls `backupPollTick()` on every render while `canBackup && !S.ui.backupRun && !S.ui.backupPending`. In `backupPollTick`, every non-401 failure stops the timer, clears `backupRun`, then calls `render()` — which re-enters `pageBackup`, which fires the next tick. With the server persistently erroring (500, network reset) or a role-revoked holder getting 403, this is a **render→fetch→render loop** hammering `/api/backup/runs/current` with no backoff for as long as the page is mounted. Two aggravations: (a) the 403 path never sets `S.ui.backupErr`, so a role-revoked user keeps seeing the Run now card backed by stale `backupTasks` flags; (b) `backupPending` is never cleared on the failure path, so if the failure lands between trigger and first poll, the "pending" panel renders indefinitely.
**Fix:** On any `!res.ok` in `backupPollTick` (except 401): set `S.ui.backupPending = false`, set `S.ui.backupErr = { status: res.status }` for 403 (matching the page's full403 gate), and add a tick guard so the render-kick does not immediately re-fire after a failure (e.g. a `lastTickFailedAt` cooldown, or have the render-kick only run once per mount via a seq guard):
```js
} else {
  if (res.status === 401) return null;
  backupStopPolling();
  S.ui.backupRun = null;
  S.ui.backupPending = false;
  if (res.status === 403) S.ui.backupErr = { status: 403 };
}
```

### WR-03: SIGTERM shutdown marks the run failed but cannot stop it — runExport keeps running and can flip state back to `done` mid-shutdown

**File:** `server.js:10157-10169` and `export/backup.js:460-579`
**Issue:** The shutdown handler mutates `activeRun.stage = 'failed'` and `rmSync`s the staging directory, but the in-flight `runExport` promise keeps executing (nothing cancels it). Three observable races inside the 5-second exit window: (a) the exporter's next staging write fails against the deleted directory → `failRun()` overwrites state again; (b) if the export had already reached `renameSync` (569) / sidecar write, `completeRun()` overwrites `stage` back to `'done'` **after** the handler declared it failed — the persisted-to-memory status contradicts the shutdown trail; (c) the tar/gzip pipeline and pg fence client keep consuming CPU/DB connections while the process is supposedly winding down. Not data-corrupting (only verified archives get renamed, and `process.exit(1)` fires at 5s), but the shutdown state machine is dishonest and the rmSync-while-streaming pattern is fragile.
**Fix:** Give the exporter a cancellation token: `const run = { cancelled: false }` stored on `currentRun`; shutdown sets `activeRun.cancelled = true`; `runExport` checks it at each stage transition (and between tar entries) and aborts with a clean `failRun('cancelled: shutdown')`. Remove the handler-side `rmSync` (the exporter's own catch path then owns staging removal, and the boot sweep remains the hard-crash backstop — which it already is).

### WR-04: `dumpTable` leaks its write-stream fd when the snapshot fence errors mid-pagination

**File:** `export/backup.js:335-365` (dumpTable), triggered from `:479-500`
**Issue:** `dumpTable` opens `fs.createWriteStream(out)` and only closes it on the happy path (`write.end(resolve)` at 360-363). If `read(...)` throws mid-loop (pg client error, fence rollback, SQLite snapshot error), the rejection propagates out of the `for(;;)` loop with the write stream still open — `runExport`'s catch then `rmSync`es the staging dir, but the open fd keeps the (now unlinked) file alive until GC. On pg, an export failure of a large table can hold dozens of fds; repeated failures without GC pressure can hit the process fd limit. Same pattern in the finalizer: the error-listener promise at 360-363 is never reached, so an async write error after the throw is an unhandled `'error'` event on the stream (potential process crash in older Node error semantics).
**Fix:** Wrap the pagination loop in try/finally and destroy the stream on error:
```js
try {
  for (;;) { /* pagination */ }
  await new Promise((resolve, reject) => { write.on('error', reject); write.end(resolve); });
} catch (err) {
  write.destroy();
  throw err;
}
```

### WR-05: Sidecar-write failure after the atomic rename reports the run `failed` while a valid archive remains in `DATA_DIR/backups/`

**File:** `export/backup.js:566-578`
**Issue:** The sequence is `renameSync` (569) → `writeFileSync(sidecar)` (570) → `rmStaging` → `completeRun`. If the sidecar write throws (disk full, ENOSPC on metadata), control jumps to the catch at 575, which calls `rmStaging(stagingDir)` (the tar is already renamed away — staging is just residue) and `failRun(err)`. Result: the run status says `failed`, yet a fully verified archive now occupies `DATA_DIR/backups/` with no `.sha256` sidecar. D-15's "only verified archives occupy backups" is technically met, but the operator-facing state is wrong — the run failed *after* success, and there is no record (filename is only in the log line, never in the run state) that the archive exists. This also violates D-19's "on completion the archive filename + sha256" promise for a run that did complete.
**Fix:** Split the finalization: once `renameSync` succeeds, the run is committed. Compute and write the sidecar **before** flipping stage, and on sidecar failure keep the run in a done-with-caveat state rather than failed — or write the sidecar into staging and rename it together with the tar:
```js
fs.writeFileSync(path.join(stagingDir, 'archive.tar.gz.sha256'), `${sha256}  ${filename}\n`);
fs.renameSync(tarPath, destination);
fs.renameSync(path.join(stagingDir, 'archive.tar.gz.sha256'), `${destination}.sha256`);
```

## Info

### IN-01: Dead code — `sha256File` is never called

**File:** `export/backup.js:251-259`
**Issue:** `sha256File()` has zero call sites; every checksum path uses `sha256AndSize`. Dead code in the frozen-format module invites drift.
**Fix:** Delete the function or route `verifyStagedBackup` through it if a size-free variant is wanted.

### IN-02: Manifest is read fully into memory, contradicting the module's memory-bounded claim

**File:** `export/backup.js:543` (`fs.readFileSync(manifestPath)` inside `tarEntry`)
**Issue:** The pipeline comment promises "only 512-byte blocks and small chunks ever sit in RAM", but entry 0 is buffered whole. For an instance export with tens of thousands of file rows the manifest can reach tens of MB.
**Fix:** Acceptable for v1; if the claim is kept, stream the manifest with a fixed-size tail-pad block. Otherwise soften the comment.

### IN-03: Duplicate doc-file ids produce duplicate tar entries and manifest rows

**File:** `export/backup.js:373-395` + `:547-550`
**Issue:** `doc.files` is user-shaped JSON; the same `record.id` appearing twice yields two identical manifest `files[]` entries and two tar entries with the same name. Harmless for `tar xzf` (last wins) but ambiguous for the Phase 89 id→row restore map.
**Fix:** Dedupe candidates by id before collection (one line: a `Set` of seen ids around the candidate loop).

### IN-04: Non-empty task list renders the "Loading…" string

**File:** `src/pages/backup.js:114-115`
**Issue:** When `tasks.length > 0` the task panel body renders `t('page.governance.loading')` — a copy-paste from the loading state at line 101. Unreachable in v1 (the server always returns `tasks: []`), but Phase 87 will flip this branch live and ship a permanently-"loading" task list.
**Fix:** Render a proper task-list placeholder (or the task rows) instead of the loading string.

### IN-05: `failRun` truncates the error to 300 chars, but the runExport return value carries the full string to the log

**File:** `export/backup.js:156` vs `:578`
**Issue:** Inconsistent error-size discipline between the persisted run state (capped) and the `logWarn` path (uncapped) — a verbose pg error can produce a multi-KB log line per failed run while the status shows 300 chars. Cosmetic, but pick one bound.
**Fix:** Apply the same 300-char slice to the returned error string (or drop the slice from `failRun` since it is in-memory only).

---

## Verification notes

- **D-12 locale parity:** all 24 new keys (`err.backupRunInProgress`, `err.scopeNotFound`, `err.backupPickProject`, 21 `page.backup.*`) present in all 5 catalogues — verified by script, no gaps.
- **Table count:** `DATA_TABLES` (4) + `OPERATIONAL_TABLES` (18) = 22 — matches the frozen manifest contract.
- **Keyset map:** covers exactly the 22 tables; composite keys match the `PG_CONFLICT_TARGETS` PK shapes in db-adapter.mjs.
- **Route guard order:** matches the Phase 85 chain verbatim; throttle is operator-keyed (D-21), consumes a try before the gate; gate precedes body read (no scope-probing oracle, T-86-07).
- **Claim race:** no await between the route's active-run check (server.js:7855) and the synchronous claim inside `runExport(scope)` (7865) — atomic under the single-process model; pinned by the `Promise.all` test in test/backup-routes.test.mjs:171.
- **Boot wiring:** `sweepStaleBackupStaging()` runs after `bootstrap()` (server.js:10037) — D-13 satisfied; shutdown handler present (10157) but see WR-03.

---

_Reviewed: 2026-11-21_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
