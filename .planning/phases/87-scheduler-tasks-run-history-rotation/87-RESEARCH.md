# Phase 87: Scheduler, Tasks, Run History & Rotation - Research

**Researched:** 2026-11-21
**Domain:** In-process cron scheduler + persisted run history + GFS rotation on Node ≥24 stdlib (zero new npm dependencies)
**Confidence:** HIGH (all claims grounded in this repo's source, read this session)

## User Constraints (from CONTEXT.md — locked, D-01…D-17)

All 17 decisions in `87-CONTEXT.md` are locked. The planner must honor them verbatim; the load-bearing ones for plan shape:

- **D-01:** 4 presets (Daily, Weekly, Monthly) + Custom revealing per-field dropdowns; **never free-text cron**.
- **D-02/D-03:** Per-task IANA tz, defaulting to creator's account tz; reuse the Phase 34 settings tz combobox pattern.
- **D-04 (one-way):** the task row stores the **raw 5-field cron string** — single source of truth consumed by scheduler + catch-up; changing it later is a data migration.
- **D-05:** missed windows catch up **exactly once** (even if several were missed).
- **D-06:** overlap → skip firing + record `skipped_overlap` run row.
- **D-07:** disabled tasks never fire and never catch up; re-enable baseline = next scheduled time.
- **D-08:** single server-level unref'd `setInterval` sweep (session-sweep pattern), not per-task timers; stale `running` rows swept at boot.
- **D-09:** per-task daily/weekly/monthly/yearly retention columns, defaults 7/4/12/5.
- **D-10:** GFS bucket derives from run timestamp calendar position; manual Run now archives count as daily-tier candidates.
- **D-11:** rotation is per-task, over archives that task produced; manual archives untouchable in v1.
- **D-12:** expired archives: delete `.tar.gz` + `.sha256` sidecar, audited rotation event, history rows remain marked deleted.
- **D-13:** newest verified backup excluded from deletable set **by explicit ID**; refuse-to-empty floor.
- **D-14:** per-task history card on Backup page, newest first, capped ~50, esc() everywhere.
- **D-15/D-16:** failure email on failure-state transition only, gated by `last_notified_state` on the task row; recovery email on failed→recovered.
- **D-17:** recipients resolved at send time from `instance_roles` + Super Admins, per-user `users.locale`, via `email_outbox` claim-then-deliver.

**the agent's Discretion:** sweep interval, history cap value, rotation event payload field names, email copy, task-CRUD API route shapes.

**Deferred:** S3 destinations (88), restore (89), download tiering (90) — out of scope.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BKBCK-02 | Task CRUD with builder presets, per-task tz, GFS defaults 7/4/12/5, keyed 5-locale refusals | `backup_tasks` schema + `/api/backup/tasks` routes replacing the Phase 85 stub; refusal vocabulary pattern from Phase 85/86 guard chains |
| BKBCK-03 | Cron firing (5-field, tz-aware), at-most-once catch-up, no overlap, rotation after verified success, newest never deleted | `next_run_at` persistence + sweep design (Pattern 1–3); rotation sweep (Pattern 4); 86-D-10 single-run invariant |
| BKBCK-04 | Persisted run history, Run now per task, failure-transition emails | `backup_runs` table; history card extending `src/pages/backup.js`; outbox enqueue pattern (server.js:2333–2342) |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Task CRUD + validation | API/Backend (server.js) | — | Guard chain + keyed refusals are server-authoritative; client is render-only |
| Cron evaluation + sweep | API/Backend (server.js sweep) | — | Single-process model; in-process interval, no external scheduler |
| GFS rotation | API/Backend (sweep pass over DATA_DIR/backups) | filesystem | Directory sweep + audited deletes |
| Run history persistence | Database/Storage (SQLite/pg via db-adapter) | API | D-11 of Phase 86 hands in-memory run state to a persisted table |
| Task form + history card | Browser/Client (src/pages/backup.js) | API | Render-only doctrine: renders server payload verbatim, esc() everything |
| Failure/recovery email | API/Backend (email_outbox transport) | — | Existing claim-then-deliver; scheduler only inserts claim rows |

## Standard Stack

**Zero new npm dependencies** — verified: `grep -i cron package.json package-lock.json` returns nothing; Phase 86 explicitly mandates stdlib-only (86 D-33-11, export/backup.js header). Cron evaluation, tz math (Intl), sweeps and rotation are all hand-rolled on Node stdlib, exactly like `export/backup.js` and `tz.js`.

### Core (existing, in-repo)
| Asset | Location | Purpose |
|-------|----------|---------|
| Session-sweep pattern | server.js:10051–10058 | Unref'd `setInterval` + named async helper + `.catch(logWarn)` — the scheduler sweep template (D-08) [VERIFIED: server.js:10051-10058] |
| Reminder tick pattern | server.js:10079–10099 | 1-min tick with try/catch inside callback AND caught promise — boot catch-up precedent (D-27-2 "pass runs at boot") [VERIFIED: server.js:10079-10099] |
| `resolveTz()` funnel | tz.js (exported, test-importable) | Label/alias/canonicalization → IANA id, fallback Europe/Paris, never throws [VERIFIED: tz.js:29-47] |
| TZ combobox | src/lib/timezones.js (static list) + src/pages/settings.js wiring, test/settings-tz-combobox.test.mjs | Reusable picker for the task form (D-03); static list, no `supportedValuesOf` under src/ [VERIFIED: test/settings-tz-combobox.test.mjs:1-24] |
| email_outbox schema + transport | server.js:625–640 (DDL), 2333–2342 (claim insert), 3180+ (`runEmailDeliveryPass`) | Failure/recovery email delivery (D-17) [VERIFIED: server.js:625-640, 2333-2342] |
| Guard chain / refusal vocabulary | server.js:7796–7900 (Phase 86 runs) | sameOrigin → requireUser → throttle → capability → scope → concurrency → claim; every refusal keyed AND audited [VERIFIED: server.js:7796-7900] |
| CAP constants | roles.js:25-31 | `CAP.BACKUP_MANAGE = 'backup_manage'`, `RESTORE_USE = 'restore_use'` — verbatim [VERIFIED: roles.js:25-31] |
| `instance_roles` table | server.js:672–680 | Recipient resolution; role CHECK enum `('backup_operator','restore_operator')` [VERIFIED: server.js:672-680] |
| Super Admin identification | server.js:5004–5006, users.is_instance_admin col at :348 | `isInstanceAdmin(user)` = `user.is_instance_admin === 1` [VERIFIED: server.js:5004-5006, 348] |
| Run pipeline entry | export/backup.js `runExport(scope)` → `{ok, runId, filename, sha256}` or `{ok:false, error}`; `getRunState()`; sync `claimRun()` | Scheduled fires call the same entry point [VERIFIED: export/backup.js:130-144, 517-518, 632-645] |
| Archive naming | export/backup.js:502-510 `archiveName()` | `backup-<kind>-<id>-<UTC ts>.tar.gz` — task identity must extend this for D-11 (task-scoped filenames) [VERIFIED: export/backup.js:502-510] |
| `pgSchemaVariant` | db-adapter.mjs:434+ | New tables written once in SQLite DDL derive pg DDL automatically; epoch columns registered in `PG_EPOCH_COLUMNS` [VERIFIED: db-adapter.mjs:434-444] |
| Backup page | src/pages/backup.js (127 lines, render-only, esc() doctrine) | History card + task form extension [VERIFIED: src/pages/backup.js:1-26] |
| Locales | src/locales/{en,fr,es,de,nl}.json | 5-locale refusal vocabulary; i18n:scan prebuild enforces parity [VERIFIED: ls src/locales] |
| `tFor(locale, key)` | server.js:65 imports from src/core/i18n.js | Per-recipient localized email bodies [VERIFIED: server.js:65, 2138-2159] |
| Mailer gating | `MAILER.enabled` guards every enqueue/kick site (server.js:2515, 2529, 2635, 2673) | Scheduler must follow the same gate + post-commit `runEmailDeliveryPass()` kick [VERIFIED: server.js:2515-2673] |

**Installation:** none. Add nothing to `dependencies` — the Phase 86 zero-dep discipline and the dependencies test culture apply.

## Package Legitimacy Audit

Not applicable — **no external packages are installed in this phase** (zero-dependency mandate, same as Phase 86). Any plan task that introduces a cron library (node-cron, croner, later…) contradicts the codebase discipline and must be rejected.

## Architecture Patterns

### System Architecture Diagram

```
Operator (Backup page, render-only)
   │ POST/PUT/DELETE /api/backup/tasks[/:id]      POST /api/backup/runs {taskId} (Run now)
   ▼
Guard chain (sameOrigin → requireUser → throttle → BACKUP_MANAGE → scope/shape checks)
   │ keyed 5-locale refusals + audit_log rows on every refusal AND mutation
   ▼
backup_tasks table (name, scope json, cron, tz, enabled, retention d/w/m/y,
                     next_run_at, last_notified_state)
   │                                    ▲ recompute next_run_at after each fire
   ▼                                    │
Scheduler sweep (unref'd setInterval, ~60s, + boot pass) ──┘
   ├─ enabled && now >= next_run_at ?
   │     ├─ 86-D-10 single-run active? → insert run row status=skipped_overlap; recompute next_run_at
   │     ├─ else claim + runExport(task scope) → insert backup_runs row
   │     │     (status running→succeeded/failed, trigger scheduled|manual, duration, size, sha256, error)
   │     │     ├─ succeeded → GFS rotation pass for this task (bucket assign + delete expired + floor guard)
   │     │     └─ state transition → insert email_outbox claims (failure / recovery) per recipient
   │     └─ recompute next_run_at from now (catch-up-at-most-once, D-05)
   └─ boot pass: sweep stale status='running' rows → status='interrupted'; no catch-up for disabled tasks
   ▼
GET /api/backup/tasks (tasks + flags), GET /api/backup/runs?taskId= (history ≤50)
   ▼
email_outbox claim rows → runEmailDeliveryPass (30s tick + post-commit kick) → SMTP
```

### Pattern 1: Cron evaluation without dependencies (D-04/D-08)
**What:** Store the raw 5-field cron string; evaluate it by computing the *next* matching local wall-clock time ≥ a reference instant, in the task's IANA tz, via `Intl.DateTimeFormat('en-CA', { timeZone, ... })` `formatToParts` (same primitive tz.js already uses, tz.js:50-58 [VERIFIED: tz.js:50-58]).
**Algorithm (recommended):** iterate minute-by-minute forward from reference+1min up to a bounded horizon (~366 days for yearly fields; cap iterations, e.g. 527 040) matching the four int fields + weekday; return the first match. Cost is trivial at once-per-fire-per-task frequency (worst case one scan after each fire; a Daily cron scans ≤1440 iterations).
**Key rules to pin in a pure testable module** (e.g. `export/cron.js`, sibling of export/backup.js — root-level, never under src/ per the prohibition test discipline):
- Accept `*`, lists `a,b`, ranges `a-b`, steps `*/n` per field; day-of-month AND day-of-week OR-semantics when both are restricted (standard Vixie behavior: if both are restricted, match on either).
- 5 fields only; minutes 0–59, hours 0–23, dom 1–31, months 1–12, dow 0–7 (0 and 7 = Sunday).
- The builder (D-01) guarantees only well-formed strings enter the DB, but the evaluator still validates and a malformed stored cron fails the task (record a failed run row or disable + log) — never crash the sweep.
- Never cache zone offsets across ticks (tz.js Pitfall 3: DST is real) — build a fresh `Intl.DateTimeFormat` per evaluation, exactly like `localParts()` does.
- Ambiguous/nonexistent local times at DST transitions: pick the earlier valid instant (standard `Intl` behavior via UTC-math + parts round-trip); document, don't hand-roll offset math.

### Pattern 2: `next_run_at` persistence + at-most-once catch-up (D-04/D-05/D-07)
**What:** `backup_tasks.next_run_at` (epoch ms) persisted; **never re-parsed at tick** (roadmap schema decision).
- On task create/enable/edit (schedule or tz change): recompute `next_run_at` from `Date.now()` in the task tz. Disabled tasks store NULL (or leave stale — but re-enable MUST recompute, D-07 baseline).
- Sweep tick (every sweep): `select * from backup_tasks where enabled=1 and next_run_at is not null and next_run_at <= now` → for each: fire-or-skip (Pattern 3), then recompute `next_run_at` from **now** (not from the missed window). Several missed windows collapse into one firing — this IS the at-most-once catch-up (D-05), with zero backward cron search.
- Boot pass runs the same sweep once at startup (mirrors reminder D-27-2 boot pass, server.js:10079ff) — server was down, windows missed, one firing happens on the first tick.
- Enable/disable toggle never evaluates the cron for disabled rows (D-07): `where enabled=1`.

### Pattern 3: Overlap claim consistent with 86-D-10
**What:** The single-run invariant already exists: `runExport` → sync `claimRun()` before first await (export/backup.js:130-144, 517-518 [VERIFIED]). A scheduled fire that hits an active run must (a) not crash, (b) record `skipped_overlap` (D-06).
- In the sweep's fire path: check `getRunState()` active stage; if active → insert a `backup_runs` row with status `skipped_overlap` (or `skipped` + `skip_reason='overlap'` column — planner's call, discretion area), recompute `next_run_at`, continue. `runExport` itself already returns `{ok:false, code:'backupRunInProgress'}` — the sweep can also just call it and map that result; but checking `getRunState()` first avoids relying on the error shape. Either is fine; pick one and test it.
- Boot stale-row sweep: `update backup_runs set status='interrupted' (or equivalent) where status='running'` at boot, before the first sweep tick (roadmap: "stale running rows swept at boot"). Slots beside `sweepStaleBackupStaging()` at server.js:10037 [VERIFIED: server.js:10037, 86].
- Note the Phase 86 in-memory run state stays as-is; the runs table is the *persisted record* (86-D-11 explicitly hands persistence to Phase 87). Dual-write: the API/pipeline inserts/updates run rows at claim, completion, and failure — the cleanest seam is extending `runExport`/`completeRun`/failure path in export/backup.js to accept a persisted-row writer callback, or writing rows from the sweep wrapper around `runExport`. Wrapper-around-runExport is less invasive but misses the *manual* Run now path — so the writer hook must cover both triggers. Planner decides; both triggers (manual POST, scheduled sweep) must produce history rows (BKBCK-04).

### Pattern 4: GFS bucket assignment + rotation sweep (D-09..D-13)
**What:** Bucket derives from the run timestamp's calendar position in the **task's tz** (or UTC — pick one and document; UTC matches `archiveName()`'s UTC stamp, export/backup.js:502-510 [VERIFIED]; UTC is the recommended low-surprise choice).
- Assignment: daily = everything; weekly = first run of its ISO week; monthly = first of calendar month; yearly = first of calendar year. Simplest honest rule per D-10: a run belongs to the daily bucket always, and *additionally* is the weekly candidate if no earlier run that week exists, etc. Alternative: assign exactly one bucket (daily, else weekly, else monthly, else yearly). The "exactly one bucket" model makes deletion counting trivial (keep newest N per bucket); the planner should pick **exactly-one-bucket** (each archive labeled `bucket` at creation or lazily derived) — cleaner delete-set math, standard GFS practice.
- Task identity (D-11): rotation operates only over runs whose `task_id = this task`. Filenames must carry task identity for filesystem-level safety — extend `archiveName` (or pass scope-kind `task:<id>` through the existing scope plumbing) so `backup-<taskId>-….tar.gz` is greppable on disk. Filename scheme change must stay compatible with the frozen 86-D-14 scheme for manual runs (task runs are new names; manual names unchanged).
- Rotation pass (after a **verified** successful run — pipeline already fails the run on manifest mismatch, export/backup.js:15-18):
  1. List the task's runs (from backup_runs rows — filename + id + created_at), newest first.
  2. Compute deletable set = expired per retention counts, **minus** the newest verified run's explicit ID (D-13 — exclusion by ID, not by ordering assumption).
  3. Refuse-to-empty floor: if the deletable set would remove *all* remaining archives of the task, stop and leave the floor intact (D-13).
  4. Delete `.tar.gz` + `.sha256` sidecar (both exist atomically per 86 WR-05), mark run rows `deleted` (history rows remain, D-12), insert audited rotation event rows (`backup_rotation` audit action carrying which ids, which bucket, why — payload field names are discretion).
- Manual archives (no task_id): outside every rotation, never deleted (D-11).

### Pattern 5: Failure-state transition emails on the existing outbox (D-15/D-16/D-17)
**What:** The outbox claim is one INSERT with a UNIQUE `dedup_key` — the POL-02 pattern at server.js:2333-2342 [VERIFIED: server.js:2333-2342]. DDL verbatim:

```sql
-- [VERIFIED: server.js:625-640]
create table if not exists email_outbox (
  id               text primary key,
  workspace_id     text not null,
  dedup_key        text not null unique,
  kind             text not null,
  recipient        text not null,
  ctx              text not null default '',
  attempt          integer not null default 0,
  status           text not null default 'pending',
  next_attempt_at  integer,
  last_status_code integer,
  last_error       text not null default '',
  created_at       integer not null,
  delivered_at     integer
);
```
- Instance-scope emails (no workspace): `workspace_id` is `not null` — check what Phase 85/86 used for instance-scoped audit rows (`workspace_id = null` there); for the outbox a sentinel empty-string or a fixed instance id may be needed. **Planner must verify** how `runEmailDeliveryPass` consumes `ctx` and whether workspace_id participates in queries (server.js:3180-3200 reads `status in ('pending','failed')` + retention by created_at — workspace_id looks unused in delivery, so any sentinel works [VERIFIED: server.js:3193]).
- Transition logic lives on the task row: after each run finalizes, map outcome → state (`ok` | `failed`); compare with `last_notified_state`; email ONLY when state changes (`ok→failed` failure email D-15; `failed→ok` recovery email D-16), then update `last_notified_state`. Note: a *consecutive* failure does NOT re-email (state didn't transition) — that is the D-15 "no per-run spam" semantics. First-ever failure from NULL state = transition (email).
- Recipients (D-17): `select u.email, u.locale from instance_roles ir join users u on u.id = ir.user_id where ir.role = 'backup_operator'` + `select email, locale from users where is_instance_admin = 1` [VERIFIED: instance_roles DDL server.js:672-680; is_instance_admin server.js:348]. Resolved at send/enqueue time; honor `u.locale` through `tFor` (server.js:65 [VERIFIED]); NULL/malformed locale clamps exactly like the existing per-recipient locale funnel (server.js:2309 comment [VERIFIED: server.js:2309]).
- Gate on `MAILER.enabled`; kick `runEmailDeliveryPass().catch(...)` post-insert (verbatim server.js:2529 pattern [VERIFIED: server.js:2529]).
- New email `kind` value (e.g. `backup_alert`) + ctx shape follow the existing `ctx` JSON convention (type/to/payload/locale, server.js:2340 [VERIFIED: server.js:2340]). Email rendering happens in the delivery pass per-recipient — check how `kind` dispatches to body builders around server.js:2253/2629 and add the new kind there.

### Pattern 6: Task CRUD API (BKBCK-02)
- Replace the Phase 85 stub POST (server.js:7771-7783) and extend GET (7755-7774); add PUT/DELETE per-id. Route shapes are discretion; keep the frozen guard-chain order **verbatim** (sameOrigin → requireUser → throttle → capability gate → body checks), gate `BACKUP_MANAGE` for all mutations, keep `RESTORE_USE`-only holders reading (existing GET allows both roles).
- Scope validation reuses the Phase 86 `scopeNotFound` logic (kind allow-list + DB existence, server.js:7833-7858 [VERIFIED: server.js:7833-7858]).
- Cron/tz validation: cron string validated by the evaluator module (round-trip: evaluate once — a string the evaluator can't parse is refused `invalidSchedule`); tz through the `resolveTz()` funnel (tz.js) — hostile input falls back Europe/Paris deterministically, or refuse with a keyed error for the form path (D-02 default = creator's `users.locale`-adjacent tz… note: users table has `locale` (server.js:764) but tz lives on workspace members, not users — **the "creating operator's account timezone" needs a concrete source**: check `users` for a tz column; if absent, default to `resolveTz(S.prefs-style)` is client-side; server-side the honest default is the user's member tz if any, else Europe/Paris via `resolveTz(null)`. Planner must pin this; tagged as open question OQ-1).
- Retention columns validated as small non-negative ints, defaults 7/4/12/5 (D-09).
- Every refusal keyed (new codes added to all 5 locale files — en/fr/es/de/nl, src/locales/ [VERIFIED]) AND audited (`backup_task_refused:*`, `backup_task_created`, etc. — Phase 86 audit naming style, server.js:7803-7807 [VERIFIED]).

### Recommended Project Structure
```
export/cron.js          # pure 5-field cron evaluator + nextRunAt(cron, tz, from) — root-level like export/backup.js, zero deps
export/backup.js        # extended: task-scoped archive naming, persisted-run writer seam
server.js               # backup_tasks + backup_runs DDL (SQLITE_SCHEMA, pgSchemaVariant derives pg)
                        # /api/backup/tasks CRUD + /api/backup/runs history GET
                        # scheduler sweep + boot stale-row sweep + rotation pass + email transitions
src/pages/backup.js     # task form (builder presets + per-field dropdowns + tz combobox) + per-task history card
src/actions/actions.js  # task save/delete/toggle/run-now fill loops (refreshBackupTasks extension)
src/core/api.js         # backup task/run endpoints + error-code doc block
src/locales/*.json      # new refusal + page strings ×5
test/backup-cron.test.mjs, test/backup-tasks-api.test.mjs, test/backup-scheduler.test.mjs, test/backup-rotation.test.mjs, test/backup-history-client.test.mjs
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Timezone math | Custom offset tables / date lib | `Intl.DateTimeFormat` parts via the `tz.js` funnel pattern | DST is real; tz.js:37-44 comment warns "Never cached across ticks" [VERIFIED: tz.js:37-44] |
| Email delivery | Direct SMTP from the sweep | `email_outbox` claim rows + `runEmailDeliveryPass` | Retry/backoff/dead-letter already built (server.js:3105-3200) [VERIFIED] |
| Per-recipient localization | Ad-hoc locale switch | `tFor(locale, key)` + catalogue (server.js:65) | 5-locale parity enforced by i18n:scan |
| Audit trail | New log file | `audit_log` insert rows | Existing funnel + audit-log tests |
| Refusal i18n | Raw English strings | Keyed codes in 5 locale files | Established vocabulary (err.backupManageRequired etc., src/locales/en.json:1795-1796 [VERIFIED]) |
| Run claiming | New lock mechanism | `claimRun()` sync-claim (86-D-10) | Single-process invariant already proven |
| tz picker | New dropdown | Phase 34 combobox pattern + static TIMEZONES list | Already wired + tested |

**Key insight:** This phase is almost entirely *composition of existing in-repo machinery* — the only genuinely new algorithms are the cron evaluator and the GFS delete-set math.

## Common Pitfalls

### Pitfall 1: Catch-up that fires once per missed window (or never)
**What goes wrong:** Backward-searching cron history and firing per window (multi-email storm) or advancing `next_run_at` past missed windows silently.
**Why:** D-05 demands exactly-once regardless of how many windows were missed.
**How to avoid:** The `next_run_at <= now` sweep + "recompute from now" (Pattern 2) collapses missed windows structurally — no backward search exists.
**Warning signs:** Any code that iterates missed windows; any `while (next <= now) fire()` loop.

### Pitfall 2: Disabled-while-down tasks firing on re-enable from stale `next_run_at`
**What goes wrong:** Task disabled, server restarts, task re-enabled — stale `next_run_at` in the past triggers a surprise catch-up fire (violates D-07).
**How to avoid:** Re-enable path ALWAYS recomputes `next_run_at` from now before setting `enabled=1` — in the same statement/transaction as the enable.
**Warning signs:** Enable handler that only flips the boolean.

### Pitfall 3: Scheduler crash-killing the boot via unhandled rejection
**What goes wrong:** An async error inside `setInterval` callback kills the process (tz.js-era lesson, server.js:10047-10049 comment [VERIFIED: server.js:10047-10049]).
**How to avoid:** Named async helper + `.catch(logWarn(...))` verbatim (D-08); also a top-level try/catch per task so one malformed cron doesn't starve the other tasks' firing in the same tick.
**Warning signs:** `setInterval(() => asyncFn(), n)` without `.catch`.

### Pitfall 4: Rotation deleting the newest backup
**What goes wrong:** Off-by-one or ordering-by-timestamp-instead-of-ID removes the newest verified archive.
**How to avoid:** D-13's explicit-ID exclusion — resolve the newest verified run ID first, `and id <> ?` in the deletable set; plus the refuse-to-empty floor as a second guard. Both independent.
**Warning signs:** Delete-set derived purely from `order by created_at desc limit N keep` arithmetic without the ID exclusion.

### Pitfall 5: Non-atomic deletes leaving orphan sidecars (or vice versa)
**What goes wrong:** Deleting `.tar.gz` but failing on `.sha256` (or the reverse) leaves the directory dishonest.
**How to avoid:** Delete sidecar first then archive (worst case: archive without sidecar is detectable, sidecar without archive is a dangling promise); mark run row `deleted` only after both unlinks; wrap in best-effort try/catch like `rmStaging` (export/backup.js:512-514 [VERIFIED: export/backup.js:512-514]).

### Pitfall 6: Client-side cron preview drifting from server evaluation
**What goes wrong:** The builder shows "next run" preview computed in JS with different semantics than the server evaluator.
**How to avoid:** Either no live preview (simplest — the builder shows human-readable summary text derived from the selected preset+fields, not a computed timestamp), or the preview calls the server to evaluate. Do NOT duplicate cron math in the client.
**Warning signs:** A second cron parser under src/.

### Pitfall 7: History card rendering untrusted error strings
**What goes wrong:** `error` field carries exception text with markup.
**How to avoid:** esc() on every interpolated field — the page's stated doctrine (src/pages/backup.js:24-26 [VERIFIED: src/pages/backup.js:24-26]).

### Pitfall 8: Instance-scope email rows violating `workspace_id not null`
**What goes wrong:** INSERT with null workspace_id fails the outbox DDL constraint.
**How to avoid:** Use a sentinel (e.g. `''` or a reserved instance id) — verify what delivery queries actually filter on first (they filter status/next_attempt_at only, server.js:3193 [VERIFIED: server.js:3193]).

## Code Examples

### Sweep skeleton (D-08 pattern, verbatim discipline from server.js:10051-10058)
```js
// Source: server.js:10047-10058 pattern
const backupSchedulerTick = async () => {
  const due = await db.all(
    'select * from backup_tasks where enabled = 1 and next_run_at is not null and next_run_at <= ?',
    [now()],
  );
  for (const task of due) {
    try { await fireOrSkip(task); }          // claim/overlap/run-row/rotation/email
    catch (err) { logWarn(`backup task ${task.id}: ${err.message}`); }
  }
};
await backupSchedulerTick(); // boot catch-up pass (D-05)
setInterval(() => backupSchedulerTick().catch(err => logWarn(`backup scheduler: ${err.message}`)), 60_000).unref();
```

### Outbox claim insert (POL-02, adapted for instance-scope)
```js
// Source: server.js:2339-2342 (verbatim shape)
await db.run(
  'insert or ignore into email_outbox (id, workspace_id, dedup_key, kind, recipient, ctx, created_at) values (?,?,?,?,?,?,?)',
  [uid(), '', `backup-alert:${runId}:${recipientEmail}`, 'backup_alert', to,
   JSON.stringify({ type: 'backup_alert', to, taskName, scope, runId, error, locale: recipientLocale }),
   now()],
);
```

### Run-row state machine
```
run row inserted (status='running', trigger, task_id, started_at)
  ├─ runExport ok  → status='succeeded', finished_at, duration_ms, size_bytes, sha256, filename
  │                  → rotation pass → transitions email
  ├─ runExport fail→ status='failed', error → transitions email
  └─ overlap       → status='skipped_overlap' (no export started)
boot: status='running' → 'interrupted'
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| cron libs (node-cron/croner) | Stdlib Intl-based evaluation | Phase 86 zero-dep mandate | New code follows export/backup.js discipline |
| In-memory run state (86-D-11) | Persisted backup_runs rows | This phase | Run history survives restart; polling UI reads table not memory |
| Shared workspace-tz model | Per-user/per-task tz via resolveTz funnel | Phase 44 | Tasks carry own tz; funnel already handles canonicalization |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Task runs may write archives with a task-scoped filename variant while manual runs keep the frozen 86-D-14 scheme | Pattern 4 | Restore/download (89/90) must recognize both; low risk, pinned in tests |
| A2 | `email_outbox.workspace_id` accepts a sentinel `''` for instance-scope rows (delivery queries don't filter on it) | Pattern 5 / Pitfall 8 | Insert constraint violation at first failure email — verify at plan time |
| A3 | "Creator's account timezone" (D-02) has a server-side source; if `users` lacks a tz column, default resolves via `resolveTz(null)` → Europe/Paris | Pattern 6 / OQ-1 | Wrong default tz on tasks; cosmetic, editable per task |
| A4 | A 60 s sweep interval is sufficient (all field granularity is minutes; 1-min tick matches the reminder precedent) | Pattern 1/2 | Worst case a fire is up to 60 s late — acceptable, discretion area |
| A5 | Users' notification prefs (`user_notif_prefs`) are NOT consulted for backup alerts (D-17 says role-resolved recipients, no opt-out mentioned) | Pattern 5 | Over/under-emailing; confirm with user if prefs should gate |

## Open Questions (RESOLVED at plan time)

1. **Where does "the creating operator's account timezone" live?** — **RESOLVED** via Plan 87-01 task 1 `checkpoint:decision`: planner confirmed `users` carries no per-user tz server-side; default is `resolveTz(undefined)` (Europe/Paris fallback) and the operator picks per task via the combobox (D-02/D-03). Surfaced to the user at the checkpoint before DDL lands.
2. **Instance-scope sentinel for `email_outbox.workspace_id`** (A2) — **RESOLVED** in Plan 87-03 task 3: sentinel `''`, verified against the `runEmailDeliveryPass` claim insert (server.js:3193-3201 accepts any string; no FK enforcement on workspace_id).
3. **Should backup alerts respect `user_notif_prefs` opt-outs?** — **RESOLVED**: no prefs gating (role-defined recipients per D-17); recorded in Plan 87-03 task 3.

## Environment Availability

Phase is code/config-only on the existing runtime — no new external dependencies.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node ≥24 (Intl with IANA tz data) | cron/tz evaluation | ✓ | engines ">=24"; live `Intl.DateTimeFormat` tz parts verified this session | — |
| node:sqlite / pg via db-adapter | backup_tasks, backup_runs tables | ✓ | existing adapter + pgSchemaVariant | — |
| SMTP (MAILER) | failure/recovery email | optional | MAILER.enabled gate; outbox rows queue regardless | emails stay pending/dead-letter — same as every existing email feature |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node --test` (node:test), `--test-concurrency=2` full suite |
| Config file | none needed (package.json `test` script) |
| Quick run command | `node --test test/backup-cron.test.mjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BKBCK-02 | Task CRUD, builder serialization → 5-field cron, retention defaults 7/4/12/5, keyed refusals + audit | unit + API | `node --test test/backup-tasks-api.test.mjs` | ❌ Wave 0 |
| BKBCK-03 | cron evaluator (fields, steps, dom/dow OR, DST edge) | unit (pure module) | `node --test test/backup-cron.test.mjs` | ❌ Wave 0 |
| BKBCK-03 | next_run_at persistence, at-most-once catch-up, skip-when-disabled, skipped_overlap, boot stale-row sweep | API + withDb | `node --test test/backup-scheduler.test.mjs` | ❌ Wave 0 |
| BKBCK-03 | GFS bucket assign, ID exclusion of newest, refuse-to-empty floor, sidecar+archive delete, audited events | API + fs + withDb | `node --test test/backup-rotation.test.mjs` | ❌ Wave 0 |
| BKBCK-04 | history rows for manual+scheduled, history GET ≤50, Run now per task, failure-transition + recovery emails in outbox | API + outbox | covered in backup-scheduler/rotation suites + `node --test test/email-outbox.test.mjs` (existing) | partial ❌ Wave 0 |
| — | client render-only page: task form + history card wiring, esc() pins, 5-locale parity | source-assertion | `node --test test/backup-history-client.test.mjs` | ❌ Wave 0 |

Test precedents to copy: `test/backup-routes.test.mjs` (startServer-per-case harness, `makeBackupOp`, withDb inspection [VERIFIED: test/backup-routes.test.mjs:1-48]) and `test/settings-tz-combobox.test.mjs` (source-assertion style for client wiring [VERIFIED: test/settings-tz-combobox.test.mjs:1-28]).

### Sampling Rate
- **Per task commit:** the phase's touched test file(s), quick command.
- **Per wave merge:** `node --test test/backup-*.test.mjs test/email-outbox.test.mjs test/instance-roles-api.test.mjs`
- **Phase gate:** `npm test` green (plus `npm run lint`) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `export/cron.js` pure module (no DB import) so `test/backup-cron.test.mjs` runs without a server
- [ ] `test/backup-cron.test.mjs` — evaluator edge matrix (steps, ranges, dom/dow OR, leap day, DST ambiguous hour)
- [ ] `test/backup-tasks-api.test.mjs` + `test/backup-scheduler.test.mjs` + `test/backup-rotation.test.mjs` — harness copied from backup-routes.test.mjs
- [ ] Time-travelable clock for catch-up tests (existing reminder/digest tests show the `now:` injection pattern — `runEmailDeliveryPass({ now })` at server.js:3180 [VERIFIED]); the sweep should accept an injectable clock the same way

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V4 Access Control | yes | BACKUP_MANAGE capability gate on every mutation; RESTORE_USE holders read-only; verbatim guard-chain order (no reorder) |
| V5 Input Validation | yes | Cron evaluated by whitelist parser (never interpreted as shell/exec); scope kind allow-list + DB existence; retention ints bounded; tz through resolveTz |
| V7 Error/Logging | yes | audit_log on every refusal + rotation delete event; keyed refusals, no which-part oracle (T-86-06 discipline) |
| V2/V3 (Auth/Session) | inherited | requireUser + sameOrigin unchanged |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious cron string → ReDoS/path traversal | Tampering | Parser is char-class whitelist, bounded iteration; stored strings only enter the evaluator, never exec |
| Rotation deleting backups of other tasks (confused deputy) | Elevation | D-11 task_id scoping in every delete query; deletion by run-row id, filename only from DB rows |
| Non-holder enumerating task existence | Info disclosure | Same keyed 403/400 for valid+invalid (Phase 86 gate-before-probe order) |
| History card XSS via error strings | Tampering | esc() on all interpolations (page doctrine) |

## Sources

### Primary (HIGH confidence)
- This repo, read this session: server.js (outbox DDL 625-640, POL-02 2333-2342, delivery 3105-3200, sweeps 10037-10099, backup endpoints 7750-7900, instance_roles 672-680, isInstanceAdmin 5004-5006), export/backup.js (full header + claimRun/archiveName/rmStaging), tz.js (resolveTz), roles.js (CAP/ROLE_CAPS 25-40), db-adapter.mjs (pgSchemaVariant 434+), src/pages/backup.js, test/backup-routes.test.mjs, test/settings-tz-combobox.test.mjs, src/locales/*
- `.planning/phases/86-export-core-gr8r-backup-v1/86-CONTEXT.md` (D-08/D-10/D-11 frozen surfaces), `87-CONTEXT.md`, REQUIREMENTS.md BKBCK-02/03/04

### Secondary (MEDIUM confidence)
- None needed — no external libraries involved.

### Tertiary (LOW confidence)
- Standard Vixie-cron dom/dow OR semantics — `[ASSUMED]`, pinned by the Wave 0 cron test matrix.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — everything is in-repo, read this session
- Architecture: HIGH — all integration points verified at exact lines
- Pitfalls: HIGH — drawn from this codebase's own documented lessons + one [ASSUMED] cron-semantics item pinned by tests

**Research date:** 2026-11-21
**Valid until:** 2026-12-21 (stable, in-repo domain)

## RESEARCH COMPLETE
