# Carried Items Research — v3.7 Milestone (from v3.6 closeout)

**Researched:** 2026-11-28
**Mode:** Feasibility/recipe (four small items, one plan task each)
**Overall confidence:** HIGH (all anchors line-verified against server.js, export/*.js, src/pages/backup.js, docs/DEPLOY.md)

---

## Item 1 — Per-run archive probing (stat-only, honest three-state badge)

### The v3.6 gap

`POST /api/backup/restore/probe` (server.js:9952–9999) proves **destination reachability** via marker PUT/DELE inside the seams (`probeS3` export/s3.js:344 — marker put + deleteObject; `probeFtp` :590; `probeSmb` :1559). It never touches the run's actual archive, so an out-of-band deletion still yields `ok:true` and a "Disponible" badge.

### Where the per-run remote filename lives — CORRECTION to the prompt's premise

There is **no `backup_runs.archive_name` column**. Verified:

- `backup_runs` schema (server.js:892–…) carries **`filename`** (local archive name), plus the mirror flags `uploaded` / `ftp_uploaded` / `smb_uploaded` (added via `adapterEnsureColumn` at server.js:1129/1138/1139).
- The **remote** key/path derivation is computed, not stored: `s3BackupKey(meta, filename)` (export/s3.js:444) → `backup-task-${taskId}/${filename}` or `backup-manual/${filename}`; the FTP/SMB legs use the same `task-prefix + filename` derivations the upload arms built (D-88-6/98-01/100-02), as documented at export/restore.js:1335–1345 (resolveRestoreSource header, point 3).
- `archive_name` **does** exist on **`restore_runs`** (`adapterEnsureColumn('restore_runs','archive_name','text')` server.js:1144; written at insert server.js:3862; consumed by the run card src/pages/backup.js:792). That is the restore-side provenance column, not the per-run remote name.

**So: no schema work needed for item 1.** The stat target = derive from `backup_runs.filename` + task prefix (the same derivations resolveRestoreSource uses). Optionally cache the derivation in a helper shared with resolveRestoreSource to prevent ladder drift (that ladder drifted once — 2026-11-27 UAT, export/restore.js:1336).

### Stat capability matrix per seam

| Seam | Read-only stat primitive today | What to add | Effort |
|------|-------------------------------|-------------|--------|
| **S3** (`export/s3.js`) | `s3Request(config, { method, key, query })` generic at :165; `headBucket` :303 uses `HEAD` on the bucket. `getObject`/`deleteObject` exist; **no HeadObject on a key** | Add `headObject(config, key)` ≈ 10 lines: `s3Request(config, { method: 'HEAD', key })`; 200 → present, 404 → missing, other → mapped error via existing `mapProbeError` idiom (:371). HEAD carries no body — no signing change | Trivial |
| **FTP** (`export/ftp.js`) | **Already exists**: `size: async (targetPath)` at :803–809 issues `SIZE` (expects 213, used by the verify path). Missing file → 550 → `cmdExpect` throws a keyed error | Wrap: try `size(path)` → present; keyed 550-class error → missing; anything else → unreachable. `MDTM` optional (not needed for existence) | Trivial |
| **SMB** (`export/smb.js`) | **No query/info primitive.** Exports are protocol framing (encodeSmb2Header :524, smbErrorFrom :625), `connectSmb` :1462, `probeSmb` :1559, `fetchSmbToStaged` :1606 (CREATE+READ+CLOSE internally). No QUERY_INFO anywhere | Cheapest honest stat: reuse the fetch arm's CREATE request on the archive file — success (with immediate CLOSE) → present; `OBJECT_NAME_NOT_FOUND` (0xC0000034A family — the error mapping at :357–366 already handles not-found statuses) → missing. A full QUERY_INFO (FileAllInformation) is more protocol work for zero extra signal — **skip it**; existence is all the badge needs | **Moderate — the only real work in this item (~1 task)** |

### Recommended route shape

- New `POST /api/backup/restore/stat` (or extend the probe route with `mode: 'stat'` — prefer a **separate route** so the probe contract stays byte-identical to T-104 documentation).
- Guard chain **verbatim clone** of the probe funnel (server.js:9958–9981): sameOrigin → requireUser → `tooMany('restorestat|'+user.id, 10, 15*60*1000)` → RESTORE_USE or BACKUP_MANAGE → runId regex → row read → source enum → mirror-flag check. **Throttle unchanged** — a stat is strictly cheaper than marker PUT+DELE, same budget is conservative.
- **Stat-only, no destination writes** — pure read probing (HEAD / SIZE / CREATE+CLOSE), no marker, no `mirrorMissing → clearMirrorFlag` (that maintenance stays with live fetches in resolveRestoreSource only; a stat should never mutate flags).
- **Three-state result** (honest badge): `{ ok: true, present: true, key: 'archivePresent' }` / `{ ok: false, key: 'archiveMissing' }` (reachable but gone) / seam's existing unreachable/auth classes verbatim. Client renders three badge states.
- **Refusal/audit keys ×5** (mirror probe route :9959–9981 exactly): `restore_stat_refused:restoreRoleRequired`, `restore_stat_refused:restoreArchiveMissing` (404 run row), `restore_stat_refused:restoreSourceInvalid`, `restore_stat_refused:restoreSourceNotMirrored`, plus the audit ok/failed pair `restore_stat_ok` / `restore_stat_failed:<source>` with detail = result.key ONLY (Pitfall 5 / T-98-04: never config).
- **Never mutates run state** (T-104-06 discipline continues): no restore_runs writes, no lock, no staging.
- Additive DDL: **none**.

### Pitfall cross-refs
- PITFALLS.md Pitfall 9 (availability check on page load = probe per destination) — the stat stays on-demand per run, never on list GET (D-89-14).
- PITFALLS.md Pitfall 10/12 — do not invent new stage/status values; badge state is response-local, not persisted.

---

## Item 2 — Restore initiator in run history

### Current state (verified)

- `restore_runs` schema (server.js:969–984): `id, scope, trigger, status, stage, final_name, summary, snapshot_run_id, snapshot_tag, error, started_at, finished_at, created_at`. **No operator column.**
- The writer funnel: `emitRestoreRunEvent` → `writeRestoreRunRow` (server.js:3851–3870); the `'start'` insert (:3862) takes `event.runId/scope/trigger/archiveName/startedAt` — **no operator**.
- The list payload (server.js:10974) selects explicit columns — must add `created_by`.
- Render point: run card in src/pages/backup.js:779–812 (the restore row builder; the UAT 2026-11-27 comment at :784–787 shows this card was just touched for archive_name — natural place for an initiator line).

### Route: additive column via adapterEnsureColumn (NOT the schema block)

- `await adapterEnsureColumn('restore_runs', 'created_by', 'text');` — one line next to the existing :1144 archive_name ensureColumn. **Engine-agnostic**: adapterEnsureColumn is imported from db-adapter.mjs (:105) and already handles both engines (the invites/backup_runs precedents all use it). Nullable `text` — no PG_EPOCH_COLUMNS registration (that registry is for epoch-ms integer timestamps only; a text uid needs nothing). No pgSchemaVariant edit, no copy-sqlite-to-pg change.
- Do NOT touch the `create table restore_runs` block (:969) — fresh installs get the column via ensureColumn identically; editing the block risks the `runSchema` ';-newline' comment-splitting rule (comments at :916–929 warn a comment must never end a line with a semicolon).

### Operator capture — where exactly

- The `'start'` event is emitted by the restore launch paths (overwrite/runRestore/instance units, export/restore.js:1838/2313/2561 consume resolveRestoreSource; the start event fires in each unit's kickoff). The operator uid is in scope at the **route** layer (`requireUser` → `user.id`) on every restore-initiating POST.
- Recipe: add `createdBy` to the start event payload → `writeRestoreRunRow` 'start' insert gains the column: `insert into restore_runs (id, scope, trigger, status, stage, archive_name, created_by, started_at, created_at) values (?,?,?,?,?,?,?,?,?)`. If threading the uid through the unit opts is invasive, the route can stamp the row post-insert (one `update restore_runs set created_by = ? where id = ?`) — but the event-payload route is cleaner and matches the coalesce-writer discipline. Decide at plan time by counting call sites (3 units).
- History-write discipline holds: best-effort, never fails a restore (:3843–3849).

### Audit-join route — rejected

Joining the audit log (`auditBackupTask` entries) to restore_runs at render time is fragile: audit rows have no runId foreign key guarantee, retention can prune them, and the backup_runs family precedent (Pitfall 1 at server.js:8707 comment: "no created_by column exists… null when the owner membership…") shows the codebase already regretted a join-based answer once. **Column wins.**

### UI + legacy rows

- Render: an initiator line in the run card (src/pages/backup.js runCell, :792 area) — `run.created_by ? esc(name) : '—'`. Display name: the list payload already joins nothing; either resolve uid→display name server-side in the :10974 query (left join users) or ship the uid and let the client cache resolve it — prefer the **server-side join** (one place, no extra client round-trip; users table is small).
- Legacy rows: `created_by` null → render '—' (same fallback idiom as archive_name pre-column rows at :789–790).

---

## Item 3 — SSO callback catch-all logWarn

### Exact site

server.js:7092–7096 (inside the `/api/auth/oidc/callback` handler): `} catch { /* Pitfall 7: exchange/verification failures … fail closed to the same generic redirect. */ return errorRedirect(); }` — the silent swallow. This is the **only** such catch in the callback path (the login route's catches at :7126+ are separate and already log/throttle deliberately).

### Wording

One **fixed, non-interpolated** string — no `e.message` (an OIDC error body or token fragment can ride exception text; the 97-scrub discipline does not cover this log site, so interpolation would risk PII/secret leakage into logs):

```js
logWarn('sso callback: token exchange or verification failed; redirecting to generic error');
```

No oracle concern: the operator-facing log reveals nothing a caller doesn't already get (the generic redirect is the only observable outcome for any failure).

### Test impact

None expected — no behavior change, no keyed envelope change. If a test asserts exact log silence on the callback failure path, update that assertion; grep `test/` for oidc callback failure goldens before merging.

---

## Item 4 — DEPLOY.md symptom row

### Where the table sits

`docs/DEPLOY.md` (NOT repo root), symptom table at **:342–346** — `| Symptom | Cause | Fix |` three-column table inside the OIDC/SSO section, after the guest carve-out paragraph (:339–341), immediately before the smoke-test checklist (:348+). This section is the product of the v3.6 phase-105 rewrite.

### New row

| One user fails sign-in where another succeeds | Azure AD omits the optional `email` claim for that user's token, so `email_verified` linking fails closed | Azure portal → App registration → Token configuration → Add optional claim → `email` |

Fits the existing rows' register (same "fail closed" vocabulary, same portal-path Fix style). No anchor shifts needed — pure table-row append.

---

## Schema / DDL lockstep checklist (PG matrix)

| Item | DDL | SQLite path | PG path | Lockstep risk |
|------|-----|-------------|---------|---------------|
| 1 (stat probe) | **None** | — | — | None |
| 2 (restore initiator) | `adapterEnsureColumn('restore_runs','created_by','text')` (one line, server.js ~:1144 block) | ensureColumn ALTER | same adapter call — nullable text, no epoch registration, no pgSchemaVariant edit | LOW — exact precedent: archive_name ensureColumn shipped this way in v3.6 (:1144) |
| 3, 4 | None | — | — | None |

Lockstep rules already pinned in the codebase (do not re-derive): runSchema comment-splitting on ';-newline' (:916–929); PG_EPOCH_COLUMNS only for integer epoch-ms columns (:776, :823, :966–967); invite-rebuild idiom only for destructive migrations (not needed here — additive only).

---

## Phase grouping recommendation

**Fold items 3 + 4 into the restore phase — do NOT give them their own phase.**

Rationale: item 3 is one logWarn line + (maybe) one test tweak; item 4 is one markdown row. A standalone phase for those fails the GSD "phase = verifiable goal" bar. The v3.7 restore/carried phase gets:

1. **Task A — stat route** (item 1): S3 headObject + FTP size-wrap (trivial), SMB create-close stat (the only protocol work), route guard-chain clone, three-state badge, audit keys ×5. Needs the deepest research follow-up only on SMB framing (plan-phase should read smb.js:357–366 error table and the fetch arm's CREATE frames at :1606+).
2. **Task B — restore initiator** (item 2): DDL + writer payload + 3 unit call sites + list payload join + run-card render + legacy '—' fallback.
3. **Task C — SSO logWarn** (item 3) + **Task D — DEPLOY.md row** (item 4): trivial, no research needed.

If Task A's SMB stat proves heavier than scoped at plan time, split A into its own phase and ship B+C+D together — C+D must never orphan alone.

---

## Open questions for plan-phase

- SMB stat: confirm the fetch arm's CREATE frames can be reused for open-then-immediate-CLOSE without delete-on-close semantics (read export/smb.js around :1606 for the frame builders it calls).
- Item 2: count restore-unit call sites (3 units at export/restore.js:1838/2313/2561) and choose event-payload vs post-insert stamping for `created_by`.
- Whether the "Disponible" badge copy gains a third state string in i18n keys (new translation keys needed for `archivePresent` / `archiveMissing`).
