# SPEC — Phase 2: Membership lifecycle

Phase 1 made a workspace the tenant boundary and put role checks on the workspace and invite
routes. Phase 2 makes **`memberships` the single source of truth for access** and gives the
members page real endpoints instead of rewriting the document.

Reference for what already exists: `../01-tenancy-foundation/SUMMARY.md` and `SPEC.md`.

## What the document is, and is not

Two layers, and they must not be confused again:

- **Authority** — `memberships(workspace_id, user_id, role, member_id)`. Only the server writes
  it. It decides who may read or write a workspace, and what they may do there.
- **Profile** — the `members` array inside the workspace document (`name`, `email`, `team`,
  `title`, colour, `status`, `userId`). It is presentation: assignees, avatars, team rosters.
  It may also hold people who have **no account** (an assignee name typed by hand).

Rules that follow from that:

1. On read (`docForClient`), the server overlays `role` and `status` of every profile that has a
   `userId` from that account's membership. A profile cannot claim a role the membership does not
   grant.
2. On write (`docFromClient`), the server **ignores** incoming `role`/`status` for profiles with a
   `userId`, keeping the stored values. Presentations fields (name, team, title, colour) still
   follow the document.
3. Membership changes (accept, role change, removal, leave) update the profile in the same
   transaction so the two never drift.

## Endpoints

All require a session and are scoped by slug. `min` is the minimum role, using
`viewer < member < admin < owner`.

| Method | Path                                    | min    | Body                    | Result                                             |
| ------ | --------------------------------------- | ------ | ----------------------- | -------------------------------------------------- |
| GET    | `/api/workspaces/:slug/members`         | viewer | —                       | `{ members, invites }` — `invites` only for admin+ |
| PATCH  | `/api/workspaces/:slug/members/:userId` | admin  | `{ role, team, title }` | updated member                                     |
| DELETE | `/api/workspaces/:slug/members/:userId` | admin  | —                       | `{ removed: true, userId }`                        |
| POST   | `/api/workspaces/:slug/leave`           | viewer | —                       | `{ left: true, nextSlug }`                         |
| POST   | `/api/workspaces/:slug/plan`            | owner  | `{ plan }`              | `{ plan }`                                         |
| DELETE | `/api/workspaces/:slug`                 | owner  | —                       | `{ deleted: true, nextSlug }`                      |
| GET    | `/api/workspaces/:slug/invites`         | admin  | —                       | `{ invites }` (pending only)                       |
| DELETE | `/api/workspaces/:slug/invites/:id`     | admin  | —                       | `{ revoked: true }`                                |

`id` for an invite is its `token_hash`: stable, opaque, and useless without the raw token, which
is only ever shown once at creation. Its format is validated (`^[0-9a-f]{64}$`).

### Member object

```json
{
  "userId": "…",
  "memberId": "m_…",
  "name": "Carol",
  "email": "carol@x.test",
  "role": "admin",
  "roleLabel": "Admin",
  "team": "eng",
  "title": "Engineer",
  "status": "active",
  "lastLoginAt": 1760000000000,
  "joinedAt": 1750000000000,
  "isSelf": false
}
```

### Role and removal rules

Applied server-side, in this order:

1. `owner` acting on anyone: allowed, except demoting the last owner.
2. `admin` acting on `member`/`viewer`: allowed.
3. `admin` acting on `owner`/`admin`: `403` — only an owner manages equals and betters.
4. Nobody changes or removes **themselves** through these routes: use `leave` for yourself.
5. The last owner cannot be demoted, removed, or leave. An owner must promote someone to `owner`
   first. Guarded by a count inside the transaction.

### Removing a member

One transaction:

- delete the `memberships` row;
- unassign their open tasks (`tasks[].assignee = null`), remove them from `projects[].members` and
  `projects[].lead` is left as-is only if the lead still exists — otherwise cleared;
- remove their profile from the document;
- bump the document revision.

Their sessions are **not** revoked: the same account may belong to other workspaces.

### Invites, including for existing accounts

- `POST /api/workspaces/:slug/invites` (unchanged shape) now also accepts an email that belongs to
  an existing account, as long as that account is not already a member (`409` if it is). This is
  the only place phase 1 refused a legitimate case.
- `GET /api/invites/:token` adds `existing: true` when the address already has an account, so the
  join page can say "Sign in to accept" instead of asking for a password.
- `POST /api/invites/:token/accept`:
  - signed in and `session.email` equals `invite.email` → add the membership, mark the invite used,
    return `{ user, workspace }`;
  - not signed in but the account exists → `409 { needsSignIn: true }`;
  - otherwise create the account (phase 1 behaviour).
- A used, expired or unknown token keeps answering `404`/`410`.

### Deleting a workspace

Owner only. One transaction: delete the workspace row; `memberships` cascade; the document goes
with it. The response carries `nextSlug`, the caller's other workspace with the oldest
`created_at`, or `null` — the client returns to no-workspace from there without another round trip.

### Plan

`POST /api/workspaces/:slug/plan` is the only way to change `data.plan`. It is a label, not a
billing system: it stores `Free | Team | Business` and nothing else changes. Owner only; the
existing `PATCH` keeps handling name, slug and colour for admin+.

## Client

- `api.js`: `members()`, `setMember(userId, patch)`, `removeMember(userId)`, `leave()`, `setPlan(plan)`,
  `deleteWorkspace()`, `invites()`, `revokeInvite(id)`; `acceptInvite` keeps its signature and
  surfaces `needsSignIn`.
- The members page reads the server list once per visit and writes it back into
  `S.data.members` (profile shape preserved: colour and other cosmetic fields stay local), so the
  rest of the UI keeps working unchanged.
- Role changes, removal, resend and revoke call the API and refetch. No local-only mutation in
  server mode; the demo mode keeps its current local behaviour.
- Pending invites are rendered from the server list (admin+ only) instead of fake `status: 'invited'`
  profiles; `addInvitedMember` stops inventing profiles in server mode.
- Settings → Workspace gains **Leave workspace** for everyone who is not the last owner, and
  **Delete workspace** for an owner. Both confirm, both navigate away using `nextSlug`.
- The plan buttons call the API when the caller is the owner, and stay read-only otherwise.
- The role popover offers Owner/Admin/Member/Guest to an owner acting on someone else, and
  Admin/Member/Guest to an admin acting on a member or guest.

## Out of scope

Private-project redaction (phase 3), an audit log of membership changes, session revocation on
removal, transfer-ownership wizard (promoting the other person to Owner does it), billing.
