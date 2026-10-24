---
phase: 10-browser-coverage-in-both-locales
reviewed: 2026-10-24T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - e2e/playwright.config.mjs
  - e2e/helpers/setup.mjs
  - e2e/locale.spec.mjs
  - e2e/server.mjs
  - e2e/flows.spec.mjs
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-10-24
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Phase 10 pins the e2e suite to `en-US` (UAT-09), promotes `createAccount`/`inviteToken` into the shared helper, adds the criterion-4 browser proof, and builds the eight-flow matrix (`e2e/flows.spec.mjs`) in en+fr using catalogue-imported `fmt()` dictionaries. The core engineering is sound: `TRUST_PROXY` is opt-in in `server.js` (verified — default false, so the e2e-only true setting introduces no production exposure), `fmt()` mirrors `i18n.js` plural resolution closely, and the flows spec's catalogue-import pattern makes string drift structurally impossible *for that file*.

The main weakness is asymmetry: `locale.spec.mjs` (also changed in this phase) still asserts raw transcribed strings and duplicates token extraction inline — exactly the two drift/rot failure modes the phase's own conventions were designed to eliminate. The remaining findings are latent-flakiness contracts and minor quality items. No critical issues found; all claims in the three SUMMARYs were independently checked against the source and held up.

## Warnings

### WR-01: locale.spec asserts raw transcribed strings instead of the catalogue-import pattern

**File:** `e2e/locale.spec.mjs:55-58, 93-94, 171, 216-217`
**Issue:** The phase established that asserted strings must be read from `src/locales/en.json`/`fr.json` via `fmt()` so they cannot drift from the catalogue (flows.spec does this by construction). `locale.spec.mjs`, changed in this same phase, still hardcodes transcriptions: the `LOGIN` dictionary (lines 55-58: `'Email'`, `'Se connecter'`, …), `'Bon retour'` / `'Welcome back'` (lines 93, 171), `'Projets'` / `'Projects'` nav labels (lines 109, 192-193, etc.), and the criterion-4 strings `SWITCH = { fr: /Changer d’espace de travail/, en: 'Switch workspace' }` and `switchedToast = { fr: \`Passé à ${secondName}\`, en: \`Switched to ${secondName}\` }` (lines 216-217). I verified `toast.switchedTo` currently matches (`"Switched to {name}"` / `"Passé à {name}"`, en.json:203 / fr.json:204) — but any future rewording of these catalogue keys silently breaks the spec with confusing mismatch errors, or worse, the transcription itself could mask a real catalogue regression the suite was supposed to catch.
**Fix:** Import `en.json`/`fr.json` and build the LOGIN/SWITCH/toast/nav strings via the flows.spec `fmt()` pattern (promote `fmt` to `e2e/helpers/` per 10-02's own "Notes for Plan 10-03" advice, which was not applied to locale.spec). This is the same file the phase touched, so the inconsistency is in-scope.

### WR-02: locale.spec duplicates invite-token extraction inline; failure mode is a garbage token, not an error

**File:** `e2e/locale.spec.mjs:32-33, 48-49`
**Issue:** `url.slice(url.lastIndexOf('/join/') + '/join/'.length)` is written twice inline even though `inviteToken()` was exported from `helpers/setup.mjs` in this very phase for this purpose (10-01's own SUMMARY advertises it to downstream plans). If an invite response ever lacks a `/join/` URL, `lastIndexOf` returns -1, the slice yields an arbitrary 5-char substring, and the subsequent accept call fails with an opaque 404 instead of the helper's explicit `"invite response has no join link"` error.
**Fix:**
```js
const token = inviteToken(String(invite.data.invites[0].url));
```
at both call sites, and drop the inline copies.

### WR-03: Local worker count is unbounded — spec files run in parallel and correctness silently depends on every fixture being run-unique

**File:** `e2e/playwright.config.mjs:12-13`
**Issue:** `workers: process.env.CI ? 1 : undefined` combined with `fullyParallel: false` still parallelizes *across spec files* locally (fullyParallel only serializes within a file). The whole suite is only safe in parallel because every account presents a run-unique `clientIp(run, tag)` and each spec owns its own workspaces — a non-obvious invariant nothing in the config records. Any future spec that touches the seeded `acme` workspace or the shared admin account budget would flake intermittently and only on multi-core dev machines, never in CI (`workers: 1`), making it hard to reproduce.
**Fix:** Either pin `workers: 1` locally too, or document the run-unique-IP/shared-server contract in the config comment so the invariant is discoverable where the parallelism is configured.

### WR-04: flows.spec re-derives workspace names that setup.mjs constructs internally

**File:** `e2e/flows.spec.mjs:164-166` (with `e2e/helpers/setup.mjs:130`)
**Issue:** `createAccount()` internally names the workspace `Locale ${tag} ${run}` (setup.mjs:130) and does not return it. flows.spec then independently re-derives the same convention (`inviteWsName: \`Locale inv-${lang} ${run}\``, `shareWsName`, line 164-166) to assert rendered text. Two copies of a naming convention across files: if the helper's naming changes, FLOW names drift and tests fail with rendered-vs-expected mismatches that point nowhere obvious.
**Fix:** Have `createAccount` return the created workspace (its API response already contains it) or accept an explicit `wsName` option, and have callers consume that instead of re-deriving.

## Info

### IN-01: fmt() plural fallback can crash with an opaque TypeError instead of a clear message

**File:** `e2e/flows.spec.mjs:38-39`
**Issue:** `s = s[category] ?? s.other` — if a plural catalogue value is missing both the selected category and `other`, `s` becomes `undefined` and the subsequent `replaceAll` throws `TypeError: Cannot read properties of undefined` instead of the clear "catalogue key missing" error the helper otherwise guarantees. `i18n.js` resolves this case by returning the key itself (resolvePlural contract, i18n.js:161-168). Edge case only, but it undercuts fmt()'s stated "throws on a missing key" guarantee with a worse failure mode.
**Fix:** After selection, `if (s === undefined) throw new Error(\`plural member unresolvable for ${lang}:${key}\`);` before interpolation.

### IN-02: Machine-value literal `'Can view'` hardcoded in the share assertion

**File:** `e2e/flows.spec.mjs:410`
**Issue:** `await expect(permSelect).toHaveValue('Can view')` asserts a magic English machine value. It is deliberately a machine value (locale-proof, per I18N-07 reasoning), but it is still a string literal duplicated from the app's permission model with no single source of truth.
**Fix:** If the permission values live in a shared constant in the app source, import it; otherwise add a one-line comment naming the app-side source so the literal is traceable.

### IN-03: Signal handler exits 0 even when the child failed

**File:** `e2e/server.mjs:69-84`
**Issue:** In the SIGTERM/SIGINT path, `finish()` always calls `process.exit(0)`, even if the child subsequently exits with a non-zero code after the signal. A server that crashes on shutdown instead of exiting cleanly would be reported as a clean wrapper exit. Minor — Playwright's own test results dominate the run verdict — but the exit code is misleading.
**Fix:** Capture the child's exit code in `finish` and propagate non-zero: `const finish = () => { removeData(); process.exit(child.exitCode || 0); };` (guarding against double-exit races is already handled by `stopping`).

### IN-04: Redundant locale ternary in fmt() plural selection

**File:** `e2e/flows.spec.mjs:38`
**Issue:** `new Intl.PluralRules(lang === 'fr' ? 'fr' : 'en')` — `lang` is already exactly `'fr'` or `'en'` at every call site, so the ternary is a no-op that suggests the function accepts other values than it does.
**Fix:** `new Intl.PluralRules(lang)` (and consider caching one instance per locale, mirroring `rulesFor` in i18n.js).

---

_Reviewed: 2026-10-24_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_