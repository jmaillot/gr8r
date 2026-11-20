---
phase: 79-governance-surface
reviewed: 2026-11-20T00:00:00Z
depth: standard
files_reviewed: 13
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
  - src/pages/settings.js
  - test/governance-client.test.mjs
  - test/governance.test.mjs
  - test/i18n-core-features.test.mjs
findings:
  critical: 0
  warning: 0
  info: 1
  total: 1
status: issues_found
---

# Phase 79: Code Review Report (re-review)

**Reviewed:** 2026-11-20
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found (1 info; zero blockers)

## Summary

Re-review of the two fix passes since `dfc2fb4` (commits a0e61849..f52704ea). All seven prior findings (CR-01, CR-02, WR-01, WR-02, IN-01, IN-02, IN-03) were verified as fixed; none of the fixes introduced a regression. Only one minor residual edge case remains (info tier).

Verification performed:

- **CR-01 (members read route)** — `server.js:7018-7042` adds `GET /api/auth/operator/workspaces/:id/members` with the correct guard order (sameOrigin → requireUser → operator gate → target lookup, D-09), `id` captured from the path regex (no client-supplied id mass-assignment), 404 before any member listing (no existence oracle to non-operators — the operator gate runs first). Targets exclude the delete target (`w.id is not ?`) and archived workspaces (`w.archived = 0`); the `is not ?` form is correctly transpiled by the pg adapter (`db-adapter.mjs:104` rewrites it to `is not distinct from ?`). Exercised by `test/governance.test.mjs` (targets/members payload shape, 404, non-operator exact 403).
- **CR-02 (orphan modal title XSS)** — `src/pages/governance.js:187` now interpolates `esc(o?.ws?.name || '')` *before* `t()`. Verified against `tFor`/`interpolate` (`src/core/i18n.js:192-214`): escaping first then placeholder substitution is safe (interpolate only re-embeds the already-escaped string, never unescapes), and the modal `h2` renders the result as raw HTML, so escaping at the call site is the correct point. No double-display defect (entities decode correctly).
- **WR-01 (parameter-free memberAlreadyMember)** — the `{name}` placeholder is gone from all 5 catalogues; server still emits the bare code and the client's keyed toast (`govRefusalToast`, actions.js:4648) renders it without vars. French copy uses curly apostrophes (commit f52704ea verified byte-level — no straight `'` in the two new fr values).
- **WR-02 (archived reassign refusal)** — added in BOTH paths: delete-path dispositions loop (`server.js:6969-6971`, refusal before the dup check and before any planned write) and standalone reassign (`server.js:7076-7078`). Both return `409 targetArchived` pre-transaction, so no mutation occurs; covered by the new test asserting membership persistence on both paths. `err.targetArchived` present in all 5 catalogues and in the client's keyed refusal list (actions.js:4648), matching test (e).
- **IN-01 (dead code)** — `A.govReleaseAsk`, `api.operatorWsReassign`, `api.operatorWsRelease` deleted; grep confirms zero remaining source references (only historical test comments). The 4 orphaned locale keys removed from all 5 catalogues (grep: 0 leftover hits). The i18n call-site counter updated to 56 and the catalogue counter to 2008 — both assert green.
- **IN-02 (a11y labels)** — `src/pages/governance.js:108` now uses the dedicated `page.governance.searchWs` key for both placeholder and aria-label, present in all 5 catalogues; the member-search keys remain correctly scoped to `members.js:70`.
- **IN-03 (stale comment)** — `src/pages/settings.js:830-831` now points at the governance page / 79-03 relocation. Accurate.
- **Tests** — `node --test test/governance.test.mjs test/governance-client.test.mjs test/i18n-core-features.test.mjs`: 56 pass, 0 fail.

Consistency spot-checks on the new code: `confirmModal` escapes dialog titles itself (`modals.js:522`), so the raw `ws.name` interpolation in the archive/unarchive confirm titles is safe (different render path than the raw-HTML custom host); `empty()` escapes title/text, so the search `noMatchesBody` query interpolation is safe. No new hardcoded secrets, no debug artifacts, no `as any`/loose equality in the changed hunks.

## Info

### IN-04: Orphan modal allows selecting "reassign" when zero destinations exist

**File:** `src/actions/actions.js:4750-4757` and `src/pages/governance.js:169`
**Issue:** `A.govOrphanPick` accepts a `reassign` disposition with `wsId: ''` when `targets` is empty (e.g. every other workspace is archived or this is the only workspace). The role/destination detail renders an empty `<select>` and the submit proceeds, surfacing only the generic 404 `notFound` toast from `err.notFound` rather than a keyed refusal or a disabled reassign option. The server correctly refuses (404, no mutation), so this is a UX/robustness gap, not a correctness or security defect. Note this predates the fix commits under review (the pick handler is unchanged since the phase base) — recorded here for the backlog, not as a fix-pass regression.
**Fix:** In `govOrphanBody`, disable the `reassign` segment button when `targets.length === 0` (with a hint pointing to release), or emit a dedicated keyed refusal from `govRefusalToast` for `notFound` on the delete path.

---

_Reviewed: 2026-11-20_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
