# Phase 82: Removal Sync + Guards + Audit — Research

**Researched:** 2026-11-20
**Domain:** SSO group-driven membership reconcile (delete/downgrade/upgrade/no-op) inside the OIDC callback, with count-before-write owner guard and audit trail
**Confidence:** HIGH (all code anchors read live this session; Phase 81 verified 5/5)

## Summary

Phase 82 converts the Phase 81 grant-only block (server.js:5246–5311, live-verified) into a single reconcile pass per D-82-10. Everything needed already exists: the provenance column (`memberships.provenance`, stamped at 8 writer sites), the callback corridor with fail-closed try, the `resolve()` highest-role-wins resolver, the `ownerCount()` count-before-write helper (server.js:3409), and the owner-removal guard template (server.js:7627/:7644 — drifted from the :7473 pre-drift figure). The reconcile is a per-workspace diff over the union of (mapped-workspace targets) × (existing rows), gated by one predicate: `provenance like 'group:%'`.

The single load-bearing implementation decision the planner must make is **how D-82-7 changes the on-conflict clause without breaking Phase 81's Pin C**. A literal `provenance = excluded.provenance` in `addMembership` (server.js:4660–4662) would let the DP-5 invite auto-accept clobber a group row's provenance — test/groups-sso.test.mjs:105–125 explicitly pins `provenance stays group:<guid>` when a group-mapped user auto-accepts an invite. The fix is a conditional SET (recommended, below) or routing group writes through a dedicated update. This must be decided in the plan, not discovered by the executor.

**Primary recommendation:** One reconcile loop inside the existing grant block's `else` branch (post-identity, pre-DP-5), per-workspace: fetch existing row, compute mapped role via `resolve()`, apply exactly one delta (delete / downgrade / upgrade / no-op), owner-guard every delete count-before-write inside the same pass, audit every delta as `group_<delta>:group:<guid>:<reason>` in `audit_log` (same tx as the write).

<user_constraints>
## User Constraints (from CONTEXT.md — verbatim copy of locked decisions)

### D-82-7: Provenance follows role (amends D-81-7)
When a group drives ANY role change on a membership row (Phase 81's upgrade, Phase 82's downgrade), the row's provenance updates to `group:<guid>`. The on-conflict clause in addMembership (and the reconcile's downgrade path) now sets `provenance = excluded.provenance` — group logic owns the role it set. Rows groups never touched keep their creation origin and stay immune to downgrade forever. Deliberate amendment of D-81-7; update the Phase 81 comment at the on-conflict site; the Phase 81 pin asserting provenance-preservation on upgrade changes for the GROUP writer only (manual/invite writers keep preserving origin).

### D-82-8: Owner guard only — operator flag structurally out of scope
Removal-sync never touches `is_instance_admin` (D-82-3: grant-only, no code path clears it). SC2's "last operator" clause is satisfied vacuously: the lastOperator guard (now :6909, pre-drift :6841) is unreachable from group logic. The guard funnel protects WORKSPACE OWNERS only (ownerCount before delete, mirroring the removal route). Document the unreachable-guard reasoning in the plan; no defensive operator check, no operator sync.

### D-82-9: Audit GUID+reason via encoded action string
Zero schema change: group-driven deltas land in `audit_log` with the GUID and reason encoded in the action string — format `group_<delta>:group:<guid>:<reason>` (split on first colon for Phase 83 rendering). Existing `operator_promoted` row shape unchanged. `logSecurity` verbs stay verb-only heartbeats — NOT the delta trail. Reason vocabulary (fixed, grep-able): `lost-claim`, `mapped-lower`, `guard-refused`, `dead-workspace`, `archived-workspace`.

### D-82-10: One reconcile pass (never delete-then-reinsert)
Single reconcile INSIDE the existing corridor (after identity resolution, before DP-5). Per workspace with a group-derived row (or pending grant): compute mapped role (highest-role-wins via resolve(); none = no mapping); apply ONE delta in place: delete (no mapping + row group-derived) / downgrade (mapped < current + current group-derived) / upgrade (mapped > current) / no-op. Owner guard runs count-before-write inside the same pass BEFORE the delete: refusal → skip + logWarn loudly + audit `guard-refused` row — login still succeeds (GS-02 skip-and-audit). Overage/unmapped = whole pass skipped: no grants AND no removals (SC5 / D-82-4). Byte-identical regression surface: no group-derived rows and no pending grants → zero writes, zero audit rows beyond sso_login.

### the agent's Discretion
- Exact reconcile helper shape (extend grant helper vs sibling) — single pass mandatory, structure free.
- Exact encoded-action spellings within the D-82-9 format.
- Guard refusal log wording (logWarn, loud, never fatal).
- Test file placement (extend test/groups-sso.test.mjs — the reconcile suite lives there).
- Whether the delete path bypasses addMembership (insert facade) and uses a direct guarded delete — likely yes; keep the tx boundary.

### Deferred (OUT OF SCOPE)
- Mapping editor UI + dead-mapping console section — Phase 83 (GV-01..03)
- `label` XSS escape at first render — Phase 83
- Graph overage fallback recipe — DEPLOY.md, Phase 84
- Any operator-flag clearing — permanently out of scope (D-82-3)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GS-01 | User no longer in any mapped group loses only group-derived (`group:<guid>`) membership; invite/manual immune | Provenance predicate `provenance like 'group:%'` on the delete filter; NULL/manual/invite rows never selected (server.js:387 provenance column, 8 stamped writers) |
| GS-02 | Owner/last-operator removal refused by shared count-before-write guard funnel, logged loudly, audit-recorded, login still succeeds | `ownerCount()` helper :3409; route template :7627/:7644; skip+logWarn+audit, login proceeds — structurally the reconcile's `continue` after refusal |
| GS-03 | Downgrade only when mapped role < current grant AND current grant is group-derived; manual/invite never downgraded | Same predicate as GS-01; compare via `ROLE_RANK_WITH_VIEWER` (:5264, viewer ranks 0) |
| GS-04 | Every group-driven change audit-logged with group GUID and reason | `audit_log` insert shape (:5299–5302 precedent), encoded action per D-82-9, same db.tx as the write (AUD-01) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Removal/downgrade/upgrade reconcile | API/Backend (server.js OIDC callback) | — | Runs at login inside the callback corridor; no client involvement |
| Owner count-before-write guard | API/Backend | — | Shared `ownerCount()` helper, same tier as the routes it mirrors |
| Audit trail (delta rows) | Database/Storage | API/Backend | `audit_log` rows written in same db.tx as each delta (AUD-01) |
| Guard refusal surfacing | Database/Storage | — (Phase 83 console renders) | Row + logWarn this phase; Phase 83 renders |
| Mapping resolution | API/Backend (groups.js `resolve()`) | — | Phase 80 contract, consumed unchanged |

## Standard Stack

No new packages. This phase is pure server.js + test changes.

### Core (existing, reuse)
| Asset | Location (live-verified) | Purpose |
|---------|---------|---------|
| Grant block → becomes reconcile | server.js:5246–5311 | The corridor slice this phase converts |
| `addMembership` + on-conflict | server.js:4637–4664 | Insert/upgrade facade; clause at :4662 changes per D-82-7 |
| `ROLE_RANK_WITH_VIEWER` | server.js:5264 | `{ owner: 3, admin: 2, member: 1, viewer: 0 }` — compare map, callback-local |
| `resolve(claimGroups, mappings)` | groups.js:122 | Highest-role-wins; returns `{ grants, operatorFlag }` |
| `resolveGroupsClaim(claims)` | groups.js:85 | Four-outcome detector; `_claim_names` → unmapped/overage (groups.js:87) |
| `ownerCount(workspaceId, excludeUserId)` | server.js:3409–3411 | `select count(*) ... role='owner' and user_id is not ?` |
| Owner-removal guard template | server.js:7627, :7644 (member DELETE/PATCH routes) | `if (row.role === 'owner' && (await ownerCount(...)) === 0) refuse` |
| Last-operator guard | server.js:6909 | Console route only — unreachable from group logic (D-82-8) |
| `audit_log` insert shape | server.js:5299–5302 (operator_promoted precedent) | 12-column row, actor=target=self for self-driven deltas |
| `logSecurity(userId, verb)` | server.js:4961–4963 | Inserts into `security_log` — verb-only heartbeats, NOT the delta trail |
| Overage branch | server.js:5252–5257 | `claimState.state === 'unmapped'` skips the whole else-branch |

**Installation:** none.

## Package Legitimacy Audit

No external packages installed this phase — audit not applicable (node:test + existing harness only).

## Architecture Patterns

### System Architecture Diagram

```
OIDC callback (existing try, D-81-11 fail closed)
  │
  ├─ DP-4 identity resolution (unchanged)
  │
  ├─ resolveGroupsClaim(claims)  ── state === 'unmapped'?
  │        │                            │
  │        │ yes (incl. overage)       │ yes → skip ENTIRE block (grants AND removals)
  │        │                            │      overage: ONE fixed logWarn (D-81-10)
  │        ▼ no                        ▼
  │   resolve(groups, mappings) → { grants, operatorFlag }
  │        │
  │        ▼
  │   RECONCILE PASS (per workspace, D-82-10):
  │     ws targets = union(mapped targets ∪ workspaces holding user's group-derived rows)
  │     for each ws:
  │       ws dead/archived? → skip + logWarn + audit (reason dead-workspace/archived-workspace)
  │       existing row? ── no → grant (Phase 81 path, addMembership, provenance group:<guid>)
  │       │                  mapped > existing? → upgrade (provenance → group:<guid>, D-82-7)
  │       │                  mapped < existing?
  │       │                     ├─ existing group-derived → DOWNGRADE (addMembership, mapped-lower)
  │       │                     └─ manual/invite/NULL → NO-OP (immune)
  │       │                  mapped == existing → no-op (zero writes)
  │       └─ no mapping for this ws?
  │                            └─ existing group-derived → DELETE:
  │                                 ownerCount(ws, user) === 0?
  │                                   ├─ yes → SKIP + logWarn loud + audit guard-refused; login continues
  │                                   └─ no  → guarded delete (tx: memberships + team_members + doc stripMember)
  │                                            + audit (lost-claim)
  │        │
  │        ▼ operator flag grant (Phase 81 tx, unchanged — never revokes, D-82-8)
  │
  ├─ DP-5 invite reconcile (provenance-filtered guard :5315, unchanged)
  └─ 2FA → session mint (grants/removals commit before session exists)
```

### The reconcile diff table (Question 2 — every cell enumerated)

`mapped` = highest resolved role for this workspace (absent = no mapping). `existing` = current row. All comparisons via `ROLE_RANK_WITH_VIEWER` (owner 3 > admin 2 > member 1 > viewer 0).

| # | mapped | existing role | existing provenance | Delta | Write | Audit |
|---|--------|---------------|---------------------|-------|-------|-------|
| 1 | none | any | any | — (no mapping → check delete rule below) | | |
| 2 | none | any | `group:<guid>` | **DELETE** | guarded delete | `group_membership_removed:group:<guid>:lost-claim` |
| 3 | none | any | manual/invite/NULL | no-op (immune, GS-01) | none | none |
| 4 | R | none | — | grant | addMembership(`group:<guid>`) | `sso_group_grant` (Phase 81 verb) + delta row per GS-04 if desired* |
| 5 | R > existing | any incl. viewer | any | **UPGRADE** | addMembership | `sso_group_role_change` + provenance → `group:<guid>` (D-82-7 amendment) |
| 6 | R == existing | any | any | no-op | none | none (D-81-5) |
| 7 | R < existing | any | `group:<guid>` | **DOWNGRADE** | addMembership(R, `group:<guid>`) | `group_role_downgraded:group:<guid>:mapped-lower` |
| 8 | R < existing | any | manual/invite/NULL | no-op (immune, GS-03) | none | none |
| 9 | R (any) | — | ws dead/archived | skip | none | skip row with `dead-workspace` / `archived-workspace` reason |
| 10 | delete path | owner, ownerCount==0 | `group:<guid>` | **GUARD REFUSAL** | none | `...:guard-refused` row + loud logWarn; login proceeds |

\* D-82-9 says "grants" are audit-logged per GS-04 ("grants, role changes, removals, skips"). Phase 81 logged fresh grants as `logSecurity('sso_group_grant')` only. Planner should decide: either add an encoded `audit_log` delta row for new grants too (GS-04 literal reading) or treat the Phase 81 verb as the grant record and add a D-81 note. GS-04 text favors adding the delta row for grants as well — confirm in plan.

**Viewer rank 0 confirmation (Question 2 tail):** mappings can never map TO viewer (Phase 80 3-token CHECK), so `mapped < viewer` is impossible — cell "mapped lower than viewer" cannot occur. Viewer only ever appears as an existing rank (cell 5: any mapped role upgrades it).

**Mapped-to-none cells (1–3):** the delete rule needs the GUID of the mapping that created the row. `provenance = 'group:<guid>'` carries it — parse the GUID out of the provenance value itself (`substring after 'group:'`); do NOT rely on a still-live mapping row (the mapping may have been deleted since).

### Pattern 1: Conditional provenance SET (the D-82-7 / Pin C tension — DECIDE IN PLAN)

**What:** D-82-7 says the on-conflict clause sets `provenance = excluded.provenance`. But a literal global change makes the DP-5 invite auto-accept clobber group provenance: the auto-accept calls `addMembership(..., 'invite')` and test/groups-sso.test.mjs:105–125 (Pin C) asserts `provenance stays group:<guid>` in exactly that collision. It would also break the Phase 81 viewer-upgrade pin (test/groups-sso.test.mjs:379–401 asserts provenance stays `invite`).

**Recommended:** conditional SET in the on-conflict clause (server.js:4662) — group provenance is the only value that overwrites:

```sql
on conflict(workspace_id, user_id) do update set
  role = excluded.role,
  member_id = excluded.member_id,
  provenance = case when excluded.provenance like 'group:%'
                    then excluded.provenance
                    else memberships.provenance end
```

This satisfies D-82-7 exactly ("provenance follows role when a GROUP drives the change"; manual/invite writers keep preserving origin — their `excluded.provenance` is not group-shaped) and keeps Pin C green. Alternative (also compliant): leave the clause untouched and have the group writer do a direct `update memberships set role=?, provenance=?` for upgrades/downgrades instead of `addMembership` — but that forks the insert facade; the conditional clause is smaller. Either way the Phase 81 comment at :5282–5283 ("provenance keeps the row's ORIGINAL creation origin") must be rewritten, and the Phase 81 pin at :379–401 changes expectation: with the conditional clause, the viewer row upgraded BY A GROUP now ends with `provenance = 'group:<guid>'`. `[VERIFIED: server.js:4660–4663, test/groups-sso.test.mjs:105–125, 379–401]`

**When to use:** mandatory — this is the GS-01/GS-03 selection-key mechanism.

### Pattern 2: Guarded delete mirrors the route tx shape (Question 3)

The member-DELETE route (:7627–7633) does, inside one `db.tx`: `delete from memberships where workspace_id = ? and user_id = ?` → `delete from team_members where workspace_id = ? and user_id = ?` → `updateDoc(stripMember(doc, member_id, user.id))`. The reconcile delete should mirror this shape (consistency: a group-removed member must look identical to a route-removed member — no orphaned team authority rows, no stale doc profile). The reconcile must therefore select `role, member_id, provenance` from the existing row (not just `role` as Phase 81 does at :5277). Audit row joins the same tx (AUD-01 discipline, :5297–5303 precedent). `ownerCount` runs BEFORE the tx (count-before-write — mirrors :7627, which also checks before its tx).

**FK/cascade facts (Question 3):** `[VERIFIED: server.js:381–389, db-adapter.mjs:860]` — memberships PK is `(workspace_id, user_id)`; FKs `references workspaces(id) on delete cascade` and `references users(id) on delete cascade`; `pragma foreign_keys = on` in the SQLite adapter. audit_log (server.js:438–446) has no FK columns — no cascade surprises. A direct guarded delete cannot orphan or cascade anything unexpected. `on delete cascade` from workspaces also means: **a deleted workspace already removes its membership rows** — a group-derived row cannot exist in a missing workspace.

### Pattern 3: Skip-and-audit guard refusal (GS-02)

Route refusal is a 409 (`fail(res, 409, 'needOwner', ...)`); login-time refusal cannot fail the login. Shape: `if (row.role === 'owner' && (await ownerCount(ws.id, row.user_id)) === 0) { logWarn(loud fixed message); await db.tx(→ audit row `group_membership_removed:group:<guid>:guard-refused`); continue; }` — login proceeds. Note `ownerCount(ws.id, user.id)` counts OTHER owners: refusal fires when the user is the ONLY owner (count of others === 0), matching the route's semantics (`ownerCount(ctx.ws.id, target.id) === 0`).

### Anti-Patterns to Avoid
- **Delete-then-reinsert:** D-82-10 mandates ONE delta in place per workspace per login — never clear-and-regenerate.
- **Global `provenance = excluded.provenance`:** breaks Pin C and invite-over-group semantics (Pattern 1).
- **Relying on live mapping rows for the delete GUID:** parse it from provenance; mappings can be deleted between logins.
- **Putting removals outside the `unmapped` else-branch:** overage would start removing (SC5 violation). The overage skip must cover grants AND removals — keep everything inside the else (:5257).
- **Writing audit rows outside the delta tx:** AUD-01 — forced audit failure rolls back the delta.
- **Fatal guard refusal:** never throw on guard refusal — skip + audit + proceed.
- **Touching `is_instance_admin`:** D-82-8 — operator sync permanently out of scope.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Owner safety | bespoke owner existence check | `ownerCount()` :3409 | Shared, route-proven, excludeUserId semantics correct |
| Role comparison | ad-hoc string compare | `ROLE_RANK_WITH_VIEWER` :5264 | Viewer-rank-0 already handled; route PATCH uses same ranking |
| Highest-role resolution | custom reduce | `resolve()` groups.js:122 | Order-stable, test-locked Phase 80 contract |
| Member removal | delete-only | route tx shape (memberships + team_members + stripMember) | Keeps authority rows and doc profile consistent |
| Audit rows | new table/columns | `audit_log` encoded action | D-82-9: zero schema change |

## Runtime State Inventory

Not a rename/refactor/migration phase — no stored-data or service-config renames. One additive note: `memberships.provenance` values written by Phase 82 (downgrades/updates) change from creation-origin to role-source — no backfill, NULL legacy rows stay immune by design (D-81-6). Categories: stored data — none (no data migration; existing rows untouched except by live reconcile); live service config — none; OS-registered state — none; secrets/env vars — none; build artifacts — none.

## Common Pitfalls

### Pitfall 1: Overage-as-empty (SC5 / D-82-4)
**What goes wrong:** removal pass runs on an overage login because `_claim_names` yields no grants and the code treats "no grants" as "sync to empty".
**Why it happens:** the unmapped branch skips only the grant loop; if the reconcile sits outside the else, removals fire.
**How to avoid:** the entire reconcile lives inside the `else` at :5257; the overage test (groups-sso.test.mjs:226 pattern) gains an assertion that a pre-seeded group-derived row SURVIVES an overage login.
**Warning signs:** removal test passing with overage claims.

### Pitfall 2: Provenance clobber via shared clause
See Pattern 1 — literal clause change breaks two Phase 81 pins.

### Pitfall 3: Missing team_members/doc cleanup on group delete
**What goes wrong:** group-removed member leaves orphaned team authority rows and a stale doc profile that the read-path then repairs oddly.
**How to avoid:** mirror the route tx (Pattern 2); select `member_id` alongside `role`/`provenance`.

### Pitfall 4: Guard counted after the delete
Count-before-write: `ownerCount` must run BEFORE the tx begins (route precedent :7627 checks before its tx). Counting inside the tx still works but diverges from the template and complicates the refusal path (no write to roll back).

### Pitfall 5: Audit-action parse assumptions downstream (Question 5)
`[VERIFIED: server.js:6765–6808]` — the `/api/audit-log` GET route's verb filter compares only the two fixed D-T1 verbs (`sessions_revoked_by_operator`, `sessions_revoked_by_workspace_admin`); any other value matches zero rows, never errors. Encoded `group_*` actions therefore flow through display unfiltered — no parser assumes verb-only format. Phase 81 notes: only the two D-T1 verbs are humanized in the settings UI; `group_membership_removed:...` renders raw until Phase 83 (accepted, deferred).

### Pitfall 6: Fail-closed boundary
The reconcile rides inside the existing callback try (D-81-11): any throw → `errorRedirect`, no partial login. Guard refusals and dead-workspace skips are NOT throws — they are `continue`s with logging/audit. Keep the two failure vocabularies distinct.

## Code Examples

### Delete cell (guarded, audit in tx)
```js
// mirrors server.js:7627–7633 route shape + :5297–5303 audit-tx shape
const guid = row.provenance.slice('group:'.length);
if (row.role === 'owner' && (await ownerCount(ws.id, user.id)) === 0) {
  logWarn('sso group removal refused — last workspace owner (guard)');
  await db.tx(async () => {
    await db.run('insert into audit_log (...) values (...)',
      [uid(), user.id, user.id, `group_membership_removed:group:${guid}:guard-refused`, 0, clientIp(req), ws.id, user.name, user.email, user.name, user.email, now()]);
  });
  continue; // login proceeds — GS-02 skip-and-audit
}
await db.tx(async () => {
  await db.run('delete from memberships where workspace_id = ? and user_id = ?', [ws.id, user.id]);
  await db.run('delete from team_members where workspace_id = ? and user_id = ?', [ws.id, user.id]);
  await updateDoc(ws.id, doc => stripMember(doc, row.member_id, user.id));
  await db.run('insert into audit_log (...) values (...)', [/* ... lost-claim action ... */]);
});
```

### Encoded action vocabulary (D-82-9 format, discretion on spellings)
```
group_membership_removed:group:<guid>:lost-claim
group_membership_removed:group:<guid>:guard-refused
group_role_downgraded:group:<guid>:mapped-lower
group_membership_skipped:group:<guid>:dead-workspace
group_membership_skipped:group:<guid>:archived-workspace
group_role_downgraded:group:<guid>:guard-refused   // if downgrading an owner below owner → guard applies too
```
Note cell 10 generalizes: a DOWNGRADE that would strip the last owner must ALSO hit the guard (downgrade owner → member removes the only owner). The guard funnel should wrap both delete AND downgrade writes, not just deletes.

## Dead/archived workspace interactions (Question 8)

`[VERIFIED: db-adapter.mjs:860, server.js:382, 377–379]` — `pragma foreign_keys = on` + `on delete cascade` means a deleted workspace's membership rows are already gone: the `dead-workspace` reason is structurally unreachable for REMOVALS (no row can exist in a deleted workspace). It remains reachable for GRANTS (Phase 81 `!ws` skip at :5268). The real removal-side case is **archived** (`workspaces.archived = 1`): the row exists, the workspace is hidden. D-81-8's grant posture (skip + logWarn, never fatal) extends naturally: skip the removal, audit with `archived-workspace` reason, login proceeds. Removing rows in archived workspaces is optional aggression — skipping is the conservative, precedent-matching choice (unarchiving later restores exact state). Note the byte-identical regression claim: archived-workspace users with group rows now get ONE audit row per login (a change from today's zero) — acceptable under D-82-10's "per workspace where the user has a group-derived row" wording, but confirm the silent-skip alternative in plan if strict byte-identity is preferred for archived cases.

## Overage path (Question 6)

`[VERIFIED: server.js:5252–5257, groups.js:87]` — `resolveGroupsClaim` returns `{ state: 'unmapped', reason: 'overage' }` for any `_claim_names` presence; the callback logs one fixed line and skips the else-branch entirely. Keeping the reconcile inside that else satisfies D-82-4 with zero new branching. e2e test: seed a group-derived row + mapping, login with `_claim_names: { groups: 'src1' }` fixture, assert row intact, login succeeds, fixed overage warn emitted.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node:test | all tests | ✓ | bundled | — |
| Mock-Entra IdP (test/helpers/oidc-idp.mjs) | claim fixtures | ✓ | — | — |

No external dependencies — nothing blocking.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (built-in), e2e against shared mock-Entra IdP |
| Config file | none — `npm test` drives `node --test` |
| Quick run command | `node --test test/groups-sso.test.mjs test/groups-core.test.mjs` (36 pass baseline) |
| Full suite command | `npm test` — baseline 2015 tests, 2002 pass, 0 fail, 13 pg-skips |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GS-01 | no-mapping login deletes only `group:<guid>` row; manual/invite rows untouched | e2e | `node --test test/groups-sso.test.mjs` | ❌ Wave 0 (extend) |
| GS-02 | only-owner removal refused: loud logWarn + guard-refused audit row + login 200/session minted | e2e | `node --test test/groups-sso.test.mjs` | ❌ Wave 0 |
| GS-03 | mapped-lower downgrades group row; manual/invite row with same shape untouched | e2e | `node --test test/groups-sso.test.mjs` | ❌ Wave 0 |
| GS-04 | every delta audit-logged with GUID + reason; no-op login writes zero delta rows | e2e | `node --test test/groups-sso.test.mjs` | ❌ Wave 0 |
| SC5 | overage login: row survives, no grants, no removals, login OK | e2e | `node --test test/groups-sso.test.mjs` | ❌ Wave 0 |
| D-82-7 | group upgrade now flips provenance to group:<guid> (updated Phase 81 pin); invite-over-group still preserves group provenance (Pin C unchanged) | e2e | `node --test test/groups-sso.test.mjs` | ✅ pins exist, expectations change |
| Regression | unmapped byte-identical; oidc-sso + domain-admission-sso untouched and green | suite | `npm test` | ✅ |

### Test architecture notes (Question 7)
- Fixtures already seed group-derived rows directly: `db.prepare("insert into memberships (..., provenance) values (..., 'group:<guid>')")` (e.g. :391 seeds `'invite'`, :462 seeds `'manual'` — same idiom for `group:` values).
- Two-login flows per removal test: `runFlow(srv, claims)` grants (mapping live) → mutate (`idp.tokenConfig` claims for next flow, and/or delete the mapping row via fixture) → second `runFlow` with `groups` claim minus the GUID → assert removal. `runFlow` accepts a fresh `code` per call (`'auth-code-1'`, then `'auth-code-2'`, …).
- Claim manipulation: `idp.tokenConfig = { code, claims: { groups: [...] } }` — arbitrary claim overrides incl. `_claim_names`.
- Guard test: seed the SSO user as sole owner (`provenance = 'group:<guid>'`, role owner) → second login without the claim → assert session minted, row intact, warn + audit row present. Capture logWarn via the suite's existing stdout-scan idiom (:237, :271 — also assert no GUID/email leaks in the refusal line, PII posture).
- Fault-injection precedent (:335–345 SQLite trigger) reusable for a fail-closed pin on the reconcile (throw → `/login?sso=error`, no partial writes).

### Sampling Rate
- **Per task commit:** `node --test test/groups-sso.test.mjs test/groups-core.test.mjs`
- **Per wave merge:** `npm test` (must stay 0 fail / 13 pg-skips)
- **Phase gate:** full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] Reconcile test block in test/groups-sso.test.mjs (GS-01..04 + SC5 + updated D-82-7 pin)
- [ ] No schema/framework installs needed

## Security Domain

security_enforcement not disabled — included. This phase touches access control (membership removal) — the highest-risk surface of the milestone.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V4 Access Control | yes | provenance predicate + ownerCount guard; immune classes (manual/invite/NULL) never selected |
| V5 Input Validation | yes | roles come from DB-backed mappings (Phase 80 CHECK-constrained); GUID parsed from provenance, re-encoded not concatenated from claims |
| V9 Communications | no | no new endpoints |
| V2/V3/V6 | no | no auth/session/crypto changes |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Privilege-stripping of manual admins via group logic | Elevation/Tampering | provenance predicate — GS-01/03 immunity; e2e pin |
| Audit-trail tampering via action string | Repudiation | GUID from provenance (server-side), never from claims; fixed reason vocabulary |
| PII/GUID leakage in logs | Information Disclosure | fixed logWarn messages only (D-81-10 posture); suite asserts no GUID/email in warn lines |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Conditional `case` on-conflict clause satisfies D-82-7's literal wording ("sets provenance = excluded.provenance") — or planner picks the dedicated-update alternative | Pattern 1 | Low: both comply with the intent; Pin C breakage is the thing being avoided |
| A2 | GS-04 intends encoded audit rows for NEW grants too (not just removals/downgrades/skips) — Phase 81 currently logs grants as security_log verbs only | Diff table cell 4 | Low: additive audit rows; over-logging caught by changes-only pin |
| A3 | `dead-workspace` reason unreachable for removals (FK cascade pre-deletes rows) | Dead/archived section | Low: reason stays in vocabulary for Phase 83 rendering regardless |
| A4 | Archived-workspace removals should be skipped+audited (not removed) | Dead/archived section | Low: discretion area; both defensible |
| A5 | Downgrades that strip the last owner also hit the guard | Code examples | Medium if missed: sole owner silently demoted — guard must wrap both write kinds |

## Open Questions

1. **Literal vs conditional on-conflict clause (Pattern 1)** — D-82-7's wording vs Pin C. Recommendation: conditional clause (Pattern 1); raise at discuss/plan checkpoint if the literal reading is insisted on.
2. **Audit rows for fresh grants (cell 4)** — does GS-04's "grants" add an `audit_log` delta row per new group grant, or do the existing security_log verbs suffice? Recommendation: add the encoded row (GS-04 literal, uniform Phase 83 rendering).
3. **Archived-workspace removals: skip+audit vs remove** — recommendation: skip+audit (`archived-workspace` reason), precedent-matching.

## Sources

### Primary (HIGH confidence)
- Live reads this session: server.js:381–389, 438–446, 4637–4664, 5246–5315, 5299–5302, 6765–6808, 6909, 7599–7650, 3409–3411, 4961–4963, 377–379; db-adapter.mjs:860; groups.js:85–122; test/groups-sso.test.mjs (full scan, 553 lines)
- 81-VERIFICATION.md — Phase 81 anchors + full-suite baseline confirmed
- 82-CONTEXT.md / 81-CONTEXT.md / REQUIREMENTS.md — locked decisions D-82-1..10, GS-01..04

### Secondary (MEDIUM confidence)
- None needed — all claims grounded in repo reads or CONTEXT.md

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Anchors/stack: HIGH — every cited line read this session
- Architecture: HIGH — corridor, guard template, and audit shape all precedented in verified Phase 81 code
- Pitfalls: HIGH — each trap tied to a live pin or verified line

**Research date:** 2026-11-20
**Valid until:** ~2026-12-20 (stable repo; anchors re-verify per 81 drift note)
