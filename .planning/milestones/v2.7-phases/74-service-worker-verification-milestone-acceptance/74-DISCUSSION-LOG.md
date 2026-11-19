# Phase 74 Discussion Log

**Date:** 2026-11-18
**Mode:** default (single-select questions, 4 areas)

## Areas & Questions

### 1. SW pin mechanism & test placement
- Options presented: new sw-contract.test.mjs (rec) / extend manifest-contract.test.mjs / line pins only.
- **Selected:** New `test/sw-contract.test.mjs` — content-hash pin + key-line byte pins + manifest↔SW scope agreement assertion.
- D-01.

### 2. DEPLOY.md PWA section
- Options presented: Section 18 (rec) / under Operational limits / Section 18 + Troubleshooting rows.
- **Selected:** New `## 18. Installable app (PWA)`, self-contained incl. one Lighthouse paragraph.
- D-02.

### 3. UAT scope & evidence
- Options presented: 74-UAT.md 4 tests (rec) / verification digest only / expanded 6+ test matrix.
- **Selected:** `74-UAT.md` following the 73-UAT.md pattern — desktop Chrome, Android Chrome, iOS manual install, push still works. Results + optional screenshots committed.
- D-03.

### 4. Registration pin coverage
- Options presented: static pins only (rec) / static + e2e check / one-call-site pin only.
- **Selected:** Static pins in sw-contract.test.mjs — one register call site, '/sw.js' literal + default scope, both main.js boot paths, api.enabled gate intact.
- D-04.

## Notes
- All four areas were discussed; user picked the recommended option each time (consistent with Phases 72/73).
- No scope creep; deferred ideas: none.
- Agent discretion: code-context corrections — phase 72's test is `test/manifest-contract.test.mjs` (not `test/pwa.test.mjs`); DEPLOY.md is at `docs/DEPLOY.md`.
