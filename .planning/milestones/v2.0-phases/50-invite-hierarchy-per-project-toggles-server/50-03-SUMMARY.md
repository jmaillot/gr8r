---
phase: 50-invite-hierarchy-per-project-toggles-server
plan: 03
subsystem: invite-authorization
tags: [invites, authz, hierarchy, visibility-toggle, projects]
requires: [Plan 01 mergeClientDoc pinning (toggle can never be set via client PUT), Plan 02 guest-role normalization, Phase 33 fail-closed accept pattern]
provides: [ownerInviteForbidden refusal, member-tier project-scoped guest-invite path (inviteMemberRoleCeiling/inviteMemberProjectRequired/inviteGuestToggleOff/inviteTeamsAdminOnly), invites.project nullable column, PATCH /api/workspaces/:ws/projects/:pid toggle flip (admin/owner), POST/DELETE /api/workspaces/:ws/projects/:pid/members[/:uid] surface, accept-time fail-closed toggle re-derivation, guest landing on p.members at accept]
affects: [51 client surfaces (toggle UI, share-modal guest invite), 52 transparency sweep]
tech-stack:
  added: []
  patterns: [fail-closed re-derivation before any side effect, rank-conditional invite gate, db.tx + updateDoc current-doc writes, six keyed refusals catalogued EN+FR]
key-files:
  created: [test/invite-hierarchy.test.mjs]
  modified: [server.js, test/membership.test.mjs, src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs]
key-decisions:
  - "Fail-closed toggle re-derivation at accept runs BEFORE account creation and membership writes — a stale-invite refusal leaves zero side effects and does not consume the invite (D-50-8)"
  - "Member-tier invite gate is rank-conditional inside one route: admin/owner behavior byte-preserved (incl. team invites, D-50-9); member ⇒ viewer-only + project + toggle ON on the CURRENT doc"
  - "Toggle flip is workspace-rank-gated (admin/owner) even for a project's lead who is a plain member; default OFF everywhere (absent field = OFF, creation path never writes true)"
  - "D-50-3 immediate effect pinned per surface: role demotion closes the doc-PUT gate next request (readOnlyAccess); p.members add/remove flips project readability next request"
requirements-completed: [INV-01, INV-02, INV-04, VIS-04]
estimate: { tokens: 100000, raw_tokens: 70000, tasks: 3, confidence: med }
actuals:
  tokens: 13000
  tasks: 3
  commits: 3
plan_head_before: a2f67de4d2acad623826892fb40e86a2258ec6e0
plan_head_after: 451a3140758e85bfcec573686d4f688e6bcac101
commits: 3
duration: ~90 min
completed: 2026-11-08
status: complete
---

# Phase 50 Plan 03: Invite hierarchy & per-project toggle routes Summary

The invite-authorization surface: owner-only-owner pinned at create (ownerInviteForbidden + table CHECK)/edit (ownerManagedRoles, ownerTransferOnly)/accept (CHECK makes an owner row unrepresentable), the member-tier project-scoped guest-invite path with the per-project `allowInviteGuests` toggle evaluated at create AND fail-closed at accept, and the p.members add/remove edit surface with next-request effect.

## Accomplishments

- **Task 1 — INV-01 three-point matrix + INV-04 (commit 22e98dd):** new `test/invite-hierarchy.test.mjs` on the shared visibility fixture. Create point: role 'owner' refused at every rank with `ownerInviteForbidden` — checked on the RAW body because `inviteRole()` silently coerces; unknown roles coerce to 'member' as a pinned explicit cell; raw `invites` insert with role 'owner' throws (CHECK pin). Edit point: admin→admin refused (`ownerManagedRoles`), owner edits admins, `ownerTransferOnly` for non-owners. Accept point: acceptance grants exactly the invite row's role. INV-04: one viewer account on two private projects, both served. D-50-3 role-demotion pin in test/membership.test.mjs (own server instance): member→viewer closes the doc-PUT surface on the very next request (`readOnlyAccess`), roster shows Guest, no re-login.
- **Task 2 — VIS-04 (commit 0e9a258):** nullable `invites.project` via `adapterEnsureColumn`; invite-create gate lowered to member tier with rank-conditional validation (four distinct refusal keys); admin/owner path byte-preserved and toggle-free; `PATCH /api/workspaces/:ws/projects/:pid` admin/owner-only toggle flip inside db.tx; accept route re-derives the toggle from the CURRENT doc BEFORE any account creation or membership write; an accepted project guest lands on `p.members` (D-50-1); `invitesOf`/preview expose `project`.
- **Task 3 — INV-02 surface (commit 451a314):** `POST`/`DELETE /api/workspaces/:ws/projects/:pid/members[/:uid]` (admin/owner, D-50-4 cross-admin refusal) writing p.members via `updateDoc` in db.tx. Pins: add → next request reads the private project; remove → next request omits it; admin cannot edit another admin's project access, owner can; access-list removal leaves live team-linked access in force (team authority rows untouched).
- **i18n gate:** the six new refusal codes catalogued in EN+FR (err.ownerInviteForbidden, inviteMemberRoleCeiling, inviteMemberProjectRequired, inviteGuestToggleOff, inviteTeamsAdminOnly, allowInviteGuestsRequired); catalogue-count pin updated 1710 → 1716.

## Coverage

- verification: { kind: tests, ref: "test/invite-hierarchy.test.mjs#INV-01 create/edit/accept points + CHECK pin", status: pass, human_judgment: false }
- verification: { kind: tests, ref: "test/invite-hierarchy.test.mjs#INV-04 multi-project viewer membership", status: pass, human_judgment: false }
- verification: { kind: tests, ref: "test/invite-hierarchy.test.mjs#VIS-04: default OFF, per-cause refusals, admin bypass, flip rank gate, stale accept fail-closed, guests unaffected by flip", status: pass, human_judgment: false }
- verification: { kind: tests, ref: "test/membership.test.mjs#D-50-3 role demotion closes the write surface next request", status: pass, human_judgment: false }
- verification: { kind: tests, ref: "test/membership.test.mjs#project membership edits: immediate effect, hierarchy guard, team-term coexistence", status: pass, human_judgment: false }
- verification: { kind: command, ref: "node --test --test-concurrency=2 test/invite-hierarchy.test.mjs test/membership.test.mjs → 35 pass / 0 fail", status: pass, human_judgment: false }
- verification: { kind: command, ref: "npm test → 1115 tests, 1104 pass, 0 fail (11 pre-existing skips)", status: pass, human_judgment: false }
- verification: { kind: command, ref: "grep adapterEnsureColumn invites project → line 439; 19 toggle/project references in server.js invite/accept/toggle regions", status: pass, human_judgment: false }

## Deviations from Plan

**1. [Task-boundary] Task 3's route surface landed with the Task 2 commit**
- **Found during:** Task 2 implementation
- **Issue:** the toggle flip and the project-members POST/DELETE routes share one server.js region and one test file; splitting them would have required partial staging of interleaved hunks.
- **Fix:** Task 3's commit (451a314) carries the INV-02 test pins (which exercise the already-landed routes) plus the i18n catalogue entries; the routes themselves are in 0e9a258.
- **Commit:** 0e9a258 / 451a314

**2. [Rule 1 - Bug] Fail-closed accept re-derivation moved before account creation**
- **Found during:** Task 2 (RED → GREEN)
- **Issue:** the toggle check initially sat after user resolution, so a refused stale invite still created the account (observable 409 on the retry) — a side effect before authorization.
- **Fix:** re-derivation now runs immediately after HARD-02, before readJson/user creation/membership writes; the refusal consumes nothing.
- **Files modified:** server.js
- **Commit:** 0e9a258

**3. [Test-shape] D-50-3 role-demotion pin interpretation**
- **Found during:** Task 1
- **Issue:** the plan's cell expected the project list to change on a member→viewer role change alone; in the D-49 collapsed model role does not gate project reads (visibility is the access list + live team term).
- **Fix:** the role-change immediate-effect pin uses the role-gated write surface (doc PUT → readOnlyAccess next request) and the roster label; the project-list gain/loss cell is pinned by the p.members scope edits (Task 3), which is the D-50-1/2 mechanism the plan assigns to scope/status.
- **Files modified:** test/membership.test.mjs
- **Commit:** 22e98dd

**Total deviations:** 3 (2 task-boundary, 1 bug auto-fix, 1 test-shape). **Impact:** none on the plan's truths — all five must-have truths verified.

## Authentication Gates

None.

## Known Stubs

None.

## Threat Mitigations Applied

- T-50-05: member-tier invite validation with four keyed refusals, toggle read from the CURRENT doc at create (invite route).
- T-50-06: accept-time fail-closed re-derivation before any side effect (accept route).
- T-50-07: toggle flip + membership edits behind requireWorkspace('admin') + D-50-4 cross-admin refusal; the doc-PUT side door was already closed by Plan 01's mergeClientDoc pinning (pinned by test/visibility-team.test.mjs).

## Self-Check: PASSED

- test/invite-hierarchy.test.mjs exists; server.js, test/membership.test.mjs, locales modified and committed.
- Commits 22e98dd, 0e9a258, 451a314 present in git log (measured: 3 commits over a2f67de..451a314).
- Full suite re-run green (1104 pass / 0 fail / 11 pre-existing skips).

## Next

Ready for 50-04 (last plan of the phase), then Phase 51 client surfaces.
