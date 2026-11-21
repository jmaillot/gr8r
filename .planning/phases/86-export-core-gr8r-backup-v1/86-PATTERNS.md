# Phase 86: Export Core ("gr8r backup v1") - Pattern Map

**Mapped:** 2026-11-21
**Files analyzed:** 10 (4 new, 6 modified)
**Analogs found:** 10 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `export/backup.js` (new) | service (pipeline) | file-I/O + streaming (transform) | `export/mspdi.js` (module placement/header) + `db-adapter.mjs` pgTx (fence) | role-match (no in-repo archive writer exists) |
| `backup-run-state.js` (new, or merged into export/backup.js) | store (in-memory state) | event-driven (stage transitions) | `src/actions/actions.js:4718-4724` module-level seq/inflight holder (closest shape); server.js singleton state (authoritative) | partial |
| `server.js` route additions (modify) | controller (route) | request-response | `server.js:7747-7780` Phase 85 backup stubs | exact |
| `server.js` audit_log writes (modify) | controller (side effect) | CRUD | `server.js:5444-5452, 5483-5490` same-tx audit insert | exact |
| `server.js` SIGTERM/boot-sweep (modify) | utility (lifecycle) | event-driven | `server.js:10034-35` existing shutdown handler | role-match |
| `src/pages/backup.js` (modify) | component (page) | request-response (poll) | `src/pages/backup.js` itself (extends its own D-26 fullstate / fill-loop pattern) | exact |
| `src/actions/actions.js` (modify) | store/actions | request-response | `src/actions/actions.js:4718-4743` refreshBackupTasks + A.backupRetry | exact |
| `src/core/api.js` (modify) | client API module | request-response | `src/core/api.js:429-431` backupTasks, `:439-444` instanceRoleGrant | exact |
| `src/locales/{en,fr,nl,de,es}.json` (modify) | config (i18n) | static | existing `err.*` keyed refusal keys (error-codes.test.mjs / i18n-scan enforce parity) | exact |
| `test/backup-export.test.mjs`, `test/backup-routes.test.mjs` (new) | test | batch | `test/export-mspdi.test.mjs`, `test/pg-matrix.test.mjs`, `test/instance-roles-api.test.mjs` | role-match |

All analog paths verified git-tracked (`git ls-files`).

## Pattern Assignments

### `export/backup.js` (new) — service, streaming/file-I/O

**Analog:** `export/mspdi.js` (placement + module header convention), `db-adapter.mjs:503-525` (pg fence), `server.js:126-132` (paths)

**Module placement pattern** (mspdi.js:1-9) — server-only, repository ROOT, never under `src/`:
```js
/* =====================================================================
   MSPDI WRITER — Phase 54 (54-05)
   =====================================================================
   Server-only Microsoft Project XML (MSPDI) serializer. Lives at the
   repository ROOT beside export/xlsx.js — never under src/ (the
   prohibition test fails the moment a src/ module reaches this file).
   ... */
```
→ backup.js carries the same block comment style: phase, scope facts, zero-import/zero-dep statement (D-33-11), and the [ASSUMED] items it pins.

**Path constants analog** (server.js:126-132):
```js
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(HERE, 'data'));
const FILES_DIR = path.join(DATA_DIR, 'files');
const LOGOS_DIR = path.join(DATA_DIR, 'logos');
```
→ backups dir + staging follow the same derivation: `path.join(DATA_DIR, 'backups')`, `path.join(DATA_DIR, 'tmp')` — staging under DATA_DIR keeps `fs.rename` same-filesystem (Pitfall 6).

**pg snapshot fence analog** (db-adapter.mjs:503-525) — checked-out client, never `pool.query('BEGIN')`:
```js
async function pgTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    try {
      const scope = {
        get: async (sql, params) => (await client.query(pgRewrite(sql), params)).rows[0],
        all: async (sql, params) => (await client.query(pgRewrite(sql), params)).rows,
        run: async (sql, params) => ({ changes: (await client.query(pgRewrite(sql), params)).rowCount }),
      };
      const out = await fn(scope);
      await client.query('commit');
      return out;
    } catch (err) {
      await client.query('rollback');
      throw err;
    }
  } finally {
    client.release();
  }
}
```
→ Exporter copies this shape with `begin isolation level repeatable read read only` and no commit-side writes; row dumps run ONLY inside the fence (Pitfall 4), file copies after release.

**SQLite fence idiom:** `VACUUM INTO` + checkpoint — already used at server.js:3804, 3882, 3957, 4006, 4162, 4257, 4365, 4537 (the `--backup`/CLI paths). Copy the established idiom; never `VACUUM INTO` onto an existing path.

**No analog exists:** the ustar writer (~120-180 lines), NDJSON dumper, and two-pass staged choreography are genuinely new. Per RESEARCH §Code Examples + Flag 1: hand-rolled 512-byte headers, `zlib.createGzip` via `stream.pipeline`, streamed `crypto.createHash('sha256')`, paginated row reads (never whole-table `all()`). Test the writer against `tar tzf`/`tar xzf` round-trip (golden Wave-0 test).

---

### `server.js` — `/api/backup/runs` route pair (controller, request-response)

**Analog:** `server.js:7747-7780` — Phase 85 backup stubs. Copy the guard chain verbatim; only the handler body changes.

**Guard chain pattern** (server.js:7752-7765, GET tasks):
```js
if (pathname === '/api/backup/tasks' && method === 'GET') {
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const user = await requireUser(req, res);
  if (!user) return;
  // a non-holder deep-linking gets the keyed 403 refusal, not a
  // silent redirect or an existence oracle.
  if (!(await hasInstanceRole(user.id, CAP.BACKUP_MANAGE)) && !(await hasInstanceRole(user.id, CAP.RESTORE_USE))) {
    return fail(res, 403, 'backupRoleRequired', 'You need a backup role to see that');
  }
  const canBackup = await hasInstanceRole(user.id, CAP.BACKUP_MANAGE);
  const canRestore = await hasInstanceRole(user.id, CAP.RESTORE_USE);
  return json(res, 200, { tasks: [], canBackup, canRestore });
}
```

**POST + throttle pattern** (server.js:7768-7779 + :7787):
```js
if (pathname === '/api/backup/tasks' && method === 'POST') {
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const user = await requireUser(req, res);
  if (!user) return;
  if (!(await hasInstanceRole(user.id, CAP.BACKUP_MANAGE))) {
    return fail(res, 403, 'backupManageRequired', 'Only a Backup Operator can edit backup tasks');
  }
  await readJson(req);
  return fail(res, 400, 'backupNotConfigured', 'Backup tasks are not configured yet');
}
// throttle shape (server.js:7787):
if (tooMany(`signup|${clientIp(req)}`, 5, 60 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
```
→ D-21 throttle keys on `backuprun|${user.id}` (operator-keyed, like grant/revoke — per-route choice, confirmed in CONTEXT D-21) and consumes a try even on refusal (place before the gate checks). D-22 GET current: BACKUP_MANAGE gate with `backupRoleRequired` 403 (same wording as :7759). D-17 scope validation returns `fail(res, 400, code, message)` with the house `{code,message}|null` funnel (roles.js:48-49 comment documents this exact funnel shape).

**Order note:** signup route comment (:7783-84) is the house rule — sameOrigin BEFORE body read AND throttle, "never reorders the guard chain".

**CAP gate analog** (roles.js:24-41):
```js
export const CAP = Object.freeze({
  BACKUP_MANAGE: 'backup_manage', // create/edit/delete/run backup tasks (Phase 86/87)
  ...
});
export const ROLE_CAPS = Object.freeze({
  backup_operator: [CAP.BACKUP_MANAGE],
  restore_operator: [CAP.RESTORE_USE],
});
```
→ Gate is `hasInstanceRole(user.id, CAP.BACKUP_MANAGE)` on both run routes; Super-Admin short-circuit is implicit via `capabilitiesFor` — never a role-string check.

---

### `server.js` — audit_log writes (D-20)

**Analog:** server.js:5444-5452 (guard-refuse audit) and :5483-5490 (same-tx audited write):

```js
await db.tx(async () => {
  await db.run(
    'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
    [uid(), row.id, row.id, `group_membership_removed:group:${guid}:lost-claim`, 0, clientIp(req), wsId, row.name, row.email, row.name, row.email, now()],
  );
});
```
→ Refused-trigger audit rows use the same column vocabulary with a backup-specific `action` slug (e.g. `backup_run_refused:<reason>`), `uid()` id, `clientIp(req)`, `now()`. Same-tx discipline (AUD-01) applies wherever a mutation accompanies the row; a pure refusal write may use the single-run tx shape at :5446.

---

### `src/core/api.js` — run calls (client API module)

**Analog:** `src/core/api.js:429-431, 436-444`:
```js
async backupTasks({ signal } = {}) {
  return call('GET', '/api/backup/tasks', undefined, { signal });
},
async instanceRoleGrant(userId, role) {
  return call('POST', '/api/backup/tasks', ...); // shape shown from :439-441
  return call('POST', '/api/auth/operator/instance-roles', { userId, role });
},
```
→ Add `backupRun(scope, { signal })` → `call('POST', '/api/backup/runs', { scope }, { signal })` and `backupRunCurrent({ signal })` → `call('GET', '/api/backup/runs/current', undefined, { signal })`. All refusals flow through `call()`'s central handling — no bespoke error parsing.

---

### `src/actions/actions.js` — trigger/poll actions (store/actions)

**Analog:** `src/actions/actions.js:4718-4743` — the exact fill-loop + retry pattern to extend:
```js
let backupFillSeq = 0;
let backupInflight = null;
export async function refreshBackupTasks() {
  if (!api.enabled) return null;
  const my = ++backupFillSeq;
  backupInflight?.abort();
  backupInflight = new AbortController();
  const res = await api.backupTasks({ signal: backupInflight.signal });
  if (my !== backupFillSeq) return null;
  if (res.ok) {
    S.ui.backupTasks = { tasks: res.data.tasks || [], canBackup: !!res.data.canBackup, canRestore: !!res.data.canRestore };
    S.ui.backupErr = null;
  } else {
    if (res.status !== 401) S.ui.backupErr = { status: res.status };
    return null;
  }
  render();
  return S.ui.backupTasks;
}
A.backupRetry = () => {
  S.ui.backupErr = null; // CR-01: recovery goes through the explicit retry action
  render();
  refreshBackupTasks();
};
```
→ Add `A.backupRunNow` (trigger, reads scope picker from S.ui) + `A.backupPollTick` (interval poll of backupRunCurrent → S.ui.backupRun; stops on done|failed). The seq+AbortController anti-stale pattern carries over; D-27's "no auto-poll" note is superseded here by D-07 (poll IS the design) — poll only while a run is active.

---

### `src/pages/backup.js` — Run now card + progress (component)

**Analog:** the file itself — extend, don't restructure. Render-only doctrine (backup.js:10-19):
```js
/* The page renders ONLY from the GET /api/backup/tasks response and
   its capability flags (D-23/T-85-06 doctrine: payload flags are
   verbatim chrome decisions — the client never derives roles). ... All
   payload strings render through esc() — text nodes only, no raw
   interpolation (T-79-10). */
```
Fullstate shapes (:30-33) stay verbatim; the D-20 empty state at :57-59 becomes the Run now card + stage progress. Stage/stage-labels render from the `/api/backup/runs/current` payload only — never derived client-side (85 D-23).

---

### `backup-run-state.js` (new) — in-memory run holder

**Closest shape:** module-level holder with claim-before-first-await (Pitfall 5) and keyed stage transitions — mirror the Phase 85 in-memory module style (85-CONTEXT "Established Patterns"). Shape:
```js
// module-scoped: { runId, scope, stage, startedAt, filename?, sha256?, error? } | null
// claimRun() sets synchronously before any await → concurrency refusal is race-free (D-10)
```
No in-repo server-side in-memory holder matched exactly; actions.js:4718-4724 (seq/inflight pair) is the nearest client-side shape. Planner follows research Pattern 4.

---

### Tests (new)

**Analogs:** `test/export-mspdi.test.mjs` (writer/golden-output pins), `test/instance-roles-api.test.mjs` (route gate + keyed refusal pins), `test/pg-matrix.test.mjs` (opt-in dual-engine parity, skips without `POSTGRES_TEST_URL` — :1-24 pattern). Wave-0 golden ustar fixture asserts `tar xzf` round-trip (BKBCK-01 criterion 1). Run via `node --test test/backup-export.test.mjs` / `npm test`.

---

## Shared Patterns

### Keyed refusal vocabulary
**Source:** `server.js:7753/7759/7776/7779` (`fail(res, status, code, message)`) + `src/locales/*.json` `err.<code>` keys
**Apply to:** every new refusal in the run routes — `backupRunInProgress` (D-10), scope refusals (D-17), `tooManyAttempts` (D-21), `backupRoleRequired` (D-22).
**Hard rule (STATE.md):** every new err code lands with all 5 locales (en/fr/nl/de/es) in the SAME commit as the first emitting gate — error-codes.test.mjs / i18n-scan enforce it.

### Route guard order (never reorder)
**Source:** `server.js:7752-7779, 7783-7787`
`sameOrigin → requireUser → throttle → capability gate → scope lookup → action`. Signup comment (:7783-84): sameOrigin before body read AND throttle so a cross-origin POST can't consume budget.

### Capability gate via roles.js funnel
**Source:** `roles.js:24-41` + `hasInstanceRole` (server.js:5018)
**Apply to:** both `/api/backup/runs` routes — `CAP.BACKUP_MANAGE`, never role strings.

### Audit-log same-tx write
**Source:** `server.js:5444-5452, 5483-5490`
**Apply to:** refused trigger attempts (D-20) — bad role, concurrent run, bad scope.

### Dual-engine fence
**Source:** `db-adapter.mjs:503-525` (pg checked-out client) + server.js `VACUUM INTO` CLI idiom
**Apply to:** all snapshot reads in export/backup.js; row reads identical on both engines, only the fence differs (research Pattern 2). Dual-mirror pin tests required for both backends.

### Server-only export module
**Source:** `export/mspdi.js:1-9` header convention
**Apply to:** `export/backup.js` — repo ROOT, block-comment header with phase/facts/zero-dep statement, never under `src/`.

### Render-only payload doctrine
**Source:** `src/pages/backup.js:10-19, 30-33`
**Apply to:** all Backup page additions — stage/chrome from payloads, `esc()` on all payload strings.

### Throttle helper
**Source:** `server.js:5076` `tooMany(key, max, windowMs)` + usage at :7787
**Apply to:** `backuprun|${user.id}` on POST /api/backup/runs (D-21).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `export/backup.js` — ustar tar writer | utility | streaming | No archive writer in repo; only tar consumption (`vacuum into`, `--backup` CLI). Hand-rolled per D-33-11; golden round-trip test is the verification contract. |
| `export/backup.js` — two-pass staged pipeline | service | streaming/file-I/O | No staged-archive precedent; research Pattern 1 + Pitfalls 1-3, 6-7 are the spec. |
| NDJSON dumper + manifest schema | service | transform | No NDJSON precedent; field layout within agent's discretion (CONTEXT), frozen facts from CONTEXT/RESEARCH. |

## Metadata

**Analog search scope:** repo root (`export/`, `src/`, `test/`, root modules)
**Files scanned:** ~15 (4 read in full or targeted, verified via grep anchors)
**Pattern extraction date:** 2026-11-21
**Tracked-source gate:** all named analogs verified git-tracked via `git ls-files`
