---
gsd_state_version: "1.0"
milestone: v1.2
current_phase: 11
current_phase_name: French sweep, build gate & ship hardening
current_plan: Not started
status: planning
stopped_at: Phase 11 context gathered
last_updated: "2026-10-24T15:43:36.347Z"
last_activity: 2026-10-24
last_activity_desc: Phase 10 complete, transitioned to Phase 11
state_head: 41909fb3eb4853acc660b5a34ee37dd90c743a0b
progress:
  total_phases: 8
  completed_phases: 2
  total_plans: 38
  completed_plans: 38
  percent: 25
milestone_name: Localization
---

# STATE

Last updated: 2026-10-22

## Position

- Milestone: **v1.2 — Localization** — phases 5–9 complete, 2 phases to go (10, 11)
- Previous: **Multitenant (v1.1)** — shipped, audited and archived (4 phases, 7 plans, 10 tasks)
- Next: **`/gsd-plan-phase 10`** — Browser coverage in both locales (the eight untested flows proven in Chromium, EN and FR)
- Archive: `.planning/milestones/v1.1-ROADMAP.md`, `v1.1-REQUIREMENTS.md`, `v1.1-MILESTONE-AUDIT.md`,
  `v1.1-phases/`
- Release: 1.1.0 tagged, then **1.1.1** (patch) tagged with the three revision fixes

## Where things stand

Phase 6 plan 1 built the **measuring device** the rest of the phase trusts, and proved it on one
literal. `scripts/i18n-scan.mjs` is a static scan of the interface sources: it reports every
user-visible literal in seven rule families (HTML text node, display attribute, toast message,
display-helper argument, display name, prose, single-word capitalised display label) and it
decides by POSITION, never by a lexical blacklist — `'Member'` is the `roleLabel()` fallback in
one place and a stored role id in another. The scan reports 1965 occurrences over the 49 files
that carry one, and it never reports a `data-*` value, a CSS class, an icon name, a comparison
operand, an object key, a CSS custom property, a stored preference value or a dotted catalogue
key. A second check family resolves every literal `t('…')` key against the English catalogue and
compares the value's placeholders with the vars of the call site, because `t()` returns the key
itself when it cannot resolve and nothing else would ever notice. The calibration is proved, not
asserted: a raw sweep of the capitalised single-word shape accounts for all **587** measured
occurrences — 449 reported, 138 in a named machine category, **0 unexplained**.

`test/fixtures/i18n-pending.json` is the progress meter: 1700 `{ file, text }` entries, sorted,
deterministic, one per literal not extracted yet. Every extracted literal leaves it, and an empty
list is the proof the sweep is finished. `npm run build` and `npm run build:en` run the scan
before the bundler, so a literal that nobody catalogued fails the build (demonstrated: adding one
to `src/ui/helpers.js` makes `npm run build` exit 1 with the file, the line and the literal). The
tracer proves the whole path on one literal: `src/ui/toast.js` now renders
`aria-label="${t('a11y.dismiss')}"`, the catalogue carries `"a11y.dismiss": "Dismiss"`, the
allow-list lost exactly one entry, and the rendered attribute is byte-identical. 113 `node:test`
cases and 6 Chromium tests are green; the icon baseline of 174 names did not move.

Phase 5 built the i18n layer and pinned its contract before a single string moves. `src/core/i18n.js`
is a leaf module over two JSON catalogues: `t()` never escapes (the catalogue values are plain
text made inert by a test, and the call sites escape the interpolated values), plurals are objects
keyed by CLDR category selected with `Intl.PluralRules`, and the interpolation subset is `{name}`
plus a count placeholder. The catalogue is JSON — never a `.js` file under `src/` — so the
`lucideSubset()` icon scan cannot swallow it, and every key is flat, dotted and namespaced. The
English catalogue is imported statically and the other locales through `import.meta.glob`, so the
build emits the French catalogue as its own chunk and an English-only build carries none of its
bytes. The layer is importable by bare Node, no runtime dependency was added, and the interface
renders exactly as it did before: 98 `node:test` cases and 6 Chromium tests green.

## Roadmap — v1.2 (7 phases, 5–11)

The phase numbering continues v1.1 (which used 1–4). The roadmap is in
`.planning/ROADMAP.md`; the requirement-to-phase mapping is in `.planning/REQUIREMENTS.md`.

| Phase | Name | Requirements |
|-------|------|--------------|
| 5 ✅ | i18n foundation & catalogue contract | I18N-06, I18N-08 — complete |
| 6 ✅ | English extraction & locale-aware formats | I18N-01, I18N-03, I18N-04, SEARCH-01 — complete |
| 7 | French catalogue & French typography | I18N-02, I18N-05, I18N-07 |
| 8 | Per-user locale & the honest selector | LOC-01 … LOC-06 |
| 9 | Server messages & activity history | ERR-01, ERR-02, ACT-01, ACT-02 |
| 10 | Browser coverage in both locales | UAT-01 … UAT-09 |
| 11 | French sweep, build gate & ship hardening | UAT-10 |

**Coverage:** 29/29 v1.2 requirements mapped, each to exactly one phase; no orphan requirement, no
phase without a requirement. 6/29 complete (phases 5 and 6).

**Phase 6 shipped:** the whole interface reads the English catalogue — 1 446 keys, the i18n
allow-list driven to zero (`[]`), the scan green at `0 literals, 0 violations`. The hand-rolled
date machinery (`MON`/`MONL`/`WD`/`WDL`, `fmtDate`, `relDate`, `ago`, `dayBucket`, `fsize`) is
replaced by Intl-backed per-locale cached formatters; the 15 plural sites are catalogue objects
keyed by CLDR category; `dateFmt`/`timeFmt` carry the `'auto'` sentinel; and the search comparison
folds accents on both sides ("elodie" finds "Élodie"). 335 `node:test` cases and 6 Chromium tests
green; the English interface renders byte-identically apart from the two declared deltas
(06-CONTEXT.md § Declared English deltas).

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

- The i18n scan decides by POSITION, never by a lexical blacklist: the same word is display text
  in one place and a machine identifier in another, so every machine set is scoped to the position
  it names (`ROLE_IDS` excludes an element of the `ROLES` const, a `role` property, a role-id list
  and a comparison operand — and reports the `ROLE_LABELS` display name and the `roleLabel()`
  fallback).
- A display-label position carries a capitalised shape: a lowercase fragment (`'task/'`,
  `'is not'`) is machine or grammar, not a label. This is what keeps the allow-list extractable to
  zero.
- A template message is reported as its literal segments, so the allow-list lists what the sweep
  will actually extract.
- `'Workspace'` is not a demo value: it is a display label in the settings navigation and a
  default name in two fallbacks, so it is reported rather than excluded by value.
- The scanner lives outside `src/` (like `scripts/icons.mjs`), so the `lucideSubset()` walk can
  never read its pattern strings and the 174-name icon baseline cannot move.
- The scan runs in front of the bundler (`prebuild`, `prebuild:en`): an untranslated literal must
  fail the build, not a review comment.
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
- [Phase 07]: Batch B (settings/act/toast/modal/err, 513 keys) translated; toast.roleChanged article made locale-aware in actions.js; four raw-English splices deferred to deferred-items.md (need new en keys, forbidden while en.json is the oracle)
- [Phase 08]: Locale left the shared document for the account (nullable users.locale, gated PATCH /api/auth/me); boot negotiates browser language pre-paint, account locale after api.me(); guarded one-time seed moves formerly-French members to 'fr'; selector derives from the LOCALES registry only; server keeps a whitelist and never writes locale at boot
- [Phase 07]: Batch C (229 shared-namespace keys + app.name) translated — the D-07 completeness gate is GREEN (100% en→fr parity, 1,449 keys); file.count deliberately keeps no many member (pinned by i18n.test.mjs); build-marker heuristic tightened to reject substrings of the other catalogue's text
- [Phase 7]: The overflow spec enumerates the 16 user-facing ROUTE_IDS routes; member/team (param-dependent) and system/states (design-system showcases) are excluded — phase 10 widens coverage
- [Phase 7]: gr8r:locale now bubbles (Rule 1): the window listener in main.js never received the non-bubbling document event — the switch updated <html lang> while strings stayed in the old language
- [Phase 7]: The French e2e spec owns a throwaway workspace via the exported apiClient helper — the language switch must not leak into the English-pinned tenancy suite (shared server, concurrent workers)
- [Phase 08]: users.locale stores registry code, NULL until chosen; PATCH /api/auth/me is the only writer; legacy prefs.lang stripped at both merge points
- [Phase 08]: 08-02: primeLocale (silent) vs setLocale (announcing) share activateLocale; boot/lifecycle use the silent variant only
- [Phase 08]: Language selector: instant setLocale then background account PATCH (demo: localStorage); options derived from the registry; row shows getLocale()
- [Phase 09]: all activity writers store machine verbs + structured extras (priority tracer slice first)
- [Phase 09]: actCategory classifier replaces English-parsing filters; D-06 quirks frozen (moved → status; case-sensitive includes(project) so createdProject escapes the projects filter)
- [Phase 09]: 09-05 closes CR-03/WR-09/WR-01/WR-02 — legacy string extras dropped at render (never divulged), seed converted to structured extras (real assignee Emma Wilson, deviation from plan literal), createdProject restored into ACT_CATEGORIES.projects with a documented equivalence exception, assignedTo falls back to '' at both render and write
- [Phase 09]: modKey() lazy getter replaces the MOD module-load constant; SHORTCUTS carries a render-time MOD sentinel — All six consumer sites call modKey() at render; the plan context note missed popovers/modals/layout - migrated as a Rule 3 deviation
- [Phase 09]: TRUST_PROXY flips to an allow-list opt-in (=== 'true'): by default no X-Forwarded-* header is read and the login throttle keys on the socket address; compose keeps TRUST_PROXY=true for Traefik
- [Phase 09]: SMTP_HOST without APP_URL exits 1 at boot (WR-04 boot gate in main(), before listen) — invite links are built only from APP_URL, never from the request Host header
- [Phase 09]: Login and signup carry the standard sameOrigin 403 crossOriginRejected guard, placed before the body read AND before the throttle so a cross-origin POST cannot consume the victim IP's budget (WR-07)
- [Phase 10]: TRUST_PROXY=true in e2e/server.mjs so run-unique X-Forwarded-For dodges the per-IP signup throttle (Rule 3, plan 10-01)

## Verification commands used

```sh
npm test                # tenancy, membership, privacy and migration suites (real servers)
npm run test:privacy    # phase 3 privacy matrix alias
npm run build && npm run e2e   # Chromium UAT against a throwaway server
npm run lint && npm run format:check && npm run build
node scripts/i18n-scan.mjs     # the phase-6 extraction scan; --report prints every finding
node --test test/i18n-scan.test.mjs   # the scanner contract
node server.js          # with DATA_DIR pointing at a copy of a real database
```

## Useful environment

- Fresh install: `WORKSPACE_SLUG` names the first workspace's URL; it is ignored afterwards.
- Creation policy follows `ALLOW_SIGNUP` (`true` = any signed-in user, `false` = owner/admin of an
  existing workspace).
- Rollback: restore `DATA_DIR/gr8r-premultitenant-*.db` over `gr8r.db` and redeploy the previous
  image.

## Accumulated Context

### Roadmap Evolution

- Phase 12 added: Real file uploads and previews — replaces the metadata-only file
  behaviour (simulated upload progress, no stored content, `copyLink` pointing at a
  non-existent `file/:id` route). Motivated by the documented known limitation
  "File contents are metadata only; no binary upload backend".

## Session

**Last session:** 2026-10-24T15:43:36.226Z
**Stopped at:** Phase 11 context gathered
**Resume file:** .planning/phases/11-french-sweep-build-gate-ship-hardening/11-CONTEXT.md

## Current Position

Current Plan: Not started
Total Plans in Phase: 3

Phase: 11 — French sweep, build gate & ship hardening
Status: Ready to plan
Last activity: 2026-10-24 — Phase 10 complete, transitioned to Phase 11

## Operator Next Steps

- `/gsd-plan-phase 10` — Browser coverage in both locales (next phase; phase 8 fully closed: UAT 11/11, verification passed, security threats_open 0)
- Open warnings from 08-REVIEW.md (0 critical / 4 warning / 3 info): WR-01 double-fire on language select (duplicate PATCH), WR-02 locale set before catalogue load, WR-03 server LOCALE_CODES hand-duplicates the client registry, WR-04 dead catalogue keys for cleared repeat/estimate qualifiers — see 08-REVIEW-DISPOSITION.md; `/gsd-code-review 8 --fix` to auto-fix
- Open info-level review items for phase 9: IN-05 (readJson unbounded drain), IN-06 (malformed-kind extra echoes literal key) — see 09-REVIEW-DISPOSITION.md
- Scope agreed for v1.2: machine verbs + structured extras + actCategory classifier

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 07 P05 | ~50 min | 3 tasks | 4 files |
| Phase 07 P06 | ~35 min | 3 tasks | 3 files |
| Phase 7 P07 | 15 min | 2 tasks | 5 files |
| Phase 08 P01 | ~20min | 2 tasks | 7 files |
| Phase 08 P02 | 15min | 2 tasks | 7 files |
| Phase 08 P03 | 25min | 2 tasks | 9 files |
| Phase 09 P03 | ~42 min | 3 tasks | 10 files |
| Phase 09 P04 | ~20 min | 3 tasks | 4 files |
| Phase 09 P05 | ~15 min | 2 tasks | 4 files |
| Phase 09 P07 | 8min | 2 tasks | 13 files |
| Phase 09 P06 | 4 min | 3 tasks | 5 files |
| Phase 10 P01 | ~12 min | 2 tasks | 3 files |
| Phase 10 P02 | ~50 min | 3 tasks | 1 files |
| Phase 10 P03 | ~25 min | 2 tasks | 1 files |
