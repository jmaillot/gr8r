# Phase 50: Invite hierarchy & per-project toggles (server) - Research

**Researched:** 2026-11-08
**Domain:** Server-side invite authorization, live team-link visibility, per-project access toggles (single-file Node.js server, zero new deps)
**Confidence:** HIGH (codebase-verified; all claims below were read from source this session)

## Summary

Phase 50 is mostly a **coordinated edit of `server.js` (+ `mcp.js` mirror + tests + docs)**, not a greenfield build. Three of the five requirements are already substantially implemented and need pinning tests rather than new machinery: INV-01's three hierarchy points exist (role comes only from the invite row at accept, `ownerTransferOnly`/`ownerManagedRoles` gate the PATCH route, `inviteRole()` refuses to mint `owner`), INV-04's "exactly one project" refusal was already retired with the scope model in Phase 49 (`docs/WorkspacePermissions.md` §Guest confirms `guestSingleProject` is gone; `inviteRole()` maps `'guest'→'viewer'` and both role CHECK constraints exclude `'guest'`), and D-50-3's role-edit route is the existing `PATCH /api/workspaces/:ws/members/:uid`. The genuinely new work is: (1) the **live team link** — resurrect the team term in the visibility funnel, `mcp.js`, `normalizeProjects`, `mergeClientDoc`, and **neutralize the Phase 49 sweep that would otherwise delete restored `p.teams` on the next boot**; (2) the **reverse-sweep boot migration** whose provenance problem is the hardest open question (Phase 49 left no per-entry provenance: grants were pushed into `p.members` silently, `p.teams` was deleted, and no pre-migration backup exists in this dev `data/` dir); (3) **VIS-04** — invites are workspace-level and admin-gated today, so a member guest invite needs a project reference on the invite row plus a lowered route gate with role-conditional logic.

**Primary recommendation:** Treat sweep-retirement + reverse-sweep as the first, riskiest task (it gates everything); pin the already-correct hierarchy behavior with 404-matrix-style tests; design the member guest-invite path as a nullable `invites.project` column with fail-closed re-derivation at accept.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-50-1:** "Project scope" editing = add/remove the user from `p.members`. No per-project roles, no invite-provenance tracking — team-link entries and direct invites are distinguished by the model (D-50-5), not by member provenance.
- **D-50-2:** "Status" = in/out of `p.members` — removal revokes access on the very next request. No per-project suspended flag.
- **D-50-3:** Role editing uses the existing workspace `PATCH /api/workspaces/:ws/members/:uid` route — Phase 50 verifies and pins with tests that a role change takes effect on the very next request (no cached roles), it does not build a new route.
- **D-50-4:** Edit hierarchy is **stricter than literal INV-01**: admins can only edit non-admins (members/guests); any edit touching another admin (role, scope, or status) requires an owner. Only an owner grants the owner role at all three points (invite creation, role edit, acceptance).
- **D-50-5 (MILESTONE CHANGE, supersedes M-03 snapshot wording and reverses D-49-5):** a project holds a **live team link**. `p.teams[]` returns on the project doc; the visibility predicate becomes `public ∨ memberId ∈ p.members ∨ member's team ∈ p.teams`. Joining a team grants access to every project the team is linked to; leaving the team revokes it (unless also individually in `p.members`). Individual invites coexist with team links. REQUIREMENTS.md, ROADMAP.md and PROJECT.md updated in lockstep. One-way reversibility.
- **D-50-6:** Phase 50 ships a **reverse-sweep boot migration**: Phase 49's materialized team grants (team-intersection-derived `p.members` entries) are converted back into `p.teams[]` links and the corresponding `p.members` entries removed; genuine individual invites are preserved. Provenance source is researcher/planner territory.
- **D-50-7:** `p.allowInviteGuests` defaults **OFF for new projects too**. Deny-by-default everywhere; an admin opts a project in.
- **D-50-8:** Admin/owner only can flip the toggle. Flipping OFF blocks only NEW member-initiated guest invites — existing guest members are untouched. A stale member guest invite accepted after the flip fails closed (Phase 33 fail-closed invite-twin pattern, re-deriving from current state).
- **D-50-9:** Team invites bypass the toggle — an admin/owner team invite brings the full current roster including guest-role members regardless of the toggle.
- **D-50-10:** The guest data model collapses: existing `memberships.role`/`invites.role` value `'guest'` is normalized to `'viewer'` in this phase's boot migration; server code loses the guest term. The "Invité externe" client toggle dies (Phase 51 for the UI; the server stops honoring/mirroring it now).
- **D-50-11:** Guest specialness survives **via behavior only** — restrictions come from viewer-role checks; no separate guest data model.

### the agent's Discretion
- Exact enforcement/refusal shapes for the three hierarchy points (status codes, error keys), API route shape for scope editing and team linking, migration mechanics and provenance reconstruction, `mergeClientDoc` pinning details for `p.allowInviteGuests`/`p.teams`, activity-log entries, 404-matrix fixture extensions.

### Deferred Ideas (OUT OF SCOPE)
- None — team-roster UX, share-modal copy and toggle UI belong to Phase 51. No client UI in this phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INV-01 | Only an owner can name another owner — at invite time, edit time, accept time | Mostly pre-existing: `inviteRole()` refuses `owner` (server.js:3050-3055), invites CHECK excludes `owner` (:299-311), PATCH route enforces `ownerTransferOnly`/`ownerManagedRoles` (:4774-4797), accept-time HARD-02 + boot neutralization (:5122-5125, :5940-5943). Pin with tests; add explicit refusals where gaps remain |
| INV-02 | Admin/owner edits role/scope/status post-invite, immediate effect | Role: existing PATCH route (D-50-3). Scope/status: new `p.members` add/remove surface (D-50-1/D-50-2, route shape at planner discretion); no role caching observed — `requireWorkspace` resolves membership per request (:3158) |
| INV-03 | Live team link | Restore team term in `memberCanReadProject`/`canSeeProject`/`hiddenFor` (server.js:750-890), `mergeClientDoc`, `normalizeProjects`, `mcp.js canReadProject` (:182-192); retire Phase 49 sweep; D-50-6 reverse sweep |
| INV-04 | One guest concept, multi-project guests | `guestSingleProject` already retired (Phase 49; docs/WorkspacePermissions.md:36); `guest→viewer` normalization exists at invite intake (:3053); D-50-10 defensive boot migration + drop server-side guest term |
| VIS-04 | Per-project "members may invite guests" toggle | New `p.allowInviteGuests` (default OFF, D-50-7), pinned in `mergeClientDoc`/`normalizeProjects`; invite route currently admin-gated workspace-level (:4942) — needs member-tier guest path keyed to a project, fail-closed re-derivation at accept (D-50-8) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Owner-only-owner hierarchy (3 points) | API/Backend (server.js routes) | — | All three enforcement points are server route guards |
| Post-invite role edit | API/Backend (PATCH members route) | — | Existing route, D-50-3 pins it |
| Post-invite scope/status edit | API/Backend (new route or doc-PUT pinning) | Document store (`p.members`) | Route shape at planner discretion (D-50-1) |
| Live team-link visibility | API/Backend (visibility funnel) | MCP mirror (mcp.js) | Single funnel `memberCanReadProject`; mcp.js must change in lockstep (Pitfall 2 lesson) |
| Reverse sweep migration | Database/Storage (boot migration) | — | Boot-time doc+table transformation, Phase 49 template |
| Guest toggle | API/Backend (invite route gate) | Document store (`p.allowInviteGuests`) | Gate evaluated at create AND accept |
| Toggle/team UI | Client | — | **Phase 51 — out of scope** |

## Standard Stack

### Core
No new dependencies — **zero new runtime deps is a standing v2.0 invariant** (PROJECT.md). The phase uses only what exists:

| Library/Module | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node:sqlite / pg via `db-adapter.mjs` | built-in | Dual-backend data layer; migrations must run on both | Standing invariant; `sqliteOnly()` guards SQLite-only backup steps |
| `node --test` | built-in | Test runner | `npm test` = `node --test --test-concurrency=2 test/*.test.mjs` [VERIFIED: package.json:18] |
| Boot-migration template | in-repo | `materializeVisibilityGrants()` (server.js:2205-2443) is the guarded/transactional/backup template to copy for the reverse sweep | Phase 49 pattern: guard → backup → per-ws tx → second-boot no-op |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New scope/status REST route on projects | Generic doc-PUT pinning only | A dedicated route gives clean 404-matrix cells and auditable refusals; doc-PUT alone hides membership changes behind the whole-document merge. Planner's call (agent discretion) |

## Package Legitimacy Audit

**No new packages are installed in this phase** — the zero-new-runtime-deps invariant forbids it and nothing in the design needs one. No legitimacy checks required.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                       ┌──────────────────────────────────────────────┐
                       │                BOOT SEQUENCE                 │
                       │  reverse sweep (D-50-6): p.members→p.teams   │
                       │  guest normalization (D-50-10): guest→viewer │
                       │  (guarded, backup, tx, 2nd-boot no-op)       │
                       └──────────────────┬───────────────────────────┘
                                          ▼
  invite creation  ──►  POST /api/workspaces/:ws/invites
  (member? admin?)       │ gate: role vs p.allowInviteGuests (VIS-04)
                         │ gate: owner-only-owner (INV-01, point 1)
                         ▼
                  invites table (token_hash, role, teams, project?, …)
                         │
  invite acceptance ──►  POST /api/invites/:token/accept
                         │ RE-DERIVE from CURRENT state (fail-closed):
                         │  - role owner? → refuse unless... (point 3)
                         │  - member guest invite & toggle now OFF → refuse
                         ▼
                  memberships + team_members + doc p.members
                         │
  post-invite edits ──►  PATCH /api/workspaces/:ws/members/:uid   (role — D-50-3)
                         + scope/status surface (D-50-1/D-50-2)   (p.members)
                         │ gate: ownerManagedRoles / ownerTransferOnly (D-50-4)
                         │ + toggle flip route (admin/owner only, D-50-8)
                         ▼
  EVERY READ ─────────►  memberCanReadProject(p, wsId, memberId)   ← THE ONE FUNNEL
                         public ∨ memberId ∈ p.members ∨ member's team ∈ p.teams
                         │                        ▲
                         │                        └── mcp.js canReadProject mirror
                         ▼                            (must change in lockstep)
                  served doc / reminders / digest / email mirror
```

### Recommended Project Structure
All server changes concentrate in existing files:
```
server.js          # funnel (~:750-890), normalizeProjects (~:808), mergeClientDoc (~:976),
                   # invite routes (~:4940-5180), PATCH members (~:4764-4830),
                   # Phase 49 sweep (~:2196-2443) + boot call site (~:1982), invites schema (~:299)
mcp.js             # canReadProject mirror (~:177-192)
test/helpers/visibility-fixture.mjs   # 13-cell matrix — extend with team-link cells
test/visibility-migration.test.mjs   # sweep pins — adjust for retirement + reverse sweep
test/mcp.test.mjs, test/privacy.test.mjs, test/membership.test.mjs, test/hardening.test.mjs
docs/ProjectPermissions.md, docs/WorkspacePermissions.md  # update in-phase
```

### Pattern 1: Guarded boot migration (Phase 49 template)
**What:** candidate scan → SQLite `vacuum into` backup ("no backup = no mutation") → per-workspace `db.tx` with in-tx re-read → deterministic write → second-boot no-op via a `sweepNeeded`-style marker.
**When to use:** both new migrations (D-50-6 reverse sweep, D-50-10 guest normalization).
**Example:** `materializeVisibilityGrants()` — server.js:2205-2443 [VERIFIED: server.js:2205-2443]. Key mechanics to copy verbatim: the backup path `projects-pre-visibility-<stamp>.db` under DATA_DIR (:2242), the `sqliteOnly()` wrapper with the documented pg fallback (fresh pg fixture DB per scenario), the raw `JSON.stringify(doc)` write with NO `normalizeProjects` call and no revision churn.

### Pattern 2: Fail-closed re-derivation at accept
**What:** the accept route never trusts stale invite data for authorization decisions — it re-checks current state (HARD-02 checks at :5122; the boot sweep neutralizing legacy link-only admin invites at :5940-5943).
**When to use:** D-50-8 stale guest invite after toggle flip; INV-01 acceptance point.
**Example:** the existing HARD-02 block [VERIFIED: server.js:5121-5125]: `if (ROLE_RANK[invite.role] >= ROLE_RANK.admin && !invite.email) return fail(res, 403, 'inviteAdminEmailRequired', …)`.

### Pattern 3: Reserved-row pinning in mergeClientDoc
**What:** access-bearing project fields are copied from the stored row when the caller cannot manage the project, and (for hidden projects) the stored row wins entirely.
**When to use:** pin `p.allowInviteGuests` and the restored `p.teams` exactly like `p.members` [VERIFIED: server.js:999-1004 — `p.private = prev.private; p.members = prev.members; p.perms = prev.perms; p.lead = prev.lead;` for non-managers].
**Anti-pattern to avoid:** letting a stale client doc PUT delete a team link or flip the toggle (the exact class of bug D-49-1 closed for `p.members`).

### Anti-Patterns to Avoid
- **Re-firing the Phase 49 sweep after restoring `p.teams`:** `sweepNeeded()` treats any non-empty `p.teams` as a pre-sweep marker (server.js:2212-2217) and the sweep body does `delete p.teams` unconditionally (server.js:2360, :2437). If the sweep is not retired/gated in the same phase, the first boot after the reverse sweep will delete every restored link again. The sweep and its marker must be neutralized or inverted in lockstep with the predicate change.
- **normalizeProjects re-adding `teams:[]` churn:** D-49-6 established that normalizeProjects must NOT re-add deleted fields, or second-boot byte-identity breaks. Restoring `p.teams` normalization must preserve the same no-churn discipline (only normalize what is present; the reverse sweep owns the field's return).
- **Provenance guessing in the reverse sweep:** a "member's team intersects the project ⇒ team-derived" heuristic silently converts genuine individual invites into team links, violating D-50-6's preservation clause. See Open Question 1.
- **Trust-proxy-style stale role reads:** D-50-3's pin must prove no cached membership; `requireWorkspace` resolves `membershipOf` per request — keep it that way, don't add memoization.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Transactional doc+table mutation | ad-hoc multi-statement writes | `db.tx()` per workspace (Phase 49 pattern) | crash safety; dual-backend adapter semantics |
| Pre-migration snapshot | custom dump code | `sqliteOnly()` + `vacuum into` | pg has no equivalent; the pg matrix boots disposable fixture DBs instead [VERIFIED: server.js:2255-2265 comments] |
| Visibility predicate | scattered per-route checks | the single `memberCanReadProject` funnel + `hiddenFor` | the entire Phase 49 collapse exists so there is ONE predicate; mcp.js mirrors it |
| 404/refusal shape testing | ad-hoc assertions | the 404-matrix fixture pattern (test/helpers/visibility-fixture.mjs, anti-tautology contract: expectations hand-derived, never read from production code) | prevents the test oracle from copying the implementation |
| Random tokens/hashing | custom | `crypto.randomBytes(24)` + `sha256()` as in invite routes | existing invariant |

## Runtime State Inventory

Phase 50 is a model change over stored runtime state — this inventory is mandatory and was completed:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `p.members` entries created by the Phase 49 sweep (team-derived, no provenance marker — grants pushed silently at server.js:2425-2432); deleted `p.teams` (gone from every doc); `memberships.role` values — CHECK constraint admits only `owner/admin/member/viewer` [VERIFIED: server.js:280] so no stored `'guest'` on this schema, but legacy pre-constraint SQLite DBs may hold one; `invites.role` CHECK admits only `admin/member/viewer` [VERIFIED: server.js:299-303] | Reverse sweep (doc rewrite); D-50-10 defensive normalization migration; both need the fail-open/fail-closed posture decided per D-49 precedent |
| Live service config | None — no external service holds invite/toggle state | None |
| OS-registered state | None — no OS registrations embed any of these strings | None — verified: no scheduler/pm2/systemd surfaces in repo |
| Secrets/env vars | None affected — `invites.scope` column is dormant-on-disk (retired by Phase 49, cleared by sweep) and is NOT reused for the toggle; a new `invites.project` column (if adopted) must be added via the `ensureColumns` additive pattern (server.js:428-433) | Additive schema only |
| Build artifacts | None — plain Node, no compile step affected | None |

## Common Pitfalls

### Pitfall 1: Boot-order fight between the Phase 49 sweep and the restored team term
**What goes wrong:** the Phase 49 sweep deletes `p.teams` from every project (server.js:2360, :2437) and `sweepNeeded()` fires on any non-empty `p.teams` (server.js:2212-2217). Restore the field without retiring the sweep and the next boot erases every live link.
**Why it happens:** both changes touch the same field with opposite intents.
**How to avoid:** retire (or invert) `sweepNeeded` + `materializeVisibilityGrants` in the same phase as the reverse sweep; pin second-boot byte-identity for the new marker.
**Warning signs:** team access working after the reverse sweep, gone after the next restart.

### Pitfall 2: mcp.js mirror drift
**What goes wrong:** the server predicate gains the team term but `mcp.js canReadProject` (server.js mirror, :182-192) still reads only `p.members` — an over/under-permissive window on every MCP tool.
**Why it happens:** two hand-maintained copies of one predicate.
**How to avoid:** change both in the same commit; extend the parity test (Phase 49 pattern, and note the fixture documents a pre-existing mirror drift: mcp grants admins/owners everything while `hiddenFor`'s admin path uses `hiddenProjectIds`/`canSeeProject` — decide whether Phase 50 aligns this or preserves the documented drift). [VERIFIED: test/helpers/visibility-fixture.mjs:12-18 comment]

### Pitfall 3: Sealed private-empty projects (D-49-8)
**What goes wrong:** re-running `normalizeProjects` inside the reverse sweep un-seals private-empty projects (owner injected into stored copy) — the exact bug the Phase 49 sweep avoided with a raw doc write.
**How to avoid:** raw `JSON.stringify` write, no normalize call inside the sweep; the funnel change alone handles the served shape.

### Pitfall 4: The reverse sweep's provenance vacuum
**What goes wrong:** without per-entry provenance you cannot distinguish a team-materialized `p.members` entry from a genuine individual invite; any heuristic risks lockouts (fail-closed removal) or stale access (fail-open preservation defeating the live rule).
**Why it happens:** the Phase 49 sweep wrote grants with no marker and deleted `p.teams` (see Open Question 1).
**How to avoid:** use the best available source (pre-sweep backup DBs when present) and choose a documented, tested fallback posture otherwise.
**Warning signs:** users losing/gaining access at boot rather than at team join/leave.

### Pitfall 5: Toggle semantics at accept time
**What goes wrong:** gating the toggle only at invite creation lets a member create a guest invite, an admin flips the toggle OFF, and the stale invite still lands the guest — D-50-8 explicitly forbids this.
**How to avoid:** the accept route re-derives the toggle from the CURRENT project doc (and needs the invite to reference a project to do so).

### Pitfall 6: `ROLE_LABEL` still says "Guest"
**What goes wrong:** D-50-10 says the server "loses the guest term", but `ROLE_LABEL = { … viewer: 'Guest' }` (server.js:194) ships the guest label in every member payload. Naively renaming it changes client display text server-side — which straddles the Phase 50/51 boundary.
**How to avoid:** planner decides: keep the display label (it is presentation, not a data-model term) and note it for Phase 51, or rename now with i18n-gate implications. See Open Question 3.

## Code Examples

### The funnel restoration (core of D-50-5)
```js
// Source: server.js:750-773 (current collapsed form, read 2026-11-08)
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
Phase 50 target shape (per D-50-5): `canSeeProject` gains the team term — private ∨ member ∈ p.members ∨ member's teams ∩ p.teams ≠ ∅ — which requires resolving memberId→user_id→team_members inside the (already async) funnel, exactly the join direction the Phase 49 sweep documented in reverse (server.js:2333-2337: "team_members is user_id-space; p.members is member_id-space"). Consumers already await `memberCanReadProject`, and `hiddenFor` already receives the membership row, so the membership/user resolution point is `requireWorkspace`/`hiddenFor` — not a per-request query storm.

### The hierarchy points that already exist (pin, don't rebuild)
```js
// Source: server.js:4774-4797 (PATCH members — D-50-4's edit hierarchy)
if (actorRank < ROLE_RANK.owner && roleRank(row.role) >= ROLE_RANK.admin) {
  return fail(res, 403, 'ownerManagedRoles', 'Only an owner can manage admins and owners');
}
// …
if (nextRole !== row.role && nextRole === 'owner' && actorRank < ROLE_RANK.owner) {
  return fail(res, 403, 'ownerTransferOnly', 'Only an owner can transfer ownership');
}

// Source: server.js:3050-3055 (invite intake — owner role cannot be minted)
function inviteRole(value) {
  const role = String(value || '').toLowerCase();
  if (role === 'admin' || role === 'member' || role === 'viewer') return role;
  if (role === 'guest') return 'viewer';
  return 'member';
}
```

### The migrate-away-from template for `mergeClientDoc` pinning
```js
// Source: server.js:999-1004 (what to extend with p.allowInviteGuests / p.teams)
if (prev && !canManageProject(prev, memberId, role)) {
  // Access fields belong to a manager even when the project is visible.
  p.private = prev.private;
  p.members = prev.members;
  p.perms = prev.perms;
  p.lead = prev.lead;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Team-derived visibility (p.teams ∩ member.teams) | Collapsed predicate: private ∨ p.members, grants materialized | Phase 49 (2026-11-07) | **Reversed by D-50-5** — the team term returns as a live link |
| Invite-carried scope (projects/teams JSON) | Retired; access = explicit p.members | Phase 49 (D-49-5) | Member guest invites need a NEW project reference (nullable `project` column recommended) |
| `guestSingleProject` (exactly-one-project refusal) | Retired with scope model | Phase 49 (docs/WorkspacePermissions.md:36) | INV-04 criterion 5 already true — verify with tests, don't "remove" anything |
| `permGuests` cosmetic per-user pref | Real per-project `p.allowInviteGuests` | Phase 50 | Server gate becomes authoritative; per-user pref is ignored server-side |

**Deprecated/outdated:**
- The Phase 49 sweep (`materializeVisibilityGrants` + `sweepNeeded`): superseded by D-50-6; must be retired/neutralized this phase.
- `.planning/research/ARCHITECTURE.md` Phase-2 "team-share expansion endpoint (snapshot)": superseded by D-50-5 (predicate-shape and funnel-completeness guidance still applies).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `requireWorkspace` re-resolves membership from the DB on every request (no role caching), so "immediate effect" holds once writes commit | INV-02 | If any cache exists, D-50-3's pin tests would fail loudly at execution — cheap to discover, low risk |
| A2 | The nullable `invites.project` column is the right carrier for member guest invites (vs. a post-accept add step) | VIS-04 | Design choice inside agent discretion; wrong choice is a replan, not a bug |
| A3 | No stored `'guest'` role values exist on current-schema DBs (CHECK constraint); legacy DBs may differ | Runtime State Inventory | The D-50-10 migration is defensive anyway; risk is nil if assumption is wrong |
| A4 | Pre-migration backup files (`projects-pre-visibility-*.db`) are absent on this dev machine (only `data/projects.db` exists) and generally unreliable as the provenance source | Open Question 1 | If backups ARE the chosen source, their absence on pg/other installs makes the fallback posture the real behavior — must be tested either way |

## Open Questions

1. **Reverse-sweep provenance source (D-50-6) — the phase's hardest decision.**
   - What we know: the Phase 49 sweep pushed team-derived grants into `p.members` with NO per-entry marker (server.js:2425-2432) and deleted `p.teams`; the pre-migration backup exists only on the SQLite lane when the backup step succeeded, and none exists in this dev `data/` dir. A live-intersection diff cannot work: the linked teams themselves are unknown post-sweep.
   - What's unclear: which reconstruction source the planner picks — (a) pre-sweep backup DBs when present, (b) a conservative fallback (treat all current entries as genuine individual invites ⇒ fail-open: access preserved, live rule governs only future join/leave), or (c) something the owner records out-of-band.
   - Recommendation: (a) with (b) as the documented fallback, both covered by fixtures; flag as a `checkpoint:human-verify` decision since it trades lockout risk against stale-access risk.
2. **MCP mirror drift alignment.** mcp.js grants admins/owners everything; the server `hiddenFor` admin path does not open the private access list. Align the mirrors this phase (recommended — the team term makes drift riskier) or preserve the documented drift?
3. **`ROLE_LABEL.viewer = 'Guest'`** (server.js:194): presentation-only label shipped by the server. Keep until Phase 51 (recommended — avoids server-driven UI text churn outside the i18n gate) or normalize now per a strict reading of D-50-10?
4. **Member guest-invite ergonomics:** today the invite route is `requireWorkspace(…, 'admin')`; opening it to members needs role-conditional validation (member ⇒ viewer role only, project required, toggle on). Confirm the client (Phase 51) will send `project` on member invites — otherwise the gate has no operand.

## Environment Availability

Phase is code/config-only on the existing stack; probed runtimes:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | server, tests | ✓ | (project runs `node --test` today; no new runtime requirement) | — |
| SQLite (node:sqlite) | migration backup path | ✓ | built-in | — |
| PostgreSQL | pg-matrix tests | via test fixture DBs | — | `sqliteOnly()` fallback already established (server.js:2255-2265) |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node --test` (built-in runner), concurrency 2 |
| Config file | none — glob over `test/*.test.mjs` |
| Quick run command | `node --test test/membership.test.mjs` (or the specific new file) |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INV-01 | owner grant refused at create/edit/accept for non-owners | unit/integration | `node --test test/invite-hierarchy.test.mjs` | ❌ Wave 0 |
| INV-02 | role/scope/status edit effective on next request, no re-login | integration | `node --test test/membership.test.mjs` (extend) | ✅ (extend) |
| INV-03 | live team link: join⇒access, leave⇒revoke unless individual | integration + matrix cells | `node --test test/visibility-migration.test.mjs` + fixture extension | ✅ (extend) |
| VIS-04 | toggle OFF blocks member guest invite; stale invite accept fails closed | integration | `node --test test/invite-hierarchy.test.mjs` | ❌ Wave 0 |
| INV-04 | guest→viewer normalization; multi-project guest allowed | migration + integration | `node --test test/visibility-migration.test.mjs` (extend) | ✅ (extend) |
| (all) | reverse sweep: conversion correct, genuine invites preserved, second boot byte-identical | migration | `node --test test/visibility-migration.test.mjs` | ✅ (extend) |
| (all) | MCP mirror parity with restored team term | parity | `node --test test/mcp.test.mjs` | ✅ (extend) |

### Sampling Rate
- **Per task commit:** the touched test file(s) via direct `node --test <file>`
- **Per wave merge:** `npm test` full suite + pg-matrix for migration tasks
- **Phase gate:** full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/invite-hierarchy.test.mjs` — INV-01 three-point matrix + VIS-04 toggle/stale-accept twins
- [ ] `test/helpers/visibility-fixture.mjs` extension — team-link cells in the 404 matrix (re-derive expectations by hand per the anti-tautology contract; never read production code)
- [ ] Reverse-sweep fixture — pre-sweep state with known team-derived vs genuine entries; second-boot byte-identity pin for the new marker
- [ ] Guest-normalization fixture — legacy `'guest'` row → `'viewer'`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (unchanged) | existing session machinery |
| V3 Session Management | no (unchanged) | existing session table |
| V4 Access Control | **yes — core of the phase** | single `memberCanReadProject` funnel; `ROLE_RANK` guards; fail-closed accept re-derivation |
| V5 Input Validation | yes | existing `readJson` whitelist posture (HARD-04: exactly three fields read at accept); role CHECK constraints |
| V6 Cryptography | no (unchanged) | `crypto.randomBytes` tokens, `sha256` token hashes |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Privilege escalation via invite (self-minted link) | Elevation of Privilege | HARD-02 twins: admin/owner invites require email; role comes only from the invite row; boot sweep neutralizes legacy link-only rows (server.js:5940-5943) |
| Stale-credential access after role/scope/status change | Elevation of Privilege | per-request membership resolution; funnel reads current doc — pin with the "very next request" tests |
| Existence oracle on hidden projects | Information Disclosure | byte-identical 404s across every side door — extend the 404 matrix for team-linked cells BEFORE implementing (PITFALLS.md 404-matrix-first rule) |
| Toggle bypass via stale invite | Elevation of Privilege | accept-time re-derivation of `p.allowInviteGuests` from current doc (D-50-8) |
| Client doc PUT resurrecting access fields | Tampering | `mergeClientDoc` reserved-row pinning extended to `p.teams`/`p.allowInviteGuests` |

## Sources

### Primary (HIGH confidence)
- `server.js` read this session: invites schema (:299-311), `ROLE_RANK`/`ROLE_LABEL` (:193-194), `inviteRole` (:3050-3055), visibility funnel (:750-890), `normalizeProjects` (:808-843), `mergeClientDoc` (:976-1090), Phase 49 sweep (:2196-2443), PATCH members route (:4764-4830), invite routes (:4940-5180), legacy invite neutralization (:5940-5943)
- `mcp.js` `canReadProject` mirror (:177-192)
- `test/helpers/visibility-fixture.mjs` (13-cell matrix, anti-tautology contract, mirror-drift documentation)
- `docs/WorkspacePermissions.md` (guest model, `guestSingleProject` retirement, cosmetic toggles §"état actuel")

### Secondary (MEDIUM confidence)
- `.planning/CONTEXT` files (50-CONTEXT.md decisions D-50-1..11, verbatim user constraints)
- `.planning/REQUIREMENTS.md` INV-01..04/VIS-04, `.planning/STATE.md` phase order and invariants

### Tertiary (LOW confidence)
- None — all load-bearing claims were code-verified this session.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — in-repo only, no new deps
- Architecture: HIGH — every integration point read in source
- Pitfalls: HIGH — derived from Phase 49's own documented invariants and marker mechanics
- Reverse-sweep provenance: MEDIUM — the reconstruction-source decision is genuinely open (Open Question 1)

**Research date:** 2026-11-08
**Valid until:** 2026-12-08 (stable: in-repo domain, no external surface)
