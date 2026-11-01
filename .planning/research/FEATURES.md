# Feature Research

**Domain:** Self-hosted PM workspace — v1.6 "Team Access & Federation" (multi-team membership, team/project-scoped permissions, Entra ID OIDC SSO, second TOTP factor)
**Researched:** 2026-11-01
**Confidence:** HIGH (patterns verified against Linear/Notion/GitHub docs and WorkOS multi-tenant-permissions analysis; app-specific complexity assessed against PROJECT.md)

## Feature Landscape

### Table Stakes (Users Expect These)

What Linear, Notion, Slack and GitHub all do for each of the four features. Missing these makes a feature feel half-built.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Member visible in every team they belong to** | Linear members "can be added to multiple teams" and appear in each team's roster; Notion teamspaces list their own members. Users check "is this person in my team?" per team, not per workspace. | MEDIUM | Today `memberships` stores one team per user per workspace. Move to a `team_memberships(user_id, team_id, role)` join table (or `teams[]` on the membership row — but a join table is what the ecosystem converges on). Rosters, autocomplete pickers and assignment dropdowns all read from it. **Owner's decision point:** keep the workspace-level role as the ceiling and treat team membership as visibility/access only (Linear's model), vs. per-team roles (Slack channel model). Linear's model is simpler and fits the existing `viewer<member<admin<owner` ladder. |
| **Task assignment limited to people who can see the project/task** | In Linear you cannot assign to a member who lacks access to the team; in Notion you cannot share to a non-member. | MEDIUM | With multi-team membership, assignment must filter to members whose team set intersects the project's `teams[]`. This is a natural tightening once membership is a set. Existing assign/mention notifications then resolve recipients the same way. |
| **@team mentions resolve against the mentioner's visible teams** | Slack @channel/@team semantics: you mention a group, only its members get notified; the autocomplete only shows groups you belong to or can see. | LOW | @team parsing already exists (v1.4 window). It must stop assuming "the member's team" and fan out to all the mentioned team's members. Mostly a query-shape change, plus dedup (a user in 2 mentioned teams gets ONE notification). |
| **Scoped members see only their team/project** | Linear guests: "Access limited to specific teams or projects they are explicitly invited to… cannot access workspace-wide settings, other teams, or billing." Notion guests: "access only to the pages they are invited to." | HIGH | This is the hardest of the four. Today authorization is `requireWorkspace(slug, minRole)` — binary at workspace level. Scoped access needs a second check layer: after role check, if the caller holds a scoped (team/project-invited) membership, API reads must filter (like `redactDoc()` already does for private projects) and writes must reject targets outside the scope. Reuse the redaction machinery — it is the proven pattern in this codebase. **Key design decision:** scoped membership as a *new membership kind* (`scope: 'workspace' \| 'team:<id>' \| 'project:<id>'`) rather than a fourth role. Role stays the permission level; scope stays the reach. That matches Linear (Guest role × team/project scope) and Notion (permission level × page scope). |
| **SSO appears as an additional sign-in path when configured** | Every self-hosted tool with OIDC (tududi, Baserow, LangSmith, GitLab) shows the "Sign in with SSO" button only when the provider is configured, alongside the password form. | MEDIUM | Env-gated: `OIDC_ENABLED` + issuer/client-id/secret present → login page renders the button, `/api/auth/oidc/*` routes exist. Not configured → routes 404 and button absent. Zero-runtime-dependency constraint means hand-rolling the authorization-code flow over `node:crypto`/`node:http` (well-documented flow, ~200–300 lines: authorize redirect, state+nonce, PKCE recommended, token exchange, ID token validation against the JWKS). |
| **Just-in-time provisioning with a defined default role** | Baserow, tududi, LangSmith: "new users created automatically on first login via SSO." | LOW | On first successful OIDC login, create the account from the `email`/`name` claims and attach a default membership (viewer or member — owner's choice via env, e.g. `OIDC_DEFAULT_ROLE`). Existing accounts match by verified email → link, don't duplicate. This email-match linking is the universal pattern (GitHub does it, GitLab does it). |
| **Multiple TOTP factors listed with names, revocable individually** | GitHub settings lists each authenticator; Slack and cloud IdPs (Okta/Entra) let you name ("Work phone", "Personal") and delete one factor without touching the others. Community pressure on GitHub (#78027, #54699) shows this is exactly what users ask for. | MEDIUM | New `totp_factors(id, user_id, name, secret_envelope, created_at, last_used_at)` table; enrollment writes a row (name prompted), login accepts a code from ANY factor, delete-factor requires password step-up (and existing 2FA code). Recovery codes stay a separate, untouched table — universally recovery codes are NOT per-factor; they're an account-level fallback. The existing `v2:` keyring envelope already encrypts one secret; factors just multiply the rows. |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Named TOTP factors** ("Laptop", "Backup phone") | GitHub famously does NOT let you register a second TOTP device or remove one without re-enrolling everything — its own community discussions (#78027, #54699) are long-running complaints. Naming + per-factor revocation + last-used tracking beats GitHub. | LOW (on top of multi-factor) | One column each: `name`, `last_used_at`. The last-used timestamp also enables future "stale factor" hygiene. |
| **Project-level guest access** (not just team-level) | Linear supports both team and project guest scope; Notion's page-level guests are its signature sharing feature. For a self-hosted tool, inviting an external collaborator to exactly one project without exposing the rest of the workspace is a strong story. | HIGH (on top of team-scoped) | Same scope mechanism, different scope target. The `teams[]` intersection logic generalizes: a scoped member sees projects whose `teams[]` intersect their granted teams, or whose explicit project grant matches. Do team scope first; project scope rides the same plumbing. |
| **OIDC groups → team membership mapping** | Entra ID emits `groups` claims; mapping them to teams gives IT-driven provisioning (join the AD group, you're in the team). GitLab and Baserow support group mapping; it's the #1 enterprise ask after basic SSO. | MEDIUM | Post-MVP. Needs group→team UUID mapping config (env or admin UI) and a sync policy (on-login is the cheap, standard option vs. SCIM). |
| **SSO enforcement toggle** (`PASSWORD_AUTH_ENABLED=false`) | tududi, GitLab ("SSO-only mode"): admins want to force the IdP as the only door once it's proven. | LOW | One env flag + hiding/404ing the password path. Do it in the first SSO phase — it's nearly free and completes the "optional, env-configured" story. |
| **Pending-invitation reconciliation at SSO login** | If an invite exists for the SSO user's email, auto-accept or surface it post-login (Baserow/LangSmith behavior). | LOW | The invites table already exists; a lookup by email at JIT-provision time is enough. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Per-team roles inside the role ladder** (admin of team A, viewer of team B) | "I want to give Elodie admin over just Design." | Explodes the authorization matrix: `requireWorkspace` checks would need per-team role resolution everywhere, and workspace settings still need a single answer. Every tool that tried full per-team roles gates it behind enterprise (Slack) or avoids it (Linear keeps role workspace-level, membership team-level). | Keep role workspace-level + scope team-level. A team-scoped *admin* is a future tier, not part of this milestone (and v1.5's Phase 24 workspace-admin tier shows how a scoped admin tier was handled before). |
| **SCIM provisioning** | "Real companies need automated user lifecycle." | Requires the IdP to speak SCIM, a whole admin surface, de-provisioning semantics, and test suites — disproportionate for a zero-dependency self-hosted app. PROJECT.md already lists SCIM out of scope. | JIT provisioning on login + group mapping later. De-provision = disable the user in Entra; the SSO login then fails. |
| **Per-factor recovery codes** | "If I lose device 2, I want separate codes." | Recovery codes are the account-level break-glass; splitting them per factor multiplies secret material and weakens the invariant "a recovery code never disables 2FA" that v1.4 hardened. No major tool does per-factor codes. | One account-level recovery-code set, untouched by factor add/remove. Exactly what the milestone specifies. |
| **Deleting the last TOTP factor independently of "disable 2FA"** | "I just want to swap phones." | If deleting the final factor silently disables 2FA, you get two half-states; GitHub's flow confusion (#54699) is the cautionary tale. | Deleting the last factor = the existing disable-2FA flow (password + live TOTP step-up, one-transaction teardown). Deleting factor 2 of 2 is just "disable" under the hood; the UI can present it as "remove device". |
| **Auto-linking SSO identities by more than verified email** (username, custom claim) | "Our emails differ between systems." | False-positive account takeover risk. Every credible implementation links on verified email only. | Email match; mismatch = new account or explicit admin action. |

## Feature Dependencies

```
[Multi-team membership (join table)]
    └──requires──> [memberships migration: team per user → team set]
                        └──requires──> [existing migrateTenancy() machinery (proven)]

[Task assignment/@team/roster surfaces] ──enhances──> [Multi-team membership]
    (all three read the same team-set; must ship together or rosters lie)

[Team/project-scoped permissions]
    └──requires──> [Multi-team membership]           (scope targets a team, so teams must be set-valued first — PROJECT.md: #3 before #4)
    └──requires──> [redactDoc()/mergeClientDoc() pattern]   (reuse, don't reinvent)
    └──conflicts-with→ [no existence oracle: 404 on unknown slug]  (scoped users must 404 on out-of-scope data, not 403 — preserve)

[Entra OIDC SSO]
    └──requires──> [accounts table + sessions (v1.3) — independent of teams/scopes]
    └──requires──> [invites table]                    (email-match JIT linking + pending-invite reconciliation)
    └──optional-enhances→ [group→team mapping]  → requires [multi-team membership]

[Second TOTP factor]
    └──requires──> [v2: keyring envelopes (v1.5 Phases 25–26)]   (each factor secret is one envelope)
    └──requires──> [pending-2FA login challenge (v1.3 Phase 17)] (verify against ANY factor)
    └──independent-of→ [recovery codes table]                    (explicitly untouched)
    └──requires──> [disable-2FA teardown (v1.4 Phase 21)]        (redefined as "remove last factor")
```

### Dependency Notes

- **Scoped permissions require multi-team membership:** PROJECT.md already sequences #3 → #4. A team-scoped grant is meaningless if a user has exactly one team.
- **Entra SSO is orthogonal to the team work** — it can be built in parallel with #4 (its only team coupling is the optional group mapping, which is a differentiator, not MVP).
- **Second 2FA factor is fully orthogonal** and rides v1.5's keyring — safest phase, good closer (PROJECT.md orders it last).
- **The 404-not-403 principle conflicts with naive scope enforcement:** scoped users must not learn what exists outside their scope. The redaction pattern already solves this for private projects; extend, don't bypass.

## MVP Definition

### Launch With (v1.6)

- [ ] **Multi-team membership** — join table + migration, rosters/assignment/@team read the set, dedup notifications. Foundation for #4; PROJECT.md orders it first.
- [ ] **Team-scoped membership kind** — `scope` on the membership, server-side read filtering (redaction-style) + write rejection, scoped members 404 on out-of-scope data. Project-level scope can share the mechanism but team scope is the minimum.
- [ ] **Entra OIDC sign-in, env-gated** — button only when configured, raw-OIDC code flow + PKCE over Node built-ins, email-match linking, JIT provision with default role, optional SSO-only flag.
- [ ] **Multiple named TOTP factors** — factor table, enroll with name, verify any factor at login, remove one with password step-up, last-used timestamp; last-factor removal = disable-2FA flow; recovery codes untouched.

### Add After Validation (v1.6.x)

- [ ] Project-level guest scope (if not in the team-scope phase) — when external-collaborator demand materializes.
- [ ] Pending-invite auto-reconciliation at SSO login — when SSO usage grows.
- [ ] `last_used_at`-driven stale-factor hints — cheap follow-on to factor tracking.

### Future Consideration (v2+)

- [ ] OIDC groups → team mapping — needs real Entra tenants to design against.
- [ ] SCIM — explicitly out of scope in PROJECT.md; revisit only for enterprise posture.
- [ ] Per-team admin tier — after team scoping proves itself.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Multi-team membership | HIGH | MEDIUM | P1 |
| Team-scoped permissions (read-filter + write-gate) | HIGH | HIGH | P1 |
| Project-scoped guests | MEDIUM | MEDIUM (after team scope) | P2 |
| Entra OIDC SSO (env-gated, JIT, email-link) | HIGH | MEDIUM | P1 |
| SSO-only enforcement flag | MEDIUM | LOW | P2 |
| OIDC group→team mapping | MEDIUM | MEDIUM | P3 |
| Multiple named TOTP factors | HIGH | MEDIUM | P1 |
| Per-factor last-used tracking | LOW | LOW | P3 |

**Priority key:** P1 must-have for the milestone · P2 should-have · P3 future.

## Competitor Feature Analysis

| Feature | Linear | Notion | Slack | GitHub | Our Approach |
|---------|--------|--------|-------|--------|--------------|
| Multi-team membership | Members join N teams; see only their teams | Teamspaces with own member lists | One workspace membership + channel-level membership | Org membership + team membership | Join table, membership = set of teams, workspace role unchanged (Linear model) |
| Scoped permissions | Guest role × team/project invite scope; members see only their teams | Permission level × page/teamspace scope; guests page-only | Channel-level guest access (Enterprise) | Repo-level collaborator access | Scope field on membership (workspace/team/project) × existing role ladder; redaction-based read filtering |
| SSO coexistence | SSO on Business+; password fallback unless enforced | SAML/OIDC SSO; standard login remains | SSO with optional forced-SSO per workspace | SAML + password coexist; org-level enforcement | Third sign-in path, env-gated visibility, email-match linking, JIT, optional SSO-only flag |
| Multiple TOTP | N/A (uses IdP) | N/A (IdP) | Multiple factors incl. named devices | ONE TOTP device only (major user complaint); no per-device removal | Named factor rows, verify-any, remove-one with step-up, last-remove = disable, recovery codes account-level |

## Sources

- Linear docs — Members and roles (linear.app/docs/members-roles): guest = team/project invite scope; members in multiple teams see only their teams. HIGH.
- Stitchflow/SteelSync Linear user-management analyses — role × team-scope layering. MEDIUM.
- Notion Help — Sharing & permissions: teamspace permission defaults, guests page-scoped. HIGH.
- WorkOS — "Multi-tenant permissions done right: What Slack, Notion, and Linear can teach" — convergence on role × scope. HIGH.
- GitHub Docs — Configuring 2FA: single TOTP secret scannable by multiple devices; community discussions #78027 / #54699 — no second TOTP factor, no per-device removal (the gap we exploit). HIGH.
- tududi / Baserow / LangSmith self-hosted OIDC docs — hybrid vs SSO-only modes, JIT provisioning, email-match account linking. HIGH.
- PROJECT.md constraints — zero runtime dependencies, v2: keyring, redaction machinery, 404-not-403 isolation. HIGH (owner-authored).

---
*Feature research for: Projects Studio v1.6 Team Access & Federation*
*Researched: 2026-11-01*
