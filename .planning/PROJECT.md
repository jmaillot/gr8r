# Gr8r Studio — project context

*Last updated: 2026-10-28 after v1.3 milestone*

## What it is

A self-hosted project-management workspace: dashboard, inbox, my tasks, projects with
board / list / table / calendar / timeline / files views, members, teams, activity, settings.

- Frontend: plain ES modules + CSS, bundled by Vite. No UI framework, no runtime dependency.
- Backend: `server.js`, Node's built-in `node:sqlite`, opaque session cookies, scrypt passwords.
- Deploy: single Docker image behind Traefik (see `DEPLOY.md`), data in `/data/gr8r.db`.
- Seed/demo data in `src/data/seed.js`; the server seeds a new database from it unless
  `SEED_DATA=false`.
- **Multi-tenant since v1.1**: a workspace is a real tenant with its own URL, document and
  membership list. An account can belong to several workspaces with a role in each.
- **Real auth since v1.3**: sessions, password change and TOTP 2FA are server-backed
  (`sessions`, `login_challenges`, `recovery_codes` tables) — no auth state in the document.

## Next Milestone Goals

No milestone planned yet — define scope with `/gsd-new-milestone`. Candidates carried in
Active below (membership-surface hardening, router/URL, recent-search leak, per-user
settings isolation) plus deferred auth items: disable-2FA flow, TOTP secret
encryption-at-rest, recovery-code regeneration, admin session revocation.

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

### Active

From the v1.1 audit (`.planning/milestones/v1.1-MILESTONE-AUDIT.md`) and this milestone's scope:

- [ ] Harden the membership surface: `sameOrigin` on invite accept, no admin link-only
      invites, no `firstWorkspace()` fallback, no guest-profile spoof.
- [ ] Write the browser URL on navigation and handle `popstate`; delete the orphaned client
      exports (`api.listWorkspaces`, `api.invites`, `wsPath`, `appUrl`, `appHost`) and either
      wire or remove the two routes that have no caller.
- [ ] Close the substring-based recent-search leak and state the free-text limitation in the
      product docs.
- [ ] Per-user settings isolation inside a workspace (`notifPrefs`, `invoices` are still
      shared fields in the document; auth state moved to real tables in v1.3).

### Out of scope

- Real billing and plan enforcement (quotas, seats, storage, invoices). The plan stays a
  display value, but only an owner may change it.
- Subdomain tenancy, SSO/SAML, SCIM.
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

- Shipped v1.3 (2026-10-28) with 6 phases, 21 plans (19 + 2 gap closures), 29 tasks across
  173 commits (2026-10-26 → 2026-10-28); 116 files changed in the v1.3 range, ~23k insertions.
- ~30.7k lines of JavaScript across `src/`, `server.js`, `totp.js`, `test/` and `e2e/`; still
  zero runtime dependencies (one dev dependency: `@playwright/test`).
- Auth ground truth: `sessions` (label, ip, last_seen_at, user_agent), dormant-per-default
  `users.two_fa_*` columns, `login_challenges` + `recovery_codes` tables; TOTP in top-level
  `totp.js` (RFC 4226/6238 fixture-verified); vendored qrcode-generator@2.0.4.
- Test posture at close: 526/526 unit tests, lint/format/build incl. i18n-scan green,
  55/55 Chromium e2e across EN+FR, real-device QR UAT 3/3 (Google + Microsoft Authenticator).
- Known non-functional debt: stale verification digests for phases 14–17 (shared files touched
  by later phases; final tree verified by Phase 18 + milestone audit), IN-02 in backlog.
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
