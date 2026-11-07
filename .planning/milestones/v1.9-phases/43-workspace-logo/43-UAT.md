---
status: complete
phase: 43-workspace-logo
source: [43-01-SUMMARY.md, 43-02-SUMMARY.md, 43-03-SUMMARY.md]
started: 2026-11-06T12:30:00Z
updated: 2026-11-06T14:45:00Z
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
result: pass
resolved_by: 43-03 (G-43-3 — A.removeLogo alias, commit 60e1b76; human-confirmed live)

### 4. Digest Email Header
expected: In a digest email for a workspace WITH a logo, a workspace logo image (max 48px tall) appears above the greeting with the workspace name as alt text. For a workspace WITHOUT a logo, the digest header is unchanged. Next saves in the app after upload/remove do not 409.
result: pass
resolved_by: 43-03 (G-43-4 — deployment staleness; image rebuild + Traefik router exclusion of /w/:slug/logo from Authentik forward-auth; human-verified logo renders in digest email. No source change.)

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0

## Gaps

- gap_id: G-43-3
  truth: "Click 'Remove logo' in Settings. The sidebar/topbar falls back to the letter-mark, the tab favicon returns to /favicon.svg, and the 'Remove logo' control disappears."
  status: resolved
  resolved_by: 43-03
  resolved_at: 2026-11-06
  reason: "User reported: when i click remove logo, nothing happens"
  severity: major
  test: 3
  artifacts:  # filled by G-43-3 diagnosis
    - src/pages/settings.js:182 (button uses data-a="removeLogo")
    - src/actions/actions.js:1083 (handler registered as IN.removeLogo, not A.removeLogo)
    - src/actions/events.js:35 (click delegation dispatches A[el.dataset.a] — undefined for removeLogo)
  missing:    # filled by G-43-3 diagnosis
    - A.removeLogo action — the only click-dispatch namespace is A (src/actions/events.js); handler must be exported as A.removeLogo (or button changed to another wiring)
    - client-side test covering the data-a→A dispatch wiring for removeLogo (test/workspace-logo.test.mjs covers only the HTTP route)
- gap_id: G-43-4
  truth: "In a digest email for a workspace WITH a logo, a workspace logo image (max 48px tall) appears above the greeting with the workspace name as alt text."
  status: resolved
  resolved_by: 43-03
  resolved_at: 2026-11-06
  reason: "User reported: je n'ai pas le logo dans le digest"
  severity: major
  test: 4
  artifacts:  # filled by G-43-4 diagnosis
    - server.js:1608-1616 (sendDigest call site — logoUrl built correctly from logoShape(ws, docLogo(ws)))
    - server.js:5191-5205 (docLogo / logoShape — versioned URL builder, null when unset)
    - mailer.js:655,727 (buildDigestMessage — <img max-height:48px> emitted only when msg.logoUrl truthy, alt = workspace name)
    - CHANGELOG.md: [1.1.1] - 2026-10-22; docker-compose.yml:4 image: projects-studio:1.1.1
    - git log: e893ae9 "feat(43-2): digest email header workspace logo" committed 2026-11-06 (post-dates the 1.1.1 release)
  missing:    # what the deployed image lacks
    - buildDigestMessage logoUrl handling (mailer.js:655,727) — absent from projects-studio:1.1.1 image content
    - logoUrl plumbing at the sendDigest call site (server.js:1610-1616) — absent from projects-studio:1.1.1 image content

## Diagnoses

### G-43-4 — digest email shows no workspace logo
- **Date:** 2026-11-06
- **Root cause:** Stale deployment, not a code bug. The digest-logo feature was wired correctly in commit e893ae9 ("feat(43-2): digest email header workspace logo", committed 2026-11-06): the `runReminderPass` → `MAILER.sendDigest` call site (server.js:1608–1616) builds `logoUrl = APP_URL + logoShape(ws, docLogo(ws)).url` and `buildDigestMessage` (mailer.js:655, 727) emits the `<img max-height:48px alt={workspace}>` only when `logoUrl` is truthy. Unit tests (test/digest-logo.test.mjs) pass and live wiring matches them. However, the running deployment is `projects-studio:1.1.1` (docker-compose.yml:4), a release dated 2026-10-22 per CHANGELOG.md — two weeks BEFORE commit e893ae9. The user's digest was sent by code that predates the feature entirely, so no `<img>` could appear. (Ruled out: variable naming `ws`/`doc.data` mismatch, payload key `logoUrl` vs builder reading `msg.logoUrl` — both consistent; APP_URL vs appBase(req) mismatch — the reminder-pass path correctly uses the `APP_URL` env constant, same as the passing test; the `/api/internal/reminder-pass` route (server.js:3066–3071) calls the same `runReminderPass` code path containing the logoUrl plumbing.) The local Docker daemon has no `projects-studio:1.1.1` image to inspect, so the missing-code claim rests on the tag↔date mapping rather than direct image inspection — medium-high confidence, trivially confirmable by rebuilding.
- **Proposed fix scope:** Rebuild and redeploy: bump the compose image tag to one built from a commit ≥ e893ae9 (e.g. cut 1.2.0-draft or a 1.1.2 patch), `docker compose build && docker compose up -d`, then re-send a digest for a workspace with a logo. No source change required.
