# Phase 50: Invite hierarchy & per-project toggles (server) - Pattern Map

**Mapped:** 2026-11-08
**Files analyzed:** 11 (2 modified core, 7 test files, 2 docs)
**Analogs found:** 11 / 11 — this phase is a coordinated edit of an existing single-file server; every "new" behavior has an in-repo analog. There are NO greenfield files.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` — visibility funnel (restore team term) | service / predicate | request-response | `server.js` :749-799 (`canSeeProject`/`memberCanReadProject`/`hiddenFor`) + deleted-in-49 `teamIntersects` re-derivation via `team_members` join (sweep :2285-2292 shows the join direction) | exact (edit-in-place) |
| `server.js` — reverse-sweep boot migration (D-50-6) | migration | batch | `server.js` :2205-2288 `sweepNeeded`/`materializeVisibilityGrants` | exact |
| `server.js` — guest normalization migration (D-50-10) | migration | batch | same sweep template; target transformation modeled on `inviteRole()` :3050-3055 (`guest→viewer`) | exact |
| `server.js` — `mergeClientDoc` pinning (`p.teams`, `p.allowInviteGuests`) | middleware (doc-merge) | transform | `server.js` :995-1009 reserved-row pinning block | exact |
| `server.js` — invite creation route (VIS-04 member guest path) | controller / route | request-response | `server.js` :4940-5019 `POST /api/workspaces/:ws/invites` | exact (extend) |
| `server.js` — invite accept route (fail-closed re-derivation) | controller / route | request-response | HARD-02 block :5121-5125 (per RESEARCH, verified pattern) | exact (extend) |
| `server.js` — toggle flip + scope/status surface (D-50-1/2/8) | controller / route | CRUD | `PATCH /api/workspaces/:ws/members/:uid` :4764-4801 (hierarchy guards) | role-match |
| `mcp.js` — `canReadProject` mirror | service / predicate (mirror) | request-response | `mcp.js` :176-200 `canReadProject`/`visibleProjects` | exact (edit-in-place, lockstep) |
| `test/invite-hierarchy.test.mjs` (NEW) | test | integration | `test/visibility-migration.test.mjs` (boot-real-server harness pattern) + `test/membership.test.mjs` | role-match |
| `test/helpers/visibility-fixture.mjs` (extend) | test fixture | batch | itself — 13-cell matrix + anti-tautology oracle (:1-21) | exact |
| `test/visibility-migration.test.mjs`, `mcp.test.mjs`, `membership.test.mjs`, `hardening.test.mjs`, `privacy.test.mjs` (extend) | test | integration | themselves (each pins a family this phase touches) | exact |
| `docs/ProjectPermissions.md`, `docs/WorkspacePermissions.md` (update) | docs | — | themselves — update the predicate wording in-phase | exact |

All paths above verified git-TRACKED (`git ls-files` — all printed).

## Pattern Assignments

### Visibility funnel restoration — `server.js` + `mcp.js` (INV-03 / D-50-5)

**Analog (current collapsed form):** `server.js:749-774`

```js
/* [2026-11-07 D-49-4] Visibility is the boolean `private` flag only. */
function projectIsPrivate(p) {
  if (!p || typeof p !== 'object') return false;
  return p.private === true;
}
function canSeeProject(p, memberId) {
  if (!projectIsPrivate(p)) return true;
  return !!memberId && Array.isArray(p.members) && p.members.includes(memberId);
}
async function memberCanReadProject(p, wsId, memberId) {
  if (canSeeProject(p, memberId)) return true;
  return false;
}
```

**Copy:** keep the same funnel signature (`memberCanReadProject` stays `async` — every consumer already awaits it, :769 comment). Add the team term inside `canSeeProject`/`memberCanReadProject`: `private ∨ memberId ∈ p.members ∨ member's team ∈ p.teams`. The memberId→user_id→team resolution direction is documented by the Phase 49 sweep (:2287-2292):

```js
/* team_members is user_id-space; p.members is member_id-space — the
   inverse of hiddenFor's join (server.js:884-887, Pitfall 3). */
const userToMember = new Map(memberships.filter(m => m.member_id).map(m => [m.user_id, m.member_id]));
```

Resolve the user_id once at `requireWorkspace`/`hiddenFor` (which already receive the membership row) — NOT per-route queries.

**MCP mirror (edit in the SAME commit):** `mcp.js:182-189` is the hand-maintained copy:

```js
async function canReadProject(ctx, p) {
  if (!p || typeof p !== 'object') return false;
  if ((ROLE_RANK[ctx.membership.role] || 0) >= ROLE_RANK.admin) return true;
  const priv = p.private === true;
  if (!priv) return true;
  const mid = ctx.membership.member_id;
  return !!mid && Array.isArray(p.members) && p.members.includes(mid);
}
```

Add the same team term here; extend `test/mcp.test.mjs` parity (the fixture header :12-21 documents the pre-existing admin/owner mirror drift — planner must decide align-vs-preserve, Open Question 2).

### Reverse-sweep boot migration (D-50-6) — copy `materializeVisibilityGrants` verbatim mechanics

**Analog:** `server.js:2230-2288`. Copy exactly:

1. **Marker-guard first** (candidate scan, zero writes when clean — :2237-2239):
```js
if (sweepNeeded(row.doc, scopeRowCount)) candidates.push(row.id);
// ...
if (candidates.length === 0) return; // D-49-6: fully swept → zero writes, no backup
```
   ⚠️ Anti-pattern (RESEARCH Pitfall 1): `sweepNeeded` (:2212-2217) treats any non-empty `p.teams` as a pre-sweep marker and the sweep body does `delete p.teams` — the Phase 49 sweep must be retired/gated in the SAME phase or the next boot erases every restored link.
2. **Backup: "no backup = no mutation"** (:2241-2255):
```js
const backup = path.join(DATA_DIR, `projects-pre-visibility-${stamp}.db`);
try {
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  await sqliteOnly(async () => {
    await db.run('pragma wal_checkpoint(truncate)');
    await db.run(`vacuum into '${backup.replaceAll("'", "''")}'`);
  }, `pre-migration backup ${backup}`);
} catch (err) {
  logError(`  pre-migration backup failed: ${err.message}`);
  return; // never mutate without a snapshot
}
```
   New name: `projects-pre-team-link-<stamp>.db` (a NEW backup prefix — the byte-identity pin counts backups by prefix, see `test/visibility-migration.test.mjs:52` `VIS_BACKUP_PREFIX = 'projects-pre-visibility-'`).
3. **Per-workspace `db.tx` with in-tx re-read** (:2262-2271):
```js
for (const wsId of candidates) {
  await db.tx(async () => {
    const row = await db.get('select doc from workspaces where id = ?', [wsId]);
    doc = JSON.parse(row?.doc);
    /* ...deterministic transformation... */
```
4. **Raw `JSON.stringify(doc)` write — NO `normalizeProjects` call** (D-49-8 sealed private-empty discipline; RESEARCH Pitfall 3).

The same template drives the D-50-10 guest normalization (`member/invites role 'guest'→'viewer'`, a table+doc transform; new marker, e.g. `sweepNeeded`-style guest-scan; second-boot no-op pin).

### Reserved-row pinning — `mergeClientDoc` (`p.teams`, `p.allowInviteGuests`)

**Analog:** `server.js:995-1009`. Extend the exact block:

```js
if (prev && !canManageProject(prev, memberId, role)) {
  // Access fields belong to a manager even when the project is visible.
  p.private = prev.private;
  p.members = prev.members;
  p.perms = prev.perms;
  p.lead = prev.lead;
}
```

Add `p.teams = prev.teams;` and `p.allowInviteGuests = prev.allowInviteGuests;` to this block. Anti-pattern to avoid (D-49-1's bug class): letting a stale client doc PUT delete a team link or flip the toggle.

`normalizeProjects` discipline: only normalize what is present — do NOT re-add `teams:[]` churn (D-49-6 second-boot byte-identity; RESEARCH anti-pattern 2). The reverse sweep owns the field's return.

### Invite creation route — member guest-invite path (VIS-04 / D-50-7/8/9)

**Analog:** `server.js:4940-5019`. Key mechanics to copy:

```js
const ctx = await requireWorkspace(req, res, wsInviteMatch[1], 'admin');   // :4942 — currently admin-gated
const role = inviteRole(body?.role);                                       // :4947
/* teams validation: trim+slice(0,40), Set-dedup, whitelist vs doc teams, cap 25 */  // :4952-4966
if (ROLE_RANK[role] >= ROLE_RANK.admin && emails.length === 0) {
  return fail(res, 400, 'inviteAdminEmailRequired', 'Admin invites must be sent to an email address');  // :4991-4993
}
await db.tx(async () => { /* batch insert, one tx per batch */ });          // :5003
const token = crypto.randomBytes(24).toString('base64url');                 // :5015
```

Extension shape: lower the gate to member-tier with role-conditional validation — member ⇒ viewer role only, `body.project` required, and the toggle gate: `p.allowInviteGuests === true` on the referenced project (default OFF per D-50-7). Team invites (admin/owner, D-50-9) bypass the toggle. Add a nullable `invites.project` column via the `ensureColumns` additive pattern (server.js:428-433).

**Fail-closed re-derivation at accept (D-50-8 stale-invite rule)** — copy the HARD-02 pattern (server.js:5121-5125, per RESEARCH §Pattern 2):

```js
if (ROLE_RANK[invite.role] >= ROLE_RANK.admin && !invite.email) return fail(res, 403, 'inviteAdminEmailRequired', ...);
```

Never trust the invite row for authorization — re-derive from CURRENT state at accept: the toggle is re-read from the current project doc, and owner-role acceptance re-checked (INV-01 point 3).

### Edit-hierarchy route (D-50-3/D-50-4) — pin, don't rebuild

**Analog:** `PATCH /api/workspaces/:ws/members/:uid` — server.js:4774-4797 (per RESEARCH, verified):

```js
if (actorRank < ROLE_RANK.owner && roleRank(row.role) >= ROLE_RANK.admin) {
  return fail(res, 403, 'ownerManagedRoles', 'Only an owner can manage admins and owners');
}
if (nextRole !== row.role && nextRole === 'owner' && actorRank < ROLE_RANK.owner) {
  return fail(res, 403, 'ownerTransferOnly', 'Only an owner can transfer ownership');
}
```

D-50-4's stricter hierarchy (admins can't edit admins) is this block plus a test pin. No role caching exists — `requireWorkspace` resolves `membershipOf` per request (:3158). Do NOT add memoization (RESEARCH anti-pattern 4).

`inviteRole()` (server.js:3050-3055) is the intake hierarchy point and the guest-normalization shape:

```js
function inviteRole(value) {
  const role = String(value || '').toLowerCase();
  if (role === 'admin' || role === 'member' || role === 'viewer') return role;
  if (role === 'guest') return 'viewer';
  return 'member';
}
```

### Test patterns

**Boot-real-server migration harness** — `test/visibility-migration.test.mjs:1-50`:
- boots the real server against a planted raw-SQLite fixture (`before`/`after`, `withDb` from `test/helpers/server.mjs`);
- asserts on-disk state BEFORE boot (migration input), post-boot state, per-actor visibility against an independent oracle, and second-boot byte-identity with EXACTLY ONE `projects-pre-visibility-` backup. Copy this five-assertion structure for the reverse sweep (new backup prefix) and the guest normalization.

**404-matrix fixture with anti-tautology contract** — `test/helpers/visibility-fixture.mjs:1-21`:

```js
/* ANTI-TAUTOLOGY CONTRACT: VISIBILITY_MODEL and MIRROR_MODEL below are
   hand-derived ... They NEVER call memberCanReadProject (server.js) or
   canReadProject (mcp.js); consumers must not derive expectations from
   production code either. */
```

Extension rule: add team-link cells to the matrix with HAND-DERIVED expectations (from the D-50-5 predicate written in the fixture header), never read from production code. Re-derive the 404 matrix for team-linked cells BEFORE implementing (PITFALLS 404-matrix-first rule).

**New `test/invite-hierarchy.test.mjs`** (Wave 0 gap): copy the `startServer`/`login` helper usage from `test/membership.test.mjs`; structure as an INV-01 three-point matrix (create/edit/accept) + VIS-04 toggle twins (OFF blocks new member invite; stale invite accept fails closed; existing members untouched).

## Shared Patterns

### Single visibility funnel + lockstep MCP mirror
**Source:** `server.js:771-774`, `mcp.js:182-189`
**Apply to:** every read surface this phase touches (doc GET, reminders, digest, email mirror, MCP tools). Never scatter per-route checks; change both files in the same commit; extend the parity test.

### Guarded boot migration (backup → tx → marker → 2nd-boot no-op)
**Source:** `server.js:2230-2288`
**Apply to:** both new migrations (D-50-6 reverse sweep, D-50-10 guest normalization). Raw doc writes only; no `normalizeProjects` inside the sweep; new marker per migration; byte-identity pin.

### Fail-closed re-derivation at accept
**Source:** HARD-02 block `server.js:5121-5125`; legacy-invite boot neutralization `server.js:5940-5943`
**Apply to:** stale guest invite after toggle flip (D-50-8); owner-role acceptance (INV-01 point 3). Authorization derives from CURRENT state, never the invite row.

### Reserved-row pinning in `mergeClientDoc`
**Source:** `server.js:998-1004`
**Apply to:** `p.teams` and `p.allowInviteGuests` join the non-manager pinned set alongside `p.private/p.members/p.perms/p.lead`.

### Refusal shape
**Source:** all cited routes use `return fail(res, <status>, '<camelCaseKey>', '<message>')` (e.g. :4992 `inviteAdminEmailRequired`, :4775 `ownerManagedRoles`).
**Apply to:** every new refusal (toggle gate, hierarchy edits, scope/status route).

## No Analog Found

| File/Concern | Role | Data Flow | Reason |
|------|------|-----------|--------|
| Reverse-sweep provenance reconstruction | migration logic | batch | No per-entry provenance exists anywhere (Phase 49 wrote grants silently, :2425-2432, and `p.teams` is deleted). Planner must pick the source: pre-sweep backup DBs when present + documented fail-open fallback (RESEARCH Open Question 1). No code to copy — this is a decision, flagged for human-verify. |
| `p.allowInviteGuests` toggle semantics | route gate | request-response | First real per-project boolean gate in the codebase (`permGuests` was cosmetic). Mechanics copy from existing route guards, but the create-AND-accept dual evaluation point is new. |

## Metadata

**Analog search scope:** `server.js` (targeted ranges), `mcp.js`, `test/` (fixtures + harnesses), `docs/`
**Files scanned:** 8 (all excerpts verified in source this session; RESEARCH line numbers confirmed)
**Pattern extraction date:** 2026-11-08
**Tracked-source gate:** all analog paths verified via `git ls-files` — no mirror paths
