# SPEC — Phase 3: Private project isolation

Status: ready for planning.

## Goal

A workspace member who is not on a private project must receive **no trace** of that project
from the server, and must not be able to modify it — directly or by sending back a redacted
document. Project visibility is enforced server-side; the browser filter becomes a convenience,
not the security boundary.

## Model

- `projects[].private` (boolean) is the access switch. Missing/false = everyone in the workspace.
  Stored strings are normalised: `private === true` means private; a legacy `access === 'private'`
  is used only when `private` is absent.
- `projects[].members` is the access list of member ids, including the lead. A private project is
  visible only when `members` contains the caller's `member_id`. A missing list is normalised to
  an empty array; the lead is added when missing.
- `projects[].perms`, `projects[].lead` are access control and follow the same protection as
  `private`/`members`.
- The legacy `projects[].access` field (`private`/`workspace`) is retired: it is never used for
  visibility beyond the read-time fallback above, and it is dropped from the served document. The
  share UI writes `private` as a boolean (`false` when workspace-wide).
- New projects stay workspace-wide (`private` absent) unless the creator opts in.
- Recovery: a stored private project with no members is repaired on read by assigning the lead (or
  the first workspace owner) as custodian and keeping it private; if the workspace has no
  members, it becomes workspace-wide. A project cannot be made private with an empty access list:
  the person making the change is added to `members`. A private project with members but no valid
  lead promotes its first member to lead. Removing a member or leaving a private project that
  would empty its access list is refused (`409`, "promote someone first"); the project lead can
  flip it to workspace-wide first. When a removed/leaving member was the lead and other members
  remain, one of them is promoted.

## Read redaction (`GET /api/workspaces/:slug`, and any served document)

Given a caller membership, `hidden` = stored projects where `private === true` and
`members` does not contain the caller's member id.

The served document omits, and never references, hidden projects:

- `projects`: hidden entries removed.
- `projOrder`: hidden ids removed, visible order preserved.
- `tasks`: tasks whose `project` is hidden removed (subtasks live inside visible tasks).
- `comments`: comments whose task is removed.
- `files`: files whose `project` is hidden or whose task is removed.
- `activity`: entries whose `project` is hidden, or whose task belongs to a hidden project.
- `notifs`: notifications whose `project` is hidden, or whose task belongs to a hidden project.
- `events`: events whose `project` is hidden.
- `savedViews`: views whose `project` is hidden.
- `views` (top-level per-user view state): keys `p:<projectId>` and `sv:<savedViewId>` for
  hidden projects/views are dropped, and hidden ids are removed from `project` filter values
  (an emptied filter is dropped) so persisted view state cannot leak or resurrect an id.
- `projects[].access` is dropped; `private`/`members` are normalised as described in Model.

Everything else (members, teams, workspace settings, sessions, invoices, recent searches) is
unchanged. Free-text written by the caller (for example a recent search string) is not scanned
for project names.

The same redaction applies to every member role. An owner or admin who is not in the project's
`members` list does not see it.

## Write merge (`PUT /api/workspaces/:slug`)

The server computes `hidden` from the **stored** document and the caller's membership, never
from the incoming document. It then builds the document to store:

1. **Hidden projects are restored from storage.** Any incoming project with a hidden id is
   replaced by the stored record; hidden ids missing from the incoming document are re-added.
2. **Hidden dependants are restored from storage**, and incoming records that reuse a hidden id
   are discarded: tasks, comments, files, activity, notifications, events and saved views whose
   project/task is hidden. This blocks deletion by omission and fabricated edits. A stored row is
   also restored when the incoming row would move it into a hidden project (for example a visible
   task reassigned to a hidden project).
3. **Order is rebuilt by id, collection by collection.** For array-order collections (`projects`,
   `projOrder`, `tasks`, `comments`, `events`, `savedViews`, `notifs`): walk the stored array,
   emit reserved (hidden) rows from storage and otherwise emit the incoming row with the same id
   when present; then append incoming rows with new ids in their incoming order. Newest-first
   collections (`activity`, `files`) are rebuilt the same way but incoming-only rows are
   prepended in reverse incoming order so the newest stays at index 0. Reserved ids are
   deduplicated, so hidden positions stay stable while visible rows can be reordered, created and
   deleted.
4. **Access fields are protected.** For a project the caller can see, `private`, `members`,
   `perms` and `lead` are copied from storage unless the caller is an owner, an admin, or that
   project's lead. Other fields (name, description, status, dates, colour, team) remain editable.
   When a manager turns a project private, the manager is added to `members`.
5. **The merged document is normalised before it is stored** (`normalizeProjects`): `private`
   becomes a boolean, `members` arrays exist, a private project with members but no valid lead
   promotes its first member, `access` is dropped, and a private project with an empty access list
   gets the lead (or first workspace owner) as custodian. The stored document is normalised the
   same way before the hidden set and manager checks are derived, so a repaired lead can manage
   immediately.
6. **Visible projects and their data are taken from the incoming document**, including
   legitimate creation, edits and deletion of workspace-wide projects.
7. **`views` are merged by key.** Keys for hidden projects/saved views are kept from storage;
   visible keys and new keys come from the incoming document. Hidden project ids are removed from
   incoming `filters[].v` values; filters left empty are dropped.
8. `revision` handling is unchanged: a stale revision still answers `409` before merging.

`normalizeDoc` still owns `data.ws` and `data.me`, and `docFromClient` still owns member profiles
and the plan. Legacy `access` is removed from the stored document on the next write.

## Client

- The share modal writes `private` as a boolean through a private/workspace toggle instead of
  `access`. Turning it private adds the caller to the access list locally; the server enforces
  the same rule.
- Access controls (`People with access` permission selects, remove, add-member search, the
  project invite-by-email form and general access toggle) render disabled/read-only unless the
  caller can manage access: owner, admin, or project lead; the current access list and state stay
  visible. The Invite-to-workspace modal (`A.invite`, reachable from **Members**) is a different
  surface and is unaffected.
- `A.shareAdd`, `A.shareInvite`, `IN.sharePerm` and `IN.shareAccess` refuse to mutate when the
  caller cannot manage access, independently of the disabled attributes.
- The share modal must not mutate the document while rendering (no re-injecting `access` or
  `perms` defaults).
- The project settings modal only lets a manager change the lead; non-managers see a read-only
  lead field.
- A hidden project is absent from the server document, so a deep link (`/w/<slug>/project/<key>`)
  renders the generic not-found page: `applyDeepLink` sends an unmatched project segment to the
  not-found state. A stale local route (or demo mode) for a project failing `canSee()` also
  renders the generic not-found page in server mode; demo mode keeps the existing
  request-access state. The document title must not include the project name when the project is
  missing or not visible.
- Client-side `canSee()` and the page-level guard stay as defence in depth for demo mode.

## Non-goals

- Hiding a private project's name from free-text fields the caller wrote themselves.
- Per-task or per-file permissions inside a visible project.
- Hiding private projects from workspace-level counters that the server does not compute.
- Real-time/websocket updates.
- Migrating existing `access` values in storage (read-time derivation is enough).

## Acceptance criteria

1. Member B, not on private project P, receives a document with no P in `projects`/`projOrder`
   and no task, comment, file, activity, notification, event, saved view or `views` key/filter
   value that belongs to P.
2. Member A, on P, still receives P and all of its data.
3. B PUTs the redacted document after editing a visible project; A's P and dependent data are
   intact, in their stored order, byte-for-byte for P's record.
4. B cannot inject or modify a project/task/comment/file/activity/notification/event/view with
   P's ids, and cannot move a visible task/comment/file into P.
5. B cannot change `private`, `members`, `perms` or `lead` on a visible project; the stored
   values are kept. A non-manager cannot reach those writes through the UI either.
6. A project lead and an owner/admin who are project members can change access, add/remove
   members and flip a project from private to workspace; after flipping, B's next read includes
   it. The stored value is a boolean and does not depend on the retired `access` field.
7. An owner/admin who is not on P does not see P.
8. In the browser, a non-manager sees a read-only share modal (including the invite-by-email
   form), opening `/w/<slug>/project/<hidden-key>` directly renders the generic not-found page,
   and the tab title never names a project the caller cannot see.
9. A private project cannot be stored with an empty access list: the manager who makes it
   private is added, and a legacy empty one gets its lead or the first owner as custodian on read
   (no data is published). Removing the last member or leaving as the last member is refused with
   `409`, so a private project is never implicitly published. A private project with members but
   no lead promotes its first member.
10. Demo mode keeps its local visibility behaviour; lint, format check and build stay green.

## Verification plan

- A committed, self-contained matrix script (`scripts/verify-private-projects.mjs`, run with
  `npm run test:privacy`) starts an isolated server/database with accounts A (owner), B (member)
  and C (member, lead of the private project), and covers:
  - redaction of every collection including `views`;
  - merge preservation, ordering, deletion by omission, id injection and move-into-P attempts;
  - access-field tampering, lead/admin success, boolean round-trip, private flip;
  - owner/admin not on P; empty-list prevention (custodian assignment); last-member
    removal/leave refusal; lead promotion when other members remain; private project with
    `lead:null` repaired so its first member can manage and leave after promoting;
  - newest-first ordering: a new activity row lands at index 0.
- Browser UAT with two accounts: create a private project as A, confirm B's projects, overview
  counters, activity, notifications, calendar, search, palette and tab title show no trace; B
  edits a visible project and A's private project survives; C flips access and B then sees it;
  B's share modal and project settings are read-only.
