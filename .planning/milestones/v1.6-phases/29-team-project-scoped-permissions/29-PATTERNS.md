# Phase 29: Team/Project-Scoped Permissions - Pattern Map

**Mapped:** 2026-11-02
**Files analyzed:** 10 (2 modified server-side funnels, 1 migration, 1 new test file, 4 client surfaces, 2 extended test files)
**Analogs found:** 10 / 10 — this phase is composition of two existing precedents (v1.1 private-project redaction + Phase 28 authority routes); almost nothing is net-new.

**Key architectural fact (verified in-repo):** there is no per-project REST endpoint family. All project data flows through `GET/PUT /api/workspaces/:slug` (funneled through `redactDoc`/`mergeClientDoc`). The route sweep = extend the two shared funnels + four named side doors (`serveFileBinary`, `runReminderPass`, `queueNotifEmails`, invite pair).

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` — scope column migration | migration | batch | `ensureColumn` (server.js:255) + `invites.teams` column (P28 D-07) | exact |
| `server.js` — `projectScope()`/`inScopeProject()` helpers | utility (authz) | transform | `canSeeProject` (server.js:602) + `teamsOfUser` (server.js:1185) | exact |
| `server.js` — `hiddenProjectIds()`/`canSeeProject()` extension | middleware (authz funnel) | request-response | itself (server.js:602–659) — self-extension | exact |
| `server.js` — `mergeClientDoc()` write guard | middleware (write funnel) | CRUD | itself (server.js:792–824) — signature/derivation extension | exact |
| `server.js` — `PUT /members/:uid/scope` route | route | request-response | `wsMemberTeamsMatch` PUT route (server.js:3506–3543) | exact |
| `server.js` — invite-carried scope | route | request-response | invite POST teams validation (server.js:3614–3632) + accept (server.js:3784–3798) | exact |
| `server.js` — `serveFileBinary` scope check | route (side door) | file-I/O | itself (server.js:4033–4055) — insert one visibility check before streaming | exact |
| `src/actions/actions.js` — send-time filters (assign :100, mentions :139–157, watchers :163) | client hook | event-driven (pub) | itself + `assignableInProject` (store.js:430) | role-match |
| `src/overlays/modals.js` — inviteModal scope section + memberTeams modal scope editor | component | CRUD | Phase 28 inviteModal teams picker / memberTeams team multi-select (extend, don't rebuild) | role-match |
| `test/scope.test.mjs` (new, Wave 0) | test | request-response | `test/membership.test.mjs` (isolated-server harness pattern) | exact |
| `test/migration.test.mjs` (extend) | test | batch | itself — column-pin + byte-identical second-boot assertions | exact |

All analogs verified git-tracked (`git ls-files`): server.js, src/actions/actions.js, src/core/store.js, test/membership.test.mjs, test/migration.test.mjs, test/helpers/server.mjs.

---

## Pattern Assignments

### 1. Scope column migration (SCOPE-01, D-02)

**Analog:** `ensureColumn` — server.js:255–258 (verbatim)

```js
function ensureColumn(conn, table, name, def) {
  const cols = conn.prepare(`pragma table_info(${table})`).all();
  if (!cols.some(c => c.name === name)) conn.exec(`alter table ${table} add column ${name} ${def}`);
}
```

**Copy:** `ensureColumn(db, 'memberships', 'scope', 'text'); ensureColumn(db, 'invites', 'scope', 'text');` — JSON-string column, null = workspace-wide. No backfill. Byte-identical second boot is automatic; pin it by extending `test/migration.test.mjs` (its fixture captures `pragma table_info` per table *before* boot — lines 27–43 — then asserts columns exist after; mirror that for `scope`).

---

### 2. Scope predicate helpers (SCOPE-01/02, D-01/D-03/D-04)

**Analog A — the predicate being extended:** `canSeeProject` + `hiddenProjectIds` — server.js:595–605, 653–659 (verbatim)

```js
function projectIsPrivate(p) {
  if (!p || typeof p !== 'object') return false;
  if (typeof p.private === 'boolean') return p.private;
  return p.access === 'private';
}
function canSeeProject(p, memberId) {
  if (!projectIsPrivate(p)) return true;
  return !!memberId && Array.isArray(p.members) && p.members.includes(memberId);
}
function hiddenProjectIds(doc, memberId) {
  const seen = new Set();
  for (const p of doc?.data?.projects || []) {
    if (p?.id && !canSeeProject(p, memberId)) seen.add(p.id);
  }
  return seen;
}
```

**Analog B — team-set reader to consume:** `teamsOfUser` — server.js:1185–1190 (verbatim)

```js
function teamsOfUser(workspaceId, userId) {
  return db
    .prepare('select team_id from team_members where workspace_id = ? and user_id = ? order by team_id')
    .all(workspaceId, userId)
    .map(r => r.team_id);
}
```

**Compose:** place `projectScope(membership)` → `null | { teams:[], projects:[] }` and `inScopeProject(p, scope)` right beside `canSeeProject` (after server.js:610). Rules copied from decisions:
- D-04: `projectScope` returns null whenever `ROLE_RANK[membership.role] >= ROLE_RANK.admin` regardless of stored JSON.
- D-03: for scoped members the grant short-circuits the private check — visibility = `inScope(p) && (scope.projects.includes(p.id) || teamReach(p, scope) || !projectIsPrivate(p) || p.members.includes(memberId))`. Do **not** compose as `canSeeProject(p) && inScope(p)` — that breaks the private-project guest.
- Unknown/dangling ids in scope JSON are naturally no-ops (id simply won't match) — Pitfall 6 handled for free.
- Write the truth table into the plan: public+in / public+out / private+in-on-list / private+in-off-list (D-03 ⇒ visible) / private+out.

**Critical:** both read (`redactDoc`, server.js:731–735) and write (`mergeClientDoc`, server.js:799) call `hiddenProjectIds(stored, memberId)` — extending that ONE function filters 9 dependent lists at once (tasks, comments, files, activity, notifs, events, savedViews, filters, recentSearches per server.js:736–753). Never build a second pipeline.

---

### 3. Write guard extension (SCOPE-02, Pitfall 2)

**Analog:** `mergeClientDoc` entry — server.js:792–805 (verbatim)

```js
function mergeClientDoc(incoming, stored, membership) {
  const next = incoming && typeof incoming === 'object' ? JSON.parse(JSON.stringify(incoming)) : {};
  next.data = next.data && typeof next.data === 'object' ? next.data : {};
  normalizeProjects(stored);
  normalizeProjects(next);
  const memberId = membership?.member_id || null;
  const role = membership?.role || 'member';
  const hiddenProjects = hiddenProjectIds(stored, memberId);
  ...
  const reservedTasks = hiddenTaskIds(stored, hiddenProjects);
  for (const t of nextData.tasks || []) if (t?.id && hiddenProjects.has(t.project)) reservedTasks.add(t.id);
```

**Copy:** `membership` is ALREADY passed in — derive scope from it (role via `membership.role`, teams via `teamsOfUser(ws.id, membership.user_id)`) with **no signature change**. Minimal diff: make `hiddenProjectIds` accept an optional membership/scope, or add `hiddenFor(stored, membership)` and swap both call sites (799 here + 734 in redactDoc) to it. Reserved rows cannot be resurrected by a stale client doc PUT.

---

### 4. Scope-edit route (SCOPE-01, D-04, D-12)

**Analog:** `wsMemberTeamsMatch` PUT route — server.js:3500–3543 (verbatim skeleton)

```js
const wsMemberTeamsMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})\/members\/([A-Za-z0-9_-]{1,64})\/teams$/);
if (wsMemberTeamsMatch && method === 'PUT') {
  const ctx = requireWorkspace(req, res, wsMemberTeamsMatch[1], 'admin');
  if (!ctx) return;
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const body = await readJson(req);
  ...
  if (!Array.isArray(body?.teams)) return fail(res, 400, 'teamsRequired', 'Provide a teams array');
  if (body.teams.length > 25) return fail(res, 400, 'tooManyTeams', 'Too many teams');
  // Whitelist: every team id must be a team defined in the workspace document (T-28-02).
  const known = new Set((JSON.parse(ctx.ws.doc)?.data?.teams || []).map(t => t?.id).filter(Boolean));
  const teams = [...new Set(body.teams.map(t => String(t).slice(0, 40)))];
  if (teams.some(t => !known.has(t))) return fail(res, 400, 'unknownTeam', 'Unknown team');
  transaction(() => { /* authority rows only */ });
  ...
  return json(res, 200, { member });  // NOTE: no `revision` claim — doc untouched
}
```

**Copy for `PUT /api/workspaces/:slug/members/:uid/scope`:**
- Same gate order: `requireWorkspace('admin')` → `sameOrigin` → `readJson` → `notAMember` 404.
- Validate `scope.projects` against the doc's `data.projects` ids the exact same way as teams (trim/slice/Set-dedup/cap — mirror both the 25 cap and whitelist-vs-doc).
- D-04: target role is admin/owner ⇒ fail 400 (`scopeNotAllowed`) or force null — planner picks; **also** clear scope in the member PATCH promotion transaction (server.js:3470 role-update site).
- Doc + revision untouched; respond with `member` payload, no `revision` claim (comment at 3500–3505 documents why).
- D-05: `memberPayload` (server.js:1202) must never include other members' scope — only the member's own, if projected at all.

---

### 5. Invite-carried scope (SCOPE-05/06, D-09/D-13)

**Analog A — validation:** invite POST — server.js:3611–3629 (verbatim)

```js
/* D-07: an invite carries the full team set. Validation mirrors the PUT
   members/:uid/teams route exactly (T-28-07): per-item trim + 40-char
   slice, Set-dedup, whitelist against the doc's team definitions, cap 25.
   An absent teams field degrades to the empty set (D-03), not an error. */
if (body?.teams !== undefined && !Array.isArray(body.teams)) return fail(res, 400, 'teamsRequired', 'Provide a teams array');
```

**Analog B — acceptance:** server.js:3784–3798 (verbatim shape)

```js
if (!membershipOf(ws.id, user.id))
  addMembership(
    ws,
    user,
    invite.role,
    (() => { try { return JSON.parse(invite.teams || '[]'); } catch { return []; } })(),
  );
```

**Copy:** add `scope` beside `teams` on the invite POST with identical validation; store JSON in `invites.scope`; acceptance parses it defensively exactly like `invite.teams` and passes it into `addMembership(ws, user, invite.role, teams, scope)` — extend `addMembership` (server.js:2042) with a 5th parameter defaulting to `null`/`undefined` so existing callers are untouched; write scope onto the membership row in the same transaction. D-13 lives in validation: guest invites are `role='viewer'` with scope `{projects:[exactly one]}` — enforce at invite creation, never via a new ROLE_RANK entry.

---

### 6. File-serve side door (SCOPE-02/03, Pitfall 3)

**Analog:** `serveFileBinary` — server.js:4033–4055 (verbatim head)

```js
async function serveFileBinary(req, res, slug, id) {
  const ctx = requireWorkspace(req, res, slug, 'viewer');
  if (!ctx) return;
  let record = null;
  try {
    const files = JSON.parse(ctx.ws.doc)?.data?.files;
    record = Array.isArray(files) ? files.find(f => f?.id === id) : null;
  } catch { /* fall through to the 404 */ }
  const file = path.join(FILES_DIR, id);
  if (!record || path.dirname(file) !== FILES_DIR) return fail(res, 404, 'fileNotFound', 'File not found');
  ...
  if (!stat?.isFile()) return fail(res, 404, 'fileNotFound', 'File not found');
```

**Copy:** after record lookup, check `record.project` against the caller's visible set (same `hiddenProjectIds`-derived set); out-of-scope ⇒ `fail(res, 404, 'fileNotFound', 'File not found')` — byte-identical to unknown id (no oracle). This closes a pre-existing gap: the record lookup currently has NO project-visibility check.

---

### 7. Client send-time filters (SCOPE-04, D-07)

**Analog:** `src/actions/actions.js` — assign notify :100, `emitMentions` :139–157, `taskWatchers` :163–165 (verbatim excerpt)

```js
if (tk.assignee) notifyMembers([tk.assignee], { type: 'assign', by: D().me, task: tk.id, project: tk.project, snippet: fmtDate(tk.due) || '' });
...
if (np.mention_team !== false) {
  for (const tid of teamIds)
    (D().members || []).forEach(m => {
      if (memberTeams(m).includes(tid) && m.status === 'active') targets.add(m.id);
    });
}
```

**Copy:** these are Set-based target builders — add a scope-eligibility pre-filter to the Set construction (targets whose scope excludes the task's project are skipped), mirroring the `assignableInProject` predicate pattern (store.js:430). Enforcement is send-time only (D-07); the notifications LIST is never client- or server-filtered. Server guards are the authority: `runReminderPass` skips out-of-scope assignees; `queueNotifEmails` (server.js:~901) filters defensively. Open tension (research A4): D-05 hides scope details, so eligibility must come from a server-projected boolean or from "member would see this project" derived from projected data — planner decides.

---

### 8. UI surfaces (D-09/D-10/D-11)

**Analogs (verified in-repo):** both admin surfaces live in `src/overlays/modals.js` — the invite form is `inviteModal` (modals.js:236, already carrying the Phase 28 teams picker) and the member edit path is the `memberTeams` modal (modals.js:67, Phase 28 team multi-select), with submit actions in `src/actions/teams.js`. Extend both with a scope section expressing the same data: teams[] + projects[] by name, stored as ids. All new strings enter the EN+FR locale catalogues — `src/locales/en.json` and `src/locales/fr.json` (loaded via `src/core/i18n.js`) — at write time (milestone gate). No self-indicator for the scoped member (D-11), no new UI mode (D-08).

---

### 9. Tests (SCOPE-01..06 — the 404-matrix)

**Analog:** `test/membership.test.mjs` (verbatim head)

```js
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { ADMIN, client, inviteToken, login, signup, startServer, withDb } from './helpers/server.mjs';
...
before(async () => {
  server = await startServer();
  const signedIn = await login(server.base, ADMIN.email, ADMIN.password);
  owner = signedIn.client;
  bob = (await signup(server.base, ACCOUNT('Bob', 'bob@test.local'))).client;
  ...
});
after(async () => { await server?.stop(); });
```

**Harness helpers** (`test/helpers/server.mjs`): `startServer()` (isolated ephemeral port + DATA_DIR), `client()` (cookie jar), `login()`, `signup()`, `withDb()` (direct DB assertions on `memberships.scope`), `inviteToken()`. Note the throttle budget comment pattern at the top of membership.test.mjs (invite accepts = 5/IP/hour — budget the accepts in the suite).

**Matrix structure (research Pitfall 7):** table-driven — family → probe (in-scope id / out-of-scope id / unknown id) → expected status, one fixture member; unknown ≡ out-of-scope byte-identical (same status AND same error code). Families: doc GET omission, doc PUT rejection/rollback, file serve 404, reminder pass skip, plus the D-03 truth table and D-04 forced-null.

**Migration pin:** extend `test/migration.test.mjs` — it already captures `pragma table_info` per table pre-boot (lines 30–40) and reboots against a caller-supplied dataDir for byte-identical second boot; add `scope` to the memberships/invites column assertions.

---

## Shared Patterns

### Gate order on every new/extended route
**Source:** server.js:3508–3514 — `requireWorkspace(slug, minRole)` → `sameOrigin` → `readJson` → entity 404 → validation 400s. Reuse existing `fail()` error codes verbatim (`notAMember`, `unknownTeam`, `crossOriginRejected`); out-of-scope by-id ⇒ the route's normal 404 code (`fileNotFound` for files, `notFound`-class elsewhere), never 403.

### Authority rows + doc mirror
**Source:** `addMembership` (server.js:2042–2071) and the teams-route comment (3500–3505). Membership facts (role, teams, now scope) live in SQLite authority rows; the doc profile is a repaired-on-read mirror (`syncProfiles`, server.js:1261). Scope never touches the workspace doc or its revision.

### Transaction discipline
`transaction(() => {...})` for multi-statement writes (server.js:3448, 3521); `db.exec('begin immediate')` + rollback on early return in the invite route (3648). Scope writes follow the same shape.

---

## No Analog Found

None — every sub-problem has an in-repo precedent. The genuinely new semantic is only the D-03 grant inversion (scope *opens* private projects); its mechanics are a one-function composition, proven by the truth-table test.

## Metadata

**Analog search scope:** server.js (targeted reads: 215–268, 595–824, 2042–2071, 3432–3571, 3603–3662, 3746–3805, 4033–4077), src/actions/actions.js (95–189), test/helpers/server.mjs (full), test/membership.test.mjs (head), test/migration.test.mjs (head)
**Files scanned:** 8 (all git-tracked, verified)
**Pattern extraction date:** 2026-11-02
