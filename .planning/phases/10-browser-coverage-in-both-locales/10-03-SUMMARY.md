---
phase: 10-browser-coverage-in-both-locales
plan: 03
subsystem: e2e-browser-flows
tags: [playwright, e2e, locale, uat-05, uat-06, uat-07, uat-08, switcher, member-removal, billing-free, project-creation]
requires:
  - 10-02 flows conventions (fmt() catalogue dictionaries, newContext/signIn/must helpers)
  - phase 7 billing-free decision (commit 45e3c42; /plan endpoint 404s)
provides:
  - e2e/flows.spec.mjs — all eight flow describes, each en + fr (D-01/D-03 matrix complete)
  - billing-free absence proof pinned in the suite (T-10-05): a future revert of the phase-7 removal fails the tests in both locales
affects: []
tech-stack:
  added: []
  patterns: [catalogue-imported selector dictionaries, absence-proof assertions (getByText count 0 + API 404 alongside), API-created fixtures for switch/removal (D-04)]
key-files:
  created:
    - .planning/phases/10-browser-coverage-in-both-locales/10-03-SUMMARY.md
  modified:
    - e2e/flows.spec.mjs
decisions:
  - Switcher and removal fixtures are created through the API in test.beforeAll (D-04) — the UI proves the switch/removal, not the creation/joining
  - The member-removal confirm dialog is asserted via title + danger ok button only; the body (deferred raw-English splice at actions.js removeMember) is never asserted in either locale
  - UAT-07 is proven as absence per the user decision of 2026-10-24 — no plan/billing vocabulary (ex-45e3c42 keys) rendered in settings in either locale, plus the POST /plan 404 asserted alongside
  - French absence vocabulary ("Facturation", "Facture", …) is asserted alongside the English removed keys, with a positive catalogue assertion proving the settings page really rendered in the account's language
metrics:
  duration: ~25 min
  completed: 2026-10-24
status: complete
actuals:
  tokens: 64000
  tasks: 2
  commits: 2
commits: 2
plan_head_before: 8e9ad3f4ac669bb14ac53a62c6fa32123b6835bf
plan_head_after: 10e4d226657c1ad559ff8517ed7d40a26c5652dc
---

# Phase 10 Plan 03: Second flows wave — switcher, member removal, billing-free, project creation (en + fr) Summary

`e2e/flows.spec.mjs` completes the eight-flow matrix: the workspace switcher navigates between two API-fixture workspaces (UAT-06), the owner removes a member through the row's context menu and the app's own confirm dialog down to the removed toast (UAT-05), the billing-free state is proven as absence in both locales with the plan endpoint still 404ing (UAT-07, reinterpreted per the user decision of 2026-10-24), and a project is created from the modal by role/label with a mixed-case accented name (UAT-08) — every describe with en and fr variants off catalogue-imported dictionaries.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Workspace switcher + member removal (en + fr) | bb71d86 | e2e/flows.spec.mjs |
| 2 | Project creation + billing-free proof (en + fr) | 10e4d22 | e2e/flows.spec.mjs |

## What Was Built

- **Fixtures (beforeAll, per locale):** a switch owner with a second workspace created through the API (D-04), and a removal owner plus a real member joined through the API invite/accept chain — `removeMember` needs a `userId`, so invited-only rows would error. All status-checked via `must()` with run-unique `clientIp(run, tag)` (T-10-06). No package installs (T-10-SC).
- **Workspace switcher (UAT-06):** `button.ws` opens the popover; the `popover.workspaces` heading, both `button[data-a='switchWs']` rows with name + `common.role.owner` label, the `.ck` check affordance on the current workspace (and only it). Clicking the second row lands on `/w/{second-slug}` with the new workspace's name rendered in the switcher.
- **Member removal (UAT-05):** members route → row's `a11y.memberOptions` button → `act.removeFromWorkspace` context-menu entry → the app's own confirm dialog (`.modal-wrap .modal` presence for box math only): heading `act.removeTitle {name}`, ok button `act.removeMember` with `btn-danger` class, no Playwright `dialog` handler. Confirm → `toast.removed {name}` asserted immediately, member row gone from the members surface. The confirm body (deferred raw-English splice at actions.js removeMember) is never asserted in either locale.
- **Billing-free proof (UAT-07, reinterpreted — recorded in the describe's banner comment):** signed-in owner opens settings; the workspace nav button (catalogue, exact match) proves the page rendered in the account's language; every removed-billing-vocabulary string (en keys from `git show 45e3c42` — "Plan", "Billing", "Billing email", "Billing address", "Invoices", "Upgrade", "Downgrade", "Current plan" — plus the natural French words "Facturation", "Facture", "Adresse de facturation", "Abonnement", "Améliorer", "Rétrograder", "Moyens de paiement") has a `getByText(exact)` count of 0; and `POST /api/workspaces/{slug}/plan` returns 404 through the fixture client (mirroring test/membership.test.mjs) — an API-side absence check alongside, never a substitute.
- **Project creation (UAT-08):** projects route → header `act.newProject` button (disambiguated from the sidebar icon button by its rendered text) → modal header `act.newProject` + hint `modal.projectHint`, name filled by its `modal.projectName` label, `data-a='submitProject'` asserted to contain `palette.createProject` and clicked; outcome = `toast.createdProject {name}` + the created project's sidebar link rendered exact. The name "Übergabe Éclair {lang} {run}" exercises `makeKey`'s mixed-case/accent derivation by construction.

## Verification

- `npm run build && npm run e2e` — **37 passed**, zero failed/skipped (tenancy, locale incl. criterion-4, french-overflow, and all eight flow describes × en/fr).
- `grep -c "test.describe" e2e/flows.spec.mjs` = 8; each contains en + fr tests.
- Per-task gates: `--grep "switcher|removal"` 4/4, `--grep "billing-free"` 2/2, `--grep "project creation"` 2/2.
- No asserted string in the member-removal describe matches the confirm-body splice; every asserted string goes through `fmt()` against the imported catalogues.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Strict-mode ambiguities between duplicate buttons**
- **Found during:** Task 2
- **Issue:** `getByRole('button', { name: 'Workspace' })` matched both the switcher trigger ("Switch workspace" aria-label contains the substring) and the settings nav item; `act.newProject` matched both the sidebar icon button and the header button; `palette.createProject` matched both the empty-state create button and the modal submit; the final project-entry locator matched three project links.
- **Fix:** `exact: true` on the settings-nav assert; the header new-project button located by `[data-a='newProject']` filtered on rendered text; the modal submit located by its `data-a='submitProject'` action with its label asserted separately; the created project asserted via its exact sidebar link role.
- **Commit:** 10e4d22

No other deviations — the switcher/removal surfaces matched the plan's inventory on the first run.

## Known Stubs

None.

## Threat Flags

None — no new product surface; the only threat-relevant addition is the T-10-05 mitigation itself (the billing-free invariant is now pinned by tests in both locales).

## Self-Check: PASSED

- Commits bb71d86, 10e4d22 exist on main (2 commits measured from the plan-head-before ledger 8e9ad3f).
- `e2e/flows.spec.mjs` exists with 8 describes × en/fr; full suite green (37 passed).
- SUMMARY file exists at the canonical path.