---
phase: 83-governance-workspace-rename-slug-edit
reviewed: 2026-11-20T00:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - server.js
  - src/actions/actions.js
  - src/core/api.js
  - src/locales/de.json
  - src/locales/en.json
  - src/locales/es.json
  - src/locales/fr.json
  - src/locales/nl.json
  - src/pages/governance.js
  - test/governance-client.test.mjs
  - test/governance-rename.test.mjs
  - test/i18n-core-features.test.mjs
  - test/i18n-shell.test.mjs
  - test/i18n-toast.test.mjs
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 83: Code Review Report

**Reviewed:** 2026-11-20
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Phase 83 ships the operator rename route (`POST /api/auth/operator/workspaces/:id/rename`), the on-read dead-mappings route (`GET /api/auth/operator/dead-mappings`), the governance Edit modal with the D-03 typed-confirm fork, the display-only dead-mapping card, and 14 new i18n keys across all 5 catalogues.

The server-side work is solid: guard order on both new routes matches the operator family exactly (sameOrigin → requireUser → throttle → operator gate BEFORE any target lookup — no existence oracle, verified against the archive/delete routes at server.js:7125-7151 and the test suite), slug validation reuses `sanitizeSlug` verbatim (reserved slugs + `SLUG_RE`), the self-collision exclusion is correct (case-only edits cannot collide because `sanitizeSlug` lowercases), and every payload string the client renders passes through `esc()` at first render — the T-83-07 XSS-carry concern for `group_mappings.label` is genuinely covered (governance.js:190-195). All 13 phase keys verified present in de/en/es/fr/nl, JSON valid.

Findings below are quality/robustness gaps, none blocking. The strongest is a stale client state defect after a successful rename.

## Warnings

### WR-01: Successful rename leaves the operator's own client workspace state on the dead slug

**File:** `src/actions/actions.js:4715-4737` (A.govEditSave) with `src/core/api.js:217-243` (state.workspaces/workspace)
**Issue:** On rename success the handler calls `refreshGovernanceWorkspaces()`, which only writes `S.ui.govWs`/`S.ui.govDead`. If the operator is a member of the renamed workspace (common — ADMIN is often the owner of the default workspace), `state.workspaces` in api.js still carries the old `slug`, and `state.workspace.slug` if it is currently loaded. Every subsequent workspace-scoped call (`GET /api/workspaces/{slug}`, invites, members, `PUT` doc) builds its URL from that stale slug and 404s (`workspaceNotFound`), and sidebar/workspace-switcher links point at the dead URL until a full reload. The server-side `PATCH /api/workspaces/:slug` client method has the reconcile pattern (`state.workspaces = state.workspaces.map(...)` at api.js:256-257) — the operator path skips it.
**Fix:** In `A.govEditSave`'s success path (after `closeModal()`), reconcile api.js state before the refresh, e.g. expose a small `api.renameWorkspaceLocal(id, { name, slug })` that maps `state.workspaces` by id and, when `state.workspace?.id === id`, updates `state.workspace.slug`/`name` (and resets any in-flight doc revision assumptions). Alternatively force `api.listWorkspaces()` (and `loadWorkspace` when the loaded workspace is the renamed one) before rendering the success toast.

### WR-02: Unescaped `{ query }` interpolation into HTML in the governance empty-search states

**File:** `src/pages/governance.js:101` and `:161`
**Issue:** `t()` never escapes HTML (confirmed at src/core/i18n.js:212 — "It never escapes HTML: the caller interpolates user data through escHtml at the call"), but both filtered-empty states interpolate the raw user-typed filter: `t('page.governance.noMatchesBody', { query: q })` (line 101) and `t('page.governance.noMatchesOpBody', { query: q })` (line 161), where `q` is `(S.ui.govQ || '').trim().toLowerCase()` / `govOpQ` verbatim. Typing `<img src=x onerror=...>` into the search box injects markup the moment the filter matches nothing. Scope is self-XSS only (the query is session state, never persisted or shared), but it directly violates the phase's own esc()-at-first-render doctrine (T-79-10/T-83-07) and is a stored-XSS footgun if `S.ui.govQ` is ever persisted with prefs.
**Fix:**
```js
empty('search', t('page.governance.noMatchesTitle'), t('page.governance.noMatchesBody', { query: esc(q) }), '', 'sm', 3);
// same at :161 — t('page.governance.noMatchesOpBody', { query: esc(q) })
```

### WR-03: Trail LIKE pattern leaves the `_` wildcard unescaped — over-broad match

**File:** `server.js:7452`
**Issue:** `where action like 'group_%:group:%'` — in SQL LIKE `_` matches ANY single character, so the predicate also matches hypothetical actions shaped `groupX:group:…`, `groups:group:…`, `groupp:group:…`. Today every Phase 82 row begins with the literal `group_` prefix so nothing is missed and nothing else matches, but the predicate is not the documented "encoded guard trail format" filter — it is one character wider than the format it claims to pin, and a future audit verb starting `group` + any char + `:group:` would silently leak into the operator's dead-mapping card.
**Fix:**
```js
const trail = await db.all("select action, workspace_id, created_at from audit_log where action like 'group\\_%:group:%' escape '\\' order by created_at desc limit 100");
```

## Info

### IN-01: Rename route does not touch `updated_at`

**File:** `server.js:7183`
**Issue:** `update workspaces set name = ?, slug = ? where id = ?` leaves `updated_at` stale, so the workspace's "last activity" signal (wherever surfaced) does not reflect a governance rename. Note this matches the sibling archive route (server.js:7139-7140), so it is a family-consistent choice, not a regression — flagging for awareness only.
**Fix (if desired):** add `updated_at = ?` to the statement with `now()`; do it for both rename and archive in the same commit to keep the family uniform.

### IN-02: Hard-coded catalogue size assertion (2030) grows a maintenance tax on every key

**File:** `test/i18n-core-features.test.mjs:218`
**Issue:** `assert.equal(keys.length, 2030, ...)` pins the EN catalogue count with a 2,000+ word rationale comment. This is the established project pattern (the comment documents every bump), but each phase now must edit a magic number plus prose, and a merge that lands keys without bumping the count fails confusingly. Purely maintainability; the 5-catalogue parity coverage itself is good.
**Fix (optional):** derive the expected count from a manifest constant in one place (e.g. export `EXPECTED_KEYS` from a shared test fixture) so the bump is a one-line diff; keep the prose changelog in that constant's comment.

---

_Reviewed: 2026-11-20_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
