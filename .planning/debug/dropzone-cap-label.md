---
status: resolved
trigger: "UAT test 3 (Phase 12): dropzone hint 'Déposez des fichiers ici ou browse — jusqu'à 250 Mo chacun' ignores MAX_UPLOAD_MB"
created: 2026-10-25T00:00:00Z
updated: 2026-10-25T00:00:00Z
symptoms_prefilled: true
---

## Current Focus

hypothesis: CONFIRMED — cap text is a static build-time catalogue string; the MAX_UPLOAD_MB value never crosses the server→client boundary, so the label cannot reflect the env knob
test: grep-render-site + /api/config payload inspection + api.init() consumption check (all direct observation)
expecting: confirmed — see Resolution
next_action: return ROOT CAUSE FOUND to orchestrator (plan-phase --gaps consumes it)

## Symptoms

expected: dropzone hint text reflects the configured MAX_UPLOAD_MB value
actual: shows « Déposez des fichiers ici ou browse — jusqu'à 250 Mo chacun » regardless of MAX_UPLOAD_MB
errors: label hardcodes 250 Mo while server cap is MAX_UPLOAD_MB (env knob, default 25 — server.js:71)
reproduction: Test 3 in UAT (Phase 12)
started: Discovered during UAT

## Eliminated

- hypothesis: an existing config/bootstrap payload already exposes the upload cap and the view just fails to read it
  evidence: /api/config payload read verbatim (server.js:1215-1223) contains no maxUpload field; api.init() consumes only signup/mail/creation/url; no data-* or inline config in the SPA shell
  timestamp: 2026-10-25
- hypothesis: another component or a build-time substitution derives the number
  evidence: grep across src/ for dropLimit/dropHere/250 finds exactly the two catalogue lines and the single render site in files.js:42; no other component renders a cap text
  timestamp: 2026-10-25

## Evidence

- checked: src/locales/fr.json + en.json grep for '250'/'Mo chacun'
  found: exactly one pair of hardcoded cap lines — fr:1409 "page.files.dropLimit": "— jusqu’à 250 Mo chacun", en:1409 "— up to 250 MB each"; the number is inside the translation value, not a placeholder
  implication: the cap is frozen at build time in both catalogues; changing env can never move it
- checked: render sites for page.files.dropLimit / dropHere
  found: only src/views/files.js:42 renders `${t('page.files.dropHere')} … ${t('page.files.dropLimit')}` with zero t() vars
  implication: no interpolation path exists between a config value and the label
- checked: server.js:71-72 (MAX_UPLOAD_MB/MAX_UPLOAD constants) and whole-file grep for exposure channels
  found: MAX_UPLOAD used only in uploadBinary/handleUpload size capping; /api/config (server.js:1215-1223) returns only { app, signup, mail, url, workspaceCreation }; no bootstrap/data-* payload carries it; serveStatic serves a plain shell (no window.__/data-config markers in index.html)
  implication: the client has no channel to learn the server cap — the knob is server-private
- checked: src/core/api.js init() (lines 118-126)
  found: consumes GET /api/config and stores exactly signup/mail/creation/url/enabled — no size-cap field
  implication: even the existing config channel is knob-blind
- checked: e2e/flows.spec.mjs + phase 12 docs
  found: e2e asserted only upload success/too-large toasts, never the dropzone hint text; 12-04 docs cover MAX_UPLOAD_MB operator documentation only, not label display; "Keep existing dropzones" (D-14) explains why the old hardcoded hint survived the phase untouched
  implication: no test or phase gate covered the hint text, so the hardcode shipped unnoticed
- checked: user-reported value 250 vs server default 25
  found: default MAX_UPLOAD_MB=25 (server.js:71); label says 250 — mismatch independent of any env setting; the string is static regardless
  implication: label ignores the knob unconditionally, not only at non-default values; bug_class = Bohrbug (deterministic)

## Resolution

root_cause: "The cap number is dead-ended on every leg of the path: (1) src/views/files.js:42 renders t('page.files.dropLimit') with zero interpolation variables, (2) the locale catalogues hardcode '250' into the translation values themselves (fr.json:1409 '— jusqu’à 250 Mo chacun', en.json:1409 '— up to 250 MB each'), and (3) the server never exposes MAX_UPLOAD_MB to the client — /api/config (server.js:1215-1223) returns only { app, signup, mail, url, workspaceCreation }, api.init() (src/core/api.js:118-126) stores exactly those fields, and there is no data-* attribute or inline bootstrap payload in the SPA shell. Even if the view wanted to interpolate the knob, no client-reachable value exists. All three conditions must be lifted together (AND-gate): a placeholder without a server value, or a server value without a placeholder, still cannot reflect the knob."
fix: "None applied — diagnose-only run."
verification: "Direct code reading: the only dropzone-cap render site is files.js:42; grep for 250/Mo chacun across src shows exactly the two locale lines; /api/config payload read verbatim — no maxUploadMb; api.init() consumption read verbatim; no inline config in the SPA shell (serveStatic serves a static index; no window.__/data-config markers)."
files_changed: []

## Close-out (2026-10-25)

FIXED — all three legs of the AND-gate lifted (plan 12-08 / G-12-3 close-out): /api/config now
returns `maxUploadMb: MAX_UPLOAD_MB` (server.js), api.init() consumes it into
`state.maxUploadMb` (src/core/api.js, getter `api.maxUploadMb`), and both catalogues replaced
the hardcoded '250' with the `{n}` placeholder — src/views/files.js renders
`t('page.files.dropLimit', { n: api.maxUploadMb })`. The raw `browse` literal in the same
hint was also moved to the new `page.files.browse` key ('parcourir' in French) during the
deferred-07 i18n close-out. Verified in server.js, src/core/api.js, src/views/files.js,
src/locales/{en,fr}.json (2026-10-25).
