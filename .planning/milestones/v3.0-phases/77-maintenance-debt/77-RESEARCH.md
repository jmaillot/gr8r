# Phase 77: Maintenance Debt - Research

**Researched:** 2026-11-19
**Domain:** lint cleanup, review-advisory fixes (PWA install banner + sw-contract test), nl/de/es refusal-path e2e
**Confidence:** HIGH (all claims verified against live source this session; scope re-run live)

## Summary

Phase 77 is a debt-cleanup phase with three independent tracks: (1) fix 17 live
eslint errors — 15 unused-var/useless-assignment sites across 11 files plus 2
`no-undef` files fixed via config only; (2) fix the WR-01/WR-02 and 73-IN-01..05
advisories in `src/features/install-banner.js` / `src/main.js` /
`test/pwa-banner.test.mjs`, and 74-IN-01/74-IN-02 in `test/sw-contract.test.mjs`,
each with a regression pin; (3) a Playwright locale spec driving the signup DP-1
refusal in nl/de/es with catalogue-import cross-checks.

Scope was re-verified live this session: `npx eslint .` reports **exactly 17
errors** matching the ROADMAP count [VERIFIED: live `npx eslint .` run,
2026-11-19]. One material discovery for the planner: **the signup DP-1 refusal
carries no interpolated placeholder in any locale catalogue** —
`err.signupDomainNotAllowed` is a static string in all 5 catalogues, and the
signup client path renders it as an *inline form field error*, not a toast.
Decision D-77-6 ("assert the substituted value, e.g. rejected domain") has
nothing to substitute on the signup path; the planner must reconcile this (see
Open Questions).

> **D-77-6 reconciliation (OWNER DECISION, 2026-11-19):** The signup DP-1
> refusal is a static catalogue string with no placeholder. Placeholder parity
> is interpreted as: **assert no raw `{tokens}` remain AND rendered text
> equals the catalogue entry exactly** (D-77-7 full-string equality — the
> strongest available cross-check). D-77-5's "toast" wording adjusts to the
> actual render surface: inline form-field error (`ferr('email')` in
> src/pages/auth.js). Note this in the disposition ledger.

> **e2e env (OWNER DECISION):** Run-wide `ALLOW_SIGNUP_DOMAINS=e2e.local` with
> a Wave-0 dry run to confirm no fixture breakage. No second Playwright config.

"rendered inline error" (or a different refusal path chosen — but D-77-5 locks
signup-only).

**Primary recommendation:** Plan 1 (lint, file-grouped), Plan 2 (advisory fixes
with pins), Plan 3 (locale e2e) per D-77-17; resolve the placeholder-parity
question in plan 3's spec by asserting full-string catalogue equality (which
subsumes "no raw `{token}` tokens" trivially, since there are no tokens).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
D-77-1..D-77-18 are LOCKED — see `77-CONTEXT.md` § Implementation Decisions
(copied there verbatim; not repeated here to avoid drift). Headlines:
- File-grouped lint commits + full suite per group (D-77-1, D-77-18)
- Delete unused code outright, no underscore-prefix; executor verifies zero
  side effects per site (D-77-2)
- no-undef pair via eslint.config.js Node-globals block only, no code changes,
  zero eslint-disable comments (D-77-3)
- Locale e2e: one spec, signup DP-1 refusal × nl/de/es, catalogue-imported
  assertions (D-77-4..7)
- All advisories FIX with regression pins; ledger in `77-REVIEW-DISPOSITION.md`
  (D-77-8..16)
- 3 plans in sequence: lint → advisories → locale e2e (D-77-17)

### the agent's Discretion
- e2e spec file name/placement; helper reuse from `e2e/helpers/setup.mjs`
- Regression-pin test placement per fix (nearest existing suite)
- IN-02 single-source-of-truth mechanism (JS-driven vs shared token)
- Ledger format for `77-REVIEW-DISPOSITION.md`
- Exact commit grouping within a file

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MAINT-01 | eslint clean: 15 sites fixed in code, 2 no-undef files via config, zero eslint-disable | Full 17-site enumeration with file:line and safe-to-delete verdicts (§ Lint Site Enumeration); config block shape verified |
| MAINT-02 | nl/de/es refusal-path rendering in the real app, placeholder parity incl. new DOM refusal keys | selectLanguage helper, signup DP-1 trigger mechanics, catalogue key verification, inline-error rendering path (§ Locale e2e) |
| MAINT-03 | WR-01/WR-02/IN-01..05 (+74-IN-01/02) dispositioned | Exact code anchors for every advisory (§ Advisory Fix Anchors) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Lint fixes (unused vars) | Code (mixed: server.js, src client modules, e2e/test files) | — | Per-file fixes, no tier shift |
| no-undef config | Tooling (eslint.config.js) | — | Config-only, D-77-3 |
| Install-banner advisories | Browser/Client (src/features, src/main.js) | Test (node:test pins) | Pure client UI state |
| sw-contract advisories | Test (node:test) | — | Test-hygiene fixes |
| Locale refusal e2e | Browser/Client (real app via Playwright) | API/Backend (signup DP-1 gate, server.js) | Renders server refusal code via client i18n |

## Standard Stack

### Core
No new packages. Existing, verified live [VERIFIED: package.json:13-16, 35-42]:
- `eslint` ^10.15.0 + `@eslint/js` ^10.0.1 + `globals` ^17.14.0 (lint)
- `@playwright/test` ^1.65.1 (e2e)
- `node --test --test-concurrency=2 test/*.test.mjs` (unit/integration; Node v24.21.0 on this machine, `engines: ">=24"`)

### Commands [VERIFIED: package.json:15-23]
```bash
npm run lint        # eslint .
npm test            # node --test --test-concurrency=2 test/*.test.mjs
npm run e2e         # playwright test --config e2e/playwright.config.mjs
```

## Package Legitimacy Audit

**None — no external packages installed this phase** (zero new dependencies is a
standing project constraint; REQUIREMENTS.md Out of Scope).

## Lint Site Enumeration (MAINT-01)

Live `npx eslint .` output, re-run this session [VERIFIED: live run]. 15
unused-var/useless-assignment sites in 11 files + 2 no-undef files:

### Safe-to-delete verdicts (per D-77-2, executor still re-reads surroundings)

| # | Site | Rule | Verdict |
|---|------|------|---------|
| 1 | `e2e/mobile-card-hidden.spec.mjs:140` `'plain'` assigned never used | no-unused-vars | Delete (spec-local var) |
| 2 | `e2e/subtask-align.spec.mjs:13` `'createAccount'` imported never used | no-unused-vars | Delete from import |
| 3 | `server.js:2628` `WEBHOOK_MAX_ATTEMPTS = 5` | no-unused-vars | Delete — **but note sibling**: the very next line `const WEBHOOK_RETENTION_MS = 604_800_000;` IS used; delete only line 2628 [VERIFIED: server.js:2626-2631] |
| 4 | `src/components/task-list.js:10` `'orderedSiblings'` param never used | no-unused-vars | Remove param |
| 5 | `src/features/subtask-detail.js:8` `TODAY`, `diffD`, `parse` from a destructure/import | no-unused-vars | Delete (3 errors on one line) |
| 6 | `src/overlays/drawer.js:4` `'relDate'` import never used | no-unused-vars | Delete from import |
| 7 | `src/overlays/drawer.js:10` `'avStack'` defined never used | no-unused-vars | Delete |
| 8 | `test/email-outbox.test.mjs:284` `const mem = await makeDigestFixture(...)` assigned never used | no-unused-vars | **Side-effectful initializer — do NOT blind-delete**: `makeDigestFixture(...)` sets up DB state asserted by later lines (before/ledgerBefore read server.dbPath). Fix = `await makeDigestFixture(...)` without assignment [VERIFIED: test/email-outbox.test.mjs:283-292] |
| 9 | `test/mcp.test.mjs:78` `let data = null` reassigned in try, value never used after | no-useless-assignment | Restructure: `data` is parsed inside try then the catch is empty; the assignment at 78 is shadowed by the try-branch assignment. Read lines 74-86 and remove the dead initial assignment or restructure to use `data` [VERIFIED: test/mcp.test.mjs:74-86] |
| 10 | `test/mcp.test.mjs:1067` same pattern in `parCall` | no-useless-assignment | Same treatment [VERIFIED: test/mcp.test.mjs:1063-1071] |
| 11 | `test/pwa-banner.test.mjs:77` `'c'` param never used | no-unused-vars | Remove param |
| 12 | `test/subtask-tree.test.mjs:10` `'login'` import never used | no-unused-vars | Delete from import |
| 13 | `test/visibility-team.test.mjs:77` `let parsed = null` | no-useless-assignment | Same dead-initial pattern as #9/#10: `parsed` reassigned in try and in catch, initial `null` dead [VERIFIED: test/visibility-team.test.mjs:77-83] |
| (14, 15 are the third error on #5's line and the second on #8's grouping — eslint counts 15 site errors total; the 15-error tally matches ROADMAP) |

**Side-effectful cautions (D-77-2 hazard):** sites #8, #9, #10, #13 all involve
assignments whose *right-hand side or try-block may be load-bearing*. #8 is the
clearest case (fixture call must still run). The four `no-useless-assignment`
sites should be fixed by restructuring, never by deleting the try/catch.

### no-undef pair (config-only, D-77-3)

`webhook-formats.js:43` (`'Buffer' is not defined`) and `webhook-ssrf.js:84`
(`'process' is not defined`) [VERIFIED: live eslint output]. Fix in
`eslint.config.js` by adding both files to the existing Node-globals block at
lines 11-17 [VERIFIED: eslint.config.js:11-17]:
```js
files: ['vite.config.js', 'eslint.config.js', 'server.js', 'domains.js', 'mailer.js', 'totp.js', 'oidc.js', 'mcp.js', 'db-adapter.mjs', 'export/**/*.js', 'scripts/**/*.mjs', 'test/**/*.mjs', 'webhook-formats.js', 'webhook-ssrf.js'],
```
Suggested commit shape: config line updated with a comment noting these are
standalone root-level scripts run by node directly (mirrors the existing
comment style at lines 12-14). Zero `eslint-disable` comments anywhere (SC1).

## Advisory Fix Anchors (MAINT-03)

All anchors below read this session from `src/features/install-banner.js`
[VERIFIED: src/features/install-banner.js:1-216] unless noted.

### WR-01 — duplicate CTA string
- Grow span: line 112-113: `const text = flavour === 'ios' ? t('pwa.install.iosHint') : t('pwa.install.cta');` then `el.innerHTML = \`<span class="grow">${esc(text)}</span>\`;`
- Button: line 117: `btn.textContent = t('pwa.install.cta');`
- Fix per D-77-8: new key `pwa.install.hint` (EN+FR in same commit, D-08
  discipline) rendered in the grow-span for the cta flavour; button keeps
  `t('pwa.install.cta')`. Catalogue location: `src/locales/en.json:2009` and
  `fr.json` currently carry `"pwa.install.cta": "Install app"` and
  `"pwa.install.iosHint"` [VERIFIED: src/locales/en.json:2009-2010]. nl/de/es
  carry the same two keys (catalogue parity required — check each file's
  pwa.install block when adding `hint`; all 5 catalogues are the house rule
  per STATE.md "All refusal keys land in all 5 locale catalogues").
- Existing unit test suite: `test/pwa-banner.test.mjs` (pins land here).

### WR-02 — renderStrip/hide module-state races
- Module state: line 31 `let strip = null;`, line 33 `let deferred = null;`
- `hide(el)` lines 89-93: adds `.out`, `setTimeout(() => el.remove(), 160)`,
  `if (strip === el) strip = null;` — the reference is cleared immediately but
  the DOM node lives until the 160 ms timeout fires.
- `renderStrip(flavour)` line 107-152: early return `if (strip) return strip;`
  — no flavour tracking (the fix: track `stripFlavour` alongside `strip`).
- `deferred` cleared in the click handler (lines 120-137) and `onInstalled`
  (184) but never in a give-up-retry path — the retry loops (`onBip` 163-179,
  `checkIos` 201-216) simply stop retrying; if `canShow()` never passes,
  `deferred` is retained. D-77-9: clear `deferred` in the give-up path.
- ~30-line change; regression pins per behavior in `test/pwa-banner.test.mjs`.

### 73-IN-01 — double hide on unexpected-outcome path
Lines 129-136:
```js
try { await ev.userChoice; } catch { hide(el); }
hide(el);
```
The catch calls `hide(el)` and the fall-through calls it again → double `.out`
class + double `setTimeout`. Fix: remove one; pin.

### 73-IN-02 — 160 ms exit constant duplicated CSS↔JS
- JS: `install-banner.js:91` `setTimeout(() => el.remove(), 160);`
- CSS: `src/styles/overlays.css:791` `transition: opacity 160ms ease-out;`
  [VERIFIED: src/styles/overlays.css:791]
- Same 160 pattern exists in `src/ui/toast.js:18`
  `setTimeout(() => el.remove(), 160);` — the codebase's existing convention is
  plain duplication (no shared token anywhere). Discretion (per CONTEXT):
  either a JS-driven value or a shared constant; note fixing toast.js is OUT of
  scope (pinned sites only) but the chosen mechanism should not foreclose it.
- Where the CSS constant lives: the `.out`/hide transition block in
  `src/styles/overlays.css` around line 791.

### 73-IN-03 — silent chunk-load failure
`src/main.js:80-88` [VERIFIED: src/main.js:80-88]:
```js
const bannerMod = () => import('./features/install-banner.js');
addEventListener('beforeinstallprompt', e => {
  e.preventDefault?.();
  bannerMod().then(m => m.onBip(e)).catch(() => {});
});
addEventListener('appinstalled', () => {
  bannerMod().then(m => m.onInstalled()).catch(() => {});
});
bannerMod().then(m => m.checkIos()).catch(() => {});
```
Three `.catch(() => {})` swallow dynamic-import failures. D-77-12: surface the
failure — recorded as a deliberate exception to the house `.catch(() => {})`
convention in the ledger. Suggested shape (discretion): `catch(err => console.warn('install banner chunk failed', err))`. **Caution:** `test/pwa-banner.test.mjs:511` asserts the boot-time call is the exact string
`bannerMod().then(m => m.checkIos())` — changing that line breaks the pin; the
test must be updated in the same commit.

### 73-IN-04 — frame-count retry budget → wall-clock
Lines 166-178 (`onBip`) and 203-215 (`checkIos`): both use `let frames = 0;`
with `if (++frames < 300) requestAnimationFrame(attempt);`. Fix: wall-clock
budget (e.g. deadline = performance.now() + N ms). Pin in
`test/pwa-banner.test.mjs`.

### 73-IN-05 — stale unit-test header comment
`test/pwa-banner.test.mjs:1-27` header still describes the pre-73-03 shape
(e.g. line 21-22 "e2e stub lands in plan 02"). Comment-only update [VERIFIED:
test/pwa-banner.test.mjs:1-27].

### 74-IN-01 — gateIdx anchored to verbatim gate line
`test/sw-contract.test.mjs:139-153` [VERIFIED: test/sw-contract.test.mjs:139-153]:
the verbatim gate-line assertion at line 142 is
`push.includes("if (!('serviceWorker' in navigator) || !api.enabled) return;")`
and lines 146-147 do `const exportIdx = push.indexOf('export const registerSw'); const gateIdx = push.indexOf('!api.enabled');` — the indexOf uses the
first-substring, not the already-asserted full gate line. Fix: anchor gateIdx to
`push.indexOf("if (!('serviceWorker' in navigator) || !api.enabled) return;")`.
Pin: existing test IS the pin; extend it to fail if the full-line anchor misses
(distinct from the verbatim includes assert).

### 74-IN-02 — import.meta.dirname Node floor
`test/sw-contract.test.mjs:42` `const ROOT = path.join(import.meta.dirname, '..');` [VERIFIED: test/sw-contract.test.mjs:42]. `import.meta.dirname` needs
Node ≥ 20.11/21.2 [CITED: 74-REVIEW.md:46-49]; local Node is v24.21.0 and
`engines: ">=24"` [VERIFIED: package.json engines], so the fallback is purely
defensive per D-77-16: `path.dirname(fileURLToPath(import.meta.url))`. Note ~24
other `import.meta.dirname` sites exist repo-wide (test/ + e2e/) — scope is the
pinned file only; the ledger can note the broader surface as an observation.
Pin: suite boots on the fallback path (e.g. a smoke import of the module under
a stubbed/older-Node simulation, or a unit pin asserting the helper's
existence).

## Locale e2e (MAINT-02)

### Existing infrastructure [VERIFIED: e2e/helpers/setup.mjs:107-123]
- `selectLanguage(page, lang)` — selects the option in
  `select[data-in="langSel"]` by label-from-DOM and awaits the real write path
  (PATCH `/api/auth/me`); returns the saved-response promise.
- Spec patterns to follow: `e2e/locale.spec.mjs` (per-account locale fixtures
  via `createAccount(..., { locale })`), `e2e/french-overflow.spec.mjs`.
- All e2e fixture emails are `@e2e.local` [VERIFIED:
  e2e/helpers/setup.mjs:231].
- e2e server wrapper boots the real server on port 4317 with `...process.env`
  passthrough, `ALLOW_SIGNUP: 'true'`, `SEED_DATA: 'false'`, TRUST_PROXY on
  [VERIFIED: e2e/server.mjs:56-78]. **No `ALLOW_SIGNUP_DOMAINS` is set today** —
  so the DP-1 refusal is triggerable by setting `ALLOW_SIGNUP_DOMAINS` in the
  e2e env. Because all specs share one server per run and all fixture emails
  are `@e2e.local`, setting `ALLOW_SIGNUP_DOMAINS=e2e.local` for the whole run
  keeps every existing spec green while making any other domain (e.g.
  `rejected@forbidden.example`) hit DP-1. Note `.env.example:53` documents the
  var (`ALLOW_SIGNUP_DOMAINS=`) [VERIFIED: .env.example:51-54]. The planner
  should decide: env set in the Playwright `webServer` invocation
  (`ALLOW_SIGNUP_DOMAINS=e2e.local npm run e2e`) vs a per-spec config — the
  single shared server makes a run-wide env the only workable option without a
  second config.

### The signup DP-1 refusal surface
- Server gate: `server.js:6766` `if (domainRefusal) return fail(res, 400, 'signupDomainNotAllowed', domainRefusal.message);` inside the
  `/api/auth/signup` POST handler (guard chain comment marks it DP-1, Phase 75,
  DOM-01) [VERIFIED: server.js:6743-6766]; `fail()` returns `{ error: message, code }` [VERIFIED: server.js:4673-4675].
- Client localization: `src/core/api.js:86` `error: data?.code ? tErr(data.code, data, data?.error) : data?.error` — the code maps through the locale
  catalogue [VERIFIED: src/core/api.js:86].
- **Rendering is an inline field error, NOT a toast**: `src/actions/actions.js:4281-4285` sets `S.ui.errors = { email: res.error || t('err.accountCreateFailed') }` and re-renders; the auth page renders it via
  `ferr('email')` inside `<span class="err">` with `aria-describedby="email-err"` at `src/pages/auth.js:90` [VERIFIED: src/pages/auth.js:90,
  src/actions/actions.js:4274-4286]. D-77-5's "localized toast" wording should
  be planned as "rendered inline signup-form error" — same refusal path, same
  keys.
- **No placeholder**: `err.signupDomainNotAllowed` is a static string in all 5
  catalogues [VERIFIED: src/locales/nl.json:339, de.json:339, es.json:339,
  en.json:339, fr.json:340 — quoted verbatim in § Code Examples]. There are
  interpolated error keys elsewhere (e.g. `err.notValidEmail: "{email} isn't a
  valid email address"`) but none on the signup DP-1 path. D-77-6's
  "assert the substituted value" cannot apply here — see Open Questions.
- Catalogue-import cross-check (D-77-7): the spec imports
  `src/locales/{nl,de,es}.json` directly and asserts the rendered error text
  equals the catalogue string. Note: the e2e serves the **built** app
  (`dist/`, with a stale-dist fail-closed guard [VERIFIED:
  e2e/server.mjs:21-54]) — `npm run build` must precede `npm run e2e`, and the
  spec's import of `src/locales/*.json` is fine (it's read at spec-parse time
  in the Node context, not the browser).

### Locale e2e spec shape (recommended, within discretion)
```js
// e2e/locale-refusal.spec.mjs (name at discretion)
import { test, expect } from '@playwright/test';
import { BASE_URL, selectLanguage } from './helpers/setup.mjs';
import nl from '../src/locales/nl.json' with { type: 'json' };
// per locale: sign in, selectLanguage(page, 'nl'), fill the signup form with
// an out-of-list email, submit, expect(page.locator('.err')) toHaveText(
// nl['err.signupDomainNotAllowed'])
```
(Verify the exact form-fill selectors against `src/pages/auth.js` signup
markup during planning; the ids at line 90 are the login fields — signup fields
are nearby in the same file.)

Wave 0 gap: **no locale-refusal e2e spec exists today** — `e2e/locale.spec.mjs`
and `e2e/demo-locale.spec.mjs` cover locale switching, not refusal rendering.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (Node v24.21.0) + @playwright/test ^1.65.1 |
| Config file | none for node:test (glob `test/*.test.mjs`); `e2e/playwright.config.mjs` |
| Quick run command | `npm test` (full unit suite; per-file: `node --test test/pwa-banner.test.mjs`) |
| Full suite command | `npm test` + `npm run lint` + `npm run e2e` (e2e requires fresh `npm run build` first) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MAINT-01 | eslint exits 0 | gate | `npm run lint` | ✅ (gate itself) |
| MAINT-01 | deletions didn't break behavior | regression | `npm test` | ✅ existing suite |
| MAINT-03 | WR-01..IN-05 pins | unit | `node --test test/pwa-banner.test.mjs` | ✅ (pins added) |
| MAINT-03 | 74-IN-01/02 pins | unit | `node --test test/sw-contract.test.mjs` | ✅ (pins added) |
| MAINT-02 | nl/de/es signup refusal rendering | e2e | `npm run e2e -- --grep locale-refusal` (or spec-file arg) | ❌ Wave 0 |

### Sampling Rate
- Per task commit: `npm test` (per D-77-18, full suite after each commit-group)
- Per wave merge: `npm test` + `npm run lint`
- Phase gate: SC1 (`npm run lint` exit 0), SC2 (e2e evidence per locale), SC3
  (ledger complete), SC4 (suite green after every commit-group)

### Wave 0 Gaps
- [ ] `e2e/locale-refusal.spec.mjs` (name at discretion) — covers MAINT-02
- [ ] No framework install needed — both runners exist

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Locale switching in e2e | Custom locale mutation | `selectLanguage(page, lang)` | Awaits the real PATCH write path (D-08); label-from-DOM |
| E2E server lifecycle | Own server boot | `e2e/server.mjs` wrapper via playwright webServer | Stale-dist guard, throwaway data dir, per-IP throttle dodge |
| Locale strings in spec | Duplicated string table | Import `src/locales/*.json` (D-77-7) | Catalogue↔render cross-check, no drift |

## Common Pitfalls

### Pitfall 1: blind-deleting "useless assignment" RHS
The four `no-useless-assignment` sites (#9/#10/#13) and the fixture assignment
(#8) have load-bearing right-hand sides (JSON.parse side effects, DB fixtures).
Deleting the statement kills the setup. Fix by restructuring, and let
`npm test` after each group catch it (D-77-2's stated safety net).

### Pitfall 2: changing the boot line breaks an exact-string pin
`test/pwa-banner.test.mjs:511` asserts `main.includes('bannerMod().then(m => m.checkIos())')` verbatim. Any 73-IN-03 change to `src/main.js` must update
that pin in the same commit or the suite red-herrings.

### Pitfall 3: e2e runs against the built dist
A stale `dist/` fails closed before any test runs (`e2e/server.mjs:21-54`).
Plan 3 must run `npm run build` before `npm run e2e`. Since Plan 2 edits
`src/main.js` / `src/features/install-banner.js`, a dist built before Plan 2 is
stale by design — build at the start of Plan 3, not earlier.

### Pitfall 4: a run-wide ALLOW_SIGNUP_DOMAINS can break sibling specs
The e2e wrapper passes `...process.env` through to a single shared server. Any
value that excludes `@e2e.local` breaks every existing signup fixture. Only
`e2e.local`-inclusive values (or a dedicated second playwright config) are safe.

### Pitfall 5: `tErr` fallback can mask a missing key
If a locale lacked the refusal key, the client falls back to the server's
English message — the e2e's catalogue-equality assertion (D-77-7) is what
catches that; asserting merely "some error text appeared" would not.

## Code Examples

### Catalogue keys (verbatim, for the e2e import assertions)
[VERIFIED: src/locales/nl.json:339] `"err.signupDomainNotAllowed": "Dit e-mailadres valt buiten de domeinen die een account mogen aanmaken",`
[VERIFIED: src/locales/de.json:339] `"err.signupDomainNotAllowed": "Diese E-Mail gehört nicht zu den Domänen, die ein Konto erstellen dürfen",`
[VERIFIED: src/locales/es.json:339] `"err.signupDomainNotAllowed": "Este correo electrónico está fuera de los dominios autorizados para crear una cuenta",`
[VERIFIED: src/locales/en.json:339] `"err.signupDomainNotAllowed": "This email is outside the domains allowed to create an account",`
[VERIFIED: src/locales/fr.json:340] `"err.signupDomainNotAllowed": "Cet e-mail est en dehors des domaines autorisés à créer un compte",`

### eslint.config.js Node-globals block (verbatim)
[VERIFIED: eslint.config.js:11-17]
```js
  {
    /* e2e specs are Node at the module level (the Playwright import and the
       fixture plumbing) and browser inside the test bodies, so they carry
       both environments' globals. */
    files: ['vite.config.js', 'eslint.config.js', 'server.js', 'domains.js', 'mailer.js', 'totp.js', 'oidc.js', 'mcp.js', 'db-adapter.mjs', 'export/**/*.js', 'scripts/**/*.mjs', 'test/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
```

## State of the Art

Not applicable — maintenance phase, no stack changes. One relevant floor:
`import.meta.dirname` requires Node ≥ 20.11/21.2 [CITED:
.planning/milestones/v2.7-phases/74-service-worker-verification-milestone-acceptance/74-REVIEW.md:46-49];
repo pins `engines: ">=24"` so the D-77-16 fallback is defensive only.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The 15-site tally: eslint reports 17 errors total = 15 unused-var/useless-assignment + 2 no-undef, matching ROADMAP; my per-file grouping lists 13 numbered fix sites covering all 15 errors (some lines carry 2-3 errors) | Lint Site Enumeration | Low — planner re-runs `npx eslint .` before task writing (CONTEXT already mandates no re-enumeration, but a re-run is one command) |
| A2 | Setting `ALLOW_SIGNUP_DOMAINS=e2e.local` run-wide keeps all existing e2e specs green (all fixtures use @e2e.local) | Locale e2e | Medium — a sibling spec may sign up with a non-e2e.local email somewhere; verify with a full `ALLOW_SIGNUP_DOMAINS=e2e.local npm run e2e` dry run in Wave 0/plan 3 |
| A3 | Signup form selectors in `src/pages/auth.js` (beyond line 90) can drive a signup submit from the browser; not exhaustively read | Locale e2e | Low — executor reads the file anyway |
| A4 | `tErr` maps error codes to `err.<code>` catalogue keys | Locale e2e | Low — api.js:86 shape verified; tErr definition itself not opened |

## Open Questions (RESOLVED 2026-11-19, owner decisions — implemented in 77-03)

1. **D-77-6 placeholder parity vs. a placeholder-less signup refusal** — RESOLVED: owner accepted the recommendation to interpret D-77-6 as "assert no raw `{token}` tokens + full catalogue-string equality"; no server interpolation payload added. Implemented in 77-03 and noted in `77-REVIEW-DISPOSITION.md`.
2. **Run-wide `ALLOW_SIGNUP_DOMAINS` vs second playwright config** — RESOLVED: owner chose run-wide env (`ALLOW_SIGNUP_DOMAINS=e2e.local`) with a Wave-0 dry run, per A2; no second playwright config. Implemented in 77-03.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | npm test, lint, e2e | ✓ | v24.21.0 (engines >=24) | — |
| eslint + @eslint/js + globals | MAINT-01 | ✓ | ^10.15.0 | — |
| @playwright/test | MAINT-02 | ✓ | ^1.65.1 | — |
| Built `dist/` | e2e | current state unknown at planning time | — | `npm run build` (fail-closed guard enforces it) |
| Playwright browsers | e2e | assumed present (suite runs in CI/recently) | — | `npx playwright install` |

**Missing dependencies with no fallback:** none.

## Security Domain

**No ASVS-relevant changes this phase.** Lint fixes remove dead variables;
advisory fixes touch client-side banner UI state (`install-banner.js`), test
hygiene (`sw-contract.test.mjs`), and the entry's chunk-load error surfacing
(`main.js`) — none touch auth, session, access control, crypto, or input
validation surfaces. The locale e2e *exercises* the DP-1 signup refusal but
adds no production code. Relevant ASVS notes for the record:
- V2 Authentication / V3 Session: untouched.
- V4 Access Control: the DP-1 gate under test already exists (server.js:6766);
  e2e is read-only proof, no mitigation changes.
- V5 Input Validation: untouched (the 73-IN-03 change surfaces import errors —
  ensure the surfaced message never includes raw error internals with user
  data; a static prefix string suffices).

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2/V3/V6 | no | — |
| V4 Access Control | exercised only | existing DP-1 gate, unchanged |
| V5 Input Validation | no | — |

## Sources

### Primary (HIGH confidence)
- Live `npx eslint .` run (2026-11-19) — full 17-error enumeration
- `src/features/install-banner.js` (read 1-216), `src/main.js` (75-94),
  `eslint.config.js` (1-34), `test/sw-contract.test.mjs` (125-164, 42),
  `test/pwa-banner.test.mjs` (1-40), `e2e/helpers/setup.mjs` (105-129, 200-260),
  `e2e/server.mjs` (1-80), `src/core/api.js` (190-209), `src/pages/auth.js` (90),
  `src/actions/actions.js` (4274-4291), `server.js` (2624-2631, 4673-4675,
  6720-6772, 7801-7802), locale JSONs (grep-verified verbatim), `package.json`,
  `.env.example` (51-54)

### Secondary (MEDIUM confidence)
- `.planning/milestones/.../73-REVIEW.md`, `74-REVIEW.md` (advisory source
  findings; anchors independently re-verified in code this session)

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Lint scope: HIGH — live tool output
- Advisory anchors: HIGH — every anchor read this session
- Locale e2e mechanics: HIGH for infrastructure/keys, MEDIUM for the
  ALLOW_SIGNUP_DOMAINS run-wide interaction (A2) and D-77-6 reconciliation
  (Open Question 1)

**Research date:** 2026-11-19
**Valid until:** 2026-12-19 (stable; scope is pinned debt)
