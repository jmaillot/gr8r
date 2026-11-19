---
phase: 73
date: 2026-11-18
score: 17/24
baseline: abstract 6-pillar standards (no UI-SPEC.md) + house design tokens (src/styles/tokens.css, components.css)
screenshots: not captured (no dev server on :3000/:5173/:8080)
interaction_captures: skipped (no dev server reached)
scope: install banner strips only (cta flavour + iOS hint strip)
advisory: true
---

# Phase 73 — UI Review (Install Hint Banner)

**Audited:** 2026-11-18
**Baseline:** Abstract 6-pillar standards (no UI-SPEC.md in phase dir), audited against house tokens (`--text`, `--text-inv`, `--surface-2/3`, `--border`, `--r-*`, `--fs-sm`, `--spring`, `--dur`).
**Screenshots:** Not captured — no dev server detected. Code-only audit (JS/CSS/i18n source review + e2e spec cross-check).
**Interaction captures:** off (workflow.ui_interaction_capture is false); would have been skipped anyway (no dev server). Interaction findings below are code-derived.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 2/4 | WR-01: CTA text rendered twice ("Install app  Install app  ✕"); iOS flavour mixes label + instruction with no verb for the Share action |
| 2. Visuals | 3/4 | Full-width dark strip, clear hierarchy (grow / button / ✕); but strip sits hard on `bottom: 0` with squared corners while every other floating surface (toasts) is rounded |
| 3. Color | 4/4 | Token-only colors (`--text`/`--text-inv`/`--border`), no hardcoded hex, no accent misuse; dark-strip-on-light mirrors `.toast` house pattern |
| 4. Typography | 3/4 | Inherits sane defaults but no explicit `font-size: var(--fs-sm)` on the strip → body-size text in a compact strip, diverging from the toast pattern |
| 5. Spacing | 3/4 | Token-adjacent values (8/12px, gap 10px, safe-area-inset respected) but ad-hoc literals rather than spacing scale |
| 6. Experience Design | 2/4 | WR-02 double-mount/wrong-flavour edge, unstyled loading window after Install click, no reduced-motion handling for exit, shared `role=status` for an actionable CTA |

**Overall: 17/24** — advisory only; nothing here blocks shipping, but WR-01 is user-visible duplication and should be fixed before the banner ships broadly.

---

## Top 3 Priority Fixes

1. **WR-01 — duplicated CTA string (BLOCKER-grade copy defect, user-visible).** `install-banner.js:113` injects `t('pwa.install.cta')` into the grow-span AND `:117` sets the same string on the Install button — the user sees "Install app  Install app  ✕". Fix: make the CTA flavour's grow-span carry a *reason* string (e.g. new key `pwa.install.ctaHint`: "Works offline · EN+FR") or an empty/omitted span, and keep the button as the sole "Install app". One-line fix in `renderStrip()`; e2e already asserts button text, so no test churn.
2. **WR-02 + no visual loading state after Install click.** The Install button handler (`install-banner.js:120-137`) nulls `deferred` immediately and awaits `ev.userChoice` — during the native install dialog the button stays clickable, and on the wrong-flavour/missing-event path (`!ev` → `hide`) the strip vanishes with zero feedback, looking like a silent failure. Also `renderStrip()` early-returns `strip` if already mounted regardless of flavour, so a 'cta'→'ios' re-entry silently reuses the wrong DOM (guarded at call sites today, fragile tomorrow). Fix: `btn.disabled = true` before `ev.prompt()`, restore on catch; add a flavour check to the `if (strip) return strip;` guard.
3. **Typography + reduced-motion consistency.** The strip omits `font-size: var(--fs-sm)` (every sibling floating surface — `.toast` — declares it), and `.install-banner.out`'s 160 ms opacity transition is not covered by the `prefers-reduced-motion` block in `motion.css:263`. Fix: add `font-size: var(--fs-sm)` to `.install-banner` and a `transition: none` override for `.install-banner.out` inside the reduced-motion media query.

---

## Detailed Findings

### Pillar 1: Copywriting (2/4)
- **BLOCKER (WR-01):** `src/features/install-banner.js:112-117` — for the `cta` flavour, `text = t('pwa.install.cta')` goes into `<span class="grow">` and `btn.textContent = t('pwa.install.cta')` repeats it. Rendered result: "Install app | Install app | ✕". Both EN (`en.json:2006`) and FR (`fr.json:2070`) affected.
- **iOS hint is instruction-only:** `pwa.install.iosHint` = "Share → Add to Home Screen" (EN) / "Partager → Sur l'écran d'accueil" (FR). Correct in not faking a button (D-06 respected), but it names no verb-less context — acceptable, minor.
- Dismiss button uses `t('a11y.dismiss')` ("Dismiss") as aria-label — good, not "X" or "Close".
- No generic "Submit/OK/Cancel" strings; no error copy exists in the banner (the `!ev` / `prompt()`-throw paths hide silently — see Pillar 6).

### Pillar 2: Visuals (3/4)
- Clear flex hierarchy: grow-span → Install button (`.install-cta`, `flex: none`) → ✕ (`overlays.css:793-799`). Single focal action. Good.
- Fixed bottom full-width strip with `border-top: 1px solid var(--border)` — consistent strip semantics, `z-index: 110` correctly sits above toasts (100).
- **Minor:** `.install-banner` has `border-radius: 0` while the sibling floating surface `.toast` uses `border-radius: var(--r)` — an explicit squared-corner choice for a full-width strip, but it visually separates the banner from the house's rounded floating-surface language. The dismiss ✕ is a 22 px `.ibtn-xs` (13 px icon) — small tap target below the ~44 px touch guidance on the exact control the user must find to silence a persistent banner. Consider `.ibtn-sm` or extra padding hit-area.
- Icon-only ✕ is paired with `aria-label` — satisfies the icon-button rule.

### Pillar 3: Color (4/4)
- Zero hardcoded colors in the banner styles (`overlays.css:773-799`): `background: var(--text)`, `color: var(--text-inv)`, `border-top: var(--border)`. Dark mode inversion handled by token redefinition (`tokens.css:116,156`).
- No accent usage at all — appropriate for a passive strip; the CTA button inherits `.ibtn` neutral styling (`components.css:119-140`) rather than `.btn-primary` accent, which matches the 60/30/10 discipline (no third accent surface introduced).
- Contrast: `--text-inv` (#ffffff light / #151514 dark) on `--text` background mirrors the shipped toast pattern — high contrast, no finding.

### Pillar 4: Typography (3/4)
- `.install-banner` declares **no** `font-size` — it renders at body default while `.toast` (the direct analog, `overlays.css:814+`) explicitly uses `var(--fs-sm)` (12.5px). Inconsistent with the established floating-surface type scale; at body size the duplicated CTA string (WR-01) reads even heavier.
- Weights: strip inherits default weight; no font-weight declarations added this phase — no drift.
- No new font families; token discipline otherwise clean.

### Pillar 5: Spacing (3/4)
- Values in use: `padding: 8px 12px calc(8px + env(safe-area-inset-bottom, 0px))`, `gap: 10px` (`overlays.css:778-783`). All small integers consistent with the codebase's px-literal convention (`.toast` uses the same 8/12/10 rhythm), and safe-area handling is explicitly correct for the bottom-fixed position — better than average for iOS.
- No arbitrary `[...]` Tailwind values; no rem drift. Minor: `10px` gap matches `.toast` but neither maps to a named spacing token — house-wide pattern, not a phase defect.

### Pillar 6: Experience Design (2/4)
- **WR-02 (WARNING, severity: degrades but call-site-guarded):** `renderStrip()` (`install-banner.js:108`) returns the existing strip regardless of flavour — a `cta`→`ios` (or reverse) re-entry would reuse wrong-flavour DOM with the wrong handler wiring. Currently unreachable because `onBip`/`checkIos` paths are mutually exclusive per browser and `attempt()` checks `if (strip) return`, but the guard lives in callers, not the component. Defensive fix is one line.
- **No loading/disabled state on Install click:** `install-banner.js:120-137` — during the native install dialog (`await ev.userChoice`), the button remains enabled and clickable; a second click hits `deferred === null` → `hide(el)`, dismissing the banner mid-dialog. Add `btn.disabled = true` at handler entry.
- **Silent failure paths:** `!ev` and `prompt()` throw both `return hide(el)` with no copy — the strip just fades out. Acceptable for a passive banner (no data loss), but a toast ("Install cancelled") would match the app's existing toast vocabulary.
- **State coverage strengths:** empty/error/edge paths are genuinely handled — storage failures fall back silently (`cooldownExpired`, `writeCooldown`), `appinstalled` hides unconditionally (`onInstalled`), one-shot `prompt()` discipline prevents double-prompt. Destructive-action confirmation N/A.
- **Semantics:** strip uses `role="status"` — correct for the iOS hint (pure announcement), but the CTA flavour contains an interactive button; `role="status"` implicitly makes it a live region that some SRs will re-announce on DOM change. `role="region"` + `aria-label` (or plain div) would be safer for the CTA flavour.
- **Reduced motion:** `.install-banner.out` transition (160 ms, `overlays.css:789-791`) is not in the `prefers-reduced-motion` block (`motion.css:263`) — the entrance uses `--spring` via shared animation timing, exit opacity fade is mild; minor a11y gap.

---

## Registry Safety
Not applicable — no `components.json`, no third-party UI registries in this phase's surface.

## Files Audited
- `src/features/install-banner.js` (full, 216 lines)
- `src/styles/overlays.css` (install-banner block, lines 773-799; toast block for comparison)
- `src/styles/components.css` (`.ibtn` family, lines 119-155; `.btn`/`.btn-primary` for accent comparison)
- `src/styles/tokens.css` (`--text-inv`, `--fs-sm`, `--spring`, dark-mode inversions)
- `src/styles/motion.css` (reduced-motion block, line 263+)
- `src/locales/en.json`, `src/locales/fr.json` (`pwa.install.*`, `a11y.dismiss`)
- `e2e/install-banner.spec.mjs` (cross-check of rendered copy assertions)
