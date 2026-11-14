# Deferred Items — Phase 56

## 56-02

status: acknowledged

- **[pre-existing, out of scope] e2e: 9 specs fail identically at the 56-01 baseline (commit 7ce7521) and at HEAD.**
  Verified by building and running the full e2e subset in a throwaway worktree at 7ce7521: the
  exact same 9 specs fail (`french-overflow.spec.mjs` ×7, `locale.spec.mjs:122`), with the same
  assertion errors — 56-02 neither introduced nor worsened them. Two distinct symptoms at baseline:
  1. `locale.spec.mjs:122` (LOC-01/LOC-03): expects a collapsed `<button>` named "Language" with
     text "English" in Settings > Language, but `src/pages/settings.js:115` renders a **native
     `<select class="select" data-in="langSel" aria-label="Language">`** — a select maps to the
     combobox role, never a button, so `getByRole('button', …, { expanded: false })` never matches.
  2. `french-overflow.spec.mjs` serial group: `expect(received).toBe(expected)` overflow/label
     assertions after switching to Français — failed at 30 s timeout on the group's first test
     (:124) even on the pre-56-02 build.
  Additionally, when Playwright manages its own `webServer`, the first serial-group test can hit
  `ECONNREFUSED 127.0.0.1:4317` while the server is still binding (100/109 still pass in that
  mode); against a pre-warmed server the failures are the deterministic assertion set above.
  Suspected root cause for both clusters: the Settings page became a lazy chunk in 56-01
  (`settings.js` no longer in the entry), and these French/locale specs interact with the
  language row immediately after navigation — timing/role drift the specs were not written for.
  **Action:** fix in a dedicated plan (56-04 candidate or a quick), NOT in 56-02 — the D-02 gate
  scope is chunk sizes, and the failure set predates 56-02's first commit. Unit suites (1397
  tests), lint and the i18n gate are green.
