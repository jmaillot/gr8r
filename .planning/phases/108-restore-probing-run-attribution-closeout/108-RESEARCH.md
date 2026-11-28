# Phase 108: Restore Probing, Run Attribution & Closeout — Research

**Researched:** 2026-11-28 (post-106 tree; every anchor re-read from source this session — several drifted from CARRIED-ITEMS.md's pre-106 numbers; this file is the authoritative anchor set)
**Domain:** zero-dependency Node restore pipeline (server.js + export/{s3,ftp,smb,restore}.js + src SPA + docs)
**Confidence:** HIGH (all in-repo, all read verbatim; no external packages)

## Summary

Phase 108 ships four carried items. CARRY-01 adds a per-run archive **stat** (read-only: S3 HEAD / FTP SIZE / SMB CREATE+CLOSE) as a **separate route** beside the 104 probe route (CARRIED-ITEMS.md ruling: the probe contract stays byte-identical to T-104 docs), returning an honest three-state result. CARRY-02 adds `restore_runs.created_by` via `adapterEnsureColumn`, captured at the **three existing start-event emit sites** (all sit in routes where `user` is already in scope — the event-payload route wins over post-insert stamping, exactly 3 call sites). CARRY-03 is one fixed `logWarn` in the SSO callback catch-all (server.js:7226). CARRY-04 is one DEPLOY.md table row (table now at :347-351).

**Primary recommendation:** one `POST /api/backup/restore/stat` route cloning the probe funnel verbatim (guards/audit ×5 from server.js:10228-10280), per-seam stat primitives exported from the three export modules (new names — they must NOT match the 104 pin's `probeS3|probeFtp|probeSmb` regex), a single `restoreRemoteKey(rowLike)` derivation helper extracted from resolveRestoreSource's line export/restore.js:1482, three-state result `{ ok, present?, key }`, an additive `data-a="restoreStat"` button beside the probe icon, `createdBy: user.id` on the three start events + one writer column, and two trivia fixes.

<user_constraints>
## User Constraints (from REQUIREMENTS.md rulings + CARRIED-ITEMS.md — no 108-CONTEXT.md exists)

### Locked Decisions
- **Stat-only, no destination writes** — pure read probing (HEAD / SIZE / CREATE+CLOSE), no marker, no `mirrorMissing → clearMirrorFlag` (flag-clearing stays with live fetches in resolveRestoreSource only; a stat never mutates flags). [VERIFIED: CARRIED-ITEMS.md:37]
- **Separate route, not `mode:'stat'` on the probe route** — the probe contract stays byte-identical to T-104 documentation. [VERIFIED: CARRIED-ITEMS.md:35]
- **Throttle unchanged (conservative)** — a stat is strictly cheaper than marker PUT+DELE; `restorestat|<uid>` 10/15min dedicated key. [VERIFIED: CARRIED-ITEMS.md:36]
- **Never mutates run state** (T-104-06 discipline): no restore_runs writes, no lock, no staging. [VERIFIED: CARRIED-ITEMS.md:40]
- **Audit detail = result.key ONLY**, never config (Pitfall 5 / T-98-04). [VERIFIED: CARRIED-ITEMS.md:39]
- **Three-state honest badge** — reachable+present / reachable+missing / unreachable. [VERIFIED: CARRIED-ITEMS.md:38]
- **created_by = additive `adapterEnsureColumn('restore_runs','created_by','text')`**, NOT a schema-block edit; no PG_EPOCH_COLUMNS registration (text uid, not epoch-ms integer); no pgSchemaVariant/copy-sqlite-to-pg change. [VERIFIED: CARRIED-ITEMS.md:60]
- **Never on list GET** (D-89-14). [VERIFIED: CARRIED-ITEMS.md:44]
- **No new stage/status enums** — badge state is response-local, not persisted. [VERIFIED: CARRIED-ITEMS.md:45]
- CARRY-03 wording locked: `logWarn('sso callback: token exchange or verification failed; redirecting to generic error')` — fixed, non-interpolated, NO `e.message`. [VERIFIED: CARRIED-ITEMS.md:90-91]
- CARRY-04 row content locked per CARRIED-ITEMS.md:110 (email optional-claim row). [VERIFIED: CARRIED-ITEMS.md:110]

### the agent's Discretion (planner gray areas)
- Stat route path name (recommended `/api/backup/restore/stat`), audit token names (`restore_stat_*` family mirroring `restore_probe_*`).
- Client wiring: new `data-a="restoreStat"` button vs re-skinning `A.restoreProbe` (costs enumerated in §Test-Pin Impact — planner's call).
- SMB stat implementation shape (client `stat` method vs exported standalone helper).
- `created_by` display: server-side `left join users` (recommended) vs uid-shipped-to-client.

### Deferred Ideas (OUT OF SCOPE)
- Full SMB QUERY_INFO (FileAllInformation) — "more protocol work for zero extra signal; skip it". [VERIFIED: CARRIED-ITEMS.md:31]
- Splitting item 3+4 into their own phase (folded here per CARRIED-ITEMS.md:132-138).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CARRY-01 | Per-run archive probing — stat-only, three-state result, badge semantics | §Per-Seam Stat Recipes, §Stat Route Spec, §Three-State Result Contract, §Client Badge Changes |
| CARRY-02 | `restore_runs.created_by` — capture at trigger routes, run-card render, legacy '—' | §created_by Capture Chain |
| CARRY-03 | Fixed non-interpolated logWarn in SSO callback catch | §CARRY-03 Exact Site |
| CARRY-04 | DEPLOY.md symptom row | §CARRY-04 Exact Site |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| per-run remote filename derivation | export/restore.js (shared helper) | — | single source of truth with resolveRestoreSource — the ladder drifted once (2026-11-27 UAT, CARRIED-ITEMS.md:23) |
| stat wire primitives (HEAD/SIZE/CREATE+CLOSE) | export/{s3,ftp,smb}.js (NEW exported fns) | — | seams own wire protocol; keyed classes live there |
| stat route guards/throttle/audit | API/Backend (server.js) | export seams | verbatim clone of the 104 probe funnel |
| three-state badge + toasts | Browser/Client (src) | — | S.ui state keyed runId\|source, t() rendering |
| created_by capture | API/Backend (3 trigger routes + writer) | — | `user.id` in scope at the emit sites |
| initiator display | Browser/Client (backup.js run row) | server.js runs GET (join) | server-side name resolution, client renders esc()'d |

## Standard Stack

**No new packages.** Zero-dependency posture. All facilities in-repo:

| Facility | Location | Purpose |
|----------|----------|---------|
| `s3Request(config, { method, key, query })` | export/s3.js:165 [VERIFIED: export/s3.js:165-232] | generic signed request — HEAD rides it, no signing change (HEAD carries no body; payloadHash defaults to sha256Hex('')) |
| `connectFtp(config)` → client with `size(targetPath)` | export/ftp.js:735 (client), size at :803-809 [VERIFIED: export/ftp.js:803-809] | `SIZE` command, expects 213, throws keyed on other codes |
| `ftpErrorFrom` class table | export/ftp.js:183-191 [VERIFIED: export/ftp.js:183-191] | `550 → err.code 'ftpPathNotFound'`, `421 → 'ftpUnreachable'`, `530 → 'ftpAuthFailed'` |
| `connectSmb(config)` client + `createFile`/`closeFile` frame builders | export/smb.js:1471 (connectSmb), createFile :1314-1324 area, closeFile :1375 [VERIFIED: export/smb.js:1314-1375, 1471-1545] | CREATE (FILE_OPEN_IF + FILE_RIGHTS_R) then immediate CLOSE = honest stat |
| `smbErrorFrom` status table | export/smb.js:581-598 [VERIFIED: export/smb.js:581-598] | `0xc0000034/3a/56 → 'pathNotFound'` (all three mean "not readable" — the 2026-11-27 DSM ruling) |
| `s3BackupKey(meta, filename)` | export/s3.js:444-446 [VERIFIED: export/s3.js:444-446] | `backup-task-${taskId}/${filename}` else `backup-manual/${filename}` |
| resolveRestoreSource's key expression | export/restore.js:1482 [VERIFIED: export/restore.js:1482] | `leg.dest === 's3' ? s3BackupKey({ taskId }, filename) : \`backup-task-${taskId}/${filename}\`` — THE derivation to reuse |
| probe funnel (clone source) | server.js:10228-10280 [VERIFIED: server.js:10228-10280] | guard chain + dispatch + audit pattern for the stat route |
| `restoreSourceFlag(row, source)` | server.js:6173 [VERIFIED: server.js:6173] | flag lookup helper already used by probe route (:10250) |
| `emitRestoreRunEvent` / `writeRestoreRunRow` | server.js:3864-3903 [VERIFIED: server.js:3864-3903] | start-insert at :3877-3879 gains created_by |
| `adapterEnsureColumn` | imported server.js (precedent: restore_runs.archive_name at server.js:1159 [VERIFIED: server.js:1159]) | additive DDL, engine-agnostic |

## CARRY-01 — Per-Seam Stat Recipes

### Filename derivation — single source of truth (REQUIRED)

The run's remote path is computed, not stored (`backup_runs.filename` is the local name; mirror flags are existence truth). Today resolveRestoreSource computes it inline at **export/restore.js:1482**:

```js
// Source: [VERIFIED: export/restore.js:1482] verbatim
const key = leg.dest === 's3' ? s3BackupKey({ taskId }, filename) : `backup-task-${taskId}/${filename}`;
```

with `taskId = rowLike.task_id ?? rowLike.taskId`, `filename = rowLike.filename` (:1381-1383). **Extract this expression into one exported helper** (e.g. `export function restoreRemoteKey(dest, rowLike)` in export/restore.js) used by BOTH resolveRestoreSource's fetch loop and the stat route. Do NOT duplicate the expression in server.js — the ladder drifted once (2026-11-27 UAT, CARRIED-ITEMS.md:23). Note the exact semantics being frozen: FTP/SMB legs use `backup-task-${taskId}/${filename}` **unconditionally** (no `backup-manual/` fallback — that is S3-only via s3BackupKey). Refactoring :1482 to call the helper must leave the 16 goldens byte-identical (default path unchanged — the helper is a pure extraction, R-5 discipline).

### S3 stat — new `headObject` (≈10 lines)

```js
// Source: pattern from [VERIFIED: export/s3.js:303-305 headBucket, :165 s3Request, :366-371 mapProbeError]
export async function headObject(config, key) {
  try {
    const res = await s3Request(config, { method: 'HEAD', key });
    return { present: true };           // 200
  } catch (e) {
    if (e?.s3Status === 404) return { present: false };
    throw e;                             // caller maps via mapProbeError idiom
  }
}
```

**Pitfall (this is the one S3 trap):** a HEAD response carries **no XML body**, so `s3ErrorFrom` finds no `<Code>` and — without a fallbackCode — maps 404 to `s3Class: 'generic'` [VERIFIED: export/s3.js:258-278 — CLASSES table has no 404 entry; generic is the default]. The stat must key off **`err.s3Status === 404`** (s3ErrorFrom stamps `err.s3Status` verbatim :273), NOT off a NoSuchKey s3Class. Auth/other classes (`badCreds`/`forbidden`/`clockSkew`/`generic`) map through the existing `mapProbeError(e, base)` idiom [VERIFIED: export/s3.js:366-371]. Signature/idempotency: HEAD is read-only, SigV4 signs it exactly like headBucket (:303-305 does `s3Request(config, { method: 'HEAD' })` today) — no payload, no content-length, no signing change.

### FTP stat — wrap the existing `size()`

`connectFtp(config)` returns a client whose `size(targetPath)` (:803-809) issues `SIZE`, expects 213, and on a non-matching code throws via `cmdExpect → ftpErrorFrom(code, …)` [VERIFIED: export/ftp.js:619, :803-809]. Mapping:

- resolves a finite number → **present**
- `err.code === 'ftpPathNotFound'` (code 550 — the file/dir-unavailable class) → **missing** [VERIFIED: export/ftp.js:186]
- anything else (`ftpUnreachable` 421, `ftpAuthFailed` 530, `ftpGeneric`) → **unreachable** (key rides err.code verbatim)

The SIZE command is read-only; no TLS/passive change. Note ftp.js:11 documents the client surface `{ …, size, noop, quit, end }` — size is a first-class citizen, already exercised by the backup verify path (export/backup.js:964 uses `ftp.size(ftpKey)` on the same key shape).

### SMB stat — CREATE + immediate CLOSE (the only real protocol work)

No query/info primitive exists in the connectSmb client [VERIFIED: export/smb.js:1471-1545 — surface is write/read/rm/echo/close only]. Recommended: add a `stat` method to the client (or an exported `statSmb(config, remoteKey)` in the probeSmb shape):

```js
// Source: pattern from [VERIFIED: export/smb.js:1487-1496 read(), :581-598 smbErrorFrom table]
stat: async (path) => {
  const s = await ensure();
  // FILE_OPEN_IF + read rights — the SAME CREATE frame read() sends, minus the READ
  const fileId = await createFile(s, path, { access: FILE_RIGHTS_R, disposition: FILE_OPEN_IF });
  await closeFile(s, fileId, `stat ${path}`);
  return true;
},
```

**Delete-on-close warning:** `rm()` achieves delete via `FILE_DELETE_ON_CLOSE` + DELETE access on the CREATE [VERIFIED: export/smb.js:1497-1509]. The stat frame MUST use plain `FILE_RIGHTS_R` + `FILE_OPEN_IF` with NO createOptions — read() (:1487-1496) is the proven template; its CREATE closes without side effects today.

Failure mapping (all via expectOk → smbErrorFrom):
- `err.smbClass === 'pathNotFound'` (statuses 0xc0000034 OBJECT_NAME_NOT_FOUND, 0xc000003a PATH_NOT_FOUND, 0xc0000056 DELETE_PENDING — all three deliberately mean "not readable", 2026-11-27 DSM ruling) → **missing** [VERIFIED: export/smb.js:589-598]
- other smbClass (`authFailed`, `shareNotFound`, `treeConnectFailed`, `nameConflict`, `noSpace`, `sessionExpired`, `smbGeneric`) → **unreachable**, key verbatim
- connection/tree-connect failure before CREATE → **unreachable** (probeSmb's `e?.smbClass || 'unreachable'` idiom, :1571-1579)

Close must be fire-and-forget on failure like the other arms (`.catch(() => {})` — close failure never masks the stat result, :1476/:1488 idiom). Full QUERY_INFO is explicitly OUT OF SCOPE (CARRIED-ITEMS.md:31).

### Stat Route Spec (server.js — clone of :10228-10280)

`POST /api/backup/restore/stat` body `{ runId, source }` (source restricted to s3/ftp/smb — GD-4 parity). Guard chain verbatim from the probe route, in order [VERIFIED: server.js:10228-10250]:

| Guard | Probe precedent | Stat adaptation |
|-------|-----------------|-----------------|
| sameOrigin → requireUser | :10229-10230 | verbatim |
| throttle | `restoreprobe\|${user.id}` 10/15min (:10231) | **new key** `restorestat\|${user.id}`, same 10/15min budget |
| capability | RESTORE_USE ∥ BACKUP_MANAGE (:10232-10237) | verbatim (audit `restore_stat_refused:restoreRoleRequired`) |
| runId regex + row read | :10240-10246 | verbatim (`restore_stat_refused:restoreArchiveMissing` 404) |
| source enum + flag check | :10247-10251 (`restoreSourceFlag`) | verbatim (`restore_stat_refused:restoreSourceInvalid` / `:restoreSourceNotMirrored`) |
| stat dispatch | probeS3/probeFtp/probeSmb (:10262-10265) | **NEW seam fns** (see naming rule below) with the family's `onError: e => logWarn(...)` idiom for smb |
| audit | `restore_probe_ok` / `restore_probe_failed:<source>`, detail = result.key (:10267) | `restore_stat_ok` / `restore_stat_failed:<source>`, detail = result.key ONLY |
| response | result VERBATIM :10271 | three-state contract below |

**D-89-14 pin naming rule (critical):** the 104 pin test counts `await (probeS3|probeFtp|probeSmb)\(` call sites in server.js and asserts **exactly 12**, each inside an allowed route [VERIFIED: test/restore-source-param.test.mjs:871-890 — regex, `allowed` array, `assert.equal(seen.length, 12)`]. The stat route must therefore call **differently-named functions** (`statS3(config, key)` / `statFtp(config, key)` / `statSmb(config, key)` — or headObject/size-based wrappers). If the stat route called probeS3/probeFtp/probeSmb, the pin breaks (13 ≠ 12 and route not in `allowed`). The plan should also **extend the pin** (new assertion or widened regex + count) to cover the stat seams so list-GETs can never quietly gain stat calls — mirroring the existing list-slice assertion (:888-890).

### Three-State Result Contract

```
200 { ok: true,  present: true,  key: 'archivePresent' }              // reachable + archive there
200 { ok: false, present: false, key: 'archiveMissing' }              // reachable, archive gone (per source)
200 { ok: false, key: 'unreachable' | 'badCreds' | 'ftpUnreachable' | 'ftpAuthFailed' | 'pathNotFound' | … }  // seam class verbatim
400/403/404/429 keyed refusals — same code family as the probe route (restoreInvalidRunId / restoreArchiveMissing /
    restoreSourceInvalid / restoreSourceNotMirrored / backupRoleRequired / tooManyAttempts) → NO new err.* locale keys
```

Refusal codes are **reused, not new** — the err.restoreSource* / restoreInvalidRunId family already exists in all 5 locales [VERIFIED: src/locales/en.json:1807-1808 + 105-01 5-locale parity test]. **No new err.* keys.** The stat never mutates anything: no clearMirrorFlag (that happens only on live FETCH failure inside resolveRestoreSource, export/restore.js:1503-1505 — read this session), no run-row write, no lock, no staging.

### Client Badge Changes (backup.js + actions.js + api.js)

Current state [VERIFIED: src/pages/backup.js:696-712 — sourcePicker; src/actions/actions.js:6119-6139 — A.restoreProbe; src/core/api.js:637 — the probe POST]:
- Badge today: two states — `probe.result.ok ? t('page.restore.sourceProbeOk') : t('page.restore.sourceProbeFail')` with `title` = raw key, green class on ok.
- State keyed `${runId}|${source}` in `S.ui.restoreProbe`.

Third state (additive — do NOT restructure the two pinned branches):
- `ok === true` → green "Available" (unchanged)
- `ok === false && key === 'archiveMissing'` → new badge, e.g. red/neutral, `t('page.restore.sourceProbeMissing')`
- `ok === false` otherwise → "Unreachable" (unchanged)

**Pinned substrings that MUST survive** [VERIFIED: test/restore-client.test.mjs:468-484 — these are `assert.match` pins, so additive ternary branches are safe as long as the pinned text stays literal]:
- `probe.result.ok ? 'green'` (:473)
- `title="${esc(String(probe.result.key || ''))}"` (:474)
- `page.restore.sourceProbeOk` / `page.restore.sourceProbeFail` consumption (:475-476)
- `s !== 'local'` no-probe-control-for-local (:471)
- chip never disabled by a probe result (:479-482)

**Wiring options (planner's call — CARRIED-ITEMS is silent on the button):**
1. **Additive (recommended):** a second `data-a="restoreStat"` icon button beside the probe ibtn; `api.restoreStat` + `A.restoreStat` + `S.ui.restoreStat` keyed the same way. Cost: data-a pins 632→633 in TWO files (test/i18n-toast.test.mjs:301, test/i18n-shell.test.mjs:349 — both pin `assert.equal(a, 632, 'data-a sites')` with a same-commit running comment), verb pin 85→86 (test/i18n-core-features.test.mjs:171, `assert.equal(verbs.length, 85)`), new 105-01-style test block in restore-client.test.mjs, new locale keys.
2. Re-skin `A.restoreProbe` to call the stat instead: zero data-a delta, but BREAKS test/restore-client.test.mjs:444-463 pins (one `api.restoreProbe` call site inside A.restoreProbe, probe POSTs the live Phase-104 route, `restore(Missing)?Toast` refusal mapping) — those pins would need updating with a same-commit comment. Rejected as noisier; the destination probe remains a legitimate surface.

Toast family: `restoreProbeToast(source, key, data)` (actions.js, keyed per-source mapping) extends with the stat keys; refusals ride the existing closed `restoreMissingToast(code, data)` map (:5134) unchanged — no new refusal keys.

### i18n Inventory (×5 locale files, same-commit rule)

Existing [VERIFIED: src/locales/en.json:2415-2418]: `page.restore.sourceProbeCheck/Checking/Ok/Fail`. New keys (all in en/de/es/fr/nl in the SAME commit — 5-locale parity is pinned by test/restore-client.test.mjs:486-499 for the whole `page.restore.*` set):

| Key | Purpose |
|-----|---------|
| `page.restore.sourceProbeMissing` | third badge state ("Archive missing") |
| `page.restore.sourceStatCheck` | new button aria-label (if additive wiring) |
| `page.restore.sourceStatChecking` | pending label |
| `page.restore.initiatorLabel` | run-card initiator line label |

Toast strings for stat outcomes ride `restoreProbeToast`'s keyed mapping — planner may need 1-2 more `page.restore.sourceStat*` toast keys; count them before writing the locale edits. **No new `err.*` keys** (refusal codes reused). The `page.restore.*` key-set parity assertion means: ANY key added under that prefix must land in all five files or the set-hash test fails.

## created_by Capture Chain (CARRY-02)

### DDL — one line

```js
// Source: precedent [VERIFIED: server.js:1159] — insert adjacent
await adapterEnsureColumn('restore_runs', 'created_by', 'text');
```

Nullable text uid. **Do NOT touch** the `create table if not exists restore_runs` block (server.js:977-992) — fresh installs get the column via ensureColumn identically, and the runSchema comment-splitting rule (comments never end a line with `;`, :916-929) is a live hazard. No PG_EPOCH_COLUMNS entry (that registry is epoch-ms integers only). No copy-sqlite-to-pg change.

### Capture — the event-payload route (exactly 3 sites, all hold `user`)

The three start events [VERIFIED: server.js:10935, :11043, :11195] all sit inside routes after `requireUser`:

| Route | Line | start event | trigger |
|-------|------|-------------|---------|
| POST /api/backup/restore (:10854) | :10935 | `emitRestoreRunEvent({ kind: 'start', …, trigger: 'import_new', … })` | import_new |
| POST /api/backup/restore/instance (:10982) | :11043 | `… trigger: 'instance' …` | instance |
| POST /api/backup/restore/overwrite (:11089) | :11195 | `… trigger: 'overwrite' …` | overwrite |

Recipe: add `createdBy: user.id` to each payload. (Post-insert stamping was the alternative; rejected — the emit sites number exactly 3, all route-scoped, so threading the payload is strictly simpler.) The restore/upload route (:10767) emits NO start event (it inserts a backup_runs row, not restore_runs) — untouched.

### Writer — one column in the start insert

```js
// Source: [VERIFIED: server.js:3876-3880] — 'start' branch gains the column
'insert into restore_runs (id, scope, trigger, status, stage, archive_name, created_by, started_at, created_at) values (?,?,?,?,?,?,?,?,?)',
[……, typeof event.createdBy === 'string' ? event.createdBy : null, event.startedAt, now()],
```

Best-effort discipline unchanged (writer errors never fail a restore, :3869-3873). 'update'/'fail'/'finish' branches untouched (created_by is write-once at start).

### List payload + render + legacy

- runs GET (server.js:11242-11252) selects explicit columns [VERIFIED: server.js:11247-11248]; add `created_by` plus the display name via `left join users u on u.id = r.created_by` adding `u.name as created_by_name` (server-side resolution — one place, no client round-trip; CARRIED-ITEMS.md:75 recommendation). The payload spreads `...r` so both fields ride automatically.
- Render: `restoreRunTr` (src/pages/backup.js:777-814). The **Trigger cell is currently a hardcoded `—`** at backup.js:809 (`<td class="faint">—</td>`) with the comment "Trigger is an honest '—' (restores are always operator-triggered)" (:775) — the natural home: render `${run.created_by_name ? esc(run.created_by_name) : '—'}` there. Legacy rows (created_by null) → '—' (same fallback idiom as archive_name pre-column rows, :789-790). **Check:** test/restore-client.test.mjs pins on restoreRunTr markup exist (restoreRunErr pins) — grep that file for trigger-cell pins before editing; no pin on the literal '—' cell was found this session, but verify at plan time.
- Do NOT display raw uids.

## CARRY-03 Exact Site — SSO callback catch-all

**Drifted anchor: server.js:7226-7229** (CARRIED-ITEMS said :7092 — the callback handler grew in 106). [VERIFIED: server.js:7226-7229, read verbatim this session:]

```js
    } catch {
      /* Pitfall 7: exchange/verification failures (timeout, HTTP error,
         malformed token) fail closed to the same generic redirect. */
      return errorRedirect();
    }
```

This is the handler's outer catch (handler opens at server.js:6694; the inner identity-insert catch at :6810 is a DIFFERENT catch — a UNIQUE-constraint backstop that rethrows non-UNIQUE errors — do not touch it). Change: add one fixed line inside the catch before the return:

```js
logWarn('sso callback: token exchange or verification failed; redirecting to generic error');
```

The catch binds no error variable — keep it that way (non-interpolated discipline: an OIDC error body can ride exception text; nothing here goes through the 97-scrub path). `logWarn` is already imported server-side (used at :6871 in the same handler family). Test impact: no behavior/envelope change; grep `test/` for an oidc-callback failure golden before merging (none found this session, but the file count is large — planner verifies).

## CARRY-04 Exact Site — DEPLOY.md symptom row

**Drifted anchor: docs/DEPLOY.md:347-351** (CARRIED-ITEMS said :342-346). [VERIFIED: docs/DEPLOY.md:347-351 — header row at :347, three existing rows]. Append one row after :351, same register (verbatim from CARRIED-ITEMS.md:110):

```markdown
| One user fails sign-in where another succeeds | Azure AD omits the optional `email` claim for that user's token, so `email_verified` linking fails closed | Azure portal → App registration → Token configuration → Add optional claim → `email` |
```

No anchor shifts (pure table-row append, before the smoke-test checklist).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| remote filename derivation | re-typing the key template in server.js | extracted `restoreRemoteKey` shared with resolveRestoreSource | the ladder drifted once (2026-11-27 UAT) |
| S3 stat | GET-and-discard or ListObjects-prefix scan | HEAD via s3Request | 404 is unambiguous, zero payload, existing signing |
| FTP existence | RETR-into-nowhere or LIST parsing | existing `size()` (:803) | keyed 550 class already exists |
| SMB existence | QUERY_INFO protocol work | CREATE+CLOSE reusing `createFile`/`closeFile` | read() is the proven frame; existence is all the badge needs |
| throttle / audit / guards | new funnel | verbatim clone of :10228-10250 | D-89-22 consume-on-refusal, keyed ×5, no-oracle order |

**Key insight:** every seam already contains the primitives or the exact frame template — the phase's real work is the SMB stat method and the route clone, everything else is wiring.

## Common Pitfalls

### Pitfall 1: S3 404 misclassified as `generic`
**What goes wrong:** mapping headObject errors through `mapProbeError` alone — a HEAD 404 has no `<Code>` body, so s3Class = 'generic' → renders "Unreachable" instead of "Archive missing". **Avoid:** test `e?.s3Status === 404` FIRST [VERIFIED: export/s3.js:258-278]. **Warning signs:** stat of a deleted key shows unreachable, not missing.
### Pitfall 2: SMB stat carrying delete-on-close
Using `FILE_DELETE_ON_CLOSE`/DELETE access (the rm() frame) would DELETE the archive on stat. Use read()'s frame verbatim minus the READ [VERIFIED: export/smb.js:1487-1509]. **Warning signs:** an e2e stat test where the subsequent fetch 404s.
### Pitfall 3: Stat route calling probeS3/probeFtp/probeSmb
Breaks the 12-site D-89-14 pin (count + allowed-route). New seam names only [VERIFIED: test/restore-source-param.test.mjs:871-890].
### Pitfall 4: Duplicating the key derivation
A second copy of `backup-task-${taskId}/${filename}` in server.js re-opens the ladder-drift wound. Extract one helper, refactor :1482 to call it, goldens prove byte-identity.
### Pitfall 5: created_by in the schema block or PG_EPOCH_COLUMNS
Both are wrong registries (CARRIED-ITEMS.md:60-61). ensureColumn only; nullable text; no epoch entry.
### Pitfall 6: Breaking the 105-01 client pins
The third badge branch must keep the pinned substrings literal (`probe.result.ok ? 'green'`, title attr, Ok/Fail keys) — additive ternary, no restructure [VERIFIED: test/restore-client.test.mjs:468-484].
### Pitfall 7: Locale keys added in only some files
`page.restore.*` set-hash parity across 5 locales is pinned; one missing file fails the suite. All new keys ×5 in the same commit.
### Pitfall 8: Stat mutating flags
A stat that calls clearMirrorFlag violates the locked no-mutation decision; flag-clearing belongs to live fetches only (resolveRestoreSource:1503-1505).
### Pitfall 9: data-a / verb pin counts forgotten
Each new data-a button = +1 in TWO pin tests (i18n-toast:301, i18n-shell:349, both `assert.equal(a, 632)`); each new api call = +1 verb (i18n-core-features:171, `assert.equal(verbs.length, 85)`). Same-commit comment trail per house convention.

## Test-Pin Impact (enumerated exactly)

| Test file | Pin | Impact |
|-----------|-----|--------|
| test/restore-source-param.test.mjs:871-890 | 12 probe-seam sites, allowed routes, list-slice clean | PASSES unchanged IF stat uses new fn names; plan EXTENDS the pin to cover stat seams (+ allowed route, new count) |
| test/restore-source-param.test.mjs:648-686 | probe route live-seam tests, audits, flags unchanged | untouched (probe route byte-identical) |
| test/restore-client.test.mjs:444-463 | one api.restoreProbe site, refusal vocabulary | untouched under additive wiring; breaks under re-skin wiring |
| test/restore-client.test.mjs:465-484 | badge markup regexes | additive third state OK (pinned substrings preserved) |
| test/restore-client.test.mjs:486-499 | 5-locale page.restore.* parity | +N keys ×5 same-commit |
| test/i18n-core-features.test.mjs:171 | verbs == 85 | → 86 (one api.restoreStat) with comment |
| test/i18n-toast.test.mjs:301 / test/i18n-shell.test.mjs:349 | data-a == 632 | → 633 (one restoreStat button) with comment |
| goldens (test/restore-source-resolution.test.mjs) | 16 cases, default path | pure extraction of :1482 must stay byte-identical — run goldens on the refactor commit |
| SSO / DEPLOY | none found | grep for oidc-callback failure goldens at plan time |

New tests (Wave 0 / new file e.g. test/restore-stat.test.mjs, mirroring restore-source-param harness): present/missing/unreachable per seam via fake seams; refusal clone ×5 audits; throttle key separation; flags byte-identical after stat; list GET stat-free (extended D-89-14); client: badge three states, toast mapping, single call site, zero-stat-on-load.

## Runtime State Inventory

Not a rename/migration phase. Category answers: **stored data** — existing restore_runs rows get `created_by = NULL` via ensureColumn (rendered '—'; no backfill required); **live service config** — none; **OS-registered state** — none; **secrets/env vars** — none (no new env); **build artifacts** — none. Verified by reading the DDL/writer sites above.

## Environment Availability

No external dependencies (zero-dep project). Stat targets must be reachable at stat time — that is the thing being probed. Node test runner already in use. Nothing blocking.

## Validation Architecture

| Property | Value |
|----------|-------|
| Framework | node:test (built-in), concurrency 2 |
| Quick run | `node --test test/restore-source-param.test.mjs test/restore-client.test.mjs test/i18n-core-features.test.mjs` |
| Full suite | repo suite (`node --test test/`) |

| Req | Behavior | Test | File |
|-----|----------|------|------|
| CARRY-01 | three-state per seam | route tests w/ fake seams | new file (Wave 0) |
| CARRY-01 | list GETs never stat | extended D-89-14 pin | test/restore-source-param.test.mjs (extend) |
| CARRY-02 | created_by end-to-end (trigger → row → payload → render) | trigger route + runs GET test | new file (Wave 0) |
| CARRY-03 | fixed logWarn present, non-interpolated | static source assert (mirror D-89-14 style) | new/extended file |
| CARRY-04 | row present in table | trivial source assert or skip | — |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Additive `data-a="restoreStat"` button (option 1) is the right client wiring | Client Badge Changes | re-skin option breaks 105-01 pins instead — planner's call, both costs enumerated |
| A2 | SMB `stat` as a connectSmb client method vs standalone exported fn — either is fine | SMB stat | purely internal shape; pin test unaffected either way |
| A3 | Server-side `left join users` for display name | created_by | client-side resolution would need a cache — CARRIED-ITEMS recommends join; confirm |
| A4 | No existing test pins the literal '—' Trigger cell | created_by render | one grep at plan time (restore-client.test.mjs) settles it |
| A5 | `restoreSourceFlag` row-shape accepts the stat route's row read verbatim | Stat Route Spec | it already does for probe (:10250) — same query shape |

## Sources

### Primary (HIGH confidence — all read this session)
- server.js:10228-10280 (probe route), :6173 (restoreSourceFlag), :10699-10755 (backups GET), :10854/:10935, :10982/:11043, :11089/:11195 (trigger routes + start events), :3864-3903 (writer), :11242-11252 (runs GET), :6694-7229 (oidc callback incl. :7226 catch-all), :977-992 (restore_runs schema), :1159 (archive_name ensureColumn precedent)
- export/restore.js:1378-1520 (resolveRestoreSource incl. :1482 key expression, :1503-1505 clearMirrorFlag-on-fetch), :1838/:2313/:2561 (unit call sites)
- export/s3.js:165-232 (s3Request), :258-278 (s3ErrorFrom — no 404 class), :303-305 (headBucket HEAD), :344-371 (probeS3 + mapProbeError), :444-446 (s3BackupKey)
- export/ftp.js:183-191 (ftpErrorFrom classes), :533/:590/:735 (fetch/probe/client), :803-809 (size)
- export/smb.js:581-598 (smbErrorFrom table), :1314-1375 (createFile/closeFile), :1471-1545 (connectSmb surface), :1559-1604 (probeSmb), :1606+ (fetchSmbToStaged)
- src/pages/backup.js:696-712 (sourcePicker + badge), :775-814 (restoreRunTr, Trigger cell :809)
- src/actions/actions.js:5134 (restoreMissingToast), :6119-6139 (A.restoreProbe); src/core/api.js:637
- src/locales/en.json:1807-1808, :2415-2418; `ls src/locales/` → 5 files
- test/restore-source-param.test.mjs:572-905 (probe tests + D-89-14 pin :871-890); test/restore-client.test.mjs:441-520; test/i18n-core-features.test.mjs:171; test/i18n-toast.test.mjs:301; test/i18n-shell.test.mjs:349
- docs/DEPLOY.md:347-351

### Secondary
- .planning/research/CARRIED-ITEMS.md (32ff4e79) — rulings + phase grouping; anchors superseded by this file where drifted
- .planning/phases/104-restore-source-backend-source-param-probe-route/104-RESEARCH.md — probe route spec lineage

## Metadata

**Confidence breakdown:** Standard stack HIGH (all in-repo, read verbatim); Architecture HIGH (anchors line-verified post-106); Pitfalls HIGH (pin contracts read verbatim); client wiring A1 and A3 flagged as planner choice.
**Research date:** 2026-11-28. **Valid until:** 30 days (stable in-repo domain).
