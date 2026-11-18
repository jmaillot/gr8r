# Phase 74: Service Worker Verification & Milestone Acceptance - Context

**Gathered:** 2026-11-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Prove — with zero code changes to `public/sw.js`, `server.js` headers, or the Phase 73
banner — that the existing push service worker satisfies installability, then lock that
pass-through contract with new static tests, document the PWA posture in DEPLOY.md, and
run real-device UAT to accept the v2.7 milestone. New artifacts only: one test file, one
DEPLOY.md section, one UAT record.

</domain>

<decisions>
## Implementation Decisions

### SW pin mechanism & test placement
- **D-01:** New `test/sw-contract.test.mjs` pins the SW contract: a content-hash pin on
  `public/sw.js` (byte-identical proof vs the Phase 48/59 contract) + key-line byte pins,
  plus a manifest-scope↔SW-scope agreement assertion. One clear home for the whole
  Phase 74 SW contract; `test/manifest-contract.test.mjs` (Phase 72) stays untouched.

### DEPLOY.md PWA section
- **D-02:** New `## 18. Installable app (PWA)` section in `docs/DEPLOY.md`, following the
  file's numbered-section convention (after section 17). Self-contained: root-domain-only
  deployment constraint, iOS limitations (no `beforeinstallprompt`, manual Add to Home
  Screen), standalone no-back-button stance, strictly-online/no-caching decision, a short
  "why no custom SW" note, and one Lighthouse troubleshooting paragraph inside.

### UAT scope & evidence
- **D-03:** `74-UAT.md` in the phase dir, following the `73-UAT.md` pattern: 4 numbered
  human tests — (1) desktop Chrome install + standalone launch, (2) Android Chrome
  install + standalone launch, (3) iOS Safari honest manual-install path, (4) push
  notifications still fire after all changes. Evidence = short result line + optional
  screenshot per test, committed like Phase 73's UAT file (`human_needed` items).

### Registration pin coverage
- **D-04:** Static pins only, inside `test/sw-contract.test.mjs`: exactly one
  `navigator.serviceWorker.register` call site repo-wide (in `src/core/push.js`), the
  `'/sw.js'` literal with default scope, both `main.js` boot paths intact (the `load`
  listener at `src/main.js:136-137` and the `enterApp` re-fire at `src/main.js:323`),
  and the `api.enabled` gate in `push.js` untouched. Matches the
  `test/browser-push.test.mjs` forbidden-token style — no e2e browser test added.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone planning & research
- `.planning/research/SUMMARY.md` — Phase 74 / SW-verification guidance from v2.7 research.
- `.planning/REQUIREMENTS.md` — PWA-03 full text.
- `.planning/ROADMAP.md` — Phase 74 goal, success criteria 1–4, standing constraints.

### Prior-phase context (done dependencies)
- `.planning/phases/72-manifest-icons-head-integration/72-CONTEXT.md` — manifest/head
  decisions; `test/manifest-contract.test.mjs` exists (131 lines) and must stay untouched.
- `.planning/phases/73-install-hint-banner/73-CONTEXT.md` — banner decisions; banner and
  `sw.js` must not be touched this phase.
- `.planning/phases/73-install-hint-banner/73-UAT.md` — the UAT evidence pattern D-03 follows.

### Repo contracts the phase pins (never edits)
- `public/sw.js` — 48 lines; the byte-identical target of the hash pin.
- `test/browser-push.test.mjs` — forbidden-token contract (`fetch|install|activate|import`
  banned in sw.js); must stay green and is the stylistic model for sw-contract.test.mjs.
- `src/core/push.js` — sole `register('/sw.js')` call site (~line 163); registration is
  push-gated (`api.enabled`).
- `src/main.js:136-137` and `:323` — the two registration boot paths to pin.
- `server.js` `cacheControl()` — no-cache headers already extended to manifest in Phase 72.
- `docs/DEPLOY.md` — 1397-line numbered-section deployment guide; D-02 adds section 18.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `test/manifest-contract.test.mjs` (Phase 72) — the byte-pin / exact-line assertion style
  to mirror; note its file name (not `test/pwa.test.mjs` as Phase 72's context guessed).
- `test/browser-push.test.mjs` — forbidden-token contract test, stays green unchanged.
- `docs/DEPLOY.md` sections 16–17 — the newest sections; section 18 follows their format.
- `73-UAT.md` — UAT record format (numbered tests, result lines, human_needed persistence).

### Established Patterns
- Static contract tests pinning file shape (hash pins, byte-pinned lines, call-site counts).
- UAT evidence committed in the phase directory (Phase 73: UAT file → VERIFICATION digest).
- Zero-dependency verification: prove by pinning existing behavior, not adding runtime code.

### Integration Points
- New `test/sw-contract.test.mjs` — all static SW/registration pins.
- `docs/DEPLOY.md` — append `## 18. Installable app (PWA)` after section 17.
- New `.planning/phases/74-.../74-UAT.md` — 4 human UAT tests (human_needed).
- No production code changes: `public/sw.js`, `server.js`, `src/main.js`, `src/core/push.js`,
  and the banner module are all read-only this phase.

</code_context>

<specifics>
## Specific Ideas

- Owner picked the recommended option in every gray area, consistent with Phases 72/73:
  dedicated `sw-contract.test.mjs` with content-hash pin, DEPLOY.md numbered section 18,
  a lean 4-test UAT matrix, static-only registration pins (no e2e browser test).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 74-Service Worker Verification & Milestone Acceptance*
*Context gathered: 2026-11-18*
