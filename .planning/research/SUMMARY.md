# Project Research Summary

**Project:** gr8r / Projects Studio — Milestone v2.1 Member & Project Experience
**Domain:** Project-management workspace UI/UX (modals, pickers, permission surfaces, table columns) on a security-hardened vanilla-stack codebase
**Researched:** 2026-11-09
**Confidence:** HIGH (code-verified file:line anchors across all four research documents)

## Executive Summary

v2.1 is a UI refactor/polish batch on top of a v2.0 permission system whose defining trait is a **single, hand-guarded visibility funnel** (`canSeeProject` / `memberCanReadProject`, server.js:800-865) with five+ consumers and a hand-maintained MCP mirror. The research conclusion is unusually clean: **zero new stack dependencies** (STACK.md verdict), every feature reuses proven in-repo patterns (`data-in` silent state binding, `foldForSearch`, immediate-action share controls, chip pickers), and the only genuinely new server surface is **per-team permission tiers** (M-09) — which is also where nearly all the risk lives.

The recommended approach has one hard ordering: **server perm semantics before UI**. Per-team perms must (a) live as namespaced keys inside the existing `p.perms` object (`p.perms['team:'+teamId]`) — not a new field — so every existing sink (merge pin block, removal sweep, normalize) works unchanged; (b) keep `canSeeProject` a boolean visibility predicate and tier *capabilities* via a new `projectPermFor` helper applied in write routes; and (c) ship in one lockstep commit across the funnel + `projectAccessReason` + the mcp.js mirror. The rest — invite-draft fix, projects chips, guest-one-project clamp, searchable members box, unified settings modal, table columns, Share-button dedup — is LOW/MEDIUM render work consuming already-shipped data (`p.lead`, `p.teams`, `progressOf`, PSTAT).

The key risk is **funnel/mirror divergence**: the pinned-test doctrine ("never edit the funnel") can push implementers toward building a second predicate beside the funnel — the exact anti-pattern the one-funnel doctrine forbids. This is no longer hypothetical: **on the day of research (commit 09a9c41, 2026-11-09) the client `canSee` in src/core/store.js lacked the live-team term the server funnel had, so team-granted projects rendered in lists but 404'd on open** — a production bug, same failure class as the Phase 50 `remindable()` miss. Every phase that touches access must treat client-mirror parity as an empirical, tested concern, not an assumption.

## Key Findings

### Recommended Stack

**Verdict: ZERO additions.** No runtime deps, no dev deps, no build-config change (PROJECT.md:152 zero-dep constraint holds untouched). Installation step: nothing.

**Core technologies (all existing):**
- Vanilla ES modules + Vite ^6.4.4 — every feature is DOM templating + event wiring already done everywhere
- Hand-made `t()` i18n — ~20-40 new EN+FR keys; `scripts/i18n-scan.mjs` prebuild gate enforces parity
- `data-a` action pinning — new rows/buttons keep e2e and delegation stable
- `node:sqlite`/`pg` adapter — only data change is a doc-field extension (`p.perms` team keys); **zero migrations**

**Do NOT add** (hard): UI framework, component library, state-management lib, search/autocomplete lib, i18n framework, date-picker lib, new tooling — each measured as larger than the in-repo pattern it would replace.

### Expected Features

**Must have (table stakes — P1):**
- Invite modal: `data-in` draft-persistence fix + projects chips + guest = exactly one project (enforced server-side too)
- Unified project settings modal (General + Access) — the keystone; absorbs projectModal + shareModal (M-12)
- Single labeled Share button; user+ icon and avatar-stack duplicates removed (M-13)
- Per-team permission dropdowns (view/comment/edit/full ladder — same ladder as per-person, M-09)

**Should have (P2):**
- Searchable members box in Edit Team (reuse `foldForSearch`) + multi-team plural wording
- Projects table columns: Lead / Teams (chips +N overflow) / Members count (+tooltip, not avatar stack) / Status pill + progress bar / Target date

**Defer (v1.x / v2+):** live-roster hint in Access tab; searchable pattern rolled into other pickers; past-due red emphasis; per-project member drawer; General-Access granularity beyond private/public; column show/hide + saved views.

**Anti-features to reject:** avatar stacks in the table; a second "Share…" quick-action; binary team perms (splits the mental model); inline member management in table rows; spray-searching every picker at once; per-project perms editable at invite time.

### Architecture Approach

The architecture makes this milestone cheap **if** the per-team perms decision is followed: namespaced keys inside `p.perms` (flat `p.perms['team:'+tid]`) require zero changes to mergeClientDoc (:1094 restores it wholesale), normalizeProjects (:899 accepts any object), and the removal sweep (:1948-1958). The one genuine server change: a new `projectPermFor(p, memberId, memberTeams)` helper that resolves effective perm (member entry > best linked-team entry; defaults mirroring modals.js:275), applied to **write routes** — visibility stays boolean. Build order: server perms helper + write gating + funnel/mirror/reason lockstep **before** the settings modal ships team-perm pickers, otherwise the UI writes values nothing enforces.

**Major components:**
1. **Server perm layer** (server.js ~:800-900) — `projectPermFor`, team-key validation in normalize, write-route gating; lockstep with `projectAccessReason` (:828) and mcp.js `canReadProject` (:183)
2. **Unified settings modal** (modals.js) — merges projectModal (form+submit) + shareModal (immediate-action controls); net code *reduction*; `IN.teamPerm` mirrors `IN.sharePerm`
3. **Invite modal** (modals.js:312 + actions.js) — `data-in="inviteDraft"` + `IN.inviteDraft`; projects chips ride the already-wired `S.ui.inviteScope` payload; guest clamp needs a server-side role check at server.js:5196+
4. **Render-only surfaces** — projects.js table columns, project.js:74-76 button cleanup, teams.js search box; all consume existing data

**Patterns to follow:** `data-in` silent binding (mutate `S.ui`, no render in handler); immediate-action controls for access edits; manager-guarded pin block protection inherited free by living inside `p.perms`.

**Anti-patterns:** a new `p.teamPerms` top-level field (three changed sinks instead of zero); tiered visibility inside `canSeeProject` (forks a 10+-call-site predicate); a second predicate beside the funnel.

### Critical Pitfalls

1. **Funnel/mirror divergence (CRITICAL — now empirically proven).** Per-team perms must become a term *inside* the funnel, edited in place, in one lockstep commit across server funnel + `projectAccessReason` + mcp.js mirror — never a parallel helper. Extend the `VISIBILITY_MODEL` oracle (anti-tautology, test/helpers/visibility-fixture.mjs:5-8) with team-perm cells. **Live validation: commit 09a9c41 (2026-11-09) fixed exactly this bug class — client `canSee` lacked the live-team term; team-granted projects listed but 404'd.** A fifth consumer now exists: the client store mirror. Client-mirror parity must be a tested fixture cell, not "true by construction."
2. **Pin-block omission silently mass-revokes.** Any new access field must join the `mergeClientDoc` pin block (server.js:1090-1101) in its introduction commit, with a stale-PUT regression test (T-50-01 pattern). Living inside `p.perms` avoids this entirely — a strong argument for the namespaced-key design.
3. **Unified modal stale-doc writes.** One PUT now carries General (lead-editable) + Access (manager-only) fields. Modal must mutate live store state (never a frozen open-time copy), adopt revisions, and gate the Access section client-side with the *shared* `canManageProject` — else non-managers see silent no-op saves and concurrent admins silently revert each other.
4. **Full re-render wiping unsaved input at scale.** The invite-draft bug will be reintroduced by the unified modal unless *every* keystroke-able field gets a `data-in` binding as a plan-level checklist item; dynamic per-team rows key state by team id; per-field survives-interaction e2e in both locales.
5. **Guest invariant enforced client-side only.** Behavior-only by design (D-50-11), so every new write path must re-derive it: one shared server validator across invite create/edit/accept + MCP tool; decide the zero-projects-guest lifecycle this milestone.

Moderate: i18n dead keys from removed modals (prune in-phase, narrow allowlist entries only, deliberate catalogue-pin bump); `data-a` pin drift during modal consolidation (reuse `submitProject` where semantics match); table columns leaking access data (coarse reason codes only, no rosters/perm levels in tooltips — T-52-03 doctrine).

## Implications for Roadmap

Based on research, suggested phase structure (5 phases):

### Phase 1: Per-Team Perms — Server Model
**Rationale:** The only genuinely new server surface and the keystone everything else writes through; shipping UI first would create pickers that write values nothing enforces.
**Delivers:** `projectPermFor` helper; team-key normalization + validation in `normalizeProjects`; write-route gating for comment/edit; read/write semantics decided with owner (team "Full access" ≠ `canManageProject` unless ruled otherwise).
**Addresses:** M-09 server half.
**Avoids:** Pitfalls 1, 2, 9 — funnel edit in place, lockstep with `projectAccessReason` + mcp.js mirror + client `canSee` store mirror (all in one commit), `VISIBILITY_MODEL` oracle cells, pinned tests extended in-phase.

### Phase 2: Invite Modal — Draft Persistence, Projects Chips, Guest Clamp
**Rationale:** Independent, small, zero dependency on Phase 1's server model; fixes the headline UX bug and the guest invariant while it's cheap.
**Delivers:** `data-in="inviteDraft"` + `IN.inviteDraft`; projects chips on existing `S.ui.inviteScope` payload; guest = exactly one project enforced server-side (role-based check at server.js:5196+) + client single-select degradation; shared server validator across create/edit/accept/MCP.
**Addresses:** M-01-adjacent invite UX, guest invariant.
**Avoids:** Pitfalls 4, 5.

### Phase 3: Unified Project Settings Modal (General + Access)
**Rationale:** The keystone; depends on Phase 1's server perm model (team-perm dropdowns need something enforcing them). Net code reduction — two modals deleted, one ~300-line renderer replaces them.
**Delivers:** Single `settings` modal with General (form+submit) and Access (immediate-action, incl. `IN.teamPerm` team dropdowns); dispatcher/entry-point retargets; live store-state mutation + revision adoption; dead i18n keys pruned in-phase.
**Addresses:** M-12, M-09 UI half.
**Avoids:** Pitfalls 2 (re-verify Phase 1's pin), 3, 4, 6, 7 — the stale-doc write matrix {manager, lead, team-edit-member, member, guest} × {open, edit general, edit access, save} and the concurrent-edit UAT scenario are this phase's core tests.

### Phase 4: Projects Table Columns + Share Button Dedup
**Rationale:** Pure render work on existing data; naturally pairs with the modal (Share button opens its Access tab) and shares the i18n-prune concern.
**Delivers:** Lead / Teams chips (+N) / Members count + tooltip / Status pill + progress bar (hidden when no tasks) / Target date columns; project.js:74-76 duplicate affordances removed.
**Addresses:** M-10, M-11, M-13.
**Avoids:** Pitfalls 6 (shared strings), 8 (disclosure doctrine — coarse codes only), 10 (explicit PSTAT key map).

### Phase 5: Searchable Members Box + Wording Polish
**Rationale:** Fully independent, lowest risk; a clean close-out phase and a proving ground for the `foldForSearch` pattern before it spreads to other pickers in v1.x.
**Delivers:** `foldForSearch`-based search in teamModal members fieldset (`S.ui.teamMembersQ`); multi-team plural wording fix (EN+FR).
**Addresses:** remaining P2 items.
**Avoids:** Pitfall 4 (same survives-interaction e2e applied).

### Phase Ordering Rationale

- **1 → 3 is a hard dependency** (server-before-client): the team-perm UI is meaningless without enforcement, and Pitfall 1's lockstep commit must precede any surface that writes team keys.
- **2 is independent** of 1 and 3 — slot early for quick value; its server clamp is 30 lines.
- **4 and 5 are independent and parallelizable**; 4 pairs with 3 (Share button targets the new modal, shared i18n cleanup), so it follows 3.
- Architecture research's own build order (ARCHITECTURE.md "Recommended build order") maps 1:1 onto this phase structure: 1→2→3→(5,6) with 2,5,6 parallelizable.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 (per-team perms server):** the read/write semantics decision (does team "Full access" grant `canManageProject`?) is an explicit owner ruling, not an implementation choice; also verify how `createInvites` flattens `scope.projects` into the POST body, and confirm the MCP invite tool's guest ceiling coverage.
- **Phase 3 (unified modal):** plan-level checklist of every `data-in` binding before interaction code; concurrent-edit/stale-PUT test matrix needs explicit design.

Phases with standard patterns (skip research-phase):
- **Phase 2 (invite modal):** every wire point mapped to file:line; the fix is 2 bindings + 1 server check.
- **Phase 4 (table columns):** all cell renderers exist elsewhere in the repo; column-insert + label tweak.
- **Phase 5 (search box):** copy an existing pattern used in 4+ surfaces.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero-addition verdict from direct repo reads (package.json, every cited helper verified at file:line) |
| Features | HIGH | Established multi-year-stable competitor conventions (Asana/Linear/Notion/Monday/ClickUp); only soft spot: web search partially degraded, competitor rows rest on long-stable documented behavior rather than fresh captures |
| Architecture | HIGH | Direct code reads of server.js, modals.js, actions.js, events.js, pages/, mcp.js; every claim anchored; build order derived from concrete dependency analysis |
| Pitfalls | HIGH | All anchored to live file:line reads plus v2.0 phase artifacts; **Pitfall 1's failure mode has now been empirically validated in production (commit 09a9c41, 2026-11-09)** — client `canSee` store mirror diverged from the server funnel; team-granted projects rendered in lists but 404'd on open |

**Overall confidence:** HIGH — unusually so, because v2.1 builds on a codebase the research read line-by-line, and its central risk already materialized once and was fixed the same day.

### Gaps to Address

- **Read-vs-write semantics for team "Full access"**: owner decision required in Phase 1 planning before any code (does it ever grant access-list editing? default: no).
- **Invite payload shape**: server reads flat `body.project`, client sends `scope.projects[]` — read `createInvites` in src/core/api.js during Phase 2 planning to pick where the "exactly one" clamp lives.
- **Client-mirror parity testing**: commit 09a9c41 proves the client `canSee` (src/core/store.js) is a real funnel consumer that can drift. Add it to the `VISIBILITY_MODEL` oracle fixture set and to the lockstep-commit rule alongside server.js and mcp.js.
- **Zero-projects-guest lifecycle**: reachable via the new picker's un-select UX; define behavior (downgrade? inert invite?) in Phase 2/3.
- **MCP invite-tool guest coverage**: flagged as "verify at plan time" — confirm the MCP tool routes through the shared validator.
- **Catalogue size pin**: the 1711-key pin needs a deliberate, documented bump when modals are merged.

## Sources

### Primary (HIGH confidence)
- Direct repo inspection this session: server.js (800-865, 1041-1159, 1935-1963, 5185-5314, :2850-2894), mcp.js (176-218), src/overlays/modals.js (41-344), src/actions/actions.js (1736-2050), src/actions/events.js (40-79), src/pages/{projects,project,overview,home,settings}.js, src/features/teams.js, src/core/{utils,store,constants}.js, scripts/i18n-scan.mjs
- `.planning/PROJECT.md` — v2.1 targets, M-09..M-13 decisions (owner-validated 2026-11-09), standing constraints (:152, :183, :317-324, :364-367)
- v2.0 phase artifacts: 50-REVIEW.md (remindable() parity failure), 52-PATTERNS.md:93 (funnel pin doctrine), 52-REVIEW.md (`?? 'member'` masking), test/helpers/visibility-fixture.mjs (anti-tautology contract), RETROSPECTIVE.md:256
- **Live validation:** commit 09a9c41 (2026-11-09) — client canSee funnel divergence, production bug fixed same day

### Secondary (MEDIUM confidence)
- Linear docs (linear.app/docs/members-roles), verified 2026-11-09
- Asana / Notion / Monday / ClickUp conventions from long-stable documented behavior (search partially degraded during research; see FEATURES.md Sources)

### Tertiary (LOW confidence)
- None material; the only forward-looking unverified item (MCP invite-tool guest check) is flagged for plan-time verification, not asserted

---
*Research completed: 2026-11-09*
*Ready for roadmap: yes*
