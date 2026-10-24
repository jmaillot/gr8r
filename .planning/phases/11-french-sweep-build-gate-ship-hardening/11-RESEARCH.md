# Phase 11: French sweep, build gate & ship hardening - Research

**Researched:** 2026-10-24
**Domain:** i18n leak proofing (Playwright DOM sweep), build gating (static scan pin), shipped-artifact verification (Docker CI job, demo mode, zero-dependency pin), docs/release notes
**Confidence:** HIGH — this phase is almost entirely intra-repo: every mechanism it touches already exists and was read this session. No new external dependency is needed anywhere.

## Summary

Phase 11 hardens a guarantee that phases 5–10 already built the machinery for. Nothing new has to
be invented: the leak scan rides an extended `e2e/french-overflow.spec.mjs`, the build gate is a
pin over an already-empty allow-list, and ship verification asserts properties the existing
Dockerfile, Vite chunking and `package.json` already have. The phase's risk is therefore not
"how do we build this" but "do we assert the right surfaces and fail loudly on the right gaps".

Four proof artifacts are needed:

1. **The 21-route French sweep** — extend `e2e/french-overflow.spec.mjs` (D-01). The leak
   detector is a DOM-side heuristic: any text node, `aria-label`, `data-tip` or `document.title`
   value that equals an English-catalogue value (minus a maintained stop-list) is a leak (D-02).
   The coverage guard is a pinned 21-route list; every route visit must first find a known French
   marker, so a blank/error page cannot pass (D-03). The sweep account is created with locale
   `'fr'` via the phase-10 `createAccount` helper — no UI language switch in the sweep (D-06).
2. **The build-gate pin** — a test in `test/i18n-scan.test.mjs` asserts
   `test/fixtures/i18n-pending.json` stays `[]` and that the scanner exits 0 on the live tree
   (D-07/D-09). The `prebuild` hook remains the fail-the-build mechanism; the scanner itself is
   unchanged (D-08).
3. **Ship verification** — a new `docker-build` CI job builds the image, runs it and asserts the
   French catalogue chunk is *served* with French content (D-10); a Chromium test proves the
   server-less demo renders French and switches EN↔FR with localStorage persistence (D-11); a
   `node:test` pins `package.json` to `devDependencies` only and the runtime stage to bare node
   (D-12).
4. **Docs** — README § Internationalization, CHANGELOG 1.2.0 draft notes (no tag — D-14), DEPLOY
   mention of the docker-build job (D-13/D-15).

**Primary recommendation:** Build the sweep as one new `test()` block family inside
`french-overflow.spec.mjs` whose route list is a pinned array of 21 entries (data, not a count),
whose leak scan is a single `page.evaluate` walking the whole DOM tree including hidden nodes
against an English-catalogue-value Set built from `src/locales/en.json`, and whose per-route
precondition is a French marker assertion before the scan. Then add the pin test, the docker CI
job, the demo Chromium test, the dependency-pin test, and the three doc deltas — in that order,
so the sweep is green before the artifacts that advertise it.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

Sweep mechanics:
- **D-01:** The 21-route French sweep **extends `e2e/french-overflow.spec.mjs`** from 16 to 21
  routes rather than creating a new spec file — one proof family, one file.
- **D-02:** Leak detection = **English-catalogue-value heuristic over the rendered DOM** — sources
  are the en.json catalogue values plus a maintained stop-list of legitimate English (brand words,
  plan wire values like 'Free', user content). Scanned surfaces: text nodes, `aria-label`,
  `data-tip`, and `document.title`.
- **D-03:** Coverage assertion = **pinned route list of exactly 21 routes**; each visit must first
  find a known French marker before the leak scan runs.
- **D-04:** Route set = **exactly the overflow spec's 16 routes plus the 5 added in phase 10** —
  reuse phase 10's enumeration and fixtures. Prototype pages stay excluded.
- **D-05:** Leak scan covers the **whole DOM tree, hidden nodes included**.
- **D-06:** Sweep session is an **API-created account with locale 'fr'** via the phase-10
  locale-aware fixture helper (`createAccount` + `PATCH /api/auth/me`); no UI language switch.

Build gate:
- **D-07:** Criterion 2 = **pin the empty allow-list and prove the gate in CI**: a test asserts
  `test/fixtures/i18n-pending.json` stays `[]` and the scan exits 0 on the tree; the existing
  `prebuild` hook remains the fail-the-build mechanism. The allow-list is NOT turned into a hard
  gate inside the scanner itself.
- **D-08:** Existing parity tooling suffices — `scripts/fr-parity.mjs` and the catalogue tests
  already pin parity. No new parity gate, no combined gate script.
- **D-09:** The empty-allow-list pin lives in **`test/i18n-scan.test.mjs`**.

Ship verification:
- **D-10:** Criterion 3 = **docker-build CI job**: `docker build`, run the image, assert the
  French catalogue chunk is **served** (fetch the page, resolve the fr chunk asset, verify French
  content).
- **D-11:** Demo mode = **Chromium test**: load the built demo (api disabled) with a
  fr-preferring browser — interface renders French and the selector switches EN↔FR with
  localStorage persistence.
- **D-12:** Zero runtime dependency pinned by a **node:test** asserting package.json carries no
  runtime dependencies and the Dockerfile runtime stage stays bare node.

Docs:
- **D-13:** "Translated vs not" statement lives in a **README § Internationalization** section.
- **D-14:** Docs + release notes only — the 1.2.0 tag happens at milestone close; CHANGELOG gains
  the 1.2.0 notes text, version bump stays with `/gsd-complete-milestone`.
- **D-15:** Doc set = README + CHANGELOG + DEPLOY.

### the agent's Discretion
- Exact French marker strings per route, the stop-list contents, and the sweep's internal
  assertion helper structure — implementation detail within D-02/D-03.
- The docker-build CI job's runner/tooling choices (`docker run` vs `docker create` + extraction)
  as long as the served-chunk assertion holds (D-10).
- How the demo Chromium test boots the built demo (static preview vs serving `dist/`) as long as
  no API server is involved (D-11).

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. (Out of scope from domain: demo seed content and the
two prototype pages stay English/excluded; four other languages; real billing; invitation email.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UAT-10 | A French sweep over the 21 routes proves no untranslated English string is served, and a static scan of the sources fails the build on a new user-visible literal never put in a catalogue. | Sweep architecture (§Sweep mechanics), leak heuristic data source (`en.json` values, VERIFIED below), the already-failing `prebuild` gate + the D-07/D-09 pin, plus ship verification (D-10–D-12) and docs (D-13–D-15) for criteria 3–4. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| French leak sweep | Browser (Playwright DOM) | E2E fixture layer (API) | The leak lives in the *rendered* DOM; fixtures (fr account) come from the real API only |
| Build gate (scan pin) | Repo tooling (`node:test` + `prebuild`) | CI build job | The scanner exists; the phase only pins its end state |
| Image carries fr catalogue | CI (docker-build job) | Dockerfile (already correct) | Verification-only: the Dockerfile already copies `dist/` wholesale |
| Demo mode French + switch | Browser (Chromium) | Vite preview / static serving of `dist/` | Demo is client-only (`api.enabled` false); no server may be involved |
| Zero-runtime-dependency pin | Repo tooling (`node:test`) | Dockerfile read | Reads two files, asserts two properties |
| Docs & release notes | Repo docs (README/CHANGELOG/DEPLOY) | — | Text only |

## Standard Stack

### Core (all already in the repo — nothing new to install)

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| @playwright/test | ^1.64.1 `[VERIFIED: package.json:29]` | The 21-route sweep + demo Chromium test | The suite's only browser engine; config, helpers and conventions exist |
| node:test | Node 24 built-in `[VERIFIED: package.json:24-26 engines >=24, .nvmrc=24]` | The scan pin test and the dependency-pin test | Every contract test in `test/` uses it; never mocked |
| Vite | ^6.4.4 `[VERIFIED: package.json:34]` | Builds the fr catalogue chunk; `vite preview` is the natural server-less demo boot | Already the bundler; fr chunk already emitted (`dist/assets/fr-*.js`, observed in `dist/`) |
| Docker | GH `ubuntu-latest` runner | The `docker-build` CI job | Runners ship Docker; `actions/checkout@v7` + `setup-node@v7` already used in `ci.yml` |
| scripts/i18n-scan.mjs | 1,450 lines `[VERIFIED: wc -l]` | The measuring device behind the build gate | Unchanged per D-07/D-08 |

**Installation:** none. **Zero package installs this phase** — this is itself a pinned property
(D-12): `package.json` carries no `dependencies` key today `[VERIFIED: package.json:7-36 — only
"scripts", "engines", "devDependencies"]`, and that absence is what the pin test asserts.

## Package Legitimacy Audit

Not applicable — **this phase installs no external packages** (and installing one would violate
D-12's pin). All tooling is existing devDependencies or Node/Docker platform features.

## Architecture Patterns

### Sweep mechanics (criterion 1)

**Data flow:** API fixture (fr account) → Playwright context (no browser-locale lever needed) →
for each of the 21 pinned routes: `goto` → assert French marker (coverage guard) → single
`page.evaluate` leak scan over the whole tree → collect leaks → assert none.

The English value source is the catalogue itself, read at test time:

```js
// Source: src/core/i18n.js:6 — the suite already imports JSON catalogues this way
import en from '../src/locales/en.json' with { type: 'json' };
// test/i18n-scan.test.mjs:19 does exactly this: `import en from '../src/locales/en.json' with { type: 'json' };`
```

Flatten `en` into a Set of leaf values; the scan flags any scanned surface whose text is a member
of that Set (minus stop-list). Key design points:

- **Match the leak shape, not vocabulary in general.** A leak per D-02 is a string that *equals*
  (or is a tight variant of) an English catalogue value — brand words, plan wire values ('Free'),
  numbers, dates, user content are stop-listed. Do not attempt word-level English detection: the
  catalogue-value equality heuristic is deterministic and self-maintaining (a new uncatalogued
  literal that happens to equal an old catalogue value is still caught; a new stop-list word is a
  visible, commented edit — exactly how the old allow-list worked per STATE.md).
- **Whole-tree scan including hidden nodes** (D-05): walk `document.body` with a
  TreeWalker/recursive walk that does NOT skip `display:none` subtrees — closed modals, popovers
  and off-screen panels are the named leak surfaces. Note this is the deliberate *opposite* of
  `chromeBoxes()` in the existing spec, which filters hidden elements `[VERIFIED:
  e2e/french-overflow.spec.mjs:96-113 — box() returns null on display:none/visibility:hidden]`.
- **Scanned surfaces:** text nodes (`Node.TEXT_NODE` with non-whitespace content), `aria-label`
  and `data-tip` attributes on every element, plus `document.title` (set by the render loop at
  `src/shell/render.js:197-198` from the catalogue-driven title, so it follows locale).
- **The fr-precondition before each scan** (D-03): reuse `frenchShell(page)`-style assertions —
  `document.documentElement.lang === 'fr'` plus a route-specific French marker. Markers per route
  are the agent's discretion (D-02/D-03 discretion); the cheapest robust marker set is the route's
  catalogue-driven heading/title, e.g. via the `fmt()` pattern flows.spec uses to read labels
  *from the catalogue* so assertions cannot drift from it (`e2e/flows.spec.mjs:347` —
  `fmt('nav.route.projects', {}, lang)`).

**The route list is data.** Pin all 21 paths in one exported const inside the spec, so "adding
route 22 without updating the list fails loudly" (CONTEXT §Specifics). Derivation of the 21:

- The existing spec pins 16 `[VERIFIED: e2e/french-overflow.spec.mjs:48-65 — 'home', 'inbox',
  'mytasks', 'favorites', 'notifications', 'search', 'overview', 'projects', 'tasks', 'calendar',
  'timeline', 'members', 'teams', 'activity', 'settings', 'archive']`.
- `ROUTE_IDS` has 20 entries `[VERIFIED: src/shell/render.js:20-40 — the list above plus 'member',
  'team', 'system', 'states']`; `system`/`states` are the excluded prototype pages and
  `member`/`team` are param-dependent detail routes `[VERIFIED: comment at
  e2e/french-overflow.spec.mjs:42-47]`.
- 16 + member + team + project detail + /join + auth = 21. The exact "5 added in phase 10"
  enumeration is not written down as a list anywhere in `.planning/phases/10-*` — the planner
  must fix the canonical 21-entry list (see Open Questions OQ-1) and record it in the spec as
  the pinned data.

**Sweep fixtures:** `createAccount(base, run, tag, name, { locale: 'fr', workspace })` —
`[VERIFIED: e2e/helpers/setup.mjs:125-136 — signup 201, optional workspace 201, PATCH
/api/auth/me { locale } 200, returns { account, client }]`. The sweep should seed minimal
fixtures (a project, a task) so list/detail surfaces render real rows; fixtures through the API
only, per suite convention.

### Build-gate pin (criterion 2)

The scanner's contract, read this session:

- `ALLOW_LIST = 'test/fixtures/i18n-pending.json'` `[VERIFIED: scripts/i18n-scan.mjs:1379]`
- `main()` ends with `process.exit(main())` and the module's `main` is exported
  `[VERIFIED: scripts/i18n-scan.mjs:1449 and the export list in test/i18n-scan.test.mjs:18]`
- The allow-list file is already `[]` `[VERIFIED: test/fixtures/i18n-pending.json — file contains
  exactly `[]`]`
- `prebuild` and `prebuild:en` run the scan before the bundler `[VERIFIED: package.json:10-11]`

So criterion 2 is already mechanically true; the phase *pins* it so it cannot regress:

```js
// Source: pattern follows test/i18n-scan.test.mjs conventions (node:test, node:assert/strict)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { main } from '../scripts/i18n-scan.mjs';

test('the i18n allow-list stays empty — an empty list is the proof the sweep is finished', () => {
  assert.deepEqual(JSON.parse(fs.readFileSync('test/fixtures/i18n-pending.json', 'utf8')), []);
});

test('the scan exits 0 on the live tree (a new user-visible literal fails the build via prebuild)', () => {
  assert.equal(main(), 0);
});
```

D-09 puts these in the existing `test/i18n-scan.test.mjs` (405 lines, contract-suite conventions:
fixture trees for most tests, live-tree exceptions for tripwires `[VERIFIED:
test/i18n-scan.test.mjs:1-19]`). The `main()`-on-live-tree test is a live-tree exception of the
same kind as the existing machine-identifier guard. A negative probe (add a literal to a temp
copy and assert non-zero exit) can reuse the suite's `fixtureTree()` helper pattern if desired,
but per D-07 the CI gate proof is: empty allow-list pin + `npm run build` already running the
scan in the CI build job `[VERIFIED: .github/workflows/ci.yml — build job runs `npm run build`]`.

### Ship verification (criterion 3)

**D-10 — docker-build CI job.** Add a third job to `.github/workflows/ci.yml` (currently two
jobs: `build` and `e2e` `[VERIFIED: ci.yml, read this session]`):

```yaml
  docker-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - run: docker build -t gr8r:ci .
      - run: docker run -d --rm -p 8080:8080 -e ADMIN_EMAIL=ci@example.com -e ADMIN_PASSWORD='ci-password-1' gr8r:ci
      - run: |
          # wait for /api/health, then: fetch /, resolve the fr chunk asset from the page,
          # fetch the chunk, assert French content (a known fr catalogue value)
      - run: docker stop $(docker ps -q --filter ancestor=gr8r:ci)
```

Key facts that make the served-chunk assertion work:

- The Dockerfile runtime stage copies `/app/dist` wholesale `[VERIFIED: Dockerfile:21 —
  `COPY --from=build /app/dist ./dist`]`, so the fr chunk ships automatically once built.
- The built fr chunk exists as its own asset: `dist/assets/fr-*.js` was observed in the current
  build (`fr-DsYUjSQO.js`), emitted by the `import.meta.glob` chunking in
  `src/core/i18n.js:24` `[VERIFIED: comment "Vite rewrites this into one chunk per locale"]`.
- The server serves the built SPA and exposes `/api/health` (the Dockerfile HEALTHCHECK probes
  exactly that `[VERIFIED: Dockerfile:33-34]`).
- The assertion resolves the fr chunk from the served `index.html` (or the JS bundle's asset
  map), fetches it, and greps for French *content* (e.g. a known fr-only value like a French
  heading), not merely file presence — per CONTEXT §Specifics.
- Container boot needs `ADMIN_EMAIL` + `ADMIN_PASSWORD` if the entrypoint requires them (check
  `docker-entrypoint.sh` during planning; DEPLOY.md documents admin env vars).

**D-11 — demo Chromium test.** The demo fallback is documented behaviour: "If the API is not
running, `/api/config` fails and the client falls back to local demo mode"
`[VERIFIED: DEPLOY.md §12 Local development]`. The demo language switch persists to localStorage:
`src/core/i18n.js:112/120` `localStorage.setItem(LOCALE_STORAGE_KEY, code)` / `getItem`
`[VERIFIED]`. Mechanics: a second Playwright project or a standalone spec whose `webServer` runs
`vite preview` (serves `dist/`, no API behind it — `/api` 404s → demo). A fr-preferring context
(`locale: 'fr-FR'` — the documented exception pattern from 10-02: anonymous surfaces negotiate
from the browser) renders French; the selector switches to English; a reload keeps English
(localStorage persistence). Discretion D-11 covers the boot choice.

**D-12 — zero-dependency pin.**

```js
// Source: package.json read this session — no "dependencies" key exists (lines 7-36)
import pkg from '../package.json' with { type: 'json' };
assert.ok(!('dependencies' in pkg), 'runtime dependencies are forbidden (D-12)');
// plus: read Dockerfile, assert the runtime stage installs nothing beyond su-exec
// and copies only server.js/mailer.js/seed.json/dist (Dockerfile:18-21,23)
```

### Docs (criterion 4)

- README: new `## Internationalization` section — interface translated (en/fr), demo seed
  content not, the two prototype pages (`design-system`, `states`) not.
- CHANGELOG: draft 1.2.0 notes (Unreleased→1.2.0 text, no version bump, no tag — D-14).
- DEPLOY: mention the docker-build CI job and that the image carries the French catalogue.

## Recommended Project Structure (files touched)

```
e2e/french-overflow.spec.mjs        # extended: 21-route leak sweep (D-01..D-06)
e2e/helpers/setup.mjs               # unchanged (createAccount already sufficient)
test/i18n-scan.test.mjs             # + empty-allow-list pin + live-tree exit-0 test (D-07/D-09)
test/fixtures/i18n-pending.json     # stays [] (asserted, not edited)
test/dependencies.test.mjs          # NEW: D-12 pin (name at planner's discretion)
.github/workflows/ci.yml            # + docker-build job (D-10)
e2e/demo-locale.spec.mjs (or second project in e2e/playwright.config.mjs)  # D-11
README.md / CHANGELOG.md / DEPLOY.md  # D-13/D-14/D-15
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Browser automation / DOM walking | custom headless glue | Playwright (`page.evaluate` + TreeWalker) | The suite standard; traces on failure; CI job exists |
| English-value word source | a hand-maintained word list | Flatten `src/locales/en.json` at test time | Self-maintaining: 1,585-line catalogue is the oracle `[VERIFIED: wc -l]`; hand lists rot |
| Fail-the-build mechanism | a new gate script | the existing `prebuild` hook + `npm run build` in CI | Already demonstrated failing on an uncatalogued literal (STATE.md); D-07 forbids a scanner-side hard gate |
| Parity checking | any new parity test | `test/catalogue.test.mjs` + `scripts/fr-parity.mjs` | D-08: already pins 100% en↔fr parity |
| Fr chunk emission | postbuild copy hacks | existing `import.meta.glob` chunking | Already emits `dist/assets/fr-*.js` |

**Key insight:** every mechanism this phase needs was built and proven in phases 5–10. The phase's
value is *pinning*, not inventing — a new mechanism would be a deviation from D-07/D-08.

## Runtime State Inventory

Not a rename/refactor/migration phase — but the ship-verification criterion asks the analogous
question ("what does the shipped artifact actually contain?"), so the inventory is done in that
spirit:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None affected — the phase changes no stored schema or key. Demo seed content stays English by PROJECT.md D-15. | None |
| Live service config | GitHub Actions: `ci.yml` gains a third job (additive). Docker image: rebuilt by the new job. | Add the job; nothing else |
| OS-registered state | None — verified: no scheduled tasks, no pm2/launchd/systemd registrations in the repo | None |
| Secrets/env vars | The docker job needs `ADMIN_EMAIL`/`ADMIN_PASSWORD` at boot — inline CI values, not secrets (throwaway container, ports bound to the runner only) | Inline env in the job |
| Build artifacts | `dist/assets/fr-*.js` is content-hashed; the image copies `dist/` fresh at build (`Dockerfile:9` runs `npm run build` inside the image build, so the fr chunk is built *in* the image, not copied from the host) | None — but the CI assertion must resolve the hash-suffixed name dynamically, never hardcode `fr-DsYUjSQO.js` |

## Common Pitfalls

### Pitfall 1: The leak scan false-positives on legitimate English
**What goes wrong:** brand words ("Gr8r"), plan wire values ("Free", stored ids rendered as
labels), user-created content (fixture names like "Probe"), and French values identical to English
ones ("Table" — the spec already documents this exact case for the project tab bar) get flagged.
**Why it happens:** catalogue-value equality is deliberately narrow, but a few real surfaces share
values across locales or render data.
**How to avoid:** a small, commented stop-list const in the spec (CONTEXT §Specifics: "visible,
commented, and small"); exclude user-content elements (fixture data lives in rows the fixtures
created — seed English fixture names deliberately, or scan only chrome-owned containers if row
content proves noisy).
**Warning signs:** the sweep fails on routes whose data the fixtures themselves created.

### Pitfall 2: A blank/error page passes the sweep
**What goes wrong:** a route 500s or renders empty; the leak scan finds no English (nothing at
all) and "passes".
**Why it happens:** absence of English is not presence of French.
**How to avoid:** D-03 is exactly this — the French marker assertion runs *before* the scan, per
route. Marker source: the route's catalogue-driven heading/title read via `fmt()` from the
catalogue, not hardcoded transcription (10-REVIEW WR-01 penalised hardcoded transcriptions).

### Pitfall 3: Asserting the fr chunk by filename
**What goes wrong:** the CI job greps for `fr-DsYUjSQO.js`; the next build rehashes and the job
fails, or worse, greps a stale name and passes vacuously.
**Why it happens:** Vite content-hashes asset names.
**How to avoid:** resolve the chunk dynamically — parse the served `index.html`/asset map for the
`fr-*.js` asset reference, fetch that URL, assert French content inside.

### Pitfall 4: The demo test leaks state via localStorage
**What goes wrong:** the demo EN↔FR switch test writes `LOCALE_STORAGE_KEY` that a later context
inherits, or the demo fallback never triggers because a proxy serves `/api`.
**Why it happens:** localStorage is per-origin and the key is read at boot (`i18n.js:120`).
**How to avoid:** one fresh browser context per scenario (suite convention); ensure the demo boot
serves only static files (`vite preview` of `dist/`, no `/api` proxy — `vite.config.js:65-70`
proxies only in `server` (dev) mode, not `preview`, so `/api` 404s and the fallback fires).

### Pitfall 5: The docker job's container has no seed/admin and never serves
**What goes wrong:** the container exits or health-check fails and the job fails for the wrong
reason.
**Why it happens:** the entrypoint (`docker-entrypoint.sh`) may require admin env vars and a
writable `/data` volume.
**How to avoid:** supply `ADMIN_EMAIL`/`ADMIN_PASSWORD` env, let the VOLUME create `/data`, wait
on `/api/health` (the HEALTHCHECK's own target) before asserting.

### Pitfall 6: Docs drift on "what is translated"
**What goes wrong:** README claims more or less than reality.
**How to avoid:** state exactly the D-13/D-15 boundary — interface translated (en+fr); demo seed
content not; the two prototype pages (`design-system`, `states`) not; four other languages
absent until they exist (LANG-01). CHANGELOG gets 1.2.0 notes text only — **no** version bump,
**no** `chore(release)` commit (D-14; the v1.1 order keeps that with `/gsd-complete-milestone`).

## Code Examples

### Whole-tree leak scan (D-05), including hidden nodes
```js
// Source: pattern authored for this phase over the surfaces named in D-02;
// TreeWalker with no visibility filter is standard DOM API (MDN).
const leaks = await page.evaluate((englishValues) => {
  const stop = new Set(['Gr8r', 'Free']); // maintained, commented stop-list (D-02)
  const hits = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const text = n.textContent.trim();
    if (text && englishValues.has(text) && !stop.has(text)) hits.push({ surface: 'text', value: text });
  }
  for (const el of document.querySelectorAll('[aria-label], [data-tip]')) {
    for (const attr of ['aria-label', 'data-tip']) {
      const v = el.getAttribute(attr);
      if (v && englishValues.has(v) && !stop.has(v)) hits.push({ surface: attr, value: v });
    }
  }
  if (englishValues.has(document.title)) hits.push({ surface: 'title', value: document.title });
  return hits;
}, englishValuesList);
expect(leaks, `route ${route}: untranslated English served`).toEqual([]);
```

### Demo-mode boot without a server (D-11)
```js
// e2e/demo-locale.spec.mjs — webServer: 'vite preview' serves dist/ only; /api 404s → demo fallback
// (DEPLOY.md: "If the API is not running, /api/config fails and the client falls back to local demo mode")
const context = await browser.newContext({ locale: 'fr-FR' }); // anonymous surfaces negotiate (10-02 exception)
// assert French interface; click the selector to English; reload; assert English persisted
// (localStorage: src/core/i18n.js:112/120)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 16-route overflow proof (phase 7) | 21-route sweep with leak detection | this phase | coverage widens, new assertion type (leak scan vs box math) |
| 1,700-entry allow-list (phase 6 start) | empty `[]` allow-list | phase 6 end | the pin makes the empty state contractual |
| 2-job CI (build, e2e) | 3-job CI (+docker-build) | this phase | shipped-artifact proof becomes a required gate |
| No demo-mode browser proof | Chromium demo test with localStorage persistence | this phase | phase-8 D-15 demo selector becomes observable |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The 21 routes = the 16 pinned overflow routes + `member` + `team` detail pages + project detail + `/join` + the auth page. The "5 added in phase 10" enumeration is not recorded as an explicit list in `.planning/phases/10-*` or ROADMAP. | Sweep mechanics / OQ-1 | Wrong route set → criterion 1 counts wrong; planner must fix the canonical list |
| A2 | `vite preview` does not proxy `/api` (only the dev `server` block proxies), so serving `dist/` via preview reliably triggers the demo fallback. | Pitfall 4 / D-11 | Demo test accidentally hits a live API or fails to fall back — cheap to verify with one curl during planning |
| A3 | The docker entrypoint needs `ADMIN_EMAIL`/`ADMIN_PASSWORD` to boot into a serving state. | Pitfall 5 | The CI job fails for an unrelated reason; verify `docker-entrypoint.sh` during planning |
| A4 | `main()` from i18n-scan.mjs is callable in-process and returns 0/1 as its exit semantic. | Build-gate pin | The pin test may need `execFileSync` (the suite already imports it) instead of the direct call — trivially adaptable |

## Open Questions

*(Both questions resolved at planning time — no unresolved open questions remain.)*

1. **The canonical 21-route list.** **(RESOLVED — see 11-01 Task 1)**
   The planner pinned the list explicitly in 11-01 Task 1 (action item 2): the 16 existing
   overflow routes plus `member`, `team` (real entity ids from API fixtures), project detail
   (seeded project id), `/join` (real invite token), and the auth page — matching assumption A1.
   `routes.length === 21` is asserted in the spec, so any miscount fails loudly on first run.
   - What we know: 16 pinned in `french-overflow.spec.mjs`; `ROUTE_IDS` has 20 entries minus
     system/states minus param-dependence; D-04 says "reuse phase 10's enumeration" but no
     explicit 21-entry list exists in the phase-10 artifacts.
   - What's unclear: exactly which 5 make up the additions (A1 is the most plausible split).
   - Recommendation: planner fixes the list explicitly in the plan and the spec pins it as data;
     the coverage assertion makes any miscount fail loudly on first run.

2. **How much fixture data the sweep needs.** **(RESOLVED — see 11-01 Task 1, action item 1)**
   Decided at planning: seed exactly one project + one task through the API (per D-06 and the
   phase-7 precedent), and let the first run surface any data-dependent leak (11-01 Task 2 then
   disposes of hits via catalogue fixes, not extra fixtures).
   - What we know: empty lists render empty states (translated), detail pages need ids.
   - What's unclear: whether leak-prone content appears only with data (e.g. activity, archive).
   - Recommendation: seed one project + one task (the phase-7 spec already does this) and let the
     first run tell; add fixtures only where the scan surfaces data-dependent leaks.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | all tests, build | ✓ | 24 (`engines >=24`) | — |
| Playwright Chromium | sweep + demo test | ✓ | ^1.64.1 (CI installs `--with-deps`) | — |
| Docker | docker-build CI job | ✓ on `ubuntu-latest` runners | GH-hosted | — (CI-only; local run optional) |
| Vite preview | demo test webServer | ✓ | ^6.4.4 | any static file server of `dist/` |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` (Node 24, `--test-concurrency=2`) + Playwright ^1.64.1 (Chromium) |
| Config file | `e2e/playwright.config.mjs` (single chromium project, `en-US` pin, gracefulShutdown); `package.json` `test` script |
| Quick run command | `node --test test/i18n-scan.test.mjs` and `node --test test/dependencies.test.mjs` |
| Full suite command | `npm test` then `npm run build && npm run e2e` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UAT-10/c1 | 21 routes in French: French marker present, no English-catalogue-value leak on text/aria-label/data-tip/title | e2e (Chromium) | `npm run build && npm run e2e` (french-overflow.spec.mjs) | ✅ file exists, sweep tests ❌ Wave 0 |
| UAT-10/c2 | Allow-list `[]` + scan exit 0 on live tree | unit (node:test, live-tree) | `node --test test/i18n-scan.test.mjs` | ✅ file exists, pin tests ❌ Wave 0 |
| UAT-10/c3a | Image serves the fr chunk with French content | CI integration | `docker-build` job in `ci.yml` | ❌ Wave 0 |
| UAT-10/c3b | Demo (no server) renders French; EN↔FR switch persists | e2e (Chromium, static) | `npm run build && npm run e2e` (demo spec, second project/webServer) | ❌ Wave 0 |
| UAT-10/c3c | No `dependencies` in package.json; runtime stage bare node | unit (node:test) | `node --test test/dependencies.test.mjs` | ❌ Wave 0 |
| UAT-10/c4 | README/CHANGELOG/DEPLOY state the boundary; 1.2.0 notes drafted, no tag | manual/docs | docs review at `/gsd-verify-work` | manual-only (justified: prose claims) |

### Sampling Rate
- **Per task commit:** the touched suite (`node --test <file>` or the targeted Playwright spec).
- **Per wave merge:** `npm test` and `npm run build && npm run e2e`.
- **Phase gate:** full suite green, plus the docker-build job observed green in CI (or `docker build && docker run` locally if the runner path is impractical) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] Sweep tests inside `e2e/french-overflow.spec.mjs` (21-route list data, marker helper, leak scanner)
- [ ] Pin tests appended to `test/i18n-scan.test.mjs`
- [ ] `test/dependencies.test.mjs` (D-12)
- [ ] `e2e/demo-locale.spec.mjs` + playwright config second project/webServer (D-11)
- [ ] `docker-build` job in `.github/workflows/ci.yml` (D-10)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | (no auth surface touched; CI container uses throwaway inline credentials) |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes (marginal) | The docker job's assertions parse served HTML — treat page content as data; assert with fixed-string search, no injection of fetched content into shells |
| V6 Cryptography | no | — |

### Known Threat Patterns for this phase's stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| CI job running untrusted PR code with Docker | Tampering/Elevation | The job only builds/runs the repo's own image on `pull_request` from same-repo branches (existing CI trigger shape); no `docker push`, no registry credentials |
| Fixture accounts in sweep reaching real data | Information disclosure | Throwaway run-unique accounts/workspaces via `createAccount` (suite convention, already enforced by `clientIp`) |

The phase adds no product attack surface — it is tests, CI and docs. No new secrets, no new
endpoints, no dependency change.

## Sources

### Primary (HIGH confidence — files read this session)
- `e2e/french-overflow.spec.mjs` — 16-route list, `frenchShell`, viewport loop, exclusion comment
- `e2e/helpers/setup.mjs` — `apiClient`, `clientIp`, `createAccount` (locale-aware, D-06 helper)
- `scripts/i18n-scan.mjs` — header contract, `ALLOW_LIST` path, exit semantics
- `test/i18n-scan.test.mjs` — contract-suite conventions, live-tree exception precedent
- `test/fixtures/i18n-pending.json` — currently `[]`
- `src/shell/render.js` — `ROUTE_IDS` verbatim, `document.title` catalogue-driven update
- `src/core/i18n.js` — `import.meta.glob` chunking, localStorage persistence
- `Dockerfile` — build/runtime stages, dist copy, HEALTHCHECK
- `.github/workflows/ci.yml` — current 2-job shape
- `package.json` — scripts (prebuild), engines, devDependencies-only
- `DEPLOY.md` §12 — demo fallback documentation
- `dist/assets/` — observed `fr-*.js` chunk
- `.planning/{ROADMAP,REQUIREMENTS,STATE}.md`, phase 10 CONTEXT/REVIEW artifacts

### Secondary (MEDIUM)
- None needed — no external-API research was required; TreeWalker usage is standard DOM
  (uncontroversial, no version sensitivity).

### Tertiary (LOW)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — everything verified against the repo this session; zero new packages.
- Architecture: HIGH — all decisions D-01..D-15 pre-locked; research only mapped them onto read files.
- Pitfalls: HIGH for repo-internal ones (read directly); A1–A3 are environment/detail assumptions flagged for planning.

**Research date:** 2026-10-24
**Valid until:** 2026-11-23 (stable — intra-repo facts; re-verify only if the tree moves materially)
