---
status: testing
phase: 12-real-file-uploads-and-previews
source: [12-VERIFICATION.md]
started: 2026-10-24T17:50:00Z
updated: 2026-10-24T17:50:00Z
---

## Current Test

number: 1
name: Drag-and-drop feel and PDF embed rendering
expected: |
  Drop a large file (>5 MB) onto a dropzone in the running app; watch the progress row
  climb in real time; then open a multi-page PDF's preview in the modal.
  Progress advances with the actual transfer (not a uniform timer), row disappears on
  completion, PDF renders inside the iframe embed.
awaiting: user response

## Tests

### 1. Drag-and-drop feel and PDF embed rendering
expected: Drop a large file (>5 MB) onto a dropzone; progress row climbs with the real
transfer pace (no uniform timer), disappears on completion; a multi-page PDF renders
inside the iframe embed in the preview modal.
result: [pending]

### 2. « Copier le lien » outside the SPA
expected: Copy a file link via the context menu, paste it into a fresh browser profile
(logged in, no SPA state), and load it. Bytes render in the browser tab (inline types)
or download (attachment types); the URL keeps working.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
