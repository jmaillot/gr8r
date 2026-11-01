# Roadmap: Projects Studio

## v1.6 — Team Access & Federation

**Goal:** membership and sign-in get real team scoping and a second door — multi-team
membership, team/project-scoped permissions, optional Microsoft Entra SSO, and a second
2FA method. Zero new runtime dependencies throughout.

**Milestone-wide invariants (every phase, cross-cutting requirements):**
- All new user-facing strings catalogued EN+FR; i18n-scan build gate green.
- Migrations additive-only, backup-guaranteed, byte-identical second boot, pinned in
  `test/migration.test.mjs`.
- Full suite stays green; zero new runtime dependencies (pinned by existing tests).
- The OIDC identity-column schema decision is settled during **Phase 28 planning**
  (columns land with SSO in Phase 30 — cross-phase decision from research Pitfall 5).

## Phases

- [x] **Phase 28: Multi-Team Membership** - Team membership becomes a set of authority rows migrated from the single-team model; every surface reads the real set. (completed 2026-11-01)
- [ ] **Phase 29: Team/Project-Scoped Permissions** - Memberships can be scoped to specific teams or projects; scoped members see only what their scope grants, with 404-matrix proof.
- [ ] **Phase 30: Entra SSO (OIDC)** - Env-gated Microsoft Entra sign-in as a third, hand-rolled-OIDC sign-in path that composes with 2FA.
- [ ] **Phase 31: Second TOTP Factor** - A user can register multiple named TOTP factors riding the existing v2: keyring, removable individually.

## Phase Details

### Phase 28: Multi-Team Membership

**Goal**: A member belongs to a real *set* of teams stored in authority rows, and every
surface — rosters, autocomplete, assignment, @team mentions, project visibility — reads
that set instead of a single scalar. This phase establishes the migration pattern and the
authority-row discipline the rest of the milestone builds on.
**Depends on**: Nothing (first phase of v1.6)
**Requirements**: TEAM-01, TEAM-02, TEAM-03, TEAM-04, TEAM-05
**Success Criteria** (what must be TRUE):
  1. An admin can add a member to a second team and the member immediately appears on
     both team rosters, in both teams' assignment and mention autocompletes, and in the
     project `teams[]` visibility for projects tied to either team.
  2. An @team mention fans out to every member of the mentioned team, and a user in two
     simultaneously mentioned teams receives exactly one notification (dedup observed).
  3. The task-assignment picker never offers a member whose team set does not intersect
     the project's `teams[]` — no one can be assigned a task they cannot see.
  4. With two sessions editing the workspace document concurrently, a team-membership
     change in one session survives the other session's doc write (regression test green).
  5. An existing single-team install migrates additively with a pre-migration backup and a
     byte-identical second boot, pinned in `test/migration.test.mjs`.
**Plans**: 4/4 plans complete

Plans:
**Wave 1**
- [x] 28-01-PLAN.md — team_members authority: schema, guarded migration with pre-backup, admin PUT route, teams[] projection, api wrapper (tracer)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 28-02-PLAN.md — client surfaces: teams modal multiselect, member edit picker, mention dedup, picker intersection, TEAM-05 regression

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 28-03-PLAN.md — multi-team invites end-to-end (D-07), scalar sweep completion, full-suite gate

**Wave 4** *(gap closure — verification truth 6 / TEAM-04)*
- [x] 28-04-PLAN.md — picker filter gap closure: `assignableInProject` predicate wired into assignee/subassignee/ctx pickers (T-28-10 mitigation basis)

**UI hint**: yes

### Phase 29: Team/Project-Scoped Permissions

**Goal**: A membership can be limited in reach to specific teams or projects while its
role stays the permission level — scoped members see only what their scope grants,
server-side, with no existence oracle. The hardest phase: a named route sweep over every
project-touching endpoint, not a feature bolt-on.
**Depends on**: Phase 28 (consumes the `team_members` team set)
**Requirements**: SCOPE-01, SCOPE-02, SCOPE-03, SCOPE-04, SCOPE-05, SCOPE-06
**Success Criteria** (what must be TRUE):
  1. An admin can set a membership's scope to specific teams or projects, and the scoped
     member's reads filter out-of-scope projects server-side while writes to out-of-scope
     targets are rejected — out-of-scope by-id requests answer 404, never 403 or data.
  2. A by-id request to ANY project-touching endpoint with a known id but out-of-scope
     target returns 404 — proven by a 404-matrix test per endpoint family from the named
     route sweep.
  3. A scoped member is never assigned, mentioned or notified for content outside their
     scope (notification/mention resolution runs the same scope predicate).
  4. An admin can invite a user with team or project scope in the invite form, and the
     invited user lands with that scope at acceptance.
  5. An external collaborator invited with project-level guest scope sees exactly that one
     project and nothing else in the workspace.
**Plans**: TBD
**UI hint**: yes

### Phase 30: Entra SSO (OIDC)

**Goal**: When env-configured, users can sign in with Microsoft Entra via a raw-OIDC
authorization-code flow (PKCE, JWKS RS256) over Node built-ins — no sign-in button and no
routes when unconfigured. SSO composes honestly with 2FA and existing account contracts.
**Depends on**: Phase 29 (independent of it, but scheduled third per the validated build
order; consumes the Phase 28-settled OIDC identity schema)
**Requirements**: SSO-01, SSO-02, SSO-03, SSO-04, SSO-05, SSO-06, SSO-07, SSO-08
**Success Criteria** (what must be TRUE):
  1. With Entra env vars configured, a user can sign in with Entra through the OIDC
     authorization-code flow with PKCE; with them unset, no sign-in button renders and the
     OIDC routes answer 404.
  2. A user whose verified email matches an existing account signs in to that account; a
     mismatched identity creates a separate account — never links on unverified claims.
  3. A first-time SSO user is provisioned just-in-time with the env-configured default
     role, shaped as an invited member, and any pending invitation for their email is
     surfaced or accepted at first login — never silently stranded.
  4. An account with TOTP enrolled still passes through the pending-2FA challenge after
     SSO authentication, and session revocation/401 teardown applies to SSO sessions
     identically.
  5. The token-validation suite (mock IdP, table-driven) proves tampered tokens, wrong
     kid, bad issuer/audience/expiry/state/nonce/PKCE all fail closed — and with SSO-only
     configured, the password sign-in path is hidden/disabled.
**Plans**: TBD
**UI hint**: yes

### Phase 31: Second TOTP Factor

**Goal**: A user can register multiple named TOTP factors alongside the first — each a
row in `totp_factors` riding the existing `v2:` envelope keyring — with per-factor replay
guards, individual removal, and no half-states. Safest feature closes the milestone.
**Depends on**: Phase 30 (SSO×pending-2FA interaction settled; rides the v1.5 keyring)
**Requirements**: TOTP2-01, TOTP2-02, TOTP2-03, TOTP2-04, TOTP2-05
**Success Criteria** (what must be TRUE):
  1. A user can register a second (and further) named TOTP factor, and a code from ANY
     enrolled factor is accepted at login, at the pending-2FA challenge, and at every
     step-up call site.
  2. Factors list with their names and last-used timestamps; a user can remove one factor
     with password step-up plus a live code from a remaining factor, and the other factors
     keep working.
  3. Enrollment of a new factor requires proving the existing factor works (step-up) — a
     user cannot lock themselves out mid-flow.
  4. Removing the last factor runs the existing disable-2FA transaction — no state where
     2FA is nominally on with zero factors.
  5. Each factor's secret is stored as a `v2:` envelope through `requireTotpSecret()` and
     the replay guard works per factor — recovery codes and the v1.4 disable contract
     unchanged.
**Plans**: TBD

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 28. Multi-Team Membership | 4/4 | Complete    | 2026-11-01 |
| 29. Team/Project-Scoped Permissions | 0/? | Not started | - |
| 30. Entra SSO (OIDC) | 0/? | Not started | - |
| 31. Second TOTP Factor | 0/? | Not started | - |
