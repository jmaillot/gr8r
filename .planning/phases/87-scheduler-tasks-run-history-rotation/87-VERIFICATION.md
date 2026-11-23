---
phase: 87-scheduler-tasks-run-history-rotation
verified: 2026-11-23T19:22:35Z
status: passed
score: 21/21 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 21/21
  gaps_closed: [] # not a gap-closure round — milestone-close freshness pass (phases 88-90 touched shared surfaces)
  gaps_remaining: []
  regressions: []
covered_files:
  - server.js
  - db-adapter.mjs
  - export/cron.js
  - export/backup.js
  - mailer.js
  - src/pages/backup.js
  - src/actions/actions.js
  - src/core/api.js
  - src/lib/timezones.js
  - src/locales/en.json
  - src/locales/fr.json
  - src/locales/es.json
  - src/locales/de.json
  - src/locales/nl.json
  - test/backup-cron.test.mjs
  - test/backup-tasks-api.test.mjs
  - test/backup-scheduler.test.mjs
  - test/backup-rotation.test.mjs
  - test/backup-history-client.test.mjs
  - test/email-outbox.test.mjs
covered_digest: "v4:sha256:30377572fc5ded58647c6f8474ffd1492fc639d5c39fcb4649389ec40d9f7591"
advisory:
  - finding: "test/backup-scheduler.test.mjs overlap test remains timing-sensitive (polling loop, prior pass line 187 flake); this freshness run it passed deterministically inside the 6-file combined run."
    category: other
    reason: "Carried advisory from the initial pass — no recurrence observed this run; the synchronous claim structurally guarantees the asserted invariant."
    evidence_status: "84/84 pass in one combined run (2026-11-23); 0 flakes"
---

# Phase 87: Scheduler, Tasks, Run History, Rotation — Verification Report (Freshness Re-verification)

**Phase Goal:** Backup tasks run themselves — operators configure multiple scheduled tasks, consult an honest run history, and GFS rotation never deletes the newest verified backup.
**Verified:** 2026-11-23T19:22:35Z (fresh digest over the LIVE tree at HEAD `b18462be`)
**Status:** passed
**Re-verification:** Yes — **milestone-close freshness pass**. The prior report (2026-11-22) went stale because later phases (88 S3 upload, 89 DR restore, 90 polish) extended these shared surfaces. UAT 87 passed with 0 pending scenarios (`gap_snapshot: "passed::scenarios=0"` in 87-UAT.md), resolving the two live-clock human-verification items from the initial pass; this pass re-checks all 21 must-haves against the current tree and does NOT re-run the full suite (known pre-existing failures live in deferred-items.md, out of scope).

## Goal Achievement

**Method note:** Phase 88-90 extensions on these surfaces are ADDITIVE, not regressive, by direct inspection:
- 88-02 widened the `backup_runs` status CHECK with `upload_failed` + added `uploaded`/checksum columns — the 87 statuses (`skipped_overlap`, `deleted`, `interrupted`) remain in the CHECK (`server.js:792/:977`).
- 89-02 added a SECOND `skipped_overlap` path (restore-lock refusal, reason `restore_in_progress`, `server.js:3725-3731`) — it preserves D-05's catch-up-once discipline because `next_run_at` is advanced BEFORE the lock check.
- 90-03 added `gfsKeptPositions` projection (kept-until = bucket position, never a date) consuming the SAME `assignGfsBuckets` walk as the deletion logic — one bucket source, no drift; 90-UAT stage-guards the projection response without touching rotation execution.

### Observable Truths

| # | Truth (source plan) | Status | Evidence (live tree @ b18462be) |
| --- | --- | --- | --- |
| 1 | POST /api/backup/tasks stores raw 5-field cron (D-04) + computed next_run_at (87-01) | ✓ VERIFIED | POST route `server.js:8714` (GET :8697); cron validation via `export/cron.js` (7983 bytes, unchanged); raw string + next_run_at persisted in the :8714 route family; CRUD tests green |
| 2 | Tasks listable/updatable/deletable/enable-disable via API; refusals keyed + audited (87-01) | ✓ VERIFIED | Route family `server.js:8697+`; UPDATE carries s3_enabled (88 additive, `:8973`); keyed-refusal + locale-catalogue parity tests in `test/backup-tasks-api.test.mjs` green |
| 3 | Cron evaluator computes next matching local wall-clock time in task IANA tz, stdlib-only (87-01) | ✓ VERIFIED | `export/cron.js` byte-identical size, zero new deps; `test/backup-cron.test.mjs` green incl. tz/DST cases |
| 4 | Retention columns default 7/4/12/5 (D-09) (87-01) | ✓ VERIFIED | DDL defaults `server.js:758-761` intact; UAT r4 (`1866d6a0`) made them EDITABLE in the builder but defaults unchanged; consumed at `:3933/:3970` |
| 5 | Enabled task with past next_run_at fires exactly once regardless of missed windows (D-05) (87-02) | ✓ VERIFIED | `runBackupSchedulerPass` `server.js:3698` — next_run_at advanced from NOW before the awaited fire (`:3718`); discipline EXTENDED through the 89-02 restore-lock skip (advance precedes the lock check); named test "three windows in the past fires exactly ONCE" green |
| 6 | Overlapping fire records skipped_overlap row, never starts a second export (D-06) (87-02) | ✓ VERIFIED | Synchronous claim remains the atomicity point; overlap skip-row `server.js:3741-3747`; restore-lock skip-row `:3725-3731` (additive, honest reason); scheduler overlap test green this run |
| 7 | Disabled tasks never fire; re-enable recomputes next_run_at (D-07) (87-02) | ✓ VERIFIED | Sweep filters `enabled = 1` (`server.js:3699`); disabled-enable tests green |
| 8 | Stale status='running' rows become 'interrupted' at boot (87-02) | ✓ VERIFIED | `sweepStaleBackupRuns` `server.js:3757`; boot call `:12114` (89 added the parallel restore sweep alongside — same idiom, untouched 87 path) |
| 9 | Manual and scheduled runs both produce persisted backup_runs rows (BKBCK-04) (87-02) | ✓ VERIFIED | Writer seam wiring `setBackupRunWriter(writeBackupRunRow)` at `server.js:3556` (import :87), ONE seam covering POST trigger (:9024) and sweep fires; test green |
| 10 | GET /api/backup/runs?taskId= — newest first, capped ~50 (87-02) | ✓ VERIFIED | Route `server.js:9167`; `limit 50` in both task and manual branches; manual universe `task_id is null` preserved (:9192); frozen `/current` block untouched per :9160 comment; 90-02 added render-only location/chrome fields server-side — client still renders verbatim |
| 11 | GFS rotation applies per task over exactly-one-bucket-labeled archives after verified success (D-10) (87-03) | ✓ VERIFIED | `runBackupRotationPass` `server.js:3946`; per-task succeeded-only scan (:3958); `assignGfsBuckets` UTC exactly-one-bucket walk unchanged; 90-03's `gfsKeptPositions` (:3933) reuses the SAME walk — no drift; `test/backup-rotation.test.mjs` green |
| 12 | Newest verified backup excluded by explicit ID, never ordering (D-13) (87-03) | ✓ VERIFIED | newestVerified resolved by ID then `id <> ?` parameter in the delete-set query (`server.js:3985-3988`); floor guard tests green |
| 13 | Refuse-to-empty floor: pass that would delete everything performs zero deletes (D-13) (87-03) | ✓ VERIFIED | `deleteSet.length >= runsAsc.length` guard → `floorHeld` (`server.js:3991-3995`); test green |
| 14 | Sidecar deleted first, then .tar.gz; rows marked deleted; audited rotation event per pass (D-12) (87-03) | ✓ VERIFIED | `server.js:3999-4018` — rmSync sidecar-first, status='deleted' after both unlinks, `backup_rotation:expired:<bucket:id,...>` audit insert; test green |
| 15 | Manual archives (task_id NULL) never auto-deleted (D-11) (87-03) | ✓ VERIFIED | Per-task universe from `task_id = ?` query (:3958); every delete/mark scoped `task_id = ?`; task_id-null rows reachable only via the manual history read (:9192) |
| 16 | Failure/recovery emails only on state transitions via last_notified_state, through email_outbox, in-locale (D-15/16/17) (87-03) | ✓ VERIFIED | `handleBackupTaskOutcome` compare-in-UPDATE `server.js:3803` (NULL→ok silent); `buildBackupAlertMessage` `mailer.js:749` (exported :1180); outbox D-04 boundary test now asserts EXACTLY the notif + digest + backup-alert + restore-alert claim sites (89's restore-alert site included) — green; `backup.alert.*` keys present ×5 locales |
| 17 | Builder form: 4 presets + Custom per-field dropdowns, never free-text cron (D-01); per-task tz combobox (D-03) (87-04) | ✓ VERIFIED | `src/pages/backup.js:256+` builder; preset serialization :329-341; UAT r4 added retention inputs to the same builder (form-staged) — cron entry still dropdown-only; tz combobox in `src/lib/timezones.js` |
| 18 | Per-task history card: newest-first, status/trigger/duration/size/checksum, expandable error (D-14) (87-04) | ✓ VERIFIED | `historyCard` in `src/pages/backup.js`; keyed labels; 90-02 extended the card with location badge + download/verify CTAs gated on server-derived fields (D-14 projection contract honored, :9177-9189 comment) |
| 19 | Every rendered payload field passes through esc() (Pitfall 7) (87-04) | ✓ VERIFIED | 64 esc() uses in `src/pages/backup.js` (was 29 — grew with 89/90 additions); `test/backup-history-client.test.mjs` green |
| 20 | Run now per task; enable/disable toggle works from page (87-04) | ✓ VERIFIED | `A.backupTaskToggle` `src/actions/actions.js:5195`, `A.backupTaskRunNow` :5229; wired to `src/core/api.js` methods (:439-469) |
| 21 | All new page + refusal strings exist in all 5 locales (i18n parity) (87-04) | ✓ VERIFIED | `backup.` key family present in en/fr/es/de/nl; locale-catalogue parity test green (89-06's restore.alert handoff test also green — additive catalogue) |

**Score:** 21/21 truths verified (0 present, behavior-unverified)

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| BKBCK-02 | 87-01, 87-04 | Multiple backup tasks: name/scope/destination, builder schedule with presets, GFS retention defaults 7/4/12/5, enable/disable, keyed 5-locale refusals | ✓ SATISFIED | Truths 1-4, 17, 20, 21 — CRUD API + builder form + locale parity, test-backed on the live tree |
| BKBCK-03 | 87-01, 87-02, 87-03 | Cron-scheduled tz-aware runs, at-most-once catch-up, no overlap, rotation only after verified success — newest verified never deleted | ✓ SATISFIED | Truths 3, 5-8, 11-15 — all semantics intact; 89-02's restore-lock refusal STRENGTHENS the no-overlap guarantee (now covers restore vs backup too) |
| BKBCK-04 | 87-02, 87-03, 87-04 | Every run recorded (status/trigger/duration/size/error/checksum), Run now per task, failure emails on transitions to Super Admins + Backup Operators | ✓ SATISFIED | Truths 9, 10, 16, 18-20 — writer seam, history endpoint + card, transition-only outbox alerts (90-02 added checksum display atop the same columns) |

No orphaned requirements. BKBCK-05 (S3) correctly lived in Phase 88; restore in 89 — both shipped and do not encroach on this phase's contract.

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `export/cron.js` | stdlib tz-aware cron evaluator | ✓ VERIFIED | 7983 bytes, unchanged since initial pass |
| `backup_tasks` DDL | cron string, tz, enabled, retention 7/4/12/5, last_notified_state, next_run_at | ✓ VERIFIED | `server.js:745-763` (+88's s3_enabled column) |
| `backup_runs` DDL | task_id nullable (manual), status check incl. skipped_overlap/deleted, checksum/duration/size/error | ✓ VERIFIED | `server.js:779-792` (CHECK widened by 88 with upload_failed — 87 statuses retained) |
| Scheduler sweep + boot sweeps | named helpers, unref'd interval, injectable clock | ✓ VERIFIED | `server.js:3698-3757`, boot `:12114/:12182-12185`, test-only pass route `:6061` |
| GET /api/backup/runs?taskId= | history read, newest first, cap 50 | ✓ VERIFIED | `server.js:9167-9192` (90-02 chrome additive) |
| Rotation pass | bucket math, ID-exclusion, floor, sidecar-first, audit | ✓ VERIFIED | `server.js:3946-4030` (90-03 projection additive) |
| Email transition hook + mailer | last_notified_state, outbox claim, buildBackupAlertMessage | ✓ VERIFIED | `server.js:3780-3803`, `mailer.js:749`, keys ×5 locales |
| Client task console | builder form, history card, actions, api methods | ✓ VERIFIED | `src/pages/backup.js`, `src/actions/actions.js`, `src/core/api.js` — all imported/used |
| 5 test files + outbox suite | Wave-0/behavior coverage | ✓ VERIFIED | 84/84 green in combined run (2026-11-23) |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| POST/PUT /api/backup/tasks | export/cron.js | validation → raw cron stored (D-04) | ✓ WIRED | `server.js:8714+` |
| backup_tasks/backup_runs DDL | db-adapter.mjs | mirror-sync schema pattern | ✓ WIRED | db-adapter.mjs unchanged in contract; 88's additive migration followed the same pattern |
| sweep → runExport → backup_runs row | run lifecycle | claim + writer seam | ✓ WIRED | `server.js:3698` → `setBackupRunWriter` :3556 |
| claimRun refusal | skipped_overlap row | synchronous claim as atomicity point | ✓ WIRED | `server.js:3741-3747` (+89's restore-lock skip :3725-3731) |
| boot sweep | interrupted status | update where status='running' | ✓ WIRED | `server.js:3757`, boot :12114 |
| verified succeeded run | rotation pass for that task_id | per-task call after finalize | ✓ WIRED | `server.js:3528` (rotation event hook) |
| run finalization | last_notified_state → email_outbox → delivery kick | transition-only claims | ✓ WIRED | `server.js:3780-3803`; D-04 boundary test pins exactly 4 claim sites |
| form builder | POST/PUT raw cron | preset+field serialization (D-04) | ✓ WIRED | `src/pages/backup.js:256-341` |
| history card | GET /api/backup/runs?taskId= | payload rendered verbatim with esc() | ✓ WIRED | `src/core/api.js:464`, `src/pages/backup.js` |

### Data-Flow Trace (Level 4)

All rendered history/badge values flow from real `backup_runs`/`backup_tasks` queries (route `server.js:9167+` selects live columns; location derived server-side from fs membership + `uploaded` — never a static return; rotation projection `gfsKeptPositions` consumes the same DB rows as deletion). No hollow props, no hardcoded payload in the client console.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Phase test files (cron, tasks API, scheduler, rotation, history client, outbox) | `node --test test/backup-{cron,tasks-api,scheduler,rotation,history-client}.test.mjs test/email-outbox.test.mjs` | 84/84 pass, 0 flakes (combined run, 16s) | ✓ PASS |
| Debt-marker scan on covered files | `grep -E "TBD\|FIXME\|XXX"` over server.js, export/*, client files, mailer.js | no matches | ✓ PASS |
| Full suite | NOT RUN — per scope: known pre-existing failures in deferred-items.md (webhook-events time-window flake etc.) are out of scope for a freshness pass | — | ? SKIP (deliberate) |

### Probe Execution

None declared — no `scripts/*/tests/probe-*.sh` for this phase and no probe requirement in PLAN/SUMMARY.

### Requirements Deviation Scan (phases 88-90 on shared surfaces)

| Commit area | Surface touched | Regressive? |
| --- | --- | --- |
| 88-02 S3 migration | backup_runs CHECK + columns | No — additive; all 87 statuses retained (:792) |
| 89-02 restore mutual exclusion | scheduler pass | No — skipped_overlap path added AFTER next_run_at advance; D-05 discipline preserved and extended |
| 89-04 restore outcome emails | email_outbox claim sites | No — D-04 boundary test updated to pin exactly the 4 legitimate sites; backup-alert site unchanged |
| 90-02 download/verify chrome | history endpoint + card | No — server-derived render-only fields; D-14 projection contract honored |
| 90-03 rotation projection | rotation module | No — kept-until badge reuses assignGfsBuckets; execution path untouched |
| UAT r4 (1866d6a0) retention editable | builder form + UPDATE route | No — defaults 7/4/12/5 unchanged in DDL and insert path |

### Advisory (New Scope, Unevidenced)

| # | Finding | Category | Why Advisory |
| --- | --- | --- | --- |
| 1 | Scheduler overlap test remains timing-sensitive (polling loop); carried advisory from the initial pass | other | 0 flakes this run; invariant structurally guaranteed by the synchronous claim. Watch item only. |

### Human Verification Required

None outstanding. The two live-clock items from the initial pass (live scheduled fire; end-to-end rotation lifecycle) were resolved by UAT 87 — `status: passed`, `gap_snapshot: "passed::scenarios=0"`.

### Gaps Summary

None. All 21 must-have truths re-verified against the LIVE tree at HEAD `b18462be`: every 87 contract survives the 88-90 extensions intact — artifacts exist, are substantive, and remain wired end-to-end (DDL → routes → sweep/rotation → writer seam → outbox → client rendering with esc()). The only semantic additions to 87 surfaces (restore-lock skipped_overlap, S3 statuses, download/verify chrome, kept-until projection) are additive and each strengthens or extends without altering the 87 contracts. Fresh digest computed over the current tree.

---

_Verified: 2026-11-23T19:22:35Z_
_Verifier: the agent (gsd-verifier)_
