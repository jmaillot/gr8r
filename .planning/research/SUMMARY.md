# Project Research Summary

**Project:** Projects Studio v1.6 — Team Access & Federation
**Domain:** Self-hosted PM workspace (zero-dependency Node.js monolith) — multi-team membership, team/project-scoped permissions, Microsoft Entra OIDC SSO, second TOTP factor
**Researched:** 2026-11-01
**Confidence:** HIGH

## Executive Summary

Projects Studio is a self-hosted, zero-runtime-dependency PM workspace built on a single `server.js` monolith, `node:sqlite` authority rows, and a redacted/merged JSON workspace document. The v1.6 milestone adds four features that experts (Linear, Notion, Slack, GitHub) all build the same way: membership as a *set* of teams, permissions as *role × scope* (workspace rank stays the ceiling; team/project scope restricts reach), SSO as a third env-gated sign-in path with email-verified linking and JIT provisioning, and multiple named TOTP factors riding a per-factor envelope table. The research converges on one headline: **zero new packages** — raw OIDC (~300–400 lines over `node:crypto` + `fetch`), one join table, scope columns on existing rows, and a `totp_factors` table reusing the v1.5 keyring verbatim.

The recommended build order matches PROJECT.md's own sequencing: multi-team membership first (every other feature reads the team set), scoped permissions second (consumes the set, extends `requireWorkspace` + `redactDoc`), Entra SSO third (independent but must compose with the pending-2FA challenge contract), second TOTP factor last (pure addition on the proven keyring). Phases 1 and 4 can plan from codebase patterns alone; Phase 2 (scoping) needs the deepest plan-level work because it is a route-by-route authorization sweep, not a feature bolt-on.

The dominant risks are all integration, not acquisition: (1) membership truth leaking into the client-mergeable doc and getting clobbered by concurrent writes — authority rows only; (2) scoped-permission bypass through by-id endpoints that only check workspace role — a named `requireProject` wrapper plus a 404-matrix test per endpoint family; (3) hand-rolled OIDC mistakes (state/nonce/PKCE, JWKS caching, issuer pinning, unverified-email account takeover) — one tested token-validation module with a table-driven suite and a live-tenant spike; (4) migration regressions against the byte-identical-second-boot guarantee — additive-only migrations pinned by an extended `test/migration.test.mjs` fixture from Phase 1 onward.

## Key Findings

### Recommended Stack

**Zero new dependencies — runtime or dev.** All four features build on what the project already runs; the work is implementation, not acquisition (see STACK.md).

**Core technologies (all existing):**
- **Node.js ≥ 24 built-ins** (`node:crypto`, global `fetch`, `Buffer` base64url): PKCE, state/nonce, RS256/RS384 JWKS verification via `crypto.createPublicKey({format:'jwk'})` + `crypto.verify` — everything the hand-rolled OIDC flow needs, verified against official Node v24 docs.
- **node:sqlite** + existing migration machinery (`vacuum into` backup, transactional, byte-identical second boot): four schema additions — `team_members` join table, scope columns on `memberships`/`invites`, `totp_factors` table, `sso_identities` + `oidc_states` tables.
- **Existing keyring (`v2:` envelopes, `requireTotpSecret()`)**: second TOTP factor is "another row," zero crypto changes.
- **Mock IdP in tests** (~50-line `node:http` server): real Entra can't run in CI; the mock enables tampered-token/kid-swap/negative-claim tests Playwright can't intercept.

**Do NOT use:** MSAL/openid-client/jsonwebtoken/jose (runtime deps violate the hard constraint); team membership in the workspace doc (client-mergeable, no indexed lookup); `common` tenant endpoint (pin `ENTRA_TENANT_ID`); SSO bypassing the TOTP challenge.

### Expected Features

See FEATURES.md for the full Linear/Notion/Slack/GitHub comparison.

**Must have (table stakes):**
- Member visible in every team they belong to; rosters/assignment/@team read the team *set* (with dedup'd notifications)
- Task assignment filtered to members who can actually see the project
- Scoped members see only their team/project — server-side read filtering (redaction pattern) + write rejection, **404 not 403** on out-of-scope data
- SSO as an env-gated additional sign-in path (button only when configured; routes 404 otherwise)
- Multiple named TOTP factors, revocable individually, verify-any-at-login

**Should have (competitive):**
- Named factors + per-factor `last_used_at` — beats GitHub's own 2FA (their #1 long-running community complaint)
- Project-level guest scope (rides the same mechanism as team scope)
- SSO-only enforcement flag (`PASSWORD_AUTH_ENABLED=false`) — nearly free, completes the env-configured story
- JIT provisioning with default role (`OIDC_DEFAULT_ROLE`) + pending-invite reconciliation at SSO login

**Defer (v2+):**
- OIDC groups → team mapping (needs real tenants to design against)
- SCIM (explicitly out of scope per PROJECT.md)
- Per-team admin tier

**Anti-features (refuse):** per-team roles inside the role ladder (explodes the auth matrix — Linear keeps role workspace-level); per-factor recovery codes (account-level break-glass stays); auto-linking on anything but verified email.

### Architecture Approach

The existing monolith holds; no architectural change is needed (see ARCHITECTURE.md). The integration surface is well-defined: `requireWorkspace` gains an optional context arg returning `ctx.scope` (computed once per request from `team_members`); `redactDoc`/`mergeClientDoc` gain scope-based redaction and authority-restores; OIDC lives inside the `/api/auth` dispatch as a *first-factor variant* reusing `sessions`, `login_challenges`, cookies, and revocation unchanged — the single biggest integration win; `totp_factors` mirrors the primary factor into `users.two_fa_secret` so every existing call site survives unmodified.

**Major components:**
1. **`teams` + `team_members` tables** — authority for membership; doc `teams[].members` becomes a display projection rebuilt on read
2. **Extended `requireWorkspace`** — role rank + scope set resolution; every project-scoped endpoint consumes `ctx.scope` (checklist invariant, no per-endpoint sprinkles)
3. **Raw OIDC module** — discovery/authorize/PKCE/token/JWKS-verify in one module with table-driven tests; identity key is `(issuer, subject)`, email only for verified linking/display
4. **`totp_factors` table** — per-factor envelope, per-factor replay guard, last-factor removal = existing disable-2FA transaction

### Critical Pitfalls

See PITFALLS.md for all seven plus the "looks done but isn't" checklist.

1. **Doc-merge clobbering membership edits** (Phase 1) — membership authority in rows only; `mergeClientDoc` always restores `members[].teams` from authority; two-session concurrency regression test is the gate.
2. **Scoped permissions bypassed via by-id endpoints** (Phase 2/4) — one `canAccessProject` predicate wired into a `requireProject` wrapper; route-by-route sweep as a *named plan task*; 404-matrix test per endpoint family; notification fan-out runs the same predicate.
3. **Hand-rolled OIDC crypto/claim mistakes** (Phase 3) — state/nonce/PKCE always; exact issuer pinning (Entra's `/v2.0` trailing path matters); JWKS TTL cache + kid-miss refetch; full signature + claim checklist before any trust; reject `alg:none`/HS256 explicitly.
4. **SSO account takeover via unverified-email linking** (Phase 3) — match on `iss`+`sub`, never email alone; verified-email gate; session cookie rotation at every login transition; `safeNext()` reused on the callback.
5. **Migration breaks byte-identical second boot** (all phases) — additive-only, nullable/defaulted; no boot-time writes; v1.6 fixture in `test/migration.test.mjs`; boot-pass order pinned by test. **Key cross-phase decision:** the OIDC identity columns' shape must be decided during Phase 1 planning even though they land in Phase 3.

## Implications for Roadmap

Based on combined research, suggested phase structure (matches PROJECT.md's own ordering, which research validates):

### Phase 1: Multi-Team Membership
**Rationale:** Foundation — scoped permissions compute their predicate from the team set; nothing else can proceed without it. Also sets the migration pattern (Pitfall 7) for the whole milestone.
**Delivers:** `teams` + `team_members` tables, scalar→set migration, `mergeClientDoc` sync replacement, rosters/assignment/@team/notification rewiring with dedup, two-session concurrency test.
**Addresses:** "Member visible in every team," assignment filtering, @team fan-out (P1 items).
**Avoids:** Pitfall 1 (doc clobber), Pitfall 7 (migration guarantee). **Also decides:** OIDC identity column shape (Pitfall 5's cross-phase note) and the `oidc_states`/`sso_identities` schema.

### Phase 2: Team/Project-Scoped Permissions
**Rationale:** Compounds directly on Phase 1's `team_members` (PROJECT.md: #3 before #4); must ship with its route sweep, not after it.
**Delivers:** `scope` columns on `memberships`/`invites`, `ctx.scope` in extended `requireWorkspace`, `requireProject` wrapper, redaction extension, scoped-invite UI with effective-scope display, 404-matrix test suite.
**Addresses:** "Scoped members see only their team/project" (highest complexity, P1); project-level guest scope rides the same plumbing.
**Avoids:** Pitfall 2 (by-id bypass). **Rule encoded in tests:** scope restricts, never elevates; admin/owner ignore scope.

### Phase 3: Entra OIDC SSO
**Rationale:** Independent of Phases 1–2 but must compose with the pending-2FA contract that Phase 4 touches; landing it before second-2FA lets the SSO×TOTP interaction be decided once.
**Delivers:** Raw OIDC module (discovery/PKCE/token/JWKS), `/api/auth/oidc/start` + `/callback`, `sso_identities`/`oidc_states`, env-gated login button, JIT provisioning (invited-shaped), optional SSO-only flag, mock IdP test suite.
**Addresses:** Env-gated SSO, JIT + email-match linking, SSO enforcement toggle (P1/P2).
**Avoids:** Pitfalls 3, 4, 5. Requires a **live-tenant spike** at phase time.

### Phase 4: Second TOTP Factor
**Rationale:** Strictly last — pure addition on the proven keyring, lowest coupling, and the SSO-callback×pending-2FA interaction is settled by then.
**Delivers:** `totp_factors` table + primary-factor mirror migration, enroll-with-step-up, factor picker at login, per-factor replay guards, per-factor removal with last-factor = full-disable transaction, recovery codes untouched.
**Addresses:** Multiple named factors, per-factor revocation, last-used tracking (P1 + cheap P3).
**Avoids:** Pitfall 6 (lockout/replay/keyring drift).

### Phase Ordering Rationale

- **Dependency chain:** scoping reads `team_members` (1→2); SSO × 2FA interaction needs single-factor challenge in place before factor N (3→4); migration pattern established once in Phase 1 propagates to the other three.
- **Risk ordering:** the two hardest features (scoping sweep, OIDC) land mid-milestone when the foundation is stable; the safest feature closes.
- **Cross-cutting gates:** i18n EN+FR catalogue at write time (build gate fails CI otherwise) and byte-identical-boot fixture apply to *every* phase — the roadmapper should state them as milestone-wide invariants, not per-phase tasks.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Scoped permissions):** route-by-route authorization sweep across every `requireWorkspace` call site; scoping depth for workspace-level surfaces (inbox/activity) is an open product question — use `/gsd-plan-phase --research-phase` or at minimum a thorough discuss-phase.
- **Phase 3 (Entra SSO):** Entra-specific claim behavior varies by tenant config (`xms_edov`, verified-domain posture); needs a live-tenant spike and the linking-policy decision (auto-provision vs link/invite-only) before routes are built.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Multi-team membership):** join-table + migration follows the codebase's own `migrateTenancy` precedent; patterns are internal.
- **Phase 4 (Second TOTP):** rides the shipped keyring verbatim; the architecture research fully specifies it.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Entra endpoints/params and node:crypto APIs verified via Context7 against official Microsoft and Node v24 docs; zero-dep conclusion grounded in verified built-in capabilities |
| Features | HIGH | Patterns verified against Linear/Notion/GitHub/WorkOS docs; app-specific complexity assessed against PROJECT.md |
| Architecture | HIGH | Derived directly from first-party `server.js` code with line-level references; all integration points verified against existing invariants |
| Pitfalls | HIGH (integration) / MEDIUM (Entra quirks) | Integration pitfalls derived from documented project invariants; tenant-specific claim behavior must be verified at Phase 3 spike time |

**Overall confidence:** HIGH

### Gaps to Address

- **Entra claim behavior in a real tenant** (`email_verified`-equivalent, `xms_edov`, group claims): resolve via a Phase 3 live-tenant spike before the linking policy is finalized.
- **Scoping depth for workspace-level surfaces** (do scoped members see inbox/activity beyond their projects?): product decision for discuss-phase of Phase 2.
- **OIDC linking policy** (auto-provision vs link/invite-only; recommended: link/invite-only respecting `ALLOW_SIGNUP`): decide in Phase 1 planning (schema) and confirm in Phase 3 discuss.
- **Invite-time vs post-acceptance scoping** (is a team scope set at invite creation or by an admin afterwards?): open question for Phase 2 discuss-phase.
- **SSO MFA semantics** (does Entra `amr` MFA substitute local TOTP?): recommend no — record the explicit decision in Phase 3.

## Sources

### Primary (HIGH confidence)
- Context7 `/websites/learn_microsoft_en-us_entra_identity-platform` — authorization code flow, PKCE params, token endpoint, issuer format
- Context7 `/websites/nodejs_latest-v24_x_api` — `createPublicKey` JWK, `crypto.verify`, base64url
- `.planning/PROJECT.md` + `server.js` — architecture invariants, migration precedents, keyring, challenge contracts (owner-maintained ground truth)
- Linear docs (members/roles), Notion Help (sharing/permissions), WorkOS multi-tenant permissions analysis, GitHub 2FA docs + community #78027/#54699
- tududi / Baserow / LangSmith self-hosted OIDC docs — hybrid vs SSO-only, JIT, email-match linking

### Secondary (MEDIUM confidence)
- OAuth 2.0 Security BCP (RFC 9700), OIDC Core spec — state/nonce/PKCE, issuer pinning, JWKS caching practice
- Stitchflow/SteelSync Linear user-management analyses — role × scope layering
- Widely documented unverified-email SSO takeover class (GitHub/Heroku-style post-mortems)

### Tertiary (LOW confidence)
- Entra tenant-specific claim behavior (`xms_edov`, group claims) — verify at Phase 3 spike time

---
*Research completed: 2026-11-01*
*Ready for roadmap: yes*
