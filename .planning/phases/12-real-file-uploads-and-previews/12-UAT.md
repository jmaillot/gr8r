---
status: complete
phase: 12-real-file-uploads-and-previews
source: [12-VERIFICATION.md]
started: 2026-10-24T17:50:00Z
updated: 2026-10-25T09:05:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Drag-and-drop feel and PDF embed rendering
expected: Drop a large file (>5 MB) onto a dropzone; progress row climbs with the real
transfer pace (no uniform timer), disappears on completion; a multi-page PDF renders
inside the iframe embed in the preview modal.
result: issue
reported: "yes but the embed is a little too slow, i dont see all the menu so i can't download it — only on firefox, in chrome i have a download button"
severity: major

### 2. « Copier le lien » outside the SPA
expected: Copy a file link via the context menu, paste it into a fresh browser profile
(logged in, no SPA state), and load it. Bytes render in the browser tab (inline types)
or download (attachment types); the URL keeps working.
result: pass
fix_note: "User also flagged: non-logged browser gets raw error {\"error\":\"Sign in to continue\",\"code\":\"signInRequired\"} instead of a redirect to the login page (new gap G-12-5)."

### 3. Dropzone cap label ignores MAX_UPLOAD_MB
expected: The dropzone hint text reflects the configured MAX_UPLOAD_MB value
result: pass

## Summary

total: 3
passed: 2
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

All three gaps are code-closed (verified 14/14 must-haves, `12-VERIFICATION.md` rewritten 2026-10-25) — re-test required in a real browser.

- gap_id: G-12-1
  truth: "A multi-page PDF renders inside the iframe embed in the preview modal"
  status: resolved_by: [12-05]
  reason: "User reported: rendering doesnt work either in chrome or firefox (firefox says Firefox ne peut pas ouvrir cette page / chrome says refused to connect.)"
  severity: major
  test: 1
  root_cause: "server.js:1990-2001 routes /w/:slug/file/:id by Accept:text/html alone — browsers send text/html on IFRAME navigations too, so the modal's iframe gets the SPA fallback (X-Frame-Options: DENY, frame-ancestors 'none', server.js:1753-1764) instead of the bytes; Chrome shows 'refused to connect', Firefox 'ne peut pas ouvrir cette page'. serveFileBinary's header policy (server.js:1959-1966) is correct but never reached."
  artifacts:
    - path: "server.js"
      issue: "Accept:text/html routing conflates iframe navigations with top-level document navigations (lines 1990-2001)"
  missing:
    - "Discriminate with Sec-Fetch-Dest (iframe/frame => serve bytes; document => SPA bootstrap) with a query-param fallback (e.g. ?raw=1) for browsers without Fetch Metadata"
  debug_session: ".planning/debug/pdf-embed-rendering.md"

- gap_id: G-12-2
  truth: "Copied file URLs behave consistently and render bytes in a fresh browser session"
  status: resolved_by: [12-05]
  reason: "User reported: copy a file link does not have same behaviour between the ... copy link and copy link in the embedding, url works in embedding copy link but no rendering"
  severity: major
  test: 2
  root_cause: "Two compounding defects: (1) the '...' context menu stamps only data-id (context-menu.js:12, file menu :82) while A.copyLink (actions.js:517-532) resolves file links only from data-fid — the file id falls through every branch to path='', so the clipboard gets the workspace root /w/{slug}; no e2e covers this path. (2) The modal copy-link copies the correct /w/:slug/file/:id, but a top-level paste routes Accept:text/html to the SPA bootstrap (applyDeepLink, main.js:101-130) which opens the filePreview modal whose iframe hits G-12-1's same Accept=>SPA/XFO-DENY failure — 'url works', bytes never render (PDF/video; img renders fine)."
  artifacts:
    - path: "src/overlays/context-menu.js"
      issue: "menu builder emits data-id only; copyLink for ctx==='file' can never resolve a file link downstream"
    - path: "src/actions/actions.js"
      issue: "A.copyLink branch chain lacks a file lookup keyed on data-id (falls through to workspace root URL)"
    - path: "src/main.js"
      issue: "applyDeepLink opens the modal for /file/:id pastes — diverges from UAT truth (bytes in tab / download)"
    - path: "server.js"
      issue: "Accept:text/html routing (shared root cause with G-12-1)"
  missing:
    - "File-menu copyLink item must carry data-fid (or A.copyLink needs a file branch keyed on data-id); add e2e for the ctx-menu copyLink path"
    - "Route /w/:slug/file/:id by Sec-Fetch-Dest (or ?raw=1 fallback) and decide top-level paste behaviour: serve/download bytes directly vs open modal"
  debug_session: ".planning/debug/copy-link-inconsistent-rendering.md"

- gap_id: G-12-3
  truth: "Dropzone hint text reflects the configured MAX_UPLOAD_MB value"
  status: resolved_by: [12-06]
  reason: "User reported: \"Déposez des fichiers ici ou browse — jusqu'à 250 Mo chacun\" ne tient pas compte de la valeur MAX_UPLOAD_MB"
  severity: minor
  test: 3
  root_cause: "The cap label is fully static and MAX_UPLOAD_MB never crosses the server->client boundary: (1) locale catalogues hardcode 250 inside the translation value (src/locales/fr.json:1409, en.json:1409); (2) the render site files.js:42 passes no t() interpolation vars; (3) GET /api/config (server.js:1215-1223) exposes only {app,signup,mail,url,workspaceCreation} and api.init() (src/core/api.js:118-126) carries exactly those — the knob (server.js:71-72) stays server-side. Label says 250 while server default is 25."
  artifacts:
    - path: "src/locales/fr.json"
      issue: "page.files.dropLimit hardcodes '250 Mo' inside the translation value (line 1409)"
    - path: "src/locales/en.json"
      issue: "page.files.dropLimit hardcodes '250 MB' inside the translation value (line 1409)"
    - path: "src/views/files.js"
      issue: "renders t('page.files.dropLimit') with no interpolation variables (line 42)"
    - path: "server.js"
      issue: "MAX_UPLOAD_MB omitted from /api/config payload (lines 71-72, 1215-1223)"
  missing:
    - "Expose maxUploadMb in /api/config and carry it through api.init() into client state"
    - "Convert page.files.dropLimit to a placeholder form fitting the i18n-scan contract ({n} interpolation) and pass the value at files.js:42; add an e2e assertion on the rendered hint"
  debug_session: ".planning/debug/dropzone-cap-label.md"

- gap_id: G-12-4
  truth: "A multi-page PDF renders inside the iframe embed in the preview modal"
  status: failed
  reason: "User reported: yes but the embed is a little too slow, i dont see all the menu so i can't download it — only on firefox, in chrome i have a download button"
  severity: major
  test: 1
  artifacts: []  # Filled by diagnosis
  missing: []    # Filled by diagnosis

- gap_id: G-12-5
  truth: "A non-authenticated browser loading a file URL is redirected to the login page (not shown a raw JSON error)"
  status: failed
  reason: "User reported: it work as described, i just tested another behaviour on non logged browser, i have error \"Sign in to continue\" / code \"signInRequired\", can we simply redirect to the login page ?"
  severity: minor
  test: 2
  artifacts: []  # Filled by diagnosis
  missing: []    # Filled by diagnosis

## Deferred Follow-Ups

- test: 0
  idea: "Hors périmètre phase 12 (Sessions) : la section Sessions affiche 2 sessions actives (Chrome + Firefox) mais le bouton « déconnecter les autres sessions » ne s'active pas"
  deferred_at: 2026-10-25
- test: 0
  idea: "Hors périmètre phase 12 (Auth) : le changement de mot de passe répond « Mot de passe mis à jour » mais (1) le nouveau mot de passe ne fonctionne pas à la connexion, (2) les autres sessions restent connectées — l'utilisateur veut une révocation automatique des autres sessions après changement de mot de passe"
  deferred_at: 2026-10-25
- test: 0
  idea: "Hors périmètre phase 12 (Auth/2FA) : l'authentification à deux facteurs génère un faux QR code illisible — chercher comment implémenter un vrai check 2FA (TOTP standard : secret, URI otpauth://, QR scannable, vérification à 6 chiffres). À corréler avec les bugs Sessions et changement de mot de passe (même zone auth possiblement stubée)"
  deferred_at: 2026-10-25
