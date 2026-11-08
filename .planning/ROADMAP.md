# Roadmap: gr8r

## Milestones

- ✅ **v1.0 MVP** — Phases 1-9 (shipped 2025-11-27)
- ✅ **v1.1 Security** — Phases 10-15 (shipped 2026-01)
- ✅ **v1.2 Authentication (SSO/OIDC)** — Phases 16-20 (shipped 2026-03)
- ✅ **v1.3 Invitations & Onboarding** — Phases 21-24 (shipped 2026-05)
- ✅ **v1.4 Admin Experience** — Phases 25-27 (shipped 2026-06)
- ✅ **v1.5 Integrations & Email** — Phases 28-30 (shipped 2026-09)
- ✅ **v1.6 Membership Refinement** — Phase 31 (shipped 2026-11-02)
- ✅ **v1.7 Team Visibility & Hardening** — Phases 32-35 (shipped 2026-11-04)
- ✅ **v1.8 Notification Sanity** — Phases 36-39 (shipped 2026-11-05)
- ✅ **v1.9 Digest Context & One-Click Unsubscribe** — Phases 40-44 (shipped 2026-11-07)
- ✅ **v1.10 Extensions & Adapters** — Phases 45-48 (shipped 2026-11-07)
- 🚧 **v2.0 Project-level Permissions & Invitations** — Phases 49-52 (started 2026-11-07)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-9) — SHIPPED 2025-11-27</summary>

Details: [.planning/milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)

</details>

<details>
<summary>✅ v1.10 Extensions & Adapters (Phases 45-48) — SHIPPED 2026-11-07</summary>

- [x] Phase 45: Database adapter — optional Postgres backend via env, SQLite default (7/7 plans) — completed 2026-11-07
- [x] Phase 46: MCP server — workspace operations for external MCP clients (branch feat/mcp merged e541e45; retrospective artifacts) — completed 2026-11-07
- [x] Phase 47: Command/UI hardening — fix/commands intake (branch fix/commands merged 62b1826; retrospective artifacts) — completed 2026-11-07
- [x] Phase 48: Real browser push & toasts (2/2 plans) — completed 2026-11-07

Details: [.planning/milestones/v1.10-ROADMAP.md](milestones/v1.10-ROADMAP.md)

</details>

### v2.0 Project-level Permissions & Invitations (Phases 49-52)

- [x] **Phase 49: Visibility model collapse & grant materialization** — private flag + explicit `p.members` becomes the only access model; boot sweep migrates every old path; MCP mirror in lockstep (completed 2026-11-08)
- [ ] **Phase 50: Invite hierarchy & per-project toggles (server)** — strict owner hierarchy, post-invite editing, team-share snapshot expansion, guest-invite toggle, one guest concept
- [ ] **Phase 51: Client surfaces, Permissions-page removal & project creation** — private/public toggle UI, share-modal team invite, Settings > Permissions deleted, creation setting, i18n EN+FR
- [ ] **Phase 52: Transparency view & milestone verification sweep** — member-visibility view through the funnel + full no-leak/invariant verification pass

## Phase Details

### Phase 49: Visibility model collapse & grant materialization

**Goal**: Access is decided solely by a project's private flag plus explicit membership (`p.members`) — team intersection and Phase-29 scope grants are deleted from the predicate, and a one-boot migration materializes every existing access path so no member gains or loses visibility in the swap
**Depends on**: Nothing (first phase of v2.0)
**Requirements**: MIG-01, MIG-02, MIG-03, VIS-02, VIS-03
**Success Criteria** (what must be TRUE):
  1. A member who could see a set of projects before the upgrade sees exactly the same set after one reboot (per-member × per-project set-equality fixtures: team-derived access, scope-derived access, guest/private shapes, empty-members private project)
  2. A member sees exactly the workspace's non-private projects plus the private projects they are explicitly a member of; removing their membership hides the project on the next read
  3. A non-invitee requesting a private project through any door — doc API, file serve, MCP read/list tools — receives a byte-identical 404 (404-matrix extended with the new actor × project shapes before implementation)
  4. The reminder pass, email mirror, digest and the MCP permission mirror agree with the UI predicate through the same `memberCanReadProject` helper (parity test green; `mcp.js` edited in the same phase — no over-permissive window)
  5. Second boot is a byte-identical no-op on both SQLite and pg; Phase 37/38 scheduler suppression + no-double-send invariants pass unmodified

**Plans:** 5/5 plans complete

Plans:
**Wave 1**
- [x] 49-01-PLAN.md — Test scaffolding first: 13-cell legacy fixture builder + set-equality oracle, byte-identity harness, MCP parity harness, 404 body-equality matrix rows (MIG-01, MIG-03, VIS-03)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 49-02-PLAN.md — One-boot grant-materialization sweep: materialize old-predicate grants into p.members, normalize p.access, delete p.teams, clear scope columns; guarded/backup/transactional/byte-identical (MIG-01, MIG-02)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 49-03-PLAN.md — Predicate collapse + lockstep: memberCanReadProject/hiddenFor reduce to private+p.members, scope machinery and writers deleted, MCP mirror rewritten, suites moved to the collapsed model (MIG-02, MIG-03, VIS-02, VIS-03)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 49-04-PLAN.md — Phase close: repo-wide residual grep gates, docs/ProjectPermissions.md rewrite, five success criteria individually evidenced (all REQs)

**Wave 5** *(gap closure — verification CR-01)*
- [x] 49-05-PLAN.md — Gap closure CR-01: sweep detects the pre-Phase-32 scalar `p.team` marker and normalizes it with the retired 2eec642 semantics; WR-01/WR-02 closed; WR-03 stays recorded open (MIG-01)

**Research note**: discuss-phase flagged — call-site census, fixture design, and D-xx rulings (scope-column disposition, `p.private` vs enum) land before planning. Deepest test investment of the milestone.

### Phase 50: Invite hierarchy & per-project toggles (server)

**Goal**: Invitations and their rules live at the project level — only an owner names another owner, everything about a membership is editable after the invite, teams are invited as a snapshot bulk grant, and the right to invite guests is a per-project toggle
**Depends on**: Phase 49 (new predicate; scope columns dormant)
**Requirements**: INV-01, INV-02, INV-03, INV-04, VIS-04
**Success Criteria** (what must be TRUE):
  1. Only an owner can grant the owner role — attempts by admins/owners-to-be at invite creation, role edit and invite acceptance are refused server-side (strict hierarchy at all three points)
  2. An admin/owner changes a member's role, project scope or status after the invite and the change is enforced on the very next request (no re-invite, no re-login)
  3. A project's team links are LIVE: an owner/admin linking a team to a private project grants every current team member access; a user who joins the team afterwards gains access automatically, and a user who leaves loses it unless individually invited (live team link, D-50-5 — supersedes the original snapshot wording)
  4. On a project with "members may invite guests" off, a member's guest invite is refused while an admin/owner succeeds; existing projects migrate with the toggle OFF (D2.0-1) and a stale invite accepted after the model change re-derives fail-closed
  5. The same guest account can hold membership in multiple projects — no "exactly one project" refusal remains, and the "Invité externe" distinction no longer exists server-side

**Plans:** 4 plans

Plans:
**Wave 1**
- [x] 50-01-PLAN.md — Live team link (D-50-5/INV-03): funnel + MCP mirror + mergeClientDoc pinning + Phase 49 sweep retirement, team-link 404-matrix cells first (completed 2026-11-08)

**Wave 2** *(blocked on Wave 1)*
- [ ] 50-02-PLAN.md — Guarded boot migrations: D-50-6 reverse sweep (provenance decision checkpoint) + D-50-10 guest→viewer normalization; byte-identical second boot

**Wave 3** *(blocked on Wave 2)*
- [ ] 50-03-PLAN.md — Invite routes: INV-01 hierarchy pins (create/edit/accept), INV-02 scope/status surface (p.members), VIS-04 per-project guest toggle with fail-closed accept (INV-01, INV-02, INV-04, VIS-04)

**Wave 4** *(blocked on Wave 3)*
- [ ] 50-04-PLAN.md — Phase close: docs + planning-doc lockstep (D-50-5), success-criteria evidence sweep (all REQs)

**Research note**: discuss-phase flagged — M-02 "scope" meaning under demoted D-03 and snapshotted-team-removal UX need owner clarification before planning.

### Phase 51: Client surfaces, Permissions-page removal & project creation

**Goal**: Every permission decision is visible and operable from clean client surfaces — the private/public toggle replaces the dropdown, share invites whole teams, the Settings > Permissions page is gone, and project creation is open by default with an admin restriction setting
**Depends on**: Phase 50 (routes the surfaces call)
**Requirements**: VIS-01, CRT-01, CRT-02, UX-01
**Success Criteria** (what must be TRUE):
  1. An owner/admin flips a project between private and public with a single per-project toggle, and members' project lists change accordingly (visibility-epoch refetch; a stale client that lost a project recovers honestly with a localized not-found — no silent lie)
  2. The share modal offers team invite with copy reflecting snapshot semantics ("current members of the team get access")
  3. The workspace Settings > Permissions page is removed end-to-end — no orphaned routes, actions or i18n keys; anything still relevant is relocated or explicitly dies with the model
  4. By default any member can create a project and automatically becomes its lead; with the workspace restriction on, a member sees no create affordance and the server refuses the attempt
  5. `npm run i18n:scan` passes with every new/changed surface string catalogued EN+FR (server keys included), and the removed-key leak check catches dead entries

**Plans**: TBD
**UI hint**: yes

### Phase 52: Transparency view & milestone verification sweep

**Goal**: Admins/owners can see exactly what a given member can access, computed live through the one visibility funnel — and the whole milestone's no-leak and invariant guarantees are re-verified in one clean pass
**Depends on**: Phase 51 (all surfaces shipped; the view must read the final model)
**Requirements**: TRN-01
**Success Criteria** (what must be TRUE):
  1. An admin/owner opens a transparency view for any member showing exactly the projects that member can access (non-private + explicit invites), computed server-side via `memberCanReadProject` — never from the redacted client doc
  2. The view agrees with the member's own experience: what it lists is precisely what the member's session can open (cross-checked against the redacted document)
  3. Milestone-wide verification sweep is green: full 404-matrix, Phase 38 suppression + no-double-send invariants unmodified, EN+FR i18n gate, full test suite green, zero new runtime dependencies

**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 49. Visibility model collapse & grant materialization | 5/5 | Complete    | 2026-11-08 |
| 50. Invite hierarchy & per-project toggles (server) | 0/? | Not started | - |
| 51. Client surfaces, Permissions-page removal & project creation | 0/? | Not started | - |
| 52. Transparency view & milestone verification sweep | 0/? | Not started | - |

## Milestone-wide invariants (pinned per phase)

- Phase 38 suppression + no-double-send invariants pass unmodified
- EN+FR i18n gate (server keys included) — every new surface
- Zero new runtime dependencies
- Full test suite green; byte-identical 404s (no existence oracle) on every door
- All migration/sweep/concurrency tests run on both SQLite and pg

## Backlog

*(Empty — Phase 999.1 (Phase 37 deferred UAT Test 2) was consumed by v1.9 SUBJ-01/02,
mapped to Phase 40; Phase 999.2 was consumed into Phase 48, 2026-11-07 — owner decision.
Remaining Phase 39 audit recommendations stay `proposed` pending D-05 owner rulings and
join only when validated.)*
