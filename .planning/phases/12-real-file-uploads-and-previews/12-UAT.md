---
status: complete
phase: 12-real-file-uploads-and-previews
source: [12-VERIFICATION.md]
started: 2026-10-24T17:50:00Z
updated: 2026-10-25T07:22:11Z
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

## Summary

total: 2
passed: 0
issues: 2
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
