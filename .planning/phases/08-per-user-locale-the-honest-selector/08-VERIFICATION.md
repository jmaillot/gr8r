---
phase: 08-per-user-locale-the-honest-selector
verified: 2026-10-25T18:47:27Z
status: passed
score: 5/5 must-haves verified
covered_files:
  - .planning/phases/08-per-user-locale-the-honest-selector/08-01-PLAN.md
  - .planning/phases/08-per-user-locale-the-honest-selector/08-01-SUMMARY.md
  - .planning/phases/08-per-user-locale-the-honest-selector/08-02-PLAN.md
  - .planning/phases/08-per-user-locale-the-honest-selector/08-02-SUMMARY.md
  - .planning/phases/08-per-user-locale-the-honest-selector/08-03-PLAN.md
  - .planning/phases/08-per-user-locale-the-honest-selector/08-03-SUMMARY.md
  - .planning/phases/08-per-user-locale-the-honest-selector/08-04-PLAN.md
  - .planning/phases/08-per-user-locale-the-honest-selector/08-04-SUMMARY.md
  - server.js
  - src/core/i18n.js
  - src/core/api.js
  - src/core/store.js
  - src/main.js
  - src/actions/actions.js
  - src/pages/settings.js
  - src/locales/en.json
  - src/locales/fr.json
  - test/locale-account.test.mjs
  - test/locale-negotiate.test.mjs
  - test/migration.test.mjs
  - test/server-boot.test.mjs
  - test/i18n-pages.test.mjs
  - test/helpers/server.mjs
  - e2e/locale.spec.mjs
  - e2e/french-overflow.spec.mjs
covered_digest: "v2:sha256:7a73497cd00baace1df41f17c2b740bcc3803a587fd721056188c0c29d0fc544"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 5/5
  gaps_closed:
    - "Judgment-tier prohibition (08-02, LOC-03) — demo-mode language non-adoption: RESOLVED by human, 08-UAT.md test 10 result: pass"
    - "Judgment-tier prohibition (08-03, LOC-02) — no phantom/untranslated language anywhere: RESOLVED by human, 08-UAT.md test 11 result: pass"
  gaps_remaining: []
  regressions: []
---

# Phase 8: Per-user locale & the honest selector — Verification Report

**Phase Goal:** `users.locale` (nullable, via ensureColumn) as the single source of truth for interface language, delivered by `userPayload()`, settable via `PATCH /api/auth/me`, applied pre-render, an honest two-language selector, and `prefs.lang` removed from the shared document pipeline.
**Verified:** 2026-10-25T18:47:27Z
**Status:** passed
**Re-verification:** Yes — stale covered digest after post-phase close-out commits (prettier formatting of test/locale-*.test.mjs, e2e specs, src/core/i18n.js, src/core/api.js — no logic change claimed; verified below)

## Goal Achievement

### Re-Verification Summary

Prior verification (2026-10-24) found all 5 roadmap truths VERIFIED with 2 judgment-tier prohibitions routed to human review (`human_needed`). Since then:

1. **Both prohibitions resolved by a human**: 08-UAT.md (status `complete`, 11/11 passed) includes test 10 (demo-mode language non-adoption — the account's NULL/negotiated rules govern) and test 11 (no phantom/disabled/"coming soon" language rows anywhere), both `result: pass`. The only outstanding item from the prior report is closed.
2. **Formatting-only close-out commits**: `.planning/phases/08-per-user-locale-the-honest-selector/08-REVIEW-DISPOSITION.md` disposition confirms prettier touched `test/locale-*.test.mjs`, e2e specs, `src/core/i18n.js` and `src/core/api.js`. Quick regression of every anchor these files provide: all exports/handlers/imports present and wired, line contents semantically unchanged (see Key Link Verification and Required Artifacts below — re-anchored to current line numbers).
3. **Full regression run by this verifier**: `npm test` → **445/445 pass, 0 fail** (previous gate 431/431; the suite grew with close-out additions, including a new e2e criterion-4 test in e2e/locale.spec.mjs covering workspace-switch and second-browser persistence — additive evidence, no regressions).
4. **Digest regenerated** against the current codebase via `verification.fingerprint`.

### Observable Truths (roadmap success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Selector switch re-renders immediately, no reload; account language applied before first paint — never flashes English | ✓ VERIFIED | e2e: no-reload sentinel test (`window.__survived`, e2e/locale.spec.mjs:122) and no-flash first-paint test (:87) exist and are green in the 445/445 gate; `main.js:151-159` negotiate+primeLocale still runs synchronously before network/render (re-anchored post-format) |
| 2 | Selector offers exactly English + Français, no other language anywhere | ✓ VERIFIED | `src/pages/settings.js:93-94` langSel options from `availableLocales()` (i18n.js:131, registry LOCALES en/fr); server `LOCALE_CODES` whitelist gates the PATCH (server.js:1276, verified in handler read); prohibition resolved by human UAT test 11 (pass) |
| 3 | Language belongs to the account: survives sign-out/re-sign-in/other browser; per-user within one workspace | ✓ VERIFIED | PATCH handler (server.js:1270-1280) reads only `body.locale` (mass-assignment guard comment intact); userPayload `locale: user.locale ?? null` (server.js:258); `test/locale-account.test.mjs` green in the 445/445 gate (incl. per-workspace isolation); UAT tests 6-8 passed by human; new e2e criterion-4 test (reload + workspace switch + second browser) green |
| 4 | Language gone from shared workspace document; change doesn't touch workspace row/revision | ✓ VERIFIED | `DEFAULT_PREFS` (store.js:9) no `lang`; `stripLegacyLang()` at BOTH merge points (store.js:45, :180); `consumeLegacyLang()` one-time read (store.js:198); workspace-row-invariance assertions green in the gate |
| 5 | Existing install gains column without data loss/backup; second boot byte-identical no-op | ✓ VERIFIED | `ensureColumn(db,'users','locale','text')` (server.js:153), SCHEMA `locale text` (server.js:93); `test/migration.test.mjs:181` snapshots users rows incl. locale, first-vs-second-boot compare — green in the gate |

**Score:** 5/5 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `server.js` users SCHEMA + ensureColumn | nullable `locale text`, both install shapes | ✓ VERIFIED | server.js:93, :153 |
| `server.js` PATCH /api/auth/me | requireUser → sameOrigin → readJson → whitelist → UPDATE → userPayload | ✓ VERIFIED | server.js:1270-1280, exact chain present, mass-assignment guard comment intact |
| `server.js` userPayload() | `locale: user.locale ?? null` | ✓ VERIFIED | server.js:258 |
| `src/core/i18n.js` primeLocale/negotiate/storeLocale/availableLocales | silent prime + subtag clamp | ✓ VERIFIED | i18n.js:87, 94, 112, 131 (getLocale :38, setLocale :74) — prettier reformatted, exports intact |
| `src/core/api.js` patchMe | adopts returned user via applyUser | ✓ VERIFIED | api.js:201-203 `async patchMe(patch)` → `if (r.ok) applyUser(r.data)` |
| `src/core/store.js` legacy capture + strip | raw doc lang captured pre-strip; strip at both merge points | ✓ VERIFIED | store.js:26, 45, 175-180, 198-209 |
| `src/main.js` init order | negotiate+prime → api.me → hydrate/seed PATCH → first render | ✓ VERIFIED | main.js:137, 151-159, 188 (patchMe seed path intact) |
| `src/actions/actions.js` lifecycle | sign-out falls back to negotiated; login adopts account locale; IN.langSel handler | ✓ VERIFIED | actions.js:2079 (`primeLocale(api.user?.locale || negotiate())`), :2091, :2229 IN.langSel |
| `src/pages/settings.js` langSel | registry-derived options, negotiated value when NULL | ✓ VERIFIED | settings.js:93-94, :197 |
| `test/locale-account.test.mjs` | five server contracts | ✓ VERIFIED | green in 445/445 gate (this verifier ran `npm test`) |
| `test/locale-negotiate.test.mjs` | negotiation/prime/boot-order | ✓ VERIFIED | green in gate; `globalThis.document` explicit reference confirmed (eslint fix, behavior-neutral) |
| `test/migration.test.mjs` | users rows in snapshot, second-boot no-op | ✓ VERIFIED | :181 includes `locale` column |
| `test/server-boot.test.mjs` | cold-start default + invalid-env negative control | ✓ VERIFIED | green in gate; server.js:826 `admin@example.com` fallback intact |
| `e2e/locale.spec.mjs` | negotiation, no-flash, no-reload, persistence, two-user deliverable | ✓ VERIFIED | 5 tests present incl. new criterion-4 (workspace switch + second browser); green in gate |
| `test/i18n-pages.test.mjs` | registry-derived options + agreement test + phantom sweep | ✓ VERIFIED | green in gate |
| `src/locales/*.json` toast.localeSaveFailed | one key pair | ✓ VERIFIED | en.json/fr.json keys present (phantom sweep clean; UAT test 9 pass) |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| PATCH /api/auth/me | users table → userPayload → response | whitelist + UPDATE + select | ✓ WIRED | server.js:1270-1280, :258 |
| selector change | setLocale → gr8r:locale → render ∥ patchMe → users.locale | actions.js:2229, main.js import :63 | ✓ WIRED | i18n.js:74 setLocale; event listener re-renders; PATCH persists |
| registry LOCALES | availableLocales() → selector options | settings.js:94 | ✓ WIRED | i18n.js:131; single source of truth |
| hydrate raw doc prefs.lang | consumeLegacyLang → guard NULL + French label → patchMe({locale:'fr'}) | store.js:198-209, main.js:137 | ✓ WIRED | seed PATCH present; never rewrites workspace row |
| sign-out/in lifecycle | primeLocale(negotiated / account locale) | actions.js:2079, :2091 | ✓ WIRED | login path still reads `api.user?.locale || negotiate()`, never readStoredLocale (prohibition evidence reinforced) |
| ensureAdmin fallback | admin@example.com → emailOk | server.js:826 | ✓ WIRED | server-boot test green both directions |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| settings.js langSel | getLocale() / availableLocales() | i18n singleton + registry (real state) | Yes | ✓ FLOWING |
| userPayload().locale | users.locale | SQLite column (real query) | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full regression incl. locale-account/negotiate/migration/server-boot/i18n-pages | `npm test` (run by this verifier, 2026-10-25) | 445 tests / 445 pass / 0 fail (~30s) | ✓ PASS |

### Probe Execution

None declared; no `scripts/*/tests/probe-*.sh` found. SKIPPED.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| LOC-01 | 08-03 | Selector switches language immediately, no reload | ✓ SATISFIED | e2e no-reload sentinel test green |
| LOC-02 | 08-03 | Only translated languages (en/fr) offered; others gone | ✓ SATISFIED | registry-derived options; phantom sweep clean; prohibition resolved by human (UAT test 11 pass) |
| LOC-03 | 08-01, 08-02, 08-03 | Per-user account preference, survives sign-out/in/other browser | ✓ SATISFIED | PATCH handler + locale-account tests + e2e lifecycle + UAT tests 6-8 pass |
| LOC-04 | 08-01 | Language removed from shared workspace document | ✓ SATISFIED | DEFAULT_PREFS/strip-at-both-merge-points/docSnapshot verified |
| LOC-05 | 08-01 | Column added without data loss/backup; second boot no-op | ✓ SATISFIED | ensureColumn + migration snapshot test green |
| LOC-06 | 08-02 | Account language applied before first render | ✓ SATISFIED | e2e no-flash MutationObserver test green |

All six requirement IDs (LOC-01..LOC-06) claimed across plans and satisfied; no orphaned requirements (REQUIREMENTS.md maps exactly these six to Phase 8, all marked Complete).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | — | No TBD/FIXME/XXX/TODO markers in any modified file; no stub returns (grep exit 1 across all phase files) | — | — |

### Human Verification Required

None outstanding. The two items from the initial verification were both resolved by human UAT on 2026-10-24 (08-UAT.md, status `complete`, 11/11 passed):

1. ~~Demo-mode language non-adoption (prohibition, 08-02/LOC-03)~~ → UAT test 10: pass
2. ~~No phantom or untranslated language anywhere (prohibition, 08-03/LOC-02)~~ → UAT test 11: pass

### Gaps Summary

None. Re-verification confirms the initial verdict against the current codebase: the prettier close-out changed formatting only (every anchor re-verified at current locations, semantics unchanged), the full 445-test gate passes, the prior cold-start gap (G-08-1) remains fixed, and the two judgment-tier prohibitions carry explicit human sign-off. Phase goal achieved.

---

_Verified: 2026-10-25T18:47:27Z_
_Verifier: the agent (gsd-verifier)_
