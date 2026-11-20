# Feature Research

**Domain:** Group-based access mapping for a self-hosted SaaS (Entra ID groups → workspace membership, roles, operator rights)
**Researched:** 2026-11-20
**Confidence:** HIGH (patterns verified against Microsoft Entra identity-platform docs, Okta SCIM concepts, GitHub Enterprise SCIM deprovisioning behavior; product behaviors cross-checked against widely documented IdP-driven access models)

## Feature Landscape

### Table Stakes (Users Expect These)

Features operators of Entra-connected SaaS (GitLab, Tailscale, Notion, GitHub Enterprise, Teleport, Zitadel, Keycloak-based tools) assume exist. Missing these = the mapping feels broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Read `groups` claim from the ID token at SSO callback | This is THE integration point. Every "groups-driven access" SaaS starts here. Claims-first (no Graph SDK, no SCIM server) is the standard lightweight pattern. | LOW | gr8r already has hand-rolled OIDC with JWKS RS256 — add one claim read. No new deps, matches the standing constraint. |
| Overage handling (fail-closed, documented) | Entra caps the `groups` claim at **200 Object IDs for JWT** (150 SAML); beyond that, tokens carry no groups (or a `_claim_names` overage pointer). Apps that ignore this silently fail open (no groups → no removals) or fail closed (no groups → lockout). Documented overage behavior is table stakes. | LOW–MEDIUM | gr8r's fail-closed philosophy aligns: treat missing/absent `groups` claim as "no group evidence this login" and log it; never fall back to stale mappings. Detect the overage marker (`_claim_names.groups`) and surface a distinct audit line. |
| Env-var mapping config (operator-editable, boot-validated) | Single-Docker-image self-hosted apps (Gitea, Outline, Bitwarden RS, Tailscale) configure SSO via env vars. Operators expect `GROUP_WORKSPACE_MAP="objectId:slug:role,..."`-style strict parsing with boot-refuse on garbage — exactly gr8r's `WORKSPACE_CREATION` / `SIGNUP_DOMAINS` precedent. | MEDIUM | Strict-token env parse, fail-closed, boot-frozen (v3.0 tri-state precedent: unset vs empty semantics decided explicitly). Reuse the keyed-refusal + 5-locale catalogue pattern. |
| JIT auto-membership at first login / any login | If a user authenticates via SSO and is in a mapped group, they expect to land inside the workspace without anyone clicking "invite" in gr8r. This is what "SSO-driven access" means to operators. | LOW | Extends the existing JIT-provision arm (DP-4): after provisioning, map groups → memberships. Also applies to already-provisioned accounts at every login (group added later → membership granted at next login). |
| Removal sync at login (demote/remove membership) | GitHub Enterprise SCIM, Okta-driven apps, and Tailscale all revoke group-inherited access when the IdP group no longer contains the user. With snapshot-at-login (gr8r's chosen model), removals are observed at next login — this is a legitimate, documented pattern (GitLab/JITZ-style "reconcile at session establishment") and simpler than SCIM push. | MEDIUM | The hard part is role **downgrade** semantics: membership removed entirely vs demoted to viewer. Standard answer (see Competitor Analysis): group-driven grant is *inherited* — user loses it when group membership ends; manually-granted memberships (via invite) are *explicit* and survive. Must be a documented, one-sentence distinction. |
| Last-operator / last-owner protection enforced during group sync | Every competitor with group-driven roles (GitLab's role inheritance, Okta admin mappings) guards against sync demoting the last owner — otherwise a group edit in Entra bricks the instance. gr8r already has this guard in the operator console; the sync path must reuse it, not reimplement it. | LOW | One shared guard function called from both paths. Sync demotion that would violate the guard is skipped + audit-logged (skip, not refuse — the login itself must still succeed). |
| Audit logging of group-driven changes | Operators need to answer "why did Élodie become admin?" The only sane answer is an audit row: `group_sync` verb, source group Object ID, resulting change (granted/demoted/removed/skipped-guard). Okta/GitLab/SCIM implementations all log provisioning events. gr8r has an audit-trail precedent (v1.5 AUD-01..03). | LOW | One audit line per effective change per login, keyed verb (machine verbs, not prose — Phase 9 ACT-01 precedent). |
| Unmapped users behave exactly as today | Fail-closed / no-surprise behavior: no mapped group → no group-driven change. Table stakes for upgrade trust. | LOW | Already a stated milestone constraint; make it a verification requirement, not an assumption. |
| Workspace rename + slug edit from governance page | Every multi-workspace SaaS admin surface (Notion admin, GitLab group settings, Zitadel org settings) exposes rename in the admin list. Slug editing is the risky half: URLs are `/w/:slug/...`, so competitors either forbid slug change (most common for tenant-path SaaS) or redirect old slugs. | LOW–MEDIUM | Rename: trivial (`UPDATE workspaces SET name`). Slug change: must handle uniqueness collision, redirect semantics (or explicit 404-on-old-slug, documented), and member-session `ws` references. Recommend: allow rename freely; allow slug edit with collision refusal + old-slug 404 (fail-closed, no redirect machinery) — matches gr8r's no-existence-oracle posture. |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Claims-first zero-dependency design | No Graph SDK, no SCIM server, no webhook receiver = no new attack surface, no deps, no scheduled jobs. Most competitors force SCIM or Graph on you; snapshot-at-login is refreshingly small. | (already decided) | Marketing/docs angle as much as code. |
| Snapshot-at-login with honest audit of what changed | "Your gr8r access is exactly what your Entra groups said at your last login" is a *clearer* mental model than eventual SCIM consistency. Differentiator: the audit log shows per-login group-driven deltas. | LOW | Rides on the audit work above. |
| Group mapping as a parallel admission concept beside domain doors | Combining domain-door admission (v3.0) with group mapping (v3.2) covers both "anyone from contoso.com can sign up" and "members of grp-X get workspace Y" — the two orthogonal admission axes. Competitors usually ship only one. | LOW | Already the milestone design; document as the access-matrix story. |
| Explicit skip-and-log on last-owner guard during sync | Competitors either brick the instance or silently demote anyway. A visible "skipped: would demote last operator" audit line is operator-trust gold. | LOW | Cheap once the guard is shared. |
| Overage-detection with distinct audit signal | Detecting `_claim_names` overage and logging "groups claim incomplete this login" beats every small self-hosted competitor (LibreChat et al. shipped this late, via user complaints). | LOW | One claim-shape check. |
| Operator auto-promotion via group with promotion *only ever going up* from mapping | Mapping grants operator; manual demotion by another operator clears a mapped grant? Decide: mapped operator survives manual demote (re-granted at next login) unless a config pin excludes the user — the "why won't my demotion stick?" trap. Making this explicit and documented is a differentiator. | MEDIUM | See Anti-Features: pin/exempt lists are the escape hatch competitors use (GitHub: "managed user" exemptions). |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Periodic background reconcile against Graph API | "Removals should be instant, not at-next-login." | Requires Graph credentials, token handling, rate limits, a scheduler, a secrets surface — everything the milestone explicitly excludes. Snapshot-at-login is the standard lightweight alternative and satisfies real-world security needs (access dies when the session dies / next auth). | Sync at login only; sessions already expire. Document the delay honestly. |
| In-app admin UI for group mapping (admin console CRUD over mappings) | "Env vars are clunky." | Mappings touch 40-char Object IDs and instance-level secrets; an in-app editor implies a config-write path (file or DB), multi-seat operator authority over instance config, and migration between storage modes — a milestone-sized feature for near-zero operator gain (operators already edit env vars for SSO/domains). GitHub/Gitea/Tailscale all stay env/CLI-configured for exactly this. | Env vars now; revisit an admin-UI editor only if operators complain (backlog candidate, not v3.2). |
| Nesting / transitive group resolution via Graph | "Users are in nested groups." | `groups` claim with `GroupAssignments`/transitive options partially covers this token-side; resolving nested memberships app-side requires Graph. Choose Entra claim config (transitive) and document it — do NOT build nested resolution. | Configure the claim as transitive in Entra (`Groups assigned to the application` + transitive option); treat unmapped nested gaps as config issues. |
| Group → guest-role mappings, per-project group grants | "Map group to a single project." | Explodes the mapping matrix (workspace×role×project) with ambiguous precedence. Workspace-level role mapping is the proven 80% (GitLab top-level groups, Tailscale tag grants). | Map to workspace roles only (viewer/member/admin/owner). Per-project grants stay manual. |
| SCIM server (RFC 7644 endpoint) in gr8r | "Then Entra pushes changes instantly." | An entire protocol server, auth surface, and test matrix — massive scope, duplicates what login-sync delivers for a self-hosted single-image app. | Explicitly out of scope; note as possible far-future differentiator only if multi-thousand-user demand appears. |
| Group-name ↔ Object-ID dual matching | "I don't want to copy GUIDs." | Group display names are mutable in Entra; matching by name is a known foot-gun (rename = silent access change). Every serious implementation matches on Object ID. | Object ID only; the searchable token-chip picker backlog item can't help here (Entra Object IDs aren't discoverable in-app without Graph). Provide paste-friendly config + boot-time log of matched/unmapped IDs. |
| Slug redirects after rename | "Don't break old links." | Redirect machinery + existence-oracle tension (v1.1's 404 posture) + session/ws-reference staleness. Competitors with tenant-path URLs mostly break old links too or keep redirects as a separate paid feature. | 404 on old slug, documented in the rename confirmation UI. Old links dying is honest and fail-closed. |

## Feature Dependencies

```
[Groups claim ingestion + overage detection]
    └──requires──> [Existing OIDC SSO callback (shipped)]
                        └──requires──> [JIT provisioning arm DP-4 (shipped)]

[Group → workspace membership+role mapping] ──requires──> [claim ingestion]
    └──requires──> [Role-conflict precedence rules]
    └──requires──> [Audit log of group-driven changes]

[Group → operator mapping] ──requires──> [claim ingestion]
    └──requires──> [Last-operator guard (shipped, shared)]
    └──requires──> [Manual-demotion vs mapped-grant precedence decision]

[Removal sync at login] ──requires──> [all mapping features]
    └──requires──> [last-operator guard]
    └──conflicts──> [nothing shipped — but requires the "mapped vs manual grant" distinction to be encoded in data]

[Workspace rename/slug edit] ──independent──> (governance page, v3.1 deferral; no dependency on group work)

[Searchable token-chip pickers, e2e cleanup, mobile follow-ups] ──independent──> (pure backlog, ship anywhere)
```

### Dependency Notes

- **Everything mapping-related requires claim ingestion first:** it is the single data source; phase 1 of any roadmap.
- **Removal sync requires the mapped-vs-manual grant distinction to exist in the data model:** without it, "remove membership at login" cannot tell an invite-granted membership from a group-granted one and either over-deletes (breaking manual invites) or under-deletes (breaking removals). This is the one genuinely new schema decision of the milestone.
- **Group→operator mapping requires the shared last-operator guard:** reimplementing it per-path is how the guard gets skipped in one path and an instance gets bricked (a documented Okta failure mode).
- **Workspace settings editing is dependency-free:** it can run as a parallel workstream/phase, useful for scheduling flexibility.

## MVP Definition

### Launch With (v3.2 core)

- [ ] Groups claim ingestion with overage detection + audit signal — the foundation; nothing else works without it
- [ ] Env-var group→workspace mapping (strict parse, boot-frozen, fail-closed, keyed refusals, 5 locales) — the core value
- [ ] JIT + login auto-membership with role precedence rules — the feature operators actually want
- [ ] Removal sync at login with mapped-vs-manual grant distinction — the other half of the same value
- [ ] Shared last-operator/last-owner guard on all sync paths, skip-and-audit on violation — non-negotiable safety
- [ ] Audit logging of every group-driven delta per login — operator trust + debuggability
- [ ] Unmapped-user no-change verification — regression gate on the fail-closed contract

### Add After Validation (v3.2 or immediate follow-up)

- [ ] Group→operator mapping — same machinery, one extra sink; safe to phase after workspace mapping proves the precedence model
- [ ] Workspace rename + slug edit on governance page — independent; schedule freely; slug semantics (404 on old) decided up front
- [ ] Overage operator documentation in DEPLOY.md (claim config for "Groups assigned to application" + transitive option) — cheap, high operator value

### Future Consideration (backlog, explicitly deferred)

- [ ] Admin-UI mapping editor — trigger: >2 operators complain about env syntax
- [ ] SCIM server — trigger: large-tenant demand; do not spec now
- [ ] Slug redirects — trigger: real link-rot complaints
- [ ] Searchable token-chip pickers / e2e cleanup / mobile follow-ups — pure backlog, no coupling

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Groups claim ingestion + overage detection | HIGH | LOW | P1 |
| Env-var group→workspace mapping | HIGH | MEDIUM | P1 |
| JIT/login auto-membership + role precedence | HIGH | MEDIUM | P1 |
| Removal sync at login (mapped-vs-manual grants) | HIGH | MEDIUM | P1 |
| Last-operator guard shared across sync paths | HIGH | LOW | P1 |
| Audit logging of group-driven changes | HIGH | LOW | P1 |
| Unmapped-user no-change contract | MEDIUM | LOW | P1 |
| Group→operator mapping | HIGH | LOW (reuses machinery) | P2 |
| Workspace rename/slug edit (governance page) | MEDIUM | LOW–MEDIUM | P2 |
| DEPLOY.md overage/claim-config docs | MEDIUM | LOW | P2 |
| Backlog: token-chip pickers, e2e, mobile | MEDIUM | LOW | P3 |
| Admin-UI mapping editor | LOW | HIGH | P3 (defer) |
| SCIM server | LOW | HIGH | P3 (defer) |

## Competitor Feature Analysis

| Feature | GitHub Enterprise (SCIM) | Okta-driven SaaS apps | GitLab / Tailscale (group/tag mapping) | Our Approach |
|---------|--------------------------|----------------------|----------------------------------------|--------------|
| Source of group truth | IdP pushes via SCIM (RFC 7644) | SCIM push or JIT claims | Claims/token groups or SCIM | Claims (token `groups`), snapshot at login |
| Removal semantics | Deactivate + remove from SCIM-mapped teams; reinstatement window (90 days) | Configurable: deactivate vs remove; group removal ≠ account deactivation | Group-inherited access revoked when group membership ends; explicit grants survive | Mapped grants removed/demoted at next login; manual (invited) grants survive; never deactivates the account |
| Last-owner protection | Sync skips actions that would orphan the org (admins managed separately) | Admin role mappings respect guard rails | Role demotion guarded; break-glass via root/API | Skip-and-audit; break-glass stays D-114 manual DB path |
| Config surface | Admin UI + SCIM setup | Admin console | Admin UI (GitLab) / YAML+API (Tailscale) | Env vars, strict-token, boot-frozen (matches self-hosted peers like Gitea/Outline) |
| Audit of group changes | Provisioning event log | System log with provisioning events | Audit events for membership changes | Audit row per effective change, keyed verbs |
| Workspace/tenant rename from admin surface | Org rename allowed, URLs mostly stable (gh.io handles) | Admin console rename | Group rename free; path slugs change with redirect/404 per object type | Rename free; slug edit allowed with collision refusal + documented 404 on old slug (no redirect machinery) |
| Nested groups | Flattened upstream (IdP responsibility) | App-dependent | IdP responsibility | Entra claim transitive option; no app-side resolution |

## Sources

- Microsoft Entra identity platform — RBAC in Node.js web apps, group claims configuration, token customization, app-roles guidance (groups claim overage: 150 SAML / 200 JWT; overage via `_claim_names`; "use app roles" and claims-filtering recommendations) — HIGH
- Microsoft security-docs Zero Trust — configure tokens: group claims & app roles (token-size limits, Graph recommendation) — HIGH
- Okta developer docs & Okta dev forum — SCIM concepts, deactivation vs removal semantics, group-membership-driven deactivation edge cases — HIGH
- GitHub Enterprise Cloud docs — SCIM deprovisioning and reinstatement (team mapping removal, 90-day reinstatement) — HIGH
- Clerk, Stytch, WorkOS-published SCIM explainers — standard SaaS SCIM/group provisioning feature sets (what the market ships) — MEDIUM
- Community evidence of overage pain: LibreChat issue #9196 (>200-group deployments silently losing claims) — MEDIUM
- gr8r PROJECT.md — standing constraints (zero deps, i18n gate, keyed refusals, fail-closed precedent), shipped capabilities (OIDC+JIT, domain doors, operator console, audit trail) — HIGH

---
*Feature research for: Entra group-based access mapping & governance backlog (gr8r v3.2)*
*Researched: 2026-11-20*
