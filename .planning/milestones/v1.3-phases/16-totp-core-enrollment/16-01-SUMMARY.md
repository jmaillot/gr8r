---
phase: 16-totp-core-enrollment
plan: 01
subsystem: auth-totp-core
tags: [totp, rfc-4226, rfc-6238, base32, qr, vendored, recovery-codes, timing-safe]
requires: []
provides:
  - totp.js module (base32Decode, hotp, totpAt, verifyTotpCode, buildOtpauthUri, generateRecoveryCode, normalizeRecoveryCode, recoveryHash, generateTotpSecret)
  - src/lib/qr.js renderQrSvg(otpauthUri) → inline SVG
  - src/lib/vendor/qrcode.js vendored qrcode-generator@2.0.4 encoder
  - test/totp.fixture.test.mjs + test/qr.fixture.test.mjs fixture tests
affects: [16-02 routes, 16-03 settings UI, phase 17 login second step]
tech-stack:
  added: []
  patterns: [RFC-vector-proven crypto helpers, vendored dist file behind thin wrapper]
key-files:
  created: [totp.js, src/lib/qr.js, src/lib/vendor/qrcode.js, test/totp.fixture.test.mjs, test/qr.fixture.test.mjs]
  modified: [scripts/i18n-scan.mjs, test/i18n-scan.test.mjs]
decisions:
  - "TOTP helpers live in top-level totp.js (repo root, sibling of server.js) — NOT under src/ so Vite never bundles server crypto; Phase 17 imports it verbatim (Open Question 1 resolved)"
  - "otpauth label = `Projects:${encodeURIComponent(email)}` — only the email is encoded; the Projects: prefix stays literal to match D-54's exact URI shape"
metrics:
  duration: ~6 min
  completed: 2026-10-27
status: complete
actuals:
  tokens: 51000
  tasks: 3
  commits: 2
commits: 2
plan_head_before: 05fd0b749b1454ff8c06ff04407c87a8ec45ee0a
plan_head_after: 540392ea1c68948397092cda3d77e0d036bfff15
---

# Phase 16 Plan 01: TOTP Core & Vendored QR Summary

RFC-verified `node:crypto` TOTP core with the D-04 replay guard, plus the vendored qrcode-generator@2.0.4 encoder behind a thin `renderQrSvg` wrapper — proven by 15 RFC fixture vectors and a real-matrix SVG fixture test before any route touches them.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | RFC-verified TOTP core (tracer, TDD) | b3856df | totp.js, test/totp.fixture.test.mjs |
| 2 | Vendor qrcode-generator@2.0.4 + wrapper | 540392e | src/lib/vendor/qrcode.js, src/lib/qr.js, test/qr.fixture.test.mjs, scripts/i18n-scan.mjs, test/i18n-scan.test.mjs |
| 3 | Finalization + placement decision recorded | 540392e (amended conventional message) | — |

## TDD Flow (Task 1)

- **RED:** test/totp.fixture.test.mjs written first; ran and failed (totp.js did not exist).
- **GREEN:** totp.js implemented per RESEARCH Pattern 1/2 verbatim; all 20 tests passed (15 RFC vectors + window/replay/format/URI/recovery/secret cases).
- No REFACTOR needed — one-liner helper style matches server.js crypto-block conventions.

## Verification

- `node --test test/totp.fixture.test.mjs` — 20 pass / 0 fail (all RFC 4226 + 6238 SHA-1 vectors, ±1 window, replay guard `<= lastStep`, format gate before timingSafeEqual, hostile-email URI, Base32 padding tolerance)
- `node --test test/qr.fixture.test.mjs` — 6 pass / 0 fail (real matrix >50 cells, square viewBox, deterministic, hostile-email URI encodes)
- `npm test` — 497 pass / 0 fail; zero runtime dependencies intact (package.json has no `dependencies` key)
- Vendored file sha256-verified byte-identical to unpkg dist source: `ea91d7118a539528…`
- Acceptance greps: totp.js contains `timingSafeEqual` + `0x7f`, no `qrcode`; qr.js contains `createSvgTag` + `cellSize: 4` + `margin: 4`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] buildOtpauthUri encoded the `Projects:` prefix itself**
- **Found during:** Task 1 (GREEN — first run failed 2 tests)
- **Issue:** `encodeURIComponent('Projects:' + email)` produced `Projects%3Auser%40…`, which does not match D-54's exact URI (`otpauth://totp/Projects:user%40example.com?…`)
- **Fix:** encode only the email: `` `Projects:${encodeURIComponent(email)}` ``
- **Files modified:** totp.js
- **Commit:** b3856df

**2. [Rule 3 - Blocking] i18n scanner flagged a literal in the vendored file**
- **Found during:** Task 2 (npm test went red: the scanner reported `'Byte'` at src/lib/vendor/qrcode.js:386 as an unlisted user-visible literal)
- **Issue:** the scanner walks all of src/ and the vendored third-party dist file is not project interface copy; the empty-allow-list contract forbids allow-listing it
- **Fix:** added `src/lib/vendor/qrcode.js` to `EXCLUDED_FILES` in scripts/i18n-scan.mjs and updated the scanner-contract test accordingly
- **Files modified:** scripts/i18n-scan.mjs, test/i18n-scan.test.mjs
- **Commit:** 540392e

**3. [Note] Test heuristic fix (not a deviation)** — the qr fixture's "real matrix" assertion initially counted `<rect`/`<path` elements; the vendored encoder packs all modules into one `<path>` as `M…z` segments, so the test now counts move-draw segments (>50 cells).

## Placement Decision (for Phase 17)

TOTP/recovery helpers live in top-level `totp.js` at the repo root, sibling of `server.js`. Rationale: importable by server.js, by tests, and by Phase 17 directly; NOT under `src/` so Vite never bundles server crypto. Phase 17 imports `verifyTotpCode` and `normalizeRecoveryCode` from `./totp.js` verbatim.

## Key Decisions Made

- `Projects:` prefix stays literal in the otpauth label (D-54 exact-format conformance, see deviation 1)
- `verifyTotpCode` takes an optional `period` param (default 30) — callers in 16-02/Phase 17 use the default
- Vendored file excluded from the i18n scan (third-party source is not interface copy)

## Threat Model Compliance

- T-16-01: code comparison goes through `crypto.timingSafeEqual` behind the strict `/^\d{6}$/` gate — no `===`/regex compares anywhere in totp.js
- T-16-02: replay guard rejects `matchedStep <= lastStep` (not just equality) — tested red→green
- T-16-06: no hand-rolled QR — only the vendored dist file (sha256-verified), exercised by the D-17 fixture test
- T-16-SC: no npm install occurred; the vendored file was fetched at the pinned version 2.0.4 (legitimacy verdict OK in 16-RESEARCH.md)
- T-16-07: totp.js contains no logging of secrets or otpauth URIs

## Known Stubs

None. All exports are fully implemented and RFC/fixture-proven.

## Self-Check: PASSED

- All 5 created files exist (verified on disk)
- Commits b3856df and 540392e present in git log
- Full suite green at SUMMARY time (497 pass / 0 fail)
