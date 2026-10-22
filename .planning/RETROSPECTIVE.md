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

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.1 Multitenant | 2 days | 4 | Phase verification was produced for phase 4 only; the audit backfilled phases 1–3. Next milestone: verify every phase before it closes. |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.1 Multitenant | 48 node:test + 5 Chromium | server contract, migration, privacy matrix, browser tenancy | 1 (dev only: `@playwright/test`) |

### Top Lessons (Verified Across Milestones)

1. **Verify at the phase boundary, not at the milestone boundary.** One milestone is not a
   pattern yet, but the cost of backfilling three verifications at close time is the argument.
2. **The server is the only boundary that counts.** Redaction, membership and authorisation
   all worked when they lived on the server; the UI-only versions of the same features were
   the ones that had to be replaced.
