# SUMMARY — Phase 3: Private project isolation

Status: **complete** (lint, format check, build green; privacy matrix 70/70; browser UAT as
owner, project lead and ordinary member).

## What shipped

Project visibility is now enforced by the server. A member who is not on a private project
receives no trace of it, and a redacted document sent back by the browser cannot delete or
rewrite what it cannot see. The browser-side `canSee()` filter remains as a convenience for
demo mode and for UI gating.

### Model

- `projects[].private` is the access switch; missing/false means everyone in the workspace.
  Legacy `access: 'private'` is honoured only while `private` is absent, then dropped.
- `projects[].members` is the access list and always contains the lead. A private project is
  visible only to a caller whose membership `member_id` is in that list.
- `projects[].private`, `members`, `perms` and `lead` are access fields: only an owner, an admin
  or the project lead can change them.
- New projects stay workspace-wide unless the creator chooses private. A private project with an
  empty list gets the lead (or the first workspace owner) as custodian on read; the person who
  makes an existing project private is kept in its access list.
- Removing a member or leaving when they are the last member of a private project is refused
  with `409`; the lead can make the project workspace-wide first. If the lead leaves and others
  remain, the first remaining member is promoted.

### Server (`server.js`)

- `projectIsPrivate()`, `canSeeProject()`, `canManageProject()` and `normalizeProjects()`.
  Normalisation repairs arrays, promotes a lead, assigns a custodian to an empty private
  project, coerces `private` to a boolean and retires `access`.
- `redactDoc()` removes hidden projects from `projects` and `projOrder`, and filters tasks,
  comments, files, activity, notifications, events and saved views by project/task. It also
  removes `views['p:<id>']` / `views['sv:<id>']` entries and scrubs hidden project ids from
  saved filter values.
- `mergeClientDoc()` merges a redacted write with the stored document by id: hidden rows are
  restored from storage, incoming rows claiming hidden ids (or moved into a hidden project) are
  dropped, and dependants of reserved tasks are restored too. Visible collections keep the
  client's order; hidden rows are reinserted at their stored position, so the newest-first
  activity/file lists keep new visible rows at index 0. Access fields are restored from storage
  unless the caller is an owner, an admin or the project lead. `views` is merged by key and
  scrubbed again.
- `docForClient(doc, ws, membership)` redacts on read; `docFromClient(..., membership)` merges
  and then re-applies the membership, profile and plan protections from phase 2.
- `stripMember()` normalises first, promotes a remaining member when the lead is removed, and
  throws `409` when a private project would lose its last member.

### Client

- `canSee()` is null-safe; new `canManageProject()` (owner, admin or lead) gates project access.
- Share modal: no longer mutates `proj()` during render; writes the `private` boolean, shows
  read-only rows and a manager hint for non-managers, disables General access, and only offers
  permission selects and the invite form to managers. Project settings leaves the Lead select
  read-only for non-managers.
- Share actions are guarded (`shareAdd`, `shareInvite`, `sharePerm`, `shareAccess`); choosing
  "Only people invited" adds the actor to the access list. In server mode, inviting an unknown
  email asks the user to invite that person to the workspace first instead of creating a fake
  local guest.
- `pageProject`: a project missing from a served document, or not visible, renders the generic
  404 page in server mode; demo mode keeps the explanatory denied state. `pageTitle` only names
  a visible project, and a deep link to an unknown project opens the generic 404.
- `enhanceSelects` now disables its custom trigger when the native select is disabled, so
  read-only forms cannot open a menu.

## Verification

- `npm run lint`, `npm run format:check`, `npm run build` — green.
- `npm run test:privacy` (`scripts/verify-private-projects.mjs`) — **70/70 checks**. The script
  spawns an isolated server on a temporary database, creates owner/Bob/Cara, invites them, and
  seeds public, private, legacy-private, custodian and lead-less projects plus tasks, comments,
  files, activity, notifications, events, saved views and view state. It covers read redaction
  and leak scanning, merge/injection/move, access-field tampering, lead edits, public→private
  flips, an owner who is not on a private project, empty-list custodian repair, last-member
  leave/removal refusal, lead promotion, a stored `lead: null` repair and stale revisions.
- Browser UAT on a fresh server: owner and ordinary member see no private project, task,
  activity, notification or view trace and get the generic 404; the member's share modal and
  project-settings lead are read-only; the lead sees and edits the private project freely.

## Deviations from PLAN.md

- **Commit granularity**: the working tree already combined the server redaction/merge, client
  gating and committed test script, so they land as one phase commit rather than one commit per
  task. The privacy matrix is committed and runnable with `npm run test:privacy`.
- **Unknown-email project invites**: in server mode the share modal now redirects to workspace
  invites instead of creating a local-only guest profile that the server would drop.
- **Disabled custom selects**: added while verifying the read-only share form; the native select
  was disabled but its custom trigger was not.
