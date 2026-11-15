---
phase: 62-e2e-baseline-repair
verified: 2026-11-14T10:45:00Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
covered_files:
  - e2e/helpers/setup.mjs
  - e2e/french-overflow.spec.mjs
  - e2e/locale.spec.mjs
  - .planning/phases/62-e2e-baseline-repair/62-01-PLAN.md
  - .planning/phases/62-e2e-baseline-repair/62-02-PLAN.md
  - .planning/phases/62-e2e-baseline-repair/62-03-PLAN.md
  - .planning/phases/62-e2e-baseline-repair/62-01-SUMMARY.md
  - .planning/phases/62-e2e-baseline-repair/62-02-SUMMARY.md
  - .planning/phases/62-e2e-baseline-repair/62-03-SUMMARY.md
covered_digest: "v2:sha256:25defee72a82dd17d05a4d558eabd3b3ad6ea13c2699112ffeeb617c3e1ec755"
advisory:
  - finding: "flows.spec.mjs:1086 (2FA sign-in fr) failed once in the verifier's full run, passed on isolated retry — sibling-spec flake, untouched this phase"
    category: other
    reason: "Out of Phase 62 scope (D-06 sibling-spec deferral); Phase 64's '111/111 green at milestone close: 0 known failures' will catch it if it persists"
    evidence_status: "observed once in verifier full run; green on retry"
  - finding: "REVIEW.md open warnings WR-01, WR-02 (helper robustness in openSettings/selectLanguage label resolution)"
    category: other
    reason: "Explicitly out of must-haves scope per REVIEW-DISPOSITION; quality advisory only"
    evidence_status: "documented in 62-REVIEW.md"
deferred:
  - truth: "VIEW-02 (saved-views.spec.mjs:61) is deterministic — flake diagnosed with retries=0 evidence"
    addressed_in: "Phase 63"
    evidence: "Phase 63 SC1/SC2: flake root cause documented with repeated-run trace; VIEW-02 passes --repeat-each N with retries=0"
  - truth: "Full e2e suite closes green at milestone close with 0 known failures"
    addressed_in: "Phase 64"
    evidence: "Phase 64 SC4: 'The full e2e suite is 111/111 green at milestone close: 0 known failures'"
---

# Phase 62: E2E Baseline Repair — Verification Report

**Phase Goal:** The e2e suite becomes a trustworthy regression net again — no readiness races, and every spec asserts the real (post-Phase-56) Settings contract with stronger, never weaker, assertions
**Verified:** 2026-11-14T10:45:00Z
**Status:** passed
**Re-verification:** No — initial verification
**Verified at commit:** d58a676 (clean tree except inert .planning state files)

## Goal Achievement

All four roadmap success criteria were verified against the live codebase **and** against a full e2e run executed by this verifier (not the SUMMARY's run): `npm run e2e` → **110 passed, 2 failed, 0 ECONNREFUSED**; both failures are out-of-scope sibling-spec flakes that pass on isolated retry (see Behavioral Spot-Checks).

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Full e2e run completes with zero ECONNREFUSED 127.0.0.1:4317 from a shared readiness poll; readiness owned solely by `webServer.url`; locked anti-features untouched | ✓ VERIFIED | Verifier's own full run: `grep -c ECONNREFUSED /tmp/opencode/phase62-e2e-final.log` → **0** (both a fresh run and the retry run). `assertServerUp()` (setup.mjs:35-44) is a single fetch with fail-fast throw — no poll, no retry loop (grep: only comment mentions). `git diff 8ad6e8d..HEAD -- e2e/playwright.config.mjs e2e/server.mjs` → empty (byte-identical). `retries: CI?1:0`, `reuseExistingServer: env-gated`, `gracefulShutdown SIGTERM/5000` intact (config lines 17, 36, 39). Single named test run with real config passed with `[WebServer]` boot gating observed. |
| 2 | All 7 `french-overflow.spec.mjs` specs and `locale.spec.mjs:122` pass against HEAD via role-based queries and auto-retrying waits — no sleeps, no `networkidle`, no weakened assertions | ✓ VERIFIED | Verifier's full run: all french-overflow + locale specs green (the named `switching the selector to Français` spec passed standalone in 3.8s with webServer gating). Grep of the three rewritten files: zero `waitForTimeout`, zero `networkidle`, zero `getByRole('combobox')`. Assertion-strength diff performed in 62-REVIEW (2 open warnings are helper-robustness advisories, not weakening). Both findings in 62-02/62-03 SUMMARYs ("app already satisfied assertions; drift was the sleeps") independently reproduced — the named test passed against pre-rewrite HEAD too. |
| 3 | Shared `openSettings()`/`selectLanguage()` helpers exist in `e2e/helpers/setup.mjs` — exactly one place knows the lazy-chunk contract | ✓ VERIFIED | setup.mjs:89 `openSettings(page, {tab})` — role-based expect on the Language-tab heading as the lazy-chunk arrival signal (pairs with `settings: lazy(...)` src/shell/layout.js); setup.mjs:113 `selectLanguage(page, lang)` — label-from-DOM (`select[data-in="langSel"] option`), `waitForResponse` on PATCH `/api/auth/me` armed before the click (pairs with `api.patchMe({locale})` src/actions/actions.js:3347). Grep: zero `waitForResponse` in any spec — the waits live only in setup.mjs (D-05). Specs import and call both helpers (french-overflow.spec.mjs:14,147,167; locale.spec.mjs:15,134,155). Option labels resolved from DOM/catalogue, never transcribed. |
| 4 | Standing gates stay green: 1524-test unit suite, lint clean, 500 kB chunk gate, EN+FR i18n gate | ✓ VERIFIED | Verifier ran all: `npm test` → **pass 1524 / fail 0** (exit 0); `npm run lint` → exit 0; `npm run build` → exit 0 (i18n prebuild scan gate passed; index chunk 498.24 kB); chunk-gate test `node --test test/build-chunk-size.test.mjs` → **11 pass / 0 fail**. |

**Score:** 4/4 truths verified (0 present-but-behavior-unverified — every truth was backed by the verifier's own full e2e run and gate executions)

### Plan-Level Must-Haves (62-01 / 62-02 / 62-03)

| Plan | Must-have highlights | Verdict |
|------|---------------------|---------|
| 62-01 | `assertServerUp()` fail-fast, no poll anywhere, config byte-identical, REPRO evidence in SUMMARY | ✓ All verified — guard at setup.mjs:35 wired into `createAccount`/`createUser`/fixture paths (setup.mjs:230,253,266); prohibitions hold (grep clean) |
| 62-02 | 7 french-overflow specs on shared helpers; waits only in helpers; no combobox role; isolation with run-unique clientIp | ✓ All verified — helpers imported spec-side; `clientIp()` run-unique (sha1 of run:tag); prohibitions grep-clean |
| 62-03 | locale.spec.mjs:122 on helpers; sign-out/sign-in French fallback unchanged; full run + gates green | ✓ All verified — fallback assertions intact at locale.spec.mjs:181-182 (`Menu du compte`, `Se déconnecter`); green in verifier's run |

**Prohibitions:** all judgment-tier prohibitions checked by grep/code inspection — none violated. Notably: no `waitForTimeout`/`networkidle` in any rewritten file (matches found are in untouched sibling specs — deferred per D-06); no `getByRole('combobox')` anywhere; no edits to playwright.config.mjs or server.mjs; no sibling-spec migration; render-loop assertion preserved (62-03 per Pitfall 3).

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `e2e/helpers/setup.mjs` | assertServerUp + openSettings + selectLanguage exports | ✓ VERIFIED | 354 lines; all three exported and wired |
| `e2e/french-overflow.spec.mjs` | 7 specs on post-Phase-56 contract | ✓ VERIFIED | 9 tests green in full run |
| `e2e/locale.spec.mjs` | :122 spec repaired, rest untouched | ✓ VERIFIED | 5 tests green incl. :122 |
| 62-01 SUMMARY REPRO notes | ECONNREFUSED emitter named from live run | ✓ VERIFIED | Present in 62-01-SUMMARY.md |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full e2e, zero ECONNREFUSED | `npm run e2e` | 110 passed / 2 failed (out-of-scope sibling flakes) / **0 ECONNREFUSED** | ✓ PASS |
| Named rewritten spec (lazy-chunk + PATCH contract) | `npx playwright test --config e2e/playwright.config.mjs e2e/french-overflow.spec.mjs --grep "switching the selector"` | 1 passed (3.8s) | ✓ PASS |
| Flaky sibling failures retry | `npx playwright test … saved-views.spec.mjs:61 flows.spec.mjs:1086` | 3 passed (7.2s) | ✓ PASS (flakes, not regressions) |
| Unit suite | `npm test` | 1524 pass / 0 fail | ✓ PASS |
| Lint | `npm run lint` | exit 0 | ✓ PASS |
| Build + i18n gate | `npm run build` | exit 0 (prebuild i18n scan gate passed) | ✓ PASS |
| Chunk gate | `node --test test/build-chunk-size.test.mjs` | 11 pass / 0 fail (index 498.24 kB < 500 kB) | ✓ PASS |

**Verifier-process note:** the verifier's first full run showed 2 failures (`flows.spec.mjs:1086` 2FA-fr, `saved-views.spec.mjs:61` VIEW-02). Both passed on immediate isolated retry — flakes, not regressions. VIEW-02 flakiness is the explicit Phase 63 subject (FLAKY-01/02); the 2FA-fr flake is covered by Phase 64's "0 known failures at milestone close". Neither touches the phase's must-haves. An earlier apparent failure was the verifier's own invocation without `--config` (no webServer) — an artifact, not a suite defect.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| E2E-01 | 62-01 | webServer readiness contract race-free — no ECONNREFUSED from helper-level readiness poll; fail-closed design preserved | ✓ SATISFIED | Truth 1 (verifier's own run: 0 ECONNREFUSED; config untouched; fail-fast guard wired) |
| E2E-02 | 62-02, 62-03 | 9 drifted specs pass against HEAD via role-based queries + auto-retrying waits; assertions strengthened never weakened | ✓ SATISFIED | Truths 2–3 (all 9 green in verifier's run; strength diff in 62-REVIEW; combobox wording implemented as driving the enhanced select by its verified button+listbox+option roles per src/ui/select.js) |

No orphaned requirements: REQUIREMENTS.md maps exactly E2E-01, E2E-02 to Phase 62; both claimed by plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| e2e/french-overflow.spec.mjs | 369 | `\uXXXX` in comment (debt-marker grep false positive — documents escape decoding) | ℹ️ Info | None |
| e2e/back-forward.spec.mjs, invite.spec.mjs, default-visibility.spec.mjs | various | `waitForTimeout` settles | ℹ️ Info | Sibling specs untouched this phase by design (D-06); pre-existing |

No TBD/FIXME/XXX debt markers in any file modified this phase.

### Human Verification Required

None — all must-haves were verified with direct behavioral evidence (verifier-executed full e2e run and gates).

### Gaps Summary

None. The phase goal is achieved at commit d58a676: readiness is owned by exactly one place (`webServer.url`), helpers fail fast instead of polling, all 9 drifted specs assert the real Settings contract through the single shared helper home with stronger (role-based, network-completion) waits, zero ECONNREFUSED in a fresh full run, and every standing gate is green.

### Advisory / Deferred

- **Advisory:** 2FA-fr sibling-spec flake (observed once, green on retry) — watch at Phase 64 close; REVIEW WR-01/WR-02 helper-robustness warnings — out of must-haves scope per REVIEW-DISPOSITION.
- **Deferred:** VIEW-02 de-flake → Phase 63; full-suite close with 0 known failures → Phase 64.

---

_Verified: 2026-11-14T10:45:00Z_
_Verifier: the agent (gsd-verifier)_
