---
phase: 13-investigation-invariant-pinning
verified: 2026-10-26T13:29:32Z
status: passed
score: 7/7 must-haves verified
covered_files:
  - .planning/phases/13-investigation-invariant-pinning/13-01-PLAN.md
  - .planning/phases/13-investigation-invariant-pinning/13-01-SUMMARY.md
  - .planning/phases/13-investigation-invariant-pinning/13-02-PLAN.md
  - .planning/phases/13-investigation-invariant-pinning/13-02-SUMMARY.md
  - .planning/phases/13-investigation-invariant-pinning/13-DECISIONS.md
covered_digest: "v2:sha256:8af9076134381501d4e60cb169c563ad0dc4cd156a45dd2a47434233e6bc4f34"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 6/7
  gaps_closed:
    - "D-04 landing phase — one answer: Phase 14 owns the replay-guard column (AUTH-02 additive migration + byte-identical second-boot test coverage), Phase 16 owns the guard behavior; stated identically in D-04's Consumed-by AND the Downstream consumer map row; the old 'Phase 16 (migration…)' wording is gone"
    - "D-13 override scope — one reading: the existing server.js:1235 429 copy is itself replaced with the pinned generic copy when Phase 17 touches the login flow (Scope resolution sentence + extended Consumed-by); the original no-copy-to-new-endpoints clause is preserved"
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "The five recorded prohibitions (D-02, D-13, D-06/D-10, D-09, D-08) are verified here as doc-content records only — their runtime enforcement lands in Phases 14–18 and is not verifiable at this phase. Non-authoritative LLM-judge verdict: all five recorded verbatim with owning decision IDs. unverified-prohibition — human review recommended at the phases that implement them (esp. the Phase 17 401-matrix for D-02 and the throttle copy work for D-13)."
    category: other
    reason: "Judgment-tier prohibitions cannot be runtime-verified in a documentation-only phase; flagged so they are never silently absorbed."
    evidence_status: "doc-content presence verified (5/5 with owning IDs); runtime enforcement deferred by design"
---

# Phase 13: Investigation & Invariant Pinning — Verification Report

**Phase Goal:** The root cause is confirmed against the live code and the technical decisions that constrain every later phase are made once, in writing — no discovery surprises mid-build.
**Verified:** 2026-10-26T13:29:32Z
**Status:** passed
**Re-verification:** Yes — after gap closure (plan 13-02, commits 85cc20a, 6a4b6cb, f282a71, a8a2001)

## Goal Achievement

The prior verification (2026-10-26T13:20:35Z, gaps_found, 6/7) blocked on one theme: **internal unambiguity of the canonical citation document** — WR-01 left D-04's replay-guard column landing phase stated two opposite ways, and IN-02 left D-13's copy-override scope reading two ways. Plan 13-02 reconciled both. This re-verification confirms the fixes against the **actual on-disk 13-DECISIONS.md**, not against 13-02-SUMMARY claims: both gap truths now hold, all 5 previously-passed truths survived the edit without regression (17 unique D-NN entries, 16 `[VERIFIED:` citation lines via grep -c, 3 Reversibility clauses, 5 prohibitions, zero unfinished-work markers), and the closure edits touched nothing else (`git show 85cc20a`/`6a4b6cb`/`f282a71` diffs are exactly the three prescribed locations).

### Observable Truths

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | D-01…D-17 each appear as a decision entry whose contract text matches CONTEXT.md verbatim in substance | ✓ VERIFIED | Regression: 17 unique `**D-NN:` entries (D-01…D-17, no gaps, no duplicates), 0 missing. Edited entries D-04/D-13 re-checked against 13-CONTEXT.md: contract lines verbatim (D-04 "same migration as the other 2FA columns" appears at 13-DECISIONS.md:152-153; closure edits enriched Consumed-by/scope only — no weakening) |
| 2 | The written diagnosis reproduces the ten-item [VERIFIED: file:line] evidence inventory — no stub claim rests without a file:line citation | ✓ VERIFIED | 16 `[VERIFIED:` citation lines (grep -c; 17 occurrences via grep -o — one line carries two tags), matching the corrected SUMMARY record. Citation spot-checks against live source this session, all exact: server.js:774-775 (`sessions: [], tfa: false`), server.js:1163-1173 (`tooMany`), server.js:1235 (429 "Too many attempts. Try again in 15 minutes."), server.js:1241 (`attempts.delete` success-clear), server.js:1134-1141 (`requireUser`), seed.js:509-514, settings.js:408 (hardcoded recovery codes), settings.js:410-417 (fake QR grid `(i * 7919) % 13 < 6`), test/migration.test.mjs:188 (second-boot no-op test), `src/lib/` absent |
| 3 | Every one-way decision (D-01, D-05, D-08) carries an explicit Reversibility clause naming downstream consumers | ✓ VERIFIED | Exactly 3 Reversibility clauses (13-DECISIONS.md:131, :165, :194); D-01 → Phase 14 (AUTH-02) + Phase 17 401-matrix; D-05/D-08 → DEPLOY.md ops contract + Phase 16 |
| 4 | The throttle area pins per-endpoint budgets (D-11), IP+email composite keys (D-12), generic lockout copy with no timing disclosure (D-13), in-memory state (D-14), and no-budget-reset between login steps | ✓ VERIFIED | Per-endpoint table (10/15min password; 5–8/15min × 3 code endpoints, distinct prefixes), composite `${ip}|${email}` keys, in-memory map, explicit no-reset rule citing server.js:1241. D-13 now single-scoped: "Scope resolution:" sentence (:238-242) states the existing server.js:1235 copy is itself replaced when Phase 17 touches the login flow, justified by D-03/D-11's one-budget rule; Consumed-by (:243-245) extended with "failure copy — including the replacement of the pre-existing `server.js:1235` 429 copy…landing when Phase 17 reworks the login flow"; original "must NOT copy that string to new endpoints" clause preserved (1 match). Live server.js:1235 re-confirmed to carry the disclosed string |
| 5 | The crypto area pins AES-256-GCM with v1: prefix (D-05/D-07), fail-closed 503 (D-06/D-10), hash-only recovery codes (D-09), rotation-forces-re-enrollment (D-08) | ✓ VERIFIED | Area 2 entries all present, untouched by the closure edits; DEPLOY.md:141-158 named as key-documentation landing spot (live block re-verified) |
| 6 | Doc-field removal scoped to Phase 14 with byte-identical second-boot guarantee and no-backfill-at-boot rule | ✓ VERIFIED | Removal section: targets server.js:774-755 + seed.js:509-514 (both live-verified), lands WITH AUTH-02 in Phase 14, guarantee via extended test/migration.test.mjs (:188 template live-verified), explicit no-backfill rule |
| 7 | The doc is internally unambiguous as the canonical D-NN citation target — any Phase 14–18 planner citing a D-NN gets one answer, not two | ✓ VERIFIED | **Gap 1 closed:** D-04's Consumed-by (:154-158) now reads "Phase 14 adds the replay-guard column in the AUTH-02 additive migration… together with its byte-identical second-boot test coverage; Phase 16 implements the guard behavior itself — reading and updating the column in the login verify path and the settings-page verify path." Consumer map row (:311) mirrors the same split. Old "Phase 16 (migration" wording: 0 matches in the D-04 region; the only Phase-16-adjacent mention of migration left in the doc is the map row where Phase 16 is correctly the behavior owner. **Gap 2 closed:** see truth 4. Both fixes independently consistent with ROADMAP Phase 14 goal/SC4 and Phase 16 goal |

**Score:** 7/7 truths verified (0 present, behavior-unverified)

### Re-verification of Previously-Failed Items

| Prior gap | On-disk evidence (this session) | Status |
| --------- | ------------------------------- | ------ |
| Gap 1 (WR-01): D-04 landing phase contradiction | `sed '/^- \*\*D-04:/,/^- \*\*D-05:/p'` region: "Phase 16 (migration" → 0; "Phase 14" → 1, "AUTH-02" → 1, "byte-identical second-boot" → 1, "Phase 16 implements the guard behavior" → 1, "settings-page" → 2 (contract + Consumed-by); consumer-map row contains "replay-guard column with byte-identical second-boot test coverage), Phase 16" (1 match) with Phase 17 entry unchanged (1 match) | CLOSED |
| Gap 2 (IN-02): D-13 override scope | D-13 region: "Scope resolution:" → 1; "server.js:1235" → 3; `("Try again in 15 minutes.")` → 2; "is also replaced with the pinned generic copy" → 1; "must disclose identically" → 1; "failure copy — including" → 1; "must NOT copy that string to new endpoints" → 1 (preserved); "landing when Phase 17 reworks the login flow" → 1 | CLOSED |
| Advisory IN-01: stale citation count 11 → 16 | 13-01-SUMMARY.md: "11 (>= 10)" → 0, "11 (expected" → 0; "=> 16 (>= 10)" → 1; "16 (expected ≥ 10)" → 1; erratum naming 13-02 → 2 (one in coverage ref, one in the erratum note body). Live grep -c re-measured: 16 (grep -o: 17). `git show f282a71` diff = 7 insertions, 2 deletions — exactly the two count lines + erratum block | CLOSED |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `.planning/phases/13-investigation-invariant-pinning/13-DECISIONS.md` | Canonical D-NN citation doc: diagnosis + Areas 1–4 + removal scope + Prohibitions + consumer map | ✓ VERIFIED | 316 lines; all sections present and populated; zero TODO/TBD/FIXME markers; internally consistent post-reconciliation; committed (4af8b06, 65d92a6 + gap closure 85cc20a, 6a4b6cb) |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| D-01/D-04 | Phase 14 migration design + Phase 16 guard behavior + Phase 17 401-matrix | consumer map + Consumed-by lines, cited by decision ID | ✓ WIRED | 13-DECISIONS.md:135-136, :154-158, :311 — D-04's split now stated identically in entry and map |
| D-07/D-08 | DEPLOY.md:141-158 env block as MASTER_KEY doc landing spot | named in D-07 entry | ✓ WIRED | :182-189; live DEPLOY.md:141-158 re-verified this session |
| D-15 | src/lib/vendor/qrcode.js pin (qrcode-generator@2.0.4) consumed by Phase 16 re-verification task | named in D-15 + consumer map | ✓ WIRED | :262-264, :314; src/lib/ confirmed absent (created in Phase 16) |

### Data-Flow Trace (Level 4)

N/A — documentation-only phase; the artifact renders no dynamic data.

### Behavioral Spot-Checks

SKIPPED — docs-only phase, no runnable entry points created or modified. The plan's "npm test stays green" gate is superseded by the broken-windows ledger: the pre-existing `test/i18n-prefs.test.mjs` failure is a stale v1.2-era assertion (ROADMAP's "## Phase 6" section was archived at the v1.2→v1.3 milestone boundary, before Phase 13 existed — `grep -c '## Phase 6' .planning/ROADMAP.md` → 0 this session) — known pre-existing issue, explicitly not countable against this phase. Docs-only commits (85cc20a…a8a2001 touch only .planning/ files) cannot affect it.

### Probe Execution

SKIPPED — no probes declared or implied for a documentation phase.

### Requirements Coverage

N/A — foundation phase; both plans declare `requirements: []` (13-01-PLAN.md:10, 13-02-PLAN.md:12-13), and REQUIREMENTS.md maps no requirement IDs to Phase 13. Cross-check of the consumer IDs named in the phase goal (SESS-01–03, PASS-01–03, TFA-01–05, AUTH-02): all are mapped in REQUIREMENTS.md to Phases 14–16 as Pending — none orphaned, none claimed by Phase 13. Verified against ROADMAP Phase 13 Success Criteria 1–5 instead:

| SC | Statement | Status | Evidence |
| -- | --------- | ------ | -------- |
| 1 | Written diagnosis states where each stub lives — no claim on assumption | ✓ | Verified diagnosis section, 10 items; all spot-checked citations exact vs live code this session |
| 2 | Pending-2FA mechanism decided + invariant that no endpoint treats a pending sign-in as identity | ✓ | Area 1: D-01 (dedicated login_challenges table, sessions stays pure) + D-02 (structural enforcement, Phase 17 401-matrix proving test) |
| 3 | QR strategy pinned: specific vendored MIT encoder file, license header, ESM compat — never hand-written | ✓ | D-15 (qrcode-generator@2.0.4 dist/qrcode.mjs, MIT header pin, Vite-clean, zero runtime deps) + D-16/D-17 |
| 4 | Encryption-at-rest answered once (DEPLOY.md consequences noted) + throttle constants fixed per endpoint + no budget reset between steps | ✓ | Areas 2–3: D-05–D-10 with DEPLOY.md landing spot; D-11 per-endpoint table + explicit no-reset rule; D-13 now single-scoped |
| 5 | Doc-field removal for sessions/tfa scoped to Phase 14 with byte-identical second-boot guarantee | ✓ | Removal section |

### Prohibitions Recorded (must_haves.prohibitions)

| # | Prohibition | Owner ID | Status |
| - | ----------- | -------- | ------ |
| 1 | No deny-list pending check inside the identity path | D-02 | ✓ Recorded (13-DECISIONS.md:295-297) |
| 2 | No timing disclosure in lockout copy | D-13 | ✓ Recorded (:298-299); scope now unambiguous post-closure |
| 3 | No dev-mode ephemeral key, no second code path for key-absent case | D-06/D-10 | ✓ Recorded (:300-301) |
| 4 | No encrypted recovery codes (hash-only) | D-09 | ✓ Recorded (:302-303) |
| 5 | No key-rotation re-encrypt machinery | D-08 | ✓ Recorded (:304-305) |

**Flag (non-authoritative, judgment-tier):** these are doc-content records for later phases to enforce; their runtime enforcement is verifiable only in Phases 14–18 and is NOT verified here — unverified-prohibition, human review recommended at the implementing phases (see `advisory` frontmatter).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| 13-DECISIONS.md | — | (none) | — | Prior WR-01/IN-02 defects resolved; zero debt markers (all grep TODO/TBD/FIXME hits in the phase dir are self-referential gate text in PLAN/SUMMARY/REVIEW/VALIDATION, not unfinished work) |

### Human Verification Required

None. Documentation-only phase — every check is programmatic. The prior review dispositions (13-REVIEW-DISPOSITION.md: 3 open) are all addressed: WR-01 and IN-02 closed by 13-02 (verified above), IN-01 closed as the advisory ride-along.

### Gaps Summary

None. Both gaps from the prior verification are closed on-disk and confirmed against the live document: a Phase 14 planner citing D-04 gets exactly one answer (Phase 14 owns the column + byte-identical second-boot test coverage; Phase 16 owns the guard behavior), and D-13's override has one scope (the existing timing-disclosing server.js:1235 429 copy is itself replaced when Phase 17 reworks the login flow, because the password and 2FA steps share one budget and must disclose identically — or not at all). All ROADMAP Phase 13 success criteria 1–5 are satisfied. Phase goal achieved: the root cause is confirmed against the live code and the technical decisions that constrain Phases 14–18 are made once, in writing, unambiguously.

---

_Verified: 2026-10-26T13:29:32Z_
_Verifier: the agent (gsd-verifier)_
