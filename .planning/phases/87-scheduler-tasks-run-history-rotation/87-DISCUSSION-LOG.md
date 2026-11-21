# Phase 87: Scheduler, Tasks, Run History & Rotation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-21
**Phase:** 87-Scheduler, Tasks, Run History & Rotation
**Areas discussed:** Schedule builder UX, Catch-up & overlap, GFS rotation mechanics, History & failure email UX

---

## Schedule builder UX

| Option | Description | Selected |
|--------|-------------|----------|
| 4 presets + custom | Daily, Weekly, Monthly + Custom (per-field dropdowns: minute/hour/day-of-month/month/day-of-week) | ✓ |
| 3 presets only | Daily/Weekly/Monthly, no custom path | |
| 5 presets + custom | Adds hourly-interval (every N hours) | |

| Option | Description | Selected |
|--------|-------------|----------|
| Per-task tz | Each task stores its own IANA timezone, defaulting to operator's account tz | ✓ |
| Single instance tz | One instance-level setting, all tasks share | |
| Server tz only | No picker, server-local time | |

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse tz combobox | Phase 34 settings-tz combobox pattern, already tested | ✓ |
| Plain validated input | Text input validated against IANA list | |

| Option | Description | Selected |
|--------|-------------|----------|
| Store cron, eval it | Task row holds the raw 5-field cron; scheduler evaluates it directly — one source of truth | ✓ |
| Store preset JSON | Structured JSON expanded to cron at eval time; two representations can drift | |

**Notes:** Roadmap mandates "never free-text cron" and "stored 5-field cron schedule" — both honored by the selections.

---

## Catch-up & overlap

| Option | Description | Selected |
|--------|-------------|----------|
| Fire once on catch-up | Missed window while down fires exactly once on boot/tick, even if several windows missed | ✓ |
| Skip missed windows | Never catch up; wait for next scheduled time | |
| Catch-up with tolerance | Catch up only if miss is recent (configurable knob) | |

| Option | Description | Selected |
|--------|-------------|----------|
| Skip + record | Overlap attempt records a skipped_overlap history row, new run not started | ✓ |
| Queue the run | Start when previous finishes; can pile up | |
| Skip silently for scheduled | Only manual triggers refuse-and-record | |

| Option | Description | Selected |
|--------|-------------|----------|
| Disabled = no catch-up | Disabled tasks never fire/catch up; re-enable sets next scheduled time as baseline | ✓ |
| Catch up on re-enable | Re-enable fires one catch-up for windows missed while disabled | |

| Option | Description | Selected |
|--------|-------------|----------|
| Single sweep tick | One unref'd setInterval sweep evaluating all enabled crons (session-sweep pattern) | ✓ |
| Per-task timers | setTimeout per task armed for next fire time | |

**Notes:** Roadmap wording "catches up at most once after a restart" and "overlap attempts visible as skipped_overlap in history" drove both selections.

---

## GFS rotation mechanics

| Option | Description | Selected |
|--------|-------------|----------|
| Per-task retention | Editable daily/weekly/monthly/yearly columns on the task, defaults 7/4/12/5 | ✓ |
| Global retention | One instance-level setting shared by all tasks | |

| Option | Description | Selected |
|--------|-------------|----------|
| By run timestamp | Bucket from the run's calendar position; manual runs are daily-tier candidates | ✓ |
| By age buckets | Bucket derived from archive age at rotation time; copies drift between buckets | |

| Option | Description | Selected |
|--------|-------------|----------|
| Per-task, manual untouchable | Rotation sweeps only the archives a task produced; manual Run now archives never auto-deleted in v1 | ✓ |
| Global per-scope | One pass over DATA_DIR/backups grouped per scope; manual runs ARE deletable | |

| Option | Description | Selected |
|--------|-------------|----------|
| Delete + audit | Delete .tar.gz + .sha256 sidecar, audited rotation event (ids, bucket, reason); history rows remain marked deleted | ✓ |
| Move to trash dir | Staging dir DATA_DIR/backups/.trash/ for manual cleanup; doubles disk usage | |

**Notes:** Newest-verified exclusion (explicit ID) and refuse-to-empty floor are roadmap SC mandates, recorded as D-13 in CONTEXT.md.

---

## History & failure email UX

| Option | Description | Selected |
|--------|-------------|----------|
| Per-task history card | Per-task card on Backup page: newest-first, capped ~50, status/trigger/duration/size/checksum/error, expandable detail | ✓ |
| Global history table | Flat table of all runs with filters | |
| Both | Global table + task filter | |

| Option | Description | Selected |
|--------|-------------|----------|
| One email per transition | Aggregated email per failure-state transition (last_notified_state gate): task, scope, run id, error, time | ✓ |
| Per-failed-run, deduped | Email per failed run gated by last_notified_state | |

| Option | Description | Selected |
|--------|-------------|----------|
| Send recovery email | failed→recovered transition fires one "back to healthy" email | ✓ |
| Failure-only | Silence on recovery | |

| Option | Description | Selected |
|--------|-------------|----------|
| Live role lookup | Recipients resolved at send time from instance_roles + Super Admins, per-user notification locale, via email_outbox | ✓ |
| Frozen list on task | Snapshot recipients at save time; stale on role changes | |

---

## the agent's Discretion

- Sweep interval value, history cap number, rotation-event payload field names, email copy wording, task CRUD route shapes.

## Deferred Ideas

None — discussion stayed within phase scope.
