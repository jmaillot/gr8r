---
phase: 108-restore-probing-run-attribution-closeout
verified: 2026-11-28T13:57:26Z
status: verified
score: 4/4 success criteria verified
verdict: VERIFIED WITH NOTES
re_verification: no
---

# Phase 108: Restore Probing, Run Attribution & Closeout — Verification Report

**Phase Goal:** The probe badge verifies the run's archive exists on the leg; run history shows who restored; the two small SSO/docs items land.
**Verified:** 2026-11-28T13:57:26Z
**Verdict:** VERIFIED WITH NOTES (all 4 SCs verified in code + tests; notes are residual UAT-level items, not gaps)
**Commits audited:** 265c22d6, 5cfb11e1, f5ba2202, 2c6a87d1, c9d42b74, efe1f392, ddaa48bd, 732e8f3b (diff base 2e619ef0 — all present in `git log`)

## Per-Criterion Evidence

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| SC-1 | Stat semantics: reachable+missing third state; present/unreachable unchanged; single-source key derivation | ✓ VERIFIED | `restoreRemoteKey` (export/restore.js:1386) is the single derivation — consumed by `resolveRestoreSource` (:1496) and by the stat route (server.js:10387 `restoreRemoteKey(source, row)`). Three seams keyed three-state: `statS3` (export/s3.js:327 — `headObject` maps **`err.s3Status === 404` FIRST** to `present:false`, everything else → `unreachable: mapProbeError(...).key`; HEAD-bodyless trap documented at s3.js:312-320); `statFtp` (export/ftp.js:621 — `ftp.size()`; **550 → `present:false`** via `ftpPathNotFound`; other codes verbatim `unreachable`); `statSmb` (export/smb.js:1620 — **`smbClass === 'pathNotFound'` → `present:false`**, where 0xc0000034 = STATUS_OBJECT_NAME_NOT_FOUND (smb.js:589), 3a/56 additionally mapped per DSM ruling). Present/unreachable semantics of the 104 probe route untouched (probe-count pin holds at exactly 12 — test/restore-source-param.test.mjs:914). Route: POST /api/backup/restore/stat (server.js:10324), result mapping at server.js:10393-10397 (`archivePresent`/`archiveMissing`/class-verbatim). |
| SC-2 | Attribution: run card shows operator, legacy `—`, DDL = adapterEnsureColumn only, write-once, exactly 3 emit sites | ✓ VERIFIED | `adapterEnsureColumn('restore_runs','created_by','text')` at server.js:1166 — adjacent to the archive_name precedent (:1159); schema block and PG_EPOCH_COLUMNS untouched (grep: no epoch registration for created_by; test-pinned in restore-created-by.test.mjs). Exactly 3 emit sites carrying `createdBy: user.id` (server.js:11033 import_new, :11141 instance, :11293 overwrite — `grep -c` = 3). Writer start-insert stamps created_by (:3884-3885); **write-once holds** — all 4 `update restore_runs` statements (:3889/:3898/:3904/:4170) never touch created_by. Runs GET left join `u.name as created_by_name` (:11351-11352, legacy NULL rows join nothing). Client: Trigger cell backup.js:827 — `run.created_by_name ? esc(...) : '—'`, initiatorLabel title. Locales: initiatorLabel ×5 (grep = 1 per locale file). |
| SC-3 | SSO one fixed non-interpolated line; DEPLOY.md row verbatim | ✓ VERIFIED | Outer catch at server.js:7229 — `catch {` binds **no error variable**, one fixed non-interpolated `logWarn('sso callback: token exchange or verification failed; redirecting to generic error')` (:7248), then `errorRedirect()`. Inner oidc_identities catch (:6815) untouched — still rethrows non-UNIQUE SQL errors. DEPLOY.md:352 row present: "One user fails sign-in where another succeeds → Azure AD omits the optional `email` claim … → App registration → Token configuration → Add optional claim → `email`". |
| SC-4 | No marker PUT/DELETE traffic from stat (NAS-observable) | ✓ VERIFIED (protocol level) | All three stat seams are pure read-only frames: S3 `HEAD` only (s3.js — `statS3`/`headObject` contain no PUT/DELETE path); FTP `SIZE` only (ftp.js:621 — connect+size+quit, no stor/dele); SMB `CREATE(FILE_RIGHTS_R 0x00120089 + FILE_OPEN_IF, NO createOptions)` + immediate CLOSE — frame-level pin asserts NO READ frame and NO delete-on-close (test/restore-stat.test.mjs:199-216, live scripted NBSS server). Route reads flags only (`select id, task_id, filename, uploaded, ftp_uploaded, smb_uploaded from backup_runs` — the extended 13-SELECT pin) — no clearMirrorFlag, no run-row write, no lock, no staging. **Flags byte-identical after stat: test-pinned and passing** (restore-stat.test.mjs:277 route test). |
| D-89-14 | Extended, NOT weakened | ✓ VERIFIED | `assert.equal(probeCount, 12, '…D-89-14 untouched')` — test/restore-source-param.test.mjs:914, green in the run below. Parallel stat-seam pin: 3 stat sites + allowed route + list-GET slice clean (same file, green). Throttle separation `restorestat\|` vs `restoreprobe\|` **test-pinned and passing** (restore-stat.test.mjs:368-386 — live probe not drained by stat budget). |

## Standing Gates

| Gate | Verdict | Evidence |
|------|---------|----------|
| Zero new deps | ✓ | `git diff 2e619ef0..HEAD -- package.json` = empty |
| Locale parity ×5 | ✓ | sourceStatCheck/sourceStatChecking/sourceProbeMissing = 3 keys × 5 locale files; initiatorLabel ×5; `npm run i18n:scan` claimed clean in SUMMARY (not re-run — pin tests green) |
| Audit shapes unchanged | ✓ | Stat rides `restore_stat_ok`/`restore_stat_failed:<source>` with detail = `result.key` ONLY (server.js:10392); test asserts `target_name === 'archivePresent'/'archiveMissing'`, no credentials; refusals reuse the probe `restore_stat_refused:*` family — no new err.* keys (test green) |
| Full suite baseline | ✓ (per SUMMARY) | 2836 tests / 2803 pass / exactly the 2 documented pre-existing failures (french-typography baseline content, webhook-routes GET list) — claimed in 108-02 SUMMARY; targeted suites re-run below, full suite not re-run by verifier |
| esc() on rendered name | ✓ | backup.js:827 — `esc(String(run.created_by_name))`; regex pins in restore-client.test.mjs |

## Behavioral Spot-Checks (run by this verifier)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Stat + attribution + D-89-14 suites | `node --test test/restore-stat.test.mjs test/restore-created-by.test.mjs test/restore-client.test.mjs test/restore-source-param.test.mjs` | **78 tests, 78 pass, 0 fail** (incl. S3 HEAD 404→missing, FTP 550→missing, SMB 0xc0000034→missing, frame-level read-only pin, flags byte-identical, throttle key separation, probe count === 12) | ✓ PASS |
| Emit-site count | `grep -c "emitRestoreRunEvent({ kind: 'start'" server.js` | 3 | ✓ PASS |
| Write-once | grep `update restore_runs` | 4 statements, none touch created_by | ✓ PASS |
| Deps / goldens | `git diff --stat` over range | package.json empty; no golden-file changes | ✓ PASS |

**Real-test check (criterion 7):** The stat matrix drives REAL seams — S3 against a live HTTP sink server asserting HEAD semantics, FTP against a live fake FTP server (SIZE/550 paths), SMB against the scripted NBSS frame server with per-frame DesiredAccess/CreateDisposition recording, and the route end-to-end through login with live flag reads and audit assertions. The created_by matrix drives REAL routes: all 3 trigger-route emit sites asserted with route-scoped `user.id`, the actual start-insert SQL asserted, the runs GET left-join select asserted, plus DDL-site adjacency/epoch-registry/schema-block static asserts in restore-created-by.test.mjs (6/6 green in the run above).

## Requirements Coverage

| Requirement | Plan | Verdict | Evidence |
|-------------|------|---------|----------|
| CARRY-01 | 108-01 | ✓ SATISFIED | stat seams + route + three-state badge + read-only + D-89-14 pins (above) |
| CARRY-02 | 108-02 | ✓ SATISFIED | created_by chain end-to-end (above) |
| CARRY-03 | 108-02 | ✓ SATISFIED | fixed logWarn, unbound catch (above) |
| CARRY-04 | 108-02 | ✓ SATISFIED | DEPLOY.md:352 row verbatim |

No orphaned requirements — REQUIREMENTS.md maps CARRY-01..04 to Phase 108 only.

## Notes (why "WITH NOTES" — advisory, not gaps)

1. **SC-4 "NAS-observable" is verified at protocol/frame level, not on real hardware.** The SMB pin asserts the exact wire frames (FILE_RIGHTS_R + FILE_OPEN_IF, no READ, no delete-on-close) against the Phase-99 scripted NBSS server, and S3/FTP ride their real command paths (HEAD / SIZE) against live sockets — this is the strongest programmatic evidence available without a NAS. A one-time check on real hardware (watch the share/S3 bucket traffic while clicking stat) remains a sensible UAT item for `/gsd-verify-work`.
2. **Full suite not re-run by the verifier** (constraint: one full-suite run max, and 2 pre-existing failures are documented in both SUMMARYs with exact identity). The 4 phase-relevant suites were re-run fresh: 78/78 green.
3. **Visual/third-state badge and operator-column rendering in the running UI** are pinned by client tests (esc, `—` fallback, badge keyed states) but a human eyeball of the badge's three states on a real run card belongs to UAT.

## Milestone-Closeout Readiness

- All 4 CARRY requirements satisfied and verified; requirements checkboxes in REQUIREMENTS.md can be ticked.
- Full suite at documented baseline (2836 / 2 pre-existing failures); no stubs; zero new dependencies; D-89-14 pins extended-not-weakened and green.
- **v3.7 is ready for `/gsd-verify-work` (Phase 108 UAT) and then `/gsd-complete-milestone`** — no verification-level blockers.

---

_Verified: 2026-11-28T13:57:26Z_
_Verifier: the agent (gsd-verifier)_
