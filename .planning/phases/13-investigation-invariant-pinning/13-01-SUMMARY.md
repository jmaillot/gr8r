---
phase: 13-investigation-invariant-pinning
plan: "01"
subsystem: auth
tags: [doc-contracts, 2fa, totp, encryption-at-rest, throttle, lockout, qr-vendoring, migration]

# Dependency graph
requires: []   # foundation phase — consumes only its own phase artifacts (13-CONTEXT.md D-01…D-17, 13-RESEARCH.md evidence inventory, 13-PATTERNS.md)
provides:
  - "Canonical D-NN citation target (13-DECISIONS.md) for Phases 14–18: all seventeen decisions cited by ID, no re-derivation"
  - "Code-verified stub-root-cause diagnosis (ROADMAP Phase 13 success criterion 1) with ten [VERIFIED: file:line] evidence items"
  - "Pending-2FA contract (D-01…D-04) incl. the structural 'pending = anonymous' invariant and its Phase 17 401-matrix proving test"
  - "TOTP encryption-at-rest contract (D-05…D-10) incl. AES-256-GCM v1: envelope, fail-closed 503, hash-only recovery codes, rotation-requires-re-enrollment"
  - "Throttle/lockout constants (D-11…D-14) per-endpoint budgets, IP+email keys, generic lockout copy, in-memory state"
  - "QR provisioning pin (D-15…D-17) and the Phase 14 doc-field removal scope with byte-identical second-boot guarantee"
affects: [14-schema-session-ground-truth, 15-password-change, 16-totp-core-enrollment, 17-login-second-factor, 18-closing-verification, deploy]

actuals:
  tokens: 4583
  tasks: 3
  commits: 2
plan_head_before: bb8ca75db265bb0534ab99e6cd3ad11ca1d4127b
plan_head_after: 65d92a679d37cf363ee54cb25a9d393e70e08b03

# Tech tracking
tech-stack:
  added: []   # docs-only phase — no runtime dependency, no package.json change, no migration
  patterns:
    - "decision-record-by-ID citation (D-01…D-17), one-way decisions carry an explicit Reversibility clause naming downstream consumers"
    - "[VERIFIED: file:line] evidence tagging with verbatim excerpts for every code claim"
    - "prohibitions section restating anti-patterns, each tagged with its owning decision ID"

key-files:
  created:
    - .planning/phases/13-investigation-invariant-pinning/13-DECISIONS.md
  modified: []

key-decisions:
  - "Pending-2FA state lives in a dedicated login_challenges table; the sessions table stays signed-in-or-nothing (D-01, one-way)"
  - "'pending = anonymous' is enforced structurally (separate challenge cookie, requireUser untouched) — no deny-list in the identity path (D-02)"
  - "TOTP secret encrypted at rest with AES-256-GCM under a 32-byte hex MASTER_KEY, v1:-prefixed envelope, fail-closed 503 on missing key (D-05…D-07, D-10)"
  - "MASTER_KEY rotation forces 2FA re-enrollment via recovery codes; no re-encrypt machinery (D-08, one-way)"
  - "Recovery codes are sha256 hash-only and never encrypted, so the recovery path survives key loss (D-09)"
  - "Generic 'too many attempts' lockout copy with no timing disclosure — a conscious override of server.js:1235's existing 429 string (D-13)"
  - "Vendored qrcode-generator@2.0.4 into src/lib/vendor/qrcode.js, wrapped by src/lib/qr.js; QR is never hand-written (D-15…D-17)"
  - "Fake sessions/tfa doc fields are removed in Phase 14 alongside AUTH-02, with the byte-identical second-boot guarantee and no backfill at boot"

patterns-established:
  - "Phase citation contract: later plans reference D-NN by ID instead of restating decisions"
  - "Doc-only phases ship a diagnosis section that reuses the research evidence inventory verbatim rather than re-deriving it"

requirements-completed: []   # foundation phase — ROADMAP assigns no requirement IDs to Phase 13

coverage:
  - id: D1
    description: "13-DECISIONS.md carries all seventeen decision entries D-01…D-17, the ten-item [VERIFIED] evidence inventory, three Reversibility clauses on the one-way decisions, and zero unfinished-work markers"
    verification:
      - kind: other
        ref: "grep -oE '\\*\\*D-[0-9]{2}:' .planning/phases/13-investigation-invariant-pinning/13-DECISIONS.md | sort -u | wc -l => 17"
        status: pass
      - kind: other
        ref: "grep -c 'Reversibility' 13-DECISIONS.md => 3"
        status: pass
      - kind: other
        ref: "grep -c '\\[VERIFIED: ' 13-DECISIONS.md => 11 (>= 10)"
        status: pass
      - kind: other
        ref: "grep -cE 'TODO|TBD|\\bFIXME\\b' 13-DECISIONS.md => 0 (grep exit 1)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every decision entry matches its same-numbered contract in 13-CONTEXT.md in substance (no weakening, no paraphrase drift), and the five binding prohibitions each carry their decision ID"
    verification:
      - kind: manual_procedural
        ref: "audit pass against 13-CONTEXT.md lines 25-102, spot-checking D-03, D-09, D-13 (the most paraphrase-prone); zero gaps found, no in-place fixes required"
        status: pass
    human_judgment: true
    rationale: "Grep gates prove structure (ID coverage, clause count, marker absence) but cannot prove that contract text faithfully preserves CONTEXT.md's substance — that fidelity is a judgment call, not a mechanical check"

# Metrics
duration: 5min
completed: 2026-10-26
status: complete
---

# Phase 13 Plan 01: Pinned Decisions Document Summary

**13-DECISIONS.md: the canonical D-01…D-17 citation target for Phases 14–18, carrying the code-verified stub diagnosis and all four pinned decision areas plus the Phase 14 removal scope**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-10-26T10:48:08Z
- **Completed:** 2026-10-26T10:53:00Z
- **Tasks:** 3
- **Files modified:** 1 (new file, 306 lines)

## Accomplishments

- Wrote the Phase 13 deliverable `13-DECISIONS.md` — the one document Phases 14–18 cite by
  decision ID — with the verified diagnosis and all four decision areas (pending-2FA
  D-01…D-04, crypto-at-rest D-05…D-10, throttle/lockout D-11…D-14, QR D-15…D-17), the
  Phase 14 doc-field removal scope, five binding prohibitions, and a downstream consumer map.
- ROADMAP Phase 13 success criteria 1–5 all satisfied by the delivered doc: diagnosis
  (criterion 1) via the ten-item `[VERIFIED: file:line]` evidence inventory reused verbatim
  from `13-RESEARCH.md:424-533`; pending-2FA mechanism + structural invariant (criterion 2)
  via Area 1; QR vendoring pin (criterion 3) via Area 4; encryption-at-rest answer + throttle
  constants (criterion 4) via Areas 2–3; doc-field removal scoped to Phase 14 with the
  byte-identical second-boot guarantee (criterion 5).
- All one-way decisions (D-01, D-05, D-08) carry an explicit Reversibility clause naming the
  downstream consumers that make reversal expensive (Phase 14 AUTH-02 migration, the Phase 17
  401-matrix e2e, DEPLOY.md's operations contract).
- Coverage audit passed with zero gaps: 17 unique decision IDs, no duplicates, 3
  Reversibility clauses, zero unfinished-work markers, all eight sections populated.

## Task Commits

Each task was committed atomically:

1. **Task 1: Doc slice end-to-end — diagnosis + Area 1 (D-01…D-04)** — `4af8b06` (docs)
2. **Task 2: Areas 2–4 + removal scope + prohibitions + consumer map** — `65d92a6` (docs)
3. **Task 3: Coverage audit (D-01…D-17 completeness and handoff readiness)** — no commit:
   the audit found zero gaps (no duplicates, no missing IDs, all Reversibility clauses
   present, no unfinished-work markers, all contract text faithful to CONTEXT.md), so there
   was nothing to edit or commit. The audit is the phase's real acceptance gate; it passed.

**Plan metadata:** see the final docs commit (SUMMARY.md + STATE.md + ROADMAP.md).

## Files Created/Modified

- `.planning/phases/13-investigation-invariant-pinning/13-DECISIONS.md` — canonical pinned
  decisions doc: header/scope; Verified diagnosis (10-item `[VERIFIED: file:line]` evidence
  inventory); Area 1 Pending-2FA login mechanism (D-01…D-04); Area 2 TOTP secret
  encryption-at-rest (D-05…D-10); Area 3 Throttle & lockout constants (D-11…D-14); Area 4 QR
  provisioning (D-15…D-17); Doc-field removal scope (lands Phase 14); Prohibitions (5 rules);
  Downstream consumer map.

No source file, `package.json`, or migration was touched — this phase ships documentation only.

## Decisions Made

- Followed the plan's contract-pinning scope exactly: the doc pins contracts, not the exact
  throttle integers (those stay agent Discretion within D-11's 5–8 band) or the exact 503
  copy (D-06).
- Reused the `13-RESEARCH.md:424-533` evidence inventory verbatim rather than re-deriving it —
  CONTEXT.md `<specifics>` and RESEARCH.md Open Question 1 explicitly authorize this.
- Added a "Consumed by:" line to every decision entry (per the plan's acceptance criteria)
  plus a consolidated Downstream consumer map, so Phase 14–18 planners can locate their work
  without reading the whole doc.

## Deviations from Plan

None — plan executed exactly as written. Task 3's audit found zero gaps to fix, so it produced
no commit; that is the audit passing, not a skipped step.

## Issues Encountered

- **Pre-existing `npm test` failure (out of scope, not caused by this plan):**
  `test/i18n-prefs.test.mjs:246` — "the declared English delta is recorded where the phase
  verification reads it" — asserts that `.planning/ROADMAP.md` carries a v1.2 "## Phase 6"
  section describing an `'auto'` time-format option. That section was replaced by the v1.3
  roadmap (`git log -1 -- .planning/ROADMAP.md` → `61380e9`, before this plan), and
  `git show <base>:.planning/ROADMAP.md | grep -c '## Phase 6'` → 0 at the base commit, so the
  failure predates Phase 13. This plan's diff is one new documentation file; it touches no test
  and no source (`git diff --stat <base>..HEAD` → 1 file, 306 insertions). The stale v1.2
  assertion should be removed or updated by the ROADMAP-owning step; it is not a Phase 13 item.
- **Out-of-scope working-tree noise (untouched):** `.planning/config.json` was already modified
  and `.planning/.gsd-allow-shrink`, `.planning/.gsd-ws-arg`,
  `.planning/phases/13-investigation-invariant-pinning/13-PATTERNS.md` were already untracked
  before this plan started. None are staged or committed here.

## Verification Run

| Check | Command | Result |
|-------|---------|--------|
| Area 1 entry count | `grep -cE '^[[:space:]]*-[[:space:]]*\*\*D-0[1-4]:' 13-DECISIONS.md` | 4 (expected 4) |
| Evidence citations | `grep -c '\[VERIFIED: ' 13-DECISIONS.md` | 11 (expected ≥ 10) |
| Areas 2–3 entry count | `grep -cE '^[[:space:]]*-[[:space:]]*\*\*D-(0[5-9]|1[0-4]):' 13-DECISIONS.md` | 10 (expected 10) |
| Pinned lockout copy | `grep -c 'too many attempts' 13-DECISIONS.md` | 3 (expected ≥ 1) |
| Pitfall 18 call site | `grep -c 'server.js:1241' 13-DECISIONS.md` | 2 (expected ≥ 1) |
| Decision-ID coverage | `grep -oE '\*\*D-[0-9]{2}:' … \| sort -u \| wc -l` | 17 unique, no duplicates |
| Reversibility clauses | `grep -c 'Reversibility' 13-DECISIONS.md` | 3 (D-01, D-05, D-08) |
| Unfinished-work markers | `grep -cE 'TODO\|TBD\|\\bFIXME\\b'` | 0 (grep exit 1) |
| Lint | `npm run lint` | pass |
| Format | `npm run format:check` | pass — "All matched files use Prettier code style!" |
| Regression | `npm test` | 1 pre-existing v1.2 failure (documented above); no test/source touched |

## Known Stubs

None — the doc has no placeholder content, and every decision entry is a complete contract
matching CONTEXT.md.

## User Setup Required

None — no external service configuration required. (`MASTER_KEY` documentation lands in
Phase 16's DEPLOY.md edit, pinned by D-07/D-08 and pointed at `DEPLOY.md:141-158`.)

## Next Phase Readiness

- Phase 14 (Schema & Session Ground Truth) can now implement AUTH-02 against D-01/D-04 and the
  doc-field removal scope without re-deriving the `login_challenges` shape or the
  byte-identical second-boot guarantee.
- Phase 16 implements D-05…D-10 and D-15…D-17; its first task should re-verify the vendored
  `src/lib/vendor/qrcode.js` header against the pinned source URL (named in D-15's
  Consumed-by line).
- Phase 17 implements D-02/D-03 and the mandatory 401-matrix e2e; it must not run the
  `server.js:1241` success-clear between the password and 2FA steps, and must not copy the
  existing `server.js:1235` 429 string (D-13 override).
- No blockers. Sole pre-existing item: the stale v1.2 `i18n-prefs` ROADMAP assertion failing in
  `npm test`.

## Self-Check

## Self-Check: PASSED

- `13-DECISIONS.md` exists (306 lines, 18 334 chars) at the expected path.
- Commits `4af8b06` and `65d92a6` both exist in history; diff vs. plan base is exactly one
  new file (306 insertions) — no source, test, or config files touched.
- All 8 verify commands from the plan pass; lint and format:check pass.

---
*Phase: 13-investigation-invariant-pinning*
*Completed: 2026-10-26*
