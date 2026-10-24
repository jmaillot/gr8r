# Phase 11: French sweep, build gate & ship hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-24
**Phase:** 11-french-sweep-build-gate-ship-hardening
**Areas discussed:** Sweep mechanics, Build gate scope, Ship verification, Docs & release notes

---

## Sweep mechanics

### Question 1 — Sweep structure

| Option | Description | Selected |
|--------|-------------|----------|
| Extend french-overflow.spec.mjs | Grow the existing spec from 16 to 21 routes with a route-count pin — one proof family, one file | ✓ |
| New sweep spec file | e2e/french-sweep.spec.mjs dedicated to the full 21-route sweep | |
| Programmatic crawl | One test visiting routes from a generated list, scanning rendered DOM | |

**User's choice:** Extend french-overflow.spec.mjs
**Notes:** —

### Question 2 — Leak definition

| Option | Description | Selected |
|--------|-------------|----------|
| English-dictionary heuristic on visible text | Scan text nodes, aria-label, data-tip, document.title for catalogue values / common English words | ✓ |
| Assert French markers only | Positive proof only, no negative English detection | |
| Reuse the i18n-scan as source of truth | Sweep asserts the scan report is empty; leak definition stays in the scanner | |

**User's choice:** English-dictionary heuristic on visible text
**Notes:** —

### Question 3 — Coverage assertion

| Option | Description | Selected |
|--------|-------------|----------|
| Pinned route count + per-route minimum French assertion | Iterate exactly 21 routes; each must find a known French marker before leak-scanning | ✓ |
| Route count + minimum visible-text volume | Cheaper, but volume can pass on the wrong language | |
| Assert html lang="fr" only | Weakest — proves locale state, not content | |

**User's choice:** Pinned route count + per-route minimum French assertion
**Notes:** —

### Question 4 — Route set

| Option | Description | Selected |
|--------|-------------|----------|
| Param-dependent included, prototypes excluded | 21 = 16 static + member/team etc. with real fixture ids | |
| Exactly the overflow spec's 16 + the 5 added in phase 10 | Reuse phase 10's enumeration and fixtures | ✓ |
| All routes incl. prototype pages | Contradicts the locked exclusion | |

**User's choice:** Exactly the overflow spec's 16 + the 5 added in phase 10
**Notes:** —

### Follow-up turn 1

| Option | Description | Selected |
|--------|-------------|----------|
| Next area | Move to Build gate scope | |
| More questions | Keep discussing the sweep | ✓ |

### Question 5 — Word list source

| Option | Description | Selected |
|--------|-------------|----------|
| English catalogue values + small stop-list | Match rendered strings against en.json values plus a maintained allow-list for legit English | ✓ |
| General English word dictionary | Catches unknown strings but noisy/flaky | |
| Negative keys only | Assert t() returned non-key values — misses literals never routed through t() | |

**User's choice:** English catalogue values + a small stop-list of allowed English
**Notes:** —

### Question 6 — DOM scope

| Option | Description | Selected |
|--------|-------------|----------|
| Whole DOM tree, hidden included | Modals/popovers are the surfaces where leaks live; deterministic | ✓ |
| Visible text only | Misses the chrome the roadmap names | |
| Visible + opened interactive states | Thorough but much slower | |

**User's choice:** Whole DOM tree, hidden included
**Notes:** —

### Question 7 — French session

| Option | Description | Selected |
|--------|-------------|----------|
| API-created account with locale 'fr' | Reuse the phase-10 locale-aware fixture helper | ✓ |
| Switch language through the UI once | Re-proves the switch (already proven in phase 8) | |
| Browser locale negotiation only | Tests negotiation, not the honest per-user locale | |

**User's choice:** API-created account with locale 'fr'
**Notes:** —

### Follow-up turn 2

| Option | Description | Selected |
|--------|-------------|----------|
| Next area | Move to Build gate scope | ✓ |
| More questions | Keep discussing the sweep | |

---

## Build gate scope

### Question 1 — What criterion 2 still needs

| Option | Description | Selected |
|--------|-------------|----------|
| Pin the empty allow-list + prove the gate in CI | Test asserts i18n-pending.json stays [] and the scan exits 0; prebuild remains the gate | ✓ |
| Scanner fails when allow-list non-empty | Turns the progress meter into a hard gate | |
| Add a scan self-test proving exit-1 on a planted literal | Makes the gate self-proving | |

**User's choice:** Pin the empty allow-list + prove the gate in CI
**Notes:** —

### Question 2 — Catalogue regression pinning

| Option | Description | Selected |
|--------|-------------|----------|
| Existing parity checks suffice | fr-parity.mjs + phase 6-9 catalogue tests already pin parity/placeholders | ✓ |
| Fold a parity run into the build gate | prebuild also runs fr-parity.mjs | |
| New combined gate script | One scripts/i18n-gate.mjs wrapping everything | |

**User's choice:** Existing parity checks suffice
**Notes:** —

### Question 3 — Where the pin lives

| Option | Description | Selected |
|--------|-------------|----------|
| In the scanner contract test file | test/i18n-scan.test.mjs already owns the scanner contract | ✓ |
| New dedicated test file | test/i18n-gate.test.mjs | |
| Inline in the scanner | Scanner errors when allow-list non-empty — too rigid | |

**User's choice:** In the scanner contract test file
**Notes:** —

### Follow-up

| Option | Description | Selected |
|--------|-------------|----------|
| Next area | Move to Ship verification | ✓ |
| More questions | Keep discussing the build gate | |

---

## Ship verification

### Question 1 — How criterion 3 is proven

| Option | Description | Selected |
|--------|-------------|----------|
| node:test on dist + source inspection, no docker build | Fast, but never proves the image | |
| Add a docker-build CI job | CI builds the image and asserts the fr chunk inside it | ✓ |
| Server boot smoke test | Proves serving, not the image | |

**User's choice:** Add a docker-build CI job
**Notes:** —

### Question 2 — Depth of the image proof

| Option | Description | Selected |
|--------|-------------|----------|
| Build + assert fr chunk inside image | Run a container, fetch the page, resolve the fr chunk, verify French content | ✓ |
| Build + dist listing only | Cheap, never fetches | |
| Build + full Chromium against the container | Strongest but heavy, duplicates the e2e job | |

**User's choice:** Build + assert fr chunk inside image
**Notes:** —

### Question 3 — Demo mode proof

| Option | Description | Selected |
|--------|-------------|----------|
| Chromium demo test | Built demo, fr-preferring browser, selector switches EN↔FR with localStorage | ✓ |
| node:test on demo mode logic only | No real browser | |
| Fold into the 21-route sweep | Mixes two proof families | |

**User's choice:** Chromium demo test
**Notes:** —

### Question 4 — Zero-dependency pin

| Option | Description | Selected |
|--------|-------------|----------|
| package.json assertions in a node:test | Asserts no runtime dependencies + Dockerfile runtime stays bare node | ✓ |
| CI job grep only | Visible but not part of the suite | |
| No new pin | Weakest | |

**User's choice:** package.json assertions in a node:test
**Notes:** —

### Follow-up

| Option | Description | Selected |
|--------|-------------|----------|
| Next area | Move to Docs & release notes | ✓ |
| More questions | Keep discussing ship verification | |

---

## Docs & release notes

### Question 1 — Where the translated-vs-not statement lives

| Option | Description | Selected |
|--------|-------------|----------|
| README § Internationalization | Short section, linked from DEPLOY; CHANGELOG records the milestone | ✓ |
| Separate I18N.md | A fourth top-level doc is heavy | |
| CHANGELOG only | Least discoverable | |

**User's choice:** README § Internationalization
**Notes:** —

### Question 2 — Release timing

| Option | Description | Selected |
|--------|-------------|----------|
| Docs + release notes only; tag at milestone close | CHANGELOG gains 1.2.0 notes text; version bump/tag at /gsd-complete-milestone (v1.1 order) | ✓ |
| Tag 1.2.0 in this phase | Phase ends with chore(release): 1.2.0 | |
| No release notes this phase | Contradicts roadmap criterion 4 | |

**User's choice:** Docs + release notes only; tag at milestone close
**Notes:** —

### Question 3 — Doc set

| Option | Description | Selected |
|--------|-------------|----------|
| README + CHANGELOG + DEPLOY | DEPLOY also mentions the docker-build job and the fr catalogue in the image | ✓ |
| README + CHANGELOG only | DEPLOY stays deployment-only | |
| Also update .planning docs | Handled by GSD transition anyway | |

**User's choice:** README + CHANGELOG + DEPLOY
**Notes:** —

### Follow-up

| Option | Description | Selected |
|--------|-------------|----------|
| Ready for context | Write CONTEXT.md | ✓ |
| More questions | Keep discussing docs | |

---

## the agent's Discretion

- French marker strings per route, stop-list contents, sweep assertion helper structure
- Docker assertion tooling (docker run vs create+extract)
- How the demo Chromium test boots the built demo (no API server involved)

## Deferred Ideas

None — discussion stayed within phase scope
