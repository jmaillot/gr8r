# Phase 49: Visibility model collapse & grant materialization - Pattern Map

**Mapped:** 2026-11-07
**Files analyzed:** 12 (3 new, 9 modified)
**Analogs found:** 12 / 12 (all in-place edits use themselves as the analog; new files matched to proven templates)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` — sweep function (new, in-file) | migration | batch | `migrateTenancy` + notif-prefs backfill (`server.js:2236-2269, 2276-2308`) | exact |
| `server.js` — predicates/funnel (edit) | service | request-response | self (`server.js:751-951`) | self |
| `server.js` — send-time consumers (edit) | service | event-driven | self (`server.js:1296-1372, 1462-1491, 1594-1613`) | self |
| `server.js` — `mergeClientDoc` guard (edit) | middleware | request-response | self (`server.js:1170-1195`) | self |
| `mcp.js` — `canReadProject` mirror (edit) | service | request-response | self (`mcp.js:176-231`) | self |
| `test/visibility-migration.test.mjs` (new) | test | batch | `test/migration.test.mjs` (whole file, esp. :27-51 harness, :435-469 byte-identity) | exact |
| `test/helpers/legacy-fixture.mjs` or new fixture builder (new) | test utility | file-I/O | `createLegacyDb` consumer pattern in `migration.test.mjs:10, 29` | role-match |
| `test/scope.test.mjs` (rewrite) | test | request-response | `test/privacy.test.mjs` funnel-test shape (:232-268) | role-match |
| `test/privacy.test.mjs` (extend) | test | request-response | self | self |
| `test/mcp.test.mjs` (add parity test) | test | request-response | `test/migration.test.mjs` + existing mcp suites | role-match |
| `test/due-reminders.test.mjs`, `test/digest.test.mjs` (canary, no edits expected) | test | event-driven | self | self |
| `test/membership.test.mjs`, `test/invite-revision.test.mjs` (scope-write assertions die with route) | test | CRUD | self | self |

All analogs verified git-tracked (`git ls-files`): `server.js`, `mcp.js`, `test/migration.test.mjs`, `test/privacy.test.mjs`, `test/mcp.test.mjs`, `test/scope.test.mjs`.

---

## Pattern Assignments

### Sweep function (new, inside `server.js` near migrateTenancy) — (migration, batch)

**Analog:** `server.js:2236-2269` (notif-prefs guarded backfill — the closest shape: backup → tx → doc+row mutation atomic) and `server.js:2276-2308` (`migrateTenancy` — guard-and-skip idempotence).

**Guarded backup pattern** (:2237-2249) — copy verbatim with a new prefix, e.g. `projects-pre-visibility-`:
```js
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.join(DATA_DIR, `projects-pre-visibility-${stamp}.db`);
try {
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  await sqliteOnly(async () => {
    await db.run('pragma wal_checkpoint(truncate)');
    await db.run(`vacuum into '${backup.replaceAll("'", "''")}'`);
  }, `pre-migration backup ${backup}`);
  logInfo(`  pre-migration backup: ${backup}`);
} catch (err) {
  logError(`  pre-migration backup failed: ${err.message}`);
  return; // "no backup = no mutation"
}
```

**Work-needed guard (idempotence)** — copy the `rows.some(...)` shape (:2278):
```js
const rows = await db.all('select * from workspaces');
if (!rows.some(row => sweepNeeded(JSON.parse(row.doc)))) return; // D-49-6: no p.teams, no p.access, no non-NULL scope
```

**Atomic doc+rows transaction** (:2262-2267) — D-11 precedent, exactly the sweep's doc-write + scope-column-clear atomicity:
```js
await db.tx(async () => {
  // per-workspace: materialize p.members, normalize p.access, delete p.teams
  const stripped = { ...ws.doc, data: { ...ws.doc.data } };
  await db.run('update workspaces set doc = ? where id = ?', [JSON.stringify(stripped), ws.id]);
  await db.run('update memberships set scope = null where workspace_id = ?', [ws.id]);
  await db.run('update invites set scope = null where workspace_id = ?', [ws.id]);
});
```

**Doc parse discipline** (:2293-2298): parse stored doc in try/catch, fall back defensively — the sweep must apply the same per-doc guard.

**user_id → member_id mapping pattern** (:884-887, the query the sweep expands from):
```js
const mRow = memberId
  ? await db.get('select user_id from memberships where workspace_id = ? and member_id = ?', [membership.workspace_id, memberId])
  : null;
// team_members is user_id-space; p.members is member_id-space (Pitfall 3)
```
Sweep expansion is the inverse join: `team_members.user_id → memberships.member_id` per workspace.

**CRITICAL — do NOT call `normalizeProjects` from the sweep (D-49-8):** `normalizeProjects` (:909-943) un-seals private projects with empty members (:931-936 pushes ownerId / flips `private = false`). The sweep must be append-only on `p.members` and write the doc raw, exactly like the notif-prefs backfill writes `stripped` directly (:2264-2266).

---

### `server.js` predicate collapse (edit) — (service, request-response)

**Analog:** the files themselves; excerpts pin the exact current bodies.

`projectIsPrivate` (:751-755) — delete line 754 only (D-49-4):
```js
function projectIsPrivate(p) {
  if (!p || typeof p !== 'object') return false;
  if (typeof p.private === 'boolean') return p.private;
  return p.access === 'private';   // ← DELETE this line
}
```

`memberCanReadProject` (:786-794) — body collapses; keep `async` (recommended, ~5 awaiting callers at :890, :1370, :1487, :1606 + mcp parity):
```js
async function memberCanReadProject(p, wsId, memberId, liveTeams = null) {
  if (canSeeProject(p, memberId)) return true;
  if (!p || !wsId || !memberId) return false;
  // team resolution (:789-793) dies; return false
}
```

`hiddenFor` (:872-902) — delete the scoped branch (:895-901), the `teamsOfUser` lookup (:884-887) and `projectScope` call (:873); the null-scope admin/non-admin shape survives with the funnel reduced to `canSeeProject`.

**Deletion targets (whole symbols):** `teamIntersects` (:773-775), `projectScope` + `CORRUPT_SCOPE_WARNED` (:812-837), `inScopeProject` (:840-844), `scopeGrants` (:864-870). Copy their comment discipline when replacing: every surviving edit keeps a dated block comment explaining the invariant (house style throughout server.js).

`normalizeProjects` edit (:916-923) — delete the `p.team`→`p.teams` migration block AND the `if (!Array.isArray(p.teams)) p.teams = []` / filter lines, otherwise the D-49-6 byte-identical marker breaks (Pitfall 4). KEEP the un-sealing safety net (:926-936) — it is D-49-8's live-read behavior, only the sweep must avoid it.

---

### Send-time consumers (edit) — (service, event-driven)

**Analog:** the three sites themselves; the edit is identical everywhere — delete the scope prefix, keep the helper:

Reminder pass (:1480, :1487):
```js
// BEFORE
if (!inScopeProject(project, projectScope(assigneeMembership))) continue;
if (!projectScope(assigneeMembership) && !(await memberCanReadProject(project, ws.id, t.assignee))) continue;
// AFTER
if (!(await memberCanReadProject(project, ws.id, t.assignee))) continue;
```
Digest loop (:1605-1606): same two deletions. Email mirror (:1354-1370): delete the `recipientScope` branch (:1357-1362) and the `scopeByMember` map (:1300-1302); keep the null-scope `memberCanReadProject` gate (:1370) as the sole gate.

**Phase 37/38 canary:** `test/due-reminders.test.mjs` + `test/digest.test.mjs` must pass unmodified.

---

### `mergeClientDoc` assignee guard (edit) — (middleware, request-response)

**Analog:** `server.js:1176-1192`. The `assignmentScope`/`inScopeProject` throw (:1185-1191) is built on dying machinery. Cheap replacement reusing the collapsed funnel (Pitfall 8):
```js
if (!(await memberCanReadProject(projectById.get(t.project), wsId, t.assignee))) {
  const err = new Error("Assignee cannot read the task project");
  err.code = 'assigneeOutOfScope';
  throw err;
}
```
Keep the guard's comment shape (authority-not-advisory rationale, :1170-1175).

---

### `mcp.js` mirror (edit) — (service, request-response)

**Analog:** `mcp.js:180-189`. Rewrite in place; NEVER import server.js. Keep the mirror function (distinct ctx plumbing: `ctx.user.id`, `ctx.membership`).

```js
// AFTER (team query + intersection at :187-188 deleted):
async function canReadProject(ctx, p) {
  if (!p || typeof p !== 'object') return false;
  if ((ROLE_RANK[ctx.membership.role] || 0) >= ROLE_RANK.admin) return true;
  const priv = typeof p.private === 'boolean' ? p.private : p.access === 'private'; // drop the p.access half per D-49-4
  if (!priv) return true;
  const mid = ctx.membership.member_id;
  return !!mid && Array.isArray(p.members) && p.members.includes(mid);
}
```
Callers at :194-231 (`visibleProjects`, `readableProjectIds`, `visibleTasks`, `findVisibleTask`, `findVisibleProjectRef`) are untouched. Parity test pins server ≡ mirror on the same fixture doc (Pitfall 2).

---

### `test/visibility-migration.test.mjs` (new) — (test, batch)

**Analog:** `test/migration.test.mjs` — copy its whole architecture:

**Harness pattern** (:16-51): tmpdir via `fs.mkdtempSync` → `createLegacyDb(dataDir)` (or the new visibility fixture builder) → capture pre-boot snapshot → `startServer({ dataDir })` → `after` asserts the harness never deletes a caller-supplied dir, then cleans up:
```js
let dataDir; let server;
before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-visibility-migration-'));
  createVisibilityFixtureDb(dataDir); // legacy rows + doc carrying p.teams/p.access/scope columns
  server = await startServer({ dataDir });
});
after(async () => {
  await server?.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
});
```

**Row-inspection helpers** (:22-25):
```js
const workspaceRow = () => withDb(server.dbPath, db => db.prepare('select * from workspaces where id = ?').get('ws_x'));
const backups = () => fs.readdirSync(dataDir).filter(n => n.startsWith('projects-pre-visibility-') && n.endsWith('.db'));
```

**Second-boot byte-identity pattern** (:435-443):
```js
const firstBoot = snapshot();
await server.stop();
server = await startServer({ dataDir });
assert.deepEqual(snapshot(), firstBoot, 'no drift');
assert.equal(snapshot().backups.length, 1, 'no second backup'); // D-49-6
```

**Set-equality fixture** — build the OLD-predicate visibility map (member × project matrix per RESEARCH §Fixtures) BEFORE boot from raw DB rows, assert it equals the NEW-predicate map after one boot. Expected values come from the model table, never from `memberCanReadProject` (Pitfall 6).

---

### `test/scope.test.mjs` (rewrite), `test/mcp.test.mjs` (parity), `test/privacy.test.mjs` (extend)

**Analog for the 404/funnel test shape:** `test/privacy.test.mjs:232-268` — fixture projects written by the owner (:225), then per-actor full-document GET with string-absence assertions (`jsonHas` needles) and view/filter scrub checks. New matrix rows follow this exact shape: non-invitee member × private project → doc GET, file serve, and each MCP read tool → byte-identical 404/empty body (body-equality asserted, not just status). The parity test in mcp.test.mjs mirrors migration.test.mjs's harness (same fixture, two engines, `assert.deepEqual` on visibility sets).

---

## Shared Patterns

### Guarded additive migration (backup → guard → tx → idempotence)
**Source:** `server.js:2236-2308`, proven by `test/migration.test.mjs:435-482`
**Apply to:** the sweep function and its migration test
- "no backup = no mutation" (`return` in the catch, :2248)
- `sqliteOnly` wrapper around SQLite-only pragmas (:2241-2244) — pg path needs a documented snapshot fallback (A6)
- doc mutation + column mutation in ONE `db.tx` (:2262-2266)
- second boot finds nothing to do → zero writes, no second backup (D-49-6 marker: absence of `p.teams` everywhere + all scope NULLs + no `p.access`)

### db-adapter portability (Phase 45 invariant)
**Source:** all `db.get`/`db.all`/`db.run`/`db.tx` usage quoted above
**Apply to:** every sweep statement — text ids, integer epochs, `run()` returns exactly `{ changes }`, no SQLite-only pragma inside the per-workspace tx (the `vacuum into` stays behind `sqliteOnly`).

### Defensive parse (fail-open, house style)
**Source:** `projectScope` JSON parse (:816-829) — the sweep re-parses stored scope JSON to re-derive old-visible grants; unreadable scope under the OLD model meant workspace-wide, so materialization must reproduce that, not skip.

### Comment discipline
**Source:** every quoted block (e.g. :765-772, :846-853)
**Apply to:** every surviving edited region keeps a dated block comment stating the invariant and the decision id (D-49-1..8). Deletions need no comment.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `test/helpers/` legacy visibility fixture builder | test utility | file-I/O | No existing fixture carries `p.teams` + scope columns + `p.access` docs together; build new following `createLegacyDb` usage pattern (migration.test.mjs:10, :29) |

## Metadata

**Analog search scope:** `server.js`, `mcp.js`, `test/*.test.mjs`
**Files scanned:** 10 read this session (server.js ×7 ranges, mcp.js ×1, migration.test.mjs ×2, privacy.test.mjs ×1)
**Pattern extraction date:** 2026-11-07
