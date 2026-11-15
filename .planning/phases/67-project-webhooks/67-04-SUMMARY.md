---
phase: "67"
plan: "04"
subsystem: project-webhooks-ui
tags: [webhooks, settings-ui, i18n, e2e, security-register]
requires: [67-01 (webhook store + SSRF + delivery engine), 67-02 (envelope builders + users.oid), 67-03 (gated routes)]
provides: [Webhooks tab in the unified project settings modal, lazy webhooks UI chunk, 67-SECURITY.md register]
affects: [entry-chunk budget (499,198 B), i18n catalogue lints, data-a identifier ledger]
tech-stack:
  added: []
  patterns: [pre-warmed lazy chunk (65-03/66-02 precedent), split EN label table + FR catalogue namespace]
key-files:
  created:
    - src/overlays/webhooks-settings.js
    - src/overlays/webhooks-labels.json
    - e2e/webhooks.spec.mjs
    - .planning/phases/67-project-webhooks/67-SECURITY.md
  modified:
    - src/locales/en.json
    - src/locales/fr.json
    - src/overlays/modals.js
    - src/actions/actions.js
    - src/main.js
    - test/build-locales.test.mjs
    - test/catalogue.test.mjs
    - test/i18n-plural.test.mjs
    - test/i18n-shell.test.mjs
    - test/i18n-toast.test.mjs
    - test/i18n-core-features.test.mjs
decisions:
  - "Split labels for the entry-chunk gate: EN label twins live in src/overlays/webhooks-labels.json (always shipped); FR twins ride the webhook.* namespace of src/locales/fr.json (stripped from EN-only builds by the locale-subset plugin)"
  - "catalogue.test.mjs / i18n-plural.test.mjs: the webhook.* namespace is a documented fr-only exception, parity enforced by a dedicated build-locales test (31 keys)"
  - "Evicted actions/subtasks.js from the entry chunk to a pre-warmed dynamic import (main.js), freeing the bytes the webhook UI labels cost"
metrics:
  duration: "~2.5 h (resumed session)"
  completed: "2026-11-15"
status: complete
actuals:
  tokens: 24800
  tasks: 3
  commits: 3
plan_head_before: b68a2061d213dc54c1a7ba9eac9feb02dd24106a
plan_head_after: 343a4609f4534f70c1a91db8a390f6b75df9b089
estimate:
  tasks: 3
  tokens: 62000
---

# Phase 67 Plan 04: Webhooks UI + E2E + Security Register Summary

Webhooks management tab (lazy chunk, show-once secret, EN/FR) with a 5-test e2e spec and the phase's consolidated security register — 14 threats, 0 open.

## What was built

- **Task 1 — Webhooks tab** (`feat` commit f66965a): `src/overlays/webhooks-settings.js` is the lazy Webhooks section (list rows with health badge + test-event select + Send test / Edit / Enable-Disable / Delete, create/edit form with https-only URL, 8-event checkboxes, format radios, D-10 show-once secret dialog with Copy/Done). The tab is spread into the project-settings tab bar only for `canManageProject` users (modals.js:364); `A.settingsTab` pre-warms the chunk then `loadHooks()`. Entry chunk after: **499,198 B ≤ 500,000 gate**.
- **Task 2 — e2e** (`test` commit 5ddb9e8): `e2e/webhooks.spec.mjs` — 5 tests, all green: create + show-once secret (secret absent from DOM after dismissal AND after full reload), send-test ok/fail results (route-intercepted, no external network), EN + FR flows, member sees no tab + direct POST 403 (T-67-11).
- **Task 3 — security register** (`docs` commit 343a460): `67-SECURITY.md` in Phase 52 format — T-67-01…T-67-13 + T-67-SC consolidated from the four plan threat models, every mitigation cited to verified file:line of the live tree, threats_open: 0, T-67-13 the single accepted risk.

## Verification

- `npm test`: 1687 tests — 1674 pass, 13 pg-gated skips, **0 fail** (baseline preserved + 1 new parity test)
- `npm run prebuild` (i18n scan): 0 findings
- `node scripts/icons.mjs`: exit 0, icon baseline untouched (key `del`, not `delete`, avoids the lucide-scan false positive)
- `npx playwright test --config e2e/playwright.config.mjs e2e/webhooks.spec.mjs`: 5 passed
- entry chunk: 499,198 B; EN-only build contains zero French webhook bytes

## Deviations from Plan

**[Rule 3 — blocking chunk gate] Split i18n labels (EN table + FR catalogue namespace).**
The entry chunk sat at 499,995 B (5 bytes of headroom); +25 webhook keys to en.json (≈ 1 kB) blew the 500,000 B gate by arithmetic necessity. The plan's must_have (EN+FR catalogue keys AND gate ≤ 500,000) was unsatisfiable as written. Fix: EN label twins live in `src/overlays/webhooks-labels.json` (a flat table shipped in every build — English bytes are legal everywhere); FR twins ride the `webhook.*` namespace of `src/locales/fr.json`, which the vite locale-subset plugin strips from EN-only builds. `wt()` routes FR through `t('webhook.' + key)`. The catalogue/fr-only/subset lints carry the documented `webhook.*` exception; a new parity test in `test/build-locales.test.mjs` (31 keys) replaces the lost automatic parity. Only `modal.settingsTabWebhooks` entered the base EN catalogue (+1, ledger 1940).

**[Rule 3 — blocking chunk gate] `src/main.js`: `actions/subtasks.js` evicted to a pre-warmed dynamic import.**
The +1 catalogue key (~33 B) still exceeded the 5-byte headroom. Applied the house remedy verbatim (61-02/65-03/66-02 precedent, its comment block lives in main.js): `import('./actions/subtasks.js').catch(() => {})`. Frees ~1.5 kB, restoring real headroom (499,198 B). Attempts to evict `actions/archive.js` and `actions/teams.js` were reverted — Vite warns "dynamically imported but also statically imported"; no bytes move.

**[Rule 1 — ledger] data-a identifier ledger 542 → 553** in `test/i18n-shell.test.mjs` / `test/i18n-toast.test.mjs` (+11: whCopy, whSecretDone, whTest, whEdit, whToggle, whDel, whSave, 3× closeModal in the module + 1 in the modals.js branch).

## Auth Gates

None.

## Known Stubs

None — every control is wired to the real 67-03 routes; no placeholder data paths.

## Threat Flags

None — the section's surface (modal forms, gated routes, show-once secret) is fully covered by the register in 67-SECURITY.md.

## Self-Check: PASSED

- FOUND: src/overlays/webhooks-settings.js, src/overlays/webhooks-labels.json, e2e/webhooks.spec.mjs, .planning/phases/67-project-webhooks/67-SECURITY.md
- FOUND: f66965a, 5ddb9e8, 343a460 (git log)
- 3 commits measured from plan_head_before b68a206
