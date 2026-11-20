# Architecture Patterns: Entra Group Mapping & Governance Backlog (v3.2)

**Domain:** SSO-driven group→workspace/role/operator mapping on an existing hand-rolled Node server
**Researched:** 2026-11-20
**Mode:** Architecture integration research (codebase-verified; no external deps — claims-first design, zero new dependencies per PROJECT.md)

> All line numbers verified against HEAD at research time. server.js ≈ 9300+ lines, single module.

---

## Recommended Architecture

Claims-first, snapshot-at-login, fail-closed, zero dependencies. The `groups` claim is read
from the **already-verified ID token** in the SSO callback (server.js:5122–5131) — no Graph
API call, no token exchange, no scheduled reconcile. Group Object IDs are matched against
boot-frozen env mapping configuration exactly like the Phase 75/76 domain-door pattern.

```
ID token (RS256-verified, oidc.js) 
  └─ SSO callback server.js:5083–5334
       ├─ ① claims → sub/email (existing, :5131–5136)
       ├─ ② identity resolution: linking / JIT / DP-4 signup door (existing, :5138–5213)
       ├─ ③ NEW: groups claim extraction + mapping resolution (pure function)
       ├─ ④ NEW: membership reconcile — grant/promote/demote/remove w/ guards
       ├─ ⑤ invite reconciliation DP-5 (existing, :5215–5279)
       ├─ ⑥ 2FA challenge-then-stop (existing, :5281–5301)
       └─ ⑦ session mint + audit (existing, :5303–5328)
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `oidc.js` (unchanged) | Token verification — `verifyIdToken` already returns the full `claims` object | callback |
| NEW `groups.js` (server-side, sibling of `domains.js`) | Env parse of group→mapping triples; pure match functions `resolveWorkspaceMappings(groupIds, role?)`, `resolveOperatorGroup(groupIds)`; overage detection helper | callback, boot log |
| SSO callback block in `server.js` (modified ~:5131–5328) | Extract `claims.groups`, call the resolver, apply the reconcile | groups.js, db, audit |
| NEW reconcile helpers in `server.js` (or groups.js) | `reconcileGroupMemberships(row, groupIds)` — diff desired vs actual memberships; reuses `addMembership` (:4606) | db, membership guards |
| `users.is_instance_admin` (existing, D-112) | Operator identity — group mapping only ever SETS it to 1, never 0 | operator flag endpoints |
| Governance endpoints (existing Phase 79 family) | Workspace list/archive/delete/reassign; NEW rename/slug edit rides the existing `PUT /api/workspaces/:slug` (:7399) | client |
| `src/pages/governance.js` (modified) | Workspace settings editing UI (name/slug) added to the existing table | actions.js |
| `src/actions/actions.js` (modified) | `A.workspaceRename` action + optimistic doc revision handling | api.js |

---

## Decision 1: Where mapping config lives — env triples, NOT a DB table

**Recommendation: env triples mirroring the ALLOW_*_DOMAINS pattern.** e.g.
`ENTRA_GROUP_MAP` = `objectId=slug:role,objectId=slug:role,…` and
`ENTRA_OPERATOR_GROUP` = single objectId. Parsed once at boot by a new `groups.js`
module via a tri-state parse **adapted from `parseDomainList`** (domains.js:53).

**Why env, and why this is consistent with precedent:**

- **The tri-state precedent fits, the boolean gate doesn't.** D-78-1 collapsed
  `WORKSPACE_CREATION` to a boolean *because it had exactly two outcomes*. Group mapping
  has three observable states (unset = feature off; set-but-empty/garbage = deny-all-map
  fail-closed; set-valid = active) — that is precisely the Phase 75 tri-state shape:
  `unset → null` (feature off, unmapped users behave exactly as today), `set → Set/Map`
  even if empty. Reuse the strict-undefined comparison trick (domains.js:60 comment —
  "the unset/set-empty distinction is made by the caller's strict undefined comparison").
- **Snapshot-at-login semantics make env sufficient.** There is no periodic reconcile and
  no mid-session change: mapping only matters at login. The Phase 76 "boot-frozen door
  matrix — tightening takes effect on restart" rationale (domains.js:72–77) transfers
  verbatim: operators already accept restart-to-change-policy posture for the domain doors.
- **No admin UI for mapping = smaller blast radius.** A DB table + admin UI implies CRUD
  endpoints, existence-leak analysis, last-X guards on config, migrations, and 5-locale
  strings for every refusal — for a config surface the Phase 79 governance work just
  established operators *do* touch via env today (WORKSPACE_CREATION, domain lists).
- **GUID validation replaces DOMAIN_SHAPE:** entries must be exact Entra Object IDs
  (`/^[0-9a-f]{32}$|^[0-9a-f]{8}-[0-9a-f]{4}-…/i`, case-insensitive canonicalize) —
  warn-and-clean on invalid entries exactly like D-05, so a typo'd GUID can never
  silently create a dead door.
- **The overage case is the one thing env can't solve, and it doesn't need to:** when a
  user is in >200 groups Entra stops embedding `groups` and emits `_claim_names.groups`
  + `_claim_sources` pointing at a Graph endpoint. Claims-first design = **detect and
  refuse** (log + generic `sso=error`, or proceed as unmapped — ratify at discuss-phase;
  recommend proceed-as-unmapped, since blocking 200-group users from logging in at all
  would break logins that work today).

**Anti-recommendation (do not build this milestone):** DB `group_mappings` table +
governance-page CRUD. It reintroduces exactly the env-edit friction the milestone says it
wants to remove, but for a config that changes rarely; it also adds a second source of
truth beside the domain lists. If a UI is ever wanted, it can be added later without
changing the callback contract (resolver input = list of GUIDs, whatever produced it).

## Decision 2: Where group resolution slots in the callback

**Between identity resolution (②) and invite reconciliation (⑤) — after the `row` is
guaranteed, before the DP-5 filter.** Rationale:

- The reconcile needs a resolved `row` (user id) and the raw `claims`; both exist at :5213.
- **It must come AFTER the DP-4 signup door.** Group mapping grants *membership*, not
  account existence — a user outside `SIGNUP_DOMAINS` must not be JIT-provisioned because
  they're in a mapped group. One door, one rule (DOM-03): the groups mapping is a parallel
  admission concept beside the domain matrix (PROJECT.md explicitly states this); it never
  bypasses a door.
- **It must come BEFORE the "zero memberships" invite check** — otherwise a group-mapped
  user with a pending invite would get both a group membership and the invite auto-accept,
  or worse, the invite reconcile would skip because a group membership now exists. Order:
  groups reconcile first, then invite reconciliation sees a user who may already have
  memberships and correctly skips (the existing `select 1 from memberships` guard at :5223
  does the skipping for free). **Ratify the precedence at discuss-phase:** if both a group
  mapping and a pending invite target the same workspace, which role wins? Recommendation:
  invite wins (explicit human grant beats ambient group), i.e. run invite reconciliation
  FIRST, then group reconcile fills gaps — but the one-membership-query ordering must be
  explicit in the plan either way.
- **It must come BEFORE 2FA and session mint** (⑥⑦) so membership changes are committed
  before the session cookie exists — the login lands with correct access, no post-login
  refetch.

Fail-closed contract for the new block: any resolver/mapping error is caught inside the
existing try (:5105) and funnels to the generic `errorRedirect()` — group mapping failures
never produce a partial login. unmapped user + no mapping feature = byte-identical
behavior to today (the null-config path returns early, writes nothing).

## Decision 3: Removal-sync and guard composition

Removal-sync is a **diff at login**: desired memberships (from group map ∪ explicit
invites) vs actual `memberships` rows. Rules:

| Situation | Action | Guard |
|-----------|--------|-------|
| In mapped group, not a member | `addMembership(ws, user, mappedRole)` (:4606) | none needed |
| In mapped group, member with LOWER role | promote to mapped role | none (escalation is safe) |
| In mapped group, member with HIGHER role (manual owner/admin) | leave untouched — explicit grants beat group grants | — |
| NOT in mapped group, membership came from a group | demote to `member` or remove | **last-owner guard** (`needOwner` pattern, server.js:7473/7491: refuse if `ownerCount(ws) === 0` after removal) |
| NOT in any group, `is_instance_admin = 1` | **leave the flag** — groups can grant operator, never revoke (asymmetry is deliberate: demoting the last operator via a lost group membership would lock the instance out; flag removal stays a manual console action, D-78-2 break-glass) | last-operator guard unconditionally respected |

**Provenance tracking is the crux.** To demote/remove correctly you must know *why* a
membership exists. Two options:

- **Option A (recommended): provenance column** — `memberships.source` (`'invite'`,
  `'manual'`, `'group:<guid>'`), additive `adapterEnsureColumn` migration (server.js:695
  pattern, zero-dependency, byte-identical second boot). Removal-sync only touches rows
  whose source starts with `group:` and whose GUID is no longer satisfied. Manual/invite
  rows are immune — a group-removed user who was separately invited keeps the invite grant.
- **Option B: no provenance** — remove any membership whose workspace appears in the map
  but whose role ≤ mapped role and whose user isn't in the group. Simpler, but demotes
  invited members of mapped workspaces and cannot distinguish "invited by owner" from
  "granted by group". Reject: violates the existing-account immunity spirit (DOM-05).

**Guards compose naturally because they're all count-before-write:**
- workspace owner removal → `ownerCount(ws.id)` check before `delete from memberships`
  (identical to :7473). If the last owner's membership is group-derived and the group was
  lost, **refuse the removal and log loudly** — an instance operator fixes it via
  governance; the login still succeeds (never fail the login over a membership diff).
- instance operator flag → never touched by the sync (above), so the `lastOperator` count
  guard (:6815) is structurally unreachable from group logic. Document this as a decision:
  *group mapping grants `is_instance_admin`, it never clears it.*

## Data Flow (new paths only)

1. **Boot:** `groups.js` parses `ENTRA_GROUP_MAP` / `ENTRA_OPERATOR_GROUP` tri-state;
   boot log extends the D-11 door-matrix line (server.js:9296–9304) with a
   `groups: <n mappings>` segment (unset = `off`).
2. **Login:** verified `claims.groups` (array of GUID strings; tolerate a single string)
   → `resolveWorkspaceMappings(groupIds)` → `{slug: maxRole}` map + operator flag.
3. **Reconcile:** per mapped workspace — resolve slug→ws (missing workspace = skip + log,
   never 500); apply the Decision-3 table in one transactional pass.
4. **Audit:** `logSecurity(row.id, 'sso_group_grant')` / `sso_group_demote` /
   `sso_group_removed` — mirrors `sso_invite_accepted` (:5262). No group GUIDs in logs
   beyond what the mapping table itself contains (PII ban D-09 posture).
5. **Client:** no change to login flow; `/api/me` naturally reflects new memberships.

## New vs Modified Files

**New:**
- `groups.js` — parser, resolver, overage detector, shape validation (server-only, NOT
  under src/, same rule as oidc.js header comment :7–9)
- `test/groups-mapping.test.mjs` — parser tri-state matrix, resolver, callback reconcile
  via the existing mock-IdP harness (`OIDC_ISSUER_OVERRIDE`, test/oidc-sso.test.mjs)
- `test/groups-removal.test.mjs` — removal-sync + guard composition
- likely `test/workspace-rename.test.mjs` for the governance edit

**Modified:**
- `server.js` — SSO callback block (:5131–5213 region, insert between ② and ⑤);
  reconcile helpers near `addMembership` (:4606); boot log (:9296); `PUT
  /api/workspaces/:slug` gains slug-change validation (uniqueness + slug-shape —
  :7399 already writes name+slug, so this is validation + keyed refusals, not a new
  route); optional `memberships.source` migration (:695 pattern)
- `src/pages/governance.js` — workspace name/slug edit affordance in the table (Phase 79
  table exists; v3.1 deferral made explicit in PROJECT.md)
- `src/actions/actions.js` — rename action wired to existing PUT; i18n keys
- `src/locales/*.json` ×5 — refusal keys in the SAME commit as the emitting gate
  (standing constraint); key-count parity test auto-covers
- `DEPLOY.md` — new env vars documented alongside the domain doors
- `PROJECT.md`/`package.json` — 3.2.0 at ship

## Suggested Build Order (server-first waves, v3.1 pattern)

**Wave 1 — pure core, no UI (Phase A):** `groups.js` parser + resolver + tests; boot log
extension. No callback wiring yet — the module is inert. Establishes the tri-state matrix
and GUID shape validation as pure, fully-tested units.

**Wave 2 — grant path (Phase B):** callback wiring: groups extraction, workspace/role
grants, operator grant. Removal-sync explicitly OFF (grant-only). Includes migration for
`memberships.source` (must land before any removal logic can exist). Mock-IdP tests for
the full callback flow including overage detection.

**Wave 3 — removal-sync + guards (Phase C):** the Decision-3 diff table, last-owner
guard composition, immunity rules for manual/invite rows, audit verbs. Largest test
surface — every guard combination deserves a pin. Depends on Wave 2's provenance column.

**Wave 4 — governance rename/slug edit (Phase D, independent of A–C):** server
validation + keyed refusals on the existing PUT route, then client edit UI. **Can run in
parallel with Waves 2–3** — zero shared code with the callback; only the i18n key-count
gate is shared, so locale commits should be grouped per phase (v3.1 pattern: keys land in
the same commit as the first emitting gate).

**Wave 5 — client polish + backlog (Phase E):** governance page integration points,
56-02 e2e debt, Phase 57 mobile follow-up — only if the roadmap keeps them in v3.2
(PROJECT.md lists them; they are independent of groups entirely and can be split out).

**Dependency note:** Wave 1 → 2 → 3 is strictly sequential (module → wiring → diff
logic needs provenance). Wave 4 is fully parallel. If phases are cut along these waves,
Phase B+D can start in the same milestone concurrently; plan numbering should follow
dependency, not feature grouping.

## Patterns to Follow

### Pattern 1: Tri-state env parse with boot-frozen consts
**What:** exactly the `parseDomainList` shape — pure function, `undefined → null`,
caller makes the unset/set distinction via strict comparison, `?? ` inheritance where a
derived default makes sense (e.g. operator group could default to unset, no inheritance).
**When:** every new env var in this milestone.

### Pattern 2: Door matrix boot log extension
**What:** append groups to the D-11 combined log (server.js:9304) rather than a separate
line — one place to read the whole admission posture at boot.

### Pattern 3: Callback-local fail-closed error funnel
**What:** new logic lives inside the existing `try` (:5105) and returns `errorRedirect()`
on any anomaly; never throws past the boundary; never adds a new redirect param
(no-oracle rule, DP-4 rationale :5173–5179).

### Pattern 4: Count-before-write guards
**What:** `ownerCount` / operator-count checks BEFORE the UPDATE (the :6811–6822
lastOperator comment is the canonical form) — never count after.

## Anti-Patterns to Avoid

- **Graph API in the callback.** Even for overage, don't call Graph — the whole
  claims-first design and the zero-dependency invariant (pinned by
  test/dependencies.test.mjs) forbid it. Overage = detect + treat-as-unmapped.
- **Reconciling outside login.** No scheduler, no mid-session demotion — sessions minted
  before a group change stay valid until expiry (snapshot semantics, PROJECT.md).
  This matches the v3.0 existing-account immunity philosophy.
- **Groups bypassing DP-4.** Group membership must never JIT-provision a user the signup
  domain door would refuse — resolve groups only after the row exists.
- **A slug edit that breaks links silently.** Slug rename must validate uniqueness and
  shape (reuse createWorkspace slug derivation, :3533) and update in the same keyed-refusal
  style; old slugs 404 (existing no-oracle behavior is acceptable — document it).

## Scalability Considerations

| Concern | Now (single instance) | If it ever grows |
|---------|----------------------|------------------|
| Mapping size | tens of `k=v` triples in env | fine to ~100 mappings; beyond that, revisit DB table (deliberately deferred) |
| Reconcile cost | O(mapped workspaces) SELECTs per SSO login | negligible at SQLite/pg scale for one login |
| >200-group users | overage → unmapped | only path forward would be Graph — out of scope by design |

## Sources

- Codebase-verified (HIGH confidence): server.js :4606, :5100–5334, :6811–6822, :695,
  :7399, :7473, :9296–9304; domains.js :53–90; oidc.js full read; PROJECT.md v3.2
  section; v3.1-ROADMAP.md phase structure.
- Entra groups claim / overage behavior (MEDIUM — from model knowledge, standard
  documented Microsoft behavior; recommend a docs check at Phase A plan time):
  `_claim_names`/`_claim_sources` overage shape, `groups` claim as GUID array when
  `Group membership claims` is configured on the app registration (operators must set
  this in Azure — a DEPLOY.md prerequisite note, no code).
