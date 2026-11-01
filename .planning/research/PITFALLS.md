# Pitfalls Research — v1.6 Team Access & Federation

**Domain:** Adding multi-team membership, team/project-scoped permissions, Entra OIDC SSO, and a second TOTP method to an existing self-hosted PM workspace (JSON workspace doc redacted-on-read/merged-on-write, revision-based optimistic concurrency, single `requireWorkspace` gate, pending-2FA challenges, versioned AES keyring, zero npm deps, i18n build gate)
**Researched:** 2026-11-01
**Confidence:** HIGH for the architecture-integration pitfalls (derived directly from PROJECT.md's documented invariants and well-established OIDC/TOTP security practice); MEDIUM for Entra-specific quirks (tenant behavior varies; verify at phase time).

## Critical Pitfalls

### Pitfall 1: Doc-merge clobbering membership edits from another session

**What goes wrong:** Team membership currently lives in `memberships` rows *and* in workspace/project doc fields (`members`, `perms`, the member's single `team` persisted in v1.4/v1.5). The moment membership becomes multi-team, the doc's `members[].teams` array becomes a second write path to the same truth. Two sessions (or a notification fan-out, or the reminder scheduler) read the doc at revision N, each adds/removes a team from `members`, both PUT — the second write re-inserts the stale member object and silently deletes the other session's team change. `mergeClientDoc()` currently *restores* access fields (`private`, `members`, `perms`, `lead`) unless the caller is admin/owner — meaning a member's own team-picker write either gets reverted by merge, or, worse, the merge restore is relaxed to let members edit their own teams and now every member PUT carries full `members` arrays that can demote or delete *other* members' rows the redaction hid from them.

**Why it happens:** The redact/merge contract was designed around "hidden rows can't be deleted" for *projects*, not around partially-visible, partially-mutable arrays inside a redacted subtree. Multi-team membership makes `members` both redacted-for-viewers *and* legitimately writable by members for their own row — the two properties now conflict.

**How to avoid:** Make team membership authority-only: `team_memberships(team_id, user_id, role?)` (or extend `memberships` with a per-team role) becomes the single source of truth, exactly like auth state moved out of the doc in v1.3 ("no auth state in the document" is the precedent to cite). The doc keeps at most a denormalized display cache that the *server* recomputes on read; the client never PUTs membership data. Alternatively, strip membership mutation from the document write path entirely and add dedicated `POST/DELETE /api/workspaces/:slug/teams/:id/members` endpoints. Extend `mergeClientDoc()` so `members[].teams` is always restored from authority regardless of caller role, and add a regression test: "member A and admin B edit different members' teams concurrently → both survive, revision conflicts surface as 409, not as silent loss."

**Warning signs:** A test that passes with a single client but fails with two; membership changes that "don't stick" after another tab is open; `mergeClientDoc()` growing a special case for `teams` on a member's own row.

**Phase to address:** Phase 1 (multi-team membership) — this is the foundational decision; Phase 4 (scoped permissions) compounds it (#4 builds on #1 per PROJECT.md).

---

### Pitfall 2: Scoped permissions bypassed by endpoints that only check workspace role

**What goes wrong:** `requireWorkspace(req, res, slug, minRole)` answers one question: "is this user at least a member of this workspace?" Once a "Membre"/invited user's permissions are limited to the team/project they were invited to, that single gate becomes a hole: every existing route — task CRUD, comments, notifications, file upload, `@member` mention parsing, activity read, the audit-trail read added in Phase 24 — still authorizes with workspace-level `member` and then hands back data from teams/projects the user was never invited to. Classic failure: the *list* endpoint is filtered correctly (the UI looks safe in UAT) but the *by-id* endpoints (`/task/:key`, `/file/:id`, comment add, watch toggle) never got the scoping check, so a scoped member can act on anything by guessing keys/ids. The existing recent-search substring leak (still an open Active item) shows exactly how this class of bug already lives in the codebase.

**Why it happens:** The check is in one chokepoint and "it already worked"; scoping is retro-fitted into the response-shaping layer (where `redactDoc()` lives) instead of the authorization layer. Developers filter the queries they remember and miss by-id routes, websocket/long-poll payloads, notification email recipient resolution, and i18n-agnostic error codes that reveal existence.

**How to avoid:** Define the scope predicate once: `canAccessProject(user, workspace, projectId)` computed from team membership ∩ project-team membership, with workspace admins/owners short-circuiting to true. Wire it into `requireWorkspace`'s resolution path for project-scoped routes (a `requireProject(slug, projectKey, minRole)` wrapper that resolves the project first, 404s on no-access to preserve the no-existence-oracle rule). Then run a route-by-route sweep and grep for every `requireWorkspace(..., 'member'|'viewer')` call site that touches project/team data — each one either gains the project check or gets an explicit "workspace-level by design" comment. Add a 404-matrix test: for each endpoint family, a scoped member requesting out-of-scope resources gets 404 (not 403, not data). Also decide explicitly whether notification delivery respects scoping — a scoped member assigned a task in another team is a product decision, but an *unscoped* mention fan-out is a leak.

**Warning signs:** Any new code calling `requireWorkspace` without a project check; the same permission logic appearing in both query builders and renderers; UAT passing because the tester only exercised the UI, which filters lists client-side.

**Phase to address:** Phase 4 (scoped permissions) — but Phase 1 must land the membership data structure this predicate reads, and the route sweep should be a named task in Phase 4's plan, not an implicit side effect.

---

### Pitfall 3: OIDC state/nonce/PKCE mistakes — and the zero-dependency crypto shortcuts around them

**What goes wrong:** With no npm dependencies, OIDC will be hand-rolled over Node built-ins. The well-known failure set applies, plus implementation-specific ones: (a) `state` generated but not compared in constant time, or stored in a cookie without `HttpOnly`/`SameSite=Lax` and cross-checked against the query param only — CSRF login injection; (b) no `nonce` in the authorization request or the `nonce` claim not compared against the ID token — token replay; (c) `id_token` validated by decoding the payload without verifying the RS256 signature against Entra's JWKS, or signature verified but `iss`/`aud`/`exp`/`azp` claims unchecked (Entra issues v1.0 and v2.0 tokens with different `iss` URLs — accept only the exact expected issuer); (d) JWKS cached forever or fetched per-request; keys rotate and sign-ins start failing hours later with no code change; (e) PKCE omitted because Entra's older flows didn't require it — it is required for public clients and cheap to add; (f) JWT verification hand-rolled with `crypto.verify` but accepting `alg: none` or HS256 confused-verifier attacks.

**Why it happens:** JWT/OIDC libraries encode dozens of checks people don't know exist; hand-rolling means rediscovering them one CVE at a time. Entra's multi-tenant/issuer-URL variety (login.microsoftonline.com/{tenantid}/v2.0 vs /organizations/ vs /common/) makes "check iss" harder than it sounds.

**How to avoid:** Use `node:crypto`'s `createVerify('RS256')` on the JWS signature, a small explicit claim checklist (iss exact-match, aud, exp+leeway≤60s, iat, nonce, azp if present), pin the issuer to the tenant-specific URL in env config, cache JWKS with a TTL plus a fetch-on-unknown-kid retry, and always use `response_type=code` + PKCE (`S256`). Write the token-validation function once, in one module, with a table-driven test suite (tampered payload, wrong iss, wrong aud, expired, wrong kid, none alg) — this is very testable and the tests are the real deliverable. Validate the whole flow against a real Entra tenant in a phase-time spike before committing to the shape.

**Warning signs:** Any `.split('.')` on a token followed by `JSON.parse` without a verify step before it; `state` stored in server memory (breaks with restarts and multi-instance, and this app is single-process Docker so memory is *acceptable* — but document it); JWKS fetched with no error path.

**Phase to address:** Phase 3 (Entra SSO). The validation module + tests should be a standalone task inside that phase, reviewed before the routes are built on top.

---

### Pitfall 4: Open redirect via post-login `next`, and session fixation on SSO sign-in

**What goes wrong:** The app already carries `?next=` through login (v1.5 email deep links) with a "path-only, no open redirect" guard — but SSO adds *two more* redirect hops (Entra `redirect_uri` round-trip, then post-login `next`), and hand-rolled OIDC code often forgets to re-apply the guard on the SSO completion route, or accepts a `next` that arrived via the *state* parameter (attacker-crafted state → attacker-controlled redirect). Session fixation: the pre-auth challenge/anonymous session cookie issued before the Entra round-trip gets *upgraded in place* to an authenticated session, or the OIDC callback reuses the pre-login session id instead of rotating it — a value an attacker may have planted or observed.

**How to avoid:** Centralize one `safeNext(next)` helper (already exists from v1.5 — find it, reuse it, don't re-implement) and call it on the SSO callback route too; never let `next` ride inside OIDC state unless the state itself is signed/stored server-side. On successful SSO login, always issue a fresh session row and cookie (rotate), delete the pre-auth challenge/session, and mirror the existing pending-2FA contract: SSO-authenticated users who have 2FA enabled must still go through the TOTP challenge — SSO must not become the 2FA bypass. (`acr`/`amr` claims from Entra tell you if the IdP did MFA, but per this app's model, local TOTP enrollment should still gate local sessions unless a deliberate decision says otherwise — record that decision explicitly.)

**Warning signs:** A redirect on the callback route built from anything other than the shared helper; `req.session` mutated rather than replaced at login; a test asserting "session cookie value changes across login" — if you don't have that test, add it.

**Phase to address:** Phase 3 (Entra SSO).

---

### Pitfall 5: Account linking confusion — email match, unverified-email takeover, and new-user provisioning

**What goes wrong:** Entra returns an email (and `preferred_username`, and an `oid` tenant claim). Three classic failures: (1) **Takeover via unverified email** — matching the local account by email without checking the ID token's `email_verified`-equivalent. Entra tokens include an `xms_edov`/verified-domain posture that varies; if the local account with that email was created via password signup, an attacker controlling a tenant user with a colliding email (cross-tenant, or a look-alike domain depending on config) signs in as the local user. (2) **Provisioning the wrong shape** — the SSO-created user gets no workspace membership, or gets a workspace-role default that silently grants more than invited members get (interacting with Pitfall 2: an SSO user provisioned as workspace `member` bypasses the entire scoped-invitation model). (3) **Linking ambiguity** — a user who signed up locally and later SSOs in ends up with two accounts, or, if auto-linking is on, the *first* match wins and the wrong one is picked when an account exists in two workspaces.

**How to avoid:** Decide and document the linking policy up front: match on email only if the IdP asserts it's verified (Entra within a single verified tenant generally is — verify the actual claim at phase time), otherwise require an explicit link flow (signed-in local user connects their SSO identity, stored as `(issuer, subject)` — match on `iss`+`sub`, never on email alone, as the durable identity key). SSO-provisioned users should be *invited-shaped*: they land with no workspace access until an invitation maps their identity to a team scope — this makes SSO compose with the v1.6 scoped-permission model instead of undermining it. Store `oidc_issuer` + `oidc_subject` columns (nullable, additive migration, byte-identical second boot) rather than overloading email.

**Warning signs:** Any `WHERE email = ?` in the SSO callback; a new user row created without a corresponding invitation or explicit default decision; migration columns that get written at boot (violates the "server never writes at boot" rule from the v1.2 locale precedent).

**Phase to address:** Phase 3 (Entra SSO), with the identity-schema decision made in Phase 1's migration work or early Phase 3 planning so the additive migration is done once.

---

### Pitfall 6: Second TOTP factor — lockout, replay-guard bypass, and keyring interactions

**What goes wrong:** Several distinct failures: (a) **Lockout** — a user enrolls a second factor, the login flow verifies against only the first (or only the second), the other device is broken/lost, and now the only path is recovery codes, which the feature was explicitly told not to touch — leaving fewer safety nets than before. (b) **Weaker-factor substitution** — login tries factors in order and the pending-2FA challenge accepts a code for *either* factor, so an attacker who has only factor 2's secret (e.g., it was generated while the user was distracted) is now a valid second-factor holder. (c) **Replay guard is per-factor in a shared table** — the existing replay guard is keyed (secret, code); a naive second-factor implementation shares the guard table or forgets to include which factor, letting one code from factor 1 replay as factor 2, or letting the same 30-second code count once per factor. (d) **Keyring/encryption drift** — factor 2 secrets must ride the same `v2:<key-id>:…` envelope pipeline; a hand-rolled second storage column that bypasses `requireTotpSecret()` reintroduces the plaintext-at-rest class Phase 19 closed. (e) **Disable lifecycle** — disable-2FA tears down `two_fa_*` columns in one transaction (Phase 21 contract); adding a second factor means that teardown, and the "recovery code can never disable" gate, and the step-up verification must now specify *which* factor is being removed — and removing factor 1 must never silently leave factor 2 as the only one while UI still shows "2FA enabled" for a secret that no longer verifies.

**How to avoid:** Model it as `totp_factors(id, user_id, label, encrypted_secret, enabled_at, last_used_code, last_used_at)` — a table, plural from day one, with the v1.5/`v2:` envelope and `requireTotpSecret()` boundary unchanged. Login verifies *any* enabled factor, but enrollment of factor 2 requires step-up (password + live TOTP on an *existing* factor) exactly like recovery-code regeneration — that's the existing precedent and it prevents both attacker-driven enrollment and lockout-by-mistake (the user proves their current device works before adding a new one). Give each factor its own replay-guard fields. Disable flow: per-factor removal plus "remove last enabled factor == full disable-2FA" reusing the Phase 21 transactional teardown path rather than forking it. Time skew: keep whatever window the first factor uses (RFC-verified ±1 step per PROJECT.md) uniformly — do not widen the window for the second factor to "fix" a mis-set phone; document the skew behavior per factor and in DEPLOY.md. Add a migration that leaves single-factor users byte-identical on second boot, and a test that factor-2 enrollment for a user with 2FA disabled is impossible (no shadow enrollment path).

**Warning signs:** A second secret column on `users`; login code that loops over secrets instead of querying an enabled-factors table; any new write path for TOTP secrets not routed through the keyring helpers; UX that lets a user delete their last factor without the full-disable contract.

**Phase to address:** Phase 4 / last phase (second 2FA method) — deliberately ordered last per PROJECT.md because it rides the keyring; do not let the enrollment UX phase start before the storage/verify module is settled.

---

### Pitfall 7: Migration hazards — byte-identical second boot vs. per-user/team additive state

**What goes wrong:** The project's hard guarantee is "second boot is a byte-identical no-op" (v1.1 tenancy, v1.2 locale, v1.3 sessions, v1.4 TOTP envelope all preserved it with nullable columns and boot-trigger-gated, transactional, backup-guaranteed migrations). v1.6 adds four migrations at once: team memberships, scoped-permission grants, OIDC identity columns, TOTP factors. Failure modes seen repeatedly in this codebase's history and generally: a migration that *normalizes* rather than *adds* (e.g., collapsing the doc's single `team` per member into a teams table and *deleting* the doc field — now the doc changed on boot 1 and boot 2 rewrites it again, or the first write after migration resurrects the stale doc field and re-creates a single-team state via the merge path); a backfill that computes derived values (default team roles, projected scoped permissions) non-deterministically; and interacting boot passes (TOTP re-wrap + new factor wrap) whose order matters but isn't pinned by a test.

**How to avoid:** Follow the established pattern exactly: additive-only columns/tables, nullable or defaulted so boot 1 writes rows and boot 2 sees them already-present and writes nothing; keep doc fields as read-only legacy (render from authority tables, ignore doc fields on write) instead of destructive removal — destructive removal belongs to a later, explicit cleanup after a shipped release proves stability. Extend `test/migration.test.mjs` with a v1.6 fixture exercising all four migrations and asserting byte-identical second boot, and pin boot-pass order with a test. Backup-before-first-write must cover the new tables (the `vacuum into` mechanism already does if the migration is in the same guarded block — verify the trigger condition includes the new passes).

**Warning signs:** A migration that UPDATEs existing rows with computed values; `git diff` of the DB dump between boot 1 and boot 2 non-empty; merge-code tests that start failing because the doc still carries `members[].team`.

**Phase to address:** Every phase touches one migration; but the *cross-cutting* migration-order test belongs in Phase 1 (first migration shipped sets the pattern) and the final milestone audit.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Keeping team membership inside the doc alongside authority tables | No route changes; UI keeps working off the doc | Two sources of truth drift; merge clobber (Pitfall 1); scoped-permission checks read the wrong source | Never — this is the one shortcut Phase 1 must refuse |
| Reusing `requireWorkspace(minRole)` for scoped routes with a filter tacked on in the query | Fast to ship scoped lists | By-id endpoints leak; every future endpoint repeats the mistake | Never for by-id/mutation routes |
| Matching OIDC identity by email | One-column linking | Account takeover via unverified email; breaks when Entra config changes | Only with verified-email assertion + explicit decision record |
| Storing factor-2 secrets in a plain column "temporarily" | Skips keyring wiring | Re-opens the plaintext-at-rest class Phase 19 closed; rotation (KEY-03) misses it | Never |
| Verifying login against factors in fixed order with short-circuit | Simpler loop | Timing/failure signals reveal which factor an attacker holds; UX inconsistency | Never |
| Skipping i18n catalogue for SSO error states ("provider unavailable") | Speed | i18n-scan build gate fails CI; error toasts empty (violates ERR-02's "no toast is ever empty") | Never — catalogue at write time, EN+FR, like every phase since v1.2 |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Microsoft Entra ID | Hardcoding `/common` or `/organizations` issuer; v1.0 vs v2.0 endpoint confusion | Pin the tenant-specific issuer in env; accept only that exact `iss`; spike against a real tenant |
| Entra JWKS | Fetching keys per request, or caching without kid-miss retry | Cache with TTL; on unknown `kid`, refetch once, then fail |
| Entra claims | Assuming `email` always present and verified | Treat claims as optional; require `iss`+`sub` for identity, email only for display/link-with-verification |
| Entra redirect URI | Mismatched redirect URI (trailing slash, http/https, `APP_URL` env drift) → `AADSTS50011` | Derive `redirect_uri` from the same `APP_URL` used for email deep links; document exact value in DEPLOY.md |
| SSO ↔ 2FA interaction | Treating IdP MFA (`amr`) as replacing local TOTP | Explicit decision: SSO users with local 2FA still see the TOTP challenge |
| Notification emails × scoping | Deep-link and mention fan-out ignore team scope | Recipient resolution runs through the same `canAccessProject` predicate (Pitfall 2) |
| Client bundle × scoped roles | UI gates on workspace role only; scoped members see dead controls or, worse, hidden-but-reachable actions | Server is the authority; UI hides what the server would 404, tested both ways |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Per-request team-membership joins computed ad hoc in every route | Duplicated SQL, inconsistent predicates | One resolved "access context" computed once per request in `requireWorkspace` | Immediately in code review; at scale in latency |
| Recomputing notification recipients with N+1 team lookups per task event | Slow assigns/mentions as teams grow | Batch membership lookup; reuse the access context | ~dozens of teams / hundreds of members |
| JWKS refetch on every sign-in | +200–500 ms login latency, Entra throttling | TTL cache | Small scale (annoyance), larger scale (rate limits) |
| Storing per-(user,team,project) grant rows without an index and scanning | Slow scoped listing | Index (workspace_id, user_id) and (team_id, user_id); the app's scale is modest — don't over-engineer beyond that | Rarely, at this product's scale |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| By-id authorization gap after scoping (Pitfall 2) | Scoped member reads/writes out-of-scope tasks/files/comments | 404-matrix test per endpoint family; route sweep in Phase 4 plan |
| Unverified-email SSO auto-link | Full account takeover of an existing local account | `iss`+`sub` identity key; verified-email gate; explicit link flow |
| Session reuse across SSO login | Session fixation | Rotate session id+cookie at every login transition; test asserts cookie changes |
| SSO bypassing 2FA | Attacker with IdP access (or phishing at IdP) skips local TOTP | Pending-2FA challenge applies after SSO callback for 2FA-enrolled users |
| Factor-2 enrollment without step-up | Attacker with a hijacked session adds their own device as factor 2 | Password + live-TOTP step-up on enrollment (existing REGEN precedent) |
| Shared replay guard across factors | Code replay across factors | Per-factor replay fields |
| `next` carried in OIDC state unsanitized | Open redirect post-login | Reuse the v1.5 path-only `safeNext()` guard on the callback |
| New SSO error strings revealing which step failed | Existence/timing oracle for accounts | Uniform error surface; 404-style indistinguishability consistent with the v1.1 no-oracle rule |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Scoped member sees workspace-wide nav (teams, members, other projects) that 404s | App feels broken; support burden | UI mirrors the server's access context; hide or disable with explanation |
| No way to see *which* teams/projects a member can access | Admins mis-configure scope unknowingly | Admin membership UI shows the effective scope per member |
| Second-factor enrollment doesn't warn "keep your first device" | Self-lockout when the new device is the only one kept | Enrollment flow shows both factors post-add; require step-up code from an existing factor at enrollment (proves the old device works) |
| Factor labels optional/unhelpful ("TOTP 2") | User can't tell devices apart in recovery situations | Prompt for a label at enrollment; show device-ish default (browser/OS if available) |
| SSO button visible when unconfigured, or hidden when configured | Confusion; users think SSO broken | Env-gated discovery (per milestone spec): endpoint advertises SSO availability only when env present |
| i18n: SSO/team strings shipped EN-only | Build gate fails, or FR UI leaks English | Catalogue EN+FR at write time; include SSO/team flows in the Chromium e2e both-locales sweep (Phase 18 precedent) |

## "Looks Done But Isn't" Checklist

- [ ] **Multi-team membership:** verify a two-session concurrency test exists — edit member A's teams in one tab, member B's in another, both survive; 409 surfaces, no silent loss
- [ ] **Multi-team membership:** verify the doc's legacy `members[].team` field is ignored on write (merge restores from authority), not just hidden in UI
- [ ] **Scoped permissions:** verify every by-id endpoint (task, comment, file, watch, activity, notification read) 404s for out-of-scope members — not just the list endpoints
- [ ] **Scoped permissions:** verify notification/mention recipient resolution is scope-filtered (and that in-scope assignment *through* SSO-provisioned users is a decided product behavior)
- [ ] **Entra SSO:** verify ID token signature, iss, aud, exp, nonce all checked in one tested function; tampered/wrong-iss/none-alg tokens rejected by unit test
- [ ] **Entra SSO:** verify session cookie rotates at SSO login; pre-auth session row deleted; `?next` re-guarded on the callback
- [ ] **Entra SSO:** verify 2FA-enrolled SSO users still hit the pending-2FA challenge
- [ ] **Entra SSO:** verify the SSO surface is invisible when env is absent (feature-detection endpoint or server-rendered flag)
- [ ] **Second TOTP:** verify login accepts *any* enabled factor and replay guard is per-factor
- [ ] **Second TOTP:** verify factor-2 enrollment required step-up on an existing factor; enrollment impossible when 2FA is disabled
- [ ] **Second TOTP:** verify removing the last factor routes through the full disable-2FA transaction (Phase 21 contract), recovery codes untouched by per-factor removal
- [ ] **All:** verify second boot is byte-identical with a v1.6-shaped database; boot-pass order pinned by test
- [ ] **All:** verify i18n-scan green with the new EN+FR keys, and Chromium e2e in both locales for each new flow

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Membership doc-clobber (Pitfall 1) | MEDIUM | Rebuild membership from authority table (if it exists) or from audit/activity rows; if truth lived only in the doc, restore from the pre-migration `vacuum into` backup and migrate again |
| Scoped-permission leak discovered post-ship | LOW–MEDIUM | Ship the missing `requireProject` wrapper; audit activity log for out-of-scope access during the exposure window |
| Wrong OIDC identity linking (bad matches) | HIGH | Identity columns make relink possible: clear `oidc_*` on affected users, re-link explicitly; communications burden |
| User locked out by factor mishap | LOW | Recovery codes (untouched by design) or operator session/2FA path; if recovery codes were also consumed, operator disable-2FA per DEPLOY.md runbook |
| Keyring miss on factor-2 secrets | MEDIUM | Follow DEPLOY.md §14 keyring-miss signature recovery; factors re-enroll, never plaintext fallback |
| Migration broke byte-identical guarantee | MEDIUM | Restore pre-migration backup, fix migration, re-boot; the backup mechanism exists for exactly this |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Doc-merge membership clobber | Phase 1 (multi-team membership) | Two-session concurrency regression test; merge restores `members` from authority regardless of caller role |
| 2. Scoped-permission bypass via by-id routes | Phase 4 (scoped permissions), predicate data from Phase 1 | 404-matrix test across all endpoint families; route sweep as a named plan task |
| 3. OIDC state/nonce/PKCE/JWKS | Phase 3 (Entra SSO) | Table-driven token-validation unit tests; live-tenant spike |
| 4. Open redirect + session fixation on SSO | Phase 3 | `safeNext` reuse on callback; cookie-rotation assertion test |
| 5. Account linking / unverified-email takeover | Phase 3 (schema decision may start in Phase 1) | `iss`+`sub` matching in code review; no `WHERE email = ?` in callback; additive nullable columns, no boot writes |
| 6. Second-factor lockout / replay / keyring | Last phase (second 2FA) | Per-factor replay test; step-up-at-enrollment test; last-factor removal routes through disable-2FA transaction; all secret writes via `requireTotpSecret()` |
| 7. Migration second-boot guarantee | Phase 1 sets pattern; final audit re-checks | Extended `test/migration.test.mjs` v1.6 fixture; boot-pass order pinned |
| Cross-cutting: i18n gate on every new surface | Each phase | i18n-scan green in CI; both-locale e2e per flow (Phase 18 precedent) |
| Cross-cutting: SSO × scoped permissions compose correctly | Phase 3 + Phase 4 integration check | SSO-provisioned user gets invited-shaped (scoped) access, not workspace `member` |

## Phase ordering note for the roadmap

The PROJECT.md ordering (membership → scoping → SSO → second 2FA) is correct and the pitfalls reinforce it: Pitfall 1 must be settled before Pitfall 2 can have a stable predicate to read; SSO (Phase 3) benefits from landing before second-2FA (Phase 4) because the SSO-callback × pending-2FA interaction needs the single-factor challenge code in place to extend; the migration-pattern test (Pitfall 7) should ship with the first migration so the remaining three follow it. The one ordering risk: if the OIDC identity schema (Pitfall 5) is deferred entirely to Phase 3, Phase 1's migration may need rework — decide the identity columns' shape during Phase 1 planning even if the columns land in Phase 3.

## Sources

- PROJECT.md (.planning/PROJECT.md) — architecture invariants: redact/merge doc model, `requireWorkspace` gate, revision concurrency, pending-2FA challenge contract, `v2:` keyring, migration guarantees, i18n build gate (HIGH — primary source, owner-maintained)
- Established OIDC/OAuth 2.0 security practice (state/nonce/PKCE, issuer pinning, JWKS caching, confused-verifier): OAuth 2.0 Security BCP (RFC 9700), OIDC Core spec, Microsoft identity platform docs (MEDIUM — verify Entra-specific claim behavior at Phase 3 spike time)
- RFC 6238 (TOTP) and the codebase's own RFC-verified implementation precedent (HIGH)
- Known account-linking/takeover failure class (unverified-email SSO linking): widely documented in SSO post-mortems (e.g., GitHub/Heroku-style email-collision takeovers) (MEDIUM–HIGH)

---
*Pitfalls research for: v1.6 Team Access & Federation (multi-team membership, scoped permissions, Entra OIDC SSO, second TOTP method)*
*Researched: 2026-11-01*
