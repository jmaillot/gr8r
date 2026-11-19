---
phase: 74-service-worker-verification-milestone-acceptance
reviewed: 2026-11-19T00:00:00Z
depth: standard
files_reviewed: 1
files_reviewed_list:
  - test/sw-contract.test.mjs
findings:
  critical: 0
  warning: 0
  info: 2
  total: 2
status: clean
---

# Phase 74: Code Review Report

**Reviewed:** 2026-11-19
**Depth:** standard
**Files Reviewed:** 1
**Status:** clean

## Summary

Reviewed `test/sw-contract.test.mjs` (standard depth), cross-checking every pin against the live source:

- **Byte pin:** `sha256sum public/sw.js` = `7a700dd8…cc5b8d`, matches `SW_HASH_PIN` (line 46). Test run passes.
- **Handler pins:** both `self.addEventListener('notificationclick'…)` and `('push'…)` substrings exist in `public/sw.js`.
- **Manifest pins:** `public/manifest.webmanifest` declares `scope: "/"`, `start_url: "/"`, `id: "/"`, `display: "standalone"` — matches the test assertions.
- **server.js cross-check:** `path.basename(file) === 'sw.js'` present at `server.js:8098`.
- **Registration contract:** exactly one `navigator.serviceWorker.register` call site repo-wide (`src/core/push.js:163`, with `'/sw.js'` literal); the `api.enabled` gate sits inside the `registerSw` export *before* the register call (`src/core/push.js:162`); both boot paths present in `src/main.js` (line 137 `addEventListener('load', registerSw)`, line 323 `registerSw(); // 59-UAT fix`).
- **Test run:** `node --test test/sw-contract.test.mjs` — all tests pass, 0 fail.

The registration-count test correctly counts the expression rather than the `registerSw` name — important because `src/main.js:136` defines a local `registerSw` arrow that would inflate a name-based count. Assertions use quoted substrings, not line numbers, per the stated RESEARCH pitfalls.

The 2 info-level notes below are robustness nits in the test itself; none affect current correctness.

## Info

### IN-01: Gate-order check can be satisfied by a comment mention of `!api.enabled`

**File:** `test/sw-contract.test.mjs:146-152`
**Issue:** `gateIdx` uses `push.indexOf('!api.enabled')` — the *first* occurrence of that substring anywhere in `push.js`. If a future comment or doc block mentions `!api.enabled` above the `registerSw` export, the positional assertion could pass or fail spuriously regardless of where the real gate sits. Currently correct (single occurrence at line 162, correctly ordered), so this is a latent-brittleness note only.
**Fix:** Anchor to the same quoted line pinned at line 142: `push.indexOf("if (!('serviceWorker' in navigator) || !api.enabled) return;")` — reuse the exact gate expression already asserted verbatim.

### IN-01-equivalent / IN-02: `import.meta.dirname` requires Node ≥ 20.11

**File:** `test/sw-contract.test.mjs:42`
**Issue:** `import.meta.dirname` is only available in Node 20.11+/21.2+. On older Node the whole suite crashes with a TypeError before any assertion runs, which looks like a broken contract rather than an environment mismatch. No `engines` guard is visible in this file (whether the repo pins a Node version elsewhere was not in scope).
**Fix:** Either rely on the repo's documented minimum Node version, or fall back defensively: `const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');` (or `fileURLToPath`). Zero-cost hardening.

---

_No critical or warning findings. Both info items are optional hardening; the file is correct as written and all pins verify against live source._

_Reviewed: 2026-11-19_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
