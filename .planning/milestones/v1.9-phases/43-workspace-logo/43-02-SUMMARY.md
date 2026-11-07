---
phase: 43-workspace-logo
plan: 02
subsystem: client,email
tags: [logo, avatar, favicon, settings, digest-email, i18n]
requires: [LOGO-01]
provides:
  - wsLogo <img> branch (shared avatar slot for sidebar/topbar + settings header)
  - applyWsFavicon client favicon swap with /favicon.svg per-surface fallback
  - api.uploadLogo / api.removeLogo (raw-body POST/DELETE + revision adoption)
  - Settings > General > Workspace Owner/Admin upload/remove controls
  - digest email header <img> (absolute versioned URL, 48px cap, escaped alt)
affects:
  - future per-member avatars (shared wsLogo slot shape)
  - any consumer of workspacePayload.logo
tech-stack:
  added: []
  patterns:
    - single payload source (api.workspace.logo) merged onto the doc ws object at render call sites — never persisted into the doc
    - api-owned revision adoption (adoptRevision) for non-doc-mutating endpoints
    - mime-decode digest HTML in unit tests (base64 MIME part)
key-files:
  created:
    - test/digest-logo.test.mjs
  modified:
    - src/core/icons.js
    - src/shell/layout.js
    - src/styles/shell.css
    - src/core/api.js
    - src/pages/settings.js
    - src/actions/actions.js
    - mailer.js
    - server.js
    - src/locales/en.json
    - src/locales/fr.json
    - scripts/i18n-scan.mjs
    - test/i18n-core-features.test.mjs
    - test/i18n-shell.test.mjs
    - test/i18n-toast.test.mjs
decisions:
  - logo lives on api.workspace (payload state), NOT on the doc's ws object — merging it into S.data.ws would echo a redundant, stale-able field into the server doc on every save
  - uploadLogo/removeLogo implemented as api methods (they own state.workspace + the module-private adoptRevision); actions.js carries the IN handlers only
  - favicon swap runs at the top of renderSidebar (idempotent, workspace-context is guaranteed live there) — no new bootstrap hook in main.js needed
  - digest logoUrl composed server-side from APP_URL at the sendDigest call site with NO https gate (an <img> URL is not a security-header contract, unlike the Phase 41 unsubscribe gating)
  - i18n-scan machineCategory extended for fetch(url, { method: 'POST' }) — principled rule, not an allow-list entry
metrics:
  duration: 47m
  completed: 2026-11-06
status: complete
commits: 4
plan_head_before: 0cfa89f
plan_head_after: e44a430
actuals:
  tokens: 88000
  tasks: 3
  commits: 4
---

# Phase 43 Plan 02: Workspace Logo — Render Surfaces (Sidebar, Favicon, Settings, Digest) Summary

**One-liner:** The workspace logo now renders in all four closed surfaces — sidebar/topbar avatar, browser-tab favicon, Settings workspace header with Owner/Admin upload/remove controls, and the digest email header — every one falling back per-surface to the letter-mark / favicon.svg / text-only identity, with the versioned payload URL as the single source and zero new dependencies.

## What Was Built

1. **Shared avatar slot (icons.js)** — `wsLogo(w, px)` renders `<img class="ws-logo" src="${esc(w.logo.url)}" …alt="">` when `w.logo` is set (empty alt — the adjacent ws-name names the workspace), letter-mark/brand branch byte-intact otherwise. `shell.css` adds `object-fit: cover` to `.ws-logo` (CSS-fit only, D-12/D-13 — no server/client re-encoding).
2. **Favicon swap (layout.js)** — `applyWsFavicon()` reads `api.workspace?.logo?.url || '/favicon.svg'` into `link[rel="icon"]`; called at the top of `renderSidebar`, i.e. on every render while a workspace context is live (D-06/D-10, idempotent, no service-worker/manifest touch).
3. **Client payload plumbing (api.js)** — `loadWorkspace` adopts the versioned `logo` field from workspacePayload; new `uploadLogo(file)` POSTs the **raw file body** (no query params, no client transformation — D-13) and `removeLogo()` DELETEs, both adopting the returned `revision` via the module-private `adoptRevision` BEFORE any next doc write (Pitfall 2 — no 409 on the next save).
4. **Settings workspace header (settings.js + actions.js)** — the 52px `wsLogo` header now merges the payload logo; "Upload logo" (file picker, `accept="image/png,image/jpeg,image/svg+xml"`) and "Remove logo" (only when set) are gated on the existing `wsAdmin` conditional. `IN.uploadLogo` / `IN.removeLogo` handlers + `settings.ws.uploadLogo` / `settings.ws.removeLogo` catalogued EN+FR.
5. **Digest header (server.js + mailer.js)** — the sendDigest call site composes `logoUrl: ${APP_URL}/w/${slug}/logo?v=<uploaded_at>` — absolute, versioned, exactly like the taskUrl deep links (Pitfall 8); omitted entirely when unset (D-10). `buildDigestMessage` emits `<img src alt="{workspace}" style="max-height:48px;display:block">` before the greeting, `escapeHtml`'d, only when `logoUrl` is truthy (D-07). Reminder/notification builders untouched.
6. **Tests** — `test/digest-logo.test.mjs`: 3 unit tests (img emitted with absolute/versioned src + 48px cap + workspace alt; hostile logoUrl escapeHtml'd; no img when absent/empty).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] api.loadWorkspace adopted the payload `logo` field**
- **Found during:** Task 1
- **Issue:** Plan 01 ships `workspacePayload.logo`, but the client dropped the field (`state.workspace` = id/name/slug/color/role) — no consumer could read `w.logo` without it.
- **Fix:** `logo: r.data.logo || null` adopted in loadWorkspace; patchWorkspace already spreads `...next`.
- **Files modified:** src/core/api.js
- **Commit:** ca62a9a

**2. [Rule 2 - Missing critical] uploadLogo/removeLogo live in api.js, not actions.js**
- **Found during:** Task 2
- **Issue:** Revision adoption (Pitfall 2) requires `state.workspace` and the module-private `adoptRevision` — both owned by the api layer.
- **Fix:** api methods own the calls + adoption; actions.js keeps the plan's IN handler surface.
- **Files modified:** src/core/api.js, src/actions/actions.js
- **Commit:** e8b0ae4

**3. [Rule 1 - Broken assertions] Four i18n gate assertions tracked the new surface**
- **Found during:** Full-suite verification
- **Issue:** Catalogue count 1678→1680 (2 new keys), call-verb count 42→43 (removeLogo DELETE), tree-wide data-a count 466→467 in BOTH i18n-shell and i18n-toast sweeps (remove-logo button) — hard-coded fingerprints, same deviation class as 43-01.
- **Fix:** Assertions bumped with 43-02 comments.
- **Files modified:** test/i18n-core-features.test.mjs, test/i18n-shell.test.mjs, test/i18n-toast.test.mjs
- **Commit:** e44a430

**4. [Rule 3 - Blocking] i18n-scan flagged `fetch(url, { method: 'POST' })` as an unexplained literal**
- **Found during:** Full-suite verification
- **Issue:** `machineCategory` recognised HTTP verbs only as `call()`/`open()` first args; the raw-body logo upload cannot ride the JSON `call()` helper, so its `method: 'POST'` tripped the raw coverage sweep.
- **Fix:** Principled rule added: object property NAMED `method` holding an HTTP verb = `HTTP_VERBS` machine value (scripts/i18n-scan.mjs). No allow-list entry.
- **Files modified:** scripts/i18n-scan.mjs
- **Commit:** e44a430

## Verification

- `npm run build` (prebuild i18n:scan) — green
- `npm run i18n:scan` — 0 literals, 0 pending, 0 unlisted, 0 stale
- `node --test test/error-codes.test.mjs` — 24/24
- `node --test test/digest-logo.test.mjs` — 3/3 (new)
- `node --test test/digest.test.mjs` — 20/20 (Phase 40 digest contract unmodified)
- `node --test test/workspace-logo.test.mjs test/file-route-ordering.test.mjs` — 14/14
- `npm test` — 1001 pass / **1 fail / 3 skips**; the 1 failure is the PRE-EXISTING `test/totp-rewrap.test.mjs` D-74 (documented in 43-01's deferred-items, failing at plan_head_before before any phase-43 change)
- `npm run lint` — 9 errors, ALL pre-existing (mailer.js:57 control-regex, digest/subject-encode/unsubscribe-route test unused-vars/regex errors; none in files/lines this plan added)
- Zero new runtime dependencies (package.json untouched)

## Threat Model Compliance

| Threat | Mitigation | Status |
|--------|-----------|--------|
| T-43-07 (digest img disclosure) | absolute escapeHtml'd URL; omitted when unset — no placeholder probing; no https gate needed (img ≠ security-header contract) | ✅ pinned by digest-logo tests (2)(3) |
| T-43-08 (favicon/sidebar tampering) | URL solely from workspacePayload.logo via api.workspace; esc() on interpolation; no client URL construction | ✅ grep-verifiable single source |
| T-43-09 (settings controls) | UI gated on existing wsAdmin conditional (UX only); server re-enforces the admin gate | ✅ conditional inherited, server tests from 43-01 |
| T-43-SC (installs) | no package installs; D-13 held | ✅ |

## Out-of-Scope (documented, not fixed)

Pre-existing lint errors (9) and the totp-rewrap D-74 failure — both in `deferred-items.md`, both pre-dating this plan.

## Self-Check: PASSED

- All 8 plan `<files>` + 6 deviation files present on disk; test/digest-logo.test.mjs exists, 3/3 green
- Commits measured from ledger base 0cfa89f: 4 (ca62a9a, e8b0ae4, e893ae9, e44a430); the docs commit below is not counted per protocol
- Self-check verified: all four hashes present in git log; 14/14 logo+route tests and 3/3 digest-logo tests green at HEAD
