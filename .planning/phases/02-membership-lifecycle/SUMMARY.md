# SUMMARY — Phase 2: Membership lifecycle

Status: **complete** (lint, format check and build green; verified by a server matrix and browser
UAT as owner, admin and member).

## What shipped

The `memberships` table is now the single source of truth for access. The workspace document
still carries member profiles for presentation, but their `role` and `status` are overlaid from
the membership on every read and ignored on write for account profiles.

### Server (`server.js`)

- Helpers: `roleRank()`, `membersOf()`, `memberPayload()`, `invitesOf()`, `canManage()`,
  `assertNotLastOwner()`, `syncProfiles()`, `removeProfile()`, and `cleanupMemberships()` for
  removal/leave.
- `docForClient`: runs `syncProfiles()` so roles and statuses always follow memberships, and
  heals a missing profile for an existing membership. Also normalises legacy `last` values
  (absolute timestamps) to the document's minutes-since-activity convention.
- `docFromClient`: keeps the stored `role`/`status` for profiles with a `userId`, drops incoming
  account profiles whose user is not a member, and always keeps the stored `data.plan`.
- `GET /api/workspaces/:slug/members` (viewer; the invite list is admin-only inside the same
  payload), `PATCH`/`DELETE /api/workspaces/:slug/members/:userId` (admin), `POST
/api/workspaces/:slug/leave` (viewer).
- Role ordering: owner > admin > member/viewer. Owners can act on anyone except the last owner;
  admins can act on members, viewers and guests, and may grant admin, but cannot touch another
  admin or an owner. Self-management through the member routes is refused and redirected to
  `leave`; the last owner cannot be demoted, removed or leave.
- Removal and leave run in one transaction: delete the membership, unassign tasks and subtasks,
  remove the profile, strip the member from project membership/permissions/lead and teams, then
  bump the revision.
- `POST /api/workspaces/:slug/invites` accepts an address that already has an account; `409`
  when it is already a member. `GET /api/invites/:token` reports `existing`; accept adds the
  membership for the signed-in matching account, answers `409 {needsSignIn:true}` when the
  account exists but nobody is signed in, and `404`/`410` for unknown/used/expired links.
- `GET`/`DELETE /api/workspaces/:slug/invites[/:id]` (admin) list and revoke pending invites by
  token hash.
- `POST /api/workspaces/:slug/plan` (owner) updates only the plan. `DELETE
/api/workspaces/:slug` (owner) deletes memberships, invites, the workspace row, and returns
  `nextSlug`.

### Client

- `src/core/api.js`: `members`, `setMember`, `removeMember`, `leave`, `setPlan`,
  `deleteWorkspace`, `invites`, `revokeInvite`; `acceptInvite` surfaces `needsSignIn`; the local
  workspace list is updated on leave/delete. `API_ROLE` includes `Owner`.
- Members page loads the roster and pending invites from the server on route entry, mirrors the
  roster into `S.data.members`, and renders role controls only when the actor can manage the
  target. Role popover: owner sees four options, admin sees three (no Owner).
- Pending address invites render with **Resend** and **Revoke**; link-only invites show
  "Anyone with the link".
- Settings: owner-only plan buttons (Free/Team/Business) with confirmation, Leave workspace for
  non-owners, Delete workspace for owners behind a type-the-URL confirmation. Both navigate by
  the returned `nextSlug`, falling back to the setup screen when there is none.
- Demo mode keeps its local behaviour; server-mode actions go through the API and refetch.

## Verification

- `npm run lint`, `npm run format:check`, `npm run build` — green.
- Server matrix on a fresh database (80/80 checks): roster and invites, role promotion and
  demotion, self-management and last-owner guards, admin restrictions, document tamper
  protection, plan owner-only, invite replacement/revocation/`410`/`404`, existing-account
  acceptance and `needsSignIn`, removal cleanup (tasks, subtasks, projects), leave, workspace
  delete cascade and `nextSlug`.
- Browser UAT: owner invites a new address and revokes it; invite accepted by a new account;
  owner promotes member → admin → owner and back; admin sees three role options and no Delete;
  member sees no invite or role controls and no member-management entries in the context menu;
  owner downgrades to Free (header now shows `Free · $0`, no renewal); admin leaves and lands on
  the setup screen; owner deletes the workspace, `GET /api/workspaces/acme` becomes `404`, and
  the account has no workspaces left.

## Deviations from PLAN.md

- **Commit granularity**: T1–T3 are one API commit because they all touch `server.js` and were
  already combined in the working tree before verification; T4 and T5 remain separate commits.
  Splitting overlapping hunks after the fact would have produced commits that do not build.
- **Admin may grant admin**: the client offers Admin to an admin actor, so the server allows it;
  admins still cannot act on another admin or an owner, and only owners can grant or revoke
  owner.
- **Unknown profile hardening**: `docFromClient` drops account profiles whose `userId` is not a
  current member, so a stale tab cannot reintroduce a removed member.
- **`last` units**: new profiles store `last: 0` and legacy absolute values are converted to
  minutes on read; this avoids a transient "Invalid Date" on the members page before the roster
  refetch.
- **Plan header**: the current-plan panel now derives its price from the plan and suppresses the
  renewal line for Free, instead of hard-coding the Team price.
