# Milestones

## v1.3 Auth Hardening (Shipped: 2026-10-28)

**Phases completed:** 6 phases, 19 plans, 29 tasks

**Known verification overrides:** 0 unresolved; stale verification digests for phases 14–17
(shared files touched by later phases) accepted with final-state evidence from Phase 18 and
the milestone integration check; 3 deferred items acknowledged as documented dispositions.

**Key accomplishments:**
- 13-DECISIONS.md: the canonical D-01…D-17 citation target for Phases 14–18, carrying the code-verified stub diagnosis and all four pinned decision areas plus the Phase 14 removal scope
- 13-DECISIONS.md now cites to one answer on both verification gaps: D-04's replay-guard column lands in Phase 14 (AUTH-02 migration) with Phase 16 owning the guard behavior, and D-13's generic-copy override covers the existing server.js:1235 429 string itself; 13-01-SUMMARY.md's citation count corrected 11 → 16 with erratum
- Central mid-session 401 intercept in api.js call() funnels every revocation 401 (code signInRequired) through the single registered signOutRevoked teardown — honest signedOutElsewhere toast, full sign-out, login screen — with a once-per-revocation latch, boot-guard, and re-arm.
- Rewrote the falsified `settings.pw.done` banner copy in EN/FR to state that other sessions were signed out, and added a substring-level honesty regression guard.
- password-correct logins on 2FA accounts now stop at an inert 5-minute challenge (`pending2fa` + separate `gr8r_tfa_challenge` cookie); only a live TOTP or a burn-once recovery code on the new `POST /api/auth/tfa/login` mints the session — atomically, inside one shared throttle budget, with generic lockout copy.
- a correct password on an enrolled account now parks the client on a dedicated full-screen `s === '2fa'` card — masked email, one dual-shape code field, no persisted pending state — and a correct TOTP/recovery code enters through the same post-success landing as any login, with an honest post-landing report when a recovery code was burned.
- WR-01/WR-02 client state fixes for the 2FA login flow — the auth card resets before finishLogin and stale recovery-toast state can no longer survive a login — pinned by a 4-test source-structure regression suite
- Chromium proof of the three auth flows — full 2FA login (TOTP computed locally via totp.js + recovery-code burn with the honest once-only toast), session revocation and password-change revocation with the signedOutElsewhere teardown — parametric EN + FR, 10 new tests inside flows.spec.mjs
- Post-17 schema parity for login_challenges (the real pending-2FA surface — no sessions.pending_tfa column exists), a no-filter walk of every workspace document proving zero auth-bearing keys, and a second-boot snapshot extended to sessions rows + login_challenges count/pragma/DDL — D-78/D-79 discharged inside test/migration.test.mjs.
- Evidence-audited the full pitfalls checklist (22+13 rows, all green, IN-02 filed as backlog), ran the human real-device UAT — 3/3 PASS across Google Authenticator, Microsoft Authenticator and a live 2FA login — and closed with a fully green gate (526/526 unit, lint, format, build incl. i18n-scan, 55/55 e2e).

---

## v1.2 Localization (Shipped: 2026-10-25)

**Phases completed:** 8 phases, 50 plans, 68 tasks

**Key accomplishments:**
- A leaf `t()` layer over JSON catalogues, with the escaping, plural and build contracts pinned by 16 tests before a single string moves.
- The catalogue contract as 23 named tests: the markup-injection lint, the key and plural shapes, the placeholder parity, the registry agreement and the zero-dependency guard.
- The build layout became a contract: the French catalogue travels as its own chunk, an English-only build carries none of its bytes, and no catalogue key can add an icon to the bundle.
- The stored `'MMM d'` now means "follow the locale": the date and time settings rows offer an `'auto'` option, its preview is computed by the locale's own formatter, and the sentinel reaches the preference bag verbatim so it survives the first save.
- The last nine uses of the English `MON`/`MONL`/`WD`/`WDL` arrays now read the locale through `monthName()` and `weekdayName()`, the arrays are deleted, and every English header — `Sun`, `Su`, `October 2026`, `Friday, July 24`, `Jul 24` — is byte-identical to what it was.
- "elodie" now finds "Élodie" in the global search and in all nine filters — one `foldForSearch()` helper folds both sides, `hl()` maps its `<mark>` window back to the original characters, and the sort order is byte-identical (no `Intl.Collator` anywhere).
- The sixteen `n > 1 ? 's' : ''` expressions became sixteen catalogue plural objects selected by Intl.PluralRules, with the English rendering byte-identical and no hand-written plural rule left under src/
- auth.js, design-system.js and settings.js swept into the catalogue — 551 findings extracted across 482 new keys (719 → 1201), allow-list 874 → 381, scan 0 violations, all gates green
- The modal, confirmation and accessible-name half of `src/actions/actions.js` plus the six other action modules now read the catalogue — 109 literals extracted, the scanner reports zero findings for all seven files, and the machine identifiers (`data-a`, route ids, keyboard keys) are byte-identical
- The stored vocabulary now displays through the catalogue while the document keeps holding `backlog`, `todo`, `urgent`, `design` and `Owner` untouched — the display is an id-keyed `t()` lookup behind lazy getters, the core modules and the three feature modules carry no user-visible literal, and the allow-list shrank 1383 → 1299 with the scan green at 0 violations
- The task list and the five overlays now read the English catalogue — 425 literals swept, the stored permission names stay the values the document holds while only their display is a catalogue value, the action keys and icon names and sort keys stayed machine, and the allow-list shrank 1299 → 874 with the scan green at 0 violations
- The thirteen remaining page modules — activity, 404, favourites, home, inbox, members, my tasks, notifications, overview, project, projects, search and tasks — now read every heading, subtitle, empty state, form label and accessible name from the catalogue through 184 new keys, the allow-list shrank by exactly the 266 literals the wave extracted (381 → 115), and the scan is green at 0 violations
- Implemented `has()` and `tErr()` in `src/core/i18n.js` with parameter interpolation and integrated them into `src/core/api.js`, closing out the ERR-02 error-code contract.
- Activity journal stores machine verbs + structured extras end-to-end: priority as tracer slice, full 25-writer expansion, and unified drawer rendering — with D-06-equivalent filter classification over legacy + machine vocabularies.
- actExtraHtml drops legacy string extras instead of leaking them, the demo seed carries 4 structured extras, and the Projects filter selects project creation from both vocabularies.
- The keyboard-hint modifier became a lazy getter evaluated at render, the duplicated escaping table collapsed into the escHtml re-export, and uid() moved to crypto.getRandomValues with 200-call uniqueness pinned by a test.
- The 16-route overflow spec now carries a 21-route French sweep — every route first proves a catalogue-driven French marker, then proves zero English-catalogue-value leaks across text nodes, `aria-label`, `data-tip` and `document.title`, hidden nodes included.
- Two node:test contract pins now make the phase's already-true properties regression-proof — the i18n allow-list must stay exactly `[]` with the scan exiting 0 on the live tree, and package.json must carry no `dependencies` key with the Dockerfile runtime stage staying bare node + su-exec + four app COPY targets.
- A `docker-build` CI job builds the image, serves it, resolves the French catalogue chunk dynamically from the served assets and asserts French content; a Chromium e2e proves the server-less demo renders French and that the EN↔FR switch survives a reload through localStorage.
- Docs state the D-13/D-15 boundary (interface en+fr; demo seed and prototype pages not; four languages absent), the 1.2.0 draft release notes, and the new `docker-build` CI job — with the version bump and tag deliberately deferred to milestone close.
- Raw-body `POST /w/:slug/files` streams real bytes flat to `DATA_DIR/files/<id>` behind sameOrigin + member auth, size-capped mid-stream by `MAX_UPLOAD_MB` (default 25) with a 413 `uploadTooLarge` stable code — proven by real-server integration tests.
- `GET /w/:slug/file/:id` serves stored bytes to workspace members behind the D-06 fixed-mime inline/attachment policy with Accept-header SPA negotiation (D-13), and the doc-PUT handler now unlinks dropped file binaries after commit (D-04) — no orphans, no existence oracle.
- `handleFiles` now uploads real bytes over XHR with real progress (the simulated timer is gone), failures toast the stable error code and leave no record, the preview modal renders real bytes (`<img>`/native `<iframe>`), and the copied `/w/:slug/file/:id` link opens that modal inside the SPA while the server serves bytes outside it.
- the i18n/error-code contract verified green over the whole phase, `MAX_UPLOAD_MB` documented for operators with `DATA_DIR/files/` backup guidance, the retired "file contents are metadata only" limitation retracted, and the full phase gate (build + 442 tests + 43 e2e) passing.
- `/w/:slug/file/:id` is now byte-only (no Accept:text/html SPA branch), and both « Copier le lien » entry points put the identical published URL on the clipboard — the PDF iframe renders and a top-level paste delivers the bytes.
- `/api/config` now discloses `maxUploadMb`, `api.init()` carries it into client state, and the dropzone hint in both locales interpolates the live knob (`{n}` placeholder at files.js:42) — an operator who turns MAX_UPLOAD_MB sees the cap they turned; the hardcoded 250 is unreachable, pinned by integration + e2e proofs.
- Byte-range serving (206/416) in serveFileBinary plus a ~70vh PDF preview iframe close the Firefox stall/clip, and anonymous file-URL navigations now land on the login page with a path-preserving return trip — with the D-05 no-oracle, the D-06 header map and the iframe/fetch 401 contract intact.
- PDF previews widen to a 900px `.modal.xl` whose iframe crosses pdf.js's 750px Firefox toolbar breakpoint, and a PDF-only footer Download button provides a viewer-independent save affordance — with images, other preview types, the byte-only route and every locked D-03/D-05/D-06/D-09 contract exactly as they were.

---

## v1.1 Multitenant (Shipped: 2026-10-22)

**Phases completed:** 4 phases, 7 plans, 10 tasks
**Requirements:** 8/8 validated (R1–R8) · **Audit:** `tech_debt` — no blockers
**Releases:** 1.1.0 (milestone), 1.1.1 (patch, the three revision fixes)
**Archive:** `milestones/v1.1-ROADMAP.md` · `milestones/v1.1-REQUIREMENTS.md` ·
`milestones/v1.1-MILESTONE-AUDIT.md` · `milestones/v1.1-phases/`

**Delivered:** a workspace is a real tenant. It has its own row, its own unique slug, its own
document and its own URL (`/w/:slug`); an account can belong to several workspaces with a role in
each; every API call is authorised against the caller's membership of that workspace; and a
private project is redacted on the server, so a member who is not on it receives no trace of it
and cannot write to it. Existing installs migrate in place with a backup, and the milestone ships
with a real test suite: 50 `node:test` cases and 6 Chromium tests against real `server.js`
processes and real SQLite databases, wired into CI.

**Key accomplishments:**

- A workspace is a row with a unique slug and its own document; the document is redacted on read
  and merged on write, so a redacted client cannot delete or rewrite what it cannot see.
- The membership table is the single source of truth for access. Roles, status, removal, leave,
  invites, the plan and workspace deletion all go through dedicated endpoints, and the roster is
  repaired on read rather than trusted from the document.
- The migration is proven against the exact pre-tenancy schema: one backup before any rewrite, the
  workspace derived from the old document, members and invites linked, and a byte-identical
  second boot.
- A Chromium suite boots its own throwaway server and proves two-tenant isolation and
  private-project invisibility in a real browser, and CI runs it as a required job.

**Found by the milestone audit and fixed in 1.1.1:**

- Three defects in one family: the workspace revision moved without the client being able to
  follow it, so the next write was rejected with `409` and dropped while the interface still
  announced it. The triggers were a role or plan change, an invite accepted in another session,
  and a restart. Each fix has a regression guard that fails without it — server, client and
  browser.

**Known gaps (deferred, tracked in the audit and in `PROJECT.md`):** the browser URL is
write-only, two routes and eight client exports have no caller, the invite-accept route has no
`sameOrigin` check, a guest profile can be spoofed by an admin, a link-only invite can carry the
admin role, the recent-search redaction is substring-based, and eight UI flows are still unproven
by an automated test.

---

## v1.0 Initial release (pre-milestone)

Single-workspace Gr8r Studio: dashboard, inbox, my tasks, projects with board / list / table /
calendar / timeline / files views, members, teams, activity and settings, served by a single
Docker image behind Traefik.
