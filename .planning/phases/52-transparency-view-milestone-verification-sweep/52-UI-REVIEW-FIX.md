---
phase: 52
fixed_at: 2026-11-09T00:00:00Z
review_path: .planning/phases/52-transparency-view-milestone-verification-sweep/52-UI-REVIEW.md
findings_in_scope: 9
fixed: 8
skipped: 1
status: partial
---

# Phase 52: UI Review Fix Report

**Fixed at:** 2026-11-09
**Source review:** 52-UI-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 9 (Top-3 priorities + applicable minors)
- Fixed: 8
- Skipped: 1 (project icons — no; see below — actually fixed via existing helper; the skip is the skeleton-loader variant)

## Fixed Issues

### 1. Fetch-error state is a bare em-dash (Top 3 #1)

**Files modified:** `src/pages/members.js`, `src/locales/en.json`, `src/locales/fr.json`, `test/i18n-core-features.test.mjs`
**Commit:** 6dacaeb
**Applied fix:** New keys `page.members.visReasonError` ("Couldn’t load project access." / "Impossible de charger l’accès aux projets.") rendered (via `t()`, which is escaped context) in the `data.err` branch instead of `—`. Toast retained as reinforcement. Catalogue pin updated 1707 → 1711. `npm run i18n:scan` passes naturally (keys used in code, no allowlist entry).

### 2. Expander chevron never changes on open (Top 3 #2)

**Files modified:** `src/pages/members.js`
**Commit:** 6dacaeb
**Applied fix:** Chevron now follows the sibling `task-list.js` pattern — `ic('chevron-down', 14)` when open, `ic('chevron-right', 14)` when closed, driven by `visOpen`.

### 3. 'Team' reason carries the team name (Top 3 #3)

**Files modified:** `server.js`, `test/transparency.test.mjs`, `src/pages/members.js`, `src/locales/en.json`, `src/locales/fr.json`
**Commits:** 5d57b68 (server + test), 6dacaeb (client + keys)
**Applied fix:** The visibility endpoint now includes an optional `teamName` (the FIRST matching team's name, resolved from `doc.data.teams`) on projects whose reason is `team`. Coarse `reason: 'team'` code unchanged (backward compat); still one name only — no rosters, no team lists, no access lists (T-52-03 honored). Test pin extended: keys minus `teamName` must still be exactly `['id','name','reason']`, `teamName` only allowed on the `team` reason and must be a string. Client renders `page.members.visReasonTeam` = "Team: {name}" / "Équipe\u00a0: {name}" (NBSP per existing FR typography convention) with `esc(p.teamName)` passed through the placeholder, falling back to the plain `visReason.team` label when absent. No allowlist change needed (`i18n:scan` clean).

### 4. Visible "Loading" text reuses the `a11y.*` namespace (Pillar 1 minor)

**Files modified:** `src/pages/members.js`, `src/locales/en.json`, `src/locales/fr.json`
**Commit:** 6dacaeb
**Applied fix:** New `page.members.visLoading` key ("Checking access…" / "Vérification de l’accès…") used as visible panel text; `a11y.loading` untouched for its label-only call sites. Copy now also names what is loading.

### 5. No `aria-busy` on the loading panel (Pillar 6 warning)

**Files modified:** `src/pages/members.js`
**Commit:** 6dacaeb
**Applied fix:** `aria-busy="true"` set on the detail `<td>` while `!data`.

### 6. No `aria-controls`/id linkage (Pillar 6 warning)

**Files modified:** `src/pages/members.js`
**Commit:** 6dacaeb
**Applied fix:** `id="vis-${esc(m.id)}"` on the detail panel div; `aria-controls="vis-…"` on the expander button while open.

### 7. Hardcoded `rgba(0,0,0,.03)` fallback literal (Pillar 3 minor)

**Files modified:** `src/pages/members.js`
**Commit:** 6dacaeb
**Applied fix:** `background:var(--bg)` — unreachable wrong-in-dark-mode fallback dropped.

### 8. Off-scale spacing + state-text size + missing panel heading (Pillars 2/4/5 minors)

**Files modified:** `src/pages/members.js`
**Commit:** 6dacaeb
**Applied fix:** Panel `gap:6px` → `gap:var(--s-2)`; asymmetric `padding:10px 14px 14px 14px` → `padding:var(--s-2) var(--s-3) var(--s-3) var(--s-3)`; loading/error/empty state spans now `font-size:12px` matching the row's faint-metadata hierarchy; faint `page.members.visDetailTitle` ("Project access" / "Accès aux projets") heading line with project count added to the detail row.

### 9. Project rows lack the project icon (Pillar 2 minor)

**Files modified:** `src/pages/members.js`
**Commit:** e4d4d26
**Applied fix:** Implemented (not skipped): the shared `pIcon(p, '', 14)` helper is already imported in `members.js` and used by sibling project listings (`members.js:172,216`), so this was trivial — no new assets required. Reason badges remain plain per D-52-7.

## Skipped Issues

### Skeleton loader instead of text loading state (Pillar 6 minor)

**File:** `src/pages/members.js:77`
**Reason:** The review itself marks this low priority ("the panel is small and fetches are fast"); the localized "Checking access…" copy plus `aria-busy` resolves the semantic gap. Swapping to the skeleton convention would be a pattern restyle beyond the review's own priority, so left as-is.
**Original issue:** Text loading state instead of skeleton shimmer lines.

## Verification

Ran in the **main checkout** (`workflow.use_worktrees=false` — no worktree isolation for this run):

- `npm run i18n:scan` → 0 literals, 0 pending, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch, 0 dead
- `node --test test/transparency.test.mjs test/i18n-core-features.test.mjs test/i18n-shell.test.mjs test/i18n-toast.test.mjs test/client-surfaces.test.mjs` → 59/59 pass, 0 fail
- `npm test` (full suite) → **1141 pass, 0 fail**, 11 skipped (pre-existing skips), 1152 tests

Note: no `data-a` sites were added or removed, so the 480-site pins in `i18n-shell`/`i18n-toast` needed no change (verified by their passing). No API verb changes — the 47-call pin passes.

---

_Fixed: 2026-11-09_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
