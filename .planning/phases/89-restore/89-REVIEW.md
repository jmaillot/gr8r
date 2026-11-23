---
phase: 89-restore
reviewed: 2026-11-23T00:00:00Z
depth: standard
files_reviewed: 28
files_reviewed_list:
  - db-adapter.mjs
  - export/backup.js
  - export/restore.js
  - mailer.js
  - server.js
  - src/actions/actions.js
  - src/core/api.js
  - src/locales/de.json
  - src/locales/en.json
  - src/locales/es.json
  - src/locales/fr.json
  - src/locales/nl.json
  - src/pages/backup.js
  - test/backup-scheduler.test.mjs
  - test/client-surfaces.test.mjs
  - test/email-outbox.test.mjs
  - test/i18n-core-features.test.mjs
  - test/i18n-shell.test.mjs
  - test/i18n-toast.test.mjs
  - test/pg-matrix.test.mjs
  - test/restore-client.test.mjs
  - test/restore-import.test.mjs
  - test/restore-instance.test.mjs
  - test/restore-overwrite.test.mjs
  - test/restore-preview.test.mjs
  - test/restore-routes.test.mjs
  - test/restore-s3-e2e.test.mjs
  - test/restore-security.test.mjs
findings:
  critical: 1
  warning: 4
  info: 9
  total: 14
status: issues_found
---

# Phase 89: Code Review Report

**Reviewed:** 2026-11-23 (standard depth, adversarial)
**Depth:** standard
**Files Reviewed:** 28
**Status:** issues_found

## Summary

Phase 89 (restore engine, routes, persistence, client surface) is a carefully built body of work: the ustar reader is genuinely memory-bounded, the entry gate is a single allow-list source of truth, the sha256 chain (whole-archive + per-entry + run-row) is fail-closed, all three destructive paths are guarded by server-side confirm re-validation, and the route guard chains are consistently ordered. The phase test suites were executed during this review: **193 tests, 193 pass, 0 fail** (restore-security/import/overwrite/instance/preview/routes/client, backup-scheduler, client-surfaces, email-outbox, i18n-toast/shell/core-features). The 5-locale parity rule was verified programmatically: **every key added by this phase (49 keys incl. `page.restore.*`, `err.restore*`, `restore.alert.*`) exists in all of de/en/es/fr/nl**.

The adversarial pass still found one **blocker**: `restoreInstanceUnit` does not release the global `restore_lock` on its early failure paths (its `failWith` twin in `restoreOverwriteUnit` does). A routine DR trigger against a rotated-away archive wedges every restore trigger AND every backup run (manual + scheduled, D-89-1) until reboot. Three further warnings concern DR-path data handling (unvalidated `team_id`, a globally-scoped `member_id` dedupe, an undisclosed FK cascade) and one doctrinal violation (whole-file ndjson buffering). Info items are consistency/report-honesty nits.

Security posture otherwise held up: traversal/absolute/backslash entry names refuse fatally before any write; extraction containment runs realpath discipline before every write; archive bytes are sha-gated to server-produced archives (neutralizing manifest-field injection on the destructive paths); the DR/overwrite confirm phrases are re-validated server-side; the preview route streams and hashes with a deliberate throttle; no archive bytes ever reach the client.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: restoreInstanceUnit leaks the global restore_lock on early failure paths — instance wedged until reboot

**File:** `export/restore.js:1960-1998`
**Issue:** `restoreInstanceUnit`'s `failWith` (lines 1960-1965) emits the `fail` run event but never calls `release()`. Four reachable paths exit through it after the route has already claimed the restore lock (`server.js:9364`):

1. lines 1967-1969 — operator identity missing;
2. lines 1971-1974 — `restoreArchiveMissing` (local archive rotated/deleted, `uploaded !== 1`);
3. lines 1983-1985 — `restoreSnapshotFailed` (pre-DR `runExport` refused, e.g. a backup run in flight);
4. lines 1994-1998 — the snapshot-block catch.

The sibling unit got this right: `restoreOverwriteUnit`'s `failWith` (lines 1322-1328) ends with `await release()`, and `runRestore`'s `finally` (lines 1798-1812) always releases for the import path. Only the DR unit is missing it. The boot sweep (`sweepStaleRestoreRuns`, `server.js:3740-3748`) heals it only at reboot.

**Reachability is ordinary UI flow:** the restore list includes `missing`-location rows (`server.js:9173-9174`); the DR CTA renders for any instance-scope preview for a Super Admin (`src/pages/backup.js:377`); the DR route checks the run row but NOT local file existence before claiming the lock. Result: one click on a rotated-away archive leaves `restore_lock.claimed_by` set — every subsequent restore trigger 409s (`server.js:9269-9278`) and every backup run, manual (`server.js:9031`) and scheduled (`server.js:3698`), is refused with `skipped_overlap` until restart. That is a mutual-exclusion deadlock caused by the mutual-exclusion machinery itself.

**Fix:**

```js
// export/restore.js — restoreInstanceUnit: mirror the overwrite unit's funnel
const release = async () => { if (releaseLock) { try { await releaseLock(); } catch { /* best-effort */ } } };
const failWith = async err => {
  const code = typeof err?.code === 'string' ? err.code : null;
  const persisted = code ? `${code}: ${err.message}` : err.message;
  await emitRestoreEvent({ kind: 'fail', runId, error: persisted, finishedAt: Date.now() });
  await release();
  return { ok: false, runId, code: code ?? 'restoreFailed', error: persisted };
};
```

(the `release` helper currently defined at line 2005 must be hoisted above `failWith`; the inner paths' existing explicit `cleanup(); await release();` calls remain harmless no-ops). Add a regression cell: claim the lock via the DR route with an archive whose local file is gone, assert `restore_lock.claimed_by is null` after the run row flips to `failed`.

## Warnings

### WR-01: DR team_members rows skip the team_id validation the overwrite path enforces — NULL crashes the whole DR tx unkeyed; dangling team refs insert silently

**File:** `export/restore.js:2117-2124`
**Issue:** `restoreOverwriteUnit` validates archive team_members with `!r.team_id || !teamIds.has(r.team_id)` → skip+report (`export/restore.js:1508-1514`). `restoreInstanceUnit` validates only `user_id` liveness and keeps `teamId: r.team_id ?? null`. `team_members.team_id` is `text not null` (`db-adapter.mjs:232`), so a single malformed archive row makes the entire DR transaction fail on the raw NOT NULL constraint — rolled back fail-closed, but the persisted error is a SQL constraint message, not a keyed class (D-89-33 contract), and the overwrite path's team-set containment (`teamIds.has`) is absent here, so dangling `team_id` rows (referencing no doc team) insert without even a skip count.
**Fix:** mirror the overwrite gate: `if (!r.user_id || !liveUserIds.has(r.user_id) || !r.team_id || !teamIds.has(r.team_id)) { teamMembersSkipped += 1; continue; }` where `teamIds` is the union of archive doc `teams[].id` per workspace.

### WR-02: DR member_id dedupe is global across workspaces, but member_id is per-workspace scoped — valid roster rows get skipped

**File:** `export/restore.js:2098-2113`
**Issue:** `usedMemberIds` is one `Set` shared across ALL archive workspaces' memberships. In the schema, `member_id` carries no uniqueness constraint (`db-adapter.mjs:221-229`, PK is `(workspace_id, user_id)`) and every server-side resolution reads it filtered by `workspace_id` (`server.js:1458`, `2389-2392`, `2658`) — i.e. it is per-workspace state. Two workspaces legitimately reusing the same member_id string (the base form is derived as `m_<8-slice of user id>`, so cross-workspace collisions are likely for short-id users) force the fallback `m_<user_id>`, and a second collision **skips the membership row entirely** — silent roster loss in the DR path, misreported as a skip.
**Fix:** scope the dedupe per workspace (e.g. `Map<wsId, Set<memberId>>`), or drop the global set and dedupe only within `r.workspace_id`.

### WR-03: DR `delete from workspaces` silently cascade-deletes api_keys — an undisclosed destructive side effect outside the D-89-7 skip report

**File:** `export/restore.js:2245` (with `db-adapter.mjs:320-323`)
**Issue:** the DR transaction deletes every workspaces row; `api_keys.workspace_id` is `references workspaces(id) on delete cascade`, so all users' API keys are destroyed — operational data the D-89-7 skip report explicitly claims is "never restored" (implying preserved, not destroyed). Meanwhile `group_mappings` deliberately survives with dead `workspace_id`s (D-82-6). The summary (`export/restore.js:2319-2329`) reports neither effect: an operator reading the run report cannot know API keys were revoked. Also inconsistent with the overwrite unit, which never deletes workspaces rows and thus never cascades.
**Fix:** either delete `api_keys` explicitly with a summary line (honest disclosure), or preserve them, or revoke-and-report (`update api_keys set revoked_at = ? where workspace_id not in (archive ids)`) — any of the three, as long as the run summary and/or audit trail says what happened to credentials.

### WR-04: all three restore units buffer staged ndjson whole into memory — violates the module's own P3 posture, OOM risk on large operational tables

**File:** `export/restore.js:962` (import), `:1421` (overwrite), `:2048` (instance)
**Issue:** each unit reads staged tables with `fs.readFileSync(file, 'utf8').split('\n')` plus a per-row `JSON.parse`. The reader half of this very module is explicitly memory-bounded ("entry data blocks are counted past, NEVER accumulated" — P3), and the writer paginates at `PAGE_SIZE = 500` — but the restore consumer reads whole tables into RAM. Operational tables (`audit_log`, `security_log`, `webhook_deliveries`, `email_outbox`) are unbounded-by-design append logs; restoring an instance archive whose `audit_log.ndjson` is hundreds of MB (or GBs) on the single-process server is an out-of-memory crash, and it happens *after* the pre-restore snapshot on the destructive paths. The read-back is required by the D-89-30 count-vs-manifest verification, but the buffering is not.
**Fix:** stream the ndjson with `fs.createReadStream` + `readline` (or a chunked split-state parser), `JSON.parse`-ing and counting line-by-line — keep only the rows actually needed (workspace-scope: filter rows to `scope.id`/the target project; instance DR: all workspaces rows must be retained for the tx, so spill the parsed rows to a bounded structure or accept the resident set for DATA tables only and stream the operational tables pure-count, since they are never inserted).

## Info

### IN-01: dead code — import-as-new member_id collision fallback can never fire

**File:** `export/restore.js:1113-1115`
**Issue:** the `select 1 from memberships where workspace_id = ? and member_id = ?` check runs on a workspace created microseconds earlier by `crypto.randomUUID()` and inserted one statement later — no memberships can exist yet, so the fallback to `m_<full id>` is unreachable. Harmless, but it suggests a guard copied from the overwrite unit where the set is genuinely populated.
**Fix:** delete the check or comment why it exists (defense against a deterministic-uuid environment).

### IN-02: project-scope splice resolves member ids against one variant; the overwrite unit resolves against two

**File:** `export/restore.js:837` vs `:1502-1504`
**Issue:** `planRemap` project scope keeps `comment.memberId` only when it equals `memberBase(operatorId)` (`m_<8-slice>`), while the overwrite unit's `validMemberIds` includes both `m_<8-slice>` and `m_<full>` variants (the collision fallback shape the executor can actually produce). A project splice into a workspace where the operator's membership member_id is the full-id form drops the operator's own comment attributions.
**Fix:** build the same two-variant set in `planRemap` (needs `isLiveUser`-style context or both variants of `operatorMemberId` passed in).

### IN-03: `notifs` / `activity` / `events` ferry stale member_id references verbatim

**File:** `export/restore.js:734-736` (import), `:1553-1555` (overwrite)
**Issue:** the doc-remap discipline (Pitfall 4 / P6) drops `comment.memberId`/`assignees` that don't resolve to the restored roster — but `notifs[].to`, `activity[]` and `events[]` pass through filtered only on "is a string"/"is an object". Archived member ids from a foreign roster land in the fresh/target doc; server reads map `n.to` through the live membership table (`server.js:2504`), so they resolve to nothing. Not a security issue (read paths tolerate it), but it contradicts the stated "never ferried" doctrine and accumulates dead data.
**Fix:** apply the same roster-resolution filter to `notifs[].to` (and note `activity`/`events` as intentionally verbatim history, or filter their member fields too).

### IN-04: overwrite summary omits flagged (missingBlob) file restorations that the import summary reports

**File:** `export/restore.js:1710` vs `:1202`
**Issue:** import-as-new reports `files: { restored, missingBlob }`; the overwrite summary reports only `{ swapped, removed }`. A workspace archive that carried flagged missing blobs restores doc `files[]` entries pointing at blobs that do not exist, with zero mention in the run report — a report-honesty gap against the phase's own D-89-7 standard.
**Fix:** count flagged rows overlapping the doc's file id set and add `missingBlob` to the overwrite summary (and to DR's, same shape).

### IN-05: backup archive-name collision guard gives up at 100 and then clobbers

**File:** `export/backup.js:756-764`
**Issue:** the 89-05 uniquifier loop stops at `uniquifier < 100`; past that, `fs.renameSync` overwrites the existing archive — exactly the backup loss the guard was added to prevent. Practically unreachable (100 same-second same-suffix collisions), but the failure mode is silent data destruction rather than a keyed failure.
**Fix:** after the loop, if the destination still exists, throw a keyed error (fail the run) instead of renaming over it.

### IN-06: swap staging collides when a file id and a logo id share a value

**File:** `export/restore.js:1571` (overwrite), `:2180` (DR)
**Issue:** both units stage every blob under `swapDir/files/<id>` regardless of the `logo` flag before copying to the per-kind dest. An id present as both a file and a logo clobbers the first stage; both dests then receive the same bytes. Degenerate (requires one id in both namespaces) and sha-verified upstream, but the staging key costs nothing to make exact.
**Fix:** `stage: path.join(swapDir, row.logo ? 'logos' : 'files', String(id))`.

### IN-07: pre-existing 5-locale parity debt (not introduced by this phase)

**File:** `src/locales/fr.json` (vs de/en/es/nl)
**Issue:** 41 keys (`webhook.*`, `templates.*`, `contract.englishOnly`/`frenchOnly`) exist only in fr. Verified via the diff: none of these keys were added by phase 89 — the phase's own 49 keys have full parity in all five locales (checked programmatically). Recorded here so the debt is visible; per the phase rule this is not a 89 finding.
**Fix:** out of phase scope — schedule a locale-debt sweep.

### IN-08: closing the preview drawer leaves `S.ui.restoreTarget` armed

**File:** `src/actions/actions.js:5312-5316`
**Issue:** `A.restorePreviewClose` resets the drawer state but not `S.ui.restoreTarget`, so a target picked for one project archive rides into a later preview/trigger. For a workspace-scope restore the server ignores `targetWorkspaceId`, and `A.restoreNew` only consults it for project scope, so impact is limited to a surprising pre-selection in the next project preview. The trigger-success path (`:5337`) does clear it.
**Fix:** clear `S.ui.restoreTarget = null` in `A.restorePreviewClose` (and on drawer open in `A.restorePreview`).

### IN-09: engine-side pre_restore audit rows record actor_name 'unknown'

**File:** `export/restore.js:1262-1280` with `server.js:9374`/`:9474`
**Issue:** both destructive routes pass `operator: { id: user.id, email: user.email }` — no `name` — so `dbRunAudit` writes `actor_name = 'unknown'` into `audit_log` for the `restore_snapshot_started:pre_restore` markers, degrading the audit trail relative to the server-side `auditBackupTask` writes on the same flow.
**Fix:** pass `name: user.name` in the route-built operator objects (one-line each).

---

_Reviewed: 2026-11-23_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
_Verification: phase test suites executed during review — 193 pass / 0 fail; locale parity verified programmatically (49/49 phase keys × 5 locales)._
