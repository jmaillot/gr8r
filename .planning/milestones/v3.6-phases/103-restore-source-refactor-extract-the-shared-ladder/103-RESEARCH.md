# Phase 103: Restore-Source Refactor — Extract the Shared Ladder — Research

**Researched:** 2026-11-27
**Domain:** Mechanical refactor of the staged-fetch ladder in server.js + export/restore.js (zero-dependency Node.js, zero new packages)
**Confidence:** HIGH — every claim below was read out of the live tree this session; all provenance is `[VERIFIED: path:lines]` with verbatim quotes.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RSRC-01 | The three duplicated staged-fetch ladders collapse into ONE `resolveRestoreSource(row, source)` helper — byte-identical behavior, golden-pinned over s3 > ftp > smb + local fallback; no `source` param | Ladder sites verified verbatim (see Drift Verdict — NOTE: today's sites are preview/download/verify-checksum in server.js plus three unit ladders in export/restore.js; the REQUIREMENTS labels "overwrite/instance" are misnomers for the download/verify-checksum routes, proven below). Golden-test inventory + update surface mapped. |
</phase_requirements>

## User Constraints (from REQUIREMENTS.md / ROADMAP.md — no 103-CONTEXT.md exists)

### Locked Decisions (milestone rulings, verbatim)
- **R-5 Refactor before extension:** the ×3 duplicated staged-fetch ladder is extracted into one `resolveRestoreSource(row, source)` helper byte-identically (golden-pinned) BEFORE the `source` param lands (the ladder already drifted once — 2026-11-27 UAT fix). [VERIFIED: .planning/REQUIREMENTS.md:13]
- **RSRC-01:** golden tests pin s3 > ftp > smb ordering + local fallback; zero duplicated ladder logic remains; suite stays at baseline (2712 tests / 2 documented pre-existing failures: french-typography, webhook-routes GET list). [VERIFIED: .planning/REQUIREMENTS.md:33; .planning/phases/102-.../102-VERIFICATION.md:77 — "2712 tests, 2679 pass, exactly the 2 documented pre-existing failures (french-typography, webhook-routes GET list)". Note ROADMAP.md:82 still says 2672 — stale; 2712 is the fresher documented baseline.]
- R-4 flags-are-truth: availability derives server-side from run mirror flags (uploaded/ftp_uploaded/smb_uploaded). [VERIFIED: .planning/REQUIREMENTS.md:12]

### Agent Discretion (planner's call per phase context)
- Helper location (server.js local vs export/restore.js export), helper naming details, golden-test file placement — research supplies decision input (see "Helper Placement" below), planner decides.

### Deferred (out of scope)
- Anything `source`-param related (Phase 104), `sources[]` payload, probe route, SPA picker (Phase 105). Phase 103 adds NO param, NO behavior change, NO new dependency.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Source resolution (which destination serves the archive) | API/Backend (server.js routes + export/restore.js units) | — | The flag check + registry order + staged fetch are server-only authority (D-23 flags-are-truth) |
| Flag truth (uploaded/ftp_uploaded/smb_uploaded) | Database (backup_runs columns) | — | Written by the 96/98/100 upload arms; read-only here |
| HTTP refusal envelope (fail(res,...), audit tokens) | API/Backend (server.js) | — | Stays at the route — the helper must NOT own responses |
| Run-row failure persistence (emitRestoreEvent fail / failWith) | API/Backend (export/restore.js units) | — | Stays in the units |

## The Six Ladder Sites (verbatim inventory — drift verdict included)

### CRITICAL scope correction first

The ROADMAP/ARCHITECTURE anchors (preview :10826/:10842/:10857, overwrite :11004-11032, instance :11134-11168) are **stale AND mislabeled**. Proof: at the commit that created REQUIREMENTS.md (84a04b86), `git show 84a04b86:server.js` shows the ftp mirror leg comment "fetchToStaged in the **preview/download/verify** routes' ftp mirror leg" on the ftp import line [VERIFIED: git show 84a04b86:server.js, line 91]. Line numbers drifted +~100 lines (phases 101–102 added mappings code), and "overwrite/instance" were always the *download* and *verify-checksum* routes. Today, verified by grep over the live tree:

**Server.js HTTP-route ladders (3 sites — the RSRC-01 scope):**

| # | Route | Route start | Ladder span (verbatim-verified) | Anchors |
|---|-------|-------------|--------------------------------|---------|
| 1 | `GET /api/backup/restore/preview` | server.js:10859 | :10904–10958 | mirrorMissing :10923 (s3), fetchToStaged :10936 (ftp), fetchSmbToStaged + mirrorMissing :10953 (smb) |
| 2 | `GET /api/backup/download` | server.js:11039 | :11083–11130 | mirrorMissing :11100 (s3), fetchToStaged :11112 (ftp), mirrorMissing :11128 (smb) |
| 3 | `POST /api/backup/verify-checksum` | server.js:11176 | :11223–11270 | mirrorMissing :11233 (s3), fetchToStaged :11245 (ftp), mirrorMissing :11267 (smb) |

**export/restore.js unit ladders (3 more sites — same shape, different envelope):**

| # | Function | Ladder span | Anchors |
|---|----------|-------------|---------|
| 4 | `restoreOverwriteUnit` | restore.js:1652–1690 | downloadToStaged :1663+mirrorMissing, fetchToStaged :1669, fetchSmbToStaged :1685 |
| 5 | `runRestore` (import_new) | restore.js:2145–2190 | downloadToStaged :2151, fetchToStaged :2162, fetchSmbToStaged :2182 |
| 6 | `restoreInstanceUnit` | restore.js:2406–2460 | downloadToStaged :2419, fetchToStaged :2430, fetchSmbToStaged :2451 |

`grep fetchToStaged` confirms server.js has exactly 3 call sites (10936, 11112, 11245) — the restore POST routes (`/api/backup/restore` :10479, `/instance` :10596, `/overwrite` :10693) contain NO ladder; they delegate to the restore.js units. [VERIFIED: server.js fetchToStaged grep + route list at :9363–11176]

### Site 1 — preview (server.js:10904–10958), verbatim core

```js
      let archivePath = localPath;
      if (!hasLocal) {
        /* ... 2026-11-27 UAT (owner: the Restore dialog answered a bare
           "Internal server error" on an smb-located run): a TRANSPORT
           failure inside a staged fetch (DSM throttle, connection reset,
           fid churn) is a keyed 404 — never a bare throw → 500. ... */
        if (row.uploaded === 1) {
          if (!S3.enabled) {
            await auditBackupTask(user, 'restore_refused:restoreArchiveMissing');
            return fail(res, 404, 'restoreArchiveMissing', 'That backup archive lives in S3 but no S3 destination is configured');
          }
          let back = null;
          try {
            back = await downloadToStaged(S3.config(), s3BackupKey({ taskId: row.task_id }, row.filename), row.sha256, restoreStagingDir());
          } catch (err) {
            /* UAT 2026-11-27: a live fetch proving the object gone clears the mirror flag — the badge re-resolves honestly. */
            if (mirrorMissing(err)) await clearMirrorFlag(row.id, 's3');
            await auditBackupTask(user, 'restore_refused:restoreArchiveMissing');
            return fail(res, 404, 'restoreArchiveMissing', `That backup archive could not be fetched from S3 (${err?.code || err?.message || 'unknown'})`);
          }
          stagedPath = back.tmpPath;
          archivePath = back.tmpPath;
        } else if (row.ftp_uploaded === 1) {
          ...
          back = await fetchToStaged(FTP.config(), `backup-task-${row.task_id}/${row.filename}`, row.sha256, restoreStagingDir());
          ... if (mirrorMissing(err)) await clearMirrorFlag(row.id, 'ftp'); ... 'restore_refused:restoreArchiveMissing' ... 'could not be fetched from FTP (...)'
        } else {
          ... if (!SMB.enabled) → 'lives in SMB but no SMB destination is configured'
          back = await fetchSmbToStaged(SMB.config(), `backup-task-${row.task_id}/${row.filename}`, row.sha256, restoreStagingDir());
          ... clearMirrorFlag(row.id, 'smb') ... 'could not be fetched from SMB (...)'
        }
      }
```
[VERIFIED: server.js:10904–10958 — quoted verbatim this session; ftp/smb arms abbreviated only where byte-identical to the shown s3 arm shape]

Preceding gate (preview, verbatim :10898–10902):
```js
    const localPath = row.filename ? path.join(backupsRoot(), row.filename) : null;
    const hasLocal = !!localPath && fs.existsSync(localPath);
    if (!hasLocal && row.uploaded !== 1 && row.ftp_uploaded !== 1 && row.smb_uploaded !== 1) {
      await auditBackupTask(user, 'restore_refused:restoreArchiveMissing');
      return fail(res, 404, 'restoreArchiveMissing', 'That backup archive is gone from all destinations');
    }
```

### Site 2 — download (server.js:11083–11130), verbatim core

Same local→s3→ftp→smb else-if chain; differences from preview:
- Audit token prefix: `backup_download_refused:restoreArchiveMissing` (not `restore_refused:`).
- The flags gate sits INSIDE the `if (!hasLocal)` block (:11091–11094) and no `archivePath` variable — only `stagedPath = back.tmpPath` per arm (stream uses `stagedPath || localPath`).
- s3 leg carries the comment "The 88-01 seam re-verifies the digest on the stream-back itself — a mismatch refuses keyed before any byte reaches the client."
- Same three "lives in X but no X destination is configured" enablement refusals; same `could not be fetched from X (${err?.code || err?.message || 'unknown'})` messages; same mirrorMissing→clearMirrorFlag triple.
[VERIFIED: server.js:11083–11130]

### Site 3 — verify-checksum (server.js:11223–11270), verbatim core

Structurally DIFFERENT — this is the one real behavior divergence:
```js
          try {
            const back = await downloadToStaged(S3.config(), s3BackupKey({ taskId: row.task_id }, row.filename), row.sha256, restoreStagingDir());
            stagedPath = back.tmpPath;
            ok = back.sha256 === row.sha256; // the seam already refused on any mismatch
          } catch (err) {
            if (err?.s3Class === 'sha256Mismatch') ok = false;
            else if (mirrorMissing(err)) {
              await clearMirrorFlag(row.id, 's3');
              await auditBackupTask(user, 'backup_verify_refused:restoreArchiveMissing');
              return fail(res, 404, 'restoreArchiveMissing', `That backup archive could not be fetched from S3 (${err?.code || err?.message || 'unknown'})`);
            } else throw err;
          }
```
- Audit prefix `backup_verify_refused:restoreArchiveMissing`.
- A digest mismatch is a RESULT (`ok = false` via `s3Class === 'sha256Mismatch'` / `code === 'ftpSha256Mismatch'` / `code === 'smbSha256Mismatch'`), never a 4xx. [VERIFIED: server.js:11227–11270; result persistence `update backup_runs set checksum_ok = ?` :11272]
- `else throw err` on non-mirror non-mismatch errors — rethrow, unlike sites 1/2.
[VERIFIED: server.js:11227–11270]

### Sites 4–6 — restore.js units (overwrite :1652–1690, runRestore :2145–2190, instance :2406–2460), verbatim core (overwrite unit shown; the other two are the same shape)

```js
  if ((!archivePath || !fs.existsSync(archivePath)) && backupRun.uploaded === 1 && opts.s3Config && typeof opts.s3Config === 'object' && backupRun.filename) {
    try {
      const back = await downloadToStaged(opts.s3Config, s3BackupKey({ taskId: backupRun.taskId }, backupRun.filename), backupRun.sha256, restoreStagingDir());
      archivePath = back.tmpPath;
      stagedTmp = back.tmpPath;
    } catch (err) {
      dropStagedTmp();
      if (mirrorMissing(err)) await clearMirrorFlag(runId, 's3');
      return failWith(keyed('restoreArchiveMissing', `restore: archive not retrievable — local missing and the S3 seam failed (${err?.code || err?.message || 'unknown'})`));
    }
  }
  if ((!archivePath || !fs.existsSync(archivePath)) && backupRun.ftp_uploaded === 1 && opts.ftpConfig && typeof opts.ftpConfig === 'object' && backupRun.filename) { ... fetchToStaged(opts.ftpConfig, `backup-task-${backupRun.taskId}/${backupRun.filename}`, ...) ... clearMirrorFlag(runId, 'ftp') ... }
  if ((!archivePath || !fs.existsSync(archivePath)) && backupRun.smb_uploaded === 1 && opts.smbConfig && typeof opts.smbConfig === 'object' && backupRun.filename) { ... fetchSmbToStaged(opts.smbConfig, ...) ... clearMirrorFlag(runId, 'smb') ... }
```
[VERIFIED: export/restore.js:1660–1690; runRestore :2145–2190 uses `throw keyed(...)` instead of `return failWith(...)`; instance unit :2406–2460 identical to overwrite shape]

### Drift Verdict — EXPLICIT

**Behaviorally consistent across all six sites (the invariant):**
1. Registry order local-first, then s3 > ftp > smb, first resolvable wins — identical everywhere.
2. `mirrorMissing(err) → clearMirrorFlag(runId|row.id, '<dest>')` — present at all 6 sites ×3 legs. The 2026-11-27 UAT fix PROPAGATED: the fix is the `clearMirrorFlag` mechanism (restore.js:1310–1330 "UAT 2026-11-27 (owner ruling): mirror-truth maintenance") and the transport-404-with-detail message, present in every ladder leg at every site. The dated *comment* lives only at preview (:10908, :10922), overwrite unit (:1653), and runRestore (:2148) — comment presence drifted, behavior did not.
3. Key derivation identical everywhere: `s3BackupKey({ taskId }, filename)` / `backup-task-${taskId}/${filename}` for ftp+smb.
4. sha256 enforced inside each staged seam (downloadToStaged/fetchToStaged/fetchSmbToStaged) — never re-verified by the ladder.

**Genuine drift (what "byte-identical" must preserve per-site — the helper must parameterize these):**
| Dimension | Sites 1/2 (preview/download) | Site 3 (verify) | Sites 4–6 (units) |
|---|---|---|---|
| Refusal envelope | `return fail(res, 404, ...)` | `return fail(res, 404, ...)` / `ok=false` on sha mismatch / `else throw err` | `return failWith(keyed(...))` (overwrite/instance) or `throw keyed(...)` (runRestore) |
| Audit token | `restore_refused:` / `backup_download_refused:` | `backup_verify_refused:` | none (run-row error) |
| Disabled-destination behavior | keyed 404 "lives in X but no X destination is configured" | keyed 404 (same text) | **leg silently SKIPPED** (`opts.s3Config` falsy → gate false → falls through to "archive not found at the resolved path") |
| Flags gate | preview: gate BEFORE ladder; download: gate INSIDE !hasLocal; both keyed 404 "gone from all destinations" | keyed 404, message "gone from all destinations" | NO flags gate — ends "restore: archive not found at the resolved path" (overwrite/instance) / "at either destination" (runRestore) |
| Temp handling | route `finally { fs.rmSync(stagedPath, ...) }` | same | unit-owned `dropStagedTmp()` (overwrite/instance) or `finally unlinkSync` (runRestore) |
[VERIFIED: all rows read verbatim from server.js:10904–11270 and export/restore.js:1652–2460 this session]

**Consequence for the planner:** a single helper that OWNS refusals cannot be byte-identical across all sites. The viable extraction shape is: helper owns **selection + flag-check + staged fetch + mirrorMissing→clearMirrorFlag** and returns a structured result; each caller keeps its own refusal envelope, audit token, and sha-mismatch twist. Alternative scope-reduction (see Open Questions): extract only the three server.js route ladders (RSRC-01's literal ×3) and leave the units for Phase 104 — but the units are where the `source` param will land, so extracting them too in 103 is the R-5-preferred shape.

## Surrounding Context the Helper Must NOT Disturb (twin seam)

- **sha256 read-back twin seam:** every staged fetch enforces the digest inside the seam (s3 `downloadToStaged`, ftp `fetchToStaged` T-98-06, smb `fetchSmbToStaged` T-100-10); verify route additionally reads `back.sha256` [VERIFIED: server.js:11230–11232].
- **`dropStagedTmp` / staged-temp lifecycle:** D-89-16 "a fetched staged archive never outlives the run" — overwrite unit :1652, instance unit :2406, runRestore finally :2225, routes' `finally { fs.rmSync(stagedPath, { force: true }) }` (preview :10996-ish, verify :11277). Helper must keep temp assignment semantics identical (`stagedPath = back.tmpPath` only on success).
- **restore lock:** route claims `restore_lock` before firing units; unit ladders route failures through `failWith` specifically so the lock releases (89-05 CR contract). Helper must not bypass failWith in sites 4/6. [VERIFIED: restore.js:2376–2398]
- **`mirrorMissing`/`clearMirrorFlag`** are exported from export/restore.js:1317/1321 and imported into server.js:93. [VERIFIED]
- **`destLocation()`** (server.js:4057) is the badge scan — local > s3 > ftp > smb > missing over the same flags. It is the *canonical ordering reference* (T-96-04 destination-registry-gate pins the ordered-scan shape) but is NOT the ladder — do not merge them. [VERIFIED: server.js:4046–4062]
- **Destination enablement truth:** `S3.enabled ? S3.config() : null` etc., boot-frozen consts (D-05); units receive `opts.s3Config` from exactly that seam (server.js:10805). `null` config in the units means "leg skipped", in the routes `!S3.enabled` means "keyed 404". [VERIFIED: server.js:10805–10807, restore.js:1660]

## Existing Golden / Test Inventory (what's pinned today)

**Baseline:** 2712 tests, 2679 pass, exactly 2 documented pre-existing failures (french-typography, webhook-routes GET list). [VERIFIED: .planning/phases/102-.../102-VERIFICATION.md:77]

Most restore-gate "goldens" are **source-pattern tests** (they grep server.js/restore.js source text for gate strings and ordering) — these WILL break on extraction and must be updated in the same commit. Affected files (grep `serverSrc|restoreSrc` hit counts verified):

| Test file | Hits | What it pins that touches the ladder |
|---|---|---|
| test/backup-ftp-restore-gates.test.mjs | 12 | ftp twin gates inline in restore.js (`backupRun.ftp_uploaded === 1 && opts.ftpConfig`), local→s3→ftp ordering by indexOf, key derivation, "both restore triggers pass ftpConfig", select-columns count == 4, `ftp_uploaded: row.ftp_uploaded` ×3 |
| test/backup-smb-restore-gates.test.mjs | 14 | same shape for smb; rotated-row gate admission (UAT 2026-11-27); zero-badge-code pin |
| test/destination-registry-gate.test.mjs | 6 | destLocation ordered scan (local > s3 > ftp > smb > missing) — should survive untouched if destLocation isn't merged |
| test/backup-download.test.mjs | 1 | funnel-order pin in download route source + behavior tests (missing run → 404 restoreArchiveMissing) |
| test/backup-checksum.test.mjs | 0 source, but behavioral | verify-checksum route: ok=false is a RESULT never 4xx; missing run → 404 |
| test/restore-preview.test.mjs | behavioral | preview route ladder behavior (gone-both/all-destinations 404s, streamVerify refusals) |
| test/restore-instance.test.mjs, restore-overwrite.test.mjs | behavioral | unit-level: rotated-away archive refuses keyed restoreArchiveMissing AND releases lock (instance :557) |
| test/backup-history-client.test.mjs, restore-client.test.mjs | 1 each | RESTORE_LOCATION_KEYS badge vocabulary (client-side; unaffected) |

**Behavioral goldens that must keep passing unchanged (byte-identical definition input):** restore-preview :843 ("unknown runId and gone-both-destinations refuse keyed restoreArchiveMissing"), backup-download :182, backup-checksum :110/:151, restore-instance :557, restore-s3-e2e / backup-s3-e2e / backup-ftp-e2e / backup-smb-e2e (staged-fetch e2e legs). [VERIFIED: test names grepped this session]

**What does NOT exist yet** and Phase 103 must add: a dedicated golden test asserting the ONE helper's selection order (local fallback → s3 → ftp → smb) against flag matrices, and per-site byte-identity pins (same inputs → same dest/stagedPath/flag-clearing through preview, download, verify, and the three units).

## Helper Placement — decision input (planner's call)

- **Precedent for shared route helpers:** module-level functions in server.js near their consumers (`destLocation` :4057, `logProbeFailure` :4064). Precedent for engine-side shared logic: export/restore.js exports (`mirrorMissing` :1317, `clearMirrorFlag` :1321) imported into server.js:93.
- **Constraint:** if the units (sites 4–6) are in scope, the helper MUST live in export/restore.js — server.js cannot be imported by export/*.js (layering: export/ is the engine, server.js is the shell). server.js already imports 11 names from restore.js on line 93, so an export costs nothing.
- **Recommendation (research view):** export `resolveRestoreSource` from export/restore.js, signature `resolveRestoreSource(rowLike, configs)` returning `{ ok: true, dest: 'local'|'s3'|'ftp'|'smb', archivePath, stagedPath }` or `{ ok: false, dest, err }` where `err` carries `{ code: 'restoreArchiveMissing', message, mirrorLost: 's3'|'ftp'|'smb'|null }`; helper performs `mirrorMissing→clearMirrorFlag` itself (identical at all sites today) and the callers keep audit tokens/envelopes. If only the 3 route sites are extracted, a server.js-local helper beside `destLocation` is equally house-consistent — but that leaves the units duplicated into Phase 104, which R-5 exists to prevent.

## "Byte-identical" defined operationally (for the golden plan)

A golden asserts, for each route/unit and each flag matrix (hasLocal-only / uploaded-only / ftp-only / smb-only / s3+ftp both / all flags / no flags no local):
1. the selected dest is the registry-order first resolvable one;
2. the archivePath returned equals the local path when hasLocal, else the staged tmpPath;
3. no staged temp is created when local resolves;
4. a seam throw with mirrorMissing → exactly one `clearMirrorFlag(row.id, dest)` for that leg's dest and the caller's refusal (code, message template incl. `${err?.code || err?.message || 'unknown'}`, audit token) is unchanged — compare against pre-refactor captured strings;
5. verify-checksum keeps its `ok=false` sha-mismatch RESULT semantics and `else throw err` passthrough;
6. disabled destination: routes still emit "lives in X but no X destination is configured"; units still silently skip the leg (or the planner rules this the one allowed unification — needs an explicit decision because it IS a behavior difference, though only reachable when a flag is set while the destination is disabled at boot).

Golden file placement candidates (house precedent): a new `test/restore-source-resolution.test.mjs` (source-pattern pins + behavioral via the existing e2e harness style used in backup-ftp-restore-gates), extending the existing gates files' style. Pure node:test, `npm test` command: `node --test --test-concurrency=2 test/*.test.mjs`. [VERIFIED: package.json:19]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Digest verification of fetched archive | re-hash in helper | the staged seams (downloadToStaged/fetchToStaged/fetchSmbToStaged) | seam-enforced since 88-01/98/100; helper must not double-verify |
| Flag→destination badge | new derivation | `destLocation()` stays as-is | T-96-04 pins its shape; merging risks the registry-gate test |
| Mirror-truth clearing | ad-hoc flag updates | `mirrorMissing` + `clearMirrorFlag` (restore.js:1317/1321) | the UAT-2026-11-27 doctrine lives there |

## Common Pitfalls

1. **Updating the ladder in one site only** — the exact failure R-5 exists to prevent (2026-11-27 drift). Extraction makes the next edit single-site.
2. **Source-pattern goldens silently breaking:** the 12+14 structural assertions in backup-ftp/smb-restore-gates will fail the moment the inline gates move. Plan their rewrite in the same commit (house precedent: "knowingly-updated twins" per OQ-1).
3. **verify-checksum's sha-mismatch twist:** naively unifying catch blocks turns `ok=false` into a 404 — a behavior change pinned by backup-checksum:151 ("a RESULT, never a 4xx/5xx").
4. **Units' silent-skip vs routes' keyed-404 on disabled destinations:** not drift to fix, it's today's behavior; "byte-identical" forbids silently unifying it without a decision.
5. **Staged-temp ownership:** moving temp cleanup into the helper breaks D-89-16 rm-finally contracts pinned by restore-instance:297 ("staged S3-fallback temp never outlives the response on the post-download failure exits").
6. **Row-shape mismatch:** routes read `row.task_id/row.filename/row.id`; units read `backupRun.taskId/backupRun.filename` and use `runId` param. Helper input must normalize (or accept both shapes) — check `restoreInstanceUnit`'s `backupRun` construction at the call sites before choosing the signature.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | ROADMAP's "2672 tests" is stale; 2712 is the true current baseline | User Constraints | SC-3 gate measured against wrong number — planner should restate 2712 |
| A2 | REQUIREMENTS' "overwrite/instance" labels are misnomers for the download/verify-checksum routes | Ladder Sites | Wrong sites extracted; mitigated — grep is unambiguous, all 6 sites listed |
| A3 | Planner will decide helper scope (3 route sites only vs all 6 sites) | Open Questions | Units left duplicated until Phase 104 contradicts R-5 spirit |

## Open Questions

1. **Helper scope: 3 route sites (RSRC-01 literal) or all 6 (routes + units)?**
   - What we know: RSRC-01/ROADMAP name preview/overwrite/instance with stale anchors; today there are 3 route ladders + 3 unit ladders of identical shape.
   - Recommendation: extract all 6 (helper in export/restore.js) — R-5's purpose is "Phase 104 edits one place", and the `source` param lands in the units.
2. **Disabled-destination divergence:** keep per-site (byte-identical) or unify to the route's keyed-404? Recommendation: keep byte-identical in 103; revisit in 104 where `source` validation makes the semantics explicit.

## Environment Availability

Not applicable beyond the repo itself — zero new dependencies (R-5/SC-3: no new dependency). Node.js + `node --test` already present and running the 2712-test suite.

## Security Domain

No new attack surface — pure refactor. Preserve verbatim: runId regex gates before row reads (no oracle), instance-tier check before location resolution (T-90-02), sameOrigin → requireUser → throttle → capability funnel order (pinned by backup-download:228 source-pattern test). No new ASVS-relevant controls; input validation unchanged.

## Sources

### Primary (HIGH confidence)
- Live reads this session: server.js:10859–10958, :11039–11130, :11176–11277, :4046–4062, :10479–10620; export/restore.js:1310–1330, :1611–1727, :2128–2240, :2367–2480; package.json:19
- .planning/REQUIREMENTS.md:12–13, 33; .planning/ROADMAP.md:74–84; .planning/research/ARCHITECTURE.md:108–182
- git show 84a04b86:server.js (line-91 ftp import comment proving preview/download/verify naming)
- Test greps: backup-ftp-restore-gates, backup-smb-restore-gates, destination-registry-gate, backup-download, backup-checksum, restore-preview, restore-instance, restore-overwrite, 102-VERIFICATION.md:77

## Metadata

**Confidence breakdown:** Ladder sites/quotes: HIGH (verbatim, this session). Drift verdict: HIGH (line-evidenced). Golden inventory: HIGH (grepped). Baseline number: HIGH per 102-VERIFICATION.

**Research date:** 2026-11-27
**Valid until:** 2026-12-27 (mechanical refactor; anchors re-grep if phases 102+ shift lines again)
