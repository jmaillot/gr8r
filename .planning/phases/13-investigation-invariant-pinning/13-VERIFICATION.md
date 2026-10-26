---
phase: 13-investigation-invariant-pinning
verified: 2026-10-26T12:30:00Z
status: gaps_found
score: 6/7 must-haves verified
covered_files:
  - .planning/phases/13-investigation-invariant-pinning/13-01-PLAN.md
  - .planning/phases/13-investigation-invariant-pinning/13-01-SUMMARY.md
covered_digest: "v2:sha256:138ada91b83bb2700c70487ade19d74652aa5d79076fb0785872581df2a1ca88"
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "The decisions doc is internally unambiguous as the canonical D-NN citation target — a Phase 14 or Phase 16 planner citing D-04 gets exactly one landing phase for the replay-guard column"
    status: failed
    reason: "13-DECISIONS.md:154-155 (D-04 Consumed-by) says 'Phase 16 (migration adds the column with the other 2FA columns…)' while the Downstream consumer map at :301 says 'Phase 14 (AUTH-02 migration: login_challenges DDL, replay-guard column)'. The canonical document states two opposite landing phases for the same schema column, which is exactly the discovery surprise this phase exists to eliminate. Surrounding evidence favors Phase 14: ROADMAP Phase 14 goal ('sessions and 2FA fields live in per-user rows'), D-01's assignment of the additive migration (login_challenges DDL) to Phase 14, the removal section's Phase-14 boot-migration framing, and D-04's own CONTEXT contract 'in the same migration as the other 2FA columns'."
    artifacts:
      - path: .planning/phases/13-investigation-invariant-pinning/13-DECISIONS.md
        issue: "Line 154-155 contradicts the consumer map row at line 301 on D-04's landing phase"
    missing:
      - "Align both statements on one landing phase. Recommended: Phase 14 (AUTH-02 additive migration) owns the column + its byte-identical second-boot test coverage; Phase 16 owns the guard behavior (login + settings verify paths). Edit :154-155 and mirror the split in the :301 map row."
  - truth: "D-13's timing-disclosure override has one unambiguous scope — the fate of the existing timing-disclosing 429 string (server.js:1235 'Try again in 15 minutes.') is decided once"
    status: partial
    reason: "D-13's body (:232-234) restricts the override to 'Phase 16/17 must NOT copy that string to new endpoints' (existing string untouched by implication), but its Consumed-by line (:235) reads 'Phases 15–17 (every throttle response's failure copy)' — which includes replacing it. Under the narrow reading, the password step keeps disclosing the window while the 2FA step on the same budget (D-03/D-11: one logical login = one budget) does not — the exact disclosure D-13 prohibits survives on step 1 of the login flow Phase 17 must modify anyway."
    artifacts:
      - path: .planning/phases/13-investigation-invariant-pinning/13-DECISIONS.md
        issue: "Lines 229-235: two divergent readings of the D-13 copy-override scope"
    missing:
      - "One sentence in D-13 resolving the scope, e.g.: 'When Phase 17 touches the login flow, the existing server.js:1235 429 copy is also replaced with the pinned generic copy — the password and 2FA steps share one budget and must disclose identically (or not at all).'"
advisory: []
---

# Phase 13: Investigation & Invariant Pinning — Verification Report

**Phase Goal:** The root cause is confirmed against the live code and the technical decisions that constrain every later phase are made once, in writing — no discovery surprises mid-build.
**Verified:** 2026-10-26T12:30:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

The deliverable `13-DECISIONS.md` is substantive and overwhelmingly accurate: all 17 decision entries exist, all 16 [VERIFIED: file:line] citations were re-checked against the live source by this verifier and are exact-line accurate, the CONTEXT.md contracts are carried verbatim-in-substance, and the five prohibitions are recorded with owning decision IDs. However, an open code review (13-REVIEW.md, WR-01) found a real internal contradiction — independently confirmed here — between D-04's entry and the doc's own Downstream consumer map, and a second scope ambiguity (IN-02) inside D-13. Both defects live in the one artifact whose sole purpose is to be the unambiguous citation target for Phases 14–18; the ~fix is small, but the contradiction must not be carried into Phase 14 planning.

### Observable Truths

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | D-01…D-17 each appear as a decision entry whose contract text matches CONTEXT.md verbatim in substance | ✓ VERIFIED | 17 unique `**D-NN:` entries, 0 duplicates, 0 gaps (grep). Spot-checks D-01/D-03/D-05/D-08/D-09/D-13 match 13-CONTEXT.md:25-84 verbatim in substance, with citations added (enrichment, no weakening) |
| 2 | The written diagnosis reproduces the ten-item [VERIFIED: file:line] evidence inventory — no stub claim rests without a file:line citation | ✓ VERIFIED | 16 `[VERIFIED: ` matches (≥10); carried verbatim from 13-RESEARCH.md §Verified evidence inventory (:424-533). All citations re-checked against live source this session: server.js:95-101, 774-775, 1125-1141, 1163-1173, 1225/1235/1241/1255/1262/1270/1283/1288; seed.js:509-514; actions.js:2371-2375/2408-2411; settings.js:408/410-417; DEPLOY.md:141-158; test/migration.test.mjs:188-196; `src/lib/` absent — all exact |
| 3 | Every one-way decision (D-01, D-05, D-08) carries an explicit Reversibility clause naming downstream consumers | ✓ VERIFIED | Exactly 3 **Reversibility** clauses (lines 131, 162, 191); D-01 → Phase 14 (AUTH-02) + Phase 17 401-matrix; D-05/D-08 → DEPLOY.md ops contract + Phase 16 |
| 4 | The throttle area pins per-endpoint budgets (D-11), IP+email composite keys (D-12), generic lockout copy with no timing disclosure (D-13), in-memory state (D-14), and no-budget-reset between login steps | ✓ VERIFIED | Area 3: per-endpoint table (10/15min password; 5–8/15min × 3 code endpoints, distinct prefixes), composite `${ip}\|${email}` key, generic "too many attempts" copy (3 hits), in-memory map, explicit no-reset rule citing server.js:1241 success-clear (Pitfall 18). ⚠ D-13's override-scope ambiguity tracked as Gap 2 — the pin exists, its scope reads two ways |
| 5 | The crypto area pins AES-256-GCM with v1: prefix (D-05/D-07), fail-closed 503 (D-06/D-10), hash-only recovery codes (D-09), rotation-forces-re-enrollment (D-08) | ✓ VERIFIED | Area 2: all four contracts present with DEPLOY.md:141-158 named as the key-documentation landing spot; matches CONTEXT.md D-05…D-10 |
| 6 | Doc-field removal scoped to Phase 14 with byte-identical second-boot guarantee and no-backfill-at-boot rule | ✓ VERIFIED | Removal section: targets server.js:774-755 + seed.js:509-514, lands WITH AUTH-02 in Phase 14, guarantee proven by extended test/migration.test.mjs (:188 template cited), explicit no-backfill rule (tfa_enabled = 0 by absence, Pitfall 21) |
| 7 | The doc is internally unambiguous as the canonical D-NN citation target — any Phase 14–18 planner citing a D-NN gets one answer, not two | ✗ FAILED | WR-01 confirmed: D-04 entry (:154-155) says Phase 16 does the migration; consumer map (:301) says Phase 14 owns the replay-guard column. Plus IN-02's D-13 scope divergence (:229-235). Both tracked as gaps below |

**Score:** 6/7 truths verified (0 present, behavior-unverified)

### Deferred Items

None. The two gaps cannot be deferred to later phases: Phases 14–18 *consume* this document — the contradictions must be fixed in the Phase 13 artifact before Phase 14 planning reads it.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `.planning/phases/13-investigation-invariant-pinning/13-DECISIONS.md` | Canonical D-NN citation doc: diagnosis + Areas 1–4 + removal scope + Prohibitions + consumer map | ⚠ SUBSTANTIVE with defect | 306 lines; all sections present with content; zero TODO/TBD/FIXME markers; committed (4af8b06, 65d92a6). Defect: internal self-contradiction on D-04 landing phase + D-13 scope ambiguity (Gaps 1–2) |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| D-01/D-02 | Phase 14 migration design + Phase 17 401-matrix | consumer map + Consumed-by lines, cited by decision ID | ✓ WIRED | 13-DECISIONS.md:136-144, :301 |
| D-07/D-08 | DEPLOY.md:141-158 env block as MASTER_KEY doc landing spot | named in D-07 entry | ✓ WIRED | :179-186; live DEPLOY.md:141-158 re-verified (16-key dotenv block, exact) |
| D-15 | src/lib/vendor/qrcode.js pin (qrcode-generator@2.0.4) consumed by Phase 16 re-verification task | named in D-15 + consumer map | ✓ WIRED | :243-254, :304; version+license sanity-checked against npm by 13-REVIEW.md (exists, latest, MIT) |

### Data-Flow Trace (Level 4)

N/A — documentation-only phase; the artifact renders no dynamic data.

### Behavioral Spot-Checks

SKIPPED — docs-only phase, no runnable entry points created or modified. The plan's "npm test stays green" gate is superseded by the broken-windows ledger: a pre-existing `test/i18n-prefs.test.mjs:246` failure (ROADMAP Phase-6 count assertion) predates this phase, was independently reproduced by 13-REVIEW.md, and is recorded in WINDOWS.md / commit 8c476d5. Docs-only commits cannot affect it.

### Probe Execution

SKIPPED — no probes declared or implied for a documentation phase.

### Requirements Coverage

N/A — foundation phase, no requirement IDs. Cross-checked against ROADMAP Phase 13 Success Criteria 1–5 instead:

| SC | Statement | Status | Evidence |
| -- | --------- | ------ | -------- |
| 1 | Written diagnosis states where each stub lives — no claim on assumption | ✓ | Verified diagnosis section, 10 items, all citations exact vs live code |
| 2 | Pending-2FA mechanism decided + invariant that no endpoint treats a pending sign-in as identity | ✓ | Area 1, D-01 (dedicated login_challenges table, sessions stays pure) + D-02 (structural enforcement, 401-matrix proving test) |
| 3 | QR strategy pinned: specific vendored MIT encoder file, license header, ESM compat — never hand-written | ✓ | D-15 (qrcode-generator@2.0.4 dist/qrcode.mjs, MIT header pin, Vite-clean, zero runtime deps) + D-16/D-17 |
| 4 | Encryption-at-rest answered once (DEPLOY.md consequences noted) + throttle constants fixed per endpoint + no budget reset between steps | ✓ | Areas 2–3; D-05–D-10 with DEPLOY.md landing spot; D-11 per-endpoint table + explicit no-reset rule |
| 5 | Doc-field removal for sessions/tfa scoped to Phase 14 with byte-identical second-boot guarantee | ✓ | Removal section |

### Prohibitions Recorded (must_haves.prohibitions)

| # | Prohibition | Owner ID | Status |
| - | ----------- | -------- | ------ |
| 1 | No deny-list pending check inside the identity path | D-02 | ✓ Recorded (:285-287) |
| 2 | No timing disclosure in lockout copy | D-13 | ✓ Recorded (:288-289); scope ambiguity tracked as Gap 2 |
| 3 | No dev-mode ephemeral key, no second code path for key-absent case | D-06/D-10 | ✓ Recorded (:290-291) |
| 4 | No encrypted recovery codes (hash-only) | D-09 | ✓ Recorded (:292-293) |
| 5 | No key-rotation re-encrypt machinery | D-08 | ✓ Recorded (:294-295) |

Note: these are doc-content records for later phases to enforce — their runtime enforcement is verified in Phases 14–18, not here.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| 13-DECISIONS.md | 154-155 / 301 | Internal contradiction on D-04 landing phase (WR-01) | 🛑 Blocker (defeats citation-target purpose) | Phase 14/16 planners read different answers; see Gap 1 |
| 13-DECISIONS.md | 229-235 | D-13 override-scope stated two ways (IN-02) | ⚠ Warning | Timing disclosure may survive on password step; see Gap 2 |
| 13-01-SUMMARY.md | 65, 177 | Stale [VERIFIED] count (11 recorded vs 16 actual) (IN-01) | ℹ️ Info | Under-claiming; no gate falsely passed; advisorial |

Unfinished-work markers: zero (grep TODO/TBD/FIXME → no match, as gated by the plan).

### Human Verification Required

None. Documentation-only phase — every check is programmatic. The closed review dispositions (13-REVIEW-DISPOSITION.md: 3 open, 0 skipped) are addressed by the gaps + advisory above.

### Gaps Summary

The phase's substance is verified: every code claim in the diagnosis checks out against the live repo, all 17 decisions match CONTEXT.md, and all five ROADMAP success criteria are satisfied. What blocks a PASS verdict is a single theme: **internal unambiguity of the canonical citation document**. WR-01 leaves the replay-guard column's landing phase stated two opposite ways (Phase 16 in D-04's Consumed-by vs Phase 14 in the consumer map) — the exact re-derivation cost the phase exists to eliminate — and IN-02 leaves D-13's copy-override scope reading two ways, with the narrow reading preserving a timing disclosure on the login password step that Phase 17 must touch anyway. Both fixes are one-to-two-sentence edits to 13-DECISIONS.md (plus the SUMMARY count refresh as an advised ride-along). Gaps are structured in the frontmatter for `/gsd-plan-phase --gaps`.

---

_Verified: 2026-10-26T12:30:00Z_
_Verifier: the agent (gsd-verifier)_
