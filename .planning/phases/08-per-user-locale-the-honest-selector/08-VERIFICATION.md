---
phase: 08-per-user-locale-the-honest-selector
verified: 2026-10-24T12:00:00Z
status: human_needed
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
covered_digest: "v2:sha256:87403e19df5099f040ab5db597874baafd08ee23cec321b868ad14476a5e24a5"
behavior_unverified: 0
overrides_applied: 0
unverified-prohibition: human review recommended — 2 judgment-tier prohibitions auto-judged (see human_verification)
human_verification:
  - test: "Prohibition (08-02, LOC-03): sign in with a real account while demo mode carries a stored localStorage language; confirm the account locale rules (NULL → negotiated, non-NULL → account value) govern, not the demo choice."
    expected: "The account's own NULL/negotiated rules decide the rendered language; the demo choice stays browser-local to demo mode."
    why_human: "Judgment-tier prohibition; code evidence is strong (login path reads api.user?.locale || negotiate(), never readStoredLocale) but the verdict is a non-authoritative LLM judge."
  - test: "Prohibition (08-03, LOC-02): scan every rendered surface (Settings, all pages) and confirm no untranslated/phantom language, no disabled option rows, no 'coming soon' entries."
    expected: "Only 'English' and 'Français' appear anywhere in the interface."
    why_human: "Judgment-tier prohibition; the agreement test + src/-wide sweep cover static strings, but a runtime-dynamically-built label would evade both."
---

# Phase 8: Per-user locale & the honest selector — Verification Report

**Phase Goal:** `users.locale` (nullable, via ensureColumn) as the single source of truth for interface language, delivered by `userPayload()`, settable via `PATCH /api/auth/me`, applied pre-render, an honest two-language selector, and `prefs.lang` removed from the shared document pipeline.
**Verified:** 2026-10-24T12:00:00Z
**Status:** human_needed (2 judgment-tier prohibitions pending human review — all 5 success criteria verified)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (roadmap success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Selector switch re-renders immediately, no reload; account language applied before first paint — never flashes English | ✓ VERIFIED | e2e/locale.spec.mjs 4/4 pass (run by this verifier, 11.4s): `window.__survived` no-reload sentinel survives the switch (line 122 test), MutationObserver no-flash first-paint proof (line 87 test); `main.js:148-149` negotiate+primeLocale runs synchronously before any network call/render |
| 2 | Selector offers exactly English + Français, no other language anywhere | ✓ VERIFIED | `src/pages/settings.js:93-94` langSel options from `availableLocales()` (registry-derived, i18n.js LOCALES = en/fr); server `LOCALE_CODES = ['en','fr']` (server.js:77) whitelist; grep for Deutsch/Español/Italiano/Português/"coming soon" over src/ outside locales = 0 hits |
| 3 | Language belongs to the account: survives sign-out/re-sign-in/other browser; per-user within one workspace | ✓ VERIFIED | `PATCH /api/auth/me` writes `users.locale` (server.js:1265-1277); `test/locale-account.test.mjs` 8/8 pass (run by this verifier) incl. two accounts in one workspace with distinct locales; e2e test 4 "two members… own language" passed; e2e test 3 covers sign-out fallback → sign-in adoption → reload persistence |
| 4 | Language gone from shared workspace document; change doesn't touch workspace row/revision | ✓ VERIFIED | `DEFAULT_PREFS` (store.js:9-17) has no `lang`; `stripLegacyLang()` strips at BOTH merge points (store.js:45 load, :180 applyDoc) so `docSnapshot()` (store.js:102) can never write it back; `consumeLegacyLang()` (store.js:198) is the one-time read; locale-account test asserts the workspaces row stays byte-identical (same doc/revision/updated_at) after a locale change (suite 8/8 pass) |
| 5 | Existing install gains column without data loss/backup; second boot byte-identical no-op | ✓ VERIFIED | `ensureColumn(db,'users','locale','text')` (server.js:148), SCHEMA carries `locale text` (server.js:89); `test/migration.test.mjs:179` snapshot() includes users rows (id, email, locale) and compares first vs second boot (lines 184-189) — passed in the phase regression gate (npm test 431/431); no boot-time locale write exists in server.js (only the PATCH handler writes locale) |

**Score:** 5/5 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `server.js` users SCHEMA + ensureColumn | nullable `locale text`, both install shapes | ✓ VERIFIED | server.js:89, :148 |
| `server.js` PATCH /api/auth/me | requireUser → sameOrigin → readJson → whitelist → UPDATE → userPayload | ✓ VERIFIED | server.js:1265-1277, exact chain present; mass-assignment guard comment |
| `server.js` userPayload() | `locale: user.locale ?? null` | ✓ VERIFIED | server.js:253 |
| `src/core/i18n.js` primeLocale/negotiate/storeLocale/availableLocales | silent prime + subtag clamp | ✓ VERIFIED | i18n.js:63, 87, 94, 110, 118, 129 |
| `src/core/api.js` patchMe | adopts returned user via applyUser | ✓ VERIFIED | api.js:193-195 |
| `src/core/store.js` legacy capture + strip | raw doc lang captured pre-strip; strip at both merge points | ✓ VERIFIED | store.js:26-29, 45, 180, 198-209 |
| `src/main.js` init order | negotiate+prime → api.me → hydrate/seed PATCH → first render | ✓ VERIFIED | main.js:126-218 (patchMe seed at :131) |
| `src/actions/actions.js` lifecycle | sign-out falls back to negotiated; login adopts account locale; IN.langSel handler | ✓ VERIFIED | actions.js:2056, 2068, 2206-2210 |
| `src/pages/settings.js` langSel | registry-derived options, negotiated value when NULL | ✓ VERIFIED | settings.js:93-94, 197 |
| `test/locale-account.test.mjs` | five server contracts | ✓ VERIFIED | 8/8 pass (this verifier ran it) |
| `test/locale-negotiate.test.mjs` | negotiation/prime/boot-order | ✓ VERIFIED | exists; included in 431/431 regression gate |
| `test/migration.test.mjs` | users rows in snapshot, second-boot no-op | ✓ VERIFIED | :179, :184-189 |
| `test/server-boot.test.mjs` | cold-start default + invalid-env negative control | ✓ VERIFIED | 4/4 pass (this verifier ran it); server.js:821 `admin@example.com` |
| `e2e/locale.spec.mjs` | negotiation, no-flash, no-reload, persistence, two-user deliverable | ✓ VERIFIED | 4/4 pass (this verifier ran it) |
| `test/i18n-pages.test.mjs` | registry-derived options + agreement test + phantom sweep | ✓ VERIFIED | in 431/431 gate; grep confirms no phantom labels |
| `src/locales/*.json` toast.localeSaveFailed | one key pair | ✓ VERIFIED | en.json:217, fr.json:218 |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| PATCH /api/auth/me | users table → userPayload → response | whitelist + UPDATE + select | ✓ WIRED | server.js:1265-1277, :253 |
| selector change | setLocale → gr8r:locale → render ∥ patchMe → users.locale | actions.js:2206-2210, main.js:68 | ✓ WIRED | event listener re-renders; PATCH persists |
| registry LOCALES | availableLocales() → selector options | settings.js:94 | ✓ WIRED | single source of truth |
| hydrate raw doc prefs.lang | consumeLegacyLang → guard NULL + French label → patchMe({locale:'fr'}) | store.js:198-209, main.js:126-132 | ✓ WIRED | seed PATCH present; never rewrites workspace row |
| sign-out/in lifecycle | primeLocale(negotiated / account locale) | actions.js:2056, 2068 | ✓ WIRED | every path ends in the render that follows |
| ensureAdmin fallback | admin@example.com → emailOk | server.js:821 | ✓ WIRED | server-boot test proves both directions |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| settings.js langSel | getLocale() / availableLocales() | i18n singleton + registry (real state) | Yes | ✓ FLOWING |
| userPayload().locale | users.locale | SQLite column (real query) | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Cold start with defaults boots; invalid ADMIN_EMAIL fails fast | `node --test test/server-boot.test.mjs` | 4 pass / 0 fail | ✓ PASS |
| PATCH round-trip, workspace-row invariance, per-user isolation | `node --test test/locale-account.test.mjs` | 8 pass / 0 fail | ✓ PASS |
| e2e: no-flash first paint, no-reload switch, persistence, two-user deliverable | `npx playwright test e2e/locale.spec.mjs` | 4 pass (11.4s) | ✓ PASS |
| Full regression | `npm test` (orchestrator-run gate) | 431/431 pass | ✓ PASS |

### Probe Execution

None declared; no `scripts/*/tests/probe-*.sh` found. SKIPPED.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| LOC-01 | 08-03 | Selector switches language immediately, no reload | ✓ SATISFIED | e2e no-reload sentinel test passed |
| LOC-02 | 08-03 | Only translated languages (en/fr) offered; others gone | ✓ SATISFIED | registry-derived options; phantom grep = 0 |
| LOC-03 | 08-01, 08-02, 08-03 | Per-user account preference, survives sign-out/in/other browser | ✓ SATISFIED | PATCH handler + locale-account tests + e2e lifecycle |
| LOC-04 | 08-01 | Language removed from shared workspace document | ✓ SATISFIED | DEFAULT_PREFS/strip-at-both-merge-points/docSnapshot verified |
| LOC-05 | 08-01 | Column added without data loss/backup; second boot no-op | ✓ SATISFIED | ensureColumn + migration snapshot test |
| LOC-06 | 08-02 | Account language applied before first render | ✓ SATISFIED | e2e MutationObserver no-flash test passed |

All six requirement IDs (LOC-01..LOC-06) claimed across plans and satisfied; no orphaned requirements (REQUIREMENTS.md maps exactly these six to Phase 8).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | — | No TBD/FIXME/XXX/TODO markers in any modified file; no stub returns | — | — |

### Human Verification Required

See `human_verification` frontmatter: the phase's two judgment-tier prohibitions (demo-mode language non-adoption; no phantom/untranslated language anywhere) received non-authoritative code-evidence-based verdicts and need explicit human sign-off. Everything else is machine-verified.

### Gaps Summary

None. All five roadmap success criteria verified against the actual codebase and exercised by passing behavioral tests, including a fresh 4/4 e2e run performed by this verifier. The only outstanding items are the two judgment-tier prohibitions routed to human review (never a silent pass), which do not block goal achievement.

---

_Verified: 2026-10-24T12:00:00Z_
_Verifier: the agent (gsd-verifier)_
