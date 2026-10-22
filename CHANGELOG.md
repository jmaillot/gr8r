# Changelog

All notable changes to Gr8r Studio are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.1] - 2026-10-22

A patch release found by the v1.1 milestone audit.

### Fixed

- **The workspace no longer stops accepting writes after a role or plan change.** Changing a
  member's role, removing a member and changing the plan all edit the workspace document, so
  they move the document's revision. The server now reports that revision and the browser
  follows it. Before this fix the browser kept the old revision, so every following write was
  rejected with `409`, the session entered conflict mode and the edit was dropped — while the
  interface still announced it as saved.
- **An invite accepted in another session no longer locks the workspace out of writing.**
  Joining a workspace used to edit the document, which moved its revision and left the inviter's
  open session with a stale one. The membership table is now the only thing a join writes, and
  the roster is repaired when the document is read, so a join no longer disturbs anybody's
  pending edit.

### Added

- **Regression coverage for the sequence, not just the endpoint.** The server suite now asserts
  that a role change, a plan change and a member removal report the new revision and that the
  next write is accepted with it, that an invite accepted elsewhere leaves the revision alone
  and still completes the roster, a new client suite pins the adoption, and the Chromium suite
  changes a role in the Members page and joins a workspace from another session, creates a
  project and reloads to prove the server really stored it.

## [1.1.0] - 2026-10-21

The multitenant milestone: a workspace is now a real tenant with its own URL, document and
membership list, isolation is enforced by the server, and the app ships with a real test suite.

### Added

- **Real multi-workspace tenancy.** An account can belong to several workspaces with a role per
  workspace. The sidebar switcher and the command palette list the account's real workspaces,
  and workspace creation follows `ALLOW_SIGNUP`.
- **Workspace URLs.** Every workspace lives at `/w/<slug>`; share, invite and workspace links are
  slug-scoped.
- **Membership lifecycle.** Workspace-scoped invites (including for existing accounts), role
  changes, member removal, self-leave, workspace rename/slug/colour, workspace delete, and a
  pending-invite list with resend and revoke.
- **Server-side private projects.** A private project and every row that references it (tasks,
  subtasks, comments, files, activity, notifications, saved views, project filters) are omitted
  from the document sent to anyone not on its access list.
- **Node test suite.** `npm test` runs tenancy, membership, privacy and migration suites against
  real `server.js` processes with temporary databases. `npm run test:privacy` remains the phase 3
  release gate.
- **Browser UAT.** A Playwright Chromium suite (`npm run e2e`) proves two-tenant isolation and
  private-project invisibility in a browser, and runs in CI.

### Changed

- **The browser demo is single-workspace.** The static/Vite-only demo no longer carries a demo
  workspace array, a switcher or a create-workspace entry; it presents its one local workspace
  honestly.
- **Node 24 everywhere.** `.nvmrc`, `engines.node`, the README and the Docker image all declare
  Node 24.
- **Documentation.** `README.md`, `DEPLOY.md` and `.env.example` describe the shipped behaviour,
  the test commands, the two CI jobs and the complete environment surface, including
  `TRUST_PROXY` and `MAX_BODY_BYTES` (default 8 MiB).

### Security

- Cross-tenant requests answer `404` for both reads and writes; an account never receives another
  workspace's document.
- Private projects are filtered and merged server-side, so a redacted document cannot delete or
  rewrite a project the caller cannot see, and access fields are restored unless the caller may
  change them.
- Sessions are opaque random tokens stored hashed and sent in an httpOnly `SameSite=Lax` cookie;
  passwords are scrypt hashes.
- Migration writes a timestamped backup before any rewrite.

### Upgrade notes

- The first start on 1.1.0 migrates an existing single-workspace database in place and writes
  `DATA_DIR/gr8r-premultitenant-<timestamp>.db` first. The migration is idempotent: a second boot
  changes nothing and creates no second backup. `DEPLOY.md` documents the rollback (restore that
  backup over `gr8r.db`, redeploy the previous image).
- Set `TRUST_PROXY=true` behind Traefik (the default) and leave `MAX_BODY_BYTES` at the 8 MiB
  default unless a workspace document grows larger.
- Node 24 is required for `node:sqlite`; upgrade the runtime before deploying.

### Known limits

- Plans (`Free` / `Team` / `Business`) are display-only labels; nothing is billed or limited.
- Invite email is optional: without `SMTP_HOST`, the server still creates copyable invite links.
- File contents are not stored; attachments are names and sizes in the workspace document.
- There is no real-time collaboration: saves carry a revision and a stale write gets `409`.
- Recent searches are workspace-wide rather than per user. A term that names a private project
  is redacted for members who cannot see it, and a non-member cannot erase or rewrite the stored
  history, but every workspace member still shares one list. Per-user storage is planned for the
  next release.
