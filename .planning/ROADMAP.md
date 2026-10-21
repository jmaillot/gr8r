# Roadmap — Multitenant (v1.1)

Goal: turn the single-workspace install into a real multi-tenant app where a workspace is the
tenant boundary, an account can belong to several workspaces, and isolation is enforced by the
server.

Requirements:

- **R1** — A workspace is a row in `workspaces` with a unique slug and its own document.
- **R2** — An account can hold several memberships with a role per workspace.
- **R3** — `/w/:slug` addresses a workspace; all share/invite links are workspace-scoped.
- **R4** — Every API call is authorised against the caller's membership of that workspace.
- **R5** — Private projects are never sent to non-members and cannot be modified by them.
- **R6** — Existing installs migrate in place, without data loss, with a pre-migration backup.
- **R7** — Creation is flag-driven (`ALLOW_SIGNUP`), invitations are workspace-scoped, and an
  existing account can accept an invite.
- **R8** — Lint, format, build and the new server tests pass in CI.

## Phase 1 — Tenancy foundation ✅ complete

Schema migration, workspace-scoped document API, `/w/:slug` routing, real workspace switcher,
minimal workspace creation. No private-project redaction yet.

Deliverable: two accounts in two workspaces never receive each other's document. — met, see
`phases/01-tenancy-foundation/SUMMARY.md` for the record and deviations.

## Phase 2 — Membership lifecycle ✅ complete

Workspace-scoped invites (including for existing accounts), role changes, member removal and
self-leave, workspace rename/slug/colour, delete/leave, owner-only plan change. UI for all of it.

Deliverable: the membership table is the single source of truth for access; the members page
works through dedicated endpoints instead of rewriting the document. — met, see
`phases/02-membership-lifecycle/SUMMARY.md` for the record and deviations.

## Phase 3 — Private project isolation

Server-side redaction on read and merge on write, protection of `private`/`members` changes,
saved views and activity filtered consistently.

Deliverable: a member who is not on a private project receives no trace of it, and cannot
write to it (directly or by clobbering the document).

## Phase 4 — Hardening and ship

`node:test` suite, CI wiring, migration dry-run on a copy, Playwright two-tenant UAT, docs
(`README`, `DEPLOY`, `.env.example`), removal of the demo workspace switch, release notes.

Deliverable: mergeable, documented, tested, deployable.
