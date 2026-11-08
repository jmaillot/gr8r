# Phase 52: Transparency view & milestone verification sweep - Pattern Map

**Mapped:** 2026-11-08
**Files analyzed:** 8 (3 modified code, 1 new test, 1 modified test helper, 1 potential catalogue-pin touch, 2 docs)
**Analogs found:** 6 / 8 (docs refresh and locale files are format-only analogs)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` (+1 GET route + reason helper, beside funnel ~:771-848) | route/controller (in monolithic if-chain) | request-response | `server.js:4900-4948` member-teams PUT route + `server.js:4658-4668` doc-GET | exact (same chain, same gate shape) |
| `server.js` (+module-scope reason helper) | utility | transform | `server.js:800-818` (`canSeeProject` + `memberCanReadProject`) | exact |
| `src/pages/members.js` (expansion UI on member rows) | component | request-response (fetch-on-open) | same file — `pageMembers()` rows `:63-84`, `S.ui.memberRevoke` state pattern `:77-79`, `pendingInvites` fetch pattern `:40` | exact |
| `src/locales/en.json` / `fr.json` (+ reason + a11y keys) | config (i18n catalogue) | static | same files (flat `"key": "value"`, `{n}` placeholders, plural objects) | format-only |
| `test/transparency.test.mjs` (NEW) | test (integration) | request-response | `test/mcp.test.mjs:610-770` Phase 49/50 parity harness (`parSetup`/`parVisibleDocIds` + `VISIBILITY_MODEL` assertions) | exact |
| `test/helpers/visibility-fixture.mjs` (extended cells) | test-helper (fixture + oracle) | batch (static data) | same file — `VIS_ACTORS`/`VIS_PROJECTS`/`USERS`/`visfixDoc()` structure `:34-100` | exact |
| `test/catalogue.test.mjs` (possible pin bump) | test (static parity) | batch | existing catalogue tests | format-only |
| `docs/WorkspacePermissions.md` / `docs/ProjectPermissions.md` (sweep refresh, French) | docs | static | Phase 50/51 doc-refresh convention (live-tree file:line refs re-verified at doc time, 51-04) | role-match (docs only) |

All named analogs verified git-tracked (`git ls-files`).

## Pattern Assignments

### `server.js` — new GET route (controller, request-response)

**Analog:** `server.js:4900-4948` — the member-teams route (`/api/workspaces/:slug/members/:memberId/teams`). This is the CLOSEST structural match: same URL family (workspace + memberId path param), admin-gated, resolves the target user + membership, and reads back from the authority.

**Route chain + admin gate pattern** (lines 4906-4914):
```js
const wsMemberTeamsMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})\/members\/([A-Za-z0-9_-]{1,64})\/teams$/);
if (wsMemberTeamsMatch && method === 'PUT') {
  const ctx = await requireWorkspace(req, res, wsMemberTeamsMatch[1], 'admin');
  if (!ctx) return;
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const target = await db.get('select * from users where id = ?', [wsMemberTeamsMatch[2]]);
  const row = target ? await membershipOf(ctx.ws.id, target.id) : null;
  if (!target || !row) return fail(res, 404, 'notAMember', 'That person is not a member of this workspace');
```
Copy for the new visibility route: identical match/gate/refusal order; drop `sameOrigin` only if copying the GET posture — the neighboring doc-GET (`server.js:4658-4668`) skips it:
```js
const wsMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})$/);
if (wsMatch && method === 'GET') {
  const ctx = await requireWorkspace(req, res, wsMatch[1]);   // default 'viewer'; pass 'admin' explicitly
  if (!ctx) return;
  return json(res, 200, { ... });
}
```
(A2 in RESEARCH.md: either is compliant; copying the admin gate from the teams route with `sameOrigin` is the safest.)

**Keyed 404 / neutral-response pattern:** `fail(res, 404, 'notAMember', ...)` at :4914. Per the security note (no existence oracle), the new endpoint should return the same keyed shape for unknown member ids — if a NEW fail code is introduced it MUST be added to the error-codes catalogue (`test/error-codes.test.mjs` enforces static parity both directions). Reusing an existing code avoids the catalogue edit.

**Route ordering (Pitfall 4):** insert the new `pathname.match(...) && method === 'GET'` branch adjacent to the member/workspace structured routes (~:4900-4950 region), NOT after the greedy doc-GET or file-serve branches. `test/file-route-ordering.test.mjs` guards this.

### `server.js` — reason-derivation helper (utility, transform)

**Analog:** the funnel itself — `server.js:771-818`. The helper must MIRROR (never modify) this short-circuit order.

**Core pattern to copy** (lines 800-805):
```js
function canSeeProject(p, memberId, memberTeams = []) {
  if (!projectIsPrivate(p)) return true;                       // → reason 'everyone'
  if (!memberId) return false;
  if (Array.isArray(p.members) && p.members.includes(memberId)) return true;  // → 'lead' | 'member'
  return Array.isArray(p.teams) && p.teams.length > 0 && memberTeams.some(t => p.teams.includes(t)); // → 'team'
}
```

**The funnel the endpoint must call for accessibility** (lines 813-818):
```js
async function memberCanReadProject(p, wsId, memberId) {
  if (canSeeProject(p, memberId)) return true;
  if (!Array.isArray(p?.teams) || !p.teams.length || !wsId || !memberId) return false;
  const memberTeams = await teamsOfMember(wsId, memberId, null);
  return canSeeProject(p, memberId, memberTeams);
}
```

**Live teams, no memoization (D-50-3/D-50-5)** — resolve teams ONCE per member per request, the way `hiddenFor` does (lines 840-844):
```js
const memberTeams = await teamsOfMember(membership.workspace_id, memberId, membership);
for (const p of doc?.data?.projects || []) {
  if (p?.id && !canSeeProject(p, memberId, memberTeams)) seen.add(p.id);
}
```
`teamsOfMember` signature (lines 785-793): `async (wsId, memberId, membershipRow)` — pass `null` row when the caller doesn't hold the memberships row.

**Lead-label gotcha (Pitfall 2):** `normalizeProjects` line 867 guarantees `p.lead ∈ p.members`:
```js
if (p.lead && !p.members.includes(p.lead)) p.members.push(p.lead);
```
So within the membership tier, test `p.lead === memberId` BEFORE `p.members.includes(memberId)` to emit 'lead' — a label refinement inside the same funnel outcome, NOT a predicate change. Comment it as such.

**Anti-pattern:** never edit `canSeeProject`/`memberCanReadProject`/`hiddenFor`/`normalizeProjects` — Phase 49/50 pinned tests guard them byte-for-byte in behavior.

### `src/pages/members.js` — expansion UI (component, request-response)

**Analog:** same file. Three patterns to copy:

**1. isAdmin gating + S.ui state toggle** (lines 37, 75-81 — `memberRevoke` confirm flow is the state pattern for the open-expansion state):
```js
const isAdmin = isMemberAdmin();               // line 37
...
isAdmin && m.userId
  ? S.ui.memberRevoke === m.id
    ? `<span class="row" ...>confirm UI</span>`
    : `<button class="btn btn-secondary btn-sm" data-a="memberRevokeAsk" data-id="${esc(m.id)}">...</button>`
  : ''
```
Copy: store the open member id in `S.ui` (e.g. `S.ui.memberVisibility === m.id`), gate the expander control on `isAdmin`, toggle via a `data-a="..."` action with `data-id="${esc(m.id)}"`.

**2. Fetch-on-open via the `api` helper** — the `pendingInvites` pattern (line 40):
```js
const pending = api.enabled ? u.pendingInvites || [] : [];
```
The expansion fetches on EVERY open (D-52-3) via `api.get('/api/workspaces/...')` from `../core/api.js` (imported at line 24). Never reuse `visibleProjects()` (line 65) for the transparency list — that is the member's own redacted client view and is FORBIDDEN as the list source (anti-pattern in RESEARCH.md).

**3. Row rendering + a11y** (lines 67, 81): rows carry `data-ctx="member" data-id="${m.id}"`; expansion renders as an extra `<tr>` or detail panel inside the `.perm-t` table; labels through `t('...')` (imported line 23) with `esc()` for any server-provided names; `aria-label` via i18n keys (see `t('a11y.memberOptions')` line 81).

### `test/transparency.test.mjs` — new test (integration)

**Analog:** `test/mcp.test.mjs:610-770` — the Phase 49/50 parity harness. Copy its structure, adapted to plain HTTP GET (no MCP):

**Fixture boot + login + oracle assertion** (lines 678-691, 738-747):
```js
const parSetup = async () => {
  parDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-visibility-parity-'));
  createVisibilityFixtureDb(parDir);
  parServer = await startServer({ dataDir: parDir });
  for (const mid of PAR_ACTORS) {
    const session = await login(parServer.base, parEmailOf(mid), VIS_PASSWORD);
    ...
  }
};
before(parSetup);
after(async () => { await parServer?.stop(); if (parDir) fs.rmSync(parDir, { recursive: true, force: true }); });

test('parity fixture: server doc-GET sets equal the D-50-5 hand-derived model for every actor', async () => {
  for (const mid of PAR_ACTORS) {
    const { status, ids } = await parVisibleDocIds(mid);
    assert.deepEqual(ids, [...VISIBILITY_MODEL[mid]].sort(), `${mid}: server set matches the D-50-5 model`);
  }
});
```

**Redacted-doc fetch helper** (lines 725-728) — the second parity leg (D-52-8: complement of the hidden set):
```js
const parVisibleDocIds = async mid => {
  const res = await parKeys[mid].client.get(`/api/workspaces/${VIS_WS.slug}`);
  return { status: res.status, ids: (res.data?.doc?.data?.projects || []).map(p => p.id).sort() };
};
```

**Imports** (line 620): `import { createVisibilityFixtureDb, MIRROR_MODEL, VISIBILITY_MODEL, VIS_ACTORS, VIS_PASSWORD, VIS_WS } from './helpers/visibility-fixture.mjs';`
Server harness: `startServer`, `login`, `client` from `test/helpers/server.mjs`.

**ANTI-TAUTOLOGY CONTRACT** (fixture lines 5-8): `VISIBILITY_MODEL` is hand-derived; "Consumers must not derive expectations from memberCanReadProject (server.js) or canReadProject (mcp.js)". Assertions go oracle-vs-endpoint, never code-vs-code.

**Documented-divergence precedent** (test/mcp.test.mjs:772-779): when the two readings legitimately differ, pin the divergence explicitly as a named test — that is the pattern for the admin-target question (Pitfall 1).

### `test/helpers/visibility-fixture.mjs` — extended cells

**Analog:** same file, `:34-100`. Copy the established structure:
- `VIS_ACTORS` / `VIS_PROJECTS` as frozen id arrays (`:40-54`)
- `USERS` map with per-user `{ userId, email, name, role, roleLabel }` (`:61-74`)
- `profile(id, extra)` factory (`:76-93`) and `visfixDoc()` storing the raw doc (`:98+`)
- Every new cell gets a header comment explaining the cell under test (style of the `m_doconly` comment, `:68-73`).

Cells to ADD (D-52-9): private+lead-only access (lead NOT in `p.members` before normalization), D-51-4 lost-visibility case, admin-viewing-another-admin, admin×team-only divergence cell (if Open Question 1 resolves to (a) — recommended).

### `src/locales/en.json` / `fr.json` — i18n keys (config)

**Analog:** the files themselves. Format (en.json:1-29): flat `"dotted.key": "value"`, `{n}`/`{name}` placeholders, plural objects only where needed (`"task.count": { "one": "...", "other": "..." }`). Add reason keys (e.g. `page.members.visReason.*` for everyone/lead/member/team) + a11y keys for the expander; mirror in `fr.json`. Gate: `npm run i18n:scan` must exit 0 (0 dead keys); `scripts/i18n-scan.mjs` scans `src/ + server.js + mailer.js`; check whether `test/catalogue.test.mjs` pins an exact key count and update the pin if so (Pitfall 3).

### Docs sweep — `docs/WorkspacePermissions.md`, `docs/ProjectPermissions.md`

**Analog:** 50-04/51-04 convention — docs are French, cite `server.js:NNN-NNN` refs verified against the live tree at doc time. Since this phase inserts a route, line numbers shift: grep each cited symbol fresh before re-citing. Preserve French typography. Verification is read-only re-run of existing gates (D-52-11, no new script):
```bash
npm test
npm run i18n:scan
node --check server.js
```

## Shared Patterns

### Admin server-side gate (51-02 convention: client gate is UX, server refusal is the control)
**Source:** `server.js:4908-4910`
**Apply to:** the new route (and mirror with `isMemberAdmin()` in the UI)
```js
const ctx = await requireWorkspace(req, res, wsMatch[1], 'admin');
if (!ctx) return;
if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
```

### One-funnel doctrine
**Source:** `server.js:813-818` (`memberCanReadProject`), oracle contract `test/helpers/visibility-fixture.mjs:5-8`
**Apply to:** the endpoint (calls the funnel per project; never a second predicate) and the tests (assert against `VISIBILITY_MODEL`, never against the code under test).

### Keyed fail() responses + error-code catalogue parity
**Source:** `server.js:4914`; enforced by `test/error-codes.test.mjs`
**Apply to:** the new route — reuse an existing code if possible; catalogue any new code both directions.

### i18n gate (EN+FR on every user-facing string)
**Source:** `src/locales/en.json` format; `scripts/i18n-scan.mjs` (gated in prebuild); `test/catalogue.test.mjs`
**Apply to:** reason labels, expander a11y strings, empty-state strings.

### Verify commands (D-52-11 — verbatim, no aggregate script)
**Source:** `package.json:9-19`
**Apply to:** the sweep task only.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| reason-label i18n keys | config | static | No existing "access reason" vocabulary; compose new keys on the existing dotted-key/plural conventions above |
| docs v2.0 model refresh | docs | static | Format analogs exist (French docs with live refs) but content is per-phase original |

## Metadata

**Analog search scope:** `server.js` (funnel ~:771-950, routes ~:4650-4950), `src/pages/`, `src/locales/`, `test/helpers/`, `test/mcp.test.mjs`, `docs/`
**Files scanned:** ~10 (targeted reads; no full-tree sweep needed — RESEARCH.md had pre-located the anchors)
**Pattern extraction date:** 2026-11-08
