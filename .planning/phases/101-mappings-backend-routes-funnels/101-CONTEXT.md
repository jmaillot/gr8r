# Phase 101: Mappings Backend — Routes & Funnels - Context

**Gathered:** 2026-11-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Server-side operator routes for listing and deleting Entra group → workspace mappings, riding the existing v3.2 `group_mappings` table (server.js:800) and groups.js funnels — **before any UI exists to bypass them**. Deliverables: one GET list route with server-resolved workspace names + structured dead-mapping hints, one DELETE route (audited, lazy-revocation-only), hardened POST funnels (dialect-parity duplicate refusal), and the test matrix proving all of it. NO UI, NO schema change, NO Graph, NO instance-role mappings, NO membership writes.

</domain>

<decisions>
## Implementation Decisions

### Route gates & throttle shape
- **D-01:** Unknown mapping id on DELETE → **uniform generic 404** for everyone (no existence oracle). Non-operators can never probe which mapping ids exist. — **Reversibility:** reversible — a status-code change is one line per branch.
- **D-02:** Throttle split: **GET list = no throttle** (read-route precedent: dead-mappings GET server.js:9012, instance-roles GET); **DELETE = operator-keyed throttle** consuming a try even on 403 (mutation-family precedent: grant/revoke).
- **D-03:** Routes colocate with the existing POST under **`/api/governance/group-mappings`** (GET on the collection path, DELETE on `/api/governance/group-mappings/:id`) — one family, one guard-ladder copy, not the `/api/auth/operator/*` family.
- **D-04:** Operator gate = **`isInstanceAdmin` only** — exactly matches the POST sibling (same family, same gate, same operatorOnly error). Backup/Restore Operators excluded: mappings are SSO identity config, not backup ops.

### Dead-mapping hints (MAP-04)
- **D-05:** Hint depth = **workspace state + live members**: the GET joins rows against workspaces (archived/deleted → dead flag) and LEFT JOINs memberships' `group:<guid>` provenance to count live group-derived members per mapping. No audit_log scan in this route.
- **D-06:** Hints ride as **structured fields** per row — `dead: boolean`, `deadReason: 'workspace-archived' | 'workspace-deleted'`, `liveMembers: number` — server stays dumb data; the Phase 102 UI decides rendering.

### List payload shape
- **D-07:** **Flat rows, coexist**: the new GET returns a flat mappings array; the dead-mappings card data (orphans + guard-refused trail) keeps coming from its existing `/api/auth/operator/dead-mappings` route, which stays untouched. The Phase 102 page consumes both sources.
- **D-08:** **Opaque row id** identifies a mapping: the GET payload exposes each row's `id` (uid PK) and DELETE targets that id. GUID+workspace pair stays identity-of-record; canonicalization is not re-run for delete targeting.

### Delete audit details
- **D-09:** Audit verb **`group_mapping_deleted`** — mirrors the POST's existing `group_mapping_saved`; one audit_log row written in the SAME tx as the delete (forced audit failure rolls the mutation back — T-85-05 posture).
- **D-10:** Audit row carries **GUID + workspace id + label** (mirrors `group_mapping_saved`'s logInfo content). No member PII involved — mapping config is not user data; the D-81-10 PII ban applies to group-sync member rows, not config rows.
- **D-11:** Actor attribution = **operator actor, mapping target** — `logSecurity(operator.id)` style, matching the POST sibling. NOT the group-sync self-style (actor=target) row: this is a config action, not a member action.

### Edit path
- **D-12:** **No PATCH route.** Role/label change = delete + recreate, chained by the Phase 102 UI. Two audit rows and a reset `created_at` are accepted costs; zero new routes and the unique index never fights an in-place update. — **Reversibility:** reversible — adding PATCH later is additive.

### Boot warn & parity tests
- **D-13:** Boot-time dead-mapping `logWarn` stays **as-is** (plain wsIds predicate, log-only). The structured hints live in the GET route only — boot warns for server logs, hints are for the UI; no shared helper carrying unused weight.
- **D-14:** Dialect parity proof: **live SQLite test** exercises the keyed `groupMappingDuplicate` refusal for real; the **Postgres shape is asserted statically** (adapter inspection — same pattern as the dual-engine DDL tests). No pg e2e for one refusal path.

### the agent's Discretion
- GET list ordering (planner: `created_at DESC` is the obvious default) and any pagination decision (unpaginated is fine at expected scale — governance page assumption).
- Exact refusal-code wording beyond the existing keys, provided ×5 locales land same-commit.
- Internal query shape (joins vs N+1) as long as it stays single-route cheap.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### House patterns to copy verbatim
- `server.js` POST `/api/governance/group-mappings` (:8786 region) — the sibling route: guard ladder, canonicalizeGuid/guidRefusal/roleTokenRefusal funnel, duplicate pre-check, `group_mapping_saved` audit + logInfo
- `server.js` GET `/api/auth/operator/dead-mappings` (:9012 region) — the coexisting route this phase must NOT break; its orphans predicate and trail LIKE
- `server.js` GET `/api/auth/operator/instance-roles` (:9053 region) — the no-throttle read-route + server-side name resolution precedent (D-33 granter resolution ≈ our workspace-name resolution)
- `groups.js` — `canonicalizeGuid` (:34), `guidRefusal` (:54), `roleTokenRefusal` (:64), `resolve` (:122): the funnels every write passes through
- `server.js` group_mappings DDL (:800) — table + unique index `group_mappings_pair`; NO schema change

### Milestone docs
- `.planning/REQUIREMENTS.md` — MAP-01..04 verbatim text + owner rulings R-1..R-5 (R-3 lazy revocation governs DELETE semantics)
- `.planning/research/SUMMARY.md` + `.planning/research/PITFALLS.md` — GUID-bypass, existence-oracle, label-XSS pitfalls and the phase mapping
- `.planning/phases/101-mappings-backend-routes-funnels/101-CONTEXT.md` — this file

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `canonicalizeGuid`/`guidRefusal`/`roleTokenRefusal` (groups.js) — paste-variant collapse and role validation, already test-locked
- `isInstanceAdmin` (server.js:6268) + the D-05/T-80-04 guard ladder (sameOrigin → requireUser → gate before lookup) — copy verbatim from the POST sibling
- `logSecurity` / audit_log insert pattern — same-tx audit writes proven by the instance-roles family (T-85-05)
- Dead-mappings route's `wsIds` set build — the exact predicate shape the GET's `dead` flag needs (join against workspaces instead)

### Established Patterns
- Read routes: no throttle, sameOrigin → requireUser → operator gate (instance-roles GET precedent)
- Mutations: operator-keyed throttle + one db.tx for write + audit (grant/revoke precedent)
- Keyed refusals ×5 locales in the same commit as the first emitting gate (standing constraint)
- `kind: 'workspace'` discipline — mappings table carries an `operator` kind reserved for future use; this phase creates/consumes only `workspace`

### Integration Points
- New GET + DELETE sit adjacent to POST (:8786 region) in server.js
- Phase 102 SPA consumes: GET rows (with structured hints), the existing dead-mappings route, and the operator workspaces listing (workspace picker)
- The SSO callback reconcile (server.js:6597 region) is untouched — DELETE never writes memberships; removal sync reads mappings at next login

</code_context>

<specifics>
## Specific Ideas

- Delete copy contract (for 102, but wording locked here): "members will lose access at their next Microsoft sign-in" — lazy revocation stated verbatim.
- `group_mapping_deleted` audit action joins the `group_` prefix family — the dead-mappings trail LIKE (`group\_%:group:%`) must NOT match it (it's `group_mapping_deleted`, no second colon-group segment — verify the escape pattern doesn't over-match, WR-83-03).
- No existence oracle: unknown-id DELETE and unknown-path behave identically to the operator; non-operators get the family's uniform posture.

</specifics>

<deferred>
## Deferred Ideas

- PATCH route for in-place role/label edit (D-12 ruled delete+recreate for now; PATCH is additive later if the two-audit-rows cost ever annoys).
- Guard-refused trail per mapping row in the GET (D-05 scoped it out — audit_log scans stay in the dead-mappings route).
- Graph group-name lookup seam (Option A/C) — milestone-level exclusion (R-1), revisit as its own feature.
- MCP server mirror of mappings CRUD — flagged by research, owner to decide when the MCP surface needs it.

</deferred>

---

*Phase: 101-Mappings Backend — Routes & Funnels*
*Context gathered: 2026-11-27*
