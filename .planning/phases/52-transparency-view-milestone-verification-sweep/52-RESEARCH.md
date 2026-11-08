# Phase 52: Transparency view & milestone verification sweep - Research

**Researched:** 2026-11-08
**Domain:** Server-computed access reporting over the existing visibility funnel (admin-only endpoint + Members-page expansion UI) plus a milestone-wide verification/docs sweep
**Confidence:** HIGH — this is a pure in-repo phase (no external packages, no schema changes); every claim below was read directly from the live tree this session.

## Summary

Phase 52 is an observational phase: it adds an admin/owner-only endpoint that answers "which projects can member X read, and why", computed by calling the ONE funnel (`memberCanReadProject`, server.js:813) per project for the TARGET member, plus an expandable row in Settings > Members that renders it. No visibility semantics change, no schema changes, no new runtime dependencies. The second half is a sweep: re-run the exact Phase 51 verify commands and refresh the two French domain docs to the shipped v2.0 model.

The research surfaced ONE semantic subtlety the planner must resolve explicitly: **the endpoint (funnel with team term for the target) and the redacted doc-GET (admin path uses `canSeeProject` WITHOUT the team term, server.js:847) can disagree for an admin target whose only grant to a private project is a live team link.** D-52-8's parity tests must be written against the funnel (TRN-01 wording), and the parity fixture matrix either needs a cell exercising that divergence or an explicit documented-divergence assertion — the same posture the Phase 49/50 harness uses for the MCP mirror drift. The existing fixture's actors never exercise admin×team-only access, so `VISIBILITY_MODEL` parity still holds as-is for the extended matrix minus that one new cell.

**Primary recommendation:** One GET endpoint (`/api/workspaces/:slug/members/:memberId/visibility`, `requireWorkspace(..., 'admin')` + `sameOrigin` + body-less), one module-scope reason-derivation helper beside the funnel, expansion UI in `src/pages/members.js` rows gated on `isMemberAdmin()`, parity tests plugged into the existing `test/helpers/visibility-fixture.mjs` harness, and the sweep as a pure verification/docs task.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-52-1:** Transparency view lives inside Workspace settings > Members — each member row becomes expandable. No separate Transparency page.
- **D-52-2:** Expansion reveals ALL accessible projects — non-private AND private ones the member can reach; non-private projects are listed, not implied.
- **D-52-3:** Refetch on every open — closed and re-opened always shows current state. A stale open expansion is a point-in-time snapshot.
- **D-52-4:** Expand action is admin/owner only, gated SERVER-side on workspace role. Members cannot expand their own row (TRN-02, v3).
- **D-52-5:** Each listed project shows WHY: 'Everyone' / 'Member' (direct `p.members`) / 'Team: {name}' (live team link) / 'Lead' (D-51-17).
- **D-52-6:** First matching reason only, in funnel order (membership → team; non-private is just 'Everyone'). No multi-reason display.
- **D-52-7:** Reasons render as plain localized labels, EN+FR through the i18n gate. No chips/icons.
- **D-52-8:** Agreement verified by PERMANENT parity tests: endpoint list == complement of the redacted doc's hidden set, same convention as the Phase 49 funnel parity test.
- **D-52-9:** Parity fixture matrix is the EXTENDED set: public, private+direct member, private+team-linked, private+lead, private+no-access (absent), D-51-4 lost-visibility case, empty-members private project, member of zero teams, admin viewing another admin, guest member.
- **D-52-10:** Sweep is gates + docs refresh: full 404-matrix, Phase 38 suppression + no-double-send invariants, EN+FR i18n gate, full test suite, and update `docs/WorkspacePermissions.md` + `docs/ProjectPermissions.md` to the shipped v2.0 model.
- **D-52-11:** Sweep reuses Phase 51 verify commands verbatim (`npm test`, `npm run i18n:scan`, the 404-matrix and suppression suites) — no new aggregate script.

### the agent's Discretion
Transparency endpoint shape and route placement, member-row expansion UI mechanics, reason-label i18n keys, how the endpoint samples the funnel per member (per-project `memberCanReadProject` calls are fine), parity test file placement, docs refresh depth.

### Deferred Ideas (OUT OF SCOPE)
- TRN-02 — Members see their own (redacted) visibility view (v3; D-52-4 locks the admin-only gate for this phase)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TRN-01 | Admin/owner can open a transparency view showing exactly what a given member can see (public projects + private projects they can access) (M-08, D2.0-4) | Endpoint calling `memberCanReadProject` per project (server.js:813-818); reason derivation from `canSeeProject` short-circuit order (server.js:800-805); UI hook in `src/pages/members.js` member rows; parity via `test/helpers/visibility-fixture.mjs` oracles |
| (success criterion 3) | Milestone verification sweep: 404-matrix, suppression/no-double-send invariants, i18n gate, full suite, zero new deps, docs refresh | Verify commands in `package.json` (`test` = `node --test --test-concurrency=2 test/*.test.mjs`, `i18n:scan` = `node scripts/i18n-scan.mjs`); invariant suites: `test/privacy.test.mjs` (404 body-equality), `test/digest.test.mjs` (suppression/no-double-send), `test/dependencies.test.mjs` (zero-dep), `test/error-codes.test.mjs` (code catalogue parity) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Access computation + reason derivation | API/Backend (server.js funnel) | — | TRN-01 mandates server-side computation via `memberCanReadProject`; the client must never derive it from the redacted doc (D-52-4 server gate) |
| Admin-only gating | API/Backend | Frontend (disabled/hidden control) | `requireWorkspace(req, res, slug, 'admin')` is the control (51-02 convention: client gate is UX, server refusal is the control) |
| Expansion UI + per-open refetch | Frontend (`src/pages/members.js`) | — | D-52-1/D-52-3: expandable row, fetch on open, point-in-time snapshot |
| Reason labels | Frontend (i18n keys) | — | Server returns a machine reason code; the client renders localized labels (keeps the i18n gate on the client catalogues) |
| Parity tests | Test harness (`test/`) | — | D-52-8 permanent tests against the hand-derived oracles |
| Docs sweep | Docs (`docs/*.md`, French) | — | D-52-10 |

## Standard Stack

### Core
No new packages — zero-dependency invariant stands (this is a milestone-wide pinned invariant; `test/dependencies.test.mjs` enforces it).

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node:test | built-in (package `test` script) | all new tests | `[VERIFIED: package.json:19]` — `"test": "node --test --test-concurrency=2 test/*.test.mjs"` |
| scripts/i18n-scan.mjs | existing | i18n gate | `[VERIFIED: package.json:9-11]` — `i18n:scan` + gated into `prebuild`/`prebuild:en` |
| `test/helpers/visibility-fixture.mjs` | existing | parity fixture + hand-derived oracles (`VISIBILITY_MODEL`, `MIRROR_MODEL`, `createVisibilityFixtureDb`) | `[VERIFIED: test/helpers/visibility-fixture.mjs:1-457]` — read in full this session |
| `test/helpers/server.mjs` | existing | server harness for endpoint tests | `[VERIFIED: test/helpers/server.mjs` exists; pg matrix inside is opt-in per its D-08 gate] |

### Supporting
| Library | Purpose | When to Use |
|---------|---------|-------------|
| `src/core/api.js` (`api` helper) | client fetch from the expansion | existing pattern used by `pendingInvites` in members.js |
| `src/locales/en.json` + `fr.json` | new reason-label keys | every new user-facing string (D-52-7) |

**Installation:** none. **Zero new runtime dependencies is a pinned milestone invariant** — the endpoint is pure JS over the stored doc + two indexed SQLite lookups.

## Package Legitimacy Audit

No external packages are installed by this phase (zero-dependency invariant, `test/dependencies.test.mjs` guards it). Audit table: **n/a — nothing to verify.**

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Admin/owner browser
   │  click expand on member row (D-52-1)
   ▼
src/pages/members.js  ── api.get(`/api/workspaces/{slug}/members/{memberId}/visibility`)
   │                          (fetch EVERY open — D-52-3)
   ▼
server.js route chain (wsMatch + method==='GET')
   │  requireWorkspace(req,res,slug,'admin')   ← D-52-4 server gate
   │  sameOrigin(req)                            ← route hardening convention
   ▼
reason-derivation pass over doc.data.projects:
   for each p:  memberCanReadProject(p, wsId, targetMemberId)   ← THE ONE FUNNEL (server.js:813)
        │ accessible → derive first-match reason from
        │   canSeeProject order: public('Everyone') → p.members('Lead'|'Member') → p.teams('Team: {name}')
        ▼
{ projects: [{ id, name, reason }...] }   ← reason CODE, label localized client-side (D-52-7)
   ▼
expanded row renders project names + localized reason labels
   ▲
parity (D-52-8, permanent tests): endpoint list == complement of redacted-doc hidden set,
asserted against hand-derived VISIBILITY_MODEL — never against memberCanReadProject output
```

### Recommended Project Structure
```
server.js                          # +1 GET route in the existing wsMatch chain; +1 module-scope reason helper beside the funnel (~:771-848)
src/pages/members.js               # expansion UI on member rows (isAdmin-gated), S.ui state for open member
src/locales/en.json, fr.json       # reason labels + a11y strings (catalogue pin updates with it)
test/transparency.test.mjs         # endpoint gate/shape/parity tests (placement = agent's discretion)
test/helpers/visibility-fixture.mjs # extend with the D-52-9 cells (lead-only access, admin-viewing-admin, etc.)
docs/WorkspacePermissions.md       # sweep refresh (French, file:line refs re-verified at doc time — 51-04 convention)
docs/ProjectPermissions.md         # sweep refresh
```

### Pattern 1: The reason derivation must mirror the funnel's short-circuit order
**What:** For each accessible project, derive the FIRST reason in `canSeeProject` order (server.js:800-805, read verbatim this session):
```js
// server.js:800-805 — the order the reason derivation must follow
function canSeeProject(p, memberId, memberTeams = []) {
  if (!projectIsPrivate(p)) return true;                       // → reason 'Everyone'
  if (!memberId) return false;
  if (Array.isArray(p.members) && p.members.includes(memberId)) return true;  // → 'Lead' | 'Member'
  return Array.isArray(p.teams) && p.teams.length > 0 && memberTeams.some(t => p.teams.includes(t)); // → 'Team: {name}'
}
```
**When to use:** the endpoint's reason helper. Non-private ⇒ 'Everyone' regardless of any other grant (public is public — fixture comment on `p_publicgain`).
**Gotcha — Lead vs Member:** `p.lead` is NOT a visibility term. `normalizeProjects` pushes the lead into `p.members` (server.js:867, read this session), so a lead always matches 'Member' too. D-52-5 wants the 'Lead' label: the derivation must test `p.lead === memberId` BEFORE the generic `p.members.includes(memberId)` within the membership tier. This is a label refinement inside the same funnel outcome, not a second predicate — document it as such in the helper's comment.

### Pattern 2: Admin route shape (copy the existing convention)
Every workspace-scoped admin write follows this exact shape (PATCH route, server.js:4752-4757, read this session):
```js
const ctx = await requireWorkspace(req, res, wsMatch[1], 'admin');
if (!ctx) return;
if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
```
GET routes in the same chain use `requireWorkspace(req, res, wsMatch[1])` (default `'viewer'`) or an explicit min role; read-only GETs generally skip `sameOrigin`. Match the neighboring GET route (doc-GET at :4660). If the endpoint introduces any NEW `fail()` code, it must be added to the error-codes catalogue — `test/error-codes.test.mjs` enforces static parity both directions (:15 D-04 forward, :264 IN-01 reverse with an allowlist for client-composed codes).

### Pattern 3: Parity against hand-derived oracles, never against the code under test
**What:** `test/helpers/visibility-fixture.mjs:5-8` states the anti-tautology contract verbatim: `VISIBILITY_MODEL`/`MIRROR_MODEL` are hand-derived and "Consumers must not derive expectations from memberCanReadProject (server.js) or canReadProject (mcp.js)". The Phase 49 harness (`test/mcp.test.mjs:741-768`) boots `createVisibilityFixtureDb` and asserts `deepEqual(serverIds, VISIBILITY_MODEL[actor])`.
**How to use for D-52-8:** boot the same fixture, hit the new transparency endpoint for each actor, assert the returned id set equals `VISIBILITY_MODEL[actor]` AND equals the complement of the redacted doc's hidden set (doc-GET as that actor → hidden = all − served). For the admin-target divergence (see Pitfall 1), either add a fixture cell (admin NOT in p.members but on a linked team) and pin the endpoint-funnel semantics explicitly, or assert the documented divergence the way the mirror drift is pinned.
**D-52-9 extended cells:** the existing fixture already covers public, private+direct member, private+team-linked, private+no-access, empty-members private (`p_scopeproj`/`p_sealed`), member of zero teams (`m_guest`/`m_plain`), admin and guest actors. Cells to ADD: private+lead-only access (a project where the target is lead via `p.lead` — currently every fixture lead is also explicitly in `p.members`... except verify: `p_membershare` has `lead: 'm_plain'` AND `members: ['m_plain']`, so a lead-without-membership cell does not exist yet), D-51-4 lost-visibility case (member removed from `p.members` while a stale client doc still holds the project — the visibility-epoch cell), and admin-viewing-another-admin (requester m_admin, target m_admin — or target another admin actor).

### Pattern 4: Client expansion mechanics (members.js)
The member table rows are rendered in `pageMembers()` (src/pages/members.js:60-84). Row already carries `data-ctx="member" data-id`. Expansion needs: an admin-only chevron/expander control per row (`isAdmin` variable already exists at :37), an action handler storing the open member id in `S.ui` (pattern: `S.ui.memberRevoke` at :77), and a fetch-on-open that renders `{project name, localized reason}` rows inside a second `<tr>` (or a detail panel). Client-side derivation is FORBIDDEN for the list content (success criterion 1) — the client renders what the server returns. Note `visibleProjects()` in the row's "active projects" count (:65) is the member's own client view — fine for the existing stat, but it must not be reused for the transparency list.

### Anti-Patterns to Avoid
- **Deriving the list from the redacted client doc** (`visibleProjects()`, `D().projects`): success criterion 1 forbids it; the redacted doc is also missing hidden projects by construction.
- **Deriving reasons client-side from `p.members`/`p.teams` of the redacted doc:** hidden projects' access lists are not even present client-side; and lead/team state lives server-side.
- **Making `memberCanReadProject` return reasons / touching the funnel:** the phase observes the funnel, never changes it (CONTEXT domain note). Any edit inside `canSeeProject`/`memberCanReadProject`/`hiddenFor` risks the Phase 49/50 pinned tests for zero benefit.
- **Memoizing team resolution:** D-50-3 forbids memoization anywhere in the funnel; `teamsOfMember` resolves fresh per call (server.js:776-784 comment). Per-member `teamsOfMember` once per endpoint request, reused across that member's projects, is fine (that is what `hiddenFor` does at :840) — but never cross-member or cross-request caching.
- **A new aggregate sweep script:** D-52-11 forbids it — reuse the verify commands verbatim.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| "Can member X read project Y" | a second predicate or SQL query | `memberCanReadProject(p, wsId, memberId)` (server.js:813) | one-funnel doctrine (RETROSPECTIVE: "One helper, one funnel"); a second predicate is exactly what the milestone deleted |
| Team ids for a member | SQL joins scattered in the route | `teamsOfMember(wsId, memberId, membershipRow)` (server.js:785) | carries the user_id-space join + membershipRow fast path |
| Parity expectations | calling `memberCanReadProject` in tests | `VISIBILITY_MODEL` oracle + `createVisibilityFixtureDb` | anti-tautology contract (fixture :5-8) |
| 404/no-leak verification | new probe scripts | `test/privacy.test.mjs` 404 body-equality rows | already model-neutral and pinned green |
| i18n parity | manual key diffing | `npm run i18n:scan` + `test/catalogue.test.mjs` | dead-key, placeholder-parity, EN↔FR notif parity all automated |

**Key insight:** this phase's entire server surface is ~40 lines calling existing helpers. Everything hard (the model, the fixture, the gates) already exists — the risk is in SEMANTIC alignment (which oracle to compare against), not implementation volume.

## Common Pitfalls

### Pitfall 1: The endpoint and the redacted doc-GET can legitimately disagree for admin targets
**What goes wrong:** `hiddenFor`'s admin/owner path uses `hiddenProjectIds` = `canSeeProject` WITHOUT the team term (server.js:847, :20-25 fixture comment), while `memberCanReadProject` (what TRN-01 mandates the endpoint use) includes the live team term for the target. An admin whose only grant to a private project is a linked team appears in the endpoint list but NOT in their own redacted doc-GET.
**Why it happens:** the admin doc-GET posture ("access-list-gated", Phase 49 pinned) predates D-50-5's restored team term and was deliberately kept.
**How to avoid:** D-52-8 parity tests must compare against the funnel semantics; for admin targets either (a) add a fixture cell exposing the divergence and pin it as documented-divergence (mirror-drift precedent), or (b) assert parity per the member's own experience noting the admin doc-GET caveat. The CURRENT fixture matrix happens to be safe (m_admin sits on every access list it touches — `VISIBILITY_MODEL.m_admin` holds under both readings), so the existing-oracle assertions pass unchanged; decide (a)/(b) when adding the extended cells.
**Warning signs:** a parity test that passes for admins for the "wrong reason" (no cell exercises the difference).

### Pitfall 2: 'Lead' reason ordering vs funnel order (D-52-5 vs D-52-6)
**What goes wrong:** `canSeeProject` has no lead term; `normalizeProjects` guarantees `p.lead ∈ p.members` (server.js:867). Naively following "funnel order = first match" yields 'Member' for every lead, contradicting D-52-5's 'Lead' label.
**How to avoid:** within the membership tier, test lead before plain member. This is label selection, not predicate change — comment it explicitly so the plan-checker doesn't read it as a funnel edit.
**Warning signs:** zero 'Lead' labels in the parity fixtures for private+lead cells.

### Pitfall 3: i18n gate surface is wider than the locale files
**What goes wrong:** new strings only in `src/locales/*.json` still trip the gate: the catalogue count is pinned (1716 after Phase 50; Phase 51 deleted 17 orphans — STATE.md), `scripts/i18n-scan.mjs` gates prebuild, dead-key collector scans `src/ + server.js + mailer.js`, and `test/error-codes.test.mjs` demands every new server `fail()` code be catalogued.
**How to avoid:** add EN+FR keys, update the catalogue pin if a test asserts an exact count, catalogue any new error code (or reuse an existing one like the keyed-refusal pattern).
**Warning signs:** `npm run i18n:scan` non-zero, or `error-codes` static parity failures in `npm test`.

### Pitfall 4: Route ordering in the server's if-chain
**What goes wrong:** server.js routes are ordered regex/if chains; `test/file-route-ordering.test.mjs` exists precisely because ordering bugs shipped before. A new `wsMatch && method === 'GET'` branch placed after a greedy match (e.g. the doc-GET or file-serve branch) can be shadowed.
**How to avoid:** insert the route adjacent to the other structured member/workspace GET routes and run the full suite (`npm test`), not just the new test file.
**Warning signs:** new endpoint 404s/returns the doc payload in tests.

### Pitfall 5: The sweep must be verification, not code churn
**What goes wrong:** "fixing" anything the sweep surfaces (e.g. the two carried Phase 51 advisory CR items — inverted permCreate polarity at src/pages/settings.js:299, partial create gating — STATE.md blockers) silently expands the phase.
**How to avoid:** D-52-10 scopes the sweep to gates + docs. Anything red that is NOT this phase's regression gets logged as a carried item (Phase 51 precedent: 51-REVIEW-DISPOSITION.md), not patched here.
**Warning signs:** sweep plan tasks that edit production code.

### Pitfall 6: Docs refresh must re-verify file:line refs against the live tree
**What goes wrong:** docs cite `server.js:820-823`-style refs (51-04 convention: refs verified at doc time). Line numbers drift with this phase's route insertion.
**How to avoid:** verify every file:line ref in `docs/WorkspacePermissions.md` + `docs/ProjectPermissions.md` against the live tree during the docs task (grep the symbol, cite the fresh range). Docs are in French — preserve the language and typography conventions.

## Code Examples

### The endpoint core (shape only — exact naming at planner/executor discretion)
```js
// beside the funnel, server.js (~:823). Derives the FIRST reason per D-52-6,
// with lead tested before plain member inside the membership tier (Pitfall 2).
async function projectAccessReason(p, wsId, memberId) {
  if (!projectIsPrivate(p)) return 'everyone';
  if (Array.isArray(p.members) && p.members.includes(memberId))
    return p.lead === memberId ? 'lead' : 'member';
  const memberTeams = await teamsOfMember(wsId, memberId, null);
  if (memberTeams.some(t => Array.isArray(p.teams) && p.teams.includes(t))) return 'team';
  return null; // not accessible — must never be listed (D-52-2)
}
// route: GET /api/workspaces/:slug/members/:memberId/visibility
// requireWorkspace(req,res,slug,'admin'); resolve target member from doc.data.members;
// for each doc.data.projects: reason = await projectAccessReason(...) — or short-circuit
// with memberCanReadProject first if you prefer the funnel as the accessibility authority
// and the helper as label-only. Respond { member: id, projects: [{id, name, reason}] }.
```
Note the two-door option: call `memberCanReadProject` for accessibility (TRN-01 verbatim) and the reason helper for the label — they must agree by construction; a parity assertion `memberCanReadProject ⇔ reason !== null` in the endpoint tests pins that cheaply.

### Parity test skeleton (Phase 49 convention)
```js
// test/transparency.test.mjs (placement at discretion)
import { createVisibilityFixtureDb, VISIBILITY_MODEL, VIS_ACTORS, VIS_PASSWORD, VIS_WS } from './helpers/visibility-fixture.mjs';
// boot server on the fixture; login as m_admin (requester);
for (const target of VIS_ACTORS) {
  const res = await admin.get(`/api/workspaces/${VIS_WS.slug}/members/${target}/visibility`);
  const ids = res.data.projects.map(p => p.id).sort();
  assert.deepEqual(ids, [...VISIBILITY_MODEL[target]].sort(), `${target}: endpoint matches the hand-derived oracle`);
  // D-52-8 second leg: complement of the redacted doc hidden set
  const doc = (await admin.get(`/api/workspaces/${VIS_WS.slug}`)).data.doc;
  const servedIds = new Set(doc.data.projects.map(p => p.id)); // already redacted server-side
  const hidden = allProjectIds.filter(id => !servedIds.has(id));
  // NOTE (Pitfall 1): assert against the funnel semantics; admin-target divergence
  // is either a new fixture cell or a documented-divergence assertion.
}
// plus gate rows: m_plain requester → 403; viewer → 403; nonexistent member → keyed 404.
```

### Verify commands (D-52-11 — run verbatim, no wrapper)
```bash
npm test                 # node --test --test-concurrency=2 test/*.test.mjs — includes 404-matrix,
                         # suppression/no-double-send (digest.test.mjs), dependencies (zero-dep),
                         # error-codes parity, i18n suites
npm run i18n:scan        # node scripts/i18n-scan.mjs — 0 dead / exit 0
node --check server.js   # Phase 51 syntax gate
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate visibility-predicate per surface | ONE funnel `memberCanReadProject` + `hiddenFor` | Phase 49 (2026-11-07), team term restored Phase 50 (D-50-5, 2026-11-08) | the endpoint just calls it — no new model code |
| Snapshot team expansion | LIVE team links (no caching) | D-50-5 (2026-11-08) | governs D-52-3 refetch-on-open and the 'Team: {name}' reason freshness |
| Settings > Permissions page | relocated into Settings > Members (D-51-13) | Phase 51 | the expansion UI attaches to the relocated members table in `src/pages/members.js` |
| Docs describing v1.7-era model | docs rewritten per phase with live-tree refs | 50-04, 51-04 | sweep finishes the job (D-52-10) |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The reason labels should be rendered client-side from machine reason codes (endpoint returns `reason` keys, not localized strings) | Architecture Patterns / D-52-7 | LOW — server-side localization would need the server locale machinery; either is compliant with D-52-7, but this shapes the endpoint contract. Confirm at planning if the owner cares |
| A2 | GET endpoints in this chain may skip `sameOrigin` (only writes use it) | Pattern 2 | LOW — copying the neighboring GET route's shape is safe either way; include sameOrigin if unsure (harmless on GET) |
| A3 | A "lead without explicit membership" cell does not exist in the current fixture (every lead is also in `p.members`) | Pattern 3 | LOW — verified by reading `visfixDoc()`; if a cell exists that I misread, the extended matrix just needs less work |
| A4 | The m_admin VISIBILITY_MODEL row holds under both funnel and access-list-gated readings (no admin×team-only cell) | Pitfall 1 | MEDIUM — if wrong, existing parity assertions need updating; verified against `visfixDoc()` by inspection, but the planner should re-derive when adding cells |

## Open Questions

1. **Admin-target parity semantics (Pitfall 1) — (a) new divergence cell or (b) documented-divergence assertion?**
   - What we know: funnel (endpoint, TRN-01) vs admin doc-GET (access-list-gated) can differ; fixture currently safe by luck.
   - Recommendation: (a) — add the cell and pin the endpoint as the authority; it is honest and future-proof. Planner decision within the agent's discretion.
2. **Endpoint response shape:** flat `[{id, name, reason}]` vs grouped. Recommendation: flat + reason code; UI renders labels. (Discretion area.)
3. **Where the 'lost-visibility' D-51-4 cell is exercised:** S.ui.lostProjects is client-side; the parity test can only assert the SERVER list shrinks. Recommendation: assert the endpoint list (not the client epoch machinery) — TRN-01 is about the endpoint.

## Environment Availability

Phase is code/config/tests only on an existing stack.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node (node:test, node:sqlite) | all tests | ✓ | package engines per existing suite (1133 tests green at Phase 51 close — STATE.md) | — |
| npm scripts `test` / `i18n:scan` | sweep | ✓ | `[VERIFIED: package.json:9,19]` | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** n/a. (pg matrix tests are opt-in via DB_URL and not required by the sweep — Phase 45 D-08 gate.)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (built-in), `--test-concurrency=2` |
| Config file | none — glob-based (`test/*.test.mjs`) |
| Quick run command | `node --test test/transparency.test.mjs` |
| Full suite command | `npm test` (~1133 tests, green at Phase 51 close) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TRN-01 | Endpoint computes accessible projects + reasons via the funnel | unit/integration (fixture server) | `node --test test/transparency.test.mjs` | ❌ Wave 0 |
| TRN-01 | Admin/owner-only gate; member/viewer refused; self-expansion blocked server-side | integration | same file | ❌ Wave 0 |
| TRN-01 (D-52-8) | Parity: endpoint list == VISIBILITY_MODEL == complement of redacted hidden set, extended matrix | integration (permanent) | same file (or extends `test/mcp.test.mjs` harness style) | ❌ Wave 0 |
| SC-3 | 404-matrix / suppression / no-double-send invariants unmodified | regression (existing) | `node --test test/privacy.test.mjs test/digest.test.mjs` | ✅ |
| SC-3 | i18n gate EN+FR, 0 dead keys | existing + new keys | `npm run i18n:scan` | ✅ (keys added) |
| SC-3 | zero new runtime deps | existing | `node --test test/dependencies.test.mjs` | ✅ |

### Sampling Rate
- **Per task commit:** `node --test test/transparency.test.mjs` (+ `npm run i18n:scan` when strings changed)
- **Per wave merge:** `npm test`
- **Phase gate:** full `npm test` + `npm run i18n:scan` + `node --check server.js` green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/transparency.test.mjs` — endpoint gate/shape/parity (TRN-01, D-52-8)
- [ ] `test/helpers/visibility-fixture.mjs` — extended cells: lead-only access, lost-visibility, admin-viewing-admin (D-52-9)
- [ ] Catalogue pin update in `test/catalogue.test.mjs` if it asserts an exact key count

*(Framework install: none needed.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V4 Access Control | **yes — core of the phase** | `requireWorkspace(req,res,slug,'admin')` server gate (D-52-4); client expand button is UX only (51-02 convention) |
| V5 Input Validation | yes | `memberId` path param validated against `doc.data.members` (keyed 404 for unknown member, no existence oracle for the MEMBER either — return the same 404 body for unknown and absent ids); no user-supplied project ids accepted |
| V13 API | yes | follow route-chain conventions (keyed `fail()` codes, catalogued per error-codes parity test) |
| V2/V3/V6 | no | no auth/session/crypto surface touched |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Existence oracle via the new endpoint (probing hidden member/project ids) | Information Disclosure | unknown target member ⇒ identical neutral 404 shape; accessible-list computed only for members the admin can already see in `doc.data.members` |
| Member self-probing own/other access | Elevation/Information Disclosure | server-side admin gate (D-52-4); response never includes access lists of projects, only ids+names+reason for the TARGET — names of private projects are exposed to ADMINS only, which is the existing admin posture (`hiddenProjectTerms` shows admins already see hidden names server-side) |
| Cross-origin write | — | n/a (GET only); add `sameOrigin` if the route ever mutates |
| Reason leakage beyond intent | Information Disclosure | return a coarse reason CODE, not team rosters or access lists; 'Team: {name}' needs only the single first-matching team's name |

## Project Constraints (from AGENTS.md)

No project-level `./AGENTS.md` exists in the repo root (verified this session). Standing project constraints that bind this phase come from `.planning/PROJECT.md` / STATE.md and are pinned in CONTEXT.md: zero new runtime dependencies; EN+FR i18n gate on every user-facing string (server keys included); Phase 38 suppression + no-double-send invariants byte-identical; byte-identical 404s (no existence oracle); one-funnel doctrine — never a second visibility pipeline.

## Sources

### Primary (HIGH confidence)
- `server.js:771-948` — `projectIsPrivate`, `teamsOfMember`, `canSeeProject`, `memberCanReadProject`, `canManageProject`, `hiddenFor`, `normalizeProjects`, `hiddenProjectIds` (read this session)
- `server.js:4752-4757` — admin PATCH route shape (`requireWorkspace` + `sameOrigin` + `fail`) (read this session)
- `test/helpers/visibility-fixture.mjs:1-457` — anti-tautology contract, `VISIBILITY_MODEL`, `MIRROR_MODEL`, fixture DB (read this session)
- `test/mcp.test.mjs:610-768` — the Phase 49 parity harness this phase extends (grep-located, patterns quoted)
- `src/pages/members.js:1-195` — member table, `isAdmin`, `S.ui` state patterns (read this session)
- `package.json:9-19` — verify commands verbatim (read this session)
- `.planning/phases/52-.../52-CONTEXT.md`, `REQUIREMENTS.md`, `STATE.md` — decisions TRN-01, D-52-1..11 (read this session)

### Secondary (MEDIUM confidence)
- `test/privacy.test.mjs:457-539` — 404 body-equality rows (read this session, partial)
- `.planning/phases/50-REVIEW.md` — remindable()/funnel drift precedent (the "audit don't assume parity" lesson)
- `.planning/phases/51-VERIFICATION.md` — sweep command evidence

### Tertiary (LOW confidence)
- none

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; commands verified in package.json
- Architecture: HIGH — funnel, fixture, gates, and UI anchor all read in the live tree
- Pitfalls: HIGH — Pitfall 1/2 derive from verbatim code reads; Pitfall 3/4/5 from pinned tests and STATE.md history

**Research date:** 2026-11-08
**Valid until:** 2026-12-08 (in-repo phase; only line-number drift risk)
