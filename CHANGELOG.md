# Changelog

All notable changes to Projects Studio are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.6.0] — 2026-11-28 — Entra ID Mappings & Restore Sources

5 phases (101–105). Highlights:

- **Entra ID group → workspace mappings UI** (no Graph, no API permissions):
  operators paste a group Object-ID GUID + label; members get the mapped
  workspace role at their next Microsoft sign-in (lazy revocation, highest
  role wins, same-tx audit trail). Dedicated Mappings page replaces the
  governance dead-mappings card; staged delete with honest "next sign-in"
  copy in all 5 locales.
- **Restore-source selection end-to-end**: the previously triplicated
  staged-fetch ladder is extracted into ONE `resolveRestoreSource` helper
  (byte-identity golden-pinned), then extended with an explicit `source`
  param on preview/download/verify + all restore triggers — validated
  against the run's mirror flags (flags ARE the truth), keyed refusals ×5,
  stage vocabulary frozen.
- **Restore drawer source picker**: chips fed by server-derived `sources[]`
  (enabled destinations only, local > s3 > ftp > smb), per-source
  availability probe via a dedicated throttled POST (`restoreprobe|`, never
  on list GETs), honest probe badges, no mid-run source swap, zero probes
  on page load.
- **Honest OIDC linking docs**: DEPLOY.md linking-policy rewritten to lead
  with `OIDC_TRUST_TENANT_EMAIL` (tenant pin substitutes for the
  `email_verified` claim Azure omits; guests excluded) with a symptom→cause
  table; Azure group-membership setup steps completed with the GUID
  copy-path; `.env.example` documents the flag in depth.

## [3.5.0] — 2026-11-27 — Backup Destinations SMB & FTP

5 phases (96–100). Highlights:

- **Two new backup destinations: FTP/FTPS and SMB/CIFS**, hand-rolled on the
  Node standard library (zero new npm dependencies), joining local + S3 in a
  destination registry. Per-task opt-in toggles in the backup editor; env-only
  credential custody frozen at boot (`FTP_*`, `SMB_*` mirroring `S3_*`); a
  partial env set disables the destination with a boot warning.
- **Scheduled runs mirror to every opted-in destination** (upload → size/hash
  verify → flag), with keyed failure statuses and alerts; the local archive
  stays the primary. GFS rotation now also prunes rotated-out remote copies.
- **Restore reads any surviving mirror** — flag is the truth, registry order
  s3 > ftp > smb picks the seam, sha256 re-verified before any byte is
  consumed. Deleting a remote archive out-of-band surfaces on the next restore
  attempt and clears the run's mirror badge (audited).
- **Probes at save** per destination with typed error classes in all 5 UI
  locales; FTPS self-signed acceptance and plain-FTP carry keyed warnings;
  SMB reports guest access as informational.
- **Hand-rolled SMB2.1 client**: MD4 from RFC 1320 vectors, NTLMv2, mandatory
  signing with verify-before-dispatch, serial 60 KB writes, retry envelope —
  proven end-to-end against real samba (SMB2-min happy path, guest mapping,
  SMB3-min keyed refusal) and the owner's Synology NAS.
- **Restore UX honesty**: history leads with the archive filename, restore
  emails name the project, pre-restore snapshots stay local-only.
- **Ops fixes absorbed from owner UAT**: SMB uploads were corrupt by
  construction (path text written instead of bytes) — fixed with a read-back
  sha256 verify at upload time; Run-now now honors per-task destination
  opt-ins.

## [3.2.0] — 2026-11-20 — Entra Group Mapping & Governance Backlog

5 phases (80–84). Highlights:

- **Entra group mapping at SSO login.** Mapped Entra groups grant workspace
  membership and operator rights at sign-in (highest mapped role wins, the group
  re-asserts at each login); lost membership removes only group-derived access —
  owners, last operators and manual grants stay protected, and every group-driven
  delta is audit-logged. Mappings are managed in-app on the /governance page;
  an overage (>~200 groups) is treated as unmapped; dead mappings surface as a
  console warning card.
- **Workspace rename & slug edit.** Operators edit a workspace's name and slug
  from /governance, with dead-mapping warnings; the old slug 404s permanently by
  design (no redirect).
- **Searchable member/team pickers.** Both team-selection surfaces (invite form,
  member editor) become searchable multi-select pickers matching the assignee
  picker's modal and keyboard contract.
- **e2e suite green without waivers.** The 56-02 drift fully repaired; the full
  suite passes with zero `test.skip`/`test.fixme` debt waivers.
- **Mobile follow-ups.** Tasks-table columns-button truncation fixed on phone,
  plus a phone-viewport sweep of dashboard/members/governance.
- **Operator docs.** DEPLOY.md documents Entra group mapping: claim prerequisites,
  overage behavior, dead-mapping runbook, old-slug 404 policy.

## [3.1.0] — 2026-11-20 — Workspace Governance

2 phases (78–79). Highlights:

- **Workspace creation gate.** `WORKSPACE_CREATION=true|false` (unset = false)
  replaces the `ALLOW_SIGNUP` coupling; only instance admins create workspaces,
  and non-operators see an "await access" page that auto-polls.
- **Instance-owner console.** Operator promote/demote with the last-operator
  guard (demoting the final owner is refused).
- **Governance surface.** Operator-scoped all-workspaces listing — archive and
  delete with member reassignment; no shadow workspaces.

## [3.0.0] — 2026-11-19 — Access Control & Hardening

3 phases (75–77). Highlights:

- **Email-domain admission doors.** `ALLOW_SIGNUP_DOMAINS` /
  `ALLOW_INVITE_DOMAINS` exact-domain allowlists (never suffix matching) with
  fail-closed accept-time re-validation, existing-account immunity, and 5-locale
  keyed refusals.
- **OIDC/SSO doors & immunity.** JIT SSO gate, SSO invite reconciliation,
  existing-account immunity contract tests, boot door-matrix log.
- **Maintenance debt.** Lint cleanup, nl/de/es refusal-path locale spot-check,
  review carryover dispositions.

## [2.6.0] — 2026-11-18 — Exports Verification & Subtask Exports

3 phases (69–71), 9 plans. Highlights:

- **Real MS Project round-trip proven.** The MSPDI export re-passed owner UAT round 5
  (18/18 rows exact, 3-level Gantt structure preserved) and the Excel repair-prompt blocker
  was fixed at the drawing-anchor level (drawing rowOff inside the row height), with a guard
  test pinning every Timeline row offset.
- **Subtasks in exports.** Timeline XLSX gains parent-grouped child bars with real-depth
  indent and per-bar status; Board XLSX gains flat dotted-key child cards in status lanes
  (counts = parents + children); the subtask due field now inherits the parent task's due
  in every export channel (a manually-set due still wins).
- **Subtask columns in List view.** Opt-in per-view columns for subtask status, assignees,
  priority (inherited) and due, aligned to the parent column grid.

## [2.5.0] — 2026-11-16 — Template Polish & Import

### Added

- **Template favourites (67-05).** A persistent star on every template row in
  Settings → Templates; favourites lead both "From template…" pickers, and the
  project-create modal gains a Favourites block above the built-in catalogue that
  instantiates on click. The `fav` flag rides the template sanitizer.
- **Template import from a Markdown file (67-06).** Settings → Templates gains an
  **Import .md** control (plus downloadable examples): the pure parser
  (`src/core/template-md.js`) turns front matter (`kind`/`name`/`icon`/`color`/`priority`),
  `##` headings and `+Nd` due offsets into a draft that opens the **ordinary editor** —
  nothing saves until the user reviews and hits Save. `###`/`####` headings nest (2 levels
  for task kind, 3 for project kind; orphan deep headings drop; consecutive `####`s are
  siblings). Two complete examples download client-side, one per kind. Format documented
  in `docs/project-templates.md` §3.
- **Hide the built-in starter projects (67-07).** A workspace-level toggle in
  Settings → Templates (`prefs.hideStarters`) removes the six themed starters from the
  create-project modal; "Blank project" always stays.

### Fixed

- **Subtask tree indentation now adds to each surface's CSS base (65-05).** The shared
  recursive renderer emitted an inline `padding-left` that **replaced** the surface's
  base padding instead of stacking on it: in the list view (`.subrow`, 64px base) a
  depth-1 child rendered 48px **left** of its root parent, and in the drawer (`.subt`,
  6px base) the first indent step was only +10px. The renderer now emits an inline
  `--ind` custom property and every surface computes
  `padding-left: calc(<base> + var(--ind))`. The render e2e now asserts the child's
  real content box sits strictly right of its parent's — the visual assertion that was
  missing and let this ship.

## [2.4.0] — 2026-11-16 — Automation & Productivity

4 phases (63–66), 17 plans. Highlights:

- **Multi-level subtask trees, end to end.** The flat `{ id, parentId, position }`
  storage shape is proven byte-identical through the doc-PUT funnel; legacy docs heal
  lazily; the server rejects cycle/depth-violating restructures wholesale with
  localized `subtaskCycle`/`subtaskDepth` errors. Completion cascades at every level,
  deletion removes whole subtrees, parent progress is a leaf-only rollup. The tree is
  visible everywhere — drawer checklist, list/table subrows, board open-leaf badge
  popover, collapsible timeline bars with date inheritance — through one shared
  recursive renderer.
- **Subtasks everywhere else too.** Titles are searchable on both backends, exports
  walk the tree with per-level keys and true MSPDI OutlineLevel, and the MCP `writeDoc`
  mirror faces the same subtree gate.
- **Task & Project templates.** User-managed templates in Settings (two tabs, task and
  project kinds) stored in the workspace document, with offset-based scheduling
  (absolute due/start offsets anchored to the instantiation day), save-as-template from
  any live task/project, one-click instantiation from the new task/project modals, and
  a server funnel that whitelists, heals and validates every template body on every
  write.
- **Exactly-once webhooks (Microsoft Teams).** Unique dedup-key claim, SSRF-guarded HMAC-signed
  delivery with retry/backoff and a 7-day purge; 8 event types delivered to Microsoft Teams
  incoming webhooks (adaptive card, MessageCard or raw-JSON payload formats — Teams is the only
  supported target), with real AAD mentions; owner-gated hook CRUD with a send-test endpoint.
- **Notification & digest emails** moved to the same claim-then-delivery outbox
  machinery (transport-claim table on SQLite+pg, webhook-identical backoff).
- **Mobile cards completed**: priority/due/estimate/progress render on the ≤900px card
  stack as a pure function of view state, proven by a dedicated 390×844 e2e.

## [2.3.0] — 2026-11-15 — Consolidation & Hardening

3 phases (62–64), 9 plans. Race-free e2e readiness (`/api/health` sole owner), the 9
drifted specs repaired against the lazy-chunk Settings contract, the VIEW-02 popover
flake fixed at both sites (semantic Escape dismissal + arm-before-act waits), and the
honestly usable mobile card stack (zero horizontal overflow at 390×844, proven
red→green) — all under the untouched 500 kB chunk gate. Close: 115/115 e2e, 0 flaky.

## [2.2.0] — 2026-11-14 — Notifications, Search & Delivery

6 phases, 19 plans. Push notifications, full-text search across backends, delivery
passes and the notification center.

## [2.1.0] — 2026-11-11 — Member & Project Experience, Export, Multi-assignee parity

3 phases, 18 plans. Per-team permission levels enforced server-side through the
doc-PUT funnel, invite flows with guest = exactly-one-project invariant, project
exports and multi-assignee parity across every surface.

## [2.0.0] — 2026-11-09 — Project-level Permissions & Invitations

4 phases, 17 plans. Collapsed visibility to boolean-private ∨ access list across
server + MCP mirror, retired every scope writer, and rewrote the suites to the
collapsed model — 1079 pass / 0 fail with canaries unmodified.

## [1.2.0 milestone notes (historical draft)]

The 1.2.0 tag is cut at milestone close; these are the release notes text.

### Added

- **The accent color is now visible.** It previously painted only interaction states (buttons, focus
  rings, selection), so all six accents looked identical at rest. It now also tints the active
  sidebar item, the active tab underline, count badges and unread rows, and Settings → Appearance
  gains a live preview card showing every surface the accent drives. Light and dark palettes both
  adapt; contrast stays on `--on-accent`.
- **Leveled docker logs with `LOG_LEVEL`.** New env variable selecting debug, info (default),
  warn or error. Every log line is stamped with an ISO timestamp and level. At info, docker
  logs show the startup config summary (sessions, sign-ups, SSO, reminders), boot migration
  timing, task lifecycle events (added, renamed, assigned, commented, removed), logins and
  failed logins, sign-ups, 2FA challenges, workspace and membership changes, invites, and the
  reminder/digest pass summaries. HTTP request lines moved to debug. No new dependencies.
- **A full French interface.** Every user-visible interface string is translated: the interface,
  error messages, activity entries, dates, numbers and plurals render per locale, and each
  account's language choice persists across sessions.
- **Browser coverage in both locales.** The Chromium suite runs in English and French.
- **The French sweep.** A 21-route browser sweep visits every product route in French and proves
  no untranslated English string is served, with a coverage assertion so a blank page cannot
  pass, and a build-time static scan fails the build on a new user-visible literal that never
  reached a catalogue.
- **The French catalogue ships in the image.** CI builds the Docker image, boots it, and asserts
  the French catalogue chunk is served with French content.
- **A French server-less demo.** Demo mode without a server renders in French and can switch
  language.
- **Zero runtime dependencies, still.** The app continues to ship with none.

### Changed

- **Due-date reminders now fire at most twice per task per assignee.** Each task gets a
  "Due today" notification on the morning of its due date (09:00, workspace timezone) and,
  where applicable, a "Past due" nudge the next morning — the day-before reminder is removed,
  and the `due_reminder` setting now governs only the due-today reminder. **One-time catch-up
  burst at first deploy:** the next 09:00 pass after the server starts emits one "Due today"
  notification (and one "Past due" where applicable) for every currently-due task whose
  reminder was never sent — this is the boot catch-up mechanism working as designed, not a
  bug. Orphaned day-before ledger rows and legacy inbox rows are left untouched: they are
  inert, and legacy rows fall back to their stored English snippet. No new notification
  types and no digest messaging (planned for the next phase).

- **Recent-search redaction is token-boundary exact (SEARCH-01).** A recent-search term is now
  hidden from a member only when it shares a full token with a hidden project name (after NFC
  normalization and lowercasing on both sides), instead of a raw substring match: "Sara Corp" no
  longer leaks a hidden "Sarah", while "sarah smith" is still redacted. Names are compared
  without diacritic folding ("Café" and "cafe" stay distinct). Residual limitation, accepted:
  matching stays workspace-list-level and full-token based, so per-user free-text search
  remains out of scope — a term sharing any single full token with a hidden name (including a
  shared generic word such as "scope") is still dropped, which can over-redact, and free-text
  search results themselves are out of scope for this change.

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
- **A restart no longer locks the workspace out of writing.** The boot-time repair of the
  document wrote it back with a revision bump, so a session that was open across the restart
  held a stale revision. A restart is not an edit, and a client cannot be told about it, so the
  repair no longer moves the revision.

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
  `DATA_DIR/projects-premultitenant-<timestamp>.db` first. The migration is idempotent: a second boot
  changes nothing and creates no second backup. `DEPLOY.md` documents the rollback (restore that
  backup over `projects.db`, redeploy the previous image).
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
