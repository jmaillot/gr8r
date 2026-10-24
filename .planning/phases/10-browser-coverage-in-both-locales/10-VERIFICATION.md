---
phase: 10-browser-coverage-in-both-locales
verified: 2026-10-24T17:12:41+02:00
status: passed
score: 5/5 must-haves verified
covered_files:
  - .planning/phases/10-browser-coverage-in-both-locales/10-01-PLAN.md
  - .planning/phases/10-browser-coverage-in-both-locales/10-01-SUMMARY.md
  - .planning/phases/10-browser-coverage-in-both-locales/10-02-PLAN.md
  - .planning/phases/10-browser-coverage-in-both-locales/10-02-SUMMARY.md
  - .planning/phases/10-browser-coverage-in-both-locales/10-03-PLAN.md
  - .planning/phases/10-browser-coverage-in-both-locales/10-03-SUMMARY.md
  - e2e/flows.spec.mjs
  - e2e/helpers/setup.mjs
  - e2e/locale.spec.mjs
  - e2e/playwright.config.mjs
  - e2e/server.mjs
covered_digest: "v2:sha256:b6aff208ce23e31421a3e0c01cd677dc1b66b1620077385355ae45864bff4488"
behavior_unverified: 0
overrides_applied: 1
overrides:
  - must_have: "UAT-07 — 'Changing the workspace plan is covered by a browser test'"
    reason: "Reinterpreted by user decision of 2026-10-24 (billing-free, phase-7 decision stands): proven as an absence proof — settings renders no plan/billing group and POST /plan stays 404, in both locales. Recorded in flows.spec.mjs describe 'billing-free state (UAT-07 reinterpretation)'."
    accepted_by: "user decision recorded in 10-CONTEXT.md"
    accepted_at: "2026-10-24"
re_verification:
  previous_status: passed
  previous_score: 5/5
  gaps_closed: []
  gaps_remaining: []
  regressions: []
gaps: []
deferred: []
advisory: []
behavior_unverified_items: []
coincidental_reliance_items: []
human_verification: []
---

# Phase 10: Browser coverage in both locales — Verification Report

**Phase Goal:** "The eight untested flows proven in Chromium, in English and in French" — each flow asserts at least one aria-label, data-tip or toast, so translating the interface translates the selector.
**Verified:** 2026-10-24T17:12:41+02:00
**Status:** passed
**Re-verification:** Yes — digest refresh after covered_digest mismatch (stored digest did not match recomputation; no covered file changed on disk). Fresh fingerprint emitted by `gsd_run query verification.fingerprint` written verbatim. Full regression re-run: build + e2e 37 passed (43.5s), 0 failed at HEAD b9b6d1c.

## Goal Achievement

**Decisive behavioral evidence:** `npm run build && npm run e2e` was re-run in this re-verification's own process (webServer `node e2e/server.mjs`, Chromium project) and finished **37 passed (43.5s), 0 failed** at HEAD (b9b6d1c), covering all 8 flows × en/fr, the criterion-4 scenario, tenancy, locale and french-overflow specs.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Full suite green with `use.locale: 'en-US'` pinned in config (UAT-09) | ✓ VERIFIED | `e2e/playwright.config.mjs:22` sets `locale: 'en-US'` with UAT-09/LOC-03 comment; full suite re-run: 37 passed. Pre-existing specs assert the same surface (tenancy, french-overflow untouched — git shows tenancy last modified in phase 1, commit b0dd746) |
| 2 | `createAccount` imported from `e2e/helpers/setup.mjs`, consumed by locale.spec, zero duplicated signup/PATCH logic (D-06) | ✓ VERIFIED | `helpers/setup.mjs:125` exports `createAccount(base, run, tag, name, { locale, workspace })`; `locale.spec.mjs:15` imports and uses it (lines 26–36); no inline signup/PATCH left in locale.spec |
| 3 | `inviteToken` named export of setup.mjs | ✓ VERIFIED | `helpers/setup.mjs:87`; consumed by flows.spec.mjs (lines 109, 159, 324) |
| 4 | Two accounts in one workspace (fr + en) each see own language across reload, workspace switch, and fresh second context (criterion 4, D-04) | ✓ VERIFIED (behavioral) | `locale.spec.mjs:215` criterion-4 test passed in the re-run (11.0s); asserts fr/en after reload, after switcher-driven switch, and in fresh contexts |
| 5 | Workspace switch goes through switcher UI (`button[data-a='switchWs']`) and lands on `/w/{newSlug}` (UAT-06) | ✓ VERIFIED | `locale.spec.mjs` lines ~244–248: `button[data-a='switchWs'][data-v='${secondSlug}']` click + `toHaveURL(/w/${secondSlug})` + switched toast; `flows.spec.mjs:437` switcher describe passed en+fr |

Eight-flow matrix (flows.spec.mjs, all × en + fr, all passed in re-run):

| Flow | UAT | en | fr | Assertions |
|------|-----|----|----|------------|
| onboarding wizard | UAT-01 | ✓ | ✓ | step headings, labels, radio names, landing workspace |
| invite modal | UAT-02 | ✓ | ✓ | heading `modal.inviteTo`, `a11y`/label, `toast.inviteLinkCopied` |
| /join page | UAT-03 | ✓ | ✓ | join heading, form labels, nav route after accept; invalid-token state |
| project share modal | UAT-04 | ✓ | ✓ | `modal.shareTitle`, `a11y.inviteByEmail` label, `toast.sharedWith`, catalogue-driven permission select |
| member removal | UAT-05 | ✓ | ✓ | confirm dialog title, `toast.removed {name}` |
| workspace switcher | UAT-06 | ✓ | ✓ | switcher popover, lands `/w/{newSlug}`, switched toast |
| billing-free state | UAT-07 (reinterpreted) | ✓ | ✓ | no plan/billing group in settings, POST /plan → 404 |
| project creation | UAT-08 | ✓ | ✓ | modal by role/name, fill by label, created project visible (mixed-case accented name) |

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
| ----------- | ----------- | ------ | -------- |
| UAT-01 | 10-02 | ✓ SATISFIED | onboarding wizard describe × en/fr, passed |
| UAT-02 | 10-02 | ✓ SATISFIED | invite modal describe × en/fr, passed |
| UAT-03 | 10-02 | ✓ SATISFIED | /join describe × en/fr + invalid-token, passed |
| UAT-04 | 10-02 | ✓ SATISFIED | share modal describe × en/fr, passed |
| UAT-05 | 10-03 | ✓ SATISFIED | member removal describe × en/fr, passed |
| UAT-06 | 10-01, 10-03 | ✓ SATISFIED | criterion-4 test + switcher describe, passed |
| UAT-07 | 10-03 | ✓ SATISFIED (override: absence proof per user decision 2026-10-24) | billing-free describe × en/fr, passed |
| UAT-08 | 10-03 | ✓ SATISFIED | project creation describe × en/fr, passed |
| UAT-09 | 10-01 | ✓ SATISFIED | config pin + full suite green |

No orphaned requirements: all nine IDs mapped to Phase 10 in REQUIREMENTS.md appear in plan frontmatter.

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| flows.spec.mjs | helpers/setup.mjs | `import { createAccount, inviteToken, ... }` | WIRED | flows.spec.mjs:25; used throughout beforeAll fixtures |
| locale.spec.mjs | helpers/setup.mjs | `import { createAccount, ... }` | WIRED | locale.spec.mjs:15, used at 26–36 |
| criterion-4 second workspace | POST /api/workspaces (apiClient) | beforeAll, never UI | WIRED | created via client.post in locale.spec.mjs beforeAll; UI only proves the switch |
| /join fixture token | POST /api/workspaces/:slug/invites + `inviteToken()` | token extracted from API-created invite, accept in browser | WIRED | flows.spec.mjs:323–324, browser accept at 337–347 |
| catalogue assertions | src/locales/en.json / fr.json | direct JSON imports, `fmt()` throws on missing key | WIRED | flows.spec.mjs:13–14 — transcription drift impossible by construction |

### Data-Flow Trace (Level 4)

Not applicable to rendered app data — this phase's artifacts are tests; their "data flow" is the fixture chain (API client → real server → browser contexts), traced above. No static/hollow fixtures found: every fixture is created through the real API (`createAccount`, `must()`-checked calls), the only in-browser fixture paths are the signup and /join accept, which are the proofs themselves (prohibition honored).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full 8-flow × 2-locale matrix + criterion 4 + pre-existing specs | `npm run e2e` (Chromium, own webServer) | 37 passed (1.0m), 0 failed | ✓ PASS |

### Probe Execution

No phase-declared probe scripts (`scripts/*/tests/probe-*.sh` do not exist; not a migration/tooling phase). The e2e suite itself is the runnable proof, executed above.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| e2e/flows.spec.mjs | ~513 | `.modal-wrap .modal` locator | ℹ️ Info | Used only as presence/box-math check for the app's own confirm dialog, per plan prohibition (product claim via heading `d.title`) — allowed by plan |
| e2e/flows.spec.mjs | — | `'Can view'` machine-value literal in share assertion | ℹ️ Info | Review finding IN-02, disposition recorded as open/advisory in 10-REVIEW-DISPOSITION.md |

No TBD/FIXME/XXX debt markers in any phase-modified file. Review findings (0 critical / 4 warnings / 4 info) are recorded with dispositions in 10-REVIEW-DISPOSITION.md and are advisory, non-blocking.

### Human Verification Required

None. All truths had behavioral evidence: the full suite was executed in this verification process and every flow passed in both locales.

### Gaps Summary

None. The eight-flow matrix exists in `e2e/flows.spec.mjs` (8 describes × en/fr), every assertion is catalogue-backed (en.json/fr.json imported directly, so translating the interface translates the selector — the goal's selector-translation property holds by construction), the criterion-4 scenario is in `e2e/locale.spec.mjs`, and the suite was proven green (37/37) at HEAD in this verification's own run. User decisions from 10-CONTEXT.md honored: D-02 (account locale drives language, not browser locale), D-04 (API fixtures, UI proves the switch), D-06 (shared helper promotion), and the 2026-10-24 UAT-07 billing-free reinterpretation.

---

_Verified: 2026-10-24T17:12:41+02:00_
_Verifier: the agent (gsd-verifier)_