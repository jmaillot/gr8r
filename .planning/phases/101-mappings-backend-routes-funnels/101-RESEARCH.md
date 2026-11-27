# Phase 101: Mappings Backend — Routes & Funnels - Research

**Researched:** 2026-11-27
**Domain:** server.js HTTP routes over `group_mappings` (Node >=24, `node:sqlite`, zero-dependency), dual-dialect db-adapter parity
**Confidence:** HIGH (every anchor below was read directly this session)

## Summary

Phase 101 adds three colocated routes around the existing POST sibling: a GET list, a DELETE by opaque row id, and a dialect-parity hardening of the duplicate refusal. All of the house patterns needed already exist and are proven by test files this phase can copy: the POST sibling (`server.js:8961-9010`) supplies the guard ladder and funnels verbatim; the instance-roles GET (`server.js:9048-9090`) supplies the no-throttle read route with server-side name resolution; the instance-roles POST (`server.js:9092-9130`) supplies the operator-keyed throttle and the same-tx audit write. No schema change is required — `group_mappings` (server.js:800-811) already carries the uid PK, the `kind` column, and the `group_mappings_pair` unique index.

Key verified findings: (1) **MAP-01's requirements text mentions an operator-keyed throttle on GET, but locked decision D-02 overrides it — GET is unthrottled** (instance-roles/dead-mappings read precedent). The planner must follow D-02 and note the override. (2) The duplicate refusal is today a **pre-check** (`select 1 from group_mappings where group_guid = ? and workspace_id = ?`, server.js:8982) whose SQL is dialect-neutral under the adapter's `pgRewrite`; the "both dialects" requirement (MAP-03/D-14) is satisfied by that pre-check plus a constraint-backstop catch whose SQLite shape is `/UNIQUE constraint failed/` (proven at test/db-adapter.test.mjs:327-331) and whose pg shape is error code `23505` + constraint name `group_mappings_pair`. (3) **WR-83-03 verdict: SAFE** — the dead-mappings trail LIKE is `action like 'group\_%:group:%' escape '\'` (server.js:9033), which requires a literal `group_` prefix followed by the substring `:group:`; neither `group_mapping_deleted` nor the existing `group_mapping_saved` contains a `:group:` segment, so neither lands in the trail. (4) The `dead`/`deadReason` distinction maps exactly onto existing state: workspace row missing (non-cascading FK, server.js:794 comment — the mapping row survives deletion) → `workspace-deleted`; `workspaces.archived = 1` (adapter:219) → `workspace-archived`; the SSO callback already uses this same vocabulary (`dead-workspace` / `archived-workspace`, server.js:6863-6866).

**Primary recommendation:** Insert the GET and DELETE route blocks immediately after the POST sibling (after server.js:9010, before the dead-mappings route at :9012), copying the POST guard ladder verbatim; extend the test matrix in the `groups-config-api.test.mjs` pattern with a new dedicated file; add the constraint-backstop + static pg assertion as a small db-adapter test.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| GET list + name/hint resolution | API/Backend (server.js route) | — | Server is the sole authority for workspace names and dead-hints (MAP-01: "client never names workspaces by bare id") |
| DELETE + audit + lazy revocation | API/Backend | DB (same-tx audit row) | R-3: route never writes memberships/team_members; removal sync at next login is the only revocation path |
| Duplicate refusal parity | API/Backend + db-adapter | — | Pre-check SQL rides the facade; constraint backstop must recognize both dialect error shapes |
| GUID/role funnels | groups.js module | — | Existing `canonicalizeGuid`/`guidRefusal`/`roleTokenRefusal` — one door, one rule (Pitfall 1) |

## User Constraints (from CONTEXT.md — locked)

Copied from `101-CONTEXT.md` (D-01..D-14) — planner MUST honor:

- **D-01** unknown-id DELETE → uniform generic 404, no existence oracle.
- **D-02** GET = no throttle; DELETE = operator-keyed throttle consuming a try even on 403. *(Overrides MAP-01's "operator-keyed throttle" wording for GET.)*
- **D-03** colocate under `/api/governance/group-mappings` (GET collection, DELETE `/:id`) — NOT `/api/auth/operator/*`.
- **D-04** gate = `isInstanceAdmin` only, matching POST sibling verbatim.
- **D-05** hints = workspace state + live members via memberships `group:<guid>` provenance; NO audit_log scan in this route.
- **D-06** hints as structured fields: `dead: boolean`, `deadReason: 'workspace-archived' | 'workspace-deleted'`, `liveMembers: number`.
- **D-07** flat rows; existing `/api/auth/operator/dead-mappings` route stays untouched.
- **D-08** opaque row `id` (uid PK) for DELETE targeting; no canonicalization re-run on delete.
- **D-09** audit verb `group_mapping_deleted`, one audit_log row in the SAME tx as the delete (T-85-05 posture).
- **D-10** audit row carries GUID + workspace id + label.
- **D-11** actor = operator (`logSecurity(operator.id)` style), matching POST sibling.
- **D-12** no PATCH route.
- **D-13** boot-time `logWarn` stays as-is.
- **D-14** dialect parity: live SQLite test + static Postgres shape assertion (adapter inspection); no pg e2e.

**Agent's discretion:** GET ordering (`created_at DESC` recommended), pagination (unpaginated fine), internal query shape (single-route cheap), exact refusal-code wording **beyond existing keys** provided ×5 locales land same-commit.

**Deferred (out of scope):** PATCH route; per-mapping guard-refused trail; Graph group-name lookup; MCP mirror.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MAP-01 | GET list with server-resolved workspace names | Instance-roles GET join pattern (:9056-9062) + dead-mappings wsIds predicate (:9026-9028) |
| MAP-02 | DELETE by id, audited, lazy revocation | Same-tx audit pattern (:9118-9130); `tooMany` (:6370); D-01 uniform 404 |
| MAP-03 | Funnel hardening + dialect-parity duplicate refusal | POST funnels (:8974-8983); adapter `pgRewrite` (:120-146); UNIQUE error shape proven (db-adapter.test.mjs:327-331) |
| MAP-04 | Dead hints + liveMembers provenance join | Provenance vocabulary `group:<guid>` (adapter:226-227; server.js:6025, 6815-6828); archived flag (adapter:219) |

## Standard Stack

No new packages. Everything is in-repo: `node:sqlite` via the db facade (`db.get/all/run/tx`), `groups.js` funnels, house HTTP helpers `json`/`fail`/`clientIp`/`uid`/`now`/`logInfo`/`logWarn`/`logSecurity` (server.js:6099/6113/6172/6402). **Package Legitimacy Audit: not applicable — zero external packages installed by this phase.**

**No new i18n keys required** (verify at planning): DELETE/GET re-emit only existing keys — `crossOriginRejected`, `operatorOnly`, `tooManyAttempts`, `notFound`, `groupMappingDuplicate` (already ×5 locales: en/fr/de/es/nl at `src/locales/*.json:1821`). If the constraint-backstop reuses `groupMappingDuplicate` verbatim, the standing "×5 locales same commit" constraint is auto-satisfied by *not* touching locales.

## Architecture Patterns

### Route placement and ladder (copy verbatim)

```js
/* place directly after the POST block ends (server.js:9010), before the
   dead-mappings route (:9012) */

// GET — read route, NO throttle (D-02; instance-roles GET :9048 precedent)
if (pathname === '/api/governance/group-mappings' && method === 'GET') {
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const operator = await requireUser(req, res);
  if (!operator) return;
  if (!isInstanceAdmin(operator)) return fail(res, 403, 'operatorOnly', 'Only the instance operator can do that');
  const rows = await db.all(`
    select gm.id, gm.group_guid, gm.workspace_id, gm.role, gm.kind, gm.label,
           gm.created_at, gm.updated_at,
           w.name as workspace_name, w.slug as workspace_slug,
           w.id is not null as ws_exists, w.archived as ws_archived,
           (select count(*) from memberships mm
              where mm.workspace_id = gm.workspace_id
                and mm.provenance = 'group:' || gm.group_guid) as live_members
      from group_mappings gm
      left join workspaces w on w.id = gm.workspace_id
     order by gm.created_at desc`);
  return json(res, 200, { mappings: rows.map(r => ({
    id: r.id,
    groupGuid: r.group_guid,
    workspaceId: r.workspace_id,
    workspaceName: r.ws_exists ? r.workspace_name : null,   // dead row: no fake name
    workspaceSlug: r.ws_exists ? r.workspace_slug : null,
    role: r.role,
    kind: r.kind,
    label: r.label,                                          // opaque, client esc()s (T-83-07)
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    dead: !r.ws_exists || r.ws_archived === 1,
    deadReason: !r.ws_exists ? 'workspace-deleted' : (r.ws_archived === 1 ? 'workspace-archived' : null),
    liveMembers: r.live_members,
  })) });
}

// DELETE — mutation route: throttle BEFORE the gate (consumes a try even on 403)
const mappingIdMatch = pathname.match(/^\/api\/governance\/group-mappings\/([A-Za-z0-9_-]{1,64})$/);
if (mappingIdMatch && method === 'DELETE') {
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const operator = await requireUser(req, res);
  if (!operator) return;
  if (tooMany(`group-mapping-delete|${operator.id}`, 5, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
  if (!isInstanceAdmin(operator)) return fail(res, 403, 'operatorOnly', 'Only the instance operator can do that');
  const row = await db.get('select id, group_guid, workspace_id, role, kind, label from group_mappings where id = ?', [mappingIdMatch[1]]);
  if (!row) return fail(res, 404, 'notFound', 'Not found'); // D-01: uniform generic 404
  await db.tx(async () => {
    await db.run('delete from group_mappings where id = ?', [row.id]);
    await db.run(
      'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
      [uid(), operator.id, row.workspace_id, 'group_mapping_deleted', 0, clientIp(req), row.workspace_id,
       operator.name, operator.email, row.label || row.workspace_id,
       `group ${row.group_guid} → workspace ${row.workspace_id} (${row.role})${row.label ? ` "${row.label}"` : ''}`, now()],
    );
  });
  await logSecurity(operator.id, 'group_mapping_deleted');
  logInfo(`group mapping deleted: group ${row.group_guid} → workspace ${row.workspace_id} (${row.role})${row.label ? ` "${row.label}"` : ''} by ${operator.email}`);
  return json(res, 200, { deleted: true });
}
```

Anchor provenance for every fragment above:
- Guard ladder + explicit refusal codes at call site: POST sibling server.js:8962-8983.
- Throttle-before-gate (try consumed on 403): instance-roles POST server.js:9093-9100; `tooMany(key, max=10, windowMs=15min)` defined :6370-6380.
- Same-tx audit 12-column insert shape: server.js:9118-9130 (instance-roles grant) and :8848-8854 (workspace delete).
- `id` column regex `[A-Za-z0-9_-]{1,64}`: matches the family convention (e.g. :8880, :8899). uid PK values conform.
- `logSecurity(userId, verb)` :6402; `json` :6099; `fail(res, status, code, message)` :6113.

### Dialect-parity duplicate refusal (MAP-03, D-14)

Today's refusal is the pre-check (server.js:8982-8983) — a plain parameterized SELECT the adapter rewrites cleanly (`pgRewrite` only rewrites `collate nocase`, `?`→`$n`, and INSERT ON CONFLICT forms; db-adapter.mjs:120-146 — a SELECT with `=` and `||` concatenation passes through unchanged). The gap MAP-03 closes: a **race or any future write path bypassing the pre-check** surfaces a raw constraint error as a 500. Fix = wrap the POST insert in a backstop:

```js
try {
  await db.run('insert into group_mappings (…) values (…)', [...]);
} catch (err) {
  const dup =
    /UNIQUE constraint failed/.test(String(err.message)) ||   // SQLite (node:sqlite) — proven shape
    err?.code === '23505';                                     // Postgres unique_violation
  if (!dup) throw err;
  return fail(res, 400, 'groupMappingDuplicate', 'That group is already mapped to this workspace');
}
```

SQLite message shape is proven in-repo: test/db-adapter.test.mjs:327-331 asserts `assert.throws(…, /UNIQUE constraint failed/)` against `group_mappings_pair`. The pg shape (`code: '23505'`, `constraint: 'group_mappings_pair'` on `err` from node-postgres) is `[ASSUMED]` training knowledge of node-postgres — **asserted statically per D-14, never executed**: the static test pins the *code path*, not the pg runtime.

**Static pg assertion test (D-14, new, in `test/db-adapter.test.mjs` next to the existing group_mappings DDL test at :307):**
1. `adapter.pgSchemaVariant()` contains `create unique index if not exists group_mappings_pair on group_mappings(group_guid, workspace_id)` (mirror of groups-core.test.mjs:79-83 which pins both SCHEMA sources).
2. `adapter.toPgSql(...)` of the pre-check SQL and the POST/DELETE SQL strings leaves no `?` placeholders and introduces no `on conflict` clause for plain SELECT/DELETE (pattern: db-adapter.test.mjs toPgSql/sqliteOnly tests around :221-228 and the pg-unsafe offender scan at :443).

### liveMembers provenance join (MAP-04, D-05)

Membership origin vocabulary is `provenance = 'group:<guid>' | 'invite' | 'manual' | null(legacy)` — `[VERIFIED: db-adapter.mjs:226-227]`, quoted verbatim: `/* Phase 81 (D-81-6): membership origin — group:<guid> | invite | manual | null(legacy). */`. The count in the GET uses an **exact-equality** correlated subquery (`provenance = 'group:' || gm.group_guid`), not a `like 'group:%'` — the GUID is the driving group's, matching the callback's selection discipline ("Selection key is provenance itself (`group:<guid>` parsed from the stored row)", server.js:6786-6788; the driving group stamps `group:<guid>` at :6885-6900). `||` concatenation is valid in both SQLite and Postgres; `pgRewrite` leaves it untouched.

`deadReason` distinction evidence: workspace deletion is a row purge (`delete from workspaces where id = ?`, server.js:8845) while `group_mappings.workspace_id` has **no cascade** (D-82-6, server.js:794 comment; test at groups-config-api.test.mjs:180-218 proves the mapping row survives deletion), so "missing row" = deleted. Archive is a flag flip (`update workspaces set archived = ?`, server.js:8721; column `archived integer not null default 0`, adapter:219). The SSO callback already encodes the same two states as `dead-workspace` / `archived-workspace` (server.js:6863-6866) — use the D-06 spellings (`workspace-deleted` / `workspace-archived`).

### Recommended Project Structure

No new files except tests. server.js grows two route blocks; db-adapter.test.mjs grows one static-parity test; one new API test file.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GUID validation/canonicalization | fresh regex in route | `groups.js` canonicalizeGuid (:34) / guidRefusal (:54) | paste-variant collapse + existing test-lock (Pitfall 1) |
| Role validation | inline array check on delete path | none needed — DELETE re-validates nothing (D-08) | stored role already CHECK-constrained |
| Throttle | custom counter | `tooMany` (server.js:6370) | map-eviction + window semantics already pinned |
| Audit write | separate fire-and-forget | same-`db.tx` audit insert | T-85-05: forced audit failure rolls the mutation back |
| Workspace liveness | boot snapshot / cache | plain LEFT JOIN per request | dead-mappings route derives on read per D-09 (:9019-9028) |

## Common Pitfalls

### Pitfall 1: throttle-after-gate ordering on DELETE
**What goes wrong:** placing `tooMany` after `isInstanceAdmin` lets non-operators spray without cost. **Why:** the family contract is "every attempt — including 403 refusals — consumes a try" (T-85-04, server.js:9096-9098). **Avoid:** copy the instance-roles POST order exactly: sameOrigin → requireUser → tooMany → isInstanceAdmin. **Warning sign:** a test where a non-operator's 6th request still returns 403 instead of 429.

### Pitfall 2: route-order shadowing
**What goes wrong:** the POST check is `pathname === '/api/governance/group-mappings' && method === 'POST'` — exact match, so a GET at the same path is safe to add anywhere; but the DELETE regex `/^\/api\/governance\/group-mappings\/([A-Za-z0-9_-]{1,64})$/` must not be swallowed by any earlier prefix route. **Avoid:** insert both new blocks adjacent to the POST (:9010) and run the full test suite; the family's 404 fallthrough for unmatched paths already behaves as D-01 requires for unknown non-id paths.

### Pitfall 3: `like 'group:%'` in the liveMembers count
**What goes wrong:** a prefix-LIKE counts members derived from *any* group, inflating `liveMembers` when two mappings target one workspace. **Avoid:** exact `provenance = 'group:' || gm.group_guid` (see Architecture Patterns). **Warning sign:** test seeding two guids into one workspace shows a count > 1 for each row.

### Pitfall 4: exposing `workspaceName` for dead rows
**What goes wrong:** LEFT JOIN yields `null` name for a deleted workspace — a client rendering `null` invites "undefined" UI; but inventing a placeholder server-side hides the dead state. **Avoid:** return `null` name + `dead/deadReason` (D-06 makes the server dumb data; Phase 102 renders).

### Pitfall 5: touching memberships/team_members in DELETE
**What goes wrong:** immediate revocation breaks R-3 and re-introduces the last-owner race the callback already guards. **Avoid:** the DELETE tx contains exactly two statements (delete + audit insert). **Warning sign:** test asserting `memberships` row count is byte-identical before/after DELETE.

### Pitfall 6: the trail LIKE false-positive (WR-83-03)
**Verdict stated explicitly:** **SAFE — `group_mapping_deleted` does NOT match.** The pattern at server.js:9033 is verbatim: `select action, workspace_id, created_at from audit_log where action like 'group\_%:group:%' escape '\' order by created_at desc limit 100`. It requires the literal sequence `group_` followed by `:group:` anywhere after. `group_mapping_deleted` and `group_mapping_saved` contain no `:group:` substring; only the encoded guard/loss rows (`group_<delta>:group:<guid>:<reason>`, :6811/:6851) match. A regression test should pin this (see Test Plan T6).

## Runtime State Inventory

Not a rename/refactor/migration phase — **skipped** (no schema change, no string rename; the only runtime state touched is rows in existing tables via existing routes).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node >= 24 (`node:sqlite`) | all tests | ✓ | repo standard (verify `node --version` at plan time) | — |
| test harness `test/helpers/server.mjs` (`startServer`, `client`, `login`, `signup`, `withDb`, `ADMIN`) | API tests | ✓ | — | — |

No external services needed. pg e2e explicitly excluded (D-14).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node --test` (node:test), in-repo suites under `test/*.test.mjs` |
| Config file | none — convention-based |
| Quick run command | `node --test test/group-mappings-api.test.mjs test/db-adapter.test.mjs` |
| Full suite command | `node --test test/` (or the repo's default npm test entry — verify at plan time) |

### Test file landscape (closest analogs, named exactly)
| File | What it pins | Reuse for |
|------|--------------|-----------|
| `test/groups-config-api.test.mjs` | the POST sibling: gate order (:33-89), 4 keyed refusals incl. duplicate via braced paste (:93-124), success path (:128-149), dead-row survival + boot warn (:180-218) | the phase's primary harness pattern; extend or model the new file on it |
| `test/instance-roles-api.test.mjs` | throttled mutation gate tests, audited grant tx | DELETE gate/throttle/audit tests |
| `test/governance-rename.test.mjs` | dead-mappings GET: `insertMapping`/`insertTrail` fixtures (:203-219), orphan adjacency probe, trail raw-string return | GET hint tests + WR-83-03 trail test |
| `test/db-adapter.test.mjs` | in-memory DDL proof incl. UNIQUE throw shape (:307-339); pgSchemaVariant static assertions (:272-303); toPgSql/sqliteOnly patterns (:221-228, :443) | D-14 static pg parity test |
| `test/groups-core.test.mjs` | funnel unit tests (:62), SCHEMA mirror pin (:79-83) | funnel regression (already covers; no changes needed) |
| `test/i18n-core-features.test.mjs` | locale key-parity ledger (one line per phase addition) | only if any new key is introduced (expected: none) |

### Phase Requirements → Test Map (proposed new file: `test/group-mappings-api.test.mjs`)

| Req | Behavior | Test | File / count |
|-----|----------|------|--------------|
| T1 | GET gates: 401 anon / 403 cross-origin / 403 operatorOnly regardless of DB state (no oracle) | 3 e2e tests | group-mappings-api.test.mjs (pattern: groups-config-api :33-89) |
| T2 | GET success: flat rows, canonical GUID, workspace name resolved server-side, `created_at desc` ordering | 1-2 e2e tests | group-mappings-api.test.mjs (join pattern :9056-9062) |
| T3 | GET hints: archived ws → `dead:true, deadReason:'workspace-archived'`; missing ws → `'workspace-deleted'`; live ws → `dead:false, deadReason:null`; `liveMembers` exact per-guid count; two-guid adjacency (Pitfall 3) | 2-3 e2e tests, seeding via `withDb` (governance-rename `insertMapping` fixture) | group-mappings-api.test.mjs |
| T4 | DELETE gates: throttle-before-gate (non-operator 403 consumes a try → 6th → 429), unknown id → uniform `404 notFound` for operators (D-01) | 2-3 e2e tests | group-mappings-api.test.mjs (pattern: instance-roles-api) |
| T5 | DELETE success: row gone, exactly one `group_mapping_deleted` audit_log row, logInfo emitted, **memberships/team_members counts unchanged** (R-3 lazy revocation), 200 `{deleted:true}` | 2 e2e tests | group-mappings-api.test.mjs |
| T6 | WR-83-03 pin: insert audit rows `group_mapping_saved` + `group_mapping_deleted` + one encoded `group_membership_removed:group:<guid>:lost-claim` → dead-mappings trail returns ONLY the encoded row | 1 e2e test | group-mappings-api.test.mjs (fixture: governance-rename `insertTrail`) |
| T7 | Constraint backstop (live SQLite, D-14): duplicate POST still returns keyed `groupMappingDuplicate` (existing :113-117 regression stays green) + a forced-constraint path (e.g. calling the insert helper with a racing pre-check bypassed, or a direct unit on the catch classifier) refuses keyed, never 500 | 1-2 tests | group-mappings-api.test.mjs + db-adapter.test.mjs |
| T8 | Static pg shape (D-14): pgSchemaVariant carries `group_mappings_pair`; toPgSql of the new SQL is placeholder-complete; no new `on conflict` drift | 1 static test | db-adapter.test.mjs (patterns :272-303, :443) |

Estimated: ~12-15 new test cases, 2 files touched + 1 new file. `test/groups-core.test.mjs` and boot-warn tests (:180-218) already lock untouched behavior — regression only.

### Sampling Rate
- Per task commit: the new file + db-adapter file.
- Phase gate: full `node --test` suite green before `/gsd-verify-work`.

### Wave 0 Gaps
None — test infrastructure fully exists (harness, fixtures, DDL patterns). Only the new test file itself.

## Security Domain

ASVS V4 Access Control (operator gate — `isInstanceAdmin`, copy :8968), V5 Input Validation (groups.js funnels + id regex), V7 Logging (same-tx audit + logSecurity + logInfo). Threat patterns relevant: existence oracle (D-01 mitigates), CSRF (sameOrigin-first, :8962), label stored-XSS (server returns raw `label`; escaping is Phase 102's esc() discipline, T-83-07/T-80-07 — keep payload raw per D-06 dumb-data posture). No crypto, no session, no auth changes. Vite never bundles groups.js (module comment :4-5) — unchanged.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | pg unique-violation surfaces as `err.code === '23505'` (node-postgres) | Dialect-parity | backstop misses pg 500s — caught by static test failing loudly? No: static test pins code path, not runtime. Mitigation: classifier checks BOTH message regex and code; pg messages also contain "duplicate key value violates unique constraint" which the SQLite regex can be widened to match |
| A2 | `node --test test/` is the repo's full-suite command | Validation | planner should verify package.json test script at plan time |
| A3 | Audit `target_id`/`target_name` column choice (workspace_id / label-or-wsId) | DELETE code | cosmetic — D-10 requires GUID+wsId+label present, which they are in the message column; planner may adjust columns freely |

## Open Questions

1. **Backstop test mechanics (T7):** the pre-check makes the constraint path hard to hit e2e. Recommend testing the classifier as a small unit (export or inline function) + keeping the existing e2e duplicate regression. If the planner prefers e2e-only, drop the unit and rely on T8 statics — D-14 permits either reading ("live SQLite test exercises the keyed refusal for real" = the existing :113-117 test already satisfies this).
2. **GET `workspaceSlug` inclusion** — not in D-06's field list; included above as it costs one column and helps Phase 102 linking. Confirm at discuss/plan whether to keep or trim.

## Sources

Primary (all read this session): server.js :600-824 (DDL), :6370-6402 (throttle/logSecurity), :6780-6869 (provenance vocabulary + dead-workspace skip), :8780-9035 (POST sibling, dead-mappings route, guard funnels), :9040-9130 (instance-roles GET/POST); groups.js :22-140; db-adapter.mjs :120-146, :153-229, :394-405, :600-675; test/groups-config-api.test.mjs, test/instance-roles-api.test.mjs, test/governance-rename.test.mjs, test/db-adapter.test.mjs, test/groups-core.test.mjs; .planning/REQUIREMENTS.md MAP-01..04; .planning/research/PITFALLS.md.

**Confidence breakdown:** route patterns / anchors HIGH (read directly); dialect error shapes: SQLite HIGH (test-proven), pg MEDIUM→A1; test landscape HIGH (files listed and read).

**Research date:** 2026-11-27. **Valid until:** ~2026-12-27 (stable in-repo seams).
