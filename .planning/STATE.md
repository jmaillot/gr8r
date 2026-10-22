---
gsd_state_version: "1.0"
milestone: v1.2
milestone_name: Localization
status: planning
last_updated: "2026-10-22T11:45:00.000Z"
last_activity: 2026-10-22
progress:
  total_phases: 7
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# STATE

Last updated: 2026-10-22

## Position

- Milestone: **v1.2 — Localization** — roadmap created, not started
- Previous: **Multitenant (v1.1)** — shipped, audited and archived (4 phases, 7 plans, 10 tasks)
- Next: **`/gsd-discuss-phase 5`** → `/gsd-plan-phase 5`
- Archive: `.planning/milestones/v1.1-ROADMAP.md`, `v1.1-REQUIREMENTS.md`, `v1.1-MILESTONE-AUDIT.md`,
  `v1.1-phases/`
- Release: 1.1.0 tagged, then **1.1.1** (patch) tagged with the three revision fixes

## Roadmap — v1.2 (7 phases, 5–11)

The phase numbering continues v1.1 (which used 1–4). The roadmap is in
`.planning/ROADMAP.md`; the requirement-to-phase mapping is in `.planning/REQUIREMENTS.md`.

| Phase | Name | Requirements |
|-------|------|--------------|
| 5 | i18n foundation & catalogue contract | I18N-06, I18N-08 |
| 6 | English extraction & locale-aware formats | I18N-01, I18N-03, I18N-04 |
| 7 | French catalogue & French typography | I18N-02, I18N-05, I18N-07 |
| 8 | Per-user locale & the honest selector | LOC-01 … LOC-06 |
| 9 | Server messages & activity history | ERR-01, ERR-02, ACT-01, ACT-02 |
| 10 | Browser coverage in both locales | UAT-01 … UAT-09 |
| 11 | French sweep, build gate & ship hardening | UAT-10 |

**Coverage:** 29/29 v1.2 requirements mapped, each to exactly one phase; no orphan requirement, no
phase without a requirement.

**Ordering notes (deviations from the research sketch, both deliberate):**

- The per-user locale phase (8) comes **after** the French catalogue (7), not second. `LOC-01`
  (switch without a reload) and `LOC-06` (no English flash) are only observable once French
  exists. The locale plumbing itself has no dependency on catalogue contents — it could be built
  in parallel with phases 5–7 in practice.
- The research's "locale-aware formats" phase is folded into the English extraction (6): both are
  behaviour-preserving refactors, and the French author then writes against a frozen format
  surface either way.

**Two open items to settle at Phase 5 planning:**

- `I18N-08` (the French catalogue ships as its own chunk, an English-only build carries no French
  string) contradicts the research's resolved conflict 10 ("both catalogues statically imported").
  `REQUIREMENTS.md` is the source of truth for scope, so the requirement wins: the catalogues stay
  JSON files importable by plain Node, while the browser build keeps French out of the English
  bundle.
- `LOC-02` sits with the selector (phase 8), not with the registry (phase 5): the selector must not
  offer a language that is not yet translated.

## Where things stand

Phase 1 landed the tenancy boundary end to end: one workspace row per workspace with a unique
slug, a real `memberships` access table, slug-scoped API calls with server-side role
enforcement, `/w/:slug` routing, a real workspace switcher and API-backed workspace creation.
A single-workspace database migrates in place with an automatic pre-migration backup.

Phase 2 made the membership table the single source of truth for access. Roles and status are
overlaid on the workspace document at read time and ignored on write for account profiles.
Owners and admins manage members through dedicated endpoints; removal and leave clean up tasks,
subtasks, projects and teams in the same transaction. Address invites for existing accounts,
pending invite listing/revocation, owner-only plan changes, and workspace delete/leave are
implemented. The members page and settings read and write through the API; demo mode keeps its
local behaviour.

Phase 3 moved private-project isolation to the server. The served document omits private
projects and every row that references them, including saved view state and project filters.
Writes are merged with stored rows by id, so a redacted document cannot delete or rewrite a
project it cannot see, and access fields are restored unless the caller is an owner, an admin
or the project lead. The last member of a private project cannot leave or be removed until
someone else is promoted or the project is made workspace-wide.

Phase 4 plan 1 replaced the standalone privacy script with a `node:test` suite. One shared
`test/helpers/server.mjs` harness spawns real `server.js` processes on ephemeral loopback ports
with `mkdtemp` `DATA_DIR`s, and three suites cover phases 1–3 (the full `npm test` run is now
44 tests across the tenancy, membership, privacy, migration, harness and demo suites). Tenancy,
membership lifecycle and the ported 70-check privacy matrix are the original three. `npm test` is
the entry point;
`npm run test:privacy` remains the phase 3 release alias. `.planning` and `.gsd` are now
prettier-ignored so tooling-written planning artifacts stop failing `format:check`.

Phase 4 plan 2 proves the in-place migration automatically. `test/helpers/legacy-fixture.mjs`
builds the exact pre-tenancy schema and rows (no `workspaces.slug`/`color`, no
`memberships.member_id`, no `invites.workspace_id`, demo switcher and `data.me` present), and
`test/migration.test.mjs` boots the real server against it: exactly one backup is written before
any rewrite, the workspace derives `legacy-studio` / `Legacy Studio` / `#3D8E5F`, both members are
linked, the invite is scoped, `data.workspaces` is dropped, `data.me` is retired, and
`p_keep`/`t_keep` survive. A second boot is byte-identical and creates no backup. The suite
exposed one real gap: `migrateTenancy()` never scoped legacy invites, now fixed by
`backfillInvites()`. `npm test` now runs 44 tests.

Phase 4 plan 3 puts the contract in a real browser and in CI. `e2e/server.mjs` boots its own
server on `127.0.0.1:4317` with a `mkdtemp` `DATA_DIR` and removes it on SIGTERM;
`e2e/helpers/setup.mjs` creates two workspaces and three accounts through the API; and
`e2e/tenancy.spec.mjs` (4 Chromium tests) proves document isolation in both directions, the
foreign-slug fallback, cross-tenant project 404s, and that a plain member sees no trace of a
private project while its owner still opens it. CI keeps the lint/format/build job, adds
`npm test`, and gains a required Chromium e2e job that installs with system dependencies and
uploads traces only on failure.

Phase 4 plan 4 closes the milestone. The browser demo is honestly single-workspace: the seed has
no `data.workspaces` array, `workspaceList()` derives one entry from the current `ws` object, the
demo switch branch and create path are gone, the popover shows a static header, and the palette
omits the switch command — all gated on `api.enabled`, so server mode is untouched.
`test/demo-workspace.test.mjs` (2 tests; `npm test` is 44 after the review fixes) guards it.
`CHANGELOG.md` ships 1.1.0 notes; README/DEPLOY/.env.example document Node 24, `npm test`,
`npm run test:privacy`, `npm run e2e`, both CI jobs, `TRUST_PROXY`, `MAX_BODY_BYTES`, and the
upgrade/rollback path. `package.json` and `package-lock.json` are 1.1.0 and `.nvmrc` is 24.

The post-execution code review (`04-REVIEW.md`, 1 Critical + 9 Warnings + 2 Info) was fully
disposed in `04-REVIEW-DISPOSITION.md`: `data.recentSearches` and saved-view filters are redacted
for hidden projects, recent searches merge instead of being clobbered, the palette tolerates a
missing array, malformed cookies return 401, the e2e server moved to port 4317, Compose forwards
`WORKSPACE_SLUG`/`MAX_BODY_BYTES`, and DEPLOY/image-tag claims match 1.1.0. Residual risk: the
CR-01 redaction is substring-based, so a hidden project name embedded in a free-text search
string can still leak in part; disclosed in CHANGELOG and DEPLOY. The first real CI run
(39674830039) passed both `build` and `e2e`, closing the last verification item.

Known limitations carried forward:

- Plans remain display-only labels; nothing is billed or limited.
- Invite email delivery still requires `SMTP_HOST`; links are copied by hand otherwise.
- File contents are metadata only; no binary upload backend.
- The browser URL is write-only: `go()` never updates the address bar and nothing handles
  `popstate`, so back/forward and a reload lose the current page.
- The recent-search redaction is substring-based, and a free-text mention of a hidden project's
  name on a visible row is still served to a non-member.

## Milestone audit (2026-10-22)

The audit of milestone v1.1 (`.planning/milestones/v1.1-MILESTONE-AUDIT.md`) rated the milestone
**tech_debt**: 8/8 requirements satisfied, 4/4 phases verified, no blockers left. It found three
defects in one family — the workspace revision moved without the client being able to follow it —
and all three are fixed and released in 1.1.1:

1. **B-1** — a role change, a member removal and a plan change edited the document and moved the
   revision without reporting it. The endpoints now report it and the client adopts it.
2. **W-01** — accepting an invite wrote the document from another account's session, so the
   inviter's open session was left with a stale revision. A join now writes only the membership
   row, and the roster is repaired when the document is read.
3. **Restart variant** — the boot-time repair of the document moved the revision once. It is
   server-owned state and no longer moves the revision.

Each fix has a regression guard that fails without it: `test/membership.test.mjs`,
`test/revision.test.mjs`, `test/invite-revision.test.mjs` and two Chromium tests. The suite is now
50 `node:test` cases and 6 Chromium tests; CI run 39746021129 is green on the fix commit.

The remaining audit findings (dead routes, orphaned exports, the missing `sameOrigin` on invite
accept, the guest-profile spoof, the admin link-only invite, the `firstWorkspace()` fallback and
the UI flows that are still unproven by a test) are tracked in the audit's tech-debt section and
in `PROJECT.md` under **Requirements → Active**.

## Decisions

- Each test file owns one server and one temporary database; the harness deletes only directories
  it created, so a migration test can reboot on a supplied `dataDir`.
- The privacy matrix keeps its exact phase 3 fixture and checks rather than being rewritten around
  the new harness.
- Server tests never mock SQLite or HTTP.
- The migration test asserts the backup before any rewritten row and compares a byte-for-byte
  snapshot across a reboot, including `updated_at` and the raw document string.
- Legacy invites are scoped by `migrateTenancy()`; an unscoped legacy invite is a migration bug,
  not an accepted state.
- Playwright's `webServer` needs an explicit `gracefulShutdown`; otherwise it SIGKILLs the process
  group and the e2e server wrapper cannot remove its temporary database.
- Browser fixtures present a run-unique `X-Forwarded-For` so per-IP throttles never make a second
  local e2e run fail.
- E2E assertions stay in the browser with role/label/text selectors; the API client only creates
  fixtures.
- Demo mode renders no workspace switcher, create entry or palette command at all; the actions are
  no-ops as a second layer, and onboarding renames the single `ws` object.
- The demo workspace is derived from `D().ws` at call time, so a stale cached `data.workspaces`
  array cannot resurrect a second workspace.
- Release order is feature/docs commits first, then one `chore(release): X.Y.Z` commit carrying the
  manifest and lockfile version bump.

## Verification commands used

```sh
npm test                # tenancy, membership, privacy and migration suites (real servers)
npm run test:privacy    # phase 3 privacy matrix alias
npm run build && npm run e2e   # Chromium UAT against a throwaway server
npm run lint && npm run format:check && npm run build
node server.js          # with DATA_DIR pointing at a copy of a real database
```

## Useful environment

- Fresh install: `WORKSPACE_SLUG` names the first workspace's URL; it is ignored afterwards.
- Creation policy follows `ALLOW_SIGNUP` (`true` = any signed-in user, `false` = owner/admin of an
  existing workspace).
- Rollback: restore `DATA_DIR/gr8r-premultitenant-*.db` over `gr8r.db` and redeploy the previous
  image.

## Session

**Last session:** 2026-10-22T08:30:00.000Z
**Stopped at:** Milestone v1.1 shipped, audited and archived
**Resume file:** None

## Current Position

Phase: 5 — i18n foundation & catalogue contract (not started)
Plan: —
Status: Roadmap created, awaiting discussion
Last activity: 2026-10-22 — Roadmap for v1.2 created (7 phases, 5–11)

## Operator Next Steps

- `/gsd-discuss-phase 5` — the i18n foundation: the `t()` contract, the escaping rule, the plural
  subset, the catalogue location and the build layout
- Then `/gsd-plan-phase 5`; phases 6–11 are already ordered and scoped in `.planning/ROADMAP.md`
- Scope agreed for v1.2: a dependency-free i18n layer with a complete French translation, a
  per-user locale with a migration, and Chromium coverage for the 8 untested UI flows
