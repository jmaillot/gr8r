---
phase: 52-transparency-view-milestone-verification-sweep
plan: 02
subsystem: client-transparency
tags: [transparency, members-page, i18n, expander]
requires: [GET /api/workspaces/:slug/members/:memberId/visibility (52-01), isMemberAdmin() (src/core/store.js), esc()/t()/api helpers, i18n dead-key gate (scripts/i18n-scan.mjs)]
provides: [api.memberVisibility(userId) client method, A.memberVisibilityToggle action, admin-only member-row expander UI, page.members.visReason.* + a11y.memberVisibility + page.members.visReasonEmpty (EN+FR)]
affects: [test/i18n-shell.test.mjs + test/i18n-toast.test.mjs (data-a pin 480), test/i18n-core-features.test.mjs (catalogue 1707, verbs 47), scripts/i18n-scan.mjs (visReason prefix allowlist)]
tech-stack:
  added: []
  patterns: [refetch-per-open, client-gate-ux-only, server-reason-code-mapped-to-i18n]
key-files:
  created: []
  modified: [src/pages/members.js, src/actions/actions.js, src/core/api.js, src/locales/en.json, src/locales/fr.json, scripts/i18n-scan.mjs, test/i18n-core-features.test.mjs, test/i18n-shell.test.mjs, test/i18n-toast.test.mjs]
decisions:
  - "Team reason renders as a plain 'Team'/'Équipe' label — the 52-01 endpoint contract (T-52-03) returns only coarse codes with no team name, so the plan's 'Team: {name}' key would have been an instant dead key against the i18n scan"
  - "The visReason.* keys are kept alive via a DEAD_KEY_ALLOWLIST prefix entry (page.members.visReason.) naming the members.js interpolation call site — the established extend-never-replace convention for reason-code lookups"
  - "The expansion panel adopts the fetch result only if S.ui.memberVisibility still points at the same member — a close/re-target while in flight never renders a stale answer (D-52-3)"
metrics:
  duration: ~25 min
  completed: 2026-11-08
status: complete
actuals:
  tokens: 21000
  tasks: 2
  commits: 2
commits: 2
plan_head_before: abe1b0c
plan_head_after: 529d42a
---

# Phase 52 Plan 02: Members-page transparency expander (client half of TRN-01) Summary

Admin/owner-only expander on each Members row that refetches the 52-01 visibility endpoint on EVERY open and renders each accessible project with a plain EN/FR localized first-match reason label.

## What Was Built

**Task 1 — i18n keys (commit dc037b1)**
- `src/locales/en.json` / `fr.json`: `page.members.visReason.everyone/lead/member/team`, `page.members.visReasonEmpty`, `a11y.memberVisibility` — mirrored 1:1 in French with proper typography (`Tout le monde` / `Responsable` / `Membre` / `Équipe`).
- `scripts/i18n-scan.mjs`: one prefix allowlist entry (`page.members.visReason.`) so the reason-code interpolation is not reported dead.
- `test/i18n-core-features.test.mjs`: catalogue size pin 1701 → 1707.

**Task 2 — expander UI (commit 529d42a)**
- `src/core/api.js`: `api.memberVisibility(userId)` — GET on the 52-01 route, slug from the loaded workspace, no caching.
- `src/actions/actions.js`: `A.memberVisibilityToggle` — toggles `S.ui.memberVisibility` by member id, resets `S.ui.memberVisibilityData` to null on open (loading state), fetches, guards against a close/re-target mid-flight, and only then renders the answer.
- `src/pages/members.js`: chevron expander on every member row gated on `isAdmin && m.userId` (client UX mirror only — the server's `admin` gate is the control, D-52-4), `aria-expanded` toggled; the detail row renders `esc(p.name)` + a badge carrying `t('page.members.visReason.<code>')`. The list comes ONLY from the server response — `visibleProjects()`/`D().projects` are untouched as sources (success criterion 1 anti-pattern). Empty state shows `visReasonEmpty`; unknown reason codes are escaped as-is.
- Pins updated: data-a sites 479 → 480 (i18n-shell/i18n-toast), api verbs 46 → 47 (i18n-core-features).

## Deviations from Plan

1. **[Rule 3 - blocking] No generic `api.get()` exists** — the plan's fetch instruction referenced a helper that isn't there; followed the established workspace-scoped-method convention instead (`api.memberVisibility`, same shape as `revokeMemberSessions` minus the D-R1 `/api/w/` prefix, since the 52-01 route lives under `/api/workspaces/`).
2. **[Rule 1 - contract conflict] 'Team: {name}' label dropped** — 52-01's endpoint (pinned by `test/transparency.test.mjs`, T-52-03) returns only coarse reason codes with no team name. Adding a `{name}` placeholder key would be a dead key the i18n scan rejects, and deriving the name client-side is forbidden (D-52-4 anti-pattern). The team reason renders as the plain localized label 'Team'/'Équipe' (D-52-7 plain-label spirit preserved).
3. **Catalogue pin updates beyond the named file** — Pitfall 3 anticipated `test/catalogue.test.mjs`, but the actual pins live in `test/i18n-core-features.test.mjs` (catalogue size, api verbs) and `test/i18n-shell.test.mjs` / `test/i18n-toast.test.mjs` (data-a sites); all three updated, plus the i18n-scan allowlist entry (Pitfall 4's extend-never-replace convention).

## Verification

- `npm run i18n:scan` → 0 dead, 0 stale, EN↔FR parity.
- `node --check src/pages/members.js` (and actions.js, api.js) clean.
- `npm test` → **fail 0** (11 pre-existing skips).

## Known Stubs

None.

## Threat Model Compliance

- **T-52-04**: every server-provided project name passes `esc()` before interpolation into row HTML; unknown reason codes pass `esc(String(...))`.
- **T-52-05**: the expander renders only for `isAdmin` rows (UX layer); the 52-01 `requireWorkspace(..., 'admin')` gate is the actual control.
- **T-52-SC**: zero package installs.

## Self-Check: PASSED

- Commits dc037b1, 529d42a exist on main; SUMMARY present.
- i18n:scan 0 dead; npm test fail 0; node --check members.js clean.
