---
phase: 11-french-sweep-build-gate-ship-hardening
verified: 2026-10-24T19:10:00Z
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
  - .planning/phases/11-french-sweep-build-gate-ship-hardening/11-01-PLAN.md
  - .planning/phases/11-french-sweep-build-gate-ship-hardening/11-01-SUMMARY.md
  - .planning/phases/11-french-sweep-build-gate-ship-hardening/11-02-PLAN.md
  - .planning/phases/11-french-sweep-build-gate-ship-hardening/11-02-SUMMARY.md
  - .planning/phases/11-french-sweep-build-gate-ship-hardening/11-03-PLAN.md
  - .planning/phases/11-french-sweep-build-gate-ship-hardening/11-03-SUMMARY.md
  - .planning/phases/11-french-sweep-build-gate-ship-hardening/11-04-PLAN.md
  - .planning/phases/11-french-sweep-build-gate-ship-hardening/11-04-SUMMARY.md
  - .planning/phases/11-french-sweep-build-gate-ship-hardening/11-UAT.md
covered_digest: "v2:sha256:776c4c683783b571791cbdf9ed04c5ad59877efa63d8af7aea934ad3f5237568"
# note: gsd_run verification.fingerprint unavailable in this session; digest computed
# deterministically as sha256 over (path + bytes) in the listed order.
re_verification:
  previous_status: human_needed
  previous_score: 5/8
  gaps_closed:
    - "SC1: the 21-route French sweep passes with zero English-catalogue leaks on the live app (UAT test 1: pass)"
    - "SC3b: demo mode without a server renders French and the EN↔FR switch survives reload (UAT test 2: pass)"
    - "SC3a: the built Docker image serves the French catalogue chunk (UAT test 3: pass, docker-build CI job green)"
  gaps_remaining: []
  regressions: []
---

# Phase 11: French sweep, build gate & ship hardening Verification Report

**Phase Goal:** No route serves an untranslated English string, and the guarantee holds in the shipped image.
**Verified:** 2026-10-24
**Status:** passed
**Re-verification:** Yes — after UAT closure; the previous verification was stale (all phase commits landed after its timestamp) and its 3 behavior-unverified truths are now resolved by human verification (11-UAT.md, 3/3 passed).

## Goal Achievement

### Observable Truths

| # | Truth (roadmap SC / plan must-have) | Status | Evidence |
|---|-------------------------------------|--------|----------|
| 1 | SC1: sweep over 21 routes in French finds no untranslated English string; French values proven | ✓ VERIFIED | Presence/wiring re-confirmed after the stale verification: `e2e/french-overflow.spec.mjs` (667 lines), pinned `SWEEP_ROUTES` with 21-length + uniqueness assertion (lines 425-426), catalogue-derived EN set, TreeWalker whole-tree leak scan, French-marker precondition (`'Projets'`, line 95). **Behavior now proven:** UAT test 1 — single named Playwright run — result: pass |
| 2 | SC2: static scan fails the build on a new uncatalogued user-visible literal | ✓ VERIFIED | Regression check re-run this session: `node --test test/i18n-scan.test.mjs` → 25/25 pass (includes the negative control writing an unlisted literal into src/views/table.js and asserting non-zero exit, and the `[]` allow-list pin + live-tree exit 0). `package.json:10` `prebuild: node scripts/i18n-scan.mjs` wired into `npm run build` (CI build job step) |
| 3 | SC3a: shipped image carries the French catalogue (docker-build CI job) | ✓ VERIFIED | `.github/workflows/ci.yml:46` `docker-build` job present: build → throwaway run → /api/health wait → dynamic fr-*.js chunk resolution → French marker assertion → stop on `if: always()`. **Behavior now proven:** UAT test 3 (docker-build CI job green) — result: pass |
| 4 | SC3b: demo mode without a server is French and can switch language | ✓ VERIFIED | `e2e/demo-locale.spec.mjs` (110 lines, two scenarios) + `e2e/demo.playwright.config.mjs` (vite preview of dist/, no /api proxy). **Behavior now proven:** UAT test 2 — build + demo config Playwright run — result: pass |
| 5 | SC3c: application ships with no runtime dependency | ✓ VERIFIED | Regression check re-run this session: `node --test test/dependencies.test.mjs` → 2/2 pass (no `dependencies` key in package.json — confirmed by grep; Dockerfile runtime stage pinned to bare `node:24-alpine`) |
| 6 | SC4: documentation states the translated/not-translated boundary | ✓ VERIFIED | `README.md:111` § Internationalization present (interface en+fr; demo seed content English; two prototype pages excluded) |
| 7 | SC4: release notes record the milestone, no version bump | ✓ VERIFIED | `CHANGELOG.md:8` `## [Unreleased] — 1.2.0 milestone notes (draft)`; `package.json` version still `"1.1.1"` |
| 8 | SC4: DEPLOY mentions the docker-build job and the French catalogue in the image | ✓ VERIFIED | `DEPLOY.md:679-681` names `docker-build` matching `.github/workflows/ci.yml:46` |

**Score:** 8/8 truths verified (0 present-but-behavior-unverified — the 3 carried from the previous verification are closed by UAT)

### Re-verification Notes

- **Why re-verified:** the previous VERIFICATION.md predates every phase commit (phase work landed 16:17Z–18:45Z; it claimed a 12:00Z verification) and its 3 human-verification items had since been run. Regenerated with a fresh `covered_digest` over the full covered-file list.
- **Regression scope:** previously-verified truths got quick regression checks (existence + wiring greps + the two fast node test files, run once each this session). All held; no regressions.
- **UAT evidence:** `.planning/phases/11-french-sweep-build-gate-ship-hardening/11-UAT.md` — 3/3 passed, 0 issues (committed as d437ee8). It resolves exactly the 3 previously-flagged behavior items (sweep run, demo mode, docker-build CI).

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `e2e/french-overflow.spec.mjs` | 21-route French leak sweep (D-01..D-06) | ✓ VERIFIED | 667 lines; run proven in UAT test 1 |
| `test/i18n-scan.test.mjs` | empty-allow-list + exit-0 pins | ✓ VERIFIED | 25/25 pass (re-run this session) |
| `test/dependencies.test.mjs` | zero-runtime-dependency pin | ✓ VERIFIED | 2/2 pass (re-run this session) |
| `.github/workflows/ci.yml` | third `docker-build` job | ✓ VERIFIED | job present at line 46; proven green in UAT test 3 |
| `e2e/demo-locale.spec.mjs` | demo French render + persisted switch | ✓ VERIFIED | run proven in UAT test 2 |
| `e2e/demo.playwright.config.mjs` | vite-preview demo config | ✓ VERIFIED | vite preview, no /api proxy, scoped testMatch |
| `README.md` § Internationalization | i18n boundary (D-13) | ✓ VERIFIED | present at line 111 |
| `CHANGELOG.md` 1.2.0 draft notes | release-notes text, no bump (D-14) | ✓ VERIFIED | Unreleased draft heading; version 1.1.1 unchanged |
| `DEPLOY.md` CI/image paragraph | docker-build mention (D-15) | ✓ VERIFIED | job name matches ci.yml |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| e2e/french-overflow.spec.mjs | e2e/helpers/setup.mjs | `createAccount(..., 'sweep', …, locale 'fr')` | WIRED | only fixture path for the sweep; exercised in UAT test 1 |
| e2e/french-overflow.spec.mjs | src/locales/en.json | `import en … with { type: 'json' }` | WIRED | catalogue-derived leak set, not a word list |
| test/i18n-scan.test.mjs | scripts/i18n-scan.mjs | exported `main()` called in-process | WIRED | 25/25 pass |
| package.json build | scripts/i18n-scan.mjs | `"prebuild": "node scripts/i18n-scan.mjs"` | WIRED | confirmed at package.json:10 |
| .github/workflows/ci.yml docker-build | Dockerfile HEALTHCHECK | /api/health wait before asserting | WIRED | exercised in UAT test 3 |
| e2e/demo.playwright.config.mjs | vite.config.js demo fallback | `vite preview` (no /api proxy) → demo boot | WIRED | exercised in UAT test 2 |
| DEPLOY.md | .github/workflows/ci.yml | exact job name `docker-build` | WIRED | names match |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| docker-build assertion | `chunk` text | fetched from the served fr-*.js asset resolved from the running container | yes | ✓ FLOWING |
| sweep leak scan | DOM text nodes / aria-label / data-tip / title | served page of the live app | yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| zero-dependency pin | `node --test test/dependencies.test.mjs` | 2 pass, 0 fail | ✓ PASS |
| build-gate pins (incl. negative control) | `node --test test/i18n-scan.test.mjs` | 25 pass, 0 fail | ✓ PASS |
| 21-route sweep on live app | single named Playwright run (UAT test 1) | pass | ✓ PASS (human-verified, 11-UAT.md) |
| demo French boot + persisted switch | build + demo Playwright config (UAT test 2) | pass | ✓ PASS (human-verified, 11-UAT.md) |
| docker-build CI job green | GitHub Actions run (UAT test 3) | pass | ✓ PASS (human-verified, 11-UAT.md) |

### Probe Execution

Not applicable — no `scripts/*/tests/probe-*.sh` probes declared in this phase's PLANs or SUMMARYs.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
| ----------- | ------------ | ----------- | ------ | -------- |
| UAT-10 | 11-01, 11-02, 11-03, 11-04 | French sweep over 21 routes proves no untranslated English string served; static scan fails the build on a new uncatalogued literal | SATISFIED | All 8 truths verified; no orphaned phase-11 requirements — REQUIREMENTS.md maps only UAT-10 to Phase 11 |

### Anti-Patterns Found

None — no TBD/FIXME/XXX debt markers, no stub returns, no placeholder implementations in the covered files (re-checked this session).

### Human Verification Required

None remaining — the 3 items from the previous verification were executed as UAT and all passed (11-UAT.md, 3/3).

### Gaps Summary

No gaps. The phase goal — no route serves an untranslated English string, and the guarantee holds in the shipped image — is achieved and behaviorally proven: the sweep passed on the live app, the built demo is French with a persisted language switch, the docker-build CI job proves the French catalogue in the shipped image, the build gate pins pass, and the docs state the translated/not-translated boundary.

---

_Verified: 2026-10-24_
_Verifier: the agent (gsd-verifier)_