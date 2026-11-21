# Pitfalls Research — v3.3 Instance Operations (Backup, Restore & Roles)

**Domain:** adding scheduled backup + selective restore to an existing zero-dependency single-process Node.js app (SQLite default / optional Postgres, file uploads in DATA_DIR, setInterval scheduler, SMTP mailer)
**Researched:** 2026-11-21
**Confidence:** HIGH (SQLite/SigV4/scheduler/rotation/restore semantics are well-documented engineering knowledge; cross-checked against the codebase's own proven patterns — `vacuum into` pre-migration backups, WR-04 pg caveat, `--backup` CLI, v1.5 reminder scheduler)

---

## Critical Pitfalls

### Pitfall 1: Snapshotting SQLite while writes occur — copying a live DB file or checkpointing wrong

**What goes wrong:**
The naive approach — `fs.copyFile(DB_PATH)` or reading the `.db` file — captures a torn state: pages in the WAL that haven't been checkpointed are missing from the copy, and the copy can be internally inconsistent mid-write. The restore then fails integrity checks or silently loses the most recent writes. A second trap: running `PRAGMA wal_checkpoint(TRUNCATE)` at backup time while writers are active either blocks on busy writers (backup "hangs") or fails silently with `SQLITE_BUSY`, leaving the "snapshot" stale.

**Why it happens:**
Developers treat the DB file as a single object; with WAL mode the truth is spread across `projects.db` + `projects.db-wal` + `projects.db-shm`. Also, `node:sqlite` doesn't expose the SQLite Online Backup API the way better-sqlite3's `.backup()` does — the codebase's own proven primitive is `VACUUM INTO` (used by `migrateTenancy` and every pre-migration backup), which is safe on a live, WAL-mode database and produces a fully checkpointed, consistent single file.

**How to avoid:**
- Use the codebase's own `VACUUM INTO` inside a read transaction (the established pattern, server.js:3778) as the ONLY snapshot mechanism on SQLite. Never copy the live file; never hand-copy `-wal`/`-shm` sidecars.
- `VACUUM INTO` on a live DB does NOT block writers for the whole export (it takes a read snapshot), but it does serialize with checkpoints — accept a brief pause, and run the export on a `setImmediate`/idle-friendly path rather than inside a hot request handler.
- For **Postgres (WR-04 precedent)**: there is NO file-level backup. The backup must be a logical SELECT-based export running in one repeatable-read transaction (`BEGIN ISOLATION LEVEL REPEATABLE READ`), so the exported rows are a consistent snapshot. Do not attempt to fake pg parity by exporting table-by-table in separate implicit transactions.
- The backup destination file must be written to a temp name (e.g. `.part`) and renamed atomically only after success — a crashed backup must never leave a truncated file that rotation later treats as "the newest backup".

**Warning signs:**
Restored DB fails `PRAGMA integrity_check`; backup file size ≪ live DB size; backup files appearing in DATA_DIR while a `-wal` file persists next to them.

**Phase to address:** Backup export core phase (first backup phase) — the snapshot mechanism is the foundation; everything else (S3, rotation, restore) consumes its output.

---

### Pitfall 2: Logical export is not one consistent snapshot — mid-transaction rows and file/manifest mismatch

**What goes wrong:**
The logical export reads tables one at a time in separate implicit transactions. Between reading `workspaces` and reading `tasks`, a user edits a task — the exported archive mixes two moments in time and foreign keys dangle (task references a project revision that doesn't exist in the archive). Worse for the file story: DB rows are exported first, then DATA_DIR files are copied — an upload that lands between the two passes is missing from the archive while its row IS present (manifest says N files, archive has N−1), or vice versa.

**How to avoid:**
- One snapshot fence: SQLite — the `VACUUM INTO` file IS the snapshot; run the logical row export **against the snapshot file** opened as a second read-only connection, not against the live DB. Postgres — one REPEATABLE READ transaction for the whole row export.
- Fence the files: enumerate DB rows that reference files first (under the snapshot), compute the exact set of `DATA_DIR/files` paths needed, copy only those, and emit a **manifest** (row counts, per-file sha256, row-export timestamp, schema version). Then verify: every file path in the manifest exists in the archive and every file in the archive is in the manifest. A mismatch marks the run FAILED — never ship an archive that fails self-verification.
- Record `schemaVersion` and export timestamp in the manifest; restore depends on it (Pitfall 12).
- Keep the snapshot connection open for the whole run (SQLite) / transaction open (pg) — closing early unfences the export.

**Warning signs:** e2e test where a write happens mid-backup produces FK-dangling archives; archives whose manifest file count ≠ actual file count.

**Phase to address:** Backup export core phase (same as Pitfall 1 — snapshot fence and manifest are one design unit).

---

### Pitfall 3: Hand-rolled S3 SigV4 — canonical request traps

**What goes wrong:**
SigV4 has a dozen exacting requirements; hand-rolled implementations fail against real S3 even when they pass against MinIO. The classic traps:
- **Payload hash on streaming uploads:** the canonical request needs `x-amz-content-sha256` of the *body bytes*. For a multi-GB backup streamed from a temp file you must hash the file first (sha256 of the full stream), then send that as the signed header — signing with `UNSIGNED-PAYLOAD` requires HTTPS and is not honored by all S3-compatible providers. Buffering the whole backup in memory to hash-and-send in one pass will OOM at real backup sizes.
- **Presigned vs header auth confusion:** presigned URLs sign a *different* canonical request (query string, no `x-amz-content-sha256` header semantics, expiry clock). Mixing the two (e.g. adding the header to a presigned URL) breaks the signature. Pick header auth (SigV4 headers) for the server-side uploader — presigning buys nothing when the signer and sender are the same process.
- **Clock skew:** signature window is ±15 min. A Docker container whose clock drifts gets intermittent `RequestTimeTooSkewed` — a *scheduled* backup feature makes this a recurring, confusing failure. Fail with a distinct, keyed refusal that names clock skew.
- **Path-style vs virtual-host:** `https://s3.amazonaws.com/bucket/key` (path-style) vs `https://bucket.s3.amazonaws.com/key`. MinIO and B2 only reliably support path-style; AWS us-east-1 needs path-style for some bucket names; the bucket name lands IN the signature either way. Hardcode path-style for v1 (the deployment is self-hosted against MinIO/B2-style endpoints) — don't make it configurable.
- **Canonicalization details:** URI-encode every path segment (but keep `/` separators), sort headers lowercase, trim whitespace, use the exact `x-amz-*` headers sent, sign `host` explicitly. Off-by-one here yields `SignatureDoesNotMatch` with no diagnosis.

**How to avoid:**
Write the signer against a golden-vector test (AWS publishes test suites; the S3 docs example requests are pinned vectors). Test against MinIO in CI (e2e already runs a server; MinIO via docker in the e2e stack is a dev-only dependency, not a runtime one). Stream uploads with known-content-length + pre-computed sha256. One config surface: `endpoint`, `bucket`, `region`, `accessKeyId`, `secretAccessKey`, all strict-token env-validated.

**Warning signs:** `SignatureDoesNotMatch` only on some object names (spaces/unicode); intermittent `RequestTimeTooSkewed`; works on MinIO, fails on AWS.

**Phase to address:** S3 destination phase — dedicated phase because SigV4 deserves its own verification loop (golden vectors + MinIO e2e), not tasks inside the backup-core phase.

---

### Pitfall 4: Multipart upload + checksum trailing headers — the silent corruption trap

**What goes wrong:**
Large backups exceed the 5 GB single-PUT limit; multipart is mandatory. Traps:
- **ETag ≠ sha256.** A multipart ETag is `md5-of-md5s-N`, not the object's content hash. Any code that "verifies" the upload by comparing the returned ETag to the local sha256 will fail or (worse, if it "fixes" the comparison) store a wrong checksum. The run record must store BOTH: S3 ETag (with part count) and the local sha256.
- **Trailing checksum headers (`x-amz-checksum-*`):** the newer AWS flexible-checksum API appends checksums as *trailing headers* after the body chunk stream. MinIO and older B2 gateways choke on them. For v1: use the classic `Content-MD5`-free, sha256-signed PUT/multipart flow without optional checksum trailing headers, and store the checksum locally in the run record instead of trying to push it to S3 metadata.
- **Resumable/retry corruption:** retrying a failed part upload with a different part number offset, or appending to a partially-written local temp file, produces an object whose bytes don't match the sha256 recorded at export time. Rule: every upload attempt starts from the complete, checksummed local file; parts are re-uploaded whole; a failed upload aborts the multipart (`AbortMultipartUpload`) so no orphaned parts accrue storage charges.
- **List-after-write/list-after-delete eventual consistency:** S3 is strongly consistent for reads today, but MinIO gateways, B2, and some S3-compatible providers are not. After `DeleteObjects`, a subsequent `ListObjectsV2` can still show the deleted key — rotation code that trusts the list immediately will re-delete (harmless) or re-count (harmful — see Pitfall 7).

**How to avoid:** part size fixed (e.g. 64 MB), each part content-length exact, retry per-part with full re-PUT, abort multipart on run failure, verify by re-reading part count + ETag list. Store sha256 locally; treat S3 ETag as transport evidence only.

**Warning signs:** orphaned `part-N` uploads accumulating in the bucket; checksum mismatch on download-verify; `NoSuchUpload` on retries.

**Phase to address:** S3 destination phase (with Pitfall 3 — same verification loop). Multipart should be an explicit requirement of that phase, not discovered at >5 GB runtime failure.

---

### Pitfall 5: setInterval drift, missed runs across restarts, and overlapping runs

**What goes wrong:**
- **Drift:** `setInterval(fn, 60_000)` fires at *interval-after-completion* boundaries and accumulates drift; combined with the event loop being busy (a large backup export!), ticks fire late. The existing v1.5 reminder scheduler already lives with this at minute granularity — fine for reminders, wrong for cron.
- **Missed runs across restarts:** a backup scheduled at 02:00 with a server restart at 01:59 is silently skipped; nothing records that the run never happened. Worse, a crash *during* a run leaves the run row in `running` forever, and if the "is a run active?" guard reads that stale row, **all future backups of that task are blocked** — the most likely production incident of this whole milestone.
- **Overlapping runs:** a 40-minute backup with a 30-minute cron schedule starts run 2 while run 1 is still streaming to S3 — two exports, two rotations racing, double emails.
- **In-memory-only scheduling:** if the schedule lives in memory and the task rows live in SQLite, a restart with a cached interval for a deleted task keeps backing up (and rotating!) ghost tasks.

**How to avoid:**
- Reuse and extend the v1.5 scheduler pattern, but make it **reconcile-from-DB**: a single 30–60 s tick reads `backup_tasks` from the DB each tick (no cached intervals), computes "next due" from `last_run_at` + cron, and fires when `now >= nextDue`. This is self-healing across restarts and drift (each tick re-derives the truth) — never accumulate offsets.
- Persist run rows with explicit states `running → succeeded | failed`, and on boot, **sweep any `running` rows to `failed (interrupted)`** — the stale-row cure.
- Overlap guard: per-task in-process lock (single process — a simple `Set` of running task ids, checked and set synchronously before starting). If due while running: skip and log `skipped_overlap` (and record it in history — a silent skip is a lie). Do NOT queue the missed run for later; that compounds.
- Cron evaluation: use a minimal hand-rolled 5-field cron matcher (zero deps, same as everything else) evaluated against **UTC only** — see Pitfall 6.

**Warning signs:** run history showing gaps with no row at all; a task stuck with one `running` row dated days ago; two `succeeded` rows 20 min apart on a 30-min cron that take 40 min each.

**Phase to address:** Scheduler + run-history phase (after backup core, before S3/rotation) — the reconcile-from-DB + boot-sweep design must exist before rotation, because rotation decisions depend on honest run history.

---

### Pitfall 6: Timezone and DST — whose midnight is it?

**What goes wrong:**
A cron of `0 2 * * *` means different things to the server (UTC), the instance operator (their TZ), and the workspace (workspace-shared `tz` from v1.5). A European operator sets "02:00", the backup fires at 02:00 UTC = 03:00/04:00 local, and they report it as broken. DST is worse: a TZ-fixed schedule drifts an hour twice a year; a wall-clock schedule "02:00 Europe/Paris" simply does not exist one Sunday a year (2:00→3:00 spring-forward) and exists twice in autumn.

**How to avoid:**
Decide once, document in DEPLOY.md, and label it in the UI: **schedules are instance-local — the timezone comes from a per-task (or per-instance) explicit TZ field defaulting to UTC, evaluated with `Intl.DateTimeFormat` timezone support (already a proven pattern — `resolveTz` funnel from Phase 44).** Never infer TZ from the server clock. For the nonexistent spring-forward hour, define the behavior explicitly (fire at the next valid minute; record `dst_skew` in the run row). Never store "next run" precomputed across a DST boundary — always recompute from the cron + TZ (this also makes the reconcile scheduler of Pitfall 5 trivially DST-correct).

**Warning signs:** support tickets saying "backup ran at the wrong hour"; runs appearing one hour off after October/March.

**Phase to address:** Scheduler phase — a task-table `tz` column is a schema decision that must land with the table, not retrofitted.

---

### Pitfall 7: Rotation deleting the only good backup — ordering and the "rotation deleted everything" failure

**What goes wrong:**
The classic catastrophic bug: GFS rotation logic (keep 7 daily / 4 weekly / 12 monthly) computes the delete list from the *list of backups present*, but the newest backup upload failed — so the "newest" the rotation sees is yesterday's, and rotation deletes it as no longer in any retention window. Or the delete step runs *before* verifying the new upload succeeded, so "clean up old, then upload" leaves zero backups when the upload fails. Or a listing bug (Pitfall 4 eventual consistency) makes the rotator count wrong.

**How to avoid:**
- **Inviolable ordering:** upload new backup → verify (checksum/ETag/size) → record run as succeeded → THEN rotate. Rotation only ever runs after a *verified successful* new backup exists in that destination.
- **Never-delete-the-newest invariant enforced structurally:** the retention calculation always excludes the newest verified backup by ID from the deletable set — pass it in explicitly, don't derive "which is newest" from a listing.
- **Delete list must be explicit and audited:** log every deletion (key, retention bucket, age) into the run history; a rotation that deletes N files records N deletion entries.
- **Minimum floor:** refuse to rotate if the resulting set would be empty (defense against list corruption).
- **S3 list-after-delete:** tolerate stale listings — delete by explicit key (from the recorded backup index, not from a fresh list), and treat "delete of already-deleted key" as success, not error.

**Warning signs:** a destination whose backup count only ever decreases; rotation logs deleting a backup created <24 h ago; `ListObjects` returning keys that were deleted seconds ago.

**Phase to address:** Rotation phase — with an e2e test that specifically proves "upload fails → rotation does not run" and "rotation never deletes the newest verified backup".

---

### Pitfall 8: Partial restore leaving half-imported state

**What goes wrong:**
A workspace restore imports rows across many tables (workspaces, memberships, projects, tasks, files, notifications, saved_views...). If the import runs statement-by-statement without a transaction and the process dies (or a constraint fires halfway), the instance is left with a workspace containing some tables' rows only — worse than the pre-restore state because it looks valid. Cross-scope restores (instance scope = many tables) magnify this.

**How to avoid:**
- **One transaction per restore unit** (the workspace/project being restored), exactly like the existing migration discipline ("row-insert + doc-strip in ONE transaction"). SQLite: a single `BEGIN IMMEDIATE ... COMMIT`; pg: one transaction on one connection.
- **Snapshot-first before any overwrite restore:** the guarded overwrite mode must take a full pre-restore snapshot (the same `VACUUM INTO`/pg-dump-style export of Pitfall 1) BEFORE the transaction opens — a snapshot taken after a partial import is useless.
- **Files too:** file blobs restored from the archive go to temp names and rename atomically after the DB transaction commits; on rollback, delete temps. A DB row pointing at a missing file or an orphaned blob with no row is the file-flavored half-state.
- **Verify after commit:** row counts restored vs manifest counts compared and logged; mismatch = restore recorded as `succeeded_with_warnings`, surfaced in UI, not silently green.

**Warning signs:** after a failed restore, workspaces with members but no projects; `PRAGMA foreign_key_check` violations post-restore; file rows whose blobs 404.

**Phase to address:** Restore phase — transactional boundary is the restore phase's first requirement, before any UI.

---

### Pitfall 9: ID collisions on import-as-new — and the `-restored` suffix trap

**What goes wrong:**
Import-as-new ("restore beside, with `-restored` suffix") naive-inserts the archived rows preserving IDs. Two failure modes: (a) PK collision with live rows of the same ids → constraint failure mid-transaction (feeding Pitfall 8); (b) the developer remaps IDs with `newId = max(id)+1` — which collides with concurrent inserts and breaks cross-references (task → project → workspace chains must ALL remap consistently; a partial remap links restored tasks onto *live* projects, silently corrupting real data).

**How to avoid:**
- Preserve ALL ids inside the restored subtree and make the restored *root* (workspace or project) unique: slug/name suffix `-restored` (+ numeric disambiguator on repeat). IDs only need to be unique within their table *globally* though — SQLite rowid PKs and pg sequences will collide with live rows. So the correct unit is: **remap the root id, preserve internal relative references** — i.e., export rows already keyed by their own ids, import with a deterministic remap table built in-memory first (old-id → new-id for every row in the subtree), validate the remap is total (every referenced id remapped), THEN insert in dependency order inside the one transaction of Pitfall 8.
- Reserve the new id ranges before inserting (allocate all new ids up front) so no concurrent insert can steal them mid-import — single-process makes this easy with the same synchronous allocation the app already uses.
- The `-restored` workspace must be born with **zero memberships except the restoring operator** — an import-as-new that silently restores the old membership list re-grants access to people who may have since been removed (access-control regression).

**Warning signs:** restored tasks appearing inside a live project; FK check failures mentioning both archived and live ids; users reporting access to a "-restored" workspace they never joined.

**Phase to address:** Restore phase (import-as-new is the default mode — it lands first within the phase).

---

### Pitfall 10: Self-restore recursion — restoring backup_tasks (and other operational tables) into the live instance

**What goes wrong:**
The backup contains `backup_tasks` rows — including possibly the very task definition whose schedule is running *right now* (a "Run now" of an instance-scope restore). Restoring them blindly can: duplicate schedules (two intervals for the same cron), resurrect a deleted task (its rotation then deletes backups the operator thought were gone), or overwrite the live task row mid-run while its run-history is being written. Same hazard class for `instance_roles` (Pitfall 11), sessions, invites, recovery codes: restoring a *stale* `sessions` table resurrects revoked sessions.

**How to avoid:**
- **Classify tables at export time:** the manifest marks tables as `data` (restorable) vs `operational` (never restored in-place: backup_tasks, run history, instance_roles, sessions, login_challenges, recovery_codes, api keys, push subscriptions, webhooks, email_outbox). Operational tables are still IN the archive (they're needed for a full-instance restore-as-new) but the selective-restore UI offers them only under the overwrite mode's type-to-confirm.
- Even in overwrite mode, restoring `backup_tasks` must go through the scheduler reconcile (Pitfall 5): reload-from-DB makes the new/changed schedules take effect and stale intervals die naturally — never hot-swap intervals directly.
- An instance-scope restore should refuse (keyed refusal) to touch operational tables in overwrite mode by default; a dedicated "restore everything including scheduling" is a separate, explicitly typed confirmation.

**Warning signs:** duplicated backup tasks after a restore; a deleted task reappearing and deleting backups; revoked sessions becoming valid.

**Phase to address:** Restore phase (table classification is an export-side manifest decision — note it in the backup-core phase too so the manifest carries it from day one).

---

### Pitfall 11: Privilege escalation via restore — the backup contains ALL users (and all secrets)

**What goes wrong:**
This is the security headline of the milestone. A **Backup Operator** (a new, lower role) can create and download instance-scope backups. The backup contains: every user's email, scrypt hashes, TOTP secrets (AES-GCM encrypted under MASTER_KEY — which lives in the same deployment), API keys (`psk_live_` hashes), webhook secrets, Entra mappings. A Restore Operator who can *restore* a backup they can *read* effectively gets: (a) offline cracking of all password hashes; (b) **overwrite-restore of the `users` table with an old snapshot where THEY were instance admin** — a privilege escalation that survives demotion; (c) restore of stale `instance_roles` re-granting removed operators.

**How to avoid:**
- **Restore-what-you-can-administer rule:** selective restore targets are scoped by the *caller's current live rights*, not the archive's. A Restore Operator may restore a *workspace* they currently administer; instance-scope and user-table restores require live instance-admin (or Super Admin). This check runs against live DB state at restore time — never against roles captured in the archive.
- Backup *download* rights are stricter than backup *create/run* rights: an operator can trigger and see run status without downloading the archive bytes. Download of instance-scope archives = instance admin only.
- Restore of `users`, `sessions`, `instance_roles`, `backup_tasks` requires Super Admin + type-to-confirm, regardless of archive scope.
- After ANY overwrite restore that touched users/roles: force global session revocation (the existing operator-revocation machinery) and log to the audit funnel. The pre-restore snapshot (Pitfall 8) is the rollback for a malicious or mistaken restore.
- `instance_roles` interplay: keep `users.is_instance_admin` as the bootstrapped Super Admin (D-112) and make `instance_roles` purely additive grants (Backup Operator / Restore Operator rows). Never let a restore of `instance_roles` *demote or remove* Super Admins (they're auto-members per the milestone goal); role rows restore additively or not at all.

**Warning signs:** a Restore Operator UI showing instance-scope targets; archive download links served to non-admins; `instance_roles` restore changing Super Admin membership.

**Phase to address:** Roles phase AND restore phase jointly — the role definitions must encode "restore authority ≠ read authority of the archive contents"; the restore endpoints enforce live-right scoping. This deserves an explicit security-contract entry (the Phase 30 pattern: threats list, `threats_open: 0`).

---

### Pitfall 12: Checksum ambiguity — checksum of WHAT, verified by WHOM

**What goes wrong:**
The requirement says "sha256 checksum" but never says of what. Ambiguity breeds: checksum computed over the *manifest JSON* (not the archive bytes) — restores verify the wrong thing; checksum computed *while streaming to S3* over compressed bytes but *stored* as if over uncompressed; a checksum recorded in the run row but never actually verified on download/restore (it's decoration, not integrity); retry uploads re-hashing a file mutated in between (temp file reused) so the recorded checksum doesn't match the stored object.

**How to avoid:**
Define one canonical statement and pin it in the plan + tests: **the sha256 is of the final archive artifact bytes as written to the destination, computed once at export completion from the temp file, stored in the manifest AND the run row, and re-verified (a) after upload by size+ETag-part-count, and (b) at restore time by streaming-hash before any row is imported.** A restore that fails checksum verification refuses with a keyed refusal — never imports unverified bytes. Every upload attempt re-reads the same immutable temp file (Pitfall 4), so checksum and object can't diverge.

**Warning signs:** restore succeeds on a truncated archive; checksum field differing between manifest and run row; verifying "checksum" by comparing to the S3 ETag (Pitfall 4).

**Phase to address:** Backup core phase defines it (manifest schema), S3 phase implements transport verification, restore phase implements the restore-time gate.

---

### Pitfall 13: Failure-email loops — SMTP down + every run failing = mail storm

**What goes wrong:**
Every failed backup sends a failure email. If SMTP is down (or rate-limited), the app's existing email retry/backoff (webhook-style claim-then-deliver) retries; meanwhile the next scheduled run also fails and also emails. With a 15-min cron, that's ~100 emails/day per task *plus* retries — and the operator's mailbox is the only signal channel, now flooded. Second variant: the failure email itself fails → retry → the retry-failure notification attempts another email → loop.

**How to avoid:**
- Reuse the proven `email_outbox` claim-then-deliver machinery (v2.4 pattern) with its capped retry (7-day purge, 5-strike) — no new email path.
- **Failure-notify with state memory:** send a failure email only on *transition* into failure (last run succeeded, this one failed) and a *recovery* email on transition back to success. A task failing for 3 days emails once, not 288 times. Persist `last_notified_state` on the task row.
- **Consecutive-failure escalation cap:** after N consecutive failures (e.g. 3), switch to a daily digest of the same failure instead of per-run emails; the run history carries the detail.
- Never email about a *skipped-overlap* run (Pitfall 5) — that's a log entry, not an incident.
- The failure email must include: task name, scope, run id, first error line, run-history deep link. Not the full stack (secrets/paths leak into mail).

**Warning signs:** `email_outbox` growing unboundedly with identical subjects; operators reporting hundreds of identical mails; SMTP errors appearing inside backup failure emails recursively.

**Phase to address:** Run history + notification phase — transition-based notify is a schema decision (`last_notified_state` on the task) that must land with the task table.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Copying the live `.db` file instead of `VACUUM INTO` | Faster backup | Torn snapshots, restore failures discovered *during the incident* | Never |
| Tables exported in separate implicit transactions (pg) | Simpler code | FK-dangling archives; restore corrupts | Never — one REPEATABLE READ txn |
| ETag treated as content checksum | Looks verified | Wrong integrity story; real corruption undetected | Never — store sha256 separately |
| Rotation deleting before verifying new upload | Shorter code | Zero-backup window after upload failure | Never |
| Schedules cached in intervals instead of reconciled from DB | Feels efficient | Ghost tasks, stale-interval incidents after restores/deletes | Never (single process makes reconcile cheap) |
| Preserving archived user rows in a selective restore | "Complete" restore | Privilege escalation via stale roles | Only under Super Admin overwrite + session revocation |
| Per-run failure emails without transition memory | Simple | Mail storms when SMTP degrades | MVP-only, capped at 1 email/run/day if truly temporary |
| Buffering whole archive in memory for hash/upload | Simple signer | OOM at real backup sizes | Only if a hard size cap (e.g. 200 MB) is enforced and documented |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| S3 / MinIO / B2 | Virtual-host addressing; assuming ETag = md5; trailing checksum headers | Path-style; store sha256 locally; classic signed PUT/multipart without optional checksum trailers |
| S3 clock | Trusting container clock | Distinct keyed refusal on `RequestTimeTooSkewed`; document NTP expectation in DEPLOY.md |
| SMTP (existing mailer) | New email path for backup failures | Reuse `email_outbox` claim-then-deliver; transition-based send |
| Docker / DATA_DIR | Writing backups inside the container FS only | Backups go under DATA_DIR (the mounted volume) — a local destination outside DATA_DIR is lost on redeploy |
| Postgres (WR-04) | Assuming file-backup parity | Logical export in one REPEATABLE READ txn; explicitly different verification story per backend |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Backup export on the request event loop | All API latency spikes during backup | Run export in chunks with `await` yields (the scheduler precedent); never one giant sync read | First backup over a few MB |
| Row-by-row INSERT on restore | Restore of 10k tasks takes minutes, holds transaction | Batched multi-row INSERTs inside the one transaction | >~1k rows |
| sha256 re-hash of entire archive on every retry | Upload retries take as long as first attempt | Hash once at export; retries reuse recorded hash | Large archives × flaky S3 |
| VACUUM INTO blocking hot paths | Brief API stall at snapshot start | Accept (documented); schedule heavy instance backups off-peak via cron | DB > ~1 GB |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Backup archives readable/downloadable by any Backup Operator | All users' hashes, TOTP secrets, webhook HMACs exfiltrated | Download rights tiered above run rights; instance-scope download = instance admin |
| Overwrite-restore of users/roles allowed from archive roles | Privilege escalation via stale snapshot; survives demotion | Live-rights scoping at restore time; users/roles restores = Super Admin only |
| Restored `-restored` workspace keeps archived memberships | Removed users regain access silently | Import-as-new births with only the restoring operator as member |
| Checksum stored but restore doesn't verify | Corrupt archive silently imported | Restore-time streaming-hash gate before any write |
| Full stack traces in failure emails | Internal paths/secrets leak | Curated error line + deep link only |
| Pre-restore snapshot skipped "because it's just a workspace restore" | Overwrite restore becomes unrecoverable | Snapshot mandatory before overwrite mode; type-to-confirm additionally required (milestone goal already specifies both — keep both) |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Cron strings shown raw to operators | "0 2 * * *" meaningless to non-devs | Preset picker (daily/weekly/monthly + custom cron with plain-language preview of next 3 runs incl. TZ) |
| Restore UI offering overwrite as default | Accidental live-data destruction | Import-as-new default (milestone goal already sets this); overwrite behind type-to-confirm |
| Rotation retention shown as abstract numbers | Operator can't tell what will survive | Show the projected deletion list for the current retention config before saving |
| Silent skipped runs (overlap) | "Why didn't my backup run?" | Run history row with `skipped_overlap` state visible in UI |
| Success email on every run | Inbox noise | Success = history row only; failure = transition email (Pitfall 13) |

## "Looks Done But Isn't" Checklist

- [ ] **Backup run:** Often missing boot-time sweep of stale `running` rows — verify a killed server leaves a `failed (interrupted)` row, not a forever-`running` one
- [ ] **Backup run:** Often missing `skipped_overlap` recording — verify an overdue overlapping run appears in history
- [ ] **Archive integrity:** Often missing manifest self-verification (row counts + file sha256s) — verify a corrupted archive fails the run, not the restore
- [ ] **S3 upload:** Often missing multipart abort on failure — verify no orphaned parts after a killed run
- [ ] **Rotation:** Often missing the "upload failed → no rotation" ordering test — verify it in e2e
- [ ] **Restore:** Often missing restore-time checksum gate — verify a flipped byte in the archive refuses the restore
- [ ] **Restore:** Often missing membership reset on import-as-new — verify a `-restored` workspace has only the operator
- [ ] **Restore:** Often missing operational-table classification — verify `backup_tasks`/`users`/`instance_roles` are not selectable in default selective restore
- [ ] **Roles:** Often missing live-rights scoping on restore endpoints — verify a demoted Restore Operator cannot restore instance scope even with an old archive
- [ ] **Notifications:** Often missing transition-memory — verify 10 consecutive failures produce 1 email, not 10
- [ ] **Postgres:** Often missing the pg export path entirely (SQLite-only testing) — verify REPEATABLE READ export e2e against `POSTGRES_TEST_URL`
- [ ] **Locales:** Often missing the new refusal keys in all 5 catalogues — verify the i18n gate covers backup/restore keys

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Torn SQLite snapshot shipped | HIGH | Delete archive; re-run backup; if live DB damaged, restore from last verified backup + accept the gap |
| Rotation deleted needed backups | HIGH | Check other destinations (local vs S3); pre-restore snapshots; else data loss — this is the unrecoverable pitfall, hence its structural prevention |
| Half-imported restore | MEDIUM | Pre-restore snapshot restore (that's its purpose); or re-run restore after fixing the constraint |
| Stale `running` row blocking task | LOW | Boot sweep fixes permanently; manual row update is the immediate fix |
| Mail storm | LOW | Deploy transition-memory; purge duplicate `email_outbox` rows |
| Corrupt S3 object | LOW | Re-run backup (rotation retains prior good copies — that's why verify-before-rotate matters) |
| Privilege escalation via stale-role restore | HIGH | Audit funnel review; revocation sweep; fix scoping; assess exposure window from run history |

## Pitfall-to-Phase Mapping

Suggested phase structure implied by the mapping (backup foundation → destinations → scheduling → restore → roles):

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1, 2 (snapshot fence, manifest) | Backup export core | Integrity-check restored snapshot; mid-write e2e produces consistent archive; manifest self-verify test |
| 3, 4 (SigV4, multipart) | S3 destination | Golden-vector signer tests; MinIO e2e; orphaned-part absence after killed run |
| 5 (scheduler reconciliation) | Scheduler + run history | Restart-mid-run test; overlap-skip test; stale-row boot sweep test |
| 6 (timezone/DST) | Scheduler + run history | DST-boundary cron test via `resolveTz`; TZ column present in schema |
| 7 (rotation ordering) | Rotation | e2e: failed upload → no deletion; newest-verified never in delete list |
| 8 (restore transaction) | Restore | Kill-mid-restore test leaves zero rows; FK check clean post-restore |
| 9 (id remap) | Restore | Remap-totality validator; `-restored` membership test |
| 10 (self-restore recursion) | Backup core (manifest classification) + Restore | Operational tables absent from default selective restore; task reconcile after restore |
| 11 (privilege escalation) | Roles + Restore | Security contract (Phase 30 pattern): live-rights scoping, download tiering, `threats_open: 0` |
| 12 (checksum definition) | Backup core → Restore | Restore refuses flipped-byte archive; checksum identical in manifest + run row |
| 13 (email loops) | Scheduler + run history (notify) | 10-failure → 1-email test; transition + recovery emails |

## Sources

- SQLite docs: WAL, `VACUUM INTO`, Online Backup API caveats (official "gotchas" documentation) — HIGH
- Codebase-internal precedent: `vacuum into` pre-migration backups (server.js:3778+), WR-04 pg no-file-backup ruling, `--backup` CLI, v1.5 scheduler, v2.4 `email_outbox` claim-then-deliver, Phase 44 `resolveTz`, Phase 30 security-contract pattern — HIGH
- AWS SigV4 signing process + S3 multipart/checksum trailer documentation; MinIO/B2 S3-compatibility notes — HIGH (mechanics) / MEDIUM (exact provider quirks may drift; verify against the pinned MinIO version at phase time)
- GFS/Grandfather-Father-Son rotation post-mortems (community ops wisdom: "rotation deleted the only good backup" class of incident) — HIGH as failure mode, standard prevention is verify-before-rotate
- Personal experience / known issues with single-process scheduler reconciliation and restore id-remap — MEDIUM

---
*Pitfalls research for: gr8r v3.3 Instance Operations — Backup, Restore & Roles*
*Researched: 2026-11-21*
