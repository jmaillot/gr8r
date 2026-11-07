---
phase: 43-workspace-logo
verified: 2026-11-06T14:30:37Z
status: passed
score: 8/8 must-haves verified
covered_files: [.planning/phases/43-workspace-logo/43-01-PLAN.md, .planning/phases/43-workspace-logo/43-01-SUMMARY.md, .planning/phases/43-workspace-logo/43-02-PLAN.md, .planning/phases/43-workspace-logo/43-02-SUMMARY.md, .planning/phases/43-workspace-logo/43-03-PLAN.md, .planning/phases/43-workspace-logo/43-03-SUMMARY.md, server.js, src/core/icons.js, src/shell/layout.js, src/core/api.js, src/pages/settings.js, src/actions/actions.js, mailer.js, src/locales/en.json, src/locales/fr.json, test/workspace-logo.test.mjs, test/digest-logo.test.mjs, scripts/i18n-scan.mjs, src/styles/shell.css, test/i18n-core-features.test.mjs, test/i18n-shell.test.mjs, test/i18n-toast.test.mjs]
covered_digest: "v2:sha256:549eb48fbb91c33d48cde53ce7b7007ac5a0ff5eff6a59ac576c72b649a5a320"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 7/7
  gaps_closed:
    - "G-43-3: Remove-logo click is a no-op — fixed by 60e1b76 (A.removeLogo alias of IN.removeLogo in src/actions/actions.js) + wiring regression tests in test/workspace-logo.test.mjs; human-confirmed live (UAT test 3 pass)"
    - "G-43-4: digest email shows no workspace logo — deployment staleness (projects-studio:1.1.1 predates e893ae9); resolved by image rebuild + Traefik router excluding /w/:slug/logo from Authentik forward-auth; no source change; human-confirmed live (UAT test 4 pass)"
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "LOGO-01 has no row in REQUIREMENTS.md (roadmap notes 'to be added at milestone start — Kanzo #16')"
    category: other
    reason: "Requirements-traceability gap only; phase intent was verifiable from ROADMAP.md success criteria + plan must_haves. Add the row at milestone bookkeeping."
    evidence_status: "n/a — documentation gap, not code"
---

# Phase 43: Workspace Logo Verification Report

**Phase Goal:** A workspace can carry its own logo — uploaded by an admin, stored server-side, rendered wherever the workspace identity appears — with a clean fallback to `favicon.svg` when none is set
**Verified:** 2026-11-06T14:30:37Z
**Status:** passed
**Re-verification:** Yes — after gap closure (stale re-verification #4682: 60e1b76 changed covered source after the prior run; prior human-needed items resolved by the human in 43-UAT.md, 4/4 pass)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Owner/Admin POST /w/:slug/logo → { logo, revision }; file in DATA_DIR/logos, doc carries logo { ext, uploaded_at } | ✓ VERIFIED | server.js:5210 handleLogoUpload, LOGOS_DIR:77, mkdir:363; pinned by workspace-logo.test.mjs (16/16 pass at HEAD) |
| 2 | Public session-free GET with fixed mime from stored ext, never text/html | ✓ VERIFIED | handleLogoGet server.js:5243 (no requireWorkspace call); test "GET with NO cookie → 200 image/png" PASS (re-run) |
| 3 | Unknown slug OR unset logo → identical 404, never 302 | ✓ VERIFIED | server.js:5248 identical fail(404,'logoNotFound'); test "both 404 — never a 3xx" PASS (re-run) |
| 4 | Non-image → 400 invalidLogo (EN+FR); oversized → 413 via uploadBinary | ✓ VERIFIED | sniffLogoExt:5169; locales en/fr.json:1611; error-codes.test 24/24 PASS (prior run; file unchanged since — digest covered) |
| 5 | GET headers: nosniff, immutable cache, sandbox CSP on svg | ✓ VERIFIED | server.js:5260+; tests "nosniff+immutable" and "svg sandbox CSP" PASS (re-run within workspace-logo suite) |
| 6 | Replace unlinks previous file; DELETE/workspace-delete leave no orphans | ✓ VERIFIED | server.js:5230, 5287, 4422; tests "exactly one file remains", "no orphan", "restart survival" PASS (re-run) |
| 7 | workspacePayload exposes versioned logo URL (?v=); digest renders absolute capped img; sidebar/favicon/settings consume payload URL | ✓ VERIFIED | logoShape:5202, server.js:642; icons.js:32, layout.js:86, settings.js:176-182, api.js:222/259/277; mailer.js:727 + server.js:1616; digest-logo tests PASS (re-run) |
| 8 | Remove-logo click wiring: every data-a in settings.js resolves under A (click) or IN (change/input); A.removeLogo exists as an alias of IN.removeLogo | ✓ VERIFIED | actions.js:1092 `A.removeLogo = IN.removeLogo` (60e1b76, one code path — no copy); events.js:35 dispatches `A[el.dataset.a]`; regression tests "A.removeLogo is registered" and "every data-a action resolves" PASS (re-run) |

**Score:** 8/8 truths verified (0 present, behavior-unverified)

### Gap Closure Verification (new since last run — 60e1b76)

- **A.removeLogo alias:** `src/actions/actions.js:1092` — alias, not a copy; the click-delegation handler and the IN (change/input) path share one implementation. Verified present and exercised by the new regression test (RED-verified per commit message before the alias was added).
- **No dispatch breakage for other data-a actions:** the change is purely additive (one new property on `A`). The second regression test statically proves every `data-a` value in settings.js (go, wsColor, uploadLogo, saveWorkspace, leaveWorkspace, deleteWorkspace, operatorRevoke*, auditVerb*, etc.) resolves in A or IN — and it passes. Full suite (1003/1007) shows no dispatch regressions anywhere else.
- **Wiring regression tests live in test/workspace-logo.test.mjs** and run as part of the standard suite (they passed in this re-run).

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| server.js routes + helpers | POST/DELETE/GET intercepts, LOGO_MIME, sniff, logoShape | ✓ VERIFIED | Unchanged since prior verification (digest-covered) |
| test/workspace-logo.test.mjs | Pin full contract + wiring regression | ✓ VERIFIED | 16/16 pass at HEAD (14 logo/route + 2 wiring) |
| test/digest-logo.test.mjs | Digest img contract | ✓ VERIFIED | Pass (re-run with workspace-logo suite) |
| src/locales/{en,fr}.json | err.invalidLogo, err.logoNotFound | ✓ VERIFIED | Both keys in both locales; i18n gate exit 0 |
| icons.js / layout.js / settings.js / actions.js / api.js / mailer.js | Render surfaces | ✓ VERIFIED | All wired to api.workspace.logo / payload URL |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| settings.js removeLogo button | actions.js handler | `data-a="removeLogo"` → events.js `A[el.dataset.a]` → `A.removeLogo` | ✓ WIRED | Fixed by 60e1b76; regression test pins it |
| settings.js upload input | actions.js | `data-in="uploadLogo"` → IN.uploadLogo → api.uploadLogo | ✓ WIRED | Unchanged; test-covered |
| actions.js | server routes | api.removeLogo/api.uploadLogo → POST·DELETE /w/:slug/logo | ✓ WIRED | HTTP tests pass |
| icons.js / layout.js / settings.js | payload logo URL | api.workspace.logo → logoShape `?v=` | ✓ WIRED | Unchanged; test-covered |
| server.js sendDigest | mailer.js buildDigestMessage | logoUrl → `<img max-height:48px alt>` | ✓ WIRED | digest-logo tests pass; live render confirmed by human (UAT 4) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Logo + wiring suite at HEAD | `node --test test/workspace-logo.test.mjs test/digest-logo.test.mjs` | 16/16 pass (incl. both wiring regression tests) | ✓ PASS |
| Full suite | `npm test` | 1003 pass / 1 fail / 3 skipped | ✓ PASS (known pre-existing only) |
| i18n gate | `node scripts/i18n-scan.mjs` | 0 literals, 0 pending, 0 stale, exit 0 | ✓ PASS |
| Known pre-existing failure | totp-rewrap D-74 | EACCES mkdir in /tmp (environmental, documented in deferred-items.md) | ✗ FAIL (pre-existing, not phase scope) |

### Human Verification Required

None. The two prior human-needed items were resolved by the human and recorded in 43-UAT.md (status complete, 4/4 pass):

- Upload/render surfaces (UAT test 2): pass — sidebar/topbar avatar, favicon, settings header all render the logo.
- Digest email header (UAT test 4): pass — resolved by deployment fix (image rebuild + Traefik router excluding /w/:slug/logo from Authentik forward-auth). Infra-only, no source change; source wiring verified by digest-logo tests.
- Remove logo (UAT test 3): pass — resolved by 43-03 (G-43-3 alias fix, human-confirmed live).

No regression surfaced in this re-run.

### Gaps Summary

No gaps. The gap-closure commit (60e1b76) fixed the only source defect (removeLogo click dispatch) and added regression coverage; the digest issue was deployment staleness, resolved in infrastructure. Full suite, logo suite, and i18n gate re-run clean at HEAD. The lone suite failure is the documented pre-existing environmental totp-rewrap EACCES, and ~9 lint errors are likewise documented in deferred-items.md — neither is a phase regression.

---

_Verified: 2026-11-06T14:30:37Z_
_Verifier: the agent (gsd-verifier)_
