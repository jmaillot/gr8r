# Phase 13: Investigation & Invariant Pinning - Pattern Map

**Mapped:** 2026-10-26
**Files analyzed:** 1 new file (documentation deliverable) — zero source files modified
**Analogs found:** 1 / 1 (role-match; no `DECISIONS.md` precedent exists, so analogs are the project's established decision-record and evidence-citation conventions)

## Phase Shape (read this first)

Phase 13 ships **no runtime code**: no `package.json` change, no migration, no server/frontend
edits (RESEARCH.md §Summary, "Primary recommendation"). The deliverable is one written
artifact — the pinned-decisions doc — whose content is D-01…D-17 plus the code-verified
diagnosis. Therefore **every "pattern" below is a documentation pattern**; the code excerpts
listed are the *evidence* the doc must embed/cite, not code to copy into new source files.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `.planning/phases/13-investigation-invariant-pinning/13-DECISIONS.md` | documentation (contract record) | none (static doc) | `13-CONTEXT.md` (decision-record format) + `13-RESEARCH.md` (evidence-citation format) | role-match |

Open Question 1 in RESEARCH.md leaves the file name to the planner (`13-DECISIONS.md` vs.
treating CONTEXT+RESEARCH as the deliverable). RESEARCH.md recommends a single canonical
citation target; if the planner picks "extend RESEARCH artifacts", the same format analogs
apply — the file is just `13-RESEARCH.md` instead.

## Pattern Assignments

### `.planning/phases/13-investigation-invariant-pinning/13-DECISIONS.md` (documentation, static)

**Primary analog (decision-record format):** `13-CONTEXT.md`

**Decision-entry pattern** (lines 25-31 — copy this shape for every decision restated in the
deliverable: bold ID, one-paragraph contract, explicit Reversibility note where one-way):

```markdown
- **D-01:** Pending second-factor state lives in a dedicated `login_challenges` table
  (`challenge_token_hash` PK, `user_id`, `expires_at`, `attempts`), created with the existing
  guarded-create pattern. The `sessions` table stays pure — signed-in-or-nothing.
  — **Reversibility:** one-way — the table shape and the "sessions table never carries
  pending rows" contract are consumed by Phase 14 migration design (AUTH-02) and the
  Phase 17 401-matrix test; changing it after those exist means re-doing the migration
  test and the security matrix.
```

Key conventions to preserve from this analog:
- Stable decision IDs (`D-01`…`D-17`) — later phases and the 401-matrix test cite these IDs
  verbatim (see how `.planning/milestones/v1.2-phases/05-i18n-foundation-catalogue-contract/05-01-PLAN.md:82-90`
  binds its plan to "D-01 … D-15" by ID alone).
- One-way decisions carry an explicit **Reversibility:** clause naming the downstream
  consumers that make reversal expensive (D-01, D-05, D-08 use this in CONTEXT.md).

**Secondary analog (evidence-citation format):** `13-RESEARCH.md`

**Verified-evidence pattern** (lines 429-437 — every code claim in the deliverable gets a
`[VERIFIED: file:line]` tag plus a verbatim excerpt block; the doc may reuse the ten-item
inventory at RESEARCH.md:424-533 verbatim rather than re-deriving):

```markdown
**1. `sessions` table — the revocation primitive's ground truth** [VERIFIED: server.js:95-100]:
```sql
create table if not exists sessions (
  token_hash text primary key,
  ...
);
```
```

**Tertiary analog (project decision register):** `.planning/STATE.md` lines 60-86

STATE.md carries a "Key Decisions for Planning" section plus a "Decisions" section with
carried-forward invariants from prior milestones (zero-deps, no-mock test rule, sameOrigin
ordering). If the planner adds the pinned contracts to STATE.md's register, follow that
terse one-decision-per-bullet style — the DECISIONS doc is the full record, STATE.md holds
the load-bearing one-liners.

**Evidence excerpts the deliverable must cite** (all re-verified today via grep; line numbers
current as of 2026-10-26 — these are the doc's citation targets, all git-tracked):

| Claim | Source | Lines |
|-------|--------|-------|
| `sessions` schema (revocation primitive ground truth) | `server.js` | 95-101 |
| `ensureColumn` guarded-create migration pattern | `server.js` | 134-137 |
| Stub root cause: `sessions: []`, `tfa: false` in `emptyDoc()` | `server.js` | 774-775 |
| `currentUser` (session-cookie → DB join, per-request) | `server.js` | 1122-1131 |
| `requireUser` — identity path D-02 must not change | `server.js` | 1134-1141 |
| `tooMany(key, max=10, windowMs=15min)` throttle primitive | `server.js` | 1163-1173 |
| Login throttle call site: `tooMany(\`${clientIp(req)}|${email}\`)` (D-12 precedent) | `server.js` | 1235 |
| **`attempts.delete()` in the login handler** — the success-clear the Phase 17 flow must NOT do between password and 2FA steps (Pitfall 18; D-03/D-11) | `server.js` | 1241 |
| Signup throttle precedent: `tooMany(\`signup|${clientIp(req)}\`, 5, 60*60*1000)` (per-endpoint key convention) | `server.js` | 1288 |
| Other per-endpoint throttle key precedent: `invite|${clientIp(req)}` | `server.js` | 1666 |
| Complete `/api/auth/*` surface (login/logout/me GET+PATCH/signup — nothing else exists) | `server.js` | 1225-1330 |
| Fake QR grid `(i * 7919) % 13 < 6` + hardcoded recovery codes | `src/pages/settings.js` | 408, 410-417 |
| Client-only mutations: `revokeSession` filter, `D().tfa = true` flip | `src/actions/actions.js` | 2371-2375, 2408-2411 |
| Seed mirror of fake auth fields (`se1`…, `tfa: false`) | `src/data/seed.js` | 509-514 |
| Byte-identical second-boot no-op test (AUTH-02 template) | `test/migration.test.mjs` | 188-196 |
| DEPLOY.md env block where `MASTER_KEY` documentation lands (D-07/D-08) | `DEPLOY.md` | 141-158 |

All paths verified git-tracked via `git ls-files` this session (tracked-source gate satisfied).

### Plan-convention analog for the planner (not a phase-13 file, but the pattern for planning it)

**Analog:** `.planning/milestones/v1.2-phases/05-i18n-foundation-catalogue-contract/05-01-PLAN.md`
(lines 23-55, 58-69)

Phase 05 was also a "pin the contract before code" phase. Copy its conventions for the
Phase 13 plan:
- `must_haves.truths` phrased as checkable statements about the *document* ("D-11 states the
  5–8 band and forbids budget reset between steps", "every one-way decision carries a
  Reversibility clause", "the doc cites server.js:1241 as the success-clear that Phase 17
  must not replicate mid-flow").
- `must_haves.prohibitions` restating the anti-patterns from RESEARCH.md §Anti-Patterns
  (no `if (challenge) deny` in `requireUser()`, no `Retry-After`, no dev-mode key fallback,
  no encrypting recovery codes, no `MASTER_KEY_OLD` machinery).
- The `<objective>` block states Purpose/Output explicitly and names the decisions bound
  ("The locked decisions that bind this plan are D-01…D-17") — same referencing style at
  05-01-PLAN.md:82-90.

## Shared Patterns

### Decision-ID referencing
**Source:** `13-CONTEXT.md` (D-01…D-17) → consumed exactly as in
`05-i18n-foundation-catalogue-contract/05-01-PLAN.md:82-90`
**Apply to:** the deliverable doc, the Phase 13 plan, and all Phase 14–18 plans/tests —
cite `D-NN`, never paraphrase the decision.

### `[VERIFIED: file:line]` evidence tagging
**Source:** `13-RESEARCH.md` (§Code Examples, ten-item inventory at lines 424-533)
**Apply to:** every code claim in the deliverable. Reuse the inventory verbatim — RESEARCH.md
explicitly authorizes citing it rather than re-deriving (CONTEXT.md `<specifics>`, RESEARCH.md
Open Question 1).

### D-13 lockout-copy override (respect the user's explicit choice)
**Source:** `13-CONTEXT.md:181-183` (`<specifics>`)
**Apply to:** any copy written into the deliverable about throttle behavior: generic
"too many attempts", no timing info, no `Retry-After`, no countdown. Do not "improve" it.
Note the existing 429 copy at `server.js:1235` says "Try again in 15 minutes." — this copy
is exactly what D-13 overrides for the new endpoints; the deliverable should pin the
replacement copy so Phase 16/17 don't copy the old string.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| *(none)* | — | — | The single deliverable has role-match analogs; no code files are created this phase, so no code analogs are required. The code analogs for **later** phases (`login_challenges` DDL → `server.js:95-101/134-137`; AES-GCM helper → `node:crypto`; `src/lib/qr.js` → new `src/lib/` directory, which does not exist yet) are already excerpted in RESEARCH.md §Architecture Patterns and §Code Examples — the planner should carry those forward into the Phase 14–18 plans, not into Phase 13. |

## Metadata

**Analog search scope:** `.planning/` (phases, milestones, STATE.md), `server.js`,
`src/`, `test/`, `DEPLOY.md` — grep-verified anchors, git-tracking verified for every named path
**Files scanned:** ~20 (4 phase-13 docs, 4 STATE/milestone decision records, 1 prior phase plan, all evidence targets)
**Pattern extraction date:** 2026-10-26
