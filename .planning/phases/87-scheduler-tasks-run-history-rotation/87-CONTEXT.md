# Phase 87: Scheduler, Tasks, Run History & Rotation - Context

**Gathered:** 2026-11-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Backup tasks run themselves: a Backup Operator configures multiple tasks (name, scope, local destination, builder-based schedule with presets — never free-text cron, per-task GFS retention defaulting 7/4/12/5, enable/disable), tasks fire on their stored 5-field cron in their own timezone with at-most-once catch-up after restart and no overlapping runs of the same task (overlap attempts recorded as skipped_overlap), stale `running` rows are swept at boot, GFS rotation applies per task only after a verified successful run (newest verified backup never in the deletable set, audited deletes, refuse-to-empty floor), every run (manual or scheduled) is recorded in a persisted history the Backup Operator can consult with a Run now action per task, and failure emails fire only on failure-state transitions (`last_notified_state` on the task row) to Super Admins + Backup Operators via email_outbox. Requirements BKBCK-02, BKBCK-03, BKBCK-04. Not in this phase: S3 destinations (88), restore (89), download tiering (90).

</domain>

<decisions>
## Implementation Decisions

### Schedule builder
- **D-01:** The builder offers 4 presets — Daily, Weekly, Monthly — plus Custom, which reveals per-field dropdown pickers (minute / hour / day-of-month / month / day-of-week). Never free-text cron input. — **Reversibility:** reversible.
- **D-02:** Each task carries its own IANA timezone, defaulting to the creating operator's account timezone; tasks can fire in different zones. — **Reversibility:** reversible.
- **D-03:** The task form reuses the existing settings timezone combobox component (Phase 34 settings-tz pattern) — consistent UX, already tested.
- **D-04:** The task row stores the raw 5-field cron string; the builder serializes preset+fields into it, and the scheduler evaluates the cron directly — one source of truth, matching the roadmap's "stored 5-field cron schedule". — **Reversibility:** one-way — the stored cron string on backup_tasks rows is the format the scheduler, catch-up logic and any future export of task config consume; changing representation later needs a data migration.

### Catch-up & overlap
- **D-05:** Catch-up: if a scheduled window was missed while the server was down, fire exactly once on boot/tick detection — even if several windows were missed (roadmap "catches up at most once after a restart").
- **D-06:** Overlap: if the previous run of the same task is still active, skip firing and record a skipped_overlap row in run history — overlap attempts are visible, never silent.
- **D-07:** Disabled tasks never fire and never catch up; on re-enable the next scheduled time is the baseline (windows missed while disabled do not trigger catch-up).
- **D-08:** The scheduler is a single server-level unref'd setInterval sweep evaluating all enabled tasks' crons — the same pattern as the existing session sweep — not per-task timers. Stale `running` rows are swept at boot (roadmap).

### GFS rotation
- **D-09:** GFS retention is per task: editable daily/weekly/monthly/yearly columns defaulting to 7/4/12/5.
- **D-10:** A backup's GFS bucket derives from its run timestamp's calendar position (daily/weekly/monthly/yearly); manual Run now archives count as daily-tier candidates.
- **D-11:** Rotation operates per task over the archives that task produced (task identity encoded in run rows/filename). Manual Run now archives are outside every task's rotation and never auto-deleted in v1.
- **D-12:** Expired archives: delete the .tar.gz + .sha256 sidecar and record an audited rotation event (which ids, which bucket, why) through the audit funnel; history rows for deleted runs remain, marked deleted.
- **D-13:** The newest verified backup is excluded from the deletable set by explicit ID; rotation refuses to empty the destination entirely (refuse-to-empty floor) — if a pass would delete everything remaining, it stops and leaves the floor intact. — **Reversibility:** reversible (behavioral guard, cheap to relax later).

### History & failure email
- **D-14:** Run history is a per-task card on the Backup page: recent runs (newest first, capped ~50) with status, trigger, duration, size, checksum, error; expandable error detail. Extends the existing Backup page built in Phase 86.
- **D-15:** Failure email: one email per failure-state transition (gated by `last_notified_state` on the task row), containing task name, scope, run id, error, time. No per-run success spam.
- **D-16:** A recovery email fires when a previously-failed task succeeds again (failed→recovered transition tracked in last_notified_state) — operators closing an outage streak get positive confirmation.
- **D-17:** Recipients are resolved at send time from instance_roles (Backup Operators) + Super Admins, honoring each user's notification locale; delivery via the existing email_outbox claim-then-deliver transport. Role grants/revokes automatically re-scope recipients.

### the agent's Discretion
- Exact sweep interval, history cap value, rotation event payload field names, email copy wording, and the API route shapes for task CRUD — standard patterns from the codebase apply.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Frozen surfaces from prior phases
- `.planning/phases/86-export-core-gr8r-backup-v1/86-CONTEXT.md` — frozen archive format, manifest entry 0, D-08 backups dir, D-10 single-run invariant, D-14 filename scheme, D-16/D-17 trigger API + tasks stub, D-21/D-22 throttle/refusal vocabulary.
- `.planning/phases/85-roles-foundation/85-CONTEXT.md` — Backup Operator role, guard chain order, audit funnel, named capability constants.

### Planning artifacts
- `.planning/ROADMAP.md` — Phase 87 goal + success criteria (SC1–SC5, including "newest verified backup never in deletable set").
- `.planning/REQUIREMENTS.md` — BKBCK-02/03/04 full requirement text.

No external specs — requirements fully captured in decisions above and the referenced planning artifacts.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Settings timezone combobox (Phase 34, test/settings-tz-combobox.test.mjs) — the task form's tz picker (D-03).
- email_outbox table + claim-then-deliver transport (server.js ~625, ~2333) — failure/recovery email delivery (D-17); the POL-02 dedup/claim pattern is the template.
- Session sweep setInterval pattern (server.js ~10049-10057, unref'd, .catch-logged) — the scheduler sweep template (D-08).
- `/api/backup/runs` surface + guard chain from Phase 86 — Run now per task and history endpoints build on it; `POST /api/backup/tasks` stub currently refuses backupNotConfigured and gets real meaning here.
- Phase 86 run pipeline (`export/backup.js`) — scheduled fires call the same entry point with `trigger: 'scheduled'`.

### Established Patterns
- Keyed 5-locale refusal vocabulary + audit funnel for every mutation — task CRUD and rotation deletes follow it (D-12).
- Boot-time sweeps (SIGTERM handler, boot sweep of backup staging from Phase 86) — stale `running` row sweep slots in there.
- render-only client pages with esc() — Backup page extension (history card) follows Phase 86's page pattern.

### Integration Points
- `DATA_DIR/backups/` — the single directory tasks write to and rotation sweeps (86-D-08).
- Run rows replace 86-D-11's in-memory run state as the persisted record.
- `.sha256` sidecar published atomically with the archive (86 WR-05 fix) — rotation deletes both (D-12).

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 87-Scheduler, Tasks, Run History & Rotation*
*Context gathered: 2026-11-21*
