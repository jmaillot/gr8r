# Requirements — v1.7 Team Visibility & Hardening

**Milestone:** v1.7 Team Visibility & Hardening
**Defined:** 2026-11-02
**Source:** Backlog 999.1 (deferred from Phase 29 UAT), v1.1 audit active reqs, v1.6 deferred items, Phase 30 review CR-01, and domain research (`.planning/research/SUMMARY.md`).

**Goal:** close every open thread from previous milestones — no new features, all debt:
team-derived project visibility, the delTeam undo trap, membership-surface hardening, the
recent-search leak, per-user settings isolation, and the compose key-rotation gap.

**Milestone-wide constraints (cross-cutting):**
- Zero runtime dependencies held (pinned by `test/dependencies.test.mjs`).
- Migrations additive-only, backup-guaranteed, byte-identical second boot (`test/migration.test.mjs`).
- The v1.6 scope contract holds: D-03 grant inversion (scope OPENS private projects), 404
  no-oracle on every project-touching endpoint, single `hiddenFor` redaction funnel.
- All new user-facing strings catalogued EN+FR; i18n-scan build gate green.
- Full suite green (803-test baseline).

## Requirements

### VIS — Team-derived project visibility (Backlog 999.1)

- [x] **VIS-01**: For every non-guest member, a project is readable if and only if the member
  is a member of at least one of the project's teams (`project.teams ∩ member.teams ≠ ∅`) OR
  the project has no teams (workspace-wide default) OR an explicit Phase-29 scope grants
  access — visibility derivation rides the single `hiddenFor()` funnel, never a second
  redaction pipeline.
- [x] **VIS-02**: The composition stays additive (union of hidden sets): the D-03 grant
  inversion survives — explicit scope still OPENS a private project even when the member's
  team set does not intersect the project's teams; the admin exemption survives.
- [x] **VIS-03**: Guest collaborators (viewer + exactly one project) stay locked to their
  granted project — team derivation never widens guest reach.
- [x] **VIS-04**: Send-time surfaces honor team-derived visibility: the reminder pass and the
  email mirror resolve visibility through the same team-intersect helper — a member is never
  reminded or emailed about a project their teams do not reach.
- [x] **VIS-05**: The named 404-matrix (per endpoint family) is extended with
  team-derivation cells: out-of-team by-id requests answer 404 with the byte-identical
  `fileNotFound`/`notFound` bodies — no existence oracle; no-team projects stay reachable
  workspace-wide.

### UNDO — delTeam undo restores memberships

- [x] **UNDO-01**: Undoing a team deletion restores the purged `team_members` authority rows:
  the client replays the membership set captured before deletion (before-map pattern) through
  the existing membership PUT route, so rosters, mentions and visibility are honest after undo.
- [x] **UNDO-02**: Members who joined or changed teams between deletion and undo are not
  clobbered by the replay — the reconciling PUT restores the deleted team's rows without
  erasing newer independent changes to other teams; a regression test pins the interaction.

### HARD — Membership-surface hardening (v1.1 audit)

- [x] **HARD-01**: The invite-accept route is guarded by the existing `sameOrigin()` check —
  same discipline as the ~35 routes already guarded.
- [x] **HARD-02**: Link-only admin invites are impossible: an admin-created invite cannot
  carry the admin role through the link-only path (enforced server-side, test-pinned).
- [x] **HARD-03**: The `firstWorkspace()` fallback is removed from the invite-accept route and
  its verbatim SSO-reconcile twin in the same commit — both resolve the workspace explicitly
  or fail closed (the seed-boot call site is legitimate and untouched).
- [x] **HARD-04**: Guest-profile spoof is closed: the accept body whitelist is pinned by a
  test proving a spoof payload (role/name smuggling) is rejected.
- [x] **HARD-05**: `sameOrigin()` and the proxy-header readers agree on multi-value
  `x-forwarded-*` handling (first-value discipline) — pinned by test.

### SEARCH — Recent-search leak

- [x] **SEARCH-01**: The recent-search redaction leak is closed: search history rows are
  filtered per the post-VIS visibility rules (no substring false-positives, no hidden-name
  leakage through `includes()` matching) — verified by table-driven tests covering
  normalization variants and hidden/visible name collisions.

### SETTINGS — Per-user settings isolation

- [x] **SETTINGS-01**: `notifPrefs` moves out of the shared workspace document into real
  per-user rows (dedicated table following the `migrateTeamMembership` pattern): additive
  migration with pre-migration backup, byte-identical second boot, row-level eligibility
  guard; the workspace document stops carrying `notifPrefs`.
- [x] **SETTINGS-02**: Notification preference reads/writes resolve from the per-user rows
  for every consumer (reminder gate, email dispatch, prefs UI) — legacy doc-carried values
  backfill once; stale clients writing the old document field are stripped, not merged.
- [x] **SETTINGS-03**: `invoices` stays out (already purged-on-write legacy data) — no
  migration; a test pins its absence from the workspace document write path.

### DEPLOY — Key-rotation env forwarding (CR-01)

- [x] **DEPLOY-01**: docker-compose forwards `MASTER_KEY_PREVIOUS` using the
  `${MASTER_KEY_PREVIOUS:-}` optional form (never `:?` — fresh installs must keep booting);
  DEPLOY.md §14 key-custody runbook updated to note compose users need no extra step.

## Traceability (v1.7 Roadmap)

| Requirement | Phase | Status |
|-------------|-------|--------|
| VIS-01 | Phase 32 | Complete |
| VIS-02 | Phase 32 | Complete |
| VIS-03 | Phase 32 | Complete |
| VIS-04 | Phase 32 | Complete |
| VIS-05 | Phase 32 | Complete |
| HARD-01 | Phase 33 | Complete |
| HARD-02 | Phase 33 | Complete |
| HARD-03 | Phase 33 | Complete |
| HARD-04 | Phase 33 | Complete |
| HARD-05 | Phase 33 | Complete |
| SETTINGS-01 | Phase 34 | Complete |
| SETTINGS-02 | Phase 34 | Complete |
| SETTINGS-03 | Phase 34 | Complete |
| SEARCH-01 | Phase 34 | Complete |
| UNDO-01 | Phase 35 | Complete |
| UNDO-02 | Phase 35 | Complete |
| DEPLOY-01 | Phase 35 | Complete |

Coverage: 17/17 requirement rows mapped (16 REQ-ID groups: VIS-01..05, UNDO-01..02,
HARD-01..05, SEARCH-01, SETTINGS-01..03, DEPLOY-01) — no orphans, no duplicates.

## Out of Scope (carried)

All items in PROJECT.md `## Out of scope` remain out; additionally this milestone adds
nothing new: no Teamspaces entity, no soft-delete trash, no CSRF token synchronizer, no
per-project membership UI, no per-user free-text search migration beyond the containment
direction fix.
