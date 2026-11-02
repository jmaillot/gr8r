# Phase 28: Multi-Team Membership - Pattern Map

**Mapped:** 2026-11-01
**Files analyzed:** 8 (modified-only phase — no brand-new files except possibly one test file)
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` — SCHEMA + `migrateTeamMembership()` backfill | migration | batch | `migrateTenancy()` (server.js:1361-1391) + `openDb()` ensureColumn block (server.js:228-259) | exact |
| `server.js` — new membership-edit routes (`/members/:uid/teams`) | route | request-response | `wsMemberMatch` PATCH route (server.js:2887-2951) + `wsInviteMatch` POST (server.js:2998-3087) | exact |
| `server.js` — read projection `teams[]` on members | model/projection | CRUD | `syncProfiles()` (server.js:1150-1182), `memberPayload()` (1103-1119), `memberProfile()` (1742-1758) | exact |
| `server.js` — `addMembership`/invite-accept gains team rows | service | CRUD (transactional) | `addMembership()` (server.js:1788-1806), invite POST transaction (3025-3055) | exact |
| `server.js` — delete `syncMemberTeams()`, stop accepting `body.team` | — (deletion) | — | n/a (removal task; excerpts below show what to delete) | — |
| `src/core/api.js` — `setMemberTeams()` etc. | client API wrapper | request-response | `setMember`/`removeMember` (api.js:330-343) | exact |
| `src/actions/teams.js` — per-member multiselect via API | component/action | request-response | its own current doc-mutating code (teams.js:29-31, 74-84, 112-114) → replaced by api.js call pattern | role-match |
| `src/actions/actions.js` — member edit modal picker + `emitMentions` predicate | component/action | request-response + transform | `emitMentions` Set-targeting (actions.js:137-152) | exact |
| `src/data/seed.js` — member team arrays | config/seed | batch | projects' `teams: [...]` array shape already in seed.js:111,132,152 | role-match |
| `test/migration.test.mjs` (extend) | test | batch | its own existing structure (fixture + `startServer({ dataDir })` + withDb asserts) | exact |
| `test/membership.test.mjs` (extend) / possible new team-membership test | test | request-response | existing invite/roster HTTP tests (membership.test.mjs:21-76) | exact |

## Pattern Assignments

### Migration: `team_members` table + backfill (server.js)

**Analog:** `migrateTenancy()` (server.js:1361-1391) and the `ensureColumn` sequence (server.js:236-256)

**Backup pattern — copy verbatim** (lines 1363-1373):
```js
if (rows.some(row => !row.slug)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(DATA_DIR, `projects-premultitenant-${stamp}.db`);
  try {
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    db.exec('pragma wal_checkpoint(truncate)');
    db.exec(`vacuum into '${backup.replaceAll("'", "''")}'`);
    console.log(`  pre-migration backup: ${backup}`);
  } catch (err) {
    console.error(`  pre-migration backup failed: ${err.message}`);
  }
```
For Phase 28: guard = "any row to backfill" (e.g. `select 1 from memberships where team is not null limit 1`), backup name `projects-pre-team-members-${stamp}.db`. Only back up once — guard the whole migration on a real existence check (empty `team_members` is NOT a sufficient guard because a fresh workspace legitimately has zero rows; prefer a guarded marker such as checking whether the backfill already ran via an existence predicate the planner defines, mirroring how `migrateTenancy` guards on `!row.slug`).

**SCHEMA table pattern — copy shape from `memberships`** (lines 156-162):
```sql
create table if not exists memberships (
  workspace_id text not null references workspaces(id) on delete cascade,
  user_id      text not null references users(id) on delete cascade,
  role         text not null check (role in ('owner','admin','member','viewer')),
  member_id    text,
  primary key (workspace_id, user_id)
);
```
Note: `memberships.team` is **not** in this SCHEMA block — it exists only via `ensureColumn(db, 'memberships', 'team', 'text')` at server.js:242. The backfill must run AFTER that ensureColumn line inside `openDb()` (or defensively tolerate a missing column).

**Column-add ordering pattern** (lines 236-256): every new column def must be byte-identical to its SCHEMA declaration (comment at line 245-246, "Pitfall P-B"). For `invites.teams` (D-07): add to SCHEMA create block AND `ensureColumn(db, 'invites', 'teams', 'text')` right after line 243, with a JSON-array column (text storing JSON).

**Transaction pattern for the backfill** — `begin immediate` / commit / rollback, from `addMembership` (lines 1794-1804):
```js
db.exec('begin immediate');
try {
  /* ...row writes... */
  db.exec('commit');
} catch (err) {
  db.exec('rollback');
  throw err;
}
```
(The shared `transaction(fn)` helper is used in the member PATCH route at line 2903 — prefer it for new code.)

---

### New membership-edit route (server.js)

**Analog:** `wsMemberMatch` PATCH route (server.js:2887-2951) — the closest existing admin-gated per-member write route.

**Route + gate + guard order pattern** (lines 2887-2899):
```js
const wsMemberMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})\/members\/([A-Za-z0-9_-]{1,64})$/);
if (wsMemberMatch && (method === 'PATCH' || method === 'DELETE')) {
  const ctx = requireWorkspace(req, res, wsMemberMatch[1], 'admin');
  if (!ctx) return;
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const target = db.prepare('select * from users where id = ?').get(wsMemberMatch[2]);
  const row = target ? membershipOf(ctx.ws.id, target.id) : null;
  if (!target || !row) return fail(res, 404, 'notAMember', 'That person is not a member of this workspace');
  /* tier rule: only owners manage admins/owners (lines 2896-2898) — membership
     routes probably do NOT need this (any admin may edit teams), decide explicitly */
```

**Input slicing/validation pattern** (lines 2910-2920): read `await readJson(req)`, coerce with `String(x).slice(0, N)`, validate against known values (`if (!(nextRole in ROLE_RANK)) return fail(res, 400, 'unknownRole', ...)`). For teams: validate each team id against doc `teamsList()` (whitelist, not pass-through), cap array length.

**Transaction + response pattern** (lines 2903-2907, 2934-2950):
```js
transaction(() => {
  db.prepare('delete from memberships where workspace_id = ? and user_id = ?').run(ctx.ws.id, target.id);
  updateDoc(ctx.ws.id, doc => stripMember(doc, row.member_id, target.id));
});
return json(res, 200, { removed: true, userId: target.id, revision: wsRevision(ctx.ws.id) });
```
Key decision per research Open Question 2: membership-only routes replace `updateDoc` with pure `team_members` row writes inside the same `transaction(...)` helper and return the updated `memberPayload(...)` WITHOUT a doc revision claim (never touch the doc → other sessions' pending writes survive → TEAM-05).

**Transaction-replacement example — the invite POST pattern for multi-row inserts** (lines 3025-3055): `db.exec('begin immediate')` → loop inserting one row per item → commit/rollback. Use this shape (or `transaction()`) when inserting one `team_members` row per accepted team (D-07).

---

### Read projection: member `teams[]` (server.js)

**Analog:** `syncProfiles()` (server.js:1150-1182) — the authority-repairs-doc read path to extend.

**Current authority join + doc repair** (lines 1152-1171):
```js
const rows = db.prepare(
  `select m.user_id, m.role, m.member_id, m.team, u.name, u.email
     from memberships m join users u on u.id = m.user_id
    where m.workspace_id = ?`,
).all(workspaceId);
const byUser = new Map(rows.map(r => [r.user_id, r]));
for (const profile of doc.data.members) {
  ...
  profile.team = row.team || null;   // ← replace with teams[] projection from team_members
```
Change: add a second query `select team_id, user_id from team_members where workspace_id = ?`, group into `Map<user_id, string[]>`, and write `profile.teams = teamMap.get(row.user_id) || []` (keep `profile.team` untouched-or-dropped per D-04 — nothing reads it).

**Doc profile shape to keep** — `memberProfile()` (lines 1742-1758): replace line 1751 `team: row.team || null` with a `teams: [...]` projection (needs the join-table rows passed in, like `index` is today).

**API payload** — `memberPayload()` (lines 1103-1119): line 1112 `team: profile?.team ?? null` becomes `teams: profile?.teams || []` (this is what the members page and member edit modal consume).

**Scalar→array precedent (do it the same way projects did):** `projTeams()` tolerance in store.js (below) and `normalizeProjects` (server.js:544) — legacy scalar tolerated on read, array is the only written shape.

---

### Invite multi-team (server.js + api.js + form)

**Analog:** invite POST route (server.js:2998-3087) — already validates/normalizes arrays the same way `teams` will need:
```js
let emails = Array.isArray(body?.emails) ? body.emails : [];
emails = [...new Set(emails.map(e => String(e || '').trim().toLowerCase()).filter(Boolean))];
if (emails.length > 20) return fail(res, 400, 'inviteBatchLimit', ...);
```
(lines 3007-3019) — copy this Set-dedup + cap + per-item validation shape for `body.teams`. Insert statement currently binds scalar `team` (line 3039-3048) → bind JSON string of the array.

**Accept path:** `addMembership(ws, user, role, team)` (lines 1788-1806) — gains a sibling insert of one `team_members` row per team inside its existing `begin immediate` transaction (same function, same transaction).

**Client wrapper analog** — `src/core/api.js` (lines 330-336):
```js
async setMember(userId, patch) {
  const slug = state.workspace?.slug;
  if (!slug) return { ok: false, status: 0, error: t('err.noWorkspaceLoaded') };
  const r = await call('PATCH', `/api/workspaces/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}`, patch);
  if (r.ok) adoptRevision(r.data);
  return r;
},
```
New `setMemberTeams(userId, teams)` copies this shape; if the route returns no revision, do NOT call `adoptRevision` (mirror the revisionless handling of any non-doc route — verify against `revokeInvite`, api.js:373-377, which returns raw).

---

### Teams modal rewire (src/actions/teams.js)

**Analog:** the file's own current doc-mutating code — every excerpt below is a WRITE to delete/replace:

- Roster read from doc scalar (lines 29-31): `D().members.filter(m => m.team === t.id).map(m => m.id)` → becomes `(D().members.filter(m => (m.teams || []).includes(t.id)).map(m => m.id))`
- Diff-write on save (lines 74-76 + 81-84): `if (x.team === t.id && !f.members.includes(x.id)) x.team = '';` and `f.members.forEach(id => { const x = mem(id); if (x) x.team = t.id; })` → replaced by one `api.setMemberTeams(userId, teams)` call per changed member (or a batch route), inside the existing `mutate(() => {...})` envelope only for optimistic UI — the server call is the authority.
- Team delete cascade (lines 112-114): `D().members.forEach(x => { if (x.team === tm.id) x.team = ''; })` → must also call the API to purge `team_members` rows for `tm.id` (security requirement: no orphaned rows after doc team deletion).
- Roster count (line 98): `D().members.filter(x => x.team === tm.id).length` → `(m.teams || []).includes(tm.id)` predicate.
- Team definitions (id/name/color) stay doc-written exactly as today (lines 73, 78-79) — only membership moves out (D-02).

**UI action pattern to imitate** — `A.tformMember` (lines 46-51) is already a multi-select toggle:
```js
A.tformMember = el => {
  const l = S.ui.tform.members;
  S.ui.tform.members = l.includes(id) ? l.filter(x => x !== id) : [...l, id];
  render();
};
```
Reuse this toggle for the per-member team multiselect.

---

### Member edit modal picker + mention fan-out (src/actions/actions.js)

**Mention fan-out analog — the Set-targeting predicate change** (lines 137-152, verbatim current code):
```js
export function emitMentions(txt, tk) {
  const { memberIds, teamIds } = parseMentions(txt || '');
  const np = D().notifPrefs || {};
  const targets = new Set();
  if (np.mention_all !== false) memberIds.forEach(id => targets.add(id));
  if (np.mention_team !== false) {
    for (const tid of teamIds) (D().members || []).forEach(m => { if (m?.team === tid && m.status === 'active') targets.add(m.id); });
  }
```
Change is one predicate: `m?.team === tid` → `Array.isArray(m?.teams) && m.teams.includes(tid)`. Dedup stays free (Set).

**Member edit modal analog:** the modal already edits role via `api.setMember(userId, { role })` (api.js:330). D-06 means the same submit gains `teams` — either the same PATCH route accepts `teams` (server-side: role → doc update + revision; teams → team_members rows, no revision) or a second API call fires. Pitfall 3 (stale revision on hybrid endpoints) applies: if the PATCH touches the doc at all it must return `wsRevision()` (line 2936 pattern).

**Scalar-team sweep list (from research, grep-verified call sites):** actions.js:143 (mentions), 1874/1900 (invite create/resend `m.team || null`), 3352/3365, 1425 (project prefill `me().team ? [me().team] : []`); teams.js:30, 75, 98, 113. All convert to `teams[]` array reads; empty array is the valid teamless state (D-03; `NO_TEAM` pseudo-team in store.js already models it).

---

### Store accessors (src/core/store.js)

**Analog:** existing team accessors (lines 368-398) — mostly unchanged; the pattern to reuse is the scalar→array tolerance of `projTeams` (lines 390-395):
```js
export function projTeams(p) {
  if (!p) return [];
  if (Array.isArray(p.teams)) return p.teams.filter(Boolean);
  return p.team ? [p.team] : [];
}
```
Add a member-side mirror, e.g. `memberTeams(m)` with the same tolerance (`Array.isArray(m.teams) ? m.teams.filter(Boolean) : m.team ? [m.team] : []`) so client surfaces and the TEAM-04 intersection (`projTeams(p)` ∩ `memberTeams(m)`) share one predicate. `NO_TEAM` (lines 372-380) stays the teamless representation.

---

### Seed data (src/data/seed.js)

**Analog:** projects in the same file already use the target shape — `teams: ['eng', 'product']` (seed.js:132). Members currently carry the legacy scalar `team: 'product'` (seed.js:11, 23, 35...). Convert member seeds to `teams: ['product']` arrays (or `teams: []` for a teamless member) mirroring the project-side precedent. If demo mode exercises the API path, seed via the same insertion function the accept path uses.

---

### Tests

**Analog 1: `test/membership.test.mjs`** (lines 1-76) — HTTP-level lifecycle tests:
```js
import { ADMIN, client, inviteToken, login, signup, startServer, withDb } from './helpers/server.mjs';
...
server = await startServer();
owner = (await login(server.base, ADMIN.email, ADMIN.password)).client;
const res = await owner.post('/api/workspaces/acme/invites', { emails, role });
```
New TEAM-02..05 assertions copy this: POST the membership route as owner, GET the roster, assert `teams` arrays. The TEAM-05 concurrent-write regression uses the same harness: two `client`s from `login(...)`, one PUTs the doc while the other changes teams, then re-GET and assert membership survived.

**Analog 2: `test/migration.test.mjs`** (lines 1-60) — legacy-DB migration proof:
```js
import { createLegacyDb, LEGACY_PASSWORD } from './helpers/legacy-fixture.mjs';
import { login, startServer, withDb } from './helpers/server.mjs';
dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-migration-'));
createLegacyDb(dataDir);
legacyColumns = withDb(path.join(dataDir, 'projects.db'), db => ... pragma table_info ...);
server = await startServer({ dataDir });
```
Extend: fixture gains a member with a scalar `team` + one teamless member; assert `team_members` rows after first boot, exactly one `projects-pre-team-members-*` backup, and byte-identical second boot (existing second-boot comparison machinery in the same file covers the method).

## Shared Patterns

### Admin gate + sameOrigin + readJson
**Source:** server.js:2888-2892 (`wsMemberMatch` route)
**Apply to:** every new membership-edit route
```js
const ctx = requireWorkspace(req, res, wsMatch[1], 'admin');
if (!ctx) return;
if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
const body = await readJson(req);
```

### Transactional authority writes
**Source:** server.js:2903 (`transaction(...)` helper) and server.js:1794-1804 (`begin immediate` inline form)
**Apply to:** every `team_members` write (membership edits, invite accept, team-delete purge, migration backfill)

### Revision contract
**Source:** server.js:2907 / 2936 — doc-touching routes return `revision: wsRevision(ctx.ws.id)`; api.js:334 `adoptRevision(r.data)` adopts it.
**Apply to:** routes that edit the doc (member PATCH with role/title). Membership-only routes must NOT claim a revision (research Open Question 2) — and api.js wrappers for them must not call `adoptRevision`.

### Set-based dedup targeting
**Source:** src/actions/actions.js:140-143
**Apply to:** mention fan-out (TEAM-03) — only the membership predicate changes; do not add a new dedup mechanism.

### Scalar→array tolerant accessor
**Source:** src/core/store.js:391-395 (`projTeams`)
**Apply to:** new `memberTeams(m)` accessor and every former `m.team` read site.

### EN+FR catalogue strings
**Source:** existing usage throughout `src/actions/teams.js` (`t('err.teamNameRequired')`, `t('act.teams.membersWithoutTeam', { n })`)
**Apply to:** any new copy (multi-select labels, invite multi-team strings) — strings added to the catalogue at write time (milestone invariant).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| none | — | — | All surfaces have direct in-repo precedents: projects already did the scalar→array multi-team move (P3); memberships/invites are already authority tables. |

## Metadata

**Analog search scope:** `server.js`, `src/core/`, `src/actions/`, `src/data/`, `test/`
**Files scanned:** ~12 read in full or targeted; grep sweeps across src/ and server.js
**Pattern extraction date:** 2026-11-01
