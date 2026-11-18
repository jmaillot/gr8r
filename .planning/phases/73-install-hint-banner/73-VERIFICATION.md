---
phase: 73-install-hint-banner
verified: 2026-11-18T21:30:00Z
status: gaps_found
score: 3/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
covered_files:
  - .planning/phases/73-install-hint-banner/73-01-PLAN.md
  - .planning/phases/73-install-hint-banner/73-01-SUMMARY.md
  - .planning/phases/73-install-hint-banner/73-02-PLAN.md
  - .planning/phases/73-install-hint-banner/73-02-SUMMARY.md
  - src/main.js
  - src/features/install-banner.js
  - src/locales/en.json
  - src/locales/fr.json
  - src/styles/overlays.css
  - test/pwa-banner.test.mjs
  - e2e/install-banner.spec.mjs
covered_digest: "v4:sha256:a6da8b0b4d653cd98d7173c96fab3dd14013d36657c1e222d954f051a0077c9d"
gaps:
  - truth: "On a browser firing beforeinstallprompt, the install banner appears (EN+FR) and activating it triggers the native install prompt"
    status: partial
    reason: "CR-01 confirmed in code: onBip() (src/features/install-banner.js:158-163) judges canShow() with a SINGLE requestAnimationFrame recheck and never retries, while checkIos() (lines 185-199) got a 300-frame retry budget for exactly the same boot race — the module's own comment says the race is real ('proven by e2e'). When the real event fires before /api/boot hydration completes (api.enabled still false — api.js:12 defaults to false, only set true at api.js:172), the one-shot recheck sees !g.enabled, declines to render, and the captured event is never shown: no lying prompt, but also no honest affordance. The e2e stub dispatches the event 150 ms AFTER reload (well past hydration) and WR-03 records that this inverts real Chromium ordering, masking the gap. Wiring is present and the post-hydration path works (e2e green per 73-02, unit render/prompt cases green); the pre-hydration ordering — the common real-world case — is unproven and code inspection argues it fails."
    artifacts:
      - path: "src/features/install-banner.js"
        issue: "onBip lacks the bounded rAF retry that checkIos has; single frame cannot outlast hydration"
      - path: "e2e/install-banner.spec.mjs"
        issue: "150 ms stub dispatch delays the event past hydration — does not reproduce real event ordering (WR-03)"
    missing:
      - "onBip: same bounded rAF re-check budget as checkIos (retry canShow() across frames until guard signals resolve, then decide once)"
      - "e2e: a scenario dispatching the stubbed event before boot hydration completes (init script at document start, no delay) proving the banner still renders"
requirements: [PWA-04]
---

# Phase 73: Install Hint Banner Verification Report

**Phase Goal:** On browsers that can install the app, users get an honest in-app install affordance that triggers the real native prompt; on browsers that cannot (iOS, Firefox), they either see nothing or platform-appropriate manual instructions — never a broken or lying prompt.
**Verified:** 2026-11-18T21:30:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Banner appears on `beforeinstallprompt` (EN+FR) and triggers the native prompt | ✗ FAILED (partial) | Wiring present (main.js:81-84) and the post-hydration path works (e2e green per 73-02; unit render/prompt cases pass), but CR-01 confirmed: `onBip()` judges `canShow()` once via a single rAF with no retry while `checkIos()` has a 300-frame budget for the identical race (install-banner.js:160-163 vs 188-197). On the common real ordering — event fires before `/api/boot` hydration, `api.enabled` still false (api.js:12/172) — the banner never renders. The e2e's 150 ms delayed stub (WR-03) can't exercise this ordering. Human/blocker-gated on CR-01. |
| 2 | Banner suppresses on `appinstalled`, on dismissal (persisted, non-nagging), and standalone | ✓ VERIFIED | `onInstalled()` hides and nulls the event (install-banner.js:167-170); X writes `pwa.installDismissedAt` (95-101) and `cooldownExpired()` gates `canShow()` (85); `userChoice 'dismissed'` hides without writing the key (btn.onclick 120-137); standalone matchMedia guard (57-63, 80). Unit cases pass: `node --test test/pwa-banner.test.mjs` 25/25 incl. onInstalled/cooldown/standalone. |
| 3 | iOS shows static "Share → Add to Home Screen" (feature-based); Firefox never shows anything | ✓ VERIFIED | `isIos()` pure feature detection, no timers (50-55); Firefox path renders nothing and schedules nothing (D-07 unit case passes); `checkIos()` renders iosHint-only strip, no button, no prompt() on the iOS path; e2e scenario 4 proves runtime reachability from the boot call with no stubbed event; main.js:88 pins the boot-time call. `pwa.install.iosHint` present in en.json:2007 and fr.json:2071. |
| 4 | Lazy chunk (<200 B entry delta) and EN+FR catalogue in the same commit | ✓ VERIFIED | Build-contract unit cases pass: exactly one `/install-banner/` chunk emitted by a real vite build; entry within 200 B of `test/fixtures/banner-entry-baseline.json`; main.js carries only the `[73-01]` listener block (80-88); static pin keeps `pwa.install` keys out of the entry. Both locale files carry the keys symmetrically. `node --test test/browser-push.test.mjs` 30/30. |

**Score:** 3/4 truths verified (truth 1: wiring present, production-path behavior contested by CR-01)

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Banner unit suite (render/prompt/dismiss/cooldown/standalone/auth/ios/firefox/build contract) | `node --test test/pwa-banner.test.mjs` | 25 pass / 0 fail | ✓ PASS |
| sw.js contract regression | `node --test test/browser-push.test.mjs` | 30 pass / 0 fail | ✓ PASS |
| e2e Playwright suite | skipped | requires webServer boot of built dist; and an e2e green cannot resolve CR-01 — the stub's 150 ms delay masks the exact ordering CR-01 concerns (WR-03) | ? SKIP |

**Flake note:** the `cooldownExpired(nowMs)` boundary case (test/pwa-banner.test.mjs:273, "exactly 14 days: still cooling") failed once in 4 runs. It asserts `Date.now() + 14*864e5` minus the just-stored `Date.now()` is NOT past the window — true only when both clock reads land in the same millisecond. Implementation (`> COOLDOWN_MS`) and spec are arguably fine; the test is a boundary flake. Warning, not a gap.

## Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| none declared | - | - | N/A |

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| PWA-04 | 73-01, 73-02 | Honest install affordance, real native prompt, honest degradation, lazy chunk + i18n gates | PARTIAL | SC 2/3/4 verified; SC 1 contested by CR-01 (production ordering). REQUIREMENTS.md marks PWA-04 "Complete" — premature until CR-01 closes. |

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| test/pwa-banner.test.mjs | 273 | Boundary flake: same-ms clock reads required for strict `<` | ⚠️ Warning | Gate not reliably green |
| src/features/install-banner.js | 160-163 | Single-shot rAF decision in onBip vs 300-frame budget in checkIos (CR-01) | 🛑 Blocker | Production Chromium banner may never render |
| e2e/install-banner.spec.mjs | 40 | 150 ms delayed stub dispatch masks real ordering (WR-03) | ⚠️ Warning | Hides CR-01 |
| src/features/install-banner.js | 112-117 | Same CTA string rendered twice (WR-01) | ℹ️ Info | Cosmetic duplication |
| src/features/install-banner.js | 107-108 | renderStrip early-return ignores flavour, can stack during exit window (WR-02) | ⚠️ Warning | Edge-case UX |
| src/features/install-banner.js | 130-136 | Double hide(el) on unexpected outcome (IN-01) | ℹ️ Info | Harmless |
| CSS/JS | - | 160 ms exit constant duplicated (IN-02) | ℹ️ Info | Maintenance |
| install-banner.js imports | - | Silent chunk-load failure swallows feature (IN-03) | ℹ️ Info | Matches house .catch(() => {}) convention |

## Human Verification Required

### 1. Real Chromium install flow (CR-01 closure)

**Test:** On a real Chromium desktop/Android profile meeting install criteria, load the app cold and let `beforeinstallprompt` fire in its natural (often pre-hydration) timing; observe whether the banner appears within ~2 s of load.
**Expected:** The banner appears despite early event timing; clicking Install triggers the native prompt.
**Why human:** Real event ordering vs hydration cannot be reproduced by the current 150 ms-delayed stub; the deterministic fix (onBip retry budget + a pre-hydration e2e scenario) must land first, then this confirms production behavior.

## Gaps Summary

One gap, root-caused to CR-01 (recorded OPEN in 73-REVIEW-DISPOSITION.md and confirmed by code inspection): the Chromium banner's visibility decision does not survive the boot race that the iOS path was explicitly hardened against. Everything else — suppression, persistence, iOS/Firefox degradation, lazy chunk, i18n catalogue — is implemented, wired, and unit-proven. The e2e evidence for criterion 1 is real but structurally blind to the failing ordering. Recommended closure: give `onBip` the same bounded rAF re-check as `checkIos`, add a pre-hydration e2e scenario (dispatch from the init script with no delay), then human-verify on a real Chromium install-eligible profile.

---

_Verified: 2026-11-18T21:30:00Z_
_Verifier: the agent (gsd-verifier)_
