# Projects Studio — project context

*Last updated: 2026-11-08 after Phase 50*

## Current Milestone: v2.0 Project-level Permissions & Invitations

**Goal:** make access simple and predictable — visibility is decided at the project level
(toggle private/public; a member sees only what they were invited to plus non-private
projects), and the right to invite guests moves down to each project.

**Target features:**
- Strict invitation hierarchy: only an owner names another owner; admins invite
  admin/member/guest; members invite guests only where the project allows it
- Everything editable after the invite: role, scope and status changeable at any time,
  effective immediately
- Team sharing: link whole teams to a project through its share options; team
  membership is a LIVE access source (updated 2026-11-08, D-50-5 — join/leave
  the team grants/revokes access to linked projects; restores a live form of
  the v1.7 team rule, superseding the Phase 49 snapshot materialization)
- One guest concept: the "Invité externe" toggle is removed
- Per-project private/public toggle replaces the current dropdown; non-private =
  workspace-visible, private = explicit invitees (people or teams) only
- Per-project "members may invite guests" toggle (admins/owner always allowed);
  the workspace Settings > Permissions page is removed
- Project creation: all members can create (become project members), with a workspace
  setting to restrict to admins when desired
- Transparency: a view showing exactly what a given member can see

### v2.0 milestone decisions (owner-validated 2026-11-07)

- M-01 Strict invitation hierarchy (owner↔owner only); M-02 everything editable post-invite
- M-03 team invite = live team link to the project (updated 2026-11-08, Phase 50
  D-50-5 — originally a snapshot bulk invite; the owner chose live roster-following
  access: join team → access to linked projects, leave team → revoked unless
  individually invited; `p.teams[]` returns, reversing Phase 49 D-49-5)
- M-04 single guest concept, toggle removed
- M-05 private/public toggle per project replaces the dropdown; visibility = explicit
  invitees + non-private projects (replaces v1.7 team-derived visibility and Phase 29 D-03
  scope columns as the primary model)
- M-06 per-project member-invite-guest toggle; Settings > Permissions page removed
- M-07 creation stays open to all members with a workspace restriction setting
- M-08 member-visibility transparency view
- Scope: permissions/invitations only — notif debt, lint and DEP0210 stay out

## Current Milestone: v1.10 Extensions & Adapters — SHIPPED (2026-11-07)

<details>
<summary>Milestone v1.10 Extensions & Adapters (shipped 2026-11-07)</summary>

**Goal:** extend Projects Studio outward and upward — an optional Postgres backend chosen
purely by environment (SQLite default unchanged), an authenticated MCP server exposing real
workspace operations to external agents, real browser push, and command-palette hardening.

**Shipped:** the database adapter (DBA-01..04) — `DB_URL` postgres:// selects the `pg` driver
through a minimal async facade (first runtime dependency, D-12 amended with owner approval),
SQLite stays the zero-config default, one-shot copy script, pg schema/migrations/seed and a
`POSTGRES_TEST_URL` test matrix; the MCP server (MCP-01..04) — 35 authenticated,
workspace-scoped tools over hand-rolled JSON-RPC 2.0 at `/mcp`, personal `psk_live_` API keys
(hash storage, revocation, expiry), same permission funnel as UI/API, documented in `MCP.md`
+ `DEPLOY.md` §15; real browser push & toasts (PUSH-01..03) — service worker + Notification
API wired to the existing prefs, "coming soon" removed, zero deps; two-letter G shortcuts in
the command palette (FIX-01) with behavioral regression tests. 4 phases (2 branch-delivered
with retrospective artifacts), 14/14 requirements, 1133-test suite green. Milestone audit:
**passed**. All four phase verifications passed (45: 8/8, 46: 4/4, 47: 2/2, 48: 6/6). Full
record: `milestones/v1.10-ROADMAP.md`, `milestones/v1.10-REQUIREMENTS.md`,
`milestones/v1.10-MILESTONE-AUDIT.md`, `milestones/v1.10-phases/`, `milestones/v1.10-quick/`.

</details>

**Next milestone:** v2.0 Project-level Permissions & Invitations — started 2026-11-07
(see Current Milestone above).

<details>
<summary>Milestone v1.9 Digest Context & One-Click Unsubscribe (shipped 2026-11-07)</summary>
<details>
<summary>Milestone v1.9 Digest Context & One-Click Unsubscribe (shipped 2026-11-07)</summary>

**Shipped:** digest self-identification + revocability (SUBJ-01..03, UNSUB-01..03) via
subject builder hardening, "Project — Task" lines, HMAC tokens and the anonymous one-click
route; plus v1.10 polish pulled forward — workspace logo (43) and per-member timezones
(44) with the canonicalizing resolveTz funnel and gap-closure 44-04. 5 phases, 13 plans,
6/6 REQs, 1042-test suite (1038 pass, 1 pre-existing environmental). Full record:
`milestones/v1.9-ROADMAP.md`, `milestones/v1.9-REQUIREMENTS.md`,
`v1.9-MILESTONE-AUDIT.md`.

</details>

<details>
<summary>Milestone v1.8 Notification Sanity (shipped 2026-11-05)</summary>

**Shipped:** recipient-locale server notification emails + keyed inbox rows through the
shared `tFor()` core with the server-side i18n gate (I18N-01..04); honest two-offset
reminder cadence with `day_before` removed and `push_due` pref retired (REM-01..06);
opt-in 09:00 daily digest replacing individual reminder emails with a recipient-scoped
filter (DIGEST-01..03); full cited notification audit with all trim recommendations
`proposed` pending D-05 owner rulings (AUDIT-01/02). 4 phases, 12 plans, 13/13 REQs,
943-test suite green. Full record: `milestones/v1.8-ROADMAP.md`,
`milestones/v1.8-REQUIREMENTS.md`, `milestones/v1.8-MILESTONE-AUDIT.md`,
`milestones/v1.8-phases/`.

</details>

**Constraints (standing):** zero runtime dependencies; zero migrations; full suite green;
EN+FR i18n gate (server keys included); Phase 38 suppression + no-double-send invariants
pass unmodified.

<details>
<summary>Milestone v1.7 Team Visibility & Hardening (shipped 2026-11-04)</summary>

**Goal:** close every open thread from previous milestones — no new features, all debt:
team-derived project visibility, the delTeam undo trap, membership-surface hardening,
the recent-search leak, per-user settings isolation, and the compose key-rotation gap.

**Shipped:** team-derived project visibility through the single `hiddenFor()` funnel with
the shared `memberCanReadProject` helper (VIS-01..03); invite-accept hardening — sameOrigin
first, shared `firstForwardedValue()`, silent body whitelist, fail-closed `firstWorkspace()`
twins, no admin link-only invites (HARD-01..05); per-user notification preferences as real
SQLite rows with additive migration (SETTINGS-01..03); tokenized NFC+lowercase
recent-search matcher closing the substring leak (SEARCH-01); honest delTeam undo with
awaited `pushNow()`, shared mutex and fail-closed gate (UNDO-01/02); `MASTER_KEY_PREVIOUS`
forwarded in docker-compose (DEPLOY-01). 4 phases, 12 plans, 116 commits, 17/17
requirements. All four phase verifications passed 2026-11-04 (32: 7/7, 33: 5/5, 34: 16/16,
35: 16/16); full suite 896 pass / 0 fail / 3 skips. Full record:
`milestones/v1.7-ROADMAP.md`, `milestones/v1.7-REQUIREMENTS.md`,
`milestones/v1.7-MILESTONE-AUDIT.md`, `milestones/v1.7-phases/`.

</details>

## What it is

A self-hosted project-management workspace: dashboard, inbox, my tasks, projects with
board / list / table / calendar / timeline / files views, members, teams, activity, settings.

- Frontend: plain ES modules + CSS, bundled by Vite. No UI framework, no runtime dependency.
- Backend: `server.js`, Node's built-in `node:sqlite`, opaque session cookies, scrypt passwords.
- Deploy: single Docker image behind Traefik (see `DEPLOY.md`), data in `/data/projects.db`.
- Seed/demo data in `src/data/seed.js`; the server seeds a new database from it unless
  `SEED_DATA=false`.
- **Multi-tenant since v1.1**: a workspace is a real tenant with its own URL, document and
  membership list. An account can belong to several workspaces with a role in each.
- **Postgres-capable since v1.10**: `DB_URL` (postgres://) runs the server on `pg` through a
  minimal async adapter; without it, embedded SQLite (`node:sqlite`) remains the default.
- **Agent-facing since v1.10**: an authenticated MCP server at `/mcp` lets external MCP
  clients (Claude Desktop, coding agents) operate on real workspace data with personal API
  keys and the same permission funnel as the UI/API.
- **Real auth since v1.3**: sessions, password change and TOTP 2FA are server-backed
  (`sessions`, `login_challenges`, `recovery_codes` tables) — no auth state in the document.
- **2FA lifecycle complete since v1.4**: secrets encrypted at rest (`v1:` AES-256-GCM envelope,
  fail-closed decrypt), recovery codes regenerable behind password + live TOTP step-up, disable
  verified end-to-end (a recovery code can never disable), and instance-operator session
  revocation with owner immunity.
- **Productized since the v1.4 window** (same commit range, outside the GSD cycle): app rebrand
  to Projects Studio, multi-team projects (a project lives in every team it belongs to), and a
  full notification system — per-recipient rows, assign/mention/comment/update types, @member
  and @team parsing with autocomplete, 30s polling, per-type email delivery via SMTP
  (prefs-gated, fire-and-forget), member team persisted in `memberships`.

<details>
<summary>Milestone v1.4 Auth Completion (shipped 2026-10-30)</summary>

**Goal:** every auth item deferred out of v1.3 lands — the 2FA lifecycle and session control
become complete.

**Shipped:** TOTP encryption closure (ENC-01/02), recovery-code regeneration (REGEN-01/02),
disable-2FA closure (DIS-01/02), operator session revocation (OPREV-01/02). 4 phases, 9 plans.
Milestone audit: **passed** (integration: 12 seams wired, 0 orphaned). Full record:
`milestones/v1.4-ROADMAP.md`, `milestones/v1.4-REQUIREMENTS.md`,
`milestones/v1.4-MILESTONE-AUDIT.md`.

</details>

- **Proactive since v1.5**: the notification system became proactive and operationally closed —
  every notification email deep-links to its task (`/w/:slug/task/:key`, logged-out carry via
  `?next=`), every SPA view mirrors into browser history (popstate works), the task creator is
  auto-watched, workspace admins get an audited revocation tier, TOTP secrets ride a
  version-aware keyring (`v2:<key-id>:…` envelopes) with one-reboot MASTER_KEY rotation, and a
  zero-dependency scheduler sends exactly-once due-date reminders (day-before / morning-of /
  past-due) with per-type prefs and workspace-shared timezone.

<details>
<summary>Milestone v1.5 Reliability & Rotation (shipped 2026-11-01)</summary>

**Goal:** the notification system becomes proactive and operationally closed — due-date
reminders fire from a server-side pass, notification emails land on the task, and the v1.4
operator/key-custody tech debt is paid down.

**Shipped:** email deep links + creator watching (LINK-01..04), operator audit trail +
workspace-admin tier (AUD-01..03), keyring & version-aware envelopes (KEY-01/02), re-wrap
MASTER_KEY rotation + DEPLOY.md §14 key-custody runbook (KEY-03/04), due-date reminder
scheduler (REM-01..05). 5 phases, 17 plans, 16/16 requirements. Milestone audit:
**tech_debt** (no blockers — 15/15 REQs, integration 6/6, flows 5/5; accumulated deferred
items documented in the audit + STATE.md). Full suite 649/649 tests green, zero new runtime
dependencies. Full record: `milestones/v1.5-ROADMAP.md`, `milestones/v1.5-REQUIREMENTS.md`,
`milestones/v1.5-MILESTONE-AUDIT.md`.

</details>

<details>
<summary>Milestone v1.6 Team Access & Federation (shipped 2026-11-02)</summary>

**Goal:** membership and sign-in get real team scoping and a second door — multi-team
membership, team/project-scoped permissions, optional Microsoft Entra SSO, and a second
2FA method. Zero new runtime dependencies throughout.

**Shipped:** `team_members` authority rows with multi-team membership everywhere rosters,
pickers and mentions read; team/project-scoped permissions with the D-03 grant inversion,
`hiddenFor` redaction funnel and 404-matrix proof; hand-rolled Entra OIDC (PKCE S256, RS256
via JWKS over `node:crypto` only) with pinned-tenant verified-email linking, JIT bare
accounts, SSO×2FA challenge-then-stop and SSO-only mode; multiple named TOTP factors on the
`v2:` keyring with per-factor replay guards and survivor-code removal. 4 phases, 17 plans,
24/24 requirements. Full suite 803 tests (800 pass, 3 env-gated skips), lint clean, zero new
runtime dependencies. Phase 30 carried a full security contract (17 threats closed,
`threats_open: 0`). Full record: `milestones/v1.6-ROADMAP.md`,
`milestones/v1.6-REQUIREMENTS.md`, `milestones/v1.6-phases/`.

</details>

## Milestone v1.3 Auth Hardening — SHIPPED (2026-10-28)

**Goal:** the auth surface becomes real — sessions, password change and 2FA stop being
doc-field stubs and work end to end.

**Status:** shipped 2026-10-28 (6 phases, 19 plans + 2 gap-closure plans, 29 tasks; milestone
audit `tech_debt` — 14/14 requirements satisfied, integration clean, no blockers). Full record:
`milestones/v1.3-ROADMAP.md`, `milestones/v1.3-REQUIREMENTS.md`,
`milestones/v1.3-MILESTONE-AUDIT.md`, `milestones/v1.3-phases/`.

**Target features:**
- Sessions page backed by a real `sessions` table: device label, IP, last-seen, revoke-others
  and per-row revoke; a central mid-session 401 teardown signs revoked browsers out honestly
- Password change: current password verified server-side, new password works at next login,
  all other sessions revoked atomically in the same transaction as the scrypt rehash
- 2FA: real TOTP — `node:crypto` secret with replay guard, genuinely scannable QR from a
  vendored MIT encoder, verify-before-enable, hashed single-use recovery codes, and a
  pending-2FA login challenge that is anonymous across every endpoint family until verified

## Milestone v1.2 Localization — SHIPPED (2026-10-25)

**Goal:** the interface stops lying about languages — the selector becomes real, the app speaks
French, every user has their own locale — and the full app journey is covered by a browser test.

**Status:** shipped 2026-10-25 (8 phases, 50 plans, 68 tasks; audit all-clear, all 8 phases
re-verified with fresh digests). Full record: `milestones/v1.2-ROADMAP.md`,
`milestones/v1.2-REQUIREMENTS.md`, `milestones/v1.2-MILESTONE-AUDIT.md`, `milestones/v1.2-phases/`.
No milestone is currently planned — scope v1.3 with `/gsd-new-milestone`.

**Target features:**
- A dependency-free i18n layer: `t()` + JSON catalogues per locale, plurals, locale-aware dates
  and numbers, English as the base language.
- The whole interface translated into French (~600–900 keys). The language selector only offers
  what actually exists (EN, FR).
- The locale becomes a per-user preference (new column + migration) instead of a workspace
  preference.
- The 8 untested UI flows covered by Chromium: the onboarding wizard, the invite modal, the
  `/join` page, the share modal, member removal, the workspace switcher, the plan change and
  project creation.
- A regression test that proves the interface is in French when the locale is `fr`, and that no
  English string leaks.

## Current state (v1.1 shipped)

- **A workspace is a row.** `workspaces(id, slug unique, name, color, doc, revision)` — one JSON
  document per workspace. `memberships(workspace_id, user_id, role)` is the single source of
  truth for access; `invites(workspace_id, …)` holds workspace-scoped invitations.
- **Every call is slug-scoped and authorised.** `requireWorkspace(req, res, slug, minRole)`
  resolves the slug, looks up the caller's membership and enforces `viewer < member < admin <
  owner`. An unknown or unauthorised slug answers `404`, so there is no existence oracle.
- **The document is redacted on read and merged on write.** `redactDoc()` removes a private
  project and every row that references it; `mergeClientDoc()` restores hidden rows from
  storage so a redacted document cannot delete or rewrite what it cannot see. Access fields
  (`private`, `members`, `perms`, `lead`) are restored unless the caller is an owner, an admin
  or the project lead.
- **Optimistic concurrency.** The row carries a `revision`; `PUT /api/workspaces/:slug` answers
  `409` on a mismatch. Every endpoint that edits the document reports the new revision, and the
  client adopts it.
- **The demo is honestly single-workspace.** The seed has no `data.workspaces` array; the demo
  list is derived from the current `ws` object, and the switcher, create path and palette
  command only exist in server mode.
- **Migration is in place and lossless.** `migrateTenancy()` writes a `vacuum into` backup
  before the first write, derives the slug from the old document, links members and invites,
  drops the demo array and retires `data.me`. A second boot is a byte-identical no-op.
- **The interface speaks English and French.** The language selector is real: a leaf `t()`
  layer over 1 538-key JSON catalogues per locale, locale-aware dates/numbers/plurals, a
  per-user locale preference (new `locale` column + migration) instead of the shared
  workspace preference, a 21-route French sweep, and a build-gate scan
  (`scripts/i18n-scan.mjs`) that fails the build on any new uncatalogued literal. Files are
  real too: raw-body uploads to `DATA_DIR/files/`, byte-only `/w/:slug/file/:id` serving with
  ranges (206/416) and the D-06 fixed inline/attachment mime policy, PDF/image previews in a
  wide modal, login-redirect for anonymous file navigations.

## Decisions for the multitenant milestone (validated by the owner)

### Milestone v1.9 phase decisions (Phase 40)

- [Phase 40]: RFC 2047 §6.2 folding adopted in `encodeWord` at 900 octets/line — a 400-char hostile
  name measures 1879 octets single-line; existing digest decoder passes unmodified
- [Phase 40]: `encodeWord` + `truncate` exported as named module exports (research A2) — send API unchanged
- [Phase 40]: digest task lines resolve project names strictly AFTER `inScopeProject` +
  `memberCanReadProject` per recipient; `|| ''` is snapshot defense only (D-05/D-06)

1. **Many workspaces per user.** An account can be a member of N workspaces with a different
   role in each; the sidebar switcher lists the account's real workspaces. — shipped
2. **Creation is flag-driven.** `ALLOW_SIGNUP=true` → any signed-in user may create a
   workspace; `ALLOW_SIGNUP=false` → only a user who is `owner`/`admin` of at least one
   workspace may create one; everyone else joins by invitation. — shipped
3. **Slug in the path.** `/w/:slug/...`, single domain, no wildcard DNS/TLS. The workspace
   URL shown in Settings became real. — shipped
4. **Strict isolation.** Roles are checked server-side per workspace, and private projects
   are redacted server-side — not merely hidden in the UI. — shipped
5. **Migrate in place.** The existing database became the first workspace: name, colour and
   slug derived from `data.ws`; accounts, roles and memberships preserved. — shipped

## Decisions for milestone v1.2 (validated by the owner, or defaulted from the research)

1. **The i18n layer is hand-made.** No runtime dependency: `t()` plus JSON catalogues, the
   English source strings as the base catalogue. The app has no framework and no runtime
   dependency, and adding one for translations would break that. Every candidate library
   measured is bigger than the layer it would replace.
2. **French is the second language, and it is complete.** The selector only lists what really
   exists — English and French. The four other languages (Deutsch, Español, Français, 日本語
   are currently listed) disappear from the selector until they are genuinely translated.
3. **The locale is per user.** A French speaker in an English workspace keeps their own
   language. That needs a per-account column and a migration; the migration machinery exists
   and is proven by `test/migration.test.mjs`.
4. **The server never writes the locale at boot.** A nullable column and a client-side
   `PATCH /api/auth/me` keep the "second boot is a byte-identical no-op" guarantee intact.
5. **`t()` never escapes.** `toast()` and `empty()` already escape, and `document.title` and
   the ARIA live region are `textContent` sinks. Catalogue values are plain text, made inert
   by a test; interpolated values are escaped at the call site with the existing `esc()`.
6. **The plural subset is `{name}` plus `{count, plural, …}`**, selected with
   `Intl.PluralRules` — which has three categories in French (`one`, `many`, `other`) and says
   "0 fichier" where English says "0 files". `Intl.MessageFormat` does not exist in Node 24 or
   Chromium, so any richer ICU syntax would need a hand-written parser.
7. **Server errors gain a stable code beside their unchanged English message.** The payload
   shape does not change; the client translates the code and falls back to the English string
   when it does not know it. No toast is ever empty.
8. **The activity log stores machine verbs, not prose.** The filters stop parsing English and
   classify the stored verb instead, so existing documents keep filtering correctly with no
   migration, and legacy English detail is suppressed at render rather than leaked.
9. **Vouvoiement**, applied consistently across the whole catalogue.
10. **No middle-dot forms** (`invité·e`): noun forms ("Invité", "Membre") and invariable
    constructions, which read naturally in chips, table cells and `aria-label`s.
11. **French-France house style**: a no-break space before `:`, a narrow no-break space before
    `; ! ?`, a no-break space inside guillemets, the curly apostrophe, the ellipsis, NFC
    accents, lowercase months.
12. **The invitation email is deferred out of this milestone.** The server image ships no
    catalogue; it would need a Dockerfile change, a Node-side `t()` and `Accept-Language`
    negotiation. The catalogue stays importable by plain Node, so v1.3 needs no relocation.
13. **The plan wire values stay English** ("Free", "Team", "Business" — the server validates
    those ids); only the displayed label is translated.
14. **`dateFmt`, `weekStart` and `tz` stay workspace-shared.** This milestone must not
    half-solve the open per-user-settings requirement. An `'auto'` sentinel lets an unset
    date format follow the locale while an explicit user choice still wins.
15. **The demo seed content stays English.** It is sample data, not interface chrome. The two
    prototype pages (`design-system`, `states`) are excluded from the catalogue and
    allow-listed out of the leak test; their link labels are translated.
16. **Accent-insensitive search is in scope** — "elodie" finds "Élodie" — because it is a basic
    expectation as soon as the interface is French. The `Intl.Collator` sort order is
    deferred, because it changes an order the existing tests assume.

## Decisions from Phase 12 (validated by the owner through UAT)

1. **Zero-runtime-dependency held.** Uploads, previews and range streaming use only Node
   built-ins (`node:http` raw body, `fs.createReadStream`) and the browser's native XHR/iframe —
   no new package.
2. **Fixed Content-Type map (D-06).** An allow-list decides inline vs attachment: png/jpg/jpeg/
   gif/webp/pdf inline (PDF gets `frame-ancestors 'self'` for the embed), everything else —
   including svg — `application/octet-stream` + attachment. No sniffing, no user-supplied mime.
3. **Byte-only file route (T-12-13, reopened then refined).** `/w/:slug/file/:id` serves bytes;
   an anonymous top-level navigation 302-redirects to the login page with a path-only `next`
   (no open redirect); iframe/embed/fetch destinations get the bytes or JSON errors, never the SPA.
4. **Narrow-viewport fallback accepted.** Below ~816px window width the Firefox pdf.js toolbar
   collapses again, but the PDF-only footer Download button keeps the save path — accepted by
   the owner in UAT round 3 (WR-01 triage).
5. **Deferred hardening is explicit.** Quotas per workspace/user, antivirus scanning and
   external object storage stay out of scope. CR-01 (suffix Range on a zero-byte file →
   malformed 206) was **fixed post-review** in commit `54cead4` (zero-byte files ignore the
   Range header per RFC 9110, clean 200; regression test added) — no residual risk.

## Requirements

### Validated

- ✓ MIG-01..03, VIS-02, VIS-03 — visibility model collapse + grant materialization (Phase 49)
- ✓ INV-01..04, VIS-04 — project-level invite hierarchy, live team links, per-project guest
  toggle, one guest concept (Phase 50)
- ✓ R1 — A workspace is a row in `workspaces` with a unique slug and its own document — v1.1
- ✓ R2 — An account can hold several memberships with a role per workspace — v1.1
- ✓ R3 — `/w/:slug` addresses a workspace; all share/invite links are workspace-scoped — v1.1
- ✓ R4 — Every API call is authorised against the caller's membership of that workspace — v1.1
- ✓ R5 — Private projects are never sent to non-members and cannot be modified by them — v1.1
- ✓ R6 — Existing installs migrate in place, without data loss, with a pre-migration backup — v1.1
- ✓ R7 — Creation is flag-driven (`ALLOW_SIGNUP`), invitations are workspace-scoped, and an
  existing account can accept an invite — v1.1
- ✓ R8 — Lint, format, build and the new server tests pass in CI — v1.1
- ✓ ERR-01 — A server error carries a stable machine code next to its English message; the
  client translates the code — Phase 9
- ✓ ERR-02 — An error whose code is unknown to the client still shows the server's message — Phase 9
- ✓ ACT-01 — The activity log renders in the interface language; filters classify the stored
  machine verb, not English prose — Phase 9
- ✓ ACT-02 — Activity entries written before this milestone still display and filter — Phase 9
- ✓ The language selector changes the interface: a real `t()` layer, JSON catalogues, French
  translated end to end, EN and FR the only offered languages — Phases 5–8
- ✓ The locale is a per-user preference, stored on the account and returned by the server,
  with a migration for existing installs — Phase 8 (LOC-01…LOC-06 verified; UAT 11/11)
- ✓ The remaining UI flows are covered by Chromium in both locales (onboarding, invite modal,
  `/join`, share modal, member removal, workspace switcher, plan change) — Phase 10
  (UAT-01…UAT-09; UAT 11/11)
- ✓ No route serves an untranslated English string; the build gate blocks new uncatalogued
  literals and the shipped Docker image proves the French catalogue — Phase 11
  (UAT-10; UAT 3/3)
- ✓ Real file uploads: raw-body streaming endpoint under `DATA_DIR/files/`, real XHR
  progress, oversize 413 `uploadTooLarge`, per-member auth gates — Phase 12
  (UPLOAD-01…05; verification 21/22, UAT round 3 4/4)
- ✓ Real previews for PDF and images: byte-only `/w/:slug/file/:id` route (D-06 header
  policy, byte-range 206 support), tall scrollable PDF iframe wide enough for Firefox's
  full viewer toolbar, PDF-only footer Download — Phase 12 (PREVIEW-01…03, LINK-01;
  G-12-1…G-12-6 all closed and human-confirmed)
- ✓ A logged-out browser pasting a file URL lands on the login page (not raw JSON) and
  returns to the file after sign-in — Phase 12 (T-12-13 reopened decision)
- ✓ Real session management: sessions listed from the `sessions` table with device label, IP,
  last-seen and this-session marker; revoke-others and per-row revoke; a central mid-session
  401 teardown routes every revoked browser through one honest sign-out — Phase 14
  (SESS-01…03; verification 12/12)
- ✓ Additive migration with byte-identical second boot; the fake `sessions`/`tfa` doc fields
  removed from the workspace document — Phase 14 (AUTH-02; extended test/migration.test.mjs)
- ✓ Password change: current password verified inside the transaction, new password works at
  next login, all other sessions revoked atomically with the scrypt rehash, honest success
  copy — Phase 15 (PASS-01…03; verification 6/6, honesty regression guard)
- ✓ TOTP enrollment core: RFC-verified TOTP with replay guard, real QR from a vendored
  encoder, enroll/enable/disable routes with password step-up and one-time hashed
  recovery codes — Phase 16 (TFA-01…04; verification 14/17 automated + UAT 3/3)
- ✓ Login second-factor flow: pending-2FA sign-in is anonymous across every endpoint family
  until the code verifies; challenge abandon is a real logout; recovery burn reported
  post-landing — Phase 17 (TFA-05; 401 matrix, throttle budget survives abandon)
- ✓ Auth surface closed as a whole: all new user-facing strings catalogued EN+FR with the
  i18n-scan build gate green, all three flows covered by Chromium e2e in both locales, and
  the QR verified by human UAT on a real device (Google Authenticator + Microsoft
  Authenticator) — Phase 18 (AUTH-01, AUTH-03; verification 9/9, UAT 3/3)
- ✓ TOTP secrets at rest in the `v1:` AES-256-GCM envelope: boot-time migration wraps every
  legacy plaintext `two_fa_secret` (trigger-gated, transactional, backup-guaranteed,
  byte-identical second boot, loud deferral when MASTER_KEY is absent), and every decrypt
  call site routes through a single `requireTotpSecret()` boundary that fails closed with
  503 `masterKeyMissing` — no plaintext fallback, non-2FA login untouched — Phase 19
  (ENC-01, ENC-02; verification 12/12, UAT 7/7 live + isolated container)
- ✓ Recovery-code regeneration: burn-and-replace after initial enrollment, with throttling
  and a fully verified lifecycle — Phase 20 (REGEN-01, REGEN-02; UAT 2/2 passed,
  G-20-1 closed via 20-03 and re-verified)
- ✓ Keyring & version-aware envelopes: the boot migration's plaintext-re-wrap filter is
  version-aware (generic `/^v\d+:/` predicate — any version-tagged envelope survives boot
  byte-identical), TOTP secrets write the frozen `v2:<key-id>:<iv>:<tag>:<ct>` envelope on
  enrollment, and decrypt dispatches by key id through a two-key keyring (`MASTER_KEY` +
  optional `MASTER_KEY_PREVIOUS`) with loud D-K2 boot validation and fail-closed 503 on
  unknown/tampered envelopes — the prerequisite that makes rotation (Phase 26) possible —
  Phase 25 (KEY-01, KEY-02; verification 9/9, 621/621 tests, security audit 6/6 threats
  closed, format freeze decision D-K3/D-K4 approved)
- ✓ Re-wrap MASTER_KEY rotation + key-custody runbook: `migrateTotpReWrap()` boot pass
  converges every old-envelope secret to `v2:<new-key-id>:…` in one reboot with two env
  vars, idempotently and transactionally behind the pre-migration backup (no 2FA
  re-enrollment); DEPLOY.md §14 documents the full key-custody lifecycle with
  copy-pasteable, env-only commands pinned by doc-parsing parity tests, gated by two
  pre-rotation preconditions (image currency + key-id coverage) and a no-data-loss
  recovery note for the keyring-miss signature — Phase 26 (KEY-03, KEY-04; verification
  5/5 after gap-closure re-verification, 632/632 tests; G-26-1 closed via 26-03)
- ✓ Disable-2FA verified against the full contract: strict password + live-TOTP gate only
  (a recovery code can never disable 2FA), one-transaction teardown of `two_fa_*` columns
  + recovery codes + pending login challenges, explicit revoke-others session policy with
  the caller kept signed in, `tfa_disabled` activity verb, EN+FR Chromium e2e of the full
  disable→re-enroll cycle, i18n-scan green — Phase 21 (DIS-01, DIS-02; verification 9/9,
  555/555 node tests, 59/59 e2e; 2 advisory review findings open — WR-01 missing
  `two_fa_enabled` 409 pre-check, WR-02 verb insert outside the transaction)

- ✓ Email deep links + creator watching: every notification email links to
  `APP_URL + /w/:slug/task/:key` (task drawer over the board, URL persisted across reload,
  localized not-found toast), logged-out clicks carry the path via `?next=` and land on the
  exact task after sign-in (open-redirect-guarded), every SPA view mirrors into browser
  history (go() pushState + boot popstate handler), the task creator joins the computed
  watcher set, and email bylines/recipients resolve from authority rows — Phase 23
  (LINK-01..04; verification 1/1, 575/575 suite at the time, G-23-1/G-23-4 closed)
- ✓ Operator audit trail & workspace-admin tier: same-transaction, append-only audit rows for
  operator revocations, a workspace-admin revocation route on the same audited path (owner
  immunity, self-exclusion), tier-scoped keyset audit read endpoint + owner Settings trail,
  and workspace-scoped audit visibility for workspace admins — Phase 24 (AUD-01..03;
  verification 1/1, G-24-5 closed)
- ✓ Keyring & version-aware envelopes (validated in v1.5, see above)
- ✓ Re-wrap MASTER_KEY rotation + key-custody runbook (validated in v1.5, see above)
- ✓ Due-date reminder scheduler: clock-injectable `runReminderPass()` with 09:00
  workspace-local window scan, transactional exactly-once dedup in `reminders_sent`,
  day-before / morning-of / past-due offsets, `by:null` reminder rows behind the
  `email_reminder` gate, boot catch-up + unref'd tick that never writes off-hour or bumps
  revisions, three notifPrefs toggles (ON by default), inbox filter chips + system-actor
  rendering with EN+FR keys — Phase 27 (REM-01..05; verification 11/11, 646/646 suite)
- ✓ Multi-team membership via `team_members` authority rows: guarded additive migration
  (pre-backup, byte-identical second boot), admin PUT route, `teams[]` projection read by
  every roster/picker/mention surface, @team mention dedup, picker intersection guard
  (`assignableInProject`), multi-team invites with `invites.teams` backfill — Phase 28
  (TEAM-01..05; re-verified 13/13, 803-test suite green)
- ✓ Team/project-scoped permissions: membership scope columns, shared `projectScope`/
  `hiddenFor` read/write funnel, D-03 grant inversion (scope OPENS private projects),
  byte-identical 404 `fileNotFound` on the file-serve side door, named 404-matrix per
  endpoint family, send-time scope filtering (reminders, email mirror, assignee write-guard,
  client emit pre-filter), invite-carried scope, guest collaborator model (viewer + exactly
  one project), invite-form/member-modal UI with EN+FR strings — Phase 29 (SCOPE-01..06;
  re-verified 18/18, UAT walkthrough pass)
- ✓ Microsoft Entra SSO (OIDC): hand-rolled authorization-code flow (confidential client,
  PKCE S256, RS256 id_token via JWKS) over Node built-ins only; env-gated no-oracle routes
  (404 when unconfigured, identical bodies when partially configured); pinned-tenant
  verified-email linking with guest-shape rejection; JIT bare accounts (no default role);
  SSO×2FA challenge-then-stop (no session minted pre-TOTP); SSO-only mode 404s the password
  door; one generic `ssoError` surface; `OIDC_DEFAULT_ROLE` removed end-to-end; strict
  `email_verified === true` gate on linking/JIT/invite reconciliation — Phase 30 (SSO-01..08;
  verification passed, UAT 2/2 live-tenant, security audit 17/17 threats closed)
- ✓ Second TOTP factor: `totp_factors` single source of truth with one-time boot copy,
  shared `verifyTotpAgainstFactors()` helper across login/challenge/step-ups, per-factor
  replay guards, enroll (password + existing-factor code + required label), enable (staged
  secret, per-factor baseline), remove (survivor-code guard), last-factor teardown runs the
  existing disable transaction, localized factor list + staged wizard + remove confirm —
  Phase 31 (TOTP2-01..05; re-verified 9/9, UAT 3/3)
- ✓ Team-derived project visibility: `project.teams ∩ member.teams ≠ ∅` opens projects
  through the single `hiddenFor()` funnel via one shared `memberCanReadProject` helper also
  adopted by the reminder pass and email mirror; no-team projects stay workspace-wide;
  Phase-29 explicit scope remains an optional admin restriction (D-03 grant inversion
  survives, byte-identical 404s preserved) — Phase 32 (VIS-01..03; verification 7/7)
- ✓ Membership-surface hardening: sameOrigin guard ordered FIRST on the invite-accept route,
  shared `firstForwardedValue()` closing the multi-value x-forwarded-host gap, structural
  silent `{name,email,password}` body whitelist with spoof pins, both `firstWorkspace()`
  invite twins fail closed in one commit (accept 410, SSO twin lands generic ssoError), and
  link-only admin/owner invites impossible at creation, harmless at accept, extinct in
  stored data (update-only boot sweep) — Phase 33 (HARD-01..05; verification 5/5)
- ✓ Per-user notification preferences as SQLite rows keyed (workspace_id, user_id): single
  `getUserNotifPrefs` accessor, GET/PUT `/api/me/notif-prefs` with a 17-key whitelist,
  notifPrefs stripped from the workspace document (dual strip + boot sweep), additive
  migration with pre-backup and byte-identical second boot — Phase 34 (SETTINGS-01..03;
  verification 16/16, UAT 8/8)
- ✓ Recent-search leak closure: tokenized NFC+lowercase matcher in `src/lib/redaction.js`
  replaces the substring `includes`, with table-driven tests; free-text search limitation
  documented — Phase 34 (SEARCH-01; verification 16/16)
- ✓ Honest delTeam undo: before-map captured at confirm, doc push awaited via `pushNow()`
  (shared pushing mutex, 5s deadline), fail-closed `!pushed.ok` gate with err.changeTeam
  toast, union replay of purged memberships — Phase 35 (UNDO-01/02; verification 16/16)
- ✓ docker-compose forwards `MASTER_KEY_PREVIOUS` (compose-config pin) — Phase 35
  (DEPLOY-01; verification 16/16)
- ✓ Every server-emitted notification renders in the recipient's locale through a shared
  EN/FR catalogue: per-recipient emails via `tFor`, machine-keyed reminder rows + localized
  inbox render (legacy prose rows pinned byte-identical), and a build gate against catalogue
  drift (server notif.* key resolution + EN↔FR parity, live exit 0) — Phase 36 (I18N-01..04;
  verification 12/12)
- ✓ REM-01..04 — Honest reminder cadence: at most two due-date notifications per task per
  assignee ("Due today" morning-of, "Past due" the following morning), exactly-once via a
  transactional `reminders_sent` claim, `day_before` removed deploy-safely, push_due pref
  removed end-to-end, and a post-09:00 boot catch-up window (`hour >= 9`, REM-06 regression
  pin) — Phase 37 (UAT re-passed live 2026-11-05)
- ✓ Daily digest email at 09:00 workspace-local with today's + overdue tasks, transactional
  send claim, strict opt-in (`email_digest`), and individual reminder emails suppressed for
  digest users while inbox/push rows stay untouched — Phase 38 (DIGEST-01..03; verification
  7/7, UAT passed)
- ✓ AUDIT-01/02 — Full notification audit doc (`docs/notification-audit.md`): every type ×
  channel × default with file:line citations, trim recommendation per row, RFC 8058
  List-Unsubscribe decision for the digest (plain header proposed; one-click deferred to a
  DKIM milestone), D-05 owner-validation status column (all rows `proposed` until the owner
  rules) — Phase 39 (doc-only; verification 5/5, UAT 1/1)
- ✓ **PUSH-01..03** — Real browser push + toasts (from backlog 999.2): Web Push subscription
  with VAPID, service-worker notification click/focus handling, settings-page permission
  UX with derived "Browser blocked" badge and one-time explanatory toast — Phase 48
  (verification 6/6 must-haves; UAT 2/2; security threats_open 0)
- ✓ **DBA-01..04** — Database adapter: `DB_URL` selects Postgres via the `pg` driver through
  a minimal async facade (`db.get/all/run/tx`), absent config stays byte-identical SQLite,
  both backends pass the same suite, pg schema/migrations/seed + one-shot SQLite→pg copy
  script + DEPLOY.md env matrix — Phase 45 (verification 8/8; UAT 2/2 owner-accepted)
- ✓ **MCP-01..04** — MCP server: 35-tool authenticated workspace-scoped surface over
  hand-rolled JSON-RPC 2.0 (D-12 respected — zero protocol dependencies), personal
  `psk_live_` API keys with hash storage/revocation/expiry, same permission funnel as
  UI/API, unconfigured = feature absent, `MCP.md` + `DEPLOY.md` §15 — Phase 46
  (branch feat/mcp merged e541e45; verification 4/4; UAT 5/5)
- ✓ **FIX-01** — Command/UI hardening: two-letter G shortcuts in the command palette
  (shared `gPending` G-nav map, query-typing guard, initials-across-words filter
  behaviorally pinned by test/palette-filter.test.mjs) — Phase 47 (branch fix/commands
  merged 62b1826; verification 2/2; UAT recorded 5fe7f67)

### Active

- [ ] v2.0 target features — see Current Milestone section above (M-01..M-08 decisions)

### Out of scope

- Real billing and plan enforcement (quotas, seats, storage, invoices). The plan stays a
  display value, but only an owner may change it.
- Subdomain tenancy, SAML/SCIM (Entra OIDC shipped in v1.6; SAML/SCIM stay out).
- File storage hardening beyond Phase 12: upload quotas per workspace/user, antivirus
  scanning, and external object storage (real binary uploads under `DATA_DIR/files/`
  shipped in Phase 12).
- Translating the four remaining languages (Deutsch, Español, 日本語, English UK). The selector
  will not offer a language that is not translated.
- The invitation email in the user's language — the server image ships no catalogue, so it would
  need a Dockerfile change and `Accept-Language` negotiation.
- A translation-management UI or machine-translation pipeline: the catalogues are files in the
  repository, edited like code.
- Right-to-left support: no RTL locale is offered, and the catalogue format must not block one
  later.
- Locale-specific currency formatting: the plan prices are display-only labels.
- The demo seed's sample content and the two prototype pages: sample data and design-system
  demonstrations, not product surfaces.
- Accent-insensitive *sorting* (`Intl.Collator`): it changes an order the existing tests assume,
  so it is deferred even though accent-insensitive *matching* is in scope.

## Context

- Shipped v1.10 (2026-11-07) with 4 phases (2 branch-delivered), 14/14 requirements; range
  752bfb7^..HEAD ≈ 174 files, +13 898/−1 082; full suite 1133 tests (1119 pass, 14 skipped).
- ~19k+ lines of JavaScript across `server.js`, `mcp.js`, `db-adapter.mjs`, `oidc.js`,
  `test/`, `public/` and `src/`; runtime dependencies: `{ pg }` only (dynamic import under
  `DB_URL=postgres://`; SQLite default unchanged).
- Auth ground truth: `sessions` / `login_challenges` / `recovery_codes` / `totp_factors`
  tables, `v2:` keyring envelopes, `team_members` authority rows with scope columns,
  `oidc_identities` + `oidc.js` (raw OIDC, `node:crypto` only), per-user `notif_prefs` rows,
  `api_keys` for MCP/personal API keys.
- Data ground truth: `db-adapter.mjs` async facade (SQLite `node:sqlite` default, `pg` via
  `DB_URL`), pg schema variant with bigint epoch columns, `scripts/copy-sqlite-to-pg.mjs`.
- Known deferred items: ensureColumn defs stay `integer` on pg (harmless today — documented
  in the phase 45 deferred-items); pre-existing lint errors in untouched files; carried
  v1.5 debug-session unknowns — see STATE.md Deferred Items.
- Known issues are tracked in `CHANGELOG.md` (limits) and `DEPLOY.md`.

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state
