# Phase 90: Polish & Verification Sweep - Research

**Researched:** 2026-11-23
**Domain:** Gr8r governance console (Super Admin roster-first listing), backup archive download/verify-checksum, GFS retention visibility, PG-parity + DST e2e sweep, DEPLOY.md documentation
**Confidence:** HIGH — every claim below was verified by reading the live source this session; no external-package research needed (D-33-11: zero new npm dependencies).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
(D-90-1..23 verbatim from `90-CONTEXT.md` — see that file for the full text. The binding ones for implementation:)

- **D-90-1:** Console = **tab « Super Admins »** next to the Instance Roles card, existing seg pattern reused; current operatorCard replaced by the new tab.
- **D-90-2:** Default list = roster only (`is_instance_admin = true`) with existing inline actions; D-118/D-119 semantics unchanged.
- **D-90-3:** Search ≥ **2 chars** queries ALL users on name AND email (case-insensitive substring — current client filter behavior pinned); non-admin matches = promote-only "Make Super Admin" candidates.
- **D-90-4:** Result cap **10 candidates + "show more"** revealing in slices of 10.
- **D-90-5:** Post-promotion: keyed success toast, candidate leaves results and joins roster **without page reload** (mechanism = planner discretion).
- **D-90-7:** New stream endpoint `GET /api/backup/download?runId=` — `Content-Disposition: attachment`, zero disk staging. Tiering: Backup Operator = project/workspace runs only; **instance-scope = Super Admin only**.
- **D-90-8:** Content-Disposition filename = the stored archive name (backup-instance-….tar.gz), escaped.
- **D-90-9:** A `missing` run exposes NO download button; the endpoint refuses keyed anyway (fail-closed double).
- **D-90-10:** Audit log on every successful download.
- **D-90-11:** Verify-checksum action = full re-hash: local re-hash; S3-located = stream-back via 88-01 `downloadToStaged` (temp cleaned). Green/red keyed badge + last-check timestamp. Operator throttle type D-89-22.
- **D-90-12..15:** Rotation projection = on-demand button in task form → dry-run endpoint → list grouped by GFS scale with counts + collapsible detail; never-run task = keyed empty state; throttled (D-89-22 type); never client-computed, never per-keystroke.
- **D-90-16:** "Kept until" computed **server-side at render time** from the task's current GFS policy — never stored on the run row.
- **D-90-17:** One full-cycle PG-parity e2e scenario: task → backup run → S3 upload → local delete → list (s3 badge) → preview → **DR restore on PG**; assert run report + session revocation.
- **D-90-18:** DST tests on **EU + US** transitions (spring + fall both zones): cron at 02:30 on transition day, digest 08:00, assert workspace-local time (tz.js).
- **D-90-19:** Tests stay **env-gated only** (POSTGRES_TEST_URL / MINIO_TEST_URL, clean skip) — no CI wiring.
- **D-90-20:** New i18n keys gated **×5 locales** (de/en/es/fr/nl).
- **D-90-21:** DEPLOY.md documents timezone/NTP posture + new backup engine vs legacy `node server.js --backup` CLI.
- **D-90-22:** Backup terminal status invalidates `S.ui.restoreList` (few lines in the existing poll tick).
- **D-90-23:** Writer missingBlob flag surfaces on the run (column or summary — planner) and history shows "⚠ N blob(s) manquant(s) — le DR refusera cette archive".

### the agent's Discretion
- Post-promotion mechanism (refetch vs optimistic local mutation)
- Candidate search format (dedicated endpoint vs extending GET /api/auth/operator/users)
- verify-checksum action placement in run detail (sha row button vs menu)
- missingBlob: column vs summary
- Exact shape of the rotation projection endpoint
- Plan structure (e2e sweep as the last plan, after the surfaces)

### Deferred Ideas (OUT OF SCOPE)
- Doc↔disk integrity sweep (orphaned files[] entries, lost blobs) — new transverse capability, future milestone.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SACON-01 | Roster-first Super Admin console with promote-search, cap 10 + show-more, keyed toast + no-reload reconcile | Existing promote endpoint (server.js ~7998, idempotent 200 + lastOperator 409 + db.tx audit), existing `A.operatorPromote` already refetches + toasts keyed (actions.js:2849-2859); roster/candidate split is presentation over the existing GET payload (seed Option B) |
</phase_requirements>

## Summary

Phase 90 is a polish-and-verify phase over **already-working** Phase 85–89 surfaces. Everything it adds hangs on existing, verified seams: the operator users/promote family (server.js ~7927–8050), the restore preview route's S3 stream-back + throttling idiom (server.js 9529+, the exact template for both the download endpoint and verify-checksum), the GFS rotation pass (`runBackupRotationPass` + `assignGfsBuckets`, server.js ~3820–3980, directly reusable as a dry-run projection), and the env-gated e2e harness family (pg-matrix / restore-s3-e2e patterns, both containers confirmed live this session). Zero new dependencies (D-33-11).

Three findings deserve planner attention before tasks are written:
1. **"Kept until" (D-90-16) is not a date computation.** GFS retention is **count-based per bucket** (keep-N runs per daily/weekly/monthly/yearly bucket, oldest expired), not age-based. A run's deletion date depends on *future* run arrivals — "run date + rétention" from the decision text does not map to the actual algorithm (see Pitfall 1 for the honest options).
2. **The history GET payload lacks the fields the download button needs.** `GET /api/backup/runs?taskId=` does not select `uploaded` or `scope` — both are required for payload-chrome download gating (D-90-7/9) and for locating the archive. An additive payload extension is needed.
3. **`backup_runs` has no summary column** — the restore_runs table has one, backup_runs does not (verified schema). D-90-23's "column vs summary" choice is really "add a column (ensureColumn + sqlite rebuild idiom) vs nothing" unless the planner invents a summary column too.

**Primary recommendation:** Plan as 4–5 plans: (1) console tab + promote-search (SC-1), (2) download + verify-checksum endpoints + payload extensions (SC-2), (3) rotation projection + kept-until + the two polissages (SC-3, D-90-22/23), (4) DST cron tests (pure + sweep-harness), (5) the PG-parity full-cycle e2e + DEPLOY.md + i18n final gate. Keep every new refusal key ×5 same-commit as its emitting gate (D-12 standing rule).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Roster/candidate split, cap, show-more | Client (src/pages/governance.js) | Server (promote POST unchanged) | The GET payload already carries ALL users unpaginated; the split is presentation (seed Option B). Server stays throttle-free |
| Promote action | Server (POST /api/auth/operator/users/:id/promote) | Client (toast + refetch) | Server owns the flag write, lastOperator guard, audit tx — all exist, untouched |
| Archive download | Server (new GET /api/backup/download) | Client (Blob + saveBlob) | Authorization tiering + stream + audit are server concerns; client renders payload-chrome CTA only |
| Verify-checksum | Server (re-hash / stream-back) | Client (badge render) | Hash-on-the-pipe is server-only; result is payload render-only |
| GFS projection + kept-until | Server (reuses rotation math) | Client (render verbatim) | D-90-12/16: never client-computed |
| DST cron correctness | Pure module (export/cron.js nextRunAt) + sweep harness | — | nextRunAt is pure with injectable clock; sweep test rides /api/internal/backup-scheduler-pass |
| PG-parity e2e | Test harness (startServer DB_URL + dropPgSchema) | — | pg-matrix pattern; containers already running |

## Standard Stack

No new packages (D-33-11 ratified; dependency test exists: `test/dependencies.test.mjs`). Everything below is in-repo.

### Core (existing, verified this session)
| Asset | Location | Purpose | Why standard |
|-------|----------|---------|--------------|
| Operator users GET | server.js:7927-7948 | All users (id, name, email, is_instance_admin, last_login_at), ordered by created_at, **no throttle**, D-121 gate | The console's read ground truth |
| Promote/demote POST | server.js ~7998-8050 (route `/api/auth/operator/users/:id/(promote\|demote)`) | Idempotent 200 no-op on same-state; lastOperator 409 count guard; flag UPDATE + audit row in ONE db.tx | D-118/D-119 guards already correct — do not touch |
| `A.operatorPromote` | src/actions/actions.js:2849-2859 | POST → refetch `refreshOperatorUsers()` → keyed toast `settings.operator.toastPromoted` | The no-reload reconcile D-90-5 wants already exists in the refetch idiom |
| Restore preview route | server.js:9529-9620 | **THE template** for download + verify-checksum: throttle → capability gate → run row → local/S3 resolve → `downloadToStaged` → keyed refusals → audit | Copy guard-chain order verbatim (house rule) |
| `downloadToStaged(config, key, expectedSha256, stagingDir)` | export/s3.js:380 | S3 stream-back with digest verification; refuses keyed on mismatch | The 88-01 seam D-90-11 names |
| `s3BackupKey({ taskId }, filename)` | export/s3.js:444 | Reconstructs the object key from the run row (D-88-6 task prefix / D-88-9 backup-manual/) | Exactly how preview rebuilds the key |
| `sha256AndSize(filePath)` | export/backup.js:298-308 | Streaming local re-hash (hash-on-the-pipe, never buffer-then-hash) | The local verify-checksum primitive |
| `backupsRoot()` | export/backup.js:77 | The local archives dir (BACKUPS_DIR-aware) | Local path = `path.join(backupsRoot(), row.filename)` |
| `fileDisposition(name, false)` | server.js:11345 | `attachment; filename="<ascii>"; filename*=UTF-8''<encodeURIComponent(safe)>` | D-90-8 escaped stored filename |
| `auditBackupTask(user, action)` | server.js:8597 | The backup-route audit funnel | D-90-10 download auditing |
| `runBackupRotationPass({ now, taskId })` | server.js:3890 (exported) | Full GFS pass; dry-run projection reuses `assignGfsBuckets` + the keep-N walk WITHOUT unlink/mark/audit | server.js-local helpers — the projection endpoint lives in server.js, no export needed |
| `nextRunAt(cron, tz, fromMs)` | export/cron.js:135 (exported) | Pure minute-scan, injectable clock, DST-correct per header contract | DST tests target, no server boot needed |
| `resolveTz`, `localParts` | tz.js:28, 45 | Label→IANA funnel + local wall parts; fallback Europe/Paris | D-90-18 workspace-local assertions |
| Client download idiom | src/core/download.js (`filenameFrom`, `saveBlob`) | fetch → Blob → anchor save; parses RFC 5987 filename* | The one client download path (Phase 54) |
| restore refusal/toast map | src/actions/actions.js:4879-4897 (`RESTORE_REFUSAL_TOASTS` closed map + `tErr` fallback) | Keyed refusal vocabulary pattern for new download/verify codes | 89-06 doctrine: closed map 1:1 onto ×5 keys |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Client-side roster/candidate split (seed Option B) | Extend GET with `?q=` server-side search (Option A) | Option B = zero API change, throttle-free, payload stable — seed explicitly prefers whichever keeps the read route untouched; payload already carries every user. Only revisit if instance size makes the full payload a problem (it doesn't at small-instance scale) |
| Column for missingBlob | summary JSON column on backup_runs | backup_runs has NO summary column today; an additive boolean/tinyint column + ensureColumn is the smaller, CHECK-free change; planner decides (D-90-23 discretion) |
| Persist verify-checksum result | Ephemeral response-only | D-90-11 asks for "timestamp du dernier check" → implies persistence (additive column via ensureColumn + rebuild idiom); planner weighs |

## Package Legitimacy Audit

Not applicable — **zero external packages installed this phase** (D-33-11; `test/dependencies.test.mjs` enforces). No registry checks required.

## Architecture Patterns

### System Architecture Diagram

```
SC-1 Console (governance page)
  GET /api/auth/operator/users (all users, no throttle)
        └─> client split: roster (is_instance_admin) | candidates (matches, q≥2, cap 10 + show-more)
              └─> POST .../promote ──> 200 ──> refreshOperatorUsers() ──> toast(key) ──> rerender (no reload)

SC-2 Run binary
  restore list row / history row (payload chrome: location badge + download CTA when not missing)
        └─> GET /api/backup/download?runId=
              guard funnel: sameOrigin → requireUser → throttle(?) → capability
                (RESTORE_USE|BACKUP_MANAGE for project/workspace scope; isInstanceAdmin for instance scope)
              ├─ local exists ──> createReadStream(backupsRoot()/filename) ──> Content-Disposition (stored name)
              └─ uploaded=1 ──> downloadToStaged(S3.config, s3BackupKey(taskId, filename), sha256) ──> stream ──> rm temp
              success ──> auditBackupTask(user, 'backup_download:<runId>')
  "Verify checksum" ──> same resolution; local: sha256AndSize(file) | S3: downloadToStaged(stream-back)
        compare vs row.sha256 ──> keyed green/red badge + timestamp (persistence = planner discretion)

SC-3 Retention visibility
  Task form "Prévisualiser les suppressions" ──> dry-run endpoint (reuses assignGfsBuckets + keep-N walk, NO deletes)
        ──> grouped by scale (daily/weekly/monthly/yearly) + counts + collapsible names
  History rows ──> "kept until" computed server-side per request from current task policy

SC-4 Verification sweep
  Full-cycle e2e: startServer({DB_URL: POSTGRES_TEST_URL}) + dropPgSchema
        task ──> run ──> S3 upload (uploaded=1) ──> rm local ──> list (badge s3) ──> preview ──> DR restore on PG
        assert: restore_runs summary + sessions revoked
  DST: nextRunAt('30 2 * * *', tz, <transition-instant>) + sweep via /api/internal/backup-scheduler-pass {now}
```

### Recommended Placement (no new files required beyond tests)

```
server.js                    # download + verify-checksum + projection endpoints (beside the restore family, ~9100-9600 zone)
src/pages/governance.js      # superAdmins tab replacing operatorCard (seg pattern idiom)
src/pages/backup.js          # download/verify CTAs on rows, kept-until display, missingBlob warning, projection button
src/actions/actions.js       # A.* actions, downloadBlob action, backupPollTick invalidation (D-90-22)
src/locales/{en,fr,de,es,nl}.json
test/backup-download.test.mjs, test/backup-verify-checksum.test.mjs (offline),
test/backup-rotation-projection.test.mjs,
test/backup-cron-dst.test.mjs (pure), or extend test/backup-cron.test.mjs,
test/backup-full-cycle-pg-e2e.test.mjs (env-gated)
```

### Pattern 1: The D-89-22 throttle idiom (reuse verbatim for verify-checksum AND projection)
**What:** operator-keyed throttle placed BEFORE the capability gate; a refused attempt still consumes a try.
**Verified shape** (server.js:9536-9541):
```js
if (tooMany(`restorepreview|${user.id}`, 10, 15 * 60 * 1000)) {
  return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
}
if (!(await hasInstanceRole(user.id, CAP.RESTORE_USE))) { ... }
```

### Pattern 2: S3-located archive resolution (from preview route, server.js:9560-9585, verbatim logic)
```js
const localPath = row.filename ? path.join(backupsRoot(), row.filename) : null;
const hasLocal = !!localPath && fs.existsSync(localPath);
if (!hasLocal && row.uploaded !== 1) {
  await auditBackupTask(user, 'restore_refused:restoreArchiveMissing');
  return fail(res, 404, 'restoreArchiveMissing', 'That backup archive is gone from both destinations');
}
if (!hasLocal) {
  if (!S3.enabled) return fail(res, 404, 'restoreArchiveMissing', '...lives in S3 but no S3 destination is configured');
  const back = await downloadToStaged(S3.config(), s3BackupKey({ taskId: row.task_id }, row.filename), row.sha256, restoreStagingDir());
  // back.tmpPath — caller removes after use (rmStaging discipline)
}
```

### Pattern 3: Payload-flag chrome (D-89-21)
Buttons exist only when the payload says so; the client never derives authority. Concretely for phase 90:
- download CTA renders only when the row payload carries a resolvable location (add `uploaded`/`scope`/derived `location` to the history GET select — it currently selects neither, verified server.js:9128/9143)
- verify-checksum CTA renders only for a non-missing run
- the missingBlob warning renders only when the run carries the count

### Pattern 4: Additive column migration
`uploaded` (89-02) is the exact precedent: add to the CREATE TABLE def + `ensureColumn` at boot for existing installs; the sqliteOnly `backup_runs_rebuild` idiom exists at server.js:952-971 for byte-identical def parity (Pitfall P-B discipline). PG twin: `db-adapter.mjs SQLITE_SCHEMA` — the pg schema variant must be widened the same way (restore_runs did: PG_EPOCH_COLUMNS registration note at server.js:826).

### Anti-Patterns to Avoid
- **Client-computed retention/projected deletions** — D-90-12/16 forbid; the server owns the math.
- **Buffer-then-hash** — verify-checksum streams (`sha256AndSize` pattern); an instance archive is arbitrary-size.
- **Reordering the guard funnel** — sameOrigin FIRST (Pitfall 22 house rule), then requireUser, then throttle, then capability, then target lookup (no pre-gate existence oracle, T-86-06).
- **Storing "kept until"** — D-90-16: always computed from current policy, never persisted.
- **Offering revoke-sessions on candidate rows** — seed constraint: revoke stays tied to roster rows; candidates are promote-only.
- **Live S3 probing on the list path** — D-89-14: run-row truth only (`uploaded` flag), never ListObjectsV2.
- **A second cron parser client-side** — Pitfall 6 doctrine; the builder shows text summaries only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GFS deletion projection | New algorithm | `assignGfsBuckets(runsAsc)` + the keep-N reverse walk from `runBackupRotationPass` (server.js:3839-3945), minus deletes | Already tested (87-03); duplicating the bucket semantics invites drift |
| Content-Disposition filename escaping | Manual quoting | `fileDisposition(name, false)` (server.js:11345) | Handles RFC 5987 UTF-8 + ASCII fallback, already hardened |
| S3 fetch + digest check | Hand-rolled stream-back | `downloadToStaged` (s3.js:380) | Verifies sha256 mid-stream, refuses keyed, SigV4 already solved |
| Local re-hash | `crypto` on a buffered read | `sha256AndSize` (backup.js:298) | Streaming, returns size too |
| Client save dialog | anchor click inline | `saveBlob` / `filenameFrom` (src/core/download.js) | Deferred-revoke + RFC 5987 parsing already debugged |
| Cron evaluation for DST tests | Wall-clock arithmetic | `nextRunAt(cron, tz, fromMs)` (cron.js:135) | Minute-scan over real time is what makes DST contract hold — test the contract, don't re-derive |
| Throttling | New limiter | `tooMany(key, n, window)` | D-89-22 idiom reused as-is |

**Key insight:** Phase 90 is a seam-consumption phase. Nearly every server behavior is an existing function called from a new route; the risk is drift from the copied idioms, so the plan should copy guard chains VERBATIM (house rule) and pin order with tests.

## Common Pitfalls

### Pitfall 1: "Kept until" as a date is semantically wrong (SC-3)
**What goes wrong:** GFS retention is count-based — a run is deleted when keep-N+1 runs of ITS bucket have arrived since (oldest first), with the newest verified run excluded by explicit `id <> ?` and the refuse-to-empty floor. No expiry timestamp exists or can be derived from "run date + retention count" without assuming a future cadence.
**Root cause:** the decision text (D-90-16) says "run date + rétention" but the verified algorithm (server.js:3839-3945) counts, not ages.
**How to avoid:** pick an honest rendering at plan time. Options: (a) render the run's bucket + position ("kept: 3/7 daily") computed per request — always exact, matches "toujours exact même si la policy change"; (b) approximate date = run date + keep-N × nominal cron cadence — labeled as an estimate, breaks the "always exact" requirement; (c) per-bucket "expires when N newer <scale> runs exist". Recommend (a): it is the only rendering that satisfies D-90-16 verbatim.
**Warning signs:** a plan task that computes `run.created_at + retention_daily * 86400000`.

### Pitfall 2: History payload can't gate the download button
**What goes wrong:** `GET /api/backup/runs?taskId=` (server.js:9113-9146) selects id, task_id, trigger, status, started_at, finished_at, duration_ms, size_bytes, sha256, filename, error, created_at — **no `uploaded`, no `scope`**. The client cannot know whether the archive lives locally, in S3, or is missing, nor whether the run is instance-scope (Super-Admin-only download).
**How to avoid:** extend the two history queries additively (include `scope, uploaded`); derive `location` server-side exactly as the restore-list route does (fs.existsSync on backupsRoot → 'local'; uploaded=1 → 's3'; else 'missing') and ship it as render-only chrome.
**Warning signs:** a plan that gates the CTA on `run.status === 'succeeded'` alone — a locally-rotated-away run would show a dead button (D-90-9 violation).

### Pitfall 3: `backup_runs` has no summary column (D-90-23)
**What goes wrong:** the planner's "column or summary" choice presumes a summary carrier; there is none on backup_runs (restore_runs has one). Both options are additive columns.
**How to avoid:** prefer the minimal carrier — e.g. `missing_blob_count integer not null default 0` or a small `missing_blob json` — wired through ensureColumn + the sqlite rebuild idiom (server.js:952-971) + the db-adapter.mjs SQLITE_SCHEMA pg twin. Verify the writer seam (`setBackupRunWriter` consumers in export/backup.js ~793-820) can stamp the count from the manifest before marking the run terminal.
**Warning signs:** an ensureColumn added only to the SQLite CREATE TABLE but not db-adapter.mjs — the pg matrix test boots the same initDb and will catch it; per-file `node --test` runs only (never `--test-concurrency=2`, pg-matrix shares one live DB).

### Pitfall 4: Download endpoint = privilege-escalation surface
**What goes wrong:** an instance-scope archive contains every user's rows (users, sessions, totp_factors...). A Restore Operator downloading it via a sloppy capability gate = full credential dump.
**How to avoid:** the gate must parse `row.scope` JSON and require `isInstanceAdmin` when `kind === 'instance'`; project/workspace scope requires `hasInstanceRole(user.id, CAP.BACKUP_MANAGE) || hasInstanceRole(user.id, CAP.RESTORE_USE)` (D-90-7 tiering, the 85 tiering applied to the binary). Refuse keyed + audited. Also: `filename` renders into the Content-Disposition from DB rows only — never accept a client-supplied filename; `fileDisposition` handles escaping.
**Warning signs:** any code path that trusts `url.searchParams` beyond `runId` (`/^[A-Za-z0-9_-]{1,64}$/` validated, restore-preview precedent).

### Pitfall 5: DST assertions on the wrong instant
**What goes wrong:** testing `nextRunAt` from an already-past `fromMs` fires the NEXT day, masking the transition-day behavior.
**How to avoid:** seed `fromMs` just before local midnight of the transition day. Verified live this session (node, cron.js):
- EU spring (2026-03-29, from 2026-03-28T23:00Z, cron `30 2 * * *`, Europe/Paris) → **no fire on the transition day**; next = 2026-03-30 02:30 local. The scanner never observes the nonexistent 02:30 and does NOT substitute 03:30.
- EU fall (2026-10-25) → fires the FIRST (earlier) of the two 02:30 occurrences (00:30Z = CEST occurrence).
- US spring 2026-03-08 / fall 2026-11-01 — same shape (from 05:00Z/04:00Z respectively).
- Control: cron `0 8 * * *` fires normally on the transition day (the "digest 08:00" half of D-90-18).
Transition dates 2026-2027: EU 2026-03-29 / 2026-10-25, 2027-03-28 / 2026-10-31→**2027-10-31**; US 2026-03-08 / 2026-11-01, 2027-03-14 / 2027-11-07 (all verified computationally).
**Warning signs:** an assertion expecting 03:30 local on spring-forward day.

### Pitfall 6: i18n gates are multi-layered
**What goes wrong:** adding keys only to en.json (or forgetting de/es/nl) fails several tests at once, and adding a t() call without its key fails the static scan.
**How to avoid:** the ×5 gate is enforced by: `test/catalogue.test.mjs` (key shape `KEY_SHAPE` regex, forbidden `<>"`, en→fr completeness, fr key-order mirror, fr-only stray keys), `scripts/i18n-scan.mjs` (every `t('…')` key must resolve in en + placeholders match call-site vars), `scripts/fr-parity.mjs <ns>` (namespace batch gate), and `test/i18n-core-features.test.mjs` pinned counts (the test TITLE/comments carry a running ledger — new keys append to the comment and bump the count assertion). de/es/nl are currently complete mirrors of en (verified programmatically: 0 missing keys each; fr missing exactly 1 = the documented `contract.englishOnly` exception). Keep key count mindful of the **500 kB entry-chunk gate** (`test/build-chunk-size.test.mjs`) — the base catalogue ships in the entry chunk; if headroom is tight, consolidate refusal keys (the 67-03 precedent consolidated 9 codes into 1 key for exactly this reason).
**Warning signs:** a plan task adding keys in a separate commit from the emitting markup (D-12 violation).

### Pitfall 7: The console is NOT currently tabs
**What goes wrong:** D-90-1 says "tab à côté du tab Instance Roles (rolesCard) — pattern seg-tabs existant", but governance.js today renders `operatorCard()` and `rolesCard()` as **stacked sblocks** (lines 116-117); the only seg pattern on the page is the workspace filter seg (`govSeg`, line 91-97, `.seg` role=group with aria-pressed).
**How to avoid:** the planner should read "tab" as a seg control switching the operator-management section between « Super Admins » and « Instance Roles » views (state in S.ui, e.g. S.ui.govSuperSeg), reusing the `.seg` markup idiom — not a literal tab-bar component that doesn't exist on this page. The seed's teardown discipline applies: the new seg stage must join `ROUTE_TEARDOWN.governance` (govOrphanTeardown, governance.js:362-380).
**Warning signs:** a plan referencing a nonexistent "tab component".

### Pitfall 8: Poll-tick invalidation must not fight the piggyback refetches
**What goes wrong:** `backupPollTick` (actions.js:4787-4838) already piggybacks `refreshOpenBackupHistories()`/`refreshOpenRestoreHistories()` and stops the timer when nothing is active. A naive D-90-22 change that refetches the restore list on every tick adds a per-second fetch.
**How to avoid:** invalidate `S.ui.restoreList` (set null, or refetch only when the backup run OBSERVES a terminal transition — compare previous stage) so the in-render kick (backup.js:537 `if (flags.canRestore && !S.ui.restoreList) refreshRestoreBackups()`) does the actual refetch exactly once.
**Warning signs:** `refreshRestoreBackups()` called unconditionally inside the 1s tick.

### Pitfall 9: Env-gated e2e cleanliness
**What goes wrong:** a full-cycle PG e2e that leaks schema state into gr8r-pg-test breaks sibling pg-matrix tests (one shared live DB).
**How to avoid:** `dropPgSchema(POSTGRES_TEST_URL)` before boot (copy-sqlite-to-pg / pg-matrix idiom); `startServer({ env: { DB_URL: url, MASTER_KEY, ... } })` — helpers/server.mjs:56-59 makes DB_URL override DB_PATH. Run per-file: `POSTGRES_TEST_URL=... MINIO_TEST_URL=http://127.0.0.1:9001 node --test test/backup-full-cycle-pg-e2e.test.mjs`. Clean skip idiom: `const maybe = url ? test : test.skip`.
**Warning signs:** a test file that assumes a pristine schema, or a parallel test runner flag.

## Code Examples

### Download endpoint skeleton (composed from verified idioms)
```js
// server.js — beside the restore family
if (pathname === '/api/backup/download' && method === 'GET') {
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const user = await requireUser(req, res);
  if (!user) return;
  if (tooMany(`backupdownload|${user.id}`, 10, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
  if (!(await hasInstanceRole(user.id, CAP.BACKUP_MANAGE)) && !(await hasInstanceRole(user.id, CAP.RESTORE_USE))) {
    await auditBackupTask(user, 'backup_download_refused:backupRoleRequired');
    return fail(res, 403, 'backupRoleRequired', 'Only a Backup or Restore Operator can download archives');
  }
  const runId = url.searchParams.get('runId') ?? '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(runId)) return fail(res, 404, 'taskNotFound', 'That backup run does not exist');
  const row = await db.get('select id, task_id, scope, status, sha256, filename, uploaded from backup_runs where id = ?', [runId]);
  if (!row || !row.filename) { /* keyed restoreArchiveMissing + audit */ }
  const scope = safeParse(row.scope);
  if (scope.kind === 'instance' && !isInstanceAdmin(user)) { /* keyed refusal: instance-scope download is Super-Admin-only, D-90-7 */ }
  const localPath = path.join(backupsRoot(), row.filename);
  const hasLocal = fs.existsSync(localPath);
  if (!hasLocal && row.uploaded !== 1) { /* keyed restoreArchiveMissing (fail-closed double, D-90-9) */ }
  // stream local, or downloadToStaged → stream → rm; headers: fileDisposition(row.filename, false)
  await auditBackupTask(user, `backup_download:${row.id}`); // D-90-10, success-only
}
```
(Refusal code names are planner's to fix; the closed-map client side must grow 1:1 with them.)

### Client download action (existing idioms)
```js
// actions.js — fetch → Blob → saveBlob; download.js already parses the Content-Disposition
A.backupDownload = async el => {
  const res = await fetch(`/api/backup/download?runId=${encodeURIComponent(el.dataset.id)}`, { headers: api.authHeaders?.() });
  if (!res.ok) { /* keyed refusal via the closed map */ return; }
  saveBlob(await res.blob(), filenameFrom(res.headers.get('Content-Disposition')));
};
```
(Note: GET + same-origin cookies ride the existing session cookie; match how other binary GETs authenticate.)

### Dry-run projection endpoint (reuse, no deletes)
```js
// server.js — copy the walk from runBackupRotationPass lines ~3912-3930 but STOP after `candidates`:
//   runsAsc = succeeded runs of the task asc; buckets = assignGfsBuckets(runsAsc);
//   keep = { daily: task.retention_daily, ... };
//   reverse-walk counting per bucket → candidates beyond keep-N (exclude newest verified id)
// return { groups: { daily: [...], weekly: [...], monthly: [...], yearly: [...] }, counts: {...} }
```
No unlink, no status='deleted' write, no audit insert — a projection mutates nothing.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| operatorCard = full user list + client filter | Roster-first tab + promote-only candidate search | Phase 90 (this phase) | governance-client pins and audit-log operator tests need updating with the change (seed) |
| No archive download in v1 (backup.js:9 comment: "no download action exists in v1 — Phase 90 owns the download tier") | GET /api/backup/download | This phase | The 86-02 comment is the designated landing slot |
| `--backup` CLI (SQLite DB only, DEPLOY.md §9 ~:719) | gr8r backup v1 engine (tar+gz, files+DB, S3) | Phases 86-88 | DEPLOY.md must teach the distinction (D-90-21) — the §9 text today documents only the legacy CLI |

## Runtime State Inventory

Not a rename/refactor/migration phase — the only state-bearing additions are:
- **Stored data:** if the planner persists verify-checksum timestamp or missingBlob count → additive `backup_runs` columns via ensureColumn (+ sqlite rebuild idiom server.js:952-971 + db-adapter.mjs pg twin). Existing rows default 0/null — no data migration needed.
- **Live service config / OS state / secrets / build artifacts:** none touched. Verified: no new env vars beyond the existing boot-frozen S3_* pair; no install steps (zero deps).
- **Test containers (live, confirmed this session):** gr8r-pg-test (postgres:18-alpine, 127.0.0.1:5433, postgres/postgres), gr8r-minio-e2e (pgsty/minio, :9001, gr8rtest/gr8rtest-password) — also gr8r-minio-smoke on :9000. Env: POSTGRES_TEST_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres, MINIO_TEST_URL=http://127.0.0.1:9001. Node v24.21.0.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The `.seg` markup idiom is the intended "tab" mechanism for the console switch (no literal tab component exists in governance.js) | Pitfall 7 | Cosmetic; discuss-phase can correct the chrome choice |
| A2 | The "kept until" decision can be satisfied by bucket-position rendering (option a in Pitfall 1) rather than a literal date | Pitfall 1 | Needs user confirmation — D-90-16's "run date + rétention" wording conflicts with the verified count-based algorithm |
| A3 | Download authentication rides the session-cookie fetch like other binary GET routes (no separate token scheme) | Code Examples | Low — same-origin + session is the universal pattern in this codebase |
| A4 | Throttle budgets for the new routes (10/15min following preview) are acceptable | Pattern 1 | Planner/user can adjust counts; the idiom itself is verified |
| A5 | DST test years limited to 2026-2027 transitions listed in Pitfall 5 suffice for D-90-18 (EU + US, spring + fall) | Pitfall 5 | Additional years are trivial to add to the same table |

## Open Questions

1. **"Kept until" rendering semantics** (Pitfall 1 / A2) — the only real semantic gap between D-90-16's wording and the verified GFS algorithm. Recommendation: bucket-position rendering; surface at plan checkpoint if the owner expects a date.
2. **New refusal code inventory** — download (role, capability-denied-for-instance-scope, missing) and checksum (mismatch ok/fail) need named codes + ×5 keys + entries in the closed map. Keep count tight against the entry-chunk gate (Pitfall 6).
3. **Persistence choices at planner discretion** — verify-checksum timestamp (additive column vs ephemeral) and missingBlob carrier (column shape). Both follow Pattern 4; the sqlite rebuild idiom makes either safe.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| gr8r-pg-test container | PG-parity e2e | ✓ (confirmed live) | postgres:18-alpine :5433 | none needed |
| gr8r-minio-e2e container | full-cycle S3 leg | ✓ (confirmed live) | pgsty/minio :9001 | gr8r-minio-smoke :9000 |
| Node | all tests | ✓ | v24.21.0 | — |
| Docker | container lifecycle | ✓ | running | — |
| POSTGRES_TEST_URL / MINIO_TEST_URL | env-gated tests | documented in CONTEXT + test headers | — | clean skip (exit 0) |

Missing dependencies with no fallback: none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (stdlib) + node:assert/strict — no test deps |
| Config file | none — per-file `node --test test/<file>.test.mjs` |
| Quick run command | `node --test test/backup-download.test.mjs` |
| Full suite command | `node --test test/*.test.mjs` (offline); env-gated files separately with POSTGRES_TEST_URL/MINIO_TEST_URL |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SACON-01 | Roster-first + search candidates + cap + no-reload promote | client source pins + route tests | `node --test test/governance-client.test.mjs` (+ audit-log.test.mjs promote family) | ✅ (update pins) |
| SC-2 | Download tiering + keyed refusals + audit | route unit | `node --test test/backup-download.test.mjs` | ❌ Wave 0 |
| SC-2 | verify-checksum local/S3 + throttle | unit + env-gated S3 leg | `node --test test/backup-verify-checksum.test.mjs` | ❌ Wave 0 |
| SC-3 | Projection dry-run + kept-until | unit | `node --test test/backup-rotation-projection.test.mjs` | ❌ Wave 0 |
| D-90-22/23 | restoreList invalidation + missingBlob warning | client pins | extend backup-history-client.test.mjs | ✅ |
| D-90-18 | DST transitions EU/US | pure + sweep harness | `node --test test/backup-cron-dst.test.mjs` (or extend backup-cron.test.mjs / backup-scheduler.test.mjs) | ❌ Wave 0 |
| SC-4 | Full-cycle PG e2e | env-gated e2e | `POSTGRES_TEST_URL=… MINIO_TEST_URL=… node --test test/backup-full-cycle-pg-e2e.test.mjs` | ❌ Wave 0 |
| SC-5 | DEPLOY.md sections | doc (no test) | manual review | — |

### Sampling Rate
- **Per task commit:** the touched test file (per-file node --test)
- **Per wave merge:** offline suite + any env-gated file the wave added
- **Phase gate:** full offline suite green; both env-gated e2e files green against the live containers; catalogue + i18n-scan + build-chunk-size green after key additions

### Wave 0 Gaps
- [ ] test/backup-download.test.mjs — SC-2 route coverage
- [ ] test/backup-cron-dst.test.mjs — D-90-18 transition matrix (verified dates in Pitfall 5)
- [ ] Update test/governance-client.test.mjs pins BEFORE the console rewrite (they pin current operatorCard markup, verified :109-163)
- [ ] i18n count ledger append in test/i18n-core-features.test.mjs (pinned counts pattern)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | **yes — the phase's core risk** | capability tiering: RESTORE_USE/BACKUP_MANAGE for project/workspace archives; isInstanceAdmin for instance-scope (D-90-7); gate BEFORE target lookup (no pre-gate existence oracle, T-86-06) |
| V5 Input Validation | yes | runId `/^[A-Za-z0-9_-]{1,64}$/`; scope parsed from DB row JSON, never client; filename from DB rows only |
| V7 Error Handling | yes | keyed refusals (`<code>: <message>`), closed client map, no raw err leakage; refusal codes audited |
| V9 Communications | yes | sameOrigin gate first on every new route (Pitfall 22 house rule) |
| V8 Data Protection | yes | instance archive = full user/session dump — Super-Admin-only download; audit every success (D-90-10); Content-Disposition escaping via fileDisposition (header-injection / filename tricks) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Restore/Backup Operator pulls instance archive (privilege escalation via download tier) | Elevation of Privilege | scope-kind check server-side; payload chrome renders the CTA but the server is the boundary (D-23 doctrine) |
| Download endpoint as existence oracle | Information Disclosure | keyed refusal AFTER the capability gate; audit refusals (89 idiom) |
| Path traversal via filename | Tampering | filename sourced from DB rows written by the exporter only; never client input |
| Cron/DST test false confidence | — | pin the verified transition instants (Pitfall 5); assert wall-time via tz.js localParts, never via offset math |

## Sources

### Primary (HIGH confidence — all read this session)
- server.js:786-830 (backup_runs / restore_runs schema verbatim), :7927-8050 (operator users/promote/revoke), :3820-3980 (GFS rotation + assignGfsBuckets), :9529-9620 (restore preview route — the throttle/S3/refusal template), :8597+ (auditBackupTask), :11345 (fileDisposition), :3670+ (runBackupSchedulerPass), :6002-6030 (test-only scheduler/rotation pass routes)
- export/backup.js:298-330 (sha256AndSize, verifyStagedBackup), :425-455 (missingBlob collectors, D-04), :77 (backupsRoot), :793-820 (S3 upload + uploaded flag write)
- export/s3.js:380 (downloadToStaged), :444 (s3BackupKey)
- export/cron.js (full file — grammar, nextRunAt DST contract)
- tz.js:1-60 (resolveTz, localParts)
- src/pages/governance.js (full — operatorCard, rolesCard, seg idiom, teardown)
- src/pages/backup.js (full — runRow, restoreRow, taskFormCard, builder)
- src/actions/actions.js:2846-2876 (operator promote/demote actions), :4787-4838 (backupPollTick), :4879-4897 (RESTORE_REFUSAL_TOASTS)
- src/core/download.js (filenameFrom, saveBlob)
- test/restore-s3-e2e.test.mjs, test/pg-matrix.test.mjs, test/copy-sqlite-to-pg.test.mjs, test/backup-scheduler.test.mjs (harness idioms), test/governance-client.test.mjs (pins), test/catalogue.test.mjs + scripts/fr-parity.mjs + scripts/i18n-scan.mjs (i18n gates)
- docs/DEPLOY.md (~:719 §9 Backups — legacy --backup CLI text; target for SC-5)
- Live probes: `node -e` nextRunAt transition matrix (EU/US 2026-2027 — results in Pitfall 5); locale parity check (de/es/nl = 0 missing en keys; fr missing exactly contract.englishOnly); `docker ps` container confirmation; `node --version`

## Metadata

**Confidence breakdown:**
- Standard stack / seams: HIGH — every integration point opened and read this session
- Architecture: HIGH — the download/verify routes copy the verified preview-route funnel
- Pitfalls: HIGH — each is grounded in a verified code fact (payload select list, schema columns, seg absence, count-based retention, scan behavior probed live)
- DST dates/behavior: HIGH — computed and observed live via cron.js itself

**Research date:** 2026-11-23
**Valid until:** phase-local research; codebase moves with this milestone only
