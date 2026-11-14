# Phase 56: Delivery Infrastructure - Context

**Gathered:** 2026-11-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Three deliverables, all infrastructure with no user-facing feature surface beyond the QR loading spinner: (1) DELIV-01 — the e2e server refuses to serve a stale `dist/`, fail-closed; (2) DELIV-02 — Vite build produces no chunk over 500 kB via dynamic imports, with the EN base catalogue kept in the entry chunk; (3) I18N-01 — the locale registry/loaders/gate accept a new locale by adding one JSON file, proven by a fixture test. No new shipped language in this milestone. Push, search, views, dashboard are later phases (57-61).

</domain>

<decisions>
## Implementation Decisions

### DELIV-02 — chunk splitting
- **D-01:** Split strategy is vendor + seed only: dynamic-import `src/lib/vendor/qrcode.js` (2187 lines, used only on QR click) and `src/data/seed.js` (515 lines, demo-mode only). `src/actions/actions.js` and the rest of the app stay in the entry chunk — no page-level splitting.
- **D-02:** Acceptance guard is a build test: a unit test (test/ or scripts/) runs `vite build` and fails if any chunk exceeds 500 kB. Regression cannot land silently.
- **D-03:** QR chunk loading UX: spinner shown at click while the dynamic import resolves; on failure, error toast and retry on next click. No idle preloading of the QR chunk.

### DELIV-01 — stale dist guard
- **D-04:** Detection is content-hash based via Vite `build.manifest: true` — compare the dist manifest hashes against a stamp recorded at build time. mtime is never trusted (git checkout / touch false positives).
- **D-05:** Behavior is fail-closed refusal: `e2e/server.mjs` exits non-zero with a clear message ("dist/ stale — run `npm run build`"). No auto-rebuild, no env opt-in.
- **D-06:** Location: inside `e2e/server.mjs`, next to the existing `dist/index.html` existence check (line ~20). No separate pretest hook — a hook could be bypassed by invoking server.mjs directly.

### I18N-01 — add-a-locale-by-JSON
- **D-07:** The `LOCALES` registry becomes derived: locale codes come from the files found by the existing `import.meta.glob('../locales/*.json')`, display names come from a known-language name map, unknown languages fall back to the raw code as name. Adding a locale = adding one JSON file, truly.
- **D-08:** Proof is an end-to-end fixture test: a fake locale (e.g. `xx.json`) in a fixture directory is offered by the selector, loaded by the loader, en/fr behavior is untouched, and the `scripts/i18n-scan.mjs` gate does not flag its keys as dead.
- **D-09:** Build contract: the glob is the source of truth — the default build ships every locale present in `src/locales/`; `LOCALES=en` remains the EN-only opt-out. A newly added JSON ships at the next build with no whitelist edit. The `localeSubset` plugin in `vite.config.js` stays but its set is derived the same way.

### the agent's Discretion
- Exact stamp mechanism for D-04 (separate stamp file vs manifest self-hash) — plan-time choice, constraint is "hash-based, mtime never trusted"
- Test file placement and naming for D-02/D-08 (house conventions in `test/`)
- Spinner visual design (reuse existing loading patterns)
- How `registerCatalogue`/fallback order changes (if any) under the derived registry, provided en stays static-imported in the entry chunk (D-08 invariant + existing D-08 i18n decision "base locale ships in every build")

</decisions>

<specifics>
## Specific Ideas

- The e2e stale-dist failure mode is well known to the owner: src changed, build forgotten, e2e fails on misleading symptoms. The guard's error message should name the fix (`npm run build`) directly.
- Current measured state (scout, 2026-11-12): entry chunk `dist/assets/index-*.js` is 627 kB; fr locale chunk 97 kB (already split); zero dynamic imports exist in `src/` today; locales and lucide icons (173 used, virtual module) are already optimized.
- EN base catalogue stays statically imported (`import en from '../locales/en.json'`) so locale chunks can never race first paint — this is an existing house invariant, not negotiable.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition & requirements
- `.planning/ROADMAP.md` §Phase 56 — goal, requirements DELIV-01/02 + I18N-01, success criteria
- `.planning/REQUIREMENTS.md` §Delivery Infrastructure — requirement wording

### Research (v2.2 milestone research)
- `.planning/research/STACK.md` — Vite 8.3.x code-splitting specifics, `build.manifest: true`, locale chunk loading via template-literal dynamic import, chunkSizeWarningLimit stays at the 500 kB default (it is the acceptance gate)
- `.planning/research/ARCHITECTURE.md` — e2e/server.mjs guard location rationale (mtime comparison beside existing dist check; pretest hooks can drift), integration points
- `.planning/research/PITFALLS.md` — e2e guard pitfalls (rebuild-on-every-run is slow; staleness detection must be content-based), locale chunk race at first paint

### Existing implementation touchpoints
- `vite.config.js` — `localeSubset` plugin, `BUILD_LOCALES` env whitelist (both must derive from the glob per D-09)
- `src/core/i18n.js` — hardcoded `LOCALES` registry (to be derived per D-07), static en import, `import.meta.glob` loaders
- `e2e/server.mjs` — existing `dist/index.html` existence check (~line 20), the DELIV-01 insertion point
- `scripts/i18n-scan.mjs` — the dead/stale key gate that the fixture test must not trip (D-08)
- `package.json` scripts — `prebuild` runs the i18n scan; the build test (D-02) slots into existing script conventions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/icons.mjs` `lucideIconNames('src')` scan — precedent for a shared scan living outside src/ used by both the build plugin and tests; the derived-locale mechanism can follow this shape
- `src/core/i18n.js` `registerCatalogue` + glob loaders — the plumbing already loads any `../locales/*.json`; only the registry blocks add-by-JSON
- `vite.config.js` `localeSubset` plugin — single place where build-time locale shipping is decided

### Established Patterns
- House invariant: EN base catalogue inlined in entry chunk via top-level static import + `registerCatalogue` (vite.config.js comment block documents the locale-subset byte contract)
- Fail-closed guard style: e2e/server.mjs already exits with an actionable message when dist is missing — DELIV-01 extends the same pattern to staleness
- Gates as tests: lint, i18n-scan, unit suite — the 500 kB build test joins this family rather than being a CI-only script

### Integration Points
- `e2e/server.mjs` startup sequence — guard check before listen on port 4317
- `vite build` output → `dist/.vite/manifest.json` (requires `build.manifest: true`, currently unset)
- QR usage site in the share/invite modal (`src/overlays/modals.js` references export formats; the QR click site feeds the dynamic import)
- Demo-mode entry point that imports `src/data/seed.js`

</code_context>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 56-delivery-infrastructure*
*Context gathered: 2026-11-12*
