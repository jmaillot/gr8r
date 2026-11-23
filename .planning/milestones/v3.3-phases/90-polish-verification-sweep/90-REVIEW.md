---
phase: 90-polish-verification-sweep
reviewed: 2026-11-23T12:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - server.js
  - src/pages/governance.js
  - src/pages/backup.js
  - src/actions/actions.js
  - src/core/api.js
  - export/backup.js
  - export/restore.js
  - db-adapter.mjs
  - src/locales/de.json
  - src/locales/en.json
  - src/locales/es.json
  - src/locales/fr.json
  - src/locales/nl.json
  - docs/DEPLOY.md
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 90: Code Review Report

**Reviewed:** 2026-11-23
**Depth:** standard
**Files Reviewed:** 14 (source + locales + docs; test files skimmed for reliability only)
**Status:** issues_found

## Summary

Reviewed the full a7e59e51..HEAD diff for Phase 90: the three new routes (download, verify-checksum, rotation-preview), the governance Super Admins console, the backup client chrome, the DR S3-fallback fix in `restoreInstanceUnit`, the additive-column trio, the i18n additions, and DEPLOY.md.

The core risk surface is largely **sound**: all three new routes copy the guard funnel in the correct house order (sameOrigin → requireUser → throttle-before-capability → capability → validation → lookup); the instance-scope download gate sits after the role gate and before any location resolution or byte leaves; both streaming paths are awaited pipelines with rm-finally so the staged temp never outlives the response on their main paths; hashing is on-the-pipe everywhere; the additive-column trio is byte-identical between the server.js SCHEMA and the db-adapter.mjs pg twin with engine-neutral defs and no `;-newline` comment hazard; the client derives no capability math (every gated CTA reads a server payload field, `location` derived server-side from run-row truth) and every interpolation is esc()'d or a fixed payload number; `restoreList` invalidation is a pure stage-transition compare inside the existing tick; the rotation projection is a strict dry-run (no unlink/status/audit — the keep-N walk matches `runBackupRotationPass` line for line, including the `id <> newestVerified.id` exclusion); i18n parity verified mechanically (32 new keys ×5 locales, 3 orphans removed ×5, placeholder parity clean, FR D-05 typography clean on all new keys, `err.backupDownloadAdminOnly` present in the closed RESTORE_REFUSAL_TOASTS map ×5); new suites re-run green in this tree (87 pass / 2 MinIO-gated skips).

Two WARNING defects were found: a staged-temp leak on four failure exits of the DR unit (directly against the phase's own D-89-16 lifecycle doctrine, leaving a full instance credentials archive on disk until reboot), and an async race that re-stages a stale rotation projection onto an unrelated form.

## Critical Issues

None found.

## Warnings

### WR-01: DR unit leaks the staged S3 archive temp on four failure exits between download and extract

**File:** `export/restore.js:2055`, `export/restore.js:2068`, `export/restore.js:2087-2089`, `export/restore.js:2092-2094`

**Issue:** `restoreInstanceUnit` (90-04 Rule-1 fix, commit 5c65d09a) downloads the archive via `downloadToStaged` into `restoreStagingDir()` and tracks it in `stagedTmp` with `dropStagedTmp()`. The drop is correctly wired on the extract-failure, tx-failure and outer-catch exits, and post-commit — but the `failWith` funnel (export/restore.js:2008) and `cleanup()` (export/restore.js:2071) do **not** drop the staged temp. Four exits reached only after the staged download succeeded therefore leak it:

1. `export/restore.js:2055` — `restoreSnapshotFailed` (pre-DR snapshot export fails).
2. `export/restore.js:2068` — the snapshot `catch` (`return failWith(err)`).
3. `export/restore.js:2087-2089` — `streamVerifyArchive` failure (`cleanup(); await release(); return failWith(err)` — `cleanup()` only rm's `stagingDir`/`swapDir`, never `stagedTmp`).
4. `export/restore.js:2092-2094` — `restoreTargetMismatch`.

Each leak leaves a **full instance-scope archive (entire DB dump + files — the most sensitive artifact the system produces)** sitting in `restore-staging/` until the next server restart: `sweepStaleRestoreStaging` runs at **boot only** (server.js:12125; the hourly `setInterval`s cover sessions/challenges only). This contradicts the phase's own stated lifecycle doctrine ("the staged temp never outlives the response", D-89-16 rm-finally) — the main paths honor it, these failure exits do not. Repeat operator failures (e.g. repeated DR attempts on a misconfigured instance where every snapshot fails) accumulate multi-hundred-MB credential dumps on disk.

**Fix:** route the four exits through the existing drop, e.g. call `dropStagedTmp()` immediately before each `return failWith(...)` (or fold it into `cleanup()`, which every post-download failure exit already calls — `cleanup()` runs at 2087/2092/2109 but is declared at 2071, after `stagedTmp` is in scope, so adding the drop there covers three of the four; the `restoreSnapshotFailed` return at 2055 and the snapshot catch at 2068 need an explicit `dropStagedTmp()`):

```js
const cleanup = () => {
  dropStagedTmp();
  if (stagingDir) rmStaging(stagingDir);
  if (swapDir) rmStaging(swapDir);
};
// and at 2055/2068 (before cleanup() exists in scope):
dropStagedTmp();
return failWith(keyed('restoreSnapshotFailed', ...));
```

### WR-02: `A.backupPreviewDeletions` race re-stages a stale projection after the form is cancelled

**File:** `src/actions/actions.js:5343-5363`

**Issue:** the action stages the server response into `S.ui.backupDeletions` with **no cancellation guard**. If the operator clicks "Preview deletions" (request in flight, projection reads every succeeded run — not instant) and then cancels/edits the form, the clearing at `actions.js:5110/5154` runs first, but when the response lands the action **unconditionally re-stages** the projection and renders. `deletionsPanel()` renders inside *any* open `taskFormCard`, and `A.backupTaskNew` (actions.js:5072) does not clear `backupDeletions` either. Reachable sequence: edit task A → Preview → Cancel while loading → click "New task" → the fresh New form renders task A's projected deletion list under it. That is exactly the hazard the phase's own comments claim is impossible ("a stale projection must never outlive the form that produced it", backup.js:285-291) — and the content is misleading retention information (an operator could shape a new task's keep-N to "match" another task's delete list). The same unguarded re-stage applies to a save that closes the form mid-flight.

**Fix:** guard the staging on the form that requested it, e.g.:

```js
A.backupPreviewDeletions = async el => {
  const taskId = el.dataset.taskId;
  if (!taskId) return;
  S.ui.backupDeletions = { loading: true };
  render();
  const res = await api.backupRotationPreview(taskId);
  if (S.ui.backupTaskForm?.editing !== taskId) { S.ui.backupDeletions = null; render(); return; }
  // ... existing staging ...
};
```

and add `S.ui.backupDeletions = null;` to `A.backupTaskNew` as defense in depth.

## Info

### IN-01: Dead non-admin branch in `rosterRow`

**File:** `src/pages/governance.js:162-172`

**Issue:** `superRosterView` filters `admins = all.filter(u => u.is_instance_admin)` (governance.js:167) and renders only those rows, but `rosterRow`'s action ternary still carries the full non-admin branch (promote + revoke-sessions buttons, governance.js:173 region) carried verbatim from `operatorCard`. That branch is unreachable — every roster row has `is_instance_admin` truthy. It reads as live behavior but can never render, which invites future edits against a path no user can see.

**Fix:** collapse the final ternary arm to the admin branches only (keep the inline-confirm stages and the demote arm; drop the promote/revoke arm), or add a comment marking it as carried-verbatim dead weight.

### IN-02: Download success audit precedes the stream; statSync/read race with rotation is unhandled

**File:** `server.js:9878-9882`

**Issue:** `await auditBackupTask(user, \`backup_download:${runId}\`)` (server.js:9878) fires once the source is "confirmed resolvable", but resolution was `fs.existsSync` at server.js:9859 — the rotation pass can unlink the archive between `existsSync` and `fs.statSync(streamPath)` at server.js:9882 (or mid-`createReadStream`). In that window the route throws after already writing a **success** audit row and, if `statSync` throws, before `writeHead` — the outer handler (server.js:12019) turns it into a generic 500. D-90-10's audit trail can therefore record a download that never delivered a byte. Low probability (rotation is hourly and per-task) but the audit is the phase's contract surface.

**Fix:** wrap the header+stream section in a try/catch that converts a post-resolution disappearance into the same keyed `restoreArchiveMissing` refusal + `backup_download_refused` audit (removing the premature success row is harder; at minimum audit success after `writeHead`+first successful read, or best-effort `fs.rmSync`-tolerant stat before auditing).

### IN-03: `deleted`-status runs with an S3 copy render live download/verify CTAs

**File:** `server.js:9186-9191` (historyChrome), `src/pages/backup.js:175-178`

**Issue:** the GFS rotation pass unlinks only the local archive + sidecar and marks the row `status='deleted'` (server.js:4002-4014); it never deletes the S3 object. `historyChrome` therefore derives `location: 's3'` for a deleted row (`uploaded === 1`, local gone), and `runRow` renders the download + verify CTAs for `local|s3` regardless of `run.status`. The operator sees a row labeled "Deleted" with a working download button that serves the "rotated away" archive from S3 — retention-honesty friction now surfaced by this phase's chrome. The derivation itself is correct run-row truth (D-89-14) and the DR unit deliberately treats rotation-away as survivable, so this is a semantic wrinkle, not a bug introduced here.

**Fix:** either suppress the download/verify CTAs when `run.status === 'deleted'` (client, one condition), or have the rotation pass also delete the S3 object (bigger change — a future milestone), or document that `deleted` means "local copy rotated; S3 survival copy remains".

### IN-04: "Preview deletions" button has no busy guard — double-click burns throttle tries

**File:** `src/actions/actions.js:5343-5347`, `src/pages/backup.js:381-382`

**Issue:** `A.backupVerifyChecksum` guards re-entry with `S.ui.backupChecksumBusy` (disabled + aria-busy), but `A.backupPreviewDeletions` only sets `S.ui.backupDeletions = { loading: true }` without disabling the trigger button. A double-click fires two `GET /api/backup/rotation-preview` calls; each refused *or* accepted attempt consumes one of the 10-per-15min `rotationproj` tries (D-90-15), so an impatient operator can lock themselves out of the preview for the window.

**Fix:** add a busy flag (mirror the checksum idiom: disable the button + label swap while `S.ui.backupDeletions?.loading`), or early-return in the action when `S.ui.backupDeletions?.loading` is already true.

---

_Reviewed: 2026-11-23T12:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
