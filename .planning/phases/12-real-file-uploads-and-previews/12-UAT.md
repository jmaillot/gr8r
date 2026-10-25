---
status: complete
phase: 12-real-file-uploads-and-previews
source: [12-VERIFICATION.md]
started: 2026-10-24T17:50:00Z
updated: 2026-10-25T07:26:19Z
---

## Current Test

[testing complete]

## Tests

### 1. Drag-and-drop feel and PDF embed rendering
expected: Drop a large file (>5 MB) onto a dropzone; progress row climbs with the real
transfer pace (no uniform timer), disappears on completion; a multi-page PDF renders
inside the iframe embed in the preview modal.
result: issue
reported: "rendering doesnt work either in chrome or firefox (firefox says Firefox ne peut pas ouvrir cette page / chrome says refused to connect.)"
severity: major

### 2. « Copier le lien » outside the SPA
expected: Copy a file link via the context menu, paste it into a fresh browser profile
(logged in, no SPA state), and load it. Bytes render in the browser tab (inline types)
or download (attachment types); the URL keeps working.
result: issue
reported: "copy a file link does not have same behaviour between the ... copy link and copy link in the embedding, url works in embedding copy link but no rendering"
severity: major

### 3. Dropzone cap label ignores MAX_UPLOAD_MB
expected: The dropzone hint text reflects the configured MAX_UPLOAD_MB value
result: issue
reported: "\"Déposez des fichiers ici ou browse — jusqu'à 250 Mo chacun\" ne tient pas compte de la valeur MAX_UPLOAD_MB"
severity: minor

## Summary

total: 3
passed: 0
issues: 3
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-12-1
  truth: "A multi-page PDF renders inside the iframe embed in the preview modal"
  status: failed
  reason: "User reported: rendering doesnt work either in chrome or firefox (firefox says Firefox ne peut pas ouvrir cette page / chrome says refused to connect.)"
  severity: major
  test: 1
  artifacts: []
  missing: []

- gap_id: G-12-2
  truth: "Copied file URLs behave consistently and render bytes in a fresh browser session"
  status: failed
  reason: "User reported: copy a file link does not have same behaviour between the ... copy link and copy link in the embedding, url works in embedding copy link but no rendering"
  severity: major
  test: 2
  artifacts: []
  missing: []

- gap_id: G-12-3
  truth: "Dropzone hint text reflects the configured MAX_UPLOAD_MB value"
  status: failed
  reason: "User reported: \"Déposez des fichiers ici ou browse — jusqu'à 250 Mo chacun\" ne tient pas compte de la valeur MAX_UPLOAD_MB"
  severity: minor
  test: 3
  artifacts: []
  missing: []

## Deferred Follow-Ups

- test: 0
  idea: "Hors périmètre phase 12 (Sessions) : la section Sessions affiche 2 sessions actives (Chrome + Firefox) mais le bouton « déconnecter les autres sessions » ne s'active pas"
  deferred_at: 2026-10-25
