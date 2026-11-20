# Phase 80: Group Mapping Core — Parser, Resolver, Overage Detection — Research

**Researched:** 2026-11-20
**Domain:** DB-backed group-mapping config + server-side claim-ingestion module (zero-dependency Node, hand-rolled OIDC client, dual-mirrored SQL schema)
**Confidence:** HIGH — codebase claims verified by direct file reads this session; Entra overage behavior verified in `.planning/research/STACK.md` (learn.microsoft.com, 2026-08 docs)

## Summary

Phase 80 builds an **inert server core**: (1) a DB-backed `group_mappings` store with a validated operator save API, (2) a new server-only `groups.js` module with parse/validate helpers and the D-82-1 resolver, and (3) `_claim_names` overage detection pinned by four fixture tests. Nothing consumes the resolver at login until Phase 81; with no mappings stored the server must boot byte-identically to today.

The codebase has strong precedents for every piece: the tri-state parse shape (`domains.js:53-80`), additive schema work (`adapterEnsureColumn`, `server.js:92` + `:630-695`), operator-gated keyed refusals (`fail()` `server.js:4710`, `isInstanceAdmin` gate `:6802`), claim passthrough (`verifyIdToken` returns the full claims object, `oidc.js:88-124`), and a real-server test harness with a mock Entra IdP (`test/helpers/server.mjs`, `test/helpers/oidc-idp.mjs`). **Zero new dependencies** — `test/dependencies.test.mjs` pins `package.json` dependencies to exactly `{@office-kit/xlsx, pg, web-push}` and the Dockerfile COPY list to an exact array.

Three findings the planner must design around:

1. **Dual-schema mirror:** the schema lives verbatim in TWO files (`server.js` `const SCHEMA` and `db-adapter.mjs` `SQLITE_SCHEMA`), and `test/db-adapter.test.mjs:245-249` pins them modulo comments/whitespace. A new `group_mappings` table must be added to both, identically.
2. **FK cascade vs dead-mapping detection:** `workspaces.id` is referenced by most tables `on delete cascade`. If `group_mappings.workspace_id` cascades, deleting a workspace silently deletes the mapping — making D-82-6 "warn about dead mappings" impossible to satisfy. The mapping row must **survive** workspace deletion (no cascade, or no FK) so boot can warn.
3. **New runtime file ⇒ Dockerfile test update:** adding `groups.js` as a runtime import of `server.js` requires appending it to the exact COPY-target array in `test/dependencies.test.mjs` (Phase 75 did exactly this for `domains.js`, comment `G-75-3`). Missing it fails `npm test`.

**Primary recommendation:** one new `groups.js` (pure parser/validator/resolver/overage detector, fully unit-tested) + one new `group_mappings` table added to both schemas with a **non-cascading** workspace reference + one operator-gated save/refuse API + boot-time dead-mapping warning + four overage fixtures. No callback wiring, no UI, no env vars.

<user_constraints>
## User Constraints (from CONTEXT.md — 80-CONTEXT.md, copied verbatim)

### Locked Decisions

- **Owner decision (this discussion): group mapping config is DB-backed with an operator
  UI on /governance — env vars are dropped** for mapping config. The ROADMAP GM-01 env
  triple wording (`ENTRA_GROUP_MAP`) is superseded: Phase 80 builds the DB table + save-time
  validation; the editor UI lands in Phase 83 (GV-03's dead-mapping section is part of it).
- **Role tokens: exactly the app's workspace role names** — `owner|admin|member`, strict
  lowercase, no aliases. Invalid token = refusal (at save).
- **Group keys are Entra group Object IDs (GUID shape); workspace keys are workspace IDs.**
  Slugs and display names are display-only labels, never match keys (research + rename-able).

## Validation: refuse at save, warn at boot

- The save API validates GUID shape + workspace existence + role token; invalid mapping =
  keyed 400 refusal, nothing invalid is ever stored.
- Boot (and the operator console) warn about mappings that BECAME dead since save
  (workspace deleted, group gone). Boot does not refuse on dead mappings — D-82-6:
  dead mappings surface as a console warning section (Phase 83 renders it; Phase 80
  provides the detection).
- Existing env-parse precedents (D-78-1 strict tokens, Phase 75 tri-state) apply to any
  REMAINING env surface only — there is no mapping env var anymore.

## groups.js module API (full resolver)

- Server-only module (never bundled by Vite — same rule as oidc.js/totp.js).
- Exports, at minimum: mapping validation helpers (GUID shape, role token, workspace
  existence check hook), and a resolver: `resolve(groupsClaim) → { grants:
  [{workspaceId, role, groupGuid}], operatorFlag: boolean|null }` implementing
  D-82-1 (highest role wins) over all stored mappings.
- Inert by design: nothing in the login callback consumes it until Phase 81.

## Overage detection (D-82-4)

- `groups` claim absent or `_claim_names.groups` present ⇒ UNMAPPED — never an empty list
  (removal-sync trap from PITFALLS.md: an overage pointer misread as empty would strip
  power users in Phase 82).
- Fixture tests pin ALL FOUR shapes, each resolving to a distinct documented outcome:
  1. `_claim_names` present alone
  2. `_claim_names` + `_claim_sources` (full overage pair)
  3. missing `groups` claim entirely
  4. empty `groups` array (this one IS "no groups" — distinct from overage)

## Standing constraints (carried)

- Zero new dependencies; 5-locale keyed refusals land in the same commit as the first
  emitting gate (save-API refusals here; UI strings in Phase 83).
- With no mappings stored, the server boots and behaves byte-identically to today
  (all existing suites green, no behavior change).

### the agent's Discretion

Table/column naming for `group_mappings`; exact resolver return shape details beyond the
CONTEXT-mandated contract; boot-warning log format; save-API route shape; whether labels
live in the mapping row (CONTEXT: labels display-only, never match keys).

### Deferred Ideas (OUT OF SCOPE)

- Graph overage fallback (`getMemberObjects`) — only if ApplicationGroup mode proves insufficient (Future Requirements).
- Mapping editor UI — Phase 83 (GV-01..03).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GM-01 | In-app (DB-backed) mapping config, save-time validation with keyed refusals, dead-mapping warning at boot | Dual-schema pattern (server.js SCHEMA + db-adapter.mjs SQLITE_SCHEMA + mirror test), operator-gated `fail()`/keyed-error pattern (`server.js:4710`, `:6802`), 5-locale err.* key pattern (`src/locales/en.json:1776`), non-cascading FK for dead-mapping survival |
| GM-02 | Server reads `groups` claim from ID token; `_claim_names` overage detected and treated as unmapped (never empty) | `verifyIdToken` returns full claims (`oidc.js:88-124`) — `_claim_names`/`_claim_sources`/`groups`/`hasgroups` ride along free; overage detector in groups.js + 4 fixtures |
| GM-03 | Mapping config keys validated (GUID shape, workspace existence); labels display-only, never match keys | GUID regex (canonical Entra Object ID shape), workspace existence via `workspaces` lookup (IDs are `crypto.randomUUID()` — shape alone can't distinguish group GUID from workspace ID), strict-token role validation |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Mapping config storage + save validation | API/Backend (server.js routes) | Database/Storage (group_mappings table) | Operator-only CRUD is server authority; no UI this phase |
| GUID/role/workspace validation helpers | API/Backend (groups.js) | — | Pure functions, unit-tested in isolation |
| Claim ingestion + overage detection | API/Backend (groups.js, fed by oidc.js claims) | — | `verifyIdToken` already returns the parsed claims object — zero verifier changes |
| Resolver (highest-role-wins over mappings) | API/Backend (groups.js) | Database/Storage (mappings read) | Pure over stored config; consumed in Phase 81 |
| Dead-mapping detection at boot | API/Backend (server.js boot sequence) | — | Boot log warns; console section is Phase 83 |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (none — zero new dependencies) | — | — | Milestone invariant pinned by `test/dependencies.test.mjs` (deps deepEqual `{@office-kit/xlsx, pg, web-push}`) [VERIFIED: test/dependencies.test.mjs:30-46] |
| node:test + node:assert/strict | Node 24 built-in | Test framework | All 90+ existing suites use it [VERIFIED: package.json `test: node --test --test-concurrency=2 test/*.test.mjs`] |
| node:sqlite / pg via db-adapter.mjs | existing | Storage | `SQLITE_SCHEMA` + pg variant; new table rides both |

### Supporting (already present, reused)
| Existing asset | Reused for |
|----------------|-----------|
| `oidc.js` `verifyIdToken()` | Full claims passthrough — the ingestion point (Phase 81 wires it; Phase 80 only builds the consumer contract) [VERIFIED: oidc.js:88-124 returns `{ ok: true, claims }`] |
| `domains.js` tri-state parse | Canonical pure-parser shape (undefined→null, strict comparison at caller) [VERIFIED: domains.js:50-72] |
| `server.js` `fail(res, status, code, message)` | Keyed refusal funnel for the save API [VERIFIED: server.js:4710] |
| `server.js` `isInstanceAdmin(user)` + operator gate order | Save-API authorization (sameOrigin → requireUser → operator gate, `server.js:6793-6802` pattern) |
| `server.js` `logSecurity(userId, verb)` | Security-log verb for mapping mutations if desired [VERIFIED: server.js:4930] |
| `server.js` boot `logInfo` block (:9293-9309) | Boot dead-mapping warning placement (after the D-11 door-matrix lines) |
| `test/helpers/server.mjs` + `test/helpers/oidc-idp.mjs` | Real-server + mock-Entra harness for save-API and (later) fixture-token tests |
| `adapterEnsureColumn` (`server.js:92`) | Only if the table needs post-hoc columns; a brand-new table belongs in SCHEMA directly |

**Installation:**
```bash
# Nothing. Zero new runtime or dev dependencies.
```

## Package Legitimacy Audit

> This phase installs **no external packages**. Zero-dependency invariant is pinned by `test/dependencies.test.mjs`. Audit: N/A — no packages to vet.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Operator (HTTP, Phase 83 UI later; API now)
   │  POST /api/governance/group-mappings  (sameOrigin → requireUser → isInstanceAdmin gate)
   ▼
Save API (server.js route)
   ├─ groups.js validators: guidShape(guid) · roleToken(role) · workspaceExists(wsId, db)
   ├─ valid   → INSERT into group_mappings (both-schema table, non-cascading ws ref)
   └─ invalid → 400 { code: keyed } → 5-locale err.* (same commit as this gate)
        │
Boot (server.js main())
   ├─ SELECT group_mappings  (empty ⇒ log 'off', zero behavioral delta)
   └─ dead-mapping scan: workspace_id not in workspaces ⇒ logWarn (D-82-6 boot half)

Entra ID token (future, Phase 81 — contract built now)
   │  verifyIdToken() → claims { groups?, _claim_names?, _claim_sources?, hasgroups? }
   ▼
groups.js resolve(groupsClaim, mappings)
   ├─ overage markers (_claim_names.groups OR hasgroups)  ⇒ UNMAPPED (never [])
   ├─ groups claim absent                                 ⇒ UNMAPPED (never [])
   ├─ groups: []                                          ⇒ "no groups" (distinct from UNMAPPED)
   └─ groups: [guid...]  × stored mappings ⇒ highest-role-wins
        → { grants: [{workspaceId, role, groupGuid}], operatorFlag: boolean|null }
```

### Recommended Project Structure
```
groups.js                        # NEW — server-only module (sibling of domains.js/oidc.js, repo root)
test/groups-core.test.mjs        # NEW — pure unit tests: validators, resolver, overage fixtures (no server)
test/groups-config-api.test.mjs  # NEW — save API via test/helpers/server.mjs harness
server.js                        # MODIFIED — SCHEMA table, import groups.js, save route, boot warning
db-adapter.mjs                   # MODIFIED — SQLITE_SCHEMA mirror of the same table
src/locales/*.json ×5            # MODIFIED — err.* keys, same commit as the save gate
test/dependencies.test.mjs       # MODIFIED — add 'groups.js' to the exact COPY-target array
```

### Pattern 1: Pure parser/validator module, no process.env reads
**What:** exactly the `domains.js` shape — pure exported functions; the module imports nothing ambient; DB access is injected (a `workspaceExists(id, db)` hook, per CONTEXT "workspace existence check hook").
**Example:** [VERIFIED: domains.js:50-72]
```js
export const parseDomainList = (raw, name) => {
  if (raw === undefined) return null; // unset/set distinction at the caller
  /* strict per-entry validation, warn-and-clean drop, Set dedupe */
};
```
`groups.js` must be importable by a unit test with zero server boot.

### Pattern 2: Dual-schema additive table (mirror test pins the pair)
**What:** add `create table if not exists group_mappings (...)` to BOTH `server.js` `const SCHEMA` and `db-adapter.mjs` `SQLITE_SCHEMA`, verbatim-identical modulo comments. `test/db-adapter.test.mjs:245-249` fails on drift. Fresh boot creates it (`create table if not exists` ⇒ second boot no-op); existing DBs get it on next boot for free — **no `adapterEnsureColumn` needed for a new table**.

Suggested shape (naming at planner's discretion):
```sql
create table if not exists group_mappings (
  id           text primary key,
  group_guid   text not null,
  workspace_id text not null,        -- NO 'on delete cascade': dead mappings must survive
  role         text not null check (role in ('owner','admin','member')),
  label        text,                 -- display-only, never a match key
  created_by   text references users(id) on delete set null,
  created_at   integer not null,
  updated_at   integer not null
);
create unique index if not exists group_mappings_pair on group_mappings(group_guid, workspace_id);
```
[VERIFIED: server.js:291+ / db-adapter.mjs:146+ mirror structure; role CHECK verbatim precedent: `role         text not null check (role in ('owner','admin','member','viewer'))` — server.js:378, db-adapter.mjs:215]

**FK decision (critical):** every existing workspace reference cascades (`memberships`, `team_members`, `invites` — `on delete cascade`). A cascading `group_mappings.workspace_id` would silently delete mappings when a workspace is deleted, making D-82-6 dead-mapping warning unimplementable. The mapping row must survive with a workspace_id that no longer resolves ⇒ boot scan detects "workspace_id not in workspaces" and warns. Deleted-*group* mappings (GUID gone from Entra) are inherently undetectable server-side (no Graph — PITFALLS.md Pitfall 9); Phase 80 only detects the workspace-dead kind at boot.

### Pattern 3: Operator-gated keyed refusal (Phase 78/79 family)
**What:** route order `sameOrigin → requireUser → isInstanceAdmin → validation → write` — the operator gate comes BEFORE any target lookup (no existence leak, `server.js:6793-6802` comment). Invalid mapping = `fail(res, 400, '<code>', '<message>')` [VERIFIED: server.js:4710]; the code string maps to `err.<code>` in all 5 locale files, landing in the same commit as the gate (standing constraint; `err.operatorOnly` is the naming precedent — `src/locales/en.json:1776`).

Refusal codes to define (planner names them): malformed GUID, unknown workspace, invalid role token, duplicate (guid, workspace) pair. **Nothing invalid is ever stored** — validate everything before a single INSERT.

### Pattern 4: GUID shape validation
Entra group Object IDs are canonical GUIDs; `workspaces.id` is `crypto.randomUUID()` [VERIFIED: server.js:726 `const uid = () => crypto.randomUUID();`] — also GUID-shaped. So shape validation alone cannot distinguish group GUID from workspace ID; workspace legitimacy is **only** the DB existence check. Canonicalize GUIDs to lowercase-with-hyphens before storage/comparison so paste-format variants (`{braced}`, uppercase, no-hyphen) can't create duplicate dead keys.
**Example shape check** [ASSUMED — exact regex at planner's discretion; the 8-4-4-4-12 hex shape is standard]:
```js
const GUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
```

### Pattern 5: Overage detection — total, four-outcome
**What:** per CONTEXT, `resolve(groupsClaim)` must distinguish UNMAPPED (overage or missing claim — "evidence incomplete, act on nothing") from genuinely-empty (`groups: []`). `hasgroups: true` (implicit-flow variant) is a cheap one-boolean addition that makes the detector total [CITED: .planning/research/STACK.md §2].
**Example:**
```js
export function resolveGroupsClaim(claims) {
  if (claims?._claim_names?.groups || claims?._claim_names || claims?.hasgroups) return { state: 'unmapped', reason: 'overage' };
  if (!('groups' in (claims ?? {}))) return { state: 'unmapped', reason: 'missing' };
  if (!Array.isArray(claims.groups)) return { state: 'unmapped', reason: 'shape' };
  return { state: 'groups', groups: claims.groups.map(String) }; // tolerate single-string? — see Open Questions
}
```
STACK.md documents the exact overage payload: `_claim_names: { groups: "src1" }` + `_claim_sources: { src1: { endpoint: …getMemberObjects } }` [CITED: .planning/research/STACK.md:43-50]. The Graph fallback itself is **out of scope** (deferred).

### Anti-Patterns to Avoid
- **Cascading FK on `group_mappings.workspace_id`:** silently destroys config; dead-mapping warning becomes unimplementable (D-82-6).
- **A mapping env var:** owner decision supersedes ROADMAP GM-01's `ENTRA_GROUP_MAP` wording — DB only.
- **Importing groups.js from `src/`:** server-only, never bundled by Vite (oidc.js header rule, `oidc.js:5-8`).
- **Treating missing `groups` as `[]`:** the removal-sync trap (PITFALLS.md Critical Pitfall 1) — Phase 82 strips power users. UNMAPPED ≠ empty.
- **Graph calls in this phase:** zero-dependency + claims-first; the resolver is pure over the claim object.
- **Slug/name as match key:** workspace IDs and group Object IDs only; slugs are display-only and renameable (D-82-5 makes old slugs die).
- **Editing only one of the two schemas:** mirror test (`test/db-adapter.test.mjs:245`) fails `npm test`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token/claims verification | Any JWT work | `oidc.js` `verifyIdToken` (unchanged) | Proven fail-closed RS256 chain; claims ride along free [VERIFIED: oidc.js:88-124] |
| Test servers / mock IdP | Custom mocks | `test/helpers/server.mjs` + `test/helpers/oidc-idp.mjs` | Battle-tested isolated harness (ephemeral port + DATA_DIR) |
| Keyed refusal plumbing | New error channel | `fail()` + `err.*` locale keys | 5-locale parity test auto-covers new keys |
| GUID generation | Anything | `crypto.randomUUID()` | House `uid()` [VERIFIED: server.js:726] |

## Common Pitfalls

### Pitfall 1: Overage misread as empty list
**What goes wrong:** `_claim_names.groups` present → naive `claims.groups ?? []` yields `[]` → Phase 82 removal-sync reads "user left all groups" and strips them (PITFALLS.md Critical Pitfall 1: exactly the power users with >200 groups).
**How to avoid:** the four-outcome detector (Pattern 5); fixtures pin all four shapes with distinct outcomes. Never let an overage path produce `grants` OR a removal signal.
**Warning signs:** a fixture test suite that only exercises `groups: [guid]`.

### Pitfall 2: Forgetting the Dockerfile COPY list
**What goes wrong:** `groups.js` is imported by server.js at runtime; `test/dependencies.test.mjs` deepEquals the runtime COPY targets — suite goes red after the import lands.
**How to avoid:** same commit adds `groups.js` to the array (Phase 75 G-75-3 precedent, in-file comment).
**Warning signs:** red `dependencies.test.mjs` immediately after wiring the import.

### Pitfall 3: Schema drift between the two mirrors
**What goes wrong:** table added to `server.js` SCHEMA but not `db-adapter.mjs` (or vice versa) → mirror test red; or pg-variant semantics break (`collate nocase` must not appear in pg — see `pgSchemaVariant` doc, db-adapter.mjs:140-144).
**How to avoid:** write both; run `node --test test/db-adapter.test.mjs`; avoid pg-incompatible SQL in the table DDL.
**Warning signs:** `db-adapter.test.mjs` "mirror drifted" failure.

### Pitfall 4: Existence leak in the save API
**What goes wrong:** validating "unknown workspace ID" before the operator gate lets a non-operator probe workspace IDs (403 vs 400 oracle). Existing house rule: operator gate BEFORE any target lookup (`server.js:6793-6802`).
**How to avoid:** `sameOrigin → requireUser → isInstanceAdmin → validate` order, verbatim.
**Warning signs:** a test hitting the endpoint unauthenticated that can distinguish bad-workspace from bad-guid.

### Pitfall 5: `viewer` role tension
The DB memberships role CHECK admits `'owner','admin','member','viewer'` [VERIFIED: server.js:378], but CONTEXT locks mapping role tokens to exactly `owner|admin|member`. The mapping table's own CHECK should enforce the three-token set (a mapping to `viewer` must refuse at save per the locked decision). Don't widen to viewer without an owner ruling.
**How to avoid:** mapping-table CHECK + save-time token validation both use the 3-token set.

### Pitfall 6: Boot behavior change with empty config
**What goes wrong:** an eager dead-mapping query or import side-effect changes boot output/timing, breaking the "byte-identical boot with no mappings" success criterion.
**How to avoid:** with zero rows, log exactly one grep-able line (`group mappings: off` style, matching the D-06/D-11 log vocabulary at `server.js:9295-9309`) and nothing else; all existing suites stay green.

## Code Examples

### Save-route gate order (house pattern)
```js
// Source: server.js:6793-6802 shape (operator-flag route)
if (!sameOrigin(req)) return fail(res, 403, 'badOrigin', '...');   // per house order
// requireUser …
if (!isInstanceAdmin(operator)) return fail(res, 403, 'operatorOnly', 'Only the instance operator can do that');
// THEN validate guid / workspace existence / role token → fail(res, 400, code, msg)
```

### Keyed refusal + locale key (same commit)
```json
// Source: src/locales/en.json:1776 precedent
"err.groupMappingBadGuid": "Group ID must be an Entra Object ID (GUID)"
```
Add the same `err.<code>` key to `fr/nl/de/es` in the same commit as the route (locale-registry parity test auto-covers).

### Boot warning (dead mapping)
```js
// placement: server.js boot logInfo block, after :9309 (workspace-creation line)
for (const dead of await findDeadMappings(db)) logWarn(`group mapping dead: group ${dead.group_guid} → workspace ${dead.workspace_id} no longer exists (D-82-6)`);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Env-triple mapping config (ROADMAP GM-01 wording) | DB-backed config + operator UI | Owner decision 2026-11-20 (80-CONTEXT.md) | No `ENTRA_GROUP_MAP`; boot-freeze semantics replaced by save-time validation |
| Graph SDK for groups | Claims-first, zero deps | v3.2 milestone invariant | Overage = detect + unmapped; fallback recipe documented but deferred |

## Runtime State Inventory

> Not a rename/refactor/migration phase — no stored strings are being renamed. The only new persisted state is the new `group_mappings` table (created `if not exists`, additive, second boot no-op). **Nothing else found** — verified by grep: no `groups` claim handling, no `_claim_names` handling, no mapping config exists anywhere in server.js/src today.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | everything | ✓ | 24 (node:24-alpine runtime; `node --test` built-ins) | — |
| pg (optional backend) | pg deployments | ✓ pinned ^8 | 8.x | SQLite default |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (Node built-in), `node --test --test-concurrency=2 test/*.test.mjs` |
| Config file | none — convention-driven |
| Quick run command | `node --test test/groups-core.test.mjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GM-01 | Save API refuses malformed GUID / unknown workspace / invalid role / duplicate, keyed + localized; nothing stored on refusal | integration (harness server) | `node --test test/groups-config-api.test.mjs` | ❌ Wave 0 |
| GM-01 | Dead mapping survives workspace deletion and boot warns | integration (harness: delete workspace, reboot) | `node --test test/groups-config-api.test.mjs` | ❌ Wave 0 |
| GM-02 | Four overage/claim shapes resolve to distinct outcomes (fixtures) | unit (pure) | `node --test test/groups-core.test.mjs` | ❌ Wave 0 |
| GM-02/GM-03 | Resolver highest-role-wins over stored mappings; operator flag resolution | unit | `node --test test/groups-core.test.mjs` | ❌ Wave 0 |
| GM-03 | GUID canonicalization (braced/uppercase variants) collapses to one key | unit | `node --test test/groups-core.test.mjs` | ❌ Wave 0 |
| Standing | Empty config ⇒ boot byte-identical; all existing suites green | full suite | `npm test` | ✅ existing |
| Standing | Zero new deps + Dockerfile COPY list | contract | `node --test test/dependencies.test.mjs` | ✅ modify array |

### Sampling Rate
- **Per task commit:** `node --test test/groups-core.test.mjs test/groups-config-api.test.mjs`
- **Per wave merge:** `npm test`
- **Phase gate:** full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/groups-core.test.mjs` — pure validator/resolver/overage units (GM-02, GM-03)
- [ ] `test/groups-config-api.test.mjs` — save API + refusal keys + dead-mapping survival (GM-01)
- [ ] `src/locales/{fr,nl,de,es}.json` err.* keys — parity gate runs in `npm test`

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V4 Access Control | yes | Operator gate (`isInstanceAdmin`) before any lookup — no existence leak (house rule, server.js:6793-6802) |
| V5 Input Validation | yes | GUID shape regex + strict 3-token role set + DB existence check; allow-list validation, nothing invalid stored |
| V7 Errors & Logging | yes | Keyed refusals (no policy reveal), boot warnings via `logWarn`, optional `logSecurity` verbs |
| V6 Cryptography | no | No new crypto; GUIDs are identifiers, not secrets |
| V2/V3 Auth/Session | no | Reuses existing requireUser/sameOrigin/session machinery untouched |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Non-operator probing mapping/workspace IDs via differential errors | Info Disclosure | Operator gate before validation (no-oracle) |
| Malformed GUID variants creating duplicate/dead keys | Tampering | Canonicalize (lowercase, hyphenated) before uniqueness index |
| Claim value trusted from unverified token | Spoofing | Resolution strictly downstream of `verifyIdToken` (Phase 81 ordering; contract defined now) |
| Config injection via label field | Tampering | Label stored as opaque text, display-only, never matched — and not rendered until Phase 83 (escape there) |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | GUID regex `/^[0-9a-f]{8}-…$/i` is the accepted Object ID shape; canonicalization to lowercase-hyphenated is desired | Pattern 4 | Cosmetic mismatch → refusal of valid paste formats; planner can confirm canonicalization choice |
| A2 | New table in SCHEMA (both mirrors) is sufficient for fresh + existing DBs (no adapterEnsureColumn needed for a new table) | Pattern 2 | If an existing-DB path needs ensureColumn, migration task changes shape — low risk, `create table if not exists` is the established additive pattern |
| A3 | Mapping-table role CHECK uses the 3-token set while memberships keep the 4-token CHECK | Pitfall 5 | Overly strict if owner ever wants viewer mappings — locked decision says 3 tokens, so low risk |
| A4 | Resolver consumes a plain claims object (not a token) — Phase 81 will pass `verdict.claims` | Pattern 5 | Signature churn in Phase 81; contract is CONTEXT-mandated so low risk |
| A5 | Single-string `groups` claim tolerance: STACK.md says "tolerate a single string" (ARCHITECTURE.md:156); CONTEXT's four fixtures don't pin it | Open Questions | A non-array string groups claim would hit the 'shape' unmapped branch — acceptable fail-closed default |

## Open Questions

1. **Does `resolve()` accept a single-string `groups` claim?**
   - What we know: ARCHITECTURE.md:156 says "tolerate a single string"; CONTEXT fixtures don't pin it.
   - Recommendation: fail-closed default (non-array ⇒ unmapped-with-reason) unless planner wants the tolerance; one extra unit test either way.
2. **Where does `operatorFlag` come from in Phase 80's resolver?**
   - What we know: CONTEXT contract returns `operatorFlag: boolean|null`; operator-mapped groups live in the same table. Recommendation: a sentinel `workspace_id`/role value or a dedicated operator mapping row — planner's discretion area; define it now so Phase 81 doesn't migrate config.
3. **Audit logging for mapping save/delete in Phase 80?**
   - What we know: GO-02 audit-logs *group-derived operator grants* (Phase 81); PITFALLS.md debt table flags "no audit rows for mapping changes" as never-acceptable long-term. The save API could `logSecurity` per mutation cheaply now.
   - Recommendation: add audit verbs for mapping create/delete in the save API (cheap, avoids Phase 83 retrofit).

## Sources

### Primary (HIGH confidence — read this session)
- `oidc.js` (full read) — claims passthrough, server-only header rule, fail-closed contract
- `domains.js` (full read) — tri-state pure-parser precedent, warn-and-clean, strict-undefined
- `server.js` — SCHEMA (:291+), memberships/invites role CHECKs (:378/:400/:663), `adapterEnsureColumn` import (:92) + additive migrations (:630-695), `uid()` (:726), `json`/`fail` (:4696/:4710), `logSecurity` (:4930), SSO callback + no-oracle errorRedirect (:5083-5140), operator gate order (:6793-6802), lastOperator count-before-write (:6811-6822), boot log block (:9293-9309)
- `db-adapter.mjs` — SQLITE_SCHEMA (:146+), pg variant doc (:140-144), exports
- `test/dependencies.test.mjs` (full read) — zero-dep pin + exact Dockerfile COPY array (G-75-3 comment)
- `test/db-adapter.test.mjs` :235-249 — schema mirror pin
- `test/helpers/server.mjs`, `test/helpers/oidc-idp.mjs`, `test/oidc-sso.test.mjs` — harness + mock IdP + `OIDC_ISSUER_OVERRIDE` fixture flow
- `src/locales/en.json:1776` — `err.operatorOnly` keyed-refusal precedent
- `.planning/config.json` — nyquist_validation absent ⇒ enabled; security_enforcement absent ⇒ enabled

### Secondary (HIGH — verified against live docs at milestone research time)
- `.planning/research/STACK.md` — overage payload shape, `hasgroups` variant, ApplicationGroup recommendation (learn.microsoft.com 2026-08)
- `.planning/research/PITFALLS.md` — Critical Pitfall 1 (overage-as-empty), Pitfall 9 (dead mappings undetectable without Graph)

### Tertiary (LOW)
- GUID regex exact shape — standard well-known format, planner-tunable [ASSUMED A1]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero deps; every reused asset read this session
- Architecture: HIGH — all patterns have in-repo shipped precedents (Phase 75/78/79/30)
- Pitfalls: HIGH — overage mechanics from verified Entra docs; integration pitfalls codebase-verified

**Research date:** 2026-11-20
**Valid until:** 2026-12-20 (stable; only local code evolution affects it)
