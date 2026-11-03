# Roadmap: Projects Studio

## v1.7 — Team Visibility & Hardening

**Goal:** close every open thread from previous milestones — no new features, all debt:
team-derived project visibility (Backlog 999.1), the delTeam undo trap, membership-surface
hardening, the recent-search leak, per-user settings isolation, and the compose key-rotation gap.

**Milestone-wide invariants (every phase, cross-cutting requirements):**
- Zero runtime dependencies held (pinned by `test/dependencies.test.mjs`).
- Migrations additive-only, backup-guaranteed, byte-identical second boot (pinned in
  `test/migration.test.mjs`).
- The v1.6 scope contract holds everywhere: D-03 grant inversion (scope OPENS private
  projects), 404 no-oracle on every project-touching endpoint, single `hiddenFor` redaction
  funnel — never a second visibility pipeline.
- All new user-facing strings catalogued EN+FR; i18n-scan build gate green.
- Full suite green (803-test baseline).

## Phases

- [x] **Phase 32: Team-Derived Project Visibility** - A project is readable iff a member's teams intersect the project's teams; no-team projects stay workspace-wide; rides the single `hiddenFor` funnel. (Backlog 999.1) (completed 2026-11-02)
- [x] **Phase 33: Membership-Surface Hardening** - Invite-accept gets sameOrigin, explicit workspace resolution (SSO twin in the same commit), no link-only admin invites, spoof closed. (v1.1 audit) (completed 2026-11-03)
- [x] **Phase 34: Per-User Settings Isolation & Search Leak Closure** - `notifPrefs` move to real per-user rows via additive migration; the substring recent-search leak closes against post-VIS visibility. (completed 2026-11-03)
- [ ] **Phase 35: Honest Undo & Deploy Gap** - delTeam undo restores purged memberships without clobbering newer changes; docker-compose forwards `MASTER_KEY_PREVIOUS`.

## Phase Details

### Phase 32: Team-Derived Project Visibility

**Goal**: For every non-guest member, project visibility derives from team membership:
`project.teams ∩ member.teams ≠ ∅` makes a project readable; a project with no teams stays
workspace-wide; the Phase-29 explicit scope remains an optional admin restriction on top
(D-03 grant inversion survives — scope still OPENS private projects). The derivation rides
the single `hiddenFor()` funnel and one shared team-intersect helper — send-time surfaces
(reminder pass, email mirror) consume the same helper. This is the backlog-999.1 item
deferred from the Phase 29 UAT session; the risky composition semantics (VIS × scope ×
admin × guest, 404-matrix extension shape) get an explicit gap-closure allowance in planning
(discuss-phase or research-phase recommended).
**Depends on**: Nothing (first phase of v1.7)
**Requirements**: VIS-01, VIS-02, VIS-03, VIS-04, VIS-05
**Success Criteria** (what must be TRUE):
  1. A member of team X can read every project tied to team X; a member of no team
     intersecting a project's teams gets 404 with the byte-identical `notFound`/`fileNotFound`
     body on by-id requests — no 403, no data, no existence oracle (extended 404-matrix,
     file-serve side door included).
  2. A project with `teams: []` remains visible to every non-guest member of the workspace,
     including SSO JIT zero-team accounts — empty-teams ⇒ workspace-wide is the predicate's
     first branch and is pinned by JIT-shaped fixtures.
  3. An explicit Phase-29 scope grant still opens a private project even when the member's
     team set does not intersect the project's teams (D-03 inversion survives), and the
     admin/owner exemption survives — the hidden set is composed additively (union), pinned
     by regression test.
  4. A guest collaborator still sees exactly their one granted project and nothing else —
     team derivation never widens guest reach.
  5. A member whose teams do not reach a project is never reminded or emailed about it:
     the reminder pass and email mirror resolve reach through the same team-intersect
     helper as `hiddenFor` (no second visibility pipeline anywhere).
**Plans**: 1/1 plans complete

Plans:
- [x] 32-01-PLAN.md — Shared team-intersect helper + hiddenFor null-scope branch + send-time adoption + full MATRIX extension (VIS-01..05, D-01..D-08)

### Phase 33: Membership-Surface Hardening

**Goal**: The invite-accept surface meets the v1.1 audit discipline the rest of the API
already follows: sameOrigin-guarded POST, no admin invites through the link-only path,
no `firstWorkspace()` fallback on the accept route (and its verbatim SSO-reconcile twin —
both changed in one commit), and a spoof-proof accept body whitelist. Independent of
Phase 32 but scheduled second so the security surface is settled while later phases touch
adjacent routes.
**Depends on**: Nothing (independent of Phase 32)
**Requirements**: HARD-01, HARD-02, HARD-03, HARD-04, HARD-05
**Success Criteria** (what must be TRUE):
  1. A cross-origin POST to the invite-accept route is rejected by the existing
     `sameOrigin()` guard — same discipline as the ~35 already-guarded routes — with the
     guard ordered before body read/throttle, and pinned behind proxy-header tests.
  2. An admin-created invite cannot carry the admin role through the link-only path —
     enforced server-side and test-pinned; every accept is email-bound.
  3. The invite-accept route and its SSO-reconcile twin resolve the workspace explicitly or
     fail closed (410 `workspaceGone` — never a cross-tenant join); both change in one
     commit and the read-path `firstWorkspace()` uses and the seed-boot call site are
     untouched.
  4. A spoof payload (role/name smuggling in the accept body) is rejected — the body
     whitelist is pinned by test.
  5. `sameOrigin()` and the proxy-header readers agree on multi-value `x-forwarded-*`
     handling (first-value discipline), pinned by test.
**Plans**: 2/2 plans complete
Plans:
- [x] 33-01-PLAN.md — accept-route sameOrigin guard + first-value header helper + silent body whitelist (HARD-01/04/05)
- [x] 33-02-PLAN.md — both twins fail closed in one commit + link-only admin invite block at both ends + boot sweep (HARD-02/03)

### Phase 34: Per-User Settings Isolation & Search Leak Closure

**Goal**: Notification preferences stop living in the shared workspace document and become
real per-user rows (`user_notif_prefs`, following the proven `migrateTeamMembership` recipe
— additive migration, pre-backup, row-level eligibility guard, byte-identical second boot),
with every consumer reading through one accessor; `invoices` stays out with a pin proving
it. On top of the Phase-32 semantics, the substring-based recent-search leak closes:
`referencesHidden` stops leaking hidden names through `includes()` matching. SETTINGS
carries the only migration of the milestone; SEARCH tunes for free once VIS landed (no
double test churn), so they share a phase.
**Depends on**: Phase 32 (search filtering and the post-VIS visibility rules must be final
before the leak tests are written)
**Requirements**: SETTINGS-01, SETTINGS-02, SETTINGS-03, SEARCH-01
**Success Criteria** (what must be TRUE):
  1. `notifPrefs` exists as real per-user rows after a guarded one-time backfill (row-level
     eligibility, `insert or ignore`, pre-migration backup); a second boot is a
     byte-identical no-op — pinned in `test/migration.test.mjs` — and the workspace document
     stops carrying `notifPrefs`.
  2. Every consumer (reminder gate, email dispatch, prefs UI) resolves preferences from the
     per-user rows through one accessor — a stale client writing the old document field has
     it stripped, not merged, and two users in the same workspace can hold different
     preferences simultaneously.
  3. A test pins that `invoices` never re-enters the workspace document write path (no
     migration; already purged-on-write).
  4. Search history redaction survives normalization variants and hidden/visible name
     collisions: no hidden project name leaks through substring matching, verified by
     table-driven tests; the residual free-text limitation is documented in
     `CHANGELOG.md`.
**Plans**: 6/6 plans complete
**UI hint**: yes

Plans:
- [x] 34-05-PLAN.md

**Wave 1**
- [x] 34-01-PLAN.md — Server prefs core: user_notif_prefs table, one accessor, GET/PUT routes, double doc strip, per-recipient consumers (SETTINGS-01/02)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 34-02-PLAN.md — migrateUserNotifPrefs guarded backfill + byte-identical second-boot pins + invoices pin (SETTINGS-01/03)
- [x] 34-04-PLAN.md — Client prefs isolation: one branching persistence adapter, per-workspace localStorage, seed removal, no-resurrect strip (SETTINGS-02) [wave 2, parallel with 02]

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 34-03-PLAN.md — Tokenized redaction matcher extraction + table-driven SEARCH-01 suite + CHANGELOG note (SEARCH-01) [wave 3, after 01's server.js edits]

### Phase 35: Honest Undo & Deploy Gap

**Goal**: Undoing a team deletion becomes honest — the purged `team_members` authority rows
are restored through the existing membership PUT route (before-map capture moved above the
purge), reconciling so newer independent changes to other teams survive — and the Phase-30
compose gap closes with `MASTER_KEY_PREVIOUS` forwarding in the optional `:-` form. Light
closer; undo tests are written after VIS semantics are final and exercised as admin
(workspace-wide, no VIS interference).
**Depends on**: Phase 32 (undo re-PUTs flow through `mergeClientDoc`, so tests need the
final VIS semantics)
**Requirements**: UNDO-01, UNDO-02, DEPLOY-01
**Success Criteria** (what must be TRUE):
  1. Undoing a team deletion restores the purged memberships: rosters, mention autocompletes
     and team-derived visibility are honest again for every member of the recreated team.
  2. A member who joined or changed teams between deletion and undo is not clobbered by the
     replay — the reconciling PUT restores only the deleted team's rows without erasing
     newer changes to other teams (regression test green).
  3. docker-compose forwards `MASTER_KEY_PREVIOUS` using the `${MASTER_KEY_PREVIOUS:-}`
     optional form — a compose-config test passes both with and without the variable set
     (fresh installs keep booting) — and DEPLOY.md §14 notes compose users need no extra
     rotation step.
**Plans**: TBD
**UI hint**: yes

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 32. Team-Derived Project Visibility | 1/1 | Complete    | 2026-11-02 |
| 33. Membership-Surface Hardening | 2/2 | Complete    | 2026-11-03 |
| 34. Per-User Settings Isolation & Search Leak Closure | 6/6 | Complete    | 2026-11-03 |
| 35. Honest Undo & Deploy Gap | 0/? | Not started | - |

## Backlog

*(Empty — Backlog 999.1 (Team-derived project visibility) is now scheduled as Phase 32 of
this milestone; no backlog items remain.)*
