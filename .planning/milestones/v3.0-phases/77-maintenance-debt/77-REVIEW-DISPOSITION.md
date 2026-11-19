---
phase: 77-maintenance-debt
recorded: 2026-11-19
severity: advisory
source: 73-REVIEW.md + 74-REVIEW.md carryovers
open: 0
fixed: 9
skipped: 0
deferred: 0
---

# Code Review Disposition — Phase 77 (73/74 carryovers)

One row per carried advisory from the Phase 73 and Phase 74 reviews (source
findings: `milestones/v2.7-phases/73-install-hint-banner/73-REVIEW.md` and
`milestones/v2.7-phases/74-service-worker-verification-milestone-acceptance/74-REVIEW.md`;
anchors re-verified live in `77-RESEARCH.md` § Advisory Fix Anchors).
Per D-77-8..16 every advisory is **FIX** with a regression pin in the same
commit — none waived. All fixes landed in plan 77-02 (commit `00e03579`,
which groups the D-77-8..14 banner-cluster fixes file-wise per D-77-1's
file-grouped commit discipline).

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 (73) | warning | fixed | Duplicate CTA string in the grow-span — fixed: dedicated `pwa.install.hint` key added to en+fr catalogues (D-77-8 scope: EN+FR per the locked decision — see Note 2), rendered in the cta grow-span; the button keeps `pwa.install.cta`; pins in `test/pwa-banner.test.mjs` (D-08 catalogue pin extended + grow-span static pin asserting exactly one `t('pwa.install.cta')` usage) |
| WR-02 (73) | warning | fixed | renderStrip/hide module-state races — fixed: `stripFlavour` tracked alongside `strip` (flavour-aware early return); references clear inside hide()'s 160 ms removal callback, never before; `deferred` cleared in both give-up-retry paths; pins: flavour-reuse pin, reference-survival pin, give-up-clears-deferred pin (`test/pwa-banner.test.mjs`) |
| IN-01 (73) | info | fixed | Double `hide(el)` on the unexpected-outcome path — fixed: duplicate call removed, exactly one hide per path; pin: the rejected-userChoice path adds exactly one `.out` class and one removal (`test/pwa-banner.test.mjs`) |
| IN-02 (73) | info | fixed | 160 ms exit constant duplicated CSS↔JS — fixed: named `EXIT_MS` constant in install-banner.js; overlays.css transition derives from `--install-banner-exit-ms` set at mount (single source of truth; mechanism chosen to not foreclose a future toast.js unification); pin: constant-agreement pin asserting the CSS fallback equals EXIT_MS and no bare 160 remains (`test/pwa-banner.test.mjs`) |
| IN-03 (73) | info | fixed | Silent chunk-load failure in main.js — fixed: the three `.catch(() => {})` sites on the bannerMod chains surfaced via `bannerChunkFailed` (`console.warn('install banner chunk failed', err)` — static prefix, error object as a separate argument, ASVS V5); the line-511 boot-line exact-string pin updated in the same commit — see Note 1; pins: boot-line shape + no-silent-catch-in-banner-block + warn-shape (`test/pwa-banner.test.mjs`) |
| IN-04 (73) | info | fixed | Frame-count retry budgets — fixed: wall-clock deadlines (`performance.now() + RETRY_BUDGET_MS`, 5000 ms) in both onBip and checkIos, final on exhaustion; pins: no `++frames`/`let frames` remains, exactly two wall-clock deadlines, both exhaustion paths clear `deferred` (`test/pwa-banner.test.mjs`) |
| IN-05 (73) | info | fixed | Stale unit-test header comment (pre-73-03 shape) — fixed: comment-only update describing the current post-73-03 shape and the 77-02 pin set (`test/pwa-banner.test.mjs` header) |
| IN-01 (74) | info | fixed | gateIdx anchored to first-substring `!api.enabled` — fixed: anchored to the exact quoted gate line already asserted verbatim (`if (!('serviceWorker' in navigator) || !api.enabled) return;`) with a distinct `!== -1` assert (`test/sw-contract.test.mjs`) |
| IN-02 (74) | info | fixed | `import.meta.dirname` Node-floor hazard — fixed: defensive `path.join(path.dirname(fileURLToPath(import.meta.url)), '..')` derivation with `fileURLToPath` imported from node:url; scope is this pinned file only; pin: fallback-shape + no-bare-usage + ROOT-smoke-recompute test (`test/sw-contract.test.mjs`) |

## Notes (recorded exceptions / observations)

1. **73-IN-03 deliberate convention break:** surfacing the chunk-load failure
   breaks the house `.catch(() => {})` convention at exactly three sites in
   `src/main.js` — an owner-ratified exception (D-77-12), recorded here. The
   message never interpolates raw error internals into user-visible strings
   (T-77-02, V5 mitigation).
2. **D-77-8 locale scope observation:** the locked decision scopes the new
   `pwa.install.hint` key to EN+FR (the D-08 discipline as applied when the
   banner shipped in 73-01). The house rule more generally prefers all 5
   catalogues for refusal/UI keys; nl/de/es do not carry `pwa.install.hint`
   this phase, and their users fall back to the EN string. Recorded as an
   asymmetry observation, not a defect — the banner copy is promotional, not
   a refusal path. If the owner wants full parity, it is a 4-line follow-up.
3. **74-IN-02 broader surface observation:** ~24 other `import.meta.dirname`
   sites exist repo-wide (test/ + e2e/). Out of scope per D-77-16 (pinned
   file only); the same fallback would apply mechanically if the Node floor
   ever drops.
4. **Ledger count:** the plan's front-matter spec and acceptance criteria
   said "10 fixed rows", but the enumerated advisory list (WR-01, WR-02,
   73-IN-01..05, 74-IN-01, 74-IN-02) is 9 findings — recorded here as
   `fixed: 9`, one row per enumerated advisory, none open/skipped/deferred.
   SC3 is satisfied on the enumerated list (every named advisory carries a
   fixed disposition with a regression pin); the "10" was a planning-tally
   arithmetic slip, documented rather than padded with a synthetic row.

## Reconciliations (plan 77-03, recorded 2026-11-19)

(a) **D-77-6 placeholder parity re-interpreted per the owner decision
(2026-11-19):** `err.signupDomainNotAllowed` is a static catalogue string on
the signup path with no placeholder, so parity = the rendered text equals the
imported catalogue entry exactly (`e2e/locale-refusal.spec.mjs` full-string
`toHaveText` per locale) — which subsumes "no raw `{token}` tokens remain".
(b) **D-77-5's "toast" wording reconciled to the actual render surface:** the
refusal renders as an inline form-field error — the `ferr('email')` span
(`#email-err`, `aria-describedby="email-err"`) in `src/pages/auth.js` — not a
toast; the spec asserts that element.
(c) **74-IN-02 broader surface observation:** ~24 other `import.meta.dirname`
sites exist repo-wide (test/ + e2e/); out of scope per D-77-16 (pinned file
only), unchanged by this plan.

### 77-03 execution notes (deviations recorded in 77-03-SUMMARY.md)

- The new refusal spec exposed a live product bug: the server's
  `LOCALE_CODES` gate was still the pre-phase-75 `['en','fr']` pair, so
  nl/de/es account-locale writes 400'd (`unknownLocale`) and never persisted.
  Fixed by deriving the gate from the shipped `src/locales/*.json` registry
  (commit `0b660e76`), regression pin in `test/locale-account.test.mjs`.
- Three stale e2e assertions (pre-dating this plan) were aligned with
  already-shipped behavior so the standing e2e gate can hold: install-banner
  grow-span expectations (77-02's WR-01 hint key), the language-select
  registry size in french-overflow/locale specs (phase 75's five locales),
  and default-visibility's `@dv.local` fixture emails (the run-wide signup
  gate refuses them — `INVITE_DOMAINS` inherits `SIGNUP_DOMAINS`).
