# Phase 53: Member & Project Experience - Research

**Researched:** 2026-11-09
**Domain:** Vanilla-JS PM workspace — per-team permissions (server funnel), invite modal state binding, unified settings modal, projects table, i18n gate
**Confidence:** HIGH — every integration point below was read from live source this session, on top of the milestone research corpus (`.planning/research/ARCHITECTURE.md`, `PITFALLS.md`, `STACK.md`, `FEATURES.md`, `SUMMARY.md`) produced 2026-11-09 from direct file:line reads

## Summary

Phase 53 is a reassembly phase, not a discovery phase: **every renderer, helper, funnel, and gate needed already exists in-repo**. The one genuinely new capability is per-team permissions (PSET-02/03), and its design is already fixed by CONTEXT.md D-01..D-03: team-keyed entries inside the existing `p.perms` map (`p.perms['team:'+teamId]`), visibility stays boolean (`canSeeProject` untouched as a predicate), and a new `projectPermFor` helper gates **write routes only**. Because team keys live inside `p.perms`, three existing sinks treat them for free: the non-manager pin block (server.js:1090-1102 restores `p.perms` wholesale — VERIFIED below), the member-removal sweep, and `normalizeProjects`' object check. Zero migrations, zero new dependencies.

The rest of the phase is wiring with known hazards: the invite email draft wipe is confirmed live — the textarea at modals.js:312 renders `esc(S.ui.inviteDraft || '')` with **no `data-in` attribute**, so any full-DOM `render()` (role change, chip toggle, background poll) wipes it; the fix is one `data-in="inviteDraft"` attribute + one silent-state handler. The unified settings modal (53-03) is a merge of `projectModal` (modals.js:156-194) and `shareModal` (:202-289) — its real risk is stale-doc PUTs through the whole-document merge, governed by the live-store-state + revision-adoption contract. The projects table (53-04) needs a column insert plus deletion of two duplicate Share buttons (project.js:74-75 VERIFIED, all three already dispatch `data-a="share"`).

**Primary recommendation:** Build strictly in the pinned order 53-01 → 53-02 (independent, can run early) → 53-03 → 53-04 → 53-05, with 53-01 as ONE lockstep commit across server funnel + `projectAccessReason` + mcp.js mirror + client `canSee`, the `VISIBILITY_MODEL` oracle extended, and a pin-block regression test in the same commit.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Team "Full access" is content-only. Full content rights (edit tasks, comment, manage files) but the Access list stays owner/admin/lead-only. `canManageProject` unchanged; per-team perms gate write actions, never management. A linked team can never lock the owner out.
- **D-02:** Default perm for a newly linked team is "Can edit".
- **D-03:** Visibility stays boolean. Per-team perms never add/remove a project from anyone's list; `canSeeProject` keeps answering see/don't-see.
- **D-04:** Two tabs — General and Access. General: desc/icon/color/lead/target date. Access: Teams (per-team perm dropdowns), Individual Members, General Access. Both old modals removed.
- **D-05:** Share deep-links to the Access tab; settings gear opens on General.
- **D-06:** Guest without a project → disable + hint ("Guests need exactly one project" / FR). No silent clamping, no auto role downgrade.
- **D-07:** Settings gear is a standalone per-row icon in Workspace > Projects, last column alongside the ⋯ menu.
- Carried forward (owner-validated): M-09 4-level perm model reused, no new role concept; M-10 status = PSTAT values, progress = task-based `progressOf`; M-11 date column = `p.due`; M-12 one unified modal; M-13 exactly one Share button; TEAM-02 wording verbatim "Every member of a team can have access to a project that is assigned to a team"; TEAM-03 invites only via Workspace > Members; funnel lockstep mandatory (09a9c41 regression class).

### the agent's Discretion
- Chip/dropdown styling within existing tokens and modal patterns
- Tab bar visual treatment (reuse existing modal header patterns)
- Members-count tooltip wording (coarse info only — no rosters, T-52-03 doctrine)
- Un-select lifecycle details beyond D-06 (e.g. hint before any project picked)

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PSET-02 | Per-team perms reusing per-person 4-level model | `PERMS` verbatim at modals.js:195; `p.perms` map already member-keyed; flat `'team:'+id` keys need zero sink changes |
| PSET-03 | Server-side gating via `projectPermFor`, lockstep mirror | Funnel verified at server.js:800-818; label mirror :828-835; MCP mirror mcp.js:183-197; pin block :1090-1102; oracle at test/helpers/visibility-fixture.mjs |
| INVT-01 | Email draft survives role/team/scope changes | Bug confirmed live: modals.js:312 textarea has no `data-in`; dispatch paths verified events.js:55-65 |
| INVT-02 | Projects chip multi-select below Team | `scopePicker('proj', scope.projects, 'invProjToggle', 'folder')` already renders at modals.js:324 |
| INVT-03 | Guest = exactly one project, create AND edit, server-enforced | Today's gate covers member-tier only (server.js:5217-5226 per milestone research); admin/owner guest path needs new validator; MCP ceiling: verify at plan time |
| PSET-01 | Unified settings modal replaces both modals | Both modal bodies verified (modals.js:156-194, :202-289); form+submit vs immediate-action hybrid pattern documented |
| PSET-04 | Same modal from Workspace > Projects and project page | Dispatcher `case` at modals.js:41-43; entry points all dispatch `data-a="share"`/`editProject` |
| PROJ-01 | Table columns Lead/Teams/Members/Status/Target date | Table verified at projects.js:56-64 — Lead, Status, Teams, Progress, Due already render; only Members count + gear column are new |
| PROJ-02 | Exactly one Share button | project.js:74-75 (avatar-stack, user-plus) and :76 (labeled) verified — delete :74-75, keep :76 |
| TEAM-01 | Searchable Edit Team members box | Unfiltered checkbox list verified at teams.js:33-45; `foldForSearch` + share-modal search pattern (modals.js:203-228) to copy |
| TEAM-02 | Correct multi-team hint EN+FR | Wrong hint is `page.team.membersHint`, rendered at teams.js:45 |
| TEAM-03 | Remove team-page invite button | `data-a="invite"` button verified in members.js (team detail `acts` block) |
| UX-01 | i18n gate: 0 dead/0 stale, pins bumped same commit | `npm run i18n:scan` gate exists as prebuild hook (package.json scripts, VERIFIED) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Per-team perm storage + enforcement | API/Backend (server.js funnel) | MCP mirror (mcp.js) | Server-authoritative access is the security posture; client is a display mirror only |
| Visibility funnel | API/Backend (`canSeeProject`/`memberCanReadProject`) | Client `canSee` (store.js:345) | One funnel, five server consumers + two mirrors; boolean per D-03 |
| Per-team perm dropdowns | Browser/Client (unified modal) | — | Writes ride existing doc-PUT path; enforcement is server-side |
| Invite draft persistence | Browser/Client (`data-in` binding) | — | Pure state-binding fix; no server change |
| Guest one-project invariant | API/Backend (validators) | Client disable+hint (D-06) | Client UX is cosmetic; tests assert the server refuses |
| Unified settings modal | Browser/Client | API/Backend (pin block) | Stale-PUT protection is server-side; live-store-state is client-side |
| Projects table columns | Browser/Client | — | Renderers exist; only reassembly |
| i18n gate | Build (scripts/i18n-scan.mjs) | — | Prebuild hook, EN+FR parity + dead-key families |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vanilla ES modules | ES2022 | All new UI | String templating + event delegation the app does everywhere [VERIFIED: package.json] |
| node:sqlite / pg adapter | built-in / ^8.23.1 | Persistence | Doc-field addition, not schema migration [VERIFIED: package.json deps — `pg` only] |
| Hand-made `t()` i18n | 1711 keys pinned | EN+FR labels | Gate enforces parity + dead keys [VERIFIED: package.json prebuild script] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node --test | Node ≥24 | Unit/suite | `npm test` [VERIFIED: package.json engines + scripts] |
| @playwright/test | ^1.64.1 | e2e (modal interaction, locale sweeps) | `npm run e2e` [VERIFIED: package.json] |

**Installation:**
```bash
# Nothing. Zero new runtime dependencies (standing constraint).
```

**Package Legitimacy Audit:** Not applicable — this phase installs **zero packages** (verified: `pg` is the only dependency, devDeps unchanged). No legitimacy gate run needed.

## Architecture Patterns

### System Architecture Diagram

```
 Admin (unified settings modal / invite modal)
   │  data-in silent-state bindings ──► S.ui.* store
   │  doc-PUT (whole document, optimistic)
   ▼
 server.js mergeClientDoc ─── non-manager? ──► PIN BLOCK (server.js:1090-1102)
   │                                            p.private/members/perms/lead/
   │                                            teams/allowInviteGuests restored
   │                                            (p.perms covers team: keys FREE)
   ▼
 normalizeProjects ──► p.perms object check (extend: team: keys valid + values ∈ PERMS)
   │
   ▼
 ONE FUNNEL (visibility, stays boolean per D-03)      NEW: capability gate (write routes)
   canSeeProject (server.js:800)                        projectPermFor(p, member, teams)
   memberCanReadProject (server.js:813)  ──lockstep──►  e.g. comment/edit need ≥ 'Can edit'
   │                                                    canManageProject UNCHANGED (D-01)
   ├─ consumers: hiddenFor (:851), reminders, digest,
   │  email mirror, transparency view
   ├─ label mirror: projectAccessReason (:828) — lockstep
   ├─ MCP mirror: canReadProject (mcp.js:183) — lockstep, same commit
   └─ client mirror: canSee (store.js:345) — lockstep fixture
   ▼
 VISIBILITY_MODEL oracle (test/helpers/visibility-fixture.mjs) — extend with team-perm cells
```

### Recommended Project Structure
No new files required — the phase extends existing modules:
```
server.js                      # projectPermFor helper near :805; invite guest validator near :5196
mcp.js                         # mirror update in :183 region (same commit)
src/overlays/modals.js         # unified settings modal replaces projectModal+shareModal; invite draft binding :312
src/actions/actions.js         # IN.inviteDraft, IN.teamPerm handlers (near :1833 / :2040)
src/features/teams.js          # foldForSearch members box; hint swap
src/pages/projects.js          # Members count column + gear column
src/pages/project.js           # delete :74-75, retarget Share to Access tab
src/locales/{en,fr}.json       # new/changed/deleted keys, same commit as UI change
test/helpers/visibility-fixture.mjs + test/*.mjs   # oracle extension + pin regression
```

### Pattern 1: data-in silent-state binding (no render in handler)
**What:** `IN.x` handlers mutate `S.ui` only; re-renders restore values from state.
**Verified dispatch:** non-change inputs fire `IN[el.dataset.in]?.(el, e)`; change elements (select/checkbox/radio/file/date) fire on the `change` listener [VERIFIED: src/actions/events.js:55-65, quoted: `export const isChangeEl = el => el.matches('select, input[type=checkbox], input[type=radio], input[type=file], input[type=date]')`]. A textarea rides the `input` path.
**When to use:** EVERY keystroke-able field in plans 53-02 and 53-03, including dynamically generated per-team perm selects (key state by team id, not DOM position).

### Pattern 2: immediate-action share controls (no form submit)
**What:** Access-level edits push the doc per-control with snapshot-revert (IN.sharePerm / IN.shareAccess exist today, actions.js:1833/:1854 per milestone research). The unified modal's Access tab keeps this model; the General tab keeps the `data-submit="submitProject"` form model (VERIFIED: form at modals.js:161, footer button :193). No conflict — the two models coexist in one modal.

### Pattern 3: manager-guarded access fields on doc-PUT
**Verified verbatim** [VERIFIED: server.js:1090-1102]:
```js
if (prev && !canManageProject(prev, memberId, role)) {
  // Access fields belong to a manager even when the project is visible.
  p.private = prev.private;
  p.members = prev.members;
  p.perms = prev.perms;
  p.lead = prev.lead;
  ...
  p.teams = prev.teams;
  p.allowInviteGuests = prev.allowInviteGuests;
}
```
**Consequence:** because team perms live inside `p.perms`, a stale non-manager PUT already cannot wipe them — but a regression test is still mandatory (the pin list is imperative, one refactor away from losing the property).

### Pattern 4: the one funnel and its mirrors (lockstep)
**Verified funnel** [VERIFIED: server.js:800-818] — `canSeeProject(p, memberId, memberTeams = [])`: public → member → team intersection; `memberCanReadProject` resolves live teams async then re-enters. **Label mirror** `projectAccessReason` returns coarse codes `'everyone' | 'lead' | 'member' | 'team'` [VERIFIED: server.js:828-835, quoted return values]. **MCP mirror** `canReadProject` is a hand-maintained copy resolving live teams from `team_members` [VERIFIED: mcp.js:183-197]. **Client mirror** `canSee` at store.js:345 (comment dated 2026-11-09 fix — the 09a9c41 class). Per D-03 these stay boolean and UNCHANGED; the lockstep requirement applies to the *agreement fixture* (all mirrors tested against the same oracle) and to any future term they gain.

### Anti-Patterns to Avoid
- **New top-level `p.teamPerms` field:** would need its own pin-block line, removal-sweep filter, and normalize branch — three changed sinks instead of zero. Use `p.perms['team:'+id]`.
- **Tiering visibility:** forking `canSeeProject` per perm level forks 10+ consumers. Gate write routes instead.
- **Frozen doc snapshot in the settings modal:** caches a stale slice at open-time → silent revert of another admin's grants. Mutate live store state; read the doc at push time; adopt revisions.
- **Allowlisting dead i18n keys:** delete them in the commit that removes the UI; only narrow allowlist entries with a comment, never a broad prefix.
- **Second guest validator copy:** one shared server helper used by create, edit, and accept paths (+ MCP), not three inline checks.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Accent-insensitive search | custom normalize fn | `foldForSearch` (src/core/utils.js:22) | Ships in 4+ surfaces; handles token folding |
| Chip multi-select | new picker component | `scopePicker` / team-chip pattern (modals.js:303-319) | Proven markup, `data-a` toggles wired |
| Status pill + progress | custom renderers | `pStatus` + `progBar` + `progressOf` + `PSTAT` | Already render in projects.js:61 and project.js:71 |
| Lead/teams/date cells | new helpers | `av`/`mem`/`projTeams`/`fmtDate` | Verbatim in projects.js:61 today |
| Visibility tests | ad-hoc assertions | `VISIBILITY_MODEL` / `MIRROR_MODEL` oracle (test/helpers/visibility-fixture.mjs; consumed by test/mcp.test.mjs:742-759) | Anti-tautology contract; both engines already asserted against it |
| Guest scope validation | per-path inline checks | one shared server helper | Behavior-only invariant (D-50-11) must be re-derived on every write path |

**Key insight:** every "new" UI element here has a verbatim in-repo analog; the only design work is the per-team perm row and the tab structure.

## Runtime State Inventory

Not a rename/migration phase, but the phase writes into stored docs — the equivalent audit:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Existing project docs: `p.perms` is member-id-keyed; team keys absent everywhere by construction (new namespace `'team:'+id` cannot collide with member ids) | None — no migration; normalize extension covers crafted/dangling keys |
| Live service config | None found — no external service holds project access state | None |
| OS-registered state | None — verified: phase touches no OS registrations | None |
| Secrets/env vars | None — no new env keys | None |
| Build artifacts | None — no build output carries perms; i18n catalogue is source-controlled | None |

## Common Pitfalls

### Pitfall 1: Funnel/mirror divergence (the 09a9c41 bug class) — CRITICAL
**What goes wrong:** one of the five server consumers or two mirrors (reminder pass, digest, email mirror, `hiddenFor`, transparency view; mcp.js; client `canSee`) disagrees with the funnel after an access-model change. Empirically produced in Phase 50 (`remindable()` skipped the team term).
**Why:** the mirror is a hand-maintained copy (comment at mcp.js:177-182 says so verbatim).
**How to avoid:** any change touching the funnel ships as ONE lockstep commit across server.js + projectAccessReason + mcp.js + client canSee, with `VISIBILITY_MODEL` oracle cells (team-perm-view-only, team-perm-revoked, dangling team id) and client-mirror parity as a tested fixture. Under D-03 the funnel itself should NOT change in 53-01 — the lockstep work is extending the oracle so the parity fixture holds.
**Warning signs:** transparency labels say `'member'` for team-perm actors; MCP list diverges from UI list.

### Pitfall 2: Pin-block omission silently mass-revokes — CRITICAL
**What goes wrong:** an access field missing from server.js:1090-1102 can be deleted by a stale non-manager PUT. Mitigated by keying inside `p.perms` (pin covers it whole — VERIFIED above), but the property is untested unless pinned.
**How to avoid:** regression test: non-manager PUT carrying stale/missing `p.perms` team keys → stored values survive byte-identical. Any NEW manager-owned field (e.g. if General Access ever becomes an enum — out of scope) joins the pin block in the same commit. Also mirror the D-51-15/16 rule: enforcement reads the STORED doc, never the incoming one.

### Pitfall 3: Unified-modal stale-doc writes — CRITICAL for 53-03
**What goes wrong:** modal built once at open-time, submitted minutes later → legitimately overwrites another admin's concurrent grant (revision 409 only fires if the client adopted the latest revision). Or: non-manager sees an editable Access section, save silently no-ops with a success toast.
**How to avoid:** mutate live store state; adopt pushed revisions; gate the Access section with the same shared `canManageProject` the server uses (already imported at modals.js:159/:206); render it read-only for non-managers. Test matrix {manager, lead, team-edit-member, member, guest} × {open, edit general, edit access, save}.

### Pitfall 4: Full re-render wiping input — the INVT-01 bug class at scale
**What goes wrong:** modals are template strings re-rendered on any state change (including the background notif poll). Unbound inputs lose content/focus.
**How to avoid:** plan-level checklist — every keystroke-able field bound to `data-in` BEFORE interaction logic; dynamic per-team perm rows keyed by team id; e2e "type into every field → interact → assert values survived" in both locales. Verify INVT-01 interactively per the owner's specifics (type → switch role → switch team → emails still present).

### Pitfall 5: Guest invariant enforced client-side only on new paths
**What goes wrong:** today's server gate covers the member-tier path; an admin/owner Guest invite with zero projects sails through (milestone research finding). Invite edit and accept paths plus MCP must re-derive it.
**How to avoid:** shared server validator `validateGuestInviteShape(role, projects)` on create + edit + accept; MCP invite tool uses it (fixture in test/mcp.test.mjs). D-06 client behavior (disable + hint) is UX, not enforcement — tests assert the server refuses. Check `src/core/api.js` `createInvites` for how `scope.projects[]` flattens into the POST `body.project` before choosing the clamp location.

### Pitfall 6: i18n dead keys + allowlist blindness + pin drift
**What goes wrong:** removing two modals orphans their key families; the temptation is a broad `DEAD_KEY_ALLOWLIST` prefix that blinds the gate forever. Catalogue-size pin (1711 keys) and data-a pins fail on surprise.
**How to avoid:** dead keys deleted in the commit that removes the UI; narrow allowlist entries only, with comments; catalogue-size and data-a pins bumped in the same commits. New keys in EN+FR with placeholder parity. `npm run i18n:scan` (prebuild hook, VERIFIED) is the gate.

### Pitfall 7: `data-a` name drift during modal consolidation
Prefer reusing existing action names (`submitProject` already handles create+edit); any rename updates dispatcher + all `data-a` attributes + e2e selectors in one commit; grep `data-a="` before declaring done.

### Pitfall 8: Projects-table disclosure beyond the reason-code doctrine
Columns may render what passes `hiddenFor` (names, counts, teams — fields the client already has); tooltips carry coarse codes only, never rosters or per-team perm levels (T-52-03). Guests see exactly one project — no sibling-project hints via column aggregates.

## Code Examples

### The fix for INVT-01 (the whole 53-02 draft fix)
```html
<!-- modals.js:312 — ADD data-in (currently absent; VERIFIED this session) -->
<textarea class="textarea" id="inv-emails" data-in="inviteDraft"
  placeholder="name@company.com, another@company.com" rows="3"
  autofocus>${esc(S.ui.inviteDraft || '')}</textarea>
```
```js
// actions.js — silent handler, NO render() call (next to IN.invRole ~:2040)
IN.inviteDraft = el => { S.ui.inviteDraft = el.value; };
```

### Per-team perm storage + effective-perm resolution sketch
```js
// Storage (no migration — rides p.perms):
// p.perms['team:'+teamId] ∈ PERMS, where
// PERMS = ['Can view', 'Can comment', 'Can edit', 'Full access']  // VERIFIED: modals.js:195

// server.js, near :805 — effective perm for a member (write-route gate):
function projectPermFor(p, memberId, memberTeams = []) {
  if (p.lead === memberId || canManageProject(p, memberId, /* role */ undefined)) return 'Full access';
  const direct = p.perms?.[memberId];
  const teamTiers = (memberTeams || []).filter(t => p.teams?.includes(t))
    .map(t => p.perms?.['team:' + t]).filter(Boolean);
  // rank: highest of direct + team tiers; default 'Can edit' (D-02 / share-modal default)
  ...
}
```
Exact ranking/precedence (individual vs best-team) is a planner decision consistent with M-09 and the share-modal default (lead='Full access', members='Can edit', guests='Can comment' — VERIFIED at modals.js:275).

### Normalize extension (server.js:899 area)
Today: `if (p.perms && typeof p.perms !== 'object') delete p.perms` [CITED: milestone research, consistent with pin-block read]. Extend: `team:`-prefixed keys must reference known team ids and values ∈ PERMS; dangling team ids swept (p.teams precedent).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Team access binary (in team ⇒ full read) | Team access still binary for visibility + tiered write capabilities | Phase 53 (D-03) | Write routes gain `projectPermFor`; funnel untouched |
| Two modals (projectModal + shareModal) | One unified settings modal, General + Access tabs | Phase 53 (D-04/05) | Net code reduction; stale-PUT discipline required |
| Duplicate Share affordances (3 buttons) | One labeled Share → Access tab | Phase 53 (M-13) | project.js:74-75 deletion |
| Team hint: wrong primary-team text | Owner's multi-team sentence EN+FR | Phase 53 (TEAM-02) | `page.team.membersHint` replaced |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The server's member-tier invite gate covers create only; invite **edit** route needs the guest validator re-derived (exact line numbers of the edit route not read this session — server.js:5217-5226 is create) | Pitfall 5 | Guest invite without project slips through edit path |
| A2 | MCP invite tool currently lacks the guest-one-project check (flagged "verify at plan time" in milestone research; not read this session) | Pitfall 5 | Agent-created invites bypass the invariant |
| A3 | Effective-perm precedence (individual over best-team, default Can edit for team-only) — recommended, not owner-ruled beyond D-02 | Code Examples | Wrong precedence changes what team members can do; cheap to adjust |
| A4 | `normalizeProjects` current line is :899 with only the object-type check [CITED: milestone research — consistent with my verified reads but the exact line not re-read] | Code Examples | Normalization weaker than assumed; fail-loud test covers it |
| A5 | Catalogue pin = 1711 keys [CITED: milestone research/STACK.md] | Pitfall 6 | Pin bump amount differs; gate failure is loud and self-correcting |

## Open Questions (RESOLVED)

1. **MCP invite tool ceiling for INVT-03**
   - What we know: REQUIREMENTS.md says "verify the MCP invite tool ceiling at plan time"; STATE.md repeats it.
   - What's unclear: whether the MCP invite path carries the guest project requirement today.
   - RESOLVED: 53-02 Task 2 verifies and, if absent, adds the guest-project guard to the MCP invite path.
2. **Invite-edit route location and shape**
   - What we know: create route verified indirectly (server.js:5187/5217-5226 per milestone research); edit route not located this session.
   - RESOLVED: 53-02 Task 2 locates the edit route among the project-membership routes (server.js:5061/:5095 region) and applies the same shared validator plus the accept path; includes a locate-read step before writing the shared validator.
3. **Precedence rule for `projectPermFor` (A3)**
   - RESOLVED: 53-01 Task 1 implements "best of direct and team tiers, lead/manager ⇒ Full access" and documents it in the docs/ProjectPermissions.md update.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | test suite (`node --test`), engines ≥24 | ✓ (per package.json engines; suite ran green at v2.0 close) | ≥24 | — |
| pg | SQLite+pg dual backend for migration tests | ✓ | ^8.23.1 | — |
| Playwright | e2e modal-interaction tests | ✓ | ^1.64.1 | — |
| i18n-scan | UX-01 gate | ✓ (scripts/i18n-scan.mjs, prebuild hook) | — | — |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node --test (Node ≥24), 1141-test suite; @playwright/test for e2e |
| Config file | e2e/playwright.config.mjs (e2e); no unit config needed |
| Quick run command | `npm run test:privacy` / targeted `node --test test/mcp.test.mjs` |
| Full suite command | `npm test` (node --test --test-concurrency=2 test/*.test.mjs) + `npm run e2e` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PSET-02/03 | Team-perm storage survives stale non-manager PUT (pin regression) | unit | `node --test test/hardening.test.mjs` (or mergeClientDoc home file — planner locates) | ⚠️ extend existing |
| PSET-03 | `projectPermFor` gates write routes; view-only team member can't edit/comment | unit | targeted `node --test test/<write-routes-file>` | ❌ Wave 0 (new) |
| PSET-03 | Funnel/mirror parity incl. client `canSee` fixture + team-perm oracle cells | unit | `node --test test/mcp.test.mjs` (VISIBILITY_MODEL harness at :742-759) | ✅ extend |
| INVT-01/02/03 | Draft survives interaction; guest-one-project refused server-side on create/edit (+MCP) | e2e + unit | `npm run e2e` / `node --test test/mcp.test.mjs` | ❌ Wave 0 (new cells) |
| PSET-01/04 | Unified modal opens from both surfaces; concurrent-edit 409 honesty | e2e | `npm run e2e` | ❌ Wave 0 |
| PROJ-01/02 | Columns render; exactly one Share button | e2e | `npm run e2e` | ❌ Wave 0 |
| TEAM-01/02/03 | Searchable box keeps checked state; hint wording; no invite button | e2e | `npm run e2e` | ❌ Wave 0 |
| UX-01 | 0 dead / 0 stale keys; catalogue pin | gate | `npm run i18n:scan` | ✅ exists |

### Sampling Rate
- **Per task commit:** targeted test file + `npm run i18n:scan`
- **Per wave merge:** `npm test`
- **Phase gate:** full `npm test` + `npm run e2e` green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] New `projectPermFor` write-route test file (PSET-03)
- [ ] Oracle cells in test/helpers/visibility-fixture.mjs (team-perm-view-only, revoked, dangling team id)
- [ ] Pin-block regression test cell (team keys byte-identical)
- [ ] Guest validator unit tests (create/edit/accept/MCP)
- [ ] e2e specs: unified modal (both locales, per-field survival), projects table, team search

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | yes | One-funnel doctrine; `projectPermFor` server-side gate; `canManageProject` unchanged (D-01); pin block |
| V5 Input Validation | yes | `normalizeProjects` extension (team-key shape + PERMS whitelist); shared guest validator |
| V1 Authorization plumbing | yes | Lockstep mirrors (projectAccessReason, mcp.js, client canSee) — divergence IS the threat |
| V2/V3/V6 | no | No auth/session/crypto changes in this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stale non-manager PUT wipes team perms (mass revocation) | Tampering | Pin block covers `p.perms` whole + byte-identical regression test |
| MCP/UI permission window (mirror drift) | Elevation of privilege | One lockstep commit + MIRROR_MODEL oracle assertions |
| Client-only guest invariant → workspace-wide guest read | Elevation of privilege | Server validator on create/edit/accept + MCP; tests assert server refusal |
| Access-field disclosure in table tooltips | Information disclosure | T-52-03 coarse codes only, never rosters |
| Silent no-op save masking denied write | Repudiation | Client canManageProject gate matching server; honest 409 surfacing |

## Project Constraints (from AGENTS.md / standing invariants)

- Zero new runtime dependencies; zero migrations; full suite green every plan
- EN+FR i18n gate (server keys included); dead keys deleted in the removing commit; pins bumped same commit
- Funnel lockstep + client-mirror parity fixture for any plan touching access (53-01, 53-03)
- Byte-identical 404s (no existence oracle)
- SQLite+pg dual backend for migration tests
- Full-DOM render: every modal input needs `data-in` binding
- Server-authoritative access; keyed refusals ride 200s; optimistic client reverts

## Sources

### Primary (HIGH confidence — direct file reads this session)
- server.js:800-865 (canSeeProject, memberCanReadProject, projectAccessReason, canManageProject, hiddenFor — quoted verbatim)
- server.js:1080-1108 (mergeClientDoc pin block — quoted verbatim)
- mcp.js:176-197 (canReadProject hand-maintained mirror — quoted verbatim)
- src/overlays/modals.js:150-343 (projectModal, PERMS/PERM_KEYS/permLabel, shareModal, inviteModal, textarea without data-in at :312, scopePicker at :303-324 — quoted verbatim)
- src/actions/events.js:50-79 (input/change/submit dispatch, isChangeEl — quoted verbatim)
- src/features/teams.js:25-48 (members fieldset, `page.team.membersHint` hint site)
- src/pages/projects.js:50-79 (grid + table renderers, PSTAT filter)
- src/pages/project.js:68-82 (three Share affordances at :74-76 — quoted verbatim)
- src/pages/members.js:170-175 (team detail invite button)
- package.json (scripts, deps, engines)
- test/mcp.test.mjs:610-759 + test/helpers/visibility-fixture.mjs (oracle harness)
- src/core/store.js:345 region (client `canSee` mirror)
- .planning/config.json (no nyquist key → Validation Architecture included; security_enforcement absent → enabled)

### Secondary (HIGH — milestone research corpus, file:line-anchored 2026-11-09)
- .planning/research/ARCHITECTURE.md, PITFALLS.md, STACK.md, FEATURES.md, SUMMARY.md
- .planning/REQUIREMENTS.md, .planning/STATE.md, .planning/phases/53-member-project-experience/53-CONTEXT.md

### Tertiary (LOW — flagged for plan-time verification)
- MCP invite tool guest check (A2); invite-edit route exact location (A1)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero additions; verified from package.json
- Architecture: HIGH — all integration points read from source this session
- Pitfalls: HIGH — milestone pitfalls corpus anchored to file:line reads; carried forward with verification
- Open items: MEDIUM — A1/A2/A3 flagged for plan-time verification

**Research date:** 2026-11-09
**Valid until:** 2026-12-09 (stable in-repo patterns; no external surface)
