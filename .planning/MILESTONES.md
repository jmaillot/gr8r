# Milestones

## v1.9 Digest Context & One-Click Unsubscribe (Shipped: 2026-11-07)

**Delivered:** digest emails are self-identifying and honestly unsubscribable — one email
per workspace with its name in the subject, "Project — Task" task lines leak-safe through
the memberCanReadProject funnel, hostile-name-proof RFC 2047 subjects, and RFC 8058
one-click unsubscribe via the codebase's first anonymous mutating route on a stateless
HMAC token. Shipped alongside: per-workspace logo and per-member timezones (canonicalizing
resolveTz funnel, per-member 09:00 windows).

**Phases completed:** 40-44 (5 phases, 13 plans — 40-42 = v1.9 REQs; 43-44 = v1.10 polish pulled forward)

**Stats:**
- 151 commits, 127 files changed (+15,075 / −1,039 lines)
- 5 phases, 13 plans; milestone audit: 6/6 requirements, 12/12 cross-phase wiring, 4/4 E2E flows, 0 blockers
- 3 days from milestone start to ship (2026-11-05 → 2026-11-07)
- Suite at close: 1042 tests, 1038 pass / 1 pre-existing environmental fail (totp-rewrap D-74) / 3 skipped; `npm run i18n:scan` clean

**Git range:** `0022125` (docs: archive milestone v1.8) → `d666a7d` (chore: deferred-items clean)

**Known verification overrides:** 4 newly acknowledged, 12 carried forward from a prior close (see STATE.md Deferred Items) — `override_closeout`; verification digests for Phases 40/41/43 were stale from intra-milestone source drift and were re-fingerprinted (all VERIFICATION.md files read `passed`); the milestone audit re-verified requirements, wiring and flows at HEAD (`v1.9-MILESTONE-AUDIT.md`).

**Key accomplishments:**
- `[WS]` digest subjects with "Project Name — Task Name" lines (SUBJ-01/02) — server-side project resolution, hiddenFor-funnel-safe degradation, single hardened `encodeWord` (C0 strip + RFC 2047 folding) across all four Subject call sites (SUBJ-03)
- RFC 8058 one-click: stateless HMAC token contract (UNSUB-01) consumed by `POST /unsubscribe/:token` (UNSUB-02) — 15-test response matrix, anonymous/sameOrigin-exempt/throttled/convergent, GET no-op, token never logged — with footer + settings re-subscribe preserved (UNSUB-03) and the DKIM caveat documented in DEPLOY.md §14
- Per-workspace logo: upload (magic-byte validated, role-gated), favicon fallback on every identity surface, digest header `<img>` with versioned absolute URL
- Per-member timezones: one canonicalizing resolveTz funnel, per-member scheduler windows, 418-zone static list + searchable combobox, dedup keys byte-identical under tz change; gap closure 44-04 funneled the admin doc-PUT path (WR-01) and canonicalized aliases (WR-02, A2 consciously updated)

---
## v1.8 Notification Sanity (Shipped: 2026-11-05)

**Delivered:** Every server-emitted notification renders in the recipient's locale, due-date reminders are capped at two per task, an opt-in 09:00 digest email replaces individual reminder emails, and a full cited notification audit (all rows `proposed`) gates any future trim work behind owner validation.

**Phases completed:** 36-39 (4 phases, 12 plans, 28 tasks)

**Stats:**
- 147 commits, 106 files changed (+11,768 / −951 lines)
- 4 phases, 12 plans, 28 tasks
- 2 days from milestone start to ship (2026-11-04 → 2026-11-05)
- Suite at close: 943 pass / 0 fail / 3 skipped; `npm run i18n:scan` clean

**Git range:** `4ed4c17` (docs: start milestone v1.8) → `02e9084` (docs: acknowledge D-12)

**Known verification overrides:** 1 newly acknowledged, 9 carried forward from a prior close (see STATE.md Deferred Items) — `override_closeout`; verification digests for Phases 36–38 were stale from intra-milestone source drift (incl. out-of-phase commit 7a7a423), all VERIFICATION.md files read `passed`, and the milestone audit re-verified 13/13 requirements, 11/11 cross-phase wiring and 4/4 E2E flows at HEAD (`v1.8-MILESTONE-AUDIT.md`).

**Key accomplishments:**
- Locale-parameterized `tFor()` translation core with t() delegation, Intl-failure degradation and locale clamping, plus 15 `notif.reminder.*` / `notif.email.*` server keys landed in identical EN+FR flat catalogues.
- Recipient-locale notification emails — server.js boot-registers the shared FR catalogue, resolves `u.locale` on the authority query and passes `msg.locale` into a fully tFor-rendered `buildNotifMessage` frame (greeting/verb/sentence/openTask/button/footer), with reminders getting their own keyed by-label, verb and subject; FR and EN recipients of the same workspace notification get their own language in one run.
- Reminder rows now store `key` + send-time `vars` snapshot alongside the unchanged English snippet, and the inbox localizes keyed rows per viewer locale (sentence AND preview) with byte-identical legacy rendering and snippet fallback for unknown keys.
- The i18n build gate now covers the server side — every t/tFor notif.* literal in server.js/mailer.js must resolve in en.json AND fr.json, and the notif.* namespace is parity-checked both directions, so a missing FR key or drifted catalogue entry fails `npm run i18n:scan` (SC-4) while the src-side scan output stays byte-identical.
- Opt-in daily digest — one localized 09:00-window email per member listing due-today + overdue tasks with deep links, exactly-once via a `ws:{userId}:digest:{localDate}` ledger claim, proven by a 5-test integration suite on the reminder-pass harness.
- Digest users lose individual reminder emails at the fan-out (email-only — rows/push/mentions intact) while `email_digest` becomes a real undefined-falsy opt-in with D-13 replace-framing settings copy in EN+FR.
- Recipient-scoped digest filter (`t.assignee === r.member_id` gate) closing the CR-01 confidentiality leak, proven red-before/green-after by a multi-member CI pin, plus WR-02 tautology cleanup
- docs/notification-audit.md — full cited notification audit (six type sections, RFC 8058 decision with DKIM split), every trim recommendation `proposed` pending owner validation

---

## v1.7 Team Visibility & Hardening (Shipped: 2026-11-04)

**Phases completed:** 4 phases, 12 plans, 13 tasks

**Key accomplishments:**
- Team intersection (`project.teams ∩ member.teams ≠ ∅`) now opens projects through the single `hiddenFor()` funnel via one shared `memberCanReadProject` helper also adopted by the reminder pass and email mirror — purely additive reach, byte-identical 404s preserved, MATRIX extended with team cells across doc-get/file/reminder/fanout/doc-put families.
- sameOrigin guard ordered FIRST on the invite-accept route (HARD-01/D-08), a shared `firstForwardedValue()` helper closing the multi-value x-forwarded-host gap (HARD-05/D-07), and a structural silent `{name,email,password}` whitelist with spoof pins (HARD-04/D-06) — 7 new tests, full 824-test suite green.
- both `firstWorkspace()` invite twins fail closed in one commit (accept 410 `workspaceGone`, SSO twin consumes the dead invite and lands the generic `/login?sso=error`), and link-only admin/owner invites are now impossible at creation (400 `inviteAdminEmailRequired`), harmless at accept (403 refusal), and extinct in stored data (update-only boot sweep) — with the code catalogued EN+FR and 5 new pins.
- Per-user notification preferences as SQLite rows keyed (workspace_id, user_id): single getUserNotifPrefs accessor, GET/PUT /api/me/notif-prefs with a 17-key whitelist, notifPrefs stripped from documents both directions, and reminder/email consumers resolving prefs per recipient.
- One-time guarded backfill `migrateUserNotifPrefs` — a structural clone of the migrateTeamMembership recipe that copies workspace-doc `notifPrefs` into a user_notif_prefs row for EVERY member (D-09) and deletes the doc field in the same `begin immediate` transaction (D-11), gated on a pre-migration backup — plus byte-identical-second-boot, later-joiner, corrupt-doc and SETTINGS-03 invoices pins.
- Recent-search redaction rebuilt on a tokenized matcher (src/lib/redaction.js): full-token NFC+lowercase intersection replaces substring includes, pinned by a 22-test table suite, the D-13 end-to-end scope pin, the D-15 workspace-wide pin, and the CHANGELOG SEARCH-01 limitation note.
- One branching persistence adapter for per-user notif prefs — per-workspace localStorage in local mode, PUT /api/me/notif-prefs in API mode — with the seed block removed and legacy client snapshots stripped so the doc field can never resurrect.
- GET-on-open hydration of stored notification prefs via a pure mergeNotifPrefs helper, wired at all five API-mode workspace-entry paths so an unchecked pref survives F5.
- Closed the F5-reload gap — the /w/<slug> boot routine in main.js now awaits hydrateNotifPrefs after hydrateFromServer succeeds, so an unchecked pref stays unchecked after reload in API mode, pinned by a static sweep test.
- delTeam's toast undo now awaits one doc push (new exported `pushNow()` in store.js) then replays each affected member's union team set through `api.setMemberTeams`, re-creating purged `team_members` rows without erasing newer changes.
- Forward MASTER_KEY_PREVIOUS through docker-compose.yml via the optional `${MASTER_KEY_PREVIOUS:-}` form, proven by a parse + two-case `docker compose config` test, with a DEPLOY.md §14 compose rotation walkthrough.

---

## v1.6 Team Access & Federation (Shipped: 2026-11-02)

**Phases completed:** 4 phases, 17 plans, 13 tasks

**Key accomplishments:**
- `team_members` join table is the single membership authority — guarded backfill
- every client roster/mention/picker surface now reads the projected `teams[]`
- invites now carry a full team set — `invites.teams` JSON column backfilled from
- Wired `memberInProjectTeams` into assignment surfaces via new `assignableInProject(m, p, currentAssigneeId)` predicate — assignee, subassignee, and ctx-menu pickers now exclude out-of-set members while keeping the current assignee visible.
- Membership/invite JSON scope columns + the shared `projectScope`/`hiddenFor` predicate funneled into both `redactDoc` and `mergeClientDoc`, with an admin-gated whitelist-validated scope route — proven end-to-end by a tracer slice (set → read filters → write reserved).
- The D-03 grant inversion (scope OPENS private projects — visible ⟺ in scope for scoped members) riding the single `hiddenFor` funnel, the file-serve by-id side door closed with byte-identical 404 `fileNotFound`, and the named table-driven 404-matrix per endpoint family.
- The scope predicate runs through every send-time resolution point — the server reminder pass, the defensive email mirror, the server-side assignee write-guard (400 `assigneeOutOfScope`), and the advisory client emit pre-filter (`memberScopeEligible`) — so a scoped member is never assigned, mentioned, reminded, or emailed about out-of-scope content.
- Invitations now carry a validated scope (`invites.scope`) that lands on the membership at acceptance, the guest collaborator model rides viewer + exactly-one-project (server-enforced `guestSingleProject`, private projects included via the D-03 grant), and both admin UI surfaces — invite form scope section and member modal scope editor — express the same id-based scope model with EN+FR strings at write time and no scoped-member self-indicator.
- Hand-rolled Entra OIDC authorization-code flow (confidential client + PKCE S256, RS256 id_token via JWKS) over node:crypto only — two no-oracle routes in server.js with the verbatim login session-mint, an additive oidc_identities table, oidcEnabled ground truth in /api/config, and a mock-IdP integration suite proving the whole path plus the D-02 env-gating matrix.
- Pinned-tenant verified-email linking (tid match + non-guest shape + email claim) with guest-shape rejection and a unique-index race backstop in the callback, JIT default-role clamp test-pinned at readConfig, and a 13-row table-driven SSO-08 matrix proving every tamper/claim vector fails closed with no session minted.
- The OIDC callback now stops at the verbatim D-68 challenge for TOTP-enrolled accounts (challenge row + cookie, NO session, 302 → /#tfa; the unchanged /api/auth/tfa/login completes it), and JIT provisioning reconciles pending invitations — auto-accepting a single unexpired invite through the verbatim acceptance recipe, surfacing (never mass-accepting) multiple, ignoring expired — pinned by 6 new test rows.
- With `OIDC_SSO_ONLY=true` the password door is a bare 404 (never 403-with-message, auth family intact, fully reversible with password_hash retained), the Microsoft button renders on login + join surfaces strictly from `/api/config` ground truth, all callback failures surface one generic `page.auth.ssoError` banner, the `/#tfa` and `/#invitations` fragments are wired into the SPA, and DEPLOY.md makes Entra deployment self-serve.
- Removed the parsed-but-never-consumed `OIDC_DEFAULT_ROLE` env var end-to-end (oidc.js config + factories, server.js env doc, DEPLOY.md contract, 8 clamp unit tests) per D-05's locked bare-account model, and recorded the required override on plan-02's SSO-04 must-have truth.
- Replaced the A2 tenant-vouching approximation with the literal `email_verified === true` claim — SSO linking, JIT provisioning and invite reconciliation now all fail closed to `/login?sso=error` for unverified-email tokens, pinned by 3 new negative tests and documented for operators.
- `totp_factors` single source of truth with one-time boot copy (D-06/D-09), a shared `verifyTotpAgainstFactors()` helper converted into the login second step, and a localized factor list in the existing settings 2FA card.
- All tfa step-ups and the enable challenge verify through the `totp_factors` single source of truth, plus the three factor-lifecycle routes — enroll (password + existing-factor code + required label), enable (staged secret, per-factor baseline, transactional insert), and remove (survivor-code guard, verbatim disable teardown for the last factor).
- The settings 2FA card gains the full factor lifecycle — localized list rows with relative last-used, the "Add factor" staged wizard (required naming → password + existing-factor code → QR/verify), and a per-factor remove confirm echoing the factor name — completing TOTP2-02/TOTP2-05 and the EN+FR i18n gate.

---

## v1.5 Reliability & Rotation (Shipped: 2026-11-01)

**Phases completed:** 5 phases, 17 plans, 13 tasks

**Known verification overrides:** 5 newly acknowledged, 3 carried forward from a prior close
(see STATE.md Deferred Items). Verification digests for phases 23–26 are stale (shared files
touched by later phases); final-tree evidence from Phase 27 verification (11/11) and the
v1.5 milestone audit (tech_debt, 15/15 REQs, integration 6/6, flows 5/5).

**Key accomplishments:**
- /w/:slug/task/:key now lands on the existing task drawer over the project board with the URL persisted across reload, unknown/hidden keys get the localized not-found toast, and every notification email links to APP_URL + /w/:slug/task/:key — proven by 4 e2e scenarios (EN+FR), 6 node tests, and a 575/575 full suite.
- A signed-out visitor hitting /w/:slug/task/:key gets the sign-in view with the path carried via ?next= and lands on the exact task after sign-in; the open-redirect guard is pinned by tests at both carry sites.
- Every SPA view now mirrors into browser history — go() pushes per-view URLs (/w/:slug/inbox, /project/:key, /task/:key…), one boot-time popstate handler restores views through the deep-link resolver with { back: true }, and closing the task drawer pushes the underlying view URL so Back re-opens the task.
- queueNotifEmails now resolves the byline and recipient email from the memberships⋈users authority rows (workspace-scoped), so account-backed authors show their real name instead of "Un membre" and account-backed recipients are never silently skipped.
- /w/:slug/team/:id is now a first-class deep link — urlForView() emits the keyed team URL and applyDeepLink resolves it (unknown ids land home with no oracle, bare /team shows the list) — closing the last lossy URL from 23-04.
- Relaxed the audit-trail client gates (fetch + card mount) so workspace admins see their workspace-scoped revoke rows on Settings → sessions, with the server-contract pinned by a cross-membership test — closing UAT gap G-24-5.
- Boot-time TOTP re-wrap rotation: two env vars + one reboot converges every old-envelope 2FA secret to `v2:<new-key-id>` — idempotent, transactional, backup-guaranteed, with no 2FA re-enrollment (KEY-03)
- DEPLOY.md §14 "Key custody & rotation" — a copy-pasteable operator lifecycle (generate → inject → rotate → verify 0 stale → roll back → converge → compromise policy) with every command pinned to server behavior by doc-parsing parity tests (KEY-04)
- DEPLOY.md §14 now stops a broken keyring BEFORE rotating — image-currency grep (`migrateTotpReWrap ≥ 1`) and key-id coverage (`id(MASTER_KEY_PREVIOUS)` vs DB-stamped `v2:` ids) — and a no-data-loss recovery note covers the D-K7-without-re-wrap signature (closes gap G-26-1)
- Clock-injectable `runReminderPass()` in server.js — 09:00 workspace-local window scan with transactional exactly-once dedup in a new `reminders_sent` table, `by:null` reminder rows riding the existing `queueNotifEmails` pipeline behind the `email_reminder` gate, boot catch-up + 60s unref'd tick that never writes off-hour (13 new tests, full suite 646 green).
- Three notifPrefs reminder toggles (email_reminder/due_reminder/past_due, all ON by default for new and legacy workspaces via bootstrap defaults + a normalize-on-read merge) rendered through the existing Settings tog/np save path, plus inbox filter chips and guarded system-actor rendering for the two reminder types with complete EN+FR catalogue entries (8 new keys).

---

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
- password-correct logins on 2FA accounts now stop at an inert 5-minute challenge (`pending2fa` + separate `projects_tfa_challenge` cookie); only a live TOTP or a burn-once recovery code on the new `POST /api/auth/tfa/login` mints the session — atomically, inside one shared throttle budget, with generic lockout copy.
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

Single-workspace Projects Studio: dashboard, inbox, my tasks, projects with board / list / table /
calendar / timeline / files views, members, teams, activity and settings, served by a single
Docker image behind Traefik.
