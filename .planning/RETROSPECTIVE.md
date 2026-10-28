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
- Login second factor: pending2fa + gr8r_tfa_challenge cookie, structurally anonymous until verified; dual-shape client '2fa' card
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

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.1 Multitenant | 2 days | 4 | Phase verification was produced for phase 4 only; the audit backfilled phases 1–3. Next milestone: verify every phase before it closes. |
| v1.2 Localization | 2 days | 8 | Every phase verified before close (50/50 plans); the close still re-verified all 8 after close-out commits staled the digests. Next milestone: finish close-out edits BEFORE running verifiers, and never hand-write a covered digest. |
| v1.3 Auth Hardening | 2 days | 6 | All 6 phases verified before close, but shared-file edits across phases staled 4 of 6 digests anyway; the close accepted overrides with final-tree evidence (Phase 18 + integration check). Lesson refined: with a shared server.js, per-phase digests cannot all stay fresh — verify the last phase and audit the final tree instead. |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.1 Multitenant | 48 node:test + 5 Chromium | server contract, migration, privacy matrix, browser tenancy | 1 (dev only: `@playwright/test`) |
| v1.2 Localization | 446 node:test + 45 Chromium e2e | catalogue contract (23 pins), locale selector, 21-route fr sweep + build gate, uploads/previews byte-serving | 0 (runtime) / 1 (dev only: `@playwright/test`) |
| v1.3 Auth Hardening | 526 node:test + 55 Chromium e2e | TOTP fixtures (RFC 4226/6238), migration second-boot parity, 401 anonymity matrix, honest-copy guards, i18n-scan build gate | 0 (runtime; vendored qrcode-generator source, no package) |

### Top Lessons (Verified Across Milestones)

1. **Verify at the phase boundary, not at the milestone boundary.** One milestone is not a
   pattern yet, but the cost of backfilling three verifications at close time is the argument.
2. **The server is the only boundary that counts.** Redaction, membership and authorisation
   all worked when they lived on the server; the UI-only versions of the same features were
   the ones that had to be replaced.
