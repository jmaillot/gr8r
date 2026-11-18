---
phase: 73-install-hint-banner
verified: 2026-11-18T21:55:00Z
status: human_needed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
covered_files:
  - .planning/phases/73-install-hint-banner/73-01-PLAN.md
  - .planning/phases/73-install-hint-banner/73-01-SUMMARY.md
  - .planning/phases/73-install-hint-banner/73-02-PLAN.md
  - .planning/phases/73-install-hint-banner/73-02-SUMMARY.md
  - .planning/phases/73-install-hint-banner/73-03-PLAN.md
  - .planning/phases/73-install-hint-banner/73-03-SUMMARY.md
  - src/main.js
  - src/features/install-banner.js
  - src/locales/en.json
  - src/locales/fr.json
  - src/styles/overlays.css
  - test/pwa-banner.test.mjs
  - e2e/install-banner.spec.mjs
covered_digest: "v2:sha256:c48362d2cb56cf5f237b8760f1d126d92f41f34c708524da501df0ad32c8f8a6"
re_verification:
  previous_status: gaps_found
  previous_score: 3/4
  gaps_closed:
    - "Truth 1 (CR-01): onBip now retries canShow() across a bounded 300-frame rAF budget while hydration is pending — the checkIos shape — and decides once (commit f6661c5); WR-03 closed by a delay-free pre-hydration e2e scenario (commit 769b1b8)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Real Chromium install flow: on a real Chromium desktop/Android install-eligible profile, cold-load the app and observe the banner within ~2 s of load; click Install."
    expected: "Banner appears despite natural (often pre-hydration) beforeinstallprompt timing; clicking Install triggers the real native install prompt."
    why_human: "The real browser's event-vs-hydration ordering cannot be reproduced by the stubbed e2e; the rAF-timed scenario proves ordering robustness against a synthetic event, not the native one."
---

# Phase 73: Install Hint Banner Verification Report

**Phase Goal:** On browsers that can install the app, users get an honest in-app install affordance that triggers the real native prompt; on browsers that cannot (iOS, Firefox), they either see nothing or platform-appropriate manual instructions — never a broken or lying prompt.
**Verified:** 2026-11-18T21:55:00Z
**Status:** human_needed (all automated must-haves pass; one carried production-confirmation item requires a real Chromium profile)
**Re-verification:** Yes — after gap-closure plan 73-03

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Banner appears on `beforeinstallprompt` (EN+FR) and triggers the native prompt — including when the event fires BEFORE hydration | ✓ VERIFIED | `onBip(e)` (src/features/install-banner.js:158-181) now mirrors `checkIos()`: stores the event, returns on null, synchronous first `attempt()`, retries `requestAnimationFrame(attempt)` while `++frames < 300` when `!g.enabled`, final auth decline, decide-once via `canShow()`. **Behavioral test:** new e2e scenario 5 (`e2e/install-banner.spec.mjs:227`) dispatches the stubbed event on the first rAF after listener registration (addEventListener patch, zero setTimeout) with `/api/config` held 150 ms at the route level — banner renders, CTA fires prompt marker, hide. Executor measured RED (scenario 5 fails) against pre-fix one-shot and GREEN with the fix; verified GREEN 5/5 in this verification after a fresh build. Unit pre-hydration retry/decide-once/auth-decline cases pass. |
| 2 | Banner suppresses on `appinstalled`, on dismissal (persisted, non-nagging), and standalone | ✓ VERIFIED | Unchanged from initial verification: `onInstalled()` (167-170), X writes `pwa.installDismissedAt` with `cooldownExpired()` gate, `userChoice 'dismissed'` hides without the key, standalone guard. Boundary test now uses a single captured clock base (f6661c5) — the previous flake is gone (28/28 deterministic). |
| 3 | iOS shows static "Share → Add to Home Screen" (feature-based); Firefox never shows anything | ✓ VERIFIED | Unchanged: `isIos()` pure feature detection; Firefox total silence (D-07 unit case); e2e scenario 4 proves runtime reachability; `pwa.install.iosHint` in en.json + fr.json. main.js:88 pins the boot-time call. |
| 4 | Lazy chunk (<200 B entry delta) and EN+FR catalogue in the same commit | ✓ VERIFIED | Fresh build emits exactly one lazy chunk `install-banner-B-BRgNBo.js`, imported from the entry (`Hs=()=>import("./install-banner-...")` in dist index). Entry `index-Fe1GLKnF.js` = 495,560 B vs baseline 499,995 B — **negative** delta, far inside the 200 B budget. Locale keys symmetric. |

**Score:** 4/4 truths verified (0 present, behavior-unverified — truth 1's pre-hydration transition is exercised by e2e scenario 5)

### Re-verification Summary

- **CR-01 CLOSED:** confirmed in code (onBip bounded rAF retry present, decide-once property, no setTimeout in the retry path — the only `setTimeout` in the file is the pre-existing hide() exit timer at :91, out of scope per 73-03 revision). Disposition updated to `fixed` (73-REVIEW-DISPOSITION.md:51), re-review confirmed.
- **WR-03 CLOSED:** pre-hydration e2e scenario with documented premise correction (a bare document-start rAF fires before the deferred module script evaluates — measured; fixed by patching addEventListener and dispatching on the first rAF AFTER listener registration). Route-level 150 ms /api/config hold documented as required for RED/GREEN distinguishability on localhost.
- **Standing constraints:** `git diff 2573fd1 -- public/sw.js src/main.js` → empty (zero diffs). Entry chunk within budget. Full suite `npm test` → 1785 pass / 0 fail / 13 env-skips.

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | WR-01, WR-02, IN-01..03 carryover observations | Open by disposition, not scheduled to a phase | 73-REVIEW-DISPOSITION.md:52-56 — documented open observations (cosmetic/maintenance); the orchestrator's briefing records WR-01/WR-02/IN-01..05 as open. None blocks the goal (honest affordance, honest degradation). |

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Banner unit suite (28 cases incl. pre-hydration retry, decide-once, auth decline, deterministic boundary) | `node --test test/pwa-banner.test.mjs` | 28 pass / 0 fail | ✓ PASS |
| Full regression suite | `npm test` | 1785 pass / 0 fail / 13 env-skips | ✓ PASS |
| e2e install-banner suite (incl. scenario 5 pre-hydration) after fresh `npm run build` | `npx playwright test --config e2e/playwright.config.mjs e2e/install-banner.spec.mjs` | 5 passed (6.7s) | ✓ PASS |
| sw.js / main.js standing constraint | `git diff 2573fd1 -- public/sw.js src/main.js` | empty | ✓ PASS |
| Entry chunk budget | stat dist index vs `test/fixtures/banner-entry-baseline.json` | 495,560 vs 499,995 B (Δ = −4,435 B) | ✓ PASS |
| No setTimeout in onBip retry path | scoped grep | only pre-existing hide() timer :91 | ✓ PASS |

## Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| none declared | - | - | N/A |

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| PWA-04 | 73-01, 73-02, 73-03 | Honest install affordance, real native prompt, honest degradation, lazy chunk + i18n gates | SATISFIED (automated) | All four success-criteria truths verified; CR-01 gap closed by 73-03 with behavioral e2e evidence. Real-Chromium production confirmation remains a human item. |

REQUIREMENTS.md maps PWA-04 → Phase 73 (line 74); no orphaned requirements.

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| src/features/install-banner.js | 112-117 | Same CTA string rendered twice (WR-01, open carryover) | ℹ️ Info | Cosmetic |
| src/features/install-banner.js | 107-108 | renderStrip early-return ignores flavour during exit window (WR-02, open carryover) | ⚠️ Warning | Edge-case UX; reachability reduced by 73-03 guards |
| src/features/install-banner.js | 130-136 | Double hide(el) on unexpected outcome (IN-01, open) | ℹ️ Info | Harmless |
| CSS/JS | - | 160 ms exit constant duplicated (IN-02, open) | ℹ️ Info | Maintenance |
| install-banner.js imports | - | Silent chunk-load failure swallows feature (IN-03, open; house pattern) | ℹ️ Info | Matches pushMod convention |

No unresolved debt markers (TBD/FIXME/XXX) in phase-modified files. The previous verification's boundary-flake warning is resolved (single clock base).

## Human Verification Required

### 1. Real Chromium install flow (production confirmation of CR-01 closure)

**Test:** On a real Chromium desktop/Android profile meeting install criteria, load the app cold and let `beforeinstallprompt` fire in its natural timing; observe whether the banner appears within ~2 s of load; click Install.
**Expected:** Banner appears despite natural (often pre-hydration) event ordering; native install prompt triggers.
**Why human:** The e2e proves robustness against a synthetic event with controlled ordering; only a real browser confirms the native event path (real prompt(), real userChoice, real install-criteria gating).

## Gaps Summary

None — the single gap from the initial verification (CR-01 / truth 1) is closed with both the deterministic fix and behavioral test evidence. Overall status is `human_needed` solely because the real-Chromium confirmation cannot be automated and must not be silently dropped.

**Note:** `gsd_run query verification.fingerprint` was unavailable in this session; `covered_digest` was computed as a single v2 sha256 over the concatenated `covered_files` contents (command recorded in session log).

---

_Verified: 2026-11-18T21:55:00Z_
_Verifier: the agent (gsd-verifier)_
