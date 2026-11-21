# Architecture Patterns — v3.3 Instance Operations (Backup, Restore & Roles)

**Domain:** Scheduled backup + selective restore + instance-role governance, added to a single-process zero-dependency Node.js monolith (server.js ~9,800 lines + fenced modules, node:http, SQLite/Postgres dual dialect, Vite ES-module frontend).
**Researched:** 2026-11-21 (codebase-verified, HIGH confidence — every claim below is read from HEAD source)
**Mode:** Architecture integration research (subsequent milestone)

## Executive Summary

gr8r has a mature, *proven* integration recipe for exactly this kind of milestone, established in v3.0/v3.2 (domains.js, groups.js): a **pure fenced module** (no process.env, DB injected, inert until wired) + a **dual schema mirror** (server.js SCHEMA + db-adapter.mjs SQLITE_SCHEMA verbatim, pinned by a unit test) + **house-rule setInterval ticks** (try/catch inside the callback AND a promise .catch, .unref()) + **exactly-once claim ledgers** (INSERT OR IGNORE inside the mutation transaction, reminders_sent pattern) + **keyed 5-locale refusals** landed same-commit. The backup/restore milestone should reuse every one of these five patterns — nothing here needs a new architectural idea.

The genuinely new engineering (and the risk center) is the **logical export archive** — rows + DATA_DIR files in one deterministic, checksummed container — and the **restore transaction boundary**. Both live entirely inside a new `backup.js` fence with pure functions, so the hard parts are unit-testable without booting the server, exactly like `resolveGroupsClaim()` is today.

**Critical pitfall:** scheduled backup runs must never overlap or double-fire after restart. The house answer already exists: a **claim ledger + in-process run mutex**, not a cron library (zero deps is a standing constraint). Missed-run catch-up must be *at most once* per missed window (backfill one run, not N), mirroring the reminder-pass catch-up design (server.js:9713 comment).

---

## 1. Module Fences — NEW `backup.js` (and what stays in server.js)

The house fence pattern (groups.js:1–20, domains.js): pure server-side module, **NOT under src/** so Vite never bundles it, **no process.env reads**, **DB access injected by the caller**, inert-by-design until wired, contract fixed NOW so wiring phases pass inputs without migration. groups.js is 154 lines and carries the canonicalization, the refusal funnel, and the resolver — routes and DB live in server.js.

### NEW: `backup.js` (root, sibling of groups.js/domains.js/mailer.js) — pure core

Belongs here (all pure, injectable, unit-testable with zero boot):

- **Cron-adjacent scheduling math**: parse/validate the cron-ish expression (5-field minute/hour/dom/mon/dow, strict tokens, keyed refusal like `roleTokenRefusal`), and `nextRunAfter(cronExpr, nowMs, tz)` — pure, table-driven, no timers. Also GFS rotation math: `rotatePolicyRefusal()` + `applyGfsRotation(manifests, policy, nowMs)` → list of (runId, deleteReason) — pure over a list of run records.
- **Archive format core**: deterministic manifest shape (`{ format: 1, app_version, created_at, scope: {kind, id, label}, db_dialect, tables: {name: count}, files: [{id, name, size, sha256}], archive_sha256 }`), the row→JSONL serializer, and the manifest→restore-plan resolver (`planRestore(manifest, scope, target)` → { tables, files, conflicts } — pure, the whole selective-restore decision tree).
- **Import-as-new naming**: pure `restoredNameFor(original, existingNames)` → `-restored` suffix collision handling (the D-82-style canonicalize-and-collapse trick applies).
- **Refusal funnel**: `cronRefusal()`, `scopeRefusal()`, `destinationRefusal()`, `roleTokenRefusal()` extension — each returns `{code, message}|null` for the `fail(res, 400, code, message)` → 5-locale keyed refusal path. **Every new key lands in en/fr/nl/de/es in the same commit** (standing gate).

Does NOT belong here: any fs/network write, any db call, any env read. The S3 hand-rolled client gets its own seam (§5).

### Routes & scheduler stay in server.js (MODIFIED)

Following groups.js wiring: server.js adds the schema, the route family under an `/api/governance/backup*` fence (same `isInstanceAdmin`/role gate shape as group-mapping routes at server.js:7476–7533), and one new boot interval. The scheduler *loop* is ~20 lines; all logic is delegated to injected backup.js functions. This mirrors how the reminder scheduler (runReminderPass, server.js:2325) lives in server.js while tz math lives in tz.js.

### NEW: `s3-dest.js` (optional separate fence) — see §5. Keep it out of backup.js so the destination seam stays swappable and S3 signing math is testable without fs.

---

## 2. Scheduler Integration — the setInterval house rules + a claim ledger

Existing architecture (verified):

- Named async sweeps at boot, then `setInterval(() => sweep().catch(err => logWarn(...)), ms).unref()` — try/catch inside the callback AND promise .catch are **mandatory** (uncaught rejection in a setInterval callback kills the process; server.js:9686–9724). Sessions/challenges: hourly. Reminders: 1-minute. Webhooks + email outbox: piggyback a 30-second tick (server.js:9732–9739).
- Exactly-once: `reminders_sent` claim ledger — `INSERT OR IGNORE` inside the **same transaction** as the effect (server.js:481–490, 2450). Restart catch-up: the boot pass runs once, then the tick takes over; window predicates make pre-window ticks pure reads (REM-01/SC-5).

**Backup scheduler design (NEW, in server.js):**

- One 60-second `runBackupSchedulerPass()` interval, same house rules. Per pass:
  1. Load enabled `backup_tasks` where `next_run_at <= now` (the task row stores next_run_at — computed at save and after each run by backup.js `nextRunAfter`; do NOT re-parse cron every tick).
  2. **Single-process overlap lock** (in-process, like the delTeam shared mutex — UNDO-01/02 precedent): a module-level `Map<taskId, Promise>` guard; if a run for the task is in flight, skip the tick. Parallel-run prevention is in-process only — the app is single-process by design (one Docker image), so a DB lease is over-engineering; document that running two app instances against one DB is already unsupported everywhere else.
  3. **Claim inside a transaction**: `insert or ignore into backup_run_claims (task_id, scheduled_for) ...` — one row per (task, scheduled_for) tick, the reminders_sent pattern. Crash mid-run ⇒ next boot's catch-up pass sees the claimed tick without a completed `backup_runs` row.
  4. **Missed-run catch-up policy: at-most-once.** After downtime, the boot pass runs each due task **once** at the newest missed window (never backfills N windows — N full exports would stampede disk/S3). The catch-up decision is: "due and no successful run since `next_run_at`" ⇒ run now, advance next_run_at from *now* (not from the missed window) so drift doesn't cascade.
- **Run now** endpoint (`POST /api/governance/backup/tasks/:id/run`) creates a manual run row with the same claim shape but `manual=1`, bypassing the scheduler gate but **sharing the overlap mutex** so Run-now never collides with a scheduled run.
- Run state machine on `backup_runs`: `running → success | failed`, with `started_at/finished_at/bytes/sha256/error_code` — the audit-funnel pattern applies to failed runs (failure email via mailer.js, keyed locale, and an audit_log row for manual runs).

---

## 3. DB Schema — dual mirror, group_mappings as the template

**How group_mappings did it** (verified): table DDL in server.js SCHEMA (line 645) **verbatim-copied** into db-adapter.mjs SQLITE_SCHEMA (line 387) with a "mirrors server.js SCHEMA verbatim" comment; `PG_EPOCH_COLUMNS` (db-adapter.mjs:408) gets any new epoch-ms columns; and a **contract unit test pins both mirrors** (test/groups-core.test.mjs:79 — regex-matches both files for the DDL and index). Copy this test for the new tables. Note the deliberate FK choices: group_mappings' workspace ref has **no on-delete-cascade** so dead rows warn (D-82-6); audit_log is FK-free entirely (D-A2). Backup tables should follow the same honesty: no cascade from workspaces/projects (a deleted scoped object leaves the task row for the operator to clean up, with a dead-scope warning card like group_mappings').

### NEW tables (add to BOTH mirrors + the pin test)

```sql
-- instance_roles: extensible role catalogue (governance)
create table if not exists instance_roles (
  id         text primary key,
  key        text not null unique,          -- 'super_admin' | 'backup_operator' | 'restore_operator' | future
  label      text not null,
  is_system  integer not null default 0,    -- super_admin row is boot-seeded, undeletable
  created_at integer not null,
  updated_at integer not null
);
-- membership join: Super Admins auto-seeded (stampInstanceAdmin precedent)
create table if not exists instance_role_members (
  role_id  text not null references instance_roles(id) on delete cascade,
  user_id  text not null references users(id) on delete cascade,
  granted_by text references users(id) on delete set null,
  granted_at integer not null,
  primary key (role_id, user_id)
);

-- backup tasks
create table if not exists backup_tasks (
  id            text primary key,
  name          text not null,
  scope_kind    text not null check (scope_kind in ('instance','workspace','project')),
  scope_id      text,                        -- null for instance scope
  cron          text not null,               -- validated by backup.js, never re-parsed from client at run time
  tz            text not null default 'UTC',
  gfs_policy    text not null,               -- JSON {daily:7, weekly:5, monthly:12} — validated at save
  destination   text not null default 'local',
  destination_cfg text,                      -- JSON (bucket/prefix for S3; NEVER secrets — S3 creds stay env)
  enabled       integer not null default 1,
  created_by    text references users(id) on delete set null,
  created_at    integer not null,
  updated_at    integer not null,
  next_run_at   integer                      -- epoch ms, recomputed after each run
);

-- run history
create table if not exists backup_runs (
  id           text primary key,
  task_id      text not null,               -- no cascade: history survives task deletion (operator cleanup + dead-scope warn)
  trigger      text not null check (trigger in ('schedule','manual','catchup')),
  status       text not null check (status in ('running','success','failed')),
  scheduled_for integer not null,
  started_at   integer,
  finished_at  integer,
  bytes        integer,
  sha256       text,
  manifest     text,                        -- the JSON manifest snapshot (provenance, like audit name snapshots)
  error_code   text,
  created_at   integer not null
);
create index if not exists backup_runs_task on backup_runs(task_id, created_at desc);

-- exactly-once scheduler claim (reminders_sent pattern)
create table if not exists backup_run_claims (
  dedup_key   text primary key,             -- `${task_id}:${scheduled_for}`
  task_id     text not null,
  created_at  integer not null
);
```

All `created_at/updated_at/next_run_at/started_at/finished_at/scheduled_for` go into `PG_EPOCH_COLUMNS`. Booleans stay `integer` (server compares `= 1` on pg verbatim — db-adapter.mjs:404 comment).

---

## 4. Restore Data-Flow — reuse creation paths, never hand-rolled reinsertion

**Verified architecture relevant here:** the workspace document is a single JSON `doc` per workspace row with `revision` optimistic concurrency (409 on mismatch); `mergeClientDoc`/`normalizeDoc` is the write funnel; project creation, membership and team links all flow through validated server routes; `migrateTenancy` and the boot sweeps already demonstrate "read old, transform, write via the normal funnel, backup via `vacuum into` first" (server.js:3751–3860 — the pre-mutation `vacuum into` snapshot pattern is proven twice in the codebase).

### Import-as-new (default) — REUSE, don't reinsert

1. **Workspaces** (workspace-scope restore): create via the *existing* workspace-creation code path (the same insert the POST /api/workspaces route performs, called server-side, bypassing only the permission gate — the row is the doc; then set `slug = original + '-restored'` via `restoredNameFor`). Memberships/invites **deliberately excluded** from import-as-new (a restored workspace starts with no members; operator grants access) — exclusion lists live in the manifest's restore plan.
2. **Projects** (project-scope restore): the workspace doc is a JSON document — the restore is a **doc transformation**: read target workspace doc, splice the restored project subtree (`projects[]`, its tasks, files metadata) through `mergeClientDoc`'s normal validation path with a bumped `revision`. Hand-rolled row reinsertion is only for *row-shaped* data outside the doc (memberships, saved_views…), and for v1 selective restore the answer is: **don't restore row-shaped tables at all** — scope restore to the document model + file blobs. This keeps every invariant (FTS projection, hiddenFor redaction, per-team perms keys) intact for free.
3. **SQLite/Postgres parity**: the export must serialize the *logical* model (doc JSON + row rows), never SQLite page images — this is why "logical export archive" is the right call in the milestone framing and why the existing `--backup` CLI (raw `vacuum into` snapshot, server.js:50) is a *different* feature and stays as-is (it's dialect-bound; note it in docs, don't merge the two).

### Guarded overwrite — transaction boundary

Overwrite = delete-or-replace scoped rows + doc splice **inside one `begin immediate` transaction** (the D-11 "rows and doc can never disagree" pattern, server.js:3815). Guard funnel:

1. Type-to-confirm token = the target name (workspace rename danger-fork precedent, v3.2 shipped).
2. **Pre-restore snapshot rides the SAME export machinery**: before mutating, run one full-scope export of the target through the identical `buildArchive()` core, destination = local DATA_DIR, recorded as a `backup_runs` row with `trigger='pre_restore'`. One code path for export = one thing to trust.
3. Then the single transaction replaces; any throw rolls back everything. Webhook/FTS side-effects follow the post-commit kick rule (NEVER inside the transaction — server.js:2497/2501 standing rulings).

### Checksum

sha256 computed streaming during archive write (node:crypto), stored on `backup_runs.sha256` and embedded in the manifest; restore verifies archive_sha256 against the manifest before planning — refuse-with-keyed-code on mismatch.

---

## 5. Destination Abstraction — one seam, two implementations

NEW fence `destinations.js` (or fold into backup.js if <200 lines; S3 signing is big enough to warrant `s3-dest.js`):

```js
// One interface, injected into the run executor (DB-free, fs-free):
// { id, openWrite(key) → Writable, openRead(key) → Readable,
//   list(prefix) → [{key, size, mtime}], remove(key), exists(key) }
```

- **Local dest** (NEW): keys map under `DATA_DIR/backups/<task-id>/…` — fs streams, trivially testable.
- **Hand-rolled S3 dest** (NEW, `s3-dest.js`): SigV4 with node:crypto only (the codebase already hand-rolled RS256/JWKS over node:crypto for OIDC — precedent, oidc.js). Single-part PUT first (5 GB cap is fine for logical exports); multipart is a v2 flag. Secrets come from **boot-frozen env consts** (`S3_*` with strict-token parse + boot-refuse on invalid — the WORKSPACE_CREATION/SUPER_ACCESS pattern, server.js:150–177), never stored in `backup_tasks.destination_cfg` (config carries only bucket/prefix). SSRF posture: the bucket host is operator-configured env, not user input — still reuse the webhook-ssrf.js pinned-address discipline for good measure.
- **Same-commit refusals**: destination-not-configured, S3-unreachable-at-save (probe with a tiny list call at task save, keyed refusal).

---

## 6. UI Surfaces — existing page patterns

Verified frontend shape: plain ES modules under `src/pages/` (governance.js exists, ~page-per-concern), shell-driven routing (src/shell/), lazy chunks under the 500 kB gate (D-02; a new Backup/Restore surface should be a **lazy chunk** like install-banner/settings), i18n gate 0 dead/0 stale with all 5 locales, Lucide icons only.

| Surface | Status | Pattern to follow |
|---|---|---|
| Instance > Governance > **Instance Roles** tab | NEW tab inside existing `src/pages/governance.js` | Group-mappings tab shape (roster table, multi-add picker from v3.2, dead-row warning card, type-to-confirm for demotions; last-operator guard analog: never remove the last super admin — mirror `isInstanceAdmin` demotion refusal) |
| Instance > **Backup** page | NEW lazy chunk `src/pages/backup.js` | Table of tasks (scope chip, cron, next run, last run status) + task editor modal (scope picker reuses workspace/project pickers from v3.2; cron field with live `nextRunAfter` preview computed client-side *only for display* — server revalidates) + runs drawer (history, checksum, failure reason, Run now button) |
| Instance > **Restore** page | NEW lazy chunk `src/pages/restore.js` | Restore-source picker (list available runs across destinations via list()) + scope tree + import-as-new default radio + overwrite fork gated by type-to-confirm; results screen with link to the pre-restore snapshot run |
| API routes | MODIFIED server.js | `/api/governance/backup-tasks*`, `/api/governance/backup-runs*`, `/api/governance/restore*`, `/api/governance/instance-roles*` — all behind the role gate (§1); MCP mirror only if cheap (mcp.js precedent for invite doors — optional, note as a decision point) |
| Super Admin roster listing | NEW (backlog seed) | governance.js role-first listing with capped results + post-promotion feedback |

---

## 7. Component Map (NEW vs MODIFIED) + Suggested Build Order

| Component | Status | Notes |
|---|---|---|
| `instance_roles` + `instance_role_members` tables | NEW (both mirrors + pin test) | Phase 1 candidate: everything gates on the role vocabulary |
| Role gate helper (`hasInstanceRole(user, key)`, Super-Admins-auto-members) | NEW in server.js | Extends `isInstanceAdmin` (server.js:4975), keeps backward compat: every existing operatorOnly route keeps working unchanged |
| `backup.js` core (cron math, GFS, manifest, restore plan, refusals) | NEW | Pure, inert first — pinned by zero-boot unit suite (groups-core.test.mjs precedent) |
| `destinations.js` / `s3-dest.js` | NEW | Local first (unblocks everything), S3 second |
| `backup_tasks`/`backup_runs`/`backup_run_claims` tables | NEW | Both mirrors + PG_EPOCH_COLUMNS + pin test |
| Export executor (`buildArchive` wiring: doc rows + DATA_DIR file streams → archive) | NEW in server.js | The one genuinely new integration seam |
| Scheduler interval + overlap mutex + catch-up | NEW in server.js boot block | 60 s tick, house rules |
| Failure email | NEW in server.js | Reuses mailer.js + email_outbox (the POL-02 piggyback pass already drains it — free retry semantics) |
| Restore executor (import-as-new via doc funnel; overwrite via begin-immediate + pre-restore snapshot run) | NEW in server.js | Reuses mergeClientDoc + vacuum-into precedents |
| Routes `/api/governance/*` | NEW family in server.js | Role-gated, keyed refusals, 5-locale same-commit |
| governance.js Instance Roles tab | MODIFIED (new tab) | |
| backup.js / restore.js pages + shell routing + locales ×5 | NEW | Lazy chunks |
| Existing `--backup` CLI | UNCHANGED | Documented as distinct (dialect-bound snapshot vs logical export) |
| sw.js, manifest, D-06 mime map, mergeClientDoc/redactDoc | UNCHANGED | Zero-diff contract, per house rules |

**Build order (dependency-driven):**

1. **Roles foundation** — `instance_roles` tables + gate helper + Governance tab + refusals. Cheapest, unblocks all permission checks, zero risk to existing features, independently shippable.
2. **Export core** — backup.js manifest/archive/serializer pure core + local destination + manual "run now" runs (no scheduler yet). Proves the archive format end-to-end with unit tests.
3. **Scheduler** — tasks table + cron validation + interval tick + claim ledger + catch-up + GFS rotation pruning. Depends on 2.
4. **S3 destination** — s3-dest.js + env consts + probe-at-save. Depends on 2 (interface frozen), independent of 3.
5. **Restore** — import-as-new first (doc-splice via mergeClientDoc), then guarded overwrite + pre-restore snapshot + type-to-confirm. Depends on 2 (reads archives); highest-risk phase, benefits from a stable export format.
6. **Run history polish + failure email + Super Admin roster backlog item.** Depends on 3.

Rationale: roles before everything (every later route checks them); export before restore (restore consumes the format; format churn after restore exists = rework); scheduler before S3 is negotiable but manual-run-first (phase 2) already gives operators value without cron. The failure email and history UI are polish riding an already-working run pipeline.

## Patterns to Follow (one-line index into the codebase)

- Fenced pure module + injected deps: `groups.js`, `domains.js`
- Dual schema mirror + contract pin test: server.js:645 ↔ db-adapter.mjs:387 ↔ test/groups-core.test.mjs:79
- Exactly-once claim ledger: `reminders_sent` (server.js:485, INSERT OR IGNORE inside the effect transaction)
- Interval house rules: named async sweep + try/catch + .catch + .unref() (server.js:9686–9739)
- Restart catch-up at-most-once: reminder boot pass (server.js:9713)
- Pre-mutation `vacuum into` snapshot: migrateTenancy / team-members migration (server.js:3773–3860)
- Rows-and-doc atomicity in `begin immediate`: D-11 (server.js:3815)
- Boot-frozen env with strict-token boot-refuse: WORKSPACE_CREATION / SUPER_ACCESS (server.js:150–225)
- Keyed 5-locale refusal funnel: `{code,message}|null` → `fail(res,400,code,message)` (groups.js:49–67)
- Hand-rolled crypto over node:crypto only: oidc.js (RS256/JWKS) → template for SigV4

## Anti-Patterns to Avoid

- **N-window catch-up backfill** — N missed cron windows must not produce N export runs (disk/S3 stampede after downtime). One catch-up run, next_run_at anchored to now.
- **Storing S3 secrets in task rows** — destination_cfg is config-not-credentials; creds are boot-frozen env (break-glass rotation story already exists for MASTER_KEY).
- **Hand-rolled row reinsertion for restore** — bypasses mergeClientDoc, FTS projections, redaction funnels, revision protocol. Restore through the existing write funnels or restore nothing in that layer.
- **Cron parsing at run time from the client** — recompute `next_run_at` at save and after each run server-side only; the client preview is display-only.
- **A cron library / node-cron dependency** — zero-deps standing constraint; a 5-field parser + next-run calculator is ~120 pure lines, fully unit-testable.
- **Removing the last super admin** — mirror the last-operator demotion refusal (v3.1 shipped).

## Sources (all codebase-verified, HIGH confidence)

- groups.js (fence pattern, refusal funnel, resolver contract)
- server.js:440–657 (schema block, audit_log FK-free D-A2, reminders_sent, group_mappings DDL), :150–225 (strict-token env), :2325–2651 (reminder pass, claim+catch-up), :3751–3860 (vacuum-into backups, begin-immediate), :4975–4995 (isInstanceAdmin), :7476–7533 (governance routes), :9686–9739 (interval house rules)
- db-adapter.mjs:375–419 (pg mirror + PG_EPOCH_COLUMNS rationale)
- test/groups-core.test.mjs (schema pin test precedent), test/groups-sso.test.mjs / groups-config-api.test.mjs (injection-based integration test shape)
- src/pages/governance.js, src/shell/, vite chunk gate (D-02) — UI patterns
- .planning/PROJECT.md (v3.0/v3.2 decisions: strict tokens, same-commit locale keys, dead-mapping warning cards)

## Open Questions / Gaps for Phase Research

- Archive container format: single JSONL+files zip (needs zip — hand-roll store-mode only, ~zero-deflate is feasible over node:crypto crc32) vs tar vs plain folder-of-files + manifest.json. Zip store-mode is recommended (streamable, single artifact, checksums cleanly) but the crc32 hand-roll is a small new primitive — phase research should confirm size math.
- Whether scope=project restore ever needs row-shaped tables (saved_views, webhook rows) or doc-splice suffices for v1 — decision for discuss-phase.
- MCP mirror for backup endpoints: in or out of v1 scope.
- GFS rotation semantics across scopes sharing one destination prefix — dedup vs per-task namespaces (recommend per-task namespace; phase decision).
