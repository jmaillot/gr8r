# Phase 24: Operator Audit & Workspace-Admin Tier - Context

**Gathered:** 2026-10-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Every privileged session revocation — instance-operator and the new workspace-admin
tier — writes an append-only audit row in the SAME transaction as the revocation.
A workspace admin gains the ability to revoke the sessions of members of their own
workspace (strictly below their own tier, owner immunity and self-exclusion kept).
Owners see the operator/admin action trail in the app, filtered by machine verbs,
with rows that survive target-user deletion. No route can edit or delete an audit
row. Delivers AUD-01, AUD-02, AUD-03.

</domain>

<decisions>
## Implementation Decisions

### Audit storage model
- **D-A1:** New dedicated `audit_log` table — `security_log` stays untouched (it keeps
  its `user_id … on delete cascade` for 2FA events; that cascade is exactly what
  AUD-03 forbids for audit rows).
- **D-A2:** Schema: id, actor_id, target_id, action verb, session_count, ip,
  workspace_id, created_at. actor_id/target_id are TEXT with **NO foreign keys** —
  rows survive user deletion and no cascade can ever touch them. — **Reversibility:**
  one-way — removing the no-FK choice after rows exist requires a data migration and
  redefines what deleted-user rows mean.
- **D-A3:** Name snapshots at insert: actor_name, actor_email, target_name,
  target_email snapshot columns written on every insert. The trail view renders
  straight from the row — no joins, deleted users always readable.
- **D-A4:** Append-only enforced in-app: no UPDATE/DELETE statement is ever written
  against audit_log anywhere in the code, plus a test asserting no route can mutate
  audit rows (criterion 5). No SQLite triggers.
- **D-A5:** `logSecurity()` and the existing `sessions_revoked_by_operator` verb in
  security_log stay as-is; the operator revoke route additionally writes the new
  audit row in the same transaction. Dual-write for that route (security_log keeps
  firing, audit_log added).

### Admin revocation route
- **D-R1:** Route: `POST /api/w/:slug/members/:id/revoke-sessions` — workspace-scoped,
  gated server-side via the existing `resolveWorkspace(minRole:'admin')` pattern
  (server.js:1502).
- **D-R2:** Target tier: strictly below admin — a workspace admin may revoke
  members/viewers of their own workspace only; peer admins and owners are
  untouchable. Owner immunity and self-exclusion ride the same D-118/D-119 semantics
  as the operator route.
- **D-R3:** Same-transaction guarantee via explicit `BEGIN` / `COMMIT` with
  `ROLLBACK` on error wrapping DELETE + audit INSERT — applied to BOTH the new admin
  route AND the existing operator route (criterion 3). A failed/interrupted
  revocation leaves no audit row and no revoked sessions.
- **D-R4:** Hardening mirrors the operator route (server.js:2062-2090): sameOrigin
  first (Pitfall 22), throttle keyed on the caller, request IP captured from the
  same source the sessions table already uses, keep-current self-exclusion in the
  single DELETE statement (P-H), audit verb written on success only (D-117).

### Owner trail view
- **D-V1:** A new owner-only section on the existing Settings page (beside the
  operator card, src/pages/settings.js:523), fetched via the same server-ground-truth
  pattern the operator card uses (403 for non-owners).
- **D-V2:** Filtering is verb-only (All / operator revoke / workspace-admin revoke) —
  no text search.
- **D-V3:** Server-paginated, latest-first, with a load-more control (order of 100
  rows per page).
- **D-V4:** Each entry renders the full row from snapshot columns: actor name,
  target name, verb (machine verb + human label), session count, IP, workspace name,
  timestamp.

### Verb taxonomy & scope
- **D-T1:** Two fixed machine verbs: `sessions_revoked_by_operator` and
  `sessions_revoked_by_workspace_admin`; the workspace_id column distinguishes which
  workspace for admin-tier rows.
- **D-T2:** Only the two revocation actions write audit rows this phase. No backfill
  of legacy security_log history (pre-phase operator revokes live only in
  security_log / nowhere).
- **D-T3:** Tiered read visibility: instance operators see all audit rows; workspace
  admins see only rows for their own workspace (admin-tier rows). Operator-level
  rows (workspace_id null) are visible to instance operators alone.

### the agent's Discretion
The user delegated these to the researcher/planner (lean guidance recorded):
- Exact throttle limits for the admin route — lean: mirror the operator route's
  5/15min unless the planner sees a reason to differ.
- i18n strings for the trail view and revoke confirmations — follow the existing
  EN+FR catalogue gates.
- Error copy for admin-revoke refusals (ownerImmune, adminOnly, self-exclusion) —
  mirror operator-route error codes where possible.
- Zero-row delete semantics — D-117 already fixed: success-only verb, no audit row
  when nothing was revoked.
- Pagination cursor details (offset vs before-cursor) — agent decides.
- How workspace_id is rendered in the trail when the workspace itself is deleted —
  agent decides (workspace_id has no FK either; a name snapshot is optional).

### Reversibility summary
- D-A1/D-A5: reversible (additive table and additive write).
- D-A2: **one-way** (see rationale above).
- D-A3/D-A4: reversible-to-costly (schema columns are additive; snapshot presence
  becomes a data contract once rows exist).
- D-R1/D-R2/D-R4: reversible (local route-level code).
- D-R3: reversible (transaction wrapper; removes a latent crash window).
- D-V1…D-V4, D-T1…D-T3: reversible.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` §AUD-01…AUD-03 — full requirement wording
- `.planning/ROADMAP.md` §Phase 24 — goal and 5 success criteria
- `.planning/PROJECT.md` §Milestone v1.5 + v1.4 summary — operator revocation (OPREV-01/02) shipped in v1.4

### Code (established contracts to build on)
- `server.js:2062-2090` — operator revoke route (D-112…D-121 semantics to mirror)
- `server.js:1554-1556` — `logSecurity()` (stays as-is; audit_log write is additive)
- `server.js:163-169` — security_log schema (the cascade that audit_log must NOT have)
- `server.js:83-84` — ROLE_RANK/ROLE_LABEL (tier comparisons for admin-route gating)
- `server.js:1502-1513` — `resolveWorkspace(minRole)` gating pattern for the new route
- `server.js:1057` — operator boot stamp context (D-113/D-114)
- `src/pages/settings.js:523` — operator card mount point (trail section goes beside it)
- `src/actions/actions.js:1938-1976` — operator users fetch/revoke actions (pattern for admin actions)

No external specs/ADRs — requirements fully captured in REQUIREMENTS.md and decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Operator revoke route (server.js:2062) — the template D-R1/D-R4 mirror for the admin route
- `resolveWorkspace(minRole)` (server.js:1502) — workspace-admin gate for D-R1
- Operator card + fetch pattern (src/pages/settings.js, src/actions/actions.js:1938) — pattern for the trail section
- sessions table ip/last_seen_at capture — source for audit IP field (D-R4)

### Established Patterns
- node:sqlite manual transactions are NOT yet used anywhere — D-R3 introduces
  BEGIN/COMMIT; node:sqlite supports it; planner should wrap both routes
- Decision-numbering convention (D-1xx) continues from prior phases
- SameOrigin-first ordering (Pitfall 22), success-only audit verbs (D-117),
  keep-current single-statement delete (P-H) — all carried into the new route
- node:test suites, Chromium e2e EN+FR, i18n catalogue gates

### Integration Points
- SCHEMA string in server.js — where the audit_log table + indexes are declared
  (no ensureColumn needed; new table)
- Operator revoke route — gains BEGIN/COMMIT + audit_log write (D-A5, D-R3)
- Settings page operator card area — gains the owner trail section (D-V1)
- Route table in server.js — gains `/api/w/:slug/members/:id/revoke-sessions`
  (mind the existing `/w/:slug/file/:id` vs SPA-fallback ordering)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 24-Operator Audit & Workspace-Admin Tier*
*Context gathered: 2026-10-31*
