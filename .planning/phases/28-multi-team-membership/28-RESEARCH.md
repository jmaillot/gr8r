# Phase 28: Multi-Team Membership - Research

**Researched:** 2026-11-01
**Domain:** Schema migration + full-stack data-flow refactor (node:sqlite join table, additive migration, doc/authority split)
**Confidence:** HIGH (all findings verified in-repo this session; no external libraries involved)

## Summary

This phase moves team membership out of two places — the scalar `memberships.team` column and the client-mergeable `doc.teams[].members` / `member.team` fields — into a single authority: a `team_members` join table keyed on `(workspace_id, team_id, member_id)` or `(workspace_id, team_id, user_id)`. Every read surface (rosters, autocompletes, @team fan-out, assignment picker, project `teams[]` visibility) then derives from that set. The codebase already half-does this: memberships, invites, and sessions are authority tables, and `syncProfiles`/`docForClient` already rebuild doc projections from tables on every read (`server.js:1103-1214`). This phase completes the established pattern for the last client-mergeable piece of membership data.

The work decomposes into five separable concerns: (1) **migration** — SCHEMA gains `create table if not exists team_members`, a one-time backfill from `memberships.team`, and a `vacuum into` pre-backup copied verbatim from `migrateTenancy()` (server.js:1365-1378); (2) **write path** — new admin-gated API routes for add/remove membership-team rows, replacing `syncMemberTeams()` (server.js:1019) and the member-update route's scalar `team` handling (server.js:2919-2932); (3) **read path** — `syncProfiles`/`memberProfile` stop mirroring one `team`, instead projecting a `teams[]` array from the join table into doc member profiles for display; (4) **client surfaces** — teams modal, members-page edit modal, invite form (D-05/D-06/D-07); (5) **server-side fan-out/intersection** — mention targeting (currently client-side `m.team === tid` at src/actions/actions.js:143) and assignment eligibility.

**Primary recommendation:** Introduce `team_members(workspace_id, team_id, member_id, user_id)` rows keyed on member_id (profiles in the doc are keyed by member_id, and the join table must intersect with `project.teams[]` which stores member-visible team ids from the doc `teams[]` definitions that stay in the doc). Backfill one row per member with a non-null scalar `team`. Never let membership enter `docFromClient`/`mergeClientDoc` again — pin this with the TEAM-05 regression test.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Team membership edited through **new server API routes** (admin-gated, e.g. add/remove a membership-team row). Teams modal and members page call the API; the workspace document never carries membership.
- **D-02:** `doc.teams[].members` arrays dropped; `syncMemberTeams()` (server.js:1019) deleted. Team definitions (id, name, color) stay in the doc; only membership rows move out.
- **D-03:** `memberships.team` is the migration source of truth: one `team_members` row per member whose scalar team is set. Doc `teams[].members` lists ignored and dropped. Members with `team = null` get no rows — teamless is valid.
- **D-04:** After migration, scalar `memberships.team` column stays in schema (additive-only discipline) but nothing reads or writes it. No "primary team" concept.
- **D-05:** Team membership editable from **both** the teams modal (multi-select per member, replacing single-team assignment) and the members page.
- **D-06:** On the members page, team editing lives in the **existing member edit modal**, which gains a multi-select team picker next to role — reusing existing modal and catalogue strings (EN+FR), not inline table checkboxes.
- **D-07:** Invites support multiple teams at once: `invites.team` becomes `invites.teams` (JSON array), invite form multi-select, acceptance inserts one `team_members` row per team.

### the agent's Discretion
- Exact API route naming/shape for membership edits (planner + codebase conventions).
- Server-side resolution mechanics for @team fan-out and assignment-intersection filtering (call sites identified: client-side at `src/actions/actions.js:143`).
- Migration test specifics beyond the pinned `test/migration.test.mjs` byte-identical boot.

### Deferred Ideas (OUT OF SCOPE)
- Per-team roles / per-membership permission levels — explicitly excluded by TEAM-01 (role ladder stays the ceiling). Phase 29 adds scope (reach restriction), not elevation.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEAM-01 | Multi-team membership in authority rows, additive migration from scalar with pre-backup and byte-identical second boot; role ladder unchanged | `team_members` table + backfill in SCHEMA/migration; backup via `vacuum into` pattern (server.js:1365); `ROLE_RANK` gating unchanged |
| TEAM-02 | Every team surface reads the real set | Read path: `syncProfiles` projects `teams[]` per member from join table; teams modal, autocompletes, roster counts (teams.js:98), project visibility all re-sourced |
| TEAM-03 | @team fan-out with cross-team dedup | Client fan-out at src/actions/actions.js:143 uses `Set`-based targeting already — dedup free; membership lookup moves to server-provided set |
| TEAM-04 | Assignment picker restricted to team-set intersection with project `teams[]` | `projTeams(p)` (store.js:385-392) gives project side; member side from join-table set; intersection filter in picker + server-side guard |
| TEAM-05 | Membership never in client-mergeable doc; concurrent-write regression test | Delete `doc.teams[].members` writes; `mergeClientDoc` never sees membership; test pins a membership change surviving a concurrent doc PUT |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| team_members authority rows + migration | Database (node:sqlite) | — | Authority rows, additive schema, byte-identical boot |
| Membership edit API (add/remove team rows) | API/Backend | — | Admin-gated server route; doc never carries membership (D-01) |
| Roster/autocomplete/roster-count display | Frontend (client) | API (server-provided `teams[]` projection) | Client renders; data arrives via `member.teams[]` in doc members + members list payloads |
| Invite multi-team create/accept | API/Backend | Frontend (form) | `invites.teams` JSON column; acceptance inserts rows server-side |
| @team mention fan-out + dedup | Client (parse) + API (delivery) | — | `parseMentions`/`emitMentions` are client-side today (actions.js:117-150); targeting set is Set-based — dedup is free |
| Assignment eligibility (TEAM-04) | Frontend (picker filter) | API (write guard) | Client filters picker; server should also reject ineligible assignees to be authoritative |
| Project `teams[]` visibility | Client | — | Already multi-team (P3, server.js:544-551, store.js:180) — only the member-side comparison changes |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node:sqlite (DatabaseSync) | Node 24.21.0 [VERIFIED: shell `node --version`] | Join table, migration, backfill — zero runtime deps invariant | Project-mandated (PROJECT.md v1.6 constraints) |
| node:test + node:assert/strict | built-in | Migration + regression tests in `test/*.test.mjs` | All 57 existing test files use it [VERIFIED: test/ listing] |

No new packages — zero-dependency invariant means **no Package Legitimacy Audit is required** (nothing to install).

## Architecture Patterns

### System Architecture Diagram

```
Admin UI (teams modal / member edit modal / invite form)
        │  POST/DELETE /api/workspaces/:ws/teams/:tid/members   (new, admin-gated)
        │  POST /api/workspaces/:ws/invites  {teams: [...]}      (extended)
        ▼
SQLite authority: team_members(workspace_id, team_id, member_id, user_id)
        │  (writes in transaction; memberships.team column untouched, unread)
        ▼
Read projection: syncProfiles / memberPayload → member.teams[]  ──────────────┐
        │                                                                      │
        ▼                                                                      ▼
Doc members display projection ──► Client surfaces:                     Project visibility:
  • rosters (teams modal per-member multiselect)                        projTeams(p) ∩ member.teams[]
  • mention autocomplete + @team fan-out (Set → dedup free)             (TEAM-04 picker + server guard)
  • assignment picker (intersection filter)
  • team member counts (teams.js:98)

Concurrent doc writes (two sessions): membership change via API touches NO doc
fields ⇒ a second session's doc PUT cannot clobber it (TEAM-05, regression test).
```

### Recommended Project Structure

No new files required by convention; extensions follow existing layout:
```
server.js                  # team_members SCHEMA block + migration + new routes (pattern: existing route regexes)
src/core/api.js            # client API wrapper additions (createMemberTeams / deleteMemberTeam)
src/actions/teams.js       # teams modal: per-member multiselect calling API
src/actions/actions.js     # member edit modal team picker; emitMentions reads member.teams[]
src/data/seed.js           # seed member team sets aligned to authority (demo mode)
test/migration.test.mjs    # extend: team_members backfill, byte-identical second boot
test/membership.test.mjs   # extend or new: TEAM-05 concurrent-write regression
```

### Pattern 1: Additive join-table migration (established pattern, adapted)

`ensureColumn()` (server.js:223-226) handles columns only; a join table needs the SCHEMA `create table if not exists` plus a guarded backfill, mirroring `migrateTenancy()`:

```js
// Source: server.js:1365-1378 (backup) + SCHEMA block pattern (server.js:140-226)
// In a migrateTeamMembership() called from openDb()/boot sequence:
if (needBackfill) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(DATA_DIR, `projects-pre-team-members-${stamp}.db`);
  db.exec('pragma wal_checkpoint(truncate)');
  db.exec(`vacuum into '${backup.replaceAll("'", "''")}'`);
  // one row per member whose scalar team is set (D-03)
  // insert into team_members select workspace_id, team, member_id, user_id from memberships where team is not null
}
```
**When to use:** every schema addition in this project. **Warning:** `ensureColumn` has already added both `member_id` and `team` to memberships (server.js:240, 242 — the `team` column is *not* in the base SCHEMA create statement, only added there), so the backfill must read the column defensively or rely on the `ensureColumn` call preceding migration.

### Pattern 2: Authority rows + rebuilt doc projection (existing)

`syncProfiles` (server.js ~1103-1214) already rebuilds doc member profiles from the memberships table on every read; `memberProfile()` (server.js:1750) currently writes `team: row.team || null`. The change: `memberPayload`/`memberProfile` emit `teams: [...]` (array of team ids from `team_members`) instead of the scalar — mirroring how projects did the same scalar→array move in P3 (`normalizeProjects`, server.js:544-551, tolerant of legacy shape via `projTeams`).

### Pattern 3: Set-based notification targeting (dedup is free)

`emitMentions` (src/actions/actions.js:131-150) accumulates into a `Set` before `notifyMembers` — a user in two simultaneously mentioned teams is added twice to the Set and notified once [VERIFIED: src/actions/actions.js:138-150]. Only the membership predicate changes: `m?.team === tid` → `member.teams.includes(tid)` against the projected array. Note `parseMentions` "consumes" matched team names out of the text so overlapping name prefixes don't double-fire — unchanged.

### Anti-Patterns to Avoid
- **Writing membership through `updateDoc`/`mergeClientDoc`:** the doc merge is where the clobber hazard lives. Membership edits must touch only the join table inside their own transaction, never bump or read the doc revision.
- **Introducing a "primary team":** D-04 forbids it. UIs must handle teamless members (valid state per D-03) — the existing `NO_TEAM` pseudo-team (store.js:369-380) already models this.
- **Forgetting the revision contract:** every endpoint that *does* edit the doc must return `wsRevision()` or clients get stale-revision 409s (server.js comment at the `wsRevision` definition). Membership-only routes may not need a revision bump at all — decide explicitly.
- **Deleting `doc.teams[].members` from the server read path but leaving client code that writes it:** `src/actions/teams.js` currently edits `D().members[].team` and `t.members` directly (lines 30, 75, 98, 113); every one of these must move to API calls in the same task or the regression test will flake.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pre-migration backup | Custom file copy of the live DB | `pragma wal_checkpoint(truncate)` + `vacuum into` (server.js:1372-1377) | WAL-safe, consistent snapshot, existing pattern |
| Byte-identical second boot check | Ad-hoc diff script | Extend `test/migration.test.mjs` pattern: capture `pragma table_info` + row dumps before/after second boot | Existing test already proves idempotency for tenancy |
| Notification dedup | Custom per-recipient dedup table for mentions | Existing `Set` targeting + `notifPrefs` gating | Dedup is structural in `emitMentions` |
| Concurrency isolation | Client-side locks / optimistic UI for membership | SQLite `begin immediate` transactions (as `addMembership` does, server.js:1788-1800) | Server is the authority; doc merge no longer involved |

**Key insight:** the project has solved each sub-problem before (tenancy migration, doc-projection rebuild, Set-based targeting). Phase 28 is composition, not invention.

## Runtime State Inventory

Not a rename/rebrand phase, but membership data moves homes — the equivalent audit:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `memberships.team` scalar values in existing installs [VERIFIED: ensureColumn at server.js:242 + backfill usage at 1019-1031, 1154] | One-time backfill into `team_members` (D-03); column retained but unread (D-04) |
| Stored data | `doc.teams[].members` arrays and `member.team`/`member.teams` inside workspace `doc` JSON | Ignored at read, dropped from writes; no data migration needed (doc is disposable projection) |
| Live service config | None — no external services hold team data (self-hosted SQLite only) | None |
| OS-registered state | None — verified: no scheduler/registration touches team fields | None |
| Secrets/env vars | None — `team`/`teams` are not secret material | None |
| Build artifacts | None — no built/bundled artifacts carry team schema (plain ESM served directly) | None |

## Common Pitfalls

### Pitfall 1: client-side writes resurrect membership in the doc
**What goes wrong:** teams modal or member modal writes `member.team` / `t.members` locally and the next doc PUT ships it; two sessions → clobber (the exact bug TEAM-05 pins).
**Why:** `src/actions/teams.js` currently mutates the doc directly (lines 30, 75, 98, 113) and member edit route at server.js:2919-2932 still accepts `body.team` and writes it into the doc profile.
**Avoid:** remove all doc-membership writes client and server in the same task cluster; gate the server route from accepting `team` (accept `teams` via API route instead).
**Warning signs:** `grep "x.team\s*=" src/` still matching after the phase; TEAM-05 test failing intermittently under concurrency.

### Pitfall 2: member_id vs user_id keying mismatch
**What goes wrong:** `team_members` keyed on user_id but doc members and project visibility use member_id (`m_...`), or vice versa; intersection silently empty.
**Why:** memberships carry *both* (`member_id` column, `memberIdFor()` at server.js:1761). Doc profiles key on member_id; sessions/auth key on user_id.
**Avoid:** store both columns in `team_members` (like `memberships` does), pick member_id as the logical key, and backfill both from the same row.
**Warning signs:** assignment picker shows nobody after migration; mention fan-out misses active members.

### Pitfall 3: stale revision / missing revision on hybrid endpoints
**What goes wrong:** member edit modal changes role *and* teams in one submit; if the route edits the doc (role) but returns without `wsRevision()`, the client 409s on its next doc write.
**Avoid:** routes that touch the doc at all must return `revision: wsRevision(ws.id)` (existing convention, server.js ~1225). Routes that touch only `team_members` should return the updated member payload without a revision claim — decide per route and test it.
**Warning signs:** 409 `staleRevision` after saving a member.

### Pitfall 4: migration backfill runs on every boot or misses the column
**What goes wrong:** backfill not guarded → duplicate rows / second boot not byte-identical (breaks the pinned test); or backfill runs before `ensureColumn(db, 'memberships', 'team')` has run on a legacy DB → `no such column`.
**Avoid:** guard with an existence check (`select 1 from team_members limit 1` or a `schema_migrations`-style marker — check what tenancy migration uses); order after `ensureColumn` calls in `openDb()`.
**Warning signs:** migration.test.mjs second-boot byte comparison fails.

### Pitfall 5: OIDC identity-column decision (cross-phase, MUST be settled during this phase's planning)
**What goes wrong:** Phase 28 designs `team_members` and membership schema without deciding whether identity columns (issuer/subject) join on `users.id` or a new identity table — Phase 30 then forces a non-additive change.
**Avoid:** this is a flagged planner decision (STATE.md blocker: "Phase 28 planning MUST settle the OIDC identity-column schema"). Recommend `team_members` reference `users(id)` via FK exactly as `memberships` does, so any Phase 30 identity table can join independently without touching this join table.
**Warning signs:** planner shipping without a note on this decision.

### Pitfall 5 (UI): teamless members break single-select assumptions
**What goes wrong:** UI code treats `m.team` as truthy for active members (e.g. `me().team ? [me().team] : []` at actions.js:1425 project prefill, `m.team || null` at actions.js:1874/1900 resend-invite paths).
**Avoid:** sweep every `m.team`/`me().team` read (actions.js:143, 1874, 1900, 3352, 3365; teams.js:30, 75, 98, 113) and convert to the projected `teams[]` array; empty array is the normal teamless state.
**Warning signs:** roster counts (teams.js:98) zero after migration.

## Code Examples

### New authority table (SCHEMA block)

```sql
-- Source: pattern from memberships table, server.js:156-164
create table if not exists team_members (
  workspace_id text not null references workspaces(id) on delete cascade,
  team_id      text not null,               -- doc teams[] definitions stay in the doc (D-02)
  member_id    text,                        -- doc profile id (m_...)
  user_id      text not null references users(id) on delete cascade,
  primary key (workspace_id, team_id, user_id)
);
create index if not exists team_members_user on team_members(workspace_id, user_id);
```
[ASSUMED] exact PK/column choice — planner decides; the FK-on-users + cascade pattern matches every adjacent table [VERIFIED: server.js SCHEMA block].

### Membership edit route skeleton

```js
// Source: pattern from existing wsInviteMatch route, server.js ~2995-3010
const wsTeamMemberMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})\/members\/([^/]+)\/teams$/);
// requireWorkspace(req, res, ws, 'admin'); body { teams: [teamId, ...] } →
// transaction: delete rows for (ws, user); insert one row per team id (validated against doc teamsList)
```
[ASSUMED] route shape — the agent's Discretion (D-01) leaves naming/shape to the planner; the gate + sameOrigin + readJson conventions shown are the established ones.

### Mention fan-out change (client)

```js
// Source: src/actions/actions.js:143 (current: m?.team === tid)
for (const tid of teamIds) (D().members || []).forEach(m => {
  if ((m.teams || []).includes(tid) && m.status === 'active') targets.add(m.id);
});
```
[VERIFIED: src/actions/actions.js:138-150 — verbatim current predicate `if (m?.team === tid && m.status === 'active') targets.add(m.id);`]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Scalar `project.team` | `project.teams[]` (P3) | Prior release | Template for the member-side scalar→array move |
| Membership in doc (`teams[].members`), synced by doc-diff (`syncMemberTeams`) | Authority rows only; doc is rebuilt display projection | This phase | Removes last client-mergeable membership surface |
| `invites.team` scalar | `invites.teams` JSON array (D-07) | This phase | Additive column; backfill from scalar in migration |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `team_members` PK/shape `(workspace_id, team_id, user_id)` with optional member_id | Code Examples | Migration redo; cheap to change pre-ship |
| A2 | API route naming `/members/:uid/teams` | Code Examples | Cosmetic — planner owns per D-01 discretion |
| A3 | Mention fan-out stays client-side (only predicate changes) vs moving fan-out server-side | Architecture | If fan-out should be server-authoritative, an extra task appears; CONTEXT leaves mechanics to discretion |
| A4 | Seed demo data (`src/data/seed.js` member `teams` arrays) currently holds team sets in doc shape and needs re-alignment | Structure note | Demo mode shows wrong rosters |

## Open Questions

1. **Should TEAM-04 (assignment eligibility) be enforced server-side on task writes?**
   - What we know: the success criterion speaks of the picker; the server currently accepts any assignee.
   - What's unclear: whether a write-guard belongs in this phase or Phase 29 (scoped permissions does route-sweep enforcement).
   - Recommendation: client picker filter in Phase 28 (requirement wording), note server guard as a Phase 29 seam.
2. **Does a membership-only API change bump the workspace revision?**
   - What we know: doc-touching routes must return `wsRevision()`; membership routes may not touch the doc.
   - Recommendation: return the updated member payload + `membersChanged: true`; keep doc revision untouched so other sessions' pending writes survive (supports TEAM-05 criterion 4).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | everything | ✓ | 24.21.0 (node:sqlite stable) | — |
| node:test | migration + regression tests | ✓ | built-in | — |

No missing dependencies. No external services required.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (built-in), concurrency 2 |
| Config file | none (glob in package.json `test` script) |
| Quick run command | `node --test test/membership.test.mjs test/migration.test.mjs` |
| Full suite command | `node --test --test-concurrency=2 test/*.test.mjs` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEAM-01 | Backfill from `memberships.team`, backup created, byte-identical second boot | integration | `node --test test/migration.test.mjs` | ✅ extend existing |
| TEAM-02 | Rosters/autocompletes reflect team set; member on two teams appears twice | integration/unit | `node --test test/membership.test.mjs` | ✅ extend existing |
| TEAM-03 | @team fan-out; user in 2 mentioned teams notified once | unit (emitMentions with two-team member) | `node --test test/membership.test.mjs` | ✅ extend |
| TEAM-04 | Picker excludes non-intersecting members | unit (intersection predicate) | `node --test test/membership.test.mjs` | ❌ Wave 0 (new assertions) |
| TEAM-05 | Membership change survives concurrent doc PUT from second session | integration | `node --test test/membership.test.mjs` | ❌ Wave 0 (new test, harness in `test/helpers/server.mjs` with `login`, `startServer`, `withDb`) |

### Sampling Rate
- **Per task commit:** quick run of touched test file
- **Per wave merge:** full suite
- **Phase gate:** full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/team-membership.test.mjs` (or extensions to `membership.test.mjs`) — covers TEAM-02..05
- [ ] Fixture: pre-migration DB with two members sharing a scalar team + one teamless member
- None otherwise — `test/helpers/legacy-fixture.mjs` already builds legacy DBs for migration tests.

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V4 Access Control | yes | `requireWorkspace(req, res, ws, 'admin')` gate on every new membership route [VERIFIED: pattern at server.js:3002] |
| V5 Input Validation | yes | Validate team ids against doc `teamsList` (whitelist, not pass-through); cap `teams` array length; `sameOrigin` check on POST/DELETE |
| V3 Session Management | no change | existing session middleware untouched |
| V6 Cryptography | no | no new secrets |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Privilege escalation via team edit by non-admin | Elevation of Privilege | Admin/owner gate (`ROLE_RANK >= admin`) on all membership-write routes |
| Unauthorized team-id injection (FK-less team_id references doc) | Tampering | Validate `team_id` exists in doc `teams[]` before insert; cascade cleanup when a team is deleted |
| Orphaned rows after team deletion (doc teams deleted client-side) | Tampering/Data integrity | Team delete action must call the API to purge `team_members` rows for that team_id (teams.js delete path, line ~113) |

## Project Constraints (from AGENTS.md)

No project-level `AGENTS.md` or `CLAUDE.md` exists at repo root [VERIFIED: file reads this session]. Milestone invariants from `.planning/PROJECT.md`/STATE.md apply: EN+FR catalogue strings at write time, additive-only byte-identical-boot migrations, zero new runtime dependencies, full suite green.

## Sources

### Primary (HIGH confidence)
- In-repo reads this session: server.js (SCHEMA, ensureColumn, syncMemberTeams, normalizeProjects, migrateTenancy backup, memberProfile, addMembership, member/invite routes), src/actions/actions.js, src/actions/teams.js, src/core/store.js, src/data/seed.js (grep), test/migration.test.mjs, test/helpers listing, package.json

### Secondary / Tertiary
- None required — zero external libraries; all research is codebase-local.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; node:sqlite/node:test verified on machine
- Architecture: HIGH — all authority sites read and quoted this session
- Pitfalls: HIGH — derived from actual current code paths, each grep-verified

**Research date:** 2026-11-01
**Valid until:** 2026-12-01 (codebase-local; re-verify only if server.js changes before planning)
