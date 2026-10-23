# Plan 07-02 — Billing removed end-to-end, the 54 catalogue keys deleted

**Phase:** 07-french-catalogue-french-typography
**Status:** COMPLETE

## What this plan built

### Task 1: Server and data layer
- The `/api/workspaces/:slug/plan` endpoint is deleted — a POST to it now falls through to the
  server's 404 handling (`test/membership.test.mjs` asserts 404 for owner, admin and member).
- The plan copy-on-write line is gone from `docFromClient()`, and the new-workspace seed no
  longer writes `plan: 'Team'` or `invoices: []`.
- `src/data/seed.js` no longer carries the seeded invoice rows; the rest of the demo content
  (projects, comments, notifications) is untouched.
- **Legacy tolerance (D-13, no migration):** `docFromClient()` now explicitly drops `plan` and
  `invoices` from what it writes, so a stale client (or a legacy document) can never resurrect
  the fields. `test/migration.test.mjs` gained the tolerance assertion: the legacy fixture's
  plan/invoices document loads, saves and the fields are gone after a write.
- The tenancy test now proves a member's document write drops the plan field instead of
  pinning it, and the revision test's plan-route stub is deleted.

### Task 2: Client surfaces
- `src/pages/settings.js`: the Billing group is gone from `SET_NAV`, and the `plan`, `payment`
  and `invoices` case bodies with it. The unknown-sec fallback still routes to `page404()`, so
  a stale deep link (`sec=plan`) lands on 404 (T-07-04).
- `src/actions/actions.js`: `A.changePlan` and its upgrade prompts are deleted.
- `src/pages/members.js`: the billing column is gone from the permission matrix.
- `src/core/api.js`: `setPlan` is deleted.
- `src/locales/en.json`: **54** billing keys deleted (the plan estimated 53; the regex over the
  five families — `settings.nav.*`, `settings.group.billing`, `settings.plan.*`, `settings.pay.*`,
  `settings.inv.*`, `act.plan*`, `act.upgrade*`, `act.downgrade*`, `toast.planChanged`,
  `err.changePlan`, `perm.billing` — matches 54). The catalogue is now 1 392 keys.
  No French value was written for any deleted key; `fr.json` still carries only its six seed
  values.
- **D-14 rewording:** `popover.roleDescOwner` is now "Full control, including deleting the
  workspace" (was "…including the plan and deleting the workspace"), and
  `a11y.settings.ownerOnly` is now plan-free ("Only the workspace owner can change this
  setting"). These are the plan's declared English deltas. `page.auth.team.timelinesSub`
  ("Plan with dates & dependencies") stays: it is the verb sense (task planning), not the
  subscription noun.
- The seven i18n test files' billing pins are rewritten: the settings nav list and the section
  list drop the three billing entries, the plan/payment/invoice oracle rows are gone, and the
  machine-identifier counts are re-measured (434 data-a / 57 data-r / 75 data-v sites,
  from 438 / 58 / 76). The catalogue-size assertion moved to 1 392.

### Task 3: Full-suite proof
- `scripts/i18n-scan.mjs` exits clean and `test/fixtures/i18n-pending.json` is still empty
  (deleting billing code removed literals; nothing new was added).
- `node --test --test-concurrency=2` over every test file except `test/catalogue.test.mjs`
  (whose completeness block stays RED by design until plan 07-06): **330 tests, all pass**.
- `npm run build` compiles the bundle without the removed keys; the icon baseline was
  regenerated at **171** names (the three billing icons — `gem`, `credit-card`, `receipt` —
  are gone from the sources), and the baseline test pins the new count.

## Verification
- `grep -n "plan|invoice" server.js src/data/seed.js` — only the deliberate field-drop in
  `docFromClient()` and benign content words (`planning`, `launch-plan.docx`) remain.
- `node -e` key-pattern check over `en.json` — zero billing keys remain.
- The seven i18n test files, the three server tests and the whole suite are green.
- `npm run build` compiles clean.

## Deviations
- The plan estimated 53 keys; the actual count is 54 (the regex family scan is authoritative).
- The baseline regeneration was needed because removing the billing settings group removed its
  three icons; `test/fixtures/icons-baseline.json` and its count pin moved together.
