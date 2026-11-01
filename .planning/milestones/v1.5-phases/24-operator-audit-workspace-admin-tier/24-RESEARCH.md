# Phase 24: Operator Audit & Workspace-Admin Tier - Research

**Researched:** 2026-10-31
**Domain:** SQLite audit logging (append-only, same-transaction), workspace-admin authorization tier, owner-facing trail view — extending an existing zero-dependency node:sqlite SPA
**Confidence:** HIGH (all claims verified against the live codebase this session; no external packages involved)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Audit storage model**
- **D-A1:** New dedicated `audit_log` table — `security_log` stays untouched (it keeps its `user_id … on delete cascade` for 2FA events; that cascade is exactly what AUD-03 forbids for audit rows).
- **D-A2:** Schema: id, actor_id, target_id, action verb, session_count, ip, workspace_id, created_at. actor_id/target_id are TEXT with **NO foreign keys** — rows survive user deletion and no cascade can ever touch them. — **Reversibility:** one-way — removing the no-FK choice after rows exist requires a data migration and redefines what deleted-user rows mean.
- **D-A3:** Name snapshots at insert: actor_name, actor_email, target_name, target_email snapshot columns written on every insert. The trail view renders straight from the row — no joins, deleted users always readable.
- **D-A4:** Append-only enforced in-app: no UPDATE/DELETE statement is ever written against audit_log anywhere in the code, plus a test asserting no route can mutate audit rows (criterion 5). No SQLite triggers.
- **D-A5:** `logSecurity()` and the existing `sessions_revoked_by_operator` verb in security_log stay as-is; the operator revoke route additionally writes the new audit row in the same transaction. Dual-write for that route (security_log keeps firing, audit_log added).

**Admin revocation route**
- **D-R1:** Route: `POST /api/w/:slug/members/:id/revoke-sessions` — workspace-scoped, gated server-side via the existing `resolveWorkspace(minRole:'admin')` pattern (server.js:1502).
- **D-R2:** Target tier: strictly below admin — a workspace admin may revoke members/viewers of their own workspace only; peer admins and owners are untouchable. Owner immunity and self-exclusion ride the same D-118/D-119 semantics as the operator route.
- **D-R3:** Same-transaction guarantee via explicit `BEGIN` / `COMMIT` with `ROLLBACK` on error wrapping DELETE + audit INSERT — applied to BOTH the new admin route AND the existing operator route (criterion 3). A failed/interrupted revocation leaves no audit row and no revoked sessions.
- **D-R4:** Hardening mirrors the operator route (server.js:2062-2090): sameOrigin first (Pitfall 22), throttle keyed on the caller, request IP captured from the same source the sessions table already uses, keep-current self-exclusion in the single DELETE statement (P-H), audit verb written on success only (D-117).

**Owner trail view**
- **D-V1:** A new owner-only section on the existing Settings page (beside the operator card, src/pages/settings.js:523), fetched via the same server-ground-truth pattern the operator card uses (403 for non-owners).
- **D-V2:** Filtering is verb-only (All / operator revoke / workspace-admin revoke) — no text search.
- **D-V3:** Server-paginated, latest-first, with a load-more control (order of 100 rows per page).
- **D-V4:** Each entry renders the full row from snapshot columns: actor name, target name, verb (machine verb + human label), session count, IP, workspace name, timestamp.

**Verb taxonomy & scope**
- **D-T1:** Two fixed machine verbs: `sessions_revoked_by_operator` and `sessions_revoked_by_workspace_admin`; the workspace_id column distinguishes which workspace for admin-tier rows.
- **D-T2:** Only the two revocation actions write audit rows this phase. No backfill of legacy security_log history.
- **D-T3:** Tiered read visibility: instance operators see all audit rows; workspace admins see only rows for their own workspace (admin-tier rows). Operator-level rows (workspace_id null) are visible to instance operators alone.

### the agent's Discretion
- Exact throttle limits for the admin route — lean: mirror the operator route's 5/15min.
- i18n strings for the trail view and revoke confirmations — follow the existing EN+FR catalogue gates.
- Error copy for admin-revoke refusals (ownerImmune, adminOnly, self-exclusion) — mirror operator-route error codes where possible.
- Zero-row delete semantics — D-117 already fixed: success-only verb, no audit row when nothing was revoked.
- Pagination cursor details (offset vs before-cursor) — agent decides.
- How workspace_id is rendered in the trail when the workspace itself is deleted — agent decides (workspace_id has no FK either; a name snapshot is optional).

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUD-01 | Operator revocation writes an append-only audit row (actor, action, target, session count, timestamp, IP) in the SAME transaction; never editable/deletable through the app | Existing operator route mapped (server.js:2052-2090); `transaction()` helper already exists (server.js:964-973); audit_log DDL pattern per D-A1/A2; append-only static-scan test pattern exists (test/error-codes.test.mjs house extraction pattern) |
| AUD-02 | Workspace admin revokes sessions of members of their own workspace (below own tier, owner-immunity + self-exclusion), same audited path | `requireWorkspace(req, res, slug, 'admin')` gate verified (server.js:1503-1518); member-route tier semantics verified (server.js:2303-2316); operator route is the hardening template |
| AUD-03 | Owners see the operator/admin action trail (filtered machine verbs); rows survive target-user deletion | Snapshot columns per D-A3; settings operator-card mount point verified (src/pages/settings.js:106, 523); frontend fetch pattern verified (src/actions/actions.js:1938-1976); no `delete from users` exists yet in the codebase — survival is future-proofing enforced by the no-FK schema |
</phase_requirements>

## Project Constraints (from AGENTS.md)

No project-level `AGENTS.md` exists in `/home/jmaillot/Projects/gr8r`. No `.claude/skills/` or `.agents/skills/` directories exist. The global user AGENTS.md directives that apply: verify before inventing (done — all values below read from source), no opportunistic out-of-scope repairs, and MCP-first lookups (no external libraries are introduced by this phase, so none were needed beyond the codebase itself).

## Summary

This phase is almost entirely intra-codebase: a new `audit_log` table, a transaction wrapper around two revocation routes, one new workspace-admin API route, one paginated read API, and one owner-facing settings section. **The single most important discovery is that the same-transaction guarantee (D-R3) does NOT require new BEGIN/COMMIT code: a `transaction(fn)` helper already exists at server.js:964-973 and is used in ~6 places** (`db.exec('begin immediate')` → run → `commit`, `rollback` on throw). The plan should reuse it verbatim in both routes rather than hand-rolling BEGIN/COMMIT, which would duplicate an established, crash-safe pattern.

The second key finding is a naming discrepancy in the locked decisions: CONTEXT D-R1 cites "`resolveWorkspace(minRole:'admin')` (server.js:1502)" but the actual function is **`requireWorkspace`** (server.js:1503-1518) — there is no `resolveWorkspace` in the codebase. Same contract (resolve by slug, 404 unknown, 403 `adminOnly` below min role, returns `{user, ws, membership}`); the planner must reference `requireWorkspace`. Also note the existing workspace member routes live under `/api/workspaces/:slug/members/...` (regex `^\/api\/workspaces\/([a-z0-9-]{2,40})\/members\/([A-Za-z0-9_-]{1,64})$`, server.js:2302) while D-R1 locks the new route at `/api/w/:slug/members/:id/revoke-sessions`. D-R1 is locked, so the plan should follow it — but the implementer should be told explicitly that this differs from the sibling convention and the route matcher must be added to the API dispatch section (before the SPA fallback, where all `/api/*` handling lives), not near the `/w/:slug/file/:id` static-file route.

Third: the audit trail's read API (D-V1/D-T3) has a tier-visibility subtlety. The only existing "owner" flag on the boot user payload is `is_instance_admin` (users table, server.js:93-105; surfaced as `api.user.isInstanceAdmin`). D-T3's "workspace admins see only their own workspace's rows" means the read endpoint should gate on `requireWorkspace(..., 'admin')`-style logic OR the instance flag, depending on whether the caller is an operator. Recommendation in Architecture Patterns below: one endpoint, scope decided by caller tier (instance flag → all rows; else require admin membership in the workspace named by the query's `workspace` filter).

No new packages, no new external dependencies, no migrations beyond additive DDL in the SCHEMA string.

**Primary recommendation:** Add `audit_log` DDL (no FKs, snapshot columns, two indexes), wrap both revocation routes' DELETE+INSERT in the existing `transaction()` helper, add the admin route mirroring the operator route's gate order (sameOrigin → requireUser → throttle → gate → target lookup → tier check → transaction(delete+audit) → success-only response), add a keyset-paginated audit read endpoint with tier-scoped visibility, and add the owner settings section beside `operatorCard()`. Prove append-only and atomicity with node:test (static source scan + forced-failure rollback test), and cover the admin lifecycle in a Chromium e2e spec following `e2e/operator-revoke-cycle.spec.mjs`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Audit row persistence (append-only) | Database / Storage (server.js SCHEMA + route handlers) | — | Server-side SQLite; client never writes audit rows |
| Same-transaction revocation+audit | API / Backend | Database / Storage | `transaction()` helper wraps DELETE sessions + INSERT audit_log server-side |
| Workspace-admin authorization gate | API / Backend | — | `requireWorkspace(..., 'admin')` + ROLE_RANK comparison; never client-checked |
| Tier-scoped trail read (D-T3) | API / Backend | — | Server decides visibility from `is_instance_admin` flag / membership |
| Owner trail view + verb filter + load-more | Browser / Client | API / Backend (pagination, filtering) | Settings section renders server-fetched rows; server grounds truth (D-V1 pattern) |
| Admin revoke UI in workspace members surface | Browser / Client | API / Backend | Follows operator-card confirm-stage pattern (S.ui staging + render()) |

## Standard Stack

### Core
No new packages — the entire phase is built from the existing zero-dependency stack. Verified this session:

| Component | Version | Purpose | Provenance |
|-----------|---------|---------|------------|
| Node.js | v24.21.0 (`node --version`) | Runtime | [VERIFIED: shell] |
| node:sqlite `DatabaseSync` | built into Node 24 | SQLite, including `exec('begin immediate'/'commit'/'rollback')` — already exercised by `transaction()` | [VERIFIED: server.js:964-973] |
| node:test | built in | Unit/integration suites, real server + real SQLite | [VERIFIED: package.json:18, test/operator-revoke.test.mjs] |
| Playwright (@playwright/test) | in devDependencies, e2e/*.spec.mjs | Chromium e2e, EN+FR parametric | [VERIFIED: e2e/operator-revoke-cycle.spec.mjs] |

**Package Legitimacy Audit:** N/A — this phase installs **zero** external packages. No registry lookups required, no [SUS]/[SLOP] exposure.

## Codebase Facts (verified this session)

Every value below was read from the named file this session.

**ROLE_RANK / ROLE_LABEL** — [VERIFIED: server.js:83-84]:
```js
const ROLE_RANK = { viewer: 1, member: 2, admin: 3, owner: 4 };
const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', member: 'Member', viewer: 'Guest' };
```

**users table** (no `is_instance_admin` on any other table; note it) — [VERIFIED: server.js:93-105]: columns include `is_instance_admin integer not null default 0`. The instance-operator gate is `isInstanceAdmin(user)` reading `user?.is_instance_admin === 1` only [VERIFIED: server.js:1057-1060 area — function `isInstanceAdmin` reads the DB flag only, never env/membership].

**sessions table** — [VERIFIED: server.js:107-116]: `token_hash text primary key, user_id … on delete cascade, created_at, expires_at, label, ip, last_seen_at, user_agent`. The `ip` column is the precedent for the audit `ip` value.

**security_log** — [VERIFIED: server.js:163-169]:
```sql
create table if not exists security_log (
  id         text primary key,
  user_id    text not null references users(id) on delete cascade,
  verb       text not null,
  created_at integer not null
);
```
This `on delete cascade` is exactly what audit_log must NOT have (D-A1/D-A2).

**memberships** — [VERIFIED: server.js:135-140]: PK `(workspace_id, user_id)`, `role check in ('owner','admin','member','viewer')`, both FKs `on delete cascade`.

**`transaction()` helper** — [VERIFIED: server.js:964-973]:
```js
function transaction(fn) {
  db.exec('begin immediate');
  try {
    const out = fn();
    db.exec('commit');
    return out;
  } catch (err) {
    db.exec('rollback');
    throw err;
  }
}
```
Already used at server.js:1710, 1772, 1805, 2308 (member removal), 2348 (role change), 1166 (boot migration). **D-R3 is satisfied by calling this helper, not by writing new BEGIN/COMMIT code.**

**`requireWorkspace`** (the function CONTEXT calls "resolveWorkspace") — [VERIFIED: server.js:1503-1518]: signature `requireWorkspace(req, res, slug, minRole = 'viewer')`; unknown slug/membership → 404 `workspaceNotFound`; below minRole → 403 `adminOnly` (when minRole==='admin') or `readOnlyAccess`; returns `{ user, ws, membership }`. Existing call sites with `'admin'`: server.js:2236, 2303, 2370, 2461.

**`clientIp`** — [VERIFIED: server.js:1401-1403]:
```js
function clientIp(req) {
  if (TRUST_PROXY && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}
```
This is the "same source the sessions table already uses" (login insert at server.js:1643-1651 stores `clientIp(req)` into sessions.ip).

**`logSecurity`** — [VERIFIED: server.js:1554-1556]: `insert into security_log (id, user_id, verb, created_at) values (?,?,?,?)` with `uid()` and `now()`. Stays untouched (D-A5); audit_log insert is a sibling statement.

**Operator revoke route** — [VERIFIED: server.js:2052-2090]. Exact semantics the admin route mirrors:
- Match: `pathname.match(/^\/api\/auth\/operator\/users\/([A-Za-z0-9_-]{1,64})\/revoke-sessions$/)`, POST only.
- Order: `sameOrigin(req)` FIRST → `requireUser` → `tooMany(`operator-revoke|${operator.id}`, 5, 15*60*1000)` (every attempt consumes a try, including 403s — D-116) → `isInstanceAdmin` gate (403 `operatorOnly`) → target lookup (404 `notFound`, selects `id, is_instance_admin`) → owner immunity BEFORE any session lookup: `if (target.is_instance_admin && target.id !== operator.id) return fail(res, 403, 'ownerImmune', …)` (D-119) → single DELETE keeping the caller's own session:
```js
const operatorTokenHash = sha256(parseCookies(req.headers.cookie)[COOKIE]);
const del = db.prepare('delete from sessions where user_id = ? and token_hash != ?').run(target.id, operatorTokenHash);
const left = db.prepare('select count(*) as n from sessions where user_id = ? and expires_at > ?').get(target.id, now());
```
→ success-only verb: `if (del.changes > 0) logSecurity(target.id, 'sessions_revoked_by_operator');` (D-117 — zero-row delete is a no-op, no audit claim) → `json(res, 200, { revoked: del.changes, remaining: left.n })` (live post-delete counts, Pitfall 10).
- **Currently NOT wrapped in `transaction()`** — the plan adds the wrapper (D-R3).

**Workspace member routes** (the admin route's siblings) — [VERIFIED: server.js:2302-2316]: regex `^\/api\/workspaces\/([a-z0-9-]{2,40})\/members\/([A-Za-z0-9_-]{1,64})$`; admin-gated via `requireWorkspace(req, res, wsMemberMatch[1], 'admin')`; tier rule precedent: `if (actorRank < ROLE_RANK.owner && roleRank(row.role) >= ROLE_RANK.admin) return fail(res, 403, 'ownerManagedRoles', …)` — only an owner manages admins/owners. For AUD-02 the equivalent rule is stricter per D-R2: an admin may revoke **only** roles with `ROLE_RANK[role] < ROLE_RANK.admin` (member/viewer), never peer admins or the workspace owner, never self. Note the existing self-guard on that route uses 409 `removeSelfViaLeave`; the revoke route instead uses keep-current exclusion (P-H) so a self-target is *allowed but is exactly revoke-others* (D-118 semantics — the operator route's precedent).

**Error-code catalogue gate** — [VERIFIED: test/error-codes.test.mjs:1-27]: a static scan extracts every `fail(res, <status>, '<code>'` / `httpError(..., '<code>')` literal from server.js and asserts a non-empty `err.<code>` in BOTH `src/locales/en.json` and `fr.json`. **Every new fail() code this phase needs `err.<code>` in both catalogues or `npm test` fails.** Reusable existing codes [VERIFIED: src/locales/en.json:1521-1523]: `err.adminOnly`, `err.operatorOnly`, `err.ownerImmune` — so the admin route can emit `ownerImmune` / `adminOnly` with zero new err keys; only genuinely new codes (e.g. a new "target not in your workspace" variant if `notAMember` [VERIFIED: server.js:2310] doesn't fit) need catalogue additions.

**Frontend operator card** — [VERIFIED: src/pages/settings.js:106 `export function operatorCard()`, mounted at settings.js:523 via `(api.user?.isInstanceAdmin ? operatorCard() : '')`]. Ground-truth fetch pattern — [VERIFIED: src/actions/actions.js:1938-1976]: `refreshOperatorUsers()` gates on `api.user?.isInstanceAdmin`, calls `api.operatorUsers()`, non-401 failures leave state null (the 403 gate is the honest answer), 401s defer to the central intercept (D-28). Confirm-stage pattern: `A.operatorRevokeAsk` sets `S.ui.operatorRevoke = el.dataset.id`, `Cancel` nulls it, `Confirm` calls the API then re-fetches. The trail section and the members-page admin revoke button should follow this exact staging (no window.confirm).

**API client** — [VERIFIED: src/core/api.js:253-257]: `operatorUsers()` and `operatorRevokeSessions(userId)` via `call('POST', '/api/auth/operator/users/…/revoke-sessions')`. New methods (`revokeMemberSessions(slug, id)`, `auditLog(params)`) go here.

**i18n gates** — [VERIFIED: package.json:9-10 + test/catalogue.test.mjs:1-17]: `i18n:scan` runs as a prebuild gate; catalogue tests enforce cross-file parity (EN is the base; shared keys must match rules). E2e assertions must resolve every string through `fmt()` against `src/locales/en.json`/`fr.json` — zero raw literals [VERIFIED: e2e/operator-revoke-cycle.spec.mjs:17-40].

**Route-ordering context** — [VERIFIED: server.js:2765, 2892, 2666]: the `/w/:slug/file/:id` route is registered late precisely so extensionless file paths don't fall into the SPA fallback (server.js:2892 comment). Any new `/api/w/:slug/...` route must be matched inside the API dispatch section (which runs before the SPA fallback at server.js:2666), so ordering risk is low — but the plan should include a routing-order sanity test if a `file-route-ordering.test.mjs`-style regression is plausible [VERIFIED: test/file-route-ordering.test.mjs exists].

**Test helpers** — [VERIFIED: test/operator-revoke.test.mjs:1-40 + test/helpers/server.mjs exports used there]: `startServer`, `withDb(srv.dbPath, db => …)` for direct SQLite assertions, `signup`/`login`. E2e helpers [VERIFIED: e2e/helpers/setup.mjs exports]: `BASE_URL, PASSWORD, OWNER, apiClient, clientIp, createAccount, newRunId` + local `totpAt` from `../totp.js`. Run-unique `X-Forwarded-For` per account/context so throttle budgets never cross (Pitfall 5; FR run doubles every budget).

## Architecture Patterns

### System Architecture Diagram

```
 Admin revoke (new)                    Operator revoke (existing + tx)
        │                                        │
 POST /api/w/:slug/members/:id/revoke-sessions   POST /api/auth/operator/users/:id/revoke-sessions
        │                                        │
 sameOrigin → requireUser → throttle(keyed on caller) → gate
   requireWorkspace(slug,'admin')                 isInstanceAdmin (DB flag)
        │                                        │
 target lookup + tier check (rank < admin; ownerImmune; not self-target-kill)
        │                                        │
        └──────────────┬─────────────────────────┘
                       ▼
          transaction(fn)  ── begin immediate
             ├─ DELETE FROM sessions WHERE user_id = ? AND token_hash != ?
             ├─ if changes>0: logSecurity (security_log, unchanged, D-A5)
             ├─ if changes>0: INSERT INTO audit_log (snapshot cols, no FKs)
             └─ commit  (any throw → rollback → NO sessions gone, NO audit row)
                       │
                       ▼
            200 { revoked, remaining }   (success-only; zero-row delete = no-op)
                       │
                       ▼
 GET /api/audit-log?verb=&workspace=&before=   (tier-scoped: operator→all, admin→own ws)
                       │
                       ▼
 Settings page owner section (beside operatorCard) — verb filter chips + load-more
 rows rendered purely from snapshot columns (no joins → deleted users stay readable)
```

### Recommended audit_log DDL (planner may adopt directly)

```sql
create table if not exists audit_log (
  id            text primary key,
  actor_id      text not null,          -- NO FK (D-A2)
  target_id     text not null,          -- NO FK (D-A2)
  action        text not null,          -- 'sessions_revoked_by_operator' | 'sessions_revoked_by_workspace_admin' (D-T1)
  session_count integer not null,
  ip            text,
  workspace_id  text,                   -- null for operator-tier rows (D-T3); no FK
  actor_name    text not null,          -- snapshot (D-A3)
  actor_email   text not null,          -- snapshot
  target_name   text not null,          -- snapshot
  target_email  text not null,          -- snapshot
  created_at    integer not null
);
create index if not exists audit_log_created on audit_log(created_at desc);
create index if not exists audit_log_workspace on audit_log(workspace_id, created_at desc);
```

Notes:
- Declare inside the existing `SCHEMA` template string in server.js — new table, so no `ensureColumn` migration needed [VERIFIED: CONTEXT integration note + SCHEMA is a single template at server.js:88-171].
- Timestamps are integer epoch ms via `now()` — matches every other table's `created_at integer` convention [VERIFIED: security_log/recovery_codes schemas].
- A `workspace_name` snapshot column is optional (agent discretion in CONTEXT). Lean recommendation: **skip it** — workspace deletion is rare, and D-V4 lists "workspace name" only as a display nicety; if the workspace row is gone, render the raw id or an em-dash. Adding it later is additive (ensureColumn exists for that).

### Pattern 1: Same-transaction revocation (both routes)

**What:** Wrap the DELETE and the audit INSERT in the existing `transaction()` helper; keep every early-return gate (sameOrigin/throttle/authz/immunity) *before* the transaction so refusals never open one.
**Example (operator route shape):**
```js
const result = transaction(() => {
  const del = db.prepare('delete from sessions where user_id = ? and token_hash != ?').run(target.id, callerTokenHash);
  if (del.changes > 0) {
    logSecurity(target.id, 'sessions_revoked_by_operator');           // unchanged (D-A5)
    db.prepare('insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(uid(), operator.id, target.id, 'sessions_revoked_by_operator', del.changes, clientIp(req), null, operator.name, operator.email, target.name, target.email, now());
  }
  return del.changes;
});
```
**Pitfall inside this pattern:** the caller's token hash must be computed from the *request's* cookie; inside the operator route that's `sha256(parseCookies(req.headers.cookie)[COOKIE])` [VERIFIED: server.js:2081]. Do not reuse any other session lookup.

### Pattern 2: Tier-scoped trail read (D-T3)

**What:** One GET endpoint (e.g. `GET /api/audit-log?verb=<verb>&before=<created_at>&limit=100`). Visibility decided server-side, never by query trust:
- `isInstanceAdmin(user)` → see everything (operator rows `workspace_id IS NULL` plus admin rows).
- Otherwise → requireWorkspace-style gate: caller must hold an `admin` (or owner) membership in the workspace whose rows they request; response is limited to `workspace_id = <their workspace>`. Simplest contract: if not an operator, the endpoint ignores any workspace filter and returns rows for the caller's own admin workspace(s) — or 403s unless a `workspace` slug param resolves to a membership with `ROLE_RANK >= ROLE_RANK.admin`. Pick one in the plan; the lean option is "admin sees only rows whose workspace_id matches a workspace where they are admin; workspace_id null rows never leave the server for them."
- Non-privileged callers: 403 (D-V1's "403 for non-owners" honest-gate pattern).

**Pagination (agent discretion):** use keyset pagination — `where created_at < :before order by created_at desc, id desc limit 101`, return 100 + a `hasMore`/`nextBefore` cursor. Keyset beats offset (stable under concurrent inserts, index-friendly via `audit_log_created`). Response shape mirroring house style: `{ rows: [...], nextBefore: <ts|null> }`.

### Pattern 3: Append-only proof (D-A4)

Two complementary tests, both following existing house patterns:
1. **Static source scan** (mirror test/error-codes.test.mjs's extraction approach [VERIFIED: test/error-codes.test.mjs:15-19]): read server.js as text and assert the strings `update audit_log` / `delete from audit_log` (case-insensitive, allowing whitespace) never appear — plus assert no route returns audit content with write semantics.
2. **Dynamic route-level test**: with the real server (test/helpers/server.mjs), as each tier of principal, attempt any hypothetical mutation surface — practically this means asserting the only audit-touching statements are the single INSERT (greppable) and that every API method in src/core/api.js is enumerated so a future route can't silently mutate. The static scan is the enforcement workhorse; the dynamic test proves the row count only grows across a full revoke cycle.
3. **Atomicity test (criterion 3, no mocks):** `drop table audit_log` (or drop its INSERT-dependent precondition) via `withDb`, then call the revoke route → expect a 5xx and **zero** deleted sessions (assert session count unchanged). Because `transaction()` rolls back on throw, the delete is undone even though the DELETE statement succeeded first. This is the cleanest no-mock way to prove rollback with real SQLite.

### Anti-Patterns to Avoid
- **Writing new `db.exec('begin')`/`commit` code inline:** duplicates `transaction()` (server.js:964-973); use the helper.
- **Gating inside the transaction:** a `fail()` after `begin immediate` leaves the connection mid-transaction on early return (node:sqlite holds it until rollback/commit). All refusals before `transaction()`.
- **FKs on audit_log:** any `references users(id)` reintroduces exactly the cascade AUD-03 forbids (security_log precedent, server.js:165).
- **Joining audit rows to users/workspaces for the view:** D-A3 snapshots exist precisely so the render needs no joins; a join silently breaks on deleted users.
- **Client-side gating of the admin revoke button as the only gate:** the server gate (`requireWorkspace` + rank comparison) is the security boundary; the button is UX only.
- **Backfilling security_log history:** D-T2 forbids it; pre-phase events stay where they are.
- **Raw literal assertions in e2e:** every string through `fmt()`/`t()` against both catalogues (house rule, operator-revoke-cycle.spec.mjs header).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Transactions | New BEGIN/COMMIT/ROLLBACK code | `transaction(fn)` (server.js:964-973) | Crash-safe, established at 6+ call sites, `begin immediate` semantics already chosen |
| Workspace+role gate | Ad-hoc membership lookups | `requireWorkspace(req, res, slug, 'admin')` (server.js:1503) | Central 404/403 codes, returns ctx triple |
| IP extraction | Parsing headers ad hoc | `clientIp(req)` (server.js:1401-1403) | TRUST_PROXY-aware; parity with sessions.ip |
| Throttling | New limiter | `tooMany(key, 5, 15*60*1000)` (server.js:1520-1530) | In-memory, self-cleaning, D-116 semantics established |
| ID/timestamps | Anything else | `uid()` / `now()` (used by logSecurity, server.js:1555) | House conventions |
| Error codes + i18n | New error plumbing | `fail(res, status, 'code', msg)` + err.<code> catalogue gate | test/error-codes.test.mjs enforces parity automatically |
| Pagination | Offset pages | Keyset on `created_at desc` | Stable under inserts; covered by `audit_log_created` index |

**Key insight:** this codebase already solved every hard part of this phase in v1.3/v1.4 (gates, throttle, sameOrigin ordering, keep-current delete, success-only verbs). Phase 24 is mostly composition of existing primitives plus one new table.

## Common Pitfalls

### Pitfall 1: Gate ordering breaks D-116
**What goes wrong:** Putting the throttle after the gate, or sameOrigin after the body read, changes who consumes budget and reopens cross-origin waste.
**Why:** The operator route deliberately consumes a try on *every* attempt including 403s [VERIFIED: server.js:2060-2062 comment D-116], and sameOrigin comes before any body read [Pitfall 22 house rule].
**Avoid:** Copy the operator route's statement order verbatim: sameOrigin → requireUser → throttle → gate → target.
**Warning signs:** e2e FR run (doubled budgets) failing on 429s.

### Pitfall 2: Self-revoke nuance on the admin route
**What goes wrong:** Confusing "self-exclusion" with "self-target forbidden". A self-target IS allowed (D-118: it means revoke-my-other-sessions); the keep-current clause in the DELETE (`token_hash != ?`) is the self-exclusion.
**Avoid:** Keep D-118/P-H semantics: self-target permitted, single statement, own session survives.
**Warning signs:** An admin testing "revoke myself" loses their own session → wrong.

### Pitfall 3: Tier boundary off-by-one on the admin route
**What goes wrong:** Allowing an admin to revoke a *peer admin* or the workspace *owner*.
**Avoid:** D-R2 says strictly below admin: `ROLE_RANK[targetMembership.role] < ROLE_RANK.admin`. Owner immunity then falls out (owner rank 4 ≥ 3), but keep an explicit `ownerImmune` 403 path mirroring D-119 for defense in depth and honest error copy. Also the target must hold a membership in THIS workspace (`notAMember` 404-style refusal, precedent server.js:2310).
**Warning signs:** A second admin account can be revoked by the first.

### Pitfall 4: Audit row written on zero-row delete
**What goes wrong:** An audit trail claiming a revocation that revoked nothing (D-117/IN-01 violation).
**Avoid:** Gate BOTH the security_log write and the audit INSERT on `del.changes > 0`, and the response still returns `{ revoked: 0, remaining }`.
**Warning signs:** Trail rows with session_count 0.

### Pitfall 5: Static scan false positives
**What goes wrong:** The append-only static scan (Pattern 3) trips on a comment or a string like `"delete from audit_log where…"` in test fixtures if it reads more than server.js.
**Avoid:** Scan server.js only (the error-codes precedent reads exactly one file [VERIFIED: test/error-codes.test.mjs:14]).
**Warning signs:** npm test failing on docs text.

### Pitfall 6: Forgetting the FR catalogue half
**What goes wrong:** New UI strings or err codes added to en.json only → catalogue/error-codes tests fail (by design).
**Avoid:** Every new key lands in en.json AND fr.json in the same commit; run `npm run i18n:scan` locally [VERIFIED: package.json:9-10].
**Warning signs:** test/catalogue.test.mjs, test/error-codes.test.mjs failures.

### Pitfall 7: Throttle budget collision in tests
**What goes wrong:** Reusing one IP across fixture accounts makes the 5-per-15min revoke throttle 429 unrelated tests.
**Avoid:** Per-account run-unique `X-Forwarded-For` (operator-revoke-cycle.spec.mjs convention, header comment [VERIFIED: e2e/operator-revoke-cycle.spec.mjs:11-13]); FR run doubles budgets.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| security_log as the only privileged-action record | security_log stays (2FA events) + new FK-free audit_log for revocations | this phase (D-A1/A5) | Dual-write on operator route; no backfill |
| Operator revoke without explicit transaction | DELETE+INSERT wrapped in `transaction()` | this phase (D-R3) | Closes the crash window where sessions die but the audit verb is lost |
| Operator-only revocation | + workspace-admin tier scoped to own workspace, strictly-below-admin targets | this phase (D-R1/R2) | New `/api/w/:slug/...` route |

**Deprecated/outdated in this phase's wake:** none — nothing is removed.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | No `delete from users` exists anywhere in the app today (grep found none) — user deletion is future functionality, so "survive deletion" is enforced purely by schema (no FKs) | Codebase Facts / AUD-03 | Low: schema choice is locked anyway (D-A2) |
| A2 | No existing server-side pagination pattern exists in the codebase to copy; keyset pagination is a new (small) pattern introduced here | Pattern 2 | Low: contained in one endpoint |
| A3 | The operator users GET route lives at server.js:2042-2043 and its response includes per-user `is_instance_admin` [VERIFIED: server.js:2037-2050 window shows the payload] — the plan's trail gate can rely on the boot `userPayload` flag `isInstanceAdmin` | Frontend facts | Low: flag is used by operatorCard today (settings.js:523) |
| A4 | `GET /api/w/:slug/...` under the `/api` dispatch prefix causes no conflict with the SPA-served `/w/:slug` workspace routes | Architecture | Low: all `/api/*` matching happens before the SPA fallback (server.js:2666); a file-route-ordering-style test removes residual risk |
| A5 | D-R1's path prefix `/api/w/` (vs siblings' `/api/workspaces/`) is intentional per the locked decision | Summary/Patterns | Cosmetic inconsistency only; flagged so the planner can note it |

## Open Questions (RESOLVED)

1. **Read-endpoint shape for D-T3 admin visibility**
   - What we know: operators see all rows; workspace admins see only their own workspace's rows (D-T3). The only existing instance flag is `is_instance_admin`.
   - What's unclear: should a workspace admin hit the same endpoint with a workspace scoping param, or a workspace-nested endpoint (`/api/workspaces/:slug/audit-log`)?
   - Recommendation: one endpoint `GET /api/audit-log` with server-side scoping (operator → all; else require an admin membership and scope to it). Fewer routes, one gate. Planner may instead mirror the members route nesting for consistency — both satisfy D-T3.
   - **(RESOLVED)** Single tier-scoped `GET /api/audit-log` with server-side scoping — decided in plan 03 Task 1.

2. **Where the admin revoke button lives in the UI**
   - What we know: CONTEXT locks the route but not the button placement; the members surface (src/pages/members.js) renders roles already.
   - Recommendation: a per-member action beside the existing member management controls, using the operator card's two-stage confirm (S.ui staging + render()).
   - **(RESOLVED)** Members-surface per-member revoke button with two-stage confirm — decided in plan 02 Task 2.

3. **Workspace name rendering for deleted workspaces** (explicit agent discretion)
   - Recommendation: skip a workspace_name snapshot column; render id or `—` when the row is gone. Additive later if wanted.
   - **(RESOLVED)** No workspace_name snapshot column; em-dash/id rendering — decided in plan 03 Task 2.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | everything | ✓ | v24.21.0 | — |
| node:sqlite (DatabaseSync) | audit_log, transactions | ✓ (built-in) | Node 24 | — |
| node:test runner | unit/integration tests | ✓ (built-in) | Node 24 | — |
| Playwright browsers | e2e lifecycle spec | ✓ (existing e2e suite runs) | per repo config | skip e2e if browsers missing — unit suites still prove criteria 1-5 |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (Node 24) + Playwright (e2e/) |
| Config file | package.json scripts; e2e/playwright.config.mjs |
| Quick run command | `node --test test/operator-revoke.test.mjs test/error-codes.test.mjs test/catalogue.test.mjs` |
| Full suite command | `npm test` (node --test --test-concurrency=2 test/*.test.mjs) ; `npx playwright test e2e` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUD-01 | Operator revoke writes audit row with all fields, same transaction | unit | `node --test test/audit-log.test.mjs` | ❌ Wave 0 |
| AUD-01 | Rollback: forced audit failure → no revoked sessions, no audit row | unit | same file (drop-table atomicity test, Pattern 3) | ❌ Wave 0 |
| AUD-01 | Append-only: static scan finds no UPDATE/DELETE on audit_log; route cycle only grows rows | unit | same file + scan assertion | ❌ Wave 0 |
| AUD-02 | Admin revokes member of own workspace; peer admin/owner/self-kill refusals (ownerImmune/adminOnly/notAMember) | unit | same file | ❌ Wave 0 |
| AUD-02 | Full admin-revoke lifecycle in real browser, EN+FR parametric | e2e | `npx playwright test e2e/admin-revoke-cycle.spec.mjs` | ❌ Wave 0 |
| AUD-03 | Trail endpoint tier visibility (operator all / admin own-ws / member 403), verb filter, keyset pagination, rows readable with no users row (simulate via direct withDb user delete) | unit | `node --test test/audit-log.test.mjs` | ❌ Wave 0 |
| — | err-code parity for any new fail() codes; catalogue parity for new UI keys | unit | `node --test test/error-codes.test.mjs test/catalogue.test.mjs` | ✅ existing |

### Sampling Rate
- **Per task commit:** quick run of the touched test files (audit-log + catalogue + error-codes)
- **Per wave merge:** `npm test`
- **Phase gate:** `npm test` + `npx playwright test e2e` green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/audit-log.test.mjs` — covers AUD-01/02/03 server-side (template: test/operator-revoke.test.mjs + helpers/server.mjs `withDb`)
- [ ] `e2e/admin-revoke-cycle.spec.mjs` — covers AUD-02 lifecycle EN+FR (template: e2e/operator-revoke-cycle.spec.mjs)
- [ ] New `err.<code>` entries in src/locales/en.json + fr.json if any new fail() code is emitted (run `npm run i18n:scan`)

## Security Domain

(No `.planning/config.json` security flag found; treated as enabled.)

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | yes | `requireWorkspace(minRole)` server gate; `isInstanceAdmin` DB-flag gate; rank comparison `ROLE_RANK` |
| V5 Input Validation | yes | Route regexes for ids/slugs (house pattern); `readJson` size-capped; verb values from a fixed set, never client strings |
| V7 Logging (audit) | yes | Dedicated append-only audit_log, snapshot columns, success-only verbs, same-transaction write |
| V2/V3 AuthN/AuthZ session | yes | Reuse of existing session cookie + sameOrigin + central 401 intercept (D-28); no new auth surface |
| V6 Cryptography | no | No new crypto (token hashing exists) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Privileged-action repudiation | Repudiation | Same-transaction audit row with actor snapshot + IP (clientIp, TRUST_PROXY-aware) |
| Audit tampering via app routes | Tampering | No FKs + in-app append-only (D-A4) + static-scan test; SQLite file access is outside app threat model (self-hosted) |
| Cross-origin revoke CSRF | Spoofing | sameOrigin-first on every mutation (Pitfall 22 order) |
| Target enumeration via 404s | Information Disclosure | Keep operator route's behavior: 404 `notFound` for missing target before immunity check (mirror exactly) |
| Throttle bypass via IP rotation | DoS | Caller-keyed throttle (D-116) + existing 5/15min budget; every attempt consumes a try |

## Sources

### Primary (HIGH confidence)
- Direct file reads this session: server.js (SCHEMA 88-171; ROLE_RANK 83-84; transaction 964-973; requireWorkspace 1503-1518; logSecurity 1554-1556; clientIp 1401-1403; operator routes 2042-2090; member routes 2295-2370), src/pages/settings.js (106, 523), src/actions/actions.js (1930-1976), src/core/api.js (253-257), src/locales/en.json (1521-1523), test/error-codes.test.mjs, test/operator-revoke.test.mjs, e2e/operator-revoke-cycle.spec.mjs, package.json, .planning/{REQUIREMENTS,STATE}.md, 24-CONTEXT.md
- Shell verifications: `node --version` (v24.21.0), grep probes for delete-user/transaction usage

### Secondary (MEDIUM confidence)
- None needed — no external docs or libraries involved.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack / codebase contracts: HIGH — every anchor read from source this session
- Architecture patterns: HIGH — compositions of existing verified primitives; keyset pagination is new but self-contained
- Pitfalls: HIGH — derived from verbatim route code and house test conventions

**Research date:** 2026-10-31
**Valid until:** 2026-11-30 (in-repo facts; re-verify if server.js is refactored before execution)
