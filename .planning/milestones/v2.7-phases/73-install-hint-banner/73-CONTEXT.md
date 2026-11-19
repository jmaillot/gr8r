# Phase 73: Install Hint Banner - Context

**Gathered:** 2026-11-18
**Status:** Ready for planning

<domain>
## Phase Boundary

The only real JS surface of the v2.7 milestone: a `beforeinstallprompt`-driven install
banner (lazy chunk) with honest platform degradation — Chromium gets a real native prompt,
iOS gets a static one-line "Share → Add to Home Screen" strip, Firefox gets total silence.
Suppression on `appinstalled`, on user dismissal (14-day cooldown), and when already
running standalone. EN+FR strings catalogued in the same commit; entry delta < 200 bytes;
zero `sw.js` edits. Phase 72's manifest/head work is a done dependency; Phase 74 verifies
the SW and accepts the milestone.

</domain>

<decisions>
## Implementation Decisions

### Banner form & placement
- **D-01:** Fixed bottom strip (fixed bar at the bottom edge, above content) with an
  Install button and a dismiss X. Not a toast, not inline. — **Reversibility:** reversible
  — pure CSS/positioning change in one module.

### Trigger & timing
- **D-02:** Boot-only, event-driven: a ~5-line `beforeinstallprompt` listener in `main.js`
  lazy-imports the banner module; the banner shows whenever the event fires after
  hydration — no user-interaction prerequisite, no delay gate.
- **D-03:** Banner may appear on any authenticated app route, including `/w/:slug`
  workspace routes; suppressed on `/login`, `/join`, and demo screens. It lives at shell
  level so it survives workspace switching. — **Reversibility:** reversible — route guard
  is a condition check in the module.

### Suppression & dismissal persistence
- **D-04:** Banner suppresses itself on `appinstalled`, when the app is already running
  standalone (`display-mode: standalone` matchMedia), and on user dismissal.
- **D-05:** Dismissal persists client-side in `localStorage` (not the workspace doc —
  per-browser, per-device, zero server round-trip) with a **14-day cooldown**: hidden
  14 days after dismissal, then may re-appear on the next `beforeinstallprompt`.

### Platform degradation
- **D-06:** iOS shows the same fixed bottom strip containing a static one-line hint
  ("Share → Add to Home Screen", EN+FR) — no button, no fake prompt, no expandable
  walkthrough. Detection is feature-based (no `BeforeInstallPromptEvent` + iOS UA +
  not standalone), never timeout-based.
- **D-07:** Firefox (desktop and Android) gets total silence — the banner never appears
  and nothing explains its absence.

### Strings & gates
- **D-08:** Every banner string (Chromium strip, iOS one-liner, a11y labels) is
  catalogued EN+FR in `src/locales/en.json` and `fr.json` in the same commit (i18n gate).
- **D-09:** Banner logic is a lazy chunk (`import()` from the `main.js` listener, the
  established `import('./x.js').catch(() => {})` pattern); entry delta target < 200 bytes;
  chunk gate re-run.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone planning & research
- `.planning/research/SUMMARY.md` — "Phase 2: Install Banner" section: full banner
  architecture, pitfalls 5 (i18n/chunk gates), 6 (iOS honesty), 10 (Playwright stubbed
  event), 12/13 (dev double registration, standalone mobile-band).
- `.planning/REQUIREMENTS.md` — PWA-04 full text.
- `.planning/ROADMAP.md` — Phase 73 goal, success criteria 1–4, standing constraints.

### Prior-phase context (done dependency)
- `.planning/phases/72-manifest-icons-head-integration/72-CONTEXT.md` — manifest/
  theme_color/background_color/iOS metas already landed; the banner builds on it and
  must not touch `public/sw.js`, `server.js`, or `index.html` head tags.

### Repo contracts the phase must not break
- `test/browser-push.test.mjs` — forbidden-token contract on `public/sw.js`
  (`fetch|install|activate|import` banned); zero sw.js edits.
- `src/main.js` — the lazy-`import()` patterns with pre-warmed-chunk comments
  (`[67-04]`, `[66-02 D-13]`, `pushMod`) that the banner listener must follow.
- `src/core/i18n.js` + `src/locales/en.json` / `src/locales/fr.json` — catalogue
  structure for the new EN+FR keys.
- `src/styles/tokens.css` — design tokens for the bottom strip styling.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/ui/toast.js` toast pattern — visual reference only; the banner is a separate
  fixed strip, not a toast instance.
- `src/core/i18n.js` `t()` — the single string-resolution path for banner copy.
- `src/core/push.js` `registerSw()` — already registered at root scope; reuse only,
  never re-register.

### Established Patterns
- Lazy-chunk imports in `src/main.js` with `.catch(() => {})` and comment-tagged
  pre-warm rationale — the banner listener joins this family.
- Static contract tests (`test/browser-push.test.mjs`, phase 72's `test/pwa.test.mjs`)
  pinning file shape — the pattern for the banner's entry-delta / listener pin.
- EN+FR catalogue in the same commit as the code using it (i18n gate enforced).

### Integration Points
- `src/main.js` — new `beforeinstallprompt` + `appinstalled` listeners (tiny, entry-safe).
- New module (e.g. `src/features/install-banner.js`) — banner render/dismiss/prompt logic,
  lazy-imported.
- `src/locales/en.json` / `fr.json` — new install banner keys.
- Route guard — reuse the shell's route knowledge (login/join/demo exclusion).

</code_context>

<specifics>
## Specific Ideas

- Owner picked the recommended option in every gray area: fixed bottom strip, event-driven
  boot trigger, localStorage dismissal with a 14-day cooldown, one-line iOS hint, Firefox
  total silence, authed-routes-only display.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 73-Install Hint Banner*
*Context gathered: 2026-11-18*
