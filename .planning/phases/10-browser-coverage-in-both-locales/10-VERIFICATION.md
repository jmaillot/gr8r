---
phase: 10-browser-coverage-in-both-locales
verified: 2026-10-25T19:53:25+01:00
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
covered_digest: "v2:sha256:95782fee704332dac38e7c14e4c20418f8bde5e48032a522826986e04fce974d"
behavior_unverified: 0
overrides_applied: 1
overrides:
  - must_have: "UAT-07 — 'Changing the workspace plan is covered by a browser test'"
    reason: "Reinterpreted by user decision of 2026-10-24 (billing-free, phase-7 decision stands): proven as an absence proof — settings renders no plan/billing group and POST /plan stays 404, in both locales. Recorded in flows.spec.mjs describe 'billing-free state (UAT-07 reinterpretation)'. Carried forward unchanged."
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

**Phase Goal:** "The whole app journey is covered by browser tests in BOTH locales — the existing Chromium e2e suite is locale-aware: fixtures negotiate a per-account locale, English-pinned suites keep asserting what they assert today, and French journeys are covered by French-pinned specs."
**Verified:** 2026-10-25T19:53:25+01:00
**Status:** passed
**Re-verification:** Yes — #4682 stale covered digest after post-phase close-out commits. Close-out commits `be0fdf6` (unused imports + unused loop variable dropped from e2e/locale.spec.mjs — no scenario changed) and `21725f1` (prettier over e2e specs/helpers) touched covered files; phase 11/12 commits also extended flows.spec.mjs, french-overflow.spec.mjs, locale.spec.mjs, playwright.config.mjs and server.mjs. Fresh digest recomputed against the CURRENT codebase and written verbatim. All truths re-checked with fresh behavioral evidence.

## Goal Achievement

**Decisive behavioral evidence:** the full e2e suite this phase demands was re-run in this re-verification's own process (`npx playwright test --config e2e/playwright.config.mjs`, Chromium project, webServer `node e2e/server.mjs`) and finished **45 passed (1.6m), 0 failed** on the current tree — the eight-flow matrix × en/fr (16 tests), the criterion-4 scenario, tenancy, locale, french-overflow, plus the phase 11/12 additions. The behavior-dependent criterion-4 truth was additionally confirmed with a single named run: `E2E_PORT=4319 npx playwright test -g "criterion 4"` → **1 passed (14.9s)** (isolated E2E_PORT because a concurrent session occupied 4317).

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Full suite green with `use.locale: 'en-US'` pinned in config (UAT-09) | ✓ VERIFIED | `e2e/playwright.config.mjs:26` sets `locale: 'en-US'` with the UAT-09/LOC-03 comment (negotiated default; account locale wins via PATCH /api/auth/me); full suite re-run: 45 passed, 0 failed — pre-existing specs (tenancy, french-overflow) still assert their same surface |
| 2 | `createAccount` imported from `e2e/helpers/setup.mjs`, consumed by locale.spec, zero duplicated signup/PATCH logic (D-06) | ✓ VERIFIED | `helpers/setup.mjs` exports `createAccount`; `locale.spec.mjs:15` imports `{ BASE_URL, createAccount, newRunId }` (lint-clean import set after be0fdf6) and uses it at lines 26/28/36; no inline signup/PATCH in the spec |
| 3 | `inviteToken` named export of setup.mjs | ✓ VERIFIED | `helpers/setup.mjs:87` `export function inviteToken(url)`; consumed by flows.spec.mjs |
| 4 | Two accounts in one workspace (fr + en) each see own language across reload, workspace switch, and fresh second context (criterion 4, D-04) | ✓ VERIFIED (behavioral) | `locale.spec.mjs:217` criterion-4 test — passed twice in this re-verification: in the full 45/45 run and in the isolated named run (1 passed, 14.9s). be0fdf6's change was cosmetic only: the unused `form` binding was dropped from the loop destructure; the SWITCH click, `button[data-a='switchWs'][data-v=…]` click, `/w/{secondSlug}` URL and switched-toast assertions are byte-identical in behavior |
| 5 | Workspace switch goes through switcher UI (`button[data-a='switchWs']`) and lands on `/w/{newSlug}` (UAT-06) | ✓ VERIFIED | criterion-4 named run exercised exactly this: `button[data-a='switchWs'][data-v='${secondSlug}']` click → `toHaveURL(/w/${secondSlug})` + switched toast; `flows.spec.mjs` 'workspace switcher' describe (line ~492) passed en+fr in the full run |

Eight-flow matrix (flows.spec.mjs, all × en + fr, all passed in the 45/45 re-run):

| Flow | UAT | en | fr | Assertions |
|------|-----|----|----|------------|
| onboarding wizard | UAT-01 | ✓ | ✓ | step headings, labels, radio names, landing workspace |
| invite modal | UAT-02 | ✓ | ✓ | heading `modal.inviteTo`, aria-label, `toast.inviteLinkCopied` |
| /join page | UAT-03 | ✓ | ✓ | join heading, form labels, nav route after accept; invalid-token state |
| project share modal | UAT-04 | ✓ | ✓ | `modal.shareTitle`, `a11y.inviteByEmail` label, `toast.sharedWith`, catalogue-driven permission select |
| member removal | UAT-05 | ✓ | ✓ | confirm dialog title, `toast.removed {name}` |
| workspace switcher | UAT-06 | ✓ | ✓ | switcher popover, lands `/w/{newSlug}`, switched toast |
| billing-free state | UAT-07 (reinterpreted) | ✓ | ✓ | no plan/billing group in settings, POST /plan → 404 |
| project creation | UAT-08 | ✓ | ✓ | modal by role/name, fill by label, created project visible (mixed-case accented name) |

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
| ----------- | ----------- | ------ | -------- |
| UAT-01 | 10-02 | ✓ SATISFIED | onboarding wizard describe × en/fr, passed in re-run |
| UAT-02 | 10-02 | ✓ SATISFIED | invite modal describe × en/fr, passed in re-run |
| UAT-03 | 10-02 | ✓ SATISFIED | /join describe × en/fr + invalid-token, passed in re-run |
| UAT-04 | 10-02 | ✓ SATISFIED | share modal describe × en/fr, passed in re-run |
| UAT-05 | 10-03 | ✓ SATISFIED | member removal describe × en/fr, passed in re-run |
| UAT-06 | 10-01, 10-03 | ✓ SATISFIED | criterion-4 named run + switcher describe, passed |
| UAT-07 | 10-03 | ✓ SATISFIED (override: absence proof per user decision 2026-10-24, carried forward) | billing-free describe × en/fr, passed in re-run |
| UAT-08 | 10-03 | ✓ SATISFIED | project creation describe × en/fr, passed in re-run |
| UAT-09 | 10-01 | ✓ SATISFIED | config pin intact at line 26 + full suite green (45/45) |

No orphaned requirements: all nine IDs mapped to Phase 10 in REQUIREMENTS.md (lines 154–162) appear in plan frontmatter; all plan-declared IDs map to REQUIREMENTS.md entries.

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| flows.spec.mjs | helpers/setup.mjs | `import { createAccount, inviteToken, ... }` | WIRED | flows.spec.mjs import block; used in beforeAll fixtures |
| locale.spec.mjs | helpers/setup.mjs | `import { BASE_URL, createAccount, newRunId }` | WIRED | locale.spec.mjs:15 (lint-cleaned by be0fdf6), used at 26–36 |
| criterion-4 second workspace | POST /api/workspaces (apiClient) | beforeAll, never UI | WIRED | created via API client in locale.spec beforeAll; UI only proves the switch (D-04) |
| /join fixture token | POST /api/workspaces/:slug/invites + `inviteToken()` | token from API-created invite, accepted in browser | WIRED | flows.spec.mjs /join describe, passed en+fr |
| catalogue assertions | src/locales/en.json / fr.json | direct JSON imports, `fmt()` throws on missing key | WIRED | flows.spec.mjs imports both catalogues — transcription drift impossible by construction |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full 8-flow × 2-locale matrix + criterion 4 + pre-existing specs + phase 11/12 specs | `npx playwright test --config e2e/playwright.config.mjs` (Chromium, own webServer) | 45 passed (1.6m), 0 failed | ✓ PASS |
| Criterion-4 single named test (reload + UI switch + second context, D-04/UAT-06) | `E2E_PORT=4319 npx playwright test -g "criterion 4"` | 1 passed (14.9s) | ✓ PASS |

### Probe Execution

No phase-declared probe scripts (`scripts/*/tests/probe-*.sh` do not exist; not a migration/tooling phase). The e2e suite itself is the runnable proof, executed above.

### Verification Integrity Notes (concurrent-session observation)

A concurrent session is active in this checkout (it re-verified phase 08 and, moments into this run, injected an uncommitted probe literal into `src/views/table.js`, making `npm run build`'s i18n-scan gate fail in the dirty working tree). This is NOT a phase-10 finding: `src/views/table.js` is not a phase-10 covered file, the change is uncommitted, and a detached-worktree scan of pure HEAD (`git worktree add /tmp/... HEAD; node scripts/i18n-scan.mjs`) passes with **0 violations**. The digest algorithm was also cross-validated: this re-verification's reimplementation exactly reproduces the concurrent session's phase-08 stored digest (`7a73497c…`) from 08's covered_files, proving the emitted `95782fee…` digest is canonical.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| e2e/flows.spec.mjs | ~513 | `.modal-wrap .modal` locator | ℹ️ Info | Used only as presence/box-math check for the app's own confirm dialog, per plan prohibition (product claim via heading `d.title`) — allowed by plan |
| e2e/flows.spec.mjs | — | `'Can view'` machine-value literal in share assertion | ℹ️ Info | Review finding IN-02, disposition recorded as open/advisory in 10-REVIEW-DISPOSITION.md — advisory, non-blocking |

No TBD/FIXME/XXX debt markers in any phase covered file (grep clean at HEAD). Review findings (0 critical / 4 warnings / 4 info) remain recorded with dispositions in 10-REVIEW-DISPOSITION.md.

### Human Verification Required

None. All truths had fresh behavioral evidence: the full suite was re-executed in this verification's own process and every flow passed in both locales, including the isolated criterion-4 named run.

### Gaps Summary

None. This re-verification confirmed the digest was the only thing stale: the close-out commits' e2e changes were purely cosmetic (unused-import removal, unused loop-variable drop, prettier formatting — no scenario changed, verified by diff inspection of be0fdf6/21725f1 against locale.spec.mjs and flows.spec.mjs). The full 8-flow × 2-locale matrix, criterion-4 scenario, and pre-existing specs were all re-proven green (45/45) on the current tree in this process. User decisions honored: D-02 (account locale drives language), D-04 (API fixtures, UI proves the switch), D-06 (shared helper promotion), and the 2026-10-24 UAT-07 billing-free reinterpretation (carried forward as override).

---

_Verified: 2026-10-25T19:53:25+01:00_
_Verifier: the agent (gsd-verifier)_
