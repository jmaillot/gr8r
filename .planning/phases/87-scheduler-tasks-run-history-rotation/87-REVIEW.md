---
phase: 87-scheduler-tasks-run-history-rotation
reviewed: 2026-11-22T00:00:00Z
depth: deep
files_reviewed: 14
files_reviewed_list:
  - server.js
  - mailer.js
  - export/backup.js
  - export/cron.js
  - src/pages/backup.js
  - src/actions/actions.js
  - src/core/api.js
  - src/lib/timezones.js
  - src/locales/en.json
  - src/locales/fr.json
  - src/locales/es.json
  - src/locales/de.json
  - src/locales/nl.json
  - src/pages/settings.js
findings:
  critical: 1
  warning: 6
  info: 6
  total: 13
status: issues_found
---

# Phase 87: Code Review Report

**Reviewed:** 2026-11-22
**Depth:** deep
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Deep review of the phase-87 diff (`7eb7ec44..HEAD`): scheduler, task CRUD, run history, GFS rotation, alert emails, cron evaluator and the client console. The core semantics are sound where the decisions demand it most: the cron evaluator passes live DST probes on both sides of the Paris transitions (fall-back yields two distinct fires for the two real 02:30 occurrences; spring-forward correctly skips the nonexistent local time to the next day, at the cost of a ~24 h drift on that one window); at-most-once catch-up holds because `next_run_at` is advanced before the fire and overlap collapses into `skipped_overlap` via the synchronous `claimRun`; rotation is task-scoped in every delete statement, excludes the newest verified run by explicit ID, and the refuse-to-empty floor works; all CRUD statements are parameterized with allow-listed scope kinds and regex-checked ids; every refusal is keyed and audited; client interpolation is esc()'d throughout with no client-side cron math.

One critical defect was confirmed empirically: the `backup.alert.*` email catalogue keys were handed off to the locale wave but never landed in any of the five `src/locales/*.json` files (grep count 0 in all five). The mailer's SC-5 fallback masks this in tests, so every production failure/recovery alert degrades to English literals regardless of recipient locale — the D-17 locale contract is silently unimplemented. The webhook test failure observed during this review's full-suite run (2153 pass / 1 fail, the documented `due.reminder` 08:00-window flake, matching the deferred-items entry) is consistent with the owner's note and is not re-reported here.

## Critical Issues

### CR-01: `backup.alert.*` email keys missing from all five locale catalogues (handoff never executed)

**File:** `src/locales/en.json` (and `fr.json`, `es.json`, `de.json`, `nl.json`)
**Issue:** `mailer.js` `buildBackupAlertMessage` renders the subject/body through `tFor(locale, 'backup.alert.failed.subject' | 'backup.alert.recovered.subject' | 'backup.alert.recovered.body')` (mailer.js, ~641-654). The 87-03 locale handoff (`87-03-LOCALE-HANDOFF.md`) defines the four keys and states they must be added by the locale wave — but `grep -c "backup.alert" src/locales/*.json` returns 0 for all five catalogues at HEAD. Every backup failure/recovery email therefore throws inside `tFor`, hits the SC-5 catch, and degrades to the hard-coded English literals for ALL recipients, regardless of their notification locale. D-17 ("honoring each user's notification locale") is not delivered; no test asserts the translated strings (the handoff doc explicitly notes the 87-03 suite does not assert them), so the suite stays green while the feature is degraded.

**Fix:** Add the four keys to all five catalogues exactly as specified in `87-03-LOCALE-HANDOFF.md`:

```json
"backup.alert.failed.subject": "Backup failed: {task}",
"backup.alert.failed.body": "The last backup run of \"{task}\" failed. Check the backup run history for details.",
"backup.alert.recovered.subject": "Backup recovered: {task}",
"backup.alert.recovered.body": "The last backup run of \"{task}\" succeeded again — the earlier failure has cleared."
```

plus the translated equivalents, and add a parity assertion (e.g. extend the i18n parity test) pinning `backup.alert.*` ×5 so the handoff can never silently evaporate again. Note `notif.email.body.footer` exists (used as the footer) — only the four alert keys are missing.

## Warnings

### WR-01: Cron evaluator fires minute-aligned, but the sweep picks up a due task up to a full minute late and re-fires nothing — however a crash between fire-start and completion leaves no catch-up (documented at-most-once, verify intent)

**File:** `server.js:3340-3395` (scheduler pass), `export/backup.js` (`runExport`)
**Issue:** At-most-once is enforced by advancing `next_run_at` before `runExport`. If the process crashes mid-export, the boot sweep marks the orphan `running` row `interrupted`, and the next window is computed from the (already advanced) `next_run_at` — so a crash silently *loses* that window entirely (no catch-up fires for it; D-05 says "missed windows collapse into one firing", which by construction excludes a window whose claim already advanced). This is a defensible reading of at-most-once and matches the header comment, but it is worth confirming the owner accepts that a crash mid-run means that scheduled window never runs again until the next cron match. Not a bug per the ratified D-05 — flagged as an intentional-semantics confirmation, with one concrete wrinkle: the boot catch-up pass (`await runBackupSchedulerPass()` in `main()`) runs *after* `sweepStaleBackupRuns()` marks orphan rows `interrupted`, so a stale `running` row for a task whose `next_run_at` is still in the past does NOT re-fire at boot (the window was already consumed). Confirm this matches D-05's "fire exactly once on boot/tick detection".
**Fix:** No code change required if the owner ratifies "a claimed-but-crashed window is lost". Otherwise, add a `catch-up` trigger row or recompute `next_run_at` backward on boot for tasks whose last run is `interrupted`. At minimum, document the crash-window-loss in the phase summary so it is a decision, not an accident.

### WR-02: Scheduled fire and a concurrent manual "Run now" race is resolved as `skipped_overlap`, but the scheduled task's window is silently consumed by the manual run

**File:** `server.js:3380-3394`
**Issue:** When a scheduled fire collides with an in-progress manual run, the sweep advances `next_run_at` and records a `skipped_overlap` row — the D-06 visibility requirement is met for the overlap itself. However the *scheduled* work is dropped entirely (the manual run is not task-scoped unless triggered via the task card's Run now, which is a different scope-owner path), and no failure email or state transition fires for the skipped scheduled run — the task's `last_notified_state` never learns a scheduled fire did not happen. An operator relying on a nightly backup will see a `skipped_overlap` row only if they open history.
**Fix:** Acceptable per D-06 if "overlap attempts are visible, never silent" is read as history-only. If stronger guarantees are wanted, consider emitting a failure-transition for skipped scheduled fires (or at minimum surfacing the count on the task card).

### WR-03: `runBackupRotationPass` marks rows `deleted` even when the archive file and sidecar never existed on disk

**File:** `server.js:3560-3585` (delete loop)
**Issue:** Both `fs.rmSync(..., { force: true })` calls swallow ENOENT silently (intended best-effort), but a row whose `.tar.gz` is missing (e.g. manually deleted from `DATA_DIR/backups`, or a filename that never matched the on-disk artifact) is still marked `status='deleted'` and counted in `report.deleted` and the audit action string. History then says "rotated" for an archive that was never rotated by this pass. This can mask a real data-loss symptom (backups dir wiped or mounted empty) as routine GFS behavior.
**Fix:** Before marking, verify the archive existed: `fs.existsSync(path.join(backupsDir, row.filename))`; count and report missing files separately (e.g. `report.missing += 1` and include them in the audit detail as `missing:<id>`), so a silently empty backups directory is observable rather than laundered into `deleted` rows.

### WR-04: `handleBackupTaskOutcome` recipient query loses per-user locale parity via `union` shape — duplicate emails with different locales collapse arbitrarily

**File:** `server.js:3437-3446`
**Issue:** The recipient query is `select distinct u.email, u.locale ... union select u.email, u.locale from users where is_instance_admin = 1`. `UNION` dedups on the full row `(email, locale)`. If a user is both a backup_operator and an instance admin, the two SELECTs produce the identical row, so this dedups correctly today. However if any future branch selects different columns or a normalized email variant, `UNION` (vs `UNION ALL` + dedup by email) silently produces two outbox rows for one address — and `insert or ignore` on `dedup_key backup-alert:<runId>:<email>` would still keep only the first insert, whose locale is nondeterministic under concurrent inserts. Low blast radius today; fragile shape.
**Fix:** Dedup explicitly by email (e.g. `group by lower(u.email)` picking `min(u.locale)`), or keep `union` but add a comment pinning the invariant "both branches must select identical column shapes so UNION dedups per recipient".

### WR-05: History endpoint's `taskId=manual` response omits `scope` and the per-task response omits nothing — but the client renders `filename` verbatim in a `title` attribute from an unsanitized DB string

**File:** `server.js:8607-8618`, `src/pages/backup.js:146-160` (`runRow`)
**Issue:** `runRow` renders `run.filename` through `esc()` in a text node — safe. However `run.sha256` is placed in a `title="${esc(run.sha256)}"` attribute; `esc()` must be attribute-safe (escaping `"`). Verify `esc()` in `src/core/utils.js` escapes double quotes — if it escapes only `<>&`, a filename/sha256 containing `"` could break out of the attribute into the tag body. The sha256 and filename values originate from the server's own `archiveName()` (bounded charset), so exploitability is nil, but `error` is free-form server-captured text (`String(err?.message)` slice 300) rendered in a `<div>` (text-node esc, fine) — the only attribute-interpolated free-form value is `sha256` in the title. Confirm `esc()` covers quotes; the codebase's Phase 86 usage on `title` attributes suggests it does, but this reviewer could not read `esc` in this pass.
**Fix:** Verify `esc()` escapes `"`. If it does, downgrade this finding to Info. If not, escape the title value with a quote-aware escaper or drop the title attribute.

### WR-06: Full suite shows 1 failing test at HEAD (`due.reminder` 08:00-window flake) — matching the documented pre-existing flake, but the `backup-rotation.test.mjs` read-visibility workaround leaves D-16 recovery asserted only through a log surface

**File:** `.planning/phases/.../deferred-items.md`, `test/backup-rotation.test.mjs`
**Issue:** Full suite re-run during this review: 2153 pass / 1 fail — the failure is exactly the documented webhook `due.reminder` flake (0 vs 1 claim row; the test computes "today" from the wall clock and fails when run between midnight and 08:00 Europe/Paris). That is consistent with the deferred-items note and out of scope. However, the D-16 recovery test no longer asserts the outbox rows (the "test-harness read-visibility quirk" workaround asserts via the delivery-kick log instead). This weakens the D-15/D-16 regression net: a future bug that enqueues rows with a wrong `dedup_key` or wrong recipient set but still logs the kick would pass the suite.
**Fix:** Revisit the deferred read-visibility root cause (likely a WAL checkpoint / connection-cache interaction between the test's fresh `DatabaseSync` and the server's adapter after `pragma wal_checkpoint(truncate)` in `export/backup.js`). Restore row-level assertions for D-15/D-16 once fixed; until then, add a log-content assertion that is narrower than "kick fired" (e.g. count of delivered `backup_alert` rows asserted through a server-side debug endpoint or the `email_outbox` via the server's own connection).

## Info

### IN-01: `runBackupSchedulerPass` return value mislabeled `fired`

**File:** `server.js:3394` (return), `server.js:5637` (internal route response)
**Issue:** The pass returns `due.length` (number of due tasks examined), but the internal test route responds `{ fired }` — a concurrent-pass race can make a due task produce a `skipped_overlap` instead of a fire, so `fired` overcounts actual fires.
**Fix:** Rename the field to `due`, or count actual fires.

### IN-02: Duplicate `resolveTz` logic in `export/cron.js` (deliberate zero-import duplication)

**File:** `export/cron.js:117-127`
**Issue:** The module duplicates tz.js's `resolveTz` inline to keep the "no imports beyond node builtins" gate. Byte-equivalence is claimed but only convention-guarded — a future divergence (e.g. tz.js changing its fallback label) would silently split scheduler vs UI timezone defaults.
**Fix:** Add a test asserting `resolveTz` behavioral parity between the two implementations (already partially implied by backup-cron tests; pin the fallback label `'Europe/Paris'` explicitly).

### IN-03: Client edit-mode schedule summary shows the DEFAULT field values, not the stored task's cron fields

**File:** `src/actions/actions.js:4931-4944` (`A.backupTaskEdit`), `src/pages/backup.js:229-244` (summary)
**Issue:** On edit, the form starts on `preset: 'custom'` with `BACKUP_TASK_FIELD_DEFAULTS` (`0 3 1 * 1`) rather than fields parsed from the stored cron, and `cronDirty: false` means the stored cron is kept on save — good. But the summary line then renders "Custom schedule: 0 3 1 * 1" for a task whose actual stored cron may be `30 4 * * *`, showing the operator a wrong schedule summary (the task card below still shows the correct `task.cron`, so it is a form-only cosmetic divergence).
**Fix:** On edit, either parse the stored cron into the five field dropdowns (values are always simple per-field tokens by construction of the builder), or render the summary from `task.cron` instead of `form.fields` while `cronDirty` is false.

### IN-04: Monthly preset with a wildcard day-of-month silently produces a daily schedule

**File:** `src/actions/actions.js:4914-4923` (`cronFromForm`), `src/pages/backup.js:268-274`
**Issue:** The dom dropdown includes `*` (star option). If an operator sets dom to `*` under Custom, then switches to the Monthly preset and saves, the serialized cron is `m h * * *` — which fires EVERY day, while the preset says Monthly (the summary text does show `{dom} = *`, so it is visible but easily misread).
**Fix:** In `cronFromForm`, coerce `dom` to `1` (and `dow` to `0`) when the preset is monthly/weekly and the field is `*`.

### IN-05: `last_notified_state` NULL→failed IS a transition; NULL→ok is not — asymmetry matches D-15/D-16 but deserves a pinned test

**File:** `server.js:3428-3436`
**Issue:** `transition` maps NULL→failed→email, NULL→ok→no email (correct per the comments), but this asymmetry is only behavioral; if a future refactor inverts the boolean it will silently spam recovery emails for every first-ever success. The test suite covers failure/recovery transitions — verify (this reviewer did not open the test assertions for the NULL→ok-stays-silent case specifically).
**Fix:** If not already pinned, add one assertion: first-ever successful run on a fresh task enqueues zero outbox rows.

### IN-06: `backupTaskRunNow` uses the task's stored scope with manual trigger — the resulting run is task-scoped in filename (`meta.taskId` absent) but the run row gets `task_id NULL`

**File:** `src/actions/actions.js:5017-5032`, `export/backup.js:26-33` (`runMeta`), `server.js` POST `/api/backup/runs`
**Issue:** Per-task "Run now" calls the Phase 86 manual endpoint, which passes no `meta` — so `runMeta.taskId` is null, the archive is named `backup-<scope>-<ts>.tar.gz` (frozen 86-D-14 name) and the run row lands `task_id NULL`, i.e. OUTSIDE every task's rotation per D-11. That is exactly the ratified decision (manual runs outside rotation), and the filename is greppable — but the per-task history card will show this manual fire under the task only via `taskId=manual`... actually it will NOT: the run row has `task_id NULL`, so the task's history card (which queries `task_id = <id>`) never shows it. An operator pressing "Run now" on a task card sees the progress card live, but the run is absent from that task's own history — it only appears under the manual archive listing, which the client never fetches (`backupRuns` is only called with task ids in this phase).
**Fix:** Confirm intent: if per-task Run now should be visible in the task's history, pass the taskId through the POST body (server-side opt-in, still trigger='manual' per D-10 "manual Run now archives count as daily-tier candidates" — note D-10 mentions task-scoped manual rows participate in rotation, which contradicts D-11's "manual archives are outside every task's rotation"; the implementation sided with D-11 for scope-less manual runs but D-10's language suggests per-task Run now SHOULD be task-scoped). If intentional, the per-task history card should at least link or note that manual fires live in the manual listing.

---

_Reviewed: 2026-11-22_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_

## REVIEW COMPLETE
