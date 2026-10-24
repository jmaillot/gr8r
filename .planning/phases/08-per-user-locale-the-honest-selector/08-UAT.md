---
status: testing
phase: 08-per-user-locale-the-honest-selector
source: 08-01-SUMMARY.md, 08-02-SUMMARY.md, 08-03-SUMMARY.md, 08-VERIFICATION.md
started: 2026-10-23T17:40:00Z
updated: 2026-10-24T12:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server. Start the app from scratch (`npm start`). Server boots without errors and the homepage loads — no locale-related boot errors or crash.
result: issue — RESOLVED by 08-04 gap closure
reported: "it isn't reachable" — agent reproduced: `node server.js` crashes at boot with `Error: Enter a valid email address` (exit code 1) before the HTTP listener opens.
severity: blocker
resolution: "08-04 (commits d8763d3 fix, 72df55e test): fallback email changed to 'admin@example.com'; `node server.js` now boots clean from cold start (observed live 2026-10-24) and `test/server-boot.test.mjs` passes 2/2 (cold start + negative control)."

### 2. Language Selector Offers Exactly Two Options
expected: Settings page → Language row shows exactly two options: English and Français (no other languages), with the currently-active language selected.
result: pass

### 3. Instant Switch Without Reload
expected: Selecting Français switches the entire interface to French immediately — no page reload. Switching back to English is equally instant.
result: pass

### 4. Chosen Language Persists Across Reload
expected: After switching to Français, reload the page. The interface boots in French (the choice was saved to the account).
result: pass

### 5. Fresh Visit in a French Browser
expected: In a browser whose preferred language is French, open the app signed-out. The very first paint is in French — no English flash, no shell flicker.
result: skipped
reason: "User has no French-language browser available; covered by e2e/locale.spec.mjs (fr-FR first-paint proof, MutationObserver no-flash check)"

### 6. Sign-in Adopts the Account Language
expected: An account whose language is French signs in from an English-language browser. Right after login (without reload), the interface is in French.
result: pass
note: First attempt was a test-setup gap (user's account locale was NULL, never set to French — NULL correctly negotiates the browser language). After setting the account to French via the selector, sign-in showed French without reload.

### 7. Sign-out Returns to Negotiated Language
expected: Signing out from a French account in an English-language browser returns the interface to English (the browser-negotiated language).
result: pass

### 8. Two Members, Two Languages
expected: In one shared workspace, member A (French account, English browser) and member B (English account, French browser) each see the interface in their own account language — the language choice is per-account, not shared via the workspace.
result: pass

### 9. Failed Language Save Shows an Error Toast
expected: If the background account write fails (non-401 error), a toast tells the user the language save failed — while the interface still shows the language they just switched to.
result: skipped
reason: "Deferred to e2e coverage: e2e/locale.spec.mjs already proves the toast + optimistic-switch path mechanically; live trigger of a non-401 PATCH failure not practical by hand"

### 10. Demo-Mode Language Non-Adoption (prohibition check — from 08-VERIFICATION.md)
expected: With demo localStorage carrying a saved language (`gr8r.locale` set to fr), sign in with a real account whose locale is English (or NULL). The account rules must govern: after sign-in the interface shows the account/browser-negotiated language, never the demo-stored one.
result: pending

### 11. No Phantom or Untranslated Language Anywhere (prohibition check — from 08-VERIFICATION.md)
expected: A visual sweep of all rendered surfaces (settings selector, shell, drawers, modals, palette) shows no disabled language rows, no "coming soon" entries, and no untranslated language names anywhere in the interface.
result: pending

## Summary

total: 11
passed: 6
issues: 0
pending: 2
skipped: 2
blocked: 0

## Gaps

- gap_id: G-08-1
  truth: "Server boots without errors from a cold start using default settings (no ADMIN_EMAIL env var)"
  status: fixed
  reason: "User reported: it isn't reachable. Agent reproduced: `node server.js` exits 1 at boot with `Error: Enter a valid email address` thrown by ensureAdmin → createUser."
  severity: blocker
  test: 1
  root_cause: "`ensureAdmin` falls back to email 'admin@localhost' when ADMIN_EMAIL is unset, but `emailOk` (server.js:159) requires a dot in the domain (`/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/`), so 'admin@localhost' fails validation and the thrown 400 aborts bootstrap before server.listen()."
  artifacts:
    - path: "server.js"
      issue: "ensureAdmin default fallback email 'admin@localhost' fails the emailOk regex (no TLD); httpError(400) thrown during bootstrap crashes the process pre-listen."
  missing:
    - "Default fallback email must pass emailOk validation (e.g. 'admin@example.com')"
  debug_session: "diagnosed in-context during UAT session 2026-10-23 (no separate debug file needed — single-line root cause)"
