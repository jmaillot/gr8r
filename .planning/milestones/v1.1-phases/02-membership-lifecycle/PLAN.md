# PLAN — Phase 2: Membership lifecycle

Reference: `SPEC.md` in this directory. One commit per task; each task ends with its own check.

## T1 — Membership helpers and profile sync

Files: `server.js`

- `roleRank()`, `membersOf(workspaceId)`, `memberPayload()`, `invitesOf(workspaceId)`,
  `canManage(actorRole, targetRole)`, `assertNotLastOwner(workspaceId, userId)`.
- `syncProfiles(doc, workspaceId)`: for every profile with a `userId` whose membership exists,
  set `role`/`status` from the membership; ensures a profile exists for each membership
  (self-heal on read).
- `docFromClient`: keep the stored `role`/`status` for profiles that have a `userId`; allow
  cosmetic fields to change. `docForClient`: call `syncProfiles` before returning.
- `removeProfile(doc, memberId)` and the "unassign tasks / leave projects" cleanup used by both
  member removal and leave.

Verify: relaunch against a copy of a migrated database; `GET /api/workspaces/:slug` still
returns the same document, with roles now sourced from memberships (flip a `memberships.role` by
hand in sqlite and confirm the served document follows).

## T2 — Member endpoints

Files: `server.js`

- `GET /api/workspaces/:slug/members` (viewer), `PATCH .../members/:userId` (admin),
  `DELETE .../members/:userId` (admin), `POST /api/workspaces/:slug/leave` (viewer).
- Enforce the ordering from the SPEC: owner > admin > (member, viewer), self-management
  redirected to `leave`, last owner protected inside the transaction.
- Removal and leave clean the document in the same transaction and bump the revision.

Verify: curl matrix with owner/admin/member/viewer fixtures — role change allowed and refused
cases, last-owner problems returning 409, removed member loses access (`GET` becomes 404) while
their tasks are unassigned.

## T3 — Invites for existing accounts, plan, delete

Files: `server.js`

- `POST /api/workspaces/:slug/invites` accepts an existing, non-member email; `409` when the
  account is already a member.
- `GET /api/invites/:token` gains `existing`; `POST .../accept` accepts from an existing session
  and answers `409 { needsSignIn: true }` when the address has an account but nobody is signed in.
- `GET`/`DELETE /api/workspaces/:slug/invites[/:id]` (admin) to list and revoke pending invites.
- `POST /api/workspaces/:slug/plan` (owner) and `DELETE /api/workspaces/:slug` (owner) returning
  `nextSlug`.

Verify: invite an existing account, accept signed in, confirm the membership appears once and
the invite is marked used; revoke an invite and confirm the link answers `404`/410; delete a
workspace as owner and confirm `nextSlug` and the cascade.

## T4 — API client

Files: `src/core/api.js`

- `members()`, `setMember()`, `removeMember()`, `leave()`, `setPlan()`, `deleteWorkspace()`,
  `invites()`, `revokeInvite()`; `acceptInvite` surfaces `needsSignIn`.
- Update the local `workspaces` list on leave/delete.

Verify: build.

## T5 — Members page and settings UI

Files: `src/actions/actions.js`, `src/pages/members.js`, `src/pages/settings.js`,
`src/overlays/context-menu.js`, `src/overlays/modals.js`, `src/actions/teams.js` (only if it
writes roles)

- Load the member list from the server on entering the members route and mirror it into
  `S.data.members`.
- Role change, remove, resend and revoke go through the API and refetch; insufficient role is
  reported with the server message.
- Pending invites render from the server list for admin+; `addInvitedMember` stops inventing
  profiles in server mode.
- Settings: Leave workspace (non-owner) / Delete workspace (owner), both confirming and
  navigating by `nextSlug`; plan buttons call the API for the owner.
- Role popover options follow the SPEC (owner sees four, admin sees three).
- Demo mode keeps its current local behaviour throughout.

Verify: browser run as owner, admin, member and viewer — role change, removal, leave,
invite, revoke, plan, delete; check that a non-admin sees no controls and that the empty state
after leaving is the no-workspace screen.

## T6 — Docs, state and ship

Files: `DEPLOY.md`, `README.md` (only if the wording needs it), `.planning/`

- Document member management, leaving, deleting, and that pending invites are revocable.
- Update `STATE.md`, `ROADMAP.md`; write `SUMMARY.md` for the phase with deviations.
- Lint, format check, build; commit per task and push.

## Risks and mitigations

| Risk                                                        | Mitigation                                                                                                                        |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Two admins editing members concurrently                     | Membership writes are small and targeted (`PATCH`/`DELETE`), not document rewrites; last-owner guard runs inside the transaction. |
| A removed member's profile still referenced by tasks        | Same-transaction cleanup (unassign, leave projects); the rest of the UI already handles a missing profile.                        |
| Client still writes `role` in `data.members` from old flows | Server ignores `role`/`status` on profiles that have a `userId`.                                                                  |
| Invite revocation leaks which invites exist                 | Only admin+ can list, and ids are token hashes.                                                                                   |

## Rollback

Phase 2 is additive: the new routes can be removed and the previous image restored; the
membership data itself was already authoritative in phase 1, so no data migration is needed.
