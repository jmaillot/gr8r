# Phase 29: Team/Project-Scoped Permissions - Research

**Researched:** 2026-11-02
**Domain:** Server-side scope enforcement across a doc-centric API (node:sqlite scope column, redaction-path extension, write-guard extension, per-family 404-matrix tests)
**Confidence:** HIGH (all findings read in-repo this session; no external libraries involved)

## Summary

This phase adds a scope to memberships: null (workspace-wide, today's behavior) or `{teams:[], projects:[]}`. The decisive architectural fact — verified by reading every route-match site in `server.js` — is that **there is no per-project REST endpoint family**. All project/task/comment/file-metadata/activity data flows through exactly ONE channel: `GET /api/workspaces/:slug` (read, redacted by `redactDoc`) and `PUT /api/workspaces/:slug` (write, guarded by `mergeClientDoc`). The genuinely project-touching endpoints are few: the doc GET/PUT pair, file upload (`POST /w/:slug/files`), file serve (`GET/HEAD /w/:slug/file/:id`), the internal reminder pass, and the invite create/accept pair. So "a named route sweep over every project-touching endpoint" is best planned as **extending the two shared enforcement funnels (`hiddenProjectIds()` for reads, `mergeClientDoc()` for writes) plus four named side-door endpoints**, each proven by a 404-matrix test per family — not a hundred-route slog.

The read path composes cleanly: `redactDoc()` already removes projects, tasks, comments, files, activity, notifs, events, saved views and recent-search terms for projects the caller cannot see (`hiddenProjectIds()` → `canSeeProject()`). Scope extends `canSeeProject()` with a second predicate — in-scope — while honoring D-03's *grant* semantics (explicit scope opens even private projects). The write path already reserves hidden-project rows in `mergeClientDoc()`; extending `hiddenProjectIds()` with scope automatically guards writes too, but the signature must gain the membership (it currently takes only `doc, memberId` and cannot see the scope column or the team set). Side doors that bypass the doc: `serveFileBinary` looks a file record up by id with **no project-visibility check on the record** — a scoped member with a known file id currently gets the bytes; the reminder pass (`runReminderPass`) targets assignees server-side and must run the scope predicate (SCOPE-04); notification fan-out is client-side (`notifyMembers`/`emitMentions`) with a server-side email mirror (`queueNotifEmails`) that should filter defensively.

Storage mirrors the Phase 28 precedent exactly: an additive `ensureColumn()` JSON column on `memberships` (like `invites.teams`), scope-edit routes modeled on the Phase 28 `PUT /members/:uid/teams` authority-route pattern (admin-gated, doc revision untouched), and invite-carried scope riding the existing `invites.teams` JSON mechanism (a `scope` JSON column on `invites`, validated like the teams whitelist at server.js:3614–3632).

**Primary recommendation:** One shared server helper `projectScope(membership)` → `{ teamSet, projectSet } | null` (null = workspace-wide), composed into a single `inScopeProject(p, scope)` predicate that `canSeeProject()`/`hiddenProjectIds()` consume — then extend the write path and the four side doors to route through the same predicate. Prove every family with a 404-matrix test table; never return 403 for out-of-scope by-id targets.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Scope shape is **mixed**: a membership scope holds `teams[]` and/or `projects[]` together (empty/null = workspace-wide). Reach = union of the scoped teams' projects plus the explicitly scoped projects.
- **D-02:** Scope lives in a **JSON scope column on `memberships`** (null, or `{teams:[], projects:[]}`), mirroring the `invites.teams` JSON-array precedent. Additive `ensureColumn()`-style migration; additive-migration test pin (`test/migration.test.mjs`, byte-identical second boot) locks the schema outcome.
- **D-03:** **Scope grants access:** an explicit project scope makes that project visible even if it is private and the member is not on its access list — scope is the authoritative grant for scoped members.
- **D-04:** Only **sub-admin roles** (viewer, member) can carry a scope; admin and owner memberships are always workspace-wide. Enforced server-side (reject/ignore scope on admin+ memberships).
- **D-05:** Members list shows the **full workspace roster** to scoped members; other members' scope details are never shown.
- **D-06:** Workspace activity feed and cross-project search are **filtered server-side like private projects are today** — same redaction path; recent-search terms referencing out-of-scope projects are scrubbed.
- **D-07:** Notifications: scope enforced **at send time only** (recipient resolution runs the scope predicate). Pre-scope notifications stay visible; no server-side filtering of the notifications list.
- **D-08:** The scoped member's workspace UI is **unchanged** — same navigation, out-of-scope content filtered; stray by-id requests answer 404. No "scoped mode", no guest shell.
- **D-09:** Scope set at **invite time** (invite form gains scope section) and edited later in the **existing member edit modal**.
- **D-10:** Admins pick teams/projects **by name from multi-selects**; scope stored as ids, names resolve live.
- **D-11:** **No self-indicator** — no badge or "limited to" notice.
- **D-12:** Scope edits ride the **server membership API** (Phase 28 authority-route pattern, admin-gated), apply immediately, never touch the workspace document.
- **D-13:** No new role: external project collaborator = **viewer role + project scope** (exactly one project). No ROLE_RANK entry.
- **D-14:** Guest **inherits existing viewer semantics** inside their one project (read-only).
- **D-15:** After acceptance the guest lands via the **standard entry path** — no special landing page.

### the agent's Discretion
- Exact route-sweep mechanics: endpoint-family grouping, 404-matrix test structure, shared scope-predicate helper signature.
- Exact JSON column name and validation shape on `memberships` (`invites.teams` is the style precedent).
- Doc write-path treatment for scoped members (`mergeClientDoc` guard).
- Whether the invite-form scope section reuses member-modal pickers verbatim or a lighter variant.

### Deferred Ideas (OUT OF SCOPE)
- Per-team or per-project permission *levels* (elevation) — SCOPE-01; role ladder stays the ceiling.
- A distinct guest landing experience / "scoped mode" UI — rejected (D-08, D-15).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCOPE-01 | Membership carries scope (workspace-wide default, or teams/projects), role stays the level, scope only restricts | `memberships.scope` JSON column (ensureColumn), `projectScope(membership)` helper, D-04 server-side role gate on scope writes |
| SCOPE-02 | Server-side read filtering + rejected out-of-scope writes + 404 by-id, no oracle | Extend `canSeeProject`/`hiddenProjectIds` (server.js:602, 653) with in-scope predicate; extend `mergeClientDoc` reservation; 404 for file-by-id and write rejections |
| SCOPE-03 | Named route sweep, 404-matrix test per endpoint family | Families enumerated below (doc GET/PUT, upload, file serve, reminder pass, invites); 404-matrix per family |
| SCOPE-04 | Notification/mention/assignment recipient resolution runs the scope predicate | Client `emitMentions`/assign notify pre-filter (actions.js:100, 139–154); server `runReminderPass` + `queueNotifEmails` scope filter; Phase 28 `assignableInProject` server-guard seam |
| SCOPE-05 | Invitations carry scope; invited user lands with it at acceptance | `invites.scope` JSON column; invite POST validation (pattern at server.js:3614–3632); accept writes scope onto new membership (server.js:3746+) |
| SCOPE-06 | External collaborator = one-project guest | viewer + `{projects:[one]}` scope (D-13); inherits viewer gates; standard entry (D-15) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Scope storage + migration | Database (node:sqlite) | — | `memberships.scope` additive column; byte-identical boot pin |
| Scope edit API | API/Backend | — | Admin-gated authority-route pattern (Phase 28); doc untouched (D-12) |
| Read filtering (doc GET) | API/Backend | — | `redactDoc`/`hiddenProjectIds` already the single redaction funnel (D-06) |
| Write guard (doc PUT) | API/Backend | — | `mergeClientDoc` reservation sets; scoped member cannot write into out-of-scope targets |
| File upload/serve scope check | API/Backend | — | Side doors bypass the doc funnel; `serveFileBinary` must check `record.project` |
| Invite-carried scope | API/Backend | Frontend (form) | `invites.scope` JSON; acceptance writes membership scope server-side |
| Mention/assign/reminder recipient filtering | Client (emit) + API (server mirror) | — | SCOPE-04: client pre-filters targets; server reminder pass + email queue run the same predicate |
| Scope pickers (invite form, member modal) | Frontend | API (roster/picker data) | Reuse Phase 28 multi-selects (D-09/D-10); EN+FR catalogue strings |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node:sqlite (DatabaseSync) | Node 24.x [VERIFIED: Phase 28 research, `node --version` shell check] | `ensureColumn` scope column, scope read queries | Zero-runtime-deps invariant (PROJECT.md v1.6) |
| node:test + node:assert/strict | built-in | 404-matrix tests per family, migration pin | All 57+ test files use it [VERIFIED: test/ listing] |

No new packages — zero-dependency invariant means **no Package Legitimacy Audit is required** (nothing to install).

## Architecture Patterns

### System Architecture Diagram

```
Admin surfaces (invite form scope section / member edit modal scope editor)
        │  PUT /api/workspaces/:ws/members/:uid/scope   (new, admin-gated, D-12)
        │  POST /api/workspaces/:ws/invites {scope}     (extended, D-09)
        ▼
SQLite authority: memberships.scope JSON (null | {teams:[],projects:[]})   invites.scope JSON
        │                        (sub-admin only — D-04 server gate)
        ▼
projectScope(membership) → {teamSet, projectSet} | null      [single shared predicate]
        │
        ├──► READ: canSeeProject(p, memberId)  ∩  inScope(p, scope)     hiddenProjectIds()
        │         └─ redactDoc (doc GET) — projects/tasks/comments/files/activity/
        │            notifs/events/savedViews/recentSearches all follow automatically
        ├──► WRITE: mergeClientDoc(incoming, stored, membership) — hidden set
        │         now includes out-of-scope rows ⇒ reserved ⇒ client writes cannot
        │         create/move/edit out-of-scope projects, tasks, comments, files
        ├──► SIDE DOORS: serveFileBinary (record.project ∉ scope ⇒ 404)
        │                runReminderPass (skip out-of-scope assignees)
        │                queueNotifEmails (skip out-of-scope recipients)
        └──► CLIENT emit: assign notify / emitMentions / watchers — pre-filter
                  targets by the actor-visible scope set (SCOPE-04 send-time, D-07)

Invite acceptance: addMembership(ws, user, role, teams, scope) — scope rides
the existing Phase 28 acceptance call (server.js:3746+); guest = viewer + one
project scope, no new role (D-13).
```

### The route sweep — named endpoint families (complete, verified this session)

All 39 route-match sites in `server.js` were enumerated. Project-touching families:

| # | Family | Route(s) | Line | Enforcement point today | Scope work |
|---|--------|----------|------|------------------------|------------|
| 1 | Doc read | `GET /api/workspaces/:slug` | 3290–3300 | `docForClient` → `redactDoc` | `hiddenProjectIds` gains scope ⇒ everything filtered |
| 2 | Doc write | `PUT /api/workspaces/:slug` | 3302–3361 | `docFromClient` → `mergeClientDoc` | same hidden set ⇒ out-of-scope rows reserved |
| 3 | File upload | `POST /w/:slug/files` | 4152→3986 | `requireWorkspace('member')` only | metadata rides doc channel (family 2 covers it); consider rejecting upload when caller cannot write any in-scope target? No — record must reference a project to land; guard lives in family 2 |
| 4 | File serve | `GET/HEAD /w/:slug/file/:id` | 4182→4033 | record lookup by id, **no project check** | `record.project` ∉ caller's visible set ⇒ 404 `fileNotFound` (same code as unknown id) |
| 5 | Reminder pass | `POST /api/internal/reminder-pass` | 2377–2383 | token-gated internal | `runReminderPass` skips assignees out of scope (SCOPE-04 server side) |
| 6 | Invites | `POST/DELETE /api/workspaces/:ws/invites(/:hash)`, `GET /api/invites/:token`, `POST .../accept` | 3603, 3719, 3730, 3746 | admin-gated | carry scope; accept writes it (SCOPE-05/06) |
| 7 | Members | `GET /members`, `PATCH/DELETE /members/:uid`, `PUT /members/:uid/teams`, leave, revoke | 3403–3569 | admin-gated writes | D-05: roster unfiltered; scope edit route joins here; never expose other members' scope (D-05) |
| 8 | Workspace meta | `GET/PATCH/DELETE /api/workspaces(/:slug)` | 3262–3400 | role-gated (PATCH admin, DELETE owner) | no scope work — workspace-wide surfaces stay (D-08) |

Not project-touching (no work, list them in the sweep doc as "checked, not affected"): all `/api/auth/*`, `/api/audit-log`, `/api/config`, `/api/health`, operator routes, sessions.

### Recommended Project Structure

No new files required; extensions follow existing layout:
```
server.js                  # scope column migration; projectScope()/inScope helpers near
                           #   canSeeProject (server.js:602); extend hiddenProjectIds,
                           #   mergeClientDoc signature, serveFileBinary, runReminderPass,
                           #   queueNotifEmails, invite routes, new scope route (~3569)
src/core/store.js          # me().scope projection if client emit-filter needs it
src/actions/actions.js     # assign notify (100), emitMentions (139–154), watchers (183):
                           #   pre-filter targets by scope (send-time, D-07)
src/actions/members.js     # member modal scope editor (extend Phase 28 modal)
src/actions/invites.js     # invite form scope section (D-09)
locales (en/fr catalogues) # new strings at write time (EN+FR gate)
test/scope.test.mjs        # 404-matrix per family + scope-predicate unit tests (Wave 0)
test/migration.test.mjs    # extend: scope column, byte-identical second boot
```

### Pattern 1: Scope predicate composition (single funnel)

```js
// Source: composition of canSeeProject (server.js:602-605) and teamsByUser (server.js:1193-1200)
// {VERIFIED} current code:
// function canSeeProject(p, memberId) {
//   if (!projectIsPrivate(p)) return true;
//   return !!memberId && Array.isArray(p.members) && p.members.includes(memberId);
// }
const SUB_ADMIN = new Set(['viewer', 'member']); // D-04 — scope carriers

function projectScope(membership) {
  // null | { teams: [], projects: [] } parsed defensively, admin+ always null (D-04)
}
function inScopeProject(p, scope) {
  if (!scope) return true;                                   // workspace-wide
  return scope.projects.includes(p?.id)
      || (Array.isArray(p?.teams) && p.teams.some(t => scope.teams.includes(t)));
}
// visible(p) = inScopeProject(p, scope) && (scope grants it  — D-03 —
//            || !projectIsPrivate(p) || p.members.includes(memberId))
```
Note the D-03 interaction: explicit project scope opens a private project **even when the member is not on its access list**, so for scoped members the grant short-circuits the private check. Planner decides whether team-scope reach also opens private team-linked projects or only public ones + explicit project grants (D-03 wording names explicit projects; recommend: team reach grants visibility of the team's projects too — union semantics in D-01 — flag for the plan).

### Pattern 2: Additive JSON column (established, copied)

```js
// Source: ensureColumn (server.js:223-226), invites.teams precedent (Phase 28 D-07)
// {VERIFIED} verbatim:
// function ensureColumn(conn, table, name, def) {
//   const cols = conn.prepare(`pragma table_info(${table})`).all();
//   if (!cols.some(c => c.name === name)) conn.exec(`alter table ${table} add column ${name} ${def}`);
// }
ensureColumn(db, 'memberships', 'scope', 'text');   // null = workspace-wide
ensureColumn(db, 'invites', 'scope', 'text');       // null = unscooped invite
```
No backfill needed (null default is the correct legacy state). Byte-identical second boot is automatic — but still pinned by extending `test/migration.test.mjs`.

### Pattern 3: Scope edit route (Phase 28 authority-route pattern)

```js
// Source: pattern from wsMemberTeamsMatch (server.js:3506+), verbatim comment on that route:
// "The route edits ONLY the team_members authority rows inside its own
//  transaction; the document and its revision are untouched, so the response
//  carries no `revision` claim"
// PUT /api/workspaces/:ws/members/:uid/scope  — admin gate, sameOrigin, readJson
// body { scope: null | { teams: [...], projects: [...] } }
// validate: teams whitelist vs doc teamsList (mirror server.js:3614-3632: trim, slice 40,
//   Set-dedup, cap 25, unknownTeam 400); projects whitelist vs doc projectsList;
//   D-04: target role is admin/owner ⇒ force null (ignore or 400 — planner picks)
// update memberships set scope = ? — no revision claim, member payload returned
```

### Pattern 4: Invite-carried scope

`POST /api/workspaces/:ws/invites` gains `body.scope`, validated identically to Pattern 3 and stored in `invites.scope` as JSON (alongside `teams`). Acceptance (server.js:3746+) passes scope into `addMembership(ws, user, invite.role, teams, scope)`. D-13 lives in validation: guest invites are role=viewer with scope `{projects:[exactly one]}` — enforce "exactly one project" for the guest path at invite creation, not via a role.

### Anti-Patterns to Avoid
- **Building a second redaction pipeline for scope:** out-of-scope must join `hiddenProjectIds()`, not spawn a parallel filter. Every dependent list (tasks, comments, files, activity, notifs, events, savedViews, recentSearches, view filters) already follows it (server.js:731–755).
- **403 for out-of-scope by-id targets:** breaks the no-oracle contract (v1.1). Unknown id, foreign id, and out-of-scope id must be byte-identical 404s — copy the `fileNotFound` discipline in `serveFileBinary`.
- **Scope elevation:** scope can only subtract reach (SCOPE-01). Never let a scope row expand what the role rank allows (e.g. a scoped member must not pass `requireWorkspace('admin')` gates).
- **Filtering the members roster for scoped members:** D-05 locks the full roster (needed for mentions/assignment context). Only scope *details* are hidden.
- **Server-side filtering of the notifications list:** D-07 — enforcement at send time only; pre-scope notifs stay visible.
- **Forgetting `mergeClientDoc`'s signature:** it computes `hiddenProjectIds(stored, memberId)` (server.js:799) with no access to the membership's scope/team set — the signature must gain the scope or the membership row, or the write guard silently misses scope.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-list scope filtering | Nine separate filters per data type | Extend `hiddenProjectIds()` once | redactDoc/mergeClientDoc already fan out to every list |
| 404-no-oracle responses | Custom error shapes per route | Reuse `fail(res, 404, 'fileNotFound'/'notFound', ...)` existing codes | Consistent, tested oracle-free contract |
| Migration safety | Ad-hoc column detection | `ensureColumn` (server.js:223) + `test/migration.test.mjs` byte-identical pin | Established, pinned |
| Scope validation | Free-form JSON acceptance | Mirror the invite `teams` whitelist (server.js:3614–3632: trim/slice/dedup/cap 25/whitelist-vs-doc) | Injection and stale-id defense already solved |
| Client target pre-filtering | New notification subsystem | Existing `Set`-based targeting in `emitMentions` (actions.js:139–154) + `assignableInProject` (store.js:430) | Dedup and gating are structural |

**Key insight:** every sub-problem was solved in v1.1 (private-project redaction, no-oracle 404s) or Phase 28 (authority rows, invite-carried team sets, admin-gated membership routes). Phase 29 is composition of those two precedents, plus one genuinely new thing: the scope *grant* (D-03) inverts the private-project default and must be reasoned through carefully.

## Runtime State Inventory

Not a rename phase, but new persistent state is introduced — the equivalent audit:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | New `memberships.scope` and `invites.scope` JSON columns (null default — legacy = workspace-wide, correct without backfill) | Additive ensureColumn only |
| Stored data | No existing scope data anywhere to migrate [VERIFIED: grep for "scope" in server.js returns only unrelated uses] | None |
| Live service config | None — self-hosted SQLite, no external services | None |
| OS-registered state | None — verified: no scheduler/registration touches memberships | None |
| Secrets/env vars | None — scope is not secret material | None |
| Build artifacts | None — plain ESM served directly | None |

## Common Pitfalls

### Pitfall 1: the D-03 grant vs the private-project default
**What goes wrong:** composing scope as `visible = canSeeProject(p) && inScope(p)` silently *removes* private projects from a scoped member who was explicitly granted one — scope then restricts more than it should, and the explicit-grant case (SCOPE-06 guest on a private project) breaks entirely.
**Why:** `canSeeProject` answers "is this private project's access list satisfied", which a fresh scope grant never is.
**Avoid:** for scoped members, visibility = `inScope(p) && (explicitly granted || !private || on access list)`. Write the truth table in the plan and test each cell: public+in-scope, public+out-of-scope, private+in-scope-on-list, private+in-scope-off-list (D-03 ⇒ visible), private+out-of-scope.
**Warning signs:** guest invite to a private project sees nothing after acceptance.

### Pitfall 2: out-of-scope write resurrected through mergeClientDoc
**What goes wrong:** a scoped client still has a pre-scope doc copy; its next doc PUT ships out-of-scope rows, and if the merge reservation set doesn't know about scope, the rows land in the stored doc.
**Why:** `mergeClientDoc(incoming, stored, membership)` computes `hiddenProjectIds(stored, memberId)` (server.js:799) from private-project logic only.
**Avoid:** pass the scope into the merge (signature change or membership lookup inside), so hidden = private-hidden ∪ out-of-scope. Both read and write funnels must use the SAME hidden-set function.
**Warning signs:** out-of-scope rows reappear in the stored doc after a scoped session saves.

### Pitfall 3: file-by-id side door leaks bytes
**What goes wrong:** `serveFileBinary` (server.js:4033) finds the record by id in the doc and serves bytes with no project-visibility check — a scoped member (or a private-project outsider) with a guessed/leaked file id gets the binary today.
**Avoid:** after record lookup, check `record.project` against the caller's visible set; out-of-scope ⇒ same 404 `fileNotFound` as unknown id. This is the clearest pre-existing no-oracle gap the sweep must close.
**Warning signs:** 404-matrix test for file serve passes for unknown ids but 200s for out-of-scope ids.

### Pitfall 4: notification recipients chosen from the wrong roster snapshot
**What goes wrong:** mention/assignment fan-out is client-side (actions.js:100, 139–154, 183) using the *actor's* doc copy; a scoped actor targeting an in-scope project can still @mention an out-of-scope member, and reminder emails are built server-side from assignees without scope awareness.
**Avoid:** three enforcement points, all send-time (D-07): (a) client emit pre-filters targets by target-member scope (server can expose each member's scope-relevant eligibility, or the client derives it from the projected roster — planner decides); (b) `runReminderPass` skips out-of-scope assignees; (c) `queueNotifEmails` (server.js:901) skips out-of-scope recipients as defense in depth. Also close the Phase 28 seam: server-side write guard rejecting assignments of out-of-scope assignees in `mergeClientDoc`.
**Warning signs:** SCOPE-04 matrix test finds a scoped member notified for an out-of-scope project.

### Pitfall 5: scope row on an admin membership
**What goes wrong:** a stale client or crafted API call attaches scope to an admin/owner; if reads honor it, an admin is silently blinded — or worse, the code treats "has scope" as "is scoped viewer" and breaks admin gates.
**Avoid:** D-04 server-side: scope-write route forces null for admin+ targets; `projectScope()` returns null regardless of stored JSON when role is admin+; member PATCH route that *promotes* to admin clears scope in the same transaction (server.js:3470 role update site).
**Warning signs:** scoped admin sees 404s on workspace routes.

### Pitfall 6: team ids drift when a team or project is deleted
**What goes wrong:** scope JSON references doc-held team/project ids; deleting a team/project in another session leaves dangling scope ids.
**Avoid:** predicate treats unknown ids as no-op (naturally safe); team/project delete paths optionally purge scope references (mirror Phase 28's team-delete purge of `team_members`); whitelist validation on every scope write keeps new rows clean.
**Warning signs:** scope editor shows blank names after a team deletion.

### Pitfall 7: 404-matrix tests written against implementation, not families
**What goes wrong:** tests enumerate routes one-by-one and rot on the first route addition.
**Avoid:** structure the sweep as a table: family → probe (in-scope id / out-of-scope id / unknown id) → expected status, driven by a helper that hits each family with the same fixture member. A new project-touching route added later should visibly fail the "did you add it to the matrix" review because the matrix is the named artifact SCOPE-03 asks for.

## Code Examples

### Verified current read funnel (the thing being extended)

```js
// Source: server.js:602-605 — verbatim
function canSeeProject(p, memberId) {
  if (!projectIsPrivate(p)) return true;
  return !!memberId && Array.isArray(p.members) && p.members.includes(memberId);
}
// Source: server.js:653-659 — verbatim
function hiddenProjectIds(doc, memberId) {
  const seen = new Set();
  for (const p of doc?.data?.projects || []) {
    if (p?.id && !canSeeProject(p, memberId)) seen.add(p.id);
  }
  return seen;
}
// Source: server.js:731-735 — verbatim head of redactDoc
function redactDoc(doc, memberId) {
  const data = doc?.data;
  if (!data) return doc;
  const hiddenProjects = hiddenProjectIds(doc, memberId);
  if (!hiddenProjects.size) return doc;
```

### Verified current write-guard entry (signature to change)

```js
// Source: server.js:792-807 — verbatim
function mergeClientDoc(incoming, stored, membership) {
  const next = incoming && typeof incoming === 'object' ? JSON.parse(JSON.stringify(incoming)) : {};
  next.data = next.data && typeof next.data === 'object' ? next.data : {};
  normalizeProjects(stored);
  normalizeProjects(next);
  const memberId = membership?.member_id || null;
  const role = membership?.role || 'member';
  const hiddenProjects = hiddenProjectIds(stored, memberId);
```
`membership` is already passed in — the scope can be derived from it (or from a `teamsOfUser` lookup via `membership.user_id`) **without a signature change**. That is the minimal-diff path: `hiddenProjectIds` gains an optional scope-aware variant, or a new `hiddenFor(stored, membership)` composes private-hidden with out-of-scope.

### Verified Phase 28 authority readers the scope predicate consumes

```js
// Source: server.js:1185-1190 — verbatim
function teamsOfUser(workspaceId, userId) {
  return db
    .prepare('select team_id from team_members where workspace_id = ? and user_id = ? order by team_id')
    .all(workspaceId, userId)
    .map(r => r.team_id);
}
```

### Verified notification fan-out (client, send-time filter site)

```js
// Source: src/actions/actions.js:139-154 — assignment notify at :100,
// watcher notify at :183; store.js notifyMembers at :283; assignableInProject at store.js:430
export function emitMentions(txt, tk) {
  const { memberIds, teamIds } = parseMentions(txt || '');
  // ... Set-based targeting, then:
  notifyMembers([...targets], { type: 'mention', by: D().me, task: tk?.id ?? null, project: tk?.project ?? null, snippet });
}
```

### Verified invite-teams validation to mirror for scope

```js
// Source: server.js:3614-3632 — verbatim pattern (teams; scope validation mirrors it)
if (body?.teams !== undefined && !Array.isArray(body.teams)) return fail(res, 400, 'teamsRequired', 'Provide a teams array');
if ((body?.teams || []).length > 25) return fail(res, 400, 'tooManyTeams', 'Too many teams');
const knownTeams = new Set((JSON.parse(ctx.ws.doc)?.data?.teams || []).map(t => t?.id).filter(Boolean));
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Workspace-wide membership only | Membership + optional scope (this phase) | Phase 29 | Reach restriction layered on the role ladder without touching ROLE_RANK |
| Private projects = the only reach limit | Private logic + scope grant (D-03) | This phase | Scope can OPEN private projects — new semantics, not just more redaction |
| `invites.teams` JSON (P28) | `invites.scope` JSON beside it | This phase | Same storage/acceptance pattern |
| File serve checked auth+existence only | Also scope/visibility checked | This phase | Closes the last by-id side door |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Team-scope reach grants visibility of private team-linked projects (D-01 union read), not just explicit project grants | Pattern 1 | If team reach should NOT open private projects, the predicate drops the grant for team-derived ids — one-line change, but a 404-matrix cell flips |
| A2 | `runReminderPass` iterates assignees per workspace and can filter per-member without restructuring | Pitfall 4 | If reminders are computed doc-wide in one pass, a small refactor lands in this phase |
| A3 | Guest "exactly one project" enforced at invite creation only (editing later can loosen via the member modal by an admin) | Pattern 4 | Cosmetic policy choice; planner confirms |
| A4 | Client send-time filtering derives target eligibility from server-projected member data rather than a new API | Pitfall 4 | If the client cannot know other members' scopes (D-05 hides scope details), the pre-filter needs a server-provided eligibility flag per member — planner must decide the projection shape |
| A5 | Column name `scope` on memberships/invites | Patterns 2/4 | Cosmetic (discretion); migration test pins whatever is chosen |

Note on A4 — the interesting tension: D-05 says scope *details* are never shown, yet SCOPE-04 send-time filtering needs the actor to know who is out of scope for a project. Resolution options: server projects a boolean per member (e.g. derived eligibility) without the raw scope, or the server rejects rather than the client filters. Flag for planning.

## Open Questions (RESOLVED)

All three questions were resolved by plan backstops at planning time:

1. **Does team-derived reach open private projects (D-03 extension)?** — **(RESOLVED)** Yes: union semantics per Plan 02's scope predicate truth table (visible = inScope && (projects.includes || teamReach || !private || onAccessList)); proven by the matrix truth-table rows.
2. **How does the client filter mention/assign recipients without seeing scope details (D-05)?** — **(RESOLVED)** Per Plan 03's send-time filter backstop: eligibility derived from server-projected data; server-side guard (Pitfall 4) is the authority either way.
3. **Scope-write on admin target: 400 vs silent null?** — **(RESOLVED)** Explicit 400 `scopeNotAllowed` (Plan 01 scope-edit route behavior; 29-04 Task 1 applies the same code to invites).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | everything | ✓ | 24.21.0 (node:sqlite stable) [VERIFIED: Phase 28 shell check] | — |
| node:test | 404-matrix + migration tests | ✓ | built-in | — |

No missing dependencies. No external services required.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (built-in), concurrency 2 |
| Config file | none (glob in package.json `test` script) |
| Quick run command | `node --test test/scope.test.mjs test/membership.test.mjs test/migration.test.mjs` |
| Full suite command | `node --test --test-concurrency=2 test/*.test.mjs` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCOPE-01 | Scope CRUD via API; D-04 forced-null on admin; workspace-wide default | integration | `node --test test/scope.test.mjs` | ❌ Wave 0 |
| SCOPE-02 | Read redaction + write reservation for out-of-scope; D-03 grant truth table | integration | `node --test test/scope.test.mjs` | ❌ Wave 0 |
| SCOPE-03 | 404-matrix per family (doc GET omission, doc PUT rejection/rollback, file serve 404, unknown==out-of-scope byte-identical) | integration | `node --test test/scope.test.mjs` | ❌ Wave 0 |
| SCOPE-04 | Assign/mention/reminder targeting skips out-of-scope members; server write-guard rejects out-of-scope assignee | unit + integration | `node --test test/scope.test.mjs` | ❌ Wave 0 |
| SCOPE-05 | Invite carries scope; acceptance lands it | integration | `node --test test/scope.test.mjs` | ❌ Wave 0 |
| SCOPE-06 | Guest (viewer + one project) sees exactly that project; private-project guest grant | integration | `node --test test/scope.test.mjs` | ❌ Wave 0 |
| (migration) | Scope column additive, byte-identical second boot | integration | `node --test test/migration.test.mjs` | ✅ extend existing |

### Sampling Rate
- **Per task commit:** quick run of touched test file
- **Per wave merge:** full suite
- **Phase gate:** full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/scope.test.mjs` — the 404-matrix harness + scope-predicate unit tests (SCOPE-01..06)
- [ ] Fixture: workspace with 2 public + 2 private projects, 2 teams, one scoped viewer, one guest, one admin — reuse `test/helpers/server.mjs` (`login`, `startServer`, `withDb`) and `test/helpers/legacy-fixture.mjs` patterns
- [ ] Extension to `test/migration.test.mjs` for the scope column pin

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | yes — this phase IS access control | Scope predicate in `canSeeProject`/`hiddenProjectIds`/`mergeClientDoc`; admin gate on scope writes; 404 no-oracle everywhere |
| V5 Input Validation | yes | Whitelist scope ids against doc teams/projects; cap array length; mirror server.js:3614–3632; sameOrigin on writes |
| V1 Existence oracle | yes | Unknown id ≡ foreign id ≡ out-of-scope id: identical 404 status + error code |
| V3 Session Management | no change | existing session middleware untouched |
| V6 Cryptography | no | no new secrets |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Existence oracle via differentiated errors | Information Disclosure | Byte-identical 404 (`fileNotFound`/`notFound`) for unknown, foreign and out-of-scope ids |
| Scope bypass by writing through doc PUT | Elevation of Privilege | `mergeClientDoc` reservation includes out-of-scope; server write-guard on assignees |
| File-by-id side door | Information Disclosure | `record.project` visibility check in `serveFileBinary` before streaming |
| Scope attached to admin account (self-blinding or gate confusion) | Tampering | D-04 server-side: force null on admin+ targets and on promotion to admin |
| Dangling scope ids after team/project deletion | Tampering/Data integrity | Treat unknown ids as no-op in predicate; purge scope refs on delete (Phase 28 pattern) |

## Project Constraints (from AGENTS.md)

No project-level `AGENTS.md` exists at repo root [VERIFIED: file check this session]. Milestone invariants apply: EN+FR catalogue strings at write time, additive-only byte-identical-boot migrations, zero new runtime dependencies, full suite green. Proven verify commands from Phase 28: `node --test test/membership.test.mjs`, `node --test test/migration.test.mjs`, `node --test --test-concurrency=2 test/*.test.mjs`.

## Sources

### Primary (HIGH confidence)
- In-repo reads this session: server.js lines 95–124 (ROLE_RANK/ROLE_LABEL), 200–260 (ensureColumn, team_members SCHEMA), 595–789 (canSeeProject, hiddenProjectIds, redactDoc, merge helpers), 790–879 (mergeClientDoc), 1100–1240 (docForClient/docFromClient, teamsOfUser/teamsByUser, memberPayload, invitesOf), 2278–2296 (requireWorkspace), 2377–2386 (reminder-pass route), 3290–3404 (doc GET/PUT/PATCH/DELETE), 3432–3569 (member PATCH, member teams PUT), 3603–3660 (invite POST + teams validation), 3746–3830 (invite accept), 3986–4075 (handleUpload, serveFileBinary), 4150–4206 (route interception order); all 39 pathname match sites enumerated via grep; src/actions/actions.js:100–183 (notify/mention sites), src/core/store.js:283/430 (notifyMembers, assignableInProject)
- .planning/phases/28-multi-team-membership/28-RESEARCH.md (Phase 28 patterns, Node version, test helpers)
- .planning/REQUIREMENTS.md (SCOPE-01..06 verbatim), 29-CONTEXT.md (all decisions)

### Secondary / Tertiary
- None required — zero external libraries; all research is codebase-local.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; node:sqlite/node:test established
- Architecture: HIGH — every route-match site and both enforcement funnels read and quoted verbatim this session
- Pitfalls: HIGH — each derived from actual current code paths (file-serve gap, mergeClientDoc signature, D-03 inversion) rather than generic advice

**Research date:** 2026-11-02
**Valid until:** 2026-12-02 (codebase-local; re-verify only if server.js routes change before planning)
