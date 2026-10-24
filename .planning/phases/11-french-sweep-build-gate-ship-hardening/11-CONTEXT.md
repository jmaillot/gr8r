# Phase 11: French sweep, build gate & ship hardening - Context

**Gathered:** 2026-10-24
**Status:** Ready for planning

<domain>
## Phase Boundary

The guarantee becomes a shipped property. A sweep over the 21 product routes in French proves no
untranslated English string is served — with a coverage assertion beside it, so an empty page
cannot pass. A static scan of the sources fails the build on a new user-visible literal that never
reached a catalogue. The shipped artifact is verified: the French catalogue is in the built bundle
and in the Docker image, demo mode without a server is French and can switch language, and the app
still ships with no runtime dependency. The documentation states plainly what is translated (the
interface) and what is not (the demo seed content, the two prototype pages), and the release notes
record the milestone.

Out of scope: the demo seed's sample content and the two prototype pages (design-system, states)
stay English/excluded per PROJECT.md D-15; the four other languages stay untranslated; real
billing (phase 12 handles files); translating the invitation email (LANG-02).

Requirements: **UAT-10**

Deliverable: no route serves an untranslated English string, and the guarantee holds in the
shipped image.

</domain>

<decisions>
## Implementation Decisions

### Sweep mechanics

- **D-01:** The 21-route French sweep **extends `e2e/french-overflow.spec.mjs`** from 16 to 21
  routes rather than creating a new spec file — one proof family, one file, matching the suite's
  one-file-per-proof-family shape.
- **D-02:** A leak is detected by an **English-catalogue-value heuristic over the rendered DOM** —
  the scan sources are the en.json catalogue values plus a maintained stop-list of legitimate
  English (brand words, plan wire values like 'Free', user content). Scanned surfaces: text nodes,
  `aria-label`, `data-tip`, and `document.title` — the surfaces where leaks live per the roadmap.
- **D-03:** The coverage assertion is a **pinned route list of exactly 21 routes**; each visit must
  first find a known French marker before the leak scan runs, so a blank or error page cannot pass.
- **D-04:** The route set is **exactly the overflow spec's 16 routes plus the 5 added in phase
  10** — reuse phase 10's enumeration and fixtures. Prototype pages stay excluded.
- **D-05:** The leak scan covers the **whole DOM tree, hidden nodes included** (closed modals,
  popovers, off-screen panels) — those are the named leak surfaces and scanning them is
  deterministic.
- **D-06:** The sweep session is an **API-created account with locale 'fr'** via the phase-10
  locale-aware fixture helper (`createAccount` + `PATCH /api/auth/me`); the sweep does not switch
  language through the UI (already proven in phase 8).

### Build gate scope

- **D-07:** Criterion 2 = **pin the empty allow-list and prove the gate in CI**: a test asserts
  `test/fixtures/i18n-pending.json` stays `[]` and the scan exits 0 on the tree; the existing
  `prebuild` hook remains the fail-the-build mechanism. The allow-list is **not** turned into a
  hard gate inside the scanner itself (it remains a progress meter by design).
- **D-08:** **Existing parity tooling suffices** — `scripts/fr-parity.mjs` and the phase 6–9
  catalogue tests already pin 100% en↔fr parity and placeholders. No new parity gate, no combined
  gate script.
- **D-09:** The empty-allow-list pin lives in **`test/i18n-scan.test.mjs`**, the scanner's existing
  contract test file.

### Ship verification

- **D-10:** Criterion 3 is proven by a **docker-build CI job**: `docker build`, then run the image
  and assert the French catalogue chunk is **served** (fetch the page, resolve the fr chunk asset,
  verify French content) — proof of the shipped artifact, not merely file presence.
  — **Reversibility:** reversible — the CI job is additive; removing it restores the previous CI shape.
- **D-11:** Demo mode without a server is proven by a **Chromium test**: load the built demo (api
  disabled) with a fr-preferring browser — the interface renders French and the selector switches
  EN↔FR with localStorage persistence. Phase-8 D-15 (demo selector, localStorage backend) made
  observable in a real browser.
- **D-12:** Zero runtime dependency is pinned by a **node:test asserting package.json carries no
  runtime dependencies** (devDependencies only) and the Dockerfile runtime stage stays bare node.

### Docs & release notes

- **D-13:** The "translated vs not" statement lives in a **README § Internationalization** section
  (interface translated; demo seed content and the two prototype pages not).
- **D-14:** This phase writes **docs + release notes only — the 1.2.0 tag happens at milestone
  close**: CHANGELOG gains the 1.2.0 notes text, but the version bump and `chore(release)` commit
  stay with `/gsd-complete-milestone`, matching the v1.1 order.
- **D-15:** The doc set is **README + CHANGELOG + DEPLOY**: README states translated-vs-not;
  CHANGELOG drafts the 1.2.0 notes; DEPLOY mentions the new docker-build CI job and that the image
  carries the French catalogue.

### the agent's Discretion

- Exact French marker strings per route, the stop-list contents, and the sweep's internal
  assertion helper structure — implementation detail for research/planning within D-02/D-03.
- The docker-build CI job's runner/tooling choices (e.g. `docker run` vs `docker create` +
  extraction) as long as the served-chunk assertion holds (D-10).
- How the demo Chromium test boots the built demo (static preview vs serving `dist/`) as long as
  no API server is involved (D-11).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone contracts
- `.planning/ROADMAP.md` — section « Phase 11: French sweep, build gate & ship hardening » (goal,
  success criteria 1–4, UAT-10)
- `.planning/REQUIREMENTS.md` — UAT-10 and the phase-11 coverage table
- `.planning/PROJECT.md` — §Decisions for milestone v1.2, especially D-15 (demo seed English,
  prototype pages excluded) and D-12 (no translation-management UI)

### Prior phase contracts this phase builds on
- `.planning/phases/07-french-catalogue-french-typography/07-CONTEXT.md` — French catalogue and
  overflow-proof conventions; the 16-route overflow spec this phase widens
- `.planning/phases/10-browser-coverage-in-both-locales/10-CONTEXT.md` — D-01 (flows spec
  organization), D-06 (locale-aware fixture helper) the sweep reuses
- `.planning/phases/06-english-extraction-locale-aware-formats/06-CONTEXT.md` — the scan/allow-list
  contract and the empty-allow-list end state this phase pins
- `.planning/phases/05-i18n-foundation-catalogue-contract/05-CONTEXT.md` — the i18n layer contract
  (`t()`, JSON catalogues, per-locale chunking) the ship verification relies on

### Existing proof files (the patterns to follow)
- `e2e/french-overflow.spec.mjs` — the French UI proof to extend from 16 to 21 routes
- `e2e/helpers/setup.mjs` — `apiClient`, `clientIp`, locale-aware account creation
- `scripts/i18n-scan.mjs` — the static scan (position-based) behind the build gate
- `scripts/fr-parity.mjs` — catalogue parity checker (D-08)
- `test/i18n-scan.test.mjs` — the scanner contract tests (D-09 pin target)
- `Dockerfile` — the build/runtime stages the image proof asserts against
- `README.md`, `DEPLOY.md`, `CHANGELOG.md` — the doc surfaces (D-13/D-14/D-15)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/i18n-scan.mjs` (1450 lines) — the measuring device; `prebuild`/`prebuild:en` already
  fail the build on uncatalogued literals; allow-list `test/fixtures/i18n-pending.json` is already
  `[]`
- `e2e/french-overflow.spec.mjs` — the 16-route French proof; its comment says later phases widen
  coverage — this phase is that widening
- `e2e/helpers/setup.mjs` — `apiClient`, `clientIp(run, tag)`, locale-aware account creation
  helpers from phase 10
- `src/locales/en.json` / `fr.json` (1,449 keys, 100% parity) — the leak heuristic's word source
- `Dockerfile` — copies `dist/` wholesale; the fr chunk ships automatically once built

### Established Patterns
- One proof family per spec file; fixtures only through the real API; visibility claims in the
  browser with role/label/text selectors
- `node:test` against real servers, never mocked HTTP/SQLite; `npm run build && npm run e2e` as
  the Chromium entry point
- Release order: feature/docs commits first, then one `chore(release): X.Y.Z` commit (v1.1 order,
  reaffirmed in D-14)
- CI currently: lint/format/build job + `npm test` job + required Chromium e2e job

### Integration Points
- `.github/workflows/*` — gains the docker-build job (D-10)
- `e2e/playwright.config.mjs` — the `en-US` pin (UAT-09) stays; the sweep uses its own fr account,
  not the browser locale
- `package.json` scripts — unchanged shape; the pin test asserts `dependencies` stays absent
- README/DEPLOY/CHANGELOG — the doc deltas (D-13–D-15)

</code_context>

<specifics>
## Specific Ideas

- The route count 21 is pinned as data (a list of route paths in the sweep), not a magic number
  asserted in one place — adding route 22 without updating the list should fail loudly.
- The fr chunk assertion inside the image verifies French *content*, not just file presence.
- The stop-list is maintained like the old allow-list: visible, commented, and small.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-french-sweep-build-gate-ship-hardening*
*Context gathered: 2026-10-24*
