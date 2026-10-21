# PLAN — Phase 3: Private project isolation

Reference: `SPEC.md` in this directory. One commit per task; each task ends with its own check.

## T1 — Visibility helpers, normalisation and read redaction

Files: `server.js`

- `normalizeProjects(doc)`: ensure `members` arrays, add the lead when missing, promote the first
  member when a private project's lead is absent/invalid, derive `private` from the legacy
  `access` field only when `private` is absent, drop `access`, and give a private project with no
  members its lead or the first workspace owner as custodian (workspace-wide only when the
  workspace has no members).
- `projectIsPrivate(p)`, `canSeeProject(p, memberId)`, `visibleProjectMap(doc, memberId)` and
  `hiddenProjectIdSet(doc, memberId)`.
- `redactDoc(doc, memberId)`: clone the served document, drop hidden projects, filter
  `projOrder` and every dependent collection listed in the SPEC, and redact top-level `views`
  (keys `p:`/`sv:` plus `project` filter values).
- `docForClient(doc, ws, membership)` runs `normalizeProjects`, `syncProfiles` and `redactDoc`.
- `GET /api/workspaces/:slug` passes the caller's membership.

Verify: matrix checks that B's document contains no hidden project id or name in `projects`,
`projOrder`, tasks, comments, files, activity, notifs, events, savedViews and `views`; A's
document is unchanged apart from access normalisation.

## T2 — Write merge, access protection and recovery

Files: `server.js`

- `canManageProjectAccess(project, membership)`: owner, admin, or `project.lead === member_id`.
- `mergeClientDoc(incoming, stored, membership)`:
  - restore hidden projects and dependants (tasks, comments, files, activity, notifs, events,
    savedViews), including rows the incoming document moves into a hidden project;
  - rebuild every array stored-first by id, deduplicating reserved ids and keeping hidden
    positions stable; `activity` and `files` are newest-first, so incoming-only rows are
    prepended in reverse incoming order;
  - protect `private`/`members`/`perms`/`lead` unless the caller manages the project;
  - when a manager makes a project private, add the manager to `members`;
  - merge `views` by key, keep hidden keys from storage, strip hidden ids from filter values and
    drop emptied filters;
  - remove the legacy `access` field on write;
  - run `normalizeProjects` on the merged document before storing it (boolean `private`, members
    arrays, lead promotion, custodian for empty lists);
  - normalise the stored document before deriving `hidden`/manager checks so a repaired lead can
    manage immediately.
- `docFromClient` calls the merge after the existing members/plan rules.
- `stripMember` promotes a remaining project member when the removed member was the lead; it
  refuses (409, "promote someone first") when removing/leaving would empty a private project's
  access list.

Verify: matrix — B PUT preserves A's private project and its rows in stored order; B cannot
inject/tamper/move data into P; B cannot change access fields; lead/admin can; boolean flip
works; last-member removal/leave is refused; lead promotion works; newest activity is at index 0;
stale revision still `409`.

## T3 — Client share controls, settings and leak-free denial page

Files: `src/core/store.js`, `src/actions/actions.js`, `src/overlays/modals.js`,
`src/pages/project.js`, `src/shell/render.js`, `src/main.js`

- `canManageProject(p)` in the store: owner, admin, or `p.lead === D().me`. Make `canSee` and the
  share modal tolerant of a missing `members` array.
- Share modal: use `project.private`; the toggle writes a boolean (`false` when workspace-wide)
  and adds the caller locally when going private. Remove the render-time mutation of `access`/
  `perms`.
- When the caller cannot manage access: disable/replace the permission selects, remove option,
  add-member search and the project invite-by-email form; show a short "Only the project lead can
  change access" hint. Keep the access list and state visible.
- Guard `A.shareAdd`, `A.shareInvite`, `IN.sharePerm`, `IN.shareAccess` at the handler level.
- Project settings modal: lead is read-only unless `canManageProject`.
- `pageProject`: in server mode render `page404()` for a missing or invisible project; keep the
  demo-only request-access state. Gate the project name in `pageTitle()` on `canSee`.
- `applyDeepLink` (`src/main.js`): an unmatched `project` segment routes to
  `go('project', { id: '__missing' })` so a direct link to a hidden project renders the not-found
  page instead of silently falling back to Home.
- `IN.shareAccess` writes `p.private = el.value === 'private'` and toasts the new visibility.

Verify: build; browser UAT as a non-manager member (read-only modal and settings), as the lead
(flip to workspace, add member), and as a non-member (absent project, direct deep link to the
not-found page, generic title).

## T4 — Committed privacy matrix

Files: `scripts/verify-private-projects.mjs`, `package.json`

- Self-contained script: creates a temp `DATA_DIR`, spawns `node server.js` on an ephemeral
  port with `ALLOW_SIGNUP=true` and known admin credentials, runs the HTTP matrix, then kills
  the process and removes the temp directory.
- Accounts: A (owner), B (member), C (member, project lead). Fixture data is created through
  the API as A, then membership/project changes through the documented endpoints.
- Cases: all redaction collections, `views`, merge preservation/ordering, newest-first activity,
  deletion by omission, id injection, move-into-P, access-field tampering, lead/admin success,
  boolean round-trip, private flip, owner/admin not on P, empty-list custodian, last-member
  removal/leave refusal, lead promotion, `lead:null` repair, stale revision.
- Add `"test:privacy": "node scripts/verify-private-projects.mjs"` to `package.json`.

Verify: `npm run test:privacy` is green and exits non-zero on any failed check.

## T5 — Browser UAT, docs, state and ship

Files: `DEPLOY.md`, `.planning/`

- Browser UAT with A and B: private project invisible in projects, overview counters, activity,
  notifications, calendar, search/palette and tab title; opening
  `/w/<slug>/project/<hidden-key>` directly shows the not-found page; B edits a visible project
  while A's P survives; promote B or flip access and confirm visibility; non-manager
  share/settings are read-only.
- Document private projects, access management and the server-side merge guarantee in
  `DEPLOY.md`; remove the "browser only" limitation.
- Update `STATE.md`, `ROADMAP.md`; write `SUMMARY.md` with verification and deviations.
- Lint, format check, build; commit per task and push.

## Risks and mitigations

| Risk                                                        | Mitigation                                                                                                                                                                    |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A redacted client PUT deletes hidden data                   | Merge restores hidden projects and every dependant from the stored copy before writing.                                                                                       |
| A hidden id is reused to inject or overwrite data           | Reserved ids (stored hidden or incoming mapped to hidden) always resolve to the stored row; incoming duplicate is dropped.                                                    |
| A member escalates access or makes a private project public | `private`/`members`/`perms`/`lead` are copied from storage unless the caller is owner, admin or project lead; handlers also refuse.                                           |
| Private project becomes unreachable                         | `normalizeProjects` promotes a lead for member-only private projects and assigns a custodian when the list is empty; removing/leaving as the last member is refused with 409. |
| Legacy repair publishes sealed data                         | Empty private projects get their lead or first owner as custodian and stay private; nothing is made workspace-wide while members exist.                                       |
| Removing/leaving publishes a private project                | The same 409 guard covers both member removal and self-leave; only an explicit manager (owner/admin/lead) flip makes it workspace-wide.                                       |
| Deep link to a hidden project stays on Home                 | `applyDeepLink` routes unmatched project segments to the not-found state.                                                                                                     |
| Newest-first feeds reorder after a merge                    | `activity`/`files` prepend incoming-only rows; matrix asserts newest activity at index 0.                                                                                     |
| Owner/admin expects to see every project                    | Explicitly out of scope: private means invited members only, including owners; documented and tested.                                                                         |
| `views` state leaks hidden ids                              | Read redaction removes hidden keys/filter values; write merge keeps hidden keys from storage.                                                                                 |
| Legacy `access` diverges from `private`                     | Read-time normalisation; the client writes only boolean `private`; writes drop `access`.                                                                                      |

## Rollback

The change is confined to `server.js` redaction/merge, the share/settings UI and the new script.
Reverting restores the previous document behaviour; no schema or data migration is required.
