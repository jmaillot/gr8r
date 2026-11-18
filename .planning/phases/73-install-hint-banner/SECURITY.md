---
phase: 73
title: Install Hint Banner — Security Audit
date: 2026-11-18
verdict: SECURED
asvs_level: 1
block_on: high
threats_open: 0
threats_total: 6
auditor: gsd-security-auditor (secure-phase)
---

# Phase 73 — Security Audit (SECURED)

Scope: `src/main.js` (banner listener pair + lazy import), `src/features/install-banner.js`,
`src/styles/overlays.css`, `e2e/install-banner.spec.mjs`, `test/pwa-banner.test.mjs`.
Threat registers consolidated from 73-01-PLAN.md, 73-02-PLAN.md, 73-03-PLAN.md.

## Threat Verification

| Threat ID | Category | Component | Severity | Disposition | Status | Evidence |
|-----------|----------|-----------|----------|-------------|--------|----------|
| T-73-01 | Tampering | localStorage cooldown read (`pwa.installDismissedAt`) | low | mitigate | CLOSED | `src/features/install-banner.js:39` — `v = Number(localStorage.getItem(KEY)) \|\| 0` inside try/catch (fail-absent, line 38–42); stored value only compared against `Date.now()` (line 43), never rendered; all interpolated strip text passes `esc()` (line 113) from the i18n catalogue only (lines 112, 117, 142) |
| T-73-02 | Information Disclosure | e2e stub marker `window.__bipPrompted` | low | mitigate | CLOSED | Marker defined only inside the `addInitScript` stub (`e2e/install-banner.spec.mjs:57,80`); grep across `src/` returns zero matches — static isolation confirmed by the phase grep assertion pattern |
| T-73-03 | Tampering | localStorage cooldown read (renumbered, plan 02) | low | mitigate | CLOSED | Same underlying code as T-73-01; identical mitigation verified in place (`install-banner.js:39,43`) |
| T-73-04 | Denial of Service | onBip rAF retry loop | low | accept | CLOSED | Accepted risk, bounded as documented: `install-banner.js:173` and `:210` — `if (++frames < 300) requestAnimationFrame(attempt)`, decision final on every path; no setTimeout in the retry path; recorded in Accepted Risks below |
| T-73-SC | Tampering | npm/pip/cargo installs | high | mitigate | CLOSED (vacuous) | Zero new dependencies in the phase: `git log -- package.json` shows no Phase 73 commits (last: 59-01); package-legitimacy gate not triggered |
| T-73-04-alt (guard integrity) | Elevation of Control | guardSource seam (`setGuardSource`) | low | mitigate | CLOSED | Live seam (`install-banner.js:75–78`) is a test hook only; runtime uses `defaultGuard` (lines 70–74); no caller passes a custom guard outside `test/pwa-banner.test.mjs` |

## Prompt-from-Gesture Discipline

Single `prompt()` call site pinned by static assertion: `test/pwa-banner.test.mjs:527-528`
(`promptSites.length === 1`), plus behavioral pins at lines 204 and 222. In code, `ev.prompt()`
appears only inside the Install button click handler (`install-banner.js:120–137`), invoked
from a real user gesture; the deferred reference is nulled before use (line 122, one shot per
event, comment lines 118–119). Registered `beforeinstallprompt` listener (`src/main.js:81–83`)
only forwards the browser-originated event to `onBip` — no third call site exists.

## Threat Flags (SUMMARY.md)

No `## Threat Flags` sections found in 73-01/73-02/73-03-SUMMARY.md — no unregistered new
attack surface reported by executors. The one security-relevant observation recorded in
73-01-SUMMARY.md (cooldown garbage semantics: corrupt value ⇒ fail-open "no cooldown") is
T-73-01's own disposition, mitigated as documented and bounded to self-XSS scope (no
cross-origin writer to the key; value never rendered).

## Accepted Risks Log

| Risk | Severity | Rationale |
|------|----------|-----------|
| T-73-04 — bounded rAF retry loop (300 frames ≈ 5 s worst case at 60 fps, then stops) | low | Loop reads internal state only (`strip`, `deferred`, `frames`, `guardSource`); hostile page cannot extend or reset it; no timeout, no persistent state; same budget shape as `checkIos()` (line 210). |

## Residual Posture

- Stored cooldown value is never rendered or interpolated — only compared (`install-banner.js:43`).
- No new endpoints, no auth changes, no schema changes, no new dependencies.
- `public/sw.js` untouched (73-03-PLAN verification item 5); `src/main.js` delta limited to the
  listener pair and lazy `import()` (lines 74–88).
- Carried human-verify item (real Chromium install-eligible profile) from 73-03-PLAN is
  UX/e2e evidence, not a security gap.
