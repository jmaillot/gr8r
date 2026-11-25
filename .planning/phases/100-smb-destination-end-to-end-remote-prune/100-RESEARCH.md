# Phase 100: SMB Destination End-to-End + Remote Prune — Research

**Researched:** 2026-11-25
**Domain:** SMB destination wiring (clone of the 98 FTP harness) + rotation-coupled remote prune (FTP DELE / SMB rm)
**Confidence:** HIGH (every harness anchor read verbatim in the current tree this session)

## Summary

Phase 100 is two mechanical jobs on a fully proven template. **Job 1 (SMB destination):** the 98 FTP phase established every wiring site — install closure, upload arm, probe route, probe-at-save twins ×2, toggle row, client-state plumbing, probe toasts, restore read-back twins, badge scan. All sites exist in the current tree with shifted-but-verified line numbers (§Architecture Patterns). The 99 SMB client (`export/smb.js`, 1,106 LOC, GO verdict) already provides `connectSmb` with `write/read/rm/echo/close` — but **no `probeSmb` and no `size`** exist yet, so 100 must add a `probeSmb` (connect + echo + write+rm marker under `backup-smb/`) and use write+rm idempotency instead of SIZE-verify (SMB2 has no SIZE analog in the client; R-4 for SMB = write marker + sha256 sidecar file + restore read-back verify, mirroring the ftp sidecar pattern). One genuine new capability: **guest-session detection** (SC-2) — the 99 client does NOT decode the SESSION_SETUP response's SessionFlags field, so `smbGuestAccess` needs a small client addition. **Job 2 (remote prune):** the rotation pass (`runBackupRotationPass`, server.js:4227-4329) marks rows `deleted` at :4309-4312 and audits at :4317-4320 — the prune hooks in exactly there (D-05: after the local status commit, inside the same per-task loop), with the D-01 floor-guard evaluated on FRESH reads (the delete-set rows carry only `id, filename` today — the prune step must re-read `uploaded` per-run or widen that select, never trust the rotation's cached state).

**Primary recommendation:** clone the ftp twin at every one of the 12 verified sites; put the prune INSIDE `runBackupRotationPass`'s per-task loop immediately after the `status='deleted'` UPDATE + rotation audit; gate each destination's prune on `uploaded === 1 || !S3.enabled` read fresh at prune time; add `remote_pruned` as the additive column published through the existing rest-spread (it is NOT in the strip lists at :9767/:9795, so adding it to the SELECTs publishes it with zero byte-identity risk to existing keys).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Floor-guard semantics (R-1): a mirror copy (SMB or FTP) may be pruned ONLY if the run ALSO holds an S3 copy (`uploaded = 1`) OR S3 is not configured instance-wide. Never delete a mirror that is the only surviving off-site copy — local `deleted` status alone is never sufficient. Guard evaluated per-run at prune time (fresh reads, not cached rotation state).
- **D-02:** E2E recipe = ONE compose recipe, TWO dperson/samba containers: default profile `min protocol = SMB2` (happy path) + second container `SMB3-min` asserting the keyed `smbDialectUnsupported` refusal — both SPIKE-99 pins in one recipe, env-gated `SAMBATEST_URL` + `SAMBATEST_SMB3_URL` skip-when-absent.
- **D-03:** Prune is VISIBLE: `pruned` badge in the history list (additive column `remote_pruned` integer on backup_runs, dual-engine ensureColumn; runs payload gains the key in the standard additive way — golden-identity of EXISTING keys preserved). Prune audited: `backup_prune_ok:<dest>` / `backup_prune_failed:<dest>` / `backup_prune_skipped:soleCopy`.
- **D-04 (derived):** SMB wiring clones the 98 FTP harness site-by-site (closure inversion R-2, `smb-probe` route + save twins ×5, toggle mirror, restore fetchToStaged twins, guest-session → keyed `smbGuestAccess` info toast per SC-2).
- **D-05 (derived):** Prune timing = inside the rotation pass (same transactional boundary that marks runs `deleted`), after the local status commit — best-effort per destination: one mirror's failure never blocks the other's prune nor the rotation itself.

### the agent's Discretion
- Prune idempotency semantics (DELE/rm of an already-pruned mirror) — recommendation in §Pitfalls.
- Exact `pruned` badge render condition — recommendation in §Architecture Patterns.
- SMB R-4 verify shape (no SIZE in the 99 client) — recommendation below.

### Deferred Ideas (OUT OF SCOPE)
- Prune retry queue (failures logged only, per R-1 best-effort)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SMB-02 | SMB mirroring per backup task on the FTP harness | All 12 harness anchors verified with signatures (§Harness Anchor Table) |
| DEST-02 | Rotated-out runs best-effort pruned from remote mirrors | Rotation site server.js:4227-4329 mapped; prune hook point :4313-4322; floor-guard data availability documented |
| DEST-03 | SMB probe (route + save twins + guest info) | ftp-probe route server.js:9514-9531, twins :9226-9232/:9414-9420, guest SessionFlags gap identified |
| TEST-01 | Real-server e2e both gates | dperson/samba recipe + env gates mapped onto the 98 e2e structure (§E2E Recipe) |
</phase_requirements>

## Project Constraints (from AGENTS.md / standing rules)

- Zero new dependencies (smb.js is already zero-dep; prune needs only existing clients).
- i18n ×5 same-commit: new keys = `page.backup.smbToggle`, `err.smb*` family, `toast.smbProbe*`, `smbGuestAccess` info, `page.backup.pruned` badge label (+ `smbDialectUnsupported` message per 99-SPIKE §4).
- New column `remote_pruned` = dual-engine ensureColumn (server.js:1097-1100 pattern) + `backup_runs` schema mirror (server.js:886-888 comment block) + runs-payload additive key — 98-02's byte-identity fix is precedent: EXISTING keys byte-identical.
- data-a pin 623; membershipsOf byte-gate (9741-9757 untouched); baseline 2609 tests / 2 documented pre-existing failures.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| SMB upload arm | Server (export/backup.js loop) | export/smb.js client | descriptor-dispatched like ftp arm; client is engine-agnostic |
| SMB probe | Server route | smb.js probeSmb (new) | guard chain is server-side; marker write+rm rides the client |
| Prune | Server (rotation pass) | ftp.js dele / smb.js rm | same transactional pass as `deleted` marking (D-05) |
| Floor-guard | Server (rotation pass) | — | fresh DB reads + `S3.enabled` env-frozen const, never client state |
| `pruned` badge | Client (src/pages/backup.js) | Server payload key | payload carries `remote_pruned`; client renders verbatim (D-23 doctrine) |
| Guest info toast | Client (actions.js) | smb.js SessionFlags read | server passes probe result through verbatim |

## Harness Anchor Table (all verified this session — CURRENT tree)

| # | 98 analog | Current location (verbatim) | smb twin |
|---|-----------|------------------------------|----------|
| 1 | ftp install closure | `setBackupDestination('ftp', {…})` server.js:3946-3963 — `enabled: FTP.enabled`, `manualPrefix: 'backup-ftp/'`, `upload: async meta => { … const task = await db.get('select ftp_enabled from backup_tasks where id = ?', [meta.taskId]); if (!task || task.ftp_enabled !== 1) return null; … return { config: FTP.config() }; }`, `verify: FTP.verify` | `setBackupDestination('smb', …)` REPLACES the dormant slot server.js:3964-3968 (currently `{ label:'SMB', enabled: !!(SMB_HOST && SMB_SHARE && SMB_USER && SMB_PASSWORD), manualPrefix: 'backup-smb/' }`) — R-2 inversion (null for taskId-less meta), fail-closed `select smb_enabled`, returns `{ config: SMB.config() }` |
| 2 | upload loop ftp arm | export/backup.js:870-906 — `if (destName === 'ftp') { const ftpKey = `backup-task-${runMeta.taskId}/${filename}`; const ftp = connectFtp(provided.config); … await ftp.stor(ftpKey, destination); const storedSize = await ftp.size(ftpKey); … await ftp.stor(`${ftpKey}.sha256`, Buffer.from(`${sha256}  ${filename}\n`)); … await dbRun('update backup_runs set ftp_uploaded = 1 where id = ?', [runId]); }` — flag write at exactly ONE site (verified: grep → single hit :906), inside success block, shared catch keeps raw-slice failure | `if (destName === 'smb')` arm beside it: `const smbKey = `backup-task-${runMeta.taskId}/${filename}``; connectSmb → write archive → write `.sha256` sidecar → `update backup_runs set smb_uploaded = 1` one-site success-only. No SIZE (see §R-4 deviation below) |
| 3 | s3 arm byte-preserved | export/backup.js:861 `const key = s3BackupKey(runMeta, filename);` + :907-932 else-arm ending `await dbRun('update backup_runs set uploaded = 1 where id = ?', [runId]);` | UNTOUCHED — recognizability pins must stay green |
| 4 | probe route | `if (pathname === '/api/backup/tasks/ftp-probe' && method === 'POST')` server.js:9514-9531 — chain: `sameOrigin → requireUser → tooMany('backupprobe|'+user.id, 10, 15*60*1000) → hasInstanceRole(CAP.BACKUP_MANAGE) → FTP.enabled → probeFtp(FTP.config())` audits `backup_probe_refused:backupManageRequired` / `backup_probe_refused:ftpNotConfigured` / `backup_ftp_probe_ok`/`failed` (detail = result.key only) | `/api/backup/tasks/smb-probe`, same chain verbatim; `SMB.enabled` refusal keyed `smbNotConfigured`; probe = probeSmb(SMB.config()) |
| 5 | probe-at-save CREATE | server.js:9226-9232 — `let ftpProbe = null; if (body?.ftpEnabled === true && FTP.enabled) { ftpProbe = await probeFtp(FTP.config()); if (!ftpProbe.ok) { await auditBackupTask(user, `backup_task_refused:ftpProbe:${ftpProbe.key}`); return fail(res, 400, ftpProbe.key, …); } }`; rides response :9277-9278 `...(ftpProbe ? { ftpProbe } : {})`; audit symmetry :9270-9272 | clone beside, `body?.smbEnabled === true && SMB.enabled`; `smb_enabled` binding in task object :9254, INSERT :9260-9261 |
| 6 | probe-at-save EDIT | server.js:9414-9420 same block + task id; `ftp_enabled` in updated object :9450, UPDATE :9454-9455; response :9466-9468 | clone beside; `smbEnabled` read/keep logic beside :9386-9390 |
| 7 | UI toggle row | src/pages/backup.js:523 — `${api.ftpEnabled ? `<div class="row"…><input type="checkbox" data-in="backupTaskFtp"${form.ftpEnabled ? ' checked' : ''}><span>${esc(t('page.backup.ftpToggle'))}</span></label></div>` : ''}` | `backupTaskSmb` / `form.smbEnabled` / `page.backup.smbToggle`, gated on `api.smbEnabled` |
| 8 | actions.js sites | src/actions/actions.js:5105-5106 (`ftpEnabled: false` state), :5164 (`if (S.ui.backupTaskForm) S.ui.backupTaskForm.ftpEnabled = el.checked;`), :5230 (`ftpEnabled: task.ftp_enabled === 1`), :5279 (`if (api.ftpEnabled) body.ftpEnabled = form.ftpEnabled === true;`), :5301-5313 (probe toast chain keyed on fprobe.key) | 5 twin sites (state, checkbox handler, form fill, body gate, toast chain) |
| 9 | api.js trio | src/core/api.js:38 (`ftpEnabled: false`), :159-160 (getter), :229 (`state.ftpEnabled = !!r.data?.ftpEnabled;`) | `smbEnabled` trio — server side already sends `smbEnabled` at server.js:6418 |
| 10 | restore twins | export/restore.js:2080-2081 (import_new): `if (!archivePath && backupRun.ftp_uploaded === 1 && opts.ftpConfig && typeof opts.ftpConfig === 'object' && backupRun.filename) { const back = await fetchToStaged(opts.ftpConfig, `backup-task-${backupRun.taskId}/${backupRun.filename}`, backupRun.sha256, restoreStagingDir());` and :2326-2328 (DR twin). Plumbing: server.js:10061+10069 (import_new) and :10151+10153 (DR) — `ftpConfig: FTP.enabled ? FTP.config() : null` at the exact `s3Config` seam | smb twins beside each gate: `backupRun.smb_uploaded === 1 && opts.smbConfig` → the 99 client's `read` (via a staged-fetch helper 100 adds beside fetchToStaged — `fetchToStaged` is ftp.js's; SMB needs its own single-shot + sha256 wrapper) ; plumbing `smbConfig: SMB.enabled ? SMB.config() : null` at both seams; `smb_uploaded` added to the two SELECTs :10008/:10121 and `backupRun` forwarding :10061/:10151 |
| 11 | badge destLocation | server.js:3979-3985 — `if (r.filename && fs.existsSync(path.join(backupsRoot(), r.filename))) return 'local'; if (r.uploaded === 1) return 's3'; if (r.ftp_uploaded === 1) return 'ftp'; if (r.smb_uploaded === 1) return 'smb'; return 'missing';` | ZERO change — `smb_uploaded` arm already present (96-02) |
| 12 | runs payload | server.js:9734 (all=1 SELECT), :9767 (strip list `const { scope: _internal, ftp_uploaded: _ftp, smb_uploaded: _smb, ...pub } = r;`), :9771 `location: destLocation(r)`; historyChrome :9791-9801 (strip :9795) + SELECTs :9803 (manual), :9825 (task) | add `remote_pruned` to all three SELECTs; do NOT add it to either strip list — it rides `...pub` into the payload (this IS the additive reveal; existing keys byte-identical because remote_pruned is a new key, not a re-shape) |

**Client history badge render:** src/pages/backup.js:209-217 — location badge only renders for `local|s3` (:214-216); `ftp`/`smb` locations render no badge there today. **Recommendation for the `pruned` badge (discretion):** render it additively in `statusCell` when `run.remote_pruned === 1 && run.status === 'deleted'` — deleted rows appear ONLY under the "Rotated" filter (94-03, backup.js:261-269 `h.runs.filter(r => r.status !== 'deleted')`), so the badge is invisible on live runs by construction, which is exactly the D-03 intent ("runs whose mirrors were pruned"). A pruned run's location resolves through destLocation to its surviving flag (`s3`/`ftp`/`smb`/`missing`) — recommend NOT coupling pruned to location: one new i18n key `page.backup.pruned`, rendered as `<span class="badge">` beside the status badge, independent of the location ternary.

## Rotation + Prune Site (DEST-02)

**The rotation pass** — server.js `runBackupRotationPass({ now, taskId })` :4227-4329:
- Delete-set selection :4281-4284: ``select id, filename from backup_runs where task_id = ? and status = 'succeeded' and id in (…) and id <> ?`` — **carries only `id, filename`**. Prune needs per-run `uploaded`, `ftp_uploaded`, `smb_uploaded`, `sha256` (sidecar content not needed — mirrors already carry sidecars from upload). **Widen this select** (additive columns; rotation math consumes id/filename/bucket only, so widening is behavior-neutral and pin-safe) — this also satisfies D-01's "fresh reads" because the delete-set is selected AFTER candidates are computed, inside the same pass. For absolute freshness (D-01 verbatim: "evaluated per-run at prune time"), the floor-guard may either read the widened row OR re-issue a `select uploaded … where id = ?` at prune instant — recommend the widened select: it is already fresher than any cached rotation state, and a second query per run adds churn with no semantic gain (the pass is single-threaded per task; no writer can interleave between select and prune inside the loop's synchronous sequence).
- Local unlink :4296-4307 (sidecar first, then archive, best-effort).
- **Status commit** :4309-4312: ``update backup_runs set status = 'deleted' where id in (…) and task_id = ?``.
- **Audit** :4317-4320: one `backup_rotation:expired:<detail>` event.
- **→ PRUNE HOOK POINT: immediately after :4320 (after local status commit + rotation audit), before :4321.** Structure per D-01/D-05:

```
for (const row of deleteSet) {                    // row now carries uploaded/ftp_uploaded/smb_uploaded
  const soleCopy = !(row.uploaded === 1) && S3.enabled;   // D-01: S3 copy absent AND S3 configured
  for (const [dest, key, dele] of ftpAndSmbPruneTargets(row, taskId)) {
    if (soleCopy || row[dest + '_uploaded'] !== 1) continue;   // nothing on this mirror (or guarded)
    try { await dele(key); mark remote_pruned … audit backup_prune_ok:<dest> }
    catch (err) { audit backup_prune_failed:<dest> (err.key only) — NEVER block the next dest or the loop }
    if (soleCopy-first-read…) audit backup_prune_skipped:soleCopy
  }
}
```

- **Key derivation must match upload**: ftp key = ``backup-task-${taskId}/${row.filename}`` (export/backup.js:875 verbatim); smb key = same shape through the smb share root. `manualPrefix`es (`backup-ftp/`, `backup-smb/`) are NEVER used for prune — R-2 means manual runs never uploaded, and rotation candidates are task runs only (`task_id is not null` task scope; task_id NULL rows are structurally outside the deletable set, D-11).
- **Floor-guard truth:** `S3.enabled` is the boot-frozen instance-wide const (server.js S3 capability, "no S3 custody" branch per D-01). `uploaded` is the run-row column written at export/backup.js:931.
- **Failure containment:** wrap each destination's prune in its own try/catch (D-05: "one mirror's failure never blocks the other's prune nor the rotation itself"). The rotation `report` may gain a `pruned` count field — additive to the report object; the internal rotation-pass route shape is test-pinned, so check test/backup-rotation.test.mjs pins before widening (recommended: keep `report` unchanged, ride the audit trail only — D-03's visibility requirement is the badge + audits, not the report).
- **Transaction boundary note:** the rotation pass is NOT wrapped in an explicit sqlite transaction today — the status UPDATE at :4309 commits immediately (better-sqlite-style single statements autocommit). "After the local status commit" (D-05) therefore means literally after the awaited UPDATE at :4309-4312. Do not introduce a transaction wrapper in this phase.

## remote_pruned Column (D-03)

- **DDL clone:** `await adapterEnsureColumn('backup_runs', 'remote_pruned', 'integer not null default 0');` beside server.js:1099-1100 (the ftp_uploaded/smb_uploaded pair — verified verbatim) + schema-comment mirror in the `backup_runs` CREATE block (server.js:866-912 region; ftp_uploaded pattern at :886-888, smb_uploaded at :887).
- **Writes:** `update backup_runs set remote_pruned = 1 where id = ?` per successful prune — one site per destination arm, success-only, inside the prune hook (one-site-per-flag rule; recommend ONE total write site reached from both dest arms, or two — mirror the ftp/smb_uploaded posture: each dest writes at its own single site after ITS delete succeeded).
- **Payload:** add to SELECTs :9734/:9803/:9825; leave both strip lists (:9767, :9795) untouched — `remote_pruned` flows through `...pub` automatically. Golden key set gains exactly one new key; existing keys unchanged (98-02 precedent).
- **Badge:** §Harness table item 12 + client render recommendation above. i18n: `page.backup.pruned` ×5 in the same commit.

## SMB Client Gaps 100 Must Fill (engine-read)

`export/smb.js` (1,106 LOC) exports: crypto/NTLM primitives, codec, `smbErrorFrom` (9-class closed enum), `connectSmb(config, opts)` (smb.js:1036) → `{ connect, write(path, buffer), read(path), rm(path), echo(), close(), __debug() }` (smb.js:1042-1103, read verbatim). Config shape: `{ host, port? (default 445, :986), share, user, domain?, password }` (:865-866, :882, :986).

1. **No `probeSmb`** — write it in smb.js beside connectSmb cloning probeFtp's keyed-result shape (export/ftp.js:574-611: `{ ok, key: 'success'|…, warning, httpWarning }`): connect → echo → write+rm marker under `backup-smb/` prefix. Marker rm failure = HARD refuse (Pitfall-7 posture parity — verify the SMB rm failure class first, see idempotency pitfall below).
2. **No staged fetch helper** — ftp has `fetchToStaged` (ftp.js, single-shot + sha256); SMB needs its equivalent for the restore twins (read whole file → sha256 compare → write staging file). `read(path)` returns the file bytes (:1044-1053) — wrap, don't extend the client.
3. **No SIZE** — R-4 for SMB = sidecar `.sha256` file at upload + sha256-verify at restore read-back (documented deviation alongside ftp's SIZE posture; the sidecar byte-for-byte mirrors backup.js:894).
4. **Guest detection (SC-2) — the only genuine protocol addition.** `decodeSmb2Header` (smb.js:361-380, read verbatim) does NOT expose SessionFlags, and nothing in the session engine reads the SESSION_SETUP response body's SessionFlags field. Per MS-SMB2 the SESSION_SETUP response carries `SessionFlags u16` (bit 0 `SMB2_SESSION_FLAG_IS_GUEST = 0x0001`, bit 1 `IS_NULL = 0x0002`) [ASSUMED — training knowledge of MS-SMB2 §2.2.5; the e2e container run is the falsification point]. Minimal change: in the session-setup reply path read the 2 bytes at the response body offset 2, store `s.guestSession = (flags & 0x0001) !== 0`, expose via `__debug()` + a keyed `smbGuestAccess` code surfaced through probeSmb's result. Map to the ×5 info toast at the probe sites (route + both save twins) — NOT a refusal, an informational class (R-3 posture: guest is visible, not warned-as-insecure-TLS).
5. **Env seams:** only `SMB_HOST/SMB_SHARE/SMB_USER/SMB_PASSWORD` exist (server.js:237-240, all-four-required warning :273-274, `smbEnabled` exposure :6418). `SMB.config()` must be created mirroring `FTP.config()` (mapping frozen consts → client shape `{ host, share, port: 445, user, domain?, password }`). If a port override is wanted, it is a NEW env const (`SMB_PORT`, default 445) — additive, boot-frozen, documented in DEPLOY.

## E2E Recipe (TEST-01 / D-02)

Clone test/backup-ftp-e2e.test.mjs structure (121 LOC, read verbatim): header documents the docker recipe; `const maybeX = url ? test : test.skip` gate idiom; one always-on "gate: env absent → skips silently" test (:114-117); loop tests drive the REAL clients (`probeSmb`, `connectSmb().write/rm`, restore read-back) against the container.

- **Two dperson/samba containers in ONE compose recipe** (D-02): default profile `min protocol = SMB2` via dperson/samba args (`-s "share;/backups;yes;yes;yes;all;none" -u "gr8rtest;gr8rtest-password"` style + `-m SMB2`/smb.conf `min protocol = SMB2` `server min protocol = SMB2`); second container `server min protocol = SMB3` asserting `probeSmb`/NEGOTIATE refuses with `err.code === 'smbDialectUnsupported'` (`smbClass: 'generic'`, smb.js:437-438 verbatim) — this is the first real falsification of SPIKE A1-A4 (99-SPIKE §3: failure mode is "a keyed error at a specific command, not ambiguity").
- **Env gates:** `SAMBATEST_URL` (host:port) + `SAMBATEST_SMB3_URL` — skip-when-absent, exactly mirroring `VSFTPD_TEST_URL` (:37-38).
- **Env mapping:** `SMB_HOST/SMB_SHARE/SMB_USER/SMB_PASSWORD` ← the boot-frozen consts (server.js:237-240); test-override vars `SMB_TEST_*` mirroring `FTP_TEST_USER/FTP_TEST_PASSWORD` (:31-34). Note: the e2e drives `connectSmb` DIRECTLY (like the ftp e2e imports `connectFtp, probeFtp, fetchToStaged` — it never boots the server), so the frozen-const seam is bypassed; CONFIG is built from the URL like ftp's `CONFIG` IIFE (:40-52).
- **Credential pin:** dperson/samba user pass via `-u`/smb.conf `usershare`; guest access can be exercised with `map to guest = Bad User` on a THIRD profile only if SC-2 guest-detection needs a real guest session — recommend pinning guest behavior against the SMB2-min container with `map to guest = bad user` and a wrong-password connect, since that's the realistic guest surface [ASSUMED: samba maps wrong-user→guest under this setting; verify live].

## DEPLOY.md State (SC-5)

Verified: docs/DEPLOY.md is 1,879 lines; **§21 = "FTP/FTPS destination for backup tasks (Phase 98)"** (:1803, includes the vsftpd recipe, R-4 SIZE+sidecar posture, probe hard-refuse). **No §22 exists** and **no SMB content exists anywhere in DEPLOY.md** (grep: zero SMB_HOST hits). CONTEXT SC-5 says "§21 (SMB) written in the e2e commit; §22 gains FTPS passive ranges + cert trust notes AND the SMB share-perms/ACL pitfall section." **Recommended resolution of the numbering tension:** 98 already owns §21 (FTP), so 100 writes **§22 = "SMB destination + remote prune"** (samba recipe, SMB_* env table, share-perms/ACL pitfalls per SC-5, prune + floor-guard semantics, guest-access note) in the e2e commit, and **§23 or a §21 sub-section carries the FTPS hardening** (passive-range firewall + `FTP_INSECURE`/CA-trust notes extracted from 98's §21 baseline). Planner should confirm the split at plan time (open question OQ-1).

### §22 SMB share-perms/ACL pitfall content (from SC-5 + samba realities) [ASSUMED — samba config knowledge, verify live in the e2e commit]
- dperson/samba share args grant broad perms by default; production shares need explicit `force user`/`create mask` so the gr8r user can overwrite rotated-out files (prune = DELETE — share must grant delete, not just write).
- `hide unreadable`/ACL-restricted shares make the marker rm fail with ACCESS_DENIED (0xc0000022 → `treeConnectFailed` class, smb.js:399) — the probe's hard-refuse catches this pre-save.
- Windows hosts: NTFS ACLs + share perms intersect; a read-only share fails at marker write (probe refuse), a no-delete share fails only at first prune → `backup_prune_failed:smb` audit trail is the operator signal.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SMB protocol ops | frame-level calls in server.js | connectSmb surface (write/read/rm/echo) | serial session + signing + retry envelope are client-owned (99) |
| Prune scheduling | new cron/pass | runBackupRotationPass hook (D-05) | same pass guarantees timing semantics |
| Idempotent delete | pre-DELETE existence check | delete + treat not-found as already-pruned | TOCTOU-free; see Pitfall 1 |
| Badge truth | client-side heuristics | server `remote_pruned` + `location` payload (D-23) | client derives nothing |

**Key insight:** every semantic hazard in this phase (floor-guard, idempotency, failure containment) is a *reads-and-error-mapping* problem, not a plumbing problem — plumbing is a mechanical clone.

## Common Pitfalls

### Pitfall 1: Prune of an already-pruned mirror (idempotency) — recommend success
**What goes wrong:** prune runs, crash before `remote_pruned = 1`; next pass re-prunes → DELE 550 / SMB CREATE STATUS_OBJECT_NAME_NOT_FOUND (0xc0000034 → currently mapped `generic`/`smbGeneric`, smb.js:443).
**Avoid:** map "target not found" to already-pruned SUCCESS (write the flag, audit `backup_prune_ok:<dest>`). FTP: ftp.js maps 550 → `ftpPathNotFound` (ftp.js:186, verified) — catch that key in the prune arm. SMB: recommend adding `0xc0000034` to `SMB_ERROR_CLASSES` as a new `pathNotFound` class (closed-enum additive) and treating it as success in the prune arm only. Never existence-check-then-delete (TOCTOU).
**Warning signs:** second rotation pass after a crash produces prune_failed audits.

### Pitfall 2: Floor-guard reads stale or inverted state
**What goes wrong:** guarding on the delete-set's cached `uploaded` from a previous pass, or writing the guard as `uploaded === 0` without the `!S3.enabled` branch — prunes the only off-site copy.
**Avoid:** D-01 verbatim — `prune allowed iff (row.uploaded === 1 || !S3.enabled)` evaluated per-run in the prune hook on the freshly-selected rows (§Rotation section). Audit `backup_prune_skipped:soleCopy` (D-03) when a mirror is skipped SOLELY for this reason (not when the mirror simply has no copy — that is a silent no-op).

### Pitfall 3: Prune failure poisoning rotation
**What goes wrong:** an awaited, un-caught smb/ftp error escapes the per-task try/catch boundary inside the loop → remaining destinations of the SAME run skipped and (worst case) the task's loop iteration aborts before the report/audit.
**Avoid:** per-destination try/catch INSIDE the prune hook (D-05 verbatim). The existing per-task catch (:4324-4326) is the outer net, never the primary containment. `remote_pruned` stays 0 on failure — the badge never lies.

### Pitfall 4: Byte-identity regression on the runs payload
**What goes wrong:** adding `remote_pruned` by rewriting the projection (destructure order, `void` lines, key order) instead of additive SELECT columns.
**Avoid:** three SELECT edits (:9734, :9803, :9825) + zero edits to the strip lists (:9767/:9795). Golden payload test must show existing keys byte-identical + one new key. Same discipline for the visibility-gate byte-gate (membershipsOf region :9741-9757 untouched).

### Pitfall 5: Secrets in prune/probe audit details
**What goes wrong:** audit detail carrying config, full error text (password-derived material), or share paths with credentials.
**Avoid:** detail = keyed result code ONLY (probe precedent :9528 `result.key`; prune audits `backup_prune_ok:<dest>` / `backup_prune_failed:<dest>` + key-only detail). smbScrubMessage already redacts NTLM material — but never rely on scrub at the audit boundary; pass keys, not errors.

### Pitfall 6: `manualPrefix` used for prune keys
**What goes wrong:** pruning under `backup-ftp/`/`backup-smb/` — wrong prefix, deletes nothing or worse.
**Avoid:** keys mirror the UPLOAD arm exactly: `backup-task-${taskId}/${filename}` (backup.js:875). manualPrefixes are probe-marker-only (R-2; server.js:3949/:3967 comments verbatim).

### Pitfall 7: Writing flags in catch paths / multiple sites
**What goes wrong:** `smb_uploaded = 1` or `remote_pruned = 1` leaking into a catch, or duplicated write sites.
**Avoid:** one-site-per-flag, success-block-only (ftp precedent backup.js:901-906 comment verbatim). Verify with `grep -c`.

### Pitfall 8: Rotation test pins
**What goes wrong:** widening the delete-set SELECT (:4282) or appending to `report` breaks test/backup-rotation.test.mjs pins (delete-set matrix, refuse-to-empty floor, audit shape).
**Avoid:** widen SELECT additively; do NOT touch report shape; run the rotation suite before/after.

## Code Examples

### Prune hook (shape, after server.js:4320)
```javascript
// Source: server.js:4296-4323 (rotation verbatim structure) + D-01/D-03/D-05
const pruneTargets = [
  ['ftp', `backup-task-${taskId}/${row.filename}`, row.ftp_uploaded === 1, pruneFtp],
  ['smb', `backup-task-${taskId}/${row.filename}`, row.smb_uploaded === 1, pruneSmb],
];
for (const [dest, key, hasCopy, dele] of pruneTargets) {
  if (!hasCopy) continue;
  if (row.uploaded !== 1 && S3.enabled) {           // D-01 sole-copy guard, fresh row
    await db.run('insert into audit_log (…) values (…)', [uid(), null, taskId, `backup_prune_skipped:soleCopy:${dest}`, 0, …]);
    continue;
  }
  try {
    await dele(key);                                 // not-found → already-pruned success (Pitfall 1)
    await db.run('update backup_runs set remote_pruned = 1 where id = ?', [row.id]);
    await auditBackupTask(null, `backup_prune_ok:${dest}`, taskId, key);
  } catch (err) {
    await auditBackupTask(null, `backup_prune_failed:${dest}`, taskId, err.key || err.code || 'unknown'); // key-only detail
  }
}
```

### probeSmb result shape (clone of probeFtp)
```javascript
// Source: export/ftp.js:574-611 posture + smb.js smbErrorFrom (392-452)
export async function probeSmb(config) {
  const base = { ok: false, key: 'unreachable', warning: false };
  try {
    const smb = connectSmb(config);
    await smb.connect(); await smb.echo();
    const marker = `backup-smb/probe-${Date.now()}.tmp`;
    await smb.write(marker, Buffer.from('gr8r-probe'));
    try { await smb.rm(marker); } catch (err) { return { ...base, key: 'deleteFailed' }; } // hard refuse — no warning analog
    await smb.close().catch(() => {});
    return { ok: true, key: 'success', warning: false, ...(smb.guestSession ? { guest: true } : {}) };
  } catch (err) { return { ...base, key: smbKeyFromErr(err) }; }
}
```

## State of the Art

| Old Approach | Current Approach | When | Impact |
|--------------|------------------|------|--------|
| S3-hardcoded upload loop | descriptor-dispatched loop (98-01) | Phase 98 | smb arm is one more `else if` |
| S3-only rotation | rotation local-only + remote flags | 88/96 | prune is NEW behavior — D-01/D-03/D-05 are the first remote-delete semantics in the codebase |
| mock-only SMB client | real-server falsification gate | 99→100 | A1-A4 assumptions get their first live test; failure = keyed error |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | SMB2 SESSION_SETUP response carries SessionFlags u16 with IS_GUEST bit 0x0001 (MS-SMB2 §2.2.5); the 99 client can read it at response-body offset 2 | Client Gaps #4 | Guest toast misses or misfires; e2e guest profile falsifies |
| A2 | dperson/samba supports `min protocol = SMB2`/`SMB3` config and `map to guest` for the guest profile | E2E Recipe | Recipe needs a different image/flag set — adjust at e2e task |
| A3 | SMB CREATE of a nonexistent path (rm target) returns STATUS_OBJECT_NAME_NOT_FOUND 0xc0000034 → currently generic class | Pitfall 1 | Idempotency mapping keys on wrong code → spurious prune_failed |
| A4 | Widening the rotation delete-set SELECT is pin-neutral | Rotation | backup-rotation.test.mjs pins break → adjust pins |

## Open Questions

1. **DEPLOY §21/§22 split** — §21 is already FTP (98). Recommend: §22 = SMB destination + prune (e2e commit), FTPS hardening notes ride as a §21 sub-section or §23 (CONTEXT wording suggests §22 carries them; reconcile at plan time).
2. **Prune audit detail content** — recommend key-only (`key`/`code`), never the error text; confirm whether the D-03 tokens should carry the destination inline (`backup_prune_ok:ftp`) per the D-03 verbatim spelling (recommended: yes, exactly as D-03 writes them, plus `:soleCopy` suffix variant or a separate token — D-03 names `backup_prune_skipped:soleCopy` without a dest; recommend appending `:<dest>` for operator grep-ability, flagged as discretion).
3. **`pruned` badge vs location badge interaction** — recommend independent additive badge (`remote_pruned === 1 && status === 'deleted'`), leaving the location ternary (:214-216) untouched; confirm whether ftp/smb locations should ALSO gain history-list badges in this phase (currently only local|s3 render — arguably out of scope).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node:test | all suites | ✓ (existing suites) | — | — |
| docker | e2e containers | unknown on this machine | — | e2e is skip-when-absent by design |
| dperson/samba image | SMB e2e | pull at run time | — | gates skip |

**Missing dependencies with no fallback:** none blocking — both e2e gates skip silently without docker.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (node --test) |
| Config file | none (convention: test/*.test.mjs) |
| Quick run command | `node --test test/backup-smb-wiring.test.mjs` |
| Full suite command | `npm test` (baseline 2609 tests / 2 documented pre-existing failures) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SMB-02 | smb install closure + upload arm + flag | wiring (static+functional, mock server like 98-01) | `node --test test/backup-smb-wiring.test.mjs` | ❌ Wave 0 |
| SMB-02 | probe route guard chain + save twins | wiring slices | same file | ❌ Wave 0 |
| SMB-02 | restore read-back twins | restore-gates slices (clone backup-ftp-restore-gates.test.mjs) | `node --test test/backup-smb-restore-gates.test.mjs` | ❌ Wave 0 |
| DEST-02 | prune hook + floor-guard + audits + idempotency | integration (seed rows + fake mirrors, clone backup-rotation.test.mjs harness) | `node --test test/backup-prune.test.mjs` | ❌ Wave 0 |
| DEST-02 | rotation suite stays green (SELECT widening neutral) | regression | `node --test test/backup-rotation.test.mjs` | ✅ |
| DEST-03 | probeSmb keyed results (mock) | unit | `node --test test/backup-smb-client.test.mjs` (extend) | ✅ |
| SMB-02/TEST-01 | real samba happy path + SMB3-min refusal, both env-gated | e2e (skip-when-absent) | `SAMBATEST_URL=… SAMBATEST_SMB3_URL=… node --test test/backup-smb-e2e.test.mjs` | ❌ e2e task |
| D-03 | payload byte-identity + remote_pruned additive key | wiring slice | same wiring file | ❌ Wave 0 |
| i18n ×5 | new keys present ×5 locales | suite (fr-typography failure is pre-existing) | `node --test test/i18n-toast.test.mjs` | ✅ |

### Sampling Rate
- **Per task commit:** the new/extended test file for that task
- **Per wave merge:** `npm test`
- **Phase gate:** full suite at baseline + both e2e gates exercised (documented skip when containers absent)

### Wave 0 Gaps
- [ ] test/backup-smb-wiring.test.mjs (wiring + payload identity)
- [ ] test/backup-smb-restore-gates.test.mjs
- [ ] test/backup-prune.test.mjs (floor-guard/audit/idempotency)
- [ ] test/backup-smb-e2e.test.mjs (both gates)

## Sources

### Primary (HIGH confidence — read verbatim this session)
- server.js: 3946-3985 (closures + destLocation), 4227-4329 (rotation), 9514-9531 (ftp-probe), 9213-9278/9402-9468 (save twins), 9730-9801 (payload), 1097-1100 (ensureColumns), 237-274/6418 (SMB env), 10061-10069/10151-10153 (restore plumbing)
- export/backup.js:845-934 (upload loop); export/ftp.js:574-611/783-800/186; export/smb.js:386-452/1036-1103/361-380; export/restore.js:2077-2081/2323-2328
- src/pages/backup.js:209-234/523/546/261-269; src/actions/actions.js:5105-5313; src/core/api.js:38/159-160/229
- test/backup-ftp-e2e.test.mjs (full); test/backup-rotation.test.mjs (header/pins); docs/DEPLOY.md:1803-1879; src/locales/en.json:2173-2278

### Secondary (MEDIUM)
- 99-SPIKE.md §2-§5, 98-RESEARCH/PATTERNS/VERIFICATION, 96-RESEARCH (via CONTEXT refs)

### Tertiary (LOW)
- MS-SMB2 §2.2.5 SessionFlags, dperson/samba flag semantics [ASSUMED A1/A2]

## Metadata

**Confidence breakdown:**
- Harness anchors: HIGH — every site read verbatim in the current tree with line numbers
- Rotation/prune: HIGH — rotation pass read in full; hook point explicit
- SMB client gaps: HIGH for absence (grep/reads), MEDIUM for guest/protocol details (A1-A4 live falsification pending)
- E2E recipe: MEDIUM — image flag semantics not verified live (A2)

**Research date:** 2026-11-25
**Valid until:** 2026-12-25 (stable domain)
