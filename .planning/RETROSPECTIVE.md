# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.1 — Multitenant

**Shipped:** 2026-10-22
**Phases:** 4 | **Plans:** 7 | **Tasks:** 10 | **Commits:** 54 | **Working days:** 2 (2026-10-21 → 2026-10-22)

### What Was Built

- A workspace became a real tenant: a row with a unique slug, its own JSON document, its own
  URL (`/w/:slug`) and a real membership list. An account can belong to several workspaces
  with a different role in each.
- The membership table became the single source of truth for access. Roles, status, removal,
  leave, invites, plan and workspace deletion all go through dedicated endpoints; the browser
  never rewrites the roster into the document.
- Private projects became server-enforced. The document a member receives omits a private
  project and every row that references it, and a redacted write cannot delete or rewrite
  what it cannot see.
- The milestone shipped with a real test suite: 44 `node:test` cases against real
  `server.js` processes and real SQLite databases, a Chromium two-tenant UAT, CI wiring and
  a release (1.1.0, Node 24, Keep a Changelog notes, full upgrade and rollback path).

### What Worked

- **One harness for every suite.** `test/helpers/server.mjs` spawns a real server on an
  ephemeral port with its own `mkdtemp` database. Adding a suite costs a file, not a
  boilerplate block, and no test mocks HTTP or SQLite.
- **A migration test built from the real old schema.** `test/helpers/legacy-fixture.mjs`
  reproduces the exact pre-tenancy database instead of a mock of it, so the migration is
  proven against the shape it actually has to read. It found a real bug: legacy invites were
  never scoped.
- **Verification as a separate mind from execution.** The post-execution code review
  (1 Critical + 9 Warnings + 2 Info) was disposed item by item, and every fix was a separate
  commit. The Critical finding — that a redacted write could delete hidden projects — is the
  reason the privacy suite exists.

### What Was Inefficient

- **The milestone shipped without a verification artifact for three of its four phases.** The
  milestone was run in spec → discuss → plan → execute mode, which produces a SUMMARY but no
  VERIFICATION. The audit had to backfill all three, and phase 4's report went stale within a
  day because the code it covered changed.
- **No test changed a role and then kept editing.** The revision handshake between the phase-1
  concurrency control and the phase-2 document-mutating endpoints was broken for the whole
  milestone: after an owner changed one role, the workspace silently stopped accepting
  writes and the UI still announced the edit. It was found by a milestone audit, not by the
  suite — the one gap in an otherwise strong test story.
- **The browser URL is still write-only.** `go()` never updates the address bar and nothing
  handles `popstate`, so back/forward and reload lose the current page. It was noticed during
  the audit and left for the next milestone.

### Patterns Established

- **A document write is a whole-document write.** The client holds the document and sends it
  whole; the server owns the merge rules. Every server-side edit therefore has to move the
  revision *and* report it, or the next client write is rejected.
- **Server-side redaction, not UI filtering.** A hidden row is absent from the document the
  browser ever sees, and the write path restores it from storage. The browser filter
  (`canSee()`) is a convenience for demo mode, never the boundary.
- **Fixtures through the API, assertions only in the browser.** The e2e helper creates
  accounts, workspaces and projects through the real API; every visibility claim is asserted
  with role/label/text selectors in Chromium.

### Key Lessons

1. **A milestone without a verification artifact per phase will pay for it at close time.**
   The audit is the last chance to catch a phase that only ever produced a SUMMARY.
2. **Test the sequence, not the endpoint.** Every endpoint was correct; the *order* of a role
   change followed by an ordinary edit was broken. A test that changes a role and then saves
   would have caught it in phase 2.
3. **A contract change in one phase breaks the contract of another.** The revision counter
   was phase 1's concurrency control; phase 2 added endpoints that edited the same row.
   Whoever adds a document-mutating endpoint owes the client a revision.
4. **Audit the shipped milestone, not just the plan.** The audit found a blocker that four
   phases of green tests had missed.

### Cost Observations

- Model mix: the milestone was executed with one model; the audit and verification used
  subagents for the independent checks.
- Notable: 54 commits over two working days, but three of the four phases shipped with no
  verification artifact. Speed is not the constraint — the verification step was skipped.

---

## Milestone: v1.2 — Localization

**Shipped:** 2026-10-25
**Phases:** 8 | **Plans:** 50 | **Tasks:** 68 | **Commits:** ~197 | **Working days:** 2 (2026-10-24 → 2026-10-25)

### What Was Built

- The interface stopped lying about languages: a dependency-free `t()` layer over 1 538-key
  JSON catalogues (EN/FR), locale-aware dates, numbers and CLDR plurals, accent-insensitive
  search ("elodie" finds "Élodie"), and every stored-vocabulary display routed through the
  catalogue while documents keep their English wire values.
- The locale became a per-user preference (new column + lossless migration) with an honest
  selector — the language switches without a reload and no English flash survives.
- The whole journey is browser-proven in both locales: the 8 previously untested flows now
  have Chromium coverage, plus a 21-route French sweep and a demo-mode spec against the built
  artifact with the API dead.
- The guarantee is enforced: `scripts/i18n-scan.mjs` fails the build on any new uncatalogued
  literal, the French catalogue ships as its own chunk (an English build carries none of its
  bytes), and a `docker-build` CI job proves the shipped image speaks French.
- Files became real: raw-body streaming uploads under `DATA_DIR/files/` with a size cap and a
  stable 413 code, byte-only `/w/:slug/file/:id` serving with ranges and a fixed
  inline/attachment mime policy, PDF/image previews in a wide modal, and anonymous file
  navigations landing on a path-preserving login redirect.

### What Worked

- **Contract-first i18n.** The catalogue contract (escaping, key shapes, placeholder parity,
  CLDR plurals) was pinned by tests *before* a single string moved, so 3 000+ extraction
  edits across 50 plans never had to argue about shape — and the per-change ledger test
  (1 532 → 1 538) made catalogue growth deliberate.
- **Behaviour-preserving waves with byte-identical acceptance.** English extraction was
  structured so every wave proved its output byte-identical to the original, which is why a
  ~600-edit refactor produced no visual regressions to chase.
- **The scanner as a build gate from day one.** Because `i18n-scan` gated every prebuild, the
  four raw-English splice sites the milestone deferred were found immediately at close and
  closed in one commit (2a75275) — the gate made the debt visible and bounded.
- **Re-verification with fresh evidence.** When the close-out commits staled all 8 covered
  digests, re-dispatching the verifier per phase regenerated every report against the current
  tree — and surfaced two real findings (CR-01, the probe-race test-isolation defect) in the
  process. The digests that could be repaired were repaired with the official
  `verification.fingerprint` CLI verb; the ones over genuinely drifted files were re-earned.

### What Was Inefficient

- **Digest staleness whack-a-mole at close time.** Post-phase close-out commits (lint, i18n
  splice fixes, prettier) staled every covered digest, forcing a full re-verification round
  during the milestone close. Two of those rounds happened only because verifier sessions
  hand-rolled `covered_digest` instead of copying the CLI verb's output — one even invented a
  `v3:` version the parser refuses. Next milestone: the digest line is copy-paste, not
  computation.
- **A test-isolation defect cost three sessions time.** `test/i18n-scan.test.mjs:353` mutates
  the real `src/views/table.js` in place with no lock; two concurrent `npm test` runs
  double-appended the probe and crashed unrelated suites. Only one verifier may run at a time
  until that test writes to a temp copy (backlog candidate).
- **The auth zone was stubbed deeper than the milestone could see.** UAT outside phase 12's
  perimeter found "disconnect other sessions" inert, password change not actually taking
  effect, and a fake 2FA QR code. Honest carry-over: backlog phases 999.1–999.3, one
  investigation phase for the whole zone.

### Advice for the Next Milestone

1. Never hand-write `covered_digest` — run `gsd_run query verification.fingerprint` and copy
   the output. A wrong digest reads as drift and costs a full verifier round.
2. Do not run two `npm test` suites concurrently against this repo until the probe test is
   de-raced; verify phases serially.
3. The auth zone (sessions, password change, 2FA) smells stubbed end-to-end — make it the
   first candidate when scoping v1.3.

---

## Milestone: v1.3 — Auth Hardening

**Shipped:** 2026-10-28
**Phases:** 6 | **Plans:** 19 (+2 gap closures) | **Tasks:** 29

### What Was Built
- Canonical decisions doc (13-DECISIONS.md, D-01…D-17) pinning every auth contract before any build work
- Real session ground truth: additive migration (sessions columns, login_challenges, dormant two_fa_* columns), doc-field strip, three /api/auth/sessions endpoints, sessions tab rewire
- Central mid-session 401 intercept routing every revocation through one honest signOutRevoked teardown
- Password change end-to-end: verify-inside-transaction, atomic rehash + revoke-others, honest copy with a substring-level honesty regression guard
- TOTP core: fixture-verified totp.js (replay guard, ±1 window), vendored QR encoder, verify-before-enable, hashed burn-once recovery codes
- Login second factor: pending2fa + projects_tfa_challenge cookie, structurally anonymous until verified; dual-shape client '2fa' card
- Closing proof: login_challenges schema parity, doc auth-key walk, Chromium e2e EN+FR, real-device UAT 3/3, 526/526 green gate

### What Worked
- Investigation-first phase (13) paid off: every later phase cites D-01…D-17 instead of re-litigating; zero mid-build design surprises on the auth surface.
- One revocation primitive reused three times (SESS-02, PASS-02, teardown) — built once in 14-03/14-05, consumed verbatim.
- The central 401 intercept (gap-closure plan 14-05) replaced per-site branches — one honest teardown, latch + re-arm, and no stacked toasts downstream.

### What Was Inefficient
- Verification digests staled again: phases 14–17 touched shared files (server.js, api.js) after their verifiers ran; the close accepted overrides rather than re-running execute-phase ×4.
- SUMMARY frontmatter skipped requirements-completed for 14–17 — evidence had to be pulled from VERIFICATION tables during the milestone audit.
- validate-phase never ran during execution: all 6 VALIDATION.md files stayed draft through ship.

### Patterns Established
- Gap-closure plans (13-02, 14-05) as a first-class wave rather than reopen-and-pray.
- Honest-copy rule enforced by regression tests (password-copy-honesty.test.mjs), not review.
- Vendored third-party source (qrcode-generator) with upstream license header, excluded from i18n scan.

### Key Lessons
1. Pin shared-file contracts before parallel phases: when every phase edits server.js, digest staleness at close is structural — either re-verify the last phase only and audit the final tree, or serialize the verifier.
2. A single server-side invariant (pending sign-in is anonymous) is best proven structurally (cookie never read by currentUser) rather than by endpoint-by-endpoint tests.

### Cost Observations
- 2 days elapsed (2026-10-26 → 2026-10-28), 21 plans; longest: 17-01 (115 min), 16-02/03 (~45–50 min each).
- Notable: Phase 18 closing gate (9/9) plus the integration check made stale 14–17 digests cheap to accept.

---

## Milestone: v1.5 — Reliability & Rotation

**Shipped:** 2026-11-01
**Phases:** 5 | **Plans:** 17

### What Was Built
- Email deep links: `APP_URL + /w/:slug/task/:key` lands on the task drawer (logged-out carry via `?next=`), team deep links, per-view URL mirror with popstate, creator auto-watching, authority-row email bylines
- Operator audit trail + workspace-admin revocation tier: same-transaction append-only audit rows, tier-scoped keyset read endpoint, owner Settings trail
- Keyring & version-aware envelopes: generic `/^v\d+:/` boot filter, frozen `v2:<key-id>:<iv>:<tag>:<ct>` format, two-key keyring, fail-closed decrypt dispatch
- Re-wrap MASTER_KEY rotation: one reboot converges all old envelopes, no 2FA re-enrollment; DEPLOY.md §14 custody runbook pinned by parity tests
- Due-date reminder scheduler: clock-injectable `runReminderPass()`, transactional exactly-once dedup in `reminders_sent`, boot catch-up, three notifPrefs toggles, inbox chips EN+FR

### What Worked
- The research-derived build order (deep links → audit → keyring filter → rotation → scheduler last) meant each phase consumed finished prerequisites — zero cross-phase rework.
- Decision docs (D-K1…D-K13) frozen at plan time with user checkpoints (envelope format) avoided any mid-build format churn.
- Clock injection via a test-only internal route made the scheduler testable without waiting on real time; 13 new scheduler tests landed in the core plan.

### What Was Inefficient
- Verification digests staled for phases 23–26 yet again (shared server.js) — the close accepted overrides with final-tree evidence, per the v1.3 lesson. The lesson is now confirmed structural: stop re-litigating, verify the last phase + audit the final tree.
- VALIDATION.md files stayed draft for phases 23, 24, 26, 27 (Nyquist partial-coverage) — validate-phase still never ran during execution.
- Two debug sessions were left in `unknown` state (admin-revoke-only-own-session, login-broken-after-rotation) and had to be acknowledged blind at close.

### Patterns Established
- Version-tagged envelope format (`v<n>:…`) as the general shape for secret-at-rest evolution.
- Env-only key-custody operations (never argv), pinned by doc-parsing parity tests against DEPLOY.md.
- `reminders_sent`-style transactional dedup tables as the exactly-once pattern for background sends.

### Key Lessons
1. The zero-dependency ground rule is still cheap to honor: an in-process interval + boot catch-up covered scheduling, dedup tables covered restart safety.
2. The `?next=` path-only carry validator from v1.1 (four-clause) was reusable verbatim for task deep links — investing in one pinned redirect guard keeps paying off.

### Cost Observations
- 2 days elapsed in the phase range (2026-10-30 → 2026-11-01), 17 plans; longest: 25-02 (~75 min), 23-06 (~50 min).
- Notable: full suite grew 526 → 649 across the milestone with zero new runtime dependencies.

---

## Milestone: v1.7 — Team Visibility & Hardening

**Shipped:** 2026-11-04
**Phases:** 4 | **Plans:** 12

### What Was Built
- Team-derived project visibility: `project.teams ∩ member.teams ≠ ∅` rides the single `hiddenFor()` funnel through one shared `memberCanReadProject` helper, adopted by the reminder pass and email mirror — D-03 grant inversion and byte-identical 404s survive (VIS-01..03)
- Membership-surface hardening: sameOrigin first on invite-accept, shared `firstForwardedValue()`, silent `{name,email,password}` whitelist with spoof pins, fail-closed `firstWorkspace()` twins, link-only admin invites extinct (HARD-01..05)
- Per-user notification preferences as real SQLite rows: single accessor, 17-key whitelist GET/PUT, dual strip + boot sweep, guarded one-time backfill in a pre-backup-transaction (SETTINGS-01..03)
- Recent-search redaction rebuilt on a tokenized NFC+lowercase matcher replacing substring `includes` (SEARCH-01)
- Honest delTeam undo: awaited `pushNow()` with shared mutex + 5s deadline, fail-closed `!pushed.ok` gate, union replay of purged memberships (UNDO-01/02); `MASTER_KEY_PREVIOUS` forwarded in compose (DEPLOY-01)

### What Worked
- The v1.3/v1.5 lesson finally paid: the close re-ran the verifier on all four phases (parallel subagents) and realigned digests mechanically instead of debating overrides — the refresh was honest (each verdict re-checked must-haves against current code) and fast.
- Reusing proven recipes beat inventing: the notif-prefs migration cloned the `migrateTeamMembership` recipe; the undo path reused the D-68 challenge/step-up discipline. Zero migration surprises.
- Code-review fixes (WR-01..03 on phase 35) landed as small single-purpose commits, which made the post-fix re-verification a 10-minute check instead of an audit.

### What Was Inefficient
- The covered_digest mechanics bit again: a verifier-computed digest over a file list can disagree with a locally recomputed one (source-only vs full-list), and `verification status` gives no diff detail — 5 tool round-trips per phase to realign. The digest workflow needs a single canonical command.
- The milestone audit was run mid-milestone (status `in_progress`) and archived as-is; a final-tree audit would have been cleaner, though every fact it needed was already covered by per-phase verifications.

### Patterns Established
- "One helper, one funnel": send-time and read-time visibility surfaces must consume the same predicate (`memberCanReadProject`/`hiddenFor`) — never a second pipeline.
- Bounded wait loops around shared mutexes (`pushNow()` 5s deadline returning `{ok:false,status:0}`) as the standard for client-initiated pushes with fail-closed gates.
- Per-user prefs as rows keyed (workspace_id, user_id) with a single accessor — doc fields are never the store for per-user state.

### Key Lessons
1. The v1.3 lesson inverted: with disciplined single-purpose fixes and parallel verifier subagents, digest refresh at close is now cheap — but only because fixes never strayed outside covered files.
2. Recipe cloning (Team membership migration → notif-prefs migration) is the project's most reliable quality lever; new mechanisms should always ask "what shipped recipe is closest?"

### Cost Observations
- 2 days elapsed (2026-11-02 → 2026-11-04), 116 commits, 96 files, +11 390/−162.
- Notable: full suite grew 803 → 896 across the milestone; zero new runtime dependencies throughout.

---

## Milestone: v1.8 — Notification Sanity

**Shipped:** 2026-11-05
**Phases:** 4 | **Plans:** 12

### What Was Built
- Server notification i18n: locale-parameterized `tFor()` over the shared EN/FR catalogue, per-recipient `u.locale` on the authority query, fully rendered `buildNotifMessage` frame, keyed reminder rows (`key` + send-time `vars`) localized per viewer in the inbox — with the build gate extended to the server `notif.*` namespace and EN⇄FR parity (I18N-01..04)
- Reminder cadence rework: at most two due-date notifications per task ("due today" morning-of + "past due" the next morning), `day_before` removed deploy-safely (orphaned dedup rows inert, no migration), `push_due` pref retired end-to-end with PUT → 400 (REM-01..04)
- Opt-in daily digest: localized 09:00 workspace-local email listing due-today + overdue tasks, exactly-once via a disjoint claim ledger, recipient-scoped task filter closing the CR-01 confidentiality leak (proven red-before/green-after), type-scoped suppression of reminder emails only (DIGEST-01..03)
- Full notification audit doc (`docs/notification-audit.md`, 25 cited rows, RFC 8058 decision with the DKIM one-click split) shipping doc-only under the D-05 owner gate — every trim recommendation `proposed` (AUDIT-01/02)

### What Worked
- The research-derived build order held: i18n as leaf infrastructure first meant the cadence and digest phases never touched a rendering path twice — zero cross-phase rework for the third milestone running.
- Red-before/green-after discipline caught a real confidentiality leak (WR-01 multi-member digest pin failed at the base commit before the CR-01 gate landed), the strongest possible evidence shape for a security-adjacent fix.
- The doc-only phase worked exactly as designed: the audit shipped with zero behavior change, the D-05 gate kept all 25 rows `proposed`, and the epigraph turned inevitable line-number drift into a designed code-drift signal instead of a defect.

### What Was Inefficient
- The v1.7 lesson regressed on one axis: an out-of-phase commit (Kanzo #9 LOG_LEVEL, `7a7a423`) landed mid-milestone, staling the 36–38 verification digests AND introducing a `logLine`→`logInfo` recursion that took 441 test failures to red territory before being fixed. Out-of-phase work should either re-run the affected verifiers immediately or wait for a milestone boundary.
- The Phase 37 UAT checkpoint (digest subject workspace/project naming) was deferred to a backlog phase (999.1) mid-close again — small, but it is now the second milestone carrying a deferred UAT follow-up across a close.
- Nyquist VALIDATION.md files were seeded as `draft` for 3 of 4 phases and never reconciled — the standing gap noted in v1.5 persists.

### Patterns Established
- "One catalogue, two renderers": emails (`buildNotifMessage`, `buildDigestMessage`) and inbox rows must resolve through the same `tFor` + locale JSON the client ships — a forked server catalogue is a build-gate failure, not a style choice.
- Disjoint claim-key namespaces in a shared ledger (`ws:task:member:offset:due` vs `ws:user:digest:date`) as the standard for exactly-once scheduling that must not double-send or suppress each other.
- Suppression gates are type-scoped and email-only: a digest suppresses `email_reminder` fan-out AFTER the row claim commits, so inbox/push state is never lost to an email preference.
- Owner-gated docs: behavior-changing recommendations ship as documentation with an explicit validation-status column (`proposed`/`validated`/`rejected`) — no code moves against an unruled row.

### Key Lessons
1. Out-of-phase work is the residual verification risk: shared-file drift from a same-day side commit cost a 441-failure regression and three stale digests. Land out-of-phase changes at milestone boundaries or re-verify immediately.
2. The digest fingerprint lesson from v1.7 holds, with a caveat: parallel verifier re-runs remain cheap, but they only help when the drift is intra-milestone. External drift (side commits) needs the same immediate response.

### Cost Observations
- 2 days elapsed (2026-11-04 → 2026-11-05), 147 commits, 106 files, +11 768/−951.
- Notable: full suite grew 896 → 943 across the milestone; zero new runtime dependencies throughout.

---

## Milestone: v1.10 — Extensions & Adapters

**Shipped:** 2026-11-07
**Phases:** 4 (45-48) | **Plans:** 9 + 2 branch deliveries

### What Was Built
- Database adapter (DBA-01..04): async `db-adapter.mjs` facade, `DB_URL` selects `pg` (first runtime dependency, D-12 amended), SQLite byte-identical default, pg schema/migrations/seed, one-shot copy script, `POSTGRES_TEST_URL` matrix (7 tests, exposed and closed 3 real pg-only bugs)
- MCP server (MCP-01..04): 35-tool authenticated workspace-scoped surface at `/mcp`, hand-rolled JSON-RPC 2.0, personal `psk_live_` API keys, permission-funnel parity with UI/API, `MCP.md` + `DEPLOY.md` §15 (branch feat/mcp, e541e45)
- Real browser push & toasts (PUSH-01..03): minimal service worker + per-user/workspace seen-set, exactly-one feedback per gated event, derived blocked-permission UX, zero deps (Phase 48)
- Two-letter G shortcuts in the command palette (FIX-01): shared `gPending` GO_MAP, query-typing guard, initials-across-words filter behaviorally pinned (branch fix/commands, 62b1826)

### What Worked
- The POSTGRES_TEST_URL matrix caught three genuine pg-only defects (two SQL rewrites + int8 typing) that the SQLite suite could never see — opt-in matrix tests are how a dual-backend promise stays honest.
- Branch-delivered phases were reconciled at close with retrospective SUMMARY + fresh verifier runs (2/2, 4/4) instead of being waved through — the audit passed because the evidence was rebuilt, not assumed.
- The 45-05 flake deferred item was resolved by running the full suite firsthand at close (1133 tests, 0 fail) before acknowledging it — one verification killed the ambiguity.

### What Was Inefficient
- Phases 46/47 landed without the standard artifact chain (no plans, no SUMMARY, no verification at merge time), so the close backfilled everything: two SUMMARYs, two verifier runs, one inline gap fix (missing palette regression tests + a wrong 31/31 evidence figure). Branch delivery skips the discipline that makes closes cheap.
- Verification digests staled repeatedly during the close itself (covered-file edits after verification); recomputing covered_digest via `verification.fingerprint` is the correct tool, but it cost several cycles to learn that the list must match covered_files exactly.

### Patterns Established
- Dual-backend discipline: dialect branches owned by the adapter, `sqliteOnly` gating for SQLite-specific ops, fail-closed pg boot that never leaks the DSN.
- MCP permission parity: every tool call resolves through the same membership funnel as UI/API — an external surface is never a second permission system.
- `psk_live_` personal API keys with hash-only storage, revocation and expiry as the credential shape for machine access.

### Key Lessons
1. If work is delivered on a branch, land its planning artifacts with it — the close-time backfill cost more than writing the SUMMARY at merge time.
2. A matrix test suite gated on an env var (all-skip when unset) is the cheapest way to keep a second backend provably working without burdening every developer.
3. Evidence figures in traceability bullets must be measured, not remembered — the "31/31" claim was wrong in two documents before the verifier checked.

### Cost Observations
- 1 day (2026-11-07), ~160 commits in range, 174 files, +13 898/−1 082.
- Notable: suite grew 1042 → 1133; first runtime dependency (`pg`) added under the amended D-12.

---

## Milestone: v2.0 — Project-level Permissions & Invitations

**Shipped:** 2026-11-09
**Phases:** 4 | **Plans:** 17

### What Was Built

- Visibility collapsed to boolean-private ∨ access list through one live funnel
  (`memberCanReadProject`) mirrored across server, reminder/email fanout and MCP.
- Strict invite hierarchy (owner-only owner grants), post-invite editability, one guest
  concept (viewer + exactly one project), per-project members-may-invite-guests toggle.
- Live team→project links (D-50-5): joining/leaving a linked team grants/revokes access on
  the very next request — replacing Phase 49's materialization sweep mid-milestone.
- Settings > Permissions page removed end-to-end; permCreate became a real server-enforced
  setting with a keyed refusal; lead-on-create; honest not-found epoch.
- Admin transparency view of any member's exact access with reason labels (Phase 52).

### What Worked

- The mid-milestone design pivot (snapshot → live team links) was cheap because the funnel
  was already single-entry: deleting the sweep was safer than keeping both models.
- The dead-key i18n detector (Phase 51) turned the standing EN+FR invariant into a build
  gate that self-cleaned 17 orphaned keys.
- Hand-derived visibility oracle fixture (13 cells) kept parity claims testable, not asserted.

### What Was Inefficient

- Shared-file digest churn again: closing the milestone left 3 of 4 phase digests stale
  (server.js edits in later phases); close proceeded as override_closeout backed by the
  milestone audit re-running the full suite + 6/6 E2E flows at HEAD.
- UI review findings arrived after UAT, requiring a second fix round on Phase 52.

### Patterns Established

- Keyed refusals riding a 200 (e.g. `projectCreateForbidden`) with localized toast +
  optimistic revert — the client-never-lies error shape for preference-gated actions.
- `data-in` binding + `IN.*` handler as the required pattern for modal inputs that must
  survive a full re-render.

### Key Lessons

- Verify-then-edit ordering matters less than auditing the final tree: the audit's
  fresh full-suite + integration pass is what actually carried the close.
- Design pivots are safe when the access decision has exactly one doorway.

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.1 Multitenant | 2 days | 4 | Phase verification was produced for phase 4 only; the audit backfilled phases 1–3. Next milestone: verify every phase before it closes. |
| v1.2 Localization | 2 days | 8 | Every phase verified before close (50/50 plans); the close still re-verified all 8 after close-out commits staled the digests. Next milestone: finish close-out edits BEFORE running verifiers, and never hand-write a covered digest. |
| v1.3 Auth Hardening | 2 days | 6 | All 6 phases verified before close, but shared-file edits across phases staled 4 of 6 digests anyway; the close accepted overrides with final-tree evidence (Phase 18 + integration check). Lesson refined: with a shared server.js, per-phase digests cannot all stay fresh — verify the last phase and audit the final tree instead. |
| v1.5 Reliability & Rotation | 2 days | 5 | The v1.3 lesson applied as-is: digests for 23–26 staled (shared server.js) and the close accepted overrides with Phase 27 final-tree evidence + milestone audit, without debate. Research-derived build order eliminated cross-phase rework; VALIDATION.md drafts remain the standing gap. |
| v1.7 Team Visibility & Hardening | 2 days | 4 | The v1.3 lesson finally inverted: parallel verifier subagents + mechanical digest realignment refreshed all 4 verifications honestly at close, no overrides. Recipe cloning (membership migration → notif-prefs migration) eliminated migration risk. Digest fingerprinting remains tool-clunky (no canonical recompute command). |
| v1.8 Notification Sanity | 2 days | 4 | Research-derived build order (i18n leaf first) produced zero cross-phase rework. One out-of-phase side commit (Kanzo #9) staled 3 digests + caused a 441-failure recursion regression; close ran as override_closeout with 1 newly acknowledged + 9 carried-forward deferred items, backed by a passed milestone audit (13/13 requirements, 11/11 wiring, 4/4 flows re-verified at HEAD). |
| v1.10 Extensions & Adapters | 1 day | 4 | Two phases were branch-delivered without artifacts; the close backfilled SUMMARYs and re-verified everything honestly (all 4 passed, no overrides beyond 1 resolved deferred item). Lesson: land planning artifacts WITH the branch. Fingerprint staleness during close resolved via `verification.fingerprint` recompute over the exact covered_files list. |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.1 Multitenant | 48 node:test + 5 Chromium | server contract, migration, privacy matrix, browser tenancy | 1 (dev only: `@playwright/test`) |
| v1.2 Localization | 446 node:test + 45 Chromium e2e | catalogue contract (23 pins), locale selector, 21-route fr sweep + build gate, uploads/previews byte-serving | 0 (runtime) / 1 (dev only: `@playwright/test`) |
| v1.3 Auth Hardening | 526 node:test + 55 Chromium e2e | TOTP fixtures (RFC 4226/6238), migration second-boot parity, 401 anonymity matrix, honest-copy guards, i18n-scan build gate | 0 (runtime; vendored qrcode-generator source, no package) |
| v1.5 Reliability & Rotation | 649 node:test (e2e extended in v1.4 window) | deep-link resolver + redirect-guard pins, audit same-transaction rollback tests, envelope seed matrix + rotation idempotence, scheduler dedup/caught-up/off-hour tests, doc-parsing parity for DEPLOY.md §14 | 0 (runtime) |
| v1.7 Team Visibility & Hardening | 896 node:test | team-intersect visibility matrix (doc-get/file/reminder/fanout/doc-put), hardening pins (sameOrigin order, spoof whitelist, fail-closed twins), 17-key prefs whitelist + migration second-boot parity, 22-row tokenized-matcher table suite, undo mutex/deadline pins, compose-config parse test | 0 (runtime) |
| v1.8 Notification Sanity | 943 node:test | server-side i18n build gate (server notif.* key set + EN⇄FR parity), two-offset cadence suite (21 due-reminder tests incl. pre-09:00 purity + catch-up), digest integration suite (send idempotence, suppression matrix, CR-01 multi-member leak pin), prefs round-trip pins (retired push_due → 400) | 0 (runtime) |
| v1.10 Extensions & Adapters | 1133 node:test | dual-backend suite (pg matrix via POSTGRES_TEST_URL, static-audit gate on db callsites), MCP suite (25 tests: surface freeze, auth, scoping, permission parity), palette-filter behavioral contract (7 tests), browser-push suite (18 tests) | 1 (runtime: `pg`, D-12 amended) |

### Top Lessons (Verified Across Milestones)

1. **Verify at the phase boundary, not at the milestone boundary.** One milestone is not a
   pattern yet, but the cost of backfilling three verifications at close time is the argument.
2. **The server is the only boundary that counts.** Redaction, membership and authorisation
   all worked when they lived on the server; the UI-only versions of the same features were
   the ones that had to be replaced.
