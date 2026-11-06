---
status: complete
phase: 43-workspace-logo
source: [43-01-SUMMARY.md, 43-02-SUMMARY.md]
started: 2026-11-06T12:30:00Z
updated: 2026-11-06T13:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server. Start the application from scratch. Server boots without errors (logos dir auto-created), the workspace list loads, and a workspace page renders live data.
result: pass

### 2. Upload Logo — Render Surfaces
expected: As an Owner/Admin in Settings, upload a PNG via "Upload logo". The sidebar/topbar avatar (~22px), the browser tab favicon, and the 52px Settings workspace header all show the logo (cropped to fit, not stretched).
result: pass

### 3. Remove Logo — Fallbacks Return
expected: Click "Remove logo" in Settings. The sidebar/topbar falls back to the letter-mark, the tab favicon returns to /favicon.svg, and the "Remove logo" control disappears.
result: issue
reported: "when i click remove logo, nothing happens"
severity: major

### 4. Digest Email Header
expected: In a digest email for a workspace WITH a logo, a workspace logo image (max 48px tall) appears above the greeting with the workspace name as alt text. For a workspace WITHOUT a logo, the digest header is unchanged. Next saves in the app after upload/remove do not 409.
result: issue
reported: "je n'ai pas le logo dans le digest"
severity: major

## Summary

total: 4
passed: 2
issues: 2
pending: 0
skipped: 0

## Gaps

- gap_id: G-43-3
  truth: "Click 'Remove logo' in Settings. The sidebar/topbar falls back to the letter-mark, the tab favicon returns to /favicon.svg, and the 'Remove logo' control disappears."
  status: failed
  reason: "User reported: when i click remove logo, nothing happens"
  severity: major
  test: 3
  artifacts: []  # Filled by diagnosis
  missing: []    # Filled by diagnosis
- gap_id: G-43-4
  truth: "In a digest email for a workspace WITH a logo, a workspace logo image (max 48px tall) appears above the greeting with the workspace name as alt text."
  status: failed
  reason: "User reported: je n'ai pas le logo dans le digest"
  severity: major
  test: 4
  artifacts: []  # Filled by diagnosis
  missing: []    # Filled by diagnosis
