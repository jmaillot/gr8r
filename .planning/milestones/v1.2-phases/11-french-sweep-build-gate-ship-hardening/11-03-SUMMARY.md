---
phase: 11-french-sweep-build-gate-ship-hardening
plan: 03
subsystem: ci-e2e
tags: [docker, ci, playwright, i18n, demo-mode]
requires: [10-02 (locale negotiation exception pattern), 11-02 (build gate)]
provides: [docker-build CI job asserting the served fr chunk, demo-mode e2e proof (demo-locale.spec.mjs + demo.playwright.config.mjs)]
affects: [.github/workflows/ci.yml]
tech-stack:
  added: []
  patterns: [dynamic asset-name resolution from served HTML (never a hardcoded content hash), catalogue-driven test markers via fmt(), design-system enhanced select driven through trigger+listbox]
key-files:
  created:
    - e2e/demo-locale.spec.mjs
    - e2e/demo.playwright.config.mjs
  modified:
    - .github/workflows/ci.yml
decisions:
  - "The demo spec drives the design-system's enhanced select (trigger button + listbox) and reads the 'en' option label from the DOM registry — no transcription of rendered content."
  - "The docker-build job resolves the fr chunk name dynamically from the served page/assets; a fixed French catalogue literal is the proof string."
metrics:
  duration: ~50 min (continuation session; Task 1 completed in a prior session)
  completed: 2026-10-24
  tasks: 2
  commits: 2
  plan_head_before: b80ad554a90f3e43db5a28a9bda83b050dd81b6a
  plan_head_after: 28e049b
status: complete
actuals:
  tokens: 20000
  tasks: 2
  commits: 1
---

# Phase 11 Plan 03: Ship-Artifact French Proof (docker-build CI + demo-mode e2e) Summary

**One-liner:** A `docker-build` CI job builds the image, serves it, resolves the French catalogue chunk dynamically from the served assets and asserts French content; a Chromium e2e proves the server-less demo renders French and that the EN↔FR switch survives a reload through localStorage.

## What Was Done

### Task 1 — docker-build CI job asserting the served French chunk (D-10) ✅ (prior session, commit b80ad55)

Third sibling job in `.github/workflows/ci.yml`: `docker build -t projects:ci .` → throwaway `docker run -d` with inline non-secret `ADMIN_EMAIL`/`ADMIN_PASSWORD` → health-wait on `/api/health` (the image's own HEALTHCHECK target) → fetch `/`, resolve the `fr-*.js` chunk name **dynamically** from the served assets (no hardcoded content hash), fetch the chunk, assert a fixed fr-only catalogue literal via fixed-string search → `docker stop` cleanup. No push, no registry credentials, existing two jobs untouched.

### Task 2 — Demo-mode Chromium proof (D-11) ✅ (commit 11f6a57)

- `e2e/demo.playwright.config.mjs` — mirrors the main config's shape but `webServer.command` is `vite preview --port 4318 --strictPort` (serves `dist/` only; `/api` proxy never applies, so `/api/config` 404s trigger the DEPLOY.md §12 demo fallback), `testMatch` scoped to `demo-locale.spec.mjs`, same graceful-shutdown contract, one worker.
- `e2e/demo-locale.spec.mjs` — two scenarios, each with a **fresh browser context** (localStorage is per-origin and read at boot):
  - **Scenario A:** `locale: 'fr-FR'` context boots the demo with no API; asserts the interface renders French (catalogue-read markers via the `fmt()` pattern — never a hardcoded transcription) and `document.documentElement.lang === 'fr'`.
  - **Scenario B:** fresh context boots in French, navigates Settings → Langue, switches to English through the design-system select, asserts the interface re-rendered in English in place, then **reloads** — the browser re-negotiates fr-FR but the stored choice wins (localStorage `LOCALE_STORAGE_KEY` path, `main.js: readStoredLocale() || negotiated`).

## Verification Results

- `node` shape-check on ci.yml (Task 1, prior session): `ci job shape ok`.
- `npm run build && npx playwright test --config e2e/demo.playwright.config.mjs` → **2 passed** (run three times after environment cleanup; see Deviations).
- `npm run e2e` (main suite) → **24 passed** — the demo files live outside the main testMatch; the en-US pin and single chromium project in the main config are untouched.
- The docker-build job's end-to-end green observation (CI run or local docker build+run) remains a phase-gate item for `/gsd-verify-work`, per the plan's Validation Architecture note.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Spec drove the native `<select>` instead of the enhanced control**
- **Found during:** Task 2 verification
- **Issue:** The design-system select (`src/ui/select.js`) enhances the native `<select>` into a trigger button + role=listbox menu and marks the native control `aria-hidden` with `tabindex=-1`. The plan-level approach of `selectOption` on a `getByRole('combobox')` cannot work against the real UI.
- **Fix:** Drive the real UI like `e2e/locale.spec.mjs` already does — click the `.set-body .select-btn` trigger, read the option label for code `'en'` from the DOM (the locale registry, not a transcription), click `getByRole('option', { name: enLabel })`.
- **Files modified:** e2e/demo-locale.spec.mjs
- **Commit:** 11f6a57

**2. [Rule 3 - Blocking] Stray playwright/vite processes from prior crashed executor sessions corrupted test runs**- **Found during:** Task 2 verification
- **Issue:** Two previous executor sessions ended abnormally with long-running commands in flight. Leftover concurrent playwright runs raced on `test-results/` (ENOENT trace-artifact failures mid-run) and leftover webServers held ports 4317/4318 (`is already used` errors).
- **Fix:** Killed the stray playwright/vite/chrome processes, freed ports, cleaned `test-results/`, and re-ran all verification in the foreground. Final runs: demo suite 2 passed (×2 consecutive), main suite 24 passed.
- **Files modified:** none (environment cleanup only; removed two leftover debug scripts `e2e/.dump-select.mjs`, `e2e/.dbg.mjs` from the crashed sessions)

**3. [Rule 2 - Missing critical functionality] The main suite would have picked up the demo spec with an API behind it**
- **Found during:** Task 2 post-commit hardening (concurrent orchestrator-session edits, verified and committed as 28e049b)
- **Issue:** `e2e/playwright.config.mjs` matched `**/*.spec.mjs`, so the demo spec could run under the API-backed main server — the exact condition the demo proof exists to exclude. Additionally, the demo spec had no self-guard if another config picked it up.
- **Fix:** Main config's `testMatch` now excludes `demo-locale.spec.mjs`; the demo spec gained a `beforeEach` guard probing `/api/config` (skips when a live API answers < 500). Demo suite re-verified green (2 passed) after the change.
- **Files modified:** e2e/playwright.config.mjs, e2e/demo-locale.spec.mjs
- **Commit:** 28e049b

## Known Stubs

None — both tasks ship complete, no placeholder code.

## Notes for the Verifier

- `demoBootedIn()` asserts boot health via `.content` visibility, `document.documentElement.lang`, and the catalogue-driven document title (`nav.route.<route>`); the title poll covers the post-switch in-place re-render (`demoBootedIn(page, 'en', 'settings')`).
- The `[vite] http proxy error: /api/config` lines in the demo run's output are EXPECTED — they are the 404s that trigger the demo fallback; the test asserting on their absence would be wrong.
- Untracked `.planning/` files present in the worktree (10-PATTERNS.md, v1.2-INTEGRATION-CHECK.md, v1.2-MILESTONE-AUDIT.md) predate this plan and belong to other workflows — not touched.

## Self-Check: PASSED

- Files exist: e2e/demo-locale.spec.mjs, e2e/demo.playwright.config.mjs, 11-03-SUMMARY.md.
- Commits exist: b80ad55 (Task 1, prior session), 11f6a57 (Task 2), 28e049b (demo-spec isolation), ff3de60 + 2ee37d3 (docs).
