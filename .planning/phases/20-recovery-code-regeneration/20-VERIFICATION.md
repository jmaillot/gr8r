---
phase: 20-recovery-code-regeneration
verified: 2026-10-29T10:45:00Z
status: human_needed
score: 9/10 must-haves verified
covered_files:
  - .planning/phases/20-recovery-code-regeneration/20-01-PLAN.md
  - .planning/phases/20-recovery-code-regeneration/20-01-SUMMARY.md
  - .planning/phases/20-recovery-code-regeneration/20-02-PLAN.md
  - .planning/phases/20-recovery-code-regeneration/20-02-SUMMARY.md
  - .planning/phases/20-recovery-code-regeneration/20-03-PLAN.md
  - .planning/phases/20-recovery-code-regeneration/20-03-SUMMARY.md
  - server.js
  - src/actions/actions.js
  - src/core/api.js
  - src/pages/settings.js
  - src/locales/en.json
  - src/locales/fr.json
  - src/styles/pages/settings.css
  - test/i18n-core-features.test.mjs
  - test/tfa-recovery-regen.test.mjs
covered_digest: "v2:sha256:27b71c11887d827d8fd41f26c8df540032fabee62dd0986f9055f543d6b2cc00"
behavior_unverified: 1
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 9/9
  gaps_closed:
    - "G-20-1 — 2FA on-state card text collapses to ~one word per line: short row-level labels (settings.tfa.regenShort + act.turnOff) shipped at settings.js:410, wrap-tolerant .srow > .row cluster shipped in settings.css:51-57, i18n catalogue pin bumped to 1582"
  gaps_remaining: []
  regressions: []
behavior_unverified_items:
  - truth: "G-20-1 resolved visually — on the 2FA on-state card, title/description render on readable, naturally wrapped lines with both buttons present"
    test: "Open Settings → 2FA card (2FA on), UI in French; observe text wrap with the short 'Régénérer' + 'Désactiver' buttons present"
    expected: "Description wraps naturally (no one-word-per-line); buttons sit in the auto column and wrap to a second line if space runs out; inline step-up forms keep their long labels"
    why_human: "CSS flex/grid wrap rendering is visual; presence and wiring of the fix are proven (settings.js:410, settings.css:53-57) but the rendered layout can only be confirmed by a human"
prohibitions:
  - statement: "A recovery code must never satisfy the regeneration step-up (D-85)"
    status: verified
    verification: test
    evidence: "server.js:1717-1719 — 6-digit-only gate; test 'D-85 headline regression' passes on this fresh run"
  - statement: "Plaintext recovery codes never written to any persistent store (D-97)"
    status: verified
    verification: test
    evidence: "server.js:1741-1743 — only recoveryHash(normalizeRecoveryCode(c)) inserted; integration test asserts 10 new hashes with plaintext absent"
  - statement: "Neither password alone nor TOTP alone may authorize regeneration (D-86)"
    status: verified
    verification: test
    evidence: "server.js:1731-1739 — both factors verified inside the transaction before any write; wrong-password and stale-code tests pass"
  - statement: "No new recovery-codes display machinery; codes only via D-53 modal, never persisted client-side (D-91)"
    status: verified
    verification: judgment
    evidence: "actions.js — transient S.ui.recoveryCodes + openModal({type:'recovery'}); no localStorage/sessionStorage writes (grep clean)"
  - statement: "Regen form never accepts a recovery code as its code field (D-85 client half)"
    status: verified
    verification: judgment
    evidence: "settings.js regen form — inputmode=numeric / autocomplete=one-time-code, labeled 6-digit; server gate is the structural backstop"
  - statement: "Plan 20-03 prohibition: do NOT touch the disable-route conflict (tfaAskDisable / disable routing) — Phase 21 scope"
    status: verified
    verification: judgment
    evidence: "settings.js:410/413/416 — disable routing attributes (tfaAskDisable/tfaDisableConfirm) unchanged; 20-03 commits bd31a9b/b3d2a3d touch only labels + CSS"
  - statement: "Plan 20-03 prohibition: do NOT change the step-up form labels"
    status: verified
    verification: judgment
    evidence: "settings.js:416/427 — disable form keeps settings.tfa.turnOff, regen form keeps settings.tfa.regen; only the row-level buttons were shortened"
human_verification:
  - test: "Open Settings → 2FA card (on state), UI in French. Confirm the on-state description ('L'authentification à deux facteurs est activée. Vous saisirez un code…') wraps naturally with the short 'Régénérer' + 'Désactiver' buttons present; confirm the inline step-up forms still show their long labels and no missing-key placeholders"
    expected: "Readable multi-line text (G-20-1 closed); buttons wrap to a second line rather than squeezing the text column; form labels unchanged"
    why_human: "CSS grid/flex wrap rendering is visual-only; the code fix is present and wired but the rendered result cannot be confirmed by grep or tests"
---

# Phase 20: Recovery-Code Regeneration Verification Report

**Phase Goal:** A user with 2FA enabled can replace their recovery codes when they suspect exposure — with the strongest step-up, and atomic burn-and-replace semantics.
**Verified:** 2026-10-29T10:45:00Z
**Status:** human_needed (gap G-20-1 fixed in code; one visual confirmation remains — the fix itself is a CSS layout change)
**Re-verification:** Yes — after gap closure (plan 20-03, gap G-20-1). Supersedes the 2026-10-29T08:13:25Z report.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | POST password + live TOTP → `{ok:true, recoveryCodes:[10 plaintext]}` | ✓ VERIFIED | server.js:1704–1755 route; test 1 passes (fresh run this verification) |
| 2 | Old hashes gone, exactly 10 new hashes with used_at null — one transaction | ✓ VERIFIED | server.js:1738–1744 (delete-all + insert-new inside `transaction()`); test asserts hash-set state |
| 3 | Recovery code as step-up rejected 400 codeRejected, stored set byte-unchanged | ✓ VERIFIED | test 2 passes (D-85 regression, re-run this session) |
| 4 | Wrong password burns a try; 6th attempt in 15 min → 429 tooManyAttempts | ✓ VERIFIED | server.js:1710 throttle `tfa-regen\|${id}`, 5/15min; test 4 passes |
| 5 | 2FA-disabled user → 409 tfaNotEnabled before any factor check | ✓ VERIFIED | server.js:1729–1730; test 3 passes |
| 6 | MASTER_KEY unusable → 503 masterKeyMissing, nothing mutated | ✓ VERIFIED | requireTotpSecret fail-closed inside transaction before writes; test 5 passes |
| 7 | Exactly one security_log row `tfa_recovery_regenerated` on success | ✓ VERIFIED | server.js:1746–1747 inside transaction (success-only) |
| 8 | UI: regen button → inline password+6-digit form with warning; submit calls POST /api/auth/tfa/recovery; codes via D-53 modal, shown once, cleared on dismiss | ✓ VERIFIED | settings.js:423–429, actions.js regen handlers, api.js:275–277; no persistence (grep clean) |
| 9 | EN + FR keys for all new strings; i18n-scan green | ✓ VERIFIED | regenShort en.json:1284 / fr.json:1284; `npm run i18n:scan` re-run this session: 0 issues, 0 placeholder-mismatch |
| 10 | **G-20-1:** on-state card title/description render on readable wrapped lines even with both row buttons present | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Fix present + wired: short labels at settings.js:410 (`settings.tfa.regenShort` + `act.turnOff`, both locales), `.srow > .row { flex-wrap; justify-content:flex-end; row-gap: var(--s-2) }` at settings.css:53–57; CSS rendering itself needs a human eye — see Human Verification |

**Score:** 9/10 truths verified (1 present, behavior-unverified — the G-20-1 layout fix)

### Gap Closure Verification (G-20-1)

Plan 20-03 claimed three artifacts; all verified against the codebase (not the SUMMARY):

| Claimed artifact | Codebase evidence | Status |
|---|---|---|
| `settings.tfa.regenShort` in en.json + fr.json | en.json:1284 "Regenerate" / fr.json:1284 "Régénérer" | ✓ VERIFIED |
| settings.js:410 row buttons use regenShort + act.turnOff | settings.js:410 — `data-a="tfaAskRegen"` button uses `t('settings.tfa.regenShort')`, disable button uses `t('act.turnOff')` (en.json:150 "Turn off" / fr.json:151 "Désactiver"); data attributes and button classes unchanged | ✓ VERIFIED |
| settings.css `.srow` control-cluster wrap rule | settings.css:51–57 — `.srow > .row { flex-wrap: wrap; justify-content: flex-end; row-gap: var(--s-2); }`; grid template `minmax(0,1fr) auto` at :43–50 untouched | ✓ VERIFIED |

**Wiring check:** `srow()` (settings.js:79–81) emits `<div class="srow">…<div class="row">${ctl}</div></div>` — the third argument (the buttons) lands inside a direct `.row` child of `.srow`, so the `.srow > .row` selector matches the button cluster. WIRED.

**Prohibitions honored:** disable-route attributes untouched (tfaAskDisable/tfaDisableConfirm unchanged at settings.js:410/413/416); step-up form labels unchanged (settings.tfa.turnOff :416, settings.tfa.regen :427). Commits bd31a9b/b3d2a3d confirm scope.

**i18n catalogue pin:** test/i18n-core-features.test.mjs:216 asserts 1582 keys with the ledger entry "+ settings.tfa.regenShort, phase 20 plan 3" — test passes (14/14 this session). Consistent with the SUMMARY's Rule-3 deviation note.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server.js` POST /api/auth/tfa/recovery | Route block | ✓ VERIFIED | Unchanged since prior verification; 5/5 integration tests re-run green |
| `test/tfa-recovery-regen.test.mjs` | Integration tests | ✓ VERIFIED | **5/5 pass** on this fresh run |
| `src/core/api.js` tfaRecover | Client method | ✓ VERIFIED | Calls POST /api/auth/tfa/recovery |
| `src/actions/actions.js` tfaAskRegen/tfaRegenConfirm | Handlers | ✓ VERIFIED | Wired to DOM data attributes |
| `src/pages/settings.js` regen stage + short row labels | Both stages wired | ✓ VERIFIED | :410 short labels, :423–429 regen form |
| `src/locales/en.json` + `fr.json` | All regen keys incl. regenShort | ✓ VERIFIED | 1284 in both; i18n-scan 0 issues |
| `src/styles/pages/settings.css` | Wrap-tolerant cluster | ✓ VERIFIED | :51–57, grid template untouched |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| srow() control cell | .srow > .row CSS rule | DOM structure `<div class="row">${ctl}</div>` | ✓ WIRED | Selector matches actual markup |
| Route transaction | requireTotpSecret | only decrypt path | ✓ WIRED | server.js:1734 |
| Route transaction | two_fa_last_step update | same transaction | ✓ WIRED | server.js:1738 |
| Insert | recoveryHash(normalizeRecoveryCode(c)) | one normalization | ✓ WIRED | server.js:1742 |
| A.tfaRegenConfirm | api.tfaRecover → D-53 modal | recoveryCodes → S.ui → openModal | ✓ WIRED | actions.js; unchanged, no regression |
| settings.js form | A.tfaRegenConfirm | data-submit + #id values | ✓ WIRED | settings.js:423–427 |
| Error switch | err.* keys incl. tfaNotEnabled | both locales | ✓ WIRED | actions.js:2553–2556 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Regen integration suite | `node --test test/tfa-recovery-regen.test.mjs` | tests 5, pass 5, fail 0 | ✓ PASS |
| i18n catalogue pin | `node --test test/i18n-core-features.test.mjs` | tests 14, pass 14, fail 0 (1582-key assertion green) | ✓ PASS |
| i18n literal scan | `npm run i18n:scan` | 0 literals, 0 pending, 0 unlisted, 0 stale, 0 placeholder-mismatch | ✓ PASS |
| Full suite | `npm test` | **547 pass, 0 fail** | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| REGEN-01 | 20-01, 20-02 | Regenerate via POST /api/auth/tfa/recovery — password + live TOTP required; recovery code never satisfies step-up | ✓ SATISFIED | Route + D-85 gate + passing regression test (re-run); UI entry point wired with short row label |
| REGEN-02 | 20-01, 20-02 | Atomic delete-all + insert-new in one transaction; plaintext displayed once, never stored | ✓ SATISFIED | Transaction block server.js:1728–1748; D-53 modal reuse; no persistence paths |

No orphaned requirements: REQUIREMENTS.md maps exactly REGEN-01 and REGEN-02 to Phase 20 (lines 77–78), both claimed by plans 20-01/20-02. Plan 20-03 is gap closure (`requirements: []` per contract).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | No TBD/FIXME/XXX/TODO markers in any 20-03-touched file; no stub returns; no localStorage writes | — | — |

### Prohibitions

All 7 prohibition items verified (3 test-tier with passing wired tests re-run this session; 4 judgment-tier with structural code evidence, including both plan 20-03 scope prohibitions). No flagged or unverified prohibitions.

### Human Verification Required

1. **G-20-1 visual confirmation (the closure item itself)** — open Settings → 2FA card (on state), French UI. Expect naturally wrapped description text with short "Régénérer" + "Désactiver" buttons; wrap-to-second-line on overflow; long labels preserved inside the step-up forms; no missing-key placeholders. This was the exact user-reported symptom, so it must be re-confirmed by the same visual channel.

### Gaps Summary

No code gaps. The prior report's single UAT gap (G-20-1) is fixed in code and fully verified at the presence/wiring/test level: short labels in both locales, wrap-tolerant `.srow > .row` rule, grid template and disable-route untouched, i18n pin consistent, 547/547 tests green on a fresh run. Status remains `human_needed` for exactly one item: the visual confirmation of the CSS layout fix, which by nature cannot be proven by grep or tests — the G-20-1 truth stays ⚠️ PRESENT_BEHAVIOR_UNVERIFIED until a human re-checks the card.

---

_Verified: 2026-10-29T10:45:00Z_
_Verifier: the agent (gsd-verifier)_
