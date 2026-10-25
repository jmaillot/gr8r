---
phase: 08-per-user-locale-the-honest-selector
verified: 2026-10-25T20:10:00Z
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
  - e2e/french-overflow.spec.mjs
  - e2e/locale.spec.mjs
  - server.js
  - src/actions/actions.js
  - src/core/api.js
  - src/core/i18n.js
  - src/core/store.js
  - src/locales/en.json
  - src/locales/fr.json
  - src/main.js
  - src/pages/settings.js
  - test/helpers/server.mjs
  - test/i18n-pages.test.mjs
  - test/locale-account.test.mjs
  - test/locale-negotiate.test.mjs
  - test/migration.test.mjs
  - test/server-boot.test.mjs
covered_digest: "v2:sha256:d0386ddf3808ba5dbef74b220bccc70106cdc0f1db1428062ccdf65b91eb2daf"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 5/5
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 8: Per-user locale & the honest selector — Verification Report

**Phase Goal:** `users.locale` (nullable, via ensureColumn) as the single source of truth for interface language, delivered by `userPayload()`, settable via `PATCH /api/auth/me`, applied pre-render, an honest two-language selector, and `prefs.lang` removed from the shared document pipeline.
**Verified:** 2026-10-25T20:10:00Z
**Status:** passed
**Re-verification:** Yes — round 3 (#4682). Prior round passed 5/5; the only covered-file drift since is commit 54cead4 (server.js `serveFileBinary` zero-byte Range fix + new test in test/upload.test.mjs — the test file is outside this phase's covered set; server.js is covered and is fully re-verified below).

## Goal Achievement

### Re-Verification Summary (Round 3)

Prior round (2026-10-25T18:47Z) passed 5/5. Since then, exactly one commit touched a covered file: **54cead4** ("fix(12): ignore Range on zero-byte files (CR-01 malformed 206 + ERR_OUT_OF_RANGE)"). Drift analysis:

1. **Diff scope**: server.js hunk is confined to `serveFileBinary` (~line 1976-1986) — a `stat.size > 0` guard on the Range header. Zero overlap with any Phase 8 locale code point (users SCHEMA :93, ensureColumn :153, userPayload :258, PATCH handler :1270-1280, LOCALE_CODES :81/:1277, ensureAdmin :826).
2. **All covered files exist** (25/25, verified at current HEAD).
3. **Every server.js locale anchor re-verified at current locations** (table below) — semantics unchanged.
4. **Full gate battery re-run at HEAD by this verifier**: lint clean, prettier clean, `npm test` → **446/446 pass, 0 fail** (prior gate 445/445; the +1 is the new CR-01 zero-byte test in test/upload.test.mjs — additive, outside this phase's covered set, and it passed inside this run).
5. **Fingerprint integrity restored (#4155)**: the prior round's `covered_digest` was hand-rolled and did not match the official computation. This round's digest is copied **verbatim** from `gsd-tools query verification.fingerprint` over the (unchanged) covered_files list; the list itself is emitted in the CLI's sorted order.
6. **Probe debris check**: `src/views/table.js` clean in `git status` before and after the gate run — no i18n-scan debris to restore; working tree contains only unrelated `.planning/` doc changes.

### Observable Truths (roadmap success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Selector switch re-renders immediately, no reload; account language applied before first paint — never flashes English | ✓ VERIFIED | e2e no-reload sentinel (`window.__survived`, e2e/locale.spec.mjs) and no-flash first-paint test exist and are green in the 446/446 gate; main.js:149-154 negotiate+primeLocale runs synchronously before network/render |
| 2 | Selector offers exactly English + Français, no other language anywhere | ✓ VERIFIED | src/pages/settings.js:93-94 langSel options from `availableLocales()` (i18n.js:131, registry LOCALES en :271 / fr :284); server `LOCALE_CODES = ['en','fr']` whitelist gates the PATCH (server.js:81, enforced at :1277); prohibition resolved by human UAT test 11 (pass) |
| 3 | Language belongs to the account: survives sign-out/re-sign-in/other browser; per-user within one workspace | ✓ VERIFIED | PATCH handler (server.js:1270-1280) reads only `body.locale`; userPayload `locale: user.locale ?? null` (server.js:258); `test/locale-account.test.mjs` green in the 446/446 gate (incl. per-workspace isolation); UAT tests 6-8 passed by human; e2e criterion-4 test (reload + workspace switch + second browser) green |
| 4 | Language gone from shared workspace document; change doesn't touch workspace row/revision | ✓ VERIFIED | `DEFAULT_PREFS` (store.js:9-15) has no `lang` key (re-read this round); `stripLegacyLang()` at BOTH merge points (store.js:45, :180); `consumeLegacyLang()` one-time read (store.js:198); workspace-row-invariance assertions green in the gate |
| 5 | Existing install gains column without data loss/backup; second boot byte-identical no-op | ✓ VERIFIED | `ensureColumn(db, 'users', 'locale', 'text')` (server.js:153), SCHEMA `locale text` (server.js:93); `test/migration.test.mjs:181` snapshots users rows incl. locale, first-vs-second-boot compare — green in the gate |

**Score:** 5/5 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `server.js` users SCHEMA + ensureColumn | nullable `locale text`, both install shapes | ✓ VERIFIED | server.js:93, :153 (re-read this round) |
| `server.js` PATCH /api/auth/me | requireUser → sameOrigin → readJson → whitelist → UPDATE → userPayload | ✓ VERIFIED | server.js:1270-1280, LOCALE_CODES check at :1277; 54cead4 did not touch this region (diff confined to ~:1976) |
| `server.js` userPayload() | `locale: user.locale ?? null` | ✓ VERIFIED | server.js:258 |
| `src/core/i18n.js` primeLocale/negotiate/storeLocale/availableLocales | silent prime + subtag clamp | ✓ VERIFIED | i18n.js:87, 94, 131 (setLocale :74); registry en/fr present |
| `src/core/api.js` patchMe | adopts returned user via applyUser | ✓ VERIFIED | api.js:201-203 re-read: `call('PATCH','/api/auth/me',patch)` → `if (r.ok) applyUser(r.data)` |
| `src/core/store.js` legacy capture + strip | raw doc lang captured pre-strip; strip at both merge points | ✓ VERIFIED | store.js:26, 45, 180, 198 |
| `src/main.js` init order | negotiate+prime → api.me → hydrate/seed PATCH → first render | ✓ VERIFIED | main.js:136-137 (seed PATCH), :149-154 (sync negotiate+prime), :63 import |
| `src/actions/actions.js` lifecycle | sign-out falls back to negotiated (demo-mode carve-out per UAT 10); login adopts account locale; IN.langSel handler | ✓ VERIFIED | actions.js:2079 (`primeLocale(api.user?.locale || negotiate())`), :2091 (`(!api.enabled && readStoredLocale()) || negotiate()`), :2229 IN.langSel |
| `src/pages/settings.js` langSel | registry-derived options, negotiated value when NULL | ✓ VERIFIED | settings.js:93-94, :197 |
| `test/locale-account.test.mjs` | five server contracts | ✓ VERIFIED | green in 446/446 gate (this verifier ran `npm test`) |
| `test/locale-negotiate.test.mjs` | negotiation/prime/boot-order | ✓ VERIFIED | green in gate |
| `test/migration.test.mjs` | users rows in snapshot, second-boot no-op | ✓ VERIFIED | :181 includes `locale` column |
| `test/server-boot.test.mjs` | cold-start default + invalid-env negative control | ✓ VERIFIED | green in gate; server.js:826 `admin@example.com` fallback intact |
| `e2e/locale.spec.mjs` | negotiation, no-flash, no-reload, persistence, two-user deliverable | ✓ VERIFIED | 5 tests present incl. criterion-4 (workspace switch + second browser); green in gate |
| `test/i18n-pages.test.mjs` | registry-derived options + agreement test + phantom sweep | ✓ VERIFIED | green in gate |
| `src/locales/*.json` toast.localeSaveFailed | one key pair | ✓ VERIFIED | en.json/fr.json keys present (phantom sweep clean; UAT test 9 pass) |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| PATCH /api/auth/me | users table → userPayload → response | whitelist + UPDATE + select | ✓ WIRED | server.js:1270-1280, :258 |
| selector change | setLocale → gr8r:locale → render ∥ patchMe → users.locale | actions.js:2229, main.js import :63 | ✓ WIRED | i18n.js:74 setLocale; event listener re-renders; PATCH persists |
| registry LOCALES | availableLocales() → selector options | settings.js:94 | ✓ WIRED | i18n.js:131; single source of truth |
| hydrate raw doc prefs.lang | consumeLegacyLang → guard NULL + French label → patchMe({locale:'fr'}) | store.js:198, main.js:136-137 | ✓ WIRED | seed PATCH present; never rewrites workspace row |
| sign-out/in lifecycle | primeLocale(negotiated / account locale) | actions.js:2079, :2091 | ✓ WIRED | login path reads `api.user?.locale || negotiate()`; sign-out demo-mode carve-out is the human-approved UAT-10 semantics |
| ensureAdmin fallback | admin@example.com → emailOk | server.js:826 | ✓ WIRED | server-boot test green both directions |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| settings.js langSel | getLocale() / availableLocales() | i18n singleton + registry (real state) | Yes | ✓ FLOWING |
| userPayload().locale | users.locale | SQLite column (real query) | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full regression incl. locale-account/negotiate/migration/server-boot/i18n-pages | `npm test` (run by this verifier, 2026-10-25 ~20:05, HEAD a2c79c4) | 446 tests / 446 pass / 0 fail (~19s) | ✓ PASS |
| Lint gate | `npm run lint` (this verifier) | clean, exit 0 | ✓ PASS |
| Format gate | `npm run format:check` (this verifier) | "All matched files use Prettier code style!" | ✓ PASS |

### Probe Execution

None declared; no `scripts/*/tests/probe-*.sh` found. SKIPPED. (No probe debris: `src/views/table.js` unmodified in `git status` before the gate run.)

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
| (none) | — | No TBD/FIXME/XXX/TODO markers in any covered file; no stub returns; the only new comment in server.js (54cead4 CR-01 block, :1979-1984) is a rationale comment, not debt | — | — |

### Human Verification Required

None outstanding. The two judgment-tier prohibitions from the initial verification were both resolved by human UAT on 2026-10-24 (08-UAT.md, status `complete`, 11/11 passed):

1. ~~Demo-mode language non-adoption (prohibition, 08-02/LOC-03)~~ → UAT test 10: pass
2. ~~No phantom or untranslated language anywhere (prohibition, 08-03/LOC-02)~~ → UAT test 11: pass

### Gaps Summary

None. Re-verification round 3 confirms the standing verdict against HEAD a2c79c4: the single covered-file drift (54cead4) is a surgically scoped Phase 12 upload fix with zero overlap with any locale code point; all server.js and client anchors re-verified at current locations; the full gate battery (lint, format:check, 446/446 unit suite — including the new CR-01 test) passes cleanly; and the `covered_digest` is now the verbatim output of the official `verification.fingerprint` verb, permanently unstaling the report. Phase goal achieved.

---

_Verified: 2026-10-25T20:10:00Z_
_Verifier: the agent (gsd-verifier)_
