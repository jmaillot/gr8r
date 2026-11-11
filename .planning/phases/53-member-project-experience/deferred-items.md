# Phase 53 — Deferred / Out-of-scope Items

- [2026-11-09, 53-01 Task 2 verify] `test/totp-rewrap.test.mjs` fails suite-wide with ENOENT `DEPLOY.md` — the file is git-tracked but absent from the working tree (pre-existing local deletion, unrelated to per-team perms). Out of scope per the scope-boundary rule; owner should `git checkout -- DEPLOY.md` or restore it. All other 1139 tests pass.
- [2026-11-09, 53-05 Task 3 verify] Full `npm run e2e` shows 11 pre-existing failures (tenancy ×4, locale ×2, flows share-modal UAT-04 ×2 + project-creation ×2, french-overflow leak-scan ×1) — bisected via a clean worktree at 6e90e59 (pre-53-05): already failing before this plan. Likely casualties of 53-03/53-04 (share-modal removal changed the flows.spec UAT-04 surface; tenancy/locale "toBeVisible" failures need triage). Out of scope per the scope-boundary rule; owner/verifier should triage as a follow-up. Unit suite is fully green (1169 tests, 0 fail).
  status: acknowledged
