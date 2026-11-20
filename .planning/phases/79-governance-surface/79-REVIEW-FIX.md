---
phase: 79-governance-surface
fixed_at: 2026-11-20T00:00:00Z
review_path: .planning/phases/79-governance-surface/79-REVIEW.md
iteration: 2
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 79: Code Review Fix Report

**Fixed at:** 2026-11-20
**Source review:** .planning/phases/79-governance-surface/79-REVIEW.md
**Iteration:** 2 (fix_scope: all — pass 1 covered the 2 Critical + 2 Warning findings)

**Summary:**
- Findings in scope: 7 (2 Critical, 2 Warning — already fixed in pass 1; 3 Info — fixed in this pass)
- Fixed: 7
- Skipped: 0

**Verification (this pass):** All fixes were applied and verified in the **main checkout** (`workflow.use_worktrees=false` — no isolated worktree). Per-fix Tier 1/2 checks: `node --check` on every touched JS file, JSON parse of all 5 locale files, and the full touched-suite run — `i18n-core-features`, `i18n-scan` (live dead-key gate), `i18n-toast`, `i18n-shell`, `governance-client`, `governance`, `static-db-audit`, `build-locales` — **139/139 pass** after each commit.

## Fixed Issues (this pass — Info findings)

### IN-01: Dead client code — `A.govReleaseAsk`, `api.operatorWsReassign`, `api.operatorWsRelease` have no call sites

**Files modified:** `src/actions/actions.js`, `src/core/api.js`, `src/locales/en.json`, `src/locales/fr.json`, `src/locales/de.json`, `src/locales/es.json`, `src/locales/nl.json`, `test/i18n-core-features.test.mjs`, `test/governance-client.test.mjs`
**Commit:** 6bf55c6d
**Applied fix:** Deleted `A.govReleaseAsk` (the standalone type-to-confirm release action) and the two unused `api` methods — release/reassign ride the orphan dispositions path only. Deleting the action orphaned 4 locale keys (`page.governance.confirmReleaseTitle/confirmReleaseBody/okRelease` + `toast.governanceReleased`), so they were removed from all 5 catalogues too — required by the live dead-key gate (`i18n-scan.test.mjs`, UX-01 criterion 5). Pins updated: catalogue size 2011 → 2007, api.js verb count 58 → 56, and `governance-client.test.mjs` dropped the `typeName: email` release-ask assertion (archive/delete slug pins retained). Server routes untouched — they are exercised directly by `governance.test.mjs` and remain the D-11 control.

### IN-02: Stale comment in settings.js still points at the relocated operator card

**Files modified:** `src/pages/settings.js`
**Commit:** 14674145
**Applied fix:** The MCP-01 apikeys comment now reads "Revoke follows the governance page's operator card inline-confirm stage (relocated there in 79-03)" instead of describing a card that no longer lives in the Settings tab.

### IN-03: Workspace search input reuses member-search a11y labels

**Files modified:** `src/pages/governance.js`, `src/locales/en.json`, `src/locales/fr.json`, `src/locales/de.json`, `src/locales/es.json`, `src/locales/nl.json`, `test/i18n-core-features.test.mjs`
**Commit:** c1f02722
**Applied fix:** Added `page.governance.searchWs` to all 5 catalogues ("Search workspaces" / "Rechercher des espaces de travail" / "Arbeitsbereiche durchsuchen" / "Buscar espacios de trabajo" / "Werkruimten doorzoeken") and wired it to both the `aria-label` and the `placeholder` of the `#gov-q` workspace filter input (the placeholder previously read `a11y.searchNameOrEmail` — also member-flavored — so the single key now serves both attributes). Catalogue pin updated 2007 → 2008; FR/EN parity holds via `build-locales`.

## Carried Forward (pass 1 — Critical/Warning, already committed)

### CR-01: GET `/api/auth/operator/workspaces/:id/members` is never implemented

**Files modified:** `server.js`, `test/governance.test.mjs`
**Commit:** a0e61849

### CR-02: Stored XSS — orphan modal title interpolates a raw workspace name

**Files modified:** `src/pages/governance.js`
**Commit:** ee9c9397

### WR-01: `err.memberAlreadyMember` toast renders a literal `{name}` placeholder

**Files modified:** all 5 locale catalogues (reworded to a parameter-free key)
**Commit:** 7706e4a0

### WR-02: Governance reassign accepts an ARCHIVED destination workspace

**Files modified:** `server.js`, all 5 locale catalogues, `src/actions/actions.js`, `test/governance.test.mjs`, `test/governance-client.test.mjs`, `test/i18n-core-features.test.mjs`
**Commit:** 53278ea3

## Skipped Issues

None — all in-scope findings were fixed.

---

_Fixed: 2026-11-20T00:00:00Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 2_
