---
status: testing
phase: 12-real-file-uploads-and-previews
source: [12-VERIFICATION.md]
started: 2026-10-24T17:50:00Z
updated: 2026-10-25T10:13:45Z
---

## Current Test

number: 1
name: Re-run test 1 in real Chrome AND Firefox (G-12-1 + G-12-4 closure re-check)
expected: |
  Drop a file >5 MB onto a dropzone, watch the progress row, then open a multi-page
  PDF's preview modal. Progress advances with real transfer pace and the row disappears
  on completion; the PDF renders inside the tall scrollable iframe, the full viewer
  toolbar (with download button) is visible in Firefox, and large PDFs paint without
  the old whole-file stall ("refused to connect" / "ne peut pas ouvrir cette page"
  must stay gone).
awaiting: user response

## Tests

<!-- Round 2 — re-run after gap-closure plans 12-05, 12-06, 12-07. Round-1 outcomes
     (issue on test 1, pass on tests 2–3) are preserved in the Gaps section below
     (G-12-1..G-12-5). Automated verification round 3: 18/19 must-haves verified,
     12-VERIFICATION.md rewritten 2026-10-25T10:09:01Z. -->

### 1. Re-run test 1 in real Chrome AND Firefox (G-12-1 + G-12-4 closure re-check)
expected: Drop a file >5 MB onto a dropzone, watch the progress row, then open a
multi-page PDF's preview modal. Progress advances with real transfer pace and the row
disappears on completion; the PDF renders inside the tall scrollable iframe, the full
viewer toolbar (with download button) is visible in Firefox, and large PDFs paint
without the old whole-file stall ("refused to connect" / "ne peut pas ouvrir cette
page" must stay gone).
result: [pending]

### 2. Re-run test 2 (G-12-2 + G-12-5 closure re-check)
expected: Copy a file link from BOTH « ... » context menu and the modal footer; paste
each into a fresh signed-in browser profile; then paste one into a LOGGED-OUT profile.
Both entry points copy the identical /w/:slug/file/:id URL; a signed-in paste renders
the bytes (inline types) or downloads (attachment types); a logged-out paste now lands
on the LOGIN PAGE (not raw signInRequired JSON), and after signing in the browser
returns to the same file URL and the bytes render.
result: [pending]

### 3. Re-run test 3 (G-12-3 closure re-check)
expected: Set MAX_UPLOAD_MB to a distinctive value (e.g. 7), restart the server, open
the files tab. The dropzone hint reads the configured value («— jusqu'à 7 Mo chacun» /
«— up to 7 MB each»), not the old hardcoded 250.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps

All five gaps are code-closed (verification round 3: 18/19 must-haves verified,
`12-VERIFICATION.md` rewritten 2026-10-25T10:09:01Z) — re-test required in a real
browser. Note: open code-review advisory CR-01 (suffix Range on a zero-byte file →
malformed 206 + ERR_OUT_OF_RANGE, server.js:1982-1985) awaits a triage decision
(fix or accept) before ship — see 12-REVIEW-DISPOSITION.md.

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
  status: resolved_by: [12-07]
  reason: "User reported: yes but the embed is a little too slow, i dont see all the menu so i can't download it — only on firefox, in chrome i have a download button"
  severity: major
  test: 1
  root_cause: "Two compounding causes: (1) modals.js:297-304 — the PDF iframe is hard-coded aspect-ratio:16/9 inside an overflow:hidden wrapper at .modal max-width 560px (overlays.css:25), making the viewport ~296px tall; Firefox renders its PDF toolbar INSIDE the iframe viewport and it gets clipped (Chrome's hover-overlay toolbar fits, hence Chrome-only symptom). (2) server.js:1933-1974 serveFileBinary has no Accept-Ranges/Range handling (contrast server.js:1787 'Accept-Ranges: none') so Firefox pdf.js must download the whole file before layout — the 'too slow' feel."
  artifacts:
    - path: "src/overlays/modals.js"
      issue: "PDF preview wrapper overflow:hidden + iframe aspect-ratio:16/9 clip Firefox's in-viewer toolbar (lines 297, 304)"
    - path: "src/styles/overlays.css"
      issue: ".modal max-width 560px; preview modal doesn't use a wider variant (line 25)"
    - path: "server.js"
      issue: "serveFileBinary lacks Accept-Ranges/Range/206 support — whole-file download before Firefox renders (lines 1933-1974)"
  missing:
    - "Add Range request support to serveFileBinary: Accept-Ranges: bytes, 206 with Content-Range + createReadStream({start,end}), 416 on invalid ranges"
    - "Give PDF iframes a dedicated taller scrollable container (e.g. height:min(70vh,...)) instead of aspect-ratio:16/9; keep 16/9 for images only; avoid overflow:hidden clipping (round iframe corners instead)"
    - "Optionally widen the preview modal (use .modal.lg / xl variant)"
  debug_session: ".planning/debug/firefox-pdf-toolbar.md"

- gap_id: G-12-5
  truth: "A non-authenticated browser loading a file URL is redirected to the login page (not shown a raw JSON error)"
  status: resolved_by: [12-07]
  reason: "User reported: it work as described, i just tested another behaviour on non logged browser, i have error \"Sign in to continue\" / code \"signInRequired\", can we simply redirect to the login page ?"
  severity: minor
  test: 2
  root_cause: "server.js:1998-2007 file route dispatches every GET/HEAD to serveFileBinary whose requireWorkspace→requireUser (server.js:1136-1140) answers JSON 401 signInRequired for ALL unauthenticated callers with no Sec-Fetch-Dest discrimination; the file route intercepts before the SPA fallback so main.js:193-201's existing no-session→login bootstrap (with wantedSlug preservation) never runs. No 302-to-login exists anywhere server-side. Note: the route comment (server.js:2000-2005) documents this as locked decision T-12-13 — reopening it is a product-level UAT override, not a code slip."
  artifacts:
    - path: "server.js"
      issue: "requireUser always JSON-401s with no caller context; file route intercepts anonymous document navigations before SPA fallback (lines 1136-1140, 1937, 1998-2007)"
  missing:
    - "In the file route auth path, when no session AND Sec-Fetch-Dest is document (or absent), 302 to login preserving a same-origin path-only return URL (reject absolute/protocol-relative URLs — no open redirect)"
    - "Keep JSON/404 behaviour for iframe/embed/fetch destinations and for authenticated-but-unauthorized callers (404 no-oracle preserved; redirect only on 'no session', never on 'not a member')"
    - "Update the T-12-13 route comment to record the reopened decision"
  debug_session: ".planning/debug/signin-required-redirect.md"

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
