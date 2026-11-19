---
phase: 73-install-hint-banner
plan: 03
subsystem: pwa-install-banner
tags: [gap-closure, CR-01, WR-03, raf-retry, e2e, flake]
requires: [73-01, 73-02]
provides: ["onBip bounded rAF retry (CR-01 closure)", "pre-hydration e2e scenario (WR-03 unmasked)", "deterministic cooldownExpired boundary test"]
affects: [src/features/install-banner.js, test/pwa-banner.test.mjs, e2e/install-banner.spec.mjs]
tech-stack:
  added: []
  patterns: [checkIos-shaped bounded rAF retry, addEventListener-patch init-script stub, route-level hydration hold]
key-files:
  created: []
  modified:
    - src/features/install-banner.js
    - test/pwa-banner.test.mjs
    - e2e/install-banner.spec.mjs
decisions:
  - "onBip mirrors checkIos(): synchronous first attempt, bounded 300-frame rAF retry while !enabled, final auth decline, decide-once — no timeouts"
  - "e2e pre-hydration stub dispatches on the first rAF AFTER listener registration (addEventListener patch): measured evidence shows a bare document-start rAF fires BEFORE the network-fetched deferred module script evaluates, so the event would be lost"
  - "/api/config hydration is held at route level (150 ms, Node-side) for scenario 5: localhost hydration resolves faster than a frame, which let the pre-fix one-shot win — RED/GREEN measured distinguishable only with the hold"
  - "One pre-existing unit pin updated: 'nothing renders before the rAF recheck' contradicted the plan-mandated checkIos shape (synchronous first attempt) — renamed/reworded, semantics preserved"
metrics:
  duration: 14min
  completed: 2026-11-18
status: complete
estimate:
  tokens: 40000
  tasks: 2
actuals:
  tokens: 4100
  tasks: 2
  commits: 2
  plan_head_before: 2573fd1c6d9484ceb04ddf953ec6af1c1c71a69c
  plan_head_after: 769b1b8
---

# Phase 73 Plan 03: Gap Closure — onBip Retry (CR-01), Pre-Hydration e2e (WR-03), Boundary Flake Summary

**One-liner:** onBip now survives the pre-hydration `beforeinstallprompt` race with a checkIos-shaped 300-frame rAF retry, proven end-to-end by a delay-free e2e scenario that is measurably RED against the old one-shot code, plus a single-clock-base cooldown boundary test.

## What Was Built

### Task 1 — onBip bounded rAF retry (CR-01) + deterministic boundary (commit f6661c5)
- `src/features/install-banner.js`: `onBip(e)` rewritten to mirror `checkIos()`: stores the event, returns immediately on null (no frames scheduled), runs an `attempt()` closure — stops on mounted strip or nulled event (`onInstalled` path), final on `g.auth` (D-03), retries `requestAnimationFrame(attempt)` while `++frames < 300` when `!g.enabled`, then decides ONCE via `canShow()` → `renderStrip('cta')` (canShow owns standalone/cooldown/route — not duplicated). No `setTimeout` anywhere in the retry path (D-06 discipline verified: scoped grep = 0). Block comment updated with the boot-race rationale and decide-once property.
- `test/pwa-banner.test.mjs`: three new unit cases — pre-hydration retry (guard flips `enabled` after 5 reads, well inside the 300-frame budget; RED against the old one-shot), decide-once (20 extra pumped frames mount no second strip, schedule no frames), final auth decline (auth clearing later never renders). Boundary test rewritten with ONE captured `base = Date.now()`: `cooldownExpired(base + 14*864e5)` false, `+1ms` true — no same-millisecond dependence.

### Task 2 — pre-hydration e2e scenario (WR-03) (commit 769b1b8)
- `e2e/install-banner.spec.mjs`: new `BIP_PRE_HYDRATION_STUB` + scenario 5 ("a pre-hydration beforeinstallprompt (rAF-timed, no delay) still shows the strip and triggers the prompt"). Header STUB CONTRACT documents both orderings (delayed post-hydration for scenarios 1–3, rAF-timed pre-hydration for 5) and why a synchronous document-start dispatch is structurally lost. Scenarios 1–4 and `BIP_STUB` untouched.

## Measured Deviations from the Plan (Rules 1/3 — documented, not silent)

1. **[Rule 3] A bare document-start rAF fires BEFORE main.js's listener registration in this app** (the plan assumed the inverse). Probe evidence: timeline `[raf-dispatch, listener-fire, listener-registered]` — the deferred module script is fetched over the network and first paint precedes its evaluation. Fix preserving the plan's intent: the stub patches `addEventListener`, dispatches on the first rAF AFTER the app's `beforeinstallprompt` registration. Still zero `setTimeout`, still pre-hydration.
2. **[Rule 3] `/api/boot` does not exist — hydration is `GET /api/config`** (api.js:172 sets `enabled`). The verification doc's "/api/boot" was shorthand.
3. **[Rule 3] On localhost, hydration resolves faster than a frame** — the pre-fix one-shot recheck won even with the early dispatch, making RED/GREEN indistinguishable. Fix: scenario 5 holds the `/api/config` response 150 ms at the Playwright route level (Node-side; the browser-side dispatch stays delay-free). Measured: RED (scenario 5 fails, 4 pass) against `HEAD~1` one-shot; GREEN 5/5 with the fix.
4. **[Rule 1] e2e `dist/` staleness**: the e2e webServer serves the built bundle without rebuilding; `dist/` predated the fix and silently invalidated the first GREEN/RED measurements. Rebuilt with `npm run build` before each measurement; future e2e runs must build first (pre-existing 73-02 flow behavior, now documented here).
5. **[Rule 1] One pre-existing unit pin updated** ("nothing renders before the rAF recheck"): contradicted the plan-mandated checkIos shape, whose first `attempt()` judges synchronously when guards are already live. Renamed and reworded; prompt-never-outside-gesture and render assertions preserved.

## Verify Results

| Check | Command | Result |
|---|---|---|
| Unit suite (incl. 3 new cases + boundary fix) | `node --test test/pwa-banner.test.mjs` | 28/28 pass |
| Flake check (boundary determinism) | same, 3 consecutive runs | 28/28 × 3, zero flakes |
| e2e install-banner suite | `npx playwright test --config e2e/playwright.config.mjs e2e/install-banner.spec.mjs` | 5/5 pass |
| e2e RED proof | same against pre-fix onBip (`HEAD~1`, rebuilt dist) | scenario 5 FAILS, 4 pass — distinguishable as required |
| Full suite | `npm test` | 1785 pass / 0 fail / 13 env-skips |
| No setTimeout in onBip body (D-06) | scoped grep on the `onBip` function body | 0 |
| sw.js untouched | `git diff --stat public/sw.js` | empty |
| Entry unchanged | `git diff src/main.js` | empty (banner stays in the lazy chunk) |

## Deferred (unchanged, per gap_closure contract)

WR-01 (duplicate CTA string), WR-02 (renderStrip flavour during exit window), IN-01 (double hide), IN-02 (160 ms constant duplication), IN-03 (silent chunk-load failure) remain open observations — judged not trivially adjacent or cosmetic in 73-03-PLAN's success criteria.

## Human Verify (carried — NOT automatable)

**Real Chromium install flow (CR-01 production confirmation):** on a real Chromium desktop/Android install-eligible profile, cold-load the app and confirm the banner appears within ~2 s despite natural pre-hydration event timing; clicking Install triggers the native prompt. The e2e scenario proves ordering robustness against a stubbed event, not the real one (73-VERIFICATION.md Human Verification #1).

## Deviations from Plan

See "Measured Deviations" above — all Rules 1/3 auto-fixes, none architectural (no Rule 4).

## Self-Check: PASSED

- FOUND: src/features/install-banner.js, test/pwa-banner.test.mjs, e2e/install-banner.spec.mjs (modified in commits f6661c5, 769b1b8)
- FOUND: f6661c5 feat(73-03): onBip bounded rAF retry (CR-01) + deterministic cooldown boundary
- FOUND: 769b1b8 test(73-03): pre-hydration e2e scenario (WR-03)
