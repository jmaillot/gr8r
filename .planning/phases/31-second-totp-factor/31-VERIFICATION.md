---
phase: 31-second-totp-factor
verified: 2026-11-01T21:30:00Z
status: human_needed
score: 9/9 must-haves verified
covered_files: [".planning/phases/31-second-totp-factor/31-01-PLAN.md", ".planning/phases/31-second-totp-factor/31-01-SUMMARY.md", ".planning/phases/31-second-totp-factor/31-02-PLAN.md", ".planning/phases/31-second-totp-factor/31-02-SUMMARY.md", ".planning/phases/31-second-totp-factor/31-03-PLAN.md", ".planning/phases/31-second-totp-factor/31-03-SUMMARY.md", "server.js", "src/pages/settings.js", "src/actions/actions.js", "src/core/api.js", "src/locales/en.json", "src/locales/fr.json", "test/tfa-multi-factor.test.mjs", "test/migration.test.mjs", "test/totp-encryption.test.mjs"]
covered_digest: "v2:sha256:1959f26ce7933b5956c063c510014fd70b6bcdd030ad7bcc46c859fa820aa541"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Full add-factor wizard in a real browser: Settings → 2FA card → Add factor → naming step → password + existing-factor code → QR/verify → factor appears in list"
    expected: "Stages render in order, per-field errors localize, new factor row shows with relative last-used after refresh"
    why_human: "No client test harness exercises the staged wizard; visual/UX verification only"
  - test: "Per-factor remove confirm UX: Remove button → confirm form echoes factor name → submit with password + survivor code → row disappears"
    expected: "Name echo renders escaped, list refreshes from server ground truth after removal"
    why_human: "Staged confirm rendering and refresh behavior has no automated UI coverage"
  - test: "French rendering of the nine new settings.tfa.* keys in the browser (guillemets, apostrophes, spacing)"
    expected: "D-05 typography correct visually in fr locale"
    why_human: "Typography tests pass mechanically; actual rendering feel needs eyes"
---

# Phase 31: Second TOTP Factor Verification Report

**Phase Goal:** A user can register multiple named TOTP factors alongside the first — each a row in `totp_factors` riding the existing `v2:` envelope keyring — with per-factor replay guards, individual removal, and no half-states. Safest feature closes the milestone.
**Verified:** 2026-11-01
**Status:** human_needed (all automated truths verified; UI flows await /gsd-verify-work)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Legacy 2FA user migrates to exactly one `totp_factors` row (D-06/D-09); byte-identical second boot | ✓ VERIFIED | `migrateTotpFactors()` at server.js:1791 (anti-join server.js:1796, last_step copy server.js:1820); exercised by M1/M2 in test/tfa-multi-factor.test.mjs + migration snapshot pins — 66/66 pass |
| 2 | Login second step accepts a code from ANY enrolled factor; pending-2FA challenge verifies the staged pending secret | ✓ VERIFIED | server.js:2620 (login), server.js:2549/2573 (staged challenge, null baseline); T1/T3 coverage in test/tfa-multi-factor.test.mjs |
| 3 | Per-factor replay guard (D-09/D-10); code used once refused on replay | ✓ VERIFIED | `update totp_factors set last_step` at server.js:2625/2690/2743/2853; T2 replay test green |
| 4 | All step-ups (disable, recovery-regen, enroll) verify through the shared helper with existing-factor gate + required label (TOTP2-05) | ✓ VERIFIED | `verifyTotpAgainstFactors` server.js:458 with `excludeFactorId` param; enroll route server.js:2711 (password gate, 6-digit gate, label ≤64, 409 zero-factor guard); T4–T8 green |
| 5 | Remove enforces survivor-code guard (D-15); single removal deletes only target, recovery untouched (D-17) | ✓ VERIFIED | server.js:2849 — exclusion applied only when factorCount > 1; T9–T12 green |
| 6 | Last-factor removal runs the verbatim disable teardown — no half-state (D-18, TOTP2-04) | ✓ VERIFIED | server.js:2866 teardown (flip + wipe + revoke); T11/T13 green; disable route server.js:2627-2633 also wipes factor rows |
| 7 | Settings 2FA card lists every factor with localized name + relative last-used | ✓ VERIFIED | settings.js:497-505 (`esc(t(f.name))`, `ago(f.lastStep * 30 * 1000)`); populated from `api.tfaFactors()` (api.js:310) via actions.js:2006 |
| 8 | Add-factor staged wizard (name → password+code → QR/verify) and per-factor remove confirm (no picker) wired client-side | ✓ VERIFIED | settings.js:531-566 stages; actions.js:2882-2984 handlers; wrappers api.js:318-324; D-58 503 → `err.masterKeyMissing` in handlers |
| 9 | EN+FR parity for all new keys; single decrypt boundary (`requireTotpSecret` only) | ✓ VERIFIED | 43/43 `settings.tfa.*` keys match in both locales; `settings.tfa.factor.primary` EN+FR; `decryptTotpSecret(` count 4 (def, wrapper, probe, re-wrap) — exclusivity pin in test/totp-encryption.test.mjs green |

**Score:** 9/9 truths verified (0 present-but-behavior-unverified — the state-transition truths are each exercised by named tests in test/tfa-multi-factor.test.mjs, all passing)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `server.js` | totp_factors schema, boot copy, helper, converted branches, 4 factor routes | ✓ VERIFIED | All present and wired (grep evidence above) |
| `test/tfa-multi-factor.test.mjs` | M1/M2, T1–T13 integration coverage | ✓ VERIFIED | 66/66 pass incl. migration + pin suites |
| `src/pages/settings.js` | factor rows + add wizard + remove confirm | ✓ VERIFIED | Wired into existing 2FA card |
| `src/actions/actions.js` | A.tfaAddFactor* / A.tfaAskRemove / A.tfaFactorRemove | ✓ VERIFIED | Clone the tfa pattern; 503 suppressed |
| `src/core/api.js` | tfaFactors/tfaFactorEnroll/tfaFactorEnable/tfaFactorRemove | ✓ VERIFIED | api.js:310-324, all called from actions.js |
| `src/locales/en.json` + `fr.json` | 9+ new keys EN+FR parity | ✓ VERIFIED | 43/43 match; i18n-scan/build-locales/catalogue suites 0 fail |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| verifyTotpAgainstFactors | requireTotpSecret | helper decrypt boundary | ✓ WIRED | server.js:458-…; exclusivity pin green |
| boot copy | users.two_fa_last_step | same-transaction copy (D-09) | ✓ WIRED | server.js:1794-1820 |
| login branch | helper result → factor last_step update | no users-column writes | ✓ WIRED | server.js:2620-2625 |
| add-factor wizard | enroll/enable routes | staged addName→addPw→addVerify | ✓ WIRED | actions.js:2905/2932 |
| remove confirm | factors/remove → refreshTfa() | server ground truth re-list | ✓ WIRED | actions.js:2983; settings.js re-renders from S.ui.tfaFactors |
| last-factor branch | disable teardown | verbatim delegation (D-18) | ✓ WIRED | server.js:2866 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Multi-factor integration suite | `node --test test/tfa-multi-factor.test.mjs test/migration.test.mjs test/totp-encryption.test.mjs` | 66 pass / 0 fail | ✓ PASS |
| i18n parity + catalogue | `node --test test/i18n-scan.test.mjs test/build-locales.test.mjs test/catalogue.test.mjs` | 0 fail | ✓ PASS |
| Decrypt exclusivity | `grep -c "decryptTotpSecret(" server.js` | 4 (def/wrapper/probe/rewrap — pinned) | ✓ PASS |
| two_fa_last_step writes | grep | only disable teardown (2629, 2866) + boot copy read — D-08 satisfied | ✓ PASS |
| Lint gate | `npm run lint` | clean | ✓ PASS |
| Full suite | orchestrator-reported 680/680 + lint clean at HEAD f7e3135 | consistent with sampled runs | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| TOTP2-01 | 31-01, 31-02 | Register second/further TOTP factor as totp_factors row riding v2: keyring | ✓ SATISFIED | Truths 1, 4 |
| TOTP2-02 | 31-02, 31-03 | Named factors with last-used; individual removal with survivor code | ✓ SATISFIED | Truths 5, 7, 8 |
| TOTP2-03 | 31-01, 31-02 | Login + challenge accept ANY factor; per-factor replay guard | ✓ SATISFIED | Truths 2, 3 |
| TOTP2-04 | 31-02 | Last-factor removal = existing disable transaction, no half-state | ✓ SATISFIED | Truth 6 |
| TOTP2-05 | 31-02, 31-03 | New-factor enrollment requires existing-factor proof + label | ✓ SATISFIED | Truths 4, 8 |

No orphaned requirements — all five phase-31 IDs appear in plans and are satisfied. No TBD/FIXME/XXX debt markers introduced in phase-touched files.

### Anti-Patterns Found

None. No stubs, no hardcoded data, no unwired artifacts. Plan 03 even repaired a pre-existing runtime bug (A.markAllRead undefined `myNotifs`) and pre-existing lint errors.

### Human Verification Required

Three items listed in frontmatter — the staged wizard, remove confirm UX, and French rendering have no automated UI harness; route to /gsd-verify-work.

### Gaps Summary

None. All automated truths verified with behavioral test evidence; phase goal achieved at the codebase level. Status is human_needed solely because the goal's user-visible flows (wizard, confirm dialog, localization rendering) require manual browser verification per the decision tree.

---

_Verified: 2026-11-01T21:30:00Z_
_Verifier: the agent (gsd-verifier)_
