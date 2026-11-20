# Technology Stack — Entra Group Mapping (v3.2 new features)

**Project:** gr8r / Projects Studio — v3.2 Entra Group Mapping & Governance Backlog
**Researched:** 2026-11-20
**Mode:** Ecosystem (focused: claims ingestion, overage, Graph fallback, mapping config)
**Overall confidence:** HIGH (every Entra behavior below verified against live learn.microsoft.com docs dated 2025-04 → 2026-08)

**Headline: ZERO new runtime dependencies. Nothing needs to be installed.** Everything the
milestone needs is (a) an Entra-side app-registration config change, (b) JSON parsing of claims
the existing `verifyIdToken()` already returns, and (c) one new `fetch` POST for the >200-group
Graph fallback. The libraries that exist for this are explicitly things to NOT add.

---

## Recommended Stack

### 1. Entra app-registration configuration (no code)

| Setting | Value | Purpose | Why |
|---------|-------|---------|-----|
| `groupMembershipClaims` (app manifest) | `"ApplicationGroup"` (recommended) or `"SecurityGroup"` | Turns on the `groups` claim in ID/access tokens | `ApplicationGroup` emits ONLY groups explicitly assigned to the app (Enterprise apps → Users and groups → Add user/group); Microsoft explicitly recommends it for large organizations because it sidesteps the 200-group JWT limit entirely. If the tenant wants "any group you manage maps, no app assignment" then `SecurityGroup` and accept overage handling |
| Optional claim `groups` (Token configuration / `optionalClaims.idToken`) | `{"name":"groups","source":null,"essential":false,"additionalProperties":[]}` | Emits `groups` in the **ID token** (the token gr8r validates in the SSO callback) | Default emission is group **Object IDs** (GUIDs) — exactly what gr8r should match on: immutable, unique, works for cloud + synced groups. Verified: docs state "By default group object IDs are emitted in the group claim value" |
| `optionalClaims.idToken` with `additionalProperties` | Only if names are wanted | `sam_account_name` / `dns_domain_and_sam_account_name` / `netbios_domain_and_sam_account_name` (on-prem synced groups only), `cloud_displayname` (only with `ApplicationGroup`), `emit_as_roles` | **Recommendation: do NOT use any of them.** sAMAccountName variants only exist for AD-synced groups; display names are non-unique and mutable; `emit_as_roles` suppresses app roles. GUIDs are the durable key. If operators want readable names in config, that's gr8r-side UX, not a token-claim concern |

Key verified facts (optional-claims.md, updated 2026-08; how-to-connect-fed-group-claims.md, updated 2026-02):

- The `groups` claim is only emitted for **user principals** (never service principals).
- JWT limit is **200 groups** including nested; SAML is 150. **Exceeding the limit causes Entra to OMIT the `groups` claim entirely** and replace it with the overage structure (see §2) — the failure mode is absence, not truncation.
- Nested groups ARE included in claims **except** under `ApplicationGroup`, where only direct membership counts (user must be a direct member of the assigned group).
- `GroupMembershipClaims: "DirectoryRole"` emits roles as `wids`, not groups.
- The `groups` claim is documented as a **restricted claim** — its data source cannot be transformed arbitrarily via custom claim policies.

**Decision to surface to requirements:** `ApplicationGroup` + direct membership (no nesting) is
the simplest correct posture for a claims-first, snapshot-at-login design: overage becomes a
non-event, and the direct-membership rule matches how operators actually reason about
"this group = this workspace". Overage handling then becomes a hardening/fallback phase, not a
launch blocker.

### 2. Overage detection + handling (code, but tiny)

**What the token contains when >200 groups** (verified against current docs):

```json
{
  "_claim_names": { "groups": "src1" },
  "_claim_sources": {
    "src1": { "endpoint": "https://graph.microsoft.com/v1.0/users/{user-object-id}/getMemberObjects" }
  }
}
```

- `_claim_names` maps the normal claim name (`groups`) to a source key; `_claim_sources` holds
  that key with the **literal Graph endpoint URL**. No hardcoding: read `token._claim_sources[token._claim_names.groups].endpoint`.
- Also check `hasgroups: true` — that variant appears in implicit-flow tokens (>5 groups); gr8r
  uses authorization-code flow so it will see `_claim_names`, but a cheap `hasgroups` check costs
  one boolean and makes the detector total.

**Fallback call:**

```http
POST {endpoint from token}
Content-Type: application/json
Authorization: Bearer <Graph access token>

{ "securityEnabledOnly": true }
→ 200 { "value": ["<group GUID>", ...] }
```

`securityEnabledOnly: true` is the correct value (the claims pipeline emits security groups +
directory roles, not distribution lists). Response is a GUID array, same shape as the normal
claim — the mapper needs zero changes.

**Does it need an app-only token? YES — use client credentials, it's ~15 lines of plain fetch:**

```http
POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id={OIDC_CLIENT_ID}
&client_secret={OIDC_CLIENT_SECRET}
&scope=https://graph.microsoft.com/.default
→ { "access_token": "...", ... }
```

Then `POST {endpoint}` with that bearer. Why app-only and not OBO / the user's existing access token:

- Verified permission table (getMemberObjects doc): "Memberships **for other users** —
  Application: `User.ReadBasic.All` **and** `GroupMember.Read.All`". Delegated `User.Read`
  (the scope gr8r would already have) only covers `POST /me/getMemberObjects`, and the overage
  endpoint targets `/users/{oid}/…` for the *just-logged-in user* — where OBO would work but
  requires an extra token-exchange grant (`urn:ietf:params:oauth:grant-type:token-exchange`)
  plus a Graph-level token. Client credentials is the simpler, cacheable, already-secret-possessing path.
- **Tenant-admin action required:** add `GroupMember.Read.All` **application** permission to the
  app registration and have the tenant admin grant consent (one-time). This is a deploy-time
  prerequisite to document in DEPLOY.md, not code.
- This is a new Entra-side permission surface — flag it to the requirements-definer as the one
  change that widens what the app can do if the secret leaks (read any user's group membership).

**Integration points in gr8r (all confirmed against oidc.js as read):**

1. `verifyIdToken()` already returns the full parsed `claims` object — `_claim_names` /
   `_claim_sources` / `groups` / `hasgroups` ride along for free. Zero changes to the verifier.
2. Add one exported helper (e.g. `resolveGroups(claims)`) in oidc.js or a sibling `groups.js`:
   returns `{ groups: string[], overage: boolean }` — if `groups` is an array, use it; if
   overage markers present, call Graph (needs the client-credentials helper, same
   `AbortSignal.timeout(10_000)` house rule as `fetchJson`).
3. Fail-closed contract consistent with the module's own header rules: overage resolution
   failure returns `{ ok:false, reason }` — with `ApplicationGroup` this path should never fire,
   so failing the login (or treating as unmapped) is acceptable policy to pin in requirements.
4. Graph token caching: client-credentials tokens are valid ~60–90 min; cache in memory with
   expiry and reuse across logins (optional micro-optimization; a per-login fetch is also fine
   since overage should be rare-to-never).

### 3. Group → workspace / role / operator mapping (pure config + DB, no new tech)

| Element | Recommendation | Why |
|---------|----------------|-----|
| Mapping config format | New env-independent structure persisted like existing governance config (following the `WORKSPACE_CREATION` / domain-door precedent) or a small table — owner decision for requirements phase; either is dependency-free | The domain-door matrix (v3.0) is the canonical pattern: strict parse, boot-freeze, fail-closed |
| Claim values matched | Entra group **Object ID GUIDs** only | Immutable + unique + present for all group types; names collide across domains (docs' explicit warning about duplicate sAMAccountNames when multiple AD domains sync) |
| Group→operator | Same mapping table, special target ("operator") instead of a workspace role | `users.is_instance_admin` flag (D-112) already exists; mapping writes it, last-operator guard already enforced by v3.1 code — reuse the existing demotion-refusal funnel |
| Removal sync | Recompute at every SSO login from the token's group snapshot; demote/remove memberships that no longer match, subject to existing last-operator/last-owner guards | Snapshot-at-login is the locked milestone decision (no periodic reconcile, no Graph change-delta subscriptions); removal happens exactly when a fresh token is in hand — no extra machinery needed |
| Unmapped users / unmapped groups | Behave exactly as today | Fail-closed invariant already locked for this milestone |

### 4. What NOT to add (libraries that would tempt us — and why to refuse)

| Library (npm) | What it offers | Why NOT (under the zero-dependency invariant) |
|---------------|----------------|----------------------------------------------|
| `@azure/msal-node` (current ~v3.x) | Full token acquisition incl. client credentials, OBO, token cache | gr8r already acquired tokens by hand (D-01) and validates RS256 over `node:crypto`; MSAL would duplicate ~all of oidc.js, add a large transitive tree, and its cache layer is pointless for a server-side confidential client doing one token POST. The dependency test (`test/dependencies.test.mjs`) pins this invariant |
| `@microsoft/microsoft-graph-client` (+ `@azure/identity`) | Graph request pipeline, retry, batching | The fallback is ONE POST to an endpoint the token itself hands us. `fetch` + JSON.parse is the entire integration; the SDK's authProvider plumbing exists to wrap MSAL — double the dependency weight for zero gain |
| `openid-client` / `openid-client@6` (panva) | Standards-compliant OIDC client incl. claim handling | Already rejected when oidc.js was hand-rolled (v1.6); nothing about groups changes the calculus — the verifier exists, is tested, and handles the overage payload as plain JSON |
| `express-openid-connect` / middleware auth libs | Session-integrated auth glue | gr8r is bare `node:http` with its own opaque session cookies; no framework to hook into |
| `jsonwebtoken` / `jose` | JWT sign/verify | `verifyIdToken()` already does RS256 + JWK lookup + timing-safe nonce with a proven fail-closed chain |

Every "new" capability here is JSON-shaped and crypto-free: no new parsing libraries, no new
HTTP libraries, no new config libraries. **Stack delta: zero packages.**

### 5. Supporting (already present, reused)

| Existing asset | Reused for |
|----------------|-----------|
| `oidc.js` `verifyIdToken()` | Returns full claims incl. `groups` / `_claim_names` — the ingestion point |
| `oidc.js` `fetchJson()` + 10s timeout pattern | Template for the Graph client-credentials POST and getMemberObjects call |
| `readConfig()` env funnel (D-02 complete-set rule) | Any new env (e.g. `OIDC_GROUP_MAP` or similar) must follow the strict-token/fail-closed parse + 5-locale refusal precedent from v3.0's `domains.js` |
| `users.is_instance_admin` + operator console | Group→operator mapping target |
| v3.0 domain-door parse funnels (`parseDomainList` etc.) | Canonical pattern for parsing group-mapping config |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Group claim mode | `ApplicationGroup` (app-assigned groups) | `SecurityGroup` (all security groups) | SecurityGroup with big tenants → guaranteed overage → Graph permission expansion; ApplicationGroup keeps overage a never-event and forces explicit operator intent |
| Claim value | Group Object ID GUID | sAMAccountName / display name | sAMAccountName exists only for AD-synced groups (cloud groups silently absent); display names non-unique/mutable; `cloud_displayname` only works with ApplicationGroup anyway |
| Overage resolution | App-only client credentials (`GroupMember.Read.All` + `.default` scope) | OBO token exchange with user's token | OBO needs a second grant type + refresh dance; client credentials reuses the secret oidc.js already holds and caches cleanly |
| Overage endpoint | The `_claim_sources` URL from the token | Hardcoded `/users/{oid}/getMemberObjects` | Token-provided endpoint is the documented contract and survives Graph API moves |
| Group mapping source of truth | Token snapshot at login | Microsoft Graph change notifications / periodic reconcile | Violates the locked snapshot-at-login decision; adds webhooks, retries, and Graph surface for zero fidelity gain over the login moment |
| Libraries | None | MSAL / Graph SDK / openid-client | See §4 — everything is plain fetch + JSON |

## Installation

```bash
# Nothing. Zero new runtime or dev dependencies.
# Entra-side only (one-time, by the tenant admin):
#   1. App registration → Token configuration → Add groups claim (ID token)
#      — or manifest: "groupMembershipClaims": "ApplicationGroup"
#   2. If ApplicationGroup: Enterprise apps → Users and groups → assign the mapping groups
#   3. Only if overage fallback is wanted: API permissions →
#      GroupMember.Read.All (Application) → grant admin consent
```

## Sources

- Configure optional claims — learn.microsoft.com/en-us/entra/identity-platform/optional-claims (updated 2026-08-11): claim config, ApplicationGroup, additionalProperties, 200-JWT/150-SAML limits, user-principal-only
- Optional claims reference — learn.microsoft.com/en-us/entra/identity-platform/optional-claims-reference (updated 2026-08-20): `groups` claim requires `groupMembershipClaims`, restricted-claim nature
- Configure group claims for applications — learn.microsoft.com/en-us/entra/identity/hybrid/connect/how-to-connect-fed-group-claims (updated 2026-02-26): overage = claims omitted + Graph link, nested-group rules, ApplicationGroup direct-membership rule, sAMAccountName availability and collision warning
- directoryObject: getMemberObjects — learn.microsoft.com/en-us/graph/api/directoryobject-getmemberobjects (Graph v1.0): permission matrix incl. "Application: User.ReadBasic.All and GroupMember.Read.All for other users", `securityEnabledOnly` body, response shape
- gr8r local context: PROJECT.md (v3.2 goals, snapshot-at-login, zero-dep invariant), oidc.js (read in full — verifyIdToken claims passthrough, fetchJson pattern, D-01/D-02 contracts)
