# Milestone v1.6 Requirements — Team Access & Federation

**Goal:** membership and sign-in get real team scoping and a second door — multi-team
membership, team/project-scoped permissions, optional Microsoft Entra SSO, and a second 2FA
method. Zero new runtime dependencies throughout.

**Source:** 4 Kanzo board tasks (#3, #4, #2, #1 — tagged planned-v1.6) + research in
`.planning/research/` (STACK, FEATURES, ARCHITECTURE, PITFALLS, SUMMARY).

## Requirements

### Multi-Team Membership (Kanzo #3 — first phase)

- [x] **TEAM-01**: A member can belong to several teams in the same workspace — team
      membership is stored in authority rows (`teams` + `team_members` join table), migrated
      additively from the current single-team membership with a pre-migration backup and a
      byte-identical second boot. The workspace role ladder (`viewer < member < admin < owner`)
      stays the ceiling — no per-team roles.
- [x] **TEAM-02**: Every surface that shows teams reads the real set: rosters list a member on
      every team they belong to, task-assignment and mention autocomplete reflect team
      membership, and project `teams[]` visibility matches.
- [x] **TEAM-03**: @team mentions fan out to all members of the mentioned team, and a user in
      two mentioned teams receives exactly one notification (dedup across overlapping teams).
- [x] **TEAM-04**: Task assignment is restricted to members whose team set intersects the
      project's `teams[]` — the assignment picker offers no one who cannot see the project.
- [x] **TEAM-05**: Team membership never lives in the client-mergeable workspace document —
      concurrent doc writes from two sessions cannot clobber a team-membership change
      (regression test).

### Scoped Permissions (Kanzo #4 — second phase)

- [x] **SCOPE-01**: A membership can carry a scope — workspace-wide (default) or limited to
      specific teams or specific projects — while its role stays the permission level; scope
      only restricts reach, never elevates it.
- [ ] **SCOPE-02**: Scoped members see only what their scope grants: server-side reads filter
      out-of-scope projects (redaction-style), writes to out-of-scope targets are rejected,
      and out-of-scope data answers 404 — no existence oracle, preserving the v1.1 isolation
      contract.
- [ ] **SCOPE-03**: Every by-id endpoint that touches a project enforces the scope — a named
      route sweep over `server.js` with a 404-matrix test per endpoint family; scoped checks
      cannot be bypassed by knowing an id.
- [ ] **SCOPE-04**: Notification and mention recipient resolution runs the same scope
      predicate — a scoped member is never assigned, mentioned or notified for content outside
      their scope.
- [ ] **SCOPE-05**: Invitations can carry a scope: the invite form lets an admin invite a user
      with team or project scope, and the invited user lands with that scope at acceptance.
- [ ] **SCOPE-06**: External collaborators can be invited to exactly one project
      (project-level guest scope) without seeing the rest of the workspace.

### Entra SSO (Kanzo #2 — third phase)

- [ ] **SSO-01**: Microsoft Entra sign-in works as a third sign-in path using the OIDC
      authorization-code flow with PKCE, hand-rolled over Node built-ins (`node:crypto`,
      `fetch`, JWKS RS256 verification, pinned tenant issuer) — zero new packages.
- [ ] **SSO-02**: SSO is env-gated and honestly hidden: when not configured, no sign-in button
      renders and the OIDC routes answer 404; `oidcEnabled` is server ground truth.
- [ ] **SSO-03**: Existing accounts link by verified email only — no linking on unverified
      claims; mismatched identities create a separate account rather than guessing.
- [ ] **SSO-04**: New users are provisioned just-in-time on first SSO login with a
      default role (env-configurable), shaped as invited members, not auto-elevated.
- [ ] **SSO-05**: SSO does not bypass 2FA — an account with TOTP enrolled still passes through
      the pending-2FA challenge after SSO authentication; the session teardown and 401
      contracts apply to SSO sessions identically.
- [ ] **SSO-06**: An env flag can make the IdP the only door: the password sign-in path is
      hidden/disabled when SSO-only is configured.
- [ ] **SSO-07**: Pending invitations for the SSO user's email are reconciled at first login —
      surfaced or accepted, never silently stranded.
- [ ] **SSO-08**: The OIDC token validation (signature, issuer, audience, expiry, state, nonce,
      PKCE) is pinned by a table-driven test suite against a mock IdP — tampered tokens,
      wrong kid, bad claims all fail closed.

### Second 2FA Factor (Kanzo #1 — last phase)

- [x] **TOTP2-01**: A user can register a second (and further) TOTP method alongside the
      first — each factor is a row in a `totp_factors` table whose secret rides the existing
      `v2:` envelope keyring through `requireTotpSecret()`; no new crypto, no change to
      recovery codes.
- [x] **TOTP2-02**: Factors are named ("Work phone") and show a last-used timestamp; a user
      can remove one factor with password step-up (and a live code from a remaining factor)
      while the others keep working.
- [x] **TOTP2-03**: Login and the pending-2FA challenge accept a code from ANY enrolled
      factor; the replay guard works per factor, and step-up (`requireTotpSecret` call sites)
      accepts any factor.
- [x] **TOTP2-04**: Removing the last factor runs the existing disable-2FA transaction — no
      half-state where 2FA is nominally on with zero factors.
- [x] **TOTP2-05**: Enrollment of a new factor requires proving the existing factor works
      (step-up) so a user cannot lock themselves out mid-flow.

## Cross-cutting (every phase)

- All new user-facing strings catalogued EN+FR; i18n-scan build gate green.
- Migrations additive-only, backup-guaranteed, byte-identical second boot, pinned in
  `test/migration.test.mjs`.
- Full suite stays green; zero new runtime dependencies (pinned by existing tests).
- OIDC identity schema decided during the first phase's planning (columns land with SSO).

## Future Requirements (deferred)

- OIDC groups → team membership mapping (needs real Entra tenant design; #1 enterprise ask
  after basic SSO).
- Stale-factor hygiene hints driven by `last_used_at`.
- Per-team admin tier (a team-scoped admin) — after team scoping proves itself.

## Out of Scope (explicit exclusions)

- **Per-team roles inside the role ladder** (admin of team A, viewer of B) — explodes the
  authorization matrix; every competitor gates it or avoids it. Scope restricts, role
  governs. (Features research, anti-features.)
- **SCIM provisioning** — already out of scope in PROJECT.md; de-provision = disable the user
  in Entra, login then fails.
- **Per-factor recovery codes** — recovery codes are the account-level break-glass; no major
  tool splits them per factor, and v1.4's "a recovery code never disables 2FA" invariant
  stays intact.
- **Auto-linking SSO identities on username or custom claims** — verified email only, else
  account takeover class.
- **Group→team mapping config surface** — future, needs a real tenant.

## Traceability

*Each REQ maps to exactly one phase.*

| REQ | Phase |
|-----|-------|
| TEAM-01 | Phase 28 |
| TEAM-02 | Phase 28 |
| TEAM-03 | Phase 28 |
| TEAM-04 | Phase 28 |
| TEAM-05 | Phase 28 |
| SCOPE-01 | Phase 29 |
| SCOPE-02 | Phase 29 |
| SCOPE-03 | Phase 29 |
| SCOPE-04 | Phase 29 |
| SCOPE-05 | Phase 29 |
| SCOPE-06 | Phase 29 |
| SSO-01 | Phase 30 |
| SSO-02 | Phase 30 |
| SSO-03 | Phase 30 |
| SSO-04 | Phase 30 |
| SSO-05 | Phase 30 |
| SSO-06 | Phase 30 |
| SSO-07 | Phase 30 |
| SSO-08 | Phase 30 |
| TOTP2-01 | Phase 31 |
| TOTP2-02 | Phase 31 |
| TOTP2-03 | Phase 31 |
| TOTP2-04 | Phase 31 |
| TOTP2-05 | Phase 31 |

Cross-cutting obligations (EN+FR catalogue, additive byte-identical migrations, green
suite, zero new deps) apply to all four phases as milestone-wide invariants, stated in
ROADMAP.md. The OIDC identity-schema decision is owned by Phase 28's planning; the
columns land in Phase 30.
