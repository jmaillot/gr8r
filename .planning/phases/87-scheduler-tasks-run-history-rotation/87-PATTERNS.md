# Phase 87: Scheduler, Tasks, Run History & Rotation - Pattern Map

**Mapped:** 2026-11-21
**Files analyzed:** 16 (8 new source files, 3 modified source files, 5 new test files)
**Analogs found:** 16 / 16 (all in-repo, git-tracked — verified via `git ls-files`)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `export/cron.js` | utility (pure module) | transform | `tz.js` (root-level zero-dep funnel, test-importable) + `export/backup.js` header discipline | exact |
| `server.js` — `backup_tasks` + `backup_runs` DDL (SCHEMA) | model / migration | CRUD | `email_outbox` + `instance_roles` DDL (server.js:625-679) + `pgSchemaVariant` (db-adapter.mjs:434-447) | exact |
| `server.js` — `/api/backup/tasks` GET/POST/PUT/DELETE | controller | request-response | Phase 85 stub family (server.js:7755-7783) + Phase 86 guard chain (server.js:7796-7858) | exact |
| `server.js` — `/api/backup/runs?taskId=` history GET | controller | request-response | existing `/api/backup/runs/current` GET (Phase 86, same block) | exact |
| `server.js` — backup scheduler sweep | service | event-driven (interval) | session sweep + reminder tick (server.js:10047-10085) | exact |
| `server.js` — boot stale-`running` sweep | service | batch | `sweepStaleBackupStaging()` boot call (server.js:10037-10038) | exact |
| `server.js` — GFS rotation pass | service | batch + file-I/O | `rmStaging()` best-effort delete (export/backup.js:511-513) + audit funnel (server.js:7808-7822) | role-match (new delete-set math) |
| `server.js` — failure/recovery email transitions | service | event-driven | email_outbox claim insert (server.js:2333-2348) + `runEmailDeliveryPass` (server.js:3180-3204) | exact |
| `export/backup.js` (modify) — task-scoped naming + persisted-run writer seam | service | streaming/file-I/O | `archiveName()` + `claimRun()`/`runExport` (export/backup.js:501-518, 129-145) | exact |
| `src/pages/backup.js` (modify) — task form (builder + tz combobox) + history card | component (render-only) | request-response | this same file's `runNowCard`/`runProgress` (src/pages/backup.js:44-87) + Phase 34 `tzCombobox` (src/pages/settings.js) | exact |
| `src/actions/actions.js` (modify) — task save/delete/toggle/run-now fill loops | store / action handlers | request-response | `refreshBackupTasks` + `backupPollTick` + `A.backupRunNow` (src/actions/actions.js:4720-4810) | exact |
| `src/core/api.js` (modify) — backup task/run endpoints | utility (API client) | request-response | existing `backupTasks`/`backupRun`/`backupRunCurrent` (src/core/api.js:429-440) | exact |
| `src/locales/{en,fr,es,de,nl}.json` (modify) | config | — | existing `err.backupManageRequired` etc. (src/locales/en.json:1795-1796) | exact |
| `test/backup-cron.test.mjs` | test (pure unit) | — | `tz.js` import style + `test/settings-tz-combobox.test.mjs` direct-import pattern | exact |
| `test/backup-tasks-api.test.mjs`, `test/backup-scheduler.test.mjs`, `test/backup-rotation.test.mjs` | test (API + db) | — | `test/backup-routes.test.mjs` harness | exact |
| `test/backup-history-client.test.mjs` | test (source-assertion) | — | `test/settings-tz-combobox.test.mjs` (fs-read source assertions) | exact |

## Pattern Assignments

### `export/cron.js` (utility, pure module — NEW)

**Analog:** `tz.js` (whole file, 58 lines) — the repo's precedent for a root-level, zero-dep, test-importable pure module extracted beside server.js. Copy its header shape and its Intl discipline verbatim.

**Module header + funnel pattern** (tz.js:1-4, 28-39):
```js
/* Timezone resolution funnel (Phase 44, D-05/D-06/D-07) — the single
   label→zone choke point every resolution site calls. Extracted from
   server.js so tests can import the funnel without booting the server
   (server.js opens its DB and listens on import). Zero runtime deps. */
export function resolveTz(value) {
  const v = typeof value === 'string' ? value.trim() : '';
  ...
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: v }).resolvedOptions().timeZone || 'Europe/Paris';
  } catch { /* RangeError — unknown zone: fall through to the D-07 fallback */ }
  return 'Europe/Paris';
}
```

**Intl parts extraction (never cached offsets)** (tz.js:45-58):
```js
export function localParts(tzLabel, date = new Date()) {
  const zone = resolveTz(tzLabel);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const get = t => parts.find(p => p.type === t)?.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24 };
}
```
Rules for `nextRunAt(cron, tz, fromMs)`: fresh `Intl.DateTimeFormat` per evaluation (tz.js:41-44 comment: "Never cached across members or ticks: DST is real"); minute-by-minute forward scan from `from+1min` with a bounded cap (~527,040 iterations); fields `*`, lists, ranges, steps; dom/dow OR when both restricted; dow 0-7 (0=7=Sunday). Validate before storing — a malformed cron refuses `invalidSchedule` at the API, and the sweep try/catches per task.

**Header discipline** (export/backup.js:1-9): same banner style — explain WHAT/WHY, "Lives at the repository ROOT beside export/msdi.js — never under src/", "Zero new npm dependencies". Also RESEARCH.md's prohibition: no second cron parser under `src/` (Pitfall 6).

---

### `server.js` — `backup_tasks` + `backup_runs` DDL (model, NEW in SCHEMA)

**Analog:** `email_outbox` DDL (server.js:619-640) and `instance_roles` DDL (server.js:661-679).

**DDL with comment discipline + pg derivation note** (server.js:625-640, 661-672):
```sql
/* POL-02 ... 'ctx' carries everything the email rebuild needs at delivery
   time ... pg twin: db-adapter.mjs SQLITE_SCHEMA (byte-identical DDL — Pitfall P-B);
   epoch columns reuse webhook names already registered in PG_EPOCH_COLUMNS. */
create table if not exists email_outbox (
  id               text primary key,
  workspace_id     text not null,
  dedup_key        text not null unique,
  ...
  created_at       integer not null,
  delivered_at     integer
);
create index if not exists email_outbox_due on email_outbox(status, next_attempt_at);
```
Copy: single `SCHEMA` template literal, `create table if not exists`, CHECK enums for status-like columns (instance_roles:675 `role text not null check (role in (...))`), unique-pair indexes (server.js:679), a comment block above each table explaining the frozen decisions (D-04 stored raw cron string, D-09 retention defaults 7/4/12/5, D-11 task_id scoping), and a "pg twin" note. Register new epoch columns (`next_run_at`, `started_at`, `finished_at`, etc.) in `PG_EPOCH_COLUMNS` (db-adapter.mjs:418-432 list — `next_attempt_at`/`delivered_at` already there; add new names) so `pgSchemaVariant` rewrites integer→bigint (db-adapter.mjs:434-447):
```js
const col = out.match(/^\s*([A-Za-z_]\w*)\s+integer\b/);
if (col && PG_EPOCH_COLUMNS.has(col[1].toLowerCase())) out = out.replace(/\binteger\b/, 'bigint');
```

---

### `server.js` — `/api/backup/tasks` CRUD + `/api/backup/runs?taskId=` (controller, request-response)

**Analog:** Phase 85 stub family (server.js:7755-7783) + Phase 86 runs guard chain (server.js:7796-7858). Replace the stub; copy the guard-chain order VERBATIM — the header comment at server.js:7785-7795 documents it as frozen:
```js
/* Guard chain order is copied verbatim from the Phase 85 stub family (never
   reordered — sameOrigin before body read AND throttle, house rule):
     sameOrigin → requireUser → throttle → capability gate → scope checks →
     concurrency → claim → fire-and-forget export. */
```
**Gate + audited refusal** (server.js:7796-7813):
```js
if (pathname === '/api/backup/runs' && method === 'POST') {
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const user = await requireUser(req, res);
  if (!user) return;
  if (tooMany(`backuprun|${user.id}`, 5, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
  if (!(await hasInstanceRole(user.id, CAP.BACKUP_MANAGE))) {
    await db.run('insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
      [uid(), user.id, user.id, 'backup_run_refused:backupManageRequired', 0, clientIp(req), null, user.name, user.email, user.name, user.email, now()]);
    return fail(res, 403, 'backupManageRequired', 'Only a Backup Operator can run backups');
  }
```
**Scope validation (reuse for task scope)** (server.js:7823-7828): `kind` allow-list (`project`/`workspace`/`instance`), `/^[A-Za-z0-9_-]{1,64}$/` id regex, then DB existence — every failure the SAME keyed refusal (T-86-06, no oracle). **GET read gate** allows both roles (server.js:7761-7768: `BACKUP_MANAGE` OR `RESTORE_USE`, plus `canBackup`/`canRestore` flags in payload). Validation of cron/tz/retention: cron round-trips through `export/cron.js` (unparseable → keyed `invalidSchedule`), tz through `resolveTz` (tz.js), retention as small non-negative ints with defaults 7/4/12/5. Audit naming style: `backup_task_refused:*`, `backup_task_created`, `backup_task_updated`, `backup_task_deleted`, `backup_rotation:*`.

---

### `server.js` — scheduler sweep + boot sweeps (service, event-driven)

**Analog:** reminder tick (server.js:10074-10085) — the 1-minute interval with injectable clock precedent; session sweeps (server.js:10047-10060) for the named-helper + `.unref()` discipline; boot sweep call site (server.js:10037-10041).

**Reminder tick (the D-08 template)** (server.js:10082-10085):
```js
await runReminderPass();   // boot catch-up pass — exactly the D-05 at-most-once shape
setInterval(() => {
  runReminderPass().catch(err => logWarn(`reminder tick: ${err.message}`));
}, 60_000).unref();
```
The comment above it (server.js:10074-10081) is mandatory reading: try/catch AND a promise `.catch` — "an uncaught throw in a setInterval callback kills the process"; `.unref()` keeps the timer from holding the event loop open.

**Session sweep named helpers** (server.js:10050-10057):
```js
const sweepExpiredSessions = async () => {
  await db.run('delete from sessions where expires_at <= ?', [now()]);
};
await sweepExpiredSessions();
setInterval(() => sweepExpiredSessions().catch(err => logWarn(`session sweep: ${err.message}`)), 3600_000).unref();
```

**Boot sweep slot** — stale `status='running'` → `'interrupted'` goes beside (server.js:10037-10038):
```js
const sweptBackupStaging = sweepStaleBackupStaging();
if (sweptBackupStaging) logInfo(`backup staging sweep: removed ${sweptBackupStaging} orphan(s)`);
```
Sweep body (RESEARCH Pattern 2): `select * from backup_tasks where enabled=1 and next_run_at is not null and next_run_at <= ?` → per task: `try { await fireOrSkip(task); } catch (err) { logWarn(...) }` (per-task try/catch so one malformed cron never starves the others); then recompute `next_run_at` from **now** — no backward search (that IS the at-most-once catch-up). Inject a `now` clock parameter for time-travel tests, exactly like `runEmailDeliveryPass({ now: at })` (server.js:3180-3181).

---

### `server.js` — failure/recovery email transitions (service, event-driven)

**Analog:** email_outbox claim insert POL-02 (server.js:2333-2348) + delivery pass (server.js:3180-3204).

**Claim insert** (server.js:2339-2347) — copy this verbatim shape, swapping the sentinel workspace_id and dedup key:
```js
await db.run('insert or ignore into email_outbox (id, workspace_id, dedup_key, kind, recipient, ctx, created_at) values (?,?,?,?,?,?,?)', [
  uid(),
  wsRow.id,                                    // instance-scope: use '' sentinel (verify against delivery queries — they don't filter on workspace_id, server.js:3193)
  `notif:${n.id}`,                             // → `backup-alert:${runId}:${recipientEmail}`
  'notif',                                     // → 'backup_alert'
  to,
  JSON.stringify({ type: 'notif', to, ..., locale: recipientLocale }),
  now(),
]);
```
**Delivery query / injectable clock / fail-absent loop** (server.js:3180-3204): `MAILER.enabled` gate returns immediately; drain select filters `status in ('pending','failed') and (next_attempt_at is null or next_attempt_at <= ?)` only; per-row try/catch — "fail-absent: one bad delivery never kills the pass". **Recipients** (D-17): `select u.email, u.locale from instance_roles ir join users u on u.id = ir.user_id where ir.role = 'backup_operator'` + `where is_instance_admin = 1` (instance_roles DDL server.js:672-679); localize through `tFor(locale, key)` (server.js:65 import). **Gate + kick pattern** (server.js:2515/2529): guard every enqueue on `MAILER.enabled`, then post-insert `runEmailDeliveryPass().catch(...)`. **Transition logic** (D-15/D-16): map run outcome → `ok`|`failed`; email only when state ≠ `last_notified_state` (first-ever failure from NULL = transition); then update the column. Consecutive failures never re-email.

---

### `export/backup.js` (modify — task-scoped naming + run-writer seam)

**Analog:** this file's own claim/naming/hygiene code.

**Sync claim (86-D-10)** (export/backup.js:129-145) — overlap check calls `getRunState()` first or maps `claimRun()`'s null:
```js
let currentRun = null;
export function getRunState() { return currentRun; }
export function claimRun(scope) {
  if (currentRun && (currentRun.stage === 'collecting' || ...)) {
    return null; // D-10: one export at a time — caller refuses with backupRunInProgress
  }
  const runId = crypto.randomUUID(); // D-18
  currentRun = { runId, scope, stage: 'collecting', cancelled: false, startedAt: Date.now() };
  return runId;
}
```
**Filename + best-effort delete** (export/backup.js:501-513):
```js
/* ---- Filename (D-14): backup-<scope-kind>-<scope-id>-<YYYYMMDD-HHMMSS>.tar.gz ---- */
function archiveName(scope, now) {
  const d = new Date(now);
  const p = n => String(n).padStart(2, '0');
  const ts = `${d.getUTCFullYear()}${p(d.getUTCMonth()+1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
  return scope.kind === 'instance' ? `backup-instance-${ts}.tar.gz` : `backup-${scope.kind}-${scope.id}-${ts}.tar.gz`;
}
function rmStaging(stagingDir) {
  try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch { /* D-15 best-effort */ }
}
```
Task-scoped runs extend `archiveName` with the scope plumbing (e.g. kind `task:<id>` → `backup-task-<id>-<ts>.tar.gz` — greppable on disk for D-11) while manual names stay frozen (86-D-14). Rotation deletes copy the `rmStaging` best-effort try/catch; delete the `.sha256` sidecar FIRST, then the archive (Pitfall 5), mark run rows `deleted` only after both unlinks.

---

### `src/pages/backup.js` (modify — task form + history card; component, render-only)

**Analog:** this file itself (127 lines) — the exact extension point and every doctrine comment is here.

**Header/doctrine** (src/pages/backup.js:11-22): renders ONLY from server payloads; "payload strings render through esc() — text nodes only, no raw interpolation (T-79-10)"; capability flags rendered verbatim, never recomputed client-side (src/pages/backup.js:103-106).
**Card pattern to copy for the history card** (src/pages/backup.js:44-67, 73-87):
```js
const runNowCard = flags => {
  const scope = S.ui.backupScope || { kind: 'instance', id: null };   // staged state in S.ui, never the DOM
  ...
  return `<div class="panel" style="margin-top:12px"><div class="panel-b">
    <h2 style="margin:0 0 4px">${t('page.backup.runNowTitle')}</h2>
    <p class="faint" style="margin:0 0 10px">${t('page.backup.runNowLead')}</p>
    <div class="row" ...>
      <div class="field"><label class="label">${t('page.backup.scopeLabel')}</label><select class="input" data-in="backupScopeKind">...</select></div>
      <button class="btn btn-primary" data-a="backupRunNow">${ic('hard-drive', 14)}${t('page.backup.runAction')}</button>
    </div>
  </div></div>`;
};
```
Task form = same panel/field/data-in/data-a pattern with the schedule builder (4 presets + Custom → per-field `<select>` dropdowns, D-01 — never a free-text cron input) and the **Phase 34 tz combobox**: reuse `tzCombobox`/`tzPreselect` from `src/pages/settings.js` (search the combobox for `data-in="tzSel"`, `data-a="tzSel"`, `TIMEZONES` from `../lib/timezones.js` — test/settings-tz-combobox.test.mjs:39-51 pins the wiring contract; D-03). History card (D-14): newest-first capped ~50 rows, `esc()` every status/trigger/duration/size/checksum/**error** field (Pitfall 7), expandable error detail. No client-side cron preview computing (Pitfall 6) — human-readable summary from preset+fields only.

---

### `src/actions/actions.js` (modify — task action handlers)

**Analog:** the existing backup block (lines 4720-4810).
```js
export async function refreshBackupTasks() { ... }   // 4720 — GET fill loop pattern
export async function backupPollTick() { ... }        // 4768 — poll loop with abort pattern
backupPollTimer = setInterval(() => backupPollTick(), 1000);   // 4802
A.backupRunNow = async () => { ... };                 // 4810 — action-handler naming: A.<name> = IN.<name> alias discipline (test/settings-tz-combobox.test.mjs:42-43)
```
Add `backupTaskSave`, `backupTaskDelete`, `backupTaskToggle`, `backupTaskRunNow` handlers in this style; the enable toggle must recompute/send `next_run_at` semantics server-side (Pitfall 2 — the handler posts the toggle, the server recomputes in the same write as the enable).

---

### `src/core/api.js` (modify — API client methods)

**Analog:** existing backup methods (src/core/api.js:429-440):
```js
async backupTasks({ signal } = {}) {
  return call('GET', '/api/backup/tasks', undefined, { signal });
},
async backupRun(scope, { signal } = {}) {
  return call('POST', '/api/backup/runs', { scope }, { signal });
},
async backupRunCurrent({ signal } = {}) {
  return call('GET', '/api/backup/runs/current', undefined, { signal });
},
```
Add `backupTaskCreate/Update/Delete`, `backupRuns({ taskId })`; document each new keyed error code in the comment block beside it (existing style at 429-434 documents the refusal codes).

---

### `src/locales/*.json` (×5)

**Analog:** `err.backupManageRequired` etc. at src/locales/en.json:1795-1796; parity enforced by `i18n:scan` prebuild. Add every new refusal (`invalidSchedule`, task-CRUD refusals) and page string (builder presets, history card labels) to all five files.

---

### `test/backup-tasks-api.test.mjs` / `test/backup-scheduler.test.mjs` / `test/backup-rotation.test.mjs`

**Analog:** `test/backup-routes.test.mjs` (harness, lines 1-48) — copy the header comment style, imports, and helper shapes verbatim:
```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ADMIN, client, login, signup, startServer, withDb } from './helpers/server.mjs';

const backupAuditRows = srv =>
  withDb(srv.dbPath, db => db.prepare("select * from audit_log where action like 'backup_run_%' order by created_at, id").all());
const userIdByEmail = (srv, email) => withDb(srv.dbPath, db => db.prepare('select id from users where email = ?').get(email).id);

/* A holder + the operator client, granted through the Phase 85 grant route. */
async function makeBackupOp(server, email) { ... }
```
Pattern: startServer-per-case with the shared harness; `withDb` for direct row inspection (run rows, outbox rows, task rows, audit trail). Scheduler/rotation suites drive the sweep via the injectable clock (`now` param, runEmailDeliveryPass precedent server.js:3180) — no sleeps beyond the existing `const sleep = ms => ...` helper where unavoidable.

### `test/backup-cron.test.mjs`

**Analog:** direct import of a pure root-level module — `test/settings-tz-combobox.test.mjs:30-31` imports `TIMEZONES` and `resolveTz` without booting the server; do the same with `export/cron.js`. Cover: field grammar matrix (steps, ranges, lists), dom/dow OR semantics, dow 0=7, leap day, DST ambiguous/nonexistent hour, bounded-horizon behavior.

### `test/backup-history-client.test.mjs`

**Analog:** `test/settings-tz-combobox.test.mjs` source-assertion style (whole file) — fs-read the real source and assert structurally:
```js
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(REPO, rel), 'utf8');
const settingsSrc = read('src/pages/settings.js');
const actionsSrc = read('src/actions/actions.js');
...
assert.match(settingsSrc, /data-in="tzSel"/, 'combobox input must carry data-in="tzSel"');
```
Pin for Phase 87: `data-in`/`data-a` wiring for the task form + history card, `esc()` on every interpolated field, the tz combobox reuse (not a second picker), no free-text cron input element, no `supportedValuesOf` under src/, 5-locale catalogue parity for the new keys.

## Shared Patterns

### Guard chain (frozen order — never reordered)
**Source:** server.js:7756-7781, 7796-7813; documented frozen at 7785-7795
**Apply to:** every new `/api/backup/tasks` route
```js
sameOrigin → requireUser → throttle → capability gate → body/scope checks
```
Gate `CAP.BACKUP_MANAGE` for mutations, allow `RESTORE_USE` holders on reads; the capability gate sits BEFORE any body probing (no 403-vs-400 oracle, T-86-07); every refusal keyed AND audited (D-20 style insert at 7808-7811).

### Keyed 5-locale refusals
**Source:** src/locales/en.json:1795-1796 (`err.backupManageRequired`), i18n parity via `i18n:scan`
**Apply to:** all task-CRUD refusals + new page strings — add to en/fr/es/de/nl in the same commit.

### Audit funnel
**Source:** server.js:7808-7822 (`backup_run_refused:*` inserts, 12-column shape)
**Apply to:** task create/update/delete/toggle refusals AND mutations; rotation deletes get `backup_rotation:*` events carrying ids/bucket/why (D-12).

### setInterval hygiene (D-08)
**Source:** server.js:10047-10085
**Apply to:** the scheduler sweep — named async helper, boot pass awaited first, interval callback catches the promise AND `.unref()`, per-task try/catch inside the pass.

### email_outbox claim-then-deliver
**Source:** server.js:2333-2348 (insert), 3180-3204 (drain)
**Apply to:** failure/recovery alerts — claim rows on transitions only, `MAILER.enabled` gate, post-insert `runEmailDeliveryPass().catch(...)` kick, per-recipient `tFor` locale.

### Injected clock for tests
**Source:** `runEmailDeliveryPass({ now: at, send: sendFn })` (server.js:3180-3181)
**Apply to:** the sweep and rotation pass — accept `{ now }` so catch-up and bucket-aging tests time-travel without sleeps.

### esc() render-only doctrine
**Source:** src/pages/backup.js:11-22, 79, 84; enforced structurally by test/settings-tz-combobox.test.mjs:102-107
**Apply to:** the whole task form + history card — especially the `error` column (exception text with markup is the Pitfall-7 XSS vector).

### Zero new npm dependencies
**Source:** export/backup.js:8-9 header discipline; `grep -i cron package.json` = nothing
**Apply to:** the entire phase — cron eval, tz math, rotation are hand-rolled on Node ≥24 stdlib. Any cron-library proposal contradicts codebase discipline.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `export/cron.js` — the 5-field evaluator core | utility | transform | No cron parser exists anywhere in the repo (zero-dep mandate means none ever did). tz.js provides the *module shape* and Intl discipline, not the algorithm — write it fresh per RESEARCH Pattern 1, pin it with the Wave-0 test matrix. |
| GFS delete-set math (bucket assign + ID exclusion + refuse-to-empty floor) | service | batch | New algorithm (D-10/D-13). Deletion *mechanics* copy `rmStaging` best-effort try/catch; the set math is new and test-pinned. |

## Metadata

**Analog search scope:** server.js (targeted ranges), export/backup.js, tz.js, roles.js, db-adapter.mjs, src/pages/backup.js, src/actions/actions.js, src/core/api.js, test/backup-routes.test.mjs, test/settings-tz-combobox.test.mjs
**Files scanned:** ~12 source files + 2 test files (all excerpts verified at exact lines this session)
**Tracked-source gate:** all named analogs verified git-tracked via `git ls-files` (db-adapter.mjs, export/backup.js, src/lib/timezones.js, src/pages/backup.js, test/backup-routes.test.mjs, tz.js) — no mirror paths
**Pattern extraction date:** 2026-11-21
