---
phase: 81-group-grant-path-callback-wiring-provenance
discussed: 2026-11-20
status: decided
---

# Phase 81 Context: Group Grant Path — Callback Wiring + Provenance

<domain>
The Phase 80 resolver becomes live at SSO login: the OIDC callback consumes
`resolveGroupsClaim` + `resolve()` to grant workspace memberships (highest-role
wins, upgrade-only over existing rows) and instance-operator rights — grants
only, nothing is ever removed. A new `memberships.provenance` column records
why every membership row exists. Unmapped users behave byte-identically to
today. No UI in this phase; no removal-sync (Phase 82).
</domain>

<spec_lock>
None — no SPEC.md for this phase.
</spec_lock>

<decisions>

## Group×invite precedence (GW-03 made concrete)

- **D-81-1: Provenance-filtered DP-5 guard.** Groups run first (GW-03 literal:
  after DP-4, before DP-5). The invite-reconcile zero-memberships guard
  (server.js:5249) counts only NON-group memberships:
  `select 1 from memberships where user_id = ? and (provenance is null or provenance not like 'group:%')`.
  Unmapped users keep byte-identical behavior (their rows carry no group
  provenance → guard unchanged). Invites always reconcile.
- Same-workspace collision semantics follow from D-81-2 + D-81-3: invite role
  lands at this login if higher; group re-asserts at next login if higher.
  Lowest-ranked view: the row carries whichever role won most recently by the
  upgrade-only rule.

## Re-assert depth (D-82-2 vs GS-03 tension resolved for this phase)

- **D-81-2: Upgrade-only re-assert.** Phase 81 re-asserts the mapped role ONLY
  when it is HIGHER than the existing row's role, regardless of that row's
  provenance (invite, manual, or group). Same-role = no-op; mapped role LOWER
  than the current grant = leave untouched (explicit grants beat group grants).
  Downgrade semantics belong to Phase 82 (GS-03: only group-derived rows are
  ever downgraded).
- **D-81-3: Viewer upgrade rule.** `viewer` ranks 0 in the upgrade comparison
  (owner 3 > admin 2 > member 1 > viewer 0), so any mapped role upgrades an
  existing viewer row. Mappings can never map TO viewer (Phase 80 3-token
  CHECK) — viewer is only ever an existing-row rank.

## Audit shape (GO-02 made concrete)

- **D-81-4: Hybrid audit.** Operator flag grant = full `audit_log` row in the
  SAME db.tx as the flag update (console-promote atomicity, AUD-01), action
  `operator_promoted`, actor = the granted user themselves (self-grant: actor
  fields = target fields), ip from the request. Workspace grants and role
  upgrades = lightweight `logSecurity` verbs (`sso_group_grant`,
  `sso_group_role_change`) — the `sso_invite_accepted` precedent.
- **D-81-5: Changes-only auditing.** Audit rows are written only on actual
  writes (new grant inserted, role upgraded, flag flipped). An idempotent
  re-login that finds everything in place writes zero group audit rows;
  `sso_login` still fires as today.

## Provenance column mechanics (GW-04 made concrete)

- **D-81-6: Stamp all writers.** `memberships.provenance` via
  `adapterEnsureColumn` (both schema mirrors kept identical; additive
  migration, byte-identical second boot). Values going forward:
  - group grants → `group:<guid>`
  - invite reconcile (SSO-07 auto-accept AND the accept route) → `invite`
  - manual paths (workspace-creation owner at :3582, operator member-add
    :7010/:7111, reassign :8490, any other direct insert) → `manual`
  - Pre-existing rows stay NULL and are treated as manual/invite — immune to
    group logic forever. No legacy backfill.
- **D-81-7: Extend addMembership.**
  `addMembership(ws, user, role, teams = [], provenance = null)` — one
  optional param; all existing callers updated per D-81-6. The group path
  calls it with `group:<guid>`. The on-conflict clause updates role (and
  member_id) only — **provenance keeps the row's ORIGINAL creation origin**
  even when a group later upgrades its role.

## Grant edges

- **D-81-8: Dead/archived mapping → skip + logWarn.** The grant path checks
  workspace existence and skips archived workspaces before touching
  memberships: skip the grant, logWarn the dead/archived target, login
  proceeds normally. Never fatal, no refusal keys (no API surface). Mirrors
  the Phase 80 boot-warning posture.
- **D-81-9: Onboarding composes naturally.** Grants commit before the session
  mint; `/api/me` reflects the memberships; the zero-workspace onboarding
  check (src/main.js:403) naturally skips mapped JIT users on first login. No
  special handling, no bypass flag.
- **D-81-10: Overage log shape at login.** An overage/unmapped claim at login
  logs ONE `logWarn` with a fixed message (e.g. `sso groups claim overage —
  treating as unmapped`). Never group GUIDs, counts, or claim content in the
  message (D-09 PII posture). Overage/unmapped = zero grant writes, login
  proceeds (D-82-4).
- Password logins never consume groups (the block lives in the OIDC callback
  only — no claims exist on the password path). `ssoRedirect` target is
  unchanged by grants. Already-operator user matching an operator mapping →
  no write, no audit (D-81-5). These four are consequences of decisions above;
  the executor treats them as binding.

## Failure semantics

- **D-81-11: Fail closed.** The entire grant block (claim resolution, mapping
  load, writes, audit) rides inside the existing callback `try`; ANY throw
  funnels to the generic `errorRedirect()`. No partial login ever — either the
  login completes with correct groups applied, or it fails clean and the user
  retries. No new redirect params (no-oracle rule).

### the agent's Discretion

- Exact placement/shape of the grant block within the callback (single helper
  vs inline block) — must sit after identity resolution, before DP-5.
- Exact logSecurity verb spellings beyond `sso_group_grant` /
  `sso_group_role_change` (keep them grep-able and self-describing).
- Test file organization (extend test/oidc-sso.test.mjs vs new
  test/groups-sso.test.mjs — mock-IdP harness supports `groups` claim via
  tokenConfig claims overrides).
- DDL comment wording in the two schema mirrors.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & rulings
- .planning/REQUIREMENTS.md — GW-01..04, GO-01..02; owner decisions D-82-1..6
- .planning/ROADMAP.md §Phase 81 — success criteria 1–5

### Research
- .planning/research/ARCHITECTURE.md — Decision 2 (callback ordering), Decision 3
  (grant/reconcile table), Patterns 1–4, wave plan (Phase B = this phase)
- .planning/research/STACK.md — ApplicationGroup vs SecurityGroup, overage shape,
  GUID-default emission
- .planning/research/PITFALLS.md — overage-as-empty trap, DP-4 bypass, audit
  expectations

### Prior phase decisions (binding)
- .planning/phases/80-group-mapping-core-parser-resolver-overage-detection/80-CONTEXT.md —
  resolver contract, four-outcome detector, DB-backed config, inertness contract

### Code anchors
- server.js:5121–5360 — the OIDC callback (DP-4 door :5206, DP-5 reconcile :5249,
  2FA :5317, session mint :5331)
- server.js:4632–4666 — addMembership (the on-conflict insert to extend)
- server.js:616–627 / db-adapter.mjs:385–396 — group_mappings DDL (both mirrors)
- server.js:6840–6868 — console promote/demote (audit_log row shape to mirror)
- server.js:9403–9420 — Phase 80 boot dead-mapping block
- groups.js — resolveGroupsClaim + resolve (the Phase 81 contract, test-locked)
- db-adapter.mjs:867 — ensureColumn (the provenance migration mechanism)
- test/helpers/oidc-idp.mjs — mock-Entra IdP (claims overrides for the groups claim)
- test/oidc-sso.test.mjs — the callback integration-suite pattern to follow
- src/main.js:390–410 — onboarding routing (D-81-9 evidence)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `groups.js` `resolveGroupsClaim` + `resolve()` — the full resolver contract,
  fixture-tested in Phase 80; callback consumes as-is
- `addMembership` (server.js:4632) — the single membership-insert facade; grows
  the provenance param
- `logSecurity` / `audit_log` row shape — both audit channels exist
- Mock-Entra IdP harness (`test/helpers/oidc-idp.mjs`) — `tokenConfig.claims`
  accepts arbitrary claim overrides, so `groups`, `_claim_names` fixtures are
  injectable per test
- `adapterEnsureColumn` — provenance migration mechanism (proven pattern)

### Established Patterns
- Fail-closed callback funnel inside the existing try → errorRedirect (Pattern 3)
- Count-before-write guards; audit row in SAME db.tx as the mutation (AUD-01)
- Dual-schema additive DDL: write server.js SCHEMA + db-adapter.mjs
  SQLITE_SCHEMA together, mirror test enforces byte-equality
- 5-locale keyed refusals — NOT needed this phase (no new API surface)

### Integration Points
- Callback ordering: after DP-4/identity resolution, before DP-5 invite
  reconcile, before 2FA and session mint — grants commit before the session
  cookie exists (login lands with correct access)
- `/api/me` naturally reflects new memberships — no client changes
- test/dependencies.test.mjs — no new files shipped? groups.js already pinned;
  verify no new module needs the COPY contract

</code_context>

<specifics>
## Specific Ideas

- The provenance-filtered DP-5 guard is the load-bearing trick of this phase:
  it lets GW-03's literal ordering coexist with always-reconciling invites
  while keeping unmapped logins byte-identical.
- Upgrade-only re-assert is the deliberate Phase 81/82 seam: 81 escalates,
  82 de-escalates. The upgrade comparison needs the viewer-rank-0 extension.

</specifics>

<deferred>
## Deferred Ideas

- Removal sync, downgrade semantics, guard funnel (owner/last-operator),
  group-driven skip-and-audit — Phase 82 (GS-01..04)
- Mapping editor UI + dead-mapping console section — Phase 83 (GV-01..03)
- Graph overage fallback recipe — DEPLOY.md note, Phase 84
- `label` XSS escape at first render — MUST be tracked in Phase 83 (audit
  watch-item from the mid-milestone audit)

</deferred>

---

*Phase: 81-group-grant-path-callback-wiring-provenance*
*Context gathered: 2026-11-20*
