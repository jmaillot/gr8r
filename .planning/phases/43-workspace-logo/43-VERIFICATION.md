---
phase: 43-workspace-logo
verified: 2026-11-06T12:40:12Z
status: human_needed
score: 7/7 must-haves verified
covered_files: [server.js, src/core/icons.js, src/shell/layout.js, src/core/api.js, src/pages/settings.js, src/actions/actions.js, mailer.js, src/locales/en.json, src/locales/fr.json, test/workspace-logo.test.mjs, test/digest-logo.test.mjs, scripts/i18n-scan.mjs, src/styles/shell.css, test/i18n-core-features.test.mjs, test/i18n-shell.test.mjs, test/i18n-toast.test.mjs]
covered_digest: "v2:sha256:7a515e9550cd0b853c24d7506893493e239b2cbeb43f82cd261721a281799eaa"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Upload a png as admin from Settings > General > Workspace; check sidebar/topbar avatar (~22px), browser-tab favicon, and the 52px settings header"
    expected: "Logo renders in all three DOM surfaces, rounded/avatar-sized, no layout shift; Remove logo button appears; after remove, letter-mark and /favicon.svg fall back byte-identically"
    why_human: "Visual rendering, CSS-fit and favicon display are DOM/browser behaviors no test observes"
  - test: "Send a digest for a workspace with a logo set, open the email"
    expected: "Header shows the logo <img> capped at 48px with alt = workspace name, absolute URL; unset-logo workspaces show the unchanged text-only header"
    why_human: "Email client rendering of the MIME part can't be verified programmatically"
advisory:
  - finding: "LOGO-01 has no row in REQUIREMENTS.md (roadmap notes 'to be added at milestone start — Kanzo #16')"
    category: other
    reason: "Requirements-traceability gap only; phase intent was verifiable from ROADMAP.md success criteria + plan must_haves. Add the row at milestone bookkeeping."
    evidence_status: "n/a — documentation gap, not code"
---

# Phase 43: Workspace Logo Verification Report

**Phase Goal:** A workspace can carry its own logo — uploaded by an admin, stored server-side, rendered wherever the workspace identity appears — with a clean fallback to `favicon.svg` when none is set
**Verified:** 2026-11-06T12:40:12Z
**Status:** human_needed (visual/email surfaces only; all code truths verified)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Owner/Admin POST /w/:slug/logo → { logo, revision }; file in DATA_DIR/logos, doc carries logo { ext, uploaded_at } | ✓ VERIFIED | server.js:5210 handleLogoUpload, LOGOS_DIR:77, mkdir:363; pinned by workspace-logo.test.mjs (upload/revision/replace tests) |
| 2 | Public session-free GET with fixed mime from stored ext, never text/html | ✓ VERIFIED | handleLogoGet server.js:5243 (no requireWorkspace call); test "GET with NO cookie → 200 image/png" PASS |
| 3 | Unknown slug OR unset logo → identical 404, never 302 | ✓ VERIFIED | server.js:5248 identical fail(404,'logoNotFound'); test "both 404 — never a 3xx" PASS |
| 4 | Non-image → 400 invalidLogo (EN+FR); oversized → 413 via uploadBinary | ✓ VERIFIED | sniffLogoExt:5169; locales en/fr.json:1611; error-codes.test 24/24 PASS |
| 5 | GET headers: nosniff, immutable cache, sandbox CSP on svg | ✓ VERIFIED | server.js:5260+; tests "nosniff+immutable" and "svg sandbox CSP" PASS |
| 6 | Replace unlinks previous file; DELETE/workspace-delete leave no orphans | ✓ VERIFIED | server.js:5230, 5287, 4422; tests "exactly one file remains", "no orphan" PASS |
| 7 | workspacePayload exposes versioned logo URL (?v=); digest renders absolute capped img; sidebar/favicon/settings consume payload URL | ✓ VERIFIED | logoShape:5202, server.js:642; icons.js:32, layout.js:86, settings.js:176-182, api.js:222/259/277; mailer.js:727 + server.js:1616; digest-logo.test 3/3 PASS |

All behavior-dependent truths (state transitions: replace-unlink, delete cleanup, restart survival, 404-not-302) are exercised by passing tests — no PRESENT_BEHAVIOR_UNVERIFIED items.

**Score:** 7/7 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| server.js routes + helpers | POST/DELETE/GET intercepts, LOGO_MIME, sniff, logoShape | ✓ VERIFIED | All symbols present; intercept sits BEFORE serveStatic and /api/ (server.js:5589) |
| test/workspace-logo.test.mjs | Pin full contract | ✓ VERIFIED | 14 logo+route tests pass (with file-route-ordering) |
| test/digest-logo.test.mjs | Digest img contract | ✓ VERIFIED | 3/3 pass |
| src/locales/{en,fr}.json | err.invalidLogo, err.logoNotFound | ✓ VERIFIED | Both keys in both locales |
| icons.js / layout.js / settings.js / actions.js / api.js / mailer.js | Render surfaces | ✓ VERIFIED | All wired to api.workspace.logo / payload URL |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| logo intercept chain | before serveStatic / /api/ | if/else order server.js:5589 | WIRED | file-route-ordering.test 3/3 PASS (no SPA fallback) |
| POST/DELETE responses | wsRevision | revision field | WIRED | pinned by tests |
| served mime | stored ext (doc) | LOGO_MIME[logo.ext]:5260 | WIRED | never req Content-Type |
| client upload | raw body POST | api.js:259 fetch(file) | WIRED | no query params, no transform |
| revision adoption | api adoptRevision before next write | api.js:270/279 | WIRED | grep-verifiable |
| digest img | APP_URL + versioned URL | server.js:1616 | WIRED | absolute, escapeHtml'd (mailer.js:727) |
| sidebar/favicon/settings | workspacePayload.logo | api.workspace?.logo?.url | WIRED | single source, never hand-built |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Logo + route + digest + error-code tests | node --test (4 files) | 41 pass / 0 fail | ✓ PASS |
| i18n gate | npm run i18n:scan | 0 literals/pending/unlisted/stale | ✓ PASS |
| Build (prebuild i18n) | npm run build | built in 2.51s | ✓ PASS |
| Full suite | npm test | 1001 pass / 1 fail / 3 skip | ✓ PASS (fail = pre-existing totp-rewrap D-74) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| LOGO-01 | 43-01, 43-02 | Per-workspace logo upload, storage, render surfaces, favicon fallback | ✓ SATISFIED (against ROADMAP SCs 1-5) | All 5 roadmap success criteria verified above |
| LOGO-01 (REQUIREMENTS.md row) | — | Missing row | ⚠️ Documentation gap | Advisory — add at milestone bookkeeping |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none in phase files) | — | — | — | — |

Pre-existing (deferred-items.md, confirmed at HEAD): totp-rewrap D-74 EACCES test failure; 9 lint errors in mailer/digest test files — neither caused by this phase.

### Human Verification Required

See frontmatter `human_verification`: (1) DOM render of sidebar avatar + favicon + settings header with fallback; (2) digest email header img in a real email client.

### Gaps Summary

No code gaps. All 7 must-have truths verified with passing behavioral tests; full suite green (single pre-existing failure documented before this phase); zero new runtime dependencies (package.json deps: 0); i18n gate green. Status is human_needed solely for visual/email-client rendering. LOGO-01's missing REQUIREMENTS.md row recorded as advisory documentation debt.

---

_Verified: 2026-11-06T12:40:12Z_
_Verifier: the agent (gsd-verifier)_
