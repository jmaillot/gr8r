---
phase: 89
phase_name: "restore"
project: "gr8r"
generated: "2026-11-23T12:30:00Z"
counts:
  decisions: 6
  lessons: 5
  patterns: 5
  surprises: 4
missing_artifacts: []
---

# Phase 89 Learnings: Restore

## Decisions

### Fail-closed DR totality (D-89-10) proven right in production
Every doc-graph reference must resolve in the archive's id map before ANY insert; unresolved refs refuse the whole run (restoreRemapIncomplete), ids are never nulled or dropped silently. Missing doc-referenced blobs refuse the DR too (restoreBlobFailed), while import-as-new/overwrite tolerate flagged-missing blobs as flagged rows (D-89-12). The tiered strictness (DR totalitarian, selective paths tolerant) is the ratified contract.

**Rationale:** a half-restored instance that looks alive is worse than a clean refusal — DR is the catastrophic-recovery path and disconnects everyone; it must be total or nothing.
**Source:** 89-CONTEXT.md (D-89-10/D-89-12), validated live in 89-UAT.md (5 failed runs before the clean DR, all fail-closed)

---

### Engine-neutral SQL in both schema mirrors (G-89-2)
The restore_lock seed originally used sqlite-only `insert or ignore` inside SQLITE_SCHEMA; pgSchemaVariant is a DDL-only rewrite and passed it through verbatim → pg boot 42601. Fixed with engine-neutral `on conflict do nothing` (valid SQLite 3.24+ / pg 9.5+) in BOTH mirrors (db-adapter.mjs + server.js).

**Rationale:** any engine-dialect SQL inside the twin-schema blocks must be valid on both engines; the variant rewriter only handles DDL shapes, never DML dialect.
**Source:** 89-UAT.md test 2, commit `264ec171`

---

### Writer seam + stage vocabulary for long-running restores (D-89-29/D-89-31)
restore_runs rows written through a best-effort writer seam (setRestoreRunWriter/emitRestoreRunEvent) emitting fetching → validating → restoring → verifying → done|failed; COALESCE per field so a partial event never wipes an earlier value; one tx per restore unit; single-row CAS lock (the WHERE clause IS the compare-and-set) — no advisory locks, identical on both engines.

**Rationale:** restores outlive HTTP requests; the client polls a persisted stage pipeline instead of holding a connection open.
**Source:** 89-02-SUMMARY.md, 89-04-SUMMARY.md

---

### Run-row-truth badges, never live probing (D-89-14/15)
The restore list's location badges (local/s3/missing) derive ONLY from the backup_runs.uploaded column + local fs existence — zero ListObjectsV2 on the path. `uploaded` is written in exactly one place: the upload success block AFTER stream-back + sidecar verification, never in a catch path.

**Rationale:** honest badges without S3 latency/cost on every list render; a refused upload can never look uploaded.
**Source:** 89-03-SUMMARY.md

---

### Server-side confirm re-validation reads the LIVE row (D-89-27)
Type-to-confirm values (workspace name, RESTORE-INSTANCE phrase) are validated against the target's exact CURRENT live value server-side, BEFORE archive resolution. The client confirmModal is chrome, never the boundary.

**Rationale:** archive contents and client state are attacker/stale-influenced; the live row is the only authority.
**Source:** 89-05-SUMMARY.md

---

### Post-commit global session revocation as the DR notification (D-89-25/D-89-28)
The DR unit commits first, then deletes every session row (including the initiator's) — the re-login wall IS the notification. Outcome emails skip trigger='instance' runs, enforced server-side.

**Rationale:** after a full-instance replace there is no coherent "session" to preserve; forcing re-login everywhere is the honest signal.
**Source:** 89-05-SUMMARY.md, felt live in 89-UAT.md test 4 (run 2ac522b8)

---

## Lessons

### Vite cannot catch a free-identifier call — source-assertion tests can't either
`pageBackup` called `refreshRestoreBackups()` at render time without importing it. The bundle shipped broken (runtime ReferenceError → error boundary) and restore-client tests (source assertions, not runtime renders) stayed green. Caught only by live UAT with a restore-capable account.

**Context:** the crash was role-gated (canRestore), so plain-account testing never saw it. Any render-kick fetch must be imported AND covered by at least one runtime render test or a live role-matrix pass.
**Source:** 89-UAT.md test 4, commit `0b829701`

---

### Reading the doc graph: it lives under `.data`, always
Two "instance is clean" scans read `JSON.parse(doc)` and found nothing; `docData` (restore.js:660) reads `JSON.parse(doc).data`. Wrong-level reads produced false confidence twice during the live DR diagnosis.

**Context:** probe scripts must reuse the app's own accessor (`docData` shape) or explicitly unwrap `.data`.
**Source:** 89-UAT.md test 4 diagnosis

---

### pg-matrix tests share one live DB — per-file runs are the instrument
Running pg-matrix with `--test-concurrency=2` makes tests drop each other's tables → false failures. The documented instrument is per-file execution (pg-matrix, db-adapter, copy-sqlite-to-pg each as its own `node --test` invocation).

**Context:** POSTGRES_TEST_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres (docker postgres:18-alpine, prod version).
**Source:** 89-UAT.md test 2

---

### Backup writer flags data problems it cannot fix — surface them earlier
The writer honestly flags missingBlob entries (D-04 record+continue), but nothing tells the operator at backup time that the resulting archive will be DR-refused. The discovery happened at restore time, worst possible moment.

**Context:** candidate improvement for a future phase: backup-time warning ("this archive contains N flagged blobs — DR will refuse it") and a periodic doc↔disk integrity sweep (orphan doc.files[] entries, silent blob loss).
**Source:** 89-UAT.md test 4 observations

---

### A "passed" build claim needs a bundle-hash check, not trust
The initial "can't access backup page" report looked like a regression in current code; server probes were all 200 because the server was current — the client bundle was the stale/wrong artifact. Asking for the exact console stack (`ReferenceError: refreshRestoreBackups is not defined` + asset filenames) pinned it in one message.

**Context:** in PWA/SPA deployments, always confirm which asset hash the browser actually loaded before debugging server-side.
**Source:** 89-UAT.md test 4

---

## Patterns

### Keyed refusal vocabulary (stable .code strings) end-to-end
Every refusal is a keyed error (`restoreEntryRejected`, `restoreShaMismatch`, `restoreRemapIncomplete`, `backupRestoreInProgress`, …) persisted verbatim as `<code>: <message>` into restore_runs.error, mapped 1:1 to client toast keys (RESTORE_REFUSAL_TOASTS closed map) and ×5 locale keys.

**When to use:** any surface where a server refusal must survive persistence, display, and translation without string-matching messages.
**Source:** 89-01/02/03/06-SUMMARY.md

---

### Hash-on-the-pipe (hashTap idiom)
sha256 computed on the same streaming pass as enumeration/extraction/upload/download — memory flat regardless of blob size, one disk pass. Reused from 88 (downloadToStaged) into 89's reader, verifier, and staging extraction.

**When to use:** any content-addressed streaming path (verify, copy, upload) — never buffer-then-hash.
**Source:** 89-01-SUMMARY.md, 89-03-SUMMARY.md

---

### Stateful tar block walker with per-entry write sinks
TarWalker withholds its `_write` callback until the per-entry sink drains (backpressure), skips gate-refused entries by consuming block-rounded bytes, refuses duplicate entry names at walk level. Zero npm deps (D-33-11).

**When to use:** parsing container formats inside a stream pipeline where per-entry routing decisions depend on external state (manifest, allow-list).
**Source:** 89-01-SUMMARY.md

---

### Test-only probe routes driving server-internal helpers
`/api/internal/restore-probe` (RESTORE_TEST_TOKEN-gated, production 404s) drives claim/release/emit for the suite — same harness pattern as the backup-scheduler pass. Lets route-level tests exercise lock CAS and writer events without importing server.js internals.

**When to use:** server-internal state machines that need black-box route tests.
**Source:** 89-02-SUMMARY.md, 89-05-SUMMARY.md

---

### Payload-flag authority chrome (D-89-21)
The client renders CTAs only from payload flags (canBackup/canRestore/isInstanceAdmin + live-membership resolvability for overwrite targets) — authority never recomputed client-side; the server re-validates everything.

**When to use:** every capability-gated UI surface — the client shows what the server already decided.
**Source:** 89-06-SUMMARY.md, verified in 89-UAT.md test 5

---

## Surprises

### The DR refused FIVE runs before one succeeded — all correctly
Three runs hit the orphan `files[]` entry (doc referenced task `t67073s6r4258` — deleted task, entry left behind), one hit the fresh archive carrying the same orphan (faithful writer), one hit a missing blob (`Connexion au portail SE3.docx`, gone from /data/files and every archive). Zero partial writes, zero side effects across all five refusals.

**Impact:** the fail-closed posture survived contact with messy production data; both live-data defects are now catalogued for a future integrity-sweep phase.
**Source:** 89-UAT.md test 4

---

### Task deletion leaves an orphan in doc.files[]
Deleting a task does not remove the file entries pointing at it — the live app tolerates it, the DR (correctly) does not.

**Impact:** pre-existing app bug noted out-of-scope; candidate for the Phase 90+ integrity sweep or a task-deletion cascade fix.
**Source:** 89-UAT.md test 4 observations

---

### The SPA restore list can go stale after a fresh backup
refreshRestoreBackups is a single in-render kick (`!S.ui.restoreList`); a backup completed after the list was filled is invisible until a full reload.

**Impact:** minor UX gap, candidate for Phase 90 polish (invalidate restoreList on backup-run completion).
**Source:** 89-UAT.md test 5 diagnosis

---

### Headless Playwright verified the locale matrix better than eyeballing
Locale forced via PATCH /api/auth/me (account locale wins over localStorage per adoptAccountLocale — a localStorage seed alone silently does nothing for signed-in users). All 4 combos (DR/overwrite × de/fr) measured at 360px: scrollWidth==clientWidth everywhere.

**Impact:** manual-only UAT items are scriptable when the app exposes a clean locale API; measurement (scrollWidth diffs) beats screenshots for overflow claims.
**Source:** 89-UAT.md test 5
