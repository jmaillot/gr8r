---
phase: 90
plan: 90-02
subsystem: backup
tags: [backup, download, checksum, streaming, i18n, s3]
requires:
  - 88-01 (S3 upload + downloadToStaged seam)
  - 89-02 (restore-staging dir + preview route funnel)
  - 89-06 (restore client surface + RESTORE_REFUSAL_TOASTS map)
  - 87-04 (history card + open-history refresh)
provides:
  - GET /api/backup/download (tiered streaming archive download)
  - POST /api/backup/verify-checksum (full re-hash, result-persisting)
  - backup_runs.checksum_ok + checksum_checked_at (nullable, engine-neutral trio)
  - history payload location/uploaded/checksum fields + client chrome (badge, download CTA, verify CTA)
affects:
  - 90-03 (verification sweep consumes the new routes/chrome)
tech-stack:
  added: [] # zero new npm dependencies (D-33-11)
  patterns:
    - verbatim guard-funnel copy (preview route → download route)
    - awaited pipeline streaming + rm-finally (staged temp never outlives the response)
    - payload-flag chrome (client renders server-derived flags, derives nothing)
key-files:
  created:
    - test/backup-download.test.mjs
    - test/backup-checksum.test.mjs
  modified:
    - server.js
    - export/backup.js
    - db-adapter.mjs
    - src/pages/backup.js
    - src/actions/actions.js
    - src/core/api.js
    - src/locales/en.json
    - src/locales/fr.json
    - src/locales/de.json
    - src/locales/es.json
    - src/locales/nl.json
    - test/backup-history-client.test.mjs
    - test/client-surfaces.test.mjs
    - test/i18n-core-features.test.mjs
    - test/i18n-shell.test.mjs
    - test/i18n-toast.test.mjs
decisions:
  - "Streaming uses awaited pipeline(fs.createReadStream, res) — the house pipe-and-forget idiom was rejected because a non-awaited pipe would race the finally rmSync of the staged temp"
  - "History payload projects location/uploaded/checksum fields but NOT raw scope JSON — the pre-existing D-14 projection contract (pinned in backup-scheduler.test.mjs) wins over the plan's additive scope field; scope has zero client consumers and the instance tier is enforced server-side"
  - "Verify-checksum result discloses only ok + checkedAt; the instance-scope binary restriction stays exclusive to the download route"
  - "Checksum mismatch is a 200 RESULT (ok:false), never a refusal — the durable keyed badge is the feedback; both outcomes persist with a server timestamp"
  - "Refusal toasts wrap restoreToast() in toast() — restoreToast returns a string and the click delegation discards handler return values (house idiom, restoreRun et al.)"
metrics:
  duration: 49min
  completed: 2026-11-23
status: complete
actuals:
  tokens: 32532 # chars/4 over the realized diff (130127 chars)
  tasks: 3
  commits: 4
commits: 4
plan_head_before: 84331f6fdbe3cfe2c9722af05950956cb22c4699
plan_head_after: 2daeae777a52b3ce87428da303984e780633248a
---

# Phase 90 Plan 02: Archive Download + Verify-Checksum Summary

Tiered streaming archive download (Super-Admin-only instance tier, S3 seam with rm-finally) + full-rehash verify-checksum route persisting results into two new nullable backup_runs columns, wired to payload-gated client chrome (location badge, download CTA, busy verify CTA, durable keyed badge) across 5 locales.

## Tasks Delivered

| Task | Name | Commit | Key files |
| ---- | ---- | ------ | --------- |
| 1 | Archive download spine (route + CTA + locales) | 9ffe7dd0 | server.js, src/pages/backup.js, src/actions/actions.js, src/locales/*.json (×5), test/backup-download.test.mjs |
| 2 | Verify-checksum route + schema trio | 33ad667b | export/backup.js, server.js, db-adapter.mjs, test/backup-checksum.test.mjs |
| 3 | Verify-checksum client chrome + payload fields | 07457c73 | src/pages/backup.js, src/actions/actions.js, src/core/api.js, src/locales/*.json (×5), server.js |
| — | Contract-carry fix (D-14 projection + pin flip) | 2daeae77 | server.js, test/backup-download.test.mjs, test/client-surfaces.test.mjs |

## What Was Built

**Download route** — `GET /api/backup/download?runId=` with the guard funnel copied VERBATIM from the preview route in house order: sameOrigin → requireUser → throttle `backupdownload|<user>` 10/15min (refused attempt consumes a try, D-89-22) → capability BACKUP_MANAGE ‖ RESTORE_USE → runId regex → row lookup → scope parse → instance-scope Super-Admin gate (backupDownloadAdminOnly, audited, AFTER role gate BEFORE location resolution — T-90-02) → location resolution. Local leg streams straight off BACKUPS_DIR (zero staging, D-90-8); S3 leg rides the 88-01 downloadToStaged seam with the staged temp removed in a finally AFTER the awaited pipeline (D-89-16). Content-Disposition through fileDisposition (the only header-escaping path, D-90-8). Success-only audit `backup_download:<runId>`; every refusal audits `backup_download_refused:<code>` (D-90-10).

**Verify-checksum route** — `POST /api/backup/verify-checksum` body `{runId}`: throttle `verifychecksum` 10/15min BEFORE the capability gate; preview-tier capability, no scope-kind restriction (the response discloses only ok + checkedAt). Local leg via the now-exported `sha256AndSize` (hash-on-the-pipe); S3 leg via downloadToStaged — the seam's keyed sha256Mismatch throw IS the verify result, caught and persisted, never a 5xx. A mismatch is a 200 RESULT (`ok:false`), not a refusal; BOTH outcomes persist `checksum_ok` (null/1/0) + `checksum_checked_at` (server ISO) so the badge re-renders payload-derived.

**Schema trio** — `checksum_ok integer` + `checksum_checked_at text` (nullable, no default = never checked) landed byte-identical in the server.js SCHEMA def, the boot adapterEnsureColumn pair, and the db-adapter.mjs pg twin. Engine-neutral defs only (G-89-2); existing rows default null via ensureColumns — no data migration.

**Client chrome** — history rows carry server-derived `location` + `uploaded` (+ checksum fields); runRow renders a location badge reusing the restore loc* keys (accent for s3), a download CTA rendered ONLY for payload location local‖s3 (missing run = zero CTAs, never a disabled dead button — D-90-9), and a verify CTA with busy state (disabled + aria-busy + keyed checksumChecking label swap + row aria-busy) whose result is the durable keyed badge (green checksumOk / red checksumFail) + faint checksumLastCheck server timestamp — NO toast on the result path. `A.backupDownload` rides the one download path (Blob + Content-Disposition → saveBlob); `A.backupVerifyChecksum` goes through `api.backupVerifyChecksum` with refusals via the closed RESTORE_REFUSAL_TOASTS map and the persisted result re-rendered through the 87-04 open-history refresh. The only client state is `S.ui.backupChecksumBusy`.

**i18n** — 7 keys × 5 locales (downloadAction, verifyChecksumAction, checksumChecking, checksumOk, checksumFail, checksumLastCheck, err.backupDownloadAdminOnly), same-commit as the emitting markup per task (D-90-20/D-12); fr carries U+2019 apostrophes and the U+00A0-before-colon rule; ledger +2 (task 1) +5 (task 3); verbs pin 75→76; data-a pin 613→614→615.

## Verification

- `node --test test/backup-download.test.mjs test/backup-checksum.test.mjs` offline: 12 pass / 2 skipped (MinIO-gated)
- With `MINIO_TEST_URL=http://127.0.0.1:9001`: **14/14 pass** — including the S3 e2e legs (download 200 with byte-identical re-hash + staging emptied; verify 200 ok:true + row persisted + staging emptied)
- pg-matrix trio per-file with `POSTGRES_TEST_URL`: db-adapter 32/32, pg-matrix 10/10, copy-sqlite-to-pg 5/5 (SCHEMA mirror pin green — the trio is byte-identical modulo comments/whitespace)
- Full `npm test`: **2327 pass / 2 fail / 23 skipped** — the 2 failures are the documented pre-existing ones (french-typography Phase-88 S3 keys; webhook-routes health, deferred-items.md)
- `node scripts/i18n-scan.mjs`: 0 dead / 0 stale / 0 pending

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A.backupDownload refusals were silent**
- **Found during:** Task 3 (verifying the refusal idiom against the house callers)
- **Issue:** Task 1's `return restoreToast(data?.code, data?.error)` returns a string — but the click delegation (`src/actions/events.js:35`) calls `fn(el, e)` and discards return values, so refused downloads showed no toast at all.
- **Fix:** wrapped in the house idiom `toast(restoreToast(...), { kind: 'err' })`; same fix applied to the new A.backupVerifyChecksum with `res.error` (call()'s refusal envelope drops `data`, carrying the centrally translated message in `.error` — restoreToast resolves through tErr's raw fallback).
- **Files modified:** src/actions/actions.js
- **Commit:** 07457c73

**2. [Rule 1 - Contract] History payload scope projection collided with the D-14 pin**
- **Found during:** Plan verification (full npm test)
- **Issue:** The plan mandated projecting parsed `scope` on the history payload, but the pre-existing D-14 projection contract (test/backup-scheduler.test.mjs:370, "internal scope JSON is not projected") forbids it — and scope has zero client consumers (the chrome gates only on the server-derived `location` flag, which doesn't even need scope for its derivation; the instance tier is enforced server-side).
- **Fix:** scope removed from both history SELECTs and the projection; the payload carries location + uploaded + checksum fields. The stricter existing security contract wins; documented here for the verifier.
- **Files modified:** server.js, test/backup-download.test.mjs
- **Commit:** 2daeae77

**3. [Rule 1 - Contract] Phase-85 "no download action" prohibition pin**
- **Found during:** Plan verification (full npm test)
- **Issue:** test/client-surfaces.test.mjs:265 pinned `doesNotMatch /data-a="backupDownload"/` — a v1 prohibition that Phase 90 (this plan) exists to fulfill.
- **Fix:** the pin flips to the ownership pin (D-12 same-commit discipline): the CTA must exist on the history rows, and runProgress's done detail still renders filename + sha256 as text with NO download CTA (the original intent preserved on the stage card).
- **Files modified:** test/client-surfaces.test.mjs
- **Commit:** 2daeae77

**4. [Rule 3 - Blocking] runSchema ';-newline' comment hazard**
- **Found during:** Task 2 (server boot failed with "incomplete input" — runSchema splits statements on `/;\s*\n/`)
- **Issue:** SCHEMA comments ending a line with `;` truncate the CREATE TABLE statement. The first fix attempt reproduced the hazard in its own comment.
- **Fix:** schema comments rewritten to never end a line with a semicolon (both server.js and db-adapter.mjs), with the constraint noted in the comment itself.
- **Files modified:** server.js, db-adapter.mjs
- **Commit:** 33ad667b

### Auth gates

None.

## Known Stubs

None — every CTA is wired to a real route, every route persists/streams real data, and the S3 legs run against live MinIO in the gated suites.

## Threat Flags

None — the two new routes are exactly the surfaces the plan's threat model covers (T-90-02 tiering bypass mitigated: instance gate audited, AFTER role gate, BEFORE location resolution, no pre-gate oracle; fileDisposition is the only header-escaping path; filenames sourced from exporter-written DB rows only). No new endpoints, auth paths, or trust boundaries beyond the plan.

## Self-Check: PASSED

- test/backup-download.test.mjs, test/backup-checksum.test.mjs exist on disk
- Commits 9ffe7dd0, 33ad667b, 07457c73, 2daeae77 all present in `git log`
- 4 commits measured from ledger 84331f6f..HEAD (git rev-list --count)
