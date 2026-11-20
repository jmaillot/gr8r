# Project Research Summary

**Project:** gr8r / Projects Studio — v3.2 Entra Group Mapping & Governance Backlog
**Domain:** Self-hosted SaaS identity governance (Entra ID groups → workspace membership / roles / operator rights)
**Researched:** 2026-11-20
**Confidence:** HIGH

## Executive Summary

This milestone adds Entra ID group-driven access mapping to gr8r's existing hand-rolled, zero-dependency OIDC SSO stack, plus the deferred v3.1 workspace rename/slug-edit governance feature. All four research streams converge on one architectural verdict: **claims-first, snapshot-at-login, zero new dependencies**. Everything needed is JSON-shaped — the `groups` claim already rides along in the full claims object that `verifyIdToken()` returns, the mapping config is env-var triples following the v3.0 domain-door tri-state parse precedent, and even the >200-group overage case requires at most a plain `fetch` POST (or, per the architecture recommendation, no network call at all: detect `_claim_names` and treat as UNMAPPED). MSAL, Graph SDK, openid-client, and jose are explicitly things NOT to add — the `test/dependencies.test.mjs` invariant pins this.

The design centers on one insertion point: the SSO callback in `server.js` (~:5131–5213), after identity resolution (the DP-4 signup door has run — group mapping grants *membership*, never account existence) and before DP-5 invite reconciliation and session mint. A new server-only `groups.js` (sibling of `domains.js`) parses `ENTRA_GROUP_MAP` / `ENTRA_OPERATOR_GROUP` with the strict tri-state pattern (unset = feature off; set-but-garbage = boot-refuse), keys on Entra group **Object ID GUIDs** (display names are labels only, never match keys). Removal sync at login is the genuinely hard part: it requires a new `memberships.provenance` column (`invite` / `manual` / `group:<guid>`) so removal only touches group-derived rows, and it must route every mutation through the existing count-before-write guard funnel — last-owner removal is refused (login still succeeds), and group mapping **grants** `is_instance_admin`, never revokes it.

The dominant risk is the overage failure mode: Entra omits the `groups` claim entirely past 200 groups, emitting a `_claim_names` pointer instead. A naive implementation reads that as "no groups" and — with removal-sync active — silently strips the power user's access. All researchers agree: `_claim_names` must be treated as UNMAPPED/UNKNOWN (skip grants AND removals, log loudly), never as an empty list. Secondary risks: mapping bypassing the DP-4 provisioning door, sync bypassing the last-owner/last-operator guards, and slug rename breaking deep links and mapping config. All have concrete prevention strategies with e2e-able verification checks (see PITFALLS.md checklist).

## Key Findings

### Recommended Stack

**Zero new runtime or dev dependencies — confirmed independently by STACK.md and ARCHITECTURE.md.** See [STACK.md](./STACK.md) for the full rejection table.

**Core technologies (all existing):**
- `oidc.js` `verifyIdToken()` — already returns the full claims object; the single ingestion point for `groups`, `_claim_names`, `hasgroups`
- `fetch` + JSON — sufficient for any overage fallback (client-credentials POST to the token-provided `_claim_sources` endpoint); no SDK
- New `groups.js` (server-only, sibling of `domains.js`) — tri-state env parse, GUID shape validation, pure resolver functions
- Existing `addMembership`, last-operator/owner guard funnels, `adapterEnsureColumn` migration pattern, audit-trail and 5-locale keyed-refusal precedents — all reused, never reimplemented

**Entra-side config (one-time, tenant admin, documented in DEPLOY.md):** set `groupMembershipClaims: "ApplicationGroup"` (sidesteps the 200-group limit entirely; direct membership only — matches how operators reason about mappings), add the `groups` optional claim to the **ID token**. Only if overage fallback is wanted: `GroupMember.Read.All` application permission + admin consent (the one change that widens the secret-leak blast radius — flag to requirements).

### Expected Features

See [FEATURES.md](./FEATURES.md) for the full landscape and competitor analysis (GitHub Enterprise SCIM, Okta, GitLab/Tailscale patterns).

**Must have (table stakes):**
- `groups` claim ingestion at the SSO callback with overage detection + distinct audit signal
- Env-var group→workspace mapping: strict tri-state parse, boot-frozen, fail-closed, keyed refusals, 5 locales
- JIT + login auto-membership with role precedence rules
- Removal sync at login with mapped-vs-manual grant distinction (provenance in data)
- Shared last-operator/last-owner guard on all sync paths, skip-and-audit on violation
- Audit logging of every group-driven delta per login (keyed verbs)
- Unmapped-user byte-identical behavior (verification requirement, not assumption)

**Should have (differentiators):**
- Group→operator mapping (reuses workspace-mapping machinery; one extra sink)
- Honest "skipped: would demote last operator" audit lines — operator-trust gold
- Overage-detection audit signal (most small competitors shipped this late)
- Workspace rename + slug edit on governance page (independent workstream)

**Defer (backlog, with triggers):**
- Admin-UI mapping editor (trigger: >2 operators complain about env syntax)
- SCIM server, slug redirects, nested-group app-side resolution — explicitly anti-features
- Per-project group grants, group-name matching, deny-mappings — rejected with rationale

### Architecture Approach

Claims-first with one insertion point and one new module. See [ARCHITECTURE.md](./ARCHITECTURE.md) for verified line numbers and the callback-flow diagram.

**Major components:**
1. `groups.js` (new, server-only) — tri-state env parse, GUID validation, pure resolvers (`resolveWorkspaceMappings`, `resolveOperatorGroup`), overage detector
2. SSO callback block in `server.js` (~:5131–5213 region) — NEW steps ③④ inserted between identity resolution ② and invite reconciliation ⑤, strictly after the DP-4 signup door, before 2FA/session mint
3. Reconcile helpers + `memberships.provenance` column — diff desired vs actual, only touching `group:<guid>` rows, through the shared count-before-write guard funnel
4. Governance rename/slug edit — rides existing `PUT /api/workspaces/:slug` (:7399): validation + keyed refusals, not a new route; zero shared code with the group work

**Callback ordering contract (locked by research):** after identity resolution, before DP-5 invite reconciliation, strictly after DP-4. Group mapping never bypasses a door.

### Critical Pitfalls

Top 5 of 10 — full mapping of pitfall→phase→verification in [PITFALLS.md](./PITFALLS.md):

1. **Overage (`_claim_names`) read as empty list** — the worst case is a *removal*, not a no-op: power users get stripped. Detect the pointer and treat as UNMAPPED/UNKNOWN: skip grants AND removals that login, log loudly. Co-design with removal sync.
2. **Sync bypassing the guard funnel** — a naive removal path can orphan a workspace owner or demote the last operator. Route every group-derived mutation through the same count-before-write funnel as manual edits; guard violation = skip + audit, login still succeeds.
3. **Group mapping bypassing the DP-4 provisioning door** — mapped user on a non-allow-listed domain must NOT be provisioned. Ordering is explicit: doors gate existence; groups only assign membership post-existence. e2e: mapped group + blocked domain refused.
4. **Group names / slugs as keys** — names are mutable and colliding; slugs are URL-shaped public addresses. Match on Object ID GUIDs only; mapping config references workspace IDs (or slugs never renamed — ratify), labels display-only.
5. **Claim from the wrong token / second extraction site** — one extraction point in the callback, one token type (ID token), grep-provable single site; groups never mirrored into session cookies (Traefik token-bloat risk).

## Implications for Roadmap

Research converges on a 4+1 phase structure following ARCHITECTURE.md's wave ordering. Waves 1→2→3 are strictly sequential (module → wiring → removal logic needs provenance); the governance phase is fully parallel and can be scheduled anywhere.

### Phase 1: Group mapping core — parser, resolver, overage detection
**Rationale:** Everything mapping-related requires claim ingestion and the parsed config first; this wave is pure and inert (no callback wiring), so the tri-state matrix, GUID shape validation, and overage detection are established as fully-tested units.
**Delivers:** `groups.js` with tri-state env parse (`ENTRA_GROUP_MAP`, `ENTRA_OPERATOR_GROUP`), GUID validation, pure resolvers, overage detector (`_claim_names` → UNMAPPED, never empty), boot-log extension of the D-11 door matrix.
**Addresses:** claim ingestion + overage detection + env mapping config (P1 table stakes).
**Avoids:** Pitfalls 1, 2, 4 (overage-as-empty, name-keyed config, transitive surprise) at the unit level.

### Phase 2: Grant path — callback wiring + provenance schema
**Rationale:** Needs Phase 1's module; removal sync is explicitly OFF here, but the `memberships.provenance` migration MUST land in this phase because Phase 3's removal logic cannot exist without it. Grants only: JIT/login auto-membership + role precedence + operator grant (never revoke).
**Delivers:** Callback steps ③④ inserted after identity resolution, before DP-5; `memberships.provenance` (`invite`/`manual`/`group:<guid>`) via `adapterEnsureColumn`; operator grant (`is_instance_admin` set-only); mock-IdP tests through the full callback flow.
**Addresses:** JIT/login auto-membership, group→operator mapping (P1 + early P2).
**Avoids:** Pitfall 7 (door bypass — e2e "mapped group + blocked domain refused"), Pitfall 3 (single extraction site contract test).

### Phase 3: Removal sync + guard composition + audit
**Rationale:** The largest test surface; strictly depends on Phase 2's provenance column. This is the core pitfall zone of the milestone (Pitfalls 1, 5, 9, 10 all land here) — every guard combination deserves a pin.
**Delivers:** Diff-at-login reconcile (grant/promote/demote/remove per the Decision-3 table), shared last-owner guard (skip-and-audit on violation, login still succeeds), audit rows per group-derived change with group ID, sync-before-session-issuance ordering, client 403 "access changed" recovery path.
**Addresses:** removal sync, guard sharing, audit logging, unmapped-user no-change regression gate.
**Avoids:** Pitfalls 1 (removal side), 5, 9, 10.

### Phase 4: Governance — workspace rename + slug edit (parallel workstream)
**Rationale:** Zero shared code with Phases 1–3 (only the i18n key-count gate is shared — locale keys land in the same commit as the first emitting gate, per v3.1 pattern). Can run concurrently with Phases 2–3.
**Delivers:** Rename + slug edit on the existing `PUT /api/workspaces/:slug` route: uniqueness + shape validation, keyed localized refusals (5 locales), client edit UI in governance page, old-slug policy implemented and documented.
**Addresses:** rename/slug-edit table-stakes (P2).
**Avoids:** Pitfall 8 (slug blast radius: deep links, mapping config, collision).

### Phase 5 (or fold into 2/4): DEPLOY.md + ship polish
**Rationale:** Entra-side prerequisites are deploy-time documentation, not code — but they gate real usage. Version bump to 3.2.0 at ship.
**Delivers:** DEPLOY.md sections: ApplicationGroup claim config, optional overage-fallback permission (`GroupMember.Read.All` + consent), transitive/direct membership semantics, dead-mapping runbook, old-slug policy. Remaining backlog items (56-02 e2e, Phase 57 mobile) only if kept in v3.2 scope.
**Addresses:** operator-facing docs (P2); backlog decoupling.

### Phase Ordering Rationale

- **Strict sequence 1→2→3:** module → callback wiring → removal logic; provenance must exist before any removal code.
- **Phase 4 fully parallel:** governance edit shares nothing with the callback; scheduling flexibility is the benefit (FEATURES.md dependency notes).
- **Removal sync last among group phases:** it's the highest-risk surface and needs the grant path proven first; overage handling is co-designed at Phase 1 so the removal side inherits the safe contract.
- **Overage fallback (Graph client-credentials) is deliberately NOT a phase:** with `ApplicationGroup` it should never fire; ARCHITECTURE recommends detect-and-treat-as-unmapped. If requirements wants the network fallback, it's a small addition to Phase 1 — ratify there.

### Open Decisions for Requirements (ratify before/at discuss-phase)

1. **Overage policy:** proceed-as-unmapped (recommended — never block logins that work today) vs refuse login vs Graph fallback.
2. **Role-conflict precedence:** manual higher role beats group grant (recommended); demote-or-remove on lost group membership.
3. **Invite-vs-group precedence:** which wins when both target the same workspace (architecture recommends invite/explicit-human wins; ordering of the DP-5 query must be explicit either way).
4. **Mapped-grants-survive-demotion policy:** does manual demotion of a group-mapped operator stick, or does the group re-grant at next login (FEATURES.md flags the "why won't my demotion stick?" trap)?
5. **Old-slug policy:** 404 on old slug (recommended — fail-closed, no redirect machinery) vs redirect.
6. **Mapping config keys:** workspace slug in env (simple, but rename-coupled — Pitfall 8) vs stable workspace IDs (safer; slightly worse ergonomics). Must be decided before Phase 1's parse schema.

### Research Flags

Phases likely needing `/gsd-plan-phase --research-phase`:
- **Phase 3 (removal sync + guards):** highest combined test surface; guard composition across provenance states, overage×removal interaction, and the client 403 recovery path all need careful planning. No external research needed — the complexity is internal invariants, but plan-phase should be thorough.
- **Phase 1 (parser/resolver):** mostly standard (tri-state parse precedent is verbatim from domains.js); flag only if the Graph overage fallback is ratified into scope (then verify the client-credentials + getMemberObjects contract against current docs).

Phases with standard patterns (skip research-phase):
- **Phase 2 (callback wiring):** the insertion point, funnel, and mock-IdP harness are all codebase-verified with line numbers.
- **Phase 4 (rename/slug):** rides an existing route; validation + keyed-refusal pattern is v3.x boilerplate.
- **Phase 5 (docs):** no research needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Every Entra claim behavior verified against live learn.microsoft.com docs dated 2025-04→2026-08; zero-dep verdict cross-confirmed by two researchers |
| Features | HIGH | Competitor patterns (GitHub SCIM, Okta, GitLab/Tailscale) well documented; MVP split is consensus-grade |
| Architecture | HIGH | Codebase-verified with exact line numbers at research HEAD; insertion point and guards confirmed against shipped v3.x code |
| Pitfalls | HIGH | Claim behaviors documented; integration pitfalls derived from shipped architecture — design analysis, not speculation |

**Overall confidence:** HIGH

### Gaps to Address

- **Overage fallback decision:** STACK.md specifies the full client-credentials recipe; ARCHITECTURE recommends never calling Graph. One policy decision resolves it (recommended: treat-as-unmapped; keep the recipe in DEPLOY.md as an operator-side mitigation note). If the fallback is wanted, verify the Graph contract at plan time.
- **`ApplicationGroup` nesting semantics:** direct-membership-only under ApplicationGroup is documented, but transitivity under other modes is tenant-controlled. DEPLOY.md must document that nesting semantics live tenant-side; no app-side resolution either way.
- **Architecturally (minor):** Entra overage details in ARCHITECTURE.md came from model knowledge (MEDIUM) while STACK.md verified them live — treat STACK.md as the authoritative source; a fixture-token test with `_claim_names` is the verification gate regardless.
- **Dead-mapping detection:** server-side undetectable by design (no Graph). Mitigations (audit rows, "never matched" boot/console surface) are recommended but unratified — decide scope in requirements.
- **Six open policy decisions** listed above — all resolvable in requirements definition; none block roadmap structure.

## Sources

### Primary (HIGH confidence)
- learn.microsoft.com — optional-claims (2026-08-11), optional-claims-reference (2026-08-20), how-to-connect-fed-group-claims (2026-02-26), graph getMemberObjects: `groups` claim config, ApplicationGroup, 200/150 limits, overage shape, permission matrix
- gr8r PROJECT.md + shipped v1.x–v3.1 record: zero-dep invariant (`test/dependencies.test.mjs`), door matrix, last-operator guards, 5-locale gate, audit precedents
- gr8r codebase at HEAD (server.js, domains.js, oidc.js read in full): line-verified integration points

### Secondary (MEDIUM confidence)
- Microsoft security-docs Zero Trust token-config guidance; Okta/GitHub Enterprise SCIM docs (deprovisioning semantics); Clerk/Stytch/WorkOS SCIM explainers
- LibreChat issue #9196 (community evidence of overage pain)

### Tertiary (LOW confidence)
- Entra community wisdom on claim gotchas (consistent with official docs; ARCHITECTURE.md's model-knowledge Entra details superseded by STACK.md's live-doc verification)

---
*Research completed: 2026-11-20*
*Ready for roadmap: yes*
