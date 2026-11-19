# Phase 74: Service Worker Verification & Milestone Acceptance - Research

**Researched:** 2026-11-18
**Domain:** PWA installability verification (static contract tests, docs, human UAT) — zero production code changes
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Implementation Decisions

#### SW pin mechanism & test placement
- **D-01:** New `test/sw-contract.test.mjs` pins the SW contract: a content-hash pin on
  `public/sw.js` (byte-identical proof vs the Phase 48/59 contract) + key-line byte pins,
  plus a manifest-scope↔SW-scope agreement assertion. One clear home for the whole
  Phase 74 SW contract; `test/manifest-contract.test.mjs` (Phase 72) stays untouched.

#### DEPLOY.md PWA section
- **D-02:** New `## 18. Installable app (PWA)` section in `docs/DEPLOY.md`, following the
  file's numbered-section convention (after section 17). Self-contained: root-domain-only
  deployment constraint, iOS limitations (no `beforeinstallprompt`, manual Add to Home
  Screen), standalone no-back-button stance, strictly-online/no-caching decision, a short
  "why no custom SW" note, and one Lighthouse troubleshooting paragraph inside.

#### UAT scope & evidence
- **D-03:** `74-UAT.md` in the phase dir, following the `73-UAT.md` pattern: 4 numbered
  human tests — (1) desktop Chrome install + standalone launch, (2) Android Chrome
  install + standalone launch, (3) iOS Safari honest manual-install path, (4) push
  notifications still fire after all changes. Evidence = short result line + optional
  screenshot per test, committed like Phase 73's UAT file (`human_needed` items).

#### Registration pin coverage
- **D-04:** Static pins only, inside `test/sw-contract.test.mjs`: exactly one
  `navigator.serviceWorker.register` call site repo-wide (in `src/core/push.js`), the
  `'/sw.js'` literal with default scope, both `main.js` boot paths intact (the `load`
  listener at `src/main.js:136-137` and the `enterApp` re-fire at `src/main.js:323`),
  and the `api.enabled` gate in `push.js` untouched. Matches the
  `test/browser-push.test.mjs` forbidden-token style — no e2e browser test added.

### the agent's Discretion
None flagged — owner picked the recommended option in every gray area.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PWA-03 | Installability's service-worker requirement is met by the EXISTING push SW (`public/sw.js`), with zero code changes; installability proven end-to-end on real devices | Chromium dropped the fetch-handler requirement (Chrome 108 mobile / 112 desktop) [VERIFIED: milestone research SUMMARY.md, cross-checked web.dev/MDN]; `public/sw.js` (48 lines, root scope, served no-cache) + `registerSw()` on both boot paths already satisfy manifest+icons+SW criteria — this phase only pins and proves them |
</phase_requirements>

## Summary

Phase 74 is a **verification-only** phase: no production file may be touched. The deliverables are one new static test file (`test/sw-contract.test.mjs`), one new DEPLOY.md section (`## 18. Installable app (PWA)`), and one human UAT record (`74-UAT.md`) with 4 real-device tests that formally accept the v2.7 milestone.

All pin targets have been read from source this session and their exact bytes are quoted below, so the planner can write byte-pin assertions with `[VERIFIED: …]` provenance rather than assumptions. Critically: **the repo-wide single `navigator.serviceWorker.register` call site is `src/core/push.js` inside `registerSw()`** — but `src/main.js` defines a *local wrapper* also named `registerSw` (`const registerSw = () => import('./core/push.js').then(m => m.registerSw()).catch(() => {})`), so a naive grep for "register" call-site counting must count `navigator.serviceWorker.register` occurrences, not the name `registerSw`. The hash pin can be locked immediately: `public/sw.js` is SHA-256 `7a700dd8cc70ccb20c444707ac0d86871f9abe24999a40497fc22e5a55cc5b8d` [VERIFIED: sha256sum, this session].

**Primary recommendation:** Mirror the `test/manifest-contract.test.mjs` style exactly (read file as text, `node:assert/strict`, substring + hash assertions), compute the hash pin at plan time with `node -e "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync('public/sw.js')).digest('hex'))"`, keep `main.js`/`push.js` pins as quoted substrings (not line-number pins — line numbers drift), and structure 74-UAT.md after 73-UAT.md's frontmatter + numbered-test + summary format.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| SW contract proof (hash/byte pins) | Test layer (`node:test`, static file reads) | — | Pure source-as-text assertions; no browser, no runtime |
| Installability (manifest + SW at root scope) | Browser/Client (existing artifacts) | API/Server (no-cache headers, already shipped) | Verification only — Chromium criteria already met by Phase 48/72/73 output |
| PWA operator documentation | Docs (`docs/DEPLOY.md` §18) | — | Numbered-section convention, prose only |
| Install + push acceptance | Human (real devices) | — | Install dialogs and iOS manual A2HS cannot be automated [VERIFIED: milestone research] |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:test` + `node:assert/strict` | built-in (Node 24.21.0 installed) | The only test framework in the repo | Zero-dependency standing constraint; all 20+ existing test files use it [VERIFIED: package.json `"test": "node --test --test-concurrency=2 test/*.test.mjs"`] |
| `node:crypto` (built-in) | — | SHA-256 content hash of `public/sw.js` in the pin test | No dev deps allowed; hash pin is the D-01 requirement |

**No new packages of any kind** — zero-dependency standing constraint applies. Package Legitimacy Audit: N/A (nothing to install).

## Architecture Patterns

### Pattern 1: Source-as-text contract test (established repo pattern)
**What:** Read files as UTF-8 strings, assert substrings / hashes / call-site counts. No browser, no imports of src modules.
**When to use:** Every pin in this phase.
**Example:**
```js
// Source: test/manifest-contract.test.mjs style (Phase 72), [VERIFIED: test/manifest-contract.test.mjs:24-26]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { describe, test } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..');
const source = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const sw = source('public/sw.js');

test('public/sw.js is byte-identical to the Phase 48/59 contract', () => {
  assert.equal(
    createHash('sha256').update(sw).digest('hex'),
    '7a700dd8cc70ccb20c444707ac0d86871f9abe24999a40497fc22e5a55cc5b8d',
    'sw.js hash drift is STOP-and-justify (milestone decision)',
  );
});
```

### Pattern 2: Call-site counting via regex over concatenated sources
**What:** Count `navigator.serviceWorker.register` occurrences across `src/**` + `public/**` to prove the single-call-site rule (D-04). Count the *exact expression*, not the function name.
**Example:**
```js
const srcs = ['src/core/push.js', 'src/main.js', 'public/sw.js'];
const total = srcs.reduce((n, f) => (n + (source(f).match(/navigator\.serviceWorker\.register/g) || []).length), 0);
assert.equal(total, 1, 'exactly one navigator.serviceWorker.register call site — src/core/push.js');
```
⚠️ **Pitfall flag:** `src/main.js` has a local `const registerSw = …m.registerSw()…` wrapper [VERIFIED: src/main.js:134-137] — if the regex were `registerSw` the count would be ≥3. Always pin `navigator.serviceWorker.register`.

### Pattern 3: Manifest↔SW scope agreement assertion
**What:** Parse `public/manifest.webmanifest` JSON and assert `"scope": "/"` agrees with the SW being served at `/sw.js` (root scope) — the D-01 manifest-scope↔SW-scope agreement assertion.
**Example:**
```js
const manifest = JSON.parse(source('public/manifest.webmanifest'));
assert.equal(manifest.scope, '/', 'manifest scope must be root — the SW at /sw.js controls root scope');
assert.equal(manifest.start_url, '/');
```
Manifest field values, read verbatim this session [VERIFIED: public/manifest.webmanifest:1-17]:
```json
{ "name": "Projects Studio", "short_name": "Projects Studio", "id": "/", "start_url": "/",
  "scope": "/", "display": "standalone", "theme_color": "#1D1338", "background_color": "#fbfaf8",
  "icons": [ …4 entries: any-192, any-512, maskable-192, maskable-512 ] }
```

### Pattern 4: UAT record format (from 73-UAT.md)
**What:** YAML frontmatter (`status/phase/source/started/updated`) + `## Current Test` + `## Tests` with `### N. Title` blocks carrying `expected:` / `result:` lines + `## Summary` tally + `## Gaps`.
**Verified shape [VERIFIED: .planning/phases/73-install-hint-banner/73-UAT.md:1-28]:**
```yaml
---
status: complete
phase: 73-install-hint-banner
source: [73-VERIFICATION.md]
started: 2026-11-18T23:40:00Z
updated: 2026-11-18T23:55:00Z
---
```
…followed by numbered test blocks with `expected:`/`result:` and a summary table. During execution, pending human tests are recorded as `human_needed` items (Phase 73 pattern) until the owner runs them.

## Verbatim Pin Targets (read this session — quote these bytes, do not paraphrase)

**`public/sw.js` key lines [VERIFIED: public/sw.js:10, 29]:**
```js
self.addEventListener('notificationclick', (e) => {
self.addEventListener('push', (e) => {
```
Plus the negative pins already enforced by `test/browser-push.test.mjs:126`: `/\b(fetch|install|activate|import)\b/` forbidden in sw.js — sw-contract.test.mjs may re-assert these but must not *duplicate* the whole browser-push test (keep roles distinct: browser-push pins behavior-shape, sw-contract pins byte identity + registration).

**SHA-256 of `public/sw.js` [VERIFIED: sha256sum, 2026-11-18]:**
`7a700dd8cc70ccb20c444707ac0d86871f9abe24999a40497fc22e5a55cc5b8d`

**`src/core/push.js` — registerSw + api.enabled gate [VERIFIED: src/core/push.js:161-163]:**
```js
export const registerSw = () => {
  if (!('serviceWorker' in navigator) || !api.enabled) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {});
};
```

**`src/main.js` boot path 1 — load listener [VERIFIED: src/main.js:134-137]:**
```js
const registerSw = () => import('./core/push.js').then(m => m.registerSw()).catch(() => {});
addEventListener('load', registerSw);
```

**`src/main.js` boot path 2 — enterApp re-fire [VERIFIED: src/main.js:323]:**
```js
  registerSw(); // 59-UAT fix: register after api.enabled can be true (idempotent; no-ops in demo mode)
```

**`server.js` cacheControl no-cache branch [VERIFIED: test/manifest-contract.test.mjs:47-51]** — already pinned there for `sw.js` and `manifest.webmanifest`; sw-contract.test.mjs may cross-check that `server.js` still contains `path.basename(file) === 'sw.js'` without re-owning that contract.

**`docs/DEPLOY.md` section 18 placement [VERIFIED: docs/DEPLOY.md:1368, 1397]:** `## 17. Outbound webhooks (Microsoft Teams)` starts at line 1368; file is 1397 lines total. `## 18. Installable app (PWA)` is appended at end of file.

**`node --version`:** 24.21.0 [VERIFIED: shell, 2026-11-18].

## Common Pitfalls

### Pitfall 1: Counting `registerSw` instead of `navigator.serviceWorker.register`
**What goes wrong:** `src/main.js` defines its own local `registerSw` wrapper that funnels into the push.js export, so the symbol appears ≥3 times.
**Avoid:** Pin the exact expression `navigator.serviceWorker.register` (count = 1 repo-wide) and the `'/sw.js'` literal separately.

### Pitfall 2: Line-number pins on src/main.js / push.js
**What goes wrong:** Line numbers drift with any future edit; a pin like "line 323 contains registerSw()" breaks spuriously.
**Avoid:** Substring/hash pins only (matches D-01 "key-line byte pins" intent). Line numbers in this doc are documentation anchors, not assertion targets.

### Pitfall 3: Hash pin written from memory
**What goes wrong:** A typo'd hash fails the suite for the wrong reason.
**Avoid:** Re-derive at plan time and again at test-authoring time: `node -e "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync('public/sw.js')).digest('hex'))"`. Current value: `7a700dd8cc70ccb20c444707ac0d86871f9abe24999a40497fc22e5a55cc5b8d` [VERIFIED: sha256sum this session].

### Pitfall 4: Duplicating browser-push.test.mjs's contract
**What goes wrong:** Two tests owning the same assertion diverge on any future change and blur ownership.
**Avoid:** sw-contract.test.mjs owns: sha256 identity, notificationclick/push handler presence, registration call-site pins, manifest↔scope agreement. It does NOT own the forbidden-token regex (browser-push does) — optionally cross-assert only that browser-push remains green conceptually (i.e., don't re-implement).

### Pitfall 5: Editing pinned files "while documenting them"
**What goes wrong:** Any diff to `public/sw.js`, `server.js`, `src/main.js`, `src/core/push.js`, or the banner module violates the zero-code-change constraint and flips the hash pin red.
**Avoid:** Phase tasks touch exactly three new/append-only artifacts: `test/sw-contract.test.mjs`, `docs/DEPLOY.md` (append-only §18), `74-UAT.md`.

### Pitfall 6: iOS/Android installability claims in DEPLOY.md
**What goes wrong:** Overstating support — iOS Safari never fires `beforeinstallprompt` and requires manual Share → Add to Home Screen; Firefox desktop also does not fire it.
**Avoid:** State the honest matrix: Chromium desktop/Android = prompted install; iOS = manual A2HS, no standalone back button; strictly online, no offline caching (milestone decision).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Hash pinning | Custom checksum scheme | `node:crypto` SHA-256 hex | Standard, zero-dep, one line |
| Test runner / structure | Custom harness | `node:test` `describe`/`test` | Repo-wide convention, package.json script already globs `test/*.test.mjs` |
| UAT evidence format | New template | 73-UAT.md format | Continuity with Phase 73 VERIFICATION digest |

## Runtime State Inventory

Not a rename/refactor/migration phase — but the acceptance-relevant runtime state was checked:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no data stores involved (static file pin + docs + UAT record) | None |
| Live service config | None — deployment constraint documented in DEPLOY.md §18 prose only | None |
| OS-registered state | None | None |
| Secrets/env vars | None — VAPID custody already covered by DEPLOY.md §16 (untouched) | None |
| Build artifacts | None — no build step touched; note the 500 kB chunk gate is irrelevant this phase (no JS shipped) | None |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (test runner) | sw-contract.test.mjs | ✓ | 24.21.0 | — |
| git | committing artifacts | ✓ | repo active | — |

Human devices (desktop Chrome, Android Chrome, iOS Safari) required for 74-UAT tests 1–4 — provided by the owner (`human_needed` pattern).

**Missing dependencies with no fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` (built-in, Node 24.21.0) |
| Config file | none — package.json script: `"test": "node --test --test-concurrency=2 test/*.test.mjs"` |
| Quick run command | `node --test test/sw-contract.test.mjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PWA-03 | sw.js byte-identical (sha256 pin) | unit (static) | `node --test test/sw-contract.test.mjs` | ❌ Wave 0 (created this phase) |
| PWA-03 | Key handler lines present (notificationclick/push) | unit (static) | `node --test test/sw-contract.test.mjs` | ❌ Wave 0 |
| PWA-03 | Single `navigator.serviceWorker.register` call site + `'/sw.js'` literal + api.enabled gate | unit (static) | `node --test test/sw-contract.test.mjs` | ❌ Wave 0 |
| PWA-03 | manifest scope `/` ↔ SW root-scope agreement | unit (static) | `node --test test/sw-contract.test.mjs` | ❌ Wave 0 |
| PWA-03 | Real-device install (desktop/Android/iOS) + push fires | human UAT | — (`74-UAT.md` human_needed) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test test/sw-contract.test.mjs` (plus `npm test` before phase close)
- **Phase gate:** Full `npm test` green (baseline: 1737 pass / 1750 — 13 pre-existing failures are the accepted baseline [VERIFIED: STATE.md:41-43])

### Wave 0 Gaps
- [ ] `test/sw-contract.test.mjs` — covers all static PWA-03 pins (created as the phase's first task)
- None else — `test/manifest-contract.test.mjs` and `test/browser-push.test.mjs` already exist and must remain untouched/green

## Security Domain

Config has no `security_enforcement` key → treated as enabled. This phase ships no runtime code; relevant posture is inherited and only *documented*:

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | no (docs/tests only) | — |
| V14 / SW security posture | documented only | sw.js same-origin URL check + zero network interception (cache-poisoning surface eliminated structurally) — already pinned by `test/browser-push.test.mjs` |
| Secrets | no | VAPID custody documented in DEPLOY.md §16 (do not touch) |

Known threat pattern to preserve in §18 prose: no caching ⇒ no stale/offline-cache surface; the click-router origin check (T-48-03) must be described accurately, not improved.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SW with fetch handler required for install | Fetch-handler requirement removed (Chrome 108 mobile / 112 desktop) | Chrome 108/112 [VERIFIED: milestone research SUMMARY.md, cross-checked web.dev/Chrome devrel] | Minimal push-only sw.js legitimately satisfies installability — the entire premise of this phase |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Chromium install criteria details (manifest + icons + SW, no fetch handler needed) — carried from milestone research, not independently re-verified this session | Summary / State of the Art | Low — already validated in v2.7 research (HIGH) |
| A2 | iOS/Firefox non-firing of `beforeinstallprompt` for DEPLOY.md §18 matrix | Pitfall 6 | Low — matches milestone decisions; owner confirms in UAT test 3 anyway |

All discrete in-repo values (hash, manifest fields, pin lines) are `[VERIFIED: …]` with verbatim quotes — no assumed values enter any code example.

## Open Questions (RESOLVED)

None blocking. The one plan-time nicety — whether `sw-contract.test.mjs` cross-checks `server.js`'s `sw.js` no-cache branch — was RESOLVED at plan time: adopted as a substring assertion in 74-01 Task 1 (assertion 4).

## Sources

### Primary (HIGH confidence)
- `public/sw.js` (48 lines, read in full) — pin target bytes + handlers
- `src/core/push.js:161-163`, `src/main.js:134-137`, `src/main.js:323` — registration call sites, verbatim
- `public/manifest.webmanifest` — frozen field values, verbatim
- `test/manifest-contract.test.mjs`, `test/browser-push.test.mjs` — established test style
- `test/browser-push.test.mjs:126` — forbidden-token regex, verbatim
- `docs/DEPLOY.md:1368,1397` — §17 location, file length
- `.planning/phases/73-install-hint-banner/73-UAT.md` — UAT record format
- `package.json:19` — test script
- `sha256sum public/sw.js` → `7a700dd8cc70ccb20c444707ac0d86871f9abe24999a40497fc22e5a55cc5b8d`
- `node --version` → 24.21.0

### Secondary (MEDIUM confidence)
- `.planning/research/SUMMARY.md:86-106` — Chromium criteria, phase rationale, confidence HIGH in original research

### Tertiary (LOW confidence)
- None — no web-only claims used

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — everything is built-in Node; zero installs
- Architecture/pins: HIGH — every pin target read verbatim from source this session
- Pitfalls: HIGH — grounded in repo-specific structures (registerSw name collision, line drift)
- UAT/docs format: HIGH — mirrors committed Phase 73 artifacts

**Research date:** 2026-11-18
**Valid until:** 2026-12-18 (repo-static; only the sw.js hash could change if another phase edits it — none is planned)
