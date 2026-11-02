---
phase: 29-team-project-scoped-permissions
reviewed: 2026-11-02T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - server.js
  - src/actions/actions.js
  - src/core/api.js
  - src/core/store.js
  - src/locales/en.json
  - src/locales/fr.json
  - src/overlays/modals.js
  - test/error-codes.test.mjs
  - test/i18n-core-features.test.mjs
  - test/i18n-shell.test.mjs
  - test/i18n-toast.test.mjs
  - test/migration.test.mjs
  - test/scope.test.mjs
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 29: Code Review Report

**Reviewed:** 2026-11-02
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Phase 29's server core (scope predicate, `hiddenFor` funnel, D-03 grant inversion, scope route, invite-carried scope, send-time guards) is well built and well tested: `test/scope.test.mjs` (981 lines, all passing) pins the 404-no-oracle matrix, the truth table, the guest model and all three send-time guards. `hiddenFor` correctly replaces the conjunctive `canSee && inScope` form, and `scopeGrants` implements the D-03 inversion so a scoped guest opens a private in-scope project. Locale keys for the new UI are present in both `en.json` and `fr.json` (the single key-set difference is the intentional `contract.englishOnly`/`contract.frenchOnly` pair), and the additive `scope` migrations are idempotent (`test/migration.test.mjs`).

The defects found are concentrated at the seams: one access-broadening bug in the invite-resend path (the server never projects `scope`, so a resend silently strips it), a dead task lookup that makes the reminder scheduler — and the SCOPE-04 guard riding it — never execute, an un-normalized doc passed to the file-serve scope check, and a UI-label vs API-role mismatch in copy-invite-link. All are concrete, line-cited, and fixable locally.

Verification run: `node --test test/scope.test.mjs test/migration.test.mjs test/error-codes.test.mjs test/i18n-core-features.test.mjs test/i18n-shell.test.mjs test/i18n-toast.test.mjs` → 159 pass, 0 fail, 3 skipped.

## Critical Issues

### CR-01: Resending a scoped invite silently strips its scope (access broadening)

**File:** `src/actions/actions.js:2247` with `server.js:1364-1391`
**Issue:** `A.resendPendingInvite` passes `row.scope || null`, where `row` comes from `S.ui.pendingInvites` (populated at `actions.js:2096` from `api.invites()`). But the server's `invitesOf()` never selects or projects the `scope` column — its SELECT is `token_hash, email, role, teams, created_at, expires_at` and its payload mapping omits `scope`. So `row.scope` is always `undefined`, the resend creates a replacement invite with **no scope**, and (because one live invite per address replaces the previous one, `server.js:3898`) the original scoped invite is destroyed. When the recipient accepts, `addMembership` writes `scope = null` — a workspace-wide membership. A guest invited to exactly one private project (D-13) becomes a workspace-wide viewer after any admin clicks "resend": the entire workspace's project names, tasks and activity become visible to them. This is a silent privilege broadening through a routine admin action.
**Fix:** project the scope in `invitesOf` so the client can echo it back:

```js
// server.js — invitesOf SELECT
`select token_hash, email, role, teams, scope, created_at, expires_at
   from invites ...`
// and in the mapping body:
let scope = null;
try { scope = JSON.parse(r.scope || 'null'); } catch { scope = null; }
if (!scope || typeof scope !== 'object' || Array.isArray(scope)) scope = null;
return { id: r.token_hash, email: r.email, role: r.role, roleLabel: ..., teams, scope, createdAt: ..., expiresAt: ... };
```

`A.resendPendingInvite` then works unchanged. Add a `test/scope.test.mjs` case: create a scoped invite → GET invites → assert the payload carries `scope` → resend → assert the fresh invite row still carries it.

## Warnings

### WR-01: `runReminderPass` reads `t.projectId` but tasks store `project` — the scheduler, and the SCOPE-04 guard riding it, never run

**File:** `server.js:1178` (and dead fallback at `server.js:1062`)
**Issue:** Task rows in the document carry `project` (client `createTask` writes `project: p.id`; the server's own `hiddenTaskIds` and `queueNotifEmails` read `t.project`/`n.project`). Line 1178 does `projects.get(t?.projectId)`, which is always `undefined`, so `remindable(task, project)` fails its `!project` check for every task: **no due-date reminder ever fires**, for any workspace. Consequently the Phase 29 in-scope guard added at line 1187 (`if (!inScopeProject(project, projectScope(assigneeMembership))) continue;`) is unreachable in practice — the SCOPE-04 reminder guarantee holds vacuously. The `task?.projectId` fallback in `queueNotifEmails` (line 1062) is the same dead key. Pre-existing from Phase 27, but the Phase 29 guard was added on top of the dead path, so it is in scope.
**Fix:** `const project = projects.get(t?.project);` (line 1178); drop the dead `task?.projectId` fallback at line 1062. Add a reminder-pass test whose task uses the real `project` key — the existing tests presumably seeded `projectId`-shaped rows and therefore never exercised the live shape.

### WR-02: The file-serve scope check runs on the un-normalized stored document — legacy scalar-`team` projects 404 inconsistently

**File:** `server.js:4292-4307`
**Issue:** `serveFileBinary` builds `hiddenFor({ data }, ctx.membership)` from the raw `JSON.parse(ctx.ws.doc)?.data` without calling `normalizeProjects` first. `normalizeProjects` (lines 696-730) is what migrates the legacy scalar `p.team` into the `teams[]` array every other funnel relies on. For a project still carrying the scalar form, `inScopeProject`/`scopeGrants` read `p.teams` (undefined) and miss the team reach, so a scoped member whose scope matches via team sees the project in the doc read (`docForClient` normalizes before `redactDoc`) but gets the byte-identical 404 on its files — the doc view and the bytes disagree for the same caller and project.
**Fix:** normalize before the funnel:

```js
data = JSON.parse(ctx.ws.doc)?.data;
if (data) normalizeProjects({ data });
record = Array.isArray(data?.files) ? data.files.find(f => f?.id === id) : null;
```

or extract a tiny `hiddenForRaw(doc, membership)` wrapper that runs `normalizeProjects` on a shallow clone first.

### WR-03: `copyInviteLink` compares a UI label against an API role — an admin link can be submitted with scope and rejected

**File:** `src/actions/actions.js:1949`
**Issue:** `A.copyInviteLink` reads `role = S.ui.inviteRole || ...` — a UI label (`'Member' | 'Admin' | 'Guest'`, the `INVITE_ROLE_OPTIONS` shape) — then tests `role === 'admin'`, which is never true. `A.submitInvite` correctly tests `role === ROLE_ADMIN_UI` (line 1826). Consequence: an admin who toggles scope picks and then switches the role to Admin still carries `S.ui.inviteScope`; the copy-link path sends `{ role: 'admin', scope: {...} }`, which the server rejects with 400 `scopeNotAllowed` (`server.js:3865`), so "copy invite link" fails with an error toast instead of producing a link. No security impact (the server validates), but it is a client/server contract inconsistency between two paths that must mirror each other.
**Fix:** `const scope = role === ROLE_ADMIN_UI ? null : ...` in `copyInviteLink`, matching `submitInvite`.

### WR-04: An unparseable stored scope fails open to workspace-wide, silently

**File:** `server.js:632-644`
**Issue:** `projectScope` degrades to `null` (workspace-wide) on unreadable JSON, a non-object payload, or a JSON `null` — a deliberate availability choice per the D-01/D-04 comment, but it is also the one path where corrupt or tampered authority data *broadens* access, and it does so with no signal. Every other fail path in this phase (undecryptable TOTP envelope, unknown key id) is loud. An admin who scopes a member down and later sees them browsing everything has no way to tell "scope cleared" from "scope column corrupt".
**Fix:** keep the fail-open semantics, but log once per boot per affected row (or at minimum `console.warn` in the `catch`), mirroring the D-K7 unrecognized-envelope warning pattern. Alternatively persist scope as a typed column pair — but the warn is the cheap fix.

## Info

### IN-01: Re-accepting an invite coalesces scope — a new invite's scope can never replace an old one

**File:** `server.js:2203-2210`
**Issue:** `addMembership`'s `on conflict ... scope = coalesce(excluded.scope, memberships.scope)` preserves an existing scope when the new invite carries none (good for the legacy callers), but it also means an admin who re-invites an existing scoped member with a *different* intended scope silently keeps the old one — the invite's scope column exists, is validated, and is then discarded on conflict. Not a security hole (fail direction is restrictive), but surprising.
**Fix:** none required this phase; document the coalesce in the SCOPE-05 comment, or have the invite-accept path reconcile when `excluded.scope` is non-null.

### IN-02: `A.resendInvite` (member re-invite) omits scope by implicit reliance on the coalesce

**File:** `src/actions/actions.js:1954-1965`
**Issue:** Unlike `A.resendPendingInvite`, the member-context-menu resend passes no scope at all. Correctness currently rides entirely on IN-01's coalesce keeping the member's stored scope. A one-line comment on the call would prevent a future refactor from "fixing" the asymmetry in the wrong direction.
**Fix:** comment, or pass the member's projected scope explicitly once D-05 projection policy is revisited.

### IN-03: Scope-building logic is triplicated across the client

**File:** `src/actions/actions.js:1825-1833, 1945-1949, 2050-2053`
**Issue:** The "read `S.ui.*Scope`, Set-dedup both lists, empty → null" block appears three times (submitInvite, copyInviteLink, submitMemberTeams) — and the triplication is exactly where WR-03's drift happened.
**Fix:** extract `const scopeFromPicker = st => { const teams = [...new Set(st?.teams || [])]; const projects = [...new Set(st?.projects || [])]; return teams.length || projects.length ? { teams, projects } : null; };` and reuse.

---

_Reviewed: 2026-11-02_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
