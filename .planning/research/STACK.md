# Technology Stack

**Project:** gr8r / Projects Studio — v2.1 Member & Project Experience (UI/UX features)
**Researched:** 2026-11-09
**Mode:** Ecosystem (stack additions for new features)

## Verdict: ZERO new stack additions

**Every v2.1 feature is buildable with the existing vanilla stack — zero new runtime dependencies, zero dev dependencies, zero build-config changes.** The milestone is a UI refactor/polish batch (modals, table columns, search boxes, pills) that touches only already-proven patterns. The standing zero-runtime-dependency constraint (PROJECT.md:152) holds untouched.

## Recommended Stack (unchanged)

| Technology | Version | Purpose | Why (for v2.1) |
|------------|---------|---------|----------------|
| Vanilla ES modules | ES2022 | All new UI | Every feature is DOM templating + event wiring the app already does everywhere |
| Vite | ^6.4.4 (dev) | Bundling | No config change needed; no new assets |
| Hand-made `t()` i18n | — (1711 keys pinned) | All new labels EN+FR | New modal/column/chip strings slot into `src/locales/*.json`; `scripts/i18n-scan.mjs` prebuild gate enforces parity |
| `data-a` action pinning | — | New buttons/rows | Projects-table rows and modal buttons keep e2e and click-handling stable |
| `node:sqlite` / `pg` adapter | — | Per-team perms persistence | **Only data change**: `p.teamsPerms` (or `p.perms` keyed by `team:<id>`) — a doc-field addition, not a schema migration; server merge/redact of access fields already exists (PROJECT.md:317-321) |

## Reuse Map — existing capabilities consumed by each new feature

### 1. Invite modal: projects multi-select chips (guest = exactly one project)
- **Reuse the chip-based multi-select picker pattern from `src/overlays/modals.js`** — the invite form already renders the same multi-selects for teams with toggle state on `S.ui.pform.teams` (`src/actions/actions.js:1508-1509`, write at `:1537`, `:1589`). Add a parallel `S.ui.pform.projects` with identical toggle/filter/selected-chip markup.
- **`foldForSearch`** (`src/core/utils.js:22`) already filters pickers by accent-insensitive needle in `modals.js:203,228` — the projects picker needs the same needle.
- **`data-in` state binding** is the existing mechanism for the email-draft-survival fix (`modals.js:137` shows the pattern) — role/team change re-renders keep draft state via `S.ui`, not DOM state.
- **Constraint logic (guest = 1 project)**: pure client validation at `actions.js` toggle + submit; server-side already rejects multi-project guests (v2.0 model). No new library.

### 2. Searchable members box in Edit Team
- **`foldForSearch`** (`src/core/utils.js:22`) is the canonical matcher, already used in exactly this shape: settings timezone combobox (`src/pages/settings.js:144-145`) and share-modal member search (`modals.js:203-228`). Copy that combobox pattern — no autocomplete library.
- Roster source is the existing `teams[]` projection (`team_members` rows, PROJECT.md:552).

### 3. Unified project settings modal (General + Access, per-team perms)
- **Modal shell**: existing modal rendering in `modals.js` (comment at `:70-73` documents the pickers → PUT editor pattern).
- **Per-team perms reuse the per-person perms model**: `PERMS = ['Can view','Can comment','Can edit','Full access']` (`src/overlays/modals.js:195`), stored in `p.perms` (`src/actions/actions.js:1790-1791`, `:1826-1827`, `:1848-1849`). Per-team entries follow the identical `<select>` UI keyed by team id — same model, no new role concept (M-09).
- **Team list** comes from live `p.teams` links (`actions.js:1744-1745`, `:1763`).
- **M-12 unification** means deleting the projectModal + share modal code paths — net code reduction, no additions.

### 4. Projects table columns (Lead / Teams / Members count / Status+progress / Target date)
- **Every cell renderer already exists** — the columns are reassembly of helpers proven in `src/pages/overview.js:40` (lead via `av` + `mem`, `pStatus`, `progBar(pr)` with green/red classes, `fmtDate(p.due)`) and `src/pages/home.js:74` (same row shape).
- **`progressOf(pid)`** (`src/core/store.js:401`) — task-based %, M-10.
- **`PSTAT`** (`src/core/constants.js:139`) — status labels/colors pill; already rendered as a pill on the project page (`src/pages/project.js:71`).
- **Teams cell**: project→team names resolve via `projTeams` (`src/views/project-overview.js:6`).
- **Members count**: `p.members.length` — trivial.
- **`data-a="go"` row pinning** already established (`overview.js:40`, `home.js:74`).

### 5. Single Share button on project page
- **M-13** is pure deletion (remove user+ icon and avatar-stack duplicates, keep labeled Share). The kept Share button opens the new unified modal. `avStack` (`src/ui/helpers.js:18`) may survive elsewhere (home.js uses it) — it stays in helpers.js; only its duplicate *instances* on the project page go.

## What NOT to Add (hard)

| Tempting addition | Why NOT |
|-------------------|---------|
| UI framework (React/Preact/Svelte) | Violates zero-dep constraint (PROJECT.md:183); every v2.1 feature is string templating the app already does; framework migration would touch ~19k lines for zero feature gain |
| Component library (shadcn, Radix, Web Components kit) | CSS is hand-rolled and consistent; new chips/pills/comboboxes clone existing in-repo markup, which is *less* work than adapting a kit's styling |
| State management lib | `S.ui.*` singleton on `store.js` is the working state layer; the invite-draft fix is precisely about using it correctly, not replacing it |
| Search/autocomplete library (fuse.js, typeahead) | `foldForSearch` + filter is 3 lines per box and already ships in 4+ surfaces |
| i18n framework | D-12-era decision (PROJECT.md:364-367): every candidate measured is bigger than the layer it replaces |
| Date-picker library | Target-date input exists in the current projectModal; move, don't replace |
| New dev tooling (lint/test/build plugins) | i18n-scan gate, Playwright e2e, `node --test` already cover the new surfaces; e2e coverage for invite/share modals exists since Phase 10 |

## Installation

```bash
# Nothing. No install step for v2.1.
```

Only data-model note: per-team perms ride the existing workspace-document merge/redact path (`p.perms` access fields are restored on read per PROJECT.md:317-321) — extend that restore list to include team entries. **Zero migrations** (standing constraint, PROJECT.md:152) holds: this is a doc field, not a table.

## Risks / Flags

- **Only genuine watch-item:** the `p.perms` merge/redact must not drop team-keyed entries on write by non-admin callers — this is a logic risk inside existing code, not a stack gap. Flag for plan-phase, not for research.
- i18n gate: expect ~20-40 new keys (unified modal, table headers, guest-one-project error) in EN+FR — routine, gate enforces it.

## Sources

- Repo inspection (HIGH confidence — direct file reads): package.json (deps: `pg` only; devDeps unchanged), `src/core/utils.js:22`, `src/core/store.js:401`, `src/core/constants.js:139`, `src/overlays/modals.js:195,203-228,137`, `src/actions/actions.js:1508-1537,1744-1849`, `src/ui/helpers.js:18,56`, `src/pages/overview.js:40`, `src/pages/home.js:74`, `src/pages/project.js:71`, `src/pages/settings.js:144-145`
- PROJECT.md v2.1 decisions M-09..M-13 (owner-validated 2026-11-09)
