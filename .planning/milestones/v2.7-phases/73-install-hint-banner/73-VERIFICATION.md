---
phase: 73-install-hint-banner
verified: 2026-11-18T23:59:00Z
status: passed
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
covered_digest: "v2:sha256:041aabb46458a54bfad655bad71cded8aa1173cd610fb2e87356298a853b1b95"
re_verification:
  previous_status: human_needed
  previous_score: 4/4
  refresh_note: "Stale refresh (2026-11-19): staleness trigger diagnosed — the only repo change since the previous verification was 73-UAT.md (git 342a1fd1..HEAD touches .planning/phases/73-install-hint-banner/73-UAT.md only; git status clean). That file is not a covered digest input; the digest change vs the prior pass comes from the prior pass having hashed 73-UAT.md-free inputs at an earlier commit of the planning docs (73-UAT.md was created after). No covered source file changed."
  gaps_closed:
    - "Human-verification item (real Chromium install flow) — PASSED by the user in UAT (73-UAT.md test 1, result: pass, 1 passed / 0 issues; persisted in commit d6249b6f). Recorded as verified via UAT."
  gaps_remaining: []
  regressions: []
---

# Phase 73: Install Hint Banner Verification Report

**Phase Goal:** On browsers that can install the app, users get an honest in-app install affordance that triggers the real native prompt; on browsers that cannot (iOS, Firefox), they either see nothing or platform-appropriate manual instructions — never a broken or lying prompt.
**Verified:** 2026-11-19T13:45:00Z
**Status:** passed — all must-haves verified; the single human item from the prior pass was completed via UAT (73-UAT.md test 1: pass)
**Re-verification:** Yes — stale-digest refresh pass (prior pass minutes earlier, status human_needed 4/4)

## Staleness Diagnosis

- `git status --porcelain` → clean (no uncommitted churn, no dist/ rebuild artifacts tracked).
- `git log --oneline -5` → HEAD `d6249b6f test(73): complete UAT - 1 passed, 0 issues`; all commits since the prior verification are `.planning/` doc commits.
- `git diff 342a1fd1..HEAD --stat` → only `.planning/phases/73-install-hint-banner/73-UAT.md` changed (the UAT outcome record). **No covered source file changed** — the stale flag came from planning-doc churn after UAT, not code.
- `git diff 2573fd1 -- public/sw.js src/main.js` → empty (zero-diff constraint intact).

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Banner appears on `beforeinstallprompt` (EN+FR) and triggers the native prompt — including when the event fires BEFORE hydration | ✓ VERIFIED | `onBip(e)` (src/features/install-banner.js:158-181) stores the event, null-guards, synchronous first `attempt()`, retries `requestAnimationFrame(attempt)` while `++frames < 300` when `!g.enabled`, final on auth decline, decides once via `canShow()`. Verified in this pass: the bounded rAF retry code is present unchanged (lines 150-181), the only `setTimeout` in the file is the pre-existing `hide()` exit timer at :91, and the onBip path is timeout-free. Unit suite re-run green (below); e2e scenario 5 (`e2e/install-banner.spec.mjs:227`, delay-free pre-hydration) green in prior pass. Real-Chromium production confirmation: **pass via UAT** (73-UAT.md test 1). |
| 2 | Banner suppresses on `appinstalled`, on dismissal (persisted, non-nagging), and standalone | ✓ VERIFIED (regression check) | Unchanged code: `onInstalled()` nulls the deferred event and hides; X writes `pwa.installDismissedAt` with `cooldownExpired()` gate; `userChoice 'dismissed'` hides without the key; standalone guard in `canShow()`. Unit suite re-run green. |
| 3 | iOS shows static "Share → Add to Home Screen" (feature-based); Firefox never shows anything | ✓ VERIFIED (regression check) | Unchanged: `isIos()` feature detection; Firefox total silence (unit case); `pwa.install.iosHint` in en.json + fr.json. Locale files' covered hashes unchanged vs prior pass. |
| 4 | Lazy chunk (<200 B entry delta) and EN+FR catalogue in the same commit | ✓ VERIFIED (regression check) | dist re-checked this pass: single lazy chunk `install-banner-B-BRgNBo.js` present; entry `index-Fe1GLKnF.js` = 495,560 B vs baseline 499,995 B (Δ = −4,435 B — inside the 200 B budget). test/pwa-banner.test.mjs (which asserts the budget) re-run green. |

**Score:** 4/4 truths verified (0 present, behavior-unverified)

### Human Verification (completed via UAT)

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | Real Chromium install flow: cold-load on an install-eligible Chromium desktop/Android profile; banner appears within ~2 s despite natural (often pre-hydration) `beforeinstallprompt` timing; clicking Install triggers the native prompt | **pass** | 73-UAT.md test 1 (`result: pass`, status complete, 1 passed / 0 issues); persisted in commit d6249b6f. This was the only reason the prior verification was `human_needed`; with UAT passed, the report flips to `passed` and the item is recorded as verified via UAT. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Banner unit suite (28 cases) | `node --test test/pwa-banner.test.mjs` | 28 pass / 0 fail (12.3 s) | ✓ PASS |
| onBip timeout-free retry path | grep onBip body (install-banner.js:158-181) | only `requestAnimationFrame`; the single `setTimeout` in the file is the pre-existing hide() exit timer :91 | ✓ PASS |
| Lazy chunk emitted | `ls dist/assets \| grep install-banner` | exactly one: `install-banner-B-BRgNBo.js` | ✓ PASS |
| Entry chunk budget | stat dist entry vs fixture baseline | 495,560 vs 499,995 B (Δ −4,435 B) | ✓ PASS |
| sw.js / main.js zero-diff constraint | `git diff 2573fd1 -- public/sw.js src/main.js` | empty | ✓ PASS |
| Working tree clean / staleness source | `git status --porcelain`; `git diff 342a1fd1..HEAD --stat` | clean; only 73-UAT.md changed | ✓ PASS |

(Carried from prior pass, minutes ago, sources unchanged: full suite 1785 pass / 0 fail / 13 env-skips; e2e 5/5 after fresh build.)

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| PWA-04 | 73-01, 73-02, 73-03 | Honest install affordance, real native prompt, honest degradation, lazy chunk + i18n gates | ✓ SATISFIED | All four truths verified; human item closed via UAT (73-UAT.md test 1 pass). |

## Anti-Patterns Found

Unchanged from prior pass (all open carryovers, none blocking — see 73-REVIEW-DISPOSITION.md): WR-01 (duplicated CTA string, ℹ️ Info), WR-02 (renderStrip early-return flavour, ⚠️ Warning, reachability reduced by 73-03 guards), IN-01..03 (double hide, duplicated 160 ms constant, silent chunk-load failure — house pattern). No debt markers (TBD/FIXME/XXX) in phase-modified files.

## Gaps Summary

None. Prior pass was already 4/4 with one human item; that item has since passed via UAT and is recorded as verified. Covered sources are byte-identical since the prior verification (digest re-computed fresh in this pass); all cheap re-checks (unit suite, chunk/budget, zero-diff constraints, clean tree) pass. Status: **passed**.

---

_Verified: 2026-11-19T13:45:00Z_
_Verifier: the agent (gsd-verifier)_
