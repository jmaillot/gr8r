---
phase: 11-french-sweep-build-gate-ship-hardening
verified: 2026-10-25T19:07:58Z
status: passed
score: 8/8 must-haves verified
behavior_unverified: 0
overrides_applied: 0
covered_files:
  - e2e/french-overflow.spec.mjs
  - test/i18n-scan.test.mjs
  - test/dependencies.test.mjs
  - e2e/demo-locale.spec.mjs
  - e2e/demo.playwright.config.mjs
  - .github/workflows/ci.yml
  - README.md
  - CHANGELOG.md
  - DEPLOY.md
  - package.json
  - src/actions/actions.js
  - src/views/files.js
  - src/locales/en.json
  - src/locales/fr.json
  - test/i18n-core-features.test.mjs
  - .planning/phases/11-french-sweep-build-gate-ship-hardening/11-01-PLAN.md
  - .planning/phases/11-french-sweep-build-gate-ship-hardening/11-01-SUMMARY.md
  - .planning/phases/11-french-sweep-build-gate-ship-hardening/11-02-PLAN.md
  - .planning/phases/11-french-sweep-build-gate-ship-hardening/11-02-SUMMARY.md
  - .planning/phases/11-french-sweep-build-gate-ship-hardening/11-03-PLAN.md
  - .planning/phases/11-french-sweep-build-gate-ship-hardening/11-03-SUMMARY.md
  - .planning/phases/11-french-sweep-build-gate-ship-hardening/11-04-PLAN.md
  - .planning/phases/11-french-sweep-build-gate-ship-hardening/11-04-SUMMARY.md
  - .planning/phases/11-french-sweep-build-gate-ship-hardening/11-UAT.md
covered_digest: "v2:sha256:547f088904c1cef860085725be4c96946c4e32a21e0980abf6a059f411d2343d"
# note: gsd_run verification.fingerprint unavailable in this session (no such tool in
# the tool catalog); digest computed deterministically as sha256 over (path + bytes)
# in the listed order — same method as the prior verification. The list now also
# includes the five impl/test files changed by post-phase close-out commits
# (2a75275 D-16 splice closures: src/actions/actions.js, src/views/files.js,
# src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs).
re_verification:
  previous_status: passed
  previous_score: 8/8
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 11: French sweep, build gate & ship hardening Verification Report

**Phase Goal:** A French sweep over the 21 routes proves no untranslated English string is served, a static scan of the sources fails the build on a new user-visible literal that was never put in a catalogue, and the guarantee holds in the shipped image (build gate in CI).
**Verified:** 2026-10-25
**Status:** passed
**Re-verification:** Yes — digest regeneration per #4682: the previous verification's `covered_digest` went stale after post-phase close-out commits (be0fdf6, 2a75275, 21725f1, d1807be). Regenerated against the CURRENT codebase with fresh evidence at HEAD.

## Goal Achievement

### Observable Truths

| # | Truth (roadmap SC / plan must-have) | Status | Evidence |
|---|-------------------------------------|--------|----------|
| 1 | SC1: sweep over 21 routes in French finds no untranslated English string; French values proven | ✓ VERIFIED | Presence/wiring unchanged: `e2e/french-overflow.spec.mjs` (667 lines), pinned `SWEEP_ROUTES` with 21-length + uniqueness assertions (lines 424-426), catalogue-derived EN set (line 15: `import en from '../src/locales/en.json' with { type: 'json' }`), whole-tree leak scan, French-marker precondition. **Fresh behavior at HEAD:** this session ran the sweep against a freshly built dist/ — `npx playwright test --config e2e/playwright.config.mjs e2e/french-overflow.spec.mjs -g "the 21-route French sweep"` → **1 passed** |
| 2 | SC2: static scan fails the build on a new uncatalogued user-visible literal | ✓ VERIFIED | Fresh run at HEAD: `node scripts/i18n-scan.mjs` → exit 0, **0 literals / 0 pending / 0 unlisted / 0 stale / 0 unresolved / 0 placeholder-mismatch**. `node --test test/i18n-scan.test.mjs` → 25/25 pass (includes the negative control writing an unlisted literal into src/views/table.js and asserting non-zero exit, plus the `[]` allow-list pin + live-tree exit 0). `package.json:10` `prebuild: node scripts/i18n-scan.mjs` — exercised again by this session's `npm run build` (exit 0). Also: the session-injected probe literal in src/views/table.js is confirmed REMOVED (scan reports 0 unlisted; `git status` shows src/ clean) |
| 3 | SC3a: shipped image carries the French catalogue (docker-build CI job) | ✓ VERIFIED | `.github/workflows/ci.yml:46` `docker-build` job present: build → throwaway run → /api/health wait (line 60) → dynamic fr-*.js chunk resolution + French-marker assertion (`'Projets'`, ci.yml:69) → stop on `if: always()`. No hardcoded `fr-<hash>.js`. Behavior proven in UAT test 3 (docker-build CI job green, 11-UAT.md) — regression check this session: job shape + tokens intact, no changes to ci.yml since |
| 4 | SC3b: demo mode without a server is French and can switch language | ✓ VERIFIED | `e2e/demo-locale.spec.mjs` (108 lines, two scenarios, skip-guard when an API sits behind the origin) + `e2e/demo.playwright.config.mjs` (vite preview of dist/, testMatch scoped). **Fresh behavior at HEAD:** both tests run this session → **2 passed** (required the documented precondition: API_ORIGIN pointed at a dead port because the developer's app was live on :8080 — see Notes) |
| 5 | SC3c: application ships with no runtime dependency | ✓ VERIFIED | Fresh: `node --test test/dependencies.test.mjs` → 2/2 pass; `package.json` still has no `dependencies` key and version 1.1.1 (package-lock.json also 1.1.1 — D-14 no-bump holds); Dockerfile runtime stage pinned bare `node:24-alpine` |
| 6 | SC4: documentation states the translated/not-translated boundary | ✓ VERIFIED | `README.md:111` `## Internationalization` present (interface en+fr; demo seed content English; two prototype pages excluded) |
| 7 | SC4: release notes record the milestone, no version bump | ✓ VERIFIED | `CHANGELOG.md:8` `## [Unreleased] — 1.2.0 milestone notes (draft)`; `package.json`/`package-lock.json` both still `1.1.1` |
| 8 | SC4: DEPLOY mentions the docker-build job and the French catalogue in the image | ✓ VERIFIED | `DEPLOY.md` names `docker-build` twice; job name matches `.github/workflows/ci.yml:46` |

**Score:** 8/8 truths verified (0 present-but-behavior-unverified)

### Re-verification Notes (#4682)

- **Why regenerated:** the previous verification (2026-10-24T19:10:00Z) carried a `covered_digest` over files that post-phase close-out commits then changed (DEPLOY.md, CHANGELOG.md, e2e/demo-locale.spec.mjs via prettier, plus the 5 D-16 files which were never in the list). Regenerated over the CURRENT tree — the covered list now includes the close-out impl/test files.
- **Close-out commit 2a75275 verified in detail** (the D-16 hand-off from phase 07, milestone-deferred to the sweep): `toast.moved` direction now interpolated via `t('toast.dirUp'/'toast.dirDown')`; delete-project task count uses plural key `act.deleteProjectTaskCount` (one/other) instead of hand-built `'task(s)'`; remove-member sentences move to `act.removeAccess.losesAccess`/`.unassigns`; fr `modal.guests` becomes `'Les invités'` for a grammatical splice; dropzone `'browse'` literal → `page.files.browse`. All 6 new plain-text keys confirmed present in BOTH locales at HEAD (grep: en.json:69-70,169-170 / fr.json:70-71,170-171); catalogue ledger test updated 1532 → 1538 and green. The last deferred raw-English splice sites are closed — phase 07's D-16 hand-off is fully honored.
- **Environment finding (not a defect):** the demo spec's API-probe skip fired on my first demo run because the developer's server was live on `:8080` — Vite's `preview.proxy` inherits `server.proxy` by default, so `vite preview` proxied `/api` to the live app and `apiPresent` came back true (spec skips by design when an API is behind the origin). Re-ran with `API_ORIGIN` at a dead port per the spec's documented precondition → 2/2 passed. INFO-level: `npm run build && npx playwright test --config e2e/demo.playwright.config.mjs` silently skips (does not fail) whenever anything runs on `localhost:8080` — CI never hits this (no 8080 listener on runners).
- **Full e2e suite:** a full run passed 45/45 earlier today (reported by the orchestrator; not duplicated here — the two behavior-bearing phase specs were re-run individually this session instead).

### Fresh Evidence Matrix (all commands run this session at HEAD = d1807be)

| Check | Command | Result |
|-------|---------|--------|
| Build gate scan | `node scripts/i18n-scan.mjs` | exit 0 — 0 literals / 0 pending / 0 unlisted / 0 stale / 0 unresolved / 0 placeholder-mismatch |
| fr-parity namespaces | `node scripts/fr-parity.mjs toast act page modal` | all 4 exit 0 |
| Unit suite | `npm test` | 445/445 pass, 0 fail |
| Lint | `npm run lint` | exit 0 |
| Format | `npm run format:check` | exit 0 |
| Build (prebuild gate) | `npm run build` | exit 0; fr chunk emitted (fr-BZO9zqA8.js) |
| 21-route sweep on fresh build | `npx playwright test --config e2e/playwright.config.mjs e2e/french-overflow.spec.mjs -g "the 21-route French sweep"` | 1 passed |
| Demo mode (dead API per precondition) | `API_ORIGIN=http://127.0.0.1:59999 npx playwright test --config e2e/demo.playwright.config.mjs` | 2 passed |
| Gate pins | `node --test test/i18n-scan.test.mjs` / `node --test test/dependencies.test.mjs` | 25/25 / 2/2 pass |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `e2e/french-overflow.spec.mjs` | 21-route French leak sweep (D-01..D-06) | ✓ VERIFIED | 667 lines; 21-pin + uniqueness assertions at 424-426; sweep test at 606; run passes on fresh build |
| `test/i18n-scan.test.mjs` | empty-allow-list + exit-0 pins | ✓ VERIFIED | 25/25 pass (re-run this session) |
| `test/dependencies.test.mjs` | zero-runtime-dependency pin | ✓ VERIFIED | 2/2 pass (re-run this session) |
| `.github/workflows/ci.yml` | third `docker-build` job | ✓ VERIFIED | job at line 46; proven green in UAT test 3 |
| `e2e/demo-locale.spec.mjs` | demo French render + persisted switch | ✓ VERIFIED | 2/2 pass (re-run this session, dead-API precondition) |
| `e2e/demo.playwright.config.mjs` | vite-preview demo config | ✓ VERIFIED | vite preview, testMatch scoped to demo spec |
| `README.md` § Internationalization | i18n boundary (D-13) | ✓ VERIFIED | present at line 111 |
| `CHANGELOG.md` 1.2.0 draft notes | release-notes text, no bump (D-14) | ✓ VERIFIED | Unreleased draft heading; version 1.1.1 unchanged |
| `DEPLOY.md` CI/image paragraph | docker-build mention (D-15) | ✓ VERIFIED | job name matches ci.yml |
| `src/locales/en.json` / `fr.json` | 6 D-16 keys in both | ✓ VERIFIED | toast.dirUp/dirDown, act.deleteProjectTaskCount (one/other), act.removeAccess.losesAccess/unassigns, page.files.browse — all present both locales; ledger pin 1538 green |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| e2e/french-overflow.spec.mjs | e2e/helpers/setup.mjs | `createAccount(..., 'sweep', …, locale 'fr')` | WIRED | only fixture path for the sweep; exercised this session (1 passed) |
| e2e/french-overflow.spec.mjs | src/locales/en.json | `import en … with { type: 'json' }` (line 15) | WIRED | catalogue-derived leak set, not a word list |
| test/i18n-scan.test.mjs | scripts/i18n-scan.mjs | exported `main()` called in-process | WIRED | 25/25 pass |
| package.json build | scripts/i18n-scan.mjs | `"prebuild": "node scripts/i18n-scan.mjs"` | WIRED | exercised by this session's `npm run build` (exit 0) |
| .github/workflows/ci.yml docker-build | Dockerfile HEALTHCHECK | /api/health wait before asserting | WIRED | exercised in UAT test 3 |
| e2e/demo.playwright.config.mjs | vite.config.js demo fallback | `vite preview` → /api 404s → demo boot | WIRED | exercised this session (2 passed) |
| DEPLOY.md | .github/workflows/ci.yml | exact job name `docker-build` | WIRED | names match |
| src/actions/actions.js / src/views/files.js | src/locales/*.json | `t()` on all former raw-English splice sites | WIRED | no raw literals remain at the 4 D-16 sites + dropzone (scan: 0 unlisted) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| docker-build assertion | `chunk` text | fetched from the served fr-*.js asset resolved from the running container | yes | ✓ FLOWING |
| sweep leak scan | DOM text nodes / aria-label / data-tip / title | served page of the live app (fresh dist/ + real API) | yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| zero-dependency pin | `node --test test/dependencies.test.mjs` | 2 pass, 0 fail | ✓ PASS |
| build-gate pins (incl. negative control) | `node --test test/i18n-scan.test.mjs` | 25 pass, 0 fail | ✓ PASS |
| full unit suite | `npm test` | 445 pass, 0 fail | ✓ PASS |
| 21-route sweep on fresh build | `npx playwright test --config e2e/playwright.config.mjs … -g "the 21-route French sweep"` | 1 passed (6.0s) | ✓ PASS |
| demo French boot + persisted switch | `npx playwright test --config e2e/demo.playwright.config.mjs` (dead API) | 2 passed | ✓ PASS |
| docker-build CI job green | GitHub Actions run (UAT test 3, committed evidence 11-UAT.md) | pass | ✓ PASS (prior behavioral proof; job shape regression-checked) |

### Probe Execution

Not applicable — no `scripts/*/tests/probe-*.sh` probes declared in this phase's PLANs or SUMMARYs.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| UAT-10 | 11-01, 11-02, 11-03, 11-04 | French sweep over 21 routes proves no untranslated English string served; static scan fails the build on a new uncatalogued literal | SATISFIED | All 8 truths verified with fresh HEAD evidence; REQUIREMENTS.md maps only UAT-10 to Phase 11 — no orphaned requirements. Note: REQUIREMENTS.md line 84 checkbox still reads `[ ]` and the traceability table says "Pending" — cosmetic bookkeeping lag, not a phase gap |

### Anti-Patterns Found

None — no TBD/FIXME/XXX debt markers, no stub returns, no placeholder implementations in the covered files (re-checked this session; the only regex hit is `\uXXXX` inside a spec comment, not a debt marker). No uncommitted changes under src/, e2e/, test/, scripts/, .github/ — the tree is at HEAD plus regenerated `.planning/` verification files.

### Human Verification Required

None — all previously flagged behavior items were closed by UAT (11-UAT.md, 3/3) and the two behavior-bearing specs were additionally re-run green this session on the freshly built bundle.

### Gaps Summary

No gaps. The phase goal — no route serves an untranslated English string, and the guarantee holds in the shipped image — is achieved and re-proven at HEAD after the post-phase close-out commits: the 21-route sweep passes against a freshly built dist/, the server-less demo renders French and persists the language switch, the build-gate scan reports zero literals/pending/unlisted/stale/placeholder-mismatch and exits 0 (wired into `npm run build`), the gate pins pass, the zero-dependency pin holds, docs state the translated/not-translated boundary, and the close-out commit 2a75275 closed the last milestone-deferred raw-English splice sites (6 new catalogue keys in both locales, ledger pin 1538 green) — fully honoring the phase 07 D-16 hand-off.

---

_Verified: 2026-10-25_
_Verifier: the agent (gsd-verifier)_
