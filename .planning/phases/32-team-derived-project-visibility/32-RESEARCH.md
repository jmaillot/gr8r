# Phase 32: Team-Derived Project Visibility - Research

**Researched:** 2026-11-02
**Domain:** Visibility semantics in a zero-dependency Node.js/`node:sqlite` PM server (`server.js`, single file, 4920 lines) — extending the Phase-29 `hiddenFor()` funnel with a team-membership intersect term
**Confidence:** HIGH (all file:line claims read from the current tree this session; no external packages involved)

## Summary

Phase 32 is a pure visibility-semantics extension of existing Phase-29 machinery. Everything it needs already exists: `project.teams[]` is normalized on every project (`normalizeProjects`, server.js:746-780), team membership lives only in the `team_members` authority table (server.js:227-233) with a per-user read helper already present (`teamsOfUser`, server.js:1377-1382), and `hiddenFor(doc, membership)` (server.js:730-739) is the single funnel consumed by both `redactDoc` (:864) and `mergeClientDoc` (:931). The work is: one additive predicate term, one shared helper, send-time adoption at two call sites, and a MATRIX test extension.

**The decisive structural insight:** per D-01, the team term is *purely widening* — "Nobody loses access they have today." Working through the predicate algebra, the team-intersect term can only OPEN private team-linked projects to intersecting members; it never adds anything to the hidden set beyond what `canSeeProject` already hides (a private+access-list project is already visible to its list; a private no-list project is already hidden regardless of teams). Consequence: the additive-union requirement (VIS-02) is satisfied structurally, the admin-blinding risk ranked #3 in `.planning/research/ARCHITECTURE.md` is void (a term that only widens cannot blind anyone), and the scoped branch (server.js:736) stays byte-for-byte untouched per D-03.

**Primary recommendation:** implement one shared helper (e.g. `memberCanReadProject(p, membership)` — readable ⟺ `canSeeProject(p, member_id)` ∨ `project.teams ∩ member.teams ≠ ∅`), use it as the *visible* test in `hiddenFor`'s null-scope branch, and swap the two send-time scope checks (email mirror server.js:1110-1116, reminder pass server.js:1236-1239) to consume the same helper. Extend the MATRIX in `test/scope.test.mjs:530-569` with a second probe member (on-team vs off-team) across every existing family.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** The per-project access list (`p.members`) survives as an additive disjunct in the visibility predicate: readable ⟺ team-intersect ∨ no-teams(public) ∨ access-list ∨ public ∨ scope-grant. Nobody loses access they have today.
- **D-02:** Legacy private projects relying on access lists behave identically after VIS — read semantics change only additively via team intersection. No migration, no UI nudge.
- **D-03:** The member-team intersect term lives in `hiddenFor`'s null-scope branch (`hiddenProjectIds` gains a team complement). The Phase-29 scoped branch (`inScopeProject ∧ scopeGrants`, server.js:698-739) stays byte-for-byte untouched. Reversible — additive disjunct in one branch; scoped machinery untouched.
- **D-04:** One named shared helper (e.g. `teamIntersects(p, memberId)`) consumed by `hiddenFor`'s null-scope branch AND the send-time surfaces (reminder pass, email mirror) per VIS-04 — no second visibility pipeline.
- **D-05:** The member's team set is read live from the `team_members` authority rows at predicate time. No per-request caching.
- **D-06:** Predicate order for a non-scoped member: empty-teams first branch (public ⇒ workspace-wide; private ⇒ still gated by its access list — NOT leaked workspace-wide), then team-intersect opens private team-linked projects, admin exemption on top. Pinned by JIT zero-team-account fixtures.
- **D-07:** Extend the named MATRIX sweep in `test/scope.test.mjs` with team-derivation cells across every endpoint family it already covers (doc GET, project CRUD, tasks, comments, files).
- **D-08:** The `serveFileBinary` `normalizeProjects` gap is folded INTO this phase — the file side door must agree with the doc read under the new predicate.

### the agent's Discretion
- Exact helper naming/signature (`teamIntersects` is a suggestion, not a contract).
- Fixture organization within the existing MATRIX structure.
- How send-time surfaces obtain the member's team set (same live authority-row query via the shared helper is the default).

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VIS-01 | Non-guest member readable iff `project.teams ∩ member.teams ≠ ∅` ∨ no-teams ∨ scope grant, riding the single `hiddenFor()` funnel | Predicate lands in `hiddenFor` null-scope branch (server.js:730-739); team set read live via `teamsOfUser`-style query (server.js:1377-1382) |
| VIS-02 | Composition stays additive (union); D-03 grant inversion survives; admin exemption survives | Team term is purely widening — hidden set only shrinks; scoped branch server.js:736 untouched |
| VIS-03 | Guests (viewer + exactly one project) stay locked | Guests carry a non-null scope ({projects:[p]}) → `projectScope` returns non-null → they ride the UNTOUCHED scoped branch; team term never reaches them |
| VIS-04 | Reminder pass + email mirror resolve through the same team-intersect helper | Swap server.js:1110-1116 (email mirror) and server.js:1236-1239 (reminder pass) to the shared helper |
| VIS-05 | Named 404-matrix extended with team-derivation cells; byte-identical `notFound`/`fileNotFound` bodies; no-team projects reachable workspace-wide | Extend MATRIX at test/scope.test.mjs:530-569; byte-identical assertion pattern already at :655-661 |
</phase_requirements>

## Project Constraints (from AGENTS.md)

No project-level `AGENTS.md` exists in the repo root (verified this session). Global operator rules apply: max 2 tool retries, verify before inventing APIs, no opportunistic out-of-scope fixes, build/tests must pass or the failure documented. GSD guardrails apply (`.planning/` exists): atomic commits, plan before code.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Visibility predicate (team-intersect term) | API/Backend (`server.js` `hiddenFor`) | — | The single funnel; client receives already-redacted docs |
| Send-time reach (reminders, email mirror) | API/Backend (scheduler + mail queue in `server.js`) | — | Separate call sites that bypass `hiddenFor`; must consume the same helper |
| Team-membership authority | Database/Storage (`team_members` table) | — | v1.6 decision: authority rows only; doc `teams[].members` is a display projection |
| File side-door agreement | API/Backend (`serveFileBinary`) | — | By-id endpoint outside the doc channel; needs the same predicate |
| 404 no-oracle bodies | API/Backend (`fail()` responses) | — | Byte-identical bodies are a server contract, pinned by tests |

## Standard Stack

### Core
No new packages — **zero runtime dependencies is a pinned milestone invariant** (`test/dependencies.test.mjs`). Everything uses existing in-repo facilities:

| Facility | Location | Purpose | Why Standard |
|----------|----------|---------|--------------|
| `hiddenFor(doc, membership)` | server.js:730-739 | The ONE hidden-project funnel | Contract comment :704-712 forbids a second pipeline; `redactDoc` (:864) and `mergeClientDoc` (:931) both consume it |
| `teamsOfUser(workspaceId, userId)` | server.js:1377-1382 | Live team set from `team_members` | Already the authority-row read used by syncProfiles; D-05 says read live, no caching |
| `canSeeProject(p, memberId)` | server.js:649-652 | Existing private/access-list predicate | The term the team disjunct composes with |
| `projectScope(membership)` | server.js:671-695 | Branch selector: null scope = workspace-wide | Returns null for admin/owner (:672) — the admin exemption rides this |
| `normalizeProjects(doc)` | server.js:746-780 | Legacy scalar-`team` → `teams[]` idempotent migration | Must run before any predicate reads `p.teams` |
| `node:test` + `assert` | test/scope.test.mjs et al. | Test framework | 803-test baseline; MATRIX pattern is the named extension surface |

### Supporting
| Facility | Purpose | When to Use |
|----------|---------|-------------|
| `test/scope.test.mjs` MATRIX (:530-667) | Named 404 sweep to extend (D-07) | All team-derivation cells |
| `test/helpers` + `test/fixtures` | HTTP client harness, workspace boot | New probe member fixture |
| `withDb(server.dbPath, ...)` (used at scope.test.mjs:630) | Direct SQLite assertions | Pinning `team_members` rows in fixtures |

**Installation:** none. **Version verification:** N/A — no external packages.

## Package Legitimacy Audit

No external packages are installed by this phase (zero-dependency invariant). Audit table: **empty — nothing to verify.**

## Architecture Patterns

### System Architecture Diagram

```
                        HTTP doc reads / writes                     By-id file request
                                │                                           │
                     redactDoc (server.js:860)                    serveFileBinary (:4613)
                                │                                           │
                     mergeClientDoc (:922)                          normalizeProjects
                                │                                     (:4627, already present)
                                ▼                                           │
                    ┌──► hiddenFor(doc, membership) ◄───────────────────────┘
                    │        (:730, THE single funnel)
                    │              │
                    │     ┌────────┴─────────┐
                    │     │                  │
                    │  projectScope null?  projectScope non-null
                    │  (admin/owner AND    (scoped members AND
                    │   unscooped members)  guests: viewer+1 project)
                    │     │                  │
                    │  NULL-SCOPE BRANCH   SCOPED BRANCH (:736)
                    │  ← VIS LANDS HERE    ← byte-for-byte UNTOUCHED (D-03)
                    │     │                  │
                    │  hidden = ¬(canSeeProject ∨ teamIntersect)   hidden = ¬inScope ∪ ¬scopeGrants
                    │     │
                    │     ▼
                    │  hiddenProjects set
                    │     │
                    │     ├──► tasks/comments/files/activity/notifs/views/filters/search-terms all derive
                    │
   Send-time surfaces (bypass hiddenFor — must call the SHARED HELPER directly):
        reminder pass (:1236-1239, currently inScopeProject only)  ──┐
        email mirror (:1110-1116, currently inScopeProject only)   ──┤──► memberCanReadProject(p, membership)
        assignee write-guard (:1028-1034, scoped members only)   ──┘    (new shared helper, D-04)
                                │
                                ▼
                     team_members authority rows
                     (live query at predicate time, D-05)
```

### Recommended Change Shape (no new files)

```
server.js            # helper + hiddenFor null-scope branch + 2 send-time swaps (+ optional write-guard)
test/scope.test.mjs  # MATRIX team-derivation rows + second probe member + JIT zero-team fixtures
test/migration.test.mjs  # only if a fixture needs a byte-identical-boot pin (likely not — no migration)
```

### Pattern 1: Additive-union hidden set (from Phase 29, binding)
**What:** Hidden sets compose as unions; grant terms short-circuit the private check.
**Why:** A conjunctive rewrite structurally forbids the D-03 inversion (ARCHITECTURE.md §193).

Verbatim current funnel (the ONLY code the null-scope branch touches):

```js
// Source: server.js:730-739 (read this session)
function hiddenFor(doc, membership) {
  const scope = projectScope(membership);
  if (!scope) return hiddenProjectIds(doc, membership?.member_id || null);
  const seen = new Set();
  for (const p of doc?.data?.projects || []) {
    if (!p?.id) continue;
    if (!inScopeProject(p, scope) || !scopeGrants(p, scope, membership.member_id)) seen.add(p.id);
  }
  return seen;
}
```

Verbatim existing predicates the helper composes:

```js
// Source: server.js:649-652
function canSeeProject(p, memberId) {
  if (!projectIsPrivate(p)) return true;
  return !!memberId && Array.isArray(p.members) && p.members.includes(memberId);
}

// Source: server.js:642-646
function projectIsPrivate(p) {
  if (!p || typeof p !== 'object') return false;
  if (typeof p.private === 'boolean') return p.private;
  return p.access === 'private';
}

// Source: server.js:690-694 (projectScope tail — D-01: empty scope IS workspace-wide)
  const teams = Array.isArray(raw.teams) ? [...new Set(raw.teams.filter(t => typeof t === 'string' && t))] : [];
  const projects = Array.isArray(raw.projects) ? [...new Set(raw.projects.filter(p => typeof p === 'string' && p))] : [];
  // D-01: an empty scope ({teams:[],projects:[]}) IS workspace-wide.
  if (!teams.length && !projects.length) return null;
  return { teams, projects };
```

**Shape check — why the team term is purely widening.** For a non-scoped member the new hidden set is `¬(canSeeProject ∨ teamIntersect)`:
- public project → `canSeeProject` true already → team term changes nothing;
- private + on access list → true already → unchanged (D-01/D-02 hold);
- private + not on list → hidden today; team-intersect now OPENS it — the only behavioral change;
- private + `teams: []` + not on list → hidden (D-06: empty-teams private stays access-list-gated, JIT-pinned).

So the team term subtracts from the hidden set only. This is why VIS-02 (union composition), the admin exemption, and D-03 all survive without touching the scoped branch. **Caveat:** D-03 (CONTEXT) says the term "lives in `hiddenFor`'s null-scope branch (`hiddenProjectIds` gains a team complement)". Do NOT put the team term *inside* `hiddenProjectIds`/`canSeeProject` naively — those are also the path for admins/owners (they get null scope at :672) and for doc-only members without authority rows. Recommended shape: a new `memberCanReadProject(p, membership)` helper; `hiddenFor`'s null-scope branch computes `hidden = projects where !memberCanReadProject(p, membership)` for non-admin memberships, and keeps the plain `hiddenProjectIds` path for admins/owners (exemption on top, D-06). Since the term only widens, even a naive placement would not blind admins — but the explicit exemption branch keeps the D-06 ordering legible and matches "admin exemption on top".

### Pattern 2: Send-time adoption (VIS-04)

Current email-mirror guard (verbatim):

```js
// Source: server.js:1110-1116
    const recipientScope = projectScope(scopeByMember.get(n.to));
    if (recipientScope) {
      /* Tasks carry `project` (the client's createTask writes it); the retired
         `projectId` key is never read — it made this lookup always undefined. */
      const projectId = n.project || task?.project || null;
      if (!inScopeProject(projectId ? projectById.get(projectId) : null, recipientScope)) continue;
    }
```

Current reminder-pass guard (verbatim):

```js
// Source: server.js:1236-1239
        const assigneeMembership = db
          .prepare('select role, scope from memberships where workspace_id = ? and member_id = ?')
          .get(ws.id, t.assignee);
        if (!inScopeProject(project, projectScope(assigneeMembership))) continue;
```

Both guards only fire for *scoped* recipients today; a null-scope recipient passes unconditionally — after VIS they must ALSO skip when the project is team-gated away from them. Swap both to: `if (!memberCanReadProject(project, membership)) continue;` — which subsumes the existing scope check for scoped recipients **only if** the helper also encodes the scoped-branch semantics, or keep the scope check and add the team term alongside. The lower-risk form (recommended): keep both existing guards byte-identical, add one conjunct `if (teamsNonEmpty(p) && !teamIntersects(p, member) && projectIsPrivate(p) && !onAccessList) continue` — i.e. call the same shared helper the funnel uses for the null-scope branch, expressed as a skip. Note the reminder pass queries `memberships` by `member_id` (:1237) — the membership row shape there is `{role, scope}` with no `member_id` property on the row itself; the helper signature must accept what each call site has (pass `member_id`/`user_id` explicitly rather than the whole row).

### Pattern 3: MATRIX extension (D-07)

The MATRIX (test/scope.test.mjs:530-569) drives families through one `matrixProbe` map and one fixture member (`scopedUserId`, scope `{ projects: ['p_in'], teams: [] }` at :571). Verbatim family table:

```js
// Source: test/scope.test.mjs:530-569 (abridged headers; full rows read this session)
const MATRIX = [
  { family: 1, name: 'doc GET omission (the 404-equivalent is absence from the payload)', kind: 'doc-get', expected: { inScope: 'present', outOfScope: 'absent', unknown: 'absent' } },
  { family: 2, name: 'doc PUT rejection/rollback (out-of-scope rows never land)', kind: 'doc-put', expected: { inScope: 'lands', outOfScope: 'reserved', unknown: null } },
  { family: 4, name: 'file serve (byte-identical 404 fileNotFound)', kind: 'file', expected: { inScope: 200, outOfScope: 404, unknown: 404 } },
  { family: 5, name: 'reminder pass (server send-time skip, SCOPE-04)', kind: 'reminder', expected: { inScope: 'reminded', outOfScope: 'skipped', unknown: null } },
  { family: 5, name: 'notification fan-out (client emit pre-filter, A4)', kind: 'fanout', expected: { inScope: 'present', outOfScope: 'absent', unknown: null } },
  { family: 6, name: 'invite-carried scope (SCOPE-05: invites.scope stored; unknown id refused, T-29-12)', kind: 'invite', expected: { inScope: 'stored', outOfScope: 'stored', unknown: 'refused' } },
];
```

Byte-identical no-oracle assertion already exists (:655-661): for 404 file probes it cross-checks `unknown ≡ out-of-scope` for status, code AND message. Team cells reuse exactly this pattern with a second fixture member: one member on team X (sees `p_teamX`), one member on no team or team Y (404/absent on `p_teamX`), plus a `teams: []` private project visible to its access list only (D-06), plus a JIT-shaped zero-team account fixture (SC 2).

**D-08 status note:** the `serveFileBinary` normalizeProjects gap named in 29-REVIEW is **already closed in the current tree** — `normalizeProjects({ data })` runs at server.js:4623-4627 with the T-29-06 (WR-02) comment ("the scope funnel reads p.teams — normalize first"). D-08 therefore reduces to: (a) a MATRIX file-family cell proving the file side door agrees with the doc read under the new predicate (a legacy scalar-`team` project fixture if any still exist in fixtures — otherwise a crafted doc), and (b) the same byte-identical `fileNotFound` cross-check for team-hidden records.

### Anti-Patterns to Avoid
- **Second visibility pipeline:** any team check implemented inline at a send-time call site instead of the shared helper (D-04 invariant; named regression risk #1 in ARCHITECTURE.md).
- **Conjunctive composition:** `visible && inScope`-style rewrites break D-03 (named regression risk #2).
- **Team term inside `canSeeProject`:** silently changes semantics for every existing caller (`remindable` :1197-1202, `hiddenProjectIds` :782-788, write-guard :951) — including admin paths and the assignee write-guard — instead of the one null-scope branch.
- **Caching the team set per request/session:** D-05 forbids it; roster edits must take effect immediately.
- **Reading `doc.teams[].members`:** stripped on every read (server.js:622-628); the roster lives only in `team_members`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Team-set lookup | New SQL or a doc-based roster read | `teamsOfUser` (server.js:1377-1382) / the `team_members` authority | Doc rosters are stripped display projections; authority rows are the v1.6 decision |
| Visibility predicate | Per-endpoint visibility logic | `hiddenFor` + one shared helper | Funnel contract at :704-712; 404-matrix is the enforcement proof |
| Legacy scalar-`team` handling | Manual `p.team` fallbacks | `normalizeProjects` (server.js:746-760) | Already idempotent, already applied on both read paths |
| 404 no-oracle testing | Ad-hoc status checks | The MATRIX cross-check pattern (:655-661) | Pins byte-identical status+code+message in one helper |
| Test fixtures/workspaces | Hand-rolled server boot | `test/helpers` + `test/fixtures` harness | Whole suite depends on it |

## Runtime State Inventory

Not a rename/migration phase — no string replacement. Reviewed for the record:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — `project.teams[]` and `team_members` rows already exist; no schema or stored-shape change. Migrations: **none** (additive-only invariant trivially satisfied) | None |
| Live service config | None | None |
| OS-registered state | None | None |
| Secrets/env vars | None | None |
| Build artifacts | None | None |

## Common Pitfalls

### Pitfall 1: Send-time leak (the easiest silent regression)
**What goes wrong:** VIS lands in `hiddenFor` only; reminders and emails still flow to members whose teams don't reach the project — ARCHITECTURE.md ranks this regression #1.
**Why:** the two send-time guards (:1110-1116, :1236-1239) bypass the funnel and re-derive reach from the `memberships.scope` column alone.
**Avoid:** swap both to the shared helper (D-04); add reminder + fanout MATRIX cells.
**Warning signs:** reminder MATRIX cell `outOfScope → 'skipped'` failing for a team-hidden probe.

### Pitfall 2: `member_id` vs `user_id` confusion
**What goes wrong:** the team-set helper queries the wrong id column and every predicate reads empty.
**Why:** `team_members` carries BOTH columns (`member_id text` nullable, `user_id text not null`, server.js:227-233); `teamsOfUser` queries by `user_id`, but `hiddenFor` and `p.members` (access list) work in **member_id** space, and the reminder pass resolves memberships by `member_id` (:1237).
**Avoid:** the helper must take the membership row (or both ids) and resolve `user_id` from the `memberships` row (it carries `user_id` — the join at :1095 selects it) before calling `teamsOfUser`, or query `team_members` by `member_id`. Decide once, test both a doc-only member (no authority row → no teams → empty-team branch) and an account member.
**Warning signs:** a member who visibly belongs to team X in the UI still getting 404.

### Pitfall 3: Doc-only members and the empty-team branch
**What goes wrong:** a member with no `team_members` rows (SSO JIT zero-team account, or doc-only legacy profile) reads as "empty teams" — the predicate's FIRST branch per D-06 — and must still see `teams: []` projects workspace-wide (SC 2) while team-linked private projects stay hidden.
**Avoid:** pin with JIT-shaped fixtures (zero-team account + a `teams:[X]` private project ⇒ 404; a `teams:[]` project ⇒ visible per its public/access-list state).
**Warning signs:** SC-2 regression test failing green-room.

### Pitfall 4: `remindable` also calls `canSeeProject`
**What goes wrong:** `remindable(task, project)` (server.js:1197-1202) uses `canSeeProject(project, task.assignee)`. If the team term is placed inside `canSeeProject`, reminder eligibility silently widens for everyone; if not, the reminder path needs the helper separately (Pitfall 1).
**Avoid:** leave `canSeeProject` untouched; the reminder pass's own scope check (:1239) is where the helper goes. Note `remindable`'s private check then coexists with the pass's team check — fine, they compose.

### Pitfall 5: mergeClientDoc reserved-row growth
**What goes wrong:** team-hidden rows a scoped caller PUTs get "reserved" instead of merged — correct behavior (ARCHITECTURE.md §74) but new, and existing doc-put tests may assert old outcomes.
**Avoid:** expect MATRIX family-2 semantics to extend to team cells; update assertions deliberately, don't loosen them.

### Pitfall 6: Empty-teams private project leak
**What goes wrong:** "no teams" misread as "no restrictions" — a private project with `teams: []` leaked workspace-wide.
**Avoid:** D-06 ordering: empty-teams branch evaluates public/private FIRST (private ⇒ access-list gate), then team-intersect. Pinned by D-06 fixtures.

## Code Examples

### Recommended helper shape (illustrative — naming is agent's discretion per CONTEXT)

```js
// Team term (D-04/D-05): readable iff existing rules OR team intersect.
// membership carries member_id + user_id (memberships rows); team set read live.
function memberTeamsLive(wsId, userId) {
  return teamsOfUser(wsId, userId); // server.js:1377-1382 — authority rows, no cache (D-05)
}
function teamIntersects(p, teamSet) {
  return Array.isArray(p?.teams) && p.teams.length > 0 && p.teams.some(t => teamSet.includes(t));
}
// Visible for a non-scoped member (null-scope branch of hiddenFor):
//   canSeeProject(p, member_id) || teamIntersects(p, liveTeamSet)
// Admin/owner: keep the plain hiddenProjectIds path (exemption on top, D-06).
```

### 404 MATRIX cell pattern (byte-identical, no oracle)

```js
// Source: test/scope.test.mjs:655-661 — reuse verbatim for team cells
if (row.kind === 'file') {
  assert.equal(got.status, row.expected[probe]);
  if (row.expected[probe] === 404) {
    assert.equal(got.code, 'fileNotFound');
    const cross = await matrixProbe.file(probe === 'unknown' ? 'outOfScope' : 'unknown');
    assert.deepEqual(got, cross, 'unknown ≡ out-of-scope: identical status, code AND message (no oracle)');
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-scope visibility only (scoped members) | Team-derived for every non-guest member | Phase 32 (this) | Hidden set only shrinks — purely widening |
| Scalar `project.team` | `project.teams[]` normalized everywhere | P3 (v1.6) | Already done; D-08 file-path gap closed at :4623-4627 |
| Doc-carried team rosters | `team_members` authority rows | v1.6 TEAM-01/D-04 | Helper must query authority, live (D-05) |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Public projects that carry `teams:[X]` remain readable by non-X members (D-01 verbatim lists "public" as an independent disjunct; the team term only ever opens private projects) | Summary / Pattern 1 | If the restrictive reading is intended (SC 1's "member of no team intersecting a project's teams gets 404" applies to public+teams projects too), the predicate must add team-gated hidden sets for public projects — a materially different, non-widening change. **Planner should confirm this reading before locking the plan** — it is the single riskiest composition ambiguity (roadmap gap-closure allowance) |
| A2 | Guests (viewer + exactly one project) always carry a non-null scope, so they never reach the null-scope branch and VIS-03 holds for free | VIS-03 / diagram | If an unscooped viewer counts as a "guest" anywhere, the null-scope branch must exclude them |
| A3 | The D-08 `serveFileBinary` normalizeProjects gap is already closed in the current tree (server.js:4623-4627, T-29-06/WR-02 comment) and only needs a test pin | Pattern 3 | If 29-REVIEW referred to a different gap, D-08 needs real code work |
| A4 | `memberships` rows carry `user_id` (the join at server.js:1095 selects `m.user_id`), so the helper can resolve user_id from the membership row without an extra query | Pitfall 2 | One extra SQL round-trip per predicate call — harmless, but plan accordingly |
| A5 | Plain viewers (role `viewer`, null scope) count as "non-guest members" for VIS-01 and gain team-derived reach | VIS-01 | If viewers should stay read-locked, an extra role conjunct is needed |

## Open Questions

1. **Public + teams projects: restrictive or widening-only?** (A1)
   - What we know: D-01's verbatim predicate keeps "public" as a disjunct (widening-only); SC 1's 404 sentence could be read restrictively; roadmap explicitly allows gap-closure in planning.
   - Recommendation: adopt D-01 verbatim (widening-only — "nobody loses access they have today" is the DECISION text) and pin it with a MATRIX cell (public project with `teams:[X]` visible to a non-X member). Surface the reading in the plan for one-line user confirmation.
2. **Does the assignee write-guard (server.js:1028-1034) adopt the helper?**
   - What we know: it only constrains *scoped* assignees today; VIS-04 names only reminder + email mirror.
   - Recommendation: leave untouched this phase (out of the VIS-04 letter), note as observation — the guard already protects scoped members, and mergeClientDoc's `hiddenFor` protects restores.
3. **Team cells for the invite family (family 6)?**
   - What we know: invites already whitelist `scope.teams` against known teams; team derivation doesn't change invite storage semantics.
   - Recommendation: cover family 6 via the existing cells plus one team-scope invite cell only if cheap; the MATRIX note (:527-528) requires new project-touching families to extend the table, and team-derivation is not a new family but new cells in existing ones.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js + `node:test` | test suite | ✓ | (runs suite) | — |
| `node:sqlite` (`DatabaseSync`) | server + fixtures | ✓ | (803 tests pass today) | — |
| npm test | per-task verification | ✓ | green this session (`npm test` run completed) | — |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` + `node:assert` (built-in, zero deps) |
| Config file | none — plain `.mjs` files in `test/` |
| Quick run command | `node --test test/scope.test.mjs` (verified: passes, ~1.6s) |
| Full suite command | `npm test` (verified: green this session; 803-test baseline) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VIS-01 | Team-intersect opens private team-linked project; off-team member 404/absent | integration (MATRIX cells) | `node --test test/scope.test.mjs` | ❌ Wave 0 (extend MATRIX) |
| VIS-02 | Scope grant still opens private out-of-team project; admin sees all | regression (existing 981-line scope pins + new cells) | `node --test test/scope.test.mjs` | ✅ existing pins + ❌ new admin cell |
| VIS-03 | Guest sees exactly one project | integration | `node --test test/scope.test.mjs` | ✅ Phase-29 guest tests (must stay green untouched) |
| VIS-04 | Reminder/email skip team-hidden projects | integration (MATRIX reminder + fanout cells) | `node --test test/scope.test.mjs` | ❌ Wave 0 |
| VIS-05 | 404 byte-identical no-oracle across families; no-teams reachable workspace-wide | integration (MATRIX file cross-check pattern) | `node --test test/scope.test.mjs` | ❌ Wave 0 |
| D-06 | JIT zero-team account: empty-teams predicate branch | integration fixture | `node --test test/scope.test.mjs` | ❌ Wave 0 |
| D-08 | File side door agrees with doc read | integration (file family cell) | `node --test test/scope.test.mjs` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test test/scope.test.mjs` + any touched test file
- **Per wave merge:** `npm test` (full 803+ baseline)
- **Phase gate:** full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] MATRIX team-derivation rows + second probe member fixture in `test/scope.test.mjs` — covers VIS-01/05, D-06, D-08
- [ ] Send-time cells (reminder, fanout) — covers VIS-04
- [ ] No framework install needed; no migration-test fixtures expected (no schema change)

## Security Domain

`security_enforcement` not disabled in `.planning/config.json` — included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | **yes — this phase IS an access-control change** | Single `hiddenFor` funnel; 404-matrix no-oracle proof; authority-row membership |
| V5 Input Validation | yes (existing) | `normalizeProjects` + projectScope defensive parsing (:665: corrupt payloads degrade to workspace-wide, never lockout) |
| V2/V3/V6 | no | No auth/session/crypto surface touched |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Existence oracle on by-id endpoints | Information Disclosure | Byte-identical `notFound`/`fileNotFound` bodies (MATRIX cross-check at :655-661) |
| Send-time leak (email/reminder reveals hidden project names) | Information Disclosure | Shared helper at :1110/:1239 (VIS-04) |
| Scope-column blinding of admins (corrupt scope JSON) | Elevation/DoS | `projectScope` null for admin/owner (:672) — VIS must not touch this |
| Team-membership forgery via doc write | Tampering | Roster lives in `team_members` authority, edited only via dedicated PUT route (:3986); doc `teams[].members` stripped on read (:622-628) |
| Recent-search term leak (grows with more hidden projects) | Information Disclosure | `hiddenProjectTerms` derives from the hidden set automatically; SEARCH-01 tunes in Phase 34 — do not pre-tune here |

## Sources

### Primary (HIGH confidence)
- `server.js` — read directly this session: `hiddenFor` :730-739, `scopeGrants` :722-728, `inScopeProject` :698-702, `projectScope` :671-695, `canSeeProject`/`projectIsPrivate` :642-652, `normalizeProjects` :746-780, `hiddenProjectIds` :782-788, `redactDoc` :860-879, `mergeClientDoc` hiddenFor call :931, `teamsOfUser`/`teamsByUser` :1377-1392, email mirror guard :1110-1116, reminder pass :1236-1239, `remindable` :1197-1202, `team_members` schema :227-234, doc roster strip :622-628, invite guest gate :4179-4197, `serveFileBinary` :4613-4644 (normalizeProjects at :4623-4627)
- `test/scope.test.mjs` — MATRIX :530-569, probes :578-636, byte-identical cross-check :655-661 (read this session; suite passes: `node --test test/scope.test.mjs` green)
- `.planning/research/ARCHITECTURE.md` — funnel analysis, ranked regression risks, VIS×SEARCH/UNDO cross-item notes (line-verified against the tree, same session date)
- `.planning/research/FEATURES.md` §VIS — ride-the-one-funnel guidance
- `.planning/phases/32-.../32-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md` — decisions D-01..D-08, requirements VIS-01..05

### Secondary (MEDIUM confidence)
- None needed — no external ecosystem claims.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Predicate/change shape: HIGH — every line read from the tree this session; suite run green
- Composition semantics: HIGH on mechanics, **the A1 public+teams reading is the one open decision** (flagged for planner/user)
- Pitfalls: HIGH — two are named regressions carried from Phase-29 research, re-verified against current line numbers

**Research date:** 2026-11-02
**Valid until:** 2026-12-02 (stable, no external deps)
