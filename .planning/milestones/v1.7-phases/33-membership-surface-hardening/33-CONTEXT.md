# Phase 33: Membership-Surface Hardening - Context

**Gathered:** 2026-11-02
**Status:** Ready for planning

<domain>
## Phase Boundary

The invite-accept surface meets the v1.1-audit discipline the rest of the API already
follows (HARD-01..05): sameOrigin-guarded POST (guard before throttle/body read), admin
role impossible through the link-only invite path, no `firstWorkspace()` fallback on the
accept route or its SSO-reconcile twin (both in one commit; seed-boot call site
untouched), spoof-proof accept body whitelist, and first-value proxy-header discipline
shared by `sameOrigin()` and the other readers. No new capabilities — hardening of
existing routes only.
</domain>

<decisions>
## Implementation Decisions

### Admin link-only invite mechanism (HARD-02)
- **D-01:** Defense in depth — the admin-via-link-only block lives at BOTH ends: the
  invite-creation route rejects with 400 when role is admin/owner AND email is null, AND
  the accept route refuses to grant an admin role from an email-less invite row. Both
  enforcement points are test-pinned.
- **D-02:** Existing admin link-only invites already in the database are neutralized by a
  boot-time sweep (next to the existing expired-invite cleanup) that marks them
  used_at = now. No schema change, no migration — additive migrations stay reserved for
  Phase 34's byte-identical-second-boot burden.

### SSO twin failure semantics (HARD-03)
- **D-03:** The SSO-reconcile twin (server.js:2842) stops silently skipping a missing
  workspace: it resolves the workspace explicitly; if the row is gone it CONSUMES the
  invite (used_at = now, never retried) and continues the login through the generic
  error landing. No silent skip, no cross-tenant join.
- **D-04:** The failed reconcile reports through the existing one-generic `ssoError`
  surface (Phase-30 decision) — no new error code. — **Reversibility:** reversible —
  reusing the existing surface adds no contract; a distinct code could be added later.
- **D-05:** The accept route's failure is already locked: resolve first, missing row ⇒
  `410 workspaceGone` (never `firstWorkspace()`). Both twins change in ONE commit
  (roadmap-locked); the read-path `firstWorkspace()` uses (:2235) and the seed-boot call
  site (:1716) are untouched.

### Body whitelist strictness (HARD-04)
- **D-06:** Silent whitelist — the accept route destructures exactly
  `{name, email, password}` and discards everything else. Unknown fields are NOT
  rejected with 400 (avoids breaking future client fields and a schema probe).
  The spoof test pins that smuggled keys (role, teams, scope, name-on-session-accept)
  never influence the acceptance outcome.

### Proxy-header unification (HARD-05)
- **D-07:** A small shared `firstForwardedValue(header)` helper implements the
  first-value discipline and is consumed by `proto()` (:2427), `clientIp()` (:2454) and
  `sameOrigin()` (:2461 — today it reads `x-forwarded-host` raw, without splitting on
  commas). One definition, one place to test.

### Guard ordering (HARD-01) — settled without discussion
- **D-08:** The accept route adopts the house Pitfall-22 order already pinned at
  :3471/:4162: sameOrigin FIRST, before any body read or throttle (the route today
  throttles at :4387 before any guard).

### the agent's Discretion
- Exact helper naming/signature (`firstForwardedValue` is a suggestion).
- Which smuggled keys the spoof test enumerates (role/teams/scope minimum).
- Test file placement (existing server/auth test files vs a new hardening file).
- Exact boot-sweep placement and wording of its log line.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & requirements
- `.planning/ROADMAP.md` §Phase 33 — Goal, Success Criteria 1-5 (guard order, admin block,
  twin fail-closed, spoof pin, multi-value header pin)
- `.planning/REQUIREMENTS.md` §HARD — HARD-01..HARD-05 requirement text
- `.planning/PROJECT.md` §Current Milestone v1.7 — HARD feature summary and constraints

### Prior-phase decisions (binding)
- `.planning/STATE.md` §Accumulated Context — Phase-30 SSO decisions (one-generic
  `ssoError` surface, fail-closed discipline) that D-04 builds on
- `.planning/milestones/v1.6-phases/` — Phase 30 SSO record (ssoError surface) and
  Phase 29 scope record (invite-carried scope, SCOPE-05: accept writes only admin-validated
  values)

### Milestone-wide invariants
- `.planning/STATE.md` §v1.7 Phase Order — zero runtime dependencies, additive migrations
  only, full-suite green (803-test baseline), EN+FR i18n gate, 404 no-oracle

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `sameOrigin(req)` (server.js:2458) — the ~35-route guard to adopt on the accept route
- `proto()` / `clientIp()` (server.js:2427, :2454) — already split multi-value headers;
  the pattern `firstForwardedValue` generalizes
- Invite-creation route (server.js:~4260-4313) — role validation + `emails: [null]`
  link-only branch where the D-01 creation-side rejection lands
- Boot-time expired-invite cleanup (`delete from invites where expires_at < ?`) — home
  for the D-02 legacy-row sweep
- `fail(res, 410, 'workspaceGone', ...)` — existing body already used by the accept route

### Established Patterns
- Pitfall-22 order: sameOrigin → requireUser → tier gate → throttle, before any body read
- Fail-closed SSO: generic `ssoError` only, no-oracle bodies, no parallel membership
  inserts (T-30-11: the twin reuses the accept "recipe verbatim")
- SCOPE-05: acceptance writes only admin-validated values from the invite row, never
  client-controlled ones
- One generic SSO error surface (Phase 30)

### Integration Points
- Accept route (server.js:4385-4475): guard order (:4387), body read (:4396),
  `firstWorkspace()` fallback (:4423), membership grant (:4425-4447)
- SSO-reconcile twin (server.js:2832-2870): fallback (:2842), silent skip (`if (ws)`,
  :2843), invite-clearing writes (:2868-2869)
- Seed-boot call site (server.js:1716) — must remain untouched
- Read-path `firstWorkspace()` use (server.js:2235) — out of scope, untouched

</code_context>

<specifics>
## Specific Ideas

- Defense in depth was the deciding factor for HARD-02: creation-side rejection stops bad
  rows from being minted; accept-side refusal makes any that exist harmless.
- The SSO twin's current silent skip is the exact "misleading silence" the audit flagged —
  consuming the dead invite prevents a zombie link that can never work.
- Silent (not rejecting) whitelist: unknown fields are ignored so future client changes
  never break old accept pages, and attackers get no schema probe.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.
</deferred>

---

*Phase: 33-Membership-Surface Hardening*
*Context gathered: 2026-11-02*
