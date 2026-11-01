# Architecture Research — v1.6 Team Access & Federation

**Domain:** Integration research — adding multi-team membership, team/project-scoped permissions, Entra OIDC SSO, and a second TOTP factor to Projects Studio's existing `server.js` + `node:sqlite` architecture
**Researched:** 2026-11-01
**Confidence:** HIGH (grounded in first-party code: `server.js`, `.planning/PROJECT.md`; zero new external dependencies by constraint)

## Standard Architecture (as it exists today — the integration surface)

```
┌─────────────────────────────────────────────────────────────────────┐
│ HTTP surface (server.js route table, vanilla node:http)             │
│  /api/auth/*   /api/workspaces/:slug/*   SPA + /w/:slug/file/:id    │
├─────────────────────────────────────────────────────────────────────┤
│ Gates                                                               │
│  requireUser → requireWorkspace(slug, minRole)                      │
│  ROLE_RANK: viewer < member < admin < owner                         │
├─────────────────────────────────────────────────────────────────────┤
│ Authority rows (node:sqlite)              │ Document (workspaces.doc)│
│  memberships(ws,user,role,member_id,team) │  data.members[] (derived)│
│  invites(ws,…)  users  sessions           │  teams[] {members[]}     │
│  login_challenges  recovery_codes         │  projects[].teams[]      │
│  reminders_sent  audit                    │  revision (optimistic CC)│
├─────────────────────────────────────────────────────────────────────┤
│ Keyring: v2:<key-id>:<iv>:<tag>:<ct> envelopes; requireTotpSecret()  │
│ = single decrypt boundary, fail-closed 503 masterKeyMissing          │
└─────────────────────────────────────────────────────────────────────┘
```

Key existing facts this research leans on (verified in `server.js`):

- **Membership is a row, not a doc field**: `memberships(workspace_id, user_id, role, member_id, team)` — the `team` column is a *scalar* (single team per member per workspace). The doc's `teams[]` carries rosters, but the code already states "roster is authority-backed in memberships+users, rebuilt only on read" (line ~829) and `memberships.team` is synced from doc edits via a write-back (line ~1021).
- **Multi-team projects already exist**: `project.teams[]` (P3 migration at line ~544 turned scalar `team` into `teams[]`). So "a project lives in every team it belongs to" is done; what's missing is *members* being multi-team.
- **`requireWorkspace` (line 2006)** resolves slug → `membershipOf(ws.id, user.id)` → rank compare; `404` on unknown/unauthorized (no existence oracle). It returns `{ user, ws, membership }` — the natural place to hang a scoping object.
- **2FA single-factor invariants**: `users.two_fa_secret` (one envelope column), `two_fa_last_step` (D-04 replay guard, shared), `pendingTfa` in-memory Map for enrollment, `login_challenges` for pending-2FA login, `requireTotpSecret()` as the only decrypt call site, disable tears down `two_fa_*` + recovery codes + challenges in one transaction.
- **Keyring**: `v2:<key-id>:<iv>:<tag>:<ct>`, `KEYRING` Map (`MASTER_KEY` + optional `MASTER_KEY_PREVIOUS`), unknown/tampered → fail-closed. Envelope format frozen (D-K3/D-K4) but version-agnostic (`/^v\d+:/` predicate) — new consumers can adopt it without format changes.
- **OIDC constraint**: zero runtime dependencies → raw OIDC over `node:http` + `node:crypto` (fetch is built into Node; JWT signature verification is RS256 via `node:crypto` — no jsonwebtoken).

## Integration Points

### 1. Multi-team membership (#3, first phase)

**Decision: move the authority to a `team_members` table; keep `teams[]` in the doc as a display projection.**

The codebase has already converged on this direction: membership authority lives in rows, the doc is derived/redacted. A scalar `memberships.team` cannot represent N teams.

- **New table** `team_members(workspace_id, team_id, user_id, added_at, PK(workspace_id, team_id, user_id))`. Team identity: the doc's `teams[]` entries are the only team registry today (no `teams` table). Recommend adding a lightweight `teams(workspace_id, team_id, name)` authority row *or* reusing doc team names as ids — **prefer a real `teams` table** so `team_members` can foreign-key and team renames don't orphan rows.
- **Migration**: for each membership with non-null `team`, insert one `team_members` row. Same pattern as `migrateTenancy()` / `migrateTotpReWrap()`: backup first (`vacuum into`), transactional, idempotent second boot. `ensureColumn(db,'memberships','team',…)` stays (read-only legacy) or is dropped after backfill.
- **Write path**: `mergeClientDoc()` already repairs doc rosters from authority rows (line ~1016–1029 does the reverse sync for the scalar). Replace that scalar write-back with `team_members` sync: doc `teams[].members` edits → row inserts/deletes; reads rebuild rosters from rows. This *removes* the "client-side member.team edit is discarded" wart.
- **Ripples**: `@team` mention parsing, notification fan-out (currently per-recipient rows computed from `memberships.team`), `redactDoc()` team-member filtering (line ~1214), member list payloads, and the seed. Each becomes a set-query over `team_members` instead of a scalar match.

### 2. Team/project-scoped permissions (#4, compounds on #1)

**Decision: extend `requireWorkspace` rather than replace it; add a scope resolution step.**

- **New model**: `memberships.role` stays the *workspace* rank (owner/admin keep global power — the v1.5 workspace-admin tier must not be broken). Add a second, weaker axis for members/invited users: a **team/project scope**. Recommended shape: add `scope` to the existing `invites` and `memberships` rows (`scope_team_id`, nullable `scope_project_ids` JSON or a `project_access(ws, user, project_id)` table). A scoped membership = `role='member'` but limited to teams/projects where a `team_members` row (or project access row) exists.
- **`requireWorkspace` extension**: add an optional scoping parameter, e.g. `requireWorkspace(req, res, slug, minRole, { projectId })` → returns `ctx` with `membership` plus a computed `scope` object `{ full: boolean, teamIds: Set, projectIds: Set }`. Non-scoped callers (owners/admins) get `full:true`; scoped callers get the sets. Project-level endpoints then answer `403` (`projectForbidden`, new code, not 404 since the workspace is visible) and `redactDoc()` gains a new redaction rule: scoped members receive only the projects inside their scope — reusing the exact existing `redactDoc`/`mergeClientDoc` machinery, which is the strongest reason to implement #4 *after* #1 (scope sets are computed from `team_members`).
- **Client**: per-view render functions check `ctx.scope` returned by `/api/auth/me` (or a `/api/workspaces/:slug/access` payload); hidden projects already behave correctly because redaction is server-side (R5 pattern).
- **Anti-pattern to avoid**: do NOT add per-endpoint `if (scoped)` sprinkles. Every project-scoped endpoint funnels through the extended `requireWorkspace` return value; anything bypassing it fails a review checklist item, exactly like today's "every endpoint gated" invariant.

### 3. Microsoft Entra ID sign-in (OIDC, #2, third phase)

**Decision: sibling of the `/api/auth/login` family; reuses `login_challenges` as the pending-identity carrier.**

- **Routes** (inside the existing `/api/auth` dispatch chain in `server.js`):
  - `GET /api/auth/oidc/start` → builds the authorize URL (`client_id`, `code_challenge` PKCE S256, `nonce`, `state` HMAC-signed with a server secret, `redirect_uri = APP_URL + /api/auth/oidc/callback`). Sets a short-lived `login_challenges`-style row or a signed cookie holding `state`+`nonce`+`verifier`.
  - `GET /api/auth/oidc/callback` → validates state, exchanges the code (server-side fetch to the tenant's token endpoint — `https://login.microsoftonline.com/<tenant>/v2.0`), verifies the ID token (RS256, JWKS cached from the discovery document `/.well-known/openid-configuration`, `node:crypto` `createVerify('RSA-SHA256')`), then reconciles identity → session exactly like a password login would.
- **Identity reconciliation**: match by `email` claim against `users` (with case-insensitive compare, and `oidc_sub` column via `ensureColumn` on first link so a changed email doesn't hijack). Auto-provision is a product decision to surface in discuss-phase: recommend *link-or-invite only* (no auto-signup) to respect the `ALLOW_SIGNUP` flag semantics.
- **Challenge flow reuse**: a pending OIDC login whose user has 2FA inserts into `login_challenges` **unchanged** — `/api/auth/tfa/login` already verifies an opaque challenge token and never cares how the first factor succeeded. This is the single biggest integration win: OIDC = "password factor replaced," second factor semantics untouched.
- **Env gating**: config from `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET` (+ optional `ENTRA_DOMAIN`). Gate at two points: (a) routes answer `404` (no existence oracle, same philosophy as `requireWorkspace`) when unconfigured; (b) login payload includes `oidcEnabled: !!config` so the client's login view renders the "Sign in with Microsoft" button only when truthy — the same "server ground truth" pattern as `twoFa` in `authPayload` (line ~472).
- **Sessions**: created identically (opaque cookie, `sessions` row with label/IP). Consider `amr` claim stored in the session row (`oidc` vs `pwd`) so a future policy ("SSO users skip password step-up") is possible without re-schematizing.

### 4. Second TOTP factor (#1, last phase)

**Decision: new `totp_factors` table; the single-factor columns become a projection of the *primary* factor.**

- **New table** `totp_factors(user_id, factor_id, label, secret_envelope, last_step, created_at, PRIMARY KEY(user_id, factor_id))`. The `secret_envelope` column holds `v2:<key-id>:…` envelopes — the keyring and `requireTotpSecret()` are reused verbatim (the milestone brief explicitly says "rides the v1.5 keyring").
- **Boot migrations**: `migrateTotpReWrap()` re-wraps `users.two_fa_secret`. Add a one-time migration *before/alongside it*: copy the existing column into `totp_factors` as `factor_id='primary'`, keep `users.two_fa_secret/two_fa_enabled/two_fa_last_step` in sync (primary factor mirrored) so **every existing `requireTotpSecret(user.two_fa_secret)` call site, the D-04 replay guard, and the disable transaction keep working unmodified**. This is the lowest-risk shape: the second factor is pure addition.
- **Enrollment**: `POST /api/auth/tfa/factors` (password step-up, same as current enroll) → `pendingTfa` Map keyed by `userId` already stores `{secret, otpauth}` — it just needs a `factorId` in the pending entry. `POST /api/auth/tfa/factors/:id/enable` verifies the code (replay guard scoped to that factor's `last_step` row).
- **Login**: `/api/auth/tfa/login` changes minimally — after password success, the challenge row stores which factors are acceptable; the client shows a factor picker when >1. Verify loops over `totp_factors` (first match wins; D-04 replay per factor). Recovery codes are **untouched**: `recovery_codes` is keyed by user, orthogonal to factor count — the brief's constraint is free.
- **Disable**: current one-transaction teardown deletes `two_fa_*` columns + recovery codes + challenges. New semantics: "disable factor X" deletes one row; "disable 2FA entirely" deletes all factors + recovery codes — the disable route gains a factor path but the all-teardown transaction stays one transaction.
- **Order dependency**: strictly last. It reuses the keyring (v1.5, shipped) and needs no other feature; putting it last avoids the OIDC/second-factor interaction ambiguity (does an SSO login prompt for both factors? — decide in #2's phase, and OIDC-then-TOTP already composes via `login_challenges`).

## Data Flow Changes (summary)

| Flow | Today | After v1.6 |
|------|-------|------------|
| Access check | `membershipOf(ws,user)` → rank | rank **+ scope set** computed from `team_members`/project access |
| Doc read | `redactDoc(private)` | `redactDoc(private + out-of-scope projects)` |
| Doc write | `mergeClientDoc` restores hidden rows | same + restores out-of-scope project rosters |
| Team roster | `memberships.team` scalar write-back | `team_members` rows; doc rosters rebuilt on read |
| Password login | password → optional `login_challenges` → session | unchanged |
| OIDC login | — | authorize → callback → identity match → optional `login_challenges` → session |
| TOTP verify | one secret, one `last_step` | N factors, per-factor `last_step`, same replay rule |
| Keyring consumers | `users.two_fa_secret` | + `totp_factors.secret_envelope` (same `v2:` format, same `requireTotpSecret`) |

## Suggested Build Order (dependencies, matches milestone numbering)

1. **Multi-team membership (#3)** — foundation. Creates `teams` + `team_members`, migrates the scalar, rewires notifications/@team/redaction. Nothing else can compute scopes without it.
2. **Team/project-scoped permissions (#4)** — consumes `team_members` directly; extends `requireWorkspace` + `redactDoc`. Second in scope order per milestone brief ("#4 compounds on it").
3. **Entra OIDC (#2)** — independent of 1–2, but benefits from a stable auth surface; must compose with `login_challenges` which feature 4 touches. Third per brief.
4. **Second TOTP (#1)** — last per brief; reuses keyring + pending-challenge machinery that OIDC just exercised; least coupling, lowest risk isolated last.

## Anti-Patterns

### Anti-Pattern 1: Team membership stays in the doc `teams[].members`
**What people do:** keep N-membership in the JSON document because it's already there.
**Why it's wrong:** the doc is per-workspace JSON with optimistic concurrency and redaction — cross-team queries ("all projects Élodie can see") become O(doc) scans, and two concurrent team edits 409-collide on the whole document.
**Do this instead:** rows for authority (`team_members`), doc for display. This matches the existing v1.1 decision "membership is a row" and the v1.5 pattern (notification recipients are rows).

### Anti-Pattern 2: A second `two_fa_secret2` column or a JSON array in the column
**What people do:** bolt a second factor onto `users` as `two_fa_secret2` or comma-joined secrets.
**Why it's wrong:** replay-guard `two_fa_last_step` is single-valued; the disable teardown transaction and every `requireTotpSecret` call site assume one secret; array-in-column breaks the keyring re-wrap boot pass which iterates columns.
**Do this instead:** `totp_factors` rows; keep `users.two_fa_secret` as the mirrored primary factor so all existing call sites survive unchanged.

### Anti-Pattern 3: OIDC routes outside `/api/auth` or a separate auth module with its own session issuance
**What people do:** a standalone `/auth/microsoft/callback` with bespoke cookie handling.
**Why it's wrong:** two session-issuance paths = two things to revoke, two throttle regimes, and the mid-session 401 teardown contract (Phase 14) silently covers only one of them.
**Do this instead:** OIDC is a first-factor variant inside the `/api/auth` dispatch; it inserts into the same `sessions`/`login_challenges` tables and reuses the same cookie and revocation machinery.

## Scaling / Complexity Considerations

Not a scaling concern at this project's size (self-hosted, SQLite) — the relevant "scale" axis is *scope-check cost*: `team_members` lookups are indexed by `(workspace_id, user_id)`; cache the per-session scope set on the session row or compute per request (fine at SQLite speeds). No architectural adjustments needed; the monolith holds.

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `requireWorkspace` ↔ scopes | return-value extension (`ctx.scope`) | every project endpoint must consume it; checklist item |
| `redactDoc`/`mergeClientDoc` ↔ team_members | rebuild-on-read / sync-on-write | replaces the scalar `memberships.team` write-back (server.js ~1021) |
| OIDC routes ↔ `login_challenges` | row insert after identity verification | 2FA second factor composes unchanged |
| `totp_factors` ↔ keyring | same `v2:` envelope, same `requireTotpSecret()` | no new crypto code |
| Notifications/@team ↔ team_members | fan-out query change | highest ripple risk; needs a dedicated verification plan |

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Microsoft Entra ID | raw OIDC (PKCE + client secret, JWKS-verified ID token) over Node built-ins | cache discovery + JWKS with TTL; clock-skew tolerance ~2 min on `exp/nbf` |
| (none other) | — | zero new runtime dependencies is a hard constraint — no openid-client library |

## Open Questions (for discuss-phase, not blockers)

1. OIDC auto-provisioning vs link/invite-only (recommend the latter, respecting `ALLOW_SIGNUP`).
2. Do scoped members still see workspace-level surfaces (inbox, activity) or only their projects' events? Affects how deep `redactDoc` scoping goes.
3. Factor labels and factor-picker UX on login (i18n keys EN+FR, i18n-scan gate applies).
4. Should `invites` gain a team scope at creation (invite into a team) or is scoping applied post-acceptance by an admin?

---
*Architecture research for: Projects Studio v1.6 — Team Access & Federation*
*Researched: 2026-11-01*
