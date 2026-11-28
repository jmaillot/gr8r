# Phase 104: Restore-Source Backend — `source` Param & Probe Route — Research

**Researched:** 2026-11-28
**Domain:** projects-studio zero-dep Node.js restore pipeline (server.js + export/restore.js)
**Confidence:** HIGH (all anchors read from source this session; no external packages involved)

## Summary

Phase 104 extends the Phase-103 `resolveRestoreSource` helper (export/restore.js:1378–1444) with an explicit `source` override and adds one new throttled availability-check POST route. Everything is in-repo: no new packages, no new deps, no schema changes, no new stage enums. The helper is the single edit point (R-5 satisfied — 103-02 collapsed all six ladder sites onto it, net −31 lines, goldens green).

The `source` param flows as **`opts.source`** — a backward-compatible optional fourth knob on the existing `(rowLike, configs, opts)` signature. Omitted/undefined → today's registry order (s3 > ftp > smb, local-first), which keeps all 16 golden cases in test/restore-source-resolution.test.mjs passing byte-identically. Provided → validated against the run's mirror flags BEFORE selection (flags ARE the truth, R-4), then constrains selection to that single leg. Local is always implicitly available (local-first is unchanged; `source: 'local'` is a no-op override that skips the registry walk).

Keyed refusals hook at BOTH levels but ride different seams: the helper returns a structured `{ ok: false, reason: 'sourceInvalid' | 'sourceNotMirrored' }` result (no strings — the golden pins envelopes at CALLERS, so refusal text must live at callers or the goldens break by design); each of the six call sites (3 sync routes, 3 fire-and-forget triggers) maps that reason into its own existing refusal envelope family plus one new keyed code `restoreSourceNotMirrored` landing in all 5 locale files (en/de/es/fr/nl — the ×5 in RSRC-02 is the locale inventory, verified: 5 files in src/locales/).

The probe POST should be a verbatim clone of the existing destination-probe funnel family (server.js:9823–9914: `/api/backup/s3/probe`, `/api/backup/tasks/ftp-probe`, `/api/backup/tasks/smb-probe`) — sameOrigin → requireUser → operator-keyed throttle → capability gate → run-row read → flag validation → the existing `probeS3`/`probeFtp`/`probeSmb` seam, keyed result returned VERBATIM. It probes the *run's mirror destination*, never the run state (no flag writes, no staging, no lock).

**Primary recommendation:** `opts.source` on `resolveRestoreSource` + synchronous route-level validation before lock claim + one new `POST /api/backup/restore/probe` route cloning the ftp-probe funnel + `sources[]` derived in the `/api/backup/restore/backups` GET payload.

<user_constraints>
## User Constraints (from REQUIREMENTS.md rulings — no 104-CONTEXT.md exists)

### Locked Decisions
- **R-4 (flags-are-truth):** the run's mirror flags (`uploaded`/`ftp_uploaded`/`smb_uploaded`) ARE the truth for what sources exist; `source` validated against flags, never against live probing; probe is a **dedicated throttled POST**, never on list GET. [VERIFIED: .planning/REQUIREMENTS.md:13-14, phase context]
- **R-5 (DONE in 103):** the ladder lives in ONE `resolveRestoreSource`; goldens in test/restore-source-resolution.test.mjs (16 cases) **must pass unchanged when the default path is preserved**. [VERIFIED: test/restore-source-resolution.test.mjs:1-25]
- **RSRC-02:** restore routes accept explicit `source` validated against mirror flags; flows through the existing twin seam (dropStagedTmp, mirrorMissing→clearMirrorFlag, restore lock, stage vocabulary frozen); invalid/disabled source = keyed refusal ×5; detail lives in error text + audit, never new statuses. [VERIFIED: phase context]
- **RSRC-03:** payload surfaces `sources[]` derived server-side from flags; dedicated throttled availability-check POST probes on demand via probeS3/probeFtp/probeSmb seams; probing never mutates run state. [VERIFIED: phase context]
- **D-89-14:** archive resolution from run-row truth ONLY; list GETs never probe. [VERIFIED: server.js:10976-10981 doctrine comment; probe calls grep — only at server.js:9497-9901]

### Residual gray areas (planner's call, per phase context)
- Probe route path/shape, sources[] placement, refusal key names, param casing.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RSRC-02 | Restore routes accept explicit `source` validated against mirror flags; flows through twin seam; keyed refusal ×5 | §Source-Param Flow (helper change + 6 call sites), §Keyed Refusal Inventory, §Golden Impact |
| RSRC-03 | `sources[]` server-derived; throttled probe POST via existing seams; never on GET; no state mutation | §Probe Route Spec, §sources[] Placement |
| SC (roadmap ×4) | backward-compat omission; keyed refusal no new enums; enabled-only sources[]; probe route via seams | §Stage Vocabulary Freeze, §Golden Impact |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| source validation vs flags | API/Backend (server.js routes) | export/restore.js helper | routes refuse synchronously (UX + audit before lock claim); helper re-validates as the single funnel |
| source-constrained selection + staged fetch | export/restore.js (resolveRestoreSource) | — | R-5 single edit point; twin seam + mirror-flag clearing live there |
| sources[] derivation | API/Backend (list GET payload) | — | D-23 doctrine — client never derives authority; server reads flags |
| availability probe | API/Backend (new POST route) | export/s3.js:344, export/ftp.js:590, export/smb.js:1559 | seams own the wire protocol; route owns guards/throttle/audit |
| refusal localization | src/locales/*.json ×5 | — | err.* convention |

## Standard Stack

**No new packages.** Zero-dependency posture (project rule). Everything rides existing modules:

| Facility | Location | Purpose |
|----------|----------|---------|
| `resolveRestoreSource(rowLike, configs, opts)` | export/restore.js:1378 | the ONE ladder — gains `opts.source` |
| `probeS3(config)` | export/s3.js:344 | HeadBucket + marker PUT/DELETE; returns `{ ok, key, warning, httpWarning }` [VERIFIED: export/s3.js:344-369] |
| `probeFtp(config, opts)` | export/ftp.js:590 | connect/stor/dele marker; keys: success/ftpAuthFailed/ftpTlsFailed/ftpPassiveFailed/ftpPathNotFound/ftpQuotaExceeded/unreachable/deleteFailed [VERIFIED: export/ftp.js:572-616, server.js:9846-9855 doctrine] |
| `probeSmb(config, { onError })` | export/smb.js:1559 | connect/echo/write/rm; keys-only result + `guest` flag; NO httpWarning (R-3) [VERIFIED: export/smb.js:1559-1595] |
| `tooMany(key, n, ms)` | server.js (throttle helper) | operator-keyed throttle, consumes a try even on refusal (D-89-22) |
| `fail(res, code, key, msg)` / `json(res, ...)` / `readJson(req)` | server.js | keyed refusal + payload envelopes |
| `auditBackupTask(user, token)` | server.js | `restore_refused:<code>` / `backup_download_refused:<code>` audit tokens |
| `destLocation(r)` | server.js | existing badge derivation in list GET (untouched, T-96-04 pin) |
| `clearMirrorFlag` / `mirrorMissing` | export/restore.js:1317/:1321 area | unchanged — helper keeps ownership |

## Source-Param Flow

### Helper change (export/restore.js:1378) — backward-compatible

```js
// Source: [VERIFIED: export/restore.js:1378-1444] — current signature and branch shape
export async function resolveRestoreSource(rowLike, configs, opts = {}) {
  const disabledBehavior = opts.disabledBehavior === 'skip' ? 'skip' : 'refuse';
  // NEW (Phase 104):
  // const requested = opts.source; // undefined | 'local'|'s3'|'ftp'|'smb' — camelCase value vocabulary
  // if (requested !== undefined) {
  //   if (!['local','s3','ftp','smb'].includes(requested))
  //     return { ok:false, dest:null, reason:'sourceInvalid', localPath, err:{ code:'restoreArchiveMissing', detail:null, mirrorLost:null, raw:null } };
  //   if (requested === 'local') { /* existing local block, but SKIP the local-fallback when not requested */ }
  //   flag check: s3→uploaded===1, ftp→ftp_uploaded===1, smb→smb_uploaded===1;
  //   if flag !== 1 → return { ok:false, dest:requested, reason:'sourceNotMirrored', ... }
  // }
```

**Flow rules (each verified against the helper body):**
1. **Validate BEFORE selection** — the legs array is built at :1398-1402 from `uploaded === 1` / `ftp_uploaded === 1` / `smb_uploaded === 1` [VERbatim from :1399-1401]. The explicit-source check reuses exactly these flags — no new truth source, D-23.
2. **Explicit source overrides registry order** — when provided, the loop at :1406 visits ONLY the requested leg. `source: 'local'` short-circuits to the local block at :1392 (`fs.existsSync` → `{ dest:'local', ... }`) and skips the registry walk; if the local file is gone, return `reason:'missing'` directly (do NOT fall through to mirrors — explicit local means local).
3. **Default path byte-identical** — `opts.source === undefined` must leave the helper's behavior untouched: local-first (:1389-1394), registry order s3 > ftp > smb, disabledBehavior branch (:1408-1416), mirrorMissing→clearMirrorFlag on fetch failure (:1430), `restoreArchiveMissing` err.code everywhere. This is what keeps the 16 goldens green.
4. **Explicit + disabled destination = refusal in ALL sites** (RSRC-02: "invalid/disabled source = keyed refusal") — this RESOLVES the 103 `opts.disabledBehavior` divergence for the explicit-source case only. Units keep `disabledBehavior:'skip'` semantics for the DEFAULT path (silent fall-through), but an explicitly requested source that is either not mirrored (flag≠1) or whose destination config is disabled refuses keyed in units too (via the unit's own `failWith(keyed(...))` envelope). Document this as the 104 resolution of the documented divergence.
5. **Reason vocabulary added, NOT stage/status enums** — new helper result reasons `sourceInvalid`/`sourceNotMirrored` are transient structured-result fields consumed at call boundaries; the restore_runs stage vocabulary (`fetching`/`validating`/`restoring`/`verifying`, seen at export/restore.js:2230/1001/2033/2131 etc.) and the backup_runs status CHECK constraint stay frozen. No new `stage:` emission anywhere.

### The 6 call sites — param acquisition per site

| # | Site | Location | Param transport today | `source` transport |
|---|------|----------|----------------------|--------------------|
| 1 | preview | server.js:10859 GET `/api/backup/restore/preview` | `url.searchParams.get('runId')` (:10873) | `url.searchParams.get('source')` — GET routes take query params (no body on GET); validate with the same enum allow-list |
| 2 | download | server.js:10999 GET `/api/backup/download` | query `runId` | query `source` — same as #1 |
| 3 | verify-checksum | server.js:11112 POST `/api/backup/verify-checksum` | `readJson(req)` → `body.runId` (:11131-11132) | `body.source` — camelCase body field (102-01 POST ruling precedent; all restore POST bodies already camelCase: runId, targetWorkspaceId, targetId, targetProjectId, confirmName, confirmPhrase) |
| 4 | restore (import_new) | server.js:10479 POST `/api/backup/restore` | `body.runId` (:10487) | `body.source`; validate synchronously AFTER row read, BEFORE `claimRestoreLock` (:10544-10550); pass into `runRestore({ ..., source })` (:10551) |
| 5 | restore/instance | server.js:10596 POST `/api/backup/restore/instance` | `body.runId` (:10604) | `body.source`; same position — after row/scope gates (:10624-10630), before lock claim + `restoreInstanceUnit({ ..., source })` (:10649) |
| 6 | restore/overwrite | server.js:10693 POST `/api/backup/restore/overwrite` | `body.runId` (:10700) | `body.source`; same position — before lock claim + `restoreOverwriteUnit({ ..., source })` (:10791) |

**Units:** `runRestore` (:2225-2241), `restoreInstanceUnit` (:2490 area — call at :2481), `restoreOverwriteUnit` (:1774) each read `opts.s3Config/ftpConfig/smbConfig` today [VERIFIED: export/restore.js:1774, 2241, 2481]. Add `source: opts.source` pass-through into their existing `resolveRestoreSource(...)` opts object. **Units must also validate at unit entry** (failWith keyed) because they are fire-and-forget — a unit refusing via its own envelope is how the existing `restoreArchiveMissing` refusal reaches the run row / response; do not throw raw past the funnel (89-05 CR: a stranded lock wedges every later restore AND backup run).

**Route-level synchronous validation (all three trigger POSTs):** after the row is read (flags available), before lock claim:
```js
// Source: pattern from [VERIFIED: server.js:10487-10491] runId idiom
const source = body?.source === undefined ? null
  : (['local','s3','ftp','smb'].includes(body.source) ? body.source : 'invalid');
if (source === 'invalid'
  || (source === 's3' && row.uploaded !== 1) || (source === 'ftp' && row.ftp_uploaded !== 1) || (source === 'smb' && row.smb_uploaded !== 1)) {
  await auditBackupTask(user, 'restore_refused:restoreSourceNotMirrored');
  return fail(res, 400, 'restoreSourceNotMirrored', 'That backup archive has no surviving copy at the requested source');
}
```
Route refusal = a refused trigger never touches the lock (D-89-23 precedent: "targeting validates LIVE membership at trigger time, BEFORE the lock claim" — server.js:10517-10520 doctrine).

For the sync routes (#1-3): same check after the row read, keyed 404/400 before `resolveRestoreSource` is ever called — the helper's own check remains the funnel-of-record but the route owns the HTTP envelope.

## Keyed Refusal Inventory

**×5 = the five locale files.** [VERIFIED: `ls src/locales/` → de.json, en.json, es.json, fr.json, nl.json — 5 files; `err.*` keys live mid-file around :1795-1817 in en.json].

**New keys (recommend 2, planner may collapse to 1):**
| Key | When | Audit token | Suggested en text |
|-----|------|-------------|-------------------|
| `err.restoreSourceInvalid` | `source` present but not in the 4-value enum | `restore_refused:restoreSourceInvalid` (preview/trigger) / `backup_download_refused:restoreSourceInvalid` / `backup_verify_refused:restoreSourceInvalid` | "That restore source is not recognized" |
| `err.restoreSourceNotMirrored` | valid enum but the run's flag ≠ 1 (or destination disabled under explicit source) | `restore_refused:restoreSourceNotMirrored` (+ per-family prefixes as above) | "That backup archive has no surviving copy at the requested source" |

- **Naming aligned with the existing restore family** (`err.restoreInvalidRunId` :1811, `err.restoreArchiveMissing` :1806, `err.restoreShaMismatch` :1810 [VERIFIED: src/locales/en.json:1806-1816]) — `restoreSource*` continues the family; do NOT reuse `restoreArchiveMissing` (its client CTA/badge semantics are pinned — goldens pin those envelopes verbatim).
- **Same commit rule:** `fail(res, …, 'restoreSourceNotMirrored', …)` + the five `err.restoreSourceNotMirrored` locale entries land in the same commit (house convention — fail() codes map 1:1 to err.* keys).
- **Refusal hooks — helper vs callers:** the helper returns the structured result (reason `sourceInvalid`/`sourceNotMirrored`, err.code stays `restoreArchiveMissing` for the default-path results — do NOT introduce a new err.code there); CALLERS own the HTTP/unit envelope strings and audit tokens. The goldens pin envelopes at callers [VERIFIED: test/restore-source-resolution.test.mjs:14-17 "Per-site refusal ENVELOPES … pinned VERBATIM at each caller's slice: plan 02 keeps envelopes at callers, so these pins survive; if 02 moves a string, the golden breaks BY DESIGN"] — moving refusal text into the helper would break them by design.

## Probe Route Spec (RSRC-03)

**Copy the existing probe funnel family** — the ftp-probe route is the freshest clone [VERIFIED: server.js:9858-9885]:

| Guard | Precedent (ftp-probe :9860-9871) | Restore-probe adaptation |
|-------|----------------------------------|--------------------------|
| sameOrigin | `fail 403 crossOriginRejected` | verbatim |
| requireUser | verbatim | verbatim |
| throttle | `tooMany(\`backupprobe\|${user.id}\`, 10, 15*60*1000)` | **new dedicated key** `restoreprobe\|${user.id}`, 10 / 15 min — R-4 "dedicated throttled POST"; do NOT reuse `backupprobe` (different guarded resource — network egress per run mirror) |
| capability | `CAP.BACKUP_MANAGE` only | `CAP.RESTORE_USE` **or** `CAP.BACKUP_MANAGE` (the restore-preview tier — the probe serves the restore drawer; mirror preview/download's dual-role gate at :11012-11014) |
| enabled gate | `!FTP.enabled → 400 ftpNotConfigured` | row-level instead: runId regex → row read (flags included) → requested source flag ≠ 1 → keyed `restoreSourceNotMirrored` 400. Destination-config check rides the probe result (a probe of a disabled dest returns its keyed unreachable/auth class — that IS the availability answer) |
| probe call | `probeFtp(FTP.config())` | per source: `probeS3(S3.config())` / `probeFtp(FTP.config())` / `probeSmb(SMB.config(), { onError: e => logWarn(...) })` [VERIFIED: server.js:9497, 9511, 9524 idioms] |
| response | `json(res, 200, result)` — probe seam keyed result VERBATIM | verbatim: `{ ok, key, warning, httpWarning? }` (+ `guest` for smb) |
| audit | `backup_s3_probe_ok/failed`, detail = `result.key` only (never config — Pitfall 5/T-98-04) | `restore_probe_ok` / `restore_probe_failed:<source>`, detail = `result.key` only |
| failure log | `logProbeFailure('ftp', result)` | same helper |

**Recommended shape (planner's call on path):**
```
POST /api/backup/restore/probe    body: { runId: '<id>', source: 's3'|'ftp'|'smb' }
→ 200 { ok, key, warning?, httpWarning?, guest? }   (probe result verbatim)
→ 400 restoreSourceInvalid / restoreSourceNotMirrored / s3NotConfigured-family keyed refusals
→ 404 taskNotFound / restoreArchiveMissing (row missing)
```
- **No `local` probe** — local availability is `fs.existsSync`, already surfaced via the run row; probing writes a remote marker, which is meaningless for local. Restrict `source` to s3/ftp/smb in this route.
- **Never mutates run state** — no `clearMirrorFlag`, no lock, no staging, no restore_runs row. The probe marker PUT/DELETE touches the DESTINATION only (existing seam behavior).
- **Never on list GET** — verified: the restore/backups list GET (server.js:10340-10383), runs GET (:10094) and all=1 GET (:10110) contain zero probe-seam calls [VERIFIED: grep — probeS3/probeFtp/probeSmb appear only at server.js:9497/9511/9524/9726/9739/9751/9836/9871/9901, all inside config-save + probe-route handlers]. The plan must keep it that way.

## sources[] Placement

**Where run rows ride payloads today:** `/api/backup/restore/backups` GET (server.js:10340-10383) — per-run: runId, taskId, trigger, status, **location** (destLocation), **uploaded/ftp_uploaded/smb_uploaded raw flags** (client currently derives secondary badges — the 2026-11-26 UAT reveal), filename, sizeBytes, sha256, timestamps.

**Recommendation:** add `sources: [...]` per run in THIS list GET only (the restore drawer's list is the surface that drives source choice):

```js
// Source: derivation from flags [VERIFIED: server.js:10359-10374] — flags selected in the same query
const sources = [];
const localOk = !!r.filename && fs.existsSync(path.join(backupsRoot(), r.filename));
if (localOk) sources.push('local');
if (r.uploaded === 1 && S3.enabled) sources.push('s3');
if (r.ftp_uploaded === 1 && FTP.enabled) sources.push('smb' === '' ? null : 'ftp');
if (r.smb_uploaded === 1 && SMB.enabled) sources.push('smb');
```
- **Enabled-only (dormant-slot contract):** a flag=1 whose destination config is disabled is EXCLUDED from `sources[]` (the slot is dormant — the client must not offer it; an explicit request for it still refuses keyed). This is why the client never derives authority (D-23): it renders `sources[]` verbatim.
- **Order:** `local` first, then s3 > ftp > smb — mirrors the registry order (D-04).
- **Optional (planner's call):** also surface `sources` in the preview GET response (it already computes `hasLocal` at :10883) for the drawer's per-run confirmation. Low cost, not required by RSRC-03 wording.
- Note: the existing raw flags stay in the payload (the goldens/UI badge tests may pin them) — `sources[]` is additive.

## Stage Vocabulary Freeze

[VERIFIED: grep stage emissions in export/restore.js] — restore stages in use: `fetching` (:2230), `validating` (:1001, :1832, :2550), `restoring` (:1044, :1605, :2033, :2715), `verifying` (:1183, :1658, :2131, :2843). Backup export stages: `collecting/archiving/verifying/uploading` (export/backup.js:162). **No new stage value, no new status, no new `emitRestoreEvent` kind.** The explicit-source refusal happens at trigger time (before the run row exists) or inside the unit's existing `failWith` funnel (persisted via the existing `error` column as `<code>: <message>` — the detail rides TEXT, exactly as RSRC-02 demands).

## Golden Impact Analysis (16 cases, test/restore-source-resolution.test.mjs)

The golden's contract [VERIFIED: test/restore-source-resolution.test.mjs:1-25]: behavioral pins (selection order, local-first beats all-flags-set) through the real preview route + restoreOverwriteUnit engine, and verbatim envelope strings pinned at each caller slice.

| RSRC-02 change | Golden impact | Mitigation |
|----------------|---------------|------------|
| `opts.source` added to helper (undefined default) | NONE if default path byte-identical | the helper's new branch sits entirely behind `if (opts.source !== undefined)` |
| Route-level synchronous validation inserted before resolveRestoreSource | NONE — goldens never send `source`; the pre-existing refusal paths (no flags → restoreArchiveMissing 404) are unchanged | new validation fires only when `body?.source`/query `source` is present |
| Envelope strings stay at callers | NONE by design | do NOT move "could not be fetched from X" / "lives in X but no X destination is configured" into the helper |
| New refusal codes/audit tokens | NONE for existing tokens | goldens pin existing tokens verbatim; new tokens only on new paths |
| sources[] added to list GET | NONE (list GET not golden-pinned for shape beyond existing fields — additive field) | keep raw flags + location fields untouched |
| Explicit+disabled refuses in units (skip-mode divergence resolved for explicit source) | NONE for default path | goldens exercise default (no source) only |

**New tests go in a NEW file** (e.g. test/restore-source-param.test.mjs) — the golden file header forbids relying on it changing ("plan 02 … must pass this file unchanged"). Mirror its harness (server harness + in-process engine harness, helpers/server.mjs). Cover: default omission = registry order (already covered by goldens, re-assert); each enum value; invalid enum → keyed refusal ×-locale-code; not-mirrored flag → keyed refusal; explicit+local missing → no mirror fall-through; explicit+disabled dest → refusal in BOTH disabledBehavior modes; trigger POST refuses before lock claim (lock still free after refusal); probe route: ok result, keyed unreachable, not-mirrored refusal, throttle key separation, no run-state mutation (flags unchanged after probe), list GET probe-free (assert no probe calls fired — e.g., probe-seam call-count spy or absence of marker PUTs).

## Common Pitfalls

### Pitfall 1: Deriving truth from anything but flags (R-4 violation)
**What goes wrong:** validating `source` against `S3.enabled` alone, or probing to decide availability. **Avoid:** flags ARE the truth for existence; `enabled` only filters `sources[]` display; probe only answers "is the destination reachable NOW".
### Pitfall 2: Moving refusal strings into the helper
Breaks goldens by design (envelopes pinned at callers). Helper returns structured results; callers own text.
### Pitfall 3: Validating after lock claim
A refused trigger that consumed the lock wedges later restores (89-05 CR). Validate before `claimRestoreLock`, mirroring the D-89-23 membership-check position.
### Pitfall 4: Probing on GET / list payloads
D-89-14 — the list GET is read-only, never probes. Probe route is POST-only, dedicated throttle key.
### Pitfall 5: New stage enums
RSRC-02: detail lives in error text + audit, never new statuses. Refusal reason rides `failWith`'s existing `error` text and audit tokens.
### Pitfall 6: `source: 'local'` silently falling through to mirrors
Explicit local means local. A gone local file under explicit local = `reason:'missing'` refusal, never the registry walk.
### Pitfall 7: Locale keys added in only en
All five files (en/de/es/fr/nl) in the same commit — `fail()` codes map 1:1 to err.* keys; a missing key renders raw in one language.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| reachability check | custom ping/HEAD logic | probeS3/probeFtp/probeSmb seams | keyed classes, marker lifecycle, scrub doctrine, TLS/guest handling all live there |
| throttle | custom counter | `tooMany()` | D-89-22 consume-on-refusal semantics |
| flag storage/derivation | new column/table | existing uploaded/ftp_uploaded/smb_uploaded | flags ARE the truth; no schema change |
| row shapes | normalization guesswork | helper's existing dual-shape normalization (:1380-1386) | already handles task_id/taskId, id/opts.runId |

## Runtime State Inventory

Not a rename/migration phase — but the runtime-state-relevant answer: **no stored-data, service-config, OS-registered, secrets, or build-artifact changes.** The `source` param is request-scoped; probe markers are transient destination objects (existing seam behavior). Nothing to migrate. No new env vars.

## Environment Availability

No external dependencies (zero-dep project). Probe seams require the destination to be REACHABLE at probe time — that is the thing being probed, not a build dependency. Node test runner (`node --test`) already in use. Nothing blocking.

## Validation Architecture

| Property | Value |
|----------|-------|
| Framework | node:test (built-in), concurrency 2 |
| Config | none — per-file harnesses (helpers/server.mjs) |
| Quick run | `node --test --test-concurrency=2 test/restore-source-resolution.test.mjs` (goldens) + new `node --test test/restore-source-param.test.mjs` |
| Full suite | repo test suite (node --test test/) |

| Req | Behavior | Test | File |
|-----|----------|------|------|
| RSRC-02 | omission = registry order | golden (unchanged) | test/restore-source-resolution.test.mjs |
| RSRC-02 | invalid/not-mirrored → keyed refusal | new unit+route tests | new file (Wave 0) |
| RSRC-02 | explicit source reaches the right seam | engine-harness test with fake seams | new file (Wave 0) |
| RSRC-03 | sources[] enabled-only derivation | list GET route test | new file (Wave 0) |
| RSRC-03 | probe POST keyed result / throttle / no mutation | route test with fake probe seam | new file (Wave 0) |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | "keyed refusal ×5" means 5 locale files (en/de/es/fr/nl), not 5 distinct keys | Keyed Refusal Inventory | planner ships 5 keys instead — harmless but heavier; confirm |
| A2 | Probe route capability = RESTORE_USE ∥ BACKUP_MANAGE (restore-preview tier) | Probe Route Spec | user-visible auth choice — confirm with owner if stricter (RESTORE_USE only) wanted |
| A3 | Throttle key `restoreprobe|<userId>` separate from `backupprobe` | Probe Route Spec | shared key would couple budgets — low risk either way |
| A4 | Probe route path `/api/backup/restore/probe` | Probe Route Spec | purely naming; user-visible only in client wiring |
| A5 | Two refusal keys (`restoreSourceInvalid`, `restoreSourceNotMirrored`) | Keyed Refusal Inventory | could collapse to one key — planner's call, flagged as gray area |
| A6 | `source: 'local'` is accepted (no fall-through to mirrors) | Source-Param Flow | if owner wants mirrors-only for explicit source, drop 'local' from enum |
| A7 | sources[] only in restore/backups list GET (preview optional) | sources[] Placement | gray area per phase context |

## Open Questions (RESOLVED — decided as GD-1..GD-8 in plans, commit 776c8521)

1. **Probe capability tier (A2)** — RESOLVED: `RESTORE_USE ∥ BACKUP_MANAGE` (GD-1, 104-02).
2. **`source: 'local'` semantics (A6)** — RESOLVED: accepted, fail-closed, no mirror fall-through (GD-2, 104-01).
3. **sources[] in preview response (A7)** — RESOLVED: backups GET only, not preview (GD-8, 104-02).

## Sources

### Primary (HIGH confidence — all read this session)
- export/restore.js:1378-1444 — resolveRestoreSource body, branch structure, err shapes
- export/restore.js:1774, 2241, 2481 — three unit call sites + envelopes
- server.js:10859-10995 (preview), 10999-11110 (download), 11112-11190 (verify-checksum) — sync route call sites + envelopes
- server.js:10479-10565 (restore POST), 10596-10662 (instance), 10693-10800 (overwrite) — trigger routes, lock claim, unit invocation opts
- server.js:9823-9914 — the three existing probe routes (funnel family to clone)
- server.js:10340-10383 — restore/backups list GET (sources[] host)
- export/s3.js:344-369, export/ftp.js:585-616, export/smb.js:1559-1595 — probe seam signatures/returns
- src/locales/en.json:1806-1816 — err.restore* key family; `ls src/locales/` — 5 files
- test/restore-source-resolution.test.mjs:1-80 — golden contract + harness

### Secondary
- .planning/phases/103-*/103-RESEARCH.md, 103-VERIFICATION.md, 103-02-PLAN.md, 103-02-SUMMARY.md — six-site map, envelope inventory, disabledBehavior divergence

## Metadata

**Confidence breakdown:** Standard stack HIGH (in-repo, all read); Architecture HIGH (anchors line-verified); Pitfalls HIGH (golden contract read verbatim); gray areas A1-A7 flagged as ASSUMED/planner-choice.
**Research date:** 2026-11-28. **Valid until:** stable in-repo domain — 30 days.
