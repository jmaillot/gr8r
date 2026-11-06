---
status: complete
phase: 42-one-click-unsubscribe-endpoint
source: [42-01-SUMMARY.md, 42-02-SUMMARY.md]
started: 2026-11-06T10:30:00Z
updated: 2026-11-06T11:05:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server, clear ephemeral state, start the app from scratch — server boots without errors and a basic request returns normally.
result: pass

### 2. One-Click Unsubscribe (mail-client simulation)
expected: A POST to /unsubscribe/:token with a valid token (no cookies, no special headers — like a mail client's one-click request) returns an HTML page saying the digest emails will stop ("You will no longer receive these digest emails." in EN, or the FR equivalent for a French-locale user). Receiving the digest afterward no longer includes that user.
result: pass

### 3. Unsubscribe page is honest on bad links
expected: Forging the token, using an already-invalidated token (e.g. after MASTER_KEY rotation), or a garbage token still returns a normal-looking page ("Your request has been processed.") — never an error page, never a 500. A GET on the link (e.g. preview) shows the same neutral page and does NOT unsubscribe the user.
result: pass

### 4. Replay safety
expected: Clicking the same unsubscribe link twice (or a mail client retrying) gives the identical page both times, no error, and the subscription stays off.
result: pass

### 5. "Coming soon" badge on push toggles (EN)
expected: In Settings → Notifications, the three push toggles (mentions, assignments, comments) each show a small "Coming soon" badge; the daily-digest and past-due-reminder toggles do NOT show it, and all five toggles still toggle normally.
result: issue
reported: "Le badge « Coming soon » n'apparaît pas sur les trois toggles push (Mentions, Assignments, Comments) dans la section Push de Settings — même après rebuild du serveur et rechargement de la page."
severity: major

### 6. Badge in French
expected: With the interface in French, the badge reads "Bientôt disponible" and everything else in the section renders as before.
result: issue
reported: "Aucun badge « Bientôt disponible » sur les trois toggles push dans la section Notifications push — même constat qu'en anglais, donc le badge ne se rend pas du tout."
severity: major

### 7. Footer link and resubscribe intact
expected: The digest email footer still contains the unsubscribe link (Phase 41 behavior unchanged), and a user who unsubscribed can re-enable the digest from Settings → Notifications and receive the next digest.
result: skipped
reason: "Pas de digest email sous la main pour vérifier ; observation UX soulevée (doublon Mentions/Assignation entre sections email et push) enregistrée en Deferred Follow-Ups"

## Summary

total: 7
passed: 4
issues: 2
pending: 0
skipped: 1

## Gaps

- gap_id: G-42-5
  truth: "The three inert push toggles (push_mention, push_assign, push_comment) each render a 'Coming soon' badge in the Settings Notifications panel"
  status: failed
  reason: "User reported: badge absent de la section Push (Mentions, Assignments, Comments) même après rebuild serveur + rechargement cache"
  severity: major
  test: 5
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- gap_id: G-42-6
  truth: "In the French UI, the badge on the three push toggles reads 'Bientôt disponible'"
  status: failed
  reason: "User reported: aucun badge dans la section Notifications push en français — le badge ne se rend pas (même racine que G-42-5)"
  severity: major
  test: 6
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

## Deferred Follow-Ups

- test: 7
  idea: "Sections email (Mentions, Assignation des tâches) vs toggles push ressemblent en doublon — clarifier la séparation email/push dans Settings ou regrouper"
  deferred_at: 2026-11-06
