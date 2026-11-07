# Phase 43: Workspace Logo - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-06
**Phase:** 43-Workspace Logo
**Areas discussed:** Upload & storage, Where it appears, Data model & fallback, Display shape

---

## Upload & Storage

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated logo route (Recommended) | New POST /w/:slug/logo route storing in its own directory (e.g. /data/logos), reference recorded on the workspace | ✓ |
| Reuse files/ uploads | Store through the existing /w/:slug/files path and reference the file id on the workspace | |
| In-database blob | Store bytes directly in SQLite — fights the zero-migration constraint | |

| Option | Description | Selected |
|--------|-------------|----------|
| Public route (Recommended) | GET /w/:slug/logo serves publicly, workspace-scoped path — digest emails and favicon can reference it | ✓ |
| Session-gated | Logo requires session; emails/tab need signed URLs | |

| Option | Description | Selected |
|--------|-------------|----------|
| png/jpg/svg (Recommended) | Matches roadmap criteria and the favicon.svg precedent; SVG inline as image/svg+xml | ✓ |
| Raster only | PNG/JPG/WebP/GIF — rejects the format the fallback itself uses | |

| Option | Description | Selected |
|--------|-------------|----------|
| Existing 25MB cap | Reuses MAX_UPLOAD_MB as-is, one knob | ✓ |
| Tighter logo cap | Separate 2–5MB cap for logos | |

**User's choice:** Dedicated route, public serving, png/jpg/svg, existing 25MB cap
**Notes:** None — accepted all recommendations.

---

## Where It Appears

| Option | Description | Selected |
|--------|-------------|----------|
| Sidebar/topbar | Next to ws.name in src/shell/layout.js | ✓ |
| Settings page | Workspace General page header with upload/remove controls | ✓ |
| Digest emails | Digest email header shows the logo | ✓ |
| Browser tab favicon | Dynamic per-workspace favicon swap | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Client swap (Recommended) | JS updates <link rel=icon> href on workspace load; fallback to favicon.svg; no SW/manifest involvement | ✓ |
| Include SW/manifest | Also touch service worker icons — more staleness surface | |
| Tab stays stock | Global favicon.svg always | |

| Option | Description | Selected |
|--------|-------------|----------|
| Digest only (Recommended) | Logo in the digest header only; reminders/notifications keep text identity | ✓ |
| All emails | Logo header on every notification email | |

| Option | Description | Selected |
|--------|-------------|----------|
| No, scope as decided | Keep scope tight: sidebar + settings + digest + favicon only | ✓ |
| Login/onboarding | Logo on pre-auth surfaces | |
| Dashboard header | Logo in dashboard welcome | |

**User's choice:** All four surfaces; client-side favicon swap; digest-only; no additional surfaces
**Notes:** None.

---

## Data Model & Fallback

| Option | Description | Selected |
|--------|-------------|----------|
| Workspace document (Recommended) | Logo fields on the workspace doc — zero migration, doc-channel pattern | ✓ |
| Stored row | Dedicated row à la Phase 34 prefs — needs a new table/migration | |

| Option | Description | Selected |
|--------|-------------|----------|
| Replace + delete (Recommended) | New upload replaces reference and deletes old file immediately | ✓ |
| Leak old files | Old file stays on disk until a cleanup pass | |

| Option | Description | Selected |
|--------|-------------|----------|
| Per-surface fallback (Recommended) | Each consumer renders /favicon.svg itself; no redirect | ✓ |
| Server 302 fallback | GET logo route redirects when unset — redirecting image URLs can look like tracking | |

| Option | Description | Selected |
|--------|-------------|----------|
| Versioned URL (Recommended) | Content-addressed /w/:slug/logo?v=<uploaded_at> — instant cache-bust on new upload | ✓ |
| no-cache headers | Fixed URL, re-downloaded every load | |

**User's choice:** Workspace document, replace+delete, per-surface fallback, versioned URL
**Notes:** None.

---

## Display Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Small square (Recommended) | ~20–24px rounded avatar-style slot beside ws.name, CSS-fit | ✓ |
| Full logo block | Natural aspect ratio above nav — forces wide logos | |

| Option | Description | Selected |
|--------|-------------|----------|
| As-is, CSS-fit (Recommended) | No server-side processing, zero new dependencies | ✓ |
| Dimension check only | Optional upload-time pixel-dimension validation (no re-encode) | |

| Option | Description | Selected |
|--------|-------------|----------|
| Inline svg+xml (Recommended) | SVG served inline, same trust class as app's own SVG assets, role-gated upload | ✓ |
| Attachment-only SVG | Would break SVG logos in tab/email — defeats the feature | |

| Option | Description | Selected |
|--------|-------------|----------|
| Capped img (Recommended) | Digest header img, max-height ~48px, alt = workspace name | ✓ |
| No email logo | Digest stays text-only | |

**User's choice:** Small square avatar, serve as-is with CSS fit, inline svg+xml, capped digest img
**Notes:** Dimension check left to agent discretion.

---

## the agent's Discretion

- Doc field shape/naming for the logo reference
- Storage directory location and file naming scheme
- Optional upload-time dimension check
- Exact CSS values for the avatar slot and digest header cap
- Versioned-URL parameter computation (epoch vs content hash)
- Digest template insertion point and i18n key names

## Deferred Ideas

- Logo in individual notification/reminder emails (digest-only for now)
- Per-member avatars / user profile images — own phase
- Client-side crop/resize before upload
- Service-worker/manifest favicon theming (PWA icon set)
