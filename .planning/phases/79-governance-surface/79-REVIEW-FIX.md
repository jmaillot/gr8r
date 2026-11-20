---
phase: 79-governance-surface
fixed_at: 2026-11-20T00:00:00Z
review_path: .planning/phases/79-governance-surface/79-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 79: Code Review Fix Report

**Fixed at:** 2026-11-20
**Source review:** .planning/phases/79-governance-surface/79-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (2 Critical, 2 Warning — Info findings out of scope)
- Fixed: 4
- Skipped: 0

**Verification:** All fixes were applied and verified in the **main checkout** (`workflow.use_worktrees=false` — no isolated worktree was created). Verification: `node --check server.js`, JSON parse of all 5 locale files, and the touched test suites (`governance.test.mjs`, `governance-client.test.mjs`, `i18n-core-features.test.mjs`, `i18n-toast.test.mjs`, `i18n-shell.test.mjs`, `static-db-audit.test.mjs`) — **86/86 pass**.

## Fixed Issues

### CR-01: GET `/api/auth/operator/workspaces/:id/members` is never implemented

**Files modified:** `server.js`, `test/governance.test.mjs`
**Commit:** a0e61849
**Applied fix:** Added the read route before the POST member route, mirroring the family's guard order (sameOrigin → requireUser → operator gate → target lookup) and the WSG-07 payload shape: `members` (via `membersOf`) + `targets` (active workspaces with name + member count, delete target excluded, `archived = 0` filter included per the D-08 targets spec / WR-02 note). Read route carries no throttle per the Phase 78 read precedent. Added two integration tests: the full orphan path (members payload, active-target presence, memberCount, exclusion of the delete target AND of an archived workspace, 404 edge) and the non-operator 403 `operatorOnly` no-oracle edge.

### CR-02: Stored XSS — orphan modal title interpolates a raw workspace name

**Files modified:** `src/pages/governance.js`
**Commit:** ee9c9397
**Applied fix:** `govOrphanBody` now passes `esc(o?.ws?.name || '')` to `t('page.governance.orphanTitle', …)`, restoring the page's own esc-at-interpolation discipline (matching `esc(ws.slug)` in confirm bodies and `esc(m.name)` in rows).

### WR-01: `err.memberAlreadyMember` toast renders a literal `{name}` placeholder

**Files modified:** `src/locales/en.json`, `src/locales/fr.json`, `src/locales/de.json`, `src/locales/es.json`, `src/locales/nl.json`
**Commit:** 7706e4a0
**Applied fix:** Took the reviewer's *second* option — a **parameter-free key** — rather than passing the destination name: the `{name}` placeholder in the existing copy refers to the *member*, so interpolating `S.ui.govOrphan?.ws?.name` (the workspace being deleted) would have produced a semantically wrong message ("Doomed Co is already a member of that workspace"). The key is now parameter-free in all 5 catalogues ("That member is already in the destination workspace. Pick another destination." + translations), matching the server's refusal text. `govRefusalToast` needed no change: the parameter-free `t('err.' + code)` lookup now resolves cleanly.

### WR-02: Governance reassign accepts an ARCHIVED destination workspace

**Files modified:** `server.js`, `src/locales/en.json`, `src/locales/fr.json`, `src/locales/de.json`, `src/locales/es.json`, `src/locales/nl.json`, `src/actions/actions.js`, `test/governance.test.mjs`, `test/governance-client.test.mjs`, `test/i18n-core-features.test.mjs`
**Commit:** 53278ea3
**Applied fix:** Both reassign branches (delete-path dispositions and standalone reassign) now select `archived` in the target query and refuse with `fail(res, 409, 'targetArchived', …)` after the target lookup. Added `err.targetArchived` to all 5 catalogues (catalogue-size pin in `i18n-core-features.test.mjs` updated 2010 → 2011 with the changelog annotation), added `targetArchived` to `govRefusalToast`'s keyed list so the toast is localized, and the GET-members targets payload (CR-01) already excludes `archived = 1` rows — the server remains the control (D-11). Added an integration test covering both paths (409 `targetArchived`, no membership mutation, workspace intact) and updated the governance-client keyed-list assertion (3 → 4 codes).

## Skipped Issues

None — all in-scope findings were fixed.

---

_Fixed: 2026-11-20T00:00:00Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
